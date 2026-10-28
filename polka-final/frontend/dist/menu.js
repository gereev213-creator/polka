/* Подключите перед </body>: <script src="menu.js"></script> */
(() => {
  if (document.getElementById('polka-reference-menu')) return;
  const css = document.createElement('style');
  css.textContent = `
    #polka-reference-menu, #polka-reference-menu * {box-sizing:border-box}
    #polka-reference-menu {position:fixed;bottom:max(12px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(830px,calc(100% - 28px));display:flex;align-items:center;gap:clamp(10px,2.7vw,22px);z-index:9999;font-family:system-ui,sans-serif}
    #polka-reference-menu .polka-bar {height:clamp(70px,15.3vw,134px);flex:1;min-width:0;display:flex;align-items:center;padding:clamp(5px,1.1vw,10px);border-radius:999px;background:linear-gradient(125deg,#3d77f8,#628df0);box-shadow:inset 0 2px 3px rgba(255,255,255,.38)}
    #polka-reference-menu button {cursor:pointer;border:0;-webkit-tap-highlight-color:transparent}
    #polka-reference-menu .polka-item {flex:1;height:100%;min-width:0;border-radius:999px;background:transparent;color:#c1d4fb;display:grid;place-items:center;padding:0}
    #polka-reference-menu .polka-item[aria-current="page"] {color:white;background:linear-gradient(135deg,rgba(122,166,255,.48),rgba(155,190,255,.25));box-shadow:inset 0 0 0 2px rgba(218,233,255,.85),0 2px 5px rgba(48,103,229,.1)}
    #polka-reference-menu svg {width:clamp(23px,4.8vw,42px);height:clamp(23px,4.8vw,42px);display:block;fill:currentColor}
    #polka-reference-menu .polka-add {width:clamp(70px,15.3vw,134px);height:clamp(70px,15.3vw,134px);flex:none;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#4380fb,#648ff0);box-shadow:inset 0 2px 3px rgba(255,255,255,.38)}
    #polka-reference-menu .polka-add svg {width:clamp(30px,5.8vw,50px);height:clamp(30px,5.8vw,50px)}
    #polka-reference-menu button:focus-visible {outline:3px solid white;outline-offset:-5px}
  `;
  document.head.appendChild(css);
  const icons = {
    home:'<path d="M12 2 1 11h2v10h7v-7h4v7h7V11h2L12 2Z"/>',
    market:'<path d="M3 4h18l1 5c0 1.7-1.3 3-3 3-1.2 0-2.2-.7-2.7-1.7-.5 1-1.6 1.7-2.8 1.7s-2.3-.7-2.8-1.7C10.2 11.3 9.2 12 8 12s-2.2-.7-2.7-1.7C4.8 11.3 3.8 12 3 12c-1.1 0-2-.9-2-2l2-6Zm0 9.2c1.1.2 2.1-.1 3-.7 1.3.9 2.9 1 4.2.1 1.4.9 3.1.9 4.5 0 1.4.9 3 .8 4.3-.1.6.4 1.3.7 2 .7V21h-6v-6H9v6H3v-7.8Z"/>',
    saved:'<path d="M5 2h14a1 1 0 0 1 1 1v19l-8-5.7L4 22V3a1 1 0 0 1 1-1Z"/>',
    profile:'<circle cx="12" cy="7" r="4.5"/><path d="M3.2 20c.5-4.1 4.3-7 8.8-7s8.3 2.9 8.8 7a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1Z"/>'
  };
  const items = [['home','Главная'],['market','Маркет'],['saved','Избранное'],['profile','Профиль']];
  const menu=document.createElement('nav'); menu.id='polka-reference-menu'; menu.setAttribute('aria-label','Основное меню');
  menu.innerHTML='<div class="polka-bar">'+items.map(([id,label])=>`<button type="button" class="polka-item" data-page="${id}" aria-label="${label}" ${id==='home'?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg></button>`).join('')+'</div><button type="button" class="polka-add" data-page="add" aria-label="Добавить объявление"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v7h7a1.5 1.5 0 0 1 0 3h-7v7a1.5 1.5 0 0 1-3 0v-7h-7a1.5 1.5 0 0 1 0-3h7v-7A1.5 1.5 0 0 1 12 2Z"/></svg></button>';
  document.body.appendChild(menu);
  menu.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.classList.contains('polka-item')){menu.querySelectorAll('[aria-current]').forEach(el=>el.removeAttribute('aria-current'));btn.setAttribute('aria-current','page')}document.dispatchEvent(new CustomEvent('polka:navigate',{detail:{page:btn.dataset.page}}))});
})();
