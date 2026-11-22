"use client";
import { useState } from "react";
import { useUi, finishModal, closeModal } from "../lib/ui-store";
import { useOnline } from "../lib/useQuery";
import { useQueue, queueFlush } from "../lib/queue";
import { DEPT_LINE, DEVLINK_URL } from "../lib/config";
import { timeAgo, errorText } from "../lib/utils";

/* ---------- logos & footer ---------- */
function LogoImg({ src, alt, height, maxWidth, fallback }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <b style={{ fontSize: 11, color: "var(--navy)" }}>{fallback}</b>;
  return (
    <img src={src} alt={alt} onError={() => setFailed(true)}
      style={{ height, width: "auto", maxWidth, borderRadius: 6 }} />
  );
}

export function Logos({ size = "md" }) {
  const h = size === "lg" ? "52px" : size === "sm" ? "26px" : "34px";
  return (
    <div className="logo-pill" style={{ padding: size === "lg" ? "6px 12px" : "3px 7px" }}>
      <LogoImg src="/bistimages.jpg" alt="BIST Bhopal" height={h} fallback="BIST" />
      <div className="logo-sep" style={{ height: size === "lg" ? "34px" : "20px" }} />
      <LogoImg src="/bansal....png" alt="BGI Group" height={h} maxWidth={size === "lg" ? "125px" : "82px"} fallback="BGI" />
    </div>
  );
}

export function DevFooter() {
  return (
    <footer className="dev-footer">
      <div className="logos"><Logos size="sm" /></div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: "var(--navy)", marginBottom: 2 }}>BANSAL INSTITUTE OF SCIENCE &amp; TECHNOLOGY, BHOPAL</div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--gold-dark)", marginBottom: 2 }}>BANSAL GROUP OF INSTITUTES (BGI)</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--mu)", marginBottom: 8 }}>{DEPT_LINE}</div>
      <a href={DEVLINK_URL} target="_blank" rel="noopener noreferrer" className="dev-credit">Developed by Devlinkhub Team</a>
    </footer>
  );
}

/* ---------- skeletons ---------- */
const sk = (style, cls = "") => <div className={`sk ${cls}`} style={style} />;

export function SkList({ rows = 5 }) {
  return (
    <div className="card">
      {sk({ height: 18, width: "52%", marginBottom: 8 })}
      {sk({ height: 12, width: "75%", marginBottom: 16 })}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--ln)" }}>
          <div style={{ width: "68%" }}>
            {sk({ height: 14, width: "80%", marginBottom: 6 })}
            {sk({ height: 11, width: "45%" })}
          </div>
          {sk({ height: 30, width: 68, borderRadius: 9 })}
        </div>
      ))}
    </div>
  );
}

export function SkReport() {
  return (
    <>
      <div className="row3" style={{ marginBottom: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ margin: 0, padding: "14px 10px", textAlign: "center" }}>
            {sk({ height: 24, width: "50%", margin: "0 auto 6px" })}
            {sk({ height: 10, width: "70%", margin: "0 auto" })}
          </div>
        ))}
      </div>
      <div className="card">
        {sk({ height: 38, width: "100%", borderRadius: 11, marginBottom: 12 })}
        {[1, 2, 3, 4, 5, 6].map((i) => <div key={i}>{sk({ height: 32, width: "100%", marginBottom: 6, borderRadius: 6 })}</div>)}
      </div>
    </>
  );
}

export function SkStudent() {
  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "20px 15px" }}>
        {sk({ width: 130, height: 130, margin: "0 auto 14px" }, "sk-circle")}
        {sk({ height: 18, width: "55%", margin: "0 auto 8px" })}
        {sk({ height: 13, width: "40%", margin: "0 auto 12px" })}
      </div>
      {[1, 2, 3].map((i) => (
        <div className="card" key={i}>
          {sk({ height: 15, width: "65%", marginBottom: 10 })}
          {sk({ height: 8, width: "100%", marginBottom: 8 }, "sk-pill")}
          {sk({ height: 11, width: "40%" })}
        </div>
      ))}
    </>
  );
}

/* ---------- data-state helpers ---------- */
// A failed refresh with data on screen is shown as a small notice; without data it is a retry card.
export function QueryState({ q, skeleton, children, empty }) {
  if (q.loading) return skeleton || <SkList />;
  if (!q.data && q.error) {
    return (
      <div className="card empty">
        <b>{q.error.kind === "network" ? "Can't reach the server right now" : "Could not load"}</b>
        <div style={{ margin: "6px 0 12px" }}>{q.error.kind === "network" ? "Check your connection. Anything you opened before is saved on this phone." : errorText(q.error)}</div>
        <button className="btn gold sm" onClick={() => q.refetch()}>Try again</button>
      </div>
    );
  }
  if (q.data == null) return empty || null;
  return (
    <>
      {q.error && q.error.kind === "network" && (
        <div className="card" style={{ background: "var(--warnb)", color: "var(--warn)", fontWeight: 800, fontSize: 12, padding: "9px 12px" }}>
          Showing saved data from {timeAgo(q.updatedAt)} — could not refresh. <button className="btn sm outline" style={{ marginLeft: 6 }} onClick={() => q.refetch()}>Retry</button>
        </div>
      )}
      {children(q.data)}
    </>
  );
}

export function SyncPill({ q, label }) {
  return (
    <span className="sync-pill">
      <span className={`sync-dot ${q.refreshing ? "pulsing" : ""}`} />
      {q.refreshing ? "Syncing live…" : `${label || "Synced"} ${timeAgo(q.updatedAt)}`}
    </span>
  );
}

/* ---------- global hosts: loader bar, offline banner, toast, modal ---------- */
export function Hosts() {
  const ui = useUi();
  const online = useOnline();
  const queue = useQueue();
  const waiting = queue.filter((x) => !x.error).length;
  const failed = queue.filter((x) => x.error).length;
  return (
    <>
      <div id="loader" style={{ width: ui.busy > 0 ? "84%" : "0%" }} />
      <div id="net-banner" className={!online || waiting || failed ? "offline" : ""}>
        <span id="net-banner-text">
          {!online
            ? `Offline mode — showing saved data.${waiting ? ` ${waiting} attendance entr${waiting === 1 ? "y is" : "ies are"} saved on this phone and will sync automatically.` : " You can still mark attendance; it will sync when you are back online."}`
            : waiting
              ? `${waiting} attendance entr${waiting === 1 ? "y" : "ies"} waiting to sync…`
              : `${failed} saved entr${failed === 1 ? "y was" : "ies were"} rejected by the server — open Attendance to review.`}
          {online && waiting > 0 && <button className="btn sm outline" style={{ marginLeft: 8 }} onClick={queueFlush}>Sync now</button>}
        </span>
      </div>
      <div id="toast" className={ui.toast.show ? "show" : ""} role="status">{ui.toast.msg}</div>
      <div id="modal-backdrop" className={ui.modal ? "open" : ""} onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <div className="modal-card" id="modal-content">
          {ui.modal && (typeof ui.modal.content === "function" ? ui.modal.content(finishModal) : ui.modal.content)}
        </div>
      </div>
    </>
  );
}

/* ---------- small building blocks ---------- */
export function Card({ children, style, className = "" }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function Empty({ children }) {
  return <div className="card empty">{children}</div>;
}

export function Tag({ children, kind = "" }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg" style={{ marginTop: 8 }}>
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
