/* GUARDED */
/* ============================================================
   ПОЛКА — безопасные отступы Telegram
   В полноэкранном режиме сверху висят кнопки «Закрыть», «•••» и стрелка.
   Берём их высоту из Telegram и подставляем в CSS-переменную, чтобы логотип
   и заголовки экранов не оказывались под ними.
   ============================================================ */
(function (window, document) {
  'use strict';

  function apply() {
    var tg = window.Telegram && window.Telegram.WebApp;
    // Запас: если Telegram не сообщил высоту панели, берём 96 px — столько
    // занимают «Закрыть», «•••» и стрелка в полноэкранном режиме.
    var top = tg ? 96 : 54;

    if (tg) {
      try {
        var safe = (tg.safeAreaInset && tg.safeAreaInset.top) || 0;
        var content = (tg.contentSafeAreaInset && tg.contentSafeAreaInset.top) || 0;
        if (content) {
          // contentSafeAreaInset уже учитывает панель Telegram
          top = content + 8;
        } else if (safe) {
          top = safe + 54;
        } else if (tg.isExpanded) {
          top = 96;
        }
      } catch (e) { /* остаёмся на запасе */ }
    }
    var _fs = false;
    try { _fs = !!(tg && tg.isFullscreen); } catch (e) { }
    if (tg && _fs && top < 96) top = 96;   // только в настоящем fullscreen
    document.documentElement.style.setProperty('--tg-top', top + 'px');
  }

  function init() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      try {
        // Fullscreen больше НЕ запрашиваем: на ПК и в десктопном Telegram
        // приложение разворачивалось на всё окно, хотя человек открыл его
        // как обычное мини-приложение. Пусть Telegram сам решает размер.
        tg.onEvent && tg.onEvent('viewportChanged', apply);
        tg.onEvent && tg.onEvent('safeAreaChanged', apply);
        tg.onEvent && tg.onEvent('contentSafeAreaChanged', apply);
      } catch (e) { }
    }
    apply();
    setTimeout(apply, 300);
    setTimeout(apply, 1200);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', apply);
  setTimeout(init, 800);
})(window, document);
