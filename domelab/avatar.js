// Playable bay inspector: articulated suit, equipment and a two-bone walking rig.
import * as THREE from 'three';
import { Batch, cbox, cyl, sphere } from '../src/kit.js';

export function buildVisitorAvatar() {
  const root = new THREE.Group(); root.name = 'playerBayInspector'; root.userData.noCollision = true;
  const mat = (name, color, roughness = .72, metalness = 0) => new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
  const M = { suit: mat('inspectorBlueSuit', 0x294550), trim: mat('inspectorIvoryPanels', 0xc9c8ba),
    orange: mat('inspectorOrangeHarness', 0xb65a28), rubber: mat('inspectorBootsAndGloves', 0x141c22),
    skin: mat('inspectorFace', 0xb98e71), metal: mat('inspectorHardware', 0x889599, .4, .65),
    visor: mat('inspectorVisor', 0x3b3930, .14, .55) };
  const pelvis = new THREE.Group(); pelvis.position.y = .94; root.add(pelvis);
  const torso = new THREE.Group(); pelvis.add(torso);
  const body = new Batch();
  body.add(cbox(.34, .18, .23, .055), M.suit, [0, .025, 0]);
  body.add(cbox(.37, .065, .26, .018), M.rubber, [0, .09, 0]);
  body.add(cbox(.075, .05, .025, .006), M.metal, [0, .09, .145]);
  body.add(cbox(.36, .39, .23, .06), M.suit, [0, .33, 0]);
  body.add(cbox(.27, .13, .025, .018), M.trim, [0, .43, .12]);
  for (const x of [-.13, .13]) {
    body.add(cbox(.045, .37, .028, .009), M.orange, [x, .31, .126], [0, 0, -x * .6]);
    body.add(cbox(.043, .3, .028, .008), M.orange, [x, .34, -.129]);
    body.add(cbox(.075, .1, .045, .012), M.suit, [x, .22, .143]);
    body.add(cbox(.025, .018, .012, .003), M.metal, [x, .29, .145]);
    body.add(cbox(.075, .12, .09, .018), M.rubber, [x * 1.4, .035, .035]);
  }
  body.add(cbox(.22, .27, .12, .035), M.rubber, [0, .31, -.19]);
  body.add(cbox(.17, .18, .035, .015), M.trim, [0, .33, -.26]);
  body.add(cbox(.07, .12, .045, .008), M.rubber, [-.12, .47, .145]);
  body.add(cyl(.006, .006, .16, 6), M.metal, [-.12, .61, .145]);
  body.add(cyl(.078, .09, .065, 16), M.rubber, [0, .555, 0]);
  torso.add(body.build());

  const head = new THREE.Group(); head.position.y = .61; torso.add(head);
  const H = new Batch();
  H.add(sphere(.105, 20, 14), M.skin, [0, .085, .008], [0, 0, 0], [.83, 1.05, .9]);
  H.add(cbox(.028, .04, .036, .01), M.skin, [0, .074, .099]);
  for (const s of [-1, 1]) {
    H.add(sphere(.022, 10, 8), M.skin, [s * .087, .08, 0]);
    H.add(cbox(.03, .012, .009, .003), M.rubber, [s * .037, .103, .095]);
    H.add(cbox(.04, .055, .06, .012), M.rubber, [s * .112, .12, -.015]);
  }
  const helmet = new THREE.SphereGeometry(.127, 24, 12, 0, Math.PI * 2, 0, Math.PI * .59);
  H.add(helmet, M.trim, [0, .125, -.008], [0, 0, 0], [1, .85, 1.05]);
  H.add(cbox(.033, .012, .19, .01), M.orange, [0, .233, .007]);
  H.add(cbox(.217, .018, .11, .015), M.trim, [0, .164, .069]);
  H.add(cbox(.18, .052, .022, .014), M.visor, [0, .126, .108]);
  H.add(cbox(.028, .025, .023, .005), M.metal, [0, .174, .129]);
  head.add(H.build());

  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .225, .485, 0); torso.add(arm);
    const upper = new Batch(); upper.add(cyl(.062, .052, .255, 14), M.suit, [0, -.12, 0]);
    upper.add(cbox(.1, .08, .14, .025), M.trim, [0, -.02, 0]);
    upper.add(cbox(.112, .026, .15, .008), M.orange, [0, -.08, 0]); arm.add(upper.build());
    const elbow = new THREE.Group(); elbow.position.y = -.25; arm.add(elbow);
    const lower = new Batch(); lower.add(sphere(.052, 12, 8), M.rubber, [0, 0, 0]);
    lower.add(cyl(.052, .043, .22, 14), M.suit, [0, -.11, 0]);
    lower.add(cbox(.07, .085, .028, .012), M.trim, [0, -.07, -.044]);
    lower.add(cyl(.048, .048, .035, 12), M.rubber, [0, -.22, 0]);
    lower.add(cbox(.075, .09, .05, .018), M.rubber, [0, -.28, .006]);
    for (let i = 0; i < 4; i++) lower.add(cbox(.012, .045, .024, .005), M.rubber, [(i - 1.5) * .016, -.335, .014]);
    lower.add(cbox(.025, .055, .025, .006), M.rubber, [-side * .045, -.28, .026]);
    elbow.add(lower.build()); arms.push({ arm, elbow, side });

    const hip = new THREE.Group(); hip.position.set(side * .108, 0, 0); pelvis.add(hip);
    const thigh = new Batch(); thigh.add(cyl(.085, .064, .43, 16), M.suit, [0, -.215, 0]);
    thigh.add(cbox(.08, .14, .1, .018), M.suit, [side * .065, -.18, 0]);
    thigh.add(cbox(.04, .1, .018, .005), M.orange, [side * .065, -.18, .059]); hip.add(thigh.build());
    const knee = new THREE.Group(); knee.position.y = -.43; hip.add(knee);
    const shin = new Batch(); shin.add(cyl(.064, .048, .4, 16), M.suit, [0, -.2, 0]);
    shin.add(cbox(.105, .12, .052, .022), M.trim, [0, -.02, .052]);
    shin.add(cbox(.075, .09, .035, .01), M.rubber, [0, -.025, .084]);
    shin.add(cbox(.095, .035, .09, .008), M.orange, [0, -.32, 0]); knee.add(shin.build());
    const ankle = new THREE.Group(); ankle.position.y = -.4; knee.add(ankle);
    const boot = new Batch(); boot.add(cbox(.13, .13, .22, .025), M.rubber, [0, -.045, .045]);
    boot.add(cbox(.145, .035, .255, .012), M.rubber, [0, -.1, .05]);
    boot.add(cbox(.12, .035, .08, .012), M.metal, [0, -.01, .12]);
    for (let i = 0; i < 3; i++) boot.add(cbox(.067, .009, .008, .002), M.trim, [0, .011, .043 + i * .022]);
    ankle.add(boot.build()); legs.push({ hip, knee, ankle, side });
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  let phase = 0, clock = 0, motion = 0, crouchBlend = 0, runBlend = 0;
  const update = (dt, speed, { crouch = false, running = false, grounded = true, vertical = 0 } = {}) => {
    clock += dt; motion = THREE.MathUtils.damp(motion, Math.min(1, speed / 2.5), 9, dt);
    crouchBlend = THREE.MathUtils.damp(crouchBlend, +crouch, 12, dt); runBlend = THREE.MathUtils.damp(runBlend, +running, 7, dt);
    phase += dt * (6.8 + 3.8 * runBlend) * motion;
    pelvis.position.y = .94 - .28 * crouchBlend + Math.cos(phase * 2) * .012 * motion * (1 - crouchBlend * .7);
    pelvis.rotation.y = Math.sin(phase) * .045 * motion;
    torso.rotation.x = .04 + .16 * runBlend * motion + .22 * crouchBlend;
    torso.rotation.y = -Math.sin(phase) * .055 * motion;
    head.rotation.y = -torso.rotation.y * .7; head.rotation.x = -torso.rotation.x * .35;
    for (const leg of legs) {
      const p = phase + (leg.side > 0 ? 0 : Math.PI), stride = (.19 + .12 * runBlend) * motion * (1 - .45 * crouchBlend);
      const z = -Math.cos(p) * stride, lift = grounded ? Math.max(0, Math.sin(p)) * (.055 + .09 * runBlend) * motion : .10 + Math.max(0, vertical) * .009;
      const dy = pelvis.position.y - .11 - lift, length = THREE.MathUtils.clamp(Math.hypot(z, dy), .1, .829);
      const angle = Math.atan2(-z, dy), upper = Math.acos(THREE.MathUtils.clamp((.43 ** 2 + length ** 2 - .4 ** 2) / (2 * .43 * length), -1, 1));
      leg.hip.rotation.x = angle - upper;
      leg.knee.rotation.x = Math.PI - Math.acos(THREE.MathUtils.clamp((.43 ** 2 + .4 ** 2 - length ** 2) / (2 * .43 * .4), -1, 1));
      leg.ankle.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
    }
    for (const { arm, elbow, side } of arms) {
      arm.rotation.x = Math.cos(phase + (side > 0 ? 0 : Math.PI)) * (.3 + .3 * runBlend) * motion - .12 * crouchBlend;
      arm.rotation.z = -side * (.07 + .03 * motion); elbow.rotation.x = -.12 - .85 * runBlend - .35 * crouchBlend;
    }
    if (motion < .02) torso.position.y = Math.sin(clock * 1.8) * .0025; else torso.position.y = 0;
  };
  update(0, 0);
  return { root, height: 1.8, update, rig: { pelvis, torso, head, arms, legs } };
}
