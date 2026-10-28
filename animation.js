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
    const initiallyVisible = [];

    targets.forEach((el) => {
      const rect = el.getBoundingClientRect();

      // Keep content already inside the viewport visible on initial load.
      const isInitiallyVisible =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (isInitiallyVisible) {
        initiallyVisible.push(el);
      }

      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", `${Math.min(i, 8) * 60}ms`);
      i++;
    });

    // Prevent initially visible cards from starting in a hidden state.
    initiallyVisible.forEach((el) => {
      el.classList.add("is-visible");
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    // Preserve scroll-reveal animation for content below the viewport.
    targets.forEach((el) => {
      if (!initiallyVisible.includes(el)) {
        observer.observe(el);
      }
    });
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
    const d = decimals || 2;
    return `${sign}${prefix.replace("-", "")}${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  }

  /*
   * Count-up on CHANGE only. The first value shown is never counted up from zero (that made every
   * card flash ₹0 on load), and the text the app wrote is always restored at the end, so the final
   * format is exactly what the app produced.
   */
  function setupCountUp(id) {
    const el = document.getElementById(id);
    if (!el) return;

    let lastValue = null; // numeric value currently shown (null = nothing numeric yet)
    let lastWritten = "";
    const watch = () =>
      observer.observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });

    const runCountUp = (from, to, parsed, finalText) => {
      if (REDUCE_MOTION) {
        watch();
        return;
      }
      lastWritten = finalText;
      el.classList.add("is-counting");
      const duration = 550;
      const start = performance.now();
      const done = () => {
        el.classList.remove("is-counting");
        watch();
      };
      function step(now) {
        if (el.textContent !== lastWritten) {
          // The app wrote a newer value mid-animation: keep it, do not overwrite with a stale one.
          const p = parseMoney(el.textContent);
          lastValue = p ? p.value : null;
          done();
          return;
        }
        const progress = Math.min(1, (now - start) / duration);
        if (progress < 1) {
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          lastWritten = formatMoney(
            parsed.prefix,
            from + (to - from) * eased,
            parsed.decimals,
          );
          el.textContent = lastWritten;
          requestAnimationFrame(step);
        } else {
          lastWritten = finalText;
          el.textContent = finalText;
          done();
        }
      }
      requestAnimationFrame(step);
    };

    const observer = new MutationObserver(() => {
      const parsed = parseMoney(el.textContent);
      if (!parsed) {
        lastValue = null;
        return;
      }
      if (parsed.value === lastValue) return;
      const from = lastValue === null ? parsed.value : lastValue;
      lastValue = parsed.value;
      if (from === parsed.value) return; // first real value: show it as is
      observer.disconnect();
      runCountUp(from, parsed.value, parsed, el.textContent);
    });

    const initial = parseMoney(el.textContent);
    lastValue = initial ? initial.value : null;
    watch();
  }

  function setupAllCountUps() {
    [
      "statTotalExpenses",
      "statSalary",
      "statRemaining",
      "statSweetie",
      "statTotalSaving",
      "statMonthSaving",
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
    const getVisible = () =>
      [...document.querySelectorAll(selector)].filter((m) => {
        const cs = getComputedStyle(m);
        return cs.display !== "none" && cs.visibility !== "hidden";
      });
    const syncBodyLock = () => {
      document.body.style.overflow = getVisible().length ? "hidden" : "";
    };

    document.querySelectorAll(selector).forEach((modal) => {
      if (!modal.hasAttribute("role")) modal.setAttribute("role", "dialog");
      if (!modal.hasAttribute("aria-modal"))
        modal.setAttribute("aria-modal", "true");
      const observer = new MutationObserver(syncBodyLock);
      observer.observe(modal, { attributes: true, attributeFilter: ["style"] });
    });

    document.addEventListener("keydown", (e) => {
      const visible = getVisible();
      if (!visible.length) return;
      const modal = visible[visible.length - 1];
      if (e.key === "Escape") {
        e.preventDefault();
        const close = modal.querySelector(
          ".close-modal, .grv-bills-close, .grv-card-close",
        );
        if (close) close.click();
        else if (
          typeof window.closeGrvBillPayment === "function" &&
          modal.id === "grvBillPaymentModal"
        )
          window.closeGrvBillPayment();
        else if (
          typeof window.closeGrvBills === "function" &&
          modal.id === "grvBillsModal"
        )
          window.closeGrvBills();
        else if (
          typeof window.closeGrvCardConfig === "function" &&
          modal.id === "grvCardConfigModal"
        )
          window.closeGrvCardConfig();
        else modal.style.display = "none";
        syncBodyLock();
        return;
      }
      if (e.key === "Tab") {
        const focusables = [
          ...modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0],
          last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    document.addEventListener("click", (e) => {
      const modal = e.target.closest(selector);
      if (!modal || e.target !== modal) return;
      const close = modal.querySelector(
        ".close-modal, .grv-bills-close, .grv-card-close",
      );
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

/* ==========================================================
   GRVEXP — BRAHMOS-STYLE MISSILE FLY-BY → PAGE REVEAL
   Add at the very end of animation.js (replace old loader)
   Visual-only: does not change expense/business logic.
   ========================================================== */
(() => {
  if (window.__grvLaunchLoaderInstalled) return;
  window.__grvLaunchLoaderInstalled = true;

  // Corner path: "bl-tr" | "br-tl" | "tl-br" | "tr-bl"
  const DIRECTION = "bl-tr";
  const FLIGHT_MS = 650; // missile crossing time (fast)
  const FADE_START = 180; // when page starts revealing (ms)
  const FADE_MS = 380;

  const style = document.createElement("style");
  style.textContent = `
    #grv-launch-screen {
      position: fixed; inset: 0; z-index: 2147483647;
      overflow: hidden; pointer-events: none;
      background:
        radial-gradient(ellipse at 50% 50%, #101a30 0%, #060912 75%);
    }
    #grv-launch-screen .grv-lines {
      position: absolute; inset: 0; opacity: .12;
      background-image:
        linear-gradient(#4aa8ff 1px, transparent 1px),
        linear-gradient(90deg, #4aa8ff 1px, transparent 1px);
      background-size: 48px 48px;
    }
    #grv-launch-screen .grv-tag {
      position: absolute; left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      font: 800 13px/1 system-ui, sans-serif;
      letter-spacing: .5em; color: #7fd4ff; opacity: .85;
      text-shadow: 0 0 18px #3aa6ff88;
    }
    #grv-launch-screen .grv-missile {
      position: absolute; left: 0; top: 0; width: 0; height: 0;
      will-change: transform;
    }
    /* trail sits behind the missile (nose is at origin, points right) */
    #grv-launch-screen .grv-trail {
      position: absolute; left: -900px; top: -9px;
      width: 700px; height: 18px; border-radius: 20px;
      background: linear-gradient(90deg,
        transparent, #3aa6ff33 30%, #ff9a3c99 70%, #fff3c4);
      filter: blur(6px);
    }
    #grv-launch-screen .grv-trail-core {
      position: absolute; left: -700px; top: -2px;
      width: 500px; height: 4px; border-radius: 4px;
      background: linear-gradient(90deg, transparent, #fff 80%);
      filter: blur(1px);
    }
    #grv-launch-screen .grv-glow {
      position: absolute; left: -60px; top: -60px;
      width: 120px; height: 120px; border-radius: 50%;
      background: radial-gradient(circle, #9fe0ffcc, transparent 65%);
      filter: blur(6px);
    }
    #grv-launch-screen .grv-body {
      position: absolute; left: -220px; top: -20px;
      width: 220px; height: 40px;
      filter: drop-shadow(0 0 10px #4ab4ff88);
    }
    @media (prefers-reduced-motion: reduce) {
      #grv-launch-screen .grv-missile { display: none; }
    }
  `;

  const overlay = document.createElement("div");
  overlay.id = "grv-launch-screen";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", "Loading GrvExp dashboard");
  overlay.innerHTML = `
    <div class="grv-lines"></div>
    <div class="grv-tag">GRVEXP</div>
    <div class="grv-missile">
      <div class="grv-trail"></div>
      <div class="grv-trail-core"></div>
      <div class="grv-glow"></div>
      <svg class="grv-body" viewBox="0 0 220 40" aria-hidden="true">
        <defs>
          <linearGradient id="grvBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f4f8ff"/>
            <stop offset=".5" stop-color="#aebbd0"/>
            <stop offset="1" stop-color="#5b6882"/>
          </linearGradient>
          <linearGradient id="grvFin" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#1b2540"/>
            <stop offset="1" stop-color="#3b5fa8"/>
          </linearGradient>
          <radialGradient id="grvFlame" cx="1" cy=".5" r="1">
            <stop offset="0" stop-color="#fff"/>
            <stop offset=".4" stop-color="#ffc24a"/>
            <stop offset="1" stop-color="#ff5a1f00"/>
          </radialGradient>
        </defs>
        <!-- flame -->
        <ellipse cx="6" cy="20" rx="22" ry="7" fill="url(#grvFlame)"/>
        <!-- rear fins -->
        <path d="M24 13 L48 1 L74 13 Z" fill="url(#grvFin)"/>
        <path d="M24 27 L48 39 L74 27 Z" fill="url(#grvFin)"/>
        <!-- nozzle -->
        <rect x="10" y="14" width="14" height="12" rx="2" fill="#1a2033"/>
        <!-- body -->
        <path d="M22 13 H150 Q198 13 220 20 Q198 27 150 27 H22 Z" fill="url(#grvBody)"/>
        <!-- front canards -->
        <path d="M128 13 L140 6 L154 13 Z" fill="url(#grvFin)"/>
        <path d="M128 27 L140 34 L154 27 Z" fill="url(#grvFin)"/>
        <!-- accents -->
        <rect x="96" y="13" width="5" height="14" fill="#f7c948"/>
        <rect x="106" y="13" width="2" height="14" fill="#3aa6ff"/>
        <rect x="30" y="19" width="60" height="2" fill="#3aa6ff" opacity=".8"/>
        <path d="M172 14 Q200 17 214 20" stroke="#fff" stroke-width="1" fill="none" opacity=".7"/>
      </svg>
    </div>
  `;

  function mount() {
    if (!document.body || overlay.isConnected) return;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
  }

  function cleanup() {
    overlay.remove();
    style.remove();
  }

  let launched = false;
  function launch() {
    if (launched) return;
    launched = true;
    mount();

    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = 320; // keep missile + trail fully off-screen at the ends

    const pts = {
      "bl-tr": [
        [-m, H + m],
        [W + m, -m],
      ],
      "br-tl": [
        [W + m, H + m],
        [-m, -m],
      ],
      "tl-br": [
        [-m, -m],
        [W + m, H + m],
      ],
      "tr-bl": [
        [W + m, -m],
        [-m, H + m],
      ],
    };
    const [[sx, sy], [ex, ey]] = pts[DIRECTION] || pts["bl-tr"];
    const angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;

    const missile = overlay.querySelector(".grv-missile");
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduce || !missile.animate) {
      overlay
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 150,
          fill: "forwards",
        })
        .finished.then(cleanup, cleanup);
      return;
    }

    // Missile: fast diagonal pass, accelerating
    missile.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) rotate(${angle}deg)` },
        { transform: `translate(${ex}px, ${ey}px) rotate(${angle}deg)` },
      ],
      {
        duration: FLIGHT_MS,
        easing: "cubic-bezier(.45,0,.85,.55)",
        fill: "forwards",
      },
    );

    // Page reveal starts while the missile is still crossing
    overlay
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        delay: FADE_START,
        easing: "ease-out",
        fill: "forwards",
      })
      .finished.then(cleanup, cleanup);

    setTimeout(cleanup, FADE_START + FADE_MS + 150); // safety
  }

  // Cover the page from the first paint
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  // Launch as soon as DOM is ready (don't wait for images/fonts)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", launch, { once: true });
  } else {
    launch();
  }

  setTimeout(launch, 1200); // safety fallback
})();

