import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  HashRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { getInitData, getTelegramUser, initTelegramMiniApp } from './telegram'
import { api, resolveAssetUrl } from './api'

const AppContext = createContext(null)

const iconPaths = {
  home: [<path key="1" d="M3 10.5 12 3l9 7.5" />, <path key="2" d="M5 9.5V21h14V9.5" />, <path key="3" d="M9.5 21v-6h5v6" />],
  search: [<circle key="1" cx="10.5" cy="10.5" r="6.5" />, <path key="2" d="m21 21-5.8-5.8" />],
  plus: [<path key="1" d="M12 4v16" />, <path key="2" d="M4 12h16" />],
  bookmark: [<path key="1" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />],
  user: [<circle key="1" cx="12" cy="7.5" r="4" />, <path key="2" d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />],
  menu: [<path key="1" d="M4 6.5h16" />, <path key="2" d="M4 12h16" />, <path key="3" d="M4 17.5h16" />],
  back: [<path key="1" d="M14.5 4.5 7 12l7.5 7.5" />],
  heart: [<path key="1" d="M12 20.5S3.5 15.3 3.5 9.8A4.6 4.6 0 0 1 8.1 5.2c1.6 0 3 .8 3.9 2a4.6 4.6 0 0 1 3.9-2 4.6 4.6 0 0 1 4.6 4.6c0 5.5-8.5 10.7-8.5 10.7Z" />],
  share: [<path key="1" d="M14 4.5h5.5V10" />, <path key="2" d="m9.5 14.5 10-10" />, <path key="3" d="M19 13.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V7.5A1.5 1.5 0 0 1 6 6h5.5" />],
  filter: [<path key="1" d="M4 6.5h16" />, <path key="2" d="M7 12h10" />, <path key="3" d="M10 17.5h4" />],
  camera: [<path key="1" d="M3 8.5h3.5l1.8-2.5h7.4l1.8 2.5H21v11H3v-11Z" />, <circle key="2" cx="12" cy="13.5" r="3.8" />],
  send: [<path key="1" d="m3.5 11.5 17-7-4.5 15.5-4.8-5.7-7.7-2.8Z" />, <path key="2" d="m11.2 14.2 4.3-4.3" />],
  chat: [<path key="1" d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5Z" />],
  shield: [<path key="1" d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6l8-3.5Z" />, <path key="2" d="m8.8 11.8 2.2 2.2 4.2-4.2" />],
  crown: [<path key="1" d="m3 8 4 3.5L12 5l5 6.5L21 8l-1.5 10h-15L3 8Z" />, <path key="2" d="M5 21h14" />],
  image: [<rect key="1" x="3" y="5" width="18" height="14" rx="2.5" />, <circle key="2" cx="8.5" cy="10" r="1.8" />, <path key="3" d="m21 15.5-4.5-4.5L7 20.5" />],
  sparkles: [<path key="1" d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />, <path key="2" d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9L19 15Z" />, <path key="3" d="M5 16l.7 1.8 1.8.7-1.8.7L5 21l-.7-1.8-1.8-.7 1.8-.7L5 16Z" />],
  logout: [<path key="1" d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />, <path key="2" d="m17 8 4 4-4 4" />, <path key="3" d="M21 12H10" />],
  star: [<path key="1" d="m12 3.4 2.7 5.5 6 .87-4.35 4.24 1.03 5.99L12 17.2l-5.38 2.83 1.03-5.99L3.3 9.77l6-.87L12 3.4Z" />],
  pin: [<path key="1" d="M12 21.5s7-6 7-11.4A7 7 0 1 0 5 10.1c0 5.4 7 11.4 7 11.4Z" />, <circle key="2" cx="12" cy="10" r="2.6" />],
  truck: [<path key="1" d="M2.5 7h10.5v9.5H2.5z" />, <path key="2" d="M13 10.5h4.4l3.1 3.4v2.6H13z" />, <circle key="3" cx="6.8" cy="18.4" r="1.9" />, <circle key="4" cx="16.8" cy="18.4" r="1.9" />],
  ruler: [<path key="1" d="M3.2 15.6 15.6 3.2 20.8 8.4 8.4 20.8z" />, <path key="2" d="m7.2 11.6 2 2M10.2 8.6l2 2M13.2 5.6l2 2" />],
  clock: [<circle key="1" cx="12" cy="12" r="8.5" />, <path key="2" d="M12 7.5V12l3.2 2" />],
  check: [<path key="1" d="m4.8 12.6 4.9 4.9L19.2 6.9" />],
  mic: [<rect key="1" x="9" y="3" width="6" height="11" rx="3" />, <path key="2" d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />, <path key="3" d="M12 18v3" />],
}

const STATUS_LABELS = {
  active: 'Активные',
  moderation: 'На модерации',
  sold: 'Проданные',
  rejected: 'Отклонённые',
  inactive: 'Снятые',
}

function useApp() {
  return useContext(AppContext)
}

function Icon({ name, className = '' }) {
  return (
    <svg className={`icon-svg ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

function Logo() {
  return <img className="brand-logo" src="/polka-logo.png" alt="ПОЛКА" />
}

function Screen({ children, padded = true }) {
  return <div className={`screen ${padded ? 'padded' : ''}`}>{children}</div>
}

function TopBar({ left, center, right }) {
  return (
    <div className="topbar">
      <div className="topbar-side">{left}</div>
      <div className="topbar-center">{center}</div>
      <div className="topbar-side topbar-side--right">{right}</div>
    </div>
  )
}

function IconButton({ icon, to, active = false, onClick }) {
  const className = `icon-btn ${active ? 'is-active' : ''}`.trim()

  if (to) {
    return (
      <Link to={to} className={className}>
        <Icon name={icon} />
      </Link>
    )
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

function MediaPlaceholder({ label = 'фото', tall = false, imageUrl = '' }) {
  if (imageUrl) {
    return <img className={`media-image ${tall ? 'is-tall' : ''}`.trim()} src={resolveAssetUrl(imageUrl)} alt={label} />
  }

  return (
    <div className={`media-placeholder ${tall ? 'is-tall' : ''}`}>
      <Icon name="image" />
      <span>{label}</span>
    </div>
  )
}

function Banner({ eyebrow, title, text, action, icon = 'sparkles' }) {
  return (
    <div className="banner-card glass-card">
      <div className="banner-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <p>{text}</p>
        {action ? <button className="mini-cta">{action}</button> : null}
      </div>
      <div className="banner-art">
        <div className="banner-art__orb" />
        <div className="banner-art__card">
          <Icon name={icon} />
        </div>
        <div className="banner-art__ring" />
      </div>
    </div>
  )
}

function firstPhoto(item) {
  if (item?.photo_urls?.length) return item.photo_urls[0]
  // Страховка: если бэкенд ещё не отдаёт photo_urls, берём сырое значение.
  // Пути /api/ads/photos/... можно использовать напрямую, file_id — нет.
  const raw = item?.photos?.[0]
  if (typeof raw === 'string' && raw && !raw.startsWith('{')) return raw
  return ''
}

function priceText(item) {
  return item?.price_display || (item?.price != null ? `${item.price} ₽` : '')
}

/* Компактное время: «14:20» для сегодня, иначе «2 окт». Бэкенд отдаёт ISO
 * («2026-10-02T11:20»), и без форматирования в списке чатов была сырая строка. */
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
function shortTime(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16).replace('T', ' ')
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  }
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/* Ссылка на вложение в сообщении. Бэкенд отдаёт file_id + msg_type,
 * а не media_url/media_type — из-за этого фото в чате не показывались.
 * Путь /api/ads/photos/... отдаём как есть, Telegram file_id — через прокси. */
function chatMediaUrl(message) {
  const kind = message?.media_type || message?.msg_type || ''
  if (!kind || kind === 'text') return ''
  const ref = message?.media_url || message?.file_id || ''
  if (!ref) return ''
  const s = String(ref)
  if (s.startsWith('{')) return ''
  if (s.startsWith('/') || s.startsWith('http')) return s
  return `/api/photo/${s}`
}

/* Ссылка для показа фото в форме. В form.photos лежат СЫРЫЕ значения,
 * которые уйдут на бэкенд (Telegram file_id или путь /api/ads/photos/…).
 * file_id нельзя подставить в <img> напрямую — проксируем через /api/photo/.
 * Менять сами значения нельзя: бот воспринимает строку-путь как file_id
 * и не сможет опубликовать объявление в канал. */
function photoDisplayUrl(ref) {
  if (!ref) return ''
  const s = String(ref)
  if (s.startsWith('{')) return ''
  if (s.startsWith('/') || s.startsWith('http')) return s
  return `/api/photo/${s}`
}

/* Сжимаем фото до отправки: снимок с телефона весит 3–10 МБ, а после
 * перекодирования через canvas остаётся 200–400 КБ. Это и быстрее на
 * мобильной сети, и сильно снижает шанс упереться в лимит размера.
 * Если браузер не смог (например, HEIC в Chrome) — отдаём исходный файл:
 * сервер принимает и его, просто сохраняет как есть. */
async function compressImage(file, maxSide = 1600, quality = 0.85) {
  if (!file || !String(file.type || '').startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    if (bitmap.close) bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function isMediaMessage(message) {
  const kind = message?.media_type || message?.msg_type || ''
  return Boolean(kind) && kind !== 'text'
}

/* Тип вложения для отрисовки: photo | video | voice.
 * Бот пишет msg_type, старые сообщения могли иметь media_type. */
function mediaKind(message) {
  return message?.media_type || message?.msg_type || 'photo'
}

function ProductCard({ item, favorite = false, onToggleFavorite }) {
  const handleFavorite = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggleFavorite?.(item.id)
  }

  return (
    <Link to={`/listing/${item.id}`} className="product-card">
      <div className="product-media">
        <MediaPlaceholder imageUrl={firstPhoto(item)} />
        <button className={`save-btn ${favorite ? 'is-on' : ''}`} type="button" onClick={handleFavorite}>
          <Icon name="heart" />
        </button>
      </div>
      <div className="product-info">
        <div className="product-title">{item.title}</div>
        <div className="product-city">{item.city}</div>
        <div className="product-bottom">
          <div className="product-price">{priceText(item)}</div>
          <button className="product-action" type="button" onClick={handleFavorite}>
            <Icon name="chat" />
          </button>
        </div>
      </div>
    </Link>
  )
}

function LoadingBlock({ text = 'Загрузка…' }) {
  return <div className="checkout-box glass-card mt-14"><strong>{text}</strong></div>
}

function ErrorBlock({ text = 'Не удалось загрузить данные.', onRetry }) {
  return (
    <div className="checkout-box glass-card mt-14">
      <strong>{text}</strong>
      {onRetry ? <div className="mt-12"><button className="ghost-btn wide" onClick={onRetry}>Повторить</button></div> : null}
    </div>
  )
}

function EmptyBlock({ text = 'Пока пусто.' }) {
  return <div className="checkout-box glass-card mt-14"><p>{text}</p></div>
}

function AppProvider({ children }) {
  const [tgUser, setTgUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [favoriteIds, setFavoriteIds] = useState([])
  const [backendMode, setBackendMode] = useState('loading')

  const refreshProfile = async () => {
    try {
      const data = await api.getProfile()
      setProfile(data.user)
      return data.user
    } catch {
      return null
    }
  }

  useEffect(() => {
    initTelegramMiniApp()
    setTgUser(getTelegramUser())

    let cancelled = false
    const init = async () => {
      try {
        const [profileData, favoritesData] = await Promise.all([api.getProfile(), api.getFavorites()])
        if (cancelled) return
        setProfile(profileData.user)
        setFavoriteIds((favoritesData.items || []).map((item) => item.id))
        setBackendMode('online')
      } catch {
        if (cancelled) return
        setProfile(null)
        setFavoriteIds([])
        setBackendMode('offline')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleFavorite = async (listingId) => {
    const alreadyFavorite = favoriteIds.includes(listingId)
    setFavoriteIds((prev) => (alreadyFavorite ? prev.filter((id) => id !== listingId) : [...prev, listingId]))
    try {
      if (alreadyFavorite) {
        await api.removeFavorite(listingId)
      } else {
        await api.addFavorite(listingId)
      }
    } catch {
      setFavoriteIds((prev) => (alreadyFavorite ? [...prev, listingId] : prev.filter((id) => id !== listingId)))
    }
  }

  const value = useMemo(
    () => ({ tgUser, profile, favoriteIds, toggleFavorite, backendMode, refreshProfile }),
    [tgUser, profile, favoriteIds, backendMode]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/* ── Единый справочник категорий ───────────────────────────────────────
 * Один список на всё приложение: плашки ленты, чипы поиска и форма
 * создания объявления. Раньше их было три разных (лента брала категории
 * из БД, форма — свой список), и они не совпадали.
 *
 * aliases — устаревшие значения, которые уже лежат в базе у объявлений,
 * созданных до смены справочника (в основном ботом). По ним тоже ищем,
 * чтобы старые объявления не пропадали из фильтра.
 *
 * image — PNG-иллюстрация из public/categories/ (см. README там же);
 * если файла нет, показывается встроенная SVG из CATEGORY_ART.
 */
const CATEGORIES = [
  { label: 'Другое', image: 'other.png', art: 'other', aliases: ['Прочие вещи'] },
  { label: 'Авто', image: 'auto.png', art: 'car', aliases: [] },
  { label: 'Недвижимость', image: 'realty.png', art: 'home', aliases: ['Продажа жилья'] },
  { label: 'Аренда', image: 'rent.png', art: 'rent', aliases: ['Аренда жилья'] },
  { label: 'Для дома и дачи', image: 'home.png', art: 'home', aliases: [] },
  { label: 'Запчасти', image: 'parts.png', art: 'parts', aliases: [] },
  { label: 'Услуги', image: 'services.png', art: 'jobs', aliases: [] },
  { label: 'Электроника', image: 'electronics.png', art: 'tech', aliases: ['Техника'] },
  { label: 'Работа и подработка', image: 'jobs.png', art: 'parttime', aliases: ['Вакансии', 'Подработки'] },
  { label: 'Одежда, обувь, аксессуары', image: 'fashion.png', art: 'clothes', aliases: ['Одежда', 'Обувь'] },
]

const CATEGORY_LABELS = CATEGORIES.map((c) => c.label)
const CATEGORY_BY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.label, c]))
const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.label, c]))
const CATEGORY_IMAGES = Object.fromEntries(
  CATEGORIES.map((c) => [c.label, `categories/${c.image}`])
)

/* Значение для параметра category в API: новое название + устаревшие,
 * чтобы фильтр нашёл и старые объявления (бэкенд понимает список через
 * запятую и строит из него OR по LIKE). */
function categoryQuery(label) {
  const c = CATEGORY_BY_LABEL[label]
  return c ? [c.label, ...c.aliases].join(',') : label
}

/* Счётчик категории для чипов поиска: суммируем все значения в базе,
 * которые к ней относятся — и новое название, и устаревшие алиасы.
 * Бэкенд отдаёт счётчики по «сырым» значениям, поэтому без агрегации
 * одна категория распадалась бы на несколько чисел. */
function categoryCount(label, rawCategories) {
  const c = CATEGORY_BY_LABEL[label]
  if (!c || !rawCategories?.length) return 0
  const needles = [c.label, ...c.aliases]
  return rawCategories.reduce((sum, rc) => {
    const hay = `${rc.label || ''} ${rc.value || ''}`
    return needles.some((n) => hay.includes(n)) ? sum + (rc.count || 0) : sum
  }, 0)
}

const CATEGORY_ART = {
  all: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="4" fill="#2F6BFF" />
      <rect x="26" y="9" width="13" height="13" rx="4" fill="#9CBAFF" />
      <rect x="9" y="26" width="13" height="13" rx="4" fill="#9CBAFF" />
      <rect x="26" y="26" width="13" height="13" rx="4" fill="#2F6BFF" />
    </>
  ),
  rent: (
    <>
      <path d="M9 14a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v25H9V14Z" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" />
      <rect x="13" y="17" width="4.6" height="4.6" rx="1.2" fill="#2F6BFF" />
      <rect x="20.4" y="17" width="4.6" height="4.6" rx="1.2" fill="#9CBAFF" />
      <rect x="13" y="24.6" width="4.6" height="4.6" rx="1.2" fill="#9CBAFF" />
      <rect x="20.4" y="24.6" width="4.6" height="4.6" rx="1.2" fill="#2F6BFF" />
      <rect x="16" y="32.5" width="5.6" height="6.5" rx="1.2" fill="#1B3A6B" />
      <circle cx="35" cy="19.5" r="5.5" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" />
      <path d="M35 25v11M35 31.5h3.6M35 34.6h2.6" stroke="#1B3A6B" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  sale: (
    <>
      <path d="M9 22.6 24 10.5l15 12.1" stroke="#1B3A6B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12.6 21.4v15.3a2 2 0 0 0 2 2h18.8a2 2 0 0 0 2-2V21.4" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" />
      <path d="M20 38.7v-8.6h8v8.6" fill="#2F6BFF" fillOpacity=".8" />
      <circle cx="35.5" cy="13.5" r="6" fill="#2F6BFF" />
      <path d="M32.8 13.5h5.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  jobs: (
    <>
      <rect x="8" y="16" width="32" height="22" rx="5" fill="#fff" stroke="#8A5A12" strokeWidth="1.7" />
      <path d="M18.5 16v-2.8a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3V16" stroke="#8A5A12" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <rect x="8" y="24" width="32" height="3.6" fill="#F59E0B" fillOpacity=".3" />
      <rect x="21" y="22.8" width="6" height="6" rx="1.6" fill="#F59E0B" />
    </>
  ),
  parttime: (
    <>
      <circle cx="21" cy="24" r="13" fill="#fff" stroke="#5B3FA8" strokeWidth="1.7" />
      <path d="M21 16.6V24l5.4 3.4" stroke="#8B5CF6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="36" cy="34" r="7" fill="#8B5CF6" />
      <path d="M36 30.6V34l2.4 1.7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  tech: (
    <>
      <rect x="13" y="8" width="17" height="26" rx="4" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" />
      <rect x="16.6" y="12" width="9.8" height="17" rx="2" fill="#2F6BFF" fillOpacity=".26" />
      <path d="M20 30.4h3" stroke="#1B3A6B" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M11 38.6V33h26v5.6" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7.5 38.6h33" stroke="#1B3A6B" strokeWidth="1.9" strokeLinecap="round" />
    </>
  ),
  clothes: (
    <>
      <path d="M24 9.2a3.1 3.1 0 0 1 1.6 5.8" stroke="#8A3A12" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M24 14.8 10.2 22.7l3.5 6.4 2.9-1.7V39a1.6 1.6 0 0 0 1.6 1.6h11.6A1.6 1.6 0 0 0 31.4 39V27.4l2.9 1.7 3.5-6.4L24 14.8Z" fill="#fff" stroke="#8A3A12" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M20.6 17.8 24 21.2l3.4-3.4" stroke="#F97316" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <path d="M24 14.8V39" stroke="#8A3A12" strokeWidth="1.3" />
    </>
  ),
  shoes: (
    <>
      <path d="M9 32.4V18.6c0-1.9 1.5-3.4 3.4-3.4h4c1.3 0 2.4.7 3 1.8l1.8 3.2 9.9 4.5c3.6 1.6 6.1 3.5 6.1 7H11a2 2 0 0 1-2-2Z" fill="#fff" stroke="#2A2F3A" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 32.4h30" stroke="#2A2F3A" strokeWidth="1.7" />
      <path d="M17 21.4 24 25.8M21 25.2l6.6 4.4" stroke="#2F6BFF" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="15" cy="29.2" r="1.4" fill="#2A2F3A" />
    </>
  ),
  other: (
    <>
      <path d="M24 9 40 16.2v15.6L24 39 8 31.8V16.2L24 9Z" fill="#fff" stroke="#3A4453" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 16.2l16 7.2 16-7.2M24 23.4V39" stroke="#3A4453" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 12.6 32 19.8" stroke="#94A3B8" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  car: (
    <>
      <path d="M13 18.6 16.4 12h15.2l3.4 6.6" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" strokeLinejoin="round" />
      <rect x="6.6" y="26.6" width="34.8" height="9.6" rx="3.6" fill="#2F6BFF" fillOpacity=".2" stroke="#1B3A6B" strokeWidth="1.7" />
      <path d="M13 18.6h22l2.4 8H10.6l2.4-8Z" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="14.6" cy="38.4" r="3.2" fill="#1B3A6B" />
      <circle cx="33.4" cy="38.4" r="3.2" fill="#1B3A6B" />
    </>
  ),
  home: (
    <>
      <path d="M9 22.6 24 10.5l15 12.1" stroke="#1B3A6B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M12.6 21.4v15.3a2 2 0 0 0 2 2h18.8a2 2 0 0 0 2-2V21.4" fill="#fff" stroke="#1B3A6B" strokeWidth="1.7" />
      <rect x="20" y="28" width="8" height="10.7" rx="1.4" fill="#2F6BFF" fillOpacity=".8" />
    </>
  ),
  parts: (
    <>
      <circle cx="24" cy="24" r="7.4" fill="#fff" stroke="#3A4453" strokeWidth="1.7" />
      <circle cx="24" cy="24" r="2.7" fill="#3A4453" />
      <path d="M24 7.6v4.4M24 36v4.4M7.6 24H12M36 24h4.4M12.4 12.4l3.1 3.1M32.5 32.5l3.1 3.1M35.6 12.4l-3.1 3.1M15.5 32.5l-3.1 3.1"
        stroke="#94A3B8" strokeWidth="2.1" strokeLinecap="round" />
    </>
  ),
}

function CategoryArt({ label }) {
  const art = CATEGORY_ART[CATEGORY_META[label]?.art] || CATEGORY_ART.other
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {art}
    </svg>
  )
}

function StoriesRow({ items = [] }) {
  const seen = new Set()
  const people = []
  for (const it of items) {
    const name = it?.seller?.name
    if (!name || seen.has(name)) continue
    seen.add(name)
    people.push({ name, photo: it?.photo_urls?.[0] || '' })
    if (people.length >= 8) break
  }

  return (
    <div className="stories-block">
      <div className="stories-head">
        <Icon name="sparkles" />
        <span>Истории продавцов</span>
      </div>
      <div className="stories-row">
        <button type="button" className="story-item">
          <div className="story-ring is-own">
            <div className="story-avatar"><Icon name="plus" /></div>
          </div>
          <span className="story-name">Вы</span>
        </button>
        {people.map((p) => (
          <button type="button" key={p.name} className="story-item">
            <div className="story-ring">
              <div className="story-avatar">
                {p.photo
                  ? <img src={resolveAssetUrl(p.photo)} alt="" loading="lazy" />
                  : (p.name || '?')[0]?.toUpperCase()}
              </div>
            </div>
            <span className="story-name">@{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* Рельс категорий в ленте — те же плашки, что и в форме, только
 * в горизонтальной прокрутке (в форме они в сетке 2 в ряд). */
function CategoryCards({ categories, activeCategory, onSelect }) {
  return (
    <div className="category-cards">
      {categories.map((cat) => (
        <CategoryTile
          key={cat}
          value={cat}
          label={cat}
          selected={activeCategory === cat}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

/* Баннер ленты — просто картинка, которую загрузил админ.
 * Никакого текста и кнопок поверх: раньше мы рисовали свой оверлей
 * («Разместить»), и он конфликтовал с графикой баннера. Если баннеров нет
 * или картинка не загрузилась — блок не показываем совсем, чтобы вместо
 * него не висел значок битой картинки. */
function FeedBanner() {
  const [banners, setBanners] = useState([])
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState([])

  useEffect(() => {
    let cancelled = false
    api.getFeedBanners()
      .then((data) => {
        if (!cancelled) setBanners((data.items || []).filter((b) => b.image))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const slides = banners.filter((b) => b.image && !broken.includes(b.image))

  useEffect(() => {
    if (slides.length < 2) return undefined
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000)
    return () => clearInterval(timer)
  }, [slides.length])

  if (!slides.length) return null

  const active = index % slides.length

  return (
    <div className="feed-banner">
      <div className="feed-banner-track" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((b) => (
          <div
            className="feed-banner-slide"
            key={b.image}
            onClick={() => b.action && window.open(b.action, '_blank')}
          >
            <img
              src={resolveAssetUrl(b.image)}
              alt=""
              loading="lazy"
              onError={() => setBroken((prev) => [...prev, b.image])}
            />
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="feed-banner-dots">
          {slides.map((b, i) => (
            <span key={b.image} className={`feed-banner-dot ${i === active ? 'is-active' : ''}`} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* «Your stats» из референса → статистика продавца из /api/me.
 * Показываем только авторизованному: без профиля цифры бессмысленны.
 * Живёт в профиле; caption нужен, только если рядом нет имени пользователя. */
function SellerStats({ profile, caption = '' }) {
  if (!profile) return null
  const cards = [
    { key: 'ads', label: 'Объявления', value: profile.active_ads || 0, icon: 'bookmark', tone: 'is-accent', to: '/my' },
    { key: 'mod', label: 'На модерации', value: profile.moderation_ads || 0, icon: 'clock', tone: 'is-dark', to: '/my' },
    { key: 'fav', label: 'В избранном', value: profile.favorites || 0, icon: 'heart', tone: '', to: '/favorites' },
  ]
  return (
    <>
      <div className="stats-head">
        <strong>Моя статистика</strong>
        {caption ? <span>{caption}</span> : null}
      </div>
      <div className="stats-row">
        {cards.map((c) => (
          <Link key={c.key} to={c.to} className={`stat-card ${c.tone}`.trim()}>
            <span className="stat-card-label">{c.label}</span>
            <span className="stat-card-bottom">
              <span className="stat-card-value">{c.value}</span>
              <span className="stat-card-icon"><Icon name={c.icon} /></span>
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}

/* «Personalized daily outfit» → «Рекомендуем сегодня».
 * Берём самое просматриваемое из уже загруженной ленты — без лишнего запроса. */
function RecommendCard({ items = [] }) {
  const pick = useMemo(() => {
    if (!items.length) return null
    let best = items[0]
    for (const it of items) {
      if ((it.views || 0) > (best.views || 0)) best = it
    }
    return best
  }, [items])

  if (!pick) return null

  return (
    <Link to={`/listing/${pick.id}`} className="recommend-card">
      <MediaPlaceholder label="" imageUrl={firstPhoto(pick)} />
      <div className="recommend-shade" aria-hidden="true" />
      <span className="recommend-chip">
        <Icon name="sparkles" />
        Рекомендуем сегодня
      </span>
      <div className="recommend-copy">
        <div className="recommend-eyebrow">{pick.city || pick.category || 'Объявление'}</div>
        <div className="recommend-title">{pick.title}</div>
        <div className="recommend-price">{priceText(pick)}</div>
      </div>
      <span className="recommend-go" aria-hidden="true"><Icon name="chat" /></span>
    </Link>
  )
}

/* «Last news» из референса → свежие объявления компактной строкой */
function LastNews({ items = [] }) {
  if (!items.length) return null
  const recent = items.slice(0, 4)
  const names = recent.map((i) => i.seller?.name).filter(Boolean).slice(0, 2)
  return (
    <Link to="/search" className="lastnews">
      <div className="lastnews-avatars">
        {recent.map((it) => (
          <span className="lastnews-thumb" key={it.id}>
            {firstPhoto(it)
              ? <img src={resolveAssetUrl(firstPhoto(it))} alt="" loading="lazy" />
              : <Icon name="image" />}
          </span>
        ))}
      </div>
      <div className="lastnews-copy">
        <strong>Последние объявления</strong>
        <span>{names.length ? `${names.join(' и ')} только что добавили` : `${recent.length} новых объявлений`}</span>
      </div>
      <span className="lastnews-arrow" aria-hidden="true"><Icon name="back" /></span>
    </Link>
  )
}

function FeedPage() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [activeCategory, setActiveCategory] = useState('Все')
  const [items, setItems] = useState([])
  const [showDock, setShowDock] = useState(true)
  const [showTop, setShowTop] = useState(false)
  const lastScrollY = useRef(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const loadMoreRef = useRef(null)
  const PAGE = 20
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const diff = y - lastScrollY.current
      lastScrollY.current = y
      setShowTop(y > 400)
      if (diff > 8) setShowDock(false)
      else if (diff < -8) setShowDock(true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const load = async (category, offset, append) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError('')
    }
    try {
      const data = await Promise.race([
        api.getFeed({ category: categoryQuery(category), limit: PAGE, offset }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ])
      setItems((prev) => (append ? [...prev, ...(data.items || [])] : (data.items || [])))
      setHasMore(Boolean(data.has_more))
    } catch {
      if (!append) {
        setError('Не удалось загрузить ленту. Проверь подключение к интернету.')
        setItems([])
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    load(activeCategory, 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory])

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          load(activeCategory, items.length, true)
        }
      },
      { rootMargin: '320px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loading, items.length, activeCategory])

  // Плашки «Все» больше нет: повторное нажатие на активную категорию
  // сбрасывает фильтр — так список категорий короче и нет лишней плашки.
  const changeCategory = (category) => {
    setActiveCategory((prev) => (prev === category ? 'Все' : category))
  }

  if (!mounted) {
    return (
      <Screen>
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <div className="feed-skeleton">
          <div className="skeleton-banner" />
          <div className="skeleton-row">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      </Screen>
    )
  }

  if (loading && items.length === 0) {
    return (
      <Screen>
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <div className="feed-skeleton">
          <div className="skeleton-banner" />
          <div className="skeleton-row">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
          <div className="skeleton-row">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      </Screen>
    )
  }

  if (error && items.length === 0) {
    return (
      <Screen>
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <ErrorBlock text="Не удалось загрузить ленту. Проверь подключение к интернету." onRetry={() => load(activeCategory, 0, false)} />
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
      <StoriesRow items={items} />
      <FeedBanner />
      <CategoryCards categories={CATEGORY_LABELS} activeCategory={activeCategory} onSelect={changeCategory} />
      <Link to="/search" className="search-input glass-card compact"><Icon name="search" />Поиск вещей</Link>
      <RecommendCard items={items} />
      <div className="section-head"><strong>{loading ? 'Загрузка…' : 'Свежее'}</strong><span>{activeCategory}</span></div>
      {error ? <ErrorBlock text={error} onRetry={() => load(activeCategory, 0, false)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Объявлений пока нет." /> : null}
      <div className="grid-two">
        {items.slice(0, 2).map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
        ))}
      </div>
      <LastNews items={items} />
      <div className="grid-two mt-12">
        {items.slice(2).map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
        ))}
      </div>
      <div ref={loadMoreRef} />
      {loadingMore ? <div className="section-head"><strong>Загружаем ещё…</strong></div> : null}
      {hasMore && !loadingMore ? <div className="mt-12"><button className="ghost-btn wide" onClick={() => load(activeCategory, items.length, true)}>Показать ещё</button></div> : null}
      {showTop && !showDock ? (
        <button className="back-to-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Наверх">
          <Icon name="back" />
        </button>
      ) : null}
    </Screen>
  )
}

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Сначала новые' },
  { value: 'price_asc', label: 'Дешевле' },
  { value: 'price_desc', label: 'Дороже' },
]

function SearchPage() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [city, setCity] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [condition, setCondition] = useState('')
  const [delivery, setDelivery] = useState('')
  const [sort, setSort] = useState('date_desc')
  // «Сырые» категории из базы — нужны только для счётчиков на чипах
  const [rawCategories, setRawCategories] = useState([])
  const [cities, setCities] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (cancelled) return
      setRawCategories(data.categories || [])
      setCities(data.cities || [])
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.search({ q: query, category: categoryQuery(category), city, priceMin, priceMax, condition, delivery, sort, limit: 30 })
        if (!cancelled) {
          setResults(data.items || [])
          setError('')
        }
      } catch {
        if (!cancelled) {
          setResults([])
          setError('Не удалось выполнить поиск.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, category, city, priceMin, priceMax, condition, delivery, sort])

  const handlePhotoSearch = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const data = await api.photoSearch(file)
      setResults(data.items || [])
      setError('')
    } catch {
      setError('Не удалось выполнить поиск по фото.')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  const resetFilters = () => {
    setCategory('Все')
    setCity('')
    setPriceMin('')
    setPriceMax('')
    setCondition('')
    setDelivery('')
    setSort('date_desc')
    setQuery('')
  }

  const activeFilterCount = [category !== 'Все', city, priceMin, priceMax, condition, delivery]
    .filter(Boolean).length

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} center={<Logo />} right={<IconButton icon="filter" active={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} />} />
      <div className="page-title">Поиск</div>
      <div className="search-row">
        <input className="text-input glass-card" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Что ищем?" />
        <label className="photo-search-btn">
          <Icon name="camera" />
          <input type="file" accept="image/*" onChange={handlePhotoSearch} hidden />
        </label>
      </div>
      {/* Чипы-счётчики категорий — как «Outfits 10 / Lookbook 12» в референсе */}
      <div className="chip-rail-label">Категории</div>
      <div className="chip-rail">
        <button
          type="button"
          className={`count-chip ${category === 'Все' ? 'is-active' : ''}`}
          onClick={() => setCategory('Все')}
        >
          Все
        </button>
        {CATEGORIES.map((c) => {
          const n = categoryCount(c.label, rawCategories)
          return (
            <button
              key={c.label}
              type="button"
              className={`count-chip ${category === c.label ? 'is-active' : ''}`}
              onClick={() => setCategory(category === c.label ? 'Все' : c.label)}
            >
              {c.label}
              {n ? <span className="count-chip-n">{n}</span> : null}
            </button>
          )
        })}
      </div>

      {cities.length ? (
        <>
          <div className="chip-rail-label">Города</div>
          <div className="chip-rail">
            <button
              type="button"
              className={`count-chip ${city === '' ? 'is-active' : ''}`}
              onClick={() => setCity('')}
            >
              Любой
            </button>
            {cities.slice(0, 14).map((c) => (
              <button
                key={c.value}
                type="button"
                className={`count-chip ${city === c.value ? 'is-active' : ''}`}
                onClick={() => setCity(city === c.value ? '' : c.value)}
              >
                {c.label}
                {c.count ? <span className="count-chip-n">{c.count}</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Активные фильтры — как чипы Weather / Temp / Event в референсе */}
      {activeFilterCount > 0 ? (
        <div className="active-filters">
          {priceMin || priceMax ? (
            <span className="filter-chip">
              <span className="filter-chip-label">Цена</span>
              {priceMin || '0'}–{priceMax || '∞'} ₽
            </span>
          ) : null}
          {condition ? (
            <span className="filter-chip">
              <span className="filter-chip-label">Состояние</span>
              {condition === 'new' ? 'Новое' : 'Б/у'}
            </span>
          ) : null}
          {delivery ? (
            <span className="filter-chip">
              <span className="filter-chip-label">Доставка</span>есть
            </span>
          ) : null}
          <button className="filter-chip" type="button" onClick={resetFilters}>Сбросить всё</button>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="filters-panel">
          <div className="form-stack">
            <div className="grid-two">
              <input className="text-input glass-card" value={priceMin} inputMode="numeric" onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Цена от" />
              <input className="text-input glass-card" value={priceMax} inputMode="numeric" onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Цена до" />
            </div>
            <div className="grid-two">
              <select className="text-input glass-card" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="">Любое состояние</option>
                <option value="new">Новое</option>
                <option value="used">Б/у</option>
              </select>
              <select className="text-input glass-card" value={delivery} onChange={(e) => setDelivery(e.target.value)}>
                <option value="">Доставка: любая</option>
                <option value="yes">С доставкой</option>
              </select>
            </div>
            <select className="text-input glass-card" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      ) : null}
      <div className="section-head"><strong>{loading ? 'Ищем…' : 'Результаты'}</strong><span>{results.length}</span></div>
      {error ? <ErrorBlock text={error} /> : null}
      {!loading && !error && results.length === 0 ? <EmptyBlock text="Ничего не найдено. Попробуйте изменить запрос." /> : null}
      <div className="list-stack">
        {results.map((item) => (
          <Link to={`/listing/${item.id}`} key={item.id} className="result-row glass-card">
            <div className="result-thumb"><MediaPlaceholder imageUrl={firstPhoto(item)} /></div>
            <div>
              <div className="product-price result-price">{priceText(item)}</div>
              <div className="row-title">{item.title}</div>
              <div className="product-city">{item.city}</div>
            </div>
            <button className={`save-btn inline ${favoriteIds.includes(item.id) ? 'is-on' : ''}`} type="button" onClick={(e) => { e.preventDefault(); toggleFavorite(item.id) }}>
              <Icon name="heart" />
            </button>
          </Link>
        ))}
      </div>
    </Screen>
  )
}

function ListingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const listingId = Number(id)
  const { favoriteIds, toggleFavorite, profile } = useApp()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [photoIndex, setPhotoIndex] = useState(0)
  const galleryRef = useRef(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getListing(listingId)
      setItem(data.ad)
      setPhotoIndex(0) // иначе при переходе на другое объявление оставался старый кадр
    } catch (err) {
      setError(err.status === 404 ? 'Объявление не найдено.' : 'Не удалось загрузить объявление.')
      setItem(null)
    } finally {
      setLoading(false)
    }
  }

  /* Галерея — горизонтальная лента со scroll-snap: свайп работает штатно,
   * точки лишь отражают текущий кадр и умеют прокрутить к нужному. */
  const goToPhoto = (idx) => {
    const el = galleryRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }

  const handleGalleryScroll = (event) => {
    const el = event.currentTarget
    if (!el.clientWidth) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    if (idx !== photoIndex) setPhotoIndex(Math.max(0, idx))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  const isOwner = Boolean(item?.is_owner)

  /* Фото для галереи. Основной источник — photo_urls, но если бэкенд его не
   * заполнил, берём сырые photos и приводим к URL через photoDisplayUrl
   * (file_id → /api/photo/…). Раньше брался только photo_urls, и при пустом
   * поле на странице товара не было ни одной картинки. */
  const photos = useMemo(() => {
    if (!item) return []
    const raw = item.photo_urls?.length ? item.photo_urls : (item.photos || [])
    return raw.map(photoDisplayUrl).filter(Boolean)
  }, [item])

  const handleStartChat = async () => {
    setChatLoading(true)
    try {
      const response = await api.startChat(listingId)
      navigate(`/chat/${response.chat.id}`)
    } catch {
      navigate('/chats')
    } finally {
      setChatLoading(false)
    }
  }

  const handleSold = async () => {
    setActionLoading('sold')
    try {
      const response = await api.markSold(listingId)
      setItem(response.ad)
    } finally {
      setActionLoading('')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Удалить объявление?')) return
    setActionLoading('delete')
    try {
      await api.deleteListing(listingId)
      navigate('/my')
    } finally {
      setActionLoading('')
    }
  }

  // Кнопка «Поделиться» раньше не имела обработчика вообще. В Telegram
  // открываем нативный шер, в браузере — navigator.share или t.me.
  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/listing/${listingId}`
    const text = item?.title || 'Объявление на Полке'
    try {
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
        )
        return
      }
      if (navigator.share) {
        await navigator.share({ title: text, url })
        return
      }
      await navigator.clipboard?.writeText(url)
    } catch {
      // пользователь отменил шер — ничего не делаем
    }
  }

  if (loading) {
    return (
      <Screen>
        <TopBar left={<IconButton icon="back" to="/" />} />
        <LoadingBlock text="Загрузка объявления…" />
      </Screen>
    )
  }

  if (error || !item) {
    return (
      <Screen>
        <TopBar left={<IconButton icon="back" to="/" />} />
        <ErrorBlock text={error || 'Объявление не найдено.'} onRetry={load} />
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} right={<div className="top-actions"><IconButton icon="heart" active={favoriteIds.includes(listingId)} onClick={() => toggleFavorite(listingId)} /><IconButton icon="share" onClick={handleShare} /></div>} />
      <div className="detail-hero">
        {/* Свайпаемая лента фото: нативный горизонтальный скролл + scroll-snap */}
        <div className="detail-gallery" ref={galleryRef} onScroll={handleGalleryScroll}>
          {photos.length ? (
            photos.map((url, idx) => (
              <div className="detail-slide" key={`${url}-${idx}`}>
                <MediaPlaceholder label="фотографии товара" tall imageUrl={url} />
              </div>
            ))
          ) : (
            <div className="detail-slide">
              <MediaPlaceholder label="фотографии товара" tall />
            </div>
          )}
        </div>

        {/* Плавающие плашки-«якоря» поверх фото — ключевая деталь референса.
            Они информационные, кликов не подразумевают, поэтому не <button>. */}
        <div className="hero-pins" aria-hidden="true">
          <div className="hero-pin" style={{ top: '11%' }}>
            <span className="hero-pin-anchor" />
            <span className="hero-pin-pill">
              <span className="hero-pin-label">Цена</span>
              <span className="hero-pin-value">{priceText(item)}</span>
            </span>
            <span className="hero-pin-arrow"><Icon name="back" /></span>
          </div>
          {item.city ? (
            <div className="hero-pin" style={{ top: '42%' }}>
              <span className="hero-pin-anchor" />
              <span className="hero-pin-pill">
                <span className="hero-pin-label">Город</span>
                <span className="hero-pin-value">{item.city}</span>
              </span>
              <span className="hero-pin-arrow"><Icon name="back" /></span>
            </div>
          ) : null}
          {item.condition ? (
            <div className="hero-pin" style={{ top: '73%' }}>
              <span className="hero-pin-anchor" />
              <span className="hero-pin-pill">
                <span className="hero-pin-label">Состояние</span>
                <span className="hero-pin-value">{item.condition}</span>
              </span>
              <span className="hero-pin-arrow"><Icon name="back" /></span>
            </div>
          ) : null}
        </div>

        {photos.length > 1 ? (
          <>
            <div className="detail-dots">
              {photos.map((url, idx) => (
                <button key={idx} type="button" aria-label={`Фото ${idx + 1}`}
                  className={`detail-dot ${photoIndex === idx ? 'is-active' : ''}`}
                  onClick={() => goToPhoto(idx)} />
              ))}
            </div>
            <div className="detail-counter">{photoIndex + 1} / {photos.length}</div>
          </>
        ) : null}
      </div>

      <div className="detail-head">
        <div className="eyebrow">{item.category || 'Объявление'}</div>
        <div className="listing-title">{item.title}</div>
        {item.seller?.rating ? (
          <div className="rating-row">
            <Icon name="star" />
            {Number(item.seller.rating).toFixed(1)}
            <span>· {item.seller.reviews_count} отзывов</span>
          </div>
        ) : null}
      </div>

      {/* Чипы-характеристики — как Weather / Temp / Event в референсе */}
      <div className="spec-chips">
        {item.condition ? (
          <span className="spec-chip">
            <Icon name="shield" /><span className="spec-chip-label">Состояние</span><span className="spec-chip-value">{item.condition}</span>
          </span>
        ) : null}
        {item.city ? (
          <span className="spec-chip">
            <Icon name="pin" /><span className="spec-chip-label">Город</span><span className="spec-chip-value">{item.city}</span>
          </span>
        ) : null}
        {item.delivery ? (
          <span className="spec-chip">
            <Icon name="truck" /><span className="spec-chip-label">Доставка</span><span className="spec-chip-value">{item.delivery}</span>
          </span>
        ) : null}
        {item.size ? (
          <span className="spec-chip">
            <Icon name="ruler" /><span className="spec-chip-label">Размер</span><span className="spec-chip-value">{item.size}</span>
          </span>
        ) : null}
        <span className="spec-chip">
          <Icon name="clock" /><span className="spec-chip-label">Просмотры</span><span className="spec-chip-value">{item.views || 0}</span>
        </span>
      </div>

      <div className="copy-block glass-card mt-12">
        <strong>Описание</strong>
        <p>{item.description || 'Без описания.'}</p>
      </div>

      {/* Нижний ряд — как «AR View» + «Schedule for Event» в референсе */}
      <div className="detail-actions">
        {isOwner ? (
          <>
            <Link to={`/edit/${item.id}`} className="cta-primary">
              <Icon name="menu" />
              Редактировать
            </Link>
            <button className="cta-dark" type="button" onClick={handleDelete}>
              {actionLoading === 'delete' ? '…' : 'Удалить'}
            </button>
            {item.status === 'active' ? (
              <button className="cta-round" type="button" onClick={handleSold} aria-label="Отметить проданным">
                {actionLoading === 'sold' ? '…' : <Icon name="check" />}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button className="cta-primary" type="button" onClick={handleStartChat}>
              <Icon name="chat" />
              {chatLoading ? 'Открываем…' : 'Написать'}
            </button>
            <button
              className={`cta-round ${favoriteIds.includes(listingId) ? 'is-on' : ''}`}
              type="button"
              onClick={() => toggleFavorite(listingId)}
              aria-label="В избранное"
            >
              <Icon name="heart" />
            </button>
            <button className="cta-round" type="button" onClick={handleShare} aria-label="Поделиться">
              <Icon name="share" />
            </button>
          </>
        )}
      </div>
      <div className="seller-card glass-card mt-12">
        <div className="avatar" />
        <div className="seller-meta">
          <strong>{item.seller?.name || 'Продавец'}</strong>
          <span>{item.seller?.verified ? 'Проверен' : 'Профиль продавца'} · {item.favorites_count || 0} в избранном</span>
        </div>
      </div>
      {isOwner ? (
        <div className="setting-row glass-card mt-12">
          <span>Статус: {STATUS_LABELS[item.status] || item.status}</span>
        </div>
      ) : null}
    </Screen>
  )
}

const CONDITION_OPTIONS = ['Новое', 'Отличное', 'Хорошее', 'Б/у', 'На запчасти']
const DELIVERY_OPTIONS = ['Нет', 'Да']

/* Иллюстрация категории: PNG из public/categories/, а если файла ещё нет
 * или он не загрузился — встроенная SVG. Общая для ленты и формы. */
function CategoryArtwork({ label }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = CATEGORY_IMAGES[label]
  if (src && !imgFailed) {
    return <img src={`/${src}`} alt="" loading="lazy" onError={() => setImgFailed(true)} />
  }
  return <CategoryArt label={label} />
}

/* Плашка категории: подпись слева, иллюстрация справа с выходом за край.
 * Один компонент на ленту (горизонтальный рельс) и на форму (сетка).
 * Цвет у всех плашек одинаковый — задаётся в CSS, без индивидуальных тем. */
function CategoryTile({ value, label, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`cat-tile ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(value)}
    >
      <span className="cat-tile-label">{label}</span>
      <span className="cat-tile-art"><CategoryArtwork label={label} /></span>
    </button>
  )
}

function CategoryGrid({ selected, onSelect }) {
  return (
    <div className="category-grid">
      {CATEGORIES.map((cat) => (
        <CategoryTile
          key={cat.label}
          value={cat.label}
          label={cat.label}
          selected={selected === cat.label}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function FieldHint({ text, visible }) {
  if (!visible) return null
  return <div className="field-hint">{text}</div>
}

function AdForm({ initial, onSubmit, submitLabel, saving }) {
  const [form, setForm] = useState(() => ({
    category: initial?.category_raw || initial?.category || '',
    title: initial?.title || '',
    price: initial?.price != null ? String(initial.price) : '',
    city: initial?.city || '',
    description: initial?.description || '',
    condition: initial?.condition || '',
    delivery: initial?.delivery || '',
    contact_info: initial?.contact_info || '',
    photos: initial?.photos || [],
    step: 1,
  }))
  const [cities, setCities] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [focusedField, setFocusedField] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (!cancelled) setCities(data.cities || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 5 - form.photos.length)
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    try {
      const prepared = await Promise.all(files.map((f) => compressImage(f)))
      const response = await api.uploadPhotos(prepared)
      update('photos', [...form.photos, ...(response.urls || [])])
    } catch (err) {
      setUploadError(err?.detail ? `Не удалось загрузить фото: ${err.detail}` : 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleGenerate = async () => {
    if (!form.title.trim()) return
    setUploading(true)
    try {
      const response = await api.generateDescription(form.title, form.category, form.condition, form.city)
      update('description', response.description || '')
    } catch {
      setUploadError('Не удалось сгенерировать')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (url) => update('photos', form.photos.filter((p) => p !== url))

  const totalSteps = 5
  const canNext =
    form.step === 1 ? !!form.category :
    form.step === 2 ? form.photos.length > 0 :
    form.step === 3 ? form.title.trim().length >= 3 && form.description.trim() :
    form.step === 4 ? form.price && form.city.trim() :
    true

  const nextStep = () => { if (form.step < totalSteps && canNext) update('step', form.step + 1) }
  const prevStep = () => { if (form.step > 1) update('step', form.step - 1) }

  const stepTitles = ['Категория', 'Фото', 'Описание', 'Цена и город', 'Проверка']

  return (
    <div className="ad-form">
      <div className="step-indicator">
        <span>{stepTitles[form.step - 1]} · {form.step}/{totalSteps}</span>
        <div className="step-bar"><span style={{ width: `${(form.step / totalSteps) * 100}%` }} /></div>
      </div>

      {form.step === 1 && (
        <div className="form-stack">
          <CategoryGrid selected={form.category} onSelect={(c) => update('category', c)} />
        </div>
      )}

      {form.step === 2 && (
        <div className="form-stack">
          <div className="photo-step glass-card">
            <div className="section-head section-head--tight"><strong>Фото товара</strong><span>{form.photos.length} / 5</span></div>
            <div className="grid-two">
              {form.photos.map((url) => (
                <div className="upload-card" key={url}>
                  <div className="product-media small"><MediaPlaceholder imageUrl={photoDisplayUrl(url)} /></div>
                  <div className="tool-row"><button className="tool-btn" type="button" onClick={() => removePhoto(url)}>Убрать</button></div>
                </div>
              ))}
              {form.photos.length < 5 ? (
                <label className="upload-drop">
                  <span className="upload-drop-icon"><Icon name="camera" /></span>
                  <span className="upload-drop-title">Добавить фото</span>
                  <span className="upload-drop-hint">
                    {form.photos.length ? `ещё ${5 - form.photos.length}` : 'до 5 фото'} · JPG, PNG
                  </span>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden />
                </label>
              ) : null}
            </div>
            {uploading ? <div className="muted-line">Загрузка…</div> : null}
            {uploadError ? <div className="status-line error">{uploadError}</div> : null}
          </div>
        </div>
      )}

      {form.step === 3 && (
        <div className="form-stack">
          <div className="field-wrap">
            <input className="text-input glass-card" value={form.title} onChange={(e) => update('title', e.target.value)} onFocus={() => setFocusedField('title')} onBlur={() => setFocusedField('')} placeholder="Название товара" />
            <FieldHint text="Например: Куртка Zara, размер M" visible={focusedField === 'title'} />
          </div>
          <div className="field-wrap">
            <textarea className="text-area glass-card" value={form.description} onChange={(e) => update('description', e.target.value)} onFocus={() => setFocusedField('description')} onBlur={() => setFocusedField('')} placeholder="Описание: состояние, особенности, комплектация…" />
            <FieldHint text="Расскажите о состоянии, дефектах, комплектации" visible={focusedField === 'description'} />
          </div>
          <button className="ghost-btn mt-10" type="button" onClick={handleGenerate} disabled={!form.title.trim()}>
            {uploading ? 'Генерирую…' : 'Сгенерировать с ИИ'}
          </button>
          <div className="grid-two">
            <select className="text-input glass-card" value={form.condition} onChange={(e) => update('condition', e.target.value)}>
              <option value="">Состояние</option>
              {CONDITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="text-input glass-card" value={form.delivery} onChange={(e) => update('delivery', e.target.value)}>
              <option value="">Доставка</option>
              {DELIVERY_OPTIONS.map((o) => <option key={o} value={o}>{o === 'Да' ? 'Есть' : 'Нет'}</option>)}
            </select>
          </div>
        </div>
      )}

      {form.step === 4 && (
        <div className="form-stack">
          <div className="field-wrap">
            <input className="text-input glass-card" value={form.price} inputMode="numeric" onChange={(e) => update('price', e.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setFocusedField('price')} onBlur={() => setFocusedField('')} placeholder="Цена, ₽" />
            <FieldHint text="Укажите цену в рублях" visible={focusedField === 'price'} />
          </div>
          <div className="field-wrap">
            <input className="text-input glass-card" value={form.city} onChange={(e) => update('city', e.target.value)} onFocus={() => setFocusedField('city')} onBlur={() => setFocusedField('')} placeholder="Город" list="ad-city-options" />
            <FieldHint text="Начните вводить — появятся подсказки" visible={focusedField === 'city'} />
            <datalist id="ad-city-options">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="field-wrap">
            <input className="text-input glass-card" value={form.contact_info} onChange={(e) => update('contact_info', e.target.value)} onFocus={() => setFocusedField('contact')} onBlur={() => setFocusedField('')} placeholder="Контакт для связи" />
            <FieldHint text="Телефон или @username" visible={focusedField === 'contact'} />
          </div>
        </div>
      )}

      {form.step === 5 && (
        <div className="form-stack">
          <div className="preview-card glass-card">
            <div className="preview-media"><MediaPlaceholder imageUrl={photoDisplayUrl(form.photos[0])} /></div>
            <div className="preview-info">
              <div className="product-price">{form.price} ₽</div>
              <div className="row-title">{form.title}</div>
              <div className="product-city">{form.city}{form.condition ? ` · ${form.condition}` : ''}</div>
            </div>
          </div>
          <div className="copy-block glass-card">
            <strong>Описание</strong>
            <p>{form.description || '—'}</p>
          </div>
          <div className="setting-row glass-card"><span>Категория</span><span>{form.category}</span></div>
          <div className="setting-row glass-card"><span>Доставка</span><span>{form.delivery || '—'}</span></div>
          <div className="setting-row glass-card"><span>Контакт</span><span>{form.contact_info}</span></div>
        </div>
      )}

      <div className="step-actions">
        {form.step > 1 ? <button className="ghost-btn" type="button" onClick={prevStep}>Назад</button> : null}
        {form.step < totalSteps ? (
          <button className="primary-btn" disabled={!canNext} onClick={nextStep}>Далее</button>
        ) : (
          <button className="cta-button" disabled={saving || uploading} onClick={() => onSubmit({ ...form, price: Number(form.price) || 0 })}>
            {saving ? 'Публикуем…' : submitLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function CreatePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const handleSubmit = async (form) => {
    setStatus('saving')
    setError('')
    try {
      const response = await api.createListing(form)
      setCreated(response.ad)
      setStatus('success')
    } catch (err) {
      setStatus('idle')
      setError(err.code === 'unauthorized' ? 'Откройте приложение через Telegram.' : 'Не удалось опубликовать. Проверьте поля.')
    }
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} center={<Logo />} />
      <div className="page-title">Новое объявление</div>
      <div className="sub-copy">Заполните информацию о товаре — это займёт пару минут. После публикации объявление уйдёт на модерацию.</div>
      {error ? <div className="status-line error">{error}</div> : null}
      {status === 'success' && created ? (
        <div className="success-box glass-card">
          <strong>Отправлено на модерацию</strong>
          <p>{created.title}</p>
          <div className="success-actions">
            <button className="primary-btn" onClick={() => navigate('/my')}>Мои объявления</button>
            <button className="ghost-btn" onClick={() => navigate(`/listing/${created.id}`)}>Открыть</button>
          </div>
        </div>
      ) : (
        <AdForm onSubmit={handleSubmit} submitLabel="Опубликовать" saving={status === 'saving'} />
      )}
    </Screen>
  )
}

function EditAdPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const listingId = Number(id)
  const [initial, setInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getListing(listingId).then((data) => {
      if (cancelled) return
      if (!data.ad?.is_owner) {
        setError('Нет доступа.')
      } else {
        setInitial(data.ad)
      }
    }).catch(() => {
      if (!cancelled) setError('Не удалось загрузить объявление.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [listingId])

  const handleSubmit = async (form) => {
    setSaving(true)
    try {
      await api.updateListing(listingId, form)
      navigate(`/listing/${listingId}`)
    } catch {
      setError('Не удалось сохранить изменения.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to={`/listing/${listingId}`} />} center={<Logo />} />
      <div className="page-title">Редактировать</div>
      <div className="sub-copy">После правок объявление снова уйдёт на модерацию.</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} /> : null}
      {!loading && !error && initial ? <AdForm initial={initial} onSubmit={handleSubmit} submitLabel="Сохранить" saving={saving} /> : null}
    </Screen>
  )
}

function MyAdsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('active')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getMyListings()
      setItems(data.items || [])
    } catch (err) {
      setError(err.code === 'unauthorized' ? 'Откройте приложение через Telegram.' : 'Не удалось загрузить объявления.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = ['active', 'moderation', 'sold', 'rejected', 'inactive'].filter((s) => s === activeTab || items.some((i) => i.status === s))
  const visible = items.filter((i) => i.status === activeTab)

  const handleAction = async (id, action) => {
    try {
      if (action === 'sold') await api.markSold(id)
      if (action === 'republish') await api.republish(id)
      if (action === 'delete') {
        if (!window.confirm('Удалить объявление?')) return
        await api.deleteListing(id)
      }
      await load()
    } catch {
      // ignore, список обновится при следующем открытии
    }
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/profile" />} center={<Logo />} />
      <div className="page-title">Мои объявления</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <>
          <div className="tab-row">
            {tabs.map((s) => (
              <button key={s} className={`chip ${activeTab === s ? 'is-active' : ''}`} onClick={() => setActiveTab(s)}>
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>
          {visible.length === 0 ? <EmptyBlock text="В этом разделе пока пусто." /> : null}
          <div className="list-stack mt-14">
            {visible.map((item) => (
              <div key={item.id} className="favorite-row glass-card">
                <div className="result-thumb"><MediaPlaceholder imageUrl={firstPhoto(item)} /></div>
                <div>
                  <div className="product-price result-price">{priceText(item)}</div>
                  <div className="row-title">{item.title}</div>
                  <div className="product-city">{item.views || 0} просмотров · {item.favorites_count || 0} в избранном</div>
                  <div className="tool-row">
                    <button className="tool-btn" onClick={() => navigate(`/listing/${item.id}`)}>Открыть</button>
                    <button className="tool-btn" onClick={() => navigate(`/edit/${item.id}`)}>Изменить</button>
                    {item.status === 'active' ? <button className="tool-btn" onClick={() => handleAction(item.id, 'sold')}>Продано</button> : null}
                    {item.status !== 'active' && item.status !== 'moderation' ? <button className="tool-btn" onClick={() => handleAction(item.id, 'republish')}>Активировать</button> : null}
                    <button className="tool-btn" onClick={() => handleAction(item.id, 'delete')}>Удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Screen>
  )
}

function ChatsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getChats()
      setItems(data.items || [])
    } catch {
      setError('Не удалось загрузить сообщения.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} center={<Logo />} />
      <div className="page-title">Сообщения</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Диалогов пока нет. Напишите продавцу из карточки объявления." /> : null}
      <div className="list-stack mt-14">
        {items.map((chat) => (
          <Link to={`/chat/${chat.id}`} key={chat.id} className="chat-row glass-card">
            <div className="avatar" />
            <div className="chat-meta">
              <strong>{chat.user}</strong>
              <span>{chat.last_text || chat.ad_title}</span>
            </div>
            <div className="product-city">{shortTime(chat.time)}</div>
          </Link>
        ))}
      </div>
    </Screen>
  )
}

function ChatPage() {
  const { id } = useParams()
  const chatId = Number(id)
  const [viewerId, setViewerId] = useState(null)
  const [chatInfo, setChatInfo] = useState({ user: '', ad_title: '' })
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mediaBusy, setMediaBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const bottomRef = useRef(null)

  // Полная перезагрузка диалога. Функция была потеряна, а handleEdit и
  // handleDelete её вызывали (.then(load)) — падало с ReferenceError.
  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getChat(chatId)
      setViewerId(data.viewer_id)
      setChatInfo({ user: data.other_name || data.other_anon || '', ad_title: data.ad_title || '' })
      setMessages(data.messages || [])
      setError('')
    } catch {
      setError('Не удалось открыть диалог.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.getChat(chatId).then((data) => {
      if (cancelled) return
      setViewerId(data.viewer_id)
      setChatInfo({ user: data.other_name || data.other_anon || '', ad_title: data.ad_title || '' })
      setMessages(data.messages || [])
    }).catch(() => {
      if (!cancelled) setError('Не удалось открыть диалог.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [chatId])

  useEffect(() => {
    if (!viewerId && messages.length === 0) return undefined
    const timer = setInterval(async () => {
      try {
        const lastId = messages.length ? messages[messages.length - 1].id : 0
        const data = await api.pollChat(chatId, lastId)
        if (data.messages?.length) {
          setMessages((prev) => [...prev, ...data.messages])
        }
      } catch {
        // ignore poll errors
      }
    }, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, viewerId, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    if (!text.trim()) return
    const value = text.trim()
    setText('')
    try {
      await api.sendMessage(chatId, value)
      const data = await api.pollChat(chatId, messages.length ? messages[messages.length - 1].id : 0)
      if (data.messages?.length) {
        setMessages((prev) => [...prev, ...data.messages])
      } else {
        setMessages((prev) => [...prev, { id: Date.now(), sender_id: viewerId, text: value }])
      }
    } catch {
      setMessages((prev) => [...prev, { id: Date.now(), sender_id: viewerId, text: value }])
    }
  }

  const side = (message) => (viewerId != null && message.sender_id === viewerId ? 'out' : 'in')

  const [menuFor, setMenuFor] = useState(null)

  const openMenu = (id) => setMenuFor(menuFor === id ? null : id)
  const closeMenu = () => setMenuFor(null)

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    closeMenu()
  }

  const handleEdit = (message) => {
    const value = prompt('Редактировать сообщение:', message.text)
    if (value && value.trim() && value !== message.text) {
      api.editMessage(chatId, message.id, value.trim()).then(load).catch(() => {})
    }
    closeMenu()
  }

  const handleDelete = (message) => {
    if (window.confirm('Удалить сообщение?')) {
      api.deleteMessage(chatId, message.id).then(load).catch(() => {})
    }
    closeMenu()
  }

  /* Общий отправщик вложения: и файл из галереи, и записанное голосовое
   * идут на /api/chat/{id}/media и возвращают готовое сообщение. */
  const sendMedia = async (file) => {
    setMediaBusy(true)
    setError('')
    try {
      const data = await api.sendChatMedia(chatId, file)
      if (data.message) setMessages((prev) => [...prev, data.message])
    } catch (err) {
      setError(err?.detail ? `Не удалось прикрепить: ${err.detail}` : 'Не удалось прикрепить файл.')
    } finally {
      setMediaBusy(false)
    }
  }

  const handleAttach = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    // Видео с телефона легко перевалить за лимит — предупредим до отправки
    if (file.size > 25 * 1024 * 1024) {
      setError('Файл больше 25 МБ.')
      return
    }
    await sendMedia(file)
  }

  /* Голосовые: MediaRecorder. Кнопка работает как переключатель —
   * нажал «запись», нажал ещё раз «отправить». */
  const startRecording = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись голосовых не поддерживается этим устройством.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/webm', 'audio/ogg', 'audio/mp4']
      const mime = preferred.find((m) => MediaRecorder.isTypeSupported?.(m)) || ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        // Отсекаем случайные нажатия: меньше ~1 КБ — это тишина
        if (blob.size < 1024) {
          setError('Запись слишком короткая.')
          return
        }
        const ext = (blob.type.includes('ogg') && 'ogg') || (blob.type.includes('mp4') && 'm4a') || 'webm'
        await sendMedia(new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' }))
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      setError('Нет доступа к микрофону.')
    }
  }

  const stopRecording = () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  // Не бросаем запись, если пользователь ушёл с экрана
  useEffect(() => () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  return (
    <Screen padded={false}>
      <div className="chat-screen">
        <div className="chat-top padded-inline">
          <TopBar
            left={
              <div className="chat-header-left">
                <IconButton icon="back" to="/chats" />
                <div className="avatar" />
                <div>
                  <strong>{chatInfo.user || 'Диалог'}</strong>
                  <div className="product-city">{chatInfo.ad_title}</div>
                </div>
              </div>
            }
          />
        </div>
        {loading ? <div className="padded-inline"><LoadingBlock /></div> : null}
        {error ? <div className="padded-inline"><ErrorBlock text={error} /></div> : null}
        <div className="chat-messages padded-inline" onClick={closeMenu}>
          {messages.map((message) => {
            const isMine = viewerId != null && message.sender_id === viewerId
            const canEdit = isMine && !message.is_read
            return (
              <div key={message.id} className={`bubble-wrap ${side(message)}`}>
                <div
                  className={`bubble ${side(message)} ${isMediaMessage(message) ? 'bubble-media' : ''}`}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(message.id) }}
                >
                  {chatMediaUrl(message) ? (
                    mediaKind(message) === 'video' ? (
                      <video
                        className="bubble-media-img"
                        src={resolveAssetUrl(chatMediaUrl(message))}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : mediaKind(message) === 'voice' ? (
                      <audio
                        className="bubble-audio"
                        src={resolveAssetUrl(chatMediaUrl(message))}
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <img
                        className="bubble-media-img"
                        src={resolveAssetUrl(chatMediaUrl(message))}
                        alt=""
                        loading="lazy"
                      />
                    )
                  ) : null}
                  {message.text ? <span>{message.text}</span> : null}
                  <span className="bubble-time">{shortTime(message.created_at)}</span>
                </div>
                {menuFor === message.id ? (
                  <div className="bubble-menu">
                    <button type="button" onClick={() => handleCopy(message.text)}>Копировать</button>
                    {canEdit ? (
                      <button type="button" onClick={() => handleEdit(message)}>Редактировать</button>
                    ) : null}
                    {isMine ? (
                      <button type="button" onClick={() => handleDelete(message)}>Удалить</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-wrap">
          <div className="chat-input glass-card">
            <label className="attach-btn" title="Фото или видео">
              <Icon name="image" />
              <input type="file" accept="image/*,video/*" onChange={handleAttach} hidden />
            </label>
            <button
              className={`mic-btn ${recording ? 'is-recording' : ''}`}
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={mediaBusy}
              aria-label={recording ? 'Остановить запись' : 'Записать голосовое'}
              title={recording ? 'Остановить и отправить' : 'Голосовое сообщение'}
            >
              <Icon name={recording ? 'check' : 'mic'} />
            </button>
            <input
              className="chat-field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder={recording ? 'Идёт запись…' : 'Сообщение…'}
              disabled={recording}
            />
            <button className="send-btn" type="button" onClick={handleSend} aria-label="Отправить">
              <Icon name="send" />
            </button>
          </div>
          {mediaBusy ? <div className="chat-media-busy">Отправляем вложение…</div> : null}
        </div>
      </div>
    </Screen>
  )
}

function FavoritesPage() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getFavorites()
      setItems(data.items || [])
    } catch {
      setError('Не удалось загрузить избранное.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setItems((prev) => prev.filter((item) => favoriteIds.includes(item.id)))
  }, [favoriteIds])

  return (
    <Screen>
      <TopBar left={<Logo />} right={<IconButton icon="bookmark" active />} />
      <div className="page-title">Избранное</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Вы пока ничего не сохранили." /> : null}
      <div className="list-stack mt-14">
        {items.map((item) => (
          <div key={item.id} className="favorite-row glass-card">
            <div className="result-thumb"><MediaPlaceholder imageUrl={firstPhoto(item)} /></div>
            <div>
              <div className="product-price result-price">{priceText(item)}</div>
              <div className="row-title">{item.title}</div>
              <div className="product-city">{item.city}</div>
            </div>
            <button className="trash-btn" type="button" onClick={() => toggleFavorite(item.id)}>×</button>
          </div>
        ))}
      </div>
    </Screen>
  )
}

function ProfilePage() {
  const { profile, tgUser, backendMode } = useApp()
  const avatarUrl = tgUser?.photo_url || ''

  return (
    <Screen>
      <div className="profile-top">
        <Logo />
        {avatarUrl ? (
          <img className="profile-avatar-img" src={avatarUrl} alt="Аватар" referrerPolicy="no-referrer" />
        ) : (
          <div className="profile-avatar-fallback">{(tgUser?.first_name || profile?.name || 'П')[0]?.toUpperCase()}</div>
        )}
        <strong className="profile-id">{profile?.id || tgUser?.username || 'Профиль'}</strong>
        {profile?.verified ? <div className="badge mt-8">Проверен</div> : null}
        {!profile ? <div className="product-city mt-8">Откройте приложение через Telegram</div> : null}
        <div className="telegram-note">{tgUser?.first_name || 'Гость'} · {backendMode === 'online' ? 'online' : backendMode}</div>
      </div>
      {/* Статистика продавца переехала сюда с главной: в профиле она уместнее,
          и здесь больше нет дублирующей строки с теми же цифрами. */}
      <SellerStats profile={profile} />
      {!profile ? <ErrorBlock text={`Профиль недоступен (initData: ${getInitData()?.length || 0} симв.). Откройте Mini App кнопкой бота, не прямой ссылкой.`} /> : null}
      <div className="list-stack mt-14">
        <Link to="/my" className="setting-row glass-card"><span>Мои объявления</span></Link>
        <Link to="/favorites" className="setting-row glass-card"><span>Избранное</span><Icon name="bookmark" /></Link>
        <Link to="/chats" className="setting-row glass-card"><span>Сообщения</span><Icon name="chat" /></Link>
        <Link to="/create" className="setting-row glass-card"><span>Разместить объявление</span><Icon name="plus" /></Link>
      </div>
    </Screen>
  )
}

function OnboardingPage() {
  return (
    <Screen>
      <div className="onboarding">
        <div className="blob" />
        <Logo />
        <p>Покупайте и продавайте вещи без лишнего шума.</p>
        <Link to="/" className="dark-btn big mt-12">Начать</Link>
        <div className="dots"><span className="is-active" /><span /><span /></div>
      </div>
    </Screen>
  )
}

function Layout() {
  const location = useLocation()
  // /my и /chats — это разделы из нижнего док-бара, поэтому навигацию там
  // не скрываем: иначе, тапнув «Сообщения» в доке, пользователь остаётся
  // без дока и может выйти только стрелкой назад.
  const hideNav =
    location.pathname === '/onboarding' ||
    location.pathname === '/create' ||
    location.pathname.startsWith('/listing/') ||
    location.pathname.startsWith('/chat/') ||
    location.pathname.startsWith('/edit/')

  return (
    <div className="app-shell">
      <div className="notch" />
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/listing/:id" element={<ListingPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/edit/:id" element={<EditAdPage />} />
        <Route path="/my" element={<MyAdsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
      </Routes>
      {!hideNav ? <BottomNav /> : null}
    </div>
  )
}

function BottomNav() {
  const location = useLocation()
  const items = [
    { icon: 'home', to: '/', label: 'Главная' },
    { icon: 'chat', to: '/chats', label: 'Сообщения' },
    { icon: 'bookmark', to: '/favorites', label: 'Избранное' },
    { icon: 'search', to: '/search', label: 'Поиск' },
  ]

  const renderItem = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end
      className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
    >
      <span className="dock-icon"><Icon name={item.icon} /></span>
      <span className="dock-label">{item.label}</span>
    </NavLink>
  )

  return (
    <nav className="dock">
      {items.slice(0, 2).map(renderItem)}
      <NavLink to="/create" className="dock-create" aria-label="Разместить объявление">
        <Icon name="plus" />
      </NavLink>
      {items.slice(2).map(renderItem)}
      <NavLink to="/profile" className="profile-bubble">
        <span>{(useApp().tgUser?.first_name || 'П')[0]?.toUpperCase()}</span>
      </NavLink>
    </nav>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[polka] ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Screen>
          <TopBar left={<Logo />} />
          <ErrorBlock text={`Ошибка приложения: ${this.state.error?.message || 'неизвестная ошибка'}`} />
        </Screen>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <AppProvider>
          <div className="app-frame">
            <Layout />
          </div>
        </AppProvider>
      </ErrorBoundary>
    </HashRouter>
  )
}


