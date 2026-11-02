/**
 * GRV AI Learning sidecar — additive Apps Script module.
 * Does not alter transaction sheets or existing financial calculations.
 * Configure Script Property GRV_AI_LEARNING_SPREADSHEET_ID with a dedicated
 * spreadsheet ID before enabling writes. No raw SMS or full card numbers stored.
 */
const GRV_AI_LEARNING_VERSION = 1;
const GRV_AI_LEARNING_TABS = {
  patterns: 'LearningPatterns',
  events: 'LearningEvents',
};

function grvAiLearningEnabled_() {
  return !!PropertiesService.getScriptProperties().getProperty('GRV_AI_LEARNING_SPREADSHEET_ID');
}

function grvAiLearningBook_() {
  const id = PropertiesService.getScriptProperties().getProperty('GRV_AI_LEARNING_SPREADSHEET_ID');
  if (!id) throw new Error('GRV_AI_LEARNING_SPREADSHEET_ID is not configured');
  return SpreadsheetApp.openById(id);
}

function grvAiLearningSheet_(name, headers) {
  const book = grvAiLearningBook_();
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function grvAiLearningNormalize_(value) {
  return String(value == null ? '' : value)
    .toLowerCase().replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\b(?:\+?91[- ]?)?[6-9]\d{9}\b/g, '[phone]')
    .replace(/\b\d{4,}\b/g, '[digits]')
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 100);
}

function grvAiLearningSafeSource_(sourceText) {
  // Store only a normalized short fingerprint, never the original SMS body.
  const text = String(sourceText || '').slice(0, 1500);
  const merchant = text.match(/\b(?:merchant(?:\s*name)?\s*[:\-]\s*|at\s+|towards\s+|to\s+)([^\n,;]+)/i);
  const bank = text.match(/\b(icici|axis|hdfc|sbi|kotak|idfc|pnb|hsbc|indusind|rbl|bob)\b/i);
  return {
    bank: bank ? bank[1].toLowerCase() : '',
    merchantHint: merchant ? grvAiLearningNormalize_(merchant[1]) : '',
    hasBankSmsShape: /\b(?:spent|debited|transaction|purchase|charged|towards)\b/i.test(text),
  };
}

function grvAiLearningContext_(input) {
  try {
    if (!grvAiLearningEnabled_()) return { enabled: false, patterns: [], feedback: null };
    const sheet = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.patterns,
      ['key','kind','source','target','count','confidence','updatedAt','lastEventId']);
    const rows = sheet.getDataRange().getValues().slice(1);
    const q = grvAiLearningNormalize_(input || '');
    const tokens = q.split(' ').filter(x => x.length > 2);
    const matches = rows.map(r => ({
      key:String(r[0] || ''), kind:String(r[1] || ''), source:String(r[2] || ''),
      target:String(r[3] || ''), count:Number(r[4] || 0), confidence:Number(r[5] || 0),
    })).filter(p => p.source && tokens.some(t => p.source.includes(t) || t.includes(p.source)))
      .sort((a,b) => {
        // Context-anchored correction rules outrank generic historical patterns.
        const ac = a.kind.indexOf('correction:') === 0 ? 1 : 0;
        const bc = b.kind.indexOf('correction:') === 0 ? 1 : 0;
        return bc-ac || b.confidence-a.confidence || b.count-a.count;
      }).slice(0, 12);
    return { enabled: true, patterns: matches, feedback: grvAiLearningFeedbackSummary_() };
  } catch (err) {
    console.warn('[GRV AI Learning] context unavailable:', err);
    return { enabled: false, patterns: [], feedback: null };
  }
}

