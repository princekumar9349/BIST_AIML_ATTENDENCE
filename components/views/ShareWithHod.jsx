"use client";
import { useEffect, useState } from "react";
import { useQuery } from "../../lib/useQuery";
import { mutate } from "../../lib/api";
import { toast } from "../../lib/ui-store";
import { errorText } from "../../lib/utils";
import { TTL } from "../../lib/config";

/**
 * Training Head: share training attendance with the HOD. The HOD's own system links the
 * registry below and pulls the branches it wants, so attendance never has to be exported by hand.
 */
export default function ShareWithHod() {
  const q = useQuery("getTrainingShare", [], { ttl: TTL.slow });
  const info = q.data;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (info?.hodEmail) setEmail(info.hodEmail); }, [info?.hodEmail]);

  const share = async () => {
    if (!email.trim()) return toast("Enter the HOD's Google account email");
    setBusy(true);
    try {
      const r = await mutate("setHodShareEmail", [email.trim()], { timeout: 120000 });
      toast(`Shared with ${r.hodEmail}: registry + ${r.sharedWorkbooks} class workbook${r.sharedWorkbooks === 1 ? "" : "s"}${r.failedWorkbooks ? ` (${r.failedWorkbooks} could not be shared)` : ""}.`);
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };
  const resync = async () => {
    setBusy(true);
    try { await mutate("resyncTrainingShare", [], { timeout: 60000 }); toast("Registry refreshed"); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(info.registryUrl); toast("Registry link copied. Send it to the HOD."); }
    catch { toast("Could not copy. Open the registry and copy its address."); }
  };

  return (
    <div className="card">
      <h3>Share Training Attendance with the HOD</h3>
      <p className="hint">
        The HOD's system reads your training attendance directly. Give their Google account view access, then send them the registry link.
        They choose which branches to pull, and their Master sheet then shows main + training attendance together.
      </p>
      {q.loading && <div className="empty">Loading…</div>}
      {!q.loading && !info && <div className="empty">Could not load sharing details. <button className="btn sm gold" onClick={() => q.refetch()}>Retry</button></div>}
      {info && (
        <>
          <label className="lbl">HOD's Google account email</label>
          <input className="inp" type="email" autoCapitalize="none" placeholder="hod@college.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn gold" style={{ marginTop: 10 }} disabled={busy} onClick={share}>
            {busy ? "Sharing…" : info.hodEmail ? "Update & Re-share (view only)" : "Share with HOD (view only)"}
          </button>
          {info.hodEmail && <p className="hint" style={{ color: "var(--ok)", fontWeight: 800 }}>Currently shared with {info.hodEmail}. New classes are shared automatically.</p>}

          <div style={{ marginTop: 14, borderTop: "1px solid var(--ln)", paddingTop: 10 }}>
            <label className="lbl">Registry link to send to the HOD</label>
            <p className="hint" style={{ marginTop: 4 }}>{info.classes} class{info.classes === 1 ? "" : "es"} • {info.sessions} training session{info.sessions === 1 ? "" : "s"}</p>
            <div className="row2">
              <button className="btn sec" onClick={copy}>Copy Registry Link</button>
              <a className="btn outline" target="_blank" rel="noopener noreferrer" href={info.registryUrl}>Open Registry</a>
            </div>
            <button className="btn sm outline" style={{ marginTop: 8 }} disabled={busy} onClick={resync}>Refresh registry now</button>
            <p className="hint" style={{ marginBottom: 0, marginTop: 8 }}>The registry lists only class names and training sessions — never logins or passwords.</p>
          </div>
        </>
      )}
    </div>
  );
}
