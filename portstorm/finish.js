// Finishing kit for the port / hangar: procedural PBR maps, box UVs, decals, lamp glow,
// volumetric shafts and dust. Everything here is shared so the hangar and the dressing pass
// use the same material language as the 026 finishing room (paint / wear / relief).
import * as THREE from 'three';
import { canvasTex, fbm, rng, FONT_EN } from '../src/materials.js';

// ---------- UVs ----------
// Planar box projection in object space: a texture tile is `1/scale` world units.
// Used before Batch.add so merged geometry keeps a sane texel density.
export function boxUV(geo, scale = 0.05) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
export const uv = boxUV;

// ---------- canvas helpers ----------
function grayTexture(S, values, opts = {}) {
  return canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, values[i] * 255));
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true, data: true, ...opts });
}

// ---------- concrete ----------
let _conc = null;
export function concreteTextures(seed = 12) {
  if (_conc) return _conc;
  const S = 1024;
  const big = fbm(S, [6, 12, 24, 48], seed);
  const mid = fbm(S, [3, 6, 12], seed + 5);
  const fine = fbm(S, [96, 192], seed + 9);
  const base = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) base[i] = 0.50 + big[i] * 0.27 - mid[i] * 0.11 + (fine[i] - 0.5) * 0.055;

  const map = canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = base[i];
      img.data[i * 4] = v * 252; img.data[i * 4 + 1] = v * 250; img.data[i * 4 + 2] = v * 243; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true });

  const c = map.image.getContext('2d');
  const r = rng(seed + 99);
  // damp patches / discolouration
  for (let i = 0; i < 90; i++) {
    const px = r() * S, py = r() * S, rr = 8 + r() * 70;
    c.fillStyle = `rgba(${r() < 0.55 ? '56,55,49' : '210,208,196'},${0.012 + r() * 0.045})`;
    c.beginPath(); c.ellipse(px, py, rr, rr * (0.35 + r() * 0.8), r() * Math.PI, 0, Math.PI * 2); c.fill();
  }
  // rain streaks from the top edge
  for (let i = 0; i < 34; i++) {
    const x0 = r() * S, w = 1 + r() * 13, y0 = r() * S * 0.25, len = S * (0.18 + r() * 0.55);
    const g = c.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(44,42,36,0.16)'); g.addColorStop(0.45, 'rgba(44,42,36,0.06)'); g.addColorStop(1, 'rgba(44,42,36,0)');
    c.fillStyle = g; c.fillRect(x0, y0, w, len);
  }
  // formwork seams + cast-in tie holes (one 22-unit tile)
  c.strokeStyle = 'rgba(40,39,34,0.30)'; c.lineWidth = 2.2;
  for (const y of [0, S / 2]) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  for (let ix = 0; ix < 8; ix++) for (let iy = 0; iy < 8; iy++) {
    const px = (ix + 0.5) * S / 8, py = (iy + 0.5) * S / 8;
    c.fillStyle = 'rgba(38,37,32,0.42)'; c.beginPath(); c.arc(px, py, 4.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(200,198,188,0.20)'; c.beginPath(); c.arc(px - 1.2, py - 1.2, 2.0, 0, Math.PI * 2); c.fill();
  }
  // hairline cracks
  c.strokeStyle = 'rgba(34,33,29,0.36)'; c.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) {
    let px = r() * S, py = r() * S;
    c.beginPath(); c.moveTo(px, py);
    for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 54; py += (r() - 0.45) * 64; c.lineTo(px, py); }
    c.stroke();
  }
  // rust bleed from embedded steel
  for (let i = 0; i < 12; i++) {
    const px = r() * S, py = r() * S * 0.7, len = 40 + r() * 190;
    const g = c.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, 'rgba(122,72,38,0.20)'); g.addColorStop(1, 'rgba(122,72,38,0)');
    c.fillStyle = g; c.fillRect(px, py, 2 + r() * 5, len);
  }

  const bumpValues = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) bumpValues[i] = 0.38 + base[i] * 0.42 + (fine[i] - 0.5) * 0.16;
  const bump = grayTexture(S, bumpValues);
  const b = bump.image.getContext('2d');
  b.strokeStyle = 'rgba(20,20,20,0.85)'; b.lineWidth = 2.5;
  for (const y of [0, S / 2]) { b.beginPath(); b.moveTo(0, y); b.lineTo(S, y); b.stroke(); }
  b.fillStyle = 'rgba(15,15,15,0.85)';
  for (let ix = 0; ix < 8; ix++) for (let iy = 0; iy < 8; iy++) { b.beginPath(); b.arc((ix + 0.5) * S / 8, (iy + 0.5) * S / 8, 4.2, 0, Math.PI * 2); b.fill(); }

  const roughValues = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) roughValues[i] = 0.72 + big[i] * 0.17 + (fine[i] - 0.5) * 0.10;
  const rough = grayTexture(S, roughValues);

  _conc = { map, bump, rough };
  return _conc;
}

