"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync("frontend/index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/" });
const w = dom.window;

// Mock dependencies
w.fetch = () => Promise.reject();
w.Chart = function () {};
w.alert = () => {};

// Load state-machine.js, script.js, ai-entry.js
w.eval(fs.readFileSync("frontend/state-machine.js", "utf8"));
w.eval(fs.readFileSync("frontend/script.js", "utf8"));
w.eval(fs.readFileSync("frontend/ai-entry.js", "utf8"));

const asm = w.__asm;
assert.ok(asm, "__asm must be initialized on window");

// Test 1: Start card edit
asm.startEdit("card", "101");
assert.equal(asm.state.form.domain, "card");
assert.equal(asm.state.form.targetId, "101");
assert.equal(w.editingCardId, "101");

// Test 2: Start sweetie edit cancels card edit automatically (Mutual Exclusion)
asm.startEdit("sweetie", "202");
assert.equal(asm.state.form.domain, "sweetie");
assert.equal(asm.state.form.targetId, "202");
assert.equal(w.editingSweetieId, "202");
assert.equal(w.editingCardId, null, "editingCardId must be reset when starting sweetie edit");

// Test 3: cancelAllForms resets everything
asm.cancelAllForms();
assert.equal(asm.state.form.mode, "IDLE");
assert.equal(w.editingCardId, null);
assert.equal(w.editingSweetieId, null);
assert.equal(w.editingExpId, null);

// Test 4: Modal stack management
const testModal = w.document.createElement("div");
testModal.id = "myTestModal";
testModal.style.display = "none";
w.document.body.appendChild(testModal);

asm.pushModal("myTestModal");
assert.equal(asm.state.modals.length, 1);
assert.equal(testModal.style.display, "block");

// Escape key pops modal
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
assert.equal(asm.state.modals.length, 0);
assert.equal(testModal.style.display, "none");

// Test 5: asm.inspect() provides snapshot for AI Agents
const snap = asm.inspect();
assert.equal(snap.workspace, "expenses");
assert.equal(snap.form.mode, "IDLE");
assert.equal(snap.openModals.length, 0);

console.log("All ASM DOM Integration Tests Passed Successfully!");
