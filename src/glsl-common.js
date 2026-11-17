/* Shared GLSL: uniforms, hashes, noise, geodesic lookups, camera ray set-up. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.vertex = `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  BH.glsl.common = `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2  uRes;        // render target size in pixels
uniform float uTime;       // seconds
uniform vec3  uCamPos;     // camera position, units of M
uniform mat3  uCamMat;     // columns: right, up, forward
uniform float uTanFov;     // tan(vertical fov / 2)
uniform vec2  uShift;      // framing offset in NDC-height units
uniform vec2  uHole;       // hole centre on screen, NDC-height units
uniform sampler2D uGeoU;   // u(b, psi)
uniform sampler2D uGeoEnd; // psi_end(b)
uniform vec4  uGeoCfg;     // CN, CP, K, PSI_MAX

uniform float uSpin;       // +1 / -1 : which way the gas orbits
uniform float uFlow;       // gas time scale
uniform float uRin;        // inner edge of the disk (M)
uniform float uRout;       // outer edge of the disk (M)
uniform float uMix;        // 0..1 style transition progress
uniform float uWall;       // wall-clock seconds (uTime is gas time and can be frozen)
uniform float uDebris;     // remnant gas falling back onto the new hole
uniform float uGlow;       // point of light at the hole (its last moment)
uniform float uBuild;      // explainer build-up: 1 plain grid disk, 2 + heat and Doppler, 3 + flowing gas

vec3 gSkyDx, gSkyDy;      // screen-space derivatives of the lensed sky direction (set in main)

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float B_CRIT = 5.19615242271;

// ---------------------------------------------------------------- hashes
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3  hash23(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float hash31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3  hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }

// ---------------------------------------------------------------- noise
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
// value noise that wraps in x with integer period 'per' (for the angle around the disk)
float vnoiseP(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
  return mix(mix(hash21(vec2(x0, i.y)), hash21(vec2(x1, i.y)), f.x),
             mix(hash21(vec2(x0, i.y + 1.0)), hash21(vec2(x1, i.y + 1.0)), f.x), f.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; } return s; }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise3(p); p = p * 2.02 + 9.1; a *= 0.5; } return s; }
float fbm3lo(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise3(p); p = p * 2.02 + 9.1; a *= 0.5; } return s; }

// ---------------------------------------------------------------- geodesic table
float bToS(float b){
  float t = b < B_CRIT ? -log(1.0 + (B_CRIT - b) / uGeoCfg.x) : log(1.0 + (b - B_CRIT) / uGeoCfg.y);
  return clamp(0.5 + 0.5 * t / uGeoCfg.z, 0.0, 1.0);
}
float geoU(float s, float psi){
  vec2 sz = vec2(textureSize(uGeoU, 0));
  vec2 p = vec2(psi / uGeoCfg.w * (sz.x - 1.0), s * (sz.y - 1.0));
  p = clamp(p, vec2(0.0), sz - 1.001);
  ivec2 i = ivec2(p); vec2 f = p - vec2(i);
  float a = texelFetch(uGeoU, i, 0).r,               b = texelFetch(uGeoU, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uGeoU, i + ivec2(0, 1), 0).r, d = texelFetch(uGeoU, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float geoEnd(float s){
  float n = float(textureSize(uGeoEnd, 0).x);
  float p = clamp(s * (n - 1.0), 0.0, n - 1.001);
  int i = int(p);
  return mix(texelFetch(uGeoEnd, ivec2(i, 0), 0).r, texelFetch(uGeoEnd, ivec2(i + 1, 0), 0).r, p - float(i));
}
// Orbital angle swept between infinity and an observer at u0 = 1/r0:
//     psi0 = Integral[0..u0] du / sqrt(1/b^2 - u^2 (1 - 2u))
// The substitution u = u0 (1 - t^2) removes the square-root singularity that appears when the
// ray is tangential at the observer, so the same 8-point rule works from far away down to r0 ~ 2.
float psiTerm(float t, float w, float u0, float ib2){
  float u = u0 * (1.0 - t * t);
  return w * 2.0 * u0 * t / sqrt(max(ib2 - u * u * (1.0 - 2.0 * u), 1e-9));
}
float psi0(float b, float u0){
  float ib2 = 1.0 / max(b * b, 1e-8);
  return psiTerm(0.01985507, 0.05061427, u0, ib2) + psiTerm(0.10166676, 0.11119052, u0, ib2)
       + psiTerm(0.23723380, 0.15685332, u0, ib2) + psiTerm(0.40828268, 0.18134189, u0, ib2)
       + psiTerm(0.59171732, 0.18134189, u0, ib2) + psiTerm(0.76276620, 0.15685332, u0, ib2)
       + psiTerm(0.89833324, 0.11119052, u0, ib2) + psiTerm(0.98014493, 0.05061427, u0, ib2);
}

// ---------------------------------------------------------------- per-pixel geometry
// Everything a style needs to draw the pixel. Styles never guess geometry from colour.
struct Hit {
  float r;         // radius of a disk crossing (0 = no crossing)
  float th;        // azimuth on the disk
  float g;         // redshift factor (>1 approaching)
  vec3  P;         // crossing position
};
struct Geo {
  vec3  dir;       // camera ray
  float b;         // impact parameter
  float escaped;   // 1: ray reaches the sky
  vec3  sky;       // lensed sky direction (valid if escaped)
  float ell;       // photon angular momentum about the disk axis
  Hit   h0, h1, h2;    // disk crossings, nearest first
  float fr0, fr1;      // log r covered by one pixel at crossings 0 and 1   (filled in main)
  vec2  fp0, fp1, fp2; // pixel footprint on the disk: (radial, along orbit) (filled in main)
};

// k-th crossing of the disk plane. Written without loops, early exits or array writes:
// Direct3D's shader compiler rejects those combinations.
// inw = 1: the ray heads inward from the camera, 0: it heads outward.
Hit crossing(float k, float s, float ps0, float phi1, float psLimit, vec3 er, vec3 ey, float ell, float ok, float inw){
  float phi = phi1 + k * PI;
  float psi = mix(ps0 - phi, ps0 + phi, inw);
  float u = geoU(s, max(psi, 0.0));
  float valid = ok * step(1e-5, psi) * step(psi, psLimit - 1e-5) * step(1e-6, u) * step(u, 0.4999);
  float r = 1.0 / clamp(u, 1e-3, 0.5);
  vec3 P = r * (cos(phi) * er + sin(phi) * ey);
  float rr = max(r, 3.3);
  Hit H;
  H.r = r * valid; H.P = P * valid; H.th = atan(P.z, P.x);
  H.g = mix(1.0, sqrt(1.0 - 3.0 / rr) / (1.0 - pow(rr, -1.5) * ell), valid);
  return H;
}

Geo traceGeo(vec2 fragCoord){
  Geo G;
  vec2 p = (fragCoord - 0.5 * uRes) / (0.5 * uRes.y) - uShift;
  vec3 d = normalize(uCamMat * vec3(p * uTanFov, 1.0));
  G.dir = d;
  float r0 = length(uCamPos); vec3 er = uCamPos / r0; float u0 = 1.0 / r0;
  float ca = dot(d, -er), sa = sqrt(max(1.0 - ca * ca, 0.0));
  vec3 ey = d + ca * er; ey /= max(length(ey), 1e-6);
  float b = r0 * sa / sqrt(1.0 - 2.0 * u0);
  G.b = b;
  float inw = step(0.0, ca);                   // 1: looking inward, 0: looking outward
  float outer = step(B_CRIT, b);               // 1: on an orbit that turns round outside the photon sphere
  float deep = step(r0, 3.0);                  // 1: camera is inside the photon sphere

  float s = bToS(b);
  float ps0 = psi0(b, u0);
  float psEnd = b < 49.5 ? geoEnd(s) : PI + 4.0 / b + 11.78097 / (b * b);
  // inward rays escape if they swing round the hole; outward rays escape unless trapped below r = 3
  float escIn = outer * (1.0 - deep) * step(psEnd, uGeoCfg.w - 1e-4);
  float escOut = 1.0 - outer * deep;
  G.escaped = mix(escOut, escIn, inw);
  float phiEnd = mix(ps0, psEnd - ps0, inw);
  G.sky = cos(phiEnd) * er + sin(phiEnd) * ey;

  // disk plane y = 0 cuts this orbital plane at phi1 + k*pi
  float phi1 = atan(-er.y, ey.y); if (phi1 < 0.0) phi1 += PI;
  vec3 cr = cross(er, d);
  G.ell = -b * cr.y / max(length(cr), 1e-6) * uSpin;
  float ok = step(b, 49.5) * (1.0 - outer * deep);
  float lim = mix(ps0 + 1.0, min(mix(1e3, psEnd, outer), uGeoCfg.w), inw);
  G.h0 = crossing(0.0, s, ps0, phi1, lim, er, ey, G.ell, ok, inw);
  G.h1 = crossing(1.0, s, ps0, phi1, lim, er, ey, G.ell, ok, inw);
  G.h2 = crossing(2.0, s, ps0, phi1, lim, er, ey, G.ell, ok, inw);
  G.fr0 = 0.0; G.fr1 = 0.0; G.fp0 = vec2(0.0); G.fp1 = vec2(0.0); G.fp2 = vec2(0.0);
  return G;
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
