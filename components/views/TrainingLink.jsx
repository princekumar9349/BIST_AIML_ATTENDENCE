"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { confirmDialog, toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";
import { TTL } from "../../lib/config";

/**
 * HOD: link the Training Head's shared registry once, then choose which of THEIR classes to pull and
 * which of YOUR classes each one is compiled into. Pulling reads every training session (DSA, Aptitude, ...)
 * of the chosen classes (read-only) and compiles them into your Master sheet.
 */
export default function TrainingLink() {
  const q = useQuery("getTrainingLink", [], { ttl: TTL.slow });
  const info = q.data;
  const [url, setUrl] = useState("");
  const [picks, setPicks] = useState({}); // trainingClassId -> { on, hod }
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    if (!info?.trainingClasses) return;
    const next = {};
    info.trainingClasses.forEach((t) => { next[t.id] = { on: Boolean(t.linkedTo), hod: t.linkedTo || t.suggested || "" }; });
    setPicks(next);
  }, [info]);

  const classes = info?.trainingClasses || [];
  const hodClasses = info?.hodClasses || [];
  const selected = useMemo(() => classes.filter((t) => picks[t.id]?.on), [classes, picks]);
  const linkedCount = classes.filter((t) => t.linkedTo).length;
  const last = info?.lastPull;
  const lastText = last
    ? new Date(last.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";
  const setPick = (id, patch) => setPicks((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const link = async () => {
    if (!url.trim()) return toast("Paste the Training registry link");
    setBusy(true);
    try { await mutate("linkTrainingRegistry", [url.trim()], { timeout: 60000 }); setUrl(""); toast("Training registry linked. Now choose the classes to pull."); }
    catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const linksToSave = () => {
    if (!selected.length) { toast("Tick at least one class to pull"); return null; }
    if (selected.some((t) => !picks[t.id].hod)) { toast("Choose which of your classes each ticked class belongs to"); return null; }
    const used = selected.map((t) => picks[t.id].hod);
    if (new Set(used).size !== used.length) { toast("Two classes point to the same class of yours — each can receive one"); return null; }
    return selected.map((t) => ({ trainingClassId: t.id, hodClassId: picks[t.id].hod }));
  };

  const saveOnly = async () => {
    const links = linksToSave();
    if (!links) return;
    setBusy(true);
    try { await mutate("setTrainingClassLinks", [links]); toast("Selection saved"); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const pull = async () => {
    const links = linksToSave();
    if (!links) return;
    const describe = selected.map((t) => `${t.label} → ${hodClasses.find((h) => h.id === picks[t.id].hod)?.label || "?"} (${t.sessions.join(", ") || "no sessions yet"})`).join("; ");
    const ok = await confirmDialog({ title: `Pull ${selected.length} training class${selected.length === 1 ? "" : "es"}?`, message: describe, confirmText: "Pull & compile" });
    if (!ok) return;
    setBusy(true);
    setResults(null);
    try {
      await mutate("setTrainingClassLinks", [links]);
      const r = await mutate("syncTrainingNow", [], { timeout: 180000 });
      setResults(r.results || []);
      const bad = (r.results || []).filter((x) => !x.ok || (x.trainingStudents > 0 && x.matchedStudents === 0)).length;
      toast(bad ? "Pulled with warnings — see the details below." : `Pulled and compiled ${r.classes} class${r.classes === 1 ? "" : "es"} into the Master sheet.`);
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  // One tap: pull every class that is already linked (all branches) and compile them.
  const updateAll = async () => {
    setBusy(true);
    setResults(null);
    try {
      const r = await mutate("syncTrainingNow", [], { timeout: 180000 });
      setResults(r.results || []);
      const bad = (r.results || []).filter((x) => !x.ok || (x.trainingStudents > 0 && x.matchedStudents === 0)).length;
      toast(!r.classes ? "No class is linked yet. Tick classes below and press Pull & Compile once." : bad ? "Updated with warnings — see the details below." : `Updated ${r.classes} class${r.classes === 1 ? "" : "es"} from all branches.`);
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  // Plain-language checklist of the whole chain, so a missing tab is never a mystery.
  const check = async () => {
    setBusy(true);
    setDiag(null);
    try { setDiag(await mutate("diagnoseTraining", [], { timeout: 120000, invalidate: false })); }
    catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const unlink = async () => {
    const ok = await confirmDialog({ title: "Unlink training attendance?", message: "Master sheets go back to main attendance only. Nothing is deleted in the Training Head's files.", confirmText: "Unlink", danger: true });
    if (!ok) return;
    setBusy(true);
    try { await mutate("unlinkTrainingRegistry", []); setResults(null); toast("Training registry unlinked"); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h3>Training Attendance Link</h3>
      <p className="hint">
        The Training Head keeps training attendance in their own system and shares a registry with this Google account
        {info?.account ? <> (<b>{info.account}</b>)</> : ""}. Link it once, tick the classes you want, and pull: every training session of those classes is compiled into your Master sheet.
      </p>

      {q.loading && <div className="empty">Checking link…</div>}
      {!q.loading && q.error && !info && <div className="empty">Could not check the link. <button className="btn sm gold" onClick={() => q.refetch()}>Retry</button></div>}

      {info && !info.linked && (
        <>
          <label className="lbl">Training registry link (from the Training Head)</label>
          <input className="inp" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="hint" style={{ marginTop: 4 }}>In your Google Drive → <b>Shared with me</b> you will find “Training Attendance Share Registry”. Open it and copy its address.</p>
          <button className="btn gold" style={{ marginTop: 6 }} disabled={busy} onClick={link}>{busy ? "Linking…" : "Link Training Registry"}</button>
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

          <div className="card" style={{ background: "var(--gold-light)", margin: "10px 0" }}>
            <button className="btn gold" disabled={busy || !linkedCount} onClick={updateAll}>
              {busy ? "Updating…" : `Update All Branches Now${linkedCount ? ` (${linkedCount} class${linkedCount === 1 ? "" : "es"})` : ""}`}
            </button>
            <p className="hint" style={{ margin: "8px 0 0" }}>
              {linkedCount
                ? "One tap pulls training attendance for every class below that is ticked and saved, across all branches."
                : "Tick your classes below and press Pull & Compile once. After that, this button updates all of them in one tap."}
            </p>
            <p className="hint" style={{ margin: "4px 0 0", color: info.daily?.enabled ? "var(--ok)" : "var(--mu)", fontWeight: 800 }}>
              {info.daily?.enabled ? `Updates automatically every day at ${info.daily.hour > 12 ? info.daily.hour - 12 : info.daily.hour} ${info.daily.hour >= 12 ? "PM" : "AM"}.` : "The automatic daily update (5 PM) switches on after your first pull."}
              {last ? ` Last update: ${lastText}${last.source === "daily" ? " (automatic)" : ""} — ${last.classes} class${last.classes === 1 ? "" : "es"}${last.warnings ? `, ${last.warnings} with warnings` : ""}.` : ""}
            </p>
          </div>

          <label className="lbl">Which classes do you want to pull?</label>
          {classes.length ? classes.map((t) => {
            const pick = picks[t.id] || { on: false, hod: "" };
            return (
              <div key={t.id} style={{ border: "1px solid var(--ln)", borderRadius: 10, padding: 10, background: pick.on ? "var(--gold-light)" : "#fff", marginBottom: 8 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: 20, height: 20, flex: "none", marginTop: 2 }} checked={pick.on} onChange={(e) => setPick(t.id, { on: e.target.checked })} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 13.5 }}>{t.label}</b>
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                      {t.sessions.length
                        ? t.sessions.map((name) => <span className="tag extra" key={name}>{name}</span>)
                        : <small style={{ color: "var(--mu)" }}>No training sessions created yet</small>}
                    </span>
                  </span>
                </label>
                {pick.on && (
                  <div style={{ marginTop: 8 }}>
                    <label className="lbl" style={{ marginTop: 0 }}>Compile into your class</label>
                    <select className="inp" value={pick.hod} onChange={(e) => setPick(t.id, { hod: e.target.value })}>
                      <option value="">— choose your class —</option>
                      {hodClasses.map((h) => <option key={h.id} value={h.id}>{h.label}{h.id === t.suggested ? (t.suggestedLoose ? "  (same branch)" : "  (same name)") : ""}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          }) : <div className="empty">The Training Head has not created any class yet.</div>}

          <div className="row2" style={{ marginTop: 10 }}>
            <button className="btn gold" disabled={busy || !selected.length} onClick={pull}>{busy ? "Pulling…" : `Pull & Compile${selected.length ? ` (${selected.length})` : ""}`}</button>
            <button className="btn sec" disabled={busy} onClick={saveOnly}>Save selection</button>
          </div>

          {results && (
            <div style={{ marginTop: 12 }}>
              {results.length === 0 && <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 700, fontSize: 12.5 }}>Nothing was pulled. Tick a class and press Pull again.</div>}
              {results.map((r) => {
                const noMatch = r.trainingStudents > 0 && r.matchedStudents === 0;
                const good = r.ok && !noMatch;
                return (
                  <div key={r.classId} className="card" style={{ background: good ? "var(--okb)" : "var(--warnb)", color: good ? "var(--ok)" : "var(--warn)", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                    <b>{r.label}</b>: {r.sessions.length} training session{r.sessions.length === 1 ? "" : "s"} ({r.sessions.join(", ") || "none"}) compiled into the Master sheet.
                    {r.tabs?.length > 0 && <div style={{ fontWeight: 600, marginTop: 3 }}>Tabs added to this class's workbook: {r.tabs.join(", ")} (read-only copies).</div>}
                    {r.tabsError && <div style={{ marginTop: 4, color: "var(--bad)" }}>Could not add the training tab: {r.tabsError}</div>}
                    <div style={{ fontWeight: 600, marginTop: 3 }}>{r.matchedStudents} of {r.students} of your students have training attendance.</div>
                    {noMatch && <div style={{ marginTop: 4 }}>No enrollment numbers match between the two systems — students must have the same enrollment numbers in both.</div>}
                    {r.error && <div style={{ marginTop: 4 }}>{r.error}</div>}
                  </div>
                );
              })}
            </div>
          )}

          <button className="btn sm outline" style={{ marginTop: 10 }} disabled={busy} onClick={check}>{busy ? "Checking…" : "Check connection"}</button>
          {diag && (
            <div className="card" style={{ marginTop: 10, background: diag.ok ? "var(--okb)" : "var(--warnb)" }}>
              <b style={{ color: diag.ok ? "var(--ok)" : "var(--warn)" }}>{diag.ok ? "Everything is connected." : "Found something to fix:"}</b>
              {diag.steps.map((st, i) => (
                <div key={i} style={{ marginTop: 8, fontSize: 12.5, display: "flex", gap: 8 }}>
                  <span style={{ fontWeight: 900, color: st.ok ? "var(--ok)" : "var(--bad)" }}>{st.ok ? "✓" : "✗"}</span>
                  <span>
                    <b>{st.title}</b>
                    {st.detail && <span style={{ color: "var(--mu)", fontWeight: 600 }}> — {st.detail}</span>}
                    {st.fix && <span style={{ display: "block", color: "var(--bad)", fontWeight: 700 }}>What to do: {st.fix}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}><button className="btn sm red" disabled={busy} onClick={unlink}>Unlink</button></div>
          <p className="hint" style={{ marginBottom: 0, marginTop: 8 }}>New training attendance is picked up automatically about every 10 minutes, or straight away when you open that class's Master report.</p>
        </>
      )}
    </div>
  );
}
