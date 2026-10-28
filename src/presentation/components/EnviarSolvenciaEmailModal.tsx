import React, { useState, useEffect } from 'react'
import {
  DatosCartaSolvencia,
  generarPDFSolvencia,
  descargarSolvenciaPDF,
  abrirSolvenciaPDF
} from '../../utils/solvenciaPdfGenerator'
import { despacharEmailCartaSolvencia } from '../../data/emailService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (destinatario: string) => void
  datosSolvencia: DatosCartaSolvencia | null
  esSolvente?: boolean
  deudaUsd?: number
  deudaBs?: number
  emailRegistrado?: string | null
}

export const EnviarSolvenciaEmailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  datosSolvencia,
  esSolvente = true,
  deudaUsd = 0,
  deudaBs = 0,
  emailRegistrado
}) => {
  const [tipoDestino, setTipoDestino] = useState<'registrado' | 'manual'>('registrado')
  const [emailManual, setEmailManual] = useState('')
  const [notaAdicional, setNotaAdicional] = useState('')
  const [incluirPdfAdjunto, setIncluirPdfAdjunto] = useState(true)
  const [enviarCopiaAdmin, setEnviarCopiaAdmin] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const correoRegistrado = (emailRegistrado || '').trim()
  const tieneCorreoRegistrado = Boolean(correoRegistrado && correoRegistrado.includes('@'))

  useEffect(() => {
    if (isOpen) {
      if (tieneCorreoRegistrado) {
        setTipoDestino('registrado')
      } else {
        setTipoDestino('manual')
      }
      setEmailManual('')
      setNotaAdicional('')
      setIncluirPdfAdjunto(true)
      setEnviarCopiaAdmin(false)
      setError(null)
      setExito(false)
      setEnviando(false)
    }
  }, [isOpen, tieneCorreoRegistrado])

  if (!isOpen || !datosSolvencia) return null

  const apto = datosSolvencia.residenteApto || 'N/D'
  const propNombre = datosSolvencia.residenteNombre || 'Propietario'
  const emailAdmin = datosSolvencia.email || null

  const destinatarioFinal =
    tipoDestino === 'registrado' ? correoRegistrado : emailManual.trim().toLowerCase()

  const handleDescargarCopia = () => {
    try {
      descargarSolvenciaPDF(datosSolvencia)
    } catch (e: any) {
      console.warn('[EnviarSolvenciaEmailModal] Error al descargar PDF:', e)
    }
  }

  const handlePrevisualizar = () => {
    try {
      abrirSolvenciaPDF(datosSolvencia)
    } catch (e: any) {
      console.warn('[EnviarSolvenciaEmailModal] Error al previsualizar:', e)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!destinatarioFinal || !destinatarioFinal.includes('@')) {
      setError('Por favor indica un correo electrónico válido para enviar la solvencia.')
      return
    }

    setEnviando(true)

    try {
      let pdfBase64: string | undefined = undefined
      let pdfFilename: string | undefined = undefined

      if (incluirPdfAdjunto) {
        const doc = generarPDFSolvencia(datosSolvencia)
        const dataUri = doc.output('datauristring')
        pdfBase64 = dataUri.split(',')[1]
        const cleanApto = apto.replace(/[^a-zA-Z0-9_-]/g, '_')
        const mes = (datosSolvencia.mesSolvente || 'Solvencia').toLowerCase()
        pdfFilename = `Carta_Solvencia_${cleanApto}_${mes}_${datosSolvencia.anioSolvente}.pdf`
      }

      // Enviar correo principal
      const res = await despacharEmailCartaSolvencia({
        destinatarioEmail: destinatarioFinal,
        datosSolvencia,
        notaAdicional: notaAdicional.trim() || undefined,
        pdfBase64,
        pdfFilename,
      })

      if (!res.ok) {
        setError(res.error || 'No se pudo enviar el correo electrónico.')
        setEnviando(false)
        return
      }

      // Enviar copia administrativa si fue seleccionada
      if (
        enviarCopiaAdmin &&
        emailAdmin &&
        emailAdmin.includes('@') &&
        emailAdmin.toLowerCase() !== destinatarioFinal.toLowerCase()
      ) {
        despacharEmailCartaSolvencia({
          destinatarioEmail: emailAdmin,
          datosSolvencia,
          notaAdicional: `[COPIA DE ARCHIVO ADMINISTRATIVO] Expedida para: ${destinatarioFinal} (Apto ${apto}). ${notaAdicional.trim()}`,
          pdfBase64,
          pdfFilename,
        }).catch((e) => console.warn('[EnviarSolvenciaModal] Error enviando copia a admin:', e))
      }

      setExito(true)
      setTimeout(() => {
        onSuccess?.(destinatarioFinal)
        onClose()
      }, 1600)
    } catch (err: any) {
      console.error('[EnviarSolvenciaEmailModal] Error:', err)
      setError(err?.message || 'Error inesperado al preparar o despachar el correo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0e1422',
          border: '1px solid #1e293b',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px 26px',
          boxSizing: 'border-box',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
          position: 'relative',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '24px' }}>📜✉️</span>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Enviar Carta de Solvencia por Email
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: 0, lineHeight: 1.4 }}>
              Apartamento <strong>{apto}</strong> · {propNombre}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={enviando}
            style={{
              background: 'none',
              border: 'none',
              color: '#8e8e93',
              fontSize: '22px',
              cursor: enviando ? 'not-allowed' : 'pointer',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Estado de solvencia del residente */}
        <div
          style={{
            backgroundColor: esSolvente ? 'rgba(16, 185, 129, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            border: `1px solid ${esSolvente ? 'rgba(16, 185, 129, 0.35)' : 'rgba(234, 179, 8, 0.4)'}`,
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12.5px',
          }}
        >
          <div>
            <span
              style={{
                color: esSolvente ? '#34d399' : '#eab308',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{esSolvente ? '✓' : '⚠️'}</span>
              <span>{esSolvente ? 'Residente Solvente al Día' : 'Atención: Registra Saldo Pendiente'}</span>
            </span>
            <span style={{ color: '#94a3b8', fontSize: '11.5px', display: 'block', marginTop: '2px' }}>
              {esSolvente
                ? 'Condominio y gas comunal sin deudas activas.'
                : `Deuda registrada: $${deudaUsd.toFixed(2)} USD (Bs. ${Number(deudaBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })})`}
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 }}>
              Período Solvente
            </span>
            <span style={{ color: '#4ade80', fontWeight: 800 }}>
              {datosSolvencia.mesSolvente} {datosSolvencia.anioSolvente}
            </span>
          </div>
        </div>

        {/* Resumen sincronizado de la constancia */}
        <div
          style={{
            backgroundColor: '#070a13',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '11.5px',
            color: '#cbd5e1',
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div>
              <span style={{ color: '#64748b' }}>Edificio:</span>{' '}
              <strong style={{ color: '#fff' }}>{datosSolvencia.nombreEdificio}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Cédula:</span>{' '}
              <strong style={{ color: '#fff' }}>{datosSolvencia.residenteCedula || 'No registrada'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Presidente:</span>{' '}
              <strong style={{ color: '#fff' }}>{datosSolvencia.presidenteNombre}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Administrador:</span>{' '}
              <strong style={{ color: '#fff' }}>{datosSolvencia.administradorNombre}</strong>
            </div>
          </div>
          {datosSolvencia.ultimoPagoFecha && (
            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #1e293b', color: '#94a3b8' }}>
              Último pago aprobado: <strong style={{ color: '#fff' }}>{datosSolvencia.ultimoPagoFecha}</strong>
              {datosSolvencia.ultimoPagoReferencia && ` · Ref: ${datosSolvencia.ultimoPagoReferencia}`}
              {datosSolvencia.ultimoPagoMonto && ` · Bs. ${Number(datosSolvencia.ultimoPagoMonto).toLocaleString('es-VE')}`}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Selección de Destinatario */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Destinatario del Correo Electrónico
            </label>

            {tieneCorreoRegistrado && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: tipoDestino === 'registrado' ? 'rgba(56, 189, 248, 0.08)' : '#070a13',
                  border: `1px solid ${tipoDestino === 'registrado' ? '#38bdf8' : '#1e293b'}`,
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                <input
                  type="radio"
                  name="tipoDestino"
                  checked={tipoDestino === 'registrado'}
                  onChange={() => setTipoDestino('registrado')}
                  disabled={enviando}
                  style={{ accentColor: '#38bdf8' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#f8fafc', fontWeight: 600 }}>
                    Correo registrado del propietario
                  </div>
                  <div style={{ color: '#38bdf8', fontSize: '12px', fontFamily: 'monospace' }}>
                    {correoRegistrado}
                  </div>
                </div>
              </label>
            )}

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                backgroundColor: tipoDestino === 'manual' ? 'rgba(56, 189, 248, 0.08)' : '#070a13',
                border: `1px solid ${tipoDestino === 'manual' ? '#38bdf8' : '#1e293b'}`,
                borderRadius: '10px',
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <input
                type="radio"
                name="tipoDestino"
                checked={tipoDestino === 'manual'}
                onChange={() => setTipoDestino('manual')}
                disabled={enviando}
                style={{ accentColor: '#38bdf8', marginTop: '3px' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginBottom: '4px' }}>
                  {tieneCorreoRegistrado ? 'Enviar a otra dirección de correo' : 'Ingresar correo del propietario'}
                </div>
                {tipoDestino === 'manual' && (
                  <input
                    type="email"
                    value={emailManual}
                    onChange={(e) => setEmailManual(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    disabled={enviando}
                    required={tipoDestino === 'manual'}
                    autoFocus={!tieneCorreoRegistrado}
                    style={{
                      width: '100%',
                      backgroundColor: '#0e1422',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      marginTop: '4px',
                      outline: 'none',
                    }}
                  />
                )}
              </div>
            </label>
          </div>

          {/* Nota opcional */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Mensaje o Saludo de la Administración (Opcional)
            </label>
            <textarea
              value={notaAdicional}
              onChange={(e) => setNotaAdicional(e.target.value)}
              placeholder="Ej: Estimado propietario, adjuntamos su carta de solvencia oficial requerida para trámites..."
              rows={2}
              disabled={enviando}
              style={{
                width: '100%',
                backgroundColor: '#070a13',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '10px 12px',
                color: '#fff',
                fontSize: '12.5px',
                lineHeight: 1.4,
                boxSizing: 'border-box',
                resize: 'none',
                outline: 'none',
              }}
            />
          </div>

          {/* Opciones de Adjuntos y Copias */}
          <div
            style={{
              backgroundColor: '#070a13',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12.5px' }}>
              <input
                type="checkbox"
                checked={incluirPdfAdjunto}
                onChange={(e) => setIncluirPdfAdjunto(e.target.checked)}
                disabled={enviando}
                style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
              />
              <span style={{ color: '#cbd5e1' }}>
                📎 Adjuntar documento PDF oficial (Carta de Solvencia tamaño carta)
              </span>
            </label>

            {emailAdmin && emailAdmin.includes('@') && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12.5px' }}>
                <input
                  type="checkbox"
                  checked={enviarCopiaAdmin}
                  onChange={(e) => setEnviarCopiaAdmin(e.target.checked)}
                  disabled={enviando}
                  style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                />
                <span style={{ color: '#94a3b8' }}>
                  Enviar copia de respaldo a la administración ({emailAdmin})
                </span>
              </label>
            )}
          </div>

          {/* Mensajes de error o éxito */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: '12px',
                marginBottom: '18px',
                lineHeight: 1.4,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {exito && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#6ee7b7',
                fontSize: '12.5px',
                marginBottom: '18px',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              ✓ ¡Carta de Solvencia enviada exitosamente a {destinatarioFinal}!
            </div>
          )}

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handlePrevisualizar}
                disabled={enviando}
                title="Abrir vista previa del documento PDF"
                style={{
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>👁️</span>
                <span>Ver Carta</span>
              </button>

              <button
                type="button"
                onClick={handleDescargarCopia}
                disabled={enviando}
                title="Descargar una copia directa del PDF en este dispositivo"
                style={{
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>📥</span>
                <span>PDF</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                style={{
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={enviando || exito}
                style={{
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: enviando || exito ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 16px rgba(22, 163, 74, 0.4)',
                  transition: 'all 0.15s ease',
                }}
              >
                {enviando ? (
                  <>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⌛</span>
                    <span>Enviando...</span>
                  </>
                ) : exito ? (
                  <span>✓ Enviado</span>
                ) : (
                  <>
                    <span>✉️</span>
                    <span>Enviar Solvencia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
