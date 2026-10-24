GRV Expense Tracker — Theme Switcher dropdown fix

What changed:
- Removed the duplicate init() declaration that shadowed the first initializer.
- Fixed the dropdown builder so the theme list is actually created before it is appended.
- Kept one floating 🎨 Appearance button that opens/closes the theme panel.
- Kept theme selection buttons, active-state styling, saved theme preference, Escape-to-close,
  and outside-click-to-close behavior.
- Fixed invalid CSS font shorthand and added visible keyboard-focus outlines.
- Did not modify the app repository, index.html, transaction logic, or GitHub.

Local test:
1. Back up your local app files.
2. Load theme-switcher.js in the app using your existing local test method.
3. Click 🎨 Appearance: the panel should open; click again to close.
4. Select several themes and confirm the active button updates and the style persists after refresh.
5. Test Escape, outside click, Dark/Light toggle, and mobile viewport widths.

Verification:
- JavaScript syntax checked with Node.js.
- Static assertions and ZIP integrity checked.
- No live browser/app runtime test was available, so visual integration still needs local verification.
