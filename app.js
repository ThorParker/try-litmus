/* Litmus student app. Plain JavaScript, no build step.
   Views: start (consent), task (chat + decision), results, trail, next. Hash routing, no page reloads. */
(function () {
  'use strict';

  // The build name: change it with the cache name in sw.js, so a phone can be checked for the new copy.
  var BUILD = '2026-11-20.30f';
  var CFG = window.LITMUS_CONFIG || {};
  var API = String(CFG.apiBase || '').replace(/\/$/, '');
  var params = new URLSearchParams(location.search);
  // Guided demo (?demo=1, driven by demo.js): a separate made-up student; the real saved session is left alone.
  var DEMO = params.get('demo') === '1';
  // One-tap join link (/?join=EXPO): the class comes from the link, the server makes a code.
  var JOIN = DEMO ? null : (/^[A-Za-z0-9-]{3,20}$/.test(params.get('join') || '') ? params.get('join').toUpperCase() : null);

  var S = {
    sid: null, session: null, rubric: null, status: null, results: null, trail: null,
    shortView: params.get('full') !== '1', openWhy: {}, online: navigator.onLine, coach: [], installEvent: null
  };
  if (params.get('why')) S.openWhy[params.get('why')] = true;

  /* ---------------------------------------------------------------- helpers */
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
  // The device copy (19 Nov 2026): every item Litmus keeps in this browser starts with 'litmus'.
  function litmusKeys(prefix) {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); } } catch (e) { /* storage blocked */ }
    return out;
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 5200);
  }

  // Tap feedback (19 Nov 2026, tools/TAP_RULE.txt): every tap answers where the thumb is.
  // tapBusy: a network wait shows on the control itself (a spinner beside its own words, disabled) until it is undone.
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
  // tapNote: something the student must know stays beside the control (the toast still shows, as an extra).
  function tapNote(el, text) {
    toast(text);
    if (!el || !el.isConnected) return;
    var host = el.closest('form') || el;
    var p = host.nextElementSibling;
    if (!p || !p.classList.contains('tap-note')) { p = document.createElement('p'); p.className = 'tap-note'; p.setAttribute('role', 'alert'); host.insertAdjacentElement('afterend', p); }
    p.textContent = text;
    p.scrollIntoView({ block: 'nearest' });
  }

  var ICON = {
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0L6 7zM18 7l-3 7a3 3 0 0 0 6 0l-3-7z"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    chev: '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    trust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',   // 20 Nov 2026: a cross on "The AI is wrong", as in the card game
    verify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8M9 2.5h6v3H9z"/><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M8.5 13l2.5 2.5 4.5-5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4M6 5h11l-2.2 3.5L17 12H6"/></svg>'
  };
  // Text cut, 16 Nov 2026 (TEXT_CUT_2026-11-16.md): one job per screen, and the detail behind one
  // labelled "More" control, closed by default. The button says what it opens; the detail stays in the
  // page (hidden), so read-aloud reaches it once it is open and nothing true is lost.
  // Calm copy, 16 Nov 2026: `name` (optional) is the button's full accessible name when the visible label
  // is the one word "More"; it starts with the visible word, so speech users can say what they see.
  function more(id, label, inner, cls, name) {
    return '<div class="more' + (cls ? ' ' + cls : '') + '"><button type="button" class="more-btn" data-disclose aria-expanded="false" aria-controls="' + id + '"' + (name ? ' aria-label="' + esc(name) + '"' : '') + '><span>' + label + '</span>' + ICON.chev + '</button>' +
      '<div class="more-body" id="' + id + '" hidden>' + inner + '</div></div>';
  }
  // The five topics, always in this order, each with one short line.
  var TOPIC_LINE = {
    how_ai_works: 'What a chatbot is, and its limits.',
    using_well: 'When to use it, and how to ask.',
    checking: 'Checking answers against real sources.',
    ethics: 'Rules, personal data, and fakes.',
    creating: 'Better work, in your own voice.'
  };
  function topicsPlain(areas, hid) {
    return '<section class="topics" aria-labelledby="' + hid + '"><h3 id="' + hid + '">Topics</h3><ol class="topic-rows">' + areas.map(function (a) {
      return '<li><b class="t-name">' + esc(a.name) + '</b><span class="t-line">' + esc(TOPIC_LINE[a.id] || '') + '</span></li>';
    }).join('') + '</ol></section>';
  }
  // Short words on the decision cards and the reason chips. The full wording stays in the rubric,
  // in the Decision Trail, and in each chip's tooltip.
  // 19 Nov 2026 (one clear answer): two verdicts on the answer; "Check it first" is the step before them, not an answer.
  // 20 Nov 2026 (owner, as in the card game): each verdict names its subject, the AI: "The AI is right" / "The AI is wrong".
  var CHOICE_HELP = { trust: 'Use its answer.', question: 'Change or reject its answer.', verify: 'Look it up outside the AI.' };
  // 19 Nov 2026 (testers): each choice says what it means under its label, before any tap.
  var CHOICE_CAP = { trust: 'Use its answer.', question: 'Change or reject its answer.', verify: 'Look it up outside the AI.' };
  function choiceCap(id) { return CHOICE_CAP[id] ? '<span class="cf-cap">' + CHOICE_CAP[id] + '</span>' : ''; }
  var TAG_SHORT = {
    fake_source: 'Source may not be real', numbers_wrong: 'Numbers do not add up', fact_wrong: 'Fact or date looks wrong',
    bias: 'One-sided or unfair', personal_data: 'Asks for personal info', rules: 'Could break the rules',
    matches_known: 'Matches what I know', not_my_voice: 'Not true of me or my voice', image_signs: 'Made or changed by AI',
    needs_check: 'Check a trusted source first'
  };
  function cells(level) {
    var out = '<span class="cells" aria-hidden="true">';
    for (var i = 1; i <= 3; i++) out += '<i class="' + (level && i <= level ? 'c' + i : '') + '"></i>';
    return out + '</span>';
  }
  function dots(n) {
    var out = '<span class="dots" aria-hidden="true">';
    for (var i = 1; i <= 5; i++) out += '<b class="' + (n && i <= n ? 'on' : '') + '"></b>';
    return out + '</span>';
  }
  var CHOICE_NAMES = { trust: 'The AI is right', question: 'The AI is wrong', verify: 'Chose to check' };
  // One cell per task. Every cell is the same paper: the decision is an icon and a word, never a
  // colour, so "The AI is right" cannot be read as a warning or as Level 1.
  var CHOICE_WORDS = { trust: 'AI right', question: 'AI wrong', verify: 'Checked' };   // "verify": older sets only
  // The score, explained (19 Nov 2026, team lead): one word, "Explain", opens the parts in place and becomes "Hide".
  // Each row: a mark (a tick in a circle for full points, a cross in a circle for points lost: told apart by shape, not
  // only colour), the part, its points, and at most six words on why. The rows add up to the number (scoring.breakdown).
  var BD_MARK = {
    full: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lost: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>',
    mid: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><circle class="bd-dot" cx="12" cy="12" r="4" fill="#fff"/></svg>'
  };
  // Good news first: tick (good), amber dot "Nearly" (mid), cross (low), on the level lines (score_parts.js marked()).
  var MARK_ICON = { good: 'full', mid: 'mid', low: 'lost' };
  var MARK_SAY = { good: 'Strong. ', mid: 'Nearly. ', low: 'Needs work. ' };
  function markedRows(rows) {
    var L = window.LitmusScore;
    if (L && L.setLines && S.rubric) L.setLines(S.rubric.levels);
    return L && L.marked ? L.marked(rows) : rows;
  }
  function markHtml(m) {
    return '<span class="sx-bd-i">' + BD_MARK[MARK_ICON[m] || 'full'] + '<span class="visually-hidden">' + (MARK_SAY[m] || '') + '</span></span>';
  }
  function workHtml(r, cls) { return r.work ? '<li class="' + cls + ' sx-work"><b>Work on this:</b> ' + esc(r.work) + '</li>' : ''; }
  function explainOpen(id) { return DEMO || !!(S.explainOpen || {})[id]; }
  function explainBtn(id) {
    var open = explainOpen(id);
    return '<button type="button" class="btn small quiet sx-explain" data-explain aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + id + '">' + (open ? 'Hide' : 'Explain') + '</button>';
  }
  function bdPts(points, of) { return '<span class="sx-bd-pts"><span aria-hidden="true">' + points + '/' + of + '</span><span class="visually-hidden">' + points + ' of ' + of + '</span></span>'; }
  function breakdownRowsHtml(b) {
    return '<ul class="sx-bd-rows">' + markedRows(b.rows).map(function (r) {
      return '<li class="sx-bd-row is-' + r.mark + '">' + markHtml(r.mark) + '<span class="sx-bd-name">' + esc(r.id === 'no_ai' ? 'On your own' : r.name) + '</span>' +
        bdPts(r.points, r.of) + '<span class="sx-bd-why">' + (r.mark === 'mid' ? '<b class="sx-nearly">Nearly.</b> ' : '') + esc(r.why) + '</span></li>' + workHtml(r, 'sx-bd-work');
    }).join('') + '</ul>' + (b.note ? '<p class="sx-bd-note small muted">' + esc(b.note) + '</p>' : '');
  }
  function breakdownHtml(b, id) {
    return '<div class="sx-bd" id="' + id + '"' + (explainOpen(id) ? '' : ' hidden') + '>' + breakdownRowsHtml(b) + '</div>';
  }
  function trailStrip(items) {
    return '<div class="dt-strip" style="--n:' + items.length + '" role="list" aria-label="Your Decision Trail, one cell per task">' + items.map(function (it) {
      var label = 'Task ' + it.n + ': ' + (it.choice ? CHOICE_NAMES[it.choice] + ', confidence ' + it.confidence + ' of 5' : 'not done yet');
      return '<div class="dt-cell ' + (it.choice || 'todo') + '" role="listitem" aria-label="' + esc(label) + '" title="' + esc(it.title || '') + '"><span class="dt-n">' + it.n + '</span>' + (it.choice ? ICON[it.choice] + '<span class="dt-word">' + CHOICE_WORDS[it.choice] + '</span>' : '') + (it.choice ? dots(it.confidence) : '<span class="small">to do</span>') + '</div>';
    }).join('') + '</div><p class="dt-legend"><span class="t">' + ICON.trust + 'The AI is right</span><span class="q">' + ICON.question + 'The AI is wrong</span>' +
      (items.some(function (it) { return it.choice === 'verify'; }) ? '<span class="v">' + ICON.verify + 'Chose to check</span>' : '') + '<span>Dots: how sure</span></p>';
  }

  /* ---------------------------------------------------------------- network, with an offline queue */
  function api(path, body, method) {
    var opts = { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (data) {
        if (!r.ok) {
          var err = new Error((data && data.error) || 'Something went wrong. Please try again.');
          err.status = r.status;
          throw err;
        }
        setOnline(true);
        return data;
      });
    }, function (e) {
      setOnline(false);
      var err = new Error('You are offline.');
      err.offline = true;
      throw err;
    });
  }
  function outbox() { return store.get('litmus-outbox') || []; }
  function queue(path, body) { var q = outbox(); q.push({ path: path, body: body }); store.set('litmus-outbox', q); }
  function send(path, body) {
    return api(path, body).catch(function (e) {
      if (e.offline) { queue(path, body); return { queued: true }; }
      throw e;
    });
  }
  function flush() {
    var q = outbox();
    if (!q.length) return Promise.resolve();
    var next = q[0];
    return api(next.path, next.body).then(function () {
      var rest = outbox().slice(1);
      store.set('litmus-outbox', rest);
      return flush();
    }, function (e) {
      if (!e.offline) { store.set('litmus-outbox', outbox().slice(1)); return flush(); }
    });
  }
  function setOnline(v) {
    if (S.online === v) return;
    S.online = v;
    renderBanner();
    if (v) flush();
  }
  window.addEventListener('online', function () { setOnline(true); });
  window.addEventListener('offline', function () { setOnline(false); });

  /* ---------------------------------------------------------------- settings */
  // Text size (19 Nov 2026): a percentage from the slider, "100" to "220" (display.js, LitmusTextSize); an older
  // saved name ("normal", "large", "xlarge") becomes its percentage here, so every saved setting still works.
  var TSZ = window.LitmusTextSize || { norm: function (v) { return ({ large: '110', xlarge: '130' })[v] || (/^\d+$/.test(v || '') ? String(v) : '100'); },
    pct: function (v) { return parseInt(this.norm(v), 10); }, band: function (v) { var n = this.pct(v); return n >= 130 ? 'big' : n > 100 ? 'larger' : 'standard'; } };
  var DEFAULTS = { font: 'lexend', size: '100', theme: 'light' };
  function applySettings(s) {
    s = Object.assign({}, DEFAULTS, s || {});
    s.size = TSZ.norm(s.size);
    var h = document.documentElement;
    h.dataset.font = s.font; h.dataset.size = s.size; h.dataset.sizeBand = TSZ.band(s.size); h.dataset.theme = s.theme;
    $('#set-font').value = s.font; $('#set-size').value = s.size; $('#set-theme').value = s.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = (s.theme === 'light' || s.theme === 'cvd') ? '#FFFEFA' : (s.theme === 'dark' ? '#1D1D2B' : '#000000');
    S.settings = s;
    if (window.LitmusDisplay) window.LitmusDisplay.sync();   // the Display panel shows the same choices
  }
  function currentSettings() { return { font: $('#set-font').value, size: $('#set-size').value, theme: $('#set-theme').value }; }
  function saveSettings() {
    var s = currentSettings();
    applySettings(s);
    // When it was chosen (19 Nov 2026): the student app and the teacher view on one device use the newest choice.
    store.set('litmus-settings', Object.assign({ t: Date.now() }, s));
    if (S.session) {
      store.set('litmus-settings-' + S.session.class_code + '-' + S.session.student_code, s);
      send('/api/settings', { sid: S.sid, settings: s });
    }
  }
  ['#set-font', '#set-size', '#set-theme'].forEach(function (id) { $(id).addEventListener('change', saveSettings); });

  /* ---------------------------------------------------------------- speech */
  // 19 Nov 2026 (team lead): a male English voice only, best first; never a woman's voice. No male voice: no Listen.
  var VOICE = (function () {
    var GB_MALE = ['ryan', 'george', 'thomas', 'daniel', 'arthur', 'oliver', 'ollie', 'alfie', 'elliot', 'noah'];
    var US_MALE = ['guy', 'davis', 'tony', 'jason', 'christopher', 'eric', 'roger', 'steffan', 'andrew', 'brian'];
    var FEMALE = ['female', 'sonia', 'libby', 'maisie', 'hazel', 'susan', 'zira', 'aria', 'jenny', 'emma', 'ava', 'michelle',
      'samantha', 'karen', 'moira', 'tessa', 'kate', 'serena', 'fiona', 'martha'];
    function words(v) { return String(v.name || '').toLowerCase().split(/[^a-z]+/).filter(Boolean); }
    function female(v) { var w = words(v); return w.some(function (x) { return FEMALE.indexOf(x) >= 0; }) || /female/i.test(v.name || ''); }
    function natural(v) { return /natural|neural/i.test(v.name || '') ? 0 : 1; }
    function group(v) {
      var lang = String(v.lang || '').replace('_', '-').toLowerCase(), w = words(v);
      if (female(v)) return 9;
      if (lang.indexOf('en-gb') === 0 && /\bmale\b/i.test(v.name || '')) return 0;
      if (lang.indexOf('en-gb') === 0 && w.some(function (x) { return GB_MALE.indexOf(x) >= 0; })) return 1;
      if (lang.indexOf('en-us') === 0 && w.some(function (x) { return US_MALE.indexOf(x) >= 0; })) return 2;
      return 9;
    }
    function pick(list) {
      var ok = (list || []).map(function (v, i) { return { v: v, g: group(v), n: natural(v), i: i }; }).filter(function (x) { return x.g < 9; });
      ok.sort(function (a, b) { return a.g - b.g || a.n - b.n || a.i - b.i; });
      return ok.length ? ok[0].v : null;
    }
    // 19 Nov 2026 (cp_11b): strict. A male voice: speak with it. Voices loaded, none male: silent (the utterance's
    // onerror/onend runs, so its button resets). Voices still loading: wait for voiceschanged or 1.5 s, then the same.
    function strictSpeak(u, synth, raw) {
      var fail = function () { try { if (typeof u.onerror === 'function') u.onerror(new Event('error')); else if (typeof u.onend === 'function') u.onend(new Event('end')); } catch (e) { /* nothing to reset */ } };
      var withMale = function (mv) { u.voice = mv; u.lang = mv.lang; return raw(u); };
      var list = synth.getVoices() || [];
      var mv = pick(list);
      if (mv) return withMale(mv);
      if (list.length) { fail(); return; }
      var done = false;
      var again = function () { if (done) return; done = true; var m2 = pick(synth.getVoices() || []); if (m2) withMale(m2); else fail(); };
      if (synth.addEventListener) synth.addEventListener('voiceschanged', again, { once: true });
      setTimeout(again, 1500);
    }
    return { pick: pick, strictSpeak: strictSpeak };
  })();
  window.LitmusVoice = VOICE;
  function maleVoice() { return 'speechSynthesis' in window ? VOICE.pick(window.speechSynthesis.getVoices()) : null; }
  // Every speak call in the app (Settings' "Try" too) gets the male voice; with none loaded yet, the browser's own.
  if ('speechSynthesis' in window && window.speechSynthesis) {
    var rawSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    var speakMale = function (u) { return VOICE.strictSpeak(u, window.speechSynthesis, rawSpeak); };
    try {
      window.speechSynthesis.speak = speakMale;   // every speak call in the app (Settings' "Try" too) is strict
    } catch (e) { /* read-only: speak() below calls speakMale itself */ }
    window.LitmusSpeakMale = speakMale;
    var checkVoices = function () {
      var all = window.speechSynthesis.getVoices();
      if (all && all.length) document.documentElement.classList.toggle('no-voice', !VOICE.pick(all));
    };
    checkVoices();
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', checkVoices);
  }
  var speaking = null;
  function speak(text, btn) {
    if (!('speechSynthesis' in window)) { tapNote(btn, 'Reading aloud is not available in this browser. Try Chrome, Edge, or Safari.'); return; }
    if (speaking) {
      window.speechSynthesis.cancel();
      var was = speaking; speaking = null;
      resetSpeakBtn(was);
      if (was === btn) return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.rate = S.settings && TSZ.pct(S.settings.size) >= 130 ? 0.9 : 0.95;
    // cp_11b: no lang or voice set here; window.LitmusSpeakMale picks a male voice or stays silent.
    u.onend = u.onerror = function () { if (speaking === btn) { speaking = null; resetSpeakBtn(btn); } };
    speaking = btn;
    btn.setAttribute('aria-pressed', 'true');
    btn.querySelector('span').textContent = 'Stop';
    (window.LitmusSpeakMale || function () {})(u);
  }
  // What Listen reads: the visible text of the area (an opened "More" included), without the buttons' own words.
  function readable(el) {
    var skip = {};
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { var w = b.innerText.trim(); if (w) skip[w] = 1; });
    return el.innerText.split('\n').filter(function (l) { return l.trim() && !skip[l.trim()]; }).join('\n');
  }
  function resetSpeakBtn(btn) { if (!btn) return; btn.setAttribute('aria-pressed', 'false'); var sp = btn.querySelector('span'); if (sp) sp.textContent = 'Listen'; }
  function listenBtn(id, label) {
    return '<button type="button" class="iconbtn" data-speak="' + esc(id) + '" aria-pressed="false" aria-label="' + esc(label || 'Listen: read this aloud') + '">' + ICON.speaker + '<span>Listen</span></button>';
  }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  // On-device speech recognition where the browser has it ready (19 Nov 2026). Asked once; otherwise the browser's default.
  var SR_LOCAL = false, srTold = false;
  try {
    if (SR && typeof SR.available === 'function') SR.available({ langs: ['en-GB'], processLocally: true }).then(function (r) { SR_LOCAL = r === 'available'; }, function () {});
  } catch (e) { /* older browsers: the default service */ }
  // Mic on / Mic off (19 Nov 2026, team lead: "a clear thing saying mic on or mic off"). Off: the mic and "Mic off"
  // beside it. On: the strongest accent with a steady ring, "Mic on" (spoken "Mic on. Tap to stop."), and the line
  // "Listening…" by the box. It switches itself off after eight seconds without speech. No speech recognition in this
  // browser: no microphone at all.
  var MIC_SILENCE_MS = 8000;
  function micBtn(targetId) {
    if (!SR) return '';   // 19 Nov 2026 (read aloud, item 4): no speech recognition here, no microphone
    return '<button type="button" class="iconbtn mic-btn" data-mic="' + esc(targetId) + '" aria-pressed="false" aria-label="Mic off. Speak instead of typing">' + ICON.mic + '<span class="mic-word" aria-hidden="true">Mic off</span></button>';
  }
  function micState(targetId, on) {
    $all('[data-mic="' + targetId + '"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('mic-on', on);
      btn.setAttribute('aria-label', on ? 'Mic on. Tap to stop.' : 'Mic off. Speak instead of typing');
      var w = btn.querySelector('.mic-word'); if (w) w.textContent = on ? 'Mic on' : 'Mic off';
      var host = btn.closest('form, .with-mic') || btn.parentNode;
      var line = host && host.nextElementSibling && host.nextElementSibling.classList.contains('mic-live') ? host.nextElementSibling : null;
      if (on && !line && host) { line = document.createElement('p'); line.className = 'mic-live'; line.setAttribute('role', 'status'); line.textContent = 'Listening…'; host.insertAdjacentElement('afterend', line); }
      if (!on && line) line.remove();
    });
  }
  function dictate(targetId, btn) {
    if (!SR) {
      toast('Voice typing is not available in this browser. Try Chrome, Edge, or Safari, or use the microphone key on your phone keyboard.');
      return;
    }
    if (rec) { rec.stop(); return; }
    var el = document.getElementById(targetId);
    rec = new SR();
    rec.lang = 'en-GB';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    if (SR_LOCAL) { try { rec.processLocally = true; } catch (e) { /* not supported */ } }
    micState(targetId, true);
    srTold = true;
    // Eight seconds without speech switches it off (the countdown waits while someone is speaking).
    var quiet = null, mine = rec;
    var hush = function () { clearTimeout(quiet); quiet = setTimeout(function () { if (rec === mine) rec.stop(); }, MIC_SILENCE_MS); };
    hush();
    rec.onspeechstart = function () { clearTimeout(quiet); };
    rec.onspeechend = hush;
    rec.onresult = function (ev) {
      hush();
      var said = Array.prototype.map.call(ev.results, function (r) { return r[0].transcript; }).join(' ');
      el.value = (el.value ? el.value.replace(/\s+$/, '') + ' ' : '') + said;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dataset.spoken = '1';
      if (S.sid) send('/api/event', { sid: S.sid, task_id: currentTaskId(), type: 'stt_used', data: {} }).catch(function () {});
    };
    rec.onerror = function (e) {
      tapNote(btn.closest('.with-mic') || btn, e.error === 'not-allowed' ? 'Microphone access is blocked. Allow it in your browser settings to use voice typing.' : 'Voice typing stopped. Try again.');
    };
    rec.onend = function () { clearTimeout(quiet); micState(targetId, false); rec = null; };
    try { rec.start(); } catch (e) { clearTimeout(quiet); rec = null; micState(targetId, false); }
  }
  // 19 Nov 2026 (read aloud, item 4): every box where a student types has the microphone where the browser can do it.
  // The Quick check's Discuss box (drawn by quick.js) had none: the same control is added beside it here.
  (function () {
    var m = document.getElementById('main');
    if (!SR || !m || !window.MutationObserver) return;
    new MutationObserver(function () {
      var box = document.getElementById('qc-ask-in');
      if (!box || box.parentNode.querySelector('[data-mic]')) return;
      var t = document.createElement('span');
      t.innerHTML = micBtn('qc-ask-in');
      box.parentNode.insertBefore(t.firstChild, box.parentNode.querySelector('button[type="submit"]'));
    }).observe(m, { childList: true, subtree: true });
  })();

  document.addEventListener('click', function (e) {
    // The skip link lands on the page's main heading, not on the bare main area (19 Nov 2026, keyboard tester).
    var skip = e.target.closest('.skip-link');
    if (skip) {
      var mh = $('#main h1') || $('#main h2');
      if (mh) { e.preventDefault(); if (!mh.hasAttribute('tabindex')) mh.setAttribute('tabindex', '-1'); mh.focus(); mh.scrollIntoView({ block: 'start' }); return; }
    }
    var ex = e.target.closest('[data-explain]');
    if (ex) {
      var box = document.getElementById(ex.getAttribute('aria-controls'));
      if (box) {
        box.hidden = !box.hidden;
        ex.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
        var word = ex.querySelector('.sx-explain-w') || ex;
        word.textContent = box.hidden ? 'Explain' : 'Hide';
        S.explainOpen = S.explainOpen || {}; S.explainOpen[box.id] = !box.hidden;
      }
      return;
    }
    var dis = e.target.closest('[data-disclose]');
    if (dis) {
      var body = document.getElementById(dis.getAttribute('aria-controls'));
      if (body) { body.hidden = !body.hidden; dis.setAttribute('aria-expanded', body.hidden ? 'false' : 'true'); }
      return;
    }
    var sp = e.target.closest('[data-speak]');
    if (sp) {
      var src = document.getElementById(sp.dataset.speak);
      if (src) speak(readable(src), sp);
      if (S.sid && currentTaskId()) send('/api/event', { sid: S.sid, task_id: currentTaskId(), type: 'tts_used', data: {} }).catch(function () {});
      return;
    }
    var pf = e.target.closest('[data-pf]');
    if (pf) { var pop = pf.nextElementSibling; if (pop) { pop.hidden = !pop.hidden; pf.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true'); } return; }
    var mic = e.target.closest('[data-mic]');
    if (mic) { dictate(mic.dataset.mic, mic); return; }
    var nav = e.target.closest('[data-go]');
    if (nav && nav.getAttribute('aria-disabled') === 'true') {
      nav.classList.remove('tap-locked'); void nav.offsetWidth; nav.classList.add('tap-locked');   // the reason, on the tab
      clearTimeout(nav._tapT); nav._tapT = setTimeout(function () { nav.classList.remove('tap-locked'); }, 3500);
      toast(nav.title || 'Not open yet.'); return;
    }
    if (nav && !nav.disabled) { go(nav.dataset.go); }
  });

  /* ---------------------------------------------------------------- install (PWA) */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    S.installEvent = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', function () {
    if (!S.installEvent) return;
    S.installEvent.prompt();
    S.installEvent.userChoice.finally(function () { S.installEvent = null; $('#install-btn').hidden = true; });
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    // A new build: the new service worker takes over just after the page loads from the old copy.
    // Reload once, straight away, so one reload is enough to see the new build. Later than a few
    // seconds (someone may be typing) the page says so instead of reloading.
    var hadController = !!navigator.serviceWorker.controller, bootAt = Date.now();
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || DEMO) return;
      var guard = null;
      try { guard = sessionStorage.getItem('litmus-sw-reloaded'); } catch (e) { /* private mode */ }
      if (Date.now() - bootAt < 10000 && guard !== BUILD) {
        try { sessionStorage.setItem('litmus-sw-reloaded', BUILD); } catch (e) { /* private mode */ }
        location.reload();
      } else {
        toast('A new version of Litmus is ready. Reload the page to use it.');
      }
    });
  }

  /* ---------------------------------------------------------------- routing */
  function go(view, arg) {
    if (view === 'task') {
      var i = arg != null ? arg : firstOpenTask();
      location.hash = '#/task/' + (i + 1);
    } else {
      location.hash = '#/' + view;
    }
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    return { view: parts[0] || 'start', n: parts[1] ? parseInt(parts[1], 10) - 1 : null };
  }
  window.addEventListener('hashchange', function () { render(); });
  window.addEventListener('beforeunload', function (e) {
    if (DEMO) return;
    var r = route();
    if (r.view === 'task' && S.session) {
      var t = S.session.tasks[r.n];
      var st = t && taskState(t.id);
      if (st && !isDone(t.id) && (st.reason || st.choice)) { e.preventDefault(); e.returnValue = ''; }
    }
  });

  function firstOpenTask() {
    if (!S.session) return 0;
    for (var i = 0; i < S.session.tasks.length; i++) if (!isDone(S.session.tasks[i].id)) return i;
    return S.session.tasks.length - 1;
  }
  function isDone(id) { return S.session && S.session.done.indexOf(id) >= 0; }
  function currentTaskId() {
    var r = route();
    if (r.view !== 'task' || !S.session) return null;
    var t = S.session.tasks[r.n];
    return t ? t.id : null;
  }
  function setLabel() {
    if (!S.session) return '';
    if (S.session.set === 'judge' && S.session.round === 1) return 'Short set';
    return S.session.round === 1 ? 'First set' : 'Practice set ' + (S.session.round - 1);
  }
  function isJudge() { return !!(S.session && S.session.set === 'judge' && S.session.round === 1); }

  function updateNav(view) {
    var nav = $('#nav');
    nav.hidden = !S.session;
    if (!S.session) return;
    var hasResults = S.session.has_results || S.session.round > 1;
    var anyDone = S.session.done.length > 0 || S.session.round > 1 || !!(practiceOn() && S.session.practice && S.session.practice.started);
    $all('.navbtn', nav).forEach(function (b) {
      var g = b.dataset.go;
      b.disabled = false;
      // cp_9 (tester: "Results is grey, cannot use. Nobody told me."): still greyed, but a tap or hover says when it opens.
      // Tap feedback: the Decision Trail before any task is locked the same way (it was a dead, disabled tap).
      var lockTrail = g === 'trail' && !anyDone;
      var locked = ((g === 'results' || g === 'next') && !hasResults) || lockTrail;
      if (locked) { b.setAttribute('aria-disabled', 'true'); b.title = 'Opens after task ' + (lockTrail ? 1 : ((S.session.tasks || []).length || 8)) + '.'; }
      else { b.removeAttribute('aria-disabled'); b.removeAttribute('title'); }
      b.hidden = isJudge() && !hasResults && g !== 'task';   // design review, proposal 5
      if (g === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  // 16 Nov 2026: when the safety screen flags a typed reason, an edit, a first thought, or a review
  // request, the student sees the same supportive message the chat shows. It stays until closed.
  function showSupport(text) { S.support = text; renderSupport(); }
  function renderSupport() {
    var old = $('#support-banner');
    if (old) old.remove();
    if (!S.support) return;
    var main = $('#main');
    var b = document.createElement('div');
    b.id = 'support-banner';
    b.className = 'banner support';
    b.setAttribute('role', 'alert');
    // 19 Nov 2026: shown only at the highest level; one button to carry on.
    b.innerHTML = ICON.shield + '<div><p>' + esc(S.support) + '</p><button type="button" class="btn small secondary" id="support-ok">Carry on</button></div>';
    main.insertBefore(b, main.firstChild);
    $('#support-ok').addEventListener('click', function () { S.support = null; b.remove(); main.focus({ preventScroll: true }); });
    $('#support-ok').focus({ preventScroll: true });
  }
  // 19 Nov 2026 (team lead: "such a massive ugly thing"): one slim strip under the header, laid over the page (no
  // layout jump when it comes or goes). Today's full sentence sits behind its small "More".
  function renderBanner() {
    var b = $('#offline-banner');
    if (!S.online) {
      if (!b) {
        b = document.createElement('div');
        b.id = 'offline-banner';
        b.className = 'offline-strip';
        b.setAttribute('role', 'status');
        b.innerHTML = '<div class="os-in"><div class="os-row">' + ICON.info + '<span class="os-text">Offline. Your answers are saved.</span>' +
          '<button type="button" class="os-more" data-disclose aria-expanded="false" aria-controls="offline-more" aria-label="More about being offline">More</button></div>' +
          '<p class="os-body" id="offline-more" hidden>You can keep working: the AI runs in demo mode on this device, and your answers are saved and sent when you are back online. Results need a connection.</p></div>';
        var top = document.querySelector('.topbar');
        if (top) top.appendChild(b); else document.body.insertBefore(b, document.body.firstChild);
      }
    } else if (b) { b.remove(); }
  }
  // The pill's short form ("Live AI" / "Scripted AI") on screen; a longer label becomes its tooltip and accessible name.
  function badgeText(b, long, short) {
    b.removeAttribute('title'); b.removeAttribute('aria-label'); b.removeAttribute('role');
    if (!long) return;
    b.textContent = short || long;
    if (short && long !== short) { b.title = long; b.setAttribute('role', 'img'); b.setAttribute('aria-label', long); }
  }
  // The top bar says what is happening now, not what was set up: a copy with a key that is using
  // the script (presenter's switch, a slow or failing AI, or the daily cap) does not say "Live AI".
  function modeBadge() {
    var st = S.status || {};
    var state = st.ai_state || (st.mode === 'live' ? 'live' : 'no_key');
    var configured = st.configured_mode || st.mode || 'demo';
    var b = $('#mode-badge');
    badgeText(b, '');
    if (DEMO) {
      // The guided demo's made-up student always uses the script, and nothing of it is sent out.
      b.textContent = 'Scripted AI'; b.dataset.state = 'scripted'; b.dataset.setup = 'demo';
      return;
    }
    if (aiSetup() === 'marker_only') {
      // Chat is scripted; only typed reasons go out, to the Adaption marker.
      badgeText(b, st.judge_state === 'live' ? 'Scripted chat, live marker' : 'Scripted AI', 'Scripted AI');
      b.dataset.state = 'scripted';
      b.dataset.setup = 'live';   // shown on a phone too, because something is sent out
      return;
    }
    // 19 Nov 2026: the server's words when it sends them ("Scripted first answer, then live AI": live_tasks patch).
    // First page (19 Nov 2026): the pill shows the short form; the server's long words are its tooltip and its name.
    if (st.ai_label) { b.dataset.state = /then live/.test(st.ai_label) ? 'live' : 'scripted'; badgeText(b, st.ai_label, b.dataset.state === 'live' ? 'Live AI' : 'Scripted AI'); b.dataset.setup = configured; return; }
    b.textContent = state === 'live' ? 'Live AI' : 'Scripted AI';
    b.dataset.state = state === 'live' ? 'live' : 'scripted';
    b.dataset.setup = configured;   // on a phone the badge shows only on a copy set up for live AI
  }
  // What this copy is set up to do (from /api/status): scripted (nothing sent out), marker_only
  // (typed reasons marked by Adaption, chat scripted), or full (live chat; the marker on OpenAI or Adaption).
  // Without a status (offline, or an older server) the notices fall back to the demo wording.
  // The guided demo (?demo=1) counts as scripted: its made-up student never sends anything out.
  function aiSetup() {
    var st = S.status;
    if (!st || DEMO) return 'scripted';
    if (st.ai_setup) return st.ai_setup;
    return (st.configured_mode || st.mode) === 'demo' ? 'scripted' : 'full';
  }
  function markerName() { return (S.status && S.status.judge_provider) === 'Adaption' ? 'an AI model from the company Adaption' : 'an OpenAI model'; }
  // 19 Nov 2026 (live_tasks patch): the server states exactly what the switches in force send, and to whom.
  function serverNotice() { return !DEMO && S.status && S.status.ai_notice ? S.status.ai_notice : null; }
  // The start notice's line about where text goes, for the three cases (wording checked by tests).
  function aiNoticeLine() {
    var setup = aiSetup();
    if (setup === 'marker_only') return 'Right now its replies are scripted, so your messages to it stay in Litmus. The reasons you type for your decisions are sent to ' + markerName() + ', which marks them. They are sent without your name or codes.';
    if (setup === 'full' && serverNotice()) return serverNotice().full;
    if (setup === 'full') return 'Its replies come from an OpenAI model. The reasons you type are marked by ' + (markerName() === 'an OpenAI model' ? 'an OpenAI model too' : markerName()) + '. Your messages and reasons are sent without your name or codes.';
    return 'Right now it runs in demo mode: its replies are scripted.';
  }
  function aiJoinLine() {
    var setup = aiSetup();
    if (setup === 'marker_only') return 'Here its replies are scripted. The reasons you type are marked by ' + markerName() + ', sent without any code.';
    if (setup === 'full' && serverNotice()) return serverNotice().full;
    if (setup === 'full') return 'Its replies come from an OpenAI model, and typed reasons are marked by ' + markerName() + ', sent without any code.';
    return 'Here its replies are scripted.';
  }
  // The same three cases in one short line, for the first view. The full wording is behind "More about this".
  function aiShortLine() {
    var setup = aiSetup();
    if (setup === 'marker_only') return "Adaption's AI marks your typed reasons.";
    if (setup === 'full' && serverNotice()) return serverNotice().short;
    if (setup === 'full') return markerName() === 'an OpenAI model' ? "OpenAI's AI sees what you type." : 'OpenAI sees chats. Adaption sees reasons.';
    return 'Replies here are scripted.';   // a fact about this setup, not a promise about data
  }
  // The first view of "Before you start" and of the join screen: four short lines.
  function noticeShort(join) {
    var ai = noticeAI();
    return '<ul class="checklist" id="' + (join ? 'join-short' : 'notice-short') + '">' +
      '<li>' + ICON.lock + '<span>' + (join ? 'The teacher view sees your answers.' : 'Your teacher sees your answers and chats.') + '</span></li>' +
      '<li>' + ICON.chip + '<span>The AI is sometimes wrong on purpose.</span></li>' +
      (ai.short ? '<li>' + ICON.lock + '<span>' + esc(ai.short) + '</span></li>' : '') +
    '</ul>';
  }
  function followMode(r) {
    if (!r || !r.ai_state || !S.status) return;
    S.status.ai_state = r.ai_state;
    S.status.mode = r.ai_mode || S.status.mode;
    if (r.ai_label !== undefined) S.status.ai_label = r.ai_label;
    modeBadge();
  }
  // Any reply the live AI did not write carries this label (18 Nov 2026: "Demo reply", so nothing scripted
  // passes for live AI; the team's Responsible AI plan, check 5, honest labels). A reply the live AI did
  // write says "Live AI" (18 Nov 2026, night), so a judge can see which is which on every reply.
  function scriptedLabel(source) {
    // 19 Nov 2026 (coordinator): students see no per-reply chip; the header's "Scripted AI" is the one label.
    return source === 'live' ? '<span class="live-label">Live AI</span>' : '';
  }
  // 19 Nov 2026: on the task screens' replies, no "Demo reply" chip (testers: it undercut the exercise). The
  // header's mode tag stays the one honest label there; a live reply still says Live AI. Results, the trail,
  // and the coach keep scriptedLabel.
  function taskLabel(source) {
    return source === 'live' ? scriptedLabel(source) : '';
  }
  // Every piece of feedback on the student's work is practice feedback (the Responsible AI plan, check 2 and risk R8).
  // cp_12: the chip says it; a tap shows the line.
  // 19 Nov 2026 (team lead could not make sense of the old line about grades and other uses):
  // the chip reads "Practice only" and the line "Practice only. It does not count for grades." Nothing else is promised.
  function pfLabel() { return '<button type="button" class="pf-label pf-chip" data-pf aria-expanded="false">Practice only</button><span class="pf-pop small muted" hidden>It does not count for grades.</span>'; }
  // Decision 15 (19 Nov 2026): once on each start and result screen.
  function pfLine(style) { return '<p class="small muted pf-line"' + (style ? ' style="' + style + '"' : '') + '>Practice only. It does not count for grades.</p>'; }
  // "Flag this feedback" (the Responsible AI plan, risk R4): one tap records the flag; the teacher sees it.
  function flagBtn(item, idx) {
    if ((S.flagged || []).indexOf(item) >= 0) return '<span class="flag-done">' + ICON.tick + 'Sent to your teacher</span>';
    return '<button type="button" class="flag-btn" data-flag="' + esc(item) + '"' + (idx != null ? ' data-coach="' + idx + '"' : '') + '>' + ICON.flag + '<span>Flag this feedback</span></button>';
  }
  function wireFlags(root, rnd) {
    if (!root) return;
    $all('[data-flag]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        var coach = b.dataset.coach != null ? S.coach[+b.dataset.coach] : null;
        api('/api/feedback/flag', { sid: S.sid, round: rnd, item: b.dataset.flag, text: coach ? coach.text : undefined }).then(function (r) {
          if (coach) coach.flagged = true; else S.flagged = (S.flagged || []).concat([r.item]);
          var done = document.createElement('span');
          done.className = 'flag-done'; done.setAttribute('role', 'status'); done.tabIndex = -1;
          done.innerHTML = ICON.tick + 'Sent to your teacher';
          b.replaceWith(done); done.focus();
        }, function (e) {
          b.disabled = false;
          tapNote(b, e.offline ? 'Flagging needs a connection.' : e.message);
        });
      });
    });
  }

  function render() {
    var r = route();
    // My profile, My record, and Settings (static/profile.js, 19 Nov 2026) are screens of their own; Settings opens without a session.
    var P = window.LitmusProfile && window.LitmusProfile.on() ? window.LitmusProfile : null;
    if (r.view !== 'start' && !S.session && !(P && P.opensWithout(r.view))) { r.view = 'start'; }
    // A join link opens the short notice, unless this phone already joined that class.
    if (JOIN && (!S.session || S.session.class_code !== JOIN || S.session.has_results)) r.view = 'join';   // a finished set: the next judge starts fresh
    updateNav(r.view === 'task' ? 'task' : r.view);
    document.body.dataset.view = r.view;   // cp_9: the desktop layout per screen (styles.css)
    document.body.classList.toggle('in-set-task', r.view === 'task' && !!S.session && !S.session.has_results && !DEMO);
    document.body.classList.toggle('cf-on', r.view === 'task' && chatFirstOn());
    // Quick check (static/quick.js, 19 Nov 2026): its own screen; with the mode off, #/quick shows the start.
    var QC = window.LitmusQuick && window.LitmusQuick.on() ? window.LitmusQuick : null;
    document.body.classList.toggle('qc-on', r.view === 'quick' && !!QC && !!S.session);
    // 19 Nov 2026: the "software, not a person" footer shows on the start screen only (round 2: testers met it on
    // "Before you start", the join screen, My profile, My record, Settings, and My subjects). beforeYouStart hides it too.
    document.body.classList.toggle('no-foot', r.view !== 'start');
    unsetInert();
    var main = $('#main');
    if (window.speechSynthesis && speaking) { window.speechSynthesis.cancel(); speaking = null; }
    // A new screen starts at the top. Without this, a phone user who pressed "Start the 8 tasks"
    // (far down the start page) landed half-way down task 1, in the middle of the reasons.
    var screenKey = r.view + '/' + (r.n == null ? '' : r.n);
    if (render._key != null && render._key !== screenKey) window.scrollTo(0, 0);
    // The first screen's lines (introHtml) are said once: leaving the screen that showed them marks them seen.
    if (S.introKey && S.introKey !== screenKey && S.sid) { store.set('litmus-intro-' + S.sid, 1); S.introKey = null; }
    render._key = screenKey;
    if (r.view === 'join') renderJoin(main);
    else if (r.view === 'card') renderCard(main);
    else if (r.view === 'start') renderStart(main);
    // Next step (19 Nov 2026): the chat-first task screen has its own small "Who sees my work" link; no strip above it.
    else if (r.view === 'task') { renderTask(main, r.n == null ? firstOpenTask() : r.n); if (!$('#cf', main)) placeIntro(main); }
    else if (r.view === 'results') renderResults(main);
    else if (r.view === 'trail') renderTrail(main);
    else if (r.view === 'next') renderNext(main);
    else if (P && P.handles(r.view)) P.render(r.view, main);
    else if (r.view === 'quick' && QC) QC.render(main);
    else if (r.view === 'practice') renderPractice(main, r.n == null ? 0 : r.n + 1);
    else renderStart(main);
    renderBanner();
    renderSupport();
    var ae = document.activeElement;
    var inDemoBar = DEMO && ae && ae.closest && ae.closest('#demo-bar, .demo-end');
    if (!render._first && !inDemoBar) { main.focus({ preventScroll: true }); }
    render._first = false;
  }
  render._first = true;

  /* ---------------------------------------------------------------- start */
  // How long answers are kept, from the server's setting (LITMUS_RETENTION_DAYS). Without the
  // setting (offline), the notice says nothing about it rather than guess.
  // cp_12 (NOTICES_FIRST): short bullets, under small headings; setup lines from the server's switches.
  function nb(items) { return '<ul class="nb">' + items.filter(Boolean).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
  function nh(t) { return '<h3 class="nh">' + esc(t) + '</h3>'; }
  function noticeAI() {   // C2: the first-view line and the "The AI" lines
    var n = S.status && S.status.ai_notice;
    if (n && !DEMO) return { short: n.short, lines: n.lines || [] };
    if (!S.status) return { short: '', lines: [] };
    return { short: 'Nothing you type leaves Litmus.', lines: ['Its replies are scripted here.', 'Nothing you type is sent outside Litmus.'] };
  }
  function keptLine(practice) {   // C3
    var d = S.status ? S.status.retention_days : null;
    if (d === 0) return practice ? 'Kept until a teacher deletes the practice group.' : 'Kept until your teacher deletes the class.';
    if (typeof d === 'number' && d > 0) return 'Deleted after ' + d + (d === 1 ? ' day.' : ' days.');
    return '';
  }
  function practiceOpen() { return !S.status || S.status.practice_open !== false; }   // C1
  var AI_TAIL = ['Voice typing uses your browser.', 'Some browsers send your voice to their maker.'];
  function retentionLine(join) {
    var d = S.status ? S.status.retention_days : null;
    if (d === 0) return ' <span class="retention">' + (join ? 'Your answers are kept until the teacher deletes the class.' : 'Your answers are kept until your teacher deletes the class.') + '</span>';
    if (typeof d === 'number' && d > 0) return ' <span class="retention">Your answers are deleted after ' + d + (d === 1 ? ' day' : ' days') + '.</span>';
    return '';
  }
  function fullNotice(join) {
    var ai = noticeAI(), who = join ? 'The teacher' : 'Your teacher';
    return '<div class="facts nfacts" id="' + (join ? 'join-notice' : 'notice') + '">' +
      (join ? '<p>For judges and adults at this event.</p>' : '') +
      nh('What is saved') + nb([join ? 'No name. Litmus gives you a made-up code.' : 'No name. Just your class code and student code.',
        'Your choices, and how sure you were.', 'Your reasons and chat messages.',
        !join && S.session && S.session.think_first ? 'Your first thought before each task.' : '',
        'Any edits, and the checks you ran.', 'How long each task took. Never scored.', 'Any review you ask for, or feedback you flag.',
        'Your results, and your Quick check taps.', 'Not what you type in Quick check Discuss.', 'Spelling and speed never count.',
        'Litmus removes phone numbers and addresses first.', 'It may miss some. Don\'t type personal details.', keptLine(false)]) +
      nh('Who can see it') + nb([who + ' sees your answers, reasons, and chats.', 'Quick check shows them as counts only.',
        'Their download holds scores and levels only.', 'If something you write suggests you need help, ' + who.toLowerCase() + ' sees it.',
        'They see it when they next open Litmus.', 'Your school decides whether to use Litmus.', 'Your school is responsible for your data.',
        'Worried? Talk to a trusted adult or your safeguarding lead.']) +
      nh('The AI') + nb(['It is a computer program, not a person.', 'It is sometimes wrong on purpose. Your job is to spot it.'].concat(ai.lines, AI_TAIL)) +
    '</div>';
  }
  // The numbers these screens say in words come from pedagogy.json (sent as rubric.plan, 19 Nov 2026).
  // The fallbacks are the shipped defaults, so an older cached rubric still reads exactly as before.
  function plan() {
    var p = (S.rubric && S.rubric.plan) || {};
    return {
      first: p.first_set_size > 0 ? p.first_set_size : 8,
      alloc: (p.allocation && p.allocation.length) ? p.allocation : [3, 2, 1],
      minNoAi: typeof p.min_no_ai === 'number' ? p.min_no_ai : 1,
      topics: p.topic_count > 0 ? p.topic_count : 5
    };
  }
  function shortTasks(n) { return n + (n === 1 ? ' short task' : ' short tasks'); }
  // The next-set split in words, e.g. [3, 2, 1] gives the line used before 19 Nov (tests/test_plan_text_2026_11_19.py).
  function allocationLine(a) {
    var parts = a.map(function (n, i) { return i === 0 ? 'Your weakest topic gets ' + n + (n === 1 ? ' task' : ' tasks') : 'the next gets ' + n; });
    if (parts.length === 1) return parts[0] + '.';
    return parts.slice(0, -1).join(', ') + (parts.length > 2 ? ',' : '') + ' and ' + parts[parts.length - 1] + '.';
  }
  function topicsGoal(n) {
    var words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    return n === 1 ? 'in its topic' : 'in all ' + (words[n] || n) + ' topics';
  }
  function aboutHtml() {
    // cp_12 (text audit): one line; the rest one tap further in, under "About Litmus".
    return '<p>' + esc(shortTasks(plan().first)) + ' with a built-in AI. Litmus scores what you do with it.</p>' +
      more('about-litmus', 'About Litmus', topicsPlain(S.rubric ? S.rubric.areas : [], 'topics-start-h') +
        '<p class="small">Litmus is built for A-level students.</p>' +
        '<p class="small">iPhone: Share, then Add to Home Screen.</p><p class="small">Android: Install app, or the browser menu.</p>', 'row-more');
  }
  // The start (19 Nov 2026, getting in): one screen, one job. Codes, then Next, straight to task 1: no tick screen.
  // A class code alone is enough: the server gives a six-digit code in the same step, shown once above the first
  // task. "No code? Quick check" and "Use a practice code" start a practice run (class TRY-IT, the short set) in one
  // tap and never change what was typed. What "Before you start" said now sits where it matters (introHtml).
  var PRACTICE_CLASS = 'TRY-IT';
  function startMoreHtml() {
    return '<div class="start-alt"><button class="btn quiet small" type="button" id="demo-codes">Use a practice code</button>' +
      (practiceOn() ? '<button class="btn secondary block pd-start-btn" type="button" id="pd-start">Practise a decision</button>' : '') +
      (DEMO ? '' : '<p class="demo-link"><a href="?demo=1#/start">' + ICON.eye + '<span>Watch the demo</span></a></p>') + '</div>' +
      aboutHtml();
  }
  // cp_10 (team lead): who are you? Student is chosen; "I'm a teacher" opens the teacher view of the made-up class.
  function whoHtml() {
    if (!(S.status && S.status.open_teacher_demo)) return '';
    return '<div class="who" role="group" aria-label="Who are you?">' +
      '<button type="button" class="who-btn" id="who-student" aria-pressed="true">I\'m a student</button>' +
      '<a class="who-btn" id="who-teacher" href="teacher.html?open=demo">I\'m a teacher</a></div>';
  }
  function renderStart(main) {
    // Back from a Quick check (or a practice run with nothing done) shows the start itself, not "Welcome back ... 0 of
    // 3 tasks done" (19 Nov 2026, tester S11).
    if (S.session && !(S.session.class_code === PRACTICE_CLASS && !(S.session.done || []).length)) {
      main.innerHTML = '<section class="card panel start-card" id="start-step-1" aria-labelledby="hero-h">' +
        '<h1 id="hero-h" tabindex="-1">Welcome back</h1>' +
        '<p class="lede">' + esc(displayCode(S.session.student_code)) + ': ' + S.session.done.length + ' of ' + S.session.tasks.length + ' tasks done.</p>' +
        '<div class="start-btns"><button class="btn block" type="button" data-go="task">Carry on</button>' +
        (window.LitmusQuick ? window.LitmusQuick.entryHtml('back') : '') +
        (practiceOn() ? '<button class="btn secondary block" type="button" id="pd-open">Practise a decision</button>' : '') +
        '<button class="btn quiet block" type="button" id="new-start">Use a different code</button></div></section>';
      if ($('#pd-open')) $('#pd-open').addEventListener('click', function () { location.hash = '#/practice'; });
      $('#new-start').addEventListener('click', function () {
        if (!confirmForget()) return;
        forgetStudent();
        S.session = null; S.sid = null; S.results = null; render();
      });
      return;
    }
    var qcOn = !!(window.LitmusQuick && window.LitmusQuick.on());
    // First page (19 Nov 2026, team lead: "state and make it clear which way and how we go through the two modes";
    // "why the hell is there so much text"): the two modes as two numbered buttons, in order, no code needed.
    // The class code boxes open from one small link; everything else sits behind "More", unchanged.
    function modeBtn(n, id, name, line) {
      return '<li><button type="button" class="mode-btn" id="' + id + '" aria-label="' + esc((n ? n + '. ' : '') + name + '. ' + line) + '">' +
        (n ? '<span class="mode-n" aria-hidden="true">' + n + '</span>' : '') +
        '<span class="mode-t"><b>' + esc(name) + '</b><small>' + esc(line) + '</small></span>' + ICON.chev + '</button></li>';
    }
    var modes = qcOn ?
      '<p class="mode-order" id="mode-order">Start with 1. Then do 2.</p>' +
      '<ol class="mode-list" role="list" aria-labelledby="mode-order">' + modeBtn(1, 'qc-entry-s', 'Quick check', 'Ten quick cards. 3 minutes.') +
        modeBtn(2, 'mode-2', 'Tasks with the AI', 'Chat, test it, decide. 10 minutes.') + '</ol>' :
      '<ol class="mode-list" role="list">' + modeBtn(0, 'mode-2', 'Tasks with the AI', 'Chat, test it, decide. 10 minutes.') + '</ol>';
    main.innerHTML =
      '<form id="start-form" class="start-flow" novalidate>' +
        '<section class="card panel start-card" id="start-step-1" aria-labelledby="hero-h">' +
          '<div class="start-head"><div class="start-top"><span class="spacer"></span>' + listenBtn('start-step-1', 'Listen: read this aloud') + '</div>' +
          '<h1 id="hero-h" tabindex="-1">How well do you work with AI?</h1></div><div class="start-formcol">' + whoHtml() + modes +
          '<div class="start-links">' +
            '<button type="button" class="start-link" id="code-open" data-disclose aria-expanded="false" aria-controls="code-fields">Use a class code</button>' +
            '<button type="button" class="start-link" id="more-open" data-disclose aria-expanded="false" aria-controls="about-more" aria-label="More ways to start">More</button>' +
          '</div>' +
          '<div class="code-fields" id="code-fields" hidden>' +
            '<label class="field"><span>Class code</span><input type="text" id="class-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. Y12-B" aria-describedby="class-error"></label>' +
            '<p class="error" id="class-error" role="alert"></p>' +
            // 19 Nov 2026 (coordinator, from a 200% zoom tester): no number as the example (it read as a phone number);
            // the helper line says what happens with no code, and replaces "(not your name)".
            '<label class="field student-field"><span>Student code</span><input type="text" id="student-code" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="numeric" placeholder="Optional" aria-describedby="student-help"></label>' +
            '<p class="visually-hidden" id="student-help">No student code? Leave it empty.</p>' +
            '<p class="error" id="code-error" role="alert"></p>' +
            '<button class="btn block" type="submit" id="start-next">Next</button>' +
          '</div>' +
          '<div class="more-body start-more" id="about-more" hidden>' + startMoreHtml() + '</div>' +
          // First page brief: the practice line is a required notice, the last line in the card (cp_12 had put it in More).
          '<div class="start-notes">' + pfLine('') + '</div>' +
        '</div></section>' +
      '</form>';
    $('#code-open').addEventListener('click', function () {
      setTimeout(function () { if (!$('#code-fields').hidden) $('#class-code').focus(); }, 0);
    });
    var busy = false;
    // "No connection. Try again." beside the button that was pressed (19 Nov 2026).
    function nearError(btn, text) {
      $all('.near-err', main).forEach(function (p) { p.remove(); });
      if (!btn || !text) return;
      var p = document.createElement('p');
      p.className = 'error near-err'; p.setAttribute('role', 'alert'); p.textContent = text;
      var host = btn.closest('li') || btn.parentNode;
      if (host === btn.parentNode) btn.insertAdjacentElement('afterend', p); else host.appendChild(p);
    }
    var pressed = null;
    function failed(e2) {
      busy = false;
      var m = String(e2.message || '');
      var field = /student code/i.test(m) ? '#student-code' : /class code/i.test(m) ? '#class-code' : null;
      // Each error under its own box (19 Nov 2026, tester S14).
      $('#class-error').textContent = ''; $('#code-error').textContent = ''; nearError(null);
      if (pressed && pressed.id !== 'start-next') { nearError(pressed, e2.offline ? 'No connection. Try again.' : m); return; }
      $(field === '#class-code' && !e2.offline ? '#class-error' : '#code-error').textContent = e2.offline ? 'No connection. Try again.' : m;
      if (field && !e2.offline) $(field).focus();
    }
    function landed(s, then) {
      busy = false;
      setSession(s);
      var saved = store.get('litmus-settings-' + s.class_code + '-' + s.student_code);
      if (saved) { applySettings(saved); } else { send('/api/settings', { sid: s.session_id, settings: currentSettings() }); }
      if (s.class_code !== PRACTICE_CLASS) { beforeYouStart(main, s, then); return; }
      goOn(then);
    }
    function goOn(then) {
      if (then === 'practice' && practiceOn()) { location.hash = '#/practice'; return; }
      if (then === 'quick' && window.LitmusQuick && window.LitmusQuick.on()) { go('quick'); return; }
      go('task', 0);
    }
    // "Before you start" for a class (19 Nov 2026, coordinator): four short lines in the normal large type, the code
    // the app gave (if it gave one) with Copy, everything else under "More", and one Start button. No tick: the
    // data and sign-in guidance names public task as the basis, not consent,
    // and asks for a tick only on the join link. The session already exists; Start only moves on.
    function beforeYouStart(main, s, then) {
      var code = displayCode(s.student_code);
      main.innerHTML =
        '<section class="card panel start-card" id="start-step-2" aria-labelledby="start-h">' +
          '<div class="start-top"><span class="spacer"></span>' + listenBtn('bys-read', 'Listen: read this aloud') + '</div>' +
          '<div id="bys-read"><h1 id="start-h" tabindex="-1">Before you start</h1>' +
            (s.code_given ? codeLine(code) : '') + noticeShort(false) +
            more('notice-more', 'More', fullNotice() + '<div class="row">' + listenBtn('notice', 'Listen: read the full notice aloud') + '</div>', 'notice-more', 'More about this') + '</div>' +
          '<button class="btn block" type="button" id="start-go">Start</button>' +
        '</section>';
      document.body.classList.add('no-foot');
      wireIntro(main);
      $('#start-go').addEventListener('click', function () { goOn(then); });
      window.scrollTo(0, 0);
      $('#start-h').focus({ preventScroll: true });
    }
    // A practice run: no class, the short set, a made-up code. What is typed in the boxes is left alone.
    function practiceRun(then) {
      if (busy) return;
      busy = true;
      $('#code-error').textContent = ''; var ce = $('#class-error'); if (ce) ce.textContent = '';
      api('/api/session/join', { class_code: PRACTICE_CLASS, consent: true }).then(function (s) { landed(s, then); }, failed);
    }
    // With a class code: the student's own class. An empty student code gets one from the server.
    function begin(then) {
      if (busy) return;
      var err = $('#class-error');
      err.textContent = ''; $('#code-error').textContent = '';
      // Quick check ignores both boxes: it is the no-code way in (19 Nov 2026, tester S14).
      if (then === 'quick') { practiceRun('quick'); return; }
      if (!$('#class-code').value.trim()) {
        if ($('#code-fields').hidden) { $('#code-fields').hidden = false; $('#code-open').setAttribute('aria-expanded', 'true'); }
        err.textContent = qcOn ? 'Type your class code, or tap Quick check.' : 'Type your class code. No code? Open More, then Use a practice code.';
        $('#class-code').focus();
        return;
      }
      busy = true;
      api(window.LitmusApp.startPath, { class_code: $('#class-code').value, student_code: $('#student-code').value, consent: true, strict: true }).then(function (s) { landed(s, then); }, failed);
    }
    $('#start-form').addEventListener('submit', function (e) { e.preventDefault(); pressed = $('#start-next'); begin('task'); });
    if ($('#qc-entry-s')) $('#qc-entry-s').addEventListener('click', function () { pressed = this; begin('quick'); });
    // Button 2: the short no-code task set, the same route as "Use a practice code".
    $('#mode-2').addEventListener('click', function () { pressed = this; practiceRun('task'); });
    if ($('#pd-start')) $('#pd-start').addEventListener('click', function () { pressed = this; begin('practice'); });
    $('#demo-codes').addEventListener('click', function () { pressed = this; practiceRun('task'); });
  }

  /* ---------------------------------------------------------------- the first screen's lines (19 Nov 2026) */
  // Said once per session, above the first task or the first Quick check card, whichever comes first:
  // the code the app gave (with Copy), whether the AI is sometimes wrong on purpose, and who can see the work.
  // The detail sits behind "Who sees my work". Marked seen when the student leaves that screen (render()).
  function isPractice() { return !!(S.session && S.session.class_code === PRACTICE_CLASS); }
  function introHtml(where) {
    if (!S.session || DEMO || store.get('litmus-intro-' + S.sid)) return '';
    // A class student read this on "Before you start"; a join-link student on the join screen. Practice runs only.
    if (!isPractice()) return '';
    var lines = '';
    // Above a task the task's own note already says the AI is sometimes wrong on purpose, one line lower; said once.
    S.introKey = render._key;
    return '<div class="intro-strip" id="intro-strip">' + lines + more('intro-more', 'Who sees my work', practiceNotice(), 'intro-more') + '</div>';
  }
  // The code the app gave, shown once on "Before you start", with Copy.
  function codeLine(code) {
    return '<p class="intro-line intro-code" id="code-given">' + ICON.user + '<span>Your code: <b>' + esc(code) + '</b>. Use it every time.</span>' +
      '<button type="button" class="btn small secondary intro-copy" id="intro-copy" data-code="' + esc(code) + '" aria-label="Copy your code">Copy</button></p>';
  }
  function wireIntro(root) {
    var b = $('#intro-copy', root);
    if (!b) return;
    b.addEventListener('click', function () {
      var code = b.dataset.code;
      function done() { b.textContent = 'Copied'; b.setAttribute('aria-label', 'Copied'); toast('Code copied.'); }
      function fallback() {
        var t = document.createElement('textarea');
        t.value = code; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Your code: ' + code); }
        t.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fallback); else fallback();
    });
  }
  function placeIntro(main) {
    var h = introHtml('task');
    if (!h) return;
    var d = document.createElement('div');
    d.innerHTML = h;
    var strip = d.firstChild;
    main.insertBefore(strip, main.firstChild);
    wireIntro(strip);
    // While a chat-first sheet is open the task behind it is inert; the lines above it follow suit.
    var cf = $('#cf', main);
    if (cf && window.MutationObserver) {
      new MutationObserver(function () {
        if (cf.hasAttribute('inert')) strip.setAttribute('inert', ''); else strip.removeAttribute('inert');
      }).observe(cf, { attributes: true, attributeFilter: ['inert'] });
    }
  }
  // A practice run's notice (behind "Who sees my work"): what is true of class TRY-IT on this server.
  function practiceNotice() {
    var ai = noticeAI(), open = practiceOpen();
    return '<div class="facts nfacts" id="practice-notice">' +
      nb(['Saved with a made-up code. No name.', open ? 'Teachers with the school code can see it.' : 'No teacher can open it.', ai.short]) +
      more('practice-more', 'More',
        nh('What is saved') + nb(['Your choices, and how sure you were.', 'Your reasons and chat messages.', 'The checks you ran.',
          'How long each task took. Never scored.', 'Any review you ask for, or feedback you flag.', 'Your results.',
          'Quick check: your taps. Not what you type in Discuss.', 'Litmus removes phone numbers and addresses first.',
          'It may miss some. Don\'t type personal details.', keptLine(true)]) +
        nh('Who can see it') + nb(['It goes into one shared practice group.', open ? 'Anyone with the school\'s teacher code can open it.' : 'No teacher code opens it.',
          open ? 'They also see anything that suggests someone needs help.' : '', 'Worried? Talk to a trusted adult or your safeguarding lead.']) +
        nh('The AI') + nb(['It is a computer program, not a person.', 'It is sometimes wrong on purpose. Your job is to spot it.'].concat(ai.lines, AI_TAIL)), 'row-more') +
    '</div>';
  }

  /* ---------------------------------------------------------------- join link (short notice) */
  // The join notice, also reopened from My profile ("Who sees my work", 19 Nov 2026).
  function joinNotice() { return fullNotice(true); }
  function renderJoin(main) {
    main.innerHTML =
      '<section class="card panel join-card start-card" aria-labelledby="join-h">' +
        // The class name is a small tag, not a labelled line; screen readers hear "Class EXPO".
        '<div class="start-top"><span class="tag class-tag" id="join-class"><span class="visually-hidden">Class </span>' + esc(JOIN) + '</span><span class="spacer"></span>' + listenBtn('join-read', 'Listen: read this aloud') + '</div>' +
        '<div id="join-read"><h1 id="join-h">Try 3 short tasks</h1>' + noticeShort(true) +
        more('join-more', 'More', joinNotice(), 'notice-more', 'More about this') + '</div>' +
        // On a phone the tick and the button stay in view at the bottom of the screen (styles.css, .join-form).
        pfLine('margin:12px 0 0') +
        '<form id="join-form" class="join-form" novalidate>' +
          '<label class="check"><input type="checkbox" id="join-consent"><span>I\'m happy to start</span></label>' +
          '<p class="error" id="join-error" role="alert"></p>' +
          '<button class="btn block" type="submit" id="join-start"><span>Start</span>' + ICON.send + '</button>' +
        '</form>' +
      '</section>';
    $('#join-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#join-error');
      err.textContent = '';
      if (!$('#join-consent').checked) { err.textContent = 'Please tick the box to start.'; $('#join-consent').focus(); return; }
      var b = $('#join-start');
      if (b.disabled) return;
      b.disabled = true;
      api('/api/session/join', { class_code: JOIN, consent: true }).then(function (st) {
        setSession(st);
        send('/api/settings', { sid: st.session_id, settings: currentSettings() });
        // Drop ?join= from the address, so a reload carries on instead of joining again.
        JOIN = null;
        try { history.replaceState(null, '', location.pathname + '#/task/1'); } catch (e3) { /* old browser */ }
        render();
      }, function (e2) {
        b.disabled = false;
        err.textContent = e2.offline ? 'You need a connection to start. Check your connection and try again.' : e2.message;
      });
    });
  }

  /* ---------------------------------------------------------------- result card (short set) */
  function renderCard(main) {
    if (!S.session.has_results) { go('task'); return; }
    var p = S.results && S.results.round === S.session.round ? Promise.resolve(S.results) : api('/api/results?sid=' + encodeURIComponent(S.sid));
    main.innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading your result</p>';
    p.then(function (res) {
      S.results = res;
      var lmap = {};
      res.lines.forEach(function (l) { lmap[l.id] = l; });
      var measured = res.areas.filter(function (a) { return a.score != null; });
      var tasks = res.tasks.map(function (t, i) {
        // Whether the AI's answer was right on this task, in words with a mark: trusting it is sometimes the right call.
        // Then what was going on (design review 15 Nov, proposal 2): the task's own "What was going on" text.
        var what = String(t.what_was_going_on || '').replace(/^None\.\s*/, '');
        return '<li class="ct-row"><span class="num">' + (i + 1) + '</span><div class="ct"><div class="ct-head"><span class="t">' + esc(t.title) + '</span></div>' +
          (t.first_thought ? '<span class="ft-line"><b>Your first thought:</b> ' + esc(t.first_thought) + '</span>' : '') +
          '<span class="d">' + (t.first_thought ? '<b>After the AI:</b> ' : '') + (t.choice ? ICON[t.choice] + esc(CHOICE_NAMES[t.choice]) : '') + '</span>' +
          '<div class="ai-was"><span class="ai-was-h">' + (t.ai_correct ? ICON.tick + 'The AI was right here' : ICON.info + 'The AI had a problem here') + '</span>' +
          (what ? '<span class="ai-what">' + esc(what) + (t.correction ? ' ' + esc(t.correction) : '') + '</span>' : '') + '</div></div></li>';
      }).join('');
      // Each topic measured in this set: its name, the three level cells, and the level in words (never the cells alone).
      var areas = measured.map(function (a) {
        if (a.level == null) return '<li><span class="a-name">' + esc(a.name) + '</span>' + levelChip(a) + '</li>';
        return '<li><span class="a-name">' + esc(a.name) + '</span>' + cells(a.level) + '<span class="a-level">Level ' + a.level + '</span></li>';
      }).join('');
      main.innerHTML =
        '<section class="card panel result-card" aria-labelledby="card-h">' +
          '<div class="rc-top"><div class="rc-title"><h1 id="card-h" class="visually-hidden">Your result</h1>' + pfLabel() + '</div>' +
            '<div class="big-score">' + (res.overall == null ? 'n/a' : res.overall) + '<small>out of 100</small></div>' +
            (shortSet(res) ? '<p class="small muted rc-first" id="rc-first">First reading.</p>' : '') + '</div>' +
          // cp_9: where the points went, without a tap: the four parts and the biggest loss, under the number.
          (LS ? '<div class="rc-parts">' + partsHtml(LS.parts(res), res) + lossHtml(res) + '</div>' : '') +
          // score2: only a class's join link has a big screen in front of it; a practice run or a no-code
          // Quick check (shared practice class TRY-IT) has none, so the line is left out there.
          // cp_12 (limit 40): the task rows, topics, and the practice line are on the results page ("See why").
          // "Keep doing this" and the area of focus are on the results page ("See why"), with their evidence.
          // On a phone the main button stays in view at the bottom of the screen (styles.css, .card-actions).
          '<div class="card-actions"><button type="button" class="btn" data-go="results">See why</button></div>' +
        '</section>';
    }, function (e) {
      main.innerHTML = '<div class="card"><h1>Your result</h1><p>' + esc(e.offline ? 'Your result needs a connection.' : e.message) + '</p></div>';
    });
  }

  function setSession(s) {
    S.session = s;
    S.sid = s.session_id;
    if (DEMO) return;
    store.set('litmus-sid', s.session_id);
    store.set('litmus-session', s);
    // Text size (19 Nov 2026): codes with no saved settings keep this device's choices (they are sent up next).
    if (s.settings && s.settings_saved !== false) applySettings(s.settings);
  }

  /* ---------------------------------------------------------------- task */
  function taskKey(id) { return 'litmus-task-' + S.sid + '-' + S.session.round + '-' + id; }
  function taskState(id) {
    var st = store.get(taskKey(id));
    if (!st) { st = { messages: [], opened: false, edit: null, noAiStarted: false, noAiAnswer: null, choice: null, tags: [], reason: '', conf: null, t0: Date.now(), inputMode: 'typed' }; }
    return st;
  }
  function saveTaskState(id, st) { store.set(taskKey(id), st); }
  // Once a set is scored and saved on the server, this device keeps only the decision receipt, not the words typed.
  function scrubTypedText(sid, round) {
    if (!sid) return;
    litmusKeys('litmus-task-' + sid + '-' + round + '-').forEach(function (k) {
      var st = store.get(k);
      if (!st) return;
      var sv = st.saved ? { choice: st.saved.choice, conf: st.saved.conf, tags: st.saved.tags || [], reason: '', reveal: st.saved.reveal } : null;
      store.set(k, { messages: [], opened: true, opened_logged: true, edit: null, noAiStarted: !!st.noAiStarted, noAiAnswer: st.noAiAnswer,
        choice: st.choice, tags: st.tags || [], reason: '', conf: st.conf, t0: st.t0, inputMode: st.inputMode, saved: sv });
    });
  }
  // Work that has not reached the server yet, or a set not yet scored: ask before this device forgets it.
  function confirmForget() {
    if (outbox().length) return window.confirm('Some of your work has not reached Litmus yet. If you carry on, this device deletes it. Carry on?');
    if (S.session && !S.session.has_results) return window.confirm('Your saved tasks stay in Litmus, but this device will forget your codes and this set. Carry on?');
    return true;
  }
  function forgetStudent() {
    var s = S.session || store.get('litmus-session');
    if (S.sid) litmusKeys('litmus-task-' + S.sid + '-').forEach(store.del);
    if (s && s.class_code) store.del('litmus-settings-' + s.class_code + '-' + s.student_code);
    store.del('litmus-sid'); store.del('litmus-session'); store.del('litmus-outbox');
  }
  // "Clear this device": every item Litmus saved in this browser (the offline copy of the app itself stays).
  function clearDevice() {
    if (!confirmForget()) return false;
    litmusKeys('litmus').forEach(store.del);
    try { for (var i = sessionStorage.length - 1; i >= 0; i--) { var k = sessionStorage.key(i); if (k && k.indexOf('litmus') === 0) sessionStorage.removeItem(k); } } catch (e) { /* storage blocked */ }
    S.session = null; S.sid = null; S.results = null;
    if (window.LITMUS_ENGINE_CLEAR) window.LITMUS_ENGINE_CLEAR();
    location.hash = '#/start';
    location.reload();
    return true;
  }

  // 20 Nov 2026: one set of words for the three test buttons on both task screens (the server's provider.MOVE_TEXTS),
  // so the older screen's "Add" chips get the same scripted replies as the chat-first buttons.
  var MOVE_WORDS = { source: 'Where is that from? How could I check it?', explain: 'Explain why, step by step.', pushback: 'Are you sure? Please check that.' };
  var BUILDERS = [
    { label: 'Say who I am', text: 'I am a Year 12 student. ' },
    { label: 'Ask the AI for its source', text: ' ' + MOVE_WORDS.source },
    { label: 'Ask the AI to explain', text: ' ' + MOVE_WORDS.explain },
    { label: 'Push back against the AI', text: ' ' + MOVE_WORDS.pushback }
  ];

  function reasonCount(st) { return ''; }   // cp_12: no count line; a fourth tap says "Up to 3."
  // Reasons fit the choice (19 Nov 2026, blind testers): after Trust it, the reason to trust comes first;
  // after Question it or Verify it, the reasons to doubt come first. Order only: every chip stays, and the
  // order depends on the choice alone, never on the task, so it gives nothing away.
  var TRUST_TAGS = ['matches_known'];
  function orderedTags(tags, choice) {
    if (choice !== 'trust' && choice !== 'question' && choice !== 'verify') return tags.slice();
    var up = tags.filter(function (tg) { return TRUST_TAGS.indexOf(tg.id) >= 0; });
    var rest = tags.filter(function (tg) { return TRUST_TAGS.indexOf(tg.id) < 0; });
    return choice === 'trust' ? up.concat(rest) : rest.concat(up);
  }
  // 19 Nov 2026, round 2: the reason list is built once, in document order, at the moment a choice is made,
  // and never moves while the student works in it. A new choice rebuilds it, keeping what was ticked.
  // Before any choice, one line says why there is no list yet.
  function chipsHtml(tags, choice, picked) {
    if (!choice) return '';   // 19 Nov 2026 (tight sheet): "Choose first." is the reason box's placeholder
    return orderedTags(tags, choice).map(function (tg) {
      return '<button type="button" class="chip" data-tag="' + tg.id + '" title="' + esc(tg.label) + '" aria-pressed="' + (picked.indexOf(tg.id) >= 0 ? 'true' : 'false') + '">' + esc(TAG_SHORT[tg.id] || tg.label) + '</button>';
    }).join('');
  }
  function rebuildChips(box, tags, choice, picked) {
    if (!box || box.dataset.builtFor === choice) return;
    box.dataset.builtFor = choice || '';
    box.innerHTML = chipsHtml(tags, choice, picked);
  }
  // A step that still needs doing, in a few words (Done / Save with something missing).
  var MISSING_WORDS = { ask: 'ask the AI', noai: 'the question without AI', choice: 'your choice', reason: 'a reason', conf: 'how sure' };
  function foundText(st) {
    var f = (S.session.findings || []).filter(function (o) { return o.id === st.finding; })[0];
    return f ? 'You found: ' + f.label : 'You opened this check.';
  }

  // When the set asks for it, a check counts only once the student says what they found.
  function findingHtml(st) {
    if (!S.session.check_needs_finding) return '';
    var opts = S.session.findings || [];
    return '<fieldset class="finding" id="finding"><legend>What did you find?</legend>' +
      '<p class="small muted" id="finding-help">Record it, so the check counts.</p><div class="options">' +
      opts.map(function (o) { return '<label class="option"><input type="radio" name="finding" value="' + esc(o.id) + '" aria-describedby="finding-help" ' + (st.finding === o.id ? 'checked' : '') + '><span>' + esc(o.label) + '</span></label>'; }).join('') +
      '</div><p class="small" id="finding-saved" aria-live="polite">' + (st.finding ? 'Saved.' : '') + '</p></fieldset>';
  }

  // Tap feedback (19 Nov 2026, team lead: "extraordinarily obvious", "something coming up red, something coming up
  // green"). A check's finding in parts, each led by a short headline with its own mark: a cross in a circle for a bad
  // finding, a tick in a circle for a good one (told apart by shape and border, not only hue). Two shapes are read:
  // today's one "result" string (split by paragraph; the headline is the words before the first full stop when they
  // are four words or fewer, a leading "The" and a pronoun after the colon dropped: "The book: not found." -> "Book:
  // not found", "The dates: they match." -> "Dates: match"; an optional
  // "headlines" list on the check, one per paragraph, overrides the rule), or a list of findings {headline, line, sign}
  // (as source_check itself or as source_check.findings). The finding's own words are never rewritten.
  var SIGN_BAD = /\bnot found\b|\bdoes not\b|\bdoesn't\b|\bno\b|\bnot\b|\bwrong\b|\bcannot\b/i;
  var SIGN_GOOD = /\bmatch(es)?\b|\bfound\b|\bcorrect\b|\bright\b/i;
  function guessSign(s) { s = String(s || ''); return SIGN_BAD.test(s) ? 'bad' : SIGN_GOOD.test(s) ? 'good' : ''; }
  function checkFindings(sc) {
    if (!sc) return [];
    var list = Array.isArray(sc) ? sc : Array.isArray(sc.findings) ? sc.findings : null;
    if (list) {
      return list.map(function (f) {
        var h = String(f.headline || f.head || '').replace(/[.!]+$/, ''), l = String(f.line || '');   // "head" from the tasks file
        return { headline: h, line: l, sign: f.sign === 'bad' || f.sign === 'good' ? f.sign : guessSign(h || l) };
      });
    }
    var given = Array.isArray(sc.headlines) ? sc.headlines : [];
    return String(sc.result || '').split(/\n\s*\n/).map(function (p, i) {
      p = p.trim();
      if (given[i]) return { headline: String(given[i]), line: p, sign: guessSign(given[i]) };
      var m = p.match(/^([^\n]*?[.!?])(?:\s+|$)([\s\S]*)$/);
      var first = m ? m[1].replace(/[.!?]+$/, '').replace(/^The\s+/, '').replace(/:\s+(they|it|this|these|that)\s+/i, ': ') : '';
      if (first && first.split(/\s+/).length <= 4) return { headline: first.charAt(0).toUpperCase() + first.slice(1), line: m[2], sign: guessSign(first) };
      return { headline: '', line: p, sign: '' };
    }).filter(function (f) { return f.headline || f.line; });
  }
  var FIND_ICON = {
    bad: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke-width="2.8" stroke-linecap="round"/></svg>',
    good: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function findingsHtml(list, id) {
    return '<ul class="cf-finds"' + (id ? ' id="' + id + '"' : '') + '>' + list.map(function (f) {
      return '<li class="cf-fd' + (f.sign ? ' is-' + f.sign : '') + '">' +
        (f.headline ? '<p class="cf-fd-h">' + (f.sign ? '<span class="cf-fd-i">' + FIND_ICON[f.sign] + '</span>' : '') + '<b>' + esc(f.headline) + '</b></p>' : '') +
        (f.line ? '<p class="cf-fd-line pre">' + esc(f.line) + '</p>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function firstSentence(s) { var m = String(s || '').trim().match(/^[\s\S]*?[.!?](?=\s|$)/); return m ? m[0] : String(s || '').trim(); }
  // The decision sheet's top line once the check is done: the headlines, or the first sentence when there are none.
  function yourCheckHtml(sc) {
    var fs = checkFindings(sc).filter(function (f) { return f.headline; });
    var inner = fs.length ? fs.map(function (f) {
      return '<span class="cf-yc-f' + (f.sign ? ' is-' + f.sign : '') + '">' + (f.sign ? '<span class="cf-fd-i">' + FIND_ICON[f.sign] + '</span>' : '') + esc(f.headline) + '</span>';
    }).join('') : esc(firstSentence(sc.result || ((checkFindings(sc)[0] || {}).line)));
    return '<p class="cf-yourcheck" id="your-check"><b>Your check:</b> ' + inner + '</p>';
  }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ---------------------------------------------------------------- chat-first task screen
     16 Nov 2026 (design_task_screen_2026-11-16, variant B). The chat is the screen: a slim header, the
     conversation, and a dock with the message box and one way forward. The check, the question without AI
     and the decision open as sheets over the chat; after Save, Litmus says in the chat what the AI got wrong.
     Behind a switch: the session's `chat_first` (LITMUS_CHAT_FIRST, LITMUS_CHAT_FIRST_JUDGE), or
     ?chatfirst=1 / ?chatfirst=0 on the address (kept on this device). The guided demo follows the same
     switch (its made-up student is on when either setting is on) and drives whichever screen is shown.
     The same events and payloads as the older screen; nothing on the server changes. */
  var CF_PARAM = params.get('chatfirst');
  if (CF_PARAM === '1' || CF_PARAM === '0') store.set('litmus-chatfirst', CF_PARAM);
  function chatFirstOn() {
    if (!S.session) return false;
    var p = store.get('litmus-chatfirst');
    if (p === '1') return true;
    if (p === '0') return false;
    return !!S.session.chat_first;
  }
  // The same three moves on every task, so they never hint which answer is planted. The source move's words
  // meet the scripted replies' "where", "find" and "check" rules (NOTES.md, fix b).
  var MOVES = [
    // 19 Nov 2026 (team lead's wording): three go to the AI and say so; "Check it yourself" happens outside it.
    { id: 'source', label: 'Ask the AI for its source', text: MOVE_WORDS.source },
    { id: 'explain', label: 'Ask the AI to explain', text: MOVE_WORDS.explain },
    { id: 'pushback', label: 'Push back against the AI', text: MOVE_WORDS.pushback }
  ];
  var MARK_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false"><g transform="rotate(18 14 14)"><rect x="9" y="1.5" width="10" height="25" rx="1.6" fill="#FFFEFA"/><rect x="9" y="11" width="10" height="5.2" fill="#C93C56"/><rect x="9" y="16.2" width="10" height="5.2" fill="#6B3FA0"/><path d="M9 21.4h10v3.5a1.6 1.6 0 0 1-1.6 1.6h-6.8A1.6 1.6 0 0 1 9 24.9z" fill="#2E3A97"/><rect x="9" y="1.5" width="10" height="25" rx="1.6" fill="none" stroke="#17172B" stroke-width="1.5"/></g></svg>';
  function listenSm(id, label) {
    return '<button type="button" class="iconbtn cf-listen" data-speak="' + esc(id) + '" aria-pressed="false" aria-label="' + esc(label) + '">' + ICON.speaker + '<span class="visually-hidden">Listen</span></button>';
  }
  function unsetInert() {
    document.body.classList.remove('cf-sheet-open');
    $all('[data-cf-inert]').forEach(function (el) { el.removeAttribute('inert'); el.removeAttribute('data-cf-inert'); });
  }

  function renderTaskChat(main, idx) {
    var tasks = S.session.tasks;
    var t = tasks[idx];
    var st = taskState(t.id);
    var done = isDone(t.id);
    var R = S.rubric;
    var cs = R.confidence_scale;
    var thinkFirst = !!S.session.think_first;
    var reasonWhy = (S.session.reasons || {})[t.id];
    if (!st.opened_logged) { st.opened_logged = true; st.t0 = Date.now(); saveTaskState(t.id, st); send('/api/event', { sid: S.sid, task_id: t.id, type: 'task_open', data: {} }).catch(function () {}); }
    // A check opened on the older screen (or restored from the Decision Trail) shows as its card.
    if (st.opened && t.source_check && !st.messages.some(function (m) { return m.role === 'check'; })) { st.messages.push({ role: 'check' }); saveTaskState(t.id, st); }

    function asked() { return st.messages.some(function (m) { return m.role === 'user' && !m.help; }); }
    // Next step (19 Nov 2026): an AI answer is on screen (the Decide button is live from then on).
    function hasAnswer() { return st.messages.some(function (m) { return m.role === 'ai'; }); }
    function introOn() { return !DEMO && !done && !(S.session.done || []).length && !st.messages.length && !store.get('litmus-steps-' + S.sid); }
    function stepsGuideHtml() {
      return '<ol class="cf-guide">' + ['Ask the AI', 'Test its answer', 'Answer'].map(function (w, i) {
        return '<li><span class="n" aria-hidden="true">' + (i + 1) + '</span><span>' + w + '</span></li>';
      }).join('') + '</ol>';
    }
    // One short line from Litmus at the right moments, each once per task (never a chat bubble).
    // 19 Nov 2026 (team lead): the final step is called "Answer".
    var NEXT_LINES = { first: 'Next: test it, or answer.', checked: 'You have checked. Now answer.', three: 'Ready? Tap 3 Answer.', cap: 'That is enough testing. Answer now.' };
    var REPEAT_LINE = 'You already asked that. Its answer did not change.';
    function sameText(a, b) { var n = function (x) { return String(x || '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!?,]+$/, '').trim(); }; return !!n(a) && n(a) === n(b); }
    // Team lead: "just state you've pressed this before already". Litmus says so; the final button is highlighted.
    function repeatLine() {
      st.messages.push({ role: 'help', text: REPEAT_LINE }); st.pulse = true; saveTaskState(t.id, st);
      paint(); scrollToEnd(); say(REPEAT_LINE);
    }
    function setNext(key) {
      st.nextSeen = st.nextSeen || {};
      if (st.nextSeen[key] || done) return false;
      st.nextSeen[key] = true; st.nextLine = key; saveTaskState(t.id, st);
      return true;
    }
    function litLine(text, id, cls) {
      return '<p class="cf-nextline' + (cls ? ' ' + cls : '') + '"' + (id ? ' id="' + id + '"' : '') + '><span class="cf-nl-mark" aria-hidden="true">' + MARK_SVG + '</span><span>' + esc(text) + '</span></p>';
    }
    function nextLineHtml() {
      var k = st.nextLine;
      if (!k || done || k === 'cap') return '';
      return litLine(NEXT_LINES[k], 'cf-nextline');
    }
    function privacyHtml() {
      if (asked() || done) return '';
      return '<div class="cf-privacy"><button type="button" class="cf-textlink" id="cf-privacy" aria-expanded="false" aria-controls="cf-privacy-box">Who sees my work</button>' +
        '<div id="cf-privacy-box" hidden>' + (isPractice() ? practiceNotice() : joinNotice()) + '</div></div>';
    }
    function flashEl(el) {
      if (!el) return;
      el.classList.remove('cf-flash'); void el.offsetWidth; el.classList.add('cf-flash');
      el.scrollIntoView({ block: 'nearest' });
      setTimeout(function () { el.classList.remove('cf-flash'); }, 2100);
    }
    // Before any answer, Decide (and the step row's 3) point back to step 1: the suggestion or the message box.
    function pointToAsk() {
      var target = $('#cf-suggest') || $('#chat-form');
      flashEl(target);
      var f = $('#cf-suggest') || $('#chat-input'); if (f) f.focus({ preventScroll: true });
    }
    function noAiSaved() { return done || !!st.noAiDone; }
    function noAiOpen() { return !!(t.no_ai && st.noAiStarted && !noAiSaved()); }
    function needFirst() { return thinkFirst && !st.firstThought && !done && !st.noAiStarted; }
    function segsHtml() { return tasks.map(function (x, i) { return '<i class="' + (isDone(x.id) ? 'done' : (i === idx ? 'now' : '')) + '"></i>'; }).join(''); }
    var img = t.image ? '<img class="task-image cf-image" src="' + esc(t.image) + '" alt="' + esc(t.image_alt || '') + '" width="640" height="400">' : '';

    main.innerHTML = '<div id="cf-root"><div class="cf" id="cf">' +
      '<header class="cf-hdr" id="cf-hdr">' +
        // 19 Nov 2026 (next step, team lead's first-view ruling): the title once; the situation as a short note; the
        // step row; one small progress. No goal line, no area name (it hints at what is tested: shown after the
        // decision), no "Sometimes wrong on purpose" (said once, balanced, on the starting screen). "More" holds the
        // three steps again (and why this task was chosen, when there is a reason).
        '<div class="cf-row"><h1 id="task-title" class="cf-title" tabindex="-1"><button type="button" class="cf-title-btn" id="task-more-btn" aria-expanded="false" aria-controls="task-more"><span>' + esc(t.title) + '</span>' + ICON.chev + '</button></h1>' +
        '<button type="button" class="iconbtn cf-listen cf-listen-word" id="cf-listen-task" aria-pressed="false" aria-label="Listen: read the task aloud">' + ICON.speaker + '<span class="lw">Listen</span></button></div>' +
        '<div id="task-read"><p class="cf-situ pre" id="cf-situ">' + esc(t.context) + '</p>' +
          '<div class="cf-more" id="task-more" hidden>' + (reasonWhy ? '<p class="small muted">' + esc(reasonWhy) + '</p>' : '') + stepsGuideHtml() + '</div>' +
        '</div>' +
        '<ol class="cf-steps" id="cf-steps" aria-label="Steps in this task"></ol>' +
        '<div class="cf-track"><span class="segs" id="cf-segs" aria-hidden="true">' + segsHtml() + '</span><span class="pos" role="img" aria-label="Task ' + (idx + 1) + ' of ' + tasks.length + '">' + (idx + 1) + '/' + tasks.length + '</span></div>' +
      '</header>' +
      '<section class="cf-convo" aria-label="Chat with the AI">' + img +
        '<div class="cf-msgs" id="messages"></div>' +
        '<p class="visually-hidden" id="cf-say" aria-live="polite"></p>' +
        '<div id="cf-privacy-wrap"></div>' +
      '</section>' +
      '<footer class="cf-dock" id="cf-dock"></footer>' +
      '</div>' +
      // The starting screen (next step): before a student's first task only, once per student code on this device.
      '<div class="cf-intro" id="cf-intro" role="dialog" aria-modal="true" aria-labelledby="cf-intro-line"' + (introOn() ? '' : ' hidden') + '><div class="cf-intro-card">' +
        stepsGuideHtml() + '<p class="cf-intro-line" id="cf-intro-line">The AI is right in some tasks and wrong in others. On purpose.</p>' +
        '<button type="button" class="btn block cf-intro-go" id="cf-intro-go">Start</button></div></div>' +
      '<div class="cf-sheet" id="cf-sheet" hidden><div class="cf-scrim" data-close-sheet></div>' +
        '<div class="cf-panel" id="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-h"></div></div>' +
      '</div>';
    var root = $('#cf-root');
    // The starting screen is modal: the task behind is hidden from screen readers, Tab stays on Start.
    if (introOn()) { $('#cf').setAttribute('aria-hidden', 'true'); setTimeout(function () { var g = $('#cf-intro-go'); if (g && !$('#cf-intro').hidden) g.focus(); }, 60); }

    function say(text) { var el = $('#cf-say'); if (el) { el.textContent = ''; setTimeout(function () { el.textContent = text; }, 30); } }
    function here() { return root.isConnected; }   // false once another screen has been drawn
    function lab(x) { return '<span class="cf-lab">' + x + '</span>'; }
    function litCard(id, inner) {
      return '<div class="cf-lit" id="' + id + '"><div class="cf-who"><span class="cf-av">' + MARK_SVG + '</span>Litmus<span class="spacer"></span>' + listenSm(id + '-read', 'Listen: read this aloud') + '</div>' +
        '<div id="' + id + '-read">' + inner + '</div></div>';
    }
    // The evidence follow-up (19 Nov 2026): one button after the reveal, on the tasks the server lists
    // (S.session.followup: the judge-set tasks, only when LITMUS_FOLLOWUP_LIVE=1). One question, one short reply.
    // Never scored: the server records it as a "followup" event that scoring does not read.
    function followupOn() { return (S.session.followup || []).indexOf(t.id) >= 0; }
    function followupHtml() {
      if (!followupOn() || DEMO) return '';
      var fu = st.followup;
      if (!fu) return '<div class="cf-quick cf-fu-ask"><button type="button" class="chip" id="cf-evidence">' + ICON.check + 'Ask for its evidence</button></div>';
      if (fu.busy) return '<p class="typing"><span class="spinner" aria-hidden="true"></span> The AI is replying</p>';
      if (fu.blocked) return '<div class="msg blocked" role="alert">' + esc(fu.text) + '</div>';
      return '<div class="msg ai cf-ai cf-fu"><div class="cf-who"><span class="cf-av">' + ICON.chip + '</span>AI' + taskLabel(fu.source) + '<span class="spacer"></span>' + listenSm('cf-fu-body', 'Listen to this reply') + '</div>' +
        '<div class="cf-body" id="cf-fu-body">' + esc(fu.text) + '</div></div>';
    }
    function askEvidence(btn) {
      if (st.followup) return;
      btn.disabled = true;
      st.followup = { busy: true };
      paint(); scrollToEnd();
      api('/api/followup', { sid: S.sid, task_id: t.id }).then(function (r) {
        st.followup = { text: r.reply, source: r.source, blocked: !!r.blocked };
        saveTaskState(t.id, st);
        paint(); scrollToEnd();
        if (r.support) showSupport(r.support);
        say(r.reply);
      }).catch(function (e2) { st.followup = null; paint(); tapNote($('#cf-evidence') || $('#cf-dock'), e2.message); });
    }
    function checkCard() {
      var sc = t.source_check;
      var fnd = '';
      if (S.session.check_needs_finding) {
        fnd = st.finding ? '<p class="cf-res2" id="check-found">' + esc(foundText(st)) + '</p>'
          : '<div class="cf-find" role="group" aria-labelledby="find-h"><p class="cf-res2" id="find-h">What did you find?</p><div class="chips">' +
            (S.session.findings || []).map(function (o) { return '<button type="button" class="chip" data-finding="' + esc(o.id) + '">' + esc(o.label) + '</button>'; }).join('') + '</div></div>';
      }
      return '<div class="cf-tool cf-checked" id="check-card" tabindex="-1"><span class="tag cf-yours">Your check</span><div class="cf-tool-h">' + ICON.check + '<span>' + esc(sc.title) + '</span><span class="tag">Practice</span></div>' +
        findingsHtml(checkFindings(sc)) + fnd + '</div>';
    }
    // Tap feedback: the check (or the saved edit) is done, so step 2 and "Check it yourself" show a tick.
    function checkDone() { return !!(st.opened || (t.edit && st.edit != null && String(st.edit).trim() !== '')); }
    // The sheet's result: the same parts as the chat card, in an outlined box, headed by what was searched.
    function checkResultHtml() {
      var sc = t.source_check;
      var ask = '';
      if (S.session.check_needs_finding) {
        ask = st.finding ? '<p class="cf-res2 cf-found-now" id="check-found-s">' + ICON.tick + '<span>' + esc(foundText(st)) + '</span></p>'
          : '<div class="cf-find" role="group" aria-labelledby="find-h-s"><p class="cf-res2" id="find-h-s">What did you find?</p><div class="chips">' +
            (S.session.findings || []).map(function (o) { return '<button type="button" class="chip" data-finding="' + esc(o.id) + '">' + esc(o.label) + '</button>'; }).join('') + '</div></div>';
      }
      return '<section class="cf-result" id="check-result-box" tabindex="-1" aria-labelledby="check-res-h" aria-describedby="check-finds-s">' +
        '<div class="cf-tool-h cf-result-h" id="check-res-h">' + ICON.check + '<span>' + esc(sc.title) + '</span><span class="tag">Practice</span></div>' +
        findingsHtml(checkFindings(sc), 'check-finds-s') + ask + '</section>';
    }
    function flashCard(card) {
      if (!card) return;
      card.classList.remove('cf-flash'); void card.offsetWidth; card.classList.add('cf-flash');
      card.scrollIntoView({ block: 'start' });
      card.focus({ preventScroll: true });
      setTimeout(function () { card.classList.remove('cf-flash'); }, 2100);
    }
    function pickHtml() {
      return '<div class="cf-pick" role="group" aria-labelledby="pick-h"><p class="cf-pick-h" id="pick-h">Your decision</p><div class="cf-pick-row">' +
        R.decision_options.filter(function (o) { return !o.step && o.id !== 'verify'; }).map(function (o) {
          return '<button type="button" class="cf-pickbtn" data-pick="' + o.id + '" aria-haspopup="dialog"><span class="cf-di">' + (ICON[o.id] || '') + '</span><span>' + esc(o.label) + '</span>' + choiceCap(o.id) + '</button>';
        }).join('') + '</div></div>';
    }
    // cp_10: step 2, the things that test the answer. 19 Nov 2026 (team lead's wording): the three that go to the AI
    // carry the AI mark and sit together; "Check it yourself" (outside the AI) has its own icon and outline. The exact
    // words a button sends are its tooltip and its spoken name; a used button shows a tick.
    // After the check, its button shows the result again (scrolls to the card) instead of a second search.
    function seeAgain() { return t.source_check ? !!st.opened : checkDone(); }
    function movesHtml() {
      var used = st.moves || {};
      var what = t.source_check ? t.source_check.label : t.edit ? t.edit.label : '';
      return '<h2 class="cf-step-h" id="step2-h"><span class="visually-hidden">Step 2: </span>Test it <span class="cf-step-opt">(optional)</span></h2>' +
        '<div class="cf-moves cf-moves-step" role="group" aria-labelledby="step2-h">' +
        (st.liveDone ? [] : MOVES).map(function (m) {
          var u = !!used[m.id];   // once per task: ticked, "Asked", and a second tap gets Litmus's one line
          return '<button type="button" class="chip cf-move is-ai' + (u ? ' done' : '') + '" data-move="' + m.id + '" title="' + esc(m.text) + '" aria-label="' + esc(m.label + ': ' + m.text + (u ? ' Asked.' : '')) + '"' + (u ? ' aria-disabled="true"' : '') + '>' +
            '<span class="cf-move-k" aria-hidden="true">' + ICON.chip + '</span><span class="cf-move-l">' + esc(m.label) + (u ? '<span class="cf-move-sub">Asked</span>' : '') + '</span><span class="cf-move-i" aria-hidden="true">' + (u ? ICON.tick : ICON.send) + '</span></button>';
        }).join('') +
        (what ? '<button type="button" class="chip tool cf-move is-out' + (checkDone() ? ' done' : '') + '" id="cf-check" aria-haspopup="dialog" title="' + esc(what) + '" aria-label="' + esc('Check it yourself: ' + what + (checkDone() ? '. Done.' : '')) + '">' +
          '<span class="cf-move-k" aria-hidden="true">' + ICON.check + '</span><span class="cf-move-l">' + (seeAgain() ? 'See your check again' : 'Check it yourself') + '</span><span class="cf-move-i" aria-hidden="true">' + (checkDone() ? ICON.tick : ICON.send) + '</span></button>' : '') + '</div>';
    }
    function msgsHtml() {
      if (needFirst()) {
        return litCard('cf-ft', '<p class="cf-q" id="ft-h" tabindex="-1">Your first thought?</p><p class="cf-sub" id="cf-ft-read">Not scored.</p>') +
          '<div class="cf-quick"><button type="button" class="chip" id="ft-notsure">Not sure yet</button></div>';
      }
      var out = [];
      if (st.firstThought) out.push('<div class="msg user own ft-note">' + lab('First thought') + esc(st.firstThought) + '</div>');
      // 19 Nov 2026, round 2: while the question without the AI is open, the chat and the check are folded away
      // (testers copied the answer from the screen). They come back once the answer is saved with Done.
      if (noAiOpen()) {
        out.push('<p class="hide-note" id="hide-note">' + ICON.lock + '<span>Hidden while you answer on your own.</span></p>');
        return out.join('');
      }
      if (!st.messages.length && !done && !st.noAiStarted) {
        var sp = (t.suggested_prompts || [])[0];
        if (sp) out.push('<div class="cf-quick cf-quick-step"><button type="button" class="chip cf-suggest" id="cf-suggest">' + esc(sp) + '<span class="cf-suggest-go" aria-hidden="true">' + ICON.send + '</span></button></div>');
      }
      st.messages.forEach(function (m, i) {
        if (m.role === 'user') out.push('<div class="msg user"><span class="visually-hidden">You: </span>' + esc(m.text) + '</div>');
        else if (m.role === 'blocked') out.push('<div class="msg blocked" role="alert">' + esc(m.text) + '</div>');
        else if (m.role === 'note' || m.source === 'scripted_note') out.push('<div class="msg note">' + esc(m.text) + '</div>');
        else if (m.role === 'help') out.push(litLine(m.text, '', 'cf-help-reply'));   // Litmus's own reply, never the AI's
        else if (m.role === 'check') { if (t.source_check) out.push(checkCard()); }
        else if (m.role === 'edit') out.push('<div class="cf-tool" id="edit-card" tabindex="-1"><div class="cf-tool-h">' + ICON.check + '<span>Your edit</span><span class="tag">Saved</span></div><p class="cf-res pre">' + esc(m.text) + '</p></div>');
        else out.push('<div class="msg ai cf-ai"><div class="cf-who"><span class="cf-av">' + ICON.chip + '</span>AI' + taskLabel(m.source) + '<span class="spacer"></span>' + listenSm('cf-m' + i, 'Listen to this reply') + '</div>' +
          '<div class="cf-body" id="cf-m' + i + '">' + esc(m.text) + '</div></div>');
      });
      var last = st.messages[st.messages.length - 1];
      var replied = !!(last && last.role !== 'user' && last.role !== 'blocked') && hasAnswer();
      // 19 Nov 2026: the decision sits right under the AI's reply (one tap opens the sheet with it chosen).
      // A task with a question without the AI first says so in one line; its button is in the dock.
      if (!done && replied) {
        if (t.no_ai && !noAiSaved()) { if (!st.noAiStarted) out.push('<p class="cf-lead" id="noai-lead">Now one without the AI. <span class="cf-lead-sub">Starting it closes the chat.</span></p>'); }
      }
      if (!done && !st.noAiStarted && replied) out.push(movesHtml());
      if (st.saved) {
        var sv = st.saved;
        var opt = R.decision_options.filter(function (o) { return o.id === sv.choice; })[0] || { label: sv.choice };
        var why = (sv.tags || []).map(function (id) { return TAG_SHORT[id] || ((R.reason_tags.filter(function (x) { return x.id === id; })[0] || {}).label) || id; });
        if (sv.reason) why.push(sv.reason);
        out.push('<div class="msg user own cf-receipt"><span class="visually-hidden">Your decision: </span><span class="cf-rc"><span class="cf-di">' + (ICON[sv.choice] || '') + '</span>' + esc(opt.label) + (sv.conf ? ' · ' + esc(cs[sv.conf - 1].label) : '') + '</span>' +
          (why.length ? '<span class="cf-rc-why">' + esc(why.join('. ')) + '</span>' : '') + '</div>');
        if (sv.reveal) {
          var rv = sv.reveal;
          out.push(litCard('cf-reveal', (t.area_name ? '<p class="cf-area"><span class="tag">' + esc(t.area_name) + '</span></p>' : '') + taskPointsHtml(sv, rv) + '<p class="cf-rv-h" id="reveal-h" tabindex="-1">' + (rv.ai_correct ? 'The AI was right here.' : 'What it got wrong') + '</p>' +
            '<p class="cf-rv">' + esc(String(rv.text).replace(/^None\.\s*/, '')) + '</p>' + (rv.correction ? '<p class="cf-rv">' + esc(rv.correction) + '</p>' : '')));
          out.push(followupHtml());
        }
      }
      return out.join('');
    }
    // cp_9 MUST 3: after each saved task, its points and one line about the student's own choice.
    // 19 Nov 2026 (team lead): the number, one verdict line, and "Explain" opening the score's parts in place.
    function taskPointsHtml(sv, rv) {
      if (rv.points == null) return '';
      var b = rv.breakdown;
      var line = b ? b.line : rv.verdict ? (sv.choice === rv.verdict ? 'Right call.' : 'Not this time.') : '';
      return '<p class="cf-rv-pts" id="rv-pts"><span class="visually-hidden">Task ' + rv.n + ': </span><b>' + rv.points + ' out of 100.</b>' +
        (b ? ' ' + explainBtn('bd-task-' + t.id) : '') + '</p><p class="cf-rv-line" id="rv-line">' + esc(line) + '</p>' +
        (b ? breakdownHtml(b, 'bd-task-' + t.id) : '');
    }
    function composerHtml(ft) {
      var id = ft ? 'ft-input' : 'chat-input';
      return '<form id="' + (ft ? 'ft-form' : 'chat-form') + '" class="cf-composer" novalidate><label class="visually-hidden" for="' + id + '">' + (ft ? 'Your first thought' : 'Your message to the AI') + '</label>' +
        micBtn(id) + '<textarea id="' + id + '" rows="1" maxlength="' + (ft ? 1000 : 2000) + '" placeholder="' + (ft ? 'A few words' : 'Or type your own') + '"' + (ft ? ' aria-describedby="cf-ft-read"' : (asked() ? '' : ' aria-describedby="cf-helper"')) + '></textarea>' +
        '<button class="cf-send" type="submit" aria-label="Send">' + ICON.send + '</button></form>' + (ft ? '<p class="error" id="ft-error" role="alert"></p>' : (asked() ? '' : '<p class="cf-helper" id="cf-helper">No personal details.</p>'));
    }
    function dockHtml() {
      if (done) {
        var all = S.session.done.length === tasks.length;
        return '<button type="button" class="btn block" id="cf-next">' + (all ? 'See my results' : 'Next task') + ICON.send + '</button>';
      }
      var ans = hasAnswer();
      var decideBtn = '<button type="button" class="btn block cf-decide3 cf-decide-big' + (ans ? '' : ' is-off') + (st.pulse ? ' cf-pulse' : '') + '" id="cf-decide" aria-haspopup="dialog"' + (ans ? '' : ' aria-disabled="true"') + '>' +
        '<span class="n" aria-hidden="true">3</span><span class="cf-d-t"><span class="cf-d-l">Answer</span><span class="cf-d-s">' + (ans ? 'Is the AI\'s answer right?' : 'Ask first') + '</span></span></button>';
      var noAiBtn = '<button type="button" class="btn secondary block" id="cf-noai" aria-haspopup="dialog">' + ICON.lock + 'Answer without AI</button>';
      if (st.noAiStarted) return '<p class="locked">' + ICON.lock + ' Chat closed for this task.</p>' + (noAiSaved() ? decideBtn : noAiBtn);
      if (needFirst()) return composerHtml(true);
      // cp_10: the message box first (steps 1 and 2 send), then the one way to decide.
      // Next step: the line from Litmus sits right above the button; with the live replies used up the message box
      // closes with that line in it.
      return (st.liveDone ? litLine(NEXT_LINES.cap, 'cf-closed', 'cf-closed') : composerHtml(false)) + nextLineHtml() +
        (asked() && t.no_ai && !noAiSaved() ? noAiBtn : decideBtn);
    }
    // cp_10 (ruling 17:41): once a reply has arrived, the four test buttons sit in view above the pinned bar.
    function showTests() {
      var mv = $('.cf-moves-step'), dk = $('#cf-dock');
      if (!mv || !dk) return;
      var r = mv.getBoundingClientRect(), d = dk.getBoundingClientRect();
      if (r.bottom > d.top - 8) window.scrollBy(0, r.bottom - d.top + 12);
    }
    function scrollToEnd() {
      var box = $('#messages');
      var lastEl = box && box.lastElementChild;
      var target = lastEl && lastEl.classList.contains('cf-moves') ? lastEl.previousElementSibling : lastEl;
      if (target && target.classList.contains('cf-ai') && target.offsetHeight > window.innerHeight / 2) { target.scrollIntoView({ block: 'start' }); return; }
      window.scrollTo(0, document.documentElement.scrollHeight);
    }
    function paint() {
      if (!here()) return;
      $('#messages').innerHTML = msgsHtml();
      $('#cf-dock').innerHTML = dockHtml();
      var pw = $('#cf-privacy-wrap'); if (pw) pw.innerHTML = privacyHtml();
      if (st.pulse) { st.pulse = false; saveTaskState(t.id, st); }   // the Decide button pulses once
      $('#cf-segs').innerHTML = segsHtml();
      var stp = $('#cf-steps'); if (stp) stp.innerHTML = stepsHtml();
    }
    // cp_10: the task's three steps. 1 Ask (until the first reply), 2 Test it, 3 Decide (the sheet open, or saved).
    function stepNow() {
      if (done) return 4;
      if (sheet.kind === 'decide') return 3;
      return st.messages.some(function (m) { return m.role === 'ai'; }) ? 2 : 1;
    }
    function stepsHtml() {
      var now = stepNow();
      return [[1, 'Ask'], [2, 'Test it'], [3, 'Answer']].map(function (x) {
        var state = x[0] < now ? 'done' : x[0] === now ? 'now' : '';
        var ticked = state === 'done' || (x[0] === 2 && state === 'now' && checkDone());   // tap feedback: the check is done
        return '<li class="' + state + (ticked && state === 'now' ? ' checked' : '') + '"' + (state === 'now' ? ' aria-current="step"' : '') + '><button type="button" class="cf-stepbtn" data-step="' + x[0] + '"><span class="n" aria-hidden="true">' + (ticked ? ICON.tick : x[0]) + '</span>' +
          '<span class="visually-hidden">Step ' + x[0] + (state === 'done' ? ', done: ' : ': ') + '</span>' + x[1] + '</button></li>';
      }).join('');
    }

    /* the chat */
    function sendChat(text) {
      if (st.messages.some(function (m) { return m.role === 'user' && !m.help && sameText(m.text, text); })) {
        st.messages.push({ role: 'user', text: text, help: true });
        repeatLine();
        return;
      }
      st.messages.push({ role: 'user', text: text });
      saveTaskState(t.id, st);
      paint();
      var typing = document.createElement('p');
      typing.className = 'typing';
      typing.innerHTML = '<span class="spinner" aria-hidden="true"></span> The AI is replying';
      $('#messages').appendChild(typing);
      scrollToEnd();
      var turn = st.messages.filter(function (m) { return m.role === 'ai'; }).length;
      api('/api/chat', { sid: S.sid, task_id: t.id, message: text }).then(function (r) {
        if (r.source === 'litmus_repeat') {
          var mineR = st.messages.filter(function (m) { return m.role === 'user'; }).pop();
          if (mineR) mineR.help = true;
          repeatLine();
          return;
        }
        if (r.source === 'litmus_help') {
          // "I don't get this": Litmus answers (no AI, no turn). The second time the decision opens with one line.
          var mineH = st.messages.filter(function (m) { return m.role === 'user'; }).pop();
          if (mineH) mineH.help = true;
          st.messages.push({ role: 'help', text: r.reply });
          var openNow = r.help >= 2 && hasAnswer();
          if (!openNow) st.pulse = true;
          saveTaskState(t.id, st);
          paint(); scrollToEnd();
          say(r.reply);
          if (openNow) { openSheet('decide', $('#cf-decide')); sheet.helpLine = r.sheet_line; drawSheet(); }
          return;
        }
        if (r.blocked) { st.messages.push({ role: 'blocked', text: r.pause ? 'Not sent to the AI.' : r.reply }); if (r.pause) showSupport(r.reply); }
        else {
          if (r.pii_removed && r.pii_removed.length) {
            // The student's bubble shows what was stored: each removed detail as "[removed]" (19 Nov 2026).
            var mine = st.messages.filter(function (m) { return m.role === 'user'; }).pop();
            if (mine && r.message) mine.text = String(r.message).replace(/\[[^\]]* removed\]/g, '[removed]');
            st.messages.push({ role: 'note', text: 'Removed before storing: ' + r.pii_removed.join(', ') + '.' });
          }
          st.messages.push({ role: 'ai', text: r.reply, id: r.response_id, source: r.source });
          // Next step: what to do next, once each, at its moment.
          var nAi = st.messages.filter(function (m) { return m.role === 'ai'; }).length;
          var nMine = st.messages.filter(function (m) { return m.role === 'user' && !m.help; }).length;
          if (r.live_done) { st.liveDone = true; setNext('cap'); }
          else if (nMine >= 3 && setNext('three')) st.pulse = true;
          else if (nAi === 1 && setNext('first')) st.pulse = true;
        }
        saveTaskState(t.id, st);
        paint(); scrollToEnd(); showTests();
        say((r.blocked ? '' : 'AI: ') + r.reply + (st.nextLine && !r.blocked ? ' ' + NEXT_LINES[st.nextLine] : ''));
        followMode(r);
      }, function (e2) {
        if (e2.offline) {
          queue('/api/chat', { sid: S.sid, task_id: t.id, message: text });
          var reply = localDemoReply(t, text, turn);
          st.messages.push({ role: 'ai', text: reply.text, id: reply.id, source: 'offline' });
          saveTaskState(t.id, st); paint(); scrollToEnd(); say('AI: ' + reply.text);
        } else {
          if (e2.status === 409) { st.messages.push({ role: 'note', text: e2.message }); saveTaskState(t.id, st); }
          paint();
          tapNote($('#chat-form') || $('#cf-dock'), e2.message);
        }
      });
    }
    // Think first, in the chat: Litmus asks, the student answers in the message box (or "Not sure yet").
    function saveFirstThought(v, btn) {
      var err = $('#ft-error');
      if (err) err.textContent = '';
      if (!v) { if (err) err.textContent = "Write a few words first, or tap 'Not sure yet'."; var fi = $('#ft-input'); if (fi) fi.focus(); return; }
      if (btn) btn.disabled = true;
      send('/api/event', { sid: S.sid, task_id: t.id, type: 'first_thought', data: { text: v } }).then(function (r) {
        st.firstThought = v; saveTaskState(t.id, st);
        if (window.LitmusApp.onSupport) window.LitmusApp.onSupport(r);
        paint();
        var ci = $('#chat-input'); if (ci) ci.focus();
      }, function (e2) {
        if (btn) btn.disabled = false;
        if (e2.status === 409 && /already saved/.test(e2.message)) { st.firstThought = v; saveTaskState(t.id, st); paint(); return; }
        if (err) err.textContent = e2.message; else toast(e2.message);
      });
    }

    /* sheets: the check, the question without AI, the decision (three steps in one sheet) */
    var sheet = { kind: null, step: 1, opener: null };
    function sheetHead(title, step, back) {
      var marks = step ? '<span class="cf-stepmarks" aria-hidden="true">' + [1, 2, 3].map(function (n) { return '<i class="' + (n < step ? 'done' : n === step ? 'now' : '') + '"></i>'; }).join('') + '</span>' : '';
      return '<div class="cf-grab" aria-hidden="true"></div><div class="cf-sheet-head">' +
        (back ? '<button type="button" class="cf-textbtn" data-sheet-back aria-label="Back">' + ICON.back + '</button>' : '') +
        '<h2 id="sheet-h" tabindex="-1">' + esc(title) + (step ? '<span class="visually-hidden">, step ' + step + ' of 3</span>' : '') + '</h2><span class="spacer"></span>' +
        listenSm('sheet-body', 'Listen: read this aloud') + '<button type="button" class="cf-textbtn cf-x" data-close-sheet aria-label="Close"><span aria-hidden="true">×</span></button></div>' + marks;
    }
    // cp_9 (19 Nov 2026, testers chose Verify and never checked): Verify means check. The line's room is kept when it
    // is hidden, so the list below never moves on a tap.
    var verifyReturn = false;   // "Check it now" was pressed: come back to the decision sheet once the check is recorded
    function checkRecorded() { return !!((st.opened && (!S.session.check_needs_finding || st.finding)) || (t.edit && st.edit != null && String(st.edit).trim() !== '')); }
    // cp_9 MUST 5: the reasons' order is fixed the first time this task's sheet opens, then kept for the task.
    // cp_12 (text audit): the first reasons, then "More reasons" opening the rest in place below.
    // ui_audit C2 (20 Nov 2026, ruling): the first FOUR (the order already puts the task's own reasons first); once
    // "More reasons" is opened it stays open for this task; a chosen reason is always shown.
    var CHIPS_FIRST = 4;
    function chipsFirstHtml(tags, choice, picked) {
      var all = chipsHtml(tags, choice, picked);
      if (!choice) return all;
      var box = document.createElement('div'); box.innerHTML = all;
      var chips = Array.prototype.slice.call(box.querySelectorAll('[data-tag]'));
      if (chips.length <= CHIPS_FIRST) return all;
      var rest = chips.slice(CHIPS_FIRST), open = !!st.moreReasons || rest.some(function (b) { return (picked || []).indexOf(b.dataset.tag) >= 0; });
      return chips.slice(0, CHIPS_FIRST).map(function (b) { return b.outerHTML; }).join('') +
        '<button type="button" class="chip more-reasons" id="more-reasons" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="chips-rest"' + (open ? ' hidden' : '') + '>More reasons</button>' +
        '<span class="chips-rest" id="chips-rest"' + (open ? '' : ' hidden') + '>' + rest.map(function (b) { return b.outerHTML; }).join('') + '</span>';
    }
    function chipOrder() { if (!st.chipsFor && st.choice) { st.chipsFor = st.choice; saveTaskState(t.id, st); } return st.chipsFor || ''; }
    // cp_10 (ruling 17:41): one line under the choices, always there, never taller: what to do next, in a few words.
    function verifyNeedInner() {
      if (!st.choice) return '';   // 19 Nov 2026: no "Pick one."
      if (st.choice !== 'verify' || (!t.source_check && !t.edit)) return '';
      return checkRecorded() ? '<p class="cf-vn-text">Checked. See the chat.</p>'
        : '<p class="cf-vn-text">Not checked yet.</p><button type="button" class="btn small secondary" id="verify-check-now">' + ICON.check + 'Check it yourself</button>';
    }
    function verifyNeedHtml() {
      var inner = verifyNeedInner();
      return '<div class="cf-verify-need cf-vn-line' + (inner ? '' : ' empty') + '" id="verify-need" role="status">' + inner + '</div>';
    }
    function showVerifyNeed() {
      var v = $('#verify-need'); if (!v) return;
      var inner = verifyNeedInner();
      v.innerHTML = inner;
      v.classList.toggle('empty', !inner);
    }
    // 19 Nov 2026: the decision, the reason, and how sure on one sheet with one Done (was three steps).
    // 19 Nov 2026 (one clear answer): before the task's check, The AI is right / The AI is wrong / Check it first
    // (it opens the task's own check and comes back here); after the check, "Your check:" at the top and the two
    // verdicts only. A task with no check shows the two verdicts.
    // 20 Nov 2026 (owner: "define who you're talking about"): the sheet names its subject. Top to bottom: "The AI said:"
    // and the AI's first answer, "Your check:" once the check is done, the question "Is the AI right?", then the
    // verdicts "The AI is right" / "The AI is wrong" (the card game's words). Ids, scoring and shortcuts are unchanged.
    function aiSaidHtml() {
      var first = st.messages.filter(function (m) { return m.role === 'ai' && m.source !== 'scripted_note'; })[0];
      var s = String((first && first.text) || '').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      if (s.length > 110) { var cut = s.slice(0, 110), sp = cut.lastIndexOf(' '); s = (sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '') + '…'; }
      return '<p class="cf-aisaid" id="ai-said"><b>The AI said:</b> “' + esc(s) + '”</p>';
    }
    function decideBody() {
      if (st.choice === 'verify') st.choice = null;   // an older saved "verify" is not an answer
      var hasCheck = !!(t.source_check || t.edit), checked = hasCheck && checkDone();
      var verdicts = R.decision_options.filter(function (o) { return !o.step && o.id !== 'verify'; });
      var first = hasCheck && !checked ? R.decision_options.filter(function (o) { return o.step || o.id === 'verify'; })[0] : null;
      return sheetHead('Your answer', 0, false) + '<div class="cf-sheet-body" id="sheet-body">' +
        (sheet.helpLine ? '<p class="cf-pickone" id="cf-pickone">' + esc(sheet.helpLine) + '</p>' : '') +
        aiSaidHtml() +
        (t.source_check && st.opened ? yourCheckHtml(t.source_check) : '') +
        '<h3 class="cf-sub-h cf-sub-tight cf-verdict-h" id="verdict-h">Is the AI right?</h3>' +
        '<div class="cf-seg' + (first ? '' : ' cf-seg2') + '" role="group" aria-labelledby="verdict-h">' +
          verdicts.map(function (o) {
            return '<button type="button" class="cf-segbtn" data-choice="' + o.id + '" aria-pressed="' + (st.choice === o.id ? 'true' : 'false') + '"><span class="cf-di">' + (ICON[o.id] || '') + '</span><span>' + esc(o.label) + '</span>' + choiceCap(o.id) + '</button>';
          }).join('') +
          (first ? '<button type="button" class="cf-segbtn cf-checkfirst" id="verify-check-now"><span class="cf-di">' + ICON.verify + '</span><span>' + esc(first.label) + '</span>' + choiceCap('verify') + '</button>' : '') +
        '</div>' + verifyNeedHtml() +
        // 19 Nov 2026, round 2: how sure sits right under the choices, as one compact row (it was below the reasons, off screen).
        '<h3 class="cf-sub-h cf-sub-tight" id="conf-h">How sure?</h3>' +
        '<div class="cf-crow5" role="group" aria-labelledby="conf-h">' + cs.map(function (c) {
          return '<button type="button" class="cf-c5" data-conf="' + c.value + '" aria-pressed="' + (st.conf === c.value ? 'true' : 'false') + '" aria-label="' + c.value + ', ' + esc(c.label) + '">' + c.value + '<span class="cf-c5-w" aria-hidden="true">' + esc(c.label) + '</span></button>';
        }).join('') + '</div><p class="cf-c5-ends small muted" aria-hidden="true"><span>' + esc(cs[0].label) + '</span><span id="conf-now">' + (st.conf ? esc(cs[st.conf - 1].label) : '') + '</span><span>' + esc(cs[cs.length - 1].label) + '</span></p>' +
        '<h3 class="cf-sub-h" id="why-h">Why?</h3>' +
        '<p class="visually-hidden" id="reason-help">Tap up to 3 reasons, type, or speak.</p>' +
        '<div class="chips" id="reason-chips" role="group" aria-labelledby="why-h" data-built-for="' + esc(chipOrder()) + '">' + chipsFirstHtml(R.reason_tags, chipOrder(), st.tags) + '</div><p class="small muted cf-count" id="reason-count">' + reasonCount(st) + '</p>' +
        '<label class="field"><span class="visually-hidden">Your reason in your own words</span><div class="with-mic"><textarea id="reason" rows="2" maxlength="2000" placeholder="' + (st.choice ? 'Or in your words' : 'Choose first.') + '" aria-describedby="reason-help">' + esc(st.reason) + '</textarea>' + micBtn('reason') + '</div></label></div>' +
        '<div class="cf-foot"><p class="error cf-missing" id="decide-error" role="alert"></p><button type="button" class="btn block" id="submit-task">Done</button></div>';
    }
    // Tap feedback (19 Nov 2026): the check answers in this sheet, where the tap was. The button shows "Searching…",
    // then the result box replaces it; one button goes back. A done check shows its result at once when reopened.
    function checkBody() {
      var sc = t.source_check;
      var shown = !!(sc && (sheet.res || st.opened));
      return sheetHead('Check it yourself', 0, false) + '<div class="cf-sheet-body" id="sheet-body">' +
        (sc ? (shown ? checkResultHtml() : '<div class="cf-tool-h">' + ICON.check + '<span>' + esc(sc.title) + '</span><span class="tag">Practice</span></div>' +
          '<button type="button" class="btn block cf-gap" id="open-check">' + ICON.check + '<span>' + esc(sc.label) + '</span></button>') : '') +
        (t.edit ? '<div class="cf-edit"><button type="button" class="btn secondary block" id="open-edit" aria-expanded="false" aria-controls="edit-box">' + esc(t.edit.label) + '</button>' +
          '<div id="edit-box" hidden><label class="field"><span>Your edited version</span><div class="with-mic"><textarea id="edit-text" rows="6" maxlength="4000">' + esc(st.edit != null ? st.edit : t.edit.start_text) + '</textarea>' + micBtn('edit-text') + '</div></label>' +
          '<button type="button" class="btn block" id="save-edit">Save my edit</button></div>' +
          (sheet.editSaved ? '<section class="cf-result" id="edit-saved-box" tabindex="-1" aria-labelledby="edit-saved-h"><div class="cf-tool-h cf-result-h" id="edit-saved-h">' + ICON.check + '<span>Your edit</span></div>' +
            findingsHtml([{ headline: 'Saved', line: String(st.edit || ''), sign: 'good' }]) + '</section>' : '') + '</div>' : '') + '</div>' +
        (shown || sheet.editSaved ? '<div class="cf-foot"><button type="button" class="btn block" id="check-back">' + (sheet.back === 'decide' ? 'Back to my decision' : 'Back to the task') + '</button></div>' : '');
    }
    function noAiBody() {
      if (!st.noAiStarted) {
        return sheetHead('Without AI', 0, false) + '<div class="cf-sheet-body" id="sheet-body"><p><b>Now one without the AI.</b> The chat closes for this task.</p></div>' +
          '<div class="cf-foot"><button type="button" class="btn block" id="start-noai">Start the question</button></div>';
      }
      return sheetHead('Without AI', 0, false) + '<div class="cf-sheet-body" id="sheet-body"><fieldset class="cf-fs"><legend id="noai-q" class="q-legend">' + esc(t.no_ai.prompt) + '</legend><div class="options">' +
        t.no_ai.options.map(function (o, i) { return '<label class="option"><input type="radio" name="noai" value="' + i + '" ' + (st.noAiAnswer === i ? 'checked' : '') + '><span>' + esc(o) + '</span></label>'; }).join('') +
        '</div></fieldset></div><div class="cf-foot"><p class="error" id="noai-error" role="alert"></p><button type="button" class="btn block" id="noai-done">Done</button></div>';
    }
    function drawSheet() {
      var p = $('#sheet-panel');
      p.innerHTML = sheet.kind === 'decide' ? decideBody() : sheet.kind === 'check' ? checkBody() : noAiBody();
      var h = $('#sheet-h'); if (h) h.focus();
    }
    function openSheet(kind, opener) {
      sheet.kind = kind; sheet.step = 1; sheet.opener = opener && opener.id;
      sheet.res = null; sheet.editSaved = false; sheet.last = null; sheet.helpLine = null;   // what this sheet has answered
      $('#cf-sheet').hidden = false;
      document.body.classList.add('cf-sheet-open');
      ['#cf', '.topbar', '#foot', '.skip-link'].forEach(function (sel) { var el = $(sel); if (el) { el.setAttribute('inert', ''); el.setAttribute('data-cf-inert', ''); } });
      drawSheet();
      var stp = $('#cf-steps'); if (stp) stp.innerHTML = stepsHtml();
    }
    function closeSheet(focusId) {
      if (!sheet.kind) return;
      sheet.kind = null; sheet.back = null;
      $('#cf-sheet').hidden = true;
      $('#sheet-panel').innerHTML = '';
      unsetInert();
      paint();
      var f = (focusId && document.getElementById(focusId)) || (sheet.opener && document.getElementById(sheet.opener)) || $('#cf-decide') || $('#chat-input') || $('#cf-next');
      if (f) f.focus({ preventScroll: true });
    }

    function saveDecision(btn) {
      var err = $('#decide-error');
      err.textContent = '';
      var missing = [];
      if (!asked()) missing.push('send at least one message to the AI');
      if (t.no_ai && st.noAiAnswer == null) missing.push('answer the question without AI');
      if (!st.choice) missing.push('say if the AI is right or wrong');
      if (!st.reason.trim() && !st.tags.length) missing.push('give a reason (tap, type, or speak)');
      if (!st.conf) missing.push('say how sure you are');
      if (missing.length) {
        // 19 Nov 2026, round 2: say what is missing in a few words beside Done, then take the student to it.
        var keys = [];
        if (!st.choice) keys.push('choice');
        if (!st.conf) keys.push('conf');
        if (!st.reason.trim() && !st.tags.length) keys.push('reason');
        if (!asked()) keys.unshift('ask');
        if (t.no_ai && st.noAiAnswer == null) keys.unshift('noai');
        err.textContent = 'Still to do: ' + keys.map(function (k) { return MISSING_WORDS[k]; }).join(', ') + '.';
        var target = keys[0] === 'choice' ? $('[data-choice]', root) : keys[0] === 'conf' ? $('[data-conf]', root) : keys[0] === 'reason' ? ($('#reason-chips [data-tag]', root) || $('#reason', root)) : null;
        if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
        return;
      }
      tapBusy(btn, true);
      var mode = st.inputMode === 'spoken' ? 'spoken' : (st.reason.trim() ? 'typed' : 'tapped');
      var jobs = [];
      if (t.no_ai) jobs.push(send('/api/event', { sid: S.sid, task_id: t.id, type: 'no_ai_answer', data: { answer: st.noAiAnswer } }));
      jobs.push(send('/api/event', { sid: S.sid, task_id: t.id, type: 'task_time', data: { ms: Date.now() - (st.t0 || Date.now()) } }));
      Promise.all(jobs).then(function () {
        return send('/api/decision', { sid: S.sid, task_id: t.id, choice: st.choice, reason: st.reason, tags: st.tags, confidence: st.conf, input_mode: mode });
      }).then(function (saved) {
        st.saved = { choice: st.choice, conf: st.conf, tags: st.tags.slice(), reason: st.reason.trim(),
          reveal: saved && saved.what_was_going_on ? { ai_correct: !!saved.ai_correct, text: saved.what_was_going_on, correction: saved.correction || '',
            points: saved.task_score != null ? saved.task_score : null, best: saved.best_choices || [], n: saved.task_number || (idx + 1),
            verdict: saved.verdict || null, breakdown: saved.breakdown || null } : null };
        saveTaskState(t.id, st);
        if (S.session.done.indexOf(t.id) < 0) S.session.done.push(t.id);
        done = true;
        if (window.LitmusApp.onTaskSaved && window.LitmusApp.onTaskSaved(t, idx) === false) { tapBusy(btn, false); return; }
        closeSheet('cf-next');
        if (saved && saved.support) showSupport(saved.support);
        scrollToEnd();
        var rh = $('#reveal-h');
        if (rh) { rh.focus({ preventScroll: true }); say(readable($('#cf-reveal-read'))); }
      }).catch(function (e2) { tapBusy(btn, false); err.textContent = e2.message; });
    }
    function nextTask(btn) {
      if (S.session.done.length === tasks.length) {
        if (S.session.has_results) { go(isJudge() ? 'card' : 'results'); return; }
        if (!S.online) { tapNote(btn, 'Saved. Connect to the internet to see your results.'); return; }
        tapBusy(btn, true);
        api('/api/score', { sid: S.sid }).then(function (res) { S.results = res; S.session.has_results = true; S.coach = []; scrubTypedText(S.sid, S.session.round); go(isJudge() ? 'card' : 'results'); },
          function (e) { tapBusy(btn, false); tapNote(btn, e.message); });
        return;
      }
      go('task', idx + 1 < tasks.length && !isDone(tasks[idx + 1].id) ? idx + 1 : firstOpenTask());
      window.scrollTo(0, 0);
    }

    /* one set of handlers for the whole screen and its sheets */
    root.addEventListener('click', function (e) {
      var el = e.target.closest('button, [data-close-sheet]');
      if (!el || !root.contains(el)) return;
      // The task's Listen (19 Nov 2026): the task's text in full, then the AI's latest reply.
      if (el.id === 'cf-listen-task') {
        var lastAi = st.messages.filter(function (m) { return m.role === 'ai'; }).pop();
        speak([t.title, t.context, t.goal].concat(lastAi ? ['The AI said: ' + lastAi.text] : []).join('. '), el);
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'tts_used', data: {} }).catch(function () {});
        return;
      }
      if (el.id === 'task-more-btn') { var mb = $('#task-more'); mb.hidden = !mb.hidden; el.setAttribute('aria-expanded', mb.hidden ? 'false' : 'true'); return; }
      if (el.id === 'noai-done') {
        if (st.noAiAnswer == null) { var ne = $('#noai-error'); if (ne) ne.textContent = 'Pick an answer first.'; var nf = $('input[name="noai"]'); if (nf) nf.focus(); return; }
        st.noAiDone = true; saveTaskState(t.id, st); closeSheet(); return;
      }
      if (el.hasAttribute('data-close-sheet')) { closeSheet(); return; }
      if (el.hasAttribute('data-sheet-back')) { sheet.step = Math.max(1, sheet.step - 1); drawSheet(); return; }
      if (el.dataset.move) {
        if ((st.moves || {})[el.dataset.move]) { repeatLine(); return; }
        var mv = MOVES.filter(function (m) { return m.id === el.dataset.move; })[0];
        if (mv) { st.moves = st.moves || {}; st.moves[mv.id] = true; sendChat(mv.text); }   // its words show at once as the student's bubble
        return;
      }
      // One tap sends the suggested question (19 Nov 2026). The guided demo still shows it typed, then sent.
      if (el.id === 'cf-suggest' && !DEMO) { sendChat(el.textContent); return; }
      if (el.dataset.pick) { st.choice = el.dataset.pick; saveTaskState(t.id, st); openSheet('decide', el); return; }
      if (el.id === 'cf-suggest') { var ci = $('#chat-input'); if (ci) { ci.value = el.textContent; ci.dispatchEvent(new Event('input', { bubbles: true })); var cs = $('#chat-form .cf-send'); (cs || ci).focus(); if (cs) cs.classList.add('ready'); } return; }
      if (el.id === 'ft-notsure') { saveFirstThought('Not sure yet', el); return; }
      if (el.id === 'cf-check') {
        if (seeAgain()) { flashCard(t.source_check ? $('#check-card') : $('#edit-card')); if (t.source_check) say(t.source_check.result); return; }
        openSheet('check', el); return;
      }
      if (el.id === 'more-reasons') { st.moreReasons = true; saveTaskState(t.id, st); var cr = $('#chips-rest'); if (cr) cr.hidden = false; el.hidden = true; el.setAttribute('aria-expanded', 'true'); var f1 = cr && cr.querySelector('[data-tag]'); if (f1) f1.focus(); return; }
      if (el.id === 'verify-check-now') { verifyReturn = true; openSheet('check', $('#cf-decide') || el); sheet.back = 'decide'; drawSheet(); return; }
      // 19 Nov 2026: one tap starts the question without the AI (the line above it says the chat then closes).
      if (el.id === 'cf-noai') {
        if (!st.noAiStarted) {
          st.noAiStarted = true; saveTaskState(t.id, st);
          send('/api/event', { sid: S.sid, task_id: t.id, type: 'no_ai_started', data: {} }).catch(function () {});
        }
        paint();   // the chat folds away while the question is open
        openSheet('noai', el);
        return;
      }
      if (el.id === 'cf-decide') { if (!hasAnswer()) { pointToAsk(); return; } openSheet('decide', el); return; }
      if (el.id === 'cf-intro-go') {
        store.set('litmus-steps-' + S.sid, '1');
        $('#cf-intro').hidden = true; $('#cf').removeAttribute('aria-hidden');
        var f0 = $('#cf-suggest') || $('#chat-input') || $('#ft-input'); if (f0) f0.focus();
        return;
      }
      if (el.dataset.step) {
        var sn = +el.dataset.step;
        if (sn === 1 || (sn === 2 && !$('.cf-moves-step')) || (sn === 3 && !hasAnswer())) {
          if (sn === 1 && hasAnswer()) { var fm = $('#messages .cf-ai'); if (fm) { fm.scrollIntoView({ block: 'start' }); flashEl(fm); } var ci1 = $('#chat-input'); if (ci1) ci1.focus({ preventScroll: true }); return; }
          pointToAsk(); return;
        }
        if (sn === 2) { var mv2 = $('.cf-moves-step'); mv2.scrollIntoView({ block: 'center' }); flashEl(mv2); var b2 = mv2.querySelector('button'); if (b2) b2.focus({ preventScroll: true }); return; }
        if (sn === 3 && !done) { openSheet('decide', $('#cf-decide')); return; }
        if (sn === 3 && done) { var rv3 = $('#cf-reveal'); if (rv3) { rv3.scrollIntoView({ block: 'start' }); flashEl(rv3); } return; }
        return;
      }
      if (el.id === 'cf-privacy') {
        var pb = $('#cf-privacy-box'); pb.hidden = !pb.hidden; el.setAttribute('aria-expanded', pb.hidden ? 'false' : 'true');
        if (!pb.hidden) pb.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (el.id === 'cf-next') { nextTask(el); return; }
      if (el.id === 'cf-evidence') { askEvidence(el); return; }
      if (el.dataset.finding) {
        // Tap feedback: the answer shows where the tap was at once (in the sheet, or on the card); the event follows.
        var prevFinding = st.finding;
        st.finding = el.dataset.finding; saveTaskState(t.id, st);
        var inSheet = sheet.kind === 'check';
        if (inSheet) { drawSheet(); var fs = $('#check-found-s'); if (fs) { fs.setAttribute('tabindex', '-1'); fs.focus(); } }
        else { paint(); var cf = $('#check-found'); if (cf) { say(cf.textContent); flashCard($('#check-card')); } }
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'source_finding', data: { found: st.finding } }).then(function () {
          if (!inSheet && verifyReturn) { verifyReturn = false; openSheet('decide', $('#cf-decide')); }   // cp_9: back to the decision, choice kept
        }, function (e2) { st.finding = prevFinding; saveTaskState(t.id, st); if (sheet.kind === 'check') drawSheet(); else paint(); tapNote($('#check-result-box .cf-find') || $('#check-card'), e2.message); });
        return;
      }
      if (el.id === 'open-check') {
        if (el.disabled) return;
        if (!st.opened) { st.opened = true; send('/api/event', { sid: S.sid, task_id: t.id, type: 'source_opened', data: {} }).catch(function () {}); }
        if (!st.messages.some(function (m) { return m.role === 'check'; })) st.messages.push({ role: 'check' });
        saveTaskState(t.id, st);
        // Tap feedback (19 Nov 2026): the sheet stays open. A short "Searching…" on the button, then the result here.
        var showResult = function () {
          if (!here() || sheet.kind !== 'check') return;
          sheet.res = true; sheet.last = 'check';
          drawSheet();
          var box = $('#check-result-box'); if (box) box.focus();
        };
        if (reduceMotion()) { showResult(); return; }
        el.disabled = true; el.setAttribute('aria-busy', 'true');
        el.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Searching…</span>';
        setTimeout(showResult, 600);
        return;
      }
      // Tap feedback: one way back. To the decision (with "Your check" at its top), or to the task, where the
      // result card is scrolled into view and outlined.
      if (el.id === 'check-back') {
        var toDecide = sheet.back === 'decide', last = sheet.last;
        sheet.back = null; verifyReturn = false;
        if (toDecide) {
          openSheet('decide', $('#cf-decide'));
          if (last !== 'edit' && t.source_check) say('Check done. ' + t.source_check.result);
          return;
        }
        closeSheet();
        if (setNext('checked')) paint();
        var card = last === 'edit' || !t.source_check ? $('#edit-card') : $('#check-card');
        flashCard(card);
        if (card && last !== 'edit' && t.source_check) say(t.source_check.result);
        return;
      }
      if (el.id === 'open-edit') { var eb = $('#edit-box'); eb.hidden = !eb.hidden; el.setAttribute('aria-expanded', eb.hidden ? 'false' : 'true'); if (!eb.hidden) $('#edit-text').focus(); return; }
      if (el.id === 'save-edit') {
        st.edit = $('#edit-text').value;
        var em = st.messages.filter(function (m) { return m.role === 'edit'; })[0];
        if (em) em.text = st.edit; else st.messages.push({ role: 'edit', text: st.edit });
        saveTaskState(t.id, st);
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'edit', data: { text: st.edit } }).then(function (r) { if (r && r.support) showSupport(r.support); }, function () {});
        // Tap feedback: "Saved" and what was saved, here in the sheet; "Back to ..." then leaves.
        sheet.editSaved = true; sheet.last = 'edit';
        drawSheet();
        var sb = $('#edit-saved-box'); if (sb) { sb.scrollIntoView({ block: 'nearest' }); sb.focus({ preventScroll: true }); }
        return;
      }
      if (el.id === 'start-noai') {
        st.noAiStarted = true; saveTaskState(t.id, st);
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'no_ai_started', data: {} }).catch(function () {});
        drawSheet();
        var f = $('input[name="noai"]'); if (f) f.focus();
        return;
      }
      if (el.dataset.choice) {
        st.choice = el.dataset.choice; saveTaskState(t.id, st);
        $all('[data-choice]', root).forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
        var ch = R.decision_options.filter(function (x) { return x.id === st.choice; })[0];
        var chh = $('#choice-help'); if (chh && ch) chh.textContent = CHOICE_HELP[ch.id] || ch.help;
        showVerifyNeed();
        // cp_9: the reasons stay where they are. Only a sheet opened before any choice builds its list on the first one.
        var rbox = $('#reason-chips');
        // ui_audit C2: built the same way as a sheet opened after a choice (the first four, then "More reasons").
        if (rbox && !rbox.dataset.builtFor) { var co = chipOrder(); rbox.dataset.builtFor = co || ''; rbox.innerHTML = chipsFirstHtml(R.reason_tags, co, st.tags); }
        var rta = $('#reason'); if (rta) rta.placeholder = 'Or in your words';
        return;
      }
      if (el.dataset.tag) {
        var id = el.dataset.tag, i = st.tags.indexOf(id);
        if (i >= 0) st.tags.splice(i, 1);
        else { if (st.tags.length >= 3) { tapNote($('#reason-chips') || el, 'Up to 3.'); return; } st.tags.push(id); }
        el.setAttribute('aria-pressed', st.tags.indexOf(id) >= 0 ? 'true' : 'false');
        saveTaskState(t.id, st);
        $('#reason-count').textContent = reasonCount(st);
        return;
      }
      if (el.id === 'sheet-next') {
        if (!st.reason.trim() && !st.tags.length) { $('#decide-error').textContent = 'Tap a reason, or say it in your words.'; return; }
        sheet.step = 3; drawSheet(); return;
      }
      if (el.dataset.conf) {
        st.conf = +el.dataset.conf; saveTaskState(t.id, st);
        var cn = $('#conf-now'); if (cn) cn.textContent = R.confidence_scale[st.conf - 1].label;
        $all('[data-conf]', root).forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
        return;
      }
      if (el.id === 'submit-task') { saveDecision(el); return; }
    });
    root.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.id === 'chat-form') {
        var inp = $('#chat-input');
        var text = inp.value.trim();
        if (!text) { tapNote($('#chat-form'), 'Type or say a message first.'); inp.focus(); return; }
        inp.value = '';
        sendChat(text);
      } else if (e.target.id === 'ft-form') {
        saveFirstThought($('#ft-input').value.trim(), e.target.querySelector('button[type="submit"]'));
      }
    });
    root.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'reason') { st.reason = el.value; if (el.dataset.spoken) st.inputMode = 'spoken'; saveTaskState(t.id, st); }
      if (el.id === 'chat-input' || el.id === 'ft-input') { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px'; }
    });
    root.addEventListener('change', function (e) {
      if (e.target.name === 'noai') { st.noAiAnswer = +e.target.value; saveTaskState(t.id, st); }
    });
    root.addEventListener('keydown', function (e) {
      var ci0 = $('#cf-intro');
      if (ci0 && !ci0.hidden && e.key === 'Tab') { e.preventDefault(); $('#cf-intro-go').focus(); return; }
      if ((e.target.id === 'chat-input' || e.target.id === 'ft-input') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); return; }
      if (!sheet.kind) return;
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
      if (e.key === 'Tab') {   // keep focus inside the open sheet
        var f = $all('button:not([disabled]), textarea, input', $('#sheet-panel')).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement.id === 'sheet-h')) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    paint();
    // Restore the chat from the Decision Trail when this device has none (another phone, cleared storage).
    if (!st.messages.length && !st.trailLoaded) {
      st.trailLoaded = true;
      api('/api/trail?sid=' + encodeURIComponent(S.sid)).then(function (tr) {
        var item = tr.tasks.filter(function (x) { return x.task_id === t.id; })[0];
        if (!item) return;
        var msgs = [], ftBack = false;
        item.steps.forEach(function (s) {
          if (s.kind === 'chat') { msgs.push({ role: 'user', text: s.text.replace(/^You asked: /, '') }); msgs.push({ role: 'ai', text: s.reply, id: s.response_id, source: s.source }); }
          if (s.kind === 'blocked') msgs.push({ role: 'blocked', text: s.text });
          if (s.kind === 'check') { st.opened = true; msgs.push({ role: 'check' }); }
          if (s.kind === 'finding') st.finding = s.found;
          if (s.kind === 'first_thought' && !st.firstThought) { st.firstThought = s.thought; ftBack = true; }
          if (s.kind === 'followup' && !st.followup) st.followup = { text: s.reply, source: s.source };
          if (s.kind === 'followup_blocked' && !st.followup) st.followup = { text: s.text, blocked: true };
        });
        if ((msgs.length && !st.messages.length) || ftBack) {
          st.messages = msgs; saveTaskState(t.id, st);
          if (here() && !sheet.kind) renderTask(main, idx);
        }
      }).catch(function () {});
    }
    if (params.get('prefill') === '1' && !done && !st.choice) {
      st.choice = 'question'; st.tags = ['fake_source', 'needs_check']; st.conf = 4; st.reason = 'I could not find the book in the library search, so it looks made up.'; st.opened = true;
      saveTaskState(t.id, st);
      params.delete('prefill');
      renderTask(main, idx);
    }
  }

  function renderTask(main, idx) {
    var tasks = S.session.tasks;
    if (idx < 0 || idx >= tasks.length) idx = firstOpenTask();
    if (chatFirstOn()) { renderTaskChat(main, idx); return; }
    var t = tasks[idx];
    var st = taskState(t.id);
    var done = isDone(t.id);
    var R = S.rubric;
    if (!st.opened_logged) { st.opened_logged = true; st.t0 = Date.now(); saveTaskState(t.id, st); send('/api/event', { sid: S.sid, task_id: t.id, type: 'task_open', data: {} }).catch(function () {}); }

    var steps = tasks.map(function (x, i) { return '<i class="' + (isDone(x.id) ? 'done' : (i === idx ? 'now' : '')) + '"></i>'; }).join('');
    var reasonWhy = (S.session.reasons || {})[t.id];
    var img = t.image ? '<img class="task-image" src="' + esc(t.image) + '" alt="' + esc(t.image_alt || '') + '" width="640" height="400">' : '';

    var checkStep = '';
    // Design review, proposal 3: the check folds once it was opened and a decision is chosen (never in the guided demo).
    var folded = !!(t.source_check && st.opened && st.choice && !DEMO);
    if (t.source_check || t.edit) {
      checkStep = '<div class="panel-step check-step' + (folded ? ' folded' : '') + '" id="check-step"><h3><span class="num" aria-hidden="true">1</span>Check it yourself (optional)</h3>' +
        '<div class="row">' +
        (t.source_check ? '<button type="button" class="btn secondary small" id="open-check" aria-expanded="' + (st.opened ? 'true' : 'false') + '" aria-controls="check-result">' + ICON.check + esc(t.source_check.label) + '</button>' : '') +
        (t.edit ? '<button type="button" class="btn secondary small" id="open-edit" aria-expanded="' + (st.edit != null ? 'true' : 'false') + '" aria-controls="edit-box">' + esc(t.edit.label) + '</button>' : '') +
        '</div>' +
        (t.source_check ? '<div class="check-summary"><div class="cs-text"><b>' + esc(t.source_check.title) + '</b><span id="check-found">' + esc(foundText(st)) + '</span></div>' +
          '<button type="button" class="btn small secondary" id="check-show" aria-expanded="false" aria-controls="check-result"><span>Show</span>' + ICON.chev + '</button></div>' : '') +
        '<div id="check-result" ' + (st.opened && !folded ? '' : 'hidden') + '>' + (t.source_check ? '<div class="check-result"><span class="label">Practice check: ' + esc(t.source_check.title) + '</span><span id="check-text">' + esc(t.source_check.result) + '</span></div>' + findingHtml(st) : '') + '</div>' +
        '<div id="edit-box" ' + (st.edit != null ? '' : 'hidden') + ' style="margin-top:10px">' + (t.edit ? '<label class="field"><span>Your edited version</span><div class="with-mic"><textarea id="edit-text" rows="6" maxlength="4000">' + esc(st.edit != null ? st.edit : t.edit.start_text) + '</textarea>' + micBtn('edit-text') + '</div></label><button type="button" class="btn small" id="save-edit">Save my edit</button> <span class="small muted" id="edit-saved"></span>' : '') + '</div>' +
        '</div>';
    }
    // 19 Nov 2026, round 2: while the question without the AI is open, the check and the chat are folded away.
    var noAiOpenOld = !!(t.no_ai && st.noAiStarted && !st.noAiDone && !done);
    if (checkStep && noAiOpenOld) checkStep = '<div class="panel-step check-step" id="check-step"><h3><span class="num" aria-hidden="true">1</span>Check it yourself (optional)</h3><p class="hide-note">' + ICON.lock + '<span>Hidden while you answer on your own.</span></p></div>';
    var n0 = checkStep ? 2 : 1;
    var noAiStep = '';
    if (t.no_ai) {
      noAiStep = '<div class="panel-step"><h3 id="noai-h" tabindex="-1"><span class="num" aria-hidden="true">' + n0 + '</span>Without AI</h3>';
      if (!st.noAiStarted) {
        noAiStep += '<p><b>Now one without the AI.</b> The chat closes for this task.</p><button type="button" class="btn secondary small" id="start-noai">Start the question</button>';
      } else {
        noAiStep += '<fieldset style="border:0;padding:0;margin:0"><legend id="noai-q" class="q-legend">' + esc(t.no_ai.prompt) + '</legend><div class="options">' +
          t.no_ai.options.map(function (o, i) { return '<label class="option"><input type="radio" name="noai" value="' + i + '" ' + (st.noAiAnswer === i ? 'checked' : '') + '><span>' + esc(o) + '</span></label>'; }).join('') +
          '</div></fieldset><div class="row" style="margin-top:8px">' + listenBtn('noai-q', 'Listen: read the question aloud') +
          (noAiOpenOld ? '<button type="button" class="btn small" id="noai-save">Save my answer</button>' : '') + '</div><p class="error" id="noai-error" role="alert"></p>';
      }
      noAiStep += '</div>';
      n0++;
    }
    // Three cards, one per decision: its icon, its name, and what it means, all inside the card.
    // All three look the same until one is chosen; the chosen card gets a thick border and a tick.
    var choices = '<div class="decide">' + R.decision_options.filter(function (o) { return !o.step && o.id !== 'verify'; }).map(function (o) {
      return '<label><input type="radio" name="choice" value="' + o.id + '" ' + (st.choice === o.id ? 'checked' : '') + '><span class="d-icon">' + ICON[o.id] + '</span>' +
        '<span class="d-text"><span class="d-title">' + esc(o.label) + '</span> <span class="d-help" title="' + esc(o.help) + '">' + esc(CHOICE_HELP[o.id] || o.help) + '</span></span><span class="d-mark" aria-hidden="true">' + ICON.tick + '</span></label>';
    }).join('') + '</div>';
    var tagChips = chipsHtml(R.reason_tags, st.choice, st.tags);
    var cs = R.confidence_scale;
    var scale = '<span class="end" aria-hidden="true">' + esc(cs[0].label) + '</span>' + cs.map(function (c) {
      return '<label><input type="radio" name="conf" value="' + c.value + '" aria-label="' + c.value + ', ' + esc(c.label) + '" ' + (st.conf === c.value ? 'checked' : '') + '>' + c.value + '</label>';
    }).join('') + '<span class="end" aria-hidden="true">' + esc(cs[cs.length - 1].label) + '</span>';
    var isLast = idx === tasks.length - 1;
    var saveLabel = done ? 'Save changes' : (isLast ? 'Save and see my results' : 'Save and go to task ' + (idx + 2));
    // Design review 15 Nov, proposal 1: during a set, a phone shows four marks and one button that names
    // the next step, in place of the tabs. The button scrolls to that step and moves focus to its heading,
    // or presses the existing save. Off in the guided demo (its captions sit at the bottom).
    var thinkFirst = !!S.session.think_first;
    var STEP_MARKS = (thinkFirst ? [['think', 'Think']] : []).concat([['ask', 'Ask'], ['decide', 'Decide'], ['why', 'Why'], ['sure', 'How sure']]);
    function stepState() {
      var d = {
        think: done || !thinkFirst || !!st.firstThought,
        ask: done || st.messages.some(function (m) { return m.role === 'user'; }),
        decide: !!st.choice, why: !!(st.reason.trim() || st.tags.length), sure: !!st.conf
      };
      var next = !d.think ? ['Next: your first thought', 'ft-h'] : !d.ask ? ['Next: ask the AI', 'chat-h'] : (t.no_ai && !st.noAiDone && !done) ? ['Next: the question without AI', 'noai-h']
        : !d.decide ? ['Next: your decision', 'decide-q'] : !d.why ? ['Next: why?', 'why-h'] : !d.sure ? ['Next: how sure', 'conf-h'] : [saveLabel, null];
      return { done: d, label: next[0], target: next[1] };
    }
    // 19 Nov 2026: while a step is still to do, the bar shows a plain hint (not a button: testers took
    // "Next: ask the AI" for Send). Once every part is in, it shows the real Save button.
    function stepSlotHtml(s) {
      return s.target ? '<p class="step-hint" id="step-hint">' + esc(s.label) + '</p>'
        : '<button type="button" class="btn block" id="step-next">' + esc(s.label) + '</button>';
    }
    function stepBarHtml() {
      if (DEMO || S.session.has_results) return '';
      var s = stepState();
      // While the first thought is still to write, the bar stays out of the way: the box itself is the next step.
      return '<div class="step-bar" id="step-bar" role="region" aria-label="Next step"' + (s.target === 'ft-h' ? ' hidden' : '') + '><ul class="step-marks" id="step-marks">' + marksHtml(s) + '</ul>' +
        '<div id="step-slot" aria-live="polite">' + stepSlotHtml(s) + '</div></div>';
    }
    function marksHtml(s) {
      return STEP_MARKS.map(function (m, i) {
        var ok = s.done[m[0]];
        return '<li data-done="' + ok + '"><span class="mark" aria-hidden="true">' + (ok ? ICON.tick : (i + 1)) + '</span><span class="visually-hidden">Step ' + (i + 1) + ' of ' + STEP_MARKS.length + ': </span><span>' + m[1] + '</span><span class="visually-hidden">' + (ok ? ', done' : ', to do') + '</span></li>';
      }).join('');
    }
    var lastBarLabel = null;
    function refreshBar() {
      var slot = $('#step-slot');
      if (!slot) return;
      var s = stepState();
      $('#step-marks').innerHTML = marksHtml(s);
      $('#step-bar').hidden = s.target === 'ft-h';
      if (s.label !== lastBarLabel) slot.innerHTML = stepSlotHtml(s);
      // The slot is the one live region: its words are announced only when they change (19 Nov 2026).
      lastBarLabel = s.label;
    }

    // 19 Nov 2026 (screen-reader testers): the decision steps are hidden until the student has asked the AI,
    // so about 30 controls are not read out first; one line says why. A saved or started decision shows them.
    var stepsOpen = done || !!st.choice || st.messages.some(function (m) { return m.role === 'user'; });
    function openSteps() {
      var ds = $('#decide-steps'); if (ds && ds.hidden) { ds.hidden = false; var w = $('#decide-wait'); if (w) w.remove(); }
    }
    var lc = S.lastCorrection && S.lastCorrection.n !== idx + 1 ? S.lastCorrection : null;
    // 19 Nov 2026 (coordinator): after a save, one line in the progress strip that opens the full correction in place,
    // under the strip (pushing the page down, never over it). It stays until the student starts on this task.
    var savedText = lc ? (lc.ai_correct ? 'The AI was right there. ' : 'What the AI got wrong there: ') +
      String(lc.text).replace(/^None\.\s*/, '') + (lc.correction ? ' ' + lc.correction : '') : '';
    main.innerHTML =
      '<div class="progress"><span class="small"><b>' + esc(setLabel()) + '</b> · Task ' + (idx + 1) + ' of ' + tasks.length + '</span><div class="steps" aria-hidden="true">' + steps + '</div>' +
      (lc ? '<span class="saved-line" id="saved-note"><span class="visually-hidden" role="status" id="saved-say"></span>' +
        '<button type="button" class="saved-btn" id="saved-open" aria-expanded="false" aria-controls="saved-more">' +
        '<span>Task ' + lc.n + ' saved. ' + (lc.ai_correct ? 'See why the AI was right' : 'See what the AI got wrong') + '</span>' + ICON.chev + '</button></span>' : '') + '</div>' +
      (lc ? '<div class="saved-more" id="saved-more" hidden><p>' + esc(savedText) + '</p></div>' : '') +
      '<div class="grid-2">' +
        '<div class="stack">' +
          '<article class="card panel" aria-labelledby="task-title">' +
            '<div class="task-head"><span class="tag">' + esc(t.area_name) + '</span>' + (done ? '<span class="tag">Saved</span>' : '') + '<span class="spacer"></span>' + listenBtn('task-read', 'Listen: read the task aloud') + '</div>' +
            '<div id="task-read"><h1 id="task-title">' + esc(t.title) + '</h1>' +
            (reasonWhy ? '<p class="small muted">' + esc(reasonWhy) + '</p>' : '') +
            '<div class="context pre">' + esc(t.context) + '</div>' +
            '<p class="goal">' + esc(t.goal) + '</p></div>' + img +
            '<div id="ft-slot"></div>' +
          '</article>' +
          '<section class="card chat" aria-labelledby="chat-h">' +
            '<div class="row between"><h2 id="chat-h" tabindex="-1">Ask the AI</h2></div>' +
            '<div class="messages" id="messages" aria-live="polite"></div>' +
            '<div class="composer" id="composer"></div>' +
          '</section>' +
        '</div>' +
        '<aside class="sticky-col" aria-labelledby="decide-h">' +
          '<section class="card panel" id="decision-panel">' +
            '<h2 id="decide-h">Your decision</h2>' +
            checkStep +
            (stepsOpen ? '' : '<p class="decide-wait" id="decide-wait">Ask the AI first.</p>') +
            '<div id="decide-steps"' + (stepsOpen ? '' : ' hidden') + '>' +
            noAiStep +
            '<div class="panel-step"><h3 id="decide-q" tabindex="-1"><span class="num" aria-hidden="true">' + n0 + '</span>' + 'What will you do?' + '</h3><div role="radiogroup" aria-label="Your decision">' + choices + '</div></div>' +
            '<div class="panel-step"><h3 id="why-h" tabindex="-1"><span class="num" aria-hidden="true">' + (n0 + 1) + '</span><span>Why?</span><span class="h-aside" id="reason-count" aria-live="polite">' + reasonCount(st) + '</span></h3>' +
              '<p class="visually-hidden" id="reason-help">Tap up to 3 reasons, type, or speak.</p>' +
              '<div class="chips" id="reason-chips" role="group" aria-label="Reasons you can tap" data-built-for="' + esc(st.choice || '') + '">' + tagChips + '</div>' +
              '<label class="field" style="margin-top:10px"><span class="visually-hidden">Your reason in your own words</span><div class="with-mic"><textarea id="reason" rows="3" maxlength="2000" placeholder="Your reason, in your own words" aria-describedby="reason-help">' + esc(st.reason) + '</textarea>' + micBtn('reason') + '</div></label>' +
            '</div>' +
            '<div class="panel-step"><h3 id="conf-h" tabindex="-1"><span class="num" aria-hidden="true">' + (n0 + 2) + '</span><span>' + 'How sure are you about your choice?' + '</span><span class="conf-now h-aside" id="conf-now" aria-live="polite">' + (st.conf ? esc(cs[st.conf - 1].label) : '') + '</span></h3><div class="conf" role="radiogroup" aria-label="How sure you are, from 1, guessing, to 5, certain">' + scale + '</div></div>' +
            '</div>' +
            '<div class="panel-step">' +
              more('fair-more', ICON.scale + 'Spelling and speed don’t count. Your thinking does.','<p class="small">' + esc(R.fairness_statement) + '</p>', 'fair-more') +
              '<div class="save-row" id="save-row"><p class="error" id="decide-error" role="alert"></p>' +
              '<div class="row"><button type="button" class="btn block" id="submit-task">' + saveLabel + '</button></div></div>' +
              '<div class="row" style="margin-top:10px">' + (idx > 0 ? '<button type="button" class="btn quiet small" id="prev-task" aria-label="Back to the previous task">' + ICON.back + 'Previous task</button>' : '') + (done && !isLast ? '<button type="button" class="btn quiet small" id="next-task">Next task</button>' : '') + '</div>' +
            '</div>' +
          '</section>' +
        '</aside>' +
      '</div>' + stepBarHtml();

    function renderMessages() {
      var box = $('#messages');
      var ftNote = st.firstThought ? '<div class="msg note ft-note"><b>Your first thought:</b> ' + esc(st.firstThought) + '</div>' : '';
      if (!st.messages.length) {
        box.innerHTML = ftNote + (thinkFirst && !st.firstThought && !done ? '<p class="empty-chat">First your own thought, above. Then ask the AI.</p>'
          : '<p class="empty-chat">Start by asking the AI.</p>');
        return;
      }
      if (noAiOpenOld) { box.innerHTML = ftNote + '<p class="hide-note" id="hide-note">' + ICON.lock + '<span>Hidden while you answer on your own.</span></p>'; return; }
      box.innerHTML = ftNote + st.messages.map(function (m) {
        if (m.role === 'check' || m.role === 'edit') return '';   // cards from the chat-first screen
        if (m.role === 'user') return '<div class="msg user"><span class="visually-hidden">You: </span>' + esc(m.text) + '</div>';
        if (m.role === 'blocked') return '<div class="msg blocked" role="alert">' + esc(m.text) + '</div>';
        if (m.role === 'note' || m.source === 'scripted_note') return '<div class="msg note">' + esc(m.text) + '</div>';
        return '<div class="msg ai"><span class="who">AI</span>' + taskLabel(m.source) + esc(m.text) + '</div>';
      }).join('');
      // A new AI reply is shown from its start, so a long one is read from the top (design review, proposal 4).
      var lastMsg = box.lastElementChild;
      if (lastMsg && lastMsg.classList.contains('ai') && lastMsg.offsetHeight > box.clientHeight / 2) box.scrollTop = Math.max(0, lastMsg.offsetTop - 8);
      else box.scrollTop = box.scrollHeight;
    }
    function renderComposer() {
      var c = $('#composer');
      if (st.noAiStarted) {
        c.innerHTML = '<p class="locked">' + ICON.lock + ' The chat is closed for this task, because you started the question without AI.</p>';
        return;
      }
      // 19 Nov 2026: the first-thought box sits on the task card, so it is on screen as the task opens.
      var slot = $('#ft-slot');
      if (thinkFirst && !st.firstThought && !done) { c.innerHTML = ''; renderFirstThought(slot || c); return; }
      if (slot) slot.innerHTML = '';
      var sugg = (t.suggested_prompts || []).map(function (p) { return '<button type="button" class="chip" data-suggest="' + esc(p) + '">' + esc(p) + '</button>'; }).join('');
      c.innerHTML =
        (st.messages.length ? '' : '<div class="builder"><span class="label">Suggestion</span><div class="chips">' + sugg + '</div></div>') +
        '<div class="builder"><span class="label">Add</span><div class="chips">' + BUILDERS.map(function (b, i) { return '<button type="button" class="chip" data-build="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>' +
        '<form id="chat-form" class="row" novalidate><label class="visually-hidden" for="chat-input">Your message to the AI</label><textarea id="chat-input" rows="2" maxlength="2000" placeholder="Type your message"></textarea>' + micBtn('chat-input') +
        '<button class="btn" type="submit" aria-label="Send">' + ICON.send + '<span>Send</span></button></form>';
      // One tap sends the suggested question (19 Nov 2026). The guided demo still shows it typed, then sent.
      $all('[data-suggest]', c).forEach(function (b) { b.addEventListener('click', function () { $('#chat-input').value = b.dataset.suggest; if (!DEMO) { $('#chat-form').requestSubmit(); return; } var sb = $('#chat-form button[type="submit"]'); (sb || $('#chat-input')).focus(); if (sb) sb.classList.add('ready'); }); });
      $all('[data-build]', c).forEach(function (b) {
        b.addEventListener('click', function () {
          var inp = $('#chat-input');
          var add = BUILDERS[+b.dataset.build].text;
          inp.value = (+b.dataset.build === 0) ? add + inp.value : inp.value.replace(/\s+$/, '') + add;
          inp.focus();
        });
      });
      var input = $('#chat-input');
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
      $('#chat-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text) { tapNote($('#chat-form'), 'Type or say a message first.'); inp.focus(); return; }
        input.value = '';
        st.messages.push({ role: 'user', text: text });
        saveTaskState(t.id, st);
        var sgb = c.querySelector('[data-suggest]'); if (sgb && sgb.closest('.builder')) sgb.closest('.builder').remove();
        openSteps();
        renderMessages();
        refreshBar();
        var box = $('#messages');
        var typing = document.createElement('p');
        typing.className = 'typing';
        typing.innerHTML = '<span class="spinner" aria-hidden="true"></span> The AI is replying';
        box.appendChild(typing);
        var turn = st.messages.filter(function (m) { return m.role === 'ai'; }).length;
        api('/api/chat', { sid: S.sid, task_id: t.id, message: text }).then(function (r) {
          if (r.blocked) { st.messages.push({ role: 'blocked', text: r.pause ? 'Not sent to the AI.' : r.reply }); if (r.pause) showSupport(r.reply); }
          else {
            if (r.pii_removed && r.pii_removed.length) st.messages.push({ role: 'note', text: 'Removed before storing: ' + r.pii_removed.join(', ') + '.' });
            st.messages.push({ role: 'ai', text: r.reply, id: r.response_id, source: r.source });
          }
          saveTaskState(t.id, st);
          renderMessages();
          followMode(r);
          refreshBar();
        }, function (e2) {
          if (e2.offline) {
            queue('/api/chat', { sid: S.sid, task_id: t.id, message: text });
            var reply = localDemoReply(t, text, turn);
            st.messages.push({ role: 'ai', text: reply.text, id: reply.id, source: 'offline' });
            saveTaskState(t.id, st);
            renderMessages();
          } else {
            typing.remove();
            if (e2.status === 409) { st.messages.push({ role: 'note', text: e2.message }); saveTaskState(t.id, st); renderMessages(); }
            tapNote($('#chat-form'), e2.message);
          }
        });
      });
    }
    // Think first (16 Nov 2026, off unless the set has it): the student's own first answer or instinct,
    // saved before the AI's first reply. Recorded with its time in the Decision Trail; never scored.
    function renderFirstThought(c) {
      c.innerHTML = '<div class="first-thought" id="ft-box">' +
        '<div class="row between"><h3 id="ft-h" tabindex="-1">Your first thought</h3>' + listenSm('ft-read', 'Listen: read this step aloud') + '</div>' +
        '<p class="small" id="ft-read">Before you ask the AI: what do you think? A few words. Not scored. It stays as you wrote it.</p>' +
        '<form id="ft-form" novalidate><label class="visually-hidden" for="ft-input">Your first thought</label>' +
        '<div class="with-mic"><textarea id="ft-input" rows="2" maxlength="1000" aria-describedby="ft-read" placeholder="My first thought is"></textarea>' + micBtn('ft-input') + '</div>' +
        '<p class="error" id="ft-error" role="alert"></p><button class="btn" type="submit">Save my first thought</button></form></div>';
      $('#ft-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = $('#ft-input').value.trim();
        var err = $('#ft-error');
        err.textContent = '';
        if (!v) { err.textContent = "Write a few words first. Any first thought is fine, even 'I am not sure'."; $('#ft-input').focus(); return; }
        var b = $('#ft-form button[type="submit"]');
        if (b.disabled) return;
        b.disabled = true;
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'first_thought', data: { text: v } }).then(function (r) {
          st.firstThought = v; saveTaskState(t.id, st);
          if (window.LitmusApp.onSupport) window.LitmusApp.onSupport(r);
          renderMessages(); renderComposer(); refreshBar();
          var ci = $('#chat-input'); if (ci) ci.focus();
        }, function (e2) {
          b.disabled = false;
          if (e2.status === 409 && /already saved/.test(e2.message)) { st.firstThought = v; saveTaskState(t.id, st); renderMessages(); renderComposer(); refreshBar(); return; }
          err.textContent = e2.message;
        });
      });
    }
    renderMessages();
    renderComposer();
    // Design review, proposal 4: on a laptop the message box sticks to the bottom of the screen once the
    // chat's AI note has scrolled off the top (styles.css, .composer-stuck), so it never covers them.
    if (S.chatIO) { S.chatIO.disconnect(); S.chatIO = null; }
    var chatSec = $('.chat'), aiNote = $('.chat .ai-note');
    if (window.IntersectionObserver && chatSec && aiNote) {
      S.chatIO = new IntersectionObserver(function (es) { es.forEach(function (e) { chatSec.classList.toggle('composer-stuck', !e.isIntersecting && e.boundingClientRect.top < 0); }); });
      S.chatIO.observe(aiNote);
    }
    if (!st.messages.length && !st.trailLoaded) {
      st.trailLoaded = true;
      api('/api/trail?sid=' + encodeURIComponent(S.sid)).then(function (tr) {
        var item = tr.tasks.filter(function (x) { return x.task_id === t.id; })[0];
        if (!item) return;
        var msgs = [], ftBack = false;
        item.steps.forEach(function (s) {
          if (s.kind === 'chat') { msgs.push({ role: 'user', text: s.text.replace(/^You asked: /, '') }); msgs.push({ role: 'ai', text: s.reply, id: s.response_id, source: s.source }); }
          if (s.kind === 'blocked') msgs.push({ role: 'blocked', text: s.text });
          if (s.kind === 'check') st.opened = true;
          if (s.kind === 'finding') st.finding = s.found;
          if (s.kind === 'first_thought' && !st.firstThought) { st.firstThought = s.thought; ftBack = true; }
        });
        if ((msgs.length && !st.messages.length) || ftBack) {
          st.messages = msgs; saveTaskState(t.id, st);
          if (route().view === 'task' && currentTaskId() === t.id) renderTask(main, idx);
        }
      }).catch(function () {});
    }

    var oc = $('#open-check');
    if (oc) oc.addEventListener('click', function () {
      var box = $('#check-result');
      var show = box.hidden;
      box.hidden = !show;
      oc.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show && !st.opened) { st.opened = true; saveTaskState(t.id, st); send('/api/event', { sid: S.sid, task_id: t.id, type: 'source_opened', data: {} }); }
    });
    $all('input[name="finding"]').forEach(function (r) {
      r.addEventListener('change', function () {
        st.finding = r.value; saveTaskState(t.id, st);
        var cf = $('#check-found'); if (cf) cf.textContent = foundText(st);
        send('/api/event', { sid: S.sid, task_id: t.id, type: 'source_finding', data: { found: r.value } }).then(function () {
          var fs = $('#finding-saved'); if (fs) fs.textContent = 'Saved.';
        }, function (e) { var fs2 = $('#finding-saved'); if (fs2) fs2.textContent = e.message; tapNote($('#finding'), e.message); });
      });
    });
    var oe = $('#open-edit');
    if (oe) oe.addEventListener('click', function () {
      var box = $('#edit-box');
      box.hidden = !box.hidden;
      oe.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      if (!box.hidden) $('#edit-text').focus();
    });
    var se = $('#save-edit');
    if (se) se.addEventListener('click', function () {
      st.edit = $('#edit-text').value;
      saveTaskState(t.id, st);
      send('/api/event', { sid: S.sid, task_id: t.id, type: 'edit', data: { text: st.edit } }).then(function (r) { if (r && r.support) showSupport(r.support); }, function () {});
      $('#edit-saved').textContent = 'Saved.';
    });
    var sn = $('#start-noai');
    if (sn) sn.addEventListener('click', function () {
      st.noAiStarted = true; saveTaskState(t.id, st);
      send('/api/event', { sid: S.sid, task_id: t.id, type: 'no_ai_started', data: {} }).catch(function () {});
      renderTask(main, idx); var f = $('input[name="noai"]'); if (f) f.focus();
    });
    $all('input[name="noai"]').forEach(function (r) {
      r.addEventListener('change', function () { st.noAiAnswer = +r.value; saveTaskState(t.id, st); refreshBar(); });
    });
    var nsv = $('#noai-save');
    if (nsv) nsv.addEventListener('click', function () {
      if (st.noAiAnswer == null) { $('#noai-error').textContent = 'Pick an answer first.'; var f0 = $('input[name="noai"]'); if (f0) f0.focus(); return; }
      st.noAiDone = true; saveTaskState(t.id, st);
      renderTask(main, idx);
      var dq = $('#decide-q'); if (dq) dq.focus();
    });
    $all('input[name="choice"]').forEach(function (r) { r.addEventListener('change', function () { st.choice = r.value; saveTaskState(t.id, st); rebuildChips($('#reason-chips'), R.reason_tags, st.choice, st.tags); refreshBar(); if (st.opened && !DEMO) foldCheck(); }); });
    function foldCheck() {
      var step = $('#check-step'), box = $('#check-result'), b = $('#check-show');
      if (!step || !b || step.classList.contains('folded')) return;
      step.classList.add('folded');
      box.hidden = true;
      b.setAttribute('aria-expanded', 'false'); b.firstChild.textContent = 'Show';
      $('#check-found').textContent = foundText(st);
    }
    var cshow = $('#check-show');
    if (cshow) cshow.addEventListener('click', function () {
      var box = $('#check-result');
      box.hidden = !box.hidden;
      cshow.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      cshow.firstChild.textContent = box.hidden ? 'Show' : 'Hide';
    });
    $all('input[name="conf"]').forEach(function (r) { r.addEventListener('change', function () { st.conf = +r.value; saveTaskState(t.id, st); $('#conf-now').textContent = cs[st.conf - 1].label; refreshBar(); }); });
    var chipBox = $('#reason-chips');
    if (chipBox) chipBox.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tag]');
      if (!b) return;
      (function () {
        var id = b.dataset.tag;
        var i = st.tags.indexOf(id);
        if (i >= 0) st.tags.splice(i, 1);
        else { if (st.tags.length >= 3) { tapNote($('#reason-chips') || el, 'Up to 3.'); return; } st.tags.push(id); }
        b.setAttribute('aria-pressed', st.tags.indexOf(id) >= 0 ? 'true' : 'false');
        saveTaskState(t.id, st);
        $('#reason-count').textContent = reasonCount(st);
        refreshBar();
      })();
    });
    var reasonEl = $('#reason');
    reasonEl.addEventListener('input', function () { st.reason = reasonEl.value; if (reasonEl.dataset.spoken) st.inputMode = 'spoken'; saveTaskState(t.id, st); refreshBar(); });
    lastBarLabel = stepState().label;
    var sn2 = $('#step-bar');
    if (sn2) sn2.addEventListener('click', function (ev) {
      if (!ev.target.closest('#step-next')) return;
      var s = stepState();
      if (!s.target) {
        $('#submit-task').click();
        var er = $('#decide-error');
        if (er && er.textContent) er.scrollIntoView({ block: 'center' });
        return;
      }
      var h = document.getElementById(s.target);
      if (!h) return;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      h.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      h.focus({ preventScroll: true });
    });
    (function savedLine() {   // the saved line: open and close in place; gone once the student starts on this task
      var n = $('#saved-note'), b = $('#saved-open'), more = $('#saved-more'); if (!n || !b || !more) return;
      S.lastCorrection = null;
      setTimeout(function () { var say = $('#saved-say'); if (say) say.textContent = 'Task ' + lc.n + ' saved.'; }, 60);
      b.addEventListener('click', function () {
        var open = more.hidden; more.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); n.classList.toggle('open', open);
      });
      function gone(e) {
        if (e && e.target && (n.contains(e.target) || more.contains(e.target))) return;
        if (e && e.type === 'keydown' && /^(Tab|Shift|Control|Alt|Meta|Escape|Arrow|Page|Home|End)/.test(e.key)) return;   // moving, not starting
        main.removeEventListener('click', gone, true); main.removeEventListener('keydown', gone, true);
        // After this tap or key has done its job, so nothing moves under the finger first.
        setTimeout(function () { if (document.contains(n)) n.remove(); if (document.contains(more)) more.remove(); }, 0);
      }
      main.addEventListener('click', gone, true); main.addEventListener('keydown', gone, true);
    })();
    var pv = $('#prev-task'); if (pv) pv.addEventListener('click', function () { go('task', idx - 1); });
    var nx = $('#next-task'); if (nx) nx.addEventListener('click', function () { go('task', idx + 1); });

    $('#submit-task').addEventListener('click', function () {
      var err = $('#decide-error');
      err.textContent = '';
      var missing = [];
      if (!st.messages.some(function (m) { return m.role === 'user'; })) missing.push('send at least one message to the AI');
      if (t.no_ai && st.noAiAnswer == null) missing.push('answer the question without AI');
      if (!st.choice) missing.push('say if the AI is right or wrong');
      if (!st.reason.trim() && !st.tags.length) missing.push('give a reason (tap, type, or speak)');
      if (!st.conf) missing.push('say how sure you are');
      if (missing.length) { err.textContent = 'Before you save: ' + missing.join('; ') + '.'; return; }
      var btn = $('#submit-task');
      tapBusy(btn, true);
      var mode = st.inputMode === 'spoken' ? 'spoken' : (st.reason.trim() ? 'typed' : 'tapped');
      var jobs = [];
      if (t.no_ai) jobs.push(send('/api/event', { sid: S.sid, task_id: t.id, type: 'no_ai_answer', data: { answer: st.noAiAnswer } }));
      jobs.push(send('/api/event', { sid: S.sid, task_id: t.id, type: 'task_time', data: { ms: Date.now() - (st.t0 || Date.now()) } }));
      Promise.all(jobs).then(function () {
        return send('/api/decision', { sid: S.sid, task_id: t.id, choice: st.choice, reason: st.reason, tags: st.tags, confidence: st.conf, input_mode: mode });
      }).then(function (saved) {
        if (saved && saved.support) S.support = saved.support;   // shown on the next screen, at the top
        // So no student leaves believing a planted error: once a task is saved, the next screen says what was going on.
        if (saved && saved.what_was_going_on && !DEMO) S.lastCorrection = { n: idx + 1, title: t.title, ai_correct: saved.ai_correct, text: saved.what_was_going_on, correction: saved.correction || '' };
        if (S.session.done.indexOf(t.id) < 0) S.session.done.push(t.id);
        if (window.LitmusApp.onTaskSaved && window.LitmusApp.onTaskSaved(t, idx) === false) { tapBusy(btn, false); return; }
        if (isLast || S.session.done.length === tasks.length) {
          if (S.session.done.length < tasks.length) { go('task', firstOpenTask()); return; }
          if (!S.online) { tapBusy(btn, false); tapNote(btn, 'Saved. Connect to the internet to see your results.'); return; }
          return api('/api/score', { sid: S.sid }).then(function (res) { S.results = res; S.session.has_results = true; S.coach = []; scrubTypedText(S.sid, S.session.round); go(isJudge() ? 'card' : 'results'); });
        }
        go('task', idx + 1);
        window.scrollTo(0, 0);
      }).catch(function (e2) { tapBusy(btn, false); err.textContent = e2.message; });
    });

    var focus = params.get('scrollto');
    if (focus === 'decision') { setTimeout(function () { var d = $('#decision-panel'); if (d) d.scrollIntoView(); }, 50); }
    if (params.get('prefill') === '1' && !done && !st.choice) {
      st.choice = 'question'; st.tags = ['fake_source', 'needs_check']; st.conf = 4; st.reason = 'I could not find the book in the library search, so it looks made up.'; st.opened = true;
      saveTaskState(t.id, st);
      params.delete('prefill');
      renderTask(main, idx);
    }
  }

  /* offline demo AI: same rules as the server's demo mode */
  function norm(s) { return (s || '').toLowerCase().replace(/['’‘`]/g, '').replace(/[^a-z0-9.]+/g, ' ').replace(/(^|[^0-9])\.|\.(?![0-9])/g, '$1 ').replace(/\s+/g, ' ').trim(); }
  function phraseIn(p, text) {
    var words = norm(text).split(' ');
    var pw = norm(p.replace(/\*$/, '')).split(' ');
    var star = /\*$/.test(p);
    for (var i = 0; i + pw.length <= words.length; i++) {
      var ok = true;
      for (var j = 0; j < pw.length; j++) {
        var w = words[i + j], q = pw[j];
        if (!(w === q || (star && j === pw.length - 1 && w.indexOf(q) === 0))) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  function localDemoReply(t, text, turn) {
    var d = t.demo || {};
    // Same as the server (provider.MOVE_TEXTS): a move's exact words get the task's reply for that move.
    var said = String(text || '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
    var mv = turn > 0 && MOVES.filter(function (m) { return m.text.toLowerCase() === said; })[0];
    var mr = mv && (d.moves || {})[mv.id];
    if (mr && typeof mr === 'object' && mr.text) return mr;
    if (mr && typeof mr === 'string') {
      var pool = [d.first, d.fallback].concat(d.rules || []).filter(function (r) { return r && r.id === mr; });
      if (pool.length) return pool[0];
    }
    var rules = d.rules || [];
    for (var i = 0; i < rules.length; i++) {
      if (turn === 0 && !rules[i].also_first) continue;
      if ((rules[i].any || []).some(function (k) { return phraseIn(k, text); })) return rules[i];
    }
    return (turn === 0 ? d.first : d.fallback) || d.first || { id: null, text: 'I can help with that.' };
  }

  /* ---------------------------------------------------------------- results */
  function levelChip(a) {
    if (a.level == null) {
      if (a.previous_level) return '<span class="lvl none">' + cells(a.previous_level) + 'Level ' + a.previous_level + ' last set</span>';
      return '<span class="lvl none">' + cells(0) + 'Not measured</span>';
    }
    return '<span class="lvl">' + cells(a.level) + 'Level ' + a.level + ': ' + esc(a.level_name) + '</span>';
  }
  function strip(areas) {
    // Each block names its level in full: the number and, on a second line, the level's name.
    return '<div class="litmus-strip" role="img" aria-label="' + esc(areas.map(function (a) { return a.name + ': ' + (a.level ? 'Level ' + a.level + (a.level_name ? ', ' + a.level_name : '') : 'not measured'); }).join('. ')) + '">' +
      areas.map(function (a) { return '<div><div class="strip-cell lv-' + (a.level || 0) + '" aria-hidden="true"><b>' + (a.level ? 'Level ' + a.level : 'Not measured') + '</b>' + (a.level && a.level_name ? '<small>' + esc(a.level_name) + '</small>' : '') + '</div><span>' + esc(a.name) + '</span></div>'; }).join('') + '</div>';
  }
  // A short label for each line of evidence, from the words it starts with (the text itself is unchanged).
  function evidenceKind(d) {
    if (/^You chose/.test(d)) return 'You chose';
    if (/^The AI's answer/.test(d)) return 'What the AI did';
    if (/^Rubric:/.test(d)) return 'How it is scored';
    if (/^(Met|Not met):/.test(d)) return 'Your reason';
    if (/^(Done|Not done):/.test(d)) return 'What you did';
    if (/^Your confidence|^Your decision on this task/.test(d)) return 'How sure';
    if (/^You answered|^That is /.test(d)) return 'On your own';
    return '';
  }
  /* score2c (19 Nov 2026): a line about the reason says what the reason did or did not do, never that words matched
     or were found. Built from the scorer's own line ("Met: Says ... (your words matched 'x', worth 2).") */
  var REASON_VERB = { Says: ['said', 'did not say'], Explains: ['explained', 'did not explain'], Names: ['named', 'did not name'],
    Checks: ['checked', 'did not check'], Notices: ['noticed', 'did not notice'], Spots: ['spotted', 'did not spot'] };
  function reasonSentence(d) {
    var m = /^(Met|Not met): ([\s\S]*)$/.exec(d);
    if (!m) return d;
    var body = m[2].replace(/, worth \d+(?=\))/g, '').replace(/ \(worth \d+\)/g, '');   // no marking points in a student's words
    var cut = body.search(/ \((your words matched|the AI judge|meaning matched|worth \d)/);
    var label = (cut >= 0 ? body.slice(0, cut) : body).replace(/\.$/, '');
    // With the live marker, its quote is the student's own words: kept, as what the reason said.
    var q = / found: '([\s\S]*)'(, worth \d+)?\)\.?$/.exec(body);
    var quote = q && q[1] !== 'meaning matched' ? q[1] : '';
    var w = label.split(' ')[0], v = REASON_VERB[w], rest = label.slice(w.length + 1), met = m[1] === 'Met';
    var s = v ? 'Your reason ' + (met ? v[0] : v[1]) + ' ' + rest
      : (met ? 'Your reason did this: ' : 'Your reason did not do this: ') + label.charAt(0).toLowerCase() + label.slice(1);
    return s + (quote ? ' ("' + quote + '")' : '') + '.';
  }
  function plainEvidence(d) { return /^(Met|Not met):/.test(d) ? reasonSentence(d) : d; }
  // The marker's own method notes are not feedback on the reason ("Fair marking" says how reasons are marked).
  function methodNote(d) { return /keyword rules were used/i.test(d); }
  function plainCriterion(c) { return String(c || '').replace(/, found from key words[^.)]*/i, '').replace(/\s*Found from key words[^.]*\./i, ''); }
  // The strongest choice for a task, from the result: the task's best choices when the server sends them
  // ("best_choices"), else the student's own choice when it earned the full decision points. Why: the task's own
  // "what was going on" sentence. Nothing is made up: with neither, no line.
  // 19 Nov 2026 (one right answer): the verdict line from the scorer ("Right call." / "Not this time. The right call:
  // Question it."); an older stored result without it names its one right call.
  function strongestHtml(t) {
    if (t.breakdown) return '<p class="sx-best"><b>' + esc(t.breakdown.line) + '</b></p>';
    var best = t.best_choices && t.best_choices.length ? t.best_choices : null;
    var v = t.verdict || (best && best.length === 1 ? best[0] : null);
    if (!v || !CHOICE_NAMES[v] || v === 'verify') return '';
    return '<p class="sx-best"><b>' + (t.choice === v ? 'Right call.' : 'The right call: ' + esc(CHOICE_NAMES[v]) + '.') + '</b></p>';
  }
  function lineHtml(l) {
    var open = !!S.openWhy[l.id];
    // Design review, proposal 9: one line per task. Text cut: those lines now open with "See why".
    var details = (l.details || []).length ? '<ul class="details">' + l.details.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' : '';
    var improve = l.kind === 'focus' && l.improve ? '<p class="improve"><b>How to improve:</b> ' + esc(l.improve) + '</p>' : '';
    var why = '<div class="why" id="why-' + l.id + '" ' + (open ? '' : 'hidden') + '>' + improve + details + '<h4>Based on</h4>' +
      l.evidence.map(function (ev) {
        return '<div class="ev"><h5 class="ev-h">' + esc(ev.task_title) + '</h5><dl class="ev-rows">' + ev.did.filter(function (d) { return !methodNote(d); }).map(function (d) {
          var k = /^(Met|Not met):/.test(d) ? '' : evidenceKind(d);
          return '<div class="ev-row">' + (k ? '<dt>' + k + '</dt>' : '') + '<dd>' + esc(plainEvidence(d)) + '</dd></div>';
        }).join('') + '<div class="ev-row"><dt>What counts</dt><dd>' + esc(plainCriterion(ev.criterion)) + '</dd></div></dl></div>';
      }).join('') + '</div>';
    var tasks = l.count > 1 ? ' <span class="small muted">(' + l.count + ' tasks)</span>' : '';
    // score2 (19 Nov 2026): "Practice only" sits once, by the score; Listen is the icon-only control of the task screens.
    return '<li class="line ' + l.kind + '" id="line-' + l.id + '"><div class="row between line-head"><span class="line-tags"><span class="tag">' + esc(l.area_name) + '</span></span>' + listenSm('line-' + l.id, 'Listen: read this feedback aloud') + '</div>' +
      '<p class="line-text" style="margin:6px 0 0">' + esc(l.text) + tasks + '</p>' +
      '<div class="line-acts"><button type="button" class="why-btn why-toggle" data-why="' + l.id + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="why-' + l.id + '"><span>See why</span>' + ICON.chev + '</button>' + flagBtn(l.key) + '</div>' + why + '</li>';
  }

  function renderResults(main) {
    main.innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading your results</p>';
    // score2: "&partial=1" asks for what the tasks decided so far earned, when the set is not finished. A server
    // without that (the frozen format) ignores it and answers as before.
    var p = S.results && S.results.round === (S.session.has_results ? S.session.round : S.session.round - 1) ? Promise.resolve(S.results) : api('/api/results?sid=' + encodeURIComponent(S.sid) + '&partial=1');
    p.then(function (res) { S.results = res; drawResults(main, res); }, function (e) {
      main.innerHTML = '<div class="card"><h1>Your results</h1><p>' + esc(e.offline ? 'Results need a connection. Your answers are saved on this device.' : e.message) + '</p><button class="btn" type="button" data-go="task">Back to the tasks</button></div>';
    });
  }

  // Every task, in plain words: where the AI was wrong on purpose, what it got wrong and what is correct.
  function aiLinesHtml(res) {
    return '<p class="small muted">In this assessment the AI was wrong on purpose in some tasks. Here is what was going on in each one.</p><ol class="ai-lines" id="ai-lines">' +
      res.tasks.map(function (t) {
        var what = String(t.what_was_going_on || '').replace(/^None\.\s*/, '');
        return '<li><b>' + esc(t.title) + '</b><span class="ai-was-h">' + (t.ai_correct ? ICON.tick + 'The AI was right here.' : ICON.info + 'The AI had a problem here.') + '</span>' +
          (what ? '<span class="ai-what">' + esc(what) + (t.correction ? ' ' + esc(t.correction) : '') + '</span>' : '') + '</li>';
      }).join('') + '</ol><div class="row">' + listenBtn('ai-lines', 'Listen: read what the AI got wrong') + '</div>';
  }
  function firstThoughtsHtml(res) {
    var rows = res.tasks.filter(function (t) { return t.first_thought; });
    if (!rows.length) return '';
    return more('ft-more', 'Your first thoughts', '<p class="small muted">What you thought before the AI replied, and what you decided after it. Not scored.</p><ol class="ft-list">' +
      rows.map(function (t) {
        return '<li><b>' + esc(t.title) + '</b><span><b>Your first thought:</b> ' + esc(t.first_thought) + '</span><span><b>After the AI:</b> ' + (t.choice ? ICON[t.choice] + esc(CHOICE_NAMES[t.choice]) : 'not decided') + '</span></li>';
      }).join('') + '</ol>', 'row-more');
  }
  // The five topics as rows, always in the same order: name, level, and bar. A tap shows the detail.
  // The four capacities as headings over the topics (pedagogy.json capacity_headings, 19 Nov 2026). Labels only:
  // the same rows in groups, nothing scored per capacity. ?capacities=1 or 0 on the address sets it on this
  // device; otherwise the server's setting decides. Off: the list below is exactly as before.
  var CAP_PARAM = params.get('capacities');
  if (CAP_PARAM === '1' || CAP_PARAM === '0') store.set('litmus-capacities', CAP_PARAM);
  function capacityGroups() {
    var c = S.rubric && S.rubric.capacities;
    if (!c || !c.groups || !c.groups.length) return null;
    var p = store.get('litmus-capacities');
    var on = p === '1' ? true : p === '0' ? false : !!c.on;
    return on ? c : null;
  }
  /* ---------------------------------------------------------------- the score, made plain (score2, 19 Nov 2026)
     The four parts under the big number (score_parts.js splits the score; the rows add up to it), ONE level line,
     what each task earned, and "How your score works" behind one tap. Nothing here changes a number. */
  var LS = window.LitmusScore;
  function tasksCounted(a) { return a.tasks_counted != null ? a.tasks_counted : (a.sources || []).filter(function (s) { return s !== 'prompts'; }).length; }
  function soFar(n) { return 'From ' + n + (n === 1 ? ' task' : ' tasks') + ' so far.'; }
  // A topic's detail: its level in plain words, the one step a held level needs, and how many tasks it is from.
  function topicPlain(a) {
    if (a.level == null || !LS) return a.level_plain;
    var held = LS.heldSteps({ areas: [a] })[0];
    return LS.levelName(a.level) + ': ' + LS.levelMeans(a.level) + '.' + (held ? ' ' + held.held.step : '') + ' ' + soFar(tasksCounted(a));
  }
  var SHORT_PART = { decision: 'Decision', reasoning: 'Reason', action: 'What you did', no_ai: 'On your own' };
  var PART_MEANS = { no_ai: 'One question, answered with no AI.' };   // shown where the part is first shown
  function partsHtml(pp, res) {
    if (!pp) return '';
    var na = LS.noAiCount ? LS.noAiCount(res) : null;
    // Good news first (19 Nov 2026): strongest part first, its mark on the level lines, one "Work on this".
    var rows = markedRows(pp.filter(function (p) { return p.of > 0; }).map(function (p) { return { id: p.id, name: p.name, points: p.earned, of: p.of }; }));
    return '<ol class="sx-parts" aria-label="What makes up your score">' + rows.map(function (p) {
      var pct = p.of ? Math.round(100 * p.points / p.of) : 0;
      var note = PART_MEANS[p.id] ? '<span class="sx-note">' + esc(PART_MEANS[p.id]) + '</span>' : '';
      return '<li class="sx-part is-' + p.mark + '"><span class="sx-name">' + markHtml(p.mark) + esc(SHORT_PART[p.id] || p.name) + (p.mark === 'mid' ? ' <b class="sx-nearly">Nearly</b>' : '') + '</span><span class="sx-num"><b>' + p.points + '</b>/' + p.of + '<span class="visually-hidden"> points</span></span>' +
        '<span class="sx-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' + note +
        (p.work ? '<span class="sx-work"><b>Work on this:</b> ' + esc(p.work) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  // cp_9: where most points went, under the four parts (results page and the result card).
  function lossHtml(res) { var l = LS && LS.lossLine ? LS.lossLine(res) : ''; return l ? '<p class="sx-loss" id="loss-line">' + esc(l) + '</p>' : ''; }
  function howHtml(res) {
    var h = LS.howLines(res);
    var na = LS.noAiCount ? LS.noAiCount(res) : null;
    var first = ['Decision: did you pick right?', 'Reason: does it name the problem?', 'Actions: did you check, fix, or hold back details?',
      'On your own: one question, answered with no AI' + (na && na.of ? ', asked in ' + na.asked + ' of ' + na.of + ' tasks.' : '.')];
    return '<ul class="sx-how">' + first.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      more('how-more-2', 'More', '<ul class="sx-how">' + h.parts.concat(h.rules).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>', 'row-more');
  }
  // What each task earned: one row per task, each opening to the detail that exists today.
  function taskListHtml(res) {
    return '<section class="card sx-tasks" aria-labelledby="sx-tasks-h"><h2 id="sx-tasks-h">What each task earned <span class="sx-h-small">out of 100</span></h2><ol class="sx-task-list">' +
      res.tasks.map(function (t, i) {
        var id = 'sx-task-' + i;
        if (!t.done || t.score == null) return '<li class="sx-task todo"><span class="sx-t-name">' + (i + 1) + '. ' + esc(t.title) + '</span><span class="sx-t-pts muted">Not done yet</span></li>';
        // Each part's points, and under it what the student did that earned them (the scorer's own evidence lines).
        var tp = LS.taskParts(t) || [];
        var bd = t.breakdown ? breakdownRowsHtml(t.breakdown) : '';
        var rows = '<dl class="sx-trace">' + tp.map(function (p) {
          var lines = (((t.components || {})[p.id] || {}).evidence || []).filter(function (d) { return !/^Rubric:/.test(d) && !methodNote(d); }).map(plainEvidence);
          return '<div class="sx-tr-part"><dt><span>' + esc(p.name) + '</span><span class="sx-num"><b>' + p.earned + '</b> of ' + p.of + '</span></dt>' +
            lines.map(function (d) { return '<dd>' + esc(d) + '</dd>'; }).join('') + '</div>';
        }).join('') + '</dl>';
        var cal = (t.components || {}).calibration;
        var dl = cal ? '<p class="small muted sx-cal">' + esc((cal.evidence || [])[0] || '') + ' Not scored.</p>' : '';
        return '<li class="sx-task"><button type="button" class="sx-t-row" data-explain aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="sx-t-name">' + (i + 1) + '. ' + esc(t.title) + '</span><span class="sx-t-pts"><b>' + t.score + '</b><span class="visually-hidden"> out of 100</span></span><span class="sx-explain sx-explain-w" aria-hidden="true">Explain</span></button>' +
          '<div class="sx-t-detail" id="' + id + '" hidden>' + strongestHtml(t) + (bd ? bd + more(id + '-more', 'More', rows + dl, 'row-more') : rows + dl) + '</div></li>';
      }).join('') + '</ol></section>';
  }
  function topicsResults(res) {
    var stdLevel = (S.rubric.standard && S.rubric.standard.level) || 2;
    var cap = capacityGroups();
    var rowHtml = function (a) {
      var w = a.score == null ? 0 : a.score;
      var change = (a.previous_level && a.level && a.level > a.previous_level) ? ' Up from Level ' + a.previous_level + '.' : '';
      var detail = a.score == null ? esc(a.level_plain) : esc(topicPlain(a)) + change;
      return '<li class="topic"><button type="button" class="topic-row" data-disclose aria-expanded="false" aria-controls="topic-' + esc(a.id) + '">' +
          '<span class="t-name">' + esc(a.name) + '</span>' + levelChip(a) + ICON.chev +
          '<span class="bar" aria-hidden="true"><i class="lv-' + (a.level || 0) + '" style="width:' + w + '%"></i><span class="std" title="Capable"></span></span></button>' +
        '<div class="topic-detail area-meta" id="topic-' + esc(a.id) + '" hidden><p>' + detail + '</p>' + (TOPIC_LINE[a.id] ? '<p class="small muted">' + esc(a.name) + ': ' + esc(TOPIC_LINE[a.id].toLowerCase()) + '</p>' : '') + '</div>' +
        (a.reviewed ? '<span class="tag review-tag">' + ICON.review + 'Reviewed by your teacher</span>' : '') + '</li>';
    };
    var groups;
    if (cap) {
      var byId = {}, used = {};
      res.areas.forEach(function (a) { byId[a.id] = a; });
      groups = cap.groups.map(function (g) {
        var items = g.areas.filter(function (id) { return byId[id] && !used[id]; }).map(function (id) { used[id] = true; return rowHtml(byId[id]); }).join('');
        return items ? '<li class="area-group cap-group"><h3 class="area-group-h">' + esc(g.label) + '</h3><ul class="area-list topic-list">' + items + '</ul></li>' : '';
      }).join('');
      var rest = res.areas.filter(function (a) { return !used[a.id]; }).map(rowHtml).join('');
      if (rest) groups += '<li class="area-group"><ul class="area-list topic-list">' + rest + '</ul></li>';
      if (cap.source_line) groups += '<li class="area-group"><p class="small muted cap-source">' + esc(cap.source_line) + '</p></li>';
    } else {
      groups = '<li class="area-group"><ul class="area-list topic-list">' + res.areas.map(rowHtml).join('') + '</ul></li>';
    }
    return '<section class="card topics-card" aria-labelledby="areas-h"><h2 id="areas-h">Topics</h2>' +
      '<ul class="area-groups">' + groups + '</ul>' +
      more('levels-more', 'About levels', '<p class="small">The line on each bar is Capable: the level to reach.</p><p class="small">Your levels are private to you and your teacher.</p>' + more('levels-more-2', 'More', '<p class="small">Everyone works towards it. ' + esc(S.rubric.provisional_note || '') + '</p>', 'row-more'), 'row-more') +
      '</section>';
  }
  function shortSet(res) { return !!(res && res.tasks_total && res.tasks_total <= 3); }
  function drawResults(main, res) {
    S.flagged = res.flagged_feedback || [];
    var lmap = {};
    res.lines.forEach(function (l) { lmap[l.id] = l; });
    var strengths = res.lines.filter(function (l) { return l.kind === 'strength'; });
    var focus = res.lines.filter(function (l) { return l.kind === 'focus'; });
    var shortS = res.short.strength_ids.map(function (id) { return lmap[id]; }).filter(Boolean);
    var shortF = res.short.focus_ids.map(function (id) { return lmap[id]; }).filter(Boolean);
    var showS = S.shortView ? shortS : strengths;
    var showF = S.shortView ? shortF : focus;
    var prev = res.previous_overall != null ? '<p class="small muted">Your last set: ' + res.previous_overall + '.</p>' : '';
    var tnum = {};
    res.tasks.forEach(function (t, i) { tnum[t.task_id] = { n: i + 1, title: t.title }; });
    var reviewed = (res.reviews || []).length ? '<h2 id="rev-h" class="visually-hidden">Reviewed by your teacher</h2>' +
      res.reviews.map(function (rv) {
        var t = tnum[rv.task_id] || { n: '', title: '' };
        return '<div class="review-note" role="note">' + ICON.review + '<div><b>Task ' + t.n + ': ' + esc(t.title) + '</b><p>' + esc(rv.text) + '</p><p class="small">Their reason: "' + esc(rv.reason) + '"</p></div></div>';
      }).join('') + '<p class="small muted" style="margin:8px 0 0">The scores on this page include the review. The first result is kept as well.</p>' : '';
    // score2: the four parts, the one level line, and how far through the set this is.
    var pp = LS ? LS.parts(res) : null;
    // No level line until the set is finished (coordinator, 07:58): part way, the number so far and the four parts only.
    var ll = LS && !(res.tasks_total && res.tasks_done < res.tasks_total) ? LS.levelLine(res) : null;
    var partial = res.tasks_total && res.tasks_done < res.tasks_total;
    var from = partial ? res.tasks_done + ' of ' + res.tasks_total + ' tasks so far' : res.tasks_done + (res.tasks_done === 1 ? ' task' : ' tasks');
    // score2c: on a short set one task is a third of the score; the line under the number sets that expectation.
    if (!partial && shortSet(res)) from = res.tasks_done + ' tasks: a first reading.';
    // The last task's correction: no student leaves believing a planted error, even when the last task
    // goes straight to the results.
    var lc = S.lastCorrection && !DEMO ? S.lastCorrection : null;
    var savedNote = lc ? '<div class="saved-note" id="saved-note" role="status"><p><b>Task ' + lc.n + ' saved.</b> ' + (lc.ai_correct ? 'The AI was right there. ' : 'What the AI got wrong there: ') +
      esc(String(lc.text).replace(/^None\.\s*/, '')) + (lc.correction ? ' ' + esc(lc.correction) : '') + '</p><button type="button" class="btn small quiet" id="saved-note-ok">OK</button></div>' : '';
    var moreLines = S.shortView && (strengths.length > showS.length || focus.length > showF.length);

    main.innerHTML = savedNote +
      '<h1>Your results</h1>' +
      '<section class="card panel" aria-labelledby="score-h" id="score-card">' +
        // score2 (19 Nov 2026): the big number, straight under it the four parts that add up to it, then ONE line
        // for the level. "How your score works" is one tap away. The headline is in the feedback below.
        '<div class="sx-hero"><div class="sx-left"><h2 id="score-h" class="visually-hidden">Your Litmus score</h2>' +
          '<div class="sx-top"><div class="big-score">' + (res.overall == null ? 'n/a' : res.overall) + '<small>out of 100</small></div>' + (pp ? explainBtn('sx-parts-box') : '') + listenSm('score-card', 'Listen: read your score aloud') + '</div>' +
          '<p class="small muted sx-meta"><span>' + esc(setLabel()) + ' · ' + esc(from) + '</span>' + pfLabel() + '</p>' + prev + '</div>' +
          '<div class="sx-right">' + (pp ? '<div id="sx-parts-box"' + (explainOpen('sx-parts-box') ? '' : ' hidden') + '>' + partsHtml(pp, res) + '</div>' : '') +
          (ll ? '<p class="sx-level" id="level-line"><b>' + esc(ll.lead) + '.</b> ' + esc(ll.step || ll.text) + '</p>' : '') + '</div></div>' +
        (LS ? more('how-more', 'How your score works', howHtml(res), 'row-more sx-how-more') : '') +
        '<div class="score-actions"><button type="button" class="btn" data-go="' + (partial ? 'task' : 'next') + '">' + (partial ? 'Back to the tasks' : 'Next set') + '</button><button type="button" class="btn secondary" data-go="trail">Decision Trail</button></div>' +
      '</section>' +
      taskListHtml(res) +
      '<div class="grid-2" style="margin-top:20px">' +
        '<div class="stack">' +
          topicsResults(res) +
          '<section class="card" aria-labelledby="keep-h"><h2 id="keep-h">Keep doing this</h2><ul class="lines">' + (showS.length ? showS.map(lineHtml).join('') : '<li class="muted">No strengths recorded yet in this set.</li>') + '</ul></section>' +
          '<section class="card" aria-labelledby="focus-h"><h2 id="focus-h">Topic to work on</h2><ul class="lines">' + (showF.length ? showF.map(lineHtml).join('') : '<li class="muted">Nothing to fix here. Try the next set.</li>') + '</ul>' +
            (moreLines ? '<button type="button" class="btn quiet small" id="see-full">See all feedback (' + res.lines.length + ')</button>' : '') +
            (!S.shortView ? '<button type="button" class="btn quiet small" id="see-short">Show less</button>' : '') + '</section>' +
        '</div>' +
        '<div class="stack">' +
          // score2: everything below "Topic to work on" starts closed, one tap each.
          '<section class="card more-list" aria-label="More about your results">' +
            more('dt-more', 'Your Decision Trail', '<h2 id="dt-h" class="visually-hidden">Your Decision Trail</h2>' + trailStrip(res.tasks.map(function (t, i) { return { n: i + 1, choice: t.choice, confidence: t.confidence, title: t.title }; })), 'row-more') +
            (reviewed ? more('rev-more', 'Reviewed by your teacher', reviewed, 'row-more') : '') +
            more('ai-more', 'What the AI got wrong', aiLinesHtml(res), 'row-more') +
            firstThoughtsHtml(res) +
            more('fair-more-r', 'Fair marking', '<p class="fair-note">' + ICON.scale + '<span>' + esc(String(res.fairness_statement || '')) + '</span></p>' +
              '<p class="small">How sure you were is shown to help you reflect, and is not scored. Open "See why" on any line to see the exact evidence.</p><p class="small muted">This is an indicator from one set of tasks, not a final grade.</p>' +
              '<p class="small">To ask your teacher to review one task, open your Decision Trail and choose "Ask for a review" under that task.</p>', 'row-more') +
          '</section>' +
          '<section class="card coach" aria-label="Ask about my feedback">' +
            more('coach-more', 'Ask about my feedback', '<p class="small muted">Litmus Coach explains your results. It is built to give hints, not answers. It is software, not a person.</p>' +
              '<div class="messages" id="coach-msgs" aria-live="polite"></div>' +
              '<div class="chips" style="margin:8px 0">' + ['How was my score worked out?', 'Why is "' + (res.areas.slice().filter(function (a) { return a.score != null; }).sort(function (a, b) { return a.score - b.score; })[0] || { name: 'Checking its output' }).name + '" a topic to work on?', 'What does Capable mean?'].map(function (q) { return '<button type="button" class="chip" data-ask="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
              '<form id="coach-form" class="row" novalidate><label class="visually-hidden" for="coach-input">Your question about your feedback</label><textarea id="coach-input" rows="2" maxlength="1000" placeholder="Ask a question about your feedback"></textarea>' + micBtn('coach-input') + '<button class="btn" type="submit">' + ICON.send + '<span>Ask</span></button></form>', 'row-more coach-more') +
          '</section>' +
        '</div>' +
      '</div>';

    // Part way through a set: no topic levels or feedback sections yet, only the score card and the task list.
    if (res.tasks_total && res.tasks_done < res.tasks_total) { var g2 = main.querySelector('.grid-2'); if (g2) g2.hidden = true; }
    var sno = $('#saved-note-ok'); if (sno) sno.addEventListener('click', function () { S.lastCorrection = null; $('#saved-note').remove(); main.focus({ preventScroll: true }); });
    var sf = $('#see-full'); if (sf) sf.addEventListener('click', function () { S.shortView = false; drawResults(main, res); });
    var ss = $('#see-short'); if (ss) ss.addEventListener('click', function () { S.shortView = true; drawResults(main, res); });
    $all('.lines', main).forEach(function (ul) { wireFlags(ul, res.round); });
    $all('[data-why]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.why;
        var box = document.getElementById('why-' + id);
        box.hidden = !box.hidden;
        S.openWhy[id] = !box.hidden;
        b.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      });
    });
    // The coach stays open once a question has been asked, so a reply is never hidden.
    if (S.coach.length) { var cb = $('#coach-more'); var ct = $('[aria-controls="coach-more"]'); if (cb && ct) { cb.hidden = false; ct.setAttribute('aria-expanded', 'true'); } }
    function drawCoach() {
      var box = $('#coach-msgs');
      if (!box) return;   // the student moved to another screen before the reply came
      box.innerHTML = S.coach.length ? S.coach.map(function (m, i) {
        if (m.role === 'user') return '<div class="msg user">' + esc(m.text) + '</div>';
        if (m.blocked) return '<div class="msg ai"><span class="who">Litmus Coach</span>' + esc(m.text) + '</div>';
        return '<div class="msg ai"><span class="who">Litmus Coach</span><span class="msg-labels">' + pfLabel() + scriptedLabel(m.source) + '</span>' + esc(m.text) +
          '<div class="msg-acts">' + (m.flagged ? '<span class="flag-done">' + ICON.tick + 'Sent to your teacher</span>' : flagBtn('coach', i)) + '</div></div>';
      }).join('') : '';
      wireFlags(box, res.round);
      box.scrollTop = box.scrollHeight;
    }
    var asking = false;
    function ask(q) {
      // One question at a time: a double click used to send the same question twice.
      if (asking) return;
      asking = true;
      S.coach.push({ role: 'user', text: q });
      drawCoach();
      var box = $('#coach-msgs');
      var typing = document.createElement('p');
      typing.className = 'typing';
      typing.innerHTML = '<span class="spinner" aria-hidden="true"></span> Litmus Coach is replying';
      box.appendChild(typing);
      box.scrollTop = box.scrollHeight;
      api('/api/feedback-chat', { sid: S.sid, message: q }).then(function (r) { asking = false; S.coach.push({ role: 'ai', text: r.reply, source: r.source, blocked: !!r.blocked }); drawCoach(); followMode(r); }, function (e) { asking = false; typing.remove(); tapNote($('#coach-form'), e.offline ? 'The coach needs a connection.' : e.message); });
    }
    drawCoach();
    $all('[data-ask]').forEach(function (b) { b.addEventListener('click', function () { ask(b.dataset.ask); }); });
    $('#coach-form').addEventListener('submit', function (e) { e.preventDefault(); var v = $('#coach-input').value.trim(); if (!v) { tapNote($('#coach-form'), 'Type or say a question first.'); $('#coach-input').focus(); return; } if (asking) return; $('#coach-input').value = ''; ask(v); });
    var openId = Object.keys(S.openWhy)[0];
    if (openId && params.get('why')) { var el = document.getElementById('line-' + openId); if (el) setTimeout(function () { el.scrollIntoView(); }, 50); }
  }

  function clockTime(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    return 'At ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ', before the AI replied.';
  }

  /* ---------------------------------------------------------------- trail */
  function renderTrail(main) {
    main.innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading your Decision Trail</p>';
    var rnd = S.session.has_results ? S.session.round : (S.session.done.length ? S.session.round : Math.max(1, S.session.round - 1));
    var pdWant = practiceOn() && S.session.practice && S.session.practice.started;
    Promise.all([api('/api/trail?sid=' + encodeURIComponent(S.sid) + '&round=' + rnd), pdWant ? pdLoad(true).catch(function () { return null; }) : null]).then(function (both) {
      var tr = both[0];
      var openAll = params.get('open') === 'all';
      var items = tr.tasks.map(function (t, i) {
        var steps = t.steps.map(function (s) {
          var cls = s.kind;
          var body = '<span>' + esc(s.text) + '</span>';
          if (s.kind === 'chat') body += (s.source === 'scripted_note' ? '<div class="small muted">' + esc(s.reply) + '</div>' : '<div class="reply"><b>AI:</b> ' + scriptedLabel(s.scripted ? '' : 'live') + esc(s.reply) + '</div>') + (s.note ? '<div class="small muted">' + esc(s.note) + '</div>' : '');
          if (s.kind === 'edit') body += '<div class="reply">' + esc(s.detail) + '</div>';
          if (s.kind === 'followup') body += '<div class="reply"><b>AI:</b> ' + scriptedLabel(s.scripted ? '' : 'live') + esc(s.reply) + '</div>' + (s.note ? '<div class="small muted">' + esc(s.note) + '</div>' : '');
          if (s.kind === 'decision') body = '<b>' + esc(s.text) + '</b>' + (s.reason ? '<div>Your reason: "' + esc(s.reason) + '"</div>' : '') + (s.tags && s.tags.length ? '<div class="small">Tapped: ' + esc(s.tags.join('; ')) + '</div>' : '') + '<div class="small muted">How sure: ' + esc(s.confidence) + (s.input_mode ? ' · ' + esc(s.input_mode) : '') + '</div>' + (s.marker ? '<div class="small muted marker-line">' + esc(s.marker) + '</div>' : '');
          if (s.kind === 'time') body = '<span class="time">' + esc(s.text) + '</span>';
          if (s.kind === 'first_thought') body = '<span>' + esc(s.text) + '</span><div class="small muted">' + esc(clockTime(s.ts)) + (s.note ? ' · ' + esc(s.note) : '') + '</div>';
          return '<li class="tl-' + cls + '">' + body + '</li>';
        }).join('');
        var debrief = t.decided ? '<div class="debrief" id="debrief-' + t.task_id + '"><p><b>What was going on:</b> ' + esc(t.what_was_going_on) + (t.correction ? ' ' + esc(t.correction) : '') + '</p><p style="margin:0"><b>Keep in mind:</b> ' + esc(t.teach) + '</p></div>' + reviewBox(t) : '<p class="muted">Not finished yet.</p>';
        return '<details class="card trail-task" ' + (openAll || (t.reviews || []).length || (t.review_request && t.review_request.status === 'open') ? 'open' : '') + '><summary><span class="num">' + (i + 1) + '</span><b>' + esc(t.title) + '</b>' + (t.score != null ? '<span class="small muted">' + t.score + ' out of 100</span>' : '') + ICON.chev + '</summary>' +
          '<div id="trail-' + t.task_id + '"><p class="small muted" style="margin-top:10px">Topic: ' + esc(t.area_name || t.competency) + '</p><ol class="timeline">' + (steps || '<li>No steps yet.</li>') + '</ol>' + debrief + '</div>' +
          '<div class="row" style="margin-top:8px">' + listenBtn('trail-' + t.task_id, 'Listen: read this task\'s trail aloud') + '</div></details>';
      }).join('');
      var stripItems = tr.tasks.map(function (t, i) {
        var d = t.steps.filter(function (x) { return x.kind === 'decision'; }).pop();
        var conf = d ? (S.rubric.confidence_scale.filter(function (c) { return c.label === d.confidence; })[0] || {}).value : null;
        return { n: i + 1, choice: d ? d.choice : null, confidence: conf, title: t.title };
      });
      main.innerHTML = '<h1 style="margin-bottom:6px">Your Decision Trail</h1><p class="pf-row">' + pfLabel() + '</p>' +
        '<section class="card panel" style="margin-bottom:20px">' + trailStrip(stripItems) +
        more('trail-more', 'More about this', '<p class="small">Icons show your choice, not right or wrong.</p><p class="small">Every step, task by task.</p><p class="small">Time is shown, never scored.</p>', 'row-more') + '</section>' + (pdWant ? pdTrailHtml() : '') + items +
        '<div class="row"><button type="button" class="btn" data-go="results">Back to results</button></div>';
      wireReviewAsk(main, tr.round);
    }, function (e) { main.innerHTML = '<div class="card"><p>' + esc(e.offline ? 'Your Decision Trail needs a connection.' : e.message) + '</p></div>'; });
  }

  /* ---------------------------------------------------------------- score review (student side)
     A quiet "Ask for a review" under a finished task's feedback. It records a request with an
     optional short reason; the teacher reviews it. A student never changes a score. */
  function reviewNote(rv, t) {
    var after = rv.kind !== 'decision_credit' ? '' : (t && t.score != null ? ' This task now scores ' + t.score + ' out of 100.' : '');
    return '<div class="review-note" role="note">' + ICON.review + '<div><b>Reviewed by your teacher</b><p>' + esc(rv.text) + esc(after) + '</p>' +
      '<p class="small">Their reason: "' + esc(rv.reason) + '"</p></div></div>';
  }
  function reviewBox(t) {
    var notes = (t.reviews || []).map(function (rv) { return reviewNote(rv, t); }).join('');
    var req = t.review_request;
    var asked = req && req.status === 'open' ? '<p class="review-asked" role="status">' + ICON.clock + '<span>Review asked for. Your teacher will look at this task.</span></p>' : '';
    var ask = t.can_ask_review ?
      '<div class="review-ask"><button type="button" class="why-btn" data-ask-review="' + esc(t.task_id) + '" aria-expanded="false" aria-controls="ra-' + esc(t.task_id) + '">Ask for a review</button>' +
      '<form class="review-form" id="ra-' + esc(t.task_id) + '" data-task="' + esc(t.task_id) + '" novalidate hidden>' +
        '<label class="field"><span>What should your teacher look at? <span class="hint">(optional)</span></span><textarea rows="2" maxlength="300" id="ra-text-' + esc(t.task_id) + '"></textarea></label>' +
        '<p class="small muted">Your teacher sees this with your Decision Trail. Do not type personal details.</p>' +
        '<p class="error" role="alert"></p>' +
        '<div class="row"><button class="btn small" type="submit">Send to my teacher</button><button class="btn small quiet" type="button" data-cancel-review>Cancel</button></div>' +
      '</form></div>' : '';
    return notes || asked || ask ? '<div class="review-box">' + notes + asked + ask + '</div>' : '';
  }
  function wireReviewAsk(main, rnd) {
    $all('[data-ask-review]', main).forEach(function (b) {
      var form = document.getElementById('ra-' + b.dataset.askReview);
      b.addEventListener('click', function () {
        var d = b.closest('details'); if (d) d.open = true;   // the request and its answer are always in view
        form.hidden = !form.hidden;
        b.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
        if (!form.hidden) form.querySelector('textarea').focus();
      });
      form.querySelector('[data-cancel-review]').addEventListener('click', function () { form.hidden = true; b.setAttribute('aria-expanded', 'false'); b.focus(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var send = form.querySelector('button[type="submit"]');
        if (send.disabled) return;
        send.disabled = true;
        api('/api/review/request', { sid: S.sid, task_id: form.dataset.task, round: rnd, reason: form.querySelector('textarea').value }).then(function (rr) {
          if (rr && rr.support) showSupport(rr.support);
          var box = form.closest('.review-ask');
          box.outerHTML = '<p class="review-asked" role="status" tabindex="-1" id="ra-done-' + esc(form.dataset.task) + '">' + ICON.clock + '<span>Review asked for. Your teacher will look at this task.</span></p>';
          var done = document.getElementById('ra-done-' + form.dataset.task); if (done) done.focus();
        }, function (e2) {
          send.disabled = false;
          form.querySelector('.error').textContent = e2.offline ? 'Asking for a review needs a connection.' : e2.message;
        });
      });
    });
  }

  /* ---------------------------------------------------------------- next set */
  // The set rules from pedagogy.json (decisions 1 and 4), so this line stays true if a rule is switched off.
  function setRulesLine(s) {
    var r = (s && s.set_rules) || {};
    var right = r.min_ai_right > 0, noAi = r.min_no_ai > 0;
    if (right && noAi) return '<p>Every set has at least one task where the AI is right, so trusting it can be the right call, and one question you answer without AI.</p>';
    if (right) return '<p>Every set has at least one task where the AI is right, so trusting it can be the right call.</p>';
    if (noAi) return '<p>Every set has at least one question you answer without AI.</p>';
    return '';
  }
  function renderNext(main) {
    var s = S.session;
    var started = s.round > 1 && !s.has_results;
    if (!started) {
      main.innerHTML = '<div class="card start-card" style="max-width:760px"><h1>Your next set</h1><p class="lede">Practice aimed at your weakest topics.</p>' +
        // My subjects (static/profile.js, 19 Nov 2026): one quiet line while no subject is picked.
        (window.LitmusProfile && window.LitmusProfile.subjectsOffer ? window.LitmusProfile.subjectsOffer() : '') +
        '<p class="error" id="next-error" role="alert"></p><button class="btn block" type="button" id="make-next">Choose my next set</button>' +
        more('next-more', 'How tasks are picked', '<ul><li>From your weakest topics, at your level, one step up.</li><li>' + allocationLine(plan().alloc) + '</li>' + (plan().minNoAi > 0 ? '<li>Always one question without AI. No repeats.</li>' : '<li>No repeats.</li>') + '</ul>' +
          more('next-more-2', 'More', '<p>Everyone works towards the same standard. Some people get there with more practice.</p>', 'row-more'), 'row-more') + '</div>';
      $('#make-next').addEventListener('click', function () {
        var b = $('#make-next'); b.disabled = true;
        api('/api/next-set', { sid: S.sid }).then(function (st) { setSession(st); renderNext(main); updateNav('next'); }, function (e) { $('#next-error').textContent = e.message; b.disabled = false; });
      });
      return;
    }
    var list = s.tasks.map(function (t) {
      return '<li><div><div class="row"><b>' + esc(t.title) + '</b><span class="tag">' + esc(t.area_name) + '</span><span class="tag">Level ' + esc(t.level) + '</span></div><p class="small muted" style="margin:4px 0 0">' + esc((s.reasons || {})[t.id] || '') + '</p></div></li>';
    }).join('');
    main.innerHTML = '<section class="card" style="max-width:760px"><h1>Your next set</h1><p class="lede">' + s.tasks.length + ' tasks, chosen for you.</p><ol class="next-list">' + list + '</ol>' +
      '<div class="row" style="margin-top:12px"><button class="btn" type="button" data-go="task">Start</button></div>' +
      more('next-why', 'Why these tasks', '<p>Your results showed where to practise. Each task above says why it was chosen.</p>' + setRulesLine(s) + '<p>The goal is the same for everyone: Level 2, the Litmus Standard, ' + topicsGoal(plan().topics) + '. Your levels are private to you and your teacher.</p><p class="small muted">This follows the Teaching at the Right Level method: find the level, teach to it, check again.</p>', 'row-more') + '</section>';
  }

  // Six-digit codes (19 Nov 2026): shown as "482 915". Any other code is shown as it is.
  function displayCode(c) { c = String(c == null ? '' : c); var m = /^(\d{3})\s*(\d{3})$/.exec(c); return m ? m[1] + ' ' + m[2] : c; }
  /* ---------------------------------------------------------------- practise a decision (19 Nov 2026)
     The Learning and Assessment Lead's guided scenario (content/practice_careers.json): the student's own
     answer first, then her five GOFER steps (Goals clarification, Options generation, Facts-finding, Effects,
     Review) with a coaching AI whose turns are written in advance, a quotation to open, and a debrief.
     A separate mode: nothing here is scored and the tasks are not touched. Shown only while the server says
     it is on (rubric.practice). Screens: #/practice (intro), #/practice/1 (own answer first),
     #/practice/2 to 6 (the steps), #/practice/7 (debrief). */
  function practiceOn() { return !!(S.rubric && S.rubric.practice); }
  var PD = { data: null, sid: null, fu: {} };
  function pdLoad(fresh) {
    if (!fresh && PD.data && PD.sid === S.sid) return Promise.resolve(PD.data);
    return api('/api/practice?sid=' + encodeURIComponent(S.sid)).then(function (d) { PD.data = d; PD.sid = S.sid; PD.fu = {}; return d; });
  }
  function pdWords(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }
  function pdAnswers() { return ((PD.data || {}).saved || {}).answers || {}; }
  function pdText(step, part) { return ((pdAnswers()[step] || {})[part] || {}).text || ''; }
  function pdNote(finished) {
    if (S.session) S.session.practice = { on: true, started: true, finished: !!finished };
  }
  function pdAi(id, text) {
    return '<div class="msg ai cf-ai pd-ai"><div class="cf-who"><span class="cf-av">' + ICON.chip + '</span>AI' + scriptedLabel('') + '<span class="spacer"></span>' +
      listenSm(id, 'Listen to this reply') + '</div><div class="cf-body" id="' + id + '">' + esc(text) + '</div></div>';
  }
  function pdFirstOpen() {
    var sc = PD.data.scenario, a = pdAnswers();
    if (!a.first || !a.first.goal || !a.first.idea) return 1;
    for (var i = 0; i < sc.steps.length; i++) if (!(a[sc.steps[i].id] || {}).main) return i + 2;
    return PD.data.saved.finished ? 7 : 6;
  }
  function pdQuoteHtml(q) {
    var rows = q.sections.map(function (sec) {
      return '<tr class="pd-q-sec"><th colspan="2" scope="colgroup">' + esc(sec.heading) + '</th></tr>' + sec.lines.map(function (l) {
        return '<tr><td>' + esc(l[0]) + '</td><td class="pd-q-num">' + esc(l[1]) + '</td></tr>';
      }).join('');
    }).join('');
    return '<div class="pd-doc"><p class="pd-doc-from">' + esc(q.from) + '</p>' +
      '<dl class="pd-doc-meta"><dt>For</dt><dd>' + esc(q['for']) + '</dd><dt>When</dt><dd>' + esc(q.when) + '</dd></dl>' +
      '<table class="pd-q"><caption class="visually-hidden">' + esc(q.title) + '</caption><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><th scope="row">' + esc(q.total[0]) + '</th><td class="pd-q-num">' + esc(q.total[1]) + '</td></tr></tfoot></table>' +
      '<p class="small muted pd-doc-foot">' + esc(q.foot) + '</p></div>';
  }
  function pdOpenQuote(stepId, opener) {
    var q = PD.data.scenario.quotation;
    var dlg = document.createElement('dialog');
    dlg.className = 'pd-dialog';
    dlg.setAttribute('aria-labelledby', 'pd-q-h');
    dlg.innerHTML = '<div class="pd-dialog-top"><h2 id="pd-q-h">' + esc(q.title) + '</h2><span class="spacer"></span><button type="button" class="btn quiet small" id="pd-q-close">Close</button></div>' + pdQuoteHtml(q);
    document.body.appendChild(dlg);
    function close() { if (dlg.close) dlg.close(); else dlg.dispatchEvent(new Event('close')); }
    dlg.addEventListener('close', function () { dlg.remove(); if (opener && document.contains(opener)) opener.focus(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    $('#pd-q-close', dlg).addEventListener('click', close);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('#pd-q-close', dlg).focus();
    api('/api/practice/event', { sid: S.sid, type: 'quotation_opened', step: stepId }).then(function () {
      var sv = PD.data.saved; if (sv.quotation_opened.indexOf(stepId) < 0) sv.quotation_opened.push(stepId);
    }, function () {});
  }
  function pdTrack(n) {
    // The five steps as five marks, each with its letter; the first answer and the debrief sit outside them.
    var steps = PD.data.scenario.steps, out = '';
    steps.forEach(function (s, i) { out += '<i class="' + (i + 2 < n ? 'done' : (i + 2 === n ? 'now' : '')) + '">' + esc(s.letter) + '</i>'; });
    return '<span class="pd-track"><span class="pd-letters" aria-hidden="true">' + out + '</span><span class="pd-pos"><span class="visually-hidden">Step </span>' + (n - 1) + ' of 5</span></span>';
  }
  function renderPractice(main, n) {
    if (!practiceOn()) { go('start'); return; }
    main.innerHTML = '<p class="typing"><span class="spinner" aria-hidden="true"></span> Loading</p>';
    pdLoad().then(function () { drawPractice(main, n); }, function (e) {
      main.innerHTML = '<div class="card"><h1>Practise a decision</h1><p>' + esc(e.offline ? 'This needs a connection.' : e.message) + '</p></div>';
    });
  }
  function drawPractice(main, n) {
    var sc = PD.data.scenario, sv = PD.data.saved;
    var open = pdFirstOpen();
    if (n > open) { location.hash = '#/practice/' + open; return; }   // no skipping ahead
    if (sv.finished && n >= 1 && n <= 6) { location.hash = '#/practice/7'; return; }
    var top = '<div class="start-top">' + (n > 0 ? '<button type="button" class="iconbtn back-btn" id="pd-back" aria-label="Back" title="Back">' + ICON.back + '</button>' : '') +
      '<span class="spacer"></span>' + (n >= 2 && n <= 6 ? pdTrack(n) + listenSm('pd-read', 'Listen: read this aloud') : listenBtn('pd-read', 'Listen: read this aloud')) + '</div>';
    var body = '', foot = '';
    if (n === 0) {
      body = '<h1 id="pd-h" tabindex="-1">' + esc(sc.title) + '</h1><p class="lede">' + esc(sc.intro.lede) + '</p>' +
        '<ol class="pd-route" aria-label="Five steps">' + sc.steps.map(function (s) { return '<li><span class="pd-n" aria-hidden="true">' + esc(s.letter) + '</span>' + esc(s.name) + '</li>'; }).join('') + '</ol>' +
        '<p class="pd-note">' + ICON.info + '<span>' + esc(sc.intro.note) + '</span></p>';
      foot = '<button class="btn block" type="button" id="pd-go">' + (sv.finished ? 'See the debrief' : (sv.started ? 'Carry on' : 'Start')) + ICON.send + '</button>';
    } else if (n === 1) {
      var locked = Object.keys(pdAnswers()).some(function (k) { return k !== 'first'; });
      body = '<p class="eyebrow">' + esc(sc.title) + '</p><h1 id="pd-h" tabindex="-1">' + esc(sc.first.eyebrow) + '</h1>' + pdAi('pd-ai-first', sc.first.ai) +
        sc.first.parts.map(function (p) {
          return locked ? '<div class="pd-locked"><span class="pd-lab">' + esc(p.label) + '</span><p>' + esc(pdText('first', p.id)) + '</p></div>'
            : '<label class="field"><span>' + esc(p.label) + '</span><textarea id="pd-first-' + p.id + '" rows="2" maxlength="1000">' + esc(pdText('first', p.id)) + '</textarea></label>';
        }).join('') + (locked ? '<p class="small muted pd-saved">' + ICON.lock + '<span>Saved before the AI replied.</span></p>' : '');
      foot = '<p class="error" id="pd-error" role="alert"></p><button class="btn block" type="button" id="pd-next">Next' + ICON.send + '</button>';
    } else if (n >= 2 && n <= 6) {
      var k = n - 2, st = sc.steps[k];
      var factsAt = sc.steps.map(function (s) { return s.id; }).indexOf(sc.advice.before_step);
      var fuOn = !!PD.fu[st.id] || (sv.followups_shown || []).indexOf(st.id) >= 0 || !!pdText(st.id, 'followup');
      body = '<p class="eyebrow">' + esc(sc.title) + '</p><h1 id="pd-h" tabindex="-1"><span class="pd-letter" aria-hidden="true">' + esc(st.letter) + '</span>' + esc(st.name) + '</h1>' +
        '<p class="pd-gloss">' + esc(st.gloss) + '</p>' +
        (st.id === sc.advice.before_step ? pdAi('pd-ai-adv', sc.advice.text) : '') +
        pdAi('pd-ai-' + st.id, st.prompt) +
        (k >= factsAt ? '<button type="button" class="btn secondary small pd-quote-btn" id="pd-quote" aria-haspopup="dialog">' + ICON.check + '<span>' + esc(sc.quotation.button) + '</span></button>' : '') +
        '<label class="field pd-answer"><span>Your answer</span><textarea id="pd-main" rows="3" maxlength="1000">' + esc(pdText(st.id, 'main')) + '</textarea></label>' +
        (fuOn && st.followup ? pdAi('pd-ai-fu', st.followup) + '<label class="field pd-answer"><span>Your answer <span class="hint">(optional)</span></span><textarea id="pd-fu" rows="2" maxlength="1000">' + esc(pdText(st.id, 'followup')) + '</textarea></label>' : '') +
        more('pd-aim', 'What to aim for', '<p>' + esc(st.skill) + '</p>', 'pd-aim');
      foot = '<p class="error" id="pd-error" role="alert"></p><button class="btn block" type="button" id="pd-next">' + (n === 6 ? 'Finish' : 'Next') + ICON.send + '</button>';
    } else {
      var a = pdAnswers();
      var first = '<div class="pd-mine"><span class="pd-lab">Before the AI</span>' + sc.first.parts.map(function (p) { return '<p><b>' + esc(p.label) + ':</b> ' + esc(pdText('first', p.id)) + '</p>'; }).join('') + '</div>';
      var steps = sc.steps.map(function (s) {
        var mine = (a[s.id] || {});
        return '<details class="pd-step"><summary><span class="pd-n" aria-hidden="true">' + esc(s.letter) + '</span><b>' + esc(s.name) + '</b>' + ICON.chev + '</summary>' +
          '<div class="pd-step-body"><span class="pd-lab">Your answer</span><p>' + esc((mine.main || {}).text || '') + '</p>' +
          ((mine.followup || {}).text ? '<p>' + esc(mine.followup.text) + '</p>' : '') +
          '<span class="pd-lab">Aim for</span><p>' + esc(s.aim) + '</p></div></details>';
      }).join('');
      body = '<p class="eyebrow">' + esc(sc.title) + '</p><div class="rc-title"><h1 id="pd-h" tabindex="-1">Debrief</h1>' + pfLabel() + '</div>' +
        '<div class="cf-lit pd-lit"><p class="cf-rv-h">' + esc(sc.debrief.wrong_h) + '</p><p class="cf-rv">' + esc(sc.debrief.wrong) + '</p></div>' +
        '<div class="pd-right"><p class="pd-right-h">' + ICON.tick + '<span>' + esc(sc.debrief.right_h) + '</span></p><p>' + esc(sc.debrief.right) + '</p></div>' +
        '<button type="button" class="btn quiet small pd-quote-btn" id="pd-quote" aria-haspopup="dialog">' + ICON.check + '<span>' + esc(sc.quotation.button) + '</span></button>' +
        '<h2 class="pd-steps-h">Your steps</h2>' + first + steps;
      var allDone = S.session.done.length === S.session.tasks.length;
      foot = '<div class="start-btns">' + (allDone ? '' : '<button class="btn block" type="button" id="pd-tasks">' + (S.session.done.length ? 'Back to the tasks' : 'Start the tasks') + ICON.send + '</button>') +
        '<button class="btn secondary block" type="button" data-go="trail">Decision Trail</button></div>';
    }
    main.innerHTML = '<section class="card panel start-card pd-card" aria-labelledby="pd-h">' + top + '<div id="pd-read">' + body + '</div>' + foot + '</section>';
    var back = $('#pd-back');
    if (back) back.addEventListener('click', function () { location.hash = n <= 1 ? '#/practice' : '#/practice/' + (n - 1); });
    var gob = $('#pd-go');
    if (gob) gob.addEventListener('click', function () { location.hash = '#/practice/' + pdFirstOpen(); });
    var qb = $('#pd-quote');
    if (qb) qb.addEventListener('click', function () { pdOpenQuote(n >= 2 && n <= 6 ? sc.steps[n - 2].id : sc.advice.before_step, qb); });
    var tb = $('#pd-tasks');
    if (tb) tb.addEventListener('click', function () { go('task'); });
    var nx = $('#pd-next');
    if (!nx) return;
    function fail(e) { nx.disabled = false; var er = $('#pd-error'); if (er) er.textContent = e.offline ? 'This needs a connection. Check it and try again.' : e.message; }
    function save(step, part, text) {
      return api('/api/practice/answer', { sid: S.sid, step: step, part: part, text: text }).then(function (r) {
        if (!PD.data.saved.answers[step]) PD.data.saved.answers[step] = {};
        PD.data.saved.answers[step][part] = { text: text };
        PD.data.saved.started = true;
        pdNote(false);
        if (r && r.support) showSupport(r.support);
        return r;
      });
    }
    nx.addEventListener('click', function () {
      if (nx.disabled) return;
      var err = $('#pd-error'); err.textContent = '';
      if (n === 1) {
        if (!$('#pd-first-goal')) { location.hash = '#/practice/2'; return; }
        var g = $('#pd-first-goal').value.trim(), idea = $('#pd-first-idea').value.trim();
        if (!g) { err.textContent = 'Write what you want the event to achieve.'; $('#pd-first-goal').focus(); return; }
        if (!idea) { err.textContent = 'Write your first idea.'; $('#pd-first-idea').focus(); return; }
        nx.disabled = true;
        save('first', 'goal', g).then(function () { return save('first', 'idea', idea); }).then(function () { location.hash = '#/practice/2'; }, fail);
        return;
      }
      var st2 = sc.steps[n - 2];
      var m = $('#pd-main').value.trim();
      if (!m) { err.textContent = 'Write a few words first.'; $('#pd-main').focus(); return; }
      var fuBox = $('#pd-fu');
      var needFu = st2.followup && !fuBox && !PD.fu[st2.id] && pdWords(m) < (sc.followup_under_words || 8);
      nx.disabled = true;
      save(st2.id, 'main', m).then(function () {
        if (needFu) {
          // One follow-up, once, when the answer is very short. The student may add to it, or carry on.
          PD.fu[st2.id] = true;
          api('/api/practice/event', { sid: S.sid, type: 'followup_shown', step: st2.id }).catch(function () {});
          drawPractice(main, n);
          var f = $('#pd-fu'); if (f) f.focus();
          return;
        }
        var fu = fuBox ? fuBox.value.trim() : '';
        return (fu ? save(st2.id, 'followup', fu) : Promise.resolve()).then(function () {
          if (n < 6) { location.hash = '#/practice/' + (n + 1); return; }
          return api('/api/practice/event', { sid: S.sid, type: 'finished', step: '' }).then(function () {
            PD.data.saved.finished = true; pdNote(true);
            location.hash = '#/practice/7';
          });
        });
      }).then(null, fail);
    });
  }
  // The student's own Decision Trail: the practice answers, step by step, above the tasks.
  function pdTrailHtml() {
    if (!PD.data || !PD.data.saved.started) return '';
    var sc = PD.data.scenario, a = pdAnswers(), sv = PD.data.saved;
    var items = '<li><b>Before the AI</b>' + sc.first.parts.map(function (p) { return '<div>' + esc(p.label) + ': "' + esc(pdText('first', p.id)) + '"</div>'; }).join('') + '</li>' +
      sc.steps.map(function (s) {
        var m = a[s.id] || {};
        if (!m.main) return '';
        var opened = sv.quotation_opened.indexOf(s.id) >= 0;
        return '<li' + (opened ? ' class="tl-check"' : '') + '><b>' + esc(s.letter) + ' ' + esc(s.name) + '</b><div class="reply">' + scriptedLabel('') + esc(s.prompt) + '</div>' +
          '<div>Your answer: "' + esc(m.main.text) + '"</div>' + (m.followup ? '<div>Then: "' + esc(m.followup.text) + '"</div>' : '') +
          (opened ? '<div class="small muted">Opened the quotation</div>' : '') + '</li>';
      }).join('');
    return '<details class="card trail-task pd-trail" open><summary><b>' + esc(sc.title) + '</b><span class="small muted">' + (sv.finished ? 'Finished' : 'Not finished') + '</span>' + ICON.chev + '</summary>' +
      '<div id="trail-practice"><ol class="timeline">' + items + '</ol>' + (sv.finished ? '<div class="debrief"><p style="margin:0"><b>' + esc(sc.debrief.wrong_h) + ':</b> ' + esc(sc.debrief.wrong) + '</p></div>' : '') + '</div></details>';
  }

  /* ---------------------------------------------------------------- hooks for the guided demo (demo.js) */
  var readyResolve;
  window.LitmusApp = {
    micBtn: micBtn,   // the one microphone control (Mic on / Mic off), also for the Quick check's boxes
    demo: DEMO, build: BUILD, state: S, go: go, render: render, route: route, api: api,
    ready: new Promise(function (r) { readyResolve = r; }),
    startPath: '/api/session/start',
    onTaskSaved: null,
    onSupport: function (r) { if (r && r.support) showSupport(r.support); },
    reset: function () { S.session = null; S.sid = null; S.results = null; S.coach = []; S.openWhy = {}; S.shortView = true; },
    refresh: function () { return api('/api/session?sid=' + encodeURIComponent(S.sid)).then(function (st) { setSession(st); return st; }); },
    isJudge: function () { return isJudge(); },
    showResults: function (res) { S.results = res; S.session.has_results = true; S.coach = []; go('results'); },
    clearDevice: function () { return clearDevice(); },
    displayCode: displayCode,
    scrubTypedText: function (sid, round) { scrubTypedText(sid, round); },
    // The notice the student agreed to, as words to read again (My profile, "Who sees my work"), and its line on how long answers are kept.
    notice: function (join) { return isPractice() ? practiceNotice() : join ? joinNotice() : fullNotice(); },
    // The first screen's lines (19 Nov 2026): Quick check puts them above its first card.
    introHtml: function (where) { return introHtml(where); },
    wireIntro: function (root) { wireIntro(root); },
    retentionLine: function (join) { return retentionLine(join); },
    badge: function () { modeBadge(); }   // redraws the header pill from state.status (tests)
  };
  var clearBtn = document.getElementById('clear-device');
  if (clearBtn) clearBtn.addEventListener('click', function () { clearDevice(); });

  /* ---------------------------------------------------------------- boot */
  // The reading settings on this device: the student app's, or the teacher view's colours and size when those were
  // chosen later (19 Nov 2026: a colour mode set in the teacher view or the guided demo's teacher steps carries over).
  function deviceSettings() {
    var mine = store.get('litmus-settings') || {}, tch = store.get('litmus-teacher-settings') || {};
    if ((tch.t || 0) > (mine.t || 0)) return Object.assign({}, mine, tch.theme ? { theme: tch.theme } : {}, tch.size ? { size: tch.size } : {});
    return mine;
  }
  function boot() {
    applySettings(deviceSettings());
    var urlSid = params.get('sid');
    if (urlSid && !DEMO) store.set('litmus-sid', urlSid);
    S.sid = DEMO ? null : store.get('litmus-sid');
    Promise.all([
      api('/api/status').catch(function () { return { mode: 'demo' }; }),
      api('/api/rubric').catch(function () { return store.get('litmus-rubric'); })
    ]).then(function (out) {
      S.status = out[0];
      S.rubric = out[1];
      if (S.rubric) store.set('litmus-rubric', S.rubric);
      modeBadge();
      if (!S.rubric) { $('#main').innerHTML = '<div class="card"><h1>Litmus</h1><p>Litmus could not reach its server. Check your connection and try again.</p></div>'; return; }
      if (!S.sid) { render(); return; }
      return api('/api/session?sid=' + encodeURIComponent(S.sid)).then(function (st) {
        setSession(st);
        store.set('litmus-session', st);
        flush();
        render();
      }, function (e) {
        if (e.offline && store.get('litmus-session')) { S.session = store.get('litmus-session'); render(); return; }
        store.del('litmus-sid'); S.sid = null; render();
      });
    }).then(function () { readyResolve(!!S.rubric); }, function () { readyResolve(false); });
  }
  boot();
})();
