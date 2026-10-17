export function initTelegramMiniApp() {
  const tg = window.Telegram?.WebApp
  if (!tg) return null

  tg.ready()
  tg.expand()

  // Свайп вниз закрывает мини-приложение, но внутри есть вертикальная
  // прокрутка — и жест закрывал окно вместо прокрутки ленты. Отключаем.
  tg.disableVerticalSwipes?.()

  // В приложении свои кнопки в контенте, поэтому нативную MainButton
  // прячем: по ТЗ 5.7 дублирование запрещено.
  tg.MainButton?.hide?.()

  applyTelegramTheme(tg)
  // Тема может смениться на ходу — обязаны отреагировать, иначе цвета
  // останутся от прошлой темы.
  try {
    tg.onEvent?.('themeChanged', () => applyTelegramTheme(tg))
  } catch (e) {
    console.warn('[polka] themeChanged недоступен', e)
  }

  return tg
}

// Цвета берём из нашей палитры: тёмная тема убрана по решению заказчика,
// приложение всегда светлое. Маппинг themeParams → --tg-theme-* и
// dataset.tgTheme удалены на этапе 5: тёмных токенов в CSS больше нет,
// эти переменные никто не читал.
function applyTelegramTheme(tg) {
  // Цвета шапки и фона — из нашей палитры. Цвета Telegram не подставляем:
  // в тёмном Telegram они сделали бы шапку тёмной при светлом приложении.
  // Цвет шапки и фона — из токена --bg, чтобы родная шапка
  // Telegram не спорила с белым фоном экрана (спека v2).
  const bgColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg').trim() || '#FFFFFF'
  tg.setHeaderColor?.(bgColor)
  tg.setBackgroundColor?.(bgColor)
}

export function getInitData() {
  try {
    const data = window.Telegram?.WebApp?.initData || ''
    if (!data) console.warn('[polka] initData пустой. Telegram WebApp скрипт загружен?', !!window.Telegram?.WebApp)
    return data
  } catch (e) {
    console.warn('[polka] ошибка чтения initData', e)
    return ''
  }
}

export function getTelegramUser() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (!user) {
    return null
  }
  return user
}
