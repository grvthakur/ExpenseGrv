# GRV Expense v28 — Reorganization and Regression Report

## Completion and risk

- **Reorganization completeness:** 100% — all 2,152 original files from the uploaded ZIP are present at their mapped destination; no original file was deleted.
- **Regression risk:** **Medium** — the full suite was executed before and after. It returned the exact same 143-test result and the same 3 failing test groups, 1 known issue and 2 fixed-but-still-flagged cases. The source snapshot is not fully green, so this cannot honestly be rated Low.
- **Business logic changes:** none intended. No `.gs` file was split or merged.
- **Files with content changes:** 6 existing files (4 test/path files and 3 docs? See CSV/hash manifest; documentation count included) plus new documentation/helper files. Full content of changed files is in the changed-files ZIP.

## Input inventory

- Uploaded archive: `Claude 3.0(4).zip`
- Original file count: **2,152** (files only; directory entries excluded)
- Original file count accounted for: **2,152**
- Missing original files: **0**
- `.git/`, `.github/`, and root `node_modules/` preserved. `.git/config` remote URL was sanitized to remove an embedded credential; the GitHub remote itself is retained.
- Source `.gs` count: **11**
- `.gs` split/merge operations: **0**

Complete old-path → new-path mapping for every original file: [`FILE-MAP.csv`](FILE-MAP.csv).

## Target layout

```text
grv-expense/
├── README.md
├── CHANGELOG.md
├── INTEGRATION-NOTES.md
├── .git/                         # preserved as supplied
├── .github/                      # preserved as supplied
├── node_modules/                 # preserved local test dependencies
├── backend/
│   ├── ai-sheet/
│   │   ├── grv-ai-learning.gs
│   │   ├── developer-engine.gs
│   │   ├── developer-analyzer.gs
│   │   └── developer-source-analyzer.gs
│   ├── expense-sheet/
│   │   ├── history.gs
│   │   └── code.js               # test mirror, not deployed as .gs
│   └── shared/
│       ├── code.gs
│       ├── ai.gs
│       ├── developer-dashboard.gs
│       ├── grv-production-readiness.gs
│       ├── grv-final-signoff.gs
│       └── grv-financial-intelligence.gs
├── frontend/
│   ├── index.html
│   ├── index.html.bak
│   ├── script.js
│   ├── ai-entry.js
│   ├── [other JS/CSS/manifest/service worker files]
│   ├── icons/
│   └── assets/
├── tests/
│   ├── harness.js
│   ├── run-all.js
│   ├── server-dup-test.js
│   ├── browser-check.js
│   ├── issuer_detection_regression_test.js
│   ├── shorthand-regression-test.js
│   └── README.txt
├── docs/
│   ├── GS-SHEET-CLASSIFICATION.md
│   ├── RELEASE-INSTALL.md
│   ├── FILE-MAP.csv
│   └── APPS-SCRIPT-FUNCTION-INVENTORY.csv
└── tools/
    └── flatten-appsscript.ps1
```

## Before → after summary

- Root frontend runtime files and their local assets → `frontend/`.
- `.gs` files → `backend/ai-sheet/`, `backend/expense-sheet/`, or `backend/shared/` based on inspected spreadsheet access.
- Existing `tests/` folder retained; two root regression scripts moved into it.
- Project guidance/reference files → `docs/` where appropriate; README/CHANGELOG/INTEGRATION-NOTES remain at root.
- `.git/`, `.github/`, and `node_modules/` remain at root to preserve repository metadata, workflows and local dependencies.
- All original files are enumerated in `FILE-MAP.csv`.

## Exact content changes

Existing source files whose content changed:

1. `tests/harness.js` — `ROOT` remains project root; `read()` now resolves project-root, `frontend/`, and backend subfolders. This preserves existing test calls such as `read("script.js")` and `read("ai.gs")`.
2. `tests/run-all.js` — syntax scan now recursively checks `frontend/` and `backend/`; moved regression scripts execute from `tests/` using `__dirname`.
3. `tests/server-dup-test.js` — test fixture path now resolves to `backend/expense-sheet/code.js`; frontend script paths resolve under `frontend/`.
4. `tests/browser-check.js` — static test server root now points to `frontend/`.
5. `.git/config` — remote URL changed from credential-embedded HTTPS form to credential-free `https://github.com/...` form. This is a security-only change; the remote repository path is retained.

Documentation changes: `README.md`, `CHANGELOG.md`, `INTEGRATION-NOTES.md`. New documents and the flattening helper are additive.

No business-logic code file was edited. Full changed file contents are included in `GRV-Expense-v28-changed-files.zip`.

## Exact path diff summary

- `tests/harness.js`: `ROOT = path.resolve(__dirname, "..")` retained; single-root `read()` replaced by ordered source lookup across root/frontend/backend.
- `tests/run-all.js`: `fs.readdirSync(ROOT)` top-level scan replaced with recursive `frontend/` + `backend/` scan; regression script path changed from `path.join(ROOT, f)` to `path.join(__dirname, f)`.
- `tests/server-dup-test.js`: `../code.js` → `../backend/expense-sheet/code.js`; `../script.js` → `../frontend/script.js`; `../ai-entry.js` → `../frontend/ai-entry.js`.
- `tests/browser-check.js`: test server root `path.resolve(__dirname, "..")` → `path.resolve(__dirname, "..", "frontend")`.
- `.git/config`: credential-bearing remote URL → credential-free GitHub HTTPS remote URL; exact secret is intentionally not reproduced in this report.
- `index.html`: no edits required. All referenced local scripts/styles/icons/manifest moved together under `frontend/`, preserving the same relative paths.

