GRV Expense Tracker - tests (local only, synthetic data, no network)

One time:   cd tests && npm i --no-save jsdom        (optional for browser-check: npm i --no-save playwright)
Run all:    node tests/run-all.js                    (calculations, savings cards, mask, AI parse/entry/query, ai.gs, regression scripts)
Browser:    node tests/browser-check.js [shotsDir]   (real Chromium: no zero flash, Total Saving timing, 360/390/768/1280px layout)

A test marked KNOWN states the correct behaviour of a bug that already exists in the repo; it is reported, not hidden.
