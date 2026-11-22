import { storage } from "./storage";

// Same localStorage keys as the previous client so signed-in phones stay signed in after the upgrade.
const TOKEN_KEY = "att_tk_v4";
const USER_KEY = "att_usr_v4";

let current = { token: null, user: null };
const listeners = new Set();

export function loadSession() {
  const token = storage.getRaw(TOKEN_KEY);
  let user = null;
  try {
    user = JSON.parse(storage.getRaw(USER_KEY) || "null");
  } catch {}
  current = token && user ? { token, user } : { token: null, user: null };
  return current;
}

export function getSession() {
  return current;
}

export function getToken() {
  return current.token;
}

export function setSession(token, user) {
  current = { token, user };
  if (token && user) {
    storage.setRaw(TOKEN_KEY, token);
    storage.setRaw(USER_KEY, JSON.stringify(user));
  } else {
    storage.delRaw(TOKEN_KEY);
    storage.delRaw(USER_KEY);
  }
  listeners.forEach((fn) => fn(current));
}

export function onSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Cache keys are namespaced per user so a shared phone never shows another account's data.
export function scopeKey() {
  const u = current.user;
  return u ? `${u.role}:${u.classId || ""}:${u.username}|` : "anon|";
}
