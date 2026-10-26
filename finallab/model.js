// Canonical finished 026. Both finallab and domelab import this assembly pipeline.
// Keep geometry / finishing changes here; scene placement and scene lighting belong to each page.
import * as THREE from 'three';
import { buildHead } from '../headlab/head.js';
import { buildNeckRig } from './neckRig.js?v=neck-seam-r-20261023';
import { buildWaistRig } from './waistRig.js';
import { buildTorso, TORSO } from '../torsolab/torso.js';
import { buildArms } from '../armlab/arm.js?v=neck-seam-r-20261023';
import { buildLegs } from '../leglab/leg.js';
import { paint, PAL } from './paint.js';
import { makeMarkings } from './lamps.js';
import { reliefShoulders, reliefAll, shoulderStripes } from './relief.js';
import { makeDetails } from './details.js';
import { applyTweaks, foreheadTriangle } from './tweaks.js';
import { buildReactor, ventHoneycombs, neckHoneycomb, extractBlades, buildRotor } from './reactor.js';
import { applyWear, patch as wearPatch, WEAR } from './wear.js';
import { buildJointLights } from './jointLights.js';
import { alignLegAxes } from './legAlignment.js';
import { extractThrusters, buildPropulsion } from './thrusters.js';
import { ROUND, roundParts, transferNormals } from './rounding.js';
import { pickRadius } from './roundRules.js';
import { createLowerRig } from './lowerRig.js';
import { SURF, detailTexture, smoothShading } from './surface.js';
import { snapSeams } from './seams.js';

export function buildFinishedModel({ rounded = true, wear = 0.5, rotorSpeed = 0, jointGlow = true } = {}) {
  ROUND.enabled = rounded;
  SURF.detail.value ||= detailTexture();
  SURF.envK ??= 0.8;
  const mk = o => new THREE.MeshStandardMaterial({ metalness: 0, ...o });
  const labMats = {
    clay: mk({ color: 0xf1efea, roughness: 0.75 }), dark: mk({ side: THREE.DoubleSide, color: 0x4a4844, roughness: 0.8 }),
    eye: mk({ side: THREE.DoubleSide, color: 0x9a968e, roughness: 0.5 }), chrome: mk({ color: 0xd9dad8, roughness: 0.35 }),
    glow: mk({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: 0.55, roughness: 0.5 }),
  };
  const mech = new THREE.Group(); mech.name = 'mech026';
  const body = new THREE.Group();
  const HEAD = buildHead(labMats).group;
  const NR = buildNeckRig(labMats, HEAD);   // neck rebuilt in movable stages; the head rides on its pitch stage
  body.add(NR.group);
  const torso = buildTorso(labMats, { liveWaist: true }); body.add(torso);   // waist core / struts split out for the waist joint
  const A = buildArms(labMats, { torso, shells: TORSO.shells, panels: TORSO.panels, modules: TORSO.modules, rearShell: true });
  const LG = buildLegs(labMats, { ankleCheeks: false });
  alignLegAxes(LG);   // 髋、膝、踝共线，装甲与机构端点同步对齐
  mech.add(body, A.group, LG.group); 
  const WR = buildWaistRig(mech, [body, A.group], torso, labMats);   // upper body (torso, neck, head, arms) turns on the waist core
  WR.fixed.traverse(o => { if (/^waistCore/.test(o.name)) o.userData.noRelief = true; });
  mech.updateMatrixWorld(true);
  const BLADES = extractBlades(torso);
  const THR = extractThrusters(torso);
  const stats = paint(mech, labMats);
  const TWEAKS = applyTweaks(mech);
  // 头部曲面壳由很多窄条平面拼成，逐条平面着色出现竖纹：小于 20° 的接缝改为平滑着色，≥20° 的折线保持硬边（几何、材质不变）
  HEAD.userData.smoothed = smoothShading(HEAD, 20);
  NR.group.traverse(o => o.userData.noRelief = true);   // head + neck: approved, untouched (no relief, no rounding)
  // 分级 R 角：上色拆件之后、切面板/贴花/装灯之前，逐个散件倒圆；肩甲外壳在 torso.js 布尔前已倒圆，这里还回光顺法线
  const RND = ROUND.enabled ? { parts: roundParts(mech, pickRadius), normals: transferNormals(mech), shells: ROUND.log } : null;
  mech.updateMatrixWorld(true);
  
  const RELIEF = reliefShoulders(mech);
  const STRIPES = shoulderStripes(mech);
  const RELIEF_ALL = reliefAll(mech, { skip: m => m.userData.noRelief || /^paulCap/.test(m.name) });
  mech.updateMatrixWorld(true);
  // 悬空黑线：倒圆、切面板之后，把离开表面的黑色细条逐顶点贴回背后的护甲（头颈内部件不动）
  const SEAMS = snapSeams(mech, { skip: m => m.userData.noRelief });
  mech.updateMatrixWorld(true);
  const DT = makeDetails([mech]);
  const HC = { vents: ventHoneycombs(mech), neck: neckHoneycomb(mech) };
  const REACTOR = buildReactor(torso);
  const ROTOR = buildRotor(REACTOR); ROTOR.target = rotorSpeed;   // default off: thin spinning blades alias into flickering black blocks
  mech.updateMatrixWorld(true);
  const MK = makeMarkings([mech]);
  const FOREHEAD = foreheadTriangle(mech);
  const PROP = buildPropulsion({ THR, mech, LG, A, PAL });
  const JOINT_GLOW = buildJointLights(mech, PAL, { enabled: jointGlow });
  applyWear();
  { const seen = new Set(); mech.traverse(o => { if (/^decal:/.test(o.name) && !seen.has(o.material)) { seen.add(o.material); wearPatch(o.material, { chip: 1.0, scuff: 0.8, recess: 0.0 }); } }); }
  WEAR.value = wear;
  const lowerRig = createLowerRig(LG, PAL);
  const signature = modelSignature(mech);
  Object.assign(signature, { source: 'finallab/model.js', roundedParts: RND?.parts.rounded || 0, lowerSwap: lowerRig.LOWER.on });
  return { mech, body, HEAD, NR, WR, torso, A, LG, BLADES, THR, stats, TWEAKS, RND,
    RELIEF, STRIPES, RELIEF_ALL, DT, HC, REACTOR, ROTOR, MK, FOREHEAD, PROP, JOINT_GLOW, lowerRig, signature, SEAMS };
}

function modelSignature(root) {
  let meshes = 0, vertices = 0;
  root.traverse(o => {
    if (!o.isMesh) return; meshes++;
    vertices += o.geometry.attributes.position.count;
  });
  return { meshes, vertices };
}
