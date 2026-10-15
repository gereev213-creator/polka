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
import HuntChat from './HuntChat'
import { api, resolveAssetUrl, openInvoice, cacheGet, cacheSet, friendlyError, onResume } from './api'

import { Skeleton } from './components/Skeleton'
import { EmptyState } from './components/EmptyState'
import { ErrorState } from './components/ErrorState'
// Сегмент-переключатель из дизайн-системы: та же разметка .segmented,
// но с ролью tablist и одним источником стилей (этап 1).
import { SegmentedControl } from './components/SegmentedControl'
// Общие компоненты дизайн-системы: подключаются на экранах поиска лотов
// (этап 3b) вместо самодельных чипов и кнопок legacy-разметки.
import { Button } from './components/Button'
import { Card } from './components/Card'
import { Chip } from './components/Chip'
import { Badge } from './components/Badge'
import { CriteriaList } from './components/CriteriaList'
import { ListRow } from './components/ListRow'
import { Input } from './components/Input'

import { Icon } from './components/Icon'
import { IconButton } from './components/IconButton'
import { Avatar } from './components/Avatar'
import { TopBar } from './components/TopBar'
import { BottomNav } from './components/BottomNav'

const AppContext = createContext(null)




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



function Logo() {
  return <img className="brand-logo" src="/polka-logo.png" alt="ПОЛКА" />
}

