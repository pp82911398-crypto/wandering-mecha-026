// Procedural PBR materials: tri-planar grime, chipped paint, rain streaks,
// plus global uniforms for X-ray scan and cross-section.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uScanY: { value: 1000 },
  uScanOn: { value: 0 },
  uSection: { value: 0 },
};
export const TEX = {};

export function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function fbm(size, freqs, seed, gain = 0.55) {
  const r = rng(seed), out = new Float32Array(size * size);
  let amp = 1, sum = 0;
  for (const n of freqs) {
    const lat = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = y / size * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % n;
      for (let x = 0; x < size; x++) {
        const fx = x / size * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % n;
        const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    sum += amp; amp *= gain;
  }
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < out.length; i++) { out[i] /= sum; mn = Math.min(mn, out[i]); mx = Math.max(mx, out[i]); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}

function scratchLayer(size, count, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const r = rng(seed);
  x.fillStyle = '#000'; x.fillRect(0, 0, size, size);
  x.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const px = r() * size, py = r() * size, a = r() * Math.PI * 2, L = 4 + r() * 40;
    x.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.7})`; x.lineWidth = 0.5 + r() * 1.4;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      x.beginPath(); x.moveTo(px + ox, py + oy);
      x.quadraticCurveTo(px + ox + Math.cos(a + 0.3) * L * 0.5, py + oy + Math.sin(a + 0.3) * L * 0.5, px + ox + Math.cos(a) * L, py + oy + Math.sin(a) * L);
      x.stroke();
    }
  }
  return x.getImageData(0, 0, size, size).data;
}

function makeGrunge() {
  const S = 512;
  const R = fbm(S, [4, 8, 16, 32, 64, 128], 11);
  const Gm = fbm(S, [8, 16, 32, 64, 128], 23, 0.6);
  const B = fbm(S, [16, 32, 64, 128, 256], 37, 0.7);
  const sc = scratchLayer(S, 520, 5);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = R[i] * 255;
    data[i * 4 + 1] = Math.min(1, Gm[i] * 0.75 + sc[i * 4] / 255 * 0.5) * 255;
    data[i * 4 + 2] = B[i] * 255;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

const FRAG_PARS = /* glsl */`
uniform sampler2D uGrunge;
uniform float uTriScale, uDirt, uChip, uStreak, uArmor, uScanY, uScanOn, uSection, uTime;
varying vec3 vOP; varying vec3 vON; varying vec3 vWP;
vec3 triTex(vec3 p, vec3 n){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return texture2D(uGrunge, p.zy).rgb * w.x + texture2D(uGrunge, p.xz).rgb * w.y + texture2D(uGrunge, p.xy).rgb * w.z;
}
`;
const FRAG_COLOR = /* glsl */`
float scanBand = 0.0;
if (uScanOn > 0.5 && uArmor > 0.5) {
  if (vWP.y > uScanY) discard;
  scanBand = 1.0 - smoothstep(0.0, 1.6, uScanY - vWP.y);
}
vec3 onrm = normalize(vON);
vec3 gr = triTex(vOP * uTriScale, onrm);
vec3 gr2 = triTex(vOP * uTriScale * 3.7 + 0.37, onrm);
float vertF = 1.0 - abs(onrm.y);
float stk = texture2D(uGrunge, vec2((vOP.x + vOP.z) * 0.21, vOP.y * 0.017)).b;
float wet = smoothstep(0.52, 0.8, stk) * vertF * uStreak;
float chip = smoothstep(0.64, 0.8, gr2.g * (0.5 + 0.75 * gr.r)) * uChip;
float dirt = mix(1.0, 0.45 + 0.7 * gr.r, uDirt);
diffuseColor.rgb *= dirt * (1.0 - wet * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.25, 0.24), chip);
`;

export function enhance(mat, cfg = {}) {
  const u = {
    uGrunge: { value: TEX.grunge },
    uTriScale: { value: cfg.scale ?? 0.15 },
    uDirt: { value: cfg.dirt ?? 0.4 },
    uChip: { value: cfg.chip ?? 0 },
    uStreak: { value: cfg.streak ?? 0.4 },
    uArmor: { value: cfg.armor ?? 0 },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, G);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON; varying vec3 vWP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position; vON = normal;
        #ifdef USE_INSTANCING
          vOP = (instanceMatrix * vec4(position, 1.0)).xyz; vON = mat3(instanceMatrix) * normal;
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp4 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp4 = instanceMatrix * wp4;
          #endif
          vWP = (modelMatrix * wp4).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.72 + 0.56 * gr.b) - wet * 0.24 + chip * 0.1, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.92, chip);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.25, 0.85, 1.0) * scanBand * 5.0;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uSection > 0.5 && !gl_FrontFacing) {
          float hh = step(0.5, fract((vWP.x + vWP.y + vWP.z) * 0.9));
          gl_FragColor = vec4(mix(vec3(1.0, 0.36, 0.05) * 1.4, vec3(0.22, 0.06, 0.02), hh), 1.0);
        }`);
  };
  mat.customProgramCacheKey = () => 'enh-v1';
  return mat;
}

