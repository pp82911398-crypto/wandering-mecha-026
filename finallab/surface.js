// 材质升级（便宜版）：不加灯、不加后期、不加网格，只做三件事
//   1) studioEnv()：一次性烘一张更丰富的反射环境（长条柔光灯 + 地平线 + 地面），每帧零开销。
//      倒圆的边、金属件靠它扫出高光条——这是"有质感"的最大来源。
//   2) detailTexture()：启动时用画布生成一张 512² 可平铺细节图，全身共用一张：
//      R = 细颗粒/橘皮（凹凸）  G = 拉丝纹（凹凸+粗糙度）  B = 低频斑驳（粗糙度起伏）  A = 细划痕
//   3) GLSL：三平面投射（按零件自身坐标，没有 UV 也能用，零件动纹理跟着动）+ 导数凹凸 + 屏幕空间曲率找凸边做边缘磨损。
//      由 wear.js 的 patch() 注入到现有材质里——材质数量、着色器程序数量都不变。
import * as THREE from 'three';

// 每类材质的表面参数（wear.js 的 patch(mat, k) 里用 k.kind 选）
//   grain 橘皮/颗粒凹凸   brush 拉丝凹凸   rv 粗糙度起伏   scratch 划痕   edge 边缘磨损（漆掉露金属/金属抛亮）
export const KINDS = {
  paint:  { grain: 1.0, brush: 0.0, rv: 0.55, scratch: 1.0, edge: 1.0 },   // 漆面主甲
  primer: { grain: 1.8, brush: 0.0, rv: 0.8,  scratch: 0.4, edge: 0.4 },   // 凹槽底：粗底漆
  metal:  { grain: 0.25, brush: 1.0, rv: 0.6, scratch: 0.7, edge: 0.8 },   // 枪灰关节件：拉丝
  chrome: { grain: 0.0, brush: 0.35, rv: 0.25, scratch: 0.3, edge: 0.0 },  // 镀铬活塞杆：抛光
  rubber: { grain: 0.9, brush: 0.0, rv: 0.35, scratch: 0.0, edge: 0.0 },   // 黑色接缝条、软管
};
export const SURF = { on: { value: 1 }, detail: { value: null }, tile: { value: 1 / 0.8 } };   // tile: 一张图铺 0.8 单位（约 1.6 m）

// ---------- 1) reflection environment ----------
export function studioEnv(renderer, skyMat) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const box = (c, k, pos, size, look = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  box(0xf2f5f8, 2.0, [0, 40, 6], [34, 9]);                 // overhead softbox
  box(0xfff3e6, 2.2, [30, 4, 24], [4, 34]);                // key-side tall strip -> vertical streaks on rounded edges
  box(0xe6eef6, 1.5, [-32, 2, 20], [3, 28]);               // fill strip
  box(0xa9c6e0, 2.0, [-22, 6, -34], [3, 30]);              // back rim strips (cool)
  box(0xa9c6e0, 2.0, [26, 6, -32], [3, 30]);
  box(0xd8dde2, 0.6, [0, 4, 46], [40, 5]);                 // low front bounce card
  const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ color: 0x1c1f22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -18; env.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.025).texture; pm.dispose();
  env.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== skyMat) o.material.dispose(); } });
  return tex;
}

// ---------- 2) shared detail texture (tileable, generated once) ----------
export function detailTexture(N = 512, seed = 1) {
  let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const hashT = new Float32Array(4096); for (let i = 0; i < hashT.length; i++) hashT[i] = rnd();
  const H = (i, j, P) => hashT[((((i % P) + P) % P) * 73 + (((j % P) + P) % P) * 151) & 4095];
  const vnoise = (x, y, P) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (H(i, j, P) * (1 - u) + H(i + 1, j, P) * u) * (1 - v) + (H(i, j + 1, P) * (1 - u) + H(i + 1, j + 1, P) * u) * v; };
  const fbm = (x, y, P, oct) => { let a = 0.5, t = 0, n = 0; for (let o = 0; o < oct; o++) { t += a * vnoise(x * (1 << o), y * (1 << o), P << o); n += a; a *= 0.5; } return t / n; };
  const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N), A = new Float32Array(N * N);
  // brushed: one random value per row (lines along x), lightly wavy
  const rows = new Float32Array(N); for (let y = 0; y < N; y++) rows[y] = rnd();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = y * N + x;
    R[k] = fbm(u * 64, v * 64, 64, 3);                                   // fine grain / orange peel
    const yy = (y + Math.round(3 * (fbm(u * 4, v * 4, 4, 2) - 0.5) * 2) + N) % N;
    G[k] = 0.65 * rows[yy] + 0.35 * fbm(u * 128, v * 8, 128, 2);         // brushed streaks
    B[k] = fbm(u * 6, v * 6, 6, 4);                                      // low-frequency blotches
  }
  // scratches: short thin strokes, mostly in two directions, wrapped
  for (let i = 0; i < 260; i++) {
    let x = rnd() * N, y = rnd() * N; const a = (rnd() < 0.5 ? 0.6 : 2.3) + (rnd() - 0.5) * 0.5, L = 8 + rnd() * 70, w = 0.4 + rnd() * 0.6;
    for (let t = 0; t < L; t++) { x += Math.cos(a); y += Math.sin(a); const k = ((Math.round(y) % N + N) % N) * N + ((Math.round(x) % N + N) % N); A[k] = Math.max(A[k], w * (1 - t / L * 0.5)); }
  }
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) { data[4 * k] = R[k] * 255; data[4 * k + 1] = G[k] * 255; data[4 * k + 2] = B[k] * 255; data[4 * k + 3] = A[k] * 255; }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// ---------- 3) GLSL pieces (used by wear.js patch) ----------
export const GLSL_HEAD = /* glsl */`
  uniform sampler2D uDetail; uniform float uSurf; uniform float uTile;
  varying vec3 vSObjN;
  vec4 sD; float sEdge; float sH;
  vec4 triDetail(vec3 p, vec3 n){
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
    return texture2D(uDetail, p.yz * uTile) * w.x + texture2D(uDetail, p.zx * uTile) * w.y + texture2D(uDetail, p.xy * uTile) * w.z;
  }`;
