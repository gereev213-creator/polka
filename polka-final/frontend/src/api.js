/* Единый API-клиент Mini App (ТЗ §31).
 * Backend — существующий бот-процесс (aiohttp, та же SQLite).
 * Авторизация: Telegram initData в заголовке X-Telegram-Init-Data на каждый
 * запрос. Backend сам извлекает user_id из проверенной подписи — frontend
 * user_id НЕ передаёт (ТЗ §15).
 */
const API_BASE = import.meta.env.VITE_API_URL || ''

function getInitData() {
  if (typeof window === 'undefined') return ''
  try {
    return window.Telegram?.WebApp?.initData || ''
  } catch {
    return ''
  }
}

export function resolveAssetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  if (/^blob:/.test(path)) return path
  if (/^data:/.test(path)) return path
  if (API_BASE.startsWith('http')) {
    return new URL(path, API_BASE).toString()
  }
  return path
}

function buildHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    ...(getInitData() ? { 'X-Telegram-Init-Data': getInitData() } : {}),
    ...extraHeaders,
  }
}

// ── Этап K6: честные таймауты, повторы и классификация ошибок ───────────────
// Раньше на ЛЮБУЮ ошибку показывалось «Проверь подключение к интернету», хотя
// чаще виноват медленный сервер: запрос не отменялся, автоповтора не было.
const DEFAULT_TIMEOUT = 20000       // лента, списки, карточки
const AI_TIMEOUT = 60000            // ответ модели идёт 5–15 с и дольше
const RETRY_DELAYS = [1500, 4000]   // паузы между повторами (только GET)
const CACHE_TTL_MS = 5 * 60 * 1000

export function isOffline() {
  if (typeof navigator === 'undefined') return false
  return navigator.onLine === false
}

/** Человеческий текст: «нет интернета» — только когда интернета правда нет. */
export function friendlyError(err) {
  if (err && err.kind === 'offline') return 'Нет интернета'
  if (err && err.kind === 'timeout') return 'Сервер отвечает медленно — пробуем ещё раз…'
  if (err && err.kind === 'server') return 'Сервер перегружен — пробуем ещё раз…'
  return (err && (err.detail || err.message)) || 'Не удалось загрузить данные'
}

