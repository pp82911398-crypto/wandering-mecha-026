// 分级小 R 圆角（真实几何，建模时一次性生成，不逐帧计算）。
//
// 方法：凸体圆角 = 先把每个面向内平移 R（得到内缩凸体），再在内缩凸体的每个顶点上按“法向锥”铺 R 球面上的点，
// 取凸包。结果：
//   · 原来的每个平面仍在原位置（只是四周让出 R 宽的圆弧），所以外轮廓、贴合面、配合面都不变；
//   · 所有点都在原凸体之内 —— 体积只减不增，不会变胖、不会顶进别的零件；
//   · 法线按解析值给（平面处=面法线，圆弧处=球面方向），圆弧光顺、平面边界清楚。
// 很小的面（宽度 < 2R）会被圆弧吃掉，这正是真实倒圆的效果。
//
// 两种用法：
//   1) roundParts(root, pick)：上色拆件之后，对每个网格里的每个“散件”（原始凸包/方块/圆柱）判断是否凸、
//      由 pick() 决定 R，就地替换。原始拆件、材质分组、层级、轴心都不变。
//   2) roundBrushGeometry(geo, r, tag)：在 torso.js 布尔运算之前，把凸的外壳先倒圆，再挖空腔/切缝（切口保持硬边）；
//      同时登记一份世界坐标的参考面，之后 transferNormals() 把光顺法线还给经过布尔运算的网格。
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export const ROUND = { enabled: false, refs: [], log: [], parts: [] };
const V3 = THREE.Vector3, DEG = Math.PI / 180;

// ---------- planes of a convex point set ----------
function hullPlanes(pts, scale) {
  const h = new ConvexHull().setFromPoints(pts);
  const planes = [];
  const tolN = 1 - 2e-5, tolD = 2e-4 * Math.max(1, scale);
  for (const f of h.faces) {
    const n = f.normal, d = f.constant;
    let p = planes.find(q => q.n.dot(n) > tolN && Math.abs(q.d - d) < tolD);
    if (p) { p.area += f.area; continue; }
    planes.push({ n: n.clone(), d, area: f.area });
  }
  // dihedral angles between neighbouring hull faces (for acute-edge detection)
  let minInterior = Math.PI;
  for (const f of h.faces) {
    let e = f.edge;
    do { const g = e.twin.face; const c = f.normal.dot(g.normal); if (c < 0.9999) minInterior = Math.min(minInterior, Math.PI - Math.acos(Math.max(-1, Math.min(1, c)))); e = e.next; } while (e !== f.edge);
  }
  return { planes, minInterior, hull: h };
}

