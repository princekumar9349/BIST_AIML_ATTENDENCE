"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { TTL } from "../../lib/config";
import { DevFooter, QueryState, SkStudent, SyncPill } from "../ui";

const inRange = (record, from, to) => {
  const date = String(record.d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to);
};

function forRange(source, from, to) {
  const limit = (list, extra) => (list || []).map((s) => {
    const records = (s.records || []).filter((r) => inRange(r, from, to));
    if (extra) {
      const p = records.reduce((sum, r) => sum + (Number(String(r.s).split("/")[0]) || 0), 0);
      const t = records.reduce((sum, r) => sum + (Number(String(r.s).split("/")[1]) || 0), 0);
      return { ...s, records, p, t };
    }
    const p = records.filter((r) => r.s === "P").length;
    const t = records.filter((r) => r.s === "P" || r.s === "A").length;
    return { ...s, records, p, t, pct: t ? Math.round((p * 1000) / t) / 10 : null };
  });
  const subjects = limit(source.subjects), training = limit(source.training), extras = limit(source.extras, true);
  const sum = (a, k) => a.reduce((n, x) => n + x[k], 0);
  const p = sum(subjects, "p") + sum(training, "p") + sum(extras, "p");
  const t = sum(subjects, "t") + sum(training, "t");
  return { ...source, subjects, training, extras, p, t, overall: t ? Math.round(Math.min(100, (p * 100) / t) * 10) / 10 : null };
}

