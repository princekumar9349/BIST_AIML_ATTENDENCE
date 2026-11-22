/**
 * DEPARTMENT ATTENDANCE MANAGEMENT SYSTEM (v4.5 — ULTRA-FAST TURBO EDITION)
 * Roles : HOD (admin) | TRAINING_HEAD | TRAINER | TEACHER | STUDENT
 *
 * OPTIMIZATIONS ADDED:
 * 1. Instant GZIP Master Summary Cache (HOD Report loads in ~200ms instead of 5s)
 * 2. Workbook Handle Memoization (SS_MEMO_) - eliminates duplicate openById() calls
 * 3. Zero-overhead Attendance Sheet Load (syncs only when roster version changes)
 * 4. Single-Read Attendance Save (cuts save time in half)
 * 5. Built-in Cloudflare / Vercel REST API (doPost + batch support)
 */

const DEFAULT_MIN = 75;
const LEGACY_HASH_SALT = 'CHANGE-THIS-SALT-TEXT'; // Only used to migrate existing password hashes after a successful login.
const SESSION_SECONDS = 21600; // 6 hours
const LOGIN_MAX_FAILURES = 5;
const BRANCH_PIN_MAX_FAILURES = 30;
const LOGIN_LOCK_SECONDS = 600;
const REG_KEY = 'REG_ID_V4';
const RESERVED = ['students', 'master'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRAINING_ROLES = ['TRAINING_HEAD', 'TRAINER'];
const STAFF_ROLES = ['HOD', 'TEACHER', 'TRAINING_HEAD', 'TRAINER'];
const CLASS_ADMINS = ['HOD', 'TRAINING_HEAD'];   // In this separate deployment the Training Head owns classes and students.
const SHARE_REGISTRY_KEY = 'SHARE_REGISTRY_ID';  // Safe export (Classes + TRAINING subjects only) shared with the HOD account
const HOD_SHARE_EMAIL_KEY = 'HOD_SHARE_EMAIL';

let REG_ = null;
let MEMO_ = {};     // In-execution data cache
let SS_MEMO_ = {};  // In-execution Spreadsheet object cache
let LOCKED_ = false;

function doGet() {
  return ContentService.createTextOutput('Attendance API is online. Open the Cloudflare app to use the attendance system.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ================= CLOUDFLARE REST API ROUTER ================= */

function apiMethod_(name) {
  const methods = {
    resume, logout, login, studentLogin, changePassword,
    publicClasses, listClasses, createClass, renameClass,
    listTeachers, addTeacher, resetTeacherPassword, removeTeacher,
    getTrainingShare, setHodShareEmail, resyncTrainingShare, assignTrainer, rebuildTrainingMaster,
    listTrainers, addTrainer, resetTrainerPassword, removeTrainer, getTrainingSummary,
    listSubjects, addSubject, changeTeacher, updatePriorTotal,
    listStudents, addStudents, updateStudentContact, setBranchStudentPin, removeStudent,
    getAttendanceSheet, saveAttendance, getAbsentees,
    getSummary, getSummaryByDateRange, exportAttendanceRangeXlsx, forceRecompile, getSettings, setMinPercent,
    getMyAttendance, getEmailReportSettings, setEmailReportSettings,
    sendTestAttendanceEmail, sendDefaulterReminders
  };
  return Object.prototype.hasOwnProperty.call(methods, name) ? methods[name] : null;
}

function apiOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fn = body.fn;
    const args = body.args === undefined ? [] : body.args;
    if (!Array.isArray(args)) throw new Error('Invalid arguments');
    if (fn === 'batchCall') return apiOutput_({ ok: true, data: batchCall(args[0]) });
    const method = apiMethod_(fn);
    if (!method) throw new Error('Invalid function');
    return apiOutput_({ ok: true, data: method.apply(null, args) });
  } catch (err) {
    return apiOutput_({ ok: false, error: err.message || String(err) });
  }
}

/**
 * Ek hi network call me multiple functions run karne ke liye (cuts network latency)
 * calls = [{ fn: 'listClasses', args: [token] }, { fn: 'listTeachers', args: [token] }]
 */
function batchCall(calls) {
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > 10) throw new Error('Batch must contain between 1 and 10 calls');
  return calls.map(c => {
    try {
      if (!c || typeof c.fn !== 'string' || !Array.isArray(c.args || [])) throw new Error('Invalid batch call');
      if ((c.args || []).length > 20) throw new Error('A batch call has too many arguments');
      const method = apiMethod_(c.fn);
      if (!method) throw new Error('Invalid function');
      return { ok: true, data: method.apply(null, c.args || []) };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

/* ================= CORE HELPERS ================= */

function legacyHash_(p) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, LEGACY_HASH_SALT + p)
    .map(x => ('0' + (x & 0xff).toString(16)).slice(-2)).join('');
}
function hashPassword_(password, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(password))
    .map(x => ('0' + (x & 0xff).toString(16)).slice(-2)).join('');
}
function newSalt_() { return Utilities.getUuid() + Utilities.getUuid(); }
function safeSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^[\s\u0000]*[=+\-@]/.test(text) ? "'" + text : text;
}
function safeSheetRows_(rows) {
  return rows.map(row => row.map(value => typeof value === 'string' ? safeSheetText_(value) : value));
}
function norm_(s) { return String(s || '').trim().toUpperCase(); }
function numSort_(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }

function sortSheet_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 2) return;
  const rg = sh.getRange(2, 1, n, sh.getLastColumn());
  rg.setValues(safeSheetRows_(rg.getDisplayValues().sort((a, b) => numSort_(a[0], b[0]))));
}

function getMin_() {
  if (MEMO_.min) return MEMO_.min;
  let raw = cache_().get('min');
  if (raw === null) {
    raw = PropertiesService.getScriptProperties().getProperty('MIN_PERCENT') || '0';
    cache_().put('min', raw, 1800);
  }
  const v = Number(raw);
  MEMO_.min = v >= 1 && v <= 100 ? v : DEFAULT_MIN;
  return MEMO_.min;
}

function getSettings(token) { auth_(token, ['HOD']); return { min: getMin_() }; }

function setMinPercent(token, val) {
  auth_(token, ['HOD']);
  const v = Number(val);
  if (!(v >= 1 && v <= 100)) throw new Error('1 se 100 ke beech number daalo');
  PropertiesService.getScriptProperties().setProperty('MIN_PERCENT', String(v));
  cache_().remove('min');
  MEMO_ = {};
  classes_().forEach(c => { markDirty_(c.id); bumpVer_(c.id); });
  return { min: v };
}

function reg_() {
  if (REG_) return REG_;
  const props = PropertiesService.getScriptProperties();
  let id = cache_().get('REG_FILE_ID') || props.getProperty(REG_KEY);
  if (id) {
    cache_().put('REG_FILE_ID', id, 21600);
    REG_ = SpreadsheetApp.openById(id);
    return REG_;
  }
  const ss = SpreadsheetApp.create('Attendance Master Registry');
  id = ss.getId();
  props.setProperty(REG_KEY, id);
  cache_().put('REG_FILE_ID', id, 21600);
  ss.getSheets()[0].setName('Classes').appendRow(['ClassId', 'Branch', 'Semester', 'Section', 'SpreadsheetId', 'URL', 'FileName']);
  ss.insertSheet('Users').appendRow(['Username', 'Name', 'Role', 'PasswordHash', 'PasswordSalt']);
  ss.insertSheet('Subjects').appendRow(['ClassId', 'Subject', 'SheetName', 'Teacher', 'Type', 'PriorTotal']);
  ss.insertSheet('Audit').appendRow(['Timestamp', 'Actor', 'Role', 'ClassId', 'Subject', 'Date', 'Session', 'Present', 'Absent', 'Missing']);
  REG_ = ss;
  return ss;
}

function rows_(name) {
  const k = 'reg:' + name;
  if (MEMO_[k]) return MEMO_[k];
  let v = cget_(k);
  if (!v) {
    v = reg_().getSheetByName(name).getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
    cput_(k, v, 900); // Cached for 15 mins (invalidated immediately on write via bust_)
  }
  MEMO_[k] = v;
  return v;
}

/* ================= SPEED HELPERS: CACHE, LOCKS, DIRTY FLAGS ================= */

function cache_() { return CacheService.getScriptCache(); }
function cget_(k) { try { const v = cache_().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cput_(k, obj, sec) { try { const s = JSON.stringify(obj); if (s.length < 95000) cache_().put(k, s, sec || 600); } catch (e) {} }

function bust_() { MEMO_ = {}; cache_().removeAll(['reg:Classes', 'reg:Users', 'reg:Subjects']); }
function bustStudents_(classId) { delete MEMO_['stu_rows:' + classId]; cache_().remove('stu_rows:' + classId); }

function pack_(o) { return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(o))).getBytes()); }
function unpack_(s) { return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString()); }

function locked_(fn) {
  if (LOCKED_) return fn();
  const l = LockService.getScriptLock();
  l.waitLock(25000);
  LOCKED_ = true;
  try { return fn(); } finally { LOCKED_ = false; l.releaseLock(); }
}

function lockedSoft_(fn) {
  const l = LockService.getScriptLock();
  let got = false;
  try { got = l.tryLock(15000); } catch (e) {}
  try { return fn(); } finally { if (got) l.releaseLock(); }
}

function markDirty_(classId) { cache_().put('dirty:' + classId, '1', 21600); }
function ver_(classId) { return cache_().get('ver:' + classId) || 'v0'; }
function bumpVer_(classId) {
  const nv = Utilities.getUuid().slice(0, 8);
  cache_().put('ver:' + classId, nv, 21600);
  return nv;
}

function compileDirty_(budgetMs) {
  const t0 = Date.now();
  const cs = classes_();
  const got = cache_().getAll(cs.map(c => 'dirty:' + c.id));
  let n = 0;
  for (const c of cs) {
    if (!got['dirty:' + c.id]) continue;
    if (Date.now() - t0 > budgetMs) break;
    if (compileClassSafely_(c.id, true)) n++;
  }
  return n;
}

function compileClassSafely_(classId, clearDirty) {
  const l = LockService.getScriptLock();
  if (!l.tryLock(1000)) return;
  const leaseKey = 'compile-active:' + classId;
  try {
    if (cache_().get(leaseKey)) return false;
    cache_().put(leaseKey, '1', 600);
    if (clearDirty) cache_().remove('dirty:' + classId);
  } finally { l.releaseLock(); }
  try {
    compileClass_(classId);
    return true;
  } catch (e) {
    markDirty_(classId);
    return false;
  } finally { cache_().remove(leaseKey); }
}

function autoCompile() {
  return compileDirty_(240000);
}

