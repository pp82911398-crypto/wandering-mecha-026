// Mechanical modeling kit: beveled plates, thick revolved shells, superellipse lofts,
// hydraulic pistons, gears. All units are meters.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const PI = Math.PI;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function clean(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of ['position', 'normal', 'uv']) { const a = g.attributes[k]; if (a) a.normalized = false; }
  // guard against degenerate normals (they become NaN pixels that bloom smears across the frame)
  const na = g.attributes.normal.array;
  for (let i = 0; i < na.length; i += 3) {
    const l = na[i] * na[i] + na[i + 1] * na[i + 1] + na[i + 2] * na[i + 2];
    if (!(l > 1e-8)) { na[i] = 0; na[i + 1] = 1; na[i + 2] = 0; }
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}
export const crease = (g, a = 30) => toCreasedNormals(g, a * DEG);

export function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  return g;
}

// ---------- revolve (lathe with crisp creases + end caps) ----------
export function revolve(pts, o = {}) {
  const segs = o.segs ?? 48, ps = o.phiStart ?? 0, pl = o.phiLength ?? PI * 2;
  const closed = o.closed ?? true;
  const cr = Math.cos((o.crease ?? 35) * DEG);
  const P = pts.map(p => new THREE.Vector2(p[0], p[1]));
  const n = P.length, sc = closed ? n : n - 1;
  const SN = [], SL = []; let total = 0;
  for (let i = 0; i < sc; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-6;
    SN.push(new THREE.Vector2(dy / L, -dx / L)); SL.push(L); total += L;
  }
  const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  for (let s = 0; s < sc; s++) {
    const a = P[s], b = P[(s + 1) % n], ns = SN[s];
    const np = (closed || s > 0) ? SN[(s - 1 + sc) % sc] : null;
    const nn = (closed || s < sc - 1) ? SN[(s + 1) % sc] : null;
    const na = (np && np.dot(ns) > cr) ? np.clone().add(ns).normalize() : ns;
    const nb = (nn && nn.dot(ns) > cr) ? nn.clone().add(ns).normalize() : ns;
    const base = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const phi = ps + pl * j / segs, si = Math.sin(phi), co = Math.cos(phi);
      pos.push(a.x * si, a.y, a.x * co, b.x * si, b.y, b.x * co);
      nor.push(na.x * si, na.y, na.x * co, nb.x * si, nb.y, nb.x * co);
      uv.push(j / segs, acc / total, j / segs, (acc + SL[s]) / total);
    }
    for (let j = 0; j < segs; j++) { const i0 = base + j * 2; idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); }
    acc += SL[s];
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = clean(g);
  if (o.caps !== false && closed && pl < PI * 2 - 1e-4) {
    g = mergeGeometries([g, cap(P, ps, -1), cap(P, ps + pl, 1)]);
  }
  return g;
}
function cap(P, phi, sign) {
  const tris = THREE.ShapeUtils.triangulateShape(P, []);
  const si = Math.sin(phi), co = Math.cos(phi);
  const N = new THREE.Vector3(co, 0, -si).multiplyScalar(sign);
  const pos = [], nor = [], uv = [];
  const v = p => new THREE.Vector3(p.x * si, p.y, p.x * co);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const t of tris) {
    let A = v(P[t[0]]), B = v(P[t[1]]), C = v(P[t[2]]);
    a.subVectors(B, A); b.subVectors(C, A);
    if (a.cross(b).dot(N) < 0) { const T = B; B = C; C = T; }
    for (const X of [A, B, C]) { pos.push(X.x, X.y, X.z); nor.push(N.x, N.y, N.z); uv.push(0, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// thick shell from an outer profile [[r,y],...] ordered bottom -> top
export function shellSection(outer, t) {
  const n = outer.length, inner = [];
  for (let i = 0; i < n; i++) {
    const p = outer[i], a = outer[Math.max(0, i - 1)], b = outer[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = dy / L, ny = -dx / L;
    inner.push([Math.max(0, p[0] - nx * t), p[1] - ny * t]);
  }
  return [...outer, ...inner.reverse()];
}
export function shell(outer, t, o = {}) { return revolve(shellSection(outer, t), o); }

// open surface (for decals) following an outer profile with an offset
export function surface(outer, off, o = {}) {
  const n = outer.length, pts = [];
  for (let i = 0; i < n; i++) {
    const p = outer[i], a = outer[Math.max(0, i - 1)], b = outer[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    pts.push([p[0] + dy / L * off, p[1] - dx / L * off]);
  }
  return revolve(pts, { ...o, closed: false, caps: false, crease: 80 });
}

// ellipse arc profile helper (angles in degrees, -90 bottom .. 90 top)
export function ell(R, Ry, a0, a1, n = 10, cy = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * DEG; out.push([R * Math.cos(a), cy + Ry * Math.sin(a)]); }
  return out;
}

// ---------- superellipse loft along Y ----------
export function loft(sections, o = {}) {
  const seg = o.segs ?? 32, R = sections.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < R; i++) {
    const S = sections[i], ex = 2 / (S.n ?? 4);
    for (let k = 0; k < seg; k++) {
      const t = k / seg * PI * 2, c = Math.cos(t), s = Math.sin(t);
      pos.push((S.x ?? 0) + S.w / 2 * Math.sign(c) * Math.pow(Math.abs(c), ex), S.y, (S.z ?? 0) + S.d / 2 * Math.sign(s) * Math.pow(Math.abs(s), ex));
      uv.push(k / seg, i / (R - 1));
    }
  }
  for (let i = 0; i < R - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + (k + 1) % seg, c = (i + 1) * seg + k, d = (i + 1) * seg + (k + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  if (o.caps !== false) {
    const S0 = sections[0], S1 = sections[R - 1];
    const c0 = pos.length / 3; pos.push(S0.x ?? 0, S0.y, S0.z ?? 0); uv.push(0.5, 0);
    const c1 = pos.length / 3; pos.push(S1.x ?? 0, S1.y, S1.z ?? 0); uv.push(0.5, 1);
    for (let k = 0; k < seg; k++) {
      idx.push(c0, k, (k + 1) % seg);
      idx.push(c1, (R - 1) * seg + (k + 1) % seg, (R - 1) * seg + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return crease(g, o.crease ?? 40);
}

// ---------- extrusions ----------
export function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
export function circlePath(x, y, r) { const h = new THREE.Path(); h.absarc(x, y, r, 0, PI * 2, true); return h; }
// polygon in XY extruded along Z, centered on Z, chamfered edges
export function slab(pts, depth, bevel = 0.12, holes = []) {
  const s = Array.isArray(pts) ? shapeFrom(pts) : pts;
  for (const h of holes) s.holes.push(h);
  const b = Math.min(bevel, depth * 0.45);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(depth - 2 * b, 0.005), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
    bevelOffset: -b, bevelSegments: 1, curveSegments: 24,
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  return crease(g, 30);
}
export function cbox(w, h, d, c = 0.12) {
  c = Math.min(c, w * 0.3, h * 0.3, d * 0.3);
  const x = w / 2, y = h / 2, k = c;
  return slab([[-x + k, -y], [x - k, -y], [x, -y + k], [x, y - k], [x - k, y], [-x + k, y], [-x, y - k], [-x, -y + k]], d, c);
}
export function cyl(r1, r2, h, seg = 32, open = false) { return clean(new THREE.CylinderGeometry(r1, r2, h, seg, 1, open)); }
// washer / flange ring, axis Y, crisp chamfered edges
export function ring(rIn, rOut, h, seg = 48, ch = 0.08) {
  const c = Math.min(ch, h * 0.3, (rOut - rIn) * 0.3);
  return revolve([[rIn, -h / 2], [rOut - c, -h / 2], [rOut, -h / 2 + c], [rOut, h / 2 - c], [rOut - c, h / 2], [rIn, h / 2]], { segs: seg });
}
export function sphere(r, ws = 32, hs = 20) { return clean(new THREE.SphereGeometry(r, ws, hs)); }
export function torus(R, r, rs = 8, ts = 48, arc = PI * 2) { return clean(new THREE.TorusGeometry(R, r, rs, ts, arc)); }

export function gear(n, rOut, rRoot, thick, rHole = 0, bevel = 0.05) {
  const s = new THREE.Shape(), steps = n * 4;
  for (let i = 0; i < steps; i++) {
    const q = i % 4, a = (Math.floor(i / 4) + [0, 0.18, 0.5, 0.68][q]) / n * PI * 2;
    const r = (q === 1 || q === 2) ? rOut : rRoot;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  const holes = [];
  if (rHole > 0) holes.push(circlePath(0, 0, rHole));
  // lightening holes
  if (rRoot - rHole > rRoot * 0.45 && rHole > 0) {
    const rr = (rRoot + rHole) / 2, hr = (rRoot - rHole) * 0.26;
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; holes.push(circlePath(Math.cos(a) * rr, Math.sin(a) * rr, hr)); }
  }
  return slab(s, thick, bevel, holes);
}

export function tube(points, r, seg = 48, rs = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return clean(new THREE.TubeGeometry(curve, seg, r, rs, false));
}

// ---------- batching ----------
export class Batch {
  constructor() { this.b = new Map(); }
  add(geo, mat, p, r, s) {
    if (p || r || s) xf(geo, p || [0, 0, 0], r || [0, 0, 0], s || [1, 1, 1]);
    let l = this.b.get(mat); if (!l) this.b.set(mat, l = []);
    l.push(clean(geo));
    return this;
  }
  build(shadow = true) {
    const g = new THREE.Group();
    for (const [mat, list] of this.b) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = shadow; m.receiveShadow = true;
      g.add(m);
    }
    this.b.clear();
    return g;
  }
}

// hex bolt
let _bolt = null;
export function boltGeo() {
  if (_bolt) return _bolt;
  const head = cyl(0.13, 0.13, 0.09, 6); head.translate(0, 0.045, 0);
  const wash = cyl(0.18, 0.18, 0.03, 12); wash.translate(0, 0.015, 0);
  _bolt = mergeGeometries([head, wash]);
  return _bolt;
}
const _up = new THREE.Vector3(0, 1, 0);
export function boltMatrix(p, n, s = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, new THREE.Vector3(...n).normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(s, s, s));
}

// ---------- hydraulic piston ----------
export class Piston {
  constructor(M, { r = 0.55, len = 6, rodLen = 6, accent = null } = {}) {
    this.group = new THREE.Group();
    const h = new Batch(), rod = new Batch();
    // housing along +Z (0..len)
    h.add(cyl(r, r, len * 0.86, 24), M.gun, [0, 0, len * 0.5 + 0.2], [PI / 2, 0, 0]);
    h.add(ring(r * 0.9, r * 1.28, 0.35, 24), M.dark, [0, 0, len * 0.18], [PI / 2, 0, 0]);
    h.add(ring(r * 0.9, r * 1.32, 0.5, 24), accent || M.yellow, [0, 0, len * 0.92], [PI / 2, 0, 0]);
    h.add(ring(r * 0.9, r * 1.2, 0.25, 24), M.dark, [0, 0, len * 0.6], [PI / 2, 0, 0]);
    h.add(cbox(r * 2.0, r * 1.5, r * 1.6, 0.06), M.dark, [0, 0, 0.1]);
    h.add(cyl(r * 0.45, r * 0.45, r * 2.4, 12), M.steel, [0, 0, 0.1], [0, 0, PI / 2]);
    // hose along housing
    h.add(tube([[r * 0.95, 0, len * 0.2], [r * 1.35, 0, len * 0.5], [r * 1.0, 0, len * 0.88]], r * 0.14, 16, 6), M.rubber);
    // rod along +Z (0..rodLen), chrome
    rod.add(cyl(r * 0.55, r * 0.55, rodLen, 20), M.chrome, [0, 0, rodLen * 0.5], [PI / 2, 0, 0]);
    rod.add(cbox(r * 1.6, r * 1.3, r * 1.4, 0.05), M.dark, [0, 0, 0.1]);
    rod.add(cyl(r * 0.4, r * 0.4, r * 2.0, 12), M.steel, [0, 0, 0.1], [0, 0, PI / 2]);
    rod.add(ring(r * 0.5, r * 0.75, 0.2, 20), M.dark, [0, 0, 0.5], [PI / 2, 0, 0]);
    this.h = h.build(); this.rod = rod.build();
    this.group.add(this.h, this.rod);
  }
  set(A, B) {
    this.h.position.copy(A); this.h.lookAt(B);
    this.rod.position.copy(B); this.rod.lookAt(A);
  }
}
