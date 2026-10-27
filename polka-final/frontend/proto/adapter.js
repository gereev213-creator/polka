/* Связка прототипа с нашим бэкендом.
   Авторизация — Telegram initData, как в основном приложении. */
(function () {
  const TG = window.Telegram && window.Telegram.WebApp;
  if (TG && TG.ready) TG.ready();
  if (TG && TG.expand) TG.expand();

  function initData() {
    return (TG && TG.initData) || '';
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const d = initData();
    if (d) headers['X-Telegram-Init-Data'] = d;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // Наши объявления → формат карточек прототипа
  function toLot(a, i) {
    const photos = a.photos ? String(a.photos).split(',')[0] : '';
    return {
      id: a.id,
      title: (a.title || '').slice(0, 40),
      full: a.title || '',
      price: a.price || 0,
      img: photos && photos.startsWith('http') ? photos : '',
      fav: !!a.is_favorite,
      tag: a.category || '',
      market: '',
      meta: [a.city, a.hours_ago != null ? a.hours_ago + ' ч назад' : '']
        .filter(Boolean).join(' · '),
      desc: a.description || '',
      url: a.source_url || '',
    };
  }

  async function loadLots() {
    try {
      const data = await api('/api/findings?limit=40');
      const items = (data.items || []).map(toLot);
      if (window.setLots && items.length) {
        window.setLots(items);
        if (typeof window.renderGrids === 'function') window.renderGrids();
        if (typeof window.renderFavs === 'function') window.renderFavs();
      }
      return items.length;
    } catch (e) {
      console.warn('lots:', e.message);
      return 0;
    }
  }

  // Создание критерия из формы «Новый поиск»
  async function createSearch(payload) {
    try {
      await api('/api/hunt', { method: 'POST', body: JSON.stringify(payload) });
      if (TG && TG.showAlert) TG.showAlert('Поиск создан — находки придут в течение часа');
      return true;
    } catch (e) {
      if (TG && TG.showAlert) TG.showAlert('Не удалось создать поиск');
      return false;
    }
  }

  window.PolkaAPI = { api, loadLots, createSearch, initData };
  document.addEventListener('DOMContentLoaded', loadLots);
  setTimeout(loadLots, 1500);
})();

/* Кнопка «Открыть на Авито» в карточке товара + сохранение в избранное */
(function () {
  const wrap = () => {
    if (typeof window.openLot !== 'function' || window.openLot.__wrapped) return;
    const orig = window.openLot;
    const wrapped = function (id) {
      const res = orig.apply(this, arguments);
      try {
        const lot = (window.LOTS || []).find((x) => x.id === id);
        const host = document.querySelector('#s-product .pbody') ||
                     document.querySelector('#s-product');
        const old = document.getElementById('lotOpen');
        if (old) old.remove();
        if (lot && lot.url) {
          const btn = document.createElement('a');
          btn.id = 'lotOpen';
          btn.href = lot.url;
          btn.target = '_blank';
          btn.rel = 'noopener';
          btn.className = 'bigbtn';
          btn.style.display = 'block';
          btn.style.textAlign = 'center';
          btn.style.lineHeight = '54px';
          btn.style.textDecoration = 'none';
          btn.style.marginTop = '12px';
          btn.textContent = 'Открыть на Авито';
          host.appendChild(btn);
        }
      } catch (e) {}
      return res;
    };
    wrapped.__wrapped = true;
    window.openLot = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrap);
  setTimeout(wrap, 800);
})();

/* ── Мои поиски, история, профиль ──────────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';

  function critCard(c) {
    const paused = !c.active;
    return `<article class="card scard" data-crit="${c.id}">
      <div class="top"><h3>${(c.query || 'поиск').slice(0, 30)}</h3>
      <button class="pause" data-toggle="${c.id}">
        <svg width="15" height="15"><use href="#i-${paused ? 'play' : 'pause'}"/></svg>
      </button></div>
      <div class="chips">
        ${c.max_price ? `<span class="chip">до ${fmt(c.max_price)}</span>` : ''}
        ${c.city ? `<span class="chip">${c.city}</span>` : ''}
        <span class="chip">${paused ? 'на паузе' : 'активен'}</span>
      </div>
    </article>`;
  }

  async function loadSearches() {
    try {
      const data = await window.PolkaAPI.api('/api/hunt');
      const items = data.items || [];
      const box = $('searchList');
      if (!box) return;
      if (!items.length) {
        box.innerHTML = '<div class="card" style="padding:18px;text-align:center">' +
          'Пока нет поисков. Создайте первый — находки придут в течение часа.</div>';
        return;
      }
      box.innerHTML = items.map(critCard).join('');
      box.querySelectorAll('[data-toggle]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-toggle');
          const crit = items.find((x) => String(x.id) === String(id));
          try {
            await window.PolkaAPI.api('/api/hunt?id=' + id, {
              method: 'PATCH',
              body: JSON.stringify({ active: crit && crit.active ? 0 : 1 }),
            });
            loadSearches();
          } catch (err) { }
        });
      });
    } catch (e) { }
  }

  async function loadProfile() {
    try {
      const data = await window.PolkaAPI.api('/api/me');
      const u = data.user || {};
      const ht = $('handleText');
      if (ht) ht.textContent = u.name ? '@' + String(u.name).replace(/\s+/g, '').toLowerCase() : '@гость';
      const plus = $('pluspill');
      if (plus) plus.style.display = (data.plan && data.plan !== 'trial') ? 'inline-flex' : 'none';
      const stats = document.querySelectorAll('#s-profile .stats b');
      if (stats.length >= 3 && data.stats) {
        if (data.stats.ads != null) stats[0].textContent = data.stats.ads;
        if (data.stats.favorites != null) stats[2].textContent = data.stats.favorites;
      }
    } catch (e) { }
  }

  const wrapGo = () => {
    if (typeof window.go !== 'function' || window.go.__wrapped) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'searches' || name === 'history') loadSearches();
      if (name === 'profile') loadProfile();
      return r;
    };
    wrapped.__wrapped = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrapGo);
  setTimeout(wrapGo, 800);
})();

/* ── Тарифы и оплата ───────────────────────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n || 0).toLocaleString('ru-RU');

  let plans = [];

  async function loadPlans() {
    try {
      const data = await window.PolkaAPI.api('/api/pay/plans');
      plans = data.plans || data.items || [];
      const payBtn = $('payBtn');
      if (payBtn && plans.length) {
        const main = plans.find((p) => p.product === 'plus_30') || plans[0];
        if (main && main.amount) {
          const price = $('priceNow');
          if (price) price.innerHTML = fmt(main.amount) + ' <span>руб/мес</span>';
        }
        payBtn.onclick = () => buy(plans.find((p) => p.product === 'plus_30') || plans[0]);
      }
      if (data.plan && data.plan !== 'trial') {
        const title = $('trialTitle');
        if (title) title.textContent = 'Плюс активен';
      }
    } catch (e) { }
  }

  async function buy(plan) {
    if (!plan) return;
    try {
      const res = await window.PolkaAPI.api('/api/pay/cispay/create', {
        method: 'POST',
        body: JSON.stringify({ product: plan.product }),
      });
      const url = res.pay_url || res.url || res.link;
      const TG = window.Telegram && window.Telegram.WebApp;
      if (url && TG && TG.openLink) TG.openLink(url);
      else if (url) window.open(url, '_blank');
      else if (TG && TG.showAlert) TG.showAlert('Не удалось создать счёт');
    } catch (e) {
      const TG = window.Telegram && window.Telegram.WebApp;
      if (TG && TG.showAlert) TG.showAlert('Оплата временно недоступна');
    }
  }

  const wrapGo = () => {
    if (typeof window.go !== 'function' || window.go.__pay) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'tariffs') loadPlans();
      return r;
    };
    wrapped.__pay = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrapGo);
  setTimeout(wrapGo, 800);
  window.PolkaBuy = buy;
})();

/* ── История, новый поиск, избранное ───────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';

  // История: находки, сгруппированные по критериям
  async function loadHistory() {
    const box = document.querySelector('#s-history .scroll');
    if (!box) return;
    try {
      const [crits, finds] = await Promise.all([
        window.PolkaAPI.api('/api/hunt'),
        window.PolkaAPI.api('/api/findings?limit=60'),
      ]);
      const items = finds.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="card" style="padding:18px;text-align:center">' +
          'Пока нет находок. Как только появятся — будут здесь.</div>';
        return;
      }
      const rows = items.map((a) => {
        const ph = a.photos ? String(a.photos).split(',')[0] : '';
        const bg = ph && ph.startsWith('http') ? `style="background-image:url('${ph}')"` : '';
        return `<button class="hrow" data-open="${a.id}">
          <span class="hth" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span class="who"><b>${(a.title || '').slice(0, 34)}</b>
          <span class="hp">${fmt(a.price)}</span></span>
          <span class="chev"><svg width="12" height="12"><use href="#i-d"/></svg></span>
        </button>`;
      }).join('');
      const c = (crits.items || [])[0];
      box.innerHTML = `<div class="card group">
        <div class="ghead"><h3>${c ? (c.query || 'находки') : 'находки'}</h3>
        <span class="count">${items.length}</span></div>${rows}</div>`;
    } catch (e) { }
  }

  // Новый поиск: отправка формы
  function wireForm() {
    const form = $('searchForm');
    if (!form || form.__wired) return;
    form.__wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = ($('q') && $('q').value || '').trim();
      const raw = ($('maxprice') && $('maxprice').value || '').replace(/[^0-9]/g, '');
      if (q.length < 2) return;
      // Выбранные критерии и минус-слова уходят в критерий: по ним отбирает сервер
      const chips = [...document.querySelectorAll('#searchForm .chip.on')]
        .map((b) => (b.textContent || '').trim()).filter(Boolean);
      const minus = [...document.querySelectorAll('#searchForm input')]
        .map((i) => (i.placeholder || '').includes('запчасти') ? i.value.trim() : '')
        .filter(Boolean).join(',');
      const ok = await window.PolkaAPI.createSearch({
        query: q,
        max_price: Number(raw) || 0,
        requirements: chips.join(', '),
        exclude: minus,
      });
      if (ok) { form.reset(); document.querySelectorAll('#searchForm .chip.on').forEach((c) => c.classList.remove('on')); if (typeof go === 'function') go('searches'); }
    });
  }

  // Избранное: сердце на карточке лота
  function wireHearts() {
    document.addEventListener('click', async (e) => {
      const h = e.target.closest && e.target.closest('.heart');
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      const article = h.closest('[data-open]');
      const id = article && article.getAttribute('data-open');
      if (!id) return;
      const on = h.classList.contains('on');
      h.classList.toggle('on', !on);
      try {
        await window.PolkaAPI.api('/api/ads/' + id + '/favorite', {
          method: on ? 'DELETE' : 'POST',
        });
      } catch (err) { h.classList.toggle('on', on); }
    }, true);
  }

  const wrapGo2 = () => {
    if (typeof window.go !== 'function' || window.go.__hist) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'history') loadHistory();
      if (name === 'newsearch') wireForm();
      return r;
    };
    wrapped.__hist = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', () => { wrapGo2(); wireHearts(); });
  setTimeout(() => { wrapGo2(); wireHearts(); }, 800);
})();

/* ── Мои объявления, создание лота, рефералка ──────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';

  async function loadMyAds() {
    const box = $('myList');
    if (!box) return;
    try {
      const data = await window.PolkaAPI.api('/api/my-ads');
      const items = data.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="card" style="padding:18px;text-align:center">' +
          'Своих объявлений пока нет. Нажмите «+», чтобы выставить лот.</div>';
        return;
      }
      box.innerHTML = items.map((a) => {
        const ph = a.photos ? String(a.photos).split(',')[0] : '';
        const bg = ph && ph.startsWith('http') ? `style="background-image:url('${ph}')"` : '';
        const st = a.status === 'sold' ? 'Продано' : (a.status === 'draft' ? 'Черновик' : 'Активно');
        return `<article class="card fav" data-open="${a.id}">
          <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span><h3>${(a.title || '').slice(0, 34)}</h3>
          <span class="pricepill">${fmt(a.price)}</span><br>
          <span class="status">${st}</span></span></article>`;
      }).join('');
    } catch (e) { }
  }

  function wirePost() {
    const form = $('postForm');
    if (!form || form.__wired) return;
    form.__wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = ($('adTitle') && $('adTitle').value || '').trim();
      const price = Number((($('adPrice') && $('adPrice').value) || '').replace(/[^0-9]/g, '')) || 0;
      if (title.length < 3) return;
      const cat = (document.querySelector('[data-choice="cat"] .chip.on') || {}).textContent || 'Другое';
      const cond = (document.querySelector('[data-choice="cond"] .chip.on') || {}).textContent || '';
      const city = ($('adCity') && $('adCity').value || '').trim();
      try {
        await window.PolkaAPI.api('/api/ads', {
          method: 'POST',
          body: JSON.stringify({ title, price, category: cat.trim(), condition: cond.trim(), city }),
        });
        const TG = window.Telegram && window.Telegram.WebApp;
        if (TG && TG.showAlert) TG.showAlert('Объявление опубликовано');
        form.reset();
      } catch (err) {
        const TG = window.Telegram && window.Telegram.WebApp;
        if (TG && TG.showAlert) TG.showAlert('Не удалось опубликовать');
      }
    });
  }

  async function loadReferrals() {
    try {
      const data = await window.PolkaAPI.api('/api/referral');
      const code = data.code || data.link || '';
      const link = data.link || (code ? ('https://t.me/polka_bot?start=' + code) : '');
      if (link) {
        const b = document.querySelector('#s-referrals .linkin b');
        if (b) b.textContent = link.replace('https://', '');
        window.__refLink = link;
        // кнопка «Копировать» в дизайне зовёт copyLink() — подменяем на реальную ссылку
        window.copyLink = function () {
          try { navigator.clipboard.writeText(link); } catch (e) {}
          const TG = window.Telegram && window.Telegram.WebApp;
          if (TG && TG.showAlert) TG.showAlert('Ссылка скопирована');
        };
      }
      const earned = document.querySelector('#s-referrals .earned');
      if (earned && data.earned != null) earned.textContent = 'Заработано: ' + fmt(data.earned);
    } catch (e) { }
  }


  // Избранное: список из /api/favorites (а не фильтр по лотам)
  async function loadFavs() {
    const box = document.getElementById('favList');
    if (!box) return;
    try {
      const data = await window.PolkaAPI.api('/api/favorites');
      const items = data.items || [];
      const empty = document.getElementById('favEmpty');
      if (!items.length) {
        box.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      box.innerHTML = items.map((a) => {
        const ph = a.photos ? String(a.photos).split(',')[0] : '';
        const bg = ph && ph.startsWith('http') ? `style="background-image:url('${ph}')"` : '';
        const price = (a.price || 0).toLocaleString('ru-RU') + ' \u20BD';
        return `<article class="card fav" data-open="${a.id}">
          <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span><h3>${(a.title || '').slice(0, 34)}</h3>
          <span class="pricepill">${price}</span><br>
          <span class="status">${a.city || ''}</span></span></article>`;
      }).join('');
    } catch (e) { }
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__rest) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'myads') loadMyAds();
      if (name === 'favorites') loadFavs();
      if (name === 'post') wirePost();
      if (name === 'referrals') loadReferrals();
      return r;
    };
    wrapped.__rest = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrap);
  setTimeout(wrap, 800);
})();

/* ── Промокод и правовые страницы ──────────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const TG = () => (window.Telegram && window.Telegram.WebApp) || null;

  // Промокод: применяем через наш API, ответ показываем в pmsg
  window.applyPromo = async function () {
    const inp = $('code');
    const msg = $('pmsg');
    const off = $('off');
    const code = (inp && inp.value || '').trim().toUpperCase();
    if (!code) return;
    if (msg) { msg.textContent = 'Проверяем…'; msg.style.display = 'block'; }
    try {
      const res = await window.PolkaAPI.api('/api/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      const pct = res.percent || res.discount || 0;
      if (msg) msg.textContent = pct ? ('Скидка ' + pct + '%') : 'Промокод применён';
      if (off && pct) { off.textContent = '−' + pct + '%'; off.style.display = 'inline'; }
      window.__promo = code;
    } catch (e) {
      if (msg) msg.textContent = 'Промокод не найден';
      if (off) off.style.display = 'none';
      window.__promo = '';
    }
  };

  // Правовые страницы: показываем текстом поверх экрана
  const LEGAL = {
    privacy: {
      title: 'Политика конфиденциальности',
      text: [
        'Мы собираем минимум данных, необходимых для работы сервиса:',
        '• идентификатор Telegram и имя — для входа и вашего профиля;',
        '• параметры поисков (слова, цена, город) — чтобы находить лоты;',
        '• сохранённые лоты и объявления — для избранного и барахолки.',
        'Мы не передаём ваши данные третьим лицам, кроме платёжного провайдера при оплате.',
        'Данные хранятся на серверах в России. Удалить аккаунт можно по запросу в поддержку.',
        'Контакт: @polka_support',
      ],
    },
    terms: {
      title: 'Условия использования',
      text: [
        'Сервис «ПОЛКА» помогает находить объявления и вести свои лоты.',
        '1. Мы не являемся стороной сделки между покупателем и продавцом.',
        '2. Находки формируются автоматически; мы не гарантируем наличие товара и его качество.',
        '3. Подписка «Плюс» оплачивается вперёд. Возврат — в течение 24 часов, если сервис не использовался.',
        '4. Запрещено публиковать запрещённые законом товары и копии брендов под видом оригинала.',
        '5. Мы можем ограничить доступ при нарушении условий.',
        'Поддержка: @polka_support',
      ],
    },
  };

  function showLegal(kind) {
    const doc = LEGAL[kind];
    if (!doc) return;
    const old = document.getElementById('legalSheet');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'legalSheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(20,40,70,.45);'
      + 'display:flex;align-items:flex-end';
    wrap.innerHTML = `<div style="background:#fff;color:#2C2C2C;width:100%;max-height:82vh;overflow:auto;border-radius:24px 24px 0 0;padding:20px 18px 28px;font-size:13px;line-height:1.5">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <b style="font-size:15px">${doc.title}</b>
        <button id="legalClose" style="width:32px;height:32px;border-radius:50%;background:#E3EDFD;color:#3373FA;font-size:16px">✕</button>
      </div>
      ${doc.text.map((p) => `<p style="margin:0 0 8px">${p}</p>`).join('')}
    </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    const btn = document.getElementById('legalClose');
    if (btn) btn.onclick = () => wrap.remove();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.mrow');
    if (!b) return;
    const txt = (b.textContent || '').toLowerCase();
    if (txt.includes('политика')) { e.preventDefault(); e.stopPropagation(); showLegal('privacy'); }
    if (txt.includes('условия')) { e.preventDefault(); e.stopPropagation(); showLegal('terms'); }
  }, true);

  window.PolkaLegal = showLegal;
})();
