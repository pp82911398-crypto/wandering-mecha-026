// Arms: three arms on the torso sockets, each with its own hidden weapon (closed = normal arm, t = 1 = deployed).
//   right (+x)      : standard size, plasma cannon in the forearm. Deploy: hand swings back onto the forearm,
//                     muzzle doors open, barrel slides out, outer cooling panel opens.
//   left front (-x) : biggest, segmented blade stacked on the outer forearm. Deploy: hand closes to a fist,
//                     segments slide down the rail one by one and lock into a straight blade beside the fist.
//   left rear (-x)  : saw claw (three fingers on a spinning wrist drum). Deploy: fingers splay flat, drum spins.
// World frame = head frame (x right, y up, z forward, 1 unit ~ 2.05 m). Each arm is built in a local frame where
// +x points away from the body; the left arms are mirrored with root.scale.x = -1.
// Chain per arm: hub (torso) -> pitch drum (axis x) -> abduction knuckle (axis z) -> upper arm -> elbow (axis x)
// -> forearm -> wrist / hand. Actuators that span two moving bodies are "live" and re-aim when the joints move.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, INTERSECTION, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rod, disc, obox } from '../necklab/neck.js';
import { ROUND, roundBrushGeometry } from '../finallab/rounding.js';

const V3 = THREE.Vector3, P = (x, y, z) => new V3(x, y, z), O = () => new V3();
const X = new V3(1, 0, 0), Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);
const clamp01 = t => Math.min(1, Math.max(0, t));
const win = (t, a, b) => clamp01((t - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- key dimensions (hubs from torsolab/torso.js; left front hub sits at z 1.6 there) ----------
//   ks = shoulder drum / yoke scale, k = limb cross-section scale, kh = hand scale, L1 / L2 = upper arm / forearm length
//   ox / oz = upper-arm armour offset (out / forward), aw / ad = armour width / depth factor, abdPins = which side
//   (+1 front, -1 back) carries an abduction actuator; pose = hanging rest pose, ready = combat pose the arm moves
//   to while its weapon deploys (first half of t)
export const ARM = {
  right: { deltoid: true, visorMax: 2.75, hub: [5.0, -4.35, 0.6], capX: 1.03, ks: 0.85, drum: 0.82, k: 1.02, kh: 1.1, armorTo: -4.55, armor: { sx: 1.12, zb: 1.25, window: [1.0, 2.4, -4.0, -1.3] }, L1: 5.2, L2: 4.8, aw: 0.9, pose: { pitch: 0.04, abd: 0.07, elbow: 0.26 }, ready: { pitch: 0.35, abd: 0.12, elbow: 1.15 } },
  leftFront: { deltoid: true, visorMax: 2.85, pitchRange: [-20, 120], pitchActZ: 0.75, hub: [-5.0, -4.35, 1.6], capX: 1.03, ks: 0.8, drum: 0.75, yoke: 1.9, abdPins: [-1], k: 1.1, kh: 1.1, armorTo: -4.63, armor: { sx: 1.05, zb: 1.37 }, L1: 4.74, L2: 4.68, aw: 0.92, pose: { pitch: 0.0, abd: 0.08, elbow: 0.24 }, ready: { pitch: 0.2, abd: 0.12, elbow: 0.95 } },
  leftRear: { deltoid: true, pitchRange: [-180, 10], hub: [-3.6, -2.2, -3.4], capX: 0.78, ks: 1.1, yoke: 1.6, k: 0.98, kh: 1.1, armorTo: -3.35, armor: { sx: 1.0, zb: 1.2 }, L1: 4.8, L2: 4.4, drum: 1.25, ox: 0.35, oz: -0.5, aw: 0.88, ad: 0.85, abdPins: [-1], topZ: 0.4, botZ: 0.75, hingeSpan: 0.65, flapK: 0, abdMax: 65, pose: { pitch: -0.1, abd: 0.12, elbow: 0.3 }, ready: { pitch: -0.38, abd: 0.32, elbow: 0.5 }, elbowMin: -0.85 },
};

// ---------- geometry helpers ----------
function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
// collects geometry per material, merges it into meshes on a group (one rigid body)
class Kit {
  constructor() { this.m = {}; }
  add(mat, ...gs) { (this.m[mat] ||= []).push(...gs); return this; }
  into(group, mats, tag) {
    for (const [k, list] of Object.entries(this.m)) if (list.length) {
      const mesh = new THREE.Mesh(mergeGeometries(list.map(clean)), mats[k] || mats.clay);
      mesh.name = tag + ':' + k; mesh.userData.part = tag; group.add(mesh);
    }
    this.m = {}; return group;
  }
}
// chamfered rectangle section at height y (w along x, d along z), centred at (cx, cz)
function sec(y, w, d, c = 0.25, cx = 0, cz = 0) {
  const a = w / 2, b = d / 2; c = Math.min(c, a * 0.95, b * 0.95);
  return [[a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b], [a, -b + c]].map(([x, z]) => P(cx + x, y, cz + z));
}
const hullOf = (...pts) => new ConvexGeometry(pts.flat());
const grp = (parent, pos, name) => { const g = new THREE.Group(); if (pos) g.position.copy(pos); if (name) g.name = name; parent.add(g); return g; };
const bolt = (q, p, n, r = 0.055) => q.add('chrome', disc(p, n, r, 0.05, 8));
const tube = (q, pts, r) => q.add('dark', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => P(...p))), 32, r, 8));

// ---------- live actuator: barrel on body A, rod on body B, both re-aimed every update ----------
function aim(g, parent, target, pref) {
  const y = parent.worldToLocal(target.clone()).sub(g.position).normalize();
  let x = pref.clone().addScaledVector(y, -pref.dot(y));
  if (x.lengthSq() < 1e-4) x = (pref === Z ? X : Z).clone().addScaledVector(y, -y.dot(pref === Z ? X : Z));
  x.normalize();
  const z = new V3().crossVectors(x, y);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
class LiveAct {
  constructor(A, pa, B, pb, r, tag, pref = X) {
    Object.assign(this, { A, B, pa: pa.clone(), pb: pb.clone(), r, tag, pref });
    this.gA = grp(A, pa); this.gB = grp(B, pb);
  }
  dist() { return this.A.worldToLocal(this.B.localToWorld(this.pb.clone())).distanceTo(this.pa); }
  // telescopic cylinder sized for the whole joint range: n nested stages of equal length, each fits fully retracted
  // at Dmin and keeps >= 15 % overlap at Dmax (a plain 2-stage cylinder cannot cover a 90-130 degree joint swing)
  build(mats, Dmin, Dmax) {
    const r = this.r, Ls = Math.max(r * 3, Dmin - r * 2.0), n = Math.max(2, Math.ceil(1 + (Dmax - Ls) / (0.85 * Ls)));
    this.n = n; this.Ls = Ls;
    this.range = { Dmin: +Dmin.toFixed(2), Dmax: +Dmax.toFixed(2), stages: n, Ls: +Ls.toFixed(2), ok: Ls <= Dmin - r * 1.9 + 1e-6 && Ls + (n - 1) * 0.85 * Ls >= Dmax };
    if (!this.range.ok) console.warn('actuator stroke', this.tag, this.range);
    const at = y => P(0, y, 0);
    const a = new Kit(); a.add('clay', disc(O(), X, r * 1.05, r * 2.1), obox(at(r * 0.95), X, Y, r * 1.5, r * 0.9, r * 1.5)); a.into(this.gA, mats, this.tag);
    // the B end lives in B's frame: if B is scaled differently from A (scaled arm under an unscaled shoulder), match A's size
    const sA = Math.abs(this.A.getWorldScale(new V3()).y), sB = Math.abs(this.B.getWorldScale(new V3()).y), rb = r * sA / sB;
    const b = new Kit(); b.add('clay', disc(O(), X, rb * 0.8, rb * 1.6), obox(P(0, rb * 0.85, 0), X, Y, rb * 1.1, rb * 0.9, rb * 1.1)); b.into(this.gB, mats, this.tag);
    // stages hang off the A end (aimed at B); stage i is placed along the line in update()
    this.stages = [];
    for (let i = 0; i < n; i++) {
      const g = grp(this.gA), k = new Kit(), ri = r * (1 - 0.16 * i), last = i === n - 1;
      if (!last) { k.add('clay', rod(at(0), at(Ls), ri, 28)); k.add('dark', rod(at(Ls - 0.05), at(Ls), ri * 1.06, 28)); }   // sleeve + gland ring
      else k.add('chrome', rod(at(0), at(Ls), ri * 0.75, 20));
      k.into(g, mats, this.tag); this.stages.push(g);
    }
  }
  update() {
    aim(this.gA, this.A, this.B.localToWorld(this.pb.clone()), this.pref);
    aim(this.gB, this.B, this.A.localToWorld(this.pa.clone()), this.pref);
    if (!this.stages) return;
    const r = this.r, D = this.dist(), span = Math.max(0, D - r * 1.0 - this.Ls - r * 0.9), n = this.n;   // first stage starts past A's clevis, last ends at B's eye block
    this.stages.forEach((g, i) => { g.position.set(0, r * 1.0 + span * (n > 1 ? i / (n - 1) : 0), 0); });
  }
}

// ---------- left rear compact shoulder shell (rides on the rear arm's drum; stays within ~2.1 of its axis so it
// can turn without reaching the left front pauldron). Local frame of the rear arm: x out from the hub, origin on the axis.
// Octagon cap (user picked this one out of three).
const csg = new Evaluator(); csg.attributes = ['position']; csg.useGroups = false;
const toBrush = (g) => { g = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); const b = new Brush(mergeVertices(g, 1e-5)); b.updateMatrixWorld(); return b; };
const cOp = (a, b, op) => { const r = csg.evaluate(a, b, op); r.updateMatrixWorld(); return r; };
// Sliding-panel seams: round a clean, bounded portion of the pre-cavity outer hull,
// then intersect the existing plate with it. Pockets/cavities remain intact; no final-mesh bevel.
function roundSlatBoundary(geometry, sourceName, tag) {
  if (!ROUND.enabled || !/^pauldron/.test(sourceName)) return geometry;
  const ref = ROUND.refs.find(r => r.tag === sourceName.replace(/[vf]$/, ''));
  if (!ref) throw new Error('肩甲圆角缺少原始外形: ' + sourceName);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, size = box.getSize(new V3()), centre = box.getCenter(new V3());
  if (Math.min(size.x, size.y, size.z) < 0.008) return geometry;
  const selector = toBrush(new THREE.BoxGeometry(size.x + 0.00002, size.y + 0.00002, size.z + 0.00002).translate(centre.x, centre.y, centre.z));
  const outer = cOp(toBrush(new ConvexGeometry(ref.orig)), selector, INTERSECTION);
  const mask = roundBrushGeometry(outer.geometry, 0.035, tag, 30);
  if (!mask) throw new Error('肩甲接缝倒圆失败: ' + tag);
  const result = cOp(toBrush(geometry), toBrush(mask.geo), INTERSECTION).geometry.clone();
  if (!result.attributes.position.count) throw new Error('肩甲接缝倒圆产生空面: ' + tag);
  return result;
}
const prismG = (pts, depth = 30) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g; };
const fPrism = (xy) => toBrush(prismG(xy));
const sPrism = (zy) => { const g = prismG(zy); g.rotateY(-Math.PI / 2); return toBrush(g); };
const shift = (b, dx, dy, dz) => { const g = b.geometry.clone(); g.translate(dx, dy, dz); const r = new Brush(g); r.updateMatrixWorld(); return r; };
function insetPoly(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, lines = poly.map((a, i) => { const b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); return [[a[0] - ey / L * sg * d, a[1] + ex / L * sg * d], [ex, ey]]; });
  return lines.map((l1, i) => { const [p, r] = lines[(i - 1 + n) % n], [q, s] = l1, den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return q; const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den; return [p[0] + r[0] * t, p[1] + r[1] * t]; });
}
const octo = (r, sy = 1) => Array.from({ length: 8 }, (_, i) => { const a = (i + 0.5) / 8 * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r * sy]; });
const REAR_SHELL = { F: [[1.25, 2.0], [2.7, 1.7], [3.7, 0.85], [3.8, -0.2], [1.25, -1.45]], S: octo(2.1) };   // outer underside cut up on a slant: the arm swings out under it, so the shell needs no flap   // front (x, y) / side (z, y) outlines
function buildRearShell() {
  const D = REAR_SHELL, W = 0.28;
  const outer = cOp(fPrism(D.F), sPrism(D.S), INTERSECTION);
  const inner = cOp(fPrism(insetPoly(D.F, W)), sPrism(insetPoly(D.S, W)), INTERSECTION);
  // open underneath and towards the body (drum + yoke pass through), keep the front/back walls
  const cav = cOp(cOp(cOp(inner, shift(inner, 0, -0.9, 0), ADDITION), shift(inner, -0.6, 0, 0), ADDITION), shift(inner, -0.6, -0.9, 0), ADDITION);
  let shell = cOp(outer, cav, SUBTRACTION);
  const geos = { clay: [], dark: [] };
  // panel line round the shell
  const seam = cOp(cOp(fPrism(D.F.map(([x, y]) => [x + (x > 2 ? 0.02 : 0), y])), sPrism(D.S.map(([z, y]) => [z * 1.012, y * 1.012])), INTERSECTION), toBrush(new THREE.BoxGeometry(0.06, 9, 9).translate(2.45, 0, 0)), INTERSECTION);
  geos.dark.push(cOp(seam, cav, SUBTRACTION).geometry.clone());
  shell = cOp(shell, toBrush(new THREE.BoxGeometry(0.06, 9, 9).translate(2.45, 0, 0)), SUBTRACTION);
  geos.clay.push(shell.geometry.clone());
  for (const k in geos) geos[k] = geos[k].map(g => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; });
  return geos;
}

