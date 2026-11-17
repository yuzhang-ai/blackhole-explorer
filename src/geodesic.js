/* Schwarzschild null-geodesic table (units: G = c = M = 1, so r_s = 2).
 *
 * Every light ray lives in a plane through the hole. In that plane, with u = 1/r and
 * psi the orbital angle measured from the incoming asymptote, the orbit obeys
 *     u'' + u = 3 u^2 ,   u(0) = 0 ,  u'(0) = 1/b
 * where b is the impact parameter. The curve depends on b only, so one 2-D table
 * U(b, psi) serves every camera distance: an observer at radius r0 simply sits at
 * the point psi0(b) on that curve, and anything it sees at orbital angle phi from
 * itself is at psi0 + phi. The disk plane cuts each orbital plane along a line, so
 * the disk crossings sit at exactly known angles phi1, phi1 + pi, phi1 + 2pi and
 * each one costs a single table lookup in the shader.
 */
(function (root) {
  'use strict';
  var BH = root.BH = root.BH || {};

  var B_CRIT = 3 * Math.sqrt(3);     // photon-sphere impact parameter
  var CFG = {
    NB: 1024,                        // samples in b
    NPSI: 1024,                      // samples in psi
    PSI_MAX: 3.5 * Math.PI,          // enough for the 3rd disk crossing
    B_MAX: 50,                       // beyond this the weak-field series is exact enough
    K: 8                             // exponential packing of samples around B_CRIT
  };
  CFG.CN = B_CRIT / (Math.exp(CFG.K) - 1);
  CFG.CP = (CFG.B_MAX - B_CRIT) / (Math.exp(CFG.K) - 1);

  // texture coordinate s in [0,1]  ->  impact parameter b
  function bOfS(s) {
    var t = 2 * s - 1, e = Math.exp(CFG.K * Math.abs(t)) - 1;
    return t < 0 ? B_CRIT - CFG.CN * e : B_CRIT + CFG.CP * e;
  }

  function build() {
    var NB = CFG.NB, NP = CFG.NPSI, dpsi = CFG.PSI_MAX / (NP - 1), SUB = 4, h = dpsi / SUB;
    var U = new Float32Array(NB * NP);
    var END = new Float32Array(NB);
    for (var i = 0; i < NB; i++) {
      var b = Math.max(bOfS(i / (NB - 1)), 1e-4);
      var u = 0, v = 1 / b, row = i * NP, done = 0, psiEnd = 1e3;
      U[row] = 0;
      for (var j = 1; j < NP; j++) {
        if (done === 1) { U[row + j] = 1; continue; }        // swallowed: stays inside
        if (done === 2) { U[row + j] = -1; continue; }       // escaped: stays outside
        for (var s = 0; s < SUB; s++) {
          var k1u = v,              k1v = -u + 3 * u * u;
          var u2 = u + 0.5 * h * k1u, v2 = v + 0.5 * h * k1v;
          var k2u = v2,             k2v = -u2 + 3 * u2 * u2;
          var u3 = u + 0.5 * h * k2u, v3 = v + 0.5 * h * k2v;
          var k3u = v3,             k3v = -u3 + 3 * u3 * u3;
          var u4 = u + h * k3u,     v4 = v + h * k3v;
          var k4u = v4,             k4v = -u4 + 3 * u4 * u4;
          var un = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u);
          var vn = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
          if (un >= 0.5) { done = 1; u = 1; break; }
          if (un <= 0 && vn < 0) {                             // back out to infinity
            psiEnd = (j - 1) * dpsi + (s + u / (u - un)) * h;
            done = 2; u = -1; break;
          }
          u = un; v = vn;
        }
        U[row + j] = u;
      }
      END[i] = psiEnd;
    }
    return { U: U, END: END, cfg: CFG, bCrit: B_CRIT };
  }

  BH.geodesic = { build: build, bOfS: bOfS, CFG: CFG, B_CRIT: B_CRIT };
  if (typeof module !== 'undefined') module.exports = BH.geodesic;
})(typeof window !== 'undefined' ? window : globalThis);
