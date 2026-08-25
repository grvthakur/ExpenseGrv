// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE =
  "https://script.google.com/macros/s/AKfycbyK0A2BRusRFnxuhVtKNAz1BUrPia5-AKJgGNodIOMjxQrbGYSPDxn7lJBsVrvh4F-c/exec";

function apiUrl(params) {
  return `${API_BASE}?${params}&_=${Date.now()}`;
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
let cardConfig = []; // [{card, cutoff, limit}]
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
function toast(msg, err = false, duration = 3000) {
  const el = document.getElementById("toastMsg");
  el.textContent = msg;
  el.style.background = err ? "#f87171" : "#34d399";
  el.style.color = err ? "#fff" : "#0b0b10";
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), duration);
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
    if (g) cardConfig = JSON.parse(g);
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
  const secExpenses = document.getElementById("expenseSection");
  const secCards = document.getElementById("cardSection");
  const secSweetie = document.getElementById("sweetieSection");

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
  if (secExpenses) secExpenses.style.display = tab === "expenses" ? "" : "none";
  if (secCards) secCards.style.display = tab === "cards" ? "" : "none";
  if (secSweetie) secSweetie.style.display = tab === "sweetie" ? "" : "none";

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

  document.getElementById("statTotalExpenses").textContent =
    `₹${totalExp.toFixed(2)}`;
  document.getElementById("statSalary").textContent = salary
    ? `₹${salary.toFixed(2)}`
    : "—";
  document.getElementById("statRemaining").textContent =
    `₹${remaining.toFixed(2)}`;
  document.getElementById("statSweetie").textContent =
    `₹${sweetBal.toFixed(2)}`;

  const salDisplay = document.getElementById("salaryDisplay");
  const salGroup = document.getElementById("salaryEditGroup");
  const editBtn = document.getElementById("editSalaryBtn");
  if (salary) {
    salDisplay.textContent = `₹${salary.toFixed(2)}`;
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
      `<span style="background:#1c1c28;padding:2px 8px;border-radius:20px;font-size:0.7rem">${exp.category}</span>`;
    tr.insertCell(2).textContent = exp.description || "—";
    tr.insertCell(3).textContent = `₹${exp.amount.toFixed(2)}`;
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
    if (isManual) toast(`Synced ✓ — ${fromSheet.length} entries for ${key}`);
  } catch (err) {
    console.error("Sync error:", err);
    if (isManual) toast("⚠️ Sync failed — showing local data", true);
    if (isInitial)
      toast("⚠️ Could not reach sheet — showing cached data", true);
    render();
  } finally {
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
              return ` ₹${val.toFixed(2)}  (${pct}%)`;
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
    `Total: <b>₹${totalExp.toFixed(2)}</b> &nbsp;|&nbsp; Remaining: <b>₹${(sal - totalExp).toFixed(2)}</b> &nbsp;|&nbsp; Sweetie: <b>₹${(sweetSave - sweetBorrow).toFixed(2)}</b>`;
  document.getElementById("summaryModal").style.display = "flex";
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CREDIT CARDS SECTION ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Calculate billing month from transaction date and card cutoff
function calcBillingMonth(dateStr, cutoff) {
  if (!dateStr) return billingMonthKey();
  const d = new Date(dateStr);
  const day = d.getDate();
  const co = parseInt(cutoff) || 0;
  // If cutoff missing (0), treat transaction month as billing month
  // If day <= cutoff → same month billing
  // If day > cutoff  → next month billing
  if (co === 0 || day <= co) {
    return FULL_MONTHS[d.getMonth()] + " " + d.getFullYear();
  } else {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return FULL_MONTHS[next.getMonth()] + " " + next.getFullYear();
  }
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

  document.getElementById("ccStatTotal").textContent =
    `₹${totalSpend.toFixed(2)}`;
  document.getElementById("ccStatUnpaid").textContent = `₹${unpaid.toFixed(2)}`;
  document.getElementById("ccStatPaid").textContent = `₹${paid.toFixed(2)}`;

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
    const statusBadge = `<span class="status-badge ${t.status === "PAID" ? "badge-paid" : "badge-unpaid"}">${t.status}</span>`;

    tr.insertCell(0).textContent = formatDisplayDate(t.txnDate);
    tr.insertCell(1).innerHTML =
      `<span style="background:#1c1c28;padding:2px 6px;border-radius:20px;font-size:0.68rem">${t.card}</span>`;
    tr.insertCell(2).textContent = t.usedBy || "—";
    tr.insertCell(3).textContent = t.description || "—";
    tr.insertCell(4).textContent = t.remarks || "—";
    tr.insertCell(5).textContent = `₹${t.amount.toFixed(2)}`;

    const statusCell = tr.insertCell(6);
    statusCell.innerHTML = statusBadge;
    statusCell.style.cursor = "pointer";
    statusCell.title = "Click to toggle status";
    statusCell.onclick = () => toggleCardStatus(t.id);

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
    cardTxns = cardTxns.filter((t) => t.id !== editingCardId);
    cardTxns.push(updEntry);
    saveLocal();
    sheetWrite(apiUrl(`action=deleteCard&id=${editingCardId}`));
    sheetWrite(
      apiUrl(
        `action=addCard&id=${updEntry.id}&card=${enc(updEntry.card)}&usedBy=${enc(updEntry.usedBy)}&description=${enc(updEntry.description)}&txnDate=${enc(updEntry.txnDate)}&remarks=${enc(updEntry.remarks)}&amount=${updEntry.amount}&status=${enc(updEntry.status)}&billingMonth=${enc(updEntry.billingMonth)}`,
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
        }));
      populateCardDropdown();
    }

    saveLocal();
    renderCards();
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

