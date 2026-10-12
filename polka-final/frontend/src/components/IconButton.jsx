import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export function IconButton({ icon, to, active = false, onClick }) {
  const className = `icon-btn ${active ? 'is-active' : ''}`.trim()

  if (to) {
    return (
      <Link to={to} className={className}>
        <Icon name={icon} />
      </Link>
    )
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

export default IconButton
