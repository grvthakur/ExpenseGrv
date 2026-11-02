/**
 * One-time dashboard storage setup. Creates only diagnostic tabs; never touches
 * transaction or finance tabs. Existing tabs and rows are preserved.
 */
function grvDevDashboardSetup() {
  const id = PropertiesService.getScriptProperties().getProperty("GRV_AI_LEARNING_SPREADSHEET_ID");
  if (!id) throw new Error("Missing GRV_AI_LEARNING_SPREADSHEET_ID");
  const ss = SpreadsheetApp.openById(id);
  const schemas = {
    DeveloperEvents: ["Timestamp","EventId","Fingerprint","EventType","Source","Severity","File","Function","ErrorCode","Message","AppVersion","Environment","Count"],
    DeveloperIssues: ["Fingerprint","FirstSeen","LastSeen","Occurrences","Status","Severity","EventType","Source","File","Function","ErrorCode","LatestMessage","SuggestedNextStep"],
    DeveloperAnalysis: ["AnalysisId","CreatedAt","WindowEvents","Provider","Severity","Summary","LikelyCause","Evidence","RecommendedChecks","SuggestedFix","Confidence","Status"],
    DeveloperSourceAnalysis: ["AnalysisId","CreatedAt","Repository","Branch","FileCount","TotalChars","Provider","OverallSeverity","Confidence","Summary","FindingsJSON","LimitationsJSON","Status"]
  };
  Object.keys(schemas).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,schemas[name].length).setValues([schemas[name]]);
      sh.setFrozenRows(1);
    }
  });
  return "Developer diagnostic tabs are ready. Existing data was preserved.";
}

