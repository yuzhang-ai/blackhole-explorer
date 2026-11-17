/* Style dispatch and the transition between styles.
 * The scene shader is compiled once per (from, to) pair with SA / SB defined, so a frame
 * only ever pays for the styles it shows. */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};
  BH.glsl = BH.glsl || {};

  BH.glsl.styleFns = `
#if SA == 1
#define PAINT_A(reveal) paintVanGogh(G, skyFp, sp, reveal)
#elif SA == 2
#define PAINT_A(reveal) paintInk(G, skyFp, sp, reveal)
#endif
#if SB == 1
#define PAINT_B(reveal) paintVanGogh(G, skyFp, sp, reveal)
#elif SB == 2
#define PAINT_B(reveal) paintInk(G, skyFp, sp, reveal)
#endif
`;

  // Runs inside main(). A ragged front sweeps outward from the hole; behind it the new
  // style arrives stroke by stroke (each stroke has its own birth time inside 'reveal').
  BH.glsl.styleBody = `
#if SA == SB
  #if SA == 0
    hdr = (shadeReal(G, skyFp) + extrasReal(G, sp));
  #else
    paint = vec4(PAINT_A(1.0).rgb, 1.0);
  #endif
#else
  float dist = length(sp - uHole) / 2.2;
  float rag = 0.26 * fbm(sp * 2.4 + 7.0) + 0.05 * fbm(sp * 10.0 + 2.0);
  float lp = clamp((uMix * 1.62 - dist * 0.85 - rag) / 0.50, 0.0, 1.0);
  #if SB == 0
    // paint lifts off, stroke by stroke, to uncover the light underneath
    vec4 pa = PAINT_A(1.0 - lp);
    hdr = (shadeReal(G, skyFp) + extrasReal(G, sp)) * (1.0 - pa.a);
    paint = vec4(pa.rgb * pa.a, pa.a);
  #elif SA == 0
    vec4 pb = PAINT_B(lp);
    hdr = (shadeReal(G, skyFp) + extrasReal(G, sp)) * (1.0 - pb.a);
    paint = vec4(pb.rgb * pb.a, pb.a);
  #else
    vec4 pa = PAINT_A(1.0);
    vec4 pb = PAINT_B(lp);
    paint = vec4(mix(pa.rgb, pb.rgb, pb.a), 1.0);
  #endif
#endif
`;
})(typeof window !== 'undefined' ? window : globalThis);
