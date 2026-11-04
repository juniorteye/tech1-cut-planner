// Keeps accepted cut sheets readable with no signal. Nothing here allows
// editing offline: every change still needs a connection.
const PAGES = "saved-pages-v1";
const STATIC = "static-v1";
const SAVED_PAGE = /^\/jobs\/[^/]+\/(cut-sheet|cost-summary)$/;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>No signal</title>
<body style="font-family:Arial,sans-serif;margin:0;background:#f2f2f0;color:#23272b">
<div style="height:12px;background:#e9b308"></div>
<main style="max-width:28rem;margin:auto;padding:2rem 1rem"><h1>No signal</h1>
<p>This page needs a connection. Saved cut sheets still work.</p>
<p><a href="/" style="font-weight:700;color:#23272b">Open your saved jobs</a></p></main>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function isSavedPage(pathname) {
  return pathname === "/" || SAVED_PAGE.test(pathname);
}

function assetsIn(text) {
  const found = text.match(/static\/(?:chunks|media)\/[^"'\\\s)?]+/g) ?? [];
  return [...new Set(found)].map((asset) => `/_next/${asset}`);
}

async function saveAsset(path, cache) {
  if (await cache.match(path, { ignoreSearch: true })) {
    return;
  }
  const response = await fetch(path);
  if (response.ok) {
    await cache.put(path, response.clone());
    if (path.endsWith(".css")) {
      await saveAssets(await response.text(), cache);
    }
  }
}

async function saveAssets(text, cache) {
  await Promise.allSettled(assetsIn(text).map((path) => saveAsset(path, cache)));
}

// A phone may never have opened this page, so the page's scripts, styles and
// fonts are saved with it. Without them the saved page crashes while offline.
async function savePage(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  if (response.ok && !response.redirected) {
    await saveAssets(await response.clone().text(), await caches.open(STATIC));
    const cache = await caches.open(PAGES);
    await cache.put(path, response);
  }
}

async function syncSavedPages(paths) {
  const cache = await caches.open(PAGES);
  const wanted = new Set(paths);

  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (SAVED_PAGE.test(pathname) && !wanted.has(pathname)) {
      await cache.delete(request);
    }
  }
  await Promise.allSettled(paths.map(savePage));
}

async function fromNetworkThenSaved(request, pathname) {
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && isSavedPage(pathname)) {
      const cache = await caches.open(PAGES);
      await cache.put(pathname, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES);
    const saved = await cache.match(pathname, { ignoreVary: true, ignoreSearch: true });
    return (
      saved ??
      new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
  }
}

async function fromStaticThenNetwork(request) {
  const cache = await caches.open(STATIC);
  const saved = await cache.match(request, { ignoreSearch: true });
  if (saved) {
    return saved;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fromStaticThenNetwork(event.request));
  } else if (event.request.mode === "navigate") {
    event.respondWith(fromNetworkThenSaved(event.request, url.pathname));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "sync-saved-pages") {
    event.waitUntil(syncSavedPages(event.data.paths));
  }
  if (event.data?.type === "clear-saved-pages") {
    event.waitUntil(caches.delete(PAGES));
  }
});
