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
    return window.Telegram?.WebApp?.initData || ''
  } catch {
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
