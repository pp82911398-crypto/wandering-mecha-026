// Moving waist for the finishing room. torso.js is built with { liveWaist: true }, which keeps the waist core,
// side frames, abdominal plate and the side / back lames in their own meshes and only lists the 12 struts and 4 waist hoses.
//   static (pelvis side): waist core ("spine"), side frames, abdominal plate, waist lames, strut barrels on the hip pins
//   upper body          : everything above (torso, neck, head, three arms) turns about a pivot on top of the core
//                         — twist (vertical axis), bend fore/aft, side bend — like a spine
//   live                : 12 struts (barrel on the hip pin keeps its length, rod end follows the chest lug), 4 hoses
// No new parts: only the existing pieces are regrouped, so the silhouette stays the same.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { actuatorParts } from './neckRig.js';
import { TORSO } from '../torsolab/torso.js';

const V3 = THREE.Vector3;
export const WAIST = { pivot: new V3(0, -8.4, 0.1) };
const clean = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; };
const mergeL = list => mergeGeometries(list.map(clean));

// mech: root that stays put (with the legs); uppers: groups to carry (body, arms); torso: the torso group
export function buildWaistRig(mech, uppers, torso, mats) {
  const P0 = WAIST.pivot;
  const pivot = new THREE.Group(); pivot.name = 'waistPivot'; pivot.position.copy(P0); pivot.rotation.order = 'YXZ';
  const upper = new THREE.Group(); upper.name = 'waistUpper'; upper.position.copy(P0).multiplyScalar(-1); pivot.add(upper);
  mech.add(pivot);
  for (const g of uppers) upper.add(g);                       // all authored at the mech origin, so plain re-parenting keeps them in place
  const fixed = new THREE.Group(); fixed.name = 'waistFixed'; mech.add(fixed);
  // the core (with its plate and lames) takes half of the twist, like a spine sharing the turn: halves the struts' sweep past it
  const coreP = new THREE.Group(); coreP.name = 'waistCoreTwist'; coreP.position.set(P0.x, 0, P0.z);
  const coreIn = new THREE.Group(); coreIn.position.set(-P0.x, 0, -P0.z); coreP.add(coreIn); fixed.add(coreP);
  for (const n of ['waistCore', 'waistCoreDark', 'waistCoreRods', 'waistArmor']) { const m = torso.getObjectByName(n); if (m) coreIn.add(m); }

  // struts: barrel on the hip pin (fixed), rod end on the chest lug (upper body)
  const acts = [];
  for (const [i, s] of (TORSO.waistStruts || []).entries()) {
    const q = actuatorParts(s.a, s.b, s.r, { ext: s.ext });
    const bar = new THREE.Group(), end = new THREE.Group(); bar.position.copy(s.b); end.position.copy(s.a);
    const g1 = mergeL(q.barrel); g1.translate(-s.b.x, -s.b.y, -s.b.z);
    const g2 = mergeL(q.rodEnd); g2.translate(-s.a.x, -s.a.y, -s.a.z);
    const g3 = mergeL(q.rodG); g3.translate(-s.a.x, -s.a.y, -s.a.z);
    const m1 = new THREE.Mesh(g1, mats.clay); m1.name = `waistStrut${i}.act:clay`; bar.add(m1);
    const m2 = new THREE.Mesh(g2, mats.clay); m2.name = `waistStrut${i}.act:clay`; end.add(m2);
    const m3 = new THREE.Mesh(g3, mats.chrome || mats.clay); m3.name = 'waistRods'; end.add(m3);
    fixed.add(bar, end);
    acts.push({ name: 'strut' + i, a: s.a.clone(), b: s.b.clone(), dir0: q.dir, bar, end, minL: q.minL, maxL: q.maxL });
  }
  // hoses: top on the chest underside (upper body), bottom in the side frame (fixed)
  const W = [1, 0.6, 0.2, 0];
  const hoses = (TORSO.waistHoses || []).map(h => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mats.dark); m.name = 'waistHose'; fixed.add(m); return { ...h, m }; });

  const inv = new THREE.Matrix4(), q = new THREE.Quaternion();
  const toFixed = (p) => { fixed.updateMatrixWorld(true); inv.copy(fixed.matrixWorld).invert(); return p.clone().applyMatrix4(upper.matrixWorld).applyMatrix4(inv); };
  const pose = { twist: 0, bend: 0, side: 0 };
  let hoseLast = 0, hoseInit = false;
  const apply = () => {
    const R = Math.PI / 180;
    pivot.rotation.set(pose.bend * R, pose.twist * R, -pose.side * R, 'YXZ');   // + bend = lean forward, + side = lean to the mech's right
    coreP.rotation.y = pose.twist * R / 2;
    pivot.updateMatrixWorld(true);
    for (const c of acts) {
      const a = toFixed(c.a), d = new V3().subVectors(a, c.b); c.len = d.length(); d.normalize();
      q.setFromUnitVectors(c.dir0, d); c.bar.quaternion.copy(q); c.end.position.copy(a); c.end.quaternion.copy(q);
    }
    const now = performance.now();
    if (!hoseInit || now - hoseLast > 50) {                         // hoses are visual only: 20 Hz is plenty
      hoseInit = true; hoseLast = now;
      for (const h of hoses) {
        const pts = h.pts.map((p, i) => W[i] ? p.clone().lerp(toFixed(p), W[i]) : p.clone());
        h.m.geometry.dispose(); h.m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, h.r, 6);
      }
    }
  };
  apply();
  return {
    pivot, upper, fixed, core: coreIn, acts, hoses, pose,
    set(twist, bend, side) { Object.assign(pose, { twist, bend, side }); apply(); },
    stroke() { return acts.filter(c => c.len < c.minL || c.len > c.maxL).map(c => `${c.name} ${c.len.toFixed(2)} (${c.minL.toFixed(2)}..${c.maxL.toFixed(2)})`); },
  };
}
