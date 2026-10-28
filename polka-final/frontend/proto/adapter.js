/* Связка прототипа с нашим бэкендом.
   Авторизация — Telegram initData, как в основном приложении. */
(function () {

// Пустая лента не должна оставлять голый экран
function paintEmpty(count) {
  const html = `<div class="card" style="padding:22px 18px;text-align:center;grid-column:1/-1">
    <div style="font-size:14px;font-weight:870;margin-bottom:6px">Пока пусто</div>
    <div style="font-size:11px;color:#7A8CA3;line-height:1.4;margin-bottom:14px">
      Создайте поиск — и находки начнут приходить в течение часа.
    </div>
    <button class="bigbtn" style="height:44px;font-size:12px;max-width:220px;margin:0 auto"
            onclick="go('newsearch')">Создать поиск</button>
  </div>`;
  if (count) return;
  ['homeGrid', 'marketGrid'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.querySelector('.card')) el.innerHTML = html;
  });
}

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
    let res;
    try {
      res = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (netErr) {
      const e = new Error('network');
      e.status = 0;
      throw e;
    }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    try {
      return await res.json();
    } catch (parseErr) {
      const e = new Error('bad_json');
      e.status = res.status;
      throw e;
    }
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
      } else {
        paintEmpty(0);
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

  // Карточка поиска — ровно по макету: заголовок, кнопка паузы, чипы и подвал
  function critCard(c) {
    const paused = !c.active;
    const chips = [];
    if (c.max_price) chips.push(`<span class="chip">до ${fmt(c.max_price)}</span>`);
    if (c.min_price) chips.push(`<span class="chip">от ${fmt(c.min_price)}</span>`);
    if (c.city) chips.push(`<span class="chip">${c.city}</span>`);
    if (c.requirements) {
      String(c.requirements).split(',').slice(0, 3).forEach((r) => {
        if (r.trim()) chips.push(`<span class="chip">${r.trim()}</span>`);
      });
    }
    const fresh = c.new_count || 0;
    const when = c.last_run ? 'обновлено ' + String(c.last_run).slice(11, 16) : 'ещё не запускался';
    return `<article class="card scard" data-crit="${c.id}" data-go="history">
      <div class="top"><h3>${(c.query || 'поиск').slice(0, 30)}</h3>
      <button class="pause${paused ? ' is-paused' : ''}" data-toggle="${c.id}">
        <svg width="15" height="15"><use href="#i-${paused ? 'play' : 'pause'}"/></svg>
      </button></div>
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
      <div class="sfoot">
        <span class="newpill">${fresh ? '+' + fresh + ' новых' : (paused ? 'на паузе' : 'активен')}</span>
        <span class="mut">${when}</span>
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
      const av = document.getElementById('avatarCircle');
      const tgUser = (window.Telegram && window.Telegram.WebApp &&
                      window.Telegram.WebApp.initDataUnsafe &&
                      window.Telegram.WebApp.initDataUnsafe.user) || {};
      const photo = tgUser.photo_url || u.photo_url || '';
      if (av) {
        if (photo) {
          av.style.background = `url('${photo}') center/cover`;
          av.style.backgroundSize = 'cover';
          av.textContent = '';
        } else {
          // Нет фото — показываем первую букву имени, а не пустой круг
          const letter = ((tgUser.first_name || u.name || 'П').trim()[0] || 'П').toUpperCase();
          av.style.background = 'var(--grad)';
          av.style.display = 'grid';
          av.style.placeItems = 'center';
          av.style.color = '#fff';
          av.style.fontSize = '34px';
          av.style.fontWeight = '870';
          av.textContent = letter;
        }
      }
      // id нужен, чтобы привязать критерии и находки к аккаунту
      const idNode = document.getElementById('tgUserId');
      if (idNode && u.telegram_id) {
        idNode.style.display = 'block';
        idNode.textContent = 'id: ' + u.telegram_id;
      } else if (idNode) {
        idNode.style.display = 'none';
      }
      const ht = $('handleText');
      if (ht) ht.textContent = u.name ? '@' + String(u.name).replace(/\s+/g, '').toLowerCase() : '@гость';
      const plus = $('pluspill');
      if (plus) plus.style.display = (data.plan && data.plan !== 'trial') ? 'inline-flex' : 'none';
      // Админка видна только администратору
      // Админские пункты видит только администратор
      const tgName = (window.Telegram && window.Telegram.WebApp &&
                      window.Telegram.WebApp.initDataUnsafe &&
                      window.Telegram.WebApp.initDataUnsafe.user &&
                      window.Telegram.WebApp.initDataUnsafe.user.username) || '';
      // username берём и из Telegram, и из ответа /api/me — что-то одно да придёт
      const uname = String(tgName || u.username || '').toLowerCase();
      const LOCAL_ADMINS = ['gereev', 'nikicev2009', 'nikitagereev', 'shytik8'];
      const isAdm = !!(u.is_admin || data.is_admin || window.__isAdmin ||
                       (uname && LOCAL_ADMINS.includes(uname)));
      ['adminRow', 'modRow'].forEach((id) => {
        const row = document.getElementById(id);
        if (row) row.style.display = isAdm ? 'flex' : 'none';
      });
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

  function say(text) {
    const TG = window.Telegram && window.Telegram.WebApp;
    if (TG && TG.showAlert) TG.showAlert(text);
    else alert(text);
  }

  async function buy(plan) {
    if (!plan) return;
    const TG = window.Telegram && window.Telegram.WebApp;
    const tries = [
      ['/api/pay/cispay/create', { product: plan.product }],
      ['/api/pay/paw/create', { product: plan.product, promo: window.__promo || '' }],
    ];
    for (const [path, body] of tries) {
      try {
        const res = await window.PolkaAPI.api(path, { method: 'POST', body: JSON.stringify(body) });
        const url = res.pay_url || res.url || res.link || res.form_url;
        if (url) {
          if (TG && TG.openLink) TG.openLink(url);
          else window.open(url, '_blank');
          return;
        }
        if (res.detail) { say(res.detail); return; }
      } catch (e) {
        // пробуем следующий способ
      }
    }
    say('Оплата картой пока не включена. Напишите в поддержку @polka_support');
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
    const box = document.getElementById('histList') || document.querySelector('#s-history .scroll');
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
        .map((b) => (b.getAttribute('data-req') || b.textContent || '').trim()).filter(Boolean);
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
        const map = { sold: 'Продано', draft: 'Черновик', moderation: 'На модерации',
                      checking: 'На проверке', review: 'На модерации', rejected: 'Отклонено' };
        const st = map[a.status] || 'Активно';
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
          body: JSON.stringify({
            title,
            price,
            category: cat.trim(),
            condition: cond.trim(),
            city,
            // Сервер ждёт массив ссылок, а не строку через запятую
            photos: window.PolkaPhotos ? window.PolkaPhotos() : [],
            description: (document.getElementById('adDesc') || {}).value || '',
            delivery: (document.getElementById('adDelivery') || {}).checked ? 1 : 0,
          }),
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
      const link = data.link || '';
      const invited = data.count || 0;
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
      if (earned) earned.textContent = 'Приглашено: ' + invited;
      const bal = document.getElementById('refBalance');
      if (bal) {
        const b = Number(data.balance || 0);
        bal.textContent = 'Баланс: ' + b.toLocaleString('ru-RU') + ' \u20BD'
          + ' · тратится только на подписку Плюс';
      }
      // Вставляем ссылку в поле на экране
      const linkNode = document.getElementById('refLink');
      if (linkNode) linkNode.textContent = link ? link.replace('https://', '') : 'ссылка недоступна';
      const list = document.getElementById('refList');
      const rows = data.referrals || data.items || [];
      if (list) {
        list.innerHTML = rows.length
          ? rows.map((r) => `<div class="mrow"><span class="grow">${(r.name || 'пользователь').slice(0, 24)}</span><span class="chev">${r.days ? '+' + r.days : ''}</span></div>`).join('')
          : '<div class="mrow"><span class="grow" style="color:#7A8CA3">Пока никого не пригласили</span></div>';
      }
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
    // Русские буквы, похожие на латинские: «ОРА» вместо «OPA» — частая ошибка
    const norm = code.replace(/[АВЕКМНОРСТУХ]/g, (ch) => ({
      А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H',
      О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
    }[ch] || ch));
    try {
      const res = await window.PolkaAPI.api('/api/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: norm }),
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

/* ── Вход: показываем экран приветствия, если пользователь не авторизован ── */
(function () {
  let authorized = false;

  async function gate() {
    try {
      await window.PolkaAPI.api('/api/me');
      authorized = true;
    } catch (e) {
      // Вход временно не блокирует: приложение живёт в Telegram, там сессия
      // приходит сама. Экран входа оставлен в коде, но не мешает работе.
      authorized = true;
    }
  }

  // Жёсткая проверка: любая попытка уйти с экрана входа без авторизации
  // возвращает обратно на приветствие.
  const wrapGoGate = () => {
    if (typeof window.go !== 'function' || window.go.__gate) return;
    const orig = window.go;
    const wrapped = function (name) {
      if (!authorized && !['welcome', 'telegram', 'email', 'code', 'done'].includes(name)) {
        return orig.call(this, 'welcome');
      }
      return orig.apply(this, arguments);
    };
    wrapped.__gate = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrapGoGate);
  setTimeout(wrapGoGate, 600);
  window.PolkaGate = gate;

  // Вход через Telegram: внутри мини-приложения сессия уже есть — идём дальше
  const wireTg = () => {
    const btn = document.querySelector('#s-telegram .bigbtn, #s-telegram button');
    if (btn && !btn.__w) {
      btn.__w = true;
      btn.addEventListener('click', async () => {
        try {
          await window.PolkaAPI.api('/api/me');
          if (typeof window.go === 'function') window.go('home', true);
        } catch (e) {
          const TG = window.Telegram && window.Telegram.WebApp;
          const bot = 'https://t.me/polkaudmbot';
          if (TG && TG.openTelegramLink) TG.openTelegramLink(bot);
          else window.location.href = bot;
        }
      });
    }
  };
  document.addEventListener('DOMContentLoaded', () => { gate(); wireTg(); });
  setTimeout(() => { wireTg(); }, 900);
})();

/* ── Кнопка «Открыть» в карточке товара и баннер из базы ───────────────── */
(function () {
  // «Открыть» ведёт на настоящий Авито-адрес лота
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#pOpen');
    if (!btn) return;
    const lot = (window.LOTS || []).find((l) => String(l.id) === String(window.currentLot));
    const url = lot && lot.url;
    const TG = window.Telegram && window.Telegram.WebApp;
    if (url && TG && TG.openLink) TG.openLink(url);
    else if (url) window.open(url, '_blank');
    else if (TG && TG.showAlert) TG.showAlert('Ссылка на объявление недоступна');
  }, true);

  // Баннер барахолки из настроек: картинка, заголовок, подпись, ссылка
  async function loadBanner() {
    try {
      // Картинки баннеров ведёт админка: /api/banners отдаёт ссылки по экранам.
      // Старый file_id из Telegram может не отдаться (файл удалён) — тогда
      // проверяем загрузку и оставляем баннер из дизайна, а не битую картинку.
      const data = await window.PolkaAPI.api('/api/banners');
      const b = data.banners || {};

      const alive = (src) => new Promise((resolve) => {
        if (!src) return resolve(false);
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });

      const home = document.querySelector('.searchBanner');
      if (home && b.search && await alive(b.search)) {
        home.style.background = `url('${b.search}') center/cover`;
      }
      const el = document.getElementById('channelBanner');
      if (el && b.welcome && await alive(b.welcome)) {
        el.style.background = `url('${b.welcome}') center/cover`;
      }
    } catch (e) { }
  }
  document.addEventListener('DOMContentLoaded', loadBanner);
  setTimeout(loadBanner, 1200);
})();

/* ── Подсветка активной вкладки: считаем от реальной кнопки ─────────────── */
(function () {
  function positionGlass() {
    const glass = document.getElementById('navglass');
    const nav = document.querySelector('#nav .navmain');
    if (!glass || !nav) return;
    // Вкладка определяется ТЕКУЩИМ ЭКРАНОМ, а не классом .active:
    // класс не всегда обновляется, и плашка уезжала на «Находки».
    const screen = (document.querySelector('.screen.active') || {}).id || '';
    const MAP = {
      's-home': 'home', 's-market': 'market', 's-favorites': 'favorites',
      's-profile': 'profile', 's-myads': 'profile', 's-tariffs': 'profile',
      's-post': 'profile', 's-referrals': 'profile', 's-admin': 'profile',
      's-moderation': 'profile', 's-searches': 'home', 's-history': 'home',
      's-newsearch': 'home', 's-product': 'home',
    };
    const want = MAP[screen] || 'home';
    nav.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-nav') === want && b.closest('.navmain'));
      b.classList.toggle('on', b.getAttribute('data-nav') === want && b.closest('.navmain'));
    });
    const active = nav.querySelector('button.on') ||
                   nav.querySelector('button[data-nav="' + want + '"]') ||
                   nav.querySelector('button');
    if (!active) return;
    const navBox = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    // Пилюля по размеру самого меню: высота = капсула минус 8, ширина чуть
    // больше иконки. Так она всегда внутри и не вылезает за края.
    const h = Math.max(40, navBox.height - 8);
    const w = Math.round(h * 1.28);
    glass.style.transition = 'left .22s ease, width .22s ease';
    const centerX = (box.left - navBox.left) + box.width / 2;
    glass.style.width = w + 'px';
    glass.style.height = h + 'px';
    glass.style.left = Math.round(centerX - w / 2) + 'px';
    glass.style.top = Math.round((navBox.height - h) / 2) + 'px';
    glass.style.borderRadius = '500px';
  }

  const wrap = () => {
    if (typeof window.go === 'function' && !window.go.__glass) {
      const orig = window.go;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(positionGlass, 30);
        setTimeout(positionGlass, 300);
        return r;
      };
      wrapped.__glass = true;
      window.go = wrapped;
    }
    positionGlass();
  };

  document.addEventListener('DOMContentLoaded', wrap);
  setTimeout(wrap, 500);
  setTimeout(positionGlass, 1200);
  window.addEventListener('resize', positionGlass);

  // Наблюдаем за сменой экрана: класс .active может переехать без вызова go(),
  // тогда плашка оставалась на прежней вкладке.
  const obs = new MutationObserver(() => positionGlass());
  obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  setInterval(positionGlass, 700);
})();

/* ── Фото лота: выбираем файлы и грузим на сервер ─────────────────────── */
(function () {
  const state = { files: [], urls: [] };

  function paint() {
    const main = document.getElementById('photoMain');
    const label = document.getElementById('photoLabel');
    const first = state.urls[0];
    if (main && first) {
      main.style.background = `url('${first}') center/cover`;
    }
    if (label) {
      label.textContent = state.urls.length
        ? state.urls.length + ' фото'
        : '+ Добавить фото';
      label.style.opacity = state.urls.length ? '0' : '1';
    }
  }

  async function upload(files) {
    const fd = new FormData();
    [...files].slice(0, 5).forEach((f) => fd.append('photos', f));
    const headers = {};
    const init = window.PolkaAPI.initData();
    if (init) headers['X-Telegram-Init-Data'] = init;
    const res = await fetch('/api/ads/photos', { method: 'POST', body: fd, headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  document.addEventListener('change', async (e) => {
    const inp = e.target.closest && e.target.closest('#photoInput');
    if (!inp || !inp.files || !inp.files.length) return;
    state.files = [...inp.files].slice(0, 5);
    try {
      const data = await upload(state.files);
      state.urls = data.urls || [];
      paint();
    } catch (err) {
      const TG = window.Telegram && window.Telegram.WebApp;
      if (TG && TG.showAlert) TG.showAlert('Не удалось загрузить фото');
    }
  }, true);

  // при публикации отдаём ссылки на фото
  window.PolkaPhotos = () => state.urls.slice();
})();

/* ── Модерация объявлений в приложении (только админ) ──────────────────── */
(function () {
  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';

  // Карточка по структуре из дизайна: .fav = фото слева, текст справа
  function card(a) {
    let ph = '';
    try {
      const arr = typeof a.photos === 'string' ? JSON.parse(a.photos.replace(/'/g, '"')) : a.photos;
      ph = Array.isArray(arr) && arr.length ? String(arr[0]) : '';
    } catch (e) { ph = ''; }
    const bg = ph ? `style="background-image:url('${ph}')"` : '';
    const sub = [a.city, a.category].filter(Boolean).join(' · ');
    return `<article class="card fav">
      <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
      <span>
        <h3>${(a.title || '').slice(0, 40)}</h3>
        <span class="pricepill">${fmt(a.price)}</span><br>
        <span class="status">${sub || 'без города'}</span>
        <span class="modbtns">
          <button class="bigbtn modok" data-ok="${a.id}">Одобрить</button>
          <button class="mailbtn modno" data-no="${a.id}">Отклонить</button>
        </span>
      </span>
    </article>`;
  }

  async function loadModeration() {
    const box = document.getElementById('modList');
    if (!box) return;
    try {
      const data = await window.PolkaAPI.api('/api/moderation');
      const items = data.items || [];
      const badge = document.getElementById('modCount');
      if (badge) badge.textContent = items.length ? '(' + items.length + ')' : '';
      box.innerHTML = items.length
        ? items.map(card).join('')
        : '<div class="card" style="padding:22px;text-align:center">На модерации пусто</div>';
      box.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => act(b.getAttribute('data-ok'), 'approve')));
      box.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => act(b.getAttribute('data-no'), 'reject')));
    } catch (e) {
      box.innerHTML = '<div class="card" style="padding:22px;text-align:center">Нет доступа</div>';
    }
  }

  async function act(id, action) {
    try {
      await window.PolkaAPI.api('/api/moderation/' + id, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      loadModeration();
    } catch (e) { }
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__mod) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'moderation') loadModeration();
      return r;
    };
    wrapped.__mod = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrap);
  setTimeout(wrap, 800);
  window.PolkaModeration = loadModeration;
})();

/* ── Переход на конкретный экран по ссылке из бота ─────────────────────── */
(function () {
  // Бот открывает приложение как  .../?screen=create  или  .../#create
  const MAP = {
    create: 'post', post: 'post', tariffs: 'tariffs', favorites: 'favorites',
    favorites_page: 'favorites', profile: 'profile', searches: 'searches',
    hunt: 'searches', history: 'history', referrals: 'referrals',
    myads: 'myads', moderation: 'moderation', home: 'home', market: 'market',
  };

  function target() {
    const q = new URLSearchParams(location.search).get('screen') ||
              new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
    const h = (location.hash || '').replace(/^#\/?/, '').split(/[?/]/)[0];
    return MAP[String(q).toLowerCase()] || MAP[String(h).toLowerCase()] || '';
  }

  function jump() {
    const to = target();
    if (!to) return;
    try {
      // Прототип при загрузке сам показывает home (около 1.1 с), поэтому
      // переключаем экран уже после этого.
      if (typeof window.show === 'function') window.show(to);
      else if (typeof window.go === 'function') window.go(to, true);
    } catch (e) { }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(jump, 1400);
    setTimeout(jump, 2000);
    setTimeout(jump, 2800);
  });
  setTimeout(jump, 1600);
  window.PolkaJump = jump;
})();

/* ── Видимость ошибок: молчаливые пустые экраны больше не скрывают сбой ── */
(function () {
  let shown = 0;

  function banner(text) {
    if (shown >= 3) return;      // не спамим
    shown += 1;
    let el = document.getElementById('apiError');
    if (!el) {
      el = document.createElement('div');
      el.id = 'apiError';
      el.style.cssText = [
        'position:fixed', 'left:12px', 'right:12px', 'bottom:96px', 'z-index:9999',
        'background:#FFF1F0', 'color:#B3261E', 'border:1px solid #FFD7D5',
        'border-radius:16px', 'padding:10px 14px', 'font-size:11px',
        'font-weight:700', 'line-height:1.35', 'box-shadow:0 6px 20px rgba(0,0,0,.12)',
        'transition:opacity .3s'
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 4500);
    setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 5000);
  }

  // Оборачиваем api(): любая ошибка объясняется человеку словами
  const wrap = () => {
    const api = window.PolkaAPI && window.PolkaAPI.api;
    if (!api || api.__errWrapped) return;
    const wrapped = async function (path, opts) {
      try {
        return await api.call(window.PolkaAPI, path, opts);
      } catch (e) {
        const status = (e && e.status) || 0;
        if (status === 401) banner('Нет доступа к данным. Откройте приложение через Telegram.');
        else if (status === 403) {
          const tgId = (window.Telegram && window.Telegram.WebApp &&
                        window.Telegram.WebApp.initDataUnsafe &&
                        window.Telegram.WebApp.initDataUnsafe.user &&
                        window.Telegram.WebApp.initDataUnsafe.user.id) || '';
          banner('Доступ только для администратора' + (tgId ? '. Ваш id: ' + tgId : '') + '.');
        }
        else if (status === 404) banner('Сервер не нашёл данные. Обновите приложение.');
        // 400 — ошибка проверки (например, промокод не найден): её показывает
        // сам экран, плашка сверху тут только мешает.
        else if (status === 400) { /* без плашки */ }
        else if (status >= 500) banner('Сервер временно недоступен. Попробуйте через минуту.');
        else if (status === 0) banner('Нет связи с сервером. Проверьте интернет.');
        else banner('Не удалось загрузить данные (' + status + ').');
        throw e;
      }
    };
    wrapped.__errWrapped = true;
    window.PolkaAPI.api = wrapped;
  };
  document.addEventListener('DOMContentLoaded', wrap);
  setTimeout(wrap, 300);
  setTimeout(wrap, 1500);
})();

/* ── Рефералка: поделиться ссылкой ────────────────────────────────────── */
(function () {
  window.shareRef = function () {
    const node = document.getElementById('refLink');
    const link = node ? ('https://' + node.textContent.trim()) : '';
    if (!link || link === 'https://—') return;
    const TG = window.Telegram && window.Telegram.WebApp;
    const text = 'Находи лучшие объявления по своим критериям — ПОЛКА';
    if (TG && TG.openTelegramLink) {
      TG.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) +
                          '&text=' + encodeURIComponent(text));
    } else if (navigator.share) {
      navigator.share({ title: 'ПОЛКА', text, url: link }).catch(() => {});
    } else {
      window.open('https://t.me/share/url?url=' + encodeURIComponent(link), '_blank');
    }
  };
})();

/* ── Поддержка: открыть чат @suppolka ──────────────────────────────────── */
(function () {
  window.openSupport = function () {
    const url = 'https://t.me/suppolka';
    const TG = window.Telegram && window.Telegram.WebApp;
    if (TG && TG.openTelegramLink) TG.openTelegramLink(url);
    else window.open(url, '_blank');
  };
})();
