"use client";
import { useMemo, useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { cacheKeyFor, mutate } from "../../lib/api";
import { cacheSet } from "../../lib/cache";
import { confirmDialog, toast } from "../../lib/ui-store";
import { TTL } from "../../lib/config";
import { errorText } from "../../lib/utils";
import { DevFooter, Empty, QueryState, SkReport, SyncPill } from "../ui";

function defaulterStatus(r) {
  const parts = [`Reminder emails sent to ${r.sent} of ${r.defaulters} defaulters`];
  if (r.missingEmail) parts.push(`${r.missingEmail} missing email`);
  if (r.failed) parts.push(`${r.failed} not sent`);
  if (r.reason) parts.push(r.reason);
  if (r.error) parts.push(`Email error: ${r.error}`);
  return parts.join("; ") + ".";
}

function downloadXlsx(result) {
  const bin = atob(result.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.fileName || "Attendance-Filtered-Report.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function Report() {
  const { classId, classes, currentClass, minPct, setTab } = useStaff();
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [range, setRange] = useState({ from: "", to: "" });
  const [onlyLow, setOnlyLow] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const hasRange = Boolean(range.from && range.to);

  const q = useQuery(hasRange ? "getSummaryByDateRange" : "getSummary", hasRange ? [classId, range.from, range.to] : [classId],
    { ttl: TTL.report, enabled: Boolean(classId) });

  if (!classId) {
    return <Empty>No Class created yet.<br /><button className="btn gold sm" style={{ marginTop: 10 }} onClick={() => setTab("setup")}>+ Create First Class in Setup</button></Empty>;
  }

  const apply = () => {
    if (!draft.from || !draft.to) return toast("Choose both start and end dates");
    if (draft.from > draft.to) return toast("Start date must be before end date");
    setRange(draft);
    setOnlyLow(false);
  };

  const resync = async () => {
    setBusy(true);
    try {
      const res = await mutate("forceRecompile", [classId], { timeout: 60000 });
      cacheSet(cacheKeyFor("getSummary", [classId]), res);
      toast("Master sheet and manual counts synced");
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const pullTraining = async () => {
    setBusy(true);
    try {
      const res = await mutate("syncTrainingNow", [classId], { timeout: 60000 });
      if (res.summary) cacheSet(cacheKeyFor("getSummary", [classId]), res.summary);
      toast(res.classes ? "Training attendance pulled and compiled" : "No training data is linked for this class");
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  const sendReminders = async (count) => {
    if (!count) return toast("There are no defaulters to email");
    const ok = await confirmDialog({
      title: "Send attendance reminders?",
      message: `Send an email to students below ${minPct}% attendance in ${currentClass?.label || "this class"}? Students without a valid email address will be skipped.`,
      confirmText: "Send Emails",
    });
    if (!ok) return;
    try { toast(defaulterStatus(await mutate("sendDefaulterReminders", [classId], { timeout: 90000, invalidate: false }))); }
    catch (e) { toast(errorText(e)); }
  };

  const exportRange = async () => {
    setBusy(true);
    try {
      const r = await mutate("exportAttendanceRangeXlsx", [classId, range.from, range.to], { timeout: 90000, invalidate: false });
      downloadXlsx(r);
      toast(`Workbook exported for ${r.range.start} to ${r.range.end}`);
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <QueryState q={q} skeleton={<SkReport />}>
      {(res) => <ReportBody {...{ res, q, minPct: res.min || minPct, onlyLow, setOnlyLow, search, setSearch, draft, setDraft, range, apply, busy,
        clear: () => { setRange({ from: "", to: "" }); setDraft({ from: "", to: "" }); setOnlyLow(false); },
        resync, pullTraining, sendReminders, exportRange }} />}
    </QueryState>
  );
}

function ReportBody({ res, q, minPct, onlyLow, setOnlyLow, search, setSearch, draft, setDraft, range, apply, clear, busy, resync, pullTraining, sendReminders, exportRange }) {
  const table = res.table || [];
  const rows = useMemo(() => table.slice(2), [table]);
  if (table.length < 2) return <><Empty>No attendance data available yet.</Empty><DevFooter /></>;

  const headers = table[0];
  const totRow = table[1];
  const pctIdx = headers.length - 1;
  const periodSessions = totRow.slice(3, pctIdx - 1).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const isLow = (r) => r[pctIdx] !== "" && Number(r[pctIdx]) < minPct;
  const lowCount = rows.filter(isLow).length;
  const needle = search.toLowerCase();
  const shown = rows.filter((r) => (!onlyLow || isLow(r)) && (!needle || `${r[1]} ${r[2]}`.toLowerCase().includes(needle)));
  const trainingInfo = res.training;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <SyncPill q={q} />
        <div style={{ display: "flex", gap: 6 }}>
          {trainingInfo?.linked && <button className="btn sm outline" disabled={busy} onClick={pullTraining}>Pull Training</button>}
          <button className="btn sm outline" disabled={busy} onClick={resync} title="Click after editing Previous Count in Excel/Sheet">Sync Sheet Edits</button>
        </div>
      </div>

      {trainingInfo?.linked && (
        <div className="card" style={{ background: "var(--okb)", color: "var(--ok)", fontWeight: 800, fontSize: 12, padding: "9px 12px" }}>
          Includes training attendance from the Training Head: {(trainingInfo.names || []).join(", ") || `${trainingInfo.sessions} session${trainingInfo.sessions === 1 ? "" : "s"}`}.
          TOTAL and PERCENTAGE combine main + training.
        </div>
      )}
      {trainingInfo?.linked && trainingInfo.trainingStudents > 0 && trainingInfo.matchedStudents === 0 && (
        <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 800, fontSize: 12, padding: "9px 12px" }}>
          Training attendance was found, but none of its enrollment numbers match this class's students, so nothing was added. Check the enrollment numbers in both systems.
        </div>
      )}
      {trainingInfo?.error && (
        <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 800, fontSize: 12, padding: "9px 12px" }}>
          The linked training workbook could not be read: {trainingInfo.error}
        </div>
      )}

      <div className="card">
        <h3>Attendance by Date Range</h3>
        <p className="hint">View class attendance between two dates. Percentages use only marked lectures in that period.</p>
        <div className="row2">
          <div><label className="lbl" htmlFor="rf">From</label><input id="rf" className="inp" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></div>
          <div><label className="lbl" htmlFor="rt">To</label><input id="rt" className="inp" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></div>
        </div>
        <div className="row2" style={{ marginTop: 8 }}>
          <button className="btn gold" onClick={apply}>Show Period</button>
          <button className="btn sec" onClick={clear}>Show All-Time Report</button>
        </div>
        {res.range && (
          <>
            <p className="hint" style={{ marginBottom: 0 }}>Showing {res.range.start} through {res.range.end}.</p>
            {!periodSessions && <p className="hint" style={{ margin: "6px 0 0", color: "var(--warn)" }}>No attendance sessions were found for these dates. Try a wider date range or confirm attendance was saved for this class.</p>}
            <button className="btn gold" style={{ marginTop: 10 }} disabled={busy} onClick={exportRange}>Export Filtered Excel Workbook</button>
          </>
        )}
      </div>

      <div className="row3" style={{ marginBottom: 12 }}>
        {[[rows.length, "var(--navy)", "Students"], [lowCount, "var(--bad)", `Below ${minPct}%`], [rows.length - lowCount, "var(--ok)", `Safe (${minPct}%+)`]].map(([n, color, label]) => (
          <div key={label} className="card" style={{ textAlign: "center", margin: 0, padding: "12px 8px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{n}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color, textTransform: "uppercase" }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row2" style={{ marginBottom: 10 }}>
          <button className={`btn sm ${onlyLow ? "red" : "sec"}`} onClick={() => setOnlyLow(!onlyLow)}>
            {onlyLow ? `Showing Below ${minPct}% Only` : `Filter Defaulters (Below ${minPct}%)`}
          </button>
          {!res.range && <button className="btn sm gold" disabled={!lowCount} onClick={() => sendReminders(lowCount)}>Email {lowCount} Defaulters</button>}
          <a className="btn sm gold" target="_blank" rel="noopener noreferrer" href={res.url || "#"}>Open Master Sheet</a>
        </div>
        <input className="inp" placeholder="Search student name or enrollment no…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
        {shown.length ? (
          <div className="table-wrap">
            <table className="master-tbl">
              <thead>
                <tr>{headers.map((h, i) => <th key={i} className={i === 2 ? "name-col" : ""}>{h}</th>)}</tr>
                <tr className="tot-row">{totRow.map((c, i) => <td key={i} className={i === 2 ? "name-col" : ""}>{c}{i === pctIdx && c !== "" ? "%" : ""}</td>)}</tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const low = isLow(r);
                  return (
                    <tr key={r[1]}>
                      {r.map((c, j) => {
                        const isPct = j === pctIdx && c !== "";
                        return <td key={j} className={j === 2 ? "name-col" : isPct ? (low ? "low-cell" : "ok-cell") : ""}>{c}{isPct ? "%" : ""}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">No students match this filter.</div>}
      </div>
      <DevFooter />
    </>
  );
}
