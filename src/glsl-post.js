/* Scene entry point, bloom chain and final composite. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  // Scene pass. Target 0: scene-referred HDR (realistic). Target 1: display-referred paint (premultiplied).
  BH.glsl.sceneMain = `
layout(location=0) out vec4 oHdr;
layout(location=1) out vec4 oPaint;

// how much disk one pixel covers at a crossing: (radial, along the orbit)
vec2 footprint(vec3 P, float r, vec3 dx, vec3 dy){
  vec3 Ph = P / max(r, 1e-3);
  vec3 tg = vec3(-Ph.z, 0.0, Ph.x);
  return vec2(length(vec2(dot(dx, Ph), dot(dy, Ph))), length(vec2(dot(dx, tg), dot(dy, tg))));
}

void main(){
  Geo G = traceGeo(gl_FragCoord.xy);
  // screen-space derivatives are all taken here, at the top level
  G.fr0 = (abs(dFdx(G.h0.r)) + abs(dFdy(G.h0.r))) / max(G.h0.r, 1.0);
  G.fr1 = (abs(dFdx(G.h1.r)) + abs(dFdy(G.h1.r))) / max(G.h1.r, 1.0);
  G.fp0 = footprint(G.h0.P, G.h0.r, dFdx(G.h0.P), dFdy(G.h0.P));
  G.fp1 = footprint(G.h1.P, G.h1.r, dFdx(G.h1.P), dFdy(G.h1.P));
  G.fp2 = footprint(G.h2.P, G.h2.r, dFdx(G.h2.P), dFdy(G.h2.P));
  gSkyDx = dFdx(G.sky); gSkyDy = dFdy(G.sky);
  float skyFp = max(length(gSkyDx), length(gSkyDy));
  vec2 sp = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);

  vec3 hdr = vec3(0.0); vec4 paint = vec4(0.0);
  STYLE_BODY
  oHdr = vec4(hdr, 1.0);
  oPaint = paint;
}
`;

  // One-off bake of the faint galactic band and nebulosity (equirectangular).
  BH.glsl.skyBake = `
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float lon = (uv.x - 0.5) * TAU, pol = uv.y * PI;
  vec3 d = vec3(sin(pol) * cos(lon), cos(pol), sin(pol) * sin(lon));
  vec3 gn = normalize(vec3(0.32, 0.78, 0.54));
  float lat = dot(d, gn);
  float band = exp(-lat * lat / 0.035);
  float n = fbm3(d * 3.1 + 4.0);
  float dust = smoothstep(0.35, 0.75, fbm3(d * 6.3 + 1.0));
  vec3 mw = vec3(0.90, 0.80, 0.70) * band * (0.25 + 1.4 * n * n) * (1.0 - 0.75 * dust * band);
  float neb = smoothstep(0.52, 0.85, fbm3(d * 1.6 + 20.0));
  vec3 nebc = mix(vec3(0.20, 0.10, 0.45), vec3(0.05, 0.22, 0.40), vnoise3(d * 2.3));
  o = vec4(mw * 0.022 + nebc * neb * 0.010, 1.0);
}
`;

  BH.glsl.down = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uOutTexel; uniform float uFirst;
out vec4 o;
vec3 S(vec2 uv){ return texture(uTex, uv).rgb; }
float karis(vec3 c){ return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
void main(){
  vec2 uv = gl_FragCoord.xy * uOutTexel;
  vec2 t = uTexel;
  vec3 a = S(uv + t * vec2(-2, 2)), b = S(uv + t * vec2(0, 2)), c = S(uv + t * vec2(2, 2));
  vec3 d = S(uv + t * vec2(-2, 0)), e = S(uv),                  f = S(uv + t * vec2(2, 0));
  vec3 g = S(uv + t * vec2(-2,-2)), h = S(uv + t * vec2(0,-2)), i = S(uv + t * vec2(2,-2));
  vec3 j = S(uv + t * vec2(-1, 1)), k = S(uv + t * vec2(1, 1)), l = S(uv + t * vec2(-1,-1)), m = S(uv + t * vec2(1,-1));
  vec3 r;
  if (uFirst > 0.5){   // tame single hot pixels (stars, thread peaks) so they do not flicker
    vec3 g0 = (j + k + l + m) * 0.25, g1 = (a + b + d + e) * 0.25, g2 = (b + c + e + f) * 0.25;
    vec3 g3 = (d + e + g + h) * 0.25, g4 = (e + f + h + i) * 0.25;
    float w0 = karis(g0) * 0.5, w1 = karis(g1) * 0.125, w2 = karis(g2) * 0.125, w3 = karis(g3) * 0.125, w4 = karis(g4) * 0.125;
    r = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
    // only what is genuinely bright glows; keeps the shadow black instead of hazy
    r *= smoothstep(0.10, 1.20, max(r.r, max(r.g, r.b)));
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(r, 1.0);
}`;

  BH.glsl.up = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uAdd; uniform vec2 uTexel; uniform vec2 uOutTexel; uniform float uW; uniform float uWPrev;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy * uOutTexel;
  vec2 t = uTexel;
  vec3 s = texture(uTex, uv).rgb * 4.0;
  s += (texture(uTex, uv + vec2(t.x, 0)).rgb + texture(uTex, uv - vec2(t.x, 0)).rgb + texture(uTex, uv + vec2(0, t.y)).rgb + texture(uTex, uv - vec2(0, t.y)).rgb) * 2.0;
  s += texture(uTex, uv + t).rgb + texture(uTex, uv - t).rgb + texture(uTex, uv + vec2(t.x, -t.y)).rgb + texture(uTex, uv + vec2(-t.x, t.y)).rgb;
  o = vec4(texture(uAdd, uv).rgb * uW + s / 16.0 * uWPrev, 1.0);
}`;

  BH.glsl.composite = `#version 300 es
precision highp float;
uniform sampler2D uScene; uniform sampler2D uPaint; uniform sampler2D uBloom;
uniform vec2 uOutRes; uniform float uExposure; uniform float uBloomStr; uniform float uGrain;
uniform float uVignette; uniform float uTime; uniform float uFade; uniform float uCA;
uniform float uFlash; uniform float uGrade;
out vec4 o;
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 filmic(vec3 x){   // ACES fit (Narkowicz). Per-channel, so hot orange rolls off to cream-white.
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uOutRes;
  vec2 c = uv - 0.5;
  // a touch of lateral chromatic aberration toward the corners, like a real lens
  vec2 off = c * dot(c, c) * uCA;
  vec3 hdr = vec3(texture(uScene, uv + off).r, texture(uScene, uv).g, texture(uScene, uv - off).b);
  vec3 bl = texture(uBloom, uv).rgb;
  vec3 x = (hdr + bl * uBloomStr) * uExposure;
  float asp = uOutRes.x / uOutRes.y;
  float vg = 1.0 - uVignette * smoothstep(0.25, 1.15, length(c * vec2(asp, 1.0)) * 1.25);
  x *= vg;
  vec3 col = filmic(x);
  col = pow(col, vec3(1.0 / 2.2));
  // 'drawing' grade: the same picture as white line on blueprint blue
  float lum = dot(col, vec3(0.30, 0.59, 0.11));
  vec2 gpx = gl_FragCoord.xy * (1080.0 / uOutRes.y);
  float grid = max(step(fract(gpx.x / 60.0), 1.0 / 60.0), step(fract(gpx.y / 60.0), 1.0 / 60.0));
  vec3 bp = mix(vec3(0.012, 0.055, 0.165), vec3(0.82, 0.91, 1.0), smoothstep(0.03, 0.60, lum)) + grid * vec3(0.03, 0.05, 0.08);
  col = mix(col, bp, uGrade);
  vec4 p = texture(uPaint, uv);
  col = col * (1.0 - p.a) + p.rgb;
  float gr = hash21(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0) - 0.5;
  col += gr * uGrain * (1.0 - 0.6 * p.a);
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
  col *= uFade;
  col += (hash21(gl_FragCoord.xy * 1.7 + 5.0) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;
})(typeof window !== 'undefined' ? window : globalThis);