// ---------- core: rounded convex hull of points ----------
// opts.step: max arc angle per segment; opts.merge: normals closer than this at one corner are treated as one smooth
// direction (dense cylinder sides), so a 32-sided disc does not double its triangle count.
export function roundConvexPoints(pts, r, { step = 22.5 * DEG, merge = 0 } = {}) {
  const bb = new THREE.Box3().setFromPoints(pts), scale = bb.getSize(new V3()).length();
  const { planes } = hullPlanes(pts, scale);
  // interior point with slack on every inset plane
  const c = pts.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / pts.length);
  const slack = (q) => Math.min(...planes.map(P => P.d - r - P.n.dot(q)));
  for (let it = 0; it < 80 && slack(c) < 0.25 * r; it++) {
    for (const P of planes) { const s = P.d - r - P.n.dot(c); if (s < 0.3 * r) c.addScaledVector(P.n, -(0.3 * r - s) * 0.5); }
  }
  if (slack(c) <= 1e-6) return null;                                   // too thin for this R
  // dual points -> hull -> one primal vertex per dual face
  const dual = planes.map(P => P.n.clone().multiplyScalar(1 / (P.d - r - P.n.dot(c))));
  const dh = new ConvexHull().setFromPoints(dual);
  const verts = [], seen = new Map(), q = 1e6 / Math.max(1, scale);
  for (const f of dh.faces) {
    const v = f.normal.clone().multiplyScalar(1 / f.constant).add(c);
    const k = `${Math.round(v.x * q)},${Math.round(v.y * q)},${Math.round(v.z * q)}`;
    if (!seen.has(k)) { seen.set(k, 1); verts.push(v); }
  }
  // rounded surface points
  const outPts = [], dirOf = new Map(), tolI = 1e-4 * Math.max(1, scale);
  const push = (v, d) => { const p = v.clone().addScaledVector(d, r); dirOf.set(p, d.clone()); outPts.push(p); };
  for (const v of verts) {
    let N = planes.filter(P => Math.abs(P.n.dot(v) - (P.d - r)) < tolI).map(P => P.n.clone());
    if (N.length < 3) continue;   // numerical stray
    // merge near-parallel normals (cylinder sides)
    const cl = [];
    for (const n of N) { const g = cl.find(g => g.ref.angleTo(n) < merge); if (g) { g.sum.add(n); } else cl.push({ ref: n.clone(), sum: n.clone() }); }
    const D = cl.map(g => g.sum.normalize());
    for (const d of D) push(v, d);
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) {
      const a = D[i].angleTo(D[j]), m = Math.ceil(a / step);
      for (let k = 1; k < m; k++) push(v, slerp(D[i], D[j], k / m));
    }
    if (D.length >= 3) push(v, D.reduce((s, d) => s.add(d), new V3()).normalize());
  }
  if (outPts.length < 4) return null;
  const oh = new ConvexHull().setFromPoints(outPts);
  const P = [], N = [];
  for (const f of oh.faces) {
    const ring = []; let e = f.edge; do { ring.push(e.head().point); e = e.next; } while (e !== f.edge);
    for (let i = 1; i + 1 < ring.length; i++) for (const p of [ring[0], ring[i], ring[i + 1]]) {
      P.push(p.x, p.y, p.z); const d = dirOf.get(p) || f.normal; N.push(d.x, d.y, d.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
function slerp(a, b, t) {
  const w = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), s = Math.sin(w);
  if (s < 1e-6) return a.clone();
  return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).addScaledVector(b, Math.sin(t * w) / s).normalize();
}

// is this point set (with its triangles) a convex body? every vertex and triangle centre lies on the hull boundary
export function convexInfo(pts, triCentres) {
  const bb = new THREE.Box3().setFromPoints(pts), size = bb.getSize(new V3()), scale = size.length();
  if (pts.length < 4 || Math.min(size.x, size.y, size.z) < 1e-4) return { convex: false };
  let H; try { H = hullPlanes(pts, scale); } catch { return { convex: false }; }
  const tol = 2e-3 * Math.max(1, scale * 0.2);
  const onB = p => H.planes.some(P => Math.abs(P.n.dot(p) - P.d) < tol);
  for (const p of pts) if (!onB(p)) return { convex: false };
  for (const p of triCentres) if (!onB(p)) return { convex: false };
  // width along every face normal (min = plate thickness)
  let thick = Infinity;
  for (const P of H.planes) { let lo = Infinity; for (const p of pts) lo = Math.min(lo, P.n.dot(p)); thick = Math.min(thick, P.d - lo); }
  return { convex: true, thick, planes: H.planes.length, minInterior: H.minInterior, size, centre: bb.getCenter(new V3()), bb };
}

// ---------- per-part pass (after paint) ----------
function componentsOf(g) {
  const pos = g.attributes.position, nT = pos.count / 3, key = new Map(), par = new Int32Array(nT).map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const i = 3 * t + k, h = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    const o = key.get(h); if (o === undefined) key.set(h, t); else { const a = find(o), b = find(t); if (a !== b) par[a] = b; }
  }
  const groups = new Map(); for (let t = 0; t < nT; t++) { const r = find(t); let l = groups.get(r); if (!l) groups.set(r, l = []); l.push(t); }
  return [...groups.values()];
}

