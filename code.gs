/**
 * DEPARTMENT ATTENDANCE MANAGEMENT SYSTEM  (v4)
 * Roles : HOD (admin) | TEACHER | STUDENT
 *
 * CLASS  = Branch + Semester + Section   (e.g. CSE - Sem 5 - Sec A)
 * Har class ka ek Google workbook banta hai, file name:  "Attendance - CSE - Sem 5 - Sec A"
 *   Sheets: Students | <one sheet per subject> | EXTRA <activity> | Master (auto compiled)
 * Master registry workbook: Classes, Users, Subjects
 *
 * DEFAULT HOD LOGIN -> username: hod   password: hod123   (pehli baar login ke baad change karo)
 */

const DEFAULT_MIN = 75;                 // HOD Setup se badal sakti hai
const SALT = 'CHANGE-THIS-SALT-TEXT';   // pehli baar use se pehle change karo
const SESSION_SECONDS = 21600;          // 6 hours
const REG_KEY = 'REG_ID_V4';
const RESERVED = ['students', 'master'];

let REG_ = null;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Attendance')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fn = body.fn;
    const args = body.args || [];

    const registry = {
      login, studentLogin, resume, logout, changePassword,
      publicClasses, listClasses, createClass, renameClass,
      listTeachers, addTeacher, resetTeacherPassword, removeTeacher,
      listSubjects, addSubject, changeTeacher,
      listStudents, addStudents, removeStudent,
      getAttendanceSheet, saveAttendance, getAbsentees,
      getSummary, getMyAttendance, getSettings, setMinPercent
    };

    if (typeof registry[fn] !== 'function') {
      throw new Error('Unknown function: ' + fn);
    }

    const result = registry[fn].apply(null, args);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      data: result,
      status: 'ok',
      result: result
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: err.message,
      status: 'error',
      message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ================= helpers ================= */

function hash_(p) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SALT + p)
    .map(x => ('0' + (x & 0xff).toString(16)).slice(-2)).join('');
}
function norm_(s) { return String(s || '').trim().toUpperCase(); }
function numSort_(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }

/** sheet ki saari student rows ko enrollment no ke hisaab se sort karta hai */
function sortSheet_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 2) return;
  const rg = sh.getRange(2, 1, n, sh.getLastColumn());
  rg.setValues(rg.getDisplayValues().sort((a, b) => numSort_(a[0], b[0])));
}

/* ---- minimum attendance % (HOD decide karti hai) ---- */
function getMin_() {
  const v = Number(PropertiesService.getScriptProperties().getProperty('MIN_PERCENT'));
  return v >= 1 && v <= 100 ? v : DEFAULT_MIN;
}
function getSettings(token) { auth_(token, ['HOD']); return { min: getMin_() }; }
function setMinPercent(token, val) {
  auth_(token, ['HOD']);
  const v = Number(val);
  if (!(v >= 1 && v <= 100)) throw new Error('1 se 100 ke beech number daalo');
  PropertiesService.getScriptProperties().setProperty('MIN_PERCENT', String(v));
  classes_().forEach(c => compileClass_(c.id));   // saari Master sheets nayi limit se update
  return { min: v };
}

function reg_() {
  if (REG_) return REG_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(REG_KEY);
  if (id) { REG_ = SpreadsheetApp.openById(id); return REG_; }
  const ss = SpreadsheetApp.create('Attendance Master Registry');
  props.setProperty(REG_KEY, ss.getId());
  ss.getSheets()[0].setName('Classes').appendRow(['ClassId', 'Branch', 'Semester', 'Section', 'SpreadsheetId', 'URL', 'FileName']);
  ss.insertSheet('Users').appendRow(['Username', 'Name', 'Role', 'PasswordHash']);
  ss.insertSheet('Subjects').appendRow(['ClassId', 'Subject', 'SheetName', 'Teacher', 'Type', 'PriorTotal']);
  ss.getSheetByName('Users').appendRow(['hod', 'HOD', 'HOD', hash_('hod123')]);
  REG_ = ss;
  return ss;
}
function rows_(name) {
  return reg_().getSheetByName(name).getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
}
function label_(c) { return c.branch + ' • Sem ' + c.sem + ' • Sec ' + c.section; }
function fileName_(branch, sem, section) { return 'Attendance - ' + branch + ' - Sem ' + sem + ' - Sec ' + section; }
function classes_() {
  return rows_('Classes').map(r => ({ id: r[0], branch: r[1], sem: r[2], section: r[3], ssId: r[4], url: r[5], file: r[6] }));
}
function cls_(id) {
  const c = classes_().find(x => x.id === id);
  if (!c) throw new Error('Class not found');
  return c;
}
function ss_(classId) { return SpreadsheetApp.openById(cls_(classId).ssId); }