/** GRV Developer Engine — read-only dashboard endpoint. */
function grvDevDashboardHandle(action, e) {
  if (action !== "devDashboard" && action !== "devLearningReview" && action !== "systemHealth") return null;
  try {
    const id = PropertiesService.getScriptProperties().getProperty("GRV_AI_LEARNING_SPREADSHEET_ID");
    if (!id) throw new Error("Missing GRV_AI_LEARNING_SPREADSHEET_ID");
    const ss = SpreadsheetApp.openById(id);
    if (action === "systemHealth") {
      const checks = [];
      const add = (name, ok, detail, group) => checks.push({ name, ok: !!ok, detail: String(detail || ""), group: group || "Configuration" });
      const requiredTabs = ["LearningPatterns", "LearningEvents", "DeveloperEvents", "DeveloperIssues", "DeveloperAnalysis", "DeveloperSourceAnalysis"];
      add("Learning spreadsheet configured", true, "Script Property is present; identifier is hidden", "Storage");
      add("Learning spreadsheet accessible", !!ss.getId(), "Sidecar spreadsheet opened successfully", "Storage");
      requiredTabs.forEach(name => {
        const sh = ss.getSheetByName(name);
        add("Tab: " + name, !!sh, sh ? (sh.getLastRow() + " rows available") : "Missing; run the appropriate setup helper", "Storage");
      });
      let finance = null;
      try { finance = SpreadsheetApp.getActiveSpreadsheet(); } catch (_) {}
      add("Finance spreadsheet accessible", !!finance, finance ? "Bound spreadsheet opened" : "No bound finance spreadsheet", "Finance");
      ["Expenses", "Salary"].forEach(name => {
        const sh = finance && finance.getSheetByName(name);
        add("Finance tab: " + name, !!sh, sh ? "Available" : "Missing", "Finance");
      });
      const funcs = {
        aiHandle: typeof aiHandle === "function", aiParse_: typeof aiParse_ === "function",
        grvAiLearningContext_: typeof grvAiLearningContext_ === "function", grvAiLearnSaved_: typeof grvAiLearnSaved_ === "function",
        grvDevHandle: typeof grvDevHandle === "function", grvDevAnalyzeHandle: typeof grvDevAnalyzeHandle === "function",
        grvDevDashboardHandle: typeof grvDevDashboardHandle === "function"
      };
      Object.keys(funcs).forEach(name => add("Function: " + name, funcs[name], funcs[name] ? "Loaded" : "Missing from Apps Script project", "Integration"));
      const props = PropertiesService.getScriptProperties();
      const prodUrl = String(props.getProperty("GRV_PRODUCTION_WEB_APP_URL") || "").trim();
      add("Production web app URL", /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(prodUrl), prodUrl ? "Configured (URL hidden)" : "Not configured; set from Deploy > Manage deployments", "Deployment");
      let serviceUrl = "";
      try { serviceUrl = ScriptApp.getService().getUrl() || ""; } catch (_) {}
      add("Apps Script web app service", !!serviceUrl && !/\/dev\/?$/.test(serviceUrl), serviceUrl ? (/\/dev\/?$/.test(serviceUrl) ? "Only editor /dev URL returned" : "Service URL available") : "No service URL returned", "Deployment");
      const passed = checks.filter(x => x.ok).length;
      return ContentService.createTextOutput(JSON.stringify({ ok:true, generatedAt:Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"), status:passed===checks.length?"healthy":"attention", passed:passed, failed:checks.length-passed, total:checks.length, checks:checks, readOnly:true })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "devLearningReview") {
      const patterns = grvDashRead_(ss, "LearningPatterns");
      const learningEvents = grvDashRead_(ss, "LearningEvents");
      const recentEvents = learningEvents.rows.slice(-50).reverse().map(r => {
        let snapshot = {};
        try { snapshot = JSON.parse(String(r.targetSnapshot || "{}")); } catch (_) {}
        const corrections = snapshot && snapshot.corrections && typeof snapshot.corrections === "object" ? snapshot.corrections : {};
        return {
          kind: grvDashText_(r.kind, 40), createdAt: grvDashText_(r.createdAt, 60),
          corrected: Object.keys(corrections).length > 0,
          corrections: Object.keys(corrections).slice(0, 12).map(field => ({
            field: grvDashText_(field, 40),
            suggested: grvDashText_(corrections[field] && corrections[field].suggested, 120),
            approved: grvDashText_(corrections[field] && corrections[field].approved, 120)
          }))
        };
      });
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        generatedAt: Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"),
        enabled: true,
        counts: { patterns: Math.max(0, patterns.rows.length), events: Math.max(0, learningEvents.rows.length),
          correctedEvents: recentEvents.filter(x => x.corrected).length },
        patterns: patterns.rows.slice(-100).reverse().map(r => ({
          kind: grvDashText_(r.kind, 60), source: grvDashText_(r.source, 100), target: grvDashText_(r.target, 120),
          count: Number(r.count) || 0, confidence: Number(r.confidence) || 0,
          updatedAt: grvDashText_(r.updatedAt, 60)
        })),
        events: recentEvents
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const events = grvDashRead_(ss, "DeveloperEvents");
    const issues = grvDashRead_(ss, "DeveloperIssues");
    const analyses = grvDashRead_(ss, "DeveloperAnalysis");
    const sourceAnalyses = grvDashRead_(ss, "DeveloperSourceAnalysis");
    const latestAnalysis = analyses.rows.length ? analyses.rows[analyses.rows.length - 1] : null;
    const latestSource = sourceAnalyses.rows.length ? sourceAnalyses.rows[sourceAnalyses.rows.length - 1] : null;
    const open = issues.rows.filter(r => !["closed", "resolved", "ignored"].includes(String(r.Status).toLowerCase()));
    const countBy = (rows, key) => rows.reduce((o, r) => { const k = String(r[key] || "unknown").toLowerCase(); o[k] = (o[k] || 0) + 1; return o; }, {});
    const result = {
      ok: true,
      generatedAt: Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss"),
      counts: {
        totalEvents: events.rows.length, totalIssues: issues.rows.length, openIssues: open.length,
        criticalIssues: open.filter(r => String(r.Severity).toLowerCase() === "critical").length,
        highIssues: open.filter(r => String(r.Severity).toLowerCase() === "high").length,
        eventsBySeverity: countBy(events.rows, "Severity"), issuesBySeverity: countBy(open, "Severity")
      },
      learningFeedback: typeof grvAiLearningFeedbackSummary_ === "function"
        ? grvAiLearningFeedbackSummary_() : { events:0, correctedEvents:0, correctedFields:0 },
      events: events.rows.slice(-50).reverse().map(r => ({ timestamp: grvDashText_(r.Timestamp,60), eventType: grvDashText_(r.EventType,60), source: grvDashText_(r.Source,60), severity: grvDashText_(r.Severity,20), file: grvDashText_(r.File,100), functionName: grvDashText_(r.Function,100), errorCode: grvDashText_(r.ErrorCode,80), message: grvDashText_(r.Message,300), environment: grvDashText_(r.Environment,40) })),
      issues: issues.rows.slice(-100).reverse().map(r => ({ fingerprint: grvDashText_(r.Fingerprint,120), firstSeen: grvDashText_(r.FirstSeen,60), lastSeen: grvDashText_(r.LastSeen,60), occurrences: Number(r.Occurrences)||0, status: grvDashText_(r.Status,30), severity: grvDashText_(r.Severity,20), eventType: grvDashText_(r.EventType,60), source: grvDashText_(r.Source,60), file: grvDashText_(r.File,100), functionName: grvDashText_(r.Function,100), errorCode: grvDashText_(r.ErrorCode,80), latestMessage: grvDashText_(r.LatestMessage,300), suggestedNextStep: grvDashText_(r.SuggestedNextStep,300) })),
      latestAnalysis: latestAnalysis ? {
        analysisId: grvDashText_(latestAnalysis.AnalysisId,100), createdAt: grvDashText_(latestAnalysis.CreatedAt,60), windowEvents: Number(latestAnalysis.WindowEvents)||0,
        provider: grvDashText_(latestAnalysis.Provider,60), severity: grvDashText_(latestAnalysis.Severity,20), summary: grvDashText_(latestAnalysis.Summary,1200),
        likelyCause: grvDashText_(latestAnalysis.LikelyCause,1200), evidence: grvDashJsonArray_(latestAnalysis.Evidence), recommendedChecks: grvDashJsonArray_(latestAnalysis.RecommendedChecks),
        suggestedFix: grvDashText_(latestAnalysis.SuggestedFix,1600), confidence: Number(latestAnalysis.Confidence)||0, status: grvDashText_(latestAnalysis.Status,40)
      } : null,
      latestSourceAnalysis: latestSource ? {
        analysisId: grvDashText_(latestSource.AnalysisId,100), createdAt: grvDashText_(latestSource.CreatedAt,60), repository: grvDashText_(latestSource.Repository,120),
        branch: grvDashText_(latestSource.Branch,80), fileCount: Number(latestSource.FileCount)||0, provider: grvDashText_(latestSource.Provider,60),
        severity: grvDashText_(latestSource.OverallSeverity,20), confidence: Number(latestSource.Confidence)||0, summary: grvDashText_(latestSource.Summary,1400),
        findings: grvDashJsonArray_(latestSource.FindingsJSON), limitations: grvDashJsonArray_(latestSource.LimitationsJSON), status: grvDashText_(latestSource.Status,40)
      } : null
    };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err && err.message || err)})).setMimeType(ContentService.MimeType.JSON);
  }
}
function grvDashRead_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return {headers:[],rows:[]};
  const v = sh.getDataRange().getValues(), headers = v[0].map(x => String(x||"").trim());
  return {headers, rows:v.slice(1).filter(row => row.some(x => x!=="" && x!=null)).map(row => {
    const o={}; headers.forEach((h,i) => { const x=row[i]; o[h]=x instanceof Date ? Utilities.formatDate(x,"Asia/Kolkata","yyyy-MM-dd HH:mm:ss") : x; }); return o;
  })};
}
function grvDashText_(v,max) { return String(v==null?"":v).replace(/[<>]/g,"").slice(0,max); }
function grvDashJsonArray_(v) {
  if (Array.isArray(v)) return v.slice(0,30);
  const raw = String(v || "").trim();
  if (!raw) return [];
  try { const x = JSON.parse(raw); return Array.isArray(x) ? x.slice(0,30) : []; }
  catch (e) { return raw.split(/\s*\|\s*/).filter(Boolean).slice(0,30); }
}
