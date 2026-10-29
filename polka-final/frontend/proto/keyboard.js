/* GUARDED */
/* ============================================================
   ПОЛКА — поведение при открытой клавиатуре
   На iOS/Android клавиатура уменьшает visualViewport, но fixed-слой
   остаётся прежней высоты: поле ввода уезжает под кнопку, а каретка
   оказывается в другом месте. Здесь подгоняем высоту и подскролливаем
   активное поле в видимую зону.
   ============================================================ */
(function (window, document) {
  'use strict';

  var vv = window.visualViewport;

  function apply() {
    var wrap = document.getElementById('wrap');
    if (!wrap) return;
    var h = (vv && vv.height) ? vv.height : window.innerHeight;
    wrap.style.height = h + 'px';
    wrap.style.maxHeight = h + 'px';
    // Сдвиг страницы, если система уже прокрутила документ
    var top = (vv && vv.offsetTop) ? vv.offsetTop : 0;
    wrap.style.top = top + 'px';
    // Клавиатура открыта — прячем нижнее меню, иначе оно закрывает поле
    var keyboardOpen = (vv && window.innerHeight - vv.height > 120);
    if (keyboardOpen) document.body.classList.add('kbd-open');
    else if (!document.querySelector('input:focus, textarea:focus')) document.body.classList.remove('kbd-open');
  }

  function scrollFieldIntoView(el) {
    if (!el) return;
    setTimeout(function () {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        el.scrollIntoView();
      }
    }, 260);
  }

  function isField(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  document.addEventListener('focusin', function (e) {
    if (isField(e.target)) {
      document.body.classList.add('kbd-open');
      apply();
      scrollFieldIntoView(e.target);
      // Поле могло оказаться под фиксированной кнопкой — поднимаем выше
      setTimeout(function () {
        try {
          var rect = e.target.getBoundingClientRect();
          if (rect.bottom > (vv ? vv.height : window.innerHeight) - 40) {
            e.target.scrollIntoView({ block: 'center' });
          }
        } catch (err) { }
      }, 380);
    }
  }, true);

  document.addEventListener('focusout', function () {
    setTimeout(function () {
      document.body.classList.remove('kbd-open');
      apply();
    }, 160);
  }, true);

  function refocusField() {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) { }
    }
  }

  if (vv) {
    vv.addEventListener('resize', function () { apply(); setTimeout(refocusField, 120); });
    vv.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function () { setTimeout(apply, 250); });

  function init() { apply(); }
  document.addEventListener('DOMContentLoaded', init);
  setTimeout(init, 500);
  setTimeout(init, 1500);
})(window, document);
