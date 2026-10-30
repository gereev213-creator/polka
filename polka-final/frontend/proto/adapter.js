/* Связка прототипа с нашим бэкендом.
   Авторизация — Telegram initData, как в основном приложении. */
(function () {

// Пустая лента не должна оставлять голый экран
function paintEmpty(count) {
  // Пусто — просто текст, без плашки и кнопки
  const html = '<div class="emptyState">Пока пусто</div>';
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

  // Счётчик активных запросов: пока он больше нуля, показываем полоску сверху
  let _apiActive = 0;
  let _apiTimer = null;

  let _loadShownAt = 0;

  function _loadStart() {
    _apiActive += 1;
    if (_apiTimer) return;
    // Показываем сразу: задержка не нужна, а мигание гасим минимальной
    // длительностью показа ниже
    let bar = document.getElementById('polkaLoad');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'polkaLoad';
      bar.innerHTML = '<i></i>';
      document.body.appendChild(bar);
    }
    bar.classList.add('on');
    _loadShownAt = Date.now();
  }

  function _loadEnd() {
    _apiActive = Math.max(0, _apiActive - 1);
    if (_apiActive > 0) return;
    const bar = document.getElementById('polkaLoad');
    if (!bar) return;
    const shown = Date.now() - _loadShownAt;
    const hide = () => bar.classList.remove('on');
    if (shown < 320) setTimeout(hide, 320 - shown);
    else hide();
  }

  async function api(path, opts) {
    opts = opts || {};
    _loadStart();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const d = initData();
    if (d) headers['X-Telegram-Init-Data'] = d;
    let res;
    try {
      res = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (netErr) {
      _loadEnd();
      const e = new Error('network');
      e.status = 0;
      throw e;
    }
    if (!res.ok) {
      _loadEnd();
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    try {
      const data = await res.json();
      _loadEnd();
      return data;
    } catch (parseErr) {
      _loadEnd();
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
  // Пока данные едут — показываем скелетон, а не пустой экран
  function showLoading(el, rows) {
    if (!el) return;
    const n = rows || 3;
    // Скелетон повторяет РАЗМЕТКУ настоящей карточки: сетка находок —
    // плитка с фото 118 px, списки (избранное, история, мои) — строка
    // с миниатюрой 96×88. Тогда при загрузке карточки не «прыгают».
    const gridIds = ['homeGrid', 'marketGrid'];
    const isGrid = gridIds.indexOf(el.id) >= 0
      || (el.parentElement && el.parentElement.classList.contains('grid'));
    let html = '';
    if (isGrid) {
      // Сам контейнер уже grid с двумя колонками — плитки кладём прямо
      // в него, иначе они сжимаются вдвое (вложенная сетка в ячейке).
      html = '';
      for (let i = 0; i < n; i += 1) {
        html += '<div class="skelLot"><span class="ph"></span>'
          + '<i class="l1"></i><i class="l2"></i></div>';
      }
    } else {
      html = '<div class="skelWrap">';
      for (let i = 0; i < n; i += 1) {
        html += '<div class="skelRow"><span class="skelImg"></span>'
          + '<span class="skelLines"><i></i><i></i></span></div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }
  window.PolkaLoading = showLoading;

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
    (window.PolkaLoading && window.PolkaLoading(document.getElementById('homeGrid'), 4));
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
      // Честно объясняем механику: находка приходит, когда продавец
      // разместит подходящее объявление на Авито, а не «через час».
      const okText = 'Поиск создан.\n\nНаходки придут, когда продавец разместит '
        + 'на Авито объявление, которое подойдёт под ваш запрос. '
        + 'Мы проверяем новые объявления автоматически.';
      try { if (TG && TG.showAlert) TG.showAlert(okText); } catch (e) { }
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
    (window.PolkaLoading && window.PolkaLoading(document.getElementById('searchList'), 2));
    try {
      const data = await window.PolkaAPI.api('/api/hunt');
      const items = data.items || [];
      const box = $('searchList');
      if (!box) return;
      if (!items.length) {
        box.innerHTML = '<div class="card" style="padding:18px 16px;text-align:center">'
          + '<div style="font-size:12.5px;line-height:1.45;color:#5C6E86;font-weight:600">'
          + 'Пока нет поисков. Создайте первый — пришлём объявление, когда продавец '
          + 'разместит подходящее.</div>'
          + '<button class="bigbtn" style="height:42px;font-size:12px;max-width:220px;'
          + 'margin:12px auto 0" onclick="go(\'newsearch\')">Создать поиск</button></div>';
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
    (window.PolkaLoading && window.PolkaLoading(document.getElementById('histList'), 3));
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
      // Строка открывает объявление на Авито, стрелка — аналитику
      const rows = items.map((a) => {
        const photos = Array.isArray(a.photo_urls) ? a.photo_urls : (Array.isArray(a.photos) ? a.photos : []);
        const ph = photos[0] || '';
        const bg = ph ? `style="background-image:url('${ph}')"` : '';
        const url = String(a.url || a.source_url || '');
        return `<div class="hrow" data-hist-open="${a.id}" data-url="${url}">
          <span class="hth" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span class="who"><b>${(a.title || '').slice(0, 34)}</b>
          <span class="hp">${fmt(a.price)}</span></span>
          <button class="chev" data-analyze="${a.id}" aria-label="Аналитика">
            <svg width="12" height="12"><use href="#i-d"/></svg>
          </button>
        </div>`;
      }).join('');
      window.__histItems = items;
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
      const _linkEl = document.getElementById('avitoLink');
      const _linkNow = _linkEl ? String(_linkEl.value || '').trim() : '';
      // Раньше требовался текст запроса. Теперь основной путь — ссылка,
      // поэтому без неё и без короткого запроса выходим.
      if (!_linkNow && q.length < 2) return;
      // Выбранные критерии и минус-слова уходят в критерий: по ним отбирает сервер
      const chips = [...document.querySelectorAll('#searchForm .chip.on')]
        .map((b) => (b.getAttribute('data-req') || b.textContent || '').trim()).filter(Boolean);
      const minus = [...document.querySelectorAll('#searchForm input')]
        .map((i) => (i.placeholder || '').includes('запчасти') ? i.value.trim() : '')
        .filter(Boolean).join(',');
      // Если человек вставил ссылку с Авито — идём точно по ней: там уже
      // его фильтры, и сборщику не нужно перебирать всю категорию.
      const linkEl = document.getElementById('avitoLink');
      const link = linkEl ? String(linkEl.value || '').trim() : '';
      let ok = false;
      if (link) {
        try {
          const res = await window.PolkaAPI.api('/api/hunt/from-link', {
            method: 'POST', body: JSON.stringify({ url: link }),
          });
          ok = !!(res && (res.ok !== false));
        } catch (e) {
          ok = false;
          if (window.PolkaNotify) window.PolkaNotify('Ссылка не подошла — проверь, что это поиск Авито');
        }
      }
      if (!ok && !link) {
        ok = await window.PolkaAPI.createSearch({
          query: q,
          max_price: Number(raw) || 0,
          requirements: chips.join(', '),
          exclude: minus,
        });
      }
      if (ok) { const lk = document.getElementById('avitoLink'); if (lk) lk.value = ''; form.reset(); document.querySelectorAll('#searchForm .chip.on').forEach((c) => c.classList.remove('on')); if (typeof go === 'function') go('searches'); }
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
    (window.PolkaLoading && window.PolkaLoading(document.getElementById('myList'), 2));
    const box = $('myList');
    if (!box) return;
    const STATUS = {
      sold: 'Продано', draft: 'Черновик', moderation: 'На модерации',
      checking: 'На проверке', review: 'На модерации', rejected: 'Отклонено',
      active: 'Активно', withdrawn: 'Снято',
    };
    const photoOf = (a) => {
      const list = (Array.isArray(a.photo_urls) && a.photo_urls.length)
        ? a.photo_urls
        : (Array.isArray(a.photos) ? a.photos : []);
      return typeof list[0] === 'string' ? list[0] : '';
    };
    try {
      const data = await window.PolkaAPI.api('/api/my-ads');
      const items = data.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="card" style="padding:18px;text-align:center">'
          + 'Своих объявлений пока нет. Нажмите «+», чтобы выставить лот.</div>';
        return;
      }
      box.innerHTML = items.map((a) => {
        const ph = photoOf(a);
        const bg = ph ? `style="background-image:url('${ph}')"` : '';
        const canRemove = String(a.status || '') === 'active';
        const btn = canRemove
          ? `<button class="trash" data-remove="${a.id}" title="Снять с барахолки">`
            + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3373FA" '
            + 'stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2"/>'
            + '<path d="M6 7l1 13h10l1-13"/></svg></button>'
          : '';
        return `<article class="card fav" data-myad="${a.id}">
          <span class="th" ${bg}>${ph ? '' : 'нет фото'}</span>
          <span class="favtext">
            <h3>${(a.title || '').slice(0, 40)}</h3>
            <span class="pricepill">${fmt(a.price)}</span>
            <span class="status">${STATUS[a.status] || 'Активно'}</span>
          </span>
          ${btn}
        </article>`;
      }).join('');

      box.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute('data-remove');
          const TG = window.Telegram && window.Telegram.WebApp;
          let ok = true;
          if (TG && TG.showConfirm) {
            ok = await new Promise((res) => {
              try { TG.showConfirm('Снять объявление с барахолки?', res); } catch (err) { res(false); }
            });
          } else if (typeof window.confirm === 'function') {
            ok = window.confirm('Снять объявление с барахолки?');
          }
          if (!ok) return;
          btn.disabled = true;
          try {
            await window.PolkaAPI.api('/api/ads/' + id, { method: 'DELETE' });
            await loadMyAds();
            if (window.PolkaBoard) { try { window.PolkaBoard(); } catch (e2) { } }
          } catch (err) {
            btn.disabled = false;
            const msg = String((err && err.message) || err);
            if (TG && TG.showAlert) { try { TG.showAlert('Не удалось снять: ' + msg); } catch (e3) { } }
          }
        });
      });
    } catch (e) { }
  }

  window.PolkaLoadMyAds = loadMyAds;

  // Избранное — ровно как в референсе: фото, название, цена, корзина
  async function loadFavs() {
    (window.PolkaLoading && window.PolkaLoading(document.getElementById('favList'), 2));
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

  // Правовые документы: открываем реальные страницы /legal/*.html.
  // Старая шторка с кратким текстом удалена — она показывала устаревшие
  // условия и неверный контакт поддержки.
  window.PolkaLegal = function (kind) {
    const url = location.origin + (kind === 'terms' ? '/legal/terms.html' : '/legal/privacy.html');
    const TG = window.Telegram && window.Telegram.WebApp;
    try { if (TG && TG.openLink) { TG.openLink(url); return; } } catch (e) { }
    window.open(url, '_blank');
  };
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

  // Экран приветствия и входа больше не используется: в мини-приложении
  // сессия Telegram приходит сама, а гейт перехватывал переходы и показывал
  // «Добро пожаловать!» вместо нужного раздела (в том числе по deep link).
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

/* ── Подсветка вкладки: позиционирование делает прототип (show → NAVSHOW) ──
   Своих размеров и позиций не задаём: плашка 65×52 из первого дизайна. */

/* ── Фото лота: сжатие в браузере + загрузка по одной, до 10 штук ────────
   Раньше 10 файлов отправлялись одним запросом на десятки мегабайт, и
   Telegram WebView рвал соединение («Load failed»). Теперь каждое фото
   уменьшается до 1600px по длинной стороне, сжимается в JPEG и уходит
   отдельным запросом с прогрессом. */
(function () {
  const MAX_PHOTOS = 10;
  const MAX_SIDE = 1600;
  const QUALITY = 0.82;
  const state = { urls: [] };

  function setNote(text, isError) {
    const track = document.getElementById('photoTrack');
    if (!track) return;
    let note = document.getElementById('photoNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'photoNote';
      note.style.cssText = 'font-size:11px;font-weight:700;margin:2px 0 8px;' +
        'padding:6px 10px;border-radius:12px;display:none';
      (track.parentElement || track).insertBefore(note, track.nextSibling);
    }
    note.textContent = text || '';
    note.style.display = text ? 'block' : 'none';
    note.style.color = isError ? '#C93A3A' : '#2C6BD6';
    note.style.background = isError ? 'rgba(201,58,58,.10)' : 'rgba(51,115,250,.10)';
  }

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
      });
    });
    if (add) add.style.display = state.urls.length >= MAX_PHOTOS ? 'none' : 'grid';
    track.scrollLeft = track.scrollWidth;
  }

  // Уменьшение и сжатие: телефон отдаёт 4–8 МБ на кадр, после обработки ~200 КБ
  function compress(file) {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              URL.revokeObjectURL(url);
              resolve(blob || file);
            }, 'image/jpeg', QUALITY);
          } catch (e) {
            URL.revokeObjectURL(url);
            resolve(file);
          }
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (e) {
        resolve(file);
      }
    });
  }

  function fileToken(file, blob) {
    // Имя + размер + время изменения: одинаковый кадр даёт одинаковый токен,
    // поэтому сервер вернёт ту же ссылку и дубля не будет
    const src = [file && file.name, file && file.size, file && file.lastModified,
                 blob && blob.size].join(':');
    let h = 0;
    for (let i = 0; i < src.length; i += 1) {
      h = (h * 31 + src.charCodeAt(i)) | 0;
    }
    return 'p' + Math.abs(h).toString(36);
  }

  async function uploadOne(blob, index, total, token) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const fd = new FormData();
        fd.append('photos', blob, 'photo_' + index + '.jpg');
        if (token) fd.append('token', token);
        const headers = {};
        const init = window.PolkaAPI.initData();
        if (init) headers['X-Telegram-Init-Data'] = init;
        const res = await fetch('/api/ads/photos', { method: 'POST', body: fd, headers });
        if (!res.ok) {
          let detail = '';
          try { const j = await res.json(); detail = j.error || j.detail || ''; } catch (e) { }
          throw new Error('HTTP ' + res.status + (detail ? ' · ' + detail : ''));
        }
        const data = await res.json();
        return (data.urls || [])[0] || '';
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    return '';
  }

  document.addEventListener('change', async (e) => {
    const inp = e.target.closest && e.target.closest('#photoInput');
    if (!inp || !inp.files || !inp.files.length) return;
    const files = [...inp.files].slice(0, MAX_PHOTOS - state.urls.length);
    inp.value = '';
    if (!files.length) return;

    let done = 0;
    let failed = 0;
    let skipped = 0;
    const seen = new Set(state.urls);
    for (let i = 0; i < files.length; i += 1) {
      setNote(`Готовим фото ${i + 1} из ${files.length}…`, false);
      const blob = await compress(files[i]);
      const token = fileToken(files[i], blob);
      setNote(`Загружаем ${i + 1} из ${files.length}…`, false);
      try {
        const url = await uploadOne(blob, i, files.length, token);
        if (url) {
          if (seen.has(url)) {
            // Такой кадр уже есть в дорожке — не добавляем второй раз
            skipped += 1;
          } else {
            seen.add(url);
            state.urls.push(url);
            done += 1;
            paint();
          }
        } else {
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        setNote('Не удалось загрузить фото · ' + String(err && err.message || err), true);
      }
    }

    if (failed === 0) {
      const extra = skipped ? ` (${skipped} уже были)` : '';
      setNote('Добавлено фото: ' + done + extra, false);
      setTimeout(() => setNote('', false), 2200);
    } else {
      setNote(`Загружено ${done}, не удалось ${failed}`, true);
    }
  }, true);

  window.PolkaPhotos = () => state.urls.slice();
  window.PolkaResetPhotos = () => { state.urls = []; paint(); };
  document.addEventListener('DOMContentLoaded', paint);
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
      // город уже есть в строке под ценой — второй плашкой не дублируем
      set('pTag', '');
      const tagEl = document.getElementById('pTag');
      if (tagEl) tagEl.style.display = 'none';

      // Скидка к рынку: в шаблоне был вшитый текст «−18%», и он висел на всех
      // товарах. Показываем только реальный процент из данных.
      const marketEl = document.getElementById('pMarket');
      if (marketEl) {
        const disc = Math.round(Number(raw.discount_percent || 0));
        if (disc > 0) {
          marketEl.textContent = '−' + disc + '% ниже рынка';
          marketEl.style.display = '';
        } else {
          marketEl.textContent = '';
          marketEl.style.display = 'none';
        }
      }
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

      // Фотографии: реальный список объявления (photo_urls приходит с сервера)
      const photos = (Array.isArray(raw.photo_urls) && raw.photo_urls.length
        ? raw.photo_urls
        : (Array.isArray(raw.photos) ? raw.photos : [])).map(String).filter(Boolean);
      if (window.__initGallery) {
        window.__initGallery(photos);
      }
      const noPhoto = document.getElementById('nophoto');
      if (noPhoto) noPhoto.style.display = photos.length ? 'none' : 'block';
      // Кнопка «Написать»: открывает чат с продавцом по его юзернейму
      const oldWrite = document.getElementById('lotWrite');
      if (oldWrite) oldWrite.remove();
      // Юзернейм лежит внутри seller (или приходит в username у части ответов)
      const sellerName = String(
        raw.username || (raw.seller && raw.seller.username) || ''
      ).replace(/^@/, '');
      const isOwn = !!raw.is_owner;
      if (sellerName && !isOwn) {
        const holder = document.querySelector('#s-product .pbody') || document.querySelector('#s-product');
        const wb = document.createElement('button');
        wb.id = 'lotWrite';
        wb.className = 'bigbtn';
        wb.style.cssText = 'display:block;width:100%;margin:10px 0 0;height:52px;font-size:14px';
        wb.textContent = 'Написать';
        wb.dataset.user = sellerName;
        wb.addEventListener('click', (e) => {
          e.preventDefault();
          const url = 'https://t.me/' + sellerName;
          const TG = window.Telegram && window.Telegram.WebApp;
          try { if (TG && TG.openTelegramLink) { TG.openTelegramLink(url); return; } } catch (err) { }
          try { if (TG && TG.openLink) { TG.openLink(url); return; } } catch (err) { }
          window.open(url, '_blank');
        });
        const avitoBtn = document.getElementById('lotOpen');
        if (avitoBtn && avitoBtn.parentNode) avitoBtn.parentNode.insertBefore(wb, avitoBtn);
        else holder.appendChild(wb);
      }

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
      // Только скрываем на карточке товара. Показывать здесь нельзя:
      // наблюдатель срабатывает на любой class (в том числе на чипах формы)
      // и меню мигало на экране создания объявления.
      const nav = document.getElementById('nav');
      if (nav && active === 's-product') nav.style.display = 'none';
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

  // (дубль loadMyAds удалён: без фото и без снятия лота)

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

  function alertSafe(text) {
    const TG = window.Telegram && window.Telegram.WebApp;
    try { if (TG && TG.showAlert) { TG.showAlert(text); return; } } catch (e) { }
    try { window.alert ? window.alert(text) : null; } catch (e) { }
  }

  // Единая функция отправки: вызывается и сабмитом формы, и кликом по кнопке
  async function submitPost() {
    if (window.__posting) return;
    const val = (id) => (($(id) || {}).value || '').trim();
    const chipOn = (choice) => {
      const group = document.querySelector('#s-post .chips[data-choice="' + choice + '"] .chip.on');
      return group ? group.textContent.trim() : '';
    };
    const CAT = { 'Техника': 'Техника', 'Одежда': 'Одежда', 'Другое': 'Другое' };
    const COND = { 'Отличное': 'Отличное', 'Хорошее': 'Хорошее', 'Есть нюансы': 'Есть нюансы' };
    const title = val('adTitle');
    const price = Number(val('adPrice').replace(/[^0-9]/g, '')) || 0;
    const city = val('adCity');
    const description = val('adDesc');
    const category = CAT[chipOn('cat')] || 'Другое';
    const condition = COND[chipOn('cond')] || 'Отличное';
    const delivery = document.getElementById('delivery');
    const photos = (window.PolkaPhotos ? window.PolkaPhotos() : []).filter((u) => typeof u === 'string' && u);
    // Контакт продавца: username из Telegram, иначе id — сервер тоже умеет
    // подставлять, но лучше отправлять сразу, чтобы лот не падал с 400.
    let contact = '';
    try {
      const u = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe
        && window.Telegram.WebApp.initDataUnsafe.user;
      if (u && u.username) contact = '@' + u.username;
      else if (u && u.id) contact = 'Telegram: ' + u.id;
    } catch (e) { }

    const note = document.getElementById('postNote');
    const btn = document.querySelector('#s-post .bottomCta button');
    const say = (text, isError) => {
      if (!note) return;
      note.textContent = text || '';
      note.style.display = text ? 'block' : 'none';
      note.style.color = isError ? '#C93A3A' : '#2C6BD6';
    };

    if (title.length < 3 || !price) {
      say('Укажите название (от 3 символов) и цену', true);
      alertSafe('Укажите название и цену');
      return;
    }

    window.__posting = true;
    if (btn) { btn.disabled = true; btn.style.opacity = '.75'; }
    say('Публикуем…', false);

    let data = null;
    try {
      data = await window.PolkaAPI.api('/api/ads', {
        method: 'POST',
        body: JSON.stringify({
          title, price, category, condition, city, description,
          contact_info: contact,
          photos, delivery: delivery && delivery.classList.contains('on') ? 1 : 0,
        }),
      });
    } catch (err) {
      const msg = String((err && err.message) || err);
      const code = (msg.match(/\b(4\d\d|5\d\d)\b/) || [])[1] || '';
      const reasons = {
        missing_contact_info: 'не указан контакт для связи',
        missing_city: 'не указан город',
        missing_category: 'не выбрана категория',
        missing_title: 'не указано название',
        bad_title: 'название слишком короткое',
        bad_photos: 'проблема с фотографиями',
        ad_limit: 'закончился лимит объявлений',
        no_plan: 'нужна подписка Плюс',
        unauthorized: 'нужно открыть приложение из Telegram',
      };
      let reason = '';
      Object.keys(reasons).forEach((k) => { if (msg.includes(k)) reason = reasons[k]; });
      const text = 'Не удалось опубликовать: ' + (reason || ('код ' + (code || '?')));
      say(text, true);
      alertSafe(code === '402' || code === '403'
        ? 'Лимит объявлений исчерпан. Оформите подписку Плюс.'
        : text);
      window.__posting = false;
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      return;
    }

    // Успех: всё, что ниже, не должно влиять на статус публикации
    say('Отправлено на модерацию', false);
    try {
      if (window.PolkaResetPhotos) window.PolkaResetPhotos();
      const form = $('postForm');
      if (form) form.reset();
      document.querySelectorAll('#s-post .chips').forEach((group) => {
        group.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', i === 0));
      });
    } catch (e) { }
    window.__posting = false;
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    alertSafe('Объявление отправлено на модерацию');
    // Переход в «Мои объявления»: если go не сработал, переключаем экраны сами
    try {
      if (typeof window.go === 'function') window.go('myads');
    } catch (e) { }
    setTimeout(() => {
      const active = (document.querySelector('.screen.active') || {}).id;
      if (active !== 's-myads') {
        document.querySelectorAll('.screen').forEach((s) => {
          s.classList.toggle('active', s.id === 's-myads');
        });
      }
    }, 180);
    return data;
  }

  function wirePost() {
    const form = $('postForm');
    if (form && !form.__wired) {
      form.__wired = true;
      form.addEventListener('submit', (e) => { e.preventDefault(); submitPost(); });
    }
    const btn = document.querySelector('#s-post .bottomCta button');
    if (btn && !btn.__wired) {
      btn.__wired = true;
      btn.addEventListener('click', (e) => { e.preventDefault(); submitPost(); });
    }
  }

  const wrap = () => {
    if (typeof window.go !== 'function' || window.go.__rest) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'myads' && window.PolkaLoadMyAds) window.PolkaLoadMyAds();
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

    async function loadBoard(extraQuery) {
      (window.PolkaLoading && window.PolkaLoading(document.getElementById('marketGrid'), 4));
      const box = document.getElementById('marketGrid');
      if (!box) return;
      const qs = (typeof extraQuery === 'string') ? extraQuery
        : (window.__boardFilter || '');
      try {
        const data = await window.PolkaAPI.api('/api/ads?limit=40' + (qs ? '&' + qs : ''));
        const items = data.items || [];
        if (!items.length) {
          // Пусто — только текст, без плашки
          box.innerHTML = '<div class="emptyState">Пока пусто</div>';
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

/* Кнопки карточки товара: оставлена одна — «Открыть на Авито» (её даёт прототип) */

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


/* ── Прокрутка страницы: фиксируем только лого и название раздела ────────
   Баннер и поиск должны уезжать вместе с карточками, а не висеть поверх. */
(function () {
  try {
    function restructure() {
      [['s-home', 'home-scroll'], ['s-market', 'market-scroll']].forEach(([id, flag]) => {
        const screen = document.getElementById(id);
        if (!screen) return;
        const scroll = screen.querySelector('.scroll');
        if (!scroll || scroll.dataset.bannerInside === '1') return;

        // всё, что стоит между шапкой и прокруткой, переносим внутрь прокрутки
        const header = screen.querySelector('.ahead');
        [...screen.children].forEach((child) => {
          if (child === header || child === scroll) return;
          if (child.classList.contains('scroll')) return;
          scroll.insertBefore(child, scroll.firstChild);
        });
        scroll.dataset.bannerInside = '1';
      });
    }

    document.addEventListener('DOMContentLoaded', () => {
      restructure();
      setTimeout(restructure, 400);
      setTimeout(restructure, 1500);
    });
    setTimeout(restructure, 2200);
  } catch (e) { }
})();

/* ── Плашка меню: центр ровно по активной иконке ─────────────────────────
   Размер и вид — из первого дизайна (65×52, стекло 10%). Считаем left от
   реальной кнопки, потому что жёсткие смещения прототипа давали перекос. */
(function () {
  try {
    const W = 65;
    const H = 52;

    function center() {
      const nav = document.querySelector('#nav .navmain');
      const glass = document.getElementById('navglass');
      if (!nav || !glass) return;
      const buttons = [...nav.querySelectorAll('button')];
      let active = nav.querySelector('button.on');
      if (!active) {
        const screen = (document.querySelector('.screen.active') || {}).id || '';
        const MAP = { 's-home': 'home', 's-market': 'market', 's-favorites': 'favorites',
                      's-profile': 'profile', 's-searches': 'home', 's-history': 'home' };
        const want = MAP[screen] || 'home';
        active = buttons.find((b) => b.dataset.nav === want) || buttons[0];
      }
      if (!active) return;
      const navBox = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      const left = (box.left - navBox.left) + box.width / 2 - W / 2;
      glass.style.setProperty('left', Math.round(left) + 'px', 'important');
      glass.style.setProperty('width', W + 'px', 'important');
      glass.style.setProperty('height', H + 'px', 'important');
      glass.style.setProperty('top', '4px', 'important');
    }

    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__glasscenter) return;
      const orig = window.go;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(center, 20);
        setTimeout(center, 160);
        return r;
      };
      wrapped.__glasscenter = true;
      window.go = wrapped;
    };

    document.addEventListener('DOMContentLoaded', () => { wrap(); center(); });
    setTimeout(() => { wrap(); center(); }, 700);
    window.addEventListener('resize', center);
    setInterval(center, 600);
  } catch (e) { }
})();

/* ── Один активный экран, всегда ──────────────────────────────────────────
   Проверка после каждого перехода: если по какой-то причине активных стало
   больше одного, оставляем последний и гасим остальные. */
(function () {
  try {
    function normalize() {
      const actives = [...document.querySelectorAll('.screen.active')];
      if (actives.length <= 1) return;
      const keep = actives[actives.length - 1];
      actives.forEach((s) => { if (s !== keep) s.classList.remove('active'); });
    }
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__one) return;
      const orig = window.go;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(normalize, 10);
        setTimeout(normalize, 120);
        return r;
      };
      wrapped.__one = true;
      window.go = wrapped;
    };
    document.addEventListener('DOMContentLoaded', () => { wrap(); normalize(); });
    setTimeout(() => { wrap(); normalize(); }, 600);
    setInterval(normalize, 800);
  } catch (e) { }
})();

