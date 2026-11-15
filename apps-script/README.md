# Google Apps Script backend

This folder contains the backend API used by the Cloudflare UI. Deploy these files to the existing Apps Script project that owns the current `/exec` URL:

- `code.gs`
- `appsscript.json`
- `EMAIL_REPORTS_SETUP.md`

Run `setInitialHODPassword('hod', 'your-unique-password-of-12-or-more-characters')` from the Apps Script editor to initialize or reset the HOD credential. Then run `authorizeEmailReportAutomation`, deploy a new web app version, and keep the existing deployment URL. The password setup function is deliberately absent from the public API dispatch table.

Student sign-in requires enrollment number plus one shared 6-digit PIN per branch. HOD sets or resets the branch PIN at the top of the **Students** page while viewing any class in that branch. The same PIN works across that branch's semesters and sections; students do not have individual PINs.
