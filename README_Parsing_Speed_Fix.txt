GRV Expense Tracker — Parsing Speed Fix

Files:
- ai-entry.js: updated client-side file; only file changed.
- ai.gs: supplied original backend file, included for reference and remains unchanged.
- issuer_detection_regression_test.js: small standalone test for issuer recognition.

Change:
- Expanded client-side bank issuer recognition in the deterministic SMS parser to include IDFC, PNB, HSBC, IndusInd, RBL, BOB, and the full phrase Bank of Baroda.
- Existing fallback to the AI endpoint remains unchanged.
- No Apps Script/backend code was modified.

Validation performed:
- `node --check ai-entry.js` passed.
- 13 issuer-detection regression cases passed.
- These tests validate syntax and the issuer-recognition change; they are not an end-to-end browser/API latency benchmark.

Install:
Replace the existing client-side ai-entry.js with the included updated ai-entry.js.
Do not redeploy ai.gs for this change because it is unchanged.
