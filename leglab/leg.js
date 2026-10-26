// Lower body (pelvis + two legs), outline pass.
// World frame = head frame: x right, y up (chin y = 0, head 4 units tall), z forward. Ground y = LEG.ground.
// Overall proportion from the full-body reference (about 10 heads tall, legs a bit over half the height);
// shapes from the leg / foot sheets: big faceted front-outer thigh shell, open inner-back with the knee ram,
// knee discs + knee cap, tapered shin plate, split calf plates with the ankle ram in the slot, 3-toe foot + heel spur.
// Each leg is a joint chain: hip (yaw / abduct / pitch) -> knee -> ankle -> toes. Rams are live (follow the pose).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rod, disc, obox } from '../necklab/neck.js';
import { TORSO } from '../torsolab/torso.js';

const V3 = THREE.Vector3, X = new V3(1, 0, 0), UP = new V3(0, 1, 0);
const P = (x, y, z) => new V3(x, y, z);

// ---------- key dimensions (right leg, x > 0; left leg mirrored) ----------
export const LEG = {
  ground: -36,
  pelvisTop: TORSO.hipY,                    // -12.1, strut eyes sit in lugs on this deck
  hip: { x: 2.95, y: -13.6, z: 0 },
  knee: { x: 2.75, y: -23.6, z: 0.2 },
  ankle: { x: 2.95, y: -33.3, z: -0.1 },
  toe: { y: -35.55, z: 2.0 },
};

