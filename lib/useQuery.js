import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { cacheEntry, cacheFresh, cacheSubscribe } from "./cache";
import { cacheKeyFor, fetchRead } from "./api";
import { TTL } from "./config";

const onlineSubscribe = (fn) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};
export const useOnline = () =>
  useSyncExternalStore(onlineSubscribe, () => navigator.onLine, () => true);

/**
 * Stale-while-revalidate read.
 *  - cached data is returned immediately (even if old) so the screen never waits on a slow network
 *  - a background refresh runs when the cache is older than `ttl`
 *  - if the refresh fails, the stale data stays on screen and `error` is set
 *  - after any write the cache entry is dropped and this hook refetches automatically
 */
export function useQuery(fn, args = [], { ttl = TTL.staff, enabled = true, isPublic = false } = {}) {
  const key = cacheKeyFor(fn, args, isPublic);
  const [, rerender] = useReducer((n) => n + 1, 0);
  const [error, setError] = useState(null);
  const [fetching, setFetching] = useState(false);
  const online = useOnline();
  const mounted = useRef(true);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setFetching(true);
    try {
      await fetchRead(fn, argsRef.current, { isPublic });
      if (mounted.current) setError(null);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setFetching(false);
    }
  }, [fn, key, isPublic]);

  useEffect(() => {
    if (!enabled) return undefined;
    setError(null);
    const unsubscribe = cacheSubscribe(key, (entry) => {
      rerender();
      if (!entry) run(); // cache was invalidated by a write
    });
    if (!cacheFresh(key, ttl)) run();
    return unsubscribe;
  }, [key, enabled, ttl, run]);

  // Connection came back: retry anything that failed or is stale.
  useEffect(() => {
    if (enabled && online && (error || (cacheEntry(key) && !cacheFresh(key, ttl)))) run();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = cacheEntry(key);
  return {
    data: entry ? entry.data : null,
    updatedAt: entry ? entry.ts : 0,
    loading: enabled && !entry && !error,
    refreshing: Boolean(entry) && fetching,
    error,
    refetch: run,
  };
}