function nightlyCompile() {
  const t0 = Date.now();
  classes_().forEach(c => { if (Date.now() - t0 < 300000) compileClassSafely_(c.id, false); });
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const f = t.getHandlerFunction();
    if (f === 'autoCompile' || f === 'nightlyCompile') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoCompile').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('nightlyCompile').timeBased().everyDays(1).atHour(2).create();
  const recipient = PropertiesService.getScriptProperties().getProperty(EMAIL_REPORT_RECIPIENT);
  if (recipient) installEmailReportTriggers_(emailReportSettings_());
  else ScriptApp.getProjectTriggers().forEach(t => {
    if (EMAIL_REPORT_HANDLERS.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  Logger.log('Attendance triggers set. Email report triggers require a saved report recipient.');
}

function label_(c) { return c.branch + ' • Sem ' + c.sem + ' • Sec ' + c.section; }
// Every workbook created here is named "Training Attendance - ..." so it is never confused with the
// HOD's own "Attendance - ..." workbooks once the two are shared with each other.
function fileName_(branch, sem, section) { return 'Training Attendance - ' + branch + ' - Sem ' + sem + ' - Sec ' + section; }

/** Renames older class workbooks (created as "Attendance - ...") to the Training Attendance naming. */
function renameWorkbooksToTrainingNames_() {
  let changed = 0;
  try {
    const sh = reg_().getSheetByName('Classes');
    const data = sh.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      const id = data[i][0], branch = data[i][1], sem = data[i][2], section = data[i][3], ssId = data[i][4], file = data[i][6];
      if (!id || !ssId) continue;
      const wanted = fileName_(branch, sem, section);
      if (file === wanted) continue;
      try {
        SpreadsheetApp.openById(ssId).rename(wanted);
        sh.getRange(i + 1, 7).setValue(wanted);
        changed++;
      } catch (e) { Logger.log('Could not rename workbook ' + ssId + ': ' + (e.message || e)); }
    }
    if (changed) bust_();
  } catch (e) { Logger.log('Workbook rename skipped: ' + (e.message || e)); }
  return changed;
}
function classes_() {
  return rows_('Classes').map(r => ({ id: r[0], branch: r[1], sem: r[2], section: r[3], ssId: r[4], url: r[5], file: r[6] }));
}
function cls_(id) {
  const c = classes_().find(x => x.id === id);
  if (!c) throw new Error('Class not found');
  return c;
}
/** Memoized Spreadsheet open — prevents opening the same workbook multiple times in 1 execution */
function ss_(classId) {
  if (SS_MEMO_[classId]) return SS_MEMO_[classId];
  const ss = SpreadsheetApp.openById(cls_(classId).ssId);
  SS_MEMO_[classId] = ss;
  return ss;
}

/* ================= SESSIONS ================= */

function sessionPrincipal_(user) {
  return user.role === 'STUDENT'
    ? 'STUDENT:' + user.classId + ':' + user.username
    : user.role + ':' + user.username;
}

function sessionIndexKey_(principal) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, principal);
  return 'sess-index:' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function removeUserSessions_(userOrPrincipal, keepToken) {
  const principal = typeof userOrPrincipal === 'string' ? userOrPrincipal : sessionPrincipal_(userOrPrincipal);
  const key = sessionIndexKey_(principal);
  const props = PropertiesService.getScriptProperties();
  let tokens = [];
  try { tokens = JSON.parse(props.getProperty(key) || '[]'); } catch (e) {}
  const keep = [];
  tokens.forEach(token => {
    if (token === keepToken) keep.push(token);
    else cache_().remove('sess:' + token);
  });
  if (keep.length) props.setProperty(key, JSON.stringify(keep));
  else props.deleteProperty(key);
}

function verifyUserPassword_(row, password) {
  if (row[4]) return hashPassword_(password, row[4]) === row[3];
  return legacyHash_(password) === row[3];
}

function saveUserPassword_(sheet, rowNumber, password) {
  const salt = newSalt_();
  sheet.getRange(rowNumber, 4, 1, 2).setValues([[hashPassword_(password, salt), salt]]);
}

function ensureUserSaltColumn_(sheet) {
  if (sheet.getRange(1, 5).getDisplayValue() !== 'PasswordSalt') sheet.getRange(1, 5).setValue('PasswordSalt');
}

function loginAttemptKey_(principal) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(principal));
  return 'login-fail:' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function checkLoginLimit_(principal, maxFailures) {
  if (Number(cache_().get(loginAttemptKey_(principal)) || 0) >= (maxFailures || LOGIN_MAX_FAILURES))
    throw new Error('Too many sign-in attempts. Wait 10 minutes and try again.');
}

function recordLoginFailure_(principal) {
  const key = loginAttemptKey_(principal);
  const count = Number(cache_().get(key) || 0) + 1;
  cache_().put(key, String(count), LOGIN_LOCK_SECONDS);
}

function clearLoginFailures_(principal) { cache_().remove(loginAttemptKey_(principal)); }

function newSession_(user) {
  const token = Utilities.getUuid();
  cache_().put('sess:' + token, JSON.stringify(user), SESSION_SECONDS);
  const key = sessionIndexKey_(sessionPrincipal_(user));
  const props = PropertiesService.getScriptProperties();
  let tokens = [];
  try { tokens = JSON.parse(props.getProperty(key) || '[]'); } catch (e) {}
  tokens.push(token);
  while (tokens.length > 50) cache_().remove('sess:' + tokens.shift());
  props.setProperty(key, JSON.stringify(tokens));
  return { token, user };
}
function auth_(token, roles) {
  const s = cache_().get('sess:' + (token || 'x'));
  if (!s) throw new Error('Session expired, login again');
  const u = JSON.parse(s);
  if (roles && !roles.includes(u.role)) throw new Error('Not allowed');
  if (u.role === 'STUDENT') {
    const pinConfig = branchStudentPinConfig_(u.classId);
    if (!pinConfig || pinConfig.version !== u.pinVersion) throw new Error('Branch PIN changed. Sign in again with the current PIN.');
  }
  return u;
}
function resume(token) { return { token, user: auth_(token) }; }
function logout(token) {
  const key = 'sess:' + (token || 'x');
  const raw = cache_().get(key);
  if (raw) {
    try {
      const user = JSON.parse(raw);
      const principalKey = sessionIndexKey_(sessionPrincipal_(user));
      const props = PropertiesService.getScriptProperties();
      let tokens = [];
      try { tokens = JSON.parse(props.getProperty(principalKey) || '[]'); } catch (e) {}
      tokens = tokens.filter(value => value !== token);
      if (tokens.length) props.setProperty(principalKey, JSON.stringify(tokens));
      else props.deleteProperty(principalKey);
    } catch (e) {}
  }
  cache_().remove(key);
  return true;
}

function branchStudentPinKey_(branch) {
  const normalized = norm_(branch).replace(/\s+/g, ' ');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized);
  return 'BRANCH_STUDENT_PIN_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function branchLoginPrincipal_(branch) {
  return 'STUDENT_BRANCH_PIN:' + norm_(branch).replace(/\s+/g, ' ');
}

function branchStudentPinConfig_(classId) {
  let cls;
  try { cls = cls_(classId); } catch (e) { return null; }
  const key = branchStudentPinKey_(cls.branch);
  let config = null;
  try { config = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || 'null'); } catch (e) {}
  return config && config.hash && config.salt && config.version ? config : null;
}

function setBranchStudentPin(token, classId, pin) {
  auth_(token, ['HOD']);
  const cls = cls_(classId);
  pin = String(pin || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new Error('Branch PIN must be exactly 6 digits');
  const salt = newSalt_();
  const version = Utilities.getUuid();
  const config = { hash: hashPassword_(pin, salt), salt, version };
  PropertiesService.getScriptProperties().setProperty(branchStudentPinKey_(cls.branch), JSON.stringify(config));
  clearLoginFailures_(branchLoginPrincipal_(cls.branch));
  return 'Shared student PIN saved for the ' + cls.branch + ' branch. Students across its semesters and sections will use this PIN.';
}

function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  const principal = 'STAFF:' + username;
  checkLoginLimit_(principal);
  const users = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(users);
  const data = users.getDataRange().getDisplayValues();
  const rowIndex = data.findIndex((row, index) => index > 0 && String(row[0] || '').toLowerCase() === username);
  const row = rowIndex > 0 ? data[rowIndex] : null;
  const isDefaultHod = row && row[2] === 'HOD' && !row[4] && row[3] === legacyHash_('hod123');
  if (!row || isDefaultHod || !verifyUserPassword_(row, password)) {
    recordLoginFailure_(principal);
    throw new Error('Wrong username or password');
  }
  clearLoginFailures_(principal);
  if (!row[4]) { saveUserPassword_(users, rowIndex + 1, password); bust_(); }
  return newSession_({ role: row[2], username: row[0], name: row[1] });
}

function setInitialHODPassword(username, password) {
  username = String(username || 'hod').trim().toLowerCase();
  password = String(password || '');
  if (!/^[a-z0-9_.@+-]{3,}$/.test(username)) throw new Error('Username: min 3 letters/numbers (an email address is fine)');
  if (password.length < 12) throw new Error('Set a strong HOD password with at least 12 characters');
  const sheet = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sheet);
  const data = sheet.getDataRange().getDisplayValues();
  const rowIndex = data.findIndex((row, index) => index > 0 && row[2] === 'HOD');
  if (rowIndex > 0) {
    if (data.some((row, index) => index > 0 && index !== rowIndex && String(row[0] || '').toLowerCase() === username))
      throw new Error('That username is already assigned to another account');
    removeUserSessions_('HOD:' + data[rowIndex][0]);
    sheet.getRange(rowIndex + 1, 1, 1, 3).setValues([[safeSheetText_(username), safeSheetText_(data[rowIndex][1] || 'HOD'), 'HOD']]);
    saveUserPassword_(sheet, rowIndex + 1, password);
  } else {
    const salt = newSalt_();
    sheet.appendRow([safeSheetText_(username), 'HOD', 'HOD', hashPassword_(password, salt), salt]);
  }
  removeUserSessions_('HOD:' + username);
  bust_();
  return 'HOD credentials saved. Sign in with the new username and password.';
}

function studentLogin(classId, enrollment, pin) {
  enrollment = norm_(enrollment);
  pin = String(pin || '').trim();
  const principal = 'STUDENT:' + String(classId || '') + ':' + enrollment;
  checkLoginLimit_(principal);
  let c = null, student = null;
  try {
    c = cls_(classId);
    student = studentRows_(classId).find(row => row[0] === enrollment);
  } catch (e) {}
  const branchPrincipal = c ? branchLoginPrincipal_(c.branch) : '';
  if (branchPrincipal) checkLoginLimit_(branchPrincipal, BRANCH_PIN_MAX_FAILURES);
  const pinConfig = c && branchStudentPinConfig_(classId);
  const valid = student && pinConfig && /^\d{6}$/.test(pin) && hashPassword_(pin, pinConfig.salt) === pinConfig.hash;
  if (!valid) {
    recordLoginFailure_(principal);
    if (branchPrincipal) recordLoginFailure_(branchPrincipal);
    throw new Error('Could not sign in. Check your class, enrollment number, and 6-digit PIN, or contact the HOD.');
  }
  clearLoginFailures_(principal);
  return newSession_({ role: 'STUDENT', username: enrollment, name: student[1], classId, label: label_(c), pinVersion: pinConfig.version });
}

function changePassword(token, oldPass, newPass) {
  const u = auth_(token, STAFF_ROLES);
  newPass = String(newPass || '');
  if (newPass.length < 8) throw new Error('Password min 8 characters');
  const sh = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sh);
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === u.username) {
      if (!verifyUserPassword_(d[i], oldPass)) throw new Error('Old password is wrong');
      saveUserPassword_(sh, i + 1, newPass);
      removeUserSessions_(u, token);
      bust_(); return 'Password changed';
    }
  }
  throw new Error('User not found');
}

/* ================= CLASSES (Branch + Semester + Section) ================= */

function publicClasses() {
  return classes_().map(c => ({ id: c.id, branch: c.branch, sem: c.sem, section: c.section }));
}