// k: one of KINDS
export const glslSurface = (k) => /* glsl */`
  {
    sD = triDetail(vWObj, normalize(vSObjN));
    // distance fade: detail goes away when a texel gets smaller than a pixel (no shimmer, no moire)
    float foot = length(fwidth(vWObj)) * 512.0 * uTile;
    float near = uSurf * (1.0 - smoothstep(1.5, 5.0, foot));
    // convex-edge detector: change of the interpolated normal per unit of surface (≈ 1 / radius). Rounded R edges light up,
    // flat faces and big cylinders stay 0. Hard (flat-shaded) edges are not detected - they keep crisp paint.
    float curv = length(fwidth(vNormal)) / max(length(fwidth(vViewPosition)), 1e-5);
    sEdge = uSurf * smoothstep(4.0, 14.0, curv) * ${k.edge.toFixed(2)};
    sH = near * (${k.grain.toFixed(2)} * sD.r + ${k.brush.toFixed(2)} * sD.g * 1.6);
  }`;
export const glslRough = (k) => /* glsl */`
  roughnessFactor *= mix(1.0, 0.72 + 0.56 * sD.b, uSurf * ${k.rv.toFixed(2)});            // blotchy satin, never one flat sheen
  roughnessFactor *= mix(1.0, 0.75 + 0.5 * sD.g, uSurf * ${(k.brush * 0.8).toFixed(2)});  // brushed streaks
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.75, sEdge * 0.5);               // handled edges are polished
  roughnessFactor = clamp(roughnessFactor + uSurf * sD.a * ${(k.scratch * 0.25).toFixed(2)} * (0.3 + uWear), 0.04, 1.0);`;
export const GLSL_NORMAL = /* glsl */`
  if (sH > 0.0) {   // derivative bump from the detail height (same maths as three's perturbNormalArb)
    float bs = 0.0016;
    vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
    vec3 r1 = cross(sY, normal), r2 = cross(normal, sX);
    float det = dot(sX, r1) * faceDirection;
    vec3 grad = sign(det) * (dFdx(sH) * bs * r1 + dFdy(sH) * bs * r2);
    normal = normalize(abs(det) * normal - grad);
  }`;

// ---------- shading only: curved shells built from narrow flat strips show vertical stripes ----------
// Smoothing groups: faces that touch (share a corner position) and bend less than `angle` join one group; every corner
// then takes the area-weighted average normal of the faces of ITS group at that position (and within 60° of itself).
// So a gently curving shell shades as one continuous surface, while folds >= `angle` stay crisp.
// Geometry, material and triangle count are unchanged. Done once at build time.
export function smoothShading(root, angleDeg = 20, test = () => true) {
  const out = [], cosA = Math.cos(angleDeg * Math.PI / 180), cos60 = 0.5;
  root.traverse(m => {
    if (!m.isMesh || m.userData.marking || !m.geometry.attributes.position || !test(m)) return;
    let g = m.geometry; if (g.index) { g = g.toNonIndexed(); m.geometry = g; }
    const p = g.attributes.position, nT = p.count / 3; if (nT < 2) return;
    const fn = new Float32Array(nT * 3), area = new Float32Array(nT), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < nT; t++) {
      a.fromBufferAttribute(p, 3 * t); b.fromBufferAttribute(p, 3 * t + 1); c.fromBufferAttribute(p, 3 * t + 2);
      b.sub(a); c.sub(a); a.crossVectors(b, c); const L = a.length(); area[t] = L / 2; if (L > 0) a.multiplyScalar(1 / L);
      fn[3 * t] = a.x; fn[3 * t + 1] = a.y; fn[3 * t + 2] = a.z;
    }
    const dot = (u, v) => fn[3 * u] * fn[3 * v] + fn[3 * u + 1] * fn[3 * v + 1] + fn[3 * u + 2] * fn[3 * v + 2];
    const at = new Map();   // position -> faces touching it
    for (let i = 0; i < p.count; i++) {
      const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
      let l = at.get(k); if (!l) at.set(k, l = []); l.push(i);
    }
    const par = new Int32Array(nT).map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (const l of at.values()) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      const u = Math.floor(l[x] / 3), v = Math.floor(l[y] / 3); if (area[u] && area[v] && dot(u, v) > cosA) { const ru = find(u), rv = find(v); if (ru !== rv) par[ru] = rv; }
    }
    const nor = new Float32Array(p.count * 3);
    for (const l of at.values()) for (const i of l) {
      const t = Math.floor(i / 3), r = find(t); let x = 0, y = 0, z = 0;
      for (const j of l) { const f = Math.floor(j / 3); if (find(f) !== r || dot(f, t) < cos60) continue; x += fn[3 * f] * area[f]; y += fn[3 * f + 1] * area[f]; z += fn[3 * f + 2] * area[f]; }
      const L = Math.hypot(x, y, z) || 1; nor[3 * i] = x / L; nor[3 * i + 1] = y / L; nor[3 * i + 2] = z / L;
      if (!area[t]) { nor[3 * i] = fn[3 * t]; nor[3 * i + 1] = fn[3 * t + 1]; nor[3 * i + 2] = fn[3 * t + 2]; }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.push(m.name || '(无名)');
  });
  return out;
}
