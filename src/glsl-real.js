/* Realistic style: blackbody disk with Doppler beaming, sheared filament gas, lensed star field. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.real = `
uniform float uGain;      // disk emission scale
uniform float uTemp;      // colour temperature at the inner edge (K)
uniform float uDoppler;   // beaming exponent
uniform float uStarGain;
uniform float uPixAngle;  // angular size of one pixel (radians)
uniform sampler2D uSkyTex; // baked galactic glow (equirect)

// Blackbody colour, linear RGB, max channel ~1 (after T. Helland's fit)
vec3 blackbody(float T){
  float t = clamp(T, 800.0, 30000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
                      : clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0));
  return pow(vec3(r, g, b), vec3(2.2));
}

// One snapshot of the gas pattern in (log r, angle) space: long in angle, fine in radius.
// 'fr' is how much log r one pixel covers. Octaves are a geometric ladder and the ones
// closest to pixel size carry the most weight, so there are crisp threads at any zoom.
void gasPattern(float rho, float a, float seed, float fr, out float lanes, out float threads, out float hue, out float cloud){
  float y = rho + seed * 7.31;
  lanes = 0.6 * vnoiseP(vec2(a * 3.0, y * 4.5), 3.0) + 0.4 * vnoiseP(vec2(a * 5.0, y * 11.0 + 3.1), 5.0);
  hue = vnoiseP(vec2(a * 5.0, y * 26.0 + 9.2), 5.0);
  float acc = 0.0, wsum = 0.0, K = 20.0, per = 8.0, perPrev = 5.0;
  for (int i = 0; i < 7; i++){
    float fade = 1.0 - smoothstep(0.28, 0.85, K * fr);
    if (fade > 0.001){
      float n = vnoiseP(vec2(a * per, y * K + float(i) * 3.7), per);
      float t = 1.0 - abs(2.0 * n - 1.0);
      float w = fade * pow(K, 0.45);
      acc += w * t; wsum += w;
    }
    K *= 2.15; float nx = per + perPrev; perPrev = per; per = nx;
  }
  threads = wsum > 0.0 ? acc / wsum : 0.5;
  cloud = 0.55 * vnoiseP(vec2(a * 6.0, y * 3.5 + 8.0), 6.0) + 0.30 * vnoiseP(vec2(a * 14.0, y * 9.0 + 2.0), 14.0)
        + 0.15 * vnoiseP(vec2(a * 31.0, y * 21.0 + 6.0), 31.0);
}

// Emission (premultiplied, HDR) and opacity of the disk at one crossing.
vec4 diskReal(float r, float th, float g, float fr){
  float inside = step(uRin * 0.9, r) * step(r, uRout * 1.35);
  r = clamp(r, uRin * 0.9, uRout * 1.35);
  float rho = log(r);
  float om = pow(r, -1.5) * uSpin;
  // Differential rotation winds any pattern up forever, so run two copies of the
  // pattern half a cycle apart, shear each for one cycle only, and cross-fade.
  float T = 220.0;                          // cycle length, units of M
  float tt = uTime * uFlow / T;
  float lanes = 0.0, threads = 0.0, hue = 0.0, cloud = 0.0, wsum = 0.0, w2 = 0.0;
  for (int i = 0; i < 2; i++){
    float ph = tt + 0.5 * float(i);
    float tau = fract(ph), cyc = floor(ph);
    float w = 1.0 - abs(2.0 * tau - 1.0);
    float a = (th + om * T * (tau - 0.5)) / TAU + hash11(cyc * 2.0 + float(i) + 3.0);
    float l, t, h, c;
    gasPattern(rho, a, hash11(cyc * 2.0 + float(i) + 11.0), fr, l, t, h, c);
    lanes += w * l; threads += w * t; hue += w * h; cloud += w * c; wsum += w; w2 += w * w;
  }
  // keep contrast constant through the cross-fade
  float k = 1.0 / sqrt(max(w2, 1e-4));
  lanes   = 0.5 + (lanes   - 0.5 * wsum) * k;
  threads = 0.5 + (threads - 0.5 * wsum) * k;
  hue     = 0.5 + (hue     - 0.5 * wsum) * k;
  cloud   = 0.5 + (cloud   - 0.5 * wsum) * k;

  // density: soft inner edge, ragged outer edge that breaks into wisps
  float x = (r - uRin) / (uRout - uRin);
  float inner = smoothstep(uRin * 0.93, uRin * 1.10, r + (lanes - 0.5) * 0.7);
  float edge = uRout * (0.74 + 0.50 * (lanes - 0.5) + 0.40 * (cloud - 0.5));
  float outer = 1.0 - smoothstep(edge * 0.70, edge * 1.06, r);
  float wisp = smoothstep(0.36 + 0.22 * x, 0.60 + 0.22 * x, cloud);
  float dens = inner * outer * mix(1.0, wisp, smoothstep(0.35, 0.90, x));

  float L = smoothstep(0.20, 0.80, lanes);
  float Th = smoothstep(0.25, 0.92, threads);
  float tex = (0.30 + 1.05 * L) * (0.10 + 3.0 * Th * Th * Th + 0.5 * Th);
  // thin-disk flux profile and observed temperature
  float q = uRin / r;
  float flux = pow(q, 2.1) * (1.0 - 0.70 * sqrt(q)) * 3.33;
  float beam = pow(g, uDoppler);
  float alpha = dens * clamp(0.35 + 0.50 * L + 0.45 * Th, 0.0, 1.0);

  // explainer build-up (uBuild = 3 is the finished picture)
  float b1 = clamp(uBuild, 0.0, 1.0), b2 = clamp(uBuild - 1.0, 0.0, 1.0), b3 = clamp(uBuild - 2.0, 0.0, 1.0);
  float T_obs = uTemp * pow(q, 1.0) * g * mix(1.0, 0.72 + 0.45 * Th + 0.30 * (hue - 0.5), b3);
  vec3 col = blackbody(T_obs);
  col = mix(col, col * col * 1.5, 0.22);    // richer, more saturated ember colours
  vec3 em = col * (uGain * flux * beam * mix(0.75, tex, b3));
  if (uBuild < 2.999){
    // stage 1: a plain disk with a coordinate grid, poured in from the inner edge
    float xp = (r - uRin) / (uRout * 0.70 - uRin);
    float aPlain = smoothstep(uRin * 0.96, uRin * 1.02, r) * (1.0 - smoothstep(0.97, 1.0, xp)) * smoothstep(0.0, 0.05, b1 * 1.08 - xp);
    float ringW = 0.03 + 1.5 * fr * r / 2.0;
    float rings = 1.0 - smoothstep(ringW, ringW * 1.8, abs(fract(r / 2.0 + 0.5) - 0.5) * 2.0);
    float spokes = 1.0 - smoothstep(0.035, 0.07, abs(fract(th / TAU * 36.0) - 0.5) * 2.0);
    vec3 plain = vec3(0.045, 0.05, 0.06) + vec3(0.55, 0.60, 0.70) * max(rings, spokes * 0.7);
    alpha = mix(aPlain * 0.92, alpha, b3);
    em = mix(plain, em, b2);
  }
  return vec4(em * alpha, alpha) * inside;
}

// ---------------------------------------------------------------- sky
vec3 starLayer(vec3 d, float n, float seed, float sizePx, float density){
  vec3 a = abs(d); vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z){ uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z){ uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 gp = (uv * 0.5 + 0.5) * n;
  vec2 cell = floor(gp), f = fract(gp);
  vec3 h = hash33(vec3(cell, face * 13.0 + seed));
  vec2 sp = 0.2 + 0.6 * h.xy;
  float stretch = 1.0 + dot(uv, uv);                       // cube-face distortion
  float dist = length(f - sp) * (2.0 / n) / stretch;       // ~ radians
  float m = hash11(h.x * 91.7 + h.y * 37.3 + seed);
  float mag = pow(m, 14.0) * 9.0 + pow(m, 4.0) * 0.5 + 0.03;
  float sig = uPixAngle * sizePx * (1.0 + 0.35 * min(mag, 3.0));
  float core = exp(-dist * dist / (2.0 * sig * sig));
  float halo = mag > 2.0 ? 0.02 * exp(-dist / (sig * 4.0)) : 0.0;
  float tK = mix(3000.0, 12000.0, hash11(h.y * 57.1 + seed));
  return blackbody(tK) * mag * (core + halo) * step(h.z, density);
}
vec3 skyReal(vec3 d, float fp){
  // where lensing squeezes a lot of sky into one pixel, stars average out to nothing
  float squeeze = fp / (uPixAngle * 1.1);
  float aa = 1.0 / (1.0 + squeeze * squeeze * squeeze);
  vec3 c = vec3(0.0);
  c += starLayer(d, 44.0, 1.0, 0.72, 0.34);
  c += starLayer(d, 120.0, 2.0, 0.64, 0.55) * 0.60;
  c += starLayer(d, 300.0, 3.0, 0.58, 0.60) * 0.30;
  c *= aa;
  // faint galactic band and nebulosity, baked once into an equirect texture
  vec2 suv = vec2(atan(d.z, d.x) / TAU + 0.5, acos(clamp(d.y, -1.0, 1.0)) / PI);
  vec3 glow = textureLod(uSkyTex, suv, 0.0).rgb;
  return (c + glow) * uStarGain;
}

// Full realistic pixel. Front-to-back over the disk crossings, then sky or shadow.
vec3 shadeReal(Geo G, float skyFp){
  vec4 e0 = diskReal(G.h0.r, G.h0.th, G.h0.g, G.fr0);
  vec4 e1 = diskReal(G.h1.r, G.h1.th, G.h1.g, G.fr1);
  vec3 C = e0.rgb + (1.0 - e0.a) * e1.rgb;
  float Tr = (1.0 - e0.a) * (1.0 - e1.a);
  // third crossing: the photon ring is far too thin to show texture, so just its glow
  float r2 = G.h2.r, g2 = G.h2.g;
  float ring = step(uRin, r2) * step(r2, uRout * 0.8) * clamp(uBuild - 1.0, 0.0, 1.0);
  float q = uRin / max(r2, uRin);
  C += Tr * ring * blackbody(uTemp * q * g2) * uGain * pow(q, 2.1) * (1.0 - 0.70 * sqrt(q)) * 3.33 * pow(g2, uDoppler) * 0.9;
  Tr *= 1.0 - 0.5 * ring;
  C += Tr * G.escaped * skyReal(G.sky, skyFp);
  return C;
}

// Things that are not the disk: gas from the dead star spiralling back, and the final point of light.
vec3 extrasReal(Geo G, vec2 sp){
  vec2 v = sp - uHole; float rad = length(v), an = atan(v.y, v.x);
  float sw = an + 1.9 / (rad + 0.22) + uWall * 0.05;
  vec2 q = vec2(cos(sw), sin(sw)) * (rad * 2.6 + 0.4);
  float d1 = fbm(q * 3.4 + 3.0), d2 = fbm(q * 9.0 + 11.0);
  float env = exp(-rad / 0.50) * smoothstep(0.015, 0.10, rad);
  vec3 dc = mix(vec3(1.0, 0.22, 0.10), vec3(0.12, 0.55, 0.75), smoothstep(0.40, 0.65, d1));
  vec3 c = dc * (d1 * d1 * 1.6 + pow(d2, 3.0) * 1.4) * env * uDebris * 0.22 * G.escaped;
  c += vec3(1.0, 0.96, 0.90) * uGlow * (exp(-rad * rad / 1.2e-5) * 40.0 + exp(-rad * rad / 4e-4) * 2.0 + 0.05 / (1.0 + rad * rad / 6e-3));
  return c;
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
