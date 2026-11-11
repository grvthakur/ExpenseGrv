# GRV Expense

This repository is organized for human maintenance while preserving the original application files and runtime-relative frontend paths.
# GRV Expense

## Git Commands

### 1. Push Local Changes to GitHub

Run these commands from the repository root:

```bash
git add .
git commit -m "Your commit message"
git pull --rebase origin main
git push origin main
```

**Purpose:**
- `git add .` — Stage all local changes.
- `git commit` — Save changes locally.
- `git pull --rebase origin main` — Get the latest GitHub changes and rebase local commits on top.
- `git push origin main` — Push local commits to GitHub.

### 2. Make Local Repository Exactly Same as GitHub

**WARNING:** This will discard local uncommitted changes and local commits that are not present on GitHub.

```bash
git fetch origin
git reset --hard origin/main
git clean -fd
```

**Purpose:**
- `git fetch origin` — Fetch the latest GitHub changes.
- `git reset --hard origin/main` — Make the current local branch exactly match GitHub's `main`.
- `git clean -fd` — Remove untracked files and directories.

**Important:** Use Command 1 when you want to upload your work. Use Command 2 when you want to discard local differences and restore the exact GitHub version.

---


## Project layout

- `frontend/` — static web app, JavaScript, CSS, PWA manifest/service worker, icons and assets. `frontend/index.html` remains the web entry point.
- `backend/ai-sheet/` — Apps Script modules that access the dedicated `ai` learning/diagnostics spreadsheet.
- `backend/expense-sheet/` — expense-only backend history and the `code.js` synthetic-test mirror.
- `backend/shared/` — Apps Script modules that touch both spreadsheets or provide shared orchestration/utilities.
- `tests/` — local synthetic regression suite.
- `docs/` — project notes, configuration reference and audit evidence.
- `tools/` — repository-only Apps Script flattening helper.
- `.git/`, `.github/`, `node_modules/` — preserved as supplied; `node_modules/` is local tooling dependency material, not deployed frontend/backend code.

## Frontend features (added after v28)

- **Loans modal** (`frontend/loan.js`, `frontend/loan.css`, backend `backend/expense-sheet/loan.gs`): track money lent to people — borrower, given date, expected return date, note, amount, returned and pending, with Paid / Partial / Edit / Delete actions.
  - Table is sorted newest first by given date.
  - Desktop: full 9-column table; long names/notes wrap inside their column (2 lines, full text on hover).
  - Phone (<= 760px): no horizontal scroll. Shows Person, Amount, Returned, Pending and a status dot; given/due dates and the note appear under the name; actions sit behind a ⋮ menu or a left swipe on the row.
  - Borrower names are suggested from earlier loans (native datalist).
- **Swipe-left on rows (phones only)** (`frontend/row-actions.js`): swiping a row in Expenses, Credit Cards or Sweetie opens the same Update / Clone / Delete sheet as long-press or ⋮. Skipped when the table scrolls sideways. (GRV CC table is not covered yet.)
- **Form autocomplete** (`frontend/autocomplete.js`): suggests earlier descriptions/names in the Expenses, Credit Cards (Used By, Description, Remarks) and Sweetie forms. Additive layer, loaded after `script.js`; changes no data or logic.
- `frontend/sw.js` cache version is bumped whenever frontend files change (currently `expense-tracker-v23`).

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
