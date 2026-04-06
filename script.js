// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE =
  "https://script.google.com/macros/s/AKfycbzua4eE-9masFkX0Hv6d6FAyscOwMwJjG0mI3E8NOD60l_NiUENf-Rp8aA8PmZUJARK/exec";

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
    if (e) expenses = JSON.parse(e);
    if (s) salaries = JSON.parse(s);
    if (c) cardTxns = JSON.parse(c);
    if (g) cardConfig = JSON.parse(g);
  } catch (e) {
    expenses = [];
    salaries = {};
    cardTxns = [];
    cardConfig = [];
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
  document
    .getElementById("tabExpenses")
    .classList.toggle("tab-active", tab === "expenses");
  document
    .getElementById("tabCards")
    .classList.toggle("tab-active", tab === "cards");
  document.getElementById("expenseSection").style.display =
    tab === "expenses" ? "" : "none";
  document.getElementById("cardSection").style.display =
    tab === "cards" ? "" : "none";

  if (tab === "expenses") {
    render();
  } else {
    renderCards();
    // Populate card dropdown from config
    populateCardDropdown();
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EXPENSES SECTION ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function render() {
  const key = monthKey();
  const rows = expenses.filter((e) => e.month === key);

  let totalExp = 0,
    sweetSave = 0,
    sweetBorrow = 0;
  rows.forEach(({ category: cat, amount: amt }) => {
    if (cat === "Received") {
      /* ignore */
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
  const remaining = salary - totalExp;
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

  const tbody = document.getElementById("tableBody");
  const emptyEl = document.getElementById("emptyMessage");
  tbody.innerHTML = "";

  if (rows.length === 0) {
    emptyEl.style.display = "block";
    document.getElementById("rowCount").textContent = "0 entries";
    return;
  }
  emptyEl.style.display = "none";
  document.getElementById("rowCount").textContent = `${rows.length} entries`;

  [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((exp) => {
      const tr = tbody.insertRow();
      tr.insertCell(0).textContent = exp.date;
      tr.insertCell(1).innerHTML =
        `<span style="background:#1c1c28;padding:2px 8px;border-radius:20px;font-size:0.7rem">${exp.category}</span>`;
      tr.insertCell(2).textContent = exp.description || "—";
      tr.insertCell(3).textContent = `₹${exp.amount.toFixed(2)}`;
      const btn = document.createElement("button");
      btn.textContent = "✕";
      btn.className = "delete-btn";
      btn.onclick = () => deleteEntry(exp.id);
      tr.insertCell(4).appendChild(btn);
    });
}

function addEntry() {
  const date = document.getElementById("expenseDate").value;
  const cat = document.getElementById("expenseCategory").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const rawAmt = document.getElementById("expenseAmount").value;

  if (!date || !rawAmt) return toast("Date & amount required", true);
  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount <= 0) return toast("Enter a valid amount", true);

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

  sheetWrite(
    apiUrl(
      `action=add&id=${entry.id}&date=${entry.date}&month=${enc(entry.month)}&category=${enc(entry.category)}&description=${enc(entry.description)}&amount=${entry.amount}`,
    ),
  );
}

function deleteEntry(id) {
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
  if (isInitial) showLoading("Loading your data from Google Sheet…");

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
    if (isInitial) hideLoading();
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
            "#a78bfa",
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
      plugins: { legend: { position: "bottom" } },
    },
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
  if (!dateStr || !cutoff) return billingMonthKey();
  const d = new Date(dateStr);
  const day = d.getDate();
  if (day <= parseInt(cutoff)) {
    return FULL_MONTHS[d.getMonth()] + " " + d.getFullYear();
  } else {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return FULL_MONTHS[next.getMonth()] + " " + next.getFullYear();
  }
}

// Render credit card stats and table for current billing month
function renderCards() {
  const bMonth = billingMonthKey();
  const rows = cardTxns.filter((t) => t.billingMonth === bMonth);

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

  if (rows.length === 0) {
    emptyEl.style.display = "block";
    document.getElementById("ccRowCount").textContent = "0 entries";
    return;
  }
  emptyEl.style.display = "none";
  document.getElementById("ccRowCount").textContent = `${rows.length} entries`;

  [...rows]
    .sort((a, b) => b.txnDate.localeCompare(a.txnDate))
    .forEach((t) => {
      const tr = tbody.insertRow();
      const statusBadge = `<span class="status-badge ${t.status === "PAID" ? "badge-paid" : "badge-unpaid"}">${t.status}</span>`;

      tr.insertCell(0).textContent = t.txnDate;
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

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.className = "delete-btn";
      delBtn.onclick = () => deleteCardEntry(t.id);
      tr.insertCell(7).appendChild(delBtn);
    });
}

// Add a credit card transaction
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
  document.getElementById("cardAmount").value = "";

  sheetWrite(
    apiUrl(
      `action=addCard&id=${entry.id}&card=${enc(entry.card)}&usedBy=${enc(entry.usedBy)}&description=${enc(entry.description)}&txnDate=${enc(entry.txnDate)}&remarks=${enc(entry.remarks)}&amount=${entry.amount}&status=${enc(entry.status)}&billingMonth=${enc(entry.billingMonth)}`,
    ),
  );
}

// Delete a card transaction
function deleteCardEntry(id) {
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
  const btn = document.getElementById("cardSyncBtn");
  if (isManual) {
    btn.textContent = "⏳ Syncing…";
    btn.disabled = true;
  }

  try {
    const [cardRes, cfgRes] = await Promise.all([
      fetch(apiUrl(`action=getCardsByMonth&billingMonth=${enc(bMonth)}`)).then(
        (r) => r.json(),
      ),
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
          billingMonth: String(row[8] || ""),
        }))
        .filter((t) => t.id && t.txnDate);

      const localCount = cardTxns.filter(
        (t) => t.billingMonth === bMonth,
      ).length;
      if (fromSheet.length === 0 && localCount > 0) {
        if (isManual)
          toast(
            `⚠️ Sheet empty — kept ${localCount} local entries`,
            true,
            4000,
          );
      } else {
        cardTxns = [
          ...cardTxns.filter((t) => t.billingMonth !== bMonth),
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function enc(v) {
  return encodeURIComponent(String(v));
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

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  initSelectors();
  lockDatePicker();
  loadLocal();
  render();

  // Set card date default to today
  document.getElementById("cardTxnDate").value = localDateStr(new Date());

  // Expense tab wiring
  document.getElementById("addBtn").addEventListener("click", addEntry);
  document
    .getElementById("saveSalaryBtn")
    .addEventListener("click", saveSalaryEntry);
  document.getElementById("editSalaryBtn").addEventListener("click", () => {
    document.getElementById("salaryEditGroup").style.display = "flex";
    document.getElementById("editSalaryBtn").style.display = "none";
  });
  document
    .getElementById("syncBtn")
    .addEventListener("click", () => syncFromSheet(true));
  document.getElementById("summaryBtn").addEventListener("click", showSummary);
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("summaryModal").style.display = "none";
  });
  window.addEventListener("click", (e) => {
    if (e.target === document.getElementById("summaryModal"))
      document.getElementById("summaryModal").style.display = "none";
  });

  // Card tab wiring
  document
    .getElementById("tabExpenses")
    .addEventListener("click", () => switchTab("expenses"));
  document
    .getElementById("tabCards")
    .addEventListener("click", () => switchTab("cards"));
  document.getElementById("addCardBtn").addEventListener("click", addCardEntry);
  document
    .getElementById("cardSyncBtn")
    .addEventListener("click", () => syncCardsFromSheet(true));

  // Month/year change — refresh both tabs
  document.getElementById("monthSelect").addEventListener("change", () => {
    lockDatePicker();
    render();
    syncFromSheet(false);
    if (activeTab === "cards") syncCardsFromSheet(false);
  });
  document.getElementById("yearSelect").addEventListener("change", () => {
    lockDatePicker();
    render();
    syncFromSheet(false);
    if (activeTab === "cards") syncCardsFromSheet(false);
  });

  // Initial load
  await syncFromSheet(false, true);
  await syncCardsFromSheet(false);

  setInterval(() => {
    syncFromSheet(false);
    if (activeTab === "cards") syncCardsFromSheet(false);
  }, 60000);
});
