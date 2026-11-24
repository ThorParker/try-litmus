/* Litmus with no server: loaded before every other script. Requests for /api/... and /healthz go to the Litmus
   engine (litmus-engine.js, the real Litmus code running in this browser); everything else goes to the network
   untouched. Downloads from /api/ (the CSV export) are handled here too. */
(function () {
  'use strict';
  var BUILD = 'a292f64133ee';
  var me = document.currentScript && document.currentScript.src;
  var BASE = me ? me.split('?')[0].replace(/[^/]*$/, '') : new URL('./', location.href).href;
  var realFetch = window.fetch.bind(window);
  var seq = 0, waiting = {}, state = 'loading';
  var worker = null, starts = 0, MAX_STARTS = 3;

  function isApi(u) {
    return u.origin === location.origin && (u.pathname.indexOf('/api/') === 0 || u.pathname === '/healthz');
  }
  function failAll() {
    Object.keys(waiting).forEach(function (k) { waiting[k].reject(new TypeError('Failed to fetch')); delete waiting[k]; });
  }

  var WIPE_KEY = 'litmus-static-wipe', wipe = false;
  try { wipe = localStorage.getItem(WIPE_KEY) === '1'; } catch (e) { /* storage blocked */ }

  function giveUp() { state = 'failed'; window.LITMUS_ENGINE = { state: state }; failAll(); bootDone(); }
  // A first visit downloads the whole engine. One dropped file must not leave the page without it: a start
  // that fails is tried again with a fresh engine (three starts in all). Requests made meanwhile wait and are
  // sent to the engine that does start.
  function bootFailed(w) {
    if (w !== worker || state !== 'loading') return;
    worker = null;
    try { w.terminate(); } catch (e) { /* already gone */ }
    if (starts >= MAX_STARTS) { giveUp(); return; }
    // The next start downloads the engine afresh: a bad copy kept by this browser is dropped first.
    // Only Litmus's own engine cache is touched; saved answers are not.
    var again = function () { setTimeout(start, 700 * starts); };
    try {
      caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k.indexOf('litmus-static-engine-') === 0; }).map(function (k) { return caches.delete(k); }));
      }).then(again, again);
    } catch (e) { again(); }
  }
  function start() {
    if (state !== 'loading') return;
    starts++;
    var w;
    try { w = new Worker(BASE + 'litmus-engine.js?v=' + BUILD + (wipe ? '&wipe=1' : '')); } catch (e) { giveUp(); return; }
    worker = w;
    w.onmessage = function (e) {
      if (w !== worker) return;   // a late message from an engine that was replaced
      var m = e.data || {};
      if (m.type === 'ready') {
        state = 'ready'; window.LITMUS_ENGINE = { state: state, times: m.times, starts: starts };
        if (wipe) { try { localStorage.removeItem(WIPE_KEY); } catch (x) { /* storage blocked */ } }
        bootDone(); return;
      }
      if (m.type === 'failed') { bootFailed(w); return; }
      var p = waiting[m.id];
      if (!p) return;
      if (m.error && state === 'loading') return;   // the engine did not start: this request waits for the next one
      delete waiting[m.id];
      if (m.error) { p.reject(new TypeError('Failed to fetch')); return; }
      var nobody = m.status === 204 || m.status === 205 || m.status === 304;
      p.resolve(new Response(nobody ? null : m.body, { status: m.status, statusText: m.statusText || '', headers: m.headers }));
    };
    w.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (w !== worker) return;
      if (state === 'loading') bootFailed(w); else giveUp();
    };
    Object.keys(waiting).forEach(function (k) { w.postMessage(waiting[k].msg); });
  }
  start();

  function toEngine(u, method, headers, body) {
    if (state === 'failed') return Promise.reject(new TypeError('Failed to fetch'));
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      // The body is copied to the engine, not handed over, so the same request can be sent to a fresh engine.
      var msg = { id: id, method: method, path: u.pathname + u.search, headers: headers, body: body };
      waiting[id] = { resolve: resolve, reject: reject, msg: msg };
      if (worker) worker.postMessage(msg);
    });
  }

  window.fetch = function (input, init) {
    var isReq = typeof Request !== 'undefined' && input instanceof Request;
    var u;
    try { u = new URL(isReq ? input.url : String(input), location.href); } catch (e) { return realFetch(input, init); }
    if (!isApi(u)) return realFetch(input, init);
    init = init || {};
    var method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
    var h = new Headers(init.headers || (isReq ? input.headers : undefined)), headers = [];
    h.forEach(function (v, k) { headers.push([k, v]); });
    var bodyP;
    if (method === 'GET' || method === 'HEAD') bodyP = Promise.resolve(null);
    else if (init.body != null) bodyP = new Response(init.body).arrayBuffer();
    else if (isReq) bodyP = input.arrayBuffer();
    else bodyP = Promise.resolve(null);
    return bodyP.then(function (b) { return toEngine(u, method, headers, b && b.byteLength ? b : null); });
  };

  // "Clear this device": stop this page's engine and delete the engine's stored data in this browser. The next
  // page load starts from the demo class again, as on a first visit.
  // The page reloads straight after, so the wipe is done by the next engine, first thing, under its lock.
  window.LITMUS_ENGINE_CLEAR = function () {
    try { if (worker) worker.terminate(); } catch (e) { /* already gone */ }
    state = 'failed';
    failAll();
    try { localStorage.setItem(WIPE_KEY, '1'); } catch (e) { /* storage blocked */ }
  };

  // A link or window.open to /api/... (the CSV export): fetch it from the engine and save the file.
  function download(u) {
    return window.fetch(u.href).then(function (r) {
      var cd = r.headers.get('Content-Disposition') || '';
      var m = /filename="?([^";]+)"?/i.exec(cd);
      var name = m ? m[1] : (u.pathname.split('/').pop() || 'download');
      return r.blob().then(function (b) {
        var url = URL.createObjectURL(b), a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      });
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
    if (!isApi(u)) return;
    e.preventDefault();
    download(u);
  }, true);
  var realOpen = window.open;
  window.open = function (url) {
    try {
      var u = new URL(String(url), location.href);
      if (isApi(u)) { download(u); return null; }
    } catch (e) { /* not a URL: leave it to the browser */ }
    return realOpen.apply(window, arguments);
  };

  // While the engine starts: one plain line in the page's own main area, in the app's own type and colours.
  var line = null;
  function showLine() {
    if (state !== 'loading') return;
    var main = document.getElementById('main');
    if (!main || main.querySelector(':scope > :not(noscript)')) return;
    line = document.createElement('p');
    line.id = 'litmus-boot';
    line.className = 'muted';
    line.setAttribute('role', 'status');
    line.style.cssText = 'margin:0;padding:32px 16px;text-align:center';
    line.textContent = 'Loading Litmus…';
    main.appendChild(line);
  }
  function bootDone() {
    if (!line) return;
    var tries = 0;
    (function tidy() {
      if (!line || !line.parentNode) { line = null; return; }
      var main = line.parentNode, others = main.querySelectorAll(':scope > :not(noscript):not(#litmus-boot)').length;
      if (others || state === 'failed' || ++tries > 50) { line.remove(); line = null; return; }
      setTimeout(tidy, 100);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showLine);
  else showLine();
})();
