import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'

// ── Поиск лотов: чат с ИИ ──────────────────────────────────────────────────
// Два способа в одном экране, переключатель сверху. Здесь — ИИ-поиск:
// человек пишет фразу, бот уточняет кнопками и собирает критерий.
// Ручной ввод — на соседней вкладке (/hunt/manual).
//
// Ниже чата список созданных критериев: видно, что поиск действительно идёт.

const FIRST_QUESTION = {
  odezhda_obuv_aksessuary: { title: 'Какой размер?', options: ['39', '40', '41', '42', '43', '44', '45'], skip: 'любой' },
  telefony: { title: 'Сколько памяти?', options: ['64', '128', '256', '512'], skip: 'любая' },
  planshety_i_elektronnye_knigi: { title: 'Сколько памяти?', options: ['32', '64', '128', '256'], skip: 'любая' },
  noutbuki: { title: 'Сколько оперативной памяти?', options: ['8', '16', '32'], skip: 'любая' },
  avtomobili: { title: 'Какой год или новее?', options: ['2010', '2014', '2018', '2021'], skip: 'любой' },
}

const PRICES = [
  { label: 'до 5 000', value: 5000 },
  { label: 'до 10 000', value: 10000 },
  { label: 'до 20 000', value: 20000 },
  { label: 'без ограничения', value: 0 },
]

const EXAMPLES = ['iPhone 15 pro, до 55 000 ₽', 'Кроссовки Nike, размер 43', 'Ноутбук, до 80 000 ₽']

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

