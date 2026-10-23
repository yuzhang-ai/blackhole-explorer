/* BH style pass.
   Spliced into the v6.7 bundle. Uses that file's TSL aliases (kP, Z, cF, …).
   L0 is the existing geodesic + volume pass. It already stores structure in
   the resolved buffer and is not recompiled when the skin changes:
     rgb  = pre-tonemap linear color
     a>1  = disk hit (camera distance of the first disk sample)
     a≈0.3 = star
     a≈0  = sky or shadow
   Impact parameter below matches the renderer's own C, so the shadow limb
   stays on the black hole while the camera moves. L1 is this pass. */

function lin3(hex) {
  let n = parseInt(hex.slice(1), 16);
  let ch = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return cF(ch[0], ch[1], ch[2]);
}
function gridMask(px, cell) {
  let f = UP(px.div(Z(cell)));
  let dist = YP(f, Z(1).sub(f)).mul(cell);
  return Z(1).sub(rF(Z(0), Z(1.05), YP(dist.x, dist.y)));
}
function makeStruct(e, texNode) {
  let uv = eF;
  let ndcX = uv.x.mul(2).sub(1);
  let ndcY = Z(1).sub(uv.y.mul(2));
  let o = ndcX.mul(e.aspect).mul(e.tanHalf);
  let s = ndcY.mul(e.tanHalf);
  let dir = ZP(e.camRight.mul(o).add(e.camUp.mul(s)).add(e.camForward)).toVar();
  let h = ZP(e.camPos);
  let g = BP(dir, h);
  let v = GP(dir.sub(h.mul(g))).max(1e-4);
  let x = Z(1).div(e.cameraDistance.max(2));
  let Sb = x.mul(g).div(v).negate();
  let ee = Sb.mul(Sb).add(x.mul(x)).sub(x.mul(x).mul(x));
  let impact = Z(1).div(iF(ee.max(1e-8))).toVar();
  let samp = texNode.sample(uv);
  let lum = BP(samp.rgb, cF(.2126, .7152, .0722)).toVar();
  let lumC = lum.div(lum.add(.45)).toVar();
  let alpha = samp.a;
  let bCrit = Z(SP.bCrit);
  let diskA = rF(Z(.8), Z(3), alpha);
  let star = rF(Z(.1), Z(.22), alpha).mul(Z(1).sub(rF(Z(.4), Z(.55), alpha))).toVar();
  let near = Z(1).sub(rF(bCrit.mul(1.2), bCrit.mul(2.4), impact));
  let diskL = rF(Z(.38), Z(.7), lumC).mul(near).mul(Z(1).sub(star));
  let disk = JP(diskA.mul(rF(Z(.04), Z(.16), lumC)), diskL).toVar();
  let inHole = Z(1).sub(rF(bCrit.mul(.9), bCrit.mul(1.03), impact)).toVar();
  let brightCut = rF(Z(.2), Z(.46), lumC);
  let shadow = inHole.mul(Z(1).sub(JP(disk, brightCut))).toVar();
  let edge = GP(sF(RP(lumC), zP(lumC))).toVar();
  let ang = PP(ndcY, ndcX).toVar();
  let rad = GP(sF(ndcX.mul(e.aspect), ndcY)).toVar();
  let bPx = e.cameraDistance.mul(e.tanHalf).mul(2).div(e.resolution.y.max(1)).toVar();
  return { uv, ndcX, ndcY, dir, impact, lum, lumC, disk, star, shadow, edge, ang, rad, bPx, bCrit, inHole };
}
function styleInk(e, S) {
  let paper = lin3(`#EDE4D0`), jiao = lin3(`#0B0906`), nong = lin3(`#231D17`), zhong = lin3(`#4A4036`), dan = lin3(`#9A8F80`), qing = lin3(`#D8CFBE`);
  let py = Z(1).div(e.resolution.y.max(1));
  let fiber = OF(sF(S.uv.x.mul(e.resolution.x).mul(.22), S.uv.y.mul(e.resolution.y).mul(.22)));
  let col = paper.add(cF(1, 1, 1).mul(fiber.sub(.5).mul(.028)));
  let rough = OF(sF(S.ang.mul(3.2), Z(1.6))).sub(.5);
  let edgeB = S.bCrit.mul(Z(1).add(rough.mul(.04)));
  let hole = Z(1).sub(rF(edgeB.mul(.95), edgeB.mul(1.025), S.impact));
  let holeInk = hole.mul(Z(1).sub(S.disk.mul(.82))).mul(Z(1).sub(rF(Z(.25), Z(.6), S.lumC)));
  col = XP(col, jiao, holeInk);
  let halo = rF(S.bCrit.mul(.98), S.bCrit.mul(1.04), S.impact).mul(Z(1).sub(rF(S.bCrit.mul(1.1), S.bCrit.mul(1.42), S.impact)));
  col = XP(col, qing, halo.mul(.5).mul(Z(1).sub(S.disk)));
  let thick = nF(S.ang.add(.7)).mul(.5).add(.5);
  let halfW = S.bPx.mul(Z(2).add(thick.mul(14)));
  let mid = S.bCrit.mul(Z(1.1).add(nF(S.ang.mul(2)).mul(.045)));
  let ring = Z(1).sub(rF(Z(0), halfW, jP(S.impact.sub(mid))));
  let gap = OF(sF(S.ang.mul(1.7).add(2), Z(3.1)));
  let dry = OF(sF(S.ang.mul(14), S.impact.mul(6)));
  let stroke = ring.mul(rF(Z(.12), Z(.38), gap)).mul(Z(1).sub(rF(Z(.78), Z(.94), dry).mul(.8)));
  let arcOn = rF(Z(-2.6), Z(-1.3), S.ang).mul(Z(1).sub(rF(Z(.9), Z(2.1), S.ang)));
  stroke = stroke.mul(XP(Z(.15), Z(1), arcOn));
  let across = rF(Z(.18), Z(.32), S.uv.x).mul(Z(1).sub(rF(Z(.68), Z(.82), S.uv.x)));
  let lowerHole = S.inHole.mul(Z(1).sub(rF(Z(.47), Z(.6), S.uv.y)));
  let gate = JP(S.disk, lowerHole);
  let hStroke = Z(0);
  for (let y0 of [.4, .455, .51, .56]) {
    let line = Z(1).sub(rF(Z(0), py.mul(6.5), jP(S.uv.y.sub(Z(y0)))));
    let dryH = OF(sF(S.uv.x.mul(8).add(y0 * 7), Z(2 + y0)));
    hStroke = JP(hStroke, line.mul(across).mul(gate).mul(rF(Z(.02), Z(.2), dryH)));
  }
  let inkAmt = FP(JP(stroke, hStroke), 0, 1);
  let tone = XP(dan, zhong, rF(Z(.15), Z(.7), S.lumC));
  tone = XP(tone, nong, rF(Z(.35), Z(.8), stroke));
  tone = XP(tone, jiao, hStroke.mul(.85));
  col = XP(col, tone, inkAmt);
  let ridgeN = nF(S.uv.x.mul(8.5).add(1.1)).mul(.55).add(.45);
  ridgeN = ridgeN.add(nF(S.uv.x.mul(19).add(2)).mul(.12));
  let mtnH = Z(.14).add(ridgeN.mul(.14));
  let mtn = Z(1).sub(rF(mtnH.sub(.01), mtnH, S.uv.y));
  mtn = mtn.mul(rF(Z(.58), Z(.7), S.uv.x)).mul(Z(1).sub(S.inHole)).mul(Z(1).sub(S.disk));
  col = XP(col, nong, mtn.mul(.8));
  let cloudN = OF(sF(S.uv.x.mul(1.5).add(5), S.uv.y.mul(1.1)));
  let cloud = rF(Z(.6), Z(.78), cloudN).mul(rF(Z(.64), Z(.8), S.uv.y)).mul(rF(Z(.48), Z(.7), S.uv.x));
  cloud = cloud.mul(Z(1).sub(S.inHole)).mul(Z(1).sub(S.disk)).mul(rF(S.bCrit.mul(1.9), S.bCrit.mul(2.8), S.impact));
  col = XP(col, dan, cloud.mul(.42));
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleBlue(e, S) {
  let bg = lin3(`#0A3D6E`), gridC = lin3(`#2A6FA3`), lineC = lin3(`#E8F4FF`), holeC = lin3(`#061828`);
  let col = bg;
  let px = S.uv.mul(e.resolution);
  col = XP(col, gridC, gridMask(px, 28).mul(.62));
  col = XP(col, lineC, gridMask(px, 112).mul(.28));
  col = XP(col, holeC, S.inHole.mul(Z(1).sub(S.disk)));
  let rings = Z(0);
  let ks = [.98, 1, 1.08, 1.18, 1.32, 1.5, 1.85, 2.3];
  for (let k of ks) rings = JP(rings, Z(1).sub(rF(Z(0), S.bPx.mul(1.15), jP(S.impact.sub(S.bCrit.mul(k))))));
  let f = S.lumC.mul(5);
  let fw = YP(GP(sF(RP(f), zP(f))).max(.012), Z(.08));
  let frac = UP(f);
  let topo = Z(1).sub(rF(Z(0), fw.mul(.6), YP(frac, Z(1).sub(frac))));
  topo = topo.mul(rF(Z(.12), Z(.28), S.lumC)).mul(rF(S.bCrit.mul(.7), S.bCrit.mul(1.15), S.impact));
  let dDisk = GP(sF(RP(S.disk), zP(S.disk))).max(1e-4);
  let diskEdge = Z(1).sub(rF(Z(0), YP(dDisk.mul(.75), Z(.2)), jP(S.disk.sub(.4))));
  diskEdge = diskEdge.mul(rF(Z(.03), Z(.14), dDisk));
  let hx = UP(px.x.div(Z(14)));
  let hatch = Z(1).sub(rF(Z(0), Z(1.05), YP(hx, Z(1).sub(hx)).mul(14)));
  hatch = hatch.mul(rF(Z(.45), Z(.7), S.disk));
  let cx = jP(S.uv.x.sub(.5)).mul(e.resolution.x);
  let cy = jP(S.uv.y.sub(.5)).mul(e.resolution.y);
  let hLine = Z(1).sub(rF(Z(0), Z(1.15), cy));
  let vLine = Z(1).sub(rF(Z(0), Z(1.15), cx));
  let dashH = tF(UP(px.x.div(Z(18))).lessThan(.45), Z(1), Z(0));
  let dashV = tF(UP(px.y.div(Z(18))).lessThan(.45), Z(1), Z(0));
  let axes = JP(hLine.mul(dashH), vLine.mul(dashV));
  let lines = FP(JP(rings, JP(topo, JP(diskEdge, JP(hatch, axes)))), 0, 1);
  lines = lines.mul(Z(1).sub(S.inHole.mul(Z(1).sub(S.disk))));
  col = XP(col, lineC, lines);
  col = XP(col, holeC, S.inHole.mul(Z(1).sub(S.disk)));
  let limb = Z(1).sub(rF(Z(0), S.bPx.mul(1.25), jP(S.impact.sub(S.bCrit))));
  col = XP(col, lineC, limb);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleVangogh(e, S) {
  let deep = lin3(`#0B1D51`), cobalt = lin3(`#1C3F94`), lightB = lin3(`#7FB2D9`), yellow = lin3(`#F2C230`), hi = lin3(`#FFE066`), ochre = lin3(`#C98A1B`), hole = lin3(`#050508`);
  let flipH = OF(sF(HP(S.ang.add(3.1416).mul(.65)), Z(1.4)));
  let flip = tF(flipH.greaterThan(.5), Z(1), Z(-1));
  let phase = S.ang.mul(flip).mul(2.5).add(S.rad.mul(24)).add(OF(sF(S.ang.mul(2), S.rad.mul(3.2))).mul(1.5));
  let stroke = Z(1).sub(rF(Z(.07), Z(.26), jP(UP(phase).sub(.5))));
  let phase2 = S.ang.mul(flip.negate()).mul(1.4).add(S.rad.mul(36));
  let stroke2 = Z(1).sub(rF(Z(.1), Z(.28), jP(UP(phase2).sub(.5))));
  let mark = FP(stroke.mul(.72).add(stroke2.mul(.4)), 0, 1);
  let col = XP(deep, cobalt, mark);
  col = XP(col, lightB, stroke2.mul(.15).mul(Z(1).sub(S.disk)));
  let g = Z(4.4);
  let qx = S.dir.x.mul(g).add(S.dir.z.mul(1.7));
  let qy = S.dir.y.mul(g).sub(S.dir.z.mul(1.1));
  let cell = sF(HP(qx), HP(qy));
  let hsh = OF(sF(cell.x.add(2.2), cell.y.mul(1.7).add(5)));
  let jx = OF(sF(cell.x, Z(8))).sub(.5);
  let jy = OF(sF(Z(3), cell.y)).sub(.5);
  let local = sF(UP(qx).sub(.5).sub(jx.mul(.4)), UP(qy).sub(.5).sub(jy.mul(.4)));
  let d = GP(local);
  let nRing = hsh.mul(2.4).add(1.5);
  let rings = Z(1).sub(rF(Z(0), Z(.05), jP(UP(d.mul(nRing)).sub(.2))));
  let core = Z(1).sub(rF(Z(.015), Z(.06), d));
  let starM = tF(hsh.greaterThan(.82), Z(1), Z(0)).mul(tF(S.impact.greaterThan(S.bCrit.mul(1.7)), Z(1), Z(0)));
  starM = starM.mul(Z(1).sub(S.disk)).mul(Z(1).sub(S.shadow)).mul(rF(Z(.46), Z(.18), d));
  let starCol = XP(cobalt, yellow, FP(core.add(rings.mul(.7)), 0, 1));
  starCol = XP(starCol, hi, core);
  col = XP(col, starCol, FP(starM.mul(JP(core, rings)), 0, 1));
  let diskCol = XP(ochre, yellow, mark);
  diskCol = XP(diskCol, hi, stroke.mul(rF(Z(.35), Z(.85), S.lumC)));
  diskCol = XP(XP(cobalt, diskCol, rF(Z(.2), Z(.6), S.lumC)), diskCol, S.disk);
  col = XP(col, diskCol, FP(S.disk.mul(XP(Z(.4), Z(1), mark)), 0, 1));
  col = XP(col, hole, S.shadow);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleUkiyo(e, S) {
  let paper = lin3(`#F3E6D0`), indigo = lin3(`#1B3A6D`), pruss = lin3(`#243F73`), red = lin3(`#C73E2A`), ink = lin3(`#1A1A1A`);
  let col = paper;
  let cn = OF(sF(S.uv.x.mul(2.8), S.uv.y.mul(1.8).add(1)));
  let cloud = tF(cn.greaterThan(.64), Z(1), Z(0));
  let skyZone = tF(S.impact.greaterThan(S.bCrit.mul(2.15)), Z(1), Z(0)).mul(tF(S.uv.y.greaterThan(.6), Z(1), Z(0)));
  col = XP(col, pruss, cloud.mul(skyZone));
  let cEdge = rF(Z(.08), Z(.4), GP(sF(RP(cn), zP(cn))).mul(e.resolution.y.max(1)));
  col = XP(col, ink, cEdge.mul(cloud).mul(skyZone));
  let wave = nF(S.ang.mul(4).add(S.impact.mul(2.2))).mul(.5).add(.5);
  let tone = FP(HP(wave.mul(3.05).add(rF(Z(.15), Z(.85), S.lumC))), 0, 3);
  let diskCol = tF(tone.lessThan(.5), paper, tF(tone.lessThan(1.5), indigo, tF(tone.lessThan(2.5), pruss, red)));
  col = XP(col, diskCol, rF(Z(.28), Z(.55), S.disk));
  let dDisk = GP(sF(RP(S.disk), zP(S.disk))).max(1e-4);
  let outline = Z(1).sub(rF(Z(0), YP(dDisk.mul(.85), Z(.22)), jP(S.disk.sub(.4))));
  outline = outline.mul(rF(Z(.04), Z(.16), dDisk));
  col = XP(col, ink, outline);
  col = XP(col, ink, S.shadow);
  let g = Z(5.2);
  let qx = S.dir.x.mul(g).add(S.dir.z);
  let qy = S.dir.y.mul(g).sub(S.dir.z.mul(.7));
  let cell = sF(HP(qx), HP(qy));
  let hsh = OF(sF(cell.x.add(1.4), cell.y.add(6)));
  let d = GP(sF(UP(qx).sub(.5), UP(qy).sub(.5)));
  let stamp = tF(hsh.greaterThan(.9).and(d.lessThan(.13)).and(S.impact.greaterThan(S.bCrit.mul(1.85))), Z(1), Z(0));
  stamp = stamp.mul(Z(1).sub(S.disk)).mul(Z(1).sub(S.shadow));
  col = XP(col, tF(hsh.greaterThan(.95), red, indigo), stamp);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleConst(e, S) {
  let red = lin3(`#C41E3A`), black = lin3(`#0A0A0A`), ivory = lin3(`#F2EDE4`), gray = lin3(`#8A8A8A`), grayD = lin3(`#3A3A3A`);
  let d1 = S.uv.x.mul(1.15).add(S.uv.y.mul(.25));
  let d2 = S.uv.x.mul(-.55).add(S.uv.y);
  let col = tF(d1.greaterThan(1.02), black, ivory);
  col = tF(d2.lessThan(.16), gray, col);
  col = tF(S.uv.x.add(S.uv.y).greaterThan(1.55), black, col);
  col = tF(S.uv.x.lessThan(.1).and(S.uv.y.greaterThan(.7)), grayD, col);
  let far = S.impact.greaterThan(S.bCrit.mul(1.62));
  let wedge = tF(S.uv.x.lessThan(.2).and(S.uv.y.lessThan(.16)).and(far), Z(1), Z(0));
  wedge = JP(wedge, tF(S.uv.x.greaterThan(.78).and(S.uv.y.greaterThan(.74)).and(far), Z(1), Z(0)));
  wedge = JP(wedge, tF(S.uv.x.greaterThan(.84).and(S.uv.y.lessThan(.18)).and(far), Z(1), Z(0)));
  col = tF(wedge.greaterThan(.5), red, col);
  let band = UP(S.impact.mul(2.15).add(nF(S.ang.mul(2)).mul(.06)));
  let diskCol = tF(band.lessThan(.22), grayD, tF(band.lessThan(.48), ivory, tF(band.lessThan(.72), gray, black)));
  col = tF(S.disk.greaterThan(.32), diskCol, col);
  let arc = rF(S.bCrit.mul(.99), S.bCrit.mul(1.04), S.impact).mul(Z(1).sub(rF(S.bCrit.mul(1.2), S.bCrit.mul(1.42), S.impact)));
  let arcQ = tF(UP(S.impact.mul(2.6)).greaterThan(.5), ivory, gray);
  col = tF(arc.greaterThan(.4).and(S.disk.lessThan(.38)).and(S.shadow.lessThan(.4)), arcQ, col);
  col = tF(S.shadow.greaterThan(.45), black, col);
  let limb = Z(1).sub(rF(Z(0), S.bPx.mul(1.4), jP(S.impact.sub(S.bCrit))));
  col = tF(limb.greaterThan(.55).and(S.shadow.lessThan(.2)).and(S.disk.lessThan(.4)), ivory, col);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function BH_STYLE_MAT(e, tex, id) {
  let texNode = aF(tex), mat = IF();
  return mat.fragmentNode = kP(() => {
    let S = makeStruct(e, texNode), col = id === 1 ? styleVangogh(e, S) : id === 2 ? styleUkiyo(e, S) : id === 3 ? styleBlue(e, S) : id === 4 ? styleConst(e, S) : styleInk(e, S);
    let ok = col.x.equal(col.x).and(col.y.equal(col.y)).and(col.z.equal(col.z));
    return lF(tF(ok, col, cF(0, 0, 0)), 1);
  })(), mat;
}
