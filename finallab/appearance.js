// Shared appearance settings, published only by finallab and consumed only by domelab.
const KEY = 'mech026.finishedAppearance.v1';
export function readFinishedAppearance() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function publishFinishedAppearance(read) {
  const ids = new Set(['finishScheme', 'finishWear', 'finishLight', 'finishForehead', 'jointGlowToggle', 'surfToggle', 'finishRotor']);
  const save = () => localStorage.setItem(KEY, JSON.stringify(read()));
  const changed = event => { if (ids.has(event.target.id)) queueMicrotask(save); };
  document.getElementById('panel').addEventListener('input', changed);
  document.getElementById('panel').addEventListener('change', changed);
  document.getElementById('panel').addEventListener('click', event => { if (event.target.closest('button')) queueMicrotask(save); });
  save();
}
export function followFinishedAppearance(apply) {
  const changed = event => { if (event.key === KEY && event.newValue) { try { apply(JSON.parse(event.newValue)); } catch (error) { console.error('[model sync]', error); } } };
  addEventListener('storage', changed);
  return () => removeEventListener('storage', changed);
}
