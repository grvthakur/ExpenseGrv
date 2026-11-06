// Loans backend. In code.js/code.gs doGet(e), add immediately after action is read:
// const _ln = loanHandle(action, e); if (_ln) return _ln;
// Ensure mutating loan actions are included in any outer write-action lock list if your app uses one.

function loanSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Loans");
  if (!sheet) {
    sheet = ss.insertSheet("Loans");
    sheet.appendRow([
      "ID",
      "PERSON",
      "DATE",
      "AMOUNT",
      "RETURNED",
      "PENDING",
      "STATUS",
      "NOTE",
      "EXPECTED RETURN",
    ]);
  }
  return sheet;
}

function loanNumber_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function loanDate_(value, optional) {
  const date = String(value == null ? "" : value).trim();
  if (!date && optional) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parts = date.split("-").map(Number);
  const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return check.getUTCFullYear() === parts[0] &&
    check.getUTCMonth() === parts[1] - 1 &&
    check.getUTCDate() === parts[2]
    ? date
    : null;
}

function loanRow_(id, person, date, amount, returned, note, expected) {
  const pending = Math.max(0, Math.round((amount - returned) * 100) / 100);
  const status =
    pending <= 0 ? "CLEARED" : returned > 0 ? "PARTIAL" : "PENDING";
  return [id, person, date, amount, returned, pending, status, note, expected];
}

function loanHandle(action, e) {
  if (
    !/^(getLoans|addLoan|updateLoan|returnLoan|payLoan|deleteLoan)$/.test(
      action,
    )
  )
    return null;
  const lock = LockService.getScriptLock();
  const mutating = action !== "getLoans";
  if (mutating) lock.waitLock(20000);
  try {
    const sheet = loanSheet_();
    const params = (e && e.parameter) || {};
    const rows = sheet.getDataRange().getValues();
    const id = String(params.id || "").trim();
    const findRow = (wantedId) => {
      for (let i = 1; i < rows.length; i++)
        if (String(rows[i][0]).trim() === wantedId) return i;
      return -1;
    };
    const writeRow = (index, values) =>
      sheet.getRange(index + 1, 1, 1, 9).setValues([values]);

    if (action === "getLoans") {
      return jsonOut(
        rows
          .slice(1)
          .filter((row) => row[0])
          .map((row) => [
            String(row[0]),
            String(row[1]),
            toDateStr(row[2]),
            Number(row[3]) || 0,
            Number(row[4]) || 0,
            Number(row[5]) || 0,
            String(row[6]),
            String(row[7] || ""),
            toDateStr(row[8]),
          ]),
      );
    }

    if (action === "addLoan") {
      const person = String(params.person || "").trim();
      const amount = loanNumber_(params.amount);
      const date = loanDate_(params.date, false);
      const expected = loanDate_(params.expected, true);
      const newId = String(params.id || Date.now()).trim();
      if (
        !person ||
        !newId ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !date ||
        expected === null
      )
        return textOut("ERROR: invalid person, date, expected date or amount");
      if (findRow(newId) >= 0) return textOut("ERROR: duplicate loan ID");
      sheet.appendRow(
        loanRow_(
          newId,
          person,
          date,
          Math.round(amount * 100) / 100,
          0,
          String(params.note || "").trim(),
          expected,
        ),
      );
      return textOut("Added");
    }

    const index = findRow(id);
    if (!id || index < 0) return textOut("NotFound");
    if (action === "deleteLoan") {
      sheet.deleteRow(index + 1);
      return textOut("Deleted");
    }

    const row = rows[index];
    const oldAmount = Number(row[3]) || 0;
    const oldReturned = Number(row[4]) || 0;
    const pending = Math.max(
      0,
      Math.round((oldAmount - oldReturned) * 100) / 100,
    );

    if (action === "payLoan") {
      if (pending <= 0) return textOut("ERROR: loan is already fully paid");
      writeRow(
        index,
        loanRow_(
          row[0],
          row[1],
          toDateStr(row[2]),
          oldAmount,
          oldAmount,
          row[7],
          toDateStr(row[8]),
        ),
      );
      return textOut("Paid");
    }

    if (action === "returnLoan") {
      const payment = loanNumber_(params.amount);
      if (!Number.isFinite(payment) || payment <= 0)
        return textOut("ERROR: payment must be greater than zero");
      if (payment > pending + 0.000001)
        return textOut("ERROR: payment exceeds pending amount");
      const returned = Math.min(
        oldAmount,
        Math.round((oldReturned + payment) * 100) / 100,
      );
      writeRow(
        index,
        loanRow_(
          row[0],
          row[1],
          toDateStr(row[2]),
          oldAmount,
          returned,
          row[7],
          toDateStr(row[8]),
        ),
      );
      return textOut("Updated");
    }

    // updateLoan: keep already-returned money, but never allow the revised principal below it.
    const person = String(params.person || "").trim();
    const amount = loanNumber_(params.amount);
    const date = loanDate_(params.date, false);
    const expected = loanDate_(params.expected, true);
    if (
      !person ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !date ||
      expected === null
    )
      return textOut("ERROR: invalid person, date, expected date or amount");
    if (amount + 0.000001 < oldReturned)
      return textOut(
        "ERROR: amount cannot be less than amount already returned",
      );
    writeRow(
      index,
      loanRow_(
        row[0],
        person,
        date,
        Math.round(amount * 100) / 100,
        oldReturned,
        String(params.note || "").trim(),
        expected,
      ),
    );
    return textOut("Updated");
  } catch (error) {
    return textOut(
      "ERROR: " + (error && error.message ? error.message : error),
    );
  } finally {
    if (mutating) {
      try {
        lock.releaseLock();
      } catch (ignored) {}
    }
  }
}
