/** Stat-строка профиля (спека v2): три числа в одной рамке с разделителями. */
export function Stat({ items = [] }) {
  return (
    <div className="ui-stat">
      {items.map(([label, value], i) => (
        <div key={label} className={i ? 'ui-stat-cell is-divided' : 'ui-stat-cell'}>
          <div className="ui-stat-value">{value ?? 0}</div>
          <div className="ui-stat-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
