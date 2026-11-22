// Per-deployment settings. The HOD app and the Training Head app are separate deployments
// with their own Apps Script backend, so this is the one file that differs between them.
export const VARIANT = "hod"; // "hod" | "training"

// Deployed Apps Script /exec URL. Set NEXT_PUBLIC_GAS_URL at build time to override.
export const GAS_URL =
  process.env.NEXT_PUBLIC_GAS_URL ||
  "https://script.google.com/macros/s/AKfycby-0YQ1TxBierr4-jyWk4BurGCspvFqjYojXbpgdhe_6gJjU5DvmyYjRgBJrKVQ58uy/exec";

export const GAS_CONFIGURED = !GAS_URL.includes("PASTE_");

export const DEPT_NAME = "Department of AIML";
export const HOD_NAME = "Dr. Rashmi Singh";
export const COLLEGE_NAME = "Bansal Institute of Science & Technology (BIST), Bhopal";
export const GROUP_NAME = "Bansal Group of Institutes (BGI)";
export const DEVLINK_URL = "https://devlinkhub.in";
export const APP_TITLE = "AIML Attendance";
export const STUDENT_PORTAL = true; // the Training Head app has no student sign-in
export const LOGIN_SUBTITLE = "Department of AIML (Artificial Intelligence & Machine Learning)";
export const LOGIN_HEAD_LABEL = "HOD";
export const LOGIN_HEAD_NAME = HOD_NAME;
export const STAFF_TAB_LABEL = "HOD / Faculty";
export const STAFF_USER_HINT = "Username or email";
export const DEPT_LINE = `Department of AIML (Artificial Intelligence & Machine Learning) • HOD: ${HOD_NAME}`;

// Cache lifetimes (ms). Reads show cached data instantly and refresh in the background after this.
export const TTL = {
  student: 5 * 60 * 1000,
  staff: 45 * 1000,
  roster: 5 * 60 * 1000,
  report: 45 * 1000,
  slow: 10 * 60 * 1000,
};
