// localStorage can throw (private mode, quota, blocked). Every access goes through here.
const PREFIX = "att5:";

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {}
  },
  keys(prefix = "") {
    const out = [];
    try {
      const full = PREFIX + prefix;
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(full)) out.push(k.slice(PREFIX.length));
      }
    } catch {}
    return out;
  },
  // Plain (non-prefixed) keys used by the previous client, so existing sessions survive the upgrade.
  getRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
  delRaw(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};
