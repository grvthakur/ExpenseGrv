/**
 * Expense Tracker — Google Apps Script Backend
 *
 * Sheet structure:
 *   Expenses : ID | DATE | MONTH | CATEGORY | DESCRIPTION | AMOUNT
 *   Salary   : MONTH | SALARY
 *   Summary  : MONTH | TOTAL_EXPENSES | REMAINING | SWEETIE_BALANCE  (optional)
 *
 * Endpoints (all via GET for CORS simplicity):
 *   ?action=getAll          → { expenses: [[header,...],[row,...]], salary: [[header,...],[row,...]] }
 *   ?action=add&...         → "Added"
 *   ?action=delete&id=      → "Deleted"
 *   ?action=setSalary&...   → "OK"
 *   ?action=recalc&month=   → "Recalculated" (optional, updates Summary sheet)
 */

function doGet(e) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const expSheet = ss.getSheetByName("Expenses");
  const salSheet = ss.getSheetByName("Salary");
  const action   = e.parameter.action;

  // ── GET ALL (primary endpoint used by frontend) ──────────────────────────
  if (action === "getAll") {
    const expenses = expSheet.getDataRange().getValues();
    const salary   = salSheet.getDataRange().getValues();
    return json({ expenses, salary });
  }

  // ── ADD EXPENSE ──────────────────────────────────────────────────────────
  if (action === "add") {
    const id          = String(e.parameter.id   || Date.now());
    const date        = e.parameter.date        || "";
    const month       = e.parameter.month       || "";
    const category    = e.parameter.category    || "";
    const description = e.parameter.description || "";
    const amount      = Number(e.parameter.amount) || 0;

    if (!date || !month || !category || amount <= 0) {
      return error("Missing required fields: date, month, category, amount");
    }

    expSheet.appendRow([id, date, month, category, description, amount]);
    recalcMonth_(month, ss);
    return text("Added");
  }

  // ── DELETE EXPENSE ───────────────────────────────────────────────────────
  if (action === "delete") {
    const id   = String(e.parameter.id || "");
    if (!id)   return error("Missing id");

    const data = expSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        const month = data[i][2];
        expSheet.deleteRow(i + 1);
        recalcMonth_(month, ss);
        return text("Deleted");
      }
    }
    return text("Not found");
  }

  // ── SET SALARY ───────────────────────────────────────────────────────────
  if (action === "setSalary") {
    const month  = e.parameter.month  || "";
    const salary = Number(e.parameter.salary) || 0;
    if (!month)  return error("Missing month");

    upsertSalary_(month, salary, salSheet);
    recalcMonth_(month, ss);
    return text("OK");
  }

  // ── RECALC (optional, updates Summary sheet only) ────────────────────────
  if (action === "recalc") {
    const month = e.parameter.month || "";
    if (!month)  return error("Missing month");
    recalcMonth_(month, ss);
    return text("Recalculated");
  }

  // ── UNKNOWN ACTION ───────────────────────────────────────────────────────
  return error("Unknown action: " + action);
}

// ======================== HELPERS ========================

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function text(msg) {
  return ContentService
    .createTextOutput(msg)
    .setMimeType(ContentService.MimeType.TEXT);
}

function error(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function upsertSalary_(month, salary, salSheet) {
  const data = salSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(month)) {
      salSheet.getRange(i + 1, 2).setValue(salary);
      return;
    }
  }
  salSheet.appendRow([month, salary]);
}

function recalcMonth_(month, ss) {
  const expSheet = ss.getSheetByName("Expenses");
  const salSheet = ss.getSheetByName("Salary");
  const sumSheet = ss.getSheetByName("Summary"); // may be null — handled below

  const allData = expSheet.getDataRange().getValues();
  let totalExpenses = 0;
  let sweetieSaving = 0;
  let sweetieBorrow = 0;

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][2]) !== String(month)) continue;
    const cat = allData[i][3];
    const amt = Number(allData[i][5]) || 0;

    if (cat === "Sweetie Saving") {
      sweetieSaving += amt;
      totalExpenses += amt;
    } else if (cat === "Sweetie Borrow") {
      sweetieBorrow += amt; // not added to totalExpenses
    } else if (cat !== "Received") {
      totalExpenses += amt;
    }
  }

  const sweetieBalance = sweetieSaving - sweetieBorrow;

  let salary = 0;
  const salData = salSheet.getDataRange().getValues();
  for (let i = 1; i < salData.length; i++) {
    if (String(salData[i][0]) === String(month)) {
      salary = Number(salData[i][1]) || 0;
      break;
    }
  }

  const remaining = salary - totalExpenses;

  // Only update Summary sheet if it exists
  if (!sumSheet) return;

  const sumData = sumSheet.getDataRange().getValues();
  const toDelete = [];
  for (let i = 1; i < sumData.length; i++) {
    if (String(sumData[i][0]).trim() === String(month)) toDelete.push(i + 1);
  }
  // Delete from bottom to top to avoid row-index shifts
  for (let i = toDelete.length - 1; i >= 0; i--) {
    sumSheet.deleteRow(toDelete[i]);
  }
  sumSheet.appendRow([month, totalExpenses, remaining, sweetieBalance]);
}
