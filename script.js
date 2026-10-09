// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE =
  "https://script.google.com/macros/s/AKfycbzTKzVnMAMNFsZqHtatSTQfW2fTEPUqD-77X3F9JYVk-ex8Jz5NAzzypEPrildP9QTU/exec";

function apiUrl(params) {
  return `${API_BASE}?${params}&_=${Date.now()}`;
}

// ─── Table visual helpers (visual-only) ──────────────────────────────────────
const EXPENSE_CATEGORY_TONES = {
  "food and groceries": 0,
  transportation: 1,
  personal: 2,
  shopping: 3,
  "entertainment and leisure": 4,
  "dining out": 5,
  "savings and investments": 6,
  "bill repayment": 7,
  miscellaneous: 8,
  received: 9,
  loan: 10,
  sport: 11,
  "sweetie saving": 12,
  "sweetie borrow": 13,
};

function getExpenseCategoryTone(category) {
  const key = String(category || "").trim().toLowerCase();
  return EXPENSE_CATEGORY_TONES[key] ?? 8;
}

function getCardTone(card) {
  const value = String(card || "—").trim().toLowerCase();
  const known = {
    "axis-flipkart": 0,
    "axis-myzone": 1,
    "icici-amazon pay": 2,
    "icici-coral": 3,
    "hdfc": 4,
    "sbi": 5,
    "kotak": 6,
  };
  if (Object.prototype.hasOwnProperty.call(known, value)) return known[value];
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return 7 + (hash % 3);
}

function getPersonTone(name) {
  const value = String(name || "—").trim().toLowerCase();
  const known = {
    grv: 0,
    gaurav: 0,
    me: 0,
    rohit: 1,
    anukaran: 2,
    abhishek: 3,
  };
  if (Object.prototype.hasOwnProperty.call(known, value)) return known[value];
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return 4 + (hash % 6);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let expenses = [];
let salaries = {};
let cardTxns = []; // credit card transactions
let cardConfig = []; // [{card, cutoff, limit, dueDay, dueMonthOffset}]
let currentChart = null;
let activeTab = "expenses"; // "expenses" | "cards"
let expSort = { col: "date", dir: "desc" };
let cardSort = { col: "txnDate", dir: "desc" };
let editingExpId = null;
let editingCardId = null;
let expSearch = "";
let cardSearch = "";
let cardStatusFilter = "ALL"; // ALL, PAID, UNPAID
let cardMonthFilter = "3"; // "1" = current month only, "3" = last 3 months
let cardCardFilter = "ALL"; // ALL or specific card name

// GRV CC personal-view state (uses the same cardTxns / Cards sheet)
let grvCardSort = { col: "txnDate", dir: "desc" };
let grvCardStatusFilter = "ALL";
let grvCardMonthFilter = "1";
let grvOverviewMonthKey = "";
let grvCardFilter = "ALL";
let grvSelectedIds = new Set();
let grvStatementMatches = {};
try {
  grvStatementMatches = JSON.parse(
    localStorage.getItem("grv_statement_matches") || "{}",
  );
} catch (_) {
  grvStatementMatches = {};
}
let grvExpenseHistory = [];
let grvExpenseHistoryLoaded = false;
let grvExpenseHistoryLoading = false;

// Sweetie tracker state
let sweetieTxns = []; // raw entries from sheet [{id,type,amount,date,description}]
let sweetieSort = { col: "date", dir: "desc" };
let editingSweetieId = null;
let sweetieSearch = "";
let sweetieMonthFilter = "ALL";

// ─── MONTH KEYS ──────────────────────────────────────────────────────────────
function monthKey() {
  const m = parseInt(document.getElementById("monthSelect").value);
  const y = document.getElementById("yearSelect").value;
  return `${MONTHS[m]}-${String(y).slice(-2)}`;
}

// "April 2026" format used for billing month in Cards sheet
function billingMonthKey() {
  const m = parseInt(document.getElementById("monthSelect").value);
  const y = parseInt(document.getElementById("yearSelect").value);
  return `${FULL_MONTHS[m]} ${y}`;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg, err = false, duration = 3000, action = null) {
  const el = document.getElementById("toastMsg");
  if (!el) return;
  el.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = msg;
  el.appendChild(text);
  if (action && typeof action.fn === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label || "Undo";
    btn.style.cssText =
      "margin-left:10px;border:1px solid currentColor;background:transparent;color:inherit;border-radius:12px;padding:3px 9px;font:700 .72rem inherit;cursor:pointer";
    btn.onclick = () => {
      action.fn();
      el.classList.remove("show");
    };
    el.appendChild(btn);
  }
  el.style.background = err ? "#f87171" : "#34d399";
  el.style.color = err ? "#fff" : "#0b0b10";
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), duration);
}

function markLastSynced(id) {
  const el = document.getElementById(id);
  if (el)
    el.textContent = `Last synced ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}
function finishInitialSkeleton() {
  const stats = document.querySelector(".stats.is-loading");
  if (stats) {
    stats.classList.remove("is-loading");
    stats.setAttribute("aria-busy", "false");
  }
}

// ─── LOCAL STORAGE ───────────────────────────────────────────────────────────
function saveLocal() {
  try {
    localStorage.setItem("exp_v3", JSON.stringify(expenses));
    localStorage.setItem("sal_v3", JSON.stringify(salaries));
    localStorage.setItem("cards_v1", JSON.stringify(cardTxns));
    localStorage.setItem("cardcfg", JSON.stringify(cardConfig));
    localStorage.setItem("sweetie_v1", JSON.stringify(sweetieTxns));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
}
function loadLocal() {
  try {
    const e = localStorage.getItem("exp_v3");
    const s = localStorage.getItem("sal_v3");
    const c = localStorage.getItem("cards_v1");
    const g = localStorage.getItem("cardcfg");
    const sw = localStorage.getItem("sweetie_v1");
    if (e) expenses = JSON.parse(e);
    if (s) salaries = JSON.parse(s);
    if (c) cardTxns = JSON.parse(c);
    if (g)
      cardConfig = JSON.parse(g)
        .map((c) => ({
          card: String(c.card || "").trim(),
          cutoff: parseInt(c.cutoff) || 0,
          limit: parseFloat(c.limit) || 0,
          dueDay: parseInt(c.dueDay) || 0,
          dueMonthOffset: parseInt(c.dueMonthOffset) || 0,
        }))
        .filter((c) => c.card);
    if (sw) sweetieTxns = JSON.parse(sw);
  } catch (e) {
    expenses = [];
    salaries = {};
    cardTxns = [];
    cardConfig = [];
    sweetieTxns = [];
  }
}

// ─── STATUS BANNER ───────────────────────────────────────────────────────────
function setStatus(msg, type = "ok") {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;
  if (!msg) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "block";
  banner.style.background =
    type === "error" ? "#f87171" : type === "warn" ? "#fbbf24" : "#34d399";
  banner.style.color = type === "error" ? "#fff" : "#0b0b10";
  banner.textContent = msg;
}

// ─── LOADING OVERLAY ─────────────────────────────────────────────────────────
function showLoading(msg = "Syncing…") {
  document.getElementById("loadingOverlay").style.display = "flex";
  document.getElementById("loadingMsg").textContent = msg;
}
function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}

// ─── DATE HELPER (local timezone, avoids UTC off-by-one in India) ────────────
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// ─── DATE PICKER (expenses — locked to selected month) ───────────────────────
// Format billing month — handles "April 2026", Date strings, or raw Date objects
function formatBillingMonth(val) {
  if (!val || val === "—") return "—";
  const s = String(val);
  // Already correct format e.g. "April 2026"
  if (/^[A-Za-z]+ \d{4}$/.test(s.trim())) return s.trim();
  // ISO or Date string — parse and format
  const d = new Date(s);
  if (!isNaN(d)) return FULL_MONTHS[d.getMonth()] + " " + d.getFullYear();
  return s;
}

// Format "2026-04-07" → "7 Apr" for UI display only
// Sheet data is never touched — this is display-only
function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return dateStr;
  const d = parseInt(parts[2]);
  const m = MONTHS[parseInt(parts[1]) - 1];
  return d + " " + m;
}

function lockDatePicker() {
  const m = parseInt(document.getElementById("monthSelect").value);
  const y = parseInt(document.getElementById("yearSelect").value);
  const inp = document.getElementById("expenseDate");
  const min = localDateStr(new Date(y, m, 1));
  const max = localDateStr(new Date(y, m + 1, 0));
  inp.min = min;
  inp.max = max;
  const today = localDateStr(new Date());
  inp.value = today >= min && today <= max ? today : min;
}

// ─── SHEET WRITE (fire-and-forget, no-cors) ──────────────────────────────────
function sheetWrite(url) {
  fetch(url, { mode: "no-cors" }).catch((err) => {
    console.warn("Sheet write error (data likely saved):", err);
  });
}

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  const elExpenses = document.getElementById("tabExpenses");
  const elCards = document.getElementById("tabCards");
  const elSweetie = document.getElementById("tabSweetie");
  const elGrvCC = document.getElementById("tabGrvCC");
  const secExpenses = document.getElementById("expenseSection");
  const secCards = document.getElementById("cardSection");
  const secSweetie = document.getElementById("sweetieSection");
  const secGrvCC = document.getElementById("grvCCSection");

  if (!elSweetie || !secSweetie) {
    console.warn(
      "[switchTab] Sweetie tab elements not found in DOM — tabSweetie:",
      !!elSweetie,
      "sweetieSection:",
      !!secSweetie,
    );
  }

  if (elExpenses) elExpenses.classList.toggle("tab-active", tab === "expenses");
  if (elCards) elCards.classList.toggle("tab-active", tab === "cards");
  if (elSweetie) elSweetie.classList.toggle("tab-active", tab === "sweetie");
  if (elGrvCC) elGrvCC.classList.toggle("tab-active", tab === "grvcc");
  if (secExpenses) secExpenses.style.display = tab === "expenses" ? "" : "none";
  if (secCards) secCards.style.display = tab === "cards" ? "" : "none";
  if (secSweetie) secSweetie.style.display = tab === "sweetie" ? "" : "none";
  if (secGrvCC) secGrvCC.style.display = tab === "grvcc" ? "" : "none";

  if (tab === "expenses") {
    render();
  } else if (tab === "cards") {
    renderCards();
    populateCardDropdown();
    populateCCCardFilter();
    syncCardsFromSheet(false); // sync latest 3 months whenever cards tab is opened
  } else if (tab === "sweetie") {
    renderSweetie();
    syncSweetieFromSheet(false); // sync full consolidated list whenever sweetie tab is opened
  } else if (tab === "grvcc") {
    renderGrvCC();
    populateGrvCardDropdown();
    syncGrvCCFromSheet(false);
  }
}

// ─── POPULATE CARD DROPDOWN ──────────────────────────────────────────────────
function populateCardDropdown() {
  const sel = document.getElementById("cardSelect");
  const current = sel.value;
  sel.innerHTML = "";
  cardConfig.forEach((cfg) => {
    const o = document.createElement("option");
    o.value = cfg.card;
    o.text = cfg.card;
    sel.appendChild(o);
  });
  if (current) sel.value = current;
}

// ─── SET CARD STATUS FILTER ──────────────────────────────────────────────────
// ─── DATE FILTER HELPERS ─────────────────────────────────────────────────────
function clearExpDateFilter() {
  const f = document.getElementById("expDateFrom");
  const t = document.getElementById("expDateTo");
  if (f) f.value = "";
  if (t) t.value = "";
  render();
}

function clearAllExpFilters() {
  const s = document.getElementById("expSearchBox");
  const f = document.getElementById("expDateFrom");
  const t = document.getElementById("expDateTo");
  if (s) s.value = "";
  if (f) f.value = "";
  if (t) t.value = "";
  render();
}

function clearCardDateFilter() {
  const f = document.getElementById("cardDateFrom");
  const t = document.getElementById("cardDateTo");
  if (f) f.value = "";
  if (t) t.value = "";
  renderCards();
}

function clearAllCardFilters() {
  const s = document.getElementById("cardSearchBox");
  const f = document.getElementById("cardDateFrom");
  const t = document.getElementById("cardDateTo");
  const c = document.getElementById("ccCardFilter");
  if (s) s.value = "";
  if (f) f.value = "";
  if (t) t.value = "";
  if (c) c.value = "ALL";
  setCardStatusFilter("ALL");
  setCardMonthFilter("3");
  cardCardFilter = "ALL";
  renderCards();
}

function clearSweetieDateFilter() {
  const f = document.getElementById("sweetieDateFrom");
  const t = document.getElementById("sweetieDateTo");
  if (f) f.value = "";
  if (t) t.value = "";
  renderSweetie();
}

function clearAllSweetieFilters() {
  const s = document.getElementById("sweetieSearchBox");
  const f = document.getElementById("sweetieDateFrom");
  const t = document.getElementById("sweetieDateTo");
  const m = document.getElementById("sweetieMonthFilter");
  if (s) s.value = "";
  if (f) f.value = "";
  if (t) t.value = "";
  if (m) m.value = "ALL";
  renderSweetie();
}

// ─── MARK ALL PAID ────────────────────────────────────────────────────────────
function markAllPaid() {
  // Get ONLY the transactions currently visible in the table
  // by applying all active filters (same logic as renderCards)
  const selMonth = parseInt(document.getElementById("monthSelect").value);
  const selYear = parseInt(document.getElementById("yearSelect").value);
  const monthCount = cardMonthFilter === "1" ? 1 : 3;
  const last3 = [];
  for (let i = 0; i < monthCount; i++) {
    let m = selMonth - i,
      y = selYear;
    if (m < 0) {
      m += 12;
      y -= 1;
    }
    last3.push({ m, y });
  }

  const cardDateFrom =
    (document.getElementById("cardDateFrom") || {}).value || "";
  const cardDateTo = (document.getElementById("cardDateTo") || {}).value || "";
  const selCard =
    (document.getElementById("ccCardFilter") || {}).value || "ALL";
  const search = ((document.getElementById("cardSearchBox") || {}).value || "")
    .trim()
    .toLowerCase();

  // Apply ALL active filters — identical to renderCards logic
  const visibleUnpaid = cardTxns.filter((t) => {
    if (!t.txnDate) return false;
    const d = new Date(t.txnDate);

    // Month range
    const matchMonth = last3.some(
      ({ m, y }) => d.getMonth() === m && d.getFullYear() === y,
    );
    // Date range
    const matchFrom = !cardDateFrom || t.txnDate >= cardDateFrom;
    const matchTo = !cardDateTo || t.txnDate <= cardDateTo;
    // Card filter
    const matchCard = selCard === "ALL" || t.card === selCard;
    // Search
    const matchSearch =
      !search ||
      (t.description || "").toLowerCase().includes(search) ||
      (t.card || "").toLowerCase().includes(search) ||
      (t.usedBy || "").toLowerCase().includes(search) ||
      (t.remarks || "").toLowerCase().includes(search) ||
      String(t.amount).includes(search);
    // Must be UNPAID
    const isUnpaid = t.status === "UNPAID";

    return (
      matchMonth && matchFrom && matchTo && matchCard && matchSearch && isUnpaid
    );
  });

  if (visibleUnpaid.length === 0) {
    toast("No UNPAID transactions in current view", true);
    return;
  }

  // Confirm — show exactly what will be marked
  const cardLabel = selCard !== "ALL" ? ` for ${selCard}` : "";
  if (
    !confirm(`Mark ${visibleUnpaid.length} visible UNPAID transaction(s)${cardLabel} as PAID?

Only transactions matching your current filters will be marked.

This cannot be undone easily.`)
  )
    return;

  // Mark only the visible UNPAID ones
  visibleUnpaid.forEach((t) => {
    t.status = "PAID";
    sheetWrite(apiUrl(`action=updateCardStatus&id=${t.id}&status=PAID`));
  });

  saveLocal();
  renderCards();
  toast(`✓ Marked ${visibleUnpaid.length} transactions as PAID`);
}

function setCardStatusFilter(status) {
  cardStatusFilter = status;
  const btns = {
    ALL: "ccFilterAll",
    PAID: "ccFilterPaid",
    UNPAID: "ccFilterUnpaid",
  };
  Object.entries(btns).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = key === status;
    btn.style.background = active ? "var(--accent)" : "var(--s2)";
    btn.style.color = active ? "black" : "var(--muted)";
    btn.style.border = active ? "none" : "1px solid var(--border)";
  });
}

// ─── SET CARD MONTH FILTER ───────────────────────────────────────────────────
function setCardMonthFilter(months) {
  cardMonthFilter = months;
  const btn3 = document.getElementById("ccFilter3M");
  const btn1 = document.getElementById("ccFilter1M");
  if (!btn3 || !btn1) return;
  const is3 = months === "3";
  btn3.style.background = is3 ? "var(--accent)" : "var(--s2)";
  btn3.style.color = is3 ? "black" : "var(--muted)";
  btn3.style.border = is3 ? "none" : "1px solid var(--border)";
  btn1.style.background = !is3 ? "var(--accent)" : "var(--s2)";
  btn1.style.color = !is3 ? "black" : "var(--muted)";
  btn1.style.border = !is3 ? "none" : "1px solid var(--border)";
}

// ─── POPULATE CC CARD FILTER DROPDOWN ────────────────────────────────────────
function populateCCCardFilter() {
  const sel = document.getElementById("ccCardFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="ALL">All Cards</option>';
  cardConfig.forEach((cfg) => {
    const o = document.createElement("option");
    o.value = cfg.card;
    o.text = cfg.card;
    sel.appendChild(o);
  });
  // restore selection if still valid
  if (current && [...sel.options].some((o) => o.value === current))
    sel.value = current;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EXPENSES SECTION ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function render() {
  const key = monthKey();
  const rows = expenses.filter((e) => e.month === key);

  let totalExp = 0,
    sweetSave = 0,
    sweetBorrow = 0,
    totalReceived = 0;
  rows.forEach(({ category: cat, amount: amt }) => {
    if (cat === "Received") {
      totalReceived += amt; // loan returned — adds to remaining
    } else if (cat === "Sweetie Saving") {
      sweetSave += amt;
      totalExp += amt;
    } else if (cat === "Sweetie Borrow") {
      sweetBorrow += amt;
    } else {
      totalExp += amt;
    }
  });

  const salary = salaries[key] || 0;
  const remaining = salary + totalReceived - totalExp;
  const sweetBal = sweetSave - sweetBorrow;

  document.getElementById("statTotalExpenses").textContent = money(totalExp);
  document.getElementById("statSalary").textContent = salary
    ? money(salary)
    : "—";
  document.getElementById("statRemaining").textContent = money(remaining);
  document.getElementById("statSweetie").textContent = money(sweetBal);

  const salDisplay = document.getElementById("salaryDisplay");
  const salGroup = document.getElementById("salaryEditGroup");
  const editBtn = document.getElementById("editSalaryBtn");
  if (salary) {
    salDisplay.textContent = money(salary);
    salGroup.style.display = "none";
    editBtn.style.display = "inline-flex";
  } else {
    salDisplay.textContent = "Not set";
    salGroup.style.display = "flex";
    editBtn.style.display = "none";
  }

  // Apply search + date range filters
  const expSearchEl = document.getElementById("expSearchBox");
  expSearch = expSearchEl ? expSearchEl.value.trim().toLowerCase() : "";
  const expDateFrom =
    (document.getElementById("expDateFrom") || {}).value || "";
  const expDateTo = (document.getElementById("expDateTo") || {}).value || "";

  const filteredRows = rows.filter((e) => {
    const matchSearch =
      !expSearch ||
      (e.description || "").toLowerCase().includes(expSearch) ||
      (e.category || "").toLowerCase().includes(expSearch) ||
      String(e.amount).includes(expSearch) ||
      (e.date || "").includes(expSearch);
    const matchFrom = !expDateFrom || e.date >= expDateFrom;
    const matchTo = !expDateTo || e.date <= expDateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const tbody = document.getElementById("tableBody");
  const emptyEl = document.getElementById("emptyMessage");
  tbody.innerHTML = "";

  // Update sort header arrows
  ["date", "category", "description", "amount"].forEach((col) => {
    const th = document.getElementById("expTh_" + col);
    if (!th) return;
    th.querySelector(".sort-arrow").textContent =
      expSort.col === col ? (expSort.dir === "asc" ? " ↑" : " ↓") : " ↕";
  });

  if (filteredRows.length === 0) {
    emptyEl.style.display = "block";
    emptyEl.textContent = expSearch
      ? `No results for "${expSearch}"`
      : "✨ No transactions this month";
    document.getElementById("rowCount").textContent = "0 entries";
    return;
  }
  emptyEl.style.display = "none";
  document.getElementById("rowCount").textContent = expSearch
    ? `${filteredRows.length} of ${rows.length} entries`
    : `${rows.length} entries`;

  // Attach column resizers after render

  const sorted = [...filteredRows].sort((a, b) => {
    let av = a[expSort.col],
      bv = b[expSort.col];
    if (expSort.col === "amount") {
      av = +av;
      bv = +bv;
    } else {
      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
    }
    if (av < bv) return expSort.dir === "asc" ? -1 : 1;
    if (av > bv) return expSort.dir === "asc" ? 1 : -1;
    // Tie-break: newest entry (highest ID = added last) comes first
    return String(b.id) > String(a.id) ? 1 : -1;
  });

  sorted.forEach((exp) => {
    const tr = tbody.insertRow();
    if (editingExpId === exp.id) tr.style.background = "rgba(167,139,250,0.08)";
    tr.insertCell(0).textContent = formatDisplayDate(exp.date);
    tr.insertCell(1).innerHTML =
      `<span class="table-data-pill table-category-pill category-tone-${getExpenseCategoryTone(exp.category)}">${esc(exp.category)}</span>`;
    tr.insertCell(2).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(exp.description || "—")}</span>`;
    const expAmtCell = tr.insertCell(3);
    const expIncoming = String(exp.category || "").trim().toLowerCase() === "received" || String(exp.category || "").trim().toLowerCase() === "sweetie saving";
    expAmtCell.innerHTML = `<span class="table-data-pill table-amount-pill ${expIncoming ? "table-positive-pill" : "table-negative-pill"}">${money(exp.amount)}</span>`;
    expAmtCell.className = expIncoming ? "txn-amount txn-amount-in" : "txn-amount txn-amount-out";
    const actCell = tr.insertCell(4);
    actCell.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "edit-btn";
    editBtn.title = "Edit";
    editBtn.style.marginRight = "4px";
    editBtn.onclick = () => startEditExpense(exp.id);
    const cloneExpBtn = document.createElement("button");
    cloneExpBtn.textContent = "⧉";
    cloneExpBtn.className = "clone-btn";
    cloneExpBtn.title = "Clone";
    cloneExpBtn.style.marginRight = "4px";
    cloneExpBtn.onclick = () => cloneExpense(exp.id);
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.className = "delete-btn";
    delBtn.title = "Delete";
    delBtn.onclick = () => deleteEntry(exp.id);
    actCell.appendChild(editBtn);
    actCell.appendChild(cloneExpBtn);
    actCell.appendChild(delBtn);
  });
}

