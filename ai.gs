// ai.gs — universal AI query engine. Needs code.gs (llmJson uses providers; jsonOut/toDateStr).
// Hook in code.gs doGet(), right after `const action = ...;`:
//     const _ai = aiHandle(action, e); if (_ai) return _ai;
//
// HOW IT WORKS: server reads ALL sheets -> unified rows R -> LLM (given a live profile of your data)
// writes a small read-only JS program -> server RUNS it (exact math) -> returns answer.
// New categories / cards / people / sheets-rows are picked up automatically (profile is rebuilt per call).

const AI_MAX_ROWS_OUT = 40;

function aiHandle(action, e) {
  if (action === "aiQuery") return aiQuery_(e);
  if (action === "aiParse") return aiParse_(e);
  if (action === "aiMatch") return aiMatch_(e); // legacy, kept for older app builds
  return null;
}

// ── 1. Unified rows from every sheet ────────────────────────────────────────
function aiMonthToDate_(m) {
  const mm = String(m || "").match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!mm) return "";
  const i = MONTH_NAMES.findIndex(
    (x) => x.toLowerCase() === mm[1].toLowerCase(),
  );
  return i < 0
    ? ""
    : "20" + mm[2] + "-" + String(i + 1).padStart(2, "0") + "-01";
}
function aiNum_(v) {
  return typeof v === "number" ? v : parseFloat(v) || 0;
}
const AI_NONSPEND = [
  "received",
  "bill repayment",
  "loan",
  "savings and investments",
  "sweetie saving",
  "sweetie borrow",
  "test",
];
const AI_SELF = ["grv", "gaurav", "me", "self"];

