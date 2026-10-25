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
  // «Маркет» ведёт на вкладку «Барахолка» главной, а не в поиск.
  const tabs = [
    ['/?tab=findings', 'home'],
    ['/?tab=board', 'market'],
    ['/favorites', 'bookmark'],
    ['/profile', 'user'],
  ]
  const board = (location.search || '').includes('tab=board') ||
    (typeof window !== 'undefined' && (window.location.hash || '').includes('tab=board'))
  const isTabActive = (to) => {
    const path = location.pathname
    if (to === '/?tab=findings') return path === '/' && !board
    if (to === '/?tab=board') return path === '/' && board
    return path.startsWith(to)
  }

  const [pill, setPill] = useState({ x: 0, w: 0, ready: false })
  const lastIndex = useRef(-1)

  const activeIndex = Math.max(0, tabs.findIndex(([to]) => isTabActive(to)))

  const measure = (animate) => {
    const group = groupRef.current
    const el = itemRefs.current[activeIndex]
    if (!group || !el) return
    const g = group.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const next = { x: Math.round(r.left - g.left), w: Math.round(r.width), ready: true }
    setPill((prev) => (prev.x === next.x && prev.w === next.w && prev.ready
      ? prev                      // ничего не изменилось — не трогаем состояние
      : next))
  }

  // Пересчёт только при смене вкладки: раньше замер шёл ещё и по таймеру,
  // и плашка дважды дёргалась к одной и той же точке — отсюда дрожь.
  useLayoutEffect(() => {
    if (lastIndex.current === activeIndex) return
    lastIndex.current = activeIndex
    measure(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  useEffect(() => {
    // Поворот экрана/изменение ширины: переставляем без анимации
    const onResize = () => measure(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

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
              className={isTabActive(to) ? 'tabbar-item is-active' : 'tabbar-item'}
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
