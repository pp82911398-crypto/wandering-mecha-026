// Mountain hangar, blast gate and the tracked transport platform.
// The gate is two sliding layers (outer / inner), pushed apart by two central hydraulic ram pairs.
// All numbers come from layout.js; the Jaeger itself is assembled in mech.js and dropped onto the crawler deck.
import * as THREE from 'three';
import { PI, cbox, cyl, sphere, Batch } from '../src/kit.js';
import { canvasTex, rng, FONT_EN } from '../src/materials.js';
import { L } from './layout.js';
import { makePalette, uv, updateDust } from './finish.js';
import { dressGate, dressDoorLeaves, makeAtmosphere } from './dress.js';
import { dressInterior } from './dress_interior.js';
import { buildBoardingLift, buildCantilevers, buildLatticeTower } from './lift.js';
import { buildGallery } from './bay.js';
import { dressCrawler } from './dress_crawler.js';

const std = (p) => new THREE.MeshStandardMaterial(p);

function hazardTexture(w = 512, h = 128) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = '#1b1b19'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d2a01c';
    for (let i = -h; i < w + h; i += 56) {
      c.beginPath(); c.moveTo(i, h); c.lineTo(i + 28, h); c.lineTo(i + 28 + h, 0); c.lineTo(i + h, 0); c.closePath(); c.fill();
    }
  }, { repeat: true });
}

function floorTexture() {
  const S = 1024;
  const x0 = -33, x1 = 41, z0 = -145, z1 = -305;
  const X = x => (x - x0) / (x1 - x0) * S, Z = z => (z - z0) / (z1 - z0) * S;
  return canvasTex(S, S, (c) => {
    c.fillStyle = '#555753'; c.fillRect(0, 0, S, S);
    const r = rng(44);
    for (let i = 0; i < 1300; i++) { c.fillStyle = `rgba(${r() < .5 ? '20,20,18' : '140,140,130'},${0.02 + r() * 0.04})`; c.beginPath(); c.ellipse(r() * S, r() * S, 2 + r() * 26, 2 + r() * 9, r() * PI, 0, PI * 2); c.fill(); }
    // crawler lane
    c.fillStyle = '#484a47'; c.fillRect(X(-12), Z(-145), X(20) - X(-12), Z(-305) - Z(-145));
    c.fillStyle = 'rgba(210,160,30,0.8)';
    for (let z = -150; z > -302; z -= 8) c.fillRect(X(3.6), Z(z), 2, Z(z - 3) - Z(z));
    c.fillStyle = 'rgba(220,218,205,0.55)'; c.fillRect(X(-11), Z(-145), 2, Z(-305) - Z(-145)); c.fillRect(X(19), Z(-145), 2, Z(-305) - Z(-145));
    // safety borders along the walkways
    for (const x of [-30, 37]) {
      c.fillStyle = 'rgba(210,160,30,0.6)'; c.fillRect(X(x), Z(-150), 2, Z(-300) - Z(-150));
    }
    // bay number on the floor
    c.fillStyle = 'rgba(220,217,202,0.5)'; c.font = `700 ${Math.round(44)}px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('04', X(-22), Z(-268));
    c.font = `700 ${Math.round(11)}px ${FONT_EN}`; c.fillStyle = 'rgba(210,160,30,0.65)';
    c.fillText('HANGAR 04  ·  CRAWLER LANE', X(-22), Z(-282));
    // tyre / track grime
    for (let i = 0; i < 18; i++) {
      c.strokeStyle = `rgba(15,15,14,${0.06 + r() * 0.08})`; c.lineWidth = 3 + r() * 6;
      const x = X(-12 + r() * 30), z = Z(-170 + r() * 120);
      c.beginPath(); c.moveTo(x, z); c.lineTo(x + (r() - 0.5) * 20, z + 160); c.stroke();
    }
  });
}

function treadTexture() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#1b1c1d'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      c.fillStyle = '#2f3335'; c.fillRect(0, y + 3, 256, 15);
      c.fillStyle = '#0d0e0f'; c.fillRect(0, y + 18, 256, 6);
      c.fillStyle = '#464a4b'; c.fillRect(0, y + 3, 256, 2);
      for (let x = 0; x < 256; x += 64) { c.fillStyle = '#151718'; c.fillRect(x + 28, y + 2, 9, 20); }
    }
  }, { repeat: true });
}

function signTexture(text, color = '#d9d3c2', bg = '#24282a') {
  return canvasTex(1024, 256, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 1024, 256);
    c.strokeStyle = 'rgba(210,160,30,0.7)'; c.lineWidth = 8; c.strokeRect(10, 10, 1004, 236);
    c.fillStyle = color; c.font = `700 120px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 512, 136);
  });
}

