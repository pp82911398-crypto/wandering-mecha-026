// Draw-call reduction for the finished machine: merge sibling leaf meshes that share a parent and a material,
// leaving alone every mesh that moves or changes on its own. "Moves on its own" is measured, not guessed:
// exercise() drives every animation (weapons out, claw spin, rotor) and any mesh whose local matrix,
// geometry or visibility changed is kept as-is. Siblings under one parent move together, so merging them
// cannot break joint animation (joints are groups; the merged mesh stays under the same group).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root, exercise, restore) {
  const snap = () => { const m = new Map(); root.traverse(o => { if (o.isMesh) m.set(o, { mat: o.matrix.clone(), geo: o.geometry, vis: o.visible }); }); return m; };
  root.updateMatrixWorld(true);
  const a = snap(); exercise(); root.updateMatrixWorld(true); const b = snap(); restore(); root.updateMatrixWorld(true);
  const dynamic = new Set();
  for (const [o, s] of a) { const t = b.get(o); if (!t || !t.mat.equals(s.mat) || t.geo !== s.geo || t.vis !== s.vis) dynamic.add(o); }

  const groups = new Map();
  root.traverse(o => {
    // matrixAutoUpdate=false: transform written straight into .matrix (rams / pistons) -> never merge
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || dynamic.has(o) || o.children.length || Array.isArray(o.material) || !o.matrixAutoUpdate) return;
    if (!o.geometry?.attributes?.position || o.morphTargetInfluences) return;
    const key = [o.parent.uuid, o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.visible, o.frustumCulled].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  // self-check: world bounds per material must be identical before and after
  const bounds = () => { const m = new Map(); root.updateMatrixWorld(true); root.traverse(o => { if (!o.isMesh || !o.visible) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld); const k = o.material.uuid; m.set(k, m.has(k) ? m.get(k).union(b) : b); }); return m; };
  const b0 = bounds();
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after += list.length; continue; }
    const hasUv = list.every(o => o.geometry.attributes.uv);
    const geos = list.map(o => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', ...(hasUv ? ['uv'] : [])].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrix);   // use the matrix as rendered (never recompose it)
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) { after += list.length; continue; }
    const f = list[0], m = new THREE.Mesh(merged, f.material);
    m.name = f.name + '·merged'; m.userData = { ...f.userData, merged: list.length };
    m.castShadow = f.castShadow; m.receiveShadow = f.receiveShadow; m.renderOrder = f.renderOrder; m.frustumCulled = f.frustumCulled;
    f.parent.add(m);
    for (const o of list) o.parent.remove(o);
    after++;
  }
  const b1 = bounds(), bad = [];
  const names = new Map(); root.traverse(o => { if (o.isMesh) names.set(o.material.uuid, o.material.name || o.material.type); });
  for (const [k, b] of b0) { const c = b1.get(k); const d = c ? Math.max(c.min.distanceTo(b.min), c.max.distanceTo(b.max)) : Infinity; if (d > 0.05) bad.push([names.get(k), +d.toFixed(3)]); }
  if (bad.length) console.warn('[mergeStatic] bounds changed', JSON.stringify(bad));
  return { before, after, dynamic: dynamic.size, boundsChanged: bad.length };
}