function sortExpenses(col) {
  if (expSort.col === col) expSort.dir = expSort.dir === "asc" ? "desc" : "asc";
  else {
    expSort.col = col;
    expSort.dir = col === "amount" ? "desc" : "asc";
  }
  render();
}

// Fill form with existing entry data for editing
function startEditExpense(id) {
  const exp = expenses.find((e) => e.id === id);
  if (!exp) return;
  editingExpId = id;
  document.getElementById("expenseDate").value = exp.date;
  document.getElementById("expenseCategory").value = exp.category;
  document.getElementById("expenseDesc").value = exp.description || "";
  document.getElementById("expenseAmount").value = exp.amount;
  document.getElementById("addBtn").textContent = "💾 Update Entry";
  document.getElementById("addBtn").style.background = "#fbbf24";
  document.getElementById("cancelExpEditBtn").style.display = "block";
  render(); // highlight the row being edited
  document
    .getElementById("expenseAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditExpense() {
  editingExpId = null;
  document.getElementById("expenseDesc").value = "";
  document.getElementById("expenseAmount").value = "";
  document.getElementById("addBtn").textContent = "➕ Add Entry";
  document.getElementById("addBtn").style.background = "";
  document.getElementById("addBtn").style.color = "";
  document.getElementById("cancelExpEditBtn").textContent = "✕ Cancel Edit";
  document.getElementById("cancelExpEditBtn").style.display = "none";
  render();
}

function addEntry() {
  const date = document.getElementById("expenseDate").value;
  const cat = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const rawAmt = document.getElementById("expenseAmount").value;

  if (!date || !rawAmt) return toast("Date & amount required", true);
  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount <= 0) return toast("Enter a valid amount", true);

  if (editingExpId) {
    // ── UPDATE MODE: delete old, save new with same id ──
    const oldEntry = expenses.find((e) => e.id === editingExpId);
    const updEntry = {
      id: editingExpId,
      date,
      month: monthKey(),
      category: cat,
      description: desc,
      amount,
    };
    expenses = expenses.filter((e) => e.id !== editingExpId);
    expenses.push(updEntry);
    saveLocal();
    // Delete old from sheet then re-add updated
    sheetWrite(apiUrl(`action=delete&id=${editingExpId}`));
    sheetWrite(
      apiUrl(
        `action=add&id=${updEntry.id}&date=${updEntry.date}&month=${enc(updEntry.month)}&category=${enc(updEntry.category)}&description=${enc(updEntry.description)}&amount=${updEntry.amount}`,
      ),
    );
    cancelEditExpense();
    toast("Entry updated ✓");
    return;
  }

  const entry = {
    id: Date.now().toString(),
    date,
    month: monthKey(),
    category: cat,
    description: desc,
    amount,
  };
  expenses.push(entry);
  saveLocal();
  render();
  toast("Entry added ✓");
  document.getElementById("expenseDesc").value = "";
  document.getElementById("expenseAmount").value = "";
  document.getElementById("addBtn").textContent = "➕ Add Entry";
  document.getElementById("addBtn").style.background = "";
  document.getElementById("addBtn").style.color = "";
  document.getElementById("cancelExpEditBtn").style.display = "none";
  document.getElementById("cancelExpEditBtn").textContent = "✕ Cancel Edit";

  sheetWrite(
    apiUrl(
      `action=add&id=${entry.id}&date=${entry.date}&month=${enc(entry.month)}&category=${enc(entry.category)}&description=${enc(entry.description)}&amount=${entry.amount}`,
    ),
  );
}

function deleteEntry(id) {
  if (!confirm("Delete this entry? This cannot be undone.")) return;
  expenses = expenses.filter((e) => e.id !== id);
  saveLocal();
  render();
  toast("Deleted ✓");
  sheetWrite(apiUrl(`action=delete&id=${id}`));
}

function saveSalaryEntry() {
  const raw = document.getElementById("salaryInput").value;
  if (!raw) return toast("Enter salary amount", true);
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) return toast("Invalid amount", true);

  const key = monthKey();
  salaries[key] = amount;
  saveLocal();
  render();
  document.getElementById("salaryInput").value = "";
  toast("Salary saved ✓");
  sheetWrite(apiUrl(`action=setSalary&month=${enc(key)}&salary=${amount}`));
}

async function syncFromSheet(isManual = false, isInitial = false) {
  const key = monthKey();
  const btn = document.getElementById("syncBtn");

  if (isManual) {
    btn.textContent = "⏳ Syncing…";
    btn.disabled = true;
  }
  // No loading overlay — local data already shown instantly

  try {
    const [expRes, salRes] = await Promise.all([
      fetch(apiUrl(`action=getByMonth&month=${enc(key)}`)).then((r) =>
        r.json(),
      ),
      fetch(apiUrl(`action=getSalary`)).then((r) => r.json()),
    ]);

    if (!Array.isArray(expRes)) {
      setStatus(
        `⚠️ Sync failed — sheet returned: ${JSON.stringify(expRes).slice(0, 100)}`,
        "error",
      );
      if (isManual) toast("Sync failed — see red banner above", true);
      return;
    }

    const fromSheet = expRes
      .map((row) => ({
        id: String(row[0] || ""),
        date: String(row[1] || ""),
        month: String(row[2] || ""),
        category: String(row[3] || ""),
        description: String(row[4] || ""),
        amount: parseFloat(row[5]) || 0,
      }))
      .filter((e) => e.id && e.date);

    const localCount = expenses.filter((e) => e.month === key).length;
    if (fromSheet.length === 0 && localCount > 0) {
      setStatus(
        `⚠️ Sheet has no data for ${key} but UI has ${localCount} entries. Fix deployment settings, then sync again.`,
        "error",
      );
      if (isManual)
        toast(`⚠️ Sheet empty — kept ${localCount} local entries`, true, 5000);
      return;
    }

    expenses = [...expenses.filter((e) => e.month !== key), ...fromSheet];

    if (Array.isArray(salRes) && salRes.length > 1) {
      salRes.slice(1).forEach((row) => {
        if (row[0]) salaries[String(row[0]).trim()] = parseFloat(row[1]) || 0;
      });
    }

    saveLocal();
    render();
    setStatus("");
    markLastSynced("lastSyncedExpenses");
    finishInitialSkeleton();
    if (isManual) toast(`Synced ✓ — ${fromSheet.length} entries for ${key}`);
  } catch (err) {
    console.error("Sync error:", err);
    if (isManual) toast("⚠️ Sync failed — showing local data", true);
    if (isInitial)
      toast("⚠️ Could not reach sheet — showing cached data", true);
    finishInitialSkeleton();
    render();
  } finally {
    if (isInitial) finishInitialSkeleton();
    if (isManual) {
      btn.textContent = "🔄 Sync from Sheet";
      btn.disabled = false;
    }
  }
}

function showSummary() {
  const key = monthKey();
  const rows = expenses.filter((e) => e.month === key);
  const map = new Map();
  let totalExp = 0,
    sweetSave = 0,
    sweetBorrow = 0;

  rows.forEach(({ category: cat, amount: amt }) => {
    if (cat === "Received") {
      totalExp -= amt; // loan returned — reduces net expense, increases remaining
      map.set(cat, (map.get(cat) || 0) + amt);
      return;
    } else if (cat === "Sweetie Saving") {
      sweetSave += amt;
      totalExp += amt;
    } else if (cat === "Sweetie Borrow") {
      sweetBorrow += amt;
      return;
    } else {
      totalExp += amt;
    }
    map.set(cat, (map.get(cat) || 0) + amt);
  });

  const labels = [],
    data = [];
  map.forEach((v, k) => {
    if (v > 0) {
      labels.push(k);
      data.push(v);
    }
  });
  if (labels.length === 0) {
    toast("No expense data for this month", true);
    return;
  }

  const ctx = document.getElementById("summaryChart").getContext("2d");
  if (currentChart) currentChart.destroy();
  currentChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            "#22d3ee",
            "#34d399",
            "#f472b6",
            "#fbbf24",
            "#fb923c",
            "#60a5fa",
            "#c084fc",
            "#f87171",
            "#2dd4bf",
            "#818cf8",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((val / total) * 100).toFixed(1);
              return ` ${money(val)}  (${pct}%)`;
            },
          },
        },
        datalabels: false,
      },
    },
    plugins: [
      {
        id: "sliceLabels",
        afterDatasetDraw(chart) {
          const { ctx: c, data } = chart;
          const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
          chart.getDatasetMeta(0).data.forEach((arc, i) => {
            const val = data.datasets[0].data[i];
            const pct = ((val / total) * 100).toFixed(1);
            if (pct < 4) return; // skip tiny slices
            const angle = (arc.startAngle + arc.endAngle) / 2;
            const r = (arc.innerRadius + arc.outerRadius) / 2 + 10;
            const x = arc.x + Math.cos(angle) * r;
            const y = arc.y + Math.sin(angle) * r;
            c.save();
            c.fillStyle = "#ffffff";
            c.font = "bold 11px DM Sans, sans-serif";
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.shadowColor = "rgba(0,0,0,0.6)";
            c.shadowBlur = 3;
            c.fillText(`₹${val % 1 === 0 ? val : val.toFixed(0)}`, x, y - 6);
            c.fillText(`${pct}%`, x, y + 7);
            c.restore();
          });
        },
      },
    ],
  });

  const sal = salaries[key] || 0;
  document.getElementById("modalLegend").innerHTML =
    `Total: <b>${money(totalExp)}</b> &nbsp;|&nbsp; Remaining: <b>${money(sal - totalExp)}</b> &nbsp;|&nbsp; Sweetie: <b>${money(sweetSave - sweetBorrow)}</b>`;
  document.getElementById("summaryModal").style.display = "flex";
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CREDIT CARDS SECTION ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Calculate billing month from transaction date and card cutoff
function calcBillingMonth(dateStr, cutoff) {
  if (!dateStr) return billingMonthKey();

  // Parse YYYY-MM-DD manually. Do not use new Date("YYYY-MM-DD") here
  // because that string is UTC-based and can shift the local calendar day.
  const m = String(dateStr)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return billingMonthKey();

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31)
    return billingMonthKey();

  const co = parseInt(cutoff, 10);
  if (!Number.isFinite(co) || co <= 0 || day <= co) {
    return FULL_MONTHS[monthIndex] + " " + year;
  }

  const nextMonthIndex = (monthIndex + 1) % 12;
  const nextYear = year + (monthIndex === 11 ? 1 : 0);
  return FULL_MONTHS[nextMonthIndex] + " " + nextYear;
}

// Render credit card stats and table for current billing month
function renderCards() {
  const bMonth = billingMonthKey();
  const selMonth = parseInt(document.getElementById("monthSelect").value);
  const selYear = parseInt(document.getElementById("yearSelect").value);

  // Build month list based on filter (1 = current month only, 3 = last 3 months)
  const monthCount = cardMonthFilter === "1" ? 1 : 3;
  const last3 = [];
  for (let i = 0; i < monthCount; i++) {
    let m = selMonth - i;
    let y = selYear;
    if (m < 0) {
      m += 12;
      y -= 1;
    }
    last3.push({ m, y });
  }

  // Update range label
  const oldest = last3[last3.length - 1];
  const newest = last3[0];
  const rangeLabel =
    monthCount === 1
      ? `${MONTHS[newest.m]} ${newest.y}`
      : `${MONTHS[oldest.m]} - ${MONTHS[newest.m]} ${newest.y}`;
  const rangeEl = document.getElementById("ccRangeLabel");
  if (rangeEl) rangeEl.textContent = rangeLabel;

  // Filter by month range
  const rows = cardTxns.filter((t) => {
    if (!t.txnDate) return false;
    const d = new Date(t.txnDate);
    return last3.some(
      ({ m, y }) => d.getMonth() === m && d.getFullYear() === y,
    );
  });

  // Stats
  const totalSpend = rows.reduce((s, t) => s + t.amount, 0);
  const unpaid = rows
    .filter((t) => t.status === "UNPAID")
    .reduce((s, t) => s + t.amount, 0);
  const paid = rows
    .filter((t) => t.status === "PAID")
    .reduce((s, t) => s + t.amount, 0);

  document.getElementById("ccStatTotal").textContent = money(totalSpend);
  document.getElementById("ccStatUnpaid").textContent = money(unpaid);
  document.getElementById("ccStatPaid").textContent = money(paid);

  // Per-card summary
  const cardSummaryEl = document.getElementById("cardSummaryGrid");
  cardSummaryEl.innerHTML = "";
  const cardMap = new Map();
  rows.forEach((t) => {
    if (!cardMap.has(t.card)) cardMap.set(t.card, { spent: 0, unpaid: 0 });
    cardMap.get(t.card).spent += t.amount;
    if (t.status === "UNPAID") cardMap.get(t.card).unpaid += t.amount;
  });

  cardMap.forEach((val, cardName) => {
    const cfg = cardConfig.find((c) => c.card === cardName);
    const lim = cfg ? cfg.limit : 0;
    const maxUse = lim ? Math.round(lim * 0.3) : 0;
    const rem = lim ? lim - val.spent : 0;
    const pct = lim ? Math.min(100, Math.round((val.spent / maxUse) * 100)) : 0;
    const over = lim && val.spent > maxUse;

    cardSummaryEl.innerHTML += `
      <div class="card-summary-item">
        <div class="cs-name">${cardName}</div>
        <div class="cs-row"><span>Spent</span><span class="c-red">₹${val.spent.toFixed(2)}</span></div>
        ${lim ? `<div class="cs-row"><span>Limit</span><span>₹${lim.toLocaleString()}</span></div>` : ""}
        ${lim ? `<div class="cs-row"><span>Remaining</span><span class="c-green">₹${rem.toLocaleString()}</span></div>` : ""}
        ${lim ? `<div class="cs-bar-wrap"><div class="cs-bar ${over ? "cs-bar-over" : ""}" style="width:${pct}%"></div></div>` : ""}
        <div class="cs-row"><span>Unpaid</span><span class="c-pink">₹${val.unpaid.toFixed(2)}</span></div>
      </div>`;
  });

  if (cardMap.size === 0)
    cardSummaryEl.innerHTML = `<div style="color:var(--muted);font-size:0.8rem;padding:8px 0">No transactions this billing month</div>`;

  // Table
  const tbody = document.getElementById("cardTableBody");
  const emptyEl = document.getElementById("cardEmptyMessage");
  tbody.innerHTML = "";

  // Apply search, status, date range and card filters
  const cardSearchEl = document.getElementById("cardSearchBox");
  cardSearch = cardSearchEl ? cardSearchEl.value.trim().toLowerCase() : "";
  const cardDateFrom =
    (document.getElementById("cardDateFrom") || {}).value || "";
  const cardDateTo = (document.getElementById("cardDateTo") || {}).value || "";
  const selCard = document.getElementById("ccCardFilter");
  cardCardFilter = selCard ? selCard.value : "ALL";

  const filteredCardRows = rows.filter((t) => {
    // Search filter
    const matchSearch =
      !cardSearch ||
      (t.description || "").toLowerCase().includes(cardSearch) ||
      (t.card || "").toLowerCase().includes(cardSearch) ||
      (t.usedBy || "").toLowerCase().includes(cardSearch) ||
      (t.remarks || "").toLowerCase().includes(cardSearch) ||
      String(t.amount).includes(cardSearch) ||
      (t.status || "").toLowerCase().includes(cardSearch);

    // Status filter
    const matchStatus =
      cardStatusFilter === "ALL" || t.status === cardStatusFilter;

    // Card filter
    const matchCard = cardCardFilter === "ALL" || t.card === cardCardFilter;

    // Date range filter
    const txnDate = t.txnDate || "";
    const matchFrom = !cardDateFrom || txnDate >= cardDateFrom;
    const matchTo = !cardDateTo || txnDate <= cardDateTo;

    return matchSearch && matchStatus && matchCard && matchFrom && matchTo;
  });

  // Update sort header arrows
  ["txnDate", "card", "usedBy", "amount", "status"].forEach((col) => {
    const th = document.getElementById("ccTh_" + col);
    if (!th) return;
    th.querySelector(".sort-arrow").textContent =
      cardSort.col === col ? (cardSort.dir === "asc" ? " ↑" : " ↓") : " ↕";
  });

  if (filteredCardRows.length === 0) {
    emptyEl.style.display = "block";
    emptyEl.textContent = cardSearch
      ? `No results for "${cardSearch}"`
      : "✨ No card transactions this billing month";
    document.getElementById("ccRowCount").textContent = "0 entries";
    return;
  }
  emptyEl.style.display = "none";
  document.getElementById("ccRowCount").textContent = cardSearch
    ? `${filteredCardRows.length} of ${rows.length} entries`
    : `${rows.length} entries`;

  const sorted = [...filteredCardRows].sort((a, b) => {
    let av = a[cardSort.col],
      bv = b[cardSort.col];
    if (cardSort.col === "amount") {
      av = +av;
      bv = +bv;
    } else {
      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
    }
    if (av < bv) return cardSort.dir === "asc" ? -1 : 1;
    if (av > bv) return cardSort.dir === "asc" ? 1 : -1;
    // Tie-break: newest entry (highest ID = added last) comes first
    return String(b.id) > String(a.id) ? 1 : -1;
  });

  sorted.forEach((t) => {
    const tr = tbody.insertRow();
    const statusBadge = `<span class="status-badge ${t.status === "PAID" ? "badge-paid" : "badge-unpaid"}">${t.status === "PAID" ? "✓ " : "! "}${t.status}</span>`;

    tr.insertCell(0).textContent = formatDisplayDate(t.txnDate);
    tr.insertCell(1).innerHTML =
      `<span class="table-data-pill table-card-pill">${esc(t.card)}</span>`;
    tr.insertCell(2).innerHTML =
      `<span class="table-data-pill table-person-pill person-tone-${getPersonTone(t.usedBy)}">${esc(t.usedBy || "—")}</span>`;
    tr.insertCell(3).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(t.description || "—")}</span>`;
    tr.insertCell(4).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(t.remarks || "—")}</span>`;
    tr.insertCell(5).innerHTML =
      `<span class="table-data-pill table-amount-pill table-negative-pill">${money(t.amount)}</span>`;

    const statusCell = tr.insertCell(6);
    const statusBtn = document.createElement("button");
    statusBtn.type = "button";
    statusBtn.className = `status-toggle ${t.status === "PAID" ? "status-toggle-paid" : "status-toggle-unpaid"}`;
    statusBtn.innerHTML = statusBadge;
    statusBtn.title = "Toggle PAID / UNPAID";
    statusBtn.setAttribute(
      "aria-label",
      `Mark transaction ${t.status === "PAID" ? "unpaid" : "paid"}`,
    );
    statusBtn.onclick = () => toggleCardStatus(t.id);
    statusCell.appendChild(statusBtn);

    // Billing month cell — normalize in case sheet returned a Date object string
    const bmCell = tr.insertCell(7);
    bmCell.textContent = formatBillingMonth(t.billingMonth);
    bmCell.style.fontSize = "0.8rem";
    bmCell.style.color = "var(--accent)";
    bmCell.style.fontWeight = "500";

    const actCell = tr.insertCell(8);
    actCell.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "edit-btn";
    editBtn.title = "Edit";
    editBtn.style.marginRight = "4px";
    editBtn.onclick = () => startEditCard(t.id);
    const cloneCardBtn = document.createElement("button");
    cloneCardBtn.textContent = "⧉";
    cloneCardBtn.className = "clone-btn";
    cloneCardBtn.title = "Clone";
    cloneCardBtn.style.marginRight = "4px";
    cloneCardBtn.onclick = () => cloneCard(t.id);
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.className = "delete-btn";
    delBtn.title = "Delete";
    delBtn.onclick = () => deleteCardEntry(t.id);
    actCell.appendChild(editBtn);
    actCell.appendChild(cloneCardBtn);
    actCell.appendChild(delBtn);
  });
}

