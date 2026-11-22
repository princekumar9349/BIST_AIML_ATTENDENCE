"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { mutate } from "../../lib/api";
import { confirmDialog, finishModal, openModal, promptDialog, toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";
import { DevFooter } from "../ui";
import TrainingLink from "./TrainingLink";
import { ClassesCard } from "./ClassesCard";

export default function Setup() {
  const { minPct, teachers } = useStaff();
  const [min, setMin] = useState(String(minPct));
  const [f, setF] = useState({ name: "", user: "", pass: "" });
  const [saving, setSaving] = useState(false);

  const saveMin = async () => {
    try { const r = await mutate("setMinPercent", [min]); toast(`Minimum attendance updated to ${r.min}%`); } catch (e) { toast(errorText(e)); }
  };
  const addTeacher = async () => {
    setSaving(true);
    try { await mutate("addTeacher", [f.user.trim(), f.name.trim(), f.pass]); toast("Faculty account created"); setF({ name: "", user: "", pass: "" }); }
    catch (e) { toast(errorText(e)); } finally { setSaving(false); }
  };
  const resetPw = async (t) => {
    const pw = await promptDialog({ title: `Reset Password (@${t.username})`, message: "Enter a new password (minimum 8 characters):", placeholder: "New password" });
    if (pw === null) return;
    try { toast(await mutate("resetTeacherPassword", [t.username, pw], { invalidate: false })); } catch (e) { toast(errorText(e)); }
  };
  const removeTeacher = async (t) => {
    const ok = await confirmDialog({ title: "Remove Faculty?", message: `Remove ${t.name} (@${t.username})? Their subjects will remain intact but become unassigned.`, confirmText: "Remove", danger: true });
    if (!ok) return;
    try { await mutate("removeTeacher", [t.username]); toast("Faculty removed"); } catch (e) { toast(errorText(e)); }
  };

  return (
    <>
      <TrainingLink />
      <ClassesCard />

      <div className="card">
        <h3>Minimum Attendance Requirement (%)</h3>
        <p className="hint">Students below this threshold are highlighted in red on the Master Sheet</p>
        <div className="row2" style={{ alignItems: "center" }}>
          <input type="number" min="1" max="100" className="inp" value={min} onChange={(e) => setMin(e.target.value)} />
          <button className="btn" onClick={saveMin}>Update Minimum %</button>
        </div>
      </div>

      <div className="card">
        <h3>Add Department Faculty</h3>
        <label className="lbl">Faculty Full Name</label>
        <input className="inp" placeholder="e.g. Prof. Ankit Verma" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="row2">
          <div><label className="lbl">Username</label><input className="inp" placeholder="e.g. averma" autoCapitalize="none" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} /></div>
          <div><label className="lbl">Initial Password</label><input className="inp" type="password" autoComplete="new-password" placeholder="min 8 characters" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} /></div>
        </div>
        <button className="btn" style={{ marginTop: 12 }} disabled={saving} onClick={addTeacher}>+ Create Faculty Account</button>
        <div style={{ marginTop: 14, borderTop: "1px solid var(--ln)", paddingTop: 10 }}>
          <label className="lbl">Registered Faculty ({teachers.length})</label>
          {teachers.length ? teachers.map((t) => (
            <div className="list-item" key={t.username}>
              <div className="info"><b>{t.name}</b><small>@{t.username}</small></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm sec" onClick={() => resetPw(t)}>Reset PW</button>
                <button className="btn sm red" onClick={() => removeTeacher(t)}>Remove</button>
              </div>
            </div>
          )) : <div className="empty">No faculty added yet.</div>}
        </div>
      </div>
      <DevFooter />
    </>
  );
}
