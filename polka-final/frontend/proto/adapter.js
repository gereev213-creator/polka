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
  ['homeGrid'].forEach((id) => {
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


  // Отрисовка ленты ровно по макету: .lot > .lotimg + h3 + .pricepill
  function renderLotsManual(items, rawItems) {
    const src = (rawItems && rawItems.length === items.length) ? rawItems : items;
    const html = items.map((l, i) => {
      const r = src[i] || {};
      let ph = l.photo || (l.photos && l.photos[0]) || '';
      if (!ph) {
        const arr = r.photos;
        ph = Array.isArray(arr) ? (arr[0] || '') : String(arr || '');
      }
      const bg = ph ? `style="background-image:url('${ph}')"` : '';
      const liked = l.fav ? ' on' : '';
      return `<article class="lot" data-open="${l.id}">
        <div class="lotimg" ${bg}>${ph ? '' : 'Нет фото'}
          <button class="heart${liked}" data-fav="${l.id}">
            <svg width="13" height="13"><use href="#i-heart"/></svg>
          </button>
        </div>
        <h3>${String(l.title || '').slice(0, 46)}</h3>
        <div class="pricepill">${(Number(l.price) || 0).toLocaleString('ru-RU')} \u20BD</div>
      </article>`;
    }).join('');
    // Находки рисуем ТОЛЬКО на экране находок. Барахолка — отдельный
    // список объявлений пользователей, туда находки попадать не должны.
    ['homeGrid'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = html;
      // Тап по карточке открывает товар, тап по сердечку — в избранное
      el.querySelectorAll('.lot').forEach((card) => {
        card.addEventListener('click', (e) => {
          const heart = e.target.closest('[data-fav]');
          const lotId = card.getAttribute('data-open');
          if (heart) {
            e.stopPropagation();
            if (window.PolkaAPI && window.PolkaAPI.api) {
              const on = !heart.classList.contains('on');
              heart.classList.toggle('on', on);
              window.PolkaAPI.api('/api/ads/' + lotId + '/favorite',
                { method: on ? 'POST' : 'DELETE' }).catch(() => { });
            }
            return;
          }
          if (typeof window.PolkaProduct === 'function') {
            window.PolkaProduct(lotId);
          } else if (typeof window.openLot === 'function') {
            try { window.openLot(Number(lotId)); } catch (e) { }
          }
        });
      });
    });
  }

  async function loadLots() {
    try {
      const data = await api('/api/findings?limit=40');
      const rawItems = data.items || [];
      const items = rawItems.map(toLot);
      window.__rawLots = rawItems;   // для экрана товара
      if (items.length) {
        try { window.setLots && window.setLots(items); } catch (e) { }
        // Рисуем сами: встроенный renderGrids падает на этом прототипе
        try { renderLotsManual(items, rawItems); } catch (e) { }
        try { if (typeof window.renderFavs === 'function') window.renderFavs(); } catch (e) { }
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
    const _ts = c.last_run || c.last_check || c.updated_at || c.last_match_at || '';
    let when = 'проверим в ближайший проход';
    if (_ts) {
      const raw = String(_ts).replace('T', ' ');
      const hhmm = raw.slice(11, 16);
      when = hhmm ? 'проверено ' + hhmm : 'уже проверялся';
    } else if (fresh > 0) {
      when = 'находки есть';
    }
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
      // Под аватаром только юзернейм — служебный id не показываем
      const idNode = document.getElementById('tgUserId');
      if (idNode) {
        idNode.style.display = 'none';
        idNode.textContent = '';
      }
      const ht = $('handleText');
      if (ht) {
        // Показываем ТОЛЬКО юзернейм: @cuesoul. Берём его из Telegram,
        // потому что в базе username может быть пустым или устаревшим.
        const tgUn = String((tgUser && tgUser.username) || '').trim();
        const apiUn = String(u.username || '').trim();
        const un = tgUn || apiUn;
        ht.textContent = un ? ('@' + un) : String(u.name || 'гость');
      }
      // Плашка «ПЛЮС» под ником: показываем, когда подписка активна
      const plan = String(u.plan || data.plan || 'trial');
      const plus = document.getElementById('pluspill');
      if (plus) {
        const active = plan && plan !== 'trial' && plan !== 'free';
        plus.style.display = active ? 'inline-flex' : 'none';
        plus.textContent = active ? 'ПЛЮС' : '';
      }
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
      const statusMap = { sold: 'Продано', draft: 'Черновик', moderation: 'На модерации',
                          checking: 'На проверке', review: 'На модерации', rejected: 'Отклонено' };
      box.innerHTML = items.map((a) => {
        let ph = '';
        const raw = a.photos;
        if (Array.isArray(raw)) ph = raw[0] || '';
        else if (typeof raw === 'string' && raw.trim()) {
          try {
            const arr = JSON.parse(raw.replace(/'/g, '"'));
            ph = Array.isArray(arr) ? (arr[0] || '') : '';
          } catch (e) { ph = raw.startsWith('http') ? raw : ''; }
        }
        const bg = ph ? `style="background-image:url('${ph}')"` : '';
        return `<article class="card fav" data-myad="${a.id}">
          <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span class="favtext">
            <h3>${(a.title || '').slice(0, 40)}</h3>
            <span class="pricepill">${fmt(a.price)}</span>
            <span class="status">${statusMap[a.status] || 'Активно'}</span>
          </span>
        </article>`;
      }).join('');
    } catch (e) { }
  }

  // Избранное — ровно как в референсе: фото, название, цена, корзина
  async function loadFavs() {
    const box = document.getElementById('favList');
    const empty = document.getElementById('favEmpty');
    if (!box) return;
    try {
      const data = await window.PolkaAPI.api('/api/favorites');
      const items = data.items || [];
      window.__favItems = items;
      if (!items.length) {
        box.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      box.innerHTML = items.map((a) => {
        let ph = '';
        const raw = a.photos;
        if (Array.isArray(raw)) ph = raw[0] || '';
        else if (typeof raw === 'string' && raw.trim()) {
          try {
            const arr = JSON.parse(raw.replace(/'/g, '"'));
            ph = Array.isArray(arr) ? (arr[0] || '') : '';
          } catch (e) { ph = raw.startsWith('http') ? raw : ''; }
        }
        const bg = ph ? `style="background-image:url('${ph}')"` : '';
        return `<article class="card fav" data-fav-open="${a.id}">
          <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span class="favtext">
            <h3>${(a.title || '').slice(0, 40)}</h3>
            <span class="pricepill">${fmt(a.price)}</span>
          </span>
          <button class="trash" data-fav-del="${a.id}">
            <svg width="14" height="14"><use href="#i-trash"/></svg>
          </button>
        </article>`;
      }).join('');

      box.querySelectorAll('[data-fav-open]').forEach((card) => {
        card.addEventListener('click', async (e) => {
          if (e.target.closest('[data-fav-del]')) return;
          const id = card.getAttribute('data-fav-open');
          let raw = (window.__favItems || []).find((x) => String(x.id) === String(id));
          if (!raw) {
            try {
              const fresh = await window.PolkaAPI.api('/api/favorites');
              raw = (fresh.items || []).find((x) => String(x.id) === String(id));
            } catch (err) { }
          }
          if (raw && window.PolkaProductData) window.PolkaProductData(raw);
        });
      });
      box.querySelectorAll('[data-fav-del]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-fav-del');
          try {
            await window.PolkaAPI.api('/api/ads/' + id + '/favorite', { method: 'DELETE' });
            loadFavs();
          } catch (err) { }
        });
      });
    } catch (e) { }
  }
  window.PolkaLoadFavs = loadFavs;

  // (старый враппер удалён: он вызывал функции вне своей области)
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
    let res = null;
    try {
      // Как введено — так и пробуем: в базе есть коды кириллицей («РОК»)
      res = await window.PolkaAPI.api('/api/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    } catch (e1) {
      // Не подошёл — пробуем с заменой похожих букв (ОРА → OPA)
      try {
        res = await window.PolkaAPI.api('/api/promo/redeem', {
          method: 'POST',
          body: JSON.stringify({ code: norm }),
        });
      } catch (e2) {
        if (msg) { msg.textContent = 'Промокод не найден'; msg.style.display = 'block'; }
        return;
      }
    }
    try {
      const pct = res.percent || res.discount || (res.kind === 'discount' ? res.value : 0) || 0;
      if (pct) {
        window.__promo = norm;              // платёж применит этот код
        window.__promoPercent = pct;        // скидка для пересчёта цены
        window.dispatchEvent(new CustomEvent('polka:promo', { detail: { percent: pct } }));
      }
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
    // Пилюля 56×48 из polka-menu по центру активной иконки
    const h = 48;
    const w = 56;
    glass.style.transition = 'left .22s ease, width .22s ease';
    const centerX = (box.left - navBox.left) + box.width / 2;
    glass.style.width = w + 'px';
    glass.style.height = h + 'px';
    glass.style.left = Math.round(centerX - w / 2) + 'px';
    // Фиксированные 4px от верхнего края капсулы: расчёт по navBox давал
    // смещение, и плашка выходила за пределы меню
    glass.style.top = '4px';
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

/* ── Фото лота: дорожка со слотами, до 10 штук ─────────────────────────── */
(function () {
  const MAX_PHOTOS = 10;
  const state = { urls: [] };

  function paint() {
    const track = document.getElementById('photoTrack');
    if (!track) return;
    track.querySelectorAll('.photoSlot').forEach((el) => el.remove());
    const add = track.querySelector('.photoAdd');
    state.urls.forEach((u, i) => {
      const slot = document.createElement('div');
      slot.className = 'photoSlot';
      slot.style.backgroundImage = `url('${u}')`;
      slot.innerHTML = `<b data-del="${i}">×</b>`;
      track.insertBefore(slot, add);
    });
    track.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.urls.splice(Number(btn.getAttribute('data-del')), 1);
        paint();
        track.scrollLeft = 0;
      });
    });
    if (add) {
      const full = state.urls.length >= MAX_PHOTOS;
      add.style.display = full ? 'none' : 'grid';
    }
    track.scrollLeft = track.scrollWidth;
  }

  async function upload(files) {
    const fd = new FormData();
    [...files].slice(0, MAX_PHOTOS - state.urls.length).forEach((f) => fd.append('photos', f));
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
    const files = [...inp.files];
    inp.value = '';
    try {
      const data = await upload(files);
      state.urls = state.urls.concat(data.urls || []).slice(0, MAX_PHOTOS);
      paint();
    } catch (err) {
      const TG = window.Telegram && window.Telegram.WebApp;
      if (TG && TG.showAlert) TG.showAlert('Не удалось загрузить фото');
    }
  }, true);

  function syncAddTile() {
    const track = document.getElementById('photoTrack');
    const add = track && track.querySelector('.photoAdd');
    if (!add) return;
    add.style.display = state.urls.length >= MAX_PHOTOS ? 'none' : 'grid';
  }

  window.PolkaPhotos = () => state.urls.slice();
  window.PolkaResetPhotos = () => { state.urls = []; paint(); };
  document.addEventListener('DOMContentLoaded', () => { paint(); syncAddTile(); });
  setTimeout(paint, 600);
})();

