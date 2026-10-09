# Expense Tracker — GRV CC + Bills

## 🚀 TEST FIRST, THEN PUSH

Run these from the project folder:

```bash
node --check script.js
node --check export.js
node --check animation.js
python -m http.server 8765
```

Open:

```text
http://localhost:8765
```
git add .
git commit -m "..."
git pull --rebase origin main
git push origin main
Then stop the server with `Ctrl+C` and run:

```bash
git status
git diff --check
git add .
git diff --cached --check
git commit -m "COLOR FIX"
git pull --rebase origin main
git push origin main
```

> Never put passwords, API tokens, GitHub tokens, or Apps Script secrets in this repository.

---

## 1. Architecture

- **Credit Cards** is the only transaction-management tab: add, edit, clone and delete remain there.
- **GRV CC** is a personal transaction view of the same `Cards` sheet.
- GRV CC includes rows whose `Used By` is `GRV`, `GAURAV`, or `ME` (case-insensitive).
- GRV CC can change **payment status only**; it cannot create/edit/clone/delete transactions.
- `Cards` remains the single source of truth.

---

## 2. GRV CC changes

- Removed the GRV transaction-entry form.
- Removed Edit / Clone / Delete from GRV rows.
- Removed the `Used By` column from the GRV table and therefore from GRV exports.
- Added **＋ Add in Credit Cards**, which opens Credit Cards and pre-selects `Used By = GRV`.
- Kept row PAID/UNPAID toggle.
- Kept **Mark All Paid** for the current filtered view, using one bulk backend request.
- Added clickable monthly spend tiles; clicking a month filters the table to that month.
- Added clickable **Unpaid Bill by Card** tiles; clicking again clears the card filter.
- Added **Showing ₹X of ₹Y** under the filters.
- Added unpaid-row visual highlighting.
- GRV table uses the available width and remains horizontally scrollable on mobile.

---

## 3. Bills dashboard

The **💳 Bills** button opens a large modal immediately from locally cached card/config data, then refreshes silently from Apps Script.

Each configured card shows:

### Last statement
- Billing month
- Statement total
- Unpaid amount
- Due date
- Days left or overdue days
- My Share (`GRV` / `GAURAV` / `ME`)
- Others / owed to me
- One-click **Mark paid** for all unpaid transactions in that statement

### Open cycle
- Amount accumulated so far
- My Share
- Others / owed to me
- Cycle close date
- Days until close

### Utilisation
- Uses the configured card limit.
- Utilisation is based on open-cycle spend versus the card limit.

Cards are ordered by urgency: overdue unpaid cards first, then nearest due date, with cards that have nothing unpaid last and dimmed.

The Bills engine calculates cycle membership live from the transaction date and the **current cutoff**. It does not use the stored `BILLING MONTH` field to decide cycle membership.

For a cutoff of `20`:
- Open cycle before/on the 20th: `21st previous month → 20th current month`.
- After the 20th: the next open cycle starts on the 21st.
- The previous closed cycle becomes the last statement.

Calendar boundaries and shorter months are clamped safely.

---

## 4. CardConfig columns

Keep the existing columns and append these two columns:

```text
card | cutoff | limit | dueDay | dueMonthOffset
```

Example:

```text
AXIS-MYZONE | 20 | 50000 | 8 | 1
```

Meaning:
- `cutoff = 20`: statement closes on the 20th.
- `limit = 50000`: card limit is ₹50,000.
- `dueDay = 8`: bill is due on the 8th.
- `dueMonthOffset = 1`: due in the month after the statement month.

Defaults for old/missing values:
- `dueDay = 0` → due-date information is hidden.
- `dueMonthOffset = 0`.

Old localStorage card-config data remains compatible.

---

## 5. Backend safety

The shared Cards backend supports:

- `updateCard` — single-row edit instead of delete + add.
- `updateCardStatus` — single PAID/UNPAID toggle.
- `updateCardStatusBulk` — one request for multiple status updates.
- `LockService.getScriptLock()` around Card writes.
- Card history logging for Added, Updated, Deleted and Status Changed.

Do not remove or rename existing backend actions.

### Existing-history backfill

If the deployed Apps Script contains `backfillAllHistory()`, run it once from the Apps Script editor after deployment if you want older existing Card rows copied into the history sheet.

---

## 6. Test checklist

### Billing-cycle maths
For `cutoff = 20`, `dueDay = 8`, `dueMonthOffset = 1`:

1. **06-Oct-2026**
   - Last statement: `21-Aug-2026 → 20-Sep-2026`
   - Due date: `08-Oct-2026`
   - Open cycle: `21-Sep-2026 → 20-Oct-2026`

2. **20-Oct-2026**
   - Open cycle is still `21-Sep-2026 → 20-Oct-2026`.

3. **21-Oct-2026**
   - Last statement: `21-Sep-2026 → 20-Oct-2026`
   - Open cycle: `21-Oct-2026 → 20-Nov-2026`
   - Due date for that October statement: `08-Nov-2026`.

### Functional checks
- [ ] Bills opens instantly using cached data.
- [ ] Bills refreshes silently from the sheet.
- [ ] Overdue card shows `Overdue by N days` in red.
- [ ] Mark paid changes all unpaid rows in that statement using one bulk request.
- [ ] Mark All Paid changes only rows matching the current GRV filters.
- [ ] My Share includes only `GRV`, `GAURAV`, `ME`.
- [ ] Others is the remaining spend on the card.
- [ ] Unpaid Bill by Card tile filters the table; second click clears it.
- [ ] Monthly tile filters the table to that month.
- [ ] `+ Add in Credit Cards` opens Credit Cards and sets Used By to GRV.
- [ ] GRV has no Add/Edit/Clone/Delete transaction controls.
- [ ] GRV export has no Used By column.
- [ ] Mobile <=768px: Bills tiles stack and the modal scrolls.
- [ ] Light mode: cards, modal, buttons, table and unpaid highlights remain readable.
- [ ] Short months and year boundaries behave correctly.

