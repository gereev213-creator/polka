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
import { getTelegramUser, initTelegramMiniApp } from './telegram'
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

function BannerCarousel() {
  const [banners, setBanners] = useState([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState([])
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getFeedBanners().then((data) => {
      if (!cancelled) {
        const items = (data.items || []).filter((b) => b.image)
        setBanners(items.length ? items : [{ image: '', action: '' }])
      }
    }).catch(() => {
      if (!cancelled) setBanners([{ image: '', action: '' }])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (banners.length < 2 || paused) return undefined
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % banners.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [banners.length, paused])

  const dismiss = () => {
    const id = banners[index]?.image
    if (!id) return
    const next = [...dismissed, id]
    setDismissed(next)
    localStorage.setItem('polka_dismissed_banners', JSON.stringify(next))
  }

  const visible = banners.filter((b) => !dismissed.includes(b.image) && b.image)
  if (visible.length === 0) return null

  const current = visible[index % visible.length]

  return (
    <div className="banner-carousel">
      <div className="banner-track" style={{ transform: `translateX(-${(index % visible.length) * 100}%)` }}>
        {visible.map((b, i) => (
          <div className="banner-slide" key={i} onClick={() => b.action && window.open(b.action, '_blank')}>
            <img src={resolveAssetUrl(b.image)} alt="Полка" />
          </div>
        ))}
      </div>
      <div className="banner-dots">
        {visible.map((_, i) => (
          <span key={i} className={`banner-dot ${i === index % visible.length ? 'is-active' : ''}`} />
        ))}
      </div>
    </div>
  )
}

function FeedPage() {
  const { favoriteIds, toggleFavorite } = useApp()
  const [categories, setCategories] = useState([])
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

  useEffect(() => {
    let cancelled = false
    api.getFilters().then((data) => {
      if (!cancelled) setCategories((data.categories || []).map((c) => c.label))
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
      const data = await Promise.race([
        api.getFeed({ category, limit: PAGE, offset }),
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

  const changeCategory = (category) => {
    setActiveCategory(category)
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
      <Link to="/search" className="search-input glass-card compact"><Icon name="search" />Поиск вещей</Link>
      <div className="chip-row">
        {['Все', ...categories].map((category) => (
          <button key={category} className={`chip ${activeCategory === category ? 'is-active' : ''}`} onClick={() => changeCategory(category)}>
            {category}
          </button>
        ))}
      </div>
      <BannerCarousel />
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
  const [categories, setCategories] = useState([])
  const [cities, setCities] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [photoSearch, setPhotoSearch] = useState(false)

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

  const handlePhotoSearch = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      const response = await fetch(`${API_BASE}/api/ads/photo-search`, {
        method: 'POST',
        body: formData,
        headers: { 'X-Telegram-Init-Data': getInitData() },
      })
      const data = await response.json()
      setResults(data.items || [])
      setError('')
    } catch {
      setError('Не удалось выполнить поиск по фото.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <TopBar left={<IconButton icon="back" to="/" />} center={<Logo />} right={<IconButton icon="filter" onClick={() => setFiltersOpen(!filtersOpen)} />} />
      <div className="page-title">Поиск</div>
      <div className="search-row">
        <input className="text-input glass-card" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Искать вещи" />
        <label className="photo-search-btn">
          <Icon name="camera" />
          <input type="file" accept="image/*" onChange={handlePhotoSearch} hidden />
        </label>
      </div>
      {filtersOpen ? (
        <div className="filters-panel">
          <div className="form-stack">
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

const CONDITION_OPTIONS = ['Новое', 'Отличное', 'Хорошее', 'Б/у', 'На запчасти']
const DELIVERY_OPTIONS = ['Нет', 'Да']

const CATEGORY_ITEMS = [
  { value: 'Авто', label: 'Авто' },
  { value: 'Недвижимость', label: 'Недвижимость' },
  { value: 'Жильё для путешествия', label: 'Жильё для путешествия' },
  { value: 'Для дома и дачи', label: 'Для дома и дачи' },
  { value: 'Запчасти', label: 'Запчасти' },
  { value: 'Услуги', label: 'Услуги' },
  { value: 'Электроника', label: 'Электроника' },
  { value: 'Работа и подработка', label: 'Работа и подработка' },
  { value: 'Бизнес 360', label: 'Бизнес 360' },
  { value: 'Одежда, обувь, аксессуары', label: 'Одежда, обувь, аксессуары' },
]

function CategoryGrid({ selected, onSelect }) {
  return (
    <div className="category-grid">
      {CATEGORY_ITEMS.map((cat) => (
        <button
          key={cat.value}
          type="button"
          className={`category-card ${selected === cat.value ? 'is-selected' : ''}`}
          onClick={() => onSelect(cat.value)}
        >
          <div className="category-img" data-cat={cat.value} />
          <span>{cat.label}</span>
        </button>
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
      const response = await api.uploadPhotos(files)
      update('photos', [...form.photos, ...(response.urls || [])])
    } catch {
      setUploadError('Не удалось загрузить фото')
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
                  <div className="product-media small"><MediaPlaceholder imageUrl={url} /></div>
                  <div className="tool-row"><button className="tool-btn" type="button" onClick={() => removePhoto(url)}>Убрать</button></div>
                </div>
              ))}
              {form.photos.length < 5 ? (
                <div className="upload-card upload-empty">
                  <label className="tool-btn tool-label">+ Загрузить<input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden /></label>
                </div>
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
            <div className="preview-media"><MediaPlaceholder imageUrl={form.photos[0] || ''} /></div>
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

  const handleAttach = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const isVideo = file.type.startsWith('video/')
      const response = await api.uploadPhotos([file])
      const url = response.urls?.[0]
      if (url) {
        await api.sendMessage(chatId, '', { media_url: url, media_type: isVideo ? 'video' : 'photo' })
        const data = await api.pollChat(chatId, messages.length ? messages[messages.length - 1].id : 0)
        if (data.messages?.length) setMessages((prev) => [...prev, ...data.messages])
      } else {
        setError('Не удалось загрузить файл.')
      }
    } catch {
      setError('Не удалось прикрепить файл.')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

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
                  className={`bubble ${side(message)} ${message.media_type && message.media_type !== 'text' ? 'bubble-media' : ''}`}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(message.id) }}
                >
                  {message.media_type === 'photo' || message.media_type === 'video' ? (
                    <img className="bubble-media-img" src={resolveAssetUrl(message.media_url)} alt="" />
                  ) : null}
                  {message.text ? <span>{message.text}</span> : null}
                  <span className="bubble-time">{message.created_at?.slice(11, 16) || ''}</span>
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
            <label className="attach-btn">
              <Icon name="image" />
              <input type="file" accept="image/*,video/*" onChange={handleAttach} hidden />
            </label>
            <input
              className="chat-field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="Сообщение…"
            />
            <button className="send-btn" type="button" onClick={handleSend} aria-label="Отправить">
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
  const location = useLocation()
  const items = [
    { icon: 'home', to: '/', label: 'Главная' },
    { icon: 'chat', to: '/chats', label: 'Сообщения' },
    { icon: 'bookmark', to: '/favorites', label: 'Избранное' },
    { icon: 'sparkles', to: '/promotions', label: 'Ивент', isNew: true },
  ]

  return (
    <nav className="dock">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
        >
          {item.isNew && <span className="dock-badge">NEW</span>}
          <span className="dock-icon"><Icon name={item.icon} /></span>
          <span className="dock-label">{item.label}</span>
        </NavLink>
      ))}
      <NavLink to="/profile" className="profile-bubble">
        <span>{'П'}</span>
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
          <TelegramUserChip />
        </AppProvider>
      </ErrorBoundary>
    </HashRouter>
  )
}

function TelegramUserChip() {
  const { tgUser, backendMode } = useApp()
  if (!tgUser) return null
  return (
    <div className="telegram-user-chip">
      <span>@{tgUser.username || tgUser.first_name}</span>
      <span className="chip-status">{backendMode === 'online' ? 'online' : backendMode}</span>
    </div>
  )
}
