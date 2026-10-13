// ── AI Smart Entry: parse text/SMS → fill existing form (user reviews, presses Add) ──
(function () {
  const $ = (id) => document.getElementById(id);
  const fab = $("aiEntryBtn") || document.createElement("button");
  fab.textContent = "✨ AI Entry";
  fab.className = "btn-summary";
  fab.style.cssText =
    "color:#c4b5fd;border-color:#8b5cf6;font-weight:700;white-space:nowrap";
  const box = document.createElement("div");
  box.style.cssText =
    "display:none;position:fixed;inset:0;z-index:20001;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px";
  box.innerHTML = `<div style="width:min(520px,100%);background:var(--surface,#13131c);color:var(--text,#eef);border:1px solid var(--border,#2a2a3d);border-radius:18px;padding:18px">
    <b style="font-size:1.1rem">✨ AI Transaction Entry</b>
    <p style="opacity:.7;font-size:.85rem;margin:6px 0 10px">Type or paste SMS/email. e.g. “Sweetie axis flipkart 600”</p>
    <textarea id="aiTxt" rows="5" style="width:100%;box-sizing:border-box;border-radius:12px;padding:10px;background:transparent;color:inherit;border:1px solid var(--border,#2a2a3d)"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button id="aiX" style="padding:9px 16px;border-radius:12px;border:1px solid var(--border,#2a2a3d);background:transparent;color:inherit">Cancel</button><button id="aiGo" style="padding:9px 18px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10">Parse</button></div></div>`;
  const sb = $("summaryBtn");
  if (fab.parentNode) {
  } else if (sb && sb.parentNode) sb.parentNode.insertBefore(fab, sb);
  else {
    fab.style.cssText += ";position:fixed;top:10px;right:10px;z-index:9999";
    document.body.append(fab);
  }
  document.body.append(box);
  const close = () => (box.style.display = "none");
  const warm = () => fetch(apiUrl("action=ver")).catch(() => {});
  setTimeout(warm, 2500);
  fab.onclick = () => {
    box.style.display = "flex";
    $("aiTxt").focus();
    warm();
  };
  $("aiX").onclick = close;
  const set = (id, v) => {
    const el = $(id);
    if (el && v !== undefined && v !== "") {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const M = {
    card: {
      tab: "cards",
      btn: "addCardBtn",
      f: [
        ["card", "Card", "cardSelect"],
        ["usedBy", "Used by", "cardUsedBy"],
        ["desc", "Description", "cardDesc"],
        ["remarks", "Remarks", "cardRemarks"],
        ["amount", "Amount", "cardAmount"],
        ["date", "Date", "cardTxnDate"],
      ],
    },
    expense: {
      tab: "expenses",
      btn: "addBtn",
      f: [
        ["category", "Category", "expenseCategory"],
        ["desc", "Description", "expenseDesc"],
        ["amount", "Amount", "expenseAmount"],
        ["date", "Date", "expenseDate"],
      ],
    },
    sweetie: {
      tab: "sweetie",
      btn: "addSweetieBtn",
      f: [
        ["type", "Type", "sweetieType"],
        ["amount", "Amount", "sweetieAmount"],
        ["date", "Date", "sweetieDate"],
        ["desc", "Description", "sweetieDesc"],
      ],
    },
  };
  const pv = document.createElement("div");
  pv.style.cssText = box.style.cssText;
  document.body.append(pv);
  const st =
    "width:100%;box-sizing:border-box;border-radius:10px;padding:9px;background:transparent;color:inherit;border:1px solid var(--border,#2a2a3d);font:inherit";
  function preview(r) {
    const m = M[r.kind] || M.expense,
      kind = M[r.kind] ? r.kind : "expense";
    if (kind !== "card" && r.remarks)
      r.desc = (r.desc ? r.desc + " - " : "") + r.remarks;
    const rows = m.f
      .map(([k, label, id]) => {
        const sel = $(id) && $(id).tagName === "SELECT";
        const v = String(r[k] ?? "").replace(/"/g, "&quot;");
        const inp = sel
          ? `<select data-k="${k}" style="${st}">${[...$(id).options].map((o) => `<option value="${o.value}" ${o.value === r[k] ? "selected" : ""} style="color:#000">${o.text}</option>`).join("")}</select>`
          : `<input data-k="${k}" type="${k === "date" ? "date" : k === "amount" ? "number" : "text"}" value="${v}" style="${st}">`;
        return `<label style="display:block;font-size:.78rem;opacity:.8;margin-top:10px">${label}${inp}</label>`;
      })
      .join("");
    pv.innerHTML = `<div style="width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--surface,#13131c);color:var(--text,#eef);border:1px solid var(--border,#2a2a3d);border-radius:18px;padding:18px"><b style="font-size:1.1rem">✨ Review ${kind} entry</b>${rows}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button id="pvC" style="padding:9px 16px;border-radius:12px;border:1px solid #f87171;background:transparent;color:#f87171">✕ Close</button><button id="pvX" style="padding:9px 16px;border-radius:12px;border:1px solid var(--border,#2a2a3d);background:transparent;color:inherit">↩ Cancel</button><button id="pvOk" style="padding:9px 20px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10">OK — Save</button></div></div>`;
    pv.style.display = "flex";
    $("pvC").onclick = () => {
      pv.style.display = "none";
      box.style.display = "none";
    };
    $("pvX").onclick = () => {
      pv.style.display = "none";
      box.style.display = "flex";
      $("aiTxt").focus();
    };
    $("pvOk").onclick = () => {
      const vals = {};
      pv.querySelectorAll("[data-k]").forEach(
        (e) => (vals[e.dataset.k] = e.value),
      );
      pv.style.display = "none";
      $("aiTxt").value = "";
      switchTab(m.tab);
      m.f.forEach(([k, , id]) => set(id, vals[k]));
      setTimeout(() => $(m.btn) && $(m.btn).click(), 150);
    };
  }
  const peopleSet = () => {
    const p = new Set(["sweetie", "grv", "gaurav", "me", "tanya"]);
    document
      .querySelectorAll("#cardSection table tbody tr td:nth-child(3)")
      .forEach((td) => p.add(td.textContent.trim().toLowerCase()));
    p.delete("");
    return p;
  };
  const cap = (w) =>
    w.length <= 3
      ? w.toUpperCase()
      : w[0].toUpperCase() + w.slice(1).toLowerCase();
  // Short extra line before/after an SMS ("GRV,FLIPKART") = who + description.
  function splitHint(text) {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;
    const junk =
      /^(dear|hi\b|hello|thank|your\b|info\b|regards|warm|team|note\b|if you|please|kindly|sincerely|to dispute|call\b|available|avl)/i;
    const ok = (l) =>
      l.length <= 140 &&
      !junk.test(l) &&
      !/\d{4,}/.test(l) &&
      !/\b(inr|rs\.?|bank|transaction|debited|credited|card)\b/i.test(l);
    let i = -1;
    for (let k = lines.length - 1; k >= 0; k--)
      if (ok(lines[k])) {
        i = k;
        break;
      }
    if (i < 0) return null;
    const ppl = peopleSet();
    const KW =
      /^(already|paid|pay|payed|kotak|hdfc|icici|axis|sbi|idfc|will|given|returned|return|pending|due|bill|settled|owed|borrowed|refund|via|from|through|cash|upi|gpay|phonepe|not|dont|don't|note|remind|reminder)$/i;
    const tc = (w) =>
      ppl.has(w.toLowerCase())
        ? cap(w)
        : w[0].toUpperCase() + w.slice(1).toLowerCase();
    const tidy = (x) =>
      x
        .replace(/\s*,\s*/g, ", ")
        .trim()
        .toUpperCase();
    const body = lines.filter((_, k) => k !== i).join("\n");
    let left = lines[i],
      rem = "";
    const ci = left.indexOf(":");
    if (ci > 0) {
      rem = left.slice(ci + 1);
      left = left.slice(0, ci);
    }
    let who = "",
      desc = "";
    const parts = left
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const nameLike = (p) =>
      p.split(/\s+/).length <= 3 && !p.split(/\s+/).some((w) => KW.test(w));
    if (parts.length >= 2 && nameLike(parts[0])) {
      who = parts[0].split(/\s+/).map(tc).join(" ");
      desc = parts.slice(1).join(" ");
    } else {
      const toks = left.split(/[\s,;]+/).filter(Boolean);
      const k = toks.findIndex((w) => KW.test(w));
      let rest = toks;
      if (k > 0 && k <= 3) {
        who = toks.slice(0, k).map(tc).join(" ");
        rest = toks.slice(k);
      } else if (k !== 0 && toks.length && ppl.has(toks[0].toLowerCase())) {
        who = tc(toks[0]);
        rest = toks.slice(1);
      }
      const txt = rest.join(" ");
      if (k >= 0 || (!rem && rest.length > 2))
        rem = rem ? txt + " " + rem : txt;
      else desc = txt;
    }
    return { body, who, desc: tidy(desc), rem: tidy(rem) };
  }
  // Instant offline parser: handles card + sweetie entries with no AI call.
  const MON = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const iso = (d) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  const cleanM = (m) =>
    String(m || "")
      .replace(/^[A-Za-z]{2,6}\*/, "")
      .replace(
        /\b(private|pvt|ltd|limited|internet|india|technologies|services)\b\.?/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const standalone = (t) =>
    t
      .split(/\n+/)
      .map((l) => l.trim())
      .find(
        (l) =>
          /^[A-Za-z][A-Za-z0-9*&.\-' ]{2,35}$/.test(l) &&
          !/\b(spent|bank|card|limit|avl|available|not you|dear|sms|ist|info|debited|credited|block|customer|regards)\b/i.test(
            l,
          ),
      ) || "";
  const skel = (w) => w.replace(/[aeiou]/g, "");
  const wm = (w, t) =>
    w === t ||
    (w.length > 3 &&
      (skel(w) === skel(t) ||
        (skel(w).length > 3 && skel(w) === skel(t).slice(0, skel(w).length))));
  const KWX =
    /^(already|paid|pay|payed|kotak|will|given|returned|return|pending|due|bill|settled|owed|borrowed|refund|via|from|through|cash|upi|gpay|phonepe|not|dont|don't|note|remind|reminder)$/i;
  function localParse(text) {
    if (text.length > 80) return null;
    let t =
      " " +
      text
        .toLowerCase()
        .replace(/[₹,]/g, "")
        .replace(/\brs\.?\b/g, " ") +
      " ";
    let date = new Date();
    if (/\byesterday\b/.test(t)) {
      date.setDate(date.getDate() - 1);
      t = t.replace(/\byesterday\b/, " ");
    } else if (/\btoday\b/.test(t)) t = t.replace(/\btoday\b/, " ");
    else {
      let m = t.match(
        /\b(\d{1,2})[ \-\/]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/,
      );
      if (m) {
        date = new Date(date.getFullYear(), MON.indexOf(m[2]), +m[1]);
        t = t.replace(m[0], " ");
      } else if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/))) {
        date = new Date(date.getFullYear(), +m[2] - 1, +m[1]);
        t = t.replace(m[0], " ");
      }
    }
    const am = t.match(/(\d+(?:\.\d+)?)/g);
    if (!am || am.length !== 1) return null;
    const amount = +am[0];
    t = t.replace(am[0], " ");
    const words = t.split(/[^a-z0-9]+/).filter(Boolean);
    const cards = (typeof cardConfig !== "undefined" ? cardConfig : []).map(
      (c) => c.card,
    );
    let best = null,
      bs = 0,
      tie = false;
    cards.forEach((c) => {
      const tk = c
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((x) => x.length > 2);
      const sc = tk.filter((x) => words.some((w) => wm(w, x))).length;
      if (sc > bs) {
        best = c;
        bs = sc;
        tie = false;
      } else if (sc === bs && sc > 0) tie = true;
    });
    const out = { amount, date: iso(date) };
    if (best && !tie && bs >= 1) {
      const used = best.toLowerCase().split(/[^a-z0-9]+/);
      const rest = words.filter((w) => !used.some((u) => wm(w, u)));
      const people = peopleSet();
      const k0 = rest.findIndex((w) => KWX.test(w));
      const main = k0 >= 0 ? rest.slice(0, k0) : rest;
      const rem = k0 >= 0 ? rest.slice(k0).join(" ").toUpperCase() : "";
      const who = main.filter((w) => people.has(w));
      const desc = main.filter((w) => !people.has(w));
      return {
        ...out,
        kind: "card",
        card: best,
        usedBy: who.length ? cap(who[0]) : "",
        desc: desc.join(" ").toUpperCase(),
        remarks: rem,
      };
    }
    if (words.includes("sweetie")) {
      const type =
        words.includes("saving") || words.includes("save")
          ? "SAVING"
          : words.includes("debit") || words.includes("borrow")
            ? "DEBIT"
            : words.includes("credit")
              ? "CREDIT"
              : null;
      if (type)
        return {
          ...out,
          kind: "sweetie",
          type,
          desc: words
            .filter(
              (w) =>
                ![
                  "sweetie",
                  "saving",
                  "save",
                  "debit",
                  "borrow",
                  "credit",
                ].includes(w),
            )
            .join(" ")
            .toUpperCase(),
        };
    }
    return null;
  }
  // Instant bank SMS / email parser (no AI): amount, card last-4/bank, date, merchant.
  async function smsParse(t) {
    if (t.length > 3000) return null;
    const am = t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i);
    if (
      !am ||
      !/\b(spent|debited|purchase|paid|payment|txn|transaction|charged)\b/i.test(
        t,
      )
    )
      return null;
    const amount = +am[1].replace(/,/g, "");
    if (!(amount > 0)) return null;
    let date = null,
      m;
    if (
      (m = t.match(/\b([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})\b/)) &&
      MON.includes(m[1].toLowerCase())
    )
      date = new Date(+m[3], MON.indexOf(m[1].toLowerCase()), +m[2]);
    else if (
      (m = t.match(
        /\b(\d{1,2})[-\/ ]([A-Za-z]{3})[a-z]*[-\/ ,]*(\d{2,4})\b/,
      )) &&
      MON.includes(m[2].toLowerCase())
    )
      date = new Date(
        +(m[3].length === 2 ? "20" + m[3] : m[3]),
        MON.indexOf(m[2].toLowerCase()),
        +m[1],
      );
    else if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)))
      date = new Date(+m[1], +m[2] - 1, +m[3]);
    else if ((m = t.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\b/)))
      date = new Date(
        +(m[3].length === 2 ? "20" + m[3] : m[3]),
        +m[2] - 1,
        +m[1],
      );
    if (!date || isNaN(date)) date = new Date();
    let card = null;
    const d4 = (t.match(/\b(?:card|a\/c|acct?)[^\d]{0,14}(\d{4})\b/i) ||
      t.match(/\b(?:x{2,}|\*{2,})\s*(\d{4})\b/i) ||
      [])[1];
    if (d4) {
      try {
        const rows =
          (typeof ccMasterCache !== "undefined" && ccMasterCache) ||
          (await fetchCCMasterData());
        const row = rows.find(
          (x) =>
            String(x[2] || "")
              .replace(/\D/g, "")
              .endsWith(d4) ||
            String(x[3] || "")
              .split("/")[0]
              .replace(/\D/g, "")
              .endsWith(d4),
        );
        const hit =
          row &&
          cardConfig.find(
            (c) =>
              c.card.toLowerCase() ===
              (
                String(row[0]).trim() +
                "-" +
                String(row[1]).trim()
              ).toLowerCase(),
          );
        if (hit) card = hit.card;
      } catch (_) {}
    }
    if (!card) {
      const bank = [
        "icici",
        "hdfc",
        "axis",
        "sbi",
        "kotak",
        "idfc",
        "pnb",
        "hsbc",
        "indusind",
        "rbl",
        "bob",
      ].find((b) => new RegExp("\\b" + b, "i").test(t));
      const c = bank
        ? cardConfig.filter((x) => x.card.toLowerCase().startsWith(bank))
        : [];
      if (c.length === 1) card = c[0].card;
    }
    if (!card) return null;
    const mm = t.match(
      /\b(?:at|towards|@)\s+([A-Za-z0-9][A-Za-z0-9 &.\-*'\/]{1,40}?)(?=\s*(?:\.\s|\.$|,|\s+on\b|\s+avl|\s+available|\s+ref|\s+upi|\s+if\b|\s+to dispute|\s+not you|\s+call|\s+limit|$))/i,
    );
    return {
      kind: "card",
      card,
      usedBy: "",
      desc: cleanM(
        mm
          ? mm[1]
          : (t.match(/\binfo:\s*([^\n]+?)\.?(?:\n|$)/i) || [])[1] ||
              standalone(t),
      ),
      amount,
      date: iso(date),
    };
  }
  $("aiGo").onclick = async () => {
    const text = $("aiTxt").value.trim();
    if (!text) return;
    const h0 = splitHint(text),
      body0 = h0 ? h0.body : text;
    let loc = localParse(body0);
    if (!loc) loc = await smsParse(body0);
    if (loc) {
      if (h0) {
        if (h0.desc) loc.desc = h0.desc;
        if (h0.rem) loc.remarks = h0.rem;
        if (h0.who && loc.kind === "card") loc.usedBy = h0.who;
      }
      close();
      preview(loc);
      return;
    }
    const b = $("aiGo");
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>Parsing…';
    try {
      const cards = cardConfig.map((c) => c.card).join(" | ");
      const cats = [...($("expenseCategory")?.options || [])]
        .map((o) => o.value)
        .join(" | ");
      const hint = splitHint(text);
      const raw = await (
        await fetch(
          apiUrl(
            `action=aiParse&text=${encodeURIComponent(hint ? hint.body : text)}&cards=${encodeURIComponent(cards)}&cats=${encodeURIComponent(cats)}`,
          ),
        )
      ).text();
      let r;
      try {
        r = JSON.parse(raw);
      } catch (_) {
        throw new Error("Server said: " + raw.slice(0, 160));
      }
      if (r.error) throw new Error(r.error);
      if (hint) {
        if (hint.desc) r.desc = hint.desc;
        if (hint.rem) r.remarks = hint.rem;
        if (hint.who && r.kind === "card") r.usedBy = hint.who;
      }
      if (r.kind === "card") {
        if (
          !hint?.who &&
          r.usedBy &&
          !text.toLowerCase().includes(String(r.usedBy).toLowerCase())
        )
          r.usedBy = "";
        try {
          const d = (text.match(/\b(?:card|a\/c|acct?)[^\d]{0,12}(\d{4})\b/i) ||
            [])[1];
          if (d) {
            const rows =
              (typeof ccMasterCache !== "undefined" && ccMasterCache) ||
              (await fetchCCMasterData());
            const row = rows.find(
              (x) =>
                String(x[2] || "")
                  .replace(/\D/g, "")
                  .endsWith(d) ||
                String(x[3] || "")
                  .split("/")[0]
                  .replace(/\D/g, "")
                  .endsWith(d),
            );
            const hit =
              row &&
              cardConfig.find(
                (c) =>
                  c.card.toLowerCase() ===
                  (
                    String(row[0]).trim() +
                    "-" +
                    String(row[1]).trim()
                  ).toLowerCase(),
              );
            if (hit) r.card = hit.card;
          }
        } catch (_) {}
      }
      close();
      preview(r);
    } catch (e) {
      toast("AI parse failed: " + e.message, true);
    } finally {
      b.disabled = false;
      b.textContent = "Parse";
    }
  };
})();
