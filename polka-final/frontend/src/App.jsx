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
  // Стрелка «открыть на сайте»: ведёт на исходное объявление Авито
  arrowUpRight: 'M7 17L17 7M17 7H8M17 7v9',
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
  /* Молоток аукциона: головка ромбом, рукоять и подставка */
  gavel: [
    <path key="1" d="M12.8 2.8 21.2 11.2" />,
    <path key="2" d="M9.8 5.8 18.2 14.2" />,
    <path key="3" d="M12.8 2.8 9.8 5.8" />,
    <path key="4" d="M21.2 11.2 18.2 14.2" />,
    <path key="5" d="M11.5 13.5 4.2 20.6" />,
    <path key="6" d="M2.6 21.4h8.2" />,
  ],
  mic: [<rect key="1" x="9" y="3" width="6" height="11" rx="3" />, <path key="2" d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />, <path key="3" d="M12 18v3" />],
}

const STATUS_LABELS = {
  active: 'Активные',
  moderation: 'На модерации',
  sold: 'Проданные',
  rejected: 'Отклонённые',
  inactive: 'Снятые',
  // Итоги аукциона
  ended: 'Лот продан',
  ended_unsold: 'Торги без ставок',
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
/* Декодирование через <img>: Safari умеет HEIC, который createImageBitmap
 * не берёт. Без этого фото с iPhone уходило СЫРЫМ и рвало соединение. */
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode_failed')) }
    img.src = url
  })
}

