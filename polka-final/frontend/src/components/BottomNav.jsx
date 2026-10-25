import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'

/** Нижняя навигация в духе Memgift: капсула с четырьмя иконками и
 *  отдельная круглая кнопка действия справа.
 *
 *  Разделы прежние: Главная, Избранное, Чаты, Профиль — плюс «Подать»,
 *  которая стала круглой кнопкой. Активная вкладка — светлая подсветка.
 */
export function BottomNav() {

  // Чатов больше нет: договариваются в мессенджере по контакту из карточки.
  // Третья вкладка — маркет (категории площадки), иконка заливная.
  const tabs = [
    ['/', 'home'],
    ['/search', 'market'],
    ['/favorites', 'bookmark'],
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