// ---------- arm size + forearm armour plates ----------
// user: arms 30 % thinner (left front 35 %), lengths unchanged; the forearm armour on top keeps the overall size
const tPrism = (xz) => { const g = prismG(xz.map(([x, z]) => [x, -z])); g.rotateX(-Math.PI / 2); return toBrush(g); };
// Plates traced from the arm design sheet (armlab/ref/arm_sheet.png, a LEFT arm, mirrored), 39.3 px per unit, built in the
// forearm frame (origin = elbow axis, x out, y down the forearm, z forward). Each view's forearm axis is turned upright first.
const SH = 1 / 39.3;
const FORE_SEG = { Tf: [530, 405], Ef: [482, 632], Ti: [772, 397], Ei: [748, 622] };
const FORE_PLATES = [
  { f: [[447, 382], [480, 382], [535, 427], [500, 480], [495, 620], [450, 632], [440, 620], [417, 465], [425, 410]],
    s: [[700, 390], [742, 393], [762, 465], [745, 530], [725, 615], [710, 618], [695, 470]], open: [0, 0, -1], t: 0.2 },   // big front plate, open to the back
];
function sheetPlates(seg, plates) {
  const deskew = (T, E) => { const a = Math.atan2(E[0] - T[0], E[1] - T[1]), c = Math.cos(a), s2 = Math.sin(a);
    return ([px, py]) => { const dx = px - T[0], dy = py - T[1]; return [dx * c - dy * s2, dx * s2 + dy * c]; }; };
  const df = deskew(seg.Tf, seg.Ef), di = deskew(seg.Ti, seg.Ei);
  const F = (pts) => pts.map(p => { const [u, v] = df(p); return [-u * SH, -v * SH]; });
  const Sd = (pts) => pts.map(p => { const [u, v] = di(p); return [-u * SH, -v * SH]; });
  const out = [];
  for (const pl of plates) {
    const fo = F(pl.f), so = Sd(pl.s), t = pl.t ?? 0.28;
    // plan section: chamfered, with a ridge down the middle of the outer face (faceted armour, not a slab)
    const x0 = Math.min(...fo.map(p => p[0])), x1 = Math.max(...fo.map(p => p[0])), z0 = Math.min(...so.map(p => p[0])), z1 = Math.max(...so.map(p => p[0]));
    const cx = (x0 + x1) / 2, c = Math.min(0.35, (x1 - x0) * 0.2, (z1 - z0) * 0.2), r = Math.min(0.3, (x1 - x0) * 0.12, (z1 - z0) * 0.12);
    const zf = z1, zb = z0;
    const plan = [[x0, zb], [x0, zf - (c + r)], [x0 + c, zf - r], [cx, zf], [x1 - c, zf - r], [x1, zf - (c + r)], [x1, zb]];
    const outer = cOp(cOp(fPrism(fo), sPrism(so), INTERSECTION), tPrism(plan), INTERSECTION);
    const inner = cOp(cOp(fPrism(insetPoly(fo, t)), sPrism(insetPoly(so, t)), INTERSECTION), tPrism(insetPoly(plan, t)), INTERSECTION), [ox, oy, oz] = pl.open;
    const res = cOp(outer, cOp(inner, shift(inner, ox * 3, oy * 3, oz * 3), ADDITION), SUBTRACTION);
    const g = res.geometry.clone(), g2 = g.index ? g.toNonIndexed() : g; g2.computeVertexNormals(); out.push(g2);
  }
  return out;
}

// ---------- five-finger hand (palm faces -x = towards the body, fingers hang along -y) ----------
function buildHand(parent, pos, k, mats, tag) {
  const K = v => v * k, hand = grp(parent, pos, tag + '.hand');
  const q = new Kit();
  q.add('clay', disc(O(), X, K(0.36), K(0.9)));                                   // wrist knuckle (axis x)
  q.add('chrome', disc(O(), X, K(0.13), K(1.25)));
  q.add('clay', obox(P(0, -K(0.32), 0), X, Y, K(0.52), K(0.42), K(0.82)));        // wrist block
  q.add('clay', hullOf(sec(-K(0.45), K(0.62), K(1.3), K(0.18)), sec(-K(1.0), K(0.78), K(1.62), K(0.2)), sec(-K(1.62), K(0.7), K(1.56), K(0.18))));   // palm
  q.add('clay', hullOf(sec(-K(0.5), K(0.2), K(1.22), K(0.08), K(0.42)), sec(-K(1.5), K(0.2), K(1.44), K(0.08), K(0.44))));                          // back-of-hand plate
  q.add('dark', obox(P(K(0.53), -K(1.0), 0), X, Y, K(0.02), K(0.05), K(1.2)));
  for (const [y, z] of [[-0.62, 0.48], [-0.62, -0.48], [-1.38, 0.58], [-1.38, -0.58]]) bolt(q, P(K(0.54), K(y), K(z)), X, K(0.045));
  q.add('clay', hullOf(sec(-K(0.55), K(0.5), K(0.45), K(0.12), -K(0.1), K(0.74)), sec(-K(1.15), K(0.46), K(0.42), K(0.1), -K(0.14), K(0.84))));   // thenar block
  q.into(hand, mats, tag + '.palm');

  const phal = (g, L, w, t, name) => {
    const f = new Kit();
    f.add('clay', disc(O(), Z, t * 0.46, w * 0.98));
    f.add('chrome', disc(O(), Z, t * 0.16, w * 1.12));
    f.add('clay', hullOf(sec(-K(0.1), t, w, K(0.07)), sec(-L + K(0.05), t * 0.9, w * 0.94, K(0.07))));
    f.add('clay', hullOf(sec(-K(0.14), K(0.09), w * 0.84, K(0.03), t * 0.5), sec(-L * 0.78, K(0.09), w * 0.78, K(0.03), t * 0.47)));   // knuckle guard
    f.into(g, mats, name);
  };
  const fingers = [], FZ = [0.57, 0.19, -0.19, -0.57], FS = [1.0, 1.06, 1.0, 0.86], FL = [0.62, 0.5, 0.42];
  FZ.forEach((z, i) => {
    let par = hand; const segs = [];
    for (let j = 0; j < 3; j++) {
      const g = grp(par, j === 0 ? P(0, -K(1.62), K(z)) : P(0, -K(FL[j - 1] * FS[i]), 0));
      phal(g, K(FL[j] * FS[i]), K(0.34 - j * 0.02), K(0.4 - j * 0.03), tag + '.finger' + i);
      segs.push(g); par = g;
    }
    fingers.push(segs);
  });
  const thumb = []; {
    const t0 = grp(hand, P(-K(0.14), -K(0.95), K(0.86))); t0.rotation.set(-0.42, 0, -0.38);
    let par = t0; const TL = [0.5, 0.42, 0.36];
    for (let j = 0; j < 3; j++) {
      const g = grp(par, j === 0 ? O() : P(0, -K(TL[j - 1]), 0));
      phal(g, K(TL[j]), K(0.36), K(0.4), tag + '.thumb'); thumb.push(g); par = g;
    }
  }
  const setCurl = (c) => {
    fingers.forEach(f => f.forEach((g, j) => g.rotation.z = -c * [1.0, 1.1, 0.9][j]));
    thumb.forEach((g, j) => g.rotation.z = -c * [0.4, 0.75, 0.7][j]);
  };
  setCurl(0.3);
  // open / close for the finishing room: g 0 = open (straight, fingers fanned a little), 0.3 = relaxed (= setCurl 0.3), 1 = fist.
  // Fingers close little finger first and open index first; joints only, no new parts.
  const SPREAD = FZ.map(z => -0.14 * Math.sign(z) * (Math.abs(z) > 0.3 ? 1 : 0.4)), LEAD = [-1, -0.33, 0.33, 1];   // index .. little finger
  const setGrip = (g) => {
    const curl = x => 1.45 * Math.pow(Math.max(0, Math.min(1, x)), 1.31);
    fingers.forEach((f, i) => {
      const c = curl(g + LEAD[i] * 0.6 * g * (1 - g));   // little finger leads mid-way, all meet at open / fist
      f.forEach((s, j) => s.rotation.z = -c * [1.0, 1.1, 0.9][j]);
      f[0].rotation.x = SPREAD[i] * Math.max(0, 1 - g / 0.3);
    });
    const ct = curl(g);
    thumb.forEach((s, j) => s.rotation.z = -ct * [0.4, 0.75, 0.7][j]);
  };
  return { hand, setCurl, setGrip };
}