function listClasses(token) {
  const u = auth_(token, STAFF_ROLES);
  let list = classes_();
  if (u.role === 'TEACHER') {
    const mine = rows_('Subjects').filter(r => r[3] === u.username).map(r => r[0]);
    list = list.filter(c => mine.includes(c.id));
  } else if (u.role === 'TRAINER') {
    const mine = rows_('Subjects').filter(r => r[4] === 'TRAINING' && isAssignedTo_(r, u)).map(r => r[0]);
    list = list.filter(c => mine.includes(c.id));
  }
  return list.map(c => ({ id: c.id, branch: c.branch, sem: c.sem, section: c.section, label: label_(c), url: u.role === 'TRAINER' ? '' : c.url, file: c.file }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function checkClassInput_(branch, sem, section, exceptId) {
  branch = String(branch || '').trim().replace(/\s+/g, ' ');
  sem = String(sem || '').trim();
  section = norm_(section);
  if (!branch) throw new Error('Branch ka naam daalo');
  if (!/^[1-8]$/.test(sem)) throw new Error('Semester 1 se 8 chuno');
  if (!section) throw new Error('Section daalo (jaise A)');
  if (classes_().some(c => c.id !== exceptId && c.branch.toLowerCase() === branch.toLowerCase() && c.sem === sem && c.section === section))
    throw new Error('Ye class pehle se bani hui hai');
  return { branch, sem, section };
}

function createClass(token, branch, sem, section) {
  auth_(token, CLASS_ADMINS);
  const v = checkClassInput_(branch, sem, section, '');
  const file = fileName_(v.branch, v.sem, v.section);
  const ss = SpreadsheetApp.create(file);
  const st = ss.getSheets()[0];
  st.setName('Students');
  st.getRange('A:F').setNumberFormat('@');
  st.getRange('A1:D1').setValues([['Enrollment No', 'Name', 'Email (Optional)', 'Phone (Optional)']]).setFontWeight('bold');
  st.setFrozenRows(1);
  const id = Utilities.getUuid().slice(0, 8);
  reg_().getSheetByName('Classes').appendRow([id, safeSheetText_(v.branch), v.sem, safeSheetText_(v.section), ss.getId(), ss.getUrl(), safeSheetText_(file)]);
  bust_();
  syncTrainingShare_(ss.getId());
  ensureCompileTriggers_();
  return listClasses(token);
}

function renameClass(token, classId, branch, sem, section) {
  auth_(token, CLASS_ADMINS);
  const v = checkClassInput_(branch, sem, section, classId);
  const c = cls_(classId);
  const file = fileName_(v.branch, v.sem, v.section);
  SpreadsheetApp.openById(c.ssId).rename(file);
  const sh = reg_().getSheetByName('Classes');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === classId) {
      sh.getRange(i + 1, 2, 1, 3).setValues([[safeSheetText_(v.branch), v.sem, safeSheetText_(v.section)]]);
      sh.getRange(i + 1, 7).setValue(file);
    }
  }
  bust_();
  syncTrainingShare_();
  return listClasses(token);
}

/* ================= TEACHERS (HOD) ================= */

function listTeachers(token) {
  auth_(token, ['HOD']);
  return rows_('Users').filter(r => r[2] === 'TEACHER').map(r => ({ username: r[0], name: r[1] }));
}

function addTeacher(token, username, name, password) {
  auth_(token, ['HOD']);
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,}$/.test(username)) throw new Error('Username: min 3 letters/numbers');
  if (!name || !String(name).trim()) throw new Error('Teacher ka naam daalo');
  if (!password || password.length < 8) throw new Error('Password min 8 characters');
  if (rows_('Users').some(r => r[0].toLowerCase() === username)) throw new Error('Username already exists');
  const sh = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sh);
  const salt = newSalt_();
  sh.appendRow([username, safeSheetText_(String(name).trim()), 'TEACHER', hashPassword_(password, salt), salt]);
  bust_();
  return listTeachers(token);
}

function resetTeacherPassword(token, username, newPass) {
  auth_(token, ['HOD']);
  if (!newPass || newPass.length < 8) throw new Error('Password min 8 characters');
  const sh = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sh);
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++)
    if (d[i][0] === username && d[i][2] === 'TEACHER') { saveUserPassword_(sh, i + 1, newPass); removeUserSessions_('TEACHER:' + username); bust_(); return 'Password reset'; }
  throw new Error('Teacher not found');
}

function removeTeacher(token, username) {
  auth_(token, ['HOD']);
  const us = reg_().getSheetByName('Users');
  const d = us.getDataRange().getDisplayValues();
  for (let i = d.length - 1; i >= 1; i--) if (d[i][0] === username && d[i][2] === 'TEACHER') { removeUserSessions_('TEACHER:' + username); us.deleteRow(i + 1); }
  const ss = reg_().getSheetByName('Subjects');
  const s = ss.getDataRange().getDisplayValues();
  for (let i = 1; i < s.length; i++) if (s[i][3] === username) ss.getRange(i + 1, 4).setValue('');
  bust_();
  return listTeachers(token);
}

/* ================= TRAINING HEAD & TRAINERS ================= */
/**
 * The Training Head creates TRAINER accounts (the trainer's email is the username) and then
 * assigns training sessions to them, exactly like the HOD assigns subjects to faculty. A trainer
 * can be assigned sessions in any number of branches; they only ever see and mark the sessions
 * assigned to them. Assignments are read live, so changes apply without a re-login.
 */

function branchKey_(branch) { return norm_(branch).replace(/\s+/g, ' '); }

/** HOD and Training Head see every class; a trainer only reaches classes holding a session assigned to them. */
function canAccessTrainingClass_(u, classId) {
  if (u.role === 'HOD' || u.role === 'TRAINING_HEAD') return true;
  if (u.role !== 'TRAINER') return false;
  return rows_('Subjects').some(r => r[0] === classId && r[4] === 'TRAINING' && isAssignedTo_(r, u));
}

/** Training sessions work like faculty subjects: a trainer only sees and marks sessions assigned to them. */
function isAssignedTo_(subjectRow, u) {
  return String(subjectRow[3] || '').toLowerCase() === String(u.username || '').toLowerCase();
}

function listTrainers(token) {
  auth_(token, ['TRAINING_HEAD']);
  const label = {};
  classes_().forEach(c => { label[c.id] = label_(c); });
  const subjects = rows_('Subjects').filter(r => r[4] === 'TRAINING');
  return rows_('Users').filter(r => r[2] === 'TRAINER')
    .map(r => ({
      email: r[0], username: r[0], name: r[1],
      assigned: subjects.filter(sr => isAssignedTo_(sr, { username: r[0] })).map(sr => ({ classId: sr[0], cls: label[sr[0]] || '', subject: sr[1] }))
    }));
}

function addTrainer(token, email, name, password) { return locked_(() => addTrainer_(token, email, name, password)); }
function addTrainer_(token, email, name, password) {
  auth_(token, ['TRAINING_HEAD']);
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid trainer email address');
  name = String(name || '').trim();
  if (!name) throw new Error('Enter the trainer name');
  password = String(password || '');
  if (password.length < 8) throw new Error('Password min 8 characters');
  if (rows_('Users').some(r => String(r[0]).toLowerCase() === email)) throw new Error('This email already has an account');
  const sh = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sh);
  const salt = newSalt_();
  sh.appendRow([safeSheetText_(email), safeSheetText_(name), 'TRAINER', hashPassword_(password, salt), salt]);
  bust_();
  return listTrainers(token);
}

function findTrainerRow_(sheet, email) {
  const d = sheet.getDataRange().getDisplayValues();
  email = String(email || '').trim().toLowerCase();
  for (let i = 1; i < d.length; i++) if (String(d[i][0]).toLowerCase() === email && d[i][2] === 'TRAINER') return i + 1;
  throw new Error('Trainer not found');
}

function clearTrainerAssignments_(email, shouldClear) {
  const sheet = reg_().getSheetByName('Subjects');
  const data = sheet.getDataRange().getDisplayValues();
  const target = String(email || '').trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === 'TRAINING' && String(data[i][3]).toLowerCase() === target && (!shouldClear || shouldClear(data[i][0]))) {
      sheet.getRange(i + 1, 4).setValue('');
    }
  }
}

/** Training Head assigns (or unassigns with an empty email) the trainer for one training session. */
function assignTrainer(token, classId, subject, email) {
  auth_(token, ['TRAINING_HEAD']);
  email = String(email || '').trim().toLowerCase();
  if (email) checkAssignableTrainer_(email, classId);
  const sheet = reg_().getSheetByName('Subjects');
  const data = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === classId && data[i][1] === subject && data[i][4] === 'TRAINING') {
      sheet.getRange(i + 1, 4).setValue(email);
      bust_();
      return email ? 'Trainer assigned' : 'Trainer unassigned';
    }
  }
  throw new Error('Training session not found');
}

function checkAssignableTrainer_(email, classId) {
  const row = rows_('Users').find(r => String(r[0]).toLowerCase() === email && r[2] === 'TRAINER');
  if (!row) throw new Error('Trainer not found');
  cls_(classId); // the class must exist
}

function resetTrainerPassword(token, email, newPass) {
  auth_(token, ['TRAINING_HEAD']);
  if (!newPass || String(newPass).length < 8) throw new Error('Password min 8 characters');
  const sh = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sh);
  saveUserPassword_(sh, findTrainerRow_(sh, email), String(newPass));
  removeUserSessions_('TRAINER:' + String(email).trim().toLowerCase());
  bust_();
  return 'Password reset';
}

function removeTrainer(token, email) {
  auth_(token, ['TRAINING_HEAD']);
  const sh = reg_().getSheetByName('Users');
  sh.deleteRow(findTrainerRow_(sh, email));
  clearTrainerAssignments_(email);
  removeUserSessions_('TRAINER:' + String(email).trim().toLowerCase());
  bust_();
  return listTrainers(token);
}

/**
 * Run once from the Apps Script editor to create or reset the Training Head login.
 * Deliberately NOT in apiMethod_, so it cannot be called from the public API.
 * Example: setTrainingHeadPassword('traininghead@college.edu', 'a-strong-password')
 */
function setTrainingHeadPassword(username, password, displayName) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!/^[a-z0-9_.@+-]{3,}$/.test(username)) throw new Error('Username: min 3 letters/numbers (an email address is fine)');
  if (password.length < 12) throw new Error('Set a strong password with at least 12 characters');
  const sheet = reg_().getSheetByName('Users');
  ensureUserSaltColumn_(sheet);
  const data = sheet.getDataRange().getDisplayValues();
  const rowIndex = data.findIndex((row, index) => index > 0 && row[2] === 'TRAINING_HEAD');
  const taken = data.some((row, index) => index > 0 && index !== rowIndex && String(row[0] || '').toLowerCase() === username);
  if (taken) throw new Error('That username is already assigned to another account');
  const name = String(displayName || '').trim() || 'Training Head';
  if (rowIndex > 0) {
    removeUserSessions_('TRAINING_HEAD:' + data[rowIndex][0]);
    sheet.getRange(rowIndex + 1, 1, 1, 3).setValues([[safeSheetText_(username), safeSheetText_(data[rowIndex][1] || name), 'TRAINING_HEAD']]);
    saveUserPassword_(sheet, rowIndex + 1, password);
  } else {
    const salt = newSalt_();
    sheet.appendRow([safeSheetText_(username), safeSheetText_(name), 'TRAINING_HEAD', hashPassword_(password, salt), salt]);
  }
  removeUserSessions_('TRAINING_HEAD:' + username);
  bust_();
  return 'Training Head credentials saved. Sign in with the new username and password.';
}

/* ================= SHARING TRAINING DATA WITH THE HOD ================= */
/**
 * The HOD runs a separate system and links to a "share registry" spreadsheet owned by this account.
 * It lists every class (branch, semester, section, workbook id) and its TRAINING subjects. It is a
 * separate file on purpose: the main registry holds the Users sheet with password hashes and must
 * never be shared. The HOD account gets viewer access to this share registry and to each class
 * workbook; the HOD's backend then reads the training attendance and compiles it into the Master sheet.
 */

function hodShareEmail_() { return PropertiesService.getScriptProperties().getProperty(HOD_SHARE_EMAIL_KEY) || ''; }

function shareRegistry_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(SHARE_REGISTRY_KEY);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { Logger.log('Share registry missing, recreating: ' + e); }
  }
  const ss = SpreadsheetApp.create('Training Attendance Share Registry');
  ss.getSheets()[0].setName('Classes').appendRow(['ClassId', 'Branch', 'Semester', 'Section', 'SpreadsheetId', 'URL', 'FileName']);
  ss.insertSheet('Subjects').appendRow(['ClassId', 'Subject', 'SheetName', 'Teacher', 'Type', 'PriorTotal']);
  props.setProperty(SHARE_REGISTRY_KEY, ss.getId());
  return ss;
}

/** Short, readable reason from an Apps Script or Drive API error. */
function errorText_(e) {
  return String((e && e.message) || e || 'Unknown error').replace(/^Exception:\s*/i, '').slice(0, 220);
}

/**
 * Gives `email` view-only access to one file. Tries Apps Script's own sharing first; if Google refuses
 * (for example the address is not a Google account), falls back to the Drive API, which sends an
 * invitation email instead. Never throws: returns { ok, error, via }.
 */
