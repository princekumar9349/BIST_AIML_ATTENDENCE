"use client";
import { useState } from "react";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { confirmDialog, promptDialog, toast } from "../../lib/ui-store";
import { TTL } from "../../lib/config";
import { errorText } from "../../lib/utils";
import { DevFooter, QueryState, SkList } from "../ui";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export default function Trainers() {
  const trainersQ = useQuery("listTrainers", [], { ttl: TTL.staff });
  const [form, setForm] = useState({ name: "", email: "", pass: "" });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return toast("Enter the trainer name");
    if (!form.email.trim()) return toast("Enter the trainer email");
    if (form.pass.length < 8) return toast("Password needs at least 8 characters");
    setSaving(true);
    try {
      await mutate("addTrainer", [form.email.trim(), form.name.trim(), form.pass]);
      toast("Trainer access created. Share the email and password with the trainer.");
      setForm({ name: "", email: "", pass: "" });
    } catch (e) { toast(errorText(e)); } finally { setSaving(false); }
  };
  const resetPw = async (t) => {
    const pw = await promptDialog({ title: `Reset Password (${t.email})`, message: "Enter a new password (minimum 8 characters):", placeholder: "New password", defaultValue: generatePassword() });
    if (pw === null) return;
    try { toast((await mutate("resetTrainerPassword", [t.email, pw], { invalidate: false })) + ". Share the new password with the trainer."); }
    catch (e) { toast(errorText(e)); }
  };
  const remove = async (t) => {
    const ok = await confirmDialog({ title: "Remove trainer access?", message: `${t.name} (${t.email}) will no longer be able to sign in. Attendance they already marked is kept.`, confirmText: "Remove", danger: true });
    if (!ok) return;
    try { await mutate("removeTrainer", [t.email]); toast("Trainer access removed"); } catch (e) { toast(errorText(e)); }
  };

  return (
    <>
      <div className="card">
        <h3>Give Trainer Access</h3>
        <p className="hint">Enter the trainer's email and set a password. They sign in with this email. Then open the Sessions tab and assign them to training sessions in any branch — each trainer sees only the sessions assigned to them.</p>
        <label className="lbl">Trainer Full Name</label>
        <input className="inp" placeholder="e.g. Mr. Rohit Sharma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="row2">
          <div><label className="lbl">Trainer Email</label><input className="inp" type="email" autoCapitalize="none" autoComplete="off" placeholder="trainer@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="lbl">Initial Password</label><input className="inp" type="text" autoComplete="off" placeholder="min 8 characters" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} /></div>
        </div>
        <button className="btn sm outline" style={{ marginTop: 6 }} onClick={() => setForm({ ...form, pass: generatePassword() })}>Generate password</button>
        <button className="btn" style={{ marginTop: 12 }} disabled={saving} onClick={create}>{saving ? "Creating…" : "+ Create Trainer Access"}</button>
      </div>

      <QueryState q={trainersQ} skeleton={<SkList rows={3} />}>
        {(trainers) => (
          <div className="card">
            <h3>Trainers with Access ({trainers.length})</h3>
            {trainers.length ? trainers.map((t) => (
              <div className="list-item" key={t.email} style={{ flexWrap: "wrap", gap: 8 }}>
                <div className="info" style={{ minWidth: 180 }}>
                  <b>{t.name}</b>
                  <small>{t.email}</small>
                  <div style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(t.assigned || []).length
                      ? t.assigned.map((a) => <span className="tag extra" key={a.classId + a.subject} title={a.cls}>{a.subject} • {a.cls}</span>)
                      : <span className="tag" style={{ background: "#f1f5f9", color: "var(--mu)" }}>No sessions assigned yet</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sm sec" onClick={() => resetPw(t)}>Reset PW</button>
                  <button className="btn sm red" onClick={() => remove(t)}>Remove</button>
                </div>
              </div>
            )) : <div className="empty">No trainers have been given access yet.</div>}
          </div>
        )}
      </QueryState>
      <DevFooter />
    </>
  );
}
