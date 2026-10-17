/** Сгруппированный список (спека v2): рамка вокруг группы, разделители 1 px. */
export function ListGroup({ title, children }) {
  return (
    <div className="ui-group">
      {title ? <div className="ui-group-title">{title}</div> : null}
      <div className="ui-group-body">{children}</div>
    </div>
  )
}