// convex hull of points (faceted, flat-shaded)
const hull = (pts) => new ConvexGeometry(pts);
// chamfered rectangle ring at height y: x0..x1 (measured outward, mirrored by s), z0..z1, corner cut c;
// optional ridges: kf = front keel (centre of the front face pushed forward), ko = outer, kb = back
function ring(s, y, x0, x1, z0, z1, c, kf = 0, ko = 0, kb = 0) {
  const q = [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
  if (kf) q.push([(x0 + x1) / 2, z1 + kf]);
  if (ko) q.push([x1 + ko, (z0 + z1) / 2]);
  if (kb) q.push([(x0 + x1) / 2, z0 - kb]);
  return q.map(([x, z]) => P(s * x, y, z));
}
const rings = (s, list) => hull(list.flatMap(r => ring(s, ...r)));
// flat hex plate on a side face (constant x): outline zy = [[z, y], ...], inner face at xIn, bevelled outer face at xOut
function sidePlate(s, xIn, xOut, zy, bev = 0.1) {
  const cz = zy.reduce((a, p) => a + p[0], 0) / zy.length, cy = zy.reduce((a, p) => a + p[1], 0) / zy.length;
  const pts = [];
  for (const [z, y] of zy) {
    pts.push(P(s * xIn, y, z));
    const d = Math.hypot(z - cz, y - cy), k = d > bev ? (d - bev) / d : 0;
    pts.push(P(s * xOut, cy + (y - cy) * k, cz + (z - cz) * k));
  }
  return hull(pts);
}
// plate from an outline (world points) extruded along `off`, optional ridge points pushed further by `ridge`
const slab = (pts, off, ridge = []) => hull([...pts, ...pts.map(p => p.clone().add(off)), ...ridge]);
// box between two points (local y along a->b), width w (x) and depth d
function beam(a, b, w, d) {
  const dir = new V3().subVectors(b, a);
  return obox(a.clone().add(b).multiplyScalar(0.5), X, dir, w, dir.length(), d);
}
function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
// merge a part list (authored in world rest pose) into one mesh per material, re-based to the joint origin o
function addPart(parent, name, cn, lists, mats, o) {
  for (const [mat, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const g = mergeGeometries(list.map(clean)); g.translate(-o.x, -o.y, -o.z);
    const m = new THREE.Mesh(g, mats[mat] || mats.clay); m.name = `${name}:${mat}`; m.userData.cn = cn; m.userData.part = name;
    parent.add(m);
  }
}

// ---------- live hydraulic ram: barrel hangs from end B, rod from end A, eyes on pins parallel to x ----------
class Ram {
  constructor(root, mats, name, objA, pA, objB, pB, r, { kb = 0.6, kr = 0.56 } = {}) {
    Object.assign(this, { root, objA, pA, objB, pB, r });
    root.updateMatrixWorld(true);
    const L0 = this.ends()[0].distanceTo(this.ends()[1]);
    this.Lb = L0 * kb; this.Lr = L0 * kr;             // works for lengths kr .. kb + kr - 0.06 of rest (default 0.56 .. 1.1)
    const bar = [], ch = [];
    const eB = r * 1.05, eA = r * 0.78;
    bar.push(disc(P(0, 0, 0), X, eB, r * 2.1));                               // lower eye
    bar.push(obox(P(0, eB * 0.9, 0), X, UP, r * 1.5, eB * 1.4, r * 1.5));     // clevis block
    const b0 = eB * 1.5, b1 = this.Lb, s1 = b0 + (b1 - b0) * 0.2, s2 = b0 + (b1 - b0) * 0.82, gp = 0.03;
    bar.push(rod(P(0, b0, 0), P(0, s1 - gp, 0), r, 28), rod(P(0, s1 + gp, 0), P(0, s2 - gp, 0), r, 28), rod(P(0, s2 + gp, 0), P(0, b1, 0), r, 28));
    bar.push(rod(P(0, s1 - gp, 0), P(0, s1 + gp, 0), r * 0.92, 28), rod(P(0, s2 - gp, 0), P(0, s2 + gp, 0), r * 0.92, 28));
    bar.push(rod(P(0, b1, 0), P(0, b1 + 0.06, 0), r * 1.12, 28));             // gland collar
    const rr = r * 0.58;
    ch.push(rod(P(0, 0, 0), P(0, -this.Lr, 0), rr, 20));                     // piston rod (from A towards B)
    const end = [disc(P(0, 0, 0), X, eA, r * 1.6), obox(P(0, -eA * 0.9, 0), X, UP, r * 1.1, eA * 1.2, r * 1.1)];
    this.barrel = new THREE.Mesh(mergeGeometries(bar.map(clean)), mats.clay); this.barrel.name = name + ':barrel';
    this.rod = new THREE.Mesh(mergeGeometries(ch.map(clean)), mats.chrome || mats.clay); this.rod.name = name + ':rod';
    this.eye = new THREE.Mesh(mergeGeometries(end.map(clean)), mats.clay); this.eye.name = name + ':eye';
    for (const m of [this.barrel, this.rod, this.eye]) { m.userData.part = name; m.matrixAutoUpdate = false; root.add(m); }
    this.update();
  }
  ends() {
    const a = this.root.worldToLocal(this.objA.localToWorld(this.pA.clone()));
    const b = this.root.worldToLocal(this.objB.localToWorld(this.pB.clone()));
    return [a, b];
  }
  update() {
    this.root.updateMatrixWorld(true);
    const [a, b] = this.ends(), y = new V3().subVectors(a, b).normalize();
    let x = X.clone().addScaledVector(y, -X.dot(y)); if (x.lengthSq() < 1e-4) x = new V3(0, 0, 1); x.normalize();
    const z = new V3().crossVectors(x, y);
    const mB = new THREE.Matrix4().makeBasis(x, y, z).setPosition(b), mA = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a);
    this.barrel.matrix.copy(mB); this.rod.matrix.copy(mA); this.eye.matrix.copy(mA);
    this.len = a.distanceTo(b);
  }
}

// ---------- live hose: leaves end A along tA, enters end B along tB (both in their parts' local frames),
// rebuilt whenever the pose changes; both ends are buried in ports on the parts ----------
class Hose {
  constructor(root, mat, name, objA, pA, tA, objB, pB, tB, r, reach = 0.8) {
    Object.assign(this, { root, objA, pA, tA: tA.clone().normalize(), objB, pB, tB: tB.clone().normalize(), r, reach });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); this.mesh.name = name + ':hose'; this.mesh.userData.part = name;
    root.add(this.mesh); this.update();
  }
  ends() {
    const w = (o, p) => this.root.worldToLocal(o.localToWorld(p.clone()));
    const d = (o, t) => w(o, t).sub(w(o, P(0, 0, 0)));
    return [w(this.objA, this.pA), d(this.objA, this.tA), w(this.objB, this.pB), d(this.objB, this.tB)];
  }
  update() {
    this.root.updateMatrixWorld(true);
    const [a, ta, b, tb] = this.ends(), L = a.distanceTo(b), k = Math.min(this.reach, L * 0.35);
    const c = new THREE.CatmullRomCurve3([a, a.clone().addScaledVector(ta, k), b.clone().addScaledVector(tb, k), b], false, 'centripetal');
    this.mesh.geometry.dispose(); this.mesh.geometry = new THREE.TubeGeometry(c, 36, this.r, 10);
    this.a = a; this.b = b;
  }
}

