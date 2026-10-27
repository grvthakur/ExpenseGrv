"use strict";
// Synthetic-only: runs code.js in a vm with mocked SpreadsheetApp/LockService. No network, no real sheet.
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");
function env() {
  const log = [];
  const mk = (head) => { const rows = [head]; return { rows,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    appendRow: (r) => rows.push(r), deleteRow: (n) => rows.splice(n - 1, 1) }; };
  const sheets = { Sweetie: mk(["ID","TYPE","AMOUNT","R","DATE","D"]), Cards: mk(["ID","c","u","d","t","r","a","s","b"]), Expenses: mk(["ID"]), Salary: mk(["ID"]) };
  const ctx = { log, sheets, Logger: { log: (m) => log.push("L:" + m) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null }), flush: () => log.push("flush") },
    LockService: { getScriptLock: () => ({ waitLock() { log.push("lock"); }, releaseLock() { log.push("release"); } }) },
    ContentService: { MimeType: { JSON: "j", TEXT: "t" }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
    console };
  vm.createContext(ctx);
  vm.runInContext(src + "\nrecalcSweetieBalances=function(){};aiHandle=function(){return null};getCardCutoff=function(){return 1};calcBillingMonth=function(){return 'Oct 2026'};", ctx);
  const call = (p) => vm.runInContext("doGet", ctx)({ parameter: p }).s;
  return { ctx, log, sheets, call };
}
const tests = [];
const t = (n, f) => tests.push([n, f]);
t("flush happens before releaseLock", () => {
  const e = env(); e.call({ action: "addSweetie", id: "1", type: "CREDIT", amount: "5", date: "2026-10-01" });
  const l = e.log.filter((x) => ["lock","flush","release"].includes(x));
  assert.deepEqual(l, ["lock", "flush", "release"]);
});
t("duplicate addSweetie id is rejected", () => {
  const e = env(); const p = { action: "addSweetie", id: "9", type: "CREDIT", amount: "5", date: "2026-10-01" };
  assert.equal(e.call(p), "Added"); assert.equal(e.call(p), "Duplicate"); assert.equal(e.sheets.Sweetie.rows.length, 2);
});
t("deleteSweetie removes ALL rows with the id (legacy duplicates), keeps others", () => {
  const e = env(); const S = e.sheets.Sweetie.rows;
  for (let i = 0; i < 4; i++) S.push(["7","CREDIT",5,0,"d","x"]); S.push(["8","DEBIT",1,0,"d","y"]);
  assert.equal(e.call({ action: "deleteSweetie", id: "7" }), "Deleted");
  assert.deepEqual(S.map((r) => r[0]), ["ID", "8"]);
  assert.equal(e.call({ action: "deleteSweetie", id: "7" }), "NotFound");
});
t("deleteCard removes ALL rows with the id, keeps others", () => {
  const e = env(); const C = e.sheets.Cards.rows;
  for (let i = 0; i < 3; i++) C.push(["5"]); C.push(["6"]);
  assert.equal(e.call({ action: "deleteCard", id: "5" }), "Deleted");
  assert.deepEqual(C.map((r) => r[0]), ["ID", "6"]);
});
t("findDuplicateIds logs but never deletes", () => {
  const e = env(); const S = e.sheets.Sweetie.rows; S.push(["3"], ["3"]);
  vm.runInContext("findDuplicateIds()", e.ctx);
  assert.ok(e.log.some((x) => /Sweetie: ID 3 in rows 2, 3/.test(x))); assert.equal(S.length, 3);
});
t("client: update writes are sequential (delete finishes before add)", () => {
  const s = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  assert.match(s, /async function sheetWriteSeq/);
  assert.match(s, /sheetWriteSeq\(\[\s*apiUrl\(`action=deleteSweetie[\s\S]*?action=addSweetie/);
  assert.match(s, /sheetWriteSeq\(\[\s*apiUrl\(`action=delete&id=\$\{editingExpId\}[\s\S]*?action=add&/);
  const a = fs.readFileSync(path.join(__dirname, "..", "ai-entry.js"), "utf8");
  assert.match(a, /cancelEditSweetie\(\)[\s\S]{0,200}const vals = \{\}/);
});
let bad = 0;
for (const [n, f] of tests) { try { f(); console.log("PASS", n); } catch (e) { bad++; console.log("FAIL", n, "\n  ", e.message.split("\n")[0]); } }
console.log(bad ? `${bad} failed` : "server-dup: all passed");
process.exit(bad ? 1 : 0);
