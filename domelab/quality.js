// Render profiles for the dome. The canvas stays at CSS resolution (or the profile's base DPR) while the
// post chain renders at its own scale: that is what gives the quality modes their supersampling, and it is
// also the knob the adaptive controller moves without touching the UI. Bloom renders at half of the post
// buffer; the wet-floor reflection is throttled independently.
export const RENDER_MODES = {
  balanced: { name: '均衡', dpr: 1, postScale: 1.0, samples: 0, reflectionScale: 0.33, reflectionHz: 6, shadowSize: 2048, shadowHz: 4, rain: 10000 },
  standard: { name: '标准', dpr: 1, postScale: 1.05, samples: 0, reflectionScale: 0.4, reflectionHz: 6, shadowSize: 2048, shadowHz: 4, rain: 10000 },
  performance: { name: '性能', dpr: 0.85, postScale: 0.8, samples: 0, reflectionScale: 0.25, reflectionHz: 0, shadowSize: 1024, shadowHz: 4, rain: 6000 },
};

const MIN_SCALE = 0.65;

export function createQualityController({ renderer, env, wet, rain, post, initial = 'balanced' }) {
  let mode, profile, dyn = 1, dynamic = true;
  const key = 'mech026.dome.renderMode', dynKey = 'mech026.dome.dynamicRes';

  function applyShadow() {
    const moon = env.lights.moon;
    if (moon.shadow.mapSize.x !== profile.shadowSize) {
      moon.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
      if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
    }
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }
  function applyPostScale() {
    post.setPixelRatio(profile.postScale * dyn);
    post.setSize(innerWidth, innerHeight);
  }
  function resize() {
    const base = Math.min(devicePixelRatio, profile.dpr);
    renderer.setPixelRatio(base);
    renderer.setSize(innerWidth, innerHeight);
    wet.resolutionScale = profile.reflectionScale;
    wet.setSize(innerWidth * base, innerHeight * base);
    applyPostScale();
  }
  function set(value) {
    if (!RENDER_MODES[value]) return;
    mode = value; profile = RENDER_MODES[value]; dyn = 1;
    post.setSamples(profile.samples);
    post.grade.enabled = mode !== 'performance';
    rain.lines.geometry.setDrawRange(0, profile.rain * 2);
    resize();
    applyShadow();
    localStorage.setItem(key, mode);
  }
  function setDynamicScale(k) {
    const next = Math.min(1, Math.max(MIN_SCALE, k));
    if (Math.abs(next - dyn) < 0.001) return;
    dyn = next;
    applyPostScale();
  }
  function enableDynamic(on) {
    dynamic = !!on;
    localStorage.setItem(dynKey, dynamic ? '1' : '0');
    if (!dynamic) setDynamicScale(1);
  }

  const savedMode = localStorage.getItem(key);
  set(Object.hasOwn(RENDER_MODES, savedMode) ? savedMode : initial);
  dynamic = localStorage.getItem(dynKey) !== '0';
  return {
    set, resize, setDynamicScale, enableDynamic,
    get mode() { return mode; }, get profile() { return profile; },
    get scale() { return dyn; }, get dynamic() { return dynamic; },
    get minScale() { return MIN_SCALE; },
  };
}
