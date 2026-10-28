/* Связка меню из Figma-фрейма с экранами приложения */
(() => {
  const PAGE = { home: 'home', market: 'market', saved: 'favorites', profile: 'profile', add: 'post' };
  const BACK = { 's-home': 'home', 's-market': 'market', 's-favorites': 'saved', 's-profile': 'profile' };
  const HIDDEN_ON = ['s-product', 's-post', 's-newsearch', 's-myads', 's-admin', 's-moderation'];

  document.addEventListener('polka:navigate', (e) => {
    const page = PAGE[(e.detail || {}).page];
    if (!page) return;
    try { if (typeof window.go === 'function') window.go(page, true); } catch (err) { }
  });

  function sync() {
    const menu = window.PolkaMenu && window.PolkaMenu.el;
    if (!menu) return;
    const active = (document.querySelector('.screen.active') || {}).id || 's-home';
    menu.style.setProperty('display', HIDDEN_ON.includes(active) ? 'none' : 'flex', 'important');
    const page = BACK[active];
    if (!page) return;
    const cur = menu.querySelector('.polka-item[aria-current="page"]');
    if (cur && cur.dataset.page === page) return;
    if (window.PolkaMenu.setActive) window.PolkaMenu.setActive(page);
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__menu) return;
    const orig = window.go;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      setTimeout(sync, 30);
      setTimeout(sync, 180);
      return r;
    };
    wrapped.__menu = true;
    window.go = wrapped;
  };

  document.addEventListener('DOMContentLoaded', () => { wrap(); sync(); setTimeout(() => { wrap(); sync(); }, 500); });
  setTimeout(() => { wrap(); sync(); }, 1100);
  setInterval(sync, 900);
})();
