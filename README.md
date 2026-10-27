# GRV Expense Tracker

A personal finance Progressive Web App (PWA) for tracking monthly
expenses, salary, savings, credit-card spending and repayments, and
Sweetie-related transactions. The app is built primarily with HTML, CSS
and vanilla JavaScript, with Google Apps Script used for
spreadsheet-backed data operations.

> **Repository:** https://github.com/grvthakur/ExpenseGrv\
> **Default branch inspected:** `main`\
> **Documentation scope:** Based on the repository files inspected on 27
> October 2026. Exact features and deployment behavior may evolve with
> future commits.

## Contents

-   [Overview](#overview)
-   [Main areas](#main-areas)
-   [Expense and balance concepts](#expense-and-balance-concepts)
-   [Technology](#technology)
-   [Project structure](#project-structure)
-   [Data and synchronization](#data-and-synchronization)
-   [Run locally](#run-locally)
-   [Use on a phone](#use-on-a-phone)
-   [Deployment and updates](#deployment-and-updates)
-   [Testing and troubleshooting](#testing-and-troubleshooting)
-   [Security and data safety](#security-and-data-safety)
-   [Maintenance notes](#maintenance-notes)

## Overview

GRV Expense Tracker provides a single interface for recording and
reviewing personal finance activity. The interface includes desktop and
mobile layouts, month/year selection, summary cards, transaction tables,
filters, sorting, export options, theme controls and installable-app
metadata.

The app includes a service worker (`sw.js`) and web app manifest
(`manifest.json`) for Progressive Web App behavior. Its backend
integration uses Google Apps Script endpoints configured in the project.
Treat the connected spreadsheet/backend as the persistent source of
data; browser storage is also used for local state and continuity.

## Main areas

### 1. Expenses

The Expenses tab includes:

-   Monthly salary entry and editing.
-   Expense entry with date, category, description and amount.
-   Monthly/year selection and summary cards.
-   Transaction search, date-range filtering, clearing filters and
    sortable columns.
-   Editing, deleting and cloning transaction entries.
-   Syncing expense data from the connected sheet.
-   Exporting visible table data to supported formats.
-   Savings and remaining-balance summaries.

Categories are defined in the app and may include food and groceries,
transportation, personal, shopping, entertainment and leisure, dining
out, savings and investments, bill repayment, miscellaneous, received,
loan, sport, Sweetie Saving and Sweetie Borrow. Use the categories
provided by the current UI rather than assuming this list never changes.

### 2. Credit Cards

The Credit Cards tab supports card transaction tracking, including:

-   Adding, editing, deleting and cloning card transactions.
-   Card selection and transaction details.
-   Date/search filters and sortable columns.
-   Paid/unpaid status tracking and status filters.
-   Billing-month handling and card-related summaries.
-   Syncing card transactions.
-   Exporting transaction data.

Credit-card purchases and repayments can have different cash-flow and
statement-month implications. Review the app's current billing-month
logic before changing any calculation.

### 3. GRV CC

The GRV CC area provides a separate credit-card view with card-related
summaries, transaction filtering and management tools. It also includes
card configuration/master-data UI and related status, billing-month and
transaction actions.

### 4. Sweetie

The Sweetie tab has a separate transaction list and summary cards for
balance, saved and spent amounts. It supports entries such as SAVING,
CREDIT and DEBIT, plus search, month/date filtering, editing, syncing
and exports.

The main Expenses view also recognizes Sweetie-related categories and
has logic for excluding selected Sweetie Borrow entries from specific
expense calculations. Do not change these rules without testing their
effects on dashboard totals and balances.

### 5. Shared interface features

Depending on the current build, the shared UI includes:

-   Month/year selectors.
-   Light/dark theme switching.
-   Summary and version information.
-   AI Entry / transaction parsing workflow.
-   Export menus.
-   Responsive mobile styling and table scrolling.
-   PWA installation support.

## Expense and balance concepts

Financial totals depend on transaction category, date/month, credit-card
billing-month rules, and Sweetie-related handling. In particular:

-   A received amount, loan, saving, transfer-like entry or repayment
    may not behave like a normal expense.
-   Sweetie Borrow entries have app-specific treatment and should not be
    blindly added to or excluded from every total.
-   Credit-card purchase month and card-bill payment month may differ.
-   Exclusion controls can affect selected dashboard calculations
    without deleting the original transaction.

**Before modifying financial logic:** trace the relevant
render/calculation functions and verify totals against known examples.
Never "fix" a mismatch by silently changing or deleting transaction
records.

## Technology

-   **Frontend:** HTML, CSS and vanilla JavaScript.
-   **Backend/data integration:** Google Apps Script, with
    spreadsheet-backed operations.
-   **PWA:** Web app manifest and service worker.
-   **Charts/PDF support:** Chart.js and jsPDF-related libraries are
    referenced by the page.
-   **Parsing/entry helpers:** AI Entry module and supporting scripts.
-   **Version display:** `version.json` and version-related UI logic.

External libraries may be loaded through CDN URLs. A working internet
connection may be needed for those libraries and backend access.

## Project structure

Key files in the repository:

  ---------------------------------------------------------------------------
  File                                    Purpose
  --------------------------------------- -----------------------------------
  `index.html`                            Main UI, tab sections, table markup
                                          and substantial inline styling

  `script.js`                             Core app behavior, transaction
                                          operations, summaries, filters,
                                          syncing and tab logic

  `ai-entry.js`                           AI Entry and transaction
                                          parsing/review workflow

  `ai.gs`                                 Google Apps Script code associated
                                          with AI-related operations

  `code.gs`                               Main Google Apps Script backend
                                          code

  `history.gs`                            Apps Script history-related backend
                                          code

  `history.js`                            Browser-side history functionality

  `export.js`                             Export helpers

  `summary-plus.js`                       Additional summary/dashboard UI
                                          behavior

  `theme-switcher.js`                     Theme switching support

  `go-to-table.js`                        Go to Table button behavior

  `card-fix.js`                           Credit-card UI support/fixes

  `mobile-fix.js`                         Mobile UI support/fixes

  `animation.css`, `animation.js`         Visual effects

  `dropdown.css`, `dropdown.js`           Dropdown styling and behavior

  `config.txt`                            Backend endpoint configuration; do
                                          not publish sensitive values if
                                          this file changes

  `manifest.json`                         PWA name, display mode, start URL
                                          and icons

  `sw.js`                                 Service worker install, cache and
                                          request handling

  `version.json`                          Version label/hash/time displayed
                                          by the app

  `icons/`, `assets/`                     App icons and visual assets

  `tests/`                                Project test files

  `issuer_detection_regression_test.js`   Issuer-detection regression checks

  `shorthand-regression-test.js`          Shorthand parsing regression checks
  ---------------------------------------------------------------------------

Some older, backup or instructional files may also be present. Check
actual script references in `index.html` before renaming or removing a
file.

## Data and synchronization

The app communicates with a configured Google Apps Script web endpoint.
The frontend contains local persistence helpers as well as explicit sync
operations. The exact behavior depends on the operation and the current
code.

General guidance:

1.  Keep the Apps Script deployment URL/configuration correct for the
    intended environment.
2.  Confirm the web app deployment and spreadsheet permissions before
    diagnosing a sync failure.
3.  Test with a small, non-sensitive example where possible.
4.  Verify whether an operation writes to the backend, updates local
    state, or both.
5.  Do not share credentials, private spreadsheet links, API keys or
    real transaction exports in public issues or documentation.

`config.txt` may contain an endpoint URL. Review it before sharing a
repository snapshot outside its intended audience.

## Run locally

1.  Obtain the repository files on your computer.
2.  Open the project folder in VS Code.
3.  Use a local HTTP server such as the VS Code Live Server extension.
    Avoid relying on `file://` for PWA/service-worker testing.
4.  Open the local URL shown by the server.
5.  Check browser developer tools for failed network requests,
    JavaScript errors and service-worker messages.
6.  Confirm that backend sync works in the configured environment.

### Access from a phone on the same Wi-Fi

For a local Live Server session:

1.  Connect the phone and computer to the same Wi-Fi network.
2.  Find the computer's LAN IPv4 address with `ipconfig` on Windows.
3.  Open `http://<computer-ip>:<port>/index.html` on the phone, using
    the actual IP and port shown by your server.
4.  Allow the server through the appropriate private-network firewall
    prompt if needed.

This is for local testing only. The computer must remain on and the
local server running.

## Use on a phone

The manifest sets the app's display mode to `standalone`, which supports
an app-like Home Screen experience in compatible browsers.

On iPhone, open the deployed HTTPS website in Safari, use **Share → Add
to Home Screen**, and launch it from the new icon. Browser and iOS
behavior can vary; service-worker caching may affect how quickly a new
release appears.

## Deployment and updates

The repository is configured for a static web deployment (the repository
URL uses GitHub Pages). A typical update workflow is:

1.  Review and test changes locally.
2.  Verify that all referenced files and assets are included.
3.  Deploy/publish the intended branch using the repository's configured
    deployment workflow.
4.  Wait for deployment to finish.
5.  Open the deployed site in Safari/browser and reload.
6.  If the app still shows an older UI, check service-worker/cache
    behavior and the deployed version indicator.

The service worker currently uses a named cache and removes older caches
when a new worker activates. The app shell includes core files such as
the main page, script, styles/animations, manifest and version file. The
service worker prefers the network for `config.txt` and `version.json`,
falling back to cache when offline. Other same-origin GET requests are
network-first with cached fallback.

When changing files that must be refreshed by the service worker, review
the cache/update strategy carefully. A cache-name bump can force a fresh
cache, but it should be deliberate and tested. Do not clear all user
data or local storage just to refresh the UI.

## Testing and troubleshooting

Available regression test files include issuer-detection and
shorthand-parsing tests, plus the `tests/` directory. Run the test
commands documented by the actual files or project setup; do not assume
a package manager/build pipeline exists unless configuration confirms
it.

### Common issues

**Old version on iPhone** - Ensure the deployment completed. - Open the
deployed site in Safari and reload. - Check the version indicator. - If
still stale, investigate the service worker and cache version before
removing the Home Screen app.

**Sync does not work** - Confirm internet access and the configured Apps
Script deployment. - Check browser console/network errors. - Confirm
backend permissions and spreadsheet availability.

**Table is clipped on mobile** - Review the relevant mobile media
queries and table wrapper overflow. - Prefer a targeted column-width
adjustment over broad table rewrites. - Test horizontal scrolling and
row action buttons after changes.

**Totals do not match** - Confirm selected month/year and active
filters. - Check category-specific rules, excluded Sweetie Borrow
entries, savings/received handling, card billing months and repayment
treatment. - Compare the same set of transactions in the app and backend
before changing calculations.

**AI Entry parsing issue** - Test representative input formats,
including edge cases and ambiguous descriptions. - Verify the
review/edit flow and ensure parsed entries are not saved twice. - Keep
regression tests updated for fixes.

## Security and data safety

-   Do not commit secrets, API keys, authentication tokens or private
    credentials.
-   Treat `config.txt` and Apps Script deployment settings as
    potentially sensitive configuration.
-   Avoid putting real financial records in test fixtures, screenshots
    or public bug reports.
-   Review permissions for the Apps Script web app and connected
    spreadsheet.
-   Back up important data before significant backend or schema changes.
-   Never test destructive operations against live financial records
    without an explicit plan and backup.

## Maintenance notes

-   Keep documentation aligned with the current repository.
-   Make small, focused changes and review the diff before deployment.
-   Preserve existing transaction IDs, categories, date semantics,
    calculations and storage keys unless a migration is explicitly
    planned.
-   For UI-only changes, verify mobile and desktop layouts.
-   For parsing changes, run relevant regression tests.
-   For financial logic changes, validate totals with known examples and
    edge cases.
-   Keep GitHub changes, local edits and deployed production code
    clearly distinguished.

------------------------------------------------------------------------

*This README documents the inspected project structure and observed
behavior. It is not a guarantee that every feature has been exhaustively
tested. Verify the current code and backend configuration before making
production changes.*
