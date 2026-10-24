# GRV Expense Tracker — shorthand parsing fix

## Root cause
`shorthandHint()` required at least two non-empty lines. The canonical input `Grv, flpkrt axs, meethae from swiggy` is one line, so the helper returned `null` and the downstream parser retained only `SWIGGY`.

## Change
- Allow valid one-line shorthand in `ai-entry.js`.
- Keep existing card/person matching and `SOURCE - ITEM` formatting.
- `ai.gs` is included unchanged; this specific fix is client-side and does not require deploying `ai.gs`.

## Verification
- `node --check ai-entry.js`: passed.
- `ai.gs` copied to a `.js` filename and syntax-checked: passed.
- Focused helper tests: single-line canonical input and alternate item/merchant case passed. Multi-line remarks test did not meet the expected output, so remarks handling is not verified/fixed by this package.
- Browser end-to-end test was not run.

## Source baseline
Based on files uploaded in this conversation, not freshly synchronized from GitHub. No GitHub changes were made.
