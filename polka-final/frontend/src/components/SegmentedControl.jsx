// Сегмент-переключатель. Заменяет самодельные табы «Находки / Барахолка»,
// «ИИ-поиск / Вручную». Роль tablist — для скринридеров.
export function SegmentedControl({ options = [], value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`.trim()} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default SegmentedControl
