/* The optional human check at the door (19 Nov 2026). Off unless the server has both Turnstile keys
   (GET /api/door gives a site key). When on, it loads Cloudflare Turnstile in "managed" mode and adds a fresh
   token to the two requests that start a session (/api/session/start and /api/session/join). Each token is
   used once, then the widget is reset for the next one. Nothing else in the app changes. */
(function () {
  'use strict';
  var NEEDS = /\/api\/session\/(start|join)$/;
  var token = null, waiters = [], widget = null, on = false;

  function give(t) { token = t; var w = waiters; waiters = []; w.forEach(function (f) { f(t); }); }
  function nextToken(ms) {
    if (token) { var t = token; token = null; return Promise.resolve(t); }
    return new Promise(function (resolve) {
      var done = false;
      waiters.push(function (t) { if (!done) { done = true; token = null; resolve(t); } });
      setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
    });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var path = String(url && url.url ? url.url : url).split('?')[0];
    if (!on || !opts || (opts.method || 'GET') !== 'POST' || !NEEDS.test(path)) return realFetch(url, opts);
    return nextToken(10000).then(function (t) {
      var body = {};
      try { body = JSON.parse(opts.body || '{}') || {}; } catch (e) { body = {}; }
      body.door_token = t || '';
      var o = {}; for (var k in opts) o[k] = opts[k];
      o.body = JSON.stringify(body);
      if (widget !== null && window.turnstile) { try { window.turnstile.reset(widget); } catch (e) { /* next token comes anyway */ } }
      return realFetch(url, o);
    });
  };

  function start(siteKey, scriptUrl) {
    on = true;
    var box = document.createElement('div');
    box.id = 'door-check';
    box.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:50';
    document.body.appendChild(box);
    window.litmusDoorReady = function () {
      widget = window.turnstile.render(box, {
        sitekey: siteKey, appearance: 'interaction-only',
        callback: give, 'expired-callback': function () { token = null; }, 'error-callback': function () { token = null; }
      });
    };
    var s = document.createElement('script');
    s.src = scriptUrl;   // from the server, only when the check is on (no third-party address in this file)
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  realFetch('/api/door').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d && d.site_key && d.script) start(d.site_key, d.script);
  }).catch(function () { /* offline or an older server: no check */ });
})();
