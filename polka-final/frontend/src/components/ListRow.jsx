// Строка списка: слева превью/иконка, в центре заголовок и подпись, справа действие.
export function ListRow({ left = null, title = null, body = null, right = null, onClick = null, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`list-row ${className}`.trim()} onClick={onClick} type={onClick ? 'button' : undefined}>
      {left}
      <div className="list-row-body">
        {title ? <div className="list-row-title">{title}</div> : null}
        {body ? <div className="list-row-sub">{body}</div> : null}
      </div>
      {right}
    </Tag>
  )
}

export default ListRow
