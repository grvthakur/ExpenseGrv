// ── AI Orb: turns the #aiEntryBtn floating button into a spinning orb of colour streaks ──
// Purely visual. Keeps the button element, its id, and ai-entry.js's onclick untouched.
// Load AFTER ai-entry.js:  <script src="ai-orb.js?v=1"></script>
(function () {
  "use strict";
  const SHOW_ICON = true; // the sparkle symbol in the middle; set false for a pure orb
  const DOTS = 560; // streak count (lower = lighter on old phones)
  const COLORS = [
    "#ff4d8d",
    "#ff9f1c",
    "#ffe14d",
    "#2ee6c5",
    "#3ab8ff",
    "#b36bff",
    "#7dff5c",
    "#ff5c5c",
  ];

  const btn = document.getElementById("aiEntryBtn");
  if (!btn || btn.dataset.orb) return;
  btn.dataset.orb = "1";
  btn.setAttribute("aria-label", "AI Entry");
  btn.title = "AI Entry";

  // 1) Override the old conic-border/sparkle styling (extra #id repeat beats `html body #aiEntryBtn`).
  const css = document.createElement("style");
  css.textContent = `
html body #aiEntryBtn#aiEntryBtn{
  overflow:visible !important;border:0 !important;padding:0 !important;
  background:#05060a !important;animation:none !important;
  box-shadow:0 0 0 1px rgba(255,255,255,.10),0 6px 20px rgba(0,0,0,.55),0 0 22px rgba(179,107,255,.35),0 0 34px rgba(46,230,197,.22) !important;
  transition:transform .18s ease,box-shadow .25s ease !important}
html body #aiEntryBtn#aiEntryBtn::before,
html body #aiEntryBtn#aiEntryBtn::after{content:none !important;display:none !important;animation:none !important}
html body #aiEntryBtn#aiEntryBtn:hover{transform:scale(1.07);
  box-shadow:0 0 0 1px rgba(255,255,255,.18),0 8px 26px rgba(0,0,0,.6),0 0 28px rgba(255,77,141,.45),0 0 44px rgba(58,184,255,.35) !important}
html body #aiEntryBtn#aiEntryBtn:active{transform:scale(.92)}
#aiEntryBtn .ai-orb-cv{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;pointer-events:none;display:block}
#aiEntryBtn .ai-orb-ic{position:relative;z-index:2;width:46%;height:46%;pointer-events:none;overflow:visible;
  filter:drop-shadow(0 0 3px rgba(0,0,0,.95)) drop-shadow(0 0 7px rgba(0,0,0,.8)) drop-shadow(0 0 6px #67e8f9);
  animation:aiOrbTw 2.4s ease-in-out infinite}
@keyframes aiOrbTw{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.14) rotate(12deg)}}
@media (prefers-reduced-motion:reduce){#aiEntryBtn .ai-orb-ic{animation:none}}
`;
  document.head.appendChild(css);

  // 2) Canvas + optional label. (ai-entry.js left a hidden "AI" text node; clear it.)
  btn.textContent = "";
  const cv = document.createElement("canvas");
  cv.className = "ai-orb-cv";
  btn.appendChild(cv);
  if (SHOW_ICON) {
    const ic = document.createElement("span");
    ic.innerHTML =
      '<svg class="ai-orb-ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M10 2l2 6.5L18.5 10 12 12l-2 6.5L8 12 1.5 10 8 8.5z"/><path fill="#67e8f9" d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></svg>';
    btn.appendChild(ic.firstChild);
    btn.style.fontSize = "0";
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  // 3) Points on a sphere (Fibonacci), each with a colour and a tiny random phase.
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

  // Rotation about a tilted axis → diagonal streaks like the reference clip.
  const TILT = -0.42; // radians
  const cT = Math.cos(TILT),
    sT = Math.sin(TILT);
  function project(p, ang) {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    // spin around Y, then tilt around Z
    let x = p.x * c + p.z * s,
      z = -p.x * s + p.z * c,
      y = p.y;
    const x2 = x * cT - y * sT,
      y2 = x * sT + y * cT;
    return [x2, y2, z];
  }

  const TRAIL = 0.22; // streak length in radians of rotation
  function draw(ang) {
    const R = S / 2,
      w = Math.max(0.9, S * 0.021);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, 6.2832);
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineWidth = w;
    for (let layer = 0; layer < 2; layer++) {
      // back hemisphere first (dim), then front
      ctx.globalAlpha = layer ? 1 : 0.38;
      for (let ci = 0; ci < COLORS.length; ci++) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p.c !== ci) continue;
          const a = project(p, ang),
            b = project(p, ang - TRAIL * p.k);
          if (a[2] > 0 !== !!layer) continue;
          ctx.moveTo(R + a[0] * R * 0.98, R + a[1] * R * 0.98);
          ctx.lineTo(R + b[0] * R * 0.98, R + b[1] * R * 0.98);
        }
        ctx.strokeStyle = COLORS[ci];
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 4) Animation loop — faster while hovered/pressed, static for reduced-motion.
  const reduce =
    window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ang = 0,
    speed = 0.9,
    target = 0.9,
    last = 0;
  const fast = () => (target = 2.6),
    slow = () => (target = 0.9);
  btn.addEventListener("pointerenter", fast);
  btn.addEventListener("pointerleave", slow);
  btn.addEventListener("pointerdown", fast);
  btn.addEventListener("pointerup", slow);
  btn.addEventListener("pointercancel", slow);
  btn.addEventListener("focus", fast);
  btn.addEventListener("blur", slow);

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    speed += (target - speed) * Math.min(1, dt * 6);
    ang += speed * dt;
    draw(ang);
    requestAnimationFrame(frame);
  }
  if (reduce) draw(0.6);
  else requestAnimationFrame(frame);
})();
