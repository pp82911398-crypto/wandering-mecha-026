// Torso (chest + shoulders + back + waist), outline pass.
// World frame = head frame: x right, y up (chin y = 0, head 4 units tall), z forward.
// Heights/widths from the front view, depth mostly from the top view (ref/torso.png);
// the side view of that sheet has a different head/torso ratio, so it is only used for shapes.
//   armour (chest shell, pauldrons, back plates): front prism ∩ side prism ∩ plan prism (three-bvh-csg)
//   machinery (neck deck, shoulder frames, hubs, back thrusters, waist): parametric parts, merged per material
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Brush, Evaluator, INTERSECTION, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { ROUND, roundBrushGeometry, transformRefs } from '../finallab/rounding.js';   // 分级小 R（仅成品间开启，默认不生效）
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rod, disc, obox, actuator } from '../necklab/neck.js';

const V2 = THREE.Vector2, V3 = THREE.Vector3, UP = new V3(0, 1, 0), X = new V3(1, 0, 0), Z = new V3(0, 0, 1);
const P = (x, y, z) => new V3(x, y, z);

// ---------- key dimensions (shared with the lab and the next parts) ----------
export const TORSO = {
  deckTop: -1.5,                          // neck socket deck (neck lower ends sit here)
  core: { y: -5.86, r: 2.05, face: 4.55 }, // chest turbine
  hub: { x: 5.0, y: -4.35, z: 0.6 },      // shoulder joint (arm socket)
  hipY: -12.1,                            // lower ends of the waist struts / core (hip interface, pelvis not built yet)
  paulDrop: 0.7,                          // all shoulder armour (shells, wing plates, seams, +x hinge) moved down by this, shape unchanged
};

// ---------- CSG helpers ----------
const ev = new Evaluator(); ev.attributes = ['position']; ev.useGroups = false;
function brush(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-5);
  const b = new Brush(g); b.updateMatrixWorld(); return b;
}
const AND = (a, b) => { const r = ev.evaluate(a, b, INTERSECTION); r.updateMatrixWorld(); return r; };
const SUB = (a, b) => { const r = ev.evaluate(a, b, SUBTRACTION); r.updateMatrixWorld(); return r; };
const ADD = (a, b) => { const r = ev.evaluate(a, b, ADDITION); r.updateMatrixWorld(); return r; };
const union = (list) => list.reduce((acc, b) => acc ? ADD(acc, b) : b, null);
function xform(b, fn) { const g = b.geometry.clone(); fn(g); const r = new Brush(g); r.updateMatrixWorld(); return r; }
const moved = (b, dx, dy, dz) => xform(b, g => g.translate(dx, dy, dz));
const scaledAt = (b, k, c) => xform(b, g => { g.translate(-c.x, -c.y, -c.z); g.scale(k.x, k.y, k.z); g.translate(c.x, c.y, c.z); });
// 凸外壳先倒圆再挖空/切缝（切口保持硬边）；ROUND.enabled 为假时原样返回
// 三视图棱柱相交体倒圆：凸体直接倒圆；凹轮廓（弯折板、缺口）= 凸包倒圆 ∩ 原形外扩 0.008（凹折硬边，避免共面布尔）
const RND_EPS = 0.008;
function roundBody(F, S, T, r, tag) {
  const body = AND(AND(frontPrism(F), sidePrism(S)), topPrism(T));
  if (!ROUND.enabled) return body;
  const res = roundBrushGeometry(body.geometry, r, tag); if (!res) return body;
  const rb = brush(res.geo);
  return res.convex ? rb : AND(rb, AND(AND(frontPrism(inset(F, -RND_EPS)), sidePrism(inset(S, -RND_EPS))), topPrism(inset(T, -RND_EPS))));
}
function finish(b) { let g = b.geometry.clone(); if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); return g; }

function prismGeo(pts, depth = 40) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new V2(a, b))), { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2); return g;
}
const frontPrism = (xy) => brush(prismGeo(xy));                                                   // (x, y), along z
const sidePrism = (zy) => { const g = prismGeo(zy); g.rotateY(-Math.PI / 2); return brush(g); }; // (z, y), along x
const topPrism = (xz) => { const g = prismGeo(xz.map(([x, z]) => [x, -z])); g.rotateX(-Math.PI / 2); return brush(g); }; // (x, z), along y
const boxB = (x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return brush(g); };
// mirror a right-half outline (x >= 0, listed from top centre clockwise) into a full outline
const mirrorX = (half) => { const out = [...half]; for (let i = half.length - 1; i >= 0; i--) if (Math.abs(half[i][0]) > 1e-6) out.push([-half[i][0], half[i][1]]); return out; };
const flipX = (poly) => poly.map(([x, y]) => [-x, y]);
// thin slab along a 2D segment in the front plane, limited to z0..z1 (panel seam cutter)
function seamFront(a, b, z0, z1, w = 0.07) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(L + w, w, z1 - z0); g.rotateZ(Math.atan2(dy, dx));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2); return brush(g);
}
function lathe(prof, seg = 64) { const g = new THREE.LatheGeometry(prof.map(([r, h]) => new V2(r, h)), seg); g.rotateX(Math.PI / 2); return g; } // axis = +z

