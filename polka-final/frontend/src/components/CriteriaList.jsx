import { Badge } from './Badge'
import { Card } from './Card'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

/** Список критериев ловли — один вид на обеих вкладках поиска.
 *
 * Раньше карточки рисовались в двух местах по-разному: во «Вручную» были
 * чипы с ценой, свежестью и режимом, а в ИИ-поиске — только название и
 * «до N ₽». Один и тот же критерий выглядел как два разных, и человек
 * не понимал, что список общий. Теперь разметка живёт здесь и обе вкладки
 * показывают одно и то же.
 */
export function CriteriaList({ items = [], loading = false, onRemove, title = 'Мои критерии' }) {
  return (
    <>
      <div className="section-head">
        <strong>{title}</strong>
        <span>{items.length}</span>
      </div>
      {loading ? <Skeleton text="Загружаем критерии" rows={2} /> : null}
      {!loading && !items.length ? (
        <EmptyState text="Пока ничего не ловим. Добавьте первый критерий — поле выше."
          icon={<Icon name="search" />} />
      ) : null}
      <div className="list-stack">
        {items.map((c) => (
          <Card key={c.id} pad className="hunt-crit">
            <div className="hunt-row">
              <strong>{c.query}{c.city ? ` · ${c.city}` : ''}</strong>
              <span className="hunt-crit-status">
                {c.ready
                  ? `обычная цена ${money(c.median_price)} ₽ · ${c.sample_size} шт`
                  : 'ищем подходящие'}
              </span>
              {/* Параметры критерия — чипами: длинная серая строка в 2–3
                  строки не читалась, а так видно цену, свежесть и режим. */}
              <div className="hunt-crit-chips">
                <Badge>{c.mode === 'deal' ? 'только выгоднее рынка' : 'любые подходящие'}</Badge>
                {c.min_price ? <Badge>от {money(c.min_price)} ₽</Badge> : null}
                {c.max_price ? <Badge>до {money(c.max_price)} ₽</Badge> : null}
                {c.max_hours ? <Badge>за {c.max_hours} ч</Badge> : null}
                {c.with_photo ? <Badge>с фото</Badge> : null}
              </div>
            </div>
            <button type="button" className="chat-crit-x" aria-label="Убрать критерий"
              onClick={() => onRemove && onRemove(c.id)}>
              <Icon name="trash" />
            </button>
          </Card>
        ))}
      </div>
    </>
  )
}
