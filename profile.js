/* Litmus: My profile, My record, and Settings (19 Nov 2026). Plain JavaScript, no build step.
   Three screens on their own hash routes (#/profile, #/record, #/settings), drawn into the app's <main>
   through one small hook in app.js (render). One header control opens them.
   The student is still only their codes: nothing here asks for a name, an email, a password, or a location,
   and nothing here sends anything to an outside service. The profile and record are for the session in
   this browser; there is no "come back with your code" (no secret, so a classmate's code would open it).
   Settings follow the codes on the server, as they already did.
   Off switch: LITMUS_PROFILE=0 on the server; /api/profile/status then says off and this file does nothing. */
(function () {
  'use strict';
  var A = window.LitmusApp;
  if (!A) return;
  var DEMO = !!A.demo;
  var VIEWS = { profile: 1, record: 1, settings: 1, subjects: 1 };
  var WITHOUT_SESSION = { settings: 1 };

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  function S() { return A.state; }
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 5200);
  }
  var SVG = function (d, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>'; };
  var ICON = {
    user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    copy: SVG('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
    tick: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
    dash: SVG('<path d="M7 12h10"/>', 2.6),
    up: SVG('<path d="M12 19V5M6 11l6-6 6 6"/>', 2.2),
    arrow: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    print: SVG('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
    doc: SVG('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    chev: '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>',
    trust: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.2),
    question: SVG('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2.2),   // 20 Nov 2026: a cross, as on the answer sheet
    verify: SVG('<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>', 2.2),
    info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    speaker: SVG('<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>')
  };
  function more(id, label, inner) {
    return '<div class="more pf-more"><button type="button" class="more-btn" data-disclose aria-expanded="false" aria-controls="' + id + '"><span>' + label + '</span>' + ICON.chev + '</button>' +
      '<div class="more-body" id="' + id + '" hidden>' + inner + '</div></div>';
  }
  function cells(level) {
    var out = '<span class="cells" aria-hidden="true">';
    for (var i = 1; i <= 3; i++) out += '<i class="' + (level && i <= level ? 'c' + i : '') + '"></i>';
    return out + '</span>';
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  // The student code as the app shows it: through the app's own display function when it has one (for example the
  // six-digit form, "482 915"), otherwise exactly as the app holds it.
  function codeText(c) {
    var f = A.displayCode || A.formatCode || A.codeLabel;
    return typeof f === 'function' ? String(f(c)) : String(c == null ? '' : c);
  }
  function api(path, body) { return A.api(path, body); }

  /* ---------------------------------------------------------------- on or off */
  // On until the server says otherwise (held in memory only, so nothing about it stays on the device).
  var ON = !DEMO;
  function on() { return ON; }

  /* ---------------------------------------------------------------- settings beyond the Accessibility panel */
  // Font, text size, and colours stay in app.js (the panel's selects). These four are kept here,
  // in this browser always (litmus-settings-more, so "Clear this device" removes it with the litmus-settings*
  // keys), and with the codes on the server once a session exists (service.ALLOWED_SETTINGS lists them).
  var EXTRA = {
    spacing: { def: 'normal', allowed: ['normal', 'wide'] },
    motion: { def: 'device', allowed: ['device', 'reduce'] },
    listen: { def: 'show', allowed: ['show', 'hide'] },
    speech: { def: 'normal', allowed: ['slow', 'normal', 'fast'] },
    // 19 Nov 2026: "Read every screen to me" (static/readaloud.js reads each screen once when it settles). Off by default.
    autoread: { def: 'off', allowed: ['off', 'on'] }
  };
  var RATE = { slow: 0.8, normal: 1, fast: 1.25 };
  function cleanPrefs(p) {
    var out = {};
    Object.keys(EXTRA).forEach(function (k) { out[k] = p && EXTRA[k].allowed.indexOf(p[k]) >= 0 ? p[k] : EXTRA[k].def; });
    return out;
  }
  var PREFS_KEY = 'litmus-settings-more';
  var prefs = cleanPrefs(store.get(PREFS_KEY));
  function applyPrefs() {
    var h = document.documentElement;
    h.dataset.spacing = prefs.spacing; h.dataset.motion = prefs.motion; h.dataset.listen = prefs.listen;
    h.dataset.speech = prefs.speech; h.dataset.autoread = prefs.autoread;   // read by static/readaloud.js
  }
  applyPrefs();
  // Reading speed: every "Listen" button in the app speaks through speechSynthesis.speak; the chosen speed
  // is applied there, so app.js needs no change.
  if ('speechSynthesis' in window && window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') {
    var origSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    try {
      window.speechSynthesis.speak = function (u) {
        try { if (u && RATE[prefs.speech]) u.rate = (u.rate || 1) * RATE[prefs.speech]; } catch (e) { /* keep the default */ }
        return origSpeak(u);
      };
    } catch (e) { /* read-only in this browser: the default speed stays */ }
  }
  function coreSettings() {
    var f = $('#set-font'), z = $('#set-size'), t = $('#set-theme');
    return { font: f ? f.value : 'lexend', size: z ? z.value : 'normal', theme: t ? t.value : 'light' };
  }
  var savedWhere = '';
  function savePrefs() {
    store.set(PREFS_KEY, prefs);
    applyPrefs();
    var st = S();
    if (!st.session || !st.sid) { savedWhere = 'device'; showSaved(); return; }
    sendSettings();
  }
  // One save at a time, always with the choices as they are when it is sent: quick taps never send an
  // older set of choices after a newer one.
  var inFlight = false, again = false, extraBody = {};
  function sendSettings(extra) {
    if (extra) extraBody = Object.assign(extraBody, extra);
    if (inFlight) { again = true; return; }
    var st = S();
    if (!st.session || !st.sid) return;
    inFlight = true;
    api('/api/settings', { sid: st.sid, settings: Object.assign(coreSettings(), prefs, extraBody) }).then(function (r) {
      if (st.session && r && r.settings) st.session.settings = r.settings;
      savedWhere = 'code'; showSaved(); settled(true);
    }, function (e) { savedWhere = 'device'; showSaved(); settled(false, e); });
  }
  var onSettled = null;
  function settled(ok, e) {
    inFlight = false;
    if (again) { again = false; sendSettings(); return; }
    if (onSettled) onSettled(ok, e);
  }
  function showSaved() {
    var el = $('#st-saved');
    if (el) el.textContent = savedWhere === 'code' ? 'Saved with your code.' : 'Saved on this device.';
  }
  // A session's own choices win on a new device; this device's choices go up to a code that has none.
  var syncedSid = null;
  function syncPrefs() {
    var st = S();
    if (!st.session || !st.sid || syncedSid === st.sid) return;
    syncedSid = st.sid;
    var srv = st.session.settings || {};
    var has = Object.keys(EXTRA).some(function (k) { return srv[k]; });
    if (has) { prefs = cleanPrefs(Object.assign({}, prefs, srv)); store.set(PREFS_KEY, prefs); applyPrefs(); }
    else if (store.get(PREFS_KEY)) { api('/api/settings', { sid: st.sid, settings: Object.assign(coreSettings(), prefs) }).catch(function () {}); }
  }

  /* ---------------------------------------------------------------- the header control */
  var btn = null;
  function codeOf() { var st = S(); return st.session ? st.session.student_code : ''; }
  function drawButton() {
    var all = $('#all-settings'); if (all) all.hidden = !ON;
    if (!ON) { if (btn) { btn.remove(); btn = null; } return; }
    var tools = $('.topbar-tools');
    if (!tools) return;
    if (!btn) {
      btn = document.createElement('a');
      btn.className = 'iconbtn profile-btn';
      btn.id = 'profile-btn';
      tools.insertBefore(btn, tools.firstChild);
    }
    var code = codeOf();
    // With a session: My profile. Before one: Settings (there is no profile without a session).
    btn.href = code ? '#/profile' : '#/settings';
    btn.innerHTML = (code ? ICON.user : ICON.gear) + '<span class="pb-word">' + (code ? 'My profile' : 'Settings') + '</span>';
    // One stable label (19 Nov 2026, round 2): the code is shown inside My profile, not in the control's name.
    btn.setAttribute('aria-label', code ? 'My profile' : 'Settings');
    btn.title = code ? 'My profile' : 'Settings';
    var v = A.route().view;
    if (VIEWS[v]) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  }
  window.addEventListener('hashchange', function () { syncPrefs(); drawButton(); });
  // "All settings" under the Accessibility panel's three choices.
  (function () {
    var foot = $('#display-panel .display-foot') || $('#display-panel .display-body');
    if (!foot || DEMO) return;
    var a = document.createElement('a');
    a.className = 'btn quiet small all-settings';
    a.href = '#/settings';
    a.id = 'all-settings';
    a.textContent = 'All settings';
    a.addEventListener('click', function () { if (window.LitmusDisplay) window.LitmusDisplay.close(false); });
    foot.appendChild(a);
  })();

  /* ---------------------------------------------------------------- set names and words */
  function mainAction(st) {
    var s = st.session;
    if (!s) return null;
    if (s.has_results) return { go: 'results', label: 'See my results' };
    return { go: 'task', label: s.done.length ? 'Carry on' : 'Start the tasks' };
  }

  /* ---------------------------------------------------------------- My profile */
  function renderProfile(main) {
    var st = S();
    var s = st.session;
    main.innerHTML = '<div class="pf-page"><p class="typing"><span class="spinner" aria-hidden="true"></span> Loading your profile</p></div>';
    Promise.all([api('/api/profile?sid=' + encodeURIComponent(st.sid)), loadSubjects()]).then(function (r) { drawProfile(main, r[0]); }, function (e) {
      drawProfile(main, { student_code: s.student_code, class_code: s.class_code, set: s.set, sets: [], areas: [], calibration: { tasks: 0 }, offline: true, error: e.offline ? '' : e.message });
    });
  }
  function codeCard(p) {
    return '<div class="pf-code-card panel" id="pf-code-card"><span class="pf-strip" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<div class="pf-codes"><span class="pfc-label">Student code</span><span class="pf-code" id="pf-code">' + esc(codeText(p.student_code)) + '</span>' +
      '<span class="pfc-label">Class code</span><span class="pf-class" id="pf-class">' + esc(p.class_code) + '</span></div>' +
      '<button type="button" class="iconbtn pf-copy" id="pf-copy" aria-label="Copy both codes">' + ICON.copy + '<span>Copy</span></button></div>';
  }
  function setsCard(p) {
    if (!p.sets.length) return '';
    return '<section class="card pf-card" aria-labelledby="pf-sets-h"><h2 id="pf-sets-h">Sets</h2><ol class="pf-sets">' + p.sets.map(function (x) {
      return '<li><span class="pf-set-name">' + esc(x.label) + '</span><span class="pf-set-n">' + x.tasks_done + ' of ' + x.tasks_total + ' tasks</span>' +
        '<span class="pf-set-score">' + (x.finished && x.overall != null ? '<b>' + x.overall + '</b><small> / 100</small>' : '<span class="tag">In progress</span>') + '</span></li>';
    }).join('') + '</ol></section>';
  }
  function areasCard(p) {
    var measured = p.areas.filter(function (a) { return a.readings.length; });
    if (!measured.length) return '';
    var many = p.sets.filter(function (x) { return x.finished; }).length > 1;
    return '<section class="card pf-card" aria-labelledby="pf-areas-h"><h2 id="pf-areas-h">Topics</h2><ul class="pf-areas">' + p.areas.map(function (a) {
      if (!a.readings.length) return '<li><span class="pf-a-name">' + esc(a.name) + '</span><span class="pf-a-lv muted">' + cells(0) + 'Not measured</span></li>';
      var last = a.latest;
      var path = a.readings.length > 1 ? '<span class="pf-a-path">' + a.readings.map(function (r) { return 'Level ' + r.level; }).join(' <span aria-hidden="true">&rarr;</span><span class="visually-hidden">, then</span> ') + '</span>' : '';
      var change = a.change === 'up' ? '<span class="pf-up">' + ICON.up + 'Up ' + plural(a.steps, 'level') + '</span>' : (a.change === 'same' ? '<span class="pf-same">Same level</span>' : '');
      return '<li><span class="pf-a-name">' + esc(a.name) + '</span><span class="pf-a-lv">' + cells(last.level) + 'Level ' + last.level + ': ' + esc(last.level_name) + '</span>' +
        (many && (path || change) ? '<span class="pf-a-move">' + path + change + '</span>' : '') + '</li>';
    }).join('') + '</ul></section>';
  }
  function calibrationCard(c) {
    if (!c || !c.tasks) return '';
    var sure = c.sure, unsure = c.unsure;
    var line = sure.n ? 'Sure on ' + plural(sure.n, 'task') + '. Right call on ' + sure.right + ' of them.'
      : 'You felt less sure on all ' + plural(unsure.n, 'task') + ', and made the right call on ' + unsure.right + ' of them.';
    function row(label, rows) {
      if (!rows.length) return '';
      var right = rows.filter(function (r) { return r.right; }).length;
      return '<div class="cal-row"><p class="cal-head"><span class="cal-label">' + label + '</span><span class="cal-n">Right call on ' + right + ' of ' + rows.length + '</span></p>' +
        '<span class="cal-tiles" aria-hidden="true">' +
        rows.slice().sort(function (a, b) { return (b.right ? 1 : 0) - (a.right ? 1 : 0); }).map(function (r) { return '<i class="' + (r.right ? 'r' : 'w') + '" title="' + esc(r.title || '') + '">' + (r.right ? ICON.tick : ICON.dash) + '</i>'; }).join('') +
        '</span></div>';
    }
    return '<section class="card pf-card pf-cal" aria-labelledby="pf-cal-h"><h2 id="pf-cal-h">How sure, how right</h2>' +
      '<p class="cal-line" id="cal-line">' + esc(line) + '</p>' +
      '<div class="cal-grid">' + row('Sure', c.rows.filter(function (r) { return r.sure; })) + row('Less sure', c.rows.filter(function (r) { return !r.sure; })) + '</div>' +
      '<p class="cal-key small muted"><span>' + ICON.tick + 'Right call</span><span>' + ICON.dash + 'Not the right call</span></p>' +
      more('cal-more', 'More', '<p class="small">Sure means you chose Sure or Certain. A right call means a strong choice for that task. Shown to help you reflect. Not scored.</p>') +
      '</section>';
  }
  // How long work is kept and who can delete it: the start notice's own line, from the server's retention setting.
  function keptLine(p) {
    var d = S().status ? S().status.retention_days : null;
    if (typeof d === 'number' && d > 0) return 'Your answers are deleted after ' + d + (d === 1 ? ' day' : ' days') + ', or sooner if your teacher deletes the class.';
    if (d === 0) return 'Your answers are kept until your teacher deletes the class.';
    return '';
  }
  // The help line from the safety screen's own replies (litmus/safety.py), word for word.
  var HELP = "If you need help now, talk to a trusted adult or your school's safeguarding lead. In an emergency, call 999.";
  function linksCard(p) {
    var join = p.set === 'judge';
    var kept = keptLine(p);
    return '<nav class="card pf-card pf-links" aria-label="More for you">' +
      '<a class="pf-link" href="#/record" id="pf-to-record">' + ICON.doc + '<span><b>My record</b><small>Every decision, and why. Save or print it.</small></span>' + ICON.arrow + '</a>' +
      '<a class="pf-link" href="#/settings" id="pf-to-settings">' + ICON.gear + '<span><b>Settings</b><small>Text, colours, motion, reading aloud.</small></span>' + ICON.arrow + '</a>' +
      more('pf-notice', 'Who sees my work', (A.notice ? A.notice(join) : '')) +
      more('pf-help', 'Get help', '<p>' + esc(HELP) + '</p>') +
      (kept ? '<p class="pf-kept small" id="pf-kept">' + esc(kept) + '</p>' : '') +
      '</nav>';
  }
  function drawProfile(main, p) {
    var st = S();
    var act = mainAction(st);
    main.innerHTML = '<div class="pf-page">' +
      '<header class="pf-head"><h1 id="pf-h" tabindex="-1">My profile</h1></header>' +
      '<div class="pf-top">' + codeCard(p) +
        '<div class="pf-top-side">' + (p.set === 'school' ? '<p class="pf-return">Use the same code every time. Your settings follow it.</p>' : '') +
        (act ? '<button type="button" class="btn block" data-go="' + act.go + '" id="pf-main">' + act.label + '</button>' : '') +
        (p.error ? '<p class="error">' + esc(p.error) + '</p>' : '') + (p.offline && !p.error ? '<p class="small muted">Your sets need a connection.</p>' : '') + '</div>' +
      '</div>' +
      '<div class="pf-grid">' +
        '<div class="pf-col">' + setsCard(p) + subjectsCard() + areasCard(p) + '</div>' +
        '<div class="pf-col">' + calibrationCard(p.calibration) + linksCard(p) + '</div>' +
      '</div></div>';
    wireCopy(p);
  }
  function wireCopy(p) {
    var b = $('#pf-copy'); if (!b) return;
    b.addEventListener('click', function () {
      var text = 'Class code: ' + p.class_code + '\nStudent code: ' + codeText(p.student_code);
      var done = function () { b.querySelector('span').textContent = 'Copied'; toast('Codes copied.'); setTimeout(function () { var sp = b.querySelector('span'); if (sp) sp.textContent = 'Copy'; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { selectCode(); });
      else selectCode();
    });
  }
  function selectCode() {
    var el = $('#pf-code'); if (!el || !window.getSelection) return;
    var r = document.createRange(); r.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast('Code selected. Copy it, or take a photo.');
  }
  /* ---------------------------------------------------------------- My record */
  function fmtDate(ts) {
    var d = ts ? new Date(ts * 1000) : new Date();
    var m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
  }
  function renderRecord(main) {
    var st = S();
    main.innerHTML = '<div class="pf-page"><p class="typing"><span class="spinner" aria-hidden="true"></span> Loading your record</p></div>';
    api('/api/record?sid=' + encodeURIComponent(st.sid)).then(function (r) { drawRecord(main, r); }, function (e) {
      main.innerHTML = '<div class="pf-page pf-narrow"><div class="card"><h1>My record</h1><p>' + esc(e.offline ? 'Your record needs a connection.' : e.message) + '</p></div></div>';
    });
  }
  function drawRecord(main, r) {
    var sets = r.sets.map(function (set, si) {
      return '<section class="rec-set" aria-labelledby="rec-set-' + si + '"><div class="rec-set-head"><h2 id="rec-set-' + si + '">' + esc(set.label) + '</h2>' +
        (set.finished && set.overall != null ? '<span class="rec-set-score">' + set.overall + ' out of 100</span>' : '<span class="tag">In progress</span>') + '</div>' +
        set.tasks.map(function (t) {
          var what = t.what_was_going_on ? ' ' + esc(t.what_was_going_on) + (t.correction ? ' ' + esc(t.correction) : '') : '';
          return '<article class="rec-task" aria-labelledby="rec-' + si + '-' + t.n + '"><header class="rec-task-head"><span class="num" aria-hidden="true">' + t.n + '</span>' +
            '<h3 id="rec-' + si + '-' + t.n + '"><span class="visually-hidden">Task ' + t.n + ': </span>' + esc(t.title) + '</h3><span class="rec-tags-h">' + (t.subject ? '<span class="tag sub-tag">' + esc(t.subject) + '</span>' : '') + '<span class="tag">' + esc(t.area_name) + '</span></span></header>' +
            '<dl class="rec-rows">' +
              (t.ai_said ? '<div><dt>The AI said</dt><dd class="rec-quote">' + esc(t.ai_said) + '</dd></div>' : '') +
              '<div><dt>I decided</dt><dd class="rec-choice">' + (ICON[t.choice] || '') + '<b>' + esc(t.choice_label) + '</b>' + (t.confidence ? '<span class="muted"> &middot; ' + esc(t.confidence) + '</span>' : '') + '</dd></div>' +
              (t.reason || t.tags.length ? '<div><dt>My reason</dt><dd>' + (t.reason ? '&ldquo;' + esc(t.reason) + '&rdquo;' : '') + (t.tags.length ? '<span class="rec-tags">' + t.tags.map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join('') + '</span>' : '') + '</dd></div>' : '') +
              (t.did.length ? '<div><dt>What I did</dt><dd><ul class="rec-did">' + t.did.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul></dd></div>' : '') +
              '<div><dt>Result</dt><dd><span class="rec-ai">' + (t.ai_correct ? ICON.tick + 'The AI was right here.' : ICON.info + 'The AI had a problem here.') + '</span>' + (what ? '<span class="rec-what">' + what + '</span>' : '') +
                (t.score != null ? '<span class="rec-score">' + t.score + ' out of 100' + (t.reviewed ? ', reviewed by my teacher' : '') + '</span>' : '') + '</dd></div>' +
            '</dl></article>';
        }).join('') + '</section>';
    }).join('');
    main.innerHTML = '<div class="pf-page rec-page">' +
      '<header class="pf-head rec-head"><h1 id="rec-h" tabindex="-1">My record</h1><p class="rec-sub">How I worked with AI: each decision, and why.</p>' +
        '<p class="rec-meta">Student code ' + esc(codeText(r.student_code)) + ' &middot; Class ' + esc(r.class_code) + ' &middot; ' + esc(fmtDate(r.made)) + '</p>' +
        '<div class="rec-actions no-print"><button type="button" class="btn" id="rec-print">' + ICON.print + '<span>Save or print</span></button><a class="btn quiet" href="#/profile">My profile</a></div>' +
        '<p class="small muted no-print rec-tip">To keep a copy, choose Save as PDF.</p>' +
      '</header>' +
      (sets || '<div class="card"><p>Your decisions appear here as you finish tasks.</p><button type="button" class="btn" data-go="task">Go to the tasks</button></div>') +
      '<p class="rec-foot">Litmus Decision Trail. The AI in Litmus is sometimes wrong on purpose; each task says what was going on.</p>' +
      '</div>';
    $('#rec-print').addEventListener('click', function () { window.print(); });
  }

  /* ---------------------------------------------------------------- Settings */
  var FONT_STACK = {
    lexend: '"Lexend Deca", "Lexend Deca Local", "Segoe UI", system-ui, sans-serif',
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif'
  };
  function seg(kind, name, cols, options, value, help) {
    return '<fieldset class="seg seg-' + kind + ' st-seg" style="--cols:' + cols + '"><legend>' + name + '</legend>' + (help ? '<p class="st-help small muted" id="help-' + kind + '">' + help + '</p>' : '') + '<div class="seg-row">' +
      options.map(function (o) {
        return '<label' + (o.style ? ' style="' + o.style + '"' : '') + '><input type="radio" name="st-' + kind + '" value="' + esc(o.v) + '"' + (o.v === value ? ' checked' : '') + (help ? ' aria-describedby="help-' + kind + '"' : '') + '>' + (o.extra || '') +
          '<span class="seg-text">' + esc(o.t) + '</span><svg class="seg-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></label>';
      }).join('') + '</div></fieldset>';
  }
  function renderSettings(main) {
    var c = coreSettings();
    var speech = 'speechSynthesis' in window;
    main.innerHTML = '<div class="pf-page st-page">' +
      '<header class="pf-head"><h1 id="st-h" tabindex="-1">Settings</h1></header>' +
      '<div class="st-grid">' +
        '<section class="card st-card" aria-labelledby="st-read-h"><h2 id="st-read-h">Reading</h2>' +
          // Text size (19 Nov 2026): the same slider as the Accessibility panel (display.js, LitmusTextSize).
          (window.LitmusTextSize ? window.LitmusTextSize.sliderHtml('st') : '') +
          seg('font', 'Font', 3, [{ v: 'lexend', t: 'Lexend Deca', style: 'font-family:' + esc(FONT_STACK.lexend) }, { v: 'system', t: 'System', style: 'font-family:' + esc(FONT_STACK.system) }, { v: 'serif', t: 'Serif', style: 'font-family:' + esc(FONT_STACK.serif) }], c.font) +
          seg('spacing', 'Line spacing', 2, [{ v: 'normal', t: 'Standard', extra: '<span class="st-lines" aria-hidden="true"><i></i><i></i><i></i></span>' }, { v: 'wide', t: 'Wider', extra: '<span class="st-lines wide" aria-hidden="true"><i></i><i></i><i></i></span>' }], prefs.spacing) +
        '</section>' +
        '<section class="card st-card" aria-labelledby="st-col-h"><h2 id="st-col-h">Colours</h2>' +
          seg('theme', 'Colour mode', 2, [
            { v: 'light', t: 'Light', extra: '<span class="seg-sw seg-sw-light" aria-hidden="true"><i></i><i></i><i></i></span>' },
            { v: 'dark', t: 'Dark', extra: '<span class="seg-sw seg-sw-dark" aria-hidden="true"><i></i><i></i><i></i></span>' },
            { v: 'contrast', t: 'High contrast', extra: '<span class="seg-sw seg-sw-contrast" aria-hidden="true"><i></i><i></i><i></i></span>' },
            { v: 'cvd', t: 'Colour-blind safe', extra: '<span class="seg-sw seg-sw-cvd" aria-hidden="true"><i></i><i></i><i></i></span>' }], c.theme,
            'Levels are always named in words too.') +
          (window.LitmusColourSample || '') +
        '</section>' +
        '<section class="card st-card" aria-labelledby="st-mo-h"><h2 id="st-mo-h">Motion</h2>' +
          seg('motion', 'Movement on screen', 2, [{ v: 'device', t: 'Match my device' }, { v: 'reduce', t: 'Reduce motion' }], prefs.motion) +
        '</section>' +
        (speech ? '<section class="card st-card" aria-labelledby="st-sp-h"><h2 id="st-sp-h">Reading aloud</h2>' +
          seg('listen', 'Listen buttons', 2, [{ v: 'show', t: 'Show' }, { v: 'hide', t: 'Hide' }], prefs.listen) +
          seg('speech', 'Reading speed', 3, [{ v: 'slow', t: 'Slower' }, { v: 'normal', t: 'Standard' }, { v: 'fast', t: 'Faster' }], prefs.speech) +
          (window.LitmusReadAloud ? seg('autoread', 'Read every screen to me', 2, [{ v: 'off', t: 'Off' }, { v: 'on', t: 'On' }], prefs.autoread) : '') +
          '<div class="row st-try"><button type="button" class="iconbtn" id="st-try" aria-pressed="false">' + ICON.speaker + '<span>Try it</span></button></div>' +
        '</section>' : '') +
        // HOOK, 19 Nov 2026: "Clear this device" is the integrator's control (static/app.js, LitmusApp.clearDevice,
        // with its own confirmation and its own words). This card appears only when that function exists, and calls it.
        (typeof A.clearDevice === 'function' ? '<section class="card st-card" aria-labelledby="st-dev-h"><h2 id="st-dev-h">This device</h2>' +
          '<button type="button" class="btn quiet" id="st-clear">Clear this device</button>' +
          // The app's own words under its own button (index.html #clear-device-note), never new ones.
          ($('#clear-device-note') ? '<p class="small muted st-clear-note">' + esc($('#clear-device-note').textContent) + '</p>' : '') +
          '</section>' : '') +
      '</div>' +
      '<p class="st-saved" id="st-saved" role="status" aria-live="polite"></p>' +
      '<div class="row st-foot">' + (S().session ? '<a class="btn quiet" href="#/profile">My profile</a>' : '<a class="btn quiet" href="#/start">Back to the start</a>') + '</div>' +
      '</div>';
    var CORE = { size: '#set-size', font: '#set-font', theme: '#set-theme' };
    if (window.LitmusTextSize) {
      var tsSlider = window.LitmusTextSize.bind(main, 'st', function (v) {
        var sel = $('#set-size');
        if (sel) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }   // app.js saves it
        savedWhere = S().session ? 'code' : 'device'; showSaved();
      });
      if (tsSlider) tsSlider.show(c.size);
    }
    main.querySelector('.st-grid').addEventListener('change', function (e) {
      var t = e.target; if (!t || t.type !== 'radio') return;
      var kind = t.name.replace(/^st-/, '');
      if (CORE[kind]) {
        var sel = $(CORE[kind]);
        if (sel) { sel.value = t.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }   // app.js saves these three
        savedWhere = S().session ? 'code' : 'device'; showSaved();
      } else {
        prefs[kind] = t.value;
        savePrefs();
      }
    });
    var clr = $('#st-clear');
    if (clr) clr.addEventListener('click', function () { A.clearDevice(); });
    var tryBtn = $('#st-try');
    if (tryBtn) tryBtn.addEventListener('click', function () {
      window.speechSynthesis.cancel();
      // 19 Nov 2026: only a voice that can be named male and English (static/readaloud.js); none = the button is hidden.
      var RA = window.LitmusReadAloud, mv = RA && RA.pickVoice ? RA.pickVoice() : null;
      if (!mv) return;
      var u = new SpeechSynthesisUtterance('This is how Litmus reads aloud.');
      u.voice = mv; u.lang = mv.lang;
      window.speechSynthesis.speak(u);
    });
  }

  /* ---------------------------------------------------------------- My subjects (19 Nov 2026)
     Optional and changeable: tap the A-level subjects you take. Saved as the "subjects" setting, so it follows
     the codes like the other settings. Practice sets prefer tasks set in these subjects where the topic and level
     rules allow (litmus/nextset.py rule 7). The first set is the same for everyone. Off: LITMUS_SUBJECTS=0. */
  var SUBJ = { on: true, list: null, max: 6 };
  function loadSubjects() {
    if (SUBJ.list) return Promise.resolve(SUBJ);
    return api('/api/profile/subjects').then(function (r) {
      SUBJ.on = !!r.on; SUBJ.list = r.subjects || []; SUBJ.max = r.max || 6;
      return SUBJ;
    }, function () { SUBJ.list = []; SUBJ.on = false; return SUBJ; });
  }
  function chosen() { var st = S(); return (st.session && st.session.settings && st.session.settings.subjects) || []; }
  function nameOf(id) { var x = (SUBJ.list || []).filter(function (s) { return s.id === id; })[0]; return x ? x.name : ''; }
  function subjectsCard() {
    if (!SUBJ.on || !SUBJ.list || !SUBJ.list.length) return '';
    var mine = chosen();
    return '<section class="card pf-card sub-card" aria-labelledby="pf-sub-h"><h2 id="pf-sub-h">My subjects</h2>' +
      (mine.length ? '<p class="sub-tags">' + mine.map(function (id) { return '<span class="tag sub-tag">' + esc(nameOf(id)) + '</span>'; }).join('') + '</p>' +
        '<a class="btn quiet small" href="#/subjects" id="pf-subjects">Change</a>'
      : '<p class="sub-line">Pick your subjects to make practice fit.</p><a class="btn quiet small" href="#/subjects" id="pf-subjects">Pick subjects</a>') +
      '</section>';
  }
  // One quiet line on the "Your next set" screen, only while nothing is picked.
  function subjectsOffer() {
    if (!ON || !SUBJ.on || chosen().length || !S().session) return '';
    return '<p class="sub-offer"><a href="#/subjects" id="sub-offer">Pick your subjects to make practice fit</a></p>';
  }
  // Where "Done" goes: the screen the student came from (the next set, or the profile). app.js draws the new
  // screen before this listener runs, so lastHash still holds the old address while the subjects screen is drawn.
  var lastHash = location.hash;
  window.addEventListener('hashchange', function () { lastHash = location.hash; });
  function renderSubjects(main) {
    main.innerHTML = '<div class="pf-page"><p class="typing"><span class="spinner" aria-hidden="true"></span> Loading</p></div>';
    loadSubjects().then(function () {
      if (!SUBJ.on || !SUBJ.list.length) { A.go('profile'); return; }
      var mine = chosen().slice();
      var backTo = /^#\/(next|profile)/.test(lastHash) ? lastHash : '#/profile';
      main.innerHTML = '<div class="pf-page sub-page">' +
        '<header class="pf-head"><h1 id="sub-h" tabindex="-1">My subjects</h1><p class="rec-sub">Practice uses your subjects where it can.</p></header>' +
        '<div class="sub-chips" role="group" aria-labelledby="sub-h">' + SUBJ.list.map(function (x) {
          var on = mine.indexOf(x.id) >= 0;
          return '<button type="button" class="sub-chip" data-sub="' + esc(x.id) + '" aria-pressed="' + on + '">' +
            '<svg class="sub-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
            '<span>' + esc(x.name) + '</span></button>';
        }).join('') + '</div>' +
        '<p class="st-saved" id="sub-saved" role="status" aria-live="polite"></p>' +
        '<div class="sub-foot"><a class="btn" href="' + esc(backTo) + '" id="sub-done">Done</a></div>' +
        more('sub-more', 'More', '<p class="small">Optional. Change it any time. The first set is the same for everyone, so results can be compared. ' +
          'Practice sets keep their topics and levels, and pick tasks set in your subjects where there is a choice.</p>') +
        '</div>';
      main.querySelector('.sub-chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-sub]'); if (!b) return;
        var id = b.dataset.sub, i = mine.indexOf(id);
        if (i >= 0) mine.splice(i, 1);
        else if (mine.length >= SUBJ.max) { $('#sub-saved').textContent = 'Up to ' + SUBJ.max + '.'; return; }
        else mine.push(id);
        b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        saveSubjects(mine);
      });
    });
  }
  function saveSubjects(mine) {
    var st = S();
    var order = (SUBJ.list || []).map(function (x) { return x.id; });
    var list = order.filter(function (id) { return mine.indexOf(id) >= 0; });
    if (st.session && st.session.settings) st.session.settings.subjects = list;
    onSettled = function (ok, e) {
      var el = $('#sub-saved'); if (!el) return;
      el.textContent = ok ? 'Saved with your code.' : (e && e.offline ? 'Saving needs a connection.' : (e && e.message) || '');
    };
    sendSettings({ subjects: list });
  }

  /* ---------------------------------------------------------------- hooks for app.js */
  function render(view, main) {
    drawButton();
    syncPrefs();
    if (view === 'profile') renderProfile(main);
    else if (view === 'record') renderRecord(main);
    else if (view === 'subjects') renderSubjects(main);
    else renderSettings(main);
  }
  window.LitmusProfile = {
    on: on,
    handles: function (v) { return ON && !!VIEWS[v]; },
    opensWithout: function (v) { return ON && !!WITHOUT_SESSION[v]; },
    render: render,
    subjectsOffer: subjectsOffer,
    prefs: function () { return Object.assign({}, prefs); }
  };

  drawButton();
  if (!DEMO) {
    api('/api/profile/status').then(function (r) {
      var was = ON;
      ON = !!(r && r.on);
      drawButton();
      if (was && !ON && VIEWS[A.route().view]) A.go('start');
    }, function () { /* offline: keep the last known state */ });
  }
  if (!DEMO) loadSubjects();
  if (A.ready) A.ready.then(function () { syncPrefs(); drawButton(); });
})();
