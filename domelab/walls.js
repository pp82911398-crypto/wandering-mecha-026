import * as THREE from 'three';
import { canvasTex, rng } from '../src/materials.js';

// Two dedicated wall materials; changing them never recolours the robot, roof or vehicles.
export function createWallAppearance(m) {
  const random = rng(9041);
  const map = canvasTex(1024, 1024, c => {
    c.fillStyle = '#89949c'; c.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
      const x = col * 512, y = row * 256;
      c.fillStyle = row % 2 ? '#82909a' : '#929ca3'; c.fillRect(x + 6, y + 5, 500, 246);
      c.fillStyle = '#3c505f'; c.fillRect(x + 324, y + 6, 99, 245);
      c.fillStyle = '#4c5860'; c.fillRect(x, y, 5, 256); c.fillRect(x, y, 512, 5);
      c.fillStyle = '#a5adb0'; c.fillRect(x + 7, y + 6, 496, 2);
      for (const dx of [19, 494]) for (const dy of [20, 234]) {
        c.fillStyle = '#45515a'; c.beginPath(); c.arc(x + dx, y + dy, 3, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#43525b';
      for (let i = 0; i < 12; i++) c.fillRect(x + 35 + i * 13, y + 206, 6, 28);
      c.font = 'bold 16px monospace'; c.fillText(row === 1 ? 'BAY · 03' : 'SERVICE / PPDC', x + 36, y + 47);
    }
    for (let i = 0; i < 1400; i++) {
      const x = random() * 1024, y = random() * 1024;
      c.fillStyle = `rgba(27,36,42,${random() * .12})`; c.fillRect(x, y, 1 + random() * 3, 7 + random() * 47);
    }
  }, { repeat: true });
  map.repeat.set(28, 6); map.anisotropy = 4;
  const lightPanel = new THREE.MeshStandardMaterial({ map, color: 0xc2ccd2, metalness: .25, roughness: .82,
    emissive: 0x283039, emissiveIntensity: .18 });
  const lightStructure = new THREE.MeshStandardMaterial({ color: 0x61717d, metalness: .35, roughness: .77 });
  const slots = { panel: m.concreteD.clone(), structure: m.concrete.clone() };
  const originals = { panel: m.concreteD, structure: m.concrete };
  let mode = 'bluegray';
  function set(value) {
    if (!['dark', 'bluegray'].includes(value)) return;
    mode = value;
    for (const name of Object.keys(slots)) {
      const source = value === 'dark' ? originals[name] : name === 'panel' ? lightPanel : lightStructure;
      slots[name].copy(source);
      slots[name].onBeforeCompile = source.onBeforeCompile;
      slots[name].customProgramCacheKey = source.customProgramCacheKey.bind(source);
      slots[name].needsUpdate = true;
    }
  }
  set('bluegray');
  return { ...slots, set, get mode() { return mode; } };
}
