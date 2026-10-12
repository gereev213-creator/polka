import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
// Порядок важен: tokens.css идёт после styles.css и переопределяет его :root
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
