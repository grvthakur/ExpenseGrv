(() => {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
        .cc-go-to-table-row {
            display: flex;
            justify-content: flex-end;
            padding: 8px 28px 0;
        }

        .cc-go-to-table-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-height: 31px;
            padding: 0 12px;
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--surface);
            color: var(--accent);
            font: 600 .75rem 'DM Sans', sans-serif;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        .cc-go-to-table-btn:hover {
            background: var(--s2);
            border-color: var(--accent);
        }

        .cc-go-to-table-btn:active {
            transform: scale(.98);
        }

        @media (max-width: 600px) {
            .cc-go-to-table-row { padding: 8px 12px 0; }
            .cc-go-to-table-btn { min-height: 34px; }
        }
    `;
  document.head.appendChild(style);

  function goToTable(id) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function addStatsTableButton(stats, buttonId, targetId) {
    if (!stats || document.getElementById(buttonId)) return;

    const row = document.createElement("div");
    row.className = "cc-go-to-table-row";

    // If the button was previously added inside the filter/header area,
    // reuse and move it here instead of leaving a duplicate behind.
    let btn = Array.from(document.querySelectorAll("button")).find((candidate) => {
      const inlineAction = candidate.getAttribute("onclick") || "";
      return candidate.textContent.includes("Go to Table") &&
        inlineAction.includes(targetId);
    });

    if (!btn) {
      btn = document.createElement("button");
      btn.innerHTML = '<span aria-hidden="true">↓</span> Go to Table';
    } else {
      btn.removeAttribute("onclick");
    }

    btn.type = "button";
    btn.id = buttonId;
    btn.className = "cc-go-to-table-btn";
    btn.setAttribute("aria-label", "Go to transactions table");
    btn.addEventListener("click", () => goToTable(targetId));

    row.appendChild(btn);
    stats.after(row);
  }

  function init() {
    // GRV CC: keep the existing button beside Sync.
    const sync = document.getElementById("grvCardSyncBtn");

    if (sync && !document.getElementById("grvGoToTableBtn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "grvGoToTableBtn";
      btn.className = "gb gb-go-table";
      btn.innerHTML = '<i class="gb-ic">↓</i><span>Go to Table</span>';
      sync.after(btn);
      btn.onclick = () => goToTable("grvCardTable");
    }

    // Credit Cards: keep its existing top placement below the stats.
    const cardStats = document.getElementById("ccStatTotal")?.closest(".cc-stats");
    addStatsTableButton(cardStats, "cardsGoToTableBtn", "cardTable");

    // Expenses: put the button below the summary cards, outside the filter row.
    const expenseStats = document.querySelector("#expenseSection .stats");
    addStatsTableButton(expenseStats, "expensesGoToTableBtn", "expenseTable");

    // Sweetie: put the button below Sweetie summary cards, outside the filters.
    const sweetieStats = document.querySelector("#sweetieSection .cc-stats");
    addStatsTableButton(sweetieStats, "sweetieGoToTableBtn", "sweetieTable");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
