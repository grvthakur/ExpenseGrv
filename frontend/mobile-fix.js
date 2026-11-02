(function () {
  "use strict";

  const css = document.createElement("style");
  css.textContent = `
    /* 1. Amount should never break into multiple lines */
    html body #cardTable td .table-amount-pill,
    html body #grvCardTable td .table-amount-pill,
    html body #expenseTable td .table-amount-pill,
    html body #sweetieTable td .table-amount-pill {
      white-space: nowrap !important;
      display: inline-block !important;
      max-width: none !important;
      overflow-wrap: normal !important;
      word-break: keep-all !important;
    }

    html body #cardTable td:nth-child(6),
    html body #grvCardTable td:nth-child(6) {
      min-width: 120px !important;
    }

    /* 2. Remarks: desktop hidden */
    html body .cc-rem {
      display: none !important;
      margin-top: 2px !important;
      font-size: 9px !important;
      line-height: 1.2 !important;
      color: #fbbf24 !important;
      font-weight: 400 !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }

    /* Remarks only on mobile */
    @media screen and (max-width: 768px) {
      html body .cc-rem {
        display: block !important;
      }

      html body #cardTable th:nth-child(5),
      html body #cardTable td:nth-child(5),
      html body #grvCardTable th:nth-child(5),
      html body #grvCardTable td:nth-child(5) {
        display: none !important;
      }
    }

    /* 3. Filter button: desktop hidden */
    .flt-toggle {
      display: none !important;
    }

    @media screen and (max-width: 768px) {
      .flt-toggle {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: var(--s2);
        color: var(--accent);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 8px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        margin: 0 0 8px;
      }

      /* Force filter container to hide even if other CSS uses display:flex!important */
      html body #expenseSection .table-header > div.flt-collapsed,
      html body #cardSection .table-header > div.flt-collapsed,
      html body #grvCCSection .table-header > div.flt-collapsed,
      html body #sweetieSection .table-header > div.flt-collapsed {
        display: none !important;
      }
    }
  `;

  if (!document.getElementById("mobile-fix-style")) {
    css.id = "mobile-fix-style";
    document.head.appendChild(css);
  }

  function initFilters() {
    const headers = document.querySelectorAll(
      "#expenseSection .table-header, " +
        "#cardSection .table-header, " +
        "#grvCCSection .table-header, " +
        "#sweetieSection .table-header",
    );

    headers.forEach((header) => {
      const filterBox = Array.from(header.children).find(
        (el) => el.tagName === "DIV",
      );

      if (!filterBox || filterBox.dataset.filterToggleReady === "1") {
        return;
      }

      filterBox.dataset.filterToggleReady = "1";
      filterBox.classList.add("flt-collapsed");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "flt-toggle";
      button.textContent = "🔍 Filter";
      button.setAttribute("aria-expanded", "false");

      button.addEventListener("click", function () {
        const isClosed = filterBox.classList.contains("flt-collapsed");

        filterBox.classList.toggle("flt-collapsed", !isClosed);

        button.textContent = isClosed ? "✕ Hide Filter" : "🔍 Filter";
        button.setAttribute("aria-expanded", String(isClosed));
      });

      header.insertBefore(button, filterBox);
    });
  }

  function start() {
    initFilters();

    // Reinitialize if the app creates filter sections later.
    if (!window.__mobileFilterObserver) {
      window.__mobileFilterObserver = new MutationObserver(initFilters);
      window.__mobileFilterObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
