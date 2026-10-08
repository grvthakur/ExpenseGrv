// 24th Aug

// ─── DATE / MONTH NORMALIZERS ────────────────────────────────────────────────
const MONTH_NAMES = [
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

function toMonthKey(val) {
  if (val instanceof Date) {
    return (
      MONTH_NAMES[val.getMonth()] + "-" + String(val.getFullYear()).slice(-2)
    );
  }
  return String(val || "").trim();
}

function toDateStr(val) {
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  return String(val || "").trim();
}

function normalizeExpRow(row) {
  return {
    id: String(row[0] || "").trim(),
    date: toDateStr(row[1]),
    month: toMonthKey(row[2]),
    category: String(row[3] || "").trim(),
    description: String(row[4] || "").trim(),
    amount: typeof row[5] === "number" ? row[5] : parseFloat(row[5]) || 0,
  };
}

// Billing month for credit cards: "November 2025" format.
// IMPORTANT: YYYY-MM-DD strings are parsed manually so Apps Script/browser
// timezone differences cannot move the transaction to the previous day.
// A missing/0 cutoff means "use the transaction month" (never force next month).
function calcBillingMonth(dateVal, cutoff) {
  let year, monthIndex, day;

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    year = dateVal.getFullYear();
    monthIndex = dateVal.getMonth();
    day = dateVal.getDate();
  } else {
    const raw = String(dateVal || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    year = Number(m[1]);
    monthIndex = Number(m[2]) - 1;
    day = Number(m[3]);
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return "";
  }

  const co = parseInt(cutoff, 10);
  if (!Number.isFinite(co) || co <= 0) {
    return FULL_MONTHS[monthIndex] + " " + year;
  }

  if (day <= co) {
    return FULL_MONTHS[monthIndex] + " " + year;
  }

  const nextMonthIndex = (monthIndex + 1) % 12;
  const nextYear = year + (monthIndex === 11 ? 1 : 0);
  return FULL_MONTHS[nextMonthIndex] + " " + nextYear;
}

function getCardCutoff(ss, card) {
  const cfgSheet = ss.getSheetByName("CardConfig");
  if (!cfgSheet || !card) return 0;
  const rows = cfgSheet.getDataRange().getValues();
  const wanted = String(card).trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim().toLowerCase() === wanted) {
      const cutoff = parseInt(rows[i][1], 10);
      return Number.isFinite(cutoff) && cutoff > 0 ? cutoff : 0;
    }
  }
  return 0;
}

function forceText(sheet, row, col) {
  try {
    sheet.getRange(row, col).setNumberFormat("@");
  } catch (e) {
    /* typed column — toMonthKey covers read */
  }
}

// ─── AUTO-RECALC ON MANUAL SHEET EDITS ───────────────────────────────────────
// Apps Script "simple trigger" — runs automatically whenever ANY cell in the
// spreadsheet is edited directly (typing into the sheet, not via the app).
// If the edit happened on the Sweetie sheet, recalculate the running balance
// so Remaining Amount stays correct even for manually-typed rows.
//
// SAFETY: recalcSweetieBalances() writes into column 4 (Remaining Amount),
// which would normally re-fire this same onEdit trigger. We guard against
// that infinite loop with a short-lived script lock — if a recalc is already
// in progress, any nested trigger call just returns immediately.
function onEdit(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return; // already recalculating — skip this nested call
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Sweetie") return;
    recalcSweetieBalances(sheet);
  } catch (err) {
    // Simple triggers can't show alerts; fail silently so manual typing never breaks
  } finally {
    lock.releaseLock();
  }
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────
function doGet(e) {
  let writeLock = null;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName("Expenses");
    const salSheet = ss.getSheetByName("Salary");
    const action = e.parameter.action || "";

    const writeActions = new Set([
      "setSalary", "delete", "add",
      "addCard", "updateCard", "updateCardStatusBulk", "payBill", "settle",
      "deleteCard", "updateCardStatus",
      "upsertCardConfig", "deleteCardConfig",
      "addSweetie", "deleteSweetie",
      "updateExpense", "updateSweetie",
    ]);

    if (writeActions.has(action)) {
      writeLock = LockService.getScriptLock();
      writeLock.waitLock(20000);
    }

    // BAaki tumhara existing code exactly same rahega...
function isGrvUsedByServer(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === "GRV" || v === "GAURAV" || v === "ME";
}

// ─── CARDS SHEET ─────────────────────────────────────────────────────────────
function getOrCreateCardsSheet(ss) {
  let sheet = ss.getSheetByName("Cards");
  if (!sheet) {
    sheet = ss.insertSheet("Cards");
    sheet.appendRow([
      "ID",
      "CREDIT CARD",
      "USED BY",
      "DESCRIPTION",
      "TRANSACTION DATE",
      "REMARKS",
      "AMOUNT",
      "STATUS",
      "BILLING MONTH",
    ]);
  }
  return sheet;
}

// ─── SWEETIE SHEET ───────────────────────────────────────────────────────────
function getOrCreateSweetieSheet(ss) {
  let sheet = ss.getSheetByName("Sweetie");
  if (!sheet) {
    sheet = ss.insertSheet("Sweetie");
    sheet.appendRow(["ID", "TYPE", "AMOUNT", "Remaining Amount", "DATE", "Description"]);
  }
  return sheet;
}

// Recalculate Remaining Amount column for every row, in chronological order
// (oldest -> newest by DATE, tie-broken by ID), then WRITE the result back
// into the sheet's "Remaining Amount" column — passbook style.
function recalcSweetieBalances(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // header only, nothing to calc

  // Build row objects with their original sheet row index (1-based, +1 for header)
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !row[1]) continue; // ID and TYPE both required
    items.push({
      sheetRow: i + 1,
      type: String(row[1] || "").trim(),
      amount: typeof row[2] === "number" ? row[2] : parseFloat(row[2]) || 0,
      date: row[4],
      id: String(row[0] || ""),
    });
  }

  // Sort chronologically — oldest first. Tie-break by ID (lower id = added earlier).
  items.sort((a, b) => {
    const ad = a.date instanceof Date ? a.date : new Date(a.date);
    const bd = b.date instanceof Date ? b.date : new Date(b.date);
    const at = isNaN(ad) ? 0 : ad.getTime();
    const bt = isNaN(bd) ? 0 : bd.getTime();
    if (at !== bt) return at - bt;
    return String(a.id) > String(b.id) ? 1 : -1;
  });

  // Walk chronologically, accumulate running balance, write back to each row
  // — but ONLY if the value actually changed, to avoid unnecessary re-writes
  // (important since writing also re-fires the onEdit trigger below).
  let running = 0;
  items.forEach((item) => {
    const signedAmt = item.type.toUpperCase() === "DEBIT" ? -Math.abs(item.amount) : Math.abs(item.amount);
    running += signedAmt;
    const cell = sheet.getRange(item.sheetRow, 4);
    const current = cell.getValue();
    const currentNum = typeof current === "number" ? current : parseFloat(current) || 0;
    if (Math.round(currentNum * 100) !== Math.round(running * 100)) {
      cell.setValue(running);
    }
  });
}

