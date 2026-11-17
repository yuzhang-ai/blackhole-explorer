/* Ink-wash style. Long dry-brush strokes follow the orbit; the brightest parts of the
 * picture are simply left as bare paper. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.ink = `
uniform sampler2D uSeal;    // carved seal (alpha = character), optional
uniform float uSealOn;

float inkWidPx(){ return 30.0 * uRes.y / 1080.0; }

vec3 inkPaper(vec2 sp){
  vec2 px = sp * uRes.y * 0.5 * (1080.0 / uRes.y);
  float blot = fbm(px * 0.004 + 3.0), fib = vnoise(px * vec2(0.035, 0.55)) * vnoise(px * vec2(0.5, 0.04) + 9.0);
  float grain = vnoise(px * 0.9);
  vec3 c = vec3(0.940, 0.902, 0.818);
  c *= 0.965 + 0.05 * blot + 0.035 * fib + 0.02 * grain;
  float asp = uRes.x / uRes.y;
  c *= 1.0 - 0.09 * smoothstep(0.55, 1.25, length(sp / vec2(asp, 1.0)) * 1.15);
  return c;
}

// One layer of long brush strokes on the disk. Rows are fixed in log r, so a stroke keeps
// its identity all the way round the orbit; perspective alone makes it swell and thin.
// rowPx: height of this row on screen, used to keep bristle lines a few pixels wide.
float inkStrokes(float rho, float th, float chq, float off, float seed, float env, float dryB, float rowPx, float reveal, vec2 px){
  float y = rho / chq + off;
  float row = floor(y), fy = y - row;
  float rc = exp((row + 0.5 - off) * chq);
  vec3 rr = hash33(vec3(row, seed, 1.0));
  float n = 2.0 + floor(rr.x * 1.99);
  float ang = th + pow(max(rc, 3.5), -1.5) * uSpin * uTime * uFlow * 0.42;
  float x = ang / TAU * n + rr.y * 17.0;
  float i = floor(x), fx = x - i;
  vec3 rnd = hash33(vec3(mod(i, n), row, seed + 5.0));
  float len = 0.62 + 0.37 * rnd.x;
  float u = fx / len;                       // 0 where the brush lands, 1 where it lifts
  float cat = rr.z, tone = 0.0;
  if (cat < 0.07) tone = 0.0;
  else if (cat < 0.60) tone = 0.90 + 0.10 * rnd.y;
  else if (cat < 0.86) tone = 0.56 + 0.22 * rnd.y;
  else tone = 0.28 + 0.14 * rnd.y;
  // width: lands, swells, tapers to a point
  float wd = pow(sin(PI * clamp(0.05 + 0.95 * u, 0.0, 1.0)), 0.32) * (0.82 + 0.18 * rnd.z);
  float wob = (vnoise(vec2(u * len * 7.0 + rnd.x * 30.0, row * 3.1)) - 0.5) * 0.14;
  float c = (fy - 0.5 - wob) / (0.5 * wd);
  // bristles: fine lines along the stroke; as the brush runs dry only the peaks print
  float B = max(rowPx / 2.8, 2.0), lb = log2(B), Bq = exp2(floor(lb));
  float along = ang * 2.2 + rnd.y * 50.0, across = fy + rnd.z * 7.0;
  float bris = mix(vnoise(vec2(along, across * Bq)), vnoise(vec2(along + 5.0, across * Bq * 2.0)), fract(lb));
  float tooth = vnoise(px * 0.55);
  float edge = 1.0 - smoothstep(0.70, 1.0, abs(c) + 0.30 * (bris - 0.5));
  float dry = clamp(dryB + (0.12 + 0.60 * rnd.z) * pow(clamp(u, 0.0, 1.0), 1.3) + 0.30 * (1.0 - env), 0.0, 0.95);
  float cover = smoothstep(dry - 0.22, dry + 0.14, bris * 0.82 + tooth * 0.36);
  float wetEdge = smoothstep(0.50, 0.92, abs(c)) * (1.0 - dry) * 0.20;
  float a = (tone + wetEdge * step(0.01, tone)) * edge * cover * env * step(u, 1.0);
  // drawn along its length as the transition passes
  if (reveal < 0.999){
    float t0 = 0.28 + 0.45 * fract(rnd.x * 7.7 + rnd.y * 3.3);
    a *= smoothstep(0.0, 0.03, (reveal - t0) / 0.22 - u);
  }
  return clamp(a, 0.0, 1.0);
}
float inkDisk(float r, float th, vec2 fp, float reveal, vec2 px){
  float rho = log(r);
  float x = (r - uRin) / (uRout * 0.72 - uRin);
  // lighter and sparser near the hole, driest at the rim
  float env = smoothstep(-0.02, 0.08, x) * (1.0 - smoothstep(0.86, 1.08, x)) * (0.80 + 0.20 * smoothstep(0.0, 0.25, x));
  float dryB = 0.07 + 0.40 * smoothstep(0.50, 1.0, x);
  float pxPerRho = r / max(fp.x, 1e-6);
  float a1 = inkStrokes(rho, th, 0.105, 0.0, 3.0, env, dryB, 0.105 * pxPerRho, reveal, px);
  float a2 = inkStrokes(rho, th, 0.178, 0.37, 8.0, env, dryB + 0.14, 0.178 * pxPerRho, reveal, px) * 0.85;
  return 1.0 - (1.0 - a1) * (1.0 - a2);
}

// distant hills and cloud, painted on the paper itself (screen space)
float ridge(float x, float f, float s){
  return 0.55 * vnoise(vec2(x * f + s, s)) + 0.28 * vnoise(vec2(x * f * 2.3 + s, 7.0)) + 0.17 * vnoise(vec2(x * f * 5.1, s + 3.0));
}
float inkLandscape(vec2 sp){
  float asp = uRes.x / uRes.y;
  float x = sp.x / asp, y = sp.y;         // x in -1..1
  float a = 0.0;
  float region = smoothstep(0.10, 0.55, x) * (1.0 - smoothstep(-0.50, -0.30, y));
  if (region > 0.0){
    float peak = exp(-pow((x - 0.70) / 0.16, 2.0));
    float y1 = -0.74 + 0.10 * ridge(x, 5.0, 1.0) + 0.05 * peak;
    float y2 = -0.82 + 0.13 * ridge(x, 7.0, 4.0) + 0.16 * peak;
    float y3 = -0.92 + 0.09 * ridge(x, 11.0, 8.0) + 0.05 * exp(-pow((x - 0.52) / 0.2, 2.0));
    float tex = 0.65 + 0.5 * fbm(sp * vec2(9.0, 22.0));
    float d1 = y1 - y, d2 = y2 - y, d3 = y3 - y;
    a = max(a, 0.16 * smoothstep(0.0, 0.012, d1) * exp(-max(d1, 0.0) / 0.10));
    a = max(a, 0.36 * tex * smoothstep(0.0, 0.008, d2) * exp(-max(d2, 0.0) / 0.075));
    // a stand of trees on the near peak: dark, broken blots along the crest
    float trees = smoothstep(0.50, 0.70, fbm(sp * vec2(60.0, 34.0))) * smoothstep(0.0, 0.006, d2) * exp(-max(d2, 0.0) / 0.035) * peak;
    a = max(a, 0.70 * trees);
    a = max(a, 0.20 * tex * smoothstep(0.0, 0.008, d3) * exp(-max(d3, 0.0) / 0.05));
    a *= region * smoothstep(-1.0, -0.90, y);
  }
  // cloud bank, upper right
  vec2 cq = vec2(x - 0.74, y - 0.62);
  float cr = 1.0 - smoothstep(0.10, 0.34, length(cq * vec2(1.0, 2.1)));
  if (cr > 0.0){
    float cl = fbm(vec2(x * 4.2 + uTime * 0.006, y * 8.5) + 2.0);
    float under = smoothstep(0.02, -0.10, cq.y + 0.06 * vnoise(vec2(x * 9.0, 2.0)));
    a = max(a, cr * smoothstep(0.42, 0.66, cl) * (0.08 + 0.14 * under));
  }
  return a;
}

// ink from one disk crossing: x = brush strokes, y = wash
vec2 inkHit(float r, float th, vec2 fp, float w, float inkR, vec2 px){
  float on = step(1.0, r);
  float rs = max(r, 1.0);
  float a = inkDisk(rs, th, fp, inkR, px) * w;
  // pale wet wash under the strokes, and a dry stipple that feathers the rim
  float x = (rs - uRin) / (uRout * 0.72 - uRin);
  float body = smoothstep(0.0, 0.15, x) * (1.0 - smoothstep(0.75, 1.0, x));
  float wn = vnoiseP(vec2(th / TAU * 7.0, log(rs) * 4.0), 7.0);
  float stip = smoothstep(0.86, 0.98, x) * (1.0 - smoothstep(1.00, 1.13, x));
  float grain = vnoise(px * 0.5) * 0.55 + vnoise(px * 1.3 + 7.0) * 0.45;
  stip *= 1.0 - smoothstep(0.004, 0.012, fp.x / rs);
  float wk = 0.14 * body * (0.5 + wn) + 0.36 * stip * smoothstep(0.56 + 0.22 * (1.0 - wn), 0.74, grain);
  return vec2(a, wk * w) * on;
}

vec4 paintInk(Geo G, float skyFp, vec2 sp, float reveal){
  vec2 px = sp * uRes.y * 0.5 * (1080.0 / uRes.y);
  vec3 paper = inkPaper(sp);
  float full = step(0.999, reveal);
  float inkR = mix(reveal, 1.0, full);

  float land = inkLandscape(sp) * max(full, smoothstep(0.45, 0.95, reveal));
  vec2 i0 = inkHit(G.h0.r, G.h0.th, G.fp0, 1.0, inkR, px);
  vec2 i1 = inkHit(G.h1.r, G.h1.th, G.fp1, 0.80, inkR, px);
  float disk = 1.0 - (1.0 - i0.x) * (1.0 - i1.x);
  float wash = max(i0.y, i1.y) * max(full, smoothstep(0.22, 0.60, reveal));
  float x0 = (G.h0.r - uRin) / (uRout * 0.72 - uRin);
  float front = step(1.0, G.h0.r) * step(0.0, x0) * step(x0, 1.0);

  // the hole itself: one loaded brush turned round, with a broken dry edge
  vec2 v = sp - uHole; float an = atan(v.y, v.x);
  float bn = vnoise(vec2(an * 3.5, G.b * 26.0)) * 0.65 + vnoise(vec2(an * 9.0 + 4.0, G.b * 60.0)) * 0.35;
  float tin = clamp((B_CRIT - G.b) / 0.55, 0.0, 1.0);         // 0 at the rim, 1 well inside
  float edge = smoothstep(0.30, 0.62, bn * 0.75 + tin * 1.25);
  float mott = 0.93 + 0.07 * vnoise(sp * 18.0 + 3.0);
  float hole = (1.0 - G.escaped) * edge * mott * mix(1.0, 0.62, front) * max(full, smoothstep(0.18, 0.50, reveal - 0.12 * bn));
  // photon ring: a single hair-line
  float ring = step(1.0, G.h2.r) * 0.55 * max(full, smoothstep(0.5, 0.7, reveal));

  float dark = 1.0 - (1.0 - disk) * (1.0 - hole) * (1.0 - wash) * (1.0 - land) * (1.0 - ring);
  vec3 inkCol = mix(vec3(0.36, 0.365, 0.38), vec3(0.070, 0.066, 0.062), smoothstep(0.15, 0.95, dark));
  vec3 col = mix(paper, inkCol * (0.92 + 0.16 * vnoise(px * 0.8)), dark);

  // seal
  float asp = uRes.x / uRes.y;
  vec2 sq = (sp - vec2(asp - 0.155, -0.845)) / 0.050;
  float inSeal = step(abs(sq.x), 1.0) * step(abs(sq.y), 1.0);
  float carveTex = textureLod(uSeal, clamp(sq * 0.5 + 0.5, 0.0, 1.0), 0.0).a;
  float carveBars = step(abs(fract(sq.x * 1.5 + 0.25) - 0.5), 0.14) * step(abs(sq.y), 0.7);
  float carve = mix(carveBars, carveTex, step(0.5, uSealOn));
  float worn = smoothstep(0.18, 0.40, vnoise(px * 0.35 + 40.0));
  float rim = 1.0 - smoothstep(0.90, 1.0, max(abs(sq.x), abs(sq.y)) + 0.05 * vnoise(px * 0.2));
  float sa = inSeal * rim * worn * (1.0 - carve) * max(full, smoothstep(0.85, 0.97, reveal));
  col = mix(col, vec3(0.70, 0.14, 0.10) * (0.9 + 0.2 * vnoise(px * 0.6)), sa * 0.92);

  float cov = max(full, smoothstep(0.0, 0.22, reveal + 0.10 * (fbm(sp * 6.0) - 0.5)));
  return vec4(col, cov);
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
