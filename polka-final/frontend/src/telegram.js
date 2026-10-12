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

// Цвета берём из темы Telegram, а не зашитыми числами: значения из
// themeParams прокидываем в CSS-переменные --tg-theme-*, а colorScheme
// сообщаем токенам через data-атрибут, чтобы тема Telegram имела
// приоритет над системной.
function applyTelegramTheme(tg) {
  const p = tg.themeParams || {}
  const dark = tg.colorScheme === 'dark'
  const root = document.documentElement

  const map = {
    '--tg-theme-bg-color': p.bg_color,
    '--tg-theme-secondary-bg-color': p.secondary_bg_color,
    '--tg-theme-text-color': p.text_color,
    '--tg-theme-hint-color': p.hint_color,
    '--tg-theme-link-color': p.link_color,
    '--tg-theme-button-color': p.button_color,
    '--tg-theme-button-text-color': p.button_text_color,
    '--tg-theme-header-bg-color': p.header_bg_color,
  }
  Object.keys(map).forEach((key) => {
    if (map[key]) root.style.setProperty(key, map[key])
  })

  root.dataset.tgTheme = dark ? 'dark' : 'light'

  // Фолбэк — значения нашей палитры, если Telegram цвет не прислал.
  tg.setHeaderColor?.(p.header_bg_color || (dark ? '#1C1C1E' : '#F5F5F7'))
  tg.setBackgroundColor?.(p.bg_color || (dark ? '#000000' : '#F5F5F7'))
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
