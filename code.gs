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
    if (
      String(rows[i][0] || "")
        .trim()
        .toLowerCase() === wanted
    ) {
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
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName("Expenses");
    const salSheet = ss.getSheetByName("Salary");
    const action = e.parameter.action || "";

    // Serialize all mutating routes. This prevents double-taps / concurrent
    // requests from interleaving delete+recalc, status updates, bill payment,
    // settlement, and other multi-step writes. Read-only routes remain unlocked.
    const writeActions = new Set([
      "setSalary",
      "delete",
      "add",
      "addCard",
      "updateCard",
      "updateCardStatusBulk",
      "payBill",
      "settle",
      "deleteCard",
      "updateCardStatus",
      "upsertCardConfig",
      "deleteCardConfig",
      "addSweetie",
      "deleteSweetie",
      "updateExpense",
      "updateSweetie",
    ]);
    var writeLock = null;
    if (writeActions.has(action)) {
      writeLock = LockService.getScriptLock();
      writeLock.waitLock(20000);
    }

    if (action === "ver") return textOut("groq-v3");
    if (action === "aiParse") {
      const P = PropertiesService.getScriptProperties();
      const today = Utilities.formatDate(
        new Date(),
        "Asia/Kolkata",
        "yyyy-MM-dd",
      );
      const prompt =
        "Today is " +
        today +
        '. Extract ONE transaction from the text. Reply ONLY JSON: {"kind":"card|expense|sweetie","card":"","usedBy":"","desc":"","amount":0,"date":"YYYY-MM-DD","category":"","type":"SAVING|CREDIT|DEBIT"}. ' +
        "kind=card if a credit card is involved (pick card EXACTLY from: " +
        (e.parameter.cards || "") +
        "); kind=sweetie if text mentions Sweetie savings/credit/debit; else expense (category EXACTLY from: " +
        (e.parameter.cats || "") +
        "). Use date in text if present else today. desc = merchant, uppercase. If the text starts with a person name (e.g. GRV, Sweetie, Tanya) put it in usedBy and treat the other free words (like FLIPKART) that are not card/bank/amount/date as desc, overriding the SMS merchant. Never invent usedBy. For bank SMS use the card whose bank matches. Leave unknown fields empty.\n\nTEXT:\n" +
        String(e.parameter.text || "").slice(0, 1500);
      const post = (url, headers, body) =>
        JSON.parse(
          UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            muteHttpExceptions: true,
            headers: headers,
            payload: JSON.stringify(body),
          }).getContentText(),
        );
      const oa = (url, key, model, extra) => () => {
        const body = {
          model: model,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        };
        if (extra) for (const k in extra) body[k] = extra[k];
        const j = post(url, { Authorization: "Bearer " + key }, body);
        if (!j.choices)
          throw new Error((j.error && j.error.message) || "no reply");
        return j.choices[0].message.content;
      };
      const providers = [];
      const G = P.getProperty("GROQ_KEY"),
        C = P.getProperty("CEREBRAS_KEY"),
        O = P.getProperty("OPENROUTER_KEY");
      if (G) {
        providers.push([
          "Groq-20b",
          oa(
            "https://api.groq.com/openai/v1/chat/completions",
            G,
            "openai/gpt-oss-20b",
            { reasoning_effort: "low" },
          ),
        ]);
        providers.push([
          "Groq-120b",
          oa(
            "https://api.groq.com/openai/v1/chat/completions",
            G,
            "openai/gpt-oss-120b",
            { reasoning_effort: "low" },
          ),
        ]);
      }
      if (C)
        providers.push([
          "Cerebras",
          oa("https://api.cerebras.ai/v1/chat/completions", C, "gpt-oss-120b"),
        ]);
      if (O)
        providers.push([
          "OpenRouter",
          oa(
            "https://openrouter.ai/api/v1/chat/completions",
            O,
            "openrouter/free",
          ),
        ]);
      if (!providers.length)
        return jsonOut({
          error: "Set GROQ_KEY (free, console.groq.com) in Script Properties",
        });
      const errs = [];
      for (const [name, fn] of providers) {
        try {
          const m = fn().match(/\{[\s\S]*\}/);
          if (m)
            return ContentService.createTextOutput(m[0]).setMimeType(
              ContentService.MimeType.JSON,
            );
          errs.push(name + ": no JSON");
        } catch (er) {
          errs.push(name + ": " + er.message);
        }
      }
      return jsonOut({ error: errs.join(" | ") });
    }

    if (action === "aiAsk") {
      const today = Utilities.formatDate(
        new Date(),
        "Asia/Kolkata",
        "yyyy-MM-dd",
      );
      const prompt =
        "Today is " +
        today +
        '. Convert the user\'s question about their finance data into ONE JSON query plan. Reply ONLY JSON: {"sources":[],"person":"","card":"","category":"","text":"","status":"","type":"","from":"YYYY-MM-DD","to":"YYYY-MM-DD","agg":"sum|count|list|max|min|avg","group":"none|month|person|card|category|status","top":0,"title":""}. ' +
        "Sources: cards = credit-card txns (card, person=usedBy, desc, remarks, amount, status UNPAID|PAID|OWED|SETTLED); expenses = owner's personal expenses (category, desc, amount); sweetie = savings ledger (type SAVING|CREDIT|DEBIT); salary = monthly salary rows (amount=salary); summary = one row per month (amount=REMAINING money, desc has salary/expenses/received); config = one row per card (amount=REMAINING credit limit, desc has limit, used, used%, due day; 'limit ke paas/near limit'=agg min). 'credit card'/a person's name => [\"cards\"] (person filters cards only). 'kharcha' without card/person => [\"expenses\"]. 'bacha/remaining/savings left' => [\"summary\"]. salary => [\"salary\"]. limit/utilization/due => [\"config\"]. Unsure => cards+expenses+sweetie. Known people: " +
        (e.parameter.people || "") +
        ". Cards: " +
        (e.parameter.cards || "") +
        " (use closest exact name, or leave empty and put the keyword in text). Expense category EXACTLY from: " +
        (e.parameter.cats || "") +
        " or empty. text = merchant/product keyword. Month without year = latest such month not after today; 'this month','last month','this year' relative to today; set from/to inclusive (summary/salary dates are the 1st of the month). Defaults agg=sum, group=none. kitna/how much=sum; kitne/how many=count; list/dikhao/show=list; sabse zyada/highest=max; month wise=group month. title = short heading in the user's language. Leave unknown fields empty.\n\nQUESTION:\n" +
        String(e.parameter.q || "").slice(0, 500);
      return llmJson(prompt);
    }

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

    // Fetch cards by transaction date month prefix(es) e.g. "2026-04" or "2026-04,2026-03,2026-02"
    if (action === "getCardsByTxnMonth") {
      const txnMonthParam = String(e.parameter.txnMonth || "").trim();
      const prefixes = txnMonthParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .filter((row) => {
          const dateStr = toDateStr(row[4]);
          return prefixes.some((p) => dateStr.startsWith(p));
        })
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
      if (!card || !txnDate || isNaN(amount))
        return textOut("ERROR: missing fields");

      // Server is authoritative for billing month. Ignore any client-supplied
      // billingMonth so txnDate and billingMonth can never diverge.
      const cutoff = getCardCutoff(ss, card);
      const billingMonth = calcBillingMonth(txnDate, cutoff);
      if (!billingMonth) return textOut("ERROR: invalid transaction date");

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

    if (action === "updateCard") {
      const id = String(e.parameter.id || "").trim();
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          cardSheet
            .getRange(i + 1, 1, 1, 9)
            .setValues([
              [
                id,
                String(e.parameter.card || rows[i][1] || "").trim(),
                String(e.parameter.usedBy || "").trim(),
                String(e.parameter.description || "").trim(),
                String(e.parameter.txnDate || rows[i][4] || "").trim(),
                String(e.parameter.remarks || "").trim(),
                parseFloat(e.parameter.amount || rows[i][6] || "0") || 0,
                String(e.parameter.status || rows[i][7] || "UNPAID").trim(),
                "",
              ],
            ]);
          const savedTxnDate = String(
            e.parameter.txnDate || rows[i][4] || "",
          ).trim();
          const savedCard = String(e.parameter.card || rows[i][1] || "").trim();
          const cutoff = getCardCutoff(ss, savedCard);
          const billingMonth = calcBillingMonth(savedTxnDate, cutoff);
          if (!billingMonth) return textOut("ERROR: invalid transaction date");
          cardSheet.getRange(i + 1, 9).setValue(billingMonth);
          return textOut("Updated");
        }
      }
      return textOut("NotFound");
    }

    if (action === "updateCardStatusBulk") {
      const ids = String(e.parameter.ids || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const status = String(e.parameter.status || "").trim();
      if (!ids.length || !status) return textOut("ERROR: missing ids/status");
      const wanted = new Set(ids);
      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (wanted.has(String(rows[i][0]).trim()))
          cardSheet.getRange(i + 1, 8).setValue(status);
      }
      return textOut("Updated");
    }

    if (action === "payBill") {
      const ids = String(e.parameter.ids || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const card = String(e.parameter.card || "").trim();
      const paymentDate = String(e.parameter.paymentDate || "").trim();
      const paymentAmount = parseFloat(e.parameter.paymentAmount || "0");
      const description = String(e.parameter.description || "").trim();
      if (
        !ids.length ||
        !card ||
        !paymentDate ||
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0
      )
        return textOut("ERROR: missing bill payment fields");

      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      const wanted = new Set(ids);
      const matched = [];
      for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][0] || "").trim();
        if (!wanted.has(id)) continue;
        if (String(rows[i][1] || "").trim() !== card)
          return textOut("ERROR: card mismatch for " + id);
        const status = String(rows[i][7] || "UNPAID")
          .trim()
          .toUpperCase();
        if (status !== "UNPAID")
          return textOut("ERROR: one or more rows are no longer UNPAID");
        matched.push({
          sheetRow: i + 1,
          id,
          usedBy: String(rows[i][2] || "").trim(),
          amount: parseFloat(rows[i][6]) || 0,
        });
      }
      if (matched.length !== ids.length)
        return textOut("ERROR: one or more transaction IDs were not found");

      const statementTotal = matched.reduce((sum, r) => sum + r.amount, 0);
      if (Math.abs(paymentAmount - statementTotal) > 0.01)
        return textOut(
          "ERROR: full bill payment required; payment must equal " +
            statementTotal.toFixed(2),
        );

      // Gaurav's own rows become PAID. Everyone else's rows become OWED.
      matched.forEach((r) => {
        const next = isGrvUsedByServer(r.usedBy) ? "PAID" : "OWED";
        cardSheet.getRange(r.sheetRow, 8).setValue(next);
      });

      const month = paymentDate.slice(0, 7);
      const expSheet = getOrCreateExpensesSheet(ss);
      const expId = "CCPAY-" + Date.now();
      const myShare = matched
        .filter((r) => isGrvUsedByServer(r.usedBy))
        .reduce((sum, r) => sum + r.amount, 0);
      const othersShare = matched
        .filter((r) => !isGrvUsedByServer(r.usedBy))
        .reduce((sum, r) => sum + r.amount, 0);
      const finalDescription =
        description ||
        card +
          " bill payment | My share " +
          myShare.toFixed(2) +
          " | Others " +
          othersShare.toFixed(2);
      expSheet.appendRow([
        expId,
        paymentDate,
        month,
        "Bill Repayment",
        finalDescription,
        paymentAmount,
      ]);
      forceText(expSheet, expSheet.getLastRow(), 3);
      recalcMonth(expSheet, salSheet, getOrCreateSummarySheet(ss), month);
      return textOut("Paid");
    }

    if (action === "settle") {
      const ids = String(e.parameter.ids || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const person = String(e.parameter.person || "").trim();
      const paymentDate = String(e.parameter.paymentDate || "").trim();
      const receivedAmount = parseFloat(e.parameter.receivedAmount || "0");
      const description = String(e.parameter.description || "").trim();
      if (
        !ids.length ||
        !person ||
        !paymentDate ||
        !Number.isFinite(receivedAmount) ||
        receivedAmount <= 0
      )
        return textOut("ERROR: missing settlement fields");

      const cardSheet = getOrCreateCardsSheet(ss);
      const rows = cardSheet.getDataRange().getValues();
      const wanted = new Set(ids);
      const matched = [];
      for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][0] || "").trim();
        if (!wanted.has(id)) continue;
        const usedBy = String(rows[i][2] || "").trim();
        if (usedBy.toLowerCase() !== person.toLowerCase())
          return textOut("ERROR: person mismatch for " + id);
        if (
          String(rows[i][7] || "")
            .trim()
            .toUpperCase() !== "OWED"
        )
          return textOut("ERROR: one or more rows are not OWED");
        matched.push({
          sheetRow: i + 1,
          id,
          amount: parseFloat(rows[i][6]) || 0,
        });
      }
      if (matched.length !== ids.length)
        return textOut(
          "ERROR: one or more OWED transaction IDs were not found",
        );
      const owedTotal = matched.reduce((sum, r) => sum + r.amount, 0);
      if (Math.abs(receivedAmount - owedTotal) > 0.01)
        return textOut(
          "ERROR: full settlement required; amount must equal " +
            owedTotal.toFixed(2),
        );

      matched.forEach((r) =>
        cardSheet.getRange(r.sheetRow, 8).setValue("SETTLED"),
      );

      const month = paymentDate.slice(0, 7);
      const expSheet = getOrCreateExpensesSheet(ss);
      const expId = "CCSETTLE-" + Date.now();
      const finalDescription =
        description ||
        person + " settled credit-card share " + owedTotal.toFixed(2);
      expSheet.appendRow([
        expId,
        paymentDate,
        month,
        "Received",
        finalDescription,
        receivedAmount,
      ]);
      forceText(expSheet, expSheet.getLastRow(), 3);
      recalcMonth(expSheet, salSheet, getOrCreateSummarySheet(ss), month);
      return textOut("Settled");
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

    if (action === "upsertCardConfig") {
      let cfgSheet = ss.getSheetByName("CardConfig");
      if (!cfgSheet) {
        cfgSheet = ss.insertSheet("CardConfig");
        cfgSheet.appendRow([
          "CARD",
          "CUTOFF",
          "LIMIT",
          "DUE DAY",
          "DUE MONTH OFFSET",
        ]);
      }
      const oldCard = String(e.parameter.oldCard || "").trim();
      const card = String(e.parameter.card || "").trim();
      const bl = (v) => {
        v = String(v == null ? "" : v).trim();
        return v === "" || isNaN(Number(v)) ? "" : Number(v);
      };
      const cutoff = bl(e.parameter.cutoff),
        limit = bl(e.parameter.limit),
        dueDay = bl(e.parameter.dueDay),
        dueMonthOffset = bl(e.parameter.dueMonthOffset);
      if (!card) return textOut("ERROR: missing card");
      const rows = cfgSheet.getDataRange().getValues();
      let found = -1;
      for (let i = 1; i < rows.length; i++)
        if (
          String(rows[i][0]).trim() === oldCard ||
          (!oldCard && String(rows[i][0]).trim() === card)
        ) {
          found = i + 1;
          break;
        }
      const values = [card, cutoff, limit, dueDay, dueMonthOffset];
      if (found > 0) cfgSheet.getRange(found, 1, 1, 5).setValues([values]);
      else cfgSheet.appendRow(values);
      // CC Master is updated only when supplied; preserve existing fields on edit.
      let cc = ss.getSheetByName("CC");
      if (
        !cc &&
        (e.parameter.bank ||
          e.parameter.number ||
          e.parameter.numberCvv ||
          e.parameter.expDate)
      ) {
        cc = ss.insertSheet("CC");
        cc.appendRow([
          "BANK",
          "CREDIT CARD NAME",
          "NUMBER",
          "NUMBER & CVV",
          "EXP DATE",
        ]);
      }
      if (cc) {
        const crows = cc.getDataRange().getValues();
        let crow = -1;
        const ck = oldCard || card,
          ccName = String(e.parameter.ccName || "").trim();
        for (let i = 1; i < crows.length; i++)
          if (ccMatches(crows[i], ck)) {
            crow = i + 1;
            break;
          }
        const bank = String(e.parameter.bank || "").trim(),
          number = String(e.parameter.number || "").trim(),
          numberCvv = String(e.parameter.numberCvv || "").trim(),
          expDate = String(e.parameter.expDate || "").trim();
        if (crow > 0) {
          const current = crows[crow - 1];
          cc.getRange(crow, 3, 1, 3).setNumberFormat("@");
          cc.getRange(crow, 1, 1, 5).setValues([
            [
              bank || current[0] || "",
              current[1] || ccName || card,
              number || current[2] || "",
              numberCvv || current[3] || "",
              expDate || current[4] || "",
            ],
          ]);
        } else if (bank || number || numberCvv || expDate) {
          const nr = cc.getLastRow() + 1;
          cc.getRange(nr, 3, 1, 3).setNumberFormat("@");
          cc.getRange(nr, 1, 1, 5).setValues([
            [bank, ccName || card, number, numberCvv, expDate],
          ]);
        }
      }
      return textOut(found > 0 ? "Updated" : "Added");
    }

    if (action === "deleteCardConfig") {
      const card = String(e.parameter.card || "").trim();
      if (!card) return textOut("ERROR: missing card");
      const cfgSheet = ss.getSheetByName("CardConfig");
      if (cfgSheet) {
        const rows = cfgSheet.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--)
          if (String(rows[i][0]).trim() === card) cfgSheet.deleteRow(i + 1);
      }
      const cc = ss.getSheetByName("CC");
      if (cc) {
        const rows = cc.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--)
          if (ccMatches(rows[i], card)) cc.deleteRow(i + 1);
      }
      return textOut("Deleted");
    }

    // ── SWEETIE TRACKER ──────────────────────────────────────────────────
    // Sweetie sheet columns: ID | TYPE | AMOUNT | Remaining Amount | DATE | Description
    // Remaining Amount is calculated server-side and WRITTEN BACK to the sheet
    // every time the sheet changes — exactly like a bank passbook.
    if (action === "getSweetie") {
      const sweetieSheet = getOrCreateSweetieSheet(ss);
      const rows = sweetieSheet.getDataRange().getValues();
      const out = rows
        .slice(1)
        .filter((row) => row[0] && row[1]) // ID and TYPE both required
        .map((row) => [
          String(row[0] || ""),
          String(row[1] || ""),
          typeof row[2] === "number" ? row[2] : parseFloat(row[2]) || 0,
          typeof row[3] === "number" ? row[3] : parseFloat(row[3]) || 0,
          toDateStr(row[4]),
          String(row[5] || ""),
        ]);
      return jsonOut(out);
    }

    if (action === "addSweetie") {
      const sweetieSheet = getOrCreateSweetieSheet(ss);
      const id = String(e.parameter.id || Date.now()).trim();
      const type = String(e.parameter.type || "").trim();
      const amount = parseFloat(e.parameter.amount || "0");
      const date = String(e.parameter.date || "").trim();
      const description = String(e.parameter.description || "").trim();
      if (!type || !date || isNaN(amount))
        return textOut("ERROR: missing fields");
      // Remaining Amount column written as 0 here — recalcSweetieBalances() fixes it below
      sweetieSheet.appendRow([id, type, amount, 0, date, description]);
      recalcSweetieBalances(sweetieSheet);
      return textOut("Added");
    }

    if (action === "deleteSweetie") {
      const id = String(e.parameter.id || "").trim();
      const sweetieSheet = getOrCreateSweetieSheet(ss);
      const rows = sweetieSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === id) {
          sweetieSheet.deleteRow(i + 1);
          recalcSweetieBalances(sweetieSheet);
          return textOut("Deleted");
        }
      }
      return textOut("NotFound");
    }

    // ── CC MASTER LIST ───────────────────────────────────────────────────
    // Direct read — no password prompt in the UI.
    if (action === "getCCMaster") {
      const ccSheet = ss.getSheetByName("CC");
      if (!ccSheet)
        return jsonOut({ error: "CC sheet not found in spreadsheet." });
      const rows = ccSheet.getDataRange().getValues();
      return jsonOut(rows.slice(1).filter((r) => r[0] || r[1]));
    }

    return textOut("ERROR: unknown action");
  } catch (err) {
    return textOut("ERROR: " + err.message);
  } finally {
    if (writeLock) {
      try {
        writeLock.releaseLock();
      } catch (e) {}
    }
  }
}

