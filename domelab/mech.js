// Airport placement adapter. The finished model itself has a single source in finallab/model.js.
import * as THREE from 'three';
import { buildFinishedModel } from '../finallab/model.js';
import { PAL } from '../finallab/paint.js';
import { applyScheme } from '../finallab/schemes.js';

export function buildMech({ scheme = 'night', wear = 0.5, rounded = true, rotorSpeed = 0 } = {}) {
  const model = buildFinishedModel({ wear, rounded, rotorSpeed });
  const { mech, body, HEAD, NR, WR, torso, A, LG, PROP, THR, ROTOR, MK, STRIPES, REACTOR, HC, JOINT_GLOW } = model;
  applyScheme(scheme, { mech, stripes: STRIPES, scene: {}, rim: {}, key: {}, renderer: {} });

  // Offset a placement group, so propulsion can keep its original model-space base height.
  const root = new THREE.Group(); root.name = 'jaeger';
  const placement = new THREE.Group(); placement.name = 'airportModelPlacement';
  root.add(placement); placement.add(mech); root.updateMatrixWorld(true);
  // Flame proxies extend below the soles even when their shader intensity is zero.
  // Place the real sole vertices on the floor, as the finishing room does.
  const soles = [];
  LG.group.traverse(o => {
    if (!o.isMesh || !/^leg[RL]\.(foot|toes)/.test(o.userData.part || '')) return;
    // Keep the original parent/local transform: static batching can replace the mesh later.
    soles.push({ positions: o.geometry.attributes.position, parent: o.parent, matrix: o.matrix.clone() });
  });
  const vertex = new THREE.Vector3(), inverse = new THREE.Matrix4(), local = new THREE.Matrix4();
  const plantFeet = () => {
    mech.updateWorldMatrix(true, true); inverse.copy(mech.matrixWorld).invert();
    let soleY = Infinity;
    for (const sole of soles) {
      local.multiplyMatrices(inverse, sole.parent.matrixWorld).multiply(sole.matrix);
      for (let i = 0; i < sole.positions.count; i++) {
        vertex.fromBufferAttribute(sole.positions, i).applyMatrix4(local); soleY = Math.min(soleY, vertex.y);
      }
    }
    if (Number.isFinite(soleY)) placement.position.y = -soleY;
    return soleY;
  };
  const soleY = plantFeet(), groundOffset = placement.position.y;
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || [].concat(o.material).every(m => m.isShaderMaterial)) return;
    o.geometry.computeBoundingBox(); bbox.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  const feet = ['R', 'L'].map(id => {
    const box = new THREE.Box3();
    LG.group.traverse(o => { if (o.isMesh && o.userData.part === `leg${id}.foot`) box.expandByObject(o); });
    return { id, box };
  });
  root.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    if (!o.userData.marking && !/^decal:/.test(o.name)) o.castShadow = true;
  });
  return { group: root, placement, plantFeet, mech, body, head: HEAD, neckGroup: NR.group, neck: NR, waist: WR,
    mats: PAL, torso, arms: A, legs: LG, prop: PROP, thr: THR, rotor: ROTOR,
    markings: MK, stripes: STRIPES, reactor: REACTOR, honeycomb: HC, jointGlow: JOINT_GLOW,
    height: bbox.max.y - bbox.min.y, bbox, feet, groundOffset, groundContact: soleY + groundOffset, paint: model.stats, scheme, model };
}
