// Post-processing: GTAO, outline (selection), bloom, filmic grade (split-tone, vignette, grain, CA).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const Clamp = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 14.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      float l = max(max(c.r, c.g), c.b); if (l > uMax) c.rgb *= uMax / l;
      gl_FragColor = vec4(max(c.rgb, 0.0), 1.0); }`,
};
const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uShake: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float r2 = dot(c, c);
      vec3 col = texture2D(tDiffuse, uv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.9, 1.0, 1.1), (1.0 - smoothstep(0.0, 0.5, l)) * 0.4);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.35, 1.0, l) * 0.3);
      col = mix(vec3(l), col, 1.06);
      col *= mix(1.0, 0.42, smoothstep(0.12, 0.9, r2 * 1.7));
      float g = h(uv * uRes + fract(uTime * 13.7) * 91.0);
      col += (g - 0.5) * 0.028;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, w, h, quality, options = {}) {
  const dpr = options.pixelRatio ?? renderer.getPixelRatio();
  const bloomScale = options.bloomScale ?? 1;
  const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(w, h);
  const aoCam = camera.clone();
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  let gtao = null;
  if (quality === 'ultra') {
    gtao = new GTAOPass(scene, aoCam, w * dpr, h * dpr);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 2.6, distanceExponent: 1.6, thickness: 3.0, scale: 1.3, samples: 12, distanceFallOff: 1.0 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  composer.addPass(new ShaderPass(Clamp));
  const outline = new OutlinePass(new THREE.Vector2(w, h), scene, camera);
  Object.assign(outline, { edgeStrength: 4, edgeGlow: 0.6, edgeThickness: 1.2, pulsePeriod: 2.6 });
  outline.visibleEdgeColor.set(0xffb347); outline.hiddenEdgeColor.set(0x3a2208);
  outline.enabled = false;
  composer.addPass(outline);
  const bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, w * bloomScale / 2), Math.max(1, h * bloomScale / 2)), 0.42, 0.5, 1.1);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (bw, bh) => bloomSetSize(Math.max(1, Math.round(bw * bloomScale)), Math.max(1, Math.round(bh * bloomScale)));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  composer.setSize(w, h);
  let cssW = w, cssH = h, pixelRatio = dpr;
  grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  return {
    composer, gtao, outline, bloom, grade, aoCam,
    get pixelRatio() { return pixelRatio; },
    setSamples(n) { for (const target of [composer.renderTarget1, composer.renderTarget2]) if (target.samples !== n) { target.samples = n; target.dispose(); } },
    setPixelRatio(k) { pixelRatio = Math.max(0.25, k); composer.setPixelRatio(pixelRatio); grade.uniforms.uRes.value.set(cssW * pixelRatio, cssH * pixelRatio); },
    setSize(w, h) { cssW = w; cssH = h; composer.setSize(w, h); grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio); },
    render(t) {
      aoCam.copy(camera); aoCam.layers.set(0);
      grade.uniforms.uTime.value = t;
      composer.render();
    },
  };
}
