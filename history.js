// ═══════════════════════════════════════════════════════════════════════════
// HISTORY.JS — tracks Inserted / Updated / Deleted for every entry.
// Fully additive: creates its own sheets, only touches Expenses/Cards/Sweetie
// sheets where explicitly called from code.gs.
// ═══════════════════════════════════════════════════════════════════════════

// ─── SHEET CREATORS ───────────────────────────────────────────────────────
function getOrCreateExpenseHistorySheet(ss) {
  let sheet = ss.getSheetByName("Expenses History");
  if (!sheet) {
    sheet = ss.insertSheet("Expenses History");
    sheet.appendRow([
      "ID",
      "Date",
      "Month",
      "Category",
      "Description",
      "Amount",
      "Status",
      "Action Date",
    ]);
  }
  return sheet;
}

function getOrCreateCardHistorySheet(ss) {
  let sheet = ss.getSheetByName("Cards History");
  if (!sheet) {
    sheet = ss.insertSheet("Cards History");
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
      "History Status",
      "Action Date",
    ]);
  }
  return sheet;
}

function getOrCreateSweetieHistorySheet(ss) {
  let sheet = ss.getSheetByName("Sweetie History");
  if (!sheet) {
    sheet = ss.insertSheet("Sweetie History");
    sheet.appendRow([
      "ID",
      "TYPE",
      "AMOUNT",
      "Remaining Amount",
      "DATE",
      "Description",
      "Status",
      "Action Date",
    ]);
  }
  return sheet;
}

function todayStr() {
  return toDateStr(new Date()); // toDateStr lives in code.gs, shared project scope
}

// ─── LOGGERS (one appendRow each — cheap) ────────────────────────────────
function logExpenseHistory(
  ss,
  id,
  date,
  month,
  category,
  description,
  amount,
  status,
) {
  const sheet = getOrCreateExpenseHistorySheet(ss);
  sheet.appendRow([
    id,
    date,
    month,
    category,
    description,
    amount,
    status,
    todayStr(),
  ]);
  forceText(sheet, sheet.getLastRow(), 3); // Month stays text — forceText now flushes+catches safely
}

function logCardHistory(
  ss,
  id,
  card,
  usedBy,
  description,
  txnDate,
  remarks,
  amount,
  cardStatus,
  billingMonth,
  historyStatus,
) {
  const sheet = getOrCreateCardHistorySheet(ss);
  sheet.appendRow([
    id,
    card,
    usedBy,
    description,
    txnDate,
    remarks,
    amount,
    cardStatus,
    billingMonth,
    historyStatus,
    todayStr(),
  ]);
}

function logSweetieHistory(
  ss,
  id,
  type,
  amount,
  remaining,
  date,
  description,
  status,
) {
  const sheet = getOrCreateSweetieHistorySheet(ss);
  sheet.appendRow([
    id,
    type,
    amount,
    remaining,
    date,
    description,
    status,
    todayStr(),
  ]);
}

// ─── ONE-TIME BACKFILL ────────────────────────────────────────────────────
// Run this ONCE from the Apps Script editor (select function → Run) before
// using the app further. It fetches every existing record already sitting
// in Expenses / Cards / Sweetie and logs a starting "Existing" row for each
// into the matching History sheet — so old data isn't invisible in history.
// Safe to re-run: it checks each History sheet's existing IDs and skips any
// record already logged, so it never creates duplicate rows.
function backfillAllHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  backfillExpenseHistory(ss);
  backfillCardHistory(ss);
  backfillSweetieHistory(ss);
  Logger.log("Backfill complete.");
}

function backfillExpenseHistory(ss) {
  const expSheet = ss.getSheetByName("Expenses");
  if (!expSheet) return;
  const histSheet = getOrCreateExpenseHistorySheet(ss);
  const alreadyLogged = new Set(
    histSheet
      .getDataRange()
      .getValues()
      .slice(1)
      .map((r) => String(r[0]).trim()),
  );
  const rows = expSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = normalizeExpRow(rows[i]);
    if (!r.id || alreadyLogged.has(r.id)) continue;
    logExpenseHistory(
      ss,
      r.id,
      r.date,
      r.month,
      r.category,
      r.description,
      r.amount,
      "Existing",
    );
    alreadyLogged.add(r.id);
  }
}

function backfillCardHistory(ss) {
  const cardSheet = getOrCreateCardsSheet(ss);
  const histSheet = getOrCreateCardHistorySheet(ss);
  const alreadyLogged = new Set(
    histSheet
      .getDataRange()
      .getValues()
      .slice(1)
      .map((r) => String(r[0]).trim()),
  );
  const rows = cardSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[0] || "").trim();
    if (!id || alreadyLogged.has(id)) continue;
    logCardHistory(
      ss,
      id,
      String(row[1] || ""),
      String(row[2] || ""),
      String(row[3] || ""),
      toDateStr(row[4]),
      String(row[5] || ""),
      typeof row[6] === "number" ? row[6] : parseFloat(row[6]) || 0,
      String(row[7] || "UNPAID"),
      String(row[8] || ""),
      "Existing",
    );
    alreadyLogged.add(id);
  }
}

