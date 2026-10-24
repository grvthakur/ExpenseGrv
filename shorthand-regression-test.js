const cardConfig=[{card:"AXIS-FLIPKART"},{card:"HDFC-TATA NEU"}];
const peopleSet=()=>new Set(["grv","gaurav","me","sweetie","tanya"]);
const cap=(w)=>w.length<=3?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase();
function shorthandHint(text, base) {
    const lines = String(text || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
    // Single-line shorthand is valid; requiring two lines skipped the canonical test input.
    if (!lines.length) return null;
    const line = lines.slice().reverse().find((x) => x.includes(",") && x.length <= 180);
    if (!line) return null;
    const parts = line.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const personToken = parts[0].replace(/^(?:used\s*by\s*[:=]\s*)/i, "").trim();
    const known = peopleSet();
    if (!known.has(personToken.toLowerCase()) && !/^(grv|gaurav|me|self|sweetie|mummy|papa|bhai|wife)$/i.test(personToken)) return null;
    const cardWords = parts.slice(1).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const cards = (typeof cardConfig !== "undefined" ? cardConfig : []);
    const consonants = (w) => String(w || "").replace(/[aeiou]/g, "");
    const cardScore = (c) => c.card.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      .reduce((n, token) => n + (cardWords.some((w) => w === token || consonants(w) === consonants(token)) ? 1 : 0), 0);
    const ranked = cards.map((c) => ({card:c.card, score:cardScore(c)})).filter((x) => x.score > 0).sort((a,b) => b.score-a.score);
    const card = ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score) ? ranked[0].card : "";
    const cardPartIndex = card ? parts.findIndex((part) => {
      const ws = part.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return cardWords.some((w) => ws.includes(w) || ws.some((x) => consonants(x) === consonants(w)));
    }) : -1;
    const tail = parts.slice(cardPartIndex >= 1 ? cardPartIndex + 1 : 1).join(", ");
    const explicitRemark = tail.match(/\b(?:remarks?|note)\s*[:=]\s*(.+)$/i);
    const itemSource = tail.replace(/\b(?:remarks?|note)\s*[:=]\s*.+$/i, "").trim();
    const noteMatch = itemSource.match(/\b(?:already\s+paid|paid\s+in|will\s+get\s+refund|refund|split\s+with|for\s+(?:mummy|papa|bhai|wife))\b.+$/i);
    const extraNote = lines.filter((x) => x !== line && /\\b(?:already\\s+paid|paid\\s+in|will\\s+get\\s+refund|refund|split\\s+with|pending|settled|due)\\b/i.test(x)).join(" ");
    const note = (explicitRemark ? explicitRemark[1] : noteMatch ? noteMatch[0] : extraNote).trim();
    let phrase = itemSource.replace(/\b(?:remarks?|note)\s*[:=]\s*.+$/i, "").trim();
    if (noteMatch && !explicitRemark) phrase = phrase.slice(0, noteMatch.index).trim();
    const from = phrase.match(/^(.+?)\s+from\s+(.+)$/i);
    let item = "", source = "";
    if (from) { item = from[1].trim(); source = from[2].trim(); }
    else if (phrase) {
      item = phrase;
      source = String((base && base.desc) || "").trim();
    }
    const cleanSource = (s) => {
      let v = String(s || "").trim().replace(/^(?:at|from)\s+/i, "");
      v = v.replace(/\b(?:instamart|online|payment|transaction)\b/ig, (m) => m.toLowerCase() === "instamart" ? "Instamart" : "");
      return v.replace(/\s+/g, " ").replace(/^[\s-]+|[\s-]+$/g, "").toUpperCase();
    };
    const cleanItem = (s) => String(s || "").trim().replace(/^(?:item|desc(?:ription)?)\s*[:=]\s*/i, "").replace(/^[,;\s]+|[,;\s]+$/g, "").replace(/\s+/g, " ").toUpperCase();
    const src = cleanSource(source);
    const itm = cleanItem(item);
    if (!card && !itm && !note) return null;
    const out = { usedBy: personToken.toUpperCase() === "ME" ? "GRV" : personToken.toUpperCase(), card, remarks: note.toUpperCase() };
    if (src && itm) out.desc = src + " - " + itm;
    else if (itm && base && base.desc) out.desc = cleanSource(base.desc) + " - " + itm;
    else if (itm) out.desc = itm;
    return out;
  }

  
const cases=[
["Grv, flpkrt axs, meethae from swiggy",{desc:"SWIGGY - MEETHAE",card:"AXIS-FLIPKART",usedBy:"GRV",remarks:""}],
["Grv, flpkrt axs, meethae from swiggy\nalready paid in kotak",{desc:"SWIGGY - MEETHAE",card:"AXIS-FLIPKART",usedBy:"GRV",remarks:"ALREADY PAID IN KOTAK"}],
["Gaurav, flpkrt axs, shoes from myntra",{desc:"MYNTRA - SHOES",card:"AXIS-FLIPKART",usedBy:"GAURAV",remarks:""}]
];
for(const [input,expected] of cases){const got=shorthandHint(input,{desc:"SWIGGY"});console.log(JSON.stringify({got,pass:Object.keys(expected).every(k=>got&&got[k]===expected[k])}));}
