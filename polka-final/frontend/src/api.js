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

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(options.headers || {}),
    ...options,
  })

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
    throw error
  }

  return response.json()
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

  // ── Истории продавцов ────────────────────────────────────────────────────
  getStories: () => request('/api/stories'),
  // Создание — multipart, поэтому отдельный запрос (как uploadPhotos).
  createStory: async (file, { caption = '', adId = null } = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    if (caption) formData.append('caption', caption)
    if (adId) formData.append('ad_id', String(adId))
    const headers = {}
    if (getInitData()) headers['X-Telegram-Init-Data'] = getInitData()
    const response = await fetch(`${API_BASE}/api/stories`, {
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
  viewStory: (storyId) => request(`/api/stories/${storyId}/view`, { method: 'POST' }),
  deleteStory: (storyId) => request(`/api/stories/${storyId}`, { method: 'DELETE' }),

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
  getAuctions: (sort = 'ending') => request(`/api/auctions?sort=${encodeURIComponent(sort)}`),
  getBids: (adId) => request(`/api/ads/${adId}/bids`),
  placeBid: (adId, amount) => request(`/api/ads/${adId}/bid`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }),
  buyNow: (adId) => request(`/api/ads/${adId}/buy-now`, { method: 'POST' }),
  getMyBids: () => request('/api/my-bids'),
}
