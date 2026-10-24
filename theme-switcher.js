/* GRV Expense Tracker theme switcher — dropdown-fixed build.
   Targets the real app selectors: .stat, .card, .table-wrapper, .topbar,
   .field, .btn, .expense-table. Does not modify transaction logic. */
(function () {
  'use strict';
  var KEY='grv-expense-visual-theme';
  var THEMES=[
    ['default','Default (Current Design)'],['skeuomorphism','Skeuomorphism'],
    ['neumorphism','Neumorphism'],['glassmorphism','Glassmorphism'],
    ['claymorphism','Claymorphism'],['minimalism','Minimalism'],
    ['brutalism','Brutalism'],['liquid-glass','Liquid Glass'],['spatial-ui','Spatial UI'],
    ['cartoon','Cartoon'],['space','Space']
  ];
  function read(){try{var v=localStorage.getItem(KEY);return THEMES.some(function(t){return t[0]===v;})?v:'default';}catch(e){return'default';}}
  function apply(v){
    var b=document.body,h=document.documentElement;
    if(v==='default'){b.removeAttribute('data-grv-visual-theme');h.removeAttribute('data-grv-visual-theme');}
    else{b.setAttribute('data-grv-visual-theme',v);h.setAttribute('data-grv-visual-theme',v);}
    try{localStorage.setItem(KEY,v);}catch(e){}
    var s=document.getElementById('grv-visual-theme-select');if(s)s.value=v;document.querySelectorAll('#grv-visual-theme-list button').forEach(function(b){b.classList.toggle('is-active',b.getAttribute('data-theme')===v);});
    var status=document.getElementById('grv-visual-theme-status');
    if(status)status.textContent='Active style: '+THEMES.filter(function(t){return t[0]===v;})[0][1];
  }
  function init(){
    if(document.getElementById('grv-visual-theme-widget'))return;
    var css=`
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
  /* Place the appearance control beside the existing info button, not over the bottom tab bar. */
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

`;
    var style=document.createElement('style');style.id='grv-visual-theme-styles';style.textContent=css;document.head.appendChild(style);
    var widget=document.createElement('div');widget.id='grv-visual-theme-widget';
    var toggle=document.createElement('button');toggle.id='grv-visual-theme-toggle';toggle.type='button';toggle.textContent='🎨 Appearance';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','grv-visual-theme-panel');
    var panel=document.createElement('div');panel.id='grv-visual-theme-panel';panel.setAttribute('aria-label','Website appearance');
    var label=document.createElement('div');label.id='grv-visual-theme-label';label.textContent='Choose design style';label.setAttribute('role','heading');label.setAttribute('aria-level','2');
    var list=document.createElement('div');list.id='grv-visual-theme-list';list.setAttribute('role','group');list.setAttribute('aria-label','Design styles');
    THEMES.forEach(function(t){
      var b=document.createElement('button');b.type='button';b.textContent=t[1];b.setAttribute('data-theme',t[0]);
      b.addEventListener('click',function(){apply(t[0]);});
      list.appendChild(b);
    });
    var status=document.createElement('div');status.id='grv-visual-theme-status';status.setAttribute('aria-live','polite');
    panel.appendChild(label);panel.appendChild(list);panel.appendChild(status);widget.appendChild(panel);widget.appendChild(toggle);document.body.appendChild(widget);
    toggle.addEventListener('click',function(){var open=panel.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panel.classList.contains('is-open')){panel.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.focus();}});
    document.addEventListener('pointerdown',function(e){if(!widget.contains(e.target)){panel.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}});
    apply(read());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();