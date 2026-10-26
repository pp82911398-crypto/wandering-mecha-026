// One control dock for every scene page: a right-hand column of collapsible categories with the same look
// as the finishing room's panel (details > summary + .sec rows). Pages either build sections with the helpers
// below, or (finishing room) keep their own builder and just take the shared CSS.
const CSS = `
#panel{position:fixed;right:12px;top:var(--dockTop,58px);bottom:var(--dockBottom,12px);width:310px;overflow:auto;z-index:25;
  background:rgba(10,13,16,.84);border:1px solid rgba(255,255,255,.09);backdrop-filter:blur(10px);font:12px/1.4 "PingFang SC","Noto Sans SC",sans-serif;color:#cfd8de;scrollbar-width:thin}
#panel .dock-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(10,13,16,.96);border-bottom:1px solid rgba(255,171,61,.3);
  font:10px/1 "JetBrains Mono",Menlo,monospace;letter-spacing:.18em;color:#9fb0bb}
#panel .dock-head button{font:inherit;letter-spacing:.1em;background:none;border:1px solid rgba(255,255,255,.18);color:#cfd8de;padding:3px 7px;cursor:pointer}
#panel details{border-bottom:1px solid rgba(255,255,255,.07)}
#panel summary{cursor:pointer;padding:10px 12px;font-weight:600;letter-spacing:.06em;color:#e6ebee;list-style:none;user-select:none;display:flex;align-items:baseline;gap:8px}
#panel summary::-webkit-details-marker{display:none}
#panel summary::before{content:"▸";color:#ffab3d;width:10px}#panel details[open]>summary::before{content:"▾"}
#panel summary .en{margin-left:auto;font:9px "JetBrains Mono",Menlo,monospace;letter-spacing:.16em;color:#62778a;font-weight:400}
#panel .sec{padding:2px 12px 12px}
#panel .sub{font:9px "JetBrains Mono",Menlo,monospace;letter-spacing:.16em;color:#62778a;margin:10px 0 4px}
#panel .row{display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:8px;margin:6px 0;color:#9aa6ae}
#panel .row.chk{grid-template-columns:18px 1fr}
#panel input[type=range]{width:100%;accent-color:#ffab3d}
#panel input[type=checkbox]{accent-color:#ffab3d}
#panel b{font-family:"JetBrains Mono",Menlo,monospace;font-weight:400;color:#e9ecee;text-align:right}
#panel select{grid-column:2/4;font:inherit;padding:3px 6px;background:#1a1f24;border:1px solid #3a4148;color:#d9dcdf}
#panel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}
#panel .btns.c3{grid-template-columns:1fr 1fr 1fr}#panel .btns.c1{grid-template-columns:1fr}
#panel button{font:inherit;padding:6px 8px;background:#161b20;border:1px solid #333b42;color:#d9dcdf;cursor:pointer;text-align:left;display:flex;align-items:center;gap:7px;min-width:0}
#panel button:hover{border-color:#ffab3d;color:#fff}
#panel button.on{border-color:#ffab3d;color:#ffab3d;background:rgba(255,171,61,.08)}
#panel button kbd{font:10px "JetBrains Mono",Menlo,monospace;color:#ffab3d;border:1px solid rgba(255,171,61,.45);padding:0 4px;flex:0 0 auto}
#panel .note{color:#6f7b84;font-size:11px;margin:4px 0 6px;line-height:1.5}
body.nopanel #panel{display:none}
@media (max-width:820px){#panel{width:auto;left:12px;top:auto;height:44vh}}
`;
let injected = false;
export function injectDockCss() { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// createDock({ top, bottom, title }) → helpers that build sections in call order
export function createDock({ top = 58, bottom = 12, title = '控制面板 · CONTROL' } = {}) {
  injectDockCss();
  let panel = document.getElementById('panel');
  if (!panel) { panel = document.createElement('aside'); panel.id = 'panel'; document.body.appendChild(panel); }
  panel.style.setProperty('--dockTop', top + 'px'); panel.style.setProperty('--dockBottom', bottom + 'px');
  const head = document.createElement('div'); head.className = 'dock-head';
  head.innerHTML = `<span>${title}</span><button>全部收起</button>`;
  head.querySelector('button').onclick = () => panel.querySelectorAll('details').forEach(d => d.open = false);
  panel.appendChild(head);
  const D = {
    panel,
    section(title, en = '', open = false) {
      const d = document.createElement('details'); d.open = open;
      d.innerHTML = `<summary>${title}<span class="en">${en}</span></summary>`;
      const b = document.createElement('div'); b.className = 'sec'; d.appendChild(b); panel.appendChild(d);
      return b;
    },
    sub(sec, text) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = text; sec.appendChild(s); return s; },
    slider(sec, label, min, max, step, val, fmt, on) {
      const r = document.createElement('label'); r.className = 'row';
      r.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><b></b>`;
      const i = r.querySelector('input'), o = r.querySelector('b');
      const f = () => { o.textContent = fmt ? fmt(+i.value) : (+i.value).toFixed(2); on(+i.value); };
      i.oninput = f; o.textContent = fmt ? fmt(+val) : (+val).toFixed(2); sec.appendChild(r); return i;
    },
    // list: [[label, fn, key?]...]; returns the buttons
    buttons(sec, list, cols = 2) {
      const r = document.createElement('div'); r.className = 'btns' + (cols === 3 ? ' c3' : cols === 1 ? ' c1' : '');
      const out = list.map(([t, fn, key]) => { const b = document.createElement('button'); b.innerHTML = (key ? `<kbd>${key}</kbd>` : '') + `<span>${t}</span>`; b.onclick = fn; r.appendChild(b); return b; });
      sec.appendChild(r); return out;
    },
    check(sec, label, on, checked = false) {
      const r = document.createElement('label'); r.className = 'row chk'; r.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span>${label}</span>`;
      const c = r.querySelector('input'); c.onchange = () => on(c.checked); sec.appendChild(r); return c;
    },
    // move existing page controls in (keeps their listeners)
    adopt(sec, ...els) { for (const e of els) if (e) sec.appendChild(e); },
  };
  return D;
}
