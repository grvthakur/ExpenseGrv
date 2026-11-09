"use strict";
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/" });
const w = dom.window;

w.fetch = () => Promise.reject(new Error("network disabled"));
w.Chart = function () {};
w.alert = () => {};
w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });

const src = fs.readFileSync(path.join(__dirname, "../frontend/ai-entry.js"), "utf8");
const end = src.lastIndexOf("})();");
const AI_EXPOSE = [
  "localParse", "labelHint", "tailLab", "splitHint", "userLine", "shorthandHint",
  "bankAmount", "smsParse", "isBankSms", "isNonDebitSms", "isQuestion", "normDesc",
  "runPlan", "extraRows", "cap", "peopleSet", "hintToRemarks", "appendDescriptionHint",
  "cleanM", "last4Of", "last4Card", "tryTab"
];
const expose = AI_EXPOSE.map((n) => `${JSON.stringify(n)}: (typeof ${n} === "function" ? ${n} : undefined)`).join(",");
const hookedAi = src.slice(0, end) + "\nwindow.__ai = { " + expose + " };\n" + src.slice(end);

w.eval(fs.readFileSync(path.join(__dirname, "../frontend/script.js"), "utf8"));
w.eval(hookedAi);

const AI = w.__ai;
const results = { pass: 0, fail: 0, errors: [] };

function test(name, fn) {
  try {
    fn();
    results.pass++;
    console.log("  PASS:", name);
  } catch (err) {
    results.fail++;
    console.log("  FAIL:", name, "->", err.message);
    results.errors.push({ name, err: err.message });
  }
}

async function atest(name, fn) {
  try {
    await fn();
    results.pass++;
    console.log("  PASS:", name);
  } catch (err) {
    results.fail++;
    console.log("  FAIL:", name, "->", err.message);
    results.errors.push({ name, err: err.message });
  }
}

