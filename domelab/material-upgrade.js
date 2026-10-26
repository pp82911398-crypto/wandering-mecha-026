// Airport-only surface layer: one shared data texture, no new scene meshes/lights/passes/materials.
import * as THREE from 'three';
import { SURF, detailTexture } from '../finallab/surface.js';

const KINDS = {
  concrete: { grain: 1.5, brush: 0, rv: .9, scratch: .15, edge: .45, tile: .5, bump: .0024 },
  paint: { grain: .8, brush: .1, rv: .5, scratch: .4, edge: .65, tile: .625, bump: .0012 },
  metal: { grain: .25, brush: .8, rv: .6, scratch: .55, edge: .6, tile: .625, bump: .001 },
  deck: { grain: .45, brush: .5, rv: .7, scratch: 1, edge: .45, tile: .5, bump: .0012 },
  rubber: { grain: .85, brush: 0, rv: .3, scratch: 0, edge: 0, tile: 1, bump: .001 },
};
const number = x => x.toFixed(4);
const baseHooks = new WeakMap();

// Match the actual circular service gallery and open storm-sky aperture. Bake once at startup.
function airportEnvironment(renderer) {
  const s = new THREE.Scene();
  const add = (geometry, color, intensity, p, target = [0, 0, 0], side = THREE.DoubleSide) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side }));
    mesh.position.set(...p); mesh.lookAt(...target); s.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(100, 100, 100), 0x06080c, 1, [0, 0, 0], [0, 0, 1], THREE.BackSide);
  // Keep the original cool skylight's energy, interrupt it with narrow service-light reflections.
  add(new THREE.PlaneGeometry(60, 60), 0x6f8fc8, 1.6, [0, 49, 0]);
  add(new THREE.PlaneGeometry(30, 6), 0xffa860, 3.0, [-49, 10, 10]);
  add(new THREE.PlaneGeometry(30, 4), 0xffa860, 2.4, [49, 18, -10]);
  add(new THREE.PlaneGeometry(70, 14), 0x7fc8ff, 2.0, [0, 6, -49]);
  add(new THREE.PlaneGeometry(10, 4), 0xfff0dc, 4.0, [20, 30, 49]);
  for (let i = 0; i < 16; i++) {
    const a = (i + .5) * Math.PI / 8;
    add(new THREE.PlaneGeometry(9, 1.3), 0xffd6a0, 2.1,
      [Math.sin(a) * 39, 28, Math.cos(a) * 39], [0, -8, 0]);
  }
  for (const x of [-22, 22]) add(new THREE.PlaneGeometry(1.8, 22), 0xffc78e, 2.0, [x, 8, 40]);
  add(new THREE.PlaneGeometry(100, 100), 0x1a1c22, 1, [0, -49, 0]);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, .025);
  pm.dispose(); s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

