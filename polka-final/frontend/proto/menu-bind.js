/* Связка меню из референса с экранами приложения */
(() => {
  const MENU = () => document.getElementById('polka-reference-menu');
  const PAGE = { home: 'home', market: 'market', saved: 'favorites', profile: 'profile', add: 'post' };
  const BACK = { 's-home': 'home', 's-market': 'market', 's-favorites': 'saved', 's-profile': 'profile' };
  const HIDDEN_ON = ['s-product', 's-post', 's-newsearch', 's-myads', 's-admin', 's-moderation'];

  document.addEventListener('polka:navigate', (e) => {
    const page = PAGE[(e.detail || {}).page];
    if (!page) return;
    try { if (typeof window.go === 'function') window.go(page, true); } catch (err) { }
  });

  function sync() {
    const menu = MENU();
    if (!menu) return;
    const active = (document.querySelector('.screen.active') || {}).id || 's-home';
    menu.style.setProperty('display', HIDDEN_ON.includes(active) ? 'none' : 'flex', 'important');
    const page = BACK[active] || '';
    menu.querySelectorAll('.polka-item').forEach((btn) => {
      if (btn.dataset.page === page) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
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

  document.addEventListener('DOMContentLoaded', () => { wrap(); sync(); setTimeout(() => { wrap(); sync(); }, 600); });
  setTimeout(() => { wrap(); sync(); }, 1200);
  setInterval(sync, 900);
})();
