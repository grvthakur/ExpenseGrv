/* GRV Expense Tracker theme switcher — dropdown-fixed build.
   Targets the real app selectors: .stat, .card, .table-wrapper, .topbar,
   .field, .btn, .expense-table. Does not modify transaction logic. */
(function () {
  "use strict";
  var KEY = "grv-expense-visual-theme";
  var THEMES = [
    ["default", "Default (Current Design)"],
    ["skeuomorphism", "Skeuomorphism"],
    ["neumorphism", "Neumorphism"],
    ["glassmorphism", "Glassmorphism"],
    ["claymorphism", "Claymorphism"],
    ["minimalism", "Minimalism"],
    ["brutalism", "Brutalism"],
    ["liquid-glass", "Liquid Glass"],
    ["spatial-ui", "Spatial UI"],
    ["cartoon", "Cartoon"],
    ["space", "Space"],
  ];
  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return THEMES.some(function (t) {
        return t[0] === v;
      })
        ? v
        : "default";
    } catch (e) {
      return "default";
    }
  }
  function apply(v) {
    var b = document.body,
      h = document.documentElement;
    if (v === "default") {
      b.removeAttribute("data-grv-visual-theme");
      h.removeAttribute("data-grv-visual-theme");
    } else {
      b.setAttribute("data-grv-visual-theme", v);
      h.setAttribute("data-grv-visual-theme", v);
    }
    // The floating widget lives under HTML for reliable iOS fixed positioning;
    // mirror active theme variables from BODY so its colours still follow the theme.
    var themeWidget = document.getElementById("grv-visual-theme-widget");
    if (themeWidget) {
      var computedBody = window.getComputedStyle(b);
      ["--text", "--surface", "--s2", "--border", "--accent", "--bg"].forEach(
        function (name) {
          var value = computedBody.getPropertyValue(name);
          if (value) themeWidget.style.setProperty(name, value);
          else themeWidget.style.removeProperty(name);
        },
      );
    }
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {}
    var s = document.getElementById("grv-visual-theme-select");
    if (s) s.value = v;
    document
      .querySelectorAll("#grv-visual-theme-list button")
      .forEach(function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-theme") === v);
      });
    var status = document.getElementById("grv-visual-theme-status");
    if (status)
      status.textContent =
        "Active style: " +
        THEMES.filter(function (t) {
          return t[0] === v;
        })[0][1];
  }
  function init() {
    if (document.getElementById("grv-visual-theme-widget")) return;
    var css = `
#grv-visual-theme-widget{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:inherit;color:var(--text,#eee)}
#grv-visual-theme-widget *{box-sizing:border-box}
#grv-visual-theme-toggle{border:1px solid var(--border,#555);border-radius:999px;padding:12px 16px;background:var(--surface,#181820);color:var(--text,#eee);box-shadow:0 4px 18px #0004;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
#grv-visual-theme-panel{display:none;position:absolute;right:0;bottom:54px;width:min(320px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:14px;border:1px solid var(--border,#555);border-radius:16px;background:var(--surface,#181820);color:var(--text,#eee);box-shadow:0 12px 40px #0005}
#grv-visual-theme-panel.is-open{display:block}#grv-visual-theme-panel label,#grv-visual-theme-label{display:block;font-size:12px;font-weight:700;margin-bottom:8px}
#grv-visual-theme-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}#grv-visual-theme-list button{min-height:42px;padding:8px;border:1px solid var(--border,#555);border-radius:10px;background:var(--s2,#222);color:var(--text,#eee);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-align:left}#grv-visual-theme-list button.is-active{outline:2px solid var(--accent,#7dd3fc);font-weight:800}#grv-visual-theme-select{width:100%;min-height:42px;padding:9px;border:1px solid var(--border,#555);border-radius:10px;background:var(--s2,#222);color:var(--text,#eee);font:inherit}
#grv-visual-theme-list button:focus-visible,#grv-visual-theme-toggle:focus-visible{outline:3px solid var(--accent,#7dd3fc);outline-offset:3px}
#grv-visual-theme-status{font-size:12px;opacity:.8;margin:10px 2px 2px}
@media(max-width:600px){#grv-visual-theme-widget{right:10px;bottom:10px}#grv-visual-theme-toggle{min-height:44px}}

@media(max-width:600px){
  /* JavaScript aligns this control to the real info button; these are safe fallbacks. */
  #grv-visual-theme-widget{
    right:calc(31px + 70px);
    top:calc(env(safe-area-inset-top, 0px) + 145px);
    bottom:auto;
    width:48px;
    height:48px;
  }
  #grv-visual-theme-toggle{
    width:48px;
    height:48px;
    min-height:48px;
    padding:0;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:0;
    line-height:1;
    background:var(--surface,rgba(30,70,110,.65));
    border:1px solid var(--border,rgba(220,240,255,.55));
    box-shadow:0 4px 14px #0003;
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
  }
  #grv-visual-theme-toggle::before{
    content:"🎨";
    font-size:22px;
  }
  #grv-visual-theme-toggle:focus-visible{
    outline:3px solid var(--accent,#7dd3fc);
    outline-offset:3px;
  }
  /* The panel opens below the circular button and stays inside the viewport. */
  #grv-visual-theme-panel{
    top:56px;
    bottom:auto;
    right:-70px;
    width:min(320px,calc(100vw - 24px));
    max-height:calc(100dvh - 220px);
  }
}
@media(max-width:380px){
  #grv-visual-theme-widget{right:calc(28px + 64px);top:calc(env(safe-area-inset-top, 0px) + 145px)}
  #grv-visual-theme-panel{right:-66px;width:calc(100vw - 24px)}
}

/* Strongly differentiated palettes, layered over the app's existing CSS variables. */
body[data-grv-visual-theme="skeuomorphism"]{--bg:#252a31;--surface:#39414c;--s2:#2d333c;--border:#687381;--accent:#75d5f0;--green:#67d6a1;--pink:#f29bc4;--danger:#ff8585;--muted:#c0c7d0;--text:#f5f7fa;--radius:12px;--radius-sm:7px}
body[data-grv-visual-theme="neumorphism"]{--bg:#dfe4ec;--surface:#e8edf4;--s2:#dfe4ec;--border:#dfe4ec;--accent:#566eaa;--green:#277e65;--pink:#b64e83;--danger:#b63c4b;--muted:#65718a;--text:#293247;--radius:20px;--radius-sm:13px}
body[data-grv-visual-theme="glassmorphism"]{--bg:#101b35;--surface:rgba(39,57,91,.72);--s2:rgba(53,75,115,.72);--border:rgba(180,211,255,.32);--accent:#8bdcff;--green:#7be6bc;--pink:#ffa8db;--danger:#ff9ca7;--muted:#b5c7e5;--text:#f2f7ff;--radius:18px;--radius-sm:12px}
body[data-grv-visual-theme="claymorphism"]{--bg:#f3e3d8;--surface:#fff0e6;--s2:#f8ddcc;--border:#f1c8b2;--accent:#b55c7b;--green:#39856c;--pink:#c65d8d;--danger:#bd4651;--muted:#826b70;--text:#49343a;--radius:23px;--radius-sm:15px}
body[data-grv-visual-theme="minimalism"]{--bg:#f5f6f8;--surface:#fff;--s2:#f0f1f4;--border:#dfe2e8;--accent:#374151;--green:#28765c;--pink:#a34f78;--danger:#b33c48;--muted:#687080;--text:#20242b;--radius:8px;--radius-sm:5px}
body[data-grv-visual-theme="brutalism"]{--bg:#fff4c7;--surface:#fffdf5;--s2:#ffe36e;--border:#171717;--accent:#ff5b35;--green:#137a50;--pink:#e83e88;--danger:#d92727;--muted:#383838;--text:#171717;--radius:2px;--radius-sm:2px}
body[data-grv-visual-theme="liquid-glass"]{--bg:#102b4a;--surface:rgba(41,105,157,.56);--s2:rgba(64,139,192,.42);--border:rgba(190,232,255,.42);--accent:#9de9ff;--green:#8cf0ca;--pink:#ffb7e9;--danger:#ff9dad;--muted:#c2e0f5;--text:#f4fbff;--radius:24px;--radius-sm:16px}
body[data-grv-visual-theme="spatial-ui"]{--bg:#14151e;--surface:#222634;--s2:#2c3243;--border:#41495f;--accent:#a7b8ff;--green:#7fe0bd;--pink:#e6a9ff;--danger:#ff9caa;--muted:#abb3ca;--text:#f4f5ff;--radius:18px;--radius-sm:11px}
/* Keep the existing light/dark toggle in charge; adapt selected glass themes in light mode. */
body.light-mode[data-grv-visual-theme="glassmorphism"]{--bg:#dceaff;--surface:rgba(255,255,255,.7);--s2:#e5efff;--text:#203354;--muted:#506a91}
body.light-mode[data-grv-visual-theme="liquid-glass"]{--bg:#d8f1ff;--surface:rgba(255,255,255,.72);--s2:#dff4ff;--text:#183650;--muted:#4d728a}
body.light-mode[data-grv-visual-theme="spatial-ui"]{--bg:#eceefa;--surface:#fff;--s2:#e2e6f5;--text:#292e46;--muted:#69718d}
/* Actual ExpenseGrv dashboard elements */
body[data-grv-visual-theme] .topbar{background:var(--surface);border-color:var(--border)}
body[data-grv-visual-theme] .stat,body[data-grv-visual-theme] .card,body[data-grv-visual-theme] .table-wrapper,body[data-grv-visual-theme] .modal-content,body[data-grv-visual-theme] .month-picker{background:var(--surface);border-color:var(--border);color:var(--text)}
body[data-grv-visual-theme] .field input,body[data-grv-visual-theme] .field select,body[data-grv-visual-theme] .salary-input-group input,body[data-grv-visual-theme] .month-picker select,body[data-grv-visual-theme] .btn-secondary{background:var(--s2);border-color:var(--border);color:var(--text)}
body[data-grv-visual-theme] .expense-table th{background:var(--s2);color:var(--accent);border-color:var(--border)}
body[data-grv-visual-theme] .expense-table td{border-color:var(--border);color:var(--text)}
body[data-grv-visual-theme] .card-title:before{background:var(--accent)}
body[data-grv-visual-theme] .stat-label,body[data-grv-visual-theme] .salary-label,body[data-grv-visual-theme] .field label{color:var(--muted)}
body[data-grv-visual-theme] .btn-primary{background:var(--accent);color:var(--bg)}
body[data-grv-visual-theme] .btn-summary{background:var(--s2);border-color:var(--border);color:var(--accent)}
body[data-grv-visual-theme] .expense-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--accent) 5%,var(--surface))}
body[data-grv-visual-theme="skeuomorphism"] .stat,body[data-grv-visual-theme="skeuomorphism"] .card,body[data-grv-visual-theme="skeuomorphism"] .table-wrapper,body[data-grv-visual-theme="skeuomorphism"] .modal-content{box-shadow:inset 0 1px #ffffff52,0 5px 12px #0004;background-image:linear-gradient(#ffffff14,#00000012)}
body[data-grv-visual-theme="neumorphism"] .stat,body[data-grv-visual-theme="neumorphism"] .card,body[data-grv-visual-theme="neumorphism"] .table-wrapper,body[data-grv-visual-theme="neumorphism"] .modal-content{border-color:transparent;box-shadow:8px 8px 18px #5d687c38,-8px -8px 18px #ffffffd1}
body[data-grv-visual-theme="glassmorphism"] .stat,body[data-grv-visual-theme="glassmorphism"] .card,body[data-grv-visual-theme="glassmorphism"] .table-wrapper,body[data-grv-visual-theme="glassmorphism"] .modal-content{backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);background:rgba(47,67,105,.56);border:1px solid #daedff52;box-shadow:0 12px 32px #0003}
body.light-mode[data-grv-visual-theme="glassmorphism"] .stat,body.light-mode[data-grv-visual-theme="glassmorphism"] .card,body.light-mode[data-grv-visual-theme="glassmorphism"] .table-wrapper{background:#ffffffa6}
body[data-grv-visual-theme="claymorphism"] .stat,body[data-grv-visual-theme="claymorphism"] .card,body[data-grv-visual-theme="claymorphism"] .table-wrapper,body[data-grv-visual-theme="claymorphism"] .modal-content{border:1px solid #ffffffcc;box-shadow:0 8px 0 #9759461a,0 15px 26px #774b6126}
body[data-grv-visual-theme="claymorphism"] .btn,body[data-grv-visual-theme="claymorphism"] .btn-summary{border-radius:15px;box-shadow:0 4px 0 #70413e26}
body[data-grv-visual-theme="minimalism"] .stat,body[data-grv-visual-theme="minimalism"] .card,body[data-grv-visual-theme="minimalism"] .table-wrapper,body[data-grv-visual-theme="minimalism"] .modal-content{box-shadow:none;border:1px solid #dfe2e8}
body[data-grv-visual-theme="minimalism"] .card-title:before{display:none}
body[data-grv-visual-theme="brutalism"] .stat,body[data-grv-visual-theme="brutalism"] .card,body[data-grv-visual-theme="brutalism"] .table-wrapper,body[data-grv-visual-theme="brutalism"] .modal-content{border:2px solid #171717;box-shadow:5px 5px 0 #171717}
body[data-grv-visual-theme="brutalism"] .btn,body[data-grv-visual-theme="brutalism"] .btn-summary,body[data-grv-visual-theme="brutalism"] input,body[data-grv-visual-theme="brutalism"] select{border:2px solid #171717;border-radius:2px;box-shadow:3px 3px 0 #171717;font-weight:800}
body[data-grv-visual-theme="liquid-glass"] .stat,body[data-grv-visual-theme="liquid-glass"] .card,body[data-grv-visual-theme="liquid-glass"] .table-wrapper,body[data-grv-visual-theme="liquid-glass"] .modal-content{backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);background:#3d8ec257;border:1px solid #d7f7ff8c;box-shadow:inset 0 1px #ffffff73,0 15px 34px #0003}
body.light-mode[data-grv-visual-theme="liquid-glass"] .stat,body.light-mode[data-grv-visual-theme="liquid-glass"] .card,body.light-mode[data-grv-visual-theme="liquid-glass"] .table-wrapper{background:#ffffff99}
body[data-grv-visual-theme="spatial-ui"] .stat,body[data-grv-visual-theme="spatial-ui"] .card,body[data-grv-visual-theme="spatial-ui"] .table-wrapper,body[data-grv-visual-theme="spatial-ui"] .modal-content{box-shadow:0 14px 28px #0005,0 3px 7px #0002;transform:translateZ(0)}
body[data-grv-visual-theme="spatial-ui"] .stat:hover,body[data-grv-visual-theme="spatial-ui"] .card:hover{box-shadow:0 18px 34px #0006;transform:translateY(-2px)}
@media(prefers-reduced-motion:reduce){body[data-grv-visual-theme="spatial-ui"] .stat,body[data-grv-visual-theme="spatial-ui"] .card{transition:none}}
/* ═══ BACKGROUNDS v3 — each style gets its own full-page scene (the big visual difference) ═══ */
body[data-grv-visual-theme]{background-attachment:fixed!important;background-size:cover;background-repeat:no-repeat;transition:background .5s ease}
body[data-grv-visual-theme] .topbar{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}

/* Skeuomorphism: brushed-metal / leather desk with vignette */
body[data-grv-visual-theme="skeuomorphism"]{background:
 radial-gradient(ellipse at 50% 0%,#ffffff1f,transparent 55%),
 radial-gradient(ellipse at 50% 120%,#000000b0,transparent 60%),
 repeating-linear-gradient(90deg,#ffffff07 0 1px,transparent 1px 3px),
 repeating-linear-gradient(0deg,#00000014 0 1px,transparent 1px 4px),
 linear-gradient(160deg,#4a5260,#2a2f38 55%,#1d2128)!important}

/* Neumorphism: soft single-tone surface with light from top-left */
body[data-grv-visual-theme="neumorphism"]{background:
 radial-gradient(circle at 15% 10%,#ffffffcc,transparent 45%),
 radial-gradient(circle at 90% 95%,#b9c2d455,transparent 50%),
 linear-gradient(145deg,#e9eef6,#d5dbe6)!important}

/* Glassmorphism: deep navy with vivid colour orbs behind the glass */
body[data-grv-visual-theme="glassmorphism"]{background:
 radial-gradient(circle at 12% 18%,#7c3aedcc,transparent 32%),
 radial-gradient(circle at 88% 12%,#06b6d4bb,transparent 34%),
 radial-gradient(circle at 78% 85%,#ec4899b0,transparent 36%),
 radial-gradient(circle at 18% 88%,#3b82f6aa,transparent 34%),
 linear-gradient(135deg,#0b1130,#141a45 55%,#0a0f2a)!important;background-size:140% 140%;animation:grvOrbs 22s ease-in-out infinite alternate}
body.light-mode[data-grv-visual-theme="glassmorphism"]{background:
 radial-gradient(circle at 12% 18%,#c4b5fdcc,transparent 34%),
 radial-gradient(circle at 88% 12%,#67e8f9bb,transparent 36%),
 radial-gradient(circle at 78% 85%,#f9a8d4b0,transparent 38%),
 linear-gradient(135deg,#e0ecff,#f3e8ff)!important}

/* Claymorphism: pastel candy blobs */
body[data-grv-visual-theme="claymorphism"]{background:
 radial-gradient(circle at 10% 12%,#ffb8d2cc,transparent 28%),
 radial-gradient(circle at 92% 18%,#b6e3ffcc,transparent 30%),
 radial-gradient(circle at 85% 90%,#c9f2c7cc,transparent 30%),
 radial-gradient(circle at 15% 85%,#ffd9a8cc,transparent 30%),
 linear-gradient(160deg,#fbeadf,#f6dccb)!important}

/* Minimalism: clean paper + faint dot grid */
body[data-grv-visual-theme="minimalism"]{background:
 radial-gradient(#0000001c 1px,transparent 1.2px) 0 0/22px 22px,
 linear-gradient(#f8f9fb,#eceef2)!important}

/* Brutalism: loud yellow + thick black grid */
body[data-grv-visual-theme="brutalism"]{background:
 linear-gradient(#17171726 2px,transparent 2px) 0 0/48px 48px,
 linear-gradient(90deg,#17171726 2px,transparent 2px) 0 0/48px 48px,
 linear-gradient(135deg,#ffe14d 0 50%,#ff9f6b 50% 100%)!important}

/* Liquid Glass: flowing aqua / ocean gradients */
body[data-grv-visual-theme="liquid-glass"]{background:
 radial-gradient(ellipse 60% 45% at 20% 25%,#22d3eecc,transparent 60%),
 radial-gradient(ellipse 55% 50% at 85% 30%,#6366f1b8,transparent 60%),
 radial-gradient(ellipse 65% 50% at 60% 90%,#14b8a6b0,transparent 60%),
 radial-gradient(ellipse 50% 45% at 5% 95%,#38bdf8aa,transparent 60%),
 linear-gradient(160deg,#06284a,#0a3f6b 50%,#052338)!important;background-size:150% 150%;animation:grvLiquid 18s ease-in-out infinite alternate}
body.light-mode[data-grv-visual-theme="liquid-glass"]{background:
 radial-gradient(ellipse 60% 45% at 20% 25%,#7dd3fccc,transparent 60%),
 radial-gradient(ellipse 55% 50% at 85% 30%,#a5b4fcb8,transparent 60%),
 radial-gradient(ellipse 65% 50% at 60% 90%,#5eead4b0,transparent 60%),
 linear-gradient(160deg,#e0f5ff,#d6ecff)!important}

/* Spatial UI: dark space, aurora glow + perspective grid */
body[data-grv-visual-theme="spatial-ui"]{background:
 radial-gradient(ellipse 70% 40% at 50% -5%,#8b5cf6aa,transparent 65%),
 radial-gradient(ellipse 50% 35% at 100% 40%,#06b6d455,transparent 65%),
 radial-gradient(ellipse 50% 35% at 0% 60%,#ec489955,transparent 65%),
 linear-gradient(#a7b8ff12 1px,transparent 1px) 0 0/56px 56px,
 linear-gradient(90deg,#a7b8ff12 1px,transparent 1px) 0 0/56px 56px,
 linear-gradient(180deg,#0b0c14,#161827)!important}
body.light-mode[data-grv-visual-theme="spatial-ui"]{background:
 radial-gradient(ellipse 70% 40% at 50% -5%,#c4b5fd99,transparent 65%),
 radial-gradient(ellipse 50% 35% at 100% 40%,#a5f3fc88,transparent 65%),
 linear-gradient(180deg,#f1f2fb,#e4e7f6)!important}

@keyframes grvOrbs{0%{background-position:0% 0%}100%{background-position:100% 100%}}
@keyframes grvLiquid{0%{background-position:0% 30%}100%{background-position:100% 70%}}
@media(prefers-reduced-motion:reduce){body[data-grv-visual-theme]{animation:none!important}}
/* Make cards/stats clearly "float" over the scene in see-through themes */
body[data-grv-visual-theme="glassmorphism"] .stat,body[data-grv-visual-theme="glassmorphism"] .card,body[data-grv-visual-theme="glassmorphism"] .table-wrapper{background:rgba(255,255,255,.09)!important;border:1px solid rgba(255,255,255,.28)!important}
body[data-grv-visual-theme="liquid-glass"] .stat,body[data-grv-visual-theme="liquid-glass"] .card,body[data-grv-visual-theme="liquid-glass"] .table-wrapper{background:rgba(255,255,255,.12)!important}
body[data-grv-visual-theme="spatial-ui"] .stat,body[data-grv-visual-theme="spatial-ui"] .card,body[data-grv-visual-theme="spatial-ui"] .table-wrapper{background:rgba(34,38,52,.78)!important;border:1px solid #a7b8ff30!important}
body.light-mode[data-grv-visual-theme="glassmorphism"] .stat,body.light-mode[data-grv-visual-theme="glassmorphism"] .card,body.light-mode[data-grv-visual-theme="glassmorphism"] .table-wrapper,body.light-mode[data-grv-visual-theme="liquid-glass"] .stat,body.light-mode[data-grv-visual-theme="liquid-glass"] .card,body.light-mode[data-grv-visual-theme="liquid-glass"] .table-wrapper{background:rgba(255,255,255,.55)!important}

/* ═══ CARTOON + SPACE ═══ */
body[data-grv-visual-theme="cartoon"]{--bg:#7dd3fc;--surface:#fffdf0;--s2:#fff3b0;--border:#1b1b1b;--accent:#ff4d6d;--green:#1fb36b;--pink:#ff4fa3;--danger:#e11d48;--muted:#4a4a4a;--text:#1b1b1b;--radius:20px;--radius-sm:14px;font-family:"Comic Sans MS","Chalkboard SE","Comic Neue",cursive,sans-serif!important}
body[data-grv-visual-theme="space"]{--bg:#05060f;--surface:rgba(14,18,40,.78);--s2:rgba(26,32,66,.82);--border:#3b4a8a;--accent:#7dd3fc;--green:#6ee7b7;--pink:#f0abfc;--danger:#fda4af;--muted:#9fb0e0;--text:#eef2ff;--radius:16px;--radius-sm:10px}

/* Cartoon scene: sky, sun with outline, fluffy clouds, halftone dots, grass */
body[data-grv-visual-theme="cartoon"]{background:
 radial-gradient(circle closest-side,#ffe14d 0 86%,#1b1b1b 88% 95%,transparent 97%) right 5% top 8%/96px 96px no-repeat,
 radial-gradient(ellipse closest-side,#fff 94%,transparent 100%) 8% 14%/150px 80px no-repeat,
 radial-gradient(ellipse closest-side,#fff 94%,transparent 100%) 13% 11%/110px 70px no-repeat,
 radial-gradient(ellipse closest-side,#fff 94%,transparent 100%) 55% 26%/170px 85px no-repeat,
 radial-gradient(ellipse closest-side,#fff 94%,transparent 100%) 62% 22%/120px 70px no-repeat,
 radial-gradient(ellipse closest-side,#fff 94%,transparent 100%) 30% 70%/160px 80px no-repeat,
 linear-gradient(#37b34a,#37b34a) bottom/100% 14px no-repeat,
 radial-gradient(#00000014 18%,transparent 20%) 0 0/20px 20px,
 linear-gradient(#4cc2ff,#c8f1ff)!important}
body[data-grv-visual-theme="cartoon"] .stat,body[data-grv-visual-theme="cartoon"] .card,body[data-grv-visual-theme="cartoon"] .table-wrapper,body[data-grv-visual-theme="cartoon"] .modal-content,body[data-grv-visual-theme="cartoon"] .topbar{border:3px solid #1b1b1b!important;box-shadow:6px 6px 0 #1b1b1b!important;background:#fffdf0!important;color:#1b1b1b}
body[data-grv-visual-theme="cartoon"] .topbar{border-radius:0 0 22px 22px;background:#ffe14d!important}
body[data-grv-visual-theme="cartoon"] .stat,body[data-grv-visual-theme="cartoon"] .card,body[data-grv-visual-theme="cartoon"] .table-wrapper{border-radius:20px}
body[data-grv-visual-theme="cartoon"] .stat:nth-child(4n+1){background:#ffb3c1!important}
body[data-grv-visual-theme="cartoon"] .stat:nth-child(4n+2){background:#b9f6ca!important}
body[data-grv-visual-theme="cartoon"] .stat:nth-child(4n+3){background:#bde0fe!important}
body[data-grv-visual-theme="cartoon"] .stat:nth-child(4n+4){background:#ffe58f!important}
body[data-grv-visual-theme="cartoon"] .stat-value,body[data-grv-visual-theme="cartoon"] .stat-label,body[data-grv-visual-theme="cartoon"] .salary-amount{color:#1b1b1b!important;font-weight:900}
body[data-grv-visual-theme="cartoon"] .btn,body[data-grv-visual-theme="cartoon"] .btn-summary,body[data-grv-visual-theme="cartoon"] .tab-btn,body[data-grv-visual-theme="cartoon"] .btn-edit{border:3px solid #1b1b1b!important;border-radius:16px!important;box-shadow:0 4px 0 #1b1b1b!important;font-weight:900!important;color:#1b1b1b!important;background:#fff!important}
body[data-grv-visual-theme="cartoon"] .btn-primary,body[data-grv-visual-theme="cartoon"] .tab-btn.tab-active{background:#ff4d6d!important;color:#fff!important}
body[data-grv-visual-theme="cartoon"] .btn:hover,body[data-grv-visual-theme="cartoon"] .btn-summary:hover,body[data-grv-visual-theme="cartoon"] .tab-btn:hover{animation:grvWobble .45s ease;background:#ffe14d!important;color:#1b1b1b!important}
body[data-grv-visual-theme="cartoon"] .btn:active,body[data-grv-visual-theme="cartoon"] .btn-summary:active{transform:translateY(4px);box-shadow:0 0 0 #1b1b1b!important}
body[data-grv-visual-theme="cartoon"] input,body[data-grv-visual-theme="cartoon"] select{border:3px solid #1b1b1b!important;border-radius:14px!important;background:#fff!important;color:#1b1b1b!important;font-weight:700}
body[data-grv-visual-theme="cartoon"] .expense-table th{background:#ffd93d!important;color:#1b1b1b!important;border-bottom:3px solid #1b1b1b!important;font-weight:900}
body[data-grv-visual-theme="cartoon"] .expense-table td{border-bottom:2px dashed #1b1b1b55!important}
@keyframes grvWobble{0%{transform:rotate(0)}25%{transform:rotate(-3deg) scale(1.05)}60%{transform:rotate(3deg) scale(1.05)}100%{transform:rotate(0)}}

/* Space scene: nebulae, two planets, twinkling star layers */
body[data-grv-visual-theme="space"]{background:
 radial-gradient(circle closest-side,#fde68a 0,#f59e0b 40%,#b45309 80%,#78350f 95%,transparent 100%) right 7% bottom 9%/130px 130px no-repeat,
 radial-gradient(circle closest-side,#bae6fd 0,#38bdf8 45%,#1d4ed8 90%,transparent 100%) left 6% top 16%/70px 70px no-repeat,
 radial-gradient(ellipse 60% 50% at 80% 8%,#7c3aed66,transparent 65%),
 radial-gradient(ellipse 55% 45% at 8% 85%,#0ea5e94d,transparent 65%),
 radial-gradient(ellipse 45% 40% at 55% 55%,#ec489933,transparent 65%),
 linear-gradient(180deg,#02030a,#080b1f 60%,#0b0f2c)!important}
body[data-grv-visual-theme="space"]::before,body[data-grv-visual-theme="space"]::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none}
body[data-grv-visual-theme="space"]::before{background-image:
 radial-gradient(1.5px 1.5px at 20px 30px,#fff,transparent),radial-gradient(1px 1px at 90px 140px,#cfe3ff,transparent),
 radial-gradient(1.5px 1.5px at 160px 70px,#fff,transparent),radial-gradient(1px 1px at 230px 190px,#ffe9c4,transparent),
 radial-gradient(2px 2px at 60px 210px,#fff,transparent),radial-gradient(1px 1px at 270px 40px,#fff,transparent);
 background-size:300px 250px;animation:grvTwinkle 5s ease-in-out infinite alternate}
body[data-grv-visual-theme="space"]::after{background-image:
 radial-gradient(1px 1px at 50px 60px,#fff,transparent),radial-gradient(2px 2px at 130px 180px,#b6d4ff,transparent),
 radial-gradient(1px 1px at 210px 110px,#fff,transparent),radial-gradient(1.5px 1.5px at 290px 220px,#fff,transparent);
 background-size:340px 280px;background-position:70px 40px;animation:grvTwinkle 7s ease-in-out infinite alternate-reverse}
@keyframes grvTwinkle{0%{opacity:.35}100%{opacity:1}}
body[data-grv-visual-theme="space"] .stat,body[data-grv-visual-theme="space"] .card,body[data-grv-visual-theme="space"] .table-wrapper,body[data-grv-visual-theme="space"] .modal-content{background:rgba(14,18,40,.72)!important;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid #5b6cc080!important;box-shadow:0 0 26px #7c3aed33,inset 0 0 0 1px #ffffff0a!important}
body[data-grv-visual-theme="space"] .topbar{background:rgba(5,7,20,.8)!important;border-bottom:1px solid #5b6cc080}
body[data-grv-visual-theme="space"] .btn-primary{background:linear-gradient(135deg,#7dd3fc,#a78bfa)!important;color:#05060f!important;box-shadow:0 0 18px #7dd3fc66}
body[data-grv-visual-theme="space"] .btn-summary:hover,body[data-grv-visual-theme="space"] .btn:hover{box-shadow:0 0 20px #7dd3fc77}
body.light-mode[data-grv-visual-theme="space"] input,body.light-mode[data-grv-visual-theme="space"] select,body.light-mode[data-grv-visual-theme="space"] textarea{color:#eef2ff!important;background:var(--s2)!important}
body.light-mode[data-grv-visual-theme="space"] .expense-table td span{color:#eef2ff!important;background:transparent!important}
@media(prefers-reduced-motion:reduce){body[data-grv-visual-theme="space"]::before,body[data-grv-visual-theme="space"]::after{animation:none}}
/* Cartoon visibility fix */
body[data-grv-visual-theme="cartoon"] *:not(.btn-primary):not(.tab-active):not(svg *){color:#1b1b1b!important;text-shadow:none!important}
body[data-grv-visual-theme="cartoon"] .btn-primary,body[data-grv-visual-theme="cartoon"] .btn-primary *,body[data-grv-visual-theme="cartoon"] .tab-btn.tab-active{color:#fff!important}
body[data-grv-visual-theme="cartoon"] .expense-table,body[data-grv-visual-theme="cartoon"] .expense-table tr,body[data-grv-visual-theme="cartoon"] .expense-table td{background:#fffdf0!important}
body[data-grv-visual-theme="cartoon"] .expense-table th{background:#ffd93d!important}
body[data-grv-visual-theme="cartoon"] .modal-content,body[data-grv-visual-theme="cartoon"] .month-picker,body[data-grv-visual-theme="cartoon"] .field{background:#fffdf0!important;border-color:#1b1b1b!important}
body[data-grv-visual-theme="cartoon"] #grv-visual-theme-panel{background:#fffdf0!important;border:3px solid #1b1b1b!important;box-shadow:5px 5px 0 #1b1b1b!important}
body[data-grv-visual-theme="cartoon"] #grv-visual-theme-list button,body[data-grv-visual-theme="cartoon"] #grv-visual-theme-toggle{background:#ffe14d!important;border:3px solid #1b1b1b!important}
body[data-grv-visual-theme="cartoon"] #grv-visual-theme-list button.is-active{background:#ff4d6d!important}
body[data-grv-visual-theme="cartoon"] #grv-visual-theme-list button.is-active{color:#fff!important}

/* ═══ POLISH v4 — premium refinement layer (visual only; no layout/logic changes) ═══ */
body[data-grv-visual-theme] .stat-value,body[data-grv-visual-theme] .expense-table td{font-variant-numeric:tabular-nums}
body[data-grv-visual-theme] .stat,body[data-grv-visual-theme] .card,body[data-grv-visual-theme] .btn,body[data-grv-visual-theme] .tab-btn,body[data-grv-visual-theme] .field input,body[data-grv-visual-theme] .field select{transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s ease,background .22s ease,border-color .22s ease}
body[data-grv-visual-theme] :is(.btn,.tab-btn,.field input,.field select):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
/* Skeuomorphism — stitched leather & brushed metal */
body[data-grv-visual-theme="skeuomorphism"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(180deg,#4a5360,#363d48 55%,#2f353f);border:1px solid #1b1f26;box-shadow:inset 0 1px 0 #ffffff40,inset 0 -2px 4px #0006,0 1px 0 #ffffff14,0 10px 22px #0007,0 2px 4px #0005;outline:1px dashed #ffffff22;outline-offset:-6px}
body[data-grv-visual-theme="skeuomorphism"] .stat-value{text-shadow:0 1px 0 #000a,0 -1px 0 #ffffff26}
body[data-grv-visual-theme="skeuomorphism"] .btn-primary{background:linear-gradient(180deg,#9be4f7,#4fb4d2 55%,#3a97b5);color:#10303b;text-shadow:0 1px 0 #ffffff80;border:1px solid #1d6a82;box-shadow:inset 0 1px 0 #fff9,0 3px 0 #1d6a82,0 6px 10px #0007}
body[data-grv-visual-theme="skeuomorphism"] .btn-primary:active{transform:translateY(3px);box-shadow:inset 0 2px 4px #0005,0 0 0 #0000}
body[data-grv-visual-theme="skeuomorphism"] :is(.field input,.field select){background:linear-gradient(180deg,#232830,#2d333c);box-shadow:inset 0 2px 5px #000a,0 1px 0 #ffffff1f}
/* Neumorphism — soft extrusion */
body[data-grv-visual-theme="neumorphism"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(145deg,#eef2f9,#d9dfe9);box-shadow:9px 9px 20px #b9c0cf,-9px -9px 20px #ffffff}
body[data-grv-visual-theme="neumorphism"] :is(.field input,.field select){background:#dfe4ec;border:0;box-shadow:inset 4px 4px 9px #b9c0cf,inset -4px -4px 9px #fff}
body[data-grv-visual-theme="neumorphism"] .btn{border:0;box-shadow:5px 5px 11px #b9c0cf,-5px -5px 11px #fff}
body[data-grv-visual-theme="neumorphism"] .btn:active,body[data-grv-visual-theme="neumorphism"] .tab-btn.tab-active{box-shadow:inset 4px 4px 9px #b9c0cf,inset -4px -4px 9px #fff}
body[data-grv-visual-theme="neumorphism"] .btn-primary{background:linear-gradient(145deg,#6a83c2,#4a62a0);color:#fff}
/* Glassmorphism — frosted pane with specular edge */
body[data-grv-visual-theme="glassmorphism"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(135deg,#ffffff2b,#ffffff0a);backdrop-filter:blur(22px) saturate(1.6);-webkit-backdrop-filter:blur(22px) saturate(1.6);border:1px solid #ffffff2e;box-shadow:inset 0 1px 0 #ffffff59,inset 0 0 0 1px #ffffff0d,0 18px 40px #0a143a66}
body[data-grv-visual-theme="glassmorphism"] .btn-primary{background:linear-gradient(135deg,#8bdcff,#a78bfa);color:#0d1530;box-shadow:0 8px 22px #8bdcff44}
body[data-grv-visual-theme="glassmorphism"] .stat:hover,body[data-grv-visual-theme="glassmorphism"] .card:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 #ffffff73,0 24px 46px #0a143a80}
/* Claymorphism — inflated, candy-soft */
body[data-grv-visual-theme="claymorphism"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(160deg,#fff7f1,#ffe4d3);box-shadow:inset 0 3px 0 #fff,inset 0 -6px 10px #f0b99a66,0 10px 0 #e9bda4,0 18px 26px #b5705a38}
body[data-grv-visual-theme="claymorphism"] .btn-primary{background:linear-gradient(160deg,#e07aa0,#b55c7b);color:#fff;border:0;box-shadow:inset 0 3px 0 #ffffff66,inset 0 -4px 6px #7a2e4a55,0 6px 0 #8f3f5e,0 12px 16px #8f3f5e44}
body[data-grv-visual-theme="claymorphism"] .btn:active{transform:translateY(4px);box-shadow:inset 0 3px 6px #7a2e4a44}
body[data-grv-visual-theme="claymorphism"] :is(.field input,.field select){border:2px solid #f1c8b2;box-shadow:inset 0 3px 6px #d9a98f55}
/* Minimalism — quiet, typographic */
body[data-grv-visual-theme="minimalism"] :is(.stat,.card,.table-wrapper,.modal-content){background:#fff;border:1px solid #e6e8ee;box-shadow:0 1px 2px #0f172a0a}
body[data-grv-visual-theme="minimalism"] .stat-label,body[data-grv-visual-theme="minimalism"] .expense-table th{text-transform:uppercase;letter-spacing:.08em;font-size:.72em;font-weight:600}
body[data-grv-visual-theme="minimalism"] .stat-value{font-weight:600;letter-spacing:-.02em}
body[data-grv-visual-theme="minimalism"] .btn-primary{background:#111827;color:#fff;box-shadow:none}
body[data-grv-visual-theme="minimalism"] .btn-primary:hover{background:#000}
body[data-grv-visual-theme="minimalism"] .tab-btn.tab-active{box-shadow:inset 0 -2px 0 #111827}
/* Brutalism — raw, hard-edged */
body[data-grv-visual-theme="brutalism"]{font-family:"Space Grotesk","Archivo",ui-monospace,Menlo,monospace}
body[data-grv-visual-theme="brutalism"] :is(.stat-label,.card-title,.expense-table th,.btn){text-transform:uppercase;letter-spacing:.04em;font-weight:800}
body[data-grv-visual-theme="brutalism"] :is(.stat,.card){box-shadow:6px 6px 0 #171717}
body[data-grv-visual-theme="brutalism"] :is(.stat,.card):hover{transform:translate(-2px,-2px);box-shadow:9px 9px 0 #171717}
body[data-grv-visual-theme="brutalism"] .btn:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 #171717}
body[data-grv-visual-theme="brutalism"] .btn:active{transform:translate(3px,3px);box-shadow:0 0 0 #171717}
body[data-grv-visual-theme="brutalism"] .btn-primary{background:#ff5b35;color:#171717}
body[data-grv-visual-theme="brutalism"] .expense-table th{background:#ffe36e;color:#171717}
/* Liquid Glass — fluid, refractive */
body[data-grv-visual-theme="liquid-glass"] :is(.stat,.card,.table-wrapper,.modal-content){background:radial-gradient(120% 90% at 15% 0%,#ffffff40,#ffffff0d 55%),linear-gradient(160deg,#5fb6e855,#2a68a02e);border:1px solid #ffffff52;border-radius:26px;box-shadow:inset 0 2px 1px #ffffff80,inset 0 -10px 24px #7fd4ff26,inset 0 0 0 1px #ffffff1a,0 20px 44px #04204a66}
body[data-grv-visual-theme="liquid-glass"] .btn{border-radius:999px}
body[data-grv-visual-theme="liquid-glass"] .btn-primary{background:linear-gradient(160deg,#c6f3ff,#6dd0f5 60%,#41a9e0);color:#06314d;box-shadow:inset 0 2px 1px #fffc,0 10px 24px #3cb6ee55}
body[data-grv-visual-theme="liquid-glass"] :is(.stat,.card):hover{transform:translateY(-3px) scale(1.005)}
/* Spatial UI — layered depth */
body[data-grv-visual-theme="spatial-ui"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(180deg,#2e3447,#1f2331);border:1px solid #ffffff17;box-shadow:inset 0 1px 0 #ffffff26,0 2px 4px #0006,0 14px 30px #0007,0 30px 60px #0005}
body[data-grv-visual-theme="spatial-ui"] .btn-primary{background:linear-gradient(180deg,#bcc9ff,#8da2ff);color:#12162b;box-shadow:inset 0 1px 0 #fff9,0 8px 20px #8da2ff55}
/* Cartoon — chunky outlines, bouncy */
body[data-grv-visual-theme="cartoon"] :is(.stat,.card,.table-wrapper,.modal-content){border:3px solid #1b1b1b!important;border-radius:20px;box-shadow:5px 6px 0 #1b1b1b}
body[data-grv-visual-theme="cartoon"] .btn{border:3px solid #1b1b1b;border-radius:14px;font-weight:800;box-shadow:3px 4px 0 #1b1b1b}
body[data-grv-visual-theme="cartoon"] .btn:hover{transform:translateY(-2px) rotate(-1deg)}
body[data-grv-visual-theme="cartoon"] .btn:active{transform:translate(3px,4px);box-shadow:0 0 0 #1b1b1b}
body[data-grv-visual-theme="cartoon"] .btn-primary{background:#ff4d6d!important}
/* Space — nebula glow */
body[data-grv-visual-theme="space"] :is(.stat,.card,.table-wrapper,.modal-content){background:linear-gradient(160deg,#1b1840cc,#0d0b26cc);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid #8b7cff55;box-shadow:inset 0 1px 0 #ffffff1f,0 0 0 1px #0006,0 0 28px #6a4dff33,0 16px 36px #000a}
body[data-grv-visual-theme="space"] .stat-value{background:linear-gradient(90deg,#fff,#b9a8ff 60%,#7fd8ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
body[data-grv-visual-theme="space"] .btn-primary{background:linear-gradient(135deg,#7c5cff,#38bdf8);color:#fff;box-shadow:0 0 22px #7c5cff77}
body[data-grv-visual-theme="space"] :is(.stat,.card):hover{box-shadow:inset 0 1px 0 #ffffff33,0 0 36px #7c5cff66,0 16px 36px #000a}
@media(prefers-reduced-motion:reduce){body[data-grv-visual-theme] *{transition:none!important;animation-duration:.01ms!important}}
/* ═══ POLISH v5 — reference-matched tiles & Spatial depth (no tilt) ═══ */
body[data-grv-visual-theme="spatial-ui"] :is(.stat,.card):hover{transform:translateY(-3px)}
body[data-grv-visual-theme="spatial-ui"] :is(.stat,.card,.table-wrapper,.modal-content,.topbar){background:linear-gradient(160deg,#ffffff1f,#ffffff08 40%,#0b1226b3);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid #9bb8ff40;box-shadow:inset 0 1px 0 #ffffff40,inset 0 0 24px #4f7bff14,0 0 0 1px #0008,0 18px 40px #000a,0 0 32px #3b6bff22}
body[data-grv-visual-theme="spatial-ui"] .stat-value{text-shadow:0 0 14px currentColor}
body[data-grv-visual-theme="spatial-ui"] .btn-primary{background:linear-gradient(180deg,#6ea0ff,#3b6bff);color:#fff;box-shadow:inset 0 1px 0 #fff8,0 0 22px #3b6bffaa,0 8px 18px #0008}
body[data-grv-visual-theme="spatial-ui"] .tab-btn.tab-active{background:linear-gradient(180deg,#5b8bff55,#3b6bff22);box-shadow:inset 0 1px 0 #fff5,0 0 18px #3b6bff77}
/* Colour-coded stat tiles like the reference (green = income, red = expense, blue = balance) */
body[data-grv-visual-theme="skeuomorphism"] .stat:has(.c-green){background:linear-gradient(180deg,#4f9b4d,#2f6a32);border-color:#173d1a}
body[data-grv-visual-theme="skeuomorphism"] .stat:has(.c-red){background:linear-gradient(180deg,#c4623f,#8a3a22);border-color:#4a1d10}
body[data-grv-visual-theme="skeuomorphism"] .stat:has(:is(.c-pink,.c-purple)){background:linear-gradient(180deg,#4f78a8,#2f4f78);border-color:#162b45}
body[data-grv-visual-theme="neumorphism"] .stat:has(.c-green){background:linear-gradient(145deg,#eaf7f1,#d5e8df)}
body[data-grv-visual-theme="neumorphism"] .stat:has(.c-red){background:linear-gradient(145deg,#fbeaf0,#ecd6de)}
body[data-grv-visual-theme="neumorphism"] .stat:has(:is(.c-pink,.c-purple)){background:linear-gradient(145deg,#e6edfb,#d2dcf1)}
body[data-grv-visual-theme="glassmorphism"] .stat:has(.c-green){background:linear-gradient(135deg,#34d39940,#ffffff08)}
body[data-grv-visual-theme="glassmorphism"] .stat:has(.c-red){background:linear-gradient(135deg,#fb718566,#ffffff08)}
body[data-grv-visual-theme="glassmorphism"] .stat:has(:is(.c-pink,.c-purple)){background:linear-gradient(135deg,#60a5fa55,#ffffff08)}
body[data-grv-visual-theme="claymorphism"] .stat:has(.c-green){background:linear-gradient(160deg,#c9f2dc,#9edfbd)}
body[data-grv-visual-theme="claymorphism"] .stat:has(.c-red){background:linear-gradient(160deg,#ffd0cc,#fba7a2)}
body[data-grv-visual-theme="claymorphism"] .stat:has(:is(.c-pink,.c-purple)){background:linear-gradient(160deg,#d9d2ff,#b3a6f7)}
body[data-grv-visual-theme="brutalism"] .stat:has(.c-green){background:#3ddc84}
body[data-grv-visual-theme="brutalism"] .stat:has(.c-red){background:#ff4d4d}
body[data-grv-visual-theme="brutalism"] .stat:has(:is(.c-pink,.c-purple)){background:#4da3ff}
body[data-grv-visual-theme="brutalism"] .stat :is(.stat-value,.stat-label){color:#171717!important}
body[data-grv-visual-theme="liquid-glass"] .stat:has(.c-green){background:radial-gradient(120% 90% at 15% 0%,#ffffff50,#ffffff0d 55%),linear-gradient(160deg,#34e0a199,#0f9d6a55)}
body[data-grv-visual-theme="liquid-glass"] .stat:has(.c-red){background:radial-gradient(120% 90% at 15% 0%,#ffffff50,#ffffff0d 55%),linear-gradient(160deg,#ff7aa899,#c43a8a55)}
body[data-grv-visual-theme="liquid-glass"] .stat:has(:is(.c-pink,.c-purple)){background:radial-gradient(120% 90% at 15% 0%,#ffffff50,#ffffff0d 55%),linear-gradient(160deg,#6ec6ff99,#3a6fe055)}
body[data-grv-visual-theme="space"] .stat:has(.c-green){border-color:#34d399aa;box-shadow:0 0 22px #34d39944,inset 0 1px 0 #ffffff22}
body[data-grv-visual-theme="space"] .stat:has(.c-red){border-color:#fb7185aa;box-shadow:0 0 22px #fb718544,inset 0 1px 0 #ffffff22}
body[data-grv-visual-theme="space"] .stat:has(:is(.c-pink,.c-purple)){border-color:#60a5faaa;box-shadow:0 0 22px #60a5fa44,inset 0 1px 0 #ffffff22}
body[data-grv-visual-theme="cartoon"] .stat:has(.c-green){background:#b8f0c8!important}
body[data-grv-visual-theme="cartoon"] .stat:has(.c-red){background:#ffc2c2!important}
body[data-grv-visual-theme="cartoon"] .stat:has(:is(.c-pink,.c-purple)){background:#bfe0ff!important}
/* ═══ POLISH v6 — true 3D: extruded slabs, bevels, pressable keys ═══ */
body[data-grv-visual-theme]{--ex:#0006}
body[data-grv-visual-theme]:is([data-grv-visual-theme="skeuomorphism"],[data-grv-visual-theme="claymorphism"],[data-grv-visual-theme="spatial-ui"],[data-grv-visual-theme="cartoon"],[data-grv-visual-theme="liquid-glass"],[data-grv-visual-theme="space"]) :is(.btn,.tab-btn){position:relative}
/* Skeuomorphism: leather slabs with stacked edge + embossed type */
body[data-grv-visual-theme="skeuomorphism"] :is(.stat,.card,.table-wrapper,.modal-content){background-image:radial-gradient(120% 80% at 20% 0%,#ffffff2e,#0000 55%),repeating-linear-gradient(0deg,#0000 0 2px,#0000000d 2px 3px),linear-gradient(180deg,#4f5866,#2f3640);box-shadow:inset 0 2px 0 #ffffff55,inset 0 -3px 6px #0009,inset 2px 0 0 #ffffff12,0 1px 0 #1a1e25,0 2px 0 #171b21,0 3px 0 #14181d,0 4px 0 #111419,0 5px 0 #0e1115,0 16px 24px #000a,0 6px 8px #0007}
body[data-grv-visual-theme="skeuomorphism"] :is(.stat-label,.card-title,.expense-table th){text-shadow:0 1px 0 #000c,0 -1px 0 #ffffff22}
body[data-grv-visual-theme="skeuomorphism"] .tab-btn{background:linear-gradient(180deg,#5a6472,#363d48);border:1px solid #14181d;box-shadow:inset 0 1px 0 #ffffff55,0 3px 0 #0e1115,0 6px 8px #0008;border-radius:10px}
body[data-grv-visual-theme="skeuomorphism"] .tab-btn.tab-active{background:linear-gradient(180deg,#e9b95a,#b57f22);color:#2b1a02;text-shadow:0 1px 0 #ffe9b0;box-shadow:inset 0 1px 0 #fff9,0 3px 0 #6b4509,0 7px 10px #000a}
body[data-grv-visual-theme="skeuomorphism"] .tab-btn:active{transform:translateY(3px);box-shadow:inset 0 2px 5px #0009,0 0 0 #0000}
/* Neumorphism: deep soft plates + dished inputs */
body[data-grv-visual-theme="neumorphism"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:14px 14px 30px #b3bbcb,-14px -14px 30px #fff,inset 1px 1px 0 #ffffffcc,inset -1px -1px 0 #c7cedb}
body[data-grv-visual-theme="neumorphism"] .tab-btn{background:linear-gradient(145deg,#f0f4fa,#dbe1ea);border:0;border-radius:14px;box-shadow:6px 6px 12px #b3bbcb,-6px -6px 12px #fff}
body[data-grv-visual-theme="neumorphism"] .tab-btn.tab-active{background:#dfe4ec;color:#4a62a0;box-shadow:inset 5px 5px 10px #b3bbcb,inset -5px -5px 10px #fff}
body[data-grv-visual-theme="neumorphism"] .stat-value{text-shadow:1px 1px 0 #fff,-1px -1px 2px #b3bbcb66}
/* Glassmorphism: floating panes with refraction layers */
body[data-grv-visual-theme="glassmorphism"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:inset 0 1px 0 #fff8,inset 0 -1px 0 #ffffff1a,inset 0 0 30px #ffffff0f,0 1px 0 #ffffff22,0 12px 24px #0a143a70,0 30px 60px #0a143a55}
body[data-grv-visual-theme="glassmorphism"] .tab-btn{background:linear-gradient(180deg,#ffffff38,#ffffff0d);border:1px solid #ffffff40;box-shadow:inset 0 1px 0 #fff7,0 8px 18px #0a143a55;border-radius:12px;backdrop-filter:blur(10px)}
body[data-grv-visual-theme="glassmorphism"] .tab-btn.tab-active{background:linear-gradient(180deg,#8bdcff66,#a78bfa33);box-shadow:inset 0 1px 0 #fffa,0 0 22px #8bdcff66,0 10px 20px #0a143a66}
/* Claymorphism: thick puffy extrusion */
body[data-grv-visual-theme="claymorphism"] :is(.stat,.card,.table-wrapper,.modal-content){border:0;box-shadow:inset 0 4px 0 #fff,inset 0 -10px 16px #eeae8e77,inset 4px 0 8px #ffffff88,0 4px 0 #ecc0a8,0 8px 0 #e3ab90,0 12px 0 #d99a7e,0 26px 30px #b5705a55}
body[data-grv-visual-theme="claymorphism"] .tab-btn{background:linear-gradient(160deg,#fff,#ffdcc8);border:0;border-radius:16px;box-shadow:inset 0 3px 0 #fff,inset 0 -4px 6px #eeae8e77,0 5px 0 #e3ab90,0 10px 14px #b5705a44}
body[data-grv-visual-theme="claymorphism"] .tab-btn.tab-active{background:linear-gradient(160deg,#e07aa0,#b55c7b);color:#fff;box-shadow:inset 0 3px 0 #ffffff77,inset 0 -5px 8px #7a2e4a66,0 5px 0 #8f3f5e,0 12px 16px #8f3f5e55}
body[data-grv-visual-theme="claymorphism"] .tab-btn:active{transform:translateY(5px);box-shadow:inset 0 3px 8px #7a2e4a55}
/* Minimalism: subtle lift only */
body[data-grv-visual-theme="minimalism"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:0 1px 1px #0f172a0a,0 4px 8px #0f172a08,0 16px 32px #0f172a0a}
body[data-grv-visual-theme="minimalism"] :is(.stat,.card):hover{transform:translateY(-2px);box-shadow:0 2px 2px #0f172a0a,0 10px 20px #0f172a0d,0 24px 48px #0f172a14}
/* Brutalism: stacked offset slabs */
body[data-grv-visual-theme="brutalism"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:2px 2px 0 #171717,4px 4px 0 #ffe36e,6px 6px 0 #171717,8px 8px 0 #171717}
body[data-grv-visual-theme="brutalism"] .tab-btn{background:#fff;border:3px solid #171717;border-radius:0;box-shadow:4px 4px 0 #171717;font-weight:800;text-transform:uppercase}
body[data-grv-visual-theme="brutalism"] .tab-btn.tab-active{background:#ffe36e;transform:translate(2px,2px);box-shadow:2px 2px 0 #171717}
/* Liquid Glass: glossy bubbles with caustic rim */
body[data-grv-visual-theme="liquid-glass"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:inset 0 3px 2px #ffffffa0,inset 0 -14px 28px #7fd4ff33,inset 0 0 0 1px #ffffff26,inset 6px 0 14px #ffffff14,0 2px 0 #ffffff22,0 14px 28px #04204a77,0 34px 60px #04204a55}
body[data-grv-visual-theme="liquid-glass"] .tab-btn{background:radial-gradient(90% 70% at 30% 10%,#ffffff88,#ffffff12 60%),linear-gradient(160deg,#6dd0f566,#3a6fe044);border:1px solid #ffffff66;border-radius:999px;box-shadow:inset 0 2px 1px #fffc,inset 0 -6px 10px #7fd4ff44,0 8px 16px #04204a66}
body[data-grv-visual-theme="liquid-glass"] .tab-btn.tab-active{background:radial-gradient(90% 70% at 30% 10%,#fffc,#ffffff22 60%),linear-gradient(160deg,#9de9ff,#41a9e0);color:#06314d;box-shadow:inset 0 2px 1px #fff,0 0 24px #7fe0ff99,0 10px 18px #04204a77}
/* Spatial UI: floating glass slabs with true layered depth */
body[data-grv-visual-theme="spatial-ui"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:inset 0 1px 0 #ffffff55,inset 0 -2px 0 #0008,inset 0 0 30px #4f7bff18,0 1px 0 #1b2a55,0 2px 0 #16224a,0 3px 0 #111b3d,0 4px 0 #0c1430,0 22px 36px #000b,0 40px 70px #0009,0 0 40px #3b6bff2e}
body[data-grv-visual-theme="spatial-ui"] .tab-btn{background:linear-gradient(180deg,#ffffff26,#ffffff08);border:1px solid #9bb8ff44;border-radius:14px;box-shadow:inset 0 1px 0 #fff5,0 4px 0 #0c1430,0 10px 18px #000a}
body[data-grv-visual-theme="spatial-ui"] .tab-btn.tab-active{background:linear-gradient(180deg,#7aa6ff,#3b6bff);color:#fff;box-shadow:inset 0 1px 0 #fffa,0 4px 0 #1e3fa8,0 0 26px #3b6bffcc,0 12px 20px #000a}
body[data-grv-visual-theme="spatial-ui"] .tab-btn:active{transform:translateY(4px);box-shadow:inset 0 2px 6px #0008}
/* Cartoon: chunky sticker extrusion */
body[data-grv-visual-theme="cartoon"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:3px 3px 0 #1b1b1b,6px 6px 0 #1b1b1b,8px 9px 0 #1b1b1b,inset 0 4px 0 #ffffffb0}
body[data-grv-visual-theme="cartoon"] .tab-btn{background:#fff3b0!important;border:3px solid #1b1b1b!important;border-radius:14px;box-shadow:0 5px 0 #1b1b1b,inset 0 3px 0 #fff}
body[data-grv-visual-theme="cartoon"] .tab-btn.tab-active{background:#ff4d6d!important;transform:translateY(2px);box-shadow:0 3px 0 #1b1b1b,inset 0 3px 0 #ff9cb0}
body[data-grv-visual-theme="cartoon"] .tab-btn:active{transform:translateY(5px);box-shadow:0 0 0 #1b1b1b}
/* Space: levitating holo-panels with neon rim + under-glow */
body[data-grv-visual-theme="space"] :is(.stat,.card,.table-wrapper,.modal-content){box-shadow:inset 0 1px 0 #ffffff40,inset 0 -2px 0 #000a,inset 0 0 26px #6a4dff1f,0 0 0 1px #0008,0 3px 0 #1a1550,0 6px 0 #110e38,0 24px 40px #000c,0 0 44px #6a4dff44}
body[data-grv-visual-theme="space"] .tab-btn{background:linear-gradient(180deg,#2a2563,#14113a);border:1px solid #8b7cff66;border-radius:12px;box-shadow:inset 0 1px 0 #fff4,0 4px 0 #0a0825,0 0 14px #6a4dff44}
body[data-grv-visual-theme="space"] .tab-btn.tab-active{background:linear-gradient(180deg,#9b82ff,#5a3fe0);color:#fff;box-shadow:inset 0 1px 0 #fff9,0 4px 0 #2e1f94,0 0 28px #7c5cffcc}
/* Shared: tactile press + 3D table headers */
body[data-grv-visual-theme] .btn:active{transform:translateY(2px)}
body[data-grv-visual-theme="skeuomorphism"] .expense-table th,body[data-grv-visual-theme="spatial-ui"] .expense-table th,body[data-grv-visual-theme="space"] .expense-table th{box-shadow:inset 0 1px 0 #ffffff30,inset 0 -2px 0 #0006}
@media(max-width:600px){body[data-grv-visual-theme] :is(.stat,.card){margin-bottom:6px}}
`;
    var style = document.createElement("style");
    style.id = "grv-visual-theme-styles";
    style.textContent = css;
    document.head.appendChild(style);
    var widget = document.createElement("div");
    widget.id = "grv-visual-theme-widget";
    var toggle = document.createElement("button");
    toggle.id = "grv-visual-theme-toggle";
    toggle.type = "button";
    toggle.textContent = "🎨 Appearance";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "grv-visual-theme-panel");
    var panel = document.createElement("div");
    panel.id = "grv-visual-theme-panel";
    panel.setAttribute("aria-label", "Website appearance");
    var label = document.createElement("div");
    label.id = "grv-visual-theme-label";
    label.textContent = "Choose design style";
    label.setAttribute("role", "heading");
    label.setAttribute("aria-level", "2");
    var list = document.createElement("div");
    list.id = "grv-visual-theme-list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Design styles");
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = t[1];
      b.setAttribute("data-theme", t[0]);
      b.addEventListener("click", function () {
        apply(t[0]);
      });
      list.appendChild(b);
    });
    var status = document.createElement("div");
    status.id = "grv-visual-theme-status";
    status.setAttribute("aria-live", "polite");
    panel.appendChild(label);
    panel.appendChild(list);
    panel.appendChild(status);
    widget.appendChild(panel);
    widget.appendChild(toggle);
    // Keep the fixed control outside BODY so iOS Safari body transforms/scrolling
    // cannot turn its fixed positioning into page-relative positioning.
    var bodyStyles = window.getComputedStyle(document.body);
    ["--text", "--surface", "--s2", "--border", "--accent", "--bg"].forEach(
      function (name) {
        var value = bodyStyles.getPropertyValue(name);
        if (value) widget.style.setProperty(name, value);
      },
    );
    document.documentElement.appendChild(widget);

    // Keep the appearance button immediately left of the app's info button.
    // IMPORTANT: position is computed scroll-independently and only on real
    // layout changes (resize/orientation) — NOT on scroll or visualViewport
    // resize (those fire while the mobile address bar collapses and would
    // make the button follow the page).
    // Dock the widget INSIDE the header, right before the (i) button, so it sits with it on every
    // screen size, scrolls with it and can never float above the info popup or other dialogs.
    var dock = document.createElement("style");
    dock.id = "grv-theme-dock-style";
    dock.textContent =
      "#grv-visual-theme-widget{z-index:150!important}" +
      "#grv-visual-theme-widget.is-docked{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;z-index:auto!important;width:auto!important;max-height:none!important;display:inline-flex;align-items:center;flex:0 0 auto}" +
      "#grv-visual-theme-widget.is-docked #grv-visual-theme-panel{top:calc(100% + 8px)!important;bottom:auto!important;right:0!important;left:auto!important;z-index:300}" +
      "@media(min-width:601px){#grv-visual-theme-widget.is-docked #grv-visual-theme-toggle{padding:6px 12px;min-height:34px;font-size:.8rem}}";
    document.head.appendChild(dock);
    var lastW = 0;
    function positionAppearanceButton() {
      var infoButton = document.getElementById("versionBtn");
      if (!infoButton || !infoButton.parentNode) return;
      var mobile =
        window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
      if (!mobile) {
        // Desktop/tablet: sit in the header right before the (i) button.
        ["left", "right", "top", "bottom", "position"].forEach(function (p) {
          widget.style.removeProperty(p);
        });
        if (widget.parentNode !== infoButton.parentNode)
          infoButton.parentNode.insertBefore(widget, infoButton);
        widget.classList.add("is-docked");
        return;
      }
      // Mobile: float beside the (i) button (keeps the compact header), below popups.
      widget.classList.remove("is-docked");
      if (widget.parentNode !== document.documentElement)
        document.documentElement.appendChild(widget);
      var rect = infoButton.getBoundingClientRect();
      var isFixed = window.getComputedStyle(infoButton).position === "fixed";
      var scrollY =
        window.pageYOffset || document.documentElement.scrollTop || 0;
      var absTop = isFixed ? rect.top : rect.top + scrollY;
      var buttonSize = 48,
        gap = 8;
      var left = Math.max(8, rect.left - buttonSize - gap);
      var top = absTop + (rect.height - buttonSize) / 2;
      widget.style.setProperty(
        "position",
        isFixed ? "fixed" : "absolute",
        "important",
      );
      widget.style.setProperty("left", left + "px", "important");
      widget.style.setProperty("right", "auto", "important");
      widget.style.setProperty("top", Math.max(8, top) + "px", "important");
      widget.style.setProperty("bottom", "auto", "important");
    }
    positionAppearanceButton();
    window.addEventListener("DOMContentLoaded", positionAppearanceButton);
    window.addEventListener("load", positionAppearanceButton);
    window.addEventListener("orientationchange", function () {
      setTimeout(positionAppearanceButton, 300);
    });
    window.addEventListener(
      "resize",
      function () {
        // ignore height-only resizes (address bar show/hide while scrolling)
        if (window.innerWidth !== lastW) {
          lastW = window.innerWidth;
          positionAppearanceButton();
        }
      },
      { passive: true },
    );
    lastW = window.innerWidth;

    toggle.addEventListener("click", function () {
      var open = panel.classList.toggle("is-open");
      if (open) {
        // keep the panel fully on screen whatever the header layout is
        panel.style.transform = "";
        var pr = panel.getBoundingClientRect();
        var dx =
          pr.left < 8
            ? 8 - pr.left
            : pr.right > window.innerWidth - 8
              ? window.innerWidth - 8 - pr.right
              : 0;
        if (dx) panel.style.transform = "translateX(" + dx + "px)";
      }
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("is-open")) {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
    document.addEventListener("pointerdown", function (e) {
      if (!widget.contains(e.target)) {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    apply(read());
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
