// Neck: exposed hydraulic cluster between head and torso (static outline pass).
// World frame = head frame: x right, y up (chin at y = 0, head 4 units tall), z forward.
// Layout read from ref views (front/side in headlab/ref/views.png, back in ref/views3.png):
//   spine column (yaw) -> yoke crossbar with the two pitch discs (behind) -> head bracket
//   pitch actuators: big front pair + slim inner pair (in front of the pitch axis), rear pair (behind)
//   outer diagonals fan out to the shoulders; hoses fill the gaps.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3, UP = new V3(0, 1, 0);

// a cylinder from point a to point b
export function rod(a, b, r, seg = 24, r2 = r) {
  const d = new V3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r2, r, L, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// short cylinder centred at c with axis along `ax`
export function disc(c, ax, r, len, seg = 32) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, ax.clone().normalize()));
  g.translate(c.x, c.y, c.z); return g;
}
// box centred at c, with local y along `ay` and local x along `ax`
export function obox(c, ax, ay, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const x = ax.clone().normalize(), y = ay.clone().normalize(), z = new V3().crossVectors(x, y).normalize();
  const m = new THREE.Matrix4().makeBasis(x, new V3().crossVectors(z, x), z); m.setPosition(c);
  g.applyMatrix4(m); return g;
}

// hydraulic actuator: barrel at the lower end `b`, chrome rod up to `a`, ring collars, eye ends.
export function actuator(a, b, r, { ext = 0.5, rings = 3 } = {}) {
  const dir = new V3().subVectors(a, b), L = dir.length(); dir.normalize();
  let pin = new V3().crossVectors(dir, new V3(0, 0, 1));
  if (pin.length() < 0.3) pin = new V3(1, 0, 0);
  pin.normalize();
  const at = t => b.clone().addScaledVector(dir, t);
  const body = [], rodG = [];
  const eyeB = r * 1.05, eyeA = r * 0.75;
  const barrel0 = eyeB * 1.1, barrel1 = L * (1 - ext);           // barrel span
  body.push(disc(b, pin, eyeB, r * 2.1));                        // lower eye
  body.push(obox(at(barrel0 * 0.55), pin, dir, r * 1.5, barrel0 * 0.9, r * 1.5)); // lower clevis block
  // barrel: short base / long middle / short head, split by two shallow grooves
  const span = barrel1 - barrel0, s1 = barrel0 + span * 0.2, s2 = barrel0 + span * 0.8, gp = Math.min(0.025, r * 0.12);
  body.push(rod(at(barrel0), at(s1 - gp), r, 28), rod(at(s1 + gp), at(s2 - gp), r, 28), rod(at(s2 + gp), at(barrel1), r, 28));
  body.push(rod(at(s1 - gp), at(s1 + gp), r * 0.93, 28), rod(at(s2 - gp), at(s2 + gp), r * 0.93, 28));
  const rodR = r * 0.58;
  rodG.push(rod(at(barrel1), at(L - eyeA * 1.2), rodR, 20));      // piston rod
  body.push(obox(at(L - eyeA * 0.9), pin, dir, r * 1.1, eyeA * 1.2, r * 1.1)); // rod-end block
  body.push(disc(a, pin, eyeA, r * 1.6));                        // upper eye
  return { body, rodG };
}

// one lame of the U-shaped gorget: faceted ring segment (open at the front), elliptical in plan,
// cross-section `prof` = [[r (normalised), y], ...] closed polygon; rises toward the back by `lift`
function gorgetLame(prof, { a0, a1, seg, rx, rz, cz, y0, lift, drop = 0 }) {
  const pos = [], ring = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = a0 + (a1 - a0) * u, back = Math.max(0, -Math.cos(a));
    const closed = a1 - a0 > 6.2, tip = closed ? 1 : Math.min(1, u / 0.14, (1 - u) / 0.14), k = 0.75 + 0.25 * tip;   // open ends taper
    const fx = Math.abs(Math.sin(a)) * rx, front = Math.cos(a) > 0 ? Math.min(1, Math.max(0, (1.75 - fx) / 0.5)) : 0; // front span over the deck
    ring.push(prof.map(([r, y]) => [Math.sin(a) * r * rx, y0 + y * k + lift * back * back - drop * front, cz + Math.cos(a) * r * rz]));
  }
  const tri = (p, q, r) => pos.push(...p, ...r, ...q);   // outward winding
  const n = prof.length;
  for (let i = 0; i < seg; i++) for (let j = 0; j < n; j++) {
    const A = ring[i][j], B = ring[i][(j + 1) % n], C = ring[i + 1][(j + 1) % n], D = ring[i + 1][j];
    tri(A, B, C); tri(A, C, D);
  }
  for (const [k, flip] of [[0, false], [seg, true]]) {           // end caps (fan)
    const R = ring[k], c = R.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let j = 0; j < n; j++) flip ? tri(c, R[j], R[(j + 1) % n]) : tri(c, R[(j + 1) % n], R[j]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); return g;
}

