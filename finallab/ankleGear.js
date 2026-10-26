// Ankle: one big axle drum through the ankle (knee-style), centred on the foot's ankle axis.
// Two-way joint -> four-way: the drum is the pitch axle (foot pitches about it, fore/aft) and the drum itself rolls
// with the foot about the fore-aft line through the ankle centre (left/right), like the cross of a universal joint.
// Yellow-orange glow accents in the two segment grooves and round the end nuts.
// Built for the finishing room where the lower legs are swapped left/right: the side that faces outward there is the
// source leg's inner side, so "outward" is -s (s = the source leg's side).
import * as THREE from 'three';
import { disc } from '../necklab/neck.js';

const V3 = THREE.Vector3, X = new V3(1, 0, 0);
export const DRUM = { r: 0.78, half: 0.96 };

function merge(list) {
  const pos = [];
  for (let g of list) { g = g.index ? g.toNonIndexed() : g; pos.push(...g.attributes.position.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals();
  return out;
}

// drum geometry in its own frame: axis along x, centred at 0, outer end on +sg
function drumMeshes(sg, mats, part) {
  const { r, half } = DRUM, at = (x) => new V3(x, 0, 0);
  const frame = [], dark = [], glow = [];
  frame.push(disc(at(0), X, r, 2 * half, 24));                                  // drum body
  for (const e of [-1, 1]) {
    const xe = e * half;
    frame.push(disc(at(xe + e * 0.05), X, 0.54, 0.1, 16));                       // end boss
    frame.push(disc(at(xe + e * 0.12), X, 0.2, 0.05, 6));                        // axle nut
    glow.push(disc(at(xe + e * 0.105), X, 0.3, 0.02, 16));                       // glow ring round the nut
    for (let k = 0; k < 8; k++) {                                                // bolt ring on the end face
      const t = (k + 0.5) * Math.PI / 4;
      frame.push(disc(new V3(xe + e * 0.02, 0.66 * Math.cos(t), 0.66 * Math.sin(t)), X, 0.055, 0.06, 6));
    }
  }
  for (const f of [-1 / 3, 1 / 3]) {
    dark.push(disc(at(f * half * 2 * 0.75), X, r + 0.02, 0.07, 24));            // segment grooves
    glow.push(disc(at(f * half * 2 * 0.75), X, r + 0.03, 0.025, 24));            // glow band inside each groove
  }
  const out = [];
  for (const [list, mat] of [[frame, mats.frame], [dark, mats.dark], [glow, mats.lamp]]) {
    const m = new THREE.Mesh(merge(list), mat); m.userData.part = part; m.userData.cn = '踝轴鼓'; out.push(m);
  }
  if (sg < 0) for (const m of out) m.scale.x = -1;   // symmetric anyway; keeps "outer end" on the outward side
  return out;
}

// srcLegs: the legs as built (ids R/L, with s, kneeG, ankleG — captured before any swap)
export function buildAnkleGears(srcLegs, mats) {
  const units = [];
  for (const L of srcLegs) {
    const sg = -L.s;
    const drum = new THREE.Group(); drum.name = `leg${L.id}.ankleDrum`; L.kneeG.add(drum);
    for (const m of drumMeshes(sg, mats, `leg${L.id}.ankleDrum`)) drum.add(m);
    units.push({ L, sg, drum });
  }
  const e = new THREE.Euler();
  const update = (visible = true) => {
    for (const u of units) {
      u.drum.visible = visible;
      u.drum.position.copy(u.L.ankleG.position);                 // centred on the foot's ankle axis
      e.setFromQuaternion(u.L.ankleG.quaternion, 'XZY');
      u.drum.rotation.set(0, 0, e.z);                             // rolls with the foot (left/right); pitch turns inside it
    }
  };
  update();
  return { units, update };
}
