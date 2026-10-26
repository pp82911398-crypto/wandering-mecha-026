// Weathering (做旧) as a shader layer on the paint materials, driven by one uniform 0..1 (UI slider "磨损").
// Noise is taken in the mesh's own space, so marks stay put on moving parts. Layers:
//   grime   - low-frequency dirt, heavier toward the feet (world height) and in recesses
//   streaks - vertical rain/oil runs on upright faces
//   chips   - paint knocked off down to bare gunmetal (metallic, smoother), more on the lower legs and feet
//   scuffs  - fine diagonal scratch strokes lightening the paint
import * as THREE from 'three';
import { PAL } from './paint.js';
import { SURF, KINDS, GLSL_HEAD, glslSurface, glslRough, GLSL_NORMAL } from './surface.js';

export const WEAR = { value: 0.5 };
export const YOFF = { value: 0 };   // world-Y offset so the port can keep the same foot-to-waist grime band after raising the mech onto the crawler
export const DUST = { value: new THREE.Color(0.06, 0.055, 0.05) };   // grime colour: dark dirt on light paint, pale dust on dark paint

const NOISE = /* glsl */`
  float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float wNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float wFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * wNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export function patch(mat, k) {
  const K = KINDS[k.kind || 'paint'];
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = WEAR; sh.uniforms.uDust = DUST; sh.uniforms.uYOff = YOFF;
    sh.uniforms.uDetail = SURF.detail; sh.uniforms.uSurf = SURF.on; sh.uniforms.uTile = SURF.tile;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWObj; varying vec3 vWWorld; varying vec3 vWN; varying vec3 vSObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSObjN = objectNormal; vWObj = position; vWWorld = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWear; uniform vec3 uDust; uniform float uYOff; varying vec3 vWObj; varying vec3 vWWorld; varying vec3 vWN;\n${NOISE}
        float wChip; float wGrime;
${GLSL_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${glslSurface(K)}
        {
          float W = uWear;
          vec3 p = vWObj;
          float low = smoothstep(-18.0, -35.5, vWWorld.y - uYOff);                   // 0 at the waist -> 1 at the soles
          float g = wFbm(p * 0.55);
          wGrime = W * (0.25 + 0.55 * low + ${k.recess.toFixed(2)}) * smoothstep(0.35, 0.8, g) * ${(k.grime ?? 1).toFixed(2)};
          float upright = 1.0 - abs(vWN.y);
          float st = wNoise(vec3(p.x * 9.0, p.y * 0.35, p.z * 9.0)) * wNoise(vec3(p.x * 23.0, p.y * 0.8, p.z * 23.0));
          float streak = W * upright * smoothstep(0.25, 0.55, st) * 0.55;
          float ch = wFbm(p * 4.2 + 7.0);
          wChip = W * smoothstep(0.78 - 0.18 * W - 0.12 * low, 0.84 - 0.18 * W - 0.12 * low, ch) * ${k.chip.toFixed(2)};
          float sc = wNoise(vec3((p.x + p.y) * 2.0, (p.y - p.z) * 60.0, p.z * 2.0));
          float scuff = W * smoothstep(0.93, 0.99, sc) * ${k.scuff.toFixed(2)};
          vec3 c = diffuseColor.rgb;
          c = mix(c, uDust, clamp(wGrime * 0.75, 0.0, 0.7));                              // dirt / dust
          c *= 1.0 - streak * 0.5;                                                          // runs
          c = mix(c, c * 1.18 + 0.04, scuff);                                                // light scratches
          // surface upgrade: scratches lighten the paint, handled convex edges wear (paint off, bare metal)
          c = mix(c, c * 1.15 + 0.03, uSurf * sD.a * W * ${(K.scratch * 0.6).toFixed(2)});
          c = mix(c, c * 1.12 + 0.015, sEdge * 0.25);
          float eN = smoothstep(0.5, 0.75, sD.b * 0.5 + wFbm(p * 9.0) * 0.7);
          wChip = max(wChip, sEdge * eN * (0.2 + 0.8 * W) * ${k.chip.toFixed(2)});
          c = mix(c, vec3(0.30, 0.31, 0.32), wChip);                                       // bare metal
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + glslRough(K) + '\nroughnessFactor = mix(roughnessFactor, 0.33, wChip); roughnessFactor = min(1.0, roughnessFactor + wGrime * 0.3);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLSL_NORMAL)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, wChip);');
  };
  mat.customProgramCacheKey = () => 'wear-' + mat.name + '-' + (k.kind || 'paint');
  mat.needsUpdate = true;
}

export function applyWear() {
  patch(PAL.armor, { chip: 1.0, scuff: 1.0, recess: 0.0 });
  patch(PAL.armor2, { chip: 1.0, scuff: 1.0, recess: 0.05 });
  patch(PAL.recess, { chip: 0.5, scuff: 0.3, recess: 0.25, kind: 'primer' });
  patch(PAL.frame, { chip: 0.35, scuff: 0.6, recess: 0.15, kind: 'metal' });
  patch(PAL.chrome, { chip: 0, scuff: 0, recess: 0.1, grime: 0.5, kind: 'chrome' });
  patch(PAL.dark, { chip: 0, scuff: 0, recess: 0, grime: 0.3, kind: 'rubber' });
  patch(PAL.yellow, { chip: 1.2, scuff: 0.8, recess: 0.0 });
  patch(PAL.red, { chip: 1.0, scuff: 0.5, recess: 0.0 });
}