// ---------- painted / galvanised steel ----------
let _steel = null;
export function steelTextures(seed = 21) {
  if (_steel) return _steel;
  const S = 512;
  const n1 = fbm(S, [16, 32, 64], seed);
  const n2 = fbm(S, [4, 8, 16], seed + 3);
  const base = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) base[i] = 0.40 + n1[i] * 0.16 - n2[i] * 0.06;

  const map = canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = base[i];
      img.data[i * 4] = v * 238; img.data[i * 4 + 1] = v * 250; img.data[i * 4 + 2] = v * 255; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true });

  const c = map.image.getContext('2d');
  const r = rng(seed + 17);
  // horizontal brushing
  for (let i = 0; i < 380; i++) {
    const y = r() * S;
    c.fillStyle = `rgba(${r() < 0.5 ? '20,24,26' : '210,218,222'},${0.02 + r() * 0.05})`;
    c.fillRect(0, y, S, 0.5 + r() * 1.4);
  }
  // scratches
  for (let i = 0; i < 90; i++) {
    const x0 = r() * S, y0 = r() * S, a = (r() - 0.5) * 0.9, L = 4 + r() * 52;
    c.strokeStyle = `rgba(210,216,218,${0.05 + r() * 0.14})`; c.lineWidth = 0.6 + r() * 1.2;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); c.stroke();
  }
  // rust blooms and drips
  for (let i = 0; i < 26; i++) {
    const px = r() * S, py = r() * S, rr = 3 + r() * 17;
    c.fillStyle = `rgba(${118 + r() * 40},${62 + r() * 26},${30 + r() * 14},${0.10 + r() * 0.22})`;
    c.beginPath(); c.ellipse(px, py, rr, rr * (0.35 + r() * 0.7), r() * Math.PI, 0, Math.PI * 2); c.fill();
    const len = 10 + r() * 90, g = c.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, 'rgba(112,58,26,0.20)'); g.addColorStop(1, 'rgba(112,58,26,0)');
    c.fillStyle = g; c.fillRect(px, py, 1 + r() * 3, len);
  }
  // grime along the bottom edge of the tile
  const g2 = c.createLinearGradient(0, S * 0.72, 0, S);
  g2.addColorStop(0, 'rgba(24,26,24,0)'); g2.addColorStop(1, 'rgba(24,26,24,0.16)');
  c.fillStyle = g2; c.fillRect(0, S * 0.72, S, S * 0.28);

  const bumpValues = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) bumpValues[i] = 0.42 + base[i] * 0.22 + (n1[i] - 0.5) * 0.18;
  const bump = grayTexture(S, bumpValues);
  const roughValues = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) roughValues[i] = 0.42 + n1[i] * 0.22 + (n2[i] - 0.5) * 0.12;
  const rough = grayTexture(S, roughValues);
  _steel = { map, bump, rough };
  return _steel;
}

