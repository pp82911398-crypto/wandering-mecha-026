// Finish-stage leg alignment. Keep the hip and foot at their existing stance
// width, bring the knee onto that same x axis, and carry the frame, joint seats
// and every hydraulic/hose attachment through the same rest-space correction.
import * as THREE from 'three';
import { LEG } from '../leglab/leg.js';

export function alignLegAxes(LG) {
  if (LG.alignment) return LG.alignment;
  const kneeShift = LEG.hip.x - LEG.knee.x;
  // Flat zones cover the complete round hip/knee/ankle housings: their cylinders
  // remain round. Only the long frame/armour between joint seats changes slope.
  const shiftAt = y => {
    if (y >= -14.7 || y <= -31.8) return 0;
    if (y > -22.5) return kneeShift * (-14.7 - y) / 7.8;
    if (y >= -24.7) return kneeShift;
    return kneeShift * (y + 31.8) / 7.1;
  };
  LG.group.updateMatrixWorld(true);
  const report = [];
  for (const leg of Object.values(LG.legs)) {
    const move = p => { p.x += leg.s * shiftAt(p.y); return p; };
    const bones = [leg.hipG, leg.kneeG, leg.ankleG, leg.toeG];
    const origins = bones.map(g => move(g.getWorldPosition(new THREE.Vector3())));
    const parts = [];
    leg.hipG.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const pos = mesh.geometry.attributes.position, points = [];
      for (let i = 0; i < pos.count; i++) points.push(move(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)));
      parts.push({ mesh, points });
    });
    const links = [...leg.rams, ...leg.hoses];
    const anchors = links.flatMap(link => ['A', 'B'].map(side => ({
      link, side, owner: link['obj' + side],
      point: move(link['obj' + side].localToWorld(link['p' + side].clone())),
    })));
    bones.forEach((bone, i) => {
      bone.position.copy(bone.parent.worldToLocal(origins[i].clone()));
      bone.updateMatrixWorld(true);
    });
    for (const { mesh, points } of parts) {
      const geometry = mesh.geometry.clone(), pos = geometry.attributes.position;
      const inverse = mesh.matrixWorld.clone().invert();
      points.forEach((p, i) => { p.applyMatrix4(inverse); pos.setXYZ(i, p.x, p.y, p.z); });
      pos.needsUpdate = true; geometry.computeVertexNormals();
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      mesh.geometry.dispose(); mesh.geometry = geometry;
    }
    for (const { link, side, owner, point } of anchors) link['p' + side].copy(owner.worldToLocal(point));
    links.forEach(link => link.update());
    report.push({ leg: leg.id, hip: origins[0].toArray(), knee: origins[1].toArray(), ankle: origins[2].toArray() });
  }
  LG.group.updateMatrixWorld(true);
  LG.alignment = report;
  return report;
}
