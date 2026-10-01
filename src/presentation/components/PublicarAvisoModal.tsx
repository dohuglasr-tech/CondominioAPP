import React, { useState, useEffect } from 'react'
import {
  publicarAvisoComunidad,
  obtenerAvisoActivo,
  eliminarAvisoComunidad,
  AvisoComunidad,
  TipoAviso,
} from '../../data/avisosService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onAvisoActualizado?: () => void
}

export const PublicarAvisoModal: React.FC<Props> = ({ isOpen, onClose, onAvisoActualizado }) => {
  const [mensaje, setMensaje] = useState('')
  const [tipo, setTipo] = useState<TipoAviso>('mantenimiento')
  const [guardando, setGuardando] = useState(false)
  const [avisoActual, setAvisoActual] = useState<AvisoComunidad | null>(null)
  const [cargandoAviso, setCargandoAviso] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCargandoAviso(true)
      obtenerAvisoActivo()
        .then((a) => setAvisoActual(a))
        .finally(() => setCargandoAviso(false))
      setMensaje('')
      setTipo('mantenimiento')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePublicar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mensaje.trim()) return

    setGuardando(true)
    const res = await publicarAvisoComunidad({
      mensaje: mensaje.trim(),
      tipo,
      autorNombre: '📣 JUNTA DE CONDOMINIO',
    })

    if (res.error) {
      alert('Error publicando aviso: ' + res.error)
    } else {
      if (onAvisoActualizado) onAvisoActualizado()
      onClose()
    }
    setGuardando(false)
  }

  const handleEliminarActual = async () => {
    if (!avisoActual) return
    if (!confirm('¿Deseas retirar el aviso activo de la cartelera comunitaria?')) return

    setGuardando(true)
    const res = await eliminarAvisoComunidad(avisoActual.id)
    if (res.error) {
      alert('Error eliminando aviso: ' + res.error)
    } else {
      setAvisoActual(null)
      if (onAvisoActualizado) onAvisoActualizado()
      onClose()
    }
    setGuardando(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#141519',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent Bar */}
        <div style={{ height: '3px', background: 'var(--color-brand-gradient, linear-gradient(90deg, #f97316, #ea580c))', width: '100%' }} />

        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0 }}>
              📢 Aviso a la Comunidad
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '12px', margin: '4px 0 0' }}>
              Aparecerá fijado en la parte superior del Dashboard de todos los residentes.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#222',
              border: 'none',
              color: '#aaa',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Aviso actual si existe */}
          {cargandoAviso ? (
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '14px' }}>
              Verificando aviso vigente...
            </div>
          ) : avisoActual && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: 'var(--color-accent, #f97316)',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  ● Aviso Activo Actualmente
                </span>
                <p style={{ color: '#ddd', fontSize: '13px', margin: 0 }}>{avisoActual.mensaje}</p>
              </div>
              <button
                type="button"
                onClick={handleEliminarActual}
                disabled={guardando}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Retirar
              </button>
            </div>
          )}

          <form onSubmit={handlePublicar}>
            {/* Selector de Tipo */}
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  color: '#8e8e93',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                Tipo de Aviso
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { id: 'mantenimiento', label: '🛠️ Mantenimiento', color: '#f59e0b' },
                  { id: 'urgente', label: '🚨 Urgente', color: '#ef4444' },
                  { id: 'info', label: 'ℹ️ Informativo', color: '#3b82f6' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTipo(item.id as TipoAviso)}
                    style={{
                      backgroundColor: tipo === item.id ? `${item.color}20` : '#0d0e12',
                      borderColor: tipo === item.id ? item.color : 'rgba(255,255,255,0.08)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: tipo === item.id ? item.color : '#8e8e93',
                      padding: '8px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensaje */}
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'block',
                  color: '#8e8e93',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}
              >
                Mensaje del Aviso *
              </label>
              <textarea
                required
                rows={3}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Ej. Limpieza de tanques de agua este jueves de 8:00 AM a 2:00 PM. Se suspenderá el servicio temporalmente."
                style={{
                  width: '100%',
                  backgroundColor: '#0a0b0e',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: '80px',
                }}
              />
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#222',
                  border: '1px solid #333',
                  color: '#aaa',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={guardando || !mensaje.trim()}
                style={{
                  background: 'var(--color-brand-gradient, linear-gradient(90deg, #f97316, #ea580c))',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: guardando || !mensaje.trim() ? 'not-allowed' : 'pointer',
                  opacity: guardando || !mensaje.trim() ? 0.6 : 1,
                  boxShadow: 'var(--color-brand-shadow, 0 4px 14px var(--color-accent-glow))',
                }}
              >
                {guardando ? 'Publicando...' : '📢 Publicar Aviso'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
