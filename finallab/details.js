// Small hardware on the armour: intake/exhaust hoods (one shared design, after the neck-front hood), bolt rows,
// maintenance hatches. Placed like the lamps: a ray onto an armour face, local frame (r, up, n), parented to the part.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { PAL } from './paint.js';

const V = (...a) => new THREE.Vector3(...a);
const ARM = m => m === PAL.armor || m === PAL.armor2 || m === PAL.recess;

export function makeDetails(targets) {
  const ray = new THREE.Raycaster(), log = [], ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;
  const cast = (o, d) => { ray.set(o, d.clone().normalize()); return ray.intersectObjects(targets, true).find(h => h.object.visible && !h.object.userData.marking); };
  function frame(o, d, name) {
    const dir = V(...d).normalize(), hit = cast(V(...o), dir);
    if (!hit) { log.push(`× ${name} 无命中`); return null; }
    const mm = hit.object.material, mat = Array.isArray(mm) ? mm[hit.face.materialIndex ?? 0] : mm;
    if (!ARM(mat)) { log.push(`× ${name} 落在 ${hit.object.name}`); return null; }
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); if (n.dot(dir) > 0) n.negate();
    if (n.dot(dir) > -0.5) { log.push(`× ${name} 斜面`); return null; }
    let up = V(0, 1, 0).addScaledVector(n, -n.y); if (up.lengthSq() < 0.05) up = V(0, 0, 1).addScaledVector(n, -n.z); up.normalize();
    const r = new THREE.Vector3().crossVectors(up, n).normalize();
    const g = new THREE.Group(); g.name = name; g.userData.marking = true;
    g.position.copy(hit.point); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, n));
    return { g, hit };
  }
  const place = (F, name) => { F.g.traverse(o => { o.userData.marking = true; o.castShadow = o.receiveShadow = true; }); F.g.updateMatrixWorld(true); F.hit.object.attach(F.g); log.push(`✓ ${name} → ${F.hit.object.name}`); };
  const P = (x, y, z) => V(x, y, z);

  // ---- intake / exhaust hood (the neck-front design): trapezoid mouth facing down the surface, slanted cheeks,
  // roof sloping back into the plate, dark throat plate with a light rim, dark slot across the top of the throat.
  // w = mouth width at the base, h = mouth height (stand-off), L = hood length up the surface
  function vent(name, o, d, { w = 0.8, h = 0.3, L = 1.0 } = {}) {
    const F = frame(o, d, 'vent:' + name); if (!F) return;
    const wt = w * 0.78, sink = 0.1;                               // top width (slanted cheeks); base sunk into the plate
    const outer = new ConvexGeometry([P(-w / 2, 0, -sink), P(w / 2, 0, -sink), P(-wt / 2, 0, h), P(wt / 2, 0, h),
      P(-w * 0.42, L, -sink), P(w * 0.42, L, -sink), P(-w * 0.36, L, 0.0), P(w * 0.36, L, 0.0)]);
    const t = Math.max(0.045, w * 0.06), dep = L * 0.55, hb = h * (1 - dep / L);   // wall, cavity depth, roof height at the throat
    const cav = new ConvexGeometry([P(-w / 2 + t, -0.2, 0.0), P(w / 2 - t, -0.2, 0.0), P(-wt / 2 + t, -0.2, h - t), P(wt / 2 - t, -0.2, h - t),
      P(-w / 2 + t * 1.6, dep, 0.0), P(w / 2 - t * 1.6, dep, 0.0), P(-wt / 2 + t * 1.6, dep, hb - t), P(wt / 2 - t * 1.6, dep, hb - t)]);
    const A = new Brush(outer, PAL.armor2), B = new Brush(cav, PAL.armor); A.updateMatrixWorld(); B.updateMatrixWorld();
    const res = ev.evaluate(A, B, SUBTRACTION);
    const hood = new THREE.Mesh(res.geometry, res.material); hood.name = 'ventHood:' + name;
    // throat: dark plate on the cavity back wall with a rim, plus the slot near its top
    const bw = w - t * 3.2, bh = Math.max(0.05, hb - t);
    const throat = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.06, 0.02, bh - 0.05), PAL.dark); throat.name = 'ventThroat:' + name;
    throat.position.set(0, dep - 0.012, 0.02 + (bh - 0.05) / 2);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 0.03, Math.max(0.02, bh * 0.12)), PAL.dark); slot.name = 'ventSlot:' + name;
    slot.position.set(0, dep - 0.03, bh - 0.02);
    // floor: dark too, so the mouth reads as an opening
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - t * 2.2, dep, 0.02), PAL.dark); floor.name = 'ventFloor:' + name; floor.position.set(0, dep / 2 - 0.1, 0.005);
    F.g.userData.mouth = { w, wt, h, t };
    F.g.add(hood, throat, slot, floor); place(F, 'vent:' + name);
  }

  // ---- bolt row: hex heads along the surface "right" axis
  const boltG = new THREE.CylinderGeometry(0.055, 0.055, 0.1, 6); boltG.rotateX(Math.PI / 2);
  function bolts(name, o, d, n = 4, step = 0.3, along = 'r') {
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * step, oo = [...o];
      const F0 = frame(o, d, 'b'); if (!F0) { log.push(`× bolts ${name}`); return; }
      const ax = along === 'r' ? new THREE.Vector3(1, 0, 0).applyQuaternion(F0.g.quaternion) : new THREE.Vector3(0, 1, 0).applyQuaternion(F0.g.quaternion);
      const p = V(...oo).addScaledVector(ax, off), F = frame(p.toArray(), d, `bolt:${name}${i}`); if (!F) continue;
      const b = new THREE.Mesh(boltG, PAL.frame); b.name = 'bolt'; b.userData.marking = true; b.castShadow = true; b.position.z = 0.01; F.g.add(b); F.g.userData.marking = true;
      F.g.updateMatrixWorld(true); F.hit.object.attach(F.g);
    }
    log.push(`✓ bolts ${name}`);
  }

  // ---- maintenance hatch: thin inset-looking cover with a yellow pull handle and four corner bolts
  function hatch(name, o, d, w = 0.8, h = 0.6) {
    const F = frame(o, d, 'hatch:' + name); if (!F) return;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), PAL.armor2); lid.name = 'hatchLid:' + name; lid.position.z = 0.0;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.08), PAL.dark); seam.name = 'hatchSeam:' + name; seam.position.z = -0.012;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.06, 0.06), PAL.yellow); grip.name = 'hatchGrip:' + name; grip.position.set(0, -h * 0.25, 0.08);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), PAL.yellow); post.position.set(sx * w * 0.2, -h * 0.25, 0.05); F.g.add(post); }
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const b = new THREE.Mesh(boltG, PAL.frame); b.scale.setScalar(0.7); b.position.set(sx * (w / 2 - 0.08), sy * (h / 2 - 0.08), 0.05); F.g.add(b); }
    F.g.add(seam, lid, grip); place(F, 'hatch:' + name);
  }

  // ---------- placement ----------
  const sym = (fn, name, o, d, ...rest) => { fn(name + 'R', o, d, ...rest); fn(name + 'L', [-o[0], o[1], o[2]], [-d[0], d[1], d[2]], ...rest); };
  sym(vent, 'back', [3.2, -4.6, -30], [0, 0, 1], { w: 0.9, h: 0.32, L: 1.0 });
  sym(vent, 'thigh', [4.95, -21.1, 0.75], [-1, 0, 0], { w: 0.7, h: 0.26, L: 0.85 });
  sym(vent, 'calf', [3.6, -30.2, -30], [0, 0, 1], { w: 0.5, h: 0.2, L: 0.7 });
  sym(vent, 'chestLow', [2.6, -6.0, 30], [0, 0, -1], { w: 0.75, h: 0.26, L: 0.8 });
  sym(bolts, 'thighTop', [2.95, -14.6, 30], [0, 0, -1], 4, 0.28);
  sym(bolts, 'shinTop', [2.75, -25.2, 30], [0, 0, -1], 3, 0.28);
  hatch('foreR', [30, -11.4, 1.8], [-1, 0, 0], 0.6, 0.5);
  hatch('foreLF', [-30, -12.0, 2.7], [1, 0, 0], 0.6, 0.5);
  sym(hatch, 'shinOut', [30, -30.0, 0.4], [-1, 0, 0], 0.6, 0.55);
  return { log };
}
