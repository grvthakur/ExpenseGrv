/* table-density.js — desktop-only "View Density" per table. Saved default is applied by the tiny
   inline <head> script before first paint (no flicker); this file only adds the dropdown. */
(function () {
  "use strict";
  var DESK = window.matchMedia("(min-width:1024px)");
  var OPTS = [["normal", "Normal"], ["comfortable", "Comfortable"], ["compact", "Compact"], ["dense", "Dense"], ["ultra", "Ultra Dense"]];
  var PAGES = [
    { key: "exp", table: "expenseTable", anchor: function () { return document.getElementById("expSearchBox"); }, where: "before" },
    { key: "cards", table: "cardTable", menu: "cards" },
    { key: "grvcc", table: "grvCardTable", menu: "grvcc" },
    { key: "sweetie", table: "sweetieTable", menu: "sweetie" }
  ];
  var H = document.documentElement;
  function saved(k) { try { return localStorage.getItem("grvDensity_" + k) || "normal"; } catch (e) { return "normal"; } }
  function save(k, v) { try { v === "normal" ? localStorage.removeItem("grvDensity_" + k) : localStorage.setItem("grvDensity_" + k, v); } catch (e) {} }
  function view(k, v) {
    v === "normal" ? H.removeAttribute("data-d-" + k) : H.setAttribute("data-d-" + k, v);
  }

  function build(pg) {
    var t = document.getElementById(pg.table); if (!t || t.dataset.densInit) return;
    var anchor, mode = pg.where || "after";
    if (pg.menu) {
      var b = document.querySelector("[onclick*=\"toggleExportMenu('" + pg.menu + "')\"]");
      anchor = b && b.parentNode; mode = "after";
    } else anchor = pg.anchor();
    if (!anchor) return;
    var cur = H.getAttribute("data-d-" + pg.key) || "normal";
    var w = document.createElement("label"); w.className = "grv-dens"; w.appendChild(document.createTextNode("View Density"));
    var s = document.createElement("select"); s.title = "View Density";
    var LIST = OPTS;
    LIST.forEach(function (o) { var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; s.appendChild(e); });
    var sep = document.createElement("option"); sep.disabled = true; sep.textContent = "──────────"; s.appendChild(sep);
    [["__set", "★ Set Current View as Default"], ["__reset", "↺ Reset to Normal"]].forEach(function (o) { var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; s.appendChild(e); });
    s.value = cur;
    function stars() { var d = saved(pg.key); [].forEach.call(s.options, function (e, i) { if (i < LIST.length) e.textContent = LIST[i][1] + (d === LIST[i][0] && d !== "normal" ? " ★" : ""); }); }
    stars();
    s.addEventListener("change", function () {
      var v = s.value;
      if (v === "__set") { save(pg.key, cur); stars(); s.value = cur; return; }
      if (v === "__reset") { save(pg.key, "normal"); cur = "normal"; view(pg.key, cur); stars(); s.value = cur; return; }
      cur = v; view(pg.key, cur);
    });
    w.appendChild(s);
    // Custom styled dropdown on top of the (hidden) <select>, which stays the source of truth.
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "dens-btn";
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    function label() { var d = saved(pg.key); for (var i = 0; i < LIST.length; i++) if (LIST[i][0] === cur) return LIST[i][1] + (d === cur && d !== "normal" ? " ★" : ""); return "Normal"; }
    function paint() { btn.innerHTML = "<span class=\"dens-cur\"></span><svg width=\"10\" height=\"6\" viewBox=\"0 0 10 6\"><path d=\"M1 1l4 4 4-4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>"; btn.firstChild.textContent = label(); }
    paint();
    var menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", esc, true); window.removeEventListener("scroll", closeMenu, true); window.removeEventListener("resize", closeMenu); } }
    function outside(e) { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); }
    function esc(e) { if (e.key === "Escape") closeMenu(); }
    function pick(v) {
      closeMenu(); s.value = v; s.dispatchEvent(new Event("change")); paint();
    }
    btn.addEventListener("click", function () {
      if (menu) return closeMenu();
      var d = saved(pg.key);
      menu = document.createElement("div"); menu.className = "dens-menu"; menu.setAttribute("role", "listbox");
      LIST.forEach(function (o) {
        var it = document.createElement("button"); it.type = "button"; it.className = "dens-item" + (o[0] === cur ? " on" : "");
        it.setAttribute("role", "option");
        it.innerHTML = "<i></i><span></span><em></em>";
        it.children[1].textContent = o[1]; it.children[2].textContent = d === o[0] && d !== "normal" ? "★ default" : "";
        it.addEventListener("click", function () { pick(o[0]); });
        menu.appendChild(it);
      });
      var hr = document.createElement("div"); hr.className = "dens-sep"; menu.appendChild(hr);
      [["__set", "★  Set current view as default"], ["__reset", "↺  Reset to Normal"]].forEach(function (o) {
        var it = document.createElement("button"); it.type = "button"; it.className = "dens-item dens-act"; it.textContent = o[1];
        it.addEventListener("click", function () { pick(o[0]); });
        menu.appendChild(it);
      });
      document.body.appendChild(menu);
      var r = btn.getBoundingClientRect(), mw = Math.max(r.width, 210), mh = menu.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
      var top = r.bottom + 6; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
      menu.style.minWidth = mw + "px"; menu.style.left = left + "px"; menu.style.top = top + "px";
      btn.setAttribute("aria-expanded", "true");
      document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", esc, true);
      window.addEventListener("scroll", closeMenu, true); window.addEventListener("resize", closeMenu);
    });
    w.appendChild(btn);
    anchor.parentNode.insertBefore(w, mode === "before" ? anchor : anchor.nextSibling);
    t.dataset.densInit = "1";
  }
  // iPhone/iOS shows an EMPTY date input as a blank box. Mark the filter date inputs so CSS can
  // paint a "dd-mm-yyyy" hint while they are empty (:invalid works because they are `required`).
  function datePlaceholders() {
    document.querySelectorAll(".table-header input[type='date'], .grv-date-input").forEach(function (i) {
      if (i.dataset.ph) return;
      i.dataset.ph = "dd-mm-yyyy";
      i.required = true;
    });
  }
  function init() { PAGES.forEach(build); datePlaceholders(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
