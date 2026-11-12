// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE =
  "https://script.google.com/macros/s/AKfycbxvyWFWIHKCsqA0tQs8ZsSJYROegiT7GHhVm4zA_IaWtwJrJ3VVVRVjkSvMnXZiTPAW/exec";

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
  const key = String(category || "")
    .trim()
    .toLowerCase();
  return EXPENSE_CATEGORY_TONES[key] ?? 8;
}

function normalizeCardName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCardTone(card) {
  const value = String(card || "—")
    .trim()
    .toLowerCase();
  const known = {
    "axis-flipkart": 0,
    "axis-myzone": 1,
    "icici-amazon pay": 2,
    "icici-coral": 3,
    hdfc: 4,
    sbi: 5,
    kotak: 6,
  };
  if (Object.prototype.hasOwnProperty.call(known, value)) return known[value];
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return 7 + (hash % 3);
}

function getPersonTone(name) {
  const value = String(name || "—")
    .trim()
    .toLowerCase();
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
  for (let i = 0; i < value.length; i++)
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
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
let cardMonthFilter = "1"; // "1" = current month only, "3" = last 3 months
let cardCardFilter = "ALL"; // ALL or specific card name
let selectedCardTxnIds = new Set(); // Desktop Credit Cards bulk selection
let cardUsedByFilter = "ALL"; // ALL or a normalised "used by" name

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
let grvHistoryAttempted = false; // true once the full-history fetch has finished (ok or failed)

// Sweetie tracker state
let sweetieTxns = []; // raw entries from sheet [{id,type,amount,date,description}]
let sweetieSort = { col: "date", dir: "desc" };
let editingSweetieId = null;
let sweetieSearch = "";
let sweetieMonthFilter = "ALL";

// Sweetie expense exclusions — saved in this browser
const SWEETIE_EXPENSE_EXCLUSIONS_KEY = "sweetie_expense_exclusions_v1";
let sweetieExpenseExclusions = new Set();

try {
  const savedSweetieExclusions = JSON.parse(
    localStorage.getItem(SWEETIE_EXPENSE_EXCLUSIONS_KEY) || "[]",
  );
  sweetieExpenseExclusions = new Set(savedSweetieExclusions.map(String));
} catch (e) {
  sweetieExpenseExclusions = new Set();
}

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
function grvAiLearningQuery_() {
  try {
    const pending = window.__grvAiLearningPending;
    if (!pending) return "";
    const encoded = "&aiLearning=" + enc(JSON.stringify(pending));
    window.__grvAiLearningPending = null;
    return encoded;
  } catch (_) {
    window.__grvAiLearningPending = null;
    return "";
  }
}

// ─── SHEET WRITE (fire-and-forget, no-cors) ──────────────────────────────────
// ── Pending writes: a sync that was fetched before the sheet finished saving must NOT wipe/revert local changes ──
const _pendAdd = new Map(); // id -> ts (added or updated locally, sheet may not show it yet)
const _pendDel = new Map(); // id -> ts (deleted locally, sheet may still return it)
const PEND_MS = 45000;

function _pendTouch(url) {
  try {
    const sp = new URL(url, location.href).searchParams;
    const a = sp.get("action") || "";
    const id = sp.get("id");
    const ids = sp.get("ids") ? sp.get("ids").split(",") : id ? [id] : [];
    if (!ids.length) return;
    ids.forEach((oneId) => {
      const trimmed = String(oneId).trim();
      if (!trimmed) return;
      if (/^delete/i.test(a)) {
        _pendDel.set(trimmed, Date.now());
        _pendAdd.delete(trimmed);
      } else if (/^(add|update)/i.test(a)) {
        _pendAdd.set(trimmed, Date.now());
        _pendDel.delete(trimmed);
      }
    });
  } catch (_) {}
}

function mergePending(localList, sheetList, idOf) {
  idOf = idOf || ((x) => x.id);
  const now = Date.now();
  [_pendAdd, _pendDel].forEach((m) =>
    m.forEach((t, k) => {
      if (now - t > PEND_MS) m.delete(k);
    }),
  );
  if (!_pendAdd.size && !_pendDel.size) return sheetList;
  const loc = new Map(localList.map((x) => [String(idOf(x)), x]));
  const out = sheetList
    .filter((x) => !_pendDel.has(String(idOf(x))))
    .map((x) => {
      const id = String(idOf(x));
      return _pendAdd.has(id) && loc.has(id) ? loc.get(id) : x;
    });
  const have = new Set(out.map((x) => String(idOf(x))));
  _pendAdd.forEach((_, id) => {
    if (!have.has(id) && loc.has(id) && !_pendDel.has(id))
      out.push(loc.get(id));
  });
  return out;
}

function sheetWrite(url) {
  _pendTouch(url);
  fetch(url, { mode: "no-cors" }).catch((err) => {
    console.warn("Sheet write error (data likely saved):", err);
  });
}

// Ordered writes: each request finishes before the next starts (delete -> add).
async function sheetWriteSeq(urls) {
  for (const u of urls) {
    _pendTouch(u);
    try {
      await fetch(u, { mode: "no-cors" });
    } catch (err) {
      console.warn("Sheet write error (data likely saved):", err);
    }
  }
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
  const elDeveloper = document.getElementById("tabDeveloper");
  const secDeveloper = document.getElementById("developerSection");

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
  if (elDeveloper)
    elDeveloper.classList.toggle("tab-active", tab === "developer");

  if (secExpenses) secExpenses.style.display = tab === "expenses" ? "" : "none";
  if (secCards) secCards.style.display = tab === "cards" ? "" : "none";
  if (secSweetie) secSweetie.style.display = tab === "sweetie" ? "" : "none";
  if (secGrvCC) secGrvCC.style.display = tab === "grvcc" ? "" : "none";
  if (secDeveloper)
    secDeveloper.style.display = tab === "developer" ? "" : "none";

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
  } else if (tab === "developer") {
    // Developer dashboard section is handled separately
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
  const u = document.getElementById("ccUsedByFilter");
  if (u) u.value = "ALL";
  cardUsedByFilter = "ALL";
  setCardStatusFilter("ALL");
  setCardMonthFilter("1");
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
  const selUsedBy =
    (document.getElementById("ccUsedByFilter") || {}).value || "ALL";
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
    // Used-by filter (must match what the table shows, or Mark All Paid would touch hidden rows)
    const matchUsedBy =
      selUsedBy === "ALL" || normUsedBy(t.usedBy) === selUsedBy;
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
      matchMonth &&
      matchFrom &&
      matchTo &&
      matchCard &&
      matchUsedBy &&
      matchSearch &&
      isUnpaid
    );
  });

  if (visibleUnpaid.length === 0) {
    toast("No UNPAID transactions in current view", true);
    return;
  }

  // Confirm — show exactly what will be marked
  const usedByOpt = document.getElementById("ccUsedByFilter");
  const usedByLabel =
    selUsedBy !== "ALL" && usedByOpt && usedByOpt.selectedOptions[0]
      ? usedByOpt.selectedOptions[0].text
      : "";
  const cardLabel =
    (selCard !== "ALL" ? ` for ${selCard}` : "") +
    (usedByLabel ? ` used by ${usedByLabel}` : "");
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

