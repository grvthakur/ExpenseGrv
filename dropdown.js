/* Expense Tracker — safe custom Category dropdown prototype.
   Only #expenseCategory is enhanced. The original <select> remains the
   source of truth so existing .value reads and change handlers keep working. */
(function () {
  "use strict";

  function initCategoryDropdown() {
    const select = document.getElementById("expenseCategory");
    if (!select || select.dataset.customDropdownReady === "1") return;

    const host = document.createElement("div");
    host.className = "et-cd-host";
    select.parentNode.insertBefore(host, select);
    host.appendChild(select);
    select.classList.add("et-cd-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.dataset.customDropdownReady = "1";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "et-cd-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="et-cd-value"></span><span class="et-cd-chevron" aria-hidden="true">⌄</span>';

    const backdrop = document.createElement("div");
    backdrop.className = "et-cd-backdrop";

    const panel = document.createElement("div");
    panel.className = "et-cd-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Category selection");

    const searchWrap = document.createElement("div");
    searchWrap.className = "et-cd-search-wrap";
    searchWrap.innerHTML = '<span class="et-cd-search-icon" aria-hidden="true">⌕</span><input class="et-cd-search" type="search" placeholder="Search category…" autocomplete="off">';

    const list = document.createElement("div");
    list.className = "et-cd-list";
    list.setAttribute("role", "listbox");

    panel.appendChild(searchWrap);
    panel.appendChild(list);
    host.appendChild(trigger);
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const search = searchWrap.querySelector(".et-cd-search");
    let activeIndex = -1;
    let visibleOptions = [];

    function options() {
      return Array.from(select.options).map((o) => ({ value: o.value, text: o.textContent.trim() }));
    }

    function syncTrigger() {
      const opt = select.options[select.selectedIndex];
      trigger.querySelector(".et-cd-value").textContent = opt ? opt.textContent.trim() : "Select category";
    }

    function render(filter) {
      const q = String(filter || "").trim().toLowerCase();
      const all = options();
      visibleOptions = all.filter((o) => !q || o.text.toLowerCase().includes(q));
      list.innerHTML = "";
      activeIndex = visibleOptions.length ? Math.max(0, visibleOptions.findIndex((o) => o.value === select.value)) : -1;

      if (!visibleOptions.length) {
        list.innerHTML = '<div class="et-cd-empty">No category found</div>';
        return;
      }

      visibleOptions.forEach((o, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "et-cd-option" + (o.value === select.value ? " is-selected" : "") + (i === activeIndex ? " is-active" : "");
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", o.value === select.value ? "true" : "false");
        btn.dataset.index = String(i);
        btn.innerHTML = '<span>' + escapeHtml(o.text) + '</span><span class="et-cd-check" aria-hidden="true">✓</span>';
        btn.addEventListener("click", function () { choose(o.value); });
        list.appendChild(btn);
      });
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>'"]/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c];
      });
    }

    function setActive(index) {
      if (!visibleOptions.length) return;
      activeIndex = (index + visibleOptions.length) % visibleOptions.length;
      list.querySelectorAll(".et-cd-option").forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
      const active = list.querySelector('.et-cd-option[data-index="' + activeIndex + '"]');
      if (active) active.scrollIntoView({ block: "nearest" });
    }

    function choose(value) {
      const old = select.value;
      select.value = value;
      if (select.value !== old) select.dispatchEvent(new Event("change", { bubbles: true }));
      syncTrigger();
      close();
      trigger.focus();
    }

    function open() {
      render(search.value);
      trigger.setAttribute("aria-expanded", "true");
      panel.classList.add("is-open");
      backdrop.classList.add("is-open");
      search.value = "";
      render("");
      requestAnimationFrame(function () { search.focus(); });
    }

    function close() {
      trigger.setAttribute("aria-expanded", "false");
      panel.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      search.value = "";
    }

    trigger.addEventListener("click", function () {
      if (trigger.getAttribute("aria-expanded") === "true") close(); else open();
    });
    backdrop.addEventListener("click", close);
    search.addEventListener("input", function () { render(search.value); });
    search.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
      else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); choose(visibleOptions[activeIndex].value); }
      else if (e.key === "Escape") { e.preventDefault(); close(); trigger.focus(); }
    });

    document.addEventListener("keydown", function (e) {
      if (trigger.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") { e.preventDefault(); close(); trigger.focus(); }
    });

    // Keep the custom label synchronized if existing app code changes the select.
    select.addEventListener("change", syncTrigger);
    syncTrigger();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCategoryDropdown);
  else initCategoryDropdown();
})();
