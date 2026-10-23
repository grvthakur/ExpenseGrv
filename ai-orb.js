// ── AI Orb (premium, multi-design) ──
// Design 0 = original glass orb. Designs 1-7 = glowing line flowers.
// Switch design: phone = HOLD for menu | laptop = DOUBLE-CLICK (next) or RIGHT-CLICK (menu).
// Includes touch ripple, switch shockwave, time-based mood colours, and thinking events.
// Single tap / single click still opens AI Entry exactly as before.
// Load AFTER ai-entry.js:  <script src="ai-orb.js?v=2"></script>
(function () {
  "use strict";
  const SHOW_ICON = true; // sparkle symbol in the middle; false = pure design
  const DOTS = 620; // orb streak count
  const AUTO_MS = 9000; // auto-change interval (0 = off)
  const HOLD_MS = 600; // long-press time on touch
  const DBL_MS = 280; // double-click window on mouse
  const COLORS = [
    "#ff4d8d",
    "#ff9f1c",
    "#ffd84d",
    "#2ee6c5",
    "#3ab8ff",
    "#b36bff",
    "#7dff5c",
    "#ff5c7a",
  ];
  // Flower designs: n petals, len/wid = petal half-size (x R), off = petal centre distance (x R)
  const FLOWERS = [
    { n: 24, len: 0.36, wid: 0.07, off: 0.62, c: "#d8b4fe" },
    { n: 2, len: 0.5, wid: 0.5, off: 0.5, c: "#a5b4fc" },
    { n: 16, len: 0.36, wid: 0.09, off: 0.62, c: "#93c5fd" },
    { n: 12, len: 0.34, wid: 0.12, off: 0.63, c: "#86efac" },
    { n: 8, len: 0.34, wid: 0.15, off: 0.63, c: "#fde68a" },
    { n: 6, len: 0.34, wid: 0.19, off: 0.63, c: "#fdba74" },
    { n: 5, len: 0.34, wid: 0.22, off: 0.63, c: "#fca5a5" },
  ];
  const TOTAL = 1 + FLOWERS.length + 5; // orb + flowers + galaxy, atom, plasma, halo, bloom

  const btn = document.getElementById("aiEntryBtn");
  if (!btn || btn.dataset.orb) return;
  btn.dataset.orb = "1";
  btn.setAttribute("aria-label", "AI Entry");
  btn.title = "AI Entry";

  const css = document.createElement("style");
  css.textContent = `
html body #aiEntryBtn#aiEntryBtn{
  overflow:visible !important;border:0 !important;padding:0 !important;
  background:#04050a !important;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;
  box-shadow:0 0 0 1px rgba(2,3,8,.7),0 10px 26px rgba(0,0,0,.6),0 0 30px rgba(179,107,255,.6),0 0 48px rgba(46,230,197,.38),0 0 70px rgba(255,77,141,.22) !important;
  animation:aiOrbBreath 4.5s ease-in-out infinite !important;
  transition:transform .22s cubic-bezier(.2,.9,.3,1.2) !important}
@keyframes aiOrbBreath{
  0%,100%{box-shadow:0 0 0 1px rgba(2,3,8,.7),0 10px 26px rgba(0,0,0,.6),0 0 28px rgba(179,107,255,.52),0 0 46px rgba(46,230,197,.34),0 0 64px rgba(255,77,141,.2)}
  50%{box-shadow:0 0 0 1px rgba(2,3,8,.7),0 12px 30px rgba(0,0,0,.65),0 0 44px rgba(255,77,141,.8),0 0 72px rgba(58,184,255,.55),0 0 96px rgba(179,107,255,.3)}}
html body #aiEntryBtn#aiEntryBtn::before,
html body #aiEntryBtn#aiEntryBtn::after{content:none !important;display:none !important;animation:none !important}
html body #aiEntryBtn#aiEntryBtn:hover{transform:scale(1.08) translateY(-1px)}
html body #aiEntryBtn#aiEntryBtn:active{transform:scale(.93)}
#aiEntryBtn .ai-orb-cv{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;pointer-events:none;display:block}
#aiEntryBtn .ai-orb-core{position:relative;z-index:2;width:50%;height:50%;display:grid;place-items:center;pointer-events:none}
#aiEntryBtn .ai-orb-core::before{content:"";position:absolute;inset:-26%;border-radius:50%;
  background:radial-gradient(circle,rgba(2,3,8,.62) 0,rgba(2,3,8,.38) 45%,transparent 72%)}
#aiEntryBtn .ai-orb-ic{position:relative;width:100%;height:100%;overflow:visible;
  filter:drop-shadow(0 0 5px rgba(255,255,255,.55)) drop-shadow(0 0 10px rgba(103,232,249,.55));
  animation:aiOrbTw 3.2s ease-in-out infinite}
@keyframes aiOrbTw{0%,100%{transform:scale(1) rotate(0);opacity:.96}50%{transform:scale(1.12) rotate(10deg);opacity:1}}
@media (prefers-reduced-motion:reduce){
  html body #aiEntryBtn#aiEntryBtn{animation:none !important}
  #aiEntryBtn .ai-orb-ic{animation:none}}
#aiEntryBtn .ai-orb-ripple{position:absolute;inset:0;border:2px solid rgba(255,255,255,.9);border-radius:50%;pointer-events:none;z-index:4;opacity:0;transform:scale(.35)}
#aiEntryBtn.ai-orb-pressed .ai-orb-ripple{animation:aiOrbRipple .65s ease-out}
#aiEntryBtn.ai-orb-burst .ai-orb-ripple{animation:aiOrbBurst .55s ease-out}
@keyframes aiOrbRipple{0%{opacity:.95;transform:scale(.35);box-shadow:0 0 8px #67e8f9}100%{opacity:0;transform:scale(1.65);box-shadow:0 0 22px #c084fc}}
@keyframes aiOrbBurst{0%{opacity:1;transform:scale(.25);border-width:4px;box-shadow:0 0 24px #67e8f9}100%{opacity:0;transform:scale(1.9);border-width:1px;box-shadow:0 0 32px #f0abfc}}
#aiEntryBtn.ai-orb-thinking{animation:aiOrbThinking .72s ease-in-out infinite !important}
@keyframes aiOrbThinking{0%,100%{filter:brightness(1);transform:scale(1)}50%{filter:brightness(1.5);transform:scale(1.08);box-shadow:0 0 22px #67e8f9,0 0 58px #818cf8,0 0 90px #c084fc}}
#aiEntryBtn[data-ai-mood="night"]{box-shadow:0 0 0 1px rgba(2,3,8,.7),0 0 30px rgba(59,130,246,.65),0 0 65px rgba(109,40,217,.42) !important}
#aiEntryBtn[data-ai-mood="morning"]{box-shadow:0 0 0 1px rgba(2,3,8,.7),0 0 30px rgba(244,114,182,.65),0 0 65px rgba(251,191,36,.38) !important}
.ai-orb-menu{position:fixed;z-index:2147483000;width:min(250px,calc(100vw - 24px));max-height:min(70vh,420px);overflow:auto;padding:10px;border:1px solid rgba(165,180,252,.4);border-radius:16px;background:rgba(7,10,24,.97);color:#f8fafc;box-shadow:0 12px 45px rgba(0,0,0,.55),0 0 24px rgba(129,140,248,.22);backdrop-filter:blur(16px);font:13px/1.35 system-ui,sans-serif}
.ai-orb-menu-title{font-weight:700;font-size:14px;padding:7px 9px 10px;color:#e0e7ff}
.ai-orb-menu button{display:block;width:100%;text-align:left;padding:9px 10px;margin:2px 0;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.ai-orb-menu button:hover,.ai-orb-menu button[aria-pressed="true"]{background:rgba(129,140,248,.2);border-color:rgba(165,180,252,.45)}
.ai-orb-menu button[aria-pressed="true"]::after{content:" ✓";color:#67e8f9;font-weight:700}`;
  document.head.appendChild(css);

  btn.textContent = "";
  const cv = document.createElement("canvas");
  cv.className = "ai-orb-cv";
  btn.appendChild(cv);
  if (SHOW_ICON) {
    const core = document.createElement("span");
    core.className = "ai-orb-core";
    core.innerHTML =
      '<svg class="ai-orb-ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><linearGradient id="aiOrbG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9f6ff"/></linearGradient></defs>' +
      '<path fill="url(#aiOrbG)" d="M10 2l2 6.5L18.5 10 12 12l-2 6.5L8 12 1.5 10 8 8.5z"/>' +
      '<path fill="#67e8f9" d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></svg>';
    btn.appendChild(core);
    btn.style.fontSize = "0";
  }
  const ripple = document.createElement("span");
  ripple.className = "ai-orb-ripple";
  ripple.setAttribute("aria-hidden", "true");
  btn.appendChild(ripple);

  const ctx = cv.getContext("2d");
  if (!ctx) return;

  // Orb points (Fibonacci sphere)
  const pts = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < DOTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DOTS;
    const r = Math.sqrt(1 - y * y);
    const a = i * GA;
    pts.push({
      x: Math.cos(a) * r,
      y,
      z: Math.sin(a) * r,
      c: (Math.random() * COLORS.length) | 0,
      k: 0.7 + Math.random() * 0.6,
    });
  }

  let S = 54,
    dpr = 1;
  function resize() {
    S = btn.clientWidth || 54;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = Math.round(S * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(btn);
  else window.addEventListener("resize", resize);

  const TILT = -0.42;
  const cT = Math.cos(TILT),
    sT = Math.sin(TILT);
  function project(p, ang) {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    const x = p.x * c + p.z * s,
      z = -p.x * s + p.z * c,
      y = p.y;
    return [x * cT - y * sT, x * sT + y * cT, z];
  }
  const BANDS = [
    { a: 0.42, f: (z) => z <= 0 },
    { a: 0.85, f: (z) => z > 0 && z < 0.38 },
    { a: 1, f: (z) => z >= 0.38 },
  ];
  const TRAIL = 0.22;

  // Design 0: original glass orb
  function drawOrb(ang) {
    const R = S / 2,
      w = Math.max(0.9, S * 0.024),
      sc = R * 0.98;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, 6.2832);
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineWidth = w;
    const A = new Array(pts.length),
      B = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      A[i] = project(pts[i], ang);
      B[i] = project(pts[i], ang - TRAIL * pts[i].k);
    }
    for (const band of BANDS) {
      ctx.globalAlpha = band.a;
      for (let ci = 0; ci < COLORS.length; ci++) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].c !== ci || !band.f(A[i][2])) continue;
          ctx.moveTo(R + A[i][0] * sc, R + A[i][1] * sc);
          ctx.lineTo(R + B[i][0] * sc, R + B[i][1] * sc);
        }
        ctx.strokeStyle = COLORS[ci];
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    let g = ctx.createRadialGradient(R * 0.92, R * 0.86, R * 0.18, R, R, R);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.62, "rgba(2,3,8,.03)");
    g.addColorStop(1, "rgba(2,3,8,.08)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    g = ctx.createRadialGradient(
      R * 0.62,
      R * 0.46,
      0,
      R * 0.62,
      R * 0.46,
      R * 0.62,
    );
    g.addColorStop(0, "rgba(255,255,255,.26)");
    g.addColorStop(0.5, "rgba(255,255,255,.08)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // extra glass: bright rim, soft inner rim and a second small reflection
    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.beginPath();
    ctx.arc(R, R, R * 0.96, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
    ctx.strokeStyle = "rgba(180,220,255,.16)";
    ctx.beginPath();
    ctx.arc(R, R, R * 0.96, Math.PI * 0.1, Math.PI * 0.55);
    ctx.stroke();
    g = ctx.createRadialGradient(
      R * 1.35,
      R * 1.45,
      0,
      R * 1.35,
      R * 1.45,
      R * 0.28,
    );
    g.addColorStop(0, "rgba(255,255,255,.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
  }

  // Designs 1-7: glowing line flowers
  function drawFlower(ang, d) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.lineWidth = Math.max(1, S * 0.028);
    ctx.strokeStyle = d.c;
    ctx.shadowColor = d.c;
    ctx.shadowBlur = S * 0.12;
    const base = ang * 0.3;
    for (let i = 0; i < d.n; i++) {
      ctx.save();
      ctx.rotate(base + (i * 2 * Math.PI) / d.n);
      ctx.beginPath();
      ctx.ellipse(d.off * R, 0, d.len * R, d.wid * R, 0, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.28, 0, 6.2832);
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  // Design 8: spiral galaxy (Milky Way)
  const STARS = [];
  for (let arm = 0; arm < 3; arm++)
    for (let i = 0; i < 90; i++) {
      const t = Math.pow(i / 90, 0.85);
      STARS.push({
        t,
        th: (arm * 2 * Math.PI) / 3 + t * 3.4 + (Math.random() - 0.5) * 0.5,
        s: 0.5 + Math.random() * 1.1,
        ph: Math.random() * 6.28,
        j: (Math.random() - 0.5) * 0.12,
        c: ["#c4b5fd", "#93c5fd", "#f9a8d4", "#ffffff"][
          (Math.random() * 4) | 0
        ],
      });
    }
  function drawGalaxy(ang) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-0.45);
    ctx.scale(1, 0.62);
    const rot = ang * 0.35;
    for (const p of STARS) {
      const r = (p.t + p.j) * R * 0.95;
      const a = p.th + rot;
      ctx.fillStyle = p.c;
      ctx.globalAlpha =
        (0.35 + 0.65 * (1 - p.t)) * (0.55 + 0.45 * Math.sin(ang * 3 + p.ph));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, p.s * (S / 54), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    g.addColorStop(0, "rgba(255,244,214,.95)");
    g.addColorStop(0.35, "rgba(196,181,253,.55)");
    g.addColorStop(1, "rgba(196,181,253,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.42, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  // Design 9: atom with revolving electrons
  function drawAtom(ang) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    const cols = ["#67e8f9", "#f0abfc", "#fde68a"];
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3 + ang * 0.1);
      const rx = R * 0.9,
        ry = R * 0.32;
      ctx.lineWidth = Math.max(1, S * 0.022);
      ctx.strokeStyle = cols[k];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
      ctx.stroke();
      const e = ang * (2.6 + k * 0.6) + k * 2.1;
      ctx.fillStyle = cols[k];
      ctx.shadowColor = cols[k];
      for (let j = 9; j >= 0; j--) {
        const ee = e - j * 0.14;
        ctx.globalAlpha = j === 0 ? 1 : (1 - j / 10) * 0.55;
        ctx.shadowBlur = j === 0 ? S * 0.16 : 0;
        ctx.beginPath();
        ctx.arc(
          Math.cos(ee) * rx,
          Math.sin(ee) * ry,
          Math.max(1.2, S * 0.045) * (1 - j * 0.07),
          0,
          6.2832,
        );
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const nr = S * (0.17 + 0.03 * Math.sin(ang * 4));
    const ng = ctx.createRadialGradient(0, 0, 0, 0, 0, nr);
    ng.addColorStop(0, "rgba(255,255,255,1)");
    ng.addColorStop(0.3, "rgba(165,243,252,.8)");
    ng.addColorStop(1, "rgba(165,243,252,0)");
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(0, 0, nr, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  // Design 10: plasma reactor
  const PL = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#60a5fa"];
  function drawPlasma(ang) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 6.2832);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let k = 0; k < 14; k++) {
      const r =
        R * (0.3 + 0.62 * ((k * 0.37) % 1)) + Math.sin(ang * 2 + k) * R * 0.05;
      const a0 = ang * (k % 2 ? 1.5 : -1.1) * (0.6 + (k % 5) * 0.2) + k * 1.3;
      ctx.strokeStyle = PL[k % PL.length];
      ctx.lineWidth = Math.max(1, S * (0.018 + (k % 3) * 0.012));
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(ang * 2.5 + k);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = S * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a0 + 0.9 + (k % 4) * 0.5);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = Math.max(1, S * 0.025);
      const a0 = -ang * 3 + (k * 2 * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.2, a0, a0 + 1.4);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(
      0,
      0,
      0,
      0,
      0,
      R * (0.4 + 0.05 * Math.sin(ang * 4)),
    );
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(0.4, "rgba(129,140,248,.55)");
    g.addColorStop(1, "rgba(129,140,248,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.45, 0, 6.2832);
    ctx.fill();
    const o = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
    o.addColorStop(0, "rgba(192,132,252,0)");
    o.addColorStop(1, "rgba(244,114,182,.5)");
    ctx.fillStyle = o;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  // Design 11: quantum halo
  const HP = [];
  for (let i = 0; i < 16; i++)
    HP.push({
      a: Math.random() * 6.28,
      r: 0.3 + Math.random() * 0.62,
      s: 0.3 + Math.random() * 0.9,
    });
  function drawHalo(ang) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    const cols = ["#67e8f9", "#a5b4fc", "#f0abfc", "#86efac"];
    ctx.lineWidth = Math.max(1, S * 0.02);
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 4 + ang * 0.12);
      const rx = R * 0.9,
        ry = Math.max(
          R * 0.08,
          Math.abs(Math.cos(ang * (0.5 + k * 0.17) + k)) * R * 0.9,
        );
      ctx.strokeStyle = cols[k];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
      ctx.stroke();
      const e = ang * (1.4 + k * 0.5) + k * 1.7;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = cols[k];
      ctx.shadowBlur = S * 0.14;
      ctx.beginPath();
      ctx.arc(
        Math.cos(e) * rx,
        Math.sin(e) * ry,
        Math.max(1.4, S * 0.04),
        0,
        6.2832,
      );
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    for (const p of HP) {
      const a = p.a + ang * p.s;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(ang * 2 + p.a * 3));
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * p.r * R,
        Math.sin(a) * p.r * R,
        Math.max(0.8, S * 0.012),
        0,
        6.2832,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const cr = R * (0.26 + 0.04 * Math.sin(ang * 3));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(103,232,249,.7)");
    g.addColorStop(1, "rgba(103,232,249,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  // Design 12: neon bloom mandala
  function drawBloom(ang) {
    const R = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, S * 0.022);
    const L = [
      { n: 14, len: 0.34, wid: 0.1, off: 0.64, dir: 1, sp: 0.25 },
      { n: 10, len: 0.28, wid: 0.12, off: 0.46, dir: -1, sp: 0.35 },
      { n: 7, len: 0.2, wid: 0.1, off: 0.28, dir: 1, sp: 0.5 },
    ];
    L.forEach((l, li) => {
      const col =
        "hsl(" + ((((ang * 45 + li * 70) % 360) + 360) % 360) + ",95%,68%)";
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = S * 0.09;
      for (let i = 0; i < l.n; i++) {
        ctx.save();
        ctx.rotate(l.dir * ang * l.sp + (i * 2 * Math.PI) / l.n);
        const br = 1 + 0.1 * Math.sin(ang * 2 + i + li);
        ctx.beginPath();
        ctx.ellipse(l.off * R, 0, l.len * R * br, l.wid * R, 0, 0, 6.2832);
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.shadowBlur = 0;
    const cr = R * (0.16 + 0.05 * Math.sin(ang * 3.5));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, cr * 2, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function draw(ang, idx) {
    if (idx === 0) drawOrb(ang);
    else if (idx <= FLOWERS.length) {
      if (morph && morph.t > 0) drawFlower(ang, mixFlower(morph));
      else drawFlower(ang, FLOWERS[idx - 1]);
    } else if (idx === FLOWERS.length + 1) drawGalaxy(ang);
    else if (idx === FLOWERS.length + 2) drawAtom(ang);
    else if (idx === FLOWERS.length + 3) drawPlasma(ang);
    else if (idx === FLOWERS.length + 4) drawHalo(ang);
    else drawBloom(ang);
  }

  // smooth flower -> flower morph
  let morph = null;
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  function mixFlower(m) {
    const a = FLOWERS[m.a - 1],
      b = FLOWERS[m.b - 1],
      t = m.t * m.t * (3 - 2 * m.t),
      L = (x, y) => x + (y - x) * t,
      ca = hex(a.c),
      cb = hex(b.c);
    return {
      n: Math.max(2, Math.round(L(a.n, b.n))),
      len: L(a.len, b.len),
      wid: L(a.wid, b.wid),
      off: L(a.off, b.off),
      c: "rgb(" + ca.map((v, i) => Math.round(L(v, cb[i]))).join(",") + ")",
    };
  }

  // ── design switching with soft fade ──
  const reduce =
    window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let idx = 0;
  try {
    const saved = localStorage.getItem("ai_orb_idx");
    idx = saved === null ? 0 : Math.max(0, Math.min(TOTAL - 1, parseInt(saved, 10) || 0));
  } catch (_) {}
  let pend = idx,
    out = false,
    fade = 1,
    autoT = 0;

  const DESIGN_NAMES = [
    "Glass Orb", "Lavender Flower", "Twin Petal", "Blue Flower", "Green Flower",
    "Golden Flower", "Sunset Flower", "Coral Flower", "Galaxy", "Atom",
    "Plasma Reactor", "Quantum Halo", "Neon Bloom"
  ];
  let menuEl = null;
  let menuCloseHandler = null;
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    if (menuCloseHandler) {
      document.removeEventListener("pointerdown", menuCloseHandler, true);
      menuCloseHandler = null;
    }
  }
  function saveDesign() {
    try { localStorage.setItem("ai_orb_idx", String(idx)); } catch (_) {}
  }
  function burst() {
    btn.classList.remove("ai-orb-burst");
    void btn.offsetWidth;
    btn.classList.add("ai-orb-burst");
    setTimeout(() => btn.classList.remove("ai-orb-burst"), 650);
  }
  function chooseDesign(n) {
    const chosen = Math.max(0, Math.min(TOTAL - 1, Number(n) || 0));
    closeMenu();
    clearTimeout(autoT);
    pend = chosen;
    if (chosen === idx) { scheduleAuto(); return; }
    morph = null;
    if (reduce) {
      idx = chosen;
      draw(0.6, idx);
      saveDesign();
    } else {
      out = true;
    }
    burst();
    scheduleAuto();
  }
  function showMenu() {
    if (menuEl) { closeMenu(); return; }
    menuEl = document.createElement("div");
    menuEl.className = "ai-orb-menu";
    menuEl.setAttribute("role", "menu");
    const heading = document.createElement("div");
    heading.className = "ai-orb-menu-title";
    heading.textContent = "Choose AI Orb design";
    menuEl.appendChild(heading);
    DESIGN_NAMES.forEach((name, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = (i + 1) + ". " + name;
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-pressed", String(i === idx));
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        chooseDesign(i);
      });
      menuEl.appendChild(item);
    });
    document.body.appendChild(menuEl);
    const r = btn.getBoundingClientRect();
    const w = Math.min(250, window.innerWidth - 24);
    menuEl.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + "px";
    menuEl.style.top = Math.max(12, Math.min(window.innerHeight - Math.min(menuEl.offsetHeight, 420) - 12, r.top - Math.min(menuEl.offsetHeight, 420) - 10)) + "px";
    menuCloseHandler = (ev) => {
      if (menuEl && !menuEl.contains(ev.target) && ev.target !== btn) closeMenu();
    };
    setTimeout(() => {
      if (menuCloseHandler) document.addEventListener("pointerdown", menuCloseHandler, true);
    }, 0);
  }
  function updateMood() {
    const h = new Date().getHours();
    const mood = (h >= 5 && h < 11) ? "morning" : (h >= 18 || h < 5) ? "night" : "day";
    btn.dataset.aiMood = mood;
    cv.style.filter = mood === "morning" ? "hue-rotate(-12deg) saturate(1.18)" :
      mood === "night" ? "hue-rotate(12deg) saturate(1.12)" : "none";
  }
  updateMood();
  setInterval(updateMood, 60000);

  // AI response code can toggle these events around generation.
  const startThinking = () => { btn.classList.add("ai-orb-thinking"); target = 2.4; };
  const stopThinking = () => { btn.classList.remove("ai-orb-thinking"); target = 0.8; };
  window.addEventListener("ai:thinking-start", startThinking);
  window.addEventListener("ai:thinking-end", stopThinking);
  window.addEventListener("ai-thinking-start", startThinking);
  window.addEventListener("ai-thinking-end", stopThinking);

  function next() {
    if (out || morph) return scheduleAuto();
    pend = (idx + 1) % TOTAL;
    const fl = (i) => i >= 1 && i <= FLOWERS.length;
    if (reduce) {
      idx = pend;
      saveDesign();
      burst();
      draw(0.6, idx);
    } else if (fl(idx) && fl(pend)) morph = { a: idx, b: pend, t: 0.001 };
    else out = true;
    scheduleAuto();
  }
  function scheduleAuto() {
    clearTimeout(autoT);
    if (AUTO_MS > 0) autoT = setTimeout(next, AUTO_MS);
  }

  // ── gestures: hold (touch) / double-click (mouse) switch; single tap/click opens AI Entry ──
  let ptype = "mouse",
    holdT = 0,
    held = false,
    clickT = 0,
    bypass = false;
  const fast = () => (target = 2.4),
    slow = () => (target = 0.8);
  let target = 0.8;

  btn.addEventListener("pointerdown", (e) => {
    ptype = e.pointerType || "mouse";
    fast();
    btn.classList.remove("ai-orb-pressed");
    void btn.offsetWidth;
    btn.classList.add("ai-orb-pressed");
    setTimeout(() => btn.classList.remove("ai-orb-pressed"), 700);
    if (ptype !== "mouse") {
      held = false;
      clearTimeout(holdT);
      holdT = setTimeout(() => {
        held = true;
        showMenu();
        if (navigator.vibrate) navigator.vibrate(25);
      }, HOLD_MS);
    }
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    btn.addEventListener(ev, () => {
      clearTimeout(holdT);
      slow();
    }),
  );
  ["pointerenter", "focus"].forEach((ev) => btn.addEventListener(ev, fast));
  ["blur"].forEach((ev) => btn.addEventListener(ev, slow));
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMenu();
  });

  btn.addEventListener(
    "click",
    (e) => {
      if (bypass || e.detail === 0) return; // our own re-dispatch, or keyboard activation
      if (held) {
        held = false; // long press finished: don't open AI Entry
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      if (ptype === "mouse") {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (clickT) {
          clearTimeout(clickT);
          clickT = 0;
          next(); // double-click => change design
        } else {
          clickT = setTimeout(() => {
            clickT = 0;
            bypass = true;
            btn.click(); // single click => open AI Entry
            bypass = false;
          }, DBL_MS);
        }
      }
      // touch single tap: falls through to the original handler instantly
    },
    true,
  );

  // ── animation loop ──
  let ang = 0,
    speed = 0.8,
    last = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    speed += (target - speed) * Math.min(1, dt * 5);
    ang += speed * dt;
    if (morph) {
      morph.t += dt / 0.9;
      if (morph.t >= 1) {
        idx = morph.b;
        morph = null;
        saveDesign();
        burst();
      }
    }
    if (out) {
      fade -= dt / 0.18;
      if (fade <= 0) {
        fade = 0;
        idx = pend;
        saveDesign();
        burst();
        out = false;
      }
    } else if (fade < 1) fade = Math.min(1, fade + dt / 0.22);
    cv.style.opacity = fade;
    draw(ang, idx);
    requestAnimationFrame(frame);
  }
  if (reduce) draw(0.6, idx);
  else requestAnimationFrame(frame);
  scheduleAuto();
})();
