# GRV Expense Tracker — Architecture

A vanilla JS / HTML / CSS **PWA** (no framework, no bundler) hosted on **GitHub Pages**, with a **Google Apps Script** web app as the backend and Google Sheets as the database.

```
Phone / Browser (PWA, frontend/)  ──HTTPS GET/POST (action=…)──►  Apps Script Web App (backend/)  ──►  Google Sheets
        ▲  localStorage cache, Service Worker                         doGet(e) router                    Expenses, Cards, CC, CardConfig,
        └──────────────────────── JSON ◄──────────────────────────── jsonOut()                           Salary, Sweetie, Summary, *History
```

## 1. Repository layout

| Path | What lives here |
|---|---|
| `index.html` (root) | Tiny redirect to `frontend/` (GitHub Pages entry). |
| `frontend/` | The whole static web app. Deploy this folder as-is. Entry: `frontend/index.html`. |
| `backend/` | Apps Script source, split by which Google Sheet project uses it (see §4). |
| `tests/` | Local, synthetic-data tests (`node tests/run-all.js`). |
| `docs/` | Release notes, file map, sheet classification, QA results. |
| `.github/workflows/version.yml` | Writes `frontend/version.json` (commit message / hash / time) on each push. |
| `README.md`, `CHANGELOG.md`, `INTEGRATION-NOTES.md` | Project docs / history. |

## 2. Frontend design rules (read before editing)

1. **`script.js` is the core.** Everything else is an **additive layer** loaded *after* it and talks to it through globals (`API_BASE`, `apiUrl`, `enc`, `esc`, `money`, `toast`, state arrays like `cardTxns`, render functions like `renderCards`). Do not rename these.
2. **No modules, no build.** Files are plain `<script src>` tags; load order in `index.html` matters (§3).
3. **Presentation changes go in CSS**, loaded late so they win. Many rules use `!important`/high specificity on purpose to override earlier inline styles in `index.html`.
4. **Money logic never lives in CSS/label code.** Status text (e.g. CREDIT/ADJUSTED) is display-only; stored `status` (`PAID`/`UNPAID`) drives totals, filters and "Mark All Paid".
5. **Cache busting:** bump `?v=` on the changed file's tag in `index.html` **and** `CACHE_NAME` in `sw.js` on every release.
6. Theme: `body.light-mode` class + `localStorage.theme`. Phones: `max-width: 768px`; desktop dense tables: `min-width: 1024px`.

## 3. Frontend files

### 3.1 Load order (`frontend/index.html`)

CDN libs: Chart.js, jsPDF, jsPDF-AutoTable →
Head CSS: `animation.css`, `dropdown.css`, `loan.css` → big inline `<style>` blocks → late CSS: `developer-dashboard.css`, `tables-enhanced.css`, `table-density.css`, `mobile-filters.css`, `premium-select.css` →
Scripts (bottom of body): `developer-monitor.js` → `state-machine.js` → **`script.js`** → `loan.js` → `developer-dashboard.js` → `card-fix.js` → `ai-entry.js` → `ai-orb.js` → `export.js` → `animation.js` → `row-actions.js` → `bill-extras.js` → `dropdown.js` → `premium-select.js` → `summary-plus.js` → `mobile-fix.js` → `autocomplete.js` → `go-to-table.js` → `theme-switcher.js` → `table-density.js`.

### 3.2 Core