export function buildHangar(feet = []) {
  const root = new THREE.Group();
  root.name = 'hangar';
  const G = L.gate, C = L.crawler;

  const pal = makePalette();
  const hazard = pal.hazard;
  const treadTex = treadTexture(); treadTex.repeat.set(1, 10);
  const treadMat = new THREE.MeshStandardMaterial({ map: treadTex, roughness: 0.9, metalness: 0.25 });
  const lampMat = pal.lamp;
  const m = {
    ...pal,
    floor: std({ map: floorTexture(), roughness: 0.72, metalness: 0.2, envMapIntensity: 0.75 }),
  };

  // ================= GATE FRAME =================
  const F = new Batch();
  const gx = G.cx, ow = G.w / 2, fw = G.frameW, zf = G.frameFront, zg = G.z;
  // concrete mass around the opening
  for (const s of [-1, 1]) F.add(uv(cbox(fw, G.frameH, zg - zf, 0.4), 0.045), m.gateConc, [gx + s * (ow + fw / 2), G.frameH / 2, (zg + zf) / 2]);
  F.add(uv(cbox(G.outerW, 10, zg - zf, 0.4), 0.045), m.gateConc, [gx, G.h + 5, (zg + zf) / 2]);
  // steel cladding on the face
  for (const s of [-1, 1]) {
    F.add(cbox(fw - 0.8, 1.2, 1.2, 0.1), m.steelD, [gx + s * (ow + fw / 2), 1.2, zf + 0.45]);
    F.add(cbox(1.4, G.frameH, 1.2, 0.1), m.steel, [gx + s * (ow + 0.7), G.frameH / 2, zf + 0.5]);
    F.add(cbox(1.4, 1.0, 1.0, 0.08), m.steel, [gx + s * (ow + fw - 0.9), G.frameH / 2, zf + 0.5]);
  }
  F.add(cbox(G.w + 4, 1.4, 1.3, 0.12), m.steel, [gx, G.h + 0.8, zf + 0.5]);
  F.add(cbox(G.w + 4, 0.8, 2.2, 0.1), m.steelD, [gx, G.h + 2.2, zf + 0.6]);
  for (const s of [-1, 1]) {
    F.add(cbox(2.4, G.frameH + 2, 2.0, 0.15), m.steelD, [gx + s * (ow + fw - 0.6), (G.frameH + 2) / 2, zf + 0.4]);
    for (let i = 0; i < 5; i++) F.add(cbox(2.5, 0.7, 0.3, 0.04), m.steel, [gx + s * (ow + fw - 0.6), 2 + i * 4.2, zf + 1.5]);
  }
  F.add(cbox(G.w + 8, 1.6, 2.0, 0.12), m.steelD, [gx, G.frameH - 0.6, zf + 0.4]);
  // frame bolts / plates
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) F.add(cbox(0.7, 0.7, 0.4, 0.05), m.dark, [gx + s * (ow + 1.3), 6 + i * 7, zf + 1.1]);
  // threshold + sill
  F.add(cbox(G.w + 6, 0.35, 13, 0.1), m.steelD, [gx, 0.14, (G.outerZ + zf) / 2 - 1.5]);
  for (let i = 0; i < 8; i++) {
    const g = cbox(3.2, 0.02, 11.5, 0.01); g.rotateY(0.42); F.add(g, hazard, [gx - 17 + i * 5, 0.38, (G.outerZ + zf) / 2 - 1.5]);
  }
  // lining of the portal, jambs and head
  for (const s of [-1, 1]) F.add(cbox(0.8, G.h, 8, 0.08), m.steelD, [gx + s * (ow - 0.2), G.h / 2, zf - 4]);
  F.add(cbox(G.w + 1.6, 1.2, 8, 0.1), m.steelD, [gx, G.h - 0.3, zf - 4]);
  // pocket liners for both layers
  for (const [z, dz] of [[G.outerZ, 4.0], [G.innerZ, 4.0]]) {
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -52 : 26, x1 = s < 0 ? -18 : 52;
      F.add(cbox(x1 - x0, 0.4, dz, 0.05), m.dark, [(x0 + x1) / 2, 0.2, z - 1.2]);
      F.add(cbox(x1 - x0, 0.4, dz, 0.05), m.dark, [(x0 + x1) / 2, G.h - 0.2, z + 1.2]);
      F.add(cbox(0.5, G.h, dz, 0.05), m.dark, [s < 0 ? x0 : x1, G.h / 2, z]);
      F.add(cbox(0.5, G.h, dz, 0.05), m.dark, [s < 0 ? -18.5 : 26.5, G.h / 2, z]);
      // guide strips
      F.add(cbox(x1 - x0, 0.16, 0.5, 0.02), m.steel, [(x0 + x1) / 2, 0.45, z - 1.8]);
      F.add(cbox(x1 - x0, 0.16, 0.5, 0.02), m.steel, [(x0 + x1) / 2, G.h - 0.6, z + 1.8]);
    }
  }
  // fixed cross beam for the inner ram pair
  F.add(cbox(48, 2.2, 1.6, 0.1), m.steelD, [gx, G.ramInnerY + 1.7, -150.4]);
  for (const s of [-1, 1]) F.add(cbox(1.2, 2.2, 3.0, 0.06), m.steelD, [gx + s * 20, G.ramInnerY + 1.7, -149.4]);
  // ram brackets / hydraulic unit mounts
  const ramOuterZ = zf + 1.9, ramInnerZ = -149.4;
  F.add(cbox(48, 2.6, 1.8, 0.1), m.steelD, [gx, G.ramOuterY + 1.4, zf + 1.0]);
  for (const s of [-1, 1]) F.add(cbox(1.0, 2.0, 2.4, 0.05), m.steelD, [gx + s * 22, G.ramOuterY + 1.4, zf + 1.0]);
  root.add(F.build());

  // hazard strips on the two pilaster faces
  {
    const b = new Batch();
    for (const s of [-1, 1]) {
      const g = cbox(fw - 1.2, 1.8, 0.06, 0.01);
      b.add(g, hazard, [gx + s * (ow + fw / 2), 4.2, zf + 0.86]);
      b.add(cbox(fw - 1.2, 0.3, 0.3, 0.03), m.yellow, [gx + s * (ow + fw / 2), 3.0, zf + 0.9]);
    }
    root.add(b.build());
  }

  // gate sign (below the ram housing so the rods don't cover it)
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(23, 3.2), new THREE.MeshStandardMaterial({ map: signTexture('BAY 04  ·  HANGAR'), roughness: 0.7 }));
    sign.position.set(gx, 58.2, zf + 0.15);
    root.add(sign);
  }

  // ================= DOOR LEAVES + RAMS =================
  // each leaf group carries its top bracket; the rods are separate and driven in setDoor()
  function leaf(side, z, layer) {
    const group = new THREE.Group();
    const outer = layer === 'outer';
    const armZ = outer ? zf + 1.9 : -149.4;
    const armY = outer ? G.ramOuterY : G.ramInnerY;
    const shelfY = outer ? 55.1 : 51.1;
    const shelfH = 0.8;
    const b = new Batch();
    b.add(uv(cbox(22, 56, G.leafT, 0.2), 0.13), outer ? m.door : m.doorD, [0, 28, 0]);
    // ribs and edge rails
    for (let y = 4; y < 56; y += 6.2) {
      b.add(cbox(21.2, 0.45, 0.5, 0.05), m.doorD, [0, y, 1.25]);
      b.add(cbox(21.2, 0.45, 0.5, 0.05), m.doorD, [0, y, -1.25]);
    }
    b.add(cbox(1.4, 55, 0.6, 0.05), m.steelD, [-10.2, 28, 1.25]);
    b.add(cbox(1.4, 55, 0.6, 0.05), m.steelD, [10.2, 28, 1.25]);
    b.add(cbox(22.4, 1.2, 3.0, 0.1), m.steelD, [0, 0.7, 0]);
    b.add(cbox(22.4, 1.2, 3.0, 0.1), m.steelD, [0, 55.2, 0]);
    // lock bars
    for (let y = 10; y < 52; y += 10) b.add(cbox(19, 0.5, 0.4, 0.04), m.steel, [0, y, 1.4]);
    // bracket: shelf under the lintel + vertical arm up to the ram
    b.add(cbox(1.5, shelfH, Math.abs(armZ - z), 0.06), m.steelD, [side * 11, shelfY, (armZ - z) / 2]);
    b.add(cbox(1.5, armY - (shelfY + shelfH / 2) + 0.6, 0.7, 0.06), m.steelD, [side * 11, (shelfY + shelfH / 2 + armY + 0.6) / 2, armZ - 0.3]);
    b.add(cyl(0.7, 0.7, 1.4, 12), m.chrome, [side * 11, armY, armZ - 0.3], [PI / 2, 0, 0]);
    b.add(cbox(2.4, 1.2, 1.2, 0.06), m.steelD, [side * 11, armY, armZ - 0.3]);
    group.add(b.build());
    // hazard band (separate mesh because it uses a texture)
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 2.0), hazard);
    hz.position.set(0, 8.0, G.leafT / 2 + 0.03); group.add(hz);
    group.position.set(gx + side * 11, 0, z);
    root.add(group);
    return group;
  }
  const door = {
    outerL: leaf(-1, G.outerZ, 'outer'), outerR: leaf(1, G.outerZ, 'outer'),
    innerL: leaf(-1, G.innerZ, 'inner'), innerR: leaf(1, G.innerZ, 'inner'),
  };

  // ram housings
  const ramHousing = (y, z, len = 12, r = 1.25) => {
    const g = new THREE.Group();
    const b = new Batch();
    b.add(cyl(r, r, len, 20), m.steelD, [0, 0, 0], [0, 0, PI / 2]);
    b.add(cyl(r * 1.14, r * 1.14, 1.0, 20), m.dark, [-len / 2 + 0.4, 0, 0], [0, 0, PI / 2]);
    b.add(cyl(r * 1.14, r * 1.14, 1.0, 20), m.dark, [len / 2 - 0.4, 0, 0], [0, 0, PI / 2]);
    b.add(cbox(2.0, 1.2, 1.6, 0.08), m.steelD, [0, r + 0.4, 0]);
    b.add(cyl(0.28, 0.28, 3.2, 8), m.chrome, [0, -r - 0.2, 0.9], [PI / 2, 0, 0]);
    g.add(b.build());
    g.position.set(gx, y, z);
    root.add(g);
    return g;
  };
  ramHousing(G.ramOuterY, zf + 1.9, 12, 1.5);
  ramHousing(G.ramInnerY, -149.4, 12, 1.3);

  // hoses looping into the frame (static)
  {
    const hoseMat = std({ color: 0x1e2020, roughness: 0.9 });
    const mkHose = (pts, r = 0.16) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, r, 6, false), hoseMat);
      root.add(mesh);
    };
    mkHose([[gx - 6, G.ramOuterY + 1.2, zf + 1.9], [gx - 7, G.ramOuterY + 4, zf + 1.4], [gx - 4, G.ramOuterY + 5.2, zf + 0.4], [gx - 1, G.ramOuterY + 2.2, zf + 1.4]]);
    mkHose([[gx + 6.4, G.ramOuterY + 1.2, zf + 1.9], [gx + 8, G.ramOuterY + 3.2, zf + 1.4], [gx + 10, G.ramOuterY + 4.6, zf + 0.6]]);
  }

  // ram rods (two per layer); geometry along +x, scaled each frame
  const rodGeo = new THREE.CylinderGeometry(0.62, 0.62, 1, 14);
  rodGeo.rotateZ(-PI / 2); rodGeo.translate(0.5, 0, 0);
  const rodMeshes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(rodGeo, m.chrome);
    mesh.castShadow = true; root.add(mesh); rodMeshes.push(mesh);
  }
  // order: outerL, outerR, innerL, innerR
  function setDoor(outer, inner) {
    const travel = 23;
    const oxL = gx - 11 - travel * outer, oxR = gx + 11 + travel * outer;
    const ixL = gx - 11 - travel * inner, ixR = gx + 11 + travel * inner;
    door.outerL.position.x = oxL; door.outerR.position.x = oxR;
    door.innerL.position.x = ixL; door.innerR.position.x = ixR;
    const setRod = (mesh, startX, bracketX, y, z) => {
      const len = Math.abs(bracketX - startX) + 0.6;
      mesh.position.set(startX, y, z);
      mesh.scale.set(len, 1, 1);
      mesh.rotation.y = bracketX < startX ? PI : 0;
    };
    const yO = G.ramOuterY, zO = zf - 1.9, yI = G.ramInnerY, zI = -149.4;
    setRod(rodMeshes[0], gx - 6, oxL - 11, yO, zO);
    setRod(rodMeshes[1], gx + 6, oxR + 11, yO, zO);
    setRod(rodMeshes[2], gx - 6, ixL - 11, yI, zI);
    setRod(rodMeshes[3], gx + 6, ixR + 11, yI, zI);
  }
  setDoor(0, 0);

  // ================= DRESSING: GATE + DOORS =================
  const GATE = dressGate(root, m, G);
  dressDoorLeaves(door, m, G);

  // ================= HANGAR INTERIOR =================
  const H = new Batch();
  const H0 = L.hangar;
  // tunnel / hall shell (slabs, inner faces visible)
  for (const s of [-1, 1]) {
    H.add(uv(cbox(2.0, H0.tunnelH + 2, H0.tunnelZ0 - H0.tunnelZ1 + 4, 0.2), 0.045), m.concreteD, [gx + s * (H0.tunnelW / 2 + 1), (H0.tunnelH + 2) / 2 - 1, (H0.tunnelZ0 + H0.tunnelZ1) / 2]);
    H.add(uv(cbox(2.0, H0.hallH + 2, H0.hallZ0 - H0.hallZ1 + 4, 0.2), 0.045), m.concreteD, [gx + s * (H0.hallW / 2 + 1), (H0.hallH + 2) / 2 - 1, (H0.hallZ0 + H0.hallZ1) / 2]);
  }
  H.add(uv(cbox(H0.tunnelW + 4, 2.0, H0.tunnelZ0 - H0.tunnelZ1 + 4, 0.2), 0.045), m.concreteD, [gx, H0.tunnelH + 1, (H0.tunnelZ0 + H0.tunnelZ1) / 2]);
  H.add(uv(cbox(H0.hallW + 4, 2.0, H0.hallZ0 - H0.hallZ1 + 4, 0.2), 0.045), m.concreteD, [gx, H0.hallH + 1, (H0.hallZ0 + H0.hallZ1) / 2]);
  H.add(uv(cbox(H0.hallW + 4, H0.hallH + 4, 2.0, 0.2), 0.045), m.concreteD, [gx, (H0.hallH + 4) / 2 - 1, H0.hallZ1 - 1]);
  // junction walls around the tunnel mouth
  for (const s of [-1, 1]) H.add(uv(cbox((H0.hallW - H0.tunnelW) / 2 + 0.5, H0.hallH, 2.0, 0.2), 0.045), m.concreteD, [gx + s * ((H0.tunnelW + H0.hallW) / 4), H0.hallH / 2, H0.hallZ0 - 1]);
  H.add(uv(cbox(H0.tunnelW + 1, H0.hallH - H0.tunnelH + 2, 2.0, 0.2), 0.045), m.concreteD, [gx, (H0.hallH + H0.tunnelH) / 2, H0.hallZ0 - 1]);

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H0.hallW, H0.tunnelZ0 - H0.hallZ1), m.floor);
  floor.rotation.x = -PI / 2; floor.position.set(gx, 0.03, (H0.tunnelZ0 + H0.hallZ1) / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ribs and wall beams
  for (let z = H0.tunnelZ0 - 8; z > H0.tunnelZ1; z -= 12) {
    for (const s of [-1, 1]) H.add(cbox(1.2, H0.tunnelH, 1.2, 0.08), m.steelD, [gx + s * (H0.tunnelW / 2 - 0.6), H0.tunnelH / 2, z]);
    H.add(cbox(H0.tunnelW, 1.0, 1.0, 0.08), m.steelD, [gx, H0.tunnelH - 1.2, z]);
    for (const s of [-1, 1]) {
      const diag = cbox(0.5, 0.5, 12, 0.04); diag.rotateX(0.72); H.add(diag, m.steel, [gx + s * (H0.tunnelW / 2 - 1.1), H0.tunnelH - 5.5, z - 5]);
    }
  }
  for (let z = H0.hallZ0 - 10; z > H0.hallZ1 + 4; z -= 15) {
    for (const s of [-1, 1]) H.add(cbox(1.6, H0.hallH, 1.6, 0.1), m.steelD, [gx + s * (H0.hallW / 2 - 1), H0.hallH / 2, z]);
    H.add(cbox(H0.hallW, 1.2, 1.2, 0.08), m.steelD, [gx, H0.hallH - 1.4, z]);
    // light fixtures on the ceiling
    H.add(cbox(4.0, 0.5, 1.2, 0.05), m.dark, [gx - 8, H0.hallH - 2.4, z]);
    H.add(cbox(3.6, 0.25, 1.0, 0.03), m.lamp, [gx - 8, H0.hallH - 2.7, z]);
    H.add(cbox(4.0, 0.5, 1.2, 0.05), m.dark, [gx + 14, H0.hallH - 2.4, z]);
    H.add(cbox(3.6, 0.25, 1.0, 0.03), m.lamp, [gx + 14, H0.hallH - 2.7, z]);
  }
  // wall service pipes / cable trays
  for (const s of [-1, 1]) {
    for (const y of [8, 11]) H.add(cyl(0.35, 0.35, H0.tunnelZ0 - H0.hallZ1, 8), m.steelD, [gx + s * (H0.hallW / 2 - 2.4), y, (H0.tunnelZ0 + H0.hallZ1) / 2], [PI / 2, 0, 0]);
    for (let z = H0.tunnelZ0 - 6; z > H0.hallZ1; z -= 18) H.add(cbox(1.2, 1.0, 1.0, 0.05), m.dark, [gx + s * (H0.hallW / 2 - 2.4), 9.5, z]);
  }
  // interior sign above the gate, readable from inside
  {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshStandardMaterial({ map: signTexture('BAY 04  ·  INNER GATE'), roughness: 0.7, side: THREE.DoubleSide }));
    s.position.set(gx, 59.2, H0.tunnelZ0 - 0.2); s.rotation.y = PI;
    root.add(s);
  }
  // hangar maintenance tower
  const tx = H0.towerX, tz = H0.towerZ, th = H0.towerH;
  const BOARD_Y = 41.0;   // boarding deck level: cockpit floor of the machine parked at the crawler start (chin 40.4)
  H.add(uv(cbox(11, 1.4, 11, 0.15), 0.045), m.concrete, [tx, 0.7, tz]);
  for (const sx of [-4, 4]) for (const sz of [-4, 4]) H.add(cbox(0.8, th, 0.8, 0.06), m.steel, [tx + sx, th / 2, tz + sz]);
  for (let y = 5; y < th; y += 5) {
    for (const sz of [-4, 4]) H.add(cbox(8.8, 0.35, 0.35, 0.04), m.steel, [tx, y, tz + sz]);
    for (const sx of [-4, 4]) H.add(cbox(0.35, 0.35, 8.8, 0.04), m.steel, [tx + sx, y, tz]);
    for (const sg of [-1, 1]) {
      const g = cbox(0.14, 0.14, Math.hypot(8, 5), 0.01); g.rotateX(sg * Math.atan2(5, 8));
      for (const sx of [-4, 4]) { if (sx > 0 && y > BOARD_Y && y - 5 < BOARD_Y + 2.5) continue; H.add(g.clone(), m.steel, [tx + sx, y - 2.5, tz]); }   // east-face door bay for the bridge
    }
  }
  // work decks: two-stage retractable cantilevers on the east face (tip x = tx+14 when out, tucked in for roll-out)
  const cantL = buildCantilevers(root, { faceX: tx + 4, z: tz, dir: 1, levels: [16, 32, 46], reach: 5, travel: 4.4 });
  for (const y of [16, 32, 46]) H.add(cbox(0.8, 0.5, 0.6, 0.04), m.lampOff, [tx + 4.6, y + 1.2, tz - 2.8]);
  // mirror tower on the right side of the bay, decks reaching in toward the machine
  const rtx = 2 * C.startX - tx;
  buildLatticeTower(root, { x: rtx, z: tz, h: th });
  const cantR = buildCantilevers(root, { faceX: rtx - 4, z: tz, dir: -1, levels: [16, 32, 46], reach: 5, travel: 4.4 });
  const cant = { e: 1, set(e) { this.e = e; cantL.set(e); cantR.set(e); } };
  // gallery tiers + lit windows along the walls (from the old dome bay); keep the control-room corner clear
  buildGallery(root, { gx, hallW: H0.hallW, hallH: H0.hallH, hallZ0: H0.hallZ0, hallZ1: H0.hallZ1,
    avoid: [[24, 62, 0, 34, H0.hallZ1 - 1, H0.hallZ1 + 24]] });
  // elevator column
  H.add(cbox(2.6, th - 2, 2.8, 0.06), std({ color: 0x8f8b45, roughness: 0.6, metalness: 0.3 }), [tx - 6, (th - 2) / 2 + 0.6, tz]);
  for (let y = 3; y < th - 2; y += 5) H.add(cbox(2.7, 0.22, 2.9, 0.02), m.dark, [tx - 6, y, tz]);
  H.add(cbox(3.6, 2.8, 3.8, 0.12), m.dark, [tx, th + 1.4, tz]);
  H.add(cbox(0.45, 0.3, 0.35, 0.02), m.lampOff, [tx, th + 1.2, tz - 2.0]);
  H.add(sphere(0.3, 8, 6), m.beaconR, [tx, th + 3.3, tz]);
  // boarding lift: cage inside the tower + telescoping bridge to the visor of the parked machine
  const lift = buildBoardingLift(root, { tx, tz, th, stopY: BOARD_Y, bridgeZ: C.startZ + 5.7, tipX: C.startX - 0.5 });   // tip stops square in front of the visor
  // gantry: rails, bridge, trolley, hook
  for (const sx of [-12, 34]) {
    H.add(cbox(1.2, 1.2, H0.hallZ0 - H0.hallZ1 - 10, 0.06), m.steel, [gx + sx, 51, (H0.hallZ0 + H0.hallZ1) / 2]);
    for (let z = H0.hallZ0 - 10; z > H0.hallZ1 + 6; z -= 12) H.add(cbox(1.2, 6, 1.2, 0.05), m.steelD, [gx + sx, 48, z]);
  }
  H.add(cbox(62, 1.6, 2.2, 0.08), m.steelD, [gx, 52, H0.gantryZ]);
  const hx = gx + 24;   // trolley parked beside the bay, hook clear of the machine
  H.add(cbox(4.0, 2.2, 5.0, 0.08), m.dark, [hx, 50.4, H0.gantryZ]);
  H.add(cbox(1.6, 1.0, 1.6, 0.05), m.yellow, [hx + 2.6, 50.3, H0.gantryZ + 2.6]);
  H.add(cyl(0.08, 0.08, 12, 6), m.dark, [hx, 44.2, H0.gantryZ]);
  H.add(cbox(1.2, 1.4, 1.0, 0.08), m.yellow, [hx, 37.6, H0.gantryZ]);
  // interior props: work bench, cart, crates
  H.add(cbox(6, 1.2, 2.4, 0.08), m.dark, [tx + 16, 0.6, H0.hallZ1 + 10]);
  H.add(cbox(6, 0.2, 2.4, 0.02), m.grate, [tx + 16, 1.3, H0.hallZ1 + 10]);
  H.add(cbox(1.5, 1.2, 1.5, 0.06), m.yellow, [tx + 18, 0.6, H0.hallZ1 + 5]);
  H.add(cbox(3.2, 1.3, 1.8, 0.08), m.dark, [gx + 28, 0.65, H0.hallZ1 + 16]);
  for (let i = 0; i < 4; i++) H.add(cbox(1.4, 0.9, 1.4, 0.06), i % 2 ? m.yellow : m.dark, [gx + 26 + (i % 2) * 1.6, 0.45 + Math.floor(i / 2) * 0.9, H0.hallZ1 + 22]);
  // workers, static (tiny against the machine)
  const ppl = new Batch();
  const pm = { suit: m.suit, vest: m.vest, skin: m.skin, hatW: m.hatW, hatY: m.hatY };
  const crewSpots = [[gx - 25, -175], [gx + 30, -190], [gx - 27, -252], [gx + 31, -262], [gx + 27, -290], [gx - 28, -298], [tx - 8, -228], [tx + 7, -247]];
  crewSpots.forEach(([x, z], i) => person(ppl, pm, x, 0.03, z, i * 1.3, 50 + i));
  // two on the tower decks
  person(ppl, pm, tx + 5.4, 16.25, tz - 2.7, -PI / 2, 80);   // beside the deck cabin, not in it
  person(ppl, pm, tx + 6.0, 32.25, tz - 1.5, -PI / 2 + 0.4, 81);
  root.add(ppl.build());
  root.add(H.build());
  const IN = dressInterior(root, m, H0);

  // ================= CRAWLER =================
  const crawler = new THREE.Group();
  crawler.name = 'crawler';
  crawler.position.set(C.startX, 0, C.startZ);
  const CB = new Batch();
  // deck + structure
  CB.add(uv(cbox(C.w, 1.6, C.l, 0.3), 0.32), m.deck, [0, 3.6, 0]);
  CB.add(cbox(C.w + 1.2, 0.5, C.l + 1.2, 0.15), m.steelD, [0, 2.9, 0]);
  CB.add(cbox(C.w - 2, 0.06, C.l - 2, 0.1), m.deck, [0, 4.41, 0]);
  for (const sx of [-1, 1]) {
    CB.add(cbox(0.7, 0.4, C.l - 2, 0.04), m.yellow, [sx * (C.w / 2 - 1.2), 4.64, 0]);
    CB.add(cbox(0.9, 1.2, C.l, 0.06), m.steelD, [sx * (C.w / 2 + 0.1), 3.4, 0]);
    for (let z = -C.l / 2 + 4; z < C.l / 2 - 2; z += 6) CB.add(cbox(0.9, 0.6, 0.9, 0.05), m.dark, [sx * (C.w / 2 - 2.2), 4.75, z]);
  }
  CB.add(cbox(C.w - 3, 0.3, 0.6, 0.05), m.yellow, [0, 4.66, C.l / 2 - 1.2]);
  CB.add(cbox(C.w - 3, 0.3, 0.6, 0.05), m.yellow, [0, 4.66, -C.l / 2 + 1.2]);
  // deck stencils
  const st = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.4), new THREE.MeshStandardMaterial({ map: signTexture('JAEGER 04', '#d8d1bd', '#3d4241'), roughness: 0.8 }));
  st.rotation.x = -PI / 2; st.position.set(0, 4.45, 5.5);
  crawler.add(st);
  // rear support A-frame
  for (const sx of [-7.2, 7.2]) {
    const leg = cbox(1.2, 16.5, 1.2, 0.08); leg.rotateX(-0.36); CB.add(leg, m.steelD, [sx, 12.6, -13.5]);
    for (const y of [9, 15]) CB.add(cbox(1.0, 0.5, 1.0, 0.04), m.steel, [sx, y, -12.2]);
  }
  for (const y of [9, 20]) CB.add(cbox(15.0, 0.7, 1.0, 0.06), m.steelD, [0, y, -11.2]);
  for (const sg of [-1, 1]) {
    const d = cbox(0.5, 12.4, 0.5, 0.04); d.rotateZ(sg * 0.55);
    CB.add(d, m.steel, [0, 14.5, -11.2]);
  }
  for (const sx of [-7.2, 7.2]) for (const y of [4, 8, 12, 16]) CB.add(cbox(1.25, 0.42, 0.3, 0.03), m.yellow, [sx, y, -12.85]);
  CB.add(cbox(8.0, 2.2, 1.0, 0.15), std({ color: 0x6a5a42, roughness: 0.9 }), [0, 20.4, -10.2]);
  // back-support cradle: two arms carry a rubber pad that actually touches the machine's back
  for (const sx of [-3.4, 3.4]) {
    CB.add(cbox(0.55, 0.55, 3.4, 0.08), m.steelD, [sx, 20.4, -8.5]);
    CB.add(cbox(0.8, 0.8, 0.9, 0.06), m.steel, [sx, 20.4, -6.9]);
  }
  CB.add(cbox(8.4, 2.4, 1.1, 0.2), m.rubber, [0, 20.4, -6.35]);
  CB.add(cbox(8.8, 0.16, 0.16, 0.02), m.yellow, [0, 21.65, -6.35]);
  for (const sx of [-6, 6]) CB.add(cyl(0.35, 0.35, 5.4, 10), m.chrome, [sx, 8.8, -14.8], [0.42, 0, 0]);
  // foot clamps (from the measured sole boxes)
  const clampFeet = feet.length ? feet : [{ box: new THREE.Box3(new THREE.Vector3(-4.4, 0, -2.2), new THREE.Vector3(-2.0, 1.6, 4.4)) }, { box: new THREE.Box3(new THREE.Vector3(2.0, 0, -2.2), new THREE.Vector3(4.4, 1.6, 4.4)) }];
  for (const f of clampFeet) {
    const b = f.box, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    for (const s of [-1, 1]) {
      CB.add(cbox(1.3, 1.5, d + 2.4, 0.1), m.steelD, [s < 0 ? b.min.x - 0.9 : b.max.x + 0.9, 5.15, cz]);
      CB.add(cbox(0.9, 0.3, d + 1.4, 0.03), m.yellow, [s < 0 ? b.min.x - 1.1 : b.max.x + 1.1, 5.95, cz]);
      // hydraulic toggle
      CB.add(cyl(0.32, 0.32, 2.4, 10), m.chrome, [s < 0 ? b.min.x - 2.4 : b.max.x + 2.4, 6.2, cz - d / 2 - 1.0], [0.5, 0, 0]);
      CB.add(cbox(1.0, 0.8, 1.2, 0.05), m.dark, [s < 0 ? b.min.x - 2.4 : b.max.x + 2.4, 5.2, cz - d / 2 - 1.0]);
    }
    CB.add(cbox(w + 5.0, 1.2, 1.3, 0.1), m.steelD, [cx, 5.0, b.max.z + 1.1]);
    CB.add(cbox(w + 4.4, 0.28, 0.9, 0.03), m.yellow, [cx, 5.7, b.max.z + 1.3]);
    CB.add(cbox(w + 4.0, 1.0, 1.2, 0.08), m.dark, [cx, 4.9, b.min.z - 1.1]);
  }
  // control cab at the rear-left
  CB.add(cbox(4.2, 3.4, 4.6, 0.15), m.steelD, [-10.5, 6.2, -17.0]);
  CB.add(cbox(3.6, 1.4, 0.3, 0.04), m.glass, [-10.5, 6.7, -14.65]);
  CB.add(cbox(0.3, 1.4, 3.4, 0.04), m.glass, [-12.6, 6.7, -17]);
  CB.add(cbox(4.6, 0.3, 5.0, 0.05), m.steel, [-10.5, 8.0, -17]);
  CB.add(cbox(0.6, 0.5, 0.6, 0.04), m.lampOff, [-10.5, 8.3, -17]);
  for (const sx of [-12.0, -9.0]) for (const sz of [-18.8, -15.2]) CB.add(cbox(0.12, 1.0, 0.12, 0.01), m.rail, [sx, 8.4, sz]);
  CB.add(cbox(3.2, 0.1, 0.1, 0.01), m.rail, [-10.5, 8.8, -15.2]);
  // deck railings on the rear edge
  for (let x = -12; x <= 12; x += 3) CB.add(cbox(0.1, 1.1, 0.1, 0.01), m.rail, [x, 5.0, -20.6]);
  CB.add(cbox(24, 0.08, 0.08, 0.01), m.rail, [0, 5.5, -20.6]);
  // headlights (front of the deck)
  for (const sx of [-9.5, 9.5]) {
    CB.add(cbox(1.6, 1.0, 0.8, 0.06), m.steelD, [sx, 5.5, 20.6]);
    CB.add(cbox(1.35, 0.7, 0.1, 0.02), m.lamp, [sx, 5.5, 21.05]);
    CB.add(cbox(1.2, 0.7, 0.3, 0.04), m.dark, [sx, 5.5, 20.1]);
  }
  for (const sx of [-9.5, 9.5]) CB.add(sphere(0.18, 8, 6), m.beaconR, [sx, 6.15, 20.6]);
  crawler.add(CB.build());

  // ---- track pods (4) ----
  const pods = [], wheels = [];
  // track loop in the pod's yz plane: straights at y ±r, end arcs; plates move backwards along the ground run
  const TRACK = (() => { const r = 1.25, Ls = 16 - 2 * 1.4, P = 2 * Ls + 2 * PI * r; return { r, Ls, P, n: Math.round(P / 0.8) }; })();
  const trackPlateGeo = new THREE.BoxGeometry(7.2, 0.3, 0.72);
  const trackPlateMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2d, roughness: 0.7, metalness: 0.55 });
  const trackMeshes = [];
  const trackAt = (s) => {
    const { r, Ls, P } = TRACK; s = ((s % P) + P) % P;
    if (s < Ls) return [Ls / 2 - s, -r, 0];
    s -= Ls; if (s < PI * r) { const th = -PI / 2 + s / r; return [-Ls / 2 - r * Math.cos(th), r * Math.sin(th), th - PI / 2]; }
    s -= PI * r; if (s < Ls) return [-Ls / 2 + s, r, 0];
    s -= Ls; { const th = PI / 2 - s / r; return [Ls / 2 + r * Math.cos(th), r * Math.sin(th), PI / 2 - th]; }
  };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _ax = new THREE.Vector3(1, 0, 0);
  const setTracks = (d) => {
    for (const im of trackMeshes) {
      for (let i = 0; i < TRACK.n; i++) { const [zz, yy, ph] = trackAt(i * TRACK.P / TRACK.n + d); _q.setFromAxisAngle(_ax, ph); _p.set(0, yy, zz); _m4.compose(_p, _q, _one); im.setMatrixAt(i, _m4); }
      im.instanceMatrix.needsUpdate = true;
    }
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pod = new THREE.Group();
    pod.position.set(sx * 10.5, 0, sz * 10.5);
    const b = new Batch();
    // frame / side plates
    b.add(cbox(1.0, 1.9, 15.2, 0.1), m.steelD, [sx * 3.25, 1.4, 0]);
    b.add(cbox(6.6, 0.5, 15.2, 0.08), m.steelD, [0, 1.4, 0]);
    for (const z of [-7.2, 0, 7.2]) b.add(cbox(1.4, 1.2, 1.2, 0.06), m.dark, [0, 1.4, z]);
    // belts: real track plates running round the pod (instanced, driven in setRoll)
    {
      const plates = new THREE.InstancedMesh(trackPlateGeo, trackPlateMat, TRACK.n);
      plates.position.set(0, 1.4, 0); plates.castShadow = true; plates.receiveShadow = true;
      plates.frustumCulled = false; pod.add(plates); trackMeshes.push(plates);
    }
    // fenders / outer skirt
    b.add(cbox(0.4, 0.4, 15.4, 0.03), m.yellow, [sx * 3.76, 2.72, 0]);
    pod.add(b.build());
    // wheels on the outboard face
    for (const z of [-6, -2, 2, 6]) {
      const w = new THREE.Group();
      w.position.set(sx * 3.7, 1.4, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.6, 18), m.rubber);
      tire.rotation.z = PI / 2; tire.castShadow = true; w.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.64, 14), m.steel);
      hub.rotation.z = PI / 2; w.add(hub);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), m.dark);
      cap.rotation.z = PI / 2; w.add(cap);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * PI * 2;
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.72, 6), m.chrome);
        bolt.rotation.z = PI / 2; bolt.position.set(0, Math.cos(a) * 0.36, Math.sin(a) * 0.36);
        w.add(bolt);
      }
      pod.add(w); wheels.push(w);
    }
    pods.push(pod); crawler.add(pod);
  }
  // crawler lights
  const headlightSpots = [];
  for (const sx of [-9.5, 9.5]) {
    const sp = new THREE.SpotLight(0xfff1d6, 0, 90, 0.48, 0.65, 1.4);
    sp.position.set(sx, 5.6, 21); sp.target.position.set(sx * 0.7, 2, 62);
    crawler.add(sp, sp.target); headlightSpots.push(sp);
  }
  setTracks(0);
  root.add(crawler);
  const CR = dressCrawler(crawler, m, C, feet);

  // ================= ATMOSPHERE + LIGHTS =================
  const ATM = makeAtmosphere(root, m);
  const GLOWS = [...IN.glows, ...CR.glows];
  for (const g of GLOWS) g.userData.baseOpacity = g.material.opacity;
  for (const p of IN.points) p.userData.baseIntensity = p.intensity;
  let lightK = 1;

  const pointLights = [];
  const lp = [[gx - 8, 44, -175], [gx + 14, 44, -195], [gx - 8, 44, -240], [gx + 14, 44, -275]];
  for (const [x, y, z] of lp) {
    const p = new THREE.PointLight(0xffd8a8, 0, 110, 1.5);
    p.position.set(x, y, z); root.add(p); pointLights.push(p);
  }
  const gateLights = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.SpotLight(0xfff3dc, 0, 320, 0.42, 0.7, 1.2);
    sp.position.set(gx + s * 12, 44, L.gate.frameFront + 22);
    sp.target.position.set(gx - s * 2, 6, L.hangar.tunnelZ1 - 20);
    root.add(sp, sp.target); gateLights.push(sp);
  }
  const beaconLights = [];
  for (const [x, y, z] of [[gx - 20, 40, -200], [gx + 30, 40, -280]]) {
    const p = new THREE.PointLight(0xff2a1a, 0, 40, 2);
    p.position.set(x, y, z); root.add(p); beaconLights.push(p);
  }

  // update helpers
  function updateLights(k, gateOpen, time) {
    lightK = k;
    lampMat.emissiveIntensity = 0.04 + 1.6 * k;
    pal.lampWarm.emissiveIntensity = 0.35 + 1.6 * k;
    for (const p of pointLights) p.intensity = 95 * k;
    for (const p of IN.points) p.intensity = p.userData.baseIntensity * (0.25 + 0.75 * k);
    for (const s of gateLights) s.intensity = 320 * gateOpen;
    const blink = 0.4 + 0.6 * Math.max(0, Math.sin(time * 3.2));
    for (const p of beaconLights) p.intensity = 12 * k * blink;
    for (const s of headlightSpots) s.intensity = 320 * k;
    for (const g of GLOWS) g.material.opacity = g.userData.baseOpacity * (0.08 + 0.92 * k);
    for (const sh of ATM.shafts) {
      sh.visible = false;   // no hard cone/shaft meshes: lighting should read as light, not geometry
    }
    ATM.dust.visible = k > 0.02;
    if (GATE.signal) {
      const open = gateOpen > 0.35;
      GATE.signal.red.emissiveIntensity = open ? 0.2 : 3.2;
      GATE.signal.grn.emissiveIntensity = open ? 3.0 : 0.2;
    }
  }
  function tick(time) {
    if (ATM.dust.visible) updateDust(ATM.dust, time, lightK);
  }
  function setRoll(dist) {
    treadTex.offset.y = (dist / 1.6) % 1;
    setTracks(dist);
    for (const w of wheels) w.rotation.x = dist / 1.05;
  }

  return {
    root, crawler, door, setDoor, updateLights, setRoll, tick, lift, cant,
    pointLights, gateLights, lampMat, treadTex, atmosphere: ATM, glows: GLOWS,
    crawlerSpots: headlightSpots,
    // local footprint helpers for main.js
    deckTop: C.deckTop,
  };
}

