GRV Expense Tracker — mobile Appearance button positioning fix

What changed:
- Desktop positioning remains the same.
- On mobile (<=600px), Appearance moves from the bottom-right overlay to a 48x48 circular palette button near the top controls, immediately left of the existing info-button area.
- The long "🎨 Appearance" label is visually replaced with a palette icon on mobile.
- Theme panel opens below the circular button, with a viewport-bounded height.
- Very narrow screens (<=380px) receive a small horizontal adjustment.
- No transaction code, tab-bar markup, theme palettes, or existing info button was modified.

Important:
The vertical/horizontal placement is based on the supplied screenshot. Since the info button's exact selector and responsive position are not exposed in the standalone switcher, this uses a tuned mobile offset rather than attaching directly to that button. Check it on the target device; browser safe-area and header height can vary.

Testing:
- Node.js syntax check and ZIP integrity were run.
- A real mobile browser/device visual test was not available.