export function emissive(color, intensity, base = 0x000000) {
  const m = new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
  m.userData.baseI = intensity;
  return m;
}

// ---------- canvas textures ----------
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export function weather(x, w, h, amount = 0.35, seed = 3) {
  const r = rng(seed);
  x.save(); x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400 * amount; i++) {
    x.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    const s = r() * r() * 7 + 0.5;
    x.beginPath(); x.arc(r() * w, r() * h, s, 0, Math.PI * 2); x.fill();
  }
  for (let i = 0; i < 60 * amount; i++) {
    x.strokeStyle = `rgba(0,0,0,${0.4 + r() * 0.5})`; x.lineWidth = 1 + r() * 2;
    const px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 60, py + (r() - 0.5) * 12); x.stroke();
  }
  x.restore();
}
export const FONT_CN = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
export const FONT_EN = '"Rajdhani","Arial Narrow",sans-serif';

export function textTex(lines, w = 1024, h = 256, opts = {}) {
  return canvasTex(w, h, (x) => {
    x.clearRect(0, 0, w, h);
    for (const L of lines) {
      x.save();
      x.fillStyle = L.color || '#e8e2d6';
      x.font = `${L.weight || 700} ${L.size}px ${L.font || FONT_CN}`;
      x.textAlign = L.align || 'center'; x.textBaseline = 'middle';
      if (L.spacing) x.letterSpacing = L.spacing + 'px';
      if (L.vertical) {
        const chars = [...L.t];
        chars.forEach((ch, i) => x.fillText(ch, L.x ?? w / 2, (L.y ?? 0) + i * L.size * 1.05));
      } else x.fillText(L.t, L.x ?? w / 2, L.y ?? h / 2);
      x.restore();
    }
    if (opts.rects) for (const R of opts.rects) { x.fillStyle = R.c; x.fillRect(R.x, R.y, R.w, R.h); }
    weather(x, w, h, opts.wear ?? 0.4, opts.seed ?? 7);
  });
}
export function hazardTex(w = 512, h = 128, a = '#d9a400', b = '#141414') {
  return canvasTex(w, h, (x) => {
    x.fillStyle = b; x.fillRect(0, 0, w, h);
    x.fillStyle = a;
    const s = h * 0.9;
    for (let i = -h; i < w + h; i += s * 2) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + s, h); x.lineTo(i + s + h, 0); x.lineTo(i + h, 0); x.closePath(); x.fill(); }
    weather(x, w, h, 0.5, 9);
  });
}