/* ================= sessions ================= */

function newSession_(user) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(token, JSON.stringify(user), SESSION_SECONDS);
  return { token, user };
}
function auth_(token, roles) {
  const s = CacheService.getScriptCache().get(token || 'x');
  if (!s) throw new Error('Session expired, login again');
  const u = JSON.parse(s);
  if (roles && !roles.includes(u.role)) throw new Error('Not allowed');
  return u;
}
function resume(token) { return { token, user: auth_(token) }; }
function logout(token) { CacheService.getScriptCache().remove(token || 'x'); }

function login(username, password) {
  const u = rows_('Users').find(r => r[0].toLowerCase() === String(username).trim().toLowerCase());
  if (!u || u[3] !== hash_(password)) throw new Error('Wrong username or password');
  return newSession_({ role: u[2], username: u[0], name: u[1] });
}

/** student login: class (branch + sem + section) + enrollment no */
function studentLogin(classId, enrollment) {
  const c = cls_(classId);
  enrollment = norm_(enrollment);
  const st = studentRows_(classId).find(r => r[0] === enrollment);
  if (!st) throw new Error('Enrollment no is class me nahi mila');
  return newSession_({ role: 'STUDENT', username: enrollment, name: st[1], classId, label: label_(c) });
}

function changePassword(token, oldPass, newPass) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  if (!newPass || newPass.length < 4) throw new Error('Password min 4 characters');
  const sh = reg_().getSheetByName('Users');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === u.username) {
      if (d[i][3] !== hash_(oldPass)) throw new Error('Old password is wrong');
      sh.getRange(i + 1, 4).setValue(hash_(newPass));
      return 'Password changed';
    }
  }
  throw new Error('User not found');
}

/* ================= classes (branch + semester + section) ================= */

function publicClasses() {
  return classes_().map(c => ({ id: c.id, branch: c.branch, sem: c.sem, section: c.section }));
}

function listClasses(token) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  let list = classes_();
  if (u.role === 'TEACHER') {
    const mine = rows_('Subjects').filter(r => r[3] === u.username).map(r => r[0]);
    list = list.filter(c => mine.includes(c.id));
  }
  return list.map(c => ({ id: c.id, branch: c.branch, sem: c.sem, section: c.section, label: label_(c), url: c.url, file: c.file }))
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
  auth_(token, ['HOD']);
  const v = checkClassInput_(branch, sem, section, '');
  const file = fileName_(v.branch, v.sem, v.section);
  const ss = SpreadsheetApp.create(file);
  const st = ss.getSheets()[0];
  st.setName('Students');
  st.getRange('A:B').setNumberFormat('@');
  st.getRange('A1:B1').setValues([['Enrollment No', 'Name']]).setFontWeight('bold');
  st.setFrozenRows(1);
  const id = Utilities.getUuid().slice(0, 8);
  reg_().getSheetByName('Classes').appendRow([id, v.branch, v.sem, v.section, ss.getId(), ss.getUrl(), file]);
  return listClasses(token);
}

/** Branch / semester / section rename -> Google file ka naam bhi badal jata hai */
function renameClass(token, classId, branch, sem, section) {
  auth_(token, ['HOD']);
  const v = checkClassInput_(branch, sem, section, classId);
  const c = cls_(classId);
  const file = fileName_(v.branch, v.sem, v.section);
  SpreadsheetApp.openById(c.ssId).rename(file);
  const sh = reg_().getSheetByName('Classes');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] === classId) {
      sh.getRange(i + 1, 2, 1, 3).setValues([[v.branch, v.sem, v.section]]);
      sh.getRange(i + 1, 7).setValue(file);
    }
  }
  return listClasses(token);
}

/* ================= teachers (HOD) ================= */