// ─── SUMMARY SHEET ───────────────────────────────────────────────────────────
function getOrCreateSummarySheet(ss) {
  let sheet = ss.getSheetByName("Summary");
  if (!sheet) {
    sheet = ss.insertSheet("Summary");
    sheet.appendRow([
      "Month",
      "Total Expenses",
      "Remaining",
      "Sweetie Balance",
      "Salary",
    ]);
    forceText(sheet, 1, 1);
  }
  return sheet;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function jsonOut(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function textOut(msg) {
  return ContentService.createTextOutput(msg).setMimeType(
    ContentService.MimeType.TEXT,
  );
}

function upsertSalary(salSheet, month, salary) {
  const rows = salSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (toMonthKey(rows[i][0]) === month) {
      salSheet.getRange(i + 1, 1).setValue(month);
      salSheet.getRange(i + 1, 2).setValue(salary);
      return;
    }
  }
  salSheet.appendRow([month, salary]);
  forceText(salSheet, salSheet.getLastRow(), 1);
}

// ─── RECALC SUMMARY ──────────────────────────────────────────────────────────
function recalcMonth(expSheet, salSheet, sumSheet, month) {
  const allData = expSheet.getDataRange().getValues();
  let totalExp = 0,
    sweetSave = 0,
    sweetBorrow = 0;

  let totalReceived = 0;
  for (let i = 1; i < allData.length; i++) {
    if (toMonthKey(allData[i][2]) !== month) continue;
    const cat = String(allData[i][3]).trim();
    const amt =
      typeof allData[i][5] === "number"
        ? allData[i][5]
        : parseFloat(allData[i][5]) || 0;
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
  }

  const sweetBal = sweetSave - sweetBorrow;
  let salary = 0;
  const salData = salSheet.getDataRange().getValues();
  for (let i = 1; i < salData.length; i++) {
    if (toMonthKey(salData[i][0]) === month) {
      salary =
        typeof salData[i][1] === "number"
          ? salData[i][1]
          : parseFloat(salData[i][1]) || 0;
      break;
    }
  }

  const remaining = salary + totalReceived - totalExp;
  const sumData = sumSheet.getDataRange().getValues();
  const toDelete = [];
  for (let i = 1; i < sumData.length; i++) {
    if (toMonthKey(sumData[i][0]) === month) toDelete.push(i + 1);
  }
  for (let i = toDelete.length - 1; i >= 0; i--)
    sumSheet.deleteRow(toDelete[i]);

  sumSheet.appendRow([month, totalExp, remaining, sweetBal, salary]);
  forceText(sumSheet, sumSheet.getLastRow(), 1);
}

// ─── ONE-TIME PASSWORD SETUP ─────────────────────────────────────────────────
// Run this function ONCE from Apps Script editor to set your password.
// After running, DELETE this function so it's not visible in your code.
// The password is stored in PropertiesService — never in the sheet or JS.
//function setPassword() {
//PropertiesService.getScriptProperties().setProperty("CC_PASSWORD", "Gaurav@123");
//Logger.log("Password set successfully.");
//}