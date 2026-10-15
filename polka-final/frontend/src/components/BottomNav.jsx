import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

// Меню уезжает при листании ВНИЗ и возвращается при листании ВВЕРХ —
// на телефоне док иначе закрывает объявления на пол-экрана.
// Порог 8 пикселей убирает дрожание от инерционного скролла,
// в самом верху меню всегда на месте.
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = 0
    let planned = 0
    // Листается не окно, а внутренний контейнер приложения: событие scroll
    // не всплывает, поэтому слушаем в фазе перехвата и берём позицию
    // у того элемента, который действительно прокрутился.
    const position = (target) => {
      if (!target || target === document || target === window) {
        return window.scrollY || document.documentElement.scrollTop || 0
      }
      if (typeof target.scrollTop === 'number') return target.scrollTop
      return window.scrollY || 0
    }
    const onScroll = (event) => {
      if (planned) return
      planned = requestAnimationFrame(() => {
        planned = 0
        const y = position(event.target)
        const delta = y - last
        if (y < 80) {
          setHidden(false)
        } else if (delta > 8) {
          setHidden(true)
        } else if (delta < -8) {
          setHidden(false)
        }
        if (Math.abs(delta) > 8) last = y
      })
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      if (planned) cancelAnimationFrame(planned)
    }
  }, [])
  return hidden
}


export function BottomNav() {
  const location = useLocation()
  const hidden = useHideOnScroll()
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
    // Анимация задана ПРЯМО на элементе: правило из файла стилей может
    // перебить другое объявление .dock (их несколько), а inline-стиль — нет.
    // Размытие фона на время ухода выключаем: часть Android-браузеров
    // не анимирует элемент с backdrop-filter, и движение выглядит рывком.
    <nav
      className={hidden ? 'dock hidden' : 'dock'}
      style={{
        transition: 'transform 380ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease',
        willChange: 'transform, opacity',
        transform: hidden ? 'translate3d(-50%, 140%, 0)' : 'translate3d(-50%, 0, 0)',
        opacity: hidden ? 0 : 1,
        ...(hidden ? { backdropFilter: 'none', WebkitBackdropFilter: 'none' } : null),
      }}
    >
      {items.slice(0, 2).map(renderItem)}
      <NavLink to="/create" className="dock-create" aria-label="Разместить объявление">
        <Icon name="plus" />
      </NavLink>
      {items.slice(2).map(renderItem)}
    </nav>
  )
}

export default BottomNav
