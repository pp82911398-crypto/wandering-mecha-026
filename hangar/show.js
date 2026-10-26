// Look of the old dome bay, carried into the hangar: post chain (bloom + filmic grade, GTAO in cinema
// quality), volumetric light shafts under the real spots and a few fixtures, rim lights on the machine,
// steam from the floor drains, welding sparks at the work decks, and (cinema quality) the wet mirror floor.
// Generic: works for any scene that passes renderer/scene/camera + a target point (the machine's chest).
import * as THREE from 'three';
import { createPost } from '../src/post.js';
import { createBeam, Particles, WetFloor } from '../src/fx.js';
import { G } from '../src/materials.js';

const V3 = THREE.Vector3;

function wetMask() {
  // R = how wet (puddle blotches), G = noise for ripple jitter; tiles (RepeatWrapping)
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = 'rgb(40,128,0)'; x.fillRect(0, 0, S, S);
  let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 70; i++) {
    const px = r() * S, py = r() * S, rr = 8 + r() * 36;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rr);
      g.addColorStop(0, `rgba(255,${(r() * 255) | 0},0,${0.5 + r() * 0.5})`); g.addColorStop(1, 'rgba(255,128,0,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(px + ox, py + oy, rr, rr * (0.4 + r() * 0.6), r() * 3, 0, 7); x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// opts: { renderer, scene, camera, quality: 'std'|'cinema', focus: () => V3, floor: {x, z, w, d}, beams: [{from,to,angle,color,strength}],
//         drains: [[x0,z0,x1,z1]...], sparkSpots: () => [V3...] }
export function setupShow(o) {
  const { renderer, scene, camera } = o;
  const show = { quality: o.quality || 'std', beams: [], extraLights: [] };
  const size = () => { const r = renderer.domElement.getBoundingClientRect(); return [Math.max(1, r.width), Math.max(1, r.height)]; };
  const build = () => {
    const [w, h] = size();
    show.post = createPost(renderer, scene, camera, w, h, show.quality === 'cinema' ? 'ultra' : 'high');
    show.post.bloom.strength = 0.4; show.post.bloom.threshold = 1.2; show.post.bloom.radius = 0.55;
  };
  build();

  // volumetric shafts
  for (const b of o.beams || []) show.beams.push(createBeam(scene, b.from, b.to, b.angle, new THREE.Color(b.color), b.strength ?? 1));

  // rim / back light on the machine: the old bay's strongest single cue (a hard top-back key + cold side rim)
  const f = o.focus();
  const back = new THREE.SpotLight(0xffd8b0, 2600, 240, 0.3, 0.6, 1.2);   // straight behind, only a little above: edge light, not a top wash
  back.position.set(f.x + 4, f.y + 22, f.z - 75); back.target.position.copy(f); scene.add(back, back.target);
  const rim = new THREE.SpotLight(0x6fa8ff, 1800, 180, 0.42, 0.8, 1.2);
  rim.position.set(f.x - 46, f.y - 6, f.z + 48); rim.target.position.copy(f).add(new V3(0, 4, 0)); scene.add(rim, rim.target);
  show.extraLights.push(back, rim);
  show.back = back; show.rim = rim;

  // steam + sparks
  show.steam = new Particles(scene, 520, { additive: false, color: 0x9aa6b6, gravity: 1.4, drag: 1.4, size: 1.2 });
  show.steam.mat.uniforms.uScale.value = 900;
  show.sparks = new Particles(scene, 900, { color: 0xffa040, gravity: -14, drag: 0.6 });
  let steamT = 0, sparkT = 1.5;

  // wet floor (cinema only: it renders the scene a second time)
  let wet = null;
  const makeWet = () => {
    if (wet || !o.floor) return;
    wet = new WetFloor(renderer, scene, wetMask(), 1);
    wet.mesh.scale.set(o.floor.w, 1, o.floor.d); wet.mesh.position.set(o.floor.x, 0.02, o.floor.z);
    const [w, h] = size(); wet.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  };
  if (show.quality === 'cinema') makeWet();

  show.setQuality = q => {
    if (q === show.quality) return;
    show.quality = q; show.post.composer.dispose?.(); build();
    if (q === 'cinema') makeWet(); else if (wet) { wet.mesh.visible = false; }
    if (q === 'cinema' && wet) wet.mesh.visible = true;
  };
  show.resize = () => { const [w, h] = size(); show.post.setSize(w, h); if (wet) wet.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); };
  addEventListener('resize', show.resize);

  show.flash = 0;   // lightning / weld flash 0..1, decays
  const flashLight = new THREE.PointLight(0xbfd8ff, 0, 260, 1.4); scene.add(flashLight); show.flashLight = flashLight;
  show.lightning = (p) => { show.flash = 1; flashLight.position.copy(p); };

  show.render = (t, dt) => {
    G.uTime.value = t;
    // steam from the drains
    steamT -= dt;
    if (steamT <= 0 && o.drains && !show.fxOff) {
      steamT = 0.12;
      const d = o.drains[(Math.random() * o.drains.length) | 0];
      const p = new V3(d[0] + (d[2] - d[0]) * Math.random(), 0.3, d[1] + (d[3] - d[1]) * Math.random());
      show.steam.emit(p, new V3(0, 1, 0), 2, 1.6, 0.35, 5.5, 2.2);
    }
    // welding sparks at the work decks
    sparkT -= dt;
    if (sparkT <= 0 && o.sparkSpots && !show.fxOff) {
      const spots = o.sparkSpots();
      if (spots.length) { const p = spots[(Math.random() * spots.length) | 0]; show.sparks.emit(p, new V3(0, -0.2, 0), 26, 9, 0.9, 1.0, 0.18); show.weld = p; show.weldT = 0.25; show.onWeld?.(p); }
      sparkT = 0.6 + Math.random() * 2.2;
    }
    show.steam.update(dt); show.sparks.update(dt);
    show.flash = Math.max(0, show.flash - dt * 3.2);
    flashLight.intensity = show.flash * 9000;
    show.post.bloom.strength = (show.bloomBase ?? 0.4) + show.flash * 1.2;
    if (wet && wet.mesh.visible) { wet.mat.uniforms.uTime.value = t; wet.render(renderer, scene, camera, [show.steam.points, show.sparks.points, ...show.beams]); }
    show.post.render(t);
  };
  return show;
}
