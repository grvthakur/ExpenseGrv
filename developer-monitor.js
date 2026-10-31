/* GRV Developer Engine — Frontend Monitor v1.0.0
 * Passive diagnostics only. No transaction payloads, amounts, SMS, card data,
 * localStorage contents, stack traces, or request bodies are transmitted.
 * Uses the existing Apps Script Web App GET route: action=devLog.
 */
(function (window, document) {
  "use strict";

  var script = document.currentScript;
  var endpoint = (script && script.getAttribute("data-endpoint")) || "";
  var APP_VERSION = "frontend-monitor-1.0.0";
  var recent = Object.create(null);
  var sentThisMinute = 0;
  var minuteStarted = Date.now();
  var MAX_PER_MINUTE = 10;
  var DEDUPE_MS = 60000;

  function clean(value, max) {
    var s = String(value == null ? "" : value);
    s = s.replace(/https?:\/\/\S+/gi, "[URL]");
    s = s.replace(/\b(?:\d[ -]?){12,19}\b/g, "[REDACTED_NUMBER]");
    s = s.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
    s = s.replace(/(?:api[_ -]?key|token|authorization|password)\s*[:=]\s*\S+/gi, "[REDACTED_SECRET]");
    return s.replace(/\s+/g, " ").trim().slice(0, max || 180);
  }

  function fingerprint(type, source, message) {
    var raw = [type, source, message.toLowerCase()].join("|");
    var hash = 2166136261;
    for (var i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "fe-" + (hash >>> 0).toString(16);
  }

  function report(input) {
    try {
      if (!endpoint || typeof fetch !== "function") return false;

      var now = Date.now();
      if (now - minuteStarted >= 60000) {
        minuteStarted = now;
        sentThisMinute = 0;
      }
      if (sentThisMinute >= MAX_PER_MINUTE) return false;

      var type = clean(input && input.eventType || "javascript_error", 48);
      var source = clean(input && input.source || "window", 48);
      var message = clean(input && input.message || "Unspecified frontend error", 180);
      if (!message) message = "Unspecified frontend error";

      var fp = fingerprint(type, source, message);
      if (recent[fp] && now - recent[fp] < DEDUPE_MS) return false;
      recent[fp] = now;

      // Keep the dedupe map bounded.
      Object.keys(recent).forEach(function (key) {
        if (now - recent[key] > DEDUPE_MS) delete recent[key];
      });

      var params = new URLSearchParams({
        action: "devLog",
        eventType: type,
        source: source,
        severity: "error",
        file: clean(input && input.file || "frontend", 80),
        function: clean(input && input.functionName || "", 80),
        errorCode: clean(input && input.errorCode || "CLIENT_ERROR", 60),
        message: message,
        appVersion: APP_VERSION,
        environment: "production",
        fingerprint: fp
      });

      sentThisMinute++;
      fetch(endpoint + (endpoint.indexOf("?") >= 0 ? "&" : "?") + params.toString(), {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        keepalive: true
      }).catch(function () {
        // Diagnostics must never interfere with the Expense Tracker.
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Public, opt-in hook for app modules (AI parser, feature-level catches).
  window.grvDevReport = report;

  window.addEventListener("error", function (event) {
    // Ignore resource-load errors here; report only actual JS exceptions.
    if (!event || !event.message) return;
    report({
      eventType: "javascript_error",
      source: "window.onerror",
      message: event.message,
      file: event.filename ? event.filename.split("/").pop() : "unknown",
      errorCode: event.error && event.error.name || "UNCAUGHT_ERROR"
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var message = reason && reason.message ? reason.message :
      (typeof reason === "string" ? reason : "Unhandled promise rejection");
    report({
      eventType: "unhandled_rejection",
      source: "window.unhandledrejection",
      message: message,
      errorCode: reason && reason.name || "UNHANDLED_REJECTION"
    });
  });
})(window, document);
