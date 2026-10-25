import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

/** Нижняя навигация: капсула с четырьмя иконками и круглая кнопка справа.
 *
 *  Подсветка активной вкладки — просто фон у самой вкладки. Раньше была
 *  одна плашка, которая переезжала между вкладками, но её позиция зависела
 *  от замера геометрии и при каждом переходе дёргалась. Статичная подсветка
 *  не двигается вообще, поэтому дрыганья нет.
 */
export function BottomNav() {
  const location = useLocation()

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

  return (
    <div className="tabbar-wrap">
      <div className="tabbar" role="navigation" aria-label="Основная навигация">
        <div className="tabbar-group">
          {tabs.map(([to, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}
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
