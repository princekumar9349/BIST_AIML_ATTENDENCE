"use client";
import { useEffect } from "react";

const markup = `

  <div id="loader"></div>
  <div id="net-banner">
    <span id="net-banner-text">Offline / Low Network Mode — Viewing cached data. Check network before saving!</span>
  </div>

  <div id="app" class="app-shell">
    <div class="boot-state" role="status" aria-live="polite">
      <span class="boot-spinner" aria-hidden="true"></span>
      <b>Opening attendance</b>
      <small>Checking saved campus data…</small>
    </div>
  </div>
  <div id="toast"></div>

  <!-- Custom Non-Blocking Modal Dialog -->
  <div id="modal-backdrop">
    <div class="modal-card" id="modal-content"></div>
  </div>

  `;

export default function Home() {
  useEffect(() => {
    const isDevelopment = process.env.NODE_ENV === "development";
    if ("serviceWorker" in navigator) {
      if (isDevelopment) {
        // A production PWA worker can serve stale legacy.js while developing.
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch((error) => console.warn("Could not clear the development service worker:", error));
      } else {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          console.error("PWA service worker registration failed:", error);
        });
      }
    }
    const script = document.createElement("script");
    script.src = isDevelopment ? `/legacy.js?dev=${Date.now()}` : "/legacy.js";
    script.onload = () => { if (typeof window.onload === "function") window.onload(); };
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, []);
  return <main dangerouslySetInnerHTML={{ __html: markup }} />;
}