/* ── Модерация объявлений в приложении (только админ) ─────────────────── */
(function () {
  try {
    const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';

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
        box.querySelectorAll('[data-ok]').forEach((b) =>
          b.addEventListener('click', () => act(b.getAttribute('data-ok'), 'approve')));
        box.querySelectorAll('[data-no]').forEach((b) =>
          b.addEventListener('click', () => act(b.getAttribute('data-no'), 'reject')));
      } catch (e) {
        box.innerHTML = '<div class="card" style="padding:22px;text-align:center">Нет доступа</div>';
      }
    }

    async function act(id, action) {
      try {
        await window.PolkaAPI.api('/api/moderation/' + id, {
          method: 'POST', body: JSON.stringify({ action }),
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
  } catch (e) { }
})();

/* ── Карточка товара по макету ────────────────────────────────────────── */
(function () {
  try {
    function rub(n) { return (Number(n) || 0).toLocaleString('ru-RU') + ' \u20BD'; }

    function fill(id) {
      window.__currentProductId = id;
      // Ищем и в находках, и в избранном: это разные списки
      const pools = [window.__rawLots || [], window.__favItems || [], window.__productPrev || []];
      let raw = null;
      for (const pool of pools) {
        raw = pool.find((x) => String(x.id) === String(id));
        if (raw) break;
      }
      if (!raw) return;
      const set = (elId, text) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = text || '';
      };
      set('pTitle', raw.title || '');
      set('pPrice', rub(raw.price));
      set('pTag', raw.city || '');
      // Дата в человеческом виде: сегодня/вчера + время
      let when = '';
      const stamp = raw.published_at || raw.created_at || '';
      if (stamp) {
        const d = new Date(String(stamp));
        if (!isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          when = hh + ':' + mm;
        }
      }
      set('pMeta', [raw.city, when, raw.condition || ''].filter(Boolean).join(' · '));
      set('pDesc', raw.description || 'Описание на Авито — откройте объявление');

      const photos = Array.isArray(raw.photos) ? raw.photos : [];
      const ph = document.getElementById('photo');
      const paintPhoto = () => {
        if (!ph) return;
        if (photos.length) {
          ph.style.backgroundImage = `url('${photos[0]}')`;
          ph.style.backgroundSize = 'cover';
          ph.style.backgroundPosition = 'center';
        }
      };
      paintPhoto();
      setTimeout(paintPhoto, 60);
      setTimeout(paintPhoto, 250);
      const noPhoto = document.getElementById('nophoto');
      if (noPhoto) noPhoto.style.display = photos.length ? 'none' : 'block';
      const counter = document.getElementById('counter');
      if (counter) counter.style.display = photos.length ? 'block' : 'none';
      const dots = document.getElementById('dots');
      if (dots) dots.style.display = photos.length ? 'flex' : 'none';

      // Ссылка на Авито
      let link = document.getElementById('lotOpen');
      if (link) link.remove();
      const adUrl = raw.url || raw.source_url || '';
      if (adUrl) {
        const host = document.querySelector('#s-product .pbody') ||
                     document.querySelector('#s-product');
        const a = document.createElement('a');
        a.id = 'lotOpen';
        a.href = adUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'bigbtn';
        a.style.cssText = 'display:block;text-align:center;line-height:54px;' +
                          'text-decoration:none;margin-top:12px';
        a.textContent = 'Открыть на Авито';
        host.appendChild(a);
      }
    }

    const wrap = () => {
      if (typeof window.openLot !== 'function' || window.openLot.__filled) return;
      const orig = window.openLot;
      const wrapped = function (id) {
        const r = orig.apply(this, arguments);
        setTimeout(() => fill(id), 30);
        return r;
      };
      wrapped.__filled = true;
      window.openLot = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 700);
    window.PolkaProductData = function (raw) {
      // Данные пришли из избранного — держим отдельно от ленты
      window.__productPrev = [raw];
      window.PolkaProduct(raw.id || raw.ad_id);
    };

    window.PolkaProduct = function (id) {
      fill(id);
      try {
        if (typeof window.go === 'function') window.go('product');
      } catch (e) { }
      // Прототип мог перезаписать поля своим пустым состоянием — заполняем ещё раз
      setTimeout(() => fill(id), 120);
    };
  } catch (e) { }
})();

/* ── Барахолка: логотип и баннер прокручиваются вместе с лентой ─────────── */
(function () {
  try {
    function restructure() {
      const screen = document.getElementById('s-market');
      if (!screen) return;
      const scroll = screen.querySelector('.scroll');
      const head = screen.querySelector('.ahead');
      const banners = document.getElementById('feedBanners');
      if (!scroll) return;

      // Шапка и баннеры — внутрь прокручиваемой области, чтобы уезжали
      // наверх вместе с лентой, а находки не заезжали под них.
      if (head && head.parentNode !== scroll) {
        head.style.position = 'static';
        head.style.marginBottom = '10px';
        scroll.insertBefore(head, scroll.firstChild);
      }
      if (banners && banners.parentNode !== scroll) {
        scroll.insertBefore(banners, head ? head.nextSibling : scroll.firstChild);
      }
      // Строка поиска — после баннеров, перед лентой
      const searchRow = screen.querySelector('.tools') ||
                        screen.querySelector('.searchRow') ||
                        document.querySelector('.tools.searchRow');
      if (searchRow && searchRow.parentNode !== scroll) {
        scroll.insertBefore(searchRow, banners ? banners.nextSibling : scroll.firstChild);
      }
      // Гарантируем порядок: шапка → баннеры → поиск → лента
      [head, banners, searchRow].forEach((el) => {
        if (el && el.parentNode === scroll) scroll.appendChild(el);
      });
      const grid = screen.querySelector('#marketGrid');
      if (grid) {
        const gridWrap = grid.parentNode;
        if (gridWrap && gridWrap !== scroll) scroll.appendChild(gridWrap);
        else if (gridWrap === scroll) scroll.appendChild(grid);
      }
      screen.style.paddingTop = 'calc(var(--tg-top) + 8px)';
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(restructure, 400));
    setTimeout(restructure, 1200);
    setTimeout(restructure, 2500);
    window.PolkaMarketLayout = restructure;
  } catch (e) { }
})();

/* ── Карточка товара: кнопки «Открыть», сердце, поделиться ────────────── */
(function () {
  try {
    let currentId = null;

    function currentRaw() {
      const id = currentId || window.__currentProductId;
      const pools = [window.__productPrev || [], window.__rawLots || [], window.__favItems || []];
      for (const pool of pools) {
        const hit = pool.find((x) => String(x.id) === String(id));
        if (hit) return hit;
      }
      return null;
    }

    function paintHeart(on) {
      const heart = document.getElementById('pFav');
      if (!heart) return;
      heart.classList.toggle('liked', !!on);
      // Дублируем инлайном: прототип сбрасывает класс своим syncProductFav
      heart.style.background = on ? 'var(--grad)' : '';
      const svg = heart.querySelector('svg');
      if (svg) svg.style.color = on ? '#fff' : '';
      window.__heartOn = !!on;
      if (on) setTimeout(() => {
        if (window.__heartOn) heart.classList.add('liked');
      }, 200);
    }

    async function toggleCurrentFav() {
      const id = currentId || window.__currentProductId;
      if (!id) return;
      // Состояние держим в переменной: прототип сбрасывал класс, и переключение
      // срабатывало дважды — сердце мигало и оставалось пустым
      const on = !window.__heartOn;
      paintHeart(on);
      try {
        await window.PolkaAPI.api('/api/ads/' + id + '/favorite',
          { method: on ? 'POST' : 'DELETE' });
      } catch (e) {
        // откат только если сервер реально отказал
        if (!/HTTP 2/.test(String(e && e.message))) paintHeart(!on);
      }
    }

    function openAvito() {
      const raw = currentRaw();
      const url = raw && (raw.url || raw.source_url);
      const TG = window.Telegram && window.Telegram.WebApp;
      if (!url) {
        if (TG && TG.showAlert) TG.showAlert('Ссылка на объявление недоступна');
        return;
      }
      // Telegram иногда отказывает openLink: тогда копируем адрес и показываем его
      try {
        if (TG && TG.openLink) {
          TG.openLink(url, { try_instant_view: false });
          return;
        }
      } catch (e) { }
      try {
        window.open(url, '_blank');
        return;
      } catch (e) { }
      try { navigator.clipboard.writeText(url); } catch (e) { }
      if (TG && TG.showAlert) TG.showAlert('Ссылка скопирована:\n' + url);
    }

    function share() {
      const raw = currentRaw() || {};
      const url = raw.url || raw.source_url || '';
      const TG = window.Telegram && window.Telegram.WebApp;
      const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) +
                   '&text=' + encodeURIComponent(String(raw.title || 'Находка на ПОЛКЕ'));
      if (TG && TG.openTelegramLink) TG.openTelegramLink(link);
      else window.open(link, '_blank');
    }

    function wire() {
      // Сердце: заменяем кнопку копией, чтобы убрать обработчик прототипа,
      // который падал на пустом LOTS и сбрасывал закраску
      let heartBtn = document.getElementById('pFav');
      if (heartBtn && !heartBtn.__replaced) {
        const clone = heartBtn.cloneNode(true);
        clone.__replaced = true;
        heartBtn.parentNode.replaceChild(clone, heartBtn);
        heartBtn = clone;
        // Обработчик не вешаем: за клик отвечает делегирование ниже.
        // Два обработчика переключали состояние дважды — сердце мигало.
      }

      const openBtn = document.getElementById('pOpen');
      if (openBtn && !openBtn.__w) {
        openBtn.__w = true;
        openBtn.addEventListener('click', openAvito);
      }
      const heart = document.getElementById('pFav');
      if (heart && !heart.__w) {
        heart.__w = true;
        heart.addEventListener('click', (e) => { e.stopPropagation(); toggleCurrentFav(); });
      }
      const shareBtn = document.querySelector('#s-product .pactions .fab:last-child') ||
                       document.querySelectorAll('#s-product .fab')[1];
      if (shareBtn && !shareBtn.__w) {
        shareBtn.__w = true;
        shareBtn.addEventListener('click', (e) => { e.stopPropagation(); share(); });
      }
    }

    // Следим за экраном: на карточке товара меню снизу не нужно
    const obs = new MutationObserver(() => {
      const active = (document.querySelector('.screen.active') || {}).id;
      const nav = document.getElementById('nav');
      if (nav) nav.style.display = (active === 's-product') ? 'none' : 'flex';
      if (active === 's-product') {
        wire();
        const raw = currentRaw();
        paintHeart(!!(raw && raw.is_favorite));
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
      wire();
    });
    setTimeout(wire, 800);

    // Запоминаем, какой товар открыли
    const wrap = () => {
      if (typeof window.PolkaProduct !== 'function' || window.PolkaProduct.__wire) return;
      const orig = window.PolkaProduct;
      const wrapped = function (id) {
        currentId = id;
        const r = orig.apply(this, arguments);
        setTimeout(wire, 60);
        return r;
      };
      wrapped.__wire = true;
      window.PolkaProduct = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 700);
  } catch (e) { }
})();

/* ── Перекрываем syncProductFav прототипа: он сбрасывал сердце ─────────── */
(function () {
  try {
    window.syncProductFav = function () {
      const heart = document.getElementById('pFav');
      if (!heart) return;
      const on = !!window.__heartOn;
      heart.classList.toggle('liked', on);
      heart.style.background = on ? 'var(--grad)' : '';
      const svg = heart.querySelector('svg');
      if (svg) svg.style.color = on ? '#fff' : '';
    };
    // Наблюдаем и восстанавливаем, если прототип всё же сбросил класс
    setInterval(() => {
      const active = (document.querySelector('.screen.active') || {}).id;
      if (active !== 's-product') return;
      const heart = document.getElementById('pFav');
      if (!heart) return;
      const want = !!window.__heartOn;
      if (heart.classList.contains('liked') !== want) {
        heart.classList.toggle('liked', want);
        heart.style.background = want ? 'var(--grad)' : '';
      }
    }, 400);
  } catch (e) { }
})();


/* ── Сердце на карточке товара: делегирование, без зависимости от узла ─── */
(function () {
  try {
    let on = false;

    function paint() {
      const heart = document.getElementById('pFav');
      if (!heart) return;
      heart.classList.toggle('liked', on);
      heart.style.setProperty('background', on ? 'var(--grad)' : '', 'important');
      const svg = heart.querySelector('svg');
      if (svg) {
        svg.style.setProperty('color', on ? '#fff' : '', 'important');
        svg.style.setProperty('fill', on ? '#fff' : '', 'important');
      }
    }

    document.addEventListener('click', async (e) => {
      const heart = e.target.closest && e.target.closest('#pFav');
      if (!heart) return;
      e.preventDefault();
      e.stopPropagation();
      const id = window.__currentProductId;
      if (!id) return;
      on = !on;
      window.__heartOn = on;
      paint();
      setTimeout(paint, 150);
      try {
        await window.PolkaAPI.api('/api/ads/' + id + '/favorite',
          { method: on ? 'POST' : 'DELETE' });
      } catch (err) {
        on = !on;
        window.__heartOn = on;
        paint();
      }
    }, true);

    // Страховка: держим закраску, если прототип попытается сбросить
    setInterval(() => {
      if ((document.querySelector('.screen.active') || {}).id !== 's-product') return;
      const heart = document.getElementById('pFav');
      if (!heart) return;
      if (heart.classList.contains('liked') !== on) paint();
    }, 500);
  } catch (e) { }
})();

/* ── Мои объявления, создание лота, рефералка (восстановлено) ───────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n || 0).toLocaleString('ru-RU') + ' \u20BD';
  const STATUS = { sold: 'Продано', draft: 'Черновик', moderation: 'На модерации',
                   checking: 'На проверке', review: 'На модерации', rejected: 'Отклонено' };

  function photoOf(a) {
    const raw = a.photos;
    if (Array.isArray(raw)) return raw[0] || '';
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const arr = JSON.parse(raw.replace(/'/g, '"'));
        return Array.isArray(arr) ? (arr[0] || '') : '';
      } catch (e) { return raw.startsWith('http') ? raw : ''; }
    }
    return '';
  }

  function card(a, extra) {
    const ph = photoOf(a);
    const bg = ph ? `style="background-image:url('${ph}')"` : '';
    return `<article class="card fav">
      <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
      <span class="favtext">
        <h3>${(a.title || '').slice(0, 40)}</h3>
        <span class="pricepill">${fmt(a.price)}</span>
        ${extra ? `<span class="status">${extra}</span>` : ''}
      </span>
    </article>`;
  }

  async function loadMyAds() {
    const box = $('myList');
    if (!box) return;
    try {
      const data = await window.PolkaAPI.api('/api/my-ads');
      const items = data.items || [];
      box.innerHTML = items.length
        ? items.map((a) => card(a, STATUS[a.status] || 'Активно')).join('')
        : '<div class="card" style="padding:18px;text-align:center">Своих объявлений пока нет. Нажмите «+», чтобы выставить лот.</div>';
    } catch (e) { }
  }

  async function loadReferrals() {
    try {
      const data = await window.PolkaAPI.api('/api/referral');
      const linkNode = $('refLink');
      if (linkNode) linkNode.textContent = (data.link || '').replace('https://', '') || 'ссылка недоступна';
      const bal = $('refBalance');
      if (bal) bal.textContent = 'Баланс: ' + Number(data.balance || 0).toLocaleString('ru-RU')
        + ' \u20BD · тратится только на подписку Плюс';
      const earned = document.querySelector('#s-referrals .earned');
      if (earned) earned.textContent = 'Приглашено: ' + (data.count || 0);
      const list = $('refList');
      const rows = data.referrals || data.items || [];
      if (list) {
        list.innerHTML = rows.length
          ? rows.map((r) => `<div class="mrow"><span class="grow">${(r.name || 'пользователь').slice(0, 24)}</span>
              <span class="chev">${r.days ? '+' + r.days : ''}</span></div>`).join('')
          : '<div class="mrow"><span class="grow" style="color:#7A8CA3">Пока никого не пригласили</span></div>';
      }
    } catch (e) { }
  }

  async function wirePost() {
    const form = $('postForm');
    if (!form || form.__wired) return;
    form.__wired = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => (($(id) || {}).value || '').trim();
      const title = val('adTitle');
      const price = Number(val('adPrice').replace(/[^0-9]/g, '')) || 0;
      const cat = val('adCategory') || 'Другое';
      const cond = val('adCondition') || 'Отличное';
      const city = val('adCity');
      if (title.length < 3 || !price) {
        const TG = window.Telegram && window.Telegram.WebApp;
        if (TG && TG.showAlert) TG.showAlert('Укажите название и цену');
        return;
      }
      try {
        await window.PolkaAPI.api('/api/ads', {
          method: 'POST',
          body: JSON.stringify({
            title, price, category: cat, condition: cond, city,
            photos: window.PolkaPhotos ? window.PolkaPhotos() : [],
            description: val('adDesc'),
            delivery: (($('adDelivery') || {}).checked) ? 1 : 0,
          }),
        });
        if (window.PolkaResetPhotos) window.PolkaResetPhotos();
        form.reset();
        const TG = window.Telegram && window.Telegram.WebApp;
        if (TG && TG.showAlert) TG.showAlert('Отправлено на модерацию');
        if (typeof window.go === 'function') window.go('myads');
      } catch (err) {
        const TG = window.Telegram && window.Telegram.WebApp;
        const msg = String(err && err.message || '');
        if (TG && TG.showAlert) TG.showAlert(msg.includes('402') || msg.includes('403')
          ? 'Лимит объявлений исчерпан. Оформите Плюс.'
          : 'Не удалось опубликовать');
      }
    });
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__rest) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'myads') loadMyAds();
      if (name === 'favorites' && typeof loadFavs === 'function') loadFavs();
      if (name === 'post' && window.wirePost) window.wirePost();
      if (name === 'referrals') loadReferrals();
      return r;
    };
    wrapped.__rest = true;
    window.go = wrapped;
  };
  document.addEventListener('DOMContentLoaded', () => { wrap(); wirePost(); });
  setTimeout(wrap, 800);
  window.PolkaPost = wirePost;
  window.PolkaLoadMyAds = loadMyAds;
  window.PolkaLoadReferrals = loadReferrals;
  window.wirePost = wirePost;
})();

/* ── Барахолка: объявления людей из /api/ads ──────────────────────────── */
(function () {
  try {
    const rub = (n) => (Number(n) || 0).toLocaleString('ru-RU') + ' \u20BD';

    function photoOf(a) {
      const raw = a.photos;
      if (Array.isArray(raw)) return raw[0] || '';
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const arr = JSON.parse(raw.replace(/'/g, '"'));
          return Array.isArray(arr) ? (arr[0] || '') : '';
        } catch (e) { return raw.startsWith('http') ? raw : ''; }
      }
      return '';
    }

    async function loadBoard() {
      const box = document.getElementById('marketGrid');
      if (!box) return;
      try {
        const data = await window.PolkaAPI.api('/api/ads?limit=40');
        const items = data.items || [];
        if (!items.length) {
          box.innerHTML = `<div class="card" style="padding:22px;text-align:center;grid-column:1/-1">
            <div style="font-size:14px;font-weight:870;margin-bottom:6px">Пока пусто</div>
            <div style="font-size:11px;color:#7A8CA3;line-height:1.4;margin-bottom:14px">
              Здесь появятся объявления людей после модерации.</div>
            <button class="bigbtn" style="height:44px;font-size:12px;max-width:220px;margin:0 auto"
                    onclick="go('post')">Разместить объявление</button></div>`;
          return;
        }
        box.innerHTML = items.map((a) => {
          const ph = photoOf(a);
          const bg = ph ? `style="background-image:url('${ph}')"` : '';
          return `<article class="lot" data-open="${a.id}">
            <div class="lotimg" ${bg}>${ph ? '' : 'Нет фото'}
              <button class="heart" data-fav="${a.id}">
                <svg width="13" height="13"><use href="#i-heart"/></svg>
              </button>
            </div>
            <h3>${String(a.title || '').slice(0, 46)}</h3>
            <div class="pricepill">${rub(a.price)}</div>
          </article>`;
        }).join('');

        box.querySelectorAll('.lot').forEach((card) => {
          card.addEventListener('click', () => {
            const id = card.getAttribute('data-open');
            const raw = items.find((x) => String(x.id) === String(id));
            if (raw && window.PolkaProductData) window.PolkaProductData(raw);
          });
        });
        box.querySelectorAll('[data-fav]').forEach((heart) => {
          heart.addEventListener('click', async (e) => {
            e.stopPropagation();
            const on = !heart.classList.contains('on');
            heart.classList.toggle('on', on);
            try {
              await window.PolkaAPI.api('/api/ads/' + heart.getAttribute('data-fav') + '/favorite',
                { method: on ? 'POST' : 'DELETE' });
            } catch (err) { heart.classList.toggle('on', !on); }
          });
        });
      } catch (e) { }
    }

    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__board2) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        if (name === 'market') setTimeout(loadBoard, 150);
        return r;
      };
      wrapped.__board2 = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 900);
    window.PolkaBoard = loadBoard;
  } catch (e) { }
})();

