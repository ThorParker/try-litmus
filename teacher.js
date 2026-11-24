/* Litmus teacher view: class grid, flags, weak spots with workshop activities, drill-down, CSV, safeguarding. */
(function () {
  'use strict';
  var API = String((window.LITMUS_CONFIG || {}).apiBase || '').replace(/\/$/, '');
  var params = new URLSearchParams(location.search);
  var T = { token: null, classCode: null, view: null, student: null, status: null };
  // The guided demo moves rows itself, so the grid does not refresh by itself during it.
  var DEMO_PAGE = params.get('demo') === '1';
  // Projector view (/teacher?present=1#code=...&class=EXPO): the code stays after "#", so it is never
  // sent to the server in the address, and the page can sign itself in again after a restart.
  var PRESENT = params.get('present') === '1';
  // Two students side by side, for the stand: /teacher?compare=1#code=...&class=DEMO-Y12
  var COMPARE = params.get('compare') === '1' && !PRESENT;
  var HASH = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  if (PRESENT) document.documentElement.classList.add('present');

  function $(s, el) { return (el || document).querySelector(s); }
  function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 5000); }

  // Tap feedback (19 Nov 2026, tools/TAP_RULE.txt): a wait shows on the control; a failure stays beside it.
  function tapBusy(btn, on) {
    if (!btn) return;
    if (on) {
      if (btn.dataset.tapIdle != null) return;
      btn.dataset.tapIdle = btn.innerHTML; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="spinner tap-spin" aria-hidden="true"></span>' + btn.innerHTML;
    } else if (btn.dataset.tapIdle != null) {
      btn.innerHTML = btn.dataset.tapIdle; delete btn.dataset.tapIdle; btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  }
  function tapNote(el, text) {
    toast(text);
    if (!el || !el.isConnected) return;
    var host = el.closest('form') || el;
    var p = host.nextElementSibling;
    if (!p || !p.classList.contains('tap-note')) { p = document.createElement('p'); p.className = 'tap-note'; p.setAttribute('role', 'alert'); host.insertAdjacentElement('afterend', p); }
    p.textContent = text;
    p.scrollIntoView({ block: 'nearest' });
  }

  function api(path, body) {
    var o = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
    if (T.token) o.headers['X-Teacher-Token'] = T.token;
    if (body) o.body = JSON.stringify(body);
    return fetch(API + path, o).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (r.status === 401 && T.token) {
          T.token = null; ss('litmus-teacher', null);
          if ((PRESENT || COMPARE) && HASH.get('code')) { setTimeout(signInFromHash, 1000); } else { drawLogin(); }
        }
        if (!r.ok) throw new Error((d && d.error) || 'Something went wrong.');
        return d;
      });
    }, function () { throw new Error('You are offline. The teacher view needs a connection.'); });
  }

  // "1 student", "2 students": counts of one read correctly in small classes.
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // Plain words for where a safeguarding flag came from (the stored values are internal names).
  var FOUND_BY = { 'pattern screen': 'automatic keyword check', 'moderation': 'automatic content check' };
  // cp_12 (F2): each flag has its own shape: a warning triangle (trusted wrong), a question mark (doubted right).
  var FLAG_OVER_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
  var FLAG_UNDER_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>';
  var FLAG_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 21V4M6 5h11l-2.2 3.5L17 12H6"/></svg>';
  var TICK_ICON = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var CLOCK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var THEMES = ['light', 'dark', 'contrast', 'cvd'];

  // reading settings: the teacher's own choice, or else the settings of the student app on this device
  function applySettings() {
    var s = {}; try { s = JSON.parse(localStorage.getItem('litmus-teacher-settings')) || {}; } catch (e) { s = {}; }
    var stu = {}; try { stu = JSON.parse(localStorage.getItem('litmus-settings')) || {}; } catch (e) { stu = {}; }
    // The newest choice on this device wins (19 Nov 2026): a colour mode or size chosen in the student app after the
    // teacher's own choice applies here too, so "Colour-blind safe" holds on every screen.
    var stuNewer = (stu.t || 0) > (s.t || 0);
    if ((stuNewer || !s.theme) && THEMES.indexOf(stu.theme) >= 0) s.theme = stu.theme;
    if ((stuNewer || !s.size) && stu.size) s.size = stu.size;
    if (THEMES.indexOf(s.theme) < 0) s.theme = 'light';
    // Text size (19 Nov 2026): the slider's percentage; an older name ("large") becomes its percentage (display.js).
    var TSZ = window.LitmusTextSize;
    s.size = TSZ ? TSZ.norm(s.size) : (s.size || 'normal');
    document.documentElement.dataset.size = s.size;
    if (TSZ) document.documentElement.dataset.sizeBand = TSZ.band(s.size);
    document.documentElement.dataset.theme = s.theme || 'light';
    $('#set-size').value = s.size;
    $('#set-theme').value = s.theme || 'light';
    if (window.LitmusDisplay) window.LitmusDisplay.sync();   // the Display panel shows the same choices
  }
  ['#set-size', '#set-theme'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var s = { size: $('#set-size').value, theme: $('#set-theme').value, t: Date.now() };
      try { localStorage.setItem('litmus-teacher-settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
      applySettings();
    });
  });

  function level(v) {
    if (!v || v.level == null) return '<span class="lvl none" title="Not measured"><span class="cells" aria-hidden="true"><i></i><i></i><i></i></span>n/a</span>';
    var c = '<span class="cells" aria-hidden="true">';
    for (var i = 1; i <= 3; i++) c += '<i class="' + (i <= v.level ? 'c' + i : '') + '"></i>';
    return '<span class="lvl" title="' + esc(v.level_name) + ', ' + v.score + ' out of 100">' + c + '</span>' + v.level + '</span>';
  }

  // The three level cells by themselves, for a place where the words sit right beside them.
  function cellsOnly(n) {
    var c = '<span class="cells" aria-hidden="true">';
    for (var i = 1; i <= 3; i++) c += '<i class="' + (i <= n ? 'c' + i : '') + '"></i>';
    return c + '</span>';
  }

  function drawLogin(err) {
    $('#logout').hidden = true;
    var demo = T.status && T.status.demo_teacher_code;
    var hint = demo ? '<p class="banner info small" style="display:block" id="demo-filled">The demo code is filled in. Press Open my class.</p>' : '';   // the line for developers is in env.example.txt (19 Nov 2026)
    $('#main').innerHTML = '<div class="card" style="max-width:520px;margin:40px auto"><h1>Teacher view</h1><p class="muted">Your class by topic, and the next lesson to teach.</p>' + hint +
      '<form id="login" novalidate><label class="field"><span>Teacher code</span><input type="text" id="code" autocomplete="off" spellcheck="false"' + (demo ? ' value="' + esc(demo) + '"' : '') + '></label>' +
      '<label class="field"><span>Label <span class="hint" title="For the access log">(optional)</span></span><input type="text" id="label" maxlength="24" autocomplete="off" spellcheck="false"></label>' +
      '<p class="error" role="alert">' + esc(err || '') + '</p><button class="btn" type="submit">Open my class</button></form></div>';
    $('#login').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!$('#code').value.trim()) { $('#login .error').textContent = 'Type the teacher code first.'; $('#code').focus(); return; }
      tapBusy($('#login button[type="submit"]'), true);   // the form is redrawn on success or failure
      api('/api/teacher/login', { code: $('#code').value, label: $('#label').value }).then(function (r) { T.token = r.token; T.label = r.label || ''; ss('litmus-teacher', r.token); loadClasses(); }, function (e2) { drawLogin(e2.message); });
    });
    $('#code').focus();
  }

  function openDemo() { return !!(T.token && String(T.token).indexOf('od-') === 0); }
  // cp_10: the open demo says what it is, and how to reach your own class.
  function openDemoHtml() {
    if (!openDemo()) return '';
    return '<div class="banner info od-banner" id="od-banner" style="display:flex"><span><b>Demo class: made-up students.</b></span>' +
      '<a href="teacher.html" id="od-signin">Sign in to your own class</a></div>';
  }
  function loadClasses() {
    $('#logout').hidden = false;
    if (PRESENT) {
      var pc = (HASH.get('class') || params.get('class') || ss('litmus-class') || 'EXPO').toUpperCase();
      loadPresent(pc);
      return Promise.resolve();
    }
    if (COMPARE) {
      return loadCompare((HASH.get('class') || params.get('class') || ss('litmus-class') || (T.status && T.status.demo_class) || 'DEMO-Y12').toUpperCase());
    }
    return api('/api/teacher/classes').then(function (r) {
      var classes = r.classes;
      // A class named in the address opens even before anyone has joined it (a stall class), then fills by itself.
      var asked = String(params.get('class') || '').toUpperCase();
      if (asked && /^[A-Z0-9-]{3,20}$/.test(asked) && (r.scope === 'all' || r.scope === asked) &&
          !classes.some(function (c) { return c.class_code === asked; })) classes = classes.concat([{ class_code: asked, students: 0 }]);
      var want = asked || params.get('class') || ss('litmus-class') || (classes[0] && classes[0].class_code);
      if (!classes.length) { drawEmpty(); return; }
      if (!classes.some(function (c) { return c.class_code === want; })) want = classes[0].class_code;
      T.classes = classes;
      return loadClass(want);
    });
  }

  function drawEmpty() {
    $('#main').innerHTML = '<div class="card"><h1>No classes yet</h1><p>When students start Litmus with a class code, their class appears here.</p><button class="btn secondary" id="seed" type="button">Load the demo class</button></div>';
    $('#seed').addEventListener('click', function () { var b = this; tapBusy(b, true); api('/api/teacher/demo/seed', {}).then(loadClasses, function (e) { tapBusy(b, false); tapNote(b, e.message); }); });
  }

  function loadClass(code) {
    T.classCode = code;
    ss('litmus-class', code);
    $('#main').innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading the class</p>';
    return Promise.all([
      api('/api/teacher/class?class_code=' + encodeURIComponent(code)),
      api('/api/teacher/safeguarding?class_code=' + encodeURIComponent(code)),
      api('/api/teacher/reviews?class_code=' + encodeURIComponent(code)),
      api('/api/teacher/me')
    ]).then(function (out) {
      // The access log is read after the class, so it already shows this opening.
      return api('/api/teacher/access-log?class_code=' + encodeURIComponent(code)).then(function (lg) { out.push(lg); return out; });
    }).then(function (out) {
      T.view = out[0]; T.sg = out[1]; T.reviews = out[2]; T.label = out[3].label || ''; T.log = out[4].entries || []; draw();
      // The old screen (sign-in form, class picker) is gone: put focus on the class heading, not on the page.
      var ae = document.activeElement;
      if (!ae || ae === document.body || !document.contains(ae)) { var h = $('#class-h'); if (h) h.focus({ preventScroll: true }); }
    }, function (e) {
      if (!T.token) return;   // signed out: the sign-in form is already showing
      $('#main').innerHTML = '<div class="card"><h1>Class ' + esc(code) + '</h1><p class="error" role="alert">' + esc(e.message) + '</p><button class="btn" type="button" id="retry">Try again</button></div>';
      $('#retry').addEventListener('click', function () { loadClass(code); });
    });
  }

  // The four capacities as headings over the topic columns (pedagogy.json capacity_headings, 19 Nov 2026). Labels
  // only: the same columns, grouped. ?capacities=1 or 0 on the address sets it on this device (the same stored
  // switch as the student app); otherwise the server's setting decides. Off: the grid is exactly as before.
  var CAP_PARAM = params.get('capacities');
  if (CAP_PARAM === '1' || CAP_PARAM === '0') { try { localStorage.setItem('litmus-capacities', JSON.stringify(CAP_PARAM)); } catch (e) { /* ignore */ } }
  function capacityCols(v) {
    var c = v.capacities, p = null;
    try { p = JSON.parse(localStorage.getItem('litmus-capacities')); } catch (e) { p = null; }
    var on = !!(c && c.groups && c.groups.length) && (p === '1' ? true : p === '0' ? false : !!c.on);
    if (!on) return null;
    var byId = {}, used = {}, cols = [], heads = [];
    v.areas.forEach(function (a) { byId[a.id] = a; });
    c.groups.forEach(function (g) {
      var as = g.areas.filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return byId[id]; });
      if (as.length) { heads.push({ label: g.label, span: as.length }); cols = cols.concat(as); }
    });
    var rest = v.areas.filter(function (a) { return !used[a.id]; });
    if (rest.length) { heads.push({ label: '', span: rest.length }); cols = cols.concat(rest); }
    return { cols: cols, heads: heads, source: c.source_line || '' };
  }
  function gridCols(v) { var cap = capacityCols(v); return cap ? cap.cols : v.areas; }

  function draw() {
    var v = T.view, s = v.summary;
    var cap = capacityCols(v);
    var picker = '<label class="settings" style="display:inline-flex"><span class="visually-hidden">Class</span><select id="class-pick" aria-label="Class">' +
      T.classes.map(function (c) { return '<option value="' + esc(c.class_code) + '"' + (c.class_code === v.class_code ? ' selected' : '') + '>' + esc(c.class_code) + (c.is_demo ? ' (demo)' : '') + ' · ' + plural(c.students, 'student', 'students') + '</option>'; }).join('') + '</select></label>';
    var isDemo = T.classes.some(function (c) { return c.class_code === v.class_code && c.is_demo; });
    var tiles = tilesHtml(s);
    var groupCells = cap ? cap.heads.map(function (h) {
      return h.label ? '<th scope="colgroup" colspan="' + h.span + '" class="group-h cap-h">' + esc(h.label) + '</th>' : '<td colspan="' + h.span + '"></td>';
    }).join('') : '<th scope="colgroup" colspan="' + v.areas.length + '" class="group-h">Topics</th>';
    var head = '<tr class="group-row"><td colspan="3"></td>' + groupCells + '<td colspan="' + (qcOn(v) ? 4 : 3) + '"></td></tr>' +
      '<tr><th scope="col">Student code</th><th scope="col">Sets</th><th scope="col">Litmus score</th>' +
      (cap ? cap.cols : v.areas).map(function (a) { return '<th scope="col" title="' + esc(a.name) + '">' + esc(a.name) + '</th>'; }).join('') +
      (qcOn(v) ? '<th scope="col">Quick check</th>' : '') +
      '<th scope="col">Flags</th><th scope="col" title="One question, answered with no AI.">On your own</th><th scope="col"><span class="visually-hidden">Open</span></th></tr>';
    var rows = rowsHtml(v, {});
    var nextId = ((v.weak_spots || []).filter(function (x) { return x.students; })[0] || {}).id;   // the top card's next step
    var weak = v.weak_spots.map(function (w, i) {
      return weakHtml(w, i, w.id === nextId);
    }).join('');
    var open = T.sg.flags.filter(function (f) { return !f.reviewed && !f.quiet; });
    var sg = sgHtml();

    $('#main').innerHTML = mainHtml(v, picker, isDemo, tiles, head, rows, weak, open, sg);
    afterDraw();
  }

  /* ---------------------------------------------------------------- what to do next (score2, 19 Nov 2026)
     One card at the top: how many have finished, the one topic most of the class is weakest in (the first weak
     spot: most students below Capable, then the lowest class average), and that topic's ready-made 20-minute
     workshop as one link. Nothing to mark and nothing to set up. */
  function nextCardHtml(v) {
    var s = v.summary, w = (v.weak_spots || []).filter(function (x) { return x.students; })[0];
    // cp_10 (text audit): short lines.
    var body = s.with_results ? '<p class="nc-line" id="nc-done"><b>' + s.with_results + ' of ' + s.students + '</b> finished.</p>'
      : '<p class="nc-line" id="nc-done">No finished sets yet.</p>';
    if (w) {
      // The class's check line (19 Nov 2026, one right answer): of the decisions on tasks where a check mattered, how
      // many had the check run before deciding (summary.verify: needed, checked). Verify is a step, not an answer.
      var vf = s.verify;
      body += '<p class="nc-line" id="nc-weak">Weakest: <b>' + esc(w.name) + '</b>' + (w.below_standard ? ' (' + w.below_standard + ' of ' + w.students + ' below Capable)' : '') + '.</p>' +
        (vf && vf.needed ? '<p class="nc-line" id="nc-verify">Checked before deciding: <b>' + vf.checked + '</b> of <b>' + vf.needed + '</b> times it mattered.</p>' : '') +
        // cp_9 (tester: the workshop and the "Priority" tag competed): one next step, named once.
        '<p class="nc-line" id="nc-next"><b>Next:</b> ' + esc(w.workshop.title) + ' (20 min).</p>' +
        '<a class="btn nc-go" id="nc-workshop" href="#weak-' + esc(w.id) + '" data-weak="' + esc(w.id) + '">Open the workshop</a>';
    } else {
      body += '<p class="nc-line muted" id="nc-weak">The topic to teach next shows here.</p>';
    }
    return '<section class="card panel next-card" id="next-card" aria-labelledby="next-h"><h2 id="next-h">Next for this class</h2>' + body + '</section>';
  }
  function wireNextCard() {
    var a = $('#nc-workshop');
    if (!a) return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var box = $('#weak-box'), h = document.getElementById('weak-' + a.dataset.weak + '-h');
      if (box) box.open = true;
      if (h) { h.scrollIntoView({ block: 'start' }); h.focus({ preventScroll: true }); }
    });
  }

  function wireToTop() {
    var a = $('#to-top');
    if (!a) return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo(0, 0);
      var h = $('#class-h'); if (h) h.focus({ preventScroll: true });
    });
    if (T.toTopWired) return;
    T.toTopWired = true;
    window.addEventListener('scroll', function () {
      var b = $('#to-top');
      if (b) b.hidden = window.scrollY < window.innerHeight * 1.5;
    }, { passive: true });
  }

  function tilesHtml(s) {
    return [
      // cp_12 (text audit): the top card and the safeguarding banner say "finished" and the flags to pass on.
      [s.students, s.students === 1 ? 'student' : 'students', 'students'], [s.meeting_standard_all, (s.meeting_standard_all === 1 ? 'meets' : 'meet') + ' the standard in all five topics', 'standard'],
      [s.over_reliance, 'flagged: trusted wrong answers', 'flagged']
    ].filter(function () { return s.students > 0; }).map(function (t) { return '<div class="tile" data-k="' + t[2] + '"><b>' + t[0] + '</b><span>' + esc(t[1]) + '</span></div>'; }).join('');
  }

  // One row per student. Rows in `fresh` (new since the last refresh) are marked for 2 seconds,
  // with the word "New" as well as a highlight, so the mark never relies on colour alone.
  function rowsHtml(v, fresh) {
    return v.students.map(function (r) {
      var flags = (r.flags || []).map(function (f) { return f === 'over_reliance' ? '<span class="flag over" title="Flag: trusted wrong answers">' + FLAG_OVER_ICON + 'Flag: trusted wrong</span>' : '<span class="flag under" title="Flag: doubted right answers">' + FLAG_UNDER_ICON + 'Flag: doubted right</span>'; }).join(' ') +
        (r.safeguarding ? ' <span class="flag safe">' + FLAG_ICON + 'Flag: safeguarding</span>' : '');
      var prog = r.first_overall != null && r.results_round > 1 ? ' <span class="small muted">from ' + r.first_overall + '</span>' : '';
      return '<tr data-row="' + esc(r.session_id) + '"' + (fresh[r.session_id] ? ' class="row-new"' : '') + '><th scope="row">' + esc(r.student_code) + (fresh[r.session_id] ? ' <span class="new-tag">New</span>' : '') + '</th><td class="num-cell">' + (r.has_results ? r.results_round : '<span class="muted">' + r.tasks_done + ' of ' + (r.tasks_total || 8) + ' tasks</span>') + '</td>' +
        '<td class="num-cell">' + (r.overall != null ? '<b>' + r.overall + '</b>' + prog : '<span class="muted">In progress</span>') + '</td>' +
        gridCols(v).map(function (a) { return '<td>' + level((r.areas || {})[a.id]) + '</td>'; }).join('') +
        (qcOn(v) ? qcCell(r.quick) : '') +
        '<td style="white-space:normal;min-width:150px">' + (flags || '<span class="muted small">None</span>') + '</td>' +
        '<td class="num-cell">' + (r.no_ai && r.no_ai.total ? r.no_ai.right + ' of ' + r.no_ai.total : '') + '</td>' +
        '<td><button class="btn quiet small" type="button" data-student="' + esc(r.session_id) + '" aria-label="Open the Decision Trail for ' + esc(r.student_code) + '">Open</button></td></tr>';
    }).join('');
  }

  // Quick check (19 Nov 2026): one column (the student's latest run) and one line for the class. Practice only:
  // it never changes a score or a level. With the mode off the server sends no quick_summary and the grid is as before.
  function qcOn(v) { return !!(v && v.quick_summary); }
  function qcCell(q) {
    if (!q) return '<td class="qc-cell"><span class="muted small">None yet</span></td>';
    return '<td class="qc-cell"><b>' + q.right + ' of ' + q.answered + '</b><span class="small muted">Trusted ' + q.trusted_wrong + ' wrong · Doubted ' + q.doubted_right + ' right</span></td>';
  }
  function qcLine(v) {
    var q = v.quick_summary;
    if (!q || !q.students) return '';
    var lean = q.lean === 'trusting' ? 'The class leans towards trusting.' : q.lean === 'doubting' ? 'The class leans towards doubting.' : 'The class leans neither way.';
    return '<p class="small muted qc-line" id="qc-line"><b>Quick check</b>, ' + plural(q.students, 'student', 'students') + ': ' + q.right + ' of ' + q.answered + ' right · trusted ' + q.trusted_wrong + ' wrong · doubted ' + q.doubted_right + ' right. ' + lean + '</p>';
  }

  function weakHtml(w, i, isNext) {
      return '<article class="card flat" id="weak-' + esc(w.id) + '"><div class="row between"><h3 style="margin:0" id="weak-' + esc(w.id) + '-h" tabindex="-1">' + esc(w.name) + '</h3>' + (isNext ? '<span class="tag">Next step</span>' : '') + '</div>' +
        '<p class="small muted" style="margin:6px 0 10px">' + w.below_standard + ' of ' + w.students + ' below. Average ' + (w.mean != null ? w.mean : 'n/a') + '.</p>' +
        '<p style="margin-bottom:4px"><b>' + esc(w.workshop.title) + ' (20 min)</b></p><ol class="small">' + w.workshop.steps.map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('') + '</ol></article>';
  }

  // "Over time": point straight at a student who has done a second set.
  function progressCallout(v) {
    var two = v.summary.two_sets || [];
    if (!two.length) return '';
    return '<p class="banner info progress-callout" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><b>Progress over time:</b> ' +
      plural(two.length, 'student has', 'students have') + ' done a second set. ' +
      '<button class="btn small secondary" type="button" id="see-progress" data-sid="' + esc(two[0].session_id) + '">See change: ' + esc(two[0].student_code) + '</button></p>';
  }

  function sgBanner() {
    var open = T.sg.flags.filter(function (f) { return !f.reviewed && !f.quiet; });
    // score2b: one line at the top while any item is open; it jumps to the first open item. Gone when none is open.
    return open.length ? '<p class="banner offline sg-top" style="display:flex"><a href="#sg-' + open[0].id + '" id="sg-top-link"><b>' + open.length + ' safeguarding ' + (open.length === 1 ? 'item' : 'items') + ' open</b></a></p>' : '';
  }

  // Each flag: who acknowledged it, when, and the one action they recorded. Flags not yet
  // acknowledged are counted and listed first.
  // 19 Nov 2026: calm. One line per item (the level in a word and the area, who, when), the excerpt, one
  // action. "Worth a look" items (the lowest level: the student was not interrupted) sit apart, folded, and
  // are not counted as flags.
  function sgHtml() {
    var all = T.sg.flags.slice().sort(function (a, b) { return (a.reviewed ? 1 : 0) - (b.reviewed ? 1 : 0) || b.ts - a.ts; });
    var flags = all.filter(function (f) { return !f.quiet; });
    var quiet = all.filter(function (f) { return f.quiet; });
    var openN = flags.filter(function (f) { return !f.reviewed; }).length;
    var actions = T.sg.actions || [];
    return '<p class="banner offline" style="display:block"><b>What to do:</b> ' + esc(T.sg.instruction) + '</p>' +
      (flags.length ? '<p class="sg-count"><b>' + plural(openN, 'flag', 'flags') + '</b> not yet acknowledged, of ' + flags.length + '.</p>' : '') +
      (flags.length ? flags.map(function (f) {
        var state = f.reviewed ? '<span class="sg-state done">' + TICK_ICON + 'Acknowledged</span>' : '<span class="sg-state">' + FLAG_ICON + 'Not yet acknowledged</span>';
        var owner = f.reviewed ? '<p class="sg-owner">' + (f.acknowledged_by ? 'Acknowledged by <b>' + esc(f.acknowledged_by) + '</b>, ' + esc(fmtTime(f.acknowledged_ts)) + '. Action: ' + esc(f.action_label || 'not recorded') + '.' + (f.note ? ' Note: "' + esc(f.note) + '"' : '')
          : 'Marked as passed on before acknowledgements were recorded.') + '</p>' : '';
        var form = f.reviewed ? '' : '<div class="sg-close" data-flag="' + f.id + '" role="group" aria-label="Close this item">' +
          '<button class="btn small" type="button" data-sg-close="dsl">Passed to our safeguarding lead</button>' +
          '<p class="error" role="alert"></p></div>';
        return '<div class="sg-item' + (f.reviewed ? ' reviewed' : '') + '" id="sg-' + f.id + '"><div class="row between"><span class="sg-title">' + state + '<b>' + esc(f.label) + '</b></span><span class="small muted">' + esc(f.student_code) + (f.task_id ? ' · ' + esc(f.task_title || ('task ' + f.task_id)) : '') + ' · ' + esc(fmtTime(f.ts)) + '</span></div>' +
          '<p style="margin:6px 0">"' + esc(f.excerpt) + '"</p>' + owner + form + '</div>';
      }).join('') : '<p class="muted">No flagged messages.</p>') +
      (quiet.length ? '<details class="sg-quiet" style="margin-top:12px"><summary>Worth a look (' + quiet.length + '). Not held back, not counted as flags.</summary>' +
        quiet.map(function (f) {
          // Only a "worth a look" item can be closed as seen (coordinator, 07:58); held items go to the lead.
          return '<p class="small" id="sg-' + f.id + '"><b>' + esc(f.student_code) + '</b> · ' + esc(fmtTime(f.ts)) + (f.reviewed ? ' · ' + TICK_ICON + 'Read' : '') + ': "' + esc(f.excerpt) + '"</p>' +
            (f.reviewed ? '' : '<div class="sg-close" data-flag="' + f.id + '" role="group" aria-label="Close this item"><button class="btn small secondary" type="button" data-sg-close="seen">Seen, no action needed</button><p class="error" role="alert"></p></div>');
        }).join('') + '<p class="small muted">Found by an automatic word check. Read them and use your judgement.</p></details>' : '') +
      (flags.length ? '<p class="small muted">Found by an automatic word check. Held-back messages were not sent to the AI.</p>' : '');
  }

  /* ---------------------------------------------------------------- who is signed in
     A short label the teacher types once per sign-in, such as "Teacher A". Reviews, flag
     acknowledgements, and the access log record it. */
  function labelHtml(form) {
    if (T.label) return '<p class="label-line small">Signed in as <b>' + esc(T.label) + '</b> <button class="why-btn" type="button" id="label-change">Change</button></p>';
    // Design review 15 Nov, proposal 7: one line in the page head until the teacher chooses to add a label.
    if (!form) return '<p class="label-line small">Signed in. <button class="why-btn" type="button" id="label-add">Add your label</button></p>';
    return '<form class="label-form row" id="label-form" novalidate><label class="field"><span class="small">Label, such as Teacher A. Not your name.</span><input type="text" id="label-input" maxlength="24" autocomplete="off" spellcheck="false"></label>' +
      '<button class="btn small secondary" type="submit">Save label</button><p class="error small" role="alert"></p></form>';
  }
  function wireLabel() {
    var slot = $('#label-slot');
    if (!slot) return;
    var ch = $('#label-change');
    if (ch) ch.addEventListener('click', function () { T.label = ''; slot.innerHTML = labelHtml(true); wireLabel(); $('#label-input').focus(); });
    var ad = $('#label-add');
    if (ad) ad.addEventListener('click', function () { slot.innerHTML = labelHtml(true); wireLabel(); $('#label-input').focus(); });
    var f = $('#label-form');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      var sb = f.querySelector('button[type="submit"]'); tapBusy(sb, true);
      api('/api/teacher/label', { label: $('#label-input').value }).then(function (r) {
        T.label = r.label; slot.innerHTML = labelHtml(); wireLabel(); toast('Signed in as ' + r.label + '.');
      }, function (e2) { tapBusy(sb, false); f.querySelector('.error').textContent = e2.message; $('#label-input').focus(); });
    });
  }
  // The label field inside a review or acknowledgement form, shown only while no label is set.
  function labelField(id) {
    return T.label ? '' : '<label class="field"><span>Label, such as Teacher A. Not your name.</span><input type="text" id="' + id + '" maxlength="24" autocomplete="off" spellcheck="false"></label>';
  }
  function fmtTime(ts) { return new Date(ts * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }

  /* ---------------------------------------------------------------- score reviews
     A student can ask for a review of one task. The teacher opens that task's Decision Trail, then
     keeps the result or changes the decision credit or the area level, with a reason. The first
     result is kept: each review is its own record. */
  function reviewsHtml() {
    var R = T.reviews || { requests: [], open: 0 };
    var list = R.requests.map(function (q) {
      var now = (q.task_score != null ? 'Task score ' + q.task_score : 'No task score') +
        (q.area_name ? ' · ' + q.area_name + ': ' + (q.area_level ? 'Level ' + q.area_level + ', ' + q.area_level_name : 'not measured') : '');
      return '<li class="rv-item' + (q.status === 'open' ? ' open' : '') + '">' +
        '<div class="rv-head"><span class="rv-state">' + (q.status === 'open' ? CLOCK_ICON + 'To review' : TICK_ICON + 'Reviewed') + '</span>' +
          '<b>' + esc(q.student_code) + '</b><span>Task ' + esc(q.task_number || '') + ': ' + esc(q.task_title || q.task_id) + '</span>' +
          '<span class="small muted">' + esc(setName(q.round)) + ' · asked ' + esc(fmtTime(q.ts)) + '</span></div>' +
        '<p class="rv-asked">' + (q.asked ? 'What was asked: "' + esc(q.asked) + '"' : '<span class="muted">No reason given.</span>') + '</p>' +
        '<p class="small" style="margin:0 0 8px">Now: ' + esc(now) + '</p>' +
        '<button class="btn small ' + (q.status === 'open' ? '' : 'quiet') + '" type="button" data-open-review="' + esc(q.session_id) + '" data-round="' + q.round + '" data-task="' + esc(q.task_id) + '">' +
          (q.status === 'open' ? 'Open the Decision Trail and review' : 'Open the Decision Trail') + '</button></li>';
    }).join('');
    return '<h2 id="rv-h">Reviews</h2>' +
      '<p class="small muted">Students can ask you to review a task. The first result is always kept.</p>' +
      (R.requests.length ? '<p class="rv-count"><b>' + plural(R.open, 'review', 'reviews') + '</b> to do.</p><ul class="rv-list">' + list + '</ul>' : '<p class="muted">No reviews asked for yet.</p>') +
      flaggedHtml(R.flagged_feedback || []);
  }
  // "Flag this feedback" (18 Nov 2026, the team's Responsible AI plan): practice feedback a student disagreed with.
  function flaggedHtml(ff) {
    var list = ff.map(function (f) {
      return '<li class="ff-item"><div class="ff-head">' + FLAG_ICON + '<b>' + esc(f.student_code) + '</b><span>' + (f.kind === 'coach' ? 'Coach reply' : 'Feedback line') + '</span>' +
        '<span class="small muted">' + esc(setName(f.round)) + ' · flagged ' + esc(fmtTime(f.ts)) + '</span></div>' +
        '<p class="ff-text">' + esc(f.text) + '</p></li>';
    }).join('');
    return '<h3 id="ff-h" style="margin-top:20px">Flagged feedback</h3>' +
      (ff.length ? '<p class="small muted">' + plural(ff.length, 'item', 'items') + ' of practice feedback a student disagreed with.</p><ul class="ff-list" aria-labelledby="ff-h">' + list + '</ul>'
        : '<p class="muted">No feedback flagged yet.</p>');
  }
  function wireReviews() {
    var sec = $('#reviews');
    if (!sec) return;
    sec.addEventListener('click', function (e) {
      var b = e.target.closest('[data-open-review]');
      if (b) openStudent(b.dataset.openReview, false, b, { round: +b.dataset.round, task: b.dataset.task });
    });
  }
  function reloadReviews() {
    return api('/api/teacher/reviews?class_code=' + encodeURIComponent(T.classCode)).then(function (r) {
      var same = JSON.stringify(r) === JSON.stringify(T.reviews);
      T.reviews = r;
      var sec = $('#reviews');
      if (!same && sec && !sec.contains(document.activeElement)) sec.innerHTML = reviewsHtml();
    }, function () {});
  }

  // The review form inside one task of the Decision Trail.
  function reviewForm(st, r, t, focus) {
    var res = r.results;
    if (!res || !t.decided) return '';
    var tr = (res.tasks || []).filter(function (x) { return x.task_id === t.task_id; })[0] || {};
    var areaIds = [tr.area || t.area, tr.secondary_area].filter(Boolean);
    var areas = (res.areas || []).filter(function (a) { return areaIds.indexOf(a.id) >= 0 && a.score != null; });
    var R = T.reviews || { credit_choices: [], levels: [] };
    var req = (R.requests || []).filter(function (q) { return q.session_id === st.session_id && q.round === r.round && q.task_id === t.task_id && q.status === 'open'; })[0];
    var past = (r.reviews || []).filter(function (rv) { return rv.task_id === t.task_id; });
    var id = 'rv-' + r.round + '-' + t.task_id;
    var credit = (R.credit_choices || []).map(function (c) { return '<option value="' + c.value + '"' + (Math.abs(c.value - (tr.credit || 0)) < 0.001 ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('');
    var cur = areas.length ? areas[0].level : null;
    var lv = (R.levels || []).map(function (l) { return '<option value="' + l.level + '"' + (l.level === cur ? ' selected' : '') + '>Level ' + l.level + ': ' + esc(l.name) + '</option>'; }).join('');
    var areaPick = areas.length > 1 ? '<select id="' + id + '-area" aria-label="Topic">' + areas.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select>'
      : (areas.length ? '<input type="hidden" id="' + id + '-area" value="' + esc(areas[0].id) + '"><b>' + esc(areas[0].name) + '</b>' : '');
    var now = 'Now: ' + (tr.score != null ? tr.score : 'n/a') + ' points, ' + Math.round((tr.credit || 0) * 100) + '% credit.' +
      (areas.length ? '\n' + areas.map(function (a) { return a.name + ': Level ' + a.level; }).join(', ') + '.' : '');
    var history = past.map(function (rv) {
      return '<li>' + TICK_ICON + '<span><b>' + esc(rv.reviewer) + '</b>, ' + esc(fmtTime(rv.ts)) + ': ' + esc(rv.text) + ' Reason: "' + esc(rv.reason) + '"</span></li>';
    }).join('');
    return '<div class="review-panel' + (focus ? ' focus' : '') + '" id="' + id + '">' +
      '<h4>' + (req ? 'Review asked for' : 'Review this task') + '</h4>' +
      (req ? '<p class="rv-asked">' + (req.asked ? 'What was asked: "' + esc(req.asked) + '"' : 'No reason given.') + '</p>' : '') +
      (history ? '<ul class="rv-history">' + history + '</ul>' : '') +
      '<p class="small" style="white-space:pre-line">' + esc(now) + '</p>' +
      '<form class="rv-form" data-sid="' + esc(st.session_id) + '" data-round="' + r.round + '" data-task="' + esc(t.task_id) + '" data-id="' + id + '" novalidate>' +
        '<fieldset><legend>Your decision</legend>' +
          '<label class="option"><input type="radio" name="' + id + '-kind" value="keep" checked><span>Keep the result</span></label>' +
          '<label class="option"><input type="radio" name="' + id + '-kind" value="decision_credit"><span>Change the decision credit to <select id="' + id + '-credit" aria-label="New decision credit">' + credit + '</select></span></label>' +
          (areas.length ? '<label class="option"><input type="radio" name="' + id + '-kind" value="area_level"><span>Change the level of ' + areaPick + ' to <select id="' + id + '-level" aria-label="New level">' + lv + '</select></span></label>' : '') +
        '</fieldset>' +
        '<label class="field"><span>Reason <span class="hint">(needed, kept with the record)</span></span><textarea id="' + id + '-reason" rows="2" maxlength="300"></textarea></label>' +
        labelField(id + '-by') +
        '<p class="error" role="alert"></p>' +
        '<button class="btn small" type="submit">Save the review</button>' +
      '</form></div>';
  }
  function wireReviewForms(d, sid, focus) {
    $all('.rv-form', d).forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = f.dataset.id;
        var kind = (f.querySelector('input[name="' + id + '-kind"]:checked') || {}).value;
        var body = { class_code: T.classCode, sid: f.dataset.sid, round: +f.dataset.round, task_id: f.dataset.task, kind: kind, reason: $('#' + id + '-reason').value };
        if (kind === 'decision_credit') body.value = +$('#' + id + '-credit').value;
        if (kind === 'area_level') { body.value = +$('#' + id + '-level').value; body.area_id = $('#' + id + '-area').value; }
        var by = $('#' + id + '-by'); if (by) body.by = by.value;
        var err = f.querySelector('.error');
        err.textContent = '';
        if (!body.reason.trim()) { err.textContent = 'Give a reason for the review. It is kept with the record.'; $('#' + id + '-reason').focus(); return; }
        var btn = f.querySelector('button[type="submit"]');
        btn.disabled = true;
        api('/api/teacher/review', body).then(function (r) {
          if (by) T.label = by.value.trim();
          toast('Review saved for ' + r.student_code + ', task ' + r.task_number + '. ' + r.text);
          return api('/api/teacher/me').then(function (me) { T.label = me.label || T.label; var ls = $('#label-slot'); if (ls) { ls.innerHTML = labelHtml(); wireLabel(); } });
        }).then(function () {
          return reloadReviews();
        }).then(function () {
          openStudent(sid, true, null, { round: body.round, task: body.task_id, saved: true });
        }, function (e2) { btn.disabled = false; err.textContent = e2.message; });
      });
    });
  }

  /* ---------------------------------------------------------------- two students side by side
     One task, two Decision Trails: what each asked the AI, whether they checked, their decision,
     reason, and how sure they were, and the feedback that followed. Every difference is named in
     words with a shape (an unequal sign or an equals sign), never by colour alone. */
  var DIFF_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 9h14M5 15h14M16 4L8 20"/></svg>';
  var SAME_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 9h14M5 15h14"/></svg>';
  var CHOICE_ICON = {
    trust: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    question: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',   // 20 Nov 2026: a cross, as on the answer sheet
    verify: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>'
  };
  function mark(same) { return same ? '<span class="cmp-mark same">' + SAME_ICON + 'Same</span>' : '<span class="cmp-mark diff">' + DIFF_ICON + 'Different</span>'; }
  function cmpSide(s, rows, side) {
    var same = {}; rows.forEach(function (r) { same[r.key] = r.same; });
    var icon = s.choice ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + CHOICE_ICON[s.choice] + '</svg>' : '';
    function item(key, label, body) {
      return '<div class="cmp-row' + (same[key] === false ? ' differs' : '') + '"><dt>' + esc(label) + (same[key] === false ? ' ' + mark(false) : '') + '</dt><dd>' + body + '</dd></div>';
    }
    var asked = s.asked.length ? '<ol class="cmp-asked">' + s.asked.map(function (m) { return '<li>"' + esc(m) + '"</li>'; }).join('') + '</ol>' : '<span class="muted">Nothing</span>';
    var checked = s.checked ? TICK_ICON + ' Yes: ' + esc(s.check || 'the check') + (s.finding ? '. Found: ' + esc(s.finding) + '.' : '.') : '<span class="cmp-no">No check</span>';
    // The parts' points add up to the task score shown: the results screen's own function (score_parts.js).
    var tp = {}; ((window.LitmusScore && s.components && s.score != null) ? (LitmusScore.taskParts({ done: true, components: s.components, score: s.score }) || []) : []).forEach(function (p) { tp[p.id] = p; });
    var fb = s.feedback.map(function (f) {
      var pts = tp[f.id] ? tp[f.id].earned + ' of ' + tp[f.id].of : f.score + '%';
      return '<li><b>' + esc(f.part) + ': ' + pts + '</b><ul>' + f.lines.filter(function (l) { return !/^Rubric:/.test(l); }).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></li>';
    }).join('');
    return '<article class="cmp-side" aria-labelledby="cmp-' + side + '-h">' +
      '<header class="cmp-head"><h3 id="cmp-' + side + '-h">' + esc(s.student_code) + '</h3>' +
        '<span class="cmp-choice">' + icon + esc(s.decision || 'Not decided') + '</span>' +
        '<span class="cmp-score' + (same.score === false ? ' differs' : '') + '"><b>' + (s.score != null ? s.score : 'n/a') + '</b> out of 100</span></header>' +
      '<dl class="cmp-dl">' +
        item('asked', 'Asked the AI', asked) +
        item('checked', 'Checked it', checked) +
        item('decision', 'Decision', esc(s.decision || '')) +
        item('reason', 'Reason', '"' + esc(s.reason) + '"' + (s.tags && s.tags.length ? '<div class="small">Tapped: ' + esc(s.tags.join('; ')) + '</div>' : '') + '<div class="small">' + (s.reason_met ? 'Names the issue.' : 'Does not name the issue.') + '</div>') +
        item('confidence', 'How sure', esc(s.confidence || '')) +
      '</dl>' +
      '<details class="cmp-fb"' + (COMPARE ? ' open' : '') + '><summary>The feedback ' + esc(s.student_code) + ' got</summary><ul>' + fb + '</ul></details>' +
    '</article>';
  }
  function compareHtml(c, big) {
    var a = c.students[0], b = c.students[1];
    var head = c.same_decision ? 'Same choice, different thinking' : 'Two routes through one task';
    var lede = c.same_decision
      ? 'Both chose "' + a.decision + '". The click alone scores them the same. Litmus found ' + plural(c.differences, 'difference', 'differences') + '.'
      : a.student_code + ' chose "' + a.decision + '" and ' + b.student_code + ' chose "' + b.decision + '": ' + plural(c.differences, 'difference', 'differences') + '.';
    var table = '<div class="table-wrap"><table class="grid cmp-table"><caption class="visually-hidden">What is the same and what is different</caption><thead><tr><th scope="col">Same or different</th><th scope="col">What</th><th scope="col">' + esc(a.student_code) + '</th><th scope="col">' + esc(b.student_code) + '</th></tr></thead><tbody>' +
      c.rows.map(function (r) { return '<tr class="' + (r.same ? 'same' : 'differs') + '"><td>' + mark(r.same) + '</td><th scope="row">' + esc(r.label) + '</th><td>' + esc(r.a == null ? '' : r.a) + '</td><td>' + esc(r.b == null ? '' : r.b) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var H = big ? 'h1' : 'h3';
    return '<p class="eyebrow">Task ' + esc(c.task.number || c.task.id) + ': ' + esc(c.task.title) + ' · ' + esc(c.task.area_name) + '</p>' +
      '<' + H + ' id="cmp-h" class="cmp-title" tabindex="-1">' + esc(head) + '</' + H + '>' +
      '<p class="cmp-lede">' + esc(lede) + '</p>' +
      '<div class="cmp-grid">' + cmpSide(a, c.rows, 'a') + cmpSide(b, c.rows, 'b') + '</div>' +
      '<h4 class="cmp-sub">Side by side</h4>' + table +
      '<p class="small" style="margin-top:10px"><b>What was going on:</b> ' + esc(c.task.what_was_going_on) + (c.task.ai_correct ? ' The AI was right on this task.' : '') + '</p>';
  }
  function comparePicker(c, ids) {
    var o = c.options;
    function sel(id, label, list, cur) { return '<label class="field"><span>' + label + '</span><select id="' + id + '">' + list + '</select></label>'; }
    var tasks = o.tasks.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === c.task.id ? ' selected' : '') + '>Task ' + t.number + ': ' + esc(t.title) + '</option>'; }).join('');
    function studs(cur) { return o.students.map(function (s) { return '<option value="' + esc(s.session_id) + '"' + (s.session_id === cur ? ' selected' : '') + '>' + esc(s.student_code) + '</option>'; }).join(''); }
    return '<form class="cmp-pick" id="' + ids + '-form" novalidate>' + sel(ids + '-task', 'Task', tasks) + sel(ids + '-a', 'First student', studs(c.students[0].session_id)) + sel(ids + '-b', 'Second student', studs(c.students[1].session_id)) +
      '<button class="btn small" type="submit">Compare</button><p class="error" role="alert"></p></form>';
  }
  function loadCompareInto(box, q, big, ids) {
    return api('/api/teacher/compare?class_code=' + encodeURIComponent(T.classCode) + (q || '')).then(function (c) {
      box.innerHTML = comparePicker(c, ids) + '<div class="cmp-body">' + compareHtml(c, big) + '</div>';
      $('#' + ids + '-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var qq = '&task=' + encodeURIComponent($('#' + ids + '-task').value) + '&a=' + encodeURIComponent($('#' + ids + '-a').value) + '&b=' + encodeURIComponent($('#' + ids + '-b').value);
        var sb = this.querySelector('button[type="submit"]'); tapBusy(sb, true);
        loadCompareInto(box, qq, big, ids).then(function () { tapBusy(sb, false); var h = $('#cmp-h'); if (h) h.focus(); });
      });
      return c;
    }, function (e) {
      var f = $('#' + ids + '-form .error');
      if (f) { f.textContent = e.message; return; }
      box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
    });
  }
  // The direct address for the stand: /teacher?compare=1#code=...&class=DEMO-Y12 (optional &task=F1&a=CODE&b=CODE).
  function loadCompare(cls) {
    T.classCode = cls;
    ss('litmus-class', cls);
    $('#logout').hidden = false;
    document.documentElement.classList.add('compare-page');
    $('#main').innerHTML = '<section class="compare-view" id="compare-view" aria-labelledby="cmp-h"><p class="small"><a href="teacher.html?class=' + encodeURIComponent(cls) + '">Back to class ' + esc(cls) + '</a></p><div id="cmp-box"><p class="typing"><span class="spinner" aria-hidden="true"></span> Loading</p></div></section>';
    var q = ['task', 'a', 'b'].map(function (k) { var v = params.get(k) || HASH.get(k); return v ? '&' + k + '=' + encodeURIComponent(v) : ''; }).join('');
    return loadCompareInto($('#cmp-box'), q, true, 'cmpv');
  }
  function compareSectionHtml() {
    return '<h2 id="cmp-sec-h">Compare two students</h2><p class="small muted">Same choice, different thinking: what the click alone would miss.</p>' +
      '<p><button class="btn small secondary" type="button" id="cmp-open">Compare two students</button> <a class="small" href="teacher.html?compare=1&class=' + encodeURIComponent(T.view.class_code) + '">Open it full screen</a></p><div id="cmp-inline"></div>';
  }

  /* ---------------------------------------------------------------- access log
     Who signed in, opened, exported, reviewed, acknowledged, or deleted, and when: the last 50
     lines for this class (and sign-ins). Litmus's own words only, never message text. */
  function logHtml() {
    var rows = (T.log || []).map(function (e) {
      return '<tr><td class="nowrap">' + esc(fmtTime(e.ts)) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(e.action) + '</td><td>' + esc(e.detail || '') + '</td><td class="nowrap">' + esc(e.class_code || 'All classes') + '</td></tr>';
    }).join('');
    return '<h2 id="log-h">Access log</h2><p class="small muted">The last 50 actions, newest first. No message text.</p>' +
      '<details class="log-box"' + (params.get('log') === '1' ? ' open' : '') + '><summary>Show the access log (' + plural((T.log || []).length, 'entry', 'entries') + ')</summary>' +
      (rows ? '<div class="table-wrap"><table class="grid log-table"><caption class="visually-hidden">Access log, newest first</caption><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Detail</th><th scope="col">Class</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">Nothing logged yet.</p>') + '</details>';
  }

  function mainHtml(v, picker, isDemo, tiles, head, rows, weak, open, sg) {
    return openDemoHtml() +
      '<div class="row between" style="margin-bottom:16px"><div><h1 id="class-h" tabindex="-1" style="margin-bottom:4px">Class ' + esc(v.class_code) + '</h1><p class="muted" style="margin:0">Student codes only. Levels are private.</p><div id="label-slot">' + labelHtml() + '</div></div>' +
      '<div class="row">' + picker + '<a class="btn secondary small" id="csv" href="' + API + '/api/teacher/export.csv?class_code=' + encodeURIComponent(v.class_code) + '&token=' + encodeURIComponent(T.token) + '" download>Export CSV</a></div></div>' +
      '<div id="sg-banner">' + sgBanner() + '</div>' +
      nextCardHtml(v) +
      '<div class="tiles" id="tiles">' + tiles + '</div>' +
      progressCallout(v) +
      '<section aria-labelledby="grid-h"><div class="row between"><h2 id="grid-h">Class grid</h2><p class="small muted" style="margin:0">Level 1 Aware · 2 Capable (the standard) · 3 Independent</p></div>' +
      (DEMO_PAGE ? '' : '<p class="small muted updated" id="updated">Updates by itself.</p>') +
      '<div class="table-wrap"><table class="grid"><caption class="visually-hidden">Each student by the five topics</caption><thead>' + head + '</thead><tbody id="grid-body">' + rows + '</tbody></table></div>' +
      (qcOn(v) ? '<div id="qc-line-slot">' + qcLine(v) + '</div>' : '') +
      ((capacityCols(v) || {}).source ? '<p class="small muted cap-source">' + esc(capacityCols(v).source) + '</p>' : '') +
      '<p class="small muted" style="margin-top:8px">Flags are prompts to talk, not a diagnosis.</p>' +
      '<details class="tmore"><summary>About flags and levels</summary><ul class="small muted"><li><b>Trusted wrong:</b> trusted 2+ flawed answers, no check.</li><li><b>Doubted right:</b> rejected or changed a right answer.</li><li>Flags are prompts to talk, not a diagnosis.</li></ul>' +
        '<details class="tmore"><summary>More</summary><p class="small muted">Ask the student what they checked and why. Flags are not a basis for grouping.</p><p class="small muted">Levels: lines at 45 and 75.</p></details></details></section>' +
      '<div id="drawer" class="drawer"></div>' +
      '<section id="reviews" aria-labelledby="rv-h" style="margin-top:28px">' + reviewsHtml() + '</section>' +
      '<section id="compare" aria-labelledby="cmp-sec-h" style="margin-top:28px">' + compareSectionHtml() + '</section>' +
      '<section aria-labelledby="weak-h" style="margin-top:28px"><details class="tmore weak-box" id="weak-box"><summary><h2 id="weak-h">Weak spots, with a workshop each</h2></summary><div class="weak-grid">' + weak + '</div></details></section>' +
      '<section id="safeguarding" aria-labelledby="sg-h" style="margin-top:28px"><h2 id="sg-h">Safeguarding</h2>' + sg + '</section>' +
      '<section id="access-log" aria-labelledby="log-h" style="margin-top:28px">' + logHtml() + '</section>' +
      '<details class="tmore ai-settings" id="ai-settings" hidden style="margin-top:28px"><summary>AI settings</summary><div id="ai-switch-slot"></div></details>' +
      (isDemo ? '' : '<section style="margin-top:28px" class="card flat"><h2>Delete this class</h2><p class="small muted">Deletes every student in class ' + esc(v.class_code) + ', with their chats, results, and flags. This cannot be undone.</p><button class="btn quiet small" type="button" id="wipe-class">Delete class ' + esc(v.class_code) + '</button></section>') +
      '<a class="to-top" id="to-top" href="#class-h" hidden>' + 'Back to top' + '</a>' +
      '<section style="margin-top:28px" class="card flat"><h2>Demo data</h2><p class="small muted">Demo students. Clear them before real use.</p><div class="row">' +
        (isDemo || T.classes.some(function (c) { return c.is_demo; }) ? '<button class="btn quiet small" type="button" id="clear-demo">Clear demo data</button>' : '<button class="btn quiet small" type="button" id="seed-demo">Load the demo class</button>') + '</div></section>';
  }

  function afterDraw() {
    var v = T.view;
    drawAISwitch();
    wireLabel();
    wireNextCard();
    wireToTop();
    wireReviews();
    var co = $('#cmp-open');
    if (co) co.addEventListener('click', function () {
      tapBusy(co, true);   // tap feedback: the button stays, busy, until the comparison is in place
      loadCompareInto($('#cmp-inline'), '', false, 'cmpi').then(function () { tapBusy(co, false); co.hidden = true; var h = $('#cmp-h'); if (h) h.focus(); });
    });
    $('#class-pick').addEventListener('change', function (e) { loadClass(e.target.value); });
    // One listener on the grid body, so rows replaced by a refresh keep working.
    $('#grid-body').addEventListener('click', function (e) { var b = e.target.closest('[data-student]'); if (b) openStudent(b.dataset.student, false, b); });
    startRefresh();
    var pc = $('#see-progress');
    if (pc) pc.addEventListener('click', function () { openStudent(pc.dataset.sid, false, pc); });
    if (pc && params.get('progress') === '1' && !T.progressShown) { T.progressShown = true; openStudent(pc.dataset.sid, true); }
    // score2b: one tap closes an item. The server records who (the sign-in's label, or "Teacher (no label)") and when.
    $('#safeguarding').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-sg-close]');
      if (!b) return;
      var box = b.closest('.sg-close'), id = box.dataset.flag, err = box.querySelector('.error');
      $all('button', box).forEach(function (x) { x.disabled = true; });
      api('/api/teacher/safeguarding/review', { id: +id, action: b.dataset.sgClose }).then(function () {
        toast(b.dataset.sgClose === 'seen' ? 'Closed: seen, no action needed.' : 'Passed to our safeguarding lead.');
        return loadClass(T.classCode);
      }).then(function () { var el = $('#sg-' + id) || $('#sg-h'); if (el) { el.setAttribute('tabindex', '-1'); el.focus(); } },
        function (e) { $all('button', box).forEach(function (x) { x.disabled = false; }); err.textContent = e.message; });
    });
    var wc = $('#wipe-class');
    if (wc) wc.addEventListener('click', function () {
      var typed = prompt('To delete class ' + v.class_code + ' and everything in it, type the class code.');
      if (typed == null) return;
      tapBusy(wc, true);
      api('/api/teacher/class/wipe', { class_code: v.class_code, confirm: typed }).then(function (r) {
        toast('Deleted class ' + r.class_code + ': ' + plural(r.deleted_students, 'student', 'students') + '.'); ss('litmus-class', null); loadClasses();
      }, function (e) { tapBusy(wc, false); tapNote(wc, e.message); });
    });
    var cd = $('#clear-demo');
    if (cd) cd.addEventListener('click', function () {
      if (!confirm('Clear all demo students? Real classes are not affected.')) return;
      tapBusy(cd, true);
      api('/api/teacher/demo/clear', {}).then(function (r) { toast('Cleared ' + r.cleared + ' demo students.'); ss('litmus-class', null); loadClasses(); },
        function (e) { tapBusy(cd, false); tapNote(cd, e.message); });
    });
    var sd = $('#seed-demo');
    if (sd) sd.addEventListener('click', function () { tapBusy(sd, true); api('/api/teacher/demo/seed', {}).then(loadClasses, function (e) { tapBusy(sd, false); tapNote(sd, e.message); }); });
    if (params.get('student')) { var first = v.students.filter(function (r) { return r.has_results; })[+params.get('student') || 0]; if (first) openStudent(first.session_id, true); }
  }

  /* ---------------------------------------------------------------- the grid refreshes by itself
     Every 3 seconds while the tab is visible; 10 seconds after an error. Only the parts that changed
     are replaced (tiles, rows, the safeguarding count), so nothing flickers, an open Decision Trail
     stays open, and keyboard focus stays on the same student's button. */
  var refresh = { timer: null, gen: 0 };
  function startRefresh() {
    clearTimeout(refresh.timer);
    refresh.gen++;
    if (DEMO_PAGE) return;
    var gen = refresh.gen, cls = T.classCode;
    function tick(delay) {
      refresh.timer = setTimeout(function () {
        if (gen !== refresh.gen || T.classCode !== cls || !T.token) return;
        if (document.hidden) { tick(3000); return; }
        Promise.all([
          api('/api/teacher/class?class_code=' + encodeURIComponent(cls)),
          api('/api/teacher/safeguarding?class_code=' + encodeURIComponent(cls))
        ]).then(function (out) {
          if (gen !== refresh.gen) return;
          patchGrid(out[0], out[1]);
          reloadReviews();
          var u = $('#updated'); if (u) u.textContent = 'Updated just now.';
          tick(3000);
        }, function () {
          if (gen !== refresh.gen) return;
          var u = $('#updated'); if (u) u.textContent = 'Could not update just now. Trying again in 10 seconds.';
          tick(10000);
        });
      }, delay);
    }
    tick(3000);
  }
  function patchGrid(v, sg) {
    var before = {};
    T.view.students.forEach(function (r) { before[r.session_id] = true; });
    var changed = JSON.stringify([v.students, v.summary]) !== JSON.stringify([T.view.students, T.view.summary]);
    var sgChanged = JSON.stringify(sg) !== JSON.stringify(T.sg);
    T.view = v; T.sg = sg;
    if (changed) {
      var fresh = {}, any = false;
      v.students.forEach(function (r) { if (!before[r.session_id]) { fresh[r.session_id] = true; any = true; } });
      var ae = document.activeElement;
      var keep = ae && ae.dataset && ae.dataset.student;
      $('#tiles').innerHTML = tilesHtml(v.summary);
      $('#grid-body').innerHTML = rowsHtml(v, fresh);
      var qcl = $('#qc-line-slot'); if (qcl) qcl.innerHTML = qcLine(v);
      var nc = $('#next-card'); if (nc && !nc.contains(document.activeElement)) { nc.outerHTML = nextCardHtml(v); wireNextCard(); }
      if (keep) { var again = $('[data-student="' + keep + '"]'); if (again) again.focus({ preventScroll: true }); }
      if (any) setTimeout(function () {
        $all('#grid-body tr.row-new').forEach(function (tr) { tr.classList.remove('row-new'); var t = tr.querySelector('.new-tag'); if (t) t.remove(); });
      }, 2000);
    }
    if (sgChanged) {
      $('#sg-banner').innerHTML = sgBanner();
      var panel = $('#safeguarding');
      var inPanel = panel && panel.contains(document.activeElement);
      if (panel && !inPanel) panel.innerHTML = '<h2 id="sg-h">Safeguarding</h2>' + sgHtml();
    }
  }

  /* ---------------------------------------------------------------- projector view
     Large type for a big screen in a public room. It shows the join code and address, who has
     joined and finished, and levels as numbers. It never shows anything a student typed, any flag,
     or any safeguarding detail: the server sends only those counts (/api/teacher/present). */
  var present = { timer: null, keys: null };
  function joinUrl(cls) {
    return (T.status && T.status.join_url) || (new URL('./', location.href).href + '?join=' + encodeURIComponent(cls));
  }
  function loadPresent(cls) {
    T.classCode = cls;
    $('#logout').hidden = false;
    var url = joinUrl(cls);
    var qr = '';
    try { qr = window.LitmusQR ? window.LitmusQR.svg(url, { scale: 6, label: 'QR code for ' + url }) : ''; } catch (e) { qr = ''; }
    $('#main').innerHTML =
      // Two columns on a big screen: how to join stays on the left, what is happening fills the right.
      '<section class="present-view" aria-labelledby="pv-h">' +
        '<div class="pv-join"><h1 id="pv-h">Scan to try Litmus</h1>' +
          (qr ? '<div class="pv-qr">' + qr + '</div>' : '<p class="pv-noqr">No QR code here: type the address below.</p>') +
          '<p class="pv-url">' + esc(url.replace(/^https?:\/\//, '')) + '</p>' +
          '<p class="pv-note">3 short tasks with a built-in AI. For judges and adults at this event.</p></div>' +
        '<div class="pv-live">' +
          '<div class="pv-counts" aria-live="polite"><p><b id="pv-joined">0</b> <span>joined</span></p><p><b id="pv-finished">0</b> <span>finished</span></p>' +
            '<p class="pv-updated" id="updated">Connecting</p></div>' +
          '<h2 class="pv-h2">Class ' + esc(cls) + ': who is here</h2><ul class="pv-grid" id="pv-grid"></ul><p class="pv-legend" id="pv-legend"></p>' +
          '<h2 class="pv-h2">Levels so far</h2><div class="table-wrap"><table class="grid pv-levels" id="pv-levels"></table></div>' +
        '</div>' +
      '</section>';
    present.keys = null;
    clearTimeout(present.timer);
    function tick() {
      if (document.hidden) { present.timer = setTimeout(tick, 3000); return; }
      api('/api/teacher/present?class_code=' + encodeURIComponent(cls)).then(function (p) {
        drawPresent(p);
        $('#updated').textContent = 'Updated just now';
        present.timer = setTimeout(tick, 3000);
      }, function () {
        var u = $('#updated'); if (u) u.textContent = 'Could not update just now. Trying again in 10 seconds.';
        present.timer = setTimeout(tick, 10000);
      });
    }
    tick();
  }
  function drawPresent(p) {
    $('#pv-joined').textContent = p.joined;
    $('#pv-finished').textContent = p.finished;
    $('#pv-legend').textContent = 'The numbers on a finished card are levels, in this order: ' + p.areas.map(function (a) { return a.name; }).join(', ') + '. A dash means not measured.';
    var seen = present.keys || {};
    var first = present.keys === null;
    var now = {};
    var names = p.levels.reduce(function (m, l) { m[l.level] = l.name; return m; }, {});
    $('#pv-grid').innerHTML = p.students.map(function (r) {
      now[r.key] = true;
      var isNew = !first && !seen[r.key];
      var levels = p.areas.map(function (a) {
        var lv = r.levels[a.id];
        return '<span class="pv-lv lv-' + (lv || 0) + '" title="' + esc(a.name) + ': ' + (lv ? 'Level ' + lv : 'not measured') + '">' + (lv || '-') + '</span>';
      }).join('');
      var label = r.finished ? 'Finished' : r.tasks_done + ' of ' + r.tasks_total + ' tasks';
      // Someone part way: one pip per task, filled when done (the words above say the same).
      var pips = '<span class="pv-pips" aria-hidden="true">';
      for (var i = 0; i < r.tasks_total; i++) pips += '<i' + (i < r.tasks_done ? ' class="on"' : '') + '></i>';
      pips += '</span>';
      return '<li class="pv-tile' + (isNew ? ' row-new' : '') + (r.finished ? ' done' : '') + '"><span class="pv-code"><b>' + esc(r.label) + '</b>' + (isNew ? ' <span class="new-tag">New</span>' : '') + (r.finished ? TICK_ICON : '') + '</span>' +
        '<span class="pv-state">' + esc(label) + '</span>' +
        (r.finished ? '<span class="pv-lvs" role="img" aria-label="' + esc(p.areas.map(function (a) { var lv = r.levels[a.id]; return a.name + ': ' + (lv ? 'Level ' + lv : 'not measured'); }).join('. ')) + '">' + levels + '</span>' : pips) + '</li>';
    }).join('') || '<li class="pv-empty">Nobody yet. Scan the code to be first.</li>';
    // More people, smaller cards, so the whole class stays on one screen.
    $('#pv-grid').dataset.density = p.students.length > 30 ? 'tight' : p.students.length > 15 ? 'snug' : 'roomy';
    present.keys = now;
    setTimeout(function () { $all('#pv-grid .row-new').forEach(function (li) { li.classList.remove('row-new'); var t = li.querySelector('.new-tag'); if (t) t.remove(); }); }, 2000);
    $('#pv-levels').innerHTML = '<caption class="visually-hidden">How many people are at each level in each topic</caption><thead><tr><th scope="col">Topic</th>' +
      [1, 2, 3].map(function (n) { return '<th scope="col">' + cellsOnly(n) + ' Level ' + n + ': ' + esc(names[n] || '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      p.level_counts.map(function (c) { return '<tr><th scope="row">' + esc(c.name) + '</th>' + [1, 2, 3].map(function (n) { var k = c.levels[String(n)]; return '<td class="num-cell' + (k ? '' : ' zero') + '">' + k + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
  }
  function signInFromHash() {
    var code = HASH.get('code');
    if (!code) { drawLogin(); return; }
    api('/api/teacher/login', { code: code }).then(function (r) { T.token = r.token; ss('litmus-teacher', r.token); loadClasses(); }, function (e) {
      // Wrong code, or too many tries: say so, and try again shortly (the room is watching).
      $('#main').innerHTML = '<div class="card"><h1>' + (COMPARE ? 'Two students side by side' : 'Projector view') + '</h1><p class="error" role="alert">' + esc(e.message) + '</p><p>Trying again in 10 seconds.</p></div>';
      setTimeout(signInFromHash, 10000);
    });
  }

  // The change between the first set and the latest set, side by side, in words as well as numbers.
  function setName(n) { return n === 1 ? 'First set' : 'Practice set ' + (n - 1); }
  // The change in words, with a shape before it: an up arrow, a down arrow, an equals sign, or a dash.
  var CHANGE_ICONS = { up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', same: 'M6 9h12M6 15h12', none: 'M7 12h10' };
  function changeMark(text) {
    var kind = /^Up/.test(text) ? 'up' : /^Down/.test(text) ? 'down' : /^Same/.test(text) ? 'same' : 'none';
    return '<span class="chg ' + kind + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + CHANGE_ICONS[kind] + '"/></svg>' + esc(text) + '</span>';
  }
  function progressTable(p) {
    if (!p) return '';
    function cell(x) { return x.score == null ? '<span class="muted">Not in this set</span>' : level(x) + ' <span class="small">' + esc(x.level_name) + ', ' + x.score + '</span>'; }
    return '<div class="progress-box" id="progress-box"><h3 style="margin:8px 0 4px">Change over time</h3>' +
      '<p class="small muted" style="margin:0 0 8px">The same topic scores the student saw after each set. Litmus score ' + p.first_overall + ' in the ' + esc(setName(p.first_round).toLowerCase()) + ', ' + p.latest_overall + ' in ' + esc(setName(p.latest_round).toLowerCase()) + '.</p>' +
      '<div class="table-wrap"><table class="grid"><caption class="visually-hidden">Topic levels in the first and latest set</caption><thead><tr><th scope="col">Topic</th><th scope="col">' + esc(setName(p.first_round)) + '</th><th scope="col">' + esc(setName(p.latest_round)) + '</th><th scope="col">Change</th></tr></thead><tbody>' +
      p.areas.map(function (a) { return '<tr><th scope="row">' + esc(a.name) + '</th><td>' + cell(a.first) + '</td><td>' + cell(a.latest) + '</td><td>' + changeMark(a.change) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  function openStudent(sid, noScroll, opener, focus) {
    var d = $('#drawer');
    d.innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading</p>';
    // Tap feedback (19 Nov 2026): the drawer sits below the grid, so it is scrolled to and outlined at once.
    if (!noScroll) { d.scrollIntoView({ block: 'start' }); d.classList.remove('cf-flash'); void d.offsetWidth; d.classList.add('cf-flash'); setTimeout(function () { d.classList.remove('cf-flash'); }, 2100); }
    api('/api/teacher/student?class_code=' + encodeURIComponent(T.classCode) + '&sid=' + encodeURIComponent(sid)).then(function (st) {
      var html = '<section class="card" aria-labelledby="stu-h"><div class="row between"><h2 id="stu-h" tabindex="-1">Decision Trail: ' + esc(st.student_code) + '</h2><button class="btn quiet small" type="button" id="close-drawer">Close</button></div>' +
        progressTable(st.progress);
      st.rounds.forEach(function (r) {
        html += '<h3 style="margin-top:14px">' + (r.round === 1 ? 'First set' : 'Practice set ' + (r.round - 1)) + (r.results ? ': Litmus score ' + r.results.overall : '') + '</h3>';
        if (r.results) {
          html += '<p class="small">' + r.results.areas.map(function (a) { return esc(a.name) + ': ' + (a.level ? 'Level ' + a.level : 'not measured'); }).join(' · ') + '</p>';
          var ll = window.LitmusScore ? window.LitmusScore.levelLine(r.results) : null;
          if (ll && ll.held) html += '<p class="small stu-next"><b>Their next step, as they saw it:</b> ' + esc(ll.lead + ': ' + ll.text) + '</p>';
          if (r.results.flags.length) html += r.results.flags.map(function (f) { return '<p class="small"><b>' + FLAG_ICON + ' Flag: ' + esc(f.label) + '.</b> ' + esc(f.explain) + ' ' + esc(taskNames(f.tasks)) + '.</p>'; }).join('');
        }
        // Task numbers in this set ("task 3"), instead of internal ids such as "F3"
        function taskNames(ids) {
          var nums = ids.map(function (id) { var i = r.trail.tasks.map(function (x) { return x.task_id; }).indexOf(id); return i >= 0 ? String(i + 1) : id; });
          return (nums.length === 1 ? 'Task ' : 'Tasks ') + (nums.length === 1 ? nums[0] : nums.length === 2 ? nums[0] + ' and ' + nums[1] : nums.slice(0, -1).join(', ') + ', and ' + nums[nums.length - 1]);
        }
        r.trail.tasks.forEach(function (t) {
          var dec = t.steps.filter(function (s) { return s.kind === 'decision'; }).pop();
          var asks = t.steps.filter(function (s) { return s.kind === 'chat'; }).length;
          var checked = t.steps.some(function (s) { return s.kind === 'check'; });
          var time = t.steps.filter(function (s) { return s.kind === 'time'; }).pop();
          var here = focus && focus.task === t.task_id && (focus.round || 1) === r.round;
          var reviewedTag = (r.reviews || []).some(function (rv) { return rv.task_id === t.task_id; }) ? '<span class="tag review-tag">' + TICK_ICON + 'Reviewed</span>' : '';
          html += '<details class="trail-task" id="dt-' + r.round + '-' + esc(t.task_id) + '" style="border-top:1px solid var(--line);padding-top:8px"' + (here ? ' open' : '') + '><summary><b>' + esc(t.title) + '</b><span class="tag">' + esc(t.area_name) + '</span>' + reviewedTag +
            (dec ? '<span class="small">' + esc(dec.text.replace('You decided: ', '')) + '</span>' : '<span class="small muted">Not finished</span>') +
            '<span class="small muted">' + plural(asks, 'message', 'messages') + ' · ' + (checked ? 'checked' : 'no check') + (t.score != null ? ' · score ' + t.score : '') + '</span></summary>' +
            '<ol class="timeline">' + t.steps.map(function (s) {
              if (s.kind === 'chat') return '<li>' + esc(s.text) + '<div class="reply">' + (s.scripted ? 'AI: ' : 'Live AI: ') + esc(s.reply) + '</div></li>';
              if (s.kind === 'decision') return '<li class="tl-decision"><b>' + esc(s.text) + '</b><div>Reason: "' + esc(s.reason) + '"</div>' + (s.tags.length ? '<div class="small">Tapped: ' + esc(s.tags.join('; ')) + '</div>' : '') + '<div class="small muted">How sure: ' + esc(s.confidence) + ' · ' + esc(s.input_mode || '') + '</div>' + (s.marker ? '<div class="small muted marker-line">' + esc(s.marker) + '</div>' : '') + '</li>';
              return '<li class="tl-' + s.kind + '">' + esc(s.text) + '</li>';
            }).join('') + '</ol>' + (time ? '' : '') + reviewForm(st, r, t, here) + '</details>';
        });
      });
      if (st.practice) html += pdTeacherHtml(st);   // Practise a decision: only sent while the mode is on
      html += '</section>';
      d.innerHTML = html;
      wireReviewForms(d, sid, focus);
      if (st.practice) wirePdMarks(d, st);
      if (focus && focus.task) {
        var panel = document.getElementById('rv-' + (focus.round || 1) + '-' + focus.task);
        if (panel) {
          setTimeout(function () { panel.scrollIntoView({ block: 'start' }); }, 30);
          panel.setAttribute('tabindex', '-1');
          panel.focus({ preventScroll: true });
          noScroll = true;
        }
      }
      $('#close-drawer').addEventListener('click', function () {
        d.innerHTML = '';
        // Back to the student's Open button, so a keyboard user keeps their place in the grid.
        var back = opener && document.contains(opener) ? opener : $('[data-student="' + sid + '"]');
        if (back) back.focus();
      });
      if (!noScroll) {
        d.scrollIntoView({ behavior: 'smooth' });
        // Move keyboard and screen reader focus to the trail that just opened, unless focus is
        // somewhere else on purpose (for example on the guided demo's Next button).
        var ae = document.activeElement;
        if (!ae || ae === document.body || ae === opener || !document.contains(ae)) $('#stu-h').focus({ preventScroll: true });
      }
    }, function (e) { d.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });
  }

  /* ---------------------------------------------------------------- practise a decision (19 Nov 2026)
     The student's answers beside the Learning and Assessment Lead's rubric (0, 1 and 2 per step, her words),
     and a control to record 0, 1 or 2 per step. Litmus adds no total and marks no free text itself. */
  function pdTeacherHtml(st) {
    var p = st.practice;
    if (!p.started) return '<section class="pdt" aria-labelledby="pdt-h"><h3 id="pdt-h">' + esc(p.title) + '</h3><p class="muted">Not started.</p></section>';
    var steps = p.steps.map(function (s) {
      var name = 'pdt-' + s.id;
      var cur = s.mark ? s.mark.mark : null;
      var opts = '<label class="option pdt-opt"><input type="radio" name="' + name + '" value=""' + (cur == null ? ' checked' : '') + '><span>Not marked</span></label>' +
        s.rubric.map(function (r) {
          return '<label class="option pdt-opt"><input type="radio" name="' + name + '" value="' + r.points + '"' + (cur === r.points ? ' checked' : '') + '>' +
            '<span><b class="pdt-pts">' + r.points + (r.points === 1 ? ' point' : ' points') + '</b>' + esc(r.text) + '</span></label>';
        }).join('');
      var ans = s.answer ? '<p class="pdt-said">"' + esc(s.answer) + '"</p>' : '<p class="muted">No answer yet.</p>';
      if (s.followup) ans += '<p class="small muted pdt-ai">AI: ' + esc(s.followup) + '</p>' + (s.followup_answer ? '<p class="pdt-said">"' + esc(s.followup_answer) + '"</p>' : '<p class="small muted">No answer to the follow-up.</p>');
      if (s.quotation_opened) ans += '<p class="small pdt-check">' + TICK_ICON + 'Opened the quotation</p>';
      return '<article class="pdt-step" data-step="' + esc(s.id) + '">' +
        '<div class="pdt-ans"><h4><span class="pdt-letter" aria-hidden="true">' + esc(s.letter) + '</span>' + esc(s.name) + '</h4>' +
          '<p class="small muted pdt-gloss">' + esc(s.gloss) + '</p>' +
          '<p class="small muted pdt-ai">AI: ' + esc(s.prompt) + '</p>' + ans +
          '<p class="small pdt-ev"><b>Evidence of learning:</b> ' + esc(s.evidence) + '</p></div>' +
        '<fieldset class="pdt-rub"' + (s.answer ? '' : ' disabled') + '><legend>' + esc(s.rubric_name) + ': your mark</legend>' + opts +
          (s.mark && s.mark.mark != null ? '<p class="small muted pdt-by">' + esc(s.mark.by) + ', ' + esc(fmtTime(s.mark.ts)) + '</p>' : '') + '</fieldset>' +
      '</article>';
    }).join('');
    return '<section class="pdt" aria-labelledby="pdt-h"><h3 id="pdt-h">' + esc(p.title) + '</h3>' +
      '<p class="small muted">' + (p.finished ? 'Finished ' + esc(fmtTime(p.finished_ts)) : 'Not finished') + ' · ' + (p.quotation_opened ? 'opened the quotation' : 'did not open the quotation') + '</p>' +
      '<div class="pdt-first"><b>Before the AI</b><p>What they want the event to achieve: "' + esc(p.first.goal || '') + '"</p><p>First idea: "' + esc(p.first.idea || '') + '"</p></div>' +
      '<details class="pdt-adv"><summary>The AI\'s advice in this scenario</summary><p class="pre">' + esc(p.advice) + '</p><p><b>Wrong on purpose:</b> ' + esc(p.planted) + '</p></details>' +
      '<form class="pdt-form" id="pdt-form" novalidate>' + steps + labelField('pdt-by-input') +
        '<p class="error" role="alert"></p><button class="btn small" type="submit">Save marks</button></form></section>';
  }
  function wirePdMarks(d, st) {
    var f = $('#pdt-form', d);
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = f.querySelector('.error');
      err.textContent = '';
      var by = $('#pdt-by-input', d);
      var todo = st.practice.steps.filter(function (s) {
        var c = f.querySelector('input[name="pdt-' + s.id + '"]:checked');
        if (!c || !s.answer) return false;
        var want = c.value === '' ? null : +c.value;
        var had = s.mark ? s.mark.mark : null;
        s._want = want;
        return want !== had;
      });
      if (!todo.length) { tapNote(f.querySelector('button[type="submit"]'), 'Nothing changed.'); return; }
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      var chain = Promise.resolve();
      todo.forEach(function (s) {
        chain = chain.then(function () {
          var body = { class_code: T.classCode, sid: st.session_id, step: s.id, mark: s._want };
          if (by) body.by = by.value;
          return api('/api/teacher/practice/mark', body);
        });
      });
      chain.then(function () {
        if (by) T.label = by.value.trim();
        toast('Marks saved for ' + st.student_code + '.');
        return api('/api/teacher/me').then(function (me) { T.label = me.label || T.label; var ls = $('#label-slot'); if (ls) { ls.innerHTML = labelHtml(); wireLabel(); } });
      }).then(function () { openStudent(st.session_id, true); }, function (e2) { btn.disabled = false; err.textContent = e2.message; });
    });
  }

  // The presenter's AI switch. Shown only on a copy set up for live AI: "Use scripted replies"
  // sends every reply to the script at once; "Use live AI" goes back (and resets the breaker).
  var AI_WORDS = { live: 'Live AI is answering.', scripted_operator: 'Scripted replies: switched on here.',
    scripted_breaker: 'Scripted replies: the live AI was slow or failing, so it is paused for a short while.',
    scripted_cap: 'Scripted replies: the daily limit of live AI calls is used up.' };
  // Marker only (no OpenAI key, the Adaption marker set up): chat is always scripted; the switch turns the marker on or off.
  var MARKER_WORDS = { live: 'Live marker: typed reasons are marked by an AI model from Adaption. Chat replies are scripted.',
    scripted_operator: 'Keyword rules only: switched on here. Nothing is sent out; chat replies are scripted.',
    scripted_breaker: 'Keyword rules only: the Adaption marker was slow or failing, so it is paused for a short while.',
    scripted_cap: 'Keyword rules only: the daily limit of AI marker calls is used up.' };
  function aiWords(info) {
    if (info.ai_setup === 'marker_only') return MARKER_WORDS[info.judge_state] || 'Keyword rules only.';
    if (info.ai_state === 'live' && info.teacher_ai_line) return info.teacher_ai_line;   // 19 Nov 2026: from the real switches
    // cp_10 (text audit E7): "Live AI is answering" only when a task chat really runs live.
    var w = info.ai_state === 'live' && info.chat_live === false ? 'Scripted replies. No task uses live AI.' : (AI_WORDS[info.ai_state] || 'Scripted replies.');
    if (info.ai_state === 'live' && info.judge_provider) w += ' Typed reasons are marked by ' + (info.judge_provider === 'Adaption' ? 'an AI model from Adaption.' : 'an OpenAI model.');
    return w;
  }
  function drawAISwitch(info) {
    var slot = $('#ai-switch-slot');
    if (!slot) return;
    if (!info) { api('/api/teacher/ai-mode').then(drawAISwitch, function () {}); return; }
    var markerOnly = info.ai_setup === 'marker_only';
    var box = $('#ai-settings');
    if (info.configured_mode !== 'live' && !markerOnly) { slot.innerHTML = ''; if (box) box.hidden = true; return; }
    if (box) box.hidden = false;
    var scripted = info.operator === 'scripted';
    var liveNow = markerOnly ? info.judge_state === 'live' : info.ai_state === 'live';
    // The state line has a mark as well as words (a filled dot for live, a hollow ring for scripted).
    // The two buttons are one joined switch: the one in use is filled and ticked.
    slot.innerHTML = '<div class="ai-switch" role="group" aria-labelledby="ai-switch-h"><span id="ai-switch-h" class="state" data-state="' + (liveNow ? 'live' : 'scripted') + '">' + esc(aiWords(info)) + '</span>' +
      '<span class="small muted">' + plural(info.calls_today, 'AI call', 'AI calls') + ' today, limit ' + info.daily_cap + '.</span><span class="spacer"></span>' +
      '<span class="ai-toggle"><button class="btn small" type="button" id="ai-to-scripted" aria-pressed="' + scripted + '">' + (markerOnly ? 'Use keyword rules only' : 'Use scripted replies') + '</button>' +
      '<button class="btn small" type="button" id="ai-to-live" aria-pressed="' + !scripted + '">' + (markerOnly ? 'Use the live marker' : 'Use live AI') + '</button></span></div>';
    function set(m) {
      var pb = $(m === 'live' ? '#ai-to-live' : '#ai-to-scripted'); tapBusy(pb, true);
      api('/api/teacher/ai-mode', { mode: m }).then(function (r) { drawAISwitch(r); toast(aiWords(r) || 'Done.'); var b = $(m === 'live' ? '#ai-to-live' : '#ai-to-scripted'); if (b) b.focus(); },
        function (e) { tapBusy(pb, false); tapNote(slot, e.message); });
    }
    $('#ai-to-scripted').addEventListener('click', function () { set('scripted'); });
    $('#ai-to-live').addEventListener('click', function () { set('live'); });
  }

  // The top bar sticks to the top on wider screens. Without room for it, "Go to the safeguarding
  // panel" and an opened Decision Trail scrolled their heading under the bar, out of sight.
  function padForTopbar() {
    var b = $('.topbar');
    var sticky = b && getComputedStyle(b).position === 'sticky';
    document.documentElement.style.scrollPaddingTop = sticky ? (b.offsetHeight + 12) + 'px' : '';
  }
  padForTopbar();
  window.addEventListener('resize', padForTopbar);

  $('#logout').addEventListener('click', function () { T.token = null; ss('litmus-teacher', null); drawLogin(); });
  // cp_10: leaving the open demo for a real sign-in.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#od-signin');
    if (!a) return;
    e.preventDefault(); T.token = null; ss('litmus-teacher', null); ss('litmus-class', null);
    if (history.replaceState) history.replaceState(null, '', 'teacher.html');
    drawLogin();
  });

  applySettings();
  fetch(API + '/api/status').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (st) {
    T.status = st;
    T.token = ss('litmus-teacher');
    if ((PRESENT || COMPARE) && !T.token && HASH.get('code')) { signInFromHash(); return; }
    var auto = params.get('code');
    // cp_10: "I'm a teacher" on the start screen: the made-up demo class, no code (a sign-in for that class only).
    if (params.get('open') === 'demo' && !(T.token && !openDemo())) {
      return api('/api/teacher/open-demo', {}).then(function (r) { T.token = r.token; ss('litmus-teacher', r.token); ss('litmus-class', r.scope); return loadClasses(); },
        function () { drawLogin(); });
    }
    if (!T.token && auto) {
      return api('/api/teacher/login', { code: auto }).then(function (r) { T.token = r.token; ss('litmus-teacher', r.token); return loadClasses(); }, function () { drawLogin(); });
    }
    if (T.token) return loadClasses().catch(function () { drawLogin(); });
    drawLogin();
  });
})();
