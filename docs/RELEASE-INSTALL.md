# Release / Deployment Notes

## A. Static frontend

This project is a static web app: `index.html` references local JavaScript/CSS files and does not use Apps Script HtmlService `include()` templates. Serve/deploy the complete contents of `frontend/` as one static site directory, preserving relative paths. Entry point: `frontend/index.html`.

If the frontend is currently hosted from GitHub Pages, Cloudflare Pages, or another static host, point that host's build/output directory to `frontend/`. Do not upload only `index.html`; include `icons/`, `manifest.json`, `sw.js`, all JS and CSS files.

## B. Apps Script backend — safe existing-project workflow

Apps Script `.gs` files have a flat global namespace. The repository folders are not deployable Apps Script subfolders.

1. Back up the existing bound Apps Script project and record its current deployment version.
2. Install clasp if needed: `npm install -g @google/clasp`.
3. Authenticate: `clasp login`.
4. Create a temporary deployment working directory outside `backend/`.
5. From that directory, clone the **existing** bound Apps Script project: `clasp clone YOUR_EXISTING_SCRIPT_ID`. This preserves the existing Script ID and manifest/config.
6. Run this repository's flatten helper from the project root:
   `powershell -ExecutionPolicy Bypass -File .\tools\flatten-appsscript.ps1 -OutputDirectory .\deploy\apps-script-source`
7. Copy the flattened `.gs` files from `deploy/apps-script-source/` into the cloned clasp project root. Do not copy any nested folders.
8. Keep the cloned project's existing `appsscript.json` and `.clasp.json`. Do not replace either with guessed values.
9. Review `clasp status`; confirm the expected `.gs` files are additions/updates and no unrelated files are being removed.
10. Only after approval, run `clasp push`. Then create a new Web App deployment version if required by the current deployment process.

The upload contains 11 `.gs` files. The helper checks duplicate filenames before flattening. It does not deploy or modify the live project.

## C. Manual Apps Script editor alternative

Open the existing bound Apps Script project. Add/update the 11 `.gs` files as separate script files in the project root. Paste each file's complete content. Apps Script will keep them in one flat namespace regardless of repository folder.

## D. Post-deployment smoke checks

- Run `grvProductionReadinessCheck()` and confirm `ok:true`, `failed:0`.
- Run `grvRunFinalSignOff()` and confirm `status:"PASS"`, `failed:0`.
- Open the production `/exec` endpoint's health route.
- Test one controlled preview and confirm no unexpected finance write.
- Verify Developer Dashboard and Learning Review load.
- Verify one normal expense, card and Sweetie workflow manually using a safe test process already approved for the production sheet.

## E. Rollback

1. Apps Script: Deploy > Manage deployments > Edit the active Web App deployment > select the previously recorded stable version > Update.
2. Static frontend: redeploy the previously backed-up frontend build/directory.
3. Do not restore an old finance spreadsheet backup over live data as a code rollback.
4. Re-run system health after rollback and reconcile any transactions created during the release window.

## F. Configuration files

No `appsscript.json` or `.clasp.json` was included in the uploaded ZIP. Do not invent them. Clone the existing bound script to retain the actual project ID and manifest. No root or test `package.json` was present; local tests ran using the preserved root `node_modules/`.
