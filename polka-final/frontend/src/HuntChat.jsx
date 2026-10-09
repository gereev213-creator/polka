import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'

// ── Поиск лотов в виде чата ────────────────────────────────────────────────
// Человек пишет фразу, ИИ разбирает её и задаёт уточняющие вопросы —
// кнопками. Один тап вместо набора. В конце видно, что именно будет
// искать, и кнопка «Найти лоты».
//
// Форма с фильтрами осталась — на неё ведёт «Настроить вручную»,
// маршрут /hunt/manual. Кто привык к полям, ничего не потерял.

// Что спросить первым — зависит от товара. У обуви размер, у телефона
// память, у машины год: одно общее «что уточнить?» тут не работает.
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

const money = (n) => Number(n || 0).toLocaleString('ru-RU')

export default function HuntChat() {
  const navigate = useNavigate()
  const listRef = useRef(null)
  const [messages, setMessages] = useState([
    { from: 'ai', text: 'Напишите, что ищете. Например: ботинки timberland 43' },
  ])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // Собираемый критерий: запрос, цена и текущий шаг диалога
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, draft])

  const say = (from, text) => setMessages((prev) => [...prev, { from, text }])

  // Шаг 1: человек написал фразу — разбираем её
  const send = async () => {
    const value = text.trim()
    if (!value || busy) return
    setText('')
    // Если диалог уже идёт — это ОТВЕТ на заданный вопрос, а не новая фраза.
    // Раньше любой текст уходил на разбор к ИИ, и человек попадал в цикл:
    // писал «до 1500», а бот заново спрашивал цену.
    if (draft && draft.step === 'first') { answerFirst(value); return }
    if (draft && draft.step === 'price') {
      const digits = (value.match(/\d+/g) || []).map(Number)
      answerPrice(digits.length ? Math.max(...digits) : 0)
      return
    }
    say('me', value)
    setBusy(true)
    try {
      const parsed = await api.parseHunt(value)
      if (!parsed || !parsed.ok) {
        say('ai', (parsed && parsed.error) || 'Не получилось разобрать запрос')
        return
      }
      const next = {
        query: parsed.query || value,
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
      say('ai', e?.message || 'Ошибка связи с сервером')
    } finally {
      setBusy(false)
    }
  }

  // Дальше только кнопки: ответы ничего не печатают
  const answerFirst = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'price' }
    // Дописываем только то, чего в запросе ещё нет. Иначе ИИ вернул
    // «куртка мальчик 158», человек тапнул размер 158 — и получалось
    // «куртка мальчик 158 158», что не находило ничего.
    const word = String(value || '').trim()
    const parts = String(next.query || '').split(/\s+/).filter(Boolean)
    if (word && !parts.includes(word)) next.query = [...parts, word].join(' ')
    setDraft(next)
    say('me', value || 'любой')
    say('ai', `${next.query}. До какой цены?`)
  }

  const answerPrice = (value) => {
    if (!draft) return
    const next = { ...draft, max_price: Number(value) || 0, step: 'done' }
    setDraft(next)
    say('me', PRICES.find((p) => p.value === (Number(value) || 0))?.label || 'без ограничения')
    say('ai', 'Готово — проверьте и нажмите «Найти лоты»')
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
      setBusy(false)
      say('ai', 'Критерий создан. Пришлю, как только появится подходящее.')
      setDraft(null)
      setTimeout(() => navigate('/'), 900)
    } catch (e) {
      setBusy(false)
      say('ai', e?.message || 'Не удалось создать критерий')
    }
  }

  const restart = () => {
    setDraft(null)
    setMessages([{ from: 'ai', text: 'Напишите, что ищете. Например: ботинки timberland 43' }])
  }

  const question = draft && draft.step === 'first' ? FIRST_QUESTION[draft.category] : null

  return (
    <div className="chat-wrap">
      <div className="chat-head">
        <div className="page-title">Поиск лотов</div>
        <button type="button" className="chat-manual" onClick={() => navigate('/hunt/manual')}>
          Вручную
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
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
      </div>

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
      ) : (
        <div className="chat-input">
          <input className="text-input" value={text} placeholder="Что искать?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
          <button type="button" className="chat-send" disabled={busy || !text.trim()} onClick={send}>
            <svg viewBox="0 0 24 24" className="icon-svg" aria-hidden="true">
              <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
