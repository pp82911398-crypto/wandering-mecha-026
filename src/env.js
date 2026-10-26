// Hong Kong Shatterdome Jaeger bay: concrete well, opened dome, gantries, workers, Jumphawks.
// Everything here exists to give the Jaeger a sense of scale.
import * as THREE from 'three';
import { PI, DEG, cbox, cyl, ring, sphere, tube, slab, Batch, clean, shell, revolve, surface, torus } from './kit.js';
import { enhance, canvasTex, textTex, hazardTex, fbm, rng, emissive, FONT_EN, FONT_CN, weather } from './materials.js';

const V3 = THREE.Vector3;
function deckGeometry(g, m) {
  if (m.deck) { const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 700 + .5, p.getZ(i) / 700 + .5); }
  return g;
}

// ---------- people ----------
const capsule = (r, l) => clean(new THREE.CapsuleGeometry(r, l, 4, 10));
export function personInto(b, mats, x, y, z, rotY = 0, pose = 'stand', seed = 0) {
  if (mats.trackFeet) (b.personFeet ||= []).push({ x, y, z, seed });
  const r = rng(seed * 31 + 7);
  const s = 0.94 + r() * 0.12;
  const helmet = [mats.hatW, mats.hatY, mats.hatO][Math.floor(r() * 3)];
  const add = (g, m, p, rr = [0, 0, 0], sc = [1, 1, 1]) => {
    g.scale(sc[0] * s, sc[1] * s, sc[2] * s);
    g.rotateX(rr[0]); g.rotateY(rr[1]); g.rotateZ(rr[2]);
    g.translate(p[0] * s, p[1] * s, p[2] * s);
    g.rotateY(rotY); g.translate(x, y, z);
    b.add(g, m);
  };
  const legA = pose === 'walk' ? 0.35 : 0;
  add(capsule(0.085, 0.72), mats.suit, [0.1, 0.46, 0], [legA, 0, 0]);
  add(capsule(0.085, 0.72), mats.suit, [-0.1, 0.46, 0], [-legA, 0, 0]);
  add(capsule(0.17, 0.4), mats.suit, [0, 1.17, 0], [0, 0, 0], [1, 1, 0.66]);
  add(cyl(0.185, 0.185, 0.07, 12), mats.vest, [0, 1.2, 0], [0, 0, 0], [1, 1, 0.68]);
  add(cyl(0.185, 0.185, 0.05, 12), mats.vest, [0, 1.02, 0], [0, 0, 0], [1, 1, 0.68]);
  if (pose === 'point') {
    add(capsule(0.06, 0.5), mats.suit, [0.25, 1.38, 0.24], [-1.25, 0, 0.1]);
    add(capsule(0.06, 0.5), mats.suit, [-0.25, 1.08, 0.02], [0.1, 0, -0.12]);
  } else if (pose === 'rail') {
    add(capsule(0.06, 0.5), mats.suit, [0.24, 1.1, 0.18], [-0.65, 0, 0.1]);
    add(capsule(0.06, 0.5), mats.suit, [-0.24, 1.1, 0.18], [-0.65, 0, -0.1]);
  } else {
    add(capsule(0.06, 0.5), mats.suit, [0.25, 1.08, 0.0], [0.08, 0, 0.12]);
    add(capsule(0.06, 0.5), mats.suit, [-0.25, 1.08, 0.0], [-0.08, 0, -0.12]);
  }
  const look = pose === 'look' ? -0.5 : 0;
  add(sphere(0.105, 12, 8), mats.skin, [0, 1.6, 0]);
  add(new THREE.SphereGeometry(0.13, 12, 6, 0, PI * 2, 0, PI / 2), helmet, [0, 1.65, 0.0], [look, 0, 0]);
  add(cyl(0.155, 0.155, 0.02, 12), helmet, [0, 1.66, 0.02], [look, 0, 0]);
  add(sphere(0.025, 6, 4), mats.lamp, [0, 1.7, 0.13]);
}
export function makeWalker(mats, seed) {
  const g = new THREE.Group();
  const b = new Batch();
  personInto(b, mats, 0, 0, 0, 0, 'stand', seed);
  g.add(peopleBatch(b));
  return g;
}

function peopleBatch(b) {
  const feet = b.personFeet || [], group = b.build();
  if (feet.length) { group.userData.npcFeet = feet; b.personFeet = []; }
  return group;
}

// ---------- railings ----------
function railing(b, m, a, c, h = 1.1) {
  const A = new V3(...a), C = new V3(...c), d = C.clone().sub(A), L = d.length();
  const n = Math.max(1, Math.round(L / 1.6));
  const ang = Math.atan2(d.x, d.z);
  for (let i = 0; i <= n; i++) {
    const p = A.clone().addScaledVector(d, i / n);
    b.add(cbox(0.07, h, 0.07, 0.01), m.rail, [p.x, p.y + h / 2, p.z]);
  }
  for (const y of [h, h * 0.55, 0.12]) {
    const g = cbox(0.06, 0.06, L, 0.01); g.rotateY(ang);
    const mid = A.clone().add(C).multiplyScalar(0.5);
    b.add(g, y === 0.12 ? m.steel : m.rail, [mid.x, mid.y + y, mid.z]);
  }
}
function deck(b, m, cx, y, cz, w, d, rails = 'all', railGap = null) {
  b.add(deckGeometry(cbox(w, 0.25, d, 0.03), m), m.deck || m.grate, [cx, y - 0.125, cz]);
  b.add(cbox(w, 0.5, 0.25, 0.03), m.beam, [cx, y - 0.45, cz - d / 2]);
  b.add(cbox(w, 0.5, 0.25, 0.03), m.beam, [cx, y - 0.45, cz + d / 2]);
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  if (rails.includes('n') || rails === 'all') railing(b, m, [x0, y, z0], [x1, y, z0]);
  if (rails.includes('s') || rails === 'all') railing(b, m, [x0, y, z1], [x1, y, z1]);
  // A gap in one side rail becomes the shoulder-bridge portal. The rest of the deck stays fenced.
  for (const [side, x] of [['w', x0], ['e', x1]]) {
    if (!(rails.includes(side) || rails === 'all')) continue;
    if (railGap && railGap.side === side) {
      const gapA = Math.max(z0, railGap.z - railGap.half), gapB = Math.min(z1, railGap.z + railGap.half);
      if (gapA > z0 + .05) railing(b, m, [x, y, z0], [x, y, gapA]);
      if (z1 > gapB + .05) railing(b, m, [x, y, gapB], [x, y, z1]);
    } else railing(b, m, [x, y, z0], [x, y, z1]);
  }
  // LED edge strips (tiny lights read as scale)
  b.add(cbox(w, 0.05, 0.05, 0.0), m.led, [cx, y - 0.2, z1 + 0.15]);
}
function tower(b, m, cx, cz, w, d, h, levels, liftAccess = false, walkAccess = false) {
  const xs = [cx - w / 2, cx + w / 2], zs = [cz - d / 2, cz + d / 2];
  const portX = cx - Math.sign(cx) * (w / 2 - 1.5), portHalf = 1.25;
  for (const x of xs) for (const z of zs) b.add(cbox(0.9, h, 0.9, 0.08), m.beam, [x, h / 2, z]);
  const step = 9;
  for (let y = step; y <= h; y += step) {
    for (const x of xs) b.add(cbox(0.6, 0.6, d, 0.05), m.beam, [x, y, cz]);
    for (const z of zs) {
      if (walkAccess && levels.some(level => y > level - .4 && y < level + 2.4)) {
        const opening = z === zs[0] ? portX : cx, half = z === zs[0] ? portHalf : 2;
        for (const [lo, hi] of [[xs[0], opening - half], [opening + half, xs[1]]])
          if (hi > lo) b.add(cbox(hi - lo, .6, .6, .05), m.beam, [(lo + hi) / 2, y, z]);
      } else b.add(cbox(w, 0.6, 0.6, .05), m.beam, [cx, y, z]);
    }
  }
  // X-bracing on all faces. At the shoulder working level the inner face is opened: the two
  // diagonals in that band are omitted, leaving a clear portal for the telescoping bridge.
  const bridgeLevel = walkAccess ? levels[0] : null;
  const innerX = cx - Math.sign(cx) * w / 2;
  for (let y = 0; y < h - 1; y += step) {
    for (const x of xs) {
      if (bridgeLevel !== null && Math.abs(x - innerX) < .01 && y < bridgeLevel && y + step > bridgeLevel) continue;
      const L = Math.hypot(d, step), a = Math.atan2(step, d);
      for (const sgn of [-1, 1]) { const g = cbox(0.3, 0.3, L, 0.03); g.rotateX(sgn * a); b.add(g, m.steel, [x, y + step / 2, cz]); }
    }
    for (const z of zs) {
      if (walkAccess) continue; // pedestrian portals on both end faces
      const L = Math.hypot(w, step), a = Math.atan2(step, w);
      for (const sgn of [-1, 1]) { const g = cbox(L, 0.3, 0.3, 0.03); g.rotateZ(sgn * a); b.add(g, m.steel, [cx, y + step / 2, z]); }
    }
  }
  const innerSide = Math.sign(cx) < 0 ? 'e' : 'w';
  for (const y of levels) {
    deck(b, m, cx, y, cz, w + 0.6, d + 0.6, walkAccess ? 'we' : liftAccess ? 'nwe' : 'all',
      walkAccess && y === bridgeLevel ? { side: innerSide, z: cz - 3.5, half: 1.4 } : null);
    if (walkAccess) {
      const z = cz - d / 2 - .3;
      for (const [lo, hi] of [[cx - w / 2 - .3, portX - portHalf], [portX + portHalf, cx + w / 2 + .3]])
        if (hi > lo) railing(b, m, [lo, y, z], [hi, y, z]);
    }
    if (liftAccess) {
      railing(b, m, [cx - w / 2 - 0.3, y, cz + d / 2 + 0.3], [cx - 2, y, cz + d / 2 + 0.3]);
      railing(b, m, [cx + 2, y, cz + d / 2 + 0.3], [cx + w / 2 + 0.3, y, cz + d / 2 + 0.3]);
    }
  }
  // stairs zigzag inside one bay
  for (let y = 0; y < h - 6; y += step) {
    const L = Math.hypot(step, d * 0.7), a = Math.atan2(step, d * 0.7);
    const g = cbox(1.4, 0.2, L, 0.03); g.rotateX(-a);
    b.add(g, m.grate, [cx + ((y / step) % 2 ? 1 : -1) * w * 0.25, y + step / 2, cz]);
  }
}

