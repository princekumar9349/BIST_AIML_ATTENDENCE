"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { promptDialog, toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";
import { DevFooter, Empty, QueryState, Seg, SkList, Tag } from "../ui";
import { REGISTRY } from "../registry";

const LABELS = {
  CLASS: { seg: "Regular Subject", nameLabel: "Subject Name (e.g. Machine Learning, Deep Learning)", placeholder: "e.g. Artificial Intelligence (AL-501)", button: "Subject", tag: "CLASS SUBJECT", toast: "Subject" },
  TRAINING: { seg: "Training Session", nameLabel: "Training Name (e.g. Aptitude Training, Coding Practice)", placeholder: "e.g. Aptitude & Reasoning", button: "Training Session", tag: "TRAINING SESSION", toast: "Training session" },
  EXTRA: { seg: "Extra Activity", nameLabel: "Activity Name (e.g. AI Hackathon, NSS, Workshop)", placeholder: "e.g. Industrial Visit / Tech Fest", button: "Extra Activity", tag: "EXTRA ACTIVITY (HOD)", toast: "Extra Activity" },
};

export default function Subjects() {
  const { role, classId, currentClass, teachers, trainers } = useStaff();
  const types = REGISTRY.roles[role].subjectTypes;
  const [type, setType] = useState(types[0]);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [trainer, setTrainer] = useState("");
  const [prior, setPrior] = useState("0");
  const [saving, setSaving] = useState(false);
  const q = useQuery("listSubjects", [classId], { enabled: Boolean(classId) });

  if (!classId) return <Empty>No class is available yet.</Empty>;

  const L = LABELS[type];
  const teacherOpts = () => (
    <>
      <option value="">— Unassigned —</option>
      {teachers.map((t) => <option key={t.username} value={t.username}>{t.name} (@{t.username})</option>)}
    </>
  );
  // A trainer can teach any number of branches, so every trainer can be assigned to any session.
  const trainerOpts = () => (
    <>
      <option value="">— Unassigned —</option>
      {trainers.map((t) => <option key={t.email} value={t.email}>{t.name} ({t.email})</option>)}
    </>
  );

  const create = async () => {
    if (!name.trim()) return toast("Please enter a name");
    setSaving(true);
    try {
      await mutate("addSubject", [classId, name.trim(), type === "CLASS" ? teacher : type === "TRAINING" ? trainer : "", type, Number(prior) || 0]);
      toast(`${L.toast} created`);
      setName("");
      setPrior("0");
      setTrainer("");
    } catch (e) { toast(errorText(e)); } finally { setSaving(false); }
  };

  const editPrior = async (s) => {
    const val = await promptDialog({
      title: `Prior Total Classes (${s.subject})`,
      message: "Enter total classes held before using the app (matches 'Previous Count' column C in the Sheet):",
      placeholder: "e.g. 20", defaultValue: String(s.prior || 0), type: "number",
    });
    if (val === null) return;
    try { toast(await mutate("updatePriorTotal", [classId, s.subject, Number(val) || 0])); } catch (e) { toast(errorText(e)); }
  };

  const assign = async (s, value) => {
    try { toast(await mutate("assignTrainer", [classId, s.subject, value])); } catch (e) { toast(errorText(e)); }
  };

  const changeTeacher = async (s, value) => {
    try { toast(await mutate("changeTeacher", [classId, s.subject, value])); } catch (e) { toast(errorText(e)); }
  };

  const onlyTraining = types.length === 1 && types[0] === "TRAINING";
  return (
    <>
      <div className="card">
        <h3>{onlyTraining ? "Add Training Session" : "Add Subject or Extra Activity"}</h3>
        <p className="hint">{currentClass?.label} — Creates a dedicated sheet tab automatically</p>
        {types.length > 1 && <Seg value={type} options={types.map((t) => [t, LABELS[t].seg])} onChange={setType} />}
        <label className="lbl">{L.nameLabel}</label>
        <input className="inp" placeholder={L.placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        {type === "CLASS" && (
          <>
            <label className="lbl">Assign Faculty</label>
            <select className="inp" value={teacher} onChange={(e) => setTeacher(e.target.value)}>{teacherOpts()}</select>
          </>
        )}
        {type === "TRAINING" && (
          <>
            <label className="lbl">Assign Trainer</label>
            <select className="inp" value={trainer} onChange={(e) => setTrainer(e.target.value)}>{trainerOpts()}</select>
            {!trainers.length && <p className="hint" style={{ marginTop: 4 }}>No trainers yet. Add one in the Trainers tab, then assign them here.</p>}
          </>
        )}
        <label className="lbl">Prior Total Lectures (Total classes held before app, for Column C 'Previous Count')</label>
        <input type="number" min="0" className="inp" value={prior} placeholder="0" onChange={(e) => setPrior(e.target.value)} />
        <button className={`btn ${type === "CLASS" ? "" : "gold"}`} style={{ marginTop: 12 }} disabled={saving} onClick={create}>
          {saving ? "Creating…" : `+ Create ${L.button}`}
        </button>
      </div>

      <div className="card">
        <QueryState q={q} skeleton={<SkList rows={3} />}>
          {(list) => (
            <>
              <h3>{onlyTraining ? "Training Sessions" : "Configured Subjects & Activities"} ({list.length})</h3>
              {list.length ? list.map((s) => {
                const t = s.type || "CLASS";
                return (
                  <div className="list-item" key={s.sheet} style={{ flexWrap: "wrap", gap: 8 }}>
                    <div className="info" style={{ minWidth: 160 }}>
                      <b>{s.subject}</b>
                      <div style={{ marginTop: 3, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                        <Tag kind={t === "CLASS" ? "" : "extra"}>{(LABELS[t] || LABELS.CLASS).tag}</Tag>
                        <button className="tag" style={{ cursor: "pointer", background: "#fff" }} onClick={() => editPrior(s)} title="Edit Prior Total Classes">
                          Edit Prior Total: {s.prior || 0} lecs
                        </button>
                      </div>
                    </div>
                    {t === "TRAINING" && role === "TRAINING_HEAD" && (
                      <select className="inp" style={{ width: "auto", minWidth: 165, padding: "7px 10px", fontSize: 12 }} defaultValue={s.teacher} onChange={(e) => assign(s, e.target.value)}>
                        {trainerOpts()}
                      </select>
                    )}
                    {t === "CLASS" && role === "HOD" && (
                      <select className="inp" style={{ width: "auto", minWidth: 165, padding: "7px 10px", fontSize: 12 }} defaultValue={s.teacher} onChange={(e) => changeTeacher(s, e.target.value)}>
                        {teacherOpts()}
                      </select>
                    )}
                  </div>
                );
              }) : <div className="empty">{onlyTraining ? "No training sessions created for this class yet." : "No subjects created for this class yet."}</div>}
            </>
          )}
        </QueryState>
      </div>
      <DevFooter />
    </>
  );
}
