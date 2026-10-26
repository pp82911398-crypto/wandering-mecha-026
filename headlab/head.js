// Head built by "two-view intersection": every armor block is
//   hull ∩ prism(front-view region) ∩ prism(side-view region)
// Regions are traced in source-pixel coordinates of ref/views.png, so the model can be checked against the drawing.
import * as THREE from 'three';
import { Brush, Evaluator, INTERSECTION, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V2 = THREE.Vector2, V3 = THREE.Vector3;

// pixel -> world mapping per view (helmet = 4 units tall, chin at y = 0)
export const VIEWS = {
  front: { cx: 231, cy: 420, s: 4 / 365, crop: [50, 40, 416, 436] },
  side: { cx: 672, cy: 467, s: 4 / 407, crop: [452, 40, 900, 486] },
};
const F = VIEWS.front, S = VIEWS.side;
const mirrorFull = (half) => { const out = [...half]; for (let i = half.length - 2; i >= 1; i--) out.push([2 * F.cx - half[i][0], half[i][1]]); return out; };
const mirrorPoly = (p) => p.map(([x, y]) => [2 * F.cx - x, y]).reverse();

// Chaikin smoothing of a closed polygon, keeping flagged hard corners
function smooth(poly, hard, iters = 3) {
  let pts = poly.map((p, i) => ({ p, h: hard.includes(i) }));
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let it = 0; it < iters; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a.h) out.push(a);
      out.push({ p: lerp(a.p, b.p, 0.25), h: false }, { p: lerp(a.p, b.p, 0.75), h: false });
    }
    pts = out;
  }
  return pts.map(o => o.p);
}

// ---------------- traced regions (source px) ----------------
export const TRACE = {
  // front silhouette, left half from apex to chin centre
  frontHalf: [[231, 55], [95, 141], [98, 185], [104, 260], [118, 305], [170, 350], [183, 397], [212, 419], [231, 420]],
  podL: [[81, 193], [66, 205], [67, 226], [85, 317], [99, 331], [108, 324], [104, 200]],
  centre: [[213, 30], [251, 30], [251, 450], [213, 450]],
  centreGap: [[208, 30], [256, 30], [256, 450], [208, 450]],
  // front-view partition: cap above the V brow line, visor groove between the two V lines
  aboveV: [[231, 0], [0, 0], [0, 141], [95, 141], [137, 222], [212, 244], [231, 246]],
  vband: [[231, 246], [212, 244], [137, 222], [95, 141], [0, 141], [0, 190], [100, 186], [140, 237], [212, 263], [231, 265]],
  crestTop: [[213, 40], [251, 40], [251, 112], [213, 112]],
  crestLine: [[225, 112], [239, 112], [239, 200], [225, 200]],
  crestGap: [[211.5, 30], [252.5, 30], [252.5, 113.5], [211.5, 113.5]],
  nose: [[214, 198], [248, 198], [248, 236], [214, 236]],
  noseInner: [[219, 203], [243, 203], [243, 231], [219, 231]],
  mouth: [[216, 252], [249, 252], [247, 425], [218, 425]],
  mouthGap: [[214, 248], [251, 248], [249, 430], [216, 430]],
  // side silhouette (face to the right)
  side: [[465, 127], [545, 82], [600, 63], [650, 60], [720, 74], [800, 100], [855, 142], [870, 200], [880, 275], [850, 290], [845, 320], [825, 400], [805, 455], [795, 467], [760, 440], [675, 345], [600, 300], [545, 245], [500, 208], [478, 160]],
  cap: [[455, 118], [545, 78], [600, 58], [650, 55], [720, 70], [800, 96], [860, 140], [875, 200], [890, 276], [855, 270], [800, 254], [750, 230], [700, 196], [650, 165], [625, 153], [548, 148], [466, 136]],
  visor: [[625, 153], [650, 165], [700, 196], [750, 230], [800, 254], [855, 270], [890, 276], [855, 281], [805, 266], [750, 243], [720, 221], [680, 193], [625, 179]],
  cheek: [[625, 165], [650, 176], [700, 207], [712, 212], [728, 249], [752, 269], [800, 285], [832, 293], [858, 297], [890, 299], [860, 306], [835, 400], [812, 472], [790, 478], [756, 447], [672, 352], [658, 300], [640, 240]],
  sensor: [[548, 148], [625, 153], [625, 179], [640, 240], [658, 300], [645, 306], [600, 298], [575, 270], [550, 215]],
  back: [[455, 120], [466, 136], [548, 148], [550, 215], [575, 270], [600, 298], [545, 245], [500, 208], [478, 160]],
  crestBand: [[560, 66], [600, 54], [650, 51], [720, 66], [800, 92], [862, 136], [876, 152], [858, 160], [795, 112], [720, 86], [650, 72], [600, 75], [560, 86]],
  sensorInner: [[560, 162], [615, 166], [622, 182], [637, 240], [650, 290], [640, 294], [603, 288], [582, 264], [560, 215]],
  // eye: brim edge (lip) + tapered deep slot widening toward the front + lens strip under the brim
  lip: [[625, 153], [650, 165], [700, 196], [750, 230], [800, 254], [855, 270], [892, 276], [892, 281], [855, 275], [800, 259], [742, 236], [700, 201], [650, 170], [625, 159]],
  eyeSlot: [[712, 212], [742, 236], [800, 259], [855, 275], [892, 281], [890, 299], [858, 297], [832, 293], [800, 285], [752, 269], [728, 249]],
  seam: [[625, 159], [650, 170], [700, 201], [742, 236], [742, 242], [700, 207], [650, 176], [625, 165]],
  eyeLens: [[745, 241], [800, 261], [855, 277], [884, 283], [882, 289], [858, 288], [800, 272], [758, 254]],
  lowerLid: [[722, 238], [728, 249], [752, 269], [800, 285], [832, 293], [858, 297], [890, 299], [890, 306], [858, 304], [832, 300], [800, 292], [750, 277], [722, 256]],
  bracket: [[588, 262], [636, 258], [738, 298], [748, 326], [706, 346], [602, 302]],
  railL: [[96, 163], [119, 168], [132, 302], [110, 300]],
  slotsL: [[[100, 173], [109, 175], [112, 214], [103, 212]], [[105, 228], [115, 231], [120, 270], [110, 268]]],
  podPanelL: [[82, 209], [73, 223], [79, 265], [90, 309], [97, 314], [96, 214]],
  ornament: [[221, 62], [242, 62], [239, 80], [231, 94], [223, 80]],
  roofSlot: [[705, 78], [760, 90], [820, 112], [852, 134], [847, 143], [815, 123], [758, 101], [703, 89]],
  roofSlotX: [[110, 30], [212, 30], [212, 200], [110, 200]],
  grille: [[[578, 216], [612, 216], [613, 223], [579, 223]], [[581, 229], [615, 229], [616, 236], [582, 236]], [[584, 242], [618, 242], [619, 249], [585, 249]]],
  podSide: [[498, 226], [565, 228], [645, 300], [662, 352], [606, 356], [520, 290]],
};

