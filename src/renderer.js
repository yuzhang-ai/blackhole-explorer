/* WebGL2 plumbing: geodesic textures, scene pass (HDR + paint targets), bloom, composite. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};

  var DEFAULTS = {
    time: 0,
    cam: { dist: 50, incl: 83.5, az: 0, roll: -6, fov: 34, shift: [0, 0] },
    from: 0, to: 0, mix: 0, build: 3,
    spin: 1, flow: 1.0, rin: 5.6, rout: 32,
    gain: 2.6, temp: 5400, doppler: 2.4, starGain: 1.15,
    exposure: 0.9, bloom: 0.55, grain: 0.03, vignette: 0.5, ca: 0.004, fade: 1,
    flash: 0, grade: 0, debris: 0, glow: 0, scene: 'hole',
    star: { r: 10, temp: 6500, act: 0.3, lum: 1.3, novaR: 0, novaW: 1, novaAmp: 0, coreAmp: 0, coreR: 0.5 }
  };

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      var lines = src.split('\n');
      var m = /ERROR: \d+:(\d+)/.exec(log), ctx = '';
      if (m) { var n = +m[1]; ctx = '\n' + lines.slice(Math.max(0, n - 3), n + 2).map(function (l, i) { return (Math.max(0, n - 3) + i + 1) + ': ' + l; }).join('\n'); }
      throw new Error('shader compile failed: ' + log + ctx);
    }
    return s;
  }
  // start(): hand the sources to the driver without waiting. finish(): wait, check, list uniforms.
  // With KHR_parallel_shader_compile the driver compiles on its own threads in between.
  function start(gl, vs, fs) {
    var p = gl.createProgram(), v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(v, vs); gl.compileShader(v); gl.shaderSource(f, fs); gl.compileShader(f);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    return { p: p, v: v, f: f, fs: fs, u: null };
  }
  function finish(gl, P) {
    if (P.u) return P;
    if (!gl.getProgramParameter(P.p, gl.LINK_STATUS)) {
      var log = gl.getShaderInfoLog(P.f) || gl.getShaderInfoLog(P.v) || gl.getProgramInfoLog(P.p) || '';
      var m = /ERROR: \d+:(\d+)/.exec(log), ctx = '';
      if (m) { var n = +m[1], lines = P.fs.split('\n'); ctx = '\n' + lines.slice(Math.max(0, n - 3), n + 2).map(function (l, i) { return (Math.max(0, n - 3) + i + 1) + ': ' + l; }).join('\n'); }
      throw new Error('shader compile failed: ' + log + ctx);
    }
    var u = {}, n2 = gl.getProgramParameter(P.p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n2; i++) { var info = gl.getActiveUniform(P.p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(P.p, info.name); }
    P.u = u;
    return P;
  }
  function program(gl, vs, fs) { return finish(gl, start(gl, vs, fs)); }

  function Renderer(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float'))
      throw new Error('float render targets are not available');
    this.gl = gl; this.canvas = canvas; this.aux = {};
    this.ss = opts.supersample || 1;
    this.gpu = (function () { var e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })();

    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // geodesic tables
    var geo = BH.geodesic.build(), cfg = geo.cfg;
    this.geoCfg = [cfg.CN, cfg.CP, cfg.K, cfg.PSI_MAX];
    var end = new Float32Array(geo.END.length);
    for (var i = 0; i < end.length; i++) end[i] = Math.min(geo.END[i], 20);
    this.texU = this._dataTex(cfg.NPSI, cfg.NB, geo.U);
    this.texEnd = this._dataTex(cfg.NB, 1, end);

    this.scenePrograms = {};
    this._bakeSky();
    var g = BH.glsl;
    this.pDown = program(gl, g.vertex, g.down);
    this.pUp = program(gl, g.vertex, g.up);
    this.pComp = program(gl, g.vertex, g.composite);
    this.w = 0; this.h = 0;
  }

  // One scene program per (from, to) style pair, compiled on first use.
  Renderer.prototype._sceneSource = function (a, b) {
    var g = BH.glsl, uses = function (id) { return a === id || b === id; };
    return '#version 300 es\n#define SA ' + a + '\n#define SB ' + b + '\n' + g.common + g.real +
      (uses(1) ? g.vangogh : '') + (uses(2) ? g.ink : '') + g.styleFns + g.sceneMain.replace('STYLE_BODY', g.styleBody);
  };
  Renderer.prototype.sceneProgram = function (a, b) {
    var key = a + '-' + b, P = this.scenePrograms[key];
    if (!P) P = this.scenePrograms[key] = start(this.gl, BH.glsl.vertex, this._sceneSource(a, b));
    return finish(this.gl, P);
  };
  // Begin compiling a pair in the background. Returns true once it is ready to use without a stall.
  Renderer.prototype.prepare = function (a, b) {
    var gl = this.gl, key = a + '-' + b, P = this.scenePrograms[key];
    if (!P) { P = this.scenePrograms[key] = start(gl, BH.glsl.vertex, this._sceneSource(a, b)); return false; }
    if (P.u) return true;
    var ext = this._par === undefined ? (this._par = gl.getExtension('KHR_parallel_shader_compile')) : this._par;
    if (ext && !gl.getProgramParameter(P.p, ext.COMPLETION_STATUS_KHR)) return false;
    finish(gl, P);
    return true;
  };

  Renderer.prototype._bakeSky = function () {
    var gl = this.gl, g = BH.glsl, W = 2048, H = 1024;
    var P = program(gl, g.vertex, '#version 300 es\n' + g.common + g.skyBake);
    var t = this._target(W, H, 1);
    gl.bindTexture(gl.TEXTURE_2D, t.tex[0]); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, W, H);
    gl.useProgram(P.p); gl.uniform2f(P.u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteProgram(P.p);
    this.aux.uSkyTex = t.tex[0];
  };

  Renderer.prototype._dataTex = function (w, h, data) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  Renderer.prototype._target = function (w, h, n) {
    var gl = this.gl, fb = gl.createFramebuffer(), tex = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    for (var i = 0; i < n; i++) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t);
    }
    gl.drawBuffers(tex.map(function (_, i) { return gl.COLOR_ATTACHMENT0 + i; }));
    return { fb: fb, tex: tex, w: w, h: h };
  };
  Renderer.prototype._free = function (t) {
    if (!t) return; var gl = this.gl;
    t.tex.forEach(function (x) { gl.deleteTexture(x); }); gl.deleteFramebuffer(t.fb);
  };

  // Output size in device pixels; the scene renders at ss x that.
  Renderer.prototype.resize = function (w, h, ss) {
    if (ss) this.ss = ss;
    var sw = Math.max(2, Math.round(w * this.ss)), sh = Math.max(2, Math.round(h * this.ss));
    if (w === this.w && h === this.h && this.scene && this.scene.w === sw && this.scene.h === sh) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    var self = this;
    this._free(this.scene); (this.down || []).forEach(function (t) { self._free(t); }); (this.upT || []).forEach(function (t) { self._free(t); });
    this.scene = this._target(sw, sh, 2);
    this.down = []; this.upT = [];
    var bw = sw, bh = sh;
    for (var i = 0; i < 7; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      this.down.push(this._target(bw, bh, 1)); this.upT.push(this._target(bw, bh, 1));
      if (bw <= 4 || bh <= 4) break;
    }
  };

  Renderer.prototype.cameraBasis = function (cam) {
    var inc = Math.max(1.5, Math.min(178.5, cam.incl)) * Math.PI / 180, az = cam.az * Math.PI / 180;
    var pos = [cam.dist * Math.sin(inc) * Math.cos(az), cam.dist * Math.cos(inc), cam.dist * Math.sin(inc) * Math.sin(az)];
    var f = [-pos[0] / cam.dist, -pos[1] / cam.dist, -pos[2] / cam.dist];
    var r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];   // f x (0,1,0)
    r = [-f[2], 0, f[0]]; var rl = Math.hypot(r[0], r[1], r[2]); r = [r[0] / rl, r[1] / rl, r[2] / rl];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var ro = (cam.roll || 0) * Math.PI / 180, c = Math.cos(ro), s = Math.sin(ro);
    var r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    var u2 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    return { pos: pos, mat: [r2[0], r2[1], r2[2], u2[0], u2[1], u2[2], f[0], f[1], f[2]] };
  };

  Renderer.prototype.render = function (st) {
    var gl = this.gl, S = {}, k;
    for (k in DEFAULTS) S[k] = DEFAULTS[k];
    for (k in st) S[k] = st[k];
    var cam = {}; for (k in DEFAULTS.cam) cam[k] = DEFAULTS.cam[k]; for (k in (st.cam || {})) cam[k] = st.cam[k];
    var cb = this.cameraBasis(cam), tanFov = Math.tan(cam.fov * Math.PI / 360);
    var from = S.from, to = S.to;
    if (S.mix <= 0) to = from; else if (S.mix >= 1) from = to;
    var sc = this.scene, P, u;
    if (S.scene === 'star') {
      if (!this.pCosmos) this.pCosmos = program(gl, BH.glsl.vertex, '#version 300 es\n' + BH.glsl.common + BH.glsl.real.replace(/vec3 extrasReal[\s\S]*$/, '') + BH.glsl.cosmos);
      P = this.pCosmos;
    } else P = this.sceneProgram(from, to);
    u = P.u;

    if (!S.postOnly) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sc.fb); gl.viewport(0, 0, sc.w, sc.h);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texU); gl.uniform1i(u.uGeoU, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texEnd); gl.uniform1i(u.uGeoEnd, 1);
    var ti = 2;
    for (k in this.aux) { gl.activeTexture(gl.TEXTURE0 + ti); gl.bindTexture(gl.TEXTURE_2D, this.aux[k]); if (u[k]) gl.uniform1i(u[k], ti); ti++; }
    gl.uniform2f(u.uRes, sc.w, sc.h); gl.uniform1f(u.uTime, S.time);
    gl.uniform3fv(u.uCamPos, cb.pos); gl.uniformMatrix3fv(u.uCamMat, false, cb.mat);
    gl.uniform1f(u.uTanFov, tanFov); gl.uniform2f(u.uShift, cam.shift[0], cam.shift[1]);
    gl.uniform2f(u.uHole, cam.shift[0], cam.shift[1]);
    gl.uniform4fv(u.uGeoCfg, this.geoCfg);
    gl.uniform1f(u.uSpin, S.spin); gl.uniform1f(u.uFlow, S.flow); gl.uniform1f(u.uRin, S.rin); gl.uniform1f(u.uRout, S.rout);
    gl.uniform1f(u.uGain, S.gain); gl.uniform1f(u.uTemp, S.temp); gl.uniform1f(u.uDoppler, S.doppler);
    gl.uniform1f(u.uStarGain, S.starGain); gl.uniform1f(u.uPixAngle, 2 * tanFov / sc.h);
    var clock = S.clock === undefined ? S.time : S.clock;
    gl.uniform1f(u.uWall, clock); gl.uniform1f(u.uDebris, S.debris); gl.uniform1f(u.uGlow, S.glow);
    if (S.scene === 'star') {
      var st = S.star;
      gl.uniform1f(u.uClock, clock); gl.uniform4f(u.uStar, st.r, st.temp, st.act, st.lum);
      gl.uniform4f(u.uNova, st.novaR, st.novaW, st.novaAmp, st.novaIn || 0); gl.uniform2f(u.uCore, st.coreAmp, st.coreR);
    }
    if (u.uSealOn) gl.uniform1f(u.uSealOn, this.aux.uSeal ? 1 : 0);
    if (u.uMix) gl.uniform1f(u.uMix, S.mix); if (u.uBuild) gl.uniform1f(u.uBuild, S.build);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (S.sceneOnly) return;

    // bloom: downsample chain
    var src = sc.tex[0], sw = sc.w, sh = sc.h, D = this.down, U = this.upT, i;
    gl.useProgram(this.pDown.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.pDown.u.uTex, 0);
    for (i = 0; i < D.length; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, D[i].fb); gl.viewport(0, 0, D[i].w, D[i].h);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform2f(this.pDown.u.uTexel, 1 / sw, 1 / sh); gl.uniform2f(this.pDown.u.uOutTexel, 1 / D[i].w, 1 / D[i].h);
      gl.uniform1f(this.pDown.u.uFirst, i === 0 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = D[i].tex[0]; sw = D[i].w; sh = D[i].h;
    }
    // upsample and accumulate: tight glow from fine levels, wide haze from coarse ones
    var W = [0.30, 0.30, 0.20, 0.10, 0.05, 0.03, 0.02];
    gl.useProgram(this.pUp.p); gl.uniform1i(this.pUp.u.uTex, 0); gl.uniform1i(this.pUp.u.uAdd, 1);
    var last = D.length - 1, prev = D[last];
    for (i = last - 1; i >= 0; i--) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, U[i].fb); gl.viewport(0, 0, U[i].w, U[i].h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev.tex[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, D[i].tex[0]);
      gl.uniform2f(this.pUp.u.uTexel, 1 / prev.w, 1 / prev.h); gl.uniform2f(this.pUp.u.uOutTexel, 1 / U[i].w, 1 / U[i].h);
      gl.uniform1f(this.pUp.u.uW, W[i]); gl.uniform1f(this.pUp.u.uWPrev, i === last - 1 ? (W[last] || 0) : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      prev = U[i];
    }

    // composite to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h);
    var C = this.pComp; gl.useProgram(C.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sc.tex[0]); gl.uniform1i(C.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sc.tex[1]); gl.uniform1i(C.u.uPaint, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, prev.tex[0]); gl.uniform1i(C.u.uBloom, 2);
    gl.uniform2f(C.u.uOutRes, this.w, this.h); gl.uniform1f(C.u.uExposure, S.exposure); gl.uniform1f(C.u.uBloomStr, S.bloom);
    gl.uniform1f(C.u.uGrain, S.grain); gl.uniform1f(C.u.uVignette, S.vignette); gl.uniform1f(C.u.uTime, S.clock === undefined ? S.time : S.clock);
    gl.uniform1f(C.u.uFade, S.fade); gl.uniform1f(C.u.uCA, S.ca);
    gl.uniform1f(C.u.uFlash, S.flash); gl.uniform1f(C.u.uGrade, S.grade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  BH.Renderer = Renderer; BH.DEFAULTS = DEFAULTS;
})(typeof window !== 'undefined' ? window : globalThis);
