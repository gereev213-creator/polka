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

  function paintPlans() {
    var node = priceNode();
    if (!node || !STATE.current || !STATE.current.amount) return;
    var base = Number(STATE.current.amount) || 0;
    var pct = Number(window.__promoPercent || 0);
    var price = pct ? Math.max(1, Math.round(base * (100 - pct) / 100)) : base;
    var html = rub(price).replace(' \u20BD', ' <span>руб/мес</span>');
    if (pct) {
      html += ' <span style="text-decoration:line-through;opacity:.6;font-size:12px">'
            + rub(base) + '</span>';
    }
    node.innerHTML = html;
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
    var plus = document.getElementById('pluspill');
    if (plus) plus.style.display = 'inline-flex';
  }

  /* ---------- загрузка планов ---------- */

  async function loadPlans() {
    try {
      var data = await window.PolkaAPI.api('/api/pay/plans');
      STATE.plans = data.plans || [];
      STATE.plan = data.plan || 'trial';
      STATE.current =
        STATE.plans.filter(function (p) { return p.product === 'plus_30'; })[0] ||
        STATE.plans[0] || null;
      paintPlans();
      showBalanceButton();
      if (STATE.plan && STATE.plan !== 'trial' && STATE.plan !== 'free') {
        STATE.paid = true;
        paintPaid(0);
        const badge = document.getElementById('trialBadge');
        if (badge) badge.textContent = 'Плюс активен';
        const title = document.getElementById('trialTitle');
        if (title) title.textContent = 'Плюс активен';
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

  function init() {
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