function sortCards(col) {
  if (cardSort.col === col)
    cardSort.dir = cardSort.dir === "asc" ? "desc" : "asc";
  else {
    cardSort.col = col;
    cardSort.dir = col === "amount" ? "desc" : "asc";
  }
  renderCards();
}

// Add a credit card transaction
function startEditCard(id) {
  const t = cardTxns.find((t) => t.id === id);
  if (!t) return;
  editingCardId = id;
  document.getElementById("cardSelect").value = t.card;
  document.getElementById("cardUsedBy").value = t.usedBy || "";
  document.getElementById("cardDesc").value = t.description || "";
  document.getElementById("cardTxnDate").value = t.txnDate;
  document.getElementById("cardRemarks").value = t.remarks || "";
  document.getElementById("cardAmount").value = t.amount;
  document.getElementById("cardStatus").value = t.status;
  document.getElementById("addCardBtn").textContent = "💾 Update Card Entry";
  document.getElementById("addCardBtn").style.background = "#fbbf24";
  document.getElementById("cancelCardEditBtn").style.display = "block";
  renderCards();
  document
    .getElementById("cardAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditCard() {
  editingCardId = null;
  document.getElementById("cardUsedBy").value = "";
  document.getElementById("cardDesc").value = "";
  document.getElementById("cardRemarks").value = "";
  document.getElementById("cardAmount").value = "";
  document.getElementById("addCardBtn").textContent = "➕ Add Card Entry";
  document.getElementById("addCardBtn").style.background = "";
  document.getElementById("addCardBtn").style.color = "";
  document.getElementById("cancelCardEditBtn").textContent = "✕ Cancel Edit";
  document.getElementById("cancelCardEditBtn").style.display = "none";
  renderCards();
}

function addCardEntry() {
  const card = document.getElementById("cardSelect").value;
  const usedBy = document.getElementById("cardUsedBy").value.trim();
  const desc = document.getElementById("cardDesc").value.trim();
  const txnDate = document.getElementById("cardTxnDate").value;
  const remarks = document.getElementById("cardRemarks").value.trim();
  const rawAmt = document.getElementById("cardAmount").value;
  const status = document.getElementById("cardStatus").value;

  if (!card || !txnDate || !rawAmt)
    return toast("Card, date & amount required", true);
  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount <= 0) return toast("Enter a valid amount", true);

  // Duplicate protection: same card + amount + date + description + Used By.
  // During edit, ignore the transaction currently being edited.
  const normalizedDesc = desc.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedUsedBy = usedBy.toLowerCase().replace(/\s+/g, " ").trim();
  const duplicate = cardTxns.find(
    (t) =>
      t.id !== editingCardId &&
      t.card === card &&
      String(t.txnDate || "") === String(txnDate || "") &&
      Number(t.amount) === Number(amount) &&
      String(t.description || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim() === normalizedDesc &&
      String(t.usedBy || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim() === normalizedUsedBy,
  );

  if (duplicate) {
    const ok = confirm(
      `⚠️ Possible duplicate transaction found\n\n` +
        `Date: ${txnDate}\n` +
        `Amount: ${money(amount)}\n` +
        `Description: ${desc || "—"}\n` +
        `Used By: ${usedBy || "—"}\n\n` +
        `An identical transaction already exists. Add it anyway?`,
    );
    if (!ok) return;
  }

  const cfg = cardConfig.find((c) => c.card === card);
  const cutoff = cfg ? cfg.cutoff : 0;
  const billingMonth = calcBillingMonth(txnDate, cutoff);

  if (editingCardId) {
    // ── UPDATE MODE ──
    const updEntry = {
      id: editingCardId,
      card,
      usedBy,
      description: desc,
      txnDate,
      remarks,
      amount,
      status,
      billingMonth,
    };
    cardTxns = cardTxns.map((t) => (t.id === editingCardId ? updEntry : t));
    saveLocal();
    sheetWrite(
      apiUrl(
        `action=updateCard&id=${enc(updEntry.id)}&card=${enc(updEntry.card)}&usedBy=${enc(updEntry.usedBy)}&description=${enc(updEntry.description)}&txnDate=${enc(updEntry.txnDate)}&remarks=${enc(updEntry.remarks)}&amount=${updEntry.amount}&status=${enc(updEntry.status)}&billingMonth=${enc(updEntry.billingMonth)}`,
      ),
    );
    cancelEditCard();
    toast("Card entry updated ✓");
    return;
  }

  const entry = {
    id: Date.now().toString(),
    card,
    usedBy,
    description: desc,
    txnDate,
    remarks,
    amount,
    status,
    billingMonth,
  };

  cardTxns.push(entry);
  saveLocal();
  renderCards();
  toast("Card entry added ✓");

  document.getElementById("cardUsedBy").value = "";
  document.getElementById("cardDesc").value = "";
  document.getElementById("cardRemarks").value = "";
  document.getElementById("addCardBtn").textContent = "➕ Add Card Entry";
  document.getElementById("addCardBtn").style.background = "";
  document.getElementById("addCardBtn").style.color = "";
  document.getElementById("cancelCardEditBtn").style.display = "none";
  document.getElementById("cancelCardEditBtn").textContent = "✕ Cancel Edit";
  document.getElementById("cardAmount").value = "";

  sheetWrite(
    apiUrl(
      `action=addCard&id=${entry.id}&card=${enc(entry.card)}&usedBy=${enc(entry.usedBy)}&description=${enc(entry.description)}&txnDate=${enc(entry.txnDate)}&remarks=${enc(entry.remarks)}&amount=${entry.amount}&status=${enc(entry.status)}&billingMonth=${enc(entry.billingMonth)}`,
    ),
  );
}

// Delete a card transaction
function deleteCardEntry(id) {
  if (!confirm("Delete this card entry? This cannot be undone.")) return;
  cardTxns = cardTxns.filter((t) => t.id !== id);
  saveLocal();
  renderCards();
  toast("Deleted ✓");
  sheetWrite(apiUrl(`action=deleteCard&id=${id}`));
}

// Toggle PAID ↔ UNPAID
function toggleCardStatus(id) {
  const t = cardTxns.find((t) => t.id === id);
  if (!t) return;
  t.status = t.status === "PAID" ? "UNPAID" : "PAID";
  saveLocal();
  renderCards();
  toast(`Marked ${t.status} ✓`);
  sheetWrite(
    apiUrl(`action=updateCardStatus&id=${id}&status=${enc(t.status)}`),
  );
}

// Sync cards from sheet for current billing month
async function syncCardsFromSheet(isManual = false) {
  const bMonth = billingMonthKey();
  const selMonth = parseInt(document.getElementById("monthSelect").value);
  const selYear = parseInt(document.getElementById("yearSelect").value);

  // Last 3 months
  const last3Prefixes = [];
  const last3Months = [];
  for (let i = 0; i < 3; i++) {
    let m = selMonth - i,
      y = selYear;
    if (m < 0) {
      m += 12;
      y -= 1;
    }
    last3Prefixes.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    last3Months.push({ m, y });
  }
  const txnMonthPrefix = last3Prefixes.join(",");
  const btn = document.getElementById("cardSyncBtn");
  if (isManual) {
    btn.textContent = "⏳ Syncing…";
    btn.disabled = true;
  }

  try {
    const [cardRes, cfgRes] = await Promise.all([
      fetch(
        apiUrl(`action=getCardsByTxnMonth&txnMonth=${enc(txnMonthPrefix)}`),
      ).then((r) => r.json()),
      fetch(apiUrl(`action=getCardConfig`)).then((r) => r.json()),
    ]);

    if (Array.isArray(cardRes)) {
      const fromSheet = cardRes
        .map((row) => ({
          id: String(row[0] || ""),
          card: String(row[1] || ""),
          usedBy: String(row[2] || ""),
          description: String(row[3] || ""),
          txnDate: String(row[4] || ""),
          remarks: String(row[5] || ""),
          amount: parseFloat(row[6]) || 0,
          status: String(row[7] || "UNPAID"),
          billingMonth: formatBillingMonth(row[8] || ""),
        }))
        .filter((t) => t.id && t.txnDate);

      const localCount = cardTxns.filter((t) => {
        if (!t.txnDate) return false;
        const d = new Date(t.txnDate);
        return last3Months.some(
          ({ m, y }) => d.getMonth() === m && d.getFullYear() === y,
        );
      }).length;
      if (fromSheet.length === 0 && localCount > 0) {
        if (isManual)
          toast(
            `⚠️ Sheet empty — kept ${localCount} local entries`,
            true,
            4000,
          );
      } else {
        // Replace only this transaction month's entries
        cardTxns = [
          ...cardTxns.filter((t) => {
            if (!t.txnDate) return true;
            const d = new Date(t.txnDate);
            return !last3Months.some(
              ({ m, y }) => d.getMonth() === m && d.getFullYear() === y,
            );
          }),
          ...fromSheet,
        ];
      }
    }

    // Always refresh card config
    if (Array.isArray(cfgRes) && cfgRes.length > 1) {
      cardConfig = cfgRes
        .slice(1)
        .filter((row) => row[0])
        .map((row) => ({
          card: String(row[0]).trim(),
          cutoff: parseInt(row[1]) || 0,
          limit: parseFloat(row[2]) || 0,
          dueDay: parseInt(row[3]) || 0,
          dueMonthOffset: parseInt(row[4]) || 0,
        }));
      populateCardDropdown();
    }

    saveLocal();
    renderCards();
    markLastSynced("lastSyncedCards");
    if (isManual) toast(`Cards synced ✓ for ${bMonth}`);
  } catch (err) {
    console.error("Card sync error:", err);
    if (isManual) toast("⚠️ Card sync failed — showing local data", true);
    renderCards();
  } finally {
    if (isManual) {
      btn.textContent = "🔄 Sync Cards";
      btn.disabled = false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CC MASTER LIST ──────────────────────────────────────────────────────────
// Password verified server-side via Apps Script PropertiesService.
// The actual password and card data never stored in browser localStorage.
// ═══════════════════════════════════════════════════════════════════════════════

async function openCCMaster() {
  const modal = document.getElementById("ccMasterModal");
  const container = document.getElementById("ccMasterBody");
  if (!modal || !container) return;

  modal.style.display = "flex";
  container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:30px;">Loading…</p>';

  try {
    const res = await fetch(apiUrl("action=getCCMaster"));
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(data.error || "Unable to load CC Master");
    renderCCMaster(data);
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;color:var(--danger);padding:30px;">⚠️ ${esc(err.message || "Could not load CC Master")}</div>`;
  }
}

// Format exp date — handles both "Apr-28" strings and ISO dates from Sheets
function formatExpDate(val) {
  if (!val) return "—";
  const s = String(val);
  // Already in correct format e.g. "Apr-28"
  if (/^[A-Za-z]{3}-\d{2}$/.test(s.trim())) return s.trim();
  // ISO date string e.g. "2026-11-28T18:30:00.000Z"
  if (s.includes("T") || s.includes("-")) {
    const d = new Date(s);
    if (!isNaN(d)) {
      return (
        MONTHS[d.getUTCMonth()] + "-" + String(d.getUTCFullYear()).slice(-2)
      );
    }
  }
  return s;
}

function renderCCMaster(rows) {
  const container = document.getElementById("ccMasterBody");
  if (!rows || rows.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--muted);padding:30px;">No entries in CC sheet</p>`;
    return;
  }
  const cards = rows
    .map((row) => {
      const bank = row[0] || "";
      const name = row[1] || "—";
      const numRaw = (row[2] || "").toString().replace(/\s+/g, "");
      const numCvv = row[3] || "";
      const expDate = formatExpDate(row[4]);
      const numFmt = numRaw.match(/.{1,4}/g)
        ? numRaw.match(/.{1,4}/g).join("  ")
        : numRaw;
      const cvv = numCvv.includes("/") ? numCvv.split("/")[1].trim() : "";
      return `
      <div class="cc-card-item">
        <div class="cc-card-top">
          <div>
            ${bank ? `<span class="cc-bank-badge">${bank}</span>` : ""}
            <div class="cc-card-name" style="margin-top:6px">${name}</div>
          </div>
          <div class="cc-exp">${expDate}</div>
        </div>
        <div class="cc-num">${numFmt}</div>
        <div class="cc-card-bottom">
          <div>
            <div class="cc-cvv-label">CVV</div>
            <div class="cc-cvv">${cvv || "—"}</div>
          </div>
          <div style="text-align:right">
            <div class="cc-cvv-label">Full Number</div>
            <div class="cc-full-num">${numRaw}</div>
          </div>
        </div>
      </div>`;
    })
    .join("");
  container.innerHTML = `<div class="cc-card-grid">${cards}</div>`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function enc(v) {
  return encodeURIComponent(String(v));
}

// ─── CLONE ENTRIES ────────────────────────────────────────────────────────────
function cloneExpense(id) {
  const exp = expenses.find((e) => e.id === id);
  if (!exp) return;
  // Fill form just like edit — but with today's date and no editingExpId set
  // so saving creates a NEW entry, not overwriting the original
  const m = parseInt(document.getElementById("monthSelect").value);
  const y = parseInt(document.getElementById("yearSelect").value);
  const min = localDateStr(new Date(y, m, 1));
  const max = localDateStr(new Date(y, m + 1, 0));
  const today = localDateStr(new Date());
  document.getElementById("expenseDate").value =
    today >= min && today <= max ? today : exp.date;
  document.getElementById("expenseCategory").value = exp.category;
  document.getElementById("expenseDesc").value = exp.description || "";
  document.getElementById("expenseAmount").value = exp.amount;
  // Mark as clone mode — shows yellow banner but saves as new
  editingExpId = null;
  document.getElementById("addBtn").textContent = "⧉ Save Clone";
  document.getElementById("addBtn").style.background = "#34d399";
  document.getElementById("addBtn").style.color = "#0b0b10";
  document.getElementById("cancelExpEditBtn").style.display = "block";
  document.getElementById("cancelExpEditBtn").textContent = "✕ Cancel Clone";
  toast("Edit details then click Save Clone", false, 3000);
  document
    .getElementById("expenseAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

function cloneCard(id) {
  const t = cardTxns.find((t) => t.id === id);
  if (!t) return;
  // Fill form just like edit — new entry when saved
  document.getElementById("cardSelect").value = t.card;
  document.getElementById("cardUsedBy").value = t.usedBy || "";
  document.getElementById("cardDesc").value = t.description || "";
  document.getElementById("cardTxnDate").value = localDateStr(new Date());
  document.getElementById("cardRemarks").value = t.remarks || "";
  document.getElementById("cardAmount").value = t.amount;
  document.getElementById("cardStatus").value = "UNPAID";
  editingCardId = null;
  document.getElementById("addCardBtn").textContent = "⧉ Save Clone";
  document.getElementById("addCardBtn").style.background = "#34d399";
  document.getElementById("addCardBtn").style.color = "#0b0b10";
  document.getElementById("cancelCardEditBtn").style.display = "block";
  document.getElementById("cancelCardEditBtn").textContent = "✕ Cancel Clone";
  toast("Edit details then click Save Clone", false, 3000);
  document
    .getElementById("cardAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

// ─── INIT SELECTORS ──────────────────────────────────────────────────────────
function initSelectors() {
  const ms = document.getElementById("monthSelect");
  const ys = document.getElementById("yearSelect");
  MONTHS.forEach((m, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.text = m;
    ms.appendChild(o);
  });
  for (let y = 2024; y <= 2035; y++) {
    const o = document.createElement("option");
    o.value = y;
    o.text = y;
    ys.appendChild(o);
  }
  const now = new Date();
  ms.value = now.getMonth();
  ys.value = now.getFullYear();
}

// ─── THEME TOGGLE ────────────────────────────────────────────────────────────
// ─── VERSION INFO ─────────────────────────────────────────────────────────────
let versionLoaded = false;

function toggleVersionInfo() {
  const popup = document.getElementById("versionPopup");
  if (!popup) return;
  const isOpen = popup.style.display !== "none";
  popup.style.display = isOpen ? "none" : "block";
  if (!isOpen && !versionLoaded) fetchVersionInfo();
}

async function fetchVersionInfo() {
  try {
    const res = await fetch(`version.json?cb=${Date.now()}`);
    if (!res.ok) throw new Error("not found");
    const v = await res.json();
    const commitEl = document.getElementById("versionCommit");
    const hashEl = document.getElementById("versionHash");
    const timeEl = document.getElementById("versionTime");
    if (commitEl) commitEl.textContent = v.commit || "—";
    if (hashEl) hashEl.textContent = v.hash || "—";
    if (timeEl) timeEl.textContent = v.time || "—";
    versionLoaded = true;
  } catch {
    const commitEl = document.getElementById("versionCommit");
    if (commitEl)
      commitEl.textContent = "version.json not found — push to generate";
  }
}

// Close popup when clicking outside
document.addEventListener("click", (e) => {
  const popup = document.getElementById("versionPopup");
  const btn = document.getElementById("versionBtn");
  if (popup && btn && !popup.contains(e.target) && e.target !== btn) {
    popup.style.display = "none";
  }
});

// Close popup immediately on scroll or touch-start, so it never lingers
// on screen while the user is scrolling the page.
window.addEventListener(
  "scroll",
  () => {
    const popup = document.getElementById("versionPopup");
    if (popup && popup.style.display !== "none") {
      popup.style.display = "none";
    }
  },
  { passive: true, capture: true },
);

document.addEventListener(
  "touchstart",
  (e) => {
    const popup = document.getElementById("versionPopup");
    const btn = document.getElementById("versionBtn");
    if (
      popup &&
      popup.style.display !== "none" &&
      !popup.contains(e.target) &&
      e.target !== btn
    ) {
      popup.style.display = "none";
    }
  },
  { passive: true, capture: true },
);

function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  applyTheme(saved);
}

function applyTheme(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (btn) btn.textContent = "🌙 Dark";
    localStorage.setItem("theme", "light");
  } else {
    document.body.classList.remove("light-mode");
    if (btn) btn.textContent = "☀️ Light";
    localStorage.setItem("theme", "dark");
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  applyTheme(isLight ? "dark" : "light");
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
// ─── SAFE EVENT WIRING ────────────────────────────────────────────────────────
// If any single element is missing (stale deploy, typo, race condition), this
// logs a warning instead of throwing — so one missing element never blocks
// every listener registered after it in the boot sequence.
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(
      `[wiring] Element #${id} not found — skipping listener for "${event}"`,
    );
    return;
  }
  el.addEventListener(event, handler);
}

window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initSelectors();
  lockDatePicker();
  loadLocal();
  render();

  // Set card date default to today
  const cardTxnDateEl = document.getElementById("cardTxnDate");
  if (cardTxnDateEl) cardTxnDateEl.value = localDateStr(new Date());

  // Set sweetie date default to today
  const sweetieDateEl = document.getElementById("sweetieDate");
  if (sweetieDateEl) sweetieDateEl.value = localDateStr(new Date());

  // Expense tab wiring
  on("addBtn", "click", addEntry);
  on("saveSalaryBtn", "click", saveSalaryEntry);
  on("editSalaryBtn", "click", () => {
    document.getElementById("salaryEditGroup").style.display = "flex";
    document.getElementById("editSalaryBtn").style.display = "none";
  });
  on("syncBtn", "click", () => syncFromSheet(true));
  on("summaryBtn", "click", showSummary);
  on("closeModalBtn", "click", () => {
    document.getElementById("summaryModal").style.display = "none";
  });
  window.addEventListener("click", (e) => {
    const modal = document.getElementById("summaryModal");
    if (modal && e.target === modal) modal.style.display = "none";
  });

  // Card tab wiring
  // CC Master wiring
  on("themeToggleBtn", "click", toggleTheme);
  on("ccMasterBtn", "click", openCCMaster);
  on("closeCCMasterBtn", "click", () => {
    document.getElementById("ccMasterModal").style.display = "none";
    // Clear table for security — data only shown while modal is open
    document.getElementById("ccMasterBody").innerHTML =
      "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
  });
  window.addEventListener("click", (e) => {
    const ccModal = document.getElementById("ccMasterModal");
    if (ccModal && e.target === ccModal) {
      ccModal.style.display = "none";
      document.getElementById("ccMasterBody").innerHTML =
        "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
    }
  });

  on("tabExpenses", "click", () => switchTab("expenses"));
  on("tabCards", "click", () => switchTab("cards"));
  on("tabGrvCC", "click", () => switchTab("grvcc"));
  on("tabSweetie", "click", () => switchTab("sweetie"));
  on("addCardBtn", "click", addCardEntry);
  on("grvCardSyncBtn", "click", () => syncGrvCCFromSheet(true));
  on("grvBillsBtn", "click", openGrvBills);
  on("grvAddNewCardBtn", "click", openGrvCardConfig);
  on("grvManageCardsBtn", "click", openGrvManageCards);
  on("saveGrvCardConfigBtn", "click", saveGrvCardConfig);
  on("grvAddInCardsBtn", "click", addInCreditCards);
  on("cancelExpEditBtn", "click", cancelEditExpense);
  on("cancelCardEditBtn", "click", cancelEditCard);
  on("cardSyncBtn", "click", () => syncCardsFromSheet(true));
  on("addSweetieBtn", "click", addSweetieEntry);
  on("cancelSweetieEditBtn", "click", cancelEditSweetie);
  on("sweetieSyncBtn", "click", () => syncSweetieFromSheet(true));

  // Month/year change — refresh both tabs
  on("monthSelect", "change", () => {
    lockDatePicker();
    render();
    renderCards();
    syncFromSheet(false);
    syncCardsFromSheet(false); // always sync cards — month change affects 3-month window
    if (activeTab === "grvcc") renderGrvCC();
  });
  on("yearSelect", "change", () => {
    lockDatePicker();
    render();
    renderCards();
    syncFromSheet(false);
    syncCardsFromSheet(false);
    if (activeTab === "grvcc") renderGrvCC();
  });

  // Show local data instantly — no blocking loader
  // Sync runs silently in background, updates UI when done
  syncFromSheet(false, false);
  syncCardsFromSheet(false);
  syncGrvExpenseHistory();
  syncSweetieFromSheet(false);
  renderGrvCC();
  setGrvCardStatusFilter("ALL");
  setGrvCardMonthFilter("3");
  setCardStatusFilter("ALL"); // init filter button styles
  setCardMonthFilter("3"); // init month filter button styles
  populateCCCardFilter(); // init card dropdown

  setInterval(() => {
    syncFromSheet(false);
    if (activeTab === "cards" || activeTab === "grvcc")
      syncCardsFromSheet(false);
    if (activeTab === "sweetie") syncSweetieFromSheet(false);
    if (activeTab === "grvcc") renderGrvCC();
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── GRV CC PERSONAL CREDIT CARD VIEW ─────────────────────────────────────────
// Same cardTxns / same Cards sheet as the main Credit Cards tab. Only entries
// whose Used By is GRV, GAURAV or ME are visible here.
// ═══════════════════════════════════════════════════════════════════════════════
function isGrvUsedBy(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase();
  return v === "GRV" || v === "GAURAV" || v === "ME";
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        ch
      ],
  );
}

function parseYmdLocal(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function ymdLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function clampDay(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, day), last);
}
function addMonthsLocal(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, date.getDate());
}
function isDateInRangeYmd(value, start, end) {
  const d = parseYmdLocal(value);
  if (!d) return false;
  return d >= start && d <= end;
}

function getGrvTransactions() {
  return cardTxns.filter((t) => isGrvUsedBy(t.usedBy));
}

function getGrvMonthRange() {
  const selMonth = parseInt(document.getElementById("monthSelect").value);
  const selYear = parseInt(document.getElementById("yearSelect").value);
  const count = grvCardMonthFilter === "1" ? 1 : 3;
  const months = [];
  for (let i = 0; i < count; i++) {
    let m = selMonth - i,
      y = selYear;
    if (m < 0) {
      m += 12;
      y--;
    }
    months.push({ m, y });
  }
  return months;
}
function getGrvRangeRows() {
  const months = getGrvMonthRange();
  return getGrvTransactions().filter((t) => {
    const d = parseYmdLocal(t.txnDate);
    return (
      d &&
      months.some(({ m, y }) => d.getMonth() === m && d.getFullYear() === y)
    );
  });
}
function setGrvCardStatusFilter(status) {
  grvCardStatusFilter = status;
  ["ALL", "PAID", "UNPAID", "OWED", "SETTLED"].forEach((k) => {
    const el = document.getElementById(
      "grvFilter" + (k === "ALL" ? "All" : k[0] + k.slice(1).toLowerCase()),
    );
    if (el) el.classList.toggle("grv-active", k === status);
  });
}
function setGrvCardMonthFilter(months) {
  grvCardMonthFilter = months;
  const one = document.getElementById("grvFilter1M"),
    three = document.getElementById("grvFilter3M");
  if (one) one.classList.toggle("grv-active", months === "1");
  if (three) three.classList.toggle("grv-active", months === "3");
}
function populateGrvCardDropdown() {
  const sel = document.getElementById("grvCardFilter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="ALL">All Cards</option>';
  cardConfig.forEach((cfg) => {
    const o = document.createElement("option");
    o.value = cfg.card;
    o.text = cfg.card;
    sel.appendChild(o);
  });
  if (current && [...sel.options].some((o) => o.value === current))
    sel.value = current;
}
function setGrvMonthDrill(month, year) {
  const from = document.getElementById("grvCardDateFrom"),
    to = document.getElementById("grvCardDateTo");
  if (!from || !to) return;
  const first = new Date(year, month, 1),
    last = new Date(year, month + 1, 0);
  from.value = ymdLocal(first);
  to.value = ymdLocal(last);
  renderGrvCC();
}
function toggleGrvCardTile(card) {
  const sel = document.getElementById("grvCardFilter");
  if (!sel) return;
  sel.value = sel.value === card ? "ALL" : card;
  renderGrvCC();
}

function monthLabelToIso(label) {
  const m = String(label || "")
    .trim()
    .match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/);
  if (!m)
    return /^\d{4}-\d{2}$/.test(String(label || "").trim())
      ? String(label).trim()
      : "";
  const idx = MONTHS.indexOf(m[1]);
  if (idx < 0) return "";
  return `20${m[2]}-${String(idx + 1).padStart(2, "0")}`;
}

function isoToMonthLabel(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return "";
  return `${MONTHS[idx]}-${String(m[1]).slice(-2)}`;
}

function getGrvSalaryForMonth(iso) {
  const label = isoToMonthLabel(iso);
  return +(salaries[label] ?? salaries[iso] ?? 0) || 0;
}

function getGrvExpenseSource() {
  return Array.isArray(grvExpenseHistory) && grvExpenseHistory.length
    ? grvExpenseHistory
    : expenses;
}

function getGrvCategoryType(category) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (cat === "sweetie saving" || cat === "savings and investments")
    return "saving";
  if (cat === "bill repayment") return "cc_payment";
  if (cat === "sweetie borrow") return "transfer_out";
  if (cat === "received") return "received";
  return "expense";
}

/*
 * IMPORTANT FINANCIAL RULES
 * -------------------------
 * A credit-card purchase is an ACTUAL EXPENSE in the month of the purchase.
 * A later credit-card Bill Repayment is CASH FLOW only; it is NOT another expense.
 * This prevents the same purchase from being counted twice across two months.
 *
 * Savings categories are not expenses. They are shown separately as savings
 * allocations. Sweetie Borrow is a transfer, and Received is a cash receipt.
 */
function getExpenseMonthBuckets() {
  const map = new Map();
  getGrvExpenseSource().forEach((e) => {
    const month = monthLabelToIso(e.month);
    if (!month) return;
    const type = getGrvCategoryType(e.category);
    const amount = +e.amount || 0;
    if (!map.has(month))
      map.set(month, {
        expense: 0,
        saving: 0,
        ccPayment: 0,
        sweetieBorrow: 0,
        received: 0,
        rows: [],
      });
    const b = map.get(month);
    b.rows.push(e);
    if (type === "saving") b.saving += amount;
    else if (type === "cc_payment") b.ccPayment += amount;
    else if (type === "transfer_out") b.sweetieBorrow += amount;
    else if (type === "received") b.received += amount;
    else b.expense += amount;
  });
  return map;
}

// GRV monthly CC accounting is based on the card STATEMENT / BILLING MONTH,
// not the raw transaction month. Example: Axis cutoff 18 → a 19-Sep purchase
// belongs to the October statement.
function getGrvCCBillingMonthKey(t) {
  if (!t) return "";

  // Prefer the billing month already stored on the Cards sheet.
  const stored = formatBillingMonth(t.billingMonth || "");
  if (/^[A-Za-z]{3,9} \d{4}$/.test(stored)) {
    const m = stored.match(/^([A-Za-z]{3,9}) (\d{4})$/);
    if (m) {
      const idx = FULL_MONTHS.findIndex(
        (x) => x.toLowerCase() === m[1].toLowerCase(),
      );
      if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
    }
  }

  // Fallback for older/local rows that do not have billingMonth saved.
  const d = parseYmdLocal(t.txnDate);
  if (!d) return "";
  const cfg = cardConfig.find(
    (c) =>
      String(c.card || "")
        .trim()
        .toLowerCase() ===
      String(t.card || "")
        .trim()
        .toLowerCase(),
  );
  return calcBillingMonth(t.txnDate, cfg?.cutoff || 0).replace(
    /^([A-Za-z]+) (\d{4})$/,
    (_, mon, year) => {
      const idx = FULL_MONTHS.findIndex(
        (x) => x.toLowerCase() === mon.toLowerCase(),
      );
      return idx >= 0 ? `${year}-${String(idx + 1).padStart(2, "0")}` : "";
    },
  );
}

function getGrvCCSpendForMonth(key) {
  return getGrvTransactions().filter((t) => getGrvCCBillingMonthKey(t) === key);
}

function populateGrvOverviewSelectors() {
  const monthSel = document.getElementById("grvOverviewMonth");
  const yearSel = document.getElementById("grvOverviewYear");
  if (!monthSel || !yearSel) return;

  const globalMonth = parseInt(document.getElementById("monthSelect")?.value);
  const globalYear = parseInt(document.getElementById("yearSelect")?.value);
  if (
    !grvOverviewMonthKey &&
    Number.isFinite(globalMonth) &&
    Number.isFinite(globalYear)
  ) {
    grvOverviewMonthKey = `${globalYear}-${String(globalMonth + 1).padStart(2, "0")}`;
  }

  const years = new Set();
  if (Number.isFinite(globalYear)) years.add(globalYear);
  getGrvExpenseSource().forEach((e) => {
    const iso = monthLabelToIso(e.month);
    if (/^\d{4}-\d{2}$/.test(iso)) years.add(+iso.slice(0, 4));
  });
  Object.keys(salaries || {}).forEach((k) => {
    const iso = monthLabelToIso(k);
    if (/^\d{4}-\d{2}$/.test(iso)) years.add(+iso.slice(0, 4));
  });
  getGrvTransactions().forEach((t) => {
    const iso = getGrvCCBillingMonthKey(t);
    if (/^\d{4}-\d{2}$/.test(iso)) years.add(+iso.slice(0, 4));
  });
  if (!years.size && Number.isFinite(globalYear)) years.add(globalYear);

  const wanted =
    grvOverviewMonthKey ||
    `${globalYear}-${String(globalMonth + 1).padStart(2, "0")}`;
  const wantedYear = +wanted.slice(0, 4);
  const wantedMonth = +wanted.slice(5, 7) - 1;

  monthSel.innerHTML = FULL_MONTHS.map(
    (name, i) => `<option value="${i}">${name}</option>`,
  ).join("");
  yearSel.innerHTML = [...years]
    .sort((a, b) => a - b)
    .map((y) => `<option value="${y}">${y}</option>`)
    .join("");
  if ([...monthSel.options].some((o) => +o.value === wantedMonth))
    monthSel.value = wantedMonth;
  if ([...yearSel.options].some((o) => +o.value === wantedYear))
    yearSel.value = wantedYear;
}

function setGrvOverviewMonth() {
  const m = parseInt(document.getElementById("grvOverviewMonth")?.value);
  const y = parseInt(document.getElementById("grvOverviewYear")?.value);
  if (!Number.isFinite(m) || !Number.isFinite(y)) return;
  grvOverviewMonthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  renderCombinedMonthlyOverview();
}

function getCombinedMonthlyOverview() {
  populateGrvOverviewSelectors();
  const selMonth = parseInt(document.getElementById("grvOverviewMonth")?.value);
  const selYear = parseInt(document.getElementById("grvOverviewYear")?.value);
  if (!Number.isFinite(selMonth) || !Number.isFinite(selYear)) return [];

  const key = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
  const expenseMap = getExpenseMonthBuckets();
  const b = expenseMap.get(key) || {
    expense: 0,
    saving: 0,
    ccPayment: 0,
    sweetieBorrow: 0,
    received: 0,
  };
  const ccRows = getGrvCCSpendForMonth(key);
  const ccSpend = ccRows.reduce((sum, t) => sum + (+t.amount || 0), 0);
  const ccUnpaid = ccRows
    .filter((t) => String(t.status || "").toUpperCase() === "UNPAID")
    .reduce((sum, t) => sum + (+t.amount || 0), 0);
  const actualSpending = b.expense + ccSpend;
  const salary = getGrvSalaryForMonth(key);
  const cashIn = salary + b.received;
  const cashOut = b.expense + b.ccPayment + b.saving + b.sweetieBorrow;
  const cashRemaining = cashIn - cashOut;
  const committedOutflow = cashOut + ccUnpaid;
  const remainingAfterPendingCC = cashIn - committedOutflow;
  const netAfterActualSpending = cashIn - actualSpending;
  const savingRate = cashIn > 0 ? (b.saving / cashIn) * 100 : 0;

  return [
    {
      m: selMonth,
      y: selYear,
      key,
      salary,
      received: b.received,
      personalExpense: b.expense,
      ccSpend,
      ccUnpaid,
      actualSpending,
      savingAllocations: b.saving,
      savingRate,
      ccPayment: b.ccPayment,
      sweetieBorrow: b.sweetieBorrow,
      cashIn,
      cashOut,
      cashRemaining,
      committedOutflow,
      remainingAfterPendingCC,
      netAfterActualSpending,
    },
  ];
}

function renderCombinedMonthlyOverview() {
  const el = document.getElementById("grvMonthlyAnalysis");
  if (!el) return;
  populateGrvOverviewSelectors();
  const data = getCombinedMonthlyOverview();
  if (!data.length) {
    el.innerHTML = `<div class="grv-empty-analysis">No monthly data</div>`;
    return;
  }

  const v = data[0];
  const base = v.cashIn || 0;
  const pc = (x) =>
    base > 0 ? Math.max(0, Math.min(100, (x / base) * 100)) : 0;
  const left = Math.max(0, v.cashIn - v.actualSpending - v.savingAllocations);
  const bar =
    base > 0
      ? `<div class="grv-flowbar" title="Where income went (statement-month basis)">
    <i style="width:${pc(v.personalExpense)}%;background:#f87171"></i>
    <i style="width:${pc(v.ccSpend)}%;background:#f472b6"></i>
    <i style="width:${pc(v.savingAllocations)}%;background:#34d399"></i>
    <i style="width:${pc(left)}%;background:#22d3ee"></i></div>
    <div class="grv-flowlegend"><span><b style="background:#f87171"></b>Cash</span><span><b style="background:#f472b6"></b>CC</span><span><b style="background:#34d399"></b>Saved ${v.savingRate.toFixed(0)}%</span><span><b style="background:#22d3ee"></b>Left</span></div>`
      : "";
  const remainingClass = v.cashRemaining < 0 ? " negative" : "";

  el.innerHTML = `<div class="grv-month-combined-item grv-month-featured${remainingClass}" role="button" tabindex="0" onclick="openGrvMonthlyBreakdown('${v.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openGrvMonthlyBreakdown('${v.key}')}" aria-label="View details for ${MONTHS[v.m]} ${v.y}">
    <div class="grv-featured-main">
      <div class="grv-month-combined-head"><span>${MONTHS[v.m]} ${v.y}</span><em>⭐ SELECTED MONTH</em></div>
      <div class="grv-featured-spend"><span>Total Expenses</span><strong>${money(v.actualSpending)}</strong></div>
      <div class="grv-featured-kpis">
        <div><span>Income</span><strong>${money(v.cashIn)}</strong></div>
        <div><span>Cash / UPI</span><strong>${money(v.personalExpense)}</strong></div>
        <div><span>CC Purchases</span><strong>${money(v.ccSpend)}</strong></div>
        <div><span>Saved</span><strong>${money(v.savingAllocations)}</strong></div>
        <div><span>CC still unpaid / committed</span><strong class="grv-pending">${money(v.ccUnpaid)}</strong></div>
        <div><span>Cash Remaining</span><strong class="grv-featured-remaining${remainingClass}">${v.cashIn ? money(v.cashRemaining) : "—"}</strong></div>
        <div><span>After Pending CC</span><strong class="grv-featured-remaining${v.remainingAfterPendingCC < 0 ? " negative" : ""}">${v.cashIn ? money(v.remainingAfterPendingCC) : "—"}</strong></div>
      </div>
    </div>
    <div class="grv-featured-side">
      <div class="grv-featured-outflow"><span>Cash Outflow</span><strong>${money(v.cashOut)}</strong><small>incl. CC bill paid ${money(v.ccPayment)}</small></div>
      ${bar}
      <button type="button" class="grv-month-details-btn" onclick="event.stopPropagation();openGrvMonthlyBreakdown('${v.key}')">View ${MONTHS[v.m]} Details →</button>
    </div>
  </div>`;
}
function getMonthlyExpenseRows(key) {
  return getGrvExpenseSource().filter((e) => monthLabelToIso(e.month) === key);
}

function getMonthlyGrvCCRows(key) {
  return getGrvCCSpendForMonth(key);
}

function openGrvMonthlyBreakdown(key) {
  const modal = document.getElementById("grvMonthlyBreakdownModal");
  if (!modal || !/^\d{4}-\d{2}$/.test(String(key || ""))) return;
  const [y, m] = String(key).split("-").map(Number);
  const allExpenseRows = getMonthlyExpenseRows(key);
  const expenseRows = allExpenseRows.filter(
    (e) => getGrvCategoryType(e.category) === "expense",
  );
  const savingRows = allExpenseRows.filter(
    (e) => getGrvCategoryType(e.category) === "saving",
  );
  const ccPaymentRows = allExpenseRows.filter(
    (e) => getGrvCategoryType(e.category) === "cc_payment",
  );
  const borrowRows = allExpenseRows.filter(
    (e) => getGrvCategoryType(e.category) === "transfer_out",
  );
  const receivedRows = allExpenseRows.filter(
    (e) => getGrvCategoryType(e.category) === "received",
  );
  const ccRows = getMonthlyGrvCCRows(key);
  const personalExpense = expenseRows.reduce(
    (sum, e) => sum + (+e.amount || 0),
    0,
  );
  const ccTotal = ccRows.reduce((sum, t) => sum + (+t.amount || 0), 0);
  const actualSpending = personalExpense + ccTotal;
  const savingAllocations = savingRows.reduce(
    (sum, e) => sum + (+e.amount || 0),
    0,
  );
  const ccPayment = ccPaymentRows.reduce((sum, e) => sum + (+e.amount || 0), 0);
  const sweetieBorrow = borrowRows.reduce(
    (sum, e) => sum + (+e.amount || 0),
    0,
  );
  const received = receivedRows.reduce((sum, e) => sum + (+e.amount || 0), 0);
  const salary = getGrvSalaryForMonth(key);
  const cashIn = salary + received;
  const cashOut =
    personalExpense + ccPayment + savingAllocations + sweetieBorrow;
  const cashRemaining = cashIn - cashOut;
  const ccUnpaid = ccRows
    .filter((t) => String(t.status || "").toUpperCase() === "UNPAID")
    .reduce((s, t) => s + (+t.amount || 0), 0);
  const remainingAfterPendingCC = cashIn - cashOut - ccUnpaid;
  const summary = document.getElementById("grvMonthlyBreakdownSummary");
  const body = document.getElementById("grvMonthlyBreakdownBody");
  if (!summary || !body) return;

  summary.innerHTML = `
    <div class="grv-month-summary-card"><span>💰 Cash In</span><strong>${salary || received ? money(cashIn) : "—"}</strong></div>
    <div class="grv-month-summary-card"><span>🧾 Actual Spending</span><strong>${money(actualSpending)}</strong></div>
    <div class="grv-month-summary-card"><span>💳 CC Bill Paid</span><strong>${money(ccPayment)}</strong></div>
    <div class="grv-month-summary-card"><span>🏦 Saving Allocated</span><strong>${money(savingAllocations)}</strong></div>
    <div class="grv-month-summary-card"><span>👥 Others' CC Share</span><strong>${money(ccRows.filter((t) => !isGrvUsedBy(t.usedBy)).reduce((s, t) => s + (+t.amount || 0), 0))}</strong></div>
    <div class="grv-month-summary-card ${cashRemaining < 0 ? "warning" : "saving"}"><span>💵 Cash Remaining</span><strong>${salary || received ? money(cashRemaining) : "—"}</strong></div>
    <div class="grv-month-summary-card ${remainingAfterPendingCC < 0 ? "warning" : "saving"}"><span>📌 After Pending CC</span><strong>${salary || received ? money(remainingAfterPendingCC) : "—"}</strong></div>`;

  const catMap = new Map();
  expenseRows.forEach((e) => {
    const cat = String(e.category || "Other").trim() || "Other";
    catMap.set(cat, (catMap.get(cat) || 0) + (+e.amount || 0));
  });
  const cardMap = new Map();
  ccRows.forEach((t) => {
    const card = String(t.card || "Unknown Card").trim() || "Unknown Card";
    cardMap.set(card, (cardMap.get(card) || 0) + (+t.amount || 0));
  });
  const catEntries = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
  const cardEntries = [...cardMap.entries()].sort((a, b) => b[1] - a[1]);
  const renderBreakdown = (entries, total, label) =>
    entries.length
      ? entries
          .map(([name, amt]) => {
            const pct = total > 0 ? (amt / total) * 100 : 0;
            return `<div class="grv-breakdown-row"><div><span>${esc(name)}</span><div class="grv-breakdown-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><small>${pct.toFixed(1)}% of ${label}</small></div><strong>${money(amt)}</strong></div>`;
          })
          .join("")
      : `<div class="grv-empty-analysis">No ${label} recorded.</div>`;

  const allRows = [
    ...expenseRows.map((e) => ({
      date: e.date,
      desc: e.description || e.category || "Expense",
      amount: +e.amount || 0,
      source: "Personal",
      sub: e.category || "",
    })),
    ...ccRows.map((t) => ({
      date: t.txnDate,
      desc: t.description || t.card || "Credit Card",
      amount: +t.amount || 0,
      source: "GRV CC",
      sub: t.card || "",
    })),
    ...ccPaymentRows.map((e) => ({
      date: e.date,
      desc: e.description || "Credit Card Bill Payment",
      amount: +e.amount || 0,
      source: "CC Bill Payment",
      sub: "Transfer — not an expense",
    })),
    ...savingRows.map((e) => ({
      date: e.date,
      desc: e.description || e.category || "Saving",
      amount: +e.amount || 0,
      source: "Saving",
      sub: e.category || "",
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const detailHtml = allRows.length
    ? `<details class="grv-breakdown-detail"><summary>View all ${allRows.length} relevant transactions for ${MONTHS[m - 1] || "Month"}</summary>${allRows.map((r) => `<div class="grv-breakdown-txn"><span class="muted">${esc(formatDisplayDate(r.date))}</span><span>${esc(r.desc)} · <span class="muted">${esc(r.source)}${r.sub ? ` · ${esc(r.sub)}` : ""}</span></span><strong>${money(r.amount)}</strong></div>`).join("")}</details>`
    : `<div class="grv-empty-analysis">No transactions recorded for this month.</div>`;

  body.innerHTML = `
    <div class="grv-breakdown-panel">
      <div class="grv-month-breakdown-section-title"><span>🧾 Actual Expense Breakdown</span><strong>${money(personalExpense)}</strong></div>
      <div class="grv-breakdown-sub">Cash/UPI expenses recorded in Expenses. Credit-card purchases are listed separately below.</div>
      <div class="grv-breakdown-list">${renderBreakdown(catEntries, personalExpense, "personal expenses")}</div>
      <div class="grv-breakdown-total"><span>Personal expense total</span><strong>${money(personalExpense)}</strong></div>
    </div>
    <div class="grv-breakdown-panel">
      <div class="grv-month-breakdown-section-title"><span>💳 Credit Card Purchases</span><strong>${money(ccTotal)}</strong></div>
      <div class="grv-breakdown-sub">Counted in the month the card purchase happened. This is actual spending, not the later bill payment.</div>
      <div class="grv-breakdown-list">${renderBreakdown(cardEntries, ccTotal, "credit-card spend")}</div>
      <div class="grv-breakdown-total"><span>Credit-card purchase total</span><strong>${money(ccTotal)}</strong></div>
    </div>
    <div class="grv-breakdown-panel">
      <div class="grv-month-breakdown-section-title"><span>🔄 Cash Flow / Transfers</span><strong>${money(cashOut)}</strong></div>
      <div class="grv-breakdown-sub">Bill repayment is a payment of an earlier card purchase, so it is NOT added to actual spending again. Full bill payment is cash outflow; other people's card purchases are recoverable from them.</div>
      <div class="grv-breakdown-total"><span>CC Bill Paid</span><strong>${money(ccPayment)}</strong></div>
      <div class="grv-breakdown-total"><span>Sweetie Borrow</span><strong>${money(sweetieBorrow)}</strong></div>
      <div class="grv-breakdown-total"><span>Saving Allocated</span><strong>${money(savingAllocations)}</strong></div>
      <div class="grv-breakdown-total"><span>Cash Outflow</span><strong>${money(cashOut)}</strong></div>
    </div>
    <div class="grv-breakdown-panel">
      <div class="grv-month-breakdown-section-title"><span>📊 Monthly Picture</span><strong>${money(actualSpending)}</strong></div>
      <div class="grv-breakdown-total"><span>Salary</span><strong>${salary ? money(salary) : "—"}</strong></div>
      <div class="grv-breakdown-total"><span>Received</span><strong>${money(received)}</strong></div>
      <div class="grv-breakdown-total"><span>Actual Spending</span><strong>${money(actualSpending)}</strong></div>
      <div class="grv-breakdown-total"><span>Saving Allocated</span><strong>${money(savingAllocations)}</strong></div>
      <div class="grv-breakdown-total"><span>CC still unpaid / committed</span><strong class="grv-pending">${money(ccUnpaid)}</strong></div>
      <div class="grv-breakdown-total"><span>Cash Remaining</span><strong class="${cashRemaining < 0 ? "c-red" : "c-green"}">${salary || received ? money(cashRemaining) : "—"}</strong></div>
      <div class="grv-breakdown-total"><span>Available After Pending CC</span><strong class="${remainingAfterPendingCC < 0 ? "c-red" : "c-green"}">${salary || received ? money(remainingAfterPendingCC) : "—"}</strong></div>
    </div>
    <div class="grv-breakdown-panel" style="grid-column:1/-1">
      <div class="grv-month-breakdown-section-title"><span>📋 Monthly Audit</span><strong>${allRows.length}</strong></div>
      <div class="grv-breakdown-sub">Saving categories: Sweetie Saving + Savings and Investments. Bill Repayment is treated as a transfer. Received is treated as cash received.</div>
      ${detailHtml}
    </div>`;
  const title = document.getElementById("grvMonthlyBreakdownTitle");
  if (title)
    title.textContent = `📊 ${MONTHS[m - 1] || "Month"} ${y} — Full Financial Breakdown`;
  modal.style.display = "block";
}

function closeGrvMonthlyBreakdown() {
  const modal = document.getElementById("grvMonthlyBreakdownModal");
  if (modal) modal.style.display = "none";
}

async function syncGrvExpenseHistory() {
  if (grvExpenseHistoryLoading) return;
  grvExpenseHistoryLoading = true;
  try {
    // GRV monthly overview needs the complete Expenses history AND the Salary sheet.
    // The normal Expenses-tab sync only fetches the selected month, so explicitly
    // refresh both datasets here when GRV CC is opened.
    const [expenseRes, salaryRes] = await Promise.all([
      fetch(apiUrl("action=get")).then((r) => r.json()),
      fetch(apiUrl("action=getSalary")).then((r) => r.json()),
    ]);

    if (Array.isArray(expenseRes)) {
      grvExpenseHistory = expenseRes
        .map((row) => ({
          id: String(row[0] || ""),
          date: String(row[1] || ""),
          month: String(row[2] || ""),
          category: String(row[3] || ""),
          description: String(row[4] || ""),
          amount: parseFloat(row[5]) || 0,
        }))
        .filter((e) => e.id && e.date);
      grvExpenseHistoryLoaded = true;
    }

    if (Array.isArray(salaryRes)) {
      // API returns a header row followed by [monthKey, amount].
      salaryRes.slice(1).forEach((row) => {
        const key = String(row?.[0] || "").trim();
        const amount = parseFloat(row?.[1]);
        if (
          /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}$/.test(
            key,
          ) &&
          Number.isFinite(amount)
        ) {
          salaries[key] = amount;
        }
      });
      saveLocal();
    }

    renderCombinedMonthlyOverview();
  } catch (e) {
    // Cached/local expenses and salaries remain the fallback.
    console.warn("GRV monthly history/salary sync failed:", e);
  } finally {
    grvExpenseHistoryLoading = false;
  }
}

function renderGrvCCAnalysis(rows) {
  const months = getGrvMonthRange(),
    monthlyEl = document.getElementById("grvMonthlyAnalysis"),
    cardEl = document.getElementById("grvCardUnpaidGrid");
  if (!monthlyEl || !cardEl) return;
  const from = document.getElementById("grvCardDateFrom")?.value || "",
    to = document.getElementById("grvCardDateTo")?.value || "";
  populateGrvOverviewSelectors();
  renderCombinedMonthlyOverview();
  // The dashboard cards are month-specific: the selected top-bar month is the
  // month whose spend/unpaid figures the user sees. The optional 3-month filter
  // remains available for the transaction table below.
  const selectedKey = `${months[0].y}-${String(months[0].m + 1).padStart(2, "0")}`;
  const selectedMonthRows = getGrvTransactions().filter(
    (t) => getGrvCCBillingMonthKey(t) === selectedKey,
  );
  const map = new Map();
  selectedMonthRows.forEach((t) => {
    if (!map.has(t.card)) map.set(t.card, { unpaid: 0, spend: 0, count: 0 });
    const v = map.get(t.card);
    v.spend += +t.amount || 0;
    v.count++;
    if (String(t.status || "").toUpperCase() === "UNPAID")
      v.unpaid += +t.amount || 0;
  });
  const entries = [...map.entries()]
      .filter(([, v]) => v.unpaid > 0)
      .sort((a, b) => b[1].unpaid - a[1].unpaid),
    activeCard = document.getElementById("grvCardFilter")?.value || "ALL";
  cardEl.innerHTML = entries.length
    ? entries
        .map(
          ([card, v]) =>
            `<div class="grv-card-unpaid-item${activeCard === card ? " grv-tile-active" : ""}" onclick="toggleGrvCardTile(${JSON.stringify(card)})"><div class="grv-card-name">${esc(card)}</div><div class="grv-unpaid-amount">₹${v.unpaid.toFixed(2)}</div><div class="grv-card-meta">Unpaid · Spend ₹${v.spend.toFixed(2)} · ${v.count} txn</div></div>`,
        )
        .join("")
    : `<div class="grv-empty-analysis">No unpaid card transactions in this range</div>`;
}

function renderGrvCC() {
  const allRows = getGrvRangeRows();
  const selectedMonth = getGrvMonthRange()[0];
  const selectedKey = `${selectedMonth.y}-${String(selectedMonth.m + 1).padStart(2, "0")}`;
  const selectedRows = getGrvTransactions().filter(
    (t) => getGrvCCBillingMonthKey(t) === selectedKey,
  );
  // Top GRV CC numbers answer the simple question: “how much did I spend
  // on cards in the month selected in the top-bar dropdown?” Paid transactions
  // remain part of spend; only the Unpaid KPI is status-filtered.
  const total = selectedRows.reduce((a, t) => a + (+t.amount || 0), 0);
  const unpaid = selectedRows
    .filter((t) => String(t.status || "").toUpperCase() === "UNPAID")
    .reduce((a, t) => a + (+t.amount || 0), 0);
  const totalEl = document.getElementById("grvStatTotal"),
    unpaidEl = document.getElementById("grvStatUnpaid");
  if (totalEl) totalEl.textContent = money(total);
  if (unpaidEl) unpaidEl.textContent = money(unpaid);
  const range = getGrvMonthRange(),
    rangeEl = document.getElementById("grvCCRangeLabel");
  if (rangeEl) {
    const n = range[0],
      o = range[range.length - 1];
    rangeEl.textContent =
      range.length === 1
        ? `${MONTHS[n.m]} ${n.y}`
        : `${MONTHS[o.m]} - ${MONTHS[n.m]} ${n.y}`;
  }
  populateGrvCardDropdown();
  const search = (document.getElementById("grvCardSearchBox")?.value || "")
      .trim()
      .toLowerCase(),
    from = document.getElementById("grvCardDateFrom")?.value || "",
    to = document.getElementById("grvCardDateTo")?.value || "";
  grvCardFilter = document.getElementById("grvCardFilter")?.value || "ALL";
  const rows = allRows.filter((t) => {
    const hay = [t.description, t.card, t.remarks, t.amount, t.status]
      .join(" ")
      .toLowerCase();
    return (
      (!search || hay.includes(search)) &&
      (grvCardStatusFilter === "ALL" || t.status === grvCardStatusFilter) &&
      (grvCardFilter === "ALL" || t.card === grvCardFilter) &&
      (!from || t.txnDate >= from) &&
      (!to || t.txnDate <= to)
    );
  });
  renderGrvCCAnalysis(allRows);
  renderGrvDueAlerts();
  const showing = document.getElementById("grvShowingTotal");
  if (showing)
    showing.textContent = `Showing ${money(rows.reduce((a, t) => a + (+t.amount || 0), 0))} of ${money(allRows.reduce((a, t) => a + (+t.amount || 0), 0))}`;
  ["txnDate", "card", "description", "remarks", "amount", "status"].forEach(
    (col) => {
      const th = document.getElementById("grvTh_" + col);
      if (th && th.querySelector(".sort-arrow"))
        th.querySelector(".sort-arrow").textContent =
          grvCardSort.col === col
            ? grvCardSort.dir === "asc"
              ? " ↑"
              : " ↓"
            : " ↕";
    },
  );
  const tbody = document.getElementById("grvCardTableBody"),
    empty = document.getElementById("grvCCEmptyMessage");
  if (!tbody || !empty) return;
  tbody.innerHTML = "";
  const count = document.getElementById("grvCCRowCount");
  if (count)
    count.textContent = search
      ? `${rows.length} of ${allRows.length} entries`
      : `${rows.length} entries`;
  if (!rows.length) {
    empty.style.display = "block";
    empty.textContent = search
      ? `No results for "${esc(search)}"`
      : "✨ No GRV credit card transactions found";
    return;
  }
  empty.style.display = "none";
  const sorted = [...rows].sort((a, b) => {
    let av = a[grvCardSort.col],
      bv = b[grvCardSort.col];
    if (grvCardSort.col === "amount") {
      av = +av;
      bv = +bv;
    } else if (grvCardSort.col === "txnDate") {
      av = a.txnDate || "";
      bv = b.txnDate || "";
    } else {
      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
    }
    if (av < bv) return grvCardSort.dir === "asc" ? -1 : 1;
    if (av > bv) return grvCardSort.dir === "asc" ? 1 : -1;
    return String(b.id) > String(a.id) ? 1 : -1;
  });
  sorted.forEach((t) => {
    const tr = tbody.insertRow();
    if (t.status === "UNPAID") tr.classList.add("grv-unpaid-row");
    const cc = tr.insertCell(0);
    cc.className = "grv-check-col";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "grv-row-check";
    cb.checked = grvSelectedIds.has(String(t.id));
    cb.setAttribute("aria-label", `Select ${t.description || "transaction"}`);
    cb.onchange = () => {
      if (cb.checked) grvSelectedIds.add(String(t.id));
      else grvSelectedIds.delete(String(t.id));
      updateGrvSelectedUI();
    };
    cc.appendChild(cb);
    tr.insertCell(1).textContent = formatDisplayDate(t.txnDate);
    const cardCell = tr.insertCell(2);
    cardCell.innerHTML = `<span class="table-data-pill table-card-pill grv-card-tone-${getCardTone(t.card)}">${esc(t.card)}</span>`;
    tr.insertCell(3).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(t.description || "—")}</span>`;
    tr.insertCell(4).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(t.remarks || "—")}</span>`;
    tr.insertCell(5).innerHTML =
      `<span class="table-data-pill table-amount-pill table-negative-pill">${money(t.amount)}</span>`;
    const sc = tr.insertCell(6),
      status = String(t.status || "UNPAID").toUpperCase();
    if (status === "OWED" || status === "SETTLED") {
      const badge = document.createElement("span");
      badge.className = `status-badge ${status === "SETTLED" ? "badge-paid" : "badge-unpaid"}`;
      badge.textContent =
        (status === "PAID"
          ? "✓ "
          : status === "UNPAID"
            ? "! "
            : status === "OWED"
              ? "↗ "
              : "✓ ") + status;
      sc.appendChild(badge);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `status-toggle ${status === "PAID" ? "status-toggle-paid" : "status-toggle-unpaid"}`;
      btn.innerHTML = `<span class="status-badge ${status === "PAID" ? "badge-paid" : "badge-unpaid"}">${status === "PAID" ? "✓ " : "! "}${esc(status)}</span>`;
      btn.title = "Toggle PAID / UNPAID";
      btn.setAttribute(
        "aria-label",
        `Mark transaction ${status === "PAID" ? "unpaid" : "paid"}`,
      );
      btn.onclick = () => toggleGrvCardStatus(t.id);
      sc.appendChild(btn);
    }
    tr.insertCell(7).textContent = formatBillingMonth(t.billingMonth);
  });
  updateGrvSelectedUI();
}
function updateGrvSelectedUI() {
  const selected = [...grvSelectedIds]
    .map((id) => cardTxns.find((t) => String(t.id) === String(id)))
    .filter(Boolean);
  const total = selected.reduce((a, t) => a + (+t.amount || 0), 0);
  const totalEl = document.getElementById("grvSelectedTotal");
  if (totalEl) totalEl.textContent = `Selected ${money(total)}`;
  const btn = document.getElementById("grvMarkSelectedBtn");
  if (btn) btn.disabled = !selected.length;
  const all = document.getElementById("grvSelectAll");
  const visible = [...document.querySelectorAll(".grv-row-check")];
  if (all) {
    all.checked = visible.length > 0 && visible.every((x) => x.checked);
    all.indeterminate = visible.some((x) => x.checked) && !all.checked;
  }
}
function toggleSelectAllGrv(checked) {
  document.querySelectorAll(".grv-row-check").forEach((cb) => {
    cb.checked = checked;
    const row = cb.closest("tr");
    const id = cardTxns.find(
      (t) =>
        t.description === row?.cells?.[3]?.textContent &&
        t.txnDate === row?.cells?.[1]?.textContent,
    );
  });
  const visible = getGrvRangeRows().filter((t) => {
    const search = (document.getElementById("grvCardSearchBox")?.value || "")
        .trim()
        .toLowerCase(),
      from = document.getElementById("grvCardDateFrom")?.value || "",
      to = document.getElementById("grvCardDateTo")?.value || "",
      card = document.getElementById("grvCardFilter")?.value || "ALL",
      hay = [t.description, t.card, t.remarks, t.amount, t.status]
        .join(" ")
        .toLowerCase();
    return (
      (!search || hay.includes(search)) &&
      (grvCardStatusFilter === "ALL" || t.status === grvCardStatusFilter) &&
      (card === "ALL" || t.card === card) &&
      (!from || t.txnDate >= from) &&
      (!to || t.txnDate <= to)
    );
  });
  visible.forEach((t) =>
    checked
      ? grvSelectedIds.add(String(t.id))
      : grvSelectedIds.delete(String(t.id)),
  );
  renderGrvCC();
}
function markSelectedGrvPaid() {
  return toast(
    "Use Bills → Pay Bill so other people's share becomes OWED correctly.",
    true,
    5000,
  );
}

function sortGrvCC(col) {
  if (grvCardSort.col === col)
    grvCardSort.dir = grvCardSort.dir === "asc" ? "desc" : "asc";
  else {
    grvCardSort.col = col;
    grvCardSort.dir = col === "amount" ? "desc" : "asc";
  }
  renderGrvCC();
}
function toggleGrvCardStatus(id) {
  const t = cardTxns.find((x) => x.id === id);
  if (!t) return;
  if (["OWED", "SETTLED"].includes(String(t.status || "").toUpperCase()))
    return toast("Use Who Owes Me → Received for reimbursement status.", true);
  const previous = t.status;
  const next = previous === "PAID" ? "UNPAID" : "PAID";
  t.status = next;
  saveLocal();
  renderCards();
  renderGrvCC();
  sheetWrite(
    apiUrl(`action=updateCardStatus&id=${enc(id)}&status=${enc(next)}`),
  );
  toast(`Marked ${next} ✓`, false, 5000, {
    label: "Undo",
    fn: () => {
      const x = cardTxns.find((z) => z.id === id);
      if (!x) return;
      x.status = previous;
      saveLocal();
      sheetWrite(
        apiUrl(`action=updateCardStatus&id=${enc(id)}&status=${enc(previous)}`),
      );
      renderCards();
      renderGrvCC();
      toast("↩️ Payment status undone");
    },
  });
}
function markAllGrvPaid() {
  return toast(
    "Use Bills → Pay Bill so other people's share becomes OWED correctly.",
    true,
    5000,
  );
}
function clearAllGrvCCFilters() {
  ["grvCardSearchBox", "grvCardDateFrom", "grvCardDateTo"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) e.value = "";
  });
  const c = document.getElementById("grvCardFilter");
  if (c) c.value = "ALL";
  setGrvCardStatusFilter("ALL");
  setGrvCardMonthFilter("3");
  renderGrvCC();
}
async function syncGrvCCFromSheet(isManual = false) {
  await Promise.all([syncCardsFromSheet(false), syncGrvExpenseHistory()]);
  renderGrvCC();
  if (isManual) toast("GRV CC synced ✓");
}

function saveGrvStatementMatches() {
  try {
    localStorage.setItem(
      "grv_statement_matches",
      JSON.stringify(grvStatementMatches),
    );
  } catch (_) {}
}
function getDueAlertItems() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return cardConfig
    .map((cfg) => {
      const cycles = getCardCycle(cfg, today),
        unpaid = rowsForCycle(cfg.card, cycles.last).filter(
          (t) => t.status === "UNPAID",
        ),
        amount = unpaid.reduce((a, t) => a + (+t.amount || 0), 0),
        due = getDueInfo(cfg, cycles.last);
      return { cfg, amount, due };
    })
    .filter((x) => x.amount > 0 && x.due)
    .sort((a, b) => a.due.date - b.due.date);
}
function renderGrvDueAlerts() {
  const el = document.getElementById("grvDueAlerts");
  if (!el) return;
  const items = getDueAlertItems().slice(0, 4);
  if (!items.length) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "grid";
  el.innerHTML = items
    .map((x) => {
      const d = x.due.days,
        cls = d < 0 ? "danger" : d <= 3 ? "warn" : "safe",
        txt =
          d < 0
            ? `${x.cfg.card} bill overdue by ${Math.abs(d)} days`
            : d === 0
              ? `${x.cfg.card} bill is due today`
              : `${x.cfg.card} bill due in ${d} day${d === 1 ? "" : "s"}`;
      return `<div class="grv-due-alert ${cls}"><div><strong>${esc(txt)}</strong><span>${money(x.amount)} · Due ${x.due.date.getDate()} ${MONTHS[x.due.date.getMonth()]}</span></div><button type="button" onclick="openGrvBills()">View Bill</button></div>`;
    })
    .join("");
}
function renderGrvWhoOwes(cards) {
  const el = document.getElementById("grvWhoOwesSection");
  if (!el) return;
  const map = new Map(),
    rowsByPerson = new Map();
  cardTxns
    .filter(
      (t) =>
        String(t.status || "").toUpperCase() === "OWED" &&
        !isGrvUsedBy(t.usedBy),
    )
    .forEach((t) => {
      const key = String(t.usedBy || "Others").trim() || "Others";
      map.set(key, (map.get(key) || 0) + (+t.amount || 0));
      if (!rowsByPerson.has(key)) rowsByPerson.set(key, []);
      rowsByPerson.get(key).push(t);
    });
  const entries = [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]),
    total = entries.reduce((a, [, v]) => a + v, 0);
  el.innerHTML = `<div class="grv-who-owes-head"><div><strong>👥 Who Owes Me</strong><span>People whose share I already paid on the card bill</span></div><b>${money(total)}</b></div>${entries.length ? `<div class="grv-who-owes-grid">${entries.map(([name, amt]) => `<div class="grv-owe-item"><div><span>${esc(name)}</span><small style="display:block;color:var(--muted);margin-top:3px">${rowsByPerson.get(name).length} transaction${rowsByPerson.get(name).length === 1 ? "" : "s"} · OWED</small></div><div style="display:flex;align-items:center;gap:8px"><strong>${money(amt)}</strong><button type="button" class="grv-bill-mark" onclick='settleGrvOwe(${JSON.stringify(name)})'>Received</button></div></div>`).join("")}</div>` : `<div class="grv-empty-analysis">No outstanding amount owed by others.</div>`}`;
}

// ─── GRV CC BILLS ────────────────────────────────────────────────────────────
function getCardCycle(cardCfg, referenceDate = new Date()) {
  const cutoff = Math.max(0, Math.min(31, parseInt(cardCfg?.cutoff) || 0));
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  if (cutoff === 0) {
    const openStart = new Date(today.getFullYear(), today.getMonth(), 1),
      openEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0),
      lastStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1);
    return {
      open: {
        start: openStart,
        end: openEnd,
        billingYear: today.getFullYear(),
        billingMonth: today.getMonth(),
      },
      last: {
        start: lastStart,
        end: lastEnd,
        billingYear: lastEnd.getFullYear(),
        billingMonth: lastEnd.getMonth(),
      },
    };
  }
  const thisCutDay = clampDay(today.getFullYear(), today.getMonth(), cutoff);
  const afterCut = today.getDate() > thisCutDay;
  const openBilling = new Date(
    today.getFullYear(),
    today.getMonth() + (afterCut ? 1 : 0),
    1,
  );
  const openEnd = new Date(
    openBilling.getFullYear(),
    openBilling.getMonth(),
    clampDay(openBilling.getFullYear(), openBilling.getMonth(), cutoff),
  );
  const openStart = new Date(
    openBilling.getFullYear(),
    openBilling.getMonth() - 1,
    clampDay(openBilling.getFullYear(), openBilling.getMonth() - 1, cutoff) + 1,
  );
  const lastBilling = new Date(
    openBilling.getFullYear(),
    openBilling.getMonth() - 1,
    1,
  );
  const lastEnd = new Date(
    lastBilling.getFullYear(),
    lastBilling.getMonth(),
    clampDay(lastBilling.getFullYear(), lastBilling.getMonth(), cutoff),
  );
  const lastStart = new Date(
    lastBilling.getFullYear(),
    lastBilling.getMonth() - 1,
    clampDay(lastBilling.getFullYear(), lastBilling.getMonth() - 1, cutoff) + 1,
  );
  return {
    open: {
      start: openStart,
      end: openEnd,
      billingYear: openBilling.getFullYear(),
      billingMonth: openBilling.getMonth(),
    },
    last: {
      start: lastStart,
      end: lastEnd,
      billingYear: lastBilling.getFullYear(),
      billingMonth: lastBilling.getMonth(),
    },
  };
}
function rowsForCycle(card, cycle) {
  return cardTxns.filter(
    (t) =>
      t.card === card && isDateInRangeYmd(t.txnDate, cycle.start, cycle.end),
  );
}
function splitRows(rows) {
  const my = rows
    .filter((t) => isGrvUsedBy(t.usedBy))
    .reduce((a, t) => a + (+t.amount || 0), 0);
  return { my, others: rows.reduce((a, t) => a + (+t.amount || 0), 0) - my };
}
function getDueInfo(cfg, statement) {
  const day = parseInt(cfg?.dueDay) || 0;
  if (!day) return null;
  const dueBase = new Date(
      statement.billingYear,
      statement.billingMonth + (parseInt(cfg?.dueMonthOffset) || 0),
      1,
    ),
    due = new Date(
      dueBase.getFullYear(),
      dueBase.getMonth(),
      clampDay(dueBase.getFullYear(), dueBase.getMonth(), day),
    ),
    today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due - today) / 86400000);
  return { date: due, days: diff };
}
function money(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatCycleRange(c) {
  return `${c.start.getDate()} ${MONTHS[c.start.getMonth()]} ${c.start.getFullYear()} – ${c.end.getDate()} ${MONTHS[c.end.getMonth()]} ${c.end.getFullYear()}`;
}
function setGrvStatementMatch(card, value) {
  const n = parseFloat(value);
  const cfg = cardConfig.find((c) => c.card === card);
  const ref = grvBillsRef || new Date();
  const cycle = cfg ? getCardCycle(cfg, ref).last : null;
  const key = cycle ? `${card}|${cycle.billingYear}-${cycle.billingMonth + 1}` : card;
  if (!Number.isFinite(n)) {
    delete grvStatementMatches[key];
  } else {
    grvStatementMatches[key] = n;
  }
  saveGrvStatementMatches();
  renderGrvBills();
  toast("Statement amount saved ✓");
}
async function markBillPaid(card, ids) {
  if (window.__grvActionBusy)
    return toast("⏳ Another bill action is already being saved", true);
  const rows = ids
      .map((id) => cardTxns.find((x) => String(x.id) === String(id)))
      .filter(Boolean),
    unpaid = rows.filter(
      (t) => String(t.status || "").toUpperCase() === "UNPAID",
    );
  if (!unpaid.length) return toast("No UNPAID transactions found", true);
  const total = unpaid.reduce((s, t) => s + (+t.amount || 0), 0);
  if (
    !confirm(
      `Pay ${money(total)} for ${card}? Your rows will become PAID and others' rows will become OWED.`,
    )
  )
    return;
  const paymentDate = ymdLocal(new Date());
  window.__grvActionBusy = true;
  try {
    const desc = `${card} bill payment | Full statement payment ${money(total)}`;
    const res = await fetch(
      apiUrl(
        `action=payBill&card=${enc(card)}&ids=${enc(unpaid.map((t) => t.id).join(","))}&paymentDate=${enc(paymentDate)}&paymentAmount=${total}&description=${enc(desc)}`,
      ),
    );
    const text = await res.text();
    if (text !== "Paid") throw new Error(text);
    await Promise.all([syncCardsFromSheet(false), syncGrvExpenseHistory()]);
    renderCards();
    renderGrvCC();
    renderGrvBills();
    toast(`✓ ${card} bill paid · Others are now OWED`);
  } catch (err) {
    toast("⚠️ Bill payment failed: " + err.message, true, 6000);
    console.warn(err);
  } finally {
    window.__grvActionBusy = false;
  }
}

function openGrvBillPayment(
  card,
  cycleStart,
  cycleEnd,
  total,
  myShare,
  othersShare,
  ids = [],
) {
  const modal = document.getElementById("grvBillPaymentModal");
  if (!modal) return;
  document.getElementById("grvBillPaymentCard").textContent = card;
  document.getElementById("grvBillPaymentCycle").textContent =
    `${cycleStart} – ${cycleEnd}`;
  document.getElementById("grvBillPaymentTotal").textContent = money(total);
  document.getElementById("grvBillPaymentMyShare").textContent = money(myShare);
  document.getElementById("grvBillPaymentOthers").textContent =
    money(othersShare);
  document.getElementById("grvBillPaymentAmount").value = (+total || 0).toFixed(
    2,
  );
  document.getElementById("grvBillPaymentDate").value = localDateStr(
    new Date(),
  );
  modal.dataset.card = card;
  modal.dataset.cycleStart = cycleStart;
  modal.dataset.cycleEnd = cycleEnd;
  modal.dataset.total = String(total);
  modal.dataset.myShare = String(myShare);
  modal.dataset.othersShare = String(othersShare);
  modal.dataset.ids = JSON.stringify(ids || []);
  modal.style.display = "block";
}
function closeGrvBillPayment() {
  const m = document.getElementById("grvBillPaymentModal");
  if (m) m.style.display = "none";
}
async function saveGrvBillPayment() {
  if (window.__grvActionBusy)
    return toast("⏳ Bill payment is already being saved", true);
  const modal = document.getElementById("grvBillPaymentModal");
  if (!modal) return;
  const card = modal.dataset.card || "",
    total = +(modal.dataset.total || 0),
    amount = parseFloat(
      document.getElementById("grvBillPaymentAmount")?.value || "0",
    ),
    date = document.getElementById("grvBillPaymentDate")?.value || "";
  if (!card || !date || !Number.isFinite(amount) || amount <= 0)
    return toast("Enter a valid payment date and amount", true);
  if (amount > total + 0.01)
    return toast("Payment cannot exceed the statement total", true);
  if (amount < total - 0.01)
    return toast(
      "Partial payment is not enabled in the Pay Bill workflow yet. Pay the full statement for now.",
      true,
      6000,
    );
  const cfg = cardConfig.find((c) => c.card === card),
    cycle = cfg ? getCardCycle(cfg, grvBillsRef || new Date()).last : null,
    ids = (() => {
      try { return JSON.parse(modal.dataset.ids || "[]"); } catch (_) { return []; }
    })();
  if (cycle && cycle.end >= new Date(new Date().setHours(0, 0, 0, 0)))
    return toast(`This statement has not closed yet. Payment is available after ${cycle.end.getDate()} ${MONTHS[cycle.end.getMonth()]} ${cycle.end.getFullYear()}.`, true, 6000);
  const selectedRows = ids
    .map((id) => cardTxns.find((t) => String(t.id) === String(id)))
    .filter(Boolean),
    unpaidRows = selectedRows.filter((t) => String(t.status || "").toUpperCase() === "UNPAID"),
    unpaidTotal = unpaidRows.reduce((sum, t) => sum + (+t.amount || 0), 0),
    statementMatch = grvStatementMatches[`${card}|${cycle ? `${cycle.billingYear}-${cycle.billingMonth + 1}` : ""}`];
  if (!ids.length || !unpaidRows.length)
    return toast("No UNPAID transactions found for this statement", true);
  if (Math.abs(unpaidTotal - total) >= 0.01)
    return toast("Statement data changed. Refresh Bills and try again.", true, 6000);
  if (statementMatch == null || Math.abs((+statementMatch || 0) - total) >= 0.01)
    return toast("Enter the actual bank bill and make sure it matches the statement total before paying.", true, 6000);
  window.__grvActionBusy = true;
  const saveBtn = document.getElementById("saveGrvBillPaymentBtn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("btn-loading");
    saveBtn.textContent = "Saving…";
  }
  try {
    const desc = `${card} bill payment | Statement ${modal.dataset.cycleStart || ""} – ${modal.dataset.cycleEnd || ""} | My share ${money(+(modal.dataset.myShare || 0))} | Others ${money(+(modal.dataset.othersShare || 0))}`;
    const res = await fetch(
      apiUrl(
        `action=payBill&card=${enc(card)}&ids=${enc(ids.join(","))}&paymentDate=${enc(date)}&paymentAmount=${amount}&description=${enc(desc)}`,
      ),
    );
    const text = await res.text();
    if (text !== "Paid") throw new Error(text);
    closeGrvBillPayment();
    await Promise.all([syncCardsFromSheet(false), syncGrvExpenseHistory()]);
    renderCards();
    renderGrvCC();
    renderGrvBills();
    toast(`✓ ${card} bill payment recorded`);
  } catch (err) {
    toast("⚠️ Bill payment failed: " + err.message, true, 6000);
    console.warn(err);
  } finally {
    window.__grvActionBusy = false;
    const b = document.getElementById("saveGrvBillPaymentBtn");
    if (b) {
      b.disabled = false;
      b.classList.remove("btn-loading");
      b.textContent = "💳 Save Payment";
    }
  }
}

async function settleGrvOwe(person) {
  if (window.__grvActionBusy)
    return toast("⏳ Another settlement is already being saved", true);
  const rows = cardTxns.filter(
    (t) =>
      String(t.status || "").toUpperCase() === "OWED" &&
      !isGrvUsedBy(t.usedBy) &&
      String(t.usedBy || "")
        .trim()
        .toLowerCase() ===
        String(person || "")
          .trim()
          .toLowerCase(),
  );
  if (!rows.length) return toast(`${person} has no OWED transactions`, true);
  const total = rows.reduce((s, t) => s + (+t.amount || 0), 0),
    date = prompt(`Settlement date (YYYY-MM-DD)`, ymdLocal(new Date()));
  if (!date) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast("Use YYYY-MM-DD", true);
  if (
    !confirm(
      `${person} paid you ${money(total)}. Mark ${rows.length} transaction(s) as SETTLED?`,
    )
  )
    return;
  window.__grvActionBusy = true;
  try {
    const desc = `${person} settled credit-card share ${money(total)}`,
      res = await fetch(
        apiUrl(
          `action=settle&person=${enc(person)}&ids=${enc(rows.map((t) => t.id).join(","))}&paymentDate=${enc(date)}&receivedAmount=${total}&description=${enc(desc)}`,
        ),
      ),
      text = await res.text();
    if (text !== "Settled") throw new Error(text);
    await Promise.all([syncCardsFromSheet(false), syncGrvExpenseHistory()]);
    renderCards();
    renderGrvCC();
    renderGrvBills();
    toast(`✓ ${person} settled ${money(total)}`);
  } catch (err) {
    toast("⚠️ Settlement failed: " + err.message, true, 6000);
    console.warn(err);
  } finally {
    window.__grvActionBusy = false;
  }
}

let grvBillsRef = null; // null = live/current cycle; otherwise reference date for selected statement month

function initGrvBillsPicker() {
  const mSel = document.getElementById("grvBillsMonth");
  const ySel = document.getElementById("grvBillsYear");
  if (!mSel || !ySel) return;
  const now = new Date();
  const years = cardTxns
    .map((t) => +String(t.txnDate || "").slice(0, 4))
    .filter(Boolean);
  const minY = Math.min(now.getFullYear(), ...(years.length ? years : [now.getFullYear()]));
  mSel.innerHTML = FULL_MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  ySel.innerHTML = "";
  for (let y = now.getFullYear() + 1; y >= minY; y--) ySel.add(new Option(y, y));
  syncGrvBillsPicker();
}

function syncGrvBillsPicker() {
  const mSel = document.getElementById("grvBillsMonth");
  const ySel = document.getElementById("grvBillsYear");
  if (!mSel || !ySel) return;
  const ref = grvBillsRef || new Date();
  const d = grvBillsRef
    ? new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    : new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  mSel.value = String(d.getMonth());
  ySel.value = String(d.getFullYear());
}

async function loadGrvBillsMonthData() {
  if (!grvBillsRef) return;
  const prefixes = new Set();
  cardConfig.forEach((cfg) => {
    const c = getCardCycle(cfg, grvBillsRef).last;
    for (
      let d = new Date(c.start.getFullYear(), c.start.getMonth(), 1);
      d <= c.end;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    ) {
      prefixes.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  });
  if (!prefixes.size) return;
  const res = await fetch(
    apiUrl(`action=getCardsByTxnMonth&txnMonth=${enc([...prefixes].join(","))}`),
  ).then((r) => r.json());
  if (!Array.isArray(res)) return;
  const fresh = res
    .map((row) => ({
      id: String(row[0] || ""),
      card: String(row[1] || ""),
      usedBy: String(row[2] || ""),
      description: String(row[3] || ""),
      txnDate: String(row[4] || ""),
      remarks: String(row[5] || ""),
      amount: parseFloat(row[6]) || 0,
      status: String(row[7] || "UNPAID"),
      billingMonth: formatBillingMonth(row[8] || ""),
    }))
    .filter((t) => t.id && t.txnDate);
  const ids = new Set(fresh.map((t) => t.id));
  cardTxns = [...cardTxns.filter((t) => !ids.has(t.id)), ...fresh];
  saveLocal();
}

async function setGrvBillsMonth() {
  const m = +(document.getElementById("grvBillsMonth")?.value ?? 0);
  const y = +(document.getElementById("grvBillsYear")?.value ?? new Date().getFullYear());
  // getCardCycle(ref).last is the month immediately before ref, so use first day of next month.
  grvBillsRef = new Date(y, m + 1, 1);
  renderGrvBills();
  try {
    await loadGrvBillsMonthData();
    renderGrvBills();
  } catch (err) {
    console.warn("GRV bills month load failed", err);
  }
}

function resetGrvBillsMonth() {
  grvBillsRef = null;
  syncGrvBillsPicker();
  renderGrvBills();
}

function renderGrvBills() {
  const grid = document.getElementById("grvBillsGrid");
  if (!grid) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ref = grvBillsRef || today;
  const isLive = !grvBillsRef;
  const cards = cardConfig
    .map((cfg) => {
      const cycles = getCardCycle(cfg, ref),
        lastRows = rowsForCycle(cfg.card, cycles.last),
        openRows = rowsForCycle(cfg.card, cycles.open),
        lastSplit = splitRows(lastRows),
        openSplit = splitRows(openRows),
        unpaid = lastRows.filter((t) => t.status === "UNPAID"),
        due = getDueInfo(cfg, cycles.last);
      return {
        cfg,
        cycles,
        lastRows,
        openRows,
        lastSplit,
        openSplit,
        unpaid,
        due,
        lastTotal: lastRows.reduce((a, t) => a + (+t.amount || 0), 0),
        openTotal: openRows.reduce((a, t) => a + (+t.amount || 0), 0),
        statementMatch: grvStatementMatches[`${cfg.card}|${cycles.last.billingYear}-${cycles.last.billingMonth + 1}`],
      };
    })
    .sort((a, b) => {
      const au = a.unpaid.reduce((s, t) => s + (+t.amount || 0), 0),
        bu = b.unpaid.reduce((s, t) => s + (+t.amount || 0), 0);
      if (!au && !bu) return a.cfg.card.localeCompare(b.cfg.card);
      if (!au) return 1;
      if (!bu) return -1;
      const ao = a.due ? a.due.days : null,
        bo = b.due ? b.due.days : null;
      if (ao !== null && ao < 0 && !(bo !== null && bo < 0)) return -1;
      if (bo !== null && bo < 0 && !(ao !== null && ao < 0)) return 1;
      if (ao !== null && bo !== null) return a.due.date - b.due.date;
      if (ao !== null) return -1;
      if (bo !== null) return 1;
      return bu - au;
    });
  const totalPay = cards.reduce(
    (a, c) => a + c.unpaid.reduce((s, t) => s + (+t.amount || 0), 0),
    0,
  );
  const dueCards = cards
    .filter((c) => c.unpaid.length && c.due)
    .sort((a, b) => a.due.date - b.due.date);
  const nearest = dueCards[0];
  renderGrvWhoOwes(cards);
  document.getElementById("grvBillsTotalPay").textContent = money(totalPay);
  document.getElementById("grvBillsNearestDue").textContent = nearest
    ? `${nearest.cfg.card} · ${nearest.due.date.getDate()} ${MONTHS[nearest.due.date.getMonth()]} ${nearest.due.date.getFullYear()}`
    : totalPay ? "No due date configured" : "Nothing due";
  grid.innerHTML =
    cards
      .map((c) => {
        const unpaidAmt = c.unpaid.reduce((a, t) => a + (+t.amount || 0), 0),
          statementClosed = c.cycles.last.end < today,
          overdue = statementClosed && !!c.due && c.due.days < 0,
          paid = !unpaidAmt,
          util = c.cfg.limit
            ? Math.min(100, (c.openTotal / c.cfg.limit) * 100)
            : 0;
        const dueText = !c.due
          ? "Due date not set"
          : overdue
            ? `Overdue by ${Math.abs(c.due.days)} days`
            : c.due.days === 0
              ? "Due today"
              : `${c.due.days} days left`;
        return `<div class="grv-bill-card ${overdue ? "grv-bill-overdue " : ""}${paid ? "grv-bill-paid" : ""}"><div class="grv-bill-head"><div><div class="grv-bill-card-name">${esc(c.cfg.card)}</div><div style="color:var(--muted);font-size:.68rem;margin-top:3px">Last statement · ${FULL_MONTHS[c.cycles.last.billingMonth]} ${c.cycles.last.billingYear}</div></div><span class="grv-bill-badge ${overdue ? "overdue" : ""}">${paid ? "All paid" : esc(dueText)}</span></div><div class="grv-bill-section"><div class="grv-bill-section-title">${isLive ? "Last statement" : statementClosed ? "Selected statement" : "Selected / open cycle"}</div><div class="grv-bill-total">${money(c.lastTotal)}</div><div class="grv-bill-unpaid">Unpaid ${money(unpaidAmt)}</div><div class="grv-bill-split"><div>My share<strong>${money(c.lastSplit.my)}</strong></div><div>Others / owed to me<strong>${money(c.lastSplit.others)}</strong></div></div><div class="grv-bill-meta"><div>Cycle<strong>${esc(formatCycleRange(c.cycles.last))}</strong></div><div>Due<strong>${c.due ? `${c.due.date.getDate()} ${MONTHS[c.due.date.getMonth()]} ${c.due.date.getFullYear()}` : "Not set"}</strong></div></div></div>${isLive ? `<div class="grv-bill-section grv-open-cycle"><div class="grv-bill-section-title">Open cycle</div><div class="grv-bill-total">${money(c.openTotal)}</div><div class="grv-bill-split"><div>My share<strong>${money(c.openSplit.my)}</strong></div><div>Others / owed to me<strong>${money(c.openSplit.others)}</strong></div></div><div class="grv-bill-meta"><div>Closes<strong>${c.cycles.open.end.getDate()} ${MONTHS[c.cycles.open.end.getMonth()]} ${c.cycles.open.end.getFullYear()}</strong></div><div>Days to close<strong>${Math.max(0, Math.ceil((c.cycles.open.end - today) / 86400000))}</strong></div></div></div>` : ""}${c.cfg.limit ? `<div class="grv-bill-util"><div class="grv-bill-util-label"><span>Card utilisation</span><b>${util.toFixed(0)}% · ${money(c.openTotal)} / ${money(c.cfg.limit)}</b></div><div class="grv-bill-util-track"><div class="grv-bill-util-bar" style="width:${util}%"></div></div></div>` : ""}${statementClosed ? `<div class="grv-statement-match"><div class="grv-actual-bill-head"><span>Actual bank bill</span><strong>${c.statementMatch != null ? money(c.statementMatch) : "Not entered"}</strong></div><div class="grv-actual-bill-row"><input type="number" min="0" step="0.01" placeholder="Enter actual bank bill" value="${c.statementMatch != null ? esc(c.statementMatch) : ""}" onchange="setGrvStatementMatch(${JSON.stringify(c.cfg.card)},this.value)"><span class="grv-match-result ${c.statementMatch == null ? "neutral" : Math.abs((+c.statementMatch || 0) - c.lastTotal) < 0.01 ? "ok" : "bad"}">${c.statementMatch == null ? "Enter bank amount" : Math.abs((+c.statementMatch || 0) - c.lastTotal) < 0.01 ? "✓ Match" : "⚠ Difference " + money((+c.statementMatch || 0) - c.lastTotal)}</span></div></div><div class="grv-bill-actions"><button class="grv-bill-mark grv-bill-pay-primary" ${!unpaidAmt || c.statementMatch == null || Math.abs((+c.statementMatch || 0) - c.lastTotal) >= 0.01 ? "disabled" : ""} onclick='openGrvBillPayment(${JSON.stringify(c.cfg.card)},${JSON.stringify(formatCycleRange(c.cycles.last).split(" – ")[0])},${JSON.stringify(formatCycleRange(c.cycles.last).split(" – ")[1])},${c.unpaid.reduce((s, t) => s + (+t.amount || 0), 0)},${c.unpaid.filter((t) => isGrvUsedBy(t.usedBy)).reduce((s, t) => s + (+t.amount || 0), 0)},${c.unpaid.filter((t) => !isGrvUsedBy(t.usedBy)).reduce((s, t) => s + (+t.amount || 0), 0)},${JSON.stringify(c.unpaid.map((t) => t.id))})'>💳 Record Bill Payment</button></div>` : `<div class="grv-statement-match grv-statement-pending"><div class="grv-actual-bill-head"><span>Actual bank bill</span><strong>Available after statement closes</strong></div><div class="grv-actual-bill-row"><span class="grv-match-result neutral">Statement closes ${c.cycles.last.end.getDate()} ${MONTHS[c.cycles.last.end.getMonth()]}</span></div></div>`}</div>`;
      })
      .join("") ||
    '<div class="grv-empty-analysis">No card configuration found.</div>';
}
function openGrvBills() {
  const modal = document.getElementById("grvBillsModal");
  if (!modal) return;
  modal.style.display = "block";
  const grid = document.getElementById("grvBillsGrid");
  if (grid)
    grid.innerHTML = Array.from(
      { length: Math.max(2, Math.min(6, cardConfig.length || 2)) },
      () =>
        `<div class="grv-bill-skeleton"><span></span><i></i><i></i><i></i></div>`,
    ).join("");
  initGrvBillsPicker();
  renderGrvBills();
  syncCardsFromSheet(false)
    .then(() => {
      renderGrvBills();
      renderGrvCC();
    })
    .catch(() => {});
}
function closeGrvBills() {
  const modal = document.getElementById("grvBillsModal");
  if (modal) modal.style.display = "none";
}
let editingGrvCardKey = null;

function openGrvCardConfig(cardKey = null) {
  const modal = document.getElementById("grvCardConfigModal");
  if (!modal) return;
  editingGrvCardKey = cardKey || null;
  [
    "newCardBank",
    "newCardName",
    "newCardNumberCvv",
    "newCardExpDate",
    "newCardCutoff",
    "newCardLimit",
    "newCardDueDay",
    "newCardDueOffset",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const title = document.getElementById("grvCardConfigTitle"),
    save = document.getElementById("saveGrvCardConfigBtn"),
    sub = title?.parentElement?.querySelector(".grv-card-dialog-sub");
  if (editingGrvCardKey) {
    const cfg = cardConfig.find((c) => c.card === editingGrvCardKey);
    if (!cfg) {
      editingGrvCardKey = null;
      return openGrvCardConfig();
    }
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v ?? "";
    };
    set("newCardName", cfg.card);
    set("newCardCutoff", +cfg.cutoff || 0);
    set("newCardLimit", +cfg.limit || 0);
    set("newCardDueDay", +cfg.dueDay || 0);
    set("newCardDueOffset", +cfg.dueMonthOffset || 0);
    if (title) title.textContent = "✏️ Edit Card";
    if (save) save.textContent = "Update Card";
    if (sub)
      sub.textContent =
        "Update billing details here. Leave card number/CVV fields blank to keep existing CC Master details.";
  } else {
    if (title) title.textContent = "＋ Add New Card";
    if (save) save.textContent = "Save Card";
    if (sub)
      sub.textContent =
        "These details are saved to CardConfig and used by Credit Cards + Bills.";
  }
  modal.style.display = "block";
  setTimeout(() => document.getElementById("newCardName")?.focus(), 50);
}
function closeGrvCardConfig() {
  const modal = document.getElementById("grvCardConfigModal");
  if (modal) modal.style.display = "none";
  editingGrvCardKey = null;
}
async function saveGrvCardConfig() {
  const bank = String(
    document.getElementById("newCardBank")?.value || "",
  ).trim();
  const name = String(
    document.getElementById("newCardName")?.value || "",
  ).trim();
  const oldCardKey = editingGrvCardKey;
  const numberCvv = String(
    document.getElementById("newCardNumberCvv")?.value || "",
  ).trim();
  const expDate = String(
    document.getElementById("newCardExpDate")?.value || "",
  ).trim();
  const cutoffRaw = document.getElementById("newCardCutoff")?.value;
  const limitRaw = document.getElementById("newCardLimit")?.value;
  const dueDayRaw = document.getElementById("newCardDueDay")?.value;
  const dueOffsetRaw = document.getElementById("newCardDueOffset")?.value;
  const cutoff = cutoffRaw === "" ? 0 : parseInt(cutoffRaw, 10),
    limit = limitRaw === "" ? 0 : parseFloat(limitRaw),
    dueDay = dueDayRaw === "" ? 0 : parseInt(dueDayRaw, 10),
    dueMonthOffset = dueOffsetRaw === "" ? 0 : parseInt(dueOffsetRaw, 10);
  if (!name) return toast("Credit card name is required", true);
  if (!oldCardKey && !bank) return toast("Bank name is required", true);
  if (!oldCardKey && !numberCvv)
    return toast("Card number / CVV is required", true);
  if (!oldCardKey && !expDate) return toast("Expiry date is required", true);
  if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 31)
    return toast("Cutoff must be 0–31", true);
  if (!Number.isFinite(limit) || limit < 0)
    return toast("Credit limit is invalid", true);
  if (!Number.isInteger(dueDay) || dueDay < 0 || dueDay > 31)
    return toast("Due day must be 0–31", true);
  if (
    !Number.isInteger(dueMonthOffset) ||
    dueMonthOffset < 0 ||
    dueMonthOffset > 12
  )
    return toast("Due month offset is invalid", true);
  const normalized = numberCvv.replace(/\s+/g, "");
  const number = (normalized.split("/")[0] || "").trim();
  if (numberCvv && !/^\d{12,19}(?:\/\d{3,4})?$/.test(normalized))
    return toast("Enter card number once, optionally followed by / CVV", true);
  if (numberCvv && !/^\d{12,19}$/.test(number))
    return toast("Invalid card number", true);
  const existing = oldCardKey
    ? cardConfig.find((c) => c.card === oldCardKey)
    : cardConfig.find((c) => c.card.toLowerCase() === name.toLowerCase());
  if (!existing && oldCardKey) return toast("Card no longer exists", true);
  if (!oldCardKey && existing)
    return toast("A card with this name already exists", true);
  const cfg = {
    card: existing ? existing.card : name,
    cutoff,
    limit,
    dueDay,
    dueMonthOffset,
  };
  saveLocal();
  try {
    const res = await fetch(
      apiUrl(
        `action=upsertCardConfig&oldCard=${enc(oldCardKey || "")}&card=${enc(cfg.card)}&cutoff=${cfg.cutoff}&limit=${cfg.limit}&dueDay=${cfg.dueDay}&dueMonthOffset=${cfg.dueMonthOffset}&bank=${enc(bank)}&number=${enc(number)}&numberCvv=${enc(numberCvv)}&expDate=${enc(expDate)}`,
      ),
    );
    const text = await res.text();
    if (!/^(?:Added|Updated|OK)/.test(text)) throw new Error(text);
    cardConfig = existing
      ? cardConfig.map((c) => (c === existing ? cfg : c))
      : [...cardConfig, cfg];
    saveLocal();
    populateCardDropdown();
    populateGrvCardDropdown();
    renderCards();
    renderGrvCC();
    renderGrvBills();
    closeGrvCardConfig();
    toast(existing ? `✓ ${cfg.card} updated` : `✓ ${cfg.card} added`);
    return;
  } catch (err) {
    if (existing)
      cardConfig = cardConfig.map((c) => (c === existing ? cfg : c));
    else cardConfig = cardConfig.filter((c) => c !== cfg);
    saveLocal();
    toast("⚠️ Card was not saved to Sheet", true, 5000);
    console.warn("CardConfig save error", err);
  }
}

function openGrvManageCards() {
  const modal = document.getElementById("grvManageCardsModal");
  if (!modal) return;
  renderGrvManageCards();
  modal.style.display = "block";
}
function closeGrvManageCards() {
  const modal = document.getElementById("grvManageCardsModal");
  if (modal) modal.style.display = "none";
}
function renderGrvManageCards() {
  const body = document.getElementById("grvManageCardsBody");
  if (!body) return;
  if (!cardConfig.length) {
    body.innerHTML =
      '<div class="grv-empty-analysis">No cards configured yet.</div>';
    return;
  }
  body.innerHTML = cardConfig
    .map(
      (c) =>
        `<div class="grv-manage-card-row"><div><div class="grv-manage-card-name">${esc(c.card)}</div><div class="grv-manage-card-meta">Cutoff ${+c.cutoff || 0} · Limit ${money(c.limit)} · Due ${+c.dueDay || 0 ? `${+c.dueDay}/${+c.dueMonthOffset || 0}` : "Not set"}</div></div><div class="grv-manage-actions"><button type="button" class="grv-manage-edit" onclick='openGrvCardConfig(${JSON.stringify(c.card)})'>✏️ Edit</button><button type="button" class="grv-manage-delete" onclick='deleteGrvCardConfig(${JSON.stringify(c.card)})'>🗑 Delete</button></div></div>`,
    )
    .join("");
}
async function deleteGrvCardConfig(card) {
  const cfg = cardConfig.find((c) => c.card === card);
  if (!cfg) return;
  if (
    !confirm(
      `Delete ${card} from CardConfig and CC Master? Existing transactions will NOT be deleted.`,
    )
  )
    return;
  try {
    const res = await fetch(
      apiUrl(`action=deleteCardConfig&card=${enc(card)}`),
    );
    const text = await res.text();
    if (!text.startsWith("Deleted")) throw new Error(text);
    cardConfig = cardConfig.filter((c) => c.card !== card);
    saveLocal();
    populateCardDropdown();
    populateGrvCardDropdown();
    renderCards();
    renderGrvCC();
    renderGrvBills();
    renderGrvManageCards();
    toast(`✓ ${card} deleted. Transactions kept safe.`);
  } catch (err) {
    toast("⚠️ Card delete failed", true, 5000);
    console.warn("Card delete error", err);
  }
}

function addInCreditCards() {
  switchTab("cards");
  setTimeout(() => {
    const el = document.getElementById("cardUsedBy");
    if (el) {
      el.value = "GRV";
      el.focus();
    }
  }, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SWEETIE TRACKER SECTION ─────────────────────────────────────────────────
// Consolidated list across ALL months. Remaining balance is always computed
// chronologically (oldest -> newest), independent of how the table is sorted
// or filtered for display.
// CREDIT/SAVING add to balance, DEBIT subtracts.
// ═══════════════════════════════════════════════════════════════════════════════

// Compute running balance in true chronological order, return map id -> remaining
function computeSweetieRunningBalance(list) {
  const chrono = [...list].sort((a, b) => {
    const ad = new Date(a.date),
      bd = new Date(b.date);
    if (ad - bd !== 0) return ad - bd;
    // Tie-break: entry added first (lower numeric id/timestamp) comes first chronologically
    return String(a.id) > String(b.id) ? 1 : -1;
  });
  let running = 0;
  const balanceMap = new Map();
  chrono.forEach((t) => {
    const signedAmt =
      t.type === "DEBIT" ? -Math.abs(t.amount) : Math.abs(t.amount);
    running += signedAmt;
    balanceMap.set(t.id, running);
  });
  return { balanceMap, finalBalance: running };
}

function populateSweetieMonthFilter() {
  const sel = document.getElementById("sweetieMonthFilter");
  if (!sel) return;
  const current = sel.value;
  const monthsSet = new Set();
  sweetieTxns.forEach((t) => {
    if (!t.date) return;
    const d = new Date(t.date);
    if (isNaN(d)) return;
    monthsSet.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  });
  const sortedMonths = [...monthsSet].sort().reverse();
  sel.innerHTML = '<option value="ALL">All Months</option>';
  sortedMonths.forEach((key) => {
    const [y, m] = key.split("-").map(Number);
    const label = `${MONTHS[m - 1]} ${y}`;
    const o = document.createElement("option");
    o.value = key;
    o.text = label;
    sel.appendChild(o);
  });
  if (current && [...sel.options].some((o) => o.value === current))
    sel.value = current;
}

function renderSweetie() {
  // Always compute the running balance over the FULL consolidated list first —
  // filters/search/sort below only affect what's displayed, never the math.
  const { balanceMap, finalBalance } =
    computeSweetieRunningBalance(sweetieTxns);

  // Stats (always over full list, not just filtered view)
  const totalSaved = sweetieTxns
    .filter((t) => t.type === "SAVING" || t.type === "CREDIT")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSpent = sweetieTxns
    .filter((t) => t.type === "DEBIT")
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const balEl = document.getElementById("sweetieStatBalance");
  const savedEl = document.getElementById("sweetieStatSaved");
  const spentEl = document.getElementById("sweetieStatSpent");
  if (balEl) balEl.textContent = money(finalBalance);
  if (savedEl) savedEl.textContent = money(totalSaved);
  if (spentEl) spentEl.textContent = money(totalSpent);

  populateSweetieMonthFilter();

  // Range label
  const rangeEl = document.getElementById("sweetieRangeLabel");
  if (rangeEl) {
    const monthSelEl = document.getElementById("sweetieMonthFilter");
    const monthSel = monthSelEl ? monthSelEl.value : "ALL";
    if (monthSel === "ALL") {
      rangeEl.textContent = `All time (${sweetieTxns.length} entries)`;
    } else {
      const [y, m] = monthSel.split("-").map(Number);
      rangeEl.textContent = `${MONTHS[m - 1]} ${y}`;
    }
  }

  // Apply month filter
  const monthSelEl = document.getElementById("sweetieMonthFilter");
  const monthFilterVal = monthSelEl ? monthSelEl.value : "ALL";
  let rows = sweetieTxns;
  if (monthFilterVal !== "ALL") {
    const [fy, fm] = monthFilterVal.split("-").map(Number);
    rows = rows.filter((t) => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d.getFullYear() === fy && d.getMonth() === fm - 1;
    });
  }

  // Apply search + date range filters
  const searchEl = document.getElementById("sweetieSearchBox");
  sweetieSearch = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const sweetieDateFrom =
    (document.getElementById("sweetieDateFrom") || {}).value || "";
  const sweetieDateTo =
    (document.getElementById("sweetieDateTo") || {}).value || "";

  const filtered = rows.filter((t) => {
    const matchSearch =
      !sweetieSearch ||
      (t.description || "").toLowerCase().includes(sweetieSearch) ||
      (t.type || "").toLowerCase().includes(sweetieSearch) ||
      String(t.amount).includes(sweetieSearch);
    const matchFrom = !sweetieDateFrom || (t.date || "") >= sweetieDateFrom;
    const matchTo = !sweetieDateTo || (t.date || "") <= sweetieDateTo;
    return matchSearch && matchFrom && matchTo;
  });

  // Update sort header arrows
  ["date", "type", "amount"].forEach((col) => {
    const th = document.getElementById("swTh_" + col);
    if (!th) return;
    th.querySelector(".sort-arrow").textContent =
      sweetieSort.col === col
        ? sweetieSort.dir === "asc"
          ? " ↑"
          : " ↓"
        : " ↕";
  });

  const tbody = document.getElementById("sweetieTableBody");
  const emptyEl = document.getElementById("sweetieEmptyMessage");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    emptyEl.style.display = "block";
    emptyEl.textContent = sweetieSearch
      ? `No results for "${sweetieSearch}"`
      : "✨ No sweetie transactions found";
    document.getElementById("sweetieRowCount").textContent = "0 entries";
    return;
  }
  emptyEl.style.display = "none";
  document.getElementById("sweetieRowCount").textContent = sweetieSearch
    ? `${filtered.length} of ${rows.length} entries`
    : `${rows.length} entries`;

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sweetieSort.col],
      bv = b[sweetieSort.col];
    if (sweetieSort.col === "amount") {
      av = +av;
      bv = +bv;
    } else if (sweetieSort.col === "date") {
      av = new Date(a.date).getTime() || 0;
      bv = new Date(b.date).getTime() || 0;
    } else {
      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
    }
    if (av < bv) return sweetieSort.dir === "asc" ? -1 : 1;
    if (av > bv) return sweetieSort.dir === "asc" ? 1 : -1;
    // Tie-break: most recently added entry shows first (matches "last transaction on top")
    return String(b.id) > String(a.id) ? 1 : -1;
  });

  sorted.forEach((t) => {
    const tr = tbody.insertRow();
    const remaining = balanceMap.get(t.id) ?? 0;
    const isDebit = t.type === "DEBIT";
    const sign = isDebit ? "-" : "+";

    tr.insertCell(0).textContent = formatDisplayDate(t.date);

    const typeCell = tr.insertCell(1);
    const typeBadgeClass =
      t.type === "SAVING"
        ? "badge-paid"
        : t.type === "CREDIT"
          ? "badge-paid"
          : "badge-unpaid";
    typeCell.innerHTML = `<span class="status-badge ${typeBadgeClass}">${t.type === "CREDIT" ? "↑ " : t.type === "DEBIT" ? "↓ " : "• "}${t.type}</span>`;

    const amtCell = tr.insertCell(2);
    amtCell.innerHTML = `<span class="table-data-pill table-amount-pill ${isDebit ? "table-negative-pill" : "table-positive-pill"}">${sign}${money(Math.abs(t.amount))}</span>`;
    amtCell.className = isDebit ? "txn-amount txn-amount-out" : "txn-amount txn-amount-in";

    const remCell = tr.insertCell(3);
    remCell.textContent = money(remaining);
    remCell.style.color = "var(--accent)";
    remCell.style.fontWeight = "500";

    tr.insertCell(4).innerHTML =
      `<span class="table-data-pill table-text-pill">${esc(t.description || "—")}</span>`;

    const actCell = tr.insertCell(5);
    actCell.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "edit-btn";
    editBtn.title = "Edit";
    editBtn.style.marginRight = "4px";
    editBtn.onclick = () => startEditSweetie(t.id);
    const cloneBtn = document.createElement("button");
    cloneBtn.textContent = "⧉";
    cloneBtn.className = "clone-btn";
    cloneBtn.title = "Clone";
    cloneBtn.style.marginRight = "4px";
    cloneBtn.onclick = () => cloneSweetie(t.id);
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.className = "delete-btn";
    delBtn.title = "Delete";
    delBtn.onclick = () => deleteSweetieEntry(t.id);
    actCell.appendChild(editBtn);
    actCell.appendChild(cloneBtn);
    actCell.appendChild(delBtn);
  });
}

