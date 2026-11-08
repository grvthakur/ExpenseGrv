/* bill-extras.js — additive layer for the Bills screen (loads AFTER script.js).
   1) ‹ › month navigation + 👥 People button in the Bills toolbar
   2) Per-card bank-bill reconcile: Add the difference as an entry, or Settle
   3) People modal: person-wise / card-wise / month-wise amounts (+ copy summary)
   Reads existing globals only; touches no existing business logic. */
(function () {
  "use strict";
  var SETTLE_LS = "grv_bill_settled";
  var css = document.createElement("style");
  css.textContent = [
    ".bx-nav{min-width:34px;height:34px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;cursor:pointer;font-size:1rem}",
    ".bx-nav:hover,.bx-people-btn:hover{background:rgba(167,139,250,.18);border-color:rgba(167,139,250,.6)}",
    ".bx-people-btn{height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;cursor:pointer;font-weight:700}",
    ".bx-recon{margin:8px 0 0;padding:10px;border-radius:12px;border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.07);font-size:.8rem}",
    ".bx-recon.ok{border-color:rgba(52,211,153,.4);background:rgba(52,211,153,.07)}",
    ".bx-recon b{font-weight:800}.bx-recon .bx-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}",
    ".bx-recon button{min-height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:transparent;color:inherit;cursor:pointer;font-weight:700;transition:background .12s,border-color .12s}",
    ".bx-recon button:hover{background:rgba(167,139,250,.2);border-color:rgba(167,139,250,.7)}",
    ".bx-ov{position:fixed;inset:0;z-index:32000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}",
    ".bx-box{width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;border-radius:18px;background:var(--card,#1c1c26);color:var(--text,#fff);border:1px solid rgba(148,163,184,.25);box-shadow:0 20px 60px rgba(0,0,0,.5)}",
    ".bx-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 8px}.bx-head h3{margin:0;font-size:1.05rem}",
    ".bx-x{width:34px;height:34px;border-radius:10px;border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;cursor:pointer;font-size:1.1rem}",
    ".bx-bar{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px;align-items:center}",
    ".bx-chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;cursor:pointer;font-size:.8rem;font-weight:700}",
    ".bx-chip.on{background:rgba(167,139,250,.25);border-color:rgba(167,139,250,.8)}",
    ".bx-body{overflow:auto;padding:0 16px 16px;overscroll-behavior:contain}",
    ".bx-card{border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:10px 12px;margin:8px 0;background:rgba(255,255,255,.025)}",
    ".bx-top{display:flex;justify-content:space-between;gap:8px;font-weight:800}.bx-top span:last-child{color:#f472b6}",
    ".bx-line{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:.82rem;border-top:1px dashed rgba(148,163,184,.18)}.bx-line:first-of-type{margin-top:6px}",
    ".bx-line em{opacity:.65;font-style:normal}.bx-tot{display:flex;justify-content:space-between;font-weight:800;padding:8px 2px 0}",
    ".bx-mo{font-weight:800;margin:14px 0 2px;opacity:.85}.bx-bad{color:#fbbf24}.bx-good{color:#34d399}"
  ].join("\n");
  document.head.appendChild(css);

  var $ = function (id) { return document.getElementById(id); };
  var N = function (x) { return +x || 0; };
  var fmt = function (x) { return typeof money === "function" ? money(x) : "₹" + N(x).toFixed(2); };
  var E = function (s) { return typeof esc === "function" ? esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var isPaid = function (t) { return String(t.status || "").toUpperCase() !== "UNPAID"; };
  function settled() { try { return JSON.parse(localStorage.getItem(SETTLE_LS) || "{}"); } catch (e) { return {}; } }
  function keyOf(card, last) { return card + "|" + last.billingYear + "-" + (last.billingMonth + 1); }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function baseRef() { return grvBillsRef || today0(); }

  /* ── 1) toolbar: month nav + People ── */
  function shiftMonth(dir) {
    var m = $("grvBillsMonth"), y = $("grvBillsYear");
    if (!m || !y) return;
    var d = new Date(+y.value, +m.value + dir, 1);
    if (![].some.call(y.options, function (o) { return +o.value === d.getFullYear(); })) return;
    y.value = d.getFullYear(); m.value = d.getMonth();
    if (typeof setGrvBillsMonth === "function") setGrvBillsMonth();
  }
  function injectToolbar() {
    var tb = document.querySelector("#grvBillsModal .grv-bills-toolbar");
    if (!tb || tb.querySelector(".bx-people-btn")) return;
    var prev = document.createElement("button"), next = document.createElement("button"), pb = document.createElement("button");
    prev.type = next.type = pb.type = "button";
    prev.className = next.className = "bx-nav"; prev.textContent = "‹"; next.textContent = "›";
    prev.title = "Previous month"; next.title = "Next month";
    prev.onclick = function () { shiftMonth(-1); }; next.onclick = function () { shiftMonth(1); };
    pb.className = "bx-people-btn"; pb.textContent = "👥 People"; pb.onclick = openPeople;
    var m = $("grvBillsMonth");
    tb.insertBefore(prev, m); tb.appendChild(next); tb.appendChild(pb);
  }

  /* ── 2) per-card reconcile ── */
  function addDiffEntry(cfg, last, diff) {
    var txnDate = ymdLocal(last.end);
    if (!confirm("Add ₹" + diff.toFixed(2) + " to " + cfg.card + " (" + txnDate + ") as 'Bank adjustment' so the statement matches your bank bill?")) return;
    var entry = { id: Date.now().toString(), card: cfg.card, usedBy: "GRV", description: "Bank adjustment (fees/interest)", txnDate: txnDate,
      remarks: "Added from Bills reconcile", amount: +diff.toFixed(2), status: "UNPAID", billingMonth: calcBillingMonth(txnDate, cfg.cutoff) };
    cardTxns.push(entry); saveLocal();
    sheetWrite(apiUrl("action=addCard&id=" + entry.id + "&card=" + enc(entry.card) + "&usedBy=" + enc(entry.usedBy) + "&description=" + enc(entry.description) +
      "&txnDate=" + enc(entry.txnDate) + "&remarks=" + enc(entry.remarks) + "&amount=" + entry.amount + "&status=" + enc(entry.status) + "&billingMonth=" + enc(entry.billingMonth)));
    renderCards(); renderGrvCC(); renderGrvBills(); toast("Adjustment added ✓");
  }
  function settleDiff(k, actual) {
    var s = settled(); s[k] = actual;
    try { localStorage.setItem(SETTLE_LS, JSON.stringify(s)); } catch (e) {}
    renderGrvBills(); toast("Difference settled ✓");
  }
  function enhanceCards() {
    injectToolbar();
    var today = today0();
    document.querySelectorAll("#grvBillsGrid .grv-bill-card").forEach(function (el) {
      if (el.querySelector(".bx-recon")) return;
      var nm = el.querySelector(".grv-bill-card-name"); if (!nm) return;
      var cfg = cardConfig.filter(function (c) { return c.card === nm.textContent.trim(); })[0]; if (!cfg) return;
      var last = getCardCycle(cfg, baseRef()).last;
      if (!(last.end < today)) return;
      var k = keyOf(cfg.card, last), actual = grvStatementMatches[k];
      if (actual == null || !isFinite(+actual)) return;
      var tracked = rowsForCycle(cfg.card, last).reduce(function (a, t) { return a + N(t.amount); }, 0);
      var diff = +actual - tracked, box = document.createElement("div");
      if (Math.abs(diff) < 0.01) { box.className = "bx-recon ok"; box.innerHTML = "✓ Bank bill <b>" + fmt(actual) + "</b> matches the statement"; }
      else if (settled()[k] != null && Math.abs(settled()[k] - actual) < 0.01) { box.className = "bx-recon ok"; box.innerHTML = "✓ Settled · bank <b>" + fmt(actual) + "</b> vs tracked <b>" + fmt(tracked) + "</b> (" + (diff > 0 ? "+" : "−") + fmt(Math.abs(diff)) + ")"; }
      else {
        box.className = "bx-recon";
        box.innerHTML = "Bank bill <b>" + fmt(actual) + "</b> vs tracked <b>" + fmt(tracked) + "</b> — " + (diff > 0 ? "bank is <b class='bx-bad'>" + fmt(diff) + " higher</b>" : "bank is <b class='bx-bad'>" + fmt(-diff) + " lower</b>") + "<div class='bx-row'></div>";
        var row = box.querySelector(".bx-row"), b;
        if (diff > 0) { b = document.createElement("button"); b.type = "button"; b.textContent = "➕ Add " + fmt(diff) + " as entry"; b.onclick = function () { addDiffEntry(cfg, last, diff); }; row.appendChild(b); }
        b = document.createElement("button"); b.type = "button"; b.textContent = "✓ Settle"; b.title = "Accept the difference; nothing is changed in your data"; b.onclick = function () { settleDiff(k, +actual); }; row.appendChild(b);
      }
      var anchor = el.querySelector(".grv-bill-actions");
      anchor ? anchor.parentNode.insertBefore(box, anchor) : el.appendChild(box);
    });
  }
  var origRender = window.renderGrvBills;
  if (typeof origRender === "function") {
    window.renderGrvBills = function () { var r = origRender.apply(this, arguments); try { enhanceCards(); } catch (e) { console.warn("bill-extras", e); } return r; };
  }

  /* ── 3) People modal ── */
  var st = { tab: "people", scope: "month", status: "UNPAID" };
  function statements() { // [{cfg,last}] for the selected statement
    return cardConfig.map(function (cfg) { return { cfg: cfg, last: getCardCycle(cfg, baseRef()).last }; });
  }
  function pickRows() {
    var rows = [];
    if (st.scope === "all") rows = cardTxns.slice();
    else statements().forEach(function (s) { rows = rows.concat(rowsForCycle(s.cfg.card, s.last)); });
    return rows.filter(function (t) { return st.status === "ALL" || (st.status === "PAID" ? isPaid(t) : !isPaid(t)); });
  }
  function group(rows, a, b) { // a = outer key fn, b = inner key fn
    var out = {};
    rows.forEach(function (t) {
      var ka = a(t), kb = b(t), o = out[ka.toLowerCase()] = out[ka.toLowerCase()] || { label: ka, total: 0, inner: {} };
      o.total += N(t.amount); o.inner[kb] = (o.inner[kb] || 0) + N(t.amount);
    });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (x, y) { return y.total - x.total; });
  }
  var person = function (t) { var u = String(t.usedBy || "").trim(); return !u ? "Unassigned" : (isGrvUsedBy(u) ? "GRV (me)" : u); };
  function groupHtml(g) {
    return g.length ? g.map(function (o) {
      return "<div class='bx-card'><div class='bx-top'><span>" + E(o.label) + "</span><span>" + fmt(o.total) + "</span></div>" +
        Object.keys(o.inner).sort(function (x, y) { return o.inner[y] - o.inner[x]; }).map(function (k) { return "<div class='bx-line'><em>" + E(k) + "</em><span>" + fmt(o.inner[k]) + "</span></div>"; }).join("") + "</div>";
    }).join("") : "<div class='bx-card'>No transactions for this filter.</div>";
  }
  function monthsHtml() {
    var out = "";
    cardConfig.forEach(function (cfg) {
      var last = getCardCycle(cfg, baseRef()).last, lines = "";
      for (var i = 0; i < 6; i++) {
        var rows = rowsForCycle(cfg.card, last), tr = rows.reduce(function (a, t) { return a + N(t.amount); }, 0),
          un = rows.filter(function (t) { return !isPaid(t); }).reduce(function (a, t) { return a + N(t.amount); }, 0),
          ac = grvStatementMatches[keyOf(cfg.card, last)], hasAc = ac != null && isFinite(+ac), d = hasAc ? +ac - tr : 0;
        if (tr || hasAc) lines += "<div class='bx-line'><em>" + FULL_MONTHS[last.billingMonth] + " " + last.billingYear + "</em><span>" + fmt(tr) +
          (hasAc ? " · bank " + fmt(ac) + (Math.abs(d) < 0.01 ? " <b class='bx-good'>✓</b>" : " <b class='bx-bad'>" + (d > 0 ? "+" : "−") + fmt(Math.abs(d)) + "</b>") : "") +
          " · " + (un > 0.004 ? "<b class='bx-bad'>unpaid " + fmt(un) + "</b>" : "<b class='bx-good'>paid</b>") + "</span></div>";
        last = getCardCycle(cfg, new Date(last.start.getTime() + 86400000)).last;
      }
      out += "<div class='bx-card'><div class='bx-top'><span>" + E(cfg.card) + "</span><span></span></div>" + (lines || "<div class='bx-line'><em>No data</em></div>") + "</div>";
    });
    return out;
  }
  function summaryText(g) {
    return g.map(function (o) { return o.label + ": " + fmt(o.total) + " (" + Object.keys(o.inner).map(function (k) { return k + " " + fmt(o.inner[k]); }).join(", ") + ")"; }).join("\n");
  }
  function draw() {
    var ov = $("bxPeople"); if (!ov) return;
    var rows = pickRows(), tot = rows.reduce(function (a, t) { return a + N(t.amount); }, 0), g = null, body;
    if (st.tab === "people") g = group(rows, person, function (t) { return t.card; });
    else if (st.tab === "cards") g = group(rows, function (t) { return t.card; }, person);
    body = st.tab === "months" ? monthsHtml() : groupHtml(g) + "<div class='bx-tot'><span>Total</span><span>" + fmt(tot) + "</span></div>";
    var chip = function (k, v, label) { return "<button type='button' class='bx-chip" + (st[k] === v ? " on" : "") + "' data-k='" + k + "' data-v='" + v + "'>" + label + "</button>"; };
    var sel = st.scope === "all" ? "All time" : FULL_MONTHS[(statements()[0] || { last: { billingMonth: 0 } }).last.billingMonth] + " statement";
    ov.querySelector(".bx-box").innerHTML = "<div class='bx-head'><h3>👥 Bills — " + E(sel) + "</h3><div><button type='button' class='bx-chip' id='bxCopy'" + (g ? "" : " style='display:none'") + ">Copy</button> <button type='button' class='bx-x' id='bxClose'>×</button></div></div>" +
      "<div class='bx-bar'>" + chip("tab", "people", "People") + chip("tab", "cards", "Cards") + chip("tab", "months", "Months") +
      (st.tab === "months" ? "" : " <span style='opacity:.4'>|</span> " + chip("status", "UNPAID", "Unpaid") + chip("status", "PAID", "Paid") + chip("status", "ALL", "All") + " <span style='opacity:.4'>|</span> " + chip("scope", "month", "Selected month") + chip("scope", "all", "All time")) +
      "</div><div class='bx-body'>" + body + "</div>";
    ov.querySelector("#bxClose").onclick = closePeople;
    var cp = ov.querySelector("#bxCopy");
    if (cp && g) cp.onclick = function () { try { navigator.clipboard.writeText(summaryText(g)); cp.textContent = "Copied ✓"; } catch (e) {} };
    ov.querySelectorAll("[data-k]").forEach(function (b) { b.onclick = function () { st[b.dataset.k] = b.dataset.v; draw(); }; });
  }
  function openPeople() {
    if ($("bxPeople")) return;
    var ov = document.createElement("div"); ov.id = "bxPeople"; ov.className = "bx-ov";
    ov.innerHTML = "<div class='bx-box' role='dialog' aria-label='People bills'></div>";
    ov.addEventListener("click", function (e) { if (e.target === ov) closePeople(); });
    document.body.appendChild(ov); draw();
  }
  function closePeople() { var o = $("bxPeople"); if (o) o.remove(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePeople(); });
  window.openGrvPeople = openPeople;
})();