function SubjectCard({ s, d, ranged, col, needMore, label }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <b style={{ fontSize: 14.5, color: "var(--navy)" }}>{s.subject}</b>
          <div style={{ fontSize: 11.5, color: "var(--mu)" }}>{label}</div>
        </div>
        <b style={{ fontSize: 18, color: col(s.pct) }}>{s.pct == null ? "–" : `${s.pct}%`}</b>
      </div>
      <div className="pbar"><i style={{ width: `${Math.min(100, s.pct || 0)}%`, background: col(s.pct) }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--mu)", fontWeight: 700 }}>
        <span>{s.p} Present / {s.t} Classes</span>
        {s.pct != null && s.pct < d.min && <span style={{ color: "var(--bad)" }}>{ranged ? `Below ${d.min}% in this period` : `Need ${needMore(s.p, s.t)} more for ${d.min}%`}</span>}
      </div>
      {s.records?.length > 0 && (
        <details style={{ marginTop: 8, borderTop: "1px solid var(--ln)", paddingTop: 6 }}>
          <summary style={{ fontSize: 12, fontWeight: 800, color: "var(--navy)", cursor: "pointer" }}>Day-wise Attendance Log ({s.records.length})</summary>
          <div className="rec-pills">{s.records.map((r, i) => <span key={i} className={r.k}>{r.d} • {r.s}</span>)}</div>
        </details>
      )}
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useStaff();
  const q = useQuery("getMyAttendance", [], { ttl: TTL.student });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [range, setRange] = useState({ from: "", to: "" });
  const ranged = Boolean(range.from || range.to);

  return (
    <QueryState q={q} skeleton={<SkStudent />}>
      {(source) => {
        const d = ranged ? forRange(source, range.from, range.to) : source;
        const col = (p) => (p == null ? "var(--mu)" : p >= d.min ? "var(--ok)" : p >= d.min - 10 ? "var(--warn)" : "var(--bad)");
        const needMore = (p, t) => {
          const m = d.min / 100;
          if (m >= 1) return Math.max(0, t - p);
          return Math.max(0, Math.ceil((m * t - p) / (1 - m)));
        };
        const extrasSum = (d.extras || []).reduce((a, x) => a + (x.p || 0), 0);
        const hasTraining = (d.training || []).length > 0;
        const head = (text) => <div style={{ fontSize: 12, fontWeight: 900, color: "var(--navy)", textTransform: "uppercase", margin: "14px 4px 8px", letterSpacing: "0.04em" }}>{text}</div>;
        return (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SyncPill q={q} label="Saved on device • Synced" />
              <button className="btn sm sec" onClick={() => q.refetch()}>Refresh</button>
            </div>

            <div className="card">
              <h3>Attendance by Date Range</h3>
              <p className="hint">Choose a period to see your attendance and day-wise records within those dates.</p>
              <div className="row2">
                <div><label className="lbl" htmlFor="af">From</label><input id="af" className="inp" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></div>
                <div><label className="lbl" htmlFor="at">To</label><input id="at" className="inp" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></div>
              </div>
              <div className="row2" style={{ marginTop: 8 }}>
                <button className="btn gold" onClick={() => draft.from && draft.to && draft.from > draft.to ? null : setRange(draft)}>Show Attendance</button>
                <button className="btn sec" onClick={() => { setDraft({ from: "", to: "" }); setRange({ from: "", to: "" }); }}>Clear Dates</button>
              </div>
              {ranged && <p className="hint" style={{ marginBottom: 0 }}>Showing {range.from || "all recorded dates"} through {range.to || "today"}. Percentages use classes marked in this period.</p>}
            </div>

            <div className="card" style={{ textAlign: "center", position: "relative" }}>
              <div className="ring-wrap" style={{ background: `conic-gradient(${col(d.overall)} ${(d.overall || 0) * 3.6}deg, var(--ln) 0)` }}>
                <div className="ring-inner"><b style={{ color: col(d.overall) }}>{d.overall == null ? "–" : `${d.overall}%`}</b><small>Min {d.min}%</small></div>
              </div>
              <h3 style={{ justifyContent: "center", fontSize: 16, marginTop: 6 }}>{user.name}</h3>
              <p className="hint" style={{ marginBottom: 8 }}>
                <b>{d.p}</b> total credit / <b>{d.t}</b> classes{hasTraining ? " (incl. training)" : ""}
                {extrasSum > 0 && <> <span className="tag extra">+{extrasSum} Extra Bonus</span></>}
              </p>
              {d.overall != null && d.overall < d.min
                ? <span className="tag bad" style={{ padding: "5px 12px", fontSize: 11.5 }}>{ranged ? `Below ${d.min}% for this period` : <>Below {d.min}% — Attend next <b>{needMore(d.p, d.t)}</b> classes continuously</>}</span>
                : d.overall != null
                  ? <span className="tag ok" style={{ padding: "5px 12px", fontSize: 11.5 }}>{ranged ? "On Track for this period" : `On Track (Above ${d.min}% requirement)`}</span>
                  : <span className="tag">{ranged ? "No classes marked in this period" : "No classes recorded yet"}</span>}
            </div>

            {head(`Subject-wise Attendance (${(d.subjects || []).length})`)}
            {(d.subjects || []).length
              ? d.subjects.map((s) => <SubjectCard key={s.subject} {...{ s, d, ranged, col, needMore }} label={s.teacher ? `Prof. ${s.teacher}` : "AIML Faculty"} />)
              : <div className="card empty">No subjects added to your class yet.</div>}

            {hasTraining && <>
              {head(`Training Attendance (${d.training.length})`)}
              {d.training.map((s) => <SubjectCard key={s.subject} {...{ s, d, ranged, col, needMore }} label="Training Session" />)}
            </>}

            {(d.extras || []).length > 0 && <>
              {head("Extra Activities & Bonus Credits")}
              {d.extras.map((ex) => (
                <div className="card" key={ex.subject}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <b style={{ fontSize: 14, color: "var(--navy)" }}>{ex.subject}</b>
                      <div style={{ fontSize: 11.5, color: "var(--mu)" }}>Bonus lectures credited: <b>+{ex.p}</b> (out of {ex.t} conducted)</div>
                    </div>
                    <span className="tag extra">+{ex.p} Lecs</span>
                  </div>
                  {ex.records?.length > 0 && <div className="rec-pills" style={{ marginTop: 8 }}>{ex.records.map((r, i) => <span key={i} className={r.k}>{r.d}: {r.s}</span>)}</div>}
                </div>
              ))}
            </>}
            <DevFooter />
          </>
        );
      }}
    </QueryState>
  );
}