/* ── Глубокие ссылки: кнопка в боте открывает нужный раздел ──────────────
   Поддерживаем ?screen=favorites и ?tab=board, а также startapp-параметр
   из Telegram (/?startapp=tariffs). Раньше всё открывалось на «Находках». */
(function () {
  try {
    const MAP = {
      '': 'home', '/': 'home', findings: 'home', home: 'home', находки: 'home',
      board: 'market', market: 'market', барахолка: 'market',
      favorites: 'favorites', saved: 'favorites', избранное: 'favorites',
      searches: 'searches', criteria: 'searches', поиски: 'searches',
      history: 'history', profile: 'profile', профиль: 'profile',
      newsearch: 'newsearch', новыйпоиск: 'newsearch',
      tariffs: 'tariffs', 'plus': 'tariffs', тарифы: 'tariffs',
      myads: 'myads', post: 'post', create: 'post', создать: 'post',
      referrals: 'referrals', рефералка: 'referrals',
      admin: 'admin', moderation: 'moderation',
    };

    function normalize(value) {
      let v = String(value || '').trim().toLowerCase();
      v = v.replace(/^[?#]+/, '');
      if (v.startsWith('screen=')) v = v.slice('screen='.length);
      if (v.startsWith('tab=')) v = v.slice('tab='.length);
      v = v.replace(/^\/+/, '').split('&')[0].split('?')[0];
      return MAP[v] || '';
    }

    function target() {
      let fromUrl = '';
      try {
        const p = new URLSearchParams(location.search);
        fromUrl = p.get('screen') || p.get('tab') || '';
      } catch (e) { }
      let fromTg = '';
      try {
        fromTg = (window.Telegram && window.Telegram.WebApp
          && window.Telegram.WebApp.initDataUnsafe
          && window.Telegram.WebApp.initDataUnsafe.start_param) || '';
      } catch (e) { }
      return normalize(fromUrl) || normalize(fromTg) || '';
    }

    function jump() {
      const screen = target();
      if (!screen || typeof window.go !== 'function') return false;
      const current = (document.querySelector('.screen.active') || {}).id;
      if (current === 's-' + screen) return true;
      try { window.go(screen, true); } catch (e) { }
      // Страховка: если go не сработал, переключаем классы напрямую
      setTimeout(() => {
        const now = (document.querySelector('.screen.active') || {}).id;
        if (now !== 's-' + screen) {
          document.querySelectorAll('.screen').forEach((s) => {
            s.classList.toggle('active', s.id === 's-' + screen);
          });
        }
      }, 220);
      return true;
    }

    let tries = 0;
    const tick = setInterval(() => {
      tries += 1;
      if (jump() || tries > 40) clearInterval(tick);
    }, 250);
    document.addEventListener('DOMContentLoaded', () => setTimeout(jump, 120));
    window.__polkaJump = jump;
  } catch (e) { }
})();

/* ── Приветственный экран и вход убраны из потока ──────────────────────── */
(function () {
  try {
    const HIDE = ['welcome', 'telegram', 'email', 'code', 'done', 'loading'];
    const patch = () => {
      if (typeof window.show !== 'function' || window.show.__noWelcome) return;
      const orig = window.show;
      const wrapped = function (id) {
        const target = HIDE.includes(String(id)) ? 'home' : id;
        return orig.call(this, target);
      };
      wrapped.__noWelcome = true;
      window.show = wrapped;
    };
    const ensureHome = () => {
      const active = (document.querySelector('.screen.active') || {}).id || '';
      if (['s-welcome', 's-telegram', 's-email', 's-code', 's-done', 's-loading'].includes(active)) {
        try { if (typeof window.go === 'function') window.go('home', true); } catch (e) { }
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      patch(); ensureHome();
      setTimeout(() => { patch(); ensureHome(); }, 300);
      setTimeout(() => { patch(); ensureHome(); }, 1200);
    });
  } catch (e) { }
})();

/* ── Галерея фото в карточке товара ─────────────────────────────────────
   Раньше показывалось только первое фото, а точки и счётчик оставались
   из макета (5 точек и «3 / 5»). Теперь листаем реальные фотографии. */
(function () {
  try {
    let photos = [];
    let idx = 0;

    function paint() {
      const ph = document.getElementById('photo');
      if (!ph) return;
      if (!photos.length) {
        ph.style.backgroundImage = '';
        return;
      }
      ph.style.backgroundImage = "url('" + photos[idx] + "')";
      ph.style.backgroundSize = 'cover';
      ph.style.backgroundPosition = 'center';
      const counter = document.getElementById('counter');
      if (counter) {
        counter.textContent = (idx + 1) + ' / ' + photos.length;
        counter.style.display = 'block';
      }
      const dots = document.getElementById('dots');
      if (dots) {
        dots.style.display = photos.length > 1 ? 'flex' : 'none';
        dots.innerHTML = photos.map((_, i) =>
          '<i class="' + (i === idx ? 'on' : '') + '"></i>').join('');
      }
    }

    function next(step) {
      if (!photos.length) return;
      idx = (idx + step + photos.length) % photos.length;
      paint();
    }

    window.__initGallery = function (list) {
      photos = Array.isArray(list) ? list.slice() : [];
      idx = 0;
      paint();
      setTimeout(paint, 60);
      setTimeout(paint, 250);
    };

    document.addEventListener('DOMContentLoaded', () => {
      const ph = document.getElementById('photo');
      if (!ph || ph.__gallery) return;
      ph.__gallery = true;

      // тап по правой половине — следующее фото, по левой — предыдущее
      ph.addEventListener('click', (e) => {
        if (!photos.length) return;
        const r = ph.getBoundingClientRect();
        next((e.clientX - r.left) > r.width / 2 ? 1 : -1);
      });

      // свайп
      let startX = null;
      ph.addEventListener('touchstart', (e) => {
        startX = e.touches[0] ? e.touches[0].clientX : null;
      }, { passive: true });
      ph.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const endX = (e.changedTouches[0] || {}).clientX;
        if (typeof endX === 'number') {
          const dx = endX - startX;
          if (Math.abs(dx) > 30) next(dx < 0 ? 1 : -1);
        }
        startX = null;
      }, { passive: true });
    });
  } catch (e) { }
})();