## Test execution — before and after

Command (from project root):

```bash
node tests/run-all.js
```

Baseline before reorganization:

```text
137 passed, 3 failed, 1 known issue(s), 2 fixed-but-still-flagged, 0 skipped (total 143)
```

After reorganization:

```text
137 passed, 3 failed, 1 known issue(s), 2 fixed-but-still-flagged, 0 skipped (total 143)
```

The same three test groups failed in both runs:

1. `labelHint: explicit labels win` — expected `who: "Grv"`, actual `who: "GRV"`.
2. `when history arrives the dashboard refreshes by itself (no other action needed)` — expected/actual displayed total differ.
3. `server-dup-test.js passes` — internal test output includes the `deleteCard removes ALL rows with the id` assertion and client sequential update-write assertion.

The same known shorthand regression entry and the same two fixed-but-still-flagged cases remained. No additional regression was introduced by the reorganization. These failures are deliberately not fixed because the request forbids business-logic changes.

Optional browser check:

```text
SKIPPED: playwright not installed
```

The browser check was not reported as passed.

## Refactor safety checklist

- [x] Every relative `require()` resolves: `tests/run-all.js` → `./harness` → `tests/harness.js`.
- [x] Every local `<script src>` in `frontend/index.html` resolves (13 local script references).
- [x] Every local `<link href>` in `frontend/index.html` resolves (7 local link references).
- [x] All 3 manifest icon paths resolve.
- [x] All 95 top-level `.gs` function declarations inventoried in `APPS-SCRIPT-FUNCTION-INVENTORY.csv`.
- [x] No duplicate `.gs` function names detected across the 11 files.
- [x] No duplicate top-level `const`/`let`/`var` declarations detected by the static scan.
- [x] `appsscript.json` validity: **not applicable — file absent in uploaded ZIP**.
- [x] Root `package.json`: **not present**; `tests/package.json`: **not present**.
- [x] `.clasp.json`: **not present**.
- [x] No original file deleted (2,152/2,152 mapped).
- [x] No `.gs` file split or merged.
- [x] No business logic changed.
- [x] No HtmlService `include()` directives found in `index.html`.

## Path-resolution scan

Found only test-side `__dirname` / `path.resolve` uses:

- `tests/harness.js` — project root; source resolver handles new locations.
- `tests/browser-check.js` — frontend root; changed to serve `frontend/`.
- `tests/server-dup-test.js` — explicit new paths to backend fixture/frontend files.
- `tests/run-all.js` — tests run relative to `__dirname`.

No `process.cwd()` or `import.meta.url` references found in scanned project source.

## Apps Script flat-namespace check

Apps Script does not support source subfolders as modules. The repository folder split is for version control and maintainability only. The 11 `.gs` files must be copied flat into the bound Apps Script project root. Duplicate `.gs` filenames: none. Duplicate global function names: none detected. `tools/flatten-appsscript.ps1` creates a flat staging folder and checks duplicate filenames.

## Flagged for review

1. `backend/shared/code.gs` — intentionally shared: finance writes and Learning Engine save hooks both occur in this file.
2. `backend/shared/ai.gs` — intentionally shared: reads finance rows and calls `grvAiLearningContext_()`.
3. `backend/shared/developer-dashboard.gs` — reads both the AI diagnostic spreadsheet and active finance spreadsheet.
4. `backend/shared/grv-production-readiness.gs` — checks finance and AI spreadsheet tabs.
5. `backend/shared/grv-final-signoff.gs` — cross-system orchestration; kept shared.
6. `backend/shared/grv-financial-intelligence.gs` — no direct sheet access; pure in-memory utility kept shared.
7. `backend/expense-sheet/code.js` — test fixture mirror, not a deployable `.gs` module.
8. `frontend/index.html.bak` — retained as a backup, not treated as active entry point.
9. `docs/config.txt` and `docs/txt.txt` — retained verbatim; contain endpoint URL strings which may be stale. Do not expose or deploy them as runtime config without owner review.
10. `.git/` — preserved unchanged; because paths moved, Git will show renames/deletes/adds until staged/committed.
11. `appsscript.json` and `.clasp.json` — absent; use the existing bound Apps Script project's manifest and Script ID, do not invent replacements.
12. `docs/GitHub.txt` — retained verbatim but contains an example that embeds a token in the remote URL. Do not follow that example; use Git Credential Manager or another credential helper. Revoke/rotate the credential that was embedded in the uploaded `.git/config`.
12. `node_modules/` — retained at root for local tests; do not upload this directory to Apps Script or static hosting.

## Security exception and credential handling

The uploaded `.git/config` contained a GitHub Personal Access Token embedded in the remote URL. The working copy now retains the same remote repository URL without embedded credentials. The exact token was not copied into the release. A scan found no occurrence of that exact token in the repository commit history. **The owner should revoke/rotate the exposed token in GitHub immediately**, because it was included in the uploaded archive. `docs/GitHub.txt` remains byte-for-byte unchanged per the no-content-change rule, but its token-in-URL example is unsafe and must not be followed.

## Release decision

The reorganization is complete and path-resolution checks pass. The existing source snapshot's test suite is not fully green (3 failures), so this package is **organized and regression-equivalent, not certified as a fully green production release**. Do not deploy solely on the basis of this reorganization report.
