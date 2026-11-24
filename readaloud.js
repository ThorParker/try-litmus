/* Litmus "Read this screen aloud" (19 Nov 2026). One round play/pause button in the top bar, the same place on every
   reading screen. One tap reads the screen's reading text in order; a second tap pauses; leaving the screen stops it.
   It reads only the MAIN lines of a screen (SCREENS below: one short read list per screen kind; any other screen,
   its first heading and the first sentence under it). No screen needs a hook. The AI's words get the lead-in.
   Voices: a recorded clip when static/voice/manifest.json has one for that exact text (every clip Kokoro bm_lewis, the
   AI's words too, each preceded by the recorded lead-in "The AI says", with about 300 ms between parts); otherwise the
   device's own voice, but ONLY one that can be named male and English
   (VOICE_RULES). With no such voice on the device, parts without a clip are skipped; a screen with nothing to play
   shows no button. Off on the server: LITMUS_READ_ALOUD=0 (status.read_aloud false). */
(function () {
  'use strict';

  /* ------------------------------------------------------------ the device-voice rules (one place; tests read them) */
  var VOICE_RULES = {
    // Best first. Within each group a name with "Natural" or "Neural" comes first.
    gbMale: ['Ryan', 'George', 'Thomas', 'Daniel', 'Arthur', 'Oliver', 'Ollie', 'Alfie', 'Elliot', 'Noah'],
    usMale: ['Guy', 'Davis', 'Tony', 'Jason', 'Christopher', 'Eric', 'Roger', 'Steffan', 'Andrew', 'Brian'],
    // Never used: any name with one of these words.
    female: ['Female', 'Woman', 'Sonia', 'Libby', 'Maisie', 'Hazel', 'Susan', 'Zira', 'Aria', 'Jenny', 'Emma', 'Ava', 'Michelle',
      'Samantha', 'Karen', 'Moira', 'Tessa', 'Kate', 'Serena', 'Fiona', 'Martha'],
    rate: 0.95
  };
  function hasWord(name, list) {
    return list.some(function (w) { return new RegExp('(^|[^A-Za-z])' + w + '([^A-Za-z]|$)', 'i').test(name); });
  }
  // A rank (lower is better), or -1 for a voice that must never be used.
  function voiceRank(v) {
    var name = String((v && v.name) || ''), lang = String((v && v.lang) || '').replace('_', '-');
    if (!name || hasWord(name, VOICE_RULES.female)) return -1;
    var nat = /Natural|Neural/i.test(name) ? 0 : 1;
    if (/^en-GB/i.test(lang) && hasWord(name, ['Male'])) return 0 + nat;
    if (/^en-GB/i.test(lang) && hasWord(name, VOICE_RULES.gbMale)) return 2 + nat;
    if (/^en-US/i.test(lang) && hasWord(name, VOICE_RULES.usMale)) return 4 + nat;
    return -1;
  }
  function pickVoice(list) {
    var vs = list || ((window.speechSynthesis && window.speechSynthesis.getVoices) ? window.speechSynthesis.getVoices() : []);
    // A tree whose app.js already carries the same rules (window.LitmusVoice, cp_11b) uses that one list.
    if (!list && window.LitmusVoice && typeof window.LitmusVoice.pick === 'function') return window.LitmusVoice.pick(vs || []);
    var best = null, br = 99;
    (vs || []).forEach(function (v) { var r = voiceRank(v); if (r >= 0 && r < br) { best = v; br = r; } });
    return best;
  }

  /* ------------------------------------------------------------ the clip key (the same as tools/build_voice_clips.py) */
  var WS = /[ \t\n\r\f\v\u00a0\u2028\u2029\u202f]+/g;
  function canon(t) { return String(t == null ? '' : t).replace(WS, ' ').replace(/^ +| +$/g, ''); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  // A small SHA-256 for pages served without a secure context (crypto.subtle is missing there, e.g. a phone on a school LAN).
  function sha256Bytes(bytes) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(bytes); m[l] = 0x80;
    var bits = l * 8;
    m[n - 4] = (bits >>> 24) & 255; m[n - 3] = (bits >>> 16) & 255; m[n - 2] = (bits >>> 8) & 255; m[n - 1] = bits & 255;
    m[n - 5] = Math.floor(bits / 0x100000000) & 255;
    var w = new Array(64);
    function rr(x, c) { return (x >>> c) | (x << (32 - c)); }
    for (var o = 0; o < n; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('0000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function keySync(voice, text) { return sha256Bytes(utf8(voice + '|' + canon(text))).slice(0, 16); }
  function clipKey(voice, text) {
    var data = utf8(voice + '|' + canon(text));
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      return window.crypto.subtle.digest('SHA-256', data).then(function (b) { return hex(b).slice(0, 16); }, function () { return keySync(voice, text); });
    }
    return Promise.resolve(keySync(voice, text));
  }

  /* ------------------------------------------------------------ the manifest (fetched once; missing = no clips) */
  var MAN = null, manP = null;
  function manifest() {
    if (MAN) return Promise.resolve(MAN);
    if (!manP) {
      manP = fetch('voice/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }).then(function (m) {
          m = m && m.clips ? m : { voices: {}, clips: {} };
          m.voices = m.voices || {};
          m.voices.narrator = m.voices.narrator || 'bm_lewis';
          m.voices.ai = m.voices.ai || m.voices.narrator;
          MAN = m; return m;
        });
    }
    return manP;
  }

  /* ------------------------------------------------------------ settings and the switch */
  var A = window.LitmusApp || null;
  function enabled() {
    var st = A && A.state && A.state.status;
    return !(st && st.read_aloud === false);
  }
  var RATE = { slow: 0.8, normal: 1, fast: 1.25 };
  function rate() { return RATE[document.documentElement.dataset.speech] || 1; }
  function autoOn() { return document.documentElement.dataset.autoread === 'on'; }

  /* ------------------------------------------------------------ what Play reads: the MAIN lines only (19 Nov 2026)
     The team lead: "just do the 'how well do you work with ai' ... start with 1, quick check, then do 2, tasks with the
     AI". Every screen reads only the lines a student needs to act: the title or question, the one line under it, and
     the choices in order. Never the header, notices, small print, "More" contents, footer lines, link lists, or
     anything in a closed panel. One short read list per screen kind (SCREENS, first match wins); any other screen:
     its first heading and the first sentence under it. */
  var AI_LEAD = 'The AI says';
  function hiddenUp(el, root) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return true;
      if (n !== el && n.tagName === 'DETAILS' && !n.hasAttribute('open')) return true;
      if (n === root) break;
    }
    return false;
  }
  function seen(el, root) { return !!el && !hiddenUp(el, root) && (!el.getClientRects || el.getClientRects().length > 0); }
  function all(root, sel) { return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) { return seen(el, root); }); }
  function one(root, sel) { return all(root, sel)[0] || null; }
  function hasClass(el, c) { return !!(el && el.classList && el.classList.contains(c)); }
  // Words inside one line run on (no space added round them); a SMALL is a line of its own ("72", "out of 100").
  var INLINE = ['B', 'STRONG', 'EM', 'I', 'SPAN', 'A', 'ABBR', 'CODE', 'SUB', 'SUP', 'U', 'MARK', 'S', 'Q', 'TIME'];
  // The words on screen: no icons, no key hints, no screen-reader-only helpers.
  function shownText(el) {
    var out = [];
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) { out.push(c.nodeValue); return; }
        if (c.nodeType !== 1) return;
        var tag = String(c.tagName).toUpperCase();
        if (c.getAttribute('aria-hidden') === 'true' || hasClass(c, 'visually-hidden') || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'KBD') return;
        var gap = INLINE.indexOf(tag) < 0 ? ' ' : '';
        out.push(gap); walk(c); out.push(gap);
      });
    })(el);
    return canon(out.join(''));
  }
  function stop1(t) { t = canon(t); return /[.!?:]$/.test(t) ? t : t + '.'; }
  function firstSentence(t) { var m = /^[\s\S]*?[.!?](\s|$)/.exec(canon(t)); return canon(m ? m[0] : t); }
  function L(el, kind, text, lead) { return text ? { el: el, kind: kind || 'ui', text: canon(text), lead: lead || '' } : null; }
  function textOf(root, sel, kind) { var el = one(root, sel); return el ? L(el, kind, shownText(el)) : null; }
  // A Quick check card field: the text as the card says it (a recurring decimal's spoken form, which the page keeps in a
  // screen-reader span beside the drawn digits, included).
  function sayText(el) {
    var out = [];
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) { out.push(c.nodeValue); return; }
        if (c.nodeType !== 1) return;
        var tag = String(c.tagName).toUpperCase();
        if (c.getAttribute('aria-hidden') === 'true' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'KBD') return;
        var gap = INLINE.indexOf(tag) < 0 ? ' ' : '';
        out.push(gap); walk(c); out.push(gap);
      });
    })(el);
    return canon(out.join(''));
  }
  function cardText(root, sel, kind, lead) { var el = one(root, sel); return el ? L(el, kind, sayText(el), lead) : null; }
  function choices(root, sel) { return all(root, sel).map(function (el) { return L(el, 'ui', shownText(el)); }); }
  // The task screen's next button, by name: the first one on screen of these.
  function nextStep(root) {
    var b = one(root, '#cf-next') || one(root, '#cf-noai');
    var d = one(root, '#cf-decide');
    if (!b && d && !hasClass(d, 'is-off')) b = d;
    if (!b) b = one(root, '#cf-suggest');
    if (!b) return null;
    var name = b.querySelector('.cf-d-l') ? shownText(b.querySelector('.cf-d-l')) : shownText(b);
    return L(b, 'ui', 'Your next step: ' + stop1(name));
  }
  var SCREENS = [
    { kind: 'quick-why', when: '#qc-whyq', lines: function (r) { return [textOf(r, '#qc-whyq-h')].concat(choices(r, '#qc-whyq .qc-clue')); } },
    { kind: 'quick-after', when: '#qc-verdict', lines: function (r) { return [textOf(r, '#qc-verdict .qc-word'), cardText(r, '#qc-verdict .qc-why')]; } },
    { kind: 'quick-card', when: '#qc-ctx', lines: function (r) {
      return [cardText(r, '#qc-ctx', 'you'), cardText(r, '#qc-ans', 'ai', AI_LEAD), textOf(r, '#qc-qline')].concat(choices(r, '.qc-calls .qc-call-l'));
    } },
    { kind: 'quick-summary', when: '#qc-res-h', lines: function (r) {
      return [textOf(r, '#qc-res-h'), textOf(r, '#qc-opener') || textOf(r, '.qc-mean')].concat(choices(r, '#qc-next-1, #qc-go-tasks'));
    } },
    { kind: 'first-page', when: '.mode-list', lines: function (r) {
      var out = [textOf(r, '#hero-h')], k = 0;
      all(r, '.mode-list .mode-btn').forEach(function (b) {
        var n = b.querySelector('.mode-n'), name = b.querySelector('.mode-t b');
        var t = shownText(name || b);
        if (n && canon(n.textContent)) { t = (k ? 'Then do ' : 'Start with ') + canon(n.textContent) + ': ' + t; k++; }
        out.push(L(b, 'ui', stop1(t)));
      });
      return out;
    } },
    { kind: 'task-start', when: '#cf-intro', lines: function (r) {
      var out = [textOf(r, '#cf-intro-line')];
      all(r, '#cf-intro .cf-guide li').forEach(function (li, i) { out.push(L(li, 'ui', (i + 1) + ': ' + stop1(shownText(li)))); });
      var go = one(r, '#cf-intro-go');
      out.push(go ? L(go, 'ui', 'Your next step: ' + stop1(shownText(go))) : null);
      return out;
    } },
    { kind: 'answer-sheet', when: '#sheet-h', lines: function (r) {
      var out = [textOf(r, '#sheet-h'), textOf(r, '#verdict-h')];   // "Your answer", then its question "Is the AI right?"
      all(r, '#sheet-body .cf-segbtn').forEach(function (b) {
        var name = Array.prototype.filter.call(b.querySelectorAll('span'), function (s) { return s.parentNode === b && !hasClass(s, 'cf-di') && !hasClass(s, 'cf-cap'); })[0];
        out.push(L(b, 'ui', shownText(name || b)));
      });
      return out;
    } },
    { kind: 'feedback', when: '#cf-reveal', lines: function (r) {
      var wrong = all(r, '#cf-reveal .cf-rv').filter(function (p) { return shownText(p); })[0];
      return [textOf(r, '#rv-line') || textOf(r, '#reveal-h'), textOf(r, '#rv-pts b'), wrong ? L(wrong, 'ui', shownText(wrong)) : null];
    } },
    { kind: 'task', when: '#cf-situ', lines: function (r) {
      var ai = all(r, '#messages .msg.ai .cf-body'), last = ai[ai.length - 1];
      return [textOf(r, '#cf-situ', 'you'), last ? L(last, 'ai', shownText(last), AI_LEAD) : null, textOf(r, '#ft-h'), nextStep(r)];
    } },
    { kind: 'results', when: '.big-score', lines: function (r) {
      var n = one(r, '.big-score');
      return [n ? L(n, 'ui', stop1(shownText(n))) : null, textOf(r, '#level-line') || textOf(r, '#rc-first')];
    } }
  ];
  function fallback(r) {
    var h = all(r, 'h1, h2').filter(function (x) { return !hasClass(x, 'visually-hidden') && shownText(x) && !inSkip(x, r); })[0];
    if (!h) return [];
    var after = false, line = null;
    all(r, 'h1, h2, p, li').some(function (x) {
      if (x === h) { after = true; return false; }
      if (!after || inSkip(x, r) || x.contains(h) || !shownText(x)) return false;
      if (/^H[12]$/.test(String(x.tagName).toUpperCase())) return true;   // the next heading: nothing was under the first
      line = L(x, 'ui', firstSentence(shownText(x)));
      return true;
    });
    return [L(h, 'ui', shownText(h)), line];
  }
  function inSkip(el, root) {
    for (var n = el; n && n.nodeType === 1 && n !== root; n = n.parentNode) {
      var t = String(n.tagName).toUpperCase();
      if (t === 'FOOTER' || t === 'NAV' || t === 'DETAILS' || t === 'BUTTON' || t === 'A' || t === 'LABEL') return true;
      if (['more', 'more-body', 'intro-strip', 'facts', 'checklist', 'small', 'muted', 'start-links', 'topics', 'notice-more', 'error'].some(function (c) { return hasClass(n, c); })) return true;
    }
    return false;
  }
  function screenKind(root) {
    for (var i = 0; i < SCREENS.length; i++) if (one(root, SCREENS[i].when)) return SCREENS[i];
    return null;
  }
  function parts(root) {
    root = root || document.getElementById('main');
    if (!root) return [];
    var s = screenKind(root);
    return (s ? s.lines(root) : fallback(root)).filter(function (p) { return p && p.text; });
  }
  function kindOf(root) { var s = screenKind(root || document.getElementById('main')); return s ? s.kind : 'other'; }
  // What is actually said: the recorded lead-in "The AI says" before every part that is the AI's words (one voice reads
  // everything, so the lead-in tells the ear who is speaking), then the part.
  function items(ps, m) {
    var out = [];
    ps.forEach(function (p) {
      var lead = p.lead || (p.kind === 'ai' && m.voices.ai === m.voices.narrator ? AI_LEAD : '');
      if (lead) out.push({ el: p.el, role: 'narrator', text: lead, lead: true });
      out.push({ el: p.el, role: p.kind === 'ai' ? 'ai' : 'narrator', text: p.text });
    });
    return out;
  }
  function withClips(list, m) {
    return Promise.all(list.map(function (it) {
      var voice = m.voices[it.role === 'ai' ? 'ai' : 'narrator'];
      return clipKey(voice, it.text).then(function (k) { it.key = k; it.clip = m.clips[k] ? m.clips[k].file : null; it.dur = m.clips[k] ? +m.clips[k].dur || 0 : 0; it.files = m.clips[k] ? (m.clips[k].parts || [m.clips[k].file]) : null; return it; });
    }));
  }

  /* ------------------------------------------------------------ the player */
  var P = { state: 'idle', list: [], i: 0, token: 0, audio: null, pausedAudio: false, sig: null, used: false, onEl: null };
  var autoDone = {};
  function mark(el) {
    if (P.onEl === el) return;
    if (P.onEl) P.onEl.classList.remove('ra-now');
    P.onEl = el || null;
    if (el && el.isConnected) el.classList.add('ra-now');
  }
  // The clip is fetched whole (the service worker keeps it on first play), then played from memory.
  function playClip(file, tok) {
    return fetch('voice/' + file).then(function (r) {
      if (!r.ok) throw new Error('clip ' + r.status);
      return r.blob();
    }).then(function (blob) {
      if (tok !== P.token) return null;
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(blob);
        var a = new Audio(url);
        try { a.playbackRate = rate(); a.preservesPitch = true; } catch (e) { /* older browsers */ }
        P.audio = a; P.pausedAudio = false;
        function done(ok, err) { try { URL.revokeObjectURL(url); } catch (e) { /* gone */ } if (ok) resolve(); else reject(err); }
        a.onended = function () { done(true); };
        a.onerror = function () { done(false, new Error('clip')); };
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function (e) {
          if (e && e.name === 'NotAllowedError') { if (tok === P.token) stop(); done(true); } else done(false, e);
        });
      });
    });
  }
  function speakDevice(text) {
    var v = pickVoice();
    if (!v || !window.speechSynthesis) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.voice = v; u.lang = v.lang; u.rate = VOICE_RULES.rate;   // profile.js applies the reading speed on top
        u.onend = u.onerror = function () { resolve(true); };
        P.utter = u;
        window.speechSynthesis.speak(u);
      } catch (e) { resolve(false); }   // this part is skipped, never the rest
    });
  }
  // A line never stalls the queue: a deadline per line (its length at the chosen speed plus a margin; the clock stops
  // while paused). Past it the line is cut and Play goes on. Resolves 'ok', 'error' (it never started), or 'timeout'.
  function guarded(p, ms, tok) {
    return new Promise(function (resolve) {
      var left = ms, done = false;
      var iv = setInterval(function () {
        if (done) return;
        if (tok !== P.token) { end('gone'); return; }
        if (P.state === 'playing') left -= 250;
        if (left <= 0) {
          try { if (P.audio) P.audio.pause(); } catch (e) { /* gone */ }
          if (window.speechSynthesis && P.utter) window.speechSynthesis.cancel();
          end('timeout');
        }
      }, 250);
      function end(v) { if (done) return; done = true; clearInterval(iv); resolve(v); }
      p.then(function (v) { end(v === false ? 'error' : 'ok'); }, function () { end('error'); });
    });
  }
  // A long line recorded in parts (no clip is over 20 s): the parts in turn.
  function playFiles(files, tok) {
    return files.reduce(function (p, f) { return p.then(function () { return tok === P.token ? playClip(f, tok) : null; }); }, Promise.resolve());
  }
  function deviceMs(text) { return (String(text).split(/\s+/).length * 500) / rate() + 5000; }
  function playItem(it, tok) {
    if (!it.clip) return guarded(speakDevice(it.text), deviceMs(it.text), tok);
    return guarded(playFiles(it.files || [it.clip], tok), ((it.dur || 10) * 1000) / rate() + 6000 * (it.files || [1]).length, tok).then(function (r) {
      // A clip that never started (missing, blocked, broken): the device voice, male only, or nothing.
      return r === 'error' && tok === P.token && P.state === 'playing' ? guarded(speakDevice(it.text), deviceMs(it.text), tok) : r;
    });
  }
  function step(tok) {
    if (tok !== P.token || P.state !== 'playing') return;
    if (P.i >= P.list.length) { finish(); return; }
    var it = P.list[P.i];
    mark(it.el);
    function on() {
      if (tok !== P.token || P.state !== 'playing') return;
      P.i++;
      // About 300 ms between parts, so the ear hears where one ends; a lead-in runs straight into its part.
      var nx = P.list[P.i];
      setTimeout(function () { step(tok); }, nx && nx.el === it.el ? GAP_LEAD : GAP_PART);
    }
    playItem(it, tok).then(on, on);
  }
  var GAP_PART = 300, GAP_LEAD = 120;
  function canSpeak(it) { return !!(it.clip || pickVoice()); }
  // What can be said: a part with a clip, or any part when a male device voice exists. A lead-in only with its part.
  function playable(list) {
    return list.filter(function (it, i) { return it.lead ? !!(list[i + 1] && canSpeak(list[i + 1])) : canSpeak(it); });
  }
  function play() {
    var ps = parts();
    if (!ps.length) return Promise.resolve(false);
    stop();
    var tok = ++P.token;
    P.state = 'playing'; P.used = true; P.starts = (P.starts || 0) + 1; paintBtn();
    return manifest().then(function (m) { return withClips(items(ps, m), m); }).then(function (list) {
      if (tok !== P.token) return false;
      P.list = playable(list); P.i = 0;
      if (!P.list.length) { finish(); return false; }
      step(tok);
      return true;
    });
  }
  function pause() {
    if (P.state !== 'playing') return;
    P.state = 'paused';
    if (P.audio && !P.audio.paused && !P.audio.ended) { P.audio.pause(); P.pausedAudio = true; }
    else { P.token++; P.pausedAudio = false; if (window.speechSynthesis) window.speechSynthesis.cancel(); }
    paintBtn();
  }
  function resume() {
    if (P.state !== 'paused') return;
    P.state = 'playing'; paintBtn();
    if (P.pausedAudio && P.audio) { P.pausedAudio = false; var pr = P.audio.play(); if (pr && pr.catch) pr.catch(function () {}); return; }
    step(P.token);   // the current part again, from its start
  }
  function stop() {
    var was = P.state !== 'idle';
    P.token++;
    P.state = 'idle'; P.list = []; P.i = 0;
    if (P.audio) { try { P.audio.pause(); } catch (e) { /* gone */ } P.audio = null; }
    if (was && window.speechSynthesis && P.utter) { window.speechSynthesis.cancel(); }
    P.utter = null; P.pausedAudio = false;
    mark(null);
    paintBtn();
  }
  function finish() { P.state = 'idle'; P.audio = null; P.utter = null; mark(null); paintBtn(); }

  /* ------------------------------------------------------------ the button: an icon, the same place on every screen */
  var PLAY = '<svg class="ra-i ra-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg class="ra-i ra-pause" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/></svg>';
  var btn = null;
  function makeBtn() {
    if (btn || !document.querySelector('.topbar-tools')) return btn;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'ra-btn'; btn.className = 'ra-btn'; btn.hidden = true;
    btn.setAttribute('aria-label', 'Read this screen aloud');
    btn.innerHTML = PLAY + PAUSE;
    var tools = document.querySelector('.topbar-tools');
    tools.insertBefore(btn, tools.firstChild);
    btn.addEventListener('click', function () {
      if (P.state === 'playing') pause();
      else if (P.state === 'paused') resume();
      else play();
    });
    return btn;
  }
  function paintBtn() {
    if (!btn) return;
    var on = P.state === 'playing';
    btn.dataset.state = P.state;
    btn.setAttribute('aria-label', on ? 'Pause' : 'Read this screen aloud');
  }

  /* ------------------------------------------------------------ a screen settles: mark, show or hide, maybe read */
  var tmr = null;
  // A screen is its address and its main lines: a new card, the feedback after a tap, or a new AI answer is a new screen.
  function signature(ps) {
    return location.hash + '|' + ps.map(function (p) { return p.text; }).join('|').slice(0, 300);
  }
  // A sheet over the page (the answer sheet, the check, without AI) dims everything under it, the top bar too: the Play
  // button is lifted above it, in exactly its own place (a placeholder keeps the bar's other buttons still).
  var holder = null;
  function liftOverSheet() {
    if (!btn) return;
    var open = !!(document.body && document.body.classList.contains('cf-sheet-open'));
    if (open && !holder && !btn.hidden) {
      var r = btn.getBoundingClientRect();
      holder = document.createElement('span');
      holder.className = 'ra-holder';
      holder.style.cssText = 'display:inline-block;flex:none;width:' + r.width + 'px;height:' + r.height + 'px';
      btn.parentNode.insertBefore(holder, btn);
      // out of the top bar (its own layer sits under the sheet) to the page's top layer, same place on screen
      document.body.appendChild(btn);
      // its exact place; only when the bar has scrolled off the top, the top of the screen
      btn.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + (r.top >= 0 ? r.top : 8) + 'px;z-index:70';
    } else if (!open && holder) {
      if (holder.parentNode) { holder.parentNode.insertBefore(btn, holder); holder.parentNode.removeChild(holder); }
      holder = null;
      btn.style.cssText = '';
    }
  }
  function settle() {
    var main = document.getElementById('main');
    var h = document.documentElement;
    if (!main || !enabled()) { if (btn) btn.hidden = true; h.classList.remove('ra-on', 'ra-screen'); if (P.state !== 'idle') stop(); return; }
    makeBtn();
    liftOverSheet();
    h.classList.add('ra-on');
    var ps = parts(main);
    var sig = signature(ps);
    if (sig !== P.sig) { if (P.state !== 'idle') stop(); P.sig = sig; }
    if (!ps.length) { if (btn) btn.hidden = true; h.classList.remove('ra-screen'); return; }
    manifest().then(function (m) { return withClips(items(ps, m), m); }).then(function (list) {
      if (sig !== P.sig) return;
      var any = playable(list).length > 0;
      if (btn) btn.hidden = !any;
      liftOverSheet();
      h.classList.toggle('ra-screen', any);
      if (any && autoOn() && !autoDone[sig] && P.state === 'idle') { autoDone[sig] = true; play(); }
    });
  }
  function schedule() { clearTimeout(tmr); tmr = setTimeout(settle, 350); }
  function boot() {
    var main = document.getElementById('main');
    if (!main) return;
    if (window.MutationObserver) new MutationObserver(schedule).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('hashchange', function () { if (P.state !== 'idle') stop(); P.sig = null; schedule(); });
    // A "More" or a sheet opening changes what is on screen: the next tap reads it.
    document.addEventListener('click', function () { schedule(); }, true);
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', function () { noVoiceClass(); schedule(); });
    }
    noVoiceClass();
    schedule();
  }
  // No male English voice on this device: the old "Listen" buttons (device voice only) are hidden too.
  function noVoiceClass() { document.documentElement.classList.toggle('ra-novoice', !pickVoice()); }

  window.LitmusReadAloud = {
    play: play, pause: pause, resume: resume, stop: stop, settle: settle,
    state: function () { return P.state; },
    starts: function () { return P.starts || 0; },   // for the tests: how many times reading began
    used: function () { return P.used; },
    parts: parts, kind: kindOf, sayText: sayText, pickVoice: pickVoice, voiceRank: voiceRank, rules: VOICE_RULES,
    canon: canon, key: clipKey, keySync: keySync, manifest: manifest,
    _reset: function () { autoDone = {}; P.sig = null; MAN = null; manP = null; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