// ---------- tread / diamond plate / grating ----------
let _diamond = null;
export function diamondTextures() {
  if (_diamond) return _diamond;
  const S = 256;
  const draw = (x, dark) => {
    x.fillStyle = dark ? '#5c5c5c' : '#6f7679'; x.fillRect(0, 0, S, S);
    for (let y = -8; y < S + 8; y += 32) for (let xx = -8; xx < S + 8; xx += 32) {
      for (const [ox, oy, rot] of [[8, 8, -0.6], [24, 24, -0.6], [24, 8, 0.6], [8, 24, 0.6]]) {
        x.save(); x.translate(xx + ox, y + oy); x.rotate(rot);
        x.fillStyle = dark ? '#2a2a2a' : '#9aa1a3'; x.fillRect(-9, -2.6, 18, 5.2);
        x.fillStyle = dark ? '#8a8a8a' : '#4b5052'; x.fillRect(-9, 2.6, 18, 1.6);
        x.restore();
      }
    }
  };
  const map = canvasTex(S, S, (x) => draw(x, false), { repeat: true });
  const bump = canvasTex(S, S, (x) => draw(x, true), { repeat: true, data: true });
  _diamond = { map, bump };
  return _diamond;
}

let _grate = null;
export function gratingTextures() {
  if (_grate) return _grate;
  const S = 256;
  const draw = (x, dark) => {
    x.fillStyle = dark ? '#3a3a3a' : '#4b5052'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      x.fillStyle = dark ? '#0c0c0c' : '#111416'; x.fillRect(0, y + 7, S, 18);
      x.fillStyle = dark ? '#8a8a8a' : '#7e8689'; x.fillRect(0, y, S, 4);
      for (let xx = 0; xx < S; xx += 32) { x.fillStyle = dark ? '#7a7a7a' : '#687073'; x.fillRect(xx, y, 5, 32); }
    }
  };
  const map = canvasTex(S, S, (x) => draw(x, false), { repeat: true });
  const bump = canvasTex(S, S, (x) => draw(x, true), { repeat: true, data: true });
  _grate = { map, bump };
  return _grate;
}

