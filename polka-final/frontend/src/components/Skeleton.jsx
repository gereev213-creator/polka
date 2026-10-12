// Скелетон загрузки. По ТЗ заменяет текстовую заглушку «Загрузка…»:
// пустой серый экран во время запроса выглядит как поломка.
export function Skeleton({ text = 'Загрузка…', rows = 3, variant = 'card' }) {
  if (variant === 'grid') {
    return (
      <div className="sk-grid" role="status" aria-label={text}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="sk-card" key={i}>
            <div className="sk-box" />
            <div className="sk-line" />
            <div className="sk-line sk-line--short" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="sk-stack" role="status" aria-label={text}>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="sk-line" key={i} />
      ))}
    </div>
  )
}

export default Skeleton