/* ── Кнопка «Опубликовать»: гарантируем её наличие внизу экрана ────────── */
(function () {
  try {
    function ensurePostCta() {
      const screen = document.getElementById('s-post');
      if (!screen) return;
      let cta = screen.querySelector('.bottomCta');
      if (!cta) {
        cta = document.createElement('div');
        cta.className = 'bottomCta';
        cta.innerHTML = '<button class="bigbtn" form="postForm">Опубликовать</button>';
        screen.appendChild(cta);
      }
      cta.style.cssText = 'position:absolute;left:14px;right:14px;bottom:0;top:auto;' +
                          'z-index:15;padding:10px 0 max(12px, env(safe-area-inset-bottom))';
      const scroll = screen.querySelector('.scroll');
      if (scroll) scroll.style.paddingBottom = '96px';
    }
    document.addEventListener('DOMContentLoaded', () => setTimeout(ensurePostCta, 300));
    setTimeout(ensurePostCta, 900);
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__postcta) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        if (name === 'post') setTimeout(ensurePostCta, 60);
        return r;
      };
      wrapped.__postcta = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 700);
  } catch (e) { }
})();

/* ── Центральный обработчик: избранное, экраны, сердце ────────────────── */
(function () {
  try {
    let heartOn = false;

    function paintProductHeart() {
      const heart = document.getElementById('pFav');
      if (!heart) return;
      heart.classList.toggle('liked', heartOn);
      heart.style.setProperty('background', heartOn ? 'var(--grad)' : '', 'important');
      const svg = heart.querySelector('svg');
      if (svg) {
        svg.style.setProperty('color', heartOn ? '#fff' : '', 'important');
        svg.style.setProperty('fill', heartOn ? '#fff' : '', 'important');
      }
    }

    async function toggleFavorite(id, on, paint) {
      if (paint) paint(on);
      try {
        await window.PolkaAPI.api('/api/ads/' + id + '/favorite',
          { method: on ? 'POST' : 'DELETE' });
      } catch (e) {
        if (paint) paint(!on);
      }
    }

    // Один обработчик на все сердечки: и в ленте, и на товаре
    document.addEventListener('click', (e) => {
      const heart = e.target.closest && e.target.closest('#pFav');
      if (heart) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Несколько обработчиков на кнопке срабатывали трижды — глушим повторы
        const now = Date.now();
        if (now - (window.__heartClickAt || 0) < 600) return;
        window.__heartClickAt = now;
        const id = window.__currentProductId;
        if (!id) return;
        heartOn = !heartOn;
        window.__heartOn = heartOn;
        toggleFavorite(id, heartOn, () => {
          paintProductHeart();
          setTimeout(paintProductHeart, 150);
        });
        return;
      }
      const feedHeart = e.target.closest && e.target.closest('.heart');
      if (feedHeart) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const card = feedHeart.closest('.lot');
        const id = card && card.getAttribute('data-open');
        if (!id) return;
        const on = !feedHeart.classList.contains('on');
        feedHeart.classList.toggle('on', on);
        toggleFavorite(id, on, () => { });
      }
    }, true);

    // Экраны: грузим данные при переходе
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__boot) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        try {
          if (name === 'favorites' && window.PolkaLoadFavs) window.PolkaLoadFavs();
          if (name === 'myads' && window.PolkaLoadMyAds) window.PolkaLoadMyAds();
          if (name === 'referrals' && window.PolkaLoadReferrals) window.PolkaLoadReferrals();
          if (name === 'post' && window.PolkaPost) window.PolkaPost();
          if (name === 'moderation' && window.PolkaModeration) window.PolkaModeration();
          if (name === 'market' && window.PolkaBoard) window.PolkaBoard();
          if (name === 'admin' && window.PolkaAdmin && window.PolkaAdmin.reload) window.PolkaAdmin.reload();
          if (window.__positionGlass) window.__positionGlass();
        } catch (e) { }
        return r;
      };
      wrapped.__boot = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 500);
    setTimeout(wrap, 1500);

    // Держим сердце закрашенным, пока экран товара открыт
    setInterval(() => {
      if ((document.querySelector('.screen.active') || {}).id !== 's-product') return;
      paintProductHeart();
    }, 500);

    window.__bootReady = true;
  } catch (e) { }
})();

