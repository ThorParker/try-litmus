/* A small QR code encoder in plain JavaScript, no library and no network call.
   Byte mode, error correction level M, versions 1 to 10 (up to 213 bytes, plenty for a join address).
   Follows the QR code standard (ISO/IEC 18004): Reed-Solomon codewords over GF(256), block
   interleaving, function patterns, the zigzag data path, eight masks scored by the standard
   penalty rules, and BCH-coded format and version information.
   Checked by tests/test_round2_2026_11_14.py, which decodes its output with OpenCV.
   Use: LitmusQR.svg(text, { scale: 8 }) gives an SVG string; LitmusQR.matrix(text) gives the modules. */
(function (root) {
  'use strict';

  // Level M: [EC codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]
  var EC_M = { 1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44] };
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function rsGenerator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = zeros(g.length + 1);
      for (var j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function rsRemainder(data, n) {
    var g = rsGenerator(n);
    var res = data.concat(zeros(n));
    for (var i = 0; i < data.length; i++) {
      var c = res[i];
      if (c !== 0) for (var j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
    }
    return res.slice(data.length);
  }

  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(String(text)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes) {
    var v, spec, dataCw;
    for (v = 1; v <= 10; v++) {
      spec = EC_M[v];
      dataCw = spec[1] * spec[2] + spec[3] * spec[4];
      if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= dataCw * 8) break;
    }
    if (v > 10) throw new Error('Too long for a QR code here');
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCw * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (var p = 0; data.length < dataCw; p++) data.push(p % 2 ? 0x11 : 0xEC);
    var blocks = [], k = 0, n;
    for (n = 0; n < spec[1]; n++) { blocks.push(data.slice(k, k + spec[2])); k += spec[2]; }
    for (n = 0; n < spec[3]; n++) { blocks.push(data.slice(k, k + spec[4])); k += spec[4]; }
    var ecs = blocks.map(function (bl) { return rsRemainder(bl, spec[0]); });
    var out = [], longest = Math.max(spec[2], spec[4]);
    for (i = 0; i < longest; i++) blocks.forEach(function (bl) { if (i < bl.length) out.push(bl[i]); });
    for (i = 0; i < spec[0]; i++) ecs.forEach(function (ec) { out.push(ec[i]); });
    return { version: v, data: out };
  }

  function build(version, data, mask) {
    var size = 17 + 4 * version, grid = [], fn = [], x, y, i;
    for (y = 0; y < size; y++) { grid.push(zeros(size).map(function () { return false; })); fn.push(zeros(size).map(function () { return false; })); }
    function set(cx, cy, dark) { grid[cy][cx] = dark; fn[cy][cx] = true; }
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    });
    var pos = ALIGN[version], na = pos.length;
    for (i = 0; i < na; i++) for (var j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) set(pos[i] + ax, pos[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
    drawFormat(set, size, mask);
    if (version >= 7) {
      var rem = version;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = (version << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((vbits >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    // the data, along the zigzag path
    var n = 0, total = data.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          y = upward ? size - 1 - vert : vert;
          if (!fn[y][x]) {
            grid[y][x] = n < total ? ((data[n >>> 3] >>> (7 - (n & 7))) & 1) === 1 : false;
            n++;
          }
        }
      }
    }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      if (fn[y][x]) continue;
      var flip;
      switch (mask) {
        case 0: flip = (x + y) % 2 === 0; break;
        case 1: flip = y % 2 === 0; break;
        case 2: flip = x % 3 === 0; break;
        case 3: flip = (x + y) % 3 === 0; break;
        case 4: flip = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: flip = x * y % 2 + x * y % 3 === 0; break;
        case 6: flip = (x * y % 2 + x * y % 3) % 2 === 0; break;
        default: flip = ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
      if (flip) grid[y][x] = !grid[y][x];
    }
    return grid;
  }

  function drawFormat(set, size, mask) {
    var dataBits = (0 << 3) | mask;   // level M is 00
    var rem = dataBits, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((dataBits << 10) | rem) ^ 0x5412;
    function bit(k) { return ((bits >>> k) & 1) === 1; }
    for (i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);   // the dark module
  }

  function penalty(g) {
    var size = g.length, score = 0, x, y, run, i;
    function lines(get) {
      for (var a = 0; a < size; a++) {
        run = 1;
        for (var b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (b === size - 1 && run >= 5) score += run - 2; }
          else { if (run >= 5) score += run - 2; run = 1; }
        }
        // finder-like 1:1:3:1:1 with four light modules on one side
        for (b = 0; b + 10 < size; b++) {
          var pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1], m1 = true, m2 = true;
          for (i = 0; i < 11; i++) { var v = get(a, b + i) ? 1 : 0; if (v !== pat[i]) m1 = false; if (v !== rev[i]) m2 = false; }
          if (m1) score += 40;
          if (m2) score += 40;
        }
      }
    }
    lines(function (a, b) { return g[a][b]; });
    lines(function (a, b) { return g[b][a]; });
    for (y = 0; y + 1 < size; y++) for (x = 0; x + 1 < size; x++) {
      var c = g[y][x];
      if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) score += 3;
    }
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (g[y][x]) dark++;
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  function matrix(text) {
    var cw = codewords(utf8(text)), best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var g = build(cw.version, cw.data, mask), s = penalty(g);
      if (s < bestScore) { best = g; bestScore = s; }
    }
    return { version: cw.version, size: best.length, modules: best };
  }

  function svg(text, opts) {
    opts = opts || {};
    var m = matrix(text), q = 4, n = m.size + 2 * q, path = '';
    for (var y = 0; y < m.size; y++) for (var x = 0; x < m.size; x++) if (m.modules[y][x]) path += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    var px = (opts.scale || 8) * n;
    // Always dark on white with a white quiet zone: phone cameras need that, whatever the colour mode.
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges"' +
      ' role="img" aria-label="' + String(opts.label || 'QR code').replace(/"/g, '&quot;') + '"><rect width="' + n + '" height="' + n + '" fill="#FFFFFF"/><path d="' + path + '" fill="#000000"/></svg>';
  }

  var api = { matrix: matrix, svg: svg };
  root.LitmusQR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