// Shared LLM provider chain (Groq -> Cerebras -> OpenRouter). Returns JSON output.
function llmJson(prompt) {
  const P = PropertiesService.getScriptProperties();
  const post = (url, headers, body) =>
    JSON.parse(
      UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        muteHttpExceptions: true,
        headers: headers,
        payload: JSON.stringify(body),
      }).getContentText(),
    );
  const oa = (url, key, model, extra) => () => {
    const body = {
      model: model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    };
    if (extra) for (const k in extra) body[k] = extra[k];
    const j = post(url, { Authorization: "Bearer " + key }, body);
    if (!j.choices) throw new Error((j.error && j.error.message) || "no reply");
    return j.choices[0].message.content;
  };
  const providers = [];
  const G = P.getProperty("GROQ_KEY"),
    C = P.getProperty("CEREBRAS_KEY"),
    O = P.getProperty("OPENROUTER_KEY");
  if (G) {
    providers.push([
      "Groq-20b",
      oa(
        "https://api.groq.com/openai/v1/chat/completions",
        G,
        "openai/gpt-oss-20b",
        { reasoning_effort: "low" },
      ),
    ]);
    providers.push([
      "Groq-120b",
      oa(
        "https://api.groq.com/openai/v1/chat/completions",
        G,
        "openai/gpt-oss-120b",
        { reasoning_effort: "low" },
      ),
    ]);
  }
  if (C)
    providers.push([
      "Cerebras",
      oa("https://api.cerebras.ai/v1/chat/completions", C, "gpt-oss-120b"),
    ]);
  if (O)
    providers.push([
      "OpenRouter",
      oa("https://openrouter.ai/api/v1/chat/completions", O, "openrouter/free"),
    ]);
  if (!providers.length)
    return jsonOut({ error: "Set GROQ_KEY in Script Properties" });
  const errs = [];
  for (const [name, fn] of providers) {
    try {
      const m = fn().match(/\{[\s\S]*\}/);
      if (m)
        return ContentService.createTextOutput(m[0]).setMimeType(
          ContentService.MimeType.JSON,
        );
      errs.push(name + ": no JSON");
    } catch (er) {
      errs.push(name + ": " + er.message);
    }
  }
  return jsonOut({ error: errs.join(" | ") });
}

function getOrCreateExpensesSheet(ss) {
  return ss.getSheetByName("Expenses") || ss.insertSheet("Expenses");
}
function ccMatches(row, card) {
  const n = (x) =>
    String(x || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const c = n(card);
  return (
    n(row[1]) === c ||
    n(row[0] + "-" + row[1]) === c ||
    n(row[0] + " " + row[1]) === c
  );
}

function isGrvUsedByServer(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase();
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
    sheet.appendRow([
      "ID",
      "TYPE",
      "AMOUNT",
      "Remaining Amount",
      "DATE",
      "Description",
    ]);
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
    const signedAmt =
      item.type.toUpperCase() === "DEBIT"
        ? -Math.abs(item.amount)
        : Math.abs(item.amount);
    running += signedAmt;
    const cell = sheet.getRange(item.sheetRow, 4);
    const current = cell.getValue();
    const currentNum =
      typeof current === "number" ? current : parseFloat(current) || 0;
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