/* ── Кнопки карточки товара: свои, без обработчиков прототипа ──────────── */
(function () {
  try {
    let liked = false;

    function paint(btn) {
      btn.style.setProperty('background', liked ? 'var(--grad)' : 'rgba(255,255,255,.35)', 'important');
      const svg = btn.querySelector('svg');
      if (svg) svg.style.setProperty('color', liked ? '#fff' : '#3373FA', 'important');
    }

    function build() {
      const screen = document.getElementById('s-product');
      if (!screen) return;
      const oldActions = screen.querySelector('.actions') || screen.querySelector('.pactions');
      if (!oldActions || oldActions.__mine) return;

      const raw = () => {
        const id = window.__currentProductId;
        const pools = [window.__productPrev || [], window.__rawLots || [], window.__favItems || []];
        for (const pool of pools) {
          const hit = pool.find((x) => String(x.id) === String(id));
          if (hit) return hit;
        }
        return null;
      };

      const bar = document.createElement('div');
      bar.className = oldActions.className;
      bar.__mine = true;
      bar.style.cssText = oldActions.style.cssText;
      bar.innerHTML = `
        <button class="open" id="myOpen" type="button">Открыть</button>
        <button class="fab" id="myFav" type="button"><svg width="20" height="20"><use href="#i-heart"/></svg></button>
        <button class="fab" id="myShare" type="button"><svg width="20" height="20"><use href="#i-plane"/></svg></button>`;

      oldActions.replaceWith(bar);

      bar.querySelector('#myOpen').addEventListener('click', (e) => {
        e.preventDefault();
        const r = raw();
        const url = r && (r.url || r.source_url);
        const TG = window.Telegram && window.Telegram.WebApp;
        if (!url) { if (TG && TG.showAlert) TG.showAlert('Ссылка недоступна'); return; }
        try { if (TG && TG.openLink) { TG.openLink(url); return; } } catch (err) { }
        try { window.open(url, '_blank'); return; } catch (err) { }
        if (TG && TG.showAlert) TG.showAlert('Ссылка: ' + url);
      });

      bar.querySelector('#myFav').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = window.__currentProductId;
        if (!id) return;
        liked = !liked;
        paint(bar.querySelector('#myFav'));
        bar.querySelector('#myFav').classList.toggle('liked', liked);
        try {
          await window.PolkaAPI.api('/api/ads/' + id + '/favorite',
            { method: liked ? 'POST' : 'DELETE' });
        } catch (err) {
          liked = !liked;
          paint(bar.querySelector('#myFav'));
        }
      });

      bar.querySelector('#myShare').addEventListener('click', (e) => {
        e.preventDefault();
        const r = raw() || {};
        const url = r.url || r.source_url || '';
        const TG = window.Telegram && window.Telegram.WebApp;
        const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) +
                     '&text=' + encodeURIComponent(String(r.title || 'Находка на ПОЛКЕ'));
        if (TG && TG.openTelegramLink) TG.openTelegramLink(link);
        else window.open(link, '_blank');
      });
    }

    const obs = new MutationObserver(() => {
      if ((document.querySelector('.screen.active') || {}).id === 's-product') build();
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
      build();
    });
    setTimeout(build, 1000);
    setTimeout(build, 2000);
  } catch (e) { }
})();