// ---------- hazard stripes ----------
let _hazard = null;
export function hazardTexture() {
  if (_hazard) return _hazard;
  const W = 512, H = 128;
  _hazard = canvasTex(W, H, (c) => {
    c.fillStyle = '#171715'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#c9961c';
    for (let i = -H; i < W + H; i += 56) {
      c.beginPath(); c.moveTo(i, H); c.lineTo(i + 28, H); c.lineTo(i + 28 + H, 0); c.lineTo(i + H, 0); c.closePath(); c.fill();
    }
    const r = rng(7);
    c.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 220; i++) {
      c.fillStyle = `rgba(${40 + r() * 40},${38 + r() * 36},${30 + r() * 30},${0.05 + r() * 0.18})`;
      c.beginPath(); c.arc(r() * W, r() * H, 1 + r() * 9, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(216,210,190,0.11)';
    for (let i = 0; i < 20; i++) c.fillRect(r() * W, r() * H, 2 + r() * 26, 1 + r() * 2);
  }, { repeat: true });
  return _hazard;
}

// ---------- signs / stencils ----------
export function signBoard(main, sub = '', opts = {}) {
  const W = 1024, H = 384;
  return canvasTex(W, H, (c) => {
    c.fillStyle = opts.bg || '#202629'; c.fillRect(0, 0, W, H);
    c.strokeStyle = opts.edge || 'rgba(214,166,35,0.85)'; c.lineWidth = 10; c.strokeRect(12, 12, W - 24, H - 24);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.strokeRect(30, 30, W - 60, H - 60);
    c.fillStyle = opts.color || '#ddd8c8';
    c.font = `700 ${opts.size || 128}px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(main, W / 2, sub ? H / 2 - 36 : H / 2 + 4);
    if (sub) {
      c.fillStyle = opts.subColor || 'rgba(214,166,35,0.9)';
      c.font = `500 ${opts.subSize || 54}px ${FONT_EN}`;
      c.fillText(sub, W / 2, H / 2 + 78);
    }
    const r = rng(19);
    c.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 130; i++) {
      c.fillStyle = `rgba(${60 + r() * 40},${58 + r() * 36},${48 + r() * 30},${0.04 + r() * 0.12})`;
      c.beginPath(); c.arc(r() * W, r() * H, 1 + r() * 7, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  });
}

// transparent stencil / painted marking
export function stencilTexture(text, opts = {}) {
  const W = opts.w || 1024, H = opts.h || 256;
  return canvasTex(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = opts.color || 'rgba(226,222,208,0.88)';
    c.font = `${opts.weight || 700} ${opts.size || 150}px ${opts.font || FONT_EN}`;
    c.textAlign = opts.align || 'center'; c.textBaseline = 'middle';
    c.fillText(text, opts.align === 'left' ? 16 : W / 2, H / 2 + 4);
    if (opts.arrow) {
      c.beginPath(); c.moveTo(W - 140, H / 2); c.lineTo(W - 40, H / 2);
      c.lineTo(W - 80, H / 2 - 46); c.closePath(); c.fill();
    }
  });
}

export function decalMesh(tex, w, h, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.82, metalness: 0.05,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5,
    opacity: opts.opacity ?? 1, side: opts.side || THREE.FrontSide,
    color: opts.color || 0xffffff,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = opts.order || 1;
  return mesh;
}

// ---------- glow ----------
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const S = 128;
  _glow = canvasTex(S, S, (c) => {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,248,232,0.85)');
    g.addColorStop(0.45, 'rgba(255,226,180,0.26)');
    g.addColorStop(1, 'rgba(255,220,170,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  });
  return _glow;
}
export function glowSprite(color = 0xffd9a0, size = 8, opacity = 0.65) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false,
  }));
  sp.scale.set(size, size, 1);
  return sp;
}

// ---------- light shaft ----------
export function lightShaft(w, h, len, color = 0xffe2b0, opacity = 0.055) {
  const geo = new THREE.BoxGeometry(w, h, len);
  // keep only the 4 long sides (no caps): they would double the additive energy
  const g2 = geo.index ? geo.toNonIndexed() : geo;
  const pos = g2.attributes.position;
  const keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    // drop the first and last triangles (caps) by testing the local z of all 3 verts
    const z0 = pos.getZ(i), z1 = pos.getZ(i + 1), z2 = pos.getZ(i + 2);
    if (!(Math.abs(z0 - len / 2) < 1e-4 || Math.abs(z0 + len / 2) < 1e-4 || Math.abs(z1 - len / 2) < 1e-4 || Math.abs(z1 + len / 2) < 1e-4 || Math.abs(z2 - len / 2) < 1e-4 || Math.abs(z2 + len / 2) < 1e-4)) {
      for (let k = 0; k < 3; k++) keep.push(i + k);
    }
  }
  const arr = new Float32Array(keep.length * 3);
  for (let i = 0; i < keep.length; i++) {
    const s = keep[i] * 3;
    arr[i * 3] = pos.array[s]; arr[i * 3 + 1] = pos.array[s + 1]; arr[i * 3 + 2] = pos.array[s + 2];
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  bg.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uHalf: { value: new THREE.Vector3(w / 2, h / 2, len / 2) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vP; uniform vec3 uColor; uniform float uOpacity; uniform vec3 uHalf;
      void main(){
        vec3 n = abs(vP) / uHalf;
        float side = smoothstep(1.0, 0.25, n.x) * smoothstep(1.0, 0.1, n.y);
        float along = smoothstep(1.0, -0.2, n.z);
        float a = uOpacity * side * along;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(bg, mat);
  m.frustumCulled = false;
  return m;
}

// ---------- dust ----------
export function makeDust(count = 700, box = { x0: -32, x1: 40, y0: 1, y1: 52, z0: -302, z1: -148 }) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const r = rng(5);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.x0 + r() * (box.x1 - box.x0);
    pos[i * 3 + 1] = box.y0 + r() * (box.y1 - box.y0);
    pos[i * 3 + 2] = box.z0 + r() * (box.z1 - box.z0);
    seed[i] = r() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color: 0xffe6c4, size: 0.42, sizeAttenuation: true,
    transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    alphaTest: 0.02, toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData = { seed, base: pos.slice(), phase: 0 };
  return points;
}
export function updateDust(points, time, k = 1) {
  const p = points.geometry.attributes.position.array, base = points.userData.base, seed = points.userData.seed;
  for (let i = 0; i < seed.length; i++) {
    p[i * 3] = base[i * 3] + Math.sin(time * 0.17 + seed[i]) * 1.4;
    p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.23 + seed[i] * 1.7) * 1.1 + ((time * 0.35 + seed[i]) % 6);
    p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.13 + seed[i] * 0.8) * 1.2;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.material.opacity = 0.18 + 0.42 * k;
}

// ---------- oil / water stain decal ----------
let _stain = null;
export function stainTexture(seed = 31) {
  if (_stain) return _stain;
  const S = 256;
  _stain = canvasTex(S, S, (c) => {
    c.clearRect(0, 0, S, S);
    const r = rng(seed);
    for (let i = 0; i < 26; i++) {
      const px = S * (0.3 + r() * 0.4), py = S * (0.3 + r() * 0.4), rr = 8 + r() * 40;
      const g = c.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, `rgba(20,22,20,${0.16 + r() * 0.16})`);
      g.addColorStop(0.65, `rgba(20,22,20,${0.05 + r() * 0.06})`);
      g.addColorStop(1, 'rgba(20,22,20,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(px, py, rr, rr * (0.45 + r() * 0.7), r() * Math.PI, 0, Math.PI * 2); c.fill();
    }
  });
  return _stain;
}

// ---------- shared palette ----------
// Same language as the 026 finishing room: painted steel, worn concrete, galvanised grating,
// amber work lights, a few saturated accents (safety yellow / red / olive).
export function makePalette() {
  const C = concreteTextures();
  const S = steelTextures();
  const D = diamondTextures();
  const G = gratingTextures();
  const H = hazardTexture();
  const std = (p) => new THREE.MeshStandardMaterial(p);

  const conc = (color, extra = {}) => std({
    color, map: C.map, bumpMap: C.bump, bumpScale: 0.55,
    roughnessMap: C.rough, roughness: 1, metalness: 0.02, ...extra,
  });
  const steel = (color, metalness = 0.55, extra = {}) => std({
    color, map: S.map, bumpMap: S.bump, bumpScale: 0.3,
    roughnessMap: S.rough, roughness: 1, metalness, ...extra,
  });

  return {
    // concrete
    concrete: conc(0xf2f0e8),
    concreteD: conc(0xc2c3bc),
    concreteMid: conc(0xd8d8d0),
    gateConc: conc(0xdcdcd4),
    // steel
    steel: steel(0xdde5e7, 0.62),
    steelD: steel(0x9aa4a8, 0.7),
    steelBlack: steel(0x6f797d, 0.72),
    door: steel(0xd8e0e2, 0.62),
    doorD: steel(0xaab4b8, 0.68),
    rust: steel(0xd6a483, 0.45, { roughness: 0.9 }),
    deck: std({
      color: 0xc7ced1, map: D.map, bumpMap: D.bump, bumpScale: 0.4,
      roughness: 0.55, metalness: 0.55,
    }),
    grate: std({
      color: 0xb9c2c5, map: G.map, bumpMap: G.bump, bumpScale: 0.5,
      roughness: 0.62, metalness: 0.5,
    }),
    hazard: std({ map: H, roughness: 0.58, metalness: 0.12 }),
    // painted / plain
    dark: std({ color: 0x24282a, roughness: 0.66, metalness: 0.45 }),
    black: std({ color: 0x101213, roughness: 0.92, metalness: 0.1 }),
    rubber: std({ color: 0x151718, roughness: 0.96, metalness: 0.02 }),
    chrome: std({ color: 0xdfe3e3, roughness: 0.2, metalness: 1.0 }),
    brass: std({ color: 0xb89252, roughness: 0.32, metalness: 0.95 }),
    yellow: std({ color: 0xc99a1e, roughness: 0.52, metalness: 0.22 }),
    rail: std({ color: 0xb58a1c, roughness: 0.5, metalness: 0.35 }),
    lampOff: std({ color: 0x8b8d86, roughness: 0.45, metalness: 0.4 }),
    orange: std({ color: 0xb85a1e, roughness: 0.56, metalness: 0.2 }),
    red: std({ color: 0x8f2f23, roughness: 0.55, metalness: 0.2 }),
    redD: std({ color: 0x5f211a, roughness: 0.62, metalness: 0.2 }),
    blue: std({ color: 0x2c4c5e, roughness: 0.6, metalness: 0.25 }),
    blueLight: std({ color: 0x4a7288, roughness: 0.6, metalness: 0.25 }),
    green: std({ color: 0x3b5e42, roughness: 0.6, metalness: 0.2 }),
    olive: std({ color: 0x545a40, roughness: 0.72, metalness: 0.15 }),
    wood: std({ color: 0x7b6040, roughness: 0.9, metalness: 0.02 }),
    woodDark: std({ color: 0x54412b, roughness: 0.92 }),
    cardboard: std({ color: 0x8a6f4b, roughness: 0.95 }),
    glass: std({ color: 0x0f1d22, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.2 }),
    glassLit: std({ color: 0x2c3b40, roughness: 0.15, metalness: 0.7, emissive: 0x1a2a26, emissiveIntensity: 0.4 }),
    puddle: std({ color: 0x2b383d, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.0, transparent: true, opacity: 0.55, depthWrite: false }),
    // lights / emissive
    lampHousing: std({ color: 0x2b2f31, roughness: 0.5, metalness: 0.55 }),
    lamp: std({ color: 0x2b2c28, emissive: 0xffd6a0, emissiveIntensity: 0.03, roughness: 0.5 }),
    lampWarm: std({ color: 0xfff4de, emissive: 0xffe2b4, emissiveIntensity: 3.4, roughness: 0.35, toneMapped: true }),
    ledWhite: std({ color: 0xeaf2f4, emissive: 0xdff2ff, emissiveIntensity: 2.6, roughness: 0.3 }),
    ledAmber: std({ color: 0xffc05a, emissive: 0xff9c2a, emissiveIntensity: 3.0, roughness: 0.3 }),
    ledRed: std({ color: 0xff4a30, emissive: 0xff2412, emissiveIntensity: 3.4, roughness: 0.3 }),
    ledGreen: std({ color: 0x5aff8a, emissive: 0x1ae05a, emissiveIntensity: 2.8, roughness: 0.3 }),
    ledBlue: std({ color: 0x7ac8ff, emissive: 0x2a8aff, emissiveIntensity: 2.8, roughness: 0.3 }),
    beaconR: std({ color: 0x7a1a14, emissive: 0xff2418, emissiveIntensity: 2.4, roughness: 0.4 }),
    // crew
    suit: std({ color: 0x2a2f31, roughness: 0.85 }),
    suitD: std({ color: 0x1c2021, roughness: 0.88 }),
    vest: std({ color: 0xc0ca48, roughness: 0.6, emissive: 0x222700, emissiveIntensity: 0.55 }),
    vestO: std({ color: 0xc46428, roughness: 0.65, emissive: 0x2a1000, emissiveIntensity: 0.4 }),
    skin: std({ color: 0x8a6a52, roughness: 0.8 }),
    hatW: std({ color: 0xd8d5cb, roughness: 0.4 }),
    hatY: std({ color: 0xd3a01c, roughness: 0.45 }),
    hatO: std({ color: 0xc55a1c, roughness: 0.5 }),
  };
}
