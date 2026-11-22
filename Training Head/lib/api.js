import { GAS_URL } from "./config";
import { getToken, scopeKey } from "./session";
import { cacheSet, cacheInvalidate } from "./cache";
import { busy } from "./ui-store";

// kind: "network" (offline, timeout, bad gateway: safe to retry or queue)
//       "session" (token expired: sign in again)
//       "server"  (Apps Script rejected the request: show the message, do not retry)
export class ApiError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One POST to the Apps Script web app with a timeout and exponential-backoff retries on network
 * failures. Apps Script cold starts can take several seconds on weak mobile data, so the default
 * timeout is generous. Only idempotent calls should pass retries > 0.
 */
export async function rawPost(fn, args = [], { timeout = 30000, retries = 1, quiet = false } = {}) {
  if (!quiet) busy(1);
  try {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(GAS_URL, {
          method: "POST",
          // text/plain avoids a CORS preflight, which Apps Script cannot answer.
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ fn, args }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new ApiError(`Server returned ${res.status}`, "network");
        const json = await res.json();
        if (json.ok === false || (json.ok === undefined && json.status !== "ok" && json.error)) {
          const message = String(json.error || "Server error").replace(/^Error:\s*/i, "");
          throw new ApiError(message, /session expired/i.test(message) ? "session" : "server");
        }
        return json.data !== undefined ? json.data : json.result !== undefined ? json.result : json;
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof ApiError && error.kind !== "network") throw error;
        if (attempt < retries) {
          await sleep(700 * 2 ** attempt);
          continue;
        }
        throw error instanceof ApiError ? error : new ApiError("Network is slow or offline.", "network");
      }
    }
  } finally {
    if (!quiet) busy(-1);
  }
}

function emitSessionExpired(error) {
  if (error.kind === "session" && typeof window !== "undefined") window.dispatchEvent(new Event("att:session-expired"));
}

export function cacheKeyFor(fn, args, isPublic = false) {
  return (isPublic ? "pub|" : scopeKey()) + fn + ":" + JSON.stringify(args);
}

// Identical reads that are already in flight share one request.
const inflight = new Map();

export function fetchRead(fn, args = [], { isPublic = false, timeout, retries = 2, quiet } = {}) {
  const key = cacheKeyFor(fn, args, isPublic);
  if (inflight.has(key)) return inflight.get(key);
  const request = rawPost(fn, isPublic ? args : [getToken(), ...args], { timeout, retries, quiet })
    .then((data) => {
      cacheSet(key, data);
      return data;
    })
    .catch((error) => {
      emitSessionExpired(error);
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** A write. Invalidates every cached read for this user so screens refetch fresh data. */
export async function mutate(fn, args = [], { retries = 0, timeout = 30000, invalidate = true } = {}) {
  try {
    const data = await rawPost(fn, [getToken(), ...args], { retries, timeout });
    if (invalidate) cacheInvalidate({ scope: scopeKey() });
    return data;
  } catch (error) {
    emitSessionExpired(error);
    throw error;
  }
}

/**
 * Several writes in ONE round trip (the backend runs up to 10 per request). Used when a faculty member
 * takes two lectures in a day: one save covers both instead of two slow requests on a weak network.
 * Resolves to one { ok, data | error } entry per call; throws only when the request itself fails.
 */
export async function mutateMany(calls, { timeout = 45000, retries = 1 } = {}) {
  const results = await rawPost("batchCall", [calls.map((c) => ({ fn: c.fn, args: [getToken(), ...c.args] }))], { timeout, retries });
  cacheInvalidate({ scope: scopeKey() });
  return results;
}

/** Several reads in one round trip (the backend allows up to 10). Results are cached individually. */
export async function batchReads(calls, { timeout = 35000 } = {}) {
  const results = await rawPost("batchCall", [calls.map((c) => ({ fn: c.fn, args: [getToken(), ...(c.args || [])] }))], { timeout, retries: 2 });
  return results.map((result, index) => {
    if (result && result.ok) cacheSet(cacheKeyFor(calls[index].fn, calls[index].args || []), result.data);
    return result;
  });
}

/** Warms the cache for screens the user is likely to open next. Silent: never toasts, never blocks. */
export function prefetch(fn, args = []) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  fetchRead(fn, args, { quiet: true, retries: 0 }).catch(() => {});
}
