// Network-first for HTML and JS, cache-first for everything else.
//
// The sister app is cache-first with a hand-edited CACHE literal: forget the
// bump and installed phones keep the old shell forever, silently. Network-first
// on code means a forgotten bump costs a slower load, not a frozen app.

const CACHE = 'chorus-v1';

// The true app shell: everything the app needs to boot and run standalone,
// with the 3D scene absent (see lib/scene3d.js — the scene is never
// load-bearing; the project view stands on its own without it). This list
// goes through cache.addAll(), which is ATOMIC — one failed fetch here fails
// the whole offline install, so a genuine shell failure stays loud.
const SHELL = [
  './', './index.html', './styles.css', './app.js', './ui.js', './demo.js',
  './fixtures.json', './manifest.webmanifest', './icon.svg',
  './lib/dates.js', './lib/recurrence.js', './lib/pace.js', './lib/promotion.js', './lib/scene3d.js',
  './views/momentum.js', './views/day.js', './views/inbox.js', './views/projects.js'
];

// Heavy, optional assets for the procedural 3D scene. vendor/three.module.js
// alone is ~1.3MB — roughly double the entire SHELL list combined — and
// cache.addAll() is atomic: a transient failure fetching this one file would
// otherwise fail offline install for the whole app, not just the scene. The
// scene is explicitly non-load-bearing (lib/scene3d.js renders nothing and
// stays quiet on any failure), so these are fetched in a separate,
// non-atomic pass whose failure is tolerated — the app installs fine without
// them and picks them up from the network next time they're needed.
const OPTIONAL = [
  './vendor/three.module.js', './parts/pergola.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => caches.open(CACHE))
      .then(c => Promise.all(OPTIONAL.map(url => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;          // never intercept the Apps Script call

  // vendor/ is third-party code, immutable per release — cache-first like any
  // other static asset, not network-first. Without this exclusion the regex
  // below also matches vendor/three.module.js, so the largest file in the app
  // (~1.3MB) would be re-fetched over the network on every online page load,
  // even though the atomic/tolerant install split exists specifically to keep
  // that file's cost off the critical path.
  const isVendor = url.pathname.includes('/vendor/');
  const isCode = !isVendor && (/\.(html|js|json)$/.test(url.pathname) || url.pathname.endsWith('/'));

  if (isCode) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // fetch() resolves on 404/500 too — it only rejects on a network
          // failure. Caching a non-ok response would serve that broken
          // response as the offline fallback on every request after.
          if (res.ok && e.request.method === 'GET') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
  }
});
