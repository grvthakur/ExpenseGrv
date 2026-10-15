// ── AI Orb (premium): turns #aiEntryBtn into a glass sphere of flowing colour streaks ──
// Purely visual. Keeps the button element, its id, and ai-entry.js's onclick untouched.
// Load AFTER ai-entry.js:  <script src="ai-orb.js?v=2"></script>
(function () {
  "use strict";
  const SHOW_ICON = true; // sparkle symbol in the middle; false = pure orb
  const DOTS = 620; // streak count (lower = lighter on old phones)
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

  const btn = document.getElementById("aiEntryBtn");
  if (!btn || btn.dataset.orb) return;
  btn.dataset.orb = "1";
  btn.setAttribute("aria-label", "AI Entry");
  btn.title = "AI Entry";

  // 1) Override the old conic-border/sparkle styling (repeated #id beats `html body #aiEntryBtn`).
  const css = document.createElement("style");
  css.textContent = `
html body #aiEntryBtn#aiEntryBtn{
  overflow:visible !important;border:0 !important;padding:0 !important;
  background:#04050a !important;
  box-shadow:0 0 0 1px rgba(255,255,255,.16),0 0 0 3px rgba(255,255,255,.03),0 10px 26px rgba(0,0,0,.6),0 0 30px rgba(179,107,255,.6),0 0 48px rgba(46,230,197,.38),0 0 70px rgba(255,77,141,.22) !important;
  animation:aiOrbBreath 4.5s ease-in-out infinite !important;
  transition:transform .22s cubic-bezier(.2,.9,.3,1.2) !important}
@keyframes aiOrbBreath{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.16),0 0 0 3px rgba(255,255,255,.03),0 10px 26px rgba(0,0,0,.6),0 0 28px rgba(179,107,255,.52),0 0 46px rgba(46,230,197,.34),0 0 64px rgba(255,77,141,.2)}
  50%{box-shadow:0 0 0 1px rgba(255,255,255,.24),0 0 0 3px rgba(255,255,255,.05),0 12px 30px rgba(0,0,0,.65),0 0 44px rgba(255,77,141,.8),0 0 72px rgba(58,184,255,.55),0 0 96px rgba(179,107,255,.3)}}
html body #aiEntryBtn#aiEntryBtn::before,
html body #aiEntryBtn#aiEntryBtn::after{content:none !important;display:none !important;animation:none !important}
html body #aiEntryBtn#aiEntryBtn:hover{transform:scale(1.08) translateY(-1px)}
html body #aiEntryBtn#aiEntryBtn:active{transform:scale(.93)}
#aiEntryBtn .ai-orb-cv{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;pointer-events:none;display:block;filter:saturate(1.45) brightness(1.12)}
#aiEntryBtn .ai-orb-core{position:relative;z-index:2;width:50%;height:50%;display:grid;place-items:center;pointer-events:none}
#aiEntryBtn .ai-orb-core::before{content:"";position:absolute;inset:-26%;border-radius:50%;
  background:radial-gradient(circle,rgba(2,3,8,.62) 0,rgba(2,3,8,.38) 45%,transparent 72%)}
#aiEntryBtn .ai-orb-ic{position:relative;width:100%;height:100%;overflow:visible;
  filter:drop-shadow(0 0 5px rgba(255,255,255,.55)) drop-shadow(0 0 10px rgba(103,232,249,.55));
  animation:aiOrbTw 3.2s ease-in-out infinite}
@keyframes aiOrbTw{0%,100%{transform:scale(1) rotate(0);opacity:.96}50%{transform:scale(1.12) rotate(10deg);opacity:1}}
@media (prefers-reduced-motion:reduce){
  html body #aiEntryBtn#aiEntryBtn{animation:none !important}
  #aiEntryBtn .ai-orb-ic{animation:none}}`;
  document.head.appendChild(css);

  // 2) Canvas + icon. (ai-entry.js left a hidden "AI" text node; clear it.)
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
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  // 3) Points on a sphere (Fibonacci), each with a colour and a tiny random length factor.
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

  // Rotation about a tilted axis → diagonal streaks.
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

  // Depth bands: back (dim) → front edge (soft) → front centre (full). Gives volume.
  const BANDS = [
    { a: 0.42, f: (z) => z <= 0 },
    { a: 0.85, f: (z) => z > 0 && z < 0.38 },
    { a: 1, f: (z) => z >= 0.38 },
  ];
  const TRAIL = 0.22;

  function draw(ang) {
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

    // pre-project once per frame
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

    // Sphere shading: darker toward the rim, a touch of colour bounce light at the bottom-right.
    let g = ctx.createRadialGradient(R * 0.92, R * 0.86, R * 0.18, R, R, R);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.62, "rgba(2,3,8,.03)");
    g.addColorStop(1, "rgba(2,3,8,.26)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // Glass specular highlight (top-left).
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
    ctx.restore();

    // Fine rim light: bright top-left → transparent → coloured bottom-right.
    g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "rgba(255,255,255,.75)");
    g.addColorStop(0.45, "rgba(255,255,255,.06)");
    g.addColorStop(0.7, "rgba(103,232,249,.25)");
    g.addColorStop(1, "rgba(240,171,252,.6)");
    ctx.lineWidth = Math.max(1, S * 0.022);
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.arc(R, R, R - ctx.lineWidth / 2, 0, 6.2832);
    ctx.stroke();
  }

  // 4) Animation loop — eases faster on hover/press; static for reduced-motion.
  const reduce =
    window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ang = 0,
    speed = 0.8,
    target = 0.8,
    last = 0;
  const fast = () => (target = 2.4),
    slow = () => (target = 0.8);
  ["pointerenter", "pointerdown", "focus"].forEach((e) =>
    btn.addEventListener(e, fast),
  );
  ["pointerleave", "pointerup", "pointercancel", "blur"].forEach((e) =>
    btn.addEventListener(e, slow),
  );

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    speed += (target - speed) * Math.min(1, dt * 5);
    ang += speed * dt;
    draw(ang);
    requestAnimationFrame(frame);
  }
  if (reduce) draw(0.6);
  else requestAnimationFrame(frame);
})();
