import * as THREE from 'three';
import { Batch, cyl, ring, cbox } from '../src/kit.js';
import { emissive } from '../src/materials.js';

export function buildRecessedTurntable(scene, m) {
  const root = new THREE.Group(); root.name = 'recessedTurntable'; scene.add(root);
  const rotor = new THREE.Group(); rotor.name = 'mechTurntableRotor'; root.add(rotor);
  const radius = 24.1, B = new Batch(), R = new Batch();
  const amber = emissive(0xffae32, 1.2), plate = new THREE.MeshStandardMaterial({ color: 0x555e63, roughness: 0.82, metalness: 0.45 });
  amber.name = 'turntableAmberRing';
  B.add(ring(23.35, radius, 0.35, 128), m.steel, [0, -0.175, 0]);
  B.add(cyl(radius, radius, 0.5, 128), m.dark, [0, -2.25, 0]);
  B.add(ring(22.6, 23.5, 1.8, 128), m.beam, [0, -1.2, 0]);
  B.add(ring(23.65, 23.78, 0.018, 160), amber, [0, 0.018, 0]);
  R.add(cyl(23.0, 23.0, 0.4, 128), plate, [0, -0.2, 0]);
  R.add(cyl(3.4, 3.4, 1.4, 48), m.steel, [0, -1.0, 0]);
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2, x = Math.sin(a), z = Math.cos(a);
    B.add(cbox(0.18, 0.6, 0.45, 0.02), m.steel, [x * 23.3, -0.9, z * 23.3], [0, a, 0]);
    if (i % 4 === 0) {
      R.add(cbox(0.06, 0.015, 22.1, 0), m.dark, [x * 11.5, 0.008, z * 11.5], [0, a, 0]);
      R.add(cbox(0.5, 0.025, 0.8, 0.02), m.yellow, [x * 22.2, 0.018, z * 22.2], [0, a, 0]);
    }
  }
  root.add(B.build()); rotor.add(R.build());
  const state = { angle: 0, target: 0, auto: false, waiting: false };
  function update(dt, clear = true) {
    const requested = state.auto || Math.abs(state.target - state.angle) > 0.001;
    state.waiting = requested && !clear;
    if (state.auto && clear) state.target += dt * 4;
    if (clear) state.angle += Math.sign(state.target - state.angle) * Math.min(Math.abs(state.target - state.angle), dt * 8);
    rotor.rotation.y = state.angle * Math.PI / 180;
  }
  return { root, rotor, radius, state, update,
    rotateTo: deg => { state.auto = false; state.target = state.angle + THREE.MathUtils.euclideanModulo(deg - state.angle + 180, 360) - 180; },
    needsClearance: () => state.auto || Math.abs(state.target) > 0.001 || Math.abs(state.angle) > 0.001 };
}
