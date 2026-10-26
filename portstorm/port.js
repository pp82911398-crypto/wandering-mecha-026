// Outdoor port: quay, sea wall, mountain headland with the gate cut into it, three empty pads,
// the stopping pad with its maintenance tower, military buildings, vehicles, people and the berthed frigate.
// First pass: everything is boxes / simple solids, sized against the 40-unit Jaeger.
import * as THREE from 'three';
import { PI, cbox, cyl, ring, sphere, Batch } from '../src/kit.js';
import { canvasTex, fbm, rng, FONT_EN, FONT_CN } from '../src/materials.js';
import { L } from './layout.js';
import { buildBunkerHill, buildFarRidge } from './block.js';

const V3 = THREE.Vector3;

const std = (p) => new THREE.MeshStandardMaterial(p);

function concreteTexture() {
  const S = 512, n = fbm(S, [8, 16, 32, 64, 128], 5), n2 = fbm(S, [4, 8, 16], 9);
  return canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 118 + n[i] * 46 - n2[i] * 18;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.995; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const r = rng(31);
    x.strokeStyle = 'rgba(40,38,34,0.20)'; x.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      let px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
  }, { repeat: true });
}

// top-down surface for the whole quay (x -340..42, z -145..155): apron, road, stopping pad, helipad, markings
function quayTexture() {
  const W = 2048, H = 2048;
  const Q = L.quay, sx = W / (Q.x1 - Q.x0), sz = H / (Q.z1 - Q.z0);
  const X = x => (x - Q.x0) * sx, Z = z => (z - Q.z0) * sz;
  const Lw = (u) => Math.max(1, u * sx);
  return canvasTex(W, H, (c) => {
    // base concrete
    c.fillStyle = '#8f918a'; c.fillRect(0, 0, W, H);
    const r = rng(77);
    for (let i = 0; i < 2400; i++) {
      const x = r() * W, y = r() * H, s = 2 + r() * 34;
      c.fillStyle = `rgba(${r() < .5 ? '35,35,32' : '205,205,196'},${0.02 + r() * 0.04})`;
      c.beginPath(); c.ellipse(x, y, s, s * (0.4 + r()), r() * PI, 0, PI * 2); c.fill();
    }
    // inland yard: darker apron
    c.fillStyle = '#767a74'; c.fillRect(X(-340), Z(-145), X(-220) - X(-340), Z(90) - Z(-145));
    c.strokeStyle = 'rgba(30,30,28,0.18)'; c.lineWidth = 2;
    for (let z = -140; z < 90; z += 24) { c.beginPath(); c.moveTo(X(-340), Z(z)); c.lineTo(X(-220), Z(z)); c.stroke(); }
    // big slab joints
    c.strokeStyle = 'rgba(38,38,35,0.30)'; c.lineWidth = 3;
    for (let x = -320; x <= 40; x += 40) { c.beginPath(); c.moveTo(X(x), Z(-145)); c.lineTo(X(x), Z(155)); c.stroke(); }
    for (let z = -140; z <= 150; z += 40) { c.beginPath(); c.moveTo(X(-340), Z(z)); c.lineTo(X(42), Z(z)); c.stroke(); }
    // main road: gate -> stopping pad
    c.fillStyle = '#4f5353'; c.fillRect(X(-12), Z(-145), X(20) - X(-12), Z(92) - Z(-145));
    c.save(); c.beginPath(); c.rect(X(-12), Z(-145), X(20) - X(-12), Z(92) - Z(-145)); c.clip();
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(20,22,22,${0.03 + r() * 0.05})`; c.fillRect(X(-12 + r() * 32), Z(-145 + r() * 237), 2 + r() * 20, 2 + r() * 8); }
    c.restore();
    // road edge lines + center dashes
    const line = (x, z0, z1, w, col) => { c.fillStyle = col; c.fillRect(X(x) - Lw(w) / 2, Z(z0), Lw(w), Z(z1) - Z(z0)); };
    line(-10.4, -145, 90, 0.45, 'rgba(232,231,220,0.85)');
    line(18.4, -145, 90, 0.45, 'rgba(232,231,220,0.85)');
    c.fillStyle = 'rgba(214,166,35,0.9)';
    for (let z = -140; z < 86; z += 10) c.fillRect(X(3.8), Z(z), Lw(0.5), Z(z + 5) - Z(z));
    // arrows
    for (const az of [72, 20, -34, -96]) {
      c.fillStyle = 'rgba(225,224,212,0.62)';
      c.beginPath(); c.moveTo(X(4), Z(az + 6)); c.lineTo(X(0), Z(az)); c.lineTo(X(8), Z(az)); c.closePath(); c.fill();
      c.fillRect(X(3.3), Z(az - 2), Lw(1.4), Z(az) - Z(az - 2));
    }
    // stopping pad: lighter concrete, hazard frame, number
    const P = L.pad, px0 = X(P.cx - P.w / 2), px1 = X(P.cx + P.w / 2), pz0 = Z(P.cz - P.d / 2), pz1 = Z(P.cz + P.d / 2);
    c.fillStyle = '#a3a49c'; c.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    c.save(); c.beginPath(); c.rect(px0, pz0, px1 - px0, pz1 - pz0); c.clip();
    // hazard border (yellow / black chevrons)
    const hb = 1.5;
    c.fillStyle = '#1c1c1a'; c.fillRect(px0, pz0, px1 - px0, hb * sz); c.fillRect(px0, pz1 - hb * sz, px1 - px0, hb * sz);
    c.fillRect(px0, pz0, hb * sx, pz1 - pz0); c.fillRect(px1 - hb * sx, pz0, hb * sx, pz1 - pz0);
    c.fillStyle = '#d2a01c';
    for (let i = -200; i < 200; i += 4) {
      c.save(); c.beginPath(); c.rect(px0, pz0, px1 - px0, hb * sz); c.clip();
      c.beginPath(); c.moveTo(px0 + i * sx, pz0); c.lineTo(px0 + (i + 2) * sx, pz0); c.lineTo(px0 + (i - 2) * sx, pz0 + hb * sz); c.lineTo(px0 + (i - 4) * sx, pz0 + hb * sz); c.closePath(); c.fill();
      c.restore();
    }
    c.strokeStyle = 'rgba(235,234,222,0.8)'; c.lineWidth = Lw(0.4); c.strokeRect(px0 + 3.2 * sx, pz0 + 3.2 * sz, (P.w - 6.4) * sx, (P.d - 6.4) * sz);
    // four corner tie-downs
    c.strokeStyle = 'rgba(220,219,205,0.55)'; c.lineWidth = Lw(0.35);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c.beginPath(); c.arc(X(P.cx + dx * (P.w / 2 - 5)), Z(P.cz + dz * (P.d / 2 - 5)), 2.4 * sx, 0, PI * 2); c.stroke();
    }
    c.restore();
    // big number on the slab beside the pad
    c.fillStyle = 'rgba(232,230,215,0.78)'; c.font = `700 ${Math.round(17 * sx)}px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('04', X(-42), Z(118));
    c.font = `700 ${Math.round(3.2 * sx)}px ${FONT_EN}`; c.fillStyle = 'rgba(214,166,35,0.85)';
    c.fillText('PORT 04  ·  PAD 04  ·  KEEP CLEAR', X(-42), Z(100));
    // helipad
    const hp = L.helipad;
    c.save(); c.translate(X(hp.x), Z(hp.z));
    c.scale(1, sz / sx);
    c.fillStyle = '#7e807b'; c.beginPath(); c.arc(0, 0, hp.r * sx, 0, PI * 2); c.fill();
    c.strokeStyle = 'rgba(240,238,225,0.9)'; c.lineWidth = 0.9 * sx; c.beginPath(); c.arc(0, 0, (hp.r - 1.6) * sx, 0, PI * 2); c.stroke();
    c.strokeStyle = 'rgba(214,166,35,0.9)'; c.lineWidth = 0.7 * sx; c.beginPath(); c.arc(0, 0, (hp.r - 3.2) * sx, 0, PI * 2); c.stroke();
    c.fillStyle = 'rgba(240,238,225,0.88)'; c.font = `700 ${Math.round(11 * sx)}px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 0, 0);
    c.restore();
    // row pad aprons (plinths cover most of it)
    for (const z of L.row) {
      c.strokeStyle = 'rgba(214,166,35,0.75)'; c.lineWidth = Lw(0.45);
      c.strokeRect(X(L.rowX - 19), Z(z - 22), 38 * sx, 44 * sz);
      c.fillStyle = 'rgba(232,230,215,0.5)'; c.font = `700 ${Math.round(3 * sx)}px ${FONT_EN}`; c.textAlign = 'center';
      c.fillText('STANDBY', X(L.rowX), Z(z - 16));
    }
    // parking bays on the inland apron
    c.strokeStyle = 'rgba(225,223,208,0.45)'; c.lineWidth = Lw(0.3);
    for (let i = 0; i < 8; i++) c.strokeRect(X(-200 + i * 9), Z(24), 8 * sx, 16 * sz);
    // safety line at the water edge + bollard marks
    c.fillStyle = 'rgba(216,170,40,0.85)'; c.fillRect(X(38.6), Z(-140), Lw(0.5), Z(150) - Z(-140));
    c.fillStyle = 'rgba(235,234,222,0.65)';
    for (let z = -130; z < 150; z += 20) c.fillRect(X(39.6), Z(z), Lw(1.6), Lw(1.6) * (sz / sx));
    // grime and tyre tracks
    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(30,30,28,${0.02 + r() * 0.05})`;
      c.beginPath(); c.ellipse(r() * W, r() * H, 4 + r() * 40, 2 + r() * 9, r() * PI, 0, PI * 2); c.fill();
    }
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = `rgba(25,26,25,${0.05 + r() * 0.07})`; c.lineWidth = 2 + r() * 4;
      const x = X(-12 + r() * 30), z = Z(-100 + r() * 180);
      c.beginPath(); c.moveTo(x, z); c.bezierCurveTo(x + 30, z + 60, x - 40, z + 120, x + 10, z + 200); c.stroke();
    }
  });
}