// ---------- palettes ----------
export function createMaterials() {
  TEX.grunge = makeGrunge();
  const mk = (p, cfg) => enhance(new THREE.MeshPhysicalMaterial(p), cfg);
  const set = (armor) => ({
    red: mk({ color: 0x5e0b13, metalness: 0.42, roughness: 0.36, clearcoat: 0.85, clearcoatRoughness: 0.16, sheen: 0.0 },
      { armor, dirt: 0.5, chip: 0.55, streak: 0.7, scale: 0.11 }),
    redDark: mk({ color: 0x330810, metalness: 0.5, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 },
      { armor, dirt: 0.5, chip: 0.4, streak: 0.6, scale: 0.13 }),
    gun: mk({ color: 0x2a2d32, metalness: 0.82, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 },
      { armor, dirt: 0.55, chip: 0.25, streak: 0.55, scale: 0.17 }),
    dark: mk({ color: 0x141518, metalness: 0.75, roughness: 0.5 }, { armor, dirt: 0.45, streak: 0.4, scale: 0.2 }),
    steel: mk({ color: 0x6f737a, metalness: 1.0, roughness: 0.3 }, { armor, dirt: 0.45, streak: 0.3, scale: 0.25 }),
    chrome: mk({ color: 0xd4d8de, metalness: 1.0, roughness: 0.07 }, { armor, dirt: 0.12, streak: 0.25, scale: 0.3 }),
    yellow: mk({ color: 0xb8860f, metalness: 0.3, roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.3 },
      { armor, dirt: 0.5, chip: 0.6, streak: 0.5, scale: 0.2 }),
    rubber: mk({ color: 0x0b0b0c, metalness: 0.0, roughness: 0.7 }, { armor, dirt: 0.3, streak: 0.5, scale: 0.3 }),
    brass: mk({ color: 0x8c6a32, metalness: 1.0, roughness: 0.32 }, { armor, dirt: 0.5, streak: 0.3, scale: 0.25 }),
    white: mk({ color: 0xb9b6ae, metalness: 0.2, roughness: 0.45, clearcoat: 0.5 }, { armor, dirt: 0.6, chip: 0.4, streak: 0.6, scale: 0.15 }),
  });
  const A = set(1), I = set(0);
  const E = {
    amber: emissive(0xff9b2e, 7),
    amberHot: emissive(0xffc46a, 16),
    amberSoft: emissive(0xff8a1c, 3),
    core: emissive(0xffb04a, 22),
    cyan: emissive(0x5fe0ff, 9),
    cyanSoft: emissive(0x48c8ff, 3),
    red: emissive(0xff2a1a, 10),
    yellow: emissive(0xffd34a, 9),
    white: emissive(0xe8f0ff, 10),
    thruster: emissive(0x8fd8ff, 0.5),
    screenG: emissive(0x58ffb0, 2.2),
    screenC: emissive(0x5ad2ff, 2.2),
    sodium: emissive(0xffa648, 14),
    flood: emissive(0xfff1dc, 24),
  };
  return { A, I, E };
}

// Additive holographic material for X-ray scan (shows where armor was removed)
export function holoMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uScanY: G.uScanY, uTime: G.uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uScanY, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        if (vW.y < uScanY) discard;
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float lines = smoothstep(0.86, 1.0, fract(vW.y * 1.25 - uTime * 0.6));
        float band = 1.0 - smoothstep(0.0, 2.5, vW.y - uScanY);
        vec3 col = vec3(0.3, 0.8, 1.0) * (f * 0.32 + lines * 0.07 + band * 1.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// Energy conduit: scrolling pulses along tube length
export function conduitMaterial(color = 0xff9a30) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uFlow: { value: 0.3 } }]),
    fog: true,
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec2 vUv2;
      void main(){ vUv2 = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uColor; uniform float uFlow; uniform float uTime; varying vec2 vUv2;
      void main(){ float p = fract(vUv2.x * 5.0 - uTime * 0.9);
        float pulse = smoothstep(0.0, 0.12, p) * smoothstep(0.45, 0.12, p);
        vec3 c = uColor * (0.18 + pulse * uFlow * 4.0);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = G.uTime;
  return m;
}