function aiRows_(ss) {
  const R = [];
  const rd = (n) => {
    const s = ss.getSheetByName(n);
    return s ? s.getDataRange().getValues().slice(1) : [];
  };
  rd("Expenses").forEach((r) => {
    if (!r[0] && !r[4] && !r[5]) return;
    R.push({
      src: "expense",
      id: String(r[0]),
      date: toDateStr(r[1]),
      cat: String(r[3] || "").trim(),
      desc: String(r[4] || "").trim(),
      amount: aiNum_(r[5]),
      own: true,
      spend:
        AI_NONSPEND.indexOf(
          String(r[3] || "")
            .trim()
            .toLowerCase(),
        ) < 0,
    });
  });
  rd("Cards").forEach((r) => {
    if (!r[0] && !r[3]) return;
    const who = String(r[2] || "").trim();
    const w = who.toLowerCase();
    R.push({
      src: "card",
      id: String(r[0]),
      date: toDateStr(r[4]),
      card: String(r[1] || "").trim(),
      person: who,
      desc: String(r[3] || "").trim(),
      remarks: String(r[5] || "").trim(),
      amount: aiNum_(r[6]),
      status: String(r[7] || "")
        .trim()
        .toUpperCase(),
      billing: String(r[8] || "").trim(),
      own: AI_SELF.indexOf(w) >= 0 || /^(grv|gaurav)\b/.test(w),
    });
    R[R.length - 1].spend = R[R.length - 1].own;
  });
  rd("Sweetie").forEach((r) => {
    if (!r[0] || !r[1]) return;
    R.push({
      src: "sweetie",
      id: String(r[0]),
      type: String(r[1]).trim().toUpperCase(),
      amount: aiNum_(r[2]),
      balance: aiNum_(r[3]),
      date: toDateStr(r[4]),
      desc: String(r[5] || "").trim(),
    });
  });
  rd("Salary").forEach((r) => {
    const d = aiMonthToDate_(toMonthKey(r[0]));
    if (d)
      R.push({
        src: "salary",
        date: d,
        month: toMonthKey(r[0]),
        amount: aiNum_(r[1]),
      });
  });
  rd("Summary").forEach((r) => {
    const d = aiMonthToDate_(toMonthKey(r[0]));
    if (d)
      R.push({
        src: "summary",
        date: d,
        month: toMonthKey(r[0]),
        spent: aiNum_(r[1]),
        amount: aiNum_(r[2]),
        sweetieBalance: aiNum_(r[3]),
        salary: aiNum_(r[4]),
      });
  });
  const seen = {};
  R.forEach((r) => {
    if (r.src === "expense" || r.src === "card" || r.src === "sweetie") {
      const k = [r.src, r.id, r.amount, r.desc].join("|");
      r.dup = !!seen[k];
      seen[k] = 1;
    }
    r.t = [r.desc, r.remarks, r.cat, r.card, r.person, r.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  });
  return R;
}

// ── 2. Live data profile so the model knows YOUR data ───────────────────────
function aiProfile_(R) {
  const cnt = (src, f) => {
    const m = {};
    R.filter((r) => r.src === src).forEach((r) => {
      const k = r[f];
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return Object.keys(m)
      .map((k) => k + "(" + m[k] + ")")
      .join(", ");
  };
  const rng = (src) => {
    const d = R.filter((r) => r.src === src && r.date)
      .map((r) => r.date)
      .sort();
    return d.length
      ? d[0] + ".." + d[d.length - 1] + " n=" + d.length
      : "empty";
  };
  return [
    "expense rows " +
      rng("expense") +
      " | categories: " +
      cnt("expense", "cat"),
    "card rows " +
      rng("card") +
      " | cards: " +
      cnt("card", "card") +
      " | people: " +
      cnt("card", "person") +
      " | status: " +
      cnt("card", "status"),
    "sweetie rows " + rng("sweetie") + " | types: " + cnt("sweetie", "type"),
    "salary rows " + rng("salary") + "; summary rows " + rng("summary"),
  ].join("\n");
}

const AI_RULES = [
  "You are the analytics brain of a personal finance tracker owned by Gaurav (GRV). Answer ANY question about his data by writing ONE read-only JavaScript program body.",
  "Data: array R of row objects. Common fields: dup (true if an identical id/amount/desc row already appeared earlier; keep them in totals but mention it if relevant), src ('expense'|'card'|'sweetie'|'salary'|'summary'), date 'YYYY-MM-DD', amount (number), desc, t (lowercase searchable text of all text fields), own (true when the money is GRV's own).",
  "expense: cat(category), desc, amount. Categories: Received=money IN; Bill Repayment=paying a credit-card bill (a transfer, it duplicates card rows - exclude unless asked); Loan=lent to others; Savings and Investments / Sweetie Saving / Sweetie Borrow=savings or transfers; others (Personal, Food and Groceries, Entertainment and Leisure=beer/whiskey/snacks, Transportation, Shopping, Dining Out, Miscellaneous...) are real spending.",
  "card: card, person(used by), desc, remarks, status (UNPAID | PAID | OWED=others owe GRV | SETTLED), billing(billing month). own=true for GRV's own card use; other people's card rows are money GRV paid on their behalf (they owe him unless PAID/SETTLED).",
  "LOANS/UDHAAR: expense cat Loan = money GRV lent (person name is in desc); money returned = expense cat Received (desc has name or RETURN) or sweetie CREDIT; for 'X ka kitna baaki' compute lent - returned by name match in r.t, and for card rows of other people use status UNPAID/OWED = they still owe GRV.",
  "sweetie: type (SAVING|CREDIT|DEBIT), amount, balance(running), desc. summary: month, spent, amount(=remaining), sweetieBalance, salary. salary: amount.",
  "Descriptions are English/Hinglish/typos/brands. Use WORLD KNOWLEDGE with regex on r.t: alcohol=whisk?e?y|beer|wine|daru|vodka|rum|alcohol|bar|kingfisher|royal|stag|quater|chakhna; food delivery=swiggy|zomato|instamart|flavours; cab=uber|ola|rapido; etc. Regex on r.t MUST use word boundaries (\\b) for short words (bar, rum, ola, tea) so 'Bihar'/'Grocery' never match. Be generous with synonyms but avoid substring false positives.",
  "'my/mera kharcha/expense/spending' = rows with r.spend===true (already excludes Received, Bill Repayment, Loan, Savings, Sweetie transfers; sweetie/salary/summary rows have no spend). ALWAYS start item/merchant/category searches from R.filter(r=>r.spend) unless the user explicitly asks about loans/bills/received/savings. 'Cards/credit card' questions use src==='card'. A person name filters r.person (case-insensitive, includes). Bill Repayment descriptions embed breakdowns like 'ALCOHOL = 630' / 'Alcohol – ₹750'. For category/item questions return the main total from spend rows ONLY, and mention separately in text (not added to value) any extra amounts found in Bill Repayment breakdowns via helper bill(r,/alcohol|whisk/i), labelled 'bill breakdown me bhi mila: ₹X (double count ho sakta hai)'.",
  "Helpers in scope: bill(r,regex)->number found right after the keyword in a Bill Repayment description (0 if none), today ('YYYY-MM-DD'), sum(arr,f?), by(arr,keyFn)->[{k,v,n}] sorted by v desc (v=sum amount), mon(dateStr)->'YYYY-MM', inr(n)->'₹1,234', add(d,{m:-5})->date string shifted months. Compare dates as strings. 'last N months' = from first day of month N-1 months before this month up to today (state the range in text).",
  "Program must `return {text, value, groups, rows}`: text = short answer in the USER'S language/script (Hinglish if he wrote Hinglish) with exact computed numbers via inr() and the time range used; value = main number or null; groups = optional breakdown [{k,v,n}]; rows = up to 40 most relevant source rows (the evidence). Never invent numbers; compute everything from R. If nothing matches, return text saying so with what you searched.",
  "Do NOT use async, fetch, eval, Function, require, SpreadsheetApp, or globals. Plain JS only (const/let/arrow fns OK).",
  'Output ONLY JSON: {"reply":"","title":"short","code":"<program body, use \\n or ; for newlines>"}. For greetings/help/non-data chat output {"reply":"..."} only. Any question about money, spending, cards, people, dates or sheets MUST have code - never answer from guesswork. If the question is genuinely ambiguous, put one short clarifying question in reply.',
].join("\n");

// ── 3. Safe execution ───────────────────────────────────────────────────────
function aiRun_(code, R) {
  if (
    /\b(SpreadsheetApp|UrlFetchApp|PropertiesService|DriveApp|MailApp|ScriptApp|LockService|CacheService|eval|Function|globalThis|constructor|prototype|__proto__|require|import|fetch|process|XMLHttpRequest)\b/.test(
      code,
    )
  )
    throw new Error("blocked keyword in generated code");
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x.amount) || 0, 0);
  const by = (a, kf) => {
    const m = {};
    a.forEach((x) => {
      const k = kf(x) || "(none)";
      m[k] = m[k] || { k, v: 0, n: 0 };
      m[k].v += x.amount || 0;
      m[k].n++;
    });
    return Object.keys(m)
      .map((k) => m[k])
      .sort((p, q) => q.v - p.v);
  };
  const bill = (r, re) => {
    const m = String(r.desc || "").match(
      new RegExp(
        "(?:" + re.source + ")[^\\d\\n]{0,8}([\\d,]+(?:\\.\\d+)?)",
        "i",
      ),
    );
    return m ? parseFloat(m[1].replace(/,/g, "")) || 0 : 0;
  };
  const mon = (d) => String(d || "").slice(0, 7);
  const inr = (n) =>
    "₹" +
    Math.round(n || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  const add = (d, o) => {
    const p = String(d).split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1 + ((o && o.m) || 0), p[2] || 1);
    dt.setDate(dt.getDate() + ((o && o.d) || 0));
    return Utilities.formatDate(dt, "Asia/Kolkata", "yyyy-MM-dd");
  };
  const f = new Function(
    "R",
    "today",
    "sum",
    "by",
    "mon",
    "inr",
    "add",
    "bill",
    "SpreadsheetApp",
    "UrlFetchApp",
    "PropertiesService",
    "DriveApp",
    "MailApp",
    "LockService",
    "ScriptApp",
    '"use strict";\n' + code,
  );
  return f(R.slice(), today, sum, by, mon, inr, add, bill);
}

// ── 4. Endpoint ─────────────────────────────────────────────────────────────
function aiQuery_(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const R = aiRows_(ss);
  const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  const q = String(e.parameter.q || "").slice(0, 500);
  const hist = String(e.parameter.hist || "").slice(0, 2200);
  const sample = R.filter((r) => r.src === "card" || r.src === "expense")
    .slice(-12)
    .map((r) =>
      [r.src, r.date, r.cat || r.card, r.person || "", r.desc, r.amount].join(
        "|",
      ),
    )
    .join("\n");
  const base = [
    "Today is " + today + ".",
    AI_RULES,
    "DATA PROFILE:\n" + aiProfile_(R),
    "RECENT SAMPLE (src|date|cat/card|person|desc|amount):\n" + sample,
    hist
      ? "Previous turns (JSON; for follow-ups like 'isme se', 'aur', 'same', reuse and modify that code): " +
        hist
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  let err = "",
    plan = null,
    out = null,
    last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      base +
      (err
        ? "\n\nYour previous program failed with: " +
          err +
          "\nPrevious code:\n" +
          last +
          "\nFix it."
        : "") +
      "\n\nQUESTION:\n" +
      q;
    const resp = llmJson(prompt);
    let txt = resp.getContent();
    try {
      plan = JSON.parse(txt);
    } catch (x) {
      err = "invalid JSON";
      continue;
    }
    if (plan.error) return jsonOut({ error: plan.error });
    if (!plan.code) {
      const chat =
        /^\s*(hi|hello|hey|namaste|thanks|thank you|shukriya|help|kaun ho|who are you)\b/i.test(
          q,
        );
      if (!chat && attempt === 0) {
        err =
          "You returned a reply without code. NEVER claim 'no record' without computing it. Write the program.";
        last = "(none)";
        continue;
      }
      return jsonOut({
        reply: plan.reply || "Kuch samajh nahi aaya, thoda aur batao.",
      });
    }
    last = plan.code;
    try {
      out = aiRun_(plan.code, R);
      if (!out || typeof out !== "object")
        throw new Error("program must return an object");
      break;
    } catch (x) {
      err = String(x.message || x).slice(0, 200);
      out = null;
    }
  }
  if (!out) return jsonOut({ error: "AI could not compute this: " + err });
  // Self-check pass: a second look at the evidence; fixes wrong filters / periods / false matches.
  try {
    const ev = (Array.isArray(out.rows) ? out.rows : [])
      .slice(0, 14)
      .map((r) =>
        [
          r.src,
          r.date,
          r.cat || r.card || r.type || "",
          r.person || "",
          r.desc,
          r.amount,
        ].join("|"),
      )
      .join("\n");
    const vp =
      "Today is " +
      today +
      ". " +
      AI_RULES.split("\n")[0] +
      "\nQUESTION: " +
      q +
      "\nPROGRAM:\n" +
      String(plan.code).slice(0, 1500) +
      "\nRESULT text: " +
      String(out.text).slice(0, 300) +
      " | value: " +
      out.value +
      "\nGROUPS: " +
      JSON.stringify((out.groups || []).slice(0, 8)) +
      "\nEVIDENCE ROWS (src|date|cat/card|person|desc|amount):\n" +
      ev +
      "\nAudit: does the result answer EXACTLY the question? Check: only real spending (no Bill Repayment/Loan/Received unless asked), no substring false matches (e.g. Bihar), correct time range, correct person, nothing obvious missing, correct language. " +
      'If correct reply {"ok":true}. If wrong reply {"code":"<complete corrected program body>"} (same return shape).';
    const vr = JSON.parse(llmJson(vp).getContent());
    if (vr && vr.code && vr.code !== plan.code) {
      const out2 = aiRun_(vr.code, R);
      if (
        out2 &&
        typeof out2 === "object" &&
        (out2.text || out2.value != null)
      ) {
        out = out2;
        plan.code = vr.code;
      }
    }
  } catch (x) {
    /* keep first answer */
  }
  const rows = (Array.isArray(out.rows) ? out.rows : [])
    .slice(0, AI_MAX_ROWS_OUT)
    .map((r) => ({
      src: r.src,
      date: r.date,
      cat: r.cat || r.type || "",
      card: r.card || "",
      person: r.person || "",
      desc: r.desc || "",
      amount: r.amount,
      status: r.status || "",
    }));
  const groups = (Array.isArray(out.groups) ? out.groups : [])
    .slice(0, 30)
    .map((g) => ({ k: String(g.k), v: g.v, n: g.n }));
  return jsonOut({
    title: plan.title || "",
    text: String(out.text || ""),
    value: typeof out.value === "number" ? out.value : null,
    groups,
    rows,
    code: String(plan.code).slice(0, 700),
  });
}

// Legacy semantic filter (kept so older app builds don't break).
function aiMatch_(e) {
  const prompt =
    "Semantic filter for a finance tracker. Question: " +
    String(e.parameter.q || "").slice(0, 200) +
    "\nConcept: " +
    String(e.parameter.concept || "").slice(0, 120) +
    "\nItems index:text separated by |. Return EVERY item plausibly in the concept (Hinglish, brands, typos)." +
    '\nReply ONLY JSON: {"match":[indices]}.\nITEMS:\n' +
    String(e.parameter.items || "").slice(0, 7000);
  return llmJson(prompt);
}

// ── Deterministic bank-SMS reader (no AI): amount skips limit/balance, merchant label, dd-mm-yyyy date ──
function aiBankFields_(text) {
  const t = String(text || "");
  const out = { sms: false, amount: 0, desc: "", date: "" };
  const money = /(?:\b(?:inr|rs\.?)|₹)\s*[\d,]+/i.test(t);
  const sig =
    /\b(spent|debited|purchase|txn|transaction|paid|payment|charged|merchant|towards|credited)\b/i.test(
      t,
    ) ||
    /\b(?:card|a\/c|acct?)\b[^\d]{0,14}[x*]*\d{4}\b|\b[x*]{2,}\s*\d{4}\b/i.test(
      t,
    );
  out.sms = money && sig;
  if (!out.sms) return out;
  const re = /(?:\b(?:inr|rs\.?)|₹)\s*([\d,]+(?:\.\d+)?)/gi;
  let m,
    first = 0;
  while ((m = re.exec(t))) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (!(v > 0)) continue;
    const before = t.slice(Math.max(0, m.index - 34), m.index).toLowerCase();
    if (
      /(avail|avl|limit|balance|bal\b|outstanding|min(imum)?\s*due|total\s*due|reward)[^.]{0,22}$/.test(
        before,
      )
    )
      continue;
    if (!first) first = v;
    if (
      /(spent|debited|txn|transaction|purchase|paid|payment|charged|towards|of)\s*(?:of\s*)?$/.test(
        before,
      )
    ) {
      first = v;
      break;
    }
  }
  out.amount = first;
  const lm = t.match(
    /\bmerchant(?:\s*name)?\s*[:\-]\s*([^\n]+?)(?=\s+(?:card|credit|debit|date|avail|total|a\/c|acct?|on|ref|txn|upi|axis|hdfc|icici|sbi|kotak|idfc|pnb|hsbc|indusind|rbl|bob)\b|\n|$)/i,
  );
  if (lm) out.desc = lm[1].trim();
  const d = t.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\b/);
  if (d) {
    const dd = +d[1],
      mo = +d[2];
    if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31)
      out.date = d[3] + "-" + ("0" + mo).slice(-2) + "-" + ("0" + dd).slice(-2);
  }
  return out;
}

