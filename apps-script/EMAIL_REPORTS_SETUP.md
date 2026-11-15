# Scheduled email attendance reports

The Next.js frontend is deployed to Cloudflare and calls the Google Apps Script web app as its API. Deploy only the files in this folder to the existing Apps Script project; the Cloudflare build does not deploy Apps Script code.

## One-time setup

1. Copy `code.gs` and `appsscript.json` from this folder into the existing Apps Script project used by `GAS_URL`.
2. In the Apps Script editor, run `setInitialHODPassword('hod', 'your-unique-password-of-12-or-more-characters')` once. This creates the initial HOD account or replaces an old default HOD password. The function is not exposed through the web API.
3. Run `authorizeEmailReportAutomation` and accept the Google permissions for mail, Sheets, Drive export, and triggers.
4. Deploy the Apps Script web app as a **new version**, preserving its existing `/exec` URL and access settings.
5. Sign into the Cloudflare app as HOD, open **Settings**, confirm the recipient (the Apps Script account email is filled in when available), optionally choose a sender alias, select the reports and send hour, then press **Save Report Settings**.

Report recipients are restricted to the Apps Script owner address by default. To permit another college domain, run `setAttendanceEmailDomains('your-college-domain.ac.in')` from the Apps Script editor before saving the report settings. Use the institution's real domain; the function is not exposed by the public API.

## Schedule

Triggers run in the Apps Script project time zone (`Asia/Kolkata`): daily at about 6 PM, weekly on Monday at about 6 PM for the previous Monday–Sunday, and monthly on the 1st at about 6 PM for the previous calendar month. Google may execute time-based triggers within a window around the selected hour.

Daily email lists present and absent students by class, subject, and lecture. Weekly Excel includes each attendance mark in the reporting period. Monthly email summarizes each student's overall marked-session attendance and attaches a complete class-wise Excel workbook. Monthly percentages use only sessions marked present or absent in that month; unmarked sessions are not counted.

To recreate all triggers after changing the Apps Script project, run `setupTriggers` from the Apps Script editor. Saving the recipient in HOD Settings also creates or refreshes the three report triggers.
HOD Settings lets you set the recipient, choose daily/weekly/monthly reports, select a shared send hour, save or pause the schedule, and send a test message.

For the first setup, run `setInitialHODPassword` and `authorizeEmailReportAutomation` in the Apps Script editor, then update the existing web app to a new version. Reload the Cloudflare app, open HOD Settings, save the report preferences, and use **Send Test Email** to verify delivery.

Before deploying the UI to Cloudflare, set the Apps Script Web App `/exec` URL in the `GAS_URL` constant near the top of `public/legacy.js`. The app does not store this URL in a browser setting. HOD Settings is used for email report configuration only.

Email is sent directly by `GmailApp` in the Apps Script project; the app does not use an external SMTP account or maintain an email queue. Google controls final delivery and can still delay or filter a message. The default sender is the Google account running the script. An optional sender ID must first be configured as a **Send mail as** alias on that account. Gmail App Passwords are not used or stored.

## Student contacts and defaulter reminders

Student email and phone are optional when adding one student or importing a CSV list. Existing student records remain valid without either field. The HOD can send reminders from the Master report's **Email Defaulters** action or use the checked-by-default option to send reminders after attendance is saved. The automatic option can be unchecked for an individual save, and its preference is remembered in that browser. Reminders go individually to students with a valid email address; phone numbers are stored as contact details and are not used for SMS or WhatsApp messages. If Gmail reports missing permission, run `authorizeEmailReportAutomation` in the Apps Script editor, approve Gmail access, and deploy a new web app version.

Student sign-in uses enrollment number plus one shared 6-digit PIN per branch. HOD sets or resets it at the top of the **Students** page while viewing any class in that branch. The same PIN works across the branch's semesters and sections. Changing the branch PIN ends existing student sessions. On first roster access after this update, old per-student PIN hashes are cleared from the student sheet.