/** Read-only feedback metrics derived from saved learning events. */
function grvAiLearningFeedbackSummary_() {
  try {
    if (!grvAiLearningEnabled_()) return { events:0, correctedEvents:0, correctedFields:0 };
    const sheet = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.events,
      ['eventId','transactionId','kind','sourceFingerprint','targetSnapshot','createdAt','version']);
    const rows = sheet.getDataRange().getValues().slice(1);
    let correctedEvents = 0, correctedFields = 0;
    rows.forEach(row => {
      try {
        const snapshot = JSON.parse(String(row[4] || '{}'));
        const corrections = snapshot && snapshot.corrections && typeof snapshot.corrections === 'object' ? snapshot.corrections : {};
        const count = Object.keys(corrections).length;
        if (count) correctedEvents++;
        correctedFields += count;
      } catch (_) {}
    });
    return { events:rows.length, correctedEvents:correctedEvents, correctedFields:correctedFields };
  } catch (err) {
    console.warn('[GRV AI Learning] feedback metrics unavailable:', err);
    return { events:0, correctedEvents:0, correctedFields:0 };
  }
}


function grvAiLearningPayload_(e) {
  try {
    const raw = String((e && e.parameter && e.parameter.aiLearning) || "");
    if (!raw || raw.length > 7000) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    // Prefer transient original input so the server derives the fingerprint.
    // The raw source is never returned from this helper or written to the learning sheet.
    const sourceText = String(data.sourceText || "").slice(0, 1500);
    const hints = data.sourceHints && typeof data.sourceHints === "object" ? data.sourceHints : {};
    const sourceHints = sourceText
      ? grvAiLearningSafeSource_(sourceText)
      : {
          bank: String(hints.bank || "").toLowerCase().replace(/[^a-z]/g, "").slice(0,20),
          merchantHint: grvAiLearningNormalize_(hints.merchantHint || ""),
          hasBankSmsShape: hints.hasBankSmsShape === true
        };
    return {
      sourceHints: sourceHints,
      suggested: data.suggested && typeof data.suggested === "object" ? data.suggested : null
    };
  } catch (_) { return null; }
}

