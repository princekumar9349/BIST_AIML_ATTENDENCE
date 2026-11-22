"use client";
import { useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { toast } from "../../lib/ui-store";
import { COLLEGE_NAME, DEPT_NAME, HOD_NAME } from "../../lib/config";
import { isTrainingRole, today } from "../../lib/utils";
import { DevFooter, Empty, QueryState, SkList } from "../ui";

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast(message); } catch { toast("Could not copy text"); }
    ta.remove();
  }
}

export default function Absent() {
  const { classId, role } = useStaff();
  const [date, setDate] = useState(today());
  const q = useQuery("getAbsentees", [classId, date], { enabled: Boolean(classId) });

  if (!classId) return <Empty>No class is available yet.</Empty>;

  const copy = (d) => {
    const lines = [`*${COLLEGE_NAME}*`, `*${DEPT_NAME} - Absentee Report*`, `*Class:* ${d.label}`, `*Date:* ${d.date}`, "--------------------------------"];
    d.blocks.forEach((b) => {
      lines.push(`\n*${b.training ? "Session" : "Lecture"} ${b.lec}: ${b.subject}* (${b.absent.length}/${b.total} Absent)`);
      if (!b.absent.length) lines.push("All Present");
      else b.absent.forEach((st, i) => lines.push(`${i + 1}. ${st.e} - ${st.n}`));
    });
    lines.push(isTrainingRole(role) ? `\n_Training Department, ${COLLEGE_NAME}_` : `\n_HOD: ${HOD_NAME}_`);
    copyText(lines.join("\n"), "WhatsApp Absentee List Copied");
  };

  const dateField = (
    <>
      <label className="lbl">Select Date</label>
      <input type="date" className="inp" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
    </>
  );

  return (
    <QueryState q={q} skeleton={<><div className="card"><h3>Daily Absentee Tracker</h3><p className="hint">View lecture-wise absentees and copy formatted list for WhatsApp groups</p>{dateField}</div><SkList rows={3} /></>}>
      {(data) => {
        const blocks = data.blocks || [];
        return (
          <>
            <div className="card">
              <h3>
                <span>Absentees ({data.date})</span>
                {blocks.length > 0 && <button className="btn sm gold" onClick={() => copy(data)}>Copy for WhatsApp</button>}
              </h3>
              <p className="hint">{data.label}</p>
              {dateField}
            </div>
            {blocks.length ? blocks.map((b) => (
              <div className="card" key={`${b.lec}-${b.subject}`}>
                <h3>
                  <span>{b.training ? "Session" : "Lec"} {b.lec}: {b.subject}</span>
                  <span className={`tag ${b.absent.length ? "bad" : "ok"}`}>{b.absent.length} Absent / {b.total}</span>
                </h3>
                <p className="hint">{b.training ? (b.teacher ? `Trainer: ${b.teacher}` : "Training Session") : `Faculty: ${b.teacher || "Assigned Faculty"}`}</p>
                {b.absent.length ? (
                  <div style={{ borderTop: "1px solid var(--ln)", marginTop: 6, paddingTop: 6 }}>
                    {b.absent.map((st, i) => (
                      <div className="list-item" style={{ padding: "7px 2px" }} key={st.e}>
                        <div className="info"><b>{i + 1}. {st.n}</b><small>{st.e}</small></div>
                        <span className="tag bad">ABSENT</span>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ color: "var(--ok)", fontWeight: 800, fontSize: 13 }}>100% Attendance in this {b.training ? "session" : "lecture"}</div>}
              </div>
            )) : <Empty>No lectures marked on {data.date} for this class.</Empty>}
            <DevFooter />
          </>
        );
      }}
    </QueryState>
  );
}
