/**
 * GRV Developer Engine — Diagnostic Core v1
 * Additive module. Uses the existing GRV_AI_LEARNING_SPREADSHEET_ID
 * Script Property; does not modify transaction data or financial calculations.
 *
 * INSTALL:
 * 1) Add this file as developer-engine.gs in the Apps Script project.
 * 2) In code.gs doGet(), immediately after the existing aiHandle() dispatch:
 *      const _dev = grvDevHandle(action, e);
 *      if (_dev) return _dev;
 * 3) Run grvDevSetup() once from Apps Script editor.
 *
 * SECURITY:
 * - Accepts only a small allow-list of diagnostic fields.
 * - Never accepts raw SMS, bank account/card numbers, API keys, or transaction amounts.
 * - Event logging is best-effort and must never block expense operations.
 */

const GRV_DEV_VERSION = "1.0.0";
const GRV_DEV_EVENTS_SHEET = "DeveloperEvents";
const GRV_DEV_ISSUES_SHEET = "DeveloperIssues";

function grvDevHandle(action, e) {
  if (action !== "devLog") return null;

  try {
    const p = (e && e.parameter) || {};
    const event = grvDevNormalizeEvent_(p);
    grvDevRecordEvent_(event);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, accepted: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Diagnostics must fail open: never interfere with the expense tracker.
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "diagnostic_unavailable" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function grvDevSetup() {
  const ss = grvDevSpreadsheet_();
  grvDevEnsureSheet_(ss, GRV_DEV_EVENTS_SHEET, [
    "Timestamp", "EventId", "Fingerprint", "EventType", "Source",
    "Severity", "File", "Function", "ErrorCode", "Message",
    "AppVersion", "Environment", "Count"
  ]);
  grvDevEnsureSheet_(ss, GRV_DEV_ISSUES_SHEET, [
    "Fingerprint", "FirstSeen", "LastSeen", "Occurrences",
    "Status", "Severity", "EventType", "Source", "File",
    "Function", "ErrorCode", "LatestMessage", "SuggestedNextStep"
  ]);
  return "GRV Developer Engine setup complete: DeveloperEvents + DeveloperIssues";
}

function grvDevTest() {
  const testId = "setup-test-" + Utilities.getUuid();
  grvDevRecordEvent_({
    timestamp: new Date(),
    eventId: testId,
    fingerprint: "grv-dev-setup-test",
    eventType: "diagnostic_test",
    source: "manual_setup",
    severity: "info",
    file: "developer-engine.gs",
    functionName: "grvDevTest",
    errorCode: "TEST_ONLY",
    message: "Diagnostic pipeline connectivity test (no transaction data).",
    appVersion: GRV_DEV_VERSION,
    environment: "test"
  });
  return "Test event written. Check DeveloperEvents and DeveloperIssues.";
}

function grvDevSpreadsheet_() {
  const id = PropertiesService.getScriptProperties()
    .getProperty("GRV_AI_LEARNING_SPREADSHEET_ID");
  if (!id) throw new Error("Missing GRV_AI_LEARNING_SPREADSHEET_ID");
  return SpreadsheetApp.openById(id);
}

function grvDevEnsureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function grvDevNormalizeEvent_(p) {
  const pick = (key, max) => String(p[key] || "").trim().slice(0, max);
  const eventType = pick("eventType", 48) || "unknown";
  const source = pick("source", 48) || "app";
  const severityRaw = pick("severity", 12).toLowerCase();
  const severity = ["info", "warning", "error", "critical"].includes(severityRaw)
    ? severityRaw : "warning";
  const file = grvDevSafeIdentifier_(pick("file", 80));
  const functionName = grvDevSafeIdentifier_(pick("function", 80));
  const errorCode = grvDevSafeIdentifier_(pick("errorCode", 60));
  const message = grvDevSanitizeMessage_(pick("message", 240));
  const appVersion = grvDevSafeIdentifier_(pick("appVersion", 32));
  const environment = grvDevSafeIdentifier_(pick("environment", 24)) || "production";
  const fingerprintInput = [
    eventType, source, file, functionName, errorCode,
    message.toLowerCase().replace(/\b\d+\b/g, "#")
  ].join("|");
  const suppliedFingerprint = grvDevSafeIdentifier_(pick("fingerprint", 100));
  const fingerprint = suppliedFingerprint || Utilities
    .computeDigest(Utilities.DigestAlgorithm.SHA_256, fingerprintInput)
    .map(b => ("0" + ((b + 256) % 256).toString(16)).slice(-2)).join("").slice(0, 32);

  return {
    timestamp: new Date(),
    eventId: Utilities.getUuid(),
    fingerprint: fingerprint,
    eventType: eventType,
    source: source,
    severity: severity,
    file: file,
    functionName: functionName,
    errorCode: errorCode,
    message: message,
    appVersion: appVersion,
    environment: environment
  };
}

function grvDevSafeIdentifier_(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_.:/-]/g, "")
    .slice(0, 100);
}