// ---------- forearm: right, plasma cannon ----------
function forearmCannon(c) {
  const { K, mats, spec, elbow, id } = c, L2 = spec.L2, yb = -(L2 - 0.25), zc = K(0.05);
  const q = new Kit();
  q.add('clay', obox(P(0, -K(0.55), 0), X, Y, K(0.85), K(0.7), K(0.9)));         // neck from the elbow knuckle
  const h1 = -K(0.85), h2 = Math.max(-K(1.45), yb + 1.2);
  q.add('clay', hullOf(sec(h1, K(1.65), K(1.8), K(0.35), 0, zc), sec(h2, K(1.98), K(2.1), K(0.42), 0, zc), sec(yb + 0.7, K(1.86), K(1.98), K(0.4), 0, zc), sec(yb, K(1.6), K(1.7), K(0.34), 0, zc)));
  const pl = (h1 + h2) / 2;
  q.add('dark', hullOf(sec(pl + 0.03, K(1.83), K(1.97), K(0.4), 0, zc), sec(pl - 0.03, K(1.84), K(1.98), K(0.4), 0, zc)));   // panel line
  // outer cooling stack under a hinged panel (glows when the cannon fires)
  const v0 = h2 - 0.05, v1 = yb + 0.75, vm = (v0 + v1) / 2;
  q.add('glow', obox(P(K(0.95), vm, zc), X, Y, K(0.14), v0 - v1, K(1.15)));
  for (let y = v0 - 0.08; y > v1; y -= 0.2) q.add('dark', obox(P(K(1.0), y, zc), X, Y, K(0.2), 0.06, K(1.3)));
  // inner side: capacitor bank + conduit (both hose ends buried)
  const c0 = h2 + 0.1, c1 = yb + 0.45, cm = (c0 + c1) / 2, cx = -K(1.08), cz = -K(0.25);
  q.add('clay', disc(P(cx, cm, cz), Y, K(0.3), c0 - c1));
  for (const y of [c0 - 0.3, cm, c1 + 0.3]) q.add('chrome', disc(P(cx, y, cz), Y, K(0.32), 0.06));
  q.add('glow', obox(P(cx - K(0.28), (c0 + cm) / 2, cz), X, Y, K(0.05), (c0 - cm) * 0.6, K(0.16)), obox(P(cx - K(0.28), (cm + c1) / 2, cz), X, Y, K(0.05), (cm - c1) * 0.6, K(0.16)));
  for (const y of [c0 + 0.05, c1 - 0.05]) q.add('clay', obox(P(-K(0.95), y, cz), X, Y, K(0.4), 0.2, K(0.5)));
  tube(q, [[cx, c0 - 0.1, cz], [cx - K(0.2), c0 + 0.25, K(0.2)], [-K(1.0), c0 + 0.35, K(0.6)], [-K(0.7), c0 + 0.25, K(0.8)]], K(0.07));
  // front plate with bolts
  q.add('clay', hullOf(sec(h2 + 0.3, K(1.2), K(0.2), K(0.06), 0, K(1.08)), sec(yb + 0.5, K(1.05), K(0.2), K(0.06), 0, K(1.02))));
  for (const [x, y] of [[0.42, h2 + 0.15], [-0.42, h2 + 0.15], [0.36, yb + 0.65], [-0.36, yb + 0.65]]) bolt(q, P(K(x), y, K(1.13)), Z, K(0.05));
  // muzzle port in the end face
  q.add('chrome', disc(P(0, yb - 0.02, zc), Y, K(0.6), 0.05));
  q.add('dark', disc(P(0, yb - 0.04, zc), Y, K(0.5), 0.04));
  // swing-arm pivot boss on the back face + gear motors on the axle
  const piv = P(0, yb + 0.25, -K(1.05));
  q.add('clay', obox(P(0, yb + 0.3, -K(0.9)), X, Y, K(1.3), 0.7, K(0.45)));
  for (const f of [1, -1]) { q.add('clay', disc(P(f * K(0.78), piv.y, piv.z), X, K(0.3), K(0.26))); q.add('dark', disc(P(f * K(0.78), piv.y, piv.z), X, K(0.32), K(0.06))); }
  q.into(elbow, mats, id + '.forearm');

  // hinged cooling panel (axis y at its rear edge)
  const hinge = P(K(1.13), 0, -K(0.66));
  const vent = grp(elbow, hinge, id + '.vent'); {
    const v = new Kit(), sh = p => p.map(a => a.sub(hinge));
    v.add('clay', hullOf(sh(sec(v0 + 0.05, K(0.16), K(1.45), K(0.05), K(1.21), K(0.08))), sh(sec(v1 - 0.15, K(0.16), K(1.35), K(0.05), K(1.18), K(0.08)))));
    for (const y of [v0 - 0.15, v1]) bolt(v, P(K(0.17), y, K(1.26)), X, K(0.045));
    v.add('chrome', rod(P(0, v0 + 0.1, 0), P(0, v1 - 0.2, 0), K(0.05), 10));
    v.into(vent, mats, id + '.vent');
  }
  // barrel (slides out of the end face)
  const barrel = grp(elbow, P(0, 0, zc), id + '.barrel'); {
    const b = new Kit();
    b.add('chrome', rod(P(0, -K(1.0), 0), P(0, yb + 0.3, 0), K(0.36), 32));
    b.add('clay', disc(P(0, yb + 0.25, 0), Y, K(0.48), 0.35));
    b.add('dark', disc(P(0, yb + 0.06, 0), Y, K(0.3), 0.04));
    b.add('glow', disc(P(0, yb + 0.07, 0), Y, K(0.17), 0.04));
    for (let i = 0; i < 5; i++) b.add(i % 2 ? 'dark' : 'clay', disc(P(0, yb + 0.6 + i * 0.3, 0), Y, K(0.44), 0.08));
    b.into(barrel, mats, id + '.barrel');
  }
  // muzzle doors (hinges along z at the end face edges)
  const doors = [1, -1].map(f => {
    const d = grp(elbow, P(f * K(0.62), yb - 0.1, zc), id + '.door');
    const k2 = new Kit();
    k2.add('clay', obox(P(-f * K(0.31), 0, 0), X, Y, K(0.6), 0.08, K(1.3)));
    k2.add('chrome', rod(P(0, 0, -K(0.62)), P(0, 0, K(0.62)), K(0.05), 10));
    k2.into(d, mats, id + '.door'); return { d, f };
  });
  // swing arm carrying the hand: rotates 180° about x to stow the hand (as a fist) on the back of the forearm
  const swing = grp(elbow, piv, id + '.swing');
  const W = P(0, -K(0.7), K(1.05)), xp = K(1.06), kh = spec.kh; {
    const s = new Kit(), dir = W.clone().normalize(), L = W.length();
    for (const f of [1, -1]) {
      s.add('clay', obox(W.clone().multiplyScalar(0.5).add(P(f * xp, 0, 0)), X, dir, K(0.16), L, K(0.42)));
      s.add('clay', disc(P(f * xp, 0, 0), X, K(0.27), K(0.16)), disc(W.clone().add(P(f * xp, 0, 0)), X, K(0.3), K(0.16)));
      const i0 = 0.45 * kh - 0.02, i1 = xp - K(0.08);
      s.add('clay', disc(W.clone().add(P(f * (i0 + i1) / 2, 0, 0)), X, K(0.22), i1 - i0 + 0.04));   // spacer bushing to the hand knuckle
    }
    s.add('chrome', disc(O(), X, K(0.16), 2 * xp + K(0.24)), disc(W, X, K(0.12), 2 * xp + K(0.2)));
    s.into(swing, mats, id + '.swing');
  }
  const H = buildHand(swing, W, kh, mats, id); H.setCurl(0.35);
  c.hand = H;

  c.deploy = (t) => {
    swing.rotation.x = Math.PI * ease(win(t, 0.08, 0.5));
    H.setCurl(lerp(0.35, 1.4, ease(win(t, 0, 0.15))));
    for (const { d, f } of doors) d.rotation.z = f * 1.75 * ease(win(t, 0.5, 0.68));
    barrel.position.y = -K(1.4) * ease(win(t, 0.64, 0.95));
    vent.rotation.y = 1.15 * ease(win(t, 0.6, 0.88));
  };
}

