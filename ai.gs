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
  R.forEach((r) => {
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
  "Data: array R of row objects. Common fields: src ('expense'|'card'|'sweetie'|'salary'|'summary'), date 'YYYY-MM-DD', amount (number), desc, t (lowercase searchable text of all text fields), own (true when the money is GRV's own).",
  "expense: cat(category), desc, amount. Categories: Received=money IN; Bill Repayment=paying a credit-card bill (a transfer, it duplicates card rows - exclude unless asked); Loan=lent to others; Savings and Investments / Sweetie Saving / Sweetie Borrow=savings or transfers; others (Personal, Food and Groceries, Entertainment and Leisure=beer/whiskey/snacks, Transportation, Shopping, Dining Out, Miscellaneous...) are real spending.",
  "card: card, person(used by), desc, remarks, status (UNPAID | PAID | OWED=others owe GRV | SETTLED), billing(billing month). own=true for GRV's own card use; other people's card rows are money GRV paid on their behalf (they owe him unless PAID/SETTLED).",
  "sweetie: type (SAVING|CREDIT|DEBIT), amount, balance(running), desc. summary: month, spent, amount(=remaining), sweetieBalance, salary. salary: amount.",
  "Descriptions are English/Hinglish/typos/brands. Use WORLD KNOWLEDGE with regex on r.t: alcohol=whisk?e?y|beer|wine|daru|vodka|rum|alcohol|bar|kingfisher|royal|stag|quater|chakhna; food delivery=swiggy|zomato|instamart|flavours; cab=uber|ola|rapido; etc. Be generous, then think about false positives.",
  "'my/mera kharcha/expense' = rows with own===true excluding expense cats Received, Bill Repayment, Loan, Savings and Investments, Sweetie Saving, Sweetie Borrow (and src salary/summary/sweetie) unless the user names them. 'Cards/credit card' questions use src==='card'. A person name filters r.person (case-insensitive, includes). Bill Repayment descriptions sometimes embed breakdowns like 'ALCOHOL = 630'; parse with regex only if the user asks about a category in a period/bill where card rows don't cover it.",
  "Helpers in scope: today ('YYYY-MM-DD'), sum(arr,f?), by(arr,keyFn)->[{k,v,n}] sorted by v desc (v=sum amount), mon(dateStr)->'YYYY-MM', inr(n)->'₹1,234', add(d,{m:-5})->date string shifted months. Compare dates as strings. 'last N months' = from first day of month N-1 months before this month up to today (state the range in text).",
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
    "SpreadsheetApp",
    "UrlFetchApp",
    "PropertiesService",
    "DriveApp",
    "MailApp",
    "LockService",
    "ScriptApp",
    '"use strict";\n' + code,
  );
  return f(R.slice(), today, sum, by, mon, inr, add);
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
