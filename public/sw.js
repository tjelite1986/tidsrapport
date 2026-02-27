const CACHE = "tidsrapport-v1";

const PRECACHE = [
  "/",
  "/icon.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Låt alltid API-anrop gå direkt till nätverket
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Next.js statiska filer: cache-first (content-hashade)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
            return res;
          })
      )
    );
    return;
  }

  // SVG/ikoner: cache-first
  if (
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Sidor: network-first, fall tillbaka på cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