async function run() {
  console.log("\n=== 1. UI Elements & DOM Mounting ===");
  test("aiEntryBtn exists and has click handler", () => {
    const btn = w.document.getElementById("aiEntryBtn");
    assert.ok(btn, "aiEntryBtn should exist");
    assert.equal(typeof btn.onclick, "function");
  });

  test("aiTxt, aiGo, aiAsk, aiX elements created", () => {
    assert.ok(w.document.getElementById("aiTxt"));
    assert.ok(w.document.getElementById("aiGo"));
    assert.ok(w.document.getElementById("aiAsk"));
    assert.ok(w.document.getElementById("aiX"));
  });

  test("qaAnswerOverlay created", () => {
    assert.ok(w.document.getElementById("qaAnswerOverlay"));
  });

  console.log("\n=== 2. isBankSms & isNonDebitSms ===");
  test("isBankSms recognizes standard debit SMS", () => {
    assert.equal(AI.isBankSms("Rs 450 spent on card 1234 at SWIGGY"), true);
    assert.equal(AI.isBankSms("INR 1,200.50 debited from a/c **4321 for AMAZON"), true);
    assert.equal(AI.isBankSms("₹250 paid using HDFC card ending 5678"), true);
  });

  test("isBankSms rejects non-bank text and questions", () => {
    assert.equal(AI.isBankSms("hello 450"), false);
    assert.equal(AI.isBankSms("how much spent on swiggy?"), false);
  });

  test("isNonDebitSms identifies non-debit SMS", () => {
    assert.equal(AI.isNonDebitSms("INR 500 credited to your a/c 1234 on 05-Nov-26"), true);
    assert.equal(AI.isNonDebitSms("Rs 300 refund reversed to card 1234"), true);
    assert.equal(AI.isNonDebitSms("Your OTP is 456789 for txn of Rs 100 on card 1234. Do not share."), true);
    assert.equal(AI.isNonDebitSms("Rs 200 debited via UPI user@okaxis"), true);
    // Standard debit must NOT be non-debit
    assert.equal(AI.isNonDebitSms("Rs 450 spent on card 1234 at SWIGGY"), false);
  });

  console.log("\n=== 3. bankAmount extraction ===");
  test("bankAmount extracts transaction amount skipping AVL limit and balance", () => {
    assert.equal(AI.bankAmount("Rs 1,234.50 spent on card XX1234 at AMAZON. Avl limit Rs 50,000"), 1234.5);
    assert.equal(AI.bankAmount("Avl limit INR 90000. INR 450 debited"), 450);
    assert.equal(AI.bankAmount("balance Rs 5000. spent Rs 300 at X"), 300);
    assert.equal(AI.bankAmount("Rs 10 reward points. Rs 250 charged on your card"), 250);
  });

  console.log("\n=== 4. smsParse (deterministic bank SMS parsing) ===");
  w.cardConfig = [
    { card: "AXIS-FLIPKART" },
    { card: "HDFC-TATA NEU" },
    { card: "ICICI-AMAZON PAY" }
  ];

  await atest("smsParse: Axis Flipkart SMS", async () => {
    const res = await AI.smsParse("Rs 450.00 spent on Axis Bank Card XX1234 at SWIGGY on 12-10-2026. Avl limit Rs 90,000");
    assert.ok(res);
    assert.equal(res.amount, 450);
    assert.equal(res.date, "2026-10-12");
    assert.equal(res.desc, "SWIGGY");
    assert.equal(res.kind, "card");
  });

  await atest("smsParse: ICICI with 'on MERCHANT' pattern", async () => {
    const res = await AI.smsParse("INR 199.00 spent using ICICI Bank Card XX7008 on 04-Nov-26 on AMAZON PAY IN G.");
    assert.ok(res);
    assert.equal(res.amount, 199);
    assert.equal(res.date, "2026-11-04");
    assert.equal(res.desc, "AMAZON PAY G");
    assert.equal(res.kind, "card");
  });

  await atest("smsParse: OTP is not parsed", async () => {
    const res = await AI.smsParse("Your OTP is 123456. Do not share.");
    assert.equal(res, null);
  });

  console.log("\n=== 5. localParse (offline instant parsing) ===");
  test("localParse: card + person + merchant + amount", () => {
    const res = AI.localParse("grv flipkart swiggy 450");
    assert.ok(res);
    assert.equal(res.amount, 450);
    assert.equal(res.card, "AXIS-FLIPKART");
    assert.equal(res.usedBy, "GRV");
    assert.equal(res.desc, "SWIGGY");
  });

  test("localParse: sweetie types", () => {
    const s1 = AI.localParse("sweetie saving 1500");
    assert.ok(s1);
    assert.equal(s1.kind, "sweetie");
    assert.equal(s1.type, "SAVING");
    assert.equal(s1.amount, 1500);

    const s2 = AI.localParse("sweetie borrow 500 chai");
    assert.ok(s2);
    assert.equal(s2.kind, "sweetie");
    assert.equal(s2.type, "DEBIT");
    assert.equal(s2.amount, 500);
    assert.equal(s2.desc, "CHAI");

    const s3 = AI.localParse("sweetie credit 200");
    assert.ok(s3);
    assert.equal(s3.kind, "sweetie");
    assert.equal(s3.type, "CREDIT");
    assert.equal(s3.amount, 200);
  });

  test("localParse: ambiguous inputs return null", () => {
    assert.equal(AI.localParse("450 swiggy"), null, "no card");
    assert.equal(AI.localParse("sweetie 200"), null, "sweetie without type");
    assert.equal(AI.localParse("x".repeat(81) + " 5"), null, "length > 80");
  });

  console.log("\n=== 6. Hints: labelHint, userLine, shorthandHint, tailLab ===");
  test("labelHint: explicit labels", () => {
    const res = AI.labelHint("Rs 450 spent on card 1234\nUsed by: grv\nDesc: swiggy dinner\nRemarks: already paid");
    assert.ok(res);
    assert.equal(res.who, "Grv");
    assert.equal(res.desc, "SWIGGY DINNER");
    assert.equal(res.rem, "ALREADY PAID");
  });

  test("tailLab: unlabelled trailing lines under bank SMS", () => {
    const sms = "INR 199.00 spent using ICICI Bank Card XX7008 on 04-Nov-26 on AMAZON PAY IN G.\nGrv\nToothpaste";
    const res = AI.tailLab(sms);
    assert.ok(res);
    assert.equal(res.who, "GRV");
    assert.equal(res.desc, "TOOTHPASTE");
  });

  test("userLine: 'Grv Grocery: dudh dahi egg'", () => {
    const res = AI.userLine("Rs 450 spent at X\nGrv Grocery: dudh dahi egg");
    assert.ok(res);
    assert.equal(res.who, "Grv");
    assert.equal(res.rem, "GROCERY - DUDH DAHI EGG");
  });

  test("userLine: person + product shorthand (parsing.md contract)", () => {
    const res = AI.userLine("Rs 450 spent at AMAZON\nGrv Dahi Dhaniya");
    assert.ok(res);
    assert.equal(res.who, "Grv");
    assert.equal(res.item, "DAHI DHANIYA");
  });

  test("shorthandHint: 'Grv, flpkrt axs, meethae from swiggy'", () => {
    const res = AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy", { desc: "" });
    assert.ok(res);
    assert.equal(res.usedBy, "GRV");
    assert.equal(res.card, "AXIS-FLIPKART");
    assert.equal(res.desc, "SWIGGY - MEETHAE");
  });

  test("shorthandHint with separate line remark: 'already paid in kotak'", () => {
    const res = AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy\nalready paid in kotak", { desc: "" });
    assert.ok(res);
    assert.equal(res.remarks, "ALREADY PAID IN KOTAK");
  });

  console.log("\n=== 7. Merchant normalisation & Description-hint merge ===");
  test("normDesc normalizes known brands", () => {
    assert.equal(AI.normDesc("swiggy"), "SWIGGY");
    assert.equal(AI.normDesc("amzn"), "AMAZON");
    assert.equal(AI.normDesc("fkrt"), "FLIPKART");
    assert.equal(AI.normDesc("blinkit"), "BLINKIT");
    assert.equal(AI.normDesc("SWIGGY - MEETHAE"), "SWIGGY - MEETHAE");
  });

  test("appendDescriptionHint merges source and item", () => {
    const o = { desc: "AMAZON" };
    AI.appendDescriptionHint(o, "Toothpaste");
    assert.equal(o.desc, "AMAZON - TOOTHPASTE");
  });

  console.log("\n=== 8. AI Query & Data Assistant (runPlan) ===");
  test("runPlan aggregates sum, count, filter by person/card", () => {
    const rows = [
      { src: "cards", date: "2026-10-01", card: "AXIS-FLIPKART", person: "GRV", desc: "SWIGGY", amount: 450, category: "", remarks: "", status: "UNPAID", type: "" },
      { src: "cards", date: "2026-10-02", card: "AXIS-FLIPKART", person: "Tanya", desc: "ZOMATO", amount: 350, category: "", remarks: "", status: "PAID", type: "" },
      { src: "expenses", date: "2026-10-03", card: "", person: "", desc: "GROCERY", amount: 200, category: "Food", remarks: "", status: "", type: "" }
    ];
    const plan = { sources: ["cards"], person: "grv", agg: "sum" };
    const res = AI.runPlan(plan, rows);
    assert.equal(res.n, 1);
    assert.equal(res.total, 450);

    const planAll = { sources: ["cards", "expenses"], agg: "sum" };
    const resAll = AI.runPlan(planAll, rows);
    assert.equal(resAll.n, 3);
    assert.equal(resAll.total, 1000);
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${results.pass} PASSED, ${results.fail} FAILED`);
  if (results.errors.length) {
    console.log("Failed tests:", results.errors);
  }
}

run();
