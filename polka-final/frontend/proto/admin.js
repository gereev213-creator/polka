/* GUARDED */
/* ============================================================
   ПОЛКА — админка внутри приложения
   Данные берутся из существующих админских эндпоинтов,
   авторизация — по Telegram initData через adapter.js
   ============================================================ */
(function (window, document) {
  'use strict';

  function api(path, opts) { return window.PolkaAPI.api(path, opts); }

  function say(text) {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.showAlert) tg.showAlert(String(text));
    else alert(String(text));
  }

  function num(n) { return (Number(n) || 0).toLocaleString('ru-RU'); }

  function card(title, inner) {
    return `<div class="card" style="padding:16px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:870;color:#2C2C2C;margin-bottom:10px">${title}</div>
      ${inner}</div>`;
  }

  function row(label, value) {
    return `<div class="mrow" style="min-height:38px!important;padding:6px 0!important">
      <span class="grow" style="font-size:12px!important">${label}</span>
      <span style="font-size:12px;font-weight:870;color:#3373FA">${value}</span></div>`;
  }

  const state = { metrics: null, promo: [], adminUser: null, adminQuery: '' };

  async function loadMetrics() {
    try {
      state.metrics = await api('/api/admin/metrics');
    } catch (e) {
      state.metrics = null;
    }
  }

  async function loadPromo() {
    try {
      const res = await api('/api/admin/promo');
      state.promo = res.codes || res.items || res.promos || [];
    } catch (e) {
      state.promo = [];
    }
  }

  function render() {
    const box = document.getElementById('adminBody');
    if (!box) return;
    const m = state.metrics || {};
    const f = m.funnel || m.stats || m;

    const statsHtml = [
      row('Пользователей', num(f.users || f.total_users || 0)),
      row('Объявлений', num(f.ads || f.total_ads || 0)),
      row('На модерации', num(f.moderation || f.moderation_ads || 0)),
      row('Критериев', num(f.criteria || f.total_criteria || 0)),
      row('Находок', num(f.matches || f.total_matches || 0)),
      row('Платежей', num(f.payments || f.paid || 0)),
    ].join('');

    const promoHtml = state.promo.length
      ? state.promo.slice(0, 12).map((p) => {
          const val = p.value || p.discount || 0;
          const mark = p.active ? '' : ' · выкл';
          const label = (p.code || '—') + (val ? ' · ' + val + (p.kind === 'discount' ? '%' : '') : '') + mark;
          return `<div class="mrow" style="min-height:38px!important;padding:6px 0!important">
            <span class="grow" style="font-size:12px!important">${label}</span>
            <button class="mailbtn" style="height:28px;font-size:9px;padding:0 10px;margin-right:6px"
                    onclick="PolkaAdmin.togglePromo('${p.code}', ${p.active ? 0 : 1})">
              ${p.active ? 'выключить' : 'включить'}</button>
            <span style="font-size:12px;font-weight:870;color:#3373FA">${p.uses || 0}/${p.max_uses || '∞'}</span>
          </div>`;
        }).join('')
      : '<div style="font-size:11px;color:#7A8CA3">Промокодов нет</div>';

    const planRu = { plus: 'Плюс', trial: 'Пробный', free: 'Бесплатный' };
    const u = state.adminUser;
    const userCardHtml = u
      ? `<div style="font-size:13px;font-weight:870;color:#1F2A37">@${u.username || u.id}</div>
         <div style="font-size:11px;color:#7A8CA3;margin:2px 0 8px">ID ${u.id} · план: ${planRu[u.plan] || u.plan}${u.plus_until ? ' · Плюс до ' + u.plus_until : ''}${u.trial_hours_left ? ' · пробный: ' + Math.ceil(u.trial_hours_left) + ' ч' : ''}</div>
         <div style="font-size:11px;color:#5C6E86;margin-bottom:10px">Поиски: ${u.criteria_active} активных / ${u.criteria_total}; монет: ${u.coins}</div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
           <button class="bigbtn" style="height:42px;font-size:11px;padding:0 6px" onclick="PolkaAdmin.grant('plus_days',30)">+30 дней Плюс</button>
           <button class="mailbtn" style="height:42px;font-size:11px;padding:0 6px" onclick="PolkaAdmin.grant('trial_days',1)">Пробный +1 день</button>
           <button class="mailbtn" style="height:42px;font-size:11px;padding:0 6px" onclick="PolkaAdmin.grant('coins',100)">Монеты +100</button>
           <button class="mailbtn" style="height:42px;font-size:11px;padding:0 6px;color:#C0392B" onclick="PolkaAdmin.grant('plan_free',0)">Сбросить план</button>
         </div>`
      : '<div style="font-size:11px;color:#7A8CA3">Найдите пользователя по @username или ID — появятся кнопки выдачи.</div>';

    box.innerHTML =
      card('Статистика', statsHtml) +
      card('Пользователь', `
        <div style="display:flex;gap:8px">
          <input id="adminUserQ" placeholder="@username или ID" value="${state.adminQuery || ''}"
                 style="flex:1;height:40px;border-radius:14px;border:none;background:#E7EFF6;
                        padding:0 12px;font-size:12px;font-weight:700">
          <button class="bigbtn" style="height:40px;padding:0 14px;font-size:11px"
                  onclick="PolkaAdmin.findUser()">Найти</button>
        </div>
        <div id="adminUserCard" style="margin-top:10px">${userCardHtml}</div>`) +
      card('Быстрые действия', `
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="bigbtn" style="height:44px;font-size:12px" onclick="go('moderation')">Модерация объявлений</button>
          <button class="mailbtn" style="height:44px;font-size:12px" onclick="PolkaAdmin.reload()">Обновить данные</button>
        </div>`) +
      card('Промокоды', promoHtml + `
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="promoCode" placeholder="КОД" style="flex:1;height:40px;border-radius:14px;border:none;
                 background:#E7EFF6;padding:0 12px;font-size:12px;font-weight:700">
          <input id="promoPct" placeholder="%" inputmode="numeric" style="width:64px;height:40px;border-radius:14px;
                 border:none;background:#E7EFF6;padding:0 12px;font-size:12px;font-weight:700">
          <button class="bigbtn" style="height:40px;width:44px;font-size:18px;padding:0" onclick="PolkaAdmin.addPromo()">+</button>
        </div>`);
  }

  async function findUser() {
    const inp = document.getElementById('adminUserQ');
    const q = (inp && inp.value || '').trim();
    if (!q) { say('Введите @username или ID'); return; }
    state.adminQuery = q;
    try {
      const res = await api('/api/admin/user?q=' + encodeURIComponent(q));
      state.adminUser = res.user || null;
      render();
    } catch (e) {
      state.adminUser = null;
      render();
      say('Не найден: ' + (e && e.detail || e && e.error || 'ошибка'));
    }
  }

  async function grant(kind, amount) {
    if (!state.adminUser) return;
    try {
      const res = await api('/api/admin/grant', {
        method: 'POST',
        body: JSON.stringify({ user: state.adminUser.id, kind: kind, amount: amount }),
      });
      state.adminUser = res.user || state.adminUser;
      render();
      say(res.text || 'Готово');
    } catch (e) {
      say('Ошибка: ' + (e && e.detail || e && e.error || 'не вышло'));
    }
  }

  async function reload() {
    render();
    await Promise.all([loadMetrics(), loadPromo()]);
    render();
  }

  async function togglePromo(code, active) {
    try {
      await api('/api/admin/promo', {
        method: 'POST',
        body: JSON.stringify({ action: active ? 'activate' : 'deactivate', code: code }),
      });
      await reload();
    } catch (e) {
      say('Не удалось изменить промокод');
    }
  }

  async function addPromo() {
    const code = (document.getElementById('promoCode') || {}).value || '';
    const pct = (document.getElementById('promoPct') || {}).value || '';
    if (!code.trim() || !pct) return say('Введите код и скидку');
    try {
      // Сервер ждёт kind и value, а не discount: иначе bad_kind
      const value = Number(pct) || 0;
      await api('/api/admin/promo', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          kind: 'discount',          // скидка на оплату, %
          value: value,
          max_uses: 0,               // без ограничения
          per_user: 1,
        }),
      });
      document.getElementById('promoCode').value = '';
      document.getElementById('promoPct').value = '';
      await reload();
      say('Промокод создан');
    } catch (e) {
      say('Не удалось создать промокод');
    }
  }

  function wire() {
    if (typeof window.go !== 'function' || window.go.__admin) return;
    const orig = window.go;
    const wrapped = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'admin') reload();
      return r;
    };
    wrapped.__admin = true;
    window.go = wrapped;
  }

  document.addEventListener('DOMContentLoaded', wire);
  setTimeout(wire, 800);
  window.PolkaAdmin = { reload, togglePromo, addPromo, findUser, grant };
})(window, document);