export function buildNeck(mats, { socket = true, collar = true } = {}) {
  const group = new THREE.Group(); group.name = 'neck';
  const clay = [], dark = [], chrome = [], exhaust = [];
  const sym = (fn) => { for (const s of [1, -1]) fn(s); };
  const P = (x, y, z) => new V3(x, y, z);
  const addAct = (a, b, r, o) => { const q = actuator(a, b, r, o); clay.push(...q.body); chrome.push(...q.rodG); };

  // ---- neck socket on the torso (temporary: replaced when the torso is built) ----
  const BASE = -1.5;
  if (socket) clay.push(obox(P(0, BASE - 0.22, -0.3), P(1, 0, 0), UP, 3.0, 0.44, 2.5));      // socket plate (temporary)
  dark.push(disc(P(0, BASE + 0.04, -0.45), UP, 0.78, 0.12, 48));                 // collar recess
  clay.push(disc(P(0, BASE + 0.12, -0.45), UP, 0.62, 0.2, 48));                  // spine foot ring
  if (socket) sym(s => {
    clay.push(obox(P(s * 2.05, -1.15, -1.15), P(1, 0, 0), UP, 0.7, 0.6, 2.2));  // shoulder mount block (temporary)
  });

  // ---- spine column (telescopic) + yaw turntable ----
  const spB = P(0, BASE + 0.2, -0.45), spT = P(0, 0.62, -0.85);
  const spD = new V3().subVectors(spT, spB);
  const sp = t => spB.clone().addScaledVector(spD, t);
  clay.push(obox(sp(0.22), P(1, 0, 0), spD, 0.52, spD.length() * 0.44, 0.56));
  clay.push(obox(sp(0.62), P(1, 0, 0), spD, 0.42, spD.length() * 0.42, 0.46));
  clay.push(obox(sp(0.45), P(1, 0, 0), spD, 0.6, 0.1, 0.64));                  // stage collar
  // ribbed front of the spine (flexible cable guard, the "trachea" in the drawing)
  for (let t = 0.06; t < 0.9; t += 0.055) { if (Math.abs(t - 0.45) < 0.04) continue;
    const big = t < 0.45; dark.push(obox(sp(t).add(P(0, 0, big ? 0.3 : 0.25)), P(1, 0, 0), spD, big ? 0.42 : 0.34, 0.045, 0.1)); }
  clay.push(disc(P(0, 0.72, -0.85), UP, 0.5, 0.16, 48));                       // turntable (yaw)
  dark.push(disc(P(0, 0.82, -0.85), UP, 0.4, 0.06, 48));
  clay.push(disc(P(0, 0.9, -0.85), UP, 0.46, 0.12, 48));

  // ---- neck mount housing on the head underside (closes the rear opening, takes the actuator pins) ----
  {
    const prof = [[-0.25, 1.25], [-1.45, 1.25], [-1.85, 1.62], [-1.85, 2.6], [-0.25, 2.6]].map(([z, y]) => new THREE.Vector2(z, y));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: 1.9, bevelEnabled: false });
    g.translate(0, 0, -0.95); g.rotateY(-Math.PI / 2); clay.push(g);
    dark.push(obox(P(0, 1.24, -0.85), P(1, 0, 0), UP, 1.5, 0.03, 0.9));        // underside service recess
    sym(s => { for (const y of [1.78, 1.92, 2.06]) dark.push(obox(P(s * 0.55, y, -1.86), P(1, 0, 0), UP, 0.5, 0.06, 0.03)); }); // rear vent slats
  }

  // ---- pitch yoke: crossbar + side discs + links up to the head bracket ----
  const PIV = { y: 1.0, z: -1.05, x: 1.28 };
  clay.push(obox(P(0, PIV.y, PIV.z), P(1, 0, 0), UP, PIV.x * 2, 0.26, 0.34));   // crossbar
  clay.push(obox(P(0, 0.93, -0.92), P(1, 0, 0), UP, 0.9, 0.12, 0.6));            // crossbar saddle on turntable
  sym(s => {
    const c = P(s * PIV.x, PIV.y, PIV.z);
    clay.push(disc(c, P(1, 0, 0), 0.27, 0.26));                                  // pitch disc housing
    clay.push(disc(c.clone().add(P(s * 0.15, 0, 0)), P(1, 0, 0), 0.2, 0.06));    // bearing face
    dark.push(disc(c.clone().add(P(s * 0.17, 0, 0)), P(1, 0, 0), 0.13, 0.06));
    clay.push(disc(c.clone().add(P(s * 0.2, 0, 0)), P(1, 0, 0), 0.07, 0.08));    // hub nut
    // link plate from the disc up into the head bracket
    const top = P(s * 1.36, 1.55, -0.55);
    clay.push(obox(c.clone().lerp(top, 0.5), P(1, 0, 0), new V3().subVectors(top, c), 0.12, c.distanceTo(top) + 0.3, 0.34));
  });

  // ---- pitch actuators ----
  sym(s => {
    // big front pair: torso -> under the head bracket (in front of the pitch axis)
    addAct(P(s * 1.18, 1.3, -0.42), P(s * 1.05, BASE + 0.05, -0.02), 0.22, { ext: 0.42 });
    // slim inner pair: torso front -> under the chin
    addAct(P(s * 0.36, 0.95, 0.22), P(s * 0.34, BASE + 0.05, 0.62), 0.13, { ext: 0.45 });
    // rear pair (back view): torso back -> head rear underside
    addAct(P(s * 0.45, 1.12, -1.5), P(s * 0.45, BASE + 0.05, -1.3), 0.2, { ext: 0.4 });
    // outer diagonals out to the shoulders
    addAct(P(s * 1.32, 0.78, -1.15), P(s * 2.12, -0.88, -1.85), 0.15, { ext: 0.45, rings: 2 });
    addAct(P(s * 1.22, 0.5, -0.82), P(s * 1.98, -0.9, -0.5), 0.13, { ext: 0.45, rings: 2 });
    { const c = P(s * 1.2, PIV.y, PIV.z), e = P(s * 1.2, 0.5, -0.82);           // hanger plate: pitch disc -> lower diagonal
      clay.push(obox(c.clone().lerp(e, 0.5), P(1, 0, 0), new V3().subVectors(e, c), 0.1, c.distanceTo(e) + 0.2, 0.26)); }
    // head-side lugs the actuators pin into
    clay.push(obox(P(s * 1.18, 1.38, -0.42), P(1, 0, 0), UP, 0.5, 0.22, 0.42));
    clay.push(obox(P(s * 0.36, 1.03, 0.22), P(1, 0, 0), UP, 0.3, 0.16, 0.3));
    clay.push(obox(P(s * 0.45, 1.2, -1.5), P(1, 0, 0), UP, 0.44, 0.12, 0.42));
  });

  // ---- gorget (围脖护甲): two overlapping U-shaped lames round the sides and back, open at the front.
  // Lower lame sits on the neck deck / trapezius frames and swallows the lower ends of the outer diagonals;
  // upper lame rides on it, set inward, so the pair can slide when the neck moves.
  if (collar) {
    const G = { a0: 0, a1: 2 * Math.PI, seg: 20, rx: 3.0, rz: 1.75, cz: -0.7 };
    clay.push(gorgetLame([[0.9, -0.2], [1.06, -0.2], [1.12, 0.35], [1.1, 0.75], [1.02, 0.92], [0.9, 0.92]], { ...G, y0: -1.0, lift: 0.4, drop: 0.3 }));
    // front: the thick lame and the deck front become one trapezoid gorget plate, narrowing down to the chest V seam
    // (kept inside |x| < 1.7 so the trapezius light panels stay clear)
    const T = [];
    for (const s of [1, -1]) T.push(P(s * 1.7, -0.36, -0.4), P(s * 1.7, -0.36, 1.12), P(s * 1.72, -0.9, 1.34), P(s * 2.0, -2.32, 1.75), P(s * 0.95, -2.75, 2.2), P(s * 2.0, -2.32, -0.4), P(s * 0.95, -2.75, -0.4), P(s * 1.35, -2.5, -0.4));
    clay.push(new ConvexGeometry(T));
    // front face details (centre facet plane: (y -0.9, z 1.34) -> (y -2.75, z 2.2))
    const fd = P(0, -1.85, 0.86).normalize(), fn = P(0, 0.86, 1.85).normalize();
    const on = (x, y, o = 0) => P(x, y, 1.34 + (y + 0.9) / -1.85 * 0.86).addScaledVector(fn, o);
    const strip = (x0, y0, x1, y1, w, o, list) => { const A = on(x0, y0, o), B = on(x1, y1, o), d = new V3().subVectors(B, A);
      list.push(obox(A.clone().lerp(B, 0.5), new V3().crossVectors(d, fn), d, w, d.length(), 0.04)); };
    // circulation exhaust (top): a hood rising out of the face, open at its upper end like a 6th-gen dorsal intake
    const H = (x, y, o, d = 0) => on(x, y, o).addScaledVector(fd, -d);
    // mouth: vertical, facing forward, low on the face; roof slopes back up into the top ridge
    const MB = -2.25, TOP = (x) => H(x, MB, 0.45, 0.98), F = P(0, 0, 1);
    clay.push(new ConvexGeometry([H(1.12, MB, 0), H(-1.12, MB, 0), TOP(0.86), TOP(-0.86), P(0.62, -0.55, 1.19), P(-0.62, -0.55, 1.19), H(0.88, -0.95, 0), H(-0.88, -0.95, 0)]));
    const mouth = [[1.02, 0.04], [-1.02, 0.04], [0.8, 0.9], [-0.8, 0.9]].map(([x, t]) => H(x, MB, 0).lerp(TOP(x), t));
    exhaust.push(new ConvexGeometry([...mouth.map(p => p.clone().addScaledVector(F, 0.006)), ...mouth.map(p => p.clone().addScaledVector(F, -0.4))]));  // EXHAUST throat -> mesh 'exhaustThroat' (not a light)
    clay.push(gorgetLame([[0.84, 0], [0.98, 0], [1.03, 0.3], [1.0, 0.55], [0.92, 0.66], [0.84, 0.66]], { ...G, a0: 0.64, a1: 2 * Math.PI - 0.64, y0: -0.28, lift: 0.6, drop: 0.35 }));   // thin lame stops at the front corners
  }

  // ---- hoses / cable bundles (dark filler between the actuators) ----
  const hose = (pts, r) => { const c = new THREE.CatmullRomCurve3(pts.map(p => P(...p))); dark.push(new THREE.TubeGeometry(c, 40, r, 10)); };
  // every hose end is buried in a solid part (mount housing / crossbar / socket plate / shoulder block)
  sym(s => {
    hose([[s * 0.62, 1.6, -0.55], [s * 0.62, 1.2, -0.5], [s * 0.72, 0.4, -0.25], [s * 0.66, -0.6, -0.15], [s * 0.7, -1.45, -0.1], [s * 0.7, -1.7, -0.1]], 0.07);
    hose([[s * 0.55, 1.55, -0.4], [s * 0.55, 1.1, -0.25], [s * 0.6, 0.2, 0.1], [s * 0.52, -0.8, 0.25], [s * 0.58, -1.45, 0.3], [s * 0.58, -1.7, 0.3]], 0.055);
    hose([[s * 0.85, 1.6, -0.8], [s * 0.85, 1.25, -0.8], [s * 0.95, 0.3, -0.6], [s * 0.9, -0.7, -0.75], [s * 0.95, -1.45, -0.8], [s * 0.95, -1.7, -0.8]], 0.08);
    hose([[s * 0.12, 1.6, -1.38], [s * 0.12, 1.2, -1.4], [s * 0.14, 0.3, -1.45], [s * 0.12, -0.7, -1.45], [s * 0.13, -1.45, -1.35], [s * 0.13, -1.7, -1.35]], 0.06);
    hose([[s * 1.1, 1.0, -1.1], [s * 1.05, 0.7, -1.3], [s * 1.35, 0, -1.55], [s * 1.7, -0.6, -1.6], [s * 1.95, -0.9, -1.4], [s * 1.95, -1.15, -1.4]], 0.06);
    hose([[s * 0.9, 1.5, -0.35], [s * 0.92, 1.1, -0.2], [s * 0.95, 0.4, -0.1], [s * 1.2, -0.3, -0.1], [s * 1.6, -0.8, -0.3], [s * 1.95, -1.05, -0.4]], 0.05);
  });

  const mk = (list, mat, name) => { const g = mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g).map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; })); const m = new THREE.Mesh(g, mat); m.name = name; group.add(m); };
  mk(clay, mats.clay, 'neckClay'); mk(chrome, mats.chrome || mats.clay, 'neckRods'); mk(dark, mats.dark, 'neckDark'); if (exhaust.length) mk(exhaust, mats.dark, 'exhaustThroat');
  return group;
}
