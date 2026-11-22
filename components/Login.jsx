"use client";
import { useEffect, useState } from "react";
import { rawPost } from "../lib/api";
import { setSession } from "../lib/session";
import { queueInit } from "../lib/queue";
import { storage } from "../lib/storage";
import { useQuery } from "../lib/useQuery";
import { toast } from "../lib/ui-store";
import { DEVLINK_URL, GAS_CONFIGURED, LOGIN_HEAD_LABEL, LOGIN_HEAD_NAME, LOGIN_SUBTITLE, STAFF_TAB_LABEL, STAFF_USER_HINT, STUDENT_PORTAL, TTL } from "../lib/config";
import { Logos } from "./ui";

function StudentLogin({ onDone }) {
  const q = useQuery("publicClasses", [], { isPublic: true, ttl: TTL.slow });
  const list = q.data || [];
  const [classId, setClassId] = useState(() => storage.get("last_cid", ""));
  const [enrollment, setEnrollment] = useState(() => storage.get("last_enr", ""));
  const [pin, setPin] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (list.length && !list.some((c) => c.id === classId)) setClassId(list[0].id);
  }, [list, classId]);

  const submit = async () => {
    const enr = enrollment.trim().toUpperCase();
    if (!classId) return toast("Please select your class");
    if (!enr) return toast("Please enter your Enrollment No");
    if (!/^\d{6}$/.test(pin)) return toast("Please enter the 6-digit branch PIN");
    setWorking(true);
    try {
      storage.set("last_enr", enr);
      storage.set("last_cid", classId);
      onDone(await rawPost("studentLogin", [classId, enr, pin], { retries: 0 }));
    } catch (e) {
      toast(e.kind === "network" ? "Network is slow. Please try again." : e.message);
    } finally {
      setWorking(false);
    }
  };

  const noClasses = !q.loading && !list.length;
  return (
    <div id="stu-login-box">
      <label className="lbl">Select Class (Branch • Sem • Section)</label>
      <select className="inp" value={classId} disabled={!list.length} onChange={(e) => setClassId(e.target.value)}>
        {q.loading && <option value="">Loading classes…</option>}
        {noClasses && <option value="">{q.error ? "Could not load classes — tap Refresh" : "No classes created yet (Contact HOD)"}</option>}
        {list.map((c) => <option key={c.id} value={c.id}>{c.branch} • Sem {c.sem} • Sec {c.section}</option>)}
      </select>
      <button className="btn sm outline" style={{ marginTop: 7 }} onClick={() => q.refetch()}>Refresh class list</button>
      {list.length > 1 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {list.map((c) => (
            <button key={c.id} className={`chip ${c.id === classId ? "on" : ""}`} onClick={() => setClassId(c.id)}>{c.branch} S{c.sem}-{c.section}</button>
          ))}
        </div>
      )}
      <label className="lbl">Enrollment Number</label>
      <input className="inp" value={enrollment} placeholder="e.g. 0112AL231001" autoCapitalize="characters"
        style={{ textTransform: "uppercase", fontFamily: "monospace" }}
        onChange={(e) => setEnrollment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <label className="lbl" htmlFor="l-pin">6-digit Branch PIN (shared)</label>
      <input id="l-pin" className="inp" type="password" inputMode="numeric" maxLength={6} autoComplete="current-password"
        placeholder="Enter your branch PIN" value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn gold" style={{ marginTop: 14 }} disabled={working || !list.length} onClick={submit}>
        {working ? "Signing in…" : "View My Attendance"}
      </button>
    </div>
  );
}

function StaffLogin({ onDone }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [working, setWorking] = useState(false);
  const submit = async () => {
    if (!user.trim() || !pass) return toast("Enter both username and password");
    setWorking(true);
    try {
      onDone(await rawPost("login", [user.trim(), pass], { retries: 0 }));
    } catch (e) {
      toast(e.kind === "network" ? "Network is slow. Please try again." : e.message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      <label className="lbl">Username or Email</label>
      <input className="inp" placeholder={STAFF_USER_HINT} autoCapitalize="none" autoComplete="username" value={user}
        onChange={(e) => setUser(e.target.value)} />
      <label className="lbl">Password</label>
      <input className="inp" type="password" placeholder="Enter password" autoComplete="current-password" value={pass}
        onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn" style={{ marginTop: 14 }} disabled={working} onClick={submit}>
        {working ? "Signing in…" : "Secure Staff Login"}
      </button>
    </div>
  );
}

export default function Login({ initialMode = "student", onLoggedIn }) {
  const [mode, setMode] = useState(STUDENT_PORTAL ? initialMode : "staff");
  const done = (result) => {
    setSession(result.token, result.user);
    queueInit(result.user);
    onLoggedIn(result);
  };
  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brandmark"><Logos size="lg" /></div>
        <div className="login-heading">
          <div className="login-badge">BANSAL GROUP OF INSTITUTES (BGI)</div>
          <h1 className="login-title">BANSAL INSTITUTE OF SCIENCE &amp; TECHNOLOGY, BHOPAL</h1>
          <p className="login-dept">{LOGIN_SUBTITLE}</p>
          <p className="login-hod">{LOGIN_HEAD_LABEL}: <b>{LOGIN_HEAD_NAME}</b></p>
        </div>
        {!GAS_CONFIGURED && (
          <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 800, fontSize: 12.5 }}>
            The backend is not connected yet. Deploy this app's Apps Script and set its /exec URL in lib/config.js (or NEXT_PUBLIC_GAS_URL).
          </div>
        )}
        <div className="card login-card">
          {STUDENT_PORTAL && (
            <div className="seg">
              <button className={mode === "student" ? "on" : ""} onClick={() => setMode("student")}>Student Portal</button>
              <button className={mode === "staff" ? "on" : ""} onClick={() => setMode("staff")}>{STAFF_TAB_LABEL}</button>
            </div>
          )}
          {mode === "student" && STUDENT_PORTAL ? <StudentLogin onDone={done} /> : <StaffLogin onDone={done} />}
        </div>
      </div>
      <div className="login-footer">
        <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 6 }}>Bhopal • Indore • Mandideep</div>
        <a href={DEVLINK_URL} target="_blank" rel="noopener noreferrer" className="login-credit">Developed by Devlinkhub Team</a>
      </div>
    </div>
  );
}
