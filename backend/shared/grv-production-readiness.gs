/**
 * GRV Expense — read-only production readiness check.
 * Add as grv-production-readiness.gs in the bound Apps Script project.
 * Run grvProductionReadinessCheck() from the Apps Script editor.
 * This function does NOT create tabs, write rows, or modify transactions.
 */
function grvProductionReadinessCheck() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: String(detail || "") });
  const props = PropertiesService.getScriptProperties();
  const learningId = props.getProperty("GRV_AI_LEARNING_SPREADSHEET_ID");
  add("Learning spreadsheet Script Property", !!learningId,
    learningId ? "Configured (ID intentionally hidden)" : "Missing GRV_AI_LEARNING_SPREADSHEET_ID");

  const functionStatus = {
    aiHandle: typeof aiHandle === "function",
    aiParse_: typeof aiParse_ === "function",
    llmJson: typeof llmJson === "function",
    grvAiLearningContext_: typeof grvAiLearningContext_ === "function",
    grvAiLearnSaved_: typeof grvAiLearnSaved_ === "function",
    grvDevHandle: typeof grvDevHandle === "function",
    grvDevAnalyzeHandle: typeof grvDevAnalyzeHandle === "function",
    grvDevSourceAnalyze_: typeof grvDevSourceAnalyze_ === "function",
    grvDevDashboardHandle: typeof grvDevDashboardHandle === "function",
    grvDevSetup: typeof grvDevSetup === "function",
    grvDevDashboardSetup: typeof grvDevDashboardSetup === "function"
  };
  Object.keys(functionStatus).forEach(name => {
    const present = functionStatus[name];
    add("Function " + name, present, present ? "Available in this Apps Script project" : "Missing; confirm source file is added");
  });

  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    add("Bound finance spreadsheet access", !!active, active ? "Opened" : "No active spreadsheet bound");
    if (active) {
      ["Expenses", "Salary"].forEach(name =>
        add("Finance tab " + name, !!active.getSheetByName(name), active.getSheetByName(name) ? "Found" : "Missing"));
      ["Cards", "Sweetie", "Summary"].forEach(name => {
        const found = !!active.getSheetByName(name);
        add("Finance tab " + name, found, found ? "Found" : "Not found (may be created lazily by app routes)");
      });
    }
  } catch (err) {
    add("Bound finance spreadsheet access", false, String(err && err.message || err));
  }

  if (learningId) {
    try {
      const book = SpreadsheetApp.openById(learningId);
      add("Learning spreadsheet access", true, "Opened (spreadsheet ID intentionally hidden)");
      const schemas = {
        LearningPatterns: ["key","kind","source","target","count","confidence","updatedAt","lastEventId"],
        LearningEvents: ["eventId","transactionId","kind","sourceFingerprint","targetSnapshot","createdAt","version"],
        DeveloperEvents: ["Timestamp","EventId","Fingerprint","EventType","Source","Severity","File","Function","ErrorCode","Message","AppVersion","Environment","Count"],
        DeveloperIssues: ["Fingerprint","FirstSeen","LastSeen","Occurrences","Status","Severity","EventType","Source","File","Function","ErrorCode","LatestMessage","SuggestedNextStep"],
        DeveloperAnalysis: ["AnalysisId","CreatedAt","WindowEvents","Provider","Severity","Summary","LikelyCause","Evidence","RecommendedChecks","SuggestedFix","Confidence","Status"],
        DeveloperSourceAnalysis: ["AnalysisId","CreatedAt","Repository","Branch","FileCount","TotalChars","Provider","OverallSeverity","Confidence","Summary","FindingsJSON","LimitationsJSON","Status"]
      };
      Object.keys(schemas).forEach(name => {
        const sh = book.getSheetByName(name);
        if (!sh) {
          add("Learning/diagnostic tab " + name, false, "Missing; setup helper can create this tab");
          return;
        }
        const header = sh.getLastRow() ? sh.getRange(1, 1, 1, schemas[name].length).getDisplayValues()[0] : [];
        const ok = schemas[name].every((value, i) => String(header[i] || "").trim() === value);
        add("Learning/diagnostic tab " + name, ok, ok ? "Tab and header schema verified" : "Tab exists but header is empty or differs; inspect before changing it");
      });
    } catch (err) {
      add("Learning spreadsheet access", false, String(err && err.message || err));
    }
  }

  const frontendEndpoint = "https://script.google.com/macros/s/AKfycbxvyWFWIHKCsqA0tQs8ZsSJYROegiT7GHhVm4zA_IaWtwJrJ3VVVRVjkSvMnXZiTPAW/exec";
  let editorServiceUrl = "";
  try { editorServiceUrl = ScriptApp.getService().getUrl() || ""; } catch (_) {}
  add("Apps Script service URL", !!editorServiceUrl,
    editorServiceUrl ? ( /\/dev\/?$/.test(editorServiceUrl) ? "Editor test URL returned (/dev); this is not the production deployment URL" : "Service URL returned") : "No web app service URL returned");

  // ScriptApp.getService().getUrl() can return the editor test URL (/dev).
  // Production endpoint must be copied from Deploy > Manage deployments and stored explicitly.
  const productionUrl = String(props.getProperty("GRV_PRODUCTION_WEB_APP_URL") || "").trim().replace(/\/$/, "");
  const expectedUrl = frontendEndpoint.replace(/\/$/, "");
  add("Production /exec URL configured", /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(productionUrl),
    productionUrl ? "Production URL property found" : "Set Script Property GRV_PRODUCTION_WEB_APP_URL using the Web app URL from Deploy > Manage deployments");
  add("Frontend / production endpoint match", !!productionUrl && productionUrl === expectedUrl,
    productionUrl ? "Compared production /exec URL with index.html and script.js" : "Pending production /exec URL from Deploy > Manage deployments");

  const passed = checks.filter(x => x.ok).length;
  const failed = checks.length - passed;
  const result = {
    ok: failed === 0,
    readOnly: true,
    checkedAt: Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"),
    passed: passed,
    failed: failed,
    total: checks.length,
    checks: checks,
    editorServiceUrl: editorServiceUrl,
    productionUrlConfigured: !!productionUrl,
    note: "No transaction data or spreadsheet rows were changed. Editor /dev URL is not treated as production. Set GRV_PRODUCTION_WEB_APP_URL from Deploy > Manage deployments and rerun before release."
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
