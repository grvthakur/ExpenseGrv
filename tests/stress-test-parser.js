"use strict";
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

// Load DOM environment
const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/" });
const w = dom.window;

// Polyfills
w.fetch = () => Promise.reject(new Error("network disabled"));
w.Chart = function () {};
w.alert = () => {};
w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });

// Expose internals of ai-entry.js
const src = fs.readFileSync(path.join(__dirname, "../frontend/ai-entry.js"), "utf8");
const end = src.lastIndexOf("})();");
const AI_EXPOSE = [
  "localParse", "labelHint", "tailLab", "splitHint", "userLine", "shorthandHint",
  "bankAmount", "smsParse", "isBankSms", "isNonDebitSms", "isQuestion", "normDesc",
  "runPlan", "extraRows", "cap", "peopleSet", "hintToRemarks", "appendDescriptionHint",
  "cleanM", "last4Of", "last4Card"
];
const expose = AI_EXPOSE.map((n) => `${JSON.stringify(n)}: (typeof ${n} === "function" ? ${n} : undefined)`).join(",");
const hookedAi = src.slice(0, end) + "\nwindow.__ai = { " + expose + " };\n" + src.slice(end);

w.eval(fs.readFileSync(path.join(__dirname, "../frontend/script.js"), "utf8"));
w.eval(hookedAi);

const AI = w.__ai;

// Mock card config & master cache
w.cardConfig = [
  { card: "AXIS-FLIPKART" },
  { card: "HDFC-TATA NEU" },
  { card: "HDFC-REGALIA" },
  { card: "ICICI-AMAZON PAY" },
  { card: "SBI-CASHBACK" },
  { card: "KOTAK-LEAGUE" },
  { card: "IDFC-FIRST WEALTH" },
  { card: "INDUSIND-LEGEND" },
  { card: "PNB-RUPAY" },
  { card: "BOB-PREMIER" }
];

w.ccMasterCache = [
  ["HDFC", "TATA NEU", "1234567890123456", "1234", "12/28"],
  ["ICICI", "AMAZON PAY", "4321876543217008", "7008", "08/29"],
  ["AXIS", "FLIPKART", "9876543210984321", "4321", "10/27"],
  ["SBI", "CASHBACK", "5555666677779999", "9999", "05/30"],
  ["KOTAK", "LEAGUE", "4444333322221111", "1111", "03/28"]
];

const results = { total: 0, pass: 0, fail: 0, failures: [] };

function check(title, actual, expected) {
  results.total++;
  const errors = [];
  for (const [k, v] of Object.entries(expected)) {
    if (actual == null) {
      errors.push(`Expected object, got null/undefined (for field ${k}=${v})`);
      break;
    }
    if (actual[k] !== v) {
      errors.push(`[${k}] expected: "${v}", got: "${actual[k]}"`);
    }
  }
  if (errors.length === 0) {
    results.pass++;
    console.log(`  ✅ PASS: ${title}`);
  } else {
    results.fail++;
    console.log(`  ❌ FAIL: ${title}`);
    errors.forEach((e) => console.log(`      -> ${e}`));
    results.failures.push({ title, errors, actual });
  }
}