/* ── Оформление подписки: звезда на аватаре и дата рядом с тарифами ──────
   Аватар перезаписывается вёрсткой профиля (внутрь ставится буква), поэтому
   звезду держим отдельным элементом поверх круга. */
(function () {
  try {
    let paidNow = false;

    function ensureStar() {
      // Звезду на аватаре убрали: осталась только плашка с датой у тарифов
      const old = document.getElementById('plusStar');
      if (old) old.remove();
      const badge = document.querySelector('#avatarCircle .avbadge');
      if (badge) badge.style.display = 'none';
    }

    function paint(user) {
      const plan = String((user && user.plan) || 'trial');
      paidNow = plan !== 'trial' && plan !== 'free' && !!plan;
      ensureStar();  // скрывает бейдж, если он остался от прошлой версии
      const until = document.getElementById('planUntil');
      if (until) {
        const raw = String((user && user.plan_until) || '');
        let label = '';
        if (paidNow && raw) {
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) label = 'до ' + m[3] + '.' + m[2] + '.' + m[1];
        }
        until.textContent = label;
        until.classList.toggle('on', !!label);
      }
    }

    const load = async () => {
      try {
        const data = await window.PolkaAPI.api('/api/me');
        paint(data && data.user);
      } catch (e) { }
    };

    document.addEventListener('DOMContentLoaded', () => setTimeout(load, 700));
    setTimeout(load, 1600);
    window.addEventListener('resize', ensureStar);
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__pluslook) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        if (name === 'profile' || name === 'tariffs') {
          setTimeout(load, 150);
          setTimeout(ensureStar, 400);
        }
        return r;
      };
      wrapped.__pluslook = true;
      window.go = wrapped;
    };
    setTimeout(wrap, 800);
    setInterval(() => { if (paidNow) ensureStar(); }, 1200);
  } catch (e) { }
})();

