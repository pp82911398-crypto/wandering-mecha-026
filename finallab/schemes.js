// Paint schemes: material colours, marking inks, weathering dust colour and a little light balance per scheme.
// Shape, lamps (always yellow-orange) and wear amount are untouched.
import * as THREE from 'three';
import { PAL } from './paint.js';
import { INK, redrawMarks } from './lamps.js';
import { DUST } from './wear.js';
import { SURF } from './surface.js';

export const SCHEMES = {
  night: { cn: '炭黑 · 夜战型',
    mat: { armor: [0x34383d, 0.5, 0.4], armor2: [0x42474d, 0.5, 0.42], recess: [0x1a1c1f, 0.45, 0.55], frame: [0x6a7078, 0.8, 0.34],
           dark: [0x0c0d0f, 0.4, 0.65], red: [0xb3261c, 0.3, 0.45], yellow: [0xb3261c, 0.3, 0.45] },
    ink: { stripe: '#b3261c', num: '#b3261c', tagBar: '#b3261c', tagText: '#9aa0a6', hazA: '#b3261c', hazB: '#141517' },
    dust: [0.30, 0.28, 0.25], stripes: true, light: { env: 1.45, rim: 3.4, key: 2.9, exp: 1.2 } },
  navy: { cn: '海军灰 · 舰载型',
    mat: { armor: [0x6e7b86, 0.4, 0.46], armor2: [0x55616b, 0.42, 0.48], recess: [0x2c333a, 0.4, 0.55], frame: [0x3a3f45, 0.7, 0.4],
           dark: [0x121518, 0.4, 0.62], red: [0xa3201b, 0.3, 0.48], yellow: [0xd9a514, 0.3, 0.5] },
    ink: { stripe: '#a3201b', num: '#e6e8ea', tagBar: '#a3201b', tagText: '#e6e8ea', hazA: '#d9a514', hazB: '#1d2024' },
    dust: [0.22, 0.21, 0.19], stripes: true, light: { env: 0.85, rim: 2.2, key: 2.3, exp: 1.05 } },
  hazard: { cn: '工程黄 · 重型作业型',
    mat: { armor: [0xd9a21b, 0.3, 0.5], armor2: [0x2b2e32, 0.4, 0.5], recess: [0x1a1c1f, 0.4, 0.55], frame: [0x3c4045, 0.7, 0.4],
           dark: [0x101113, 0.4, 0.62], red: [0xa3201b, 0.3, 0.48], yellow: [0x1d2024, 0.3, 0.5] },
    ink: { stripe: '#1d2024', num: '#1d2024', tagBar: '#1d2024', tagText: '#1d2024', hazA: '#d9a21b', hazB: '#1d2024' },
    dust: [0.2, 0.17, 0.12], stripes: false, light: { env: 0.75, rim: 2.0, key: 2.2, exp: 1.0 } },
  snow: { cn: '雪原白',
    mat: { armor: [0xd2d5d8, 0.25, 0.45], armor2: [0xb3b8bc, 0.3, 0.48], recess: [0x858b90, 0.35, 0.55], frame: [0x50565c, 0.55, 0.45],
           dark: [0x1d2024, 0.45, 0.62], red: [0xa3201b, 0.35, 0.5], yellow: [0xd9a514, 0.3, 0.5] },
    ink: { stripe: '#a8231c', num: '#a8231c', tagBar: '#a8231c', tagText: '#26292d', hazA: '#d9a514', hazB: '#1d2024' },
    dust: [0.17, 0.16, 0.14], stripes: false, light: { env: 0.65, rim: 1.6, key: 2.1, exp: 1.0 } },
};

export function applyScheme(key, ctx) {
  const S = SCHEMES[key] || SCHEMES.night;
  for (const [k, [c, met, rough]] of Object.entries(S.mat)) { const m = PAL[k]; m.color.setHex(c); m.metalness = met; m.roughness = rough; }
  Object.assign(INK, S.ink); redrawMarks();
  DUST.value.setRGB(...S.dust);
  (ctx.stripes || []).forEach(s => s.visible = S.stripes);
  ctx.mech.traverse(o => { if (o.name.startsWith('decal:红条')) o.visible = S.stripes; });
  ctx.scene.environmentIntensity = S.light.env * (SURF.on.value ? SURF.envK : 1); ctx.rim.intensity = S.light.rim; ctx.key.intensity = S.light.key; ctx.renderer.toneMappingExposure = S.light.exp;
  return S;
}
