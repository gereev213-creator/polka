import { useEffect, useState } from 'react'

export function TopBar({ left, center, right }) {
  // ТЗ 5.1: тени у шапки нет, а волосяная линия появляется только после
  // скролла — поэтому следим за прокруткой здесь, в самой шапке.
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
      <div className="topbar-side">{left}</div>
      <div className="topbar-center">{center}</div>
      <div className="topbar-side topbar-side--right">{right}</div>
    </div>
  )
}

export default TopBar