/** Кэш последней удачной ленты: показываем сразу, обновляем в фоне (K6). */
export function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(`polka:${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Date.now() - (parsed.at || 0) > CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

export function cacheSet(key, data) {
  try {
    sessionStorage.setItem(`polka:${key}`, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // приватный режим или переполнение — не критично
  }
}

/** Обновление при возврате в приложение и при появлении сети (K6). */
export function onResume(cb) {
  if (typeof document === 'undefined') return () => {}
  const onVisible = () => { if (document.visibilityState === 'visible') cb() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', cb)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', cb)
  }
}

async function requestOnce(path, options, timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: buildHeaders(options.headers || {}),
      signal: controller.signal,
      ...options,
    })
  } catch (err) {
    const error = new Error(err && err.name === 'AbortError' ? 'timeout' : 'network')
    if (err && err.name === 'AbortError') {
      error.kind = 'timeout'
    } else {
      error.kind = isOffline() ? 'offline' : 'network'
    }
    error.retryable = true
    throw error
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let code = `http_${response.status}`
    // ВАЖНО: причина из detail раньше терялась, и на экран попадало
    // бесполезное «Не удалось…» вместо «такой критерий уже есть».
    let detail = ''
    try {
      const data = await response.json()
      code = data.error || code
      detail = data.detail || data.message || ''
    } catch {
      // ignore
    }
    const error = new Error(code)
    error.code = code
    error.detail = detail
    error.status = response.status
    error.kind = response.status >= 500 ? 'server' : 'http'
    error.retryable = response.status >= 500
    throw error
  }

  return response.json()
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  // Повторяем только безопасные запросы: POST повторять нельзя — на сервере
  // он уже мог изменить состояние (создать критерий, списать монеты).
  const attempts = method === 'GET' ? RETRY_DELAYS.length + 1 : 1
  const timeout = options.timeout || DEFAULT_TIMEOUT
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await requestOnce(path, options, timeout)
    } catch (err) {
      lastError = err
      const canRetry = method === 'GET' && err.retryable && !isOffline()
        && i < attempts - 1
      if (!canRetry) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i]))
    }
  }
  throw lastError
}

export const api = {
  // Лента и поиск: GET /api/ads?q&category&city&price_min&price_max&condition&delivery&sort&limit&offset
  getFeed: ({ category, limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams()
    if (category && category !== 'Все') params.set('category', category)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return request(`/api/ads?${params.toString()}`)
  },
  search: ({ q = '', category = '', city = '', priceMin = '', priceMax = '', condition = '', delivery = '', sort = 'date_desc', limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category && category !== 'Все') params.set('category', category)
    if (city) params.set('city', city)
    if (priceMin !== '' && priceMin != null) params.set('price_min', String(priceMin))
    if (priceMax !== '' && priceMax != null) params.set('price_max', String(priceMax))
    if (condition) params.set('condition', condition)
    if (delivery) params.set('delivery', delivery)
    if (sort) params.set('sort', sort)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return request(`/api/ads?${params.toString()}`)
  },
  getFilters: () => request('/api/filters'),
  getBanners: () => request('/api/banners'),
  getFeedBanners: () => request('/api/feed-banners'),
  getListing: (id) => request(`/api/ads/${id}`),

  // Создание: сначала фото (multipart) → путь, затем объявление
  uploadPhotos: async (files) => {
    const formData = new FormData()
    for (const file of files) formData.append('photos', file)
    const headers = {}
    if (getInitData()) headers['X-Telegram-Init-Data'] = getInitData()
    const response = await fetch(`${API_BASE}/api/ads/photos`, {
      method: 'POST',
      body: formData,
      headers,
    })
    if (!response.ok) {
      // Показываем причину от сервера, а не безликое «не удалось»:
      // иначе непонятно, что именно не так (размер, формат, авторизация).
      let detail = ''
      try {
        const data = await response.json()
        detail = data.detail || data.error || ''
      } catch {
        // ignore
      }
      const error = new Error(detail || 'upload_failed')
      error.status = response.status
      error.detail = detail
      throw error
    }
    return response.json()
  },
  // Поиск по фото: multipart, поэтому отдельный запрос (как uploadPhotos).
  // Раньше это делалось прямо в компоненте через fetch(`${API_BASE}...`),
  // но API_BASE не экспортируется из модуля — была ReferenceError, и поиск
  // по фото не работал вообще.
  photoSearch: async (file) => {
    const formData = new FormData()
    formData.append('photo', file)
    const headers = {}
    if (getInitData()) headers['X-Telegram-Init-Data'] = getInitData()
    const response = await fetch(`${API_BASE}/api/ads/photo-search`, {
      method: 'POST',
      body: formData,
      headers,
    })
    if (!response.ok) {
      let code = `http_${response.status}`
      try {
        const data = await response.json()
        code = data.error || code
      } catch {
        // ignore
      }
      const error = new Error(code)
      error.code = code
      error.status = response.status
      throw error
    }
    return response.json()
  },
  generateDescription: (title, category, condition, city) => request('/api/ai/generate-description', {
    method: 'POST',
    body: JSON.stringify({ title, category, condition, city }),
    timeout: AI_TIMEOUT,
  }),
  createListing: (payload) => request('/api/ads', { method: 'POST', body: JSON.stringify(payload) }),
  updateListing: (id, payload) => request(`/api/ads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteListing: (id) => request(`/api/ads/${id}`, { method: 'DELETE' }),
  markSold: (id) => request(`/api/ads/${id}/sold`, { method: 'POST' }),
  republish: (id) => request(`/api/ads/${id}`, { method: 'PATCH', body: JSON.stringify({ republish: true }) }),

  // Мои объявления
  getMyListings: () => request('/api/my-ads'),

  // Избранное (существующая таблица favorites)
  getFavorites: () => request('/api/favorites'),
  addFavorite: (id) => request(`/api/ads/${id}/favorite`, { method: 'POST' }),
  removeFavorite: (id) => request(`/api/ads/${id}/favorite`, { method: 'DELETE' }),

  // Профиль
  getProfile: () => request('/api/me'),

  // Чаты (существующая система chat_sessions/chat_messages)
  getChats: () => request('/api/chats'),
  startChat: (adId) => request('/api/chats/start', { method: 'POST', body: JSON.stringify({ ad_id: adId }) }),
  getChat: (id) => request(`/api/chat/${id}`),
  pollChat: (id, after = 0) => request(`/api/chat/${id}/poll?after=${after}`),
  sendMessage: (chatId, text, extra = {}) => request(`/api/chat/${chatId}/send`, { method: 'POST', body: JSON.stringify({ text, ...extra }) }),
  // Вложение в чат: фото, видео или голосовое. Отдельный эндпоинт, потому что
  // /send принимает только текст и отклоняет пустой (было 400 invalid text).
  sendChatMedia: async (chatId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const headers = {}
    if (getInitData()) headers['X-Telegram-Init-Data'] = getInitData()
    const response = await fetch(`${API_BASE}/api/chat/${chatId}/media`, {
      method: 'POST',
      body: formData,
      headers,
    })
    if (!response.ok) {
      let detail = ''
      try {
        const data = await response.json()
        detail = data.detail || data.error || ''
      } catch {
        // ignore
      }
      const error = new Error(detail || `http_${response.status}`)
      error.status = response.status
      error.detail = detail
      throw error
    }
    return response.json()
  },
  editMessage: (chatId, messageId, text) => request(`/api/chat/${chatId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  deleteMessage: (chatId, messageId) => request(`/api/chat/${chatId}/messages/${messageId}`, { method: 'DELETE' }),


  // ── Аукционы ─────────────────────────────────────────────────────────────
  // Находки агрегатора: отсортированы по выгоде относительно рынка
  getFindings: ({ category = '', city = '', minDiscount = 10, limit = 20, offset = 0 } = {}) => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (city) params.set('city', city)
    params.set('min_discount', String(minDiscount))
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return request(`/api/findings?${params.toString()}`)
  },
  // Критерии ловли: что бот ищет на Авито для этого пользователя
  getCriteria: () => request('/api/hunt'),
  addCriterion: (body) => request('/api/hunt', { method: 'POST', body: JSON.stringify(body) }),
  removeCriterion: (id) => request(`/api/hunt?id=${id}`, { method: 'DELETE' }),
  // Убрать лот из находок: пропадёт из ленты и больше не придёт в чат
  // ИИ разбирает фразу словами в те же фильтры, что задаются руками
  parseHunt: (text) => request('/api/hunt/ai',
    { method: 'POST', body: JSON.stringify({ text }), timeout: AI_TIMEOUT }),
  // Проверка критерия ДО сохранения: сколько объявлений подойдёт сейчас.
  // Видно, не слишком ли узкий запрос — иначе человек ждёт тишины.
  checkHunt: (draft) => request('/api/hunt/check',
    { method: 'POST', body: JSON.stringify(draft) }),
  // exclude — слова, которые больше не присылать по этому критерию
  hideFinding: (adId, exclude) => request('/api/findings/hide',
    { method: 'POST', body: JSON.stringify({ ad_id: adId, exclude: exclude || undefined }) }),

  // ── Диалог с ИИ (этап G): единый движок, состояние на сервере ───────────
  huntDialog: (payload) => request('/api/hunt/dialog',
    { method: 'POST', body: JSON.stringify(payload), timeout: AI_TIMEOUT }),

  // ── Монетизация (этап H) ────────────────────────────────────────────────
  getPlan: () => request('/api/plan'),
  coinsSpend: (kind, adId) => request('/api/coins/spend',
    { method: 'POST', body: JSON.stringify({ kind, ad_id: adId }) }),
  payInvoice: (product) => request('/api/pay/invoice',
    { method: 'POST', body: JSON.stringify({ product }) }),
  getReferral: () => request('/api/referral'),
  // Промокод: активировать (этап J)
  redeemPromo: (code) => request('/api/promo/redeem',
    { method: 'POST', body: JSON.stringify({ code }) }),

  // Готовые шаблоны критериев (универсальные условия под частые покупки)
  getTemplates: (group = '') => request(`/api/hunt/templates${group ? `?group=${group}` : ''}`),
  useTemplate: (slug) => request('/api/hunt/templates/use',
    { method: 'POST', body: JSON.stringify({ slug }) }),

  // ── Админка (этап J): доступ только администраторам ──────────────────────
  adminMe: () => request('/api/admin/me'),
  adminSettings: () => request('/api/admin/settings'),
  adminSet: (key, value, reason) => request('/api/admin/settings',
    { method: 'POST', body: JSON.stringify({ key, value, reason }) }),
  adminRollback: (key) => request('/api/admin/settings/rollback',
    { method: 'POST', body: JSON.stringify({ key }) }),
  adminHistory: (key = '') => request(`/api/admin/history?key=${encodeURIComponent(key)}`),
  adminGrant: (user, kind, amount) => request('/api/admin/grant',
    { method: 'POST', body: JSON.stringify({ user, kind, amount }) }),
  adminPromo: () => request('/api/admin/promo'),
  adminPromoCreate: (body) => request('/api/admin/promo', { method: 'POST', body: JSON.stringify(body) }),
  adminMetrics: () => request('/api/admin/metrics'),
  adminPurchases: () => request('/api/admin/purchases'),
}

// Открывает ссылку оплаты Telegram Stars (XTR) в WebApp
export function openInvoice(url, onClose) {
  try {
    const tg = window.Telegram?.WebApp
    if (tg && typeof tg.openInvoice === 'function') {
      tg.openInvoice(url, (status) => { if (onClose) onClose(status) })
      return true
    }
  } catch {
    // ignore
  }
  return false
}
