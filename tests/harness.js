"use strict";
/*
 * Test harness for GRV Expense Tracker.
 *
 * - Loads the REAL index.html / script.js / ai-entry.js / animation.js inside jsdom.
 * - The source files on disk are never modified: private functions of the ai-entry.js
 *   IIFE are exposed by appending a hook to an in-memory copy of the source.
 * - Only synthetic data is used. Network (fetch) always rejects, so nothing leaves the machine
 *   and no Google Sheet / Apps Script is ever contacted.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let JSDOM = null;
try {
  ({ JSDOM } = require("jsdom"));
} catch (_) {
  /* jsdom is optional; DOM-based suites are reported as SKIPPED, never as passed. */
}

const AI_EXPOSE = [
  "localParse",
  "labelHint",
  "splitHint",
  "userLine",
  "shorthandHint",
  "bankAmount",
  "smsParse",
  "isBankSms",
  "normDesc",
  "runPlan",
  "extraRows",
  "cap",
  "peopleSet",
];

function hookedSummary() {
  const src = read("summary-plus.js");
  const end = src.lastIndexOf("})();");
  return src.slice(0, end) + "\nwindow.__sp = { calc };\n" + src.slice(end);
}

function hookedAiEntry() {
  const src = read("ai-entry.js");
  const end = src.lastIndexOf("})();");
  if (end < 0) throw new Error("ai-entry.js: IIFE end not found");
  const expose = AI_EXPOSE.map(
    (n) => `${JSON.stringify(n)}: (typeof ${n} === "function" ? ${n} : undefined)`,
  ).join(",");
  return src.slice(0, end) + `\nwindow.__ai = { ${expose} };\n` + src.slice(end);
}

const APP_HOOK = `
;window.__app = {
  render: () => render(),
  loadLocal: () => loadLocal(),
  set(o) {
    if ("expenses" in o) expenses = o.expenses;
    if ("salaries" in o) salaries = o.salaries;
    if ("sweetieTxns" in o) sweetieTxns = o.sweetieTxns;
    if ("cardConfig" in o) cardConfig = o.cardConfig;
    if ("grvExpenseHistoryLoaded" in o) grvExpenseHistoryLoaded = o.grvExpenseHistoryLoaded;
    if ("grvHistoryAttempted" in o) grvHistoryAttempted = o.grvHistoryAttempted;
    if ("grvExpenseHistory" in o) grvExpenseHistory = o.grvExpenseHistory;
    if ("cardTxns" in o) cardTxns = o.cardTxns;
  },
  exclude(id, v) { if (v) sweetieExpenseExclusions.add(String(id)); else sweetieExpenseExclusions.delete(String(id)); },
  syncHistory: () => syncGrvExpenseHistory(),
  overview(key) { grvOverviewMonthKey = key; return getCombinedMonthlyOverview()[0]; },
  money: (v) => money(v),
  monthKey: () => monthKey(),
  getGrvCategoryType: (c) => getGrvCategoryType(c),
};`;

/** Build a fresh app instance. Returns { w, doc, app, ai, errors }. Null if jsdom missing. */
function loadApp(opts = {}) {
  if (!JSDOM) return null;
  const html = read("index.html").replace(/<script[\s\S]*?<\/script>/g, "");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://example.test/",
    virtualConsole: new (require("jsdom").VirtualConsole)(), // swallow CSS/console noise
  });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error("network disabled in tests"));
  w.Chart = function () {};
  w.alert = () => {};
  w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  w.addEventListener("error", (e) => errors.push(String(e.message)));
  Object.entries(opts.storage || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
  const code = [read("script.js"), hookedAiEntry(), read("animation.js"), hookedSummary(), APP_HOOK].join("\n;\n");
  try {
    w.eval(code);
  } catch (e) {
    errors.push("LOAD: " + e.message);
  }
  const app = w.__app;
  if (app) app.sp = w.__sp;
  const ai = w.__ai;
  const doc = w.document;
  // The month/year selects are filled by the app's init; make sure the wanted options exist.
  const pick = (id, v) => {
    const el = doc.getElementById(id);
    if (![...el.options].some((o) => o.value === String(v)))
      el.add(new w.Option(String(v), String(v)));
    el.value = String(v);
  };
  return {
    w,
    doc,
    app,
    ai,
    errors,
    /** monthIndex is 0-based (0 = Jan). */
    setMonth(year, monthIndex) {
      pick("yearSelect", year);
      pick("monthSelect", monthIndex);
    },
    text: (id) => (doc.getElementById(id) || {}).textContent,
    close: () => w.close(),
  };
}

// ── tiny dependency-free test runner ─────────────────────────────────────────
function makeRunner() {
  const results = [];
  let suite = "";
  return {
    suite(name) {
      suite = name;
    },
    /**
     * opts.knownBug: text describing a bug that exists in the repo today. The test states the
     * CORRECT behaviour; while the bug exists it is reported as "known" (not hidden, not a
     * failure of the suite). If it starts passing it is reported as "fixed" so the flag can be removed.
     */
    test(name, fn, opts = {}) {
      try {
        fn();
        results.push({ suite, name, status: opts.knownBug ? "fixed" : "pass", note: opts.knownBug });
      } catch (e) {
        const err = e && e.message ? e.message : String(e);
        results.push({ suite, name, status: opts.knownBug ? "known" : "fail", err, note: opts.knownBug });
      }
    },
    skip(name, why) {
      results.push({ suite, name, status: "skip", err: why });
    },
    results,
  };
}

module.exports = { ROOT, read, loadApp, makeRunner, hasJsdom: !!JSDOM, vm };
