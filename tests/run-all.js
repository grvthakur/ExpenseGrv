"use strict";
/*
 * GRV Expense Tracker — full verification suite.
 *
 *   cd tests && npm i --no-save jsdom   (one time; node_modules is git-ignored)
 *   node tests/run-all.js
 *
 * Covers: syntax of every script, dashboard calculations (Total Expenses / Remaining / Sweetie /
 * Total Saving / This Month Saving), mask button, AI Smart Entry parsing (local parser, bank-SMS
 * amount, hints, shorthand), AI query engine (runPlan / summary rows), Apps Script ai.gs helpers,
 * client-vs-server parser parity and the repo's own regression scripts.
 *
 * Synthetic data only. No network. Nothing is written outside this process.
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const { ROOT, read, loadApp, makeRunner, hasJsdom } = require("./harness");

const R = makeRunner();
const pendingExtra = [];
/** async test: awaits fn, records the result under the given suite name. */
const atest = (suiteName, name, fn) => pendingExtra.push(Promise.resolve().then(fn).then(() => R.results.push({ suite: suiteName, name, status: "pass" }), (e) => R.results.push({ suite: suiteName, name, status: "fail", err: e && e.message ? e.message : String(e) })));
const { suite, test, skip } = R;
const cents = (n) => Math.round(n * 100);
const near = (a, b, msg) => assert.equal(cents(a), cents(b), msg);
// jsdom objects come from another JS realm, so compare their JSON form.
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

// ───────────────────────────────────────────────────────────────────────────
suite("1. Syntax of every script");
fs.readdirSync(ROOT)
  .filter((f) => /\.(js|gs)$/.test(f))
  .forEach((f) =>
    test(`${f} compiles`, () => {
      new vm.Script(read(f), { filename: f });
    }),
  );

// ───────────────────────────────────────────────────────────────────────────
// Reference model of the dashboard rules (written independently of script.js).
const SAVING = ["Savings and Investments", "Sweetie Saving"];
function model({ rows, salary, sweetieDebits = [], excludedDebits = [] }) {
  let exp = 0, rec = 0, ss = 0, sip = 0, borrow = 0;
  rows.forEach(({ category: c, amount: a }) => {
    if (c === "Received") rec += a;
    else if (c === "Sweetie Saving") ss += a;
    else if (c === "Savings and Investments") sip += a;
    else if (c === "Sweetie Borrow") { borrow += a; exp += a; }
    else exp += a;
  });
  sweetieDebits.forEach((a) => { borrow += a; exp += a; });
  const borrowAll = borrow + excludedDebits.reduce((x, y) => x + y, 0);
  return {
    exp, salary, rec,
    remaining: salary + rec - (exp + ss + sip - borrow),
    sweet: ss - borrowAll,
    monthSaving: ss + sip,
  };
}
// The formula the app used BEFORE this change (savings were inside totalExp).
const legacyRemaining = ({ rows, salary }) => {
  let totalExp = 0, borrow = 0, rec = 0;
  rows.forEach(({ category: c, amount: a }) => {
    if (c === "Received") rec += a;
    else if (c === "Sweetie Borrow") { borrow += a; totalExp += a; }
    else totalExp += a;
  });
  return salary + rec - (totalExp - borrow);
};

const row = (id, month, category, amount, day = "02") => ({
  id: String(id), date: `20${month.slice(4)}-${monthNum(month)}-${day}`, month, category, description: "t", amount,
});
function monthNum(m) {
  return String(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m.slice(0, 3)) + 1).padStart(2, "0");
}
const OCT = (cat, amt, id) => row(id, "Oct-26", cat, amt);

function dash(a) {
  const t = a.text;
  return { exp: t("statTotalExpenses"), sal: t("statSalary"), rem: t("statRemaining"), sweet: t("statSweetie"), tot: t("statTotalSaving"), mon: t("statMonthSaving") };
}

