// Port storm overlay for the finished baselab port.
// Reuses the completed port/hangar/mech; changes the grade to a heavy rainstorm and adds the
// missing weather (storm sky, visible rain, lightning, wet quay, working port/ship lights).
import * as THREE from 'three';

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
let started = false;

function wait() {
  if (!window.__lab) return setTimeout(wait, 300);
  if (started) return;
  started = true;
  build();
}
wait();

function build() {
  const lab = window.__lab, scene = lab.scene, cam = lab.camera, renderer = lab.renderer;
  const L = lab.L, portRoot = lab.port.root, hangar = lab.hangar;

  // ---------- kill the daylight sky / grade ----------
  scene.traverse(o => { if (o.isMesh && o.material?.uniforms?.sunPosition) o.visible = false; });
  const sun = scene.children.find(o => o.isDirectionalLight && o.castShadow) || scene.children.find(o => o.isDirectionalLight);
  const fill = scene.children.filter(o => o.isDirectionalLight && o !== sun)[0] || null;
  const hemi = scene.children.find(o => o.isHemisphereLight) || null;
  if (sun) { sun.color.setHex(0x9eb5c8); sun.intensity = 2.0; }
  if (fill) { fill.color.setHex(0x3c5368); fill.intensity = 0.25; }
  if (hemi) { hemi.color.setHex(0x70899b); hemi.groundColor.setHex(0x080c0e); hemi.intensity = 0.5; }
  renderer.toneMappingExposure = 0.92;
  scene.fog = new THREE.Fog(0x1c2932, 260, 2450);

  // ---------- storm sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uFlash: { value: 0 },
      uTop: { value: new THREE.Color(0x111920) }, uHorizon: { value: new THREE.Color(0x53646d) },
      uCloudDark: { value: new THREE.Color(0x18222a) }, uCloudLight: { value: new THREE.Color(0x6b7a84) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime,uFlash; uniform vec3 uTop,uHorizon,uCloudDark,uCloudLight;
      float h3(vec3 p){ p=fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n3(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0);
        vec3 col=mix(uHorizon,uTop,smoothstep(0.0,0.62,h));
        float c=fbm(d*3.4+vec3(uTime*0.014,uTime*0.004,uTime*0.01));
        float cloud=smoothstep(0.40,0.72,c);
        vec3 cc=mix(uCloudDark,uCloudLight,smoothstep(0.28,0.9,c));
        col=mix(col,cc,cloud*smoothstep(-0.06,0.2,h));
        col+=uFlash*vec3(0.6,0.7,0.9)*(0.35+cloud);
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // PMREM from the storm sky for wet reflections
  let stormEnv = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
    stormEnv = pm.fromScene(es, 0.04).texture;
    scene.environment = stormEnv; scene.environmentIntensity = 0.8;
  } catch (e) { console.warn('storm PMREM failed', e); }

  // ---------- wet port ----------
  const wetMats = new Set();
  const wetRoots = [portRoot];   // interior hall is dry; only the quay gets wet
  for (const root of wetRoots) root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m.isMeshStandardMaterial || wetMats.has(m)) continue;
      wetMats.add(m);
      m.roughness = Math.min(m.roughness ?? 0.8, 0.38);
      m.metalness = Math.max(m.metalness ?? 0, 0.25);
      m.envMapIntensity = 1.0;
      m.needsUpdate = true;
    }
  });

  // puddles on the quay: low, long, slightly reflective patches
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x1a252b, roughness: 0.06, metalness: 0.6, envMapIntensity: 1.2, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const puddles = new THREE.Group(); puddles.name = 'stormPuddles';
  const puddleSpots = [[-12, 120, 20, 7], [-42, 90, 16, 5], [2, 62, 26, 8], [-70, 145, 22, 9], [22, 150, 14, 6], [-30, 36, 18, 7], [-118, 112, 26, 9], [-180, 58, 30, 10]];
  for (const [x, z, w, d] of puddleSpots) {
    // irregular wet patch (wobbly ellipse), not a dark rectangle
    const shp = new THREE.Shape(), n = 22;
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = 0.5 * (0.78 + 0.22 * Math.sin(a * 3 + x) * Math.cos(a * 2 + z)); const px = Math.cos(a) * r * w, py = Math.sin(a) * r * d; i ? shp.lineTo(px, py) : shp.moveTo(px, py); }
    const p = new THREE.Mesh(new THREE.ShapeGeometry(shp), puddleMat);
    p.rotation.x = -Math.PI / 2; p.rotation.z = rnd(-0.3, 0.3);
    p.position.set(x, 0.045, z); p.receiveShadow = true; puddles.add(p);
  }
  scene.add(puddles);

  // ---------- working lights: port masts, quay lamps, ship ----------
  const lights = new THREE.Group(); lights.name = 'stormLights'; scene.add(lights);
  // the three tall floodlight masts already modelled by port.js
  for (const [x, z] of [[-64, -100]]) {
    const sp = new THREE.SpotLight(0xd7e6f2, 2600, 240, 0.52, 0.55, 1.8);
    sp.position.set(x, 27, z); sp.target.position.set(x + 30, 0, z + 70);
    lights.add(sp, sp.target);
  }
  // quay lamp posts (the small warm lamps along the pier)
  for (const [x, z] of [[-20, 130], [-96, 120]]) {
    const p = new THREE.PointLight(0xffb062, 90, 45, 2);
    p.position.set(x, 7, z); lights.add(p);
  }
  // frigate + mooring lights
  const ship = lab.port.root.getObjectByName?.('ship');
  const S = L.ship;
  for (const [dx, dz] of [[-2, 8], [2, 8]]) {
    const p = new THREE.PointLight(0xffc27a, 55, 28, 2);
    p.position.set(S.x + dx, 7.5, S.z + dz); lights.add(p);
  }
  // hangar gate/hall lights on, door closed
  hangar.updateLights(1, 0, 0);

  // ---------- rain ----------
  const RAIN = 4000;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 6);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xdceaf2, transparent: true, opacity: 0.62, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);
  const drops = [];
  const reset = (d, c) => { d.x = c.x + rnd(-150, 150); d.z = c.z + rnd(-150, 150); d.y = c.y + rnd(-55, 95); d.v = rnd(55, 85); };
  for (let i = 0; i < RAIN; i++) { const d = {}; reset(d, cam); drops.push(d); }

  // rain splashes on the quay
  const SPL = 180;
  const splGeo = new THREE.BufferGeometry();
  const splPos = new Float32Array(SPL * 3);
  splGeo.setAttribute('position', new THREE.BufferAttribute(splPos, 3));
  const spl = new THREE.Points(splGeo, new THREE.PointsMaterial({ color: 0xd7e7ef, size: 0.3, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true }));
  spl.frustumCulled = false; scene.add(spl);

  // ---------- lightning ----------
  const boltMat = new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const bolt = new THREE.Line(new THREE.BufferGeometry(), boltMat); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
  const boltLight = new THREE.PointLight(0xadcaff, 0, 900, 2); scene.add(boltLight);
  const st = { flash: 0, next: 2.2, boltT: 0, t: 0 };
  function strike() {
    const pts = []; let x = rnd(-260, 260), z = rnd(-520, -120), y = 260;
    while (y > 1) { y -= rnd(10, 20); x += rnd(-10, 10); z += rnd(-10, 10); pts.push(new V3(x, y, z)); }
    bolt.geometry.dispose(); bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    bolt.visible = true; boltLight.position.set(x, 220, z); st.flash = 1; st.boltT = 0.45;
  }

  // ---------- storm UI ----------
  const ui = document.getElementById('stormInfo');
  if (ui) ui.textContent = '暴雨 · 港口戒备';
  const exp = document.getElementById('stormExp'), expVal = document.getElementById('stormExpVal');
  if (exp) {
    exp.value = String(renderer.toneMappingExposure);
    if (expVal) expVal.textContent = Number(renderer.toneMappingExposure).toFixed(2);
    exp.oninput = () => { renderer.toneMappingExposure = +exp.value; if (expVal) expVal.textContent = (+exp.value).toFixed(2); };
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    st.t += dt;
    skyMat.uniforms.uTime.value = st.t;
    const c = cam.position;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y -= d.v * dt; d.x += 7.5 * dt; d.z += 3.0 * dt;
      if (d.y < c.y - 55) reset(d, c);
      const o = i * 6;
      rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
      rainPos[o + 3] = d.x - 0.7; rainPos[o + 4] = d.y - 4.0; rainPos[o + 5] = d.z - 0.35;
    }
    rainGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < SPL; i++) {
      if (!splPos[i * 3 + 1] || splPos[i * 3 + 1] < 0.02) {
        splPos[i * 3] = c.x + rnd(-80, 80); splPos[i * 3 + 1] = 0.1; splPos[i * 3 + 2] = c.z + rnd(-80, 80);
      }
      splPos[i * 3 + 1] -= dt * 0.8;
    }
    splGeo.attributes.position.needsUpdate = true;
    st.next -= dt;
    if (st.next <= 0) { strike(); st.next = rnd(4, 9); }
    st.flash *= Math.exp(-dt * 7);
    st.boltT -= dt;
    const f = st.flash;
    skyMat.uniforms.uFlash.value = f;
    boltMat.opacity = f * 0.95; bolt.visible = f > 0.02 && st.boltT > 0;
    boltLight.intensity = f * 28;
    if (sun) sun.intensity = 2.0 + f * 7;
    rainMat.opacity = 0.56 + f * 0.32;
    // gate/hall light breathing
    if (hangar) hangar.updateLights(0.95 + Math.sin(st.t * 0.7) * 0.05, 0, st.t);
  }
  requestAnimationFrame(frame);
  window.__storm = { st, strike, rain, sky, lights, puddles };
}
