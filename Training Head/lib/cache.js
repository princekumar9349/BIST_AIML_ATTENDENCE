import { storage } from "./storage";

// Stale-while-revalidate store: memory first, localStorage second so a phone that reopens
// the app on a weak connection still shows the last data immediately.
const mem = new Map();
const listeners = new Map();
const PERSIST_PREFIX = "c:";
const MAX_PERSIST_BYTES = 400 * 1024; // skip persisting very large payloads

export function cacheEntry(key) {
  if (mem.has(key)) return mem.get(key);
  const saved = storage.get(PERSIST_PREFIX + key);
  if (saved && typeof saved.ts === "number") {
    mem.set(key, saved);
    return saved;
  }
  return null;
}

export function cacheGet(key) {
  const entry = cacheEntry(key);
  return entry ? entry.data : null;
}

export function cacheFresh(key, ttl) {
  const entry = cacheEntry(key);
  return Boolean(entry) && Date.now() - entry.ts < ttl;
}

function notify(key, entry) {
  (listeners.get(key) || []).forEach((fn) => fn(entry));
}

export function cacheSet(key, data, { persist = true } = {}) {
  const entry = { ts: Date.now(), data };
  mem.set(key, entry);
  if (persist) {
    try {
      if (JSON.stringify(data).length < MAX_PERSIST_BYTES) storage.set(PERSIST_PREFIX + key, entry);
    } catch {}
  }
  notify(key, entry);
}

export function cacheSubscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

// Drops cached reads after a write so mounted screens refetch (subscribers get `null`).
// `keep` preserves entries that remain valid, such as the public class list on the login page.
export function cacheInvalidate({ scope = "", keep = [] } = {}) {
  const drop = (key) => !keep.some((k) => key.startsWith(k)) && key.startsWith(scope);
  const dropped = new Set([...mem.keys()].filter(drop));
  storage.keys(PERSIST_PREFIX).forEach((k) => {
    const key = k.slice(PERSIST_PREFIX.length);
    if (drop(key)) {
      storage.del(k);
      dropped.add(key);
    }
  });
  dropped.forEach((key) => mem.delete(key));
  dropped.forEach((key) => notify(key, null));
}

export function cacheClearAll() {
  mem.clear();
  storage.keys(PERSIST_PREFIX).forEach((k) => storage.del(k));
}
