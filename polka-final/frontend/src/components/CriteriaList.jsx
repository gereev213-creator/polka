import { Badge } from './Badge'
import { Card } from './Card'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

const CONDITION_NAMES = {
  new: 'новое',
  excellent: 'отличное',
  good: 'хорошее',
  worn: 'с износом',
  broken: 'с дефектами',
}

/** Выбранные требования критерия — человеческими словами для чипов.
 *
 * Показываем именно то, что человек отметил (или что подставил шаблон):
 * «АКБ ≥ 80 %», «состояние: хорошее», «только оригинал», «с рук»,
 * «не вскрывался». Без этого критерий выглядел пустым, хотя требования есть.
 */
function reqChips(c) {
  const req = c.requirements_json || {}
  const out = []
  if (req.battery_min) out.push(`АКБ ≥ ${req.battery_min}%`)
  if (req.condition_min && req.condition_min !== 'any') {
    out.push(`состояние: ${CONDITION_NAMES[req.condition_min] || req.condition_min}`)
  }
  if (req.original_only) out.push('только оригинал')
  if (req.private_only) out.push('с рук')
  if (req.not_opened) out.push('не вскрывался')
  if (c.requirements && String(c.requirements).trim()) out.push(String(c.requirements).trim())
  return out
}

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
                {c.strict_model ? <Badge>строго эта модель</Badge> : null}
                {(c.exclude || []).length
                  ? <Badge>не: {(c.exclude || []).join(', ')}</Badge>
                  : null}
                {/* Требования, которые человек выбрал в диалоге или шаблоне:
                    АКБ, состояние, оригинальность, «с рук». Раньше они не
                    показывались, и критерий «iPhone 13» с «АКБ ≥ 80 %»
                    выглядел как обычный поиск — будто ничего не выбрано. */}
                {reqChips(c).map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
              {/* Подсказка по здоровью критерия: почему молчит или почему
                  сыплет слишком многим. Без неё человек не понимает причину. */}
              {c.hint ? <div className="chat-note">{c.hint}</div> : null}
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