// ── Smart entry parser: SMS / email / casual typing / voice-typing -> one transaction ──
function aiParse_(e) {
  const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  const cards = String(e.parameter.cards || "");
  const cats = String(e.parameter.cats || "");
  const people = String(e.parameter.people || "");
  const text = String(e.parameter.text || "").slice(0, 1500);
  const prompt = [
    "Today is " +
      today +
      ". Extract ONE transaction from the user's text. The text may be a bank SMS/email, or casual Hinglish typing, or voice-typed (spelling errors like 'Roarbank' for a bank name).",
    'Reply ONLY JSON: {"kind":"card|expense|sweetie","card":"","usedBy":"","desc":"","remarks":"","amount":0,"date":"YYYY-MM-DD","category":"","type":"SAVING|CREDIT|DEBIT"}',
    "READ THE WHOLE MESSAGE. It can mix a bank SMS/email with the user's own lines (names, notes). Explicit labels win: 'Used by: X' => usedBy X; 'Desc: Y' => desc; 'Remarks/Note: Z' => remarks.",
    "BANK SMS: amount = the transaction amount only (INR/Rs/₹ value next to 'spent'/'debited'/'transaction'/'towards'), NOT the OTP, NOT the available limit/balance, NOT the card last-4. desc = the MERCHANT (text after 'towards', 'at', 'on', 'to', e.g. 'towards Flipkart' => FLIPKART; 'IIL*Indian Rail' => IRCTC; 'PNB*IRCTC' => IRCTC; 'AMAZON PAY IN G' => AMAZON). Date from the SMS if present. The bank + 'Credit Card'/'Card XXnnnn' tells the card.",
    "REMARKS: any extra note the user wrote (e.g. 'already paid in kotak', 'will get refund', 'split with Anukaran', 'for mummy'), UPPERCASE; empty if none. Never put the merchant or person in remarks twice.",
    "AMOUNT: a plain number. If the text has sums like '214+163' add them (=377). Ignore OTPs, card last-4, available limit, balances, reference numbers.",
    "KIND: 'card' if the text mentions cc / credit card / card / a bank-card name or a card SMS. 'sweetie' if it mentions Sweetie saving/credit/debit/borrow. Otherwise 'expense'.",
    "CARD (kind=card): pick EXACTLY one string from this list by fuzzy/phonetic match on bank/card words, ignoring spelling mistakes (e.g. 'first bank', 'idfc', 'roar bank' ~ a similar-sounding bank in the list; 'amazon pay'=ICICI-AMAZON PAY; 'flipkart'=AXIS-FLIPKART). If two cards fit equally, pick the first listed. If nothing is even remotely similar, leave card empty.",
    "CARDS: " + cards,
    "USEDBY: the person who used the card. Prefer a name from the known list (GRV/Gaurav/me => GRV); but if the user's own line names someone else (mummy, papa, bhai, wife, any name) use that word exactly as typed. Never invent a name that is not in the text. Known people: " +
      people,
    "DESC: the merchant or item, UPPERCASE, short (e.g. BEER, PETROL, FLIPKART). Remove filler words like transaction, cc, credit card, bank name, amount, person name.",
    "CATEGORY (kind=expense): pick EXACTLY from: " +
      cats +
      ". beer/whiskey/wine/daru/cigarette/tea/snacks => Entertainment and Leisure; grocery/vegetables/milk => Food and Groceries; petrol/cab/ticket => Transportation; etc. Use the best fit, never empty for expense.",
    "DATE: use a date in the text; 'yesterday'/'kal' => yesterday; otherwise today.",
    "TYPE (kind=sweetie): SAVING | CREDIT | DEBIT.",
    "TEXT:\n" + text,
  ].join("\n");
  const bf = aiBankFields_(text);
  let plan;
  try {
    plan = JSON.parse(llmJson(prompt).getContent());
  } catch (x) {
    plan = null;
  }
  if (!plan || plan.error) {
    // AI down/limited: a bank SMS is still parsed deterministically
    if (!bf.sms)
      return jsonOut({
        error: (plan && plan.error) || "AI could not parse this text",
      });
    plan = {
      kind: "card",
      card: "",
      usedBy: "",
      desc: "",
      remarks: "",
      amount: 0,
      date: "",
      category: "",
      type: "",
    };
  }
  if (bf.sms) {
    // hard overrides: these fields are exact in a bank SMS, never trust the model over them
    if (bf.amount) plan.amount = bf.amount;
    if (bf.desc) plan.desc = bf.desc;
    if (bf.date) plan.date = bf.date;
    if (plan.kind !== "sweetie") plan.kind = "card";
  }
  // ── hard guards (do not trust the model blindly) ──
  let amt = plan.amount;
  if (typeof amt === "string") {
    const parts = amt
      .replace(/[₹,\s]/g, "")
      .split("+")
      .map(parseFloat);
    amt = parts.every((n) => isFinite(n))
      ? parts.reduce((a, b) => a + b, 0)
      : parseFloat(amt) || 0;
  }
  const raw = text.replace(/[₹,]/g, "");
  const sums = raw.match(/\b\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+/);
  if (sums && !bf.sms)
    amt = sums[0].split("+").reduce((a, b) => a + (parseFloat(b) || 0), 0);
  plan.amount = amt || 0;
  const list = cards
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
  if (plan.card) {
    const hit = list.find(
      (c) => c.toLowerCase() === String(plan.card).trim().toLowerCase(),
    );
    plan.card = hit || "";
  }
  if (/\b(cc|credit\s*card|card)\b/i.test(text) && plan.kind === "expense")
    plan.kind = "card";
  if (plan.kind === "card" && !plan.card) {
    // voice-typed bank names ('Roarbank' = IDFC First) and bank keywords -> candidate cards; pick the one used most recently
    const ALIAS = [
      [/\b(idfc|first\s*bank|idfc\s*first|millenia|millennia)\b/i, /idfc/i],
      [/\bhdfc\b/i, /hdfc/i],
      [/\baxis\b/i, /axis/i],
      [/\bsbi\b/i, /sbi/i],
      [/\bicici\b/i, /icici/i],
      [/\bamazon\b/i, /amazon/i],
      [/\bflipkart\b/i, /flipkart/i],
      [/\b(tata|neu)\b/i, /tata/i],
      [/\bcoral\b/i, /coral/i],
    ];
    let cand = [];
    const tc = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    cand = list.filter((c) =>
      c
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((t) => t.length > 3 && tc.indexOf(t) >= 0),
    );
    if (cand.length > 1)
      cand = cand.filter((c) => {
        const p = c
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 3);
        return (
          p.filter((t) => tc.indexOf(t) >= 0).length ===
          Math.max.apply(
            null,
            cand.map(
              (x) =>
                x
                  .toLowerCase()
                  .split(/[^a-z0-9]+/)
                  .filter((t) => t.length > 3 && tc.indexOf(t) >= 0).length,
            ),
          )
        );
      });
    ALIAS.forEach((a) => {
      if (!cand.length && a[0].test(text))
        cand = list.filter((c) => a[1].test(c));
    });
    if (cand.length) {
      const last = {};
      try {
        const cs =
          SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");
        if (cs)
          cs.getDataRange()
            .getValues()
            .slice(1)
            .forEach((r) => {
              const d = toDateStr(r[4]),
                c = String(r[1] || "").trim();
              if (c && d && (!last[c] || d > last[c])) last[c] = d;
            });
      } catch (x) {}
      cand.sort((p, q) =>
        String(last[q] || "").localeCompare(String(last[p] || "")),
      );
      plan.card = cand[0];
    }
  }
  if (plan.kind === "card" && !plan.card) {
    // phonetic/substring fallback: any list card sharing a 3+ letter token with the text
    const words = text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2);
    let best = "",
      bs = 0;
    list.forEach((c) => {
      const sc = c
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((t) => t.length > 2)
        .filter((t) =>
          words.some((w) => w === t || w.indexOf(t) >= 0 || t.indexOf(w) >= 0),
        ).length;
      if (sc > bs) {
        bs = sc;
        best = c;
      }
    });
    plan.card = best;
  }
  if (plan.kind === "expense" && !plan.category)
    plan.category = "Miscellaneous";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.date || ""))) plan.date = today;
  plan.desc = String(plan.desc || "").toUpperCase();
  plan.remarks = String(plan.remarks || "").toUpperCase();
  if (plan.usedBy)
    plan.usedBy = String(plan.usedBy)
      .trim()
      .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return jsonOut(plan);
}