if (!hasJsdom) {
  suite("2-6. DOM based suites");
  skip("dashboard, savings cards, mask, AI parsing", "jsdom not installed: run `npm i --no-save jsdom` inside tests/");
} else {
  // ─────────────────────────────────────────────────────────────────────────
  suite("2. App loads cleanly");
  {
    const a = loadApp();
    test("no script errors while loading script.js + ai-entry.js + animation.js", () => deq(a.errors, []));
    test("AI internals exposed for testing", () => ["localParse", "bankAmount", "shorthandHint", "userLine", "splitHint", "labelHint", "runPlan", "extraRows", "smsParse"].forEach((n) => assert.equal(typeof a.ai[n], "function", n)));
    a.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  suite("3. Dashboard calculations");
  const scenarios = {
    "empty month": { rows: [], salary: 0 },
    "salary only": { rows: [], salary: 50000 },
    "mixed month": { rows: [OCT("Food and Groceries", 1000.1, 1), OCT("Savings and Investments", 5000, 2), OCT("Sweetie Saving", 2000.5, 3), OCT("Sweetie Borrow", 700, 4), OCT("Received", 300, 5)], salary: 50000 },
    "only savings (SIP + Sweetie Saving)": { rows: [OCT("Savings and Investments", 5000, 1), OCT("Sweetie Saving", 1500, 2)], salary: 20000 },
    "only Sweetie Borrow": { rows: [OCT("Sweetie Borrow", 900, 1)], salary: 10000 },
    "only Received": { rows: [OCT("Received", 2500, 1)], salary: 10000 },
    "rounding 0.1 + 0.2": { rows: [OCT("Dining Out", 0.1, 1), OCT("Dining Out", 0.2, 2)], salary: 1 },
    "zero amount rows": { rows: [OCT("Shopping", 0, 1), OCT("Sweetie Saving", 0, 2), OCT("Food and Groceries", 10, 3)], salary: 100 },
    "refund style negative amount": { rows: [OCT("Shopping", 500, 1), OCT("Shopping", -120.5, 2)], salary: 1000 },
    "expenses exceed salary (negative remaining)": { rows: [OCT("Shopping", 900, 1), OCT("Loan", 400, 2)], salary: 1000 },
    "large paise values": { rows: [OCT("Transportation", 99999.99, 1), OCT("Savings and Investments", 12345.67, 2), OCT("Received", 0.01, 3)], salary: 250000 },
    "every category once": { rows: ["Food and Groceries","Transportation","Personal","Shopping","Entertainment and Leisure","Dining Out","Savings and Investments","Bill Repayment","Miscellaneous","Received","Loan","Sport","Sweetie Saving","Sweetie Borrow"].map((c, i) => OCT(c, 100 + i, i)), salary: 30000 },
  };
  Object.entries(scenarios).forEach(([name, sc]) => {
    test(name, () => {
      const a = loadApp();
      a.app.set({ expenses: sc.rows, salaries: { "Oct-26": sc.salary }, sweetieTxns: [] });
      a.setMonth(2026, 9);
      a.app.render();
      const d = dash(a), m = model(sc), $ = a.app.money;
      assert.equal(d.exp, $(m.exp), "Total Expenses");
      assert.equal(d.rem, $(m.remaining), "Remaining");
      assert.equal(d.sweet, $(m.sweet), "Sweetie Balance");
      assert.equal(d.mon, $(m.monthSaving), "This Month Saving");
      assert.equal(d.sal, sc.salary ? $(sc.salary) : "—", "Salary");
      Object.values(d).forEach((v) => assert.ok(!/NaN|undefined|Infinity/.test(v), "bad value " + v));
      a.close();
    });
    test(`${name} — Remaining equals the pre-change formula`, () => {
      const a = loadApp();
      a.app.set({ expenses: sc.rows, salaries: { "Oct-26": sc.salary }, sweetieTxns: [] });
      a.setMonth(2026, 9);
      a.app.render();
      assert.equal(dash(a).rem, a.app.money(legacyRemaining(sc)));
      a.close();
    });
  });

  test("Total Expenses excludes SIP and Sweetie Saving but keeps Sweetie Borrow", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Savings and Investments", 5000, 1), OCT("Sweetie Saving", 2000, 2), OCT("Sweetie Borrow", 300, 3), OCT("Shopping", 100, 4)], salaries: { "Oct-26": 9000 }, sweetieTxns: [] });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).exp, a.app.money(400));
    a.close();
  });
  test("Remaining card shows this month's Sweetie Borrow (rows + Sweetie ledger DEBIT), not deducted", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Sweetie Borrow", 2600, 1), OCT("Sweetie Borrow", 390, 2)], salaries: { "Oct-26": 10000 }, sweetieTxns: [{ id: "x", type: "DEBIT", amount: 5000, date: "2026-10-02", description: "e" }, { id: "y", type: "DEBIT", amount: 77, date: "2026-09-02", description: "old month" }] });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statBorrowSub"), a.app.money(7990));
    assert.equal(a.text("statRemaining"), a.app.money(10000), "Remaining not reduced by borrow");
    a.close();
  });
  test("Sweetie Borrow does not reduce Remaining", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Sweetie Borrow", 800, 1)], salaries: { "Oct-26": 5000 }, sweetieTxns: [] });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).rem, a.app.money(5000));
    assert.equal(dash(a).sweet, a.app.money(-800));
    a.close();
  });
  test("saving still reduces Remaining (Remaining unchanged by the card change)", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Savings and Investments", 1000, 1), OCT("Sweetie Saving", 500, 2)], salaries: { "Oct-26": 5000 }, sweetieTxns: [] });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).rem, a.app.money(3500));
    a.close();
  });
  test("Sweetie ledger DEBIT rows count as expense/borrow; Sweetie Balance = Sweetie tab running balance", () => {
    const a = loadApp();
    const sw = [
      { id: "s1", type: "DEBIT", amount: 300, date: "2026-10-09", description: "chai" },
      { id: "s2", type: "DEBIT", amount: 200, date: "2026-10-10", description: "excluded one" },
      { id: "s3", type: "CREDIT", amount: 999, date: "2026-10-11", description: "ignored here" },
      { id: "s4", type: "DEBIT", amount: 50, date: "2026-09-11", description: "other month" },
    ];
    const rows = [OCT("Sweetie Saving", 1000, 1), OCT("Shopping", 100, 2)];
    a.app.set({ expenses: rows, salaries: { "Oct-26": 8000 }, sweetieTxns: sw });
    a.app.exclude("s2", true);
    a.setMonth(2026, 9); a.app.render();
    const m = model({ rows, salary: 8000, sweetieDebits: [300], excludedDebits: [200] });
    const d = dash(a), $ = a.app.money;
    assert.equal(d.exp, $(m.exp));
    assert.equal(d.rem, $(m.remaining));
    // ledger: -300 -200 +999 -50 (all months, excluded debits included) = 449, same as the Sweetie tab
    assert.equal(d.sweet, $(449));
    a.close();
  });
  test("month boundary: Dec-26 and Jan-27 do not leak into each other", () => {
    const a = loadApp();
    const rows = [row(1, "Dec-26", "Shopping", 100, "31"), row(2, "Jan-27", "Shopping", 7, "01"), row(3, "Dec-26", "Sweetie Saving", 40, "31"), row(4, "Jan-27", "Savings and Investments", 5, "01")];
    a.app.set({ expenses: rows, salaries: { "Dec-26": 1000, "Jan-27": 2000 }, sweetieTxns: [] });
    a.setMonth(2026, 11); a.app.render();
    assert.equal(dash(a).exp, a.app.money(100)); assert.equal(dash(a).mon, a.app.money(40));
    a.setMonth(2027, 0); a.app.render();
    assert.equal(dash(a).exp, a.app.money(7)); assert.equal(dash(a).mon, a.app.money(5));
    a.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  suite("4. Total Saving / This Month Saving cards");
  test("six cards in the expected order with unique ids", () => {
    const a = loadApp();
    const cards = [...a.doc.querySelectorAll("#expenseSection .stats .stat")];
    deq(cards.map((c) => c.querySelector(".stat-label").textContent.trim()), ["Total Expenses", "Salary", "Remaining", "Sweetie Balance", "Total Saving", "This Month Saving"]);
    ["statTotalSaving", "statMonthSaving", "amountMaskBtn"].forEach((id) => assert.equal(a.doc.querySelectorAll("#" + id).length, 1, id));
    a.close();
  });
  test("Total Saving adds every cached month; This Month Saving follows the selected month", () => {
    const a = loadApp();
    const rows = [row(1, "Sep-26", "Savings and Investments", 4000), row(2, "Sep-26", "Sweetie Saving", 1000), row(3, "Oct-26", "Savings and Investments", 5000), row(4, "Oct-26", "Sweetie Saving", 2000.5), row(5, "Oct-26", "Shopping", 999)];
    a.app.set({ expenses: rows, salaries: {}, sweetieTxns: [], grvHistoryAttempted: true });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).tot, a.app.money(12000.5)); assert.equal(dash(a).mon, a.app.money(7000.5));
    a.setMonth(2026, 8); a.app.render();
    assert.equal(dash(a).tot, a.app.money(12000.5)); assert.equal(dash(a).mon, a.app.money(5000));
    a.close();
  });
  test("full history fills months not cached locally; cached months win over stale history", () => {
    const a = loadApp();
    a.app.set({ expenses: [row(1, "Oct-26", "Savings and Investments", 100)], salaries: {}, sweetieTxns: [], grvHistoryAttempted: true, grvExpenseHistory: [row(2, "Aug-26", "Sweetie Saving", 111), row(3, "Oct-26", "Savings and Investments", 99999), row(4, "Jul-26", "Shopping", 5000)] });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).tot, a.app.money(211));
    a.close();
  });
  test("Total Saving ignores non-saving categories, Received and Sweetie Borrow", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Shopping", 1, 1), OCT("Received", 2, 2), OCT("Sweetie Borrow", 4, 3), OCT("Loan", 8, 4), OCT("Bill Repayment", 16, 5)], salaries: {}, sweetieTxns: [], grvHistoryAttempted: true });
    a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).tot, a.app.money(0));
    a.close();
  });
  test("empty data shows zero savings, not NaN", () => {
    const a = loadApp(); a.app.set({ expenses: [], salaries: {}, sweetieTxns: [], grvHistoryAttempted: true }); a.setMonth(2026, 9); a.app.render();
    assert.equal(dash(a).tot, a.app.money(0)); assert.equal(dash(a).mon, a.app.money(0)); a.close();
  });
  test("saving classifier agrees with the cards (GRV analysis uses the same rule)", () => {
    const a = loadApp();
    SAVING.forEach((c) => assert.equal(a.app.getGrvCategoryType(c), "saving", c));
    ["Shopping", "Received", "Sweetie Borrow", "Bill Repayment"].forEach((c) => assert.notEqual(a.app.getGrvCategoryType(c), "saving", c));
    a.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  suite("5. Mask / reveal amounts");
  test("toggle hides then reveals all six cards without touching the numbers", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Shopping", 50, 1), OCT("Savings and Investments", 70, 2)], salaries: { "Oct-26": 500 }, sweetieTxns: [] });
    a.setMonth(2026, 9); a.app.render();
    const before = dash(a), st = a.doc.querySelector("#expenseSection .stats"), btn = a.doc.getElementById("amountMaskBtn");
    assert.equal(btn.getAttribute("aria-pressed"), "false");
    btn.click();
    assert.ok(st.classList.contains("amounts-masked")); assert.equal(btn.getAttribute("aria-pressed"), "true"); assert.equal(btn.getAttribute("aria-label"), "Show amounts");
    deq(dash(a), before, "text must be unchanged while masked");
    assert.equal(st.querySelectorAll(".stat .stat-value").length, 7, "6 cards, Remaining card holds two values");
    btn.click();
    assert.ok(!st.classList.contains("amounts-masked")); assert.equal(btn.getAttribute("aria-label"), "Hide amounts");
    a.close();
  });
  test("choice is remembered across reload (new key, existing keys untouched)", () => {
    const a = loadApp(); a.doc.getElementById("amountMaskBtn").click();
    assert.equal(a.w.localStorage.getItem("grv_mask_amounts"), "1"); a.close();
    const b = loadApp({ storage: { grv_mask_amounts: "1" } });
    assert.ok(b.doc.querySelector("#expenseSection .stats").classList.contains("amounts-masked"));
    assert.equal(b.doc.getElementById("amountMaskBtn").getAttribute("aria-pressed"), "true"); b.close();
  });
  test("masking uses CSS only; stylesheet defines the blur and a compact 2-column mobile grid", () => {
    const css = read("index.html");
    assert.match(css, /amounts-masked \.stat-value,[^{]*\{[^}]*filter:\s*blur/);
    assert.match(css, /@media \(max-width: 600px\)\s*\{\s*#expenseSection \.stats-tools[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  });
  test("storage keys used by the app are unchanged", () => {
    const js = read("script.js");
    ["exp_v3", "sal_v3", "cards_v1", "cardcfg", "sweetie_v1"].forEach((k) => assert.ok(js.includes(`"${k}"`), k));
  });

  // ─────────────────────────────────────────────────────────────────────────
  suite("6. AI Smart Entry — local parser (no AI call)");
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const CARDS = [{ card: "AXIS-FLIPKART" }, { card: "HDFC-TATA NEU" }];
  const ai = (() => { const a = loadApp(); a.app.set({ cardConfig: CARDS }); return a; })();
  const AI = ai.ai;
  const today = new Date(), yest = new Date(); yest.setDate(yest.getDate() - 1);

  test("card + person + merchant + amount", () => deq(AI.localParse("grv flipkart swiggy 450"), { amount: 450, date: ym(today), kind: "card", card: "AXIS-FLIPKART", usedBy: "GRV", desc: "SWIGGY", remarks: "" }));
  test("'yesterday' sets yesterday's date; fuzzy card words resolve HDFC-TATA NEU", () => { const r = AI.localParse("yesterday grv tata neu 300 zomato"); assert.equal(r.date, ym(yest)); assert.equal(r.card, "HDFC-TATA NEU"); assert.equal(r.desc, "ZOMATO"); });
  test("₹ and thousands separators: ₹1,250.50", () => assert.equal(AI.localParse("₹1,250.50 flipkart grv").amount, 1250.5));
  test("explicit day+month: 5oct", () => assert.match(AI.localParse("5oct flipkart 100").date, /-10-05$/));
  test("remark keywords go to remarks, not description", () => { const r = AI.localParse("grv flipkart 100 pending"); assert.equal(r.remarks, "PENDING"); assert.equal(r.desc, ""); });
  test("Sweetie saving / borrow / credit types", () => {
    assert.equal(AI.localParse("sweetie saving 1500").type, "SAVING");
    const b = AI.localParse("sweetie borrow 500 chai"); assert.equal(b.type, "DEBIT"); assert.equal(b.desc, "CHAI"); assert.equal(b.amount, 500);
    assert.equal(AI.localParse("sweetie credit 200").type, "CREDIT");
  });
  test("ambiguous inputs are NOT guessed (returns null → falls back to AI)", () => {
    assert.equal(AI.localParse("450 swiggy"), null, "no card");
    assert.equal(AI.localParse("450 and 200 flipkart"), null, "two amounts");
    assert.equal(AI.localParse("sweetie 200"), null, "sweetie without type");
    assert.equal(AI.localParse("x".repeat(81) + " 5"), null, "longer than 80 chars");
    assert.equal(AI.localParse("flipkart"), null, "no amount");
  });
  test("two cards matching equally is a tie → no guess", () => assert.equal(AI.localParse("grv axis hdfc 100"), null));

  suite("7. AI Smart Entry — bank SMS amount, hints, shorthand");
  const SMS = [
    ["Rs 1,234.50 spent on card XX1234 at AMAZON. Avl limit Rs 50,000", 1234.5],
    ["Avl limit INR 90000. INR 450 debited", 450],
    ["OTP 123456 Rs.99 txn", 99],
    ["balance Rs 5000. spent Rs 300 at X", 300],
    ["Rs 10 reward points. Rs 250 charged on your card ending 4321", 250],
    ["no money here", 0],
  ];
  SMS.forEach(([t, want]) => test(`bankAmount: ${t.slice(0, 48)} → ${want}`, () => assert.equal(AI.bankAmount(t), want),
    t.startsWith("Rs 10 reward") ? { knownBug: "ai-entry.js bankAmount(): when the transaction amount is followed by its keyword ('Rs 250 charged') and an earlier unlabeled Rs value exists ('Rs 10 reward points'), the first Rs value wins. Server aiBankFields_ has the same logic. The AI fallback usually corrects this." } : {}));
  test("isBankSms recognises bank text and rejects chit-chat", () => { assert.equal(AI.isBankSms("Rs 450 spent on card 1234 at X"), true); assert.equal(AI.isBankSms("hello 450"), false); });
  test("smsParse (no network): amount, date, merchant, card", async () => {
    /* async result is checked below in the awaited block */
  });
  test("labelHint: explicit labels win", () => deq(AI.labelHint("Rs 450 spent on card 1234\nUsed by: grv\nDesc: swiggy dinner\nRemarks: already paid"), { body: "Rs 450 spent on card 1234", who: "Grv", desc: "SWIGGY DINNER", rem: "ALREADY PAID" }));
  test("labelHint: plain single line → null", () => assert.equal(AI.labelHint("just one line"), null));
  test("splitHint: 'person, item' line under an SMS", () => { const r = AI.splitHint("Rs 450 spent at SWIGGY card 1234\ngrv, swiggy meethae"); assert.equal(r.who, "GRV"); assert.equal(r.desc, "SWIGGY MEETHAE"); assert.equal(r.body, "Rs 450 spent at SWIGGY card 1234"); });
  test("userLine: 'Grv Chaypatti and Pyaj' → person GRV, remark CHAYPATTI - PYAJ", () => { const r = AI.userLine("Rs 450 spent at X\nGrv Chaypatti and Pyaj"); assert.equal(r.who, "GRV"); assert.equal(r.rem, "CHAYPATTI - PYAJ"); });
  test("userLine: 'Grv Grocery: dudh dahi egg'", () => assert.equal(AI.userLine("Rs 450 spent at X\nGrv Grocery: dudh dahi egg").rem, "GROCERY - DUDH DAHI EGG"));
  test("userLine ignores lines that look like SMS/links/questions", () => assert.equal(AI.userLine("Rs 450 spent at X\nCall 1800 to dispute this?"), null));
  test("shorthand: 'Grv, flpkrt axs, meethae from swiggy'", () => deq(AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy", { desc: "" }), { usedBy: "GRV", card: "AXIS-FLIPKART", remarks: "", desc: "SWIGGY - MEETHAE" }));
  test("shorthand: 'me' maps to GRV; unknown first word is rejected", () => {
    assert.equal(AI.shorthandHint("me, flipkart, chai from stall", { desc: "" }).usedBy, "GRV");
    assert.equal(AI.shorthandHint("zzz, flipkart, chai", { desc: "" }), null);
  });
  test("shorthand: inline 'remarks:' is captured", () => assert.equal(AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy, remarks: split with anu", { desc: "" }).remarks, "SPLIT WITH ANU"));
  test("shorthand: remark on a separate line ('already paid in kotak')", () => {
    const r = AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy\nalready paid in kotak", { desc: "" });
    assert.equal(r.remarks, "ALREADY PAID IN KOTAK");
  }, { knownBug: "ai-entry.js shorthandHint(): the extraNote regex is written with double backslashes (\\\\b, \\\\s) so it never matches; a remark on its own line is dropped. Same case already fails in shorthand-regression-test.js." });

  // ─────────────────────────────────────────────────────────────────────────
  suite("8. AI query engine (exact math in the browser)");
  const mk = (o) => ({ src: "expenses", date: "2026-10-01", person: "", card: "", category: "", desc: "", remarks: "", status: "", type: "", amount: 0, ...o });
  const DATA = [
    mk({ date: "2026-10-02", category: "Dining Out", desc: "swiggy", amount: 300 }),
    mk({ date: "2026-10-05", category: "Dining Out", desc: "zomato", amount: 200.5 }),
    mk({ date: "2026-09-05", category: "Shopping", desc: "shoes", amount: 1000 }),
    mk({ date: "2026-10-06", category: "Received", desc: "friend returned", amount: 400 }),
    mk({ src: "cards", date: "2026-10-03", card: "AXIS-FLIPKART", person: "Grv", desc: "SWIGGY", amount: 150, status: "UNPAID" }),
    mk({ src: "cards", date: "2026-10-04", card: "AXIS-FLIPKART", person: "Tanya", desc: "MYNTRA", amount: 700, status: "PAID" }),
    mk({ src: "cards", date: "2026-10-05", card: "HDFC-TATA NEU", person: "Grv", desc: "AMAZON", amount: 50, status: "UNPAID" }),
    mk({ src: "sweetie", date: "2026-10-07", type: "SAVING", amount: 1000, desc: "monthly" }),
    mk({ src: "sweetie", date: "2026-10-08", type: "DEBIT", amount: -300, desc: "chai" }),
  ];
  const P = (pl) => AI.runPlan(pl, DATA);
  test("date range + source filter + total", () => { const r = P({ sources: ["expenses"], from: "2026-10-01", to: "2026-10-31" }); near(r.total, 500.5); assert.equal(r.n, 2); });
  test("'Received' is left out of totals unless asked by category", () => { near(P({ sources: ["expenses"] }).total, 1500.5); near(P({ sources: ["expenses"], category: "received" }).total, 400); });
  test("category filter is partial and case-insensitive", () => near(P({ sources: ["expenses"], category: "DINING" }).total, 500.5));
  test("card filter and status filter", () => { near(P({ sources: ["cards"], card: "axis-flipkart" }).total, 850); near(P({ sources: ["cards"], status: "unpaid" }).total, 200); });
  test("person filter: cards match person; 'grv' includes self sources", () => { near(P({ sources: ["cards"], person: "grv" }).total, 200); near(P({ sources: ["cards"], person: "tanya" }).total, 700); });
  test("group by month, card, category are exact", () => {
    const m = P({ sources: ["expenses"], group: "month" }).groups; deq(m.map((g) => [g.k, g.sum]), [["2026-09", 1000], ["2026-10", 500.5]]);
    const c = P({ sources: ["cards"], group: "card" }).groups; deq(c.map((g) => [g.k, g.sum, g.n]), [["AXIS-FLIPKART", 850, 2], ["HDFC-TATA NEU", 50, 1]]);
    const k = P({ sources: ["expenses"], group: "category" }).groups; near(k.find((g) => g.k === "Dining Out").sum, 500.5);
  });
  test("sweetie type filter keeps sign (DEBIT negative)", () => { near(P({ sources: ["sweetie"], type: "debit" }).total, -300); near(P({ sources: ["sweetie"] }).total, 700); });
  test("free-text search across desc/remarks/card/category/person", () => { assert.equal(P({ text: "swiggy" }).n, 2); assert.equal(P({ text: "nothing-matches-this" }).n, 0); });
  test("rows are returned newest first; empty result is total 0", () => { const r = P({ sources: ["expenses"] }); deq(r.rows.map((x) => x.date), [...r.rows.map((x) => x.date)].sort().reverse()); assert.equal(P({ text: "zzzz" }).total, 0); });
  test("extraRows summary: salary + received − spent equals dashboard Remaining", () => {
    const a = loadApp();
    const exp = [["1", "2026-10-02", "Oct-26", "Shopping", "x", 1000], ["2", "2026-10-03", "Oct-26", "Savings and Investments", "sip", 5000], ["3", "2026-10-04", "Oct-26", "Sweetie Saving", "s", 2000.5], ["4", "2026-10-05", "Oct-26", "Sweetie Borrow", "b", 700], ["5", "2026-10-06", "Oct-26", "Received", "r", 300]];
    const rows = exp.map((r) => ({ id: r[0], date: r[1], month: r[2], category: r[3], description: r[4], amount: r[5] }));
    const sum = a.ai.extraRows(exp, [], [["Month", "Amount"], ["Oct-26", 50000]], []).find((r) => r.src === "summary" && r.date.startsWith("2026-10"));
    a.app.set({ expenses: rows, salaries: { "Oct-26": 50000 }, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.app.money(sum.amount), dash(a).rem);
    a.close();
  });
  test("extraRows summary 'Spent' excludes SIP/Sweetie Saving like the new Total Expenses card", () => {
    const a = loadApp();
    const exp = [["1", "2026-10-02", "Oct-26", "Shopping", "x", 1000], ["2", "2026-10-03", "Oct-26", "Savings and Investments", "sip", 5000]];
    const sum = a.ai.extraRows(exp, [], [["Month", "Amount"], ["Oct-26", 50000]], []).find((r) => r.src === "summary");
    assert.match(sum.desc, /Spent ₹1,000(\.00)?\b/);
    assert.match(sum.desc, /Saved ₹5,000(\.00)?\b/);
    near(sum.amount, 50000 - 1000 - 5000, "summary amount (= Remaining) is unchanged");
    a.close();
  });

  // smsParse is async: run it after the sync tests and record the result
  const smsPending = AI.smsParse("Rs 450.00 spent on Axis Bank Card XX1234 at SWIGGY on 12-10-2026. Avl limit Rs 90,000").then((r) => {
    test("smsParse: amount, date, merchant, kind", () => { assert.equal(r.amount, 450); assert.equal(r.date, "2026-10-12"); assert.equal(r.desc, "SWIGGY"); assert.equal(r.kind, "card"); });
  });
  const smsLimit = AI.smsParse("Your OTP is 123456. Do not share.").then((r) => test("smsParse: OTP/non-transaction text is not parsed", () => assert.equal(r, null)));

  // ─────────────────────────────────────────────────────────────────────────
  suite("9. Apps Script ai.gs helpers + client/server parity");
  {
    const ctx = { MONTH_NAMES: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], Utilities: { formatDate: () => "2026-10-25" }, console };
    vm.createContext(ctx);
    vm.runInContext(read("ai.gs") + "\n;this.__c = { AI_NONSPEND, AI_SELF };", ctx, { filename: "ai.gs" });
    test("aiNum_ handles numbers, numeric strings and junk", () => { assert.equal(ctx.aiNum_(5), 5); assert.equal(ctx.aiNum_("12.5"), 12.5); assert.equal(ctx.aiNum_("abc"), 0); assert.equal(ctx.aiNum_(undefined), 0); });
    test("aiMonthToDate_: 'Oct-26' → 2026-10-01, bad input → ''", () => { assert.equal(ctx.aiMonthToDate_("Oct-26"), "2026-10-01"); assert.equal(ctx.aiMonthToDate_("oct-26"), "2026-10-01"); assert.equal(ctx.aiMonthToDate_("Foo-26"), ""); assert.equal(ctx.aiMonthToDate_(""), ""); });
    test("server non-spend categories include both saving categories (matches dashboard)", () => { assert.ok(ctx.__c.AI_NONSPEND.includes("savings and investments")); assert.ok(ctx.__c.AI_NONSPEND.includes("sweetie saving")); assert.ok(ctx.__c.AI_NONSPEND.includes("sweetie borrow")); });
    test("aiBankFields_: SMS fields", () => {
      const r = ctx.aiBankFields_("Rs 450.00 spent on Axis Card XX1234 Merchant: SWIGGY on 12-10-2026. Avl limit Rs 90,000");
      assert.equal(r.sms, true); assert.equal(r.amount, 450); assert.equal(r.date, "2026-10-12"); assert.match(r.desc, /SWIGGY/);
    });
    test("aiBankFields_: non-SMS text is not flagged", () => assert.equal(ctx.aiBankFields_("lunch 200 with friends").sms, false));
    SMS.filter(([, want]) => want > 0).forEach(([t, want]) =>
      test(`parity client bankAmount == server aiBankFields_: ${t.slice(0, 40)}`, () => {
        const s = ctx.aiBankFields_(t);
        if (s.sms) assert.equal(s.amount, AI.bankAmount(t)); else assert.equal(AI.isBankSms(t), false);
      }),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  suite("9a. Sweetie Balance, Total Saving timing, summary popup");
  test("Sweetie Balance is the running ledger balance across ALL months (not this month only)", () => {
    const a = loadApp();
    const sw = [{ id: "a", type: "SAVING", amount: 5000, date: "2026-08-01", description: "" }, { id: "b", type: "CREDIT", amount: 1000, date: "2026-09-01", description: "" }, { id: "c", type: "DEBIT", amount: 2500, date: "2026-10-03", description: "" }];
    a.app.set({ expenses: [], salaries: {}, sweetieTxns: sw }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statSweetie"), a.app.money(3500));
    a.setMonth(2026, 7); a.app.render();
    assert.equal(a.text("statSweetie"), a.app.money(3500), "same figure whichever month is selected");
    a.close();
  });
  test("with no Sweetie ledger loaded the old monthly figure is the fallback", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Sweetie Saving", 1000, 1), OCT("Sweetie Borrow", 400, 2)], salaries: {}, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statSweetie"), a.app.money(600)); a.close();
  });
  test("Total Saving shows '…' (not a this-month-only number) until the full history arrives", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Savings and Investments", 6650, 1)], salaries: {}, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statTotalSaving"), "…"); assert.equal(a.text("statMonthSaving"), a.app.money(6650)); a.close();
  });
  test("…or the last known total from the previous visit", () => {
    const a = loadApp({ storage: { grv_total_saving_v1: "160070" } });
    a.app.set({ expenses: [OCT("Savings and Investments", 6650, 1)], salaries: {}, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statTotalSaving"), a.app.money(160070)); a.close();
  });
  const histRows = [["1", "2026-10-03", "Oct-26", "Savings and Investments", "sip", 6650], ["9", "2026-09-02", "Sep-26", "Savings and Investments", "sip", 100000], ["10", "2026-08-02", "Aug-26", "Sweetie Saving", "sw", 53420]];
  atest("9a. Sweetie Balance, Total Saving timing, summary popup", "when history arrives the dashboard refreshes by itself (no other action needed)", async () => {
    const a = loadApp();
    a.w.fetch = (u) => Promise.resolve({ json: () => Promise.resolve(String(u).includes("action=getSalary") ? [["Month", "Amount"], ["Oct-26", 1000]] : histRows) });
    a.app.set({ expenses: [OCT("Savings and Investments", 6650, 1)], salaries: {}, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statTotalSaving"), "…");
    await a.app.syncHistory();
    assert.equal(a.text("statTotalSaving"), a.app.money(160070)); assert.equal(a.text("statMonthSaving"), a.app.money(6650));
    assert.equal(a.w.localStorage.getItem("grv_total_saving_v1"), "160070", "cached for the next visit");
    a.close();
  });
  atest("9a. Sweetie Balance, Total Saving timing, summary popup", "if the history fetch fails the card falls back to the local total (no endless '…')", async () => {
    const a = loadApp();
    a.w.fetch = () => Promise.reject(new Error("offline"));
    a.app.set({ expenses: [OCT("Savings and Investments", 6650, 1)], salaries: {}, sweetieTxns: [] }); a.setMonth(2026, 9); a.app.render();
    await a.app.syncHistory();
    assert.equal(a.text("statTotalSaving"), a.app.money(6650)); a.close();
  });
  test("summary popup: SIP + Sweetie Saving are not 'spent', category list or biggest; reported as Saved", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Shopping", 1000, 1), OCT("Savings and Investments", 5000, 2), OCT("Sweetie Saving", 2000, 3), OCT("Sweetie Borrow", 300, 4), OCT("Received", 400, 5)], salaries: { "Oct-26": 50000 }, sweetieTxns: [] });
    const c = a.app.sp.calc("Oct-26");
    near(c.spent, 1300); near(c.saved, 7000); near(c.received, 400); assert.equal(c.count, 2);
    assert.deepEqual([...c.cats.keys()].sort(), ["Shopping", "Sweetie Borrow"]); assert.equal(c.top.c, "Shopping");
    // Remaining formula used by the popup is unchanged: salary + received - (spent - borrow) - saved
    near(50000 + c.received - (c.spent - c.sw) - c.saved, 50000 + 400 - (1000 + 7000));
    a.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  suite("9b. Monthly expense rules (GRV CC monthly overview)");
  const cc = (id, card, amount, billingMonth, status = "UNPAID", usedBy = "GRV") => ({ id, card, usedBy, txnDate: "2026-10-05", billingMonth, amount, status, description: "fixture" });
  const mkOverview = (rows, cards, salary = 100000) => {
    const a = loadApp();
    a.app.set({ expenses: rows, salaries: { "Oct-26": salary }, sweetieTxns: [], cardTxns: cards, cardConfig: [{ card: "AXIS-FLIPKART", cutoff: 18 }] });
    a.setMonth(2026, 9);
    return { a, v: a.app.overview("2026-10") };
  };
  test("SIP and Sweetie Saving are NOT actual spending; they are shown as savings", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1), OCT("Savings and Investments", 5000, 2), OCT("Sweetie Saving", 2000, 3)], []);
    near(v.personalExpense, 1000); near(v.actualSpending, 1000); near(v.savingAllocations, 7000); a.close();
  });
  test("credit-card purchases count as actual expense (billing month)", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1)], [cc("c1", "AXIS-FLIPKART", 2500, "October 2026"), cc("c2", "AXIS-FLIPKART", 500, "November 2026")]);
    near(v.ccSpend, 2500); near(v.actualSpending, 3500); a.close();
  });
  test("other people's card spend is not counted as GRV's expense", () => {
    const { a, v } = mkOverview([], [cc("c1", "AXIS-FLIPKART", 900, "October 2026", "UNPAID", "Tanya")]);
    near(v.ccSpend, 0); a.close();
  });
  test("Bill Repayment is cash flow only: never added to actual spending (no double count)", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1), OCT("Bill Repayment", 2500, 2)], [cc("c1", "AXIS-FLIPKART", 2500, "October 2026", "PAID")]);
    near(v.actualSpending, 3500, "1000 personal + 2500 card purchase, repayment excluded"); near(v.ccPayment, 2500);
    near(v.cashOut, 3500, "cash really left the account: 1000 + 2500 bill paid"); a.close();
  });
  test("cash remaining = salary + received − (expense + bill paid + saving + borrow)", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1), OCT("Bill Repayment", 2500, 2), OCT("Savings and Investments", 5000, 3), OCT("Sweetie Saving", 2000, 4), OCT("Sweetie Borrow", 300, 5), OCT("Received", 400, 6)], []);
    near(v.cashRemaining, 100000 + 400 - (1000 + 2500 + 7000 + 300)); a.close();
  });
  test("pending (unpaid) card bills are shown separately from cash remaining", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1)], [cc("c1", "AXIS-FLIPKART", 2500, "October 2026", "UNPAID"), cc("c2", "AXIS-FLIPKART", 700, "October 2026", "PAID")]);
    near(v.ccUnpaid, 2500); near(v.cashRemaining, 99000); near(v.remainingAfterPendingCC, 96500); a.close();
  });
  test("saving rate = savings / cash-in", () => { const { a, v } = mkOverview([OCT("Savings and Investments", 10000, 1)], [], 100000); near(v.savingRate, 10); a.close(); });
  test("overview saving for the month equals the This Month Saving card", () => {
    const { a, v } = mkOverview([OCT("Shopping", 1000, 1), OCT("Savings and Investments", 5000, 2), OCT("Sweetie Saving", 2000.5, 3)], []);
    a.app.render(); assert.equal(a.app.money(v.savingAllocations), a.text("statMonthSaving")); a.close();
  });
  test("overall saving = sum of every month's overview saving (once history is loaded)", () => {
    const rows = [row(1, "Aug-26", "Sweetie Saving", 111), row(2, "Sep-26", "Savings and Investments", 4000), OCT("Savings and Investments", 5000, 3), OCT("Sweetie Saving", 2000.5, 4)];
    const a = loadApp();
    a.app.set({ expenses: rows, salaries: {}, sweetieTxns: [], cardTxns: [], grvHistoryAttempted: true }); a.setMonth(2026, 9); a.app.render();
    const sum = ["2026-08", "2026-09", "2026-10"].reduce((t, k) => t + a.app.overview(k).savingAllocations, 0);
    assert.equal(a.app.money(sum), a.text("statTotalSaving")); a.close();
  });

  suite("9c. Existing data and history are preserved");
  test("render() never mutates expenses, salaries or Sweetie data", () => {
    const a = loadApp();
    const rows = [OCT("Shopping", 10.5, 1), OCT("Sweetie Saving", 20, 2), OCT("Savings and Investments", 30, 3), OCT("Sweetie Borrow", 40, 4), OCT("Received", 50, 5)];
    const sw = [{ id: "s1", type: "DEBIT", amount: 5, date: "2026-10-09", description: "x" }];
    a.app.set({ expenses: rows, salaries: { "Oct-26": 999 }, sweetieTxns: sw });
    const before = JSON.stringify([rows, sw, { "Oct-26": 999 }]);
    for (let i = 0; i < 3; i++) { a.setMonth(2026, 9); a.app.render(); a.setMonth(2026, 8); a.app.render(); }
    assert.equal(JSON.stringify([rows, sw, { "Oct-26": 999 }]), before); a.close();
  });
  test("old saved data (exp_v3 / sal_v3 / sweetie_v1) still loads and renders", () => {
    const rows = [OCT("Shopping", 100, 1), OCT("Savings and Investments", 50, 2)];
    const a = loadApp({ storage: { exp_v3: JSON.stringify(rows), sal_v3: JSON.stringify({ "Oct-26": 1000 }), sweetie_v1: "[]" } });
    a.app.loadLocal(); a.setMonth(2026, 9); a.app.render();
    assert.equal(a.text("statTotalExpenses"), a.app.money(100)); assert.equal(a.text("statRemaining"), a.app.money(850)); a.close();
  });
  test("saving rows are still listed in the transactions table (history not hidden)", () => {
    const a = loadApp();
    a.app.set({ expenses: [OCT("Savings and Investments", 50, 1), OCT("Sweetie Saving", 60, 2), OCT("Shopping", 70, 3)], salaries: {}, sweetieTxns: [] });
    a.setMonth(2026, 9); a.app.render();
    const table = a.doc.getElementById("expenseTable").textContent;
    ["Savings and Investments", "Sweetie Saving", "Shopping"].forEach((c) => assert.ok(table.includes(c), c)); a.close();
  });
  test("no element id or top-level function was removed from index.html / script.js", () => {
    const git = (f) => spawnSync("git", ["show", "HEAD:" + f], { cwd: ROOT, encoding: "utf8", maxBuffer: 1e8 }).stdout;
    const baseHtml = git("index.html"), baseJs = git("script.js");
    if (!baseHtml || !baseJs) return; // not a git checkout: nothing to compare against
    const ids = (h) => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const now = ids(read("index.html")), gone = [...ids(baseHtml)].filter((i) => !now.has(i));
    assert.deepEqual(gone, [], "ids removed from index.html");
    const fn = (h) => new Set([...h.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]));
    const nowFn = fn(read("script.js")), goneFn = [...fn(baseJs)].filter((i) => !nowFn.has(i));
    assert.deepEqual(goneFn, [], "functions removed from script.js");
  });

  // ─────────────────────────────────────────────────────────────────────────
  Promise.all([smsPending, smsLimit, ...pendingExtra]).catch((e) => test("smsParse promise", () => { throw e; })).finally(() => { ai.close(); finish(); });
}

