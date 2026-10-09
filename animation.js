/* ════════════════════════════════════════════════════════════════════════
   ANIMATIONS.JS
   Premium motion layer for the Expense Tracker.

   IMPORTANT: This file does not change any business logic, data handling,
   API calls, or state. It only:
     - wraps a handful of existing global functions (switchTab, render,
       renderCards, renderSweetie, toast) to layer visual transitions
       around their existing behavior, then calls the original function
       unchanged so results are identical to before;
     - observes the DOM (IntersectionObserver / MutationObserver) to
       trigger CSS animations already defined in animations.css.

   Load order requirement: this file must be included AFTER script.js
   (and after the Chart.js CDN script) so the functions it wraps already
   exist on `window`.
   ════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const REDUCE_MOTION = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  // Mark JS as available before any reveal animation is configured.
  // The CSS keeps .reveal visible under .no-js, so a script failure can
  // never leave dashboard content permanently hidden.
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  /* ── small utilities ─────────────────────────────────────────────── */

  // Wrap a global function by name, running `before`/`after` hooks around
  // the original call. Leaves behavior/return value untouched.
  function wrapGlobal(name, after) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = function (...args) {
      const result = original.apply(this, args);
      if (after) after.apply(this, args);
      return result;
    };
  }

  function nextFrame(fn) {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }

  /* ════════════════════════════════════════════════════════════════════
       1 & 3. SCROLL REVEAL + dashboard card entrance stagger
       ════════════════════════════════════════════════════════════════════ */

  function setupScrollReveal() {
    if (REDUCE_MOTION) return;

    const targets = document.querySelectorAll(
      ".card, .stat, .card-summary-item, .cc-card-item, .table-wrapper",
    );

    let i = 0;
    targets.forEach((el) => {
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 60}ms`);
      i++;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target); // animate once
          }
        });
      },
      { threshold: 0.12 },
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* ════════════════════════════════════════════════════════════════════
       2. TAB / PAGE TRANSITIONS — wraps switchTab()
       ════════════════════════════════════════════════════════════════════ */

  function setupTabTransitions() {
    if (typeof window.switchTab !== "function") return;
    const originalSwitchTab = window.switchTab;

    window.switchTab = function (tab) {
      const sections = {
        expenses: document.getElementById("expenseSection"),
        cards: document.getElementById("cardSection"),
        sweetie: document.getElementById("sweetieSection"),
      };
      const activeButtons = {
        expenses: document.getElementById("tabExpenses"),
        cards: document.getElementById("tabCards"),
        sweetie: document.getElementById("tabSweetie"),
      };

      if (REDUCE_MOTION) {
        originalSwitchTab(tab);
        return;
      }

      // Find whichever section is currently visible so we can fade it out
      const currentSection = Object.values(sections).find(
        (el) => el && el.style.display !== "none",
      );

      const runSwitch = () => {
        originalSwitchTab(tab);
        const nextSection = sections[tab];
        if (nextSection) {
          nextSection.classList.remove("tab-section-exit");
          nextSection.classList.add("tab-section-enter");
          setTimeout(
            () => nextSection.classList.remove("tab-section-enter"),
            420,
          );
        }
        const btn = activeButtons[tab];
        if (btn) {
          btn.classList.remove("tab-just-activated");
          void btn.offsetWidth; // restart animation
          btn.classList.add("tab-just-activated");
          setTimeout(() => btn.classList.remove("tab-just-activated"), 280);
        }
      };

      if (currentSection && currentSection !== sections[tab]) {
        currentSection.classList.add("tab-section-exit");
        setTimeout(runSwitch, 130);
      } else {
        runSwitch();
      }
    };
  }

  /* ════════════════════════════════════════════════════════════════════
       4. TRANSACTION LIST — staggered row entrance on every render
       (render() / renderCards() / renderSweetie() always fully rebuild
       their <tbody>, so re-animating all current rows on each call
       correctly covers add / delete / filter / sort.)
       ════════════════════════════════════════════════════════════════════ */

  function animateTbodyRows(tbody) {
    if (!tbody || REDUCE_MOTION) return;
    Array.from(tbody.rows).forEach((row, i) => {
      row.classList.remove("row-anim-in");
      row.style.setProperty("--row-delay", `${Math.min(i * 20, 300)}ms`);
      void row.offsetWidth; // force reflow so the animation restarts
      row.classList.add("row-anim-in");
    });
  }

  // Smoothly fill the credit-card usage bars from 0 → target width
  function animateProgressBars(container) {
    if (!container || REDUCE_MOTION) return;
    container.querySelectorAll(".cs-bar").forEach((bar) => {
      const target = bar.style.width || "0%";
      bar.style.width = "0%";
      void bar.offsetWidth;
      requestAnimationFrame(() => {
        bar.style.width = target;
      });
    });
  }

  function setupListAnimations() {
    wrapGlobal("render", () => {
      nextFrame(() => animateTbodyRows(document.getElementById("tableBody")));
    });
    wrapGlobal("renderCards", () => {
      nextFrame(() => {
        animateTbodyRows(document.getElementById("cardTableBody"));
        animateProgressBars(document.getElementById("cardSummaryGrid"));
      });
    });
    wrapGlobal("renderSweetie", () => {
      nextFrame(() =>
        animateTbodyRows(document.getElementById("sweetieTableBody")),
      );
    });
  }

  /* ════════════════════════════════════════════════════════════════════
       5. BUTTONS — ripple, plus a loading pulse while disabled
       ════════════════════════════════════════════════════════════════════ */

  function setupButtonRipple() {
    if (REDUCE_MOTION) return;

    const selector =
      ".btn, .btn-summary, .btn-edit, .edit-btn, .delete-btn, .clone-btn, .tab-btn";

    document.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(selector);
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.4;
      const ripple = document.createElement("span");
      ripple.className = "ripple-el";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  }

  // Watch for buttons toggling their own `disabled` attribute (e.g. sync
  // buttons while a fetch is in flight) and apply a pulsing "busy" style.
  function setupLoadingButtons() {
    const candidates = document.querySelectorAll(
      "#syncBtn, #cardSyncBtn, #sweetieSyncBtn, #grvCardSyncBtn, #addBtn, #addCardBtn, #addSweetieBtn, #saveGrvBillPaymentBtn",
    );
    candidates.forEach((btn) => {
      const observer = new MutationObserver(() => {
        btn.classList.toggle("btn-loading", btn.disabled);
      });
      observer.observe(btn, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
       6. STATISTICS — count-up effect on stat values
       ════════════════════════════════════════════════════════════════════ */

  // Parses strings like "₹1,234.50", "-₹120.00", "—", "Not set"
  function parseMoney(text) {
    if (!text) return null;
    const match = String(text)
      .replace(/,/g, "")
      .match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const isNegative = String(text).trim().startsWith("-");
    const prefix = String(text).trim().startsWith("₹")
      ? "₹"
      : isNegative && String(text).includes("₹")
        ? "-₹"
        : "";
    return {
      value: parseFloat(match[0]),
      prefix,
      decimals: match[1] ? match[1].length - 1 : 0,
    };
  }

  function formatMoney(prefix, value, decimals) {
    const sign = value < 0 ? "-" : "";
    return `${sign}${prefix.replace("-", "")}${Math.abs(value).toFixed(decimals || 2)}`;
  }

  function setupCountUp(id) {
    const el = document.getElementById(id);
    if (!el) return;

    let lastValue = null;
    let animating = false;

    const runCountUp = (from, to, parsed) => {
      if (REDUCE_MOTION || animating) {
        el.textContent = formatMoney(parsed.prefix, to, parsed.decimals);
        return;
      }
      animating = true;
      el.classList.add("is-counting");
      const duration = 550;
      const start = performance.now();

      function step(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = from + (to - from) * eased;
        el.textContent = formatMoney(parsed.prefix, current, parsed.decimals);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = formatMoney(parsed.prefix, to, parsed.decimals);
          animating = false;
          el.classList.remove("is-counting");
        }
      }
      requestAnimationFrame(step);
    };

    const observer = new MutationObserver(() => {
      if (animating) return; // ignore mutations we caused ourselves
      const parsed = parseMoney(el.textContent);
      if (!parsed) {
        lastValue = null;
        return;
      }
      const from = lastValue === null ? 0 : lastValue;
      if (parsed.value === lastValue) return;
      lastValue = parsed.value;
      observer.disconnect();
      runCountUp(from, parsed.value, parsed);
      // Reconnect after the animation has had a chance to settle
      setTimeout(
        () =>
          observer.observe(el, {
            childList: true,
            characterData: true,
            subtree: true,
          }),
        600,
      );
    });

    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // Animate the very first paint too (count up from 0 on load)
    const initial = parseMoney(el.textContent);
    if (initial) {
      lastValue = 0;
      observer.disconnect();
      runCountUp(0, initial.value, initial);
      setTimeout(() => {
        lastValue = initial.value;
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }, 600);
    }
  }

  function setupAllCountUps() {
    [
      "statTotalExpenses",
      "statSalary",
      "statRemaining",
      "statSweetie",
      "salaryDisplay",
      "ccStatTotal",
      "ccStatUnpaid",
      "ccStatPaid",
      "sweetieStatBalance",
      "sweetieStatSaved",
      "sweetieStatSpent",
    ].forEach(setupCountUp);
  }



  /* v15: modal keyboard/backdrop accessibility + background scroll lock. */
  function setupModalAccessibility() {
    const selector = ".modal, .grv-card-modal, .grv-bills-modal";
    const getVisible = () => [...document.querySelectorAll(selector)].filter(m => {
      const cs = getComputedStyle(m);
      return cs.display !== "none" && cs.visibility !== "hidden";
    });
    const syncBodyLock = () => { document.body.style.overflow = getVisible().length ? "hidden" : ""; };

    document.querySelectorAll(selector).forEach(modal => {
      if (!modal.hasAttribute("role")) modal.setAttribute("role", "dialog");
      if (!modal.hasAttribute("aria-modal")) modal.setAttribute("aria-modal", "true");
      const observer = new MutationObserver(syncBodyLock);
      observer.observe(modal, {attributes:true, attributeFilter:["style"]});
    });

    document.addEventListener("keydown", e => {
      const visible = getVisible();
      if (!visible.length) return;
      const modal = visible[visible.length - 1];
      if (e.key === "Escape") {
        e.preventDefault();
        const close = modal.querySelector(".close-modal, .grv-bills-close, .grv-card-close");
        if (close) close.click();
        else if (typeof window.closeGrvBillPayment === "function" && modal.id === "grvBillPaymentModal") window.closeGrvBillPayment();
        else if (typeof window.closeGrvBills === "function" && modal.id === "grvBillsModal") window.closeGrvBills();
        else if (typeof window.closeGrvCardConfig === "function" && modal.id === "grvCardConfigModal") window.closeGrvCardConfig();
        else modal.style.display = "none";
        syncBodyLock();
        return;
      }
      if (e.key === "Tab") {
        const focusables = [...modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    document.addEventListener("click", e => {
      const modal = e.target.closest(selector);
      if (!modal || e.target !== modal) return;
      const close = modal.querySelector(".close-modal, .grv-bills-close, .grv-card-close");
      if (close) close.click();
      else modal.style.display = "none";
      syncBodyLock();
    });
    syncBodyLock();
  }
  /* ════════════════════════════════════════════════════════════════════
       7. MODALS — smooth open/close layered on top of style.display
       ════════════════════════════════════════════════════════════════════ */

  function setupModalAnimations() {
    if (REDUCE_MOTION) return;

    document.querySelectorAll(".modal").forEach((modal) => {
      // Animate only opening. Closing is left to the existing app logic so
      // the modal/backdrop never gets forced visible for a frame, which can
      // cause a black/dark flash when the close button is clicked.
      const observer = new MutationObserver(() => {
        const isHidden = modal.style.display === "none";
        if (isHidden) {
          modal.classList.remove(
            "modal-opening",
            "modal-opening-active",
            "modal-closing",
            "modal-closing-active",
          );
          return;
        }

        modal.classList.remove("modal-closing", "modal-closing-active");
        modal.classList.add("modal-opening");
        nextFrame(() => modal.classList.add("modal-opening-active"));
        setTimeout(() => modal.classList.remove("modal-opening"), 300);
      });

      observer.observe(modal, { attributes: true, attributeFilter: ["style"] });
    });
  }

  /* ════════════════════════════════════════════════════════════════════
       8. TOAST — tasteful confirmation pop, wraps toast()
       ════════════════════════════════════════════════════════════════════ */

  function setupToastAnimation() {
    wrapGlobal("toast", () => {
      const el = document.getElementById("toastMsg");
      if (!el || REDUCE_MOTION) return;
      el.classList.remove("toast-pop");
      void el.offsetWidth;
      el.classList.add("toast-pop");
    });
  }

  /* ════════════════════════════════════════════════════════════════════
       9. CHARTS — nicer default animation for every Chart.js instance
       ════════════════════════════════════════════════════════════════════ */

  function setupChartDefaults() {
    if (typeof Chart === "undefined") return;
    if (REDUCE_MOTION) {
      Chart.defaults.animation = false;
      return;
    }
    Chart.defaults.animation = {
      duration: 900,
      easing: "easeOutQuart",
    };
  }

  /* ════════════════════════════════════════════════════════════════════
       INIT
       ════════════════════════════════════════════════════════════════════ */

  function init() {
    setupScrollReveal();
    setupTabTransitions();
    setupListAnimations();
    setupButtonRipple();
    setupLoadingButtons();
    setupAllCountUps();
    setupModalAnimations();
    setupModalAccessibility();
    setupToastAnimation();
    setupChartDefaults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
