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

// Телефонам мало памяти: перекупу важны батарея и вскрытие.
// Спрашиваем после памяти, до цены.
const PHONE_STEPS = {
  battery: { title: 'АКБ от скольки процентов?', options: ['80', '85', '90'], skip: 'любая' },
  opened: { title: 'Вскрывался или менялись детали?', options: ['не вскрывался'], skip: 'без разницы' },
}

const PHONE_CATEGORIES = ['telefony', 'planshety_i_elektronnye_knigi']

// Обуви и одежде важно состояние, машине — пробег.
const CLOTHES_STEP = {
  title: 'Состояние вещи?',
  options: ['новое', 'хорошее', 'с износом'],
  skip: 'любое',
}
const MILEAGE_STEP = {
  title: 'Пробег до скольки тысяч километров?',
  options: ['50', '100', '150', '200'],
  skip: 'любой',
}
const CLOTHES_CATEGORIES = ['odezhda_obuv_aksessuary']

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
  const [preview, setPreview] = useState(null)

  const loadCriteria = () => {
    api.getCriteria().then((d) => setCriteria((d && (d.items || d.criteria)) || [])).catch(() => {})
  }
  useEffect(() => { loadCriteria() }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, draft])

  // Считаем совпадения ДО сохранения критерия: человек видит цифру и может
  // подкрутить запрос, если он слишком узкий или слишком широкий.
  useEffect(() => {
    if (!draft || draft.step !== 'done') { setPreview(null); return }
    const t = setTimeout(() => {
      api.checkHunt({
        query: draft.query, category: draft.category,
        max_price: draft.max_price, min_price: draft.min_price,
      }).then((d) => setPreview(d)).catch(() => setPreview(null))
    }, 500)
    return () => clearTimeout(t)
  }, [draft && draft.step, draft && draft.query, draft && draft.max_price])

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
      // Модель поняла, что это не про товар: поздоровались или спросили.
      // Раньше на «Привет» она спрашивала цену — выглядело абсурдно.
      if (!String(parsed.query || '').trim()) {
        say('ai', parsed.reply || 'Напишите, что ищете — подберу фильтры сам')
        return
      }
      const next = {
        query: parsed.query || phrase,
        max_price: Number(parsed.max_price) || 0,
        min_price: Number(parsed.min_price) || 0,
        category: parsed.category || '',
        step: 'first',
      }
      // Модель решила, что данных уже достаточно: не задаём вопросы вовсе,
      // а сразу показываем итог. Это и есть «ведёт диалог сам».
      if (parsed.ready) {
        next.step = 'done'
        setDraft(next)
        say('ai', parsed.reply || `Понял: ${next.query}. Проверьте и нажмите «Найти лоты»`)
        return
      }
      const question = FIRST_QUESTION[next.category]
      if (question) {
        setDraft(next)
        const live = parsed.reply || (parsed.follow_up
          ? `Понял: ${next.query}. ${parsed.follow_up}`
          : '')
        say('ai', live || `Понял: ${next.query}. ${question.title}`)
      } else {
        next.step = 'price'
        setDraft(next)
        say('ai', parsed.reply || `Понял: ${next.query}. До какой цены?`)
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
    // Второй вопрос зависит от категории: у техники батарея, у вещей состояние,
    // у машины пробег. Перекупу нужны детали, а не одно название.
    if (PHONE_CATEGORIES.includes(next.category)) {
      next.step = 'battery'
      say('ai', 'АКБ от скольки процентов?')
    } else if (CLOTHES_CATEGORIES.includes(next.category)) {
      next.step = 'wear'
      say('ai', CLOTHES_STEP.title)
    } else if (next.category === 'avtomobili') {
      next.step = 'mileage'
      say('ai', MILEAGE_STEP.title)
    } else {
      say('ai', 'До какой цены?')
    }
  }

  const answerBattery = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'opened' }
    const pct = String(value || '').replace(/[^0-9]/g, '')
    if (pct) next.req = `${next.req || ''}${next.req ? ', ' : ''}АКБ от ${pct}%`
    setDraft(next)
    say('me', pct ? `от ${pct}%` : 'любая')
    say('ai', 'Вскрывался или менялись детали?')
  }

  const answerWear = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'price' }
    if (value) next.req = `${next.req || ''}${next.req ? ', ' : ''}состояние: ${value}`
    setDraft(next)
    say('me', value || 'любое')
    say('ai', 'До какой цены?')
  }

  const answerMileage = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'price' }
    const km = String(value || '').replace(/[^0-9]/g, '')
    if (km) next.req = `${next.req || ''}${next.req ? ', ' : ''}пробег до ${km} тыс. км`
    setDraft(next)
    say('me', km ? `до ${km} тыс.` : 'любой')
    say('ai', 'До какой цены?')
  }

  const answerOpened = (value) => {
    if (!draft) return
    const next = { ...draft, step: 'price' }
    if (value) next.req = `${next.req || ''}${next.req ? ', ' : ''}не вскрывался`
    setDraft(next)
    say('me', value || 'без разницы')
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
    if (draft && draft.step === 'battery') return answerBattery(value)
    if (draft && draft.step === 'opened') return answerOpened(value)
    if (draft && draft.step === 'wear') return answerWear(value)
    if (draft && draft.step === 'mileage') return answerMileage(value)
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
        // Требования словами: «АКБ от 85%, не вскрывался». ИИ сверит с ними
        // описание и отсеет то, что не подходит.
        requirements: draft.req || '',
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

        {draft && (draft.step === 'battery' || draft.step === 'opened') ? (
          <div className="chat-replies">
            {PHONE_STEPS[draft.step].options.map((opt) => (
              <button key={opt} type="button" className="chat-chip"
                onClick={() => (draft.step === 'battery' ? answerBattery(opt) : answerOpened(opt))}>
                {opt}
              </button>
            ))}
            <button type="button" className="chat-chip"
              onClick={() => (draft.step === 'battery' ? answerBattery('') : answerOpened(''))}>
              {PHONE_STEPS[draft.step].skip}
            </button>
          </div>
        ) : null}

        {draft && draft.step === 'wear' ? (
          <div className="chat-replies">
            {CLOTHES_STEP.options.map((opt) => (
              <button key={opt} type="button" className="chat-chip" onClick={() => answerWear(opt)}>{opt}</button>
            ))}
            <button type="button" className="chat-chip" onClick={() => answerWear('')}>{CLOTHES_STEP.skip}</button>
          </div>
        ) : null}

        {draft && draft.step === 'mileage' ? (
          <div className="chat-replies">
            {MILEAGE_STEP.options.map((opt) => (
              <button key={opt} type="button" className="chat-chip" onClick={() => answerMileage(opt)}>{`до ${opt} тыс.`}</button>
            ))}
            <button type="button" className="chat-chip" onClick={() => answerMileage('')}>{MILEAGE_STEP.skip}</button>
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
            {/* Формулировку можно поправить руками: ИИ разбирает фразу
                приблизительно, а точность здесь важнее всего. */}
            <input
              className="text-input chat-summary-input"
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              placeholder="Что искать в заголовках"
            />
            <div className="chat-summary-hint">
              Ищем эти слова в названии. Модель пишите латиницей: «iPhone 15 Pro», «Camry»
            </div>
            {preview && preview.ok ? (
              <div className="chat-summary-count">
                {preview.total > 0
                  ? `Сейчас подойдёт ${preview.total}, из них свежих ${preview.fresh}`
                  : 'Сейчас таких нет — пришлю, как появятся'}
              </div>
            ) : null}
            <div className="chat-summary-line muted">
              {draft.max_price ? `до ${money(draft.max_price)} ₽` : 'без ограничения по цене'}
            </div>
            {draft.req ? <div className="chat-summary-line muted">{draft.req}</div> : null}
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
