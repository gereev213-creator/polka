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
    matrix: [],         // конструктор: [{links, days, amount, per_month, product}]
    current: null,      // выбранная комбинация «ссылки × срок»
    links: 1,
    days: 30,
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

  // ── Конструктор мониторинга ссылок: «сколько ссылок × на сколько дней» ──
  // Цены и допустимые комбинации приходят с сервера (link_matrix), чтобы
  // не держать прайс в двух местах: на сервере и в приложении.

  function rub2(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString('ru-RU') + ' \u20BD';
  }

  function matrix() { return STATE.matrix || []; }

  function combosFor(links) {
    return matrix().filter(function (x) { return Number(x.links) === Number(links); });
  }

  function comboFor(links, days) {
    var same = combosFor(links);
    for (var i = 0; i < same.length; i += 1) {
      if (Number(same[i].days) === Number(days)) return same[i];
    }
    // Срок недоступен для этого количества ссылок — берём ближайший
    // доступный, чтобы экран никогда не оставался без выбора.
    for (var j = 0; j < same.length; j += 1) {
      if (Number(same[j].days) === 30) return same[j];
    }
    return same[0] || null;
  }

  function availableLinks() {
    var seen = {};
    var out = [];
    matrix().forEach(function (x) {
      var n = Number(x.links);
      if (!seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out.sort(function (a, b) { return a - b; });
  }

  function availableDays(links) {
    var seen = {};
    var out = [];
    combosFor(links).forEach(function (x) {
      var d = Number(x.days);
      if (!seen[d]) { seen[d] = 1; out.push(d); }
    });
    return out.sort(function (a, b) { return a - b; });
  }

  // Экономия к оплате того же числа ссылок по 30 дней за 3 месяца.
  var matrixFind = function (links, days) {
    var m = matrix();
    for (var i = 0; i < m.length; i += 1) {
      if (Number(m[i].links) === Number(links)
          && Number(m[i].days) === Number(days)) return m[i];
    }
    return null;
  };

  function savingsFor(combo) {
    if (!combo) return 0;
    var n = Number(combo.links);
    var d = Number(combo.days);
    if (d !== 90) return 0;
    var month = matrixFind(n, 30);
    if (!month || !month.amount) return 0;
    var full = Number(month.amount) * 3;
    if (full <= 0) return 0;
    var pct = Math.round((1 - Number(combo.amount) / full) * 100);
    return pct > 0 ? pct : 0;
  }

  function daysWord(days) {
    var d = Number(days);
    if (d === 7) return '7 дней';
    if (d === 14) return '14 дней';
    if (d === 30) return '30 дней';
    return String(d) + ' дней';
  }

  function renderPlanChips() {
    var host = document.getElementById('planChipsBox');
    if (!host) return;
    host.innerHTML = '';
    if (!matrix().length) {
      host.innerHTML = '<div class="clabel">Тарифы не загрузились — потяни экран вниз</div>';
      return;
    }
    if (!STATE.current) {
      STATE.current = comboFor(STATE.links || 1, STATE.days || 30);
      if (STATE.current) {
        STATE.links = Number(STATE.current.links);
        STATE.days = Number(STATE.current.days);
      }
    }

    function chipRow(label, values, selected, onPick, smallOf, offFn, labelOf) {
      var wrap = document.createElement('div');
      wrap.className = 'cfield';
      var lab = document.createElement('div');
      lab.className = 'clabel';
      lab.textContent = label;
      wrap.appendChild(lab);
      var row = document.createElement('div');
      row.className = 'crow';
      values.forEach(function (val) {
        var b = document.createElement('button');
        b.type = 'button';
        var off = offFn ? offFn(val) : false;
        b.className = 'cchip' + (Number(val) === Number(selected) ? ' on' : '')
          + (off ? ' off' : '');
        var small = smallOf ? smallOf(val) : '';
        var text = labelOf ? labelOf(val) : val;
        b.innerHTML = '<span>' + text + '</span>'
          + (small ? '<small>' + small + '</small>' : '');
        b.addEventListener('click', function (e) {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          if (off) return;
          onPick(val);
        });
        row.appendChild(b);
      });
      wrap.appendChild(row);
      host.appendChild(wrap);
    }

    var counts = availableLinks();
    var days = availableDays(STATE.links);
    if (days.indexOf(Number(STATE.days)) === -1) STATE.days = days[0] || 30;

    chipRow('Сколько ссылок', counts, STATE.links, function (val) {
      STATE.links = Number(val);
      var combo = comboFor(STATE.links, STATE.days);
      if (!combo) return;
      STATE.current = combo;
      STATE.days = Number(combo.days);
      renderPlanChips();
      paintPlans();
      showBalanceButton();
    }, function (val) {
      return Number(val) === 5 ? 'PRO' : '';
    });

    chipRow('Срок', days, STATE.days, function (val) {
      STATE.days = Number(val);
      STATE.current = comboFor(STATE.links, STATE.days);
      if (!STATE.current) return;
      STATE.days = Number(STATE.current.days);
      renderPlanChips();
      paintPlans();
      showBalanceButton();
    }, function (val) {
      var combo = comboFor(STATE.links, val);
      var save = savingsFor(combo);
      return save > 0 ? ('\u2212' + save + '%') : '';
    }, null, function (val) {
      return String(val) + ' дн';
    });
  }

  function paintPlans() {
    if (!STATE.current || !STATE.current.amount) return;
    var base = Number(STATE.current.amount) || 0;
    var pct = Number(window.__promoPercent || 0);
    var price = pct ? Math.max(1, Math.round(base * (100 - pct) / 100)) : base;
    var prod = String(STATE.current.product || '');
    var priceEl = document.getElementById('planPrice');
    var periodEl = document.getElementById('planPeriod');
    var saveEl = document.getElementById('planSave');
    var noteEl = document.getElementById('planNote');
    var btn = document.getElementById('payBtn');
    var days = Number(STATE.current.days) || 0;
    var perMonth = Number(STATE.current.per_month) || (days ? Math.round(base * 30 / days) : 0);
    if (priceEl) {
      priceEl.textContent = price.toLocaleString('ru-RU') + ' \u20BD';
      // Промокод — на самой цене, чтобы скидка была видна в момент выбора.
      if (pct) {
        priceEl.innerHTML = price.toLocaleString('ru-RU') + ' \u20BD'
          + ' <span class="pp-old">' + rub2(base) + '</span>';
      }
    }
    if (periodEl) {
      periodEl.textContent = daysWord(days)
        + (perMonth ? ' \u00B7 \u2248' + perMonth.toLocaleString('ru-RU') + ' \u20BD/мес' : '');
    }
    if (saveEl) {
      var save = savingsFor(STATE.current);
      if (save > 0) {
        var month = matrixFind(STATE.current.links, 30);
        var money = month ? Math.max(0, Number(month.amount) * 3 - base) : 0;
        saveEl.style.display = 'inline-flex';
        saveEl.textContent = '\u2212' + save + '%'
          + (money ? (' \u00B7 \u044D\u043A\u043E\u043D\u043E\u043C\u0438\u044F ' + rub2(money)) : '')
          + ' \u043A \u0442\u0440\u0451\u043C \u043C\u0435\u0441\u044F\u0446\u0430\u043C \u043F\u043E 30 \u0434\u043D\u0435\u0439';
      } else {
        saveEl.style.display = 'none';
      }
    }
    if (btn && !STATE.paid) btn.textContent = 'Оплатить ' + rub2(price);
    if (noteEl) {
      noteEl.textContent = pct
        ? ('Скидка ' + pct + '% \u00B7 вместо ' + rub2(base) + ' \u00B7 без автосписаний')
        : 'Проверка каждые 5 минут \u00B7 находки в Telegram \u00B7 без автосписаний';
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
      STATE.matrix = data.link_matrix || [];
      STATE.plan = data.plan || 'trial';
      // По умолчанию — 1 ссылка на 30 дней (459 ₽): самый понятный вход.
      STATE.links = 1;
      STATE.days = 30;
      STATE.current = comboFor(1, 30) || (STATE.matrix[0] || null);
      if (STATE.current) {
        STATE.links = Number(STATE.current.links);
        STATE.days = Number(STATE.current.days);
      }
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
        // Бесплатно — одна ссылка: демо мониторинга. Скорость, за которую
        // платят, появляется после оплаты (проверка 5 минут вместо 30).
        const badge = document.getElementById('trialBadge');
        const title = document.getElementById('trialTitle');
        if (badge) badge.textContent = '24 \u0447\u0430\u0441\u0430';
        if (title) title.textContent = 'Бесплатно \u2014 1 ссылка';
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
