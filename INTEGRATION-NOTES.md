# Integration Notes — v28 Reorganized Source

## Runtime preservation

- `frontend/index.html` remains the frontend entry point.
- All local files referenced by `<script src>` and `<link href>` remain beside `index.html` or under the same `frontend/` relative paths (`icons/`, `assets/`).
- External CDN URLs are unchanged.
- No HtmlService `include()` template directives were found in `index.html`.
- The Apps Script backend remains a single global namespace after flattening.

## Spreadsheet split

- `ai` spreadsheet: learning patterns/events, developer events/issues, AI learning context and diagnostic analysis.
- `expense` spreadsheet: Expenses, Salary, Cards, Sweetie, Summary and transaction history.
- `backend/shared/`: files that explicitly interact with both sheets or orchestrate checks across both.

See `docs/GS-SHEET-CLASSIFICATION.md` for source-line evidence.

## Apps Script source files

There are 11 `.gs` files. They must be flattened into the Apps Script project root before `clasp push` or manual upload. The repository subfolders do not become Apps Script subfolders. No `.gs` file was split or merged.

## Configuration files absent from uploaded ZIP

The uploaded ZIP did not contain:
- `appsscript.json`
- `.clasp.json`
- root `package.json`
- `tests/package.json`
- `.gitignore`
- `RELEASE-INSTALL.md`

The project uses the existing `node_modules/` directory for local test dependencies. Do not invent or copy a manifest from another project. For clasp deployment, clone the existing bound Apps Script project first so its Script ID and manifest are retained.

## Test path changes

- `tests/harness.js`: source resolver now checks frontend and backend folders.
- `tests/run-all.js`: syntax scan traverses frontend/backend and invokes moved regression scripts from `tests/`.
- `tests/server-dup-test.js`: reads the backend test mirror and frontend JS from their new paths.

No financial or parser business logic was changed.
