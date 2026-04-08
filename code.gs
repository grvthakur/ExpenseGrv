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

// Billing month for credit cards: "November 2025" format
function calcBillingMonth(dateVal, cutoff) {
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  const day = d.getDate();
  let billing;
  if (day <= parseInt(cutoff || 0)) {
    billing = d;
  } else {
    billing = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return FULL_MONTHS[billing.getMonth()] + " " + billing.getFullYear();
}

function forceText(sheet, row, col) {
  try {
    sheet.getRange(row, col).setNumberFormat("@");
  } catch (e) {
    /* typed column — toMonthKey covers read */
  }
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName("Expenses");
    const salSheet = ss.getSheetByName("Salary");
    const action = e.parameter.action || "";

    // ── EXPENSES ─────────────────────────────────────────────────────────
    if (action === "get") {
      const rows = expSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .map(normalizeExpRow)
        .map((r) => [
          r.id,
          r.date,
          r.month,
          r.category,
          r.description,
          r.amount,
        ]);
      return jsonOut(out);
    }

    if (action === "getByMonth") {
      const month = String(e.parameter.month || "").trim();
      const rows = expSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .map(normalizeExpRow)
        .filter((r) => r.month === month)
        .map((r) => [
          r.id,
          r.date,
          r.month,
          r.category,
          r.description,
          r.amount,
        ]);
      return jsonOut(out);
    }

    if (action === "getSalary") {
      const rows = salSheet.getDataRange().getValues();
      const out = rows.map((row, i) => {
        if (i === 0) return row;
        return [
          toMonthKey(row[0]),
          typeof row[1] === "number" ? row[1] : parseFloat(row[1]) || 0,
        ];
      });
      return jsonOut(out);
    }

    if (action === "setSalary") {
      const month = String(e.parameter.month || "").trim();
      const salary = parseFloat(e.parameter.salary || "0");
      if (!month || isNaN(salary))
        return textOut("ERROR: missing month or salary");
      upsertSalary(salSheet, month, salary);
      recalcMonth(expSheet, salSheet, getOrCreateSummarySheet(ss), month);
      return textOut("OK");
    }

    if (action === "delete") {
      const id = String(e.parameter.id || "").trim();
      if (!id) return textOut("ERROR: missing id");
      const rows = expSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          const month = toMonthKey(rows[i][2]);
          expSheet.deleteRow(i + 1);
          recalcMonth(expSheet, salSheet, getOrCreateSummarySheet(ss), month);
          return textOut("Deleted");
        }
      }
      return textOut("NotFound");
    }

    if (action === "add") {
      const id = String(e.parameter.id || Date.now()).trim();
      const date = String(e.parameter.date || "").trim();
      const month = String(e.parameter.month || "").trim();
      const category = String(e.parameter.category || "").trim();
      const description = String(e.parameter.description || "").trim();
      const amount = parseFloat(e.parameter.amount || "0");
      if (!date || !month || !category || isNaN(amount))
        return textOut("ERROR: missing fields");
      expSheet.appendRow([id, date, month, category, description, amount]);
      forceText(expSheet, expSheet.getLastRow(), 3);
      recalcMonth(expSheet, salSheet, getOrCreateSummarySheet(ss), month);
      return textOut("Added");
    }

    // ── CREDIT CARDS ─────────────────────────────────────────────────────
    // Cards sheet columns: ID | CREDIT CARD | USED BY | DESCRIPTION | TRANSACTION DATE | REMARKS | AMOUNT | STATUS | BILLING MONTH

    if (action === "getCardConfig") {
      const cfgSheet = ss.getSheetByName("CardConfig");
      if (!cfgSheet) return jsonOut([]);
      return jsonOut(cfgSheet.getDataRange().getValues());
    }

    if (action === "getCardsByMonth") {
      const billingMonth = String(e.parameter.billingMonth || "").trim();
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .filter((row) => String(row[8] || "").trim() === billingMonth)
        .map((row) => [
          String(row[0] || ""),
          String(row[1] || ""),
          String(row[2] || ""),
          String(row[3] || ""),
          toDateStr(row[4]),
          String(row[5] || ""),
          typeof row[6] === "number" ? row[6] : parseFloat(row[6]) || 0,
          String(row[7] || "UNPAID"),
          String(row[8] || ""),
        ]);
      return jsonOut(out);
    }

    // Fetch cards by transaction date month prefix e.g. "2026-04"
    if (action === "getCardsByTxnMonth") {
      const txnMonth = String(e.parameter.txnMonth || "").trim();
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .filter((row) => toDateStr(row[4]).startsWith(txnMonth))
        .map((row) => [
          String(row[0] || ""),
          String(row[1] || ""),
          String(row[2] || ""),
          String(row[3] || ""),
          toDateStr(row[4]),
          String(row[5] || ""),
          typeof row[6] === "number" ? row[6] : parseFloat(row[6]) || 0,
          String(row[7] || "UNPAID"),
          String(row[8] || ""),
        ]);
      return jsonOut(out);
    }

    if (action === "addCard") {
      const cardSheet = getOrCreateCardsSheet(ss);
      const id = String(e.parameter.id || Date.now()).trim();
      const card = String(e.parameter.card || "").trim();
      const usedBy = String(e.parameter.usedBy || "").trim();
      const description = String(e.parameter.description || "").trim();
      const txnDate = String(e.parameter.txnDate || "").trim();
      const remarks = String(e.parameter.remarks || "").trim();
      const amount = parseFloat(e.parameter.amount || "0");
      const status = String(e.parameter.status || "UNPAID").trim();
      const billingMonth = String(e.parameter.billingMonth || "").trim();
      if (!card || !txnDate || isNaN(amount))
        return textOut("ERROR: missing fields");
      cardSheet.appendRow([
        id,
        card,
        usedBy,
        description,
        txnDate,
        remarks,
        amount,
        status,
        billingMonth,
      ]);
      return textOut("Added");
    }

    if (action === "deleteCard") {
      const id = String(e.parameter.id || "").trim();
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          cardSheet.deleteRow(i + 1);
          return textOut("Deleted");
        }
      }
      return textOut("NotFound");
    }

    if (action === "updateCardStatus") {
      const id = String(e.parameter.id || "").trim();
      const status = String(e.parameter.status || "").trim();
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          cardSheet.getRange(i + 1, 8).setValue(status);
          return textOut("Updated");
        }
      }
      return textOut("NotFound");
    }

    // ── CC MASTER LIST ───────────────────────────────────────────────────
    // Password verified against PropertiesService — never sent back to browser
    if (action === "getCCMaster") {
      const pwd = String(e.parameter.pwd || "").trim();
      const stored =
        PropertiesService.getScriptProperties().getProperty("CC_PASSWORD");
      // Always return JSON so the browser can parse the response cleanly
      if (!stored)
        return jsonOut({
          error: "Password not configured. Run setPassword() first.",
        });
      if (pwd !== stored) return jsonOut({ error: "Incorrect password." });
      const ccSheet = ss.getSheetByName("CC");
      if (!ccSheet)
        return jsonOut({ error: "CC sheet not found in spreadsheet." });
      const rows = ccSheet.getDataRange().getValues();
      return jsonOut(rows.slice(1).filter((r) => r[0] || r[1]));
    }

    return textOut("ERROR: unknown action");
  } catch (err) {
    return textOut("ERROR: " + err.message);
  }
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

  for (let i = 1; i < allData.length; i++) {
    if (toMonthKey(allData[i][2]) !== month) continue;
    const cat = String(allData[i][3]).trim();
    const amt =
      typeof allData[i][5] === "number"
        ? allData[i][5]
        : parseFloat(allData[i][5]) || 0;
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

  const remaining = salary - totalExp;
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