// Chain the existing enhance() shader. Its dirt / rain streaks / scanning uniforms keep working.
function patch(material, kind, uniforms) {
  const k = KINDS[kind], base = baseHooks.get(material.onBeforeCompile);
  const previous = base?.previous || material.onBeforeCompile;
  const cacheKey = base?.cacheKey || material.customProgramCacheKey();
  material.onBeforeCompile = function (sh, renderer) {
    previous.call(this, sh, renderer);
    sh.uniforms.uDomeDetail = uniforms.detail; sh.uniforms.uDomeSurface = uniforms.on;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDomeP; varying vec3 vDomeN; varying vec3 vDomeViewN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDomeP = position; vDomeN = objectNormal; vDomeViewN = transformedNormal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDomeDetail; uniform float uDomeSurface;
        varying vec3 vDomeP; varying vec3 vDomeN; varying vec3 vDomeViewN;
        vec4 domeDetail; float domeHeight; float domeEdge; float domeNear; float domeBroad;
        vec4 domeTri(vec3 p, vec3 n) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= max(w.x + w.y + w.z, 1e-5);
          return texture2D(uDomeDetail, p.yz * ${number(k.tile)}) * w.x
               + texture2D(uDomeDetail, p.zx * ${number(k.tile)}) * w.y
               + texture2D(uDomeDetail, p.xy * ${number(k.tile)}) * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        domeDetail = vec4(.5, .5, .5, 0.); domeHeight = 0.; domeEdge = 0.; domeNear = 0.; domeBroad = 0.;
        if (uDomeSurface > .5) {
          domeDetail = domeTri(vDomeP, normalize(vDomeN));
          float footprint = length(fwidth(vDomeP)) * 512.0 * ${number(k.tile)};
          domeNear = 1. - smoothstep(1.5, 5., footprint);
          domeBroad = 1. - smoothstep(12., 40., footprint);
          float curvature = length(fwidth(normalize(vDomeViewN))) / max(length(fwidth(vViewPosition)), 1e-5);
          domeEdge = smoothstep(8., 30., curvature) * ${number(k.edge)};
          domeHeight = domeNear * (${number(k.grain)} * domeDetail.r + ${number(k.brush * 1.6)} * domeDetail.g);
          diffuseColor.rgb *= 1. + (domeDetail.b - .5) * domeBroad * .018;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + .006,
            domeNear * domeDetail.a * ${number(k.scratch * .22)} + domeEdge * .12);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= 1. + (domeDetail.b - .5) * domeBroad * ${number(k.rv * .48)};
        roughnessFactor *= 1. + (domeDetail.g - .5) * domeNear * ${number(k.brush * .3)};
        roughnessFactor = clamp(roughnessFactor * (1. - domeEdge * .14)
          + domeNear * domeDetail.a * ${number(k.scratch * .13)}, .04, 1.);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uDomeSurface > .5) {
          vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
          vec3 r1 = cross(dy, normal), r2 = cross(normal, dx);
          float det = dot(dx, r1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(domeHeight) * r1 + dFdy(domeHeight) * r2) * ${number(k.bump)};
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  baseHooks.set(material.onBeforeCompile, { previous, cacheKey });
  material.customProgramCacheKey = () => cacheKey + '|dome-surface-v1|' + kind;
  material.userData.domeSurfaceKind = kind; material.needsUpdate = true;
}

export function createMaterialUpgrade({ renderer, scene, env, mech, enabled = true }) {
  const original = scene.environment, intensity = scene.environmentIntensity;
  // Reuse the finished model's 512² data texture: one texture for both model and airport.
  const uniforms = { on: { value: 1 }, detail: { value: SURF.detail.value || detailTexture() } };
  const baked = airportEnvironment(renderer), seen = new Set(), counts = {};
  const choose = mat => {
    if (!mat.isMeshStandardMaterial || mat.transparent || mat.opacity < 1) return;
    if (mat.emissiveIntensity >= .5 && Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) > 0) return;
    if (mat === env.floor.material) return 'deck';
    if (mat.metalness >= .55) return mat.roughness < .2 ? null : 'metal';
    if (mat.metalness >= .1) return mat.roughness > .78 ? 'deck' : 'paint';
    if (mat.roughness >= .84 && mat.color.getHex() > 0x101010) return 'concrete';
    if (mat.roughness >= .65 && Math.max(mat.color.r, mat.color.g, mat.color.b) < .01) return 'rubber';
  };
  const visit = object => {
    if (object === mech.group) return;
    if (object.isMesh) for (const mat of [].concat(object.material)) {
      if (seen.has(mat)) continue;
      seen.add(mat); const kind = choose(mat);
      if (kind) { patch(mat, kind, uniforms); counts[kind] = (counts[kind] || 0) + 1; }
    }
    object.children.forEach(visit);
  };
  visit(scene);
  // Wall style swaps copy into the same material slots; re-chain their current shader after each swap.
  const oldWallSet = env.wallAppearance.set;
  env.wallAppearance.set = function (mode) {
    oldWallSet(mode);
    for (const name of ['panel', 'structure']) patch(env.wallAppearance[name], mode === 'bluegray' ? 'paint' : 'concrete', uniforms);
  };
  const state = { envK: 1.0 };
  const set = on => {
    uniforms.on.value = on ? 1 : 0;
    scene.environment = on ? baked.texture : original;
    scene.environmentIntensity = intensity * (on ? state.envK : 1);
  };
  set(enabled);
  return { set, uniforms, state, get enabled() { return uniforms.on.value > .5; },
    stats: { texture: '512×512 RGBA · shared with 026', materials: counts },
    dispose() { set(false); baked.dispose(); } };
}
