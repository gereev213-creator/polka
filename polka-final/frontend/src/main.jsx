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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