/* ==========================================================
   GRVEXP — MISSILE FLY-BY LOADER (compositor-only, smooth)
   Add at the very end of animation.js (replace old loader)
   Visual-only: does not change expense/business logic.
   ========================================================== */
(() => {
  if (window.__grvLaunchLoaderInstalled) return;
  window.__grvLaunchLoaderInstalled = true;

  const CFG = {
    corner: "bl-tr", // "bl-tr" | "br-tl" | "tl-br" | "tr-bl"
    flight: 900, // total missile flight (ms)
    revealAt: 0.3, // page starts revealing at 30% of the flight
    revealMs: 450, // background fade duration (ms)
  };
  const BASE_LEN = 760; // trail + missile length in px (before scaling)

  const style = document.createElement("style");
  style.textContent = `
    #grv-launch-bg, #grv-launch-fx {
      position: fixed; inset: 0;
      pointer-events: none; overflow: hidden;
    }
    #grv-launch-bg {
      z-index: 2147483646;
      background: radial-gradient(ellipse at 50% 50%, #12203a 0%, #060912 78%);
      will-change: opacity;
    }
    #grv-launch-bg .grv-grid {
      position: absolute; inset: 0; opacity: .1;
      background-image:
        linear-gradient(#4aa8ff 1px, transparent 1px),
        linear-gradient(90deg, #4aa8ff 1px, transparent 1px);
      background-size: 48px 48px;
    }
    #grv-launch-bg .grv-tag {
      position: absolute; left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      font: 800 13px/1 system-ui, sans-serif;
      letter-spacing: .5em; color: #7fd4ff; opacity: .8;
      text-indent: .5em;
    }
    #grv-launch-fx { z-index: 2147483647; }

    /* Nose sits exactly at the element's top-left origin (0,0) of the page,
       so translate+rotate+scale all pivot around the nose. */
    #grv-launch-fx .grv-m {
      position: absolute; left: -${BASE_LEN}px; top: -28px;
      width: ${BASE_LEN}px; height: 56px;
      transform-origin: 100% 50%;
      opacity: 0;
      will-change: transform, opacity;
      backface-visibility: hidden;
    }
    #grv-launch-fx .grv-smoke,
    #grv-launch-fx .grv-glow,
    #grv-launch-fx .grv-core {
      position: absolute; top: 50%;
    }
    /* wide faint contrail */
    #grv-launch-fx .grv-smoke {
      right: 290px; width: 470px; height: 90px; margin-top: -45px;
      background: radial-gradient(ellipse 100% 50% at 100% 50%,
        rgba(190,215,255,.22) 0%, rgba(120,170,255,.08) 50%, transparent 100%);
    }
    /* orange/blue exhaust glow */
    #grv-launch-fx .grv-glow {
      right: 270px; width: 470px; height: 64px; margin-top: -32px;
      background: radial-gradient(ellipse 100% 50% at 100% 50%,
        rgba(255,214,130,.95) 0%, rgba(255,128,40,.5) 25%,
        rgba(70,150,255,.18) 55%, transparent 100%);
    }
    /* white-hot core */
    #grv-launch-fx .grv-core {
      right: 262px; width: 330px; height: 9px; margin-top: -4.5px;
      background: radial-gradient(ellipse 100% 50% at 100% 50%,
        #fff 0%, rgba(255,236,176,.85) 30%, rgba(255,200,120,0) 100%);
    }
    #grv-launch-fx .grv-svg {
      position: absolute; right: 0; top: 0; width: 300px; height: 56px;
      overflow: visible;
    }
  `;

  const bg = document.createElement("div");
  bg.id = "grv-launch-bg";
  bg.innerHTML = `<div class="grv-grid"></div><div class="grv-tag">GRVEXP</div>`;

  const fx = document.createElement("div");
  fx.id = "grv-launch-fx";
  fx.setAttribute("role", "status");
  fx.setAttribute("aria-label", "Loading GrvExp dashboard");
  fx.innerHTML = `
    <div class="grv-m">
      <div class="grv-smoke"></div>
      <div class="grv-glow"></div>
      <div class="grv-core"></div>
      <svg class="grv-svg" viewBox="0 0 300 56" aria-hidden="true">
        <defs>
          <linearGradient id="grvBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset=".45" stop-color="#c3cde0"/>
            <stop offset="1" stop-color="#6b7896"/>
          </linearGradient>
          <linearGradient id="grvFin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#4b6fb8"/>
            <stop offset="1" stop-color="#1a2342"/>
          </linearGradient>
          <radialGradient id="grvFlame">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset=".35" stop-color="#ffd36b"/>
            <stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- engine flame -->
        <ellipse cx="22" cy="28" rx="30" ry="10" fill="url(#grvFlame)"/>

        <!-- rear fins + front canards (under the body) -->
        <g fill="url(#grvFin)" stroke="#0b1020" stroke-width=".8" stroke-linejoin="round">
          <path d="M52 18 L72 2 L100 18 Z"/>
          <path d="M52 38 L72 54 L100 38 Z"/>
          <path d="M168 18 L180 8 L196 18 Z"/>
          <path d="M168 38 L180 48 L196 38 Z"/>
        </g>

        <!-- nozzle -->
        <rect x="34" y="20" width="16" height="16" rx="2" fill="#141a2e"/>

        <!-- body -->
        <path d="M46 18 H190 C236 18 276 23 300 28 C276 33 236 38 190 38 H46 Z"
              fill="url(#grvBody)" stroke="#0b1020" stroke-width=".9" stroke-linejoin="round"/>

        <!-- colour bands -->
        <rect x="110" y="18" width="7" height="20" fill="#ff9933"/>
        <rect x="119" y="18" width="3" height="20" fill="#3aa6ff"/>
        <rect x="124" y="18" width="7" height="20" fill="#138808"/>

        <!-- panel lines + highlight + nose tip -->
        <path d="M150 18 V38 M205 19 V37" stroke="#0b1020" stroke-opacity=".35" stroke-width=".8" fill="none"/>
        <path d="M58 21.5 H190 C228 21.5 258 24.5 284 27" stroke="#fff" stroke-opacity=".85" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M262 24.6 C276 25.5 290 26.8 300 28 C290 29.2 276 30.5 262 31.4 Z" fill="#2b3556"/>
      </svg>
    </div>
  `;

  let mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    document.head.appendChild(style);
    document.body.appendChild(bg);
    document.body.appendChild(fx);
  }

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    bg.remove();
    fx.remove();
    style.remove();
  }

  function run() {
    const missile = fx.querySelector(".grv-m");
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No animation support or reduced motion -> quick simple fade
    if (reduce || !missile.animate) {
      if (bg.animate) {
        bg.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 150,
          fill: "forwards",
        }).finished.then(cleanup, cleanup);
      } else cleanup();
      fx.remove();
      return;
    }

    const W = window.innerWidth,
      H = window.innerHeight;
    const corners = { tl: [0, 0], tr: [W, 0], bl: [0, H], br: [W, H] };
    const [a, b] = CFG.corner.split("-");
    const [x0, y0] = corners[a] || corners.bl;
    const [x1, y1] = corners[b] || corners.tr;

    const dx = x1 - x0,
      dy = y1 - y0,
      dist = Math.hypot(dx, dy);
    const ux = dx / dist,
      uy = dy / dist;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const s = Math.min(1.3, Math.max(0.7, W / 1000)); // scale by screen size

    const pad = 40 * s;
    const total = BASE_LEN * s;
    // start: nose just outside first corner (whole missile off-screen)
    const sx = x0 - ux * pad,
      sy = y0 - uy * pad;
    // end: nose far enough past last corner that the tail/trail clears too
    const ex = x1 + ux * (total + pad),
      ey = y1 + uy * (total + pad);

    const tf = (x, y) =>
      `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${s})`;

    // Wait two frames so layers are painted/promoted -> no dropped first frames
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const fly = missile.animate(
          [
            { transform: tf(sx, sy), opacity: 1 },
            { transform: tf(ex, ey), opacity: 1 },
          ],
          {
            duration: CFG.flight,
            easing: "cubic-bezier(.45,.05,.55,.95)",
            fill: "both",
          },
        );

        // Background fades while the missile is still flying on its own layer
        const fade = bg.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: CFG.revealMs,
          delay: CFG.flight * CFG.revealAt,
          easing: "ease-out",
          fill: "both",
        });

        Promise.all([fly.finished, fade.finished]).then(cleanup, cleanup);
      }),
    );

    setTimeout(cleanup, CFG.flight + 1200); // safety net
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    mount();
    run();
  }

  // Cover the page from the very first paint
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  // Launch as soon as the DOM is ready (don't wait for images/fonts)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  setTimeout(start, 1200); // safety fallback
})();