function sortSweetie(col) {
  if (sweetieSort.col === col)
    sweetieSort.dir = sweetieSort.dir === "asc" ? "desc" : "asc";
  else {
    sweetieSort.col = col;
    sweetieSort.dir = col === "amount" ? "desc" : "asc";
  }
  renderSweetie();
}

function startEditSweetie(id) {
  const t = sweetieTxns.find((t) => t.id === id);
  if (!t) return;
  editingSweetieId = id;
  document.getElementById("sweetieType").value = t.type;
  document.getElementById("sweetieAmount").value = Math.abs(t.amount);
  document.getElementById("sweetieDate").value = t.date;
  document.getElementById("sweetieDesc").value = t.description || "";
  document.getElementById("addSweetieBtn").textContent = "💾 Update Entry";
  document.getElementById("addSweetieBtn").style.background = "#fbbf24";
  document.getElementById("cancelSweetieEditBtn").style.display = "block";
  renderSweetie();
  document
    .getElementById("sweetieAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditSweetie() {
  editingSweetieId = null;
  document.getElementById("sweetieAmount").value = "";
  document.getElementById("sweetieDesc").value = "";
  document.getElementById("addSweetieBtn").textContent = "➕ Add Entry";
  document.getElementById("addSweetieBtn").style.background = "";
  document.getElementById("addSweetieBtn").style.color = "";
  document.getElementById("cancelSweetieEditBtn").style.display = "none";
  document.getElementById("cancelSweetieEditBtn").textContent = "✕ Cancel Edit";
  renderSweetie();
}

function cloneSweetie(id) {
  const t = sweetieTxns.find((t) => t.id === id);
  if (!t) return;
  // Fill form just like edit, but with today's date — saving creates a NEW entry
  document.getElementById("sweetieType").value = t.type;
  document.getElementById("sweetieAmount").value = Math.abs(t.amount);
  document.getElementById("sweetieDate").value = localDateStr(new Date());
  document.getElementById("sweetieDesc").value = t.description || "";
  editingSweetieId = null;
  document.getElementById("addSweetieBtn").textContent = "⧉ Save Clone";
  document.getElementById("addSweetieBtn").style.background = "#34d399";
  document.getElementById("addSweetieBtn").style.color = "#0b0b10";
  document.getElementById("cancelSweetieEditBtn").style.display = "block";
  document.getElementById("cancelSweetieEditBtn").textContent =
    "✕ Cancel Clone";
  toast("Edit details then click Save Clone", false, 3000);
  document
    .getElementById("sweetieAmount")
    .scrollIntoView({ behavior: "smooth", block: "center" });
}

function addSweetieEntry() {
  const type = document.getElementById("sweetieType").value;
  const rawAmt = document.getElementById("sweetieAmount").value;
  const date = document.getElementById("sweetieDate").value;
  const desc = document.getElementById("sweetieDesc").value.trim();

  if (!type || !date || !rawAmt)
    return toast("Type, date & amount required", true);
  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount <= 0) return toast("Enter a valid amount", true);

  if (editingSweetieId) {
    // ── UPDATE MODE ──
    const updEntry = {
      id: editingSweetieId,
      type,
      amount,
      date,
      description: desc,
    };
    sweetieTxns = sweetieTxns.filter((t) => t.id !== editingSweetieId);
    sweetieTxns.push(updEntry);
    saveLocal();
    sheetWrite(apiUrl(`action=deleteSweetie&id=${editingSweetieId}`));
    sheetWrite(
      apiUrl(
        `action=addSweetie&id=${updEntry.id}&type=${enc(updEntry.type)}&amount=${updEntry.amount}&date=${enc(updEntry.date)}&description=${enc(updEntry.description)}`,
      ),
    );
    cancelEditSweetie();
    toast("Sweetie entry updated ✓");
    return;
  }

  const entry = {
    id: Date.now().toString(),
    type,
    amount,
    date,
    description: desc,
  };

  sweetieTxns.push(entry);
  saveLocal();
  renderSweetie();
  toast("Sweetie entry added ✓");

  document.getElementById("sweetieAmount").value = "";
  document.getElementById("sweetieDesc").value = "";
  document.getElementById("addSweetieBtn").textContent = "➕ Add Entry";
  document.getElementById("addSweetieBtn").style.background = "";
  document.getElementById("addSweetieBtn").style.color = "";
  document.getElementById("cancelSweetieEditBtn").style.display = "none";
  document.getElementById("cancelSweetieEditBtn").textContent = "✕ Cancel Edit";

  sheetWrite(
    apiUrl(
      `action=addSweetie&id=${entry.id}&type=${enc(entry.type)}&amount=${entry.amount}&date=${enc(entry.date)}&description=${enc(entry.description)}`,
    ),
  );
}

