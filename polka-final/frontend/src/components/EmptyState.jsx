// Пустое состояние. По ТЗ — подсказка, а не контейнер: без карточки-подложки.
// Иконка передаётся узлом, чтобы компонент не зависел от локальной иконки.
export function EmptyState({ text = 'Здесь пока пусто', icon = null, action = null }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{text}</p>
      {action}
    </div>
  )
}

export default EmptyState
