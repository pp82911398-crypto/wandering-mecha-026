// Yellow-orange fire on the left-front cutting edge. Built after the finishing
// pass, so paint, relief and wear cannot replace the effect's own materials.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const VERT = /* glsl */`
  varying vec2 vFlame;
  void main() {
    vFlame = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */`
  uniform float uTime, uPower;
  varying vec2 vFlame;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float s = vFlame.x, h = vFlame.y;
    // Advected, uneven tongues stay rooted on the edge rather than filling the blade.
    vec2 p = vec2(s * 10.0 - uTime * 1.6, h * 3.8 - uTime * 4.5);
    float n = 0.65 * noise(p) + 0.35 * noise(p * 2.1 + 7.0);
    float reach = 0.23 + 0.74 * n;
    float body = 1.0 - smoothstep(reach - 0.14, reach + 0.03, h);
    float wisps = mix(1.0, smoothstep(0.18, 0.73, n), smoothstep(0.15, 0.85, h));
    float alpha = body * wisps * (1.0 - h * 0.75) * uPower;
    if (alpha < 0.012) discard;
    vec3 hot = vec3(3.6, 1.7, 0.22);
    vec3 orange = vec3(2.3, 0.43, 0.025);
    vec3 red = vec3(0.95, 0.09, 0.004);
    vec3 color = mix(hot, orange, smoothstep(0.03, 0.48, h));
    color = mix(color, red, smoothstep(0.45, 1.0, h));
    gl_FragColor = vec4(color, alpha * 0.72);
  }
`;

// The chrome mesh also contains two lock pins. Only its thin, central edge
// vertices (x = +/-0.006) describe the cutting line, including the angled tip.
function cuttingLine(segment) {
  const mesh = segment.getObjectByName(segment.name + ':chrome');
  if (!mesh) return null;
  const positions = mesh.geometry.attributes.position, rows = new Map();
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(Math.abs(positions.getX(i)) - 0.006) > 0.0005) continue;
    const y = positions.getY(i), z = positions.getZ(i), key = Math.round(y * 10000);
    if (!rows.has(key) || z > rows.get(key).z) rows.set(key, new V3(0, y, z));
  }
  const points = [...rows.values()].sort((a, b) => b.y - a.y);
  return points.length >= 2 ? points : null;
}

function ribbon(points, angle, offset) {
  const positions = [], uv = [], indices = [];
  let along = offset, row = 0;
  for (let j = 0; j < points.length - 1; j++) {
    const a = points[j], b = points[j + 1], tangent = b.clone().sub(a).normalize();
    const outward = new V3(0, tangent.z, -tangent.y);
    const direction = outward.multiplyScalar(Math.cos(angle)).add(new V3(Math.sin(angle), 0, 0));
    const length = a.distanceTo(b), steps = Math.ceil(length / 0.045);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, p = a.clone().lerp(b, f);
      // The flame starts a hair inside the bevel to avoid a detached glow line.
      for (const h of [0, 1]) {
        const v = p.clone().addScaledVector(direction, -0.012 + h * 0.48);
        positions.push(...v.toArray()); uv.push(along + f * length, h);
      }
      if (i < steps) { const n = row * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      row++;
    }
    along += length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export function buildBladeFire(arm) {
  if (!arm) return null;
  if (arm.bladeFire) return arm.bladeFire;
  const uniforms = { uTime: { value: 0 }, uPower: { value: 0 } };
  const flameMat = new THREE.ShaderMaterial({
    name: 'bladeEdgeFlame', vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    name: 'bladeEdgeHeat', color: new THREE.Color(3.8, 1.6, 0.18),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const segments = [];
  arm.root.traverse(o => { if (/^LF\.seg\d+$/.test(o.name)) segments.push(o); });
  segments.sort((a, b) => Number(b.name.slice(6)) - Number(a.name.slice(6)));
  const groups = [], lights = [];
  let offset = 0, now = 0, ignitedAt = 0, active = false;
  const mark = mesh => {
    mesh.userData.marking = true; mesh.userData.noRelief = true;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.raycast = () => {};
    // mergeStatic intentionally preserves meshes with explicit matrices. The
    // flame UVs and independently animated uniforms must survive that pass.
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    return mesh;
  };
  for (const segment of segments) {
    const points = cuttingLine(segment); if (!points) continue;
    const g = new THREE.Group(); g.name = 'flame:blade:' + segment.name; g.visible = false;
    segment.add(g); groups.push(g);
    for (const angle of [-0.95, 0, 0.95]) {
      const m = mark(new THREE.Mesh(ribbon(points, angle, offset), flameMat));
      m.name = 'bladeFireTongues:' + segment.name; g.add(m);
    }
    // Linear rather than spline interpolation keeps the flame on the sharp tip.
    const curve = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
    const core = mark(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(curve.getLength() * 24), 0.022, 6, false), coreMat));
    core.name = 'bladeFireCore:' + segment.name; g.add(core);
    if (groups.length === 1 || groups.length === 4) {
      const light = new THREE.PointLight(0xff8c28, 0, 3.2, 2);
      light.position.copy(points[0]).lerp(points[1], 0.5); light.position.z += 0.12;
      light.name = 'bladeFireBounce:' + segment.name; light.visible = false;
      g.add(light); lights.push(light);
    }
    offset += curve.getLength() + 0.02;
  }
  const sync = () => {
    // Six segments lock by t = 1. Extinguish immediately on retraction so the
    // stacked/still sliding plates never carry a live flame.
    const on = arm.t >= 0.999 && groups.length === 6;
    if (on && !active) ignitedAt = now;
    active = on;
    for (const g of groups) g.visible = on;
    for (const light of lights) light.visible = on;
    if (!on) { uniforms.uPower.value = 0; coreMat.opacity = 0; for (const light of lights) light.intensity = 0; }
  };
  const deploy = arm.deploy;
  arm.deploy = function (t) { deploy.call(this, t); sync(); };
  const effect = {
    groups, lights, uniforms,
    update(time) {
      now = time; sync(); if (!active) return;
      const ignition = Math.min(1, Math.max(0, (time - ignitedAt) / 0.22));
      const flicker = 0.93 + 0.045 * Math.sin(time * 31) + 0.025 * Math.sin(time * 53);
      uniforms.uTime.value = time; uniforms.uPower.value = ignition * flicker;
      coreMat.opacity = ignition * 0.9;
      for (const light of lights) light.intensity = ignition * flicker * 2.4;
    },
  };
  arm.bladeFire = effect; sync();
  return effect;
}
