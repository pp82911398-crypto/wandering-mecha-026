// Small shape tweaks requested at the finishing stage (applied here so the approved part files stay untouched).
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { PAL } from './paint.js';

export function applyTweaks(root) {
  const log = [], ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;

  // 1) crotch: the front/back V plates ended in a sharp point at y -16. Cut flat from y -15.3 down (a narrow flat
  //    bottom edge, still a tapering trapezoid - not squared off). Only the middle band |x| < 1.3 is touched.
  {
    const m = root.getObjectByName('pelvis:clay');
    if (m) {
      m.updateMatrixWorld(true);
      const box = new THREE.BoxGeometry(2.6, 2.0, 6.0); box.translate(0, -15.3 - 1.0, 0);
      box.applyMatrix4(m.matrixWorld.clone().invert());                       // into the mesh's local space
      const A = new Brush(m.geometry, m.material), B = new Brush(box, PAL.armor2); A.updateMatrixWorld(); B.updateMatrixWorld();
      const r = ev.evaluate(A, B, SUBTRACTION); m.geometry = r.geometry; m.material = r.material;
      log.push('✓ 胯部尖角切平 y -15.3');
    }
  }

  // 2) eye lens: a touch taller downward (top edge fixed under the brow), so the lit band shows a bit wider
  {
    const m = root.getObjectByName('eye');
    if (m) {
      const g = m.geometry; g.computeBoundingBox(); const top = g.boundingBox.max.y;
      g.translate(0, -top, 0); g.scale(1, 1.12, 1); g.translate(0, top, 0); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      log.push('✓ 镜片向下加高 12%');
    }
  }
  return log;
}

// forehead: the square emergency-panel frame + floor + its little icon are hidden (the helmet shell continues
// underneath), and an inverted blue lit triangle with a dark bezel is laid onto the shell there as a decal
// (follows the forehead facets, parented to the shell so it opens with the canopy).
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
export function foreheadTriangle(root) {
  const cap = root.getObjectByName('cap'); if (!cap) return '× 没找到头盔外壳';
  const hide = [];
  root.traverse(o => { if (!o.isMesh || o.userData.marking) return;
    if (o.name === 'nose' || o.name === 'noseFloor') hide.push(o);
    else if (!o.name) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); if (Math.abs(c.x) < 0.2 && c.y > 2.0 && c.y < 2.45 && c.z > 1.9) hide.push(o); } });
  hide.forEach(o => o.visible = false);
  // styles: lit inverted triangle in one of four colours, or the original unlit square panel
  const W = 256, cv = () => { const c = document.createElement('canvas'); c.width = c.height = W; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, x: c.getContext('2d'), t }; };
  const A = cv(), E = cv();
  const tri = (x, inset) => { x.beginPath(); x.moveTo(inset * 1.7, W * 0.08 + inset); x.lineTo(W - inset * 1.7, W * 0.08 + inset); x.lineTo(W / 2, W * 0.92 - inset * 1.9); x.closePath(); };
  const draw = ([hi, lo]) => {
    A.x.clearRect(0, 0, W, W); A.x.fillStyle = '#0d0f12'; tri(A.x, 0); A.x.fill();
    let g = A.x.createLinearGradient(0, 0, 0, W); g.addColorStop(0, hi); g.addColorStop(1, lo); A.x.fillStyle = g; tri(A.x, 22); A.x.fill();
    E.x.fillStyle = '#000'; E.x.fillRect(0, 0, W, W); g = E.x.createLinearGradient(0, 0, 0, W); g.addColorStop(0, hi); g.addColorStop(1, lo); E.x.fillStyle = g; tri(E.x, 22); E.x.fill();
    A.t.needsUpdate = E.t.needsUpdate = true; };
  const mat = new THREE.MeshStandardMaterial({ map: A.t, emissiveMap: E.t, emissive: 0xffffff, emissiveIntensity: 1.1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.3, name: 'foreheadTriangle' });
  cap.updateMatrixWorld(true);
  const g = new DecalGeometry(cap, new THREE.Vector3(0, 2.24, 2.0), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.4, 0.4, 0.6));
  const m = new THREE.Mesh(g, mat); m.name = 'foreheadTriangle'; m.userData.marking = true; m.renderOrder = 3;
  root.add(m); m.updateMatrixWorld(true); cap.attach(m);
  const COLORS = { blue: ['#9fd4ff', '#2f8cff'], red: ['#ff9a8a', '#e3261b'], green: ['#a8ffb8', '#1fcf5a'], purple: ['#d9b0ff', '#8a3dff'] };
  const set = (style) => {
    const sq = style === 'square';
    hide.forEach(o => o.visible = sq); m.visible = !sq;
    if (!sq) draw(COLORS[style] || COLORS.blue);
  };
  set('blue');
  return { set, styles: { blue: '蓝色倒三角', red: '红色倒三角', green: '绿色倒三角', purple: '紫色倒三角', square: '原方块（不发光）' }, log: `✓ 额头标志（可隐藏 ${hide.length} 件，贴花三角面 ${g.attributes.position.count / 3}）` };
}
