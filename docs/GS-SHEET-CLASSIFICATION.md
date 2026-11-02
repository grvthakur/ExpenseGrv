# Apps Script sheet-touch classification

Classification is based on actual source references in the uploaded ZIP. Apps Script `.gs` files share one flat global namespace; these folders are repository-only organization.

## `backend/ai-sheet/`

| File | Evidence | Reason |
|---|---|---|
| `grv-ai-learning.gs` | Lines 14, 18–20: reads `GRV_AI_LEARNING_SPREADSHEET_ID`, opens that ID; line 25 gets the Learning tab | AI learning patterns/events |
| `developer-engine.gs` | Lines 76–83: reads `GRV_AI_LEARNING_SPREADSHEET_ID`, opens it, gets diagnostic sheet | DeveloperEvents/DeveloperIssues are in the AI sidecar |
| `developer-analyzer.gs` | Lines 42–48: reads AI learning spreadsheet property, opens it, reads DeveloperEvents/DeveloperIssues; line 97 creates/reads DeveloperAnalysis | Diagnostic analysis stored in AI sidecar |
| `developer-source-analyzer.gs` | Lines 56–59 and 313–322; 593–597: reads AI learning spreadsheet ID and opens/gets tabs | Source analysis stored in AI sidecar |

## `backend/expense-sheet/`

| File | Evidence | Reason |
|---|---|---|
| `history.gs` | Lines 9, 27, 48: creates/gets Expenses History, Cards History, Sweetie History; lines 154–164 opens active spreadsheet and Expenses | Finance transaction history only |
| `code.js` | Test mirror of expense backend; no `GRV_AI_LEARNING_SPREADSHEET_ID`, no `grvAi*` learning hooks; mocked sheet names include Expenses/Cards/Sweetie/Salary in `tests/server-dup-test.js` lines 8–10 | Expense-only server test fixture; not an Apps Script deployment file |

## `backend/shared/`

| File | Evidence | Reason |
|---|---|---|
| `code.gs` | Lines 151–153 open active finance spreadsheet and Expenses/Salary; lines 425–426 and 455–459 call `grvAiLearningPayload_` / `grvAiLearnSaved_`; lines 562–565, 598–605, 968–971, 989–990 repeat learning persistence hooks | Writes finance records and learning sidecar events |
| `ai.gs` | Lines 43–49 reads expense rows; lines 255–258 opens active finance spreadsheet; line 490 calls `grvAiLearningContext_`; line 594 reads Cards | Reads expense sheet and retrieves AI learning context |
| `developer-dashboard.gs` | Lines 6–8 and 30–32 opens AI sidecar; lines 44–47 opens active finance spreadsheet and reads finance tabs | Dashboard combines AI diagnostics and finance system health |
| `grv-production-readiness.gs` | Lines 34–40 checks active finance tabs; lines 50–61 opens AI sidecar and checks diagnostic/learning tabs | Readiness audit checks both spreadsheets |
| `grv-final-signoff.gs` | Calls readiness and deployed health/dashboard/learning contracts; see functions `grvProductionReadinessCheck` and endpoint action checks in this file | Orchestrates checks across both systems; no direct sheet write |
| `grv-financial-intelligence.gs` | No `SpreadsheetApp`, `openById`, `getSheetByName` or Script Property sheet ID references; function accepts in-memory `rows` | Shared pure utility; no direct sheet access |

## Notes

- `code.js` is a test fixture mirror, not an additional `.gs` file. It remains separate from `code.gs`.
- `code.gs` and `ai.gs` must be in `shared/` because they touch both spreadsheets through explicit learning hooks.
- No `.gs` file was split or merged.
- `appsscript.json` was not present in the uploaded ZIP. `.clasp.json`, root `package.json`, `tests/package.json`, and `.gitignore` were also absent.
