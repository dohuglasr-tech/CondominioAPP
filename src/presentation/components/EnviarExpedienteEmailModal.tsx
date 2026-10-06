import React, { useState, useEffect } from 'react'
import { ExpedienteLegalAptoData, generarExpedienteLegalPDF } from '../../utils/expedienteLegalPdfGenerator'
import { despacharEmailExpedienteLegal } from '../../data/emailService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (destinatario: string) => void
  datosExpediente: ExpedienteLegalAptoData | null
}

export const EnviarExpedienteEmailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  datosExpediente,
}) => {
  const [tipoDestino, setTipoDestino] = useState<'registrado' | 'manual'>('registrado')
  const [emailManual, setEmailManual] = useState('')
  const [notaAdicional, setNotaAdicional] = useState('')
  const [incluirPdfAdjunto, setIncluirPdfAdjunto] = useState(true)
  const [enviarCopiaAdmin, setEnviarCopiaAdmin] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const correoRegistrado = (
    datosExpediente?.apartamento.propietario.email ||
    datosExpediente?.apartamento.inquilino?.email ||
    ''
  ).trim()

  const tieneCorreoRegistrado = !!correoRegistrado && correoRegistrado.includes('@')

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

  if (!isOpen || !datosExpediente) return null

  const apto = datosExpediente.apartamento.numero
  const propNombre = datosExpediente.apartamento.propietario.nombre || 'Copropietario'
  const emailAdmin = datosExpediente.edificio.emailContacto || null
  const deudaUsd = datosExpediente.metricas.deudaTotalUsd
  const tieneDeuda = deudaUsd > 0.01

  const destinatarioFinal = tipoDestino === 'registrado' ? correoRegistrado : emailManual.trim().toLowerCase()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!destinatarioFinal || !destinatarioFinal.includes('@')) {
      setError('Por favor indica un correo electrónico válido para enviar el expediente.')
      return
    }

    setEnviando(true)

    try {
      let pdfBase64: string | undefined = undefined
      let pdfFilename: string | undefined = undefined

      if (incluirPdfAdjunto) {
        // Generar PDF del expediente legal con todas sus firmas y hash
        const doc = generarExpedienteLegalPDF(datosExpediente)
        const dataUri = doc.output('datauristring')
        pdfBase64 = dataUri.split(',')[1]
        const aptoSanitizado = apto.replace(/[^a-zA-Z0-9_-]/g, '_')
        const fechaStr = new Date().toISOString().slice(0, 10)
        pdfFilename = `Expediente_Legal_Apto_${aptoSanitizado}_${fechaStr}.pdf`
      }

      // Enviar correo principal
      const res = await despacharEmailExpedienteLegal({
        destinatarioEmail: destinatarioFinal,
        datosExpediente,
        notaAdicional: notaAdicional.trim() || undefined,
        pdfBase64,
        pdfFilename,
      })

      if (!res.ok) {
        setError(res.error || 'No se pudo enviar el correo electrónico.')
        setEnviando(false)
        return
      }

      // Enviar copia adicional si fue marcada y hay correo admin diferente
      if (enviarCopiaAdmin && emailAdmin && emailAdmin.includes('@') && emailAdmin !== destinatarioFinal) {
        despacharEmailExpedienteLegal({
          destinatarioEmail: emailAdmin,
          datosExpediente,
          notaAdicional: `[COPIA DE ARCHIVO ADMINISTRATIVO] Enviado a: ${destinatarioFinal}. ${notaAdicional.trim()}`,
          pdfBase64,
          pdfFilename,
        }).catch((e) => console.warn('[EnviarExpedienteModal] Error enviando copia a admin:', e))
      }

      setExito(true)
      setTimeout(() => {
        onSuccess?.(destinatarioFinal)
        onClose()
      }, 1600)
    } catch (err: any) {
      console.error('[EnviarExpedienteEmailModal] Error:', err)
      setError(err?.message || 'Error inesperado al preparar o enviar el correo.')
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
          maxWidth: '520px',
          padding: '26px',
          boxSizing: 'border-box',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          position: 'relative',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '22px' }}>⚖️✉️</span>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Enviar Expediente Legal por Correo
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: 0, lineHeight: 1.4 }}>
              Apto <strong>{apto}</strong> · {propNombre}
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

        {/* Resumen del Documento */}
        <div
          style={{
            backgroundColor: '#070a13',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <div>
            <span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700 }}>
              Estado del Inmueble
            </span>
            <span style={{ color: tieneDeuda ? '#f87171' : '#34d399', fontWeight: 800, fontSize: '13px' }}>
              {tieneDeuda ? `Deuda en mora: $${deudaUsd.toFixed(2)} USD` : 'Solvente / Al día'}
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#64748b', display: 'block', textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700 }}>
              Formato
            </span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>
              HTML Ejecutivo + PDF Oficial
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12.5px',
              marginBottom: '16px',
              lineHeight: 1.4,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {exito ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>✅</div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#34d399', margin: '0 0 6px' }}>
              ¡Expediente Legal Enviado con Éxito!
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              Se envió el correo y el PDF oficial a <strong>{destinatarioFinal}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Opciones de Destinatario */}
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                Selecciona el destinatario del correo:
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Opción A: Correo Registrado */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '10px',
                    border: `1px solid ${tipoDestino === 'registrado' ? 'var(--color-accent, #f97316)' : '#1e293b'}`,
                    backgroundColor: tipoDestino === 'registrado' ? 'rgba(249, 115, 22, 0.08)' : '#070a13',
                    cursor: tieneCorreoRegistrado ? 'pointer' : 'not-allowed',
                    opacity: tieneCorreoRegistrado ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="tipoDestino"
                    checked={tipoDestino === 'registrado'}
                    onChange={() => tieneCorreoRegistrado && setTipoDestino('registrado')}
                    disabled={!tieneCorreoRegistrado}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      Correo registrado en ficha del apartamento
                    </div>
                    {tieneCorreoRegistrado ? (
                      <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '2px', wordBreak: 'break-all' }}>
                        ✉️ {correoRegistrado}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11.5px', color: '#f87171', marginTop: '2px' }}>
                        ⚠️ Sin correo registrado (usa la opción manual abajo)
                      </div>
                    )}
                  </div>
                </label>

                {/* Opción B: Correo Manual */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '10px',
                    border: `1px solid ${tipoDestino === 'manual' ? 'var(--color-accent, #f97316)' : '#1e293b'}`,
                    backgroundColor: tipoDestino === 'manual' ? 'rgba(249, 115, 22, 0.08)' : '#070a13',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="tipoDestino"
                    checked={tipoDestino === 'manual'}
                    onChange={() => setTipoDestino('manual')}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      Ingresar otro correo manual o alternativo
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                      Para enviar a un abogado, inquilino, apoderado o correo alterno.
                    </div>
                  </div>
                </label>
              </div>

              {/* Input para correo manual si está seleccionado */}
              {tipoDestino === 'manual' && (
                <div style={{ marginTop: '10px' }}>
                  <input
                    type="email"
                    required={tipoDestino === 'manual'}
                    placeholder="ejemplo@correo.com o abogado@bufete.com"
                    value={emailManual}
                    onChange={(e) => setEmailManual(e.target.value)}
                    disabled={enviando}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#070a13',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '13.5px',
                      padding: '11px 14px',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Nota o Comentario Adicional Opcional */}
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
                Mensaje o nota aclaratoria (opcional):
              </label>
              <textarea
                rows={2}
                placeholder="Ej: Estimado copropietario, adjuntamos su estado de cuenta para su revisión antes del viernes..."
                value={notaAdicional}
                onChange={(e) => setNotaAdicional(e.target.value)}
                disabled={enviando}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#070a13',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  color: '#cbd5e1',
                  fontSize: '12.5px',
                  padding: '10px 12px',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                }}
              />
            </div>

            {/* Opciones adicionales: Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={incluirPdfAdjunto}
                  onChange={(e) => setIncluirPdfAdjunto(e.target.checked)}
                  disabled={enviando}
                />
                <span>📎 Adjuntar archivo PDF oficial del Expediente Legal (con hash y firmas)</span>
              </label>

              {emailAdmin && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enviarCopiaAdmin}
                    onChange={(e) => setEnviarCopiaAdmin(e.target.checked)}
                    disabled={enviando}
                  />
                  <span>📋 Enviar copia de respaldo (CC) al correo de la Junta ({emailAdmin})</span>
                </label>
              )}
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={enviando}
                style={{
                  flex: 2,
                  background: 'var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%))',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: enviando ? 'not-allowed' : 'pointer',
                  opacity: enviando ? 0.75 : 1,
                  boxShadow: '0 4px 16px rgba(249, 115, 22, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {enviando ? (
                  <>
                    <span className="spinner spinner--sm" />
                    <span>Generando PDF y Enviando...</span>
                  </>
                ) : (
                  <>
                    <span>✉️</span>
                    <span>Enviar Expediente Ahora</span>
                  </>
                )}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  )
}
