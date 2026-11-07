/* autocomplete.js — suggests earlier names/descriptions in the add forms (all tabs).
   Pure additive layer: native <datalist>, reads existing arrays, changes no data or logic.
   Load AFTER script.js. */
(function () {
  "use strict";
  var FIELDS = [
    { id: "expenseDesc",  src: function () { return expenses.map(function (e) { return e.description; }); } },
    { id: "cardUsedBy",   src: function () { return cardTxns.map(function (e) { return e.usedBy; }); } },
    { id: "cardDesc",     src: function () { return cardTxns.map(function (e) { return e.description; }); } },
    { id: "cardRemarks",  src: function () { return cardTxns.map(function (e) { return e.remarks; }); } },
    { id: "sweetieDesc",  src: function () { return sweetieTxns.map(function (e) { return e.description; }); } }
  ];
  function fill(f, input, dl) {
    var list = [];
    try { list = f.src(); } catch (e) { return; }
    var seen = {}, cnt = {};
    list.forEach(function (v) {
      v = String(v == null ? "" : v).trim();
      if (!v) return;
      var k = v.toLowerCase();
      cnt[k] = (cnt[k] || 0) + 1;
      if (!seen[k]) seen[k] = v;
    });
    var keys = Object.keys(seen).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b); }).slice(0, 60);
    dl.innerHTML = "";
    keys.forEach(function (k) { var o = document.createElement("option"); o.value = seen[k]; dl.appendChild(o); });
  }
  FIELDS.forEach(function (f) {
    var input = document.getElementById(f.id);
    if (!input) return;
    var dl = document.createElement("datalist");
    dl.id = f.id + "_suggest";
    document.body.appendChild(dl);
    input.setAttribute("list", dl.id);
    input.setAttribute("autocomplete", "off");
    input.addEventListener("focus", function () { fill(f, input, dl); });
  });
})();
