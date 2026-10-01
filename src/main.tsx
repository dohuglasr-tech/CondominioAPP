import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { applyTheme } from './utils/themeManager'
import './index.css'

// Aplicar inmediatamente el color del edificio configurado antes del primer render
applyTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registrar Service Worker para soporte PWA e instalación en dispositivos móviles
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[PWA] Fallo al registrar Service Worker:', err)
    })
  })
}
