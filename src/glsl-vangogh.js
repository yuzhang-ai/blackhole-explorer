/* Van Gogh style. Nothing here filters the realistic image: every stroke is laid out in the
 * object's own coordinates (disk radius/angle, lensed sky direction) and coloured from physics. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.vangogh = `
// ---------------------------------------------------------------- brush dab
struct Dab { float cov; float h; float id; float along; float cx; float birth; };

// One dab in a row/cell layout. x: position along the flow in cell units, fy: 0..1 across the row.
// n: wrap period in x (even; 0 = no wrap). Some neighbouring cells fuse into one long stroke.
Dab dabCell(float x, float fy, float row, float n, float seed){
  float rr = hash21(vec2(row, seed));
  float xs = x + rr * 17.0;
  float i = floor(xs);
  float i2 = floor(i * 0.5);
  float pw = n > 0.5 ? mod(i2, n * 0.5) : i2;
  float fuse = step(hash21(vec2(pw + 0.5, row * 1.37 + seed)), 0.45);
  float i0 = mix(i, i2 * 2.0, fuse), span = 1.0 + fuse;
  float iw = n > 0.5 ? mod(i0, n) : i0;
  vec3 rnd = hash33(vec3(iw, row, seed + 3.0 * fuse));
  float fx = (xs - i0) / span;
  float len = 0.82 + 0.17 * rnd.x, wid = 0.66 + 0.34 * rnd.y;
  float dx = (fx - 0.5) / (0.5 * len);
  float bend = (rnd.z - 0.5) * 0.22;
  float dy = (fy - 0.5 - (rnd.x - 0.5) * 0.16 - bend * (dx * dx - 0.35)) / (0.5 * wid);
  float br = vnoise(vec2(fx * span * 1.2 + rnd.x * 40.0, fy * 5.5 + rnd.y * 70.0));
  float e = pow(abs(dx), 8.0) + pow(abs(dy), 3.0) + 0.30 * (br - 0.5);
  Dab D;
  D.cov = 1.0 - smoothstep(0.82, 1.0, e);
  D.h = clamp((1.0 - e) * 2.5, 0.0, 1.0) * (0.35 + 0.65 * br);
  D.id = fract(rnd.z * 7.13 + rnd.x * 3.71);
  D.along = fx;
  D.cx = i0 + 0.5 * span - rr * 17.0;
  D.birth = fract(rnd.y * 5.31 + rnd.z * 9.17);
  return D;
}

vec3 ramp6(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f){
  t = clamp(t, 0.0, 1.0) * 5.0;
  return a + (b - a) * clamp(t, 0.0, 1.0) + (c - b) * clamp(t - 1.0, 0.0, 1.0) + (d - c) * clamp(t - 2.0, 0.0, 1.0)
           + (e - d) * clamp(t - 3.0, 0.0, 1.0) + (f - e) * clamp(t - 4.0, 0.0, 1.0);
}
vec3 vgDiskPal(float t){
  return ramp6(t, vec3(0.30, 0.10, 0.04), vec3(0.62, 0.25, 0.05), vec3(0.87, 0.47, 0.07),
                  vec3(0.96, 0.69, 0.13), vec3(0.99, 0.84, 0.30), vec3(1.00, 0.95, 0.68));
}
vec3 vgSkyPal(float t){
  return ramp6(t, vec3(0.020, 0.035, 0.11), vec3(0.04, 0.085, 0.27), vec3(0.07, 0.19, 0.50),
                  vec3(0.17, 0.38, 0.72), vec3(0.47, 0.68, 0.86), vec3(0.88, 0.91, 0.76));
}

const float VG_ASPECT = 4.2;
float vgWidPx(){ return 12.0 * uRes.y / 1080.0; }

// stroke appears when the local reveal passes its birth time; it is drawn along its length
float dabReveal(Dab D, float reveal, float lo, float hi){
  float t0 = mix(lo, hi, D.birth);
  return max(step(0.999, reveal), smoothstep(0.0, 0.04, (reveal - t0) - 0.10 * D.along));
}

// ---------------------------------------------------------------- disk
// rgb + coverage; 'h' receives the paint thickness
vec4 vgDiskAt(float r, float th, float ell, float chq, float lenT, float reveal, out float h){
  float rho = log(r);
  vec3 col = vec3(0.0); float cov = 0.0; h = 0.0;
  for (int L = 0; L < 2; L++){
    float fl = float(L);
    float y = rho / chq + 0.5 * fl;
    float row = floor(y);
    float rc = exp((row + 0.5 - 0.5 * fl) * chq);
    float m = floor(log2(max(TAU * rc / lenT, 1.0) / 3.0) + hash21(vec2(row, 4.0 + fl)));
    float n = 3.0 * exp2(clamp(m, 1.0, 14.0));
    float ang = th + pow(max(rc, 3.5), -1.5) * uSpin * uTime * uFlow * 0.32;
    Dab D = dabCell(ang / TAU * n, y - row, row, n, 3.0 + 5.0 * fl);
    // physics at the stroke: flux profile and Doppler beaming at its radius
    float q = uRin / max(rc, uRin * 0.9);
    float gq = sqrt(1.0 - 3.0 / max(rc, 3.3)) / (1.0 - pow(max(rc, 3.3), -1.5) * ell);
    float flux = pow(q, 1.25) * (1.0 - 0.50 * sqrt(q)) * 3.0 * pow(gq, 1.9);
    float tone = 1.0 - exp(-1.5 * flux);
    float band = vnoiseP(vec2(D.cx / n * 5.0, row * 0.61 + fl * 3.0), 5.0);
    float rowT = hash21(vec2(row, 9.0 + fl)) - 0.5;
    tone = clamp(tone * (0.70 + 0.60 * band) + rowT * 0.22 + (D.id - 0.5) * 0.22 - 0.13 * (1.0 - fl), 0.0, 1.0);
    vec3 c = vgDiskPal(tone);
    float acc = hash11(D.id * 91.3 + row);
    if (acc < 0.035) c = mix(c, vec3(0.16, 0.36, 0.62), 0.75);         // a stray blue stroke
    else if (acc > 0.96) c = mix(c, vec3(0.98, 0.93, 0.74), 0.7);      // a cream highlight
    c *= 0.90 + 0.20 * D.h;
    float a = D.cov * dabReveal(D, reveal, L == 0 ? 0.0 : 0.25, L == 0 ? 0.55 : 0.90);
    col = mix(col, c, a); h = mix(h, D.h + 0.4 * fl, a); cov = max(cov, a);
  }
  // ground colour fills the last gaps
  float gnd = reveal >= 0.999 ? 1.0 : smoothstep(0.70, 0.97, reveal);
  vec3 g0 = vec3(0.36, 0.15, 0.045);
  col = mix(g0, col, cov); cov = max(cov, gnd);
  return vec4(col, cov);
}
vec4 vgDisk(float r, float th, float ell, vec2 fp, float reveal, out float h){
  float ch = max(vgWidPx() * fp.x / r, 1e-5);
  float lf = log2(ch / 0.004), lev = floor(lf), f = lf - lev;
  float lenT = max(vgWidPx() * VG_ASPECT * fp.y, 1e-4);
  vec4 c = vgDiskAt(r, th, ell, 0.004 * exp2(lev), lenT, reveal, h);
  if (f > 0.72){
    float h1; vec4 c1 = vgDiskAt(r, th, ell, 0.004 * exp2(lev + 1.0), lenT, reveal, h1);
    float m = smoothstep(0.72, 1.0, f); c = mix(c, c1, m); h = mix(h, h1, m);
  }
  return c;
}

// ---------------------------------------------------------------- sky
vec3 cubeDir(float face, vec2 uv){
  vec3 v = face < 0.5 ? vec3(1.0, uv.x, uv.y) : face < 1.5 ? vec3(-1.0, uv.x, uv.y)
         : face < 2.5 ? vec3(uv.x, 1.0, uv.y) : face < 3.5 ? vec3(uv.x, -1.0, uv.y)
         : face < 4.5 ? vec3(uv.x, uv.y, 1.0) : vec3(uv.x, uv.y, -1.0);
  return normalize(v);
}
// rolling currents: strokes run along longitude, rows follow a wavy latitude
vec4 vgCurrentsAt(vec3 d, float chq, float lenT, float reveal, out float h){
  float lon = atan(d.z, d.x), lat = asin(clamp(d.y, -1.0, 1.0));
  float wave = 0.20 * sin(3.0 * lon + 0.6) + 0.08 * sin(7.0 * lon + 2.1) + 0.04 * sin(13.0 * lon + 4.0);
  vec3 col = vec3(0.0); float cov = 0.0; h = 0.0;
  for (int L = 0; L < 2; L++){
    float fl = float(L);
    float y = (lat - wave) / chq + 0.5 * fl;
    float row = floor(y);
    float yc = (row + 0.5 - 0.5 * fl) * chq;
    float m = floor(log2(TAU * max(cos(yc + wave), 0.2) / lenT / 8.0) + hash21(vec2(row, 6.0 + fl)));
    float n = 8.0 * exp2(clamp(m, 0.0, 14.0));
    float drift = uTime * 0.0022 * (hash21(vec2(row, 5.0)) - 0.25);
    Dab D = dabCell((lon / TAU + drift) * n, y - row, row, n, 21.0 + 5.0 * fl);
    float lonc = (D.cx / n - drift) * TAU;
    float wc = 0.20 * sin(3.0 * lonc + 0.6) + 0.08 * sin(7.0 * lonc + 2.1) + 0.04 * sin(13.0 * lonc + 4.0);
    float latc = yc + wc;
    vec3 dc = vec3(cos(latc) * cos(lonc), sin(latc), cos(latc) * sin(lonc));
    float crest = 0.5 + 0.5 * sin(yc * 12.0 + 2.0 * sin(2.0 * lonc + 1.0) + 1.3);
    float body = fbm3lo(dc * 2.4 + 3.0);
    float tone = 0.05 + 0.70 * pow(crest, 2.6) * smoothstep(0.34, 0.62, body) + 0.26 * body;
    tone = clamp(tone + (D.id - 0.5) * 0.26 - 0.20 * (1.0 - fl), 0.0, 1.0);
    vec3 c = vgSkyPal(tone);
    float acc = hash11(D.id * 57.7 + row * 1.3);
    if (acc < 0.008) c = mix(c, vec3(0.93, 0.80, 0.36), 0.8);          // a yellow fleck
    else if (acc > 0.93) c = mix(c, vec3(0.08, 0.36, 0.46), 0.6);      // teal
    c *= 0.88 + 0.24 * D.h;
    float a = D.cov * dabReveal(D, reveal, L == 0 ? 0.05 : 0.30, L == 0 ? 0.60 : 0.92);
    col = mix(col, c, a); h = mix(h, D.h + 0.4 * fl, a); cov = max(cov, a);
  }
  float gnd = reveal >= 0.999 ? 1.0 : smoothstep(0.72, 0.98, reveal);
  col = mix(vec3(0.020, 0.035, 0.10), col, cov); cov = max(cov, gnd);
  return vec4(col, cov);
}
// star whorls: concentric dashes around each star, yellow core to blue rim
vec4 vgWhorlAt(vec3 d, float chq, float reveal, out float h){
  h = 0.0;
  vec3 a = abs(d); vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z){ uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z){ uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 gp = (uv * 0.5 + 0.5) * 4.0, cell = floor(gp);
  vec3 hh = hash33(vec3(cell, face * 7.0 + 2.0));
  vec2 cuv = ((cell + 0.30 + 0.40 * hh.xy) / 4.0) * 2.0 - 1.0;
  vec3 c0 = cubeDir(face, cuv);
  float R = 0.070 + 0.090 * hh.z;
  vec3 e1 = normalize(cross(c0, abs(c0.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0))), e2 = cross(c0, e1);
  vec2 pv = vec2(dot(d, e1), dot(d, e2));
  float rs = length(pv);
  float on = step(0.12, hh.z) * step(rs, R * 1.25) * step(0.0, dot(d, c0));
  float y = rs / chq, row = floor(y), rc = (row + 0.5) * chq;
  float n = max(4.0, 2.0 * floor(PI * rc / (chq * VG_ASPECT * 0.8) + 0.5));
  float ang = atan(pv.y, pv.x) + uTime * 0.10 * (hh.x > 0.5 ? 1.0 : -1.0) * R / (rc + 0.35 * R);
  Dab D = dabCell(ang / TAU * n, y - row, row, n, 41.0 + hh.x * 9.0);
  float tn = rc / R;
  vec3 c = tn < 0.22 ? mix(vec3(1.0, 0.96, 0.72), vec3(0.98, 0.82, 0.30), tn / 0.22)
         : tn < 0.48 ? mix(vec3(0.98, 0.82, 0.30), vec3(0.93, 0.58, 0.14), (tn - 0.22) / 0.26)
         : tn < 0.74 ? mix(vec3(0.70, 0.78, 0.60), vec3(0.36, 0.58, 0.82), (tn - 0.48) / 0.26)
         :             mix(vec3(0.36, 0.58, 0.82), vec3(0.10, 0.24, 0.58), clamp((tn - 0.74) / 0.36, 0.0, 1.0));
  c = mix(c, c * (0.75 + 0.5 * D.id), 0.6);
  c *= 0.88 + 0.26 * D.h;
  float keep = 1.0 - smoothstep(0.78, 1.12, tn + (D.id - 0.5) * 0.35);
  float al = D.cov * keep * dabReveal(D, reveal, 0.35, 0.95) * on;
  h = D.h + 0.8;
  return vec4(c, al);
}
vec4 vgSkyLod(vec3 d, float chq, float lenT, float reveal, out float h){
  vec4 c = vgCurrentsAt(d, chq, lenT, reveal, h);
  float hw; vec4 w = vgWhorlAt(d, chq, reveal, hw);
  c.rgb = mix(c.rgb, w.rgb, w.a); h = mix(h, hw, w.a); c.a = max(c.a, w.a);
  return c;
}
vec4 vgSky(vec3 d, float skyFp, float reveal, out float h){
  // footprint of a pixel on the sky, split along / across the currents
  vec3 te = normalize(vec3(-d.z, 0.0, d.x)), tn = cross(d, te);
  float fAlong = length(vec2(dot(gSkyDx, te), dot(gSkyDy, te)));
  float fAcross = length(vec2(dot(gSkyDx, tn), dot(gSkyDy, tn)));
  float ch = clamp(1.5 * vgWidPx() * max(fAcross, 0.80 * skyFp), 1e-5, 0.2);
  float lenT = clamp(1.3 * vgWidPx() * VG_ASPECT * max(fAlong, 0.50 * skyFp), 1e-5, 1.0);
  float lf = log2(ch / 0.0008), lev = floor(lf), f = lf - lev;
  vec4 c = vgSkyLod(d, 0.0008 * exp2(lev), lenT, reveal, h);
  if (f > 0.72){
    float h1; vec4 c1 = vgSkyLod(d, 0.0008 * exp2(lev + 1.0), lenT, reveal, h1);
    float m = smoothstep(0.72, 1.0, f); c = mix(c, c1, m); h = mix(h, h1, m);
  }
  return c;
}

// the shadow: near-black strokes circling the hole, in screen space
vec4 vgShadow(vec2 sp, float reveal, out float h){
  vec2 v = sp - uHole; float rad = length(v);
  float chq = vgWidPx() * 2.4 / uRes.y;
  float y = rad / chq, row = floor(y), rc = (row + 0.5) * chq;
  float n = max(4.0, 2.0 * floor(PI * rc / (chq * VG_ASPECT) + 0.5));
  Dab D = dabCell(atan(v.y, v.x) / TAU * n, y - row, row, n, 77.0);
  vec3 c = mix(vec3(0.014, 0.018, 0.045), vec3(0.030, 0.042, 0.100), D.id * D.id);
  c *= 0.85 + 0.3 * D.h;
  float a = D.cov * dabReveal(D, reveal, 0.0, 0.5);
  float gnd = reveal >= 0.999 ? 1.0 : smoothstep(0.5, 0.9, reveal);
  h = D.h * a;
  return vec4(mix(vec3(0.008, 0.010, 0.025), c, a), max(a, gnd));
}

// ---------------------------------------------------------------- whole pixel
// is this crossing inside the painted disk? The edge is ragged so the silhouette is made of strokes.
float vgInDisk(float r, float th){
  float wob = vnoiseP(vec2(th / TAU * 9.0, log(max(r, 1.0)) * 6.0), 9.0) - 0.5;
  return step(uRin * (0.98 + 0.10 * wob), r) * step(r, uRout * (0.70 + 0.22 * wob));
}
vec4 paintVanGogh(Geo G, float skyFp, vec2 sp, float reveal){
  vec4 c = vec4(0.0); float h = 0.0, hk = 0.0;
  float in0 = vgInDisk(G.h0.r, G.h0.th), in1 = vgInDisk(G.h1.r, G.h1.th), in2 = vgInDisk(G.h2.r, G.h2.th);
  if (in0 > 0.5){
    c = vgDisk(G.h0.r, G.h0.th, G.ell, G.fp0, reveal, hk); h = hk + 1.0;
  } else if (in1 > 0.5){
    c = vgDisk(G.h1.r, G.h1.th, G.ell, G.fp1, reveal, hk); h = hk + 1.0;
  } else if (in2 > 0.5){
    c = vgDisk(G.h2.r, G.h2.th, G.ell, G.fp2, reveal, hk); h = hk + 1.0;
    c.rgb = mix(c.rgb, vec3(0.99, 0.80, 0.30), 0.5);
  } else if (G.escaped > 0.5){
    c = vgSky(G.sky, skyFp, reveal, hk); h = hk;
    // light bending piles the sky up against the hole: a warm rim where it is strongest
    float rim = exp(-max(G.b - B_CRIT, 0.0) / 0.22);
    c.rgb = mix(c.rgb, vec3(0.95, 0.66, 0.18) * (0.8 + 0.3 * hk), rim * 0.85);
  } else {
    c = vgShadow(sp, reveal, hk); h = hk;
  }
  vec3 col = c.rgb; float cov = c.a;
  // impasto: light the paint thickness from the upper left
  vec3 N = normalize(vec3(-dFdx(h), -dFdy(h), 0.55));
  vec3 Ld = normalize(vec3(-0.55, 0.65, 0.52));
  float diff = dot(N, Ld);
  float spec = pow(max(dot(N, normalize(Ld + vec3(0, 0, 1))), 0.0), 26.0);
  col *= 0.80 + 0.42 * diff;
  col += spec * 0.16;
  // canvas weave
  vec2 px = sp * uRes.y * 0.5;
  col *= 0.965 + 0.07 * (vnoise(px * vec2(0.9, 0.22)) * vnoise(px * vec2(0.22, 0.9)));
  return vec4(clamp(col, 0.0, 1.0), cov);
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
