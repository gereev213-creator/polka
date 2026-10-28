/* Меню из Figma-фрейма «Находки» 2550:20 / 2550:21
   Капсула + белая плашка active + круг «+»
   Подключение: <script src="menu.js"></script> перед menu-bind.js
*/
(() => {
  if (document.getElementById('polka-reference-menu')) return;

  const css = document.createElement('style');
  css.textContent = `
    #polka-reference-menu, #polka-reference-menu * { box-sizing: border-box; }
    #polka-reference-menu {
      position: fixed;
      left: 15px;
      right: 15px;
      bottom: max(15px, env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 9999;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-tap-highlight-color: transparent;
      pointer-events: none;
    }
    #polka-reference-menu button { pointer-events: auto; cursor: pointer; border: 0; margin: 0; padding: 0; }

    /* Капсула — Figma 112° #4780FB → #6B98F5, h=60 */
    #polka-reference-menu .polka-bar {
      position: relative;
      flex: 1 1 auto;
      min-width: 0;
      height: 60px;
      display: flex;
      align-items: center;
      border-radius: 999px;
      overflow: hidden;
      background: linear-gradient(112deg, #4780FB, #6B98F5);
    }

    /* Белая плашка active (Frame glass) */
    #polka-reference-menu .polka-glass {
      position: absolute;
      top: 6px;
      left: 0;
      width: 56px;
      height: 48px;
      border-radius: 19px;
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(226,238,255,.95));
      box-shadow:
        0 3px 12px rgba(51,115,250,.20),
        inset 0 1px 1px #fff,
        inset 0 -2px 5px rgba(51,115,250,.08);
      z-index: 1;
      pointer-events: none;
      transition: left .22s ease;
    }

    #polka-reference-menu .polka-item {
      flex: 1 1 0;
      height: 60px;
      min-width: 0;
      position: relative;
      z-index: 2;
      display: grid;
      place-items: center;
      background: transparent;
      color: #C2D5F8;
    }
    #polka-reference-menu .polka-item[aria-current="page"] {
      color: #3373FA;
    }
    #polka-reference-menu .polka-item svg {
      display: block;
      width: 21px;
      height: 21px;
      fill: currentColor;
    }
    #polka-reference-menu .polka-item[data-page="home"] svg {
      width: 19px;
      height: 19px;
    }

    /* «+» — круг 52, тот же градиент */
    #polka-reference-menu .polka-add {
      flex: 0 0 52px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: #fff;
      background: linear-gradient(112deg, #4780FB, #6B98F5);
    }
    #polka-reference-menu .polka-add svg {
      width: 21px;
      height: 21px;
      display: block;
    }
    #polka-reference-menu button:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    #polka-reference-menu button:active {
      filter: brightness(0.96);
    }
  `;
  document.head.appendChild(css);

  /* Иконки — path из Figma-символов template (#i-home / store / book / user) */
  const icons = {
    home: `<svg viewBox="0 0 19.0667 18.4947" aria-hidden="true"><path d="M9.53333 0L0.572 7.24533C0.190667 7.53133 0 8.008 0 8.48467L0 17.5413C4.23365e-16 17.7942 0.10044 18.0367 0.279225 18.2154C0.45801 18.3942 0.700494 18.4947 0.953333 18.4947L6.67333 18.4947L6.67333 12.2027L12.3933 12.2027L12.3933 18.4947L18.1133 18.4947C18.3662 18.4947 18.6087 18.3942 18.7874 18.2154C18.9662 18.0367 19.0667 17.7942 19.0667 17.5413L19.0667 8.48467C19.0667 8.008 18.876 7.53133 18.4947 7.24533L9.53333 0Z"/></svg>`,
    market: `<svg viewBox="0 0 22 22" aria-hidden="true"><g transform="translate(2.9333 4.0333)"><path d="M0 0L16.1333 0C16.5917 0 16.9583 0.366667 16.9583 0.825L16.9583 2.75C16.9583 3.47935 16.6686 4.17882 16.1529 4.69454C15.6372 5.21027 14.9377 5.5 14.2083 5.5C13.6054 5.50173 13.0187 5.30529 12.5384 4.94091C12.058 4.57653 11.7108 4.0644 11.55 3.48333C11.3504 4.00212 10.9984 4.44826 10.5402 4.76294C10.082 5.07761 9.53918 5.24605 8.98333 5.24605C8.42749 5.24605 7.88469 5.07761 7.4265 4.76294C6.9683 4.44826 6.61622 4.00212 6.41667 3.48333C6.2559 4.0644 5.90863 4.57653 5.42831 4.94091C4.94799 5.30529 4.36123 5.50173 3.75833 5.5C3.02899 5.5 2.32951 5.21027 1.81379 4.69454C1.29806 4.17882 1.00833 3.47935 1.00833 2.75L1.00833 0.825C1.00833 0.366667 1.375 0 1.83333 0L0 0Z"/></g><g transform="translate(4.2167 10.45)"><path d="M0 0.733333L0 7.24167C0 7.79167 0.366667 8.15833 0.916667 8.15833L4.21667 8.15833L4.21667 4.03333C4.21667 3.575 4.58333 3.20833 5.04167 3.20833L8.525 3.20833C8.98333 3.20833 9.35 3.575 9.35 4.03333L9.35 8.15833L12.65 8.15833C13.2 8.15833 13.5667 7.79167 13.5667 7.24167L13.5667 0.733333C12.6861 0.747595 11.8223 0.491659 11.0917 0C10.3667 0.508838 9.50242 0.781846 8.61667 0.781846C7.73091 0.781846 6.86668 0.508838 6.14167 0C5.41665 0.508838 4.55242 0.781846 3.66667 0.781846C2.78091 0.781846 1.91668 0.508838 1.19167 0C0.837058 0.307746 0.434528 0.555457 0 0.733333Z"/></g></svg>`,
    saved: `<svg viewBox="0 0 22 22" aria-hidden="true"><g transform="translate(4.5833 2.75)"><path d="M0.916667 0L11.9167 0C12.1598 4.07082e-16 12.3929 0.0965771 12.5648 0.268485C12.7368 0.440394 12.8333 0.673552 12.8333 0.916667L12.8333 16.6833C12.8333 17.4167 12.0083 17.875 11.3667 17.4167L6.41667 13.75L1.46667 17.4167C0.825 17.875 0 17.4167 0 16.6833L0 0.916667C0 0.673552 0.0965773 0.440394 0.268486 0.268485C0.440394 0.0965771 0.673552 4.07082e-16 0.916667 0Z"/></g></svg>`,
    profile: `<svg viewBox="0 0 22 22" aria-hidden="true"><g transform="translate(7.0583 2.5667)"><path d="M3.94167 0C2.89627 8.14164e-16 1.89369 0.415281 1.15449 1.15449C0.415282 1.89369 1.62833e-15 2.89627 0 3.94167C8.14164e-16 4.98706 0.415282 5.98964 1.15449 6.72885C1.89369 7.46805 2.89627 7.88333 3.94167 7.88333C4.98706 7.88333 5.98964 7.46805 6.72885 6.72885C7.46805 5.98964 7.88333 4.98706 7.88333 3.94167C7.88333 2.89627 7.46805 1.89369 6.72885 1.15449C5.98964 0.415281 4.98706 8.14164e-16 3.94167 0Z"/></g><g transform="translate(3.5343 12.1)"><path d="M7.46574 0C3.7074 0 0.865736 2.10833 0.0407361 5.225C-0.142597 5.775 0.315736 6.23333 0.957403 6.23333L13.9741 6.23333C14.6157 6.23333 15.0741 5.775 14.8907 5.225C14.0657 2.10833 11.2241 0 7.46574 0Z"/></g></svg>`,
  };

  const items = [
    ['home', 'Главная'],
    ['market', 'Маркет'],
    ['saved', 'Избранное'],
    ['profile', 'Профиль'],
  ];

  const menu = document.createElement('nav');
  menu.id = 'polka-reference-menu';
  menu.setAttribute('aria-label', 'Основное меню');
  menu.innerHTML =
    `<div class="polka-bar">` +
    `<span class="polka-glass" id="polka-menu-glass" aria-hidden="true"></span>` +
    items
      .map(
        ([id, label], i) =>
          `<button type="button" class="polka-item" data-page="${id}" aria-label="${label}"${
            i === 0 ? ' aria-current="page"' : ''
          }>${icons[id]}</button>`
      )
      .join('') +
    `</div>` +
    `<button type="button" class="polka-add" data-page="add" aria-label="Добавить объявление">` +
    `<svg viewBox="0 0 21 21" aria-hidden="true"><path d="M10.5 1.5v18M1.5 10.5h18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>` +
    `</button>`;

  document.body.appendChild(menu);

  function moveGlass(btn) {
    const glass = menu.querySelector('.polka-glass');
    const bar = menu.querySelector('.polka-bar');
    if (!glass || !bar || !btn) return;
    const br = bar.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const gw = glass.offsetWidth || 56;
    const left = r.left - br.left + (r.width - gw) / 2;
    glass.style.left = Math.max(4, left) + 'px';
  }

  function setActive(page) {
    const btn = menu.querySelector(`.polka-item[data-page="${page}"]`);
    menu.querySelectorAll('.polka-item').forEach((el) => el.removeAttribute('aria-current'));
    if (btn) {
      btn.setAttribute('aria-current', 'page');
      requestAnimationFrame(() => moveGlass(btn));
    }
  }

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('polka-item')) setActive(btn.dataset.page);
    document.dispatchEvent(
      new CustomEvent('polka:navigate', { detail: { page: btn.dataset.page } })
    );
  });

  window.addEventListener('resize', () => {
    const cur = menu.querySelector('.polka-item[aria-current="page"]');
    if (cur) moveGlass(cur);
  });

  // API для menu-bind.js
  window.PolkaMenu = {
    setActive,
    moveGlass,
    el: menu,
  };

  requestAnimationFrame(() => {
    const cur = menu.querySelector('.polka-item[aria-current="page"]');
    if (cur) moveGlass(cur);
  });
})();
