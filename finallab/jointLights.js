// Ankle-style amber end rings and thin groove bands on the existing joint axles.
// Read the finished cylinders in each rigid part's own frame; the light meshes
// stay on that part, including the swapped lower legs. Five-finger hands keep
// their original unlit fingers; wrist and claw-weapon axles retain their rings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { components } from './paint.js';

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const SOURCE = /^(?:R|LF|LR)\.(?:pitch|upper|twist|elbow|forearm|palm|claw\d|hub|swing):|^leg[RL]\.(?:thigh|shin|foot|toes):|^neck(?:Clay|Dark|Yoke|YokeDark|Mount)$|^waistCore(?:Dark)?$|^thruster(?:SplayPin|HingePin|FanCap|FanAxle)/;

function cylinder(pos, tris) {
  if (tris.length < 40 || tris.length > 256) return null;
  const box = new THREE.Box3(), p = new THREE.Vector3(), pts = [];
  for (const tri of tris) for (let k = 0; k < 3; k++) {
    p.fromBufferAttribute(pos, tri * 3 + k); box.expandByPoint(p); pts.push(p.clone());
  }
  const center = box.getCenter(new THREE.Vector3());
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const lo = box.min.getComponent(axis), hi = box.max.getComponent(axis), length = hi - lo;
    const radius = Math.max(...pts.map(v => Math.hypot(v.getComponent(a) - center.getComponent(a), v.getComponent(b) - center.getComponent(b))));
    if (radius < 0.13 || radius > 1.8 || length < 0.015 || length > radius * 3.5) continue;
    const tol = Math.max(0.0001, radius * 0.002), angles = new Set();
    let valid = true;
    for (const v of pts) {
      const h = v.getComponent(axis), u = v.getComponent(a) - center.getComponent(a), w = v.getComponent(b) - center.getComponent(b), r = Math.hypot(u, w);
      // Exact, straight cylindrical parts have only two end planes and two radii
      // (centre / rim). This rejects armour, hoses, tapered rods and hex bolts.
      if (Math.min(Math.abs(h - lo), Math.abs(h - hi)) > tol || Math.min(r, Math.abs(r - radius)) > tol) { valid = false; break; }
      if (r > radius * 0.95) angles.add(Math.round(Math.atan2(w, u) * 1000));
    }
    if (valid && angles.size >= 12) return { center, axis, radius, length, lo, hi };
  }
  return null;
}

function frame(c, axial) {
  const center = c.center.clone(); center.setComponent(c.axis, axial);
  return new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromUnitVectors(AXES[2], AXES[c.axis]), new THREE.Vector3(1, 1, 1));
}

export function buildJointLights(root, mats, { enabled = true } = {}) {
  const sources = [];
  root.traverse(o => { if (o.isMesh && !o.userData.marking && SOURCE.test(o.name)) sources.push(o); });
  const meshes = [], log = [], ray = new THREE.Raycaster();
  for (const source of sources) {
    if (source.material === mats.lamp) continue;
    const src0 = source.userData.roundedFrom || source.geometry;   // 分级 R 角后按倒圆前的几何找轴（端面位置不变）
    const geo = src0.index ? src0.toNonIndexed() : src0;
    const pos = geo.attributes.position, rings = [], keys = new Set();
    let caps = 0, bands = 0;
    for (const tris of components(geo)) {
      const c = cylinder(pos, tris); if (!c) continue;
      const isDark = source.material === mats.dark;
      if (isDark && c.length < 0.095 && c.radius > 0.3) {
        // Match the ankle drum's narrow glowing circumferential grooves.
        const band = new THREE.CylinderGeometry(c.radius + 0.006, c.radius + 0.006, Math.min(0.025, c.length * 0.6), 32, 1, true);
        band.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(AXES[1], AXES[c.axis]));
        band.translate(...c.center.toArray()); rings.push(band); bands++;
        continue;
      }
      if (isDark) continue;
      for (const sign of [-1, 1]) {
        const plane = sign < 0 ? c.lo : c.hi, r = c.radius * 0.56;
        const center = c.center.clone(); center.setComponent(c.axis, plane);
        const mat = frame(c, plane + sign * 0.018);
        // A small cap inside a larger flange must not receive a floating ring.
        // Test only this rigid source: other moving armour occludes naturally.
        let exposed = 0;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, sample = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyMatrix4(mat);
          const world = source.localToWorld(sample.clone()), normal = AXES[c.axis].clone().transformDirection(source.matrixWorld).multiplyScalar(sign);
          ray.set(world.clone().addScaledVector(normal, 4), normal.clone().negate());
          const hit = ray.intersectObject(source, false)[0];
          if (hit && Math.abs(hit.distance - 4) < 0.035) exposed++;
        }
        if (exposed < 5) continue;
        const key = [c.axis, ...center.toArray().map(v => Math.round(v * 1000)), Math.round(r * 1000)].join('|');
        if (keys.has(key)) continue; keys.add(key);
        const width = Math.max(0.012, Math.min(0.045, c.radius * 0.075));
        const ring = new THREE.TorusGeometry(r, width / 2, 6, 32);
        ring.applyMatrix4(mat); rings.push(ring); caps++;
      }
    }
    if (!rings.length) continue;
    const geometry = mergeGeometries(rings.map(g => g.index ? g.toNonIndexed() : g), false);
    rings.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geometry, mats.lamp);
    mesh.name = 'jointGlow:' + source.name; mesh.userData.marking = true; mesh.userData.noRelief = true;
    mesh.userData.caps = caps; mesh.userData.bands = bands;
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {};
    mesh.visible = enabled; source.add(mesh); meshes.push(mesh);
    log.push({ source: source.name, caps, bands });
  }
  return {
    meshes, log, enabled,
    setEnabled(on) { this.enabled = Boolean(on); meshes.forEach(m => m.visible = this.enabled); },
  };
}
