/* The star before the hole: a convecting stellar surface with corona, and the supernova shell
 * that follows its collapse. Same camera, same sky as the black-hole scene, so cuts between
 * the two keep every background star in place. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.cosmos = `
uniform float uClock;
uniform vec4  uStar;     // radius, temperature (K), activity 0..1, luminosity
uniform vec4  uNova;     // shell radius, shell width, amplitude, interior glow
uniform vec2  uCore;     // hot core / remnant: amplitude, radius
layout(location=0) out vec4 oHdr;
layout(location=1) out vec4 oPaint;

// Thin knotted filaments on a sphere: warped ridged noise, the way real remnants look in H-alpha.
float novaFilaments(vec3 d, float s){
  vec3 q = d * s + 1.5 * vec3(fbm3lo(d * 2.3 + 5.0), fbm3lo(d * 2.3 + 9.0), fbm3lo(d * 2.3 + 13.0));
  float n1 = fbm3(q), n2 = fbm3(q * 2.7 + 3.0);
  float r1 = 1.0 - clamp(abs(n1 - 0.5) * 11.0, 0.0, 1.0);      // thin lines along the noise contours
  float r2 = 1.0 - clamp(abs(n2 - 0.5) * 14.0, 0.0, 1.0);
  float knots = smoothstep(0.45, 0.70, fbm3lo(d * 5.0 + 21.0)); // some stretches are bright, some empty
  return (r1 * r1 * 1.0 + r2 * r2 * 0.45) * (0.25 + 1.3 * knots);
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y) - uShift;
  vec3 rd = normalize(uCamMat * vec3(p * uTanFov, 1.0));
  vec3 ro = uCamPos;
  vec3 col = skyReal(rd, uPixAngle);

  float tb = -dot(ro, rd);                       // closest approach of this ray to the centre
  vec3 pc = ro + rd * tb; float dmin = length(pc);
  vec3 pdir = pc / max(dmin, 1e-4);
  float front = step(0.0, tb);
  float t = uClock;

  // ---- the star. uStar.z = 0: hot massive star on the main sequence. Its outer layers carry energy
  // by radiation, so there is no boiling surface: a smooth, blinding blue-white disk and a fast wind.
  // uStar.z = 1: red supergiant. The whole envelope convects in a handful of enormous cells, the edge
  // is soft and lumpy, and it sheds dusty gas.
  float conv = uStar.z;
  float lump = 1.0 + conv * 0.07 * (fbm3lo(pdir * 1.4 + vec3(0.0, t * 0.012, 0.0)) - 0.5) * 2.0;
  float R = max(uStar.x, 1e-3) * lump, on = step(2e-3, uStar.x) * front;
  float h2 = R * R - dmin * dmin;
  float soft = mix(0.004, 0.05, conv) * R;
  float hit = smoothstep(-soft, soft, R - dmin) * on;
  vec3 n = normalize(pc - rd * sqrt(max(h2, 0.0)));
  float mu = clamp(dot(n, -rd), 0.0, 1.0);
  // giant cells: warped so they read as upwellings with dark lanes between, slowly turning over
  vec3 wq = n * 1.9 + 0.7 * vec3(fbm3lo(n * 1.5 + vec3(t * 0.020, 0.0, 3.0)), fbm3lo(n * 1.5 + vec3(7.0, -t * 0.017, 0.0)), fbm3lo(n * 1.5 + 13.0));
  float giant = fbm3(wq + vec3(0.0, t * 0.030, 0.0));
  float cellT = smoothstep(0.26, 0.74, giant);
  float mid = fbm3(n * 7.0 + vec3(t * 0.05, giant * 2.5, -t * 0.04));
  float fineS = fbm3(n * 24.0 + vec3(-t * 0.07, 2.0, t * 0.06));
  float shimmer = fbm3(n * 8.0 + vec3(t * 0.10, -t * 0.07, 0.0));
  float Tmod = mix(0.97 + 0.06 * shimmer, 0.84 + 0.24 * cellT + 0.14 * (mid - 0.5), conv);
  float Imod = mix(0.90 + 0.20 * shimmer, 0.30 + 0.95 * cellT + 0.60 * (mid - 0.5) + 0.30 * (fineS - 0.5), conv);
  float limb = mix(0.36 + 0.64 * pow(mu, 0.55), 0.20 + 0.80 * pow(mu, 0.8), conv);
  vec3 bb = blackbody(uStar.y * Tmod);
  bb = mix(bb, bb * bb * 1.4, 0.35 * conv);              // deeper reds in the cool lanes
  vec3 surf = bb * limb * max(Imod, 0.04) * uStar.w;
  col = mix(col, surf, hit);
  // what streams off it: a fast, thin, radial wind (hot star) or slow dusty clumps (supergiant)
  float x = max(dmin - R, 0.0) / R;
  float stream = fbm3(pdir * 4.0 + vec3(0.7, 0.4, 0.6) * (x * 2.2 - t * 0.22));
  float wisp = fbm3(pdir * 13.0 + vec3(0.5, 0.8, 0.3) * (x * 5.0 - t * 0.50));
  float corHot = (0.50 * exp(-x * 7.0) + 0.24 * exp(-x * 2.0) * (0.25 + 1.7 * stream * stream) + 0.05 * exp(-x * 0.6)) * (0.55 + 0.9 * wisp);
  float corCool = 0.34 * exp(-x * 6.0) + 0.16 * exp(-x * 1.5) * (0.10 + 2.4 * stream * stream * stream) * (0.5 + wisp);
  col += blackbody(uStar.y * mix(0.95, 0.80, conv)) * mix(corHot, corCool, conv) * uStar.w * on * (1.0 - hit);

  // ---- supernova: a spherical shell of torn gas, seen through its near and far walls
  float w = max(uNova.y, 1e-3);
  float Rs = max(uNova.x, 1e-3) * (0.92 + 0.30 * (fbm3lo(pdir * 1.3 + 2.0) - 0.26));   // lumpy, not a perfect sphere
  float hs = sqrt(max(Rs * Rs - dmin * dmin, 0.0));
  vec3 pf = (pc - rd * hs) / Rs, pb = (pc + rd * hs) / Rs;
  float inside = 1.0 - smoothstep(Rs - 0.6 * w, Rs + 0.4 * w, dmin);
  float limbGain = 1.0 / max(hs / Rs, 0.22);                 // longer path through the shell near its edge
  float gas = (novaFilaments(pf, 3.2) + novaFilaments(pb, 3.2)) * limbGain * inside;
  float haze = (fbm3(pf * 2.1 + 4.0) + fbm3(pb * 2.1 + 4.0)) * 0.5 * inside;
  vec3 fcol = mix(vec3(1.0, 0.30, 0.10), vec3(1.0, 0.82, 0.70), clamp(gas * 0.6, 0.0, 1.0));
  col += uNova.z * front * (fcol * gas * 0.42 + vec3(0.10, 0.46, 0.52) * haze * haze * 0.20 * limbGain);
  // the shock front runs ahead of the gas: one thin, cold-blue ring
  float shock = exp(-pow((dmin - Rs * 1.08) / (0.14 * w), 2.0));
  col += uNova.z * front * vec3(0.62, 0.80, 1.0) * shock * (0.10 + 0.9 * pow(fbm3(pdir * 3.0 + 2.0), 2.0)) * 0.8;
  // hot interior, fading as it thins
  col += uNova.w * front * vec3(1.0, 0.78, 0.58) * exp(-dmin / (0.22 * Rs)) * 0.6;

  // ---- collapsing core / remnant
  float cr = max(uCore.y, 1e-3);
  col += vec3(1.0, 0.95, 0.90) * uCore.x * front * (exp(-dmin * dmin / (cr * cr)) + 0.04 / (1.0 + pow(dmin / cr, 2.0)));

  oHdr = vec4(col, 1.0);
  oPaint = vec4(0.0);
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
