const CACHE_NAME = "bist-aiml-pwa-v7";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/legacy.js", "/bistimages.jpg", "/bansal....png"];

function cacheResponse(event, request, response, cacheKey = request) {
  if (!response.ok) return response;
  // Clone synchronously while the response body is still unused. The cache
  // write can finish asynchronously after the page receives the original.
  const responseCopy = response.clone();
  caches.open(CACHE_NAME)
    .then((cache) => cache.put(cacheKey, responseCopy))
    .catch(() => {});
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => cacheResponse(event, request, response, "/")).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }

  // The app's legacy client handles login and attendance. Check for a fresh
  // copy while online so installed phones do not stay on an old cached build.
  if (url.pathname === "/legacy.js") {
    event.respondWith(fetch(request, { cache: "no-store" }).then((response) => cacheResponse(event, request, response)).catch(async () => (await caches.match(request)) || Response.error()));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheResponse(event, request, response))));
});
