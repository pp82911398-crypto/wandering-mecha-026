import * as THREE from 'three';
import { PI, cbox, cyl, ring, shell, slab, torus, Batch } from '../src/kit.js';
import { enhance, emissive } from '../src/materials.js';

export function buildIndustrialRoof(scene, { RW, HW, CZ, RO, RY }) {
  const root = new THREE.Group(); root.name = 'industrialDome'; root.position.z = CZ; scene.add(root);
  const steel = (color, roughness = 0.72) => enhance(new THREE.MeshStandardMaterial({ color, roughness,
    metalness: 0.5, emissive: 0x28313b, emissiveIntensity: 0.2 }), { dirt: 0.25, streak: 0.25, scale: 0.16 });
  const M = { panel: steel(0x626d73), panel2: steel(0x566168), beam: steel(0x35434e), edge: steel(0x8b9493, 0.55),
    dark: steel(0x222a31), yellow: steel(0xb69332), pipe: steel(0x854437), lamp: emissive(0xffbd24, 2.7, 0x624208), white: emissive(0xffd68c, 3.5) };
  const B = new Batch(), point = (r, a, y) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  function beam(batch, mat, from, to, w, h) {
    const d = to.clone().sub(from), g = cbox(w, h, d.length(), Math.min(w, h) * 0.12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
    batch.add(g, mat, from.clone().add(to).multiplyScalar(0.5).toArray());
  }
  // Three rows of thick, separate steel roof cassettes; seams stay visibly recessed.
  const bays = 32, slopeY = r => RY - (r - RO) / (RW + 5 - RO) * (RY - HW);
  for (let i = 0; i < bays; i++) {
    const a = i / bays * 2 * PI, da = 2 * PI / bays;
    for (let j = 0; j < 3; j++) {
      const r0 = RO + j * (RW + 5 - RO) / 3 + 0.2, r1 = RO + (j + 1) * (RW + 5 - RO) / 3 - 0.2;
      B.add(shell([[r1, slopeY(r1)], [r0, slopeY(r0)]], 1.3,
        { segs: 5, phiStart: a + 0.009, phiLength: da - 0.018 }), (i + j) % 3 ? M.panel : M.panel2);
    }
    // Wide flange radial girders, with a web and two flanges instead of a single black box.
    const outer = point(RW + 1, a, HW - 2), inner = point(RO + 1, a, RY - 3.7);
    beam(B, M.beam, outer, inner, 0.75, 4.4);
    for (const dy of [-2.1, 2.1]) beam(B, M.edge, outer.clone().add(new THREE.Vector3(0, dy, 0)), inner.clone().add(new THREE.Vector3(0, dy, 0)), 2.9, 0.28);
    // Upper wall steel lining, vertical stiffeners and bracket plates echo the reference.
    for (let j = 0; j < 3; j++) B.add(shell([[RW - 0.5, HW - 38 + j * 12.5], [RW - 0.5, HW - 25.8 + j * 12.5]], 0.55,
      { segs: 5, phiStart: a + 0.01, phiLength: da - 0.02 }), (i + j) % 2 ? M.panel : M.panel2);
    B.add(cbox(0.8, 38, 1.6, 0.06), M.beam, point(RW - 1.8, a, HW - 19).toArray(), [0, a, 0]);
    for (const y of [HW - 31, HW - 18, HW - 5]) {
      B.add(cbox(2.3, 0.35, 2.3, 0.06), M.edge, point(RW - 2, a, y).toArray(), [0, a, 0]);
      for (const t of [-0.7, 0.7]) B.add(cyl(0.16, 0.16, 0.2, 6), M.yellow,
        [Math.sin(a) * (RW - 2) + Math.cos(a) * t, y + 0.3, Math.cos(a) * (RW - 2) - Math.sin(a) * t]);
    }
    // Downward warm luminaires are spaced around the steel service gallery.
    const al = a + da / 2;
    B.add(cbox(4.1, 0.65, 1.6, 0.1), M.dark, point(RW - 6, al, HW - 8).toArray(), [0, al, 0]);
    B.add(cbox(3.5, 0.1, 1.1, 0.03), M.white, point(RW - 6, al, HW - 8.38).toArray(), [0, al, 0]);
  }
  for (const r of [RO + 2.5, 67, 86, RW + 1]) {
    B.add(ring(r - 0.65, r + 0.65, 1.3, 128), M.beam, [0, slopeY(r) - 4.3, 0]);
    B.add(ring(r - 0.9, r + 0.9, 0.22, 128), M.edge, [0, slopeY(r) - 5.05, 0]);
  }
  // Continuous amber halo beneath the clear opening, plus the yellow gallery fascia.
  B.add(ring(RO - 1, RO + 2, 3.3, 128), M.beam, [0, RY - 2.5, 0]);
  B.add(ring(RO - 1.05, RO - 0.25, 0.22, 160), M.lamp, [0, RY - 4.3, 0]);
  B.add(ring(RW - 7.5, RW - 3, 0.65, 128), M.beam, [0, HW - 13, 0]);
  B.add(ring(RW - 7.7, RW - 7.4, 0.65, 160), M.lamp, [0, HW - 12.7, 0]);
  for (const y of [HW - 11.1, HW - 11.8]) B.add(torus(RW - 7.3, 0.07, 6, 128), M.edge, [0, y, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 96; i++) B.add(cbox(0.09, 1.65, 0.09, 0.01), M.edge, point(RW - 7.3, i / 96 * 2 * PI, HW - 11.8).toArray());
  for (const [r, y, size, material] of [[RW - 2.3, HW - 23, 0.4, M.pipe], [RW - 3, HW - 27, 0.19, M.dark], [RW - 3.7, HW - 29, 0.14, M.edge]]) {
    B.add(torus(r, size, 8, 128), material, [0, y, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 32; i++) B.add(cbox(0.35, 1.5, 1.1, 0.04), M.edge, point(r, i / 32 * 2 * PI, y).toArray(), [0, i / 32 * 2 * PI, 0]);
  }

  // Two armoured semicircular leaves slide out over the roof on parallel gantry rails.
  const leaves = [], travel = RO + 3, gateY = RY + 3.1;
  for (const z of [-RO - 2.4, RO + 2.4]) {
    B.add(cbox(RO * 4 + 9, 2.4, 2.1, 0.18), M.beam, [0, gateY - 0.7, z]);
    B.add(cbox(RO * 4 + 7, 0.25, 0.85, 0.06), M.edge, [0, gateY + 0.64, z]);
    for (const x of [-RO * 1.85, RO * 1.85]) B.add(cbox(1.6, 3.1, 3.5, 0.15), M.yellow, [x, gateY + 0.3, z]);
  }
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.name = side < 0 ? 'roofDoorLeft' : 'roofDoorRight'; leaf.position.y = gateY;
    const D = new Batch(), radius = RO - 0.1;
    const pts = Array.from({ length: 49 }, (_, i) => {
      const a = -PI / 2 + i / 48 * PI; return [side * radius * Math.cos(a), radius * Math.sin(a)];
    });
    const plate = slab(pts, 2, 0.12); plate.rotateX(PI / 2); D.add(plate, M.panel);
    // Reinforced underside ribs, recessed panel bays and a yellow central sealing edge.
    for (let z = -40; z <= 40; z += 10) {
      const width = Math.sqrt(radius * radius - z * z);
      D.add(cbox(width, 2.2, 0.8, 0.1), M.beam, [side * width / 2, -1.25, z]);
      D.add(cbox(width, 0.22, 1.9, 0.04), M.edge, [side * width / 2, -2.32, z]);
      for (let x = 5; x < width - 4; x += 10) {
        D.add(cbox(Math.min(8.7, width - x), 0.25, 7.5, 0.07), M.panel2, [side * (x + 1), -1.17, z + 4.4]);
        D.add(cbox(3.2, 0.09, 0.25, 0.015), M.lamp, [side * (x + 1), -1.34, z + 4.4]);
      }
    }
    D.add(cbox(0.5, 2.5, RO * 2 - 0.3, 0.05), M.yellow, [side * 0.28, -0.2, 0]);
    D.add(cbox(0.16, 0.18, RO * 2 - 1, 0.02), M.lamp, [side * 0.5, -1.55, 0]);
    for (const z of [-RO - 2.4, RO + 2.4]) {
      D.add(cbox(4.8, 1.3, 4.4, 0.12), M.beam, [side * 1.8, 1.25, z + Math.sign(z) * -1]);
      for (const x of [0.2, 3.2]) D.add(cyl(0.62, 0.62, 1.25, 16), M.edge, [side * x, 1.5, z], [PI / 2, 0, 0]);
      // Rack motor housing sits on the bogie instead of floating beside the leaf.
      D.add(cbox(2.2, 1.8, 1.6, 0.18), M.yellow, [side * 1.8, 2.1, z - Math.sign(z) * 1.2]);
    }
    leaf.add(D.build()); root.add(leaf); leaves.push({ group: leaf, side });
  }
  const structure = B.build(false); structure.name = 'roofSteelwork'; root.add(structure);
  // Two broad uplights reveal the ceiling steelwork without adding dozens of real lights.
  const uplights = [];
  for (const s of [-1, 1]) {
    const l = new THREE.SpotLight(0xffd28a, 30000, 180, 1.12, 0.75, 2);
    l.position.set(s * 64, HW - 33, 0); l.target.position.set(s * 48, RY - 4, 0);
    root.add(l, l.target); uplights.push(l);
  }
  const state = { open: 1, target: 1, moving: false };
  function update(dt) {
    const d = state.target - state.open;
    state.open += Math.sign(d) * Math.min(Math.abs(d), dt * 0.11);
    state.moving = Math.abs(state.target - state.open) > 1e-5;
    const t = state.open * state.open * (3 - 2 * state.open);
    for (const leaf of leaves) leaf.group.position.x = leaf.side * travel * t;
  }
  update(0);
  return { root, state, leaves, uplights, opening: { radius: RO, y: gateY - 1, z: CZ, travel },
    setOpen: v => state.target = THREE.MathUtils.clamp(v, 0, 1), update };
}