// ───────────────────────────────────────────────────────────────────────────
suite("10. Repo's own regression scripts");
["issuer_detection_regression_test.js", "shorthand-regression-test.js"].forEach((f) => {
  test(`${f}`, () => {
    const p = spawnSync(process.execPath, [path.join(ROOT, f)], { encoding: "utf8", timeout: 60000 });
    assert.equal(p.status, 0, "exit code " + p.status + " " + (p.stderr || "").slice(0, 200));
    const lines = (p.stdout || "").split("\n").filter((l) => l.startsWith("{"));
    const failed = lines.filter((l) => /"pass":false/.test(l));
    assert.equal(failed.length, 0, `${failed.length} of ${lines.length} cases report pass:false (script still exits 0): ${failed[0] || ""}`);
  }, f.startsWith("shorthand") ? { knownBug: "Pre-existing (same as the remark-on-separate-line bug above); that script exits 0 even when a case says pass:false." } : {});
});

suite("11. Duplicate-entry fix (server + client write order)");
test("server-dup-test.js passes", () => {
  const p = spawnSync(process.execPath, [path.join(__dirname, "server-dup-test.js")], { encoding: "utf8" });
  assert.equal(p.status, 0, (p.stdout || "").slice(-400));
});

// ───────────────────────────────────────────────────────────────────────────
function finish() {
  const by = {};
  R.results.forEach((r) => ((by[r.suite] = by[r.suite] || []).push(r)));
  const icon = { pass: "PASS ", fail: "FAIL ", skip: "SKIP ", known: "KNOWN", fixed: "FIXED" };
  Object.entries(by).forEach(([s, rs]) => {
    console.log(`\n${s}`);
    rs.forEach((r) => console.log(`  ${icon[r.status]} ${r.name}${r.status === "fail" || r.status === "skip" ? "\n        → " + r.err : ""}`));
  });
  const c = (s) => R.results.filter((r) => r.status === s).length;
  const known = R.results.filter((r) => r.status === "known");
  console.log(`\n==== ${c("pass")} passed, ${c("fail")} failed, ${c("known")} known issue(s), ${c("fixed")} fixed-but-still-flagged, ${c("skip")} skipped (total ${R.results.length}) ====`);
  known.forEach((k) => console.log(`KNOWN ISSUE: ${k.name}\n   ${k.note}`));
  R.results.filter((r) => r.status === "fixed").forEach((k) => console.log(`NOW PASSING (remove knownBug flag): ${k.name}`));
  process.exitCode = c("fail") ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
}
if (!hasJsdom) finish();
