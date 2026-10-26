// Static environment batching. The dome's scenery is built in metres from many small Batch groups; merging
// every opaque, non-animated mesh by material into one draw call each cuts the per-object CPU cost without
// touching the machine or anything that moves. Animated roots are excluded explicitly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStaticEnv(scene, { exclude = [], excludeNames = [] } = {}) {
  const roots = new Set(exclude.filter(Boolean));
  const names = new Set(excludeNames);
  const blocked = o => {
    for (let p = o; p; p = p.parent) {
      if (roots.has(p)) return true;
      if (p !== o && p.name && names.has(p.name)) return true;
    }
    return false;
  };
  const candidates = [];
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length) return;
    if (!o.visible || !o.matrixAutoUpdate || blocked(o)) return;
    if (Array.isArray(o.material) || !o.material || o.material.transparent) return;
    if (o.material.type !== 'MeshStandardMaterial' || !o.geometry?.attributes?.position) return;
    if (o.userData.marking || /^decal/.test(o.name)) return;
    candidates.push(o);
  });

  const groups = new Map();
  for (const o of candidates) {
    const k = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const merged = new THREE.Group(); merged.name = 'staticEnvMerged';
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after += list.length; continue; }
    const hasUv = list.every(o => o.geometry.attributes.uv);
    const geos = [];
    for (const o of list) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', ...(hasUv ? ['uv'] : [])].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    if (!geo) { after += list.length; continue; }
    const f = list[0];
    const mesh = new THREE.Mesh(geo, f.material);
    mesh.name = (f.name || 'static') + '·merged';
    mesh.castShadow = f.castShadow; mesh.receiveShadow = f.receiveShadow; mesh.renderOrder = f.renderOrder;
    mesh.matrixAutoUpdate = false;
    merged.add(mesh);
    for (const o of list) o.parent.remove(o);
    after++;
  }
  scene.add(merged);
  return { before, after, merged: before - after, meshes: after };
}

// Merge the static children of one animated root into root-local meshes. Nested roots that move on their own
// (lift cages, gates, wheels, rotor blades, ...) are skipped and processed separately, so every animation keeps
// its own transform. Geometry is baked into the root's space, which keeps texture scale in metres.
export function mergeRigid(root, nested = []) {
  if (!root) return { before: 0, after: 0, merged: 0 };
  root.updateMatrixWorld(true);
  const skip = new Set(nested.filter(Boolean));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const list = [];
  const walk = o => {
    if (skip.has(o)) return;
    if (o.isMesh) {
      if (o.children.length || !o.matrixAutoUpdate || o.isInstancedMesh || o.isSkinnedMesh) return;
      if (Array.isArray(o.material) || !o.material || o.material.transparent) return;
      if (o.material.type !== 'MeshStandardMaterial' || !o.geometry?.attributes?.position) return;
      if (o.userData.marking || /^decal/.test(o.name)) return;
      list.push(o); return;
    }
    for (const c of o.children) walk(c);
  };
  for (const c of root.children) walk(c);
  const groups = new Map();
  for (const o of list) {
    const k = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const rel = new THREE.Matrix4();
  let before = 0, after = 0;
  for (const arr of groups.values()) {
    before += arr.length;
    if (arr.length < 2) { after += arr.length; continue; }
    const hasUv = arr.every(o => o.geometry.attributes.uv);
    const geos = [];
    for (const o of arr) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', ...(hasUv ? ['uv'] : [])].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.normal) g.computeVertexNormals();
      rel.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(rel);
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    if (!geo) { after += arr.length; continue; }
    const f = arr[0], mesh = new THREE.Mesh(geo, f.material);
    mesh.name = (root.name || 'rigid') + '·static';
    mesh.castShadow = f.castShadow; mesh.receiveShadow = f.receiveShadow; mesh.renderOrder = f.renderOrder;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const o of arr) o.parent.remove(o);
    after++;
  }
  return { before, after, merged: before - after };
}
