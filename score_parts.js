/* Litmus: the score in four parts, and one line for the level (score2, 19 Nov 2026).
   Shared by the student's results screen (app.js) and the teacher view (teacher.js), so a teacher sees the same
   line the student saw. It reads only the result the server returns and changes no score and no level.

   How the split works: the Litmus score is the mean of the measured topic scores; a topic score is the weighted
   mean of its tasks (a task's second topic counts at half) and, in one topic, how you asked the AI; a task score
   is the weighted mean of its parts (40 / 30 / 20 / 10, a missing part shares out). All of that is linear, so the
   score splits exactly into what each part brought. Rounded so the four rows always add up to the big number.
   How you asked the AI is shown inside "What you did". */
(function () {
  var SECOND_TOPIC = 0.5;   // rubric.json secondary_area_weight (not in /api/rubric; see NOTE.txt)
  var ASKED = 1.0;          // rubric.json prompt_quality.weight (not in /api/rubric; see NOTE.txt)
  var PARTS = [
    { id: 'decision', name: 'Your decision', of: 40 },
    { id: 'reasoning', name: 'Your reason', of: 30 },
    { id: 'action', name: 'What you did', of: 20 },
    { id: 'no_ai', name: 'On your own', of: 10 }
  ];
  var LEVEL = {
    1: { name: 'Aware', means: 'you know the basics' },
    2: { name: 'Capable', means: 'the level a sixth former should reach' },
    3: { name: 'Independent', means: 'you judge the AI well on your own' }
  };
  // What lifts a level a scoring rule held, in a student's words. Matched on the server's own sentence for it
  // (rubric.json level_rule_words), so a rule this file does not know falls back to the part with most to gain.
  var HELD = [
    { rx: /did not catch/i, to: 2, step: 'Spot one AI answer that is wrong and question it, to reach Capable.' },
    { rx: /more than the right button/i, to: 2, step: 'Add a reason that names the problem, or run the check, to reach Capable.', picked: true },
    { rx: /half of the right/i, to: 3, step: 'Trust at least half of the AI answers that are right, to reach Independent.' },
    { rx: /both a reason/i, to: 3, step: 'Name the problem in your reason and run a check, to reach Independent.' },
    { rx: /action that mattered/i, to: 3, step: 'Check it, fix it, or keep your details back, to reach Independent.' },
    { rx: /key point/i, to: 3, step: 'Name the key point in your reason, to reach Independent.' }
  ];
  // The next step when the result says nothing about a held level: built from the four parts, the one with the
  // most points still to get. {to} is the next level's name.
  var GAIN = {
    decision: 'Trust the right answers and question the wrong ones, to reach {to}.',
    reasoning: 'Add a reason that names the problem, or run the check, to reach {to}.',
    action: 'Run the check, or fix the answer, to reach {to}.',
    no_ai: 'Answer the one question on your own, with no AI, to reach {to}.'
  };

  // Whole numbers that add up to `total` exactly, each as close as it can be to its value (largest remainder).
  function apportion(values, total) {
    var fl = values.map(function (v) { return v > 0 ? Math.floor(v) : 0; });
    var diff = Math.round(total) - fl.reduce(function (a, b) { return a + b; }, 0);
    var idx = values.map(function (v, i) { return i; });
    var up = idx.slice().sort(function (a, b) { return (values[b] - fl[b]) - (values[a] - fl[a]) || a - b; });
    var down = idx.slice().sort(function (a, b) { return (values[a] - fl[a]) - (values[b] - fl[b]) || a - b; });
    for (var i = 0; diff > 0 && values.length; i++) { fl[up[i % up.length]] += 1; diff -= 1; }
    for (var j = 0, guard = 0; diff < 0 && guard < 1000; j++, guard++) { var k = down[j % down.length]; if (fl[k] > 0) { fl[k] -= 1; diff += 1; } }
    return fl;
  }
  function partWeights(t) {
    var c = t.components || {}, tw = 0;
    PARTS.forEach(function (p) { if (c[p.id]) tw += c[p.id].weight; });
    return tw;
  }

  // The score in four parts: [{id, name, earned, of}], earned adding up to res.overall, "of" adding up to 100.
  function parts(res) {
    if (!res || res.overall == null || !res.areas) return null;
    var byId = {};
    (res.tasks || []).forEach(function (t) { byId[t.task_id] = t; });
    var measured = res.areas.filter(function (a) { return a.score != null; });
    if (!measured.length) return null;
    var earned = { decision: 0, reasoning: 0, action: 0, no_ai: 0 }, avail = { decision: 0, reasoning: 0, action: 0, no_ai: 0 };
    measured.forEach(function (a) {
      var items = [];
      (a.sources || []).forEach(function (src) {
        if (src === 'prompts') { if (res.prompt_quality) items.push({ w: ASKED, prompts: res.prompt_quality.score || 0 }); return; }
        var t = byId[src];
        if (!t || !t.done || !t.components) return;
        items.push({ w: t.area === a.id ? 1 : SECOND_TOPIC, t: t });
      });
      var W = items.reduce(function (s, i) { return s + i.w; }, 0);
      if (!W) return;
      items.forEach(function (i) {
        var share = (i.w / W) / measured.length * 100;
        if (i.prompts != null) { earned.action += share * i.prompts; avail.action += share; return; }
        var tw = partWeights(i.t);
        if (!tw) return;
        PARTS.forEach(function (p) {
          var c = i.t.components[p.id];
          if (!c) return;
          earned[p.id] += share * c.score * c.weight / tw;
          avail[p.id] += share * c.weight / tw;
        });
      });
    });
    var ofs = apportion(PARTS.map(function (p) { return avail[p.id]; }), 100);
    var got = apportion(PARTS.map(function (p) { return earned[p.id]; }), res.overall);
    // Never more earned than there was to get, after rounding.
    for (var n = 0; n < 8; n++) {
      var over = got.map(function (g, i) { return g > ofs[i] ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!over.length) break;
      over.forEach(function (i) {
        var room = got.map(function (g, k) { return k !== i && g < ofs[k] ? k : -1; }).filter(function (k) { return k >= 0; })[0];
        if (room == null) return;
        got[i] -= 1; got[room] += 1;
      });
    }
    return PARTS.map(function (p, i) { return { id: p.id, name: p.name, earned: got[i], of: ofs[i], miss: avail[p.id] - earned[p.id] }; });
  }

  // One task's own parts, out of that task's 100.
  function taskParts(t) {
    if (!t || !t.done || !t.components || t.score == null) return null;
    var tw = partWeights(t);
    if (!tw) return null;
    var have = PARTS.filter(function (p) { return t.components[p.id]; });
    var ofs = apportion(have.map(function (p) { return 100 * t.components[p.id].weight / tw; }), 100);
    var got = apportion(have.map(function (p) { var c = t.components[p.id]; return 100 * c.score * c.weight / tw; }), t.score);
    return have.map(function (p, i) { return { id: p.id, name: p.name, earned: Math.min(got[i], ofs[i]), of: ofs[i] }; });
  }

  // The level most of the measured topics are at (a tie goes to the lower one), and whether every topic is there.
  function setLevel(res) {
    var m = (res.areas || []).filter(function (a) { return a.level != null; });
    if (!m.length) return null;
    var n = { 1: 0, 2: 0, 3: 0 };
    m.forEach(function (a) { n[a.level] = (n[a.level] || 0) + 1; });
    var best = 1;
    [1, 2, 3].forEach(function (l) { if (n[l] > n[best]) best = l; });
    return { level: best, all: n[best] === m.length, at: n[best], of: m.length };
  }
  function rulesOn(res) { return (res.areas || []).some(function (a) { return Object.prototype.hasOwnProperty.call(a, 'level_rules'); }); }
  // Which rule held each topic, as the student's step: [{area, step, to}]
  function heldSteps(res) {
    var out = [];
    (res.areas || []).forEach(function (a) {
      (a.level_rules || []).forEach(function (sentence) {
        var h = HELD.filter(function (x) { return x.rx.test(sentence); })[0];
        if (h) out.push({ area: a, held: h });
      });
    });
    return out;
  }
  function pickedRight(pp) {
    var d = (pp || []).filter(function (p) { return p.id === 'decision'; })[0];
    return !!(d && d.of && d.earned >= 0.6 * d.of);
  }

  // ONE line: what the level means and, when a rule holds it down, the one next thing that lifts it.
  // {lead, text, held}: lead is the level's name, text follows it.
  function levelLine(res) {
    var sl = setLevel(res);
    if (!sl) return null;
    var L = LEVEL[sl.level];
    var lead = sl.all ? L.name : L.name + ' in ' + sl.at + ' of ' + sl.of + ' topics';
    var text = L.means + '.';
    var pp = parts(res);
    var steps = heldSteps(res).filter(function (s) { return s.area.level === sl.level || s.held.to === sl.level + 1; });
    if (!steps.length) steps = heldSteps(res);
    if (steps.length) {
      // The step most topics share; ties go to the one that lifts to the lower level.
      var count = {};
      steps.forEach(function (s) { count[s.held.step] = (count[s.held.step] || 0) + 1; });
      var first = steps.slice().sort(function (a, b) { return (count[b.held.step] - count[a.held.step]) || (a.held.to - b.held.to); })[0];
      var top = first.held;
      // When the rule held only some topics, the step names them (one name, or "2 topics").
      var measured = (res.areas || []).filter(function (a) { return a.level != null; }).length;
      var where = steps.filter(function (s) { return s.held.step === top.step; }).map(function (s) { return s.area.name; })
        .filter(function (n, i, all) { return all.indexOf(n) === i; });
      // R1 (19 Nov 2026): held because no wrong answer was caught, but the student chose Verify on one and ran no
      // check: say that, not "question it" (they did doubt it).
      if (/did not catch/i.test(first.rule || '') || top.rx && String(top.rx).indexOf('did not catch') >= 0) {
        var verified = (res.tasks || []).some(function (t) { return t.done && t.ai_correct === false && t.choice === 'verify' && !t.checked; });
        if (verified) top = { step: 'Check it first, then give your call, to reach Capable.', to: top.to, picked: top.picked };
      }
      var step = where.length < measured ? top.step.replace(/\.$/, ' in ' + (where.length === 1 ? where[0] : where.length === 2 ? where[0] + ' and ' + where[1] : where.length + ' topics') + '.') : top.step;
      return { lead: lead, text: text + (top.picked && pickedRight(pp) ? ' You picked right.' : '') + ' ' + step, step: step, held: true };
    }
    // Demo smooth (19 Nov 2026, team lead: "all good on this; the issue is this thing"): "Mostly" with no rule
    // holding a topic down: the sentence names the topic(s) below the level and the part with most still to get.
    if (!sl.all && pp) {
      var below = (res.areas || []).filter(function (a) { return a.level != null && a.level < sl.level; }).map(function (a) { return a.name; });
      var missB = {};
      pp.forEach(function (p) { missB[p.id] = p.miss; });
      var candB = [['decision', missB.decision], ['reasoning', missB.reasoning + missB.action], ['no_ai', missB.no_ai]]
        .sort(function (a, b) { return b[1] - a[1]; })[0];
      if (below.length && candB && candB[1] > 0.5) {
        var stepB = GAIN[candB[0]].replace('{to}', L.name).replace(/\.$/, ' in ' + (below.length === 1 ? below[0] : below.length === 2 ? below[0] + ' and ' + below[1] : below.length + ' topics') + '.');
        return { lead: lead, text: text + ' ' + stepB, step: stepB, held: false };
      }
    }
    if (sl.level < 3 && pp) {
      // Reason and action are one step ("a reason that names the problem, or run the check"), as in the level rules.
      var miss = {};
      pp.forEach(function (p) { miss[p.id] = p.miss; });
      var cands = [['decision', miss.decision], ['reasoning', miss.reasoning + miss.action], ['no_ai', miss.no_ai]];
      var most = cands.sort(function (a, b) { return b[1] - a[1]; })[0];
      if (most && most[1] > 0.5) {
        var pre = most[0] === 'reasoning' && pickedRight(pp) ? ' You picked right.' : '';
        return { lead: lead, text: text + pre + ' ' + GAIN[most[0]].replace('{to}', LEVEL[sl.level + 1].name), step: GAIN[most[0]].replace('{to}', LEVEL[sl.level + 1].name), held: false };
      }
    }
    return { lead: lead, text: text, held: false };
  }
  function levelLineText(res) { var l = levelLine(res); return l ? l.lead + ': ' + l.text : ''; }

  // "How your score works": the four parts and, when the scoring rules are on, the four rules. One line each.
  // How many of the decided tasks ask the question without the AI (a decided task has a "no_ai" part exactly then).
  function noAiCount(res) {
    var done = (res && res.tasks || []).filter(function (t) { return t.done && t.components; });
    return { asked: done.filter(function (t) { return t.components.no_ai; }).length, of: done.length };
  }
  // score2c (19 Nov 2026): the same maxima as the bars for the set on screen, and one line on why they differ by set.
  function howLines(res) {
    var of = { decision: 40, reasoning: 30, action: 20, no_ai: 10 }, inSet = '';
    var pp = parts(res);
    if (pp) { pp.forEach(function (x) { of[x.id] = x.of; }); inSet = ' in this set'; }
    var up = function (id) { return pp ? 'up to ' + of[id] + inSet : String(of[id]); };
    var p = [
      'Your decision, ' + up('decision') + ': did you make the right call?',
      'Your reason, ' + up('reasoning') + ': does it name the problem? Or how you know it is right?',
      'What you did, ' + up('action') + '. Did you check it, fix it, or keep your details back? How you asked the AI counts here.',
      'On your own, ' + up('no_ai') + '. One question with no AI' + (pp ? ', asked in ' + noAiCount(res).asked + ' of ' + noAiCount(res).of + ' tasks.' : '.'),
      'Each task is out of 100. Ten of those are for the question on your own. Only some tasks ask one; the rest share those points out.'
    ];
    var r = rulesOn(res) ? [
      'Capable: the right button and a reason that names a point, or a check.',
      'Independent: name the key point, and check, fix, or keep details back.',
      'A reason counts only when your decision was right. "I checked" counts only if the check was made.',
      'Each set: question at least one wrong answer to go above Aware. Trust at least half the right ones to reach Independent.'
    ] : [
      'Your levels: Aware below 45, Capable from 45, Independent from 75.'
    ];
    return { parts: p, rules: r };
  }


  // cp_9 (19 Nov 2026, testers: "no working out"): where most points went, in one plain sentence. Built from the
  // task results only (choice, checked, over_trust, under_trust, each part's score); changes no number.
  var NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function num(n) { return NUM[n] || String(n); }
  function times(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : num(n) + ' times'; }
  function lossLine(res) {
    var pp = parts(res);
    if (!pp) return '';
    var done = (res.tasks || []).filter(function (t) { return t.done && t.components; });
    var worst = pp.slice().sort(function (a, b) { return (b.of - b.earned) - (a.of - a.earned); })[0];
    if (!worst || worst.of - worst.earned <= 0) return 'No points lost.';
    var verifyNoCheck = done.filter(function (t) { return t.choice === 'verify' && !t.checked; }).length;
    var below = function (id, cut) { return done.filter(function (t) { var c = t.components[id]; return c && c.score < cut; }).length; };
    // cp_12 (text audit): "Most points lost: <cause>.", digits, at most about ten words.
    var cause = '';
    if (worst.id === 'action') {
      if (verifyNoCheck) cause = 'Chose to check ' + verifyNoCheck + (verifyNoCheck === 1 ? ' time' : ' times') + ', no check run';
      else { var a = below('action', 1); cause = a ? a + (a === 1 ? ' check or fix not done' : ' checks or fixes not done') : 'how you asked the AI'; }
    } else if (worst.id === 'reasoning') {
      var r = below('reasoning', 0.5);
      cause = r ? r + (r === 1 ? ' reason did not name the problem' : ' reasons did not name the problem') : 'reasons named only part of it';
    } else if (worst.id === 'decision') {
      var over = done.filter(function (t) { return t.over_trust; }).length, under = done.filter(function (t) { return t.under_trust; }).length;
      var c = [[over, over + (over === 1 ? ' wrong answer trusted' : ' wrong answers trusted')],
               [verifyNoCheck, 'Chose to check ' + verifyNoCheck + (verifyNoCheck === 1 ? ' time' : ' times') + ', no check run'],
               [under, under + (under === 1 ? ' right answer doubted' : ' right answers doubted')]].sort(function (x, y) { return y[0] - x[0]; })[0];
      cause = c[0] ? c[1] : 'calls not quite right';
    } else if (worst.id === 'no_ai') {
      var n = below('no_ai', 1);
      cause = n + (n === 1 ? ' answer on your own wrong' : ' answers on your own wrong');
    }
    return 'Most points lost: ' + cause + '.';
  }

  // Good news first (19 Nov 2026, team lead): a part's mark uses the same lines as the levels (rubric levels: Capable
  // from 45, Independent from 75), so a mark never contradicts the level beside it: a tick at or above the Independent
  // line, an amber dot "Nearly" at or above the Capable line, a cross only below it. Rows go strongest first, and the
  // one weakest part that is not full is marked "Work on this", with what to do in at most eight words.
  var LINES = { mid: 0.45, good: 0.75 };
  function setLines(levels) {
    (levels || []).forEach(function (l) { if (l.level === 2) LINES.mid = l.min / 100; if (l.level === 3) LINES.good = l.min / 100; });
  }
  function markFor(points, of) { var r = of ? points / of : 1; return r >= LINES.good ? 'good' : r >= LINES.mid ? 'mid' : 'low'; }
  var TIPS = { decision: 'Trust right answers; question wrong ones.', reasoning: 'Say what is wrong and how you know.',
    action: 'Check it outside the AI before you answer.', no_ai: 'Practise the skill with no AI first.' };
  function marked(rows) {
    var out = (rows || []).map(function (r, i) {
      var o = {}; for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k]; }
      o.ratio = r.of ? r.points / r.of : 1; o.mark = markFor(r.points, r.of); o.i = i; o.work = '';
      return o;
    });
    out.sort(function (a, b) { return (b.ratio - a.ratio) || (a.i - b.i); });
    var weak = out[out.length - 1];
    if (weak && weak.ratio < 1) weak.work = TIPS[weak.id] || 'Work on this part.';
    return out;
  }
  // Marks and the level agree: a level of Capable or above never sits beside only crosses; Aware never beside only ticks.
  function agrees(level, rows) {
    var m = marked(rows).map(function (r) { return r.mark; });
    if (!m.length || level == null) return true;
    if (level >= 2) return m.some(function (x) { return x !== 'low'; });
    return !m.every(function (x) { return x === 'good'; });
  }

  window.LitmusScore = { parts: parts, taskParts: taskParts, levelLine: levelLine, levelLineText: levelLineText, lossLine: lossLine,
                         marked: marked, markFor: markFor, setLines: setLines, agrees: agrees, setLevel: setLevel, tips: TIPS,
                         howLines: howLines, noAiCount: noAiCount, levelName: function (l) { return (LEVEL[l] || {}).name; },
                         levelMeans: function (l) { return (LEVEL[l] || {}).means; }, heldSteps: heldSteps, apportion: apportion };
})();
