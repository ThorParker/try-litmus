/* Litmus reading settings: one "Accessibility" button (it was "Display" until 16 Nov 2026) that opens one panel.
   The choices are the same as before (fonts, text sizes, colour modes). The page's own <select>
   elements stay in the page and still hold the values, so saving works exactly as it did; this file
   only draws them as large buttons you can see before you choose. Used by the student app and the
   teacher view. If this file does not load, the plain selects still work. */
(function () {
  'use strict';
  /* Text size (19 Nov 2026, team lead: "a slider so that people can decide ... how big they want it"): one slider,
     100% to 220% in steps of 10. The setting is the percentage as text ("140"); html[data-size="140"] sets the
     root font size in styles.css, so everything sized in rem grows with it (never a page zoom). The three older
     names still work wherever they are saved: "normal" = 100, "large" = 110, "xlarge" = 130. */
  var TS = (function () {
    var MIN = 100, MAX = 220, STEP = 10, OLD = { normal: 100, large: 110, xlarge: 130 };
    var steps = [];
    for (var p = MIN; p <= MAX; p += STEP) steps.push(p);
    function pct(v) {
      if (Object.prototype.hasOwnProperty.call(OLD, v)) return OLD[v];
      var n = parseInt(v, 10);
      if (!isFinite(n)) return MIN;
      n = Math.round(n / STEP) * STEP;
      return Math.min(MAX, Math.max(MIN, n));
    }
    function norm(v) { return String(pct(v)); }
    function band(v) { var n = pct(v); return n >= 130 ? 'big' : n > 100 ? 'larger' : 'standard'; }
    function valueText(v) { var n = pct(v); return n + ' percent' + (n === 100 ? ', Standard' : ''); }
    // The <select id="set-size"> holds the value (app.js and teacher.js read it): one option per step.
    function fillSelect(sel) {
      if (!sel) return;
      var was = norm(sel.value);
      sel.innerHTML = steps.map(function (n) { return '<option value="' + n + '">' + (n === 100 ? 'Standard (100%)' : n + '%') + '</option>'; }).join('');
      sel.value = was;
    }
    // The slider, its preview line ("Aa 140%"), and the Standard reset. Every id starts with `pre` (two can be on a page).
    function sliderHtml(pre) {
      return '<fieldset class="seg seg-size ts-field"><legend id="' + pre + '-ts-legend">Text size</legend>' +
        '<div class="ts-row"><input type="range" class="ts-range" id="' + pre + '-ts-range" min="' + MIN + '" max="' + MAX + '" step="' + STEP + '" value="100"' +
        ' aria-labelledby="' + pre + '-ts-legend" aria-valuetext="' + valueText(100) + '">' +
        '<output class="ts-out" id="' + pre + '-ts-out" for="' + pre + '-ts-range" aria-hidden="true"><span class="ts-aa">Aa</span> <span class="ts-pct">100%</span></output>' +
        '<button type="button" class="btn small quiet ts-reset" id="' + pre + '-ts-reset">Standard</button></div></fieldset>';
    }
    // Wire a slider drawn by sliderHtml. onPick(value) runs when a value is chosen (arrow key, tap, release, reset).
    // While dragging, the page follows at once (the root size only); onPick saves it.
    function bind(root, pre, onPick) {
      var r = root.querySelector('#' + pre + '-ts-range'), reset = root.querySelector('#' + pre + '-ts-reset');
      if (!r) return null;
      function show(v) {
        var n = pct(v);
        r.value = String(n);
        r.setAttribute('aria-valuetext', valueText(n));
        r.style.setProperty('--ts-fill', ((n - MIN) / (MAX - MIN) * 100) + '%');
        var out = root.querySelector('#' + pre + '-ts-out .ts-pct'); if (out) out.textContent = n + '%';
        if (reset) reset.setAttribute('aria-pressed', n === 100 ? 'true' : 'false');
      }
      r.addEventListener('input', function () {
        show(r.value);
        var h = document.documentElement; h.dataset.size = norm(r.value); h.dataset.sizeBand = band(r.value);
      });
      r.addEventListener('change', function () { show(r.value); onPick(norm(r.value)); });
      if (reset) reset.addEventListener('click', function () { show(100); onPick('100'); r.focus({ preventScroll: true }); });
      return { show: show };
    }
    return { MIN: MIN, MAX: MAX, STEP: STEP, OLD: OLD, steps: steps, pct: pct, norm: norm, band: band, valueText: valueText,
             fillSelect: fillSelect, sliderHtml: sliderHtml, bind: bind };
  })();
  window.LitmusTextSize = TS;
  TS.fillSelect(document.getElementById('set-size'));

  var panel = document.getElementById('display-panel');
  var btn = document.getElementById('display-btn');
  if (!panel || !btn) return;

  var GROUPS = [
    { id: 'set-font', name: 'Font', kind: 'font' },
    { id: 'set-size', name: 'Text size', kind: 'size' },
    { id: 'set-theme', name: 'Colours', kind: 'theme' }
  ];
  var FONT_STACK = {
    lexend: '"Lexend Deca", "Lexend Deca Local", "Segoe UI", system-ui, sans-serif',
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif'
  };
  // Colour-blind safe (19 Nov 2026, team lead: "I saw no difference"): a live sample under the colour choices, two
  // swatches drawn with the right and wrong colours of the mode in use, so a switch shows at once what changed.
  var COLOUR_SAMPLE = '<p class="cs-sample" aria-hidden="true">' +
    '<span class="cs-sw cs-right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>right</span>' +
    '<span class="cs-sw cs-wrong"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>wrong</span></p>';
  window.LitmusColourSample = COLOUR_SAMPLE;
  var TICK = '<svg class="seg-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // The teacher view's options read "Normal text", "Larger text": inside a group called "Text size" the word is not needed.
  function shortLabel(kind, text) { return kind === 'size' ? text.replace(/ text$/, '') : text; }

  var built = [];
  var html = '';
  GROUPS.forEach(function (g) {
    var sel = document.getElementById(g.id);
    if (!sel) return;
    built.push({ group: g, select: sel });
    if (g.kind === 'size') { html += TS.sliderHtml('disp'); return; }
    html += '<fieldset class="seg seg-' + g.kind + '"><legend>' + g.name + '</legend><div class="seg-row">';
    Array.prototype.forEach.call(sel.options, function (o) {
      var extra = '';
      var style = '';
      if (g.kind === 'font') style = ' style="font-family:' + esc(FONT_STACK[o.value] || 'inherit') + '"';
      if (g.kind === 'size') extra = '<span class="seg-a seg-a-' + esc(o.value) + '" aria-hidden="true">A</span>';
      if (g.kind === 'theme') extra = '<span class="seg-sw seg-sw-' + esc(o.value) + '" aria-hidden="true"><i></i><i></i><i></i></span>';
      html += '<label' + style + '><input type="radio" name="disp-' + g.kind + '" value="' + esc(o.value) + '">' + extra +
        '<span class="seg-text">' + esc(shortLabel(g.kind, o.textContent)) + '</span>' + TICK + '</label>';
    });
    html += '</div>' + (g.kind === 'theme' ? COLOUR_SAMPLE : '') + '</fieldset>';
  });
  if (!built.length) return;

  var body = document.createElement('div');
  body.className = 'display-body';
  body.innerHTML = '<div class="display-head"><h2 id="display-h">Accessibility</h2><button type="button" class="btn small" id="display-done">Done</button></div>' + html;
  panel.insertBefore(body, panel.firstChild);
  var plain = panel.querySelector('.settings');
  if (plain) plain.hidden = true;        // the selects keep the values; the buttons above set them
  var foot = panel.querySelector('.display-foot');
  if (foot) body.appendChild(foot);
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-labelledby', 'display-h');
  panel.hidden = true;

  var sizeSel = document.getElementById('set-size');
  var slider = sizeSel ? TS.bind(body, 'disp', function (v) {
    sizeSel.value = v;
    sizeSel.dispatchEvent(new Event('change', { bubbles: true }));
  }) : null;
  // At big text sizes the header folds its mode badge away (styles.css); its words then show in this menu.
  var modeLine = document.createElement('p');
  modeLine.className = 'disp-mode small muted';
  modeLine.hidden = true;
  body.insertBefore(modeLine, body.children[1] || null);
  function syncMode() {
    var mb = document.getElementById('mode-badge');
    var words = mb ? mb.textContent.replace(/\s+/g, ' ').trim() : '';
    modeLine.textContent = words;
    modeLine.hidden = !words || mb.hidden || getComputedStyle(mb).display !== 'none';
  }
  function sync() {
    if (slider) slider.show(sizeSel.value);
    syncMode();
    built.forEach(function (b) {
      var r = body.querySelector('input[name="disp-' + b.group.kind + '"][value="' + b.select.value + '"]');
      if (r) r.checked = true;
    });
  }
  body.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.type !== 'radio') return;
    built.forEach(function (b) {
      if (t.name !== 'disp-' + b.group.kind) return;
      b.select.value = t.value;
      b.select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  function open() {
    sync();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var first = body.querySelector('input:checked') || body.querySelector('input');
    if (first) first.focus({ preventScroll: true });
  }
  function close(giveFocusBack) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (giveFocusBack) btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', function () { if (panel.hidden) open(); else close(true); });
  document.getElementById('display-done').addEventListener('click', function () { close(true); });
  // Escape closes the panel and nothing else (the guided demo also listens for Escape).
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); e.preventDefault(); close(true); }
  }, true);
  document.addEventListener('click', function (e) {
    if (panel.hidden) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    close(false);
  });

  sync();
  window.LitmusDisplay = { sync: sync, open: open, close: close };
})();
