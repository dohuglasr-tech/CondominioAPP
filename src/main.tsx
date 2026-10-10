import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { applyTheme } from './utils/themeManager'
import { appCache } from './data/cacheService'
import './index.css'

// ── Control de versión y purga automática de caché de clientes ──
const APP_BUILD_VERSION = '1.0.1'

try {
  const currentStoredVersion = localStorage.getItem('domus_app_version')
  if (currentStoredVersion !== APP_BUILD_VERSION) {
    // 1. Limpiar appCache de Supabase (memoria y sessionStorage)
    appCache.clear()
    sessionStorage.clear()

    // 2. Limpiar CacheStorage del navegador (caches de Service Worker y assets antiguos)
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name))
      }).catch(() => {})
    }

    // 3. Forzar actualización de Service Workers registrados
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.update().catch(() => {}))
      }).catch(() => {})
    }

    localStorage.setItem('domus_app_version', APP_BUILD_VERSION)
  }
} catch (e) {
  console.warn('[CachePurge] Error purgando caché antigua:', e)
}

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
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Forzar verificación de nueva versión en cada carga
      reg.update().catch(() => {})
    }).catch(err => {
      console.warn('[PWA] Fallo al registrar Service Worker:', err)
    })
  })
}
