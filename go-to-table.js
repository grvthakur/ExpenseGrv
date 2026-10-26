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
        }

        .cc-go-to-table-btn:hover {
            background: var(--s2);
            border-color: var(--accent);
        }

        @media (max-width: 600px) {
            .cc-go-to-table-row { padding: 8px 12px 0; }
        }
    `;
  document.head.appendChild(style);

  function goToTable(id) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  }

  function init() {
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

    const stats = document.getElementById("ccStatTotal")?.closest(".cc-stats");

    if (stats && !document.getElementById("cardsGoToTableBtn")) {
      const row = document.createElement("div");
      row.className = "cc-go-to-table-row";
      row.innerHTML =
        '<button type="button" id="cardsGoToTableBtn" ' +
        'class="cc-go-to-table-btn"><span>↓</span> Go to Table</button>';

      stats.after(row);
      row.firstElementChild.onclick = () => goToTable("cardTable");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
