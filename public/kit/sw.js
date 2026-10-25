// Longshot's service worker: keeps the page's own files so the app opens
// without a connection and can be installed. Anything on other sites
// (scores, prices) is never touched here (pictures: sw-images.js, imported
// before this by ../sw.js).
//
// ../sw.js sets self.LONGSHOT_SW = { cache } and imports this file.
// cache: the app's cache (a new name drops the old one); only caches that
// start the same way (the name without its vN) are deleted, since other
// apps live on the same github.io site.
//
// A file with a ?v= (every deploy stamps one) is served from the cache
// first, since that exact version never changes; the page itself from the
// cache too, refreshed behind it (pageFirst); anything else from the
// network first, the cache only when offline. One copy per file is kept: a
// new version replaces the old one. Saving a copy never holds up the answer
// (it runs on after it, under waitUntil).
//
// A ?v= that is a file's own hash (12 hex digits, scripts/hash.mjs) is checked
// against what came: GitHub Pages' CDN ignores the ?v=, so for a while after
// a deploy it can answer a new address with the old file. That copy was kept
// here for good, and the next openings mixed old and new files: the app
// stuck on its loading screen, which blamed the connection. Now a wrong copy
// is never kept: it's asked again past the browser's cache, and while the
// CDN still has the old one the page gets a 503 (boot.js then waits for the
// update to finish, and loads it).
const CACHE = self.LONGSHOT_SW?.cache || 'longshot-v2';
const PREFIX = CACHE.replace(/v\d+$/, '');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      // Only this app's own old copies: other apps share this github.io site (and its caches).
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Each file checked against its address ----
const HASHED = /^[0-9a-f]{12}$/;
const hashedAs = url => {
  const v = new URL(url).searchParams.get('v');
  return v && HASHED.test(v) ? v : null;
};
async function sha12(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  let hex = '';
  for (let i = 0; i < 6; i++) hex += digest[i].toString(16).padStart(2, '0');
  return hex;
}
// Whether a response is the file its address names (an address without a file hash: always).
async function isTrue(url, response) {
  const want = hashedAs(url);
  if (!want || !response || response.status !== 200 || response.type === 'opaque') return true;
  try {
    return (await sha12(await response.clone().arrayBuffer())) === want;
  } catch {
    return false;
  }
}
// The CDN still on the old file: asked again past the browser's cache (which
// may hold the same wrong copy for 10 minutes), a moment apart.
const AGAIN_MS = [0, 1500, 3500];
async function fetchTrue(request) {
  const first = await fetch(request);
  if (await isTrue(request.url, first)) return first;
  for (const wait of AGAIN_MS) {
    if (wait) await new Promise(done => setTimeout(done, wait));
    const res = await fetch(request.url, { cache: 'reload', credentials: 'same-origin' }).catch(() => null);
    if (res && (await isTrue(request.url, res))) return res;
  }
  return new Response('', { status: 503, statusText: 'Update not ready', headers: { 'X-Longshot-Stale': '1' } });
}

async function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // Drop older versions of the same file (only that file's copies are listed).
  for (const old of await cache.keys(url.origin + url.pathname, { ignoreSearch: true })) if (old.url !== url.href) await cache.delete(old);
  await cache.put(request, response);
}

// A poor connection: the network gets this long before a kept copy answers
// (the network's copy still saved for next time). It had no limit: on a slow
// connection each file the page imports waited out the network in turn.
const PATIENCE_MS = 2500;
// `later` takes what may run on after the answer (saving a copy).
async function networkFirst(request, later) {
  const kept = request.mode === 'navigate' ? null : await caches.match(request);
  if (kept) {
    const fresh = networkFirstNow(request, later);
    later(fresh);
    const late = new Promise(done => setTimeout(() => done(kept), PATIENCE_MS));
    return Promise.race([fresh.catch(() => kept), late]);
  }
  return networkFirstNow(request, later);
}
async function networkFirstNow(request, later) {
  try {
    // The page itself is checked with the server every time (a cheap 304
    // when unchanged): GitHub Pages lets browsers keep it 10 minutes, which
    // would open the last deploy's page right after a new one. By address,
    // since a navigation can't be re-sent with options.
    const response = request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : await fetch(request);
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline: this file as kept, else any version of it kept (the kit's ?v= changes with each of its deploys).
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' && (await caches.match('./')));
    if (cached) return cached;
    throw error;
  }
}

// Opening the app: the page kept here at once (no wait for the network,
// even on a poor connection), refreshed in the background for next time.
// A newer deploy is caught by the kit's version check (boot.js,
// watchUpdates), which reloads under a ?v= address: that one always asks
// the network.
async function pageFirst(request, later) {
  const kept = await caches.match(request, { ignoreSearch: true });
  const fresh = networkFirst(request, later);
  if (!kept) return fresh;
  later(fresh);
  return kept;
}

async function cacheFirst(request, later) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetchTrue(request);
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline with another version kept (the kit noted a newer one): that
    // one, rather than no app at all. (Not for a file checked by its hash: a
    // different copy is what stops a page from starting.)
    const other = hashedAs(request.url) ? null : await caches.match(request, { ignoreSearch: true });
    if (other) return other;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;
  // The owner's panel (admin/) is never kept: always the network's, as any
  // website. (A kept copy answered Safari at once with a black page.)
  if (url.href.startsWith(new URL('./admin', self.registration.scope).href)) return;
  // What runs on after the answer: the event is kept alive until it's all done
  // (a save started while another was awaited is waited for too).
  const tail = [];
  const later = work => tail.push(Promise.resolve(work).catch(() => {}));
  const route = request.mode === 'navigate' ? (url.searchParams.has('v') ? networkFirst : pageFirst) : url.searchParams.has('v') ? cacheFirst : networkFirst;
  const answer = route(request, later);
  event.respondWith(answer);
  event.waitUntil(
    (async () => {
      await answer.catch(() => {});
      for (let done = 0; done < tail.length; ) {
        const upTo = tail.length;
        await Promise.all(tail.slice(done, upTo));
        done = upTo;
      }
    })()
  );
});

// The page lists the files it loaded before this worker was in charge, so
// the very first visit already works offline next time (each checked, as
// any file this worker keeps).
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return;
  const urls = (event.data.urls || []).filter(u => new URL(u).origin === self.location.origin && !u.endsWith('/version.json'));
  event.waitUntil(
    Promise.all(
      urls.map(u =>
        caches.match(u).then(async hit => {
          if (hit) return;
          const res = await fetch(u).catch(() => null);
          if (res && (await isTrue(u, res))) await keep(new Request(u), res);
        })
      )
    )
  );
});
