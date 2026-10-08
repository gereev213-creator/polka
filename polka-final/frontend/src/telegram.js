export function initTelegramMiniApp() {
  const tg = window.Telegram?.WebApp
  if (!tg) return null

  tg.ready()
  tg.expand()
  tg.setHeaderColor?.('#E7EFF6')
  tg.setBackgroundColor?.('#E7EFF6')
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