// ─── POPULATE CC "USED BY" FILTER DROPDOWN ───────────────────────────────────
// Names are compared case-insensitively with spaces collapsed; the first spelling seen is shown.
function normUsedBy(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function populateCCUsedByFilter() {
  const sel = document.getElementById("ccUsedByFilter");
  if (!sel) return;
  const names = new Map();
  cardTxns.forEach((t) => {
    const k = normUsedBy(t.usedBy);
    if (k && !names.has(k)) names.set(k, String(t.usedBy).trim());
  });
  const list = [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sig = list.map((e) => e[0] + "|" + e[1]).join("\n");
  if (sel.dataset.sig === sig) return; // unchanged: don't rebuild an open dropdown
  const current = sel.value;
  sel.innerHTML = '<option value="ALL">All Users</option>';
  list.forEach(([k, label]) => {
    const o = document.createElement("option");
    o.value = k;
    o.text = label;
    sel.appendChild(o);
  });
  sel.dataset.sig = sig;
  sel.value = [...sel.options].some((o) => o.value === current)
    ? current
    : "ALL";
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EXPENSES SECTION ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function isSweetieExpenseExcluded(id) {
  return sweetieExpenseExclusions.has(String(id));
}

function saveSweetieExpenseExclusions() {
  try {
    localStorage.setItem(
      SWEETIE_EXPENSE_EXCLUSIONS_KEY,
      JSON.stringify([...sweetieExpenseExclusions]),
    );
    return true;
  } catch (e) {
    console.warn("Could not save Sweetie expense exclusions:", e);
    toast("Could not save exclusion. Check browser storage.", true);
    return false;
  }
}

function toggleSweetieExpenseExclusion(id, shouldExclude) {
  const key = String(id);
  const wasExcluded = sweetieExpenseExclusions.has(key);

  if (shouldExclude) sweetieExpenseExclusions.add(key);
  else sweetieExpenseExclusions.delete(key);

  if (!saveSweetieExpenseExclusions()) {
    if (wasExcluded) sweetieExpenseExclusions.add(key);
    else sweetieExpenseExclusions.delete(key);
    return;
  }

  render();
  toast(
    shouldExclude
      ? "Sweetie entry excluded from Expenses"
      : "Sweetie entry included in Expenses",
  );
}

function renderExcludedSweetieList(excludedTransactions) {
  const scroll = document.querySelector(".expense-table-scroll");
  if (!scroll) return;

  let wrap = document.getElementById("excludedSweetieWrap");

  if (!wrap) {
    wrap = document.createElement("section");
    wrap.id = "excludedSweetieWrap";
    wrap.style.cssText =
      "display:none;margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--s1);";

    scroll.insertAdjacentElement("afterend", wrap);
  }

  wrap.innerHTML = "";

  if (!excludedTransactions.length) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "block";

  const heading = document.createElement("div");
  heading.textContent = `Excluded Sweetie Transactions (${excludedTransactions.length})`;
  heading.style.cssText =
    "font-weight:700;margin-bottom:8px;color:var(--text);font-size:.85rem;";
  wrap.appendChild(heading);

  excludedTransactions.forEach((t) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--border);flex-wrap:wrap;font-size:.8rem;";

    const details = document.createElement("div");
    details.style.cssText = "min-width:0;flex:1;";

    const description = document.createElement("div");
    description.textContent = String(t.description || "Sweetie DEBIT");
    description.style.cssText = "font-weight:600;overflow-wrap:anywhere;";

    const meta = document.createElement("div");
    meta.textContent = `${formatDisplayDate(String(t.date))} · ${money(Math.abs(Number(t.amount) || 0))}`;
    meta.style.cssText = "color:var(--muted);font-size:.72rem;margin-top:2px;";

    details.append(description, meta);

    const includeBtn = document.createElement("button");
    includeBtn.type = "button";
    includeBtn.textContent = "↩ Include Again";
    includeBtn.title = "Include this Sweetie transaction in Expenses again";
    includeBtn.style.cssText =
      "border:1px solid var(--border);border-radius:8px;background:var(--s2);color:var(--text);padding:6px 9px;cursor:pointer;white-space:nowrap;";
    includeBtn.onclick = () => toggleSweetieExpenseExclusion(t.id, false);

    row.append(details, includeBtn);
    wrap.appendChild(row);
  });
}

function render() {
  const key = monthKey();

  // Existing Expenses entries
  const normalRows = expenses.filter((e) => e.month === key);

  // Sweetie DEBIT entries are virtual; exclusions never alter the Sweetie ledger.
  const sweetieForMonth = (
    typeof sweetieTxns !== "undefined" && Array.isArray(sweetieTxns)
      ? sweetieTxns
      : []
  )
    .filter((t) => String(t.type).toUpperCase() === "DEBIT" && t.date)
    .filter((t) => {
      const [y, m] = String(t.date).split("-").map(Number);
      return (
        y &&
        m >= 1 &&
        m <= 12 &&
        `${MONTHS[m - 1]}-${String(y).slice(-2)}` === key
      );
    });

  const excludedSweetieForMonth = sweetieForMonth.filter((t) =>
    isSweetieExpenseExcluded(t.id),
  );

  renderExcludedSweetieList(excludedSweetieForMonth);

  const sweetieRows = sweetieForMonth
    .filter((t) => !isSweetieExpenseExcluded(t.id))
    .map((t) => ({
      id: `sweetie-debit-${t.id}`,
      sweetieTxnId: String(t.id),
      date: String(t.date),
      month: key,
      category: "Sweetie Borrow",
      description: String(t.description || ""),
      amount: Math.abs(Number(t.amount) || 0),
      isSweetieAuto: true,
    }));

  // Display both lists; Sweetie entries are not saved again
  const rows = [...normalRows, ...sweetieRows];

  let totalExp = 0,
    sweetSave = 0,
    sipSave = 0,
    sweetBorrow = 0,
    sweetBorrowAll = 0,
    totalReceived = 0;

  rows.forEach(({ category: cat, amount: amt }) => {
    if (cat === "Received") {
      totalReceived += amt;
    } else if (cat === "Sweetie Saving") {
      // Saving is not an expense: kept out of totalExp, still deducted from Remaining below.
      sweetSave += amt;
    } else if (cat === "Savings and Investments") {
      sipSave += amt;
    } else if (cat === "Sweetie Borrow") {
      sweetBorrow += amt;
      sweetBorrowAll += amt;
      totalExp += amt;
    } else {
      totalExp += amt;
    }
  });

  // Excluded entries remain part of the Sweetie ledger balance.
  excludedSweetieForMonth.forEach((t) => {
    sweetBorrowAll += Math.abs(Number(t.amount) || 0);
  });

  const salary = salaries[key] || 0;
  // Remaining is unchanged from before: saving still leaves cash in hand,
  // so it is deducted here even though it is no longer part of totalExp.
  const remaining =
    salary + totalReceived - (totalExp + sweetSave + sipSave - sweetBorrow);
  // Sweetie Balance = the Sweetie tab's Current Balance (running total over the whole
  // ledger). Falls back to the old this-month figure only while no ledger is loaded.
  const sweetLedger =
    typeof sweetieTxns !== "undefined" && Array.isArray(sweetieTxns)
      ? sweetieTxns
      : [];
  const sweetBal = sweetLedger.length
    ? computeSweetieRunningBalance(sweetLedger).finalBalance
    : sweetSave - sweetBorrowAll;

  const monthSaving = sweetSave + sipSave;
  // Overall saving: locally cached months (freshest) + any other months from the
  // full history once it has been loaded. Read-only; nothing is written.
  const localMonths = new Set(expenses.map((e) => e.month));
  const totalSaving = [
    ...expenses,
    ...(Array.isArray(grvExpenseHistory) ? grvExpenseHistory : []).filter(
      (e) => !localMonths.has(e.month),
    ),
  ].reduce(
    (sum, e) =>
      getGrvCategoryType(e.category) === "saving"
        ? sum + (Number(e.amount) || 0)
        : sum,
    0,
  );
  const totalSavingEl = document.getElementById("statTotalSaving");
  const monthSavingEl = document.getElementById("statMonthSaving");
  // Total Saving needs every month. Until the full history has been fetched show the
  // last known total (or "…"), never a this-month-only number that looks like a total.
  const SAVING_CACHE_KEY = "grv_total_saving_v1";
  let totalSavingText;
  if (grvExpenseHistoryLoaded || grvHistoryAttempted) {
    totalSavingText = money(totalSaving);
    if (grvExpenseHistoryLoaded) {
      try {
        localStorage.setItem(SAVING_CACHE_KEY, String(totalSaving));
      } catch (e) {}
    }
  } else {
    let cached = null;
    try {
      cached = localStorage.getItem(SAVING_CACHE_KEY);
    } catch (e) {}
    totalSavingText =
      cached !== null && cached !== "" && Number.isFinite(+cached)
        ? money(+cached)
        : "…";
  }
  if (totalSavingEl) totalSavingEl.textContent = totalSavingText;
  if (monthSavingEl) monthSavingEl.textContent = money(monthSaving);

  document.getElementById("statTotalExpenses").textContent = money(totalExp);
  document.getElementById("statSalary").textContent = salary
    ? money(salary)
    : "—";
  document.getElementById("statRemaining").textContent = money(remaining);
  // Sweetie Borrow of the month, shown next to Remaining (it is NOT deducted from Remaining).
  const borrowSubEl = document.getElementById("statBorrowSub");
  if (borrowSubEl) borrowSubEl.textContent = money(sweetBorrow);
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
    const expIncoming =
      String(exp.category || "")
        .trim()
        .toLowerCase() === "received" ||
      String(exp.category || "")
        .trim()
        .toLowerCase() === "sweetie saving";
    expAmtCell.innerHTML = `<span class="table-data-pill table-amount-pill ${expIncoming ? "table-positive-pill" : "table-negative-pill"}">${money(exp.amount)}</span>`;
    expAmtCell.className = expIncoming
      ? "txn-amount txn-amount-in"
      : "txn-amount txn-amount-out";
    const actCell = tr.insertCell(4);
    actCell.style.whiteSpace = "nowrap";

    if (exp.isSweetieAuto) {
      const sweetieLabel = document.createElement("span");
      sweetieLabel.textContent = "↳ Sweetie";
      sweetieLabel.title = "Original transaction Sweetie tab mein safe rahega";
      sweetieLabel.style.cssText =
        "display:inline-block;white-space:nowrap;margin-right:8px;line-height:28px;vertical-align:middle;";
      actCell.appendChild(sweetieLabel);

      const excludeBtn = document.createElement("button");
      excludeBtn.type = "button";
      excludeBtn.textContent = "⊖";
      excludeBtn.className = "delete-btn";

      excludeBtn.title = "Exclude from Expenses (Sweetie original safe rahega)";
      excludeBtn.setAttribute(
        "aria-label",
        "Exclude Sweetie transaction from Expenses",
      );

      excludeBtn.onclick = () => {
        if (
          confirm(
            "Exclude this virtual entry from Expenses and Summary? The original Sweetie transaction will remain unchanged.",
          )
        ) {
          toggleSweetieExpenseExclusion(exp.sweetieTxnId, true);
        }
      };

      actCell.appendChild(excludeBtn);
    } else {
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
    }
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
  if (typeof window !== "undefined" && window.__asm)
    window.__asm.startEdit("expense", id, exp);
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
  if (
    typeof window !== "undefined" &&
    window.__asm &&
    !window.__asm.canSubmit()
  )
    return;
  if (window.__addBusy) return;
  window.__addBusy = true;
  setTimeout(() => (window.__addBusy = false), 1500);
  const date = document.getElementById("expenseDate").value;
  const cat = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const rawAmt = document.getElementById("expenseAmount").value;

  if (!date || !rawAmt) return toast("Date & amount required", true);
  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount === 0)
    return toast(
      "Enter a valid amount (positive purchase or negative refund)",
      true,
    );

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
    // One atomic server update: never delete the old row before the replacement is saved.
    sheetWrite(
      apiUrl(
        `action=updateExpense&id=${enc(updEntry.id)}&date=${enc(updEntry.date)}&month=${enc(updEntry.month)}&category=${enc(updEntry.category)}&description=${enc(updEntry.description)}&amount=${updEntry.amount}${grvAiLearningQuery_()}`,
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
      `action=add&id=${entry.id}&date=${entry.date}&month=${enc(entry.month)}&category=${enc(entry.category)}&description=${enc(entry.description)}&amount=${entry.amount}${grvAiLearningQuery_()}`,
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

    const _before = JSON.stringify([expenses, salaries]);
    expenses = [
      ...expenses.filter((e) => e.month !== key),
      ...mergePending(
        expenses.filter((e) => e.month === key),
        fromSheet,
      ),
    ];

    if (Array.isArray(salRes) && salRes.length > 1) {
      salRes.slice(1).forEach((row) => {
        if (row[0]) salaries[String(row[0]).trim()] = parseFloat(row[1]) || 0;
      });
    }

    // Background poll: skip re-render when nothing changed (stops flicker)
    const _changed =
      isManual || isInitial || _before !== JSON.stringify([expenses, salaries]);
    if (_changed) {
      saveLocal();
      render();
    }
    setStatus("");
    markLastSynced("lastSyncedExpenses");
    finishInitialSkeleton();
    if (isManual) toast(`Synced ✓ — ${fromSheet.length} entries for ${key}`);
    // Total Saving needs every month: load the read-only history once, then refresh the cards.
    if (!grvExpenseHistoryLoaded && !grvExpenseHistoryLoading) {
      syncGrvExpenseHistory().catch(() => {});
    }
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
  const modal = document.getElementById("summaryModal");
  if (modal) {
    modal.style.display = "flex";
  }
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
  populateCCUsedByFilter();
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
      ? `${FULL_MONTHS[newest.m]} ${newest.y}`
      : `${MONTHS[oldest.m]} - ${MONTHS[newest.m]} ${newest.y}`;
  const rangeEl = document.getElementById("ccRangeLabel");
  if (rangeEl) rangeEl.textContent = rangeLabel;

  // Helper: check if a transaction belongs to the current billing month
  function isCurrentBillingMonth(t) {
    if (!t) return false;
    const stored = formatBillingMonth(t.billingMonth || "");
    if (stored && stored !== "—" && stored !== "") {
      if (stored.trim().toLowerCase() === bMonth.trim().toLowerCase())
        return true;
    }
    const cardNorm = normalizeCardName(t.card);
    const cfg = cardConfig.find((c) => normalizeCardName(c.card) === cardNorm);
    const calc = calcBillingMonth(t.txnDate, cfg?.cutoff || 0);
    return calc.trim().toLowerCase() === bMonth.trim().toLowerCase();
  }

  // Helper: parse transaction date safely in local time
  function parseTxnDate(dateVal) {
    if (!dateVal) return null;
    const s = String(dateVal).trim();
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const parsed = new Date(s);
    return isNaN(parsed) ? null : parsed;
  }

  // Filter table rows by month range:
  // When 1 month is selected: strictly current billing month transactions
  // When 3 months is selected: transactions within the 3-month window
  const rows = cardTxns.filter((t) => {
    if (!t) return false;
    if (monthCount === 1) {
      return isCurrentBillingMonth(t);
    }
    const d = parseTxnDate(t.txnDate);
    if (
      d &&
      last3.some(({ m, y }) => d.getMonth() === m && d.getFullYear() === y)
    ) {
      return true;
    }
    return isCurrentBillingMonth(t);
  });

  // Stats for the active view
  const totalSpend = rows.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const unpaid = rows
    .filter((t) => String(t.status || "").toUpperCase() === "UNPAID")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const paid = rows
    .filter((t) => String(t.status || "").toUpperCase() === "PAID")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  document.getElementById("ccStatTotal").textContent = money(totalSpend);
  document.getElementById("ccStatUnpaid").textContent = money(unpaid);
  document.getElementById("ccStatPaid").textContent = money(paid);

  // Per-card summary for the current billing month:
  // Shows limit, available remaining limit, total unpaid balance, and THIS MONTH's spend.
  const cardSummaryEl = document.getElementById("cardSummaryGrid");
  cardSummaryEl.innerHTML = "";

  const cardSet = new Set();
  cardConfig.forEach((c) => {
    if (c.card) cardSet.add(c.card.trim());
  });
  cardTxns.forEach((t) => {
    if (t.card) cardSet.add(t.card.trim());
  });

  let renderedCardCount = 0;
  cardSet.forEach((cardName) => {
    const cardNorm = normalizeCardName(cardName);
    const cfg = cardConfig.find((c) => normalizeCardName(c.card) === cardNorm);
    const lim = cfg ? Number(cfg.limit) || 0 : 0;
    const maxUse = lim ? Math.round(lim * 0.3) : 0;

    // Month spend for this card: strictly current billing month transactions
    const monthSpent = cardTxns
      .filter(
        (t) =>
          normalizeCardName(t.card) === cardNorm && isCurrentBillingMonth(t),
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    // Total unpaid on this card: all UNPAID rows (money owed to bank, matching CC Master)
    const totalUnpaid = cardTxns
      .filter(
        (t) =>
          normalizeCardName(t.card) === cardNorm &&
          String(t.status || "").toUpperCase() === "UNPAID",
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    // Show card if configured in Manage Cards, or if it had activity this month, or has unpaid balance
    if (cfg || monthSpent !== 0 || totalUnpaid > 0) {
      renderedCardCount++;
      const rem = lim ? Math.max(0, lim - totalUnpaid) : 0;
      const pct = maxUse
        ? Math.min(100, Math.round((totalUnpaid / maxUse) * 100))
        : 0;
      const over = maxUse && totalUnpaid > maxUse;
      const remFmt = rem.toLocaleString("en-IN", {
        minimumFractionDigits: rem % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: 2,
      });

      cardSummaryEl.innerHTML += `
        <div class="card-summary-item">
          <div class="cs-name">${esc(cfg ? cfg.card : cardName)}</div>
          <div class="cs-row"><span>Spent</span><span class="c-red">₹${monthSpent.toFixed(2)}</span></div>
          ${lim ? `<div class="cs-row"><span>Limit</span><span>₹${lim.toLocaleString("en-IN")}</span></div>` : ""}
          ${lim ? `<div class="cs-row"><span>Remaining</span><span class="c-green">₹${remFmt}</span></div>` : ""}
          ${lim ? `<div class="cs-bar-wrap"><div class="cs-bar ${over ? "cs-bar-over" : ""}" style="width:${pct}%"></div></div>` : ""}
          <div class="cs-row"><span>Unpaid</span><span class="c-pink" title="All-time unpaid: ₹${totalUnpaid.toFixed(2)}">₹${totalUnpaid.toFixed(2)}</span></div>
        </div>`;
    }
  });

  if (renderedCardCount === 0) {
    cardSummaryEl.innerHTML = `<div style="color:var(--muted);font-size:0.8rem;padding:8px 0">No card activity this billing month</div>`;
  }

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
  const selUsedByEl = document.getElementById("ccUsedByFilter");
  cardUsedByFilter = selUsedByEl ? selUsedByEl.value : "ALL";

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

    // Used-by filter
    const matchUsedBy =
      cardUsedByFilter === "ALL" || normUsedBy(t.usedBy) === cardUsedByFilter;

    // Date range filter
    const txnDate = t.txnDate || "";
    const matchFrom = !cardDateFrom || txnDate >= cardDateFrom;
    const matchTo = !cardDateTo || txnDate <= cardDateTo;

    return (
      matchSearch &&
      matchStatus &&
      matchCard &&
      matchUsedBy &&
      matchFrom &&
      matchTo
    );
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
  document.getElementById("ccRowCount").textContent =
    cardSearch || filteredCardRows.length !== rows.length
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
    if (t.status === "UNPAID") tr.classList.add("grv-unpaid-row");
    const statusBadge = `<span class="status-badge ${t.status === "PAID" ? "badge-paid" : "badge-unpaid"}">${t.status === "PAID" ? "✓ " : "! "}${t.status}</span>`;

    const isRefund =
      Number(t.amount) < 0 ||
      /REFUND OF/i.test(String(t.description || "")) ||
      /REFUND OF/i.test(String(t.remarks || ""));

    const dateCell = tr.insertCell(0);
    if (t.status === "UNPAID") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "card-row-check";
      cb.dataset.transactionId = String(t.id);
      cb.checked = selectedCardTxnIds.has(String(t.id));
      cb.setAttribute(
        "aria-label",
        "Select " + (t.description || "transaction"),
      );
      cb.onchange = () => {
        if (cb.checked) selectedCardTxnIds.add(String(t.id));
        else selectedCardTxnIds.delete(String(t.id));
        updateCardSelectionUI();
      };
      dateCell.appendChild(cb);
    }
    dateCell.appendChild(document.createTextNode(formatDisplayDate(t.txnDate)));
    tr.insertCell(1).innerHTML =
      `<span class="table-data-pill table-card-pill grv-card-tone-${getCardTone(t.card)}">${esc(t.card)}</span>`;
    tr.insertCell(2).innerHTML =
      `<span class="table-data-pill table-person-pill person-tone-${getPersonTone(t.usedBy)}">${esc(t.usedBy || "—")}</span>`;
    tr.insertCell(3).innerHTML =
      (isRefund ? `<span class="refund-badge">↩ REFUND</span>` : "") +
      `<span class="table-data-pill table-text-pill">${esc(t.description || "—")}</span>` +
      (t.remarks ? `<div class="cc-rem">${esc(t.remarks)}</div>` : "");
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
  updateCardSelectionUI();
}

// ── Desktop bulk PAID selection (visible UNPAID rows only) ──
function updateCardSelectionUI() {
  const boxes = [...document.querySelectorAll("#cardTable .card-row-check")];
  const visible = new Set(boxes.map((b) => b.dataset.transactionId));
  selectedCardTxnIds = new Set(
    [...selectedCardTxnIds].filter((id) => visible.has(id)),
  );
  const selected = [...selectedCardTxnIds]
    .map((id) => cardTxns.find((t) => String(t.id) === id))
    .filter((t) => t && t.status === "UNPAID");
  const total = selected.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalEl = document.getElementById("cardSelectedTotal");
  if (totalEl)
    totalEl.textContent = selected.length
      ? `Selected ${money(total)} (${selected.length})`
      : "";
  const btn = document.getElementById("markSelectedCardsPaidBtn");
  if (btn) {
    btn.disabled = !selected.length;
    btn.style.display = selected.length ? "" : "none";
  }
  const all = document.getElementById("cardSelectAll");
  if (all) {
    const n = boxes.filter((b) => b.checked).length;
    all.checked = boxes.length > 0 && n === boxes.length;
    all.indeterminate = n > 0 && n < boxes.length;
  }
}

function toggleSelectAllCards(checked) {
  document.querySelectorAll("#cardTable .card-row-check").forEach((cb) => {
    cb.checked = checked;
    if (checked) selectedCardTxnIds.add(cb.dataset.transactionId);
    else selectedCardTxnIds.delete(cb.dataset.transactionId);
  });
  updateCardSelectionUI();
}

async function markSelectedCardsPaid() {
  if (window.__cardBulkBusy) return;
  const selected = [...selectedCardTxnIds]
    .map((id) => cardTxns.find((t) => String(t.id) === id))
    .filter((t) => t && t.status === "UNPAID");
  if (!selected.length) return toast("No unpaid transactions selected", true);
  const total = selected.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  if (
    !confirm(
      `Mark ${selected.length} selected transactions as PAID?\n\nTotal: ${money(total)}`,
    )
  )
    return;
  const btn = document.getElementById("markSelectedCardsPaidBtn");
  window.__cardBulkBusy = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }
  try {
    const ids = selected.map((t) => String(t.id));
    const res = await fetch(
      apiUrl(
        `action=updateCardStatusBulk&ids=${enc(ids.join(","))}&status=PAID`,
      ),
    );
    const text = (await res.text()).trim();
    if (text !== "Updated") throw new Error(text || "Server did not confirm");
    selected.forEach((t) => {
      t.status = "PAID";
      selectedCardTxnIds.delete(String(t.id));
    });
    saveLocal();
    renderCards();
    if (typeof renderGrvCC === "function") renderGrvCC();
    toast(`✓ ${selected.length} transactions marked PAID`);
  } catch (err) {
    toast("Could not confirm update: " + err.message, true, 6000);
    await syncCardsFromSheet(false);
  } finally {
    window.__cardBulkBusy = false;
    if (btn) btn.textContent = "✓ Mark Selected Paid";
    updateCardSelectionUI();
  }
}

// Refund entries use a negative amount and link to an explicitly selected UNPAID purchase.
function linkRefund(refund, originalId) {
  const original = cardTxns.find((t) => String(t.id) === String(originalId));
  const refundAmount = Math.abs(Number(refund.amount) || 0);
  if (
    !original ||
    original.status !== "UNPAID" ||
    original.card !== refund.card ||
    !(refundAmount > 0) ||
    Number(original.amount) < refundAmount - 0.001
  )
    return null;

  const refundNote = `REFUND ${money(refundAmount)} (${formatDisplayDate(refund.txnDate)})`;
  original.remarks = original.remarks
    ? `${original.remarks} | ${refundNote}`
    : refundNote;
  const originalNote = `REFUND OF ${money(refundAmount)} (${formatDisplayDate(original.txnDate)})`;
  refund.remarks = refund.remarks
    ? `${refund.remarks} | ${originalNote}`
    : originalNote;

  sheetWrite(
    apiUrl(
      `action=updateCard&id=${enc(original.id)}&card=${enc(original.card)}&usedBy=${enc(original.usedBy || "")}&description=${enc(original.description || "")}&txnDate=${enc(original.txnDate)}&remarks=${enc(original.remarks)}&amount=${original.amount}&status=${enc(original.status || "UNPAID")}&billingMonth=${enc(original.billingMonth || "")}`,
    ),
  );
  return original;
}

function refundFieldSync() {
  const amountInput = document.getElementById("cardAmount");
  const field = document.getElementById("refundOfField");
  const select = document.getElementById("cardRefundOf");
  const cardSelect = document.getElementById("cardSelect");
  if (!amountInput || !field || !select || !cardSelect) return;

  const isRefund = Number.parseFloat(amountInput.value) < 0 && !editingCardId;
  field.style.display = isRefund ? "" : "none";
  if (!isRefund) {
    select.value = "";
    return;
  }

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const selectedCard = normalize(cardSelect.value);
  const keep = select.value;
  // Only show positive, unpaid purchases for the selected card. Normalize card/status
  // strings because sheet values can contain case, spacing, or hyphen differences.
  const eligible = cardTxns
    .filter(
      (t) =>
        normalize(t.card) === selectedCard &&
        String(t.status || "")
          .trim()
          .toUpperCase() === "UNPAID" &&
        Number(t.amount) > 0,
    )
    .sort((a, b) =>
      String(b.txnDate || "").localeCompare(String(a.txnDate || "")),
    );

  select.innerHTML =
    '<option value="">— Select unpaid purchase —</option>' +
    eligible
      .map((t) => {
        const who = String(t.usedBy || "—").trim();
        const desc = String(t.description || "—").trim();
        const remarks = String(t.remarks || "").trim();
        const label = `${formatDisplayDate(t.txnDate)} · ${who} · ${desc}${remarks ? ` · ${remarks}` : ""} · ${money(t.amount)}`;
        return `<option value="${esc(t.id)}">${esc(label)}</option>`;
      })
      .join("");
  if ([...select.options].some((o) => o.value === keep)) select.value = keep;
}

function initRefundField() {
  const amountInput = document.getElementById("cardAmount");
  const cardSelect = document.getElementById("cardSelect");
  if (!amountInput || !cardSelect || document.getElementById("refundOfField"))
    return;
  const amountField = amountInput.closest(".field");
  if (!amountField) return;

  const field = document.createElement("div");
  field.className = "field";
  field.id = "refundOfField";
  field.style.display = "none";
  field.innerHTML =
    '<label for="cardRefundOf">Refund of (unpaid purchase only)</label><select id="cardRefundOf"></select>';
  amountField.after(field);
  amountInput.addEventListener("input", refundFieldSync);
  cardSelect.addEventListener("change", refundFieldSync);
  field.querySelector("#cardRefundOf").addEventListener("change", () => {
    const chosen = cardTxns.find(
      (t) =>
        String(t.id) === String(field.querySelector("#cardRefundOf").value),
    );
    if (!chosen) return;
    const usedByInput = document.getElementById("cardUsedBy");
    const descInput = document.getElementById("cardDesc");
    // Populate from the linked purchase only when blank, so existing form input is preserved.
    if (usedByInput && !usedByInput.value.trim())
      usedByInput.value = chosen.usedBy || "";
    if (descInput && !descInput.value.trim())
      descInput.value = chosen.description || "Refund";
  });
  refundFieldSync();
}
document.addEventListener("DOMContentLoaded", initRefundField);

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
  if (typeof window !== "undefined" && window.__asm)
    window.__asm.startEdit("card", id, t);
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
  if (
    typeof window !== "undefined" &&
    window.__asm &&
    !window.__asm.canSubmit()
  )
    return;
  if (window.__addBusy) return;
  window.__addBusy = true;
  setTimeout(() => (window.__addBusy = false), 1500);
  const card = document.getElementById("cardSelect").value;
  const usedBy = document.getElementById("cardUsedBy").value.trim();
  const desc = document.getElementById("cardDesc").value.trim();
  const txnDate = document.getElementById("cardTxnDate").value;
  const remarks = document.getElementById("cardRemarks").value.trim();
  const rawAmt = document.getElementById("cardAmount").value;
  const status = document.getElementById("cardStatus").value;

  if (!card || !txnDate || !rawAmt)
    return toast("Card, date & amount required", true);
  const amount = Number(rawAmt);
  const refundSelect = document.getElementById("cardRefundOf");
  const refundOriginalId = refundSelect ? refundSelect.value : "";
  const isRefund = amount < 0 && !editingCardId && Boolean(refundOriginalId);

  // Purchases must be positive. Negative amounts are allowed only when the
  // user explicitly selects an eligible unpaid purchase in the refund field.
  // Editing an entry that is already a refund (negative) must stay allowed:
  // the refund-of picker is hidden in edit mode, so it can't be re-selected.
  const editingRefund =
    Boolean(editingCardId) &&
    cardTxns.some((t) => t.id === editingCardId && Number(t.amount) < 0);
  if (
    !Number.isFinite(amount) ||
    amount === 0 ||
    (amount < 0 && !isRefund && !editingRefund)
  ) {
    return toast(
      "Enter a valid amount. For a refund, select an unpaid purchase first.",
      true,
    );
  }

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
        `action=updateCard&id=${enc(updEntry.id)}&card=${enc(updEntry.card)}&usedBy=${enc(updEntry.usedBy)}&description=${enc(updEntry.description)}&txnDate=${enc(updEntry.txnDate)}&remarks=${enc(updEntry.remarks)}&amount=${updEntry.amount}&status=${enc(updEntry.status)}&billingMonth=${enc(updEntry.billingMonth)}${grvAiLearningQuery_()}`,
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

  const linkedOriginal =
    entry.amount < 0 && refundOriginalId
      ? linkRefund(entry, refundOriginalId)
      : null;
  if (entry.amount < 0 && refundOriginalId && !linkedOriginal) {
    toast(
      "Refund is greater than the selected unpaid purchase; refund added without linking",
      true,
    );
  }

  cardTxns.push(entry);
  saveLocal();
  renderCards();
  toast(
    linkedOriginal
      ? `Refund added ✓ — linked to ${linkedOriginal.description || "original purchase"}`
      : "Card entry added ✓",
  );

  document.getElementById("cardUsedBy").value = "";
  document.getElementById("cardDesc").value = "";
  document.getElementById("cardRemarks").value = "";
  document.getElementById("addCardBtn").textContent = "➕ Add Card Entry";
  document.getElementById("addCardBtn").style.background = "";
  document.getElementById("addCardBtn").style.color = "";
  document.getElementById("cancelCardEditBtn").style.display = "none";
  document.getElementById("cancelCardEditBtn").textContent = "✕ Cancel Edit";
  document.getElementById("cardAmount").value = "";
  refundFieldSync();

  sheetWrite(
    apiUrl(
      `action=addCard&id=${entry.id}&card=${enc(entry.card)}&usedBy=${enc(entry.usedBy)}&description=${enc(entry.description)}&txnDate=${enc(entry.txnDate)}&remarks=${enc(entry.remarks)}&amount=${entry.amount}&status=${enc(entry.status)}&billingMonth=${enc(entry.billingMonth)}${grvAiLearningQuery_()}`,
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

    const _cBefore = JSON.stringify([cardTxns, cardConfig]);
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
        // Replace only this transaction month's entries, merging pending writes
        cardTxns = [
          ...cardTxns.filter((t) => {
            if (!t.txnDate) return true;
            const d = new Date(t.txnDate);
            return !last3Months.some(
              ({ m, y }) => d.getMonth() === m && d.getFullYear() === y,
            );
          }),
          ...mergePending(cardTxns, fromSheet),
        ];
      }
    }

    // Always refresh card config
    if (Array.isArray(cfgRes) && cfgRes.length > 1) {
      const _oldCfg = JSON.stringify(cardConfig);
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
      if (isManual || _oldCfg !== JSON.stringify(cardConfig))
        populateCardDropdown();
    }

    if (isManual || _cBefore !== JSON.stringify([cardTxns, cardConfig])) {
      saveLocal();
      renderCards();
      if (activeTab === "grvcc") renderGrvCC();
    }
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

let ccMasterFetchPromise = null;

function fetchCCMasterData() {
  if (ccMasterFetchPromise) return ccMasterFetchPromise;
  ccMasterFetchPromise = fetch(apiUrl("action=getCCMaster"))
    .then((res) => res.json())
    .then((data) => {
      if (!Array.isArray(data))
        throw new Error(data.error || "Unable to load CC Master");
      return data;
    })
    .finally(() => {
      ccMasterFetchPromise = null;
    });
  return ccMasterFetchPromise;
}

function prefetchCCMaster() {
  // Start the request as soon as the user points/touches the CC Master button.
  // This keeps the first visible open fast without storing card data after close.
  fetchCCMasterData().catch(() => {});
}

async function openCCMaster() {
  const modal = document.getElementById("ccMasterModal");
  const container = document.getElementById("ccMasterBody");
  if (!modal || !container) return;

  // Modal ko click par turant show karo
  modal.style.display = "flex";

  // Cache available hai to loading ka wait kiye bina render karo
  if (Array.isArray(ccMasterCache)) {
    const cachedData = ccMasterCache;
    renderCCMaster(cachedData);

    // Background refresh; updated data mile to list refresh kar do
    fetchCCMasterData()
      .then((freshData) => {
        if (
          modal.style.display !== "none" &&
          JSON.stringify(freshData) !== JSON.stringify(cachedData)
        ) {
          renderCCMaster(freshData);
        }
      })
      .catch(() => {});

    return;
  }

  // Cache nahi hai to hi loading dikhao
  container.innerHTML =
    '<p style="text-align:center;color:var(--muted);padding:30px;">Loading…</p>';

  try {
    const data = await fetchCCMasterData();
    if (modal.style.display !== "none") {
      renderCCMaster(data);
    }
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

const CC_BANK_COLORS = {
  HDFC: "30,64,175",
  SBI: "14,165,233",
  KOTAK: "239,68,68",
  ICICI: "249,115,22",
  AXIS: "168,85,247",
};

function renderCCMaster(rows) {
  const container = document.getElementById("ccMasterBody");

  if (!container) return;

  if (!rows || !rows.length) {
    container.innerHTML =
      '<p style="text-align:center;color:var(--muted);padding:30px;">No entries in CC sheet</p>';
    return;
  }

  // Same month range used by the existing Credit Cards page.
  const selMonth = parseInt(document.getElementById("monthSelect")?.value);
  const selYear = parseInt(document.getElementById("yearSelect")?.value);
  const monthCount = cardMonthFilter === "1" ? 1 : 3;
  const months = [];

  for (let i = 0; i < monthCount; i++) {
    let m = selMonth - i;
    let y = selYear;

    if (m < 0) {
      m += 12;
      y -= 1;
    }

    months.push({ m, y });
  }

  // Match CC Master name to the configured card name.
  function normalizeCardName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getLimitInfo(masterName, masterBank) {
    const target = normalizeCardName(masterName);
    const bankTarget = normalizeCardName(masterBank);

    // CC Master often stores only the product name (e.g. "CORAL"),
    // while Manage Cards stores "ICICI CORAL". Match exact names first,
    // then allow a unique bank-prefixed/suffix match. Never guess if ambiguous.
    const exactMatches = cardConfig.filter(
      (c) => normalizeCardName(c.card) === target,
    );
    let candidates = exactMatches;
    if (!candidates.length) {
      candidates = cardConfig.filter((c) => {
        const configured = normalizeCardName(c.card);
        const sameProduct =
          configured.length >= 4 &&
          target.length >= 4 &&
          (configured.endsWith(target) || target.endsWith(configured));
        const sameBank =
          !bankTarget ||
          configured.startsWith(bankTarget) ||
          normalizeCardName(c.bank || "").startsWith(bankTarget);
        return sameProduct && sameBank;
      });
      // If bank prefix isn't present in config name, allow a unique product suffix.
      if (!candidates.length) {
        candidates = cardConfig.filter((c) => {
          const configured = normalizeCardName(c.card);
          return (
            configured.length >= 4 &&
            target.length >= 4 &&
            (configured.endsWith(target) || target.endsWith(configured))
          );
        });
      }
    }
    const cfg = candidates.length === 1 ? candidates[0] : null;

    // Don't pretend an unmatched/ambiguous card has a zero limit.
    if (!cfg) {
      return {
        matched: false,
        limit: 0,
        used: 0,
        available: 0,
        pct: 0,
      };
    }

    const configuredName = normalizeCardName(cfg.card);

    // Transaction rows use the Manage Cards name, not the shorter CC Master label.
    // Used limit = money still owed to the bank = every UNPAID row of this card (any month).
    // Marking a bill PAID (Record Bill Payment / Already paid) therefore frees the limit again.
    const used = cardTxns
      .filter(
        (t) =>
          normalizeCardName(t.card) === configuredName &&
          String(t.status || "").toUpperCase() === "UNPAID",
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const limit = Number(cfg.limit) || 0;
    const available = limit - used;
    const pct =
      limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;

    return { matched: true, limit, used, available, pct };
  }

  function formatLimit(value) {
    return Number(value).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    });
  }

  container.innerHTML = `
    <div class="cc-master-toolbar">
      <div class="cc-master-search-wrap">
        <span class="cc-master-search-icon">⌕</span>
        <input id="ccMasterSearch"
          class="cc-master-search"
          type="search"
          placeholder="Search bank, card name, number, expiry…"
          autocomplete="off"
          oninput="filterCCMaster(this.value)" />
        <button type="button"
          class="cc-master-search-clear"
          onclick="clearCCMasterSearch()"
          title="Clear search"
          aria-label="Clear search">×</button>
      </div>
      <div id="ccMasterSearchCount" class="cc-master-search-count">
        ${rows.length} card${rows.length === 1 ? "" : "s"}
      </div>
    </div>

    <div class="cc-card-grid">
      ${rows
        .map((row, index) => {
          const bank = String(row[0] || "").trim();
          const name = String(row[1] || "—").trim();
          const numRaw = String(row[2] || "").replace(/\s+/g, "");
          const numFmt = (numRaw.match(/.{1,4}/g) || []).join(" ");
          const numCvv = String(row[3] || "");
          const cvv = numCvv.includes("/") ? numCvv.split("/")[1].trim() : "";
          const exp = formatExpDate(row[4]);
          const bc = CC_BANK_COLORS[bank.toUpperCase()] || "34,211,238";
          const copy = `${bank} ${name}\nCard: ${numFmt}\nExp: ${exp}\nCVV: ${cvv || "—"}`;

          const searchText =
            `${bank} ${name} ${numRaw} ${numFmt} ${exp} ${cvv}`.toLowerCase();

          const info = getLimitInfo(name, bank);
          const cardId = `cc-flip-${index}`;

          const limitRows = info.matched
            ? `
            <div class="cc-limit-row">
              <span>Total Limit</span>
              <strong>${formatLimit(info.limit)}</strong>
            </div>
            <div class="cc-limit-row">
              <span>Used Limit</span>
              <strong>${formatLimit(info.used)}</strong>
            </div>
            <div class="cc-limit-row">
              <span>Available Limit</span>
              <strong>${formatLimit(info.available)}</strong>
            </div>
            <div class="cc-limit-progress">
              <div style="width:${info.pct}%"></div>
            </div>
            <div class="cc-limit-footnote">
              Usage: ${info.pct.toFixed(1)}% · Based on all UNPAID transactions (paid bills free the limit)
            </div>
          `
            : `
            <div class="cc-limit-row">
              <span>Limit details</span>
              <strong>Card name not matched</strong>
            </div>
            <div class="cc-limit-footnote">
              Add this card to Manage Cards using the same card name to show limits.
            </div>
          `;

          return `
          <div id="${cardId}"
            class="cc-card-item"
            data-cc-search="${esc(searchText)}"
            style="--bc:${bc}">

            <div class="cc-flip-inner">

              <div class="cc-flip-face cc-flip-front">
                <div class="cc-card-top">
                  <div>
                    ${
                      bank
                        ? `<span class="cc-bank-badge">${esc(bank)}</span>`
                        : ""
                    }
                    <div class="cc-card-name" style="margin-top:8px">
                      ${esc(name)}
                    </div>
                  </div>
                  <button type="button"
                    class="cc-copy-btn"
                    data-copy="${encodeURIComponent(copy)}"
                    onclick="copyCC(this)"
                    title="Copy all details">⧉ Copy</button>
                </div>

                <div class="cc-chip"></div>
                <div class="cc-num">${esc(numFmt)}</div>

                <div class="cc-card-bottom">
                  <div>
                    <div class="cc-cvv-label">CVV</div>
                    <div class="cc-cvv">${esc(cvv || "—")}</div>
                  </div>
                  <div style="text-align:right">
                    <div class="cc-cvv-label">Valid Thru</div>
                    <div class="cc-exp">${esc(exp)}</div>
                  </div>
                </div>

                <div class="cc-flip-actions">
                  <button type="button"
                    class="cc-flip-btn"
                    onclick="toggleCCMasterFlip(this)">↻ View Limits</button>
                </div>
              </div>

              <div class="cc-flip-face cc-flip-back">
                <div class="cc-flip-title">💳 ${esc(name)} — Limits</div>
                ${limitRows}

                <div class="cc-flip-actions">
                  <button type="button"
                    class="cc-flip-btn"
                    onclick="toggleCCMasterFlip(this)">↩ Back to Card</button>
                </div>
              </div>

            </div>
          </div>`;
        })
        .join("")}
    </div>`;

  enableCCMasterSwipe(container);
}

// Flip one card from button click.
function toggleCCMasterFlip(button) {
  const card = button.closest(".cc-card-item");
  if (!card) return;

  card.classList.toggle("is-flipped");
}

// Enable horizontal swipe on mobile. Register only once per container.
function enableCCMasterSwipe(container) {
  if (container.dataset.flipSwipeReady === "1") return;
  container.dataset.flipSwipeReady = "1";

  let startX = 0;
  let startY = 0;
  let startCard = null;

  container.addEventListener(
    "touchstart",
    (event) => {
      const card = event.target.closest(".cc-card-item");
      if (!card) return;

      startCard = card;
      startX = event.changedTouches[0].clientX;
      startY = event.changedTouches[0].clientY;
    },
    { passive: true },
  );

  container.addEventListener(
    "touchend",
    (event) => {
      if (!startCard) return;

      const endX = event.changedTouches[0].clientX;
      const endY = event.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;

      if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        startCard.classList.toggle("is-flipped");
      }

      startCard = null;
    },
    { passive: true },
  );
}

function filterCCMaster(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const cards = document.querySelectorAll("#ccMasterBody .cc-card-item");
  let visible = 0;
  cards.forEach((card) => {
    const match = !q || String(card.dataset.ccSearch || "").includes(q);
    card.style.display = match ? "" : "none";
    if (match) visible++;
  });
  const count = document.getElementById("ccMasterSearchCount");
  if (count)
    count.textContent = `${visible} card${visible === 1 ? "" : "s"}${q ? " found" : ""}`;
}

function clearCCMasterSearch() {
  const input = document.getElementById("ccMasterSearch");
  if (!input) return;
  input.value = "";
  filterCCMaster("");
  input.focus();
}

async function copyCC(btn) {
  const text = decodeURIComponent(btn.dataset.copy);
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  btn.textContent = "✓ Copied";
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = "⧉ Copy";
    btn.classList.remove("done");
  }, 1500);
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

// ─── DAYLIGHT THEME TOGGLE ──────────────────────────────────────────────────
// Pixel-world light/dark switch. UI by @Lattice_Node — ludion.ai/p/toggle-daylight (MIT).
// Wrapped in an IIFE so its helpers never clash with app globals.
const initDaylightToggle = (function () {
  // part.js — ESモジュール。rootの中だけを触る
  // 住人のいるスイッチ：スイッチのレールの中に、ピクセルの小さな世界があり、住人が1人暮らしている。
  //
  // 世界：低い解像度で、約20色の番号だけで描く。時刻の変化はディザの置き換えで行い、中間色を作らない。
  // 外側：なめらかな殻、窓の奥行き、液体のレンズを WebGL で描く。ピクセルは常に整数倍のまま写す。
  // 灯り：世界の光る画素をぼかした「光の場」を作り、ガラスと外の面を照らす。人影が窓を横切れば、外の光も変わる。
  // 時間：左端は昼、右端は夜。右へ動かすと 昼→夕方→夜。左へ戻すと 夜→深夜→夜明け→朝→昼 と、時間は前へ進む。
  // 色は JS に書かない。--_bg、--_surface、--_fg、--_muted、--_accent の色相を、決めた明るさで並べて作る。

  const CORE_W = 192; // 景色の中心の幅。窓が広いぶんは、両わきへ広がる
  const CORE_H = 112;
  const HORIZON = 82;
  const MARGIN = 14; // レンズが窓の外を覗いてもよいよう、世界を少し広く描く
  const WORLD_HZ = 30;
  const WORLD_SLACK = 0.004; // 画面の更新の時刻は揺れる。この秒数まで足りなくても、次のコマを出す
  const PILL_RATIO = 1.85; // 縦 : 横
  const CLOCK_DAY = 12;
  const CLOCK_NIGHT = 21.5;
  const CLOCK_SLEEP = 23.4;
  const NIGHT_CREEP = 26; // 右端に着いてから、灯りを消して眠るまでの秒数の目安

  // ---- パレット：5つのトークン × 4つの明るさ = 20色
  const RAMPS = [
    ["bg", [0.76, 0.85, 0.93, 0.985]],
    ["surface", [0.4, 0.52, 0.64, 0.76]],
    ["fg", [0.17, 0.25, 0.33, 0.44]],
    ["muted", [0.5, 0.62, 0.74, 0.86]],
    ["accent", [0.5, 0.66, 0.8, 0.92]],
  ];
  const C0 = 0,
    C1 = 1,
    C2 = 2,
    C3 = 3;
  const G0 = 4,
    G1 = 5,
    G2 = 6,
    G3 = 7;
  const I0 = 8,
    I1 = 9,
    I2 = 10,
    I3 = 11;
  const U0 = 12,
    U1 = 13,
    U2 = 14,
    U3 = 15;
  const A0 = 16,
    A1 = 17,
    A2 = 18,
    A3 = 19;

  // ---- 材質：[昼, 夕, 宵, 夜] のパレット番号
  const MATS = [
    ["SKY", C3, C3, C3, C3],
    ["HILL_FAR", U2, U1, I3, I1],
    ["HILL_NEAR", U1, U0, I2, I1],
    ["TREE_FAR", G1, G0, I2, I0],
    ["GRASS", G2, G1, I3, I1],
    ["GRASS_DK", G1, G0, I2, I0],
    ["GRASS_LT", G3, G2, U0, I2],
    ["PATH", C1, C0, U0, I2],
    ["PATH_DK", C0, A0, I3, I1],
    ["WALL", C3, A3, U1, I2],
    ["WALL_SH", C2, A2, U0, I1],
    ["PLANK", C1, A1, I3, I1],
    ["STONE", U1, U0, I2, I1],
    ["STONE_LT", U2, U1, I3, I2],
    ["ROOF", I3, I2, I1, I0],
    ["ROOF_LT", U0, I3, I2, I1],
    ["ROOF_HI", U1, U0, I3, I1],
    ["WOOD", A0, A0, I2, I0],
    ["WOOD_LT", A1, A1, I3, I1],
    ["WOOD_DK", I3, I2, I1, I0],
    ["BRICK", U0, I3, I2, I0],
    ["BRICK_LT", U1, U0, I3, I1],
    ["BARK", I3, I2, I1, I0],
    ["BARK_LT", A0, A0, I1, I0],
    ["LEAF0", G0, G0, I1, I0],
    ["LEAF1", G1, G0, I2, I0],
    ["LEAF2", G2, A0, I2, I1],
    ["LEAF3", G3, A1, I3, I1],
    ["FLOWER_A", A2, A1, A0, I2],
    ["FLOWER_C", C3, A3, U1, I3],
    ["STEM", G0, G0, I2, I0],
    ["GLASS", I2, A0, I1, I0],
    ["GLASS_HI", U1, A1, I2, I1],
    ["ROOM", C1, C0, I3, I1],
    ["SKIN", A3, A3, U2, I3],
    ["HAIR", I0, I0, I0, I0],
    ["SHIRT", A1, A0, I3, I1],
    ["SHIRT_DK", A0, A0, I2, I0],
    ["PANTS", I2, I2, I1, I0],
    ["BOOT", I0, I0, I0, I0],
    ["BOOK", C3, C3, U2, I3],
    ["BOOK_DK", C1, C1, U0, I2],
    ["CLOUD", C3, A3, U1, I2],
    ["CLOUD_SH", U3, A2, U0, I1],
    ["SMOKE", C1, C1, U2, I3],
    ["SMOKE_DK", U2, U1, U0, I2],
    ["SUN", C3, C3, A3, A3],
    ["SUN_RIM", A3, A2, A2, A2],
    ["MOON", C3, C3, C3, C3],
    ["MOON_DK", C1, C1, C1, C1],
    ["STAR", C3, C3, C3, C3],
    ["STAR_DIM", U2, U2, U2, U2],
    ["LIT", A2, A2, A2, A2],
    ["LIT_HI", A3, A3, A3, A3],
    ["LIT_DK", A1, A1, A1, A1],
    ["SIL", I0, I0, I0, I0],
    ["FIREFLY", A3, A3, A3, A3],
    ["BIRD", I2, I2, I1, I0],
    ["MARK", I0, I0, C3, C3],
    ["ZZZ", U3, U3, U3, U3],
    ["WING", A2, A2, A1, I2],
  ];
  const M = Object.fromEntries(MATS.map((row, i) => [row[0], i]));

  // ---- 時刻のかなめ：[時, 材質の列, 空の色（上から地平線へ）]
  const KEYS = [
    [0, 3, [I0, I0, I1, I1, I2]],
    [4.8, 3, [I0, I0, I1, I1, I2]],
    [5.4, 3, [I0, I1, I2, I3, U0]],
    [6.0, 2, [I1, I2, I3, U0, U1, A1]],
    [6.7, 1, [I3, U0, U1, U2, A2, A3]],
    [7.8, 0, [U1, U2, U3, C2, C3]],
    [10, 0, [U2, U3, C2, C3, C3]],
    [15, 0, [U1, U2, U3, C2, C3]],
    [17, 1, [U0, U1, U3, C1, A3, A2]],
    [18, 1, [I3, U0, U1, A1, A2, A3]],
    [19, 2, [I1, I2, I3, U0, A0, A1]],
    [20.3, 3, [I0, I0, I1, I1, I2]],
    [24, 3, [I0, I0, I1, I1, I2]],
  ];

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayerAt = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    const r = seeded(seed);
    const table = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) table[i] = r();
    const at = (x, y) => table[((x & 255) << 8) | (y & 255)];
    return (x, y) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = x - xi;
      const fy = y - yi;
      const u = fx * fx * (3 - 2 * fx);
      const v = fy * fy * (3 - 2 * fy);
      return mix(
        mix(at(xi, yi), at(xi + 1, yi), u),
        mix(at(xi, yi + 1), at(xi + 1, yi + 1), u),
        v,
      );
    };
  }

  // ---- 色の計算（OKLab）。色の値は書かず、トークンの色相に明るさだけを与える
  const toLinear = (c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const toGamma = (c) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  function rgbToOklab([r8, g8, b8]) {
    const r = toLinear(r8 / 255);
    const g = toLinear(g8 / 255);
    const b = toLinear(b8 / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function oklabToLinear(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }
  function labTone(lab, L) {
    // 明るさを決め、色域に入るまで鮮やかさを落とす
    let chroma = 1;
    for (let i = 0; i < 24; i++) {
      const rgb = oklabToLinear(L, lab[1] * chroma, lab[2] * chroma);
      if (rgb.every((v) => v >= -0.001 && v <= 1.001))
        return rgb.map((v) => Math.round(toGamma(clamp(v)) * 255));
      chroma *= 0.9;
    }
    return oklabToLinear(L, 0, 0).map((v) =>
      Math.round(toGamma(clamp(v)) * 255),
    );
  }

  // ---- 住人の絵
  const CHARS = {
    H: "HAIR",
    S: "SKIN",
    E: "HAIR",
    T: "SHIRT",
    D: "SHIRT_DK",
    P: "PANTS",
    B: "BOOT",
    W: "BOOK",
    K: "BOOK_DK",
  };
  const makeSprite = (rows) => {
    const list = [];
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== ".") list.push([x, y, M[CHARS[ch]], ch === "E"]);
      });
    });
    return { list, w: rows[0].length, h: rows.length };
  };
  const HEAD = ["..HHH..", ".HHHHH.", ".HHSSS.", ".HSSES.", "..SSSS."];
  const HEAD_BLINK = ["..HHH..", ".HHHHH.", ".HHSSS.", ".HSSSS.", "..SSSS."];
  const HEAD_UP = ["..HHH..", ".HHHHH.", ".HHSES.", ".HSSSS.", "..SSSS."];
  const BODY_STAND = [
    "..TTT..",
    ".TTTTT.",
    ".STTTS.",
    "..DDD..",
    "..PPP..",
    "..P.P..",
    "..B.B..",
  ];
  const BODY_WALK1 = [
    "..TTT..",
    ".TTTTT.",
    "..TTTS.",
    ".SDDD..",
    "..PPP..",
    ".PP.P..",
    ".B..BB.",
  ];
  const BODY_WALK2 = [
    "..TTT..",
    ".TTTTT.",
    ".STTTS.",
    "..DDD..",
    "..PPP..",
    "..PP...",
    "..BB...",
  ];
  const BODY_WALK3 = [
    "..TTT..",
    ".TTTTT.",
    ".STTT..",
    "..DDDS.",
    "..PPP..",
    "..P.PP.",
    ".BB..B.",
  ];
  const BODY_ARMS = [
    "S.TTT.S",
    "STTTTTS",
    "..TTT..",
    "..DDD..",
    "..PPP..",
    "..P.P..",
    "..B.B..",
  ];
  const person = (head, body) => makeSprite([...head, ...body]);
  const SPR = {
    stand: person(HEAD, BODY_STAND),
    blink: person(HEAD_BLINK, BODY_STAND),
    walk: [
      person(HEAD, BODY_WALK1),
      person(HEAD, BODY_WALK2),
      person(HEAD, BODY_WALK3),
      person(HEAD, BODY_WALK2),
    ],
    up: person(HEAD_UP, BODY_ARMS),
    crouch: person(HEAD, [
      "..TTT..",
      ".TTTTTS",
      "..DDD.S",
      "..PPP..",
      ".BB.B..",
    ]),
    seat: makeSprite([
      "....HHH..",
      "...HHHHH.",
      "...SSSHH.",
      "...ESSHH.",
      "...SSSS..",
      "...TTTT..",
      "...STTTT.",
      "...STTTT.",
      "PPPPPPDD.",
      "BB.PPPPP.",
    ]),
    seatBlink: makeSprite([
      "....HHH..",
      "...HHHHH.",
      "...SSSHH.",
      "...SSSHH.",
      "...SSSS..",
      "...TTTT..",
      "...STTTT.",
      "...STTTT.",
      "PPPPPPDD.",
      "BB.PPPPP.",
    ]),
    seatUp: makeSprite([
      "....HHH..",
      "...HHHHH.",
      "...ESSHH.",
      "...SSSHH.",
      "...SSSS..",
      "...TTTT..",
      "...STTTT.",
      "...STTTT.",
      "PPPPPPDD.",
      "BB.PPPPP.",
    ]),
    bust: makeSprite([
      "...HHH...",
      "..HHHHH..",
      "..HSSES..",
      "...SSS...",
      "..TTTTT..",
      ".TTTTTTT.",
      ".TTTTTTT.",
      ".TTTTTTT.",
    ]),
    bustBlink: makeSprite([
      "...HHH...",
      "..HHHHH..",
      "..HSSSS..",
      "...SSS...",
      "..TTTTT..",
      ".TTTTTTT.",
      ".TTTTTTT.",
      ".TTTTTTT.",
    ]),
    bustUp: makeSprite([
      "S..HHH..S",
      "S.HHHHH.S",
      "S.HSSES.S",
      "SS.SSS.SS",
      ".STTTTTS.",
      "..TTTTT..",
      "..TTTTT..",
      "..TTTTT..",
    ]),
    bustHalf: makeSprite([
      "...HHH...",
      "..HHHHH..",
      "S.HSSES.S",
      "SS.SSS.SS",
      ".STTTTTS.",
      "..TTTTT..",
      ".TTTTTTT.",
      ".TTTTTTT.",
    ]),
    sil: makeSprite([
      "...HHH..",
      "..HHHHH.",
      "..HHHHH.",
      "...HHH..",
      "..HHHHH.",
      ".HHHHHHH",
      "HHHHHHHH",
      "HHHHHHHH",
    ]),
    silLook: makeSprite([
      "....HHH.",
      "...HHHHH",
      "...HHHHH",
      "...HHH..",
      "..HHHHH.",
      ".HHHHHHH",
      "HHHHHHHH",
      "HHHHHHHH",
    ]),
  };

  // ---- シェーダー
  const VERT = `#version 300 es
  in vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  // 指定しないと標本の精度は lowp になる。PC では無視されるが、スマホの GPU では光の場が段になることがある
  precision highp sampler2D;
  uniform sampler2D uWorld, uGlowNear;
  uniform vec2 uRes, uPill, uOrigin, uWorldSize, uGlowSize;
  uniform vec4 uLens;
  uniform float uBezel, uK, uNight, uLift, uSeam, uCalm;
  uniform vec3 uShellDay, uShellNight, uInk, uLight, uHiNight, uLoNight, uSkyDay, uHomeCol, uSkyCol;
  uniform vec2 uHomePos, uSkyPos;
  out vec4 outColor;

  float rb(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // なめらかに読む（B スプライン。光の場の格子が見えないように）
  vec3 smoothTex(sampler2D t, vec2 uv, vec2 size) {
    vec2 st = uv * size - 0.5;
    vec2 i = floor(st);
    vec2 f = st - i;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
    vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
    vec2 w3 = f3 / 6.0;
    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 h0 = (i - 0.5 + w1 / g0 + 0.5) / size;
    vec2 h1 = (i + 1.5 + w3 / g1 + 0.5) / size;
    return g0.y * (g0.x * texture(t, vec2(h0.x, h0.y)).rgb + g1.x * texture(t, vec2(h1.x, h0.y)).rgb)
         + g1.y * (g0.x * texture(t, vec2(h0.x, h1.y)).rgb + g1.x * texture(t, vec2(h1.x, h1.y)).rgb);
  }
  vec3 glowNear(vec2 frag) {
    vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
    // 光の届かないところでは、なめらかに読む4回を省く。窓の大半はここを通る
    vec3 rough = textureLod(uGlowNear, uv, 0.0).rgb;
    if (rough.r + rough.g + rough.b < 1.0e-4) return vec3(0.0);
    return smoothTex(uGlowNear, uv, uGlowSize);
  }

  // 光る画素の集まりが、まわりをどれだけ照らすか。遠くまでなだらかに届く
  vec3 reach(vec2 p, vec2 pos, vec3 col, float radius) {
    vec2 L = pos - p;
    float r2 = radius * radius;
    return col * r2 / (r2 + dot(L, L));
  }

  // ピクセルのあいだの、ごく細い継ぎ目。大きく写すときの密度になる
  float seamAt(vec2 w, float scale) {
    if (scale < 7.0) return 1.0;
    vec2 f = fract(w) * scale;
    vec2 g = min(f, scale - f);
    float edge = min(g.x, g.y);
    return 1.0 - 0.075 * (1.0 - smoothstep(0.0, uSeam, edge));
  }

  // 整数倍のまま、そのまま読む
  vec3 worldExact(vec2 frag) {
    vec2 w = vec2(frag.x - uOrigin.x, uOrigin.y - frag.y) / uK;
    ivec2 t = ivec2(floor(w));
    t = clamp(t, ivec2(0), ivec2(uWorldSize) - 1);
    return texelFetch(uWorld, t, 0).rgb * seamAt(w, uK);
  }

  // レンズの中：拡大では、ピクセルの縁は立ったまま。圧縮されるところはミップで読み、模様を出さない
  vec3 worldBent(vec2 frag, float scale, float foot) {
    vec2 w = vec2(frag.x - uOrigin.x, uOrigin.y - frag.y) / uK;
    if (foot > 1.0) return textureLod(uWorld, w / uWorldSize, log2(foot)).rgb;
    vec2 r = floor(w + 0.5);
    vec2 sharp = r - 0.5 + clamp((w - r) / max(foot, 1.0e-3) + 0.5, 0.0, 1.0);
    return textureLod(uWorld, sharp / uWorldSize, 0.0).rgb * seamAt(w, scale);
  }

  vec3 envLow, envHigh;
  float softBox(vec2 p, vec2 c, vec2 h, float s) {
    vec2 q = abs(p - c) - h;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    return 1.0 - smoothstep(-s, s, d);
  }
  // 磨かれた面に映る部屋：上の大きなやわらかい光と、下からの弱い照り返し
  vec3 studio(vec3 R) {
    vec3 c = mix(envLow, envHigh, smoothstep(-0.55, 0.85, R.y));
    vec2 s = R.xy / (1.0 + max(R.z, 0.0));
    float key = softBox(s, vec2(-0.1, 0.56), vec2(0.5, 0.11), 0.17);
    float fill = softBox(s, vec2(0.34, -0.6), vec2(0.3, 0.05), 0.2);
    c += envHigh * key * 1.15;
    c += envHigh * fill * 0.14;
    return c;
  }

  vec3 shellColor(vec2 p, vec2 frag, float d) {
    // 外の面：丸い厚み。外側は外へ、内側は窓へ向かって傾く
    vec2 q = p;
    float inner = uPill.x - uPill.y;
    q.x = sign(p.x) * max(abs(p.x) - inner, 0.0);
    vec2 g = q / max(length(q), 1.0e-3);
    float t = clamp(-d / uBezel, 0.0, 1.0);
    float a = (1.0 - 2.0 * t);
    a = sign(a) * pow(abs(a), 1.35) * 0.96;
    vec3 N = normalize(vec3(g * a, sqrt(max(1.0 - a * a, 0.02))));
    vec3 R = vec3(2.0 * N.z * N.xy, 2.0 * N.z * N.z - 1.0);
    vec3 albedo = mix(uShellDay, uShellNight, uNight);
    float diffuse = 0.62 + 0.38 * clamp(dot(N, normalize(vec3(-0.25, 0.75, 0.6))), 0.0, 1.0);
    float fresnel = 0.05 + 0.95 * pow(1.0 - N.z, 3.5);
    vec3 c = albedo * diffuse;
    c = mix(c, studio(R), clamp(fresnel * 0.9 + 0.1, 0.0, 1.0));
    // 窓のそばは、奥へ落ちる影
    float toWindow = smoothstep(0.62, 1.0, t);
    c = mix(c, c * 0.8, toWindow * 0.55);

    // 灯りが、磨かれた面を照らす。光に近いところだけが、やわらかく染まる
    float radius = uPill.y * 0.62;
    for (int i = 0; i < 2; i++) {
      vec2 pos = i == 0 ? uHomePos : uSkyPos;
      vec3 col = i == 0 ? uHomeCol : uSkyCol;
      vec3 e = reach(p, pos, col, radius);
      vec2 toL = normalize(pos - p + 1.0e-3);
      float wrap = 0.5 + 0.5 * dot(N.xy, toL);
      c += e * wrap * mix(albedo * 0.9, vec3(dot(albedo, vec3(0.34))) + 0.34, 0.55) * 3.1;
      // 映り込み：線にならないよう、広く弱く
      vec3 Ld = normalize(vec3(pos - p, uPill.y * 0.7));
      float spec = pow(max(dot(R, Ld), 0.0), 5.0);
      c += reach(p, pos, col, uPill.y * 0.4) * spec * 1.4;
    }
    return c;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 p = frag - 0.5 * uRes;
    envLow = mix(uShellDay * 0.74, uLoNight, uNight);
    envHigh = mix(uLight, uHiNight, uNight);

    float d = rb(p, uPill, uPill.y);
    float dw = d + uBezel;

    // ---- 外：やわらかい影と、漏れた光
    vec3 premul = vec3(0.0);
    float alpha = 0.0;
    if (d > -2.0) {
      float h = uPill.y;
      float wide = rb(p + vec2(0.0, h * 0.13), uPill - vec2(h * 0.02, h * 0.02), uPill.y);
      float contact = rb(p + vec2(0.0, h * 0.028), uPill, uPill.y);
      float shadow = 0.24 * (1.0 - smoothstep(-h * 0.2, h * 0.28, wide)) + 0.22 * (1.0 - smoothstep(-h * 0.03, h * 0.07, contact));
      alpha = shadow;
      premul = uInk * shadow;
      // 漏れた光は、まわりの地を染める。灯りがなければ染まらない
      if (uHomeCol.r + uHomeCol.g + uHomeCol.b > 0.0) {
        vec3 outside = reach(p, uHomePos, uHomeCol, uPill.y * 0.62) * exp(-max(d, 0.0) / (h * 0.2));
        float amount = clamp(dot(outside, vec3(0.34)) * 2.3, 0.0, 0.85);
        vec3 tint = outside / max(dot(outside, vec3(0.34)), 1.0e-3) * 0.34;
        premul = mix(premul, tint * 1.25, amount);
        alpha = mix(alpha, 1.0, amount);
      }
      // canvas の端までに、なめらかに消す
      vec2 toEdge = 0.5 * uRes - abs(p);
      float room = min(toEdge.x, toEdge.y) / (h * 0.32);
      float fade = smoothstep(0.0, 1.0, clamp(room, 0.0, 1.0));
      premul *= fade;
      alpha *= fade;
    }

    vec3 color = premul;
    if (d < 1.0) {
      // 殻は細い帯。窓に隠れる画素では計算しない（下の mix で捨てるだけなので、絵は変わらない）
      vec3 body = dw > -0.8 ? shellColor(p, frag, d) : vec3(0.0);

      if (dw < 1.0) {
        // ---- 窓の奥の世界
        vec3 c = worldExact(frag);

        // 灯りのにじみ：ピクセルの上に、ガラスのなめらかな光が乗る
        vec3 near = glowNear(frag);
        c = 1.0 - (1.0 - c) * (1.0 - clamp(near * 0.82, 0.0, 1.0));

        // ガラスの映り込み：広く、なだらかに。縁はなぞらない
        float win = uPill.y - uBezel;
        float sheen = smoothstep(win * 0.1, win * 1.02, p.y + p.x * 0.09);
        c = mix(c, envHigh, sheen * sheen * mix(0.17, 0.05, uNight));
        float low = smoothstep(-win * 0.5, -win * 1.05, p.y - p.x * 0.05);
        c = mix(c, envHigh, low * mix(0.05, 0.015, uNight));

        // くぼみ：上のふちから落ちる影と、まわりの陰り
        float top = rb(p - vec2(0.0, win * 0.06), uPill - vec2(uBezel), win);
        float inset = 1.0 - smoothstep(-win * 0.2, win * 0.03, top + win * 0.0);
        float ring = exp(max(dw, -win) / (win * 0.075));
        float depth = clamp(ring * 0.46 + (1.0 - exp(min(top, 0.0) / (win * 0.14))) * 0.0 + exp(min(top, 0.0) / (win * 0.1)) * 0.4 * inset, 0.0, 0.82);
        c = mix(c, uInk, depth);

        // ---- レンズ
        vec2 lc = uLens.xy;
        vec2 he = uLens.zw;
        float lr = min(he.x, he.y);
        vec2 lq = p - lc;

        // レンズが窓に落とす影と、集めた光
        float lift = 0.055 + uLift * 0.04;
        float sd = rb(lq + vec2(0.0, lr * lift * 1.5), he, lr);
        float sh = 1.0 - smoothstep(-lr * 0.16, lr * (0.2 + uLift * 0.1), sd);
        c = mix(c, uInk, sh * mix(0.36, 0.55, uNight));

        float ld = rb(lq, he, lr);
        if (ld < 1.0) {
          // 中心線からの距離で丸みを決める
          vec2 axis = lq;
          vec2 inner2 = max(he - lr, vec2(0.0));
          axis.x = sign(lq.x) * max(abs(lq.x) - inner2.x, 0.0);
          axis.y = sign(lq.y) * max(abs(lq.y) - inner2.y, 0.0);
          float rad = length(axis);
          vec2 gr = axis / max(rad, 1.0e-3);
          float rho = clamp(rad / lr, 0.0, 1.0);

          // 拡大：中ほどは平らに、少しだけ大きく見える。縁に近づくと急に曲がり、外の絵を圧縮して見せる
          float mag = 1.24;
          float bt = clamp((rho - 0.7) / 0.3, 0.0, 1.0);
          float band = bt * bt * (3.0 - 2.0 * bt);
          float strength = 1.0 - 1.0 / mag + 0.2;
          float bend = pow(band, 2.2) * lr * strength;
          vec2 base = lc + lq / mag;
          vec2 shiftDir = gr * bend;
          vec2 center = 0.5 * uRes;
          // 1画素が世界の何ピクセルぶんか（曲がる帯では、圧縮されて大きくなる）
          float dBand = 6.0 * bt * (1.0 - bt) / 0.3;
          float foot = (1.0 / mag + 2.2 * pow(max(band, 1.0e-3), 1.2) * dBand * strength) / uK;
          vec3 seen;
          float scale = uK * mag;
          if (band > 0.02) {
            float ca = 0.05 * band;
            seen.r = worldBent(center + base + shiftDir * (1.0 - ca), scale, foot).r;
            seen.g = worldBent(center + base + shiftDir, scale, foot).g;
            seen.b = worldBent(center + base + shiftDir * (1.0 + ca), scale, foot).b;
          } else {
            seen = worldBent(center + base, scale, foot);
          }
          vec3 throughGlow = glowNear(center + base + shiftDir);
          seen = 1.0 - (1.0 - seen) * (1.0 - clamp(throughGlow * 0.8, 0.0, 1.0));

          // ガラスの形：中ほどはゆるい丸み、縁で急に落ちる
          vec2 tilt = gr * (0.22 * rho + 0.78 * pow(rho, 7.0));
          vec3 N = normalize(vec3(tilt, sqrt(max(1.0 - dot(tilt, tilt), 0.02))));
          vec3 R = vec3(2.0 * N.z * N.xy, 2.0 * N.z * N.z - 1.0);
          vec2 lp = lq / lr;

          vec3 lens = seen * 1.035;

          // 縁の厚み：明るい線ではなく、ガラスの奥の暗さで形を見せる
          float edge = pow(rho, 16.0);
          lens = mix(lens, uInk, edge * 0.42);
          
          // visibility: thin bright rim so the knob stands out on small / dark toggles
          float rim = smoothstep(0.84, 0.93, rho) * (1.0 - smoothstep(0.95, 1.0, rho));
          lens = mix(lens, envHigh, rim * 0.6);

          // 下の内側に集まる光
          float pool = smoothstep(0.05, 0.95, -lp.y * 0.9 + lp.x * 0.2) * smoothstep(1.0, 0.8, rho) * smoothstep(0.42, 0.86, rho);
          lens += envHigh * pool * mix(0.3, 0.1, uNight);

          // 反射：上の大きなやわらかい光。丸みに沿って歪むが、縁をなぞらない
          vec2 sr = R.xy / (1.0 + max(R.z, 0.0));
          float broad = softBox(lp, vec2(-0.1, 0.62), vec2(0.5, 0.17), 0.3) * smoothstep(0.98, 0.72, rho);
          lens = mix(lens, envHigh, broad * mix(0.44, 0.1, uNight));
          float fresnel = pow(1.0 - N.z, 3.0);
          float dir = 0.2 + 0.8 * smoothstep(-0.6, 0.85, dot(gr, normalize(vec2(-0.42, 0.9))));
          float mirror = clamp(fresnel * dir * dir * 0.6, 0.0, 0.42);
          if (mirror > 1.0e-3) lens = mix(lens, studio(R), mirror);

          // 灯りと月や太陽も、レンズの面に映る。映るのは縁の近くだけ
          if (rho > 0.62) {
            for (int i = 0; i < 2; i++) {
              vec2 pos = i == 0 ? uHomePos : uSkyPos;
              vec3 col = i == 0 ? uHomeCol : uSkyCol;
              vec2 toL = normalize(pos - p + 1.0e-3);
              float side = max(dot(gr, toL), 0.0);
              lens += reach(p, pos, col, uPill.y * 0.9) * side * side * side * smoothstep(0.62, 0.97, rho) * 0.6;
            }
          }

          c = mix(c, lens, 1.0 - smoothstep(-0.8, 0.8, ld));
        }

        body = mix(body, c, 1.0 - smoothstep(-0.8, 0.8, dw));
      }

      float cover = 1.0 - smoothstep(-0.8, 0.8, d);
      color = mix(premul, body, cover);
      alpha = mix(alpha, 1.0, cover);
    }

    // 大きな階調が縞にならないよう、わずかに散らす
    float n = fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453);
    n += fract(sin(dot(frag, vec2(93.989, 67.345))) * 24634.6345) - 1.0;
    color += (n * 0.75) / 255.0 * min(alpha * 4.0, 1.0);
    outColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }`;

  function mount(root) {
    const cleanups = [];
    const on = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    let canvas = root.querySelector(".scene");
    const button = root.querySelector(".hit");
    const statusEl = root.querySelector("[data-status]");
    const probe = root.querySelector(".probe");
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const schemeQuery = matchMedia("(prefers-color-scheme: dark)");
    let calm = true; // perf: static scene, redraw only while sliding (was: follow reduced-motion)

    // 画面に出さない canvas。OffscreenCanvas のない古い Safari（16.3 まで）でも動くようにする
    const offscreen = (w, h) =>
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(w, h)
        : Object.assign(root.ownerDocument.createElement("canvas"), {
            width: w,
            height: h,
          });

    // ---- パレットをトークンから作る
    const paint = offscreen(1, 1).getContext("2d", {
      willReadFrequently: true,
    });
    const palette = new Array(20);
    const palette32 = new Uint32Array(20);
    const readPalette = () => {
      const style = getComputedStyle(root);
      RAMPS.forEach(([name, tones], ramp) => {
        probe.style.color = style.getPropertyValue(`--_${name}`).trim();
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = getComputedStyle(probe).color;
        paint.fillRect(0, 0, 1, 1);
        const d = paint.getImageData(0, 0, 1, 1).data;
        const lab = rgbToOklab([d[0], d[1], d[2]]);
        tones.forEach((L, step) => {
          const rgb = labTone(lab, L);
          const id = ramp * 4 + step;
          palette[id] = rgb;
          palette32[id] = (255 << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
        });
      });
    };
    const unit = (id) => palette[id].map((v) => v / 255);

    // ---- 材質の表：時刻のかなめごと、状態（ふつう、影、灯り）ごと
    const STEP_L = RAMPS.flatMap(([, tones]) => tones);
    const shadeOf = (id) => {
      const step = id % 4;
      if (step > 0) return id - 1;
      if (id === C0) return U0;
      if (id === G0) return I3;
      if (id === U0) return I3;
      if (id === A0) return I3;
      return id;
    };
    const litOf = (dayId) => {
      const L = STEP_L[dayId];
      return L < 0.72 ? A0 : L < 0.9 ? A0 : A1;
    };
    const NM = MATS.length;
    const table = KEYS.map(([, col]) => {
      const t = new Uint8Array(NM * 3);
      MATS.forEach((row, m) => {
        const id = row[col + 1];
        t[m] = id;
        t[NM + m] = shadeOf(id);
        t[NM * 2 + m] = litOf(row[1]);
      });
      return t;
    });

    // ---- 世界の大きさ（整数倍が決める）
    let bw = 1;
    let bh = 1;
    let ox = 0;
    let oy = 0;
    let k = 1;
    let matBuf = new Uint8Array(1);
    let baseBuf = new Uint8Array(1);
    let varBuf = new Uint8Array(1);
    let thrA = new Uint8Array(1);
    let thrB = new Uint8Array(1);
    let pixels = new Uint32Array(1);
    let pixelBytes = new Uint8Array(pixels.buffer);
    let skyKeys = [];
    let canopy = [];
    let stars = [];
    const emitList = [];
    const sources = [
      { w: 0, x: 0, y: 0, r: 0, g: 0, b: 0 },
      { w: 0, x: 0, y: 0, r: 0, g: 0, b: 0 },
    ];

    const noiseA = makeNoise(11);
    const noiseB = makeNoise(29);

    // ---- 描く道具
    const put = (x, y, m) => {
      const px = x + ox;
      const py = y + oy;
      if (px < 0 || py < 0 || px >= bw || py >= bh) return;
      matBuf[py * bw + px] = m;
    };
    const putSky = (x, y, m) => {
      const px = x + ox;
      const py = y + oy;
      if (px < 0 || py < 0 || px >= bw || py >= bh) return;
      const i = py * bw + px;
      if (matBuf[i] === 0) matBuf[i] = m;
    };
    const rect = (x, y, w, h, m) => {
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) put(x + i, y + j, m);
    };
    const get = (x, y) => {
      const px = x + ox;
      const py = y + oy;
      if (px < 0 || py < 0 || px >= bw || py >= bh) return -1;
      return matBuf[py * bw + px];
    };
    const blit = (s, x, y, flip = false, force = -1) => {
      for (const [dx, dy, m] of s.list)
        put(flip ? x + s.w - 1 - dx : x + dx, y + dy, force >= 0 ? force : m);
    };
    const emit = (x, y, weight, group = 2) => {
      const px = x + ox;
      const py = y + oy;
      if (px < 0 || py < 0 || px >= bw || py >= bh) return;
      emitList.push(py * bw + px, weight);
      if (group < 2) {
        const c = sources[group];
        c.w += weight;
        c.x += px * weight;
        c.y += py * weight;
        c.id = group === 0 ? A2 : c.id;
      }
    };

    // ---- 動かない背景
    const hillFar = (x) =>
      58 + noiseA(x * 0.022 + 3, 1.5) * 16 + noiseB(x * 0.09, 4.5) * 3;
    const hillNear = (x) =>
      69 + noiseA(x * 0.034 + 40, 7.5) * 11 + noiseB(x * 0.14 + 7, 2.5) * 2;

    const pathDist = (x, y) => {
      // 戸口から手前へ下る道と、木へ向かう枝道
      const main = Math.abs(
        x -
          (74 +
            Math.pow(Math.max(y - 86, 0), 1.45) * 0.62 +
            Math.sin(y * 0.3) * 1.5),
      );
      const toTree =
        y < 100
          ? Math.abs(y - (92 + Math.sin(x * 0.09) * 1.4 + (x - 78) * 0.012)) *
            (x > 78 && x < 136 ? 1 : 99)
          : 99;
      return Math.min(main * 0.5, toTree);
    };

    const paintGround = () => {
      for (let py = 0; py < bh; py++) {
        const y = py - oy;
        for (let px = 0; px < bw; px++) {
          const x = px - ox;
          const i = py * bw + px;
          if (y < HORIZON) {
            if (y >= hillNear(x)) {
              const tuft =
                noiseB(x * 0.5, y * 0.8) > 0.74 && y > hillNear(x) + 1;
              matBuf[i] = tuft ? M.TREE_FAR : M.HILL_NEAR;
            } else if (y >= hillFar(x)) {
              // 遠い山は、上の端を空へディザで溶かす
              const fromTop = y - hillFar(x);
              matBuf[i] = fromTop < 2 && bayerAt(x, y) > 9 ? 0 : M.HILL_FAR;
            }
            continue;
          }
          const n =
            noiseA(x * 0.075 + 9, y * 0.2 + 3) +
            noiseB(x * 0.3, y * 0.5) * 0.28;
          const depth = (y - HORIZON) / 30;
          const v = n + (bayerAt(x, y) / 16 - 0.5) * 0.14 - depth * 0.14;
          let m = M.GRASS;
          if (v > 0.84) m = M.GRASS_LT;
          else if (v < 0.5) m = M.GRASS_DK;
          const pd = pathDist(x, y);
          if (pd < 2.4 + depth * 2.4) {
            const pebble = noiseB(x * 0.7 + 3, y * 0.9) > 0.68;
            m = pebble ? M.PATH_DK : M.PATH;
          } else if (pd < 3.4 + depth * 2.4 && bayerAt(x, y) > 7) {
            m = M.PATH_DK;
          }
          matBuf[i] = m;
        }
      }
      // 地平線の濃い線と、草の穂
      const r = seeded(5);
      for (let x = -ox; x < bw - ox; x++) {
        if (r() < 0.6) put(x, HORIZON, M.GRASS_DK);
      }
      for (let i = 0; i < (bw * bh) / 60; i++) {
        const x = Math.floor(r() * bw) - ox;
        const y = HORIZON + 2 + Math.floor(r() * (bh - oy - HORIZON));
        if (pathDist(x, y) < 5) continue;
        put(x, y, r() < 0.5 ? M.GRASS_LT : M.GRASS_DK);
        if (r() < 0.5) put(x, y - 1, M.GRASS_LT);
      }
    };

    const paintFence = () => {
      for (let x = 90; x < 124; x += 4) {
        rect(x, 74, 2, 9, M.WOOD_LT);
        put(x + 1, 74, M.PLANK);
        rect(x + 1, 75, 1, 8, M.WOOD);
      }
      rect(89, 76, 36, 1, M.WOOD_LT);
      rect(89, 80, 36, 1, M.WOOD);
    };

    const paintBush = (cx, cy, rx, ry, seed) => {
      const r = seeded(seed);
      const blobs = Array.from({ length: 6 }, () => [
        cx + (r() - 0.5) * rx * 1.5,
        cy + (r() - 0.5) * ry,
        3 + r() * (ry * 0.75),
      ]);
      for (let y = cy - ry - 3; y <= cy + ry + 1; y++) {
        for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
          let inside = false;
          let shade = 0;
          for (const [bx, by, br] of blobs) {
            const d = Math.hypot(x - bx, (y - by) * 1.15);
            if (d < br) {
              inside = true;
              shade = Math.max(shade, 1 - d / br);
            }
          }
          if (!inside) continue;
          const v =
            shade * 0.6 +
            (cy - y) / (ry * 2.4) +
            (bayerAt(x, y) / 16 - 0.5) * 0.3 +
            noiseB(x * 0.4, y * 0.5) * 0.25;
          put(
            x,
            y,
            v > 0.82
              ? M.LEAF3
              : v > 0.52
                ? M.LEAF2
                : v > 0.24
                  ? M.LEAF1
                  : M.LEAF0,
          );
        }
      }
    };

    const paintFlowers = (x0, x1, y0, y1, count, seed) => {
      const r = seeded(seed);
      for (let i = 0; i < count; i++) {
        const x = Math.floor(mix(x0, x1, r()));
        const y = Math.floor(mix(y0, y1, r()));
        if (pathDist(x, y) < 4.5) continue;
        put(x, y, M.STEM);
        put(x, y - 1, M.STEM);
        const m = r() < 0.55 ? M.FLOWER_A : M.FLOWER_C;
        put(x, y - 2, m);
        if (r() < 0.5) {
          put(x - 1, y - 2, m);
          put(x + 1, y - 2, m);
          put(x, y - 3, m);
        }
      }
    };

    const paintHouse = () => {
      const X0 = 38;
      const X1 = 84;
      const TOP = 53;
      const BASE = 85;
      // 煙突（屋根の奥）
      rect(68, 28, 8, 18, M.BRICK);
      for (let y = 28; y < 46; y += 2) {
        for (let x = 68; x < 76; x++)
          if ((x + (((y - 28) / 2) & 1) * 2) % 4 < 2) put(x, y, M.BRICK_LT);
      }
      rect(67, 26, 10, 2, M.STONE_LT);
      rect(67, 28, 10, 1, M.STONE);

      // 壁
      rect(X0, TOP, X1 - X0, BASE - TOP, M.WALL);
      for (let y = TOP + 3; y < BASE; y += 4) {
        for (let x = X0; x < X1; x++)
          if ((x * 7 + y * 3) % 23 !== 0) put(x, y, M.PLANK);
      }
      // 軒下の影。ディザで下へ薄くなる
      for (let y = TOP; y < TOP + 6; y++) {
        for (let x = X0; x < X1; x++) {
          if (y < TOP + 3 || bayerAt(x, y) < (TOP + 6 - y) * 4)
            put(x, y, M.WALL_SH);
        }
      }
      // 右の端は日陰
      for (let x = X1 - 3; x < X1; x++) {
        for (let y = TOP; y < BASE; y++)
          if (bayerAt(x, y) < (x - (X1 - 3) + 1) * 5) put(x, y, M.WALL_SH);
      }
      // 土台の石
      rect(X0 - 1, BASE - 3, X1 - X0 + 2, 3, M.STONE);
      for (let x = X0 - 1; x < X1 + 1; x += 5) {
        rect(x, BASE - 3, 4, 1, M.STONE_LT);
        put(x + 2, BASE - 2, M.STONE_LT);
      }

      // 屋根：台形。瓦の段
      const RT = 34;
      for (let y = RT; y < TOP; y++) {
        const t = (y - RT) / (TOP - RT);
        const l = Math.round(mix(47, X0 - 6, t));
        const r = Math.round(mix(75, X1 + 6, t));
        for (let x = l; x <= r; x++) {
          const row = Math.floor((y - RT) / 3);
          const tile = (x + (row & 1) * 3) % 6;
          let m = M.ROOF;
          if ((y - RT) % 3 === 0) m = M.ROOF;
          else if (tile === 0) m = M.ROOF;
          else m = (y - RT) % 3 === 1 ? M.ROOF_LT : M.ROOF;
          // 光の当たる左上
          if (x - l < 5 + t * 8 && (y - RT) % 3 === 1 && tile !== 0)
            m = M.ROOF_HI;
          put(x, y, m);
        }
      }
      rect(46, RT - 1, 31, 1, M.ROOF_HI);
      // 軒先
      for (let x = X0 - 6; x <= X1 + 6; x++) {
        put(x, TOP, M.WOOD_DK);
        if (x % 3 === 0) put(x, TOP + 1, M.WOOD_DK);
      }

      // 戸口
      rect(67, 66, 12, 19, M.WOOD_DK);
      rect(68, 67, 10, 18, M.WOOD);
      for (let x = 70; x < 78; x += 3) rect(x, 67, 1, 18, M.WOOD_DK);
      rect(68, 72, 10, 1, M.WOOD_DK);
      rect(69, 68, 8, 3, M.GLASS);
      put(70, 69, M.GLASS_HI);
      put(71, 69, M.GLASS_HI);
      put(76, 77, M.FLOWER_A);
      rect(66, 85, 14, 2, M.STONE_LT);
      rect(65, 87, 16, 1, M.STONE);

      // 窓枠と花の箱（窓の中は毎フレーム描く）
      rect(44, 59, 18, 16, M.WOOD_DK);
      rect(43, 75, 20, 3, M.WOOD);
      rect(43, 75, 20, 1, M.WOOD_LT);
      const r = seeded(77);
      for (let x = 44; x < 62; x++) {
        if (r() < 0.75) put(x, 74, r() < 0.5 ? M.FLOWER_A : M.FLOWER_C);
        if (r() < 0.5) put(x, 73, M.STEM);
      }

      // 灯りの腕木
      put(64, 63, M.WOOD_DK);
      put(65, 63, M.WOOD_DK);

      // 郵便受け
      rect(92, 82, 1, 8, M.WOOD_DK);
      rect(90, 78, 6, 4, M.ROOF_LT);
      rect(90, 78, 6, 1, M.ROOF_HI);
      put(96, 79, M.FLOWER_A);
      put(96, 80, M.FLOWER_A);
    };

    const buildCanopy = () => {
      // 木の葉：かたまりの集まり。左上が明るい
      canopy = [];
      const r = seeded(303);
      const CX = 146;
      const CY = 44;
      const blobs = [[CX, CY, 21]];
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2;
        const d = 14 + r() * 13;
        blobs.push([
          CX + Math.cos(a) * d * 1.08,
          CY + Math.sin(a) * d * 0.82,
          6 + r() * 7,
        ]);
      }
      for (let y = CY - 36; y <= CY + 32; y++) {
        for (let x = CX - 42; x <= CX + 42; x++) {
          let inside = false;
          let best = 0;
          for (const [bx, by, br] of blobs) {
            const d = Math.hypot(x - bx, y - by);
            if (d < br) {
              inside = true;
              best = Math.max(best, 1 - d / br);
            }
          }
          if (!inside) continue;
          const lightDir = ((CX - x) * 0.4 + (CY - y) * 0.75) / 26;
          const clump = best * 0.5;
          const grain =
            noiseB(x * 0.26 + 20, y * 0.3) * 0.7 +
            noiseA(x * 0.7, y * 0.7) * 0.3;
          const v =
            lightDir * 0.34 +
            clump +
            grain +
            (bayerAt(x, y) / 16 - 0.5) * 0.16 -
            0.3;
          const m =
            v > 0.82
              ? M.LEAF3
              : v > 0.52
                ? M.LEAF2
                : v > 0.26
                  ? M.LEAF1
                  : M.LEAF0;
          canopy.push(x, y, m);
        }
      }
    };

    const paintTrunk = () => {
      const X = 143;
      for (let y = 56; y < 90; y++) {
        const flare = y > 83 ? (y - 83) * 0.8 : 0;
        const up = y < 66 ? (66 - y) * 0.1 : 0;
        const l = Math.round(X - flare - up);
        const r = Math.round(X + 7 + flare * 0.9 + up);
        for (let x = l; x <= r; x++) {
          const t = (x - l) / Math.max(r - l, 1);
          const grain = noiseB(x * 0.9, y * 0.14) > 0.55;
          put(
            x,
            y,
            t > 0.84
              ? M.BARK
              : t < 0.2
                ? M.WOOD_LT
                : grain
                  ? M.BARK_LT
                  : M.WOOD,
          );
        }
      }
      // 根もとの石
      rect(156, 87, 5, 2, M.STONE);
      rect(157, 86, 3, 1, M.STONE_LT);
      rect(124, 95, 4, 2, M.STONE);
      rect(125, 94, 2, 1, M.STONE_LT);
    };

    const buildBase = () => {
      matBuf.fill(0);
      paintGround();
      paintFence();
      paintBush(22, 78, 16, 8, 61);
      paintBush(176, 80, 14, 7, 62);
      paintBush(-6, 81, 11, 6, 63);
      paintBush(204, 81, 10, 5, 64);
      paintTrunk();
      paintHouse();
      paintFlowers(96, 126, 85, 92, 26, 91);
      paintFlowers(14, 38, 86, 96, 16, 92);
      paintFlowers(150, 205, 90, 106, 24, 93);
      paintFlowers(-14, 14, 88, 104, 12, 95);
      paintFlowers(40, 62, 90, 104, 12, 94);
      baseBuf.set(matBuf);
      buildCanopy();

      const r = seeded(808);
      stars = [];
      for (let i = 0; i < 95; i++) {
        stars.push({
          x: Math.floor(r() * (CORE_W + 40)) - 20,
          y: Math.floor(r() * 66),
          seed: r(),
          big: r() < 0.14,
        });
      }
      // 空を時刻のかなめごとに描いておく
      skyKeys = KEYS.map(([, , stops]) => {
        const sky = new Uint8Array(bw * bh);
        const n = stops.length - 1;
        for (let py = 0; py < bh; py++) {
          const pos = clamp((py - oy) / HORIZON) * n;
          const a = Math.min(Math.floor(pos), n);
          const b = Math.min(a + 1, n);
          // 帯のあいだだけを、市松の点で埋める
          const f = smoothstep(0.3, 0.7, pos - a) * 4;
          for (let px = 0; px < bw; px++) {
            const cell = ((py & 1) << 1) | (px & 1);
            sky[py * bw + px] = f > [0, 2, 3, 1][cell] ? stops[b] : stops[a];
          }
        }
        return sky;
      });
    };

    // ---- 住人と世界の動き
    const res = {
      x: 73,
      inside: false,
      face: 1,
      step: 0,
      doorOpen: 0,
      startle: 0,
      hop: 0,
      blink: 0,
      nextBlink: 2,
      page: 0,
      nextPage: 4,
      pageT: 0,
      hurry: 0,
    };
    const clouds = [
      { x: 8, y: 13, w: 30, h: 9, seed: 1, speed: 0.55 },
      { x: 88, y: 24, w: 22, h: 7, seed: 2, speed: 0.8 },
      { x: 150, y: 9, w: 34, h: 10, seed: 3, speed: 0.42 },
      { x: 214, y: 30, w: 18, h: 5, seed: 4, speed: 1.05 },
    ].map((cloud) => {
      const r = seeded(cloud.seed * 977);
      const blobs = Array.from({ length: 6 }, (_, i) => [
        cloud.w * ((i + 0.5) / 6) + (r() - 0.5) * 3,
        cloud.h * (0.45 + (r() - 0.5) * 0.35),
        cloud.h * (0.3 + r() * 0.32),
      ]);
      const list = [];
      for (let y = 0; y < cloud.h + 3; y++) {
        for (let x = -2; x < cloud.w + 3; x++) {
          let inside = false;
          for (const [bx, by, br] of blobs)
            if (Math.hypot(x - bx, (y - by) * 1.25) < br) inside = true;
          if (!inside) continue;
          list.push(x, y, y > cloud.h * 0.62 ? 1 : 0);
        }
      }
      return { ...cloud, list };
    });
    const smoke = [];
    const zees = [];
    const leaves = [];
    const birds = { t: -1, next: 8, y: 20, dir: 1 };
    const shoot = { t: -1, next: 14 };
    const flies = Array.from({ length: 8 }, (_, i) => ({
      seed: i * 7.3 + 1,
      x: 150 + (i - 3) * 9,
      y: 88 + (i % 3) * 6,
    }));
    const butterfly = { x: 108, y: 84 };
    let anim = 0;
    let smokeAcc = 0;
    let zeeAcc = 0;
    let lampFlick = 1;
    let windowL = 0;
    let lanternL = 0;
    let shutter = 0;

    const hourOf = (clock) => ((clock % 24) + 24) % 24;

    // 時刻から、住人の予定を決める
    const planFor = (h) => {
      if (h >= 9.6 && h < 11) return { outside: true, x: 104, act: "tend" };
      if (h >= 11 && h < 16.2) return { outside: true, x: 131, act: "read" };
      if (h >= 16.2 && h < 17.2) return { outside: true, x: 88, act: "stroll" };
      return { outside: false, x: 73, act: "in" };
    };

    const stepResident = (dt, h, speedHint) => {
      const plan = planFor(h);
      const want = plan.outside ? plan.x : 73;
      if (calm) {
        res.inside = !plan.outside;
        res.x = want;
        return plan;
      }
      res.startle = Math.max(0, res.startle - dt);
      res.hop =
        res.startle > 0.55
          ? Math.sin(((0.9 - res.startle) / 0.35) * Math.PI) * 3
          : 0;
      res.doorOpen = Math.max(0, res.doorOpen - dt);
      if (res.startle > 0) return plan;

      if (res.inside && plan.outside) {
        res.inside = false;
        res.x = 73;
        res.doorOpen = 0.5;
      }
      if (!res.inside) {
        const delta = want - res.x;
        if (Math.abs(delta) > 0.5) {
          const speed =
            17 + clamp(speedHint, 0, 1) * 72 + (Math.abs(delta) > 34 ? 8 : 0);
          const move = Math.min(Math.abs(delta), speed * dt);
          res.x += Math.sign(delta) * move;
          res.face = Math.sign(delta);
          res.step += move * 0.28;
          res.hurry = speedHint;
        } else {
          res.x = want;
          res.step = 0;
          if (!plan.outside) {
            res.inside = true;
            res.doorOpen = 0.45;
          }
        }
      }
      // まばたき、ページをめくる
      res.nextBlink -= dt;
      if (res.nextBlink <= 0) {
        res.blink = 0.13;
        res.nextBlink = 1.8 + Math.random() * 3.4;
      }
      res.blink = Math.max(0, res.blink - dt);
      res.nextPage -= dt;
      if (res.nextPage <= 0) {
        res.pageT = 0.42;
        res.nextPage = 3.6 + Math.random() * 3.2;
      }
      res.pageT = Math.max(0, res.pageT - dt);
      return plan;
    };

    const drawSky = (h) => {
      const dark = smoothstep(18.2, 20.2, h) + (1 - smoothstep(4.6, 6.2, h));
      const night = clamp(dark);

      // 星：夜だけ。またたく
      if (night > 0.02) {
        for (const s of stars) {
          if (s.seed > night * 1.05) continue;
          const twinkle = calm
            ? 1
            : Math.sin(anim * (1.3 + s.seed * 4.4) + s.seed * 40);
          if (twinkle < -0.72) continue;
          const m = twinkle < 0.1 && !s.big ? M.STAR_DIM : M.STAR;
          putSky(s.x, s.y, m);
          if (s.big && twinkle > 0.55) {
            putSky(s.x - 1, s.y, M.STAR_DIM);
            putSky(s.x + 1, s.y, M.STAR_DIM);
            putSky(s.x, s.y - 1, M.STAR_DIM);
            putSky(s.x, s.y + 1, M.STAR_DIM);
          }
        }
        // 流れ星
        if (!calm && night > 0.9) {
          if (shoot.t >= 0) {
            const f = shoot.t / 0.55;
            for (let i = 0; i < 7; i++) {
              const u = f * 42 - i * 2;
              if (u > 0 && u < 42)
                putSky(
                  Math.round(shoot.x + u),
                  Math.round(shoot.y + u * 0.45),
                  i < 2 ? M.STAR : M.STAR_DIM,
                );
            }
          }
        }
      }

      // 太陽：空を弧を描いて動く
      if (h > 5.2 && h < 19) {
        const a = ((h - 6) / 12) * Math.PI;
        const sx = Math.round(96 - Math.cos(a) * 102);
        const sy = Math.round(HORIZON - 2 - Math.sin(a) * 70);
        const low = 1 - clamp(Math.sin(a) * 1.6);
        const R = 5 + Math.round(low * 2);
        for (let dy = -R - 5; dy <= R + 5; dy++) {
          for (let dx = -R - 5; dx <= R + 5; dx++) {
            const d = Math.hypot(dx, dy);
            const x = sx + dx;
            const y = sy + dy;
            if (d <= R - 1) {
              putSky(x, y, M.SUN);
              emit(x, y, 26 + low * 90, 1);
            } else if (d <= R) {
              putSky(x, y, M.SUN_RIM);
            } else if (d <= R + 4 && bayerAt(x, y) < (R + 4.6 - d) * 2.2) {
              putSky(x, y, M.SUN_RIM);
            }
          }
        }
      }

      // 月
      const mh = h >= 17.6 ? h : h + 24;
      if (mh > 17.6 && mh < 30.4) {
        const a = ((mh - 18) / 12) * Math.PI;
        const mx = Math.round(96 - Math.cos(a) * 102);
        const my = Math.round(HORIZON - 2 - Math.sin(a) * 66);
        const R = 6;
        for (let dy = -R - 3; dy <= R + 3; dy++) {
          for (let dx = -R - 3; dx <= R + 3; dx++) {
            const d = Math.hypot(dx, dy);
            const x = mx + dx;
            const y = my + dy;
            if (d <= R) {
              const crater =
                (dx === -2 && dy === -2) ||
                (dx === 2 && dy === 1) ||
                (dx === -3 && dy === 2) ||
                (dx === 1 && dy === -3) ||
                (dx === 3 && dy === -1) ||
                (dx === -1 && dy === 3);
              const shaded = dx * 0.7 + dy * 0.7 > R * 0.45;
              putSky(x, y, crater || shaded ? M.MOON_DK : M.MOON);
              emit(x, y, 12, 1);
            } else if (d <= R + 3 && bayerAt(x, y) < (R + 3.4 - d) * 1.6) {
              putSky(x, y, M.STAR_DIM);
            }
          }
        }
      }

      // 雲
      for (const cloud of clouds) {
        const span = CORE_W + 96;
        const cx =
          ((cloud.x + (calm ? 0 : anim * cloud.speed) + 48) % span) - 48;
        const x0 = Math.round(cx);
        for (let i = 0; i < cloud.list.length; i += 3) {
          const x = x0 + cloud.list[i];
          const y = cloud.y + cloud.list[i + 1];
          const under = cloud.list[i + 2];
          if (under && bayerAt(x, y) > 11) continue;
          putSky(x, y, under ? M.CLOUD_SH : M.CLOUD);
        }
      }

      // 鳥：昼に、ときどき渡る
      if (!calm && h > 7 && h < 18.5 && birds.t >= 0) {
        const flap = Math.floor(anim * 7) % 2;
        for (let i = 0; i < 4; i++) {
          const x = Math.round(
            (birds.dir > 0 ? -12 + birds.t * 26 : CORE_W + 12 - birds.t * 26) -
              birds.dir * i * 6,
          );
          const y = birds.y + (i % 2) * 3 + i;
          putSky(x, y, M.BIRD);
          putSky(x - 1, y - flap, M.BIRD);
          putSky(x + 1, y - flap, M.BIRD);
        }
      }
    };

    const drawShadows = (h) => {
      if (h < 6.2 || h > 18.6) return;
      const a = ((h - 6) / 12) * Math.PI;
      const dir = -Math.cos(a); // 太陽が左なら、影は右へ
      const fade = smoothstep(6.2, 7.6, h) * (1 - smoothstep(17.4, 18.6, h));
      const reach = 3 + Math.abs(dir) * 22;
      const mark = (x, y, strength) => {
        const px = x + ox;
        const py = y + oy;
        if (px < 0 || py < 0 || px >= bw || py >= bh) return;
        const i = py * bw + px;
        if (matBuf[i] !== 0 && strength * fade * 16 > bayerAt(x, y))
          varBuf[i] = 1;
      };
      // 木の影
      const tx = 146 + -dir * 0 - dir * -1 * reach * 0.8;
      for (let y = 87; y < 101; y++) {
        const t = (y - 87) / 14;
        const half =
          25 *
          Math.sqrt(1 - Math.pow(t * 2 - 1, 2)) *
          (1 + Math.abs(dir) * 0.3);
        const cx = tx + (t - 0.5) * dir * 8;
        for (let x = Math.round(cx - half); x <= cx + half; x++)
          mark(x, y, 1 - (Math.abs(x - cx) / (half + 1)) * 0.4);
      }
      // 家の影
      for (let y = 87; y < 94; y++) {
        const t = (y - 87) / 7;
        const shift = dir * reach * 0.8 * t;
        for (
          let x = Math.round(36 + Math.min(shift, 0));
          x <= 86 + Math.max(shift, 0);
          x++
        )
          mark(x, y, 1 - t * 0.5);
      }
    };

    const drawWindow = (h) => {
      // 窓の中：14×12
      const WX = 46;
      const WY = 61;
      const WW = 14;
      const WH = 12;
      const lamp = h >= 19.6 && h < 22.9;
      const cook = h >= 17.2 && h < 19.6;
      const morning = h >= 7 && h < 9.6;
      const asleep = h >= 22.9 || h < 6.5;

      if (lamp || cook) {
        const flick = lamp ? lampFlick : 0.6 + 0.08 * Math.sin(anim * 9);
        const swing =
          lamp && !calm ? Math.round(Math.sin(anim * 0.9) * 0.7) : 0;
        for (let y = 0; y < WH; y++) {
          for (let x = 0; x < WW; x++) {
            let m;
            if (lamp) {
              // 灯りの下に、広がる光の円すい
              const cone = Math.abs(x - (4.5 + swing)) - (y - 2) * 0.62;
              m = cone < 0 && y >= 3 ? M.LIT_HI : cone < 2.2 ? M.LIT : M.LIT_DK;
            } else {
              m =
                Math.hypot(x - 6.5, y - 8) < 5 && bayerAt(x, y) < 8
                  ? M.LIT
                  : M.LIT_DK;
            }
            if (y >= WH - 1) m = M.LIT_DK;
            put(WX + x, WY + y, m);
            if (y < WH)
              emit(
                WX + x,
                WY + y,
                (m === M.LIT_HI ? 255 : m === M.LIT ? 210 : 130) * flick,
                0,
              );
          }
        }
        if (lamp) {
          // 天井から下がる灯り：コードと、かさと、電球
          const lx = WX + 4 + swing;
          put(lx, WY, M.SIL);
          put(lx, WY + 1, M.SIL);
          rect(lx - 2, WY + 2, 5, 1, M.SIL);
          rect(lx - 1, WY + 3, 3, 1, M.LIT_HI);
          // 机と、開いた本
          rect(WX + 1, WY + 10, 9, 1, M.SIL);
          rect(WX + 2, WY + 11, 1, 1, M.SIL);
          rect(WX + 8, WY + 11, 1, 1, M.SIL);
          const pageUp = res.pageT > 0 && !calm;
          rect(WX + 4, WY + 9, 3, 1, M.SIL);
          if (pageUp) put(WX + 5, WY + 8, M.SIL);
          // 机に向かう人影。ときどき顔を上げる。まだ外にいるあいだは、誰もいない
          if (!res.inside) return { lamp, cook, asleep };
          const startled = res.startle > 0;
          const look = startled || (!calm && Math.sin(anim * 0.46) > 0.72);
          const nod = !calm && !look && Math.sin(anim * 1.7) > 0.86 ? 1 : 0;
          const hy = WY + 3 + nod - (startled ? 1 : 0);
          const hx = WX + 8;
          // 頭
          rect(hx, hy + (look ? 0 : 1), 4, 3, M.SIL);
          put(hx + 1, hy + (look ? -1 : 0), M.SIL);
          put(hx + 2, hy + (look ? -1 : 0), M.SIL);
          if (!look) put(hx - 1, hy + 2, M.SIL);
          // 肩と背
          rect(WX + 8, WY + 7, 5, 3, M.SIL);
          rect(WX + 9, WY + 10, 4, 2, M.SIL);
          // 机へのばした腕
          rect(WX + 6, WY + 8, 3, 1, M.SIL);
        } else {
          // 夕方：台所を行き来する人影と、湯気
          const walk = calm ? 0 : Math.sin(anim * 0.8) * 3;
          if (res.inside)
            blit(SPR.sil, Math.round(WX + 3 + walk), WY + 5, false, M.SIL);
          if (!calm) {
            for (let i = 0; i < 3; i++) {
              const s = (anim * 0.9 + i * 0.33) % 1;
              put(
                WX + 11 + Math.round(Math.sin(s * 8 + i)),
                WY + 7 - Math.round(s * 6),
                M.LIT_HI,
              );
            }
          }
          rect(WX + 10, WY + 8, 4, 1, M.SIL);
        }
      } else if (morning) {
        // 朝：窓を開けて、伸びをする
        rect(WX, WY, WW, WH, M.ROOM);
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < WW; x++) put(WX + x, WY + y, M.GLASS_HI);
        let bust = SPR.bust;
        if (!calm) {
          const c = (anim % 5.4) / 5.4;
          if (c > 0.16 && c < 0.24) bust = SPR.bustHalf;
          else if (c >= 0.24 && c < 0.5) bust = SPR.bustUp;
          else if (c >= 0.5 && c < 0.58) bust = SPR.bustHalf;
          else if (res.blink > 0) bust = SPR.bustBlink;
        }
        const dy = res.startle > 0 ? -1 : 0;
        if (res.inside) blit(bust, WX + 3, WY + 4 + dy);
      } else {
        // 昼間と夜中：暗いガラス。斜めの映り込み
        rect(WX, WY, WW, WH, M.GLASS);
        for (let i = 0; i < 6; i++) {
          put(WX + 2 + i, WY + 7 - i, M.GLASS_HI);
          if (i < 4) put(WX + 6 + i, WY + 8 - i, M.GLASS_HI);
        }
      }

      // 桟
      rect(WX + 6, WY, 2, 2, M.WOOD_DK);
      rect(WX, WY + 4, 1, 1, M.WOOD_DK);
      rect(WX + 13, WY + 4, 1, 1, M.WOOD_DK);

      // 鎧戸：眠る時間は閉じ、朝に開く
      const closed = asleep ? 1 : 0;
      shutter += calm ? closed - shutter : clamp(closed - shutter, -0.09, 0.09);
      const leaf = Math.round(shutter * 7);
      const drawLeaf = (x0, w) => {
        for (let i = 0; i < w; i++) {
          for (let y = 0; y < 14; y++)
            put(x0 + i, 60 + y, y % 2 === 0 ? M.WOOD : M.WOOD_LT);
        }
      };
      // 開いている鎧戸は窓の両わきに、閉じると窓の上に
      const open = 4 - Math.min(4, leaf);
      if (open > 0) {
        drawLeaf(44 - open, open);
        drawLeaf(62, open);
      }
      if (leaf > 0) {
        drawLeaf(46, leaf);
        drawLeaf(60 - leaf, leaf);
      }

      return { lamp, cook, asleep };
    };

    const drawDoor = () => {
      if (res.doorOpen > 0) {
        rect(68, 67, 10, 18, M.SIL);
        rect(68, 67, 2, 18, M.WOOD_LT);
      }
    };

    const drawResident = (plan, h) => {
      if (res.inside) return;
      const base = 89;
      const dy = -Math.round(res.hop);
      const startled = res.startle > 0;
      const moving = Math.abs((plan.outside ? plan.x : 73) - res.x) > 0.5;
      if (!moving && plan.act === "read" && Math.abs(res.x - 131) < 1) {
        // 木にもたれて、本を読む
        const up = startled;
        const spr = up ? SPR.seatUp : res.blink > 0 ? SPR.seatBlink : SPR.seat;
        const x = 131;
        const y = base - 10 + dy;
        blit(spr, x, y);
        // 本
        const bx = x - 1;
        const by = y + 5;
        if (!up) {
          if (res.pageT > 0.28) {
            rect(bx, by, 4, 3, M.BOOK);
            rect(bx + 1, by - 1, 2, 1, M.BOOK_DK);
          } else if (res.pageT > 0.14) {
            rect(bx + 1, by - 2, 2, 5, M.BOOK);
          } else {
            rect(bx, by, 4, 3, M.BOOK);
            rect(bx + 3, by, 1, 3, M.BOOK_DK);
            put(bx + 1, by + 1, M.BOOK_DK);
          }
        } else {
          rect(bx, by + 1, 4, 2, M.BOOK_DK);
        }
        // つま先が小さく動く
        if (!calm && Math.sin(anim * 1.1) > 0.8) put(x + 1, y + 9, M.BOOT);
        if (startled) {
          rect(x + 5, y - 7, 1, 4, M.MARK);
          put(x + 5, y - 2, M.MARK);
        }
        return;
      }
      if (!moving && plan.act === "tend") {
        const bob = !calm && Math.sin(anim * 2.2) > 0;
        blit(
          bob ? SPR.crouch : SPR.stand,
          Math.round(res.x) - 3,
          bob ? base - 10 : base - 12,
          false,
        );
        return;
      }
      let spr = SPR.stand;
      if (startled) spr = SPR.up;
      else if (moving) spr = SPR.walk[Math.floor(res.step) % 4];
      else if (res.blink > 0) spr = SPR.blink;
      blit(spr, Math.round(res.x) - 3, base - 12 + dy, res.face < 0);
      if (startled) {
        rect(Math.round(res.x), base - 19 + dy, 1, 4, M.MARK);
        put(Math.round(res.x), base - 14 + dy, M.MARK);
      }
    };

    const drawCanopy = () => {
      for (let i = 0; i < canopy.length; i += 3) {
        const y = canopy[i + 1];
        // 風：上ほど大きく、段ごとにずれて揺れる
        const sway = calm
          ? 0
          : Math.round(
              Math.sin(anim * 0.9 + y * 0.11) * (1.15 - (y - 10) * 0.012),
            );
        put(canopy[i] + sway, y, canopy[i + 2]);
      }
    };

    const drawParticles = (h, dt) => {
      // 煙
      const smoking = (h >= 17.2 && h < 19.8) || (h >= 7 && h < 8.2);
      if (!calm && smoking) {
        smokeAcc += dt * (h >= 17 ? 3.2 : 1.4);
        while (smokeAcc >= 1) {
          smokeAcc -= 1;
          smoke.push({
            x: 72 + Math.random() * 2,
            y: 25,
            t: 0,
            seed: Math.random() * 10,
          });
        }
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.t += dt;
        s.y -= dt * (7 - s.t * 0.8);
        s.x += dt * (2.2 + Math.sin(s.t * 1.7 + s.seed) * 2.6);
        if (s.t > 4.2 || s.y < -4) {
          smoke.splice(i, 1);
          continue;
        }
        const size = 1 + Math.floor(s.t * 0.75);
        const thin = s.t * 2.6;
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const x = Math.round(s.x) + dx;
            const y = Math.round(s.y) + dy;
            if (bayerAt(x, y) < 16 - thin * 1.3)
              put(x, y, s.t > 2.3 ? M.SMOKE_DK : M.SMOKE);
          }
        }
      }
      if (calm && smoking) {
        for (let i = 0; i < 5; i++) {
          const y = 24 - i * 4;
          const x = 72 + i * 2;
          rect(x, y, 1 + (i >> 1), 2, M.SMOKE);
        }
      }

      // 眠りの Z
      if (!calm && (h >= 23.4 || h < 6)) {
        zeeAcc += dt * 0.62;
        while (zeeAcc >= 1) {
          zeeAcc -= 1;
          zees.push({ x: 60, y: 58, t: 0 });
        }
      }
      for (let i = zees.length - 1; i >= 0; i--) {
        const z = zees[i];
        z.t += dt;
        z.y -= dt * 4;
        z.x += dt * (1.2 + Math.sin(z.t * 2) * 2);
        if (z.t > 3 || (h >= 6 && h < 23)) {
          zees.splice(i, 1);
          continue;
        }
        const x = Math.round(z.x);
        const y = Math.round(z.y);
        const big = z.t > 1.2;
        const n = big ? 3 : 2;
        rect(x, y, n, 1, M.ZZZ);
        put(x + n - 2, y + 1, M.ZZZ);
        if (big) put(x, y + 2 - 0, M.ZZZ);
        rect(x, y + (big ? 3 : 2), n, 1, M.ZZZ);
      }

      // 蛍
      const night = clamp(
        smoothstep(19.4, 20.8, h) + (1 - smoothstep(3.6, 5, h)),
      );
      if (night > 0.3 && !calm) {
        for (const f of flies) {
          const wx =
            f.x +
            Math.sin(anim * 0.33 + f.seed) * 14 +
            Math.sin(anim * 0.9 + f.seed * 2) * 3;
          const wy = f.y + Math.sin(anim * 0.47 + f.seed * 1.4) * 5;
          const pulse = Math.sin(anim * 1.4 + f.seed * 3);
          if (pulse < 0.1) continue;
          put(Math.round(wx), Math.round(wy), M.FIREFLY);
          emit(Math.round(wx), Math.round(wy), 170 * pulse);
        }
      }

      // 蝶
      if (!calm && h > 8 && h < 17) {
        butterfly.x =
          108 + Math.sin(anim * 0.31) * 15 + Math.sin(anim * 1.1) * 2;
        butterfly.y = 82 + Math.sin(anim * 0.72) * 5;
        const x = Math.round(butterfly.x);
        const y = Math.round(butterfly.y);
        put(x, y, M.WOOD_DK);
        if (Math.floor(anim * 6) % 2) {
          put(x - 1, y - 1, M.WING);
          put(x + 1, y - 1, M.WING);
        } else {
          put(x - 1, y, M.WING);
          put(x + 1, y, M.WING);
        }
      }

      // 舞う葉
      if (!calm && h > 7 && h < 19 && Math.random() < dt * 0.18)
        leaves.push({
          x: 124 + Math.random() * 44,
          y: 54 + Math.random() * 14,
          t: 0,
          seed: Math.random() * 6,
        });
      for (let i = leaves.length - 1; i >= 0; i--) {
        const l = leaves[i];
        l.t += dt;
        l.y += dt * 9;
        l.x += Math.sin(l.t * 2.3 + l.seed) * dt * 11 - dt * 2;
        if (l.y > 96 || l.t > 8) {
          leaves.splice(i, 1);
          continue;
        }
        put(Math.round(l.x), Math.round(l.y), M.LEAF3);
      }
    };

    const drawLights = (state, h) => {
      // 灯りの強さ
      const targetWin = state.lamp ? 1 : state.cook ? 0.46 : 0;
      const targetLan = h >= 18.4 && h < 22.9 ? 1 : 0;
      windowL += (targetWin - windowL) * (calm ? 1 : 0.28);
      lanternL += (targetLan - lanternL) * (calm ? 1 : 0.28);

      // 軒下の灯り
      if (lanternL > 0.02) {
        const flick = calm
          ? 1
          : 0.94 + 0.06 * Math.sin(anim * 11) * Math.sin(anim * 3.7);
        rect(64, 64, 3, 1, M.WOOD_DK);
        rect(64, 65, 3, 3, M.LIT_HI);
        rect(64, 68, 3, 1, M.WOOD_DK);
        for (let y = 65; y < 68; y++)
          for (let x = 64; x < 67; x++) emit(x, y, 255 * lanternL * flick, 0);
      } else {
        rect(64, 64, 3, 1, M.WOOD_DK);
        rect(64, 65, 3, 3, M.GLASS);
        rect(64, 68, 3, 1, M.WOOD_DK);
      }

      const pool = (cx, cy, rx, ry, L) => {
        if (L <= 0.01) return;
        for (let y = Math.max(cy - ry, -oy); y <= cy + ry; y++) {
          for (let x = cx - rx; x <= cx + rx; x++) {
            const px = x + ox;
            const py = y + oy;
            if (px < 0 || py < 0 || px >= bw || py >= bh) continue;
            const i = py * bw + px;
            const m = matBuf[i];
            if (
              m === 0 ||
              m === M.SIL ||
              m === M.LIT ||
              m === M.LIT_HI ||
              m === M.LIT_DK
            )
              continue;
            const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
            const v = (1 - d) * L * 1.5;
            if (v * 16 > bayerAt(x, y)) varBuf[i] = 2;
          }
        }
      };
      // 窓から地面へ落ちる光と、壁を照らす光
      pool(53, 92, 26, 12, windowL * 0.95);
      pool(53, 67, 17, 10, windowL * 0.36);
      pool(65, 69, 11, 13, lanternL * 0.5);
      pool(65, 90, 19, 7, lanternL * 0.6);
    };

    // ---- 世界を1枚描く
    let keyA = 0;
    let keyB = 1;
    let keyP = 0;
    const pickKeys = (h) => {
      for (let i = 0; i < KEYS.length - 1; i++) {
        if (h >= KEYS[i][0] && h < KEYS[i + 1][0]) {
          keyA = i;
          keyB = i + 1;
          keyP = clamp(
            ((h - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]) - 0.32) / 0.36,
          );
          return;
        }
      }
      keyA = 0;
      keyB = 1;
      keyP = 0;
    };

    const renderWorld = (clock, dt, hurry) => {
      const h = hourOf(clock);
      if (!calm) anim += dt;
      matBuf.set(baseBuf);
      varBuf.fill(0);
      emitList.length = 0;
      for (const c of sources) {
        c.w = 0;
        c.x = 0;
        c.y = 0;
      }
      lampFlick = calm
        ? 1
        : 0.95 + 0.05 * Math.sin(anim * 13) * Math.sin(anim * 5.3);

      if (!calm) {
        birds.next -= dt;
        if (birds.t >= 0) {
          birds.t += dt;
          if (birds.t > 9) birds.t = -1;
        } else if (birds.next <= 0) {
          birds.t = 0;
          birds.next = 12 + Math.random() * 14;
          birds.y = 10 + Math.random() * 24;
          birds.dir = Math.random() < 0.5 ? 1 : -1;
        }
        shoot.next -= dt;
        if (shoot.t >= 0) {
          shoot.t += dt;
          if (shoot.t > 0.6) shoot.t = -1;
        } else if (shoot.next <= 0) {
          shoot.t = 0;
          shoot.next = 9 + Math.random() * 16;
          shoot.x = 10 + Math.random() * 130;
          shoot.y = 2 + Math.random() * 20;
        }
      }

      const plan = stepResident(dt, h, hurry);
      drawSky(h);
      drawShadows(h);
      const state = drawWindow(h);
      drawDoor();
      drawLights(state, h);
      drawResident(plan, h);
      drawCanopy();
      drawParticles(h, dt);

      // ---- 材質 → パレット。時刻のかなめのあいだは、ディザで置き換える
      pickKeys(h);
      const ta = table[keyA];
      const tb = table[keyB];
      const sa = skyKeys[keyA];
      const sb = skyKeys[keyB];
      const p = keyP * 16;
      const n = bw * bh;
      for (let i = 0; i < n; i++) {
        const m = matBuf[i];
        const useB = thrA[i] < p;
        const idx =
          m === 0
            ? useB
              ? sb[i]
              : sa[i]
            : (useB ? tb : ta)[varBuf[i] * NM + m];
        pixels[i] = palette32[idx];
      }
    };

    // ---- 光の場：世界の光る画素を格子に集めて、ぼかす
    const GRID_W = 72;
    let GRID_H = 44;
    let glowRaw = new Float32Array(1);
    let glowNearBuf = new Float32Array(1);
    let glowFarBuf = new Float32Array(1);
    let glowTemp = new Float32Array(1);

    const boxBlur = (src, dst, w, h, r) => {
      const size = r * 2 + 1;
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let x = -r; x <= r; x++)
            sum += src[row + clamp(x, 0, w - 1) * 4 + c];
          for (let x = 0; x < w; x++) {
            dst[row + x * 4 + c] = sum / size;
            sum +=
              src[row + clamp(x + r + 1, 0, w - 1) * 4 + c] -
              src[row + clamp(x - r, 0, w - 1) * 4 + c];
          }
        }
      }
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let y = -r; y <= r; y++)
            sum += dst[clamp(y, 0, h - 1) * w * 4 + x * 4 + c];
          for (let y = 0; y < h; y++) {
            src[y * w * 4 + x * 4 + c] = sum / size;
            sum +=
              dst[clamp(y + r + 1, 0, h - 1) * w * 4 + x * 4 + c] -
              dst[clamp(y - r, 0, h - 1) * w * 4 + x * 4 + c];
          }
        }
      }
    };

    // ---- WebGL
    let gl = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    let program = null;
    const loc = {};
    let vao = null;
    let quad = null;
    let texWorld = null;
    let texNear = null;

    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const setupGl = () => {
      if (!gl) return false;
      try {
        program = gl.createProgram();
        const v = compile(gl.VERTEX_SHADER, VERT);
        const f = compile(gl.FRAGMENT_SHADER, FRAG);
        gl.attachShader(program, v);
        gl.attachShader(program, f);
        gl.bindAttribLocation(program, 0, "aPos");
        gl.linkProgram(program);
        gl.deleteShader(v);
        gl.deleteShader(f);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) || "link");
      } catch (error) {
        console.warn(
          "toggle-daylight: シェーダーを作れないので、2D で描く",
          error,
        );
        return false;
      }
      gl.useProgram(program);
      for (const name of [
        "uWorld",
        "uGlowNear",
        "uRes",
        "uPill",
        "uOrigin",
        "uWorldSize",
        "uGlowSize",
        "uLens",
        "uBezel",
        "uK",
        "uNight",
        "uLift",
        "uSeam",
        "uCalm",
        "uShellDay",
        "uShellNight",
        "uInk",
        "uLight",
        "uHiNight",
        "uLoNight",
        "uSkyDay",
        "uHomeCol",
        "uSkyCol",
        "uHomePos",
        "uSkyPos",
      ]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const makeTex = () => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      texWorld = makeTex();
      texNear = makeTex();
      gl.uniform1i(loc.uWorld, 0);
      gl.uniform1i(loc.uGlowNear, 1);
      gl.disable(gl.BLEND);
      return true;
    };
    let ready = setupGl();
    // 文脈が失われているだけなら、2D へ落とさず戻るのを待つ（スマホでは、タブを離れて戻ると起きる）
    let lost = !ready && !!gl && gl.isContextLost();
    let ctx2d = null;
    let lowCanvas = null;
    const useCanvas2d = () => {
      // 1つの canvas に2種類の文脈は持てないので、作り直す
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
      ctx2d = canvas.getContext("2d");
    };
    if (!ready && !lost) useCanvas2d();

    // ---- 形と大きさ
    const shape = {
      W: 1,
      H: 1,
      cssW: 1,
      cssH: 1,
      dpr: 1,
      pillW: 1,
      pillH: 1,
      bezel: 1,
      winW: 1,
      winH: 1,
      r0: 1,
      travel: 1,
      travelCss: 1,
      ox: 0,
      oy: 0,
    };
    let renderScale = 1;
    let fullK = 1; // 解像度を落としていないときの整数倍
    let thumbSeam = 1;

    // 整数倍を高さで決める。切れるのが 12% までなら大きい方。横は景色が両わきへ広がる
    const pickK = (winH) => {
      const whole = Math.max(1, Math.floor(winH / CORE_H));
      return ((whole + 1) * CORE_H) / winH <= 1.12 ? whole + 1 : whole;
    };

    const measure = () => {
      const box = root.getBoundingClientRect();
      const fullDpr = Math.min(2, devicePixelRatio || 1);
      const nextFullK = pickK(
        (Math.round(box.height * fullDpr) / 1.32) * (1 - 0.046 * 2),
      );
      if (nextFullK !== fullK) {
        fullK = nextFullK;
        renderScale = 1;
      }
      const dpr = fullDpr * renderScale;
      const W = Math.max(2, Math.round(box.width * dpr));
      const H = Math.max(2, Math.round(box.height * dpr));
      const changed = W !== shape.W || H !== shape.H;
      shape.W = W;
      shape.H = H;
      shape.cssW = box.width;
      shape.cssH = box.height;
      shape.dpr = dpr;
      // 丸の大きさ：根の中に、1 : 1.85 で置く
      shape.pillH = H / 1.32;
      shape.pillW = shape.pillH * PILL_RATIO;
      shape.bezel = shape.pillH * 0.046;
      shape.winW = shape.pillW - shape.bezel * 2;
      shape.winH = shape.pillH - shape.bezel * 2;
      const gap = shape.pillH * 0.032;
      shape.r0 = shape.winH / 2 - gap;
      shape.travel = shape.winW - (shape.r0 + gap) * 2;
      shape.travelCss = shape.travel / dpr;

      // 画素の格子に合わせる（半端な位置だと、全体がにじむ）
      canvas.style.width = `${W / dpr}px`;
      canvas.style.height = `${H / dpr}px`;
      // DPR が上限の 2 を超える端末では、ブラウザが canvas を拡大する。合わせる格子は端末の画素
      const grid = Math.max(devicePixelRatio || 1, dpr);
      const fx = (box.left * grid) % 1;
      const fy = (box.top * grid) % 1;
      canvas.style.transform = `translate(${-fx / grid}px, ${-fy / grid}px)`;

      if (!changed) return false;
      canvas.width = W;
      canvas.height = H;

      // 解像度を落としても、景色の見え方は変えない（renderScale は整数倍が割り切れる値だけを取る）
      k = Math.max(1, Math.round(fullK * renderScale));
      const needW = Math.ceil(shape.winW / k) + MARGIN * 2;
      const needH = Math.ceil(shape.winH / k) + MARGIN * 2;
      bw = needW + (needW & 1);
      bh = needH + (needH & 1);
      ox = (bw - CORE_W) >> 1;
      oy = (bh - CORE_H) >> 1;
      matBuf = new Uint8Array(bw * bh);
      baseBuf = new Uint8Array(bw * bh);
      varBuf = new Uint8Array(bw * bh);
      pixels = new Uint32Array(bw * bh);
      pixelBytes = new Uint8Array(pixels.buffer);
      thrA = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          // 時刻の置き換えは、空の市松と重ならないよう、位置をずらす
          thrA[y * bw + x] = bayerAt(x + 1, y + 2);
        }
      }
      buildBase();

      // 世界の左上の、画面の画素での位置（必ず整数）
      shape.ox = Math.floor(W / 2 - (bw * k) / 2);
      shape.oy = Math.floor(H / 2 + (bh * k) / 2);
      thumbSeam = Math.max(1, Math.round(k * 0.055));

      GRID_H = Math.max(8, Math.round((GRID_W * H) / W));
      const size = GRID_W * GRID_H * 4;
      glowRaw = new Float32Array(size);
      glowNearBuf = new Float32Array(size);
      glowFarBuf = new Float32Array(size);
      glowTemp = new Float32Array(size);

      if (ready) {
        gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texWorld);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          bw,
          bh,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR,
        );
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texNear);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,
          GRID_W,
          GRID_H,
          0,
          gl.RGBA,
          gl.FLOAT,
          null,
        );
      } else {
        lowCanvas = offscreen(bw, bh);
      }
      return true;
    };

    const uploadWorld = () => {
      // 光の場
      glowRaw.fill(0);
      for (let e = 0; e < emitList.length; e += 2) {
        const i = emitList[e];
        const w = emitList[e + 1] / 255;
        const px = i % bw;
        const py = (i - px) / bw;
        const fx = ((shape.ox + (px + 0.5) * k) / shape.W) * GRID_W;
        const fy = ((shape.H - shape.oy + (py + 0.5) * k) / shape.H) * GRID_H;
        const gx = clamp(Math.floor(fx), 0, GRID_W - 1);
        const gy = clamp(Math.floor(fy), 0, GRID_H - 1);
        const c = pixels[i];
        const at = (gy * GRID_W + gx) * 4;
        glowRaw[at] += (c & 255) * w * 0.0007;
        glowRaw[at + 1] += ((c >>> 8) & 255) * w * 0.0007;
        glowRaw[at + 2] += ((c >>> 16) & 255) * w * 0.0007;
      }
      glowNearBuf.set(glowRaw);
      boxBlur(glowNearBuf, glowTemp, GRID_W, GRID_H, 1);
      boxBlur(glowNearBuf, glowTemp, GRID_W, GRID_H, 1);
      // 芯のにじみに、広いにじみを足す
      glowFarBuf.set(glowRaw);
      boxBlur(glowFarBuf, glowTemp, GRID_W, GRID_H, 3);
      boxBlur(glowFarBuf, glowTemp, GRID_W, GRID_H, 3);
      for (let i = 0; i < glowNearBuf.length; i++)
        glowNearBuf[i] += glowFarBuf[i] * 0.55;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texWorld);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        bw,
        bh,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixelBytes,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texNear);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        GRID_W,
        GRID_H,
        gl.RGBA,
        gl.FLOAT,
        glowNearBuf,
      );
    };

    // ---- つまみの状態
    let x = root.dataset.night === "1" ? 1 : 0; // 0 = 昼、1 = 夜
    let velocity = 0;
    let target = 0;
    let moving = false;
    let checked = x >= 1;
    let stretch = 0;
    let stretchV = 0;
    let lift = 0;
    let liftTarget = 0;
    let hurry = 0;

    // 時間の流れ：右へは昼から夜へ。右端から戻るときは、夜明けを通って次の昼へ
    let branch = "pm";
    let amStart = CLOCK_NIGHT;
    let nightClock = CLOCK_NIGHT;
    const clockOf = () => {
      if (branch === "am") return mix(36, amStart, x);
      if (x >= 1) return nightClock;
      return CLOCK_DAY + (CLOCK_NIGHT - CLOCK_DAY) * x;
    };
    const beginTravel = () => {
      if (x <= 0.0005) branch = "pm";
      else if (x >= 0.9995) {
        branch = "am";
        amStart = nightClock;
      }
    };

    const setStatus = (text) => {
      if (statusEl.textContent !== text) statusEl.textContent = text;
    };
    const phaseName = (h) =>
      h < 5 || h >= 20
        ? "Night"
        : h < 7
          ? "Dawn"
          : h < 10
            ? "Morning"
            : h < 16.5
              ? "Day"
              : "Evening";

    const commit = (value) => {
      const night = value >= 1;
      x = night ? 1 : 0;
      velocity = 0;
      moving = false;
      if (night) {
        nightClock = branch === "am" ? amStart : CLOCK_NIGHT;
        branch = "pm";
      } else {
        branch = "pm";
      }
      if (checked !== night) {
        checked = night;
        button.setAttribute("aria-checked", String(night));
        root.dispatchEvent(
          new CustomEvent("daylight:change", {
            bubbles: true,
            composed: true,
            detail: { night },
          }),
        );
      }
      setStatus(night ? "Night" : "Day");
    };

    // ---- 描く
    const drawGl = (night) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc.uRes, shape.W, shape.H);
      gl.uniform2f(loc.uPill, shape.pillW / 2, shape.pillH / 2);
      gl.uniform2f(loc.uOrigin, shape.ox, shape.oy);
      gl.uniform2f(loc.uWorldSize, bw, bh);
      gl.uniform2f(loc.uGlowSize, GRID_W, GRID_H);
      gl.uniform1f(loc.uBezel, shape.bezel);
      gl.uniform1f(loc.uK, k);
      gl.uniform1f(loc.uNight, night);
      gl.uniform1f(loc.uLift, lift);
      gl.uniform1f(loc.uSeam, thumbSeam);
      gl.uniform1f(loc.uCalm, calm ? 1 : 0);

      // レンズの形：動くと伸び、離すと弾んで戻る
      const s = clamp(stretch, -0.5, 1.2);
      const r = shape.r0 * (1 + 0.012 * lift);
      const halfX = r * (1 + 0.2 * s);
      const halfY = r * (1 - 0.075 * s);
      const lim = shape.winW / 2 - (shape.winH / 2 - shape.r0) - halfX;
      const raw = (x - 0.5) * shape.travel;
      const cx = clamp(raw, -lim, lim);
      gl.uniform4f(loc.uLens, cx, 0, halfX, halfY);

      gl.uniform3fv(loc.uShellDay, unit(C3));
      gl.uniform3fv(loc.uShellNight, unit(I1));
      gl.uniform3fv(loc.uInk, unit(I0));
      gl.uniform3fv(loc.uLight, unit(C3));
      gl.uniform3fv(loc.uHiNight, unit(I3));
      gl.uniform3fv(loc.uLoNight, unit(I0));
      gl.uniform3fv(loc.uSkyDay, unit(U2));
      // 光る画素の重心と強さ。人影が窓を隠せば弱くなる
      const homeW = sources[0].w;
      const home = unit(A2);
      const homeI = (homeW / 255 / 150) * 1.05;
      const hx =
        homeW > 0
          ? shape.ox + (sources[0].x / homeW + 0.5) * k - shape.W / 2
          : 0;
      const hy =
        homeW > 0
          ? shape.oy - (sources[0].y / homeW + 0.5) * k - shape.H / 2
          : 0;
      gl.uniform2f(loc.uHomePos, hx, hy);
      gl.uniform3f(
        loc.uHomeCol,
        home[0] * homeI,
        home[1] * homeI,
        home[2] * homeI,
      );
      const skyW = sources[1].w;
      const skyU = unit(A3);
      const skyI = (skyW / 255 / 110) * 0.55;
      const sx =
        skyW > 0 ? shape.ox + (sources[1].x / skyW + 0.5) * k - shape.W / 2 : 0;
      const sy =
        skyW > 0 ? shape.oy - (sources[1].y / skyW + 0.5) * k - shape.H / 2 : 0;
      gl.uniform2f(loc.uSkyPos, sx, sy);
      gl.uniform3f(loc.uSkyCol, skyU[0] * skyI, skyU[1] * skyI, skyU[2] * skyI);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const draw2d = (night) => {
      // WebGL が使えないとき：世界だけを整数倍で写し、丸く切って、つまみを置く
      const g = ctx2d;
      const low = lowCanvas.getContext("2d");
      low.putImageData(
        new ImageData(new Uint8ClampedArray(pixels.buffer), bw, bh),
        0,
        0,
      );
      g.clearRect(0, 0, shape.W, shape.H);
      const px = (shape.W - shape.pillW) / 2;
      const py = (shape.H - shape.pillH) / 2;
      g.save();
      g.beginPath();
      g.roundRect(px, py, shape.pillW, shape.pillH, shape.pillH / 2);
      g.clip();
      g.imageSmoothingEnabled = false;
      g.drawImage(lowCanvas, shape.ox, shape.H - shape.oy, bw * k, bh * k);
      g.restore();
      const cx = shape.W / 2 + (x - 0.5) * shape.travel;
      const light = unit(C3).map((v) => Math.round(v * 255));
      g.fillStyle = `rgb(${light[0]} ${light[1]} ${light[2]} / 0.5)`;
      g.beginPath();
      g.arc(cx, shape.H / 2, shape.r0, 0, Math.PI * 2);
      g.fill();
      return night;
    };

    // ---- 時間を進める
    let raf = 0;
    let last = 0;
    let visible = true;
    let pageVisible = root.ownerDocument.visibilityState !== "hidden";
    let worldAcc = 1;
    let dirty = true;
    let slow = 0;
    let good = 0;
    let frames = 0;
    let lastWorldClock = -1;
    let lastNightText = "";
    let drag = null;

    const nightAmount = (h) =>
      clamp(smoothstep(17.4, 20.2, h) + (1 - smoothstep(4.8, 7.2, h)));

    // 描くのに本当に時間がかかっているときだけ、細かさを落とす。
    // コマが少ないだけでは決めない。省電力モードやブラウザの間引きで 30 コマになっている端末では、解像度を下げても速くならず、絵だけが悪くなる。
    const OVERLOAD_MS = 12;
    const COST_SAMPLES = 5;
    const onePixel = new Uint8Array(4);
    let costLeft = 0;
    let costs = [];
    let weighedOnce = false;

    const lowerResolution = () => {
      // 整数倍が割り切れる値にだけ下げる。景色の見え方は変わらない
      const next = (k - 1) / fullK;
      if (k < 2 || next < 0.5) {
        frames = -600; // もう下げられない。しばらく測らない
        return;
      }
      renderScale = next;
      measure();
      dirty = true;
      lastWorldClock = -1;
      frames = 0;
    };

    const adapt = (dt) => {
      ++frames;
      // 重い GPU でも、世界だけが動く 30 コマなら遅れが見えないことがある。つまみを動かす前に、一度は測っておく
      if (frames === 40 && !weighedOnce) {
        weighedOnce = true;
        costLeft = COST_SAMPLES;
        costs = [];
      }
      if (frames < 40) return;
      if (dt > 0.0225) slow++;
      else good++;
      if (slow + good < 50) return;
      const suspect = slow > 30;
      slow = 0;
      good = 0;
      if (suspect) {
        costLeft = COST_SAMPLES;
        costs = [];
      }
    };

    const weighCost = (startedAt) => {
      // readPixels は、ここまでの描画が終わるのを待つ。これで GPU の分も含めた1コマの重さがわかる
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, onePixel);
      costs.push(performance.now() - startedAt);
      if (--costLeft > 0) return;
      const median = costs.sort((a, b) => a - b)[costs.length >> 1];
      if (median > OVERLOAD_MS) lowerResolution();
      else frames = -600; // 重くないなら、しばらく測らない
    };

    const tick = (ms) => {
      raf = 0;
      if (lost) return;
      const t = ms / 1000;
      const dt = last ? Math.min(0.05, t - last) : 1 / 60;
      last = t;

      if (!calm && ready) adapt(dt);

      // ---- つまみ
      if (drag) {
        const before = x;
        x += (clamp(drag.want) - x) * (1 - Math.exp(-dt * 34));
        velocity = (x - before) / Math.max(dt, 1 / 240);
        dirty = true;
      } else if (moving) {
        // なめらかに減速して吸い付く
        const omega = calm ? 16 : 9.5;
        const accel = omega * omega * (target - x) - 2 * omega * velocity;
        velocity += accel * dt;
        x += velocity * dt;
        dirty = true;
        if (Math.abs(target - x) < 0.0015 && Math.abs(velocity) < 0.03) {
          x = target;
          if (x <= 0 || x >= 1) {
            if (!calm) stretchV -= 3.2;
            commit(x);
          } else {
            velocity = 0;
            moving = false;
          }
        }
        x = clamp(x);
      } else {
        velocity = 0;
      }

      // ---- レンズの弾み
      if (!calm) {
        const goal = clamp(Math.abs(velocity) * 0.42);
        stretchV += (170 * (goal - stretch) - 11 * stretchV) * dt;
        stretch += stretchV * dt;
        lift += (liftTarget - lift) * (1 - Math.exp(-dt * 14));
        if (
          Math.abs(stretch) > 0.002 ||
          Math.abs(stretchV) > 0.01 ||
          Math.abs(liftTarget - lift) > 0.002
        )
          dirty = true;
      } else {
        stretch = 0;
        stretchV = 0;
        lift = liftTarget;
      }

      // ---- 右端では、時間が静かに進み、やがて灯りを消して眠る
      if (!calm && x >= 1 && !moving && !drag && nightClock < CLOCK_SLEEP) {
        nightClock = Math.min(
          CLOCK_SLEEP,
          nightClock + (dt * (CLOCK_SLEEP - CLOCK_NIGHT)) / NIGHT_CREEP,
        );
      }

      const clock = clockOf();
      hurry = Math.max(hurry - dt * 1.4, clamp(Math.abs(velocity) * 0.6));

      // ---- 世界は 30 コマで動く
      worldAcc += dt;
      const worldStep = calm
        ? Math.abs(clock - lastWorldClock) > 1e-4 || dirty
        : worldAcc >= 1 / WORLD_HZ - WORLD_SLACK;
      if (worldStep) {
        renderWorld(clock, Math.min(worldAcc, 0.1), hurry);
        worldAcc = 0;
        lastWorldClock = clock;
        if (ready) uploadWorld();
        dirty = true;
      }

      if (dirty) {
        const night = nightAmount(hourOf(clock));
        // 世界の暗さ（0 = 昼、1 = 夜）。使い手はこの値で、ページの地を合わせられる。変わったときだけ書く
        const nightText = night.toFixed(3);
        if (nightText !== lastNightText) {
          lastNightText = nightText;
          root.style.setProperty("--night", nightText);
        }
        if (ready) {
          const startedAt = costLeft > 0 ? performance.now() : 0;
          drawGl(night);
          if (startedAt) weighCost(startedAt);
        } else {
          draw2d(night);
        }
        dirty = false;
      }

      // 動きを減らす設定で止まっているときは、次の操作まで描かない
      const idleCalm = calm && !moving && !drag;
      if (visible && pageVisible && !idleCalm)
        raf = requestAnimationFrame(tick);
    };

    function stopDrawing() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function wake() {
      if (!raf && visible && pageVisible && !lost) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    }

    // ---- 速く動かすと、住人が驚いて空を見上げる
    let startleCool = 0;
    const startle = () => {
      if (calm || performance.now() < startleCool) return;
      startleCool = performance.now() + 1500;
      res.startle = 0.9;
    };

    // ---- 入力
    let suppressClick = 0;
    on(button, "pointerdown", (event) => {
      if (event.button !== 0) return;
      beginTravel();
      moving = false;
      drag = {
        id: event.pointerId,
        start: event.clientX,
        from: x,
        want: x,
        moved: false,
        lastX: event.clientX,
        lastT: performance.now(),
        speed: 0,
      };
      liftTarget = 1;
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        /* 取れなくても、動きは受けられる */
      }
      wake();
    });
    on(button, "pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.start;
      if (Math.abs(dx) > 3) drag.moved = true;
      drag.want = drag.from + dx / Math.max(shape.travelCss, 1);
      const nowMs = performance.now();
      const dtMs = Math.max(nowMs - drag.lastT, 4);
      const speed =
        (event.clientX - drag.lastX) /
        Math.max(shape.travelCss, 1) /
        (dtMs / 1000);
      drag.speed = drag.speed * 0.6 + speed * 0.4;
      drag.lastX = event.clientX;
      drag.lastT = nowMs;
      if (Math.abs(drag.speed) > 3.4) startle();
      wake();
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const wasMoved = drag.moved;
      const speed = drag.speed;
      drag = null;
      liftTarget = 0;
      if (wasMoved) {
        suppressClick = performance.now() + 300;
        // 近い方の端へ。勢いも少し数える
        target = x + speed * 0.09 >= 0.5 ? 1 : 0;
        root.dispatchEvent(
          new CustomEvent("daylight:intent", {
            detail: { night: target >= 1 },
          }),
        );
        velocity = clamp(speed, -3, 3);
        moving = true;
      }
      wake();
    };
    on(button, "pointerup", release);
    on(button, "pointercancel", release);
    on(button, "lostpointercapture", release);

    const toggle = () => {
      beginTravel();
      target = (moving ? target >= 0.5 : x >= 0.5) ? 0 : 1;
      moving = true;
      root.dispatchEvent(
        new CustomEvent("daylight:intent", { detail: { night: target >= 1 } }),
      );
      wake();
    };
    on(button, "click", () => {
      if (performance.now() < suppressClick) return;
      toggle();
    });

    const STEP = 0.04;
    on(button, "keydown", (event) => {
      let dir = 0;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") dir = 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") dir = -1;
      if (!dir) return;
      event.preventDefault();
      beginTravel();
      const from = moving ? target : x;
      target = clamp(from + dir * STEP);
      moving = true;
      setStatus(
        phaseName(
          hourOf(
            branch === "am"
              ? mix(36, amStart, target)
              : CLOCK_DAY + (CLOCK_NIGHT - CLOCK_DAY) * target,
          ),
        ),
      );
      wake();
    });

    // ---- 見えていないときは止める
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        dirty = true;
        wake();
      } else {
        stopDrawing();
      }
    });
    io.observe(root);
    on(root.ownerDocument, "visibilitychange", () => {
      pageVisible = root.ownerDocument.visibilityState !== "hidden";
      if (pageVisible) {
        dirty = true;
        wake();
        if (lost) waitForRestore();
      } else {
        stopDrawing();
        clearTimeout(restoreTimer);
      }
    });

    const ro = new ResizeObserver(() => {
      measure();
      dirty = true;
      lastWorldClock = -1;
      wake();
    });
    ro.observe(root);

    const applyCalm = () => {
      calm = true;
      dirty = true;
      lastWorldClock = -1;
      wake();
    };
    on(motionQuery, "change", applyCalm);
    on(schemeQuery, "change", () => {
      readPalette();
      dirty = true;
      lastWorldClock = -1;
      wake();
    });

    // ---- WebGL の文脈が失われたら、戻るのを待って描き直す。戻らなければ 2D で描く
    const RESTORE_WAIT_MS = 3000;
    let restoreTimer = 0;
    const redrawAll = () => {
      shape.W = 0; // 大きさが同じでも、画像を作り直す
      measure();
      dirty = true;
      lastWorldClock = -1;
      worldAcc = 1;
      wake();
    };
    function waitForRestore() {
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        if (!lost || !pageVisible) return;
        lost = false;
        useCanvas2d();
        redrawAll();
      }, RESTORE_WAIT_MS);
    }
    on(canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      ready = false;
      lost = true;
      costLeft = 0;
      stopDrawing();
      if (pageVisible) waitForRestore();
    });
    on(canvas, "webglcontextrestored", () => {
      if (ctx2d) return; // もう 2D で描いている
      clearTimeout(restoreTimer);
      lost = false;
      ready = setupGl();
      if (!ready) useCanvas2d();
      redrawAll();
    });

    // ---- 組み立て
    button.setAttribute("aria-checked", String(checked));
    readPalette();
    measure();
    if (lost) waitForRestore();
    res.x = 131;
    res.inside = false;
    // 最初の絵を、はじめのフレームまでに用意する
    renderWorld(clockOf(), 0, 0);
    if (ready) uploadWorld();
    wake();

    return () => {
      stopDrawing();
      clearTimeout(restoreTimer);
      visible = false;
      io.disconnect();
      ro.disconnect();
      for (const off of cleanups) off();
      if (gl && ready) {
        gl.deleteProgram(program);
        gl.deleteBuffer(quad);
        gl.deleteVertexArray(vao);
        gl.deleteTexture(texWorld);
        gl.deleteTexture(texNear);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
    };
  }
  return function initDaylightToggle() {
    const root = document.getElementById("themeToggleBtn");
    if (!root || root.dataset.ldMounted) return;
    root.dataset.ldMounted = "1";
    let saved = null;
    try {
      saved = localStorage.getItem("theme");
    } catch (e) {}
    if ((saved || "dark") !== "light") root.dataset.night = "1";
    // Apply the theme the instant the user decides, not after the slide animation ends.
    root.addEventListener("daylight:intent", (e) => {
      applyTheme(e.detail.night ? "dark" : "light");
    });
    root.addEventListener("daylight:change", (e) => {
      applyTheme(e.detail.night ? "dark" : "light");
    });
    try {
      mount(root);
    } catch (e) {
      console.warn("daylight toggle failed", e);
    }
  };
})();

