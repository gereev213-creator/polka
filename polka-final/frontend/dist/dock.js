/* ПОЛКА: нижняя панель по макету заказчика (polka-menu). Подключение: <script src="dock.js"></script> */
(() => {
  if (document.getElementById('polka-dock')) return;

  const style = document.createElement('style');
  style.textContent = `
    #polka-dock, #polka-dock * { box-sizing:border-box; }
    #polka-dock { position:fixed; z-index:9999; left:50%; bottom:max(18px,env(safe-area-inset-bottom));
      transform:translateX(-50%); width:min(440px,calc(100% - 24px)); padding:7px;
      display:flex; align-items:center; gap:3px; border:1px solid rgba(255,255,255,.95);
      border-radius:27px; background:rgba(239,246,255,.82);
      box-shadow:0 14px 38px rgba(39,75,131,.22),inset 0 1px 2px #fff,inset 0 -3px 8px rgba(83,122,173,.08);
      backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px);
      font-family:system-ui,-apple-system,sans-serif; }
    #polka-dock[hidden] { display:none !important; }
    #polka-dock button { font:inherit; cursor:pointer; border:0; -webkit-tap-highlight-color:transparent; }
    #polka-dock .pd-tab { position:relative; min-width:0; height:57px; flex:1;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
      padding:3px 0; color:#8494aa; background:transparent; border-radius:19px;
      font-size:9px; font-weight:750; white-space:nowrap; overflow:hidden; }
    #polka-dock .pd-tab span { max-width:100%; overflow:hidden; text-overflow:ellipsis; }
    #polka-dock .pd-tab svg { width:23px; height:23px; stroke:currentColor; stroke-width:1.9;
      fill:none; stroke-linecap:round; stroke-linejoin:round; }
    #polka-dock .pd-tab[aria-current="page"] { color:#3373fa;
      background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(226,238,255,.95));
      box-shadow:0 3px 12px rgba(51,115,250,.20),inset 0 1px 1px #fff,inset 0 -2px 5px rgba(51,115,250,.08); }
    #polka-dock .pd-profile { width:44px; height:44px; flex:none; margin:0 2px;
      border-radius:50%; color:#fff; font-size:19px; font-weight:900;
      background:linear-gradient(145deg,#71a7ff,#3373fa 65%,#1d55cf);
      box-shadow:0 5px 12px rgba(51,115,250,.34),inset 0 2px 3px rgba(255,255,255,.55),inset 0 -3px 5px rgba(15,55,151,.23); }
    #polka-dock .pd-profile[aria-current="page"] { outline:3px solid rgba(51,115,250,.24); outline-offset:3px; }
    #polka-dock button:focus-visible { outline:3px solid #3373fa; outline-offset:2px; }
    /* старое меню прототипа больше не используется */
    #nav { display:none !important; }
  `;
  document.head.appendChild(style);

  const icons = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M10 20v-5h4v5"/>',
    market: '<path d="M4 9h16l-1 11H5L4 9Z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/>',
    favorites: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/>',
    post: '<path d="M12 5v14M5 12h14"/>',
  };
  const items = [
    ['home', 'Находки'],
    ['market', 'Барахолка'],
    ['favorites', 'Избранное'],
    ['post', 'Создать'],
  ];

  const dock = document.createElement('nav');
  dock.id = 'polka-dock';
  dock.setAttribute('aria-label', 'Основное меню');
  dock.innerHTML = items.map(([id, label]) => `<button type="button" class="pd-tab" data-page="${id}"` +
      `${id === 'home' ? ' aria-current="page"' : ''}>` +
      `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${label}</span></button>`).join('') +
    '<button type="button" class="pd-profile" data-page="profile" aria-label="Профиль">G</button>';
  document.body.appendChild(dock);

  const HIDDEN_ON = ['s-product', 's-post', 's-newsearch', 's-myads', 's-admin', 's-moderation'];
  const PAGE_OF = { 's-home': 'home', 's-market': 'market', 's-favorites': 'favorites', 's-profile': 'profile' };

  const profileBtn = dock.querySelector('.pd-profile');

  function sync() {
    const active = (document.querySelector('.screen.active') || {}).id || 's-home';
    dock.hidden = HIDDEN_ON.includes(active);
    const page = PAGE_OF[active];
    dock.querySelectorAll('.pd-tab').forEach((tab) => {
      if (tab.dataset.page === page) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    if (page === 'profile') profileBtn.setAttribute('aria-current', 'page');
    else profileBtn.removeAttribute('aria-current');
  }

  dock.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-page]');
    if (!button) return;
    const page = button.dataset.page;
    dock.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current'));
    button.setAttribute('aria-current', 'page');
    try { if (typeof window.go === 'function') window.go(page, true); } catch (err) { }
  });

  // инициал пользователя в кружке
  function paintInitial() {
    const user = window.__polkaUser || {};
    const fromDom = (document.getElementById('uName') || {}).textContent || '';
    const name = String(user.name || user.username || fromDom || 'G').replace('@', '').trim();
    profileBtn.textContent = (name[0] || 'G').toUpperCase();
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__dock) return;
    const orig = window.go;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      setTimeout(sync, 30);
      setTimeout(sync, 200);
      return r;
    };
    wrapped.__dock = true;
    window.go = wrapped;
  };

  document.addEventListener('DOMContentLoaded', () => {
    wrap(); sync(); paintInitial();
    setTimeout(() => { wrap(); sync(); paintInitial(); }, 600);
  });
  setInterval(() => { sync(); paintInitial(); }, 900);
})();