function shareFileWithEmail_(fileId, email) {
  if (!email) return { ok: true, via: 'none' };
  let firstError = '';
  try {
    DriveApp.getFileById(fileId).addViewer(email);
    return { ok: true, via: 'direct' };
  } catch (e) { firstError = errorText_(e); }
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions?sendNotificationEmail=true&supportsAllDrives=true', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true, via: 'invitation' };
    let message = '';
    try { message = JSON.parse(res.getContentText()).error.message; } catch (x) { message = res.getContentText(); }
    return { ok: false, error: errorText_(message) || ('Drive API error ' + code), via: 'invitation' };
  } catch (e) { return { ok: false, error: firstError || errorText_(e) }; }
}

/** Installs the background compile triggers once. Without them nothing rebuilds the Master sheets on a timer. */
function ensureCompileTriggers_() {
  try {
    const have = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    if (!have.includes('autoCompile')) ScriptApp.newTrigger('autoCompile').timeBased().everyMinutes(10).create();
    if (!have.includes('nightlyCompile')) ScriptApp.newTrigger('nightlyCompile').timeBased().everyDays(1).atHour(2).create();
    return true;
  } catch (e) {
    Logger.log('Could not install compile triggers: ' + errorText_(e));
    return false;
  }
}

/**
 * Rewrites the share registry from the main registry (cheap: two small tabs) and makes sure the HOD
 * can view it. Pass the id of a newly created class workbook to share it immediately.
 * Returns { ok, error, registry }; it never throws, so a sharing problem cannot block class or
 * session creation, but callers that care (the Share screen) show the reason.
 */
function syncTrainingShare_(newWorkbookId) {
  const out = { ok: true, error: '', registry: { ok: true, error: '' } };
  try {
    renameWorkbooksToTrainingNames_();
    const reg = shareRegistry_();
    const email = hodShareEmail_();
    const classRows = reg_().getSheetByName('Classes').getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
    const subjectRows = reg_().getSheetByName('Subjects').getDataRange().getDisplayValues().slice(1)
      .filter(r => r[0] && r[4] === 'TRAINING').map(r => [r[0], r[1], r[2], '', 'TRAINING', r[5]]);
    const write = (name, header, rows) => {
      const sh = reg.getSheetByName(name) || reg.insertSheet(name);
      sh.clearContents();
      const all = [header].concat(safeSheetRows_(rows));
      sh.getRange(1, 1, all.length, header.length).setNumberFormat('@').setValues(all);
    };
    write('Classes', ['ClassId', 'Branch', 'Semester', 'Section', 'SpreadsheetId', 'URL', 'FileName'], classRows.map(r => r.slice(0, 7)));
    write('Subjects', ['ClassId', 'Subject', 'SheetName', 'Teacher', 'Type', 'PriorTotal'], subjectRows);
    // A plain-language first tab so the HOD can see at a glance what is being shared.
    const sessionsOf = {};
    subjectRows.forEach(r => { (sessionsOf[r[0]] = sessionsOf[r[0]] || []).push(r[1]); });
    write('Overview', ['Class', 'Branch', 'Semester', 'Section', 'Training sessions', 'Workbook name', 'Open workbook'],
      classRows.map(r => [r[1] + ' • Sem ' + r[2] + ' • Sec ' + String(r[3]).toUpperCase(), r[1], r[2], r[3], (sessionsOf[r[0]] || []).join(', ') || '(none yet)', r[6], r[5]]));
    try {
      const overview = reg.getSheetByName('Overview');
      overview.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#0b3558').setFontColor('#ffffff');
      overview.setFrozenRows(1);
      overview.autoResizeColumns(1, 6);
      reg.setActiveSheet(overview);
      reg.moveActiveSheet(1);
    } catch (e) { Logger.log('Overview formatting skipped: ' + errorText_(e)); }
    if (email) {
      out.registry = shareFileWithEmail_(reg.getId(), email);
      if (newWorkbookId) shareFileWithEmail_(newWorkbookId, email);
    }
  } catch (e) {
    out.ok = false;
    out.error = errorText_(e);
    Logger.log('Training share sync failed: ' + out.error);
  }
  return out;
}

/**
 * Makes sure every class workbook that has training sessions already contains its Master sheet before the
 * HOD opens it. Time-boxed; whatever is left is finished by the background trigger.
 */
function buildMissingMasters_(budgetMs) {
  const t0 = Date.now();
  let built = 0;
  try {
    const withTraining = {};
    rows_('Subjects').forEach(r => { if (r[4] === 'TRAINING') withTraining[r[0]] = true; });
    classes_().forEach(c => {
      if (!withTraining[c.id] || Date.now() - t0 > budgetMs) return;
      try {
        if (!ss_(c.id).getSheetByName('Master')) { compileClass_(c.id); built++; }
      } catch (e) { Logger.log('Master build skipped for ' + c.id + ': ' + errorText_(e)); markDirty_(c.id); }
    });
  } catch (e) { Logger.log('Master build pass failed: ' + errorText_(e)); }
  return built;
}

function getTrainingShare(token) {
  auth_(token, ['TRAINING_HEAD']);
  const reg = shareRegistry_();
  return {
    registryUrl: reg.getUrl(),
    registryName: reg.getName(),
    hodEmail: hodShareEmail_(),
    classes: reg.getSheetByName('Classes') ? Math.max(0, reg.getSheetByName('Classes').getLastRow() - 1) : 0,
    sessions: reg.getSheetByName('Subjects') ? Math.max(0, reg.getSheetByName('Subjects').getLastRow() - 1) : 0
  };
}

/**
 * Saves the HOD's Google account and shares the registry plus every class workbook with it (view only).
 * Returns the share status with a per-file result so the screen can show exactly what failed and why.
 */
function setHodShareEmail(token, email) {
  auth_(token, ['TRAINING_HEAD']);
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Enter the HOD Google account email');
  PropertiesService.getScriptProperties().setProperty(HOD_SHARE_EMAIL_KEY, email);
  const sync = syncTrainingShare_();
  const workbooks = classes_().map(c => {
    const r = shareFileWithEmail_(c.ssId, email);
    return { label: label_(c), ok: r.ok, error: r.error || '', via: r.via || '' };
  });
  ensureCompileTriggers_();
  const info = getTrainingShare(token);
  info.mastersBuilt = buildMissingMasters_(90000);
  info.sync = sync;
  info.workbooks = workbooks;
  info.sharedWorkbooks = workbooks.filter(w => w.ok).length;
  info.failedWorkbooks = workbooks.filter(w => !w.ok).length;
  info.invited = workbooks.some(w => w.via === 'invitation') || sync.registry.via === 'invitation';
  return info;
}

function resyncTrainingShare(token) {
  auth_(token, ['TRAINING_HEAD']);
  const sync = syncTrainingShare_();
  const info = getTrainingShare(token);
  info.mastersBuilt = buildMissingMasters_(90000);
  info.sync = sync;
  return info;
}

/* ================= SUBJECTS & EXTRA ACTIVITIES ================= */

function listSubjects(token, classId) {
  const u = auth_(token, STAFF_ROLES);
  const lab = {};
  classes_().forEach(c => lab[c.id] = label_(c));
  if (u.role === 'TRAINER' && !canAccessTrainingClass_(u, classId)) throw new Error('This branch is not assigned to you');
  return rows_('Subjects')
    .filter(r => {
      if (u.role === 'HOD') return r[0] === classId;
      if (u.role === 'TRAINING_HEAD') return r[0] === classId && r[4] === 'TRAINING';
      if (u.role === 'TRAINER') return r[0] === classId && r[4] === 'TRAINING' && isAssignedTo_(r, u);
      return r[3] === u.username && r[4] !== 'TRAINING';
    })
    .map(r => ({ classId: r[0], cls: lab[r[0]] || '', subject: r[1], sheet: r[2], teacher: r[3], type: r[4] || 'CLASS', prior: Number(r[5]) || 0 }));
}

function addSubject(token, classId, subject, teacher, type, priorTotal) { return locked_(() => addSubject_(token, classId, subject, teacher, type, priorTotal)); }
function addSubject_(token, classId, subject, teacher, type, priorTotal) {
  const u = auth_(token, ['HOD', 'TRAINING_HEAD']);
  // The Training Head can only create TRAINING sessions; the HOD can create any type.
  type = u.role === 'TRAINING_HEAD' ? 'TRAINING' : (type === 'EXTRA' || type === 'TRAINING' ? type : 'CLASS');
  subject = String(subject || '').replace(/[\[\]\*\?\:\/\\]/g, '').trim();
  if (!subject) throw new Error('Naam daalo');
  if (/^[\s\u0000]*[=+\-@]/.test(subject)) throw new Error('Subject name cannot start with a formula character');
  if (RESERVED.includes(subject.toLowerCase())) throw new Error('Ye naam allowed nahi hai');
  const ss = ss_(classId);
  const sheetName = (type === 'EXTRA' ? 'EXTRA ' : type === 'TRAINING' ? 'TRAINING ' : '') + subject;
  if (ss.getSheetByName(sheetName)) throw new Error('Ye pehle se bana hua hai');
  // Subject lookups are by (class, name), so a name must be unique across regular, extra and training items.
  if (rows_('Subjects').some(r => r[0] === classId && String(r[1]).toLowerCase() === subject.toLowerCase()))
    throw new Error('A subject, activity or training session with this name already exists in this class');
  if (type === 'EXTRA') teacher = '';
  if (type === 'TRAINING') {
    teacher = String(teacher || '').trim().toLowerCase();
    if (teacher) checkAssignableTrainer_(teacher, classId);
  } else if (teacher && !rows_('Users').some(r => r[0] === teacher && r[2] === 'TEACHER')) throw new Error('Teacher not found');
  const sh = ss.insertSheet(sheetName);
  sh.getRange('A:B').setNumberFormat('@');
  sh.getRange('A1:C1').setValues([['Enrollment No', 'Name', 'Previous Count']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  syncSheet_(sh, ss, studentRows_(classId));
  reg_().getSheetByName('Subjects').appendRow([classId, safeSheetText_(subject), safeSheetText_(sheetName), teacher || '', type, Number(priorTotal) || 0]);
  bust_(); markDirty_(classId); bumpVer_(classId);
  syncTrainingShare_();
  if (type === 'TRAINING') ensureCompileTriggers_();
  return listSubjects(token, classId);
}

function changeTeacher(token, classId, subject, teacher) {
  auth_(token, ['HOD']);
  const sh = reg_().getSheetByName('Subjects');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++)
    if (d[i][0] === classId && d[i][1] === subject && d[i][4] !== 'EXTRA' && d[i][4] !== 'TRAINING') {
      sh.getRange(i + 1, 4).setValue(teacher || '');
      bust_(); return 'Teacher updated';
    }
  throw new Error('Subject not found');
}

/** HOD can update PriorTotal (total previous classes) anytime from app or API */
function updatePriorTotal(token, classId, subject, priorTotal) {
  const u = auth_(token, ['HOD', 'TRAINING_HEAD']);
  const sh = reg_().getSheetByName('Subjects');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === classId && d[i][1] === subject) {
      if (u.role === 'TRAINING_HEAD' && d[i][4] !== 'TRAINING') throw new Error('Not allowed');
      sh.getRange(i + 1, 6).setValue(Math.max(0, Number(priorTotal) || 0));
      bust_(); markDirty_(classId); bumpVer_(classId);
      syncTrainingShare_();
      return 'Prior total classes updated';
    }
  }
  throw new Error('Subject not found');
}

/* ================= STUDENTS ================= */

function studentRows_(classId) {
  const k = 'stu_rows:' + classId;
  if (MEMO_[k]) return MEMO_[k];
  let v = cget_(k);
  if (!v) {
    const sh = ss_(classId).getSheetByName('Students');
    v = sh.getLastRow() < 2 ? [] : sh.getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
    cput_(k, v, 900);
  }
  MEMO_[k] = v;
  return v;
}

function ensureStudentSchema_(sheet) {
  const oldHeaders = sheet.getRange(1, 5, 1, 2).getDisplayValues()[0];
  if (oldHeaders[0] === 'PIN Hash' && oldHeaders[1] === 'PIN Salt') {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 5, lastRow - 1, 2).clearContent();
    sheet.getRange(1, 5, 1, 2).clearContent();
  }
  sheet.getRange('A1:D1').setValues([['Enrollment No', 'Name', 'Email (Optional)', 'Phone (Optional)']]).setFontWeight('bold');
  sheet.getRange('A:D').setNumberFormat('@');
}

