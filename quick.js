/* Litmus Quick check (19 Nov 2026). One card at a time: the AI's short answer, then the two calls (WORDING.buttons),
   then one line on whether that was the right call and why. Next, or "Discuss with the AI" on that one answer.
   A run's size is the server's (litmus/quick.py RUN_SIZE, or ?n=5); the mix of right and wrong AI answers is drawn per
   run, and later runs lean towards what the student missed (litmus/quick.py). Practice and a pointer: no level, no score change.
   Every card arrives with the run, so a tap answers at once; each answer is sent in the background and
   queued in the app's outbox when offline. Keys on a laptop: T, D, Enter. Off: LITMUS_QUICK_CHECK=0. */
(function () {
  'use strict';
  var A = window.LitmusApp;
  if (!A) return;
  var S = A.state;

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

  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  var ICON = {
    bolt: SVG + '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z"/></svg>',
    arrow: SVG + '<path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    trust: SVG + '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    yes: SVG + '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',   // a tick on "The AI is right"
    no: SVG + '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',   // a cross on "The AI is wrong"
    doubt: SVG + '<path d="M8.5 9a3.5 3.5 0 1 1 5.6 2.8c-1.2.9-2.1 1.6-2.1 3.2"/><path d="M12 18.7v.1"/></svg>',
    right: SVG + '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
    miss: SVG + '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
    ai: SVG + '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
    search: SVG + '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/></svg>',
    mic: SVG + '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    chev: '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>'
  };

  var Q = { intent: false, run: null, locked: false };

  function cfg() { return (S.status && S.status.quick_check) || {}; }
  function on() { return !!cfg().on; }
  // A run of 5 for a stall: ?n=5 on the address (kept on this device), or LITMUS_QUICK_SIZE=5 on the server.
  var N_PARAM = new URLSearchParams(location.search).get('n');
  if (N_PARAM === '5' || N_PARAM === '10') store.set('litmus-quick-n', N_PARAM);
  function size() { var n = store.get('litmus-quick-n'); return n === '5' ? 5 : n === '10' ? 10 : (cfg().size || 10); }
  function minutes() { return size() <= 5 ? 2 : 3; }   // about 20 seconds a card
  function key() { return 'litmus-quick-' + S.sid; }
  function save() { if (Q.run) store.set(key(), Q.run); }
  function areaName(id) {
    var a = ((S.rubric && S.rubric.areas) || []).filter(function (x) { return x.id === id; })[0];
    return a ? a.name : id;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ------------------------------------------------------------ entry points */
  // The start page, the "Welcome back" page, results, the short set's result card, and My profile.
  // cp_9: a recurring decimal (a digit + U+0307) is drawn as the digit with a dot over it in every font; screen readers
  // get the card's "aria" text for that field when it has one, else the digit + " recurring".
  var REC = /(\d)\u0307/g, REC_NUM = /(\d*\.\d*)?(\d)\u0307/g;
  function spoken(c, field, text) { return (c && c.aria && field && c.aria[field]) || String(text || '').replace(REC, '$1 recurring'); }
  function rich(c, field, text) {
    text = String(text || '');
    if (!REC.test(text) && !(c && c.aria && field && c.aria[field])) return esc(text);
    REC.lastIndex = 0;
    return '<span aria-hidden="true">' + esc(text).replace(REC_NUM, '<span class="rec-n">$1<span class="rec">$2</span></span>') + '</span><span class="visually-hidden">' + esc(spoken(c, field, text)) + '</span>';
  }
  function entryHtml(where) {
    if (!on()) return '';
    // The start page (coordinator, 04:36): one button under Next, no codes needed. Elsewhere the student has a code.
    if (where === 'start') {
      return '<button type="button" class="qc-entry qc-entry-start" data-qc-entry="start" id="qc-entry-s">' + ICON.bolt +
        '<span class="qc-entry-t"><b>Quick check</b><small>No code? 3 minutes.</small></span>' + ICON.arrow + '</button>';
    }
    return '<button type="button" class="qc-entry" data-qc-go>' + ICON.bolt +
      '<span class="qc-entry-t"><b>Quick check</b><small>' + size() + ' cards, about ' + minutes() + ' minutes</small></span>' + ICON.arrow + '</button>';
  }
  function decorate() {
    if (!on() || !S.session) return;
    var main = $('#main');
    var sc = $('#score-card', main);
    if (sc && !$('#qc-entry-r')) {
      var d = document.createElement('div');
      d.className = 'qc-strip'; d.id = 'qc-entry-r';
      d.innerHTML = entryHtml('go');
      sc.parentNode.insertBefore(d, sc.nextSibling);
    }
    var rc = $('.result-card', main);
    if (rc && !$('#qc-entry-c')) {
      var e = document.createElement('div');
      e.className = 'qc-strip qc-strip-card'; e.id = 'qc-entry-c';
      e.innerHTML = entryHtml('go');
      rc.appendChild(e);
    }
    var pl = $('.pf-links', main);   // My profile (static/profile.js), when that feature is in
    if (pl && !$('#qc-entry-p')) {
      var a = document.createElement('a');
      a.className = 'pf-link qc-pf-link'; a.id = 'qc-entry-p'; a.href = '#/quick';
      a.setAttribute('data-qc-go', '');
      a.innerHTML = ICON.bolt + '<span><b>Quick check</b><small>' + size() + ' cards, about ' + minutes() + ' minutes.</small></span>' + ICON.arrow;
      pl.appendChild(a);
    }
  }
  var mainEl = document.getElementById('main');
  if (mainEl && window.MutationObserver) new MutationObserver(decorate).observe(mainEl, { childList: true });

  // The start page's "No code? Quick check" is wired by the start screen itself (static/app.js, renderStart, 19 Nov
  // 2026): one tap, no tick screen. With no class code it starts a practice run (class TRY-IT, the short set) and
  // opens the first card; with a class code typed it starts that class, then the first card. Typed codes are kept.
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-qc-go]') : null;
    if (!t) return;
    e.preventDefault();
    open();
  });

  function open() {
    var saved = store.get(key());
    if (saved && saved.done) store.del(key());
    Q.run = null;
    if (A.route().view === 'quick') A.render(); else A.go('quick');
  }

  /* ------------------------------------------------------------ the run */
  function render(main) {
    Q.locked = false;
    document.body.classList.remove('qc-play');
    if (!Q.run || Q.run.sid !== S.sid) Q.run = store.get(key());
    if (Q.run && Q.run.sid !== S.sid) Q.run = null;
    if (Q.run && Q.run.done) return drawResult(main);
    if (Q.run && Q.run.answers.length < Q.run.cards.length) return drawCard(main, false);
    if (Q.run && Q.run.answers.length) { Q.run.done = true; save(); return drawResult(main); }
    startRun(main);
  }

  function startRun(main) {
    main.innerHTML = '<div class="qc-wrap"><div class="qc-top"><p class="qc-progress">&nbsp;</p></div><section class="card qc-card qc-wait" aria-busy="true"><p class="qc-ctx">&nbsp;</p><div class="qc-ai"><p class="qc-ans">&nbsp;</p></div></section></div>';
    var qf = new URLSearchParams(location.search).get('qcfirst');   // cp_10: the film's first card
    var body = qf ? { sid: S.sid, n: size(), first: qf } : { sid: S.sid, n: size() };
    if (Q.topic) body.area = Q.topic;   // (C) a topic run: 6 cards from one area
    A.api('/api/quick/start', body).then(function (r) {
      Q.topic = null;
      Q.run = { sid: S.sid, id: r.run_id, cards: r.cards, answers: [], weak: r.weak || [], done: false,
                why: r.why || {}, whyRes: {}, fast: 0, nudged: false, topic: r.topic || null };
      save();
      if (A.route().view === 'quick') drawCard($('#main'), false);
    }, function (e) {
      main.innerHTML = '<section class="card qc-card qc-msg"><h1 tabindex="-1" id="qc-msg-h">Quick check</h1><p>' +
        esc(e.offline ? 'Quick check needs a connection to start. Check your wifi and try again.' : e.message) + '</p>' +
        '<button type="button" class="btn block" id="qc-retry">Try again</button></section>';
      $('#qc-retry').addEventListener('click', function () { startRun($('#main')); });
    });
  }

  // Whether the call was right, as a word beside the icon (never colour alone). The line itself is the card's own,
  // starting with its first word as written in the bank ("True:", "Wrong:", "Good feedback:", "Made up:").
  function verdictWord(call, c) { return (call === 'trust') === c.ai_is_right ? 'Right.' : 'Not this time.'; }
  // 19 Nov 2026 (the team lead: "very, very congratulatory ... positive reinforcement"): a right call gets warm,
  // specific praise that names what the student did, varied; the third right call in a row says so. A missed call
  // stays plain, "Not this time.". The reason line follows either.
  var PRAISE = { caught: ['Good catch.', 'Well spotted.'], trusted: ['Right call.', 'Spot on.'], streak: 'Three in a row.' };
  function praiseWord(run, call, c) {
    if ((call === 'trust') !== c.ai_is_right) return 'Not this time.';
    var streak = 0;
    for (var k = run.answers.length - 1; k >= 0 && run.answers[k].right; k--) streak++;
    if (streak === 3) return PRAISE.streak;
    var list = call === 'doubt' ? PRAISE.caught : PRAISE.trusted;
    var n = run.answers.filter(function (a) { return a.right && a.call === call; }).length;
    return list[(Math.max(n, 1) - 1) % list.length];
  }
  // The feedback line's clue part (the same rule as the server's quick.clue_line).
  // The feedback line after "Why?" (the same rule as the server's quick.clue_line): the card's right reason, in its
  // own words ("The reason: It would fake my own work.").
  function clueLine(right, credit, reason) {
    reason = String(reason || '').trim();
    if (reason && !/[.!?]$/.test(reason)) reason += '.';
    if (right && credit) return reason ? 'Your reason too: ' + reason : 'Your reason too.';
    return reason ? 'The reason: ' + reason : '';
  }
  // The "Quick taps" nudge (once a run, never scored): three cards in a row answered faster than anyone could read them.
  // The floor: the card's words at 800 words a minute (a very fast skim), never below 1.5 seconds. Skipped when
  // read-aloud is in use or the slower reading speed is chosen.
  var FAST_WPM = 800, FLOOR_MIN = 1.5;
  function wordsIn(t) { return (String(t || '').match(/\S+/g) || []).length; }
  function floorSeconds(c) { return Math.max(FLOOR_MIN, wordsIn((c.context || '') + ' ' + (c.ai_answer || '')) / (FAST_WPM / 60)); }
  function slowReading() {
    var more = store.get('litmus-settings-more') || {};
    return more.speech === 'slow';
  }
  function readAloudOn() {
    return !!(Q.ttsUsed || (window.speechSynthesis && window.speechSynthesis.speaking) || (window.LitmusReadAloud && window.LitmusReadAloud.used()));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b && /^Listen/.test(b.getAttribute('aria-label') || '')) Q.ttsUsed = true;
  }, true);
  function nudgeDue(run, c, seconds) {
    if (run.nudged || readAloudOn() || slowReading()) { run.fast = 0; return false; }
    run.fast = seconds < floorSeconds(c) ? (run.fast || 0) + 1 : 0;
    return run.fast >= 3;
  }
  // 19 Nov 2026, final (the team lead: "state clearly what the subject is"): one question line on every card and two
  // buttons that say the judgement with its subject. THE WORDING TABLE keeps its shape (by card kind): one edit here.
  var WORDING = {
    qline: { answer: 'Is the AI right here?', no: 'Is the AI right here?', yes: 'Is the AI right here?' },
    // The buttons are the judgement itself (21:05: "trust" is the wrong verb where the AI could do a thing but
    // should not). No captions: the label says it all. Keys R and W (T and D still work).
    buttons: { trust: 'The AI is right', doubt: 'The AI is wrong' },
    keys: { trust: 'R', doubt: 'W' },
    captions: { answer: ['', ''], no: ['', ''], yes: ['', ''] }
  };
  var QLINE = WORDING.qline, CAPTIONS = WORDING.captions;
  var INTRO_AT = 0, WEAK_AT = 3;   // the intro strip above card 1; the weak-spots line above card 4 (0-based)
  function askOf(c) { return QLINE[c && c.ask] ? c.ask : 'answer'; }
  function qLine(c) { return QLINE[askOf(c)]; }
  function captions(c) { return CAPTIONS[askOf(c)]; }
  function callButton(call, c, i) {
    var cap = captions(c)[call === 'trust' ? 0 : 1], label = WORDING.buttons[call], key = WORDING.keys[call];
    return '<button type="button" class="qc-call" data-call="' + call + '" aria-keyshortcuts="' + key + ' ' + (call === 'trust' ? 'T' : 'D') + '" aria-label="' + esc(cap ? label + '. ' + cap : label) + '">' +
      (call === 'trust' ? ICON.yes : ICON.no) + '<span class="qc-call-t"><span class="qc-call-l">' + esc(label) + '</span>' +
      (cap ? '<small class="qc-cap" aria-hidden="true">' + esc(cap) + '</small>' : '') + '</span>' +
      '<kbd aria-hidden="true">' + key + '</kbd></button>';
  }
  // F8: after the tap (never before: a label before the tap would give the answer away), the area and the card's clue.
  // noTell: on a "Why?" card the clue line below already says the clue, so the tag shows only the area.
  function tagLine(c, noTell) {
    return '<p class="qc-tagline"><span class="qc-area-tag">' + esc(areaName(c.area)) + '</span>' +
      (c.tell && !noTell ? '<span class="qc-tell"><span class="visually-hidden">The clue: </span>' + esc(c.tell) + '</span>' : '') + '</p>';
  }

  function drawCard(main, animate) {
    var run = Q.run, i = run.answers.length, c = run.cards[i], n = run.cards.length;
    Q.locked = false;
    document.body.classList.add('qc-play');
    main.innerHTML =
      '<div class="qc-wrap' + (animate ? ' qc-in' : '') + '">' +
        '<div class="qc-top"><p class="qc-progress" id="qc-progress"><span class="visually-hidden">Card </span>' + (i + 1) + ' of ' + n + '</p>' +
          '<button type="button" class="qc-end" id="qc-end">End</button></div>' +
        // Based on past results: one plain line at the start of the run names the topics the cards lean on.
        // The first screen's lines (static/app.js, introHtml), once: the strip ("Who sees my work") above card 1 and the
        // weak-spots line above card 4, so no card carries both.
        (i === INTRO_AT && A.introHtml ? A.introHtml('quick') : '') +
        (i === WEAK_AT && run.weak && run.weak.length ? '<p class="qc-weak" id="qc-weak">Your weak spots: ' + esc(run.weak.map(areaName).join(', ')) + '.</p>' : '') +
        // 19 Nov 2026 (F6): the tasks' chat language, each part in its own place: the situation as the student's own
        // message, the answer as the AI's bubble, then the question line and the two buttons.
        '<section class="qc-card qc-chat" id="qc-card" tabindex="-1" aria-labelledby="qc-ctx" aria-describedby="qc-ans">' +
          '<div class="qc-you"><span class="qc-you-tag">You</span><p class="qc-ctx" id="qc-ctx">' + rich(c, 'context', c.context) + '</p></div>' +
          '<div class="qc-ai"><span class="qc-ai-tag">' + ICON.ai + '<span>AI</span></span><p class="qc-ans" id="qc-ans">' + rich(c, 'ai_answer', c.ai_answer) + '</p></div>' +
        '</section>' +
        '<p class="qc-q-line" id="qc-qline">' + esc(qLine(c)) + '</p>' +
        '<div class="qc-calls" role="group" aria-labelledby="qc-qline">' + callButton('trust', c, i) + callButton('doubt', c, i) + '</div>' +
        '<div class="qc-after" id="qc-after"></div>' +
        '<p class="visually-hidden" id="qc-say" role="status" aria-live="polite"></p>' +
      '</div>';
    $all('.qc-call', main).forEach(function (b) { b.addEventListener('click', function () { answer(b.dataset.call); }); });
    $('#qc-end').addEventListener('click', end);
    if (A.wireIntro) A.wireIntro(main);
    if (animate) window.scrollTo(0, 0);
    Q.shownAt = Date.now();
    var card = $('#qc-card');
    if (card && animate) card.focus({ preventScroll: true });
  }

  function answer(call) {
    var run = Q.run;
    if (!run || Q.locked || run.done) return;
    var c = run.cards[run.answers.length];
    if (!c) return;
    Q.locked = true;
    var right = (call === 'trust') === c.ai_is_right;
    run.answers.push({ id: c.id, call: call, right: right });
    save();
    post({ sid: S.sid, run_id: run.id, item_id: c.id, call: call });
    $all('.qc-call').forEach(function (b) {
      var mine = b.dataset.call === call;
      b.setAttribute('aria-pressed', mine ? 'true' : 'false');
      b.classList.add(mine ? 'is-chosen' : 'is-other');
      b.disabled = true;
    });
    var seconds = Q.shownAt ? (Date.now() - Q.shownAt) / 1000 : 99;
    var nudge = nudgeDue(run, c, seconds);
    var label = praiseWord(run, call, c);
    if (nudge) { run.nudged = true; save(); A.api('/api/quick/nudge', { sid: S.sid, run_id: run.id }).catch(function () {}); }
    if (cfg().why !== false && run.why && run.why[c.id] && !run.whyRes[c.id]) {
      askWhy(run, call, c, right, label, nudge);
      return;
    }
    feedback(run, call, c, right, label, null, nudge);
  }

  // 19 Nov 2026: "Why?" on three cards of ten (the server picks them). One tap on a clue answers it; "Type it" opens a
  // box (and the microphone where the browser has one). Credit is the server's rule; the feedback line says the clue.
  function askWhy(run, call, c, right, label, nudge) {
    var chips = run.why[c.id] || [];
    var SRx = window.SpeechRecognition || window.webkitSpeechRecognition;
    $('#qc-after').innerHTML =
      '<div class="qc-inset qc-whyq" id="qc-whyq" role="group" aria-labelledby="qc-whyq-h">' +
        '<h2 class="qc-whyq-h" id="qc-whyq-h" tabindex="-1">Why?</h2>' +
        '<div class="qc-chips">' + chips.map(function (x) {
          return '<button type="button" class="chip qc-chip qc-clue" data-opt="' + esc(x.i) + '">' + esc(x.text) + '</button>';
        }).join('') + '</div>' +
        '<button type="button" class="qc-type-btn" id="qc-type-btn" aria-expanded="false" aria-controls="qc-type">Type it</button>' +
        '<form class="qc-ask qc-type" id="qc-type" novalidate hidden>' +
          '<label class="visually-hidden" for="qc-type-in">Your reason</label>' +
          '<div class="qc-ask-row"><input type="text" id="qc-type-in" maxlength="300" autocomplete="off" placeholder="Your reason">' +
            // 19 Nov 2026 (tap feedback): the app's one microphone control, with "Mic on" / "Mic off" (static/app.js).
            (SRx && A.micBtn ? A.micBtn('qc-type-in') : '') +
            '<button type="submit" class="btn small">Send</button></div>' +
          '<p class="error" id="qc-type-err" role="alert"></p></form>' +
      '</div>';
    var h = $('#qc-whyq-h'); if (h) h.focus({ preventScroll: true });
    var done = false;
    function finish(credit, reply) {
      if (done) return;
      done = true;
      run.whyRes[c.id] = { credit: !!credit };
      save();
      feedback(run, call, c, right, label, { credit: !!credit, reply: reply || '' }, nudge);
    }
    $all('.qc-clue').forEach(function (b) {
      b.addEventListener('click', function () {
        var opt = (run.why[c.id] || []).filter(function (x) { return String(x.i) === b.dataset.opt; })[0];
        var credit = !!(opt && opt.right);   // the card's own flag
        var body = { sid: S.sid, run_id: run.id, item_id: c.id, option: Number(b.dataset.opt) };   // stored: which reason, never words
        A.api('/api/quick/why', body).catch(function (e) { if (e.offline) { var q = store.get('litmus-outbox') || []; q.push({ path: '/api/quick/why', body: body }); store.set('litmus-outbox', q); } });
        finish(credit, '');
      });
    });
    $('#qc-type-btn').addEventListener('click', function () {
      var f = $('#qc-type'); f.hidden = !f.hidden;
      this.setAttribute('aria-expanded', f.hidden ? 'false' : 'true');
      if (!f.hidden) $('#qc-type-in').focus();
    });
    $('#qc-type').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#qc-type-in').value.trim();
      if (!v) { $('#qc-type-err').textContent = 'Type a few words, or tap a clue.'; return; }
      $all('#qc-whyq button, #qc-whyq input').forEach(function (x) { x.disabled = true; });
      A.api('/api/quick/why', { sid: S.sid, run_id: run.id, item_id: c.id, text: v }).then(function (r) {
        if (r.support && A.onSupport) A.onSupport(r);
        finish(r.credit, r.source === 'live' || r.route === 'safety' ? r.reply : '');
      }, function () { finish(false, ''); });
    });
  }

  function feedback(run, call, c, right, label, why, nudge) {
    var last = run.answers.length >= run.cards.length;
    var clue = why ? clueLine(right, why.credit, c.reason) : '';
    $('#qc-after').innerHTML =
      (nudge ? '<div class="qc-nudge" id="qc-nudge" role="status"><p>Quick taps. Read the answer first?</p><button type="button" class="btn small" id="qc-nudge-ok">OK</button></div>' : '') +
      '<div class="qc-verdict ' + (right ? 'is-right' : 'is-miss') + '" id="qc-verdict">' + (right ? ICON.right : ICON.miss) +
        '<div><span class="qc-word">' + label + '</span>' + tagLine(c, !!clue) + (clue ? '<p class="qc-clue-line" id="qc-clue-line">' + esc(clue) + '</p>' : '') +
        '<p class="qc-why">' + rich(c, 'why', c.why) + '</p></div></div>' +
      (why && why.reply ? '<div class="qc-inset qc-ai-note"><span class="qc-ai-tag">' + ICON.ai + '<span>AI</span></span><p class="qc-why-reply">' + esc(why.reply) + '</p></div>' : '') +
      '<div class="qc-next-row"><button type="button" class="btn block qc-next" id="qc-next" aria-keyshortcuts="Enter">' + (last ? 'See my result' : 'Next card') + ICON.arrow + '</button>' +
        '<button type="button" class="btn secondary qc-discuss" id="qc-discuss" aria-expanded="false" aria-controls="qc-disc">' + ICON.ai + '<span>Discuss with the AI</span></button></div>' +
      '<div class="qc-disc qc-inset" id="qc-disc" hidden></div>';
    $('#qc-say').textContent = label + '. ' + (clue ? clue + ' ' : '') + spoken(c, 'why', c.why);
    $('#qc-next').addEventListener('click', next);
    var ok = $('#qc-nudge-ok');
    if (ok) ok.addEventListener('click', function () { var n = $('#qc-nudge'); if (n) n.remove(); var nb2 = $('#qc-next'); if (nb2) nb2.focus(); });
    var d = $('#qc-discuss');
    if (d) d.addEventListener('click', function () { toggleDiscuss(c); });
    var nb = $('#qc-next');
    nb.focus({ preventScroll: true });
    if (nb.scrollIntoView) {
      var r = nb.getBoundingClientRect();
      if (r.bottom > window.innerHeight) nb.scrollIntoView({ block: 'nearest' });
    }
  }

  function post(body) {
    A.api('/api/quick/answer', body).catch(function (e) {
      if (e.offline) {   // the app's outbox sends it when the connection comes back
        var q = store.get('litmus-outbox') || [];
        q.push({ path: '/api/quick/answer', body: body });
        store.set('litmus-outbox', q);
      }
    });
  }

  function next() {
    var run = Q.run;
    if (!run || !Q.locked) return;
    if (run.answers.length >= run.cards.length) { run.done = true; save(); drawResult($('#main')); return; }
    drawCard($('#main'), true);
  }

  function end() {
    var run = Q.run;
    if (!run) return;
    if (!run.answers.length) { store.del(key()); Q.run = null; document.body.classList.remove('qc-play'); A.go('start'); return; }
    run.done = true;
    save();
    drawResult($('#main'));
  }

  /* ------------------------------------------------------------ Discuss: one exchange about this card only */
  // POST /api/quick/discuss {sid, run_id, card_id, message} returns {reply, source, route}. One message (typed, or
  // a ready-made one), one reply of 60 words or fewer, then the only way on is Next card. Never a chat thread.
  // The reply looks the same whether it is the card's written text or, with the live patch, the live AI.
  function toggleDiscuss(c) {
    var b = $('#qc-discuss'), box = $('#qc-disc');
    if (!b || !box) return;
    var opening = box.hidden;
    if (opening && !box.dataset.ready && c) {
      box.innerHTML = '<form class="qc-ask" id="qc-ask" novalidate>' +
          '<div class="qc-chips">' + ['Why?'].concat(c.check ? ['How would I check that?'] : []).map(function (q) {
            return '<button type="button" class="chip qc-chip" data-ask="' + esc(q) + '">' + esc(q) + '</button>';
          }).join('') + '</div>' +
          '<label class="visually-hidden" for="qc-ask-in">Or type one question about this answer</label>' +
          '<div class="qc-ask-row"><input type="text" id="qc-ask-in" maxlength="300" autocomplete="off" placeholder="Or type one question" aria-describedby="qc-ask-pd"><button type="submit" class="btn small">Ask</button></div>' +
          '<p class="small muted qc-ask-pd" id="qc-ask-pd">Don\'t type personal details.</p>' +
          '<p class="error" id="qc-ask-err" role="alert"></p></form><div id="qc-reply" aria-live="polite"></div>';
      box.dataset.ready = '1';
      wireAsk(c);
    }
    box.hidden = !opening;
    b.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening && box.scrollIntoView) { var r = box.getBoundingClientRect(); if (r.bottom > window.innerHeight) box.scrollIntoView({ block: 'nearest' }); }
  }
  function wireAsk(c) {
    var f = $('#qc-ask');
    if (!f) return;
    var busy = false;
    function ask(v) {
      if (busy) return;
      if (!v) { $('#qc-ask-err').textContent = 'Type a question, or tap one.'; return; }
      busy = true;
      $all('button, input', f).forEach(function (x) { x.disabled = true; });
      A.api('/api/quick/discuss', { sid: S.sid, run_id: Q.run && Q.run.id, card_id: c.id, message: v }).then(function (r) {
        f.remove();
        // cp_9: with the live AI, up to three questions per card; the box says how many are left, then closes.
        $('#qc-reply').insertAdjacentHTML('beforeend', '<p class="qc-asked">' + esc(v) + '</p><p class="qc-reply-t">' + rich(c, r.reply === c.discuss ? 'discuss' : '', r.reply || '') + '</p>');
        if (r.support && A.onSupport) A.onSupport(r);
        if (r.left > 0) {
          $('#qc-reply').insertAdjacentHTML('afterend', '<form class="qc-ask" id="qc-ask" novalidate>' +
            '<label class="visually-hidden" for="qc-ask-in">Ask one more question about this answer</label>' +
            '<div class="qc-ask-row"><input type="text" id="qc-ask-in" maxlength="300" autocomplete="off" placeholder="Ask more" aria-describedby="qc-left"><button type="submit" class="btn small">Ask</button></div>' +
            '<p class="small muted qc-left" id="qc-left">' + r.left + ' more</p><p class="error" id="qc-ask-err" role="alert"></p></form>');
          wireAsk(c);
          return;
        }
        var nb = $('#qc-next'); if (nb) nb.focus({ preventScroll: true });
      }, function (e2) {
        busy = false;
        $all('button, input', f).forEach(function (x) { x.disabled = false; });
        $('#qc-ask-err').textContent = e2.offline ? 'This needs a connection.' : e2.message;
      });
    }
    $all('[data-ask]', f).forEach(function (b) { b.addEventListener('click', function () { ask(b.dataset.ask); }); });
    f.addEventListener('submit', function (e) { e.preventDefault(); ask($('#qc-ask-in').value.trim()); });
  }

  /* ------------------------------------------------------------ the hand-on */
  // A student who came in with no code (the practice class) goes on to the SHORT set: the existing 3-task set
  // behind the join link (POST /api/session/join, service.join_session). Since 19 Nov 2026 a no-code Quick check
  // already starts on that set, so its first task opens at once; an older practice session on the 8 tasks gets a
  // fresh short-set session, nothing asked. A student with their own codes goes on to their own tasks.
  var PRACTICE_CLASS = 'TRY-IT';
  function practice() { return !!(S.session && S.session.class_code === PRACTICE_CLASS); }
  function shortSet(btn) {
    if (btn.disabled) return;
    if (S.session.set === 'judge') { A.go('task', 0); return; }
    btn.disabled = true;
    A.api('/api/session/join', { class_code: PRACTICE_CLASS, consent: true }).then(function (st) {
      S.sid = st.session_id;
      return A.refresh();   // the app's own setSession: keeps the new session on this device
    }).then(function () { A.go('task', 0); }, function () {
      btn.disabled = false;
      A.go('task', 0);    // if the short set cannot start (for example offline), the tasks already open on this device
    });
  }

  /* ------------------------------------------------------------ the result */
  function tally(run) {
    var byId = {};
    run.cards.forEach(function (c) { byId[c.id] = c; });
    var t = { n: run.answers.length, right: 0, trustedWrong: 0, doubtedRight: 0, rightN: 0, wrongN: 0, areas: {} };
    run.answers.forEach(function (a) {
      var c = byId[a.id] || {};
      if (a.right) t.right++;
      if (c.ai_is_right) t.rightN++; else t.wrongN++;
      if (a.call === 'trust' && !c.ai_is_right) t.trustedWrong++;
      if (a.call === 'doubt' && c.ai_is_right) t.doubtedRight++;
      var ar = t.areas[c.area] = t.areas[c.area] || { right: 0, n: 0 };
      ar.n++; if (a.right) ar.right++;
    });
    return t;
  }
  // Which way the student slipped more, in one line. Never a level: Quick check counts calls, nothing else.
  // (B) 19 Nov 2026: the split changes from run to run, so every count carries its own base.
  function baseLine(t) {
    return 'You said \'right\' to ' + t.trustedWrong + ' of the ' + plural(t.wrongN, 'wrong answer', 'wrong answers') + '. ' +
      'You said \'wrong\' to ' + t.doubtedRight + ' of the ' + plural(t.rightN, 'right one', 'right ones') + '.';
  }
  function meaning(t) {
    if (t.trustedWrong > t.doubtedRight) return 'You said \'right\' to more wrong answers. Look for the slip first.';
    if (t.doubtedRight > t.trustedWrong) return 'You said \'wrong\' to more right answers. When it checks out, say right.';
    if (!t.trustedWrong) return 'Every call was right.';
    return 'Your slips go both ways.';
  }

  // 19 Nov 2026: the summary (the team lead: "precise, succinct", what to keep and what to improve, warm where earned).
  // Built by rule from the run: the count, the clue count, "Keep doing" (the clue kind got right most) and "Work on" (the
  // clue kind missed most, with a five-word example from a missed card), then every card as one row, wrong calls first.
  function summaryModel(run) {
    var byId = {};
    run.cards.forEach(function (c) { byId[c.id] = c; });
    var right = 0, kinds = {}, order = ['S', 'N', 'X', 'I', 'A', 'H', 'P', 'B', 'F'], strong = Math.ceil(0.8 * run.answers.length);
    var rows = run.answers.map(function (a, i) {
      var c = byId[a.id] || {};
      if (a.right) right++;
      if (c.clue_kind) {
        var k = kinds[c.clue_kind] = kinds[c.clue_kind] || { right: 0, miss: 0, label: c.clue_label, example: '' };
        if (a.right) k.right++; else { k.miss++; if (!k.example) k.example = c.tell || ''; }
      }
      return { i: i, id: a.id, right: !!a.right, call: a.call, tell: c.tell || '', why: c.why || '', card: c };
    });
    function best(field) {
      var top = null;
      order.forEach(function (k) { var v = kinds[k]; if (v && v[field] && (!top || v[field] > kinds[top][field])) top = k; });
      return top;
    }
    var keep = best('right'), work = best('miss');
    // What the student does with each clue kind, in plain words (the summary names an action, never the person).
    // 19 Nov 2026 (the team lead): plain phrases a student uses, never a clue kind's own label; the same ones the
    // Details list shows (the server's CLUE_KINDS labels).
    var DOING = { S: 'spotting answers your source can check', N: "spotting sums that add up or don't",
      X: 'spotting AIs that contradict themselves', I: 'spotting made-up certainty',
      A: "spotting AIs that offer what they shouldn't", H: "spotting AIs that admit what they can't know",
      P: 'spotting everyday answers that are fine', B: "spotting reasons that aren't real reasons",
      F: 'spotting AIs that refuse a fair ask' };
    // F8: results by area and by clue kind (right of seen), in the bank's order.
    var areas = {}, areaOrder = [];
    rows.forEach(function (r) {
      var a = r.card.area || '';
      if (!areas[a]) { areas[a] = { right: 0, n: 0 }; areaOrder.push(a); }
      areas[a].n++; if (r.right) areas[a].right++;
    });
    var byArea = areaOrder.map(function (a) { return { name: areaName(a), right: areas[a].right, n: areas[a].n }; });
    var byKind = order.filter(function (k) { return kinds[k]; }).map(function (k) {
      return { name: kinds[k].label, right: kinds[k].right, n: kinds[k].right + kinds[k].miss };
    });
    var asked = Object.keys(run.why || {}).length;
    var named = Object.keys(run.whyRes || {}).filter(function (id) { return run.whyRes[id].credit; }).length;
    return {
      n: run.answers.length, right: right,
      opener: right >= strong ? 'Strong run.' : 'Good start: here is what to try next.', strong: right >= strong,
      base: baseLine(tally(run)),
      count: right + ' of ' + run.answers.length + ' right calls.',
      clue: asked ? 'You gave the right reason on ' + named + ' of ' + asked + '.' : '',
      keep: keep ? 'Keep doing: ' + DOING[keep] : '',
      work: work ? 'Work on: ' + DOING[work].replace(/^spotting /, '') +
        (kinds[work].example ? ', e.g. ' + kinds[work].example : '') : '',
      byArea: byArea, byKind: byKind,
      rows: rows.filter(function (r) { return !r.right; }).concat(rows.filter(function (r) { return r.right; }))
    };
  }

  function drawSummary(main) {
    document.body.classList.remove('qc-play');
    var run = Q.run, m = summaryModel(run);
    var tasksDone = !!(S.session && (S.session.has_results || S.session.round > 1));
    var short = practice() && !tasksDone && !(S.session.done || []).length;
    // ui_audit C (20 Nov 2026): the missed cards show; the right calls are one tap away ("N right calls").
    var rowHtml = function (r) {
      var c = r.card;
      return '<li class="qc-row ' + (r.right ? 'is-right' : 'is-miss') + '"><button type="button" class="qc-row-b" aria-expanded="false" aria-controls="qc-row-' + r.i + '">' +
          (r.right ? ICON.right : ICON.miss) + '<span class="visually-hidden">' + (r.right ? 'Right call: ' : 'Missed: ') + '</span>' +
          '<span class="qc-row-t">' + esc(r.tell || c.context || '') + '</span></button>' +
        '<div class="qc-row-more" id="qc-row-' + r.i + '" hidden><p class="qc-l-why">' + rich(c, 'why', r.why) + '</p>' +
          '<p class="qc-l-you">You said: ' + WORDING.buttons[r.call] + '.</p>' +
          (c.discuss ? '<p class="qc-l-disc">' + rich(c, 'discuss', c.discuss) + '</p>' : '') + '</div></li>';
    };
    var missRows = m.rows.filter(function (r) { return !r.right; }).map(rowHtml).join('');
    var rightRows = m.rows.filter(function (r) { return r.right; });
    var rows = (missRows ? '<ol class="qc-rows" aria-label="Your cards, missed first">' + missRows + '</ol>' : '') +
      (rightRows.length ? '<details class="qc-rights" id="qc-rights"><summary>' + rightRows.length + ' right ' +
        (rightRows.length === 1 ? 'call' : 'calls') + '</summary><ol class="qc-rows">' + rightRows.map(rowHtml).join('') + '</ol></details>' : '');
    main.innerHTML =
      '<section class="card panel qc-result qc-summary" aria-labelledby="qc-res-h">' +
        '<p class="qc-opener' + (m.strong ? ' is-strong' : '') + '" id="qc-opener">' + (m.strong ? ICON.right : '') + esc(m.opener) + '</p>' +
        '<h1 id="qc-res-h" tabindex="-1"><span class="qc-big">' + m.right + '</span> of ' + m.n + ' right calls.</h1>' +
        (m.clue ? '<p class="qc-clue-count" id="qc-clue-count">' + esc(m.clue) + '</p>' : '') +
        '<ul class="qc-kw">' + (m.keep ? '<li class="is-keep" id="qc-keep">' + esc(m.keep) + '</li>' : '') +
          (m.work ? '<li class="is-work" id="qc-work">' + esc(m.work) + '</li>' : '') + '</ul>' +
        '<div class="qc-rows-all" id="qc-rows">' + rows + '</div>' +
        '<details class="qc-by" id="qc-by"><summary>Details</summary>' +
          '<p class="qc-base" id="qc-base">' + esc(m.base) + '</p>' +
          '<h2 class="qc-by-h">By area</h2><ul class="qc-by-l">' + m.byArea.map(function (x) {
            return '<li><span>' + esc(x.name) + '</span><span>' + x.right + ' of ' + x.n + '</span></li>'; }).join('') + '</ul>' +
          '<h2 class="qc-by-h">By clue</h2><ul class="qc-by-l">' + m.byKind.map(function (x) {
            return '<li><span>' + esc(x.name) + '</span><span>' + x.right + ' of ' + x.n + '</span></li>'; }).join('') + '</ul>' +
        '</details>' +
        // (C) 19 Nov 2026: two buttons. The primary is the suggested next Quick check step, by rule (the server's
        // /api/quick/next); the secondary leads on to the app's second mode, "2 Tasks with the AI" (the coordinator's
        // ruling: the first page shows "1 Quick check" and "2 Tasks with the AI"; this is the one hook for it). Behind
        // More: the other of topic or mixed, and "Pick a topic". They replace "Another 10" and "Go to the full tasks".
        '<div class="qc-next-step" id="qc-next-step">' + nextButtons({ primary: { kind: 'mixed' } }) + '</div>' +
        '<button type="button" class="qc-again qc-go-tasks" id="qc-go-tasks">' + TASKS_LABEL + '</button>' +
        '<div class="more qc-more"><button type="button" class="more-btn" aria-expanded="false" aria-controls="qc-more-body" id="qc-more-btn"><span>More</span>' + ICON.chev + '</button>' +
          '<div class="more-body" id="qc-more-body" hidden><div class="qc-other" id="qc-other"></div>' +
            '<h2 class="qc-sub" id="qc-pick-h">Pick a topic</h2>' +
            '<div class="qc-topic-chips" id="qc-topic-chips" role="group" aria-labelledby="qc-pick-h">' + topicChips(null) + '</div>' +
          '</div></div>' +
      '</section>';
    $all('.qc-row-b', main).forEach(function (b) {
      b.addEventListener('click', function () {
        var body = document.getElementById(b.getAttribute('aria-controls'));
        body.hidden = !body.hidden;
        b.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      });
    });
    $('#qc-go-tasks').addEventListener('click', function () {
      if (short) return shortSet(this);
      A.go(tasksDone ? 'next' : 'task');
    });
    $('#qc-more-btn').addEventListener('click', function () {
      var body = $('#qc-more-body'), b = $('#qc-more-btn');
      body.hidden = !body.hidden;
      b.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
    });
    $('.qc-summary', main).addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-qc-next]') : null;
      if (!b) return;
      Q.topic = b.dataset.qcNext === 'mixed' ? null : b.dataset.qcNext;
      open();
    });
    A.api('/api/quick/next', { sid: S.sid, run_id: run.id }).then(function (r) {
      var box = $('#qc-next-step'), chips = $('#qc-topic-chips'), other = $('#qc-other');
      if (box && r && r.primary) box.innerHTML = nextButtons(r);
      if (other && r && r.secondary) other.innerHTML = otherButton(r.secondary);
      if (chips && r && r.areas) chips.innerHTML = topicChips(r.areas);
    }, function () { /* offline: "Next: a mixed run" stays */ });
    window.scrollTo(0, 0);
    var h = $('#qc-res-h'); if (h) h.focus({ preventScroll: true });
  }

  // (C) The next-step buttons and the topic chips. A choice is {kind: "mixed"} or {kind: "topic", area}.
  function nextLabel(x, primary) {
    if (x.kind === 'topic') return (primary ? 'Next: ' : 'Try ') + areaName(x.area);
    return primary ? 'Next: a mixed run' : 'Try a mixed run';
  }
  var TASKS_LABEL = '2 Tasks with the AI';   // exactly as the first page names the second mode
  function choiceKey(x) { return x.kind === 'topic' ? x.area : 'mixed'; }
  function nextButtons(r) {
    return '<button type="button" class="btn block qc-next-1" id="qc-next-1" data-qc-next="' + esc(choiceKey(r.primary)) + '">' + esc(nextLabel(r.primary, true)) + ICON.arrow + '</button>';
  }
  function otherButton(x) {
    return '<button type="button" class="btn block secondary qc-next-2" id="qc-next-2" data-qc-next="' + esc(choiceKey(x)) + '">' + esc(nextLabel(x, false)) + '</button>';
  }
  function topicChips(areas) {
    var list = areas || ((S.rubric && S.rubric.areas) || []).map(function (a) { return { area: a.id, right: 0, n: 0 }; });
    return list.map(function (x) {
      return '<button type="button" class="chip qc-topic" data-qc-next="' + esc(x.area) + '">' + esc(areaName(x.area)) +
        (x.n ? ' <small>' + x.right + ' of ' + x.n + '</small>' : '') + '</button>';
    }).join('');
  }

  function drawResult(main) {
    if (cfg().summary !== false) return drawSummary(main);
    document.body.classList.remove('qc-play');
    var run = Q.run, t = tally(run), m = meaning(t);
    var byId = {};
    run.cards.forEach(function (c) { byId[c.id] = c; });
    var areaIds = ((S.rubric && S.rubric.areas) || []).map(function (a) { return a.id; }).filter(function (id) { return t.areas[id]; });
    Object.keys(t.areas).forEach(function (id) { if (areaIds.indexOf(id) < 0) areaIds.push(id); });
    var topics = areaIds.map(function (id) {
      var a = t.areas[id];
      return '<li><span>' + esc(areaName(id)) + '</span><b>' + a.right + ' of ' + a.n + '</b></li>';
    }).join('');
    var cards = run.answers.map(function (a, i) {
      var c = byId[a.id] || {};
      return '<li class="' + (a.right ? 'is-right' : 'is-miss') + '">' + (a.right ? ICON.right : ICON.miss) +
        '<div><span class="qc-l-ctx">' + (i + 1) + '. ' + esc(c.context) + '</span><span class="qc-l-why"><b>' + verdictWord(a.call, c) + '.</b> ' + esc(c.why) +
        ' <span class="qc-l-you">You said: ' + WORDING.buttons[a.call] + '.</span></span></div></li>';
    }).join('');
    var tasksDone = !!(S.session && (S.session.has_results || S.session.round > 1));
    var short = practice() && !tasksDone && !(S.session.done || []).length;
    main.innerHTML =
      '<section class="card panel qc-result" aria-labelledby="qc-res-h">' +
        '<h1 id="qc-res-h" tabindex="-1"><span class="qc-big">' + t.right + '</span> of ' + t.n + ' right calls.</h1>' +
        '<ul class="qc-slips">' +
          // A warning mark beside a slip, a tick beside none: the words carry it, the icon repeats it. (B) Each count
          // carries its base: the split changes from run to run.
          '<li class="' + (t.trustedWrong ? 'is-some' : 'is-none') + '">' + (t.trustedWrong ? ICON.miss : ICON.right) + '<span>You said \'right\' to ' + t.trustedWrong + ' of the ' + plural(t.wrongN, 'wrong answer', 'wrong answers') + '.</span></li>' +
          '<li class="' + (t.doubtedRight ? 'is-some' : 'is-none') + '">' + (t.doubtedRight ? ICON.miss : ICON.right) + '<span>You said \'wrong\' to ' + t.doubtedRight + ' of the ' + plural(t.rightN, 'right one', 'right ones') + '.</span></li>' +
        '</ul>' +
        '<p class="qc-mean">' + esc(m) + '</p>' +
        '<p class="qc-handon">That was the click. Now show the thinking behind it.</p>' +
        '<button type="button" class="btn block qc-go-tasks" id="qc-go-tasks">' + (short ? 'Try 3 short tasks' : 'Go to the full tasks') + ICON.arrow + '</button>' +
        '<button type="button" class="qc-again" id="qc-again">Another ' + size() + '</button>' +
        '<h2 class="qc-topics-h" id="qc-topics-h">By topic</h2><ul class="qc-topics" aria-labelledby="qc-topics-h">' + topics + '</ul>' +
        '<div class="more qc-more"><button type="button" class="more-btn" aria-expanded="false" aria-controls="qc-more-body" id="qc-more-btn"><span>More</span>' + ICON.chev + '</button>' +
          '<div class="more-body" id="qc-more-body" hidden><h2 class="qc-sub">Your cards</h2><ol class="qc-list">' + cards + '</ol>' +
          '<h2 class="qc-sub">About Quick check</h2>' +
          '<p class="small">Quick check is practice. It does not change your Litmus score or your levels.</p>' +
          '<p class="small">Each Quick check mixes answers where the AI is right and answers where it is wrong, and the mix changes from run to run, so pressing one button every time does not pay. With earlier results, more cards come from the topics you missed most.</p></div></div>' +
      '</section>';
    $('#qc-go-tasks').addEventListener('click', function () {
      if (short) return shortSet(this);
      A.go(tasksDone ? 'next' : 'task');
    });
    $('#qc-again').addEventListener('click', function () { open(); });
    $('#qc-more-btn').addEventListener('click', function () {
      var body = $('#qc-more-body'), b = $('#qc-more-btn');
      body.hidden = !body.hidden;
      b.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
    });
    window.scrollTo(0, 0);
    var h = $('#qc-res-h'); if (h) h.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ keys on a laptop */
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('qc-play') || e.ctrlKey || e.metaKey || e.altKey) return;
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    var k = e.key;
    if (/^[rRtT]$/.test(k) && !Q.locked) { e.preventDefault(); answer('trust'); return; }   // R (right); T still works
    if (/^[wWdD]$/.test(k) && !Q.locked) { e.preventDefault(); answer('doubt'); return; }   // W (wrong); D still works
    if (k === 'Escape') { var box = $('#qc-disc'); if (box && !box.hidden) { e.preventDefault(); toggleDiscuss(); var d = $('#qc-discuss'); if (d) d.focus(); } return; }
    // Enter on a focused button already presses it; anywhere else it means Next.
    if ((k === 'Enter' || k === 'n' || k === 'N') && Q.locked && !(tg && tg.closest && tg.closest('button, a'))) { e.preventDefault(); next(); }
  });

  window.LitmusQuick = {
    on: on,
    render: render,
    entryHtml: entryHtml,
    open: open,
    takeIntent: function () { var v = Q.intent; Q.intent = false; return v; },
    // For tests and the guided demo.
    state: Q,
    rules: { qLine: qLine, captions: captions, wording: WORDING,
      // 19 Nov 2026: the rules behind "Why?", the nudge, praise, and the summary, for the tests.
      praiseWord: praiseWord, clueLine: clueLine, floorSeconds: floorSeconds, nudgeDue: nudgeDue, summaryModel: summaryModel,
      baseLine: baseLine, tally: tally, nextLabel: nextLabel, tasksLabel: TASKS_LABEL, introAt: INTRO_AT, weakAt: WEAK_AT }
  };
})();
