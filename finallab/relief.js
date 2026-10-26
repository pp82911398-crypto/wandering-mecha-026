// Surface relief on the two shoulder-top plates (paulCap1 / paulCap-1): subtraction only, so the volume never grows.
// The cap is a solid bent plate (~0.48 thick) in three flat segments seen in the x-y section (constant along z):
// inner flat -> outer slope (largest face) -> 45° outer chamfer. Each cut is a prism built in a segment's local frame
// (u across the segment, w along z, n outward), from 0.3 above the face down to `depth` below, walls chamfered inward.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { PAL } from './paint.js';

// section points (x, y) of the top surface: inner edge, fold 1, fold 2, outer edge; usable z range at the outer edge
const CAPS = {
  paulCap1: { pts: [[3.2, 0.32], [4.65, 0.07], [6.55, -0.59], [7.0, -1.03]], w0: -1.67, w1: 2.45 },
  'paulCap-1': { pts: [[-3.2, 0.32], [-4.8, 0.07], [-7.86, -0.59], [-8.59, -1.03]], w0: -0.63, w1: 2.45 },
};

function segFrame([ax, ay], [bx, by]) {
  const A = new THREE.Vector3(ax, ay, 0), U = new THREE.Vector3(bx - ax, by - ay, 0); const L = U.length(); U.normalize();
  const N = new THREE.Vector3(-U.y, U.x, 0); if (N.y < 0) N.negate();       // outward = upward-ish
  return { A, U, N, L };
}
// polygon [[u,w]...] (convex) on segment F -> cutter brush; bevel = how much the floor shrinks (wall slope)
function cutter(F, poly, depth, bevel = 0.08) {
  const c = poly.reduce((s, [u, w]) => [s[0] + u / poly.length, s[1] + w / poly.length], [0, 0]);
  const at = (u, w, h) => F.A.clone().addScaledVector(F.U, u).add(new THREE.Vector3(0, 0, w)).addScaledVector(F.N, h);
  const pts = [];
  for (const [u, w] of poly) {
    pts.push(at(u, w, 0.3));
    const du = u - c[0], dw = w - c[1], d = Math.hypot(du, dw) || 1;
    pts.push(at(u - du / d * bevel, w - dw / d * bevel, -depth));
  }
  return new ConvexGeometry(pts);
}

export function reliefShoulders(root) {
  const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;
  const log = [];
  for (const [name, S] of Object.entries(CAPS)) {
    const m = root.getObjectByName(name); if (!m) { log.push('× ' + name); continue; }
    const [inner, outer, cham] = [0, 1, 2].map(i => segFrame(S.pts[i], S.pts[i + 1]));
    const cuts = [];
    // outer slope: two sunken panels split by a rib, rear one with a diagonal outer corner, front one with a raked front edge
    { const L = outer.L, wa = S.w0 + 0.3, wb = S.w1 - 0.25, mid = (wa + wb) / 2, u0 = 0.3, u1 = L - 0.3;
      cuts.push(cutter(outer, [[u0, wa], [u1 - 0.45, wa], [u1, wa + 0.45], [u1, mid - 0.15], [u0, mid - 0.15]], 0.12));
      cuts.push(cutter(outer, [[u0, mid + 0.15], [u1, mid + 0.15], [u1, wb - 0.3], [u0, wb + 0.25]], 0.12));
      // small square recess at the inner end of the rib (bolt pad)
      cuts.push(cutter(outer, [[u0 + 0.05, mid - 0.06], [u0 + 0.35, mid - 0.06], [u0 + 0.35, mid + 0.06], [u0 + 0.05, mid + 0.06]], 0.06, 0.02)); }
    // inner flat: three short slots along z
    { const u0 = 0.4, u1 = inner.L - 0.4, a = S.w0 + 0.25, b = S.w1 + 0.3, n = 3, gap = 0.3, len = (b - a - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) { const w = a + i * (len + gap); cuts.push(cutter(inner, [[u0, w], [u1, w + 0.15], [u1, w + len], [u0, w + len - 0.15]], 0.1, 0.05)); } }
    // outer chamfer: four notches right through both edges (stepped silhouette)
    { const a = S.w0 + 0.45, b = S.w1 - 0.45, n = 4, len = 0.32;
      for (let i = 0; i < n; i++) { const w = a + (b - a - len) * i / (n - 1); cuts.push(cutter(cham, [[-0.2, w], [cham.L + 0.25, w], [cham.L + 0.25, w + len], [-0.2, w + len]], 0.14, 0.04)); } }

    // CSG: cap minus all cutters; cut faces take the darker secondary tone
    const base = new Brush(m.geometry, m.material); base.updateMatrixWorld();
    let res = base;
    for (const g of cuts) { const b = new Brush(g, PAL.recess); b.updateMatrixWorld(); res = ev.evaluate(res, b, SUBTRACTION); }
    const before = m.geometry.attributes.position.count / 3;
    m.geometry = res.geometry; m.material = res.material;
    log.push(`✓ ${name} 切口 ${cuts.length} 处，三角面 ${before} → ${res.geometry.attributes.position.count / 3}`);
  }
  return log;
}

