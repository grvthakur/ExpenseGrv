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
  const merchant = text.match(/\b(?:merchant(?:\s*name)?\s*[:\-]\s*)([^\n]+)/i);
  const bank = text.match(/\b(icici|axis|hdfc|sbi|kotak|idfc|pnb|hsbc|indusind|rbl|bob)\b/i);
  return {
    bank: bank ? bank[1].toLowerCase() : '',
    merchantHint: merchant ? grvAiLearningNormalize_(merchant[1]) : '',
    hasBankSmsShape: /\b(?:spent|debited|transaction|purchase|charged|towards)\b/i.test(text),
  };
}

function grvAiLearningContext_(input) {
  try {
    if (!grvAiLearningEnabled_()) return { enabled: false, patterns: [] };
    const sheet = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.patterns,
      ['key','kind','source','target','count','confidence','updatedAt','lastEventId']);
    const rows = sheet.getDataRange().getValues().slice(1);
    const q = grvAiLearningNormalize_(input || '');
    const tokens = q.split(' ').filter(x => x.length > 2);
    const matches = rows.map(r => ({
      key:String(r[0] || ''), kind:String(r[1] || ''), source:String(r[2] || ''),
      target:String(r[3] || ''), count:Number(r[4] || 0), confidence:Number(r[5] || 0),
    })).filter(p => p.source && tokens.some(t => p.source.includes(t) || t.includes(p.source)))
      .sort((a,b) => b.confidence-a.confidence || b.count-a.count).slice(0, 12);
    return { enabled: true, patterns: matches };
  } catch (err) {
    console.warn('[GRV AI Learning] context unavailable:', err);
    return { enabled: false, patterns: [] };
  }
}

function grvAiLearnSaved_(record, sourceText) {
  // Invoke only after the transaction's appendRow and existing server-side
  // recalculation have completed successfully. Fail-open by design.
  try {
    if (!grvAiLearningEnabled_() || !record || !record.id) return false;
    const patterns = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.patterns,
      ['key','kind','source','target','count','confidence','updatedAt','lastEventId']);
    const events = grvAiLearningSheet_(GRV_AI_LEARNING_TABS.events,
      ['eventId','transactionId','kind','sourceFingerprint','targetSnapshot','createdAt','version']);
    const safe = grvAiLearningSafeSource_(sourceText);
    const kind = String(record.kind || 'transaction');
    const candidates = [
      ['merchant', safe.merchantHint, record.description || record.desc || ''],
      ['person', grvAiLearningNormalize_(record.person || record.usedBy || ''), record.person || record.usedBy || ''],
      ['description', grvAiLearningNormalize_(record.sourceDescription || ''), record.description || record.desc || ''],
      ['remarks', grvAiLearningNormalize_(record.sourceRemarks || ''), record.remarks || ''],
      ['card', grvAiLearningNormalize_(record.cardFingerprint || ''), record.card || ''],
    ].filter(x => x[1] && x[2]);
    const eventId = Utilities.getUuid();
    const existing = patterns.getDataRange().getValues();
    candidates.forEach(([type, source, target]) => {
      const key = [type, source].join('|');
      let rowIndex = existing.findIndex((r, i) => i > 0 && String(r[0]) === key);
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
    events.appendRow([eventId, String(record.id), kind, JSON.stringify(safe), JSON.stringify({
      card: String(record.card || '').slice(0,60), person: String(record.person || record.usedBy || '').slice(0,60),
      description: String(record.description || record.desc || '').slice(0,100),
      remarks: String(record.remarks || '').slice(0,120), category: String(record.category || '').slice(0,60),
    }), new Date(), GRV_AI_LEARNING_VERSION]);
    return true;
  } catch (err) {
    console.warn('[GRV AI Learning] save skipped; transaction remains saved:', err);
    return false;
  }
}
