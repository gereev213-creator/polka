import { Icon } from './Icon'

/** Поле поиска (спека v2): 40 px, радиус 8, фон --surface, лупа слева. */
export function Search({ value, onChange, placeholder = 'Поиск', onSubmit }) {
  return (
    <form className="ui-search" role="search"
      onSubmit={(e) => { e.preventDefault(); if (onSubmit) onSubmit() }}>
      <Icon name="search" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        aria-label={placeholder}
      />
    </form>
  )
}
