// Карточка — базовая поверхность. pad добавляет внутренние отступы.
export function Card({ children, pad = false, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`card ${pad ? 'card-pad' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

export default Card
