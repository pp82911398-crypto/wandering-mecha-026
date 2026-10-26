import * as THREE from 'three';
import { canvasTex, rng } from '../src/materials.js';
import { concreteFloorTextures } from './equipment.js';

// Embossed steel is a shared texture, never thousands of separate pieces of geometry.
export function steelTextures({ bright = false, modular = false } = {}) {
  const S = 1024, random = rng(510), heights = document.createElement('canvas'); heights.width = heights.height = S;
  const h = heights.getContext('2d'); h.fillStyle = '#777'; h.fillRect(0, 0, S, S);
  const col = canvasTex(S, S, c => {
    const img = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = (bright ? 154 : 114) + (random() - 0.5) * 17;
      img.data.set([v, v + 3, v + 5, 255], i * 4); }
    c.putImageData(img, 0, 0);
    // Alternating elongated diamonds, with baked dark edges and a narrow top highlight.
    for (let y = -16; y < S + 16; y += 20) for (let x = -16; x < S + 16; x += 20) {
      const offset = Math.round(y / 20) % 2 * 10, angle = ((Math.round(x / 20) + Math.round(y / 20)) % 2 ? 1 : -1) * Math.PI / 4;
      c.save(); c.translate(x + offset, y); c.rotate(angle);
      c.fillStyle = 'rgba(30,38,44,.58)'; c.fillRect(-6.5, -0.1, 14, 3.8);
      c.fillStyle = bright ? '#b7bfc3' : '#939ea4'; c.fillRect(-7, -2.7, 14, 3.2);
      c.fillStyle = bright ? '#dae0df' : '#b9c3c7'; c.fillRect(-6, -2.8, 12, 0.9); c.restore();
      h.save(); h.translate(x + offset, y); h.rotate(angle); h.fillStyle = '#c1c1c1'; h.fillRect(-7, -2.7, 14, 3.2); h.restore();
    }
    const step = modular ? 256 : 512;
    for (let x = 0; x <= S; x += step) { c.fillStyle = '#303b43'; c.fillRect(x - 2, 0, 4, S); h.fillStyle = '#333'; h.fillRect(x - 2, 0, 4, S); }
    for (let y = 0; y <= S; y += step) { c.fillStyle = '#303b43'; c.fillRect(0, y - 2, S, 4); h.fillStyle = '#333'; h.fillRect(0, y - 2, S, 4); }
    if (modular) {
      // Maintenance channel, bolted steel plates and restrained orange wayfinding.
      c.fillStyle = '#48535c'; c.fillRect(456, 0, 112, S);
      for (let y = 0; y < S; y += 64) {
        c.fillStyle = '#272e35'; c.fillRect(465, y + 4, 94, 55);
        c.save(); c.beginPath(); c.rect(470, y + 8, 84, 47); c.clip();
        c.fillStyle = '#bb8c34';
        for (let x = 420; x < 600; x += 28) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y); c.lineTo(x + 56, y + 64); c.lineTo(x + 44, y + 64); c.closePath(); c.fill(); } c.restore();
      }
      c.fillStyle = '#b26832'; c.fillRect(439, 0, 5, S);
      c.font = 'bold 17px sans-serif'; c.fillText('SERVICE 03', 280, 240); c.fillText('MAINTENANCE', 615, 758);
      for (let y = 20; y < S; y += 128) for (const x of [452, 572]) { c.fillStyle = '#252c32'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.fillStyle = '#a1a9ac'; c.fillRect(x - 1.5, y - 1.5, 3, 3); }
    }
  }, { repeat: true });
  const bump = new THREE.CanvasTexture(heights); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.colorSpace = THREE.NoColorSpace; bump.anisotropy = 4;
  const rough = canvasTex(S, S, c => { c.fillStyle = bright ? '#dedede' : '#c9c9c9'; c.fillRect(0, 0, S, S); }, { repeat: true, data: true });
  col.anisotropy = 4; rough.anisotropy = 4;
  return { col, bump, rough };
}

export function industrialFloorTextures() {
  const mask = concreteFloorTextures().mask;
  return { ...steelTextures({ modular: true }), mask, metalness: 0.45, bumpScale: 0.018, repeat: 60 };
}

export function brightWalkwayMaterial() {
  const textures = steelTextures({ bright: true });
  textures.col.repeat.set(1 / 12, 1 / 12);
  // Unlit surface with the tread's highlights baked into its texture: no extra lamps.
  const material = new THREE.MeshBasicMaterial({ map: textures.col, color: 0xffffff, toneMapped: false });
  material.name = 'brightDiamondSteel';
  return { material, textures };
}