function syncSheet_(sh, ss, stuRows, classId) {
  let stu = stuRows;
  if (!stu) {
    const cls = classId ? cls_(classId) : classes_().find(c => c.ssId === ss.getId());
    if (!cls) throw new Error('Could not resolve class for roster sync');
    stu = studentRows_(cls.id);
  }
  if (!stu.length) return;
  const lastR = sh.getLastRow();
  const have = lastR > 1 ? sh.getRange(2, 1, lastR - 1, 1).getDisplayValues().flat() : [];
  const haveSet = new Set(have);
  if (!stu.some(r => !haveSet.has(r[0]))) return;
  locked_(() => {
    const l2 = sh.getLastRow();
    const h2 = new Set(l2 > 1 ? sh.getRange(2, 1, l2 - 1, 1).getDisplayValues().flat() : []);
    const add = stu.filter(r => !h2.has(r[0])).map(r => [safeSheetText_(r[0]), safeSheetText_(r[1])]);
    if (add.length) { sh.getRange(l2 + 1, 1, add.length, 2).setValues(add); sortSheet_(sh); }
  });
}

function checkScope_(u, classId) {
  if (u.role === 'HOD' || u.role === 'TRAINING_HEAD') return;
  if (u.role === 'TRAINER') {
    if (!canAccessTrainingClass_(u, classId)) throw new Error('This branch is not assigned to you');
    return;
  }
  if (!rows_('Subjects').some(r => r[0] === classId && r[3] === u.username))
    throw new Error('Aapko is class me koi subject assign nahi hai');
}

function listStudents(token, classId) {
  const u = auth_(token, STAFF_ROLES);
  checkScope_(u, classId);
  ensureStudentSchema_(ss_(classId).getSheetByName('Students'));
  return studentRows_(classId).map(r => ({
    e: r[0],
    n: r[1],
    email: CLASS_ADMINS.includes(u.role) ? r[2] || '' : '',
    phone: CLASS_ADMINS.includes(u.role) ? r[3] || '' : ''
  })).sort((a, b) => numSort_(a.e, b.e));
}

function addStudents(token, classId, text) { return locked_(() => addStudents_(token, classId, text)); }
function addStudents_(token, classId, text) {
  const u = auth_(token, ['HOD', 'TEACHER', 'TRAINING_HEAD']);
  checkScope_(u, classId);
  const ss = ss_(classId);
  const sh = ss.getSheetByName('Students');
  ensureStudentSchema_(sh);
  const lastStudentRow = sh.getLastRow();
  const existing = lastStudentRow < 2 ? [] : sh.getRange(2, 1, lastStudentRow - 1, 4).getDisplayValues().filter(row => row[0]);
  const haveSet = new Set(existing.map(r => r[0]));
  const rows = [];
  let skipped = 0;
  String(text || '').split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    let p = line.split(/[,\t]/).map(s => s.trim());
    if (p.length < 2) { const m = line.match(/^(\S+)\s+(.+)$/); p = m ? [m[1], m[2]] : [line, '']; }
    const enr = norm_(p[0]);
    if (!enr || !p[1] || haveSet.has(enr)) { skipped++; return; }
    const email = String(p[2] || '').trim();
    const phone = String(p[3] || '').trim();
    if (String(p[4] || '').trim()) throw new Error('Student PIN is shared by the whole branch. Set it once in the HOD Students page.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; return; }
    if (phone && !/^\+?[0-9][0-9\s()-]{6,19}$/.test(phone)) { skipped++; return; }
    haveSet.add(enr);
    rows.push([safeSheetText_(enr), safeSheetText_(p[1]), safeSheetText_(email), safeSheetText_(phone)]);
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    sortSheet_(sh);
    bustStudents_(classId);
    const updatedStu = studentRows_(classId);
    rows_('Subjects').filter(r => r[0] === classId).forEach(r => {
      const s = ss.getSheetByName(r[2]);
      if (s) syncSheet_(s, ss, updatedStu);
    });
    markDirty_(classId); bumpVer_(classId);
  }
  return { added: rows.length, skipped };
}

function updateStudentContact(token, classId, enrollment, email, phone) {
  auth_(token, CLASS_ADMINS);
  email = String(email || '').trim();
  phone = String(phone || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid student email address');
  if (phone && !/^\+?[0-9][0-9\s()-]{6,19}$/.test(phone)) throw new Error('Enter a valid phone number');
  const sh = ss_(classId).getSheetByName('Students');
  ensureStudentSchema_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('Student was not found');
  const enrollments = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
  const index = enrollments.findIndex(value => norm_(value) === norm_(enrollment));
  if (index < 0) throw new Error('Student was not found');
  sh.getRange(index + 2, 3, 1, 2).setValues([[safeSheetText_(email), safeSheetText_(phone)]]);
  bustStudents_(classId);
  return 'Student contact details updated';
}

function removeStudent(token, classId, enrollment) { return locked_(() => removeStudent_(token, classId, enrollment)); }
function removeStudent_(token, classId, enrollment) {
  auth_(token, CLASS_ADMINS);
  const ss = ss_(classId);
  const del = sh => {
    const d = sh.getDataRange().getDisplayValues();
    for (let i = d.length - 1; i >= 1; i--) if (d[i][0] === enrollment) sh.deleteRow(i + 1);
  };
  removeUserSessions_('STUDENT:' + classId + ':' + norm_(enrollment));
  del(ss.getSheetByName('Students'));
  rows_('Subjects').filter(r => r[0] === classId).forEach(r => { const s = ss.getSheetByName(r[2]); if (s) del(s); });
  bustStudents_(classId); markDirty_(classId); bumpVer_(classId);
  return 'Student removed';
}

/* ================= FAST ATTENDANCE READ & WRITE ================= */

function checkSubject_(u, classId, subject) {
  const r = rows_('Subjects').find(x => x[0] === classId && x[1] === subject);
  if (!r) throw new Error('Subject not found');
  if (u.role === 'TEACHER' && (r[3] !== u.username || r[4] === 'TRAINING')) throw new Error('Ye subject aapko assign nahi hai');
  if (TRAINING_ROLES.includes(u.role)) {
    if (r[4] !== 'TRAINING') throw new Error('Only training sessions are available to this role');
    if (!canAccessTrainingClass_(u, classId)) throw new Error('This branch is not assigned to you');
    if (u.role === 'TRAINER' && !isAssignedTo_(r, u)) throw new Error('This training session is not assigned to you');
  }
  return r;
}

/**
 * FAST getAttendanceSheet:
 * Reads the entire sheet in 1 single getDataRange() call instead of running syncSheet_ first
 */
function getAttendanceSheet(token, classId, subject, date, sess) {
  const u = auth_(token, STAFF_ROLES);
  const sr = checkSubject_(u, classId, subject);
  const extra = sr[4] === 'EXTRA';
  const ss = ss_(classId);
  const sh = ss.getSheetByName(sr[2]);
  const stu = studentRows_(classId);
  if (!stu.length) return { rows: [], lecs: null, exists: false, extra };

  let lastRow = sh.getLastRow();
  // Only sync if row count doesn't match student count.
  if (lastRow - 1 < stu.length) {
    syncSheet_(sh, ss, stu);
    lastRow = sh.getLastRow();
  }

  const lastCol = Math.max(3, sh.getLastColumn());
  const heads = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  let col = -1, lecs = null;
  if (extra) {
    const pre = date + ' S' + sess + ' x';
    col = heads.findIndex((h, i) => i >= 3 && h.indexOf(pre) === 0);
    if (col > -1) lecs = Number(heads[col].slice(pre.length)) || null;
  } else {
    col = heads.indexOf(date + ' L' + sess);
  }
  const count = Math.max(0, lastRow - 1);
  const roster = count ? sh.getRange(2, 1, count, 2).getDisplayValues() : [];
  const marks = col > -1 && count ? sh.getRange(2, col + 1, count, 1).getDisplayValues() : [];
  return {
    rows: roster.map((r, i) => ({ e: r[0], n: r[1], s: marks[i] && marks[i][0] !== '' ? marks[i][0] : null })).filter(r => r.e),
    lecs, exists: col > -1, extra
  };
}

/**
 * FAST saveAttendance:
 * Uses 1 single read (getDataRange) and 1 single column write
 */
function saveAttendance(token, classId, subject, date, sess, lecs, marks) {
  return locked_(() => saveAttendance_(token, classId, subject, date, sess, lecs, marks));
}

function auditAttendance_(user, classId, subject, date, sess, counts) {
  const registry = reg_();
  let sheet = registry.getSheetByName('Audit');
  if (!sheet) {
    sheet = registry.insertSheet('Audit');
    sheet.appendRow(['Timestamp', 'Actor', 'Role', 'ClassId', 'Subject', 'Date', 'Session', 'Present', 'Absent', 'Missing']);
  }
  sheet.appendRow([new Date(), safeSheetText_(user.username), user.role, safeSheetText_(classId), safeSheetText_(subject), date, sess, counts.present, counts.absent, counts.missing]);
}

function saveAttendance_(token, classId, subject, date, sess, lecs, marks) {
  const u = auth_(token, STAFF_ROLES);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || reportDate_(date, 0) !== date) throw new Error('Choose a valid date');
  sess = Number(sess);
  if (!Number.isInteger(sess) || sess < 1 || sess > 8) throw new Error('Lecture or session number must be between 1 and 8');
  if (u.role === 'TEACHER' || u.role === 'TRAINER') {
    const today = reportToday_();
    if (date < reportDate_(today, -2) || date > today) throw new Error('Faculty can edit attendance only for today or the previous two days');
  }
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) marks = {};
  const sr = checkSubject_(u, classId, subject);
  const extra = sr[4] === 'EXTRA';
  if (extra && u.role !== 'HOD') throw new Error('Extra activity sirf HOD lagayegi');
  if (extra) {
    lecs = Number(lecs);
    if (!Number.isInteger(lecs) || lecs < 1 || lecs > 99) throw new Error('Max lectures must be between 1 and 99');
  }
  const ss = ss_(classId);
  const sh = ss.getSheetByName(sr[2]);

  const n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('Pehle students add karo');

  const heads = sh.getRange(1, 1, 1, Math.max(3, sh.getLastColumn())).getDisplayValues()[0];
  const enrollments = sh.getRange(2, 1, n, 1).getDisplayValues().map(r => r[0]);
  let header, prefix = '';
  if (extra) {
    prefix = date + ' S' + sess + ' x';
    header = prefix + lecs;
  } else {
    header = date + ' L' + sess;
  }

  let col = extra ? heads.findIndex((h, i) => i >= 3 && h.indexOf(prefix) === 0) + 1 : heads.indexOf(header) + 1;
  if (!col) {
    col = heads.length + 1;
  }

  const vals = new Array(n);
  let present = 0, absent = 0, missing = 0;
  for (let i = 1; i <= n; i++) {
    const enr = enrollments[i - 1];
    const hasMark = Object.prototype.hasOwnProperty.call(marks, enr) && marks[enr] !== null && marks[enr] !== '';
    if (!hasMark) { vals[i - 1] = ['']; missing++; continue; }
    if (extra) {
      const mark = Number(marks[enr]);
      if (!Number.isInteger(mark) || mark < 0 || mark > lecs) throw new Error('Extra activity marks must be whole numbers between 0 and Max Lectures');
      vals[i - 1] = [mark];
    } else {
      const m = String(marks[enr]);
      if (m !== 'A' && m !== 'P') throw new Error('Attendance mark must be P or A');
      vals[i - 1] = [m];
      if (m === 'P') present++;
      if (m === 'A') absent++;
    }
  }

  sh.getRange(1, col, n + 1, 1).setValues([[header]].concat(vals));
  markDirty_(classId);
  bumpVer_(classId);
  try { auditAttendance_(u, classId, subject, date, sess, { present, absent, missing }); }
  catch (e) { Logger.log('Attendance audit write failed: ' + (e.message || e)); }

  if (extra) return 'Saved: ' + n + ' students, ' + lecs + ' lecture(s)';
  return 'Saved: ' + present + ' present, ' + absent + ' absent, ' + missing + ' unmarked';
}