export default function HuntChat() {
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [criteria, setCriteria] = useState([])

  const loadCriteria = () => {
    api.getCriteria().then((d) => setCriteria((d && (d.items || d.criteria)) || [])).catch(() => {})
  }
  useEffect(() => { loadCriteria() }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, draft])

  const say = (from, value) => setMessages((prev) => [...prev, { from, text: value }])

  // Разбор фразы словами
  const parse = async (value) => {
    const phrase = String(value || '').trim()
    if (!phrase || busy) return
    say('me', phrase)
    setBusy(true)
    try {
      const parsed = await api.parseHunt(phrase)
      if (!parsed || !parsed.ok) {
        say('ai', (parsed && parsed.error) || 'Не получилось разобрать запрос')
        return
      }
      const next = {
        query: parsed.query || phrase,
        max_price: Number(parsed.max_price) || 0,
        min_price: Number(parsed.min_price) || 0,
        category: parsed.category || '',
        step: 'first',
      }
      const question = FIRST_QUESTION[next.category]
      if (question) {
        setDraft(next)
        say('ai', `Понял: ${next.query}. ${question.title}`)
      } else {
        next.step = 'price'
        setDraft(next)
        say('ai', `Понял: ${next.query}. До какой цены?`)
      }
    } catch (e) {
      say('ai', (e && e.message) || 'Ошибка связи с сервером')
    } finally {
      setBusy(false)
    }
  }

  const answerFirst = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'price' }
    const word = String(value || '').trim()
    const parts = String(next.query || '').split(/\s+/).filter(Boolean)
    // Дописываем только то, чего ещё нет: иначе размер попадал в запрос дважды
    if (word && !parts.includes(word)) next.query = [...parts, word].join(' ')
    setDraft(next)
    say('me', word || 'любой')
    say('ai', 'До какой цены?')
  }

  const answerPrice = (value) => {
    if (!draft) return
    const next = { ...draft, max_price: Number(value) || 0, step: 'done' }
    setDraft(next)
    const label = PRICES.find((p) => p.value === (Number(value) || 0))
    say('me', label ? label.label : 'без ограничения')
    say('ai', 'Готово — проверьте и нажмите «Найти лоты»')
  }

  const send = () => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    // Если идёт диалог — это ОТВЕТ на вопрос, а не новая фраза
    if (draft && draft.step === 'first') return answerFirst(value)
    if (draft && draft.step === 'price') {
      const digits = (value.match(/\d+/g) || []).map(Number)
      return answerPrice(digits.length ? Math.max(...digits) : 0)
    }
    parse(value)
  }

  const create = async () => {
    if (!draft || busy) return
    setBusy(true)
    try {
      await api.addCriterion({
        query: draft.query,
        category: draft.category,
        max_price: draft.max_price,
        min_price: draft.min_price,
        mode: 'any',
      })
      say('ai', 'Критерий создан. Пришлю, как только появится подходящее.')
      setDraft(null)
      loadCriteria()
    } catch (e) {
      say('ai', (e && e.message) || 'Не удалось создать критерий')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await api.removeCriterion(id)
      loadCriteria()
    } catch (e) {
      loadCriteria()
    }
  }

  const restart = () => { setDraft(null); setMessages([]) }

  const question = draft && draft.step === 'first' ? FIRST_QUESTION[draft.category] : null
  const empty = messages.length === 0 && !draft

  return (
    <div className="chat-wrap">
      <div className="chat-tabs">
        <button type="button" className="chat-tab is-active">ИИ-поиск</button>
        <button type="button" className="chat-tab" onClick={() => navigate('/hunt/manual')}>Вручную</button>
      </div>

      <div className="chat-list" ref={listRef}>
        {empty ? (
          <div className="chat-start">
            <div className="chat-robot">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <rect x="12" y="18" width="40" height="30" rx="12" fill="var(--accent)" />
                <circle cx="25" cy="33" r="4" fill="#fff" />
                <circle cx="39" cy="33" r="4" fill="#fff" />
                <rect x="30" y="8" width="4" height="8" rx="2" fill="var(--accent)" />
                <circle cx="32" cy="7" r="4" fill="var(--accent-soft, #8FB4FF)" />
              </svg>
            </div>
            <div className="chat-hello">Привет! Я помогу найти лучшие лоты</div>
            <div className="chat-hello-sub">Напиши, что ищешь — я сам подберу и применю фильтры.</div>
            <div className="chat-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chat-example" onClick={() => parse(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={m.from === 'me' ? 'chat-row is-me' : 'chat-row'}>
            <div className={m.from === 'me' ? 'chat-bubble is-me' : 'chat-bubble'}>{m.text}</div>
          </div>
        ))}

        {question ? (
          <div className="chat-replies">
            {question.options.map((opt) => (
              <button key={opt} type="button" className="chat-chip" onClick={() => answerFirst(opt)}>
                {opt}
              </button>
            ))}
            <button type="button" className="chat-chip" onClick={() => answerFirst('')}>
              {question.skip}
            </button>
          </div>
        ) : null}

        {draft && draft.step === 'price' ? (
          <div className="chat-replies">
            {PRICES.map((p) => (
              <button key={p.label} type="button" className="chat-chip" onClick={() => answerPrice(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        ) : null}

        {busy ? <div className="chat-row"><div className="chat-bubble is-typing">Разбираю…</div></div> : null}

        {draft && draft.step === 'done' ? (
          <div className="chat-summary">
            <div className="chat-summary-title">Буду искать</div>
            <div className="chat-summary-line">{draft.query}</div>
            <div className="chat-summary-line muted">
              {draft.max_price ? `до ${money(draft.max_price)} ₽` : 'без ограничения по цене'}
            </div>
            <div className="chat-summary-actions">
              <button type="button" className="cta-primary is-wide" disabled={busy} onClick={create}>
                {busy ? 'Создаю…' : 'Найти лоты'}
              </button>
              <button type="button" className="ghost-btn" onClick={restart}>Заново</button>
            </div>
          </div>
        ) : null}
      </div>

      {(!draft || draft.step !== 'done') ? (
        <div className="chat-input">
          <input className="text-input" value={text} placeholder="Напиши, что ищешь…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
          <button type="button" className="chat-send" disabled={busy || !text.trim()} onClick={send}>
            <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true">
              <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
            </svg>
          </button>
        </div>
      ) : null}

      {criteria.length ? (
        <div className="chat-crit">
          <div className="chat-crit-head">Мои критерии<span>{criteria.length}</span></div>
          {criteria.map((c) => (
            <div key={c.id} className="chat-crit-card">
              <div className="chat-crit-body">
                <div className="chat-crit-title">{c.query}</div>
                <div className="chat-crit-sub">
                  {(c.matches || c['подходит'])
                    ? `нашлось ${c.matches || c['подходит']}`
                    : 'пока пусто — как появится, пришлю'}
                  {c.max_price ? ` · до ${money(c.max_price)} ₽` : ''}
                </div>
              </div>
              <button type="button" className="chat-crit-x" onClick={() => remove(c.id)}>✕</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
