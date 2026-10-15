import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

// Меню уезжает при листании ВНИЗ и возвращается при листании ВВЕРХ:
// на телефоне док иначе закрывает объявления на пол-экрана.
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
          setHidden(false)          // в самом верху меню всегда на месте
        } else if (delta > 8) {
          setHidden(true)           // порог 8 px против дрожания
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

// Плавный уход считаем САМИ, по кадрам, а не через CSS-transition: правило из
// файла стилей перебивалось другими объявлениями .dock, а на части
// Android-браузеров анимация transform вместе с размытием фона вообще не
// запускалась — меню исчезало рывком. Здесь позиция меняется каждый кадр.
function useDockAnimation(hidden) {
  const [progress, setProgress] = useState(0) // 0 — видно, 1 — уехало
  const state = useRef({ value: 0, raf: 0 })

  useEffect(() => {
    const target = hidden ? 1 : 0
    const from = state.current.value
    const duration = 380
    const start = performance.now()
    cancelAnimationFrame(state.current.raf)
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3) // мягкое торможение к концу
      const value = from + (target - from) * eased
      state.current.value = value
      setProgress(value)
      if (p < 1) state.current.raf = requestAnimationFrame(step)
    }
    state.current.raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(state.current.raf)
  }, [hidden])

  return progress
}

export function BottomNav() {
  const location = useLocation()
  const hidden = useHideOnScroll()
  const progress = useDockAnimation(hidden)
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
    // Позицию и прозрачность задаём из покадровой анимации. Перенос по Y —
    // 140% высоты меню, то есть полностью за край экрана. Размытие фона при
    // движении выключаем: с ним часть браузеров не перерисовывает кадры.
    <nav
      className="dock"
      data-dock={progress.toFixed(2)}
      style={{
        transform: `translate3d(-50%, ${(progress * 140).toFixed(2)}%, 0)`,
        opacity: (1 - progress).toFixed(2),
        pointerEvents: progress > 0.5 ? 'none' : 'auto',
        transition: 'none',
        ...(progress > 0.01
          ? { backdropFilter: 'none', WebkitBackdropFilter: 'none' }
          : null),
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