function grvDevSanitizeMessage_(value) {
  let s = String(value || "");
  // Redact likely card/account identifiers and long numeric references.
  s = s.replace(/\b(?:\d[ -]?){12,19}\b/g, "[REDACTED_NUMBER]");
  s = s.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  s = s.replace(/(?:api[_ -]?key|token|authorization|password)\s*[:=]\s*\S+/gi, "[REDACTED_SECRET]");
  // Do not permit arbitrary pasted payloads to be stored as diagnostic messages.
  s = s.replace(/https?:\/\/\S+/gi, "[URL]");
  return s.slice(0, 240);
}

function grvDevRecordEvent_(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const ss = grvDevSpreadsheet_();
    const events = grvDevEnsureSheet_(ss, GRV_DEV_EVENTS_SHEET, [
      "Timestamp", "EventId", "Fingerprint", "EventType", "Source",
      "Severity", "File", "Function", "ErrorCode", "Message",
      "AppVersion", "Environment", "Count"
    ]);
    const issues = grvDevEnsureSheet_(ss, GRV_DEV_ISSUES_SHEET, [
      "Fingerprint", "FirstSeen", "LastSeen", "Occurrences",
      "Status", "Severity", "EventType", "Source", "File",
      "Function", "ErrorCode", "LatestMessage", "SuggestedNextStep"
    ]);

    events.appendRow([
      event.timestamp, event.eventId, event.fingerprint, event.eventType,
      event.source, event.severity, event.file, event.functionName,
      event.errorCode, event.message, event.appVersion,
      event.environment, 1
    ]);
    grvDevUpsertIssue_(issues, event);
  } finally {
    lock.releaseLock();
  }
}

function grvDevUpsertIssue_(sheet, event) {
  const last = sheet.getLastRow();
  const fingerprints = last > 1
    ? sheet.getRange(2, 1, last - 1, 1).getValues().flat()
    : [];
  const index = fingerprints.indexOf(event.fingerprint);
  const now = event.timestamp;
  if (index < 0) {
    sheet.appendRow([
      event.fingerprint, now, now, 1, "Open", event.severity,
      event.eventType, event.source, event.file, event.functionName,
      event.errorCode, event.message,
      "Review latest code and reproduce with a sanitized test case."
    ]);
    return;
  }
  const row = index + 2;
  const count = Number(sheet.getRange(row, 4).getValue()) || 0;
  sheet.getRange(row, 3, 1, 1).setValue(now);
  sheet.getRange(row, 4, 1, 1).setValue(count + 1);
  sheet.getRange(row, 6, 1, 7).setValues([[
    event.severity, event.eventType, event.source, event.file,
    event.functionName, event.errorCode, event.message
  ]]);
}

function grvDevLogClientEvent(event) {
  // Helper for future frontend integration. Keep payloads to diagnostic metadata.
  const base = PropertiesService.getScriptProperties().getProperty("GRV_DEV_LOG_ENDPOINT");
  if (!base) return false;
  const query = Object.keys(event || {})
    .filter(k => ["eventType","source","severity","file","function","errorCode","message","appVersion","environment","fingerprint"].includes(k))
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(String(event[k] || "")))
    .join("&");
  try {
    UrlFetchApp.fetch(base + (base.indexOf("?") >= 0 ? "&" : "?") + "action=devLog&" + query, {
      muteHttpExceptions: true
    });
    return true;
  } catch (err) {
    return false;
  }
}