function backfillSweetieHistory(ss) {
  const sweetieSheet = getOrCreateSweetieSheet(ss);
  const histSheet = getOrCreateSweetieHistorySheet(ss);
  const alreadyLogged = new Set(
    histSheet
      .getDataRange()
      .getValues()
      .slice(1)
      .map((r) => String(r[0]).trim()),
  );
  const rows = sweetieSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = String(row[0] || "").trim();
    if (!id || !row[1] || alreadyLogged.has(id)) continue;
    logSweetieHistory(
      ss,
      id,
      String(row[1] || ""),
      typeof row[2] === "number" ? row[2] : parseFloat(row[2]) || 0,
      typeof row[3] === "number" ? row[3] : parseFloat(row[3]) || 0,
      toDateStr(row[4]),
      String(row[5] || ""),
      "Existing",
    );
    alreadyLogged.add(id);
  }
}

// ─── UPDATE HANDLERS (in-place edit → single "Updated" history row) ──────
function handleUpdateExpense(e, ss, expSheet, salSheet) {
  const id = String(e.parameter.id || "").trim();
  const date = String(e.parameter.date || "").trim();
  const month = String(e.parameter.month || "").trim();
  const category = String(e.parameter.category || "").trim();
  const description = String(e.parameter.description || "").trim();
  const amount = parseFloat(e.parameter.amount || "0");
  if (!id || !date || !month || !category || isNaN(amount))
    return textOut("ERROR: missing fields");

  const rows = expSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === id) {
      const oldMonth = toMonthKey(rows[i][2]);
      const r = i + 1;
      expSheet.getRange(r, 2).setValue(date);
      expSheet.getRange(r, 3).setValue(month);
      expSheet.getRange(r, 4).setValue(category);
      expSheet.getRange(r, 5).setValue(description);
      expSheet.getRange(r, 6).setValue(amount);
      forceText(expSheet, r, 3);

      const sumSheet = getOrCreateSummarySheet(ss);
      recalcMonth(expSheet, salSheet, sumSheet, month);
      if (oldMonth !== month)
        recalcMonth(expSheet, salSheet, sumSheet, oldMonth);

      logExpenseHistory(
        ss,
        id,
        date,
        month,
        category,
        description,
        amount,
        "Updated",
      );
      return textOut("Updated");
    }
  }
  return textOut("NotFound");
}

function handleUpdateCard(e, ss) {
  const id = String(e.parameter.id || "").trim();
  const card = String(e.parameter.card || "").trim();
  const usedBy = String(e.parameter.usedBy || "").trim();
  const description = String(e.parameter.description || "").trim();
  const txnDate = String(e.parameter.txnDate || "").trim();
  const remarks = String(e.parameter.remarks || "").trim();
  const amount = parseFloat(e.parameter.amount || "0");
  const status = String(e.parameter.status || "UNPAID").trim();
  const billingMonth = String(e.parameter.billingMonth || "").trim();
  if (!id || !card || !txnDate || isNaN(amount))
    return textOut("ERROR: missing fields");

  const cardSheet = getOrCreateCardsSheet(ss);
  const rows = cardSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === id) {
      const r = i + 1;
      cardSheet
        .getRange(r, 2, 1, 8)
        .setValues([
          [
            card,
            usedBy,
            description,
            txnDate,
            remarks,
            amount,
            status,
            billingMonth,
          ],
        ]);
      logCardHistory(
        ss,
        id,
        card,
        usedBy,
        description,
        txnDate,
        remarks,
        amount,
        status,
        billingMonth,
        "Updated",
      );
      return textOut("Updated");
    }
  }
  return textOut("NotFound");
}

function handleUpdateSweetie(e, ss) {
  const id = String(e.parameter.id || "").trim();
  const type = String(e.parameter.type || "").trim();
  const amount = parseFloat(e.parameter.amount || "0");
  const date = String(e.parameter.date || "").trim();
  const description = String(e.parameter.description || "").trim();
  if (!id || !type || !date || isNaN(amount))
    return textOut("ERROR: missing fields");

  const sweetieSheet = getOrCreateSweetieSheet(ss);
  const rows = sweetieSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === id) {
      const r = i + 1;
      sweetieSheet.getRange(r, 2).setValue(type);
      sweetieSheet.getRange(r, 3).setValue(amount);
      sweetieSheet.getRange(r, 5).setValue(date);
      sweetieSheet.getRange(r, 6).setValue(description);
      recalcSweetieBalances(sweetieSheet);

      const updatedRow = sweetieSheet
        .getDataRange()
        .getValues()
        .find((row) => String(row[0]).trim() === id);
      const remaining = updatedRow ? updatedRow[3] : 0;

      logSweetieHistory(
        ss,
        id,
        type,
        amount,
        remaining,
        date,
        description,
        "Updated",
      );
      return textOut("Updated");
    }
  }
  return textOut("NotFound");
}