/* ── Снятие лота с барахолки: делегированный обработчик ──────────────────
   Кнопка внутри перерисовываемого списка, поэтому ловим клик на документе —
   так обработчик не теряется после обновления разметки. */
(function () {
  try {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest && e.target.closest('[data-remove]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      const id = btn.getAttribute('data-remove');
      const TG = window.Telegram && window.Telegram.WebApp;
      // Свой диалог подтверждения: TG.showConfirm в WebView не всегда
      // вызывает колбэк, и снятие «зависало» без реакции.
      const ok = await new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;'
          + 'background:rgba(20,40,70,.45);padding:24px';
        wrap.innerHTML = '<div style="background:#fff;border-radius:22px;padding:18px;max-width:320px;'
          + 'width:100%;text-align:center;font:15px system-ui;color:#1F2A37">'
          + '<div style="font-weight:800;margin-bottom:6px">Снять объявление?</div>'
          + '<div style="font-size:12.5px;color:#5C6E86;margin-bottom:14px">'
          + 'Оно исчезнет с барахолки. Вернуть можно, создав заново.</div>'
          + '<div style="display:flex;gap:8px">'
          + '<button id="rcNo" style="flex:1;height:44px;border:0;border-radius:14px;'
          + 'background:#E7EFF6;color:#2C6CDF;font-weight:800">Отмена</button>'
          + '<button id="rcYes" style="flex:1;height:44px;border:0;border-radius:14px;'
          + 'background:linear-gradient(100deg,#4780FB,#6B98F5);color:#fff;font-weight:800">'
          + 'Снять</button></div></div>';
        document.body.appendChild(wrap);
        const done = (val) => { wrap.remove(); resolve(val); };
        wrap.addEventListener('click', (ev) => { if (ev.target === wrap) done(false); });
        const yes = wrap.querySelector('#rcYes');
        const no = wrap.querySelector('#rcNo');
        if (yes) yes.addEventListener('click', () => done(true));
        if (no) no.addEventListener('click', () => done(false));
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await window.PolkaAPI.api('/api/ads/' + id, { method: 'DELETE' });
        if (window.PolkaLoadMyAds) await window.PolkaLoadMyAds();
        if (window.PolkaBoard) { try { window.PolkaBoard(); } catch (e2) { } }
        if (TG && TG.showAlert) { try { TG.showAlert('Объявление снято с барахолки'); } catch (e3) { } }
      } catch (err) {
        btn.disabled = false;
        const msg = String((err && err.message) || err);
        if (TG && TG.showAlert) { try { TG.showAlert('Не удалось снять: ' + msg); } catch (e4) { } }
      }
    }, true);
  } catch (e) { }
})();

