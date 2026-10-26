// Surface-mounted running lights and markings. Every item is placed by a ray onto the body, oriented to the hit face,
// half-buried in the plate, and parented to the part it landed on (so it follows arm/leg poses).
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { PAL } from './paint.js';

const V = (...a) => new THREE.Vector3(...a);
const materialAt = h => Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex ?? 0] : h.object.material;
const isArmorHit = (h) => {
  const mat = materialAt(h);
  return mat === PAL.armor || mat === PAL.armor2 || mat === PAL.recess;
};

// frame on the hit: n = outward normal, u = along-surface "up" (world y projected; z if the face is horizontal)
function frameAt(h, dir) {
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
  if (n.dot(dir) > 0) n.negate();
  let up = V(0, 1, 0).addScaledVector(n, -n.y);
  if (up.lengthSq() < 0.05) up = V(0, 0, 1).addScaledVector(n, -n.z);
  up.normalize();
  const r = new THREE.Vector3().crossVectors(up, n).normalize();
  return { n, up, r, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, n)) };
}

// marking ink colours (set by the paint scheme, then redrawMarks())
export const INK = { stripe: '#b3261c', num: '#a8231c', tagBar: '#a8231c', tagText: '#26292d', hazA: '#d9a514', hazB: '#1d2024' };
const DRAWS = [];
export const redrawMarks = () => DRAWS.forEach(f => f());

