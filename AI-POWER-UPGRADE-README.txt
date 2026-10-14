EXPENSE TRACKER — AI POWER UPGRADE

Files:
- ai-entry.js: replace the current frontend AI file with this file (rename it to ai-entry.js).
- code.gs: replace the Apps Script project's current code.gs with this file.

Changes:
- Deterministic contextual calculations from rows shown in the previous answer (lowest/highest/total/average/count/list).
- Preserves previous query scope for short list follow-ups; New Chat clears context.
- Stronger query-planning instructions for English/Hinglish, aggregation, dates, filters, and follow-ups.
- Dedicated system message for query planning.
- Balanced JSON extraction and JSON validation so malformed output can fall through to another configured provider.
- Existing transaction-entry/preview/save flow and provider chain remain in place.

Deploy:
1. Back up your current files.
2. Replace frontend ai-entry.js.
3. Replace Apps Script code.gs; Deploy > Manage deployments > Edit > New version > Deploy.
4. Keep existing Script Properties (GROQ_KEY; optional CEREBRAS_KEY / OPENROUTER_KEY).
5. Hard-refresh with Ctrl+Shift+R. If index.html uses a ?v= parameter for ai-entry.js, increment it to bust cache.

Checks:
- Frontend and Apps Script JavaScript syntax checked locally.
- Live API/browser behavior is not verified in this environment.