function listTeachers(token) {
  auth_(token, ['HOD']);
  return rows_('Users').filter(r => r[2] === 'TEACHER').map(r => ({ username: r[0], name: r[1] }));
}

function addTeacher(token, username, name, password) {
  auth_(token, ['HOD']);
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,}$/.test(username)) throw new Error('Username: min 3 letters/numbers');
  if (!name || !String(name).trim()) throw new Error('Teacher ka naam daalo');
  if (!password || password.length < 4) throw new Error('Password min 4 characters');
  if (rows_('Users').some(r => r[0].toLowerCase() === username)) throw new Error('Username already exists');
  reg_().getSheetByName('Users').appendRow([username, String(name).trim(), 'TEACHER', hash_(password)]);
  return listTeachers(token);
}

function resetTeacherPassword(token, username, newPass) {
  auth_(token, ['HOD']);
  if (!newPass || newPass.length < 4) throw new Error('Password min 4 characters');
  const sh = reg_().getSheetByName('Users');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++)
    if (d[i][0] === username && d[i][2] === 'TEACHER') { sh.getRange(i + 1, 4).setValue(hash_(newPass)); return 'Password reset'; }
  throw new Error('Teacher not found');
}

function removeTeacher(token, username) {
  auth_(token, ['HOD']);
  const us = reg_().getSheetByName('Users');
  const d = us.getDataRange().getDisplayValues();
  for (let i = d.length - 1; i >= 1; i--) if (d[i][0] === username && d[i][2] === 'TEACHER') us.deleteRow(i + 1);
  const ss = reg_().getSheetByName('Subjects');
  const s = ss.getDataRange().getDisplayValues();
  for (let i = 1; i < s.length; i++) if (s[i][3] === username) ss.getRange(i + 1, 4).setValue('');
  return listTeachers(token);
}

/* ================= subjects & extra activities ================= */

function listSubjects(token, classId) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  const lab = {};
  classes_().forEach(c => lab[c.id] = label_(c));
  return rows_('Subjects')
    .filter(r => u.role === 'HOD' ? r[0] === classId : r[3] === u.username)
    .map(r => ({ classId: r[0], cls: lab[r[0]] || '', subject: r[1], sheet: r[2], teacher: r[3], type: r[4] || 'CLASS', prior: Number(r[5]) || 0 }));
}

/** type: 'CLASS' (regular, teacher leta hai) | 'EXTRA' (extra activity, HOD attendance lagati hai)
 *  priorTotal: app se pehle jitni classes ho chuki (optional) */
function addSubject(token, classId, subject, teacher, type, priorTotal) {
  auth_(token, ['HOD']);
  type = type === 'EXTRA' ? 'EXTRA' : 'CLASS';
  subject = String(subject || '').replace(/[\[\]\*\?\:\/\\]/g, '').trim();
  if (!subject) throw new Error('Naam daalo');
  if (RESERVED.includes(subject.toLowerCase())) throw new Error('Ye naam allowed nahi hai');
  const ss = ss_(classId);
  const sheetName = (type === 'EXTRA' ? 'EXTRA ' : '') + subject;
  if (ss.getSheetByName(sheetName)) throw new Error('Ye pehle se bana hua hai');
  if (type === 'EXTRA') teacher = '';
  if (teacher && !rows_('Users').some(r => r[0] === teacher && r[2] === 'TEACHER')) throw new Error('Teacher not found');
  const sh = ss.insertSheet(sheetName);
  sh.getRange('A:B').setNumberFormat('@');
  sh.getRange('A1:C1').setValues([['Enrollment No', 'Name', 'Previous Count']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  syncSheet_(sh, ss);
  reg_().getSheetByName('Subjects').appendRow([classId, subject, sheetName, teacher || '', type, Number(priorTotal) || 0]);
  compileClass_(classId);
  return listSubjects(token, classId);
}

function changeTeacher(token, classId, subject, teacher) {
  auth_(token, ['HOD']);
  const sh = reg_().getSheetByName('Subjects');
  const d = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < d.length; i++)
    if (d[i][0] === classId && d[i][1] === subject && d[i][4] !== 'EXTRA') {
      sh.getRange(i + 1, 4).setValue(teacher || '');
      return 'Teacher updated';
    }
  throw new Error('Subject not found');
}

/* ================= students ================= */

function studentRows_(classId) {
  const sh = ss_(classId).getSheetByName('Students');
  return sh.getLastRow() < 2 ? [] : sh.getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
}

function syncSheet_(sh, ss) {
  const stu = ss.getSheetByName('Students').getDataRange().getDisplayValues().slice(1).filter(r => r[0]);
  const have = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  const add = stu.filter(r => !have.includes(r[0])).map(r => [r[0], r[1]]);
  if (add.length) { sh.getRange(sh.getLastRow() + 1, 1, add.length, 2).setValues(add); sortSheet_(sh); }
}

function checkScope_(u, classId) {
  if (u.role === 'HOD') return;
  if (!rows_('Subjects').some(r => r[0] === classId && r[3] === u.username))
    throw new Error('Aapko is class me koi subject assign nahi hai');
}

function listStudents(token, classId) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  checkScope_(u, classId);
  return studentRows_(classId).map(r => ({ e: r[0], n: r[1] })).sort((a, b) => numSort_(a.e, b.e));
}

