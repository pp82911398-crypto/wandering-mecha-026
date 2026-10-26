// 026 paint scheme. Builders only know 5 lab materials (clay/dark/eye/chrome/glow) and often merge armour plates and
// joint hardware into one 'clay' mesh. Here every merged mesh is split into its loose parts (connected components)
// and each part is classified by shape: cylinders/discs (hubs, drums, flanges) and box lugs -> gunmetal joint hardware,
// everything else (hull plates, rings, lames) -> light grey armour. Source files stay untouched.
import * as THREE from 'three';

const std = (o) => new THREE.MeshStandardMaterial(o);
export const PAL = {
  armor:  std({ color: 0xd2d5d8, metalness: 0.25, roughness: 0.45, name: 'armor' }),        // light cool grey-white
  armor2: std({ color: 0xb3b8bc, metalness: 0.3, roughness: 0.48, name: 'armor2' }),        // slightly darker secondary plates
  recess: std({ color: 0x858b90, metalness: 0.35, roughness: 0.55, name: 'recess' }),       // floors/walls of cut-in panels
  frame:  std({ color: 0x50565c, metalness: 0.55, roughness: 0.45, name: 'frame' }),         // gunmetal joints / frames
  dark:   std({ color: 0x1d2024, metalness: 0.45, roughness: 0.62, name: 'dark', side: THREE.DoubleSide }), // seams, insets, hoses, throats
  chrome: std({ color: 0xaeb3b8, metalness: 1.0, roughness: 0.26, name: 'chrome' }),        // ram rods
  glass:  std({ color: 0x15171a, metalness: 0.6, roughness: 0.12, name: 'glass', side: THREE.DoubleSide }),
  lamp:   std({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 3.2, roughness: 0.4, name: 'lamp' }),       // yellow-orange running lights
  visor:  std({ color: 0xffb04a, emissive: 0xff8a10, emissiveIntensity: 2.6, roughness: 0.25, name: 'visor', side: THREE.DoubleSide }),
  core:   std({ color: 0xffc070, emissive: 0xff9020, emissiveIntensity: 3.0, roughness: 0.3, name: 'core' }),
  red:    std({ color: 0xa3201b, metalness: 0.35, roughness: 0.5, name: 'red' }),
  yellow: std({ color: 0xd9a514, metalness: 0.3, roughness: 0.5, name: 'yellow' }),
};

// ---- loose-part split ----
export function components(g) {
  const pos = g.attributes.position, nT = pos.count / 3, key = new Map(), par = new Int32Array(nT).map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const i = 3 * t + k, h = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    const o = key.get(h); if (o === undefined) key.set(h, t); else { const a = find(o), b = find(t); if (a !== b) par[a] = b; }
  }
  const groups = new Map(); for (let t = 0; t < nT; t++) { const r = find(t); let l = groups.get(r); if (!l) groups.set(r, l = []); l.push(t); }
  return [...groups.values()];
}

// is this loose part joint hardware? (cylinder/disc around one of the axes, or an axis-aligned box lug)
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
function isHardware(pos, nor, tris) {
  const v = new THREE.Vector3(), bb = new THREE.Box3();
  for (const t of tris) for (let k = 0; k < 3; k++) bb.expandByPoint(v.fromBufferAttribute(pos, 3 * t + k));
  const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  const nV = tris.length * 3;
  // box: every face normal along one of three mutually orthogonal directions (any orientation)
  if (tris.length <= 12) {
    const dirs = [];
    const fn = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    let box = true;
    for (const t of tris) {
      a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); cc.fromBufferAttribute(pos, 3 * t + 2);
      fn.subVectors(cc, b).cross(a.clone().sub(b)).normalize();
      let m = dirs.find(d => Math.abs(d.dot(fn)) > 0.999);
      if (!m) { if (dirs.some(d => Math.abs(d.dot(fn)) > 0.01)) { box = false; break; } dirs.push(fn.clone()); }
    }
    if (box && dirs.length === 3) { const s = [sz.x, sz.y, sz.z].sort((p, q) => p - q); return s[0] > 0.18; }  // thin strips stay armour-coloured
    return false;
  }
  // cylinder/disc: many vertices sit on one radius around an axis through the bbox centre
  if (nV < 48) return false;
  for (const ax of AX) {
    const rs = [], ang = [];
    const e1 = Math.abs(ax.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = e1.clone().addScaledVector(ax, -e1.dot(ax)).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
    for (const t of tris) for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, 3 * t + k).sub(c); const p = v.clone().addScaledVector(ax, -v.dot(ax));
      rs.push(p.length()); ang.push(Math.atan2(p.dot(w), p.dot(u)));
    }
    const R = Math.max(...rs); if (R < 0.05) continue;
    // lathe profile: radii on a few circles AND the outer circle goes all the way round (extruded plates don't)
    const bins = new Map(); for (const r of rs) { const k = Math.round(r / R * 60); bins.set(k, (bins.get(k) || 0) + 1); }
    const top = [...bins.values()].sort((p, q) => q - p).slice(0, 4).reduce((p, q) => p + q, 0);
    if (top / rs.length < 0.85) continue;
    const seen = new Set(); rs.forEach((r, i) => { if (r > R * 0.97) seen.add(Math.floor((ang[i] + Math.PI) / (2 * Math.PI) * 36)); });
    if (seen.size >= 24) return true;
  }
  return false;
}

