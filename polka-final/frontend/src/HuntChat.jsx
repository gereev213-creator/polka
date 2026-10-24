import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { CriteriaList } from './components/CriteriaList'

// ── Поиск лотов: чат с ИИ (этап G) ──────────────────────────────────────────
// Единый диалог: состояние (draft и заданные слоты) хранит СЕРВЕР в
// /api/hunt/dialog. Здесь только: отправляем message/choice, рисуем say и
// кнопки ask.options, показываем итоговую карточку и создаём критерий.
// Жёсткие шаги (память→батарея→вскрытие→цена) убраны — порядок задаёт сервер.

const EXAMPLES = ['iPhone 15 pro, до 55 000 ₽', 'Кроссовки Nike, размер 43', 'Ноутбук, до 80 000 ₽']

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

const COND_LABEL = { good: 'хорошее', excellent: 'идеальное', new: 'новое', worn: 'с износом' }

function reqChips(req = {}) {
  const chips = []
  if (req.condition_min && COND_LABEL[req.condition_min]) chips.push(COND_LABEL[req.condition_min])
  if (req.battery_min) chips.push(`АКБ ≥ ${req.battery_min}%`)
  if (req.original_only) chips.push('оригинал')
  if (req.private_only) chips.push('с рук')
  return chips
}

// Компактное «12 минут назад / сегодня / 24 окт»: relTime из App.jsx
// сюда не импортируется, а без него блок находок падал бы в рантайме.
// Склонение числа находок: «1 находка / 2 находки / 5 находок».
// Без него в интерфейсе было «2 находок».
function findingsWord(n) {
  const v = Math.abs(Number(n) || 0) % 100
  const d = v % 10
  if (v > 10 && v < 20) return 'находок'
  if (d === 1) return 'находка'
  if (d >= 2 && d <= 4) return 'находки'
  return 'находок'
}

