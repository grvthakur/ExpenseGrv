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
    anchor.parentNode.insertBefore(w, mode === "before" ? anchor : anchor.nextSibling);
    t.dataset.densInit = "1";
  }
  function init() { PAGES.forEach(build); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
