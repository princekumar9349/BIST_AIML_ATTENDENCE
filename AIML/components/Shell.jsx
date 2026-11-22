"use client";
import { useEffect, useMemo, useState } from "react";
import { StaffCtx } from "./ctx";
import { ICONS } from "./nav";
import { Logos, SkList } from "./ui";
import { REGISTRY } from "./registry";
import { batchReads, cacheKeyFor, prefetch } from "../lib/api";
import { cacheEntry } from "../lib/cache";
import { storage } from "../lib/storage";
import { useQuery } from "../lib/useQuery";
import { HOD_NAME, TTL } from "../lib/config";
import { useOnline } from "../lib/useQuery";

function useBootstrap(role) {
  // First-ever HOD sign-in: fetch classes + faculty + settings in ONE round trip instead of three.
  const needsBatch = role === "HOD" && !cacheEntry(cacheKeyFor("listClasses", []));
  const [ready, setReady] = useState(!needsBatch);
  useEffect(() => {
    if (!needsBatch) return;
    batchReads([{ fn: "listClasses" }, { fn: "listTeachers" }, { fn: "getSettings" }])
      .catch(() => {})
      .finally(() => setReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}

export default function Shell({ user, onLogout }) {
  const role = user.role;
  const cfg = REGISTRY.roles[role];
  const [tab, setTab] = useState(cfg.landing);
  const ready = useBootstrap(role);
  const classesQ = useQuery("listClasses", [], { ttl: TTL.staff, enabled: ready && role !== "STUDENT" });
  const teachersQ = useQuery("listTeachers", [], { ttl: TTL.slow, enabled: ready && role === "HOD" });
  const settingsQ = useQuery("getSettings", [], { ttl: TTL.slow, enabled: ready && role === "HOD" });
  const classes = useMemo(() => classesQ.data || [], [classesQ.data]);
  const [classId, setClassIdState] = useState(() => storage.get(`class:${user.username}`, ""));
  const online = useOnline();

  useEffect(() => {
    if (classes.length && !classes.some((c) => c.id === classId)) setClassIdState(classes[0].id);
  }, [classes, classId]);
  const setClassId = (id) => {
    setClassIdState(id);
    storage.set(`class:${user.username}`, id);
  };

  // Warm the screens people open next so they open instantly even on a weak connection.
  useEffect(() => {
    if (!classId || !online) return;
    (cfg.prefetch || []).forEach((fn) => prefetch(fn, [classId]));
  }, [classId, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = {
    user, role, logout: onLogout, classes, classId, setClassId, tab, setTab, classesQ,
    minPct: settingsQ.data?.min || 75,
    teachers: teachersQ.data || [],
    currentClass: classes.find((c) => c.id === classId) || null,
  };

  const View = REGISTRY.views[tab] || REGISTRY.views[cfg.landing];
  const showClassBar = cfg.classBarTabs.includes(tab);
  const hasNav = (id) => cfg.nav.some((n) => n[0] === id);
  const subtitle = cfg.subtitle(user);
  const title = role === "HOD" ? HOD_NAME : user.name;

  return (
    <StaffCtx.Provider value={ctx}>
      <header className="top-bar">
        <div className="top-row">
          <div className="brand-cluster">
            <Logos size="sm" />
            <div className="user-meta">
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {!hasNav("profile") && <button className="icon-btn" onClick={() => setTab("profile")}><span>Account</span></button>}
            <button className="icon-btn" onClick={() => onLogout()}><span>Logout</span></button>
          </div>
        </div>
      </header>

      {showClassBar && classes.length > 0 && (
        <div className="class-bar">
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {ctx.currentClass?.url && (
            <a className="btn sm gold" style={{ width: "auto", padding: "9px 11px" }} target="_blank" rel="noopener noreferrer" href={ctx.currentClass.url} title="Open Google Sheet">Sheet</a>
          )}
        </div>
      )}

      <main id="view">{ready ? <View key={tab} /> : <SkList rows={4} />}</main>

      <nav className="bot-nav">
        {cfg.nav.map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>
            {ICONS[cfg.icons?.[id] || id]}
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </StaffCtx.Provider>
  );
}