// ======================================================================================================
// Same language on every other armour part: sunken panels cut into each large flat face (subtraction only).
// Per mesh (in its own local space): group armour triangles into flat faces (same plane + connected), and for each face
// big enough: inset outline -> 1 or 2 pockets (rib between when long) with one corner clipped diagonally.
// Every pocket is checked by rays before cutting: all sample points must land on that face with nothing above it,
// and the plate behind must be thick enough (depth <= 40% of the thinnest spot, min 0.03) - so nothing is cut through.
// ======================================================================================================
const ARMOR_MATS = () => new Set([PAL.armor, PAL.armor2]);

function faceClusters(g, mats) {
  const pos = g.attributes.position, nT = pos.count / 3, isArm = ARMOR_MATS();
  const triMat = new Int32Array(nT);
  if (g.groups.length) for (const gr of g.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) triMat[t] = gr.materialIndex;
  const matOf = t => Array.isArray(mats) ? mats[triMat[t]] : mats;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), byPlane = new Map();
  for (let t = 0; t < nT; t++) {
    if (!isArm.has(matOf(t))) continue;
    a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); c.fromBufferAttribute(pos, 3 * t + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)); const ar = n.length() / 2; if (ar < 1e-5) continue; n.normalize();
    const k = `${Math.round(n.x * 150)},${Math.round(n.y * 150)},${Math.round(n.z * 150)},${Math.round(n.dot(a) * 40)}`;
    let l = byPlane.get(k); if (!l) byPlane.set(k, l = { n: n.clone(), tris: [], area: 0 }); l.tris.push(t); l.area += ar;
  }
  // split each plane group into connected pieces
  const out = [];
  for (const P of byPlane.values()) {
    if (P.area < 0.5) continue;
    const key = new Map(), par = new Map(), find = i => { while (par.get(i) !== i) { par.set(i, par.get(par.get(i))); i = par.get(i); } return i; };
    for (const t of P.tris) par.set(t, t);
    for (const t of P.tris) for (let k = 0; k < 3; k++) {
      const i = 3 * t + k, h = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
      const o = key.get(h); if (o === undefined) key.set(h, t); else { const r1 = find(o), r2 = find(t); if (r1 !== r2) par.set(r1, r2); }
    }
    const parts = new Map(); for (const t of P.tris) { const r = find(t); let l = parts.get(r); if (!l) parts.set(r, l = []); l.push(t); }
    for (const tris of parts.values()) {
      let area = 0; const pts = [];
      for (const t of tris) { a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); c.fromBufferAttribute(pos, 3 * t + 2);
        area += new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2; pts.push(a.clone(), b.clone(), c.clone()); }
      if (area >= 0.5) out.push({ n: P.n, pts, area });
    }
  }
  return out;
}

// 2D helpers
const hull2 = (P) => { const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); };
const clip = (poly, nx, ny, c) => { const out = []; for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length];
  const da = A[0] * nx + A[1] * ny - c, db = B[0] * nx + B[1] * ny - c;
  if (da <= 0) out.push(A); if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); } } return out; };
const inset = (poly, d) => { let p = poly; for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length];
  let nx = B[1] - A[1], ny = -(B[0] - A[0]); const L = Math.hypot(nx, ny); if (L < 1e-6) continue; nx /= L; ny /= L;   // outward for CCW
  p = clip(p, nx, ny, A[0] * nx + A[1] * ny - d); if (p.length < 3) return []; } return p; };
const area2 = p => Math.abs(p.reduce((s, A, i) => { const B = p[(i + 1) % p.length]; return s + A[0] * B[1] - B[0] * A[1]; }, 0) / 2);

