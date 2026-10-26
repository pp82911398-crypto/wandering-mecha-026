// Gate face dressing + door-leaf hardware + hangar atmosphere.
// Kept separate from hangar.js so the structural pass stays readable; all of this is static
// geometry merged by material, decals and light glow sprites are the only extra draw calls.
import * as THREE from 'three';
import { PI, cbox, cyl, ring, sphere, torus, tube, Batch } from '../src/kit.js';
import { uv, decalMesh, stencilTexture, signBoard, glowSprite, lightShaft, makeDust } from './finish.js';

const V3 = THREE.Vector3;

function panel(b, mat, w, h, d, x, y, z, u = 0) {
  const g = cbox(w, h, d, 0.04);
  b.add(u ? uv(g, u) : g, mat, [x, y, z]);
}
function signMesh(tex, w, h, x, y, z, rotY = 0, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.75, metalness: 0.1, side: THREE.FrontSide,
    transparent: !!opts.transparent, depthWrite: !opts.transparent,
    polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z); mesh.rotation.y = rotY;
  return mesh;
}

// ============================================================================
// outside face: conduits, CCTV, floodlights, ladder, barriers, control booth
// ============================================================================
export function dressGate(root, m, G) {
  const gx = G.cx, zf = G.frameFront, ow = G.w / 2, fw = G.frameW;
  const b = new Batch();
  const glows = [];

  // ---- service conduits down both pilasters
  for (const s of [-1, 1]) {
    const x = gx + s * (ow + fw - 1.1);
    for (const [dx, r] of [[-0.7, 0.14], [0.7, 0.2], [1.3, 0.1]]) {
      b.add(cyl(r, r, 31, 8), m.steelD, [x + dx, 15.5, zf + 0.75]);
      b.add(cyl(r, r, 30.4, 8), m.steelD, [x + dx, 15.7, zf + 0.2]);
    }
    for (const y of [3, 9.5, 16, 22.5, 29]) {
      b.add(cbox(3.0, 0.16, 0.9, 0.02), m.steelD, [x + 0.3, y, zf + 0.72]);
      b.add(cbox(0.14, 0.7, 0.14, 0.02), m.steelD, [x - 1.0, y + 0.35, zf + 0.7]);
    }
    // junction boxes + isolators
    for (const y of [6.2, 18.4, 27.6]) {
      b.add(cbox(1.5, 1.9, 0.8, 0.06), m.dark, [x + 1.5, y, zf + 0.85]);
      b.add(cbox(0.3, 0.5, 0.12, 0.02), m.steelD, [x + 1.5, y + 0.3, zf + 1.28]);
      b.add(cbox(0.1, 0.3, 0.1, 0.01), m.ledAmber, [x + 1.5, y - 0.55, zf + 1.27]);
    }
    // cable tray stub into the rock
    b.add(cbox(2.2, 0.2, 3.4, 0.02), m.grate, [x + 0.6, 31.2, zf - 1.2]);
  }

  // ---- CCTV cameras on the frame
  for (const [sx, yy] of [[-1, 54], [1, 52.5]]) {
    const x = gx + sx * (ow + 2.2);
    b.add(cbox(0.5, 0.5, 1.2, 0.04), m.steelD, [x, yy, zf + 0.9]);
    b.add(cbox(0.9, 0.9, 1.6, 0.06), m.dark, [x, yy, zf + 1.9]);
    b.add(cyl(0.32, 0.36, 0.5, 12), m.black, [x, yy, zf + 2.75], [PI / 2, 0, 0]);
    b.add(cyl(0.18, 0.18, 0.06, 10), m.glass, [x, yy, zf + 3.0], [PI / 2, 0, 0]);
    b.add(cbox(0.2, 0.5, 0.2, 0.02), m.steelD, [x, yy + 0.55, zf + 1.2]);
  }

  // ---- four floodlights on the lintel, aimed down the apron
  for (const dx of [-18, -6, 12, 24]) {
    const x = gx + dx, y = 63.6, z = zf + 1.15;
    b.add(cbox(2.4, 0.9, 1.8, 0.08), m.lampHousing, [x, y, z]);
    b.add(cbox(2.0, 0.55, 0.3, 0.04), m.dark, [x, y, z + 0.9]);
    b.add(cbox(1.8, 0.38, 0.1, 0.02), m.lampWarm, [x, y, z + 1.08]);
    b.add(cbox(0.25, 1.2, 0.25, 0.02), m.steelD, [x, y + 0.9, z - 0.2]);
    b.add(cbox(0.3, 1.6, 0.16, 0.02), m.steelD, [x + 0.9, y + 0.6, z - 0.4], [0, 0, -0.25]);
    const g = glowSprite(0xffd9a4, 11, 0.55); g.position.set(x, y - 0.3, z + 1.4); root.add(g); glows.push(g);
  }

  // ---- access ladder up the right pilaster
  {
    const lx = gx + ow + fw - 3.0;
    for (const dz of [-0.42, 0.42]) panel(b, m.steelD, 0.1, 30, 0.12, lx, 15, zf + 2.3 + dz);
    for (let y = 1; y < 30; y += 0.55) b.add(cyl(0.045, 0.045, 0.9, 6), m.steelD, [lx, y, zf + 2.3], [PI / 2, 0, 0]);
    for (let y = 6; y < 30; y += 3.2) b.add(cbox(0.9, 0.08, 0.08, 0.01), m.steelD, [lx + 0.4, y, zf + 2.3]);
    b.add(cbox(1.6, 0.15, 2.2, 0.03), m.grate, [lx, 30.1, zf + 1.8]);
  }

  // ---- bollards + chains (outside the crawler lane)
  for (const x of [-24, -14.5, 22.5, 32, -34, 42]) {
    if (Math.abs(x - gx) > 30) continue;
    panel(b, m.steelD, 0.5, 1.4, 0.5, x, 0.7, zf + 4.2);
    panel(b, m.yellow, 0.56, 0.2, 0.56, x, 1.3, zf + 4.2);
    b.add(sphere(0.26, 8, 6), m.steelD, [x, 1.5, zf + 4.2]);
  }
  // chain loops between the inner pair
  for (const [x0, x1] of [[-14.5, -24], [22.5, 32]]) {
    for (let i = 0; i < 8; i++) {
      const t0 = i / 8, t1 = (i + 1) / 8;
      const p0 = [x0 + (x1 - x0) * t0, 1.25 - Math.sin(t0 * PI) * 0.22, zf + 4.2];
      const p1 = [x0 + (x1 - x0) * t1, 1.25 - Math.sin(t1 * PI) * 0.22, zf + 4.2];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      b.add(cbox(len, 0.09, 0.09, 0.01), m.steelD, mid, [0, 0, Math.atan2(p1[1] - p0[1], p1[0] - p0[0])]);
    }
  }

  // ---- jersey barriers either side of the apron
  for (const x of [-31, 40]) {
    for (let z = -138; z < -118; z += 6.2) {
      b.add(cbox(1.1, 1.0, 5.8, 0.12), m.concreteMid, [x, 0.5, z]);
      b.add(cbox(0.8, 0.5, 5.8, 0.1), m.concreteMid, [x, 1.15, z]);
      b.add(cbox(0.12, 0.14, 5.6, 0.01), m.yellow, [x - 0.42, 1.02, z]);
    }
  }

  // ---- guard booth, right of the gate
  {
    const bx = 37, bz = -124;
    b.add(cbox(5.4, 0.6, 5.0, 0.16), m.concrete, [bx, 0.3, bz]);
    b.add(cbox(4.6, 3.2, 4.2, 0.14), m.concreteMid, [bx, 2.2, bz]);
    b.add(cbox(4.7, 0.35, 4.3, 0.08), m.steelD, [bx, 3.95, bz]);
    b.add(cbox(3.2, 1.5, 0.16, 0.04), m.glassLit, [bx, 2.6, bz + 2.12]);
    b.add(cbox(0.16, 1.5, 2.6, 0.04), m.glassLit, [bx + 2.3, 2.6, bz]);
    b.add(cbox(0.5, 2.0, 0.1, 0.02), m.steelD, [bx - 1.5, 1.6, bz + 2.14]);
    b.add(cbox(0.12, 0.5, 0.12, 0.01), m.chrome, [bx + 1.9, 2.1, bz + 2.3]);
    // roof gear
    b.add(cbox(1.2, 0.5, 1.0, 0.05), m.dark, [bx - 1.2, 4.4, bz - 0.8]);
    b.add(cyl(0.06, 0.05, 4.2, 6), m.steelD, [bx + 1.6, 6.2, bz - 1.2]);
    b.add(sphere(0.14, 6, 5), m.ledRed, [bx + 1.6, 8.35, bz - 1.2]);
    b.add(cbox(0.7, 0.06, 0.7, 0.01), m.dark, [bx, 4.14, bz]);
    // inside warm light + spill
    const gl = glowSprite(0xffd8a0, 4.5, 0.4); gl.position.set(bx, 2.7, bz + 2.4); root.add(gl); glows.push(gl);
    // step + railing
    b.add(cbox(2.4, 0.22, 1.2, 0.03), m.grate, [bx - 0.2, 0.4, bz + 2.9]);
    for (const dx of [-1.1, 1.1]) panel(b, m.steelD, 0.08, 1.1, 0.08, bx + dx, 1.0, bz + 2.9);
    panel(b, m.steelD, 2.3, 0.08, 0.08, bx, 1.5, bz + 2.9);
    root.add(signMesh(signBoard('CHECKPOINT', 'BAY 04 ACCESS', { size: 104, subSize: 46 }), 4.2, 1.6, bx, 5.1, bz + 2.4));
  }

  // ---- generator trailer, left of the gate
  {
    const gx0 = -27, gz = -123;
    b.add(cbox(7.0, 0.35, 3.4, 0.06), m.steelD, [gx0, 0.85, gz]);
    b.add(cbox(6.2, 2.2, 2.8, 0.18), m.olive, [gx0 - 0.2, 2.2, gz]);
    b.add(cbox(5.6, 0.22, 2.4, 0.04), m.steelD, [gx0 - 0.2, 3.4, gz]);
    b.add(cyl(0.18, 0.18, 2.2, 8), m.chrome, [gx0 - 2.3, 3.7, gz - 0.7]);
    for (const dx of [-2.4, 2.4]) for (const dz of [-1.6, 1.6]) {
      b.add(cyl(0.35, 0.35, 0.35, 10), m.rubber, [gx0 + dx, 0.5, gz + dz], [0, 0, PI / 2]);
    }
    b.add(cbox(0.9, 0.7, 0.9, 0.05), m.dark, [gx0 + 3.2, 1.1, gz + 0.7]);
    // cable reel feeding the gate
    b.add(cyl(1.0, 1.0, 0.9, 14), m.steelD, [gx0 + 4.4, 0.95, gz - 0.8], [0, 0, PI / 2]);
    b.add(cyl(1.1, 1.1, 0.12, 14), m.woodDark, [gx0 + 4.4, 0.95, gz - 1.3], [0, 0, PI / 2]);
    b.add(cyl(1.1, 1.1, 0.12, 14), m.woodDark, [gx0 + 4.4, 0.95, gz - 0.3], [0, 0, PI / 2]);
  }

  // ---- traffic signal next to the opening
  {
    const sx = -20.5, sz = -132.5;
    b.add(cyl(0.16, 0.2, 7.4, 10), m.steelD, [sx, 3.7, sz]);
    b.add(cbox(0.6, 0.4, 0.6, 0.04), m.concreteD, [sx, 0.2, sz]);
    b.add(cbox(1.1, 2.6, 0.8, 0.06), m.dark, [sx, 7.0, sz + 0.1]);
    b.add(cbox(0.7, 0.7, 0.22, 0.02), m.black, [sx, 7.7, sz + 0.52]);
    b.add(cbox(0.7, 0.7, 0.22, 0.02), m.black, [sx, 6.3, sz + 0.52]);
    const red = m.ledRed.clone(); red.emissiveIntensity = 0.35;
    const grn = m.ledGreen.clone(); grn.emissiveIntensity = 3.0;
    b.add(cyl(0.24, 0.24, 0.08, 12), red, [sx, 7.7, sz + 0.64], [PI / 2, 0, 0]);
    b.add(cyl(0.24, 0.24, 0.08, 12), grn, [sx, 6.3, sz + 0.64], [PI / 2, 0, 0]);
    root.userData.signal = { red, grn };
    // hoods
    for (const y of [7.7, 6.3]) {
      b.add(cbox(0.72, 0.08, 0.5, 0.01), m.dark, [sx, y + 0.38, sz + 0.72]);
      b.add(cbox(0.72, 0.6, 0.08, 0.01), m.dark, [sx, y, sz + 0.92]);
    }
  }

  b.add(cbox(96, 0.3, 1.2, 0.08), m.dark, [gx, 0.15, -141.2]);
  // wet patches on the apron (the gate always drags rain in)
  for (const [x, z, sx, sz] of [[-14, -128, 7, 3.6], [18, -132, 5.5, 3.0], [-33, -116, 6.5, 3.2], [40, -126, 5.0, 2.6]]) {
    b.add(new THREE.CircleGeometry(1, 20), m.puddle, [x, 0.04, z], [-PI / 2, 0, 0], [sx, sz, 1]);
  }
  root.add(b.build());

  // ---- painted / stencilled markings on the concrete
  const deco = (tex, w, h, x, y, z, ry = 0, op = 1) => {
    const d = decalMesh(tex, w, h, { opacity: op });
    d.position.set(x, y, z); d.rotation.y = ry; root.add(d); return d;
  };
  deco(stencilTexture('04', { size: 380, color: 'rgba(226,222,206,0.52)', w: 512, h: 512 }), 8.5, 8.5, gx - (ow + fw / 2), 28, zf + 0.9);
  deco(stencilTexture('04', { size: 380, color: 'rgba(226,222,206,0.40)', w: 512, h: 512 }), 7.5, 7.5, gx + (ow + fw / 2), 41.5, zf + 0.9);
  deco(stencilTexture('RESTRICTED AREA', { size: 88, color: 'rgba(214,170,40,0.5)', w: 1024, h: 128 }), 13, 1.6, gx - 30, 4.3, zf + 0.8);
  deco(stencilTexture('NO STEP', { size: 92, color: 'rgba(220,214,196,0.4)', w: 512, h: 128 }), 5.5, 1.4, gx + 30, 4.3, zf + 0.8);
  // lane number painted on the apron, readable from outside
  const laneNo = decalMesh(stencilTexture('04', { size: 400, color: 'rgba(226,222,206,0.42)', w: 512, h: 512 }), 16, 16, { opacity: 1 });
  laneNo.rotation.x = -PI / 2; laneNo.position.set(gx, 0.06, -118); root.add(laneNo);
  const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.9), new THREE.MeshStandardMaterial({
    color: 0xffffff, map: stencilTexture('SLOW  10', { size: 110, color: 'rgba(226,222,206,0.55)', w: 1024, h: 128 }),
    transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1.5,
  }));
  stopLine.rotation.x = -PI / 2; stopLine.position.set(gx, 0.06, -126); root.add(stopLine);

  // ---- warning sign next to the frame
  root.add(signMesh(signBoard('DANGER', 'SLIDING GATE', { size: 128, subSize: 58, bg: '#1d2325', edge: 'rgba(200,60,40,0.9)' }), 4.6, 1.8, gx - ow - 2.0, 7.8, zf + 0.95));
  root.add(signMesh(signBoard('BAY 04', 'NIGHT SHIFT · BERTH 12', { size: 116, subSize: 46 }), 6.0, 2.3, gx + ow + 4.1, 8.2, zf + 0.95));

  return { glows, signal: root.userData.signal };
}

