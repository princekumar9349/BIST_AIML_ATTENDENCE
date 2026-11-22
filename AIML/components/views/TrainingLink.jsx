"use client";
import { useEffect, useState } from "react";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { cacheKeyFor } from "../../lib/api";
import { cacheSet } from "../../lib/cache";
import { confirmDialog, toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";
import { TTL } from "../../lib/config";

/**
 * HOD: link the Training Head's shared registry once, then choose which branches to pull.
 * The HOD backend reads those branches' training workbooks (read-only) and compiles them into the
 * Master sheet automatically, so nothing needs to be exported or pasted by hand.
 */
export default function TrainingLink() {
  const q = useQuery("getTrainingLink", [], { ttl: TTL.slow });
  const info = q.data;
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (info) setPicked(info.enabled || []);
  }, [info]);

  const store = (data) => cacheSet(cacheKeyFor("getTrainingLink", []), data);
  const run = async (fn, args, success) => {
    setBusy(true);
    try {
      const res = await mutate(fn, args, { timeout: 60000 });
      store(res.registryUrl !== undefined ? res : info);
      if (success) toast(success);
      return res;
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const link = async () => {
    if (!url.trim()) return toast("Paste the Training registry link");
    const res = await run("linkTrainingRegistry", [url.trim()], "Training registry linked. Now choose the branches to pull.");
    if (res) setUrl("");
  };
  const saveBranches = () => run("setTrainingBranches", [picked.map((key) => info.branches.find((b) => b.key === key)?.branch || key)], "Training branches saved. The Master sheets are refreshing.");
  const unlink = async () => {
    const ok = await confirmDialog({ title: "Unlink training attendance?", message: "Master sheets go back to main attendance only. Nothing is deleted in the Training Head's files.", confirmText: "Unlink", danger: true });
    if (ok) run("unlinkTrainingRegistry", [], "Training registry unlinked");
  };
  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  return (
    <div className="card">
      <h3>Training Attendance Link</h3>
      <p className="hint">
        The Training Head keeps training attendance in their own system and shares one registry sheet with this Google account
        {info?.account ? <> (<b>{info.account}</b>)</> : ""}. Link it once, pick the branches, and the Master sheet shows main + training attendance together.
      </p>

      {q.loading && <div className="empty">Checking link…</div>}
      {!q.loading && q.error && !info && <div className="empty">Could not check the link. <button className="btn sm gold" onClick={() => q.refetch()}>Retry</button></div>}

      {info && !info.linked && (
        <>
          <label className="lbl">Training registry link (from the Training Head)</label>
          <input className="inp" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn gold" style={{ marginTop: 10 }} disabled={busy} onClick={link}>{busy ? "Linking…" : "Link Training Registry"}</button>
        </>
      )}

      {info?.linked && (
        <>
          {info.error ? (
            <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 800, fontSize: 12, padding: "9px 12px" }}>{info.error}</div>
          ) : (
            <p className="hint" style={{ color: "var(--ok)", fontWeight: 800 }}>
              Linked to “{info.registryName}”. <a href={info.registryUrl} target="_blank" rel="noopener noreferrer">Open</a>
            </p>
          )}
          <label className="lbl">Branches to pull into the Master sheet</label>
          {info.branches.length ? (
            <div style={{ display: "grid", gap: 8, margin: "6px 0" }}>
              {info.branches.map((b) => (
                <label key={b.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1px solid var(--ln)", borderRadius: 10, background: "#fff", fontWeight: 800 }}>
                  <input type="checkbox" checked={picked.includes(b.key)} onChange={() => toggle(b.key)} />
                  <span style={{ flex: 1 }}>{b.branch}
                    <small style={{ display: "block", color: "var(--mu)", fontWeight: 600 }}>
                      {b.subjects} training session{b.subjects === 1 ? "" : "s"} • {b.matched} of {b.trainingClasses} class{b.trainingClasses === 1 ? "" : "es"} match yours by semester &amp; section
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : <div className="empty">The registry has no classes yet.</div>}
          <div className="row2" style={{ marginTop: 10 }}>
            <button className="btn gold" disabled={busy} onClick={saveBranches}>{busy ? "Saving…" : "Save Branches"}</button>
            <button className="btn sec" disabled={busy} onClick={() => run("syncTrainingNow", [], "Training attendance refreshed")}>Pull Now</button>
          </div>
          <button className="btn sm red" style={{ marginTop: 10 }} disabled={busy} onClick={unlink}>Unlink</button>
          <p className="hint" style={{ marginBottom: 0, marginTop: 8 }}>New training attendance is picked up automatically about every 10 minutes, or immediately when you open a class Master report.</p>
        </>
      )}
    </div>
  );
}