export function makeMarkings(targets) {
  const ray = new THREE.Raycaster(), log = [];
  const items = new THREE.Group(); items.name = 'markings';
  const cast = (o, d) => { ray.set(o, d.clone().normalize()); return ray.intersectObjects(targets, true).find(h => h.object.visible && !h.object.userData.marking); };

  // lamp: dark bezel + lit lens, w x h on the surface
  const bezelG = new THREE.BoxGeometry(1, 1, 1), lensG = new THREE.BoxGeometry(1, 1, 1);
  function lamp(name, o, d, w = 0.34, h = 0.11, accept = isArmorHit) {
    const hit = cast(V(...o), V(...d));
    if (!hit || !accept(hit)) { log.push(`× ${name} ${hit ? hit.object.name : '无命中'}`); return null; }
    const dir = V(...d).normalize(), F = frameAt(hit, dir);
    if (F.n.dot(dir) > -0.35) { log.push(`× ${name} 斜面 ${hit.object.name}`); return null; }
    const g = new THREE.Group(); g.name = 'lamp:' + name; g.userData.marking = true;
    const bz = new THREE.Mesh(bezelG, PAL.dark); bz.scale.set(w + 0.1, h + 0.08, 0.12); bz.position.z = 0.0;   // half buried
    const ln = new THREE.Mesh(lensG, PAL.lamp); ln.scale.set(w, h, 0.12); ln.position.z = 0.012;
    bz.name = 'lampBezel:' + name; ln.name = 'runningLight:' + name; bz.userData.marking = ln.userData.marking = true;
    g.add(bz, ln); g.position.copy(hit.point); g.quaternion.copy(F.q);
    items.add(g); g.updateMatrixWorld(true); hit.object.attach(g);
    log.push(`✓ ${name} → ${hit.object.name}`); return g;
  }
  const sym = (name, o, d, w, h) => { lamp(name + 'R', o, d, w, h); lamp(name + 'L', [-o[0], o[1], o[2]], [-d[0], d[1], d[2]], w, h); };

  // ---------- running lights (yellow-orange) ----------
  const F = [0, 0, -1], B = [0, 0, 1];
  sym('chestUpper', [1.65, -3.4, 30], F, 0.42, 0.1);
  sym('chestSide', [3.1, -6.9, 30], F, 0.3, 0.1);
  sym('pelvis', [1.05, -12.7, 30], F, 0.3, 0.09);
  sym('thighFront', [2.95, -15.6, 30], F, 0.4, 0.11);
  sym('thighLow', [3.25, -20.3, 30], F, 0.26, 0.1);
  sym('knee', [2.85, -23.2, 30], F, 0.3, 0.11);
  sym('shin', [2.75, -26.6, 30], F, 0.42, 0.11);
  sym('shinLow', [3.25, -30.4, 30], F, 0.26, 0.1);
  sym('boot', [2.95, -35.25, 30], F, 0.3, 0.08);
  sym('thighOut', [4.95, -16.25, -0.9], [-1, 0, 0], 0.36, 0.11);
  sym('shinOut', [30, -28.0, 0.3], [-1, 0, 0], 0.36, 0.11);
  sym('backUp', [2.6, -2.5, -30], B, 0.34, 0.1);
  sym('backLow', [2.9, -7.0, -30], B, 0.3, 0.1);
  // Small paired emitters follow the vertebrae, clear of the central piston.
  // They share PAL.lamp so the existing global light control dims them too.
  const spineSurface = h => isArmorHit(h) || (h.object.name === 'torsoClay' && materialAt(h) === PAL.frame);
  for (let i = 0; i < 8; i++) {
    const y = i < 6 ? 1.2 - i * 0.95 : -4.9 - (i - 6) * 1.35;
    for (const s of [-1, 1]) {
      const g = lamp(`backSpine${i}${s > 0 ? 'R' : 'L'}`, [s * 0.27, y, -30], B, 0.085, 0.20, spineSurface);
      if (g) g.rotateZ(s * 0.12);
    }
  }
  // Narrow status slots beside the two intake grilles; the dark openings stay clear.
  for (const [i, y] of [1.6, 0.2].entries()) {
    sym('backIntake' + i, [1.73, y, -30], B, 0.065, 0.30);
  }
  sym('calf', [3.65, -27.0, -30], B, 0.34, 0.1);
  sym('heel', [2.9, -34.9, -30], B, 0.26, 0.08);
  // shoulders / arms (asymmetric)
  lamp('paulR', [30, -2.6, 1.0], [-1, 0, 0], 0.5, 0.12);
  lamp('paulLF', [-30, -2.6, 1.2], [1, 0, 0], 0.5, 0.12);
  lamp('paulFrontR', [6.1, -2.05, 30], F, 0.36, 0.1);
  lamp('paulFrontL', [-7.1, -2.15, 30], F, 0.36, 0.1);
  for (const [nm, y] of [['upperArm', -7.5], ['foreArm', -12.6], ['foreArm2', -14.2]]) {
    lamp(nm + 'R', [30, y, 1.5], [-1, 0, 0], 0.3, 0.1);
    if (nm === 'upperArm') lamp(nm + 'LF', [-30, y, 2.2], [1, 0, 0], 0.3, 0.1);
  }

  // ---------- painted markings (decals) ----------
  // canvases are kept so a paint scheme can redraw them in its own ink colours (INK, redrawMarks)
  const tex = (draw, w = 512, h = 256) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const redraw = () => { x.clearRect(0, 0, w, h); draw(x, w, h); t.needsUpdate = true; }; redraw(); DRAWS.push(redraw); return t; };
  const decalMat = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, metalness: 0.3, roughness: 0.55 });
  const num = decalMat(tex((x, w, h) => {
    x.fillStyle = INK.num; x.font = '900 220px "Arial Black","Helvetica Neue",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(w / 2, h / 2 + 8); x.transform(1, 0, -0.12, 1, 0, 0); x.fillText('026', 0, 0); x.restore();
  }));
  const tag = decalMat(tex((x, w, h) => {
    x.fillStyle = INK.tagBar; x.fillRect(0, 0, 54, h); x.fillStyle = INK.tagText; x.font = '700 64px "Helvetica Neue",Arial,sans-serif'; x.textBaseline = 'middle';
    x.fillText('026', 74, h * 0.34); x.font = '500 36px "Helvetica Neue",Arial,sans-serif'; x.fillText('MK-I  HEAVY FRAME', 74, h * 0.72);
  }));
  const haz = decalMat(tex((x, w, h) => {
    x.fillStyle = INK.hazA; x.fillRect(0, 0, w, h); x.fillStyle = INK.hazB;
    for (let i = -h; i < w; i += 64) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 32, h); x.lineTo(i + 32 + h, 0); x.lineTo(i + h, 0); x.fill(); }
  }, 512, 96));
  // red ID bar with a raked end (shown by schemes that use it: decal names start with 红条)
  const stripe = decalMat(tex((x, w, h) => { x.fillStyle = INK.stripe; x.beginPath(); x.moveTo(0, 0); x.lineTo(w - h, 0); x.lineTo(w, h); x.lineTo(0, h); x.fill(); }, 512, 64));
  function decal(name, o, d, sx, sy, mat) {
    const hit = cast(V(...o), V(...d));
    if (!hit || !isArmorHit(hit)) { log.push(`× 标记 ${name} ${hit ? hit.object.name : '无命中'}`); return; }
    const F = frameAt(hit, V(...d).normalize()), e = new THREE.Euler().setFromQuaternion(F.q);
    // project onto every armour part the decal box touches (panels split into slats would otherwise clip the number);
    // each piece is parented to its own part so it follows that part when the arm moves
    const R = Math.hypot(sx, sy) / 2 + 0.3, sphere = new THREE.Sphere(hit.point, R), parts = [];
    for (const t of targets) t.traverse(o => {
      if (!o.isMesh || o.userData.marking || !o.visible) return;
      const mm = Array.isArray(o.material) ? o.material : [o.material];
      if (!mm.some(x => x === PAL.armor || x === PAL.armor2)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld).intersectsSphere(sphere)) parts.push(o);
    });
    const names = [];
    for (const o of parts) {
      const g = new DecalGeometry(o, hit.point, e, V(sx, sy, 0.45));
      if (!g.attributes.position.count) continue;
      const m = new THREE.Mesh(g, mat); m.name = 'decal:' + name; m.userData.marking = true; m.renderOrder = 2; m.receiveShadow = true;
      items.add(m); m.updateMatrixWorld(true); o.attach(m); names.push(o.name);
    }
    log.push(names.length ? `✓ 标记 ${name} → ${names.join(', ')}` : `× 标记 ${name} 空`);
  }
  decal('026 右肩', [30, -3.6, 0.35], [-1, 0, 0], 2.2, 1.1, num);
  decal('026 左肩', [-30, -3.6, 0.75], [1, 0, 0], 2.4, 1.2, num);
  decal('铭牌 胸', [-2.3, -4.0, 30], F, 1.3, 0.65, tag);
  decal('警示 右踝', [30, -34.65, -0.6], [-1, 0, 0], 1.2, 0.2, haz);
  decal('警示 左踝', [-30, -34.65, -0.6], [1, 0, 0], 1.2, 0.2, haz);
  decal('红条 右大腿', [2.95, -17.7, 30], F, 0.95, 0.16, stripe);
  decal('红条 左大腿', [-2.95, -17.7, 30], F, 0.95, 0.16, stripe);
  decal('红条 右小腿', [2.75, -28.5, 30], F, 0.85, 0.14, stripe);
  decal('红条 左小腿', [-2.75, -28.5, 30], F, 0.85, 0.14, stripe);
  decal('红条 右上臂', [30, -8.7, 1.5], [-1, 0, 0], 0.75, 0.13, stripe);
  decal('红条 左上臂', [-30, -8.7, 2.2], [1, 0, 0], 0.75, 0.13, stripe);
  decal('026 右腿', [4.95, -19.0, 0.3], [-1, 0, 0], 1.4, 0.7, num);
  decal('026 左腿', [-4.95, -19.0, 0.3], [1, 0, 0], 1.4, 0.7, num);

  return { items, log };
}
