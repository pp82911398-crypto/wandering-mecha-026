// Hangar interior dressing: roof trusses, work lights, catwalks, wall services, floor drains,
// workshop props, the service tower and the gantry. Static geometry is merged per material.
import * as THREE from 'three';
import { PI, cbox, cyl, ring, sphere, torus, tube, Batch } from '../src/kit.js';
import { L } from './layout.js';
import { uv, decalMesh, stencilTexture, signBoard, glowSprite, stainTexture } from './finish.js';

function signMesh(tex, w, h, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.78, metalness: 0.08, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5,
  }));
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  return mesh;
}

// ---------- simple ladder with a safety cage ----------
function ladder(b, m, x, z, y0, y1, axis = 'z') {
  const h = y1 - y0;
  for (const d of [-0.4, 0.4]) {
    if (axis === 'z') b.add(cyl(0.055, 0.055, h, 6), m.steelD, [x + d, y0 + h / 2, z]);
    else b.add(cyl(0.055, 0.055, h, 6), m.steelD, [x, y0 + h / 2, z + d]);
  }
  for (let y = y0 + 0.35; y < y1 - 0.1; y += 0.42) {
    const g = cyl(0.032, 0.032, 0.8, 6);
    if (axis === 'z') g.rotateX(PI / 2); else g.rotateZ(PI / 2);
    b.add(g, m.steelD, [x, y, z]);
  }
  // wall stand-offs
  for (let y = y0 + 2; y < y1; y += 3.4) {
    const g = cbox(0.6, 0.07, 0.07, 0.01);
    if (axis !== 'z') g.rotateY(PI / 2);
    b.add(g, m.steelD, [x + (axis === 'z' ? 0 : 0), y, z]);
  }
  // cage hoops on the upper half
  const cage = y0 + h * 0.5;
  for (let y = cage; y < y1; y += 1.7) {
    const hoop = torus(0.82, 0.035, 5, 14, PI * 1.55);
    hoop.rotateY(PI / 2);
    b.add(hoop, m.steelD, [x, y, z]);
  }
}

// ---------- crew ----------
function person(b, m, x, y, z, rot = 0, seed = 0, pose = 0) {
  const r = Math.random;
  const rr = (n) => { const v = Math.sin(seed * 91.7 + n * 43.1) * 43758.5453; return v - Math.floor(v); };
  const s = 0.9 + rr(1) * 0.12;
  const vest = rr(2) < 0.6 ? m.vest : m.vestO;
  const helmet = [m.hatW, m.hatY, m.hatO][Math.floor(rr(3) * 3)];
  const add = (g, mat, lx, ly, lz, lyRot = 0) => {
    g.scale(s, s, s);
    g.translate(lx, ly, lz);
    if (lyRot) g.rotateY(lyRot);
    g.rotateY(rot);
    g.translate(x, y, z);
    b.add(g, mat);
  };
  const stride = pose === 1 ? 0.22 : 0;
  add(cbox(0.12, 0.38, 0.13, 0.02), m.suitD, -0.085, 0.19, stride);
  add(cbox(0.12, 0.38, 0.13, 0.02), m.suitD, 0.085, 0.19, -stride);
  add(cbox(0.27, 0.36, 0.18, 0.03), m.suit, 0, 0.51, 0);
  add(cbox(0.30, 0.13, 0.20, 0.02), vest, 0, 0.56, 0);
  add(cbox(0.075, 0.32, 0.10, 0.02), m.suit, -0.185, 0.51, 0.01, 0.1);
  if (pose === 2) {
    // one arm raised, pointing at the machine
    const arm = cbox(0.08, 0.34, 0.10, 0.02); arm.rotateZ(1.15);
    add(arm, m.suit, 0.24, 0.62, 0.02);
  } else {
    add(cbox(0.075, 0.31, 0.10, 0.02), m.suit, 0.185, 0.50, 0.02, -0.12);
  }
  add(sphere(0.09, 8, 6), m.skin, 0, 0.74, 0);
  add(new THREE.SphereGeometry(0.115, 8, 5, 0, PI * 2, 0, PI / 2), helmet, 0, 0.78, 0);
  // small tool / tablet
  if (rr(4) < 0.5) add(cbox(0.16, 0.11, 0.03, 0.01), m.dark, 0.24, 0.42, 0.08);
  if (rr(5) < 0.3) add(cbox(0.05, 0.04, 0.20, 0.01), m.yellow, 0.20, 0.40, 0.10);
}

