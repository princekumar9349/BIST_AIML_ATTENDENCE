"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { mutate } from "../../lib/api";
import { finishModal, openModal, toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";

const SEMS = [1, 2, 3, 4, 5, 6, 7, 8];

function RenameDialog({ c }) {
  const [branch, setBranch] = useState(c.branch);
  const [sem, setSem] = useState(c.sem);
  const [sec, setSec] = useState(c.section);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await mutate("renameClass", [c.id, branch.trim(), sem, sec.trim()]); toast("Class renamed"); finishModal(true); }
    catch (e) { toast(errorText(e)); setSaving(false); }
  };
  return (
    <>
      <h4>Rename Class</h4>
      <p>Updates the class details and renames its Google Spreadsheet file.</p>
      <label className="lbl">Branch</label>
      <input className="inp" value={branch} onChange={(e) => setBranch(e.target.value)} />
      <div className="row2">
        <div><label className="lbl">Semester</label>
          <select className="inp" value={sem} onChange={(e) => setSem(e.target.value)}>{SEMS.map((n) => <option key={n} value={n}>Sem {n}</option>)}</select></div>
        <div><label className="lbl">Section</label><input className="inp" value={sec} style={{ textTransform: "uppercase" }} onChange={(e) => setSec(e.target.value)} /></div>
      </div>
      <div className="row2" style={{ marginTop: 14 }}>
        <button className="btn sec" onClick={() => finishModal(false)}>Cancel</button>
        <button className="btn gold" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </>
  );
}

export function ClassesCard({ defaultBranch = "AIML" }) {
  const { classes, setClassId } = useStaff();
  const [branch, setBranch] = useState(defaultBranch);
  const [sem, setSem] = useState("1");
  const [sec, setSec] = useState("A");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const list = await mutate("createClass", [branch.trim(), sem, sec.trim()], { timeout: 60000 });
      if (list?.length) setClassId(list.find((c) => c.branch.toLowerCase() === branch.trim().toLowerCase() && String(c.sem) === sem && c.section === sec.trim().toUpperCase())?.id || list[0].id);
      toast("Class workbook created");
    } catch (e) { toast(errorText(e)); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h3>Create New Class (Branch + Sem + Sec)</h3>
      <p className="hint">Creates a dedicated Google Workbook for the class</p>
      <label className="lbl">Branch</label>
      <input className="inp" value={branch} placeholder="e.g. AIML or CSE-AIML" onChange={(e) => setBranch(e.target.value)} />
      <div className="row2">
        <div><label className="lbl">Semester (1-8)</label>
          <select className="inp" value={sem} onChange={(e) => setSem(e.target.value)}>{SEMS.map((n) => <option key={n} value={n}>Semester {n}</option>)}</select></div>
        <div><label className="lbl">Section</label>
          <input className="inp" value={sec} placeholder="e.g. A" autoCapitalize="characters" style={{ textTransform: "uppercase" }} onChange={(e) => setSec(e.target.value)} /></div>
      </div>
      <button className="btn gold" style={{ marginTop: 12 }} disabled={saving} onClick={create}>{saving ? "Creating workbook…" : "+ Create Class Workbook"}</button>

      {classes.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--ln)", paddingTop: 10 }}>
          <label className="lbl">Existing Classes ({classes.length})</label>
          {classes.map((c) => (
            <div className="list-item" key={c.id}>
              <div className="info"><b>{c.label}</b><small>{c.file || ""}</small></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm sec" onClick={() => openModal(<RenameDialog c={c} />, false)}>Rename</button>
                {c.url && <a className="btn sm outline" target="_blank" rel="noopener noreferrer" href={c.url}>Sheet</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