/** text: har line me "enrollment, name"  (comma / tab / space) */
function addStudents(token, classId, text) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  checkScope_(u, classId);
  const ss = ss_(classId);
  const sh = ss.getSheetByName('Students');
  const have = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  const rows = [];
  let skipped = 0;
  String(text || '').split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;
    let p = line.split(/[,\t]/).map(s => s.trim());
    if (p.length < 2) { const m = line.match(/^(\S+)\s+(.+)$/); p = m ? [m[1], m[2]] : [line, '']; }
    const enr = norm_(p[0]);
    if (!enr || !p[1] || have.includes(enr) || rows.some(r => r[0] === enr)) { skipped++; return; }
    rows.push([enr, p[1]]);
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
    sortSheet_(sh);
    rows_('Subjects').filter(r => r[0] === classId).forEach(r => {
      const s = ss.getSheetByName(r[2]);
      if (s) syncSheet_(s, ss);
    });
    compileClass_(classId);
  }
  return { added: rows.length, skipped };
}

function removeStudent(token, classId, enrollment) {
  auth_(token, ['HOD']);
  const ss = ss_(classId);
  const del = sh => {
    const d = sh.getDataRange().getDisplayValues();
    for (let i = d.length - 1; i >= 1; i--) if (d[i][0] === enrollment) sh.deleteRow(i + 1);
  };
  del(ss.getSheetByName('Students'));
  rows_('Subjects').filter(r => r[0] === classId).forEach(r => { const s = ss.getSheetByName(r[2]); if (s) del(s); });
  compileClass_(classId);
  return 'Student removed';
}

/* ================= attendance =================
 * Sheet layout: A=Enrollment, B=Name, C=Previous Count (optional), D...=entries
 * Regular subject column header : "2026-11-01 L1"       value P / A
 * Extra activity column header  : "2026-11-01 S1 x4"    value = lectures attended (0..4)
 */

function checkSubject_(u, classId, subject) {
  const r = rows_('Subjects').find(x => x[0] === classId && x[1] === subject);
  if (!r) throw new Error('Subject not found');
  if (u.role === 'TEACHER' && r[3] !== u.username) throw new Error('Ye subject aapko assign nahi hai');
  return r;
}

/** returns { rows:[{e,n,s}], lecs, exists, extra }   s = P/A (regular) or number (extra), null if not marked yet */
function getAttendanceSheet(token, classId, subject, date, sess) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  const sr = checkSubject_(u, classId, subject);
  const extra = sr[4] === 'EXTRA';
  const ss = ss_(classId);
  const sh = ss.getSheetByName(sr[2]);
  syncSheet_(sh, ss);
  if (sh.getLastRow() < 2) return { rows: [], lecs: null, exists: false, extra };
  const d = sh.getDataRange().getDisplayValues();
  const heads = d[0];
  let col = -1, lecs = null;
  if (extra) {
    const pre = date + ' S' + sess + ' x';
    col = heads.findIndex((h, i) => i >= 3 && h.indexOf(pre) === 0);
    if (col > -1) lecs = Number(heads[col].slice(pre.length)) || null;
  } else {
    col = heads.indexOf(date + ' L' + sess);
  }
  return {
    rows: d.slice(1).filter(r => r[0]).map(r => ({ e: r[0], n: r[1], s: col > -1 && r[col] !== '' ? r[col] : null }))
      .sort((a, b) => numSort_(a.e, b.e)),
    lecs, exists: col > -1, extra
  };
}