/* ── «Поиск лотов»: создание поиска в шапке и остаток лимита ────────────
   Две крупные плашки внизу (кнопка + меню) выглядели тяжело, поэтому
   создание поиска уехало компактной пилюлей в строку переключателей. */
(function () {
  try {
    let planState = { used: 0, limit: 0, plan: 'trial' };

    function ensure() {
      const screen = document.getElementById('s-searches');
      if (!screen) return;
      // Убираем прежнюю нижнюю плашку
      const oldBar = document.getElementById('searchCta');
      if (oldBar) oldBar.remove();

      const seg = screen.querySelector('.seg');
      if (!seg) return;
      seg.style.display = 'flex';
      seg.style.alignItems = 'center';
      seg.style.gap = '6px';

      let btn = document.getElementById('searchAdd');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'searchAdd';
        btn.style.cssText = 'margin-left:auto;height:32px;padding:0 14px;border:0;'
          + 'border-radius:999px;background:var(--grad);color:#fff;font-size:11px;'
          + 'font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(51,115,250,.25)';
        btn.textContent = '+ Поиск';
        btn.addEventListener('click', () => {
          const left = planState.limit - planState.used;
          if (planState.limit > 0 && left <= 0) {
            const TG = window.Telegram && window.Telegram.WebApp;
            const text = planState.plan === 'plus'
              ? 'Лимит поисков исчерпан. Продлите Плюс, чтобы добавить ещё.'
              : 'Пробный период закончился. Оформите Плюс, чтобы создавать поиски.';
            if (TG && TG.showAlert) { try { TG.showAlert(text); } catch (e) { } }
            try { if (typeof window.go === 'function') window.go('tariffs', true); } catch (e) { }
            return;
          }
          try { if (typeof window.go === 'function') window.go('newsearch'); } catch (e) { }
        });
        seg.appendChild(btn);
      }

      let left = document.getElementById('searchLeft');
      if (!left) {
        left = document.createElement('div');
        left.id = 'searchLeft';
        left.style.cssText = 'font-size:10.5px;font-weight:700;color:#5C6E86;'
          + 'text-align:right;margin:2px 2px 6px;display:none';
        seg.parentElement.insertBefore(left, seg.nextSibling);
      }
      paint();
    }

    function paint() {
      const left = document.getElementById('searchLeft');
      if (!left) return;
      const limit = Number(planState.limit || 0);
      const used = Number(planState.used || 0);
      if (planState.plan === 'plus' && limit > 0) {
        left.textContent = 'Осталось поисков: ' + Math.max(0, limit - used) + ' из ' + limit;
        left.style.display = 'block';
      } else {
        left.style.display = 'none';
      }
    }

    async function loadPlan() {
      try {
        const d = await window.PolkaAPI.api('/api/plan');
        planState = { used: Number(d.criteria_used || 0), limit: Number(d.criteria_limit || 0),
                      plan: String(d.plan || 'trial') };
        paint();
      } catch (e) { }
    }

    document.addEventListener('DOMContentLoaded', () => { ensure(); setTimeout(loadPlan, 600); });
    setTimeout(() => { ensure(); loadPlan(); }, 1200);
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__searchcta) return;
      const orig = window.go;
      const wrapped = function (name) {
        const r = orig.apply(this, arguments);
        if (name === 'searches') { setTimeout(ensure, 60); setTimeout(loadPlan, 220); }
        return r;
      };
      wrapped.__searchcta = true;
      window.go = wrapped;
    };
    setTimeout(wrap, 900);
    setInterval(ensure, 1500);
  } catch (e) { }
})();

