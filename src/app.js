/* Interactive page: orbit camera, style switching with the painted transition, adaptive resolution. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var canvas = $('#view'), R;
  try { R = new BH.Renderer(canvas); BH.makeSeal(R, '視界'); }
  catch (e) {
    var er = $('#err'); er.hidden = false;
    er.innerHTML = '这台设备的浏览器不支持 WebGL2 浮点渲染，无法实时渲染黑洞。<br>请换用较新的 Chrome / Edge / Firefox，并确认已开启硬件加速。<br><span style="opacity:.5;font-size:13px">' + String(e.message || e) + '</span>';
    return;
  }

  var q = new URLSearchParams(location.search);
  var STYLE_IDS = { real: 0, physical: 0, vg: 1, vangogh: 1, ink: 2 };
  var style = STYLE_IDS[(q.get('style') || '').toLowerCase()] || 0;
  var cam = { dist: 52, incl: 83.5, az: -10, roll: -6, fov: 34, shift: [0, 0] };
  var goal = { dist: cam.dist, incl: cam.incl, az: cam.az };
  var trans = null;                 // { from, to, t0, dur }
  var gasT = 0, paused = false, drift = q.get('drift') !== '0', lastInput = -1e9;
  var showFps = q.has('fps'), scale = 1, ema = 16, frames = 0;
  if (q.get('cinema') === '1') document.body.classList.add('cinema');
  $('#fps').hidden = !showFps;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // ---------------------------------------------------------------- size
  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  function resize() {
    var w = Math.max(2, Math.round(innerWidth * dpr())), h = Math.max(2, Math.round(innerHeight * dpr()));
    R.resize(w, h, scale);
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- input
  var drag = null, pts = {};
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY];
    drag = { x: e.clientX, y: e.clientY, pinch: 0 }; canvas.classList.add('drag'); touch();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pts);
    if (ids.length >= 2) {            // pinch zoom
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (drag.pinch) goal.dist = clamp(goal.dist * drag.pinch / d, 14, 220);
      drag.pinch = d;
    } else if (drag) {
      goal.az -= (e.clientX - drag.x) * 0.25; goal.incl = clamp(goal.incl - (e.clientY - drag.y) * 0.25, 4, 176);
      drag.x = e.clientX; drag.y = e.clientY;
    }
    touch();
  });
  function up(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) { drag = null; canvas.classList.remove('drag'); } else if (drag) drag.pinch = 0; }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0012), 14, 220); touch(); }, { passive: false });
  canvas.addEventListener('dblclick', function () { goal.dist = 52; goal.incl = 83.5; touch(); });
  function touch() { lastInput = performance.now(); document.body.classList.add('quiet'); }

  function setStyle(s) {
    if (trans || s === style) return;
    trans = { from: style, to: s, t0: performance.now(), dur: 3600 };
    var bs = document.querySelectorAll('#styles button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', +bs[i].dataset.style === s);
  }
  $('#styles').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setStyle(+b.dataset.style); });
  addEventListener('keydown', function (e) {
    if (e.key >= '1' && e.key <= '3') setStyle(+e.key - 1);
    else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') document.body.classList.toggle('cinema');
    else if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  });
  var bs0 = document.querySelectorAll('#styles button');
  for (var i0 = 0; i0 < bs0.length; i0++) bs0[i0].classList.toggle('on', +bs0[i0].dataset.style === style);

  // compile the other style programs in the background so the first switch does not hitch
  var warm = [[0, 1], [1, 1], [1, 2], [2, 2], [2, 0], [1, 0], [0, 2], [2, 1]];
  function warmUp() {
    if (!warm.length) return;
    try { if (R.prepare(warm[0][0], warm[0][1])) warm.shift(); } catch (e) { console.error(e); warm.shift(); }
    setTimeout(warmUp, 250);
  }
  setTimeout(warmUp, 1200);

  // ---------------------------------------------------------------- loop
  var last = performance.now(), paper = 0;
  function tick(now) {
    var dt = Math.min(now - last, 100); last = now;
    if (!paused) gasT += dt / 1000;
    if (drift && !drag && now - lastInput > 2500) goal.az += dt * 0.0016;
    var k = 1 - Math.exp(-dt / 140);
    cam.dist += (goal.dist - cam.dist) * k; cam.incl += (goal.incl - cam.incl) * k; cam.az += (goal.az - cam.az) * k;

    var from = style, to = style, mix = 0;
    if (trans) {
      mix = (now - trans.t0) / trans.dur; from = trans.from; to = trans.to;
      if (mix >= 1) { style = trans.to; trans = null; from = to = style; mix = 0; }
    }
    // ink composition sits left of centre on wide screens; overlay colours follow the paper
    var wide = innerWidth / innerHeight > 1.3 ? 1 : 0;
    var inkAmt = (from === 2 ? 1 - sstep(0.1, 0.9, mix) : 0) + (to === 2 && from !== 2 ? sstep(0.1, 0.9, mix) : 0);
    if (from === 2 && to === 2) inkAmt = 1;
    cam.shift = [-0.34 * inkAmt * wide, 0.06 * inkAmt * wide];
    var pTarget = (to === 2 && (from === 2 || mix > 0.7)) || (from === 2 && mix < 0.5) ? 1 : 0;
    paper += (pTarget - paper) * (1 - Math.exp(-dt / 250));
    var rs = document.documentElement.style;
    rs.setProperty('--ink', [244 - 216 * paper, 241 - 216 * paper, 234 - 212 * paper].map(Math.round).join(','));
    rs.setProperty('--acc', [255 - 83 * paper, 122 - 88 * paper, 42 - 18 * paper].map(Math.round).join(','));

    R.render({ time: gasT, clock: now / 1000, flow: 9, cam: cam, from: from, to: to, mix: mix });

    // adaptive resolution: hold ~50 fps
    ema += (dt - ema) * 0.08; frames++;
    if (q.get('dyn') !== '0' && frames % 40 === 0) {
      var s = scale;
      if (ema > 24) s = Math.max(0.45, scale * 0.86); else if (ema < 13.5) s = Math.min(1, scale * 1.08);
      if (Math.abs(s - scale) > 0.03) { scale = s; resize(); }
    }
    if (frames % 12 === 0) {
      $('#tele').textContent = 'r ' + cam.dist.toFixed(1) + ' M    i ' + cam.incl.toFixed(1) + '°    t ' + ('00000' + Math.round(gasT * 9)).slice(-5) + ' M';
      if (showFps) $('#fps').textContent = (1000 / ema).toFixed(0) + ' fps   ×' + scale.toFixed(2) + '\n' + R.gpu;
    }
    requestAnimationFrame(tick);
  }
  setTimeout(function () { document.body.classList.add('quiet'); }, 9000);
  requestAnimationFrame(tick);
  window.__BH__ = { renderer: R, cam: cam, goal: goal, setStyle: setStyle };
})();