function grvAiLearnSaved_(record, sourceText, suggested) {
  // Invoke only after the transaction's appendRow and existing server-side
  // recalculation have completed successfully. Fail-open by design.
  try {
    if (!grvAiLearningEnabled_() || !record || !record.id) return false;
    const patterns = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.patterns,
      ['key','kind','source','target','count','confidence','updatedAt','lastEventId']);
    const events = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.events,
      ['eventId','transactionId','kind','sourceFingerprint','targetSnapshot','createdAt','version']);
    const safe = sourceText && typeof sourceText === "object"
      ? {
          bank: String(sourceText.bank || "").slice(0,20),
          merchantHint: String(sourceText.merchantHint || "").slice(0,100),
          hasBankSmsShape: sourceText.hasBankSmsShape === true
        }
      : grvAiLearningSafeSource_(sourceText);
    const kind = String(record.kind || 'transaction');
    const finalSnapshot = {
      card: String(record.card || '').slice(0,60),
      person: String(record.person || record.usedBy || '').slice(0,60),
      description: String(record.description || record.desc || '').slice(0,100),
      remarks: String(record.remarks || '').slice(0,120),
      category: String(record.category || '').slice(0,60),
      amount: Number(record.amount || 0),
      date: String(record.date || record.txnDate || '').slice(0,20),
      type: String(record.type || '').slice(0,30),
    };
    const safeSuggested = suggested && typeof suggested === 'object' ? {
      kind: String(suggested.kind || '').slice(0,20),
      card: String(suggested.card || '').slice(0,60),
      usedBy: String(suggested.usedBy || '').slice(0,60),
      desc: String(suggested.desc || '').slice(0,100),
      remarks: String(suggested.remarks || '').slice(0,120),
      category: String(suggested.category || '').slice(0,60),
      amount: Number(suggested.amount || 0),
      date: String(suggested.date || '').slice(0,20),
      type: String(suggested.type || '').slice(0,30),
    } : null;
    const corrections = {};
    if (safeSuggested) Object.keys(finalSnapshot).forEach(k => {
      const sk = k === 'person' ? 'usedBy' : (k === 'description' ? 'desc' : k);
      const before = safeSuggested[sk] == null ? '' : String(safeSuggested[sk]).trim();
      const after = finalSnapshot[k] == null ? '' : String(finalSnapshot[k]).trim();
      if (before && after && before.toLowerCase() !== after.toLowerCase())
        corrections[k] = { suggested: before.slice(0,120), approved: after.slice(0,120) };
    });
    const targetSnapshot = JSON.stringify({
      final: finalSnapshot, suggested: safeSuggested, corrections: corrections
    });
    // Idempotency: a retried save/update request with the same transaction ID
    // and identical approved snapshot must not inflate pattern counts.
    const priorEvents = events.getDataRange().getValues();
    const alreadyRecorded = priorEvents.slice(1).some(row =>
      String(row[1] || '') === String(record.id) &&
      String(row[2] || '') === kind && String(row[4] || '') === targetSnapshot
    );
    if (alreadyRecorded) return true;

    const eventId = Utilities.getUuid();
    const existing = patterns.getDataRange().getValues();
    const candidates = [
      ['merchant', safe.merchantHint, record.description || record.desc || ''],
      ['bank-card', safe.bank, record.card || ''],
      ['person-card', grvAiLearningNormalize_([record.person || record.usedBy || '', record.card || ''].join(' ')), record.card || ''],
      ['person', grvAiLearningNormalize_(record.person || record.usedBy || ''), record.person || record.usedBy || ''],
      ['description', grvAiLearningNormalize_(record.sourceDescription || ''), record.description || record.desc || ''],
      ['remarks', grvAiLearningNormalize_(record.sourceRemarks || ''), record.remarks || ''],
      ['card', grvAiLearningNormalize_(record.cardFingerprint || ''), record.card || ''],
      ['merchant-category', grvAiLearningNormalize_(record.description || record.desc || ''), record.category || ''],
    ].filter(x => x[1] && x[2]);
    candidates.forEach(([type, source, target]) => {
      const key = [type, source].join('|');
      const rowIndex = existing.findIndex((r, i) => i > 0 && String(r[0]) === key);
      if (rowIndex < 0) {
        patterns.appendRow([key, type, source, String(target).slice(0,100), 1, 0.55, new Date(), eventId]);
        existing.push([key, type, source, String(target).slice(0,100), 1, 0.55, new Date(), eventId]);
      } else {
        const row = existing[rowIndex];
        const oldTarget = String(row[3] || '');
        const count = Number(row[4] || 0) + 1;
        const same = oldTarget.toLowerCase() === String(target).toLowerCase();
        const confidence = same ? Math.min(0.98, 0.55 + (count - 1) * 0.08) : Math.max(0.35, Number(row[5] || 0) * 0.7);
        patterns.getRange(rowIndex + 1, 4, 1, 5).setValues([[oldTarget, count, confidence, new Date(), eventId]]);
      }
    });
    // Corrections are anchored to merchant/bank context, not merely to the
    // incorrect AI value. This makes them retrievable on the next similar SMS.
    Object.keys(corrections).forEach(field => {
      const correction = corrections[field];
      const contextKey = safe.merchantHint || safe.bank || '';
      const source = grvAiLearningNormalize_(contextKey);
      const target = String(correction.approved || '').slice(0,100);
      if (!source || !target) return; // no reliable context: retain event, don't invent a rule
      const ruleKind = 'correction:' + field;
      const key = [ruleKind, source].join('|');
      const rowIndex = existing.findIndex((r, i) => i > 0 && String(r[0]) === key);
      if (rowIndex < 0) {
        patterns.appendRow([key, ruleKind, source, target, 1, 0.72, new Date(), eventId]);
        existing.push([key, ruleKind, source, target, 1, 0.72, new Date(), eventId]);
      } else {
        const row = existing[rowIndex];
        const count = Number(row[4] || 0) + 1;
        const same = String(row[3] || '').toLowerCase() === target.toLowerCase();
        const confidence = same ? Math.min(0.99, Number(row[5] || 0.72) + 0.06) : Math.max(0.4, Number(row[5] || 0.72) * 0.75);
        patterns.getRange(rowIndex + 1, 4, 1, 5).setValues([[target, count, confidence, new Date(), eventId]]);
      }
    });
    events.appendRow([eventId, String(record.id), kind, JSON.stringify(safe), targetSnapshot,
      new Date(), GRV_AI_LEARNING_VERSION]);
    return true;
  } catch (err) {
    console.warn('[GRV AI Learning] save skipped; transaction remains saved:', err);
    return false;
  }
}