/* ── Видимость кнопок действия: без :has(), надёжно ───────────────────── */
(function () {
  try {
    const RULES = [
      ['s-post', '#s-post .bottomCta'],
      ['s-newsearch', '#s-newsearch .bottomCta'],
    ];
    function apply() {
      const active = (document.querySelector('.screen.active') || {}).id || '';
      // Главное правило: любая кнопка действия видна только на своём экране.
      // Найдено в аудите: кнопки «Опубликовать» и «Создать поиск» рисовались
      // поверх меню, потому что лежали вне неактивных секций.
      document.querySelectorAll('.bottomCta').forEach((cta) => {
        const own = cta.closest('.screen');
        const visible = own ? own.classList.contains('active') : false;
        cta.style.display = visible ? 'block' : 'none';
      });
      RULES.forEach(([screen, sel]) => {
        const el = document.querySelector(sel);
        if (el) el.style.display = (active === screen) ? 'block' : 'none';
      });
      ['s-post', 's-newsearch', 's-admin', 's-moderation', 's-myads'].forEach((id) => {
        if (active === id) return;
        const cta = document.querySelector('#' + id + ' .bottomCta');
        if (cta) cta.style.display = 'none';
      });
      const nav = document.getElementById('nav');
      if (nav) {
        const hideNav = ['s-product', 's-post', 's-newsearch', 's-myads', 's-admin', 's-moderation'];
        nav.style.display = hideNav.includes(active) ? 'none' : 'flex';
      }
    }
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__vis) return;
      const orig = window.go;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(apply, 30);
        setTimeout(apply, 200);
        return r;
      };
      wrapped.__vis = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', () => { wrap(); apply(); });
    setTimeout(() => { wrap(); apply(); }, 600);
    setInterval(apply, 800);
  } catch (e) { }
})();