| File | Purpose |
|---|---|
| `index.html` | Single page: topbar, 4 tabs (Expenses, Credit Cards, GRV CC, Sweetie) + Loans/Summary/CC Master/Developer modals, all markup and large inline CSS. |
| `script.js` (~8.3k lines) | The app. Sections in order: CONFIG (`API_BASE`) → table visual helpers → STATE → month keys → toast / loading / status banner → localStorage cache → date helpers & pickers → sheet write helpers → **tab switching** → card/user filters, date filters, **Mark All Paid** → **Expenses section** → **Credit Cards section** (add/edit/delete, status toggle, refund logic, `refundStatusView`) → **CC Master list** (card limits/config) → clone entries → init selectors → **theme toggle + daylight (pixel-world) toggle** → **BOOT** + safe event wiring → **GRV CC** personal card view → **GRV CC bills** → **Sweetie tracker**. |
| `state-machine.js` | App State Machine: mutual exclusion of panels, double-submit protection, modal stack, reactive events, universal form cancel. Loaded before `script.js`. |
| `sw.js` | Service worker: network-first for config/version, app-shell cache (`CACHE_NAME` = release number). |
| `manifest.json` | PWA manifest (name, icons, theme colour). |
| `version.json` | Auto-written by the GitHub Action; shown in the version info. |
| `icons/`, `assets/`, `loan-icon.png` | App icons, favicon sizes, Lakshmi logo. |

### 3.3 Feature modules (JS, loaded after `script.js`)

| File | Purpose |
|---|---|
| `loan.js` (+ `loan.css`) | Loans module: list, add, settle; uses app helpers. Backend: `loan.gs`. |
| `card-fix.js` | Manage Cards fix: Apps Script saves OK but browser can't read the reply, so after a network error it re-reads CardConfig to verify. Also CC-Master copy helper. |
| `ai-entry.js` (~2.7k lines) | AI Smart Entry: paste text/SMS → parse → fill the existing form → user reviews and presses Add. Also AI query UI. Backend: `aiParse` / `aiAsk`. |
| `ai-orb.js` | Floating AI orb button (design 0 glass orb, 1–7 line flowers; hold/double-click/right-click to switch). |
| `export.js` | Table export (csv / xls / doc / txt / pdf); skips blank-header (action) columns. |
| `summary-plus.js` | Summary modal v3 (charts/totals), additive over `script.js`. |
| `bill-extras.js` | Extras for the GRV CC Bills screen. |
| `autocomplete.js` | Type-ahead suggestions in the add forms (Expenses, Credit Cards, Sweetie, Loans). |
| `go-to-table.js` | "Go to Table" shortcut button (placement per tab). |
| `history.js` | Apps Script history code (Inserted/Updated/Deleted tracking). **Not loaded by `index.html`** — a copy of the backend file, see §6. |
| `theme-switcher.js` | Appearance menu: theme styles ("both" dark+light) and light/dark locking per style. Works with `applyTheme()` in `script.js`. |
| `animation.js` (+ `animation.css`) | Reveal-on-scroll animations; `.no-js` fallback keeps content visible if the script fails. |

### 3.4 UI behaviour / layout patches

| File | Purpose |
|---|---|
| `dropdown.js` / `dropdown.css` | Safe custom dropdown repair; re-populates card options that load late. |
| `premium-select.js` / `.css` | Premium popup for every native `<select>` (phone = bottom sheet, desktop = floating panel). |
| `row-actions.js` | Phone row actions: the ⋮ menu (`.ra-more`) on every table row. |
| `mobile-fix.js` | Phone-only (≤768px): collapsible filter toggle, Card-Details dropdown, remarks line under description, ordered filter layout. |
| `mobile-filters.css` | Tidy, ordered filter panel on all 4 tables (≤768px). |
| `table-density.js` / `.css` | "View Density" per table (Normal / Comfortable / Compact / Dense / Ultra) with saved default; custom dropdown; iOS `dd-mm-yyyy` hint on empty date inputs. |
| `tables-enhanced.css` | Table presentation only: Billing Month width, hover on touch, name-pill tints (desktop), amount/remarks text colours (desktop + phone), CREDIT/ADJUSTED badges. Delete a block to revert it. |

### 3.5 Developer tooling (frontend)

| File | Purpose |
|---|---|
| `developer-monitor.js` | Passive diagnostics (no payloads/amounts/SMS/card data); sends via `action=devLog`. |
| `developer-dashboard.js` / `.css` | Isolated Developer Dashboard UI (uses `API_BASE`). |
| `index.html.bak` | Old backup of `index.html` — not used. |

## 4. Backend (Apps Script)

Apps Script `.gs` files share one flat global namespace; the folders are only repo organisation (details: `docs/GS-SHEET-CLASSIFICATION.md`).

