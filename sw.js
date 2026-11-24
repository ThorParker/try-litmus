/* Litmus service worker (no-server copy): offline shell plus the in-browser engine.
   Every build has its own cache names (BUILD is a hash of the site's files), so a new build never serves an old
   engine: the browser sees a changed sw.js, installs it, and the page reloads once when it takes over (app.js,
   "controllerchange"). /api/ requests never reach here: litmus-shim.js answers them in the page. */
var BUILD = '57a08bbcb0f9';
var CACHE = 'litmus-static-shell-' + BUILD;
var ENGINE = 'litmus-static-engine-' + BUILD;
var VOICE = 'litmus-voice-v1';
var SHELL = ["./", "index.html", "teacher.html", "styles.css", "app.js", "teacher.js", "config.js", "demo.js", "demo.css", "qr.js", "display.js", "door.js", "favicon.ico", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png", "img/flood_post.svg", "fonts/LexendDeca-Variable.ttf", "fonts/LexendDeca-Regular.ttf", "profile.js", "profile.css", "quick.js", "quick.css", "score_parts.js", "readaloud.js", "readaloud.css", "ui_audit.css", "litmus-shim.js", "litmus-engine.js"];
var SCOPE = new URL(self.registration ? self.registration.scope : './', self.location.href).pathname;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  // Only this app's own older caches: other sites on the same address keep theirs.
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('litmus-') === 0 && k !== CACHE && k !== ENGINE && k !== VOICE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.indexOf(SCOPE) !== 0) return;
  var rel = url.pathname.slice(SCOPE.length);
  // The engine (Pyodide and the Litmus code): cache first, kept per build.
  if (rel.indexOf('pyodide/') === 0 || rel.indexOf('engine/') === 0 || rel === 'litmus-engine.js') {
    e.respondWith(caches.open(ENGINE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok && res.status === 200) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  // Voice clips: cache first, else the network, kept on first play. The manifest: network first (a new render shows up).
  if (rel.indexOf('voice/') === 0) {
    if (/\.mp3$/.test(url.pathname)) {
      e.respondWith(caches.open(VOICE).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || fetch(req).then(function (res) { if (res.ok && res.status === 200) c.put(req, res.clone()); return res; });
        });
      }));
    } else {
      e.respondWith(fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(VOICE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return caches.open(VOICE).then(function (c) { return c.match(req, { ignoreSearch: true }); }); }));
    }
    return;
  }
  // App shell: cache first, refresh in the background.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit || caches.match('index.html'); });
    return hit || net;
  }));
});
