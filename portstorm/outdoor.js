// Exterior detail for the port: a short row of armored vehicles parked on the seaward side of the quay,
// a few supply crates, the landing ship and a tug, plus fill light for the bunker hill.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const R = Math.PI / 180;
let started = false;

function wait() {
  if (!window.__lab) return setTimeout(wait, 300);
  if (started) return;
  started = true;
  build();
}
wait();

function build() {
  const lab = window.__lab, scene = lab.scene, L = lab.L;
  const root = new THREE.Group(); root.name = 'outdoorDetail'; scene.add(root);

  const mk = o => new THREE.MeshStandardMaterial({ metalness: 0.15, ...o });
  const rock = mk({ color: 0x4d514f, roughness: 0.96, flatShading: true });
  const rock2 = mk({ color: 0x3a3f3e, roughness: 0.98, flatShading: true });
  const conc = mk({ color: 0x6c6e68, roughness: 0.9 });
  const concD = mk({ color: 0x4d504c, roughness: 0.92 });
  const steel = mk({ color: 0x3b4145, roughness: 0.5, metalness: 0.55 });
  const dark = mk({ color: 0x1a1f22, roughness: 0.6, metalness: 0.4 });
  const olive = mk({ color: 0x4c5240, roughness: 0.78, metalness: 0.12 });
  const olive2 = mk({ color: 0x3c4136, roughness: 0.8 });
  const rubber = mk({ color: 0x141617, roughness: 0.95 });
  const yellowD = mk({ color: 0xb58a1c, roughness: 0.55, metalness: 0.3 });
  const sand = mk({ color: 0x8d8268, roughness: 0.9 });
  const red = mk({ color: 0x8a2b22, roughness: 0.65 });
  const lampR = mk({ color: 0x7a1a14, emissive: 0xff2a1a, emissiveIntensity: 3.0, roughness: 0.4 });
  const lampW = mk({ color: 0xfff2d5, emissive: 0xffd9a0, emissiveIntensity: 3.2, roughness: 0.4 });
  const lens = mk({ color: 0xe8f4ff, emissive: 0xbfe0ff, emissiveIntensity: 3.0, roughness: 0.3 });

  const box = (w, h, d, mat, x, y, z, ry = 0, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; root.add(m); return m;
  };
  const cyl = (r1, r2, h, mat, x, y, z, seg = 10, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.rotation.z = rz; m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
  };

  // ---------------------------------------------------------------- armored vehicles on the quay
  const vehicles = [];
  let host = null;   // when set, box()/cyl() add to this vehicle group (local coords) instead of the root
  const vbox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; host.add(m); return m; };
  function wheels(g, xs, zs, y = 0.9) {
    for (const x of xs) for (const z of zs) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 14), rubber);
      w.rotation.x = Math.PI / 2; w.rotation.z = Math.PI / 2; w.position.set(x, y, z); w.castShadow = true; g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.74, 10), steel); hub.rotation.x = Math.PI / 2; hub.rotation.z = Math.PI / 2; hub.position.set(x, y, z); g.add(hub);
    }
  }
  function apc(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); vehicles.push(g); host = g;
    vbox(7.6, 1.7, 3.4, olive, 0, 1.9, 0);
    vbox(6.4, 1.0, 3.0, olive2, 0, 2.85, 0);
    vbox(2.6, 0.8, 2.2, olive, 0, 3.3, 0.2);
    vbox(1.6, 0.5, 0.5, dark, 0, 3.45, 1.5);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), dark); bar.rotation.x = Math.PI / 2; bar.position.set(0, 3.45, 2.8); g.add(bar);
    for (const sx of [-3.1, 3.1]) for (const sz of [-1.2, 1.2]) {
      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 8), dark); hatch.position.set(sx, 3.4, sz); g.add(hatch);
    }
    for (const sx of [-2.2, 2.2]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4), steel); ant.position.set(sx, 4.5, -1.1); g.add(ant);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 6), dark); stub.rotation.z = Math.PI / 2; stub.position.set(sx, 3.3, 1.6); g.add(stub);
    }
    wheels(g, [-2.8, 0, 2.8], [-1.55, 1.55]);
    return g;
  }
  function tank(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); vehicles.push(g); host = g;
    for (const sx of [-2.7, 2.7]) {
      vbox(0.9, 0.9, 8.2, dark, sx, 0.75, 0);
      for (let k = 0; k < 5; k++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.86, 12), rubber); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.72, -3 + k * 1.5); g.add(w); }
    }
    vbox(4.4, 1.1, 7.6, olive, 0, 1.6, 0);
    vbox(3.6, 0.7, 3.8, olive2, 0, 2.4, 0);
    const tur = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 1.2, 12), olive); tur.position.set(0, 3.2, 0.4); tur.castShadow = true; g.add(tur);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 5.4, 8), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, 3.2, 3.5); g.add(gun);
    for (let i = 0; i < 4; i++) vbox(0.8, 0.5, 0.6, olive2, -1.4 + i * 0.9, 2.5, -1.6);
    return g;
  }
  function samTruck(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); vehicles.push(g); host = g;
    vbox(7.8, 1.1, 2.8, olive2, 0, 1.0, 0);
    vbox(2.4, 1.8, 2.6, olive, -2.4, 2.1, 0);
    vbox(2.8, 1.6, 2.6, olive, 1.8, 2.0, 0);
    const launcher = new THREE.Group(); launcher.position.set(1.6, 2.7, 0); launcher.rotation.x = -0.25; g.add(launcher);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.8, 8), i % 2 ? olive : olive2); t.rotation.x = Math.PI / 2; t.position.set(-0.9 + i * 0.9, 0, 0); launcher.add(t); }
    wheels(g, [-2.6, 0, 2.6], [-1.35, 1.35], 0.8);
    return g;
  }
  apc(33, -64, 0); apc(33, -48, 0);
  tank(33, -30, 0);
  samTruck(33, -12, 0);
  // a few parked fuel bladders / ammo crates
  for (let i = 0; i < 4; i++) {
    const x = -70 + (i % 2) * 4.2, z = 102 + Math.floor(i / 2) * 3.4;
    box(3.6, 1.6, 2.4, i % 3 ? olive2 : sand, x, 0.8, z, 0.05);
    box(3.0, 0.1, 0.3, dark, x, 1.65, z, 0.05, false);
  }

  // ---------------------------------------------------------------- additional ships
  const shipMat = mk({ color: 0x4e585c, roughness: 0.62, metalness: 0.25 });
  const shipDeck = mk({ color: 0x303638, roughness: 0.85 });
  const shipDark = mk({ color: 0x202629, roughness: 0.7, metalness: 0.3 });
  const shipWhite = mk({ color: 0xd4d5cd, roughness: 0.6 });
  function landingShip(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, L.waterY, z); g.rotation.y = ry; root.add(g);
    const b = (w, h, d, m, px, py, pz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    b(22, 5.0, 76, shipMat, 0, 2.5, 0);
    b(18, 1.2, 70, shipDeck, 0, 5.6, 0);
    b(20, 1.4, 14, shipMat, 0, 7.0, -18);                   // superstructure
    b(16, 2.2, 8, shipMat, 0, 8.8, -21);
    b(14, 0.9, 6, mk({ color: 0x152024, roughness: 0.15, metalness: 0.7 }), 0, 9.9, -21);
    b(2.0, 1.3, 2.0, shipWhite, 0, 11.2, -24);              // mast
    for (let i = 0; i < 6; i++) b(0.12, 2.2, 0.12, shipDark, -14 + i * 5.6, 7.6, 30); // ramp frame
    b(16, 0.4, 8, shipDark, 0, 6.2, 34);                    // bow ramp
    for (let i = 0; i < 8; i++) b(2.2, 1.0, 2.6, i % 3 ? olive2 : sand, -7 + i * 2.0, 6.6, 8 + (i % 2) * 3.2); // embarked vehicles
    for (let i = 0; i < 4; i++) { const c = b(2.4, 2.4, 2.4, i % 2 ? olive : sand, -8 + i * 1.2, 8.2, -10); c.rotation.y = 0.1 * i; }
    for (const sx of [-10.5, 10.5]) { for (let k = 0; k < 14; k++) b(0.1, 1.0, 0.1, shipDark, sx, 6.3, -32 + k * 4.5); }
    // deck lights
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampW); l.position.set(i % 2 ? 9 : -9, 7.2, -20 + i * 8); g.add(l); }
    return g;
  }
  const cliffFill = new THREE.DirectionalLight(0xb1c6d5, 2.2);
  cliffFill.position.set(-120, 170, 90); scene.add(cliffFill);
  const cliffWarm = new THREE.DirectionalLight(0xffc58a, 0.25);
  cliffWarm.position.set(120, 90, 40); scene.add(cliffWarm);
  landingShip(148, -34, -0.15);
  // ship work light so the hull reads at night
  for (const [x, z] of [[148, -34]]) {
    const l = new THREE.PointLight(0xffd39a, 120, 48, 2); l.position.set(x, L.waterY + 10, z); root.add(l);
  }

  // a few harbor work boats / tugs with structure
  function tug(x, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, L.waterY, z); g.rotation.y = ry; root.add(g); host = g;
    vbox(6, 2.4, 18, shipMat, 0, 1.2, 0);
    vbox(4.4, 2.0, 5.6, shipMat, 0, 3.2, -3);
    vbox(3.6, 0.8, 4.2, mk({ color: 0x141f24, roughness: 0.15, metalness: 0.7 }), 0, 4.3, -3);
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 8), shipDark); c.position.set(0, 5.6, -3); c.castShadow = true; g.add(c); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), lampW); l.position.set(i % 2 ? 2 : -2, 4.0, 4); g.add(l); }
    return g;
  }
  tug(118, 86, 0.4);

  // light masts lining the crawler road (from the outline base): poles outside the lane, glow heads only
  for (const z of [-120, -80, -40, 0, 40]) for (const x of [-16, 26]) {
    box(1.4, 0.8, 1.4, conc, x, 0.4, z);
    cyl(0.32, 0.45, 24, steel, x, 12.4, z, 8);
    box(4.2, 0.9, 1.2, dark, x, 24.6, z);
    box(3.8, 0.12, 0.9, lampW, x, 24.1, z + 0.1, 0, false);
  }

  // one-shot clearance check for the roll-out: crawler + machine swept along the drive path vs everything else.
  // Uses each moving mesh's bounding box at sampled path positions; returns the first point found per object.
  window.__portCheck = (steps = 180) => {
    const sc = lab.scene, crawler = sc.getObjectByName('crawler'); sc.updateMatrixWorld(true);
    const inv = crawler.matrixWorld.clone().invert(), boxes = [], a = new V3();
    crawler.traverse(o => { if (!o.isMesh || !o.visible || o.isInstancedMesh) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); boxes.push(g.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv).expandByScalar(0.2)); });
    const C = L.crawler, path = [];
    for (let i = 0; i <= steps; i++) { const t = i / steps; path.push([C.startX + (C.endX - C.startX) * t, C.startZ + (C.endZ - C.startZ) * t]); }
    const inC = o => { for (let p = o; p; p = p.parent) if (p === crawler) return true; return false; };
    const hits = {};
    sc.traverse(o => {
      if (!o.isMesh || !o.visible || inC(o) || o.isInstancedMesh || ['hill', 'farRidge', 'sea'].includes(o.name)) return;
      const P = o.geometry.attributes.position; if (!P) return; const I = o.geometry.index, n = I ? I.count : P.count;
      for (let i = 0; i < n; i++) {
        a.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(o.matrixWorld);
        if (a.y < 0.6 || a.y > 50 || a.x < -25 || a.x > 40 || a.z < C.startZ - 30 || a.z > C.endZ + 30) continue;
        for (const [px, pz] of path) {
          if (Math.abs(a.z - pz) > 26) continue;
          const lp = new V3(a.x - px, a.y, a.z - pz);
          if (boxes.some(b => b.containsPoint(lp))) { const k = (o.name || o.parent?.name || o.type) + ':' + (o.material?.color?.getHexString?.() || ''); if (!hits[k]) hits[k] = [a.x, a.y, a.z].map(v => +v.toFixed(1)); break; }
        }
      }
    });
    return hits;
  };

  window.__outdoor = { root, vehicles, landingShip };
}