function openCCMaster() {
  // Reset password modal state
  document.getElementById("pwdInput").value = "";
  document.getElementById("pwdError").style.display = "none";
  document.getElementById("pwdModal").style.display = "flex";
  setTimeout(() => document.getElementById("pwdInput").focus(), 100);
}

async function submitPassword() {
  const pwd = document.getElementById("pwdInput").value.trim();
  const errEl = document.getElementById("pwdError");
  const btn = document.getElementById("pwdSubmitBtn");
  if (!pwd) {
    errEl.textContent = "Please enter a password.";
    errEl.style.display = "block";
    return;
  }

  btn.textContent = "Checking…";
  btn.disabled = true;
  errEl.style.display = "none";

  try {
    // Password is verified server-side — Apps Script checks against PropertiesService
    const res = await fetch(apiUrl(`action=getCCMaster&pwd=${enc(pwd)}`));
    const data = await res.json();

    // Code.gs always returns JSON — either {error: "..."} or an array of rows
    if (!Array.isArray(data)) {
      errEl.textContent = data.error || "Incorrect password.";
      errEl.style.display = "block";
      return;
    }

    // Correct password — close pwd modal, show CC master
    document.getElementById("pwdModal").style.display = "none";
    document.getElementById("ccMasterModal").style.display = "flex";
    renderCCMaster(data);
  } catch (err) {
    errEl.textContent = "Could not reach server. Check connection.";
    errEl.style.display = "block";
  } finally {
    btn.textContent = "Unlock →";
    btn.disabled = false;
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
  on("closePwdModalBtn", "click", () => {
    document.getElementById("pwdModal").style.display = "none";
  });
  on("pwdSubmitBtn", "click", submitPassword);
  on("pwdInput", "keydown", (e) => {
    if (e.key === "Enter") submitPassword();
  });
  on("closeCCMasterBtn", "click", () => {
    document.getElementById("ccMasterModal").style.display = "none";
    // Clear table for security — data only shown while modal is open
    document.getElementById("ccMasterBody").innerHTML =
      "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
  });
  window.addEventListener("click", (e) => {
    const pwdModal = document.getElementById("pwdModal");
    const ccModal = document.getElementById("ccMasterModal");
    if (pwdModal && e.target === pwdModal) pwdModal.style.display = "none";
    if (ccModal && e.target === ccModal) {
      ccModal.style.display = "none";
      document.getElementById("ccMasterBody").innerHTML =
        "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
    }
  });

  on("tabExpenses", "click", () => switchTab("expenses"));
  on("tabCards", "click", () => switchTab("cards"));
  on("tabSweetie", "click", () => switchTab("sweetie"));
  on("addCardBtn", "click", addCardEntry);
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
  });
  on("yearSelect", "change", () => {
    lockDatePicker();
    render();
    renderCards();
    syncFromSheet(false);
    syncCardsFromSheet(false);
  });

  // Show local data instantly — no blocking loader
  // Sync runs silently in background, updates UI when done
  syncFromSheet(false, false);
  syncCardsFromSheet(false);
  syncSweetieFromSheet(false);
  setCardStatusFilter("ALL"); // init filter button styles
  setCardMonthFilter("3"); // init month filter button styles
  populateCCCardFilter(); // init card dropdown

  setInterval(() => {
    syncFromSheet(false);
    if (activeTab === "cards") syncCardsFromSheet(false);
    if (activeTab === "sweetie") syncSweetieFromSheet(false);
  }, 60000);
});

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
  if (balEl) balEl.textContent = `₹${finalBalance.toFixed(2)}`;
  if (savedEl) savedEl.textContent = `₹${totalSaved.toFixed(2)}`;
  if (spentEl) spentEl.textContent = `₹${totalSpent.toFixed(2)}`;

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
    typeCell.innerHTML = `<span class="status-badge ${typeBadgeClass}">${t.type}</span>`;

    const amtCell = tr.insertCell(2);
    amtCell.textContent = `${sign}₹${Math.abs(t.amount).toFixed(2)}`;
    amtCell.style.color = isDebit ? "var(--danger)" : "var(--green)";
    amtCell.style.fontWeight = "600";

    const remCell = tr.insertCell(3);
    remCell.textContent = `₹${remaining.toFixed(2)}`;
    remCell.style.color = "var(--accent)";
    remCell.style.fontWeight = "500";

    tr.insertCell(4).textContent = t.description || "—";

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