/** marks: { enrollment: 'P'|'A' }  (regular)   or   { enrollment: number } (extra) */
function saveAttendance(token, classId, subject, date, sess, lecs, marks) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date chuno');
  const sr = checkSubject_(u, classId, subject);
  const extra = sr[4] === 'EXTRA';
  if (extra && u.role !== 'HOD') throw new Error('Extra activity sirf HOD lagayegi');
  const ss = ss_(classId);
  const sh = ss.getSheetByName(sr[2]);
  syncSheet_(sh, ss);
  const n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('Pehle students add karo');

  let header, prefix = '';
  if (extra) {
    lecs = Math.max(1, Math.min(99, parseInt(lecs, 10) || 0));
    prefix = date + ' S' + sess + ' x';
    header = prefix + lecs;
  } else {
    header = date + ' L' + sess;
  }
  const lastCol = sh.getLastColumn();
  const heads = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  let col = extra ? heads.findIndex((h, i) => i >= 3 && h.indexOf(prefix) === 0) + 1 : heads.indexOf(header) + 1;
  if (!col) {
    col = lastCol + 1;
    sh.getRange(1, col).setValue(header).setFontWeight('bold');
  } else if (extra) {
    sh.getRange(1, col).setValue(header);
  }
  const enrs = sh.getRange(2, 1, n, 1).getDisplayValues();
  const vals = enrs.map(r => {
    if (extra) return [Math.max(0, Math.min(lecs, parseInt(marks[r[0]], 10) || 0))];
    return [marks[r[0]] === 'A' ? 'A' : 'P'];
  });
  sh.getRange(2, col, n, 1).setValues(vals);
  compileClass_(classId);
  if (extra) return 'Saved: ' + n + ' students, ' + lecs + ' lecture(s)';
  const absent = vals.filter(v => v[0] === 'A').length;
  return 'Saved: ' + (n - absent) + ' present, ' + absent + ' absent';
}

/* ================= absent list (teacher / HOD) =================
 * Ek date ke saare lectures ke absentees, enrollment no ke order me */

function getAbsentees(token, classId, date) {
  const u = auth_(token, ['HOD', 'TEACHER']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date chuno');
  const ss = ss_(classId);
  const teachers = {};
  rows_('Users').forEach(r => teachers[r[0]] = r[1]);
  const blocks = [];
  rows_('Subjects')
    .filter(r => r[0] === classId && r[4] !== 'EXTRA' && (u.role === 'HOD' || r[3] === u.username))
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
        blocks.push({ subject: sr[1], teacher: teachers[sr[3]] || '', lec: Number(m[2]), total, absent });
      }
    });
  blocks.sort((a, b) => a.lec - b.lec || a.subject.localeCompare(b.subject));
  return { label: label_(cls_(classId)), date, blocks };
}

/* ================= auto compile -> "Master" sheet =================
 * S.NO. | ENROLLMENT NO. | STUDENT NAME | subjects... | extra activities... | TOTAL | PERCENTAGE
 * row 2 = "Total Classes"
 * PERCENTAGE = (subject classes attended + extra activity lectures) / total regular classes, max 100 */

function sheetStats_(ss, sr) {
  const res = { total: Number(sr[5]) || 0, p: {} };
  const sh = ss.getSheetByName(sr[2]);
  if (!sh) return res;
  const extra = sr[4] === 'EXTRA';
  const d = sh.getDataRange().getDisplayValues();
  const heads = d[0];
  for (let j = 3; j < heads.length; j++) {
    if (extra) { const m = /x(\d+)$/.exec(heads[j]); res.total += m ? Number(m[1]) : 0; }
    else res.total++;
  }
  for (let i = 1; i < d.length; i++) {
    let c = Number(d[i][2]) || 0;
    for (let j = 3; j < heads.length; j++) c += extra ? (Number(d[i][j]) || 0) : (d[i][j] === 'P' ? 1 : 0);
    res.p[d[i][0]] = c;
  }
  return res;
}

function compileClass_(classId) {
  const ss = ss_(classId);
  const all = rows_('Subjects').filter(r => r[0] === classId);
  const cls = all.filter(r => r[4] !== 'EXTRA');
  const ext = all.filter(r => r[4] === 'EXTRA');
  const stu = studentRows_(classId).sort((a, b) => numSort_(a[0], b[0]));
  const cs = cls.map(r => sheetStats_(ss, r));
  const es = ext.map(r => sheetStats_(ss, r));
  const denom = cs.reduce((a, x) => a + x.total, 0);

  const out = [['S.NO.', 'ENROLLMENT NO.', 'STUDENT NAME'].concat(cls.map(r => r[1]), ext.map(r => r[1]), ['TOTAL', 'PERCENTAGE'])];
  out.push(['', '', 'Total Classes'].concat(cs.map(x => x.total), es.map(x => x.total || ''), [denom, 100]));
  stu.forEach((r, i) => {
    const c = cs.map(x => x.p[r[0]] || 0);
    const e = es.map(x => x.p[r[0]] || 0);
    const total = c.concat(e).reduce((a, b) => a + b, 0);
    const pct = denom ? Math.round(Math.min(100, total * 100 / denom) * 100) / 100 : '';
    out.push([i + 1, r[0], r[1]].concat(c, e.map(v => v || ''), [total, pct]));
  });

  const sum = ss.getSheetByName('Master') || ss.insertSheet('Master');
  sum.clear();
  sum.clearConditionalFormatRules();
  const W = out[0].length;
  sum.getRange(1, 1, out.length, W).setValues(out)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sum.getRange(1, 3, out.length, 1).setHorizontalAlignment('left');
  sum.getRange(1, 1, 1, W).setBackground('#0b3558').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sum.getRange(2, 1, 1, W).setFontWeight('bold').setBackground('#eef2f7');
  if (out.length > 2) sum.getRange(3, W, out.length - 2, 1).setNumberFormat('0.00');
  sum.setFrozenRows(2);
  sum.setFrozenColumns(3);
  if (out.length > 2) {
    sum.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(getMin_()).setBackground('#f8c9c9').setFontColor('#b91c1c')
      .setRanges([sum.getRange(3, W, out.length - 2, 1)]).build()]);
  }
  return { table: out, url: ss.getUrl() + '#gid=' + sum.getSheetId(), min: getMin_() };
}

function getSummary(token, classId) {
  auth_(token, ['HOD']);
  return compileClass_(classId);
}

/* ================= student view ================= */

function getMyAttendance(token) {
  const u = auth_(token, ['STUDENT']);
  const ss = ss_(u.classId);
  const teachers = {};
  rows_('Users').forEach(r => teachers[r[0]] = r[1]);
  const all = rows_('Subjects').filter(r => r[0] === u.classId);

  const build = sr => {
    const extra = sr[4] === 'EXTRA';
    const out = { subject: sr[1], teacher: teachers[sr[3]] || '', p: 0, t: Number(sr[5]) || 0, pct: null, records: [] };
    const sh = ss.getSheetByName(sr[2]);
    if (!sh) return out;
    const d = sh.getDataRange().getDisplayValues();
    const heads = d[0];
    const row = d.find((r, i) => i > 0 && r[0] === u.username);
    out.p = row ? Number(row[2]) || 0 : 0;
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
        out.t++;
        if (v === 'P' || v === 'A') {
          if (v === 'P') out.p++;
          out.records.push({ d: heads[c], s: v, k: v });
        }
      }
    }
    out.records.reverse();
    out.pct = out.t ? Math.round(out.p * 1000 / out.t) / 10 : null;
    return out;
  };

  const subjects = all.filter(r => r[4] !== 'EXTRA').map(build);
  const extras = all.filter(r => r[4] === 'EXTRA').map(build);
  const T = subjects.reduce((a, x) => a + x.t, 0);
  const P = subjects.reduce((a, x) => a + x.p, 0) + extras.reduce((a, x) => a + x.p, 0);
  return {
    user: u, min: getMin_(), p: P, t: T, subjects, extras,
    overall: T ? Math.round(Math.min(100, P * 100 / T) * 10) / 10 : null
  };
}
