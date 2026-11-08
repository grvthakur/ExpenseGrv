/* Isolated GRV Developer Dashboard UI. Uses API_BASE from existing script.js. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let dataCache = null,
    busy = false;
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function pill(v) {
    const s = String(v || "unknown").toLowerCase(),
      k = [
        "critical",
        "high",
        "medium",
        "low",
        "error",
        "warning",
        "info",
      ].includes(s)
        ? s
        : "neutral";
    return `<span class="dev-pill ${k}">${esc(v || "Unknown")}</span>`;
  }
  function notice(s, bad) {
    const e = $("devDashboardNotice");
    if (e) {
      e.textContent = s;
      e.classList.toggle("is-error", !!bad);
    }
  }
  function list(a) {
    return Array.isArray(a) && a.length
      ? `<ul>${a.map((x) => `<li>${esc(typeof x === "string" ? x : JSON.stringify(x))}</li>`).join("")}</ul>`
      : '<p class="dev-muted">No items recorded.</p>';
  }
  function confidence(v) {
    return Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) + "%" : "—";
  }
  function renderAnalysis(a) {
    const h = $("devAnalysisBody");
    if (!a) {
      h.className = "dev-empty";
      h.textContent = "No analysis saved yet.";
      $("devAnalysisSeverity").textContent = "NOT RUN";
      return;
    }
    $("devAnalysisSeverity").innerHTML = pill(a.severity || a.status);
    h.className = "dev-rich-content";
    h.innerHTML = `<div class="dev-meta-row"><span>${esc(a.provider)}</span><span>${esc(a.createdAt)}</span><span>Confidence ${confidence(a.confidence)}</span></div><h4>Summary</h4><p>${esc(a.summary || "Not supplied")}</p><h4>Likely cause</h4><p>${esc(a.likelyCause || "Not established")}</p><h4>Evidence</h4>${list(a.evidence)}<h4>Recommended checks</h4>${list(a.recommendedChecks)}<h4>Suggested fix · Human review only</h4><p>${esc(a.suggestedFix || "Not supplied")}</p>`;
  }
  function renderSource(a) {
    const h = $("devSourceBody");
    if (!a) {
      h.className = "dev-empty";
      h.textContent = "No source analysis saved yet.";
      $("devSourceSeverity").textContent = "NOT RUN";
      return;
    }
    $("devSourceSeverity").innerHTML = pill(a.severity || a.status);
    const fs = Array.isArray(a.findings) ? a.findings : [];
    h.className = "dev-rich-content";
    h.innerHTML = `<div class="dev-meta-row"><span>${esc(a.repository)} / ${esc(a.branch)}</span><span>${esc(a.provider)}</span><span>${esc(a.createdAt)}</span></div><p>${esc(a.summary || "")}</p><div class="dev-source-stats"><b>${Number(a.fileCount) || 0} files reviewed</b><b>Confidence ${confidence(a.confidence)}</b><b>${fs.length} findings</b></div>${fs.length ? fs.map((f, i) => `<div class="dev-finding"><div>${pill(f.severity || f.priority || "review")} <b>${esc(f.id || "Finding " + (i + 1))} · ${esc(f.title || f.file || "Source finding")}</b></div><p>${esc(f.description || f.finding || f.message || "")}</p>${f.recommendation ? `<small>Recommendation: ${esc(f.recommendation)}</small>` : ""}</div>`).join("") : '<p class="dev-muted">No finding details stored.</p>'}`;
  }
  function renderIssues(rows) {
    const f = $("devIssueFilter")?.value || "all",
      items = (rows || []).filter((x) => {
        const s = String(x.status || "").toLowerCase(),
          v = String(x.severity || "").toLowerCase();
        if (f === "open") return !["closed", "resolved", "ignored"].includes(s);
        if (f === "closed")
          return ["closed", "resolved", "ignored"].includes(s);
        if (f === "high") return ["high", "critical"].includes(v);
        return true;
      });
    $("devIssuesBody").innerHTML = items.length
      ? items
          .map(
            (x) =>
              `<tr><td>${pill(x.severity)}</td><td><b>${esc(x.errorCode || x.eventType || "Issue")}</b><small>${esc(x.latestMessage)}</small></td><td>${esc(x.source)}<small>${esc(x.file)} ${esc(x.functionName)}</small></td><td class="dev-number">${Number(x.occurrences) || 0}</td><td>${esc(x.lastSeen)}</td><td>${pill(x.status)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="dev-empty">No issues match this filter.</td></tr>';
  }
  function renderEvents(rows) {
    $("devEventsBody").innerHTML =
      rows && rows.length
        ? rows
            .map(
              (x) =>
                `<tr><td>${esc(x.timestamp)}</td><td>${pill(x.severity)}</td><td>${esc(x.eventType)}</td><td>${esc(x.source)}</td><td>${esc(x.file)}<small>${esc(x.functionName)}</small></td><td class="dev-message">${esc(x.message)}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="6" class="dev-empty">No runtime events recorded.</td></tr>';
  }
  /* ── Learning fix helpers: suggest local-parser enhancement + mark Fixed ── */
  let lastChanges = [];
  const FIX_LS = "grvDevFixedLearning";
  const fixKey = (x) => [x.date, x.kind, x.field, x.suggested, x.approved].join("|");
  function fixedSet() {
    try { return JSON.parse(localStorage.getItem(FIX_LS) || "{}"); } catch (e) { return {}; }
  }
  function saveFixed(s) {
    try { localStorage.setItem(FIX_LS, JSON.stringify(s)); } catch (e) {}
  }
  let aiSrc = null;
  function loadSrc() {
    if (aiSrc !== null) return;
    aiSrc = "";
    fetch("ai-entry.js?t=" + Date.now()).then((r) => r.text()).then((t) => { aiSrc = t.toLowerCase(); if (lastD && lastD.events) renderLearning(lastD); }).catch(() => {});
  }
  function inCode(x) {
    const ap = String(x.approved || "").trim().toLowerCase();
    return ap.length >= 3 && aiSrc && aiSrc.includes(ap);
  }
  function isLearned(x) {
    const ap = String(x.approved || "").trim().toLowerCase();
    return (lastD.patterns || []).some(
      (p) => String(p.target || "").trim().toLowerCase() === ap,
    );
  }
  function fixCell(x, i) {
    if (fixedSet()[fixKey(x)]) return '<span class="dev-muted">✅ FIXED</span>';
    loadSrc();
    const st = inCode(x)
      ? '<span class="dev-muted" title="Approved value found in ai-entry.js (local parser)">📝 In code</span> '
      : isLearned(x)
      ? '<span class="dev-muted" title="Cloud AI already has this as a learned pattern">🧠 Learned</span> '
      : '<span class="dev-muted" title="Local parser not updated yet">⚠ Open</span> ';
    return st + `<button type="button" class="dev-btn dev-btn-ghost" data-fix-suggest="${i}"title="Suggest local-parser fix">💡 Fix</button> <button type="button" class="dev-btn dev-btn-ghost" data-fix-done="${i}"title="Mark as fixed">✓ Fixed</button>`;
  }
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function buildSuggestion(x) {
    const s = String(x.suggested || "").trim(), a = String(x.approved || "").trim();
    const generic = x.field === "description" && /^(txn|rs\.?|inr|upi|payment|debit)/i.test(s);
    const same = (lastChanges || []).filter((c) => c.field === x.field && c.kind === x.kind);
    const rel = same.slice(0, 8).map((c, n) => `  ${n + 1}. AI: "${c.suggested}"  →  User approved: "${c.approved}"  (${c.date})`).join("\n");
    return `ROLE
You are a senior engineer working on the GRV Expense Tracker (github.com/grvthakur/ExpenseGrv, branch main). It is a vanilla JS/HTML/CSS PWA on GitHub Pages with a Google Apps Script backend. Use read-only GitHub access and return changed files; do not push.

PROBLEM
The cloud AI parser produced a wrong "${x.field}" for a "${x.kind}" entry. The user corrected it, so the LOCAL parser (frontend/ai-entry.js -> localParse and the SMS/merchant helpers) should handle this case by itself without calling the cloud AI.
  AI suggested : "${s}"
  User approved: "${a}"
  Field        : ${x.field}
  Entry type   : ${x.kind}
  Logged at    : ${x.date}
${generic ? `  Note         : the suggested value is a generic transaction string (TXN / amount / UPI text), not a merchant. Never accept such text as a description; extract the merchant from the SMS instead.\n` : ""}
RELATED CORRECTIONS (same type + field, for pattern context)
${rel || "  (none)"}

PARSING.MD RULES (MANDATORY)
- Read parsing.md (repo root) FIRST. It documents the current parsing behaviour and the user's intended rules.
- Every change to ai-entry.js MUST follow those rules and MUST NOT break or contradict any of them. If a requested fix conflicts with a rule in parsing.md, do not apply it: report the conflict under "NEEDS INPUT".
- If your change adds or alters parsing behaviour (new rule, alias, guard, priority or fallback), also update parsing.md to match, in the same style, and include the updated parsing.md in the ZIP.

TASKS
1. First check whether ai-entry.js already handles this (search for "${a}" and for generic-text guards). If it already does, reply "ALREADY IMPLEMENTED" with the file/line and stop.
2. Otherwise make the smallest backward-compatible change in the local parser so the approved value is produced locally. Prefer a general rule over a one-off hardcode; use an alias/rule only if the value is user-specific.
3. Do not change financial calculations, stored data formats, existing field names or any other module.
4. Add or run a quick node test with several realistic inputs: the case above, 3+ similar inputs, and 3+ unrelated inputs that must stay unchanged. Run node --check on every edited file.

DELIVERABLE
- A ZIP of only the changed files (including parsing.md if it changed).
- A short report: root cause, what changed (file + function), tests run with results, and any risk.
- Keep it concise.`;
  }
  function buildAllPrompt() {
    const open = lastChanges.filter((x) => !fixedSet()[fixKey(x)] && !inCode(x));
    if (!open.length) return "No open corrections. Everything is marked Fixed or already found in ai-entry.js.";
    const groups = {};
    open.forEach((x) => ((groups[x.kind + " / " + x.field] = groups[x.kind + " / " + x.field] || []).push(x)));
    let n = 0;
    const body = Object.keys(groups).map((g) => `[${g}]\n` + groups[g].map((x) => `  ${++n}. AI: "${x.suggested}"  ->  Approved: "${x.approved}"  (${x.date})${isLearned(x) ? "  [cloud AI already learned]" : ""}`).join("\n")).join("\n\n");
    return `ROLE
You are a senior engineer on the GRV Expense Tracker (github.com/grvthakur/ExpenseGrv, branch main): vanilla JS/HTML/CSS PWA on GitHub Pages, Google Apps Script backend. Use read-only GitHub access and return changed files; do not push.

GOAL
The cloud AI parser made ${open.length} mistake(s) that the user corrected. Upgrade the LOCAL parser (frontend/ai-entry.js: localParse and the SMS/merchant/person/category helpers) so these are handled locally, without calling the cloud AI, and so SIMILAR future inputs work too. Fix ALL items below in ONE pass.

OPEN CORRECTIONS (grouped by entry type / field)
${body}

IMPORTANT LIMITS
- Raw SMS text is not stored (privacy). You only see the AI value and the approved value, so do not invent SMS formats. If an item cannot be solved reliably from this information, do not guess: list it under "NEEDS INPUT" with the exact extra example you need.

PARSING.MD RULES (MANDATORY)
- Read parsing.md (repo root) FIRST. It documents the current parsing behaviour and the user's intended rules.
- Every change to ai-entry.js MUST follow those rules and MUST NOT break or contradict any of them. If a requested fix conflicts with a rule in parsing.md, do not apply it: report the conflict under "NEEDS INPUT".
- If your change adds or alters parsing behaviour (new rule, alias, guard, priority or fallback), also update parsing.md to match, in the same style, and include the updated parsing.md in the ZIP.

METHOD
1. For each item first check whether ai-entry.js already handles it. Mark it ALREADY IMPLEMENTED (with file/line) and skip it.
2. Study all items together and find shared root causes (for example generic "TXN/amount/UPI" text accepted as a description, or a wrong field being reused). Fix each root cause with ONE general rule instead of one patch per item.
3. Anything that is only the user's personal preference (a person name, a card-to-person mapping, a custom remark) is a small alias/lookup entry, kept separate from the general rules and easy to edit.
4. Keep the change minimal and backward compatible. Do not touch financial calculations, stored data formats, existing field names or unrelated modules.

TESTS (run them, do not just describe them)
- A node test with at least one realistic input per item above, expecting the approved value.
- 3+ similar inputs per root cause to prove the rule generalizes.
- 5+ unrelated existing-style inputs that must produce exactly the same result as before (regression).
- node --check on every edited file.

DELIVERABLE
- A ZIP containing only the changed files (including parsing.md if it changed).
- A short report with a table: item # | status (FIXED / ALREADY IMPLEMENTED / NEEDS INPUT) | rule used (general or alias) | file + function.
- Then: root causes found, test results, risks. Keep it concise.`;
  }
  function addFixAllBtn() {
    if ($("devFixAllBtn")) return;
    const wrap = $("devLearningEventsBody")?.closest(".dev-table-wrap");
    if (!wrap) return;
    const b = document.createElement("button");
    b.id = "devFixAllBtn";
    b.type = "button";
    b.className = "dev-btn dev-btn-primary";
    b.style.margin = "0 0 10px";
    b.onclick = () => showFix(buildAllPrompt());
    wrap.parentNode.insertBefore(b, wrap);
  }
  function updFixAllBtn() {
    addFixAllBtn();
    const b = $("devFixAllBtn");
    if (!b) return;
    const n = lastChanges.filter((x) => !fixedSet()[fixKey(x)] && !inCode(x)).length;
    b.textContent = `✦ Fix all open (${n}) — one prompt`;
    b.disabled = !n;
  }
  function showFix(text) {
    let p = $("devFixPanel");
    if (!p) {
      p = document.createElement("div");
      p.id = "devFixPanel";
      p.className = "dev-panel";
      p.style.margin = "12px 0";
      p.innerHTML =
        '<div class="dev-panel-head"><h3>Prompt for Claude (copy &amp; send)</h3><button type="button" class="dev-btn dev-btn-ghost" id="devFixCopy">Copy</button> <button type="button" class="dev-btn dev-btn-ghost" id="devFixHide">✕</button></div><pre id="devFixText" style="white-space:pre-wrap;word-break:break-word;font-size:.75rem;margin:0"></pre>';
      const tbl = $("devLearningEventsBody").closest(".dev-table-wrap");
      tbl.parentNode.insertBefore(p, tbl);
      $("devFixCopy").onclick = () => {
        navigator.clipboard?.writeText($("devFixText").textContent);
        $("devFixCopy").textContent = "Copied ✓";
      };
      $("devFixHide").onclick = () => (p.style.display = "none");
    }
    $("devFixText").textContent = text;
    $("devFixCopy").textContent = "Copy";
    p.style.display = "";
    p.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const sb = e.target.closest("[data-fix-suggest]"),
      db = e.target.closest("[data-fix-done]");
    if (sb) showFix(buildSuggestion(lastChanges[+sb.dataset.fixSuggest]));
    if (db) {
      const x = lastChanges[+db.dataset.fixDone];
      const s = fixedSet();
      s[fixKey(x)] = 1;
      saveFixed(s);
      renderLearning(lastD);
    }
  });
  let lastD = {};
  function renderLearning(d) {
    lastD = d;
    try { if (d && !d._cached) localStorage.setItem("grvDevLearnCache", JSON.stringify(d)); } catch (e) {}
    const patterns = Array.isArray(d.patterns) ? d.patterns : [],
      events = Array.isArray(d.events) ? d.events : [];
    const pc = $("devLearningPatternCount"),
      ec = $("devLearningEventCount");
    if (pc) pc.textContent = patterns.length + " patterns";
    if (ec) ec.textContent = (d.counts?.events || 0) + " events";
    const pb = $("devLearningPatternsBody"),
      eb = $("devLearningEventsBody");
    if (pb)
      pb.innerHTML = patterns.length
        ? patterns
            .map(
              (x) =>
                `<tr><td>${esc(x.kind)}</td><td>${esc(x.source)}</td><td>${esc(x.target)}</td><td class="dev-number">${Number(x.count) || 0}</td><td>${confidence(x.confidence)}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="5" class="dev-empty">No learned patterns yet.</td></tr>';
    const changes = [];
    events.forEach((x) => {
      (x.corrections || []).forEach((c) =>
        changes.push({
          date: x.createdAt,
          kind: x.kind,
          field: c.field,
          suggested: c.suggested,
          approved: c.approved,
        }),
      );
    });
    lastChanges = changes;
    setTimeout(updFixAllBtn, 0);
    if (eb)
      eb.innerHTML = changes.length
        ? changes
            .map(
              (x, i) =>
                `<tr${fixedSet()[fixKey(x)] ? ' style="opacity:.55"' : ""}><td>${esc(x.date)}</td><td>${esc(x.kind)}</td><td>${esc(x.field)}</td><td>${esc(x.suggested)}</td><td><b>${esc(x.approved)}</b></td><td>${fixCell(x, i)}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="6" class="dev-empty">No user corrections recorded yet.</td></tr>';
  }
  async function refreshLearning() {
    try {
      const d = await request("devLearningReview");
      if (!d.enabled) throw Error("Learning is disabled");
      renderLearning(d);
    } catch (e) {
      const pb = $("devLearningPatternsBody"),
        eb = $("devLearningEventsBody");
      if (pb)
        pb.innerHTML = `<tr><td colspan="5" class="dev-empty">Learning review unavailable: ${esc(e.message)}</td></tr>`;
      if (eb)
        eb.innerHTML =
          '<tr><td colspan="5" class="dev-empty">Could not load learning history.</td></tr>';
    }
  }
  function renderHealth(d) {
    const summary = $("devHealthSummary"),
      body = $("devHealthChecksBody");
    if (!summary || !body) return;
    summary.innerHTML = `<span class="dev-health-state ${d.status === "healthy" ? "is-good" : "is-warn"}">${d.status === "healthy" ? "ALL CHECKS PASSED" : "ATTENTION REQUIRED"}</span><b>${Number(d.passed) || 0}/${Number(d.total) || 0} checks passed</b><small>Read-only check · ${esc(d.generatedAt || "")}</small>`;
    const groups = {};
    (d.checks || []).forEach((x) =>
      (groups[x.group || "Other"] || (groups[x.group || "Other"] = [])).push(x),
    );
    body.innerHTML = Object.keys(groups)
      .map(
        (group) =>
          `<tr class="dev-health-group"><td colspan="3">${esc(group)}</td></tr>` +
          groups[group]
            .map(
              (x) =>
                `<tr><td>${x.ok ? '<span class="dev-health-mark ok">✓</span>' : '<span class="dev-health-mark bad">!</span>'}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.detail)}</td></tr>`,
            )
            .join(""),
      )
      .join("");
  }
  async function refreshHealth() {
    const body = $("devHealthChecksBody");
    if (body)
      body.innerHTML =
        '<tr><td colspan="3" class="dev-empty">Checking system configuration…</td></tr>';
    try {
      renderHealth(await request("systemHealth"));
    } catch (e) {
      if (body)
        body.innerHTML = `<tr><td colspan="3" class="dev-empty">System health unavailable: ${esc(e.message)}</td></tr>`;
    }
  }
  function render(d) {
    dataCache = d;
    const c = d.counts || {};
    const lf = d.learningFeedback || {};
    $("devLearningEvents").textContent = Number(lf.events) || 0;
    $("devCorrectedEvents").textContent = Number(lf.correctedEvents) || 0;
    $("devCorrectedFields").textContent = Number(lf.correctedFields) || 0;
    $("devLearningStatus").textContent =
      lf.events == null ? "Unavailable" : "Active";
    $("devTotalEvents").textContent = Number(c.totalEvents) || 0;
    $("devOpenIssues").textContent = Number(c.openIssues) || 0;
    $("devCriticalIssues").textContent = Number(c.criticalIssues) || 0;
    $("devHighIssues").textContent = Number(c.highIssues) || 0;
    $("devLastUpdated").textContent =
      "Updated " + (d.generatedAt || "just now");
    renderAnalysis(d.latestAnalysis);
    renderSource(d.latestSourceAnalysis);
    renderIssues(d.issues || []);
    renderEvents(d.events || []);
    refreshLearning();
    refreshHealth();
  }
  async function request(action) {
    const r = await fetch(
      `${API_BASE}?action=${encodeURIComponent(action)}&_=${Date.now()}`,
      { method: "GET", cache: "no-store" },
    );
    if (!r.ok) throw Error("HTTP " + r.status);
    const d = await r.json();
    if (!d || d.ok !== true) throw Error(d?.error || "Request failed");
    return d;
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    const b = $("devRefreshBtn");
    if (b) {
      b.disabled = true;
      b.textContent = "↻ Loading…";
    }
    notice("Fetching read-only diagnostic data…");
    try {
      render(await request("devDashboard"));
      notice("Dashboard refreshed. No app or transaction data changed.");
    } catch (e) {
      notice(
        "Dashboard load failed: " +
          e.message +
          ". Check Apps Script route and deployment.",
        true,
      );
    } finally {
      busy = false;
      if (b) {
        b.disabled = false;
        b.textContent = "↻ Refresh";
      }
    }
  }
  async function analyze() {
    if (busy) return;
    if (
      !confirm(
        "Run AI analysis on latest diagnostic logs? This creates a DeveloperAnalysis row only; it does not change app code or transactions.",
      )
    )
      return;
    busy = true;
    const b = $("devAnalyzeBtn");
    if (b) {
      b.disabled = true;
      b.textContent = "✦ Analyzing…";
    }
    notice("Running log analysis…");
    try {
      const d = await request("devAnalyze");
      notice("Analysis saved. Refreshing dashboard…");
      busy = false;
      await refresh();
    } catch (e) {
      notice("Analysis failed: " + e.message, true);
    } finally {
      busy = false;
      if (b) {
        b.disabled = false;
        b.textContent = "✦ Run Log Analysis";
      }
    }
  }
  function init() {
    try { const c = JSON.parse(localStorage.getItem("grvDevLearnCache") || "null"); if (c) renderLearning({ ...c, _cached: 1 }); } catch (e) {}
    const t = $("tabDeveloper");

    if (t) {
      t.addEventListener("click", () => {
        const section = $("developerSection");
        const isOpen = !!section && section.style.display !== "none";

        if (typeof window.switchTab === "function") {
          window.switchTab(isOpen ? "expenses" : "developer");
        }

        if (!isOpen) refresh();
      });
    }
    $("devRefreshBtn")?.addEventListener("click", refresh);
    $("devAnalyzeBtn")?.addEventListener("click", analyze);
    $("devIssueFilter")?.addEventListener("change", () => {
      if (dataCache) renderIssues(dataCache.issues || []);
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
  window.grvDeveloperDashboardRefresh = refresh;
})();
