// Moving neck for the finishing room: the approved neck (necklab/neck.js) rebuilt piece for piece — same geometry —
// but split by what each piece is bolted to, so the head can turn:
//   static (torso)  : spine column + foot ring, gorget lames, gorget FRONT PLATE with the intake hood/throat (never moves)
//   yaw stage       : turntable top, yoke crossbar + saddle, pitch disc housings, hanger plates
//                     (turns about the vertical axis through the turntable, x 0 / z -0.85)
//   pitch stage     : head + head mount housing + link plates + actuator lugs
//                     (tilts about the yoke's pitch axis, y 1.0 / z -1.05, carried by the yaw stage)
//   live            : 10 actuators (barrel keeps its length, piston rod slides) and 12 hoses, rebuilt from their ends.
// neck.js and head.js are not modified.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rod, disc, obox } from '../necklab/neck.js';
import { ROUND, roundConvexPoints } from './rounding.js';
import { smoothShading } from './surface.js';

const V3 = THREE.Vector3, UP = new V3(0, 1, 0), P = (x, y, z) => new V3(x, y, z);
export const NECK = { yawC: { x: 0, z: -0.85 }, pitchC: { y: 1.0, z: -1.05 } };

// Round only the user-selected static collar armour, before it is merged/painted.
// The U-shaped lames stay hollow: round their convex cross-section, never their 3D convex hull.
function roundedNeckHull(points, r, tag) {
  if (!ROUND.enabled) return new ConvexGeometry(points);
  const g = roundConvexPoints(points, r);
  if (!g) throw new Error('颈部护甲倒圆失败: ' + tag);
  ROUND.log.push(`✓ ${tag} R ${r.toFixed(3)}`);
  return g;
}
function roundedLameProfile(profile, radius, radialScale) {
  const pts = profile.flatMap(([x, y]) => [-4, 4].map(z => P(x * radialScale, y, z)));
  const g = roundConvexPoints(pts, radius);
  if (!g) throw new Error('围脖截面倒圆失败');
  const p = g.attributes.position, n = g.attributes.normal, unique = new Map();
  for (let i = 0; i < p.count; i++) if (Math.abs(n.getZ(i)) < 1e-5) {
    const x = p.getX(i) / radialScale, y = p.getY(i);
    unique.set(`${Math.round(x * 1e6)},${Math.round(y * 1e6)}`, [x, y]);
  }
  g.dispose();
  const out = [...unique.values()], c = out.reduce((s, p) => [s[0] + p[0] / out.length, s[1] + p[1] / out.length], [0, 0]);
  return out.sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
}

// copy of neck.js gorgetLame (not exported there)
function gorgetLame(prof, { a0, a1, seg, rx, rz, cz, y0, lift, drop = 0, edgeR = 0 }) {
  const rounded = ROUND.enabled && edgeR > 0;
  if (rounded) prof = roundedLameProfile(prof, edgeR, Math.min(rx, rz));
  const pos = [], ring = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = a0 + (a1 - a0) * u, back = Math.max(0, -Math.cos(a));
    const closed = a1 - a0 > 6.2, tip = closed ? 1 : Math.min(1, u / 0.14, (1 - u) / 0.14), k = 0.75 + 0.25 * tip;
    const fx = Math.abs(Math.sin(a)) * rx, front = Math.cos(a) > 0 ? Math.min(1, Math.max(0, (1.75 - fx) / 0.5)) : 0;
    ring.push(prof.map(([r, y]) => [Math.sin(a) * r * rx, y0 + y * k + lift * back * back - drop * front, cz + Math.cos(a) * r * rz]));
  }
  const tri = (p, q, r) => pos.push(...p, ...r, ...q);
  const n = prof.length;
  for (let i = 0; i < seg; i++) for (let j = 0; j < n; j++) {
    const A = ring[i][j], B = ring[i][(j + 1) % n], C = ring[i + 1][(j + 1) % n], D = ring[i + 1][j];
    tri(A, B, C); tri(A, C, D);
  }
  for (const [k, flip] of (rounded && a1 - a0 > 6.2 ? [] : [[0, false], [seg, true]])) {
    const R = ring[k], c = R.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let j = 0; j < n; j++) flip ? tri(c, R[j], R[(j + 1) % n]) : tri(c, R[(j + 1) % n], R[j]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (rounded) { const m = new THREE.Mesh(g); smoothShading(m, 35); return m.geometry; }
  return g;
}
const clean = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; };
const mergeL = list => mergeGeometries(list.map(clean));

