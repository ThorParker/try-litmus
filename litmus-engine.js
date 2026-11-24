/* Litmus engine: the unchanged Litmus server (Python) running in this browser with Pyodide, in a Web Worker.
   The page's litmus-shim.js sends every /api/ request here. No server, no network call from Python.
   Data (one SQLite file) is kept in this browser's IndexedDB, shared by the student and teacher pages.
   Two tabs: every request runs under one Web Lock; a tab first loads any newer save made by another tab. */
'use strict';
var BUILD = '57a08bbcb0f9';
var ENV = {"HOME": "/home/pyodide", "LITMUS_DATA_DIR": "/data", "LITMUS_FORCE_DEMO": "1", "LITMUS_SEED_DEMO": "1", "LITMUS_ENV_FILE": "/app/.no-env-file", "LITMUS_TEACHER_CODE": "teach-2026", "LITMUS_RETENTION_DAYS": "1"};
var BASE = self.location.href.split('?')[0].replace(/[^/]*$/, '');
importScripts(BASE + 'pyodide/pyodide.js?v=' + BUILD);

var APP_DIR = '/app', DATA_DIR = '/data';
var DB_NAME = 'litmus-static-data', STORE = 'files', META = '__meta__', LOCK = 'litmus-static-data-lock';
var SKIP = /-(journal|wal|shm)$/;
var py = null, bridge = null, myVersion = 0, myEpoch = null, idbConn = null;
// One id per life of the stored data. "Clear this device" in any tab starts a new one, so a tab that still
// holds the old data loads the cleared copy and can never write the old data back.
function newEpoch() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

function quiet() {}

