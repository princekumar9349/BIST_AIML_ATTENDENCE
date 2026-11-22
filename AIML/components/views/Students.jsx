"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { confirmDialog, finishModal, openModal, toast } from "../../lib/ui-store";
import { TTL } from "../../lib/config";
import { errorText } from "../../lib/utils";
import { DevFooter, Empty, QueryState, SkList } from "../ui";

function ContactDialog({ student, classId }) {
  const [email, setEmail] = useState(student.email || "");
  const [phone, setPhone] = useState(student.phone || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      toast(await mutate("updateStudentContact", [classId, student.e, email.trim(), phone.trim()]));
      finishModal(true);
    } catch (e) { toast(errorText(e)); setSaving(false); }
  };
  return (
    <>
      <h4>Update Student Contact</h4>
      <p className="hint">{student.n} ({student.e})</p>
      <label className="lbl" htmlFor="ce">Email (Optional)</label>
      <input id="ce" className="inp" type="email" value={email} placeholder="student@example.com" onChange={(e) => setEmail(e.target.value)} />
      <label className="lbl" htmlFor="cp">Phone (Optional)</label>
      <input id="cp" className="inp" type="tel" value={phone} placeholder="+91 98765 43210" onChange={(e) => setPhone(e.target.value)} />
      <div className="row2" style={{ marginTop: 14 }}>
        <button className="btn sec" onClick={() => finishModal(false)}>Cancel</button>
        <button className="btn gold" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Contact"}</button>
      </div>
    </>
  );
}

export default function Students() {
  const { role, classId, currentClass } = useStaff();
  const q = useQuery("listStudents", [classId], { ttl: TTL.roster, enabled: Boolean(classId) });
  const [form, setForm] = useState({ e: "", n: "", email: "", phone: "" });
  const [bulk, setBulk] = useState("");
  const [pin, setPin] = useState("");
  const [search, setSearch] = useState("");
  const admin = role === "HOD" || role === "TRAINING_HEAD";

  if (!classId) return <Empty>No class is available yet.</Empty>;

  const add = async (text, single) => {
    try {
      const r = await mutate("addStudents", [classId, text]);
      toast(single ? (r.added ? "Student added" : "Already exists or invalid") : `${r.added} added${r.skipped ? `, ${r.skipped} skipped` : ""}`);
      if (single && r.added) setForm({ e: "", n: "", email: "", phone: "" });
      if (!single && r.added) setBulk("");
    } catch (e) { toast(errorText(e)); }
  };
  const addSingle = () => {
    if (!form.e.trim() || !form.n.trim()) return toast("Enter both Enrollment No and Student Name");
    add(`${form.e.trim()}\t${form.n.trim()}\t${form.email.trim()}\t${form.phone.trim()}`, true);
  };
  const addBulk = () => (bulk.trim() ? add(bulk.trim(), false) : toast("Paste student lines first"));

  const savePin = async () => {
    if (!/^\d{6}$/.test(pin)) return toast("Branch PIN must be exactly 6 digits");
    try { toast(await mutate("setBranchStudentPin", [classId, pin], { invalidate: false })); setPin(""); }
    catch (e) { toast(errorText(e)); }
  };

  const remove = async (s) => {
    const ok = await confirmDialog({ title: "Remove Student?", message: `Remove ${s.n} (${s.e}) from this class and all its subject sheets?`, confirmText: "Remove Permanently", danger: true });
    if (!ok) return;
    try { toast(await mutate("removeStudent", [classId, s.e])); } catch (e) { toast(errorText(e)); }
  };

  return (
    <QueryState q={q} skeleton={<SkList rows={6} />}>
      {(list) => {
        const needle = search.toLowerCase();
        const shown = list.filter((s) => !needle || `${s.e} ${s.n} ${s.email || ""} ${s.phone || ""}`.toLowerCase().includes(needle));
        return (
          <>
            {role === "HOD" && (
              <div className="card">
                <h3>Shared Branch Login PIN</h3>
                <p className="hint">Set one 6-digit PIN for every student in the <b>{currentClass?.branch}</b> branch. The same PIN works across its semesters and sections.</p>
                <div className="row2">
                  <input className="inp" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" placeholder="New branch PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
                  <button className="btn gold" onClick={savePin}>Save Branch PIN</button>
                </div>
              </div>
            )}

            <div className="card">
              <h3>Add Student to Class</h3>
              <p className="hint">{currentClass?.label}</p>
              <div className="row2">
                <div><label className="lbl">Enrollment No</label><input className="inp" placeholder="0112AL231001" autoCapitalize="characters" style={{ textTransform: "uppercase", fontFamily: "monospace" }} value={form.e} onChange={(e) => setForm({ ...form, e: e.target.value })} /></div>
                <div><label className="lbl">Student Name</label><input className="inp" placeholder="Full Name" value={form.n} onChange={(e) => setForm({ ...form, n: e.target.value })} /></div>
              </div>
              <div className="row2" style={{ marginTop: 8 }}>
                <div><label className="lbl">Email (Optional)</label><input className="inp" type="email" placeholder="student@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="lbl">Phone (Optional)</label><input className="inp" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <button className="btn" style={{ marginTop: 12 }} onClick={addSingle}>+ Add Student</button>
              <details style={{ marginTop: 12, borderTop: "1px solid var(--ln)", paddingTop: 10 }}>
                <summary style={{ fontWeight: 800, color: "var(--navy)", cursor: "pointer", fontSize: 13 }}>Bulk Paste Students (Excel / CSV List)</summary>
                <p className="hint" style={{ marginTop: 6 }}>One student per line: <code>EnrollmentNo, Full Name, Email (optional), Phone (optional)</code></p>
                <textarea className="inp" placeholder={"0112AL231001, Aarav Sharma, aarav@example.com, +91 98765 43210\n0112AL231002, Priya Patel"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
                <button className="btn gold" style={{ marginTop: 8 }} onClick={addBulk}>Import All Students</button>
              </details>
            </div>

            <div className="card">
              <h3><span>Enrolled Students ({list.length})</span></h3>
              <input className="inp" placeholder="Search name or enrollment…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ margin: "8px 0" }} />
              {shown.length ? shown.map((s) => (
                <div className="list-item" key={s.e}>
                  <div className="info">
                    <b>{s.n}</b>
                    <small>{s.e}</small>
                    {(s.email || s.phone) && <small>{[s.email, s.phone].filter(Boolean).join(" · ")}</small>}
                  </div>
                  {admin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn sm sec" onClick={() => openModal(<ContactDialog student={s} classId={classId} />, false)}>Contact</button>
                      <button className="btn sm red" onClick={() => remove(s)}>Remove</button>
                    </div>
                  )}
                </div>
              )) : <div className="empty">{list.length ? "No students match your search." : "No students enrolled in this class yet."}</div>}
            </div>
            <DevFooter />
          </>
        );
      }}
    </QueryState>
  );
}