// actuator split into a barrel half (pinned at b, the torso / yaw end) and a rod half (pinned at a, the moving end)
// same pieces as neck.js actuator(); the piston rod reaches deep into the barrel so extension never opens a gap
export function actuatorParts(a, b, r, { ext = 0.5 } = {}) {
  const dir = new V3().subVectors(a, b), L = dir.length(); dir.normalize();
  let pin = new V3().crossVectors(dir, new V3(0, 0, 1));
  if (pin.length() < 0.3) pin = new V3(1, 0, 0);
  pin.normalize();
  const at = t => b.clone().addScaledVector(dir, t);
  const barrel = [], rodEnd = [], rodG = [];
  const eyeB = r * 1.05, eyeA = r * 0.75;
  const barrel0 = eyeB * 1.1, barrel1 = L * (1 - ext);
  barrel.push(disc(b, pin, eyeB, r * 2.1));
  barrel.push(obox(at(barrel0 * 0.55), pin, dir, r * 1.5, barrel0 * 0.9, r * 1.5));
  const span = barrel1 - barrel0, s1 = barrel0 + span * 0.2, s2 = barrel0 + span * 0.8, gp = Math.min(0.025, r * 0.12);
  barrel.push(rod(at(barrel0), at(s1 - gp), r, 28), rod(at(s1 + gp), at(s2 - gp), r, 28), rod(at(s2 + gp), at(barrel1), r, 28));
  barrel.push(rod(at(s1 - gp), at(s1 + gp), r * 0.93, 28), rod(at(s2 - gp), at(s2 + gp), r * 0.93, 28));
  rodG.push(rod(at(barrel0 + 0.05), at(L - eyeA * 1.2), r * 0.58, 20));
  rodEnd.push(obox(at(L - eyeA * 0.9), pin, dir, r * 1.1, eyeA * 1.2, r * 1.1));
  rodEnd.push(disc(a, pin, eyeA, r * 1.6));
  return { barrel, rodEnd, rodG, dir, minL: barrel1 + eyeA * 1.2 + 0.02, maxL: L + (barrel1 - barrel0) - 0.1, L };
}