### Static checks
```bash
node --check script.js
node --check export.js
node --check animation.js
git diff --check
```

Also confirm there are no references to removed GRV form IDs such as `grvCardSelect`, `grvCardDesc`, `addGrvCardBtn`, or `cancelGrvCardEditBtn`.

---

## 7. Deployment reminder

After changing `code.gs`, **create/deploy a new Apps Script version**. Editing the source file alone does not update the already deployed `/exec` version.

After deployment, test the live `/exec` endpoint with:
- Card sync
- Card edit
- PAID/UNPAID toggle
- Bulk Mark Paid
- Bills refresh

---

## 8. Files changed

### `index.html`
- GRV CC converted to a read-only transaction view.
- Added Bills modal and dashboard controls.
- Added mobile/light-mode CSS for the new UI.
- Removed GRV transaction-entry form.

### `script.js`
- Removed GRV add/edit/clone/delete logic.
- Added billing-cycle and due-date calculations.
- Added Bills rendering, sorting and bulk payment flow.
- Added cached CardConfig compatibility for `dueDay` and `dueMonthOffset`.
- Added HTML escaping for sheet-backed values inserted into `innerHTML`.
- Added clickable GRV monthly/card analysis tiles.

### `code.gs`
- Shared Cards backend uses locked single-row updates and bulk status updates.
- `getCardConfig` returns the complete CardConfig row, including appended due-date columns when present.
- Existing actions are preserved.

### `README.md`
- This test/deploy guide and feature documentation.

## Latest Card Management Update

### Add New Card
GRV CC now provides a single **Add New Card** flow for both billing configuration and CC Master data. Enter the card number/CVV **once** in the combined field (for example `4632 0200 0875 3184 / 082`). The app derives the plain card number for the `CC` sheet, while preserving the combined Number & CVV value for CC Master display.

Fields: Bank Name, Credit Card Name, Card Number / CVV, Expiry Date, Cutoff, Credit Limit, Due Day, Due Month Offset.

### Manage Cards / Delete
`⚙️ Manage Cards` is available inside GRV CC. Deleting a card removes its configuration from `CardConfig` and its matching row from `CC` Master. **Existing transaction rows in `Cards` are not deleted.** This prevents accidental loss of financial history.

The backend action is `deleteCardConfig` and uses `LockService`. Add/update uses the existing `upsertCardConfig` action, which keeps `CardConfig` and `CC` synchronized.

### CardConfig

Required columns:

```text
card | cutoff | limit | dueDay | dueMonthOffset
```

Example:

```text
HDFC-MILLENNIA | 18 | 160000 | 8 | 1
```

For a calendar-month cycle (1st through month-end), use `cutoff = 0`. `dueDay = 0` means due date is not configured. `dueMonthOffset = 0` means same statement month; `1` means next month.

## GRV CC — Add New Card

GRV CC now includes **+ Add New Card**. It creates/updates the shared `CardConfig` entry used by both Credit Cards and the Bills dashboard.

Fields:
- Card Name
- Cutoff (`0` = calendar-month cycle, 1–31 = statement cutoff day)
- Credit Limit
- Due Day (`0` = not configured)
- Due Month Offset (`0` = same month, `1` = next month)

CardConfig columns:
```text
card | cutoff | limit | dueDay | dueMonthOffset
```
Example:
```text
HDFC-MILLENNIA | 18 | 160000 | 8 | 1
```

The app keeps existing CardConfig rows compatible. If the sheet still has only the original three columns, saving a new card automatically appends the two new columns.

## Add New Card — Card Master + Billing Config

The **GRV CC → ＋ Add New Card** form now creates/updates the card in both places from one action:

- `CardConfig`: `card | cutoff | limit | dueDay | dueMonthOffset`
- `CC` (used by CC Master): `Bank Name | Credit Card Name | Number | Number & CVV | Exp Date`

The card name is the shared key. Existing Credit Cards and Bills automatically use the new card configuration.

Example:

```text
HDFC | MONEYBACK | 4632 0200 0875 3184 | 4632020008753184/082 | Jun-32
HDFC-MONEYBACK | 18 | 160000 | 8 | 1
```

> The CC master fields are stored in the protected `CC` sheet and are not written into the public frontend source.

## CardConfig columns

```text
card | cutoff | limit | dueDay | dueMonthOffset
```

## CC sheet columns

```text
Bank Name | Credit Card Name | Number | Number & CVV | Exp Date
```

## GRV CC Phase 1 UX Additions (2026-10-06)
- Due-alert banner on the GRV CC page for unpaid statements, sorted by urgency.
- Bills modal now supports bank statement amount matching against the app's last-statement total.
- GRV transaction table supports row selection and bulk Mark Selected Paid through the existing bulk backend action.
- Bills modal includes a Who Owes Me section for unpaid non-GRV spending in current statements.
- Bills open with a local skeleton while cached/local calculations are shown and the sheet refreshes silently.
- Empty states are explicit for cards and Who Owes Me.
- PAID/UNPAID toggles and selected-payment actions provide a 5-second Undo action.
- Bill tiles have enhanced card-like visual treatment while retaining the existing design language.

## Duplicate Transaction Warning

Credit Cards transaction entry now checks for a possible duplicate before saving. A warning is shown when the same **card + transaction date + amount + description + Used By** already exists. Editing the existing transaction does not flag itself as a duplicate. The user can cancel or explicitly choose to add the duplicate anyway.

