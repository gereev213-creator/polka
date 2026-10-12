// Ошибка сети. По ТЗ обязательна кнопка «Повторить» — иначе человек
// не понимает, что делать, и закрывает приложение.
export function ErrorState({ text = 'Не удалось загрузить данные.', onRetry = null }) {
  return (
    <div className="error-state">
      <p>{text}</p>
      {onRetry ? (
        <button type="button" className="btn btn-ghost btn-wide" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState
