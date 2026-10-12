import { Link, NavLink } from 'react-router-dom'
import { Icon } from './Icon'

export function BottomNav() {
  const location = useLocation()
  // Пять ОДНОРОДНЫХ пунктов, как в Avito: раньше было четыре подписанных
  // плюс кнопка и отдельный градиентный аватар — вместе шесть элементов,
  // и док выглядел перегруженным. Поиск убран: он и так крупным полем
  // в ленте. Профиль стал обычным пунктом вместо «пузыря».
  const items = [
    { icon: 'home', to: '/', label: 'Главная' },
    { icon: 'bookmark', to: '/favorites', label: 'Избранное' },
    { icon: 'chat', to: '/chats', label: 'Сообщения' },
    { icon: 'user', to: '/profile', label: 'Профиль' },
  ]

  const renderItem = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end
      className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
    >
      <span className="dock-icon"><Icon name={item.icon} /></span>
      <span className="dock-label">{item.label}</span>
    </NavLink>
  )

  return (
    <nav className="dock">
      {items.slice(0, 2).map(renderItem)}
      <NavLink to="/create" className="dock-create" aria-label="Разместить объявление">
        <Icon name="plus" />
      </NavLink>
      {items.slice(2).map(renderItem)}
    </nav>
  )
}

export default BottomNav