// ---------- outlines ----------
// chest, front view (right half): V collar round the neck, wide upper chest, narrowing to the waist notch
const CHEST_F = mirrorX([[0, -2.75], [0.95, -2.75], [2.36, -2.3], [3.22, -2.3], [4.08, -3.47], [4.7, -5.2], [4.57, -7.3], [3.58, -8.15], [2.55, -9.14], [1.35, -9.35], [1.15, -8.45], [0, -8.45]]);
// chest, side profile (z, y): sloped upper chest, vertical core face, lower chest tucks back to the waist
const CHEST_S = [[-2.9, -1.6], [1.2, -1.85], [3.3, -3.0], [4.3, -4.2], [4.3, -7.4], [3.4, -8.7], [1.8, -9.6], [-1.2, -9.6], [-2.6, -8.4], [-2.9, -6.0]];
// chest, plan (x, z): chevron front, flat back
const CHEST_T = mirrorX([[0, 4.6], [1.7, 4.6], [3.4, 3.5], [4.7, 1.4], [4.8, -1.2], [4.3, -2.5], [2.5, -2.95], [0, -2.95]]);

// inward offset of a convex outline by d (each edge moved inward, neighbours re-intersected)
function inset(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
    const nx = -ey / L * sg, ny = ex / L * sg;                     // inward normal
    lines.push([[a[0] + nx * d, a[1] + ny * d], [ex, ey]]);
  }
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n], [p, r] = l0, [q, s] = l1, den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return q;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    return [p[0] + r[0] * t, p[1] + r[1] * t];
  });
}

// pauldron (right side, x > 0), faceted: high at the neck, top slopes down to the outside,
// outer face flares outward going down, flat bottom running in to the chest. Hollow shell, open underneath
// (the arm mechanism goes in there later; the shoulder hub already sits inside).
const PAUL_F = [[3.4, 0.95], [4.6, 0.72], [6.35, 0.05], [6.8, -0.7], [7.25, -2.4], [7.05, -3.9], [6.35, -4.6], [4.4, -4.6], [3.3, -1.9], [3.35, 0.3]];
const PAUL_S = [[4.1, -0.6], [3.0, 1.0], [0.6, 1.6], [-1.6, 1.2], [-2.5, -0.2], [-2.5, -3.5], [-1.4, -4.7], [2.6, -4.7], [4.1, -3.2]];
const PAUL_T = [[2.8, 4.1], [5.2, 3.3], [6.7, 2.0], [7.3, 0.4], [6.9, -1.1], [5.3, -2.3], [2.8, -2.6]];
const PAUL_WALL = 0.3;
// all shoulder shells + wing plates are scaled in y by PAUL_K about their bottom PAUL_Y0 at assembly
const PAUL_Y0 = -4.7, PAUL_K = 0.94, PAUL_Y = (y) => PAUL_Y0 + (y - PAUL_Y0) * PAUL_K;
// +x shoulder split (user sketch): module 1 = inner part up to x 5.15; module 2 = outer flap from x 5.3,
// starting under the sloped top and flaring further out (to x 7.6 at y -3.1) before tucking back in
const PAUL_M1_F = [[3.4, 0.95], [4.6, 0.72], [5.15, 0.51], [5.15, -4.6], [4.4, -4.6], [3.3, -1.9], [3.35, 0.3]];
const PAUL_M2_F = [[5.3, 0.25], [6.35, -0.18], [7.16, -1.02], [7.81, -3.08], [7.48, -3.93], [5.3, -4.57]];   // user mark-up: fuller outer face, chamfered outer-bottom corner, bottom down to module 1's; top kept 0.1 under the wing plate
const PAUL_M2_T = [[2.8, 4.1], [5.2, 3.3], [7.1, 2.0], [7.9, 0.4], [7.5, -1.1], [5.3, -2.3], [2.8, -2.6]];
// top wing plate: a 0.4-thick strip lying on the sloped top
const CAP_F = [[3.15, 0.8], [3.2, 1.38], [4.65, 1.12], [6.55, 0.42], [7.0, -0.05], [6.4, -0.1], [4.6, 0.62]];
const CAP_S = [[4.35, -0.6], [3.2, 1.25], [0.6, 1.85], [-1.8, 1.45], [-2.75, -0.3]];
const CAP_T = [[2.9, 4.4], [5.3, 3.55], [6.95, 2.1], [7.45, 0.4], [7.1, -1.25], [5.4, -2.55], [2.9, -2.8]];

// back hexagon plates (front-view coords of the left plate, mirrored for the right)
const BACKPLATE = [[2.4, -2.25], [3.7, -2.25], [4.6, -5.1], [4.6, -6.4], [2.9, -9.0], [2.4, -9.2]];

