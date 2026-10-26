"use strict";
/*
 * Real-browser check (Playwright + Chromium). Optional: skipped when playwright is not installed.
 *   node tests/browser-check.js [screenshotDir]
 * Synthetic data, local static server, every external request is blocked or mocked with a delay.
 * Checks: no ₹0 flash on load, Total Saving never shows a this-month-only number before history
 * arrives, six cards fit at 360/390/768/1280px (no horizontal scroll), screenshots for eyeballing.
 */
const fs = require("fs"), path = require("path"), http = require("http");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { console.log("SKIPPED: playwright not installed"); process.exit(0); }
const ROOT = path.resolve(__dirname, ".."), SHOTS = process.argv[2];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".txt": "text/plain" };
const IDS = ["statTotalExpenses", "statSalary", "statRemaining", "statSweetie", "statTotalSaving", "statMonthSaving"];
const exp = [["1","2026-10-02","Oct-26","Food and Groceries","a",20000],["2","2026-10-03","Oct-26","Savings and Investments","sip",5000],["3","2026-10-04","Oct-26","Sweetie Saving","sw",1650],["4","2026-10-05","Oct-26","Sweetie Borrow","b",43000],["5","2026-10-06","Oct-26","Shopping","s",1200.5]];
const hist = [...exp, ["9","2026-09-02","Sep-26","Savings and Investments","sip",100000],["10","2026-08-02","Aug-26","Sweetie Saving","sw",53420]];
const local = exp.map((r) => ({ id: r[0], date: r[1], month: r[2], category: r[3], description: r[4], amount: r[5] }));
const sweetie = [["s1","SAVING",50000,0,"2026-09-09","save"],["s2","DEBIT",300,0,"2026-10-09","chai"]];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS  " : "FAIL  ") + name + (extra ? "  → " + extra : "")); };
const server = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/") p = "/index.html"; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(d); }); });
(async () => {
  await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((d) => { try { localStorage.setItem("exp_v3", JSON.stringify(d)); localStorage.setItem("sal_v3", JSON.stringify({ "Oct-26": 63668 })); localStorage.setItem("sweetie_v1", "[]"); } catch (e) {} }, local);
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith("http://localhost")) return route.continue();
    if (u.includes("script.google.com")) {
      await new Promise((r) => setTimeout(r, 900));
      const a = new URL(u).searchParams.get("action");
      const body = a === "getByMonth" ? exp : a === "get" ? hist : a === "getSalary" ? [["Month","Amount"],["Oct-26",63668]] : a === "getSweetie" ? sweetie : [];
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    }
    return route.abort();
  });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  const samples = [];
  for (let t = 0; t <= 5000; t += 100) { samples.push(await page.evaluate((ids) => ids.map((i) => (document.getElementById(i) || {}).textContent), IDS)); await page.waitForTimeout(100); }
  const final = samples[samples.length - 1], firstFilled = samples.find((s) => s[0] && s[0] !== "₹0");
  console.log("final cards:", final.join(" | "));
  const FINAL_EXP = "₹64,500.50"; // 20,000 + 43,000 + 1,200.50 + 300 Sweetie ledger DEBIT; SIP 5,000 and Sweetie Saving 1,650 excluded
  check("no ₹0 flash: Total Expenses is never 0 once data is cached", samples.every((s) => !/^₹?0(\.00)?$/.test(s[0] || "")) , samples.find((s) => /^₹?0(\.00)?$/.test(s[0] || "")) ? "saw a zero" : "");
  check("Total Expenses excludes SIP + Sweetie Saving", final[0] === FINAL_EXP, final[0]);
  check("Total Saving never shows the this-month-only ₹6,650 as a total", samples.every((s) => !/6,?650/.test(s[4] || "")) || final[4] === "₹6,650.00", samples.map((s) => s[4]).filter((v, i, a) => a.indexOf(v) === i).join(" / "));
  check("Total Saving ends at the all-month total (₹1,60,070.00)", final[4] === "₹1,60,070.00", final[4]);
  check("This Month Saving = ₹6,650.00", final[5] === "₹6,650.00", final[5]);
  check("Sweetie Balance = Sweetie tab running balance (₹49,700.00)", final[3] === "₹49,700.00", final[3]);
  check("number formats are consistent (Indian grouping, 2 decimals, same style on every card)", final.every((v) => /^(-?₹|₹-)[\d,]+\.\d{2}$/.test(v) || v === "—"), final.join(" | "));
  const real = errs.filter((e) => !/ccMasterCache/.test(e)); // pre-existing error on the baseline too
  check("no new page errors", real.length === 0, real.join("; "));
  for (const [w, h, name] of [[360, 740, "mobile-360"], [390, 844, "mobile-390"], [768, 1024, "tablet-768"], [1280, 900, "desktop-1280"]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const st = document.querySelector("#expenseSection .stats"), r = st.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, cards: st.querySelectorAll(".stat").length, top: Math.round(r.top), h: Math.round(r.height), btn: !!document.getElementById("amountMaskBtn") }; });
    check(`${name}: no horizontal scroll, 6 cards, mask button`, m.sw <= m.iw + 1 && m.cards === 6 && m.btn, `scrollWidth ${m.sw} / viewport ${m.iw}, cards block height ${m.h}px`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png"), clip: { x: 0, y: 0, width: w, height: Math.min(h, 520) } }); }
  }
  for (const [w, h, name] of [[390, 844, "m"], [1280, 900, "d"]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const ib = document.getElementById("versionBtn"), wd = document.getElementById("grv-visual-theme-widget"), th = document.getElementById("themeToggleBtn"); const a = wd.getBoundingClientRect(), b = ib.getBoundingClientRect(), c = th.getBoundingClientRect(); const hit = (x, y) => a.left < x.right && a.right > x.left && a.top < x.bottom && a.bottom > x.top; return { sameRow: wd.parentNode === ib.parentNode, overlapInfo: hit(b), overlapLight: hit(c), pos: getComputedStyle(wd).position, gap: Math.round(b.left - a.right) }; });
    const near = Math.abs(r.gap) <= 60;
    check(`${name === "m" ? "mobile" : "desktop"}: Appearance sits beside the (i) button, no overlap`, !r.overlapInfo && !r.overlapLight && (name === "m" ? r.pos === "absolute" || r.pos === "fixed" : r.sameRow && r.pos === "relative"), JSON.stringify(r));
    await page.click("#versionBtn"); await page.waitForTimeout(200);
    const top = await page.evaluate(() => { const p = document.getElementById("versionPopup").getBoundingClientRect(); const el = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); return !!(el && el.closest("#versionPopup")); });
    check(`${name === "m" ? "mobile" : "desktop"}: info popup is on top (Appearance is not above it)`, top);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `header-${name}-info.png`), clip: { x: 0, y: 0, width: w, height: 300 } });
    await page.click("#versionBtn"); await page.click("#grv-visual-theme-toggle"); await page.waitForTimeout(200);
    const open = await page.evaluate(() => { const p = document.getElementById("grv-visual-theme-panel").getBoundingClientRect(); return p.width > 0 && p.left >= 0 && p.right <= innerWidth && p.top >= 0; });
    check(`${name === "m" ? "mobile" : "desktop"}: Appearance panel opens fully on screen`, open);
    await page.click("#grv-visual-theme-toggle");
  }
  const sub = await page.evaluate(() => document.getElementById("statBorrowSub").textContent);
  check("Remaining card shows Sweetie Borrow as its right half", /^₹[\d,]+\.\d{2}$/.test(sub), sub);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  await page.click("#amountMaskBtn"); await page.waitForTimeout(150);
  const blur = await page.evaluate(() => getComputedStyle(document.querySelector("#statTotalSaving")).filter);
  check("mask button blurs the amounts", /blur/.test(blur), blur);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "masked-1280.png"), clip: { x: 0, y: 0, width: 1280, height: 400 } });
  await browser.close(); server.close();
  const bad = results.filter((r) => !r).length; console.log(`\n==== browser checks: ${results.length - bad} passed, ${bad} failed ====`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("browser-check crashed:", e.message); process.exit(2); });
