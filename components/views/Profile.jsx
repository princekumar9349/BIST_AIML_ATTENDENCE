"use client";
import { useEffect, useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { toast } from "../../lib/ui-store";
import { COLLEGE_NAME, DEPT_NAME, DEVLINK_URL, GROUP_NAME, HOD_NAME, TTL } from "../../lib/config";
import { errorText } from "../../lib/utils";
import { DevFooter, Logos } from "../ui";
import { REGISTRY } from "../registry";

function EmailReports() {
  const q = useQuery("getEmailReportSettings", [], { ttl: TTL.slow });
  const s = q.data;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s) setForm({ email: s.email || s.defaultEmail || "", sender: s.senderEmail || "", hour: Number(s.hour), daily: !!s.daily, weekly: !!s.weekly, monthly: !!s.monthly });
  }, [s]);
  if (!form) return <div className="card"><h3>Email Configuration &amp; Automatic Attendance Reports</h3><div className="empty">{q.error ? "Could not load settings." : "Loading…"}</div></div>;

  const set = (patch) => setForm({ ...form, ...patch });
  const save = async () => {
    if (!form.email.trim()) return toast("Enter the report recipient email");
    setBusy(true);
    try {
      const r = await mutate("setEmailReportSettings", [form.email.trim(), form.daily, form.weekly, form.monthly, form.hour, form.sender]);
      toast(r.enabled ? `Report settings saved for ${r.email}` : "Settings saved; all automatic reports are paused");
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await mutate("sendTestAttendanceEmail", [], { invalidate: false, timeout: 60000 }); if (r?.sent) toast(`Test email sent to ${r.email}`); }
    catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h3>Email Configuration &amp; Automatic Attendance Reports</h3>
      <p className="hint">Choose the reports and sending time. Weekly and monthly reports include an Excel workbook.</p>
      <p className="hint">Defaulter reminders and reports use the Gmail account authorized in Apps Script. No SMTP password is needed; select a pre-configured Gmail sender alias below if you want a different sender.</p>
      <label className="lbl" htmlFor="re">Report recipient email</label>
      <input id="re" className="inp" type="email" value={form.email} placeholder="hod@example.com" autoComplete="email" onChange={(e) => set({ email: e.target.value })} />
      <label className="lbl" htmlFor="rs">Sender ID (Apps Script Gmail)</label>
      <select id="rs" className="inp" value={form.sender} onChange={(e) => set({ sender: e.target.value })}>
        <option value="">Default Apps Script account</option>
        {(s.senderAliases || []).map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <label className="lbl" htmlFor="rh">Send hour (project time zone)</label>
      <select id="rh" className="inp" value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
      </select>
      <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
        {[["daily", "Daily present and absent list"], ["weekly", "Weekly attendance Excel (Monday)"], ["monthly", "Monthly overall attendance (1st)"]].map(([k, label]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}</label>
        ))}
      </div>
      <div className="row2" style={{ marginTop: 10 }}>
        <button className="btn gold" disabled={busy} onClick={save}>Save Report Settings</button>
        <button className="btn sec" disabled={busy} onClick={test}>Send Test Email</button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>Weekly reports cover the previous Monday–Sunday. Monthly reports cover the previous calendar month. Send time uses the Apps Script project time zone.</p>
    </div>
  );
}

function ChangePassword({ username }) {
  const [oldPw, setOld] = useState("");
  const [newPw, setNew] = useState("");
  const submit = async () => {
    if (!oldPw || !newPw) return toast("Enter both old and new password");
    try { toast(await mutate("changePassword", [oldPw, newPw], { invalidate: false })); setOld(""); setNew(""); }
    catch (e) { toast(errorText(e)); }
  };
  return (
    <div className="card">
      <h3>Change My Password</h3>
      <p className="hint">Update login password for {username}</p>
      <label className="lbl">Current Password</label>
      <input type="password" className="inp" placeholder="Enter current password" value={oldPw} onChange={(e) => setOld(e.target.value)} />
      <label className="lbl">New Password (min 8 characters)</label>
      <input type="password" className="inp" placeholder="Enter new password" value={newPw} onChange={(e) => setNew(e.target.value)} />
      <button className="btn gold" style={{ marginTop: 12 }} onClick={submit}>Update Password</button>
    </div>
  );
}

export default function Profile() {
  const { user, logout: onLogout } = useStaff();
  const role = user.role;
  const staff = role !== "STUDENT";
  const roleLine = REGISTRY.roles[role].profileLine(user);
  return (
    <>
      <div className="card card-navy" style={{ textAlign: "center", padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Logos size="md" /></div>
        <div className="tag" style={{ marginBottom: 8 }}>{GROUP_NAME}</div>
        <h3 style={{ justifyContent: "center", fontSize: 17, color: "#fff", marginBottom: 2 }}>{role === "HOD" ? HOD_NAME : user.name}</h3>
        <p style={{ margin: "2px 0 10px", color: "var(--gold)", fontWeight: 800, fontSize: 12.5 }}>{roleLine}</p>
        <div className="profile-institute" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(197,160,89,0.35)", borderRadius: 12, padding: 10, textAlign: "left", fontSize: 12, lineHeight: 1.6 }}>
          <div><b>Institute:</b> {COLLEGE_NAME}</div>
          <div><b>Department:</b> {DEPT_NAME}</div>
          <div><b>Group:</b> BGI (Bhopal | Indore | Mandideep)</div>
        </div>
      </div>

      {role === "HOD" && <EmailReports />}
      {staff && <ChangePassword username={user.username} />}

      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--mu)", textTransform: "uppercase", letterSpacing: "0.05em" }}>System Architecture &amp; Engineering</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--navy)", margin: "4px 0" }}>
          <a href={DEVLINK_URL} target="_blank" rel="noopener noreferrer" className="dev-link-plain">Developed by Devlinkhub Team</a>
        </div>
        <p className="hint" style={{ margin: 0 }}>Optimized for Low-Connectivity Campus Zones • BIST Bhopal Attendance Portal v5</p>
      </div>
      <button className="btn red" onClick={onLogout}>Sign Out of Account</button>
      <DevFooter />
    </>
  );
}