// ---------- forearm: left front, segmented blade ----------
function forearmBlade(c) {
  const { K, mats, spec, elbow, id } = c, L2 = spec.L2, yb = -(L2 - 0.3), yw = yb - K(0.5);
  const q = new Kit();
  q.add('clay', obox(P(0, -K(0.55), 0), X, Y, K(0.85), K(0.7), K(0.9)));
  const h1 = -K(0.85), h2 = Math.max(-K(1.45), yb + 1.0), pl = (h1 + h2) / 2;
  q.add('clay', hullOf(sec(h1, K(1.7), K(1.85), K(0.36)), sec(h2, K(2.0), K(2.15), K(0.42)), sec(yb + 0.6, K(1.9), K(2.0), K(0.4)), sec(yb, K(1.65), K(1.75), K(0.34))));
  q.add('dark', hullOf(sec(pl + 0.03, K(1.86), K(2.01), K(0.41)), sec(pl - 0.03, K(1.87), K(2.02), K(0.41))));
  q.add('clay', hullOf(sec(h2 + 0.3, K(1.2), K(0.2), K(0.06), 0, K(1.1)), sec(yb + 0.45, K(1.05), K(0.2), K(0.06), 0, K(1.03))));   // front plate
  for (const [x, y] of [[0.42, h2 + 0.15], [-0.42, h2 + 0.15], [0.36, yb + 0.6], [-0.36, yb + 0.6]]) bolt(q, P(K(x), y, K(1.15)), Z, K(0.05));
  // inner side: blade drive (cable reel housing)
  q.add('clay', hullOf(sec(h2 + 0.2, K(0.3), K(1.0), K(0.08), -K(1.02)), sec(yb + 0.7, K(0.3), K(0.9), K(0.08), -K(0.98))));
  q.add('dark', obox(P(-K(1.18), (h2 + yb + 0.9) / 2, 0), X, Y, K(0.02), 0.06, K(0.8)));
  // wrist fork
  for (const f of [1, -1]) {
    q.add('clay', obox(P(f * K(0.6), (yb + 0.3 + yw) / 2, 0), X, Y, K(0.2), yb + 0.3 - yw + K(0.1), K(1.0)));
    q.add('clay', disc(P(f * K(0.6), yw, 0), X, K(0.4), K(0.2)));
    q.add('chrome', disc(P(f * K(0.72), yw, 0), X, K(0.14), K(0.06)));
  }
  // blade rail on the outer face (spine side), standoffs, root clamp behind the spine
  const N = 6, segL = 1.73, pitch = segL + 0.02, tb = 0.12, sp = 0.145, xr = K(1.15);
  const zs = -K(0.55);                                       // blade spine z (cutting edge forward, +z)
  const r0 = -K(1.0);
  q.add('chrome', obox(P(xr - K(0.13), (r0 + yb) / 2, zs + K(0.05)), X, Y, K(0.14), r0 - yb, K(0.3)));
  for (const y of [r0 - 0.2, yb + 0.2]) q.add('clay', obox(P(K(0.92), y, zs + K(0.05)), X, Y, K(0.36), 0.36, K(0.36)));
  q.add('clay', obox(P(xr - K(0.05), yb - 0.05, zs - K(0.16)), X, Y, K(0.34), 0.7, K(0.2)));      // root clamp jaw (behind the spine)
  q.add('dark', obox(P(xr - K(0.05), yb - 0.05, zs - K(0.27)), X, Y, K(0.24), 0.5, K(0.03)));
  q.into(elbow, mats, id + '.forearm');

  // blade segments: stowed as layered plates on the outer face (top ones furthest out), deployed one below the other
  const segGeo = (tip) => {
    const k2 = new Kit(), L = segL, e = K(0.55), body = [];
    for (const y of [0, -L]) {
      if (tip && y < 0) continue;
      body.push(P(tb / 2, y, zs), P(-tb / 2, y, zs), P(tb / 2, y, K(0.15)), P(-tb / 2, y, K(0.15)), P(tb * 0.3, y, K(0.4)), P(-tb * 0.3, y, K(0.4)));
    }
    if (tip) body.push(P(tb / 2, -L * 0.75, zs), P(-tb / 2, -L * 0.75, zs), P(tb * 0.3, -L * 0.45, K(0.4)), P(-tb * 0.3, -L * 0.45, K(0.4)), P(0.01, -L - K(0.45), -K(0.3)), P(-0.01, -L - K(0.45), -K(0.3)));
    k2.add('clay', hullOf(body));
    const edge = [];                                          // cutting edge strip
    for (const y of tip ? [0, -L * 0.45] : [0, -L]) edge.push(P(tb * 0.36, y, K(0.33)), P(-tb * 0.36, y, K(0.33)), P(0.006, y, e), P(-0.006, y, e));
    if (tip) edge.push(P(0.006, -L - K(0.45), -K(0.3)), P(-0.006, -L - K(0.45), -K(0.3)), P(tb * 0.3, -L - K(0.3), -K(0.3)), P(-tb * 0.3, -L - K(0.3), -K(0.3)));
    k2.add('chrome', hullOf(edge));
    k2.add('dark', obox(P(0, -L * (tip ? 0.38 : 0.5), zs + K(0.04)), X, Y, tb + 0.012, L * (tip ? 0.6 : 0.85), K(0.07)));   // spine groove
    k2.add('chrome', disc(P(0, -0.15, zs + K(0.12)), X, K(0.06), tb + 0.02, 10), disc(P(0, -L + 0.15, zs + K(0.12)), X, K(0.06), tb + 0.02, 10));   // lock pins
    return k2;
  };
  const segs = [];
  for (let i = 0; i < N; i++) {
    const j = N - 1 - i;                                  // deployed slot (the lowest stowed plate becomes the root)
    const stow = P(xr + (N - 1 - i) * sp, -K(1.05) - i * 0.25, 0);
    const dep = P(xr, yb + 0.3 - j * pitch, 0);
    const g = grp(elbow, stow, id + '.seg' + i);
    segGeo(j === N - 1).into(g, mats, id + '.seg' + i);
    segs.push({ g, stow, dep, j });
  }
  const H = buildHand(elbow, P(0, yw, 0), spec.kh, mats, id);
  c.hand = H;

  c.deploy = (t) => {
    H.setCurl(lerp(0.3, 1.45, ease(win(t, 0, 0.15))));
    for (const s of segs) {
      const u = win(t, 0.15 + s.j * 0.13, 0.15 + s.j * 0.13 + 0.2);
      const a = ease(win(u, 0, 0.8)), b = ease(win(u, 0.8, 1));
      s.g.position.set(lerp(s.stow.x, s.dep.x, b), lerp(s.stow.y, s.dep.y, a), 0);
    }
  };
}

// ---------- forearm: left rear, saw claw ----------
function forearmClaw(c) {
  const { K, mats, spec, elbow, id } = c, L2 = spec.L2, yb = -(L2 - 1.0);
  const q = new Kit();
  q.add('clay', obox(P(0, -K(0.55), 0), X, Y, K(0.85), K(0.7), K(0.9)));
  const h1 = -K(0.85), h2 = Math.max(-K(1.4), yb + 0.6), pl = (h1 + h2) / 2;
  q.add('clay', hullOf(sec(h1, K(1.65), K(1.75), K(0.35)), sec(h2, K(1.95), K(2.05), K(0.42)), sec(yb, K(1.8), K(1.9), K(0.4))));
  q.add('dark', hullOf(sec(pl + 0.03, K(1.82), K(1.92), K(0.39)), sec(pl - 0.03, K(1.83), K(1.93), K(0.4))));
  for (const f of [1, -1]) for (let y = h2 - 0.1; y > yb + 0.1; y -= 0.22) q.add('clay', obox(P(f * K(0.97), y, 0), X, Y, K(0.18), 0.07, K(1.3)));   // motor cooling fins
  q.add('clay', hullOf(sec(h2 + 0.2, K(1.1), K(0.2), K(0.06), 0, K(1.05)), sec(yb + 0.15, K(1.0), K(0.2), K(0.06), 0, K(1.0))));
  for (const [x, y] of [[0.38, h2 + 0.05], [-0.38, h2 + 0.05], [0.34, yb + 0.3], [-0.34, yb + 0.3]]) bolt(q, P(K(x), y, K(1.1)), Z, K(0.05));
  // wrist drum (spin motor), bearing ring, bolt circle
  q.add('clay', disc(P(0, yb - 0.45, 0), Y, K(0.98), 0.95, 48));
  q.add('dark', disc(P(0, yb - 0.32, 0), Y, K(0.99), 0.05, 48));
  q.add('clay', disc(P(0, yb - 0.78, 0), Y, K(1.08), 0.24, 48));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bolt(q, P(Math.sin(a) * K(1.0), yb - 0.655, Math.cos(a) * K(1.0)), Y, K(0.05)); }
  q.add('dark', disc(P(0, yb - 0.96, 0), Y, K(0.82), 0.1, 40));
  // power cables: housing -> drum (both ends buried)
  for (const f of [1, -1]) tube(q, [[f * K(0.7), h2 + 0.1, -K(0.7)], [f * K(1.05), h2 - 0.2, -K(0.98)], [f * K(1.08), yb + 0.05, -K(0.85)], [f * K(0.75), yb - 0.35, -K(0.55)]], K(0.08));
  q.into(elbow, mats, id + '.forearm');

  const spin = grp(elbow, P(0, yb - 1.0, 0), id + '.spin');
  {
    const s = new Kit();
    s.add('clay', disc(P(0, -K(0.28), 0), Y, K(0.64), K(0.56), 40));
    s.add('chrome', disc(P(0, -K(0.58), 0), Y, K(0.45), K(0.06), 32));
    s.add('glow', disc(P(0, -K(0.6), 0), Y, K(0.26), K(0.06), 24));
    s.into(spin, mats, id + '.hub');
  }
  const LEN = [1.0, 0.85, 0.78], fingers = [];
  for (let i = 0; i < 3; i++) {
    const base = grp(spin, P(0, -K(0.28), 0)); base.rotation.y = i / 3 * Math.PI * 2 + Math.PI / 6;
    const b = new Kit();
    b.add('clay', obox(P(K(0.66), 0, 0), X, Y, K(0.4), K(0.48), K(0.6)));           // finger bracket out of the hub
    b.into(base, mats, id + '.hub');
    let par = base; const segs = [];
    for (let j = 0; j < 3; j++) {
      const g = grp(par, j === 0 ? P(K(0.8), -K(0.12), 0) : P(0, -K(LEN[j - 1]), 0));
      const L = K(LEN[j]), w = K(0.52 - j * 0.05), tx = K(0.42 - j * 0.04), f = new Kit(), tip = j === 2;
      f.add('clay', disc(O(), Z, tx * 0.5, w * 1.02));
      f.add('chrome', disc(O(), Z, K(0.1), w * 1.22));
      if (!tip) f.add('clay', hullOf(sec(-K(0.1), tx, w, K(0.08)), sec(-L + K(0.05), tx * 0.9, w * 0.92, K(0.08))));
      else f.add('clay', hullOf(sec(-K(0.1), tx, w, K(0.08)), sec(-L * 0.6, tx * 0.85, w * 0.85, K(0.08)), [P(-tx * 0.2, -L - K(0.22), w * 0.08), P(-tx * 0.2, -L - K(0.22), -w * 0.08)]));
      f.add('clay', hullOf(sec(-K(0.14), K(0.1), w * 0.86, K(0.03), tx * 0.52), sec(-L * (tip ? 0.55 : 0.8), K(0.1), w * 0.8, K(0.03), tx * 0.5)));   // outer armour
      const nT = tip ? 2 : 3;                                // saw teeth on the leading edge (+z, spin direction)
      for (let n = 0; n < nT; n++) {
        const y0 = -K(0.2) - n * (L * (tip ? 0.55 : 0.85) - K(0.2)) / nT, z0 = w * (tip ? 0.42 : 0.46);
        f.add('chrome', hullOf([P(tx * 0.3, y0, z0 - K(0.05)), P(-tx * 0.3, y0, z0 - K(0.05)), P(tx * 0.3, y0 - K(0.2), z0 - K(0.05)), P(-tx * 0.3, y0 - K(0.2), z0 - K(0.05)), P(tx * 0.1, y0 - K(0.03), z0 + K(0.16)), P(-tx * 0.1, y0 - K(0.03), z0 + K(0.16))]));
      }
      if (tip) f.add('glow', obox(P(-tx * 0.5, -L * 0.45, 0), X, Y, K(0.05), L * 0.4, w * 0.55));
      f.into(g, mats, id + '.claw' + i);
      segs.push(g); par = g;
    }
    fingers.push(segs);
  }
  const REST = [0.38, -0.62, -0.7], OPEN = [1.5, 0.02, 0.02];
  c.deploy = (t) => { const a = ease(win(t, 0.35, 1)); fingers.forEach(f => f.forEach((g, j) => g.rotation.z = lerp(REST[j], OPEN[j], a))); };
  c.spin = (ang) => { spin.rotation.y = ang; };
}

