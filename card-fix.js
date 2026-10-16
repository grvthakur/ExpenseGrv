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
