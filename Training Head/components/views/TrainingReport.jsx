"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { toast } from "../../lib/ui-store";
import { TTL } from "../../lib/config";
import { errorText } from "../../lib/utils";
import { DevFooter, Empty, QueryState, SkReport, SyncPill } from "../ui";

export default function TrainingReport() {
  const { role, classId, currentClass, minPct, setTab } = useStaff();
  const [onlyLow, setOnlyLow] = useState(false);
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState(false);
  const q = useQuery("getTrainingSummary", [classId], { ttl: TTL.report, enabled: Boolean(classId) });

  if (!classId) {
    return <Empty>{role === "TRAINER" ? <>No training session has been assigned to you yet. Please contact the <b>Training Head</b>.</> : <>No classes yet.<br /><button className="btn gold sm" style={{ marginTop: 10 }} onClick={() => setTab("setup")}>+ Create First Class</button></>}</Empty>;
  }

  const rebuild = async () => {
    setBuilding(true);
    try { await mutate("rebuildTrainingMaster", [classId], { timeout: 90000 }); toast("Master sheet rebuilt in the class workbook"); }
    catch (e) { toast(errorText(e)); } finally { setBuilding(false); }
  };

  return (
    <QueryState q={q} skeleton={<SkReport />}>
      {(res) => {
        const table = res.table || [];
        const min = res.min || minPct;
        if (table.length < 3 || !res.sessions) {
          return (
            <>
              <Empty>
                No training sessions have been created for {currentClass?.label || "this class"} yet.
                {role === "TRAINING_HEAD" && <><br /><button className="btn gold sm" style={{ marginTop: 10 }} onClick={() => setTab("subjects")}>+ Add Training Session</button></>}
              </Empty>
              <DevFooter />
            </>
          );
        }
        const headers = table[0];
        const totRow = table[1];
        const rows = table.slice(2);
        const pctIdx = headers.length - 1;
        const isLow = (r) => r[pctIdx] !== "" && Number(r[pctIdx]) < min;
        const lowCount = rows.filter(isLow).length;
        const needle = search.toLowerCase();
        const shown = rows.filter((r) => (!onlyLow || isLow(r)) && (!needle || `${r[1]} ${r[2]}`.toLowerCase().includes(needle)));
        return (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <SyncPill q={q} />
              <button className="btn sm outline" onClick={() => q.refetch()}>Refresh</button>
            </div>
            <div className="row3" style={{ marginBottom: 12 }}>
              {[[rows.length, "var(--navy)", "Students"], [lowCount, "var(--bad)", `Below ${min}%`], [rows.length - lowCount, "var(--ok)", `Safe (${min}%+)`]].map(([n, color, label]) => (
                <div key={label} className="card" style={{ textAlign: "center", margin: 0, padding: "12px 8px" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color }}>{n}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color, textTransform: "uppercase" }}>{label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Training Attendance — {currentClass?.label}</h3>
              <p className="hint">Training sessions only. The HOD's Master sheet compiles this together with main attendance automatically.</p>
              <div className="row2" style={{ marginBottom: 10 }}>
                <button className={`btn sm ${onlyLow ? "red" : "sec"}`} onClick={() => setOnlyLow(!onlyLow)}>{onlyLow ? `Showing Below ${min}% Only` : `Filter Below ${min}%`}</button>
                {role === "TRAINING_HEAD" && res.masterUrl && <a className="btn sm gold" target="_blank" rel="noopener noreferrer" href={res.masterUrl}>Open Master Sheet</a>}
              </div>
              {role === "TRAINING_HEAD" && (
                <button className="btn sm outline" style={{ marginBottom: 10 }} disabled={building} onClick={rebuild}>{building ? "Rebuilding…" : "Rebuild Master Sheet"}</button>
              )}
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
      }}
    </QueryState>
  );
}