// opt.liveWaist: the waist becomes a joint (finallab). Core, side frames, abdominal plate, side/back lames go to their own
// meshes ('waistCore*', 'waistArmor') that stay on the pelvis; the 12 struts and 4 waist hoses are not built, only listed in
// TORSO.waistStruts / TORSO.waistHoses for the caller to make live. Default off: the torso lab is unchanged.
export function buildTorso(mats, opt = {}) {
  const LW = !!opt.liveWaist, wClay = [], wDark = [], wChrome = [];
  const group = new THREE.Group(); group.name = 'torso';
  const parts = [];
  const addCSG = (name, cn, b, mat = 'clay') => parts.push({ name, cn, geo: finish(b), mat });
  const lamp = [];
  const clay = [], dark = [], chrome = [];
  const sym = (fn) => { for (const s of [1, -1]) fn(s); };
  const addAct = (a, b, r, o) => { const q = actuator(a, b, r, o); clay.push(...q.body); chrome.push(...q.rodG); };
  const C = TORSO.core;

  // ================= chest shell =================
  let shell = roundBody(CHEST_F, CHEST_S, CHEST_T, 0.09, 'chest');
  // turbine pocket
  const pocketG = new THREE.CylinderGeometry(C.r, C.r, 4, 64); pocketG.rotateX(Math.PI / 2); pocketG.translate(0, C.y, 2.95 + 2);
  shell = SUB(shell, brush(pocketG));
  // front panel seams (front half only, so the back stays clean)
  const seamSegs = [
    [[4.03, -3.33], [2.05, -4.64]],   // upper plate / side plate
    [[4.62, -5.45], [2.27, -6.98]],   // side plate / lower plate
    [[1.1, -2.7], [1.1, -3.95]],      // centre collar plate
    [[2.15, -7.6], [2.55, -9.2]],     // lower plate split
  ];
  const seams = union(seamSegs.flatMap(([a, b]) => [seamFront(a, b, 0.5, 6), seamFront(flipX([a])[0], flipX([b])[0], 0.5, 6)]));
  // side seam: front shell / rear shell, a vertical cut in the side view
  const sideSeam = (() => { const g = new THREE.BoxGeometry(12, 9, 0.07); g.rotateX(-0.12); g.translate(0, -5.6, -0.6); return brush(g); })();
  const allSeams = ADD(seams, sideSeam);
  const cShell = new V3(0, -5.5, 0.8);
  addCSG('chestSeams', '胸甲接缝', AND(scaledAt(shell, new V3(0.985, 0.99, 0.985), cShell), allSeams), 'dark');
  shell = SUB(shell, allSeams);
  addCSG('chest', '胸甲', shell);

  // back hexagon plates (raised 0.12 off the rear face)
  const bp = ADD(frontPrism(BACKPLATE), frontPrism(flipX(BACKPLATE)));
  addCSG('backPlates', '背部六角甲板', AND(AND(moved(AND(frontPrism(CHEST_F), sidePrism(CHEST_S)), 0, 0, -0.12), bp), boxB(-6, 6, -12, 0, -4, -1.2)));

  // ================= chest turbine core =================
  const at = (g) => { g.translate(0, C.y, 0); return g; };
  clay.push(at(lathe([[C.r - 0.04, 3.0], [C.r - 0.04, 4.45], [C.r + 0.08, C.face], [C.r + 0.38, C.face], [C.r + 0.5, 4.35], [C.r + 0.5, 3.6], [C.r - 0.04, 3.0]])));  // raised surround ring
  dark.push(at(lathe([[0, 2.96], [C.r, 2.96], [C.r, 3.02], [0, 3.02]])));                   // pocket floor
  clay.push(at(lathe([[1.82, 3.0], [1.82, 3.9], [1.98, 3.9], [1.98, 3.0]])));               // blade shroud
  const NB = 44;
  for (let i = 0; i < NB; i++) {                                                           // fan blades (twisted)
    const a = i / NB * Math.PI * 2;
    const g = new THREE.BoxGeometry(1.05, 0.05, 0.42); g.rotateX(0.55); g.translate(1.32, 0, 3.5); g.rotateZ(a); g.translate(0, C.y, 0); clay.push(g);
  }
  chrome.push(at(lathe([[0, 4.18], [0.2, 4.18], [0.26, 4.1], [0.46, 4.1], [0.5, 3.95], [0.8, 3.9], [0.82, 3.1], [0, 3.1]])));  // hub
  dark.push(at(lathe([[0.3, 4.12], [0.42, 4.12], [0.42, 4.14], [0.3, 4.14]])));

  // ================= neck socket deck (replaces the neck's temporary plate) =================
  const D = TORSO.deckTop;
  clay.push(obox(P(0, D - 0.75, -0.3), X, UP, 3.1, 1.5, 2.65));                 // deck block, y -3.0 .. -1.5
  dark.push(obox(P(0, D - 0.62, 1.03), X, UP, 2.4, 0.18, 0.04));                 // front service slot
  dark.push(obox(P(0, D - 1.0, 1.03), X, UP, 2.4, 0.18, 0.04));
  sym(s => clay.push(obox(P(s * 1.32, D - 0.2, 0.6), X, UP, 0.5, 0.4, 0.8)));    // corner bosses

  // ================= shoulders =================
  sym(s => {
    const mx = (p) => p.map(([a, b]) => [s * a, b]);
    // trapezius frame: deck -> pauldron, carries the neck's outer diagonals
    clay.push(obox(P(s * 2.45, -1.6, -1.05), X, UP, 1.9, 1.3, 2.5));             // y -2.25 .. -0.95
    // matrix-light housing: wedge in side view, top against the trapezius frame, leaning forward toward the bottom
    { const xs = [s * 1.75, s * 3.15], pts = [];
      for (const x of xs) pts.push(P(x, -1.15, 0.1), P(x, -1.15, 0.3), P(x, -2.3, 1.1), P(x, -2.3, 0.1));
      clay.push(new ConvexGeometry(pts));
      const dir = P(0, -1.15, 0.8), L = dir.length(), nrm = P(0, 0.8, 1.15).normalize();
      // MATRIX LIGHT (not an exhaust!): dark backing + raised bezel + 5x5 square emitter cells -> mesh 'matrixLight'
      const c0 = P(s * 2.45, -1.725, 0.7), ud = dir.clone().normalize(), at = (u, v, o) => c0.clone().addScaledVector(X, u).addScaledVector(ud, v).addScaledVector(nrm, o);
      const W = 1.25, Hh = L * 0.86;
      dark.push(obox(at(0, 0, 0.012), X, dir, W, Hh, 0.03));                                         // backing
      for (const [u, v, w, h] of [[0, -Hh / 2, W + 0.1, 0.07], [0, Hh / 2, W + 0.1, 0.07], [-W / 2, 0, 0.07, Hh], [W / 2, 0, 0.07, Hh]])
        clay.push(obox(at(u, v, 0.04), X, dir, w, h, 0.07));                                         // bezel
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) lamp.push(obox(at(i * 0.22, j * (Hh - 0.12) / 5, 0.035), X, dir, 0.16, (Hh - 0.12) / 5 * 0.72, 0.03)); }
    clay.push(obox(P(s * 2.12, -0.98, -1.85), X, UP, 0.38, 0.3, 0.4));           // clevis lug: outer diagonal 1 (neck)
    clay.push(obox(P(s * 1.98, -0.98, -0.5), X, UP, 0.36, 0.3, 0.36));           // clevis lug: outer diagonal 2 (neck)
    // pauldron body + top wing plate
    const outer = AND(AND(frontPrism(mx(PAUL_F)), sidePrism(PAUL_S)), topPrism(mx(PAUL_T)));
    const inner = AND(AND(frontPrism(mx(inset(PAUL_F, PAUL_WALL))), sidePrism(inset(PAUL_S, PAUL_WALL))), topPrism(mx(inset(PAUL_T, PAUL_WALL))));
    // pushed down through the bottom: open underneath; the lower part of the inner sloped wall is cut away too,
    // otherwise it reads as a bar right over the shoulder hub
    const cavity = ADD(ADD(inner, moved(inner, 0, -0.6, 0)), s > 0 ? boxB(3.2, 4.7, -4.8, -2.4, -2.0, 2.6) : boxB(-4.7, -3.2, -4.8, -2.4, -2.0, 2.6));  // z kept inside the end walls (they close the front/back triangle)
    if (s > 0) {
      // +x shoulder: split into two separate shells with a gap, so the arm can swing the outer one
      //   module 1 (inner, carries the top wing plate) | module 2 (outer flap, wider flare, hung on the arm socket)
      const slope = seamFront([s * 3.4, 0.3], [s * 6.9, -1.0], 1.2, 6);
      const m1 = SUB(roundBody(PAUL_M1_F, PAUL_S, PAUL_T, 0.09, 'pauldron1a'), cavity);   // old cavity: open below and at the split
      addCSG('paulSeam1', '肩甲接缝', SUB(AND(scaledAt(outer, new V3(0.985, 0.985, 0.985), P(5.2, -1.8, 0.8)), AND(slope, frontPrism(PAUL_M1_F))), cavity), 'dark');
      addCSG('pauldron1a', '右肩甲·内块', SUB(m1, slope));
      const o2 = roundBody(PAUL_M2_F, PAUL_S, PAUL_M2_T, 0.09, 'pauldron1b');
      const i2 = AND(AND(frontPrism(inset(PAUL_M2_F, PAUL_WALL)), sidePrism(inset(PAUL_S, PAUL_WALL))), topPrism(inset(PAUL_M2_T, PAUL_WALL)));
      // open below and towards module 1, including the inner-bottom corner (it left a strip running under the hub)
      const c2 = ADD(ADD(ADD(i2, moved(i2, 0, -0.6, 0)), moved(i2, -0.6, 0, 0)), moved(i2, -0.6, -0.6, 0));
      addCSG('paulSeam1b', '肩甲接缝', SUB(AND(scaledAt(o2, new V3(0.985, 0.985, 0.985), P(6.4, -1.8, 0.8)), slope), c2), 'dark');
      addCSG('pauldron1b', '右肩甲·外块', SUB(SUB(o2, c2), slope));
      // top hinge along the split (axis z): alternating knuckles bite into module 1's roof and module 2's roof,
      // so the outer block is carried without anything inside the shells (kept empty for the arm)
      const hx = 5.22, hy = PAUL_Y(0.1) - TORSO.paulDrop;
      chrome.push(rod(P(hx, hy, -1.3), P(hx, hy, 3.1), 0.06, 12));                                    // hinge pin
      [[-1.2, -0.4], [-0.3, 0.5], [0.6, 1.4], [1.5, 2.3], [2.4, 3.0]].forEach(([z0, z1], i) => {
        clay.push(rod(P(hx, hy, z0), P(hx, hy, z1), 0.14, 16));                                       // knuckle
        clay.push(obox(P(i % 2 ? hx + 0.1 : hx - 0.1, hy + (i % 2 ? -0.02 : 0.12 + 0.1), (z0 + z1) / 2), X, UP, 0.2, 0.2, z1 - z0)); // leaf into module 2 / module 1 roof
      });
    } else {
      // -x side carries TWO arms: a front pauldron (the old shell cut off at z -0.95, with an end wall)
      // and a smaller rear pauldron behind the body, beside the back thrusters (user sketch, top + side view)
      // two arms on this side -> bigger: the front shell is stretched outward beyond x 4.4 (outer x 7.25 -> ~9.0); the inner sloped edge stays put so it still meets the chest
      const wide = (p) => mx(p.map(([a, b]) => [a <= 4.4 ? a : 4.4 + (a - 4.4) * 1.61, b]));
      // own side profile (user sketch): chamfered top-back corner, vertical back edge at z -1.09, chamfered
      // bottom-back corner, bottom edge running forward and dropping at the front along the chest seam
      const LS = [[4.1, -0.6], [3.0, 1.0], [0.6, 1.6], [-0.63, 1.45], [-1.09, 0.74], [-1.09, -4.08], [-0.66, -4.58], [1.23, -4.4], [2.0, -4.76], [2.6, -4.74], [4.1, -3.2]];
      const oW = roundBody(wide(PAUL_F), LS, wide(PAUL_T), 0.09, 'pauldron-1');
      const iW = AND(AND(frontPrism(wide(inset(PAUL_F, PAUL_WALL))), sidePrism(inset(LS, PAUL_WALL))), topPrism(wide(inset(PAUL_T, PAUL_WALL))));
      const cavW = ADD(ADD(iW, moved(iW, 0, -0.6, 0)), boxB(-4.7, -3.2, -4.8, -2.4, -0.65, 2.85));   // left hub sits at z 1.6, so the cut reaches a bit further forward
      const front = oW, cavF = cavW;
      const pSeam = seamFront([s * 3.4, 0.3], [s * 6.9, -1.0], 1.2, 6);
      const wSeam = seamFront([s * 3.4, 0.3], [s * 9.2, -1.0], 1.2, 6);
      addCSG('paulSeam' + s, '肩甲接缝', SUB(AND(AND(scaledAt(oW, new V3(0.99, 0.985, 0.985), P(s * 6.3, -1.8, 0.8)), boxB(-11, 0, -7, 4, -0.75, 7)), wSeam), cavF), 'dark');
      addCSG('pauldron' + s, '左前肩甲', SUB(SUB(front, cavF), wSeam));
      // rear pauldron: x 3.0..7.3, z -1.3..-5.6, y 1.25..-3.3, hollow, open underneath
      const RF = mx([[3.0, 1.25], [5.8, 0.5], [7.3, -0.6], [7.3, -2.5], [6.6, -3.3], [3.0, -3.3]]);
      const RS = [[-1.3, 1.25], [-1.3, -3.3], [-4.7, -3.3], [-5.6, -2.1], [-5.6, 0.3], [-4.7, 1.25]];
      const RT = mx([[3.0, -1.3], [6.8, -1.3], [7.3, -2.2], [7.3, -4.8], [6.5, -5.6], [3.0, -5.6]]);
      const ro = roundBody(RF, RS, RT, 0.08, 'pauldronRear');
      const ri = AND(AND(frontPrism(inset(RF, PAUL_WALL)), sidePrism(inset(RS, PAUL_WALL))), topPrism(inset(RT, PAUL_WALL)));
      addCSG('pauldronRear', '左后肩甲', SUB(ro, ADD(ri, moved(ri, 0, -0.6, 0))));
      // rear arm socket: mount block on the chest back (buried at z > -2.95), hub inside the rear shell
      clay.push(obox(P(s * 2.6, -2.2, -3.55), X, UP, 1.2, 1.6, 1.4));             // x 2.0..3.2, y -3.0..-1.4, z -4.25..-2.85
      const RH = { x: 3.6, y: -2.2, z: -3.4 }, rc = (dx) => P(s * (RH.x + dx), RH.y, RH.z);
      clay.push(disc(rc(-0.2), X, 0.78, 1.0, 40));      // housing x 2.9..3.9 (root in the mount block)
      clay.push(disc(rc(0.38), X, 0.64, 0.18, 40));
      dark.push(disc(rc(0.5), X, 0.48, 0.06, 32));
      clay.push(disc(rc(0.6), X, 0.4, 0.22, 32));       // socket cap
      chrome.push(disc(rc(0.74), X, 0.15, 0.08, 20));
      TORSO.hubRear = { x: s * RH.x, y: RH.y, z: RH.z };
    }
    // shell interior left empty for the arm mechanism; the shell is carried by the trapezius frame (overlap at x 3.3..3.4)
    const cap = s > 0 ? roundBody(mx(CAP_F), CAP_S, mx(CAP_T), 0.06, 'paulCap1') : null;
    const capW = s > 0 ? null : roundBody(mx(CAP_F.map(([a, b]) => [a <= 4.4 ? a : 4.4 + (a - 4.4) * 1.61, b])), CAP_S, mx(CAP_T.map(([a, b]) => [a <= 4.4 ? a : 4.4 + (a - 4.4) * 1.61, b])), 0.06, 'paulCap-1');
    addCSG('paulCap' + s, '肩顶翼板', s > 0 ? cap : AND(capW, boxB(-11, 0, -7, 4, -0.63, 7)));
    // shoulder joint hub (arm socket, capped: no arm yet); on -x it moves forward to the middle of the front pauldron
    const H = TORSO.hub, hz = s > 0 ? H.z : 1.6, hc = (dx) => P(s * (H.x + dx), H.y, hz), ax = X;
    clay.push(disc(hc(-0.3), ax, 1.18, 1.4, 48));        // housing, x 4.0 .. 5.4 (root buried in the chest side)
    clay.push(disc(hc(0.52), ax, 0.98, 0.25, 48));       // bearing ring
    dark.push(disc(hc(0.68), ax, 0.74, 0.08, 40));
    clay.push(disc(hc(0.8), ax, 0.6, 0.3, 40));          // socket cap
    chrome.push(disc(hc(0.98), ax, 0.22, 0.1, 24));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; chrome.push(disc(P(s * (H.x + 0.42), H.y + Math.sin(a) * 1.05, hz + Math.cos(a) * 1.05), ax, 0.06, 0.08, 10)); }
  });

  // ================= back thrusters (behind the head) + spine =================
  // Two vertical main thrusters (jump / landing braking / balance). Side view: trapezoid - flat front against the back
  // armour, rear face leaning out going down (depth 0.8 at the top -> 2.0 low). Front view: 1.2 wide at the top -> 1.6 low.
  // Five sections top to bottom: 2 intake grille bands | compressor (side fins) | combustion (widest, armour plate) |
  // nozzle section ending in a flat 2D vectoring nozzle (two flaps, 2 vectoring actuators on the rear flap).
  const TH = { top: 2.7, bot: -7.6 };
  TORSO.thrusters = TH;
  const SP = [[-2.7, 2.7], [-3.2, 2.7], [-3.5, 2.3], [-4.7, -6.0], [-4.4, -7.6], [-2.7, -7.6]];
  const zb = (y) => y > 2.3 ? -3.5 + (y - 2.3) / 0.4 * 0.3 : y > -6.0 ? -3.5 - (2.3 - y) * (1.2 / 8.3) : -4.7 + (-6.0 - y) / 1.6 * 0.3;
  const hw = (y) => 0.6 + (2.7 - y) * (0.2 / 10.3);
  const aUp = new V3(0, 1, 0.1446).normalize();                                  // along the leaning rear face
  sym(s => {
    const cx = s * 1.2;
    const body = AND(frontPrism([[cx - 0.6, TH.top], [cx + 0.6, TH.top], [cx + 0.8, TH.bot], [cx - 0.8, TH.bot]]), sidePrism(SP));
    const inner = scaledAt(body, new V3(0.9, 1, 0.9), P(cx, 0, -3.7));
    const seams = union([0.95, -0.6, -2.2, -5.7].map(y => boxB(cx - 1.2, cx + 1.2, y - 0.04, y + 0.04, -6, -2.95)));
    addCSG('thrusterSeam' + s, '推进器分段缝', AND(scaledAt(body, new V3(0.95, 1, 0.95), P(cx, 0, -3.7)), seams), 'dark');
    addCSG('thruster' + s, '背部推进器', SUB(body, AND(seams, SUB(body, inner))));
    // sections 1-2: intake grilles on the rear face
    for (const [y0, y1] of [[1.05, 2.15], [-0.45, 0.85]]) {
      const yc = (y0 + y1) / 2, w = 2 * hw(yc) - 0.36;
      dark.push(obox(P(cx, yc, zb(yc)), X, aUp, w, y1 - y0, 0.06));
      for (let y = y0 + 0.1; y < y1 - 0.05; y += 0.2) clay.push(obox(P(cx, y, zb(y) - 0.03), X, aUp, w - 0.06, 0.06, 0.08));
    }
    // section 3: compressor, cooling fins on the outer side
    for (let i = 0; i < 5; i++) { const y = -0.85 - i * 0.27; clay.push(obox(P(cx + s * (hw(y) + 0.1), y, -3.35), X, UP, 0.22, 0.07, 1.0)); }
    // section 4: combustion, bolted armour plate on the rear face
    clay.push(obox(P(cx, -3.95, zb(-3.95) - 0.04), X, aUp, 2 * hw(-3.95) - 0.3, 2.6, 0.1));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const y = -3.95 + dy * 1.12; chrome.push(disc(P(cx + dx * (hw(y) - 0.3), y, zb(y) - 0.1), aUp.clone().set(0, -0.1446, 1).normalize(), 0.06, 0.06, 10)); }
    // section 5 + 2D vectoring nozzle (exhaust straight down, flaps open outward)
    clay.push(obox(P(cx, -7.85, -3.55), X, UP, 1.5, 0.6, 1.6));                     // transition duct, y -8.15 .. -7.55
    clay.push(obox(P(cx, -8.25, -3.55), X, UP, 1.75, 0.22, 1.85));                  // reinforcing ring
    dark.push(obox(P(cx, -8.6, -3.55), X, UP, 1.25, 0.5, 1.25));                     // throat
    for (const sx of [-1, 1]) clay.push(obox(P(cx + sx * 0.7, -8.75, -3.55), X, UP, 0.1, 0.8, 1.7));   // side walls
    clay.push(obox(P(cx, -8.75, -4.27), X, new V3(0, 1, 0.2), 1.35, 0.85, 0.08));   // rear flap
    clay.push(obox(P(cx, -8.75, -2.83), X, new V3(0, 1, -0.2), 1.35, 0.85, 0.08));  // front flap
    for (const dx of [-0.42, 0.42]) {                                                // vectoring actuators: body -> rear flap
      clay.push(obox(P(cx + dx, -6.9, -4.5), X, UP, 0.26, 0.3, 0.3));
      clay.push(obox(P(cx + dx, -9.0, -4.38), X, UP, 0.24, 0.24, 0.2));
      addAct(P(cx + dx, -6.9, -4.66), P(cx + dx, -9.0, -4.52), 0.09, { ext: 0.45 });
    }
  });
  // central channel between the thrusters
  clay.push(obox(P(0, -3.6, -3.25), X, UP, 1.0, 10.8, 0.9));                     // y -9.0 .. 1.8
  dark.push(obox(P(0, -2.5, -3.72), X, UP, 0.36, 8.0, 0.04));
  for (let i = 0; i < 6; i++) clay.push(obox(P(0, 1.2 - i * 0.95, -3.75), X, UP, 0.8, 0.32, 0.18)); // vertebra blocks
  chrome.push(rod(P(0, -8.6, -3.85), P(0, 1.6, -3.85), 0.07, 12));

  // ================= waist =================
  const HY = TORSO.hipY;
  const WC = LW ? wClay : clay, WD = LW ? wDark : dark;
  WC.push(obox(P(0, -10.15, 0.1), X, UP, 1.7, 3.9, 3.0));                      // waist core, y -12.1 .. -8.2
  for (const y of [-9.6, -10.3, -11.0, -11.7]) WD.push(obox(P(0, y, 1.61), X, UP, 1.5, 0.06, 0.04));
  {
    const hex = [[-0.9, -8.6], [0.9, -8.6], [1.35, -9.2], [1.35, -10.7], [0.8, -11.3], [-0.8, -11.3], [-1.35, -10.7], [-1.35, -9.2]];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(hex.map(([a, b]) => new V2(a, b))), { depth: 0.45, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
    g.translate(0, 0, 1.55); WC.push(g);                                         // abdominal plate
    WD.push(obox(P(0, -9.95, 2.06), X, UP, 1.6, 0.06, 0.03));
  }
  // 6 struts on the front face and 6 on the back, wide at the chest and drawn in towards the hip:
  //   outer strut (from the chest's outer underside, leaning in) + a pair splitting from each abdominal-plate corner
  //   (one out to meet the outer strut, one in along the plate edge). Lower eyes = hip pins (TORSO.hipPins), no pelvis yet.
  const pins = []; TORSO.waistStruts = []; TORSO.waistHoses = [];
  sym(s => {
    WC.push(obox(P(s * 1.6, -10.15, 0), X, UP, 1.2, 2.3, 1.9));                   // side frames, y -11.3 .. -9.0
    WD.push(obox(P(s * 2.21, -10.2, 0), X, UP, 0.04, 1.6, 1.4));
    for (const f of [1, -1]) {                                                    // f = front / back face
      const zo = f * 1.6, zi = f * 1.3;
      clay.push(obox(P(s * 2.9, -8.85, zo), X, UP, 0.5, 0.5, 0.5));             // lug under the chest (outer)
      clay.push(obox(P(s * 1.45, -9.2, zi), X, UP, 0.6, 0.4, 0.45));            // lug under the chest (plate corner)
      const struts = [
        [P(s * 2.9, -9.0, zo), P(s * 2.45, HY, zo), 0.24],                      // outer, leaning in
        [P(s * 1.45, -9.4, zi), P(s * 1.9, HY, zi), 0.17],                      // corner -> out
        [P(s * 1.45, -9.4, zi), P(s * 0.95, HY, zi), 0.17],                     // corner -> in
      ];
      for (const [a, b, r] of struts) { if (LW) TORSO.waistStruts.push({ a, b, r, ext: 0.4 }); else addAct(a, b, r, { ext: 0.4 }); pins.push(b); }
    }
  });
  TORSO.hipPins = pins;
  // hoses: chest underside -> side frames, both ends buried
  const hose = (pts, r) => LW ? TORSO.waistHoses.push({ pts: pts.map(p => P(...p)), r }) : dark.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => P(...p))), 40, r, 10));
  sym(s => {
    hose([[s * 2.1, -8.9, 0.6], [s * 2.55, -9.6, 0.65], [s * 2.5, -10.4, 0.5], [s * 2.0, -10.9, 0.4]], 0.09);
    hose([[s * 2.0, -8.9, -0.6], [s * 2.5, -9.7, -0.6], [s * 2.45, -10.5, -0.45], [s * 2.0, -10.95, -0.35]], 0.08);
  });

  // ================= waist armour: thin sheet lames (own mesh 'waistArmor') =================
  // sides: three lames stepping in towards the hip, lying outside the outer struts (plane follows their lean);
  // hung from the outer chest lugs, with a strap at z 0 (between the two hoses) back to the side frame.
  // back: four spine lames on the core's back face, each tucked under the one above. Front struts stay exposed.
  const waist = [], waistBolts = [];
  sym(s => {
    const xin = y => 3.28 + (y + 9.15) * (0.36 / 2.65), T = 0.1;          // inner face of the lame plane at height y
    const lames = [[-9.12, -10.25, 1.95, 0.25, 0.14], [-10.05, -11.05, 1.85, 0.3, 0.07], [-10.85, -11.8, 1.7, 0.4, 0]];
    for (const [yt, yb, zw, c, off] of lames) {
      const zy = [[-zw, yt], [zw, yt], [zw, yb + c], [zw - c, yb], [-zw + c, yb], [-zw, yb + c]], pts = [];
      for (const [z, y] of zy) pts.push(P(s * (xin(y) + off), y, z), P(s * (xin(y) + off + T), y, z));
      pts.push(P(s * (xin(yt) + off + T + 0.05), yt, 0), P(s * (xin(yb) + off + T + 0.05), yb, 0));     // vertical fold down the middle
      waist.push(new ConvexGeometry(pts));
      for (const z of [-zw + 0.3, zw - 0.3]) waistBolts.push(disc(P(s * (xin(yb + 0.3) + off + T + 0.01), yb + 0.3, z), X, 0.055, 0.05, 8));   // on the exposed lower part
    }
    for (const f of [1, -1]) (LW ? clay : waist).push(obox(P(s * 3.25, -9.05, f * 1.6), X, UP, 0.5, 0.4, 0.35));     // hangers: chest lug -> top lame (ride with the chest when live)
    waist.push(obox(P(s * 2.65, -10.3, 0), X, UP, 1.1, 1.2, 0.24));                                 // strap: side frame -> middle lame
  });
  for (const [i, [yt, yb, wt]] of [[-8.95, -9.8, 0.62], [-9.65, -10.5, 0.58], [-10.35, -11.2, 0.52], [-11.05, -11.9, 0.45]].entries()) {
    const wb = wt - 0.08, c = 0.12, T = 0.09, zt = -1.38, zb = -1.55;      // top edge tucked into the core / under the lame above
    const xy = [[-wt, yt], [wt, yt], [wb, yb + c], [wb - c, yb], [-wb + c, yb], [-wb, yb + c]], zAt = y => zt + (zb - zt) * (yt - y) / (yt - yb), pts = [];
    for (const [x, y] of xy) pts.push(P(x, y, zAt(y)), P(x, y, zAt(y) - T));
    pts.push(P(0, yt, zt - T - 0.05), P(0, yb, zb - T - 0.05));            // centre ridge
    waist.push(new ConvexGeometry(pts));
    if (i === 3) for (const x of [-0.25, 0.25]) waistBolts.push(disc(P(x, yt - 0.25, zAt(yt - 0.25) - T - 0.01), Z, 0.05, 0.05, 8));
  }
  (LW ? wChrome : chrome).push(...waistBolts);

  // ================= assemble =================
  // shoulder armour height: squashed towards its bottom edge (user: top lower by ~0.36, bottom and shape unchanged)
  for (const p of parts) if (/^(pauldron|paulCap|paulSeam)/.test(p.name)) { p.geo.translate(0, -PAUL_Y0, 0); p.geo.scale(1, PAUL_K, 1); p.geo.translate(0, PAUL_Y0 - TORSO.paulDrop, 0); p.geo.computeVertexNormals(); }
  transformRefs(/^(pauldron|paulCap)/, PAUL_Y0, PAUL_K, -TORSO.paulDrop);   // 圆角参考面跟着同样压缩、下移
  // split each shoulder shell with a vertical cut (x plane, gap 0.15): the inner part stays on the torso, the outer part
  // is handed to the arm (it turns with the shoulder drum about the x axis, so the two never collide when the arm raises)
  const SPLIT = { pauldronRear: -4.2 };   // front shells stay on the torso (they open with panels: armlab)
  for (const [name, cx] of Object.entries(SPLIT)) {
    const i = parts.findIndex(p => p.name === name); if (i < 0) continue;
    const p = parts[i], b = brush(p.geo), sg = Math.sign(cx), g = 0.15;
    const inB = sg > 0 ? boxB(-12, cx, -20, 10, -12, 12) : boxB(cx, 12, -20, 10, -12, 12);
    const outB = sg > 0 ? boxB(cx + g, 12, -20, 10, -12, 12) : boxB(-12, cx - g, -20, 10, -12, 12);
    if (name === 'pauldronRear') { parts.splice(i, 1, { ...p, geo: finish(AND(b, inB)) }); continue; }   // rear: outer part replaced by the arm's own compact shell (armlab)
    parts.splice(i, 1, { ...p, geo: finish(AND(b, inB)) }, { ...p, name: name + 'b', cn: p.cn + '·外', geo: finish(AND(b, outB)) });
  }
  // front shells (left front + right outer block) stay on the torso; the lower front (visor, hinged along x at its
  // top-front edge) and the lower outer side (flap, hinged along z at its top-outer edge) open when the arm is raised
  TORSO.panels = {};
  for (const [key, names, PV] of [
    ['leftFront', ['pauldron-1', 'paulSeam-1'], { s: -1, y: -2.2, zv: 1.8, xv: 5.3, xf: 6.9, g: 0.1 }],
    ['right', ['pauldron1b', 'paulSeam1b'], { s: 1, y: -2.2, zv: 0.8, xv: 5.3, xf: 6.9, g: 0.1 }],
  ]) {
    const xb = (a, b) => PV.s > 0 ? [a, b] : [-b, -a];       // x range [a, b] measured outward
    const bx = (x0, x1, y0, y1, z0, z1) => { const [a, b] = xb(x0, x1); return boxB(a, b, y0, y1, z0, z1); };
    for (const name of names) {
      const i = parts.findIndex(p => p.name === name); if (i < 0) continue;
      const p = parts[i], b = brush(p.geo), G = PV.g;
      // sliding plates (armlab slides them up under the upper shell): visor = lower front wall between the inner edge
      // and the flap; flap = whole lower outer wall incl. the front corner. The shell is hollow, so a box selects walls only.
      const visor = bx(PV.xv, PV.xf - G, -20, PV.y, PV.zv, 12);
      const flap = bx(PV.xf, 12, -20, PV.y, -12, 12);
      const keep = SUB(SUB(b, bx(PV.xv - G, PV.xf, -20, PV.y + G, PV.zv - G, 12)), bx(PV.xf - G, 12, -20, PV.y + G, -12, 12));
      parts.splice(i, 1, { ...p, geo: finish(keep) }, { ...p, name: name + 'v', cn: p.cn + '·前面板', geo: finish(AND(b, visor)) }, { ...p, name: name + 'f', cn: p.cn + '·外翻板', geo: finish(AND(b, flap)) });
    }
    TORSO.panels[key] = { visor: { names: names.map(n => n + 'v'), y: PV.y }, flap: { names: names.map(n => n + 'f'), x: PV.s * PV.xf, y: PV.y } };
  }
  TORSO.missiles = { doors: [], bays: {} };   // missile ports now live on the arms' sliding shoulder plates (armlab)
  // t = 0 closed .. 1 open: doors lift 0.16 off the face, then slide apart by their own width + rim
  TORSO.setMissiles = (t) => {
    const a = Math.min(1, t / 0.25), b = Math.max(0, (t - 0.25) / 0.75);
    for (const d of TORSO.missiles.doors) d.g.position.copy(d.home).addScaledVector(d.n, 0.16 * a).addScaledVector(d.u, (d.w + 0.2) * b);
  };
  TORSO.shells = {};
  for (const p of parts) { const m = new THREE.Mesh(p.geo, mats[p.mat]); m.name = p.name; m.userData.cn = p.cn; group.add(m); }
  const mk = (list, mat, name) => {
    const g = mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g).map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; }));
    const m = new THREE.Mesh(g, mat); m.name = name; group.add(m);
  };
  mk(lamp, mats.light || mats.eye, 'matrixLight');   // emissive later; NOT exhaust
  mk(waist, mats.clay, 'waistArmor');
  if (LW) { mk(wClay, mats.clay, 'waistCore'); mk(wDark, mats.dark, 'waistCoreDark'); mk(wChrome, mats.chrome || mats.clay, 'waistCoreRods'); }
  mk(clay, mats.clay, 'torsoClay'); mk(chrome, mats.chrome || mats.clay, 'torsoRods'); mk(dark, mats.dark, 'torsoDark');
  return group;
}
