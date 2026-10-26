// Bay dressing carried over from the old dome hangar (src/env.js), sized to this hall:
// gallery tiers along the walls with a field of small lit windows (one instanced draw call: human-scale rooms
// are the strongest scale cue), and a few crew walking slow loops on the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWalker } from '../src/env.js';

const box = (arr, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); arr.push(g); };

export function buildGallery(root, { gx, hallW, hallH, hallZ0, hallZ1, avoid = [] }) {
  const G = new THREE.Group(); G.name = 'gallery'; root.add(G);
  const deck = [], rail = [], led = [];
  const wallIn = hallW / 2 - 1.0, tiers = [46, 62, 78], z0 = hallZ0 - 6, z1 = hallZ1 + 5, len = z0 - z1, zc = (z0 + z1) / 2;
  for (const sx of [-1, 1]) for (const y of tiers) {
    const xw = gx + sx * wallIn, xe = xw - sx * 3.4;
    box(deck, 3.4, 0.45, len, (xw + xe) / 2, y, zc);
    box(led, 0.06, 0.28, len, xe - sx * 0.02, y - 0.05, zc);                             // amber fascia strip
    box(rail, 0.08, 0.08, len, xe + sx * 0.1, y + 1.1, zc);
    for (let z = z0; z >= z1; z -= 3) box(rail, 0.07, 1.1, 0.07, xe + sx * 0.1, y + 0.55, z);
    for (let z = z0 - 2; z >= z1; z -= 12) { const g = new THREE.BoxGeometry(0.4, 4.2, 0.5); g.rotateZ(sx * 0.62); g.translate(xw - sx * 1.3, y - 2.0, z); deck.push(g); }   // brackets
  }
  const mDeck = new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.65, metalness: 0.5 });
  const mRail = new THREE.MeshStandardMaterial({ color: 0xb58a1c, roughness: 0.55, metalness: 0.3 });
  const mLed = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffa040, emissiveIntensity: 1.6 });
  const d = new THREE.Mesh(mergeGeometries(deck), mDeck); d.castShadow = d.receiveShadow = true;
  G.add(d, new THREE.Mesh(mergeGeometries(rail), mRail), new THREE.Mesh(mergeGeometries(led), mLed));

  // lit windows: side walls (above each tier and scattered higher) + back wall; one InstancedMesh
  const r = (() => { let s = 808; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const N = 620, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const pal = [[1.0, 0.62, 0.3], [1.0, 0.8, 0.55], [0.55, 0.78, 1.0], [0.9, 0.95, 1.0]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3();
  let k = 0;
  const blocked = (x, y, z) => avoid.some(b => x > b[0] && x < b[1] && y > b[2] && y < b[3] && z > b[4] && z < b[5]);
  for (let tries = 0; k < N && tries < N * 4; tries++) {
    const onBack = r() < 0.25, y = r() < 0.7 ? tiers[Math.floor(r() * 3)] + 1.4 + r() * 1.6 : 28 + r() * (hallH - 36);
    let x, z, ry;
    if (onBack) { x = gx + (r() - 0.5) * (hallW - 8); z = hallZ1 + 0.06; ry = 0; }
    else { const sx = r() < 0.5 ? -1 : 1; x = gx + sx * (hallW / 2 - 0.82); z = hallZ0 - 6 - r() * (hallZ0 - hallZ1 - 10); ry = -sx * Math.PI / 2; }
    if (blocked(x, y, z)) continue;
    const w = r() < 0.15 ? 2.4 : 1;
    q.setFromAxisAngle(up, ry); m4.compose(new THREE.Vector3(x, y, z), q, S.set(w, 1, 1)); im.setMatrixAt(k, m4);
    const p = pal[Math.floor(r() * pal.length)], dim = 0.35 + r() * 0.65; im.setColorAt(k, c.setRGB(p[0] * dim, p[1] * dim, p[2] * dim)); k++;
  }
  im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.name = 'galleryWindows';   // removed by request: the window field didn't suit this hall (kept the code, not added)
  return G;
}

// crew walking slow back-and-forth loops; head-unit scale (old walker is in metres)
export function buildWalkers(root, paths) {
  const std = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const pm = { suit: std(0x2a2f31), vest: std(0xb9c443), skin: std(0x8a6a52), hatW: std(0xd8d5cb), hatY: std(0xd3a01c), hatO: std(0xc55a1c),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 2 }) };
  const walkers = paths.map(([a, b], i) => {
    const g = makeWalker(pm, 70 + i); g.scale.setScalar(1 / 2.05); g.traverse(o => { if (o.isMesh) o.castShadow = false; }); root.add(g);
    return { g, a: new THREE.Vector3(a[0], 0.03, a[1]), b: new THREE.Vector3(b[0], 0.03, b[1]), t: (i * 0.37) % 1, speed: 1.3 / a.length };
  });
  for (const w of walkers) w.len = w.a.distanceTo(w.b);
  return dt => {
    for (const w of walkers) {
      w.t = (w.t + dt * 0.6 / w.len) % 2;                                                  // ~0.6 units/s ≈ 1.2 m/s
      const u = w.t < 1 ? w.t : 2 - w.t, from = w.t < 1 ? w.a : w.b, to = w.t < 1 ? w.b : w.a;
      w.g.position.lerpVectors(w.a, w.b, u);
      w.g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    }
  };
}
