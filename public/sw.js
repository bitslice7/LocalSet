const CACHE_PREFIX = "localset";
const LEGACY_CACHE_PREFIXES = ["localfit-", "form-daily-"];
const CACHE_VERSION = "v5";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const ACTIVE_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE]);

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/form/dumbbell-rdl.webp",
  "/form/dumbbell-row.webp",
  "/form/goblet-squat.webp",
  "/form/incline-push-up.webp",
  "/form/pike-push-up.webp",
  "/form/push-up.webp",
  "/form/split-squat.webp",
  "/form/squat.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // The page registers this worker after its first render, so its hashed
      // JavaScript and CSS may have loaded before the worker controls a fetch.
      // Discover those build assets from the HTML and precache them now; this
      // makes the next cold launch independent of the browser's HTTP cache.
      await cacheAppShell(cache);

      await self.skipWaiting();
    })(),
  );
});

async function cacheAppShell(cache) {
  const dependencies = new Set(APP_SHELL);

  try {
    const response = await fetch("/", { cache: "reload" });
    if (isCacheable(response)) {
      await cache.put("/", response.clone());
      const html = await response.text();
      discoverShellDependencies(html).forEach((path) => dependencies.add(path));
    }
  } catch {
    // Installation may continue with any assets that are still reachable.
  }

  dependencies.delete("/");
  await Promise.allSettled(
    [...dependencies].map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (isCacheable(response)) {
        await cache.put(path, response);
      }
    }),
  );
}

function discoverShellDependencies(html) {
  const paths = new Set();
  const attributePattern = /\b(?:href|src)=["']([^"'#]+)["']/gi;

  for (const match of html.matchAll(attributePattern)) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (
        url.origin === self.location.origin &&
        !isSensitivePath(url.pathname) &&
        (url.pathname.startsWith("/_next/static/") ||
          url.pathname.startsWith("/assets/"))
      ) {
        paths.add(url.pathname);
      }
    } catch {
      // Ignore malformed or unsupported URLs in the generated document.
    }
  }

  return paths;
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              (cacheName.startsWith(`${CACHE_PREFIX}-`) ||
                LEGACY_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix))) &&
              !ACTIVE_CACHES.has(cacheName),
          )
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    isSensitivePath(url.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(request, url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

function isSensitivePath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/signin-with-chatgpt" ||
    pathname === "/signout-with-chatgpt" ||
    pathname === "/callback"
  );
}

function isStaticAsset(request, pathname) {
  return (
    ["font", "image", "script", "style"].includes(request.destination) ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/_next/static/") ||
    APP_SHELL.includes(pathname)
  );
}

function isCacheable(response) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return false;
  }

  const cacheControl = response.headers.get("Cache-Control") || "";
  const vary = response.headers.get("Vary") || "";

  return !/(?:no-store|private)/i.test(cacheControl) && vary.trim() !== "*";
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

    if (isCacheable(response)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/", response.clone());
    }

    return response;
  } catch {
    const cachedResponse =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("/"));

    return cachedResponse || offlineResponse();
  }
}

async function staleWhileRevalidate(event, request) {
  const cachedResponse = await caches.match(request, { ignoreSearch: true });
  const networkUpdate = fetch(request).then(async (response) => {
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
      await trimCache(cache, 80);
    }

    return response;
  });

  if (cachedResponse) {
    event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
    return cachedResponse;
  }

  try {
    return await networkUpdate;
  } catch {
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;

  if (overflow > 0) {
    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
  }
}

function offlineResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#000000">
    <title>LocalSet — Offline</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #000; color: #fff; }
      main { width: min(28rem, calc(100% - 3rem)); }
      p { color: #a3a3a3; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>LocalSet</h1>
      <p>You are offline and this workout has not been cached yet. Reconnect once, then try again.</p>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}
