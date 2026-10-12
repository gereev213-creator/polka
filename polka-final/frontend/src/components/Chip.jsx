// Чип-фильтр. Один компонент на все плашки: категории, состояние, сортировка.
export function Chip({ children, active = false, className = '', ...rest }) {
  return (
    <button type="button" className={`chip ${active ? 'is-active' : ''} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

export default Chip
