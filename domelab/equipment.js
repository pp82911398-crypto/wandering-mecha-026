import * as THREE from 'three';
import { cbox, cyl, ring, Batch } from '../src/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildControlLift } from '../portstorm/lift.js?v=dome-perf-20261023f';
import { canvasTex, fbm, rng } from '../src/materials.js';

// Pale, non-metallic poured concrete. Height, roughness and puddles share the same grain.
export function concreteFloorTextures() {
  const S = 1024, grain = rng(108);
  const broad = fbm(S, [4, 8, 16, 32], 109), fine = fbm(S, [64, 128, 256], 110);
  const col = new Uint8ClampedArray(S * S * 4), height = col.slice(), rough = col.slice();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, j = i * 4, grit = grain();
    const edge = Math.min(x % 256, 255 - x % 256, y % 256, 255 - y % 256);
    const joint = edge < 1 ? 0.52 : edge < 3 ? 0.88 : 1;
    const v = (151 + broad[i] * 36 + fine[i] * 18 + (grit - 0.5) * 19) * joint;
    col[j] = v; col[j + 1] = v * 0.985; col[j + 2] = v * 0.955; col[j + 3] = 255;
    height[j] = height[j + 1] = height[j + 2] = (112 + fine[i] * 58 + grit * 46) * joint; height[j + 3] = 255;
    rough[j] = rough[j + 1] = rough[j + 2] = (0.89 + fine[i] * 0.09) * 255; rough[j + 3] = 255;
  }
  const texture = (data, isData) => canvasTex(S, S, c => {
    const image = c.createImageData(S, S); image.data.set(data); c.putImageData(image, 0, 0);
  }, { repeat: true, data: isData });
  // One mask spans the whole bay: no tiled, regularly repeated islands of water.
  const puddles = rng(218), centres = [];
  const puddleMask = canvasTex(2048, 2048, c => {
    c.fillStyle = 'rgb(0,128,0)'; c.fillRect(0, 0, 2048, 2048);
    const s = 2048 / 700;
    for (let i = 0; i < 42; i++) {
      let x, z, valid = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        x = (puddles() - 0.5) * 194; z = (puddles() - 0.5) * 194 - 6;
        if (Math.hypot(x, z + 6) < 97 && centres.every(p => Math.hypot(p[0] - x, p[1] - z) > 7)) { valid = true; break; }
      }
      if (!valid) continue;
      centres.push([x, z]);
      const rx = 1.5 + puddles() * 5.3, rz = 0.65 + puddles() * 2.3, angle = puddles() * Math.PI * 2;
      c.save(); c.translate((x / 700 + 0.5) * 2048, (0.5 - z / 700) * 2048); c.rotate(angle); c.scale(rx * s, rz * s);
      c.beginPath();
      for (let j = 0; j <= 24; j++) {
        const a = j % 24 / 24 * Math.PI * 2;
        const r = 0.85 + 0.12 * Math.sin(a * 3 + i) + 0.08 * Math.cos(a * 5 - i * 0.8);
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        j === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fillStyle = `rgb(${180 + Math.floor(puddles() * 65)},128,0)`; c.shadowColor = c.fillStyle;
      c.shadowBlur = 1.6; c.fill(); c.restore();
    }
  }, { data: true });
  return { col: texture(col, false), bump: texture(height, true), rough: texture(rough, true), mask: puddleMask };
}

