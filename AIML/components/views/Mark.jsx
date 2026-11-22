"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStaff } from "../ctx";
import { useQuery } from "../../lib/useQuery";
import { cacheKeyFor, mutate, mutateMany } from "../../lib/api";
import { cacheSet } from "../../lib/cache";
import { pendingFor, queueAdd, queueDiscard, queueFlush, useQueue } from "../../lib/queue";
import { toast } from "../../lib/ui-store";
import { TTL, HOD_NAME } from "../../lib/config";
import { errorText, isClassScoped, today } from "../../lib/utils";
import { DevFooter, Empty, QueryState, SkList, Tag } from "../ui";

const typeOf = (s) => s.type || "CLASS";

function addDays(date, n) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- subject list ---------- */
export default function Mark() {
  const { role, classId, setTab } = useStaff();
  const classScoped = isClassScoped(role);
  const [open, setOpen] = useState(null);
  const q = useQuery("listSubjects", [classScoped ? classId : ""], { ttl: TTL.staff, enabled: !classScoped || Boolean(classId) });
  const queue = useQueue();

  if (classScoped && !classId) return <Empty>{role === "TRAINER" ? <>No branch has been assigned to your account yet. Please contact the <b>Training Head</b>.</> : "No Class created yet."}</Empty>;
  if (open) return <AttendanceSheet subject={open} onBack={() => setOpen(null)} />;

  const emptyMessage = () => {
    if (role === "HOD") return <>No subjects or extra activities in this class yet.<br /><button className="btn gold sm" style={{ marginTop: 10 }} onClick={() => setTab("subjects")}>+ Add Subject / Activity</button></>;
    if (role === "TRAINING_HEAD") return <>No training sessions in this class yet.<br /><button className="btn gold sm" style={{ marginTop: 10 }} onClick={() => setTab("subjects")}>+ Add Training Session</button></>;
    if (role === "TRAINER") return <>No training sessions have been created for this class yet. Please ask the Training Head to add one.</>;
    return <>No subjects assigned to you yet. Please contact {HOD_NAME}.</>;
  };

  return (
    <>
      {queue.some((x) => x.error) && <QueueProblems queue={queue} />}
      <QueryState q={q} skeleton={<SkList rows={4} />}>
        {(subjects) => {
          if (!subjects.length) return <><Empty>{emptyMessage()}</Empty><DevFooter /></>;
          const regular = subjects.filter((s) => typeOf(s) === "CLASS");
          const training = subjects.filter((s) => typeOf(s) === "TRAINING");
          const extras = subjects.filter((s) => typeOf(s) === "EXTRA");
          const Item = ({ s, button, tag }) => (
            <div className="list-item" style={{ cursor: "pointer" }} onClick={() => setOpen(s)}>
              <div className="info">
                <b>{s.subject}</b>
                <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {tag}
                  <Tag>{s.cls}</Tag>
                  {typeOf(s) === "CLASS" && s.teacher && <span className="tag" style={{ background: "#f1f5f9", color: "var(--mu)", borderColor: "var(--ln)" }}>@{s.teacher}</span>}
                </div>
              </div>
              <button className={`btn sm ${typeOf(s) === "EXTRA" ? "gold" : ""}`}>{button}</button>
            </div>
          );
          return (
            <>
              {regular.length > 0 && (
                <div className="card">
                  <h3>Regular Class Subjects</h3>
                  <p className="hint">Tap a subject to mark or edit daily lecture attendance (P / A)</p>
                  {regular.map((s) => <Item key={s.sheet} s={s} button="Mark" />)}
                </div>
              )}
              {training.length > 0 && (
                <div className="card">
                  <h3>Training Sessions</h3>
                  <p className="hint">Tap a training session to mark or edit attendance (P / A).{role === "TRAINER" || role === "TRAINING_HEAD" ? " The HOD's Master sheet picks this up automatically." : ""}</p>
                  {training.map((s) => <Item key={s.sheet} s={s} button="Mark" tag={<Tag kind="extra">TRAINING</Tag>} />)}
                </div>
              )}
              {extras.length > 0 && (
                <div className="card">
                  <h3>Extra Activities / Bonus Lectures (HOD)</h3>
                  <p className="hint">Award bonus lecture counts (Workshops, Hackathons, Seminars, Sports)</p>
                  {extras.map((s) => <Item key={s.sheet} s={s} button="Award" tag={<Tag kind="extra">EXTRA ACTIVITY</Tag>} />)}
                </div>
              )}
              <DevFooter />
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function QueueProblems({ queue }) {
  return (
    <div className="card" style={{ background: "var(--badb)" }}>
      <h3 style={{ color: "var(--bad)" }}>Saved entries the server rejected</h3>
      {queue.filter((x) => x.error).map((x) => (
        <div key={x.id} className="list-item">
          <div className="info">
            <b>{x.subject} — {x.date}, #{x.sess}</b>
            <small style={{ color: "var(--bad)" }}>{x.error}</small>
          </div>
          <button className="btn sm red" onClick={() => queueDiscard(x.id)}>Discard</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- the attendance sheet ---------- */
function initialRows(data, extra, pending) {
  return (data.rows || []).map((row) => {
    const queued = pending && Object.prototype.hasOwnProperty.call(pending.marks, row.e) ? pending.marks[row.e] : undefined;
    const value = queued !== undefined ? queued : row.s;
    return { e: row.e, n: row.n, // Extra activity: null = student did not take part (nothing is stored for them).
    s: extra ? (value !== null && value !== "" && value !== undefined ? Number(value) : null) : value === "A" ? "A" : "P" };
  });
}

function AttendanceSheet({ subject, onBack }) {
  const { role, classId, minPct } = useStaff();
  const extra = typeOf(subject) === "EXTRA";
  const training = typeOf(subject) === "TRAINING";
  const [date, setDate] = useState(today());
  // Lectures taken in this save, in the order they were tapped. The first one drives what is loaded;
  // every selected lecture receives the same attendance (e.g. two back-to-back lectures, or 2 and 5).
  const [sessList, setSessList] = useState(["1"]);
  const sess = sessList[0];
  const [lecs, setLecs] = useState(2);
  const [rawRows, setRows] = useState([]);
  const [rowsKey, setRowsKey] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(() => { try { return localStorage.getItem("bist_auto_defaulter_reminders") !== "off"; } catch { return true; } });
  const dirty = useRef(false);
  const loadedFor = useRef("");
  const sheetClassId = subject.classId || classId;

  const q = useQuery("getAttendanceSheet", [sheetClassId, subject.subject, date, sess], { ttl: 20000 });
  const data = q.data;
  const key = `${sheetClassId}|${subject.subject}|${date}|${sess}`;

  // Rows only ever belong to the lecture they were loaded for, so changing the date can never
  // show (or save) another day's marks.
  const rows = rowsKey === key ? rawRows : [];

  useEffect(() => {
    if (!data) return;
    // Re-initialise on a new lecture/date, or when fresh data arrives and the user has not edited yet.
    if (loadedFor.current !== key || !dirty.current) {
      loadedFor.current = key;
      dirty.current = false;
      setRows(initialRows(data, extra, pendingFor(sheetClassId, subject.subject, date, sess)));
      setRowsKey(key);
      if (extra) setLecs(data.lecs || 2);
    }
  }, [data, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn) => { dirty.current = true; setRows(fn); };
  const toggle = (i) => edit((r) => r.map((x, idx) => (idx === i ? { ...x, s: x.s === "P" ? "A" : "P" } : x)));
  const setAll = (value) => edit((r) => r.map((x) => ({ ...x, s: value })));
  const toggleParticipant = (i) => edit((r) => r.map((x, idx) => (idx === i ? { ...x, s: x.s === null ? lecs : null } : x)));
  const setExtra = (i, value) => edit((r) => r.map((x, idx) => (idx === i ? { ...x, s: Math.max(0, Math.min(lecs, parseInt(value, 10) || 0)) } : x)));

  const limited = role === "TEACHER" || role === "TRAINER";
  const min = limited ? addDays(today(), -2) : undefined;
  const pending = pendingFor(sheetClassId, subject.subject, date, sess);

  const counts = useMemo(() => {
    if (extra) { const taking = rows.filter((r) => r.s !== null).length; return [["Taking part", taking, "ok"], ["Not in activity", rows.length - taking, "mu"]]; }
    const p = rows.filter((r) => r.s === "P").length;
    return [["Present", p, "ok"], ["Absent", rows.length - p, "bad"]];
  }, [rows, extra]);

  const lectures = extra ? [sess] : [...sessList].sort((a, b) => Number(a) - Number(b));
  const toggleLecture = (n) => {
    const v = String(n);
    setSessList((list) => (list.includes(v) ? (list.length > 1 ? list.filter((x) => x !== v) : list) : [...list, v]));
  };
  const twoBackToBack = () => {
    const a = Number(sess);
    setSessList([String(a), String(a < 8 ? a + 1 : a - 1)]);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const marks = {};
    rows.forEach((r) => { marks[r.e] = r.s; });
    const argsFor = (l) => [sheetClassId, subject.subject, date, l, extra ? lecs : null, marks];
    const optimistic = (l) => cacheSet(cacheKeyFor("getAttendanceSheet", [sheetClassId, subject.subject, date, l]), { rows: rows.map((r) => ({ e: r.e, n: r.n, s: r.s === null ? null : String(r.s) })), lecs: extra ? lecs : null, exists: true, extra });
    const word = (extra || training ? "session" : "lecture");
    try {
      let saved = lectures;
      if (lectures.length === 1) {
        const message = await mutate("saveAttendance", argsFor(lectures[0]), { retries: 1, timeout: 30000 });
        optimistic(lectures[0]);
        toast(message);
      } else {
        const results = await mutateMany(lectures.map((l) => ({ fn: "saveAttendance", args: argsFor(l) })));
        saved = lectures.filter((_, i) => results[i]?.ok);
        saved.forEach(optimistic);
        const failed = results.find((r) => !r?.ok);
        if (!saved.length) { toast(failed?.error || "Could not save"); return; }
        if (failed) {
          const notSaved = lectures.filter((l) => !saved.includes(l));
          toast(`Saved ${word}${saved.length > 1 ? "s" : ""} ${saved.join(" & ")}; ${word}${notSaved.length > 1 ? "s" : ""} ${notSaved.join(" & ")} failed: ${failed.error}`);
        }
        else {
          const p = rows.filter((r) => r.s === "P").length;
          toast(`Saved ${saved.length} ${word}s (${saved.join(" & ")}): ${p} present, ${rows.length - p} absent in each`);
        }
        if (failed) { dirty.current = true; return; }
      }
      dirty.current = false;
      if (role === "HOD" && !extra && !training && remind) {
        try {
          const r = await mutate("sendDefaulterReminders", [sheetClassId], { timeout: 90000, invalidate: false });
          toast(`Attendance saved. Reminder emails sent: ${r.sent} of ${r.defaulters} defaulters${r.missingEmail ? `, ${r.missingEmail} missing email` : ""}.`);
        } catch (e) { toast(`Attendance saved, but reminders failed: ${errorText(e)}`); }
      }
    } catch (e) {
      if (e.kind === "network") {
        // Weak or no signal: keep it on the phone and sync automatically.
        lectures.forEach((l) => {
          queueAdd({ classId: sheetClassId, subject: subject.subject, date, sess: l, lecs: extra ? lecs : null, marks, cls: subject.cls });
          optimistic(l);
        });
        dirty.current = false;
        toast(`No connection — saved on this phone${lectures.length > 1 ? ` for ${lectures.length} ${word}s` : ""}. It will sync automatically when you are back online.`);
        queueFlush();
      } else toast(errorText(e));
    } finally { setSaving(false); }
  };

  const filtered = rows.map((r, idx) => ({ ...r, idx })).filter((r) => `${r.e} ${r.n}`.toLowerCase().includes(query.toLowerCase()));
  const sessionWord = extra || training ? "Session" : "Lecture";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button className="btn sec sm" onClick={onBack}>Back to Subjects</button>
        <span className={`tag ${pending ? "bad" : data?.exists ? "ok" : ""}`}>{pending ? "Saved on phone — waiting to sync" : data?.exists ? "Previously Saved (Editing)" : "New Entry"}</span>
      </div>

      <div className="card">
        <h3><span>{subject.subject}</span>{extra ? <Tag kind="extra">EXTRA</Tag> : training ? <Tag kind="extra">TRAINING</Tag> : <Tag>REGULAR</Tag>}</h3>
        <p className="hint">{subject.cls}{limited ? " • You can edit today and the previous two days." : ""}</p>
        <div className={extra ? "row3" : ""}>
          <div>
            <label className="lbl">Date</label>
            <input type="date" className="inp" value={date} min={min} max={limited ? today() : undefined} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          {extra && (
            <div>
              <label className="lbl">Session #</label>
              <select className="inp" value={sess} onChange={(e) => setSessList([e.target.value])}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Session {n}</option>)}
              </select>
            </div>
          )}
          {extra && (
            <div>
              <label className="lbl">Total lectures</label>
              <input type="number" min="1" max="99" className="inp" value={lecs}
                onChange={(e) => { const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)); setLecs(v); dirty.current = true; setRows((r) => r.map((x) => ({ ...x, s: x.s === null ? null : Math.min(v, Number(x.s) || 0) }))); }} />
            </div>
          )}
        </div>

        {!extra && (
          <div style={{ marginTop: 10 }}>
            <label className="lbl">{sessionWord}s taken <small style={{ fontWeight: 600, textTransform: "none" }}>— tap every one you took</small></label>
            <div className="chips" style={{ marginTop: 4 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button key={n} type="button" className={`chip ${sessList.includes(String(n)) ? "on" : ""}`} onClick={() => toggleLecture(n)}>{n}</button>
              ))}
            </div>
            <div className="row2" style={{ marginTop: 8 }}>
              <button type="button" className="btn sm outline" onClick={twoBackToBack}>2 back-to-back</button>
              <button type="button" className="btn sm outline" disabled={sessList.length === 1} onClick={() => setSessList([sessList[0]])}>Just one</button>
            </div>
            <p className="hint" style={{ marginBottom: 0, marginTop: 6 }}>
              {lectures.length > 1
                ? `The same attendance is saved for ${sessionWord.toLowerCase()}s ${lectures.join(" & ")} and counts as ${lectures.length} classes. This overwrites anything already saved for them.`
                : `Taking 2 ${sessionWord.toLowerCase()}s? Tap "2 back-to-back", or tap each number for ${sessionWord.toLowerCase()}s that are not continuous (for example 2 and 5).`}
            </p>
          </div>
        )}

        {extra && (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Set the <b>total lectures</b> of this activity, then tap only the students who took part and set how many lectures each one attended.
            Students you leave out get nothing and do not see this activity.
          </p>
        )}

        <div className="row2" style={{ marginTop: 12 }}>
          {counts.map(([label, n, kind]) => (
            <div key={label} style={{ background: `var(--${kind === "mu" ? "ln" : kind + "b"})`, color: `var(--${kind})`, padding: 8, borderRadius: 10, textAlign: "center", fontWeight: 800 }}>{label}: {n}</div>
          ))}
        </div>

        {role === "HOD" && !extra && !training && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, padding: 10, borderRadius: 10, background: "#fff8e8", color: "var(--navy)", fontSize: 12, fontWeight: 800 }}>
            <input type="checkbox" checked={remind} style={{ marginTop: 2 }}
              onChange={(e) => { setRemind(e.target.checked); try { localStorage.setItem("bist_auto_defaulter_reminders", e.target.checked ? "on" : "off"); } catch {} }} />
            <span>Email a reminder to all students below {minPct}% attendance after saving
              <small style={{ display: "block", marginTop: 4, color: "var(--mu)", fontWeight: 600 }}>Uses the default email sender configured in Settings. Students without an email address are skipped.</small>
            </span>
          </label>
        )}

        <div className="row2" style={{ marginTop: 10 }}>
          {extra ? (
            <>
              <button className="btn sm ok" onClick={() => edit((r) => r.map((x) => ({ ...x, s: x.s === null ? lecs : x.s })))}>Select all students</button>
              <button className="btn sm sec" onClick={() => setAll(null)}>Select none</button>
            </>
          ) : (
            <>
              <button className="btn sm ok" onClick={() => setAll("P")}>Mark All Present</button>
              <button className="btn sm red" onClick={() => setAll("A")}>Mark All Absent</button>
            </>
          )}
        </div>
        <input className="inp" placeholder="Search student name or enrollment…" style={{ marginTop: 10 }} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card" style={{ padding: "4px 0" }}>
        {q.loading && !rows.length ? <div className="empty">Loading students…</div>
          : q.error && !data ? <div className="empty">Could not load this sheet. {q.error.kind === "network" ? "Check your connection." : errorText(q.error)}<br /><button className="btn gold sm" style={{ marginTop: 8 }} onClick={() => q.refetch()}>Try again</button></div>
          : !rows.length ? <div className="empty">No students in this class yet. Add students first.</div>
          : !filtered.length ? <div className="empty">No matching students</div>
          : filtered.map((r) => extra ? (
            <div className="att-row" key={r.e} style={r.s === null ? { opacity: 0.75 } : undefined}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, cursor: "pointer" }}>
                <input type="checkbox" checked={r.s !== null} onChange={() => toggleParticipant(r.idx)} style={{ width: 20, height: 20, flex: "none" }} />
                <span className="info" style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 13.5 }}>{r.n}</b>
                  <small style={{ color: "var(--mu)", fontFamily: "monospace" }}>{r.e}</small>
                </span>
              </label>
              {r.s !== null && <div className="stepper">
                <button className="step-btn" onClick={() => setExtra(r.idx, (Number(r.s) || 0) - 1)}>-</button>
                <input type="number" min="0" max={lecs} className="step-val" value={r.s} onChange={(e) => setExtra(r.idx, e.target.value)} />
                <button className="step-btn" onClick={() => setExtra(r.idx, (Number(r.s) || 0) + 1)}>+</button>
                <button className="step-btn" style={{ width: "auto", padding: "0 7px", fontSize: 11, background: "var(--gold-light)" }} onClick={() => setExtra(r.idx, lecs)}>All {lecs}</button>
              </div>}
            </div>
          ) : (
            <div className="att-row clickable" key={r.e} onClick={() => toggle(r.idx)}>
              <div className="info" style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: "block", fontSize: 14 }}>{r.n}</b>
                <small style={{ color: "var(--mu)", fontFamily: "monospace" }}>{r.e}</small>
              </div>
              <div className={`pa-box ${r.s}`}>{r.s}</div>
            </div>
          ))}
      </div>

      <div className="savebar">
        <div className="savebar-inner">
          <button className="btn gold" disabled={saving || !rows.length} onClick={save}>
            {saving ? "Saving…" : `Save ${extra ? "Activity Attendance" : training ? "Training Attendance" : "Lecture Attendance"}${lectures.length > 1 ? ` (${lectures.length} ${training ? "sessions" : "lectures"})` : ""}${typeof navigator !== "undefined" && !navigator.onLine ? " (offline)" : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}
