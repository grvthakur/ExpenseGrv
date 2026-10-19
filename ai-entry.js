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
    <p style="opacity:.7;font-size:.85rem;margin:6px 0 10px">Paste a bank message to add a transaction, or ask a question about your spending.</p>
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
  const aiError = document.createElement("div");
  aiError.id = "aiEntryError";
  aiError.setAttribute("role", "alert");
  aiError.setAttribute("aria-live", "polite");
  aiError.style.cssText =
    "display:none;margin:10px 0 0;padding:11px 13px;border:1px solid #fb718566;border-left:3px solid #fb7185;border-radius:12px;background:linear-gradient(135deg,#fb718514,#f43f5e0a);color:#fecdd3;font-size:.88rem;line-height:1.45;overflow-wrap:anywhere;box-shadow:0 6px 20px #0002";
  let aiText = $("aiTxt");
  {
    // fresh node: iOS caches AutoFill heuristics per element, so rebuild with attrs set before insert
    const f = aiText.cloneNode(false);
    f.removeAttribute("name");
    f.removeAttribute("inputmode");
    f.removeAttribute("type");
    f.setAttribute("autocomplete", "off");
    f.setAttribute("data-form-type", "other");
    f.setAttribute("data-lpignore", "true");
    aiText.replaceWith(f);
    aiText = f;
  }
  aiText.setAttribute("autocomplete", "off");
  aiText.setAttribute("autocorrect", "on");
  aiText.setAttribute("autocapitalize", "sentences");
  aiText.setAttribute("spellcheck", "true");
  aiText.setAttribute("enterkeyhint", "enter");
  aiText.setAttribute("placeholder", "Type a question or paste a bank SMS…");
  aiText.style.cssText +=
    ";font:inherit;line-height:1.5;resize:vertical;min-height:110px;max-height:38vh;outline:none;transition:border-color .18s,box-shadow .18s";
  aiText.insertAdjacentElement("afterend", aiError);

  const clearAiError = () => {
    aiError.style.display = "none";
    aiError.textContent = "";
  };
  const showAiError = (kind, error) => {
    const raw = String(error && error.message ? error.message : error || "")
      .replace(/^Server said:\s*/i, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let message;
    if (/Ask about your spending/i.test(raw)) {
      message =
        "Try a more specific question, for example: “Tanya ka unpaid card total”.";
    } else if (/ppConfig|<script|window\[|<!doctype|<html/i.test(raw)) {
      message =
        "Google returned an error page instead of data. Redeploy the Apps Script (New version), then retry.";
    } else if (!raw || raw.length > 180) {
      message =
        "We couldn’t process that request. Check your connection and try again.";
    } else {
      message = raw;
    }
    aiError.textContent = kind + ": " + message;
    aiError.style.display = "block";
    aiError.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const resetAiEntry = () => {
    aiText.value = "";
    clearAiError();
    const go = $("aiGo");
    if (go) {
      go.disabled = false;
      go.textContent = "Parse";
    }
  };
  const close = () => {
    box.style.display = "none";
    resetAiEntry();
  };
  aiText.addEventListener("input", clearAiError);
  aiText.addEventListener("focus", () => {
    aiText.style.borderColor = "#22d3eeaa";
    aiText.style.boxShadow = "0 0 0 3px #22d3ee18";
  });
  aiText.addEventListener("blur", () => {
    aiText.style.borderColor = "var(--border,#2a2a3d)";
    aiText.style.boxShadow = "none";
  });
  const warm = () => fetch(apiUrl("action=ver")).catch(() => {});
  setTimeout(warm, 2500);
  // iOS decides "AutoFill Contact" per element at creation: rebuild the box fresh on every open (same way the chat box is built, which gets plain word suggestions).
  const remount = () => {
    const old = aiText;
    const w = document.createElement("div");
    w.innerHTML =
      '<textarea id="aiTxt" rows="5" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="Type a question or paste a bank SMS…"></textarea>';
    const f = w.firstChild;
    f.style.cssText = old.style.cssText;
    f.value = old.value;
    old.replaceWith(f);
    aiText = f;
    f.addEventListener("input", clearAiError);
    f.addEventListener("focus", () => {
      f.style.borderColor = "#22d3eeaa";
      f.style.boxShadow = "0 0 0 3px #22d3ee18";
    });
    f.addEventListener("blur", () => {
      f.style.borderColor = "var(--border,#2a2a3d)";
      f.style.boxShadow = "none";
    });
    f.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !(window.matchMedia && matchMedia("(pointer:coarse)").matches)
      ) {
        e.preventDefault();
        $("aiGo").click();
      }
    });
  };
  fab.onclick = () => {
    if (chatHist && chatHist.length && typeof openChat === "function")
      return openChat();
    resetAiEntry();
    remount();
    box.style.display = "flex";
    setTimeout(() => aiText.focus(), 40);
    warm();
  };
  $("aiX").onclick = close;
  $("aiTxt").addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !(window.matchMedia && matchMedia("(pointer:coarse)").matches)
    ) {
      e.preventDefault();
      $("aiGo").click();
    }
  });
  fab.style.cssText +=
    ";background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;border:1px solid #67e8f9;font-weight:800;box-shadow:0 0 12px #22d3eecc,0 0 28px #8b5cf688;text-shadow:0 0 8px #fff8;animation:aiGlow 2s ease-in-out infinite alternate";
  const gs = document.createElement("style");
  gs.textContent =
    "#qaAnswerOverlay .qaB{width:38px;height:38px;min-width:38px;min-height:38px;flex:0 0 38px;position:relative;z-index:2;border-radius:12px;border:1px solid #ffffff35;background:#ffffff10;color:#e2e8f0;cursor:pointer;pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:0;opacity:1;transition:background .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease,transform .16s ease}#qaAnswerOverlay .qaB svg{pointer-events:none;display:block}#qaAnswerOverlay .qaB:hover,#qaAnswerOverlay .qaB:focus-visible{background:#22d3ee30!important;border-color:#22d3ee!important;color:#67e8f9!important;box-shadow:0 0 0 1px #22d3ee33,0 0 18px #22d3ee88!important;transform:translateY(-1px)}#qaAnswerOverlay .qaB:active{transform:scale(.94)}#qaAnswerOverlay .qaX:hover,#qaAnswerOverlay .qaX:focus-visible{background:#f43f5e30!important;border-color:#f43f5e!important;color:#fda4af!important;box-shadow:0 0 0 1px #f43f5e33,0 0 18px #f43f5e99!important}.qaR{transition:.15s}.qaR:hover{background:#22d3ee14;padding-left:14px!important}" +
    "@keyframes aiGlow{from{box-shadow:0 0 8px #22d3ee88,0 0 18px #8b5cf655}to{box-shadow:0 0 18px #22d3eeff,0 0 40px #8b5cf6aa}}";
  gs.textContent +=
    "#pvN,#pvX,#pvC,#pvOk,#aiX,#aiGo{transition:background .16s,border-color .16s,color .16s,box-shadow .16s,transform .16s,filter .16s}#pvN:hover,#pvX:hover,#aiX:hover,#pvN:focus-visible,#pvX:focus-visible{background:#22d3ee30!important;border-color:#22d3ee!important;color:#67e8f9!important;opacity:1!important;box-shadow:0 0 0 1px #22d3ee33,0 0 18px #22d3ee88!important;transform:translateY(-1px)}#pvC:hover,#pvC:focus-visible{background:#f43f5e30!important;border-color:#f43f5e!important;color:#fda4af!important;box-shadow:0 0 0 1px #f43f5e33,0 0 18px #f43f5e99!important;transform:translateY(-1px)}#pvOk:hover,#aiGo:hover{filter:brightness(1.1);box-shadow:0 0 22px #22d3ee99;transform:translateY(-1px)}#pvN:active,#pvX:active,#pvC:active,#aiX:active,#pvOk:active,#aiGo:active{transform:scale(.95)}";
  gs.textContent +=
    "#chGo{transition:filter .16s,box-shadow .16s,transform .16s}#chGo:hover{filter:brightness(1.1);box-shadow:0 0 22px #22d3ee99;transform:translateY(-1px)}#chGo:active{transform:scale(.95)}#chIn:focus{border-color:#22d3eeaa!important;box-shadow:0 0 0 3px #22d3ee18}#qaAnswerOverlay [data-c=copy]{transition:.16s}#qaAnswerOverlay [data-c=copy]:hover{background:#22d3ee30!important;border-color:#22d3ee!important;color:#67e8f9!important;box-shadow:0 0 14px #22d3ee66}";
  document.head.append(gs);
  box.addEventListener("click", (e) => {
    if (e.target === box) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && box.style.display !== "none") close();
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
          ? `<select data-k="${k}" style="${st}">${[...$(id).options].some((o) => o.value === r[k]) ? "" : '<option value="" selected style="color:#000">— Select —</option>'}${[...$(id).options].map((o) => `<option value="${o.value}" ${o.value === r[k] ? "selected" : ""} style="color:#000">${o.text}</option>`).join("")}</select>`
          : `<input data-k="${k}" type="${k === "date" ? "date" : k === "amount" ? "number" : "text"}" value="${v}" style="${st}">`;
        return `<label style="display:block;font-size:.78rem;opacity:.8;margin-top:10px">${label}${inp}</label>`;
      })
      .join("");
    pv.innerHTML = `<div style="width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--surface,#13131c);color:var(--text,#eef);border:1px solid var(--border,#2a2a3d);position:relative;border-radius:18px;padding:18px;border-top:3px solid #22d3ee;box-shadow:0 20px 60px #000a,0 0 40px #22d3ee22"><div style="position:absolute;top:10px;right:10px;display:flex;gap:6px"><button id="pvN" title="New (clear)" style="width:36px;height:36px;border-radius:50%;border:1px solid #22d3ee99;background:#22d3ee1f;color:#67e8f9;cursor:pointer;font-size:1.05rem;line-height:1;position:relative;z-index:5;pointer-events:auto">✎</button><button id="pvX" title="Back (keep prompt)" style="width:36px;height:36px;border-radius:50%;border:1px solid #22d3ee99;background:#22d3ee1f;color:#67e8f9;cursor:pointer;font-size:1.05rem;line-height:1;position:relative;z-index:5;pointer-events:auto">↩</button><button id="pvC" title="Close" style="width:36px;height:36px;border-radius:50%;border:1px solid #22d3ee99;background:#22d3ee1f;color:#67e8f9;cursor:pointer;font-size:1.05rem;line-height:1;position:relative;z-index:5;pointer-events:auto">✕</button></div><b style="font-size:1.1rem">✨ Review ${kind} entry</b>${rows}<div style="margin-top:16px"><button id="pvOk" style="width:100%;padding:10px 20px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10;cursor:pointer">OK — Save</button></div></div>`;
    pv.style.display = "flex";
    $("pvC").onclick = () => {
      pv.style.display = "none";
      box.style.display = "none";
    };
    $("pvN").onclick = () => {
      pv.style.display = "none";
      resetAiEntry();
      box.style.display = "flex";
      $("aiTxt").focus();
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
      for (const e of pv.querySelectorAll("select[data-k]"))
        if (!e.value)
          return toast(
            "Please select " +
              (e.dataset.k === "card" ? "a card" : e.dataset.k),
            true,
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
  // Explicit labels ("Used by: X", "Desc: Y", "Remarks: Z") always win over any guessing.
  function labelHint(text) {
    const lines = String(text)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const LB =
      /^(used\s*by|usedby|user|person|by|desc(?:ription)?|merchant|remarks?|note|notes)\s*[:\-=]\s*(.+)$/i;
    const lab = { who: "", desc: "", rem: "" };
    const rest = [];
    lines.forEach((l) => {
      const m = l.match(LB);
      if (!m) return rest.push(l);
      const k = m[1].toLowerCase().replace(/\s+/g, "");
      const v = m[2].trim();
      if (/^(usedby|user|person|by)$/.test(k))
        lab.who = v
          .split(/\s+/)
          .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      else if (/^(desc|description|merchant)/.test(k))
        lab.desc = v.toUpperCase();
      else lab.rem = v.toUpperCase();
    });
    if (rest.length === lines.length || !rest.length) return null;
    return {
      body: rest.join("\n"),
      who: lab.who,
      desc: lab.desc,
      rem: lab.rem,
    };
  }
  function splitHint(text) {
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    {
      const L = labelHint(text);
      if (L) return L;
    }
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
    (w.length > 1 &&
      skel(w).length >= 2 &&
      (skel(w) === skel(t) ||
        (w.length > 3 &&
          skel(w).length > 3 &&
          skel(w) === skel(t).slice(0, skel(w).length))));
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
  qa.id = "qaAnswerOverlay";
  qa.dataset.ov = 1;
  document.body.append(qa);

  qa.addEventListener("click", (e) => {
    const button = e.target.closest("[data-a]");
    if (button && qa.contains(button)) {
      e.preventDefault();
      e.stopPropagation();
      const action = button.dataset.a;
      if (action === "close") {
        qa.style.display = "none";
      } else if (action === "copy") {
        if (typeof window.__qaCopy === "function") window.__qaCopy();
      } else if (action === "again") {
        if (typeof window.__qaAgain === "function") window.__qaAgain();
      } else if (action === "new") {
        if (typeof window.__qaNew === "function") window.__qaNew();
      }
      return;
    }
    if (e.target === qa) qa.style.display = "none";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qa.style.display !== "none") {
      qa.style.display = "none";
    }
  });
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
      /\b(this month|last month|is mahine|pichle mahine)\b/i.test(t) ||
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
  function extraRows(e, c, sal, cm) {
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
      const k = String(x.card).toLowerCase().trim();
      const mr = (Array.isArray(cm) ? cm : []).find(
        (m) =>
          (String(m[0]).trim() + "-" + String(m[1]).trim()).toLowerCase() ===
            k || String(m[1]).trim().toLowerCase() === k,
      );
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
          (x.cutoff || "-") +
          (mr
            ? " | Bank " +
              mr[0] +
              " | Number " +
              mr[2] +
              " | Number/CVV " +
              mr[3] +
              " | Expiry " +
              mr[4]
            : ""),
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
      jget("action=getCCMaster").catch(() => []),
    ]).then(([e, c, w, sal, cm]) => [
      ...extraRows(e, c, sal, cm),
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
          (r.src !== "cards" &&
            SELF.includes(per) &&
            ["expenses", "sweetie", "salary", "summary"].includes(r.src)) ||
          (r.src === "cards" &&
            pset.some(
              (p) =>
                lc(r.person) === p ||
                lc(r.person)
                  .split(/[^a-z0-9]+/)
                  .includes(p),
            )),
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
    if (pl._m)
      rows = rows.filter((r) => pl._m.has(lc(r.desc || r.remarks || "")));
    else if (words.length)
      rows = rows.filter((r) => {
        const h = lc(
          [r.desc, r.remarks, r.card, r.category, r.person].join(" "),
        );
        return words.some((w) => h.includes(w));
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
  // ── AI chat: multi-turn, follow-ups understood, answers computed exactly from your data ──
  const touch = !!(window.matchMedia && matchMedia("(pointer:coarse)").matches);
  const focusIn = () => {
    if (!touch) {
      const e = $("chIn");
      if (e) e.focus();
    }
  };
  let chatHist = [];
  const chatTxt = [];
  // Keep the actual rows shown in the latest answer for deterministic follow-ups.
  let lastResultContext = null;
  const compact = (pl) => {
    const o = {};
    [
      "sources",
      "person",
      "card",
      "category",
      "text",
      "status",
      "type",
      "from",
      "to",
      "agg",
      "group",
    ].forEach((k) => {
      const v = pl[k];
      if (v && (!Array.isArray(v) || v.length) && v !== "none") o[k] = v;
    });
    return o;
  };
  function answerHtml(q, pl, res) {
    const agg = pl.agg || "sum";
    const chips = [
      pl.person && "👤 " + pl.person,
      pl.card && "💳 " + pl.card,
      pl.category && "🏷 " + pl.category,
      pl.text && "🔎 " + pl.text,
      pl.status,
      pl.type,
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
    if ((pl.sources || []).length === 1 && pl.sources[0] === "config" && res.n)
      big = res.n === 1 ? res.rows[0].card : res.n + " cards";
    const sub = agg === "sum" ? res.n + " transactions" : "";
    const mx = res.groups
      ? Math.max(...res.groups.map((y) => Math.abs(y.sum))) || 1
      : 1;
    const g = res.groups
      ? `<table style="width:100%;margin-top:8px;font-size:.86rem">${res.groups
          .slice(0, pl.top || 30)
          .map(
            (x) =>
              `<tr><td style="padding:3px 0;position:relative"><div style="position:absolute;inset:3px auto 3px 0;width:${Math.round((Math.abs(x.sum) / mx) * 100)}%;background:#22d3ee22;border-radius:4px"></div><span style="position:relative">${esc(x.k)}</span></td><td style="text-align:right;opacity:.6">${x.n}</td><td style="text-align:right;font-weight:700">${inr(x.sum)}</td></tr>`,
          )
          .join("")}</table>`
      : "";
    const LIM = 12;
    const row = (r) =>
      r.src === "config"
        ? `<div class="qaR" style="padding:9px 6px;border-top:1px solid #ffffff12;border-radius:8px"><b style="color:#22d3ee">${esc(r.card)}</b>${r.desc
            .split(" | ")
            .map((p) => {
              const i = p.indexOf(" ");
              return `<div style="display:flex;justify-content:space-between;gap:12px;font-size:.82rem;padding:2px 0"><span style="opacity:.6">${esc(p.slice(0, i))}</span><span style="font-family:monospace;overflow-wrap:anywhere;text-align:right">${esc(p.slice(i + 1))}</span></div>`;
            })
            .join(
              "",
            )}<div style="display:flex;justify-content:space-between;font-size:.82rem;padding:2px 0"><span style="opacity:.6">Remaining limit</span><b>${inr(r.amount)}</b></div></div>`
        : `<div class="qaR" style="display:flex;justify-content:space-between;gap:12px;padding:8px 6px;border-top:1px solid #ffffff12;font-size:.83rem;border-radius:8px"><span><b>${esc(r.date.slice(5))}</b> ${esc([r.person, r.card || r.category || r.type, r.desc].filter(Boolean).join(" · "))}${r.remarks ? ` <i style="opacity:.6">(${esc(r.remarks)})</i>` : ""}</span><b style="color:#22d3ee;white-space:nowrap">${inr(r.amount)}</b></div>`;
    const showRows = res.groups ? [] : res.rows;
    const list =
      showRows.slice(0, LIM).map(row).join("") +
      (showRows.length > LIM
        ? `<div style="opacity:.6;font-size:.78rem;padding-top:6px">+${showRows.length - LIM} more — use Copy for the full list</div>`
        : "");
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
    const txt =
      (pl.title || q) +
      "\n" +
      big +
      (sub ? " · " + sub : "") +
      "\n\n" +
      (res.groups
        ? res.groups
            .map((x) => x.k + " (" + x.n + ") " + inrR(x.sum))
            .join("\n")
        : res.rows.map(line).join("\n"));
    const empty = !(res.n || agg === "count");
    const html = `<div style="font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;opacity:.65">✨ ${esc(pl.title || q)}</div><div style="font-size:${empty ? "1.1rem" : "1.9rem"};font-weight:800;margin:4px 0 0;background:linear-gradient(90deg,#22d3ee,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent">${esc(empty ? "Kuch nahi mila" : big)}</div><div style="opacity:.6;font-size:.78rem">${sub}</div><div style="margin-top:6px;font-size:.7rem;opacity:.6">${chips.map((c) => `<span style="border:1px solid #ffffff22;border-radius:20px;padding:1px 7px;margin:0 4px 4px 0;display:inline-block">${esc(c)}</span>`).join("")}</div>${g}<div>${list}</div>`;
    return { html, txt, resultRows: showRows.slice(0, 100) };
  }
  function chatShell() {
    if (qa.dataset.chat) return;
    qa.dataset.chat = 1;
    const bs =
      "width:34px;height:34px;min-width:34px;border-radius:10px;border:1px solid #ffffff35;background:#ffffff10;color:#e2e8f0;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;padding:0";
    qa.innerHTML = `<div style="width:min(640px,100%);height:min(88vh,800px);display:flex;flex-direction:column;background:linear-gradient(160deg,#1a1a2c,#0d0d17);color:var(--text,#eef);border:1px solid #22d3ee44;border-radius:22px;box-shadow:0 24px 70px #000c,0 0 50px #22d3ee22;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #ffffff14"><b>✨ AI Assistant</b><span style="display:flex;gap:8px"><button type="button" class="qaB" data-c="clear" title="New chat" style="${bs}">✎</button><button type="button" class="qaB qaX" data-c="close" title="Close" style="${bs}">✕</button></span></div><div id="chThread" style="flex:1;overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:12px"></div><div style="padding:12px 14px;border-top:1px solid #ffffff14;display:flex;gap:8px;align-items:flex-end"><textarea id="chIn" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="Ask anything…" style="flex:1;resize:none;max-height:120px;border-radius:12px;padding:10px;background:transparent;color:inherit;border:1px solid #ffffff30;font:inherit;outline:none"></textarea><button id="chGo" type="button" style="padding:10px 18px;border-radius:12px;border:0;font-weight:700;background:#22d3ee;color:#0b0b10;cursor:pointer">Send</button></div></div>`;
    qa.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "close") qa.style.display = "none";
      else if (c === "clear") {
        chatHist = [];
        chatTxt.length = 0;
        lastResultContext = null;
        $("chThread").innerHTML = "";
        focusIn();
      } else if (c === "copy") {
        const t = chatTxt[+b.dataset.i] || "";
        (navigator.clipboard
          ? navigator.clipboard.writeText(t)
          : Promise.reject()
        ).then(
          () => (b.textContent = "✓ Copied"),
          () => {
            const a = document.createElement("textarea");
            a.value = t;
            document.body.appendChild(a);
            a.select();
            try {
              document.execCommand("copy");
              b.textContent = "✓ Copied";
            } catch (_) {}
            a.remove();
          },
        );
      }
    });
    $("chGo").onclick = chatSend;
    $("chIn").addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !(window.matchMedia && matchMedia("(pointer:coarse)").matches)
      ) {
        e.preventDefault();
        chatSend();
      }
    });
  }
  const bub = (html, me) => {
    const th = $("chThread"),
      d = document.createElement("div");
    d.style.cssText = me
      ? "align-self:flex-end;max-width:85%;background:#22d3ee22;border:1px solid #22d3ee55;border-radius:16px 16px 4px 16px;padding:9px 13px;font-size:.9rem;overflow-wrap:anywhere"
      : "align-self:stretch;background:#ffffff0a;border:1px solid #ffffff14;border-radius:16px 16px 16px 4px;padding:12px 14px;font-size:.9rem;overflow-wrap:anywhere";
    d.innerHTML = html;
    th.append(d);
    th.scrollTop = th.scrollHeight;
    return d;
  };
  function openChat() {
    chatShell();
    qa.style.display = "flex";
    setTimeout(focusIn, 50);
  }
  function answerFromPrevious(text) {
    const ctx = lastResultContext;
    if (!ctx || !ctx.rows || !ctx.rows.length) return false;
    const q = text.toLowerCase().trim();
    const refersBack =
      /\b(above|previous|preceding|same list|from that|from these|from those|in that list|from the list|upar|pichhle|pichli|usme se|isme se|inme se|unme se)\b/i.test(
        q,
      ) ||
      /^(and\s+|aur\s+)?(lowest|highest|minimum|maximum|smallest|largest|cheapest|most expensive|top\s+\d+|bottom\s+\d+|total|sum|average|avg|count|how many)(\s+please)?[?.!]*$/i.test(
        q,
      );
    const aggMatch =
      /\b(lowest|minimum|smallest|cheapest|least amount|sabse kam|sabse chhota|kam se kam)\b/i.test(
        q,
      )
        ? "min"
        : /\b(highest|maximum|largest|most expensive|sabse zyada|sabse bada|highest amount)\b/i.test(
              q,
            )
          ? "max"
          : /\b(average|avg|mean|ausat)\b/i.test(q)
            ? "avg"
            : /\b(how many|count|number of|kitne|kitni|kitna transaction)\b/i.test(
                  q,
                )
              ? "count"
              : /\b(total|sum|combined|in total|kul|jod)\b/i.test(q)
                ? "sum"
                : /\b(list|show all|dikhao|details)\b/i.test(q)
                  ? "list"
                  : "";
    if (!refersBack || !aggMatch) return false;

    const stop =
      /\b(above|previous|preceding|same|list|from|the|that|these|those|in|on|of|and|aur|please|lowest|minimum|smallest|cheapest|least|amount|highest|maximum|largest|expensive|total|sum|combined|average|avg|mean|count|how|many|transactions?|transaction|upar|pichhle|pichli|usme|isme|se|inme|unme|sabse|kam|zyada|bada|chhota|kul|jod|kitne|kitni|kitna|dikhao|show|all)\b/gi;
    const extra = q
      .replace(stop, " ")
      .replace(/[^a-z0-9₹]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    let rows = ctx.rows.slice();
    if (extra.length) {
      rows = rows.filter((r) => {
        const hay = [
          r.date,
          r.person,
          r.card,
          r.category,
          r.type,
          r.desc,
          r.remarks,
          r.status,
        ]
          .join(" ")
          .toLowerCase();
        return extra.every((w) => hay.includes(w));
      });
    }
    if (!rows.length) {
      bub(
        "I couldn’t find matching items in the previous list. Try a new question with a card, month, or merchant.",
      );
      chatHist.push({ q: text, a: "No matches in previous list" });
      return true;
    }

    const sorted = rows.slice().sort((a, b) => a.amount - b.amount);
    const pl = {
      ...(ctx.plan || {}),
      title: text,
      agg: aggMatch,
      top: /^(and\s+|aur\s+)?(top|bottom)\s+\d+/i.test(q)
        ? Math.min(12, +(q.match(/\d+/) || [5])[0])
        : 5,
    };
    if (aggMatch === "max") sorted.reverse();
    const resultRows =
      aggMatch === "min" || aggMatch === "max" ? sorted.slice(0, pl.top) : rows;
    const result = {
      rows: resultRows,
      total: rows.reduce((sum, r) => sum + (+r.amount || 0), 0),
      n: rows.length,
      groups: null,
    };
    const view = answerHtml(text, pl, result);
    chatTxt.push(view.txt);
    const idx = chatTxt.length - 1;
    bub(
      view.html +
        `<div style="margin-top:8px;text-align:right"><button type="button" data-c="copy" data-i="${idx}" style="border:1px solid #ffffff30;background:transparent;color:inherit;border-radius:8px;padding:3px 10px;font-size:.72rem;cursor:pointer">⧉ Copy</button></div>`,
    );
    lastResultContext = { plan: compact(pl), rows: view.resultRows, q: text };
    chatHist.push({
      q: text,
      p: compact(pl),
      r: view.resultRows
        .slice(0, 5)
        .map(
          (r) =>
            `${r.date} ${[r.person, r.card || r.category || r.type, r.desc].filter(Boolean).join(" ")} Rs${Math.round(r.amount)}`,
        ),
    });
    return true;
  }

  function chatSend() {
    const inp = $("chIn"),
      text = inp.value.trim();
    if (!text) return;
    if (answerFromPrevious(text)) {
      inp.value = "";
      return;
    }
    if (!isQuestion(text) || localParse(text)) {
      qa.style.display = "none";
      aiText.value = text;
      inp.value = "";
      $("aiGo").click();
      return;
    }
    inp.value = "";
    chatAsk(text);
  }
  function tryTab(t) {
    if (
      !/\b(open|kholo|khol|kro|karo|dikha|dikhao|show|go to|switch|chalo)\b/i.test(
        t,
      ) ||
      t.length > 40 ||
      /\d/.test(t)
    )
      return null;
    if (/\bgrv\b/i.test(t)) return "grvcc";
    if (/sweetie/i.test(t)) return "sweetie";
    if (/credit|card/i.test(t)) return "cards";
    if (/expense|kharcha/i.test(t)) return "expenses";
    return null;
  }
  async function chatAsk(text) {
    const tb = tryTab(text);
    if (tb) {
      qa.style.display = "none";
      switchTab(tb);
      return;
    }
    bub(esc(text), true);
    const wait = bub('<span class="spin"></span>Thinking…');
    const go = $("chGo");
    go.disabled = true;
    try {
      // Universal engine (ai.gs): AI writes a program, server computes exactly. Falls back to the classic flow if unavailable.
      try {
        const hs = JSON.stringify(
          chatHist
            .filter((h) => h.code)
            .slice(-2)
            .map((h) => ({ q: h.q, a: h.a, code: h.code })),
        );
        const rawQ = await (
          await fetch(
            apiUrl(
              `action=aiQuery&q=${encodeURIComponent(text)}&hist=${encodeURIComponent(hs.slice(0, 2200))}`,
            ),
          )
        ).text();
        const j = JSON.parse(rawQ);
        if (j && !j.error && (j.text || j.reply)) {
          const money = (n) =>
            "₹" +
            Math.round(n || 0)
              .toString()
              .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          let html;
          let plain;
          if (!j.code) {
            html = esc(j.reply);
            plain = j.reply;
          } else {
            const g = (j.groups || [])
              .map(
                (x) =>
                  `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid #ffffff10"><span>${esc(x.k)}${x.n ? ` <small style="opacity:.55">×${x.n}</small>` : ""}</span><b>${money(x.v)}</b></div>`,
              )
              .join("");
            const rr = (j.rows || [])
              .slice(0, 15)
              .map(
                (r) =>
                  `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:.78rem;opacity:.85"><span>${esc(r.date || "")} · ${esc([r.person, r.card || r.cat, r.desc].filter(Boolean).join(" · ")).slice(0, 70)}</span><b>${money(r.amount)}</b></div>`,
              )
              .join("");
            html =
              `<div style="font-size:.72rem;opacity:.6;text-transform:uppercase;letter-spacing:.04em">✨ ${esc(j.title || text)}</div>` +
              (j.value != null
                ? `<div style="font-size:1.5rem;font-weight:800;color:#67e8f9;margin:4px 0">${money(j.value)}</div>`
                : "") +
              `<div style="margin:4px 0 8px">${esc(j.text)}</div>` +
              (g ? `<div style="margin:6px 0">${g}</div>` : "") +
              (rr
                ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:.78rem;opacity:.7">Transactions (${(j.rows || []).length})</summary>${rr}</details>`
                : "");
            plain =
              j.text +
              (j.groups || []).map((x) => `\n${x.k}: ${money(x.v)}`).join("");
          }
          chatTxt.push(plain);
          wait.innerHTML =
            html +
            `<div style="margin-top:8px;text-align:right"><button type="button" data-c="copy" data-i="${chatTxt.length - 1}" style="border:1px solid #ffffff30;background:transparent;color:inherit;border-radius:8px;padding:3px 10px;font-size:.72rem;cursor:pointer">⧉ Copy</button></div>`;
          chatHist.push({
            q: text,
            a: String(j.text || j.reply).slice(0, 150),
            code: j.code ? String(j.code).slice(0, 600) : "",
          });
          if (!j.code) chatHist[chatHist.length - 1].code = "";
          return;
        }
      } catch (_) {}
      const people = [
        ...new Set(
          [
            ...document.querySelectorAll(
              "#cardSection table tbody tr td:nth-child(3)",
            ),
          ]
            .map((td) => td.textContent.trim())
            .filter((n) => n && n.length <= 20)
            .concat(["GRV", "Sweetie", "Tanya"]),
        ),
      ].join(" | ");
      const cards = cardConfig.map((c) => c.card).join(" | ");
      const cats = [...($("expenseCategory")?.options || [])]
        .map((o) => o.value)
        .join(" | ");
      const hist = JSON.stringify(chatHist.slice(-4));
      const dp = loadData();
      const raw = await (
        await fetch(
          apiUrl(
            `action=aiAsk&q=${encodeURIComponent(text)}&people=${encodeURIComponent(people.slice(0, 300))}&cards=${encodeURIComponent(cards.slice(0, 400))}&cats=${encodeURIComponent(cats.slice(0, 500))}&hist=${encodeURIComponent(hist.slice(0, 2200))}`,
          ),
        )
      ).text();
      let pl;
      try {
        pl = JSON.parse(raw);
      } catch (_) {
        throw new Error(
          /ppConfig|<html|<!doctype/i.test(raw)
            ? "Server error page — redeploy Apps Script (New version)"
            : raw.slice(0, 160),
        );
      }
      if (pl.error) throw new Error(pl.error);
      if (
        pl.goto &&
        ["expenses", "cards", "grvcc", "sweetie"].includes(pl.goto)
      ) {
        qa.style.display = "none";
        switchTab(pl.goto);
        wait.remove();
        return;
      }
      const FK = [
        "person",
        "card",
        "category",
        "text",
        "status",
        "type",
        "from",
        "to",
      ];
      let filt = FK.some((k) => pl[k]);
      const prevP = [...chatHist].reverse().find((h) => h.p);
      if (prevP && !pl.reply) {
        const reset =
          /\b(overall|everything|sabka|sabhi|poore|pura|all time|new topic)\b/i.test(
            text,
          );
        const fu =
          /^\s*(aur|and|also|isme|isme se|usme|ismein|same|iska|uska|iski|uski|inme|unme|ab|phir|then)\b/i.test(
            text,
          );
        const gr = pl.group && pl.group !== "none";
        const own =
          (pl.sources || []).length === 1 &&
          ["summary", "salary", "config"].includes(pl.sources[0]);
        // Follow-up rule: keep the previous answer's filters unless this question
        // names its own new person/card/category/keyword/status/type.
        const ent = [
          "person",
          "card",
          "category",
          "text",
          "status",
          "type",
        ].some((k) => pl[k]);
        if (!reset && !own && (!ent || fu)) {
          FK.forEach((k) => {
            if (!pl[k] && prevP.p[k]) pl[k] = prevP.p[k];
          });
          if ((pl.sources || []).length !== 1)
            pl.sources = prevP.p.sources || pl.sources;
          filt = FK.some((k) => pl[k]);
        }
      }
      if (pl.reply && !filt && (!pl.sources || !pl.sources.length)) {
        wait.innerHTML = esc(pl.reply);
        chatHist.push({ q: text, a: String(pl.reply).slice(0, 80) });
        return;
      }
      if (
        !filt &&
        (!pl.group || pl.group === "none") &&
        (pl.agg || "sum") === "sum" &&
        !(pl.sources || []).some((s) =>
          ["summary", "salary", "config"].includes(s),
        )
      ) {
        wait.innerHTML =
          "Thoda specific pucho — kaun sa card / person / month / merchant?";
        return;
      }
      const all = await dp;
      if (pl.text) {
        try {
          const lc = (x) => String(x || "").toLowerCase();
          const base = runPlan({ ...pl, text: "" }, all).rows;
          const ds = [
            ...new Set(
              base.map((r) => lc(r.desc || r.remarks || "")).filter(Boolean),
            ),
          ].slice(0, 200);
          if (ds.length) {
            const items = ds.map((d, i) => i + ":" + d.slice(0, 28)).join("|");
            const m = JSON.parse(
              await (
                await fetch(
                  apiUrl(
                    `action=aiMatch&q=${encodeURIComponent(text.slice(0, 200))}&concept=${encodeURIComponent(pl.text)}&items=${encodeURIComponent(items.slice(0, 6500))}`,
                  ),
                )
              ).text(),
            );
            if (Array.isArray(m.match))
              pl._m = new Set(m.match.map((i) => ds[i]).filter(Boolean));
          }
        } catch (_) {}
      }
      const res0 = runPlan(pl, all);
      const view = answerHtml(text, pl, res0);
      const { html, txt } = view;
      lastResultContext = { plan: compact(pl), rows: view.resultRows, q: text };
      chatTxt.push(txt);
      wait.innerHTML =
        html +
        `<div style="margin-top:8px;text-align:right"><button type="button" data-c="copy" data-i="${chatTxt.length - 1}" style="border:1px solid #ffffff30;background:transparent;color:inherit;border-radius:8px;padding:3px 10px;font-size:.72rem;cursor:pointer">⧉ Copy</button></div>`;
      chatHist.push({
        q: text,
        p: compact(pl),
        r: view.resultRows
          .slice(0, 5)
          .map(
            (r) =>
              r.date +
              " " +
              [r.person, r.card || r.category || r.type, r.desc]
                .filter(Boolean)
                .join(" ") +
              " Rs" +
              Math.round(r.amount),
          ),
      });
    } catch (e) {
      wait.innerHTML = `<span style="color:#fda4af">Couldn’t answer: ${esc(
        String(e.message || e)
          .replace(/<[^>]*>/g, " ")
          .slice(0, 180),
      )}</span>`;
    } finally {
      go.disabled = false;
      const th = $("chThread");
      th.scrollTop = th.scrollHeight;
      focusIn();
    }
  }
  async function askData(text) {
    box.style.display = "none";
    aiText.value = "";
    openChat();
    return chatAsk(text);
  }
  $("aiGo").onclick = async () => {
    clearAiError();
    const text = $("aiTxt").value.trim();
    if (!text) {
      showAiError(
        "Text needed",
        new Error("Type a question or paste a bank SMS first."),
      );
      return;
    }
    const qLike =
      /\b(kitna|kitne|kitni|kharcha|kharch|expenses? (of|on|for)|how (much|many)|total|average|avg|last \d+ (day|week|month|year)s?|pichle|pichhle|is (mahine|saal|month|year)|this (month|year|week)|show|list|compare|sabse|highest|lowest|biggest|smallest|count|batao|btao|bata|dikhao|kya|kab|kaun|which|what)\b/i.test(
        text,
      ) &&
      !/\b(inr|rs\.?|₹)\s*[\d,]+.*\b(spent|debited|credited|purchase|txn|transaction|paid)\b/i.test(
        text,
      );
    if (qLike || (isQuestion(text) && !localParse(text))) return askData(text);
    const lab = labelHint(text);
    const body0 = lab ? lab.body : text;
    const applyLab = (o) => {
      if (!lab || !o) return o;
      if (lab.desc) o.desc = lab.desc;
      if (lab.rem) o.remarks = lab.rem;
      if (lab.who && o.kind === "card") o.usedBy = lab.who;
      return o;
    };
    // 1) crisp short formats ("flipkart 500 grv") - instant, no AI
    const quick = localParse(body0);
    if (quick) {
      box.style.display = "none";
      preview(applyLab(quick));
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
      let r = null,
        aiErr = null;
      // 2) AI reads the WHOLE message (SMS, labels, names, notes) and extracts every field
      try {
        const raw = await (
          await fetch(
            apiUrl(
              `action=aiParse&text=${encodeURIComponent(text)}&cards=${encodeURIComponent(cards)}&cats=${encodeURIComponent(cats)}&people=${encodeURIComponent([...peopleSet()].join(" | ").slice(0, 300))}`,
            ),
          )
        ).text();
        try {
          r = JSON.parse(raw);
        } catch (_) {
          throw new Error("Server said: " + raw.slice(0, 160));
        }
        if (r.error) throw new Error(r.error);
      } catch (e) {
        aiErr = e;
        r = null;
      }
      // 3) offline fallback if AI is unreachable
      if (!r) {
        const h0 = splitHint(text);
        const loc =
          (await smsParse(h0 ? h0.body : body0)) ||
          localParse(h0 ? h0.body : body0);
        if (!loc) throw aiErr || new Error("Could not understand this text");
        if (h0) {
          if (h0.desc) loc.desc = h0.desc;
          if (h0.rem) loc.remarks = h0.rem;
          if (h0.who && loc.kind === "card") loc.usedBy = h0.who;
        }
        box.style.display = "none";
        preview(applyLab(loc));
        return;
      }
      applyLab(r);
      // Client-side guards (work even if the server is an older version)
      if (
        r.kind !== "sweetie" &&
        /\b(credit\s*card|debit\s*card|bank\s*card|cc)\b|\bcard\s*(no\.?\s*)?[x*]{2,}\s*\d{4}|\b[x*]{2,}\s*\d{4}\b/i.test(
          text,
        )
      )
        r.kind = "card";
      if (r.kind === "card" && !r.usedBy && !(lab && lab.who)) {
        const nm = text
          .split(/\n+/)
          .map((l) => l.trim())
          .find(
            (l) =>
              l &&
              l.length <= 30 &&
              !/\d/.test(l) &&
              l.split(/\s+/).length <= 3,
          );
        if (nm)
          r.usedBy = nm
            .split(/\s+/)
            .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
      }
      if (r.kind === "card") {
        if (
          !(lab && lab.who) &&
          r.usedBy &&
          !text.toLowerCase().includes(String(r.usedBy).toLowerCase())
        )
          r.usedBy = "";
        try {
          const d = (text.match(
            /\b(?:card|a\/c|acct?|x{2,}|\*{2,})\s*[^\d]{0,12}(\d{4})\b/i,
          ) || [])[1];
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
      box.style.display = "none";
      preview(r);
    } catch (e) {
      showAiError("Couldn’t parse that text", e);
      console.warn("[AI transaction parse]", e);
    } finally {
      b.disabled = false;
      b.textContent = "Parse";
    }
  };
})();
