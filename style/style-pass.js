/* BH style pass. Phase 0: one fullscreen material per skin.
   Samples the pre-tonemap resolved buffer (linear rgb, disk/star in alpha).
   There is no separate G-buffer. Realistic styleId 0 skips this pass.
   Impact matches the renderer's C so the limb stays put while the camera moves.
   strokeScale / gridPitch / inkDry are uniforms on the camera bag. */

function lin3(hex) {
  let n = parseInt(hex.slice(1), 16);
  let ch = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return cF(ch[0], ch[1], ch[2]);
}
function gridMask(px, cell) {
  let f = UP(px.div(cell));
  let dist = YP(f, Z(1).sub(f)).mul(cell);
  return Z(1).sub(rF(Z(0), Z(1.05), YP(dist.x, dist.y)));
}
function brushInk(e, S, bMul, ang0, ang1, peakPx, dense) {
  let wob = Z(1).add(nF(S.ang.mul(2).add(bMul)).mul(.03));
  let bC = S.bCrit.mul(bMul).mul(wob);
  let along = S.ang.sub(Z(ang0)).div(Z(ang1 - ang0));
  let gate = rF(Z(-.02), Z(.06), along).mul(Z(1).sub(rF(Z(.72), Z(1.02), along)));
  let rise = rF(Z(.02), Z(.28), along);
  let px = XP(Z(2), Z(peakPx), rise);
  px = XP(px, Z(1), rF(Z(.38), Z(1), along));
  let half = S.bPx.mul(px).mul(e.strokeScale).mul(.5);
  let rd = jP(S.impact.sub(bC));
  let body = Z(1).sub(rF(Z(0), half.max(S.bPx.mul(.8)), rd));
  let brk = OF(sF(HP(along.mul(3.2).add(bMul * 5)), Z(1.6)));
  let keep = dense ? rF(Z(.02), Z(.2), brk) : rF(Z(.28), Z(.62), brk);
  let edge = rF(half.mul(.22), half.add(S.bPx), rd);
  let holeN = OF(sF(along.mul(11).add(bMul * 4), rd.mul(26).add(1)));
  let holes = rF(dense ? Z(.62) : Z(.4), dense ? Z(.9) : Z(.7), holeN);
  holes = holes.mul(XP(Z(.35), Z(1), JP(edge, rF(Z(.55), Z(.95), along)))).mul(e.inkDry);
  let ink = FP(body.mul(gate).mul(keep).mul(Z(1).sub(holes)), 0, 1);
  let wash = Z(1).sub(rF(Z(0), half.mul(2.8).add(S.bPx.mul(3)), rd)).mul(rF(Z(-.05), Z(.12), along)).mul(Z(1).sub(rF(Z(.7), Z(1.05), along)));
  let core = Z(1).sub(rF(Z(0), half.mul(.28).add(S.bPx.mul(.4)), rd)).mul(ink);
  return { ink, wash, core };
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
  let fiber = OF(sF(S.uv.x.mul(e.resolution.x).mul(.18), S.uv.y.mul(e.resolution.y).mul(.18)));
  let col = paper.add(cF(1, 1, 1).mul(fiber.sub(.5).mul(.02)));
  let far = Z(1).sub(S.inHole).mul(Z(1).sub(S.disk.mul(.9))).mul(rF(S.bCrit.mul(1.55), S.bCrit.mul(2.2), S.impact));
  let ridge = nF(S.uv.x.mul(5.5).add(.6)).mul(.5).add(.5);
  ridge = ridge.add(nF(S.uv.x.mul(13)).mul(.15));
  let mtnH = Z(.12).add(ridge.mul(.16));
  let mtn = Z(1).sub(rF(mtnH.sub(.045), mtnH.add(.03), S.uv.y));
  mtn = mtn.mul(rF(Z(.58), Z(.72), S.uv.x)).mul(far);
  col = XP(col, dan, mtn.mul(.72));
  col = XP(col, zhong, mtn.mul(rF(mtnH.sub(.01), mtnH.add(.012), S.uv.y)).mul(.45));
  let c1 = Z(1).sub(rF(Z(.04), Z(.2), GP(sF(S.uv.x.sub(.78), S.uv.y.sub(.8)))));
  let c2 = Z(1).sub(rF(Z(.02), Z(.14), GP(sF(S.uv.x.sub(.6), S.uv.y.sub(.68)))));
  let cloud = JP(c1, c2.mul(.75)).mul(rF(Z(.52), Z(.66), S.uv.y)).mul(rF(Z(.42), Z(.58), S.uv.x)).mul(far);
  col = XP(col, XP(qing, dan, c1), cloud.mul(.62));
  let rough = OF(sF(S.ang.mul(2.6), Z(1.4))).sub(.5);
  let edgeB = S.bCrit.mul(Z(1).add(rough.mul(.03)));
  let hole = Z(1).sub(rF(edgeB.mul(.96), edgeB.mul(1.02), S.impact));
  let halo = rF(S.bCrit.mul(.98), S.bCrit.mul(1.05), S.impact).mul(Z(1).sub(rF(S.bCrit.mul(1.12), S.bCrit.mul(1.4), S.impact)));
  col = XP(col, qing, halo.mul(.4));
  let ink = Z(0), wash = Z(0), core = Z(0);
  let strokes = [
    [1.04, -2.6, -.2, 16, 1],
    [.78, .35, 2.15, 18, 0],
    [1.16, -.2, 1.35, 12, 0],
    [1.42, .8, 2.55, 9, 0],
    [1.7, -1.4, .15, 7, 0]
  ];
  for (let s of strokes) {
    let b = brushInk(e, S, s[0], s[1], s[2], s[3], s[4]);
    ink = JP(ink, b.ink);
    wash = JP(wash, b.wash);
    core = JP(core, b.core);
  }
  col = XP(col, qing, FP(wash.mul(.65), 0, 1));
  col = XP(col, dan, FP(wash.mul(ink.add(.25)).mul(.35), 0, 1));
  col = XP(col, zhong, FP(ink.mul(.5), 0, 1));
  col = XP(col, nong, ink);
  col = XP(col, jiao, core);
  let holeInk = hole.mul(Z(1).sub(ink)).mul(Z(1).sub(rF(Z(.28), Z(.62), S.lumC)));
  col = XP(col, jiao, holeInk);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleBlue(e, S) {
  let bg = lin3(`#0A3D6E`), gridC = lin3(`#2A6FA3`), lineC = lin3(`#E8F4FF`), holeC = lin3(`#061828`);
  let col = bg;
  let px = S.uv.mul(e.resolution);
  let pitch = e.gridPitch;
  col = XP(col, gridC, gridMask(px, pitch));
  col = XP(col, lineC, gridMask(px, pitch.mul(4)).mul(.9));
  let lw = S.bPx.mul(e.strokeScale);
  let lines = Z(0);
  for (let k of [.98, 1, 1.1]) lines = JP(lines, Z(1).sub(rF(Z(0), lw.mul(1.05), jP(S.impact.sub(S.bCrit.mul(k))))));
  for (let k of [1.22, 1.4, 1.62, 1.9, 2.25, 2.7]) {
    let w = lw.mul(XP(Z(1.35), Z(.65), rF(Z(1.2), Z(2.6), Z(k))));
    let iso = Z(1).sub(rF(Z(0), w, jP(S.impact.sub(S.bCrit.mul(k)))));
    iso = iso.mul(rF(Z(.06), Z(.42), S.disk));
    lines = JP(lines, iso);
  }
  let cuts = Z(0);
  for (let a of [-2.15, -.65, .6, 1.75, 2.55]) {
    let cut = Z(1).sub(rF(Z(0), Z(.016).mul(e.strokeScale), jP(S.ang.sub(a))));
    let band = rF(S.bCrit.mul(1.04), S.bCrit.mul(1.18), S.impact).mul(Z(1).sub(rF(S.bCrit.mul(1.85), S.bCrit.mul(2.25), S.impact)));
    let dash = tF(UP(S.impact.mul(3.2)).lessThan(.5), Z(1), Z(0));
    cuts = JP(cuts, cut.mul(band).mul(rF(Z(.12), Z(.48), S.disk)).mul(dash));
  }
  lines = JP(lines, cuts);
  let cx = jP(S.uv.x.sub(.5)).mul(e.resolution.x);
  let cy = jP(S.uv.y.sub(.5)).mul(e.resolution.y);
  let hLine = Z(1).sub(rF(Z(0), Z(1.05), cy));
  let vLine = Z(1).sub(rF(Z(0), Z(1.05), cx));
  let dashH = tF(UP(px.x.div(pitch.mul(.7))).lessThan(.42), Z(1), Z(0));
  let dashV = tF(UP(px.y.div(pitch.mul(.7))).lessThan(.42), Z(1), Z(0));
  lines = JP(lines, JP(hLine.mul(dashH), vLine.mul(dashV)));
  lines = lines.mul(Z(1).sub(S.inHole.mul(Z(1).sub(S.disk))));
  col = XP(col, lineC, FP(lines, 0, 1));
  col = XP(col, holeC, S.inHole.mul(Z(1).sub(S.disk)));
  let limb = Z(1).sub(rF(Z(0), lw.mul(1.15), jP(S.impact.sub(S.bCrit))));
  col = XP(col, lineC, limb);
  return YP(JP(col, cF(0, 0, 0)), cF(1, 1, 1));
}
function styleVangogh(e, S) {
  let deep = lin3(`#0B1D51`), cobalt = lin3(`#1C3F94`), lightB = lin3(`#7FB2D9`), yellow = lin3(`#F2C230`), hi = lin3(`#FFE066`), ochre = lin3(`#C98A1B`), hole = lin3(`#050508`);
  let reg = HP(S.ang.add(3.2).mul(.85)).add(HP(S.rad.mul(3.2)));
  let flipH = OF(sF(reg, Z(1.7)));
  let flip = tF(flipH.greaterThan(.46), Z(1), Z(-1));
  let radialMix = OF(sF(reg.add(4), Z(2.2)));
  let along = S.ang.mul(flip).mul(2.1).add(S.rad.mul(XP(Z(3.5), Z(12), radialMix)));
  let across = S.rad.mul(18).div(e.strokeScale).mul(flip).add(S.ang.mul(XP(Z(1.1), Z(-1.4), radialMix)));
  let dashU = UP(along.mul(1.6));
  let dash = rF(Z(0), Z(.06), dashU).mul(Z(1).sub(rF(Z(.28), Z(.48), dashU)));
  let ridgeD = jP(UP(across).sub(.5));
  let ridge = Z(1).sub(rF(Z(.015).mul(e.strokeScale), Z(.14).mul(e.strokeScale), ridgeD));
  let crest = Z(1).sub(rF(Z(0), Z(.045).mul(e.strokeScale), ridgeD)).mul(dash);
  let mark = dash.mul(ridge);
  let col = XP(deep, cobalt, FP(mark.mul(1.15), 0, 1));
  col = XP(col, lightB, crest.mul(.5).mul(Z(1).sub(S.disk)));
  let g = Z(3.1);
  let hshJ = OF(sF(S.dir.y.mul(2.3), S.dir.x.add(1.7)));
  let qx = S.dir.x.mul(g).add(S.dir.z.mul(hshJ));
  let qy = S.dir.y.mul(g.mul(XP(Z(.7), Z(1.5), hshJ))).sub(S.dir.z.mul(.8));
  let cell = sF(HP(qx), HP(qy));
  let hsh = OF(sF(cell.x.add(2.2), cell.y.mul(1.7).add(5)));
  let h2 = OF(sF(cell.y.add(3), cell.x.mul(.7)));
  let h3 = OF(sF(cell.x.mul(1.4).add(8), Z(4)));
  let jx = OF(sF(cell.x, Z(8))).sub(.5);
  let jy = OF(sF(Z(3), cell.y)).sub(.5);
  let radK = h2.mul(1.1).add(.35);
  let local = sF(UP(qx).sub(.5).sub(jx.mul(.55)), UP(qy).sub(.5).sub(jy.mul(.55)));
  let d = GP(local).div(radK);
  let nRing = HP(h3.mul(3.2)).add(1);
  let rings = Z(1).sub(rF(Z(0), Z(.045), jP(UP(d.mul(nRing)).sub(.18))));
  let core = Z(1).sub(rF(Z(.01), Z(.05), d));
  let starM = tF(hsh.greaterThan(.8), Z(1), Z(0)).mul(tF(d.lessThan(.42), Z(1), Z(0)));
  starM = starM.mul(tF(S.impact.greaterThan(S.bCrit.mul(1.75)), Z(1), Z(0)));
  starM = starM.mul(Z(1).sub(S.disk)).mul(Z(1).sub(S.shadow));
  let starCol = XP(cobalt, yellow, FP(core.add(rings.mul(h2)), 0, 1));
  starCol = XP(starCol, hi, core.mul(hsh.mul(.4).add(.6)));
  col = XP(col, starCol, FP(starM.mul(JP(core, rings)), 0, 1));
  let diskMark = mark.mul(rF(Z(.22), Z(.55), S.disk));
  col = XP(col, XP(ochre, yellow, crest), diskMark);
  col = XP(col, hi, crest.mul(diskMark));
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