function relTime(item) {
  const raw = item && (item.published_at || item.created_at || item.parsed_at)
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} ч назад`
  if (mins < 48 * 60) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function HuntChat() {
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  // Ссылка с Авито — главный способ задать критерий.
  const [link, setLink] = useState('')
  const [linkResult, setLinkResult] = useState('')
  const [linkLimit, setLinkLimit] = useState(false)
  // Последние находки под ответом: по макету 02 их видно сразу
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [ask, setAsk] = useState(null)
  const [draft, setDraft] = useState(null)
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState([])
  const [criteria, setCriteria] = useState([])
  const [criteriaLoading, setCriteriaLoading] = useState(true)
  const [limitMsg, setLimitMsg] = useState('')

  const loadCriteria = () => {
    setCriteriaLoading(true)
    api.getCriteria()
      .then((d) => setCriteria((d && (d.items || d.criteria)) || []))
      .catch(() => {})
      .finally(() => setCriteriaLoading(false))
  }
  useEffect(() => { loadCriteria() }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, draft, ready, ask])

  const say = (from, value) => setMessages((prev) => [...prev, { from, text: value }])

  const applyResponse = (res) => {
    if (res.session_id) setSessionId(res.session_id)
    if (res.say) say('ai', res.say)
    setAsk(res.ask || null)
    setDraft(res.draft || null)
    setReady(Boolean(res.ready))
    setNotes(res.notes || [])
  }

  const send = async () => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    say('me', value)
    setBusy(true)
    setLimitMsg('')
    try {
      const res = await api.huntDialog({ session_id: sessionId || undefined, message: value })
      applyResponse(res)
    } catch (e) {
      say('ai', (e && e.message) || 'Не удалось понять запрос')
    } finally {
      setBusy(false)
    }
  }

  const tap = async (value) => {
    if (busy) return
    say('me', value)
    setBusy(true)
    setLimitMsg('')
    try {
      const res = await api.huntDialog({ session_id: sessionId || undefined, choice: value })
      applyResponse(res)
    } catch (e) {
      say('ai', (e && e.message) || 'Ошибка связи')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!draft || busy) return
    setBusy(true)
    try {
      await api.addCriterion({
        query: draft.query,
        category: draft.category,
        max_price: draft.max_price || 0,
        min_price: draft.min_price || 0,
        city: draft.city || '',
        mode: 'any',
        requirements: '',
        requirements_json: draft.requirements_json || {},
        // Слова-исключения из диалога: «без чехлов», «не запчасти»
        exclude: (draft.exclude || []).join(', '),
      })
      say('ai', 'Критерий создан. Пришлю, как только появится подходящее.')
      setDraft(null); setReady(false); setAsk(null); setNotes([]); setSessionId('')
      loadCriteria()
    } catch (e) {
      if (e && (e.code === 'limit_reached' || e.status === 402)) {
        setLimitMsg((e && e.detail) || 'Достигнут лимит критериев — откройте ещё слоты в «Плюсе»')
      } else if (await createdDespiteError()) {
        // Ответ не дошёл (таймаут), но критерий на сервере уже создан:
        // раньше в этом случае показывали ошибку, хотя всё сработало.
        say('ai', 'Критерий создан. Пришлю, как только появится подходящее.')
        setDraft(null); setReady(false); setAsk(null); setNotes([]); setSessionId('')
        loadCriteria()
      } else {
        say('ai', (e && e.detail) || 'Не удалось создать критерий')
      }
    } finally {
      setBusy(false)
    }
  }

  // Даже если запрос упал по таймауту, критерий мог создаться на сервере.
  // Проверяем список и считаем это успехом — иначе человек видит ошибку
  // и жмёт снова, хотя всё уже работает.
  const createdDespiteError = async () => {
    try {
      const data = await api.getCriteria()
      const want = (draft?.query || '').trim().toLowerCase()
      if (!want) return false
      return (data.items || []).some(
        (c) => (c.query || '').trim().toLowerCase() === want,
      )
    } catch {
      return false
    }
  }

  const remove = async (id) => {
    try { await api.removeCriterion(id) } catch { /* ignore */ }
    loadCriteria()
  }

  const restart = () => {
    setMessages([]); setDraft(null); setReady(false); setAsk(null)
    setNotes([]); setSessionId(''); setLimitMsg('')
  }

  const submitLink = async () => {
    // Пробелы и переводы строк при вставке с телефона ломали ссылку
    const url = link.replace(/\s+/g, '')
    if (!url) return
    setLinkResult('')
    try {
      const r = await api.huntFromLink(url)
      if (r.existing) {
        setLinkResult('Такой критерий уже есть — он работает.')
      } else {
        const parts = [`Критерий создан: ${r.query}`]
        if (r.city) parts.push(`город ${r.city}`)
        parts.push(r.filters ? 'фильтры Авито применены' : 'без фильтров Авито')
        setLinkResult(parts.join(' · '))
      }
      setLink('')
      load()
    } catch (e) {
      // Лимит критериев — самый частый случай: ссылка верная, но мест нет.
      if ((e && e.error) === 'limit' || String(e && e.detail || '').includes('лимит')) {
        setLinkLimit(true)
        setLinkResult('')
      } else {
        const why = [e && e.detail, e && e.error, e && e.status ? `код ${e.status}` : '']
          .filter(Boolean).join(' · ')
        setLinkResult(why || 'Не удалось разобрать ссылку. Нужна ссылка с фильтрами Авито.')
      }
    }
  }

  const chips = draft ? reqChips(draft.requirements_json) : []
  const showFinal = ready && draft && draft.query
  useEffect(() => {
    if (!showFinal) return
    api.getFindings({ limit: 3 })
      .then((d) => setRecent((d.items || []).slice(0, 3)))
      .catch(() => setRecent([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFinal])

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <button type="button" className="chat-back" onClick={() => navigate('/hunt')} aria-label="Назад">
          <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
        </button>
        <div className="page-title chat-header-title">Поиск словами</div>
      </div>
      {/* Вкладки убраны: главный вход — ссылка с Авито. Ручная настройка
          осталась отдельной текстовой ссылкой внизу экрана. */}

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && !showFinal ? (
          <div className="chat-start">
            {/* Главный путь — ссылка с Авито: фильтры ставит человек на самой
                площадке, мы не угадываем параметры. */}
            <div className="chat-kicker">Опишите словами</div>
            <div className="chat-hello">Скажите, что ищете — поиск идёт без вас</div>
            <div className="chat-hello-sub">
              Проверяем Авито в течение часа и присылаем только новые объявления.
            </div>
            {/* Тап по примеру сразу отправляет его: раньше он только
                подставлял текст в поле, и человек искал, что нажать. */}
            <div className="chat-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chat-example" onClick={() => tap(ex)}>{ex}</button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={m.from === 'me' ? 'chat-row is-me' : 'chat-row'}>
            <div className={m.from === 'me' ? 'chat-bubble is-me' : 'chat-bubble'}>{m.text}</div>
          </div>
        ))}

        {ask && !showFinal ? (
          <div className="chat-replies">
            {/* Текст вопроса приходит в пузыре выше; повторять его здесь
                нельзя — на экране было две одинаковые фразы подряд. */}
            {(ask.options || []).map((opt) => (
              <button key={opt} type="button" className="chat-chip" onClick={() => tap(opt)}>{opt}</button>
            ))}
          </div>
        ) : null}

        {showFinal ? (
          <div className="chat-final">
            <div className="chat-crit-card">
              <div className="chat-crit-body">
                <div className="chat-crit-title">Буду искать: {draft.query}</div>
                {/* Таблица условий по макету 02: четыре ячейки вместо
                    сплошного текста — видно, что именно поняли. */}
                <div className="crit-grid">
                  <div className="crit-cell">
                    <span className="crit-cell-k">Категория</span>
                    <span className="crit-cell-v">{draft.category || 'любая'}</span>
                  </div>
                  <div className="crit-cell">
                    <span className="crit-cell-k">Размер</span>
                    <span className="crit-cell-v">{draft.size || '—'}</span>
                  </div>
                  <div className="crit-cell">
                    <span className="crit-cell-k">Цена</span>
                    <span className="crit-cell-v">
                      {draft.max_price ? `до ${money(draft.max_price)} ₽` : 'любая'}
                    </span>
                  </div>
                  <div className="crit-cell">
                    <span className="crit-cell-k">Город</span>
                    <span className="crit-cell-v">{draft.city || 'любой'}</span>
                  </div>
                </div>
                {(draft.exclude || []).length ? (
                  <div className="chat-replies">
                    <span className="chat-chip">не: {(draft.exclude || []).join(', ')}</span>
                  </div>
                ) : null}
                {chips.length ? (
                  <div className="chat-replies">
                    {chips.map((c) => <span key={c} className="chat-chip">{c}</span>)}
                  </div>
                ) : null}
              </div>
            </div>
            {notes.map((n, i) => <div key={i} className="chat-note">{n}</div>)}
            {limitMsg ? (
              <div className="chat-note chat-note-warn">
                {limitMsg}{' '}
                <button type="button" className="link-btn" onClick={() => navigate('/tariffs')}>Тарифы</button>
              </div>
            ) : null}
            {/* По макету 02: «Изменить» и «Показать N находок» рядом.
                «Заново» осталось в шапке — в теле оно мешало. */}
            <div className="chat-final-actions">
              <button type="button" className="ghost-btn"
                onClick={() => document.querySelector('.chat-input input')?.focus()}>
                Изменить
              </button>
              <button type="button" className="cta-primary" onClick={create} disabled={busy}>
                Показать находки
              </button>
            </div>
            {recent.length ? (
              <div className="recent-block">
                <div className="recent-head">
                  <span>{recent.length} {findingsWord(recent.length)} за неделю</span>
                  <button type="button" className="recent-all" onClick={() => navigate('/')}>Все →</button>
                </div>
                {recent.map((it) => (
                  <button key={it.id} type="button" className="recent-row"
                    onClick={() => navigate(`/listing/${it.id}`)}>
                    <span className="recent-body">
                      <span className="recent-title">{it.title}</span>
                      <span className="recent-meta">{[it.city, relTime(it)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="recent-price">
                      {Number(it.price || 0).toLocaleString('ru-RU')} ₽
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!showFinal ? (
        <div className="chat-input">
          <input className="text-input" value={text} placeholder="Напиши, что ищешь…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
          <button type="button" className="chat-send" aria-label="Отправить"
            disabled={busy || !text.trim()} onClick={send}>
            <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true"><path d="M3 20l18-8L3 4v6l12 2-12 2z" /></svg>
          </button>
        </div>
      ) : null}

      {/* Тот же список, что на вкладке «Вручную»: один критерий должен
          выглядеть одинаково на обеих вкладках (чипы цены, режима, свежести). */}
      {criteria.length ? (
        <div className="chat-crit">
          <CriteriaList items={criteria} loading={criteriaLoading} onRemove={remove} />
        </div>
      ) : null}
    </div>
  )
}
