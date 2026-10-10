/* Summary modal v3 — additive; original script.js untouched. */
(function () {
  const COLORS = [
    "#22d3ee",
    "#34d399",
    "#f472b6",
    "#fbbf24",
    "#fb923c",
    "#60a5fa",
    "#c084fc",
    "#f87171",
    "#2dd4bf",
    "#818cf8",
  ];
  const ICONS = {
    "Bill Repayment": "🧾",
    "Food and Groceries": "🛒",
    Transportation: "🚗",
    "Entertainment and Leisure": "🎬",
    Personal: "👤",
    Loan: "🏦",
    "Sweetie Saving": "💖",
    "Savings and Investments": "📈",
    Shopping: "🛍️",
    Health: "💊",
    Education: "🎓",
  };
  const esc = (s) =>
    String(s).replace(
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
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  let chart = null,
    focus = -1;

  function calc(key) {
    const cats = new Map();
    let spent = 0,
      count = 0,
      top = null;
    expenses
      .filter((e) => e.month === key)
      .forEach((e) => {
        const a = Number(e.amount) || 0,
          c = e.category;
        if (c === "Received") {
          spent -= a;
          return;
        }
        if (c === "Sweetie Borrow") return;
        spent += a;
        count++;
        cats.set(c, (cats.get(c) || 0) + a);
        if (!top || a > top.amount)
          top = { amount: a, c, d: String(e.description || c) };
      });
    return { spent, cats, count, top };
  }
  function keyAt(off) {
    let m = parseInt(document.getElementById("monthSelect").value) - off,
      y = parseInt(document.getElementById("yearSelect").value);
    while (m < 0) {
      m += 12;
      y--;
    }
    return { k: `${MONTHS[m]}-${String(y).slice(-2)}`, l: MONTHS[m] };
  }

  function setFocus(i) {
    focus = focus === i ? -1 : i;
    if (chart) {
      if (focus >= 0)
        chart.setActiveElements([{ datasetIndex: 0, index: focus }]);
      else chart.setActiveElements([]);
      chart.update();
    }
    document
      .querySelectorAll("#summaryPlus .sp-row,#spChips .sp-chip")
      .forEach((el) => el.classList.toggle("on", +el.dataset.i === focus));
    document
      .querySelectorAll("#summaryPlus .sp-row,#spChips .sp-chip")
      .forEach((el) =>
        el.classList.toggle("dim", focus >= 0 && +el.dataset.i !== focus),
      );
  }

  function drawDonut(list, spent) {
    const cv = document.getElementById("summaryChart");
    if (!cv || !window.Chart) return;
    const old = Chart.getChart(cv);
    if (old) old.destroy();
    const bg = getComputedStyle(
      document.querySelector("#summaryModal .modal-content"),
    ).backgroundColor;
    const txt = getComputedStyle(document.body).color,
      total = list.reduce((s, x) => s + x[1], 0) || 1;
    focus = -1;
    chart = new Chart(cv.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: list.map((x) => x[0]),
        datasets: [
          {
            data: list.map((x) => x[1]),
            backgroundColor: list.map((_, i) => COLORS[i % 10]),
            borderColor: bg,
            borderWidth: 4,
            borderRadius: 8,
            spacing: 2,
            hoverOffset: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "72%",
        animation: { duration: 900 },
        onClick: (_, els) => {
          if (els.length) setFocus(els[0].index);
        },
        plugins: {
          legend: { display: false },
          sliceLabels: false,
          tooltip: { enabled: false },
        },
      },
      plugins: [
        {
          id: "center",
          afterDraw(ch) {
            const { ctx, chartArea: a } = ch,
              x = (a.left + a.right) / 2,
              y = (a.top + a.bottom) / 2;
            const act = ch.getActiveElements(),
              i = act.length ? act[0].index : -1;
            const head = i >= 0 ? list[i][0].toUpperCase() : "TOTAL SPENT",
              big = i >= 0 ? inr(list[i][1]) : inr(spent);
            const sub =
              i >= 0
                ? ((list[i][1] / total) * 100).toFixed(1) + "% of spending"
                : list.length + " categories";
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = i >= 0 ? COLORS[i % 10] : "#94a3b8";
            ctx.font = "600 11px DM Sans, sans-serif";
            ctx.fillText(
              head.length > 22 ? head.slice(0, 21) + "…" : head,
              x,
              y - 18,
            );
            ctx.fillStyle = txt;
            ctx.font = "700 24px DM Sans, sans-serif";
            ctx.fillText(big, x, y + 6);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "12px DM Sans, sans-serif";
            ctx.fillText(sub, x, y + 30);
            ctx.restore();
          },
        },
      ],
    });
  }

  function ensureLayout() {
    const modal = document.querySelector("#summaryModal .modal-content");
    let lay = document.getElementById("spLayout");
    if (lay) return lay;
    const pie = modal.querySelector(".pie-container"),
      legend = document.getElementById("modalLegend");
    lay = document.createElement("div");
    lay.id = "spLayout";
    const L = document.createElement("div");
    L.id = "spLeft";
    const host = document.createElement("div");
    host.id = "summaryPlus";
    legend.after(lay);
    L.appendChild(pie);
    const chips = document.createElement("div");
    chips.id = "spChips";
    L.appendChild(chips);
    lay.append(L, host);
    return lay;
  }

  function render() {
    ensureLayout();
    const host = document.getElementById("summaryPlus"),
      chipsEl = document.getElementById("spChips");
    const key = monthKey(),
      cur = calc(key),
      prev = calc(keyAt(1).k),
      salary = salaries[key] || 0;
    const remaining = salary - cur.spent,
      usedPct = salary ? Math.min(100, (cur.spent / salary) * 100) : 0;
    const m = parseInt(document.getElementById("monthSelect").value),
      y = parseInt(document.getElementById("yearSelect").value);
    const dim = new Date(y, m + 1, 0).getDate(),
      now = new Date();
    const cm = now.getFullYear() === y && now.getMonth() === m,
      elapsed = cm ? now.getDate() : dim;
    const daily = cur.spent / Math.max(1, elapsed),
      proj = daily * dim;
    const delta =
      prev.spent > 0 ? ((cur.spent - prev.spent) / prev.spent) * 100 : null;
    const list = [...cur.cats.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = list.reduce((s, x) => s + x[1], 0) || 1;
    drawDonut(list, cur.spent);

    chipsEl.innerHTML =
      list
        .slice(0, 6)
        .map(
          ([c], i) =>
            `<button class="sp-chip" data-i="${i}"><i style="background:${COLORS[i]}"></i>${esc(c)}</button>`,
        )
        .join("") +
      (list.length > 6
        ? `<span class="sp-more">+${list.length - 6} more</span>`
        : "");

    const rows = list
      .map(([c, v], i) => {
        const p = (v / total) * 100;
        return `<div class="sp-row" data-i="${i}"><div class="sp-rh"><span><i style="background:${COLORS[i % 10]}"></i>${ICONS[c] || "•"} ${esc(c)}</span><b>${inr(v)} <em>${p.toFixed(1)}%</em></b></div><div class="sp-bar"><span style="width:${p}%;background:${COLORS[i % 10]}"></span></div></div>`;
      })
      .join("");

    const tr = [5, 4, 3, 2, 1, 0].map((o) => {
      const k = keyAt(o);
      return { l: k.l, v: calc(k.k).spent, now: o === 0 };
    });
    const mx = Math.max(...tr.map((t) => t.v), 1);
    const trend = tr
      .map(
        (t) =>
          `<div class="sp-tb${t.now ? " cur" : ""}" title="${inr(t.v)}"><span style="height:${Math.max(4, (t.v / mx) * 100)}%"></span><small>${t.l}</small></div>`,
      )
      .join("");

    const bc = usedPct > 90 ? "#f87171" : usedPct > 70 ? "#fbbf24" : "#34d399";
    const dC =
      delta === null ? "var(--muted)" : delta > 0 ? "#f87171" : "#34d399";
    const dT =
      delta === null
        ? "—"
        : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%`;
    host.innerHTML = `
      <div class="sp-kpis">
        <div><small>Spent</small><b>${inr(cur.spent)}</b></div>
        <div><small>Salary</small><b>${salary ? inr(salary) : "—"}</b></div>
        <div><small>${remaining < 0 ? "Overspent" : "Remaining"}</small><b style="color:${remaining < 0 ? "#f87171" : "#34d399"}">${salary ? inr(Math.abs(remaining)) : "—"}</b></div>
      </div>
      ${salary ? `<div class="sp-card"><div class="sp-rh"><span>Salary used</span><b>${usedPct.toFixed(0)}%</b></div><div class="sp-bar"><span style="width:${usedPct}%;background:${bc}"></span></div></div>` : ""}
      <div class="sp-stats">
        <div><small>Daily avg</small><b>${inr(daily)}</b></div>
        <div><small>${cm ? "Projected" : "Days"}</small><b>${cm ? inr(proj) : dim}</b></div>
        <div><small>vs last month</small><b style="color:${dC}">${dT}</b></div>
        <div><small>Txns</small><b>${cur.count}</b></div>
      </div>
      ${cur.top ? `<div class="sp-card">🔥 <b>Biggest:</b> ${esc(cur.top.c)} · ${inr(cur.top.amount)}</div>` : ""}
      <div class="sp-card"><div class="sp-title">6-month trend</div><div class="sp-trend">${trend}</div></div>
      <div class="sp-title">Categories <em>(tap to focus)</em></div><div class="sp-list">${rows}</div>`;
    host
      .querySelectorAll(".sp-row")
      .forEach((el) => (el.onclick = () => setFocus(+el.dataset.i)));
    chipsEl
      .querySelectorAll(".sp-chip")
      .forEach((el) => (el.onclick = () => setFocus(+el.dataset.i)));
  }

  const css = document.createElement("style");
  css.textContent = `
  #summaryModal .modal-content{max-width:1000px;width:94vw;max-height:92vh;overflow-y:auto}
  #modalLegend{display:none !important}
  #spLayout{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:22px;align-items:start}
  #spLeft{position:sticky;top:0}
  #spLeft .pie-container{max-width:320px;margin:0 auto}
  #spChips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:12px}
  .sp-chip{display:flex;align-items:center;gap:6px;background:var(--s2);border:1px solid var(--border);color:var(--text);border-radius:99px;padding:4px 10px;font-size:.7rem;cursor:pointer;transition:.2s}
  .sp-chip i,.sp-rh i{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block}
  .sp-more{font-size:.7rem;color:var(--muted);align-self:center}
  #summaryPlus{font-size:.82rem;color:var(--text);min-width:0}
  #summaryPlus small{display:block;color:var(--muted);font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
  .sp-kpis,.sp-stats{display:grid;gap:8px;margin-bottom:10px}
  .sp-kpis{grid-template-columns:repeat(3,1fr)}.sp-stats{grid-template-columns:repeat(4,1fr)}
  .sp-kpis>div,.sp-stats>div,.sp-card{background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:9px 11px}
  .sp-card{margin-bottom:10px}.sp-kpis b{font-size:1rem}
  .sp-title{font-weight:700;margin:4px 0 8px;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  .sp-title em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:400}
  .sp-list{max-height:250px;overflow-y:auto;padding-right:4px}
  .sp-row{margin-bottom:9px;padding:4px 6px;border-radius:10px;cursor:pointer;transition:.2s}
  .sp-row:hover,.sp-row.on{background:var(--s2)}
  .sp-row.dim,.sp-chip.dim{opacity:.35}.sp-chip.on{border-color:var(--accent)}
  .sp-rh{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}
  .sp-rh span{display:flex;align-items:center;gap:6px;min-width:0}
  .sp-rh em{font-style:normal;color:var(--muted);font-weight:500;margin-left:4px}
  .sp-bar{height:8px;background:var(--border);border-radius:99px;overflow:hidden}
  .sp-bar span{display:block;height:100%;border-radius:99px;transition:width .6s}
  .sp-trend{display:flex;gap:8px;align-items:flex-end;height:70px}
  .sp-tb{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px}
  .sp-tb span{width:100%;background:var(--border);border-radius:6px 6px 2px 2px;transition:height .6s}
  .sp-tb.cur span{background:linear-gradient(#22d3ee,#818cf8)}
  .sp-tb small{margin:0 !important;font-size:.62rem !important}
  @media(max-width:800px){#spLayout{grid-template-columns:1fr}#spLeft{position:static}.sp-stats{grid-template-columns:repeat(2,1fr)}.sp-kpis b{font-size:.85rem}.sp-list{max-height:none}}`;
  document.head.appendChild(css);

  const modal = document.getElementById("summaryModal");
  if (modal)
    new MutationObserver(() => {
      if (getComputedStyle(modal).display !== "none") {
        try {
          render();
        } catch (e) {
          console.error(e);
        }
      }
    }).observe(modal, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
})();
