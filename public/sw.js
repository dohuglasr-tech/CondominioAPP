// Service Worker para Web Push Notifications
// Archivo: public/sw.js
// Se registra automáticamente desde el hook useNotifications

const CACHE_NAME = 'domus-app-v11'

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png'
]

// ── Instalación del Service Worker ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {})
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => clients.claim())
  )
})

// ── Fetch handler: CacheFirst para /assets/ hasheados y NetworkFirst para navegación ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const reqUrl = new URL(event.request.url)

  // Solo cachear assets del mismo origen (evitar interferir con APIs Supabase)
  if (reqUrl.origin !== self.location.origin) return

  // Chunks con hash de Vite (/assets/*): CacheFirst con revalidación en caché
  if (reqUrl.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response && response.ok && response.status === 200) {
          cache.put(event.request, response.clone()).catch(() => {})
        }
        return response
      })
    )
    return
  }

  // Navegación HTML: NetworkFirst con fallback a caché para offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {})
          }
          return response
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('/index.html')))
    )
    return
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

// ── Recibir push desde el servidor ─────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    titulo: 'DOMUS',
    cuerpo: 'Tienes una nueva notificación',
    link: '/',
    tipo: 'aviso',
  }

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() }
    }
  } catch (e) {
    // usar defaults
  }

  const iconByType = {
    recibo_emitido: '/icon-192.png',
    mora: '/icon-192.png',
    chat: '/icon-192.png',
    pago_aprobado: '/icon-192.png',
    pago_rechazado: '/icon-192.png',
    aviso: '/icon-192.png',
  }

  const options = {
    body: data.cuerpo,
    icon: iconByType[data.tipo] || '/icon-192.png',
    badge: '/favicon.png',
    data: { url: data.link },
    requireInteraction: data.tipo === 'recibo_emitido' || data.tipo === 'mora',
    tag: `condominio-${data.tipo}`,
    renotify: true,
    actions: [
      { action: 'open', title: 'Ver ahora' },
      { action: 'close', title: 'Cerrar' },
    ],
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(data.titulo, options)
  )
})

// ── Click en la notificación → abrir la app en la ruta correcta ────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'close') return

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus()
          client.postMessage({ type: 'NAVIGATE', url })
          return
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