function Screen({ children, padded = true, className = '' }) {
  return <div className={`screen ${padded ? 'padded' : ''} ${className}`.trim()}>{children}</div>
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

/* Разделитель дня в переписке: «Сегодня», «Вчера», иначе «11 окт».
 * Раньше дата стояла в каждом пузыре и повторялась у всех сообщений подряд. */
function dayLabel(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((midnight(now) - midnight(d)) / 86400000)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/* Ключ дня для сравнения соседних сообщений (ISO «2026-10-02T11:20»). */
const dayKey = (raw) => String(raw || '').slice(0, 10)

/* Время внутри пузыря: только часы и минуты — дата теперь в разделителе. */
function timeOnly(raw) {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* Имя собеседника: бэкенд иногда отдаёт «0» вместо анонима — тогда
 * «Пользователь», иначе в списке чатов показывалось имя «0». */
function chatName(chat) {
  const raw = String(chat?.user || '').trim()
  return raw && raw !== '0' ? raw : 'Пользователь'
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
            и открывает ленту, а не «свежесть публикации». Подозрительно
            дешёвые лоты (скидка больше 70%: рассрочка, залог, не тот товар)
            бейджа «ниже рынка» НЕ получают — иначе человек идёт по ложному
            следу. Показываем честную серую пометку (этап D3). */}
        {Number(item.price_suspect) ? (
          <span className="deal-badge is-suspect">цена подозрительная</span>
        ) : Number(item.discount_percent) >= 15 ? (
          <span className="deal-badge">ниже рынка</span>
        ) : null}
        <button className={`save-btn ${favorite ? 'is-on' : ''}`} type="button" onClick={handleFavorite}
          aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}>
          <Icon name="heart" />
        </button>
        {/* Кнопка перехода к лоту живёт на фото, а не в нижней строке: раньше
            она была абсолютной в правом нижнем углу карточки, наезжала на
            подпись выгоды и заставляла обрезать её («дешевле н…»). */}
        {item.source_url ? (
          /* Находка с Авито: понятная стрелка «открыть на сайте» вместо
             чёрного «самолётика» — тот же переход, но читаемый. */
          <button className="product-action" type="button"
            aria-label="Открыть объявление на Авито"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const tg = window.Telegram?.WebApp
              if (tg?.openLink) tg.openLink(item.source_url)
              else window.open(item.source_url, '_blank', 'noopener')
            }}>
            <Icon name="arrowUpRight" />
          </button>
        ) : (
          <button className="product-action" type="button"
            aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={handleFavorite}>
            <Icon name="chat" />
          </button>
        )}
      </div>
      <div className="product-info">
        {item.ai_verdict ? (
          <div className="verdict-line">{item.ai_verdict}</div>
        ) : null}
        <div className="product-title">{item.title}</div>
        <div className="product-city">
          {/* Разделитель только между двумя непустыми частями: при пустом
              городе оставался висящий «· только что» — баг из ТЗ этапа 2. */}
          {item.city}
          {item.city ? ' · ' : ''}
          {Number(item.published_hours_ago) > 0
            ? (Number(item.published_hours_ago) < 24
              ? `${Math.round(Number(item.published_hours_ago))} ч назад`
              : `${Math.round(Number(item.published_hours_ago) / 24)} дн назад`)
            : 'только что'}
        </div>
        <div className="product-bottom">
          <div className="product-price">{priceText(item)}</div>
          {Number(item.discount_percent) >= 15 ? (
            <div className="product-deal">дешевле на {Math.round(item.discount_percent)}%</div>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

function LoadingBlock({ text = 'Загрузка…' }) {
  return <Skeleton text={text} />
}

function ErrorBlock({ text = 'Не удалось загрузить данные.', onRetry }) {
  return <ErrorState text={text} onRetry={onRetry} />
}

// Пустое состояние по ТЗ 5.5: иконка 28 px, текст 17/22, воздуха 32/24.
// Было просто карточкой с текстом — без иконки и без объяснения, что тут
// появится, поэтому выглядело как заглушка.
function EmptyBlock({ text = 'Здесь пока пусто' }) {
  return <EmptyState text={text} icon={<Icon name="search" />} />
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


/* «Поиск лотов» — критерии, по которым бот ищет дешёвое на Авито.
 * Раньше их можно было задать ТОЛЬКО командой /hunt в боте: в приложении
 * входа не было вовсе, поэтому человек его и не находил. */
function CriteriaPage() {
  const [items, setItems] = useState([])
  // Готовые шаблоны: условия под частые покупки с уже правильной категорией
  // и требованиями — человек выбирает, а не пишет словами
  const [templates, setTemplates] = useState([])
  const [tplGroup, setTplGroup] = useState('')
  const [tplMsg, setTplMsg] = useState('')
  const [cities, setCities] = useState([])
  const [query, setQuery] = useState('')
  // Категория для ручного поиска: сужает выдачу на самом Авито
  const [huntCategory, setHuntCategory] = useState('')
  // Состояние товара — как фильтр на Авито: новое или б/у
  const [huntCondition, setHuntCondition] = useState('')
  // Оригинал или реплика — важно во всех категориях, не только в одежде
  const [huntOriginal, setHuntOriginal] = useState('')
  // Магазин или частник: люди хотят объявления с рук, а не из магазина.
  // Магазины пишут себя латиницей (shop, store, opt), их и отсеиваем.
  const [huntSeller, setHuntSeller] = useState('')
  // Требования словами — то же, что ИИ пишет в критерий: «размер 43»,
  // «АКБ от 85%», «не вскрывался». Скрипт разбирает их и отсеивает.
  const [huntNotes, setHuntNotes] = useState('')
  // Свои исключения и строгая модель — универсальные поля любого критерия
  const [huntExclude, setHuntExclude] = useState('')
  const [huntStrict, setHuntStrict] = useState(false)
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  // Фильтры перекупа: свой диапазон цены, свежесть и наличие фото.
  // Свежесть — главное: перекуп звонит первым, пока товар не ушёл.
  // Какой раздел фильтров раскрыт. Свёрнутые фильтры продолжают работать:
  // их значения хранятся в состоянии, а не в разметке.
  const [openSec, setOpenSec] = useState('')
  const toggleSec = (name) => setOpenSec(openSec === name ? '' : name)

  const [minPrice, setMinPrice] = useState('')
  const [maxHours, setMaxHours] = useState(0)
  const [withPhoto, setWithPhoto] = useState(false)
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

  // Готовые шаблоны грузим отдельно и тихо: если эндпоинт недоступен,
  // форма всё равно работает — человек просто введёт условия сам
  const loadTemplates = () => {
    api.getTemplates()
      .then((d) => setTemplates(d.items || []))
      .catch(() => setTemplates([]))
  }

  const applyTemplate = async (slug) => {
    setTplMsg('')
    setBusy(true)
    try {
      const r = await api.useTemplate(slug)
      setTplMsg(r.ok ? `Критерий «${r.title}» создан` : 'Не получилось')
      await load()
    } catch (e) {
      if (e && (e.code === 'limit_reached' || e.status === 402)) {
        setTplMsg((e && e.detail) || 'Достигнут лимит критериев')
      } else if (e && e.code === 'duplicate') {
        setTplMsg('Такой критерий уже есть')
      } else {
        setTplMsg((e && e.detail) || 'Не удалось создать критерий')
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadTemplates()
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
        category: huntCategory || '',
        condition: huntCondition || '',
        // Требования словами: скрипт разбирает их и отсеивает реплики
        // и магазины. Работает по всем категориям.
        requirements: [
          huntOriginal === 'original' ? 'только оригинал' : '',
          huntOriginal === 'replica' ? 'можно реплику' : '',
          huntSeller === 'private' ? 'не магазин, только с рук' : '',
          huntNotes.trim(),
        ].filter(Boolean).join(', '),
        min_price: Number(minPrice) || 0,
        max_hours: Number(maxHours) || 0,
        with_photo: withPhoto ? 1 : 0,
        min_discount: mode === 'deal' ? minDiscount : 0,
        mode,
        exclude: huntExclude.trim(),
        strict_model: huntStrict ? 1 : 0,
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
    <Screen className="hunt-screen">
      <TopBar left={<IconButton icon="back" to="/" label="Назад" />} />
      <div className="page-title">Поиск лотов</div>
      {/* Те же вкладки, что в чате: переключение между способами не теряется */}
      <div className="chat-tabs is-second">
        {/* Такая же плашка, но активна правая вкладка — въезжает слева */}
        <span className="chat-tabs-pill" aria-hidden="true" />
        <button type="button" className="chat-tab"
          onClick={() => { window.location.hash = '#/hunt' }}>ИИ-поиск</button>
        <button type="button" className="chat-tab is-active">Вручную</button>
      </div>

      <p className="sub-copy">
        Напишите, что искать на Авито — бот пришлёт подходящие объявления.</p>

      {/* Фильтры ниже пояснения: сначала человек читает, потом настраивает.
          Плашки — общий Chip из дизайн-системы: один компонент на все фильтры. */}
      <div className="field-label-row">Категория</div>
      <div className="chip-row">
        {['', 'Электроника', 'Одежда, обувь, аксессуары', 'Транспорт', 'Недвижимость', 'Другое'].map((cat) => (
          <Chip key={cat || 'all'} active={huntCategory === cat}
            onClick={() => setHuntCategory(cat)}>
            {cat || 'любая'}
          </Chip>
        ))}
      </div>

      <div className="field-label-row">Состояние</div>
      <div className="chip-row">
        {[['', 'любое'], ['new', 'только новое'], ['used', 'только б/у']].map(([val, label]) => (
          <Chip key={val || 'any'} active={huntCondition === val}
            onClick={() => setHuntCondition(val)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="field-label-row">Товар</div>
      <div className="chip-row">
        {[['', 'не важно'], ['original', 'только оригинал'], ['replica', 'можно реплику']].map(([val, label]) => (
          <Chip key={val || 'any'} active={huntOriginal === val}
            onClick={() => setHuntOriginal(val)}>
            {label}
          </Chip>
        ))}
      </div>

      <p className="hint-note">
        Подлинность не проверяется: убираем только те объявления, где продавец сам
        написал «реплика», «копия», «1:1», «люкс». Если он молчит — объявление пройдёт,
        даже если это копия. Смотрите фото и цену.
      </p>

      <div className="field-label-row">Продавец</div>
      <div className="chip-row">
        {[['', 'любой'], ['private', 'только частники']].map(([val, label]) => (
          <Chip key={val || 'any'} active={huntSeller === val}
            onClick={() => setHuntSeller(val)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="field-label-row">Требования словами</div>
      <Input
        value={huntNotes}
        onChange={(e) => setHuntNotes(e.target.value)}
        placeholder="размер 43, чёрный, АКБ от 85%, не вскрывался"
      />
      <p className="hint-note">
        Скрипт понимает: «оригинал», «не магазин», «хорошее состояние», «не вскрывался», «только новое»
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
      ) : null}

      <div className="form-stack">
        <Input value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Что искать — например «iphone 13»" />
        {/* Город — на всю ширину строки: раньше он стоял в .grid-two и занимал
            половину ширины без причины. */}
        <Input value={city}
          onChange={(e) => setCity(e.target.value)} placeholder="Город" list="hunt-cities" />
        <datalist id="hunt-cities">
          {cities.map((c) => <option key={c.value} value={c.label} />)}
        </datalist>

        {/* «Цена / Свежесть / Дополнительно» — один и тот же раскрывающийся
            ListRow из дизайн-системы, а не три самодельные строки. Значения
            свёрнутых фильтров видны в заголовке, состояние не теряется. */}
        <div className="hunt-toggles">
          <ListRow
            className={`is-toggle ${openSec === 'price' ? 'is-open' : ''}`}
            left={<Icon name="filter" />}
            title={`Цена, ₽${maxPrice || minPrice
              ? ` · ${minPrice ? 'от ' + Number(minPrice).toLocaleString('ru-RU') + ' ' : ''}${maxPrice ? 'до ' + Number(maxPrice).toLocaleString('ru-RU') + ' ₽' : ''}`
              : ''}`}
            right={<span className="toggle-mark">›</span>}
            onClick={() => toggleSec('price')}
            aria-expanded={openSec === 'price'}
          />
          {openSec === 'price' ? (
            <div className="price-pair">
              <Input type="number" inputMode="numeric" placeholder="от"
                value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
              <Input type="number" inputMode="numeric" placeholder="до"
                value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
          ) : null}

          <ListRow
            className={`is-toggle ${openSec === 'fresh' ? 'is-open' : ''}`}
            left={<Icon name="clock" />}
            title={`Свежесть${maxHours
              ? ` · ${maxHours === 1 ? 'за час' : 'за ' + maxHours + ' ч'}`
              : ' · любая'}`}
            right={<span className="toggle-mark">›</span>}
            onClick={() => toggleSec('fresh')}
            aria-expanded={openSec === 'fresh'}
          />
          {openSec === 'fresh' ? (
            <div className="chip-row">
              {[[0, 'любая'], [1, 'за час'], [3, 'за 3 часа'], [24, 'за сутки']].map(([v, label]) => (
                <Chip key={v} active={maxHours === v} onClick={() => setMaxHours(v)}>{label}</Chip>
              ))}
            </div>
          ) : null}

          <ListRow
            className={`is-toggle ${openSec === 'more' ? 'is-open' : ''}`}
            left={<Icon name="image" />}
            title={`Дополнительно${withPhoto ? ' · с фото' : ''}`}
            right={<span className="toggle-mark">›</span>}
            onClick={() => toggleSec('more')}
            aria-expanded={openSec === 'more'}
          />
          {openSec === 'more' ? (
            <div className="chip-row">
              <Chip active={withPhoto} onClick={() => setWithPhoto(!withPhoto)}>Только с фото</Chip>
            </div>
          ) : null}
        </div>

        
        {/* Режим отбора — общий SegmentedControl (роль tablist) вместо
            самодельных кнопок. Стоит в потоке формы и к доку не прижат. */}
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'any', label: 'Любые подходящие' },
            { value: 'deal', label: 'Только выгодные' },
          ]}
        />
        {mode === 'any' ? (
          <p className="sub-copy">
            Пришлём сразу, как только появится подходящее — ждать статистики не нужно.
            Когда наберётся достаточно объявлений, начнём отсеивать дорогое.
          </p>
        ) : (
          <>
            <div className="field-label-row">Присылать, если дешевле обычного на</div>
            <div className="chip-row">
              {[10, 15, 25].map((d) => (
                <Chip key={d} active={minDiscount === d} onClick={() => setMinDiscount(d)}>−{d}%</Chip>
              ))}
            </div>
          </>
        )}

        {error ? <div className="status-line error">{error}</div> : null}
        <Button variant="primary" wide disabled={busy} onClick={add}>
          {busy ? 'Добавляем…' : 'Найти лоты'}
        </Button>
      </div>

      {/* Готовые шаблоны: одно нажатие вместо набора слов. Категория и
          требования уже правильные, поэтому сборщик ищет в нужном разделе,
          а отбор не врёт (для телефонов сразу проверка АКБ). */}
      {templates.length ? (
        <div className="list-stack mt-14">
          <div className="section-head"><strong>Готовые шаблоны</strong><span>{templates.length}</span></div>
          <div className="chat-replies">
            <button type="button"
              className={tplGroup === '' ? 'chat-chip is-active' : 'chat-chip'}
              onClick={() => setTplGroup('')}>все</button>
            {[...new Set(templates.map((x) => x.group))].map((g) => (
              <button key={g} type="button"
                className={tplGroup === g ? 'chat-chip is-active' : 'chat-chip'}
                onClick={() => setTplGroup(g)}>
                {templates.find((x) => x.group === g)?.group_title || g}
              </button>
            ))}
          </div>
          <div className="chat-replies">
            {templates
              .filter((x) => !tplGroup || x.group === tplGroup)
              .map((x) => (
                <button key={x.slug} type="button" className="chat-chip" disabled={busy}
                  onClick={() => applyTemplate(x.slug)}>
                  {x.title}
                  {x.max_price ? ` · до ${Number(x.max_price).toLocaleString('ru-RU')} ₽` : ''}
                </button>
              ))}
          </div>
          {tplMsg ? <div className="chat-note">{tplMsg}</div> : null}
        </div>
      ) : null}

      {/* Список критериев — общий компонент: та же разметка, что в ИИ-поиске,
          иначе один критерий выглядел на двух вкладках по-разному. */}
      {/* Свои исключения и строгая модель: универсальные поля любого критерия.
          Исключения спасают от «чехол», «копия», «запчасти»; строгая модель —
          от «Pro Max» вместо «Pro». */}
      <div className="glass-card mt-14">
        <div className="plan-name">Чего не присылать</div>
        <div className="plan-desc">слова через запятую: чехол, запчасти, копия</div>
        <input className="text-input mt-8" placeholder="чехол, запчасти"
          value={huntExclude} onChange={(e) => setHuntExclude(e.target.value)} />
        <label className="plan-desc mt-8" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={huntStrict}
            onChange={(e) => setHuntStrict(e.target.checked)} />
          строго эта модель (без «Pro Max» и подобных)
        </label>
      </div>

      <CriteriaList items={items} loading={loading} onRemove={remove} />
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
          <EmptyBlock text="Сначала скажите, что искать — нажмите «Поиск лотов?» выше. Тогда здесь появятся свежие объявления дешевле рынка." />
        ) : (
          <EmptyBlock text="По вашим критериям пока ничего не нашлось. Сборщик ищет новые объявления каждые 15 минут — загляните позже." />
        )
      ) : null}
      <div className="grid-two feed-grid">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)}
            onToggleFavorite={toggleFavorite} />
        ))}
      </div>
    </>
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
  // Три карточки одного вида: раньше они были синей, тёмной и белой без
  // причины. Иконка «Объявления» — ярлык вместо закладки: закладка путала
  // со следующим пунктом меню «Избранное».
  const cards = [
    { key: 'ads', label: 'Объявления', value: profile.active_ads || 0, icon: 'tag', to: '/my' },
    { key: 'mod', label: 'На модерации', value: profile.moderation_ads || 0, icon: 'clock', to: '/my' },
    { key: 'fav', label: 'В избранном', value: profile.favorites || 0, icon: 'heart', to: '/favorites' },
  ]
  return (
    <>
      <div className="stats-head">
        <strong>Моя статистика</strong>
        {caption ? <span>{caption}</span> : null}
      </div>
      <div className="stats-row">
        {cards.map((c) => (
          <Link key={c.key} to={c.to} className="stat-card">
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
  // Вкладку можно открыть ссылкой: из меню бота приходят
  // /#/?tab=board и /#/?tab=findings. Читаем hash напрямую, чтобы
  // не тянуть новый импорт роутера.
  const [feedTab, setFeedTab] = useState(
    (typeof window !== 'undefined' && (window.location.hash || '').includes('tab=board'))
      ? 'ads' : 'deals'
  )
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
  // K6: stale — показываем сохранённую ленту, пока идёт обновление
  const [stale, setStale] = useState(false)

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

  // Этап K6: убран жёсткий Promise.race с 8 с (он показывал «проверь интернет»
  // даже когда виноват медленный сервер). Теперь: таймаут и повторы внутри
  // api.js, а здесь — показ сохранённой ленты и честный текст ошибки.
  const load = async (category, offset, append) => {
    const key = `feed:${category || 'all'}`
    if (append) {
      setLoadingMore(true)
    } else {
      const cached = cacheGet(key)
      if (cached && (cached.items || []).length) {
        setItems(cached.items)
        setHasMore(Boolean(cached.has_more))
        setLoading(false)
        setStale(true)
      } else {
        setLoading(true)
      }
      setError('')
    }
    try {
      const data = await api.getFeed({ category: categoryQuery(category), limit: PAGE, offset })
      setItems((prev) => (append ? [...prev, ...(data.items || [])] : (data.items || [])))
      setHasMore(Boolean(data.has_more))
      setStale(false)
      if (!append) cacheSet(key, { items: data.items || [], has_more: Boolean(data.has_more) })
    } catch (e) {
      if (!append) {
        const cached = cacheGet(key)
        if (cached && (cached.items || []).length) {
          // уже показываем сохранённое — не стираем его из-за сбоя обновления
          setStale(true)
        } else {
          setError(friendlyError(e))
          setItems([])
        }
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

  // K6: возврат в приложение и появление сети — обновляем сами
  useEffect(() => {
    return onResume(() => { load(activeCategory, 0, false) })
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
      // .feed-screen вместо <Screen>: ленте нужен собственный, более широкий
      // контейнер под сетки 3/4–5 колонок (см. styles/pages/feed.css).
      <div className="screen padded feed-screen">
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <div className="feed-skeleton">
          <div className="skeleton-banner" />
          <Skeleton variant="grid" />
        </div>
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="screen padded feed-screen">
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <div className="feed-skeleton">
          <div className="skeleton-banner" />
          <Skeleton variant="grid" />
        </div>
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className="screen padded feed-screen">
        <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
        <ErrorBlock text={error || 'Не удалось загрузить ленту'} onRetry={() => load(activeCategory, 0, false)} />
      </div>
    )
  }

  return (
    <div className="screen padded feed-screen">
      <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
      <SegmentedControl
        className="feed-switch"
        value={feedTab}
        onChange={setFeedTab}
        options={[
          { value: 'deals', label: 'Находки' },
          { value: 'ads', label: 'Барахолка' },
        ]}
      />
      {feedTab === 'deals' ? (
        <>
          <Link to="/hunt" className="hunt-cta">
            <span className="hunt-cta-icon"><Icon name="search" /></span>
            <span className="hunt-cta-text">
              <strong>Поиск лотов?</strong>
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
      {stale && !error ? (
        <div className="chat-note">Показываем сохранённое. Обновляем…</div>
      ) : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Объявлений пока нет." /> : null}
      {/* Одна сетка на всю ленту: раньше её разрезал блок «Последние
          объявления», и вторая половина карточек оставалась двухколоночной
          на любом экране — адаптивные 3/4–5 колонок не работали. */}
      <div className="grid-two feed-grid">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
        ))}
      </div>
      <LastNews items={items} />
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
    </div>
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
      <TopBar left={<IconButton icon="back" to="/" label="Назад" />} right={<IconButton icon="filter" active={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} label="Фильтры" />} />
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
      {!loading && !error && results.length === 0 ? (
        <EmptyState text="Ничего не найдено. Попробуйте изменить запрос." icon={<Icon name="search" />} />
      ) : null}
      {/* Результаты — та же сетка и та же карточка, что на главной: .feed-grid
          даёт колонки 2/3/4–5, а .feed-screen включает стили карточки лота из
          feed.css. Без этой области пришлось бы дублировать ~10 правил, часть
          из которых перебивает legacy только через !important. */}
      <div className="grid-two feed-grid feed-screen">
        {results.map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
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
  const [excludeSuggest, setExcludeSuggest] = useState([])
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
  // Лот с Авито: для него интерфейс другой — это чужая находка,
  // а не объявление пользователя. Доски это не касается.
  // item приходит null, пока объявление грузится — без ?. страница падала
  // с «null is not an object (evaluating 'a.source_url')»
  const isFinding = Boolean(item?.source_url)


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

  /* Цена — крупно и сразу под галереей. Раньше её вообще не было видно:
     значение лежало только в скрытых плашках на фото (.hero-pins.is-hidden),
     а сами плашки закрывали товар и дублировали текст ниже — они убраны. */
  const priceValue = priceText(item)
  const priceLabel = 'Цена'

  return (
    <Screen>
      {/* В шапке остаётся только «назад»: сердечко и шер переехали в липкую
          панель внизу, поэтому кнопкам больше нечего делить по выравниванию. */}
      <TopBar left={<IconButton icon="back" to="/" />} />
      <div className="listing-page">
        <div className="detail-hero">
          {/* Свайпаемая лента фото: нативный горизонтальный скролл + scroll-snap.
              Слайды ровно по ширине экрана, а min-height у .detail-hero держит
              высоту кадра — иначе свайп и подсчёт кадра ломаются. */}
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

        {priceValue ? (
          <div className="detail-price-block">
            <span className="detail-price-label">{priceLabel}</span>
            <div className="detail-price">{priceValue}</div>
          </div>
        ) : null}

        <div className="detail-head">
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

        {/* Пустое описание больше не занимает экран: блока «Без описания» нет */}
        {String(item.description || '').trim() ? (
          <div className="copy-block glass-card mt-12">
            <strong>Описание</strong>
            <p>{item.description}</p>
          </div>
        ) : null}

        {/* Продавец: аватар, имя, статус. Раньше аватар был пустым кружком */}
        {!isFinding ? (
          <div className="seller-card glass-card mt-12">
            <div className="avatar">{(item.seller?.name || 'П')[0]?.toUpperCase()}</div>
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

        {/* «Удалить» — спокойной danger-строкой в конце страницы и только
            у своих лотов: у чужого объявления кнопки удаления нет. */}
        {isOwner ? (
          <button type="button" className="danger-text-btn mt-12" onClick={handleDelete}>
            {actionLoading === 'delete' ? '…' : 'Удалить'}
          </button>
        ) : null}
        {isFinding ? (
          <button type="button" className="danger-text-btn mt-12"
            onClick={async () => {
              try {
                // Сервер подсказывает слово, которого не было в запросе
                // («чехол», «копия»): его можно сразу внести в исключения,
                // чтобы такое больше не приходило.
                const r = await api.hideFinding(item.id)
                const words = (r && r.suggest_exclude) || []
                if (words.length) {
                  setExcludeSuggest(words)
                  return
                }
                window.history.back()
              } catch (e) {
                setError('Не удалось убрать лот')
              }
            }}>Удалить лот из находок</button>
        ) : null}
        {isFinding && excludeSuggest.length ? (
          <button type="button" className="ghost-btn wide mt-8"
            onClick={async () => {
              try {
                await api.hideFinding(item.id, excludeSuggest)
              } catch (e) { /* находка уже скрыта — не мешает */ }
              window.history.back()
            }}>Больше не присылать: {excludeSuggest.join(', ')}</button>
        ) : null}

        {/* Липкая нижняя панель действий: главный сценарий всегда под рукой,
            снизу учтён safe-area. Позиционирование — sticky, поэтому панель
            остаётся в колонке контента и на десктопе, а не растягивается. */}
        <div className="detail-bar">
          {isOwner ? (
            <>
              <Link to={`/edit/${item.id}`} className="cta-primary">
                <Icon name="menu" />
                Редактировать
              </Link>
              {item.status === 'active' ? (
                <button className="cta-round" type="button" onClick={handleSold} aria-label="Отметить проданным">
                  {actionLoading === 'sold' ? '…' : <Icon name="check" />}
                </button>
              ) : null}
              {/* Шер своего лота остаётся доступным: он был в шапке, а шапку
                  мы разгрузили — переносим действие в панель. */}
              <button className="cta-round" type="button" onClick={handleShare} aria-label="Поделиться">
                <Icon name="share" />
              </button>
            </>
          ) : (
            <>
              {isFinding ? (
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
              )}
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
      </div>
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
  // Поля, которых человек уже касался: ошибку показываем только после того,
  // как он ушёл из поля, а не с первого экрана формы (ТЗ этапа 5).
  const [touched, setTouched] = useState({})
  const markTouched = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
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
    form.step === 4 ? Boolean(form.price && form.city.trim()) :
    true

  const nextStep = () => { if (form.step < totalSteps && canNext) update('step', form.step + 1) }
  const prevStep = () => { if (form.step > 1) update('step', form.step - 1) }

  const stepTitles = ['Категория', 'Фото', 'Описание', 'Цена и город', 'Проверка']

  // Почему «Далее» неактивна: причина текстом, а не только погашенной кнопкой.
  const stepProblem =
    form.step === 1 ? (form.category ? '' : 'Выберите категорию товара') :
    form.step === 2 ? (form.photos.length ? '' : 'Добавьте хотя бы одно фото') :
    form.step === 3 ? (
      form.title.trim().length < 3 ? 'Название — не короче трёх символов'
        : (!form.description.trim() ? 'Добавьте описание: состояние, особенности, комплектация' : '')
    ) :
    form.step === 4 ? (
      !form.price ? 'Укажите цену' : (!form.city.trim() ? 'Укажите город' : '')
    ) : ''

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
            <input className={`text-input glass-card ${touched.title && form.title.trim().length < 3 ? 'is-invalid' : ''}`} value={form.title} onChange={(e) => update('title', e.target.value)} onFocus={() => setFocusedField('title')} onBlur={() => { setFocusedField(''); markTouched('title') }} placeholder="Название товара" />
            <FieldHint text="Например: Куртка Zara, размер M" visible={focusedField === 'title'} />
            {touched.title && form.title.trim().length < 3 ? (
              <div className="field-error" role="alert">Название — не короче трёх символов</div>
            ) : null}
          </div>
          <div className="field-wrap">
            <textarea className={`text-area glass-card ${touched.description && !form.description.trim() ? 'is-invalid' : ''}`} value={form.description} onChange={(e) => update('description', e.target.value)} onFocus={() => setFocusedField('description')} onBlur={() => { setFocusedField(''); markTouched('description') }} placeholder="Описание: состояние, особенности, комплектация…" />
            <FieldHint text="Расскажите о состоянии, дефектах, комплектации" visible={focusedField === 'description'} />
            {touched.description && !form.description.trim() ? (
              <div className="field-error" role="alert">Опишите состояние и особенности — так меньше вопросов</div>
            ) : null}
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
            <input className={`text-input glass-card ${touched.price && !form.price ? 'is-invalid' : ''}`} value={form.price} inputMode="numeric" onChange={(e) => update('price', e.target.value.replace(/[^0-9]/g, ''))} onFocus={() => setFocusedField('price')} onBlur={() => { setFocusedField(''); markTouched('price') }} placeholder="Цена, ₽" />
            <FieldHint text="Укажите цену в рублях" visible={focusedField === 'price'} />
            {touched.price && !form.price ? (
              <div className="field-error" role="alert">Укажите цену — без неё объявление не опубликуется</div>
            ) : null}
          </div>

          <div className="field-wrap">
            <input className={`text-input glass-card ${touched.city && !form.city.trim() ? 'is-invalid' : ''}`} value={form.city} onChange={(e) => update('city', e.target.value)} onFocus={() => setFocusedField('city')} onBlur={() => { setFocusedField(''); markTouched('city') }} placeholder="Город" list="ad-city-options" />
            <FieldHint text="Начните вводить — появятся подсказки" visible={focusedField === 'city'} />
            {touched.city && !form.city.trim() ? (
              <div className="field-error" role="alert">Город нужен, чтобы объявление нашли рядом</div>
            ) : null}
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

      {/* Почему нельзя идти дальше: причина под шагами, а не только
          погашенная кнопка «Далее». */}
      {stepProblem ? <div className="step-hint">{stepProblem}</div> : null}
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
      const payload = { ...form }
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
      <TopBar left={<IconButton icon="back" to="/" label="Назад" />} />
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
      <TopBar left={<IconButton icon="back" to={`/listing/${listingId}`} label="Назад" />} />
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
      <TopBar left={<IconButton icon="back" to="/profile" label="Назад" />} />
      <div className="page-title">Мои объявления</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <>
          <div className="tab-row">
            {tabs.map((s) => (
              <Chip key={s} active={activeTab === s} onClick={() => setActiveTab(s)}>
                {STATUS_LABELS[s] || s}
              </Chip>
            ))}
          </div>
          {visible.length === 0 ? <EmptyBlock text="В этом разделе пока пусто." /> : null}
          <div className="list-stack mt-14">
            {visible.map((item) => (
              <div key={item.id} className="favorite-row glass-card myad-card">
                <div className="result-thumb"><MediaPlaceholder imageUrl={firstPhoto(item)} /></div>
                <div className="myad-body">
                  <div className="myad-price">{priceText(item)}</div>
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
      <TopBar left={<IconButton icon="back" to="/" label="Назад" />} />
      <div className="page-title">Сообщения</div>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock text={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Диалогов пока нет. Напишите продавцу из карточки объявления." /> : null}
      <div className="list-stack mt-14">
        {/* Строка диалога: аватар с инициалами (пустые круги были одинаковые),
            имя, объявление, последнее сообщение, время и непрочитанные. */}
        {items.map((chat) => {
          const name = chatName(chat)
          return (
            <Link to={`/chat/${chat.id}`} key={chat.id} className="chat-row glass-card">
              <Avatar name={name} size="lg" />
              <div className="chat-meta">
                <div className="chat-meta-top">
                  <strong>{name}</strong>
                  <span className="chat-time">{shortTime(chat.time)}</span>
                </div>
                <span className="chat-ad">{(chat.ad_title || 'Объявление').slice(0, 42)}</span>
                <div className="chat-meta-bottom">
                  <span className="chat-last">{chat.last_text || 'Сообщений пока нет'}</span>
                  {chat.unread ? (
                    <span className="chat-unread" aria-label={`Непрочитанных: ${chat.unread}`}>
                      {chat.unread}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* Миниатюра товара: поле ad_photo отдаёт бэкенд; если его нет —
                  строка просто остаётся без картинки. */}
              {chat.ad_photo ? (
                <span className="chat-thumb">
                  <img src={resolveAssetUrl(chat.ad_photo)} alt="" loading="lazy" />
                </span>
              ) : null}
            </Link>
          )
        })}
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
          // Дубли: два опроса подряд берут один и тот же lastId и приносят
          // одни и те же сообщения. Добавляем только те, которых ещё нет.
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id))
            const fresh = data.messages.filter((m) => !known.has(m.id))
            return fresh.length ? [...prev, ...fresh] : prev
          })
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
      // Ничего не рисуем вручную: сообщение придёт опросом. Раньше здесь
      // добавлялась копия с id = Date.now(), а потом приезжало настоящее,
      // с другим id — отсюда и были дубли по два раза.
      const data = await api.pollChat(chatId, messages.length ? messages[messages.length - 1].id : 0)
      if (data.messages?.length) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id))
          return [...prev, ...data.messages.filter((m) => !known.has(m.id))]
        })
      }
    } catch {
      // Не показываем сообщение, которого нет на сервере: человек будет
      // думать, что отправил, а собеседник ничего не получит.
      setText(value)
      setError('Сообщение не отправилось — проверьте связь')
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

  // Пустые сообщения (ни текста, ни вложения) не рисуем: в переписке
  // появлялись пузыри, в которых была только дата.
  const visibleMessages = messages.filter((m) => (m.text && String(m.text).trim()) || chatMediaUrl(m))

  return (
    <Screen padded={false}>
      <div className="chat-screen">
        <div className="chat-top padded-inline">
          <TopBar
            left={
              <div className="chat-header-left">
                <IconButton icon="back" to="/chats" />
                <Avatar name={chatInfo.user || 'Диалог'} />
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
          {visibleMessages.map((message, index) => {
            const isMine = viewerId != null && message.sender_id === viewerId
            const canEdit = isMine && !message.is_read
            // Разделитель дня появляется один раз перед первым сообщением дня
            const showDay = dayKey(message.created_at) !== dayKey(visibleMessages[index - 1]?.created_at)
            return (
              <React.Fragment key={message.id}>
                {showDay ? <div className="chat-day">{dayLabel(message.created_at)}</div> : null}
                <div className={`bubble-wrap ${side(message)}`}>
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
                  <span className="bubble-time">{timeOnly(message.created_at)}</span>
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
              </React.Fragment>
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
      {/* Иконка-закладка из шапки убрана: она дублировала заголовок
          «Избранное» и ничего не делала. */}
      <TopBar left={<Logo />} />
      <div className="favorites-page">
        <div className="page-title">Избранное</div>
        {loading ? <LoadingBlock /> : null}
        {error ? <ErrorBlock text={error} onRetry={load} /> : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState text="Вы пока ничего не сохранили." icon={<Icon name="heart" />} />
        ) : null}
        <div className="list-stack mt-14">
          {items.map((item) => (
            <div key={item.id} className="favorite-row glass-card"
              onClick={() => { window.location.hash = `#/listing/${item.id}` }}>
              <div className="result-thumb"><MediaPlaceholder imageUrl={firstPhoto(item)} /></div>
              <div>
                <div className="product-price result-price">{priceText(item)}</div>
                <div className="row-title">{item.title}</div>
                <div className="product-city">{item.city}</div>
              </div>
              {/* Вместо красной «×» — спокойная ghost-кнопка с корзиной:
                  удаление из избранного не должно выглядеть как тревога. */}
              <button className="favorite-remove" type="button" aria-label="Убрать из избранного"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id) }}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}

function ProfilePage() {
  const { profile, tgUser, backendMode } = useApp()
  const avatarUrl = tgUser?.photo_url || ''
  // Пункт «Админ» показываем только администратору (этап J3)
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    api.adminMe().then((d) => setIsAdmin(Boolean(d.is_admin))).catch(() => setIsAdmin(false))
  }, [])

  return (
    <Screen>
      {/* Логотип переехал в шапку: в .profile-top он стоял слева, а аватар
          по центру — два разных выравнивания на одном экране. */}
      <TopBar left={<Logo />} />
      <div className="profile-top">
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
      <div className="list-stack mt-14 menu-list">
        {/* Единый набор иконок слева и шеврон справа: раньше у «Моих
            объявлений» иконки не было вовсе, а остальные стояли справа. */}
        <Link to="/my" className="setting-row glass-card menu-row">
          <span className="menu-left"><Icon name="tag" /><span>Мои объявления</span></span>
          <span className="menu-arrow" aria-hidden="true">›</span>
        </Link>
        <Link to="/favorites" className="setting-row glass-card menu-row">
          <span className="menu-left"><Icon name="bookmark" /><span>Избранное</span></span>
          <span className="menu-arrow" aria-hidden="true">›</span>
        </Link>
        <Link to="/chats" className="setting-row glass-card menu-row">
          <span className="menu-left"><Icon name="chat" /><span>Сообщения</span></span>
          <span className="menu-arrow" aria-hidden="true">›</span>
        </Link>
        <Link to="/tariffs" className="setting-row glass-card menu-row">
          <span className="menu-left"><Icon name="crown" /><span>Тарифы и монеты</span></span>
          <span className="menu-arrow" aria-hidden="true">›</span>
        </Link>
        {isAdmin ? (
          <Link to="/admin" className="setting-row glass-card menu-row">
            <span className="menu-left"><Icon name="shield" /><span>Админ</span></span>
            <span className="menu-arrow" aria-hidden="true">›</span>
          </Link>
        ) : null}
        <Link to="/create" className="setting-row glass-card menu-row">
          <span className="menu-left"><Icon name="plus" /><span>Разместить объявление</span></span>
          <span className="menu-arrow" aria-hidden="true">›</span>
        </Link>
      </div>
    </Screen>
  )
}

function TariffsPage() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [ref, setRef] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [promo, setPromo] = useState('')

  const load = () => {
    api.getPlan().then(setPlan).catch(() => {})
    api.getReferral().then(setRef).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const buy = async (product) => {
    setBusy(true); setMsg('')
    try {
      const r = await api.payInvoice(product)
      if (!r.invoice_url) throw new Error('нет ссылки оплаты')
      if (!openInvoice(r.invoice_url, (status) => {
        if (status === 'paid') { setMsg('Оплачено — обновляем…'); setTimeout(load, 1500) }
      })) {
        window.open(r.invoice_url, '_blank')
      }
    } catch (e) {
      setMsg((e && e.detail) || 'Не удалось открыть оплату')
    } finally {
      setBusy(false)
    }
  }

  const applyPromo = async () => {
    if (!promo.trim()) return
    setBusy(true); setMsg('')
    try {
      const r = await api.redeemPromo(promo.trim())
      setMsg(r.granted ? `Промокод активирован: ${r.granted}` : 'Промокод принят')
      setPromo('')
      load()
    } catch (e) {
      setMsg((e && e.detail) || 'Промокод не подошёл')
    } finally {
      setBusy(false)
    }
  }

  const planName = plan?.plan || '…'
  const isTrial = planName === 'trial'
  const isPlus = planName === 'plus'
  const money = (n) => Number(n || 0).toLocaleString('ru-RU')

  return (
    <Screen>
      <TopBar left={<Logo />} />
      <h2 className="section-title">Тарифы и монеты</h2>

      {isTrial ? (
        <div className="glass-card banner-card">
          <div className="banner-title">Пробный период</div>
          <div className="banner-text">
            Осталось дней: {plan.trial_days_left}. Без задержки, до {plan.criteria_limit} критериев,
            тщательный отбор по описанию включён.
          </div>
        </div>
      ) : null}

      <div className="list-stack mt-14">
        <div className="glass-card plan-row">
          <div className="plan-left">
            <div className="plan-name">Бесплатно</div>
            <div className="plan-desc">1 критерий, находки с задержкой {plan?.free_delay_min || 10} мин</div>
          </div>
          {planName === 'free' ? <span className="badge">Сейчас</span> : null}
        </div>

        <div className="glass-card plan-row">
          <div className="plan-left">
            <div className="plan-name">
              ПОЛКА Плюс
              <span className="plan-price"><s>{plan?.plus_price || 149} ₽</s> 99 ₽/мес</span>
            </div>
            <div className="plan-desc">
              10 критериев, без задержки, тщательный отбор по описанию, «цена снижена»
            </div>
          </div>
          {isPlus
            ? <span className="badge">Активен</span>
            : <button type="button" className="cta-primary" disabled={busy}
                onClick={() => buy('plus_month')}>Оформить</button>}
        </div>

        <div className="glass-card plan-row">
          <div className="plan-left">
            <div className="plan-name">Баланс монет</div>
            <div className="plan-desc">Монеты на «Открыть сейчас» (5) и «Тщательную проверку» (3)</div>
          </div>
          <div className="plan-balance">{plan?.balance ?? 0} ⦿</div>
        </div>
      </div>

      <h3 className="section-title mt-14">Пополнить монеты</h3>
      <div className="list-stack mt-8">
        {[['coins_50', '50 монет', '55 ⭐'], ['coins_150', '150 монет', '149 ⭐'],
          ['coins_500', '500 монет', '449 ⭐']].map(([prod, label, stars]) => (
          <button key={prod} type="button" className="glass-card plan-row" disabled={busy}
            onClick={() => buy(prod)}>
            <span className="plan-left"><span className="plan-name">{label}</span></span>
            <span className="plan-balance">{stars}</span>
          </button>
        ))}
      </div>

      <div className="glass-card mt-14">
        <div className="plan-name">Промокод</div>
        <div className="plan-desc">Введите код — он даст монеты, дни «Плюса» или слот</div>
        <div className="admin-actions mt-8">
          <input className="text-input" placeholder="КОД" value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())} />
          <button type="button" className="cta-primary" disabled={busy} onClick={applyPromo}>
            Применить
          </button>
        </div>
      </div>

      <div className="glass-card mt-14">
        <div className="plan-name">Реферальная программа</div>
        <div className="plan-desc">
          +1 критерий вам и другу за каждого приглашённого (до 3). Приглашено: {ref?.count || 0}.
        </div>
        <div className="plan-desc mt-8">{ref?.link || ''}</div>
      </div>

      {msg ? <div className="chat-note mt-8">{msg}</div> : null}
    </Screen>
  )
}

function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('settings')
  const [allowed, setAllowed] = useState(null)
  const [settings, setSettings] = useState({})
  const [draft, setDraft] = useState({})
  const [history, setHistory] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [promo, setPromo] = useState({ items: [], titles: {} })
  const [promoForm, setPromoForm] = useState({ code: '', kind: 'coins', value: 100, max_uses: 0 })
  const [grant, setGrant] = useState({ user: '', kind: 'coins', amount: 100 })
  const [msg, setMsg] = useState('')

  const loadAll = () => {
    api.adminSettings().then((d) => setSettings(d.items || {})).catch(() => {})
    api.adminHistory().then((d) => setHistory(d.items || [])).catch(() => {})
    api.adminMetrics().then(setMetrics).catch(() => {})
    api.adminPromo().then((d) => setPromo({ items: d.items || [], titles: d.titles || {} })).catch(() => {})
  }

  useEffect(() => {
    api.adminMe()
      .then((d) => {
        setAllowed(Boolean(d.is_admin))
        if (d.is_admin) loadAll()
      })
      .catch(() => setAllowed(false))
  }, [])

  const save = async (key) => {
    const value = draft[key] !== undefined ? draft[key] : settings[key]?.value
    try {
      const r = await api.adminSet(key, value, 'экран админа')
      setMsg(r.ok ? `${key}: ${r.old} → ${r.new}` : `Не сохранил: ${r.error}`)
      api.adminSettings().then((d) => setSettings(d.items || {}))
      api.adminHistory().then((d) => setHistory(d.items || []))
    } catch (e) {
      setMsg((e && e.detail) || 'Ошибка сохранения')
    }
  }

  const rollback = async (key) => {
    try {
      const r = await api.adminRollback(key)
      setMsg(r.ok ? `${key} возвращён к ${r.rolled_back_to}` : `Откат не вышел: ${r.error}`)
      api.adminSettings().then((d) => setSettings(d.items || {}))
      api.adminHistory().then((d) => setHistory(d.items || []))
    } catch (e) {
      setMsg((e && e.detail) || 'Ошибка отката')
    }
  }

  const doGrant = async () => {
    try {
      const r = await api.adminGrant(grant.user, grant.kind, Number(grant.amount))
      setMsg(r.ok ? `Выдано: ${grant.kind} ${grant.amount} → ${r.user_id}` : `Не выдал: ${r.error}`)
    } catch (e) {
      setMsg((e && e.detail) || 'Ошибка выдачи')
    }
  }

  const createPromo = async () => {
    try {
      const r = await api.adminPromoCreate({ ...promoForm, value: Number(promoForm.value) })
      setMsg(r.ok ? `Промокод ${r.code} создан` : `Не создал: ${r.error}`)
      api.adminPromo().then((d) => setPromo({ items: d.items || [], titles: d.titles || {} }))
    } catch (e) {
      setMsg((e && e.detail) || 'Ошибка создания промокода')
    }
  }

  if (allowed === false) {
    return (
      <Screen>
        <TopBar left={<Logo />} />
        <ErrorBlock text="Раздел только для администраторов" />
      </Screen>
    )
  }

  const tabs = [['settings', 'Условия'], ['grant', 'Выдача'], ['promo', 'Промокоды'],
    ['metrics', 'Метрики'], ['history', 'История']]

  return (
    <Screen>
      <TopBar left={<Logo />} />
      <h2 className="section-title">Админ</h2>
      <div className="chat-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button"
            className={tab === key ? 'chat-tab is-active' : 'chat-tab'}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {msg ? <div className="chat-note">{msg}</div> : null}

      {tab === 'settings' ? (
        <div className="list-stack mt-8">
          {Object.entries(settings).map(([key, s]) => (
            <div key={key} className="plan-row glass-card">
              <div className="plan-left">
                <div className="plan-name">{s.title || key}</div>
                <div className="plan-desc">
                  {key} · сейчас {String(s.value)}
                  {s.min !== null && s.min !== undefined ? ` · допустимо ${s.min}…${s.max}` : ''}
                </div>
              </div>
              <div className="admin-actions">
                <input className="text-input admin-input" type="number"
                  value={draft[key] !== undefined ? draft[key] : s.value}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                <button type="button" className="chat-chip" onClick={() => save(key)}>Сохранить</button>
                <button type="button" className="link-btn" onClick={() => rollback(key)}>Откат</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'grant' ? (
        <div className="list-stack mt-8">
          <div className="glass-card plan-row">
            <div className="plan-left">
              <div className="plan-name">Выдать пользователю</div>
              <div className="plan-desc">id или @username · Плюс, монеты, слот, пробный</div>
            </div>
          </div>
          <input className="text-input" placeholder="id или @username"
            value={grant.user} onChange={(e) => setGrant({ ...grant, user: e.target.value })} />
          <select className="text-input" value={grant.kind}
            onChange={(e) => setGrant({ ...grant, kind: e.target.value })}>
            <option value="coins">монеты</option>
            <option value="plus_days">дней «Плюса»</option>
            <option value="criterion_days">дней доп. критерия</option>
            <option value="trial_days">дней пробного</option>
            <option value="plan_free">сбросить на бесплатный</option>
          </select>
          <input className="text-input" type="number" value={grant.amount}
            onChange={(e) => setGrant({ ...grant, amount: e.target.value })} />
          <button type="button" className="cta-primary" onClick={doGrant}>Выдать</button>
        </div>
      ) : null}

      {tab === 'promo' ? (
        <div className="list-stack mt-8">
          <input className="text-input" placeholder="КОД"
            value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })} />
          <select className="text-input" value={promoForm.kind}
            onChange={(e) => setPromoForm({ ...promoForm, kind: e.target.value })}>
            <option value="coins">монеты</option>
            <option value="plus_days">дни «Плюса»</option>
            <option value="criterion_days">дни доп. критерия</option>
            <option value="trial_days">дни пробного</option>
          </select>
          <input className="text-input" type="number" value={promoForm.value}
            onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })} />
          <input className="text-input" type="number" placeholder="сколько активаций (0 — без предела)"
            value={promoForm.max_uses}
            onChange={(e) => setPromoForm({ ...promoForm, max_uses: e.target.value })} />
          <button type="button" className="cta-primary" onClick={createPromo}>Создать промокод</button>
          {(promo.items || []).map((c) => (
            <div key={c.id} className="plan-row glass-card">
              <div className="plan-left">
                <div className="plan-name">{c.code}</div>
                <div className="plan-desc">
                  {promo.titles?.[c.kind] || c.kind}: {c.value} · активаций {c.uses}
                  {c.max_uses ? ` из ${c.max_uses}` : ''} · {c.active ? 'включён' : 'выключен'}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'metrics' && metrics ? (
        <div className="list-stack mt-8">
          {[['Пользователей', metrics.users], ['Критериев активно', metrics.criteria_active],
            ['Решений', metrics.matches], ['Отправлено', metrics.sent],
            ['Находок в базе', metrics.findings], ['Монет на руках', metrics.coins_left],
            ['Покупок', metrics.payments], ['Звёзд получено', metrics.stars],
            ['Приём, мс', metrics.ingest?.last_ms], ['Лаг цикла, мс', metrics.loop_lag?.max_ms]].map(
            ([label, value]) => (
              <div key={label} className="plan-row glass-card">
                <div className="plan-left"><div className="plan-name">{label}</div></div>
                <div className="plan-balance">{String(value ?? 0)}</div>
              </div>
            ))}
          {metrics.plans ? (
            <div className="plan-row glass-card">
              <div className="plan-left">
                <div className="plan-name">Планы</div>
                <div className="plan-desc">
                  {Object.entries(metrics.plans).map(([k, v]) => `${k || 'новые'}: ${v}`).join(' · ')}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="list-stack mt-8">
          {history.map((h) => (
            <div key={h.id} className="plan-row glass-card">
              <div className="plan-left">
                <div className="plan-name">{h.key}</div>
                <div className="plan-desc">
                  {h.old_json} → {h.new_json} · {String(h.changed_at || '').slice(0, 16)}
                  {h.reason ? ` · ${h.reason}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/listing/:id" element={<ListingPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/edit/:id" element={<EditAdPage />} />
        <Route path="/my" element={<MyAdsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/hunt" element={<HuntChat />} />
        <Route path="/hunt/manual" element={<CriteriaPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/tariffs" element={<TariffsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
      </Routes>
      {!hideNav ? <BottomNav /> : null}
    </div>
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


