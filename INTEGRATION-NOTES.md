# GRV AI Intelligence — foundation integration notes

## Current source audit

- Repository: `grvthakur/ExpenseGrv`, default branch `main`.
- Audited HEAD: `528cbcf6eb2027e8468f1870e7719731fcd190ed`.
- Current `ai.gs` already implements an AI query planner and reads Expenses, Cards, Sweetie and other configured sheets into a unified row set. Reuse this rather than creating a second financial calculator.
- Current `sheetWrite()` and `sheetWriteSeq()` use `fetch(..., {mode:'no-cors'})`; the browser cannot inspect the response. A UI toast or preview confirmation is not proof of backend persistence.
- `ai-entry.js` currently calls `learnAlias()` and `learnLast4()` in the preview OK handler, before the existing Add request has completed. These local alias behaviors must be preserved, but server-side learning must not use this point as a confirmed-save signal.

## Sidecar module

`grv-ai-learning.gs` is an additive Apps Script module. It expects a dedicated learning spreadsheet ID in Script Properties:

`GRV_AI_LEARNING_SPREADSHEET_ID = <dedicated spreadsheet ID>`

It creates only `LearningPatterns` and `LearningEvents` tabs in that separate spreadsheet. It never writes to Expenses, Cards, Sweetie or calculation sheets. It stores normalized short fingerprints and final field snapshots, not raw SMS bodies or full card numbers. All public helper functions fail open.

## Required backend hooks (not yet applied)

1. Before `aiParse_()` builds its prompt, call `grvAiLearningContext_(text)` inside a try/catch and add only the returned high-confidence patterns as optional hints. If the sidecar is missing or unavailable, parsing must proceed unchanged.
2. In each new-transaction backend route (`add`, `addCard`, `addSweetie`), call `grvAiLearnSaved_(record, sourceText)` only after the successful `appendRow()` and existing server-side recalculation. Do not call it on duplicate/error responses or edit/delete routes.
3. To learn corrections against original parse input, pass an optional transient `aiSource` value through the existing AI-to-form save path. The learning module must fingerprint it and discard the raw value. Do not add a transaction column or alter existing transaction schemas.

## Critical integration blocker

The current browser uses opaque `no-cors` writes. Therefore a client-side post-save callback cannot reliably confirm persistence. The safe first implementation is a server-side learning hook immediately after successful backend append/recalculation. Do not move learning into the preview confirmation handler.

## Not yet done

No repository files were changed. No Apps Script was deployed. No spreadsheet was created. The module is a foundation artifact only; the three backend hooks, frontend source-context handoff, parser-context injection, tests against the full project, and setup/deployment steps remain to be completed.