// ring of bolt heads on a joint face (axis x), centre c, radius rr
const boltRing = (list, c, rr, n = 6, h = 0.08) => { for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; list.push(disc(P(c.x, c.y + rr * Math.cos(a), c.z + rr * Math.sin(a)), X, 0.07, h, 6)); } };

// ---------- build ----------
// opt.cuffShift: slide the ankle cuff toward the body centreline (finallab uses it with the lower legs swapped)
// opt.ankleCheeks: false drops the shin's ankle cheeks/discs (finallab fits a big ankle drum instead)
export function buildLegs(mats, opt = {}) {
  const cs = opt.cuffShift || 0;
  const root = new THREE.Group(); root.name = 'lowerBody';
  const O = P(0, 0, 0);

  // ================= pelvis (fixed to the waist) =================
  {
    const clay = [], dark = [], chrome = [];
    const T = LEG.pelvisTop;
    // faceted pelvis box, narrowing down into the crotch
    // (the back is cut away steeply below the deck so the hip rams clear it when the thigh swings forward)
    clay.push(hull([
      ...ring(1, T, -2.75, 2.75, -1.9, 1.9, 0.35), ...ring(1, T - 0.9, -2.6, 2.6, -1.9, 2.0, 0.4),
      ...ring(1, T - 2.2, -1.5, 1.5, -1.0, 1.7, 0.4), ...ring(1, T - 2.9, -0.9, 0.9, -0.8, 1.3, 0.3)]));
    clay.push(obox(P(0, T - 1.7, -1.4), X, UP, 1.7, 1.8, 0.9));                // mount block behind the back crotch plate
    // lugs for the 12 waist strut eyes (eye pins along x), embedded 0.3 into the deck
    const pins = TORSO.hipPins || [];
    for (const p of pins) {
      const r = Math.abs(p.x) > 2.2 ? 0.24 : 0.17;
      clay.push(obox(P(p.x, T + 0.05, p.z), X, UP, r * 2.1 + 0.12, 0.7, r * 2.4 + 0.12));
      chrome.push(disc(P(p.x, p.y, p.z), X, r * 0.45, r * 2.1 + 0.2, 16));    // pin
    }
    for (const s of [1, -1]) {
      // hip mount: side block carrying the hip drum
      clay.push(obox(P(s * 2.15, LEG.hip.y + 0.1, 0), X, UP, 0.9, 1.7, 1.9));
      dark.push(obox(P(s * 2.62, LEG.hip.y + 0.1, 0), X, UP, 0.04, 1.3, 1.5));
      // hip ram lugs on the back of the pelvis (two rams per leg, barrels hang from here)
      for (const px of [1.6, 2.25]) clay.push(obox(P(s * px, -12.55, -2.35), X, UP, 0.56, 0.6, 1.0));
      clay.push(obox(P(s * 1.85, -14.45, 0.1), X, UP, 0.32, 0.3, 0.32));         // hip hose port (under the hip mount)
      // crotch plates (front / back): pointed, faceted, standing off the pelvis
      for (const f of [1, -1]) {
        const zz = (a, b) => f > 0 ? [a, b] : [-b, -a];
        if (s > 0) clay.push(hull([
          ...ring(1, T - 0.4, -1.25, 1.25, ...zz(1.75, 2.15), 0.12),
          ...ring(1, T - 2.2, -0.95, 0.95, ...zz(1.55, 2.3), 0.15),
          P(0, T - 3.9, f * 1.35), P(0, T - 3.9, f * 1.75)]));
      }
    }
    dark.push(obox(P(0, T - 1.4, 2.32), X, UP, 0.06, 2.2, 0.03));             // crotch plate centre seam
    addPart(root, 'pelvis', '胯部', { clay, dark, chrome }, mats, O);
  }

  // ================= legs =================
  const legs = {};
  for (const s of [1, -1]) {
    const id = s > 0 ? 'R' : 'L';
    const H = P(s * LEG.hip.x, LEG.hip.y, LEG.hip.z), K = P(s * LEG.knee.x, LEG.knee.y, LEG.knee.z);
    const A = P(s * LEG.ankle.x, LEG.ankle.y, LEG.ankle.z), Tp = P(s * LEG.ankle.x, LEG.toe.y, LEG.toe.z);
    const hipG = new THREE.Group(); hipG.position.copy(H); hipG.rotation.order = 'YZX'; root.add(hipG);
    const kneeG = new THREE.Group(); kneeG.position.copy(K).sub(H); hipG.add(kneeG);
    const ankleG = new THREE.Group(); ankleG.position.copy(A).sub(K); kneeG.add(ankleG);
    const toeG = new THREE.Group(); toeG.position.copy(Tp).sub(A); ankleG.add(toeG);
    for (const g of [hipG, kneeG, ankleG, toeG]) g.name = `leg${id}`;
    const x = v => s * v;

    // ---- thigh ----
    {
      const clay = [], dark = [];
      clay.push(disc(H, X, 0.95, 0.8));                                         // hip drum
      clay.push(disc(P(x(3.45), H.y, 0), X, 0.6, 0.25));                       // drum cap
      clay.push(beam(P(x(2.85), -13.4, -0.2), P(x(2.75), -22.7, -0.1), 1.3, 1.3));   // thigh frame
      // front-outer shell in two layers, each with a centre keel: upper plate, then the lower plate standing proud of it
      clay.push(rings(s, [
        [-13.05, 2.95, 4.2, -0.3, 1.45, 0.35, 0.12], [-14.4, 2.15, 4.35, -0.35, 2.05, 0.45, 0.3],
        [-17.5, 2.05, 4.3, -0.35, 2.0, 0.5, 0.3]]));
      clay.push(rings(s, [
        [-17.65, 2.1, 4.25, -0.3, 2.12, 0.5, 0.34], [-19.4, 2.12, 4.15, -0.3, 1.95, 0.5, 0.3],
        [-21.4, 2.2, 3.95, -0.25, 1.62, 0.45, 0.22], [-22.6, 2.45, 3.5, -0.05, 1.22, 0.3, 0.1]]));
      // hex plate on the outer face (sits in the shell, keeps the arm clearance)
      clay.push(sidePlate(s, 4.15, 4.5, [[1.15, -14.7], [1.55, -16.1], [1.35, -19.3], [0.75, -20.6], [-0.35, -20.6], [-0.85, -19.3], [-1.05, -16.1], [-0.55, -14.7]], 0.12));
      // outer-rear plate in two lames with a back ridge (inner back stays open for the knee ram)
      clay.push(rings(s, [[-14.6, 3.45, 4.35, -1.55, -0.2, 0.25, 0, 0, 0.1], [-17.2, 3.4, 4.4, -1.75, -0.2, 0.3, 0, 0, 0.18]]));
      clay.push(rings(s, [[-17.35, 3.42, 4.38, -1.85, -0.2, 0.3, 0, 0, 0.2], [-20.6, 3.5, 4.1, -1.2, -0.2, 0.25, 0, 0, 0.08]]));
      // inner thigh armour: two lames reaching in towards the crotch (closes the gap between the legs),
      // kept forward of the hip rams; each lame has a vertical keel on its inner face. Lower lame stands a little proud.
      const innerLame = (secs, keel) => hull([...secs.flatMap(r => ring(s, ...r)), ...keel.map(([y, xi, z]) => P(x(xi), y, z))]);
      clay.push(innerLame([[-15.7, 1.6, 2.25, -0.15, 1.65, 0.25], [-16.5, 1.38, 2.25, -0.45, 1.95, 0.3], [-18.5, 1.36, 2.25, -0.55, 1.95, 0.3]],
        [[-16.6, 1.24, 0.75], [-18.4, 1.22, 0.7]]));
      clay.push(innerLame([[-18.65, 1.3, 2.2, -0.6, 2.0, 0.3], [-20.4, 1.34, 2.2, -0.65, 1.85, 0.3], [-21.7, 1.68, 2.25, -0.35, 1.4, 0.25]],
        [[-18.75, 1.16, 0.7], [-20.4, 1.2, 0.6]]));
      dark.push(obox(P(x(1.3), -17.5, 1.97), X, UP, 0.03, 1.6, 0.03));          // lame edge line on the front
      clay.push(obox(P(x(1.85), -15.62, 0.15), X, UP, 0.32, 0.22, 0.34));       // hip hose port on the inner lame's top edge
      // knee cheeks + outer / inner knee discs
      for (const dx of [0.68, -0.68]) {
        clay.push(obox(P(K.x + s * dx, -23.0, 0.1), X, UP, 0.26, 1.3, 1.25));
        clay.push(disc(P(K.x + s * dx * 1.05, K.y, K.z), X, dx > 0 ? 0.88 : 0.78, 0.26));
      }
      clay.push(obox(P(x(2.85), -16.8, -1.1), X, UP, 0.62, 0.8, 0.8));         // knee ram upper lug
      clay.push(obox(P(x(2.75), -16.2, -1.15), X, UP, 1.05, 0.75, 0.8));       // hip ram lower lugs (both rams), merged with the knee lug
      dark.push(obox(P(x(4.5), -16.2, 0.8), X, UP, 0.03, 2.6, 1.4));            // shell seam
      // hip joint details: flange against the mount, bolt rings on the drum face and cap
      dark.push(disc(P(x(2.6), H.y, 0), X, 1.05, 0.08));
      boltRing(clay, P(x(3.37), H.y, 0), 0.8, 8); boltRing(clay, P(x(3.6), H.y, 0), 0.42, 6);
      // knee disc details (outer / inner face): raised boss, bolt ring
      for (const [dx, f] of [[0.714, 1], [-0.714, -1]]) {
        const fx = K.x + s * (dx + f * 0.13);
        clay.push(disc(P(fx + s * f * 0.04, K.y, K.z), X, 0.5, 0.1));
        boltRing(clay, P(fx, K.y, K.z), 0.66, 8);
      }
      // hose ports on the frame back: hip hose (inner), two knee hoses
      for (const hx of [2.38, 3.3]) clay.push(obox(P(x(hx), -21.6, -0.95), X, UP, 0.3, 0.35, 0.4));
      addPart(hipG, `leg${id}.thigh`, '大腿', { clay, dark }, mats, H);
    }
    // ---- shin ----
    {
      const clay = [], dark = [];
      clay.push(disc(K, X, 0.6, 1.1));                                          // knee hub
      clay.push(beam(P(x(2.75), -23.6, 0.05), P(x(2.95), -32.6, -0.1), 1.1, 1.1));   // shin frame
      // knee cap: keeled, pointed downward
      clay.push(hull([...ring(s, -23.0, 2.35, 3.25, 0.95, 1.45, 0.15, 0.1), ...ring(s, -23.9, 2.05, 3.55, 1.0, 1.95, 0.3, 0.25),
        ...ring(s, -25.0, 2.4, 3.2, 0.9, 1.55, 0.15, 0.12), P(x(2.8), -25.7, 1.3), P(x(2.8), -25.6, 0.95)]));
      // shin front in three layers: flared collar under the knee cap, main keeled plate, ankle cuff
      clay.push(rings(s, [[-24.3, 1.85, 3.55, -0.2, 1.4, 0.35], [-25.9, 1.6, 3.75, -0.3, 1.75, 0.45, 0.2]]));
      clay.push(rings(s, [[-26.05, 1.58, 3.72, -0.25, 1.9, 0.45, 0.3], [-29.0, 1.6, 3.75, -0.3, 1.75, 0.45, 0.28], [-31.3, 1.85, 3.65, -0.3, 1.45, 0.4, 0.18]]));
      clay.push(rings(s, [[-31.45, 1.9 - cs, 3.7 - cs, -0.35, 1.52, 0.4, 0.15], [-32.7, 2.2 - cs, 3.5 - cs, -0.15, 1.15, 0.3, 0.08]]));
      // hex plate on the outer shin face
      clay.push(sidePlate(s, 3.6, 3.92, [[1.0, -25.1], [1.4, -26.5], [1.2, -30.0], [0.7, -31.0], [-0.05, -31.0], [-0.45, -30.0], [-0.5, -26.5], [-0.2, -25.1]], 0.1));
      // hex plate on the inner shin face (mirror of the outer one, a little smaller)
      clay.push(sidePlate(s, 1.62, 1.4, [[0.9, -25.6], [1.3, -26.8], [1.1, -29.8], [0.6, -30.7], [-0.05, -30.7], [-0.4, -29.8], [-0.45, -26.8], [-0.15, -25.6]], 0.1));
      // split calf plates (inner / outer), each in two lames with a back ridge; slot in between for the ankle ram
      for (const [x0, x1, kb] of [[1.6, 2.52, 0.12], [3.18, 3.9, 0.22]]) {
        clay.push(rings(s, [[-24.6, x0, x1, -1.1, -0.3, 0.12, 0, 0, kb * 0.5], [-27.15, x0 - 0.05, x1 + 0.05, -1.95, -0.3, 0.18, 0, 0, kb]]));
        clay.push(rings(s, [[-27.3, x0 - 0.03, x1 + 0.03, -1.88, -0.3, 0.18, 0, 0, kb], [-31.0, x0 + 0.05, x1, -1.1, -0.3, 0.12, 0, 0, kb * 0.4]]));
      }
      clay.push(obox(P(x(2.8), -24.8, -0.8), X, UP, 0.6, 0.7, 0.75));          // knee ram lower lug
      clay.push(obox(P(x(2.85), -28.0, -0.78), X, UP, 0.56, 0.7, 0.62));       // ankle ram upper lug
      // ankle cheeks + discs (finallab replaces them with one big drum: opt.ankleCheeks === false)
      if (opt.ankleCheeks !== false) for (const dx of [0.62, -0.62]) {
        clay.push(obox(P(A.x + s * dx, -32.8, -0.1), X, UP, 0.24, 1.1, 1.1));
        clay.push(disc(P(A.x + s * dx * 1.05, A.y, A.z), X, 0.74, 0.24));
      }
      dark.push(obox(P(x(2.85), -27.5, 1.93), X, UP, 0.05, 3.0, 0.03));       // shin plate seam
      // ankle disc details (outer / inner face)
      if (opt.ankleCheeks !== false) for (const [dx, f] of [[0.651, 1], [-0.651, -1]]) {
        const fx = A.x + s * (dx + f * 0.12);
        clay.push(disc(P(fx + s * f * 0.04, A.y, A.z), X, 0.4, 0.1));
        boltRing(clay, P(fx, A.y, A.z), 0.56, 6);
      }
      // frame ribs in the calf slot, between the knee ram and the ankle ram
      for (const y of [-25.5, -26.2, -26.9, -27.4]) clay.push(obox(P(x(2.84), y, -0.6), X, UP, 0.5, 0.12, 0.14));
      // hose ports on the shin frame back: two knee hoses (top), two ankle hoses (bottom)
      for (const hx of [2.38, 3.3]) {
        clay.push(obox(P(x(hx), -24.25, -0.7), X, UP, 0.3, 0.35, 0.4));
        clay.push(obox(P(x(hx), -31.25, -0.8), X, UP, 0.3, 0.35, 0.4));
      }
      addPart(kneeG, `leg${id}.shin`, '小腿', { clay, dark }, mats, K);
    }
    // ---- foot: armoured boot (body, split sole with an arch gap, block heel, stepped instep lames, ankle guards) ----
    {
      const clay = [], dark = [];
      clay.push(disc(A, X, 0.5, 0.98));                                         // ankle hub
      // boot body (sits on the sole, bottom at -35.72)
      clay.push(rings(s, [[-35.72, 1.85, 4.05, -2.2, 2.15, 0.4], [-35.3, 1.9, 4.0, -2.0, 2.2, 0.45], [-34.2, 2.25, 3.65, -1.2, 1.3, 0.4], [-33.6, 2.5, 3.4, -0.7, 0.6, 0.3]]));
      // sole: heel block and forefoot block, open arch between them
      clay.push(rings(s, [[-36.0, 1.75, 4.15, -2.6, -0.85, 0.22], [-35.7, 1.75, 4.15, -2.65, -0.85, 0.22]]));
      clay.push(rings(s, [[-36.0, 1.75, 4.15, 0.2, 2.12, 0.22], [-35.7, 1.75, 4.15, 0.2, 2.15, 0.22]]));
      // heel counter: squared cup round the back of the boot, below the ram lug
      clay.push(rings(s, [[-35.7, 1.9, 4.0, -2.55, -1.2, 0.3, 0, 0, 0.08], [-34.95, 2.1, 3.8, -2.3, -1.2, 0.25]]));
      // upper heel plates either side of the ram slot (x 2.6 .. 3.1 stays open)
      for (const [x0, x1] of [[2.3, 2.6], [3.1, 3.6]])
        clay.push(rings(s, [[-35.05, x0, x1, -2.1, -1.1, 0.12], [-34.15, x0 + 0.08, x1 - 0.08, -1.75, -1.1, 0.1]]));
      clay.push(obox(P(x(2.85), -34.25, -1.65), X, UP, 0.5, 0.62, 1.1));      // ankle ram lower lug: bracket back into the heel slot
      // instep in two stepped lames (upper one stands prouder and laps over the lower one), keeled
      {
        const dir = new V3(0, 0.86, 0.5).normalize();
        const lame = (o, t, keel) => { const n = dir.clone().multiplyScalar(t); clay.push(slab(o, n, keel.map(p => p.clone().add(n).add(new V3(0, 0.08, 0))))); };
        lame([P(x(2.25), -34.42, 1.1), P(x(3.65), -34.42, 1.1), P(x(3.8), -34.75, 1.65), P(x(3.62), -35.15, 2.15), P(x(2.28), -35.15, 2.15), P(x(2.1), -34.75, 1.65)], 0.3,
          [P(x(2.95), -34.42, 1.12), P(x(2.95), -35.12, 2.1)]);
        lame([P(x(2.45), -34.0, 0.3), P(x(3.45), -34.0, 0.3), P(x(3.7), -34.3, 0.85), P(x(3.62), -34.55, 1.3), P(x(2.28), -34.55, 1.3), P(x(2.2), -34.3, 0.85)], 0.42,
          [P(x(2.95), -33.95, 0.4), P(x(2.95), -34.52, 1.28)]);
      }
      // ankle guards (outer / inner): tall plates on the flanks reaching up over the lower half of the ankle discs,
      // each on a bracket into the boot body
      clay.push(sidePlate(s, 3.95, 4.22, [[-1.75, -35.7], [1.75, -35.7], [1.95, -35.25], [0.95, -34.55], [0.4, -33.6], [-0.6, -33.6], [-1.15, -34.4], [-1.85, -35.2]], 0.1));
      clay.push(sidePlate(s, 1.95, 1.7, [[-1.6, -35.7], [1.55, -35.7], [1.75, -35.3], [0.85, -34.6], [0.35, -33.75], [-0.55, -33.75], [-1.05, -34.45], [-1.7, -35.25]], 0.1));
      clay.push(obox(P(x(3.8), -34.45, -0.1), X, UP, 0.42, 0.5, 0.9));
      clay.push(obox(P(x(2.1), -34.45, -0.1), X, UP, 0.42, 0.5, 0.9));
      dark.push(obox(P(x(4.18), -34.95, -0.1), X, UP, 0.12, 0.04, 2.4));      // guard groove
      for (const z of [-0.45, 0.25]) dark.push(obox(P(x(4.2), -35.85, z), X, UP, 0.08, 0.3, 0.05));   // sole tread notches
      for (const hx of [2.45, 3.3]) clay.push(obox(P(x(hx), -34.1, -1.45), X, UP, 0.28, 0.3, 0.35));   // ankle hose ports on the heel plates
      addPart(ankleG, `leg${id}.foot`, '脚', { clay, dark }, mats, A);
    }
    // ---- toe cap: one boot toe in two segments (forefoot + chisel tip), hinged on the toe axle ----
    {
      const clay = [], dark = [];
      // section across the foot at depth z: flat bottom yb, chamfered top yt, optional centre keel
      const sec = (z, yb, yt, x0, x1, c, k = 0) => {
        const q = [[x0, yb], [x1, yb], [x1, yt - c], [x1 - c, yt], [x0 + c, yt], [x0, yt - c]].map(([a, b]) => P(x(a), b, z));
        if (k) q.push(P(x((x0 + x1) / 2), yt + k, z));
        return q;
      };
      clay.push(hull([...sec(2.05, -35.7, -35.1, 1.8, 4.1, 0.25, 0.08), ...sec(2.95, -35.7, -35.25, 1.78, 4.12, 0.25, 0.08)]));    // forefoot
      clay.push(hull([...sec(2.85, -35.72, -35.32, 1.82, 4.08, 0.24, 0.06), ...sec(3.6, -35.72, -35.45, 1.9, 4.0, 0.22, 0.04),
        ...sec(3.95, -35.72, -35.66, 2.15, 3.75, 0.05)]));                                                                      // chisel tip
      clay.push(hull([...sec(2.2, -36.0, -35.7, 1.75, 4.15, 0.05), ...sec(3.75, -36.0, -35.7, 1.85, 4.05, 0.05), ...sec(4.0, -36.0, -35.72, 2.15, 3.75, 0.02)]));   // toe sole
      dark.push(obox(P(x(2.95), -35.1, 2.5), X, UP, 2.0, 0.03, 0.03));            // forefoot seam
      const chrome = [rod(P(x(1.65), Tp.y, Tp.z), P(x(4.25), Tp.y, Tp.z), 0.13, 16)];
      for (const hx of [1.72, 4.18]) clay.push(disc(P(x(hx), Tp.y, Tp.z), X, 0.24, 0.1, 16));   // hinge knuckles on the boot flanks
      addPart(toeG, `leg${id}.toes`, '脚趾', { clay, chrome, dark }, mats, Tp);
    }

    const leg = { id, s, hipG, kneeG, ankleG, toeG, rams: [], hoses: [] };
    // rams: hip pair (pelvis back -> thigh back), knee (thigh back -> below knee, behind the axis), ankle (calf slot -> heel)
    root.updateMatrixWorld(true);
    const loc = (g, w) => g.worldToLocal(w.clone());
    [[1.6, 2.45], [2.25, 3.05]].forEach(([px, tx], i) =>
      leg.rams.push(new Ram(root, mats, `leg${id}.ramHip${i}`, hipG, loc(hipG, P(x(tx), -16.2, -1.15)), root, P(x(px), -12.55, -2.65), 0.24, { kb: 0.8, kr: 0.6 })));
    // hoses (dark): hip (pelvis mount -> thigh frame), knee x2 (thigh frame -> shin frame, looping behind the knee),
    // ankle x2 (shin frame -> heel plates). Directions are in each part's own frame.
    const dk = mats.dark, V = (a, b, c) => new V3(a, b, c);
    const hose = (n, oA, wA, tA, oB, wB, tB, r, reach) => leg.hoses.push(new Hose(root, dk, `leg${id}.${n}`, oA, loc(oA, wA), tA, oB, loc(oB, wB), tB, r, reach));
    hose('hoseHip', root, P(x(1.85), -14.5, 0.1), V(0, -1, 0), hipG, P(x(1.85), -15.55, 0.15), V(0, 1, 0), 0.1, 0.35);
    for (const [i, hx] of [2.38, 3.3].entries()) {
      hose('hoseKnee' + i, hipG, P(x(hx), -21.6, -1.05), V(0, -0.6, -1), kneeG, P(x(hx), -24.25, -0.8), V(0, 0.6, -1), 0.09, 0.9);
      hose('hoseAnkle' + i, kneeG, P(x(hx), -31.25, -0.9), V(0, -0.5, -1), ankleG, P(x(i ? 3.3 : 2.45), -34.1, -1.5), V(0, 0.7, -1), 0.08, 0.8);
    }
    leg.rams.push(new Ram(root, mats, `leg${id}.ramKnee`, hipG, loc(hipG, P(x(2.85), -16.8, -1.15)), kneeG, loc(kneeG, P(x(2.8), -24.8, -0.95)), 0.24));
    leg.rams.push(new Ram(root, mats, `leg${id}.ramAnkle`, kneeG, loc(kneeG, P(x(2.85), -28.0, -0.85)), ankleG, loc(ankleG, P(x(2.85), -34.2, -2.0)), 0.2, { kb: 0.66 }));
    // pose in degrees: pitch (+ = leg forward), abd (+ = outward), yaw (+ = toes outward), knee (+ = bend), ankle (+ = toes up), toe (+ = up)
    leg.setPose = ({ pitch = 0, abd = 0, yaw = 0, knee = 0, ankle = 0, toe = 0 } = {}) => {
      const R = Math.PI / 180;
      leg.hipG.rotation.set(-pitch * R, s * yaw * R, s * abd * R);
      leg.kneeG.rotation.x = knee * R; leg.ankleG.rotation.x = -ankle * R; leg.toeG.rotation.x = -toe * R;
      for (const r of leg.rams) r.update();
      for (const h of leg.hoses) h.update();
      leg.pose = { pitch, abd, yaw, knee, ankle, toe };
    };
    leg.setPose();
    legs[id] = leg;
  }
  return { group: root, legs };
}
