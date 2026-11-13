/* premium-select.js — premium popup for every native <select> (phone: bottom sheet, desktop: floating panel).
   The native <select> stays in the page as the source of truth (value, options, onchange, app logic untouched);
   we only replace the OS popup. Selects handled by dropdown.js (.et-cd-native) are skipped. */
(function () {
  "use strict";
  var panel = null, backdrop = null, cur = null, act = -1, rows = [], touch = null;
  var SKIP = ".et-cd-native, .et-cd-host select, .et-ps-skip";
  function ok(s) { return s && s.tagName === "SELECT" && !s.multiple && !(s.size > 1) && !s.disabled && !s.matches(SKIP); }
  function sheet() { return window.matchMedia("(max-width: 768px)").matches; }
  function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }

  function items(s) {
    var out = [], i = 0;
    [].forEach.call(s.children, function (c) {
      if (c.tagName === "OPTGROUP") {
        out.push({ g: c.label });
        [].forEach.call(c.children, function (o) { out.push({ o: o, i: [].indexOf.call(s.options, o) }); });
      } else if (c.tagName === "OPTION") out.push({ o: c, i: i });
      i++;
    });
    return out.filter(function (x) { return x.g !== undefined || !x.o.hidden; });
  }
  function title(s) {
    var l = s.getAttribute("aria-label") || s.title || (s.id && (document.querySelector('label[for="' + s.id + '"]') || {}).textContent) || "";
    if (!l) { var p = s.closest(".field, label"); var t = p && p.querySelector("label, .lbl, span"); l = t && t !== s ? t.textContent : ""; }
    return (l || "Select").replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function close() {
    if (!panel) return;
    if (cur) cur.setAttribute("aria-expanded", "false");
    var p = panel, b = backdrop; panel = backdrop = cur = null;
    p.classList.remove("is-open"); if (b) b.classList.remove("is-open");
    setTimeout(function () { p.remove(); b && b.remove(); }, 160);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", close); window.removeEventListener("scroll", onScroll, true);
  }
  function onScroll(e) { if (panel && !panel.contains(e.target)) close(); }
  function pick(s, idx) {
    if (s.selectedIndex !== idx) {
      s.selectedIndex = idx;
      s.dispatchEvent(new Event("input", { bubbles: true }));
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
  }
  function setAct(n, scroll) {
    if (!rows.length) return;
    act = Math.max(0, Math.min(rows.length - 1, n));
    rows.forEach(function (r, k) { r.el.classList.toggle("is-act", k === act); });
    if (scroll !== false) rows[act].el.scrollIntoView({ block: "nearest" });
  }
  function onKey(e) {
    if (!panel) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); var s = cur; close(); s && s.focus({ preventScroll: true }); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setAct(act + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct(act - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (rows[act]) pick(cur, rows[act].idx); }
    else if (e.key === "Tab") close();
  }

  function open(s) {
    if (cur === s) { close(); return; }
    close();
    var its = items(s), many = its.filter(function (x) { return x.o; }).length > 12;
    var isSheet = sheet();
    backdrop = document.createElement("div"); backdrop.className = "et-ps-backdrop" + (isSheet ? " is-sheet" : "");
    panel = document.createElement("div"); panel.className = "et-ps-panel" + (isSheet ? " is-sheet" : "");
    panel.setAttribute("role", "listbox");
    var h = "";
    if (isSheet) h += '<div class="et-ps-grab"></div><div class="et-ps-title">' + esc(title(s)) + "</div>";
    if (many) h += '<div class="et-ps-search"><span>⌕</span><input type="search" placeholder="Search…" autocomplete="off"></div>';
    h += '<div class="et-ps-list"></div>';
    panel.innerHTML = h;
    var list = panel.querySelector(".et-ps-list");
    function render(q) {
      list.innerHTML = ""; rows = []; q = (q || "").toLowerCase();
      its.forEach(function (x) {
        if (x.g !== undefined) { var g = document.createElement("div"); g.className = "et-ps-group"; g.textContent = x.g; list.appendChild(g); return; }
        var t = x.o.textContent.trim();
        if (q && t.toLowerCase().indexOf(q) < 0) return;
        var el = document.createElement("div");
        el.className = "et-ps-opt" + (x.i === s.selectedIndex ? " is-sel" : "") + (x.o.disabled ? " is-dis" : "");
        el.setAttribute("role", "option");
        el.innerHTML = '<span class="et-ps-txt">' + esc(t || "—") + '</span><svg class="et-ps-chk" viewBox="0 0 16 16" width="14" height="14"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        if (!x.o.disabled) {
          el.addEventListener("click", function (e) { e.stopPropagation(); pick(s, x.i); });
          el.addEventListener("mousemove", function () { var k = rows.findIndex(function (r) { return r.el === el; }); if (k !== act) setAct(k, false); });
        }
        list.appendChild(el); rows.push({ el: el, idx: x.i, dis: x.o.disabled });
      });
      rows = rows.filter(function (r) { return !r.dis; });
      if (!rows.length) { list.innerHTML = '<div class="et-ps-empty">No matching options</div>'; act = -1; return; }
      var si = rows.findIndex(function (r) { return r.idx === s.selectedIndex; });
      setAct(si >= 0 ? si : 0);
    }
    render("");
    var inp = panel.querySelector("input");
    if (inp) inp.addEventListener("input", function () { render(inp.value); });
    document.body.appendChild(backdrop); document.body.appendChild(panel);
    cur = s; s.setAttribute("aria-expanded", "true");
    backdrop.addEventListener("mousedown", function (e) { e.preventDefault(); close(); });
    backdrop.addEventListener("touchend", function (e) { e.preventDefault(); close(); }, { passive: false });
    panel.addEventListener("mousedown", function (e) { if (e.target !== inp) e.preventDefault(); });
    if (!isSheet) {
      var r = s.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
      panel.style.minWidth = Math.max(r.width, 170) + "px";
      var below = vh - r.bottom - 12, above = r.top - 12, up = below < 240 && above > below;
      panel.style.maxHeight = Math.max(160, Math.min(380, up ? above : below)) + "px";
      var w = panel.offsetWidth, left = Math.min(Math.max(8, r.left), vw - w - 8);
      panel.style.left = left + "px";
      if (up) { panel.style.bottom = (vh - r.top + 6) + "px"; panel.classList.add("is-up"); } else panel.style.top = (r.bottom + 6) + "px";
      window.addEventListener("scroll", onScroll, true);
    }
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey, true);
    requestAnimationFrame(function () { panel && panel.classList.add("is-open"); backdrop && backdrop.classList.add("is-open"); if (inp && !isSheet) inp.focus({ preventScroll: true }); });
  }

  document.addEventListener("mousedown", function (e) { var s = e.target.closest && e.target.closest("select"); if (ok(s)) e.preventDefault(); }, true);
  document.addEventListener("click", function (e) { var s = e.target.closest && e.target.closest("select"); if (ok(s)) { e.preventDefault(); e.stopPropagation(); open(s); } }, true);
  document.addEventListener("touchstart", function (e) { var t = e.touches[0]; touch = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  document.addEventListener("touchend", function (e) {
    var s = e.target.closest && e.target.closest("select"); if (!ok(s) || !touch) return;
    var t = e.changedTouches[0]; if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) return;
    e.preventDefault(); e.stopPropagation(); open(s);
  }, { capture: true, passive: false });
  document.addEventListener("keydown", function (e) {
    var s = e.target; if (!ok(s) || panel) return;
    if (e.key === "Enter" || e.key === " " || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); open(s); }
  }, true);
})();
