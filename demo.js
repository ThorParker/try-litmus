/* Litmus guided demo. Open /?demo=1 (add &play=1 to start playing, &step=N to jump to a step).
   It drives the real app with the scripted AI: one made-up student in the demo class, through the product's two
   modes in order (the Quick check, then the tasks with the AI), then the teacher's view of the demo class.
   Next / Back / Play by hand, or auto-play end to end. Inert without ?demo=1.

   19 Nov 2026 (demo rebuilt so it cannot go stale): this file holds NO copy of the product. No card's or task's
   words, no count, no button label. It picks things by id and selector only (the SEL table below is the one place
   to re-point when a screen changes), reads every number it says from what the app loaded (cards in this run,
   tasks in this set), takes the right and wrong calls from each card's own ai_is_right flag, and asks the server
   (/api/demo/tour/plan) what the made-up student decides on a task, which the server works out from the task's
   own data. tests/test_demo_fresh_2026_11_19.py fails if this file holds any retired text
   (tools/stale_retired.txt), any copy of a card's or a task's words, or a typed count in a caption.

   19 Nov 2026 (demo smooth; team lead: "make it smooth", "proper timing"): every step is caption, a still lead,
   its action, then a hold long enough to read and take in (PACE below). Screens cross-fade, the page scrolls once
   per move with one eased curve, text is typed at an even rate with a caret, the AI's reply is revealed line by
   line, sheets finish opening before the next tap, and the spotlight glides between targets. The ready signal
   (html[data-demo-ready]) is set only when the step's last transition has ended. With reduced motion every
   movement is an instant cut, with the same holds. Any key or click on the page pauses autoplay. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);

  /* ------------------------------------------------------------ pacing (pure: tests drive it with fake timers) */
  var PACE = {
    CAPTION_LEAD: 400,   // the caption changes, then this much stillness before anything moves
    PER_WORD: 450,       // reading time for each word of the caption
    STILL: 1500,         // stillness at the end of a step
    RESULT_STILL: 3000,  // ... at least this long when the step ends on a result (a verdict, a finding, a score)
    MIN_STEP: 4000,      // no step shorter than this, caption to next caption
    TYPE_CPS: 22,        // typed text, characters a second
    SCROLL_MS: 450,      // one eased scroll
    FADE_MS: 250         // a screen change
  };
  function words(text) { return String(text || '').split(/\s+/).filter(Boolean).length; }
  // The stillness after a step's action: the caption's reading time plus the end stillness, and never a step
  // shorter than MIN_STEP in all (caption lead + action + hold).
  function holdFor(caption, actionMs, result) {
    var still = result ? PACE.RESULT_STILL : PACE.STILL;
    return Math.max(words(caption) * PACE.PER_WORD + still, PACE.MIN_STEP - PACE.CAPTION_LEAD - (actionMs || 0));
  }
  // One step at a time: caption, lead, action (resolves when its last transition has ended), ready, hold. Every
  // timer is the runner's own, so Next, Back, and a new run cancel them all at once.
  function Runner(env, io) {
    var r = { token: 0, timers: [], cur: -1 };
    function later(ms) {
      var tok = r.token;
      return new Promise(function (res, rej) {
        var id = env.setTimeout(function () { if (tok === r.token) res(); else rej({ cancelled: true }); }, Math.max(0, ms));
        r.timers.push(id);
      });
    }
    r.later = later;
    r.cancel = function () { r.token++; r.timers.forEach(function (id) { env.clearTimeout(id); }); r.timers = []; };
    r.run = function (i) {
      r.cancel();
      var tok = r.token, t0 = 0;
      r.cur = i;
      io.caption(i);
      return later(PACE.CAPTION_LEAD).then(function () {
        t0 = env.now();
        io.mark('act', i, t0);
        return io.act(i);
      }).then(function () {
        var ms = env.now() - t0;
        io.mark('end', i, env.now());
        if (tok !== r.token) return null;
        io.ready(i);
        return later(io.hold(i, ms)).then(function () { if (tok === r.token) io.held(i); });
      }).catch(function (e) { if (!(e && e.cancelled)) throw e; });
    };
    return r;
  }
  window.LitmusDemoPace = { PACE: PACE, holdFor: holdFor, Runner: Runner, words: words };

  if (params.get('demo') !== '1') return;
  // cp_10 (the film): clean=1 shows only the product; hold=1 keeps the first teacher step on its top card.
  var CLEAN = params.get('clean') === '1', HOLD = params.get('hold') === '1';
  var QCFIRST = params.get('qcfirst') || '';   // the film's first Quick check card, by id (quick.js reads it too)
  if (CLEAN) document.documentElement.classList.add('demo-clean');
  function keep() { return (CLEAN ? '&clean=1' : '') + (HOLD ? '&hold=1' : '') + (QCFIRST ? '&qcfirst=' + encodeURIComponent(QCFIRST) : ''); }

  var PAGE = /\/teacher/.test(location.pathname) ? 'teacher' : 'student';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || CLEAN;
  var API = String((window.LITMUS_CONFIG || {}).apiBase || '').replace(/\/$/, '');
  // The page arrives hidden and fades in when the first step is ready (no white flash between the two pages).
  if (!REDUCED) document.documentElement.classList.add('demo-enter');

  /* Every screen part the demo touches, in one table. When another builder's patch changes a screen, re-point
     here (the first selector that exists wins). NOTE.txt in _demo_fresh_2026-11-19 lists what each patch needs. */
  var SEL = {
    firstChoices: ['.mode-list', '#qc-entry-s'],          // _first_page: the two numbered buttons; before it: Quick check
    firstNext: ['#start-next'],
    qcCard: ['#qc-card'],
    qcCall: '.qc-call[data-call="{call}"]',
    qcWhy: ['#qc-whyq'],
    qcClue: '.qc-clue[data-kind="{kind}"]',
    qcAnyClue: ['.qc-clue'],
    qcVerdict: ['#qc-verdict'],
    qcNext: ['#qc-next'],
    qcSummary: ['#qc-res-h'],
    qcKeepWork: ['.qc-kw'],
    qcToTasks: ['#qc-go-tasks', '#mode-2'],
    taskStart: ['#task-start', '#cf-steps', '#cf-hdr', '#task-read'],   // _tap_feedback: the "1 Ask / 2 Test / 3 Decide" screen
    taskStartGo: ['#task-start-go'],                                     // its button into task 1, when it has one
    suggest: ['#cf-suggest', '[data-suggest]'],
    chatInput: ['#chat-input'],
    sourceMove: ['[data-move="source"]', '[data-build="1"]'],            // _tap_feedback renames its label, not its id; older screen: the second "Add" chip
    checkOpen: ['#cf-check'],
    checkGo: ['#open-check'],
    checkResult: ['#check-result-box', '#check-card', '#check-result .check-result'],   // _tap_feedback: the result panel
    checkBack: ['#check-back'],
    decide: ['#cf-decide'],                                              // _tap_feedback: the big "3 Decide"
    sheet: ['#sheet-panel'],
    choice: '[data-choice="{choice}"]',
    oldChoice: 'input[name="choice"][value="{choice}"]',
    tag: '[data-tag="{tag}"]',
    moreReasons: ['#more-reasons'],
    reason: ['#reason'],
    sheetNext: ['#sheet-next'],
    conf: '[data-conf="{n}"]',
    oldConf: 'input[name="conf"][value="{n}"]',
    save: ['#submit-task'],
    score: ['#score-card'],
    scoreLevel: ['#level-line', '.sx-level'],
    scoreParts: ['#sx-parts-box'],
    tGrid: ['table.grid'],
    tLogin: ['#login'],
    tClassCard: ['#next-card', '.tiles'],
    tStudentBtn: '[data-student]',
    tStudentH: ['#stu-h'],
    tSafe: ['#safeguarding'],
    tSafeItem: ['.sg-item'],
    tSafeBanner: ['.banner']
  };

  function $(s, el) { return (el || document).querySelector(s); }
  function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  // The first element that exists for a SEL entry (a list of selectors, or one selector with {holes} filled in).
  function q(key, fill, el) {
    var list = SEL[key];
    if (typeof list === 'string') list = [list];
    for (var k = 0; k < list.length; k++) {
      var s = list[k].replace(/\{(\w+)\}/g, function (m, n) { return String((fill || {})[n]).replace(/"/g, ''); });
      var e = $(s, el || undefined);
      if (e) return e;
    }
    return null;
  }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function App() { return window.LitmusApp; }

  /* ------------------------------------------------------------ run state */
  var cur = -1;          // index of the step on screen
  var playing = params.get('play') === '1';
  var hurry = false;     // finish the running step at once (Next or Back pressed mid-step, or a jump)
  var acting = null;     // promise of the action being acted out
  var RUN = null;        // the Runner

  function sleep(ms) {
    return new Promise(function (res) {
      if (hurry || ms <= 0) { res(); return; }
      var end = Date.now() + ms;
      (function tick() { if (hurry || Date.now() >= end) res(); else setTimeout(tick, 30); })();
    });
  }
  function waitFor(test, timeout) {
    var fn = typeof test === 'string' ? function () { return $(test); } : test;
    var until = Date.now() + (timeout || 10000);
    return new Promise(function (res, rej) {
      (function poll() {
        var v;
        try { v = fn(); } catch (e) { v = null; }
        if (v) { res(v); return; }
        if (timeout !== Infinity && Date.now() > until) { rej(new Error('Timed out waiting for the page.')); return; }
        setTimeout(poll, 30);
      })();
    });
  }
  // Movements a step started (scrolls, fades, reveals): the step is not ready until all of them have ended.
  var moving = [];
  function track(p) { if (p && p.then) moving.push(p); return p; }
  function allSettled() {
    var list = moving;
    moving = [];
    return Promise.all(list.map(function (p) { return p.then(null, function () {}); })).then(function () {
      return moving.length ? allSettled() : null;
    });
  }
  // The end of an element's own CSS transition or animation (the app's sheet), or `max` ms, whichever is first.
  function transitionEnd(el, max) {
    if (!el || REDUCED || hurry) return Promise.resolve();
    return new Promise(function (res) {
      var done = false;
      function fin() { if (!done) { done = true; el.removeEventListener('transitionend', fin); el.removeEventListener('animationend', fin); res(); } }
      el.addEventListener('transitionend', fin);
      el.addEventListener('animationend', fin);
      setTimeout(fin, max || 600);
    });
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  // Typing at an even rate (PACE.TYPE_CPS), counted from the clock so a slow frame never makes a jump, with the
  // caret steady in the box. Reduced motion or a hurry: the whole text at once.
  function typeInto(el, text) {
    el.value = '';
    if (REDUCED || hurry) { el.value = text; fire(el, 'input'); return Promise.resolve(); }
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    var t0 = Date.now(), shown = 0;
    return new Promise(function (res) {
      (function step() {
        if (hurry) shown = text.length;
        else shown = Math.min(text.length, Math.floor((Date.now() - t0) * PACE.TYPE_CPS / 1000) + 1);
        if (el.value.length !== shown) { el.value = text.slice(0, shown); fire(el, 'input'); try { el.setSelectionRange(shown, shown); } catch (e) { /* ignore */ } }
        if (shown >= text.length) { res(); return; }
        setTimeout(step, 1000 / PACE.TYPE_CPS);
      })();
    });
  }
  var barFocus = null;   // keep keyboard focus on the demo controls while the app re-renders
  function keepFocus() {
    if (barFocus && document.activeElement !== barFocus && document.contains(barFocus)) {
      try { barFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return;
    }
    // The demo's keys are ignored inside text boxes: take the cursor back out of any box the demo filled.
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !(ae.closest && ae.closest('#demo-bar'))) {
      try { ae.blur(); } catch (e) { /* ignore */ }
    }
  }
  function press(el) { if (el) { el.click(); keepFocus(); } }

  /* ------------------------------------------------------------ screen changes, scrolling, reveals */
  // A screen change: the new screen fades in over PACE.FADE_MS. Watching the app's main area catches every redraw
  // of the whole screen (a new route, a new card), so no screen ever pops in; a scroll waits for the fade.
  var fading = Promise.resolve();
  function fadeIn(el) {
    if (!el || REDUCED || hurry || !el.animate) return Promise.resolve();
    var a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PACE.FADE_MS, easing: 'ease-out' });
    fading = a.finished.then(null, function () {});
    return track(fading);
  }
  function watchScreens() {
    var main = $('#main');
    if (!main || !window.MutationObserver) return;
    new MutationObserver(function (list) {
      // A whole new screen (the old one removed, a new one added); a strip added beside it is not a screen change.
      if (list.some(function (m) { return m.type === 'childList' && m.addedNodes.length && m.removedNodes.length; })) fadeIn(main);
    }).observe(main, { childList: true });
  }
  // The AI's reply is revealed line by line (a stepped wipe from the top, one step a line), never in one block.
  function reveal(el) {
    if (!el || REDUCED || hurry || !el.animate) return Promise.resolve();
    var lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    var lines = Math.max(1, Math.round(el.getBoundingClientRect().height / lh));
    var ms = Math.min(2400, Math.max(400, lines * 260));
    var a = el.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: ms, easing: 'steps(' + lines + ', end)' });
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: ms, easing: 'linear' });
    return track(a.finished.then(null, function () {}));
  }
  function watchReplies() {
    if (!window.MutationObserver) return;
    // Caught before the browser paints, so the reply never shows whole first.
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          var msgs = n.matches && n.matches('.msg.ai') ? [n] : $all('.msg.ai', n);
          msgs.forEach(function (x) { reveal(x); });
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------ spotlight and scrolling */
  // The part of the screen a step is about keeps its outline, and everything else is dimmed by one fixed layer
  // with a cut-out around each target. The cut-out glides from target to target (one eased move). The layer is
  // only a picture: it takes no clicks and no keyboard focus, it is hidden from screen readers, and it never
  // covers the caption bar.
  var spotEls = [];
  var scrim = null;
  var scrimQueued = false;
  var scrimMissing = 0;
  var gliding = false;
  var CAN_CUT = !!(window.CSS && CSS.supports && CSS.supports('clip-path', 'path(evenodd, "M0 0H1V1H0Z")'));
  function buildScrim() {
    if (!CAN_CUT) return;   // an older browser keeps the outline and simply has no dimming
    scrim = document.createElement('div');
    scrim.className = 'demo-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    window.addEventListener('scroll', queueScrim, { passive: true });
    window.addEventListener('resize', queueScrim);
    // The app redraws parts of the page: keep the cut-out on the target.
    setInterval(queueScrim, 200);
  }
  function queueScrim() {
    if (scrimQueued || !scrim) return;
    scrimQueued = true;
    (window.requestAnimationFrame || setTimeout)(placeScrim);
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return 'M' + (x + r) + ' ' + y + 'h' + (w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + (h - 2 * r) +
      'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + (-(w - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + (-r) +
      'v' + (-(h - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + 'z';
  }
  // One box around all the targets: a single cut-out, so it can glide from one place to the next.
  function placeScrim() {
    scrimQueued = false;
    if (!scrim) return;
    var W = window.innerWidth, H = window.innerHeight, pad = 8, box = null;
    spotEls.forEach(function (e) {
      if (!e || !document.contains(e)) return;
      var r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    });
    if (!box) {
      if (++scrimMissing >= 3) scrim.classList.remove('on');
      return;
    }
    scrimMissing = 0;
    var x0 = Math.max(4, box.l - pad), x1 = Math.min(W - 4, box.r + pad);
    var path = 'path(evenodd, "M0 0H' + W + 'V' + H + 'H0Z' + roundRect(Math.round(x0), Math.round(box.t - pad), Math.round(x1 - x0), Math.round(box.b - box.t + 2 * pad), 12) + '")';
    scrim.classList.toggle('glide', gliding && !REDUCED);
    scrim.style.clipPath = path;
    scrim.style.webkitClipPath = path;
    scrim.classList.add('on');
  }
  function clearSpot() {
    $all('.demo-spot').forEach(function (e) { e.classList.remove('demo-spot'); });
    $all('.demo-spot-row').forEach(function (e) { e.classList.remove('demo-spot-row'); });
    spotEls = [];
    if (scrim) { scrim.classList.remove('on'); scrimMissing = 0; }
  }
  function visibleBand() {
    var top = 8;
    var bar = $('.topbar');
    if (bar && getComputedStyle(bar).position !== 'static') top = bar.getBoundingClientRect().bottom + 12;
    var db = $('#demo-bar');
    var bottom = window.innerHeight - (db ? db.offsetHeight : 0) - 12;
    // The chat-first screen's dock stays on screen above the caption bar: keep targets clear of it too.
    var dock = $('#cf-dock');
    if (dock && dock.offsetHeight) bottom = Math.min(bottom, dock.getBoundingClientRect().top - 12);
    return { top: top, bottom: Math.max(top + 120, bottom) };
  }
  // One eased scroll (PACE.SCROLL_MS, ease in and out), started only after any fade has ended. A new scroll
  // takes over from the one in flight.
  var scrollAnim = 0;
  function easeScroll(y) {
    y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
    var from = window.scrollY, dist = y - from, my = ++scrollAnim;
    if (Math.abs(dist) < 2) return Promise.resolve();
    if (REDUCED || hurry || !window.requestAnimationFrame) { window.scrollTo(0, y); return Promise.resolve(); }
    return new Promise(function (res) {
      var t0 = null;
      function frame(ts) {
        if (my !== scrollAnim) { res(); return; }
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / PACE.SCROLL_MS);
        var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        window.scrollTo(0, from + dist * e);
        if (k < 1) requestAnimationFrame(frame); else res();
      }
      requestAnimationFrame(frame);
    });
  }
  // Bring a target fully into the space between the top bar and the caption bar (centred when it fits, its top
  // under the top bar when taller). No move at all when it is already in view.
  function scrollToEl(el, where) {
    if (!el) return Promise.resolve();
    return fading.then(function () {
      if (!document.contains(el)) return null;
      var r = el.getBoundingClientRect(), band = visibleBand(), space = band.bottom - band.top;
      var fits = r.height <= space;
      if (where !== 'top' && fits && r.top >= band.top - 2 && r.bottom <= band.bottom + 2) return null;
      var y = (where === 'top' || !fits) ? window.scrollY + r.top - band.top : window.scrollY + r.top - band.top - (space - r.height) / 2;
      return easeScroll(y);
    });
  }
  function toTop() { return track(fading.then(function () { return easeScroll(0); })); }
  function spot(els, scrollTarget, where) {
    $all('.demo-spot').forEach(function (e) { e.classList.remove('demo-spot'); });
    $all('.demo-spot-row').forEach(function (e) { e.classList.remove('demo-spot-row'); });
    spotEls = (Array.isArray(els) ? els : [els]).filter(Boolean);
    spotEls.forEach(function (e) { e.classList.add(e.tagName === 'TR' ? 'demo-spot-row' : 'demo-spot'); });
    gliding = true;
    setTimeout(function () { gliding = false; }, 400);
    var t = scrollTarget === undefined ? (Array.isArray(els) ? els[0] : els) : scrollTarget;
    var p = t ? scrollToEl(t, where) : Promise.resolve();
    queueScrim();
    return track(p);
  }

  /* ------------------------------------------------------------ what the app itself holds (never a copy) */
  function api(path, body) {
    return fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error((d && d.error) || 'Request failed.'); return d; }); });
  }
  function view() { return App().route().view; }
  function status() { return (App() && App().state.status) || {}; }
  function demoClass() { return status().demo_class || ss('litmus-demo-class') || ''; }
  function aiCount() { return $all('#messages .msg.ai').length; }
  function lastReply() { var m = $all('#messages .msg.ai'); return m[m.length - 1]; }
  function composer() { return $('#composer') || $('#chat-form'); }
  function cf() { return !!$('#cf'); }
  // The Quick check run on screen (static/quick.js keeps it), the card waiting for a call, and the counts.
  function qcState() { return window.LitmusQuick && window.LitmusQuick.state; }
  function qcRun() { var Q = qcState(); return Q && Q.run; }
  function qcCard() { var r = qcRun(); return r && !r.done ? r.cards[r.answers.length] || null : null; }
  function qcSize() { var r = qcRun() || (PRE && PRE.run); return r ? r.cards.length : ((status().quick_check || {}).size || 0); }
  function setSize() { var s = App() && App().state.session; return s && s.tasks ? s.tasks.length : (PRE && PRE.tasks ? PRE.tasks : 0); }
  // A right call is the one that matches the card's own flag; a wrong call is the other one.
  function callFor(card, right) { return (!!card.ai_is_right === !!right) ? 'trust' : 'doubt'; }
  function n(num, one, many) { return num + ' ' + (num === 1 ? one : many); }

  function teacherUrl(stepNo) {
    var st = status();
    // cp_11a (online: a real teacher code, no demo code): the teacher steps open the read-only demo class, no code.
    var qs = (st.demo_teacher_code ? '?demo=1' : '?open=demo&demo=1') + '&step=' + stepNo + '&class=' + encodeURIComponent(demoClass()) +
      (st.demo_teacher_code ? '&code=' + encodeURIComponent(st.demo_teacher_code) : '') + (playing ? '&play=1' : '') + keep();
    return 'teacher.html' + qs;
  }

  // Everything the student steps need, fetched while the first page is on screen (the demo's data is local, so no
  // step waits on the network): a fresh made-up student, its Quick check run (kept where quick.js keeps runs, so
  // the first card is drawn at once), and its plan for task 1. Nothing on screen changes while this runs.
  var PRE = null, preP = null;
  function preload() {
    if (preP) return preP;
    var A = App();
    var size = (function () { try { var v = JSON.parse(localStorage.getItem('litmus-quick-n')); return v === '5' ? 5 : v === '10' ? 10 : null; } catch (e) { return null; } })();
    var pre = {};
    preP = api('/api/demo/tour/start', {}).then(function (s) {
      pre.sid = s.session_id;
      pre.tasks = (s.tasks || []).length;
      pre.first = (s.tasks || [])[0] ? s.tasks[0].id : null;
      ss('litmus-demo-sid', s.session_id);
      ss('litmus-demo-code', s.student_code);
      ss('litmus-demo-class', s.class_code);
      var qs = (A.state.status || {}).quick_check || {};
      var body = { sid: s.session_id, n: size || qs.size || undefined };
      if (QCFIRST) body.first = QCFIRST;
      return Promise.all([
        qs.on === false ? null : api('/api/quick/start', body),
        pre.first ? api('/api/demo/tour/plan', { sid: s.session_id, task_id: pre.first }) : null
      ]);
    }).then(function (out) {
      var r = out[0];
      if (r) {
        pre.run = { sid: pre.sid, id: r.run_id, cards: r.cards, answers: [], weak: r.weak || [], done: false,
                    why: r.why || {}, whyRes: {}, fast: 0, nudged: false, topic: r.topic || null };
        try { localStorage.setItem('litmus-quick-' + pre.sid, JSON.stringify(pre.run)); } catch (e) { /* the app draws a fresh run */ }
      }
      pre.plan = out[1];
      PRE = pre;
      return pre;
    });
    return preP;
  }
  // The made-up student signed in on this page (its session was made by preload; nothing typed, no real code kept).
  function useTour() {
    var A = App();
    return preload().then(function (pre) {
      if (A.state.sid === pre.sid && A.state.session) return null;
      A.state.sid = pre.sid;
      return A.refresh();
    });
  }
  function clearOld() {
    var old = ss('litmus-demo-sid');
    if (!old) return;
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('litmus-task-' + old) === 0 || k === 'litmus-quick-' + old) localStorage.removeItem(k);
      });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ Quick check helpers */
  function cardReady() { var b = $('.qc-call'); return b && !b.disabled && !q('qcVerdict') && !q('qcWhy') ? q('qcCard') : null; }
  // One call on the card on screen. right: the right call or the wrong one. On a "Why?" card the card's own clue
  // chip is tapped (found by the card's clue kind, never by its words).
  function answerCard(right) {
    var c = qcCard();
    if (!c) return Promise.resolve(null);
    var b = q('qcCall', { call: callFor(c, right) });
    return spot(b, q('qcCard')).then(function () { return sleep(700); }).then(function () {
      press(b);
      return waitFor(function () { return q('qcWhy') || q('qcVerdict'); });
    }).then(function (el) {
      if (el !== q('qcWhy')) return el;
      var chip = q('qcClue', { kind: c.clue_kind }) || q('qcAnyClue');
      return spot([el, chip], el).then(function () { return sleep(1400); }).then(function () {
        press(chip);
        return waitFor(function () { return q('qcVerdict'); });
      });
    }).then(function (v) { return { card: c, verdict: v }; });
  }
  function nextCard() {
    var r = qcRun();
    if (!r) return Promise.resolve(null);
    press(q('qcNext'));
    if (r.answers.length >= r.cards.length) return waitFor(function () { return q('qcSummary'); });
    return waitFor(cardReady);
  }
  function isWhyCard(c) { var r = qcRun(); return !!(c && r && r.why && r.why[c.id]); }
  // Whether this run has "Why?" cards (the server's LITMUS_QUICK_WHY switch decides; the run says).
  function whyOn() { var r = qcRun() || (PRE && PRE.run); return r ? !!(r.why && Object.keys(r.why).length) : !!(status().quick_check || {}).why; }
  // Make sure the run is on screen (a jump straight to a later step builds it first).
  function ensureQuick() {
    if (qcRun() && view() === 'quick') return Promise.resolve();
    return useTour().then(function () { App().go('quick'); return waitFor(function () { return cardReady() || q('qcSummary'); }, 15000); });
  }
  // The rest of the run without flipping through the cards on screen: each call goes to the server as the page
  // sends it (right calls, the last card missed so there is one thing to work on), then the summary is drawn.
  function finishRun() {
    var Q = qcState(), run = Q && Q.run, A = App();
    if (!run || run.done) return Promise.resolve();
    var posts = [];
    while (run.answers.length < run.cards.length) {
      var c = run.cards[run.answers.length];
      var right = run.answers.length !== run.cards.length - 1;
      var call = callFor(c, right);
      run.answers.push({ id: c.id, call: call, right: right });
      posts.push(api('/api/quick/answer', { sid: A.state.sid, run_id: run.id, item_id: c.id, call: call }).catch(function () {}));
    }
    run.done = true;
    try { localStorage.setItem('litmus-quick-' + A.state.sid, JSON.stringify(run)); } catch (e) { /* ignore */ }
    return Promise.all(posts).then(function () { window.LitmusQuick.render($('#main')); return waitFor(function () { return q('qcSummary'); }); });
  }

  /* ------------------------------------------------------------ task helpers */
  function ensureTask() {
    if (cf() || $('#task-title')) return Promise.resolve();
    return useTour().then(function () { App().go('task', 0); return waitFor(function () { return q('taskStart') || q('suggest'); }); });
  }
  function taskNow() { var A = App(), r = A.route(); var ts = (A.state.session || {}).tasks || []; return ts[(r && r.index) || 0] || ts[0]; }
  function waitReply(before) { return waitFor(function () { return aiCount() > before; }, 15000); }
  // Step "ask": the question the screen suggests (read from its button), typed into the box at an even rate with
  // the student's own context in front of it, then sent. The reply is revealed line by line (watchReplies).
  var CONTEXT = 'I’m in Year 12. ';
  function askTyped() {
    var before = aiCount();
    var sg = q('suggest'), box = q('chatInput');
    var text = sg ? (sg.getAttribute('data-suggest') || sg.textContent || '').trim() : '';
    if (!box || !text) { press(sg); return waitReply(before); }
    return spot(composer(), cf() ? null : undefined).then(function () { return typeInto(box, CONTEXT + text); }).then(function () {
      return sleep(500);
    }).then(function () {
      var f = $('#chat-form');
      if (f) f.requestSubmit();
      keepFocus();
      return waitReply(before);
    });
  }
  // The decision the made-up student makes on this task, worked out by the server from the task's own data.
  function decide() {
    var t = taskNow();
    var plan;
    var got = PRE && PRE.plan && PRE.plan.task_id === t.id ? Promise.resolve(PRE.plan) : api('/api/demo/tour/plan', { sid: App().state.sid, task_id: t.id });
    return got.then(function (p) {
      plan = p;
      var cb = q('checkBack');
      if (cb) { press(cb); return transitionEnd(q('sheet'), 500).then(function () { return sleep(300); }); }
      return null;
    }).then(function () {
      if (!cf()) return null;
      return waitFor(function () { return q('decide'); }).then(function (d) {
        return spot(d, null).then(function () { return sleep(900); }).then(function () {
          press(d);
          return waitFor(function () { return q('choice', plan); });
        }).then(function () { return transitionEnd(q('sheet'), 600); });
      });
    }).then(function () {
      var ch = q('choice', plan) || q('oldChoice', plan);
      return spot($('#sheet-panel') || ch, cf() ? null : undefined).then(function () { return sleep(800); }).then(function () { press(ch); return sleep(600); });
    }).then(function () {
      (plan.tags || []).forEach(function (tg) {
        var chip = q('tag', { tag: tg });
        if ((!chip || chip.closest('[hidden]')) && q('moreReasons') && !q('moreReasons').hidden) { press(q('moreReasons')); chip = q('tag', { tag: tg }); }   // ui_audit C2: a reason behind "More reasons" is opened first, as a visible tap
        if (chip && chip.getAttribute('aria-pressed') !== 'true') press(chip);
      });
      var r = q('reason');
      if (!r) return null;
      return spot(r, cf() ? null : undefined).then(function () { return typeInto(r, plan.reason); });
    }).then(function () { keepFocus(); return sleep(500); }).then(function () {
      var sn = q('sheetNext'); if (sn) press(sn);
      return waitFor(function () { return q('conf', { n: plan.confidence }) || q('oldConf', { n: plan.confidence }); });
    }).then(function (c) {
      var target = $('.cf-crow5') || $('.conf') || c;
      return spot(target, target).then(function () { return sleep(600); }).then(function () { press(c); });
    });
  }

  /* ------------------------------------------------------------ teacher helpers */
  function tourRow() {
    var code = ss('litmus-demo-code');
    return $all('table.grid tbody tr').filter(function (tr) { var th = tr.querySelector('th'); return th && code && th.textContent.trim() === code; })[0] || null;
  }
  // Opened straight at a teacher step (a link with step=12 and so on), the made-up student may not be there yet.
  // Do its set once through the same API (filled from the tasks' own data, then the score), and reload.
  function ensureTour() {
    var row = tourRow();
    if ((row && row.querySelector('.flag')) || row || ss('litmus-demo-ensured')) return Promise.resolve(false);
    ss('litmus-demo-ensured', '1');
    var sid;
    return api('/api/demo/tour/start', {}).then(function (s) {
      sid = s.session_id;
      ss('litmus-demo-code', s.student_code);
      ss('litmus-demo-class', s.class_code);
      return api('/api/demo/tour/fill', { sid: sid });
    }).then(function () { return api('/api/score', { sid: sid }); })
      .then(function () { ss('litmus-demo-sid', sid); location.reload(); return true; }, function () { return false; });
  }
  function teacherReady() {
    return waitFor(function () { return q('tGrid') || q('tLogin'); }, 15000).then(function (el) {
      if (el !== q('tLogin')) return ensureTour().then(function (reloading) { return reloading ? new Promise(function () {}) : el; });
      var code = params.get('code');
      if (code && !teacherReady.tried) {
        teacherReady.tried = true;
        $('#code').value = code;
        $('#login').requestSubmit();
        return waitFor(function () { return q('tGrid'); }, 8000).then(function (g) {
          return ensureTour().then(function (reloading) { return reloading ? new Promise(function () {}) : g; });
        }, function () { return needLogin(); });
      }
      return needLogin();
    });
  }
  function needLogin() {
    setCaption('Sign in with the teacher code, then press Next.');
    pause();
    revealPage();
    return waitFor(function () { return q('tGrid'); }, Infinity);
  }

  /* ------------------------------------------------------------ the steps
     Captions: at most eight plain words. A caption that says a number is a function that reads it from the app.
     result: the step ends on a result (a verdict, a finding, the summary, the score), held for PACE.RESULT_STILL. */
  var STEPS = [
    { page: 'student', chapter: 'Start', title: 'Two parts, in order',
      caption: 'Two parts: a quick check, then tasks.',
      act: function () {
        clearOld();
        App().reset();
        if (view() !== 'start') location.hash = '#/start'; else App().render();
        return waitFor('#hero-h').then(function () {
          preP = null; PRE = null;   // a fresh made-up student each time the demo starts over
          preload();   // fetched now, used from step 2: no step waits on the network
          var list = q('firstChoices');
          return toTop().then(function () { return spot(list && list.classList.contains('mode-list') ? list : [list, q('firstNext')], null); });
        });
      } },
    { page: 'student', chapter: 'Quick check', title: 'A card, a right call', result: true,
      caption: function () { var k = qcSize(); return (k ? n(k, 'card', 'cards') + '. ' : '') + 'Trust the AI, or not?'; },
      act: function () {
        return useTour().then(function () { App().go('quick'); return waitFor(cardReady, 15000); }).then(function () {
          return toTop();
        }).then(function () { return spot(q('qcCard'), null); }).then(function () { return sleep(1400); })
          .then(function () { return answerCard(true); })
          .then(function (r) { if (r) return spot([q('qcCard'), r.verdict], q('qcCard')); });
      } },
    { page: 'student', chapter: 'Quick check', title: 'A wrong call', result: true,
      caption: 'A wrong call shows you the clue.',
      act: function () {
        return ensureQuick().then(nextCard).then(function () { return spot(q('qcCard'), null); }).then(function () { return sleep(1200); })
          .then(function () { return answerCard(false); })
          .then(function (r) { if (r) return spot(r.verdict, r.verdict); });
      } },
    { page: 'student', chapter: 'Quick check', title: 'Why?', result: true,
      caption: function () { return whyOn() ? 'Why? Tap the clue you spotted.' : 'Every call comes with the reason.'; },
      act: function () {
        // The next card. On a copy with "Why?" on, the made-up student's run has its first "Why?" card here (card 3).
        return ensureQuick().then(nextCard).then(function () { return spot(q('qcCard'), null); }).then(function () { return sleep(1200); })
          .then(function () { return answerCard(true); })
          .then(function (r) { if (r) return spot(r.verdict, r.verdict); });
      } },
    { page: 'student', chapter: 'Quick check', title: 'The summary', result: true,
      caption: 'Keep doing this. Work on that.',
      act: function () {
        return ensureQuick().then(finishRun).then(function () { return toTop(); }).then(function () {
          return spot([q('qcSummary'), q('qcKeepWork')], q('qcSummary'), 'top');
        });
      } },
    { page: 'student', chapter: 'Tasks', title: 'Tasks: the start',
      caption: 'Three steps: ask, test it, decide.',
      act: function () {
        var go = q('qcToTasks');
        var open = go ? (press(go), Promise.resolve()) : useTour().then(function () { App().go('task', 0); });
        return open.then(function () { return waitFor(function () { return q('taskStart') || q('suggest'); }, 15000); }).then(function (el) {
          return toTop().then(function () { return spot(q('taskStart') || el, null); });
        });
      } },
    { page: 'student', chapter: 'Tasks', title: 'Tasks: ask',
      caption: 'The AI answers. Is it right?',
      act: function () {
        return ensureTask().then(function () {
          var go = q('taskStartGo'); if (go) press(go);
          return waitFor(function () { return q('suggest') || q('chatInput') || aiCount() > 0; });
        }).then(function () { return aiCount() ? null : askTyped(); }).then(function () { return spot(lastReply()); });
      } },
    { page: 'student', chapter: 'Tasks', title: 'Tasks: test the source',
      caption: 'Ask the AI for its source.',
      act: function () {
        var before = aiCount();
        return waitFor(function () { return q('sourceMove'); }).then(function (b) {
          return spot(b).then(function () { return sleep(1000); }).then(function () {
            press(b);
            // The older task screen (chat-first off): the button only adds the question to the box; send it.
            if (b.hasAttribute('data-build')) { var f = $('#chat-form'); if (f) { f.requestSubmit(); keepFocus(); } }
            return waitReply(before);
          });
        }).then(function () { return spot(lastReply()); });
      } },
    { page: 'student', chapter: 'Tasks', title: 'Tasks: check outside the AI', result: true,
      caption: 'Check it yourself, outside the AI.',
      act: function () {
        if (!cf()) {
          var ob = q('checkGo');
          return spot(ob).then(function () { return sleep(800); }).then(function () {
            if (ob.getAttribute('aria-expanded') !== 'true') press(ob);
            return spot(q('checkResult'));
          });
        }
        return waitFor(function () { return q('checkOpen'); }).then(function (c) {
          return spot(c).then(function () { return sleep(800); }).then(function () {
            press(c);
            return waitFor(function () { return q('checkGo'); });
          }).then(function (o) { return transitionEnd(q('sheet'), 600).then(function () { return o; }); });
        }).then(function (o) {
          return spot(o, null).then(function () { return sleep(1000); }).then(function () {
            press(o);
            return waitFor(function () { return q('checkResult'); });
          });
        }).then(function (box) { return spot(box, null); });
      } },
    { page: 'student', chapter: 'Tasks', title: 'Tasks: decide',
      caption: 'Decide, then say why.',
      act: function () { return decide(); } },
    { page: 'student', chapter: 'Tasks', title: 'The score', result: true,
      caption: function () { var k = setSize() - 1; return k > 0 ? n(k, 'more task', 'more tasks') + ', then one score.' : 'Then one score.'; },
      act: function () {
        var A = App();
        var t = taskNow();
        A.onTaskSaved = function () { return false; };
        return spot(q('save'), cf() ? null : undefined).then(function () { return sleep(600); }).then(function () {
          press(q('save'));
          return waitFor(function () { return A.state.session.done.indexOf(t.id) >= 0; });
        }).then(function () {
          A.onTaskSaved = null;
          return api('/api/demo/tour/fill', { sid: A.state.sid });
        }).then(function () { return api('/api/score', { sid: A.state.sid }); }).then(function (res) {
          return A.refresh().then(function () { A.showResults(res); });
        }).then(function () { return waitFor(function () { return q('score'); }); }).then(function () {
          return toTop();
        }).then(function () { return spot([q('score')], q('score')); });
      } },
    { page: 'teacher', chapter: 'Teacher', title: 'The class',
      caption: 'The teacher sees the whole class.',
      act: function () {
        return teacherReady().then(function () {
          var c = $('#close-drawer'); if (c) press(c);
          revealPage();
          return toTop().then(function () { return spot(q('tClassCard'), null); });   // hold=1 (the film) ends here too
        });
      } },
    { page: 'teacher', chapter: 'Teacher', title: 'One student',
      caption: 'One click shows a student’s steps.',
      act: function () {
        return teacherReady().then(function () {
          revealPage();
          if (q('tStudentH')) return null;
          var row = tourRow();
          var b = row ? row.querySelector(SEL.tStudentBtn) : $(SEL.tStudentBtn);
          return spot(row || b).then(function () { return sleep(900); }).then(function () {
            press(b);
            return waitFor(function () { return q('tStudentH'); });
          }).then(function (h) { return transitionEnd(h.closest('section') || h, 600); });
        }).then(function () {
          var first = $('#drawer details');
          if (first) first.open = true;
          var sec = q('tStudentH').closest('section');
          return spot(sec, sec, 'top');
        });
      } },
    { page: 'teacher', chapter: 'Teacher', title: 'Safeguarding',
      caption: 'Messages needing care go to a person.',
      act: function () {
        return teacherReady().then(function () {
          revealPage();
          var c = $('#close-drawer');
          var closed = c ? (press(c), transitionEnd($('#drawer'), 500)) : Promise.resolve();
          return closed.then(function () {
            var sec = q('tSafe');
            return spot([q('tSafeBanner', null, sec), q('tSafeItem', null, sec)], $('#sg-h') || sec, 'top');
          });
        });
      } }
  ];
  function capText(s) { try { return typeof s.caption === 'function' ? s.caption() : s.caption; } catch (e) { return ''; } }
  var LAST = STEPS.length - 1;
  // The chapters, in the order the steps give them, each as wide as its share of the steps.
  var CHAPTERS = (function () {
    var out = [];
    STEPS.forEach(function (s, k) {
      var c = out[out.length - 1];
      if (!c || c.name !== s.chapter) out.push({ name: s.chapter, start: k, n: 1 }); else c.n++;
    });
    return out;
  })();

  /* ------------------------------------------------------------ the end card (shown after the last step) */
  function showEnd() {
    if ($('.demo-end')) return;
    clearSpot();
    var d = document.createElement('section');
    d.className = 'demo-end';
    d.setAttribute('aria-labelledby', 'demo-end-h');
    d.innerHTML = '<div class="demo-end-inner">' +
      '<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><g transform="rotate(18 14 14)"><rect x="9" y="1.5" width="10" height="25" rx="1.6" fill="#FFFEFA"/><rect x="9" y="11" width="10" height="5.2" fill="#C93C56"/><rect x="9" y="16.2" width="10" height="5.2" fill="#6B3FA0"/><path d="M9 21.4h10v3.5a1.6 1.6 0 0 1-1.6 1.6h-6.8A1.6 1.6 0 0 1 9 24.9z" fill="#2E3A97"/><rect x="9" y="1.5" width="10" height="25" rx="1.6" fill="none" stroke="#17172B" stroke-width="1.5"/></g></svg>' +
      '<h2 id="demo-end-h">Litmus</h2><p class="lede">Help people judge when to trust AI, and show why.</p>' +
      '<p class="demo-track"><b>Track 1: Beneath the Surface: Defining and Assessing AI Literacy</b></p>' +
      '<div class="row"><a class="btn" href="./?demo=1">Watch again</a><a class="btn secondary" href="./">Try Litmus yourself</a></div></div>';
    document.body.appendChild(d);
    if (!REDUCED && d.animate) d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
    window.scrollTo(0, 0);
  }
  function hideEnd() { var d = $('.demo-end'); if (d) d.remove(); }

  /* ------------------------------------------------------------ the caption bar */
  function buildBar() {
    var bar = document.createElement('section');
    bar.id = 'demo-bar';
    bar.className = 'demo-bar';
    bar.setAttribute('aria-label', 'Guided demo');
    bar.innerHTML =
      // The chapters, each as wide as its share of the steps, with its own line that fills as the demo goes.
      '<div class="demo-progress" aria-hidden="true">' + CHAPTERS.map(function (c) {
        return '<span class="demo-ch" style="flex:' + c.n + '"><span class="demo-ch-name">' + c.name + '</span><span class="demo-ch-line"><i></i></span></span>';
      }).join('') + '</div>' +
      '<div class="demo-inner">' +
        '<div class="demo-text">' +
          '<p class="demo-count"><span id="demo-count"></span><span class="demo-chapter" id="demo-chapter"></span><span class="demo-title" id="demo-title"></span>' +
            '<button type="button" class="demo-cap-toggle" id="demo-cap-toggle" aria-expanded="true" aria-controls="demo-caption">Hide caption</button></p>' +
          '<p class="demo-caption" id="demo-caption" aria-live="polite"></p>' +
        '</div>' +
        '<div class="demo-controls">' +
          '<button type="button" class="btn quiet small" id="demo-back">Back</button>' +
          '<button type="button" class="btn secondary small demo-play" id="demo-play" aria-pressed="false"><span class="demo-play-i" aria-hidden="true"></span><span class="demo-play-t">Play</span></button>' +
          '<button type="button" class="btn small" id="demo-next">Next</button>' +
          '<button type="button" class="btn quiet small demo-more-btn" id="demo-more" aria-expanded="false" aria-controls="demo-keys" aria-label="More about this demo">?</button>' +
          '<button type="button" class="btn quiet small" id="demo-exit"><span>Exit<span class="demo-hide-phone"> demo</span></span></button>' +
        '</div>' +
      '</div>' +
      '<p class="demo-keys" id="demo-keys" hidden>Keys: Right arrow for next, Left arrow for back, P to play or pause, Escape to exit. Any other key, or a click on the page, pauses.</p>';
    var skip = $('.skip-link');
    if (skip && skip.nextSibling) document.body.insertBefore(bar, skip.nextSibling); else document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('demo-on');
    $('#demo-next').addEventListener('click', function () { pause(); next(); });
    $('#demo-back').addEventListener('click', function () { pause(); back(); });
    $('#demo-play').addEventListener('click', function () { if (playing) pause(); else play(); });
    $('#demo-exit').addEventListener('click', exit);
    $('#demo-more').addEventListener('click', function () { var k = $('#demo-keys'), on = k.hidden; k.hidden = !on; bar.classList.toggle('more-on', on); this.setAttribute('aria-expanded', on ? 'true' : 'false'); });
    // On a phone the caption can be put away, so more of the app shows. The choice lasts for the demo.
    $('#demo-cap-toggle').addEventListener('click', function () { showCaption(bar.classList.contains('cap-off')); });
    if (ss('litmus-demo-cap') === 'off') showCaption(false);
    buildScrim();
    bar.addEventListener('focusin', function (e) { if (e.target.tagName === 'BUTTON') barFocus = e.target; });
    document.addEventListener('focusin', function (e) { if (!bar.contains(e.target) && !(e.target.closest && e.target.closest('.demo-end'))) { if (!acting) barFocus = null; } });
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); pause(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); back(); }
      else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); if (playing) pause(); else play(); }
      else if (e.key === 'Escape') { exit(); }
      else if (e.key !== 'Tab' && e.key !== 'Shift') { pause(); }   // any other key pauses autoplay
    });
    // A real click or tap on the page (not on the caption bar) pauses autoplay. The demo's own presses are
    // el.click() calls, which fire no pointer event, so they never pause it.
    document.addEventListener('pointerdown', function (e) {
      if (e.isTrusted && !(e.target.closest && e.target.closest('#demo-bar, .demo-end'))) pause();
    }, true);
    var measure = function () { document.documentElement.style.setProperty('--demo-h', bar.offsetHeight + 'px'); };
    measure();
    window.addEventListener('resize', measure);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(bar);
  }
  function setCaption(text) { $('#demo-caption').textContent = text; }
  function showCaption(on) {
    var bar = $('#demo-bar'), b = $('#demo-cap-toggle');
    bar.classList.toggle('cap-off', !on);
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    b.textContent = on ? 'Hide caption' : 'Show caption';
    ss('litmus-demo-cap', on ? null : 'off');
  }
  function updateBar() {
    var s = STEPS[cur];
    $('#demo-count').textContent = 'Step ' + (cur + 1) + ' of ' + STEPS.length;
    $('#demo-title').textContent = s.title;
    setCaption(capText(s));
    var chapters = $all('.demo-ch');
    CHAPTERS.forEach(function (c, k) {
      var done = Math.max(0, Math.min(c.n, cur + 1 - c.start));
      var now = cur >= c.start && cur < c.start + c.n;
      chapters[k].querySelector('.demo-ch-line i').style.width = (done / c.n * 100) + '%';
      chapters[k].classList.toggle('now', now);
      if (now) $('#demo-chapter').textContent = c.name;
    });
    $('#demo-back').disabled = cur <= 0;
    $('#demo-next').disabled = cur >= LAST && !!$('.demo-end');
    var pb = $('#demo-play');
    // Playing: the button reads "Pause" with a pause sign, so it is plain the demo is running and how to stop it.
    pb.querySelector('.demo-play-t').textContent = playing ? 'Pause' : (cur >= LAST ? 'Replay' : 'Play');
    pb.classList.toggle('is-playing', playing);
    pb.setAttribute('aria-pressed', playing ? 'true' : 'false');
    pb.setAttribute('aria-label', playing ? 'Pause the demo' : (cur >= LAST ? 'Play the demo again from the start' : 'Play the demo'));
  }

  /* ------------------------------------------------------------ moving between steps */
  function revealPage() { document.documentElement.classList.remove('demo-enter'); }
  // Leave for the other page: the screen fades out first, so the new page fades in from the same calm colour.
  function leaveTo(url) {
    if (REDUCED) { location.href = url; return; }
    document.documentElement.classList.add('demo-leave');
    setTimeout(function () { location.href = url; }, PACE.FADE_MS);
  }
  function navigateTo(i) {
    if (STEPS[i].page === 'teacher') leaveTo(teacherUrl(i + 1));
    else leaveTo('./?demo=1&step=' + (i + 1) + (playing ? '&play=1' : '') + keep());
  }
  var marks = window.__demoMarks = [];
  var io = {
    caption: function (i) {
      cur = i;
      if (i < LAST) hideEnd();
      document.documentElement.dataset.demoReady = '';
      updateBar();
    },
    act: function (i) {
      var p = Promise.resolve().then(function () { return STEPS[i].act(); }).then(function () { return allSettled(); }, function (e) {
        playing = false;
        updateBar();
        showCaption(true);
        setCaption(capText(STEPS[i]) + ' (' + (e && e.message ? e.message : 'The page did not answer.') + ' Press Next to try again.)');
        revealPage();
      });
      acting = p;
      return p.then(function () { acting = null; keepFocus(); });
    },
    ready: function (i) {
      revealPage();
      if (CLEAN) { window.scrollTo(0, 0); var ae = document.activeElement; if (ae && ae.blur) ae.blur(); var tt = document.getElementById('toast'); if (tt) tt.hidden = true; }
      document.documentElement.dataset.demoReady = String(i + 1);
    },
    hold: function (i, ms) { return holdFor(capText(STEPS[i]), ms, STEPS[i].result); },
    held: function (i) {
      if (!playing) return;
      if (i < LAST) goTo(i + 1); else { playing = false; showEnd(); updateBar(); }
    },
    mark: function (what, i, t) { marks.push({ what: what, step: i + 1, t: t }); }
  };
  function goTo(i) {
    if (STEPS[i].page !== PAGE) { RUN.cancel(); navigateTo(i); return; }
    RUN.run(i);
  }
  // Stop the step on screen cleanly: its timers are cancelled, and an action still moving finishes at once.
  function stopStep() {
    RUN.cancel();
    if (!acting) return Promise.resolve();
    hurry = true;
    return acting.then(function () { hurry = false; }, function () { hurry = false; });
  }
  // Rebuild the state up to step i quickly (hidden under a fade), then act step i out. Used for Back and ?step=N.
  function jumpTo(i) {
    return stopStep().then(function () {
      if (PAGE === 'teacher' && STEPS[i].page === 'teacher') return RUN.run(i);
      // 20 Nov 2026: a step on the other page (a link such as ?demo=1&step=12) goes to that page; the teacher page
      // opens the read-only demo class and makes the demo student there if it is missing (ensureTour).
      if (STEPS[i].page !== PAGE) { navigateTo(i); return null; }
      var lastStudent = -1;
      STEPS.forEach(function (s, k) { if (s.page === 'student' && k < i) lastStudent = k; });
      if (lastStudent < 0) return RUN.run(i);
      document.documentElement.classList.add('demo-enter');
      hurry = true;
      var chain = Promise.resolve();
      for (var k = 0; k <= lastStudent; k++) {
        (function (k) { chain = chain.then(function () { cur = k; updateBar(); return STEPS[k].act(); }); })(k);
      }
      acting = chain;
      return chain.then(function () { hurry = false; acting = null; moving = []; return RUN.run(i); },
        function (e) { hurry = false; acting = null; revealPage(); setCaption('The demo could not set up this step: ' + e.message); });
    });
  }
  var busy = false;   // one step change at a time, however fast the keys are pressed
  function next() {
    if (busy) return;
    if (cur >= LAST) { stopStep(); playing = false; showEnd(); updateBar(); return; }
    busy = true;
    stopStep().then(function () { busy = false; goTo(cur + 1); });
  }
  function back() {
    if (cur <= 0 || busy) return;
    busy = true;
    var target = cur - 1;
    if ($('.demo-end')) { hideEnd(); }
    jumpTo(target).then(function () { busy = false; }, function () { busy = false; });
  }
  function play() {
    if (cur >= LAST && $('.demo-end')) { playing = true; leaveTo('./?demo=1&play=1' + keep()); return; }
    playing = true;
    updateBar();
    // A step already acted out moves on after a short stillness; one still acting moves on when its hold ends.
    if (!acting) { RUN.cancel(); RUN.later(PACE.STILL).then(function () { io.held(cur); }, function () {}); }
  }
  function pause() { if (!playing) return; playing = false; updateBar(); }
  function exit() {
    RUN.cancel(); playing = false;
    // cp_11a: no demo state left behind (the open demo's sign-in and its class).
    try { var t = sessionStorage.getItem('litmus-teacher'); if (t && t.indexOf('od-') === 0) { sessionStorage.removeItem('litmus-teacher'); sessionStorage.removeItem('litmus-class'); } } catch (e) {}
    location.href = './';
  }

  /* ------------------------------------------------------------ start */
  function start() {
    buildBar();
    watchScreens();
    watchReplies();
    RUN = Runner({ setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (id) { clearTimeout(id); }, now: function () { return Date.now(); } }, io);
    var want = parseInt(params.get('step') || '1', 10);
    if (!(want >= 1 && want <= STEPS.length)) want = 1;
    var i = want - 1;
    if (PAGE === 'teacher') {
      if (STEPS[i].page !== 'teacher') { navigateTo(i); return; }
      RUN.run(i);
      return;
    }
    App().ready.then(function () {
      if (i === 0) RUN.run(0); else jumpTo(i);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