// ---------------- prisms ----------------
const toFront = ([px, py]) => new V2((px - F.cx) * F.s, (F.cy - py) * F.s);
const toSide = ([px, py]) => new V2((px - S.cx) * S.s, (S.cy - py) * S.s);
function prismGeo(pts2, depth = 24) {
  const shape = new THREE.Shape(pts2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const frontPrism = (poly) => prismGeo(poly.map(toFront));
const sidePrism = (poly) => { const g = prismGeo(poly.map(toSide)); g.rotateY(-Math.PI / 2); return g; };
// plan (top-view) prism from world (x, z) points, extruded along y
const topPrism = (xz) => { const g = prismGeo(xz.map(([x, z]) => new V2(x, -z))); g.rotateX(-Math.PI / 2); return g; };
// wedge-shaped face in plan view (derived so that the side-view visor band projects to the front-view V)
export const PLAN = [[0, 2.08], [0.21, 1.95], [1.03, 1.44], [1.38, 0.68], [1.62, -0.3], [1.62, -2.4], [-1.62, -2.4], [-1.62, -0.3], [-1.38, 0.68], [-1.03, 1.44], [-0.21, 1.95]];

const ev = new Evaluator();
ev.attributes = ['position']; ev.useGroups = false;
function brush(g) {
  g = g.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-5);
  const b = new Brush(g); b.updateMatrixWorld(); return b;
}
const AND = (a, b) => { const r = ev.evaluate(a, b, INTERSECTION); r.updateMatrixWorld(); return r; };
const SUB = (a, b) => { const r = ev.evaluate(a, b, SUBTRACTION); r.updateMatrixWorld(); return r; };
const ADD = (a, b) => { const r = ev.evaluate(a, b, ADDITION); r.updateMatrixWorld(); return r; };
function scaled(b, k, c) {
  const g = b.geometry.clone(); g.translate(-c.x, -c.y, -c.z); g.scale(k, k, k); g.translate(c.x, c.y, c.z);
  const r = new Brush(g); r.updateMatrixWorld(); return r;
}
function scaledX(b, k) { const g = b.geometry.clone(); g.scale(k, 1, 1); const r = new Brush(g); r.updateMatrixWorld(); return r; }
function moved(b, dx, dy, dz) { const g = b.geometry.clone(); g.translate(dx, dy, dz); const r = new Brush(g); r.updateMatrixWorld(); return r; }
function finish(b, shrink = 0.996) {
  let g = b.geometry.clone(); if (g.index) g = g.toNonIndexed();
  g.computeBoundingBox(); const c = new V3(); g.boundingBox.getCenter(c);
  g.translate(-c.x, -c.y, -c.z); g.scale(shrink, shrink, shrink); g.translate(c.x, c.y, c.z);
  g.computeVertexNormals();
  return g;
}

export function buildHead(mats) {
  const T = TRACE;
  const frontFull = smooth(mirrorFull(T.frontHalf), [0, 1, 7, 8, 9, 15]);
  const sideSm = smooth(T.side, [0, 13]);
  const planSm = smooth(PLAN, [0, 1, 10], 3);
  const hull = AND(AND(brush(frontPrism(frontFull)), brush(sidePrism(sideSm))), brush(topPrism(planSm)));
  hull.geometry.computeBoundingBox();
  const C = new V3(); hull.geometry.boundingBox.getCenter(C);
  const sp = (k) => brush(sidePrism(T[k]));
  const centre = brush(frontPrism(T.centre)), centreGap = brush(frontPrism(T.centreGap));

  const parts = [];
  const add = (name, cn, b, mat = 'clay', shrink) => parts.push({ name, cn, geo: finish(b, shrink), mat });

  const fr = (k) => brush(frontPrism(T[k]));
  const capS = sp('cap'), visorS = sp('visor'), cheekS = sp('cheek'), sensorS = sp('sensor'), backS = sp('back');
  const crestS = sp('crestBand'), lipS = sp('lip'), sInS = sp('sensorInner'), brS = sp('bracket');
  add('cap', '护顶装甲', SUB(SUB(SUB(AND(hull, capS), AND(fr('centreGap'), crestS)), lipS), AND(ADD(brush(frontPrism(T.roofSlotX)), brush(frontPrism(mirrorPoly(T.roofSlotX)))), sp('roofSlot'))));
  add('crest', '头顶脊甲', AND(AND(moved(hull, 0, 0.004, 0.012), fr('centre')), crestS));
  add('lip', '帽檐', AND(moved(scaled(hull, 1.022, C), 0, 0, 0.03), lipS));
  const slotS = sp('eyeSlot');
  add('seam', '帽檐接缝', AND(scaled(hull, 0.965, C), sp('seam')), 'dark');
  add('visor', '眼缝深槽', SUB(AND(scaled(hull, 0.72, C), slotS), fr('nose')), 'dark');
  add('eyeBack', '眼缝背板', AND(scaled(hull, 0.8, C), ADD(slotS, sp('lowerLid'))), 'dark');
  add('eye', '眼片', SUB(AND(scaled(hull, 0.86, C), sp('eyeLens')), fr('nose')), 'eye');
  const lidS = sp('lowerLid');
  add('lowerLid', '下眼睑', SUB(AND(scaled(hull, 0.955, C), lidS), fr('mouthGap')));
  const noseZone = ADD(ADD(slotS, visorS), capS);
  add('nose', '额头开启面板框', SUB(SUB(AND(AND(moved(hull, 0, 0, 0.05), fr('nose')), noseZone), lipS), fr('noseInner')));
  add('noseFloor', '应急开启面板', SUB(AND(AND(moved(hull, 0, 0, 0.01), fr('noseInner')), noseZone), lipS), 'dark');
  add('sensorFrame', '传感器窗框', SUB(AND(scaled(hull, 0.955, C), sensorS), sInS));
  add('sensor', '侧传感器舱', AND(scaled(hull, 0.9, C), sInS), 'dark');
  add('back', '后部框架', AND(scaled(hull, 0.985, C), backS));
  add('cheeks', '颊板', SUB(SUB(SUB(SUB(AND(hull, cheekS), sensorS), backS), fr('mouthGap')), lidS));
  add('mouth', '口部中脊', AND(AND(moved(hull, 0, 0, 0.022), fr('mouth')), cheekS));
  add('bracket', '颊侧支架', AND(scaledX(hull, 1.07), brS));
  // roof vent slots (long groove on each side of the crest)
  const rsx = ADD(brush(frontPrism(T.roofSlotX)), brush(frontPrism(mirrorPoly(T.roofSlotX))));
  add('roofSlot', '顶部通风槽', AND(AND(scaled(hull, 0.975, C), rsx), sp('roofSlot')), 'dark');
  // grille bars inside the sensor window
  let gr = null; for (const g of T.grille) { const b = brush(sidePrism(g)); gr = gr ? ADD(gr, b) : b; }
  add('grille', '传感器格栅', AND(scaled(hull, 0.935, C), gr));
  // side rails with dark slots (front view, between ear module and face)
  const rails = ADD(brush(frontPrism(T.railL)), brush(frontPrism(mirrorPoly(T.railL))));
  let slots = null; for (const sl of T.slotsL) for (const q of [sl, mirrorPoly(sl)]) { const b = brush(frontPrism(q)); slots = slots ? ADD(slots, b) : b; }
  add('rails', '侧梁', SUB(SUB(AND(moved(hull, 0, 0, 0.07), rails), capS), slots));
  add('slots', '侧梁暗槽', SUB(AND(scaled(hull, 0.97, C), slots), capS), 'dark');
  add('ornament', '顶部徽饰', AND(AND(moved(hull, 0, 0.03, 0.05), fr('ornament')), crestS));
  // side pods (front-view ear modules)
  const pods = ADD(brush(frontPrism(T.podL)), brush(frontPrism(mirrorPoly(T.podL))));
  add('pods', '侧耳模块', AND(pods, sp('podSide')));
  const podPanels = ADD(brush(frontPrism(T.podPanelL)), brush(frontPrism(mirrorPoly(T.podPanelL))));
  add('podPanels', '侧耳面板', AND(moved(AND(pods, sp('podSide')), 0, 0, 0.06), podPanels));

  // ---------- gear hub (canopy pivot): widened hub housings on both sides ----------
  const gp = toSide([587, 195]), gR = 22 * S.s;
  const HINGE = new V3(0, gp.y, gp.x);
  // ---------- cockpit cavity: hollow the middle of the head ----------
  const cavBox = new THREE.BoxGeometry(6, 5, 2.7); cavBox.translate(0, 1.15 + 2.5, -0.95 + 1.35);
  const cavity = AND(scaled(hull, 0.84, C), brush(cavBox));
  const CANOPY = ['cap', 'crest', 'lip', 'roofSlot', 'ornament', 'nose', 'noseFloor', 'eye', 'visor', 'eyeBack'];
  const capInner = scaled(hull, 0.9, C);
  for (const p of parts) {
    if (['pods', 'podPanels', 'bracket', 'crest', 'ornament', 'nose', 'noseFloor', 'eye', 'visor', 'lip', 'eyeBack'].includes(p.name)) continue;
    const b = brush(p.geo);
    const cut = CANOPY.includes(p.name) ? SUB(b, capInner) : SUB(b, cavity);
    p.geo = finish(cut, 1);
  }

  const hullMesh = new THREE.Mesh(hull.geometry);
  const ray0 = new THREE.Raycaster();
  const hubX = [];
  for (const sgn of [1, -1]) {
    ray0.set(new V3(sgn * 10, gp.y, gp.x), new V3(-sgn, 0, 0));
    const hit = ray0.intersectObject(hullMesh, false)[0];
    const sx = hit ? Math.abs(hit.point.x) : 1.45;
    const outer = sx + 0.15, inner = sx - 0.14, len = outer - inner, mid = sgn * (outer + inner) / 2;
    const boss = new THREE.CylinderGeometry(gR * 1.55, gR * 1.7, len, 40); boss.rotateZ(-sgn * Math.PI / 2); boss.translate(mid, gp.y, gp.x);
    const pocket = new THREE.CylinderGeometry(gR * 1.14, gR * 1.14, 0.2, 40); pocket.rotateZ(Math.PI / 2); pocket.translate(sgn * (outer + 0.02), gp.y, gp.x);
    const rimCut = new THREE.CylinderGeometry(gR * 1.7, gR * 1.7, 0.03, 40); rimCut.rotateZ(Math.PI / 2); rimCut.translate(sgn * (outer - 0.03), gp.y, gp.x);
    parts.push({ name: 'hub' + (sgn > 0 ? 'L' : 'R'), cn: '转轴齿轮座', geo: finish(SUB(brush(boss), brush(pocket)), 1), mat: 'clay' });
    hubX.push({ sgn, face: outer - 0.1 });
  }

  const group = new THREE.Group();
  const canopyPivot = new THREE.Group(); canopyPivot.name = 'canopyPivot'; canopyPivot.position.copy(HINGE);
  const canopy = new THREE.Group(); canopy.name = 'canopy'; canopy.position.copy(HINGE).multiplyScalar(-1);
  canopyPivot.add(canopy); group.add(canopyPivot);
  group.userData.hinge = HINGE.clone();
  for (const p of parts) {
    const m = new THREE.Mesh(p.geo, mats[p.mat]);
    m.name = p.name; m.userData.cn = p.cn;
    (CANOPY.includes(p.name) ? canopy : group).add(m);
  }
  const box = (w, h, d, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]); m.position.set(x, y, z); parent.add(m); return m; };
  const ray = new THREE.Raycaster();
  // manual release handle in the forehead panel (part of the canopy)
  { const c = toFront([231, 217]); ray.set(new V3(0, c.y, 10), new V3(0, 0, -1));
    const hit = ray.intersectObject(canopy.getObjectByName('noseFloor'), false)[0];
    if (hit) { box(0.14, 0.035, 0.05, 'clay', 0, c.y + 0.05, hit.point.z + 0.03, canopy); box(0.03, 0.09, 0.03, 'clay', -0.06, c.y + 0.02, hit.point.z + 0.02, canopy); box(0.03, 0.09, 0.03, 'clay', 0.06, c.y + 0.02, hit.point.z + 0.02, canopy); } }
  // bracket bolts
  const brMesh = group.getObjectByName('bracket');
  for (const [px, py] of [[648, 300], [690, 316]]) {
    const p = toSide([px, py]);
    for (const sgn of [1, -1]) {
      ray.set(new V3(sgn * 10, p.y, p.x), new V3(-sgn, 0, 0));
      const hit = ray.intersectObject(brMesh, false)[0]; if (!hit) continue;
      for (const [rr, dd] of [[9 * S.s, 0.05], [5 * S.s, 0.1]]) {
        const g = new THREE.CylinderGeometry(rr, rr, dd, 24); g.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(g, mats.clay); m.position.set(hit.point.x + sgn * dd * 0.5, p.y, p.x); group.add(m);
      }
    }
  }
  // gears recessed in the hub housings + lift posts
  const sensorMesh = group.getObjectByName('sensor');
  const gears = [];
  for (const { sgn, face } of hubX) {
    const sh = new THREE.Shape(); const n = 16;
    for (let i = 0; i < n * 4; i++) { const a = i / (n * 4) * Math.PI * 2, q = i % 4, r = (q === 1 || q === 2) ? gR : gR * 0.84; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const hole = new THREE.Path(); hole.absarc(0, 0, gR * 0.32, 0, Math.PI * 2, true); sh.holes.push(hole);
    const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
    gg.translate(0, 0, -0.03); gg.rotateY(Math.PI / 2); gg.computeVertexNormals();
    const gear = new THREE.Group(); gear.name = 'gear'; gear.position.set(sgn * (face + 0.02), gp.y, gp.x); group.add(gear);
    gear.add(new THREE.Mesh(gg, mats.clay));
    const hubG = new THREE.CylinderGeometry(gR * 0.3, gR * 0.3, 0.1, 24); hubG.rotateZ(Math.PI / 2); gear.add(new THREE.Mesh(hubG, mats.dark));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, gR * 0.08, gR * 0.5), mats.clay); sp2.position.set(0, Math.sin(a) * gR * 0.55, Math.cos(a) * gR * 0.55); sp2.rotation.x = -a; gear.add(sp2); }
    gears.push(gear);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(gR * 0.24, gR * 0.24, 1, 16), mats.dark);
    post.name = 'liftPost'; post.position.set(sgn * (face - 0.05), gp.y, gp.x); post.visible = false; group.add(post);
  }
  for (const [px, py, r] of [[597, 237, 13], [622, 277, 11]]) {
    const p = toSide([px, py]), R = r * S.s;
    for (const sgn of [1, -1]) {
      ray.set(new V3(sgn * 10, p.y, p.x), new V3(-sgn, 0, 0));
      const hit = ray.intersectObject(sensorMesh, false)[0]; if (!hit) continue;
      for (const [rr, dd, mat] of [[R, 0.06, 'clay'], [R * 0.72, 0.1, 'dark'], [R * 0.45, 0.14, 'clay']]) {
        const g = new THREE.CylinderGeometry(rr, rr, dd, 32); g.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(g, mats[mat]); m.position.set(hit.point.x + sgn * dd * 0.5, p.y, p.x); group.add(m);
      }
    }
  }

  // ---------- cockpit interior: three standing drive rigs in a shallow arc ----------
  const cockpit = new THREE.Group(); cockpit.name = 'cockpit'; group.add(cockpit);
  const FLOOR = 1.15, PFLOOR = 1.48, U = 1 / 2.05;   // 1 unit = 2.05 m; PFLOOR = station platform top

  const rig = (x, z, ry, tag) => {
    const g = new THREE.Group(); g.position.set(x, PFLOOR, z); g.rotation.y = ry; g.name = 'rig' + tag; cockpit.add(g);
    const b = (w, h, d, mat, px, py, pz) => box(w, h, d, mat, px, py, pz, g);
    // pilot (1.8 m)
    const H = 1.8 * U;
    for (const sx of [-1, 1]) { b(0.07, H * 0.47, 0.08, 'clay', sx * 0.06, H * 0.235, 0); b(0.16, 0.025, 0.24, 'dark', sx * 0.09, 0.012, 0.02); }
    b(0.22, H * 0.3, 0.13, 'clay', 0, H * 0.62, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), mats.clay); head.position.set(0, H * 0.86, 0.01); g.add(head);
    for (const sx of [-1, 1]) { const a = b(0.05, H * 0.28, 0.06, 'clay', sx * 0.15, H * 0.62, 0.07); a.rotation.x = -0.6; }
    // spine harness + motion rig
    b(0.08, H * 0.95, 0.05, 'dark', 0, H * 0.5, -0.11);
    b(0.34, 0.04, 0.04, 'dark', 0, H * 0.78, -0.1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 32, Math.PI * 1.3), mats.dark); ring.rotation.set(Math.PI / 2, 0, -Math.PI * 0.15); ring.position.set(0, H * 0.5, 0); g.add(ring);
    // clean standing rig: the old four front frame posts were removed;
    // the backrest and side rails now carry the structure.
    // holo panel in front of each pilot
  };
  const fit = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return finish(AND(cavity, brush(g)), 1); };
  // station platform (pilots stand on it) + front walkway deck at the same level
  cockpit.add(new THREE.Mesh(fit(3, PFLOOR - FLOOR, 1.25, 0, (PFLOOR + FLOOR) / 2, -0.05), mats.clay));
  cockpit.add(new THREE.Mesh(fit(3, 0.04, 1.25, 0, PFLOOR - 0.02, -0.05), mats.dark));
  // probe the uneven interior: stand each pilot on top of the highest solid surface under the feet
  const solids = []; group.traverse(o => { if (o.isMesh && o.parent === group) solids.push(o); });
  cockpit.traverse(o => { if (o.isMesh) solids.push(o); });
  group.updateMatrixWorld(true);
  const groundAt = (x, z) => {
    let top = PFLOOR;
    for (const dx of [-0.13, 0, 0.13]) for (const dz of [-0.12, 0, 0.14]) {
      ray.set(new V3(x + dx, 3.4, z + dz), new V3(0, -1, 0));
      const hit = ray.intersectObjects(solids, false)[0];
      if (hit && hit.point.y < 3.0) top = Math.max(top, hit.point.y);
    }
    return top;
  };
  const RIGS = [[0, 0.22, 0, 'B'], [-0.64, -0.02, 0.2, 'A'], [0.64, -0.02, -0.2, 'C']];
  const lift = Math.max(...RIGS.map(([x, z]) => groundAt(x, z))) + 0.02;
  for (const [x, z, ry, tag] of RIGS) {
    rig(x, z, ry, tag); cockpit.getObjectByName('rig' + tag).position.y = lift;
    // pedestal under each station
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, lift - PFLOOR + 0.02, 32), mats.dark);
    ped.position.set(x, (lift + PFLOOR) / 2, z); cockpit.add(ped);
  }
  group.userData.pilotLift = lift;
  // front deck (safety zone + entry walkway) at platform level
  cockpit.add(new THREE.Mesh(fit(3, PFLOOR - FLOOR, 0.95, 0, (PFLOOR + FLOOR) / 2, 1.1), mats.clay));
  for (const sx of [-1, 1]) cockpit.add(new THREE.Mesh(fit(1.3, 0.012, 0.5, sx * 0.88, PFLOOR + 0.006, 0.86), mats.dark));
  // entry corridor: step over the front lip -> central aisle with handrails -> stations
  const AW = 0.38;
  box(AW, 0.12, 0.2, 'clay', 0, PFLOOR + 0.06, 1.5, cockpit);
  box(AW + 0.04, 0.012, 1.1, 'dark', 0, PFLOOR + 0.006, 0.95, cockpit);
  for (const sx of [-1, 1]) {
    for (const z of [0.55, 0.95, 1.35]) box(0.025, 0.42, 0.025, 'dark', sx * (AW / 2 + 0.02), PFLOOR + 0.21, z, cockpit);
    box(0.025, 0.025, 0.86, 'dark', sx * (AW / 2 + 0.02), PFLOOR + 0.42, 0.95, cockpit);
  }
  // rear bulkhead with hatch
  box(1.6, 0.9, 0.06, 'dark', 0, FLOOR + 0.45, -0.85, cockpit);
  box(0.42, 0.62, 0.02, 'clay', 0, FLOOR + 0.35, -0.81, cockpit);

  // one curved wraparound screen shared by the three pilots, mounted inside the canopy front
  { const scr = new THREE.CylinderGeometry(1.25, 1.25, 0.42, 48, 1, true, -0.62, 1.24); scr.translate(0, 2.74, 0.2);
    const sm = new THREE.Mesh(scr, mats.eye); sm.material = mats.eye; sm.name = 'screen'; canopy.add(sm);
    const fr = new THREE.CylinderGeometry(1.27, 1.27, 0.48, 48, 1, true, -0.65, 1.3); fr.translate(0, 2.74, 0.2);
    const fm = new THREE.Mesh(fr, mats.dark); canopy.add(fm);
    for (const a of [-0.6, 0, 0.6]) box(0.04, 0.3, 0.04, 'dark', Math.sin(a) * 1.29, 3.07, 0.2 + Math.cos(a) * 1.29, canopy); }

  // ---------- cockpit interior detailing ----------
  const CPT = cockpit;
  // record what the detail pass adds, so the cockpit lab can toggle between
  // the clean base and the detailed version.
  const detailParents = [CPT, canopy, ...RIGS.map(([,,, tag]) => CPT.getObjectByName('rig' + tag)).filter(Boolean)];
  const detailBefore = new Map(detailParents.map(p => [p, p.children.length]));
  // Keep the approved head shell untouched. Everything below lives inside the
  // cockpit cavity or on the canopy underside, using the existing clay/dark/eye
  // materials so the line-art study stays consistent.
  const PH = 1.8 * U;                       // pilot height, world units
  const cylDetail = (r, h, mat, x, y, z, rot = [0, 0, 0], parent = CPT, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mats[mat]);
    m.position.set(x, y, z); m.rotation.set(rot[0], rot[1], rot[2]); parent.add(m); return m;
  };
  const tubeDetail = (a, b, r, mat, parent = CPT) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mats[mat]);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    parent.add(m); return m;
  };
  const torusDetail = (R, r, mat, x, y, z, rot = [0, 0, 0], parent = CPT) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 8, 28), mats[mat]);
    m.position.set(x, y, z); m.rotation.set(rot[0], rot[1], rot[2]); parent.add(m); return m;
  };
  const hazard = (x, y, z, w, h, parent = CPT, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    const n = 6, seg = w / n;
    for (let i = 0; i < n; i++) box(seg, 0.006, h, i % 2 ? 'dark' : 'clay', -w / 2 + seg * (i + 0.5), 0, 0, g);
    box(w, 0.01, 0.008, 'dark', 0, h / 2 + 0.004, 0, g);
    return g;
  };

  // ---- three drive rigs: foot locks, suit armor, harness, helmet, grips ----
  for (const [rx0, rz0, ry0, tag] of RIGS) {
    const rig = CPT.getObjectByName('rig' + tag);
    if (!rig) continue;
    // foot plates and toe clamps
    box(0.24, 0.018, 0.17, 'dark', 0, 0.009, 0.02, rig);
    for (const sx of [-1, 1]) {
      box(0.075, 0.045, 0.15, 'dark', sx * 0.085, 0.036, 0.02, rig);
      box(0.07, 0.02, 0.05, 'clay', sx * 0.085, 0.058, 0.11, rig);
      box(0.052, 0.24, 0.016, 'clay', sx * 0.06, PH * 0.20, 0.055, rig);
      box(0.078, 0.055, 0.032, 'clay', sx * 0.06, PH * 0.38, 0.06, rig);
      box(0.06, 0.018, 0.02, 'dark', sx * 0.06, PH * 0.29, 0.066, rig);
      // shoulder pad + harness strap
      box(0.085, 0.05, 0.085, 'clay', sx * 0.145, PH * 0.75, 0, rig);
      const st = box(0.03, 0.23, 0.012, 'dark', sx * 0.07, PH * 0.64, 0.074, rig);
      st.rotation.z = sx * 0.22;
      // glove + control grip
      box(0.05, 0.035, 0.07, 'dark', sx * 0.14, PH * 0.57, 0.16, rig);
      box(0.038, 0.03, 0.12, 'clay', sx * 0.14, PH * 0.57, 0.20, rig);
      // neural cable to the back brace
      tubeDetail([sx * 0.045, PH * 0.87, -0.04], [sx * 0.07, PH * 0.67, -0.11], 0.006, 'dark', rig);
    }
    // waist clamp, chest pack, back brace
    box(0.24, 0.04, 0.16, 'dark', 0, PH * 0.51, 0, rig);
    box(0.26, 0.018, 0.17, 'clay', 0, PH * 0.535, 0, rig);
    box(0.17, 0.10, 0.05, 'clay', 0, PH * 0.64, 0.095, rig);
    box(0.11, 0.035, 0.01, 'eye', 0, PH * 0.66, 0.123, rig);
    for (let i = -1; i <= 1; i++) box(0.012, 0.01, 0.006, 'dark', i * 0.025, PH * 0.62, 0.124, rig);
    box(0.26, 0.24, 0.035, 'clay', 0, PH * 0.62, -0.115, rig);
    for (const sx of [-1, 1]) {
      box(0.04, 0.18, 0.06, 'clay', sx * 0.15, PH * 0.57, -0.08, rig);
      box(0.035, 0.035, 0.035, 'dark', sx * 0.15, PH * 0.67, -0.08, rig);
    }
    box(0.14, 0.06, 0.04, 'clay', 0, PH * 0.79, -0.10, rig);
    // helmet add-ons: visor, brow, chin, ear cups
    box(0.105, 0.028, 0.014, 'eye', 0, PH * 0.866, 0.066, rig);
    box(0.12, 0.024, 0.026, 'dark', 0, PH * 0.895, 0.012, rig);
    box(0.075, 0.02, 0.018, 'dark', 0, PH * 0.822, 0.062, rig);
    for (const sx of [-1, 1]) cylDetail(0.027, 0.022, 'dark', sx * 0.062, PH * 0.865, 0, [0, 0, Math.PI / 2], rig, 10);
    // low angled control dash; two grips, not a chest-high tray
    const con = new THREE.Group(); con.position.set(0, PH * 0.47, 0.275); con.rotation.x = -0.55; rig.add(con);
    box(0.30, 0.022, 0.17, 'dark', 0, 0, 0, con);
    box(0.26, 0.012, 0.11, 'clay', 0, 0.014, 0, con);
    box(0.20, 0.008, 0.075, 'eye', 0, 0.021, -0.005, con);
    for (let i = 0; i < 5; i++) box(0.014, 0.006, 0.01, 'dark', -0.072 + i * 0.036, 0.020, 0.055, con);
    for (const sx of [-1, 1]) {
      const grip = box(0.04, 0.02, 0.07, 'dark', sx * 0.13, 0.03, 0.035, con);
      grip.rotation.z = sx * 0.12;
      box(0.02, 0.015, 0.04, 'clay', sx * 0.13, 0.045, 0.035, con);
    }
    // station number plate on the pedestal front
    box(0.09, 0.035, 0.012, 'dark', rx0, lift + 0.20, rz0 + 0.34, CPT);
    for (let i = -1; i <= 1; i++) box(0.012, 0.012, 0.006, 'eye', rx0 + i * 0.018, lift + 0.20, rz0 + 0.347, CPT);
  }

  // ---- pedestal rims, bolts, floor grating, hazard lip ----
  for (const [rx0, rz0] of RIGS) {
    torusDetail(0.35, 0.012, 'dark', rx0, lift + 0.02, rz0, [Math.PI / 2, 0, 0], CPT);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      box(0.018, 0.012, 0.018, 'dark', rx0 + Math.cos(a) * 0.36, lift + 0.026, rz0 + Math.sin(a) * 0.36, CPT);
    }
    // sloped status panel on the pedestal face
    box(0.22, 0.13, 0.02, 'dark', rx0, lift + 0.13, rz0 + 0.31, CPT);
    box(0.13, 0.04, 0.008, 'eye', rx0, lift + 0.15, rz0 + 0.322, CPT);
    // four motion ribs, not a cage
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      box(0.022, 0.24, 0.045, 'dark', rx0 + Math.cos(a) * 0.33, lift - 0.08, rz0 + Math.sin(a) * 0.33, CPT);
    }
    torusDetail(0.33, 0.010, 'dark', rx0, PFLOOR + 0.02, rz0, [Math.PI / 2, 0, 0], CPT);
  }
  for (let z = 0.76; z <= 1.36; z += 0.15) box(0.62, 0.006, 0.035, 'dark', 0, PFLOOR + 0.006, z, CPT);
  for (const sx of [-1, 1]) box(0.02, 0.008, 0.66, 'dark', sx * 0.32, PFLOOR + 0.008, 1.06, CPT);
  for (let i = 0; i < 10; i++) box(0.16, 0.012, 0.06, i % 2 ? 'dark' : 'clay', -0.72 + i * 0.16, PFLOOR + 0.012, 1.46, CPT);
  for (const sx of [-1, 1]) for (const z of [0.86, 1.08, 1.30]) {
    box(0.055, 0.01, 0.075, 'eye', sx * 0.40, PFLOOR + 0.012, z, CPT);
    torusDetail(0.035, 0.008, 'dark', sx * 0.50, PFLOOR + 0.015, z, [Math.PI / 2, 0, 0], CPT);
  }
  box(0.38, 0.012, 0.055, 'dark', 0, PFLOOR + 0.075, 1.48, CPT);

  // ---- side equipment racks: no large liner panels, no stacked door leaves ----
  // Mount gear on two slim rails per side. This avoids the coplanar side panel /
  // door / inset stack that produced the black z-fighting hatch in the review.
  for (const s of [-1, 1]) {
    // two vertical rails + top/bottom crossbars, flush to the cockpit wall
    for (const z of [-0.45, 0.45]) box(0.030, 0.68, 0.040, 'dark', s * 1.18, 1.86, z, CPT);
    box(0.035, 0.040, 0.98, 'clay', s * 1.185, 2.22, 0, CPT);
    box(0.035, 0.040, 0.98, 'clay', s * 1.185, 1.50, 0, CPT);
    tubeDetail([s * 1.16, 2.30, -0.62], [s * 1.16, 2.30, 0.90], 0.018, 'dark', CPT);
    // junction box with switch lights
    box(0.09, 0.15, 0.07, 'clay', s * 1.12, 1.78, 0.25, CPT);
    box(0.055, 0.03, 0.008, 'eye', s * 1.07, 1.81, 0.29, CPT);
    for (let i = 0; i < 3; i++) box(0.016, 0.016, 0.006, 'dark', s * 1.07, 1.74 - i * 0.032, 0.29, CPT);
    // small inward-facing status screen
    const sg = new THREE.Group(); sg.position.set(s * 1.05, 1.95, 0.56); sg.rotation.y = -s * 0.30; CPT.add(sg);
    box(0.04, 0.30, 0.45, 'dark', 0, 0, 0, sg);
    box(0.012, 0.22, 0.32, 'eye', -s * 0.026, 0.02, 0, sg);
    for (let i = 0; i < 3; i++) box(0.01, 0.03, 0.03, 'dark', -s * 0.035, -0.10 + i * 0.05, 0.17, sg);
    box(0.05, 0.05, 0.05, 'clay', 0, -0.19, 0.15, sg);
    // fire extinguisher with bracket and hose, one per side
    cylDetail(0.045, 0.20, 'clay', s * 1.08, 1.62, 0.42, [0, 0, 0], CPT, 12);
    cylDetail(0.018, 0.05, 'dark', s * 1.08, 1.74, 0.42, [0, 0, 0], CPT, 8);
    box(0.08, 0.025, 0.06, 'dark', s * 1.05, 1.66, 0.42, CPT);
    tubeDetail([s * 1.08, 1.72, 0.42], [s * 1.16, 1.62, 0.50], 0.010, 'dark', CPT);
    hazard(s * 1.05, 1.52, 0.52, 0.14, 0.03, CPT);
  }

  // left side: oxygen bottle + first-aid box
  cylDetail(0.050, 0.32, 'clay', -1.06, 1.62, -0.55, [0, 0, 0], CPT, 12);
  cylDetail(0.018, 0.05, 'dark', -1.06, 1.80, -0.55, [0, 0, 0], CPT, 8);
  box(0.13, 0.025, 0.05, 'dark', -1.06, 1.68, -0.55, CPT);
  box(0.13, 0.16, 0.05, 'clay', -1.10, 1.72, -0.28, CPT);
  box(0.09, 0.02, 0.008, 'dark', -1.10, 1.73, -0.315, CPT);
  box(0.02, 0.08, 0.008, 'dark', -1.10, 1.73, -0.315, CPT);

  // right side: rifle rack + tool case
  box(0.03, 0.46, 0.30, 'clay', 1.16, 1.80, -0.30, CPT);
  for (const zz of [-0.38, -0.18]) {
    // compact rifle, mounted vertically
    box(0.045, 0.20, 0.055, 'dark', 1.08, 1.78, zz, CPT);
    cylDetail(0.010, 0.26, 'dark', 1.08, 1.97, zz, [0, 0, 0], CPT, 8);
    box(0.035, 0.08, 0.045, 'clay', 1.08, 1.64, zz, CPT);
    box(0.035, 0.06, 0.025, 'dark', 1.08, 1.70, zz + 0.04, CPT);
    box(0.035, 0.035, 0.06, 'clay', 1.08, 1.84, zz, CPT);
    for (const yy of [1.65, 1.95]) box(0.05, 0.025, 0.07, 'dark', 1.12, yy, zz, CPT);
  }
  box(0.14, 0.28, 0.20, 'clay', 1.16, 1.72, -0.62, CPT);
  box(0.10, 0.18, 0.008, 'dark', 1.09, 1.72, -0.62, CPT);
  box(0.02, 0.05, 0.02, 'dark', 1.08, 1.72, -0.55, CPT);
  box(0.20, 0.10, 0.12, 'dark', 1.00, PFLOOR + 0.14, -0.30, CPT);
  for (const zz of [-0.35, -0.25]) box(0.02, 0.03, 0.02, 'clay', 0.91, PFLOOR + 0.14, zz, CPT);
  hazard(1.16, 1.50, -0.30, 0.22, 0.035, CPT);

  // ---- rear bulkhead: hatch wheel, window, hinges, warning placard, pipes ----
  box(0.50, 0.72, 0.03, 'dark', 0, 1.50, -0.82, CPT);
  box(0.42, 0.62, 0.018, 'clay', 0, 1.50, -0.80, CPT);
  torusDetail(0.085, 0.012, 'dark', 0, 1.50, -0.785, [0, 0, 0], CPT);
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2;
    const sp = box(0.012, 0.16, 0.008, 'dark', Math.cos(a) * 0.04, 1.50 + Math.sin(a) * 0.04, -0.783, CPT);
    sp.rotation.z = a;
  }
  cylDetail(0.028, 0.03, 'dark', 0, 1.50, -0.78, [Math.PI / 2, 0, 0], CPT, 10);
  for (const sx of [-1, 1]) for (const yy of [1.32, 1.68]) box(0.055, 0.08, 0.025, 'clay', sx * 0.22, yy, -0.80, CPT);
  box(0.32, 0.15, 0.03, 'dark', 0, 1.97, -0.82, CPT);
  box(0.25, 0.09, 0.01, 'eye', 0, 1.97, -0.80, CPT);
  hazard(-0.40, 1.82, -0.80, 0.22, 0.07, CPT);
  tubeDetail([-0.62, 1.28, -0.84], [-0.62, 2.02, -0.84], 0.022, 'dark', CPT);
  tubeDetail([0.62, 1.28, -0.84], [0.62, 2.02, -0.84], 0.022, 'dark', CPT);
  tubeDetail([-0.62, 1.95, -0.84], [0.62, 1.95, -0.84], 0.016, 'dark', CPT);
  box(0.10, 0.13, 0.045, 'clay', 0.52, 1.44, -0.81, CPT);
  box(0.055, 0.02, 0.008, 'eye', 0.52, 1.46, -0.785, CPT);


  // ---- upper rear wall: three service bays behind the pilots ----
  // The lower hatch bulkhead only reaches y≈1.95. This fills the dark cavity
  // above it with a proper structural/service wall instead of leaving a void.
  box(2.62, 0.72, 0.035, 'clay', 0, 2.34, -0.86, CPT);
  box(2.78, 0.055, 0.07, 'clay', 0, 2.705, -0.82, CPT);
  box(2.78, 0.055, 0.07, 'clay', 0, 1.985, -0.82, CPT);
  for (const x of [-1.13, -0.38, 0.38, 1.13]) {
    box(0.045, 0.66, 0.06, 'clay', x, 2.34, -0.82, CPT);
    box(0.018, 0.58, 0.03, 'dark', x, 2.34, -0.795, CPT);
    for (const yy of [2.05, 2.63]) box(0.07, 0.03, 0.03, 'dark', x, yy, -0.80, CPT);
  }
  // three recessed service bays, aligned with the pilot stations
  for (const x of [-0.75, 0, 0.75]) {
    box(0.58, 0.56, 0.02, 'clay', x, 2.34, -0.845, CPT);
    box(0.48, 0.44, 0.025, 'dark', x, 2.34, -0.825, CPT);
    // status display + three switch lights
    box(0.18, 0.06, 0.008, 'eye', x, 2.46, -0.805, CPT);
    for (let i = 0; i < 3; i++) box(0.025, 0.018, 0.006, 'dark', x - 0.07 + i * 0.07, 2.41, -0.805, CPT);
    // lower vent grille
    for (let i = 0; i < 4; i++) box(0.34, 0.012, 0.01, 'clay', x, 2.16 + i * 0.03, -0.805, CPT);
    // neural coupling above the pilot + two cable drops
    cylDetail(0.045, 0.06, 'clay', x, 2.60, -0.77, [Math.PI / 2, 0, 0], CPT, 10);
    cylDetail(0.020, 0.075, 'dark', x, 2.60, -0.73, [Math.PI / 2, 0, 0], CPT, 8);
    tubeDetail([x, 2.57, -0.75], [x, 2.30, -0.62], 0.010, 'dark', CPT);
    tubeDetail([x + 0.03, 2.57, -0.75], [x + 0.04, 2.28, -0.60], 0.007, 'dark', CPT);
    // small caution plate under the bay
    hazard(x, 2.075, -0.795, 0.30, 0.035, CPT);
  }
  // overhead beam, lamp housings and cable tray
  box(2.50, 0.06, 0.10, 'clay', 0, 2.66, -0.74, CPT);
  for (const x of [-0.7, 0, 0.7]) {
    box(0.30, 0.025, 0.06, 'dark', x, 2.62, -0.72, CPT);
    box(0.22, 0.012, 0.03, 'eye', x, 2.60, -0.71, CPT);
  }
  box(2.20, 0.04, 0.12, 'dark', 0, 2.55, -0.80, CPT);
  for (let i = 0; i < 3; i++) tubeDetail([-1.0, 2.55, -0.77], [1.0, 2.55, -0.77], 0.012, 'clay', CPT);
  // side equipment blocks / vents fill the dark rear corners
  for (const s of [-1, 1]) {
    box(0.18, 0.30, 0.12, 'clay', s * 1.16, 2.28, -0.74, CPT);
    box(0.12, 0.08, 0.01, 'eye', s * 1.16, 2.38, -0.675, CPT);
    for (let i = 0; i < 3; i++) box(0.06, 0.025, 0.01, 'dark', s * 1.16, 2.27 - i * 0.05, -0.675, CPT);
    for (let i = 0; i < 4; i++) box(0.12, 0.015, 0.01, 'dark', s * 1.16, 2.12 + i * 0.035, -0.675, CPT);
    box(0.12, 0.66, 0.035, 'clay', s * 1.235, 2.34, -0.81, CPT);
    hazard(s * 1.16, 2.46, -0.675, 0.16, 0.04, CPT);
  }


  // ---- canopy underside: ribs, overhead console, struts, handrails, lights ----
  for (const z of [-0.58, -0.18, 0.22, 0.62]) box(1.72, 0.030, 0.045, 'dark', 0, 2.485, z, canopy);
  for (const s of [-1, 1]) {
    box(0.032, 0.032, 1.48, 'dark', s * 0.82, 2.445, 0.06, canopy);
    box(0.018, 0.012, 0.62, 'eye', s * 0.55, 2.462, 0.18, canopy);
    cylDetail(0.028, 0.42, 'clay', s * 1.02, 2.34, 0.12, [Math.PI / 2, 0, 0], canopy, 10);
    box(0.10, 0.06, 0.08, 'dark', s * 1.02, 2.34, -0.12, canopy);
    tubeDetail([s * 0.92, 2.40, 0.78], [s * 0.92, 2.40, -0.52], 0.016, 'dark', canopy);
  }
  box(1.0, 0.045, 0.28, 'clay', 0, 2.34, 0.58, canopy);
  box(0.82, 0.012, 0.16, 'eye', 0, 2.365, 0.56, canopy);
  for (let i = 0; i < 6; i++) box(0.035, 0.012, 0.035, 'dark', -0.30 + i * 0.12, 2.368, 0.64, canopy);
  box(0.36, 0.01, 0.10, 'eye', 0, 2.46, 0.86, canopy);
  // interior padding panels along the canopy edge
  for (const s of [-1, 1]) {
    box(0.08, 0.10, 0.72, 'clay', s * 1.18, 2.30, 0.10, canopy);
    box(0.06, 0.02, 0.62, 'dark', s * 1.16, 2.24, 0.10, canopy);
  }


  // ---------- triangular structural infill ----------
  // Two places were still open: the side web between hinge arm and canopy rail,
  // and the central triangular bay in the canopy underside above the pilots.
  {
    const panelMat = new THREE.MeshStandardMaterial({
      color: mats.clay.color, roughness: mats.clay.roughness ?? 0.72,
      metalness: mats.clay.metalness ?? 0.0, side: THREE.DoubleSide,
    });
    const insetMat = new THREE.MeshStandardMaterial({
      color: mats.dark.color, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide,
    });
    const tri = (a, b, c, mat, parent) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      g.setIndex([0, 1, 2]); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
    };
    const shrink = (a, b, c, k = 0.72) => {
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      return [a, b, c].map(v => [cx + (v[0] - cx) * k, cy + (v[1] - cy) * k, cz + (v[2] - cz) * k]);
    };
    const boltAt = (p, parent) => {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 8), insetMat);
      g.position.set(p[0], p[1], p[2]); g.rotation.z = Math.PI / 2; parent.add(g);
    };

    for (const s of [-1, 1]) {
      // side web: hinge arm -> longitudinal rail
      const x = s * 1.11;
      const A = [x, 2.46, -0.62], B = [x, 2.46, -0.10], C = [x, 2.70, -0.43];
      tri(A, B, C, panelMat, canopy);
      const [a2, b2, c2] = shrink(A, B, C, 0.74);
      tri(a2, b2, c2, insetMat, canopy);
      // frame edges
      tubeDetail(A, B, 0.020, 'dark', canopy);
      tubeDetail(B, C, 0.020, 'dark', canopy);
      tubeDetail(C, A, 0.020, 'dark', canopy);
      // central rib + lightening hole + bolts
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
      tubeDetail(M, C, 0.018, 'clay', canopy);
      const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.050, 0.022, 16), insetMat);
      port.position.set(cen[0] - s * 0.008, cen[1], cen[2]); port.rotation.z = Math.PI / 2; canopy.add(port);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 18), mats.chrome || mats.clay);
      ring.position.set(cen[0] - s * 0.020, cen[1], cen[2]); ring.rotation.y = Math.PI / 2; canopy.add(ring);
      for (const p of [A, B, C]) boltAt([p[0] - s * 0.012, p[1], p[2]], canopy);

    }

    // central triangular liner in the canopy underside, low enough to read from the cockpit
    const A = [-0.95, 2.39, -0.55], B = [0.95, 2.39, -0.55], C = [0, 2.39, 0.66];
    tri(A, B, C, panelMat, canopy);
    const [a2, b2, c2] = shrink(A, B, C, 0.78);
    tri([a2[0], 2.376, a2[2]], [b2[0], 2.376, b2[2]], [c2[0], 2.376, c2[2]], insetMat, canopy);
    tubeDetail(A, B, 0.020, 'dark', canopy);
    tubeDetail(B, C, 0.020, 'dark', canopy);
    tubeDetail(C, A, 0.020, 'dark', canopy);
    tubeDetail([0, 2.39, -0.55], [0, 2.39, 0.66], 0.018, 'clay', canopy);
    for (const x of [-0.44, 0.44]) tubeDetail([x, 2.39, -0.55], [x * 0.45, 2.39, 0.14], 0.014, 'dark', canopy);
    // central access hatch, overhead work light, vent grille and O2 port
    box(0.42, 0.028, 0.28, 'clay', 0, 2.374, 0.02, canopy);
    box(0.34, 0.012, 0.20, 'dark', 0, 2.386, 0.02, canopy);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.02, 0.02, 0.02, 'dark', sx * 0.17, 2.392, 0.02 + sz * 0.12, canopy);
    box(0.22, 0.018, 0.14, 'eye', 0, 2.382, -0.16, canopy);
    for (let i = 0; i < 4; i++) box(0.22, 0.010, 0.018, 'dark', 0, 2.380, 0.16 + i * 0.035, canopy);
    for (const sx of [-1, 1]) {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 12), 'chrome' in mats ? mats.chrome : mats.clay);
      port.position.set(sx * 0.36, 2.380, -0.12); port.rotation.x = Math.PI / 2; canopy.add(port);
      const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.007, 6, 16), insetMat);
      portRing.position.set(sx * 0.36, 2.374, -0.12); portRing.rotation.x = Math.PI / 2; canopy.add(portRing);
    }
    // radial structural ribs + central service ring break up the recessed panel
    const CEN = [0, 2.372, -0.10];
    for (const p of [a2, b2, c2]) tubeDetail([p[0], 2.373, p[2]], CEN, 0.012, 'clay', canopy);
    const svcRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 28), mats.chrome || mats.clay);
    svcRing.position.set(0, 2.370, -0.02); svcRing.rotation.x = Math.PI / 2; canopy.add(svcRing);
    const svcHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.020, 18), mats.dark);
    svcHub.position.set(0, 2.368, -0.02); canopy.add(svcHub);
    // warning plate and cable conduit across the rear edge
    box(0.30, 0.010, 0.07, 'clay', 0, 2.380, 0.46, canopy);
    for (let i = 0; i < 5; i++) box(0.035, 0.006, 0.05, 'dark', -0.12 + i * 0.06, 2.382, 0.46, canopy);
    tubeDetail([-0.72, 2.395, -0.52], [0.72, 2.395, -0.52], 0.014, 'dark', canopy);
  }

  const cockpitDetails = [];
  for (const [parent, n] of detailBefore) {
    for (let i = n; i < parent.children.length; i++) {
      const child = parent.children[i];
      child.userData.cockpitDetail = true;
      cockpitDetails.push(child);
    }
  }

  // ---------- canopy opening mechanism: hinge, torsion tube, actuators, inner frame ----------
  // The canopy is not a free-floating shell: it hangs on a rear torsion tube,
  // is pushed by two hydraulic cylinders per side, and carries an inner frame
  // with latches and seals. The actuator geometry is updated by setOpen().
  {
    // static torsion tube across the rear hinge axis
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.90, 24), mats.dark);
    bar.name = 'canopyTorsionTube';
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, HINGE.y, HINGE.z);
    group.add(bar);
    for (const s of [-1, 1]) {
      // body-side bearings and mounting brackets
      box(0.24, 0.28, 0.28, 'clay', s * 1.43, HINGE.y, HINGE.z, group);
      box(0.16, 0.20, 0.20, 'dark', s * 1.34, HINGE.y, HINGE.z, group);
      cylDetail(0.135, 0.20, 'dark', s * 1.43, HINGE.y, HINGE.z, [0, 0, Math.PI / 2], group, 20);
      // canopy-side hinge arms to the torsion axis
      tubeDetail([s * 0.95, HINGE.y - 0.24, -0.44], [s * 1.32, HINGE.y, HINGE.z], 0.048, 'clay', canopy);
      tubeDetail([s * 1.10, HINGE.y - 0.28, -0.54], [s * 1.34, HINGE.y, HINGE.z], 0.034, 'dark', canopy);
      box(0.14, 0.15, 0.18, 'dark', s * 1.34, HINGE.y, HINGE.z, canopy);
      cylDetail(0.10, 0.14, 'clay', s * 1.34, HINGE.y, HINGE.z, [0, 0, Math.PI / 2], canopy, 16);
    }

    // canopy inner frame: longitudinal rails, cross ribs, gussets
    for (const s of [-1, 1]) {
      box(0.05, 0.05, 1.58, 'clay', s * 0.94, 2.43, 0.16, canopy);
      box(0.035, 0.035, 1.58, 'dark', s * 1.04, 2.39, 0.16, canopy);
      box(0.07, 0.07, 0.72, 'clay', s * 1.06, 2.36, -0.22, canopy);
      box(0.10, 0.10, 0.10, 'dark', s * 0.94, 2.43, -0.58, canopy);
      box(0.10, 0.10, 0.10, 'dark', s * 0.94, 2.43, 0.82, canopy);
    }
    for (const z of [-0.56, -0.16, 0.24, 0.64]) {
      box(1.86, 0.045, 0.045, 'clay', 0, 2.44, z, canopy);
      box(1.70, 0.030, 0.030, 'dark', 0, 2.41, z, canopy);
    }
    // front latches and alignment pins
    for (const s of [-1, 1]) {
      box(0.10, 0.06, 0.18, 'clay', s * 0.72, 2.31, 1.06, canopy);
      box(0.05, 0.10, 0.05, 'dark', s * 0.72, 2.25, 1.14, canopy);
      box(0.16, 0.08, 0.10, 'clay', s * 0.72, 2.20, 1.14, group);
      box(0.08, 0.10, 0.06, 'dark', s * 0.72, 2.22, 1.18, group);
      cylDetail(0.026, 0.10, 'chrome' in mats ? mats.chrome : mats.clay, s * 0.46, 2.23, 1.10, [0, 0, 0], group, 10);
    }
    // static cockpit rim seal + latch strikes
    box(2.24, 0.030, 0.05, 'dark', 0, 2.20, 1.16, group);
    for (const s of [-1, 1]) box(0.04, 0.030, 1.24, 'dark', s * 1.10, 2.20, 0.34, group);

    // hydraulic actuators (body base -> canopy anchor), updated by setOpen
    const mkStrut = (idx, B, A, r, barrelLen) => {
      const g = new THREE.Group();
      g.name = 'canopyStrut' + idx;
      g.userData.canopyStrut = idx;
      g.userData.base = B.slice();
      g.userData.barrelLen = barrelLen;
      group.add(g);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16), mats.clay);
      barrel.name = 'canopyStrutBarrel';
      g.add(barrel);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 1, 12), mats.chrome || mats.clay);
      rod.name = 'canopyStrutRod';
      g.add(rod);
      // body-side mounting clevis
      box(0.14, 0.12, 0.10, 'dark', B[0], B[1], B[2], group);
      const eyeB = new THREE.Mesh(new THREE.TorusGeometry(r * 2.2, r * 0.55, 6, 16), mats.chrome || mats.clay);
      eyeB.position.set(B[0], B[1], B[2]); eyeB.rotation.y = Math.PI / 2; group.add(eyeB);
      // canopy-side clevis + eye
      box(0.12, 0.10, 0.08, 'dark', A[0], A[1], A[2], canopy);
      const anchor = new THREE.Object3D();
      anchor.name = 'canopyStrutAnchor' + idx;
      anchor.position.set(A[0], A[1], A[2]);
      canopy.add(anchor);
      const eyeA = new THREE.Mesh(new THREE.TorusGeometry(r * 2.0, r * 0.5, 6, 16), mats.chrome || mats.clay);
      eyeA.position.set(A[0], A[1], A[2]); eyeA.rotation.y = Math.PI / 2; canopy.add(eyeA);
    };
    // main pair + slim secondary pair per side
    mkStrut(0, [-1.25, 2.02, 0.15], [-0.95, 2.42, 0.30], 0.060, 0.40);
    mkStrut(1, [ 1.25, 2.02, 0.15], [ 0.95, 2.42, 0.30], 0.060, 0.40);
    mkStrut(2, [-1.30, 1.92, -0.25], [-1.05, 2.38, -0.05], 0.035, 0.34);
    mkStrut(3, [ 1.30, 1.92, -0.25], [ 1.05, 2.38, -0.05], 0.035, 0.34);

    // flexible cable/hose loops at the hinge
    for (const s of [-1, 1]) {
      tubeDetail([s * 1.02, 2.40, 0.30], [s * 1.12, 2.52, -0.36], 0.014, 'dark', canopy);
      tubeDetail([s * 1.08, 2.38, 0.06], [s * 1.18, 2.50, -0.50], 0.010, 'dark', canopy);
    }
    // emergency release label on the front rim
    box(0.34, 0.05, 0.03, 'clay', 0, 2.21, 1.18, group);
    box(0.24, 0.025, 0.01, 'eye', 0, 2.21, 1.20, group);
  }

  group.userData.cockpitDetails = cockpitDetails;
  group.userData.gears = gears;
  group.updateMatrixWorld(true);
  updateCanopyStruts(group);
  return { group, parts, roi: { front: [frontFull, T.podL, mirrorPoly(T.podL)], side: [sideSm] } };
}