**API:** one web app, `doGet(e)` routes on `?action=`. Main actions: `get`, `getByMonth`, `add`, `updateExpense`, `delete`, `getSalary`/`setSalary`, `addCard`, `updateCard`, `updateCardStatus`(`Bulk`), `deleteCard`, `getCardsByMonth`, `getCardsByTxnMonth`, `getCCMaster`, `getCardConfig`/`upsertCardConfig`/`deleteCardConfig`, `payBill`, `settle`, `getSweetie`/`addSweetie`/`updateSweetie`/`deleteSweetie`, `aiParse`/`aiAsk`, `ver`, `devLog`.
**Sheets:** `Expenses`, `Cards`, `CC`, `CardConfig`, `Salary`, `Summary`, `Sweetie`, plus `Expenses/Cards/Sweetie History`.
Writes are fire-and-forget from the browser (`no-cors`); the app re-reads to confirm.

| File | Purpose |
|---|---|
| `backend/shared/code.gs` | **Main backend:** date/month normalisers, `doGet` router, all CRUD, card status/bill logic, summaries. |
| `backend/shared/ai.gs` | Universal AI query engine (LLM providers, `llmJson`, parsing/answering). Needs `code.gs`. |
| `backend/shared/developer-dashboard.gs` | One-time storage setup for diagnostic tabs. |
| `backend/shared/grv-financial-intelligence.gs` | Read-only deterministic facts for AI explanations. |
| `backend/shared/grv-production-readiness.gs` | Read-only production readiness check. |
| `backend/shared/grv-final-signoff.gs` | Consolidated read-only final sign-off. |
| `backend/expense-sheet/history.gs` | History tracking for Expenses/Cards/Sweetie. |
| `backend/expense-sheet/loan.gs` | Loans backend (hook into `doGet` after `action` is read). |
| `backend/expense-sheet/code.js` | **Test mirror** of `shared/code.gs` (no AI hooks). Not deployed. |
| `backend/ai-sheet/grv-ai-learning.gs` | AI learning sidecar (patterns/events) in the separate AI spreadsheet (`GRV_AI_LEARNING_SPREADSHEET_ID`). |
| `backend/ai-sheet/developer-engine.gs`, `developer-analyzer.gs`, `developer-source-analyzer.gs` | Developer Engine: diagnostics core, read-only AI log analyzer, source analyzer. Stored in the AI sidecar sheet. |

After any backend change: **Apps Script → Deploy → New version** (the frontend only sees the deployed version).

## 5. Tests (`tests/`)

`run-all.js` (full suite: calculations, AI parse/entry/query, `ai.gs`, regressions) · `browser-check.js` (real Chromium layout check, optional) · `harness.js` (shared harness) · `server-dup-test.js` (`code.js` in a vm with mocked Sheets) · `stress-test-parser.js`, `test-ai-aspects.js`, `shorthand-regression-test.js`, `issuer_detection_regression_test.js` (AI/SMS parser regressions) · `test-state-machine*.js` (state machine). Synthetic data only, no network.

## 6. Known caveats

- `backend/shared/code.gs` and `backend/expense-sheet/code.js` are copies — change both or tests drift from production.
- `frontend/history.js` is not loaded by `index.html` and differs slightly from `backend/expense-sheet/history.gs`; treat the `.gs` as the real one.
- `sw.js` `APP_SHELL` lists `table-density.css?v=1`, `index.html` links `?v=2`; keep the version strings in sync when bumping.
- `index.html.bak` and old `docs/*.patch|csv` are historical; safe to ignore.
- Fixed-look themes lock the light/dark toggle (`theme-switcher.js`); `#themeToggleBtn` is the pixel-world toggle container, not a `<button>`.

## 7. Release checklist

1. Edit the smallest set of files. 2. `node --check` each changed JS; `node tests/run-all.js`. 3. Bump `?v=` on changed tags and `CACHE_NAME` in `sw.js`. 4. Backend changed? Deploy a new Apps Script version. 5. Check phone (≤768px) **and** desktop.
