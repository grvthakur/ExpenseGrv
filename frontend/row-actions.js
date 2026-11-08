/* row-actions.js — mobile row actions (additive layer, loads AFTER script.js).
   Long-press (450ms) or the ⋮ button opens a bottom sheet: Update / Clone / Delete.
   Delete on mobile skips the confirm popup and shows a 5s Undo toast instead.
   Also adds date group headers + category dots (phones only).
   Touches no business logic: Update/Clone click the row's existing buttons. */
(function () {
  "use strict";
  var HOLD_MS = 450, MOVE_PX = 8;

  var css = document.createElement("style");
  css.textContent = [
    "#expenseTable .ra-row .edit-btn,#expenseTable .ra-row .clone-btn,#expenseTable .ra-row .delete-btn,#cardTable .ra-row .edit-btn,#cardTable .ra-row .clone-btn,#cardTable .ra-row .delete-btn,#sweetieTable .ra-row .edit-btn,#sweetieTable .ra-row .clone-btn,#sweetieTable .ra-row .delete-btn{display:none!important}",
    ".ra-more{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:0;background:transparent;padding:0;cursor:pointer;vertical-align:middle;-webkit-tap-highlight-color:transparent}",
    ".ra-more::before{content:\"⋮\";display:flex;align-items:center;justify-content:center;width:30px;height:26px;border-radius:8px;font-size:1.05rem;font-weight:800;line-height:1;color:var(--accent,#a78bfa);background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.45)}",
    ".ra-more:active::before{background:rgba(167,139,250,.32)}",
    ".ra-row{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}",
    ".ra-row.ra-holding td{background:rgba(167,139,250,.18)!important;transition:background .45s linear}",
    ".ra-ov{position:fixed;inset:0;z-index:29000;background:rgba(0,0,0,.45)}",
    ".ra-sheet{position:fixed;left:0;right:0;bottom:0;z-index:29001;background:var(--card,#1c1c26);color:var(--text,#fff);border-radius:18px 18px 0 0;padding:12px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.4);transform:translateY(100%);transition:transform .2s ease}",
    ".ra-sheet.ra-in{transform:none}",
    ".ra-sheet h4{margin:4px 0 12px;font-size:.95rem;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".ra-sheet button{display:block;width:100%;min-height:48px;margin:6px 0;border:1px solid rgba(148,163,184,.25);border-radius:12px;background:transparent;color:inherit;font:600 1rem inherit;cursor:pointer}",
    ".ra-sheet .ra-del{color:#f87171;border-color:rgba(248,113,113,.5);margin-top:16px}",
    "@media (min-width:761px){.ra-pop-ov{background:transparent}.ra-sheet.ra-pop{left:auto;right:auto;bottom:auto;width:220px;padding:8px;border-radius:12px;border:1px solid rgba(148,163,184,.25);box-shadow:0 10px 30px rgba(0,0,0,.45);transform:scale(.96);opacity:0;transform-origin:top right;transition:opacity .12s,transform .12s}.ra-sheet.ra-pop.ra-in{transform:none;opacity:1}.ra-sheet.ra-pop h4{font-size:.78rem;margin:2px 0 6px;opacity:.8}.ra-sheet.ra-pop button{min-height:38px;margin:4px 0;font-size:.85rem;text-align:left;padding:0 12px}.ra-sheet.ra-pop .ra-del{margin-top:8px}.ra-sheet.ra-pop button{transition:background .12s,border-color .12s,transform .12s,box-shadow .12s;cursor:pointer}.ra-sheet.ra-pop button:hover,.ra-sheet.ra-pop button:focus-visible{background:rgba(167,139,250,.18);border-color:rgba(167,139,250,.65);transform:translateX(3px);box-shadow:0 0 0 1px rgba(167,139,250,.25);outline:none}.ra-sheet.ra-pop .ra-del:hover,.ra-sheet.ra-pop .ra-del:focus-visible{background:rgba(248,113,113,.18);border-color:rgba(248,113,113,.9);box-shadow:0 0 0 1px rgba(248,113,113,.3)}.ra-sheet.ra-pop button:active{transform:scale(.98)}}",
    "@media (prefers-reduced-motion:reduce){.ra-sheet,.ra-row.ra-holding td{transition:none}}"
  ].join("\n");
  document.head.appendChild(css);

  var TABLES = [
    { id: "expenseTable", del: "deleteEntry", list: function () { return expenses; }, rerender: "render",
      sum: [2, 3], dateCol: function () { return expSort.col === "date"; },
      add: function (e) { return "action=add&id=" + e.id + "&date=" + e.date + "&month=" + enc(e.month) + "&category=" + enc(e.category) + "&description=" + enc(e.description) + "&amount=" + e.amount; } },
    { id: "cardTable", del: "deleteCardEntry", list: function () { return cardTxns; }, rerender: "renderCards",
      sum: [3, 5], dateCol: function () { return cardSort.col === "txnDate"; },
      add: function (e) { return "action=addCard&id=" + e.id + "&card=" + enc(e.card) + "&usedBy=" + enc(e.usedBy) + "&description=" + enc(e.description) + "&txnDate=" + enc(e.txnDate) + "&remarks=" + enc(e.remarks) + "&amount=" + e.amount + "&status=" + enc(e.status) + "&billingMonth=" + enc(e.billingMonth); } },
    { id: "sweetieTable", del: "deleteSweetieEntry", list: function () { return sweetieTxns; }, rerender: "renderSweetie",
      sum: [4, 2], dateCol: function () { return sweetieSort.col === "date"; },
      add: function (e) { return "action=addSweetie&id=" + e.id + "&type=" + enc(e.type) + "&amount=" + e.amount + "&date=" + enc(e.date) + "&description=" + enc(e.description); } }
  ];

  function enhance(cfg) {
    var tb = document.querySelector("#" + cfg.id + " tbody");
    if (!tb) return;
    var rows = Array.prototype.slice.call(tb.rows);
    rows.forEach(function (tr) {
      var act = tr.cells[tr.cells.length - 1];
      if (!act || !act.querySelector(".edit-btn")) return;
      tr.classList.add("ra-row");
      Array.prototype.forEach.call(act.querySelectorAll(".edit-btn,.clone-btn,.delete-btn"), function (x) { x.style.setProperty("display", "none", "important"); });
      if (!act.querySelector(".ra-more")) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "ra-more"; 
        b.setAttribute("aria-label", "Row actions");
        b.addEventListener("click", function () { openSheet(tr, cfg, b); });
        act.appendChild(b);
      }
    });
  }

  var armed = null;
  function wrapDelete(cfg) {
    var orig = window[cfg.del];
    if (typeof orig !== "function") return;
    window[cfg.del] = function (id) {
      if (armed !== cfg) return orig.apply(this, arguments);
      armed = null;
      var snap = cfg.list().find(function (e) { return e.id === id; });
      var oc = window.confirm;
      window.confirm = function () { return true; };
      try { orig.apply(this, arguments); } finally { window.confirm = oc; }
      if (!snap) return;
      toast("Deleted ✓", false, 5000, { label: "Undo", fn: function () {
        cfg.list().push(snap);
        saveLocal();
        window[cfg.rerender]();
        sheetWrite(apiUrl(cfg.add(snap)));
        toast("Restored ✓");
      } });
    };
  }

  var sheet = null;
  function closeSheet() {
    if (!sheet) return;
    var s = sheet; sheet = null;
    s.sh.classList.remove("ra-in");
    setTimeout(function () { s.ov.remove(); s.sh.remove(); }, 200);
  }
  function openSheet(tr, cfg, anchor) {
    if (sheet) return;
    var ov = document.createElement("div"); ov.className = "ra-ov";
    var sh = document.createElement("div"); sh.className = "ra-sheet";
    sh.setAttribute("role", "dialog"); sh.setAttribute("aria-label", "Row actions");
    var h = document.createElement("h4");
    h.textContent = (tr.cells[cfg.sum[0]].textContent.trim() || "Entry") + " · " + tr.cells[cfg.sum[1]].textContent.trim();
    sh.appendChild(h);
    function btn(label, cls, cb) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener("click", function () { closeSheet(); cb(); });
      sh.appendChild(b);
    }
    btn("✏️ Update", "", function () { var b = tr.querySelector(".edit-btn"); if (b) b.click(); });
    btn("⧉ Clone", "", function () { var b = tr.querySelector(".clone-btn"); if (b) b.click(); });
    btn("🗑 Delete", "ra-del", function () {
      var b = tr.querySelector(".delete-btn"); if (!b) return;
      armed = cfg; b.click(); armed = null;
    });
    ov.addEventListener("click", closeSheet);
    document.body.appendChild(ov); document.body.appendChild(sh);
    sheet = { ov: ov, sh: sh };
    if (anchor && window.innerWidth > 760) {
      // Laptop: small popover right next to the ⋮ button instead of a bottom sheet.
      sh.classList.add("ra-pop"); ov.classList.add("ra-pop-ov");
      var r = anchor.getBoundingClientRect(), w = 220, hh = sh.offsetHeight;
      var left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      var top = r.bottom + 4;
      if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 4);
      sh.style.left = left + "px"; sh.style.top = top + "px";
      var cl = function () { closeSheet(); window.removeEventListener("scroll", cl, true); window.removeEventListener("resize", cl); };
      window.addEventListener("scroll", cl, true); window.addEventListener("resize", cl);
    }
    requestAnimationFrame(function () { sh.classList.add("ra-in"); });
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  // Long press: touch only, phones only; moving > 8px (scrolling) cancels.
  var t = null, sx = 0, sy = 0, cur = null;
  function cancel() { clearTimeout(t); if (cur) cur.classList.remove("ra-holding"); cur = null; }
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") return;
    var tr = e.target.closest && e.target.closest("tr.ra-row");
    if (!tr || e.target.closest("button,a,input,select,textarea")) return;
    var cfg = TABLES.filter(function (c) { return tr.closest("#" + c.id); })[0];
    if (!cfg) return;
    cancel(); cur = tr; sx = e.clientX; sy = e.clientY;
    tr.classList.add("ra-holding");
    t = setTimeout(function () { var r = cur; cancel(); if (r) openSheet(r, cfg); }, HOLD_MS);
  }, { passive: true });
  document.addEventListener("pointermove", function (e) {
    if (cur && (Math.abs(e.clientX - sx) > MOVE_PX || Math.abs(e.clientY - sy) > MOVE_PX)) cancel();
  }, { passive: true });
  ["pointerup", "pointercancel", "scroll"].forEach(function (n) { document.addEventListener(n, cancel, true); });
  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest && e.target.closest("tr.ra-row")) e.preventDefault();
  });

  // Swipe-left on a row opens the same action sheet (phones only).
  // Skipped when the table scrolls sideways, so horizontal scrolling still works.
  var sw = null;
  function scrollsX(el) {
    for (; el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    return false;
  }
  document.addEventListener("touchstart", function (e) {
    var tr = window.innerWidth <= 760 && e.target.closest && e.target.closest("tr.ra-row");
    if (!tr || e.target.closest("button,a,input,select,textarea") || scrollsX(tr)) { sw = null; return; }
    var cfg = TABLES.filter(function (c) { return tr.closest("#" + c.id); })[0];
    var p = e.touches[0];
    sw = cfg ? { tr: tr, cfg: cfg, x: p.clientX, y: p.clientY } : null;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!sw) return;
    var s = sw; sw = null;
    var p = e.changedTouches[0], dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5) openSheet(s.tr, s.cfg);
  }, { passive: true });

  TABLES.forEach(function (cfg) {
    wrapDelete(cfg);
    var tb = document.querySelector("#" + cfg.id + " tbody");
    if (!tb) return;
    var busy = false;
    new MutationObserver(function () {
      if (busy) return; busy = true;
      requestAnimationFrame(function () { try { enhance(cfg); } finally { busy = false; } });
    }).observe(tb, { childList: true });
    enhance(cfg);
  });
})();