// Keep the canopy actuators connected through the full open/close arc.
function updateCanopyStruts(root) {
  const struts = [];
  root.traverse(o => { if (o.userData && o.userData.canopyStrut !== undefined) struts.push(o); });
  if (!struts.length) return;
  root.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0);
  for (const g of struts) {
    const idx = g.userData.canopyStrut;
    const anchor = root.getObjectByName('canopyStrutAnchor' + idx);
    if (!anchor) continue;
    const A = anchor.getWorldPosition(new THREE.Vector3());
    root.worldToLocal(A);
    const B = new THREE.Vector3().fromArray(g.userData.base);
    const dir = A.clone().sub(B);
    const dist = dir.length();
    if (dist < 1e-5) continue;
    g.position.copy(B);
    g.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    const bl = Math.min(g.userData.barrelLen, dist * 0.55);
    const barrel = g.getObjectByName('canopyStrutBarrel');
    const rod = g.getObjectByName('canopyStrutRod');
    if (barrel) { barrel.scale.y = bl; barrel.position.y = bl / 2; }
    if (rod) { const rl = Math.max(0.04, dist - bl); rod.scale.y = rl; rod.position.y = bl + rl / 2; }
  }
}

// canopy motion (scheme B): unlatch + lift, then tilt about the gear axis
export const LIFT = 1.15, TILT = 40 * Math.PI / 180;
export function setOpen(root, t) {
  const pivot = root.getObjectByName('canopyPivot'); if (!pivot) return;
  const H = root.userData.hinge || pivot.userData.hinge;
  const e = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const lift = e(t / 0.4) * LIFT, ang = e((t - 0.35) / 0.65) * TILT;
  if (!pivot.userData.base) pivot.userData.base = pivot.position.clone();
  pivot.position.copy(pivot.userData.base); pivot.position.y += lift;
  pivot.rotation.x = -ang;
  root.traverse(o => {
    if (o.name === 'gear') o.rotation.x = t * Math.PI * 2.5;
    if (o.name === 'liftPost') { o.visible = lift > 0.01; o.scale.y = Math.max(0.001, lift); o.position.y = pivot.userData.base.y + lift / 2; }
  });
  updateCanopyStruts(root);
}