// pick(info) -> null (leave hard) or { r, step } ; info: { mesh, mat, convex info in WORLD units, tris }
export function roundParts(root, pick) {
  const stats = { meshes: 0, parts: 0, rounded: 0, skippedThin: 0, failed: 0, trisBefore: 0, trisAfter: 0, ms: 0, byClass: {} };
  const t0 = performance.now(); root.updateMatrixWorld(true);
  const list = []; root.traverse(m => { if (m.isMesh && !m.userData.marking && m.geometry.attributes.position) list.push(m); });
  for (const m of list) {
    let g = m.geometry; if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position; if (!pos || pos.count < 12) continue;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const triMat = new Int32Array(pos.count / 3);
    if (g.groups.length) for (const gr of g.groups) for (let t = gr.start / 3; t < Math.min(pos.count / 3, (gr.start + gr.count) / 3); t++) triMat[t] = gr.materialIndex;
    const M = m.matrixWorld, Mi = M.clone().invert(), NM = new THREE.Matrix3().setFromMatrix4(M).transpose();   // local normal = M^T * world normal
    const comps = componentsOf(g); let changed = false; const pieces = [];   // [{matIndex, geo(local, pos+normal)}]
    stats.parts += comps.length;
    for (const tris of comps) {
      const mi = triMat[tris[0]], uniform = tris.every(t => triMat[t] === mi);
      const wp = [], cen = [], a = new V3(), b = new V3(), cc = new V3();
      const key = new Set();
      for (const t of tris) {
        a.fromBufferAttribute(pos, 3 * t).applyMatrix4(M); b.fromBufferAttribute(pos, 3 * t + 1).applyMatrix4(M); cc.fromBufferAttribute(pos, 3 * t + 2).applyMatrix4(M);
        for (const p of [a, b, cc]) { const k = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`; if (!key.has(k)) { key.add(k); wp.push(p.clone()); } }
        cen.push(a.clone().add(b).add(cc).multiplyScalar(1 / 3));
      }
      let out = null, cls = null;
      if (uniform && wp.length >= 6) {
        const info = convexInfo(wp, cen);
        if (info.convex) {
          const choice = pick({ mesh: m, mat: mats[mi], tris: tris.length, ...info });
          if (choice && choice.r > 0) {
            cls = choice.cls || 'other';
            const r = Math.min(choice.r, 0.3 * info.thick);
            if (r < 0.004) stats.skippedThin++;
            else {
              let rg = null; try { rg = roundConvexPoints(wp, r, { step: (choice.step || 22.5) * DEG, merge: (choice.merge || 0) * DEG }); } catch (e) { rg = null; }
              if (!rg) stats.failed++;
              else {
                const rgWorld = []; { const p0 = rg.attributes.position; for (let i = 0; i < p0.count; i++) rgWorld.push(new V3().fromBufferAttribute(p0, i)); }
                // world -> mesh local
                const p = rg.attributes.position, n = rg.attributes.normal, v = new V3();
                for (let i = 0; i < p.count; i++) {
                  v.fromBufferAttribute(p, i).applyMatrix4(Mi); p.setXYZ(i, v.x, v.y, v.z);
                  v.fromBufferAttribute(n, i).applyMatrix3(NM).normalize(); n.setXYZ(i, v.x, v.y, v.z);
                }
                if (M.determinant() < 0) for (let t = 0; t < p.count; t += 3) for (const A of [p, n]) {   // mirrored part: keep triangles facing out
                  const x = A.getX(t + 1), y = A.getY(t + 1), z = A.getZ(t + 1);
                  A.setXYZ(t + 1, A.getX(t + 2), A.getY(t + 2), A.getZ(t + 2)); A.setXYZ(t + 2, x, y, z);
                }
                out = rg; stats.rounded++; changed = true;
                ROUND.parts.push({ mesh: m, cls, r, orig: hullPlanes(wp, 1).planes, round: hullPlanes(rgWorld, 1).planes, bb: info.bb.clone().expandByScalar(0.05) });
                const C = stats.byClass[cls] ||= { n: 0, r: 0, tris: 0 }; C.n++; C.r = Math.max(C.r, +r.toFixed(3)); C.tris += p.count / 3 - tris.length;
              }
            }
          }
        }
      }
      if (out) pieces.push({ mi, geo: out, extra: tris });
      else pieces.push({ mi: null, tris });
    }
    if (!changed) continue;
    // rebuild: keep original triangles of untouched pieces (all their attributes), add rounded pieces (position+normal)
    const keepAttrs = Object.keys(g.attributes).filter(k => k === 'position' || k === 'normal');
    const byMat = new Map();
    for (const pc of pieces) {
      if (pc.mi === null) for (const t of pc.tris) { const k = triMat[t]; let l = byMat.get(k); if (!l) byMat.set(k, l = []); l.push({ t }); }
      else { let l = byMat.get(pc.mi); if (!l) byMat.set(pc.mi, l = []); l.push({ geo: pc.geo }); }
    }
    const P = [], N = [], groups = [];
    const srcN = g.attributes.normal;
    for (const [mi, items] of [...byMat.entries()].sort((x, y) => x[0] - y[0])) {
      const start = P.length / 3;
      for (const it of items) {
        if (it.geo) { P.push(...it.geo.attributes.position.array); N.push(...it.geo.attributes.normal.array); }
        else for (let k = 0; k < 3; k++) { const i = 3 * it.t + k; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (srcN) N.push(srcN.getX(i), srcN.getY(i), srcN.getZ(i)); else N.push(0, 1, 0); }
      }
      groups.push([start, P.length / 3 - start, mi]);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (Array.isArray(m.material)) for (const [s, c, mi] of groups) ng.addGroup(s, c, mi);
    stats.trisBefore += pos.count / 3; stats.trisAfter += P.length / 9;
    m.userData.roundedFrom = m.geometry; m.geometry = ng; stats.meshes++;
    void keepAttrs;
  }
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}

// ---------- shells: round the convex outer before the boolean cuts ----------
// geo: brush geometry (position only, world coords of the lab). Returns a rounded geometry for a new Brush, or the
// input unchanged when the body is not convex / too thin. A world-space copy is kept to transfer normals later.
export function roundBrushGeometry(geo, r, tag, step = 22.5) {
  if (!ROUND.enabled) return null;
  let g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position, pts = [], cen = [], key = new Set(), v = new V3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const k = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`; if (!key.has(k)) { key.add(k); pts.push(v.clone()); } }
  for (let t = 0; t < pos.count / 3; t++) cen.push(new V3().fromBufferAttribute(pos, 3 * t).add(new V3().fromBufferAttribute(pos, 3 * t + 1)).add(new V3().fromBufferAttribute(pos, 3 * t + 2)).multiplyScalar(1 / 3));
  const info = convexInfo(pts, cen);
  // non-convex body (bent strip, notched outline): round its convex hull; the caller intersects with the body
  const thick = info.convex ? info.thick : hullThickness(pts);
  const rr = Math.min(r, 0.3 * thick);
  const rg = roundConvexPoints(pts, rr, { step: step * DEG });
  if (!rg) { ROUND.log.push(`✗ ${tag} 倒圆失败`); return null; }
  ROUND.refs.push({ tag, orig: pts.map(p => p.clone()), geo: rg.clone(), bb: new THREE.Box3().setFromBufferAttribute(rg.attributes.position).expandByScalar(0.02) });
  ROUND.log.push(`✓ ${tag} R ${rr.toFixed(3)}${info.convex ? '' : '（凹轮廓：凸包倒圆后与原形求交，凹折保持硬边）'}`);
  return { geo: rg, convex: info.convex };
}
function hullThickness(pts) {
  const { planes } = hullPlanes(pts, 1);
  let thick = Infinity;
  for (const P of planes) { let lo = Infinity; for (const p of pts) lo = Math.min(lo, P.n.dot(p)); thick = Math.min(thick, P.d - lo); }
  return thick;
}

// give boolean-cut meshes back the smooth normals of their rounded reference surface. Only triangles lying on a
// reference surface (all 3 corners within tol, facing the same way) are touched; cut faces keep their flat normals.
export function transferNormals(root, filter = () => true) {
  const stats = { meshes: 0, tris: 0 };
  if (!ROUND.refs.length) return stats;
  root.updateMatrixWorld(true);
  // reference triangles with vertex normals, bucketed on a coarse grid
  const refT = [];
  for (const R of ROUND.refs) {
    const p = R.geo.attributes.position, n = R.geo.attributes.normal;
    for (let t = 0; t < p.count / 3; t++) {
      const A = new V3().fromBufferAttribute(p, 3 * t), B = new V3().fromBufferAttribute(p, 3 * t + 1), C = new V3().fromBufferAttribute(p, 3 * t + 2);
      const fn = new V3().subVectors(B, A).cross(new V3().subVectors(C, A)); if (fn.lengthSq() < 1e-14) continue;
      refT.push({ tri: new THREE.Triangle(A, B, C), fn: fn.normalize(), nA: new V3().fromBufferAttribute(n, 3 * t), nB: new V3().fromBufferAttribute(n, 3 * t + 1), nC: new V3().fromBufferAttribute(n, 3 * t + 2) });
    }
  }
  const S = 0.5, grid = new Map(), cell = (x, y, z) => `${Math.floor(x / S)},${Math.floor(y / S)},${Math.floor(z / S)}`;
  refT.forEach((T, i) => {
    const bb = new THREE.Box3().setFromPoints([T.tri.a, T.tri.b, T.tri.c]);
    for (let x = Math.floor(bb.min.x / S); x <= Math.floor(bb.max.x / S); x++) for (let y = Math.floor(bb.min.y / S); y <= Math.floor(bb.max.y / S); y++) for (let z = Math.floor(bb.min.z / S); z <= Math.floor(bb.max.z / S); z++) {
      const k = `${x},${y},${z}`; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
    }
  });
  const near = (p) => {
    const l = grid.get(cell(p.x, p.y, p.z)); if (!l) return null;
    let best = null, bd = Infinity; const q = new V3();
    for (const i of l) { refT[i].tri.closestPointToPoint(p, q); const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
    return best === null ? null : { i: best, d: Math.sqrt(bd) };
  };
  const tol = 4e-3, bary = new V3(), w = new V3();
  root.traverse(m => {
    if (!m.isMesh || m.userData.marking || !filter(m)) return;
    let g = m.geometry; if (g.index) { g = g.toNonIndexed(); m.geometry = g; }
    const bbW = new THREE.Box3().setFromObject(m); if (!ROUND.refs.some(R => R.bb.intersectsBox(bbW))) return;
    const pos = g.attributes.position; if (!g.attributes.normal) g.computeVertexNormals();
    const nor = g.attributes.normal, M = m.matrixWorld, NMw = new THREE.Matrix3().getNormalMatrix(M), NMl = new THREE.Matrix3().setFromMatrix4(M).transpose();
    let hit = 0;
    for (let t = 0; t < pos.count / 3; t++) {
      const W = [0, 1, 2].map(k => new V3().fromBufferAttribute(pos, 3 * t + k).applyMatrix4(M));
      const fn = new V3().subVectors(W[1], W[0]).cross(new V3().subVectors(W[2], W[0])); if (fn.lengthSq() < 1e-14) continue; fn.normalize();
      const res = W.map(near); if (res.some(r => !r || r.d > tol)) continue;
      const ns = res.map((r, k) => { const T = refT[r.i]; T.tri.getBarycoord(W[k], bary); return T.nA.clone().multiplyScalar(bary.x).addScaledVector(T.nB, bary.y).addScaledVector(T.nC, bary.z).normalize(); });
      if (ns.some(n => n.dot(fn) < 0.5)) continue;
      ns.forEach((n, k) => { w.copy(n).applyMatrix3(NMl).normalize(); nor.setXYZ(3 * t + k, w.x, w.y, w.z); });
      hit++;
    }
    if (hit) { nor.needsUpdate = true; stats.meshes++; stats.tris += hit; }
    void NMw;
  });
  return stats;
}

// reference surfaces follow the shell's assembly transform: y squashed by k about y0, then moved by dy
export function transformRefs(test, y0, k, dy) {
  for (const R of ROUND.refs) {
    if (!test.test(R.tag) || R.moved) continue;
    const p = R.geo.attributes.position, n = R.geo.attributes.normal, v = new V3();
    for (let i = 0; i < p.count; i++) {
      p.setY(i, y0 + (p.getY(i) - y0) * k + dy);
      v.fromBufferAttribute(n, i); v.y /= k; v.normalize(); n.setXYZ(i, v.x, v.y, v.z);
    }
    for (const q of R.orig || []) q.y = y0 + (q.y - y0) * k + dy;
    R.bb = new THREE.Box3().setFromBufferAttribute(p).expandByScalar(0.02); R.moved = true;
  }
}

// 细节检查：别的零件（黑线/接缝条、螺栓、灯、贴花、进气罩…）有没有落在“被倒圆削掉的那一薄层”里。
// 落在里面 = 原来贴着/埋在棱边上，现在会露出来悬空或变成月牙。按网格名汇总。
export function checkDetails(root) {
  root.updateMatrixWorld(true);
  const inside = (planes, p, tol) => planes.every(P => P.n.dot(p) <= P.d + tol);
  const shellRefs = ROUND.refs.map(R => { const pts = []; const a = R.geo.attributes.position; for (let i = 0; i < a.count; i++) pts.push(new V3().fromBufferAttribute(a, i)); return { tag: R.tag, planes: hullPlanes(pts, 1).planes, orig: hullPlanes(R.orig, 1).planes, bb: R.bb }; });
  const own = new Set(ROUND.parts.map(p => p.mesh));
  const hits = new Map(), v = new V3();
  root.traverse(m => {
    if (!m.isMesh || !m.geometry.attributes.position || m.name === 'studioSky') return;
    const pos = m.geometry.attributes.position, bbm = new THREE.Box3().setFromObject(m);
    const cands = ROUND.parts.filter(P => P.bb.intersectsBox(bbm));
    const shells = shellRefs.filter(R => R.bb.intersectsBox(bbm) && !(new RegExp('^' + R.tag.replace(/[-]/g, '\\-')).test(m.name)));
    if (!cands.length && !shells.length) return;
    let n = 0, worst = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      for (const P of cands) if (P.bb.containsPoint(v) && inside(P.orig, v, -0.003) && !inside(P.round, v, 0.002)) { n++; break; }
      for (const R of shells) if (R.bb.containsPoint(v) && inside(R.orig, v, -0.003) && !inside(R.planes, v, 0.002)) { n++; worst = Math.max(worst, Math.max(...R.planes.map(P => P.n.dot(v) - P.d))); break; }
    }
    if (n) hits.set(m.name, { verts: n, of: pos.count, worst: +worst.toFixed(3) });
  });
  return [...hits.entries()];
}
