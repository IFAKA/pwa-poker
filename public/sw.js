const CACHE_NAME = "table-stakes-v2";
const APP_ROUTES = ["/", "/players", "/history", "/settings"];
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    [...CORE_ASSETS, ...APP_ROUTES].map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        // Keep install resilient if one optional asset is temporarily unavailable.
      }
    }),
  );

  try {
    const response = await fetch("/", { cache: "reload" });
    if (!response.ok) {
      return;
    }

    await cache.put("/", response.clone());
    const html = await response.text();
    const staticAssets = Array.from(
      html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g),
      (match) => match[1],
    );

    await Promise.all(
      [...new Set(staticAssets)].map(async (url) => {
        try {
          await cache.add(url);
        } catch {
          // Runtime caching will fill any missed chunk on first use.
        }
      }),
    );
  } catch {
    // The runtime fetch handler still makes previously cached versions available.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(event.request)) ?? (await cache.match("/"));
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    }),
  );
});
