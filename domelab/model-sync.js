// Local preview hot reload for the canonical model's actual dependency graph.
// Only domelab installs this watcher; no timer or storage entry is added to other scenes.
const KEY = 'mech026.dome.modelSync';
const GUARD = 'mech026.dome.reloadGuard';
const label = element => {
  const names = []; let details = element.closest('details');
  while (details) { names.unshift(details.querySelector(':scope > summary')?.textContent || ''); details = details.parentElement.closest('details'); }
  return names.join('/') + '|' + (element.closest('label')?.querySelector('span')?.textContent || element.getAttribute('aria-label') || element.id);
};

export function restoreModelView({ camera, controls, views }) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch {}
  if (!saved) return false;
  for (const e of document.querySelectorAll('#panel input, #panel select')) {
    const value = saved.inputs[label(e)];
    if (value === undefined) continue;
    if (e.type === 'checkbox') e.checked = value; else e.value = value;
    e.dispatchEvent(new Event(e.type === 'range' ? 'input' : 'change'));
  }
  camera.position.fromArray(saved.camera.p); camera.quaternion.fromArray(saved.camera.q); camera.fov = saved.camera.f;
  camera.updateProjectionMatrix(); controls.target.fromArray(saved.target);
  if (saved.view && views) views.state.active = saved.view;
  return true;
}

export async function startModelSync({ camera, controls, views, readout }) {
  readout.dataset.session = String(Date.now());
  const sources = new Map(), visited = new Set(); let stopped = false;
  const stamp = response => response.headers.get('last-modified') + ':' + response.headers.get('content-length');
  const discover = async url => {
    if (visited.has(url)) return; visited.add(url);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('model source unavailable');
    sources.set(url, stamp(response));
    const source = await response.text(), imports = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)];
    await Promise.all(imports.filter(m => m[1].startsWith('.')).map(m => discover(new URL(m[1], url).href)));
  };
  const text = value => { readout.textContent = value; readout.dataset.status = value; };
  try { await Promise.all(['../finallab/model.js', '../finallab/schemes.js', '../finallab/appearance.js']
    .map(path => discover(new URL(path, import.meta.url).href))); }
  catch { text('模型同步暂不可用 · 刷新可重试'); return { stop() {} }; }
  readout.dataset.files = String(sources.size);
  text('机甲已连接成品间 · 自动同步');
  let timer;
  const check = async () => {
    if (stopped) return;
    if (document.visibilityState !== 'hidden') try {
      const responses = await Promise.all([...sources].map(async ([url, old]) => {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(4000) });
        return { url, changed: response.ok && stamp(response) !== old };
      }));
      if (responses.some(r => r.changed)) {
        text('成品间模型已更新 · 正在同步');
        // A save can span several files; confirm once before paying for a reload.
        await new Promise(resolve => setTimeout(resolve, 1200));
        const again = await Promise.all(responses.filter(r => r.changed).map(async r => {
          const response = await fetch(r.url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(4000) });
          return response.ok && stamp(response) !== sources.get(r.url);
        }));
        if (!again.some(Boolean)) { text('模型保存中 · 稍后再同步'); }
        else {
          // Hard guard against a save loop: never auto-reload more than three times in ten minutes.
          let guard = { t: 0, n: 0 };
          try { guard = JSON.parse(sessionStorage.getItem(GUARD) || 'null') || guard; } catch {}
          const now = Date.now();
          if (now - guard.t > 600000) { guard.t = now; guard.n = 0; }
          guard.n++;
          sessionStorage.setItem(GUARD, JSON.stringify(guard));
          if (guard.n > 3) {
            stopped = true;
            text('检测到频繁更新 · 已暂停自动同步，请手动刷新');
            return;
          }
          await Promise.all([...sources.keys()].map(url => fetch(url, { cache: 'no-cache' })));
          const inputs = {};
          document.querySelectorAll('#panel input, #panel select').forEach(e => inputs[label(e)] = e.type === 'checkbox' ? e.checked : e.value);
          sessionStorage.setItem(KEY, JSON.stringify({ inputs, camera: { p: camera.position.toArray(), q: camera.quaternion.toArray(), f: camera.fov }, target: controls.target.toArray(), view: views?.state.active }));
          location.reload(); return;
        }
      }
      text('机甲已连接成品间 · 自动同步');
    } catch { text('模型同步连接中 · 稍后自动重试'); }
    timer = setTimeout(check, 120000);
  };
  timer = setTimeout(check, 120000);
  return { stop() { stopped = true; clearTimeout(timer); }, get files() { return sources.size; } };
}
