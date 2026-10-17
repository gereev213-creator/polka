/** Подчёркнутые текстовые вкладки (спека v2): не капсула, а линия под словом. */
export function Tabs({ items = [], value, onChange }) {
  return (
    <div className="ui-tabs" role="tablist">
      {items.map(([key, label]) => (
        <button key={key} type="button" role="tab"
          aria-selected={value === key}
          className={value === key ? 'ui-tab is-active' : 'ui-tab'}
          onClick={() => onChange && onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}