// ============================================================================
// door leaves: panel seams, rivets, rollers, hatches, stencils
// ============================================================================
export function dressDoorLeaves(door, m, G) {
  for (const [key, grp] of Object.entries(door)) {
    const inner = key.startsWith('inner');
    const b = new Batch();
    const face = inner ? -1 : 1;             // outer leaves: outside face; inner: hangar face
    const zFace = face * (G.leafT / 2 + 0.02);
    const mat = inner ? m.doorD : m.door;
    const trim = m.steelD;

    // panel seams (horizontal + vertical)
    for (const y of [14, 28, 42]) {
      b.add(cbox(21.7, 0.1, 0.12, 0.02), m.dark, [0, y, zFace]);
      b.add(cbox(0.1, 0.1, 0.1, 0.01), m.dark, [0, y, -zFace * 0.96]);
    }
    for (const x of [-5.5, 5.5]) {
      b.add(cbox(0.1, 55.6, 0.12, 0.02), m.dark, [x, 28, zFace]);
      b.add(cbox(0.1, 55.6, 0.1, 0.01), m.dark, [x, 28, -zFace * 0.96]);
    }
    // rivet rows along the seams
    const rivet = (x, y) => {
      b.add(cyl(0.09, 0.09, 0.1, 6), m.chrome, [x, y, zFace + 0.04], [PI / 2, 0, 0]);
    };
    for (const y of [14, 28, 42]) for (let x = -10.4; x <= 10.4; x += 2.6) rivet(x, y);
    for (const x of [-5.5, 5.5]) for (let y = 2.4; y <= 54; y += 2.6) rivet(x, y);

    // edge reinforcement + reflective tape
    for (const x of [-10.4, 10.4]) {
      b.add(cbox(0.55, 55.0, 0.2, 0.03), trim, [x, 28, zFace]);
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 20), m.hazard);
      tape.position.set(x * 0.985, 18, zFace + 0.12); tape.rotation.y = face > 0 ? 0 : PI;
      grp.add(tape);
    }

    // access hatch low on the panel
    b.add(cbox(3.2, 2.6, 0.16, 0.04), m.doorD, [0, 3.4, zFace + 0.06]);
    b.add(cbox(3.0, 0.12, 0.12, 0.01), m.dark, [0, 4.6, zFace + 0.16]);
    b.add(cbox(0.12, 0.55, 0.12, 0.02), m.chrome, [1.15, 3.3, zFace + 0.2]);
    for (const [dx, dy] of [[-1.3, -1.0], [1.3, -1.0], [-1.3, 1.0], [1.3, 1.0]]) {
      b.add(cyl(0.09, 0.09, 0.1, 6), m.chrome, [dx, 3.4 + dy, zFace + 0.16], [PI / 2, 0, 0]);
    }

    // top roller carriages + bottom guide shoes
    for (const x of [-9.6, 0, 9.6]) {
      b.add(cbox(1.8, 0.9, 2.0, 0.08), m.steelD, [x, 56.2, 0]);
      b.add(cyl(0.38, 0.38, 0.5, 12), m.chrome, [x - 0.6, 56.5, 0.6], [0, 0, PI / 2]);
      b.add(cyl(0.38, 0.38, 0.5, 12), m.chrome, [x + 0.6, 56.5, -0.6], [0, 0, PI / 2]);
      b.add(cbox(0.35, 0.6, 0.35, 0.03), m.yellow, [x, 55.9, 1.6]);
    }
    for (const x of [-8, 8]) {
      b.add(cbox(1.2, 1.1, 2.8, 0.06), m.dark, [x, 0.75, 0]);
      b.add(cbox(0.5, 0.35, 3.1, 0.04), m.steelD, [x, 0.18, 0]);
    }
    // lifting lugs
    for (const x of [-8, 0, 8]) {
      b.add(cbox(0.7, 0.7, 0.5, 0.05), m.steelD, [x, 54.8, 0]);
      b.add(cyl(0.16, 0.16, 0.7, 8), m.dark, [x, 55.0, 0.2], [PI / 2, 0, 0]);
    }
    // panel stiffener on the inside face (reads as depth when the door opens)
    for (const y of [10, 24, 38, 52]) b.add(cbox(20.6, 0.5, 0.5, 0.04), m.dark, [0, y, -face * 1.25]);
    b.add(cbox(0.6, 50, 0.6, 0.04), m.dark, [0, 28, -face * 1.25]);
    grp.add(b.build());

    // stencils
    const tex = (t, o) => stencilTexture(t, o);
    const st1 = decalMesh(tex('04', { size: 330, color: 'rgba(226,222,206,0.62)', w: 512, h: 512 }), 7.5, 7.5);
    st1.position.set(0, 47, zFace + (face > 0 ? 0.05 : -0.05));
    st1.rotation.y = face > 0 ? 0 : PI;
    grp.add(st1);
    const st2 = decalMesh(tex(inner ? 'INNER LEAF · B' : 'OUTER LEAF · A', { size: 84, color: 'rgba(214,170,40,0.6)', w: 1024, h: 128 }), 12, 1.5);
    st2.position.set(0, 36, zFace + (face > 0 ? 0.05 : -0.05));
    st2.rotation.y = face > 0 ? 0 : PI;
    grp.add(st2);
    const st3 = decalMesh(tex('CRUSH ZONE', { size: 96, color: 'rgba(214,80,50,0.6)', w: 1024, h: 128 }), 8, 1.0);
    st3.position.set(0, 12.4, zFace + (face > 0 ? 0.05 : -0.05));
    st3.rotation.y = face > 0 ? 0 : PI;
    grp.add(st3);
  }
}

// ============================================================================
// atmosphere: daylight shafts through the gate + drifting dust
// ============================================================================
export function makeAtmosphere(root, m) {
  const shafts = [];
  for (const dx of [-8, 9]) {
    const sh = lightShaft(15, 46, 58, 0xffe0ae, 0.042);
    sh.position.set(4 + dx, 27, -174);
    sh.rotation.x = -0.13;
    sh.rotation.y = dx < 0 ? 0.2 : 0.12;
    sh.visible = false;
    root.add(sh); shafts.push(sh);
  }
  const dust = makeDust(760, { x0: -32, x1: 40, y0: 1, y1: 54, z0: -302, z1: -148 });
  dust.visible = false;
  root.add(dust);
  return { shafts, dust };
}