/* ── Рекламные баннеры: лента со свайпом и автопрокруткой ──────────────── */
(function () {
  try {
    function openLink(url) {
      if (!url) return;
      const TG = window.Telegram && window.Telegram.WebApp;
      if (TG && TG.openLink) { try { TG.openLink(url); return; } catch (e) { } }
      window.open(url, '_blank');
    }

    async function loadBanners() {
      const box = document.getElementById('feedBanners');
      if (!box) return;
      try {
        const data = await window.PolkaAPI.api('/api/feed-banners');
        const items = (data.items || []).filter((b) => b && b.image && !b.default && b.action).slice(0, 5);
        if (!items.length) { box.innerHTML = ''; return; }

        box.innerHTML = `
          <div class="bannerTrack" id="bannerTrack">
            ${items.map((b, i) => `<div class="bannerSlide" data-slide="${i}" data-url="${b.action}">
              <img src="${b.image}" alt=""></div>`).join('')}
          </div>
          <div class="bannerDots" id="bannerDots">
            ${items.map((_, i) => `<i data-dot="${i}"${i === 0 ? ' class="on"' : ''}></i>`).join('')}
          </div>`;

        const track = document.getElementById('bannerTrack');
        const dots = document.getElementById('bannerDots');
        if (!track) return;

        track.querySelectorAll('[data-slide]').forEach((el) => {
          el.addEventListener('click', () => openLink(el.getAttribute('data-url')));
        });

        let pos = 0;
        window.clearInterval(window.__bannerTimer);
        if (items.length > 1) {
          window.__bannerTimer = window.setInterval(() => {
            if (!document.body.contains(track)) { window.clearInterval(window.__bannerTimer); return; }
            if ((document.querySelector('.screen.active') || {}).id !== 's-market') return;
            pos = (pos + 1) % items.length;
            track.scrollTo({ left: pos * track.clientWidth, behavior: 'smooth' });
            if (dots) dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === pos));
          }, 4000);
        }
      } catch (e) { }
    }

    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__bn) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        if (name === 'market') setTimeout(loadBanners, 150);
        return r;
      };
      wrapped.__bn = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', wrap);
    setTimeout(wrap, 700);
    setTimeout(loadBanners, 2200);
    window.PolkaBanners = loadBanners;
  } catch (e) { }
})();

/* Старое меню прототипа отключено: используется меню из референса (menu.js) */

