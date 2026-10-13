import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export function IconButton({ icon, to, active = false, onClick, label = '', ...rest }) {
  const className = `icon-btn ${active ? 'is-active' : ''}`.trim()

  if (to) {
    // label уже есть в props, но в ветке ссылки он не доходил до разметки:
    // иконочная кнопка «назад» оставалась без доступного имени (ТЗ, §7).
    return (
      <Link to={to} className={className} aria-label={label || undefined}>
        <Icon name={icon} />
      </Link>
    )
  }

  return (
    <button className={className} type="button" onClick={onClick} aria-label={label || undefined}>
      <Icon name={icon} />
    </button>
  )
}

export default IconButton
