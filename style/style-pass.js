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
function cunBand(e, S, y0, bellyPx, phase, bow) {
  let x = S.ndcX;
  let pxN = Z(2).div(e.resolution.y.max(1));
  let press = nF(x.mul(2.4).add(phase)).mul(.5).add(.5);
  let belly = Z(bellyPx).mul(e.strokeScale).mul(pxN).mul(XP(Z(.55), Z(1.25), press)).mul(.5);
  let yC = Z(y0).sub(x.mul(x).mul(bow)).add(nF(x.mul(1.6).add(phase)).mul(.016));
  let dy = jP(S.ndcY.sub(yC));
  let side = Z(1).sub(rF(Z(.16), Z(.5), jP(x)));
  let low = Z(1).sub(rF(Z(-.02), Z(.1), S.ndcY));
  let sky = Z(1).sub(rF(S.bCrit.mul(1.65), S.bCrit.mul(2.35), S.impact));
  let gate = side.mul(low).mul(sky);
  let acrossN = dy.div(belly.max(pxN));
  let coreMask = Z(1).sub(rF(belly.mul(.18), belly.mul(.5), dy));
  let streak = nF(acrossN.mul(8.4).add(phase)).mul(.5).add(.5);
  let fly = rF(Z(.7), Z(.9), streak);
  let flyBreak = rF(Z(.4), Z(.75), nF(x.mul(1.8).add(phase)).mul(.5).add(.5));
  fly = fly.mul(XP(Z(.45), Z(1), flyBreak)).mul(e.inkDry);
  let hair = rF(Z(.2), Z(.62), nF(acrossN.mul(6.2).add(Z(phase).mul(.7))).mul(.5).add(.5));
  let shoulder = rF(belly.mul(.34), belly.mul(.78), dy).mul(hair);
  let gapN = nF(x.mul(2.1).add(Z(phase).mul(1.1))).mul(.5).add(.5);
  let punch = rF(Z(.74), Z(.92), gapN);
  let bellyInk = coreMask.mul(Z(1).sub(fly.mul(.95))).mul(Z(1).sub(punch));
  let ink = FP(bellyInk.add(shoulder.mul(.4).mul(Z(1).sub(punch))).mul(gate), 0, 1);
  let wash = Z(1).sub(rF(belly.mul(.42), belly.mul(1.25), dy)).mul(gate).mul(Z(1).sub(punch.mul(.8)));
  let washMid = Z(1).sub(rF(belly.mul(.22), belly.mul(.92), dy)).mul(gate).mul(Z(1).sub(punch.mul(.55)));
  let core = coreMask.mul(Z(1).sub(fly)).mul(Z(1).sub(punch)).mul(gate);
  return { ink, wash, washMid, core };
}
function lensArc(e, S) {
  let along = S.ang.sub(Z(-2.35)).div(Z(2.22));
  let gate = rF(Z(-.02), Z(.06), along).mul(Z(1).sub(rF(Z(.9), Z(1.03), along)));
  let bow = nF(along.mul(3.1416)).mul(.05);
  let bC = S.bCrit.mul(Z(1.06).add(bow));
  let thick = rF(Z(0), Z(.16), along);
  let px = XP(Z(4), Z(14), thick);
  px = XP(px, Z(1.2), rF(Z(.58), Z(1), along));
  let half = S.bPx.mul(px).mul(e.strokeScale).mul(.5);
  let rd = jP(S.impact.sub(bC));
  let body = Z(1).sub(rF(half.mul(.62), half.add(S.bPx.mul(.25)), rd));
  let across = rd.div(half.max(S.bPx));
  let strand = rF(Z(.2), Z(.62), nF(across.mul(8).add(along.mul(4))).mul(.5).add(.5));
  let endW = rF(Z(.52), Z(.96), along);
  let holeN = OF(sF(along.mul(13), rd.mul(36).add(2)));
  let holes = rF(Z(.3), Z(.62), holeN).mul(e.inkDry).mul(endW);
  let brk = OF(sF(HP(along.mul(7).add(1.3)), Z(2.8)));
  let keep = XP(Z(1), rF(Z(.18), Z(.55), brk), endW);
  let ink = FP(body.mul(gate).mul(keep).mul(XP(Z(.7), Z(1), strand)).mul(Z(1).sub(holes)), 0, 1);
  let wash = Z(1).sub(rF(Z(0), half.mul(2.8).add(S.bPx.mul(2)), rd)).mul(gate);
  let washMid = Z(1).sub(rF(Z(0), half.mul(1.45), rd)).mul(gate);
  let core = Z(1).sub(rF(Z(0), half.mul(.2).add(S.bPx.mul(.2)), rd)).mul(ink).mul(Z(1).sub(endW));
  return { ink, wash, washMid, core };
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
  let diskA = rF(Z(.8), Z(3), alpha).toVar();
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
  return { uv, ndcX, ndcY, dir, impact, lum, lumC, disk, diskA, star, shadow, edge, ang, rad, bPx, bCrit, inHole };
}
function styleInk(e, S) {
  let paper = lin3(`#EDE4D0`), jiao = lin3(`#0B0906`), nong = lin3(`#231D17`), zhong = lin3(`#4A4036`), dan = lin3(`#9A8F80`), qing = lin3(`#D8CFBE`);
  let fiber = OF(sF(S.uv.x.mul(e.resolution.x).mul(.18), S.uv.y.mul(e.resolution.y).mul(.18)));
  let col = paper.add(cF(1, 1, 1).mul(fiber.sub(.5).mul(.02)));
  let far = Z(1).sub(S.inHole).mul(Z(1).sub(S.disk)).mul(rF(S.bCrit.mul(1.7), S.bCrit.mul(2.35), S.impact));
  let ridge = nF(S.uv.x.mul(5.2).add(.4)).mul(.5).add(.5);
  ridge = ridge.add(nF(S.uv.x.mul(12)).mul(.1));
  let mtnH = Z(.18).add(ridge.mul(.12));
  let mtn = Z(1).sub(rF(mtnH.sub(.01), mtnH.add(.008), S.uv.y));
  mtn = mtn.mul(rF(Z(.66), Z(.82), S.uv.x)).mul(far);
  col = XP(col, dan, mtn.mul(.5));
  let c1 = Z(1).sub(rF(Z(.045), Z(.062), GP(sF(S.uv.x.sub(.8), S.uv.y.sub(.84)))));
  let c2 = Z(1).sub(rF(Z(.03), Z(.046), GP(sF(S.uv.x.sub(.66), S.uv.y.sub(.74)))));
  let cloud = JP(c1, c2.mul(.85)).mul(rF(Z(.7), Z(.8), S.uv.y)).mul(rF(Z(.55), Z(.7), S.uv.x)).mul(far);
  col = XP(col, qing, cloud.mul(.6));
  let rough = OF(sF(S.ang.mul(2.6), Z(1.4))).sub(.5);
  let edgeB = S.bCrit.mul(Z(1).add(rough.mul(.03)));
  let hole = Z(1).sub(rF(edgeB.mul(.96), edgeB.mul(1.02), S.impact));
  let halo = rF(S.bCrit.mul(.98), S.bCrit.mul(1.05), S.impact).mul(Z(1).sub(rF(S.bCrit.mul(1.12), S.bCrit.mul(1.4), S.impact)));
  col = XP(col, qing, halo.mul(.4));
  let ink = Z(0), wash = Z(0), washMid = Z(0), core = Z(0);
  let bands = [
    [-0.05, 26, 0.4, 0.22],
    [-0.16, 32, 2.0, 0.3],
    [-0.27, 24, 3.7, 0.16],
    [-0.38, 28, 5.3, 0.26]
  ];
  for (let s of bands) {
    let b = cunBand(e, S, s[0], s[1], s[2], s[3]);
    ink = JP(ink, b.ink);
    wash = JP(wash, b.wash);
    washMid = JP(washMid, b.washMid);
    core = JP(core, b.core);
  }
  let arc = lensArc(e, S);
  ink = JP(ink, arc.ink);
  wash = JP(wash, arc.wash);
  washMid = JP(washMid, arc.washMid);
  core = JP(core, arc.core);
  col = XP(col, qing, FP(wash.mul(.9), 0, 1));
  col = XP(col, dan, FP(washMid.mul(.85), 0, 1));
  col = XP(col, zhong, FP(ink.mul(.58), 0, 1));
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
  let lw = S.bPx.mul(e.strokeScale).mul(.7);
  let lines = Z(0);
  for (let k of [.98, 1, 1.1]) lines = JP(lines, Z(1).sub(rF(Z(0), lw.mul(1.05), jP(S.impact.sub(S.bCrit.mul(k))))));
  for (let i = 0; i < 24; i++) {
    let k = 1.12 + i * 0.078;
    let fall = rF(Z(.015), Z(.55), S.disk);
    let w = lw.mul(XP(Z(.28), Z(1.05), fall)).mul(XP(Z(1.2), Z(.62), rF(Z(1.1), Z(3), Z(k))));
    let wob = nF(S.ang.mul(3).add(k * 1.7)).mul(S.bCrit.mul(.012));
    let iso = Z(1).sub(rF(Z(0), w, jP(S.impact.sub(S.bCrit.mul(k).add(wob)))));
    let nse = OF(sF(HP(nF(S.ang).mul(6).add(k * 5)), HP(S.impact.mul(6).add(k))));
    let keep = rF(XP(Z(.62), Z(.02), fall), XP(Z(.92), Z(.22), fall), nse);
    iso = iso.mul(rF(Z(.012), Z(.16), S.disk)).mul(keep);
    lines = JP(lines, iso);
  }
  let dDisk = GP(sF(RP(S.disk), zP(S.disk)));
  let edge = Z(1).sub(rF(Z(0), YP(dDisk.mul(1.2), Z(.2)), jP(S.disk.sub(.36))));
  edge = edge.mul(rF(Z(.03), Z(.11), dDisk));
  let phase = UP(nF(S.ang).mul(2.4).add(S.rad.mul(2.2)));
  let seg = rF(Z(0), Z(.05), phase).mul(Z(1).sub(rF(Z(.14), Z(.4), phase)));
  lines = JP(lines, edge.mul(seg));
  let edgeIn = Z(1).sub(rF(Z(0), YP(dDisk.mul(.85), Z(.14)), jP(S.disk.sub(.58))));
  let phaseIn = UP(nF(S.ang.add(1.2)).mul(2.1).add(1.3));
  let segIn = rF(Z(.02), Z(.08), phaseIn).mul(Z(1).sub(rF(Z(.16), Z(.34), phaseIn)));
  lines = JP(lines, edgeIn.mul(segIn).mul(rF(Z(.15), Z(.4), S.disk)));
  for (let a of [-2.2, -1.35, -.4, .45, 1.25, 2.05, 2.7]) {
    let tick = Z(1).sub(rF(Z(0), Z(.012).mul(e.strokeScale), jP(S.ang.sub(a))));
    lines = JP(lines, tick.mul(edge));
  }
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
  let sa = nF(S.ang);
  let ca = nF(S.ang.add(1.5707963));
  let flip = nF(sa.mul(1.4).add(ca.mul(1.9)).add(S.rad.mul(.6)));
  let radialMix = ca.mul(.5).add(.5);
  let along = sa.mul(2.4).add(ca.mul(XP(Z(-1.5), Z(1.7), radialMix))).add(S.rad.mul(XP(Z(4.5), Z(12), radialMix))).mul(flip.mul(.35).add(1));
  let across = S.rad.mul(28).div(e.strokeScale).add(sa.mul(XP(Z(2.4), Z(-1.6), radialMix))).add(ca.mul(.8));
  let dashU = UP(along.mul(2.6));
  let dash = rF(Z(0), Z(.04), dashU).mul(Z(1).sub(rF(Z(.2), Z(.46), dashU)));
  let dashV = UP(along.mul(2.6).add(.45));
  let dash2 = rF(Z(0), Z(.035), dashV).mul(Z(1).sub(rF(Z(.16), Z(.4), dashV)));
  let ridgeD = jP(UP(across).sub(.5));
  let ridge = Z(1).sub(rF(Z(.01), Z(.09), ridgeD));
  let ridgeFat = Z(1).sub(rF(Z(.02), Z(.24), ridgeD));
  let crest = Z(1).sub(rF(Z(0), Z(.07), ridgeD)).mul(JP(dash, dash2));
  let mark = JP(dash, dash2.mul(.85)).mul(ridge);
  let col = XP(deep, cobalt, FP(mark.mul(1.15), 0, 1));
  col = XP(col, lightB, crest.mul(.45).mul(Z(1).sub(S.disk)));
  let g = Z(11);
  let hshJ = OF(sF(S.dir.y.mul(2.3), S.dir.x.add(1.7)));
  let qx = S.dir.x.mul(g).add(S.dir.z.mul(hshJ));
  let qy = S.dir.y.mul(g.mul(XP(Z(.72), Z(1.45), hshJ))).sub(S.dir.z.mul(.8));
  let cell = sF(HP(qx), HP(qy));
  let hsh = OF(sF(cell.x.add(2.2), cell.y.mul(1.7).add(5)));
  let h2 = OF(sF(cell.y.add(3), cell.x.mul(.7)));
  let h3 = OF(sF(cell.x.mul(1.4).add(8), Z(4)));
  let jx = OF(sF(cell.x, Z(8))).sub(.5);
  let jy = OF(sF(Z(3), cell.y)).sub(.5);
  let radK = h2.mul(.85).add(.55);
  let local = sF(UP(qx).sub(.5).sub(jx.mul(.4)), UP(qy).sub(.5).sub(jy.mul(.4)));
  let d = GP(local).div(radK);
  let nRing = HP(h3.mul(3)).add(2);
  let rings = Z(1).sub(rF(Z(.015), Z(.055), jP(UP(d.mul(nRing)).sub(.2))));
  let orb = Z(1).sub(rF(Z(.18), Z(.62), d));
  let starM = tF(hsh.greaterThan(.965), Z(1), Z(0)).mul(tF(d.lessThan(.62), Z(1), Z(0)));
  starM = starM.mul(tF(S.impact.greaterThan(S.bCrit.mul(1.9)), Z(1), Z(0)));
  starM = starM.mul(Z(1).sub(rF(Z(.04), Z(.28), S.diskA))).mul(Z(1).sub(S.shadow));
  let starCol = XP(ochre, yellow, FP(rings.mul(.65).add(orb.mul(.35)), 0, 1));
  starCol = XP(starCol, hi, rings.mul(h2.mul(.45).add(.4)));
  col = XP(col, starCol, FP(starM.mul(JP(rings, orb.mul(.45))), 0, 1));
  let diskGate = rF(Z(.12), Z(.42), S.diskA);
  let dAcross = jP(UP(across.mul(1.7).add(sa.mul(1.1))).sub(.5));
  let dRidge = Z(1).sub(rF(Z(.015), Z(.2), dAcross));
  let dU = UP(along.mul(3.4).add(ca));
  let dDash = rF(Z(0), Z(.04), dU).mul(Z(1).sub(rF(Z(.18), Z(.42), dU)));
  let diskMark = JP(dash, dash2).mul(ridgeFat).mul(diskGate);
  let diskMark2 = dRidge.mul(dDash).mul(diskGate);
  col = XP(col, ochre, FP(diskMark.add(diskMark2), 0, 1));
  col = XP(col, yellow, FP(crest.mul(diskGate), 0, 1));
  col = XP(col, hi, FP(crest.mul(diskMark), 0, 1));
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
