/* autocomplete.js — type-ahead suggestions for the add forms (Expenses, Credit Cards, Sweetie, Loans).
   Nothing is shown until you start typing; only matching earlier entries appear.
   Additive layer: reads existing arrays, changes no data or logic. Load AFTER script.js and loan.js. */
(function () {
  "use strict";
  var FIELDS = {
    expenseDesc: function () { return expenses.map(function (e) { return e.description; }); },
    cardUsedBy:  function () { return cardTxns.map(function (e) { return e.usedBy; }); },
    cardDesc:    function () { return cardTxns.map(function (e) { return e.description; }); },
    cardRemarks: function () { return cardTxns.map(function (e) { return e.remarks; }); },
    sweetieDesc: function () { return sweetieTxns.map(function (e) { return e.description; }); },
    lnP:         function () { return window.__lnNames || []; }
  };
  var MAX = 6;

  var css = document.createElement("style");
  css.textContent =
    ".ac-box{position:fixed;z-index:2147483000;display:none;max-height:240px;overflow-y:auto;padding:4px;border-radius:12px;" +
    "background:var(--card,var(--surface,#1c1c26));color:var(--text,#fff);border:1px solid var(--border,rgba(148,163,184,.3));box-shadow:0 10px 28px rgba(0,0,0,.45)}" +
    ".ac-item{display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:.9rem;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ac-item.ac-on,.ac-item:hover{background:rgba(167,139,250,.22)}.ac-item b{color:var(--accent,#22d3ee);font-weight:800}";
  document.head.appendChild(css);

  var box = document.createElement("div");
  box.className = "ac-box"; box.setAttribute("role", "listbox");
  document.body.appendChild(box);
  var cur = null, items = [], idx = -1;

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hide() { box.style.display = "none"; items = []; idx = -1; }
  function place() {
    if (!cur) return;
    var r = cur.getBoundingClientRect();
    box.style.left = r.left + "px"; box.style.width = r.width + "px";
    var below = innerHeight - r.bottom;
    if (below < 160 && r.top > below) { box.style.top = "auto"; box.style.bottom = (innerHeight - r.top + 4) + "px"; }
    else { box.style.bottom = "auto"; box.style.top = (r.bottom + 4) + "px"; }
  }
  function mark(on) {
    Array.prototype.forEach.call(box.children, function (c, i) { c.classList.toggle("ac-on", i === on); });
    idx = on;
  }
  function pick(v) {
    if (!cur) return;
    cur.value = v; hide();
    cur.dispatchEvent(new Event("input", { bubbles: true }));
    cur.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function suggest(input) {
    var q = input.value.trim().toLowerCase();
    if (!q) return hide();
    var cnt = {}, seen = {};
    try { FIELDS[input.id]().forEach(function (v) {
      v = String(v == null ? "" : v).trim(); if (!v) return;
      var k = v.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; if (!seen[k]) seen[k] = v;
    }); } catch (e) { return hide(); }
    var hits = Object.keys(seen).filter(function (k) { return k.indexOf(q) !== -1 && k !== q; });
    hits.sort(function (a, b) {
      return (a.indexOf(q) !== 0) - (b.indexOf(q) !== 0) || cnt[b] - cnt[a] || a.localeCompare(b);
    });
    hits = hits.slice(0, MAX);
    if (!hits.length) return hide();
    cur = input; items = hits.map(function (k) { return seen[k]; });
    box.innerHTML = "";
    items.forEach(function (v, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "ac-item"; b.setAttribute("role", "option");
      var p = v.toLowerCase().indexOf(q);
      b.innerHTML = esc(v.slice(0, p)) + "<b>" + esc(v.slice(p, p + q.length)) + "</b>" + esc(v.slice(p + q.length));
      b.addEventListener("mousedown", function (e) { e.preventDefault(); pick(v); });
      b.addEventListener("touchstart", function (e) { e.preventDefault(); pick(v); }, { passive: false });
      box.appendChild(b);
    });
    idx = -1; box.style.display = "block"; place();
  }

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.id && FIELDS[t.id] && e.isTrusted !== false) { cur = t; suggest(t); }
  });
  document.addEventListener("keydown", function (e) {
    if (box.style.display !== "block" || e.target !== cur) return;
    if (e.key === "ArrowDown") { e.preventDefault(); mark((idx + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mark((idx - 1 + items.length) % items.length); }
    else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); pick(items[idx]); }
    else if (e.key === "Escape" || e.key === "Tab") hide();
  }, true);
  document.addEventListener("focusout", function (e) { if (e.target === cur) setTimeout(hide, 120); });
  window.addEventListener("resize", hide);
  document.addEventListener("scroll", function (e) { if (box.style.display === "block" && !box.contains(e.target)) place(); }, true);
})();
