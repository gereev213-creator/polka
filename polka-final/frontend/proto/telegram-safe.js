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
    // На телефоне в fullscreen верхняя панель Telegram занимает ~96 px,
    // и логотип не должен под неё заезжать.
    if (tg && !_fs && top < 8) top = 8;
    document.documentElement.style.setProperty('--tg-top', top + 'px');
  }

  function init() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      try {
        // Fullscreen нужен ТОЛЬКО на телефоне: там без него мини-апп
        // открывается нижней шторкой, контент обрезается снизу и выглядит
        // плохо. На ПК (tdesktop/macos/web) не разворачиваем — там это
        // открывало приложение на всё окно.
        var _platform = '';
        try { _platform = String(tg.platform || '').toLowerCase(); } catch (e) { }
        var _desktop = /tdesktop|macos|web|linux|windows/.test(_platform);
        if (!_desktop && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
          try { tg.requestFullscreen && tg.requestFullscreen(); } catch (e) { }
        }
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
