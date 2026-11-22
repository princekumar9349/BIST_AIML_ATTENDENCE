# Google Apps Script backend

This folder contains the backend API used by the Cloudflare UI. Deploy these files to the existing Apps Script project that owns the current `/exec` URL:

- `code.gs`
- `appsscript.json`
- `EMAIL_REPORTS_SETUP.md`

Run `setInitialHODPassword('hod', 'your-unique-password-of-12-or-more-characters')` from the Apps Script editor to initialize or reset the HOD credential. Then run `authorizeEmailReportAutomation`, deploy a new web app version, and keep the existing deployment URL. The password setup function is deliberately absent from the public API dispatch table.

Student sign-in requires enrollment number plus one shared 6-digit PIN per branch. HOD sets or resets the branch PIN at the top of the **Students** page while viewing any class in that branch. The same PIN works across that branch's semesters and sections; students do not have individual PINs.

## Training Head and Trainers

Two extra roles share the same backend:

- **TRAINING_HEAD** – creates trainer access, defines training sessions per class, and marks/views training attendance for every branch.
- **TRAINER** – signs in with their **email**. The Training Head assigns training sessions to them (in any number of branches), and they see and mark only those sessions. They never see regular subjects, student contacts, or class workbook links.

### One-time setup

1. Deploy the updated `code.gs` to the existing Apps Script project and publish a new web app version (keep the same `/exec` URL).
2. Run `setTrainingHeadPassword('traininghead@college.edu', 'a-strong-password-12+', 'Training Head Name')` from the Apps Script editor. The username can be an email address. This function is deliberately not part of the public API.
3. The Training Head signs in on the normal staff login, opens **Trainers**, enters the trainer's name and email, and sets/generates a password to hand over. Then, in **Sessions**, assigns the trainer to training sessions (any class or branch).

### How training attendance reaches the HOD

Training sessions are stored as subjects of type `TRAINING` (sheet tab prefix `TRAINING `) inside each class workbook, and saving them uses the same save/auto-compile path as regular attendance. The HOD **Master** sheet is rebuilt automatically and now contains:

| Column | Meaning |
| --- | --- |
| Training session columns, e.g. `Aptitude (Training)` | Sessions attended |
| `MAIN %` | Main subjects (plus extra-activity credit) over main classes held |
| `TRAINING %` | Training sessions attended over sessions held |
| `TOTAL` / `PERCENTAGE` | Combined main + training; this is the percentage used for the minimum-attendance highlight, defaulter emails and the student dashboard |

`MAIN %` and `TRAINING %` only appear once a class has at least one training session; without training the Master sheet is unchanged. The date-range report and Excel export include training the same way.

## Separate deployment and sharing with the HOD

This folder is the Training Head's **own** system: deploy `code.gs` as a new Apps Script web app in the Training Head's Google account and put its `/exec` URL in `lib/config.js` (or `NEXT_PUBLIC_GAS_URL` at build time). It does not share a backend with the HOD app.

Because there is no HOD here, the Training Head also owns **classes and students** (Classes tab: create class workbooks, add/import students). Use the same branch names, semesters, sections and enrollment numbers as the HOD so the Master sheet lines up.

To let the HOD compile training into their Master sheet: **Classes → Share with HOD**, enter the HOD's Google account email and press *Share*. This gives that account view-only access to every class workbook and to a **Training Attendance Share Registry** (only class names, workbook IDs and training sessions — never the Users sheet with logins). New classes are shared automatically. Send the registry link to the HOD, who links it in their Setup screen.

The first time, run `authorizeEmailReportAutomation` (or any function) once in the Apps Script editor so the Drive/Sheets sharing scopes are granted.

## Troubleshooting

- **Master sheet missing in a class workbook:** open **Training** (the report) for that class, or press **Rebuild Master Sheet**. The sheet is also rebuilt in the background every 10 minutes; the background trigger is installed automatically the first time you create a class or training session, or press *Share with HOD*.
- **Share with HOD fails:** the screen now lists every file that could not be shared, with Google's reason. Typical fixes:
  - the HOD address must be the Google account they open Sheets with; other addresses receive an invitation email that must be accepted;
  - after deploying a new `code.gs`, run any function once in the Apps Script editor (for example `authorizeEmailReportAutomation`) and accept the permissions, then press the button again.
- **HOD does not see training attendance:** check the HOD Setup screen — it shows which of your classes did not match (branch, semester and section must be spelled the same in both systems), then press **Pull Now**.
- **File names:** every class workbook here is named `Training Attendance - <Branch> - Sem <n> - Sec <x>` so it is never confused with the HOD's `Attendance - …` workbooks. Older workbooks are renamed automatically the next time you press *Share with HOD* (or create a class).

### What the HOD sees in their Google Drive

After **Share with HOD**, the HOD's **Shared with me** contains:

- **Training Attendance Share Registry** - opens on an **Overview** tab listing every class, its training sessions and a link to its workbook (plus the Classes and Subjects tabs the HOD app reads);
- one **Training Attendance - <Branch> - Sem <n> - Sec <x>** workbook per class, each with a sheet per training session (DSA, ...) and a finished **Master** sheet. Missing Master sheets are built while sharing.

The HOD then links the registry in their app, ticks the classes to pull, and compiles them into their own Master sheets.
