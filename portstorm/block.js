// Bunker hill that replaces the old mountain: a compact headland that only just covers the hangar hall,
// its flanks running down into the sea on both sides, with a hardened concrete casemate as the gate front.
// Hill = fine faceted heightfield (vertex colours by slope), boulders sit on the surface (sunk, never floating).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { PI, cbox, cyl, sphere, Batch } from '../src/kit.js';
import { canvasTex, rng } from '../src/materials.js';
import { L } from './layout.js';

const V3 = THREE.Vector3;
const std = p => new THREE.MeshStandardMaterial(p);
const cx = L.gate.cx;
const W = L.waterY - 4;                                   // hill flanks end below the waterline

// casemate (bunker front): covers the tunnel and the door pockets (leaves slide to x -52 / +52)
export const BUNKER = { x0: cx - 62, x1: cx + 58, z0: L.gate.z, z1: -207, wall: 6, foot: -8 };
const roofY = z => 80 + (L.gate.z - z) / (L.gate.z - BUNKER.z1) * 20;   // 80 at the face → 100 at the hall
// plateau over the hall (hall x cx±77, z -205..-403, roof 98)
const PLAT = { x0: cx - 62, x1: cx + 62, z0: -203, z1: -356, top: 110 };   // hall x cx±58 (walls), z -205..-352

