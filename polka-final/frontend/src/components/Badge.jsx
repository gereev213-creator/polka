// Бейдж. Тона совпадают с токенами --success/--warning/--danger.
export function Badge({ children, tone = 'muted', className = '' }) {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>
}

export default Badge
