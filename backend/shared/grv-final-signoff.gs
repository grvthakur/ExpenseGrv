/**
 * GRV Expense — consolidated, read-only final sign-off.
 * Add this file to the SAME bound Apps Script project as code.gs and the
 * intelligence modules. Run grvRunFinalSignOff() once from the editor.
 *
 * Safety: performs GET requests to read-only dashboard endpoints and pure
 * in-memory finance/parser contract checks. It does NOT add, edit or delete
 * finance rows, create sheets, invoke an LLM, change Script Properties,
 * deploy code, or write to LearningEvents.
 *
 * It verifies the DEPLOYED /exec endpoint. The deployed deployment must
 * already contain the current v27 backend files for the result to be valid.
 */
function grvRunFinalSignOff() {
  const started = new Date();
  const steps = [];
  const add = (id, name, ok, detail, evidence) => steps.push({
    id: id, name: name, status: ok ? "PASS" : "FAIL",
    ok: !!ok, detail: String(detail || ""), evidence: evidence || {}
  });
  const props = PropertiesService.getScriptProperties();
  const productionUrl = String(props.getProperty("GRV_PRODUCTION_WEB_APP_URL") || "").trim().replace(/\/$/, "");
  const expectedFrontendUrl = "https://script.google.com/macros/s/AKfycbxvyWFWIHKCsqA0tQs8ZsSJYROegiT7GHhVm4zA_IaWtwJrJ3VVVRVjkSvMnXZiTPAW/exec";

  // 1. Bound project configuration + required functions + sheet schemas.
  try {
    if (typeof grvProductionReadinessCheck !== "function") throw new Error("Missing grvProductionReadinessCheck(); add grv-production-readiness.gs");
    const readiness = grvProductionReadinessCheck();
    const ok = !!(readiness && readiness.ok === true && Number(readiness.failed) === 0 && Number(readiness.total) > 0);
    add("configuration", "Bound project readiness and schemas", ok,
      ok ? "Read-only readiness audit passed." : "Readiness audit reported failed checks.",
      { passed: readiness && readiness.passed, failed: readiness && readiness.failed, total: readiness && readiness.total });
  } catch (err) {
    add("configuration", "Bound project readiness and schemas", false, err.message || err);
  }

  // 2. Actual deployed production health endpoint (not the editor /dev URL).
  const fetchJson = (action) => {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(productionUrl))
      throw new Error("GRV_PRODUCTION_WEB_APP_URL must be the deployed /exec URL from Deploy > Manage deployments.");
    const response = UrlFetchApp.fetch(productionUrl + "?action=" + encodeURIComponent(action), {
      method: "get", followRedirects: true, muteHttpExceptions: true,
      headers: { Accept: "application/json" }
    });
    const code = response.getResponseCode();
    const body = response.getContentText() || "";
    if (code !== 200) throw new Error("HTTP " + code + " from deployed action=" + action + ": " + body.slice(0, 240));
    let json;
    try { json = JSON.parse(body); } catch (_) { throw new Error("Deployed action=" + action + " did not return JSON: " + body.slice(0, 240)); }
    if (!json || json.ok !== true) throw new Error("Deployed action=" + action + " returned ok=false or an invalid payload.");
    return json;
  };
  let health = null;
  try {
    health = fetchJson("systemHealth");
    const ok = health.status === "healthy" && Number(health.failed) === 0 && Number(health.total) > 0 && health.readOnly === true;
    add("production_health", "Deployed /exec System Health", ok,
      ok ? "Deployed production endpoint reports healthy." : "Endpoint responded, but health status is not fully healthy.",
      { status: health.status || "", passed: health.passed, failed: health.failed, total: health.total, readOnly: health.readOnly });
  } catch (err) {
    add("production_health", "Deployed /exec System Health", false, err.message || err);
  }

  // 3. Developer Dashboard API data contract.
  try {
    const dashboard = fetchJson("devDashboard");
    const counts = dashboard.counts || {};
    const valid = !!(counts && typeof counts.totalEvents === "number" &&
      typeof counts.totalIssues === "number" && typeof counts.openIssues === "number" &&
      Array.isArray(dashboard.events) && Array.isArray(dashboard.issues));
    add("developer_dashboard", "Developer Dashboard live API contract", valid,
      valid ? "Dashboard payload and event/issue collections are readable." : "Dashboard payload is missing required counters or collections.",
      { totalEvents: counts.totalEvents, totalIssues: counts.totalIssues, openIssues: counts.openIssues,
        eventsReturned: (dashboard.events || []).length, issuesReturned: (dashboard.issues || []).length });
  } catch (err) {
    add("developer_dashboard", "Developer Dashboard live API contract", false, err.message || err);
  }

  // 4. Learning Review API: only redacted pattern/correction summaries.
  try {
    const review = fetchJson("devLearningReview");
    const counts = review.counts || {};
    const valid = review.enabled === true && counts &&
      typeof counts.patterns === "number" && typeof counts.events === "number" &&
      typeof counts.correctedEvents === "number" && Array.isArray(review.patterns) && Array.isArray(review.events);
    const serialized = JSON.stringify(review);
    const noRawSmsField = !/"(?:rawSms|sourceText|fullSms|smsBody)"\s*:/i.test(serialized);
    add("learning_review", "Learning Review retrieval and privacy contract", !!(valid && noRawSmsField),
      valid && noRawSmsField ? "Learning Review returns pattern/correction summaries without raw-SMS fields." : "Learning Review schema or privacy contract failed.",
      { enabled: review.enabled, patterns: counts.patterns, events: counts.events,
        correctedEvents: counts.correctedEvents, patternsReturned: (review.patterns || []).length,
        eventsReturned: (review.events || []).length, rawSmsFieldsDetected: !noRawSmsField });
  } catch (err) {
    add("learning_review", "Learning Review retrieval and privacy contract", false, err.message || err);
  }

  // 5. Finance regression checks using pure functions only; no sheet writes.
  try {
    const missing = [];
    if (typeof calcBillingMonth !== "function") missing.push("calcBillingMonth");
    if (typeof normalizeExpRow !== "function") missing.push("normalizeExpRow");
    if (missing.length) throw new Error("Missing finance helper(s): " + missing.join(", "));
    const tests = [];
    const check = (name, actual, expected) => tests.push({ name: name, ok: actual === expected, actual: actual, expected: expected });
    check("cutoff day remains in same billing month", calcBillingMonth("2026-11-20", 20), "November 2026");
    check("day after cutoff moves to next billing month", calcBillingMonth("2026-11-21", 20), "December 2026");
    check("December cutoff rolls year", calcBillingMonth("2026-12-21", 20), "January 2027");
    check("zero cutoff uses transaction month", calcBillingMonth("2026-11-21", 0), "November 2026");
    const normalized = normalizeExpRow(["T-1", "2026-11-02", "Nov-26", "Food", "Test", "123.45"]);
    check("expense row ID normalization", normalized.id, "T-1");
    check("expense amount normalization", normalized.amount, 123.45);
    const failed = tests.filter(t => !t.ok);
    add("finance_regression", "Finance and billing pure-function regression", failed.length === 0,
      failed.length ? failed.length + " of " + tests.length + " assertions failed." : "All in-memory finance assertions passed; no finance rows were touched.",
      { passed: tests.length - failed.length, failed: failed.length, total: tests.length, assertions: tests });
  } catch (err) {
    add("finance_regression", "Finance and billing pure-function regression", false, err.message || err);
  }

  // 6. AI + learning integration contract (no paid provider call, no writes).
  try {
    const funcs = {
      aiHandle: typeof aiHandle === "function",
      aiParse_: typeof aiParse_ === "function",
      llmJson: typeof llmJson === "function",
      grvAiLearningContext_: typeof grvAiLearningContext_ === "function",
      grvAiLearningPayload_: typeof grvAiLearningPayload_ === "function",
      grvAiLearnSaved_: typeof grvAiLearnSaved_ === "function"
    };
    const missing = Object.keys(funcs).filter(k => !funcs[k]);
    let contextShapeOk = false, contextEnabled = false, patterns = 0;
    if (!missing.length) {
      const context = grvAiLearningContext_("AXIS Bank transaction spent at GRV FINAL SIGNOFF MERCHANT");
      contextEnabled = !!(context && context.enabled === true);
      patterns = context && Array.isArray(context.patterns) ? context.patterns.length : -1;
      contextShapeOk = !!(context && Array.isArray(context.patterns) && Object.prototype.hasOwnProperty.call(context, "enabled"));
    }
    const ok = missing.length === 0 && contextShapeOk && contextEnabled;
    add("ai_learning_regression", "AI provider gateway and learning retrieval contract", ok,
      ok ? "Parser/provider gateway functions are loaded and live learning retrieval returns the expected shape." :
        (missing.length ? "Missing functions: " + missing.join(", ") : "Learning retrieval is disabled or returned an invalid shape."),
      { functions: funcs, learningEnabled: contextEnabled, matchingPatterns: patterns,
        providerNetworkCall: false, financeWrite: false });
  } catch (err) {
    add("ai_learning_regression", "AI provider gateway and learning retrieval contract", false, err.message || err);
  }

  // Final release gate: production URL matches the app's configured endpoint;
  // live-E2E write permission must remain disabled after the earlier test.
  const liveGateOff = props.getProperty("GRV_ENABLE_LIVE_LEARNING_E2E") !== "YES";
  const endpointMatch = !!productionUrl && productionUrl === expectedFrontendUrl;
  add("release_safety", "Release URL alignment and test-write safety gate", endpointMatch && liveGateOff,
    endpointMatch && liveGateOff ? "Configured production URL matches the frontend; temporary live-E2E write gate is off." :
      "URL mismatch or temporary live-E2E write gate is still enabled.",
    { productionUrlConfigured: !!productionUrl, frontendEndpointMatch: endpointMatch,
      liveE2EWriteGateDisabled: liveGateOff, urlValueExposed: false });

  const passed = steps.filter(s => s.ok).length;
  const failed = steps.length - passed;
  const result = {
    ok: failed === 0,
    status: failed === 0 ? "PASS" : "FAIL",
    project: "GRV Expense",
    release: "v27 + final sign-off runner",
    readOnly: true,
    startedAt: Utilities.formatDate(started, "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"),
    completedAt: Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"),
    passed: passed, failed: failed, total: steps.length,
    steps: steps,
    limitations: [
      "This runner verifies deployed backend APIs and read-only finance/learning contracts; it does not automate a real human browser session.",
      "Provider network calls and financial writes are intentionally excluded. Provider fallback, preview interaction and full UI rendering are covered by the v27 local 149-test suite, not re-executed by Apps Script."
    ],
    signOff: failed === 0 ? "Backend/runtime sign-off passed for the deployed version and the checks listed above." : "Not signed off; resolve every FAIL step and rerun."
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