// split a mesh's geometry into [armour, hardware] groups (reorders triangles, keeps name/transform)
function splitMesh(m) {
  let g = m.geometry; if (g.index) g = g.toNonIndexed();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const comps = components(g), hw = [], ar = [];
  for (const c of comps) (isHardware(pos, nor, c) ? hw : ar).push(...c);
  if (!hw.length) return 0;
  const out = new THREE.BufferGeometry(), order = [...ar, ...hw];
  for (const [name, attr] of Object.entries(g.attributes)) {
    const n = attr.itemSize, src = attr.array, dst = new src.constructor(order.length * 3 * n);
    order.forEach((t, j) => { for (let k = 0; k < 3 * n; k++) dst[j * 3 * n + k] = src[t * 3 * n + k]; });
    out.setAttribute(name, new THREE.BufferAttribute(dst, n));
  }
  out.addGroup(0, ar.length * 3, 0); out.addGroup(ar.length * 3, hw.length * 3, 1);
  m.geometry = out;
  return hw.length;
}

// names whose whole mesh is armour (big CSG shells) — no split, no hardware
const SHELL = /^(chest|pauldron|paulCap|backPlates|thruster-?\d|waistArmor|rearShell|cap|crest|lip|cheeks|back|nose|mouth|lowerLid|pods|podPanels|sensorFrame)/;
// clay meshes painted gunmetal whole
const FRAME = /(ramHip|ramKnee|ramAnkle).*:(barrel|eye)|:(barrel)$|\.act:clay|\.hub:clay|neckRods/;
// secondary (darker) armour tone
const ARMOR2 = /\.uaArmor|paulCap|thruster|\.slat|waistArmor|shin:clay|toes:clay/;

export function paint(root, labMats) {
  const role = new Map([[labMats.clay, 'clay'], [labMats.dark, 'dark'], [labMats.eye, 'eye'], [labMats.chrome, 'chrome'], [labMats.glow, 'glow']]);
  const stats = { split: 0, hwTris: 0, meshes: 0 };
  root.traverse(m => {
    if (!m.isMesh || Array.isArray(m.material)) return;
    stats.meshes++;
    let r = role.get(m.material);
    const n = m.name || '';
    if (!r) {  // head infill panels own their materials: map by colour
      r = m.material.color && m.material.color.getHex() === labMats.dark.color.getHex() ? 'dark' : 'clay';
    }
    if (r === 'dark') { m.material = /exhaustThroat|visor|eyeBack/.test(n) ? PAL.dark : PAL.dark; return; }
    if (r === 'chrome') { m.material = PAL.chrome; return; }
    if (r === 'glow') { m.material = PAL.lamp; return; }
    if (r === 'eye') { m.material = n === 'eye' ? PAL.visor : n === 'matrixLight' ? PAL.core : PAL.glass; return; }
    // clay
    if (FRAME.test(n)) { m.material = PAL.frame; return; }
    const base = ARMOR2.test(n) ? PAL.armor2 : PAL.armor;
    if (SHELL.test(n)) { m.material = base; return; }
    const k = splitMesh(m);
    if (k) { m.material = [base, PAL.frame]; stats.split++; stats.hwTris += k; } else m.material = base;
  });
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return stats;
}
