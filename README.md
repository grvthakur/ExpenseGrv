# GRV Expense Tracker — AI parser candidate

This candidate was patched from the user-uploaded `Pasted text(20261025-155254).txt` snapshot, not from a verified complete GitHub checkout. Before replacing the repository file, compare it against the latest `grvthakur/ExpenseGrv` `main` branch.

## Changes
- Added a deterministic product-hint merge helper.
- A recognized person hint like `Grv Biryani` after a bank SMS is treated as description/product context, not an inferred remark.
- Removed heuristic remark assignment from shorthand and offline fallback paths.
- Explicit `Remarks: ...` labels continue to be applied through `labelHint` / `applyLab`.
- Kept existing local-first parsing, SMS parsing, AI fallback, and review/save workflow.

## Verification
- Syntax check and targeted source assertions are reported in the chat.
- Browser/runtime integration and full project regression tests were not run.
