const CACHE_NAME = "expense-tracker-v42";
const APP_SHELL = [
  "./",
  "./index.html",
  "./script.js",
  "./animation.css",
  "./tables-enhanced.css",
  "./table-density.css?v=1",
  "./mobile-filters.css?v=1",
  "./premium-select.css?v=1",
  "./premium-select.js?v=1",
  "./table-density.js?v=1",
  "./animation.js",
  "./row-actions.js",
  "./autocomplete.js",
  "./export.js",
  "./config.txt",
  "./manifest.json",
  "./version.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Apps Script API stays network-only.

  // Always prefer the network for config/version so deployments and config
  // changes are picked up immediately, with cache as an offline fallback.
  const networkFirst = /\/(config\.txt|version\.json)$/.test(url.pathname);
  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
