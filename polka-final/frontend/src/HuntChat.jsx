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

export default function HuntChat() {
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
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

  const chips = draft ? reqChips(draft.requirements_json) : []
  const showFinal = ready && draft && draft.query

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <button type="button" className="chat-back" onClick={() => navigate('/')} aria-label="Назад">
          <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
        </button>
        <div className="page-title chat-header-title">Поиск лотов</div>
      </div>
      <div className="chat-tabs">
        <span className="chat-tabs-pill" aria-hidden="true" />
        <button type="button" className="chat-tab is-active">Поиск словами</button>
        <button type="button" className="chat-tab" onClick={() => navigate('/hunt/manual')}>Вручную</button>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && !showFinal ? (
          <div className="chat-start">
            <div className="chat-hello">Найду дешёвые лоты по твоим условиям</div>
            <div className="chat-hello-sub">Напиши словами — подберу фильтры сам</div>
            <div className="chat-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chat-example" onClick={() => setText(ex)}>{ex}</button>
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
            {ask.text ? <div className="chat-bubble">{ask.text}</div> : null}
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
                {draft.max_price ? <div className="chat-crit-sub">до {money(draft.max_price)} ₽</div> : null}
                {draft.city ? <div className="chat-crit-sub">{draft.city}</div> : null}
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
            <div className="chat-final-actions">
              <button type="button" className="cta-primary" onClick={create} disabled={busy}>Найти лоты</button>
              <button type="button" className="chat-chip" onClick={restart}>Заново</button>
            </div>
          </div>
        ) : null}
      </div>

      {!showFinal ? (
        <div className="chat-input glow-field">
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
