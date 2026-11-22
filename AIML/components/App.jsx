"use client";
import { useCallback, useEffect, useState } from "react";
import Login from "./Login";
import Shell from "./Shell";
import { Hosts } from "./ui";
import { getSession, loadSession, setSession } from "../lib/session";
import { queueFlush, queueInit } from "../lib/queue";
import { rawPost } from "../lib/api";
import { toast } from "../lib/ui-store";

export default function App() {
  const [session, setLocal] = useState(undefined); // undefined = still reading saved session
  const [mode, setMode] = useState("student");

  // Open instantly from the saved session; verify it in the background so a slow network
  // never blocks the screen. An expired token is caught by the first request that uses it.
  useEffect(() => {
    const saved = loadSession();
    if (saved.token) {
      setLocal(saved);
      queueInit(saved.user);
      rawPost("resume", [saved.token], { quiet: true, retries: 0 }).catch((e) => {
        if (e.kind === "session") signOut(true);
      });
    } else setLocal({ token: null, user: null });

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback((silent) => {
    const { token, user } = getSession();
    if (token) rawPost("logout", [token], { quiet: true, retries: 0 }).catch(() => {});
    setMode(user?.role === "STUDENT" ? "student" : "staff");
    setSession(null, null);
    setLocal({ token: null, user: null });
    queueInit(null); // pending offline saves stay on the device, tied to their account
    if (!silent) toast("Logged out safely");
  }, []);

  useEffect(() => {
    const expired = () => { toast("Session expired. Please sign in again."); signOut(true); };
    window.addEventListener("att:session-expired", expired);
    return () => window.removeEventListener("att:session-expired", expired);
  }, [signOut]);

  // Replay attendance saved while offline: on reconnect, on a timer, and shortly after opening.
  useEffect(() => {
    if (!session?.user) return undefined;
    const flush = () => queueFlush();
    window.addEventListener("online", flush);
    const timer = setInterval(flush, 30000);
    const first = setTimeout(flush, 2500);
    return () => { window.removeEventListener("online", flush); clearInterval(timer); clearTimeout(first); };
  }, [session?.user]);

  let body;
  if (session === undefined) {
    body = (
      <div className="boot-state" role="status" aria-live="polite">
        <span className="boot-spinner" aria-hidden="true" />
        <b>Opening attendance</b>
        <small>Checking saved campus data…</small>
      </div>
    );
  } else if (!session.user) {
    body = <Login initialMode={mode} onLoggedIn={(r) => setLocal({ token: r.token, user: r.user })} />;
  } else {
    body = <Shell key={`${session.user.role}:${session.user.username}`} user={session.user} onLogout={() => signOut(false)} />;
  }
  return (
    <>
      <Hosts />
      <div id="app" className="app-shell">{body}</div>
    </>
  );
}
