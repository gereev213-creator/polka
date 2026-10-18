import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** Шапка без своих панелей.
 *
 *  Кнопку «Закрыть» рисует сам Telegram над webview — дублировать её не нужно.
 *  Сверху оставлено свободное место под неё. На вложенных экранах остаётся
 *  обычная стрелка «назад» без плашки, потому что встроенная есть не везде.
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

  return (
    <div className={'topbar' + (scrolled ? ' is-scrolled' : '')}>
      <div className="topbar-row">
        <div className="topbar-side">
          {onBack ? (
            <button type="button" className="topbar-back" onClick={onBack} aria-label="Назад">
              <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true">
                <path d="M15 4l-8 8 8 8" />
              </svg>
            </button>
          ) : left}
        </div>
        <div className="topbar-center">{center || title}</div>
        <div className="topbar-side topbar-side--right">{right}</div>
      </div>
    </div>
  )
}

export default TopBar
