import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../api'
import { Icon } from './Icon'

/** Нижняя навигация (спека v2, этап V1): пять равных вкладок.
 *
 * Раньше здесь была плавающая капсула с круглой кнопкой «+»: она
 * перекрывала контент и текст футера. Теперь обычная панель — сплошной
 * фон, линия сверху, высота 56 + safe-area, без анимаций и «стекла».
 * «Подать» — обычная вкладка с иконкой «плюс в квадрате».
 */
// unread приходит пропом: хук useApp живёт внутри App.jsx и наружу не отдаётся
export function BottomNav() {
  // Точка непрочитанных: одно число с сервера, обновляем при смене экрана.
  const [unread, setUnread] = useState(0)
  const location = useLocation()
  useEffect(() => {
    let alive = true
    api.chatsUnread().then((d) => { if (alive) setUnread(Number(d?.count || 0)) }).catch(() => {})
    return () => { alive = false }
  }, [location.pathname])
  // Вкладки строго по промту: Home · Search · Parser · Favorites · Profile.
  // Разделы не меняются — меняются только подписи и адреса, на которые они
  // ведут: «Поиск» ведёт на поиск, «Парсер» — на управление критериями.
  const tabs = [
    ['/', 'Home', 'home'],
    ['/search', 'Search', 'search'],
    ['/hunt', 'Parser', 'filter'],
    ['/favorites', 'Favorites', 'bookmark'],
    ['/profile', 'Profile', 'user'],
  ]
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {tabs.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'}
          className={({ isActive }) => (isActive ? 'tabbar-item is-active' : 'tabbar-item')}>
          <span className="tabbar-icon">
            <Icon name={icon === 'plus-square' ? 'plus' : icon} />
            {to === '/chats' && unread > 0 ? (
              <span className="tabbar-dot" aria-label={`Непрочитанных: ${unread}`} />
            ) : null}
          </span>
          <span className="tabbar-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