async function runAllScenarios() {
  console.log("\n=======================================================");
  console.log("       AI-ENTRY PARSER STRESS TEST — 35+ SCENARIOS      ");
  console.log("=======================================================\n");

  // --- Group 1: Bank SMS Templates (HDFC, ICICI, SBI, Axis, Kotak, etc.) ---
  console.log("--- 1. Real Indian Bank SMS Templates ---");

  // HDFC Standard SMS
  const hdfc1 = await AI.smsParse("Alert: INR 1,450.00 spent on HDFC Bank Card ending 3456 at ZOMATO on 05-Nov-26. Avl limit: INR 75,000.00.");
  check("HDFC SMS with Avl limit and date", hdfc1, {
    amount: 1450,
    desc: "ZOMATO",
    date: "2026-11-05",
    card: "HDFC-TATA NEU", // resolved via last4 3456
    kind: "card"
  });

  // ICICI on MERCHANT style SMS
  const icici1 = await AI.smsParse("INR 199.00 spent using ICICI Bank Card XX7008 on 04-Nov-26 on AMAZON PAY IN G. Avl limit: INR 1,50,000.");
  check("ICICI 'on MERCHANT' pattern (XX7008)", icici1, {
    amount: 199,
    desc: "AMAZON PAY", // cleaned of trailing 'IN G'
    date: "2026-11-04",
    card: "ICICI-AMAZON PAY",
    kind: "card"
  });

  // SBI Card Standard SMS
  const sbi1 = await AI.smsParse("Rs.2,499.00 spent on SBI Card ending 9999 at RELIANCE DIGITAL on 02/11/26. Avl Lmt: Rs.45,000.00.");
  check("SBI Card with Rs. amount and DD/MM/YY date", sbi1, {
    amount: 2499,
    desc: "RELIANCE DIGITAL",
    date: "2026-11-02",
    card: "SBI-CASHBACK",
    kind: "card"
  });

  // Axis Bank SMS
  const axis1 = await AI.smsParse("Transaction alert: Rs 560 spent on Axis Bank Card XX4321 at SWIGGY BANGALORE IN on 01-Nov-2026. Avl limit Rs 60,000.");
  check("Axis Bank SMS with SWIGGY BANGALORE IN", axis1, {
    amount: 560,
    desc: "SWIGGY BANGALORE", // cleanM removes trailing IN
    date: "2026-11-01",
    card: "AXIS-FLIPKART",
    kind: "card"
  });

  // Kotak Bank SMS
  const kotak1 = await AI.smsParse("Sent from Kotak: Rs 1200 debited from card ending 1111 towards BLINKIT on 28-Oct-26. Total balance: Rs 20000.");
  check("Kotak SMS with 'towards BLINKIT'", kotak1, {
    amount: 1200,
    desc: "BLINKIT",
    date: "2026-10-28",
    card: "KOTAK-LEAGUE",
    kind: "card"
  });

  // IndusInd Bank SMS
  const indus1 = await AI.smsParse("INR 890.50 charged on IndusInd Bank Card XX8888 @ BOOKMYSHOW on 25-Oct-26. Call 1800 to dispute.");
  check("IndusInd SMS with '@ BOOKMYSHOW'", indus1, {
    amount: 890.5,
    desc: "BOOKMYSHOW",
    date: "2026-10-25",
    card: "INDUSIND-LEGEND", // single candidate for IndusInd
    kind: "card"
  });

  // IDFC First Bank SMS
  const idfc1 = await AI.smsParse("Your IDFC FIRST Bank Card was used for INR 3,200.00 at UBER INDIA TECHNOLOGIES PVT LTD on 20-Oct-2026.");
  check("IDFC SMS with corporate suffix cleanup", idfc1, {
    amount: 3200,
    desc: "UBER", // cleanM strips INDIA TECHNOLOGIES PVT LTD
    date: "2026-10-20",
    card: "IDFC-FIRST WEALTH",
    kind: "card"
  });

  // Bank of Baroda (BOB) SMS
  const bob1 = await AI.smsParse("Alert: Rs 750.00 debited on Bank of Baroda Credit Card at DMART on 15-Oct-26. Available limit Rs 80,000.");
  check("Bank of Baroda SMS", bob1, {
    amount: 750,
    desc: "DMART",
    date: "2026-10-15",
    card: "BOB-PREMIER",
    kind: "card"
  });

  // SMS with 'Merchant:' label
  const merchLbl = await AI.smsParse("Txn of INR 4,500.00 on Card **4321 on 10-Oct-26. Merchant: FLIPKART INDIA. Avl Lmt Rs 50000.");
  check("SMS with 'Merchant:' label", merchLbl, {
    amount: 4500,
    desc: "FLIPKART",
    date: "2026-10-10",
    card: "AXIS-FLIPKART",
    kind: "card"
  });

  // Flipkart truncated issuer descriptor: PYU*Flipkar
  const fkrtTrunc = await AI.smsParse("INR 1,299 spent on HDFC Card 3456 at PYU*Flipkar on 09-Oct-26.");
  check("Flipkart truncated descriptor 'PYU*Flipkar'", fkrtTrunc, {
    amount: 1299,
    desc: "FLIPKART",
    card: "HDFC-TATA NEU",
    kind: "card"
  });

  // --- Group 2: Bank Email Alerts (Longer text / multiple lines) ---
  console.log("\n--- 2. Bank Transaction Email Alerts ---");

  const email1 = await AI.smsParse(`
Dear Customer,

Your Credit Card ending with 7008 has been used for a transaction of INR 3,499.00 on 08-Nov-2026 at 14:30:15.
Merchant Name: AMAZON
Available Credit Limit: INR 1,46,501.00
Total Credit Limit: INR 1,50,000.00

If you did not make this transaction, call 1800 immediately.
Warm Regards,
ICICI Bank
  `.trim());
  check("ICICI Email Alert format", email1, {
    amount: 3499,
    desc: "AMAZON",
    date: "2026-11-08",
    card: "ICICI-AMAZON PAY",
    kind: "card"
  });

  const email2 = await AI.smsParse(`
HDFC Bank Transaction Alert
We wish to inform you that a transaction of Rs. 840.00 has been made on your HDFC Bank Credit Card ending 3456 on 07-Nov-2026.
Merchant: SWIGGY
Total Available Limit: Rs. 92,000.00
Thank you for banking with us.
  `.trim());
  check("HDFC Email Alert format", email2, {
    amount: 840,
    desc: "SWIGGY",
    date: "2026-11-07",
    card: "HDFC-TATA NEU",
    kind: "card"
  });

  // --- Group 3: Amount & Limit Traps ---
  console.log("\n--- 3. Amount & Limit Traps ---");

  // Avl limit precedes transaction amount
  const trap1 = AI.bankAmount("Avl limit INR 90,000.00. INR 450.00 debited from card XX1234");
  check("Limit BEFORE amount", { amount: trap1 }, { amount: 450 });

  // Reward points preceding transaction amount
  const trap2 = AI.bankAmount("You had 50 reward points. Rs 350 spent on your card XX1234 at CAFE");
  check("Reward points before transaction amount", { amount: trap2 }, { amount: 350 });

  // Outstanding / Total Due trap
  const trap3 = AI.bankAmount("Total due Rs 12,500. Rs 200 charged on card 1234 at METRO");
  check("Total due before transaction amount", { amount: trap3 }, { amount: 200 });

  // Large comma-separated amount
  const trap4 = AI.bankAmount("INR 1,25,000.50 spent on card 1234 at TANISHQ");
  check("Indian comma format (1,25,000.50)", { amount: trap4 }, { amount: 125000.5 });

  // --- Group 4: SMS with User Notes & Shorthand Overrides ---
  console.log("\n--- 4. SMS + User Notes / Shorthands ---");

  // Unlabelled trailing lines: Person and Item
  const tail1 = AI.tailLab("INR 199.00 spent using ICICI Bank Card XX7008 on 04-Nov-26 on AMAZON PAY IN G.\nGrv\nToothpaste");
  check("tailLab: Grv + Toothpaste", tail1, {
    who: "GRV",
    desc: "TOOTHPASTE"
  });

  // Unlabelled trailing lines: Person, Item, Remark
  const tail2 = AI.tailLab("INR 500.00 spent on Axis Bank Card XX4321 at SWIGGY on 04-Nov-26.\nTanya\nDinner\nAlready paid in cash");
  check("tailLab: Tanya + Dinner + Already paid in cash", tail2, {
    who: "Tanya",
    desc: "DINNER",
    rem: "ALREADY PAID IN CASH"
  });

  // Explicit labelHint
  const lbl1 = AI.labelHint("Rs 450 spent on card 1234\nUsed by: grv\nDesc: Zomato Biryani\nRemarks: split with bhai");
  check("labelHint: explicit labels", lbl1, {
    who: "GRV",
    desc: "ZOMATO BIRYANI",
    rem: "SPLIT WITH BHAI"
  });

  // UserLine: Person + Item shorthand (parsing.md §9 contract)
  const ul1 = AI.userLine("Rs 450 spent at AMAZON\nGrv Dahi Dhaniya");
  check("userLine: Grv Dahi Dhaniya -> item='DAHI DHANIYA'", ul1, {
    who: "GRV",
    item: "DAHI DHANIYA"
  });

  // UserLine: Person + Item + Payment status keyword
  const ul2 = AI.userLine("Rs 450 spent at AMAZON\nGrv Dahi Dhaniya already paid in SBI");
  check("userLine: Item vs Remarks separation", ul2, {
    who: "GRV",
    item: "DAHI DHANIYA",
    remarks: "ALREADY PAID IN SBI"
  });

  // UserLine with date: hdfc tata neu mummy 9oct2026
  const ul3 = AI.userLine("Rs 1200 spent at DMART\nhdfc tata neu mummy 9oct2026");
  check("userLine: Card + Person + Date in user hint", ul3, {
    card: "HDFC-TATA NEU",
    who: "Mummy",
    date: "2026-10-09"
  });

  // ShorthandHint: Person, Card, Source - Item
  const sh1 = AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy", { desc: "SWIGGY" });
  check("shorthandHint: 'Grv, flpkrt axs, meethae from swiggy'", sh1, {
    usedBy: "GRV",
    card: "AXIS-FLIPKART",
    desc: "SWIGGY - MEETHAE"
  });

  // ShorthandHint with separate line remark
  const sh2 = AI.shorthandHint("Grv, flpkrt axs, meethae from swiggy\nalready paid in kotak", { desc: "SWIGGY" });
  check("shorthandHint with separate line remark", sh2, {
    usedBy: "GRV",
    card: "AXIS-FLIPKART",
    desc: "SWIGGY - MEETHAE",
    remarks: "ALREADY PAID IN KOTAK"
  });

  // --- Group 5: Instant Local Parser (Casual short typing) ---
  console.log("\n--- 5. Local Offline Short Parser (No Bank SMS) ---");

  // Local card entry: grv flipkart swiggy 450
  const loc1 = AI.localParse("grv flipkart swiggy 450");
  check("localParse: card + person + merchant + amount", loc1, {
    amount: 450,
    card: "AXIS-FLIPKART",
    usedBy: "GRV",
    desc: "SWIGGY",
    kind: "card"
  });

  // Local card entry with 'yesterday'
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
  const loc2 = AI.localParse("yesterday grv tata neu 300 zomato");
  check("localParse: 'yesterday' date resolution", loc2, {
    amount: 300,
    card: "HDFC-TATA NEU",
    usedBy: "GRV",
    desc: "ZOMATO",
    date: yestStr
  });

  // Local Sweetie Saving
  const locSw1 = AI.localParse("sweetie saving 2500");
  check("localParse: sweetie saving", locSw1, {
    kind: "sweetie",
    type: "SAVING",
    amount: 2500
  });

  // Local Sweetie Borrow
  const locSw2 = AI.localParse("sweetie borrow 400 petrol");
  check("localParse: sweetie borrow with description", locSw2, {
    kind: "sweetie",
    type: "DEBIT",
    amount: 400,
    desc: "PETROL"
  });

  // Local Sweetie Credit
  const locSw3 = AI.localParse("sweetie credit 1000");
  check("localParse: sweetie credit", locSw3, {
    kind: "sweetie",
    type: "CREDIT",
    amount: 1000
  });

  // --- Group 6: Negative Tests (Must NOT parse as debit) ---
  console.log("\n--- 6. Negative Tests (Rejections & Non-Debit Safety) ---");

  // OTP SMS with transaction details is now parsed as a card transaction
  const otpSms = await AI.smsParse("Your OTP is 987654 for transaction of Rs 1,500.00 at AMAZON on card ending 7008. Valid for 10 mins. Do not share.");
  check("OTP message with transaction details is parsed as card transaction", otpSms, {
    amount: 1500,
    desc: "AMAZON",
    card: "ICICI-AMAZON PAY",
    kind: "card"
  });

  // Plain non-transaction OTP (no amount/card) must return null
  const plainOtp = await AI.smsParse("Your OTP is 123456. Do not share.");
  check("Plain OTP message without amount returns null", { res: plainOtp }, { res: null });

  // isNonDebitSms checks
  const nonDebit1 = AI.isNonDebitSms("Rs. 10,000.00 credited to your account 1234 on 05-Nov-26.");
  check("Credit SMS detected as non-debit", { flag: nonDebit1 }, { flag: true });

  const nonDebit2 = AI.isNonDebitSms("Refund of Rs 450.00 reversed to your card ending 4321 at SWIGGY.");
  check("Refund SMS detected as non-debit", { flag: nonDebit2 }, { flag: true });

  const nonDebit3 = AI.isNonDebitSms("INR 250.00 debited via UPI from a/c 1234 to user@okhdfcbank.");
  check("UPI bank account debit detected as non-debit", { flag: nonDebit3 }, { flag: true });

  // Normal card debit must NOT be rejected
  const nonDebit4 = AI.isNonDebitSms("INR 450.00 spent on card XX1234 at SWIGGY.");
  check("Normal card debit is NOT flagged as non-debit", { flag: nonDebit4 }, { flag: false });

  // Question detection
  const q1 = AI.isQuestion("kitna kharcha hua is mahine?");
  check("isQuestion: Hinglish spending question", { flag: q1 }, { flag: true });

  const q2 = AI.isQuestion("how much spent on flipkart card?");
  check("isQuestion: English spending question", { flag: q2 }, { flag: true });

  const q3 = AI.isQuestion("INR 450.00 spent on card XX1234 at SWIGGY.");
  check("isQuestion: Bank SMS is NOT a question", { flag: q3 }, { flag: false });

  // Summary
  console.log("\n=======================================================");
  console.log(`STRESS TEST SUMMARY: ${results.pass} PASSED, ${results.fail} FAILED (TOTAL: ${results.total})`);
  console.log("=======================================================\n");

  if (results.failures.length) {
    console.log("Failures detail:");
    results.failures.forEach((f) => console.log(JSON.stringify(f, null, 2)));
    process.exit(1);
  }
}

runAllScenarios().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
