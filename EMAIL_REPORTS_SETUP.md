# Scheduled email attendance reports

The Next.js frontend calls the existing Google Apps Script web app. Scheduled reports therefore need the updated `code.gs` and `appsscript.json` deployed to that same Apps Script project.

## One-time setup

1. Copy the updated `code.gs` into the Apps Script project used by `GAS_URL`. Add the `appsscript.json` manifest from this project (enable **Show `appsscript.json` manifest file** in Project Settings first if needed).
2. In the Apps Script editor, select and run `authorizeEmailReportAutomation`. Accept the requested Google permissions. This authorizes mail delivery, spreadsheet creation/export, and time-based triggers.
3. Deploy the web app as a **new version** while keeping its existing `/exec` URL and deployment access settings.
4. Sign into the app as HOD, open **Profile**, enter the recipient, optionally choose a sender alias, select the reports and send hour, then press **Save Report Settings**.

## Schedule

Triggers run in the Apps Script project time zone (`Asia/Kolkata`): daily at about 6 PM, weekly on Monday at about 6 PM for the previous Monday–Sunday, and monthly on the 1st at about 6 PM for the previous calendar month. Google may execute time-based triggers within a window around the selected hour.

Daily email lists present and absent students by class, subject, and lecture. Weekly Excel includes each attendance mark in the reporting period. Monthly email summarizes each student's overall marked-session attendance and attaches a complete class-wise Excel workbook. Monthly percentages use only sessions marked present or absent in that month; unmarked sessions are not counted.

To recreate all triggers after changing the Apps Script project, run `setupTriggers` from the Apps Script editor. Saving the recipient in the HOD Profile screen also creates or refreshes the three report triggers.
The HOD Profile screen now lets you set the recipient, choose daily/weekly/monthly reports, select a shared send hour, save or pause the schedule, and send a test message.

For the first setup, update the existing Apps Script web app to a new version and run `authorizeEmailReportAutomation` once from the Apps Script editor to grant the required Google permissions. Then reload the app, open HOD Profile, save the report preferences, and use **Send Test Email** to verify delivery.

The HOD Profile screen also has an **Apps Script Connection** section. Paste the deployed `/exec` URL, test it, then save it; the URL is stored in that browser. A changed URL reloads the app so it can reconnect.

Email is sent directly by `GmailApp` in the Apps Script project; the app does not use an external SMTP account or maintain an email queue. Google controls final delivery and can still delay or filter a message. The default sender is the Google account running the script. An optional sender ID must first be configured as a **Send mail as** alias on that account. Gmail App Passwords are not used or stored.

