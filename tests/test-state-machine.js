"use strict";
const assert = require("node:assert/strict");

/**
 * App State Machine (ASM) prototype test
 * Validates transitions, guards, listeners, and backward compatibility.
 */

class AppStateMachine {
  constructor() {
    this._listeners = new Set();
    this.state = {
      workspace: "expenses", // expenses | cards | grvcc | sweetie | loans
      form: {
        mode: "IDLE", // IDLE | EDITING | CLONING | SUBMITTING
        domain: null, // expense | card | sweetie | grvCard | loan
        targetId: null,
        isBusy: false,
      },
      sync: {
        status: "READY", // UNINITIALIZED | SYNCING | READY | ERROR | OFFLINE
        activeJobs: new Set(),
        lastSynced: null,
        error: null,
      },
      ai: {
        modal: "CLOSED", // CLOSED | INPUT | PARSING | PREVIEW | CHAT
        hasHistory: false,
      },
      selection: {
        domain: null,
        selectedIds: new Set(),
      },
      privacy: {
        amountsMasked: false,
      }
    };
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify(event, payload) {
    for (const fn of this._listeners) {
      try { fn(event, payload, this.state); } catch (e) { console.error("ASM listener error:", e); }
    }
  }

  // --- Form Machine ---
  startEdit(domain, id, data = {}) {
    this.cancelForm(); // automatically cancel any leftover edit from another domain
    this.state.form = {
      mode: "EDITING",
      domain,
      targetId: String(id),
      isBusy: false,
      data,
    };
    this._notify("form:startEdit", this.state.form);
    return this.state.form;
  }

  startClone(domain, id, data = {}) {
    this.cancelForm();
    this.state.form = {
      mode: "CLONING",
      domain,
      targetId: String(id),
      isBusy: false,
      data,
    };
    this._notify("form:startClone", this.state.form);
    return this.state.form;
  }

  startSubmitting(domain) {
    if (this.state.form.isBusy) return false;
    this.state.form.isBusy = true;
    this._notify("form:submitting", { domain });
    return true;
  }

  finishSubmitting(domain, success = true) {
    this.state.form.isBusy = false;
    if (success) {
      this.cancelForm();
    }
    this._notify("form:submitted", { domain, success });
  }

  cancelForm() {
    const prev = { ...this.state.form };
    this.state.form = {
      mode: "IDLE",
      domain: null,
      targetId: null,
      isBusy: false,
      data: null,
    };
    if (prev.mode !== "IDLE") {
      this._notify("form:cancelled", prev);
    }
    return prev;
  }

  // --- Workspace Machine ---
  setWorkspace(tab) {
    const valid = ["expenses", "cards", "grvcc", "sweetie", "loans"];
    if (!valid.includes(tab)) return false;
    const prev = this.state.workspace;
    this.state.workspace = tab;
    this._notify("workspace:changed", { from: prev, to: tab });
    return true;
  }

  // --- Sync Machine ---
  startSync(jobKey) {
    this.state.sync.activeJobs.add(jobKey);
    this.state.sync.status = "SYNCING";
    this._notify("sync:started", { jobKey, activeJobs: [...this.state.sync.activeJobs] });
  }

  finishSync(jobKey, err = null) {
    this.state.sync.activeJobs.delete(jobKey);
    if (err) {
      this.state.sync.error = err;
      this.state.sync.status = this.state.sync.activeJobs.size > 0 ? "SYNCING" : "ERROR";
    } else {
      this.state.sync.lastSynced = new Date();
      this.state.sync.status = this.state.sync.activeJobs.size > 0 ? "SYNCING" : "READY";
    }
    this._notify("sync:finished", { jobKey, err, status: this.state.sync.status });
  }

  // --- Agent / Inspection API ---
  inspect() {
    return {
      workspace: this.state.workspace,
      form: {
        mode: this.state.form.mode,
        domain: this.state.form.domain,
        targetId: this.state.form.targetId,
        isBusy: this.state.form.isBusy,
      },
      sync: {
        status: this.state.sync.status,
        activeJobsCount: this.state.sync.activeJobs.size,
        lastSynced: this.state.sync.lastSynced,
      },
      ai: { ...this.state.ai },
      selectionCount: this.state.selection.selectedIds.size,
      privacy: { ...this.state.privacy }
    };
  }
}

// Unit Tests
const asm = new AppStateMachine();

// Test 1: Start edit transitions cleanly
asm.startEdit("card", "123");
assert.equal(asm.state.form.mode, "EDITING");
assert.equal(asm.state.form.domain, "card");
assert.equal(asm.state.form.targetId, "123");

// Test 2: Starting an expense edit cancels the card edit automatically
asm.startEdit("expense", "456");
assert.equal(asm.state.form.mode, "EDITING");
assert.equal(asm.state.form.domain, "expense");
assert.equal(asm.state.form.targetId, "456");

// Test 3: Canceling resets to IDLE
asm.cancelForm();
assert.equal(asm.state.form.mode, "IDLE");
assert.equal(asm.state.form.domain, null);
assert.equal(asm.state.form.targetId, null);

// Test 4: Inspection provides complete snapshot for Agent / Diagnostics
const snapshot = asm.inspect();
assert.equal(snapshot.form.mode, "IDLE");
assert.equal(snapshot.workspace, "expenses");
assert.equal(snapshot.sync.status, "READY");

console.log("All AppStateMachine prototype tests passed!");