function initTheme() {
  // localStorage can throw (blocked storage / private mode); never let that stop boot.
  let saved = null;
  try {
    saved = localStorage.getItem("theme");
  } catch (e) {}
  applyTheme(saved || "dark");
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light-mode");
    try {
      localStorage.setItem("theme", "light");
    } catch (e) {}
  } else {
    document.body.classList.remove("light-mode");
    try {
      localStorage.setItem("theme", "dark");
    } catch (e) {}
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
  initDaylightToggle();
  initSelectors();
  lockDatePicker();
  loadLocal();
  render();
  finishInitialSkeleton();
  renderCards();
  renderSweetie();
  renderGrvCC();
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
  on("ccMasterBtn", "click", openCCMaster);
  const ccMasterBtn = document.getElementById("ccMasterBtn");
  if (ccMasterBtn) {
    ccMasterBtn.addEventListener("pointerenter", prefetchCCMaster, {
      once: true,
    });
    ccMasterBtn.addEventListener("pointerdown", prefetchCCMaster, {
      once: true,
    });
  }
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
  setCardMonthFilter("1"); // init month filter button styles
  populateCCCardFilter(); // init card dropdown

  setInterval(() => {
    syncFromSheet(false);
    if (activeTab === "cards" || activeTab === "grvcc")
      syncCardsFromSheet(false);
    if (activeTab === "sweetie") syncSweetieFromSheet(false);
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
    grvHistoryAttempted = true;
    // Refresh the Expenses dashboard too: Total Saving depends on this history.
    try {
      render();
    } catch (e) {
      console.warn("Dashboard refresh after history sync failed:", e);
    }
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
      `<span class="table-data-pill table-text-pill">${esc(t.description || "—")}</span>` +
      (t.remarks ? `<div class="cc-rem">${esc(t.remarks)}</div>` : "");
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
  const key = cycle
    ? `${card}|${cycle.billingYear}-${cycle.billingMonth + 1}`
    : card;
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

async function markBillAlreadyPaid(card, ids) {
  // For bills the user already paid outside the app (and logged any expense themselves):
  // flips every UNPAID row of the statement to PAID (no OWED). Creates NO expense row.
  if (window.__grvActionBusy)
    return toast("⏳ Another bill action is already being saved", true);
  const rows = (ids || [])
    .map((id) => cardTxns.find((x) => String(x.id) === String(id)))
    .filter((t) => t && String(t.status || "").toUpperCase() === "UNPAID");
  if (!rows.length) return toast("No UNPAID transactions found", true);
  const total = rows.reduce((s, t) => s + (+t.amount || 0), 0);
  if (
    !confirm(
      `Mark ${card} bill (${money(total)}) as ALREADY PAID?\n\n• All ${rows.length} row(s) → PAID\n• No expense entry is created.`,
    )
  )
    return;
  const prev = rows.map((t) => [t.id, t.status]);
  rows.forEach((t) => (t.status = "PAID"));
  saveLocal();
  renderCards();
  renderGrvCC();
  renderGrvBills();
  const send = (list, status) =>
    list.length &&
    sheetWrite(
      apiUrl(
        `action=updateCardStatusBulk&ids=${enc(list.map((t) => t.id).join(","))}&status=${enc(status)}`,
      ),
    );
  send(rows, "PAID");
  toast(`✓ ${card} marked paid`, false, 7000, {
    label: "Undo",
    fn: () => {
      prev.forEach(([id, st]) => {
        const x = cardTxns.find((z) => String(z.id) === String(id));
        if (x) x.status = st;
      });
      saveLocal();
      send(rows, "UNPAID");
      renderCards();
      renderGrvCC();
      renderGrvBills();
      toast("↩️ Bill status undone");
    },
  });
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
      try {
        return JSON.parse(modal.dataset.ids || "[]");
      } catch (_) {
        return [];
      }
    })();
  if (cycle && cycle.end >= new Date(new Date().setHours(0, 0, 0, 0)))
    return toast(
      `This statement has not closed yet. Payment is available after ${cycle.end.getDate()} ${MONTHS[cycle.end.getMonth()]} ${cycle.end.getFullYear()}.`,
      true,
      6000,
    );
  const selectedRows = ids
      .map((id) => cardTxns.find((t) => String(t.id) === String(id)))
      .filter(Boolean),
    unpaidRows = selectedRows.filter(
      (t) => String(t.status || "").toUpperCase() === "UNPAID",
    ),
    unpaidTotal = unpaidRows.reduce((sum, t) => sum + (+t.amount || 0), 0),
    statementMatch =
      grvStatementMatches[
        `${card}|${cycle ? `${cycle.billingYear}-${cycle.billingMonth + 1}` : ""}`
      ];
  if (!ids.length || !unpaidRows.length)
    return toast("No UNPAID transactions found for this statement", true);
  if (Math.abs(unpaidTotal - total) >= 0.01)
    return toast(
      "Statement data changed. Refresh Bills and try again.",
      true,
      6000,
    );
  // The bank bill is the FULL statement (paid + unpaid rows), the same total the
  // Bills screen compares against when it enables the Record Bill Payment button.
  const statementFullTotal = cycle
    ? rowsForCycle(card, cycle).reduce((s, t) => s + (+t.amount || 0), 0)
    : total;
  if (
    statementMatch == null ||
    Math.abs((+statementMatch || 0) - statementFullTotal) >= 0.01
  )
    return toast(
      "Enter the actual bank bill and make sure it matches the statement total before paying.",
      true,
      6000,
    );
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
  const minY = Math.min(
    now.getFullYear(),
    ...(years.length ? years : [now.getFullYear()]),
  );
  mSel.innerHTML = FULL_MONTHS.map(
    (m, i) => `<option value="${i}">${m}</option>`,
  ).join("");
  ySel.innerHTML = "";
  for (let y = now.getFullYear() + 1; y >= minY; y--)
    ySel.add(new Option(y, y));
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
      prefixes.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
  });
  if (!prefixes.size) return;
  const res = await fetch(
    apiUrl(
      `action=getCardsByTxnMonth&txnMonth=${enc([...prefixes].join(","))}`,
    ),
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
  const merged = mergePending(cardTxns, fresh);
  const ids = new Set(merged.map((t) => t.id));
  cardTxns = [...cardTxns.filter((t) => !ids.has(t.id)), ...merged];
  saveLocal();
}

