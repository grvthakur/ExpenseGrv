// Manage Cards fix — load AFTER script.js:  <script src="card-fix.js"></script>
(function () {
  "use strict";
  const st = document.createElement("style");
  st.textContent = `
.grv-manage-edit,.grv-manage-delete{cursor:pointer!important;pointer-events:auto!important;position:relative;z-index:2;transition:transform .15s,filter .15s,box-shadow .15s,background .15s!important}
.grv-manage-edit:hover{filter:brightness(1.25);transform:translateY(-1px);box-shadow:0 4px 14px rgba(34,211,238,.35)}
.grv-manage-delete:hover{filter:brightness(1.2);transform:translateY(-1px);background:rgba(248,113,113,.28)!important;box-shadow:0 4px 14px rgba(248,113,113,.4)}
.grv-manage-edit:active,.grv-manage-delete:active{transform:scale(.95)}
.grv-manage-edit:focus-visible,.grv-manage-delete:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}`;
  document.head.appendChild(st);

  const nm = (x) =>
    String(x || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };
  function fillFromCC(rows, key) {
    if (!Array.isArray(rows) || editingGrvCardKey !== key) return false;
    const k = nm(key);
    const r = rows.find(
      (x) =>
        nm(x[1]) === k ||
        nm(x[0] + "-" + x[1]) === k ||
        nm(x[0] + " " + x[1]) === k,
    );
    if (!r) return false;
    set(
      "newCardBank",
      String(r[0] || "").trim() ||
        document.getElementById("newCardBank")?.value,
    );
    set(
      "newCardNumberCvv",
      String(r[3] || r[2] || "")
        .replace(/\s+/g, "")
        .trim(),
    );
    const m = /^([A-Za-z]{3})-(\d{2})$/.exec(formatExpDate(r[4]));
    if (m) {
      set(
        "newCardExpMonth",
        m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(),
      );
      set("newCardExpYear", "20" + m[2]);
    }
    return true;
  }

  const _open = openGrvCardConfig;
  openGrvCardConfig = function (key) {
    _open(key);
    if (typeof key !== "string" || !key) return;
    if (ccMasterCache) fillFromCC(ccMasterCache, key);
    fetchCCMasterData()
      .then((rows) => {
        if (!fillFromCC(rows, key) && editingGrvCardKey === key)
          toast("ℹ️ No CC Master row found for this card", true, 4000);
      })
      .catch((e) =>
        toast(
          "⚠️ Could not load card details: " + (e.message || e),
          true,
          4000,
        ),
      );
  };

  // Apps Script saves OK but the browser often can't read the reply ("Failed to fetch").
  // So on a network error we verify by re-reading CardConfig instead of assuming failure.
  async function verifySaved(u) {
    const q = new URL(u).searchParams;
    const card = q.get("card"),
      old = q.get("oldCard");
    const want = ["cutoff", "limit", "dueDay", "dueMonthOffset"].map(
      (k) => Number(q.get(k)) || 0,
    );
    for (let t = 0; t < 5; t++) {
      await new Promise((r) => setTimeout(r, t ? 2500 : 1500));
      try {
        const rows = await (await fetch(apiUrl("action=getCardConfig"))).json();
        if (!Array.isArray(rows)) continue;
        const row = rows.slice(1).find((r) => String(r[0]).trim() === card);
        if (!row) continue;
        const got = [1, 2, 3, 4].map((i) => Number(row[i]) || 0);
        if (
          want.every((v, i) => v === got[i]) &&
          (!old ||
            old === card ||
            !rows.slice(1).some((r) => String(r[0]).trim() === old))
        )
          return true;
      } catch (_) {}
    }
    return false;
  }

  const _save = saveGrvCardConfig;
  saveGrvCardConfig = async function () {
    const before = cardConfig.map((c) => ({ ...c }));
    const f = window.fetch;
    let txt = null;
    window.fetch = function (u, ...a) {
      if (!String(u).includes("action=upsertCardConfig"))
        return f.call(this, u, ...a);
      return f
        .call(this, u, ...a)
        .then(async (r) => {
          const t = await r.clone().text();
          if (!/^(?:Added|Updated|OK)/.test(t)) txt = t;
          return r;
        })
        .catch(async (err) => {
          if (await verifySaved(String(u)))
            return new Response("Updated", { status: 200 });
          txt =
            "Network error: " + err.message + " (sheet me change nahi mila)";
          throw err;
        });
    };
    try {
      await _save();
    } finally {
      window.fetch = f;
    }
    if (txt === null) return;
    cardConfig = before;
    saveLocal();
    populateCardDropdown();
    populateGrvCardDropdown();
    renderGrvManageCards?.();
    toast("⚠️ Not saved: " + txt.slice(0, 140), true, 8000);
  };
})();