function sendDefaulterReminders(token, classId) {
  auth_(token, ['HOD']);
  const summary = getSummary(token, classId);
  const table = summary.table || [];
  if (table.length < 3) return { sent: 0, missingEmail: 0, failed: 0, defaulters: 0, minimum: summary.min };
  const percentageCol = table[0].findIndex(h => String(h).toUpperCase() === 'PERCENTAGE');
  if (percentageCol < 0) throw new Error('Attendance percentage is unavailable');

  const studentsByEnrollment = {};
  studentRows_(classId).forEach(row => { studentsByEnrollment[row[0]] = row; });
  const defaulters = table.slice(2).map(row => ({
    enrollment: String(row[1] || ''),
    name: String(row[2] || ''),
    percentage: row[percentageCol] === '' || row[percentageCol] == null ? NaN : Number(row[percentageCol])
  })).filter(student => student.enrollment && Number.isFinite(student.percentage) && student.percentage < Number(summary.min));
  const eligible = defaulters.map(student => Object.assign(student, {
    email: String((studentsByEnrollment[student.enrollment] || [])[2] || '').trim()
  }));
  const withEmail = eligible.filter(student => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email));
  if (!eligible.length) return { sent: 0, missingEmail: 0, failed: 0, defaulters: 0, minimum: summary.min, reason: 'No students are below the attendance threshold.' };
  if (!withEmail.length) return { sent: 0, missingEmail: eligible.length, failed: 0, defaulters: eligible.length, minimum: summary.min, reason: 'Add valid student email addresses in the Students tab.' };

  // The test-email path proves GmailApp.sendEmail is authorized. A quota-read
  // failure must not block that send attempt; report the sendEmail error instead.
  let remaining = withEmail.length;
  let quotaKnown = false;
  try {
    remaining = MailApp.getRemainingDailyQuota();
    quotaKnown = true;
  } catch (e) {
    Logger.log('Mail quota lookup failed; attempting reminder sends directly: ' + String(e.message || e));
  }
  const settings = emailReportSettings_();
  const options = { name: 'BIST AIML Attendance' };
  if (settings.senderEmail) options.from = settings.senderEmail;

  let sent = 0, failed = 0, firstError = '';
  withEmail.slice(0, quotaKnown ? remaining : withEmail.length).forEach(student => {
    const subject = 'Attendance Requirement Notice';
    const body = `Dear ${student.name},\n\nYour current overall attendance is ${student.percentage}%, which is below the department's minimum requirement of ${summary.min}%. You are advised to attend upcoming classes regularly to meet the required attendance criteria.\n\nEnrollment No: ${student.enrollment}\nDepartment: AIML\nBIST Bhopal`;
    const htmlBody = `<p>Dear ${htmlEscapeReport_(student.name)},</p><p>Your current overall attendance is <strong>${htmlEscapeReport_(student.percentage)}%</strong>, which is below the department's minimum requirement of <strong>${htmlEscapeReport_(summary.min)}%</strong>. You are advised to attend upcoming classes regularly to meet the required attendance criteria.</p><p><strong>Enrollment No:</strong> ${htmlEscapeReport_(student.enrollment)}<br><strong>Department:</strong> AIML<br>BIST Bhopal</p>`;
    try { GmailApp.sendEmail(student.email, subject, body, Object.assign({}, options, { htmlBody })); sent++; }
    catch (e) { failed++; if (!firstError) firstError = String(e.message || e).slice(0, 180); }
  });
  return {
    sent,
    missingEmail: eligible.length - withEmail.length,
    failed: failed + (quotaKnown ? Math.max(0, withEmail.length - remaining) : 0),
    defaulters: eligible.length,
    minimum: summary.min,
    reason: quotaKnown && remaining < withEmail.length ? 'Some messages were not sent because the Apps Script Gmail daily quota was reached.' : '',
    error: firstError
  };
}

/* ================= ABSENT LIST (TEACHER / HOD) ================= */

function getAbsentees(token, classId, date) {
  const u = auth_(token, STAFF_ROLES);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date chuno');
  if (u.role === 'TRAINER' && !canAccessTrainingClass_(u, classId)) throw new Error('This branch is not assigned to you');
  const ss = ss_(classId);
  const teachers = {};
  rows_('Users').forEach(r => teachers[r[0]] = r[1]);
  const blocks = [];
  rows_('Subjects')
    .filter(r => r[0] === classId && r[4] !== 'EXTRA' && (
      u.role === 'HOD' ||
      (u.role === 'TRAINING_HEAD' ? r[4] === 'TRAINING'
        : u.role === 'TRAINER' ? r[4] === 'TRAINING' && isAssignedTo_(r, u)
          : r[3] === u.username && r[4] !== 'TRAINING')))
    .forEach(sr => {
      const sh = ss.getSheetByName(sr[2]);
      if (!sh) return;
      const d = sh.getDataRange().getDisplayValues();
      for (let j = 3; j < d[0].length; j++) {
        const m = /^(\d{4}-\d{2}-\d{2}) L(\d+)$/.exec(d[0][j]);
        if (!m || m[1] !== date) continue;
        const absent = [];
        let total = 0;
        for (let i = 1; i < d.length; i++) {
          if (!d[i][0]) continue;
          total++;
          if (d[i][j] === 'A') absent.push({ e: d[i][0], n: d[i][1] });
        }
        absent.sort((a, b) => numSort_(a.e, b.e));
        blocks.push({ subject: sr[1], teacher: teachers[sr[3]] || '', training: sr[4] === 'TRAINING', lec: Number(m[2]), total, absent });
      }
    });
  blocks.sort((a, b) => a.lec - b.lec || a.subject.localeCompare(b.subject));
  return { label: label_(cls_(classId)), date, blocks };
}

/* ================= FAST MASTER SHEET COMPILER & CACHE ================= */

function sheetStats_(ss, sr) {
  const res = { total: Number(sr[5]) || 0, p: {} };
  const sh = ss.getSheetByName(sr[2]);
  if (!sh) return res;
  const extra = sr[4] === 'EXTRA';
  const d = sh.getDataRange().getDisplayValues();
  const heads = d[0];
  for (let j = 3; j < heads.length; j++) {
    if (extra) { const m = /x(\d+)$/.exec(heads[j]); res.total += m ? Number(m[1]) : 0; }
    else if (heads[j]) res.total++;
  }
  for (let i = 1; i < d.length; i++) {
    let c = Number(d[i][2]) || 0; // Column C = Previous Count
    for (let j = 3; j < heads.length; j++) c += extra ? (Number(d[i][j]) || 0) : (d[i][j] === 'P' ? 1 : 0);
    res.p[d[i][0]] = c;
  }
  return res;
}

