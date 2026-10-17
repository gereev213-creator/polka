import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** Шапка в духе Memgift: плавающие пилюли.
 *
 *  Слева — «✕ Закрыть» на корневых экранах или «‹ Назад» на вложенных,
 *  справа — маленькие пилюли «⌄» и «•••». Логотип и заголовок из props
 *  остаются под рядом пилюль, поэтому ни один экран не ломается.
 */
export function TopBar({ left, center, right, title, onBack }) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0
      setScrolled(y > 8)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeApp = () => {
    const tg = window.Telegram?.WebApp
    if (tg && typeof tg.close === 'function') tg.close()
    else window.history.back()
  }
  const goBack = onBack || (() => navigate(-1))

  return (
    <div className={'topbar' + (scrolled ? ' is-scrolled' : '')}>
      <div className="topbar-pills">
        {onBack
          ? <button type="button" className="pill-btn" onClick={goBack}>‹ Назад</button>
          : <button type="button" className="pill-btn" onClick={closeApp}>✕ Закрыть</button>}
        <div className="topbar-pills-right">
          <button type="button" className="pill-btn pill-btn--icon" aria-label="Свернуть">
            <span className="pill-chevron" />
          </button>
          <button type="button" className="pill-btn pill-btn--icon" aria-label="Ещё">
            <span className="pill-dots" />
          </button>
        </div>
      </div>
      {left || center || right || title ? (
        <div className="topbar-row">
          <div className="topbar-side">{left}</div>
          <div className="topbar-center">{center || title}</div>
          <div className="topbar-side topbar-side--right">{right}</div>
        </div>
      ) : null}
    </div>
  )
}

export default TopBar
