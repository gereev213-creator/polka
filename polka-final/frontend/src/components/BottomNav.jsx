import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../api'
import { Icon } from './Icon'

/** Нижняя навигация в духе Memgift: капсула с четырьмя иконками и
 *  отдельная круглая кнопка действия справа.
 *
 *  Разделы прежние: Главная, Избранное, Чаты, Профиль — плюс «Подать»,
 *  которая стала круглой кнопкой. Активная вкладка — светлая подсветка.
 */
export function BottomNav() {
  const [unread, setUnread] = useState(0)
  const location = useLocation()
  useEffect(() => {
    let alive = true
    api.chatsUnread().then((d) => { if (alive) setUnread(Number(d?.count || 0)) }).catch(() => {})
    return () => { alive = false }
  }, [location.pathname])

  const tabs = [
    ['/', 'home'],
    ['/favorites', 'bookmark'],
    ['/chats', 'chat'],
    ['/profile', 'user'],
  ]
  return (
    <div className="tabbar-wrap">
      <div className="tabbar" role="navigation" aria-label="Основная навигация">
        <div className="tabbar-group">
          {tabs.map(([to, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => (isActive ? 'tabbar-item is-active' : 'tabbar-item')}
              aria-label={icon}>
              <Icon name={icon} />
              {to === '/chats' && unread > 0 ? <span className="tabbar-dot" /> : null}
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