/* ── История: переход в объявление и аналитика по лоту ───────────────────
   Тап по строке открывает объявление на Авито, тап по стрелке — разбор:
   насколько цена ниже рынка, сколько висит, сколько просмотров и в избранном. */
(function () {
  try {
    function openUrl(url) {
      if (!url) return;
      const TG = window.Telegram && window.Telegram.WebApp;
      try { if (TG && TG.openLink) { TG.openLink(url); return; } } catch (e) { }
      try {
        // Надёжнее window.open: не блокируется как всплывающее окно
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      } catch (e) { }
      window.location.href = url;
    }

    function money(n) {
      return Number(n || 0).toLocaleString('ru-RU') + ' \u20BD';
    }

    function daysAgo(stamp) {
      if (!stamp) return null;
      const d = new Date(String(stamp));
      if (isNaN(d.getTime())) return null;
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      return diff < 0 ? 0 : diff;
    }

    function sheet(item) {
      const price = Number(item.price || 0);
      const median = Number(item.market_median || 0);
      const disc = Number(item.discount_percent || 0);
      const days = daysAgo(item.published_at || item.created_at);
      const views = Number(item.views || 0);
      const favs = Number(item.favorites_count || 0);
      const seller = item.seller || {};
      const rows = [];
      rows.push(['Цена', money(price)]);
      if (median > 0) rows.push(['Медиана рынка', money(median)]);
      if (disc > 0) rows.push(['Выгода', '−' + disc + '% · ' + money(Math.max(0, median - price))]);
      if (days !== null) rows.push(['Опубликовано', days === 0 ? 'сегодня' : days + ' дн. назад']);
      if (item.city) rows.push(['Город', String(item.city)]);
      if (item.condition) rows.push(['Состояние', String(item.condition)]);
      if (seller.name || seller.type) {
        rows.push(['Продавец', (seller.type === 'company' ? 'Магазин' : 'Частное лицо')
          + (seller.name ? ' · ' + seller.name : '')]);
      }
      rows.push(['Просмотров в ПОЛКЕ', String(views)]);
      rows.push(['В избранном', String(favs)]);

      let verdict = 'Цена в рынке — можно смотреть спокойно.';
      if (disc >= 20) verdict = 'Цена заметно ниже рынка — стоит писать продавцу сразу.';
      else if (disc >= 10) verdict = 'Хорошая выгода: ниже рынка на ' + disc + '%.';
      else if (disc > 0) verdict = 'Небольшая выгода — торг уместен.';
      else if (median > 0 && price > median) verdict = 'Дороже медианы — торгуйтесь или ищите дальше.';

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(20,40,70,.45);'
        + 'display:flex;align-items:flex-end';
      wrap.innerHTML = '<div style="background:#fff;width:100%;max-height:82vh;overflow:auto;'
        + 'border-radius:24px 24px 0 0;padding:18px 16px 26px;font:15px system-ui;color:#1F2A37">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<b style="font-size:15px">Аналитика лота</b>'
        + '<button id="aClose" style="width:32px;height:32px;border:0;border-radius:50%;'
        + 'background:#E3EDFD;color:#3373FA;font-size:15px">✕</button></div>'
        + '<div style="font-weight:800;font-size:14px;margin-bottom:10px">'
        + String(item.title || '').slice(0, 60) + '</div>'
        + rows.map((r) => `<div style="display:flex;justify-content:space-between;gap:12px;`
          + `padding:8px 0;border-bottom:1px solid #EDF3FB;font-size:13px">`
          + `<span style="color:#5C6E86">${r[0]}</span>`
          + `<span style="font-weight:800;text-align:right">${r[1]}</span></div>`).join('')
        + `<div style="margin-top:14px;padding:12px;border-radius:14px;background:#EAF1FE;`
        + `font-size:12.5px;line-height:1.4;color:#20509B;font-weight:700">${verdict}</div>`
        + '</div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
      const close = wrap.querySelector('#aClose');
      if (close) close.addEventListener('click', () => wrap.remove());
    }

    document.addEventListener('click', (e) => {
      const analyze = e.target.closest && e.target.closest('[data-analyze]');
      if (analyze) {
        e.preventDefault();
        e.stopPropagation();
        const id = analyze.getAttribute('data-analyze');
        const items = window.__histItems || [];
        const item = items.find((x) => String(x.id) === String(id));
        if (item) sheet(item);
        return;
      }
      const row = e.target.closest && e.target.closest('[data-hist-open]');
      if (row) {
        e.preventDefault();
        const id = row.getAttribute('data-hist-open');
        const url = row.getAttribute('data-url') || '';
        if (url) { openUrl(url); return; }
        const items = window.__histItems || [];
        const item = items.find((x) => String(x.id) === String(id));
        if (item && window.PolkaProductData) window.PolkaProductData(item);
      }
    }, true);
  } catch (e) { }
})();