// ---------- one arm: shoulder drum + knuckle + upper arm + elbow, forearm from a builder ----------
function buildArm(id, spec, mats, forearm) {
  spec.pose = { twist: 0, fore: 0, ...spec.pose }; if (spec.ready) spec.ready = { twist: 0, fore: 0, ...spec.ready };
  const k = spec.k, ks = spec.ks, K = v => v * k, S = v => v * ks, L1 = spec.L1;
  const ox = K(spec.ox ?? 0.15), oz = spec.oz ?? 0, aw = spec.aw ?? 1, ad = spec.ad ?? 1;
  const hx = K(1.05 * aw), hz = K(1.2 * ad);                      // upper-arm armour half width / half depth at the bulge
  const root = new THREE.Group(); root.name = 'arm' + id; root.position.set(...spec.hub); root.scale.x = Math.sign(spec.hub[0]);
  const capX = spec.capX, dl = S(spec.drum ?? 0.9), xA = capX + dl / 2, yA = -S(spec.yoke ?? 1.25);
  const pinZ = hz + 0.25, botZ = spec.botZ ?? pinZ, topZ = spec.topZ ?? Math.min(pinZ, S(1.0) + 0.1), pins = spec.module ? [] : (spec.abdPins ?? [1, -1]);   // top pins kept short so the bar stays clear of the shell
  const lives = [];

  // pitch drum (rotates about x on the torso hub)
  const pitch = grp(root, null, id + '.pitch'); pitch.rotation.x = -spec.pose.pitch;
  // shoulder module (right): the whole outer pauldron rides on the arm. Pitch = flange on the torso socket (in the 0.3
  // gap between root and module); a carrier plate rises in the gap to a hinge on the module's top-inner edge; the
  // module + upper arm swing out about that hinge (abduction, geared motor in the hinge) like a shrug.
  const M = spec.module, sx = Math.sign(spec.hub[0]);
  let pivL = null, roofY = null;
  if (M) {
    root.updateMatrixWorld(true);
    const v = new V3(); let top = -1e9;
    for (const m of M.meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (Math.abs(v.x - M.cut) < 0.3) top = Math.max(top, v.y); } }
    pivL = root.worldToLocal(new V3(M.cut, top + 0.08, spec.hub[2]));
    const kw = root.localToWorld(P(...spec.knuckle, 0)), ray = new THREE.Raycaster(); ray.set(new V3(kw.x, spec.hub[1], spec.hub[2]), new V3(0, 1, 0));
    const hit = ray.intersectObjects(M.meshes)[0]; roofY = (hit ? hit.point.y : top - 0.6) - spec.hub[1];
    const q = new Kit(), gx = pivL.x - 0.15;
    q.add('clay', disc(P(gx, 0, 0), X, 0.95, 0.22, 48)); q.add('dark', disc(P(gx, 0, 0), X, 0.7, 0.24, 40));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; bolt(q, P(gx + 0.12, Math.sin(a) * 0.82, Math.cos(a) * 0.82), X, 0.05); }
    q.add('clay', obox(P(gx, pivL.y / 2, 0), X, Y, 0.2, pivL.y + 0.2, 1.0));                         // carrier plate (in the gap)
    q.add('clay', disc(P(pivL.x, pivL.y, 0), Z, 0.3, 0.9, 32)); q.add('dark', disc(P(pivL.x, pivL.y, 0), Z, 0.32, 0.08, 32));   // hinge motor (abduction drive)
    q.into(pitch, mats, id + '.pitch');
  } else {
    const q = new Kit();
    q.add('clay', disc(P(capX - 0.15, 0, 0), X, S(0.42), 0.4));                   // shaft into the hub cap
    q.add('dark', disc(P(capX + 0.03, 0, 0), X, S(0.86), 0.06));
    q.add('clay', disc(P(xA + 0.03, 0, 0), X, S(0.95), dl - 0.06, 48));           // drum
    q.add('dark', disc(P(xA - dl * 0.22, 0, 0), X, S(0.958), 0.04, 48), disc(P(xA + dl * 0.22, 0, 0), X, S(0.958), 0.04, 48));
    q.add('clay', disc(P(capX + dl + 0.04, 0, 0), X, S(0.72), 0.1, 40));
    q.add('dark', disc(P(capX + dl + 0.1, 0, 0), X, S(0.56), 0.04, 40));
    q.add('clay', disc(P(capX + dl + 0.17, 0, 0), X, S(0.4), 0.16, 32));
    q.add('chrome', disc(P(capX + dl + 0.27, 0, 0), X, S(0.15), 0.06, 16));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bolt(q, P(capX + dl + 0.1, Math.sin(a) * S(0.64), Math.cos(a) * S(0.64)), X, S(0.05)); }
    for (const f of [1, -1]) {                                                       // yoke plates down to the abduction pin
      q.add('clay', obox(P(xA, yA / 2, f * S(0.62)), X, Y, S(0.9), -yA, S(0.22)));
      q.add('clay', disc(P(xA, yA, f * S(0.62)), Z, S(0.45), S(0.22)));
      q.add('chrome', disc(P(xA, yA, f * S(0.78)), Z, S(0.16), S(0.1)));
    }
    if (spec.deltoid) q.add('clay', obox(P(capX + dl + 0.12, -S(0.5), 0), X, Y, 0.34, S(0.55), 0.5));   // outer (deltoid) actuator lug on the drum end
    // lug bar under the drum carrying the abduction actuators' top pins
    const z0 = Math.min(...pins.map(f => oz + f * topZ), -S(0.4)) - 0.2, z1 = Math.max(...pins.map(f => oz + f * topZ), S(0.4)) + 0.2;
    q.add('clay', obox(P(capX + S(0.25), -S(0.88), (z0 + z1) / 2), X, Y, S(0.45), S(0.5), z1 - z0));
    q.into(pitch, mats, id + '.pitch');
  }

  // upper arm (rotates about z on the yoke = lifts the arm sideways)
  let abd, ua;
  if (M) {
    abd = grp(pitch, pivL, id + '.upper'); abd.rotation.z = spec.pose.abd;
    const kn = P(...spec.knuckle, 0).sub(pivL); ua = grp(abd, kn, id + '.ua');
    root.updateMatrixWorld(true);
    let z0 = 1e9, z1 = -1e9;
    for (const m of M.meshes) { abd.attach(m); m.userData.part = id + '.upper'; m.geometry.computeBoundingBox(); z0 = Math.min(z0, m.geometry.boundingBox.min.z - spec.hub[2]); z1 = Math.max(z1, m.geometry.boundingBox.max.z - spec.hub[2]); }
    const q = new Kit(), ry = roofY - pivL.y;
    for (const f of [1, -1]) q.add('clay', obox(P(kn.x, (kn.y + ry) / 2, f * S(0.62)), X, Y, S(0.9), ry - kn.y + 0.1, S(0.22)));   // humerus yoke: module roof -> upper-arm knuckle
    q.add('clay', obox(P(kn.x, ry - 0.2, 0), X, Y, S(1.1), 0.4, S(1.5)));
    q.add('chrome', rod(P(0, 0, z0 + 0.4), P(0, 0, z1 - 0.4), 0.06, 12));                              // hinge pin along the module's top-inner edge
    for (const [a, b] of [[z0 + 0.45, -0.5], [0.5, z1 - 0.45]]) if (b - a > 0.3) { const n = Math.max(1, Math.round((b - a) / 0.9));
      for (let i = 0; i < n; i++) { const za = a + (b - a) * i / n + 0.04, zb = a + (b - a) * (i + 1) / n - 0.04; q.add('clay', rod(P(0, 0, za), P(0, 0, zb), 0.13, 16), obox(P(0.12, -0.12, (za + zb) / 2), X, Y, 0.24, 0.24, zb - za)); } }
    q.into(abd, mats, id + '.upper');
  } else { abd = grp(pitch, P(xA, yA, 0), id + '.upper'); abd.rotation.z = spec.pose.abd; ua = abd; }
  {
    const q = new Kit();
    q.add('clay', disc(O(), Z, S(0.4), S(1.0)));
    q.add('chrome', disc(O(), Z, S(0.14), S(1.75)));
    const a0 = -K(0.75), a1 = -(L1 - K(0.85)), m = (a0 - K(0.5) + a1 + K(0.55)) / 2, t0 = a0 + 0.3;
    // upper-arm twist turntable (axis = upper-arm length): the stub + fixed ring stay on the knuckle, everything below turns
    q.add('clay', obox(P(0, (-S(0.45) + t0) / 2, 0), X, Y, S(0.85), t0 + S(0.45), S(0.95)));
    q.add('clay', disc(P(0, t0 + 0.02, 0), Y, K(0.62), 0.16, 40));
    q.add('dark', disc(P(0, t0 - 0.08, 0), Y, K(0.58), 0.05, 40));
    q.into(ua, mats, id + '.upper');
  }
  const twist = grp(ua, null, id + '.twist');
  {
    const q = new Kit();
    const a0 = -K(0.75), a1 = -(L1 - K(0.85)), m = (a0 - K(0.5) + a1 + K(0.55)) / 2, t0 = a0 + 0.3;
    q.add('clay', disc(P(0, t0 - 0.18, 0), Y, K(0.64), 0.16, 40));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; bolt(q, P(Math.sin(a) * K(0.55), t0 - 0.1, Math.cos(a) * K(0.55)), Y, K(0.04)); }
    q.add('clay', obox(P(0, (t0 - 0.2 + a0 - 0.2) / 2, 0), X, Y, S(0.85), t0 - a0, S(0.95)));        // neck into the armour
    // core shell of the upper arm (sections: shoulder end, bulge, lower bulge, elbow end); t grows it outward
    const coreSecs = (t) => [sec(a0, K(1.7 * aw) + 2 * t, K(2.0 * ad) + 2 * t, K(0.35), ox + K(0.05), oz), sec(a0 - K(0.5), 2 * hx + 2 * t, 2 * hz + 2 * t, K(0.42), ox, oz),
      sec(a1 + K(0.55), K(2.0 * aw) + 2 * t, K(2.3 * ad) + 2 * t, K(0.42), ox, oz), sec(a1, K(1.55 * aw) + 2 * t, K(1.85 * ad) + 2 * t, K(0.35), ox, oz)];
    const core = hullOf(...coreSecs(0));
    q.add('clay', core);
    { const r = cOp(toBrush(obox(P(0, (a0 + a1) / 2, 0), X, Y, K(0.9), a0 - a1, K(0.9))), toBrush(core), INTERSECTION).geometry.clone();   // humerus core, clipped inside the shell
      const g = r.index ? r.toNonIndexed() : r; g.computeVertexNormals(); q.add('clay', g); }
    // thin armour lames hugging the core: shell of thickness t, cut to a region (convex hull of points).
    // Front-outer wrap in two lames (upper one thicker and lapping over the lower one, V-pointed lower edges), narrow inner plate.
    {
      const neck = obox(P(0, (t0 - 0.2 + a0 - 0.2) / 2, 0), X, Y, S(0.85), t0 - a0, S(0.95));
      const qa = new Kit(), coreB = cOp(toBrush(core), toBrush(neck), ADDITION);   // lames wrap round the neck block where it stands out of the core
      const lameOf = (t, region) => { const r = cOp(cOp(toBrush(hullOf(...coreSecs(t))), toBrush(hullOf(region)), INTERSECTION), coreB, SUBTRACTION).geometry.clone();
        const g = r.index ? r.toNonIndexed() : r; g.computeVertexNormals(); return g; };
      // region: x from xL outward, z from zB forward; top yt flat, bottom yb at the front with a V point (v) and rising d towards the back
      // optional top bevels (upper lame): cF drops the front-inner corner (abduction actuator sweeps over it),
      // cO drops the outer top edge (deltoid actuator + lug sit above it)
      const wrap = (yt, yb, v, d, xL, zB, cF = 0, cO = 0) => { const xR = ox + hx + 1, zF = oz + hz + 1, xm = ox + hx * 0.15, xc = ox + hx * 0.3, xo = ox + hx + 0.4;
        const top = cF || cO ? [P(xL, yt, zB), P(xc, yt, zB), P(xc, yt, zF), P(xL, yt - cF, zF), P(xo, yt - cO, zB), P(xo, yt - cO, zF)]
          : [P(xL, yt, zB), P(xR, yt, zB), P(xL, yt, zF), P(xR, yt, zF)];
        return [...top, P(xL, yb + d, zB), P(xR, yb + d, zB), P(xL, yb, zF), P(xR, yb, zF), P(xm, yb - v, zF), P(xR, yb - v * 0.4, oz)]; };
      const xL = pins.includes(1) ? ox + hx * 0.05 : ox - hx * 0.35, zB = oz - hz * 0.45;   // front abduction actuator (right arm): front lames stop short of its sweep
      qa.add('clay', lameOf(0.17, wrap(a0 - K(0.12), m - 0.08, K(0.18), K(0.15), xL, zB, K(0.5), K(0.35))));     // upper lame
      qa.add('clay', lameOf(0.12, wrap(m + 0.12, a1 + K(0.32), K(0.22), K(0.1), xL, zB)));                        // lower lame (tucks under the upper)
      { const xi = ox - hx * 0.6, z0 = oz - hz * 0.42, z1 = oz + hz * 0.42, y0 = a0 - K(0.45), y1 = a1 + K(0.45);     // inner plate, clear of the actuator lugs
        qa.add('clay', lameOf(0.1, [P(xi - 2, y0, z0), P(xi, y0, z0), P(xi - 2, y0, z1), P(xi, y0, z1), P(xi - 2, y1 + 0.15, z0), P(xi, y1 + 0.15, z0), P(xi - 2, y1 + 0.15, z1), P(xi, y1 + 0.15, z1), P(xi - 2, y1, oz), P(xi, y1, oz)])); }
      for (const [y, xo, t] of [[a0 - K(0.45), ox + hx, 0.17], [a1 + K(0.7), ox + K(aw), 0.12]])
        for (const z of [-hz * 0.2, hz * 0.45]) bolt(qa, P(xo + t, y, oz + z), X, K(0.045));
      qa.into(twist, mats, id + '.uaArmor');
    }
    // elbow fork
    for (const f of [1, -1]) {
      q.add('clay', obox(P(f * K(0.62), -(L1 - K(0.4)), 0), X, Y, K(0.24), K(1.2), K(1.25)));
      q.add('clay', disc(P(f * K(0.62), -L1, 0), X, K(0.66), K(0.24)));
      q.add('dark', disc(P(f * K(0.76), -L1, 0), X, K(0.48), K(0.04)));
      q.add('clay', disc(P(f * K(0.82), -L1, 0), X, K(0.36), K(0.14)));
      q.add('chrome', disc(P(f * K(0.9), -L1, 0), X, K(0.14), K(0.08)));
      q.add('clay', obox(P(f * K(0.3), a0 - K(0.3), oz - hz - 0.05), X, Y, K(0.32), K(0.42), 0.45));          // triceps lug
    }
    if (spec.deltoid) q.add('clay', obox(P(ox + hx * 0.72, a0 + 0.02, 0), X, Y, 0.5, 0.5, 0.5));   // deltoid lug on the armour top (outer edge), pin recessed into it
    for (const f of pins) q.add('clay', obox(P(ox - hx * 0.9 + 0.15, -L1 * 0.62, oz + f * Math.min(hz + 0.05, botZ)), X, Y, 0.5, 0.45, 0.45));   // abduction lug
    // hose down the front of the upper arm (both ends buried in the armour)
    tube(q, [[ox - K(0.4), a0 - K(0.3), oz + hz - K(0.2)], [ox - K(0.55), a0 - K(0.9), oz + hz + K(0.12)], [ox - K(0.5), a1 + K(0.9), oz + hz + K(0.1)], [ox - K(0.4), a1 + K(0.4), oz + hz - K(0.2)]], K(0.08));
    q.into(twist, mats, id + '.upper');
  }

  // elbow (rotates about x; forearm flexes forward)
  const elbow = grp(twist, P(0, -L1, 0), id + '.elbow'); elbow.rotation.x = -spec.pose.elbow;
  {
    const q = new Kit();
    q.add('clay', disc(O(), X, K(0.55), K(0.98), 40));
    q.add('chrome', disc(O(), X, K(0.16), K(1.95)));
    q.add('clay', obox(P(0, K(0.2), -K(0.75)), X, Y, K(0.85), K(0.85), K(0.75)));   // lever horn behind the axis
    q.add('clay', disc(P(0, -K(0.6), 0), Y, K(0.5), K(0.16), 40));                       // forearm twist ring (fixed half)
    q.add('dark', disc(P(0, -K(0.7), 0), Y, K(0.47), K(0.05), 40));
    q.into(elbow, mats, id + '.forearm');
  }
  // forearm twist (axis = forearm length): the whole forearm, weapon and hand turn below the ring
  const fore = grp(elbow, null, id + '.fore');
  { const q = new Kit(); q.add('clay', disc(P(0, -K(0.78), 0), Y, K(0.52), K(0.12), 40)); q.into(fore, mats, id + '.forearm'); }
  const ctx = { id, k, K, mats, spec, elbow: fore, abd: twist, lives };
  forearm(ctx);
  { // forearm armour (all three arms): the sheet plate reaches 5.8 below the elbow; squeeze it to this forearm's length
    // the sheet draws it off to the outer side: centre it on the forearm core, then per arm: width sx, forward shift dz,
    // and an optional window (cannon: the cooling panel opens through it)
    const A = spec.armor || {}, sy = (spec.armorTo ?? -4.6) / -5.8 * 0.94;   // thinner, slimmer, a bit shorter than the sheet (user: too big / too thick from the side)
    // sits ON the core's front face: its back starts at zb, depth squeezed by sz; nothing above the elbow axis
    let geos = sheetPlates(FORE_SEG, FORE_PLATES).map(g => { g.computeBoundingBox(); const z0 = g.boundingBox.min.z;
      g.translate(-1.385, 0, -z0).scale((A.sx ?? 1) * 0.92, sy, (A.sz ?? 0.65) * 0.7).translate(0, 0, A.zb ?? 1.25); return g; });
    geos = geos.map(g => { const r = cOp(toBrush(g), toBrush(new THREE.BoxGeometry(8, 8, 8).translate(0, 4 - 0.05, 0)), SUBTRACTION).geometry.clone(), r2 = r.index ? r.toNonIndexed() : r; r2.computeVertexNormals(); return r2; });
    if (A.window) geos = geos.map(g => { const [x0, x1, y0, y1] = A.window, box = new THREE.BoxGeometry(x1 - x0, y1 - y0, 6).translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const r = cOp(toBrush(g), toBrush(box), SUBTRACTION).geometry.clone(), r2 = r.index ? r.toNonIndexed() : r; r2.computeVertexNormals(); return r2; });
    const qf = new Kit(); qf.add('clay', ...geos); qf.into(fore, mats, id + '.armor'); }

  for (const f of [1, -1]) lives.push(new LiveAct(twist, P(f * K(0.3), -K(1.05), oz - hz - 0.22), elbow, P(f * K(0.3), K(0.45), -K(1.0)), K(0.15), id + '.act'));
  for (const f of pins) lives.push(new LiveAct(pitch, P(capX + S(0.25), -S(1.0), oz + f * topZ), twist, P(ox - hx * 0.9, -L1 * 0.62, oz + f * botZ), K(0.17), id + '.act', Z));
  // outer shoulder shell (cut off the torso pauldron): rides on the drum (pitch) and flips up on a top hinge (axis z)
  // as the arm is raised sideways, so neither forward nor sideways raising runs into it
  let flap = null;
  const FLAP_K = 1.0;
  const panelSlats = {}, missileCovers = [];   // sliding plates of the fixed shoulder shell (on root = torso frame)
  const setPose = (p) => {
    pitch.rotation.x = -p.pitch; if (M) { const sh = Math.max(0, p.abd - (spec.shrugFrom ?? 0.87)) * (spec.shrug ?? 0.6); abd.rotation.z = sh; ua.rotation.z = p.abd - sh; } else abd.rotation.z = p.abd;   // module: the arm swings out of it at the knuckle; past ~50 deg the module follows with a shrug (like the shoulder blade)
    elbow.rotation.x = -p.elbow;
    twist.rotation.y = p.twist ?? 0; fore.rotation.y = p.fore ?? 0;
    if (flap) flap.rotation.z = Math.max(0, p.abd - spec.pose.abd) * (spec.flapK ?? FLAP_K);
    const dp = Math.max(0, p.pitch - spec.pose.pitch), da = Math.max(0, p.abd - spec.pose.abd);   // plates open ahead of the arm
    const slideSet = (sl, u) => sl && sl.forEach(({ g }) => { const m = g.userData.move, a1 = ease(win(u, 0, 0.3)), b1 = ease(win(u, 0.3, 1)); g.position.copy(m.inward).multiplyScalar(a1).addScaledVector(m.slide, b1); });
    slideSet(panelSlats.visor, Math.min(1, dp * 3.0 + da * 0.8)); slideSet(panelSlats.flap, Math.min(1, da * 1.6 + dp * 0.6));
  };
  // sliding plates (no hinges): each panel (front visor, outer flap) is cut into two horizontal slats; when the arm rises
  // they first step inward, then slide up UNDER the upper shell (lower slat behind the upper one), pushed by telescopic
  // rods that hang from lugs under the shell roof
  const mountPanels = (visorM, flapM, cfg, fixedM) => {
    root.updateMatrixWorld(true);
    const sxw = Math.sign(spec.hub[0]), up = new V3(0, 1, 0), ray = new THREE.Raycaster();
    const L = (w) => root.worldToLocal(w.clone()), Ld = (w, d) => L(w.clone().add(d)).sub(L(w));
    const build = (meshes, kind) => {
      if (!meshes.length) return;
      // outward normal of the plate = area-weighted mean of its outward faces (front: +z, flap: away from the body)
      const n = new V3(), a = new V3(), b = new V3(), c = new V3(), fn = new V3(); let ymin = 1e9, xs = [], cy = cfg.visor.y;
      for (const m of meshes) { const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
          fn.crossVectors(b.clone().sub(a), c.clone().sub(a)); ymin = Math.min(ymin, a.y, b.y, c.y);
          const ok = kind === 'visor' ? fn.z > 0 && Math.abs(fn.y) < 0.4 * fn.length() : fn.x * sxw > 0 && Math.abs(fn.y) < 0.6 * fn.length();
          if (ok) { n.add(fn); xs.push((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3); } } }
      n.normalize(); const slide = up.clone().addScaledVector(n, -n.dot(up)).normalize();   // up along the plate face
      const H = (cy - ymin) / 2, cutY = cy - H, D = 0.36;
      // split into two slats at cutY (CSG), give each its own group on the root (torso frame)
      const slats = [0, 1].map(j => { const g = grp(root, null, id + '.slat'); return { g, j }; });
      root.updateMatrixWorld(true);
      for (const m of meshes) {
        const bm = toBrush(m.geometry);
        [[cutY, 20], [-20, cutY - 0.06]].forEach(([y0, y1], j) => {
          const box = toBrush(new THREE.BoxGeometry(60, y1 - y0, 60).translate(0, (y0 + y1) / 2, 0));
          let geo = cOp(bm, box, INTERSECTION).geometry.clone();
          geo = roundSlatBoundary(geo, m.name, m.name + '_' + j);
          const g2 = geo.index ? geo.toNonIndexed() : geo; g2.computeVertexNormals();
          const mm = new THREE.Mesh(g2, m.material); mm.name = m.name + '_' + j; mm.userData.part = id + '.slat';
          mm.updateMatrixWorld(true); slats[j].g.attach(mm);
        });
        m.parent && m.parent.remove(m);
      }
      // pins: a lug on the inner face near each slat's lower edge, a lug hanging from the roof above its final place
      const xz = []; for (let i = 0; i < xs.length; i += 2) xz.push([xs[i], xs[i + 1]]);
      const span = (f) => { const k = Math.min(xz.length - 1, Math.max(0, Math.round(f * (xz.length - 1)))); return xz.sort((p1, p2) => (p1[0] - p2[0]) * sxw)[k]; };
      const fix = new Kit();
      slats.forEach(({ g, j }) => {
        const yb = j === 0 ? cutY + 0.35 : ymin + 0.45, off = D * (j + 1), lift = H * (j + 1);
        g.userData.move = { inward: Ld(new V3(0, cy, 0), n.clone().multiplyScalar(-off)), slide: Ld(new V3(0, cy, 0), slide.clone().multiplyScalar(lift)) };
        for (const f of j === 0 ? [0.4, 0.66] : [0.28, 0.8]) {
          const [fx, fz] = span(f), face = new V3(fx, yb, fz);
          // outer-face point by a ray from outside, then step to the inner side of the 0.3 wall
          ray.set(face.clone().addScaledVector(n, 3), n.clone().negate()); const h = ray.intersectObjects(g.children)[0]; const fp = h ? h.point : face;
          const pin = fp.clone().addScaledVector(n, -0.42);
          const lugB = new Kit(); lugB.add('clay', obox(L(fp.clone().addScaledVector(n, -0.44)), Ld(fp, n).normalize(), Ld(fp, slide).normalize(), 0.34, 0.34, 0.36));   // behind the port pocket floor, touching the plate's inner face lugB.into(g, mats, id + '.slat');
          // fixed lug: straight above the pin's final position, under the roof
          // fixed lug: further inside than the slat's final place (so the rod stays long enough), under the roof
          const fin = pin.clone().addScaledVector(n, -off - 1.1).addScaledVector(slide, lift);
          ray.set(fin.clone().addScaledVector(up, 0.05), up); const r = ray.intersectObjects(fixedM)[0]; const roofY = r ? r.point.y : fin.y + 1.2;
          const pa = new V3(fin.x, roofY - 0.42, fin.z);
          fix.add('clay', obox(L(new V3(pa.x, (roofY + pa.y) / 2 + 0.03, pa.z)), X, Y, 0.3, roofY - pa.y + 0.12, 0.36));
          lives.push(new LiveAct(root, L(pa), g, L(pin), 0.12, id + '.act'));
        }
      });
      fix.into(root, mats, id + '.shoulderFix');
      // missile ports on each plate's outer face: a grid of launch tubes + two cover halves that slide apart (user: put the
      // launchers in these existing plate cells, no new structure)
      root.updateMatrixWorld(true);
      // ports always go on the FRONT-facing part of a plate (the outer flap wraps round the corner: use its front face)
      const nP = new V3();
      for (const m of meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        fn.crossVectors(b.clone().sub(a), c.clone().sub(a)); if (fn.z > 0 && Math.abs(fn.y) < 0.4 * fn.length() && Math.abs(fn.x) < fn.z) nP.add(fn); } }
      if (nP.lengthSq() < 1e-9) nP.copy(n); nP.normalize();
      const slideP = up.clone().addScaledVector(nP, -nP.dot(up)).normalize(), uw = new V3().crossVectors(slideP, nP).normalize();
      slats.forEach(({ g }) => {
        let dmax = -1e9, us = [], vs = [], uf = [], vf = []; const v3 = new V3();
        g.children.forEach(m => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); dmax = Math.max(dmax, v3.dot(nP)); } });
        g.children.forEach(m => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v3.dot(nP) > dmax - 0.35) { us.push(v3.dot(uw)); vs.push(v3.dot(slideP)); } if (v3.dot(nP) > dmax - 0.06) { uf.push(v3.dot(uw)); vf.push(v3.dot(slideP)); } } });
        if (!us.length) return;
        const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), uf0 = Math.min(...uf), uf1 = Math.max(...uf), W = Math.min((u1 - u0) * 0.46, (uf1 - uf0) / 2 - 0.14), vf0 = Math.min(...vf), vf1 = Math.max(...vf), Hh = Math.min((v1 - v0) * 0.62, (vf1 - vf0) - 0.3);
        if (W < 0.22 || Hh < 0.3) return;
        const cw = nP.clone().multiplyScalar(dmax).addScaledVector(uw, (uf0 + uf1) / 2).addScaledVector(slideP, (vf0 + vf1) / 2);   // face centre (world)
        const Lp = (w) => g.worldToLocal(w.clone()), Ldir = (d) => Lp(cw.clone().add(d)).sub(Lp(cw)).normalize();
        const nl = Ldir(nP), ul = Ldir(uw), vl = Ldir(slideP), basis = new THREE.Matrix4().makeBasis(ul, vl, nl), c = Lp(cw);
        const put = (geo, du, dv, dn) => { geo.applyMatrix4(basis); const q = c.clone().addScaledVector(ul, du).addScaledVector(vl, dv).addScaledVector(nl, dn); geo.translate(q.x, q.y, q.z); return geo; };
        // pocket cut into the plate (meshes hold rest-pose world coordinates), so the ports sit inside and the covers are flush
        const PD = 0.22, bw = new THREE.Matrix4().makeBasis(uw, slideP, nP), pk = new THREE.BoxGeometry(W + 0.08, Hh + 0.08, PD + 0.1); pk.applyMatrix4(bw);
        const pc = cw.clone().addScaledVector(nP, -PD / 2 + 0.05); pk.translate(pc.x, pc.y, pc.z); const pb = toBrush(pk);
        // side slots under the skin: covers sink in, then slide sideways under the plate surface (Tesla charge-door style)
        const slots = [-1, 1].map(sg => { const sk = new THREE.BoxGeometry(W / 2 + 0.12, Hh + 0.08, 0.08); sk.applyMatrix4(bw);
          const sc = cw.clone().addScaledVector(uw, sg * (W / 2 + 0.02)).addScaledVector(nP, -0.1); sk.translate(sc.x, sc.y, sc.z); return toBrush(sk); });
        g.children.forEach(m => { if (!m.isMesh || !/pauldron/.test(m.name)) return; let br = toBrush(m.geometry); for (const sb of slots) br = cOp(br, sb, SUBTRACTION); const r = cOp(br, pb, SUBTRACTION).geometry.clone(), r2 = r.index ? r.toNonIndexed() : r; r2.computeVertexNormals(); m.geometry = r2; });
        const k2 = new Kit();
        k2.add('dark', put(new THREE.BoxGeometry(W + 0.08, Hh + 0.08, 0.04), 0, 0, -PD));
        const nx = Math.max(1, Math.floor(W / 0.34)), ny = Math.max(1, Math.floor(Hh / 0.36));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const du = (i - (nx - 1) / 2) * W / nx, dv = (j - (ny - 1) / 2) * Hh / ny;
          k2.add('chrome', put(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18).rotateX(Math.PI / 2), du, dv, -PD + 0.06));
          k2.add('dark', put(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16).rotateX(Math.PI / 2), du, dv, -PD + 0.105));
          k2.add('clay', put(new THREE.ConeGeometry(0.08, 0.1, 12).rotateX(Math.PI / 2), du, dv, -PD + 0.13));
        }
        k2.into(g, mats, id + '.slat');
        for (const sg of [-1, 1]) {
          const cg = grp(g, null), k3 = new Kit();
          k3.add('clay', put(new THREE.BoxGeometry(W / 2 + 0.03, Hh + 0.07, 0.05), sg * (W / 4 + 0.01), 0, -0.03));   // flush with the plate face
          k3.into(cg, mats, id + '.slat');
          missileCovers.push({ g: cg, n: nl.clone().multiplyScalar(-0.07), d: ul.clone().multiplyScalar(sg * (W / 2 + 0.04)) });
        }
      });
      return slats;
    };
    panelSlats.visor = build(visorM, 'visor'); panelSlats.flap = build(flapM, 'flap');
  };
  // shoulder pitch drive: two telescopic actuators per shoulder, from lugs under the (torso-fixed) shell roof down to
  // lugs on the drum, one pulling each way - fills the shell interior with working mechanism instead of empty space
  const mountPitchActs = (fixedM) => {
    root.updateMatrixWorld(true);
    const T = THREE, ray = new T.Raycaster(), q = new Kit(), d = new Kit();
    const za = spec.pitchActZ ?? 1.25;
    [[capX + 0.14, 1], [capX + dl - 0.14, -1]].forEach(([xl, f]) => {
      const w = root.localToWorld(P(xl, 0, f * za)); ray.set(w, new V3(0, 1, 0));
      const hit = ray.intersectObjects(fixedM)[0]; if (!hit) return;
      const ry = root.worldToLocal(hit.point.clone()).y;
      const pa = P(xl, ry - 0.5, f * za), pb = P(xl, S(0.62), -f * S(0.5));
      q.add('clay', obox(P(xl, (ry + pa.y) / 2 + 0.03, pa.z), X, Y, 0.3, ry - pa.y + 0.12, 0.36));   // lug hanging from the roof
      d.add('clay', obox(P(xl, S(0.72), -f * S(0.5)), X, Y, 0.3, 0.42, 0.36));                         // lug on the drum
      lives.push(new LiveAct(root, pa, pitch, pb, 0.14, id + '.act'));
    });
    q.into(root, mats, id + '.shoulderFix'); d.into(pitch, mats, id + '.pitch');
  };
  const mountShell = (meshes, cut) => {
    root.updateMatrixWorld(true);
    // hinge on top of the seam: at the cut, at the highest point of the outer shell there, so every point of the
    // shell is below / outside it and only moves outward-up when it flips
    const sx = Math.sign(spec.hub[0]), v = new V3(); let top = -1e9, roof = -1e9;
    for (const m of meshes) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (Math.abs(v.x - cut) < 0.35) top = Math.max(top, v.y); } }
    const ray = new THREE.Raycaster(); ray.set(new V3(cut + sx * 0.3, spec.hub[1], spec.hub[2]), new V3(0, 1, 0));
    const hit = ray.intersectObjects(meshes)[0]; roof = hit ? hit.point.y : top - 0.6;
    const hl = root.worldToLocal(new V3(cut, top + 0.1, spec.hub[2]));
    flap = grp(pitch, hl, id + '.flap'); root.updateMatrixWorld(true);
    let z0 = 1e9, z1 = -1e9;
    for (const m of meshes) { flap.attach(m); m.userData.part = id + '.shell'; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; z0 = Math.min(z0, b.min.z - spec.hub[2]); z1 = Math.max(z1, b.max.z - spec.hub[2]); }
    z0 += 0.4; z1 -= 0.4;
    if (spec.hingeSpan) { z0 = Math.max(z0, -spec.hingeSpan); z1 = Math.min(z1, spec.hingeSpan); }   // rear: short hinge keeps the shell within its swing radius
    const kh = Math.min(0.45, (z1 - z0) * 0.18);
    // carrier: strut from the drum up to the roof, then a thin plate rising through the 0.15 seam to the hinge pin
    const q = new Kit(), base = P(capX + dl * 0.45, S(0.75), 0), gx = hl.x - 0.075, R = P(gx + 0.15, roof - spec.hub[1] - 0.25, 0), H = hl.clone();
    q.add('clay', obox(base.clone().lerp(R, 0.5), Z, R.clone().sub(base), 0.5, base.distanceTo(R) + 0.3, 0.3));
    q.add('clay', obox(P(gx, (R.y + H.y) / 2, 0), X, Y, 0.11, H.y - R.y + 0.1, 1.0));
    q.add('clay', rod(H.clone().add(P(0, 0, -kh)), H.clone().add(P(0, 0, kh)), 0.13, 16));
    q.add('chrome', rod(H.clone().add(P(0, 0, z0)), H.clone().add(P(0, 0, z1)), 0.06, 12));
    q.into(pitch, mats, id + '.pitch');
    const f = new Kit();
    for (const [za, zb] of [[z0, -kh - 0.1], [kh + 0.1, z1]]) if (zb - za > 0.2) {
      const n = Math.max(1, Math.round((zb - za) / 0.9));
      for (let i = 0; i < n; i++) { const a = za + (zb - za) * i / n + 0.04, b = za + (zb - za) * (i + 1) / n - 0.04;
        f.add('clay', rod(P(0, 0, a), P(0, 0, b), 0.13, 16), obox(P(0.12, -0.12, (a + b) / 2), X, Y, 0.24, 0.24, b - a)); }   // knuckles, leaf down into the shell top
    }
    f.into(flap, mats, id + '.shell');
  };
  const poseAt = (t) => { if (!spec.ready) return spec.pose; const a = ease(win(t, 0, 0.45)), o = {}; for (const key in spec.pose) o[key] = lerp(spec.pose[key], spec.ready[key], a); return o; };
  if (spec.deltoid && !M) {   // outer link: drum end -> top of the upper-arm armour (lifts the arm sideways, pin axis z)
    const a0 = -K(0.75);
    lives.push(new LiveAct(pitch, P(capX + dl + 0.14, -S(0.62), 0), twist, P(ox + hx * 0.72, a0 - K(0.35), 0), 0.17, id + '.act', Z));
  }
  const arm = {
    id, root, spec, setPose, mountShell, mountPanels, mountPitchActs, joints: { pitch, abd, ua, twist, elbow, fore }, lives, t: 0,
    finish() {
      const R = Math.PI / 180, b0 = spec.pose, ext = [poseAt(0), poseAt(1), { ...b0, abd: b0.abd + (spec.abdMax ?? 125) * R }, { ...b0, abd: b0.abd + 0.5 * (spec.abdMax ?? 125) * R }, { ...b0, elbow: (spec.elbowMin ?? -0.2) }, { ...b0, elbow: 135 * R }, { ...b0, twist: 1.0 }, { ...b0, twist: -1.0 }, { ...b0, abd: b0.abd + 60 * R, twist: 1.0 }, { ...b0, abd: b0.abd + 60 * R, twist: -1.0 }, ...(spec.pitchRange || [-30, 100]).map(dg => ({ ...b0, pitch: b0.pitch + dg * R })), ...(spec.pitchRange || [-30, 100]).map(dg => ({ ...b0, pitch: b0.pitch + dg * R, abd: b0.abd + 40 * R }))];   // whole range the joints are expected to use
      const d = ext.map(p => { setPose(p); root.updateMatrixWorld(true); return lives.map(l => l.dist()); });
      setPose(spec.pose); root.updateMatrixWorld(true);
      lives.forEach((l, i) => { const v = d.map(x => x[i]); l.build(mats, Math.min(...v), Math.max(...v)); l.update(); });
    },
    update() { root.updateMatrixWorld(true); lives.forEach(l => l.update()); },
    deploy(t) { arm.t = t; setPose(poseAt(t)); ctx.deploy && ctx.deploy(t); arm.update(); },
    spin(a) { ctx.spin && ctx.spin(a); },
    setMissiles(t) { const e1 = ease(clamp01(t / 0.3)), e2 = ease(clamp01((t - 0.3) / 0.7)); missileCovers.forEach(c => c.g.position.copy(c.n).multiplyScalar(e1).addScaledVector(c.d, e2)); },
  };
  arm.hand = ctx.hand;   // five-finger hand (open / grip), when this forearm has one
  return arm;
}

