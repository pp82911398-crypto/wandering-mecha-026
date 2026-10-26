// Atmosphere: rain streaks lit by spotlights, fake volumetric beams, sparks, steam, wet mirror floor.
import * as THREE from 'three';
import { G, rng } from './materials.js';

const V3 = THREE.Vector3;

// ---------------- RAIN ----------------
export function createRain(scene, spots, count = 26000) {
  const r = rng(4);
  const seed = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = r(), b = r(), c = r();
    for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const N = Math.min(4, spots.length);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: G.uTime, uArea: { value: 120 }, uH: { value: 110 }, uOpacity: { value: 1 },
      uSP: { value: spots.slice(0, N).map(s => s.position.clone()) },
      uSD: { value: spots.slice(0, N).map(s => s.target.position.clone().sub(s.position).normalize()) },
      uSC: { value: spots.slice(0, N).map(s => Math.cos(s.angle * 1.05)) },
      uLamp: { value: new V3() }, uLampDir: { value: new V3(0, 0, 1) },
      uRoofEnabled: { value: 0 }, uRoofShift: { value: 49 }, uRoofRadius: { value: 46 },
      uRoofZ: { value: -6 }, uRoofY: { value: 182 },
    },
    defines: { NS: N },
    vertexShader: /* glsl */`
      attribute float aEnd;
      uniform float uTime, uArea, uH; uniform vec3 uSP[NS]; uniform vec3 uSD[NS]; uniform float uSC[NS];
      uniform vec3 uLamp; uniform vec3 uLampDir;
      uniform float uRoofEnabled, uRoofShift, uRoofRadius, uRoofZ, uRoofY;
      varying float vA; varying float vEnd;
      void main(){
        vec3 s = position;
        float sp = 26.0 + s.z * 10.0;
        vec3 c = cameraPosition;
        vec3 p;
        p.x = c.x + (fract(s.x - c.x / uArea) - 0.5) * uArea;
        p.z = c.z + (fract(s.z * 7.13 - c.z / uArea) - 0.5) * uArea;
        p.y = c.y + (fract(s.y - uTime * sp / uH - c.y / uH) - 0.5) * uH;
        vec3 wind = vec3(0.12, 0.0, 0.05);
        float len = 0.55 + s.z * 0.5;
        if (aEnd > 0.5) p += (vec3(0.0, 1.0, 0.0) - wind) * len;
        float lit = 0.06;
        for (int i = 0; i < NS; i++) {
          vec3 d = p - uSP[i]; float L = length(d);
          float cs = dot(d / L, uSD[i]);
          lit += smoothstep(uSC[i], uSC[i] + 0.04, cs) * 2.2 * exp(-L * 0.012);
        }
        vec3 dl = p - uLamp; float Ll = length(dl);
        lit += smoothstep(0.88, 0.95, dot(dl / Ll, uLampDir)) * 2.5 * exp(-Ll * 0.03) + exp(-Ll * 0.25) * 2.0;
        float dc = length(p - c);
        float fade = smoothstep(0.6, 3.0, dc) * (1.0 - smoothstep(uArea * 0.32, uArea * 0.5, dc));
        vA = lit * fade * step(0.0, p.y) * (aEnd > 0.5 ? 0.12 : 1.0);
        if (uRoofEnabled > 0.5 && p.y < uRoofY) {
          // Trace the slanted rain back to the opening; both moving door leaves occlude it.
          vec2 hit = p.xz - vec2(0.12, 0.05) * (uRoofY - p.y) - vec2(0.0, uRoofZ);
          float inOpening = 1.0 - step(uRoofRadius - 1.1, length(hit));
          float behindLeaf = step(uRoofShift, abs(hit.x)) *
            (1.0 - step(uRoofRadius, length(vec2(abs(hit.x) - uRoofShift, hit.y))));
          vA *= inOpening * (1.0 - behindLeaf);
        }
        vEnd = aEnd;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying float vA; varying float vEnd;
      void main(){ gl_FragColor = vec4(vec3(0.62, 0.72, 0.9) * vA * 0.55 * uOpacity, 1.0); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false; lines.renderOrder = 5;
  scene.add(lines);
  return { lines, mat };
}

// ---------------- VOLUMETRIC BEAMS ----------------
export function createBeam(scene, from, to, angle, color, strength = 1) {
  const dir = to.clone().sub(from); const L = Math.min(dir.length() * 1.6, 160); dir.normalize();
  const R = Math.tan(angle) * L;
  const geo = new THREE.CylinderGeometry(0.6, R, L, 48, 24, true);
  geo.translate(0, -L / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: color.clone().multiplyScalar(strength) }, uTime: G.uTime, uL: { value: L }, uOn: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      uniform float uL;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = -position.y / uL;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uOn; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9,78.2,37.7))) * 43758.5); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
      void main(){
        float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);
        float yy = clamp(vY, 0.0, 1.0); float along = pow(1.0 - yy, 2.2) * smoothstep(0.0, 0.03, yy);
        float dust = 0.65 + 0.7 * n3(vW * 0.12 + vec3(0.0, -uTime * 0.6, uTime * 0.2));
        gl_FragColor = vec4(uColor * edge * along * dust * 0.06 * uOn, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new V3(0, -1, 0), dir);
  m.renderOrder = 4; m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---------------- PARTICLES: sparks + steam ----------------
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export class Particles {
  constructor(scene, n, { additive = true, color = 0xffa040, size = 0.3, gravity = -9.8, drag = 0.5, tex = null } = {}) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.sz = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sz, 1));
    this.g = g; this.gravity = gravity; this.drag = drag;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTex: { value: tex || softTex() }, uScale: { value: 600 }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: /* glsl */`
        attribute float aLife; attribute float aSize; varying float vL; uniform float uScale; uniform float uAdd;
        void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float grow = uAdd > 0.5 ? 1.0 : (1.0 + (1.0 - aLife) * 3.0);
          gl_PointSize = aSize * grow * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform sampler2D uTex; uniform float uAdd; varying float vL;
        void main(){ if (vL <= 0.0) discard; vec4 t = texture2D(uTex, gl_PointCoord);
          if (uAdd > 0.5) gl_FragColor = vec4(uColor * t.a * vL * 3.0, 1.0);
          else gl_FragColor = vec4(uColor, t.a * vL * 0.22); }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
  }
  emit(p, dir, count, speed = 12, spread = 0.6, life = 1.2, size = 0.3) {
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const v = new V3(dir.x + (Math.random() - 0.5) * spread * 2, dir.y + (Math.random() - 0.5) * spread * 2, dir.z + (Math.random() - 0.5) * spread * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
      this.max[i] = life * (0.5 + Math.random() * 0.8); this.life[i] = this.max[i];
      this.sz[i] = size * (0.5 + Math.random());
    }
  }
  update(dt) {
    const L = this.g.attributes.aLife.array;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { L[i] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.gravity * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05 && this.gravity < 0) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      L[i] = Math.max(0, this.life[i] / this.max[i]);
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.aLife.needsUpdate = true; this.g.attributes.aSize.needsUpdate = true;
  }
}

