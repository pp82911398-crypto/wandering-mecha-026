// 悬空黑线修复：黑色接缝条/刻线（dark 材质的细长方条）原本按坐标手放，护甲后来改过形状、倒过 R 角、切过下沉面板，
// 有些整条浮在空中、有些两端翘出表面。这里把"有一部分露在空气里"的细条重建成一条贴面的带子：
// 沿长度每 0.1 取一个截面，截面两角分别从外向内投到最外层护甲表面，带子中心面贴在表面（一半埋入、一半凸出），
// 所以能跟着曲面、折面、R 角走。完全埋在护甲里的细条不动（不会多出新的黑线）。
// 只在建模时做一次；带子仍在原网格、原父级里，随零件一起动。
import * as THREE from 'three';
import { components } from './paint.js';

const V3 = THREE.Vector3;
const mats = m => (Array.isArray(m.material) ? m.material : [m.material]);
const isDark = m => mats(m).some(x => x && x.name === 'dark');
const isSolid = m => mats(m).some(x => x && /^(armor|armor2|recess|frame|red|yellow)$/.test(x.name));
const AX = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];

export function snapSeams(root, { skip = () => false, step = 0.1 } = {}) {
  root.updateMatrixWorld(true);
  const log = [], ray = new THREE.Raycaster();
  const targets = []; root.traverse(m => { if (m.isMesh && !m.userData.marking && isDark(m) && !skip(m) && !m.geometry.groups.length) targets.push(m); });
  for (const m of targets) {
    const probes = [];   // surfaces the strip may rest on: solid meshes of the same rigid part
    m.parent.children.forEach(o => { if (o !== m && o.isMesh && !o.userData.marking && isSolid(o)) {
      const p = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); p.matrixWorld.copy(o.matrixWorld); p.matrixAutoUpdate = false; probes.push(p); } });
    if (!probes.length) continue;
    const inside = c => probes.some(p => { ray.set(c, new V3(0.577, 0.577, 0.577)); ray.far = 60; return ray.intersectObject(p).length % 2 === 1; });
    const cast = (from, dir, far) => { ray.set(from, dir); ray.far = far; return ray.intersectObjects(probes)[0] || null; };
    let g = m.geometry; if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position, M = m.matrixWorld, Mi = M.clone().invert();
    const drop = new Set(), add = [];
    for (const tris of components(g)) {
      if (tris.length !== 12) continue;                                      // plain box strips only (obox), not hoses / CSG seams
      const W = []; for (const t of tris) for (let k = 0; k < 3; k++) W.push(new V3().fromBufferAttribute(pos, 3 * t + k).applyMatrix4(M));
      const bb = new THREE.Box3().setFromPoints(W), c = bb.getCenter(new V3()), s = bb.getSize(new V3());
      const d = [s.x, s.y, s.z], order = [0, 1, 2].sort((a, b) => d[a] - d[b]);
      // square-section strip: the two thin sizes tie -> project along whichever of them has armour closest
      if (d[order[1]] < d[order[0]] * 1.5) {
        const near = k => Math.min(...[1, -1].map(sg => { const h = cast(c, AX[k].clone().multiplyScalar(sg), 3); return h ? h.distance : 9; }));
        if (near(order[1]) < near(order[0])) order.splice(0, 2, order[1], order[0]);
      }
      const [kT, kW, kL] = order;
      // true thickness = shortest box edge (a tilted box has a fatter bounding box)
      let edge = Infinity; for (let i = 0; i < W.length; i += 3) for (let k = 0; k < 3; k++) { const e = W[i + k].distanceTo(W[i + (k + 1) % 3]); if (e > 1e-4) edge = Math.min(edge, e); }
      const t = Math.min(d[kT], edge), w = d[kW], L = d[kL];
      if (t > 0.15 || L < 0.3) continue;
      // outward side: along the thin axis, the side where open air is (no hit, or the farther hit)
      // (count surfaces crossed within 3 units each way: the body side has more; a nearby lip can't fool it)
      const crossings = dir => { ray.set(c, dir); ray.far = 3; return ray.intersectObjects(probes).length; };
      const np = crossings(AX[kT]), nn = crossings(AX[kT].clone().negate());
      const nOut = np <= nn ? AX[kT].clone() : AX[kT].clone().negate();
      // does any part of the strip hang in the air? sample its corners and centre line
      const corners = W.filter((p, i, a) => a.findIndex(q => q.distanceToSquared(p) < 1e-10) === i);
      const loose = [...corners, c].some(p => !inside(p) && (() => { const h = cast(p, nOut.clone().negate(), 2); return !h || h.distance > t / 2 + 0.015; })());
      if (!loose) continue;
      // rebuild as a draped ribbon
      const uL = AX[kL], uW = AX[kW], n = Math.max(2, Math.ceil(L / step) + 1), secs = [];
      let ok = true;
      for (let i = 0; i < n; i++) {
        const a = c.clone().addScaledVector(uL, -L / 2 + L * i / (n - 1));
        const sec = [];
        for (const sw of [-0.5, 0.5]) {
          const q = a.clone().addScaledVector(uW, sw * w);
          // outermost surface under this point; a point exactly on a plate boundary can slip through the gap -> nudge inward
          let h = null;
          for (const e of [0, 0.01, 0.03, 0.06, 0.1]) {
            const qq = q.clone().lerp(c, 0).addScaledVector(uL, Math.sign(c.clone().sub(q).dot(uL)) * e).addScaledVector(uW, -Math.sign(sw) * e);
            h = cast(qq.addScaledVector(nOut, 1.2), nOut.clone().negate(), 2.4); if (h) break;
          }
          if (!h) { ok = false; break; }
          sec.push(h.point.clone().addScaledVector(nOut, t / 2), h.point.clone().addScaledVector(nOut, -t / 2));
        }
        if (!ok) break; secs.push(sec);   // [w-, outer], [w-, inner], [w+, outer], [w+, inner]
      }
      if (!ok) { log.push(`✗ ${m.name} 细条 (${c.toArray().map(x => x.toFixed(2))}) 有一段背后没有护甲，未动`); continue; }
      const quad = (A, B, C, D) => add.push(A, B, C, A, C, D);
      for (let i = 0; i + 1 < secs.length; i++) {
        const [a0, a1, a2, a3] = secs[i], [b0, b1, b2, b3] = secs[i + 1];
        quad(a0, b0, b2, a2); quad(a1, a3, b3, b1); quad(a0, a1, b1, b0); quad(a2, b2, b3, a3);   // outer, inner, two sides
      }
      const [s0, s1, s2, s3] = secs[0], [e0, e1, e2, e3] = secs[secs.length - 1];
      quad(s0, s2, s3, s1); quad(e0, e1, e3, e2);                                                   // end caps
      tris.forEach(tt => drop.add(tt));
      log.push(`✓ ${m.name} 细条 (${c.toArray().map(x => x.toFixed(2))}) 长 ${L.toFixed(2)} → 贴面带子 ${secs.length} 段`);
    }
    if (!drop.size) continue;
    // new geometry: untouched triangles + ribbons (ribbon winding is fixed afterwards so every face points away from the strip axis)
    const P = [];
    for (let tt = 0; tt < pos.count / 3; tt++) if (!drop.has(tt)) for (let k = 0; k < 3; k++) P.push(pos.getX(3 * tt + k), pos.getY(3 * tt + k), pos.getZ(3 * tt + k));
    const start = P.length / 9;
    for (const p of add) { const l = p.clone().applyMatrix4(Mi); P.push(l.x, l.y, l.z); }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    ng.computeVertexNormals();
    m.geometry = ng; m.userData.seamsSnapped = (m.userData.seamsSnapped || 0) + 1; void start;
  }
  return log;
}
