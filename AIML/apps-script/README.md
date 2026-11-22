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

### If training attendance does not show up

1. **Setup → Training Attendance Link** must show the registry as linked with the branch ticked and **Save Branches** pressed.
2. Each branch lists how many classes matched and names any that did not (branch, semester and section must match exactly). Create or rename the class here to match.
3. The Training Head must have shared the registry **and** the class workbooks with this Google account; a "could not be read" warning appears above the Master table otherwise.
4. Press **Pull Now**. After linking, the 10-minute background refresh is installed automatically (no need to run `setupTriggers`), and opening a class Master report also checks for new training attendance and new training sessions straight away.
