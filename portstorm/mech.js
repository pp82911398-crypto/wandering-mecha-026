// The finished "026" Jaeger from finallab, reused in the port:
// same part labs, then the finishing pipeline (paint split, armour relief, CSG details, honeycombs,
// reactor + rotor, decal markings, shader weathering, navy scheme). The part source files stay untouched.
import * as THREE from 'three';
import { buildHead } from '../headlab/head.js';
import { buildNeck } from '../necklab/neck.js';
import { buildTorso, TORSO } from '../torsolab/torso.js';
import { buildArms } from '../armlab/arm.js';
import { buildLegs, LEG } from '../leglab/leg.js';
import { paint, PAL } from '../finallab/paint.js';
import { makeMarkings } from '../finallab/lamps.js';
import { reliefShoulders, reliefAll, shoulderStripes } from '../finallab/relief.js';
import { applyScheme } from '../finallab/schemes.js';
import { makeDetails } from '../finallab/details.js';
import { applyTweaks } from '../finallab/tweaks.js';
import { buildReactor, ventHoneycombs, neckHoneycomb, extractBlades, buildRotor } from '../finallab/reactor.js';
import { applyWear, patch as wearPatch, WEAR } from '../finallab/wear.js';
import { extractThrusters, buildPropulsion } from '../finallab/thrusters.js';
import { buildJointLights } from '../finallab/jointLights.js';
import { alignLegAxes } from '../finallab/legAlignment.js';

const mk = (o) => new THREE.MeshStandardMaterial({ metalness: 0, ...o });

export function buildMech({ scheme = 'navy', wear = 0.5, rotorSpeed = 0.6 } = {}) {
  const labMats = {
    clay: mk({ color: 0xf1efea, roughness: 0.75 }),
    dark: mk({ side: THREE.DoubleSide, color: 0x4a4844, roughness: 0.8 }),
    eye: mk({ side: THREE.DoubleSide, color: 0x9a968e, roughness: 0.5 }),
    chrome: mk({ color: 0xd9dad8, roughness: 0.35 }),
    glow: mk({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: 0.55, roughness: 0.5 }),
  };

  const mech = new THREE.Group(); mech.name = 'mech026';
  const body = new THREE.Group();
  body.add(buildHead(labMats).group);
  body.add(buildNeck(labMats, { socket: false }));
  const torso = buildTorso(labMats);
  body.add(torso);
  const A = buildArms(labMats, {
    torso, shells: TORSO.shells, panels: TORSO.panels, modules: TORSO.modules, rearShell: true,
  });
  const LG = buildLegs(labMats);
  alignLegAxes(LG);
  mech.add(body, A.group, LG.group);
  mech.updateMatrixWorld(true);

  // ---- finishing pipeline, same order as finallab ----
  extractBlades(torso);
  const THR = extractThrusters(torso);   // back thruster columns onto their hinge groups (before paint, as in finallab)
  const stats = paint(mech, labMats);
  applyTweaks(mech);
  reliefShoulders(mech);
  const stripes = shoulderStripes(mech);
  body.children[0].traverse(o => o.userData.noRelief = true);   // approved head
  body.children[1].traverse(o => o.userData.noRelief = true);   // approved neck
  reliefAll(mech, { skip: m => m.userData.noRelief || /^paulCap/.test(m.name) });
  mech.updateMatrixWorld(true);

  makeDetails([mech]);
  const honeycomb = { vents: ventHoneycombs(mech), neck: neckHoneycomb(mech) };
  const reactor = buildReactor(torso);
  const rotor = buildRotor(reactor);
  rotor.target = rotorSpeed; rotor.lamp = 1;
  mech.updateMatrixWorld(true);

  const markings = makeMarkings([mech]);
  applyWear();
  const seen = new Set();
  mech.traverse(o => {
    if (/^decal:/.test(o.name) && !seen.has(o.material)) {
      seen.add(o.material);
      wearPatch(o.material, { chip: 1.0, scuff: 0.8, recess: 0.0 });
    }
  });
  WEAR.value = wear;

  // navy paint only; do not let the scheme change the port's sky / lights / exposure
  applyScheme(scheme, {
    scene: { environmentIntensity: 0 }, mech, stripes,
    rim: { intensity: 0 }, key: { intensity: 0 }, renderer: { toneMappingExposure: 1 },
  });

  // ---- one root, soles on y=0 ----
  const root = new THREE.Group();
  root.name = 'jaeger';
  root.add(mech);
  root.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(mech);
  const groundOffset = -raw.min.y;
  mech.position.y = groundOffset;
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  // propulsion after the ground offset: it keeps mech.position.y as its hover base
  const prop = buildPropulsion({ THR, mech, LG, A, PAL });
  const jointGlow = buildJointLights(mech, PAL);

  const feet = [];
  for (const id of ['R', 'L']) {
    let box = null;
    mech.traverse(m => {
      if (m.isMesh && m.userData.part === `leg${id}.foot`) {
        const b = new THREE.Box3().setFromObject(m);
        if (!box) box = b; else box.union(b);
      }
    });
    if (box) feet.push({ id, box });
  }

  root.traverse(o => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    if (!o.userData.marking && !/^decal:/.test(o.name)) o.castShadow = true;
  });

  return {
    group: root, mech, mats: PAL, torso, arms: A, legs: LG, thr: THR, prop,
    height: bbox.max.y - bbox.min.y,
    bbox, feet, groundOffset, rotor, markings, stripes, reactor, honeycomb,
    paint: stats, scheme, jointGlow,
  };
}
