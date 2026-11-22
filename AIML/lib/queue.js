import { useSyncExternalStore } from "react";
import { storage } from "./storage";
import { rawPost } from "./api";
import { getToken, scopeKey } from "./session";
import { cacheInvalidate } from "./cache";
import { toast } from "./ui-store";

/**
 * Offline-first attendance saving.
 *
 * When a save cannot reach the server (offline, timeout, bad signal) it is kept on the device and
 * replayed automatically when the connection returns. Saving attendance is idempotent on the
 * backend (it overwrites the same lecture column), so replaying is safe. Entries are stored per
 * signed-in account and only replayed under that same account.
 */
let owner = null; // "ROLE:username"
let items = [];
let flushing = false;
const subs = new Set();

const storeKey = () => `queue:${owner}`;
const emit = () => subs.forEach((fn) => fn());
const persist = () => owner && storage.set(storeKey(), items);

export function queueInit(user) {
  owner = user ? `${user.role}:${user.username}` : null;
  items = owner ? storage.get(storeKey(), []) : [];
  emit();
}

const sameTarget = (a, b) => a.classId === b.classId && a.subject === b.subject && a.date === b.date && String(a.sess) === String(b.sess);

export function queueAdd(entry) {
  if (!owner) return;
  const next = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, queuedAt: Date.now(), error: "" };
  // A newer save for the same lecture replaces the older one.
  items = items.filter((x) => !sameTarget(x, next)).concat(next);
  persist();
  emit();
}

export function queueDiscard(id) {
  items = items.filter((x) => x.id !== id);
  persist();
  emit();
}

export function pendingFor(classId, subject, date, sess) {
  return items.find((x) => sameTarget(x, { classId, subject, date, sess })) || null;
}

export async function queueFlush() {
  if (flushing || !owner || !items.length || !getToken() || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  let synced = 0;
  try {
    for (const item of [...items]) {
      if (item.error) continue; // needs the user's attention; do not retry blindly
      try {
        await rawPost("saveAttendance", [getToken(), item.classId, item.subject, item.date, item.sess, item.lecs, item.marks], { retries: 1, quiet: true });
        items = items.filter((x) => x.id !== item.id);
        synced++;
      } catch (error) {
        if (error.kind === "network" || error.kind === "session") break; // try again later
        items = items.map((x) => (x.id === item.id ? { ...x, error: error.message } : x));
      }
      persist();
      emit();
    }
  } finally {
    flushing = false;
    persist();
    emit();
  }
  if (synced) {
    cacheInvalidate({ scope: scopeKey() });
    toast(`${synced} saved attendance ${synced === 1 ? "entry" : "entries"} synced to Google Sheets`);
  }
}

const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
// useSyncExternalStore needs a stable snapshot between changes: `items` is only replaced on change.
export const useQueue = () => useSyncExternalStore(subscribe, () => items, () => items);