async function compressImage(file, maxSide = 1600, quality = 0.85) {
  if (!file || !String(file.type || '').startsWith('image/')) return file
  let source = null
  let srcW = 0
  let srcH = 0
  try {
    source = await createImageBitmap(file)
    srcW = source.width
    srcH = source.height
  } catch {
    try {
      source = await loadImageElement(file)
      srcW = source.naturalWidth || source.width || 0
      srcH = source.naturalHeight || source.height || 0
    } catch {
      return file // не смогли декодировать — размер проверит prepareUpload
    }
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(srcW || 1, srcH || 1))
    const w = Math.max(1, Math.round((srcW || 1) * scale))
    const h = Math.max(1, Math.round((srcH || 1) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(source, 0, 0, w, h)
    if (source.close) source.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    // Если сжатие не помогло — смысла подменять файл нет
    if (!blob || blob.size >= file.size) return file
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function isMediaMessage(message) {
  const kind = message?.media_type || message?.msg_type || ''
  return Boolean(kind) && kind !== 'text'
}

/* Платформа режет тело запроса примерно на 10 МБ и отвечает
 * 413 {"error":"payload too large"} — замерено на живом сервисе.
 * Поэтому фото сжимаем на клиенте перед отправкой, как это уже сделано
 * для объявлений. Видео перекодировать в браузере нельзя, поэтому для него
 * только проверяем размер и честно говорим об ограничении. */
const UPLOAD_LIMIT_MB = 9
const UPLOAD_LIMIT_BYTES = UPLOAD_LIMIT_MB * 1024 * 1024

async function prepareUpload(file) {
  if (!file) return file
  let out = file
  if (String(file.type || '').startsWith('image/')) {
    out = await compressImage(file, 1600, 0.85)
    // Если и после сжатия тяжело — жмём сильнее (панорамы, скриншоты)
    if (out.size > UPLOAD_LIMIT_BYTES) out = await compressImage(file, 1280, 0.7)
  }
  if (out.size > UPLOAD_LIMIT_BYTES) {
    const error = new Error('too_large')
    error.status = 413
    error.detail = `файл больше ${UPLOAD_LIMIT_MB} МБ`
    throw error
  }
  return out
}

/* Человеческий текст вместо «payload too large» и сетевого «Load failed» */
function uploadErrorText(err) {
  const detail = String(err?.detail || err?.message || '')
  if (err?.status === 413 || /payload too large/i.test(detail)) {
    return `Файл слишком большой для загрузки. Выберите фото меньшего размера или короткое видео (до ${UPLOAD_LIMIT_MB} МБ).`
  }
  // Safari/WebKit так сообщает об обрыве соединения при отправке
  if (/load failed|failed to fetch|networkerror|network request failed|обрыв/i.test(detail)) {
    return 'Соединение прервалось при загрузке. Проверьте интернет и попробуйте снова — если повторяется, выберите файл меньшего размера.'
  }
  // Понятные причины вместо «http_500»
  const code = err?.status
  if (code === 401) return 'Откройте приложение через Telegram и попробуйте снова.'
  if (code === 403) return 'Нет доступа к этому диалогу.'
  if (code === 404) return 'Диалог или файл не найден — обновите страницу.'
  if (code === 415) return 'Такой формат не поддерживается: подойдут фото, видео и голосовые.'
  if (code === 500) return 'Сервер не смог сохранить файл. Попробуйте ещё раз через минуту.'
  return detail ? `Не удалось: ${detail}` : 'Не удалось отправить.'
}

function formatSize(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} КБ`
  return `${(b / (1024 * 1024)).toFixed(1)} МБ`
}

/* Тип вложения для отрисовки: photo | video | voice.
 * Бот пишет msg_type, старые сообщения могли иметь media_type. */
function mediaKind(message) {
  return message?.media_type || message?.msg_type || 'photo'
}

function ProductCard({ item, favorite = false, onToggleFavorite }) {
  // Защита: если пришёл пустой элемент, карточка не должна ронять ВСЁ
  // приложение. Была ошибка «null is not an object (evaluating
  // 'a.source_url')» — один пустой объект в списке ломал весь экран.
  if (!item || typeof item !== 'object') return null
  const handleFavorite = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggleFavorite?.(item.id)
  }

  return (
    <Link to={`/listing/${item.id}`} className="product-card">
      <div className="product-media">
        <MediaPlaceholder imageUrl={firstPhoto(item)} />
        {/* Выгода относительно медианы по категории — то, ради чего подписчик
            и открывает ленту, а не «свежесть публикации» */}
        {Number(item.discount_percent) >= 15 ? (
          <span className="deal-badge">−{Math.round(item.discount_percent)}%</span>
        ) : null}
        <button className={`save-btn ${favorite ? 'is-on' : ''}`} type="button" onClick={handleFavorite}>
          <Icon name="heart" />
        </button>
      </div>
      <div className="product-info">
        <div className="product-title">{item.title}</div>
        <div className="product-city">{item.city}</div>
        <div className="product-bottom">
          <div className="product-price">{priceText(item)}</div>
          {item.source_url ? (
            /* Находка с Авито: стрелка ведёт на исходное объявление */
            <button className="product-action" type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const tg = window.Telegram?.WebApp
                if (tg?.openLink) tg.openLink(item.source_url)
                else window.open(item.source_url, '_blank', 'noopener')
              }}>
              <Icon name="send" />
            </button>
          ) : (
            <button className="product-action" type="button" onClick={handleFavorite}>
              <Icon name="chat" />
            </button>
          )}
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

/* ══════════════════════════════════════════════════════════════════════════
   ИСТОРИИ ПРОДАВЦОВ
   Пре-модерация для всех: в рельс попадает только одобренное, поэтому у «Вы»
   показываем ещё и счётчик историй, ждущих проверки.
   ══════════════════════════════════════════════════════════════════════════ */
const STORY_PHOTO_MS = 5000

function storyAgo(iso) {
  const t = Date.parse(iso || '')
  if (!t) return ''
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000))
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн`
}

function storyLabel(author) {
  if (!author) return ''
  if (author.is_me) return 'Вы'
  const name = author.name || ''
  return name.startsWith('polka_anon') ? `id${name.replace('polka_anon_', '')}` : name
}

function storyAvatarUrl(author) {
  const first = author?.stories?.[0]
  return first ? resolveAssetUrl(first.media) : ''
}

/* Кольцо: цветное — есть непросмотренные, серое — всё просмотрено */
function StoryRing({ author, own = false, pending = 0, children }) {
  const cls = ['story-ring']
  if (own) cls.push('is-own')
  const hasStories = Number(author?.stories?.length || 0) > 0
  if (hasStories && Number(author?.unseen || 0) === 0) cls.push('is-seen')
  if (pending > 0 && !hasStories) cls.push('is-pending')
  return <div className={cls.join(' ')}>{children}</div>
}

function StoriesRow() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState([])
  const [mine, setMine] = useState(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    try {
      const data = await api.getStories()
      setAuthors(data.authors || [])
      setMine(data.mine || null)
    } catch {
      setAuthors([])   // истории не критичны для ленты — просто не показываем рельс
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (!loaded) return null
  const myAuthor = authors.find((a) => a.is_me && a.stories?.length) || null
  // Автор без активных историй в рельсе не нужен: тап по нему не открывал бы
  // ничего. Бэкенд таких не отдаёт, но подстрахуемся.
  const others = authors.filter((a) => !a.is_me && a.stories?.length)
  const pending = Number(mine?.pending || 0)
  // Авторизованному рельс показываем ВСЕГДА: иначе на пустой площадке
  // (ни одной истории) он пропадал бы и выложить первую было бы негде.
  if (!myAuthor && !others.length && !pending && !mine?.can_post) return null

  const openMine = () => {
    if (myAuthor) setViewerIndex(authors.indexOf(myAuthor))
    else navigate('/story/new')
  }

  return (
    <>
      <div className="stories-block">
        <div className="stories-head">
          <Icon name="sparkles" />
          <span>Истории продавцов</span>
        </div>
        <div className="stories-row">
          {/* «Вы» — два действия: кольцо открывает мою историю (или создание,
              если её нет), а «плюс» рядом всегда ведёт на создание. Раньше
              плюс пропадал, как только появлялась активная история, и было
              непонятно, как выложить новую. */}
          <div className="story-item is-mine">
            <div className="story-mine-ring">
              <button type="button" className="story-ring-hit" onClick={openMine}
                aria-label={myAuthor ? 'Моя история' : 'Добавить историю'}>
                <StoryRing author={myAuthor} own pending={pending}>
                  <div className="story-avatar">
                    {myAuthor ? <img src={storyAvatarUrl(myAuthor)} alt="" /> : <Icon name="plus" />}
                  </div>
                </StoryRing>
              </button>
              <button type="button" className="story-add" aria-label="Добавить историю"
                onClick={() => navigate('/story/new')}>
                <Icon name="plus" />
              </button>
              {pending ? <span className="story-badge">{pending}</span> : null}
            </div>
            <span className="story-name">Вы</span>
          </div>
          {others.map((a) => (
            <button type="button" key={a.user_id} className="story-item"
              onClick={() => setViewerIndex(authors.indexOf(a))}>
              <StoryRing author={a}>
                <div className="story-avatar">
                  <img src={storyAvatarUrl(a)} alt="" loading="lazy" />
                </div>
              </StoryRing>
              <span className="story-name">{storyLabel(a)}</span>
            </button>
          ))}
        </div>
      </div>
      {viewerIndex != null && authors[viewerIndex] ? (
        <StoryViewer authors={authors} startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)} onSeen={load} />
      ) : null}
    </>
  )
}

/* Полноэкранный просмотр: полоски прогресса, автоперелистывание,
 * тап слева/справа, удержание — пауза, свайп вниз — закрыть. */
function StoryViewer({ authors, startIndex, onClose, onSeen }) {
  const navigate = useNavigate()
  const [authorIdx, setAuthorIdx] = useState(startIndex)
  const [slide, setSlide] = useState(0)
  const [progress, setProgress] = useState(0)
  const holdRef = useRef(false)
  const touchStartY = useRef(null)
  const videoRef = useRef(null)

  const author = authors[authorIdx]
  const stories = author?.stories || []
  const story = stories[slide]

  const goNext = () => {
    if (slide + 1 < stories.length) { setSlide(slide + 1); return }
    if (authorIdx + 1 < authors.length) { setAuthorIdx(authorIdx + 1); setSlide(0); return }
    onClose()
  }

  const goPrev = () => {
    if (slide > 0) { setSlide(slide - 1); return }
    if (authorIdx > 0) {
      const prev = authorIdx - 1
      setAuthorIdx(prev)
      setSlide(Math.max(0, (authors[prev].stories || []).length - 1))
    }
  }

  // Отмечаем просмотр — от этого зависят кольца в рельсе
  useEffect(() => {
    if (!story) return
    api.viewStory(story.id).then(() => onSeen?.()).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  // Автоперелистывание фото. Удержание ставит на паузу и НЕ двигает отсчёт.
  useEffect(() => {
    if (!story || story.media_type === 'video') return undefined
    setProgress(0)
    const started = Date.now()
    let pausedFor = 0
    let pausedAt = 0
    const timer = setInterval(() => {
      if (holdRef.current) {
        if (!pausedAt) pausedAt = Date.now()
      } else if (pausedAt) {
        pausedFor += Date.now() - pausedAt
        pausedAt = 0
      }
      const ratio = (Date.now() - started - pausedFor) / STORY_PHOTO_MS
      if (ratio >= 1) {
        clearInterval(timer)
        goNext()
      } else {
        setProgress(ratio)
      }
    }, 50)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  // Видео запускаем вручную: автовоспроизведение со звуком браузеры режут
  useEffect(() => {
    if (story?.media_type !== 'video') return
    const el = videoRef.current
    if (el) el.play().catch(() => {})
  }, [story?.id, story?.media_type])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorIdx, slide, authors])

  if (!story) return null

  const mediaUrl = resolveAssetUrl(story.media)

  return (
    <div
      className="story-viewer"
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
      onTouchEnd={(e) => {
        const start = touchStartY.current
        touchStartY.current = null
        if (start != null && e.changedTouches[0].clientY - start > 110) onClose()
      }}
    >
      <div className="story-progress">
        {stories.map((s, i) => (
          <span key={s.id} className="story-bar">
            <span className="story-bar-fill"
              style={{ width: `${i < slide ? 100 : i === slide ? Math.min(100, progress * 100) : 0}%` }} />
          </span>
        ))}
      </div>

      <div className="story-topbar">
        <div className="story-author">
          <div className="story-author-avatar">
            <img src={mediaUrl} alt="" />
          </div>
          <div className="story-author-text">
            <strong>{storyLabel(author)}</strong>
            <span>{storyAgo(story.created_at)}</span>
          </div>
        </div>
        <button type="button" className="story-close" onClick={onClose} aria-label="Закрыть">
          <Icon name="plus" />
        </button>
      </div>

      <div className="story-stage"
        onPointerDown={() => { holdRef.current = true }}
        onPointerUp={() => { holdRef.current = false }}
        onPointerLeave={() => { holdRef.current = false }}>
        {story.media_type === 'video' ? (
          <video
            ref={videoRef}
            className="story-media"
            src={mediaUrl}
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration) setProgress(v.currentTime / v.duration)
            }}
            onEnded={goNext}
          />
        ) : (
          <img className="story-media" src={mediaUrl} alt="" />
        )}
      </div>

      <button type="button" className="story-tap story-tap-prev" onClick={goPrev} aria-label="Назад" />
      <button type="button" className="story-tap story-tap-next" onClick={goNext} aria-label="Вперёд" />

      <div className="story-footer">
        {/* Заметная плашка на объявление: видно, что за товар,
            и одним тапом открывается карточка */}
        {story.ad_id ? (
          <button type="button" className="story-ad-plate"
            onClick={() => { onClose(); navigate(`/listing/${story.ad_id}`) }}>
            <span className="story-ad-icon"><Icon name="sparkles" /></span>
            <span className="story-ad-text">
              <strong>Товар из истории</strong>
              <span>Посмотреть объявление</span>
            </span>
            <span className="story-ad-arrow"><Icon name="back" /></span>
          </button>
        ) : null}
        {story.caption ? <div className="story-caption">{story.caption}</div> : null}
        <div className="story-actions">
          {author?.is_me ? (
            <button type="button" className="story-action"
              onClick={() => { onClose(); navigate('/story/new') }}>
              <Icon name="plus" /> Добавить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   АУКЦИОНЫ
   Сервер отдаёт остаток времени в секундах — дальше считаем сами, чтобы
   таймер не зависел от расхождения часов на устройстве.
   ══════════════════════════════════════════════════════════════════════════ */
const AUCTION_URGENT_SEC = 300

function formatLeft(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (days > 0) return `${days} д ${hours} ч`
  if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function Countdown({ seconds, className = '', doneText = 'Завершён' }) {
  const [left, setLeft] = useState(() => Math.max(0, Number(seconds) || 0))
  useEffect(() => {
    setLeft(Math.max(0, Number(seconds) || 0))
    const timer = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [seconds])
  if (left <= 0) return <span className={className}>{doneText}</span>
  const urgent = left <= AUCTION_URGENT_SEC
  return (
    <span className={`${className} ${urgent ? 'is-urgent' : ''}`.trim()}>
      <Icon name="clock" />{formatLeft(left)}
    </span>
  )
}

function auctionPriceText(item) {
  const hasBids = Number(item?.bids_count || 0) > 0
  const value = hasBids ? Number(item.current_bid || 0) : Number(item.start_price || 0)
  const label = hasBids ? 'Текущая ставка' : 'Старт'
  return { label, value: `${value.toLocaleString('ru-RU')} ₽`, raw: value }
}

/* Шторка ставки — общая для ленты лотов и карточки товара */
function BidSheet({ item, onClose, onDone }) {
  const min = Number(item?.min_next_bid || 0)
  const [amount, setAmount] = useState(String(min))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const value = Number(String(amount).replace(/[^0-9]/g, ''))
    if (!value) { setError('Введите сумму.'); return }
    if (value < min) { setError(`Минимум ${min.toLocaleString('ru-RU')} ₽`); return }
    setBusy(true)
    setError('')
    try {
      const data = await api.placeBid(item.id, value)
      onDone?.(data)
      onClose()
    } catch (err) {
      const code = err?.detail || err?.message || ''
      if (code === 'too_low') setError(`Ставка уже выросла. Минимум ${Number(err.minimum || min).toLocaleString('ru-RU')} ₽`)
      else if (code === 'own_lot') setError('Нельзя ставить на свой лот.')
      else if (code === 'ended') setError('Торги уже завершены.')
      else if (code === 'use_buy_now') setError('Сумма дошла до цены выкупа — используйте «Купить сразу».')
      else setError('Не удалось сделать ставку.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <strong className="sheet-title">Ставка за лот</strong>
        <div className="sheet-lot">{item?.title}</div>
        <div className="sheet-row">
          <span>Минимум</span>
          <b>{min.toLocaleString('ru-RU')} ₽</b>
        </div>
        {item?.buy_now_price ? (
          <div className="sheet-row">
            <span>Купить сразу</span>
            <b>{Number(item.buy_now_price).toLocaleString('ru-RU')} ₽</b>
          </div>
        ) : null}
        <div className="bid-input-row">
          <button type="button" className="bid-step" onClick={() => setAmount(String(Math.max(min, Number(amount || 0) - Number(item?.bid_step || 0))))}>−</button>
          <input
            className="text-input glass-card bid-input"
            value={amount}
            inputMode="numeric"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button type="button" className="bid-step" onClick={() => setAmount(String(Number(amount || 0) + Number(item?.bid_step || 0)))}>+</button>
        </div>
        {error ? <div className="status-line error">{error}</div> : null}
        <button type="button" className="cta-primary" disabled={busy} onClick={submit}>
          {busy ? 'Отправляем…' : 'Сделать ставку'}
        </button>
        <p className="story-hint">Ставка обязывает: отменить её нельзя.</p>
      </div>
    </div>
  )
}

/* Карточка лота в списке */
function AuctionCard({ item, onBid }) {
  const price = auctionPriceText(item)
  const bids = Number(item.bids_count || 0)
  return (
    <div className="auction-card glass-card">
      <Link to={`/listing/${item.id}`} className="auction-thumb">
        <MediaPlaceholder imageUrl={firstPhoto(item)} />
      </Link>
      <div className="auction-body">
        <Link to={`/listing/${item.id}`} className="auction-title">{item.title}</Link>
        <div className="auction-meta">
          <strong>{price.value}</strong>
          <span>{bids ? `${bids} ${bids === 1 ? 'ставка' : bids < 5 ? 'ставки' : 'ставок'}` : 'ставок нет'}</span>
        </div>
        <div className="auction-foot">
          <Countdown seconds={item.time_left} className="auction-timer" />
          {item.is_owner ? (
            <span className="auction-own">Ваш лот</span>
          ) : (
            <button type="button" className="auction-bid-btn" onClick={() => onBid(item)}>
              Ставка
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const BID_STATE_LABELS = {
  leading: { text: 'Вы лидируете', tone: 'is-ok' },
  outbid: { text: 'Ставку перебили', tone: 'is-warn' },
  won: { text: 'Вы выиграли', tone: 'is-ok' },
  lost: { text: 'Проиграна', tone: 'is-muted' },
}

/* «Что ловить» — критерии, по которым бот ищет дешёвое на Авито.
 * Раньше их можно было задать ТОЛЬКО командой /hunt в боте: в приложении
 * входа не было вовсе, поэтому человек его и не находил. */
function CriteriaPage() {
  const [items, setItems] = useState([])
  const [cities, setCities] = useState([])
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minDiscount, setMinDiscount] = useState(15)
  const [mode, setMode] = useState('any')
  const [collector, setCollector] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getCriteria()
      setItems(data.items || [])
      setCollector(data.collector || null)
      setError('')
    } catch {
      setError('Не удалось загрузить критерии.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    api.getFilters().then((d) => setCities(d.cities || [])).catch(() => {})
  }, [])

  const add = async () => {
    if (query.trim().length < 2) {
      setError('Напишите, что искать — например «iphone 13»')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.addCriterion({
        query: query.trim(),
        city,
        max_price: Number(maxPrice) || 0,
        min_discount: mode === 'deal' ? minDiscount : 0,
        mode,
      })
      setQuery('')
      setCity('')
      setMaxPrice('')
      await load()
    } catch (err) {
      // Показываем ПРИЧИНУ, а не «не удалось»: без этого человек не поймёт,
      // что критерий просто уже есть в списке
      const code = err?.code || ''
      if (code === 'duplicate') setError('Такой критерий уже есть — он в списке ниже.')
      else if (code === 'query_too_short') setError('Напишите, что искать — хотя бы два символа.')
      else if (err?.status === 401) setError('Откройте приложение через Telegram.')
      else if (err?.status === 400 && err?.detail) setError(`Не получилось: ${err.detail}`)
      else setError('Не удалось добавить критерий. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await api.removeCriterion(id)
      await load()
    } catch {
      setError('Не удалось убрать критерий.')
    }
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} />
      <div className="page-title">Что ловить</div>
      <p className="sub-copy">
        Напишите, что искать на Авито. Бот будет присылать подходящие объявления,
        а когда наберётся статистика — покажет, сколько на них заработать.
      </p>

      {/* Жёлтое предупреждение — только когда это ДЕЙСТВИТЕЛЬНО проблема.
          Сразу после запуска сборщик ещё не успел отметиться, и пугать
          человека жёлтым баннером «всё сломано» неправильно. */}
      {collector && !collector.alive
        && (!collector.server_mode || (collector.minutes ?? 0) > 45) ? (
        <div className="collector-warn">
          <strong>
            {collector.server_mode ? 'Собираем первые объявления' : 'Объявления пока не приходят'}
          </strong>
          <span>
            {collector.minutes == null
              ? (collector.server_mode
                  ? 'Поиск уже идёт и займёт несколько минут. Как только появятся подходящие объявления — пришлю их в бот.'
                  : 'Сборщик ещё ни разу не выходил на связь. Он работает на вашем компьютере — без него искать некому.')
              : (collector.server_mode
                  ? `Сбор идёт, но последний выход был ${Math.round(collector.minutes / 60)} ч назад. Похоже, Авито ограничил сбор — попробую позже сам.`
                  : `Сборщик последний раз выходил ${Math.round(collector.minutes / 60)} ч назад. Проверьте, запущен ли он.`)}
          </span>
        </div>
      ) : collector && !collector.alive ? (
        <div className="collector-ok">
          <Icon name="clock" />
          <span>Собираем первые объявления — это займёт несколько минут</span>
        </div>
      ) : collector && collector.alive ? (
        <div className="collector-ok">
          <Icon name="check" />
          <span>
            Сборщик на связи{collector.minutes === 0 ? ' только что' : ` ${collector.minutes} мин назад`}
            {' '}— ждём подходящие объявления
          </span>
        </div>
      ) : null}

      <div className="form-stack">
        <input className="text-input glass-card" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Что искать — например «iphone 13»" />
        <div className="grid-two">
          <input className="text-input glass-card" value={city}
            onChange={(e) => setCity(e.target.value)} placeholder="Город" list="hunt-cities" />
          <input className="text-input glass-card" value={maxPrice} inputMode="numeric"
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Не дороже, ₽" />
        </div>
        <datalist id="hunt-cities">
          {cities.map((c) => <option key={c.value} value={c.label} />)}
        </datalist>

        <div className="field-label-row">Что присылать</div>
        <div className="segmented">
          <button type="button" className={mode === 'any' ? 'is-active' : ''}
            onClick={() => setMode('any')}>Любые подходящие</button>
          <button type="button" className={mode === 'deal' ? 'is-active' : ''}
            onClick={() => setMode('deal')}>Только выгодные</button>
        </div>
        {mode === 'any' ? (
          <p className="sub-copy">
            Пришлём сразу, как только появится подходящее — ждать статистики не нужно.
            Когда наберётся достаточно объявлений, начнём отсеивать дорогое.
          </p>
        ) : (
          <>
            <div className="field-label-row">Присылать, если дешевле обычного на</div>
            <div className="auction-sort">
              {[10, 15, 25].map((d) => (
                <button key={d} type="button" className={minDiscount === d ? 'is-active' : ''}
                  onClick={() => setMinDiscount(d)}>−{d}%</button>
              ))}
            </div>
          </>
        )}

        {error ? <div className="status-line error">{error}</div> : null}
        <button type="button" className="cta-primary" disabled={busy} onClick={add}>
          {busy ? 'Добавляем…' : 'Ловить это'}
        </button>
      </div>

      <div className="section-head"><strong>Мои критерии</strong><span>{items.length}</span></div>
      {loading ? <div className="muted-line">Загружаем…</div> : null}
      {!loading && !items.length ? (
        <EmptyBlock text="Пока ничего не ловим. Добавьте первый критерий — поле выше." />
      ) : null}
      <div className="list-stack">
        {items.map((c) => (
          <div key={c.id} className="setting-row glass-card">
            <div className="hunt-row">
              <strong>{c.query}{c.city ? ` · ${c.city}` : ''}</strong>
              <span>
                {c.mode === 'deal' ? 'только выгоднее рынка' : 'любые подходящие'}
                {' · '}
                {c.ready
                  ? `обычная цена ${Number(c.median_price).toLocaleString('ru-RU')} ₽ (${c.sample_size} шт)`
                  : `собираем статистику: ${c.sample_size} из 5`}
                {c.max_price ? ` · не дороже ${Number(c.max_price).toLocaleString('ru-RU')} ₽` : ''}
              </span>
            </div>
            <button type="button" className="ghost-btn" onClick={() => remove(c.id)}>Убрать</button>
          </div>
        ))}
      </div>
    </Screen>
  )
}

/* Находки агрегатора: то, что заметно дешевле медианы по категории.
 * Порядок задаёт сервер — по убыванию выгоды. */
function FindingsView() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [minDiscount, setMinDiscount] = useState(15)
  const [needCriteria, setNeedCriteria] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getFindings({ minDiscount, limit: 40 })
      setItems(data.items || [])
      setNeedCriteria(Boolean(data.need_criteria))
    } catch {
      setError('Не удалось загрузить находки.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDiscount])

  return (
    <>

      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {loading ? <div className="muted-line">Ищем выгодные предложения…</div> : null}
      {!loading && !error && !items.length ? (
        needCriteria ? (
          <EmptyBlock text="Сначала скажите, что искать — нажмите «Что ловить?» выше. Тогда здесь появятся свежие объявления дешевле рынка." />
        ) : (
          <EmptyBlock text="По вашим критериям пока ничего не нашлось. Сборщик ищет новые объявления каждые 15 минут — загляните позже." />
        )
      ) : null}
      <div className="grid-two">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)}
            onToggleFavorite={toggleFavorite} />
        ))}
      </div>
    </>
  )
}

/* Содержимое аукционов без обёртки экрана: показывается переключателем
 * в ленте, поэтому Screen и TopBar здесь не нужны. */
function AuctionsView() {
  const [tab, setTab] = useState('lots')
  const [items, setItems] = useState([])
  const [myBids, setMyBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sort, setSort] = useState('ending')
  const [bidItem, setBidItem] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [lots, bids] = await Promise.all([
        api.getAuctions(sort),
        api.getMyBids().catch(() => ({ items: [] })),
      ])
      setItems(lots.items || [])
      setMyBids(bids.items || [])
    } catch {
      setError('Не удалось загрузить аукционы.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  const onBidDone = (data) => {
    if (!data?.ad) { load(); return }
    setItems((prev) => prev.map((x) => (x.id === data.ad.id ? data.ad : x)))
    if (data.ad.time_left <= 0) load()
  }

  return (
    <>
      <div className="segmented">
        <button type="button" className={tab === 'lots' ? 'is-active' : ''} onClick={() => setTab('lots')}>
          Лоты
        </button>
        <button type="button" className={tab === 'bids' ? 'is-active' : ''} onClick={() => setTab('bids')}>
          Мои ставки{myBids.length ? ` · ${myBids.length}` : ''}
        </button>
      </div>

      {tab === 'lots' ? (
        <>
          <div className="auction-sort">
            <button type="button" className={sort === 'ending' ? 'is-active' : ''} onClick={() => setSort('ending')}>
              Скоро закончатся
            </button>
            <button type="button" className={sort === 'new' ? 'is-active' : ''} onClick={() => setSort('new')}>
              Новые
            </button>
          </div>
          {error ? <ErrorBlock text={error} onRetry={load} /> : null}
          {loading ? <div className="muted-line">Загружаем лоты…</div> : null}
          {!loading && !error && !items.length ? (
            <EmptyBlock text="Активных лотов пока нет. Выставьте первый — переключатель «Аукцион» в форме объявления." />
          ) : null}
          <div className="list-stack">
            {items.map((item) => <AuctionCard key={item.id} item={item} onBid={setBidItem} />)}
          </div>
        </>
      ) : (
        <>
          {!myBids.length ? <EmptyBlock text="Вы ещё не делали ставок." /> : null}
          <div className="list-stack">
            {myBids.map((b) => {
              const state = BID_STATE_LABELS[b.state] || BID_STATE_LABELS.lost
              return (
                <Link to={`/listing/${b.ad_id}`} key={`${b.ad_id}-${b.created_at}`} className="mybid-row glass-card">
                  <div className="mybid-thumb"><MediaPlaceholder imageUrl={b.photo} /></div>
                  <div className="mybid-body">
                    <strong>{b.title}</strong>
                    <span className="mybid-amount">Моя ставка {Number(b.amount).toLocaleString('ru-RU')} ₽</span>
                    <span className={`mybid-state ${state.tone}`}>{state.text}</span>
                  </div>
                  {b.ends_at ? <Countdown seconds={b.time_left} className="auction-timer" /> : null}
                </Link>
              )
            })}
          </div>
        </>
      )}

      {bidItem ? (
        <BidSheet item={bidItem} onClose={() => setBidItem(null)} onDone={onBidDone} />
      ) : null}
    </>
  )
}

/* Экран создания истории: фото или видео на 24 часа, с пре-модерацией */
function StoryCreatePage() {
  const navigate = useNavigate()
  const { profile } = useApp()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [isVideo, setIsVideo] = useState(false)
  const [caption, setCaption] = useState('')
  const [captionFocused, setCaptionFocused] = useState(false)
  const [ads, setAds] = useState([])
  const [adId, setAdId] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [prepared, setPrepared] = useState(null)
  const [preparedSize, setPreparedSize] = useState(0)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    api.getMyListings()
      .then((data) => {
        const list = (data.items || data.ads || []).filter((a) => a.status === 'active')
        setAds(list.slice(0, 20))
      })
      .catch(() => setAds([]))
  }, [])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  /* Готовим файл сразу при выборе: сжимаем фото и показываем РЕАЛЬНЫЙ размер.
   * Раньше про лимит узнавали только после неудачной отправки. */
  const pick = async (event) => {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    const video = chosen.type.startsWith('video/')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(chosen))
    setIsVideo(video)
    setFile(chosen)
    setPrepared(null)
    setPreparedSize(0)
    setError('')
    setPreparing(true)
    try {
      const ready = await prepareUpload(chosen)
      setPrepared(ready)
      setPreparedSize(ready.size)
    } catch (err) {
      // Показываем реальный вес исходника. Если дело только в размере,
      // отдельную ошибку не выводим — строка размера уже всё объясняет.
      setPreparedSize(chosen.size)
      if (err?.status !== 413) setError(uploadErrorText(err))
    } finally {
      setPreparing(false)
    }
  }

  /* Уводим в бота за видео: Mini App не может открыть чат сама, только
   * по ссылке t.me. Бот по ?start=story сразу попросит прислать видео. */
  const openBotForVideo = () => {
    const name = profile?.bot_username || ''
    const url = name ? `https://t.me/${name}?start=story` : 'https://t.me'
    const tg = window.Telegram?.WebApp
    if (tg?.openTelegramLink) tg.openTelegramLink(url)
    else window.open(url, '_blank')
  }

  const submit = async () => {
    if (!file) { setError('Сначала выберите фото или видео.'); return }
    setBusy(true)
    setError('')
    try {
      const payload = prepared || await prepareUpload(file)
      await api.createStory(payload, { caption: caption.trim(), adId: adId || null })
      setSent(true)
    } catch (err) {
      setError(uploadErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <Screen>
        <TopBar left={<IconButton icon="back" to="/" />} />
        <div className="story-sent glass-card">
          <div className="story-sent-icon"><Icon name="clock" /></div>
          <strong>История отправлена на проверку</strong>
          <p>Она появится в ленте на 24 часа после одобрения. Мы сообщим в чате с ботом.</p>
          <button type="button" className="cta-primary" onClick={() => navigate('/')}>Вернуться в ленту</button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} />
      <div className="page-title">Новая история</div>

      <label className={`story-drop ${preview ? 'has-preview' : ''}`}>
        {preview ? (
          isVideo
            ? <video className="story-drop-media" src={preview} muted playsInline />
            : <img className="story-drop-media" src={preview} alt="" />
        ) : (
          <div className="story-drop-empty">
            <div className="story-drop-icon"><Icon name="image" /></div>
            <strong>Выберите фото или видео</strong>
            <span>Фото сожмём автоматически, видео — до {UPLOAD_LIMIT_MB} МБ</span>
          </div>
        )}
        <input type="file" accept="image/*,video/*" onChange={pick} hidden />
      </label>

      {preview ? (
        <label className="story-replace">
          Заменить
          <input type="file" accept="image/*,video/*" onChange={pick} hidden />
        </label>
      ) : null}

      <div className="form-stack">
        <div className="field-wrap">
          <input
            className="text-input glass-card"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 200))}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => setCaptionFocused(false)}
            placeholder="Подпись (необязательно)"
          />
          <FieldHint text="Например: сегодня скидка" visible={captionFocused} />
        </div>

        {ads.length ? (
          <select className="text-input glass-card" value={adId} onChange={(e) => setAdId(e.target.value)}>
            <option value="">Привязать к объявлению (необязательно)</option>
            {ads.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        ) : null}
      </div>

      {file ? (
        <div className={`story-size ${preparedSize > UPLOAD_LIMIT_BYTES ? 'is-bad' : ''}`}>
          {preparing
            ? 'Готовим файл…'
            : preparedSize > UPLOAD_LIMIT_BYTES
              ? `Не проходит: ${formatSize(preparedSize)} при лимите ${UPLOAD_LIMIT_MB} МБ — нужен файл меньше`
              : preparedSize
                ? `К отправке ${formatSize(preparedSize)}${isVideo ? '' : ' после сжатия'}`
                : ''}
        </div>
      ) : null}

      {/* Видео через бота: в Mini App пролезает только ~9 МБ, а ролик
          с телефона весит в разы больше. Ведём в бота сами, чтобы
          человеку не пришлось искать кнопку в меню. */}
      {isVideo ? (
        <div className="story-bot-card">
          <div className="story-bot-head">
            <span className="story-bot-icon"><Icon name="send" /></span>
            <div>
              <strong>Видео лучше отправить боту</strong>
              <span>
                Сюда проходит только видео до {UPLOAD_LIMIT_MB} МБ — это несколько секунд.
                Через бота можно любое: он откроется и сразу попросит ролик.
              </span>
            </div>
          </div>
          <button type="button" className="cta-primary" onClick={openBotForVideo}>
            Отправить видео боту
          </button>
        </div>
      ) : null}

      {error ? <div className="status-line error">{error}</div> : null}

      <button type="button" className="cta-primary"
        disabled={busy || preparing || !file || preparedSize > UPLOAD_LIMIT_BYTES} onClick={submit}>
        {busy ? 'Отправляем…' : preparing ? 'Готовим…' : 'Отправить на проверку'}
      </button>
      <p className="story-hint">История живёт 24 часа и видна всем в разделе «Истории продавцов».</p>
    </Screen>
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
  // Объявления или аукционы. Раньше аукционы жили отдельной вкладкой в доке,
  // но с шестью пунктами док переставал помещаться — перенесли сюда.
  const [feedTab, setFeedTab] = useState('deals')
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
      <div className="segmented feed-switch">
        <button type="button" className={feedTab === 'deals' ? 'is-active' : ''}
          onClick={() => setFeedTab('deals')}>Находки</button>
        <button type="button" className={feedTab === 'ads' ? 'is-active' : ''}
          onClick={() => setFeedTab('ads')}>Барахолка</button>
      </div>
      {feedTab === 'deals' ? (
        <>
          <Link to="/hunt" className="hunt-cta">
            <span className="hunt-cta-icon"><Icon name="search" /></span>
            <span className="hunt-cta-text">
              <strong>Что ловить?</strong>
              <span>Настроим поиск дешёвых лотов под вас</span>
            </span>
            <span className="hunt-cta-arrow"><Icon name="back" /></span>
          </Link>
          <FindingsView />
        </>
      )
        : (
        <>
      {/* Доска: здесь перекупы выставляют то, что поймали дешёвым */}
      <div className="board-note">
        <strong>Барахолка перекупов</strong>
        <span>
          Сюда выставляют товары, которые нашли дешевле рынка. Купили дёшево —
          продайте здесь дороже. Находки с Авито живут в соседнем разделе.
        </span>
        <Link to="/create" className="cta-primary">Выставить товар</Link>
      </div>
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
        </>
      )}
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
  const [bidOpen, setBidOpen] = useState(false)
  const [bidsOpen, setBidsOpen] = useState(false)
  const [bidList, setBidList] = useState([])
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
  const isAuction = item?.sale_type === 'auction'
  // Лот с Авито: для него интерфейс другой — это чужая находка,
  // а не объявление пользователя. Доски это не касается.
  // item приходит null, пока объявление грузится — без ?. страница падала
  // с «null is not an object (evaluating 'a.source_url')»
  const isFinding = Boolean(item?.source_url)

  const loadBids = async () => {
    try {
      const data = await api.getBids(listingId)
      setBidList(data.items || [])
    } catch {
      setBidList([])
    }
  }

  const handleBuyNow = async () => {
    const price = Number(item?.buy_now_price || 0)
    if (!window.confirm(`Выкупить лот сразу за ${price.toLocaleString('ru-RU')} ₽?`)) return
    setActionLoading('buy')
    try {
      const data = await api.buyNow(listingId)
      setItem(data.ad)
      setError('')
    } catch (err) {
      const code = err?.detail || err?.message
      setError(code === 'own_lot' ? 'Это ваш собственный лот.' : 'Не удалось выкупить лот.')
    } finally {
      setActionLoading('')
    }
  }

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
        <div className={`hero-pins ${isFinding ? 'is-hidden' : ''}`} aria-hidden="true">
          <div className="hero-pin" style={{ top: '11%' }}>
            <span className="hero-pin-anchor" />
            <span className="hero-pin-pill">
              <span className="hero-pin-label">{isAuction ? 'Ставка' : 'Цена'}</span>
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
        {!isFinding ? (
          <div className="eyebrow">{item.category || 'Объявление'}</div>
        ) : null}
        <div className="listing-title">{item.title}</div>
        {item.seller?.rating ? (
          <div className="rating-row">
            <Icon name="star" />
            {Number(item.seller.rating).toFixed(1)}
            <span>· {item.seller.reviews_count} отзывов</span>
          </div>
        ) : null}
      </div>

      {/* Аукционный блок — сразу под заголовком: здесь важнее всего
          текущая ставка и сколько осталось времени */}
      {isAuction ? (
        <div className="auction-panel glass-card">
          <div className="auction-panel-top">
            <div className="auction-panel-main">
              <span className="auction-panel-label">
                {item.bids_count ? 'Текущая ставка' : 'Стартовая цена'}
              </span>
              <strong className="auction-panel-price">
                {Number(item.bids_count ? item.current_bid : item.start_price || 0).toLocaleString('ru-RU')} ₽
              </strong>
              <span className="auction-panel-sub">
                {item.bids_count
                  ? `${item.bids_count} ${item.bids_count === 1 ? 'ставка' : item.bids_count < 5 ? 'ставки' : 'ставок'} · шаг ${Number(item.bid_step || 0).toLocaleString('ru-RU')} ₽`
                  : `шаг ${Number(item.bid_step || 0).toLocaleString('ru-RU')} ₽`}
              </span>
            </div>
            <div className="auction-panel-timer">
              <span className="auction-panel-label">{item.time_left > 0 ? 'До конца' : 'Статус'}</span>
              <Countdown seconds={item.time_left} className="auction-timer big"
                doneText={item.winner_id ? 'Завершён' : 'Без ставок'} />
            </div>
          </div>

          {item.buy_now_price && item.time_left > 0 ? (
            <div className="auction-buynow">
              <Icon name="sparkles" />
              Можно забрать сразу за {Number(item.buy_now_price).toLocaleString('ru-RU')} ₽
            </div>
          ) : null}
          {item.status === 'ended' && item.is_winner ? (
            <div className="auction-result is-ok">
              <Icon name="check" /> Вы выиграли этот лот. Напишите продавцу, чтобы договориться.
            </div>
          ) : null}
          {isOwner && item.bids_count ? (
            <button type="button" className="auction-history-toggle"
              onClick={() => { setBidsOpen((v) => !v); if (!bidsOpen) loadBids() }}>
              {bidsOpen ? 'Скрыть ставки' : `Показать ставки (${item.bids_count})`}
            </button>
          ) : null}
          {bidsOpen ? (
            <div className="auction-history">
              {bidList.length ? bidList.map((b, i) => (
                <div className="auction-history-row" key={`${b.created_at}-${i}`}>
                  <span>{b.is_me ? 'Ваша ставка' : b.name}</span>
                  <b>{Number(b.amount).toLocaleString('ru-RU')} ₽</b>
                </div>
              )) : <div className="muted-line">Ставок пока нет.</div>}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Чипы-характеристики — как Weather / Temp / Event в референсе */}
      <div className="spec-chips">
        {item.condition ? (
          <span className="spec-chip">
            <Icon name="shield" /><span className="spec-chip-label">Состояние</span><span className="spec-chip-value">{item.condition}</span>
          </span>
        ) : null}
        {item.city ? (
          <span className="spec-chip">
            <Icon name="pin" /><span className="spec-chip-label">{isFinding ? 'Объявление с Авито' : 'Город'}</span><span className="spec-chip-value">{item.city}</span>
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
        {!isFinding ? (
          <span className="spec-chip">
            <Icon name="clock" /><span className="spec-chip-label">Просмотры</span><span className="spec-chip-value">{item.views || 0}</span>
          </span>
        ) : null}
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
            {isAuction && item.time_left > 0 ? (
              <button className="cta-primary" type="button" onClick={() => setBidOpen(true)}>
                <Icon name="gavel" />
                Сделать ставку
              </button>
            ) : (
              isFinding ? (
                <button className="cta-primary" type="button"
                  onClick={() => {
                    const tg = window.Telegram?.WebApp
                    if (tg?.openLink) tg.openLink(item.source_url)
                    else window.open(item.source_url, '_blank', 'noopener')
                  }}>
                  <Icon name="send" />
                  Открыть
                </button>
              ) : (
                <button className="cta-primary" type="button" onClick={handleStartChat}>
                  <Icon name="chat" />
                  {chatLoading ? 'Открываем…' : 'Написать'}
                </button>
              )
            )}
            {isAuction && item.time_left > 0 && item.buy_now_price ? (
              <button className="cta-dark" type="button" onClick={handleBuyNow}
                disabled={actionLoading === 'buy'}>
                {actionLoading === 'buy' ? '…' : 'Купить'}
              </button>
            ) : null}
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
            {isAuction && item.time_left > 0 ? (
              <button className="cta-round" type="button" onClick={handleStartChat}
                aria-label="Написать продавцу">
                <Icon name="chat" />
              </button>
            ) : null}
          </>
        )}
      </div>
      {!isFinding ? (
      <div className="seller-card glass-card mt-12">
        <div className="avatar" />
        <div className="seller-meta">
          <strong>{item.seller?.name || 'Продавец'}</strong>
          <span>{item.seller?.verified ? 'Проверен' : 'Профиль продавца'} · {item.favorites_count || 0} в избранном</span>
        </div>
      </div>
      ) : null}
      {isOwner ? (
        <div className="setting-row glass-card mt-12">
          <span>Статус: {STATUS_LABELS[item.status] || item.status}</span>
        </div>
      ) : null}
      {bidOpen && isAuction ? (
        <BidSheet
          item={item}
          onClose={() => setBidOpen(false)}
          onDone={(data) => { if (data?.ad) setItem(data.ad) }}
        />
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
    // Аукцион: по умолчанию обычная продажа
    saleType: initial?.sale_type === 'auction' ? 'auction' : 'sale',
    startPrice: initial?.start_price != null ? String(initial.start_price) : '',
    bidStep: initial?.bid_step != null ? String(initial.bid_step) : '',
    buyNowPrice: initial?.buy_now_price != null ? String(initial.buy_now_price) : '',
    auctionDays: initial?.auction_days || 3,
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
    form.step === 4 ? (form.saleType === 'auction'
      ? form.startPrice && form.city.trim()
      : form.price && form.city.trim()) :
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
          {/* Режим продажи: обычная цена или аукцион. Аукцион — то же
              объявление, просто с торгами, поэтому переключатель здесь. */}
          <div className="segmented">
            <button type="button" className={form.saleType !== 'auction' ? 'is-active' : ''}
              onClick={() => update('saleType', 'sale')}>Продажа</button>
            <button type="button" className={form.saleType === 'auction' ? 'is-active' : ''}
              onClick={() => update('saleType', 'auction')}>Аукцион</button>
          </div>

          {form.saleType === 'auction' ? (
            <>
              <div className="field-wrap">
                <input className="text-input glass-card" value={form.startPrice} inputMode="numeric"
                  onChange={(e) => update('startPrice', e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocusedField('start')} onBlur={() => setFocusedField('')}
                  placeholder="Стартовая цена, ₽" />
                <FieldHint text="Первая ставка не может быть ниже" visible={focusedField === 'start'} />
              </div>
              <div className="field-wrap">
                <input className="text-input glass-card" value={form.bidStep} inputMode="numeric"
                  onChange={(e) => update('bidStep', e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocusedField('step')} onBlur={() => setFocusedField('')}
                  placeholder="Шаг ставки, ₽ (необязательно)" />
                <FieldHint text="Если пусто — 5% от стартовой" visible={focusedField === 'step'} />
              </div>
              <div className="field-wrap">
                <input className="text-input glass-card" value={form.buyNowPrice} inputMode="numeric"
                  onChange={(e) => update('buyNowPrice', e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={() => setFocusedField('buynow')} onBlur={() => setFocusedField('')}
                  placeholder="Купить сразу, ₽ (необязательно)" />
                <FieldHint text="Цена, по которой лот заберут немедленно" visible={focusedField === 'buynow'} />
              </div>
              <div className="field-label-row">Срок торгов</div>
              <div className="auction-sort">
                {[1, 3, 7].map((d) => (
                  <button key={d} type="button" className={form.auctionDays === d ? 'is-active' : ''}
                    onClick={() => update('auctionDays', d)}>
                    {d === 1 ? '1 день' : `${d} дня`.replace('7 дня', '7 дней')}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="field-wrap">
              <input className="text-input glass-card" value={form.price} inputMode="numeric" onChange={(e) => update('price', e.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setFocusedField('price')} onBlur={() => setFocusedField('')} placeholder="Цена, ₽" />
              <FieldHint text="Укажите цену в рублях" visible={focusedField === 'price'} />
            </div>
          )}

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
              <div className="product-price">
                {form.saleType === 'auction'
                  ? `от ${form.startPrice || 0} ₽ · аукцион`
                  : `${form.price} ₽`}
              </div>
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
      // Аукционные поля уходят в snake_case: бэкенд ждёт именно такие имена
      const payload = {
        ...form,
        sale_type: form.saleType === 'auction' ? 'auction' : 'sale',
        start_price: form.startPrice,
        bid_step: form.bidStep,
        buy_now_price: form.buyNowPrice,
        auction_days: form.auctionDays,
      }
      const response = await api.createListing(payload)
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
      // Та же причина, что и в историях: сырое фото с телефона не проходит
      // по лимиту тела запроса, поэтому сжимаем перед отправкой
      const payload = await prepareUpload(file)
      const data = await api.sendChatMedia(chatId, payload)
      if (data.message) setMessages((prev) => [...prev, data.message])
    } catch (err) {
      setError(uploadErrorText(err))
    } finally {
      setMediaBusy(false)
    }
  }

  const handleAttach = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > UPLOAD_LIMIT_BYTES && !String(file.type || '').startsWith('image/')) {
      // Чат не может переслать через бота: он доставляет только истории,
      // поэтому честно объясняем предел и что делать
      setError(`Видео ${formatSize(file.size)} не проходит: платформа принимает `
        + `загрузки до ${UPLOAD_LIMIT_MB} МБ. Отправьте ролик покороче — примерно до 10 секунд.`)
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
        <Route path="/story/new" element={<StoryCreatePage />} />
        <Route path="/edit/:id" element={<EditAdPage />} />
        <Route path="/my" element={<MyAdsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/hunt" element={<CriteriaPage />} />
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
  // Пять ОДНОРОДНЫХ пунктов, как в Avito: раньше было четыре подписанных
  // плюс кнопка и отдельный градиентный аватар — вместе шесть элементов,
  // и док выглядел перегруженным. Поиск убран: он и так крупным полем
  // в ленте. Профиль стал обычным пунктом вместо «пузыря».
  const items = [
    { icon: 'home', to: '/', label: 'Главная' },
    { icon: 'bookmark', to: '/favorites', label: 'Избранное' },
    { icon: 'chat', to: '/chats', label: 'Сообщения' },
    { icon: 'user', to: '/profile', label: 'Профиль' },
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


