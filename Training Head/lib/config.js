// Per-deployment settings. The HOD app and the Training Head app are separate deployments
// with their own Apps Script backend, so this is the one file that differs between them.
export const VARIANT = "training"; // "hod" | "training"

// Deployed Apps Script /exec URL of the TRAINING HEAD's own Apps Script project.
// Set NEXT_PUBLIC_GAS_URL at build time, or replace the placeholder below.
export const GAS_URL =
  process.env.NEXT_PUBLIC_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwkDFZ40Oat0VYNrYDnJp5Q-dpd9Lj7bjuzLLCyREaPrx9nLdNhq3rxf26ciKPUICkp/exec";
export const GAS_CONFIGURED = !GAS_URL.includes("PASTE_");

export const DEPT_NAME = "Training Department";
export const HOD_NAME = "Dr. Rashmi Singh";
export const COLLEGE_NAME = "Bansal Institute of Science & Technology (BIST), Bhopal";
export const GROUP_NAME = "Bansal Group of Institutes (BGI)";
export const DEVLINK_URL = "https://devlinkhub.in";
export const APP_TITLE = "Training Attendance";
export const DEPT_LINE = "Training Department • Training attendance for all branches";
export const STUDENT_PORTAL = false; // students do not sign in to the Training Head app
export const LOGIN_SUBTITLE = "Training Department — Training Attendance System";
export const LOGIN_HEAD_LABEL = "Portal";
export const LOGIN_HEAD_NAME = "Training Head & Trainers";
export const STAFF_TAB_LABEL = "Training Head / Trainer";
export const STAFF_USER_HINT = "Username or trainer email";

// Cache lifetimes (ms). Reads show cached data instantly and refresh in the background after this.
export const TTL = {
  student: 5 * 60 * 1000,
  staff: 45 * 1000,
  roster: 5 * 60 * 1000,
  report: 45 * 1000,
  slow: 10 * 60 * 1000,
};