// torso (optional): the torso group; its outer shoulder shells (TORSO.shells) are moved onto the arms
export function buildArms(mats, { torso = null, shells = null, panels = null, modules = null, rearShell = true } = {}) {
  const group = new THREE.Group(); group.name = 'arms';
  if (torso && modules && modules.right) { torso.updateMatrixWorld(true); ARM.right.module = { meshes: modules.right.names.map(n => torso.getObjectByName(n)).filter(Boolean), cut: modules.right.cut }; }
  const arms = {
    right: buildArm('R', ARM.right, mats, forearmCannon),
    leftFront: buildArm('LF', ARM.leftFront, mats, forearmBlade),
    leftRear: buildArm('LR', ARM.leftRear, mats, forearmClaw),
  };
  for (const a of Object.values(arms)) group.add(a.root);
  group.updateMatrixWorld(true);
  if (torso && shells) {
    torso.updateMatrixWorld(true);
    for (const [key, sh] of Object.entries(shells)) arms[key].mountShell(sh.names.map(n => torso.getObjectByName(n)).filter(Boolean), sh.cut);
  }
  if (torso && panels) {
    const get = n => n.map(x => torso.getObjectByName(x)).filter(Boolean);
    const FIX = { right: ['pauldron1a', 'pauldron1b', 'paulCap1'], leftFront: ['pauldron-1', 'paulCap-1'] };
    for (const [key, P2] of Object.entries(panels)) arms[key].mountPanels(get(P2.visor.names), get(P2.flap.names), P2, get(FIX[key] || []));
  }
  if (torso) {
    const fx = (names) => names.map(n => torso.getObjectByName(n)).filter(Boolean);
    arms.right.mountPitchActs(fx(['pauldron1a', 'pauldron1b', 'paulCap1']));
    arms.leftFront.mountPitchActs(fx(['pauldron-1', 'paulCap-1']));
  }
  if (rearShell) {   // compact rear shell, built in the rear arm's frame, then handed to mountShell like the others
    const a = arms.leftRear, g = buildRearShell(), ms = [];
    for (const [mat, list] of Object.entries(g)) for (const geo of list) { const m = new THREE.Mesh(geo, mats[mat]); m.name = 'rearShell:' + mat; a.root.add(m); ms.push(m); }
    a.root.updateMatrixWorld(true);
    for (const m of ms) {
      const g = m.geometry; g.applyMatrix4(m.matrixWorld);
      if (m.matrixWorld.determinant() < 0) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) for (let c = 0; c < 3; c++) { const t = p.getComponent(i + 1, c); p.setComponent(i + 1, c, p.getComponent(i + 2, c)); p.setComponent(i + 2, c, t); } }   // mirrored: restore winding
      g.computeVertexNormals(); a.root.remove(m); m.updateMatrixWorld(true);
    }
    a.mountShell(ms, a.spec.hub[0] + Math.sign(a.spec.hub[0]) * 1.25);
  }
  for (const a of Object.values(arms)) { a.finish(); a.deploy(0); }
  return { group, arms };
}
