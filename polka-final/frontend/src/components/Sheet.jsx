import { useEffect } from 'react'

/**
 * Нижний лист — единственный способ показать выбор на телефоне.
 *
 * Раньше «Ещё условия» раскрывались аккордеоном прямо в форме, и экран
 * превращался в простыню из двадцати чипов. Лист держит выбор в одном месте,
 * не растягивая страницу, и закрывается фоном, Escape или кнопкой «Готово».
 */
export default function Sheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title || 'Окно'}>
      <button type="button" className="sheet-dim" aria-label="Закрыть" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-grab" />
        {title ? <div className="sheet-title">{title}</div> : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