// ---------- main dressing ----------
export function dressInterior(root, m, H0) {
  const b = new Batch();
  const glows = [];
  const gx = L.gate.cx;
  const hallZ0 = H0.hallZ0, hallZ1 = H0.hallZ1;
  const hallCz = (hallZ0 + hallZ1) / 2, hallLen = hallZ0 - hallZ1;
  const SH = (H0.hallW - 74) / 2;   // wall-attached dressing follows the widened hall
  const tx = H0.towerX, tz = H0.towerZ, th = H0.towerH;

  // ================= roof trusses / purlins =================
  for (let z = -218; z > hallZ1; z -= 14) {
    b.add(cbox(H0.hallW, 0.9, 0.9, 0.06), m.steelD, [gx, 73, z]);
    b.add(cbox(H0.hallW, 0.9, 0.9, 0.06), m.steelD, [gx, 77, z]);
    for (let x = -31 - SH; x <= 39 + SH; x += 8) {
      b.add(cbox(0.45, 4.0, 0.75, 0.04), m.steelD, [x, 75, z]);
      const dg = cbox(8.95, 0.42, 0.62, 0.03); dg.rotateZ(Math.floor((x + 31 + SH) / 8) % 2 === 0 ? 0.4636 : -0.4636);
      b.add(dg, m.steelD, [x + 4, 75, z]);
      b.add(cbox(1.15, 1.15, 1.0, 0.04), m.steelD, [x, 73, z]);
      b.add(cbox(1.15, 1.15, 1.0, 0.04), m.steelD, [x, 77, z]);
    }
  }
  for (let x = -31 - SH; x <= 39 + SH; x += 8) {
    b.add(cbox(0.4, 0.35, hallLen - 4, 0.03), m.steelD, [x, 77.35, hallCz]);
  }
  // hanger rods for the gantry rails
  for (const x of [-8, 38]) for (let z = hallZ0 - 5; z > hallZ1 + 4; z -= 12) {
    b.add(cyl(0.07, 0.07, 22, 6), m.steelD, [x, 62, z]);
  }

  // ================= work lights =================
  const fixture = (x, y, z, rodsTo, w = 5.0) => {
    for (const dx of [-1.35, 1.35]) b.add(cyl(0.06, 0.06, Math.abs(y - rodsTo), 6), m.steelD, [x + dx, (y + rodsTo) / 2, z]);
    b.add(cbox(w, 0.62, 1.9, 0.06), m.lampHousing, [x, y, z]);
    b.add(cbox(w - 0.5, 0.2, 1.55, 0.03), m.steelD, [x, y - 0.34, z]);
    for (const dz of [-0.42, 0.42]) {
      b.add(cbox(w - 1.1, 0.15, 0.42, 0.02), m.lampWarm, [x, y - 0.46, z + dz]);
    }
    b.add(cbox(w - 0.2, 0.12, 0.12, 0.01), m.yellow, [x, y + 0.4, z + 1.0]);
    const g = glowSprite(0xffdca8, y > 52 ? 7.5 : 5.6, 0.5);
    g.position.set(x, y - 0.9, z); root.add(g); glows.push(g);
  };
  for (const x of [-11, 23, 45]) for (let z = -214; z > hallZ1 + 10; z -= 18) fixture(x, 64, z, 73);
  for (const x of [-9, 21]) for (let z = -158; z > -204; z -= 15) fixture(x, 47.5, z, 55, 4.4);

  // ================= catwalks along both hall walls =================
  for (const side of [-1, 1]) {
    const x = side < 0 ? -31.1 - SH : 39.1 + SH;
    const inner = side < 0 ? x + 1.8 : x - 1.8;
    b.add(uv(cbox(3.6, 0.25, hallLen - 6, 0.04), 0.9), m.grate, [x, 22.1, hallCz]);
    b.add(cbox(0.1, 0.55, hallLen - 6, 0.02), m.yellow, [inner, 22.5, hallCz]);
    for (let z = hallZ0 - 2; z >= hallZ1 + 1; z -= 4.2) {
      b.add(cbox(0.1, 1.3, 0.1, 0.01), m.steelD, [inner, 22.9, z]);
      b.add(cbox(0.6, 0.08, 0.08, 0.01), m.steelD, [inner + side * -0.3, 23.55, z]);
    }
    b.add(cbox(0.09, 0.09, hallLen - 6, 0.01), m.steelD, [inner, 23.55, hallCz]);
    b.add(cbox(0.09, 0.09, hallLen - 6, 0.01), m.steelD, [inner, 22.95, hallCz]);
    // brackets into the wall
    for (let z = hallZ0 - 6; z > hallZ1 + 4; z -= 8) {
      const dg = cbox(4.3, 0.22, 0.22, 0.02); dg.rotateZ(side * 0.7);
      b.add(dg, m.steelD, [x, 20.4, z]);
      b.add(cbox(0.35, 1.4, 0.35, 0.03), m.steelD, [side < 0 ? -32.7 - SH : 40.7 + SH, 20.0, z]);
    }
    // access ladders
    const lx = side < 0 ? -31.6 - SH : 39.6 + SH;
    ladder(b, m, lx, -211, 0, 22.1);
    ladder(b, m, lx, -297, 0, 22.1);
    ladder(b, m, lx, hallZ1 + 9, 0, 22.1);
  }

  // ================= wall structure and services =================
  for (const x of [-32.5 - SH, 40.5 + SH]) {
    for (const y of [10, 20, 30, 40, 50]) b.add(cbox(0.5, 0.5, hallLen - 4, 0.03), m.steelD, [x, y, hallCz]);
    for (let z = hallZ0 - 4; z > hallZ1; z -= 15) {
      for (const y of [6, 16, 26, 36, 46]) b.add(cbox(0.55, 0.3, 0.55, 0.02), m.steelD, [x + (x < 0 ? 1.1 : -1.1), y, z]);
    }
  }
  // fire main (red) with valves, and fuel / water lines on the other wall
  b.add(cyl(0.5, 0.5, hallLen - 8, 10), m.red, [-30.6 - SH, 13.5, hallCz], [PI / 2, 0, 0]);
  b.add(cyl(0.34, 0.34, hallLen - 8, 10), m.yellow, [40.1 + SH, 11.4, hallCz], [PI / 2, 0, 0]);
  b.add(cyl(0.29, 0.29, hallLen - 8, 10), m.blue, [40.1 + SH, 14.8, hallCz], [PI / 2, 0, 0]);
  b.add(cyl(0.17, 0.17, hallLen - 8, 8), m.steelD, [-30.6 - SH, 17.4, hallCz], [PI / 2, 0, 0]);
  for (let z = hallZ0 - 6; z > hallZ1 + 4; z -= 12) {
    b.add(cbox(0.6, 1.1, 0.18, 0.02), m.steelD, [-30.6 - SH, 14.2, z]);
    b.add(cbox(0.5, 0.9, 0.16, 0.02), m.steelD, [40.1 + SH, 12.6, z]);
    b.add(cbox(0.8, 0.1, 0.1, 0.01), m.steelD, [-30.6 - SH, 17.6, z]);
  }
  for (const z of [-232, -262, -292]) {
    b.add(cyl(0.72, 0.72, 0.55, 10), m.redD, [-30.6 - SH, 13.5, z], [PI / 2, 0, 0]);
    b.add(cyl(0.12, 0.12, 1.1, 6), m.steelD, [-30.6 - SH, 14.1, z]);
    b.add(torus(0.6, 0.07, 6, 16), m.redD, [-30.6 - SH, 14.7, z]);
  }
  // cable tray
  b.add(uv(cbox(1.1, 0.12, hallLen - 8, 0.02), 1.2), m.grate, [-30.5 - SH, 16.0, hallCz]);
  for (const dy of [-0.16, -0.05, 0.08]) b.add(cyl(0.075, 0.075, hallLen - 8, 6), m.black, [-30.5 - SH, 16.0 + dy, hallCz], [PI / 2, 0, 0]);
  for (let z = hallZ0 - 7; z > hallZ1; z -= 9) b.add(cbox(0.1, 0.9, 0.1, 0.01), m.steelD, [-31.6 - SH, 15.4, z]);
  // ventilation ducts
  b.add(uv(cbox(3.2, 2.2, hallLen - 12, 0.08), 0.65), m.steelD, [-30.8 - SH, 43.5, hallCz]);
  for (let z = hallZ0 - 8; z > hallZ1 + 4; z -= 11) {
    b.add(uv(cbox(0.12, 1.7, 2.0, 0.02), 1.2), m.grate, [-29.15 - SH, 43.5, z]);
    b.add(cbox(0.9, 0.12, 0.12, 0.01), m.steelD, [-31.8 - SH, 42.4, z]);
  }
  b.add(uv(cbox(2.4, 1.8, hallLen - 20, 0.06), 0.65), m.steelD, [40.4 + SH, 46.5, hallCz]);
  for (let z = hallZ0 - 10; z > hallZ1 + 4; z -= 14) b.add(uv(cbox(0.1, 1.4, 1.8, 0.02), 1.2), m.grate, [39.15 + SH, 46.5, z]);
  b.add(uv(cbox(2.0, 34, 2.0, 0.06), 0.65), m.steelD, [40.3 + SH, 27, hallZ1 + 5]);
  // big wall-mounted exhaust fans (round anchors on the long concrete walls)
  const fan = (x, y, z, dir = -1, R = 4.0) => {
    const rim = torus(R + 0.35, 0.38, 8, 30); rim.rotateY(PI / 2);
    b.add(rim, m.steelD, [x, y, z]);
    b.add(cyl(R + 0.1, R + 0.1, 0.35, 30), m.dark, [x - dir * 0.3, y, z], [0, 0, PI / 2]);
    b.add(cyl(0.85, 0.85, 1.3, 16), m.steel, [x + dir * 0.55, y, z], [0, 0, PI / 2]);
    for (let i = 0; i < 8; i++) {
      const bl = cbox(0.1, R * 0.86, 1.15, 0.03);
      bl.translate(0, R * 0.46, 0);
      bl.rotateY(0.45);
      bl.rotateX(i / 8 * PI * 2);
      b.add(bl, m.steel, [x + dir * 0.5, y, z]);
    }
    for (const yy of [-2.4, -0.8, 0.8, 2.4]) b.add(cbox(0.08, 0.12, R * 1.85, 0.01), m.steelD, [x + dir * 0.9, y + yy, z]);
    b.add(cbox(1.2, 1.2, 0.8, 0.06), m.dark, [x - dir * 0.9, y + R + 1.1, z]);
    // work light over the fan so the blades read instead of turning into a black hole
    b.add(cbox(0.7, 0.35, 1.5, 0.04), m.lampHousing, [x + dir * 1.2, y + R + 2.0, z]);
    b.add(cbox(0.06, 0.2, 1.1, 0.01), m.lampWarm, [x + dir * 1.58, y + R + 2.0, z]);
    const fg = glowSprite(0xffd9a4, 5.5, 0.34); fg.position.set(x + dir * 1.9, y + R + 1.8, z); root.add(fg); glows.push(fg);
  };
  fan(40.55 + SH, 33, -238, -1, 3.8);
  fan(-32.55 - SH, 29, -268, 1, 3.6);

  // emergency / exit lights
  for (const z of [-222, -250, -278, -306, -334]) for (const x of [-32.6 - SH, 40.6 + SH]) {
    b.add(cbox(0.35, 0.55, 0.9, 0.02), m.dark, [x, 27, z]);
    b.add(cbox(0.12, 0.34, 0.66, 0.01), m.ledGreen, [x + (x < 0 ? 0.2 : -0.2), 27, z]);
  }
  // green running lights down the tunnel
  for (const z of [-160, -178, -196]) for (const x of [-18.6, 26.6]) {
    b.add(cbox(0.32, 0.52, 0.85, 0.02), m.dark, [x, 25, z]);
    b.add(cbox(0.1, 0.32, 0.64, 0.01), m.ledGreen, [x + (x < 0 ? 0.18 : -0.18), 25, z]);
  }
  for (const x of [-12, 20]) {
    b.add(cbox(2.8, 1.0, 0.2, 0.03), m.dark, [x, 31, hallZ0 - 1.2]);
    b.add(cbox(2.0, 0.42, 0.06, 0.01), m.ledGreen, [x, 31, hallZ0 - 1.34]);
    const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.72), new THREE.MeshBasicMaterial({
      map: stencilTexture('EXIT', { size: 118, color: 'rgba(232,255,236,0.95)', w: 512, h: 128 }),
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    ex.position.set(x, 31, hallZ0 - 1.39); ex.rotation.y = PI;
    root.add(ex);
    b.add(cbox(2.3, 0.16, 0.3, 0.02), m.steelD, [x, 31.6, hallZ0 - 1.1]);
  }

  // ================= floor: drains, puddles, cones, hatch =================
  for (const x of [-24.5, 32.5]) {
    b.add(cbox(1.7, 0.08, 186, 0.02), m.dark, [x, 0.02, -245]);
    b.add(cbox(0.16, 0.14, 186, 0.02), m.steelD, [x - 0.8, 0.06, -245]);
    b.add(cbox(0.16, 0.14, 186, 0.02), m.steelD, [x + 0.8, 0.06, -245]);
    for (let z = -152; z > -336; z -= 2.4) b.add(cbox(1.5, 0.09, 0.13, 0.01), m.grate, [x, 0.06, z]);
  }
  // puddles (merged: one draw call)
  for (const [x, z, sx, sz] of [[-19, -176, 4.5, 2.6], [29, -168, 5.5, 3.0], [12, -254, 6.5, 3.4], [-27, -264, 3.8, 2.2], [25, -224, 4.2, 2.6], [35, -296, 3.2, 2.0], [-16, -292, 4.8, 2.8]]) {
    b.add(new THREE.CircleGeometry(1, 20), m.puddle, [x, 0.035, z], [-PI / 2, 0, 0], [sx, sz, 1]);
  }
  // traffic cones along the lane
  for (const x of [-13.4, 21.4]) for (let z = -158; z > hallZ1 + 10; z -= 20) {
    b.add(cbox(0.56, 0.06, 0.56, 0.02), m.orange, [x, 0.04, z]);
    b.add(cyl(0.07, 0.24, 0.82, 10), m.orange, [x, 0.48, z]);
    b.add(cyl(0.155, 0.185, 0.13, 10), m.hatW, [x, 0.55, z]);
  }
  // floor access hatch with a hazard frame
  b.add(cbox(4.4, 0.1, 4.4, 0.04), m.grate, [30, 0.06, -270]);
  for (const [dx, dz, w, d] of [[0, -2.3, 4.6, 0.22], [0, 2.3, 4.6, 0.22], [-2.3, 0, 0.22, 4.6], [2.3, 0, 0.22, 4.6]]) {
    b.add(cbox(w, 0.08, d, 0.01), m.yellow, [30 + dx, 0.07, -270 + dz]);
  }
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    b.add(cbox(0.1, 0.7, 0.1, 0.01), m.yellow, [30 + dx, 0.35, -270 + dz]);
    b.add(cyl(0.06, 0.06, 0.18, 8), m.black, [30 + dx, 0.7, -270 + dz]);
  }

  // ================= workshop props =================
  // long bench + tool chest against the left wall
  b.add(uv(cbox(2.4, 0.16, 6.4, 0.04), 1.1), m.wood, [-39.2, 1.32, -234]);
  b.add(cbox(2.5, 0.08, 6.5, 0.02), m.steelD, [-39.2, 1.2, -234]);
  for (const dz of [-3.0, 3.0]) for (const dx of [-1.0, 1.0]) b.add(cbox(0.1, 1.2, 0.1, 0.01), m.steelD, [-39.2 + dx, 0.6, -234 + dz]);
  b.add(cbox(2.2, 0.1, 6.0, 0.02), m.steelD, [-39.2, 0.35, -234]);
  b.add(uv(cbox(0.16, 2.0, 6.2, 0.03), 1.1), m.steelD, [-40.4, 2.3, -234]);
  for (let i = 0; i < 9; i++) b.add(cbox(0.08, 0.35 + (i % 3) * 0.2, 0.14, 0.01), m.steel, [-40.25, 2.5, -236.6 + i * 0.62]);
  b.add(cbox(0.5, 0.45, 0.9, 0.04), m.dark, [-39.2, 1.6, -236.6]);
  b.add(cbox(0.7, 0.55, 0.5, 0.04), m.redD, [-39.2, 1.7, -238.6]);
  b.add(cbox(1.8, 1.5, 1.1, 0.05), m.steelD, [-37.4, 0.85, -240.4]);
  for (let i = 0; i < 5; i++) {
    b.add(cbox(1.6, 0.03, 0.02, 0.01), m.dark, [-37.4, 0.42 + i * 0.25, -239.82]);
    b.add(cbox(0.35, 0.04, 0.04, 0.01), m.chrome, [-37.4, 0.42 + i * 0.25, -239.75]);
  }
  for (const dx of [-0.7, 0.7]) for (const dz of [-0.4, 0.4]) b.add(cyl(0.11, 0.11, 0.12, 8), m.rubber, [-37.4 + dx, 0.11, -240.4 + dz], [0, 0, PI / 2]);

  // forklift, well clear of the crawler lane
  {
    const fx = -23, fz = -212;
    b.add(cbox(2.2, 1.15, 2.9, 0.12), m.olive, [fx, 0.95, fz]);
    b.add(cbox(1.2, 0.7, 1.3, 0.1), m.olive, [fx, 1.75, fz + 0.4]);
    b.add(cbox(2.0, 0.12, 2.0, 0.03), m.steelD, [fx, 1.72, fz - 0.5]);
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.9, 0.9]) b.add(cbox(0.1, 2.0, 0.1, 0.01), m.steelD, [fx + dx, 2.75, fz - 0.5 + dz]);
    b.add(cbox(2.1, 0.1, 2.1, 0.03), m.steelD, [fx, 3.75, fz - 0.5]);
    // mast + forks
    for (const dx of [-0.75, 0.75]) b.add(cbox(0.18, 4.6, 0.22, 0.03), m.steelD, [fx + dx, 2.7, fz + 1.25]);
    for (let i = 0; i < 5; i++) b.add(cbox(1.7, 0.12, 0.14, 0.02), m.steelD, [fx, 1.1 + i * 0.85, fz + 1.25]);
    b.add(cbox(1.45, 0.8, 0.18, 0.03), m.steelD, [fx, 0.9, fz + 1.4]);
    for (const dx of [-0.45, 0.45]) b.add(cbox(0.28, 0.1, 1.7, 0.02), m.steelD, [fx + dx, 0.32, fz + 2.3]);
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.95, 0.95]) b.add(cyl(0.45, 0.45, 0.42, 12), m.rubber, [fx + dx, 0.46, fz + dz], [0, 0, PI / 2]);
    b.add(cbox(0.55, 0.55, 0.65, 0.05), m.dark, [fx, 2.25, fz - 0.1]);
    b.add(cbox(0.5, 0.5, 0.6, 0.05), m.dark, [fx, 2.35, fz - 1.1]);
    b.add(torus(0.26, 0.05, 6, 14), m.dark, [fx, 2.3, fz + 0.42], [0, 0, PI / 2]);
    b.add(cyl(0.32, 0.32, 1.2, 10), m.chrome, [fx, 1.25, fz - 1.2], [0, 0, PI / 2]);
    b.add(sphere(0.12, 8, 6), m.ledAmber, [fx - 0.7, 3.85, fz - 1.2]);
    b.add(cbox(0.8, 0.5, 0.6, 0.05), m.redD, [fx + 0.7, 0.8, fz - 1.5]);
  }

  // gas cylinder rack
  {
    const x0 = 47.2, z0 = -218.5;
    for (const dx of [-1.6, 1.6]) for (const dz of [-1.5, 1.5]) b.add(cbox(0.12, 3.2, 0.12, 0.01), m.yellow, [x0 + dx, 1.6, z0 + dz]);
    for (const y of [0.5, 3.15]) for (const dz of [-1.5, 1.5]) b.add(cbox(3.4, 0.1, 0.1, 0.01), m.yellow, [x0, y, z0 + dz]);
    for (let i = 0; i < 4; i++) for (const dx of [-0.8, 0.8]) {
      const cz = z0 - 1.1 + i * 0.75;
      b.add(cyl(0.29, 0.31, 2.3, 10), i % 2 ? m.blue : m.green, [x0 + dx, 1.15, cz]);
      b.add(cyl(0.12, 0.12, 0.28, 8), m.brass, [x0 + dx, 2.44, cz]);
      b.add(cyl(0.34, 0.34, 0.09, 10), m.steelD, [x0 + dx, 2.2, cz]);
    }
    for (let i = 0; i < 3; i++) b.add(cbox(3.2, 0.06, 0.1, 0.01), m.black, [x0, 1.4 + i * 0.4, z0 - 1.5]);
    root.add(signMesh(signBoard('GAS', 'OXYGEN · ARGON', { size: 118, subSize: 46, bg: '#1b2224' }), 3.4, 1.3, 51.85, 4.6, z0, -PI / 2));
  }

  // cable drums: removed with the empty side bays
  if (false) {
    const drum = (x, y, z, r, w, axisX = true) => {
      const rot = axisX ? [0, 0, PI / 2] : [0, 0, 0];
      b.add(cyl(r, r, w, 16), m.woodDark, [x, y, z], rot);
      for (const d of [-w / 2, w / 2]) {
        const g = cyl(r + 0.18, r + 0.18, 0.12, 16);
        if (axisX) g.rotateZ(PI / 2); else g.rotateX(PI / 2);
        b.add(g, m.wood, [x + (axisX ? d : 0), y, z + (axisX ? 0 : d)]);
      }
      b.add(cyl(0.22, 0.22, w + 0.3, 8), m.steelD, [x, y, z], rot);
    };
    drum(48.5, 1.55, -292, 1.5, 1.7, true);
    drum(48.5, 1.35, -294.6, 1.3, 1.5, true);
    drum(45.2, 1.15, -290.2, 1.15, 1.4, false);
  }

  // shelving rack
  {
    const x = -42.4, z0 = -288;
    for (const dx of [-0.7, 0.7]) for (const dz of [-2.6, 2.6]) b.add(cbox(0.1, 3.4, 0.1, 0.01), m.steelD, [x + dx, 1.7, z0 + dz]);
    for (const y of [0.35, 1.25, 2.15, 3.0]) {
      b.add(uv(cbox(1.5, 0.1, 5.2, 0.02), 1.2), m.grate, [x, y, z0]);
      for (let i = 0; i < 4; i++) {
        const bw = 0.5 + ((i * 7) % 3) * 0.12, bh = 0.35 + ((i * 5) % 3) * 0.14;
        b.add(cbox(bw, bh, 0.7, 0.03), i % 2 ? m.cardboard : m.olive, [x, y + 0.1 + bh / 2, z0 - 2.0 + i * 1.2]);
      }
    }
  }

  // scissor lift
  {
    const x = 47, z = -246;
    b.add(cbox(4.2, 0.4, 2.4, 0.08), m.steelD, [x, 0.5, z]);
    for (const dx of [-1.5, 1.5]) for (const dz of [-0.8, 0.8]) b.add(cyl(0.35, 0.35, 0.32, 10), m.rubber, [x + dx, 0.36, z + dz], [0, 0, PI / 2]);
    for (let i = 0; i < 3; i++) {
      for (const dz of [-0.85, 0.85]) {
        const l = cbox(0.12, 3.2, 0.12, 0.02); l.rotateZ(0.9);
        b.add(l.clone(), m.yellow, [x - 1.3 + i * 0.02, 1.4 + i * 1.55, z + dz]);
        const r2 = cbox(0.12, 3.2, 0.12, 0.02); r2.rotateZ(-0.9);
        b.add(r2, m.yellow, [x + 1.3, 1.4 + i * 1.55, z + dz]);
        b.add(cbox(2.4, 0.1, 0.12, 0.01), m.steelD, [x, 1.0 + i * 1.55, z + dz]);
      }
    }
    b.add(uv(cbox(4.6, 0.18, 2.6, 0.03), 0.8), m.grate, [x, 5.6, z]);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.2, 1.2]) b.add(cbox(0.08, 1.1, 0.08, 0.01), m.yellow, [x + dx, 6.2, z + dz]);
    for (const dz of [-1.2, 1.2]) b.add(cbox(4.5, 0.07, 0.07, 0.01), m.yellow, [x, 6.75, z + dz]);
    b.add(cbox(0.6, 0.5, 0.4, 0.04), m.dark, [x - 1.8, 5.9, z + 0.7]);
    b.add(cbox(0.4, 0.25, 0.1, 0.02), m.ledAmber, [x - 1.8, 6.1, z + 0.92]);
  }

  // portable work lights on tripods
  for (const [x, z] of [[-37.5, -220], [44.5, -262]]) {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * PI * 2;
      const leg = cbox(0.09, 2.3, 0.09, 0.01); leg.rotateZ(Math.cos(a) * 0.45); leg.rotateX(Math.sin(a) * 0.45);
      b.add(leg, m.steelD, [x + Math.cos(a) * 0.5, 1.1, z + Math.sin(a) * 0.5]);
    }
    b.add(cyl(0.055, 0.055, 1.9, 6), m.steelD, [x, 3.3, z]);
    b.add(cbox(1.5, 0.14, 0.14, 0.02), m.steelD, [x, 4.25, z]);
    for (const dx of [-0.55, 0.55]) {
      b.add(cbox(0.55, 0.42, 0.3, 0.04), m.lampHousing, [x + dx, 4.05, z]);
      b.add(cbox(0.45, 0.3, 0.05, 0.01), m.lampWarm, [x + dx, 4.02, z + 0.17]);
      const g = glowSprite(0xffdfae, 4.2, 0.4); g.position.set(x + dx, 3.9, z + 0.3); root.add(g); glows.push(g);
    }
  }

  // drums / pallets / cable runs
  for (const [x, z, col] of [[45.4, -234, m.blue], [46.5, -235.4, m.rust], [45.9, -236.8, m.olive]]) {
    b.add(cyl(0.52, 0.52, 1.3, 12), col, [x, 0.65, z]);
    for (const y of [0.3, 0.95]) b.add(cyl(0.56, 0.56, 0.08, 12), m.steelD, [x, y, z]);
    b.add(cbox(0.5, 0.06, 0.5, 0.01), m.dark, [x, 1.32, z]);
  }
  for (const [x, z] of [[-42, -270], [47.5, -230]]) {
    for (let i = 0; i < 5; i++) b.add(uv(cbox(2.6, 0.08, 0.24, 0.01), 1.5), m.wood, [x, 0.14 + i * 0.02, z - 1.0 + i * 0.5]);
    b.add(cbox(1.4, 0.9, 1.1, 0.05), m.cardboard, [x, 0.62, z - 0.2]);
    b.add(cbox(1.0, 0.55, 0.9, 0.04), m.cardboard, [x, 0.35, z + 0.9]);
  }
  // rubber hoses / cables on the floor
  b.add(tube([[-41, 0.12, -258], [-38, 0.12, -256], [-35, 0.12, -258], [-33, 0.12, -266]], 0.11, 28, 6), m.rubber);
  b.add(tube([[51.4, 0.12, -244], [49, 0.12, -247], [47.5, 0.12, -252]], 0.1, 22, 6), m.rubber);
  b.add(tube([[-41.6, 0.12, -246], [-39, 0.12, -250], [-39.4, 0.12, -254]], 0.09, 20, 6), m.black);

  // electrical cabinets + fire hose cabinet on the left wall
  for (let i = 0; i < 4; i++) {
    const z = -258 - i * 1.5;
    b.add(cbox(1.2, 2.0, 1.3, 0.06), m.steelD, [-42.9, 1.15, z]);
    b.add(cbox(1.0, 0.06, 0.9, 0.01), m.dark, [-42.28, 1.6, z]);
    b.add(cbox(0.08, 0.08, 0.45, 0.01), m.chrome, [-42.25, 1.0, z + 0.3]);
    b.add(cbox(0.16, 0.09, 0.05, 0.01), i % 2 ? m.ledGreen : m.ledAmber, [-42.25, 1.95, z]);
  }
  b.add(cbox(1.5, 1.9, 0.55, 0.05), m.redD, [-43.2, 4.2, -246]);
  b.add(cbox(1.2, 1.3, 0.1, 0.02), m.glass, [-43.2, 4.25, -245.7]);
  b.add(cyl(0.45, 0.45, 0.65, 12), m.red, [-43.2, 4.2, -246], [0, 0, PI / 2]);
  root.add(signMesh(signBoard('FIRE', 'HOSE REEL', { size: 112, subSize: 44, bg: '#4a1612' }), 2.3, 1.0, -42.9, 5.6, -246, PI / 2));

  // fire extinguisher pair near the tunnel mouth
  for (const dx of [-1.1, 1.1]) {
    b.add(cyl(0.2, 0.24, 0.8, 10), m.red, [-42.5 + dx, 0.45, -214]);
    b.add(cyl(0.08, 0.08, 0.25, 8), m.black, [-42.5 + dx, 0.94, -214]);
  }

  // ================= service tower dressing =================
  // caged ladders between the platforms (north face)
  for (const [y0, y1] of [[0, 16], [16, 32], [32, 46]]) {
    const h = y1 - y0;
    for (const dx of [-0.4, 0.4]) b.add(cyl(0.055, 0.055, h, 6), m.steelD, [tx + dx, (y0 + y1) / 2, tz - 4.75]);
    for (let y = y0 + 0.4; y < y1; y += 0.45) b.add(cbox(0.8, 0.045, 0.045, 0.01), m.steelD, [tx, y, tz - 4.75]);
    if (y0 > 0) for (let y = y0 + 1.2; y < y1; y += 1.9) {
      const hoop = torus(0.78, 0.035, 5, 14, PI * 1.55); hoop.rotateY(PI / 2);
      b.add(hoop, m.steelD, [tx, y, tz - 4.75]);
    }
  }
  // operator cabin on the 16 m deck
  b.add(cbox(4.2, 2.9, 4.0, 0.12), m.concreteMid, [tx + 6.5, 17.9, tz]);
  b.add(cbox(3.2, 1.5, 0.16, 0.04), m.glassLit, [tx + 6.5, 18.1, tz + 2.05]);
  b.add(cbox(0.16, 1.5, 2.4, 0.04), m.glassLit, [tx + 8.55, 18.1, tz]);
  b.add(cbox(4.5, 0.22, 4.3, 0.04), m.steelD, [tx + 6.5, 19.5, tz]);
  b.add(cbox(0.8, 0.5, 0.8, 0.04), m.steelD, [tx + 5.5, 19.85, tz - 1.0]);
  b.add(cbox(0.55, 0.4, 0.16, 0.02), m.ledAmber, [tx + 7.1, 18.6, tz + 2.15]);
  // winch on the top deck
  // (deck winch + hook cable removed: the cable hung through the boarding bridge) 





  // floodlights on the top deck aimed at the machine
  for (const dz of [-1.2, 1.2]) {
    b.add(cbox(1.1, 0.6, 0.7, 0.04), m.lampHousing, [tx + 4.0, 46.9, tz + dz]);
    b.add(cbox(0.9, 0.4, 0.1, 0.01), m.lampWarm, [tx + 4.0, 46.9, tz + dz + 0.4]);
    const g = glowSprite(0xffdba6, 8, 0.55); g.position.set(tx + 4.0, 46.5, tz + dz + 0.9); root.add(g); glows.push(g);
  }
  // cable reel + tool cart at the base
  b.add(cyl(1.05, 1.05, 0.8, 14), m.steelD, [tx + 3.5, 1.0, tz - 5.2], [0, 0, PI / 2]);
  b.add(cyl(1.2, 1.2, 0.1, 14), m.woodDark, [tx + 3.5, 1.0, tz - 5.6], [0, 0, PI / 2]);
  b.add(cyl(1.2, 1.2, 0.1, 14), m.woodDark, [tx + 3.5, 1.0, tz - 4.8], [0, 0, PI / 2]);
  b.add(cbox(1.6, 0.9, 0.9, 0.05), m.steelD, [tx + 4.2, 0.45, tz + 5.4]);
  for (let i = 0; i < 3; i++) b.add(cbox(1.4, 0.03, 0.1, 0.01), m.dark, [tx + 4.2, 0.2 + i * 0.28, tz + 5.87]);
  // warning board
  for (const dx of [-2.0, 2.0]) b.add(cbox(0.12, 2.0, 0.12, 0.02), m.steelD, [tx + 6 + dx, 17.2, tz - 3.15]);
  root.add(signMesh(signBoard('SERVICE TOWER', 'BAY 04 · 50 m', { size: 92, subSize: 42 }), 5.2, 2.0, tx + 6, 18.15, tz - 3.15, PI));

  // ================= gantry refinement =================
  {
    const z = H0.gantryZ;
    for (const x of [-8, 38]) {
      b.add(cbox(3.2, 1.4, 4.0, 0.08), m.steelD, [x, 50.7, z]);
      for (const dz of [-1.4, 1.4]) b.add(cyl(0.42, 0.42, 0.4, 12), m.dark, [x, 50.2, z + dz], [0, 0, PI / 2]);
      b.add(cbox(0.7, 0.5, 0.7, 0.04), m.yellow, [x, 50.5, z + 2.2]);
      b.add(sphere(0.16, 8, 6), m.ledAmber, [x, 51.7, z]);
    }
    const hx = gx + 24;
    for (const dx of [-0.45, 0.45]) for (const dz of [-0.45, 0.45]) {
      b.add(cyl(0.045, 0.045, 12.6, 5), m.black, [hx + dx, 44.1, z + dz]);
    }
    b.add(cbox(1.6, 1.8, 1.2, 0.06), m.steelD, [hx, 37.6, z]);
    for (const dz of [-0.4, 0.4]) b.add(cyl(0.3, 0.3, 0.2, 10), m.dark, [hx, 37.6, z + dz], [PI / 2, 0, 0]);
    b.add(torus(0.45, 0.12, 8, 16, PI * 1.5), m.steel, [hx, 35.9, z], [PI / 2, 0, 0]);
    b.add(cbox(1.0, 0.22, 0.22, 0.02), m.yellow, [hx, 35.7, z + 0.5]);
    // pendant control
    b.add(tube([[hx + 6, 50.2, z], [hx + 6.5, 42, z + 0.4], [hx + 6.2, 34, z + 0.2]], 0.035, 20, 5), m.black);
    b.add(cbox(0.55, 0.8, 0.35, 0.04), m.dark, [hx + 6.2, 33.4, z + 0.2]);
    b.add(cbox(0.35, 0.3, 0.06, 0.01), m.ledGreen, [hx + 6.2, 33.55, z + 0.39]);
    root.add(signMesh(signBoard('SWL 400 T', '', { size: 126, bg: '#20272a' }), 5.4, 2.0, hx + 4, 52.1, z + 1.15));
  }

  // ================= crew =================
  person(b, m, -38.4, 0.03, -230.5, 1.2, 3, 2);
  person(b, m, -25.6, 0.03, -210.0, -0.6, 4, 1);
  person(b, m, -16.0, 0.03, -238.0, 2.1, 5, 1);
  person(b, m, 43.0, 0.03, -243.0, -1.5, 6, 0);
  person(b, m, 31.6, 0.03, -266.0, 0.4, 7, 2);
  person(b, m, -12.6, 0.03, -294.0, 1.7, 8, 1);
  person(b, m, 22.0, 0.03, -282.0, -2.4, 9, 0);
  person(b, m, -16.6, 0.03, -182.0, 0.2, 10, 1);
  person(b, m, -42.0, 22.24, -242.0, 1.4, 11, 0);
  person(b, m, 50.2, 22.24, -272.0, -1.2, 12, 2);
  person(b, m, -18.0, 16.23, tz + 2.7, 0.5, 13, 0);
  person(b, m, -14.4, 16.23, tz - 2.7, -0.8, 14, 2);
  person(b, m, -16.5, 32.23, tz + 1.0, 1.9, 15, 1);

  // ================= wall graphics =================
  const deco = (tex, w, h, x, y, z, ry = 0) => {
    const d = decalMesh(tex, w, h); d.position.set(x, y, z); d.rotation.y = ry; root.add(d);
  };
  const ds = (t, o) => stencilTexture(t, o);
  deco(ds('04', { size: 380, color: 'rgba(226,222,206,0.34)', w: 512, h: 512 }), 15, 15, -32.85 - SH, 32, -252, PI / 2);
  deco(ds('HANGAR 04', { size: 150, color: 'rgba(226,222,206,0.28)', w: 1024, h: 256 }), 24, 6, 40.85 + SH, 28, -260, -PI / 2);
  deco(ds('CRAWLER LANE', { size: 92, color: 'rgba(214,170,40,0.4)', w: 1024, h: 128 }), 12, 1.5, -18.85, 24, -176, PI / 2);
  deco(ds('KEEP CLEAR', { size: 96, color: 'rgba(214,170,40,0.45)', w: 1024, h: 128 }), 8, 1.0, 40.85 + SH, 12, -236, -PI / 2);
  deco(ds('NO PARKING', { size: 92, color: 'rgba(214,80,50,0.45)', w: 1024, h: 128 }), 7, 0.9, -32.85 - SH, 10, -286, PI / 2);
  // oil stains
  const stain = stainTexture();
  for (const [x, z, w, h, r] of [[-17, -196, 8, 5, 0.2], [16, -212, 10, 6, -0.4], [-6, -262, 12, 7, 0.9], [12, -286, 8, 5, 1.6], [28, -230, 7, 4.5, -1.1], [-28, -252, 5, 3.5, 0.5], [36, -252, 5, 3, 2.1]]) {
    const d = decalMesh(stain, w, h, { opacity: 0.85 });
    d.rotation.x = -PI / 2; d.rotation.z = r; d.position.set(x, 0.045, z); root.add(d);
  }
  // floor lane stencils
  for (const z of [-190, -250, -285]) {
    const d = decalMesh(ds('04', { size: 300, color: 'rgba(226,222,206,0.28)', w: 512, h: 512 }), 5, 5);
    d.rotation.x = -PI / 2; d.position.set(4, 0.05, z); root.add(d);
  }

  root.add(b.build());

  // Showroom lighting inside the hall: a warm key from the tower side, a cool fill from the
  // tunnel mouth, and a cold rim from the back corner. These only matter while the machine is
  // still in the bay (the pier is lit by the sun).
  const warm = new THREE.PointLight(0xffcf96, 65, 130, 1.7);
  warm.position.set(4, 28, -212); root.add(warm);
  const cool = new THREE.PointLight(0xa9c6d8, 34, 110, 1.7);
  cool.position.set(32, 30, -282); root.add(cool);

  const spot = (color, intensity, pos, target, angle = 0.48, penumbra = 0.65, dist = 170) => {
    const L = new THREE.SpotLight(color, intensity, dist, angle, penumbra, 1.25);
    L.position.set(...pos); L.target.position.set(...target);
    root.add(L, L.target);
    return L;
  };
  const key = spot(0xffdfb8, 190, [27, 44, -224], [3, 24, -244], 0.44, 0.7);
  const fill = spot(0xa6c8e2, 80, [-21, 31, -210], [5, 22, -246], 0.6, 0.8);
  const rim = spot(0xdce9ff, 105, [28, 40, -286], [6, 28, -246], 0.42, 0.6);

  return { glows, points: [warm, cool, key, fill, rim] };
}