// ─── CC Master copy: shared helper ───────────────────────────────────────────
// Works on https, http://localhost and falls back to execCommand for old/insecure contexts.
(function () {
  const st = document.createElement("style");
  st.textContent = `#ccMasterBody .cc-num,#ccMasterBody .cc-cvv,#ccMasterBody .cc-exp,#ccMasterBody .cc-card-name{-webkit-user-select:all;user-select:all;-webkit-touch-callout:default;cursor:copy;touch-action:manipulation}
#ccMasterBody .cc-num:active,#ccMasterBody .cc-cvv:active,#ccMasterBody .cc-exp:active,#ccMasterBody .cc-card-name:active{opacity:.6}`;
  document.head.appendChild(st);

  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch (_) {}
    const a = document.createElement("textarea");
    a.value = t;
    a.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    (document.getElementById("ccMasterModal") || document.body).appendChild(a);
    a.focus();
    a.select();
    a.setSelectionRange(0, t.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {}
    a.remove();
    return ok;
  };

  // Tap on number / CVV / expiry / name copies just that value.
  // Number is copied as plain digits (no spaces) so it pastes cleanly in any payment form.
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(
      "#ccMasterBody .cc-num,#ccMasterBody .cc-cvv,#ccMasterBody .cc-exp,#ccMasterBody .cc-card-name",
    );
    if (!el) return;
    let v = el.textContent.trim();
    if (!v || v === "—") return;
    const isNum = el.classList.contains("cc-num");
    if (isNum) v = v.replace(/\s+/g, "");
    const label = isNum
      ? "Card number"
      : el.classList.contains("cc-cvv")
        ? "CVV"
        : el.classList.contains("cc-exp")
          ? "Expiry"
          : "Name";
    toast(
      (await copy(v)) ? "✓ " + label + " copied" : "Copy failed",
      false,
      1500,
    );
  });

  // "⧉ Copy" button: copies full details, number in BOTH formats:
  //   ROARBANK ROARBANK-RUPAY
  //   Card: 6529 7401 0084 8829 / 6529740100848829
  //   Exp: Oct-26
  //   CVV: 447
  // WhatsApp only turns a number green (tap -> Copy) if it parses as a phone number.
  // A group starting with "00" can be read as an international prefix and splits the number
  // (e.g. 6529 7401 0084 8829 turned green only partly). For such numbers use hyphens,
  // otherwise normal 4-4-4-4 spacing.
  const waNumber = (digits) => {
    const g = digits.match(/.{1,4}/g) || [];
    if (g.length < 2) return digits;
    return g.slice(1).some((x) => x.startsWith("00"))
      ? g.join("-")
      : g.join(" ");
  };

  window.copyCC = async function (btn) {
    const card = btn.closest(".cc-card-item");
    if (!card) return;
    const txt = (sel) => (card.querySelector(sel)?.textContent || "").trim();
    const bank = txt(".cc-bank-badge");
    const name = txt(".cc-card-name");
    const spaced = txt(".cc-num");
    const plain = spaced.replace(/\s+/g, "");
    const exp = txt(".cc-exp") || "—";
    const cvv = txt(".cc-cvv") || "—";
    const text =
      `${[bank, name].filter(Boolean).join(" ")}\n` +
      `Card: ${waNumber(plain)}${plain ? " / " + plain : ""}\n` +
      `Exp: ${exp}\n` +
      `CVV: ${cvv}`;
    const ok = await copy(text);
    toast(ok ? "✓ Copied" : "Copy failed", !ok, 1500);
    if (!ok) return;
    btn.textContent = "✓ Copied";
    btn.classList.add("done");
    setTimeout(() => {
      btn.textContent = "⧉ Copy";
      btn.classList.remove("done");
    }, 1500);
  };
})();

// ─── CC Master INSTANT OPEN ──────────────────────────────────────────────────
// Last-known card list is kept on this device, so CC Master opens the moment you tap it.
// Fresh data is fetched silently in the background and the list updates only if something changed.
// Set CC_PERSIST = false if you ever want nothing stored in the browser (opens slower then).
const CC_PERSIST = true;
const CC_CACHE_KEY = "cc_master_cache_v1";
(function () {
  if (CC_PERSIST) {
    try {
      const saved = JSON.parse(localStorage.getItem(CC_CACHE_KEY) || "null");
      if (Array.isArray(saved) && saved.length) ccMasterCache = saved;
    } catch (_) {}
  } else {
    try {
      localStorage.removeItem(CC_CACHE_KEY);
    } catch (_) {}
  }
  const note = document.querySelector(
    "#ccMasterModal .modal-content > div:last-child",
  );
  if (note && CC_PERSIST)
    note.textContent =
      "🔒 Opens instantly from this device · refreshes live from sheet in background";
})();

// CC Master loading: 60s timeout, NO retry pile-up (retries were doubling the load on Apps Script).
(function () {
  fetchCCMasterData = function () {
    if (ccMasterFetchPromise) return ccMasterFetchPromise;
    ccMasterFetchPromise = (async () => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 60000);
      try {
        const r = await fetch(apiUrl("action=getCCMaster"), {
          signal: c.signal,
        });
        const d = await r.json();
        if (!Array.isArray(d))
          throw new Error(d.error || "Unable to load CC Master");
        ccMasterCache = d;
        if (CC_PERSIST) {
          try {
            localStorage.setItem(CC_CACHE_KEY, JSON.stringify(d));
          } catch (_) {}
        }
        return d;
      } catch (e) {
        throw new Error(
          e.name === "AbortError"
            ? "Server bahut slow hai — thodi der baad CC Master dobara tap karo"
            : e.message || "Could not load CC Master",
        );
      } finally {
        clearTimeout(t);
        ccMasterFetchPromise = null;
      }
    })();
    return ccMasterFetchPromise;
  };

  // Warm up right now (don't wait for the user to tap), then keep it fresh every 5 min.
  fetchCCMasterData().catch(() => {});
  setInterval(
    () => {
      if (document.visibilityState === "visible")
        fetchCCMasterData().catch(() => {});
    },
    5 * 60 * 1000,
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      fetchCCMasterData().catch(() => {});
  });
})();
