const re = /\b(axis|hdfc|icici|sbi|kotak|idfc|pnb|hsbc|indusind|rbl|bob|bank\s+of\s+baroda)\b/i;
const cases = [
  ["Axis Bank card at Flipkart", "axis"],
  ["HDFC transaction at Swiggy", "hdfc"],
  ["ICICI debit card", "icici"],
  ["SBI card payment", "sbi"],
  ["Kotak card", "kotak"],
  ["IDFC First Bank transaction", "idfc"],
  ["PNB card payment", "pnb"],
  ["HSBC card transaction", "hsbc"],
  ["IndusInd card payment", "indusind"],
  ["RBL card payment", "rbl"],
  ["BOB card payment", "bob"],
  ["Bank of Baroda card", "bob"],
  ["merchant is Flipkart only", ""]
];
for (const [input, expected] of cases) {
  const match = input.match(re);
  const raw = match ? match[1].toLowerCase() : "";
  const actual = raw === "bank of baroda" ? "bob" : raw;
  if (actual !== expected) throw new Error(`${input}: expected ${expected}, got ${actual}`);
}
console.log(`PASS: ${cases.length} issuer-detection regression cases`);
