// Аватар с фолбэком на инициалы — если картинки нет или она не загрузилась.
export function Avatar({ src = '', name = '', size = 'md', className = '' }) {
  const initials = String(name || '').trim().replace(/^@/, '').slice(0, 2).toUpperCase()
  const cls = ['avatar', size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : '', className]
    .filter(Boolean).join(' ')
  return (
    <span className={cls}>
      {src ? <img src={src} alt="" loading="lazy" /> : (initials || '—')}
    </span>
  )
}

export default Avatar
