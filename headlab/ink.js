// Screen-space ink lines: silhouettes + creases from normal/depth discontinuities.
// Independent of mesh topology (CSG T-junctions don't create false lines).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class Ink {
  constructor(renderer) {
    this.r = renderer;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthTexture: new THREE.DepthTexture(2, 2), samples: 0 });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        tN: { value: this.rt.texture }, tD: { value: this.rt.depthTexture }, texel: { value: new THREE.Vector2() },
        near: { value: 0.1 }, far: { value: 200 }, persp: { value: 0 }, crease: { value: Math.cos(22 * Math.PI / 180) },
        depthJump: { value: 0.012 }, mask: { value: 0 }, opacity: { value: 1 }, width: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tN; uniform sampler2D tD; uniform vec2 texel; uniform float near, far, persp, crease, depthJump, mask, opacity, width;
        varying vec2 vUv;
        float viewZ(vec2 uv){ float d = texture2D(tD, uv).x; return persp > 0.5 ? -perspectiveDepthToViewZ(d, near, far) : near + d * (far - near); }
        void main(){
          vec4 c = texture2D(tN, vUv);
          vec3 n = normalize(c.xyz * 2.0 - 1.0);
          float z = viewZ(vUv);
          float e = 0.0;
          for (int k = 0; k < 4; k++) {
            vec2 o = (k == 0 ? vec2(1.0, 0.0) : k == 1 ? vec2(-1.0, 0.0) : k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0)) * texel * width;
            vec4 cn = texture2D(tN, vUv + o);
            if (abs(cn.a - c.a) > 0.5) { e = max(e, c.a); continue; }   // silhouette (only draw on the object side)
            if (c.a < 0.5) continue;
            vec3 nn = normalize(cn.xyz * 2.0 - 1.0);
            if (dot(n, nn) < crease) e = 1.0;
          }
          // depth steps via second difference (ignores smooth slopes), drawn on the nearer side
          if (c.a > 0.5) {
            for (int k = 0; k < 2; k++) {
              vec2 o = (k == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) * texel * width;
              float a1 = viewZ(vUv + o), a2 = viewZ(vUv - o), b1 = viewZ(vUv + 2.0 * o), b2 = viewZ(vUv - 2.0 * o);
              float thr = depthJump * (persp > 0.5 ? z * 0.02 : 1.0);
              if ((a1 - z > thr && (a1 - z) > 3.0 * abs(z - a2)) || (a2 - z > thr && (a2 - z) > 3.0 * abs(z - a1))) e = 1.0;
            }
          }
          if (mask > 0.5) gl_FragColor = vec4(vec3(e), 1.0);
          else gl_FragColor = vec4(0.07, 0.07, 0.08, e * opacity);
        }`,
    }));
  }
  render(scene, camera, w, h, target, { mask = false, opacity = 1, width = 1 } = {}) {
    const r = this.r;
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const u = this.quad.material.uniforms;
    u.texel.value.set(1 / w, 1 / h); u.near.value = camera.near; u.far.value = camera.far;
    u.persp.value = camera.isPerspectiveCamera ? 1 : 0; u.mask.value = mask ? 1 : 0; u.opacity.value = opacity; u.width.value = width;
    const prevBg = scene.background, prevAuto = r.autoClear, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    scene.background = null; scene.overrideMaterial = this.normalMat;
    const hidden = []; scene.traverse(o => { if ((o.isLine || o.isPoints || o.userData.noInk) && o.visible) { hidden.push(o); o.visible = false; } });
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, camera);
    hidden.forEach(o => o.visible = true);
    scene.overrideMaterial = null; scene.background = prevBg;
    r.setRenderTarget(target);
    if (mask) { r.setClearColor(0x000000, 1); r.clear(); }
    r.autoClear = false; this.quad.render(r); r.autoClear = prevAuto;
    r.setClearColor(cc, ca);
  }
}