export function reliefAll(root, { skip = () => false } = {}) {
  const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = true;
  const ray = new THREE.Raycaster(); const stats = { meshes: 0, pockets: 0, faces: 0, rejected: 0, ms: 0 };
  const t0 = performance.now(), list = [];
  root.traverse(m => { if (m.isMesh && !m.userData.marking && !skip(m)) list.push(m); });
  for (const m of list) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!mats.some(x => ARMOR_MATS().has(x))) continue;
    let g = m.geometry; if (g.index) g = g.toNonIndexed();
    const probe = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));   // local space, identity
    const faces = faceClusters(g, m.material).filter(F => F.area >= 1.5).sort((a, b) => b.area - a.area).slice(0, 6), cuts = [];
    const slat = /\.slat|pauldron.*_\d$/.test(m.userData.part || '') || /_\d$/.test(m.name);
    for (const F of faces) {
      const n = F.n; if (slat && n.z > 0.6) continue;                         // missile-bay faces on the shoulder slats
      stats.faces++;
      // in-plane axes by PCA of the points
      const c = F.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / F.pts.length);
      const tmp = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      let u = tmp.clone().addScaledVector(n, -tmp.dot(n)).normalize(), v = new THREE.Vector3().crossVectors(n, u);
      let suu = 0, svv = 0, suv = 0; for (const p of F.pts) { const d = p.clone().sub(c), x = d.dot(u), y = d.dot(v); suu += x * x; svv += y * y; suv += x * y; }
      const th = 0.5 * Math.atan2(2 * suv, suu - svv); const u2 = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(v, Math.sin(th)); v = new THREE.Vector3().crossVectors(n, u2); u = u2;
      const P2 = hull2(F.pts.map(p => { const d = p.clone().sub(c); return [d.dot(u), d.dot(v)]; }));
      let xs = P2.map(p => p[0]), ys = P2.map(p => p[1]); const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys);
      if (Math.min(W, H) < 0.9) continue;
      const m0 = Math.min(0.3, Math.max(0.12, 0.14 * Math.min(W, H)));
      const base = inset(P2, m0); if (base.length < 3) continue;
      // pockets: split along the long axis with a rib when long, clip one corner of each
      let pockets = [base];
      if (W > 1.9 && W > 1.6 * H) { const mid = (Math.min(...xs) + Math.max(...xs)) / 2, rib = 0.11; pockets = [clip(base, 1, 0, mid - rib), clip(base, -1, 0, -(mid + rib))]; }
      pockets = pockets.map((p, i) => {
        if (p.length < 3) return p;
        const px = p.map(q => q[0]), py = p.map(q => q[1]), x0 = Math.min(...px), x1 = Math.max(...px), y0 = Math.min(...py), y1 = Math.max(...py);
        const k = 0.3 * Math.min(x1 - x0, y1 - y0), sx = i % 2 ? -1 : 1, sy = (Math.round(c.x * 7 + c.y * 3) & 1) ? 1 : -1;  // varied corner
        const cx = sx > 0 ? x1 : x0, cy = sy > 0 ? y1 : y0;
        return clip(p, sx / Math.SQRT2, sy / Math.SQRT2, (cx * sx + cy * sy) / Math.SQRT2 - k / Math.SQRT2);
      }).filter(p => p.length >= 3 && area2(p) > 0.12);
      for (const p of pockets) {
        // ray check: corners, edge midpoints and centre must land on this face, unobstructed; measure plate thickness
        const at = (x, y, h) => c.clone().addScaledVector(u, x).addScaledVector(v, y).addScaledVector(n, h);
        const samples = [...p, ...p.map((q, i) => { const r = p[(i + 1) % p.length]; return [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2]; }),
          [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]];
        let ok = true, thin = Infinity;
        for (const [x, y] of samples) {
          ray.set(at(x, y, 0.4), n.clone().negate()); const hs = probe.raycast ? ray.intersectObject(probe) : [];
          if (!hs.length || Math.abs(hs[0].distance - 0.4) > 0.012) { ok = false; break; }
          const back = hs.find(h => h.distance > 0.405); thin = Math.min(thin, back ? back.distance - 0.4 : 0);
        }
        const depth = Math.min(0.1, 0.4 * thin);
        if (!ok || depth < 0.03) { stats.rejected++; continue; }
        // cutter prism: 0.08 above the face (nothing else of this mesh is there - checked), floor shrunk for sloped walls
        const ce = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length], bev = Math.min(0.07, depth * 0.8), pts = [];
        for (const [x, y] of p) { const dx = x - ce[0], dy = y - ce[1], d = Math.hypot(dx, dy) || 1; pts.push(at(x, y, 0.08), at(x - dx / d * bev, y - dy / d * bev, -depth)); }
        cuts.push(new ConvexGeometry(pts));
      }
    }
    if (!cuts.length) continue;
    let res = new Brush(g, m.material); res.updateMatrixWorld();
    for (const cg of cuts) { const b = new Brush(cg, PAL.recess); b.updateMatrixWorld(); res = ev.evaluate(res, b, SUBTRACTION); }
    m.geometry = res.geometry; m.material = res.material;
    stats.meshes++; stats.pockets += cuts.length;
  }
  stats.ms = Math.round(performance.now() - t0);
  return stats;
}

// thin red pinstripe along each shoulder-top plate's crest fold (outer slope, u 0.1-0.2: clear of the pockets
// (u >= 0.3) and of the edge notches near the outer fold); embedded 0.01, proud 0.012. Hidden unless a scheme shows it.
export function shoulderStripes(root) {
  const out = [];
  for (const [name, S] of Object.entries(CAPS)) {
    const m = root.getObjectByName(name); if (!m) continue;
    const F = segFrame(S.pts[1], S.pts[2]);
    const at = (u, w, h) => F.A.clone().addScaledVector(F.U, u).add(new THREE.Vector3(0, 0, w)).addScaledVector(F.N, h);
    const pts = []; for (const u of [0.1, 0.2]) for (const w of [S.w0 + 0.15, S.w1 + 0.05]) for (const h of [-0.01, 0.012]) pts.push(at(u, w, h));
    const s = new THREE.Mesh(new ConvexGeometry(pts), PAL.red); s.name = 'shoulderPinstripe'; s.userData.marking = true; s.visible = false;
    m.add(s); out.push(s);
  }
  return out;
}