export function buildNeckRig(mats, headGroup) {
  const group = new THREE.Group(); group.name = 'neck';
  // pivots (authoring stays in world coordinates: each "In" group undoes its pivot offset)
  const yawPivot = new THREE.Group(); yawPivot.name = 'neckYawPivot'; yawPivot.position.set(NECK.yawC.x, 0, NECK.yawC.z);
  const yawIn = new THREE.Group(); yawIn.name = 'neckYawStage'; yawIn.position.set(-NECK.yawC.x, 0, -NECK.yawC.z); yawPivot.add(yawIn);
  const pitchPivot = new THREE.Group(); pitchPivot.name = 'neckPitchPivot'; pitchPivot.position.set(0, NECK.pitchC.y, NECK.pitchC.z);
  const pitchIn = new THREE.Group(); pitchIn.name = 'neckPitchStage'; pitchIn.position.set(0, -NECK.pitchC.y, -NECK.pitchC.z); pitchPivot.add(pitchIn);
  yawIn.add(pitchPivot); group.add(yawPivot);
  if (headGroup) pitchIn.add(headGroup);

  const B = { st: { clay: [], dark: [], exhaust: [] }, yaw: { clay: [], dark: [] }, head: { clay: [], dark: [] } };
  const sym = fn => { for (const s of [1, -1]) fn(s); };
  const BASE = -1.5;

  // ---- static: collar recess, spine foot ring, spine column (telescopic), ribbed cable guard, turntable base ----
  B.st.dark.push(disc(P(0, BASE + 0.04, -0.45), UP, 0.78, 0.12, 48));
  B.st.clay.push(disc(P(0, BASE + 0.12, -0.45), UP, 0.62, 0.2, 48));
  const spB = P(0, BASE + 0.2, -0.45), spT = P(0, 0.62, -0.85), spD = new V3().subVectors(spT, spB), sp = t => spB.clone().addScaledVector(spD, t);
  B.st.clay.push(obox(sp(0.22), P(1, 0, 0), spD, 0.52, spD.length() * 0.44, 0.56));
  B.st.clay.push(obox(sp(0.62), P(1, 0, 0), spD, 0.42, spD.length() * 0.42, 0.46));
  B.st.clay.push(obox(sp(0.45), P(1, 0, 0), spD, 0.6, 0.1, 0.64));
  for (let t = 0.06; t < 0.9; t += 0.055) { if (Math.abs(t - 0.45) < 0.04) continue;
    const big = t < 0.45; B.st.dark.push(obox(sp(t).add(P(0, 0, big ? 0.3 : 0.25)), P(1, 0, 0), spD, big ? 0.42 : 0.34, 0.045, 0.1)); }
  B.st.clay.push(disc(P(0, 0.72, -0.85), UP, 0.5, 0.16, 48));                  // turntable base ring
  // ---- yaw stage: turntable top, crossbar, saddle, pitch discs, hanger plates ----
  B.yaw.dark.push(disc(P(0, 0.82, -0.85), UP, 0.4, 0.06, 48));
  B.yaw.clay.push(disc(P(0, 0.9, -0.85), UP, 0.46, 0.12, 48));
  const PIV = { y: 1.0, z: -1.05, x: 1.28 };
  B.yaw.clay.push(obox(P(0, PIV.y, PIV.z), P(1, 0, 0), UP, PIV.x * 2, 0.26, 0.34));
  B.yaw.clay.push(obox(P(0, 0.93, -0.92), P(1, 0, 0), UP, 0.9, 0.12, 0.6));
  sym(s => {
    const c = P(s * PIV.x, PIV.y, PIV.z);
    B.yaw.clay.push(disc(c, P(1, 0, 0), 0.27, 0.26));
    B.yaw.clay.push(disc(c.clone().add(P(s * 0.15, 0, 0)), P(1, 0, 0), 0.2, 0.06));
    B.yaw.dark.push(disc(c.clone().add(P(s * 0.17, 0, 0)), P(1, 0, 0), 0.13, 0.06));
    B.yaw.clay.push(disc(c.clone().add(P(s * 0.2, 0, 0)), P(1, 0, 0), 0.07, 0.08));
    // link plate: pitch disc -> head bracket (pivots on the disc, so it rides with the head)
    const top = P(s * 1.36, 1.55, -0.55);
    B.head.clay.push(obox(c.clone().lerp(top, 0.5), P(1, 0, 0), new V3().subVectors(top, c), 0.12, c.distanceTo(top) + 0.3, 0.34));
    { const c2 = P(s * 1.2, PIV.y, PIV.z), e = P(s * 1.2, 0.5, -0.82);
      B.yaw.clay.push(obox(c2.clone().lerp(e, 0.5), P(1, 0, 0), new V3().subVectors(e, c2), 0.1, c2.distanceTo(e) + 0.2, 0.26)); }
    // head-side actuator lugs
    B.head.clay.push(obox(P(s * 1.18, 1.38, -0.42), P(1, 0, 0), UP, 0.5, 0.22, 0.42));
    B.head.clay.push(obox(P(s * 0.36, 1.03, 0.22), P(1, 0, 0), UP, 0.3, 0.16, 0.3));
    B.head.clay.push(obox(P(s * 0.45, 1.2, -1.5), P(1, 0, 0), UP, 0.44, 0.12, 0.42));
  });
  // ---- pitch stage: head mount housing on the head underside ----
  {
    const prof = [[-0.25, 1.25], [-1.45, 1.25], [-1.85, 1.62], [-1.85, 2.6], [-0.25, 2.6]].map(([z, y]) => new THREE.Vector2(z, y));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: 1.9, bevelEnabled: false });
    g.translate(0, 0, -0.95); g.rotateY(-Math.PI / 2); B.head.clay.push(g);
    B.head.dark.push(obox(P(0, 1.24, -0.85), P(1, 0, 0), UP, 1.5, 0.03, 0.9));
    sym(s => { for (const y of [1.78, 1.92, 2.06]) B.head.dark.push(obox(P(s * 0.55, y, -1.86), P(1, 0, 0), UP, 0.5, 0.06, 0.03)); });
  }
  // ---- static: gorget lames + front plate with the intake hood and throat (torso-fixed, never follows the head) ----
  {
    const G = { a0: 0, a1: 2 * Math.PI, seg: 20, rx: 3.0, rz: 1.75, cz: -0.7, edgeR: 0.055 };
    B.st.clay.push(gorgetLame([[0.9, -0.2], [1.06, -0.2], [1.12, 0.35], [1.1, 0.75], [1.02, 0.92], [0.9, 0.92]], { ...G, y0: -1.0, lift: 0.4, drop: 0.3 }));
    const T = [];
    for (const s of [1, -1]) T.push(P(s * 1.7, -0.36, -0.4), P(s * 1.7, -0.36, 1.12), P(s * 1.72, -0.9, 1.34), P(s * 2.0, -2.32, 1.75), P(s * 0.95, -2.75, 2.2), P(s * 2.0, -2.32, -0.4), P(s * 0.95, -2.75, -0.4), P(s * 1.35, -2.5, -0.4));
    B.st.clay.push(roundedNeckHull(T, 0.065, 'neckFrontPlate'));
    const fd = P(0, -1.85, 0.86).normalize(), fn = P(0, 0.86, 1.85).normalize();
    const on = (x, y, o = 0) => P(x, y, 1.34 + (y + 0.9) / -1.85 * 0.86).addScaledVector(fn, o);
    const H = (x, y, o, d = 0) => on(x, y, o).addScaledVector(fd, -d);
    const MB = -2.25, TOP = (x) => H(x, MB, 0.45, 0.98), F = P(0, 0, 1);
    B.st.clay.push(roundedNeckHull([H(1.12, MB, 0), H(-1.12, MB, 0), TOP(0.86), TOP(-0.86), P(0.62, -0.55, 1.19), P(-0.62, -0.55, 1.19), H(0.88, -0.95, 0), H(-0.88, -0.95, 0)], 0.045, 'neckIntakeHood')); 
    const mouth = [[1.02, 0.04], [-1.02, 0.04], [0.8, 0.9], [-0.8, 0.9]].map(([x, t]) => H(x, MB, 0).lerp(TOP(x), t));
    B.st.exhaust.push(new ConvexGeometry([...mouth.map(p => p.clone().addScaledVector(F, 0.006)), ...mouth.map(p => p.clone().addScaledVector(F, -0.4))]));
    B.st.clay.push(gorgetLame([[0.84, 0], [0.98, 0], [1.03, 0.3], [1.0, 0.55], [0.92, 0.66], [0.84, 0.66]], { ...G, a0: 0.64, a1: 2 * Math.PI - 0.64, y0: -0.28, lift: 0.6, drop: 0.35, edgeR: 0.045 }));
  }
  const mk = (list, mat, name, parent) => { if (!list.length) return; const m = new THREE.Mesh(mergeL(list), mat); m.name = name; parent.add(m); return m; };
  mk(B.st.clay, mats.clay, 'neckClay', group); mk(B.st.dark, mats.dark, 'neckDark', group); mk(B.st.exhaust, mats.dark, 'exhaustThroat', group);
  mk(B.yaw.clay, mats.clay, 'neckYoke', yawIn); mk(B.yaw.dark, mats.dark, 'neckYokeDark', yawIn);
  mk(B.head.clay, mats.clay, 'neckMount', pitchIn); mk(B.head.dark, mats.dark, 'neckMountDark', pitchIn);

  // ---- live actuators: [moving end a, its stage, fixed end b, r, ext] ----
  const acts = [];
  const addAct = (name, a, stage, b, r, ext) => {
    const q = actuatorParts(a, b, r, { ext });
    const bar = new THREE.Group(), end = new THREE.Group(); bar.position.copy(b); end.position.copy(a);
    const g1 = mergeL(q.barrel); g1.translate(-b.x, -b.y, -b.z);
    const g2 = mergeL(q.rodEnd); g2.translate(-a.x, -a.y, -a.z);
    const g3 = mergeL(q.rodG); g3.translate(-a.x, -a.y, -a.z);
    const m1 = new THREE.Mesh(g1, mats.clay); m1.name = name + '.act:clay'; bar.add(m1);
    const m2 = new THREE.Mesh(g2, mats.clay); m2.name = name + '.act:clay'; end.add(m2);
    const m3 = new THREE.Mesh(g3, mats.chrome || mats.clay); m3.name = 'neckRods'; end.add(m3);
    group.add(bar, end);
    acts.push({ name, a: a.clone(), stage, b: b.clone(), dir0: q.dir, bar, end, minL: q.minL, maxL: q.maxL, L0: q.L });
  };
  sym(s => {
    const t = s > 0 ? 'R' : 'L';
    addAct('neckFront' + t, P(s * 1.18, 1.3, -0.42), pitchIn, P(s * 1.05, BASE + 0.05, -0.02), 0.22, 0.42);
    addAct('neckInner' + t, P(s * 0.36, 0.95, 0.22), pitchIn, P(s * 0.34, BASE + 0.05, 0.62), 0.13, 0.45);
    addAct('neckRear' + t, P(s * 0.45, 1.12, -1.5), pitchIn, P(s * 0.45, BASE + 0.05, -1.3), 0.2, 0.4);
    addAct('neckDiagHi' + t, P(s * 1.32, 0.78, -1.15), yawIn, P(s * 2.12, -0.88, -1.85), 0.15, 0.45);
    addAct('neckDiagLo' + t, P(s * 1.22, 0.5, -0.82), yawIn, P(s * 1.98, -0.9, -0.5), 0.13, 0.45);
  });

  // ---- live hoses: top end on a moving stage, bottom end on the torso; middle points blend between the two ----
  const hoses = [];
  const W = [1, 1, 0.66, 0.33, 0, 0];
  const addHose = (pts, r, stage) => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mats.dark); m.name = 'neckHose'; group.add(m);
    hoses.push({ pts: pts.map(p => P(...p)), r, stage, m });
  };
  sym(s => {
    addHose([[s * 0.62, 1.6, -0.55], [s * 0.62, 1.2, -0.5], [s * 0.72, 0.4, -0.25], [s * 0.66, -0.6, -0.15], [s * 0.7, -1.45, -0.1], [s * 0.7, -1.7, -0.1]], 0.07, pitchIn);
    addHose([[s * 0.55, 1.55, -0.4], [s * 0.55, 1.1, -0.25], [s * 0.6, 0.2, 0.1], [s * 0.52, -0.8, 0.25], [s * 0.58, -1.45, 0.3], [s * 0.58, -1.7, 0.3]], 0.055, pitchIn);
    addHose([[s * 0.85, 1.6, -0.8], [s * 0.85, 1.25, -0.8], [s * 0.95, 0.3, -0.6], [s * 0.9, -0.7, -0.75], [s * 0.95, -1.45, -0.8], [s * 0.95, -1.7, -0.8]], 0.08, pitchIn);
    addHose([[s * 0.12, 1.6, -1.38], [s * 0.12, 1.2, -1.4], [s * 0.14, 0.3, -1.45], [s * 0.12, -0.7, -1.45], [s * 0.13, -1.45, -1.35], [s * 0.13, -1.7, -1.35]], 0.06, pitchIn);
    addHose([[s * 1.1, 1.0, -1.1], [s * 1.05, 0.7, -1.3], [s * 1.35, 0, -1.55], [s * 1.7, -0.6, -1.6], [s * 1.95, -0.9, -1.4], [s * 1.95, -1.15, -1.4]], 0.06, yawIn);
    addHose([[s * 0.9, 1.5, -0.35], [s * 0.92, 1.1, -0.2], [s * 0.95, 0.4, -0.1], [s * 1.2, -0.3, -0.1], [s * 1.6, -0.8, -0.3], [s * 1.95, -1.05, -0.4]], 0.05, pitchIn);
  });

  // stage point (authored in world rest coords) -> neck-group coords at the current pose
  const inv = new THREE.Matrix4(), tmp = new V3();
  const toGroup = (stage, p) => { group.updateMatrixWorld(true); inv.copy(group.matrixWorld).invert(); return tmp.copy(p).applyMatrix4(stage.matrixWorld).applyMatrix4(inv).clone(); };
  const q = new THREE.Quaternion();
  const pose = { yaw: 0, pitch: 0 };
  const apply = () => {
    const R = Math.PI / 180;
    yawPivot.rotation.y = pose.yaw * R;
    pitchPivot.rotation.x = -pose.pitch * R;          // + pitch = look up
    for (const c of acts) {
      const a = toGroup(c.stage, c.a), d = new V3().subVectors(a, c.b); c.len = d.length(); d.normalize();
      q.setFromUnitVectors(c.dir0, d);
      c.bar.quaternion.copy(q); c.end.position.copy(a); c.end.quaternion.copy(q);
    }
    for (const h of hoses) {
      const pts = h.pts.map((p, i) => W[i] ? p.clone().lerp(toGroup(h.stage, p), W[i]) : p.clone());
      h.m.geometry.dispose();
      h.m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, h.r, 10);
    }
  };
  apply();
  return {
    group, yawPivot, pitchPivot, yawIn, pitchIn, acts, hoses, pose,
    set(yaw, pitch) { pose.yaw = yaw; pose.pitch = pitch; apply(); },
    // stroke check: actuators whose length leaves the barrel/rod travel
    stroke() { return acts.filter(c => c.len < c.minL || c.len > c.maxL).map(c => `${c.name} ${c.len.toFixed(2)} (${c.minL.toFixed(2)}..${c.maxL.toFixed(2)})`); },
  };
}
