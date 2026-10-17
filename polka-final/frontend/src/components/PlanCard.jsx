/** Плашка плана (спека v2): фон --accent-bg, без рамки и тени. */
export function PlanCard({ title, text, action }) {
  return (
    <div className="ui-plan">
      <div className="ui-plan-title">{title}</div>
      {text ? <div className="ui-plan-text">{text}</div> : null}
      {action || null}
    </div>
  )
}
