// Поле ввода дизайн-системы: обычный .input плюс подсказка и ошибка под ним.
// Используется на экране «Мои критерии» (/hunt/manual).
export function Input({ hint = '', error = '', className = '', ...rest }) {
  const cls = ['input', error ? 'is-invalid' : '', className].filter(Boolean).join(' ')
  return (
    <>
      <input className={cls} {...rest} />
      {hint && !error ? <div className="field-hint">{hint}</div> : null}
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </>
  )
}

export default Input