// ---------- noise ----------
const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < o; k++) { s += a * noise(x, y); n += a; x *= 2.03; y *= 2.03; a *= 0.5; } return s / n; };
const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// ---------- hill height ----------
const inBunker = (x, z) => x >= BUNKER.x0 + BUNKER.wall && x <= BUNKER.x1 - BUNKER.wall && z <= BUNKER.z0 && z >= BUNKER.z1 + 2;
export function hillY(x, z) {
  if (inBunker(x, z)) return roofY(z) - 3;                // hidden inside the casemate roof slab
  const dx = Math.max(PLAT.x0 - x, 0, x - PLAT.x1);
  const dzf = Math.max(z - PLAT.z0, 0), dzb = Math.max(PLAT.z1 - z, 0);
  const n = fbm(x * 0.008 + 3, z * 0.008);
  const Ds = 150 + 70 * n, Df = 64, Db = 140 + 40 * fbm(x * 0.01, 7);
  const dn = Math.hypot(dx / Ds, dzf / Df, dzb / Db);
  const k = 1 - sm(dn);
  const top = PLAT.top + 12 * fbm(x * 0.015, z * 0.015 + 9);
  let h = W + (top - W) * Math.pow(k, 1.25);
  h += (fbm(x * 0.07, z * 0.07 + 4, 3) - 0.5) * 9 * Math.min(1, k * 3) * (1 - k * 0.6);   // rocky detail on the slopes
  // rock strata: soft terraces on the flanks (steps every ~7 units, strongest mid-slope)
  const slope = Math.min(1, 4 * k * (1 - k)), f = (h + 3 * fbm(x * 0.03, z * 0.03 + 2)) / 7, fl = Math.floor(f);
  h = h + ((fl + sm((f - fl) * 1.8 - 0.4)) * 7 - h) * 0.55 * slope;
  h += (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 1.6 * k;
  // toe flattens onto the quay (yard level) where the quay is, sea elsewhere
  const wq = sm((x - (L.quay.x0 - 20)) / 20) * sm((L.quay.x1 + 20 - x) / 20) * sm((z + 185) / 35);
  return Math.max(h, W + (0.15 - W) * wq);
}

function buildHill() {
  const step = 4, x0 = -300, x1 = 304, z0 = L.gate.z, z1 = -597;
  const nx = (x1 - x0) / step + 1, nz = (z0 - z1) / step + 1;
  const P = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * step, z = z0 - j * step; P.push([x, hillY(x, z), z]); }
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = P[j * nx + i], b = P[j * nx + i + 1], c = P[(j + 1) * nx + i], d = P[(j + 1) * nx + i + 1];
    if ((i + j) & 1) { tri(a, c, b); tri(b, c, d); } else { tri(a, d, b); tri(a, c, d); }
  }
  // front skirt: from the first row down to the quay underside / sea floor (no open edge)
  for (let i = 0; i < nx - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (inBunker(a[0], a[2]) && inBunker(b[0], b[2])) continue;
    const ya = W - 3, a2 = [a[0], ya, a[2] - 0.5], b2 = [b[0], ya, b[2] - 0.5];
    tri(a, b, a2); tri(b, b2, a2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const N = g.attributes.normal, Pp = g.attributes.position, col = new Float32Array(Pp.count * 3), c = new THREE.Color(), r = rng(41);
  for (let t = 0; t < Pp.count; t += 3) {
    const ny = Math.abs(N.getY(t)), y = (Pp.getY(t) + Pp.getY(t + 1) + Pp.getY(t + 2)) / 3, v = r();
    if (y < L.waterY + 2.5) c.setRGB(0.10 + v * 0.03, 0.11 + v * 0.03, 0.11 + v * 0.03);            // wet rock at the waterline
    else if (y < 1.2 && ny > 0.95) c.setRGB(0.26 + v * 0.03, 0.26 + v * 0.03, 0.25);                // yard gravel at the toe
    else if (ny < 0.62) c.setRGB(0.30 + v * 0.06, 0.29 + v * 0.05, 0.27 + v * 0.05);                 // bare rock
    else if (ny < 0.84) c.setRGB(0.22 + v * 0.05, 0.25 + v * 0.05, 0.18 + v * 0.03);                 // scrub
    else c.setRGB(0.15 + v * 0.04, 0.22 + v * 0.05, 0.13 + v * 0.03);                                // grass
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, std({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  mesh.name = 'hill'; mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// boulders: only on steep slopes and along the waterline, base sunk ~35% into the ground
function boulders(b, mat, matD) {
  const r = rng(58); let placed = 0;
  for (let tries = 0; tries < 900 && placed < 70; tries++) {
    const x = -280 + r() * 570, z = L.gate.z - 4 - r() * 420;
    if (x > BUNKER.x0 - 24 && x < BUNKER.x1 + 24 && z > BUNKER.z1 - 10) continue;            // keep the gate clear
    if (x > L.quay.x0 - 6 && x < L.quay.x1 + 6 && z > -170) continue;                         // keep the yard clear
    const y = hillY(x, z), e = 1.5;
    const sx = (hillY(x + e, z) - hillY(x - e, z)) / (2 * e), sz = (hillY(x, z + e) - hillY(x, z - e)) / (2 * e);
    const steep = Math.hypot(sx, sz), shore = y > L.waterY - 1.5 && y < L.waterY + 3;
    if (!(steep > 0.9 || shore) || y < L.waterY - 1.5) continue;
    const s = shore ? 1.5 + r() * 3 : 2 + r() * 5;
    // chunky block: jittered points on an ellipsoid shell (always has volume, never a flake)
    const pts = [], ex = 1, ey = 0.65 + r() * 0.3, ez = 0.7 + r() * 0.4;
    for (let k = 0; k < 14; k++) { const u = r() * 2 - 1, t = r() * PI * 2, q = Math.sqrt(1 - u * u), j = 0.8 + r() * 0.25;
      pts.push(new V3(Math.cos(t) * q * s * ex * j, u * s * ey * j, Math.sin(t) * q * s * ez * j)); }
    const g = new ConvexGeometry(pts); g.rotateY(r() * PI * 2);
    b.add(g, r() < 0.6 ? mat : matD, [x, y - s * 0.3, z]);
    placed++;
  }
}

function louvreTex() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#1b1f22'; x.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 12) { x.fillStyle = '#4a5156'; x.fillRect(4, y, w - 8, 5); x.fillStyle = '#0c0e10'; x.fillRect(4, y + 5, w - 8, 3); }
  });
}

export function buildBunkerHill(root, m) {
  const B = BUNKER, G = L.gate;
  const conc = std({ color: 0x8c8d86, roughness: 0.92, flatShading: true });
  const concD = std({ color: 0x5f615c, roughness: 0.95, flatShading: true });
  const dark = m.dark, steel = m.steel, glass = m.glass, lamp = m.lampOn, beacon = m.beaconR, yellow = m.yellow;
  const rock = std({ color: 0x55534d, roughness: 0.96, flatShading: true });
  const rockD = std({ color: 0x3a3a37, roughness: 0.98, flatShading: true });
  root.add(buildHill());

  const b = new Batch();
  const _add = b.add.bind(b); b.add = (g, mat, p, r, sc) => { if (g.attributes.uv) g.deleteAttribute('uv'); return _add(g, mat, p, r, sc); };   // hulls have no uv
  const hull = (pts, mat) => b.add(new ConvexGeometry(pts.map(p => new V3(...p))), mat);
  const box = (x0, x1, y0, y1, z0, z1, mat, c = 0.15) => b.add(cbox(x1 - x0, y1 - y0, z1 - z0, c), mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
  const gl = cx - G.outerW / 2, gr = cx + G.outerW / 2, zf = B.z0, zb = zf - B.wall;

  // ---- casemate: front wall around the gate frame, side walls, sloped roof slab
  box(B.x0, gl, B.foot, G.frameH, zb, zf, conc);
  box(gr, B.x1, B.foot, G.frameH, zb, zf, conc);
  hull([[B.x0, G.frameH, zb], [B.x1, G.frameH, zb], [B.x0, G.frameH, zf], [B.x1, G.frameH, zf],
    [B.x0, 77, zf], [B.x1, 77, zf], [B.x0, 80, zf - 3], [B.x1, 80, zf - 3], [B.x0, 80, zb], [B.x1, 80, zb]], conc);       // lintel, chamfered top edge
  for (const [xa, xb] of [[B.x0, B.x0 + B.wall], [B.x1 - B.wall, B.x1]]) {
    hull([[xa, B.foot, zf], [xb, B.foot, zf], [xa, B.foot, B.z1], [xb, B.foot, B.z1], [xa, 80, zf], [xb, 80, zf], [xa, roofY(B.z1), B.z1], [xb, roofY(B.z1), B.z1]], conc);
  }
  hull([[B.x0, 80, zb], [B.x1, 80, zb], [B.x0, roofY(B.z1), B.z1], [B.x1, roofY(B.z1), B.z1],
    [B.x0, 74, zb], [B.x1, 74, zb], [B.x0, roofY(B.z1) - 6, B.z1], [B.x1, roofY(B.z1) - 6, B.z1]], conc);                   // roof slab

  // ---- battered shoulders: sloped concrete wedges either side, running the face down into the hill
  for (const s of [-1, 1]) {
    const xe = s < 0 ? B.x0 : B.x1, xo = xe + s * 20;
    hull([[xe, B.foot, zf], [xe, 76, zf], [xo, B.foot, zf + 2], [xo, B.foot, zf - 46], [xe, B.foot, zf - 46], [xe, 92, zf - 46], [xe + s * 6, 70, zf - 40]], concD);
    // drain channel + edge lip at the foot of the wedge
    box(Math.min(xe, xo), Math.max(xe, xo), -0.2, 0.5, zf + 2, zf + 3.2, dark, 0.05);
  }

  // ---- blast visor over the gate (protects the leaves and rams from above)
  hull([[gl - 4, 80, zf], [gr + 4, 80, zf], [gl - 4, 84, zf], [gr + 4, 84, zf], [gl - 4, 81.6, zf + 13], [gr + 4, 81.6, zf + 13], [gl - 4, 80.4, zf + 13], [gr + 4, 80.4, zf + 13]], concD);
  for (let x = gl; x <= gr; x += 10) hull([[x - 0.6, 80, zf], [x + 0.6, 80, zf], [x - 0.6, 74, zf], [x + 0.6, 74, zf], [x - 0.6, 80.4, zf + 11], [x + 0.6, 80.4, zf + 11]], steel);   // brackets

  // ---- face details: recessed bands, louvre vents, observation slits, number, lights
  for (const [xa, xc] of [[B.x0, gl], [gr, B.x1]]) {
    for (const y of [18, 40]) box(xa + 1, xc - 1, y, y + 0.8, zf - 0.1, zf + 0.25, concD, 0.05);
    const xm = (xa + xc) / 2;
    box(xm - 5, xm + 5, 24, 34, zf, zf + 0.5, dark, 0.05);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 9.4), std({ map: louvreTex(), roughness: 0.6, metalness: 0.4 }));
    v.position.set(xm, 29, zf + 0.52); root.add(v);
    box(xm - 6, xm + 6, 34, 35, zf, zf + 1.6, steel, 0.05);
  }
  for (const xs of [B.x0 + 10, B.x1 - 10]) {                                                       // observation slits in the lintel
    box(xs - 6, xs + 6, 70.5, 72.5, zf - 0.2, zf + 0.15, glass, 0.03);
    hull([[xs - 7, 73, zf], [xs + 7, 73, zf], [xs - 7, 74, zf], [xs + 7, 74, zf], [xs - 7, 73, zf + 2.2], [xs + 7, 73, zf + 2.2]], concD);
  }
  {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), std({
      map: canvasTex(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(222,216,198,0.85)'; x.font = '700 200px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('04', w / 2, h / 2 + 10); }),
      transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    num.position.set((B.x0 + gl) / 2, 52, zf + 0.06); root.add(num);
  }
  for (const xs of [B.x0 + 4, gl - 4, gr + 4, B.x1 - 4]) {                                         // wall lights
    box(xs - 0.8, xs + 0.8, 60, 61, zf, zf + 1.2, dark, 0.05);
    box(xs - 0.7, xs + 0.7, 59.7, 60, zf + 0.1, zf + 1.1, lamp, 0.02);
  }

  // ---- hilltop installations, each footed on the hill surface
  const foot = (x, z, w, d) => Math.min(hillY(x - w / 2, z - d / 2), hillY(x + w / 2, z - d / 2), hillY(x - w / 2, z + d / 2), hillY(x + w / 2, z + d / 2), hillY(x, z)) - 1;
  {
    const x = cx - 46, z = -300, y = foot(x, z, 22, 22);                                            // radar dome on a concrete drum
    box(x - 11, x + 11, y, y + 7, z - 11, z + 11, conc);
    b.add(sphere(9.5, 20, 12), std({ color: 0xc9cbc5, roughness: 0.6 }), [x, y + 7, z]);
    b.add(sphere(0.5, 8, 6), beacon, [x, y + 17, z]);
  }
  for (const [x, z] of [[cx + 30, -262], [cx - 6, -372]]) {                                         // ventilation shafts
    const y = foot(x, z, 9, 9);
    box(x - 4.5, x + 4.5, y, y + 9, z - 4.5, z + 4.5, conc);
    box(x - 5.2, x + 5.2, y + 9, y + 10, z - 5.2, z + 5.2, concD);
    for (const s of [-1, 1]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), std({ map: louvreTex(), roughness: 0.6, metalness: 0.4 }));
      v.position.set(x, y + 6, z + s * 4.56); v.rotation.y = s < 0 ? PI : 0; root.add(v);
    }
  }
  {
    const x = cx + 52, z = -330, y = foot(x, z, 4, 4);                                              // antenna mast
    box(x - 2, x + 2, y, y + 1.5, z - 2, z + 2, conc);
    b.add(cyl(0.35, 0.2, 28, 8), steel, [x, y + 15.5, z]);
    for (const h of [10, 18, 25]) box(x - 2.5, x + 2.5, y + h, y + h + 0.3, z - 0.15, z + 0.15, steel, 0.02);
    b.add(sphere(0.5, 8, 6), beacon, [x, y + 30, z]);
  }
  boulders(b, rock, rockD);
  root.add(b.build());
}

// far ridge: low silhouettes deep in the fog, kept small so the bunker hill stays the subject
export function buildFarRidge(root) {
  const r = rng(77);
  const make = (z, base, amp, color, seed) => {
    const pos = [], step = 60, n = Math.floor(4400 / step);
    const h = x => base + amp * (0.55 * Math.sin(x * 0.0021 + seed) + 0.3 * Math.sin(x * 0.0057 + seed * 2.3) + 0.15 * Math.sin(x * 0.013 + seed * 5.1)) + r() * amp * 0.12;
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const x = -2200 + i * step, hh = Math.max(15, h(x));
      rows.push([[x, L.waterY - 2, z + 40], [x, hh, z - 60 - r() * 40], [x, hh * 0.55, z - 380]]);
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      const a = rows[i][k], b = rows[i + 1][k], c = rows[i][k + 1], d = rows[i + 1][k + 1];
      pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, std({ color, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    mesh.name = 'farRidge'; root.add(mesh);
  };
  make(-1250, 70, 60, 0x34404a, 1.3);
  make(-1750, 120, 90, 0x3d4a55, 4.1);
}
