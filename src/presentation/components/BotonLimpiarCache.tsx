import React, { useState } from 'react'
import { purgarCacheGlobalTotal } from '../../data/cacheService'
import { useAuth } from '../../application/contexts/AuthContext'

interface BotonLimpiarCacheProps {
  variant?: 'button' | 'quickAction' | 'menuItem' | 'drawer'
  className?: string
  style?: React.CSSProperties
  onSuccess?: () => void
}

export const BotonLimpiarCache: React.FC<BotonLimpiarCacheProps> = ({
  variant = 'button',
  className = '',
  style = {},
  onSuccess,
}) => {
  const { perfil, user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [limpiando, setLimpiando] = useState(false)
  const [completado, setCompletado] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const adminIdentificador = perfil?.nombre_completo || user?.email || 'Administrador'

  const handleEjecutarLimpieza = async () => {
    setLimpiando(true)
    setErrorMsg(null)

    try {
      const res = await purgarCacheGlobalTotal(adminIdentificador)
      if (!res.ok) {
        throw new Error(res.error || 'No se pudo completar la limpieza')
      }

      setCompletado(true)
      if (onSuccess) onSuccess()

      // Esperar brevemente para que el usuario visualice la confirmación y luego recargar
      setTimeout(() => {
        window.location.reload()
      }, 1200)
    } catch (err: any) {
      console.error('[LimpiarCache] Error al ejecutar:', err)
      setErrorMsg(err.message || 'Ocurrió un error inesperado al limpiar la caché.')
      setLimpiando(false)
    }
  }

  // Render según variante
  const renderTrigger = () => {
    if (variant === 'quickAction') {
      return (
        <button
          type="button"
          onClick={() => { setModalOpen(true); setCompletado(false); setErrorMsg(null) }}
          className={className}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            ...style
          }}
          title="Limpiar caché en toda la aplicación"
        >
          <div style={{
            width: '58px',
            height: '58px',
            borderRadius: '50%',
            backgroundColor: '#0c2333',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.15)',
            transition: 'transform 0.15s ease'
          }}>
            🧹
          </div>
          <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Limpiar Caché</span>
        </button>
      )
    }

    if (variant === 'menuItem') {
      return (
        <button
          type="button"
          onClick={() => { setModalOpen(true); setCompletado(false); setErrorMsg(null) }}
          className={className}
          style={{
            width: '100%',
            backgroundColor: 'rgba(14, 165, 233, 0.08)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            marginBottom: '8px',
            ...style
          }}
          title="Limpiar caché y forzar actualización a la última versión"
        >
          <span>🧹</span>
          <span>Limpiar Caché Global</span>
        </button>
      )
    }

    if (variant === 'drawer') {
      return (
        <button
          type="button"
          onClick={() => { setModalOpen(true); setCompletado(false); setErrorMsg(null) }}
          className={className}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            background: 'rgba(14, 165, 233, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '12px',
            padding: '10px 14px',
            color: '#38bdf8',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
            ...style
          }}
          title="Limpiar caché y forzar actualización global"
        >
          <span style={{ fontSize: '18px' }}>🧹</span>
          <span>Limpiar Caché Global</span>
        </button>
      )
    }

    // Default 'button' (Desktop Toolbar)
    return (
      <button
        type="button"
        onClick={() => { setModalOpen(true); setCompletado(false); setErrorMsg(null) }}
        className={className}
        style={{
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          color: '#38bdf8',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          padding: '8px 16px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.2s ease',
          ...style
        }}
        title="Limpiar la caché y forzar actualización a la última versión en todos los dispositivos"
      >
        <span>🧹</span>
        <span>Limpiar Caché</span>
      </button>
    )
  }

  return (
    <>
      {renderTrigger()}

      {/* MODAL DE CONFIRMACIÓN Y ESTADO */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !limpiando) {
              setModalOpen(false)
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#13151b',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '20px',
              maxWidth: '460px',
              width: '100%',
              padding: '26px 24px',
              boxShadow: '0 24px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(14, 165, 233, 0.15)',
              position: 'relative',
              color: '#f4f4f5'
            }}
          >
            {/* Header del Modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: 'rgba(14, 165, 233, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                flexShrink: 0
              }}>
                🧹
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                  Limpieza de Caché Global
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  Forzar actualización a la última versión
                </p>
              </div>
            </div>

            {/* Estado completado */}
            {completado ? (
              <div style={{
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '14px',
                padding: '18px 16px',
                textAlign: 'center',
                margin: '16px 0'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 800, color: '#4ade80' }}>
                  ¡Caché purgada exitosamente!
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#bbf7d0' }}>
                  Todos los dispositivos sincronizados. Recargando la aplicación...
                </p>
              </div>
            ) : (
              <>
                {/* Explicación de las acciones realizadas */}
                <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 16px' }}>
                  Esta acción ejecutará una purga profunda en toda la aplicación para garantizar que todos los residentes y administradores tengan la última versión:
                </p>

                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>⚡</span>
                    <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      <strong style={{ color: '#fff' }}>Memoria y Sesión:</strong> Limpia instantáneamente la memoria interna y datos en caché de Supabase.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>📦</span>
                    <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      <strong style={{ color: '#fff' }}>Archivos del Navegador:</strong> Elimina scripts antiguos en CacheStorage y fuerza la actualización de Service Workers.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>🌐</span>
                    <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      <strong style={{ color: '#fff' }}>Sincronización Global:</strong> Emite la orden por Supabase Realtime a todos los usuarios conectados y marca la versión para usuarios offline.
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#f87171',
                    marginBottom: '16px'
                  }}>
                    ⚠️ {errorMsg}
                  </div>
                )}

                {/* Acciones del Modal */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={limpiando}
                    onClick={() => setModalOpen(false)}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#a1a1aa',
                      padding: '10px 18px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: limpiando ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    disabled={limpiando}
                    onClick={handleEjecutarLimpieza}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
                      border: 'none',
                      color: '#fff',
                      padding: '10px 20px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: limpiando ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 16px rgba(14, 165, 233, 0.35)',
                      opacity: limpiando ? 0.75 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {limpiando ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                        <span>Purgando y actualizando...</span>
                      </>
                    ) : (
                      <>
                        <span>🧹</span>
                        <span>Limpiar Caché Ahora</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