// ---------------- MIRROR (wet puddles) ----------------
export class WetFloor {
  constructor(renderer, scene, mask, size = 700, opts = {}) {
    this.resolutionScale = opts.resolutionScale ?? 0.5;
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.rt.texture.generateMipmaps = false;
    this.tm = new THREE.Matrix4(); this.vc = new THREE.PerspectiveCamera();
    const geo = new THREE.PlaneGeometry(size, size); geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      defines: opts.sparse ? { WET_SPARSE: 1 } : {},
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        tRef: { value: this.rt.texture }, tMask: { value: mask }, textureMatrix: { value: this.tm }, uTime: { value: 0 }, uStrength: { value: 1 },
        uMaskScale: { value: opts.sparse ? 1 / size : 0.0857 }, uMaskOffset: { value: opts.sparse ? 0.5 : 0 },
        uDryReflection: { value: opts.sparse ? 0 : 0.10 }, uWetReflection: { value: opts.sparse ? 0.48 : 0.85 },
        uRippleStrength: { value: opts.sparse ? 0.002 : 0.012 },
      }]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = textureMatrix * vec4(position, 1.0);
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform sampler2D tRef; uniform sampler2D tMask; uniform float uTime; uniform float uStrength;
        uniform float uMaskScale, uMaskOffset, uDryReflection, uWetReflection, uRippleStrength;
        varying vec4 vUv; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        vec2 ripples(vec2 p){
          vec2 acc = vec2(0.0);
          for (int k = 0; k < 2; k++) {
            vec2 q = p * (k == 0 ? 0.9 : 1.7) + float(k) * 3.7;
            vec2 i = floor(q), f = fract(q);
            float h = hash(i + float(k));
            float t = fract(uTime * (0.7 + h * 0.6) + h);
            vec2 c = vec2(hash(i + 1.3), hash(i + 2.7));
            vec2 d = f - c; float r = length(d);
            float wave = sin((r - t * 0.6) * 60.0) * smoothstep(0.0, 0.05, t * 0.6 - r + 0.05) * smoothstep(t * 0.6 + 0.0, t * 0.6 - 0.15, r) * (1.0 - t);
            acc += normalize(d + 1e-4) * wave;
          }
          return acc;
        }
        void main(){
          vec2 mm = texture2D(tMask, vW.xz * uMaskScale + uMaskOffset).rg;
          float wet = mm.r;
          #ifdef WET_SPARSE
            if (wet < 0.015) discard;   // dry floor: the plane contributes no colour, skip the reflection fetch
          #endif
          vec2 rp = vec2(0.0);
          #ifndef WET_SPARSE
            rp = ripples(vW.xz * 0.9) * uRippleStrength;
          #endif
          vec4 uv = vUv; uv.xy += (rp + (mm.g - 0.5) * 0.004) * uv.w;
          vec3 c = texture2DProj(tRef, uv).rgb;
          float d = length(vW - cameraPosition);
          float a = mix(uDryReflection, uWetReflection, wet) * uStrength;
          gl_FragColor = vec4(c * mix(0.55, 1.0, wet), a);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.015; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.plane = new THREE.Plane(); this.normal = new V3(); this.rp = new V3(); this.cp = new V3(); this.rot = new THREE.Matrix4();
    this.look = new V3(); this.target = new V3(); this.view = new V3(); this.clip = new THREE.Vector4(); this.q = new THREE.Vector4();
  }
  setSize(w, h) { this.rt.setSize(Math.max(1, Math.floor(w * this.resolutionScale)), Math.max(1, Math.floor(h * this.resolutionScale))); }
  render(renderer, scene, camera, hide = []) {
    const { mesh, normal, rp, cp, rot, look, target, view, vc, clip, q, tm, plane } = this;
    mesh.updateMatrixWorld();
    rp.setFromMatrixPosition(mesh.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(mesh.matrixWorld); normal.set(0, 1, 0).applyMatrix4(rot);
    view.subVectors(rp, cp); if (view.dot(normal) > 0) return;
    view.reflect(normal).negate(); view.add(rp);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot); look.add(cp);
    target.subVectors(rp, look); target.reflect(normal).negate(); target.add(rp);
    vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); vc.lookAt(target);
    vc.far = camera.far; vc.near = camera.near; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix); tm.multiply(vc.matrixWorldInverse); tm.multiply(mesh.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, rp); plane.applyMatrix4(vc.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0; pm.elements[14] = clip.w;
    mesh.visible = false; const vis = hide.map(o => o.visible); hide.forEach(o => o.visible = false);
    const cur = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, vc);
    renderer.setRenderTarget(cur); renderer.shadowMap.autoUpdate = sh;
    mesh.visible = true; hide.forEach((o, i) => o.visible = vis[i]);
  }
}
