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

  // Цвета шапки и фона — из палитры ТЗ, с учётом темы Telegram.
  // Было #E7EFF6 из старой палитры: голубоватый фон выбивался из макета.
  const dark = tg.colorScheme === 'dark'
  tg.setHeaderColor?.(dark ? '#1C1C1E' : '#F5F5F7')
  tg.setBackgroundColor?.(dark ? '#000000' : '#F5F5F7')
  return tg
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
