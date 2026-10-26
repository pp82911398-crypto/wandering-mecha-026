// Crawler finishing: deck plating, rails, ladders, cab glazing, clamp hoses and track hardware.
import * as THREE from 'three';
import { PI, cbox, cyl, sphere, torus, tube, Batch } from '../src/kit.js';
import { uv, decalMesh, stencilTexture, glowSprite } from './finish.js';

export function dressCrawler(crawler, m, C, feet = []) {
  const b = new Batch();
  const glows = [];

  // ---- diamond-plate deck skin (one flat mesh, the existing deck sits just under it)
  {
    const g = new THREE.PlaneGeometry(C.w - 3.0, C.l - 3.0);
    uv(g, 0.32);
    const top = new THREE.Mesh(g, m.deck);
    top.rotation.x = -PI / 2; top.position.set(0, 4.455, 0);
    top.receiveShadow = true;
    crawler.add(top);
  }

  // ---- edge rails (front half + rear corners; the machine occupies the center)
  for (const sx of [-1, 1]) {
    for (let z = -18; z <= 18; z += 4) {
      b.add(cbox(0.09, 1.15, 0.09, 0.01), m.steelD, [sx * (C.w / 2 - 0.55), 5.05, z]);
      if (z % 8 === 2) b.add(cbox(0.5, 0.08, 0.08, 0.01), m.steelD, [sx * (C.w / 2 - 0.3), 5.55, z]);
    }
    b.add(cbox(0.08, 0.08, 38, 0.01), m.steelD, [sx * (C.w / 2 - 0.55), 5.62, 0]);
    b.add(cbox(0.08, 0.08, 38, 0.01), m.steelD, [sx * (C.w / 2 - 0.55), 5.16, 0]);
    b.add(cbox(0.06, 0.18, 38, 0.01), m.yellow, [sx * (C.w / 2 - 0.62), 4.72, 0]);
    // tie-down rings
    for (let z = -16; z <= 16; z += 4) {
      const t = torus(0.24, 0.055, 5, 10, PI); t.rotateX(PI / 2);
      b.add(t, m.steelD, [sx * (C.w / 2 - 1.25), 4.55, z]);
    }
  }
  // front rail with a gap in the middle for the launch camera
  for (const sx of [-1, 1]) {
    b.add(cbox(9.5, 0.09, 0.09, 0.01), m.steelD, [sx * 9.8, 5.62, C.l / 2 - 0.4]);
    for (const x of [5.2, 8.4, 12.6]) b.add(cbox(0.09, 1.2, 0.09, 0.01), m.steelD, [sx * x, 5.05, C.l / 2 - 0.4]);
  }

  // ---- access ladders at the front corners
  for (const sx of [-1, 1]) {
    const x = sx * (C.w / 2 - 1.0), z = C.l / 2 - 2.4;
    for (const dx of [-0.38, 0.38]) b.add(cyl(0.05, 0.05, 4.4, 6), m.steelD, [x + dx, 2.3, z]);
    for (let y = 0.5; y < 4.4; y += 0.45) {
      const g = cyl(0.032, 0.032, 0.8, 6); g.rotateZ(PI / 2);
      b.add(g, m.steelD, [x, y, z]);
    }
    b.add(cbox(1.0, 0.1, 0.9, 0.02), m.grate, [x, 4.45, z + 0.4]);
  }

  // ---- clamp hydraulics + hoses
  for (const f of feet) {
    const bx = f.box, cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
    for (const s of [-1, 1]) {
      const x = s < 0 ? bx.min.x - 2.4 : bx.max.x + 2.4;
      b.add(cyl(0.22, 0.22, 0.9, 10), m.chrome, [x, 5.6, cz + 1.2], [0.4, 0, 0]);
      b.add(cyl(0.3, 0.3, 0.5, 10), m.dark, [x, 5.1, cz + 1.6]);
      const hose = tube([[x, 5.1, cz + 1.6], [x + s * 0.6, 4.8, cz + 2.6], [x + s * 1.2, 4.7, cz + 3.8], [x + s * 1.0, 4.5, cz + 5.2]], 0.09, 18, 6);
      b.add(hose, m.rubber);
    }
  }

  // ---- tool boxes / extinguisher / cable drum on the deck
  for (const sx of [-1, 1]) {
    b.add(cbox(2.4, 0.9, 1.3, 0.06), m.steelD, [sx * 12.2, 4.9, 12.5]);
    b.add(cbox(2.2, 0.08, 1.1, 0.02), m.dark, [sx * 12.2, 5.38, 12.5]);
    b.add(cbox(2.3, 0.14, 1.25, 0.02), m.yellow, [sx * 12.2, 4.5, 12.5]);
    b.add(cbox(0.16, 0.12, 0.4, 0.01), m.chrome, [sx * 12.2, 5.0, 13.2]);
  }
  b.add(cyl(0.2, 0.22, 0.75, 10), m.red, [13.4, 4.85, -6.5]);
  b.add(cyl(0.08, 0.08, 0.22, 8), m.black, [13.4, 5.3, -6.5]);
  b.add(cyl(0.85, 0.85, 0.6, 14), m.woodDark, [-12.6, 4.95, -2.0], [0, 0, PI / 2]);
  b.add(cyl(1.0, 1.0, 0.1, 14), m.wood, [-12.6, 4.95, -2.3], [0, 0, PI / 2]);

  // ---- control cab details
  {
    const x = -10.5, z = -17.0;
    b.add(cbox(0.2, 0.4, 0.3, 0.02), m.steelD, [x + 0.8, 7.4, z + 2.35]);
    b.add(cbox(0.5, 0.4, 0.16, 0.02), m.dark, [x + 0.8, 6.9, z + 2.38]);
    b.add(cbox(0.9, 0.6, 0.18, 0.02), m.lampWarm, [x - 0.4, 6.9, z - 2.36]);
    b.add(cbox(3.2, 0.3, 0.5, 0.02), m.steelD, [x, 6.0, z + 2.5]);
    for (const dx of [-1.4, 1.4]) b.add(cyl(0.04, 0.04, 0.5, 5), m.dark, [x + dx, 6.4, z + 2.55]);
    b.add(cbox(0.55, 0.06, 0.14, 0.01), m.dark, [x, 6.62, z + 2.56]);
    // mirrors + antenna + work light
    for (const sx of [-1, 1]) {
      b.add(cyl(0.035, 0.035, 1.2, 5), m.steelD, [x + sx * 2.4, 7.0, z + 2.3]);
      b.add(cbox(0.55, 0.35, 0.08, 0.02), m.dark, [x + sx * 2.55, 7.55, z + 2.35]);
    }
    b.add(cyl(0.03, 0.02, 2.6, 5), m.steelD, [x + 1.8, 9.2, z - 1.8]);
    b.add(sphere(0.1, 6, 5), m.ledRed, [x + 1.8, 10.5, z - 1.8]);
    b.add(cbox(0.5, 0.3, 0.25, 0.02), m.lampWarm, [x - 1.9, 7.8, z + 2.2]);
  }

  // ---- track pods: return rollers, bolts, mud flaps, pod stencils
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * 10.5, pz = sz * 10.5;
    for (const z of [-5.4, -1.8, 1.8, 5.4]) {
      b.add(cyl(0.34, 0.34, 0.5, 10), m.dark, [px + sx * 3.85, 2.55, pz + z], [0, 0, PI / 2]);
      b.add(cyl(0.15, 0.15, 0.52, 8), m.steel, [px + sx * 3.88, 2.55, pz + z], [0, 0, PI / 2]);
    }
    // tensioner + bolts along the side frame
    b.add(cyl(0.38, 0.38, 0.55, 10), m.steelD, [px + sx * 3.8, 1.25, pz + sz * 6.6], [0, 0, PI / 2]);
    b.add(cbox(0.4, 0.5, 0.9, 0.03), m.dark, [px + sx * 3.9, 1.3, pz + sz * 5.6]);
    for (let i = 0; i < 9; i++) b.add(cyl(0.075, 0.075, 0.1, 6), m.steel, [px + sx * 3.78, 2.0, pz - 6.4 + i * 1.6], [0, 0, PI / 2]);
    // mud flap with hazard bar
    b.add(cbox(0.15, 1.0, 2.2, 0.03), m.rubber, [px + sx * 3.7, 0.95, pz + sz * 8.2]);
    b.add(cbox(0.18, 0.16, 2.2, 0.02), m.yellow, [px + sx * 3.72, 1.5, pz + sz * 8.2]);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), new THREE.MeshStandardMaterial({
      map: stencilTexture(sz < 0 ? '02' : '01', { size: 340, color: 'rgba(226,222,206,0.33)', w: 512, h: 512 }),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1.2,
    }));
    num.position.set(px + sx * 3.79, 1.0, pz);
    num.rotation.y = sx > 0 ? PI / 2 : -PI / 2;
    crawler.add(num);
  }

  // ---- deck stencils
  for (const [x, z, text, w, h] of [[0, 4.4, '026', 7, 7], [0, -8.2, 'MAX LOAD 2600 T', 10, 2.4], [0, 16.2, 'KEEP CLEAR', 9, 1.6]]) {
    const d = decalMesh(stencilTexture(text, { size: text.length > 6 ? 78 : 300, color: 'rgba(226,222,206,0.36)', w: 1024, h: 256 }), w, h, { opacity: 0.9 });
    d.rotation.x = -PI / 2; d.position.set(x, 4.47, z); crawler.add(d);
  }

  // ---- headlight / beacon glow
  for (const sx of [-9.5, 9.5]) {
    const g = glowSprite(0xffe4b4, 5.2, 0.5); g.position.set(sx, 5.5, 21.3); crawler.add(g); glows.push(g);
    const r = glowSprite(0xff3322, 2.2, 0.55); r.position.set(sx, 6.2, 20.8); crawler.add(r); glows.push(r);
  }
  const cabGlow = glowSprite(0xffdca8, 3.2, 0.35); cabGlow.position.set(-10.5, 6.9, -14.5); crawler.add(cabGlow); glows.push(cabGlow);

  crawler.add(b.build());
  return { glows };
}
