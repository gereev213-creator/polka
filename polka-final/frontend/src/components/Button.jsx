// Единая кнопка. Заменяет разнобой ghost-btn / cta-primary / cta-dark /
// mini-cta / send-btn. Состояния: loading (спиннер внутри, лейбл скрыт,
// защита от двойного тапа) и disabled — по ТЗ.
export function Button({
  children, variant = 'ghost', size = 'md', wide = false,
  loading = false, disabled = false, type = 'button', className = '', ...rest
}) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', wide ? 'btn-wide' : '', className]
    .filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : children}
    </button>
  )
}

export default Button