function columnLetter_(column) {
  let label = '';
  while (column > 0) {
    const remainder = (column - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    column = Math.floor((column - 1) / 26);
  }
  return label;
}

/**
 * Builds the Master table shared by the all-time compile, the date-range report and the
 * Training summary. Subjects are split into three blocks: MAIN (regular class subjects),
 * TRAINING (marked by the Training Head / trainers) and EXTRA (HOD bonus activities).
 *
 *   TOTAL      = main present + training present + extra credit
 *   PERCENTAGE = TOTAL over (main classes held + training sessions held)   <- combined
 *   MAIN %     = (main present + extra credit) over main classes held       <- only when training exists
 *   TRAINING % = training present over training sessions held               <- only when training exists
 *
 * With no training subjects the table is identical to the previous main-only layout.
 * `stats` entries are { total, p: { enrollment: count } } as produced by sheetStats_.
 */
function masterTable_(students, cls, trn, ext, cs, ts, es, opts) {
  opts = opts || {};
  const hasTrn = trn.length > 0 && cls.length > 0 && opts.split !== false;
  const sum = list => list.reduce((a, b) => a + b, 0);
  const mainDenom = sum(cs.map(x => x.total));
  const trnDenom = sum(ts.map(x => x.total));
  const denom = mainDenom + trnDenom;
  const pct = (n, d) => d ? Math.round(Math.min(100, n * 100 / d) * 100) / 100 : '';

  const header = ['S.NO.', 'ENROLLMENT NO.', 'STUDENT NAME'].concat(
    cls.map(r => r[1]), trn.map(r => r[1] + ' (Training)'), ext.map(r => r[1]),
    hasTrn ? ['MAIN %', 'TRAINING %'] : [], ['TOTAL', 'PERCENTAGE']);
  const totals = ['', '', 'Total Classes'].concat(
    cs.map(x => x.total), ts.map(x => x.total), es.map(x => x.total || ''),
    hasTrn ? ['', ''] : [], [denom, denom ? 100 : opts.emptyPct === undefined ? 100 : opts.emptyPct]);
  const out = [header, totals];
  students.forEach((r, i) => {
    const c = cs.map(x => x.p[r[0]] || 0);
    const t = ts.map(x => x.p[r[0]] || 0);
    const e = es.map(x => x.p[r[0]] || 0);
    const total = sum(c) + sum(t) + sum(e);
    out.push([i + 1, r[0], r[1]].concat(c, t, e.map(v => v || ''),
      hasTrn ? [pct(sum(c) + sum(e), mainDenom), pct(sum(t), trnDenom)] : [],
      [total, pct(total, denom)]));
  });
  return { out, hasTrn };
}

function splitSubjects_(all) {
  return {
    cls: all.filter(r => r[4] !== 'EXTRA' && r[4] !== 'TRAINING'),
    trn: all.filter(r => r[4] === 'TRAINING'),
    ext: all.filter(r => r[4] === 'EXTRA')
  };
}

function compileClass_(classId) {
  const ss = ss_(classId);
  const parts = splitSubjects_(rows_('Subjects').filter(r => r[0] === classId));
  const cls = parts.cls, trn = parts.trn, ext = parts.ext;
  const stu = studentRows_(classId).sort((a, b) => numSort_(a[0], b[0]));
  const built = masterTable_(stu, cls, trn, ext,
    cls.map(r => sheetStats_(ss, r)), trn.map(r => sheetStats_(ss, r)), ext.map(r => sheetStats_(ss, r)));
  const out = built.out;
  const trainingCols = built.hasTrn ? 2 : 0;

  const sum = ss.getSheetByName('Master') || ss.insertSheet('Master');
  sum.clearContents();
  const W = out[0].length;
  sum.getRange(1, 2, out.length, 2).setNumberFormat('@');
  sum.getRange(1, 1, out.length, W).setValues(safeSheetRows_(out))
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sum.getRange(1, 3, out.length, 1).setHorizontalAlignment('left');
  sum.getRange(1, 1, 1, W).setBackground('#0b3558').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sum.getRange(2, 1, 1, W).setFontWeight('bold').setBackground('#eef2f7');
  sum.clearConditionalFormatRules();
  if (out.length > 2) {
    sum.getRange(3, W, out.length - 2, 1).setNumberFormat('0.00');
    if (trainingCols) sum.getRange(3, W - 3, out.length - 2, 2).setNumberFormat('0.00');
    const percentColumn = columnLetter_(W);
    const belowMinimum = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(ISNUMBER($' + percentColumn + '3),$' + percentColumn + '3<' + getMin_() + ')')
      .setBackground('#fee2e2').setFontColor('#b91c1c')
      .setRanges([sum.getRange(3, 1, out.length - 2, W)]).build();
    sum.setConditionalFormatRules([belowMinimum]);
  }
  sum.setFrozenRows(2);
  sum.setFrozenColumns(3);

  const result = { table: out, url: ss.getUrl() + '#gid=' + sum.getSheetId(), min: getMin_() };
  try { cache_().put('sum:' + classId + ':' + ver_(classId), pack_(result), 1800); } catch (e) {}
  return result;
}

/**
 * INSTANT getSummary:
 * Returns cached Master table in ~200ms if class version hasn't changed!
 */
function getSummary(token, classId) {
  auth_(token, ['HOD']);
  const k = 'sum:' + classId + ':' + ver_(classId);
  const dirty = cache_().get('dirty:' + classId);
  if (!dirty) {
    const hit = cache_().get(k);
    if (hit) {
      try { return unpack_(hit); } catch (e) {}
    }
  }
  cache_().remove('dirty:' + classId);
  return compileClass_(classId);
}

/** Per-subject stats limited to a date range. Same shape as sheetStats_, but without prior/previous counts. */
function rangeStats_(ss, sr, startDate, endDate) {
  const res = { total: 0, p: {} };
  const sh = ss.getSheetByName(sr[2]);
  if (!sh) return res;
  const isExtra = sr[4] === 'EXTRA';
  const data = sh.getDataRange().getDisplayValues();
  if (!data.length) return res;
  const cols = [];
  for (let j = 3; j < data[0].length; j++) {
    const header = data[0][j];
    const match = isExtra ? /^(\d{4}-\d{2}-\d{2}) S\d+ x(\d+)$/.exec(header) : /^(\d{4}-\d{2}-\d{2}) L\d+$/.exec(header);
    if (!match || match[1] < startDate || match[1] > endDate) continue;
    cols.push(j);
    res.total += isExtra ? Number(match[2]) || 0 : 1;
  }
  for (let i = 1; i < data.length; i++) {
    const enrollment = data[i][0];
    if (!enrollment) continue;
    let present = 0;
    cols.forEach(col => {
      const value = data[i][col];
      if (isExtra) present += Number(value) || 0;
      else if (value === 'P') present++;
    });
    res.p[enrollment] = present;
  }
  return res;
}

function getSummaryByDateRange(token, classId, startDate, endDate) {
  auth_(token, ['HOD']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') || startDate > endDate)
    throw new Error('Choose a valid start and end date');

  const ss = ss_(classId);
  const parts = splitSubjects_(rows_('Subjects').filter(r => r[0] === classId));
  const students = studentRows_(classId).sort((a, b) => numSort_(a[0], b[0]));
  const stats = list => list.map(sr => rangeStats_(ss, sr, startDate, endDate));
  const built = masterTable_(students, parts.cls, parts.trn, parts.ext, stats(parts.cls), stats(parts.trn), stats(parts.ext), { emptyPct: '' });

  const master = ss.getSheetByName('Master');
  return {
    table: built.out,
    url: master ? ss.getUrl() + '#gid=' + master.getSheetId() : ss.getUrl(),
    min: getMin_(),
    range: { start: startDate, end: endDate }
  };
}

/**
 * Training-only summary for the Training Head and trainers: the TRAINING sessions of one
 * class, with each student's present count and training percentage. HOD sees the same
 * data merged into the Master sheet.
 */
/**
 * URL of the class workbook's Master sheet, (re)building it when it is missing or training attendance
 * changed since the last build. The Master sheet in this system holds the training sessions only.
 */
function masterUrlFor_(classId, buildIfNeeded) {
  const ss = ss_(classId);
  let master = ss.getSheetByName('Master');
  if (buildIfNeeded && (!master || cache_().get('dirty:' + classId))) {
    cache_().remove('dirty:' + classId);
    try { return compileClass_(classId).url; }
    catch (e) { markDirty_(classId); Logger.log('Master build failed for ' + classId + ': ' + errorText_(e)); }
    master = ss.getSheetByName('Master');
  }
  return master ? ss.getUrl() + '#gid=' + master.getSheetId() : ss.getUrl();
}

/** Training Head: rebuild the Master sheet of one class workbook right now. */
function rebuildTrainingMaster(token, classId) {
  auth_(token, ['TRAINING_HEAD']);
  cls_(classId);
  ensureCompileTriggers_();
  cache_().remove('dirty:' + classId);
  bustStudents_(classId);
  const result = lockedSoft_(() => compileClass_(classId));
  return { url: result.url, students: Math.max(0, result.table.length - 2) };
}

function getTrainingSummary(token, classId) {
  const u = auth_(token, ['TRAINING_HEAD', 'TRAINER']);
  if (!canAccessTrainingClass_(u, classId)) throw new Error('This branch is not assigned to you');
  const ss = ss_(classId);
  const trn = rows_('Subjects').filter(r => r[0] === classId && r[4] === 'TRAINING' && (u.role !== 'TRAINER' || isAssignedTo_(r, u)));
  const students = studentRows_(classId).sort((a, b) => numSort_(a[0], b[0]));
  const built = masterTable_(students, [], trn, [], [], trn.map(r => sheetStats_(ss, r)), [], { emptyPct: '' });
  // Training-only table: show plain subject names (the "(Training)" suffix only helps in the HOD Master sheet).
  built.out[0] = built.out[0].map(h => String(h).replace(/ \(Training\)$/, ''));
  const result = { table: built.out, min: getMin_(), sessions: trn.length };
  if (u.role === 'TRAINING_HEAD') result.masterUrl = masterUrlFor_(classId, trn.length > 0);
  return result;
}

function exportAttendanceRangeXlsx(token, classId, startDate, endDate) {
  auth_(token, ['HOD']);
  const summary = getSummaryByDateRange(token, classId, startDate, endDate);
  const cls = cls_(classId);
  const fileName = ('Attendance ' + cls.branch + ' Sem ' + cls.sem + ' Sec ' + cls.section + ' ' + startDate + ' to ' + endDate)
    .replace(/[\\/:*?"<>|]/g, '_');
  const blob = xlsxReportBlob_(fileName, summary.table);
  return {
    fileName: blob.getName(),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: Utilities.base64Encode(blob.getBytes()),
    students: Math.max(0, summary.table.length - 2),
    range: summary.range
  };
}

/**
 * Call this when HOD manually edits 'Previous Count' or 'Extra Activity' inside Google Sheets
 */
function forceRecompile(token, classId) {
  auth_(token, ['HOD']);
  bust_();
  bustStudents_(classId);
  cache_().remove('dirty:' + classId);
  bumpVer_(classId);
  return compileClass_(classId);
}

/* ================= STUDENT VIEW ================= */

function warmClass_(classId) {
  const ss = ss_(classId);
  const ver = ver_(classId);
  const teachers = {};
  rows_('Users').forEach(r => teachers[r[0]] = r[1]);
  const all = rows_('Subjects').filter(r => r[0] === classId);
  const stu = studentRows_(classId);
  const res = {};
  stu.forEach(s => res[s[0]] = { subjects: [], extras: [], training: [] });

  all.forEach(sr => {
    const extra = sr[4] === 'EXTRA';
    const sh = ss.getSheetByName(sr[2]);
    const d = sh ? sh.getDataRange().getDisplayValues() : [['', '', '']];
    const heads = d[0];
    const rowOf = {};
    for (let i = 1; i < d.length; i++) if (d[i][0]) rowOf[d[i][0]] = d[i];
    stu.forEach(s => {
      const row = rowOf[s[0]];
      const out = { subject: sr[1], teacher: teachers[sr[3]] || '', p: row ? Number(row[2]) || 0 : 0, t: Number(sr[5]) || 0, pct: null, records: [] };
      for (let c = 3; c < heads.length; c++) {
        const v = row ? row[c] : '';
        if (extra) {
          const m = /x(\d+)$/.exec(heads[c]); const N = m ? Number(m[1]) : 0;
          out.t += N;
          if (row && v !== '') {
            const n = Number(v) || 0;
            out.p += n;
            out.records.push({ d: heads[c].replace(/ x\d+$/, ''), s: n + '/' + N, k: n >= N ? 'P' : n > 0 ? 'M' : 'A' });
          }
        } else {
          if (heads[c]) out.t++;
          if (v === 'P' || v === 'A') {
            if (v === 'P') out.p++;
            out.records.push({ d: heads[c], s: v, k: v });
          }
        }
      }
      out.records.reverse();
      out.pct = out.t ? Math.round(out.p * 1000 / out.t) / 10 : null;
      (extra ? res[s[0]].extras : sr[4] === 'TRAINING' ? res[s[0]].training : res[s[0]].subjects).push(out);
    });
  });

  const puts = {};
  Object.keys(res).forEach(e => { puts['stu:' + classId + ':' + ver + ':' + e] = pack_(res[e]); });
  const keys = Object.keys(puts);
  for (let i = 0; i < keys.length; i += 40) {
    const part = {};
    keys.slice(i, i + 40).forEach(k => part[k] = puts[k]);
    try { cache_().putAll(part, 600); } catch (e) {}
  }
  return res;
}

function getMyAttendance(token) {
  const u = auth_(token, ['STUDENT']);
  const key = 'stu:' + u.classId + ':' + ver_(u.classId) + ':' + u.username;
  const fromCache = () => { const h = cache_().get(key); if (!h) return null; try { return unpack_(h); } catch (e) { return null; } };
  let data = fromCache();
  if (!data) {
    data = lockedSoft_(() => fromCache() || warmClass_(u.classId)[u.username] || { subjects: [], extras: [], training: [] });
  }
  const subjects = data.subjects, extras = data.extras, training = data.training || [];
  // Overall matches the HOD Master PERCENTAGE: main + training classes held, plus extra-activity credit.
  const T = subjects.reduce((a, x) => a + x.t, 0) + training.reduce((a, x) => a + x.t, 0);
  const P = subjects.reduce((a, x) => a + x.p, 0) + training.reduce((a, x) => a + x.p, 0) + extras.reduce((a, x) => a + x.p, 0);
  return {
    user: u, min: getMin_(), p: P, t: T, subjects, extras, training,
    overall: T ? Math.round(Math.min(100, P * 100 / T) * 10) / 10 : null
  };
}

/* ================= SCHEDULED EMAIL ATTENDANCE REPORTS ================= */

const EMAIL_REPORT_RECIPIENT = 'ATTENDANCE_REPORT_EMAIL';
const EMAIL_REPORT_SETTINGS = 'ATTENDANCE_REPORT_SETTINGS';
const EMAIL_REPORT_ALLOWED_DOMAINS = 'ATTENDANCE_REPORT_ALLOWED_DOMAINS';
const EMAIL_REPORT_HANDLERS = ['sendDailyAttendanceReport', 'sendWeeklyAttendanceReport', 'sendMonthlyAttendanceReport'];

function allowedReportDomains_() {
  return String(PropertiesService.getScriptProperties().getProperty(EMAIL_REPORT_ALLOWED_DOMAINS) || '')
    .split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
}

function reportRecipientAllowed_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const domain = normalized.split('@')[1] || '';
  const allowedDomains = allowedReportDomains_();
  if (allowedDomains.length) return allowedDomains.includes(domain);
  let scriptOwner = '';
  try { scriptOwner = Session.getEffectiveUser().getEmail().toLowerCase(); } catch (e) {}
  return Boolean(scriptOwner && normalized === scriptOwner);
}

function setAttendanceEmailDomains(domains) {
  const values = String(domains || '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
  if (!values.length || values.some(domain => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)))
    throw new Error('Enter one or more valid email domains, separated by commas');
  PropertiesService.getScriptProperties().setProperty(EMAIL_REPORT_ALLOWED_DOMAINS, values.join(','));
  return 'Attendance report email domains saved: ' + values.join(', ');
}

function emailReportSettings_() {
  const props = PropertiesService.getScriptProperties();
  let saved = {};
  try { saved = JSON.parse(props.getProperty(EMAIL_REPORT_SETTINGS) || '{}'); } catch (e) {}
  let defaultEmail = '';
  try { defaultEmail = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  return {
    email: props.getProperty(EMAIL_REPORT_RECIPIENT) || saved.email || defaultEmail,
    defaultEmail,
    senderEmail: saved.senderEmail || '',
    daily: saved.daily !== false,
    weekly: saved.weekly !== false,
    monthly: saved.monthly !== false,
    hour: Number.isInteger(Number(saved.hour)) && Number(saved.hour) >= 0 && Number(saved.hour) <= 23 ? Number(saved.hour) : 18
  };
}

function getEmailReportSettings(token) {
  auth_(token, ['HOD']);
  const settings = emailReportSettings_();
  settings.senderAliases = GmailApp.getAliases();
  settings.enabled = ScriptApp.getProjectTriggers().some(t => EMAIL_REPORT_HANDLERS.includes(t.getHandlerFunction()));
  return settings;
}

function setEmailReportSettings(token, email, daily, weekly, monthly, hour, senderEmail) {
  auth_(token, ['HOD']);
  email = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid report email address');
  if (!reportRecipientAllowed_(email)) throw new Error('Report recipient must match an allowed college email domain. Configure the domain in Apps Script first.');
  hour = Number(hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Choose a valid report hour');
  senderEmail = String(senderEmail || '').trim();
  if (senderEmail && !GmailApp.getAliases().includes(senderEmail)) throw new Error('Sender ID must be an alias configured on the Apps Script owner Gmail account');
  const settings = { email, senderEmail, daily: daily === true, weekly: weekly === true, monthly: monthly === true, hour };
  const props = PropertiesService.getScriptProperties();
  props.setProperty(EMAIL_REPORT_RECIPIENT, email);
  props.setProperty(EMAIL_REPORT_SETTINGS, JSON.stringify(settings));
  installEmailReportTriggers_(settings);
  settings.enabled = settings.daily || settings.weekly || settings.monthly;
  return settings;
}

function sendTestAttendanceEmail(token) {
  auth_(token, ['HOD']);
  const settings = emailReportSettings_();
  if (!settings.email) throw new Error('Save a report recipient email first');
  if (!reportRecipientAllowed_(settings.email)) throw new Error('Report recipient must match an allowed college email domain. Configure the domain in Apps Script first.');
  const selected = [settings.daily && 'Daily', settings.weekly && 'Weekly', settings.monthly && 'Monthly'].filter(Boolean);
  const schedule = selected.length ? selected.join(', ') : 'No reports enabled';
  const options = {
    subject: 'Test email — BIST AIML Attendance Reports',
    name: 'BIST AIML Attendance'
  };
  if (settings.senderEmail) options.from = settings.senderEmail;
  GmailApp.sendEmail(settings.email, options.subject, `This is a test email from the BIST AIML Attendance system.\n\nRecipient: ${settings.email}\nEnabled reports: ${schedule}\nScheduled hour: about ${String(settings.hour).padStart(2, '0')}:00 (${Session.getScriptTimeZone()}).`, options);
  return { sent: true, email: settings.email };
}

function installEmailReportTriggers_(settings) {
  settings = settings || emailReportSettings_();
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (EMAIL_REPORT_HANDLERS.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  if (settings.daily) ScriptApp.newTrigger('sendDailyAttendanceReport').timeBased().everyDays(1).atHour(settings.hour).create();
  if (settings.weekly) ScriptApp.newTrigger('sendWeeklyAttendanceReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(settings.hour).create();
  if (settings.monthly) ScriptApp.newTrigger('sendMonthlyAttendanceReport').timeBased().onMonthDay(1).atHour(settings.hour).create();
}

// Run once in the Apps Script editor after updating the script to grant Gmail,
// Sheets, Drive export, and trigger permissions. HOD saves the destination in Setup.
function authorizeEmailReportAutomation() {
  // The Drive REST calls use ScriptApp.getOAuthToken(), so ensure this scope
  // has been granted before probing Drive or exporting report workbooks.
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  MailApp.getRemainingDailyQuota();
  GmailApp.getAliases();
  ScriptApp.getProjectTriggers();
  const driveResponse = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (driveResponse.getResponseCode() < 200 || driveResponse.getResponseCode() >= 300) {
    throw new Error('Drive API authorization failed (' + driveResponse.getResponseCode() + '): ' + driveResponse.getContentText().slice(0, 500) + '. Confirm Drive access is in appsscript.json, then rerun this function and grant the requested permission.');
  }
  return 'Email automation permissions are ready. Save the report email in the HOD Setup tab.';
}

function reportDate_(date, offset) {
  const parts = String(date).split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2] + (offset || 0), 12);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function reportToday_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function collectAttendanceRecords_(startDate, endDate) {
  const classes = classes_();
  const studentsByClass = {};
  const records = [];
  classes.forEach(c => {
    const students = studentRows_(c.id);
    studentsByClass[c.id] = students;
    const ss = ss_(c.id);
    rows_('Subjects').filter(sr => sr[0] === c.id && sr[4] !== 'EXTRA').forEach(sr => {
      const sh = ss.getSheetByName(sr[2]);
      if (!sh) return;
      const values = sh.getDataRange().getDisplayValues();
      if (!values.length) return;
      for (let col = 3; col < values[0].length; col++) {
        const match = /^(\d{4}-\d{2}-\d{2}) L(\d+)$/.exec(values[0][col]);
        if (!match || match[1] < startDate || match[1] > endDate) continue;
        for (let row = 1; row < values.length; row++) {
          const status = values[row][col];
          if (!values[row][0] || (status !== 'P' && status !== 'A')) continue;
          records.push({
            classId: c.id, classLabel: label_(c), subject: sr[4] === 'TRAINING' ? sr[1] + ' (Training)' : sr[1], date: match[1], lecture: Number(match[2]),
            enrollment: values[row][0], name: values[row][1], status
          });
        }
      }
    });
  });
  records.sort((a, b) => a.date.localeCompare(b.date) || a.classLabel.localeCompare(b.classLabel) || a.subject.localeCompare(b.subject) || a.lecture - b.lecture || numSort_(a.enrollment, b.enrollment));
  return { classes, studentsByClass, records };
}

function htmlEscapeReport_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emailReport_(subject, htmlBody, attachments) {
  const to = PropertiesService.getScriptProperties().getProperty(EMAIL_REPORT_RECIPIENT);
  if (!to) throw new Error('Set the attendance report email in HOD Setup first');
  if (!reportRecipientAllowed_(to)) throw new Error('Report recipient is outside the allowed email domain.');
  const options = { htmlBody, name: 'BIST AIML Attendance' };
  if (attachments && attachments.length) options.attachments = attachments;
  const senderEmail = emailReportSettings_().senderEmail;
  if (senderEmail) options.from = senderEmail;
  GmailApp.sendEmail(to, subject, htmlBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), options);
}

function sendDailyAttendanceReport() {
  const date = reportToday_();
  const data = collectAttendanceRecords_(date, date);
  const groups = {};
  data.records.forEach(r => {
    const key = [r.classLabel, r.subject, r.lecture].join('|');
    if (!groups[key]) groups[key] = { classLabel: r.classLabel, subject: r.subject, lecture: r.lecture, present: [], absent: [] };
    groups[key][r.status === 'P' ? 'present' : 'absent'].push(r);
  });
  const sections = Object.keys(groups).map(k => {
    const g = groups[k];
    const people = list => list.length ? list.map(r => `${htmlEscapeReport_(r.name)} (${htmlEscapeReport_(r.enrollment)})`).join(', ') : 'None';
    return `<h3>${htmlEscapeReport_(g.classLabel)} — ${htmlEscapeReport_(g.subject)}, Lecture ${g.lecture}</h3><p><b>Present (${g.present.length}):</b> ${people(g.present)}</p><p><b>Absent (${g.absent.length}):</b> ${people(g.absent)}</p>`;
  });
  const html = `<h2>Daily Attendance — ${date}</h2>${sections.length ? sections.join('') : '<p>No attendance has been marked today.</p>'}`;
  emailReport_(`Daily Attendance Report — ${date}`, html);
  return { date, records: data.records.length };
}

function xlsxReportBlob_(fileName, rows) {
  const book = SpreadsheetApp.create(fileName);
  try {
    const sheet = book.getSheets()[0];
    sheet.setName('Attendance');
    const width = Math.max(1, rows.reduce((m, row) => Math.max(m, row.length), 0));
    const padded = safeSheetRows_(rows.map(row => row.concat(new Array(width - row.length).fill(''))));
    sheet.getRange(1, 1, padded.length, width).setValues(padded);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#0a192f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, width);
    const url = 'https://www.googleapis.com/drive/v3/files/' + book.getId() + '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Excel export failed: ' + response.getContentText());
    return response.getBlob().setName(fileName + '.xlsx');
  } finally {
    DriveApp.getFileById(book.getId()).setTrashed(true);
  }
}

function sendWeeklyAttendanceReport() {
  const today = reportToday_();
  const endDate = reportDate_(today, -1);
  const startDate = reportDate_(endDate, -6);
  const data = collectAttendanceRecords_(startDate, endDate);
  const rows = [['Class', 'Date', 'Subject', 'Lecture', 'Enrollment No', 'Student Name', 'Status']];
  data.records.forEach(r => rows.push([r.classLabel, r.date, r.subject, r.lecture, r.enrollment, r.name, r.status === 'P' ? 'Present' : 'Absent']));
  if (rows.length === 1) rows.push(['No attendance records for this week']);
  const file = xlsxReportBlob_(`Weekly Attendance ${startDate} to ${endDate}`, rows);
  const present = data.records.filter(r => r.status === 'P').length;
  const absent = data.records.length - present;
  emailReport_(`Weekly Attendance Report — ${startDate} to ${endDate}`, `<h2>Weekly Attendance Report</h2><p>Period: ${startDate} to ${endDate}</p><p>Present marks: ${present} · Absent marks: ${absent}</p><p>The Excel workbook contains each marked student attendance record for the week.</p>`, [file]);
  return { startDate, endDate, records: data.records.length };
}

function sendMonthlyAttendanceReport() {
  const today = reportToday_();
  const endDate = reportDate_(today, -1);
  const endParts = endDate.split('-').map(Number);
  const startDate = Utilities.formatDate(new Date(endParts[0], endParts[1] - 1, 1, 12), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const data = collectAttendanceRecords_(startDate, endDate);
  const byClassAndStudent = {};
  data.classes.forEach(c => {
    const key = c.id;
    byClassAndStudent[key] = {};
    (data.studentsByClass[key] || []).forEach(s => byClassAndStudent[key][s[0]] = { classLabel: label_(c), enrollment: s[0], name: s[1], present: 0, total: 0 });
  });
  data.records.forEach(r => {
    const student = byClassAndStudent[r.classId] && byClassAndStudent[r.classId][r.enrollment];
    if (!student) return;
    student.total++;
    if (r.status === 'P') student.present++;
  });
  const reportRows = [['Class', 'Enrollment No', 'Student Name', 'Present Sessions', 'Marked Sessions', 'Marked Session Attendance %']];
  const all = [];
  Object.keys(byClassAndStudent).forEach(id => Object.keys(byClassAndStudent[id]).forEach(enrollment => {
    const s = byClassAndStudent[id][enrollment];
    s.percent = s.total ? Math.round(s.present * 10000 / s.total) / 100 : 0;
    all.push(s);
    reportRows.push([s.classLabel, s.enrollment, s.name, s.present, s.total, s.percent]);
  }));
  const workbook = xlsxReportBlob_(`Monthly Overall Attendance ${startDate} to ${endDate}`, reportRows);
  const summaryRows = all.slice(0, 100).map(s => `<tr><td>${htmlEscapeReport_(s.classLabel)}</td><td>${htmlEscapeReport_(s.enrollment)}</td><td>${htmlEscapeReport_(s.name)}</td><td>${s.present}/${s.total}</td><td>${s.percent}%</td></tr>`).join('');
  const omitted = all.length > 100 ? `<p>${all.length - 100} more students are included in the attached Excel workbook.</p>` : '';
  const html = `<h2>Monthly Marked-session Attendance</h2><p>Period: ${startDate} to ${endDate}</p><p>Students: ${all.length} · Present marks: ${data.records.filter(r => r.status === 'P').length} · Absent marks: ${data.records.filter(r => r.status === 'A').length}</p><table border="1" cellpadding="5" cellspacing="0"><thead><tr><th>Class</th><th>Enrollment</th><th>Name</th><th>Present / Marked</th><th>Marked-session attendance</th></tr></thead><tbody>${summaryRows}</tbody></table>${omitted}<p>Full class-wise student results are attached as an Excel workbook.</p>`;
  emailReport_(`Monthly Overall Attendance — ${startDate.slice(0, 7)}`, html, [workbook]);
  return { startDate, endDate, students: all.length };
}