/* ── Фильтры барахолки: ручные поля вместо трёх пресетов ─────────────────
   Цена от/до, город, категория, состояние и «только с фото» — всё уходит
   параметрами в /api/ads, результат перерисовывает доску. */
(function () {
  try {
    const state = { category: '', condition: '', photo: false };

    function q(id) { return document.getElementById(id); }
    function num(id) {
      const el = q(id);
      return el ? String(el.value || '').replace(/[^0-9]/g, '') : '';
    }

    function paintChips() {
      const cats = window.__filterCats || [];
      const box = q('fCats');
      if (!box) return;
      box.innerHTML = cats.map((c) => {
        const name = typeof c === 'string' ? c : (c.name || c.title || '');
        if (!name) return '';
        const on = state.category === name ? ' on' : '';
        return `<button class="chip${on}" data-cat="${name}">${name}</button>`;
      }).join('');
      box.querySelectorAll('[data-cat]').forEach((b) => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-cat');
          state.category = state.category === name ? '' : name;
          paintChips();
        });
      });
      const cond = q('fCond');
      if (cond) {
        cond.querySelectorAll('[data-cond]').forEach((b) => {
          b.classList.toggle('on', state.condition === b.getAttribute('data-cond'));
          b.onclick = () => {
            const name = b.getAttribute('data-cond');
            state.condition = state.condition === name ? '' : name;
            paintChips();
          };
        });
      }
      const ph = q('fPhoto');
      if (ph) {
        ph.classList.toggle('on', !!state.photo);
        ph.onclick = () => { state.photo = !state.photo; paintChips(); };
      }
    }

    async function loadCats() {
      if (window.__filterCats) return;
      try {
        const d = await window.PolkaAPI.api('/api/filters');
        window.__filterCats = (d.categories || []).slice(0, 12);
        paintChips();
      } catch (e) { }
    }

    window.applyFilters = async function () {
      const params = new URLSearchParams();
      const pmin = num('fPriceMin');
      const pmax = num('fPriceMax');
      const city = (q('fCity') || {}).value || '';
      if (pmin) params.set('price_min', pmin);
      if (pmax) params.set('price_max', pmax);
      if (city.trim()) params.set('city', city.trim());
      if (state.category) params.set('category', state.category);
      if (state.condition) params.set('condition', state.condition);
      if (state.photo) params.set('with_photo', '1');
      const qs = params.toString();
      window.__boardFilter = qs;
      try {
        if (typeof closeSheets === 'function') closeSheets();
      } catch (e) { }
      if (window.PolkaBoard) await window.PolkaBoard(qs);
      else {
        const box = document.getElementById('marketGrid');
        if (box) box.innerHTML = '<div class="emptyState">Пока пусто</div>';
      }
    };

    window.resetFilters = function () {
      state.category = '';
      state.condition = '';
      state.photo = false;
      ['fPriceMin', 'fPriceMax', 'fCity'].forEach((id) => { const el = q(id); if (el) el.value = ''; });
      paintChips();
      window.__boardFilter = '';
      if (window.PolkaBoard) window.PolkaBoard('');
    };

    document.addEventListener('DOMContentLoaded', () => { loadCats(); paintChips(); });
    setTimeout(() => { loadCats(); paintChips(); }, 1500);
  } catch (e) { }
})();