// Twin continuous tracks run along X. The complete lift is parented to the same mobile root.
export function buildLiftCrawler(m, z, { depth = 13.1 } = {}) {
  const group = new THREE.Group(); group.name = 'liftCrawler'; group.position.z = z;
  const spread = (depth - 13.1) / 2;
  const deckY = 3.1, a = 6.5, radius = 1.25, cy = 1.39, length = 4 * a + 2 * Math.PI * radius;
  const shoeCount = 72, pitch = length / shoeCount, wheels = [], belts = [];
  const tread = new THREE.MeshStandardMaterial({ color: 0x737979, metalness: 0.65, roughness: 0.68 });
  const B = new Batch();
  B.add(cbox(14.2, 0.75, 9.4 + 2 * spread, 0.14), m.beam, [0, 2.36, 0]);
  B.add(cbox(13.2, 0.4, 9.7 + 2 * spread, 0.08), m.grate, [0, deckY - 0.2, 0]);
  for (const x of [-4.2, 4.2]) for (const dz of [-4.2 - spread, 4.2 + spread]) {
    B.add(cbox(1.7, 0.8, 1.7, 0.12), m.yellow, [x, deckY - 0.2, dz]);
    for (const bx of [-0.58, 0.58]) for (const bz of [-0.58, 0.58])
      B.add(cyl(0.11, 0.11, 0.13, 6), m.steel, [x + bx, deckY + 0.26, dz + bz]);
  }
  for (const x of [-5, 0, 5]) B.add(cbox(0.7, 0.8, 10.8 + 2 * spread, 0.09), m.beam, [x, 2.23, 0]);
  for (const s of [-1, 1]) {
    B.add(cbox(13.4, 0.65, 0.28, 0.05), m.yellow, [0, 2.67, s * (4.85 + spread)]);
    B.add(cbox(12.6, 0.12, 0.1, 0.01), m.dark, [0, 2.7, s * (5.01 + spread)]);
    for (const x of [-6.4, 6.4]) {
      B.add(cbox(1.25, 0.5, 8.8 + 2 * spread, 0.12), m.yellow, [x, 2.28, 0]);
      B.add(cbox(0.3, 0.18, 0.5, 0.03), m.beacon, [x, 2.6, s * (4.3 + spread)]);
      B.add(ring(0.18, 0.32, 0.23, 16), m.steel, [x + Math.sign(x) * 0.55, 2.12, s * (3.3 + spread)], [0, 0, Math.PI / 2]);
    }
    const dz = s * (5.4 + spread);
    B.add(cbox(12.8, 0.65, 0.6, 0.07), m.beam, [0, 1.78, dz]);
    for (const x of [-a, -4.5, -2.25, 0, 2.25, 4.5, a]) {
      const r = Math.abs(x) === a ? 1.07 : 0.99;
      B.add(cyl(0.2, 0.2, 2.7, 12), m.steel, [x, cy, dz - s * 0.65], [Math.PI / 2, 0, 0]);
      const wheel = new THREE.Group(); wheel.position.set(x, cy, dz);
      const W = new Batch();
      W.add(cyl(r, r, 1.68, 24), m.dark, [0, 0, 0], [Math.PI / 2, 0, 0]);
      for (const face of [-1, 1]) {
        W.add(ring(r * 0.62, r * 0.94, 0.14, 24), m.steel, [0, 0, face * 0.87], [Math.PI / 2, 0, 0]);
        W.add(cyl(0.34, 0.34, 0.22, 12), m.yellow, [0, 0, face * 0.94], [Math.PI / 2, 0, 0]);
        for (let k = 0; k < 6; k++) {
          const angle = k * Math.PI / 3;
          W.add(cbox(0.15, r * 0.68, 0.12, 0.02), m.beam,
            [-Math.sin(angle) * r * 0.5, Math.cos(angle) * r * 0.5, face * 0.93], [0, 0, angle]);
          W.add(cyl(0.06, 0.06, 0.07, 6), m.chromeE,
            [Math.cos(angle) * 0.25, Math.sin(angle) * 0.25, face * 1.07], [Math.PI / 2, 0, 0]);
        }
      }
      if (Math.abs(x) === a) for (let k = 0; k < 16; k++) {
        const angle = k * Math.PI / 8;
        W.add(cbox(0.17, 0.22, 1.6, 0.025), m.steel,
          [-Math.sin(angle) * 1.09, Math.cos(angle) * 1.09, 0], [0, 0, angle]);
      }
      wheel.add(W.build()); group.add(wheel); wheels.push({ group: wheel, radius: r });
    }
    const shoe = mergeGeometries([
      cbox(pitch * 0.91, 0.18, 2.18, 0.025),
      cbox(0.14, 0.085, 2.28, 0.018).translate(0, -0.105, 0),
      cbox(0.16, 0.18, 0.18, 0.02).translate(0, 0.15, -0.68),
      cbox(0.16, 0.18, 0.18, 0.02).translate(0, 0.15, 0.68),
    ]);
    const mesh = new THREE.InstancedMesh(shoe, tread, shoeCount); mesh.name = `liftTrack${s}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, cy, dz), 9.2);
    for (let i = 0; i < shoeCount; i++) mesh.setColorAt(i, new THREE.Color().setScalar(i % 4 === 0 ? 0.77 : 1));
    group.add(mesh); belts.push({ mesh, z: dz });
  }
  // Small power pack sits between the tracks, with physical connections to the crossmembers.
  B.add(cbox(4.8, 0.9, 2.9, 0.15), m.dark, [0, 1.92, 0]);
  for (let x = -1.8; x <= 1.8; x += 0.45) B.add(cbox(0.16, 0.08, 2.5, 0.01), m.steel, [x, 2.4, 0]);
  group.add(B.build());

  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1), scale = new THREE.Vector3(1, 1, 1);
  function update(distance) {
    // Bottom shoes move against chassis travel, so the contact patch stays still on the floor.
    for (const belt of belts) for (let i = 0; i < shoeCount; i++) {
      let u = THREE.MathUtils.euclideanModulo(i * pitch - distance, length), angle;
      if (u < 2 * a) { p.set(-a + u, cy - radius, belt.z); angle = 0; }
      else if ((u -= 2 * a) < Math.PI * radius) {
        const t = -Math.PI / 2 + u / radius; p.set(a + radius * Math.cos(t), cy + radius * Math.sin(t), belt.z); angle = t + Math.PI / 2;
      } else if ((u -= Math.PI * radius) < 2 * a) { p.set(a - u, cy + radius, belt.z); angle = Math.PI; }
      else {
        u -= 2 * a; const t = Math.PI / 2 + u / radius;
        p.set(-a + radius * Math.cos(t), cy + radius * Math.sin(t), belt.z); angle = t + Math.PI / 2;
      }
      q.setFromAxisAngle(axis, angle); matrix.compose(p, q, scale); belt.mesh.setMatrixAt(i, matrix);
    }
    for (const belt of belts) belt.mesh.instanceMatrix.needsUpdate = true;
    for (const wheel of wheels) wheel.group.rotation.z = -distance / wheel.radius;
  }
  update(0);
  return { group, deckY, update, belts, wheels, width: 16.1, depth };
}

// Adapter: the existing crawler geometry and the hangar's existing glass elevator.
export function buildObservationEquipment(scene, m, { x, z, side, levels, depth }) {
  const root = new THREE.Group(); root.name = side < 0 ? 'leftObservationTower' : 'rightObservationTower';
  root.position.set(x, 0, z); scene.add(root);
  const crawler = buildLiftCrawler(m, 2.5, { depth: depth + 10 }); root.add(crawler.group);
  const baseY = crawler.deckY, liftRoot = new THREE.Group(); liftRoot.position.y = baseY; root.add(liftRoot);
  levels = levels.map(y => y + baseY);
  const top = Math.max(...levels);
  const elevator = buildControlLift(liftRoot, { x: 0, zMez: depth / 2, y0: top - baseY, openFront: true });
  // The stock shaft has crossbars across the doorway. Keep an open pedestrian face.
  elevator.group.children[0].visible = false;
  const glazing = elevator.group.children[2];
  glazing.material.color.setHex(0xf3dda0); glazing.material.opacity = .17; glazing.userData.noCollision = true;
  const guides = new Batch(), shaftZ = depth / 2 + 2.4, shaftH = top - baseY + 7.5;
  for (const x of [-2.2, 2.2]) for (const z of [shaftZ - 2.2, shaftZ + 2.2])
    guides.add(cbox(.22, shaftH, .22, .025), m.steel, [x, shaftH / 2, z]);
  for (let y = 3; y < shaftH; y += 3.5) {
    guides.add(cbox(4.4, .16, .16, .02), m.beam, [0, y, shaftZ + 2.2]);
    for (const x of [-2.2, 2.2]) guides.add(cbox(.16, .16, 4.4, .02), m.beam, [x, y, shaftZ]);
  }
  liftRoot.add(guides.build());
  if (m.deck) {
    const geo = new THREE.BoxGeometry(3.45, .02, 3.45), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 700 + .5, p.getZ(i) / 700 + .5);
    const floor = new THREE.Mesh(geo, m.deck); floor.position.y = .015;
    elevator.group.getObjectByName('controlLiftCage').add(floor);
  }
  const landings = new Batch();
  for (const y of levels) landings.add(cbox(3.85, 0.24, 0.9, 0.03), m.grate, [0, y - 0.12, depth / 2 + 0.4]);
  root.add(landings.build());
  const stops = [baseY + 2.1, ...new Set(levels)].sort((a, b) => a - b);
  const state = { y: stops[0], targetY: stops[0], offset: 0, targetOffset: 0, floor: 0, moving: false, gate: 0 };
  function update(dt) {
    state.y += Math.sign(state.targetY - state.y) * Math.min(Math.abs(state.targetY - state.y), state.gate < .001 ? 2.4 * dt : 0);
    elevator.set((state.y - baseY - elevator.stops[0]) / (elevator.stops[1] - elevator.stops[0]));
    const previous = state.offset;
    state.offset += Math.sign(state.targetOffset - state.offset) * Math.min(Math.abs(state.targetOffset - state.offset), state.gate < .001 ? dt * 0.8 : 0);
    root.position.x = x + side * state.offset;
    if (previous !== state.offset) crawler.update(side * state.offset);
    state.moving = Math.abs(state.y - state.targetY) > .01 || Math.abs(state.offset - state.targetOffset) > .01;
  }
  update(0);
  return { root, crawler, elevator, stops, state, baseY, side, depth, materials: m,
    go: i => { if (!Number.isInteger(i) || stops[i] == null) return false; state.floor = i; state.targetY = stops[i]; return true; },
    move: v => state.targetOffset = THREE.MathUtils.clamp(v, 0, 6), update };
}
