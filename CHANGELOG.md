# Changelog

## 2026-11-07 — Loans modal mobile/desktop UI, swipe actions, form autocomplete

- Loans modal: real table on phones (no horizontal scroll, key columns only, dates and note under the name, status dot, ⋮ menu); desktop layout unchanged apart from wrapping long names/notes inside their column.
- Loans: rows sorted newest first by given date; all form fields share one common background card (phone and desktop); borrower autocomplete.
- Swipe-left on table rows (phones only) opens the row action sheet in Expenses, Credit Cards and Sweetie (`row-actions.js`).
- New `frontend/autocomplete.js` (datalist suggestions for Expenses, Credit Cards and Sweetie forms), loaded from `index.html` after `summary-plus.js`.
- `sw.js` cache bumped to `expense-tracker-v23` and `autocomplete.js` added to the app shell.
- No backend, data or business-logic changes. `docs/` evidence files (FILE-MAP, SHA256-MANIFEST, diffs) describe the v28 reorganization snapshot and are intentionally not edited.

## 2026-11-02 — v28 repository reorganization

- Reorganized frontend runtime files into `frontend/`, preserving relative script, stylesheet, manifest, icon and service-worker paths.
- Grouped Apps Script source files by actual spreadsheet access: `ai-sheet/`, `expense-sheet/`, and `shared/`.
- Preserved all original files, including `.git/`, `.github/`, `node_modules/`, backup files, and reference documents. Sanitized the embedded credential from `.git/config` while retaining its GitHub remote.
- Did not split or merge any `.gs` file.
- Updated only test path resolution in `tests/harness.js`, `tests/run-all.js`, and `tests/server-dup-test.js`.
- Added source-to-destination file map, sheet-touch evidence, release notes and flattening helper.
- Reorganized test result: 137 passed, 3 failed, 1 known issue, 2 fixed-but-still-flagged, 0 skipped (143 total), matching the pre-reorganization baseline exactly.
- Removed an embedded GitHub credential from `.git/config`; rotate/revoke that token. No exact token occurrence was found in repository history.
- Regression risk: Medium because the source snapshot's existing suite is not fully green; reorganization-specific path checks pass.
