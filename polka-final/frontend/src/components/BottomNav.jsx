import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

/** Нижняя навигация в духе Memgift: капсула с четырьмя иконками и
 *  отдельная круглая кнопка действия справа.
 *
 *  Подсветка активной вкладки — ОДНА плашка, которая плавно переезжает
 *  к выбранной иконке (как в референсе). Раньше каждая вкладка красилась
 *  сама, и переход выглядел как включение/выключение фона, а не движение.
 */
export function BottomNav() {
  const location = useLocation()
  const groupRef = useRef(null)
  const itemRefs = useRef([])
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false })

  const tabs = [
    ['/', 'home'],
    ['/search', 'market'],
    ['/favorites', 'bookmark'],
    ['/profile', 'user'],
  ]

  const measure = () => {
    const group = groupRef.current
    if (!group) return
    const activeIndex = Math.max(0, tabs.findIndex(([to]) => (
      to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
    )))
    const el = itemRefs.current[activeIndex]
    if (!el) return
    const g = group.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setPill({ x: r.left - g.left, w: r.width, ready: true })
  }

  useLayoutEffect(() => {
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return (
    <div className="tabbar-wrap">
      <div className="tabbar" role="navigation" aria-label="Основная навигация">
        <div className="tabbar-group" ref={groupRef}>
          <span
            className={pill.ready ? 'tabbar-pill is-ready' : 'tabbar-pill'}
            style={{ transform: `translateX(${pill.x}px)`, width: `${pill.w}px` }}
            aria-hidden="true"
          />
          {tabs.map(([to, icon], i) => (
            <NavLink key={to} to={to} end={to === '/'}
              ref={(el) => { itemRefs.current[i] = el }}
              className={({ isActive }) => (isActive ? 'tabbar-item is-active' : 'tabbar-item')}
              aria-label={icon}>
              <Icon name={icon} />
            </NavLink>
          ))}
        </div>
      </div>
      <NavLink to="/create" className="tabbar-fab" aria-label="Подать объявление">
        <Icon name="plus" />
      </NavLink>
    </div>
  )
}
