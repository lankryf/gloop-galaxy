const CACHE = "gloop-v2";
const HASHED = /-[\w-]{8}\.(js|css)$/;
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/ws" || url.pathname === "/health")
    return;

  if (url.pathname.startsWith("/assets/") && HASHED.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.mode === "navigate") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/", copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
  );
});