function deleteSweetieEntry(id) {
  if (!confirm("Delete this sweetie entry? This cannot be undone.")) return;
  sweetieTxns = sweetieTxns.filter((t) => t.id !== id);
  saveLocal();
  renderSweetie();
  toast("Deleted ✓");
  sheetWrite(apiUrl(`action=deleteSweetie&id=${id}`));
}

async function syncSweetieFromSheet(isManual = false) {
  const btn = document.getElementById("sweetieSyncBtn");
  if (isManual) {
    btn.textContent = "⏳ Syncing…";
    btn.disabled = true;
  }

  try {
    const res = await fetch(apiUrl(`action=getSweetie`)).then((r) => r.json());

    if (Array.isArray(res)) {
      const fromSheet = res
        .map((row) => ({
          id: String(row[0] || "").trim(),
          type: String(row[1] || "").trim(),
          amount: parseFloat(row[2]) || 0,
          remaining: parseFloat(row[3]) || 0, // pre-calculated by server, passbook style
          date: String(row[4] || "").trim(),
          description: String(row[5] || ""),
        }))
        .filter((t) => t.id && t.type && t.date);

      // Safety guard — never wipe local data if sheet returns empty unexpectedly
      if (fromSheet.length === 0 && sweetieTxns.length > 0) {
        if (isManual)
          toast(
            `⚠️ Sheet empty — kept ${sweetieTxns.length} local entries`,
            true,
            4000,
          );
      } else {
        sweetieTxns = fromSheet;
      }
    }

    saveLocal();
    renderSweetie();
    markLastSynced("lastSyncedSweetie");
    if (isManual) toast("Sweetie synced ✓");
  } catch (err) {
    console.error("Sweetie sync error:", err);
    if (isManual) toast("⚠️ Sweetie sync failed — showing local data", true);
    renderSweetie();
  } finally {
    if (isManual) {
      btn.textContent = "🔄 Sync Sweetie";
      btn.disabled = false;
    }
  }
}
