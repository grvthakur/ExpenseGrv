# Changelog

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