async function setGrvBillsMonth() {
  const m = +(document.getElementById("grvBillsMonth")?.value ?? 0);
  const y = +(
    document.getElementById("grvBillsYear")?.value ?? new Date().getFullYear()
  );
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
        statementMatch:
          grvStatementMatches[
            `${cfg.card}|${cycles.last.billingYear}-${cycles.last.billingMonth + 1}`
          ],
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
    : totalPay
      ? "No due date configured"
      : "Nothing due";
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
        return `<div class="grv-bill-card ${overdue ? "grv-bill-overdue " : ""}${paid ? "grv-bill-paid" : ""}"><div class="grv-bill-head"><div><div class="grv-bill-card-name">${esc(c.cfg.card)}</div><div style="color:var(--muted);font-size:.68rem;margin-top:3px">Last statement · ${FULL_MONTHS[c.cycles.last.billingMonth]} ${c.cycles.last.billingYear}</div></div><span class="grv-bill-badge ${overdue ? "overdue" : ""}">${paid ? "All paid" : esc(dueText)}</span></div><div class="grv-bill-section"><div class="grv-bill-section-title">${isLive ? "Last statement" : statementClosed ? "Selected statement" : "Selected / open cycle"}</div><div class="grv-bill-total">${money(c.lastTotal)}</div><div class="grv-bill-unpaid">Unpaid ${money(unpaidAmt)}</div><div class="grv-bill-split"><div>My share<strong>${money(c.lastSplit.my)}</strong></div><div>Others / owed to me<strong>${money(c.lastSplit.others)}</strong></div></div><div class="grv-bill-meta"><div>Cycle<strong>${esc(formatCycleRange(c.cycles.last))}</strong></div><div>Due<strong>${c.due ? `${c.due.date.getDate()} ${MONTHS[c.due.date.getMonth()]} ${c.due.date.getFullYear()}` : "Not set"}</strong></div></div></div>${isLive ? `<div class="grv-bill-section grv-open-cycle"><div class="grv-bill-section-title">Open cycle</div><div class="grv-bill-total">${money(c.openTotal)}</div><div class="grv-bill-split"><div>My share<strong>${money(c.openSplit.my)}</strong></div><div>Others / owed to me<strong>${money(c.openSplit.others)}</strong></div></div><div class="grv-bill-meta"><div>Closes<strong>${c.cycles.open.end.getDate()} ${MONTHS[c.cycles.open.end.getMonth()]} ${c.cycles.open.end.getFullYear()}</strong></div><div>Days to close<strong>${Math.max(0, Math.ceil((c.cycles.open.end - today) / 86400000))}</strong></div></div></div>` : ""}${c.cfg.limit ? `<div class="grv-bill-util"><div class="grv-bill-util-label"><span>Card utilisation</span><b>${util.toFixed(0)}% · ${money(c.openTotal)} / ${money(c.cfg.limit)}</b></div><div class="grv-bill-util-track"><div class="grv-bill-util-bar" style="width:${util}%"></div></div></div>` : ""}${statementClosed ? `<div class="grv-statement-match"><div class="grv-actual-bill-head"><span>Actual bank bill</span><strong>${c.statementMatch != null ? money(c.statementMatch) : "Not entered"}</strong></div><div class="grv-actual-bill-row"><input type="number" min="0" step="0.01" placeholder="Enter actual bank bill" value="${c.statementMatch != null ? esc(c.statementMatch) : ""}" onchange="setGrvStatementMatch(${JSON.stringify(c.cfg.card)},this.value)"><span class="grv-match-result ${c.statementMatch == null ? "neutral" : Math.abs((+c.statementMatch || 0) - c.lastTotal) < 0.01 ? "ok" : "bad"}">${c.statementMatch == null ? "Enter bank amount" : Math.abs((+c.statementMatch || 0) - c.lastTotal) < 0.01 ? "✓ Match" : "⚠ Difference " + money((+c.statementMatch || 0) - c.lastTotal)}</span></div></div><div class="grv-bill-actions"><button class="grv-bill-mark grv-bill-pay-primary" ${!unpaidAmt || c.statementMatch == null || Math.abs((+c.statementMatch || 0) - c.lastTotal) >= 0.01 ? "disabled" : ""} onclick='openGrvBillPayment(${JSON.stringify(c.cfg.card)},${JSON.stringify(formatCycleRange(c.cycles.last).split(" – ")[0])},${JSON.stringify(formatCycleRange(c.cycles.last).split(" – ")[1])},${c.unpaid.reduce((s, t) => s + (+t.amount || 0), 0)},${c.unpaid.filter((t) => isGrvUsedBy(t.usedBy)).reduce((s, t) => s + (+t.amount || 0), 0)},${c.unpaid.filter((t) => !isGrvUsedBy(t.usedBy)).reduce((s, t) => s + (+t.amount || 0), 0)},${JSON.stringify(c.unpaid.map((t) => t.id))})'>💳 Record Bill Payment</button>${unpaidAmt ? `<button type="button" class="grv-bill-mark" title="Already paid outside the app: marks all rows PAID without creating an expense" onclick='markBillAlreadyPaid(${JSON.stringify(c.cfg.card)},${JSON.stringify(c.unpaid.map((t) => t.id))})'>✓ Already paid</button>` : ""}</div>` : `<div class="grv-statement-match grv-statement-pending"><div class="grv-actual-bill-head"><span>Actual bank bill</span><strong>Available after statement closes</strong></div><div class="grv-actual-bill-row"><span class="grv-match-result neutral">Statement closes ${c.cycles.last.end.getDate()} ${MONTHS[c.cycles.last.end.getMonth()]}</span></div></div>`}</div>`;
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
    amtCell.className = isDebit
      ? "txn-amount txn-amount-out"
      : "txn-amount txn-amount-in";

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
  if (typeof window !== "undefined" && window.__asm)
    window.__asm.startEdit("sweetie", id, t);
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
  if (
    typeof window !== "undefined" &&
    window.__asm &&
    !window.__asm.canSubmit()
  )
    return;
  if (window.__addBusy) return;
  window.__addBusy = true;
  setTimeout(() => (window.__addBusy = false), 1500);
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
    // One atomic server update preserves the original ledger row if validation fails.
    sheetWrite(
      apiUrl(
        `action=updateSweetie&id=${enc(updEntry.id)}&type=${enc(updEntry.type)}&amount=${updEntry.amount}&date=${enc(updEntry.date)}&description=${enc(updEntry.description)}${grvAiLearningQuery_()}`,
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
      `action=addSweetie&id=${entry.id}&type=${enc(entry.type)}&amount=${entry.amount}&date=${enc(entry.date)}&description=${enc(entry.description)}${grvAiLearningQuery_()}`,
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

    const _sBefore = JSON.stringify(sweetieTxns);
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
        sweetieTxns = mergePending(sweetieTxns, fromSheet);
      }
    }

    const _sChanged = isManual || _sBefore !== JSON.stringify(sweetieTxns);
    if (_sChanged) {
      saveLocal();
      renderSweetie();
      // The Expenses dashboard (Sweetie Balance card, Sweetie Borrow rows) reads this ledger too.
      try {
        render();
      } catch (e) {
        console.warn("Dashboard refresh after Sweetie sync failed:", e);
      }
    }
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

/* Mask / reveal amounts on the six Expenses dashboard cards (visual only). */
(function initAmountMask() {
  const btn = document.getElementById("amountMaskBtn");
  const stats = document.querySelector("#expenseSection .stats");
  const section = document.getElementById("expenseSection");
  if (!btn || !stats) return;
  const KEY = "grv_mask_amounts";
  const apply = (masked) => {
    stats.classList.toggle("amounts-masked", masked);
    section.classList.toggle("amounts-masked", masked);
    btn.setAttribute("aria-pressed", String(masked));
    btn.setAttribute("aria-label", masked ? "Show amounts" : "Hide amounts");
    btn.textContent = masked ? "🙈" : "👁️";
  };
  let masked = false;
  try {
    masked = localStorage.getItem(KEY) === "1";
  } catch (e) {}
  apply(masked);
  btn.addEventListener("click", () => {
    masked = !masked;
    apply(masked);
    try {
      localStorage.setItem(KEY, masked ? "1" : "0");
    } catch (e) {}
  });
})();