/* ── Тарифы: «Что даёт Плюс» открывается по стрелке ──────────────────────
   Раньше подробности лежали прямо под карточкой и растягивали экран.
   Теперь они живут в шторке: нажал круглую стрелку — открылось. */
(function () {
  try {
    function ensureSheet() {
      let ov = document.getElementById('plusInfo');
      if (ov) return ov;
      ov = document.createElement('div');
      ov.id = 'plusInfo';
      ov.className = 'ov';
      ov.innerHTML = '<div class="sheet plusSheet">'
        + '<div class="grab"></div>'
        + '<div class="piHead"><b>Что даёт Плюс</b>'
        + '<button class="piClose" aria-label="Закрыть">✕</button></div>'
        + '<div class="piBody"></div></div>';
      document.body.appendChild(ov);
      const close = () => ov.classList.remove('show');
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      const btn = ov.querySelector('.piClose');
      if (btn) btn.addEventListener('click', close);
      return ov;
    }

    function fill(ov) {
      const body = ov.querySelector('.piBody');
      if (!body) return;
      const src = document.querySelector('#s-tariffs .benefits');
      if (src) {
        // Клонируем содержимое и оборачиваем в тот же класс карточки —
        // иначе стили строк и иконок не применяются и текст слипается.
        const clone = src.cloneNode(true);
        const title = clone.querySelector('.bTitle');
        if (title) title.remove();
        clone.style.display = 'block';
        clone.classList.add('card');
        body.innerHTML = '';
        body.appendChild(clone);
        src.style.display = 'none';   // на странице больше не показываем
      }
    }

    function open() {
      const ov = ensureSheet();
      fill(ov);
      ov.classList.add('show');
    }

    document.addEventListener('click', (e) => {
      const chev = e.target.closest && e.target.closest('#s-tariffs .plus .chev, #termsBtn');
      if (chev) {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
    }, true);

    document.addEventListener('DOMContentLoaded', () => { setTimeout(() => {
      const src = document.querySelector('#s-tariffs .benefits');
      if (src) src.style.display = 'none';
    }, 800); });
  } catch (e) { }
})();

/* ── Тарифы: прячем нижнее меню ─────────────────────────────────────────
   На этом экране формы (промокод, оплата) стоят внизу, и плашка меню
   перекрывала поле — вписать код было невозможно. Прячем меню только
   здесь, на остальных экранах оно остаётся. */
(function () {
  try {
    const SCREENS_WITHOUT_NAV = ['s-tariffs'];

    function sync() {
      const active = document.querySelector('.screen.active');
      const id = active ? active.id : '';
      const hide = SCREENS_WITHOUT_NAV.indexOf(id) >= 0;
      document.body.classList.toggle('nav-off', hide);
    }

    document.addEventListener('DOMContentLoaded', () => { sync(); setTimeout(sync, 400); });
    setTimeout(sync, 1200);
    setInterval(sync, 800);

    // Реагируем и на программные переходы
    const wrap = () => {
      if (typeof window.go !== 'function' || window.go.__navoff) return;
      const orig = window.go;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        setTimeout(sync, 60);
        return r;
      };
      wrapped.__navoff = true;
      window.go = wrapped;
    };
    setTimeout(wrap, 700);
  } catch (e) { }
})();

/* ── Новый поиск: только ссылка + плашки разбора ─────────────────────────
   Человек вставляет адрес Авито, мы показываем, что из него поняли:
   категорию, модель, цену, город. Это наглядная проверка до создания. */
(function () {
  try {
    let timer = null;
    let lastUrl = '';

    function chipsBox() { return document.getElementById('linkChips'); }

    function paint(data) {
      const box = chipsBox();
      if (!box) return;
      const labels = (data && data.labels) || [];
      const extra = [];
      if (data && data.category_title) extra.push(data.category_title);
      if (data && data.model) extra.push(data.model);
      const all = extra.concat(labels).filter(Boolean);
      if (!all.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      box.style.display = 'flex';
      box.style.flexWrap = 'wrap';
      box.style.gap = '6px';
      box.innerHTML = all.slice(0, 7).map((x) =>
        `<span class="lchip">${String(x).replace(/</g, '')}</span>`).join('');
    }

    async function parse(link) {
      if (!link || link === lastUrl) return;
      lastUrl = link;
      const box = chipsBox();
      if (box && link.length < 12) { box.style.display = 'none'; return; }
      try {
        const res = await window.PolkaAPI.api('/api/hunt/parse-link', {
          method: 'POST', body: JSON.stringify({ url: link }),
        });
        paint(res && res.ok ? res : null);
      } catch (e) {
        paint(null);
      }
    }

    document.addEventListener('input', (e) => {
      if (!e.target || e.target.id !== 'avitoLink') return;
      const link = String(e.target.value || '').trim();
      if (timer) clearTimeout(timer);
      if (!link) { paint(null); lastUrl = ''; return; }
      timer = setTimeout(() => parse(link), 350);
    }, true);

    document.addEventListener('paste', (e) => {
      if (!e.target || e.target.id !== 'avitoLink') return;
      setTimeout(() => {
        const link = String(e.target.value || '').trim();
        if (link) parse(link);
      }, 80);
    }, true);
  } catch (e) { }
})();
