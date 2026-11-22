// Service worker tuned for weak campus networks.
//  - The app shell opens instantly from cache and is refreshed in the background.
//  - Hashed Next.js bundles never change, so they are served cache-first forever.
//  - Logos, icons and the manifest are served from cache and refreshed quietly.
//  - Apps Script calls are cross-origin and never touched here; the app caches its own data.
const VERSION = "v6";
const SHELL_CACHE = `att-shell-${VERSION}`;
const STATIC_CACHE = `att-static-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/bistimages.jpg", "/bansal....png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // One missing file must not abort the whole install.
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, STATIC_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(fallbackKey || request);
  const refresh = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(fallbackKey || request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    refresh.catch(() => {});
    return cached;
  }
  return (await refresh) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, "/"));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (/\.(png|jpe?g|svg|webp|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
  event.respondWith(networkFirst(request));
});
