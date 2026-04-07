// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE =
  "https://script.google.com/macros/s/AKfycbzbyLRdZXlOyEWNw_cMSzXUOQ29lBtRdm859q7sKn18E9DKVoC9pys8-8mlGlJJYxEo/exec";

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

  // Apply search filter
  const expSearchEl = document.getElementById("expSearchBox");
  expSearch = expSearchEl ? expSearchEl.value.trim().toLowerCase() : "";
  const filteredRows = expSearch
    ? rows.filter(
        (e) =>
          (e.description || "").toLowerCase().includes(expSearch) ||
          (e.category || "").toLowerCase().includes(expSearch) ||
          String(e.amount).includes(expSearch) ||
          (e.date || "").includes(expSearch),
      )
    : rows;

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
    return 0;
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
    editBtn.className = "delete-btn";
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
  // Filter by TRANSACTION DATE month — April tab shows April transactions
  // regardless of which billing month they fall in
  const selMonth = parseInt(document.getElementById("monthSelect").value);
  const selYear = parseInt(document.getElementById("yearSelect").value);
  const rows = cardTxns.filter((t) => {
    if (!t.txnDate) return false;
    const d = new Date(t.txnDate);
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
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

  // Apply search filter
  const cardSearchEl = document.getElementById("cardSearchBox");
  cardSearch = cardSearchEl ? cardSearchEl.value.trim().toLowerCase() : "";
  const filteredCardRows = cardSearch
    ? rows.filter(
        (t) =>
          (t.description || "").toLowerCase().includes(cardSearch) ||
          (t.card || "").toLowerCase().includes(cardSearch) ||
          (t.usedBy || "").toLowerCase().includes(cardSearch) ||
          (t.remarks || "").toLowerCase().includes(cardSearch) ||
          String(t.amount).includes(cardSearch) ||
          (t.status || "").toLowerCase().includes(cardSearch),
      )
    : rows;

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
    return 0;
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
    bmCell.style.fontSize = "0.75rem";
    bmCell.style.color = "var(--muted)";

    const actCell = tr.insertCell(8);
    actCell.style.whiteSpace = "nowrap";
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "delete-btn";
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
  const txnMonthPrefix = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
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
        return d.getMonth() === selMonth && d.getFullYear() === selYear;
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
            return !(d.getMonth() === selMonth && d.getFullYear() === selYear);
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
  const tbody = document.getElementById("ccMasterBody");
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px;">No entries in CC sheet</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (row) => `
    <tr>
      <td><span class="cc-bank-badge">${row[0] || "—"}</span></td>
      <td style="font-weight:600">${row[1] || "—"}</td>
      <td class="cc-num">${row[2] || "—"}</td>
      <td><span class="cc-num">${(row[3] || "—").split("/")[0] || ""}</span>${row[3] && row[3].includes("/") ? ` / <span class="cc-cvv">${row[3].split("/")[1].trim()}</span>` : ""}</td>
      <td class="cc-exp">${formatExpDate(row[4])}</td>
    </tr>`,
    )
    .join("");
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function enc(v) {
  return encodeURIComponent(String(v));
}

// ─── CLONE ENTRIES ────────────────────────────────────────────────────────────
function cloneExpense(id) {
  const exp = expenses.find((e) => e.id === id);
  if (!exp) return;
  const today = localDateStr(new Date());
  const m = parseInt(document.getElementById("monthSelect").value);
  const y = parseInt(document.getElementById("yearSelect").value);
  const min = localDateStr(new Date(y, m, 1));
  const max = localDateStr(new Date(y, m + 1, 0));
  const date = today >= min && today <= max ? today : exp.date;
  const clone = { ...exp, id: Date.now().toString(), date };
  expenses.push(clone);
  saveLocal();
  render();
  toast("Cloned ✓");
  sheetWrite(
    apiUrl(
      `action=add&id=${clone.id}&date=${clone.date}&month=${enc(clone.month)}&category=${enc(clone.category)}&description=${enc(clone.description)}&amount=${clone.amount}`,
    ),
  );
}

function cloneCard(id) {
  const t = cardTxns.find((t) => t.id === id);
  if (!t) return;
  const today = localDateStr(new Date());
  const cfg = cardConfig.find((c) => c.card === t.card);
  const bMonth = calcBillingMonth(today, cfg ? cfg.cutoff : 0);
  const clone = {
    ...t,
    id: Date.now().toString(),
    txnDate: today,
    billingMonth: bMonth,
    status: "UNPAID",
  };
  cardTxns.push(clone);
  saveLocal();
  renderCards();
  toast("Cloned ✓");
  sheetWrite(
    apiUrl(
      `action=addCard&id=${clone.id}&card=${enc(clone.card)}&usedBy=${enc(clone.usedBy)}&description=${enc(clone.description)}&txnDate=${enc(clone.txnDate)}&remarks=${enc(clone.remarks)}&amount=${clone.amount}&status=${enc(clone.status)}&billingMonth=${enc(clone.billingMonth)}`,
    ),
  );
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
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  applyTheme(saved);
}

function applyTheme(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (btn) btn.textContent = "☀️ Light";
    localStorage.setItem("theme", "light");
  } else {
    document.body.classList.remove("light-mode");
    if (btn) btn.textContent = "🌙 Dark";
    localStorage.setItem("theme", "dark");
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  applyTheme(isLight ? "dark" : "light");
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
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
  // CC Master wiring
  document
    .getElementById("themeToggleBtn")
    .addEventListener("click", toggleTheme);
  document
    .getElementById("ccMasterBtn")
    .addEventListener("click", openCCMaster);
  document.getElementById("closePwdModalBtn").addEventListener("click", () => {
    document.getElementById("pwdModal").style.display = "none";
  });
  document
    .getElementById("pwdSubmitBtn")
    .addEventListener("click", submitPassword);
  document.getElementById("pwdInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPassword();
  });
  document.getElementById("closeCCMasterBtn").addEventListener("click", () => {
    document.getElementById("ccMasterModal").style.display = "none";
    // Clear table for security — data only shown while modal is open
    document.getElementById("ccMasterBody").innerHTML =
      "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
  });
  window.addEventListener("click", (e) => {
    if (e.target === document.getElementById("pwdModal"))
      document.getElementById("pwdModal").style.display = "none";
    if (e.target === document.getElementById("ccMasterModal")) {
      document.getElementById("ccMasterModal").style.display = "none";
      document.getElementById("ccMasterBody").innerHTML =
        "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:30px;'>Loading…</td></tr>";
    }
  });

  document
    .getElementById("tabExpenses")
    .addEventListener("click", () => switchTab("expenses"));
  document
    .getElementById("tabCards")
    .addEventListener("click", () => switchTab("cards"));
  document.getElementById("addCardBtn").addEventListener("click", addCardEntry);
  document
    .getElementById("cancelExpEditBtn")
    .addEventListener("click", cancelEditExpense);
  document
    .getElementById("cancelCardEditBtn")
    .addEventListener("click", cancelEditCard);
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

  // Show local data instantly — no blocking loader
  // Sync runs silently in background, updates UI when done
  syncFromSheet(false, false);
  syncCardsFromSheet(false);

  setInterval(() => {
    syncFromSheet(false);
    if (activeTab === "cards") syncCardsFromSheet(false);
  }, 60000);
});