function textPlane(text, w, h, color = '#d9d4c4', bg = null) {
  const tex = canvasTex(1024, 256, (c) => {
    c.clearRect(0, 0, 1024, 256);
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 1024, 256); }
    c.fillStyle = color; c.font = `700 132px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 512, 134);
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  return mesh;
}

// ---------- mountain / cliff ----------
const hash2 = (i, j, s) => { const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
function noise2(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function fbm2(x, z, oct = 4, s = 1) {
  let a = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * noise2(x, z, s + i * 13); norm += a; x *= 2.03; z *= 2.03; a *= 0.5; }
  return sum / norm;
}
function mountainH(x, z) {
  // the ridge is continuous over the whole gate: low right shoulder, tall peaks on the left
  const k = Math.min(1, Math.max(0, (-x - 60) / 280));
  const lm = k * k * (3 - 2 * k);
  const peaks = [[-430, -560, 160, 300], [-170, -480, 120, 250], [-680, -780, 200, 380], [-300, -880, 180, 340], [-520, -300, 130, 210]];
  let h = 100 + 24 * fbm2(x * 0.006, z * 0.006, 4, 3) + 16 * fbm2(x * 0.02, z * 0.02, 3, 9);
  h += lm * (95 + 24 * fbm2(x * 0.008, z * 0.008, 3, 7));
  for (const [px, pz, r, ph] of peaks) h += ph * lm * Math.exp(-(((x - px) / r) ** 2 + ((z - pz) / (r * 1.15)) ** 2));
  const front = Math.min(1, Math.max(0, (-z - 145) / 90));
  h = 96 + (h - 96) * (front * front * (3 - 2 * front));
  return Math.max(96, h + 7 * (fbm2(x * 0.09, z * 0.09, 2, 21) - 0.5) * front);
}

function buildMountain() {
  const g = new THREE.PlaneGeometry(L.mountain.x1 - L.mountain.x0, L.mountain.z0 - L.mountain.z1, 96, 78);
  g.rotateX(-PI / 2);
  const cx = (L.mountain.x0 + L.mountain.x1) / 2, cz = (L.mountain.z0 + L.mountain.z1) / 2;
  g.translate(cx, 0, cz);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cVeg = new THREE.Color(0x45543a), cVeg2 = new THREE.Color(0x626a46), cRock = new THREE.Color(0x6f695d), cDark = new THREE.Color(0x46443e);
  const cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = mountainH(x, z);
    pos.setY(i, h);
    const hx = mountainH(x + 6, z), hz = mountainH(x, z + 6);
    const slope = Math.min(1, (Math.abs(hx - h) + Math.abs(hz - h)) / 46);
    const n = fbm2(x * 0.05, z * 0.05, 3, 33);
    const rock = Math.min(1, Math.max(0, (h - 165) / 70) + slope * 0.75 + (n - 0.5) * 0.35);
    cc.copy(cVeg).lerp(cVeg2, n * 0.8).lerp(cRock, Math.min(1, rock)).lerp(cDark, slope * 0.35);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

// hard faceted rock panel, front face at z ≈ L.gate.z
function rockPanel(x0, x1, y0, y1, segX, segY, seed) {
  const pos = [], col = [], idx = [];
  const cA = new THREE.Color(0x6d665a), cB = new THREE.Color(0x47443d), cC = new THREE.Color(0x7e7566);
  const cc = new THREE.Color();
  for (let j = 0; j <= segY; j++) {
    const v = j / segY, y = y0 + (y1 - y0) * v;
    for (let i = 0; i <= segX; i++) {
      const u = i / segX, x = x0 + (x1 - x0) * u;
      const big = (fbm2(x * 0.014, y * 0.014, 3, seed) - 0.5) * 16;
      const mid = (fbm2(x * 0.06, y * 0.06, 3, seed + 5) - 0.5) * 6;
      const edge = Math.min(1, Math.min(i, segX - i) / 3) * Math.min(1, Math.min(j, segY - j) / 2);
      const z = L.gate.z + 2 + (big + mid) * (0.35 + 0.65 * edge);
      pos.push(x, y, z);
      const n = fbm2(x * 0.04, y * 0.045, 3, seed + 11);
      cc.copy(cA).lerp(cB, Math.max(0, 0.75 - n * 0.9)).lerp(cC, Math.min(1, Math.max(0, (y - y0) / Math.max(1, y1 - y0)) * 0.4));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) {
    const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

function addRock(b, mat, x, y, z, sx, sy, sz, seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const r = rng(seed * 3 + 1);
  g.scale(sx, sy, sz);
  g.rotateY(r() * PI); g.rotateZ((r() - 0.5) * 0.55); g.rotateX((r() - 0.5) * 0.25);
  g.translate(x, y, z);
  b.add(g, mat);
}

function buildCliff(root) {
  const g = L.gate, top = L.mountain.cliffTop;
  const left = rockPanel(L.mountain.x0, g.cx - g.w / 2, 0, top, 72, 22, 4);
  const right = rockPanel(g.cx + g.w / 2, L.mountain.x1, -6, top, 34, 22, 8);
  const upper = rockPanel(g.cx - g.w / 2, g.cx + g.w / 2, g.h, top, 20, 18, 12);
  root.add(left, right, upper);
  // Only small talus at the foot. The cliff itself is the layered rock-panel face + the
  // outdoor strata/ledges; no giant boulder blobs.
  const rock = std({ color: 0x64645c, roughness: 1, flatShading: true });
  const b = new Batch();
  for (const [i, x] of [-220, -178, -136, -96, -58, 50, 92, 134, 176].entries()) addRock(b, rock, x, 2 + (i % 3) * 1.4, L.gate.z + 9, 7 + (i % 3) * 3, 2.2 + (i % 2) * 2.0, 5, 60 + i);
  for (let i = 0; i < 4; i++) addRock(b, rock, 48 + i * 26, -1 + i * 3, L.gate.z + 7 - i * 3, 8 + (i % 2) * 3, 3 + i * 0.6, 6, 80 + i);
  root.add(b.build());

}

function buildIslands(root) {
  const mats = std({ color: 0x6d7d83, roughness: 1, flatShading: true });
  const b = new Batch();
  const r = rng(12);
  const spots = [[260, -620, 26, 110], [430, -820, 34, 150], [-250, -930, 30, 130], [-720, -1080, 44, 180], [640, -1050, 22, 90], [120, -1250, 30, 140]];
  for (const [x, z, h, rad] of spots) {
    const g = new THREE.ConeGeometry(rad, h, 7, 1);
    g.rotateY(r() * PI); g.translate(x, L.waterY + h / 2, z); b.add(g, mats);
    const g2 = new THREE.ConeGeometry(rad * 0.55, h * 0.75, 6, 1);
    g2.rotateY(r() * PI); g2.translate(x + rad * 0.35, L.waterY + h * 0.37, z - rad * 0.2); b.add(g2, mats);
  }
  root.add(b.build(false));
}

// ---------- static structures ----------
function scaffoldCage(b, m, x0, z0, x1, z1, h, sides = 'nsew') {
  const step = 4.6, t = 0.26;
  const edges = { s: [[x0, z0], [x1, z0]], n: [[x0, z1], [x1, z1]], w: [[x0, z0], [x0, z1]], e: [[x1, z0], [x1, z1]] };
  for (const s of sides) {
    const [a, c] = edges[s], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = a[0] + dx * u, z = a[1] + dz * u;
      b.add(cbox(t, h, t, 0.02), m.scaffold, [x, h / 2, z]);
      b.add(cbox(0.5, 0.12, 0.5, 0.02), m.scaffold, [x, 0.12, z]);
    }
    for (const y of [1.4, 4.6, 7.8]) {
      const g = cbox(t * 0.75, t * 0.75, len, 0.02); g.rotateY(Math.atan2(dx, dz));
      b.add(g, m.scaffold, [a[0] + dx / 2, y, a[1] + dz / 2]);
    }
    // X braces every other bay
    for (let i = 0; i < n; i += 2) {
      const u0 = i / n, u1 = Math.min(1, (i + 2) / n);
      const p0 = [a[0] + dx * u0, a[1] + dz * u0], p1 = [a[0] + dx * u1, a[1] + dz * u1];
      const L2 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], 7.7), ang = Math.atan2(7.7, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
      for (const sg of [-1, 1]) {
        const g = cbox(0.12, 0.12, L2, 0.01); g.rotateX(sg * ang); g.rotateY(Math.atan2(dx, dz));
        b.add(g, m.scaffold, [(p0[0] + p1[0]) / 2, 4.2, (p0[1] + p1[1]) / 2]);
      }
    }
    // toe boards + planks
    for (const y of [4.55, 7.75]) {
      const g = cbox(0.06, 0.55, len, 0.01); g.rotateY(Math.atan2(dx, dz));
      b.add(g, m.wood, [a[0] + dx / 2, y + 0.3, a[1] + dz / 2]);
      const p = cbox(1.0, 0.12, len, 0.02); p.rotateY(Math.atan2(dx, dz));
      b.add(p, m.wood, [a[0] + dx / 2, y, a[1] + dz / 2]);
    }
  }
}

function maintTower(b, m, pm, x, z, h, face = 1, seed = 1) {
  const W = L.tower.w, D = L.tower.d, hw = W / 2;
  b.add(cbox(13, 1.6, 13, 0.15), m.concrete, [x, 0.8, z]);
  for (const sx of [-hw, hw]) for (const sz of [-D / 2, D / 2]) b.add(cbox(0.9, h, 0.9, 0.06), m.steel, [x + sx, h / 2, z + sz]);
  for (let y = 5.5; y < h; y += 5.5) {
    for (const sz of [-D / 2, D / 2]) b.add(cbox(W, 0.4, 0.4, 0.04), m.steel, [x, y, z + sz]);
    for (const sx of [-hw, hw]) b.add(cbox(0.4, 0.4, D, 0.04), m.steel, [x + sx, y, z]);
    const l = Math.hypot(W, 5.5), ang = Math.atan2(5.5, W);
    for (const sg of [-1, 1]) for (const sz of [-D / 2, D / 2]) { const g = cbox(0.16, 0.16, l, 0.01); g.rotateX(sg * ang); b.add(g, m.steel, [x, y - 2.75, z + sz]); }
  }
  // cantilevered work decks toward the Jaeger (+x)
  for (const y of [11, 19, 27, 35, 43]) {
    if (y > h - 3) continue;
    const Ld = 13;
    b.add(cbox(Ld, 0.5, 7.0, 0.06), m.grate, [x + hw + Ld / 2 - 0.6, y, z]);
    b.add(cbox(Ld, 0.35, 0.3, 0.03), m.yellow, [x + hw + Ld / 2 - 0.6, y - 0.45, z + 3.4]);
    for (const dz of [-3.3, 3.3]) b.add(cbox(Ld, 0.3, 0.3, 0.03), m.yellow, [x + hw + Ld / 2 - 0.6, y - 0.45, z + dz]);
    // railings
    for (const dz of [-3.4, 3.4]) {
      b.add(cbox(Ld, 0.1, 0.1, 0.01), m.rail, [x + hw + Ld / 2 - 0.6, y + 1.05, z + dz]);
      for (let i = 0; i <= 4; i++) b.add(cbox(0.1, 1.0, 0.1, 0.01), m.rail, [x + hw + Ld * i / 4 - 0.6, y + 0.5, z + dz]);
    }
    b.add(cbox(0.12, 0.12, 7.0, 0.01), m.rail, [x + hw + Ld - 0.7, y + 1.05, z]);
    for (const dz of [-3.4, 3.4]) b.add(cbox(0.1, 1.0, 0.1, 0.01), m.rail, [x + hw + Ld - 0.7, y + 0.5, z + dz]);
    // a worker on a couple of decks
    if (y === 19 || y === 35) person(b, pm, x + hw + 3.5, y + 0.25, z + 1.4 * face, -PI / 2 * face, seed + y);
    // work light
    b.add(cbox(0.8, 0.5, 0.4, 0.03), m.dark, [x + hw + 1.2, y + 1.4, z - 3.2]);
    b.add(cbox(0.7, 0.4, 0.05, 0.01), m.lampOff, [x + hw + 1.2, y + 1.4, z - 3.44]);
  }
  // yellow elevator shaft on the back
  const ex = x - hw - 2.2;
  b.add(cbox(3.0, h - 2, 3.2, 0.08), m.elevator, [ex, (h - 2) / 2 + 0.6, z]);
  for (let y = 3; y < h - 2; y += 5.5) b.add(cbox(3.1, 0.25, 3.3, 0.03), m.dark, [ex, y, z]);
  b.add(cbox(3.4, 1.0, 3.6, 0.1), m.dark, [ex, h - 0.6, z]);
  b.add(cbox(4.4, 3.2, 4.6, 0.15), m.dark, [x, h + 1.6, z]);
  b.add(cbox(4.5, 0.3, 4.7, 0.04), m.yellow, [x, h + 3.3, z]);
  for (const sx of [-1.6, 1.6]) b.add(cbox(1.4, 0.9, 0.3, 0.05), m.lampOff, [x + sx, h + 2.2, z - 2.35]);
  b.add(sphere(0.32, 8, 6), m.beaconR, [x, h + 3.7, z]);
  // ladder up the leg
  for (let y = 1; y < h; y += 0.8) b.add(cbox(0.12, 0.08, 0.8, 0.01), m.steel, [x - hw - 0.6, y, z]);
  for (const dz of [-0.35, 0.35]) b.add(cbox(0.08, h, 0.08, 0.01), m.steel, [x - hw - 0.95, h / 2, z + dz]);
}

function rowPad(b, m, z) {
  const x = L.rowX, W = L.rowW, D = L.rowD, top = L.rowTop;
  b.add(cbox(W + 4, 0.7, D + 4, 0.18), m.concreteD, [x, 0.35, z]);
  b.add(cbox(W, top - 0.7, D, 0.25), m.concrete, [x, 0.7 + (top - 0.7) / 2, z]);
  // hazard edge + locking marks
  for (const sx of [-1, 1]) b.add(cbox(1.0, 0.12, D, 0.03), m.yellow, [x + sx * (W / 2 - 0.5), top + 0.06, z]);
  for (const sz of [-1, 1]) b.add(cbox(W, 0.12, 1.0, 0.03), m.yellow, [x, top + 0.06, z + sz * (D / 2 - 0.5)]);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(cbox(3.2, 0.1, 3.2, 0.08), m.steel, [x + dx * (W / 2 - 6), top + 0.05, z + dz * (D / 2 - 6)]);
  maintTower(b, m, m.pm, L.rowTowerX, z, 46, 1, z);
}

function person(b, m, x, y, z, rot = 0, seed = 0) {
  const r = rng(seed * 17 + 5), s = 0.9 + r() * 0.12;
  const add = (g, mat, p, rr = 0, sc = [1, 1, 1]) => {
    g.scale(sc[0] * s, sc[1] * s, sc[2] * s);
    if (rr) g.rotateY(rr);
    g.translate(x + p[0] * s, y + p[1] * s, z + p[2] * s);
    b.add(g, mat);
  };
  const helmet = [m.hatW, m.hatY, m.hatO][Math.floor(r() * 3)];
  add(cbox(0.11, 0.36, 0.12, 0.02), m.suit, [-0.08, 0.18, 0], 0);
  add(cbox(0.11, 0.36, 0.12, 0.02), m.suit, [0.08, 0.18, 0], 0);
  add(cbox(0.26, 0.34, 0.17, 0.03), m.suit, [0, 0.5, 0], 0);
  add(cbox(0.29, 0.12, 0.19, 0.02), m.vest, [0, 0.55, 0], 0);
  add(cbox(0.075, 0.3, 0.09, 0.02), m.suit, [-0.18, 0.5, 0.01], 0.12);
  add(cbox(0.075, 0.3, 0.09, 0.02), m.suit, [0.18, 0.5, 0.01], -0.12);
  add(sphere(0.09, 8, 6), m.skin, [0, 0.73, 0], 0);
  add(new THREE.SphereGeometry(0.115, 8, 5, 0, PI * 2, 0, PI / 2), helmet, [0, 0.77, 0], 0);
}

function truck(b, m, x, z, rot = 0, color = null) {
  const C = color || m.olive;
  const add = (g, mat, p) => { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mat); };
  add(cbox(2.0, 0.5, 3.8, 0.06), m.dark, [0, 0.9, 0]);
  add(cbox(1.95, 1.25, 1.25, 0.1), C, [0, 1.65, 1.25]);
  add(cbox(1.7, 0.55, 0.08, 0.02), m.glass, [0, 1.9, 1.9]);
  add(cbox(1.9, 0.45, 2.3, 0.08), C, [0, 1.35, -0.8]);
  add(cbox(1.7, 0.35, 2.1, 0.05), m.dark, [0, 1.65, -0.8]);
  for (const wx of [-0.95, 0.95]) for (const wz of [-1.25, 1.25]) {
    const g = cyl(0.42, 0.42, 0.32, 12); g.rotateZ(PI / 2); g.translate(wx, 0.42, wz); g.rotateY(rot); g.translate(x, 0, z); b.add(g, m.tire);
  }
  add(cbox(0.35, 0.12, 0.06, 0.01), m.lampOn, [0.7, 1.35, 1.9]);
  add(cbox(0.35, 0.12, 0.06, 0.01), m.lampOn, [-0.7, 1.35, 1.9]);
}

function jeep(b, m, x, z, rot = 0) {
  const add = (g, mat, p) => { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mat); };
  add(cbox(1.3, 0.55, 2.5, 0.06), m.olive, [0, 0.55, 0]);
  add(cbox(1.2, 0.45, 0.9, 0.05), m.dark, [0, 0.95, -0.2]);
  add(cbox(0.08, 0.55, 0.08, 0.01), m.steel, [-0.55, 0.95, -0.65]);
  add(cbox(0.08, 0.55, 0.08, 0.01), m.steel, [0.55, 0.95, -0.65]);
  add(cbox(1.15, 0.08, 0.1, 0.01), m.steel, [0, 1.2, -0.65]);
  add(cbox(0.1, 0.4, 0.1, 0.01), m.tire, [0, 0.9, 1.1]);
  for (const wx of [-0.62, 0.62]) for (const wz of [-0.8, 0.85]) {
    const g = cyl(0.34, 0.34, 0.28, 10); g.rotateZ(PI / 2); g.translate(wx, 0.34, wz); g.rotateY(rot); g.translate(x, 0, z); b.add(g, m.tire);
  }
}

function forklift(b, m, x, z, rot = 0) {
  const add = (g, mat, p) => { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mat); };
  add(cbox(1.0, 0.85, 1.6, 0.06), m.yellow, [0, 0.6, 0]);
  add(cbox(0.95, 0.08, 1.4, 0.02), m.dark, [0, 1.55, -0.1]);
  for (const sx of [-0.42, 0.42]) add(cbox(0.07, 1.4, 0.07, 0.01), m.dark, [sx, 1.0, -0.55]);
  for (const sx of [-0.3, 0.3]) add(cbox(0.08, 2.4, 0.1, 0.01), m.steel, [sx, 1.25, 0.85]);
  for (const sx of [-0.28, 0.28]) add(cbox(0.12, 0.05, 1.0, 0.01), m.steel, [sx, 0.18, 1.25]);
  add(cbox(0.3, 0.1, 0.3, 0.01), m.beacon, [0, 1.65, -0.1]);
  for (const wx of [-0.52, 0.52]) for (const wz of [-0.55, 0.55]) {
    const g = cyl(0.27, 0.27, 0.2, 10); g.rotateZ(PI / 2); g.translate(wx, 0.27, wz); g.rotateY(rot); g.translate(x, 0, z); b.add(g, m.tire);
  }
}

function container(b, m, x, y, z, rot, mat) {
  const g = cbox(6.0, 1.28, 1.2, 0.05); g.translate(0, 0.64, 0); g.rotateY(rot); g.translate(x, y, z); b.add(g, mat);
  for (let i = -2.6; i <= 2.6; i += 0.55) { const r = cbox(0.1, 1.12, 1.26, 0.01); r.translate(i, 0.64, 0); r.rotateY(rot); r.translate(x, y, z); b.add(r, mat); }
}

function craneTruck(b, m, x, z, rot = 0) {
  const add = (g, mat, p) => { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mat); };
  add(cbox(2.2, 0.7, 5.0, 0.08), m.olive, [0, 0.9, 0]);
  add(cbox(2.0, 1.2, 1.4, 0.08), m.olive, [0, 1.75, 1.7]);
  add(cbox(1.7, 0.5, 0.08, 0.02), m.glass, [0, 2.0, 2.35]);
  add(cbox(1.2, 1.0, 1.2, 0.06), m.yellow, [0, 1.7, -1.6]);
  const boom = cbox(0.55, 0.55, 9.0, 0.05); boom.rotateX(-0.55); add(boom, m.yellow, [0, 3.0, -1.4]);
  for (const wx of [-1.0, 1.0]) for (const wz of [-1.7, 1.7]) {
    const g = cyl(0.58, 0.58, 0.38, 12); g.rotateZ(PI / 2); g.translate(wx, 0.58, wz); g.rotateY(rot); g.translate(x, 0, z); b.add(g, m.tire);
  }
}

// ---------- frigate ----------
function buildShip() {
  const g = new THREE.Group();
  const S = L.ship;
  g.position.set(S.x, 0, S.z);
  const b = new Batch();
  const navy = std({ color: 0x5d686b, roughness: 0.62, metalness: 0.25 });
  const deck = std({ color: 0x383d3e, roughness: 0.85 });
  const dark = std({ color: 0x2b3132, roughness: 0.7, metalness: 0.3 });
  const red = std({ color: 0x6d2d26, roughness: 0.8 });
  const white = std({ color: 0xd8d9d2, roughness: 0.6 });
  const glass = std({ color: 0x1a262a, roughness: 0.15, metalness: 0.7 });

  const Lh = S.len, B = S.beam, H = 8.5, keel = -6.0;
  const shape = new THREE.Shape();
  const l2 = Lh / 2, b2 = B / 2;
  shape.moveTo(-l2, b2);
  shape.lineTo(l2 * 0.55, b2);
  shape.quadraticCurveTo(l2 * 0.94, b2 * 0.7, l2, 0);
  shape.quadraticCurveTo(l2 * 0.94, -b2 * 0.7, l2 * 0.55, -b2);
  shape.lineTo(-l2, -b2);
  shape.lineTo(-l2 * 0.94, 0);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 10 });
  hull.rotateX(-PI / 2); hull.rotateY(-PI / 2); hull.translate(0, keel, 0);
  b.add(hull, navy);
  // boot stripe + deck
  b.add(cbox(B + 0.25, 0.9, Lh * 0.86, 0.05), red, [0, keel + 2.0, 0]);
  b.add(cbox(B - 0.3, 0.35, Lh * 0.9, 0.06), deck, [0, keel + H - 0.2, 0]);
  // bulwark
  for (const sx of [-1, 1]) b.add(cbox(0.22, 1.3, Lh * 0.78, 0.04), navy, [sx * (B / 2 - 0.12), keel + H + 0.45, 0]);
  // superstructure
  b.add(cbox(B - 1.2, 4.2, 9.5, 0.2), navy, [0, keel + H + 2.3, 5.0]);
  b.add(cbox(B - 1.8, 2.4, 6.2, 0.15), navy, [0, keel + H + 5.6, 5.6]);
  b.add(cbox(B - 1.4, 0.9, 5.6, 0.06), glass, [0, keel + H + 6.2, 5.6]);
  b.add(cbox(B - 2.2, 1.4, 6.6, 0.12), deck, [0, keel + H + 7.1, 5.6]);
  // mast
  for (const sx of [-0.4, 0.4]) b.add(cbox(0.18, 7.0, 0.18, 0.02), dark, [sx, keel + H + 10.5, 4.8]);
  for (let i = 0; i < 5; i++) b.add(cbox(1.0, 0.12, 0.12, 0.01), dark, [0, keel + H + 7.5 + i * 1.5, 4.8]);
  b.add(cbox(1.6, 0.4, 0.5, 0.04), white, [0, keel + H + 14.2, 4.8]);
  // hangar / helideck aft
  b.add(cbox(B - 1.6, 3.2, 9.5, 0.15), navy, [0, keel + H + 1.7, -15]);
  const pad = new THREE.CircleGeometry(4.6, 28); pad.rotateX(-PI / 2); pad.translate(0, keel + H + 0.05, -27); b.add(pad, deck);
  for (const sx of [-1, 1]) for (let z = -31; z <= -21; z += 5) b.add(cbox(0.12, 0.12, 2.6, 0.01), white, [sx * 3.6, keel + H + 0.12, z]);
  // gun + VLS + CIWS
  b.add(cyl(1.7, 1.9, 1.1, 16), dark, [0, keel + H + 0.55, 27]);
  const barrel = cyl(0.24, 0.24, 5.0, 10); barrel.rotateX(PI / 2); b.add(barrel, dark, [0, keel + H + 1.2, 30]);
  b.add(cbox(5.0, 0.5, 3.4, 0.06), dark, [0, keel + H + 0.35, 20]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.add(cbox(0.55, 0.55, 0.55, 0.02), white, [-1.4 + j * 1.4, keel + H + 0.75, 18.6 + i * 0.7]);
  b.add(cbox(0.9, 1.2, 0.9, 0.05), white, [0, keel + H + 4.9, -8.5]);
  // railings (sparse, reads at distance)
  for (const sx of [-1, 1]) for (let z = -32; z <= 30; z += 3.2) b.add(cbox(0.06, 0.9, 0.06, 0.01), dark, [sx * (B / 2 - 0.3), keel + H + 0.75, z]);
  for (const sx of [-1, 1]) b.add(cbox(0.06, 0.06, Lh * 0.82, 0.01), dark, [sx * (B / 2 - 0.3), keel + H + 1.2, 0]);
  // hull number facing the quay (-x)
  const num = textPlane('04', 8, 2.2, '#d9d9d0');
  num.position.set(-B / 2 - 0.08, keel + 4.5, 8); num.rotation.y = -PI / 2; g.add(num);

  g.add(b.build());
  return g;
}

function buildBoats(root) {
  const mat = std({ color: 0xd6d9d4, roughness: 0.6 });
  const dark = std({ color: 0x2f383c, roughness: 0.7 });
  const b = new Batch();
  const boats = [[190, -150, 0.4], [330, -420, -0.6], [520, -760, 0.2], [120, -560, 1.2]];
  for (const [x, z, rot] of boats) {
    const hull = cbox(7, 1.6, 2.6, 0.2); hull.translate(0, 0.8, 0); hull.rotateY(rot); hull.translate(x, L.waterY, z); b.add(hull, mat);
    const cab = cbox(2.4, 1.4, 2.0, 0.12); cab.translate(-0.8, 2.1, 0); cab.rotateY(rot); cab.translate(x, L.waterY, z); b.add(cab, mat);
    const win = cbox(1.8, 0.45, 2.05, 0.03); win.translate(-0.8, 2.35, 0); win.rotateY(rot); win.translate(x, L.waterY, z); b.add(win, dark);
  }
  root.add(b.build(false));
}

// ---------- port assembly ----------
export function buildPort() {
  const root = new THREE.Group();
  root.name = 'port';

  const mapConc = concreteTexture();
  mapConc.repeat.set(10, 3);
  const m = {
    concrete: std({ color: 0xffffff, map: mapConc, roughness: 0.93, metalness: 0 }),
    concreteD: std({ color: 0x7a7c76, roughness: 0.95 }),
    concreteEdge: std({ color: 0x6d706b, roughness: 0.9 }),
    steel: std({ color: 0x5b6266, roughness: 0.5, metalness: 0.65 }),
    dark: std({ color: 0x2c3033, roughness: 0.65, metalness: 0.35 }),
    grate: std({ color: 0x484e51, roughness: 0.7, metalness: 0.45 }),
    rail: std({ color: 0xb58a1c, roughness: 0.5, metalness: 0.35 }),
    yellow: std({ color: 0xc79a22, roughness: 0.55, metalness: 0.25 }),
    elevator: std({ color: 0x9b9a4b, roughness: 0.55, metalness: 0.35 }),
    scaffold: std({ color: 0xa58a5e, roughness: 0.65, metalness: 0.3 }),
    wood: std({ color: 0x7a6142, roughness: 0.9 }),
    rubber: std({ color: 0x161718, roughness: 0.9 }),
    olive: std({ color: 0x565a42, roughness: 0.7 }),
    tint: std({ color: 0x8b8a72, roughness: 0.7 }),
    tire: std({ color: 0x151616, roughness: 0.95 }),
    glass: std({ color: 0x1c2a2e, roughness: 0.2, metalness: 0.6 }),
    lampOn: std({ color: 0xfff2d5, emissive: 0xffe6bc, emissiveIntensity: 1.4, roughness: 0.4 }),
    lampOff: std({ color: 0x8f928c, roughness: 0.45, metalness: 0.4 }),
    beaconR: std({ color: 0x7a1a14, emissive: 0xff2418, emissiveIntensity: 3.2, roughness: 0.4 }),
    suit: std({ color: 0x2a2f31, roughness: 0.85 }),
    vest: std({ color: 0xb9c443, roughness: 0.6, emissive: 0x232700, emissiveIntensity: 0.5 }),
    skin: std({ color: 0x8a6a52, roughness: 0.8 }),
    hatW: std({ color: 0xd8d5cb, roughness: 0.4 }),
    hatY: std({ color: 0xd3a01c, roughness: 0.45 }),
    hatO: std({ color: 0xc55a1c, roughness: 0.5 }),
    rust: std({ color: 0x804a30, roughness: 0.85 }),
    blue: std({ color: 0x2f4e5c, roughness: 0.8 }),
  };
  m.pm = {
    suit: m.suit, vest: m.vest, skin: m.skin, hatW: m.hatW, hatY: m.hatY, hatO: m.hatO,
  };

  // ---- quay box + top markings ----
  const Q = L.quay, qw = Q.x1 - Q.x0, qd = Q.z1 - Q.z0;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(qw, Q.thick, qd), m.concrete);
  slab.position.set((Q.x0 + Q.x1) / 2, Q.top - Q.thick / 2, (Q.z0 + Q.z1) / 2);
  slab.receiveShadow = true; slab.castShadow = true;
  root.add(slab);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(qw, qd), std({ map: quayTexture(), roughness: 0.9, metalness: 0.02 }));
  top.rotation.x = -PI / 2;
  top.position.set((Q.x0 + Q.x1) / 2, Q.top + 0.02, (Q.z0 + Q.z1) / 2);
  top.receiveShadow = true;
  root.add(top);

  // water-edge wall, fenders, bollards, a service ledge
  {
    const b = new Batch();
    b.add(cbox(1.6, 9, qd, 0.3), m.concreteEdge, [Q.x1 + 0.8, -4.5, (Q.z0 + Q.z1) / 2]);
    b.add(cbox(3.2, 0.5, qd, 0.1), m.dark, [Q.x1 - 1.6, Q.top - 0.15, (Q.z0 + Q.z1) / 2]);
    for (let z = -138; z < 152; z += 12) b.add(cbox(1.1, 2.6, 1.6, 0.15), m.rubber, [Q.x1 + 0.9, -2.6, z]);
    for (let z = -130; z < 152; z += 22) {
      b.add(cyl(0.5, 0.62, 1.5, 12), m.dark, [Q.x1 - 2.0, 0.75, z]);
      b.add(cyl(0.78, 0.78, 0.28, 12), m.dark, [Q.x1 - 2.0, 1.55, z]);
    }
    // lower service ledge
    b.add(cbox(2.2, 0.45, qd - 40, 0.1), m.grate, [Q.x1 + 1.5, -1.9, -10]);
    for (let z = -100; z < 140; z += 18) b.add(cbox(0.2, 1.05, 0.2, 0.02), m.rail, [Q.x1 + 2.4, -1.2, z]);
    b.add(cbox(0.08, 0.08, qd - 40, 0.01), m.rail, [Q.x1 + 2.4, -0.75, -10]);
    for (let z = -120; z < 150; z += 24) {
      const g = cbox(0.35, 4.0, 0.35, 0.03); g.rotateZ(0.6); b.add(g, m.steel, [Q.x1 + 0.4, -2.2, z]);
    }
    root.add(b.build());
  }

  // ---- bunker hill (replaces the mountain) + far ridge in the fog ----
  buildBunkerHill(root, m);
  buildFarRidge(root);

  // ---- buildings at the mountain foot ----
  {
    const b = new Batch();
    // hangar annex
    b.add(cbox(62, 17, 30, 0.4), m.concreteD, [-122, 8.5, -126]);
    b.add(cbox(62.4, 1.2, 30.4, 0.2), m.steel, [-122, 17.4, -126]);
    for (let i = 0; i < 7; i++) b.add(cbox(2.2, 17, 1.0, 0.1), m.concrete, [-150 + i * 9.2, 8.5, -141.2]);
    b.add(cbox(20, 9, 1.2, 0.1), m.dark, [-122, 5.4, -141.5]);
    b.add(cbox(18, 7.6, 0.4, 0.05), m.grate, [-122, 5.2, -141.9]);
    b.add(cbox(10, 4, 6, 0.2), m.dark, [-96, 20, -126]);
    b.add(cbox(3.2, 1.2, 3.2, 0.08), m.lampOff, [-84, 19, -128]);
    // control tower
    b.add(cbox(15, 14, 15, 0.3), m.concrete, [-168, 7, -122]);
    b.add(cbox(8.5, 26, 8.5, 0.2), m.concreteD, [-168, 26, -122]);
    b.add(cbox(14, 7, 14, 0.25), m.steel, [-168, 42, -122]);
    b.add(cbox(13.2, 3.4, 0.3, 0.05), m.glass, [-168, 43, -115.2]);
    b.add(cbox(0.3, 3.4, 13.2, 0.05), m.glass, [-175.2, 43, -122]);
    for (let i = 0; i < 6; i++) b.add(cbox(0.3, 2.0, 13.2, 0.05), m.dark, [-175.3 + i * 2.9, 36, -122]);
    b.add(cyl(0.24, 0.12, 16, 8), m.steel, [-168, 54, -122]);
    b.add(sphere(0.7, 8, 6), m.beaconR, [-168, 62, -122]);
    // radar dome
    b.add(cyl(9, 10, 5, 20), m.concrete, [-206, 2.5, -128]);
    b.add(sphere(9.2, 24, 14), std({ color: 0xd3d5cf, roughness: 0.7 }), [-206, 12, -128]);
    b.add(cyl(0.3, 0.2, 4, 6), m.steel, [-206, 24, -128]);
    // oil tanks + bund
    for (let i = 0; i < 4; i++) {
      b.add(cyl(8, 8, 12, 20), std({ color: 0x8d8f88, roughness: 0.75, metalness: 0.2 }), [-268 + i * 19, 6, -118]);
      b.add(cyl(8.15, 8.15, 0.6, 20), m.dark, [-268 + i * 19, 12.2, -118]);
      b.add(cbox(0.4, 12, 0.4, 0.04), m.steel, [-268 + i * 19 + 5.6, 6, -123.6]);
    }
    b.add(cbox(86, 2.4, 1.0, 0.1), m.concreteD, [-239, 1.2, -108]);
    // sheds / containers by the yard
    b.add(cbox(12, 5, 8, 0.2), m.concreteD, [-250, 2.5, -80]);
    container(b, m, -288, 0, -84, 0.1, m.rust);
    container(b, m, -282, 0, -84, 0.1, m.blue);
    // floodlight masts
    for (const [x, z] of [[-64, -100], [-192, -80], [-292, -70]]) {
      b.add(cyl(0.55, 0.8, 26, 10), m.steel, [x, 13, z]);
      b.add(cbox(4.2, 0.5, 1.0, 0.05), m.dark, [x, 26.2, z]);
      for (let i = 0; i < 4; i++) b.add(cbox(0.9, 0.7, 0.2, 0.02), m.lampOff, [x - 1.5 + i, 26.0, z - 0.55]);
    }
    root.add(b.build());
  }

  // ---- three empty pads + towers ----
  {
    const b = new Batch();
    for (const z of L.row) rowPad(b, m, z);
    // final stopping pad
    const P = L.pad;
    b.add(cbox(P.w + 2, 0.5, P.d + 2, 0.2), m.concreteEdge, [P.cx, 0.05, P.cz]);
    for (const sx of [-1, 1]) b.add(cbox(0.9, 0.5, P.d + 2, 0.12), m.yellow, [P.cx + sx * (P.w / 2 + 0.4), 0.4, P.cz]);
    b.add(cbox(P.w + 2, 0.5, 0.9, 0.12), m.yellow, [P.cx, 0.4, P.cz + P.d / 2 + 0.4]);
    // scaffolding on the inboard, outboard and seaward sides (approach stays open)
    
    maintTower(b, m, m.pm, L.tower.x, L.tower.z, L.tower.h, 1, 7);
    // pad edge lights
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.add(cbox(0.5, 1.2, 0.5, 0.05), m.dark, [P.cx + dx * (P.w / 2 + 0.3), 0.6, P.cz + dz * (P.d / 2 + 0.3)]);
      b.add(sphere(0.24, 8, 6), m.beaconR, [P.cx + dx * (P.w / 2 + 0.3), 1.35, P.cz + dz * (P.d / 2 + 0.3)]);
    }
    root.add(b.build());
  }

  // ---- vehicles, containers, people ----
  {
    const b = new Batch();
    truck(b, m, -18, 78, 0.1, m.tint);
    truck(b, m, -24, 62, -0.7, m.olive);
    truck(b, m, -30, 144, 0.4, m.tint);
    truck(b, m, 6, 148, PI, m.olive);
    jeep(b, m, -15.5, 92, 0.8);
    jeep(b, m, 28, 72, -0.3);
    jeep(b, m, -36, 148, 0.2);
    jeep(b, m, 14, 145, 0.1);
    forklift(b, m, -20, 104, 1.3);
    forklift(b, m, 31, 96, -0.6);
    craneTruck(b, m, -44, 62, 0.3);
    container(b, m, -32, 0, 70, PI / 2, m.rust);
    container(b, m, -35, 0, 70, PI / 2, m.blue);
    container(b, m, -33.5, 1.28, 70, PI / 2, m.tint);
    container(b, m, -60, 0, 156, 0.05, m.blue); // just off the pier head, reads as cargo
    container(b, m, -66, 0, 156, 0.05, m.rust);
    // ground crew
    const spots = [[-12, 86], [-10, 90], [26, 84], [29, 88], [2, 144], [7, 143], [-22, 50], [-28, 56], [-52, 118], [-58, 124], [31, 104], [37, 110], [-44, 90], [-40, 94], [-16, 66], [-2, 64], [34, 146], [30, 148]];
    spots.filter((_, i) => i % 2 === 0).forEach(([x, z], i) => person(b, m.pm, x, 0, z, i * 1.7, i + 3));
    root.add(b.build());

    const people = new Batch();
    for (let i = 0; i < 4; i++) person(people, m.pm, -46 + i * 3.6, 0, 138, -0.4 + i * 0.1, 20 + i);
    root.add(people.build());
  }

  // ---- frigate + distant boats ----
  root.add(buildShip());
  buildBoats(root);

  // ---- signs ----
  {
    const yard = textPlane('PORT 04', 18, 4.5, '#d2ccb9', '#2b2e2f');
    yard.position.set(-238, 6, -109.5);
    root.add(yard);
  }

  // shadows: structures cast, but don't ask the huge mountain/cliff to cast (outside the follow shadow box)
  root.traverse(o => {
    if (o.isMesh) { o.receiveShadow = true; if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere(); }
  });
  return { root, mats: m };
}