// simple hangar worker (feet at y)
function person(b, m, x, y, z, rot = 0, seed = 0) {
  const r = rng(seed * 13 + 5), s = 0.9 + r() * 0.12;
  const add = (g, mat, p, rr = 0) => {
    g.scale(s, s, s);
    if (rr) g.rotateY(rr);
    g.rotateY(rot);
    g.translate(x + p[0] * s, y + p[1] * s, z + p[2] * s);
    b.add(g, mat);
  };
  const helmet = [m.hatW, m.hatY][Math.floor(r() * 2)];
  add(cbox(0.11, 0.36, 0.12, 0.02), m.suit, [-0.08, 0.18, 0]);
  add(cbox(0.11, 0.36, 0.12, 0.02), m.suit, [0.08, 0.18, 0]);
  add(cbox(0.26, 0.34, 0.17, 0.03), m.suit, [0, 0.5, 0]);
  add(cbox(0.29, 0.12, 0.19, 0.02), m.vest, [0, 0.55, 0]);
  add(cbox(0.075, 0.3, 0.09, 0.02), m.suit, [-0.18, 0.5, 0.01], 0.12);
  add(cbox(0.075, 0.3, 0.09, 0.02), m.suit, [0.18, 0.5, 0.01], -0.12);
  add(sphere(0.09, 8, 6), m.skin, [0, 0.73, 0]);
  add(new THREE.SphereGeometry(0.115, 8, 5, 0, PI * 2, 0, PI / 2), helmet, [0, 0.77, 0]);
}
