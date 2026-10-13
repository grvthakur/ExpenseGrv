// ── AI Smart Entry: parse text/SMS → fill existing form (user reviews, presses Add) ──
(function () {
  const $ = (id) => document.getElementById(id);
  const fab = $("aiEntryBtn") || document.createElement("button");
  fab.textContent = "AI";
  fab.className = "btn-summary";
  fab.style.cssText =
    "color:#c4b5fd;border-color:#8b5cf6;font-weight:700;white-space:nowrap";
  const box = document.createElement("div");
  box.style.cssText =
    "display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px";
  box.innerHTML = `<div style="width:min(520px,100%);background:var(--surface,#13131c);color:var(--text,#eef);border:1px solid var(--border,#2a2a3d);border-radius:18px;padding:18px;position:relative;border-top:3px solid #22d3ee;box-shadow:0 20px 60px #000a,0 0 40px #22d3ee22">
    <button id="aiX" onclick="this.closest('[data-ov]').style.display='none'" title="Close" style="position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;border:1px solid var(--border,#2a2a3d);background:transparent;color:inherit;opacity:.7;cursor:pointer">✕</button>
    <b style="font-size:1.1rem">✨ AI Transaction Entry</b>
    <p style="opacity:.7;font-size:.85rem;margin:6px 0 10px">Paste a bank SMS or email to add a transaction, or ask a question about your spending.</p>
    <textarea id="aiTxt" rows="5" style="width:100%;box-sizing:border-box;border-radius:12px;padding:10px;background:transparent;color:inherit;border:1px solid var(--border,#2a2a3d)"></textarea>
    <div style="margin-top:12px"><button id="aiGo" style="width:100%;padding:10px 18px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10;cursor:pointer">Parse</button></div></div>`;
  const sb = $("summaryBtn");
  if (fab.parentNode) {
  } else if (sb && sb.parentNode) sb.parentNode.insertBefore(fab, sb);
  else {
    fab.style.cssText += ";position:fixed;top:10px;right:10px;z-index:9999";
    document.body.append(fab);
  }
  box.dataset.ov = 1;
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
  $("aiTxt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("aiGo").click();
    }
  });
  fab.style.cssText +=
    ";background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;border:1px solid #67e8f9;font-weight:800;box-shadow:0 0 12px #22d3eecc,0 0 28px #8b5cf688;text-shadow:0 0 8px #fff8;animation:aiGlow 2s ease-in-out infinite alternate";
  const gs = document.createElement("style");
  gs.textContent =
    ".qaB{width:36px;height:36px;border-radius:12px;border:1px solid #ffffff22;background:#ffffff0d;color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:.18s}.qaB:hover{background:#22d3ee22;border-color:#22d3ee;color:#67e8f9;box-shadow:0 0 14px #22d3ee66;transform:translateY(-1px)}.qaX:hover{background:#f43f5e22;border-color:#f43f5e;color:#fda4af;box-shadow:0 0 14px #f43f5e66}.qaR{transition:.15s}.qaR:hover{background:#22d3ee14;padding-left:14px!important}" +
    "@keyframes aiGlow{from{box-shadow:0 0 8px #22d3ee88,0 0 18px #8b5cf655}to{box-shadow:0 0 18px #22d3eeff,0 0 40px #8b5cf6aa}}";
  document.head.append(gs);
  box.addEventListener("mousedown", (e) => {
    if (e.target === box) close();
  });
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
    pv.innerHTML = `<div style="width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--surface,#13131c);color:var(--text,#eef);border:1px solid var(--border,#2a2a3d);position:relative;border-radius:18px;padding:18px;border-top:3px solid #22d3ee;box-shadow:0 20px 60px #000a,0 0 40px #22d3ee22"><div style="position:absolute;top:10px;right:10px;display:flex;gap:6px"><button id="pvX" title="Back" style="width:36px;height:36px;border-radius:50%;border:1px solid #22d3ee99;background:#22d3ee1f;color:#67e8f9;cursor:pointer;font-size:1.05rem;line-height:1;position:relative;z-index:5;pointer-events:auto">↩</button><button id="pvC" title="Close" style="width:36px;height:36px;border-radius:50%;border:1px solid #22d3ee99;background:#22d3ee1f;color:#67e8f9;cursor:pointer;font-size:1.05rem;line-height:1;position:relative;z-index:5;pointer-events:auto">✕</button></div><b style="font-size:1.1rem">✨ Review ${kind} entry</b>${rows}<div style="margin-top:16px"><button id="pvOk" style="width:100%;padding:10px 20px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10;cursor:pointer">OK — Save</button></div></div>`;
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
      if (!(+vals.amount > 0)) return toast("Enter a valid amount", true);
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
  // ── Ask your data (all 4 tabs): AI makes a query plan, JS computes exact numbers ──
  const qa = document.createElement("div");
  qa.style.cssText =
    "display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px";
  qa.dataset.ov = 1;
  document.body.append(qa);
  const inr = (n) =>
    "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const isQuestion = (t) => {
    if (
      /\b(inr|rs\.?)\s*[\d,]+/i.test(t) &&
      /\b(spent|debited|purchase|txn|transaction|card)\b/i.test(t)
    )
      return false;
    if (t.length > 300) return false;
    if (!/\d/.test(t)) return true;
    return (
      /\?\s*$/.test(t) ||
      /\b(unpaid|paid|owed|settled|pending|wala|wale|this month|last month|is mahine|pichle)\b/i.test(
        t,
      ) ||
      /^(kitna|kitne|kitni|kya|kaun|kab|kaha|kahan|how|what|which|who|when|show|list|total|batao|bata|dikha|compare|give)\b/i.test(
        t,
      ) ||
      /\b(kitna|kitne|kitni|batao|bataiye|dikhao|how much|how many|sabse zyada|sabse kam|highest|lowest|average|month ?wise)\b/i.test(
        t,
      )
    );
  };
  let dataCache = null;
  const jget = async (q) => {
    const r = await fetch(apiUrl(q));
    return JSON.parse(await r.text());
  };
  const MK = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const mkIso = (k) => {
    const m = String(k).match(/^([A-Za-z]{3})[a-z]*[-\s]+(\d{2,4})/);
    if (!m || !MK[m[1].toLowerCase()]) return "";
    const y = m[2].length === 2 ? "20" + m[2] : m[2];
    return y + "-" + String(MK[m[1].toLowerCase()]).padStart(2, "0") + "-01";
  };
  const blank = {
    person: "",
    card: "",
    category: "",
    remarks: "",
    status: "",
    type: "",
  };
  function extraRows(e, c, sal) {
    const out = [];
    const salM = {};
    (Array.isArray(sal) ? sal.slice(1) : []).forEach((r) => {
      const d = mkIso(r[0]);
      if (!d) return;
      salM[d.slice(0, 7)] = +r[1] || 0;
      out.push({
        ...blank,
        src: "salary",
        date: d,
        desc: "Salary " + r[0],
        amount: +r[1] || 0,
        category: "Salary",
      });
    });
    const mm = {};
    (Array.isArray(e) ? e : []).forEach((r) => {
      const k = String(r[1]).slice(0, 7),
        cat = String(r[3]).trim();
      const o = (mm[k] = mm[k] || { exp: 0, rec: 0 });
      const a = +r[5] || 0;
      if (cat === "Received") o.rec += a;
      else if (cat !== "Sweetie Borrow") o.exp += a;
    });
    Object.keys({ ...mm, ...salM }).forEach((k) => {
      const o = mm[k] || { exp: 0, rec: 0 },
        s = salM[k] || 0;
      out.push({
        ...blank,
        src: "summary",
        date: k + "-01",
        category: "Summary",
        desc:
          "Salary " +
          inr(s) +
          " | Spent " +
          inr(o.exp) +
          " | Received " +
          inr(o.rec),
        amount: s + o.rec - o.exp,
      });
    });
    const used = {};
    (Array.isArray(c) ? c : []).forEach((r) => {
      if (String(r[7]).toUpperCase() === "UNPAID")
        used[r[1]] = (used[r[1]] || 0) + (+r[6] || 0);
    });
    const today = iso(new Date());
    (typeof cardConfig !== "undefined" ? cardConfig : []).forEach((x) => {
      const u = used[x.card] || 0,
        lim = +x.limit || 0;
      out.push({
        ...blank,
        src: "config",
        card: x.card,
        date: today,
        category: "Card limit",
        desc:
          "Limit " +
          inr(lim) +
          " | Used " +
          inr(u) +
          (lim ? " (" + Math.round((u / lim) * 100) + "%)" : "") +
          " | Due day " +
          (x.dueDay || "-") +
          " | Cutoff " +
          (x.cutoff || "-"),
        amount: lim - u,
      });
    });
    return out;
  }
  const loadData = () => {
    if (dataCache && Date.now() - dataCache.t < 60000) return dataCache.p;
    const p = Promise.all([
      jget("action=get").catch(() => []),
      jget("action=getCardsByTxnMonth&txnMonth=20").catch(() => []),
      jget("action=getSweetie").catch(() => []),
      jget("action=getSalary").catch(() => []),
    ]).then(([e, c, w, sal]) => [
      ...extraRows(e, c, sal),
      ...(Array.isArray(e) ? e : []).map((r) => ({
        src: "expenses",
        date: String(r[1]),
        category: r[3],
        desc: r[4],
        amount: +r[5] || 0,
        person: "",
        card: "",
        remarks: "",
        status: "",
        type: "",
      })),
      ...(Array.isArray(c) ? c : []).map((r) => ({
        src: "cards",
        card: r[1],
        person: r[2],
        desc: r[3],
        date: String(r[4]),
        remarks: r[5],
        amount: +r[6] || 0,
        status: r[7],
        category: "",
        type: "",
      })),
      ...(Array.isArray(w) ? w : []).map((r) => ({
        src: "sweetie",
        type: String(r[1]).toUpperCase(),
        amount:
          (String(r[1]).toUpperCase() === "DEBIT" ? -1 : 1) *
          Math.abs(+r[2] || 0),
        date: String(r[4]),
        desc: r[5],
        person: "",
        card: "",
        category: "",
        remarks: "",
        status: "",
      })),
    ]);
    dataCache = { t: Date.now(), p };
    return p;
  };
  const SELF = ["grv", "gaurav", "me"];
  function runPlan(pl, all) {
    const src = (
      pl.sources && pl.sources.length
        ? pl.sources
        : ["cards", "expenses", "sweetie"]
    ).map((x) => String(x).toLowerCase());
    const lc = (x) => String(x || "").toLowerCase();
    const per = lc(pl.person),
      card = lc(pl.card),
      cat = lc(pl.category),
      st = lc(pl.status),
      ty = lc(pl.type);
    const words = lc(pl.text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1);
    const pset = SELF.includes(per) ? SELF : per ? [per] : [];
    let rows = all.filter((r) => src.includes(r.src));
    if (pl.from) rows = rows.filter((r) => r.date >= pl.from);
    if (pl.to) rows = rows.filter((r) => r.date <= pl.to);
    if (per)
      rows = rows.filter(
        (r) =>
          r.src === "cards" &&
          pset.some((p) => lc(r.person) === p || lc(r.person).includes(p)),
      );
    if (card)
      rows = rows.filter(
        (r) =>
          (r.src !== "cards" && r.src !== "config") ||
          lc(r.card) === card ||
          lc(r.card).includes(card) ||
          card.includes(lc(r.card)),
      );
    if (cat)
      rows = rows.filter(
        (r) => r.src !== "expenses" || lc(r.category).includes(cat),
      );
    else
      rows = rows.filter(
        (r) =>
          !(
            r.src === "expenses" &&
            lc(r.category) === "received" &&
            !words.length
          ),
      );
    if (st) rows = rows.filter((r) => r.src !== "cards" || lc(r.status) === st);
    if (ty) rows = rows.filter((r) => r.src !== "sweetie" || lc(r.type) === ty);
    if (words.length)
      rows = rows.filter((r) => {
        const h = lc(
          [r.desc, r.remarks, r.card, r.category, r.person].join(" "),
        );
        return words.every((w) => h.includes(w));
      });
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    const total = rows.reduce((a, r) => a + r.amount, 0);
    const key = {
      month: (r) => r.date.slice(0, 7),
      person: (r) => r.person || "(self)",
      card: (r) => r.card || "(none)",
      category: (r) => r.category || r.type || "(none)",
      status: (r) => r.status || "(none)",
    }[pl.group];
    let groups = null;
    if (key) {
      const m = {};
      rows.forEach((r) => {
        const k = key(r);
        m[k] = m[k] || { k, sum: 0, n: 0 };
        m[k].sum += r.amount;
        m[k].n++;
      });
      groups = Object.values(m).sort((a, b) =>
        pl.group === "month" ? (a.k < b.k ? -1 : 1) : b.sum - a.sum,
      );
    }
    return { rows, total, groups, n: rows.length };
  }
  function showAnswer(q, pl, res) {
    const agg = pl.agg || "sum";
    const chips = [
      pl.person && "👤 " + pl.person,
      pl.card && "💳 " + pl.card,
      pl.category && "🏷 " + pl.category,
      pl.text && "🔎 " + pl.text,
      pl.status && pl.status,
      pl.type && pl.type,
      (pl.from || pl.to) && (pl.from || "…") + " → " + (pl.to || "…"),
      (pl.sources || []).join("+"),
    ].filter(Boolean);
    let big = "";
    if (agg === "count") big = res.n + " transactions";
    else if (agg === "avg") big = res.n ? inr(res.total / res.n) + " avg" : "—";
    else if (agg === "max" || agg === "min") {
      const t = [...res.rows]
        .sort((a, b) =>
          agg === "max" ? b.amount - a.amount : a.amount - b.amount,
        )
        .slice(0, pl.top || 5);
      res = { ...res, rows: t };
      big = t.length ? inr(t[0].amount) : "—";
    } else if (agg === "list") big = res.n + " transactions";
    else big = inr(res.total);
    const sub = agg === "sum" ? res.n + " transactions" : "";
    const g = res.groups
      ? `<table style="width:100%;margin-top:10px;font-size:.88rem">${res.groups
          .slice(0, pl.top || 30)
          .map(
            (x) =>
              `<tr><td style="padding:3px 0;position:relative"><div style="position:absolute;inset:3px auto 3px 0;width:${Math.round((Math.abs(x.sum) / (Math.max(...res.groups.map((y) => Math.abs(y.sum))) || 1)) * 100)}%;background:#22d3ee22;border-radius:4px"></div><span style="position:relative">${esc(x.k)}</span></td><td style="text-align:right;opacity:.6">${x.n}</td><td style="text-align:right;font-weight:700">${inr(x.sum)}</td></tr>`,
          )
          .join("")}</table>`
      : "";
    const list = res.rows
      .slice(0, 60)
      .map(
        (r) =>
          `<div class="qaR" style="display:flex;justify-content:space-between;gap:12px;padding:11px 10px;border-top:1px solid #ffffff12;font-size:.86rem;border-radius:10px"><span><b>${esc(r.date.slice(5))}</b> ${esc([r.person, r.card || r.category || r.type, r.desc].filter(Boolean).join(" · "))}${r.remarks ? ` <i style="opacity:.6">(${esc(r.remarks)})</i>` : ""}</span><b style="color:#22d3ee;white-space:nowrap">${inr(r.amount)}</b></div>`,
      )
      .join("");
    qa.innerHTML = `<div style="width:min(560px,100%);max-height:90vh;overflow:auto;background:linear-gradient(160deg,#1a1a2c,#0d0d17);color:var(--text,#eef);border:1px solid #22d3ee44;position:relative;border-radius:22px;padding:22px;box-shadow:0 24px 70px #000c,0 0 0 1px #ffffff0a inset,0 0 50px #22d3ee22,0 0 90px #8b5cf622;backdrop-filter:blur(12px)"><div style="position:absolute;top:10px;right:10px;display:flex;gap:6px"><button type="button" class="qaB" data-a="again" title="Ask again"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button><button type="button" class="qaB" data-a="copy" title="Copy"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg></button><button type="button" class="qaB qaX" data-a="close" title="Close"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div style="padding-right:76px;opacity:.7;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase">✨ ${esc(pl.title || q)}</div><div style="font-size:2.6rem;font-weight:800;letter-spacing:-.02em;filter:drop-shadow(0 0 14px #22d3ee66);margin:8px 0 2px;background:linear-gradient(90deg,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent">${esc(res.n || agg === "count" ? big : "Kuch nahi mila")}</div><div style="opacity:.6;font-size:.8rem">${sub}</div><div style="margin-top:8px;font-size:.72rem;opacity:.6">${chips.map((c) => `<span style="border:1px solid var(--border,#2a2a3d);border-radius:20px;padding:2px 8px;margin:0 4px 4px 0;display:inline-block">${esc(c)}</span>`).join("")}</div>${g}<div style="margin-top:10px">${list}</div></div>`;
    qa.style.display = "flex";
    const doCopy = () => {
      const inrR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
      const line = (r) =>
        r.date.slice(5) +
        " " +
        [r.person, r.card || r.category || r.type, r.desc]
          .filter(Boolean)
          .join(" · ") +
        (r.remarks ? " (" + r.remarks + ")" : "") +
        " " +
        inrR(r.amount);
      const body = res.groups
        ? res.groups
            .map((x) => x.k + " (" + x.n + ") " + inrR(x.sum))
            .join("\n")
        : res.rows.map(line).join("\n");
      const txt =
        (pl.title || q) + "\n" + big + (sub ? " · " + sub : "") + "\n\n" + body;
      const fb = () => {
        const t = document.createElement("textarea");
        t.value = txt;
        t.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(t);
        t.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch (_) {}
        t.remove();
        toast(ok ? "Copied" : "Copy failed", !ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(txt).then(() => toast("Copied"), fb);
      else fb();
    };
    window.__qaCopy = doCopy;
    window.__qaAgain = () => {
      qa.style.display = "none";
      box.style.display = "flex";
      $("aiTxt").focus();
    };
    if (window.__qaH) document.removeEventListener("click", window.__qaH, true);
    window.__qaH = (e) => {
      if (qa.style.display === "none") return;
      const a = e.target.closest && e.target.closest("[data-a]");
      if (e.target === qa || (a && qa.contains(a))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const k = a && a.dataset.a;
        if (!k || k === "close") qa.style.display = "none";
        else if (k === "copy") doCopy();
        else if (k === "again") window.__qaAgain();
      }
    };
    document.addEventListener("click", window.__qaH, true);
  }
  async function askData(text) {
    const b = $("aiGo");
    b.disabled = true;
    b.innerHTML = '<span class="spin"></span>Thinking…';
    try {
      const people = [
        ...new Set(
          [
            ...document.querySelectorAll(
              "#cardSection table tbody tr td:nth-child(3)",
            ),
          ]
            .map((td) => td.textContent.trim())
            .filter(Boolean)
            .concat(["GRV", "Sweetie", "Tanya"]),
        ),
      ].join(" | ");
      const cards = cardConfig.map((c) => c.card).join(" | ");
      const cats = [...($("expenseCategory")?.options || [])]
        .map((o) => o.value)
        .join(" | ");
      const dp = loadData();
      const raw = await (
        await fetch(
          apiUrl(
            `action=aiAsk&q=${encodeURIComponent(text)}&people=${encodeURIComponent(people)}&cards=${encodeURIComponent(cards)}&cats=${encodeURIComponent(cats)}`,
          ),
        )
      ).text();
      let pl;
      try {
        pl = JSON.parse(raw);
      } catch (_) {
        throw new Error("Server said: " + raw.slice(0, 160));
      }
      if (pl.error) throw new Error(pl.error);
      const filt = [
        "person",
        "card",
        "category",
        "text",
        "status",
        "type",
        "from",
        "to",
      ].some((k) => pl[k]);
      if (
        !filt &&
        (!pl.group || pl.group === "none") &&
        (pl.sources || []).length !== 1
      )
        throw new Error(
          "Ask about your spending, e.g. “Tanya ka unpaid card total”",
        );
      const all = await dp;
      close();
      showAnswer(text, pl, runPlan(pl, all));
    } catch (e) {
      toast("AI ask failed: " + e.message, true);
    } finally {
      b.disabled = false;
      b.textContent = "Parse";
    }
  }
  $("aiGo").onclick = async () => {
    const text = $("aiTxt").value.trim();
    if (!text) return;
    if (isQuestion(text)) return askData(text);
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
