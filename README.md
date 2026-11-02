# GRV Expense

This repository is organized for human maintenance while preserving the original application files and runtime-relative frontend paths.

## Project layout

- `frontend/` — static web app, JavaScript, CSS, PWA manifest/service worker, icons and assets. `frontend/index.html` remains the web entry point.
- `backend/ai-sheet/` — Apps Script modules that access the dedicated `ai` learning/diagnostics spreadsheet.
- `backend/expense-sheet/` — expense-only backend history and the `code.js` synthetic-test mirror.
- `backend/shared/` — Apps Script modules that touch both spreadsheets or provide shared orchestration/utilities.
- `tests/` — local synthetic regression suite.
- `docs/` — project notes, configuration reference and audit evidence.
- `tools/` — repository-only Apps Script flattening helper.
- `.git/`, `.github/`, `node_modules/` — preserved as supplied; `node_modules/` is local tooling dependency material, not deployed frontend/backend code.

## Important Apps Script constraint

Apps Script `.gs` files share one flat global namespace. Apps Script does **not** support repository subfolders as module imports. The `backend/` folders are repository-only organization. Before `clasp push`, flatten every `.gs` file into one Apps Script project root. See `docs/RELEASE-INSTALL.md` and `tools/flatten-appsscript.ps1`.

## Run tests

From repository root:

```bash
node tests/run-all.js
```

The uploaded source snapshot's baseline is **137 passed, 3 failed, 1 known issue, 2 fixed-but-still-flagged, 0 skipped (143 total)**. The reorganized project produces the same result. The 3 failures are pre-existing source/test mismatches, not caused by moving files. See `docs/REORGANIZATION-REPORT.md`.

`jsdom` is available through the preserved root `node_modules/`. `tests/browser-check.js` is an optional Playwright/Chromium check.

## Source of truth

`backend/` and `frontend/` contain the reorganized current uploaded source. No financial logic, parser logic, function names, sheet schemas or feature behaviour was intentionally changed. Only three test files had path-resolution edits required by the new layout.
