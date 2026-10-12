import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
// Порядок важен: tokens.css идёт после styles.css и переопределяет его :root
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
// ЭТАП 2: стили главной (лента, карточка лота, рельсы, баннер, состояния).
// Идут последними — им нужно переопределять legacy-правила styles.css.
import './styles/pages/feed.css'
// ЭТАП 3a: стили страницы лота, поиска и избранного. Строго после feed.css:
// поиск переиспользует стили карточки лота из этапа 2.
import './styles/pages/listing.css'
// ЭТАП 3b: ИИ-поиск (/hunt) и «Мои критерии» (/hunt/manual). Последним:
// выравнивает поля обеих вкладок и переопределяет legacy-правила чата.
import './styles/pages/hunt.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
