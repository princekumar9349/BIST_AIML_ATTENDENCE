# Google Apps Script backend

This folder contains the backend API used by the Cloudflare UI. Deploy these files to the existing Apps Script project that owns the current `/exec` URL:

- `code.gs`
- `appsscript.json`
- `EMAIL_REPORTS_SETUP.md`

Run `setInitialHODPassword('hod', 'your-unique-password-of-12-or-more-characters')` from the Apps Script editor to initialize or reset the HOD credential. Then run `authorizeEmailReportAutomation`, deploy a new web app version, and keep the existing deployment URL. The password setup function is deliberately absent from the public API dispatch table.

Student sign-in requires enrollment number plus one shared 6-digit PIN per branch. HOD sets or resets the branch PIN at the top of the **Students** page while viewing any class in that branch. The same PIN works across that branch's semesters and sections; students do not have individual PINs.

## Training attendance from the Training Head (HOD deployment)

The Training Head runs a completely separate system (own Google account, own Apps Script, own spreadsheets). This deployment only **reads** it:

1. The Training Head shares a *Training Attendance Share Registry* and the class workbooks with the HOD's Google account (view access).
2. In the HOD app open **Setup → Training Attendance Link**, paste the registry link, tick the **branches** to pull and press **Save Branches**.
3. Each class is matched to the Training Head's class by **branch + semester + section**, students by **enrollment number**. Its `TRAINING` sheets are merged into the Master sheet (training columns, `MAIN %`, `TRAINING %`, combined `PERCENTAGE`).
4. New training attendance is detected from the files' last-updated time: every ~10 minutes (the existing `autoCompile` trigger — run `setupTriggers` once after deploying), and immediately when a class Master report is opened. **Pull Now** forces it.

Nothing is ever written to the Training Head's files. If the workbook cannot be read (not shared, deleted) the Master sheet still compiles with main attendance and the report shows a warning.

Redeploy `code.gs` as a new web app version after updating. No new OAuth scopes are needed (Drive and Sheets are already authorised).
