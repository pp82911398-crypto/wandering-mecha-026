// Shared scene navigation: one tab strip at the top centre of every page, kept apart from each page's
// own control panel. Usage: <script src="../scenenav.js" data-current="studio|port|hangar|dome" [data-mobile-top="56"]></script>
(function () {
  const me = document.currentScript, cur = me?.dataset.current || '';
  const base = new URL('.', me?.src || location.href).href;          // project root (this file lives there)
  const SCENES = [
    ['studio', '成品间', 'finallab/?scheme=hazard'],
    ['port', '港区外景', 'portstorm/?q=low'],
    ['hangar', '机库内', 'hangar/'],
    ['dome', '穹顶机场', 'domelab/'],
  ];
  const css = document.createElement('style');
  css.textContent = `
#sceneNav{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:2px;
  padding:3px;background:rgba(8,11,13,.82);border:1px solid rgba(255,171,61,.35);border-radius:6px;backdrop-filter:blur(8px);
  font:12px/1 "PingFang SC","Noto Sans SC",sans-serif;letter-spacing:.06em;box-shadow:0 4px 18px rgba(0,0,0,.35)}
#sceneNav .lbl{padding:0 8px 0 6px;color:#7d868c;font-size:10px;letter-spacing:.18em}
#sceneNav a{color:#c9d1d6;text-decoration:none;padding:7px 12px;border-radius:4px;white-space:nowrap}
#sceneNav a:hover{background:rgba(255,255,255,.08);color:#fff}
#sceneNav a.on{background:#ffab3d;color:#15181a;font-weight:700}
#sceneNav .doc{color:#8fa3ae;font-size:11px;padding:7px 9px;border-left:1px solid rgba(255,255,255,.12);border-radius:0;margin-left:4px}
body.shot #sceneNav{display:none}
@media (max-width:820px){#sceneNav{top:var(--navTopM,12px);right:12px;left:auto;transform:none}#sceneNav .lbl{display:none}#sceneNav a{padding:7px 9px}}`;
  document.head.appendChild(css);
  const nav = document.createElement('nav'); nav.id = 'sceneNav';
  if (me?.dataset.mobileTop) nav.style.setProperty('--navTopM', me.dataset.mobileTop + 'px');   // narrow screens: below the page's own top-right buttons
  nav.innerHTML = '<span class="lbl">场景</span>' + SCENES.map(([k, t, href]) => `<a href="${base}${href}" class="${k === cur ? 'on' : ''}">${t}</a>`).join('');
  const add = () => document.body.appendChild(nav);
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
