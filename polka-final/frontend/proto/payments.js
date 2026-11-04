/* GUARDED */
/* ============================================================
   ПОЛКА — оплата подписки «Плюс»
   Единственный файл, который связывает кнопку «Оплатить»
   с платёжными провайдерами бэкенда и обновляет состояние UI.

   Подключается в index.html после adapter.js:
     <script src="payments.js"></script>

   Зависимости: window.PolkaAPI.api(path, opts) — из adapter.js
   ============================================================ */
(function (window, document) {
  'use strict';

  var TG = function () {
    return (window.Telegram && window.Telegram.WebApp) || null;
  };

  /* ---------- мелкие помощники ---------- */

  function say(text) {
    var tg = TG();
    if (tg && tg.showAlert) tg.showAlert(String(text));
    else window.alert(String(text));
  }

  function Haptic(type) {
    var tg = TG();
    try {
      if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type || 'light');
    } catch (e) { /* не критично */ }
  }

  function rub(n) {
    return (Number(n) || 0).toLocaleString('ru-RU') + ' \u20BD';
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* ---------- состояние ---------- */

  var STATE = {
    plans: [],          // [{product, amount, days}]
    current: null,      // выбранный план
    orderUuid: null,    // id заказа на сервере
    provider: null,     // 'paw' | 'cispay'
    polling: false,
    paid: false,
    plan: 'trial'
  };

  /* ---------- интерфейс ---------- */

  function priceNode() { return document.getElementById('priceNow'); }

  function unitLabel(days) {
    if (Number(days) === 7) return 'руб/нед';
    return 'руб/мес';
  }

  // Витрина: три дешёвых входа вместо одной подписки. Плюс остаётся
  // в бэкенде, но в чипах показываем именно их — так человеку проще
  // решиться на первую покупку.
  var VISIBLE_PRODUCTS = ['link_1_30', 'link_2_30', 'link_3_30',
                          'extra_search', 'pack_5', 'unlimited_30',
                          'pro_30', 'pro_90'];

  function planTitle(product, days) {
    if (product === 'extra_search') return 'Мини · 3 поиска';
    if (product === 'pack_5') return 'Пакет · 10 поисков';
    if (product === 'unlimited_30') return 'Безлимит · 30 дней';
    if (product === 'pro_30') return 'PRO · 30 дней';
    if (product === 'pro_90') return 'PRO · 90 дней';
    if (Number(days) === 7) return 'Неделя';
    if (Number(days) === 90) return '90 дней';
    return 'Месяц';
  }

  function planUnit(product, days) {
    if (product === 'extra_search') return '3 поиска · 30 дней';
    if (product === 'pack_5') return '10 поисков · 30 дней';
    if (product === 'unlimited_30') return 'без лимита · 30 дней';
    if (product === 'pro_30') return '20 поисков + подборка';
    if (product === 'pro_90') return '20 поисков + подборки';
    if (product === 'link_1_30') return '1 ссылка · 30 дней';
    if (product === 'link_2_30') return '2 ссылки · 30 дней';
    if (product === 'link_3_30') return '3 ссылки · 30 дней';
    return unitLabel(days);
  }

  // Группы витрины: сначала PRO для перекупов, ниже — обычные варианты.
  var PLAN_GROUPS = [
    ['Мониторинг ссылок с Авито', ['link_1_30', 'link_2_30', 'link_3_30']],
    ['Для перекупов', ['pro_30', 'pro_90']],
    ['Обычные варианты', ['unlimited_30', 'pack_5', 'extra_search']],
  ];

  var PLAN_META = {
    pro_30: '20 поисков · приоритетная проверка · подборка раз в неделю',
    pro_90: '20 поисков · приоритетная проверка · подборки 3 месяца',
    link_1_30: '1 поисковая ссылка · проверка раз в 5 минут',
    link_2_30: '2 поисковые ссылки · проверка раз в 5 минут',
    link_3_30: '3 поисковые ссылки · проверка раз в 5 минут',
    unlimited_30: 'без ограничения поисков · находки без задержки',
    pack_5: '10 поисков · 30 дней',
    extra_search: '3 поиска · 30 дней',
  };
  var PLAN_SHORT = {
    pro_30: 'PRO', pro_90: 'PRO', unlimited_30: 'Безлимит',
    link_1_30: '1 ссылка', link_2_30: '2 ссылки', link_3_30: '3 ссылки',
    pack_5: 'Пакет', extra_search: 'Мини', week: 'Неделя', plus_30: 'Месяц',
    plus_90: '90 дней',
  };

  function rub2(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString('ru-RU') + ' \u20BD';
  }

  function renderPlanChips() {
    var wrap = document.getElementById('tarwrap');
    if (!wrap || !STATE.plans || !STATE.plans.length) return;
    var host = document.getElementById('planChipsBox');
    if (!host) {
      host = document.createElement('div');
      host.id = 'planChipsBox';
      wrap.insertBefore(host, wrap.firstChild);
    }
    host.innerHTML = '';
    var visible = {};
    STATE.plans.forEach(function (pl) {
      if (VISIBLE_PRODUCTS.indexOf(String(pl.product)) !== -1) visible[pl.product] = pl;
    });
    // Старый кеш ответа не должен оставлять человека без выбора.
    if (!Object.keys(visible).length) {
      STATE.plans.forEach(function (pl) { visible[pl.product] = pl; });
    }
    PLAN_GROUPS.forEach(function (group) {
      var items = group[1].map(function (k) { return visible[k]; }).filter(Boolean);
      if (!items.length) return;
      var sec = document.createElement('div');
      sec.className = 'sect';
      sec.textContent = group[0];
      host.appendChild(sec);
      items.forEach(function (pl) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'planChip'
          + (STATE.current && pl.product === STATE.current.product ? ' on' : '');
        var title = PLAN_SHORT[pl.product] || planTitle(pl.product, pl.days);
        var tag = (String(pl.product).indexOf('pro_') === 0)
          ? '<span class="tag">для перекупов</span>' : '';
        var meta = PLAN_META[pl.product] || planUnit(pl.product, pl.days);
        b.innerHTML = '<span class="pn"><b>' + title + tag + '</b><i>' + meta
          + '</i></span><span class="pp">' + rub2(pl.amount) + '</span>';
        b.addEventListener('click', function () {
          STATE.current = pl;
          Array.prototype.forEach.call(host.querySelectorAll('.planChip'), function (c) {
            c.classList.remove('on');
          });
          b.classList.add('on');
          paintPlans();
          showBalanceButton();
        });
        host.appendChild(b);
      });
    });
  }

  function paintPlans() {
    // Цена живёт в одном месте — в карточке выбранного тарифа.
    if (!STATE.current || !STATE.current.amount) return;
    var base = Number(STATE.current.amount) || 0;
    var pct = Number(window.__promoPercent || 0);
    var price = pct ? Math.max(1, Math.round(base * (100 - pct) / 100)) : base;
    var prod = String(STATE.current.product || '');
    var nameEl = document.getElementById('planName');
    var periodEl = document.getElementById('planPeriod');
    var priceEl = document.getElementById('planPrice');
    var noteEl = document.getElementById('planNote');
    var btn = document.getElementById('payBtn');
    var days = Number(STATE.current.days) || 0;
    var _periodTxt = (prod === 'pro_90') ? '90 дней'
      : (days === 7 ? '7 дней' : '30 дней');
    if (nameEl) {
      nameEl.textContent = (PLAN_SHORT[prod] || planTitle(prod, days))
        + ' · ' + _periodTxt;
    }
    if (periodEl) periodEl.textContent = _periodTxt;
    if (priceEl) priceEl.textContent = price.toLocaleString('ru-RU');
    if (btn && !STATE.paid) btn.textContent = 'Оплатить ' + rub(price);
    if (noteEl) {
      noteEl.textContent = pct
        ? ('Скидка ' + pct + '% · вместо ' + rub2(base) + '. Без автосписаний.')
        : 'Без автосписаний. Отменить нечего — второго платежа не будет.';
    }
  }

  function paintPaid(days) {
    var title = document.getElementById('trialTitle');
    var badge = document.getElementById('trialBadge');
    var btn = document.getElementById('payBtn');
    if (title) title.textContent = days
      ? ('Плюс активен · ' + days + ' дней')
      : 'Плюс активен';
    if (badge) badge.textContent = 'Оплачено';
    if (btn) {
      btn.textContent = 'Оплачено';
      btn.disabled = true;
      btn.style.opacity = '0.65';
    }
    var chips = document.getElementById('planChipsBox');
    if (chips) chips.style.display = 'none';
    var plus = document.getElementById('pluspill');
    if (plus) plus.style.display = 'inline-flex';
  }

  /* ---------- загрузка планов ---------- */

  async function loadPlans() {
    try {
      // ?t= — чтобы WebView не отдал старый ответ из кеша
      var data = await window.PolkaAPI.api('/api/pay/plans?t=' + Date.now());
      STATE.plans = data.plans || [];
      STATE.plan = data.plan || 'trial';
      var wanted = String(data.default_product || 'extra_search');
      STATE.current =
        STATE.plans.filter(function (p) { return p.product === wanted; })[0] ||
        STATE.plans.filter(function (p) { return p.product === 'plus_30'; })[0] ||
        STATE.plans[0] || null;
      renderPlanChips();
      paintPlans();
      showBalanceButton();
      if (STATE.plan && STATE.plan !== 'trial' && STATE.plan !== 'free') {
        STATE.paid = true;
        paintPaid(0);
        const badge = document.getElementById('trialBadge');
        if (badge) badge.textContent = 'Активно';
        const title = document.getElementById('trialTitle');
        if (title) title.textContent = 'Плюс активен';
      } else {
        // ВАРИАНТ A: бесплатный доступ — один поиск без ограничения по
        // времени. Никаких таймеров и «пробных периодов».
        const badge = document.getElementById('trialBadge');
        const title = document.getElementById('trialTitle');
        if (badge) badge.textContent = '1 поиск';
        if (title) title.textContent = 'Бесплатный доступ';
      }
      wirePayButton();
      return STATE.plans;
    } catch (e) {
      wirePayButton();  // кнопка должна реагировать даже если планы не пришли
      return [];
    }
  }

  /* ---------- создание счёта ---------- */

  async function createOrder(plan) {
    var promo = window.__promo || '';
    var body = { product: plan.product, promo: promo, base_url: location.origin };

    // 1) PayAnyWay — им пользовались раньше, он включён
    try {
      var paw = await window.PolkaAPI.api('/api/pay/paw/create', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (paw && paw.ok && paw.url) {
        return { ok: true, url: paw.url, provider: 'paw', uuid: paw.order_uuid, free: !!paw.free };
      }
      if (paw && paw.free) {
        return { ok: true, free: true, provider: 'paw' };
      }
      if (paw && paw.detail) {
        // запомним причину, но попробуем второго провайдера
        STATE.lastError = paw.detail;
      }
    } catch (e) {
      STATE.lastError = (e && e.message) || 'paw недоступен';
    }

    // 2) CISPay — запасной
    try {
      var cis = await window.PolkaAPI.api('/api/pay/cispay/create', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      var url = cis && (cis.pay_url || cis.url || cis.link);
      if (cis && cis.ok && url) {
        return { ok: true, url: url, provider: 'cispay', uuid: cis.order_uuid };
      }
      if (cis && cis.detail) STATE.lastError = cis.detail;
    } catch (e) {
      STATE.lastError = (e && e.message) || 'cispay недоступен';
    }

    return { ok: false, error: STATE.lastError || 'Оплата картой пока не включена' };
  }

  /* ---------- переход к оплате ---------- */

  function openPayment(url) {
    var tg = TG();
    if (tg && tg.openLink) {
      tg.openLink(url);
      return;
    }
    if (tg && tg.openTelegramLink && /^https:\/\/t\.me\//.test(url)) {
      tg.openTelegramLink(url);
      return;
    }
    window.open(url, '_blank');
  }

  /* ---------- опрос статуса ---------- */

  async function checkStatus() {
    try {
      var q = STATE.orderUuid ? ('?uuid=' + encodeURIComponent(STATE.orderUuid)) : '';
      var path = STATE.provider === 'paw'
        ? ('/api/pay/paw/status' + q)
        : ('/api/pay/cispay/status' + q);
      var res = await window.PolkaAPI.api(path);
      if (res && (res.credited || res.status === 'paid' || res.paid)) {
        return { paid: true, days: res.days || 0 };
      }
      return { paid: false };
    } catch (e) {
      return { paid: false };
    }
  }

  async function waitForPayment(maxAttempts) {
    if (STATE.polling) return;
    STATE.polling = true;
    var attempts = 0;
    var limit = maxAttempts || 20;      // 20 × 6 c ≈ 2 минуты
    while (attempts < limit) {
      attempts += 1;
      await sleep(6000);
      var st = await checkStatus();
      if (st.paid) {
        STATE.polling = false;
        STATE.paid = true;
        paintPaid(st.days);
        Haptic('medium');
        say('Оплата прошла. Плюс активен' + (st.days ? ' на ' + st.days + ' дней' : '') + '.');
        return true;
      }
      if (document.visibilityState === 'visible' && attempts % 5 === 0) {
        // при возврате из платёжной формы проверяем сразу
        var again = await checkStatus();
        if (again.paid) {
          STATE.polling = false;
          STATE.paid = true;
          paintPaid(again.days);
          say('Оплата прошла. Плюс активен.');
          return true;
        }
      }
    }
    STATE.polling = false;
    say('Платёж не подтверждён. Если деньги списались — напишите в @suppolka.');
    return false;
  }

  /* ---------- главное действие кнопки ---------- */

  /* ---------- оплата с баланса рефералов ---------- */

  async function balance() {
    try {
      const res = await window.PolkaAPI.api('/api/referral');
      return Number(res.balance || 0);
    } catch (e) { return 0; }
  }

  async function payWithBalance() {
    const plan = STATE.current || { product: 'plus_30' };
    try {
      const res = await window.PolkaAPI.api('/api/pay/with-balance', {
        method: 'POST',
        body: JSON.stringify({ product: plan.product })
      });
      if (res && res.paid) {
        STATE.paid = true;
        paintPaid(res.days || 0);
        Haptic('medium');
        say('Оплачено с баланса. Плюс активен' +
            (res.days ? ' на ' + res.days + ' дней' : '') + '.');
        return true;
      }
      say('Не удалось оплатить с баланса');
    } catch (e) {
      say('Недостаточно средств на балансе. Приглашайте друзей — 20% с их пополнений.');
    }
    return false;
  }

  async function showBalanceButton() {
    const bal = await balance();
    let btn = document.getElementById('balancePayBtn');
    const payBtn = document.getElementById('payBtn');
    if (!payBtn || !bal) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'balancePayBtn';
      btn.className = 'mailbtn';
      // Ставим отдельной плашкой под синей карточкой, а не внутри неё
      btn.style.cssText = 'height:48px;font-size:12px;width:100%;margin-top:2px';
      const anchor = document.querySelector('#s-tariffs .scroll');
      const card = payBtn.closest('.card');
      if (anchor && card && card.parentNode === anchor) {
        anchor.insertBefore(btn, card.nextSibling);
      } else {
        (anchor || payBtn.parentNode).appendChild(btn);
      }
      btn.addEventListener('click', payWithBalance);
    }
    const price = (STATE.current && STATE.current.amount) || 149;
    btn.textContent = 'Оплатить с баланса (' + bal.toLocaleString('ru-RU') + ' \u20BD)';
    btn.style.display = (!STATE.paid && bal >= price) ? 'block' : 'none';
  }

  async function pay() {
    if (STATE.paid) {
      say('Плюс уже активен');
      return;
    }
    var plan = STATE.current;
    if (!plan) {
      await loadPlans();
      plan = STATE.current;
    }
    if (!plan) {
      say('Тарифы не загрузились. Обновите приложение.');
      return;
    }

    var btn = document.getElementById('payBtn');
    var oldText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Создаём счёт…'; }

    var order = await createOrder(plan);

    if (btn) { btn.disabled = false; btn.textContent = oldText || 'Оплатить'; }

    if (!order.ok) {
      Haptic('heavy');
      say(order.error || 'Не удалось создать счёт');
      return;
    }
    if (order.free) {
      STATE.paid = true;
      paintPaid(0);
      say('Промокод применён — Плюс активирован без оплаты.');
      return;
    }

    STATE.orderUuid = order.uuid || null;
    STATE.provider = order.provider;

    Haptic('light');
    openPayment(order.url);
    waitForPayment(20);
  }

  /* ---------- привязка кнопки ---------- */

  function wirePayButton() {
    var btn = document.getElementById('payBtn');
    if (!btn) return;
    btn.onclick = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      pay();
    };
  }

  /* ---------- хуки жизненного цикла ---------- */

  function wireScreenSwitch() {
    if (typeof window.go !== 'function' || window.go.__payments) return;
    var orig = window.go;
    var wrapped = function (name) {
      var r = orig.apply(this, arguments);
      if (name === 'tariffs') {
        loadPlans();
        setTimeout(wirePayButton, 100);
      }
      return r;
    };
    wrapped.__payments = true;
    window.go = wrapped;
  }

  function readPromoFromUrl() {
    var code = '';
    try {
      code = new URLSearchParams(location.search).get('promo') || '';
    } catch (e) { }
    if (!code) return;
    window.__promo = String(code).trim().toUpperCase();
    window.PolkaAPI.api('/api/pay/promo-check?code=' + encodeURIComponent(code))
      .then(function (res) {
        var pct = Number((res && (res.percent || res.discount)) || 0);
        if (pct > 0) {
          window.__promoPercent = pct;
          paintPlans();
          showBalanceButton();
        }
      })
      .catch(function () { });
  }

  function init() {
    readPromoFromUrl();
    wirePayButton();
    // Скидка пришла — пересчитываем цену на кнопке
    window.addEventListener('polka:promo', function () {
      STATE.paid = false;
      paintPlans();
    });
    wireScreenSwitch();
    loadPlans();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && STATE.orderUuid && !STATE.paid) {
        checkStatus().then(function (st) {
          if (st.paid) {
            STATE.paid = true;
            paintPaid(st.days);
            say('Оплата прошла. Плюс активен.');
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(init, 900);   // прототип инициализируется асинхронно

  /* ---------- публичный интерфейс ---------- */
  window.PolkaPay = {
    pay: pay,
    payWithBalance: payWithBalance,
    balance: balance,
    reload: loadPlans,
    status: checkStatus,
    state: STATE
  };
})(window, document);
