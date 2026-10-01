import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
import { getTelegramUser, initTelegramMiniApp } from './telegram'
import { api, resolveAssetUrl } from './api'

const AppContext = createContext(null)

const iconPaths = {
  home: [<path key="1" d="M4 10l8-6 8 6" />, <path key="2" d="M7 10v9h10v-9" />],
  search: [<circle key="1" cx="11" cy="11" r="6.5" />, <path key="2" d="M16 16l4 4" />],
  plus: [<path key="1" d="M12 5v14" />, <path key="2" d="M5 12h14" />],
  bookmark: [<path key="1" d="M7 5h10v14l-5-3-5 3z" />],
  user: [<circle key="1" cx="12" cy="8" r="4" />, <path key="2" d="M4 20c1.8-3.5 5-5 8-5s6.2 1.5 8 5" />],
  menu: [<path key="1" d="M4 7h16M4 12h16M4 17h16" />],
  back: [<path key="1" d="M15 5l-7 7 7 7" />],
  heart: [<path key="1" d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" />],
  share: [<path key="1" d="M14 5h5v5" />, <path key="2" d="M10 14L19 5" />, <path key="3" d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />],
  filter: [<path key="1" d="M5 7h14M8 12h8M10 17h4" />],
  camera: [<path key="1" d="M4 8h4l2-2h4l2 2h4v10H4z" />, <circle key="2" cx="12" cy="13" r="3.5" />],
  send: [<path key="1" d="M4 12l16-7-4 14-4-5-8-2z" />],
  chat: [<path key="1" d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />],
  shield: [<path key="1" d="M12 3l7 3v5c0 4.8-2.8 7.8-7 10-4.2-2.2-7-5.2-7-10V6z" />],
  crown: [<path key="1" d="M4 17l2-9 6 5 6-5 2 9H4z" />, <path key="2" d="M6 19h12" />],
  image: [<rect key="1" x="4" y="6" width="16" height="12" rx="2" />, <circle key="2" cx="9" cy="10" r="1.6" />, <path key="3" d="M20 15l-4.5-4.5L8 18" />],
  sparkles: [<path key="1" d="M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />, <path key="2" d="M18 14l.7 2.1L21 17l-2.3.9L18 20l-.7-2.1L15 17l2.3-.9L18 14z" />, <path key="3" d="M5 19l7-7" />],
  logout: [<path key="1" d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />, <path key="2" d="M14 16l4-4-4-4" />, <path key="3" d="M18 12H9" />],
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
  return ''
}

function priceText(item) {
  return item?.price_display || (item?.price != null ? `${item.price} ₽` : '')
}

function ProductCard({ item, favorite = false, onToggleFavorite }) {
  const handleFavorite = (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggleFavorite?.(item.id)
  }

  return (
    <Link to={`/listing/${item.id}`} className="product-card glass-card">
      <div className="product-media">
        <button className={`save-btn ${favorite ? 'is-on' : ''}`} type="button" onClick={handleFavorite}>
          <Icon name="heart" />
        </button>
        <MediaPlaceholder imageUrl={firstPhoto(item)} />
      </div>
      <div className="product-price">{priceText(item)}</div>
      <div className="product-title">{item.title}</div>
      <div className="product-city">{item.city}</div>
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

function FeedPage() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('Все')
  const [feedBanner, setFeedBanner] = useState('')
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const loadMoreRef = useRef(null)
  const PAGE = 20

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (!cancelled) setCategories((data.categories || []).map((c) => c.label))
    }).catch(() => {})
    api.getBanners().then((data) => {
      if (!cancelled && data.banners?.miniapp_feed) setFeedBanner(data.banners.miniapp_feed)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const load = async (category, offset, append) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError('')
    }
    try {
      const data = await api.getFeed({ category, limit: PAGE, offset })
      setItems((prev) => (append ? [...prev, ...(data.items || [])] : (data.items || [])))
      setHasMore(Boolean(data.has_more))
    } catch {
      if (!append) {
        setError('Не удалось загрузить объявления.')
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

  const changeCategory = (category) => {
    setActiveCategory(category)
  }

  return (
    <Screen>
      <TopBar left={<Logo />} right={<div className="top-actions"><IconButton icon="user" to="/profile" /></div>} />
      <Link to="/search" className="search-input glass-card compact"><Icon name="search" />Поиск вещей</Link>
      <div className="chip-row">
        {['Все', ...categories].map((category) => (
          <button key={category} className={`chip ${activeCategory === category ? 'is-active' : ''}`} onClick={() => changeCategory(category)}>
            {category}
          </button>
        ))}
      </div>
      {feedBanner ? (
        <div className="banner-card glass-card">
          <img className="media-image" src={resolveAssetUrl(feedBanner)} alt="Полка" />
        </div>
      ) : (
        <Banner eyebrow="ПОЛКА" title="Как быстрее продать" text="Хорошие фото и спокойная цена дают больше откликов." action="Читать" />
      )}
      <div className="section-head"><strong>{loading ? 'Загрузка…' : 'Свежее'}</strong><span>{activeCategory}</span></div>
      {error ? <ErrorBlock text={error} onRetry={() => load(activeCategory, 0, false)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyBlock text="Объявлений пока нет." /> : null}
      <div className="grid-two">
        {items.slice(0, 2).map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
        ))}
      </div>
      <div className="grid-two mt-12">
        {items.slice(2).map((item) => (
          <ProductCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onToggleFavorite={toggleFavorite} />
        ))}
      </div>
      <div ref={loadMoreRef} />
      {loadingMore ? <div className="section-head"><strong>Загружаем ещё…</strong></div> : null}
      {hasMore && !loadingMore ? <div className="mt-12"><button className="ghost-btn wide" onClick={() => load(activeCategory, items.length, true)}>Показать ещё</button></div> : null}
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
  const [categories, setCategories] = useState([])
  const [cities, setCities] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (cancelled) return
      setCategories((data.categories || []).map((c) => c.label))
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
        const data = await api.search({ q: query, category, city, priceMin, priceMax, condition, delivery, sort, limit: 30 })
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

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} center={<Logo />} right={<IconButton icon="filter" />} />
      <div className="page-title">Поиск</div>
      <input className="text-input glass-card" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Искать вещи" />
      <div className="form-stack mt-10">
        <select className="text-input glass-card" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="Все">Все категории</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="text-input glass-card" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Город" list="city-options" />
        <datalist id="city-options">
          {cities.map((c) => <option key={c} value={c} />)}
        </datalist>
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

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getListing(listingId)
      setItem(data.ad)
    } catch (err) {
      setError(err.status === 404 ? 'Объявление не найдено.' : 'Не удалось загрузить объявление.')
      setItem(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  const isOwner = Boolean(item?.is_owner)
  const photos = item?.photo_urls || []

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
      <TopBar left={<IconButton icon="back" to="/" />} right={<div className="top-actions"><IconButton icon="heart" active={favoriteIds.includes(listingId)} onClick={() => toggleFavorite(listingId)} /><IconButton icon="share" /></div>} />
      <div className="hero-media glass-card">
        <MediaPlaceholder label="фотографии товара" tall imageUrl={photos[photoIndex] || ''} />
      </div>
      {photos.length > 1 ? (
        <div className="chip-row">
          {photos.map((url, idx) => (
            <button key={idx} className={`chip ${photoIndex === idx ? 'is-active' : ''}`} onClick={() => setPhotoIndex(idx)}>
              Фото {idx + 1}
            </button>
          ))}
        </div>
      ) : null}
      <div className="listing-title">{item.title}</div>
      <div className="listing-price">{priceText(item)}</div>
      <div className="muted-line">{item.city}{item.condition ? ` · ${item.condition}` : ''}</div>
      <div className="muted-line">{item.views || 0} просмотров · {item.favorites_count || 0} в избранном</div>
      <div className="copy-block glass-card">
        <strong>Описание</strong>
        <p>{item.description || 'Без описания.'}</p>
      </div>
      <div className="seller-card glass-card">
        <div className="avatar" />
        <div className="seller-meta">
          <strong>{item.seller?.name || 'Продавец'}</strong>
          <span>{item.seller?.verified ? 'Проверен' : 'Профиль продавца'}</span>
        </div>
      </div>
      {isOwner ? (
        <div className="list-stack mt-14">
          <div className="setting-row glass-card"><span>Статус: {STATUS_LABELS[item.status] || item.status}</span></div>
          <Link to={`/edit/${item.id}`} className="setting-row glass-card"><span>Редактировать</span></Link>
          {item.status === 'active' ? <button className="setting-row glass-card button-like" onClick={handleSold}><span>{actionLoading === 'sold' ? 'Сохраняем…' : 'Пометить проданным'}</span></button> : null}
          <button className="setting-row glass-card button-like" onClick={handleDelete}><span>{actionLoading === 'delete' ? 'Удаляем…' : 'Удалить'}</span></button>
        </div>
      ) : (
        <div className="cta-bar">
          <div>
            <small>Цена</small>
            <strong>{priceText(item)}</strong>
          </div>
          <button className="cta-button" onClick={handleStartChat}>
            {chatLoading ? 'Открываем…' : 'Написать'}
          </button>
        </div>
      )}
    </Screen>
  )
}

const CONDITION_OPTIONS = ['Новое', 'Б/у']
const DELIVERY_OPTIONS = ['Нет', 'Да']

function AdForm({ initial, onSubmit, submitLabel, saving }) {
  const [form, setForm] = useState(() => ({
    category: initial?.category_raw || initial?.category || 'Одежда',
    title: initial?.title || '',
    price: initial?.price != null ? String(initial.price) : '',
    city: initial?.city || '',
    description: initial?.description || '',
    condition: initial?.condition || 'Б/у',
    delivery: initial?.delivery || 'Нет',
    contact_info: initial?.contact_info || '',
    photos: initial?.photos || [],
  }))
  const [categories, setCategories] = useState([])
  const [cities, setCities] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (cancelled) return
      setCategories(data.categories || [])
      setCities(data.cities || [])
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 10 - form.photos.length)
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    try {
      const response = await api.uploadPhotos(files)
      update('photos', [...form.photos, ...(response.file_ids || [])])
    } catch {
      setUploadError('Не удалось загрузить фото. Попробуйте ещё раз.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (fileId) => {
    update('photos', form.photos.filter((p) => p !== fileId))
  }

  const valid = form.title.trim().length >= 3 && form.category && form.city.trim() && form.contact_info.trim()

  return (
    <>
      <div className="form-stack">
        <select className="text-input glass-card" value={form.category} onChange={(e) => update('category', e.target.value)}>
          {categories.length ? categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>) : <option value={form.category}>{form.category}</option>}
        </select>
        <input className="text-input glass-card" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Название" />
        <input className="text-input glass-card" value={form.price} inputMode="numeric" onChange={(e) => update('price', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Цена, ₽" />
        <input className="text-input glass-card" value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Город" list="ad-city-options" />
        <datalist id="ad-city-options">
          {cities.map((c) => <option key={c} value={c} />)}
        </datalist>
        <textarea className="text-area glass-card" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Описание: состояние, особенности…" />
        <div className="grid-two">
          <select className="text-input glass-card" value={form.condition} onChange={(e) => update('condition', e.target.value)}>
            {CONDITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="text-input glass-card" value={form.delivery} onChange={(e) => update('delivery', e.target.value)}>
            {DELIVERY_OPTIONS.map((o) => <option key={o} value={o}>{o === 'Да' ? 'Доставка есть' : 'Без доставки'}</option>)}
          </select>
        </div>
        <input className="text-input glass-card" value={form.contact_info} onChange={(e) => update('contact_info', e.target.value)} placeholder="Контакт для связи" />
      </div>
      <div className="photo-step glass-card">
        <div className="section-head section-head--tight"><strong>Фото</strong><span>{uploading ? 'загрузка…' : `${form.photos.length} / 10`}</span></div>
        <div className="grid-two">
          {form.photos.map((fileId) => (
            <div className="upload-card" key={fileId}>
              <div className="product-media small"><MediaPlaceholder imageUrl={`/api/photo/${fileId}`} /></div>
              <div className="tool-row"><button className="tool-btn" type="button" onClick={() => removePhoto(fileId)}>Убрать</button></div>
            </div>
          ))}
        </div>
        {form.photos.length < 10 ? (
          <div className="tool-row">
            <label className="tool-btn tool-label">Загрузить<input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden /></label>
          </div>
        ) : null}
        {uploadError ? <div className="status-line error">{uploadError}</div> : null}
      </div>
      <button className="floating-action" disabled={!valid || saving || uploading} onClick={() => onSubmit({ ...form, price: Number(form.price) || 0 })}>
        {saving ? 'Сохраняем…' : submitLabel}
      </button>
      {!valid ? <div className="muted-line">Заполните название (от 3 символов), категорию, город и контакт.</div> : null}
    </>
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
      <div className="sub-copy">После публикации объявление уйдёт на модерацию.</div>
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
            <div className="product-city">{chat.time}</div>
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
  const bottomRef = useRef(null)

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
        <div className="chat-messages padded-inline">
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${side(message)}`}>
              {message.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-wrap">
          <div className="chat-input glass-card">
            <input
              className="chat-field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="Сообщение…"
            />
            <button className="send-btn" type="button" onClick={handleSend}>
              <Icon name="send" />
            </button>
          </div>
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

  return (
    <Screen>
      <div className="profile-top">
        <Logo />
        <div className="profile-avatar" />
        <strong className="profile-id">{profile?.id || tgUser?.username || 'Профиль'}</strong>
        {profile?.verified ? <div className="badge mt-8">Проверен</div> : null}
        <div className="product-city mt-8">
          {profile ? `${profile.active_ads || 0} объявлений · ${profile.favorites || 0} в избранном` : 'Откройте приложение через Telegram'}
        </div>
        <div className="telegram-note">{tgUser?.first_name || 'Гость'} · {backendMode === 'online' ? 'online' : backendMode}</div>
      </div>
      {!profile ? <ErrorBlock text="Профиль недоступен. Откройте Mini App через Telegram-бота." /> : null}
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
  const hideNav =
    location.pathname === '/onboarding' ||
    location.pathname === '/create' ||
    location.pathname === '/chats' ||
    location.pathname === '/my' ||
    location.pathname.startsWith('/checkout/') ||
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
  const items = [
    { icon: 'home', to: '/', label: 'Главная' },
    { icon: 'search', to: '/search', label: 'Поиск' },
  ]

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
          <Icon name={item.icon} />
        </NavLink>
      ))}
      <Link to="/create" className="nav-post">
        <Icon name="plus" />
      </Link>
      <NavLink to="/favorites" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
        <Icon name="bookmark" />
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
        <Icon name="user" />
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <div className="app-frame">
          <Layout />
        </div>
        <TelegramUserChip />
      </AppProvider>
    </HashRouter>
  )
}

function TelegramUserChip() {
  const { tgUser, backendMode } = useApp()
  if (!tgUser) return null
  return <div className="telegram-user-chip">@{tgUser.username || tgUser.first_name} · {backendMode}</div>
}