function idb() {
  if (idbConn) return Promise.resolve(idbConn);
  return new Promise(function (res, rej) {
    var r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
    r.onsuccess = function () { idbConn = r.result; idbConn.onversionchange = function () { idbConn.close(); idbConn = null; }; res(idbConn); };
    r.onerror = function () { rej(r.error); };
  });
}
function idbGet(db, key) {
  return new Promise(function (res, rej) {
    var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function idbClear(db) {
  return new Promise(function (res, rej) {
    var tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = res;
    tx.onerror = function () { rej(tx.error); };
  });
}
// "Clear this device" on a page: that page reloads with ?wipe=1 and its new engine clears the store first.
var WIPE = /[?&]wipe=1(&|$)/.test(self.location.search);
var seedBytes = null;
function withLock(fn) {
  if (self.navigator && navigator.locks && navigator.locks.request) return navigator.locks.request(LOCK, fn);
  return fn();
}

function listData() {
  return py.FS.readdir(DATA_DIR).filter(function (n) {
    if (n === '.' || n === '..' || SKIP.test(n)) return false;
    return py.FS.isFile(py.FS.stat(DATA_DIR + '/' + n).mode);
  });
}

// Write a saved copy (from another tab, or from an earlier visit) into the engine's files.
async function loadSaved(db, meta) {
  var names = meta.files || [];
  var blobs = await Promise.all(names.map(function (n) { return idbGet(db, 'f:' + n); }));
  listData().forEach(function (n) { if (names.indexOf(n) < 0) py.FS.unlink(DATA_DIR + '/' + n); });
  names.forEach(function (n, i) { if (blobs[i]) py.FS.writeFile(DATA_DIR + '/' + n, new Uint8Array(blobs[i])); });
  myVersion = meta.version;
  myEpoch = meta.epoch || null;
}

async function save(db, prevMeta) {
  bridge.flush();
  var names = listData();
  var version = Math.max(myVersion, (prevMeta && prevMeta.version) || 0) + 1;
  var old = (prevMeta && prevMeta.files) || [];
  var epoch = (prevMeta && prevMeta.epoch) || newEpoch();
  await new Promise(function (res, rej) {
    var tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
    names.forEach(function (n) { st.put(py.FS.readFile(DATA_DIR + '/' + n), 'f:' + n); });
    old.forEach(function (n) { if (names.indexOf(n) < 0) st.delete('f:' + n); });
    st.put({ version: version, epoch: epoch, files: names, build: BUILD, saved: Date.now() }, META);
    tx.oncomplete = res;
    tx.onerror = function () { rej(tx.error); };
    tx.onabort = function () { rej(tx.error); };
  });
  myVersion = version;
  myEpoch = epoch;
}

var times = {};
function mark(k) { times[k] = Math.round(performance.now()); }
async function boot() {
  mark('start');
  function get(name) {
    return fetch(BASE + 'engine/' + name + '?v=' + BUILD).then(function (r) {
      if (!r.ok) throw new Error('engine file ' + name + ' ' + r.status);
      return r.arrayBuffer();
    });
  }
  var zipP = get('app.zip'), seedP = get('seed.sqlite3');   // fetched while Pyodide starts
  zipP.catch(quiet); seedP.catch(quiet);
  py = await loadPyodide({ indexURL: BASE + 'pyodide/', env: ENV, stdout: quiet, stderr: quiet, fullStdLib: false });
  mark('pyodide');
  await py.loadPackage('sqlite3', { messageCallback: quiet, errorCallback: quiet, checkIntegrity: true });
  py.unpackArchive(await zipP, 'zip', { extractDir: APP_DIR });
  py.FS.mkdirTree(DATA_DIR);
  seedBytes = await seedP;   // every download is finished before the data lock is taken: a slow one never holds up another tab
  mark('files');
  await withLock(async function () {
    var db = await idb();
    if (WIPE) await idbClear(db);
    var meta = await idbGet(db, META);
    if (meta && meta.version) await loadSaved(db, meta);
    // A first visit starts from the demo class as the same code seeds it (made at build time: seeding it here
    // takes about 10 seconds). The seed is fixed (random seed 2026, fixed dates), so the data is the same.
    else py.FS.writeFile(DATA_DIR + '/litmus.sqlite3', new Uint8Array(seedBytes));
    py.runPython('import sys\nif "' + APP_DIR + '" not in sys.path: sys.path.insert(0, "' + APP_DIR + '")');
    mark('saved_loaded');
    bridge = py.pyimport('litmus_bridge');   // builds the App (seeds the demo class itself only if it is missing)
    mark('app');
    if (!meta || !meta.version) await save(db, meta);
    mark('ready');
  });
}

var ready = boot();
ready.then(function () { postMessage({ type: 'ready', times: times }); }, function (e) { postMessage({ type: 'failed', error: String(e && e.message || e) }); });

var enc = new TextEncoder();
function rawRequest(m) {
  var body = m.body ? new Uint8Array(m.body) : null;
  var head = m.method + ' ' + m.path + ' HTTP/1.1\r\nHost: localhost\r\n';
  (m.headers || []).forEach(function (kv) {
    var k = String(kv[0]).toLowerCase();
    if (k === 'host' || k === 'content-length' || k === 'connection') return;
    head += kv[0] + ': ' + String(kv[1]).replace(/[\r\n]/g, ' ') + '\r\n';
  });
  if (body) head += 'Content-Length: ' + body.length + '\r\n';
  head += 'Connection: close\r\n\r\n';
  var h = enc.encode(head);
  if (!body) return h;
  var all = new Uint8Array(h.length + body.length);
  all.set(h, 0); all.set(body, h.length);
  return all;
}
function parseReply(bytes) {
  var cut = -1;
  for (var i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) { cut = i; break; }
  }
  if (cut < 0) return { status: 500, headers: [['Content-Type', 'application/json']], body: enc.encode('{"error": "Something went wrong on the server."}') };
  var text = new TextDecoder('latin1').decode(bytes.subarray(0, cut));
  var lines = text.split('\r\n'), first = lines.shift().split(' ');
  var headers = lines.filter(Boolean).map(function (l) { var j = l.indexOf(':'); return [l.slice(0, j).trim(), l.slice(j + 1).trim()]; });
  return { status: parseInt(first[1], 10) || 500, statusText: first.slice(2).join(' '), headers: headers, body: bytes.slice(cut + 4) };
}

async function serve(m) {
  await ready;
  var out;
  await withLock(async function () {
    var db = await idb();
    var meta = await idbGet(db, META);
    if (meta && meta.version && ((meta.epoch || null) !== myEpoch || meta.version > myVersion)) {
      // Another tab saved newer data, or cleared this device and started again: load what is stored.
      bridge.close_db();
      await loadSaved(db, meta);
      bridge.open_db();
    } else if (!meta && myVersion > 0) {
      // Another tab cleared this device: start again from the demo class, never write the old data back.
      bridge.close_db();
      listData().forEach(function (n) { py.FS.unlink(DATA_DIR + '/' + n); });
      py.FS.writeFile(DATA_DIR + '/litmus.sqlite3', new Uint8Array(seedBytes));
      bridge.open_db();
      myVersion = 0;
      myEpoch = null;
    }
    var p = bridge.handle(rawRequest(m));
    var bytes = p.toJs();
    p.destroy();
    out = parseReply(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (bridge.last_changed()) await save(db, meta);
  });
  return out;
}

var queue = Promise.resolve();
self.onmessage = function (e) {
  var m = e.data;
  if (!m || !m.id) return;
  queue = queue.then(function () { return serve(m); }).then(function (r) {
    postMessage({ id: m.id, status: r.status, statusText: r.statusText, headers: r.headers, body: r.body.buffer }, [r.body.buffer]);
  }, function (err) {
    postMessage({ id: m.id, error: String(err && err.message || err) });
  });
};