// ---------- vehicles / props ----------
function truck(b, m, x, z, rot, color) {
  const parts = [
    [cbox(2.4, 1.0, 6.4, 0.1), m.dark, [0, 0.9, 0]],
    [cbox(2.4, 1.8, 2.0, 0.2), color, [0, 2.0, 2.0]],
    [cbox(2.2, 0.8, 0.1, 0.02), m.glass, [0, 2.3, 3.02]],
    [cbox(2.4, 1.2, 4.0, 0.1), color, [0, 1.9, -1.1]],
    [cbox(0.4, 0.15, 0.1, 0.02), m.headlight, [0.85, 1.4, 3.04]],
    [cbox(0.4, 0.15, 0.1, 0.02), m.headlight, [-0.85, 1.4, 3.04]],
    [cbox(1.6, 0.12, 0.3, 0.02), m.beacon, [0, 3.0, 2.0]],
  ];
  for (const [g, mm, p] of parts) { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mm); }
  for (const wx of [-1.2, 1.2]) for (const wz of [-2.1, 2.1]) {
    const g = cyl(0.55, 0.55, 0.45, 16); g.rotateZ(PI / 2); g.translate(wx, 0.55, wz); g.rotateY(rot); g.translate(x, 0, z); b.add(g, m.tire);
  }
}
function forklift(b, m, x, z, rot) {
  const parts = [
    [cbox(1.3, 1.1, 2.4, 0.1), m.yellow, [0, 0.85, 0]],
    [cbox(1.2, 0.08, 1.8, 0.02), m.dark, [0, 2.3, -0.1]],
    [cbox(0.08, 2.0, 0.08, 0.01), m.dark, [0.55, 1.6, -0.6]],
    [cbox(0.08, 2.0, 0.08, 0.01), m.dark, [-0.55, 1.6, -0.6]],
    [cbox(0.08, 3.2, 0.12, 0.01), m.steel, [0.35, 1.6, 1.3]],
    [cbox(0.08, 3.2, 0.12, 0.01), m.steel, [-0.35, 1.6, 1.3]],
    [cbox(0.15, 0.06, 1.2, 0.01), m.steel, [0.3, 0.2, 1.9]],
    [cbox(0.15, 0.06, 1.2, 0.01), m.steel, [-0.3, 0.2, 1.9]],
    [cbox(0.3, 0.1, 0.3, 0.02), m.beacon, [0, 2.4, -0.1]],
  ];
  for (const [g, mm, p] of parts) { g.translate(...p); g.rotateY(rot); g.translate(x, 0, z); b.add(g, mm); }
}
function container(b, m, x, y, z, rot, mat) {
  const g = cbox(12.2, 2.6, 2.44, 0.06); g.translate(0, 1.3, 0); g.rotateY(rot); g.translate(x, y, z); b.add(g, mat);
  for (let i = -5.5; i <= 5.5; i += 0.6) { const r = cbox(0.12, 2.3, 2.52, 0.02); r.translate(i, 1.3, 0); r.rotateY(rot); r.translate(x, y, z); b.add(r, mat); }
}

function skyDome(scene) {
  const g = new THREE.SphereGeometry(1800, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uFlashPos: { value: new THREE.Vector2(0.3, -0.2) } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vD; uniform float uTime; uniform float uFlash; uniform vec2 uFlashPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        float y = max(vD.y, 0.0);
        vec2 uv = vD.xz / (y + 0.18) * 1.4;
        vec2 wind = vec2(uTime * 0.035, uTime * 0.012);
        float c1 = fbm(uv + wind), c2 = fbm(uv * 2.2 - wind * 1.6 + c1);
        float dens = smoothstep(0.35, 0.85, c1 * 0.65 + c2 * 0.45);
        vec3 base = vec3(0.03, 0.045, 0.07);
        vec3 lit = vec3(0.16, 0.19, 0.25);
        vec3 col = mix(base, lit, dens * 0.8);
        col += vec3(0.20, 0.10, 0.05) * exp(-y * 5.0) * 0.6;           // distant city glow under the clouds
        float fd = exp(-length(uv - uFlashPos * 3.0) * 0.35);
        col += vec3(0.55, 0.65, 1.0) * uFlash * (0.25 + dens * 1.6) * (0.35 + fd);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const s = new THREE.Mesh(g, m); s.renderOrder = -10; scene.add(s);
  return m;
}

// Jumphawk: twin-rotor heavy-lift helicopter (scale cue in the sky)
function jumphawk(m) {
  const g = new THREE.Group();
  const b = new Batch();
  b.add(cbox(3.4, 2.8, 12, 0.6), m.dark, [0, 0, 0]);
  b.add(cbox(2.8, 1.4, 4, 0.4), m.glass, [0, 0.4, 5.2]);
  b.add(cbox(1.2, 1.2, 9, 0.3), m.dark, [0, 0.5, -9.5]);
  b.add(cbox(0.3, 3.2, 2.4, 0.1), m.dark, [0, 2.0, -13.4]);
  b.add(cbox(13, 0.6, 1.8, 0.2), m.dark, [0, 1.7, 0.5]);
  for (const s of [-1, 1]) { b.add(cyl(0.5, 0.6, 1.6, 10), m.dark, [s * 6.2, 2.4, 0.5]); b.add(cbox(1.2, 1.0, 3.6, 0.2), m.dark, [s * 6.2, 1.4, 0.5]); }
  b.add(cbox(1.6, 0.9, 1.0, 0.2), m.yellow, [0, -1.8, 3.6]);
  b.add(cyl(0.45, 0.45, 0.1, 12), m.headlight, [0, -2.3, 3.6]);
  b.add(sphere(0.25, 8, 6), m.beaconR, [-6.9, 1.7, 0.5]); b.add(sphere(0.25, 8, 6), m.navG, [6.9, 1.7, 0.5]);
  b.add(cbox(0.3, 1.4, 0.3, 0.05), m.steel, [0, -2.1, -1]);
  g.add(b.build(false));
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), m.strobe); strobe.position.set(0, 3.6, -13.4); g.add(strobe);
  const rotors = [];
  for (const s of [-1, 1]) {
    const r = new THREE.Group(); r.position.set(s * 6.2, 3.3, 0.5);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 40), new THREE.MeshBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -PI / 2; r.add(disc);
    for (let k = 0; k < 2; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.08, 0.5), m.dark); bl.rotation.y = k * PI / 2; r.add(bl); }
    g.add(r); rotors.push(r);
  }
  // hoist cable hanging down into the bay
  const cg = new THREE.CylinderGeometry(0.06, 0.06, 1, 5, 1, true); cg.translate(0, -0.5, 0);
  const cable = new THREE.Mesh(cg, m.dark); cable.position.set(0, -1.6, -1); cable.scale.y = 40 + Math.random() * 50; g.add(cable);
  return { g, rotors, strobe, cable };
}

// ---------- floor ----------
function floorTextures() {
  const S = 1024;
  const n1 = fbm(S, [8, 16, 32, 64, 128, 256], 5), n2 = fbm(S, [4, 8, 16, 32], 6, 0.6);
  const col = canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 46 + n1[i] * 30 - n2[i] * 14;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 1.0; img.data[i * 4 + 2] = v * 1.04; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = 'rgba(10,10,12,0.8)'; x.lineWidth = 3;
    for (let i = 0; i <= S; i += S / 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  }, { repeat: true });
  const rough = canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const p = n2[i];
      const wet = Math.min(1, Math.max(0, (p - 0.42) / 0.16));
      const v = (0.82 - wet * 0.74 + n1[i] * 0.12) * 255;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true, data: true });
  const mask = canvasTex(S, S, (x) => {
    const img = x.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const wet = Math.min(1, Math.max(0, (n2[i] - 0.4) / 0.18));
      img.data[i * 4] = wet * 255; img.data[i * 4 + 1] = n1[i] * 255; img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: true, data: true });
  return { col, rough, mask };
}

function floorMarkings(W, D) {
  // canvas covering W x D meters centered at origin (x: -W/2..W/2, z: -D/2..D/2)
  const px = 2048, sx = px / W, sz = px / D;
  const X = x => (x + W / 2) * sx, Z = z => (z + D / 2) * sz;
  return canvasTex(px, px, (c) => {
    c.clearRect(0, 0, px, px);
    const yel = '#d29a12';
    // hazard frame around bay
    const stripe = (x0, z0, x1, z1, t) => {
      c.save(); c.fillStyle = '#121212'; c.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      c.beginPath(); c.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); c.clip();
      c.fillStyle = yel; const st = t * sx * 1.2;
      for (let i = -2000; i < 4000; i += st * 2) { c.beginPath(); c.moveTo(i, Z(z0)); c.lineTo(i + st, Z(z0)); c.lineTo(i + st - 400, Z(z1) + 400); c.lineTo(i - 400, Z(z1) + 400); c.closePath(); c.fill(); }
      c.restore();
    };
    const bx = 26, bz0 = -18, bz1 = 26, t = 1.6;
    stripe(-bx, bz0, bx, bz0 + t, t); stripe(-bx, bz1 - t, bx, bz1, t);
    stripe(-bx, bz0, -bx + t, bz1, t); stripe(bx - t, bz0, bx, bz1, t);
    c.strokeStyle = yel; c.lineWidth = 0.35 * sx; c.setLineDash([2 * sx, 1.4 * sx]);
    c.strokeRect(X(-bx - 4), Z(bz0 - 4), (bx * 2 + 8) * sx, (bz1 - bz0 + 8) * sz);
    c.setLineDash([]);
    // bay number
    c.fillStyle = 'rgba(225,220,205,0.85)'; c.font = `700 ${18 * sx}px ${FONT_EN}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('03', X(0), Z(42));
    c.font = `700 ${4.4 * sx}px ${FONT_CN}`; c.fillText('流浪战甲 · 维护区', X(0), Z(53.5));
    c.font = `700 ${2.4 * sx}px ${FONT_EN}`; c.fillStyle = 'rgba(210,154,18,0.9)';
    c.fillText('WANDERING ARMOR', X(0), Z(58.5));
    c.font = `600 ${2.6 * sx}px ${FONT_EN}`; c.fillStyle = 'rgba(210,154,18,0.9)';
    c.fillText('JAEGER BAY 03  ·  KEEP CLEAR  ·  MAX LOAD 2,000 T', X(0), Z(31.5));
    // guide lines / walkways
    c.strokeStyle = 'rgba(225,220,205,0.6)'; c.lineWidth = 0.25 * sx;
    for (const x of [-40, -36, 36, 40]) { c.beginPath(); c.moveTo(X(x), Z(-60)); c.lineTo(X(x), Z(80)); c.stroke(); }
    for (let z = -50; z < 80; z += 6) { c.fillStyle = 'rgba(225,220,205,0.55)'; c.fillRect(X(-39.6), Z(z), 3.2 * sx, 1.2 * sz); c.fillRect(X(36.4), Z(z), 3.2 * sx, 1.2 * sz); }
    // foot targets
    for (const s of [-1, 1]) { c.strokeStyle = 'rgba(210,154,18,0.8)'; c.lineWidth = 0.3 * sx; c.strokeRect(X(s * 9 - 5.5), Z(-7), 11 * sx, 21 * sz); }
    weather(c, px, px, 0.9, 13);
  });
}

// ================= BUILD =================
export function buildEnvironment(scene, J, M, opts = {}) {
  const fogColor = 0x0b111b;
  const E = M.E;
  const em = (c, i) => emissive(c, i);
  const mk = (p, cfg) => enhance(new THREE.MeshStandardMaterial(p), cfg);
  const m = {
    beam: mk({ color: 0x2b2e33, metalness: 0.8, roughness: 0.5 }, { dirt: 0.6, streak: 0.6, scale: 0.2 }),
    steel: mk({ color: 0x4a4e55, metalness: 0.9, roughness: 0.4 }, { dirt: 0.5, streak: 0.5, scale: 0.3 }),
    grate: mk({ color: 0x24262a, metalness: 0.8, roughness: 0.55 }, { dirt: 0.6, streak: 0.2, scale: 0.4 }),
    rail: mk({ color: 0xb8860f, metalness: 0.3, roughness: 0.45 }, { dirt: 0.5, chip: 0.5, streak: 0.4, scale: 0.4 }),
    yellow: mk({ color: 0xb8860f, metalness: 0.3, roughness: 0.45 }, { dirt: 0.5, chip: 0.4, streak: 0.4, scale: 0.3 }),
    dark: mk({ color: 0x17181b, metalness: 0.6, roughness: 0.55 }, { dirt: 0.4, scale: 0.3 }),
    concrete: mk({ color: 0x3a3b3e, metalness: 0.0, roughness: 0.85 }, { dirt: 0.7, streak: 0.8, scale: 0.035 }),
    concreteD: mk({ color: 0x24252a, metalness: 0.0, roughness: 0.9 }, { dirt: 0.7, streak: 0.9, scale: 0.03 }),
    tire: mk({ color: 0x0c0c0c, roughness: 0.8 }, { dirt: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0f14, metalness: 0.9, roughness: 0.05 }),
    red: mk({ color: 0x6b1a14, metalness: 0.4, roughness: 0.6 }, { dirt: 0.6, chip: 0.4, streak: 0.7, scale: 0.2 }),
    blue: mk({ color: 0x1b3a52, metalness: 0.4, roughness: 0.6 }, { dirt: 0.6, chip: 0.4, streak: 0.7, scale: 0.2 }),
    teal: mk({ color: 0x1f4a44, metalness: 0.4, roughness: 0.6 }, { dirt: 0.6, chip: 0.4, streak: 0.7, scale: 0.2 }),
    white: mk({ color: 0x8e8c86, metalness: 0.3, roughness: 0.6 }, { dirt: 0.7, chip: 0.4, streak: 0.7, scale: 0.2 }),
    chromeE: mk({ color: 0xc9cdd3, metalness: 1, roughness: 0.15 }, { dirt: 0.25, streak: 0.3, scale: 0.4 }),
    brassE: mk({ color: 0x8c6a32, metalness: 1, roughness: 0.35 }, { dirt: 0.4, scale: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1, metalness: 0 }), beaconR: em(0xff2a1a, 14), navG: em(0x2aff6a, 10), strobe: em(0xffffff, 30),
    led: em(0xffb35a, 6), headlight: em(0xfff2d8, 8), beacon: em(0xff8a1a, 8),
    sodium: em(0xffa648, 10), floodF: em(0xfff3e0, 30), screenG: E.screenG, screenC: E.screenC, blue: em(0x5ad2ff, 5),
  };
  if (opts.liftBase) m.blue = mk({ color: 0x1b3a52, metalness: 0.4, roughness: 0.65 }, { dirt: 0.5, chip: 0.3, streak: 0.6, scale: 0.2 });
  const pm = {
    suit: mk({ color: 0x1d2128, roughness: 0.8 }, { dirt: 0.3 }),
    vest: mk({ color: 0xc6e83a, roughness: 0.5, emissive: 0x1a2200, emissiveIntensity: 1 }, { dirt: 0.2 }),
    skin: mk({ color: 0x6d5444, roughness: 0.7 }, {}),
    hatW: mk({ color: 0xd9d6cf, roughness: 0.4 }, { dirt: 0.3 }),
    hatY: mk({ color: 0xd8a21a, roughness: 0.4 }, { dirt: 0.3 }),
    hatO: mk({ color: 0xd85a1a, roughness: 0.4 }, { dirt: 0.3 }),
    lamp: em(0xfff2d8, 12),
  };
  for (const mat of Object.values(pm)) mat.userData.npc = true;
  pm.trackFeet = !!opts.walkAccess;
  const env = { groups: {}, movers: [], walkers: [], beams: [], spots: [], cables: [], sky: null, city: null };
  const heightDrop = THREE.MathUtils.clamp(opts.heightDrop || 0, 0, 20);

  // ---- key anchors from the Jaeger ----
  const W = n => { const v = new V3(); J.anchors[n].getWorldPosition(v); return v; };
  const lamp = W('lamp');
  const deckY = Math.round((lamp.y - 3.4) * 10) / 10;
  const bridgeZ = lamp.z + 19;

  env.turntable = opts.turntable ? opts.turntable(scene, m) : null;
  // ---- floor ----
  const ft = opts.floorTextures ? opts.floorTextures() : floorTextures();
  ft.col.repeat.set(ft.repeat ?? 60, ft.repeat ?? 60); ft.rough.repeat.set(ft.repeat ?? 60, ft.repeat ?? 60);
  if (ft.bump) ft.bump.repeat.set(ft.repeat ?? 60, ft.repeat ?? 60);
  const floorMat = new THREE.MeshStandardMaterial({ map: ft.col, roughnessMap: ft.rough, bumpMap: ft.bump || null,
    bumpScale: ft.bumpScale ?? 0.025, roughness: 1, metalness: ft.metalness ?? (ft.bump ? 0 : 0.05), color: ft.bump ? 0xffffff : 0x8a8d92 });
  if (opts.industrialDecks) m.deck = floorMat;
  const holePlane = (mark = false) => {
    const shape = new THREE.Shape();
    if (mark) { shape.moveTo(-80,-80); shape.lineTo(80,-80); shape.lineTo(80,80); shape.lineTo(-80,80); shape.closePath(); }
    else shape.absarc(0,0,105,0,Math.PI*2,false);
    if (env.turntable) { const hole = new THREE.Path(); hole.absarc(0,0,env.turntable.radius,0,Math.PI*2,true); shape.holes.push(hole); }
    const g = new THREE.ShapeGeometry(shape, 128), p = g.attributes.position, uv = g.attributes.uv;
    const scale = mark ? 160 : 700;
    for (let i=0;i<p.count;i++) uv.setXY(i,p.getX(i)/scale+.5,p.getY(i)/scale+.5);
    return g;
  };
  const floor = new THREE.Mesh(env.turntable ? holePlane() : new THREE.PlaneGeometry(700, 700), floorMat);
  floor.name = 'bayFloor'; env.floor = floor;
  floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
  const mark = new THREE.Mesh(env.turntable ? holePlane(true) : new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({
    map: floorMarkings(160, 160), transparent: true, roughness: 0.55, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  mark.rotation.x = -PI / 2; mark.position.y = 0.01; mark.receiveShadow = true; scene.add(mark);
  env.floorMask = ft.mask;

  const S = new Batch();     // static structure
  const P = new Batch();     // people (static)

  // ---- side towers ----
  const TX = 36, TW = 8, TD = 30, TZ = lamp.z + 2, TH = deckY + 16;
  const sideBatches = {}, sideFor = new Map(); env.observation = [];
  for (const s of [-1, 1]) {
    const b = opts.observation ? new Batch() : S; sideBatches[s] = b;
    tower(b, m, s * TX, TZ, TW, TD, TH, [deckY, 44, 24, deckY + 13], !!opts.observation, !!opts.walkAccess);
    if (opts.observation) {
      const side = opts.observation(scene, m, { x: s * TX, z: TZ, side: s, levels: [24, 44, deckY, deckY + 13], depth: TD });
      env.observation.push(side); sideFor.set(s, side);
    }
  }
  // floodlight heads on tower tops
  for (const s of [-1, 1]) for (const dz of [-10, 10]) {
    sideBatches[s].add(cbox(2.4, 1.6, 1.2, 0.15), m.dark, [s * (TX - 3), TH + 1.2, TZ + dz], [0.5, -s * 0.6, 0]);
    sideBatches[s].add(cbox(2.1, 1.3, 0.1, 0.02), m.floodF, [s * (TX - 3) - s * 0.3, TH + 1.0, TZ + dz + 0.6], [0.5, -s * 0.6, 0]);
  }

  // ---- LIFT TOWER: elevator platform + telescoping bridge (replaces the fixed gangway) ----
  env.lift = buildLift(scene, m, pm, J, { lamp, deckY, liftBase: opts.liftBase });
  env.deckY = deckY;

  // ---- side cantilever platforms (retract) ----
  const cantis = [];
  for (const s of [-1, 1]) for (const [y, z] of [[44, -9.5], [24, -9.5]]) {
    const g = new THREE.Group(); scene.add(g);
    const b = new Batch();
    const x0 = s * (TX - TW / 2), x1 = s * 19.5;
    deck(b, m, (x0 + x1) / 2, y, z, Math.abs(x1 - x0), 3.2, 'ns');
    railing(b, m, [x1, y, z - 1.6], [x1, y, z + 1.6]);
    personInto(b, pm, x1 + s * 1.4, y, z + 0.4, -s * PI / 2, 'rail', y + s);
    personInto(b, pm, x1 + s * 3.4, y, z - 0.6, -s * PI / 2 + 0.4, 'stand', y + s + 9);
    g.add(peopleBatch(b));
    const side = sideFor.get(s);
    if (side) { scene.updateMatrixWorld(true); side.root.attach(g); g.position.y += side.baseY; }
    cantis.push({ g, s, homeX: g.position.x, tower: side });
  }
  env.cantis = cantis;

  // ---- tower people ----
  for (const s of [-1, 1]) {
    personInto(opts.observation ? sideBatches[s] : P, pm, s * (TX - 1), deckY, TZ - 8, -s * PI / 2, 'stand', 20 + s);
    personInto(opts.observation ? sideBatches[s] : P, pm, s * (TX + (opts.walkAccess ? .65 : 1.5)), 44, TZ + 5, -s * PI / 2, 'look', 22 + s);
    personInto(opts.observation ? sideBatches[s] : P, pm, s * (TX - (opts.walkAccess ? .65 : 2)), 24, TZ + 9, -s * PI / 2 + 0.6, 'stand', 24 + s);
    personInto(opts.observation ? sideBatches[s] : P, pm, s * (TX + (opts.walkAccess ? .65 : 2)), deckY + 13, TZ - 2, -s * PI / 2, 'rail', 26 + s);
    const side = sideFor.get(s);
    if (side) { const structure = peopleBatch(sideBatches[s]); scene.add(structure); scene.updateMatrixWorld(true); side.root.attach(structure); structure.position.y += side.baseY; }
  }

  // ---- crane gantry & hoist cables ----
  // Move the airport gantry behind the machine without changing its mounting height.
  const craneY = 118 - heightDrop;
  const craneZ = opts.craneZ ?? 0;
  env.craneY = craneY; env.craneZ = craneZ;
  for (const offset of [-6, 6]) {
    const z = craneZ + offset;
    // Shorten each span to meet the round wall at its new depth.
    const halfSpan = craneZ === 0 ? 98 : Math.sqrt(100 ** 2 - (z + 6) ** 2) - 2;
    S.add(cbox(halfSpan * 2, 3.2, 2.2, 0.2), m.yellow, [0, craneY, z]);
    S.add(cbox(halfSpan * 2, 0.6, 3.0, 0.1), m.dark, [0, craneY - 1.9, z]);
    for (let x = -halfSpan + 2; x <= halfSpan - 2; x += 6) { const g = cbox(0.25, 3.2, 0.25, 0.02); g.rotateZ((Math.round(x / 6)) % 2 ? 0.6 : -0.6); S.add(g, m.dark, [x, craneY, z + 1.2]); }
  }
  for (const tag of ['armL', 'armR1']) {
    const h = W(tag + 'Hook');
    S.add(cbox(6, 2.6, 14, 0.2), m.dark, [h.x, craneY - 2.2, craneZ]);
    S.add(cyl(1.4, 1.4, 5.6, 20), m.steel, [h.x, craneY - 3.6, craneZ], [0, 0, PI / 2]);
    for (const dz of [-0.35, 0.35]) {
      const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true); geo.translate(0, -0.5, 0);
      const cable = new THREE.Mesh(geo, m.dark); cable.position.set(h.x, craneY - 4.5, craneZ + dz); scene.add(cable);
      env.cables.push({ mesh: cable, top: new V3(h.x, craneY - 4.5, craneZ + dz), dz, tag });
    }
    const hb = new Batch(); hb.add(cbox(1.6, 2.2, 1.0, 0.2), m.yellow, [0, 1.6, 0]); hb.add(cbox(0.25, 0.9, 0.25, 0.04), m.steel, [0, 0.4, 0]);
    const hook = hb.build(); scene.add(hook); env.cables.push({ hook, tag });
  }

  // ---- foot cradles ----
  const footBatch = env.turntable ? new Batch() : S;
  for (const tag of ['L', 'R']) {
    const f = W('foot' + tag);
    for (const s of [-1, 1]) {
      footBatch.add(cbox(1.6, 3.2, 7.0, 0.2), m.yellow, [f.x + s * 4.6, 1.6, f.z]);
      footBatch.add(cbox(2.2, 0.8, 7.6, 0.1), m.dark, [f.x + s * 4.9, 0.4, f.z]);
      footBatch.add(cyl(0.35, 0.35, 2.2, 12), m.steel, [f.x + s * 3.6, 2.2, f.z - 2], [0, 0, PI / 2]);
      footBatch.add(cyl(0.35, 0.35, 2.2, 12), m.steel, [f.x + s * 3.6, 2.2, f.z + 2], [0, 0, PI / 2]);
      for (const dz of [-3.3, 3.3]) footBatch.add(cbox(0.4, 0.3, 0.4, 0.04), m.beacon, [f.x + s * 4.6, 3.35, f.z + dz]);
    }
  }

  if (env.turntable) env.turntable.rotor.add(footBatch.build());

  // ---- ground props ----
  const groundLayout = opts.groundLayout?.(); env.groundLayout = groundLayout;
  truck(S, m, opts.liftBase ? 44 : 22, opts.liftBase ? 46 : 34, -0.5, m.white);
  truck(S, m, opts.liftBase ? -46 : -26, 46, 0.3, m.yellow);
  forklift(S, m, opts.liftBase ? 58 : 14, 22, 2.4);
  forklift(S, m, opts.liftBase ? -58 : -17, 18, -2.0);
  container(S, m, -62, 0, 30, PI / 2, m.red); container(S, m, -65, 0, 30, PI / 2, m.blue); container(S, m, -63.5, 2.6, 30, PI / 2, m.teal);
  container(S, m, 64, 0, -20, PI / 2, m.blue); container(S, m, 67, 0, -20, PI / 2, m.white); container(S, m, 64, 2.6, -20, PI / 2, m.red);
  container(S, m, 58, 0, 52, 0.05, m.teal);
  for (let i = 0; i < 6; i++) S.add(cyl(1.3, 1.3, 1.4, 18), m.dark, [-48 + i * 3.0, 1.3, -30], [PI / 2, 0, 0]);
  const cr = rng(3);
  for (let i = 0; i < (groundLayout?.cones.length ?? 26); i++) {
    let x = (cr() - 0.5) * 50;
    let z = 18 + cr() * 18;
    if (groundLayout) [x, z] = groundLayout.cones[i];
    else { if (Math.abs(x) < 3) continue; if (opts.liftBase) { x = Math.sign(x) * (54 + cr() * 4); z = cr() * 18; } }
    S.add(cyl(0.05, 0.22, 0.7, 10), groundLayout ? m.yellow : m.beacon, [x, 0.35, z]);
    if (groundLayout) {
      S.add(cbox(.48, .065, .48, .025), m.tire, [x, .0325, z]);
      S.add(cyl(.102, .135, .14, 10), m.white, [x, .42, z]);
    }
  }
  // crates & pallets near bay
  for (let i = 0; i < 10; i++) { const x = (opts.observation ? -74 : -44) + (i % 5) * 2.2, z = -2 + Math.floor(i / 5) * 2.4; S.add(cbox(2.0, 1.6, 2.0, 0.08), i % 3 ? m.dark : m.yellow, [x, 0.8, z]); }
  // ground workers
  const wr = rng(17);
  const groundSpots = groundLayout?.workers || [[8, 16], [10, 18], [-6, 20], [-8, 17], [7.5, 31], [6.8, 33.5], [19, 30], [21, 31], [-24, 42], [-12, 8], [12, 8], [16, -2], [-15, -4], [30, 12], [-31, 20], [-7.5, 38], [-6.5, 36.5], [24, 4]];
  groundSpots.forEach(([x, z], i) => {
    if (!groundLayout && opts.liftBase && ((Math.abs(x) < 46 && z >= 12) || (env.turntable && Math.hypot(x,z) < env.turntable.radius + 3))) x = Math.sign(x || 1) * (56 + i % 3 * 1.6);
    const poses = ['stand', 'look', 'point', 'stand', 'look'];
    personInto(P, pm, x, 0, z, PI + (wr() - 0.5) * 1.4, poses[i % poses.length], 40 + i);
  });
  // walkers (animated)
  for (let i = 0; i < 6; i++) {
    const w = makeWalker(pm, 70 + i); scene.add(w);
    const path = groundLayout?.walkers[i] || (opts.observation
      ? [[i % 2 ? -54 : 54, -8 + i * 4], [i % 2 ? -54 : 54, 50 + i * 3]]
      : [[-40 + i * 3, 30 - i * 6], [40 - i * 2, 28 - i * 5]]);
    env.walkers.push({ g: w, path, t: wr(), speed: 0.012 + wr() * 0.01 });
  }

  // ---- JAEGER BAY: a vast concrete well under an opened dome (Hong Kong Shatterdome) ----
  const RW = 100, HW = 158 - heightDrop, CZ = -6;
  env.RW = RW; env.HW = HW; env.CZ = CZ; env.heightDrop = heightDrop;
  const W0 = new Batch();
  env.wallAppearance = opts.wallAppearance ? opts.wallAppearance(m) : null;
  const wall = env.wallAppearance || { panel: m.concreteD, structure: m.concrete };
  W0.add(shell([[RW + 7, 0], [RW + 4, 30], [RW + 4, HW]], 4, { segs: 160 }), wall.panel, [0, 0, CZ]);
  // structural pilasters
  for (let i = 0; i < 44; i++) {
    const a = i / 44 * PI * 2;
    const r = RW - 1.8;
    W0.add(cbox(5.2, HW, 3.6, 0.4), wall.structure, [Math.sin(a) * r, HW / 2, CZ + Math.cos(a) * r], [0, a, 0]);
    W0.add(cbox(6.4, 3.2, 5.0, 0.3), wall.structure, [Math.sin(a) * (r - 0.6), 2, CZ + Math.cos(a) * (r - 0.6)], [0, a, 0]);
  }
  // gallery tiers: ring decks, railings, LED fascia, lit windows (each light ≈ a human-scale room)
  const tiers = [16, 34, 56, 80, 104, 128, 148].filter(y => y <= HW - 10);
  env.tiers = tiers;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if (opts.galleries) env.visitors = opts.galleries(scene, { RW, CZ, tiers, height: HW }, m);
  else for (const y of tiers) {
    W0.add(revolve([[RW - 7.5, y - 0.6], [RW, y - 0.6], [RW, y], [RW - 7.5, y]], { segs: 160 }), m.grate, [0, 0, CZ]);
    W0.add(revolve([[RW - 7.6, y - 1.4], [RW - 7.2, y - 1.4], [RW - 7.2, y - 0.6], [RW - 7.6, y - 0.6]], { segs: 160 }), m.led, [0, 0, CZ]);
    W0.add(revolve([[RW - 7.55, y + 1.05], [RW - 7.45, y + 1.05], [RW - 7.45, y + 1.15], [RW - 7.55, y + 1.15]], { segs: 160 }), m.rail, [0, 0, CZ]);
    const n = 200;
    for (let i = 0; i < n; i++) { const a = i / n * PI * 2, r = RW - 7.5; W0.add(box(0.07, 1.1, 0.07), m.rail, [Math.sin(a) * r, y + 0.55, CZ + Math.cos(a) * r]); }
    // brackets under deck
    for (let i = 0; i < 44; i++) { const a = (i + 0.5) / 44 * PI * 2, r = RW - 4; const g = cbox(0.5, 4.5, 6.5, 0.05); g.rotateX(0.75); g.rotateY(a); W0.add(g, m.beam, [Math.sin(a) * r, y - 2.6, CZ + Math.cos(a) * r]); }
  }
  // lit windows / doorways along the well
  {
    const wr2 = rng(808), N = 1700;
    const wm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.0), wm, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const pal = [[1.0, 0.62, 0.3], [1.0, 0.8, 0.55], [0.55, 0.78, 1.0], [0.9, 0.95, 1.0]];
    for (let i = 0; i < N; i++) {
      const a = wr2() * PI * 2;
      const t = tiers[Math.floor(wr2() * tiers.length)];
      const y = wr2() < 0.7 ? t + 1.2 + wr2() * 2.0 : 6 + wr2() * (HW - 12);
      const r = RW - 0.15;
      q.setFromAxisAngle(new V3(0, 1, 0), a + PI);
      const sw = wr2() < 0.15 ? 2.6 : 1;
      m4.compose(new V3(Math.sin(a) * r, y, CZ + Math.cos(a) * r), q, new V3(sw * (0.6 + wr2()), 0.6 + wr2() * 0.9, 1));
      im.setMatrixAt(i, m4);
      const p = pal[Math.floor(wr2() * pal.length)], k = wr2() < 0.78 ? (0.6 + wr2() * 2.2) : 0.04;
      im.setColorAt(i, c.setRGB(p[0] * k, p[1] * k, p[2] * k));
    }
    im.frustumCulled = false; scene.add(im);
  }
  // tunnel portals to neighbouring bays (floor level)
  for (const ad of [62, -62, 118, -118]) {
    const a = ad * DEG, r = RW - 3.5, px = Math.sin(a) * r, pz = CZ + Math.cos(a) * r;
    W0.add(cbox(26, 20, 3, 0.3), m.yellow, [px, 10, pz], [0, a, 0]);
    W0.add(cbox(22, 17, 3.4, 0.2), m.black, [px, 8.5, pz], [0, a, 0]);
    for (let k = -4; k <= 4; k++) W0.add(cbox(0.8, 0.3, 0.3, 0.02), m.led, [px + Math.cos(a) * k * 2.4, 17.6, pz - Math.sin(a) * k * 2.4], [0, a, 0]);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.2), new THREE.MeshStandardMaterial({ map: hazardTex(1024, 96), roughness: 0.6 }));
    hz.position.set(px - Math.sin(a) * 1.8, 19.2, pz - Math.cos(a) * 1.8); hz.rotation.y = a + PI; scene.add(hz);
  }
  // giant blast door behind the Jaeger (closed)
  {
    const dz = CZ - RW + 9, DW = 84, DH = 118;
    W0.add(cbox(DW + 16, DH + 12, 6, 0.6), m.concrete, [0, (DH + 12) / 2, dz - 2]);
    for (const s of [-1, 1]) {
      W0.add(cbox(DW / 2 - 0.4, DH, 4, 0.4), m.beam, [s * DW / 4, DH / 2, dz + 1.5]);
      for (let y = 10; y < DH; y += 14) W0.add(cbox(DW / 2 - 2, 1.6, 0.8, 0.1), m.steel, [s * DW / 4, y, dz + 3.8]);
      for (let k = 0; k < 5; k++) W0.add(cbox(1.4, DH - 6, 1.0, 0.1), m.steel, [s * (6 + k * 8), DH / 2, dz + 3.9]);
    }
    W0.add(cbox(0.5, DH, 0.6, 0.02), m.led, [0, DH / 2, dz + 3.7]);
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshStandardMaterial({
      map: textTex([{ t: '03', size: 360, y: 300, font: FONT_EN, color: '#b9b2a2' }, { t: '流浪战甲 · WANDERING ARMOR', size: 46, y: 520, color: '#d29a12', spacing: 6 }], 1024, 1440, { wear: 0.8, seed: 61 }),
      transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    dec.position.set(0, DH / 2, dz + 4.35); scene.add(dec);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(DW + 14, 3), new THREE.MeshStandardMaterial({ map: hazardTex(2048, 96), roughness: 0.6 }));
    hz.position.set(0, DH + 7, dz + 1.1); scene.add(hz);
  }
  // curved wall signage
  {
    const tex = textTex([{ t: '香港破碎穹頂', size: 150, y: 120, color: '#c4bdac' }, { t: 'HONG KONG SHATTERDOME  ·  PPDC  ·  BAY 03', size: 56, y: 250, font: FONT_EN, spacing: 12, color: '#d29a12' }], 1024, 384, { wear: 0.75, seed: 50 });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1;
    const g = surface([[RW - 0.4, 88], [RW - 0.4, 101]], 0, { phiStart: 68 * DEG, phiLength: 36 * DEG, segs: 40 });
    const sg = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    sg.position.z = CZ; scene.add(sg);
  }
  // opened dome: conical roof ring, radial ribs, petal doors folded open, rim beacons
  const RO = 46, RY = HW + 24;
  if (opts.roof) env.roof = opts.roof(scene, { RW, HW, CZ, RO, RY }, m);
  else {
  W0.add(shell([[RW + 5, HW], [RO, RY]], 3, { segs: 128 }), m.concreteD, [0, 0, CZ]);
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * PI * 2, L = Math.hypot(RW - RO, RY - HW), tilt = Math.atan2(RY - HW, RW - RO);
    const g = cbox(2.2, 3.2, L, 0.2); g.rotateX(tilt); g.translate(0, 0, 0); g.rotateY(a);
    const r = (RW + RO) / 2;
    W0.add(g, m.beam, [Math.sin(a) * r, (HW + RY) / 2 - 3.2, CZ + Math.cos(a) * r]);
  }
  W0.add(ring(RO - 3, RO + 1, 3.5, 96), m.yellow, [0, RY - 1, CZ]);
  for (let i = 0; i < 10; i++) {
    const a = (i + 0.5) / 10 * PI * 2, w = 2 * RO * Math.sin(PI / 10) * 0.92, L = 42;
    const pet = slab([[-w / 2, 0], [w / 2, 0], [w * 0.32, L], [-w * 0.32, L]], 2.2, 0.3);
    pet.translate(0, 0, 0); pet.rotateX(-1.25); pet.rotateY(a + PI);
    W0.add(pet, m.beam, [Math.sin(a) * (RO + 1), RY + 0.5, CZ + Math.cos(a) * (RO + 1)]);
    W0.add(sphere(0.6, 8, 6), m.beaconR, [Math.sin(a) * (RO + 14), RY + 37, CZ + Math.cos(a) * (RO + 14)]);
  }
  for (let i = 0; i < 48; i++) { const a = i / 48 * PI * 2; W0.add(sphere(0.35, 8, 6), m.beaconR, [Math.sin(a) * (RO - 1), RY + 1.2, CZ + Math.cos(a) * (RO - 1)]); }
  }
  // suspended ring-light rigs (like the halo rig in the film)
  const ringLights = opts.roof ? [[-46, 112 - heightDrop, 26, 9], [46, 112 - heightDrop, 26, 9]] : [[-46, 112, 26, 9], [52, 100, -22, 7.5]];
  env.ringLights = ringLights;
  for (const [x, y, z, R] of ringLights) {
    W0.add(torus(R, 0.7, 8, 64), m.beam, [x, y, z], [PI / 2, 0, 0]);
    for (let k = 0; k < 20; k++) { const a = k / 20 * PI * 2; W0.add(cbox(1.6, 0.4, 1.0, 0.05), m.floodF, [x + Math.cos(a) * R, y - 0.7, z + Math.sin(a) * R]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * PI * 2 + 0.4; W0.add(cyl(0.08, 0.08, RY - y, 6), m.dark, [x + Math.cos(a) * R, (RY + y) / 2, z + Math.sin(a) * R]); }
  }
  const wallMesh = W0.build(); scene.add(wallMesh);
  wallMesh.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  const sStatic = S.build(); scene.add(sStatic);
  sStatic.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  const pStatic = peopleBatch(P); scene.add(pStatic);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0x2a3a58, 0x0b0b0d, 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb4c4ff, 1.25);
  moon.position.set(-30, 260, 60); moon.target.position.set(0, 36, 0);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 90, bottom: -40, near: 10, far: 400 });
  moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.04;
  scene.add(moon, moon.target);
  const rim = new THREE.DirectionalLight(0x5fa8ff, 0.7); rim.position.set(40, 90, -160); rim.target.position.set(0, 40, 0); scene.add(rim, rim.target);
  env.lights = { hemi, moon, rim };

  const spot = (pos, tgt, color, inten, angle, shadow = false) => {
    const sp = new THREE.SpotLight(color, inten, 260, angle, 0.55, 2);
    sp.position.set(...pos); sp.target.position.set(...tgt);
    if (shadow) { sp.castShadow = true; sp.shadow.mapSize.set(512, 512); sp.shadow.bias = -0.0003; sp.shadow.camera.near = 2; sp.shadow.camera.far = 260; }
    scene.add(sp, sp.target); env.spots.push(sp);
    return sp;
  };
  const chestW = new V3(); J.anchors.reactor.getWorldPosition(chestW);
  spot([-(TX - 3), TH + 1.2, TZ + 10], [-2, chestW.y + 4, 2], 0xffd2a0, 16000, 0.36, true);
  spot([(TX - 3), TH + 1.2, TZ - 10], [4, chestW.y - 6, -2], 0xc8dcff, 6500, 0.34, false);
  spot([-40, 1.5, 58], [-4, 40, 0], 0x9fc4ff, 14000, 0.22, false);
  spot([46, 1.5, 44], [6, 52, 0], 0xffbe80, 22000, 0.22, true);
  env.observation.forEach((side, i) => { const sp = env.spots[i]; sp.position.y += side.baseY; sp.userData.mobileBase = sp.position.clone(); });
  env.beamDefs = env.spots.map(sp => ({ from: sp.position.clone(), to: sp.target.position.clone(), angle: sp.angle, color: sp.color.clone() }));

  // ---- storm sky + Jumphawk squadron hovering over the opened dome ----
  env.sky = skyDome(scene);
  env.helis = []; env.heliBeams = [];
  const hr = rng(404);
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * PI * 2 + hr() * 0.3, r = 14 + hr() * 50;
    const h = jumphawk(m);
    h.g.position.set(Math.sin(a) * r * 1.3, 300 + hr() * 90 - heightDrop, CZ + Math.cos(a) * r * 1.3);
    h.g.rotation.y = hr() * PI * 2;
    scene.add(h.g);
    env.helis.push({ ...h, base: h.g.position.clone(), ph: hr() * 10 });
    if (i % 3 === 0) env.heliBeams.push({ heli: env.helis[env.helis.length - 1], to: new V3((hr() - 0.5) * 30, 40 + hr() * 30, (hr() - 0.5) * 20) });
  }
  env.flash = 0; env.nextFlash = 4;
  // light shafts: moonlight pouring through the dome opening + backlights over the blast door
  env.extraBeams = [
    { from: new V3(-8, 186 - heightDrop, CZ + 6), to: new V3(-2, 60, CZ + 2), angle: 0.2, color: 0x9fb8e8, strength: 1.4 },
    { from: new V3(22, 186 - heightDrop, CZ - 14), to: new V3(16, 0, CZ - 4), angle: 0.07, color: 0xbcd0ff, strength: 1.8 },
    { from: new V3(-26, 186 - heightDrop, CZ - 6), to: new V3(-30, 0, CZ + 10), angle: 0.06, color: 0xbcd0ff, strength: 1.6 },
  ];
  const dzb = CZ - RW + 13;
  for (const x of [-30, -10, 10, 30]) {
    const from = new V3(x, 124, dzb);
    env.extraBeams.push({ from, to: new V3(x * 0.4, 30, 60), angle: 0.07, color: 0xffe4c0, strength: 1.1 });
    const lb = new Batch(); lb.add(cbox(3, 2, 1.6, 0.2), m.dark, [0, 0, -0.6]); lb.add(cbox(2.6, 1.6, 0.1, 0.02), m.floodF, [0, 0, 0.25]);
    const lg = lb.build(); lg.position.copy(from); lg.lookAt(new V3(x * 0.4, 30, 60)); scene.add(lg);
  }
  const back = new THREE.SpotLight(0xffd8b0, 30000, 300, 0.42, 0.6, 2);
  back.position.set(0, 124, dzb); back.target.position.set(0, 55, 10); scene.add(back, back.target);
  env.fogColor = fogColor;
  return env;
}


// ================= LIFT TOWER =================
// A lattice elevator tower in front of the Jaeger. The cage rides two guide rails on the tower face,
// balanced by a counterweight on the back face; a three-stage telescoping bridge reaches the armor.
function buildLift(scene, m, pm, J, { lamp, deckY, liftBase }) {
  if (liftBase) { m = { ...m, led: m.led.clone(), floodF: m.floodF.clone(), headlight: m.headlight.clone() };
    m.led.emissiveIntensity = 1.1; m.floodF.emissiveIntensity = 3.0; m.headlight.emissiveIntensity = 1.5; }
  const Wp = n => { const v = new V3(); J.anchors[n].getWorldPosition(v); return v; };
  const Jp = n => { const v = new V3(); J.joints[n].getWorldPosition(v); return v; };
  const HW = 4.2, TZ = lamp.z + 30, H = deckY + 21, front = TZ - HW;
  const reactor = Wp('reactor'), waist = Jp('waist');
  const root = new THREE.Group(); root.name = 'mobileLiftTower';
  const crawler = liftBase ? liftBase(m, TZ) : null, baseY = crawler ? crawler.deckY : 0;
  if (crawler) root.add(crawler.group);
  const stops = [
    { id: 'ground', cn: '地面', en: 'GROUND', y: crawler ? baseY + 2.1 : 0.7, z: null },
    { id: 'waist', cn: '腰部', en: 'WAIST', y: Math.round(waist.y + 3.2), z: 5.6 },
    { id: 'chest', cn: '胸部', en: 'CHEST', y: Math.round(reactor.y - 4.5), z: 9.4 },
    { id: 'head', cn: '头部', en: 'HEAD', y: deckY, z: lamp.z + 3.6 },
  ];
  // ---------- static tower ----------
  const T = new Batch();
  if (!crawler) T.add(cbox(13, 1.0, 13, 0.15), m.concrete, [0, 0.5, TZ]);
  for (const x of [-HW, HW]) for (const z of [TZ - HW, TZ + HW]) T.add(cbox(0.9, H - baseY, 0.9, 0.08), m.beam, [x, (H + baseY) / 2, z]);
  for (let y = 4.5; y < H; y += 4.5) {
    for (const z of [TZ - HW, TZ + HW]) T.add(cbox(HW * 2, 0.45, 0.45, 0.04), m.beam, [0, y, z]);
    for (const x of [-HW, HW]) T.add(cbox(0.45, 0.45, HW * 2, 0.04), m.beam, [x, y, TZ]);
    const low = Math.max(baseY, y - 4.5), rise = y - low;
    const L = Math.hypot(HW * 2, rise), a = Math.atan2(rise, HW * 2);
    for (const sg of [-1, 1]) {
      for (const x of [-HW, HW]) { const g = cbox(0.22, 0.22, L, 0.02); g.rotateX(sg * a); T.add(g, m.steel, [x, (y + low) / 2, TZ]); }
      const g = cbox(L, 0.22, 0.22, 0.02); g.rotateZ(sg * a); T.add(g, m.steel, [0, (y + low) / 2, TZ + HW]);
    }
    T.add(cbox(0.6, 0.1, 0.1, 0.0), m.led, [-HW - 0.5, y, TZ - HW]);
  }
  // guide rails + gear rack on the front face
  for (const x of [-2.7, 2.7]) {
    T.add(cbox(0.36, H - baseY, 0.36, 0.03), m.chromeE, [x, (H + baseY) / 2, front - 0.55]);
    for (let y = baseY + 1; y < H; y += 3) T.add(cbox(0.6, 0.25, 0.7, 0.02), m.dark, [x, y, front - 0.2]);
  }
  T.add(cbox(0.3, H - baseY, 0.14, 0.02), m.brassE, [0, (H + baseY) / 2, front - 0.45]);
  for (let y = baseY + 0.2; y < H; y += 0.5) T.add(cbox(0.42, 0.12, 0.1, 0.0), m.brassE, [0, y, front - 0.55]);
  // counterweight rails (back face) + internal ladder
  for (const x of [-1.8, 1.8]) T.add(cbox(0.28, H - baseY, 0.28, 0.03), m.steel, [x, (H + baseY) / 2, TZ + HW + 0.5]);
  for (const x of [-0.3, 0.3]) T.add(cbox(0.06, H - baseY - 2, 0.06, 0.01), m.rail, [HW - 0.5 + x, (H + baseY) / 2, TZ + 1]);
  for (let y = baseY + 0.3; y < H - 2; y += 0.32) T.add(cyl(0.025, 0.025, 0.6, 5), m.steel, [HW - 0.5, y, TZ + 1], [0, 0, PI / 2]);
  // machine house on top
  T.add(cbox(10, 0.6, 10, 0.1), m.grate, [0, H, TZ]);
  T.add(cbox(6.4, 3.6, 6.0, 0.25), m.dark, [0, H + 2.1, TZ + 1.2]);
  T.add(cbox(6.0, 0.8, 0.1, 0.02), m.screenC, [0, H + 2.6, TZ - 1.86]);
  for (const x of [-1.5, 1.5]) T.add(cyl(0.9, 0.9, 2.4, 20), m.yellow, [x, H + 1.4, TZ + 3.6], [0, 0, PI / 2]);
  railing(T, m, [-5, H, TZ - 5], [5, H, TZ - 5]); railing(T, m, [-5, H, TZ + 5], [5, H, TZ + 5]);
  railing(T, m, [-5, H, TZ - 5], [-5, H, TZ + 5]); railing(T, m, [5, H, TZ - 5], [5, H, TZ + 5]);
  for (const x of [-5, 5]) for (const z of [TZ - 5, TZ + 5]) { T.add(cbox(0.3, 0.4, 0.3, 0.04), m.dark, [x, H + 1.4, z]); T.add(sphere(0.3, 10, 8), m.beaconR, [x, H + 1.8, z]); }
  // floodlights aimed at the Jaeger
  for (const x of [-3.5, 3.5]) { T.add(cbox(2.0, 1.4, 1.0, 0.15), m.dark, [x, H + 0.9, TZ - 4.6], [0.35, 0, 0]); T.add(cbox(1.8, 1.1, 0.08, 0.02), m.floodF, [x, H + 0.8, TZ - 5.15], [0.35, 0, 0]); }
  const tower = T.build(); root.add(tower);
  // sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshStandardMaterial({
    map: textTex([{ t: '升降塔 03-A', size: 92, y: 80, color: '#141414' }, { t: 'LIFT · MAX 12 PERSONS · 4 T', size: 46, y: 176, font: FONT_EN, color: '#141414', spacing: 4 }], 1024, 384, { wear: 0.4, seed: 71 }),
    color: 0xd29a12, roughness: 0.6 }));
  sign.position.set(0, H - 3, TZ + HW + 0.55); sign.rotation.y = 0; root.add(sign);
  const sheaves = new THREE.Group(); sheaves.position.set(0, H + 4.4, front - 3.0); root.add(sheaves);
  { const b = new Batch(); for (const x of [-1.3, 1.3]) { b.add(ring(0.35, 1.3, 0.45, 32), m.steel, [x, 0, 0], [0, 0, PI / 2]); } b.add(cyl(0.2, 0.2, 3.2, 10), m.dark, [0, 0, 0], [0, 0, PI / 2]); sheaves.add(b.build()); }
  { const b = new Batch(); for (const x of [-2.4, 2.4]) b.add(cbox(0.5, 1.0, 3.4, 0.05), m.dark, [x, H + 4.2, front - 2.2]); const g = b.build(); root.add(g); }

  // ---------- counterweight ----------
  const cw = new THREE.Group(); root.add(cw);
  { const b = new Batch(); b.add(cbox(3.2, 6, 1.2, 0.1), m.dark, [0, 0, 0]); b.add(cbox(3.3, 0.5, 1.3, 0.05), m.yellow, [0, 2.2, 0]); b.add(cbox(3.3, 0.5, 1.3, 0.05), m.yellow, [0, -2.2, 0]); cw.add(b.build()); }
  cw.position.set(0, 0, TZ + HW + 1.4);

  // ---------- cage ----------
  const cage = new THREE.Group(); root.add(cage);
  const CW = 8.4, CD = 6.8, cz = front - 0.4 - CD / 2, F = cz - CD / 2;
  const C = new Batch();
  C.add(deckGeometry(cbox(CW, 0.36, CD, 0.04), m), m.deck || m.grate, [0, -0.18, cz]);
  C.add(cbox(CW, 0.7, 0.4, 0.05), m.beam, [0, -0.7, F + 0.2]);
  C.add(cbox(CW, 0.7, 0.4, 0.05), m.beam, [0, -0.7, cz + CD / 2 - 0.2]);
  for (const x of [-CW / 2 + 0.2, CW / 2 - 0.2]) C.add(cbox(0.4, 0.7, CD, 0.05), m.beam, [x, -0.7, cz]);
  for (const x of [-1.4, 1.4]) { const g = cbox(0.25, 0.25, CD * 1.1, 0.02); g.rotateX(0.18); C.add(g, m.steel, [x, -1.2, cz]); }
  // toe boards (yellow) and railings on three sides; front gate posts
  C.add(cbox(CW, 0.25, 0.06, 0.0), m.yellow, [0, 0.12, cz + CD / 2 - 0.05]);
  for (const x of [-CW / 2, CW / 2]) C.add(cbox(0.06, 0.25, CD, 0.0), m.yellow, [x, 0.12, cz]);
  railing(C, m, [-CW / 2, 0, cz + CD / 2], [CW / 2, 0, cz + CD / 2]);
  railing(C, m, [-CW / 2, 0, F], [-CW / 2, 0, cz + CD / 2]); railing(C, m, [CW / 2, 0, F], [CW / 2, 0, cz + CD / 2]);
  railing(C, m, [-CW / 2, 0, F], [-1.9, 0, F]); railing(C, m, [1.9, 0, F], [CW / 2, 0, F]);
  // cage frame + roof with lights
  for (const x of [-CW / 2, CW / 2]) for (const z of [F, cz + CD / 2]) C.add(cbox(0.22, 3.4, 0.22, 0.02), m.yellow, [x, 1.7, z]);
  for (const z of [F, cz + CD / 2]) C.add(cbox(CW, 0.25, 0.25, 0.02), m.yellow, [0, 3.4, z]);
  for (const x of [-CW / 2, CW / 2]) C.add(cbox(0.25, 0.25, CD, 0.02), m.yellow, [x, 3.4, cz]);
  for (const x of [-2, 0, 2]) C.add(cbox(0.18, 0.18, CD, 0.02), m.beam, [x, 3.45, cz]);
  for (const x of [-2, 2]) C.add(cbox(0.25, 0.08, CD - 1, 0.0), m.led, [x, 3.3, cz]);
  C.add(cbox(1.6, 0.35, 1.0, 0.05), m.dark, [0, 3.7, cz + 0.6]);
  // carriage + rollers on the guide rails
  C.add(cbox(6.6, 4.4, 0.7, 0.1), m.beam, [0, 1.6, front - 0.05 - 0.35 - 0.2]);
  for (const x of [-2.7, 2.7]) for (const y of [0.0, 3.4]) { C.add(cyl(0.32, 0.32, 0.5, 14), m.dark, [x + (x > 0 ? -0.42 : 0.42), y, front - 0.55], [0, 0, PI / 2]); }
  C.add(cbox(1.1, 1.3, 0.6, 0.08), m.dark, [0, 0.6, front - 0.75]);
  // operator console + screens
  C.add(cbox(1.5, 1.05, 0.8, 0.08), m.dark, [-2.8, 0.52, cz + 1.9]);
  C.add(cbox(1.3, 0.55, 0.05, 0.01), m.screenG, [-2.8, 1.22, cz + 1.55], [0.55, 0, 0]);
  C.add(cbox(1.5, 1.05, 0.8, 0.08), m.dark, [2.8, 0.52, cz + 1.9]);
  C.add(cbox(1.3, 0.55, 0.05, 0.01), m.screenC, [2.8, 1.22, cz + 1.55], [0.55, 0, 0]);
  C.add(cbox(0.5, 0.25, 0.5, 0.04), m.yellow, [-2.4, 1.1, cz + 1.7]);
  // gear crates / equipment on the deck
  C.add(cbox(1.2, 0.8, 0.9, 0.06), m.yellow, [3.2, 0.4, cz - 1.8]);
  C.add(cyl(0.5, 0.5, 1.0, 14), m.dark, [-3.2, 0.5, cz - 2.0]);
  cage.add(C.build());
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), m.beacon.clone()); beacon.position.set(-CW / 2, 3.75, F); cage.add(beacon);
  const beacon2 = beacon.clone(); beacon2.position.x = CW / 2; cage.add(beacon2);
  const CP = new Batch();
  personInto(CP, pm, -3.3, 0, cz - 0.6, PI + 0.5, 'stand', 81);
  personInto(CP, pm, 3.4, 0, cz - (crawler ? .2 : 2.4), PI - 0.3, 'look', 82);
  personInto(CP, pm, -2.4, 0, cz + (crawler ? .7 : -2.9), PI, 'rail', 83);
  cage.add(peopleBatch(CP));

  // ---------- telescoping bridge (3 nested stages) ----------
  const Ls = 7.8, secs = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(); cage.add(g);
    const b = new Batch(), w = 3.6 - k * 0.3, y = -0.45 - k * 0.14;
    b.add(deckGeometry(cbox(w, 0.22, Ls, 0.03), m), m.deck || m.grate, [0, y - 0.11, -Ls / 2]);
    for (const x of [-w / 2, w / 2]) { b.add(cbox(0.2, 0.6, Ls, 0.03), m.beam, [x, y - 0.45, -Ls / 2]); b.add(cbox(0.06, 0.06, Ls, 0.0), m.led, [x, y - 0.1, -Ls / 2]); }
    for (let z = -0.6; z > -Ls; z -= 1.3) { const t = cbox(w, 0.12, 0.12, 0.0); b.add(t, m.steel, [0, y - 0.55, z]); }
    railing(b, m, [-w / 2 + 0.05, y, -0.1], [-w / 2 + 0.05, y, -Ls + 0.1]);
    railing(b, m, [w / 2 - 0.05, y, -0.1], [w / 2 - 0.05, y, -Ls + 0.1]);
    if (k === 2) {
      b.add(cbox(w + 0.6, 0.5, 0.8, 0.08), m.yellow, [0, y - 0.25, -Ls - 0.3]);
      b.add(cbox(w + 0.4, 0.08, 0.1, 0.0), m.led, [0, y + 0.05, -Ls - 0.72]);
      for (const x of [-0.75, 0.75]) {
        const px = crawler ? -1.08 : x, pz = -Ls + 1.3 + (crawler && x > 0 ? 1.4 : 0);
        b.add(cbox(crawler ? .5 : .8, 1.0, 0.55, 0.06), m.dark, [px, y + 0.5, pz]);
        b.add(cbox(crawler ? .46 : .7, 0.45, 0.05, 0.01), x < 0 ? m.screenC : m.screenG, [px, y + 1.12, pz - .18], [0.5, 0, 0]);
      }
      if (!crawler) personInto(b, pm, -.9, y, -Ls + .9, PI, 'rail', 91);
      if (!crawler) personInto(b, pm, .75, y, -Ls + .7, PI, 'look', 92);
      if (!crawler) personInto(b, pm, .1, y, -Ls + 2.6, PI + .3, 'point', 93);
    }
    g.add(b.build()); secs.push(g);
  }
  // hoist ropes
  const ropes = [];
  for (const x of [-1.3, 1.3]) {
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true); geo.translate(0, 0.5, 0);
    const r = new THREE.Mesh(geo, m.dark); r.position.set(x, 0, front - 3.0); root.add(r); ropes.push(r);
  }
  const cwr = []; for (const x of [-0.8, 0.8]) { const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true); geo.translate(0, 0.5, 0); const r = new THREE.Mesh(geo, m.dark); r.position.set(x, 0, TZ + HW + 1.4); root.add(r); cwr.push(r); }

  const extFor = (zt) => {
    if (zt == null) return 0;
    const z0 = F - 0.2, z1 = F + 0.3 - 2 * (Ls - 0.8) - Ls;
    return Math.min(1, Math.max(0, (z0 - zt) / (z0 - z1)));
  };
  for (const st of stops) st.ext = extFor(st.z);
  const lift = { stops, stop: 3, y: stops[3].y, ext: stops[3].ext, phase: 'idle', holdExt: false, H, TZ, front, cz, F, Ls, CW,
    cage, secs, cw, ropes, cwr, sheaves, beacon, beacon2, root, crawler,
    x: 0, targetX: 0, minX: -20, maxX: 20, driveVX: 0, dy: 0, moving: false };
  scene.add(root);
  return lift;
}
export function liftGo(lift, i) {
  if (!lift.stops[i]) return false;
  if (i === lift.stop && lift.phase === 'idle' && Math.abs(lift.x) < 0.005) return false;
  lift.stop = i; lift.targetX = 0;
  lift.phase = lift.ext > 0.001 ? 'retract' : liftTravelPhase(lift);
  return true;
}
const liftTravelPhase = L => Math.abs(L.targetX - L.x) > 0.005 ? 'drive' : 'travel';
export function liftMoveTo(lift, x) {
  if (!lift.crawler || !Number.isFinite(x)) return false;
  lift.targetX = THREE.MathUtils.clamp(x, lift.minX, lift.maxX);
  lift.phase = lift.ext > 0.001 ? 'retract' : liftTravelPhase(lift);
  return true;
}
function updateLift(L, dt, k) {
  if (L.canTravel?.() === false && L.phase !== 'idle') dt = 0;
  const st = L.stops[L.stop];
  const y0 = L.y, x0 = L.x;
  if (L.phase === 'retract') { L.ext = Math.max(0, L.ext - dt * 0.32); if (L.ext <= 0) L.phase = L.holdExt ? 'idle' : liftTravelPhase(L); }
  else if (L.phase === 'drive') {
    const d = L.targetX - L.x, desired = Math.sign(d) * Math.min(1.4, Math.sqrt(1.1 * Math.abs(d)));
    L.driveVX += THREE.MathUtils.clamp(desired - L.driveVX, -0.55 * dt, 0.55 * dt);
    const step = L.driveVX * dt;
    if (Math.abs(d) < 0.005 || (step * d > 0 && Math.abs(step) >= Math.abs(d))) {
      L.x = L.targetX; L.driveVX = 0; L.phase = 'travel';
    } else L.x = THREE.MathUtils.clamp(L.x + step, L.minX, L.maxX);
  }
  else if (L.phase === 'travel') {
    const d = st.y - L.y, v = Math.min(4.2, 0.35 + Math.abs(d) * 0.55);
    L.y += Math.sign(d) * Math.min(Math.abs(d), v * dt);
    if (Math.abs(st.y - L.y) < 0.005) { L.y = st.y; L.phase = st.ext > 0 && !L.holdExt && Math.abs(L.x) < 0.005 ? 'extend' : 'idle'; }
  } else if (L.phase === 'extend') { L.ext = Math.min(st.ext, L.ext + dt * 0.28); if (L.ext >= st.ext) L.phase = 'idle'; }
  L.dy = L.y - y0; L.moving = L.phase !== 'idle';
  L.root.position.x = L.x;
  if (L.x !== x0) L.crawler?.update(L.x);
  const ext = L.ext * (1 - k);
  L.cage.position.y = L.y;
  for (let i = 0; i < 3; i++) {
    const a = L.F + L.Ls - 0.2 + ((L.F + 0.3 - i * (L.Ls - 0.8)) - (L.F + L.Ls - 0.2)) * Math.min(1, ext * (1 + i * 0.0));
    L.secs[i].position.z = a;
  }
  for (const r of L.ropes) { r.position.y = L.y + 3.8; r.scale.y = Math.max(0.1, L.H + 4.4 - (L.y + 3.8)); }
  const cwy = Math.max(3.5, L.H - 4 - L.y);
  L.cw.position.y = cwy;
  for (const r of L.cwr) { r.position.y = cwy + 3; r.scale.y = Math.max(0.1, L.H + 4 - (cwy + 3)); }
  L.sheaves.rotation.x += L.dy / 1.3;
  const blink = L.moving ? (Math.sin(performance.now() * 0.012) > 0 ? 1 : 0.1) : 0.15;
  L.beacon.material.emissiveIntensity = 10 * blink; L.beacon2.material = L.beacon.material;
}

export function updateEnvironment(env, J, t, dt, e) {
  // retract gantry during disassembly (first 12% of timeline)
  const r = Math.min(1, Math.max(0, e / 0.12));
  const k = env.turntable?.needsClearance() ? 1 : r * r * (3 - 2 * r);
  updateLift(env.lift, dt, k);
  env.roof?.update(dt);
  env.visitors?.update(dt);
  env.turntable?.update(dt, env.lift.ext < 0.001 && env.lift.phase === 'idle' && env.lift.stop === 0);
  for (const side of env.observation) side.update(dt);
  env.observation.forEach((side, i) => { const sp = env.spots[i]; sp.position.x = sp.userData.mobileBase.x + side.side * side.state.offset; });
  for (const c of env.cantis) {
    const retract = c.tower && (c.tower.state.offset > 0.001 || c.tower.state.targetOffset > 0.001) ? 1 : k;
    c.g.position.x = c.homeX + c.s * retract * 9;
  }
  // hoist cables follow the pauldron hooks
  const v = new THREE.Vector3(), cableDirection = new THREE.Vector3(), cableDown = new THREE.Vector3(0, -1, 0);
  for (const c of env.cables) {
    J.anchors[c.tag + 'Hook'].getWorldPosition(v);
    if (c.mesh) {
      cableDirection.copy(v); cableDirection.y += 2.7; cableDirection.z += c.dz ?? 0; cableDirection.sub(c.top);
      const L = Math.max(0.5, cableDirection.length());
      c.mesh.position.copy(c.top);
      c.mesh.quaternion.setFromUnitVectors(cableDown, cableDirection.normalize());
      c.mesh.scale.set(1, L, 1);
    } else if (c.hook) { c.hook.position.set(v.x, v.y + 0.4, v.z); }
  }
  for (const w of env.walkers) {
    w.t += dt * w.speed; const u = (Math.sin(w.t * PI * 2) + 1) / 2;
    const [a, b] = w.path;
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    const dir = Math.cos(w.t * PI * 2) > 0 ? 1 : -1;
    w.g.position.set(x, Math.abs(Math.sin(t * 7 + w.t * 9)) * 0.04, z);
    w.g.rotation.y = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
  }
  env.sky.uniforms.uTime.value = t;
  // jumphawks hover, rotors spin, strobes blink
  for (const h of env.helis) {
    h.g.position.set(h.base.x + Math.sin(t * 0.21 + h.ph) * 1.6, h.base.y + Math.sin(t * 0.37 + h.ph) * 1.2, h.base.z + Math.cos(t * 0.17 + h.ph) * 1.4);
    h.g.rotation.z = Math.sin(t * 0.3 + h.ph) * 0.03;
    for (const r of h.rotors) r.rotation.y += dt * 24;
    h.strobe.visible = ((t + h.ph) % 1.4) < 0.08;
    h.cable.rotation.x = Math.sin(t * 0.5 + h.ph) * 0.02; h.cable.rotation.z = Math.cos(t * 0.4 + h.ph) * 0.02;
  }
  // lightning: double-pulse flashes lighting the clouds and the bay
  env.nextFlash -= dt;
  if (env.nextFlash <= 0) { env.flashT = 0; env.nextFlash = 7 + Math.random() * 11; env.sky.uniforms.uFlashPos.value.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6); }
  if (env.flashT !== undefined && env.flashT < 1.2) {
    env.flashT += dt; const f = env.flashT;
    env.flash = Math.max(0, Math.exp(-f * 18) * 1.0 + (f > 0.18 ? Math.exp(-(f - 0.18) * 9) * 0.8 : 0)) * (0.7 + Math.random() * 0.3);
  } else env.flash = 0;
  env.sky.uniforms.uFlash.value = env.flash;
  env.lights.moon.intensity = 1.25 + env.flash * 5.0;
}
