import React, { useState, useRef, useCallback } from 'react'
import { reportarPago, subirComprobante } from '../../data/pagosService'

const BANCOS_VE = [
  'Banesco', 'Mercantil', 'Provincial', 'Venezuela',
  'Bicentenario', 'BNC', 'Exterior', 'Bancaribe',
  'Fondo Común', 'Otro',
]

interface Props {
  apartamentoId: string
  onClose: () => void
  onSuccess: () => void
}

/**
 * Efecto ripple en botones — crea un círculo desde el punto de clic
 */
function createRipple(e: React.MouseEvent<HTMLButtonElement>) {
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2

  const ripple = document.createElement('span')
  ripple.className = 'ripple'
  ripple.style.width = ripple.style.height = `${size}px`
  ripple.style.left = `${x}px`
  ripple.style.top = `${y}px`
  btn.appendChild(ripple)
  setTimeout(() => ripple.remove(), 600)
}

export function ReportarPagoModal({ apartamentoId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [banco, setBanco] = useState('')
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Cierre animado
  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(), 250) // Espera la animación de salida
  }, [onClose])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setArchivo(f)
    if (f) setPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!banco || !monto || !referencia) return

    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido.')
      return
    }

    setLoading(true)
    setError(null)

    let comprobanteUrl: string | null = null
    if (archivo) {
      const { url, error: uploadErr } = await subirComprobante(archivo, apartamentoId)
      if (uploadErr) { setError(uploadErr); setLoading(false); return }
      comprobanteUrl = url
    }

    const { error: pagoErr } = await reportarPago({
      apartamento_id: apartamentoId,
      monto_bs: montoNum,
      numero_referencia: referencia.trim(),
      banco_origen: banco,
      comprobante_url: comprobanteUrl,
    })

    if (pagoErr) { setError(pagoErr); setLoading(false); return }

    setStep(2)
    setLoading(false)
  }

  // ── Estilos ────────────────────────────────────────────────────
  const st = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
      padding: '20px',
    },
    modal: {
      backgroundColor: '#1c1c1c',
      border: '1px solid #2a2a2a',
      borderRadius: '20px',
      padding: '36px 32px',
      width: '100%',
      maxWidth: '440px',
      boxShadow: '0 25px 80px rgba(0,0,0,0.7), 0 0 40px rgba(249,115,22,0.08)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative' as const,
    },
    topAccent: {
      position: 'absolute' as const,
      top: 0, left: '20px', right: '20px',
      height: '3px',
      background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
      borderRadius: '0 0 4px 4px',
    },
    closeBtn: {
      position: 'absolute' as const,
      top: '18px', right: '18px',
      background: '#2a2a2a',
      border: 'none',
      color: '#666',
      width: '34px', height: '34px',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: '14px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
    },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '6px' },
    subtitle: { color: '#888', fontSize: '13px', marginBottom: '28px' },
    label: { display: 'block', color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '8px' },
    input: {
      width: '100%',
      backgroundColor: '#050505',
      border: '1px solid #2a2a2a',
      borderRadius: '10px',
      padding: '14px 16px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '20px',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s, box-shadow 0.3s',
    },
    select: {
      width: '100%',
      backgroundColor: '#050505',
      border: '1px solid #2a2a2a',
      borderRadius: '10px',
      padding: '14px 16px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '20px',
      boxSizing: 'border-box' as const,
      cursor: 'pointer',
      transition: 'border-color 0.2s, box-shadow 0.3s',
    },
    uploadBox: {
      border: '2px dashed #2a2a2a',
      borderRadius: '14px',
      padding: '28px',
      textAlign: 'center' as const,
      cursor: 'pointer',
      marginBottom: '24px',
      transition: 'border-color 0.25s, background-color 0.25s, transform 0.2s',
    },
    previewImg: {
      width: '100%',
      maxHeight: '140px',
      objectFit: 'contain' as const,
      borderRadius: '8px',
      marginBottom: '8px',
    },
    btnPrimary: {
      width: '100%',
      backgroundColor: '#f97316',
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      padding: '15px',
      fontSize: '15px',
      fontWeight: 700,
      cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(249,115,22,0.35)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
    },
    errorBox: {
      backgroundColor: 'rgba(220,38,38,0.1)',
      border: '1px solid rgba(220,38,38,0.3)',
      color: '#fca5a5',
      padding: '12px',
      borderRadius: '10px',
      fontSize: '13px',
      marginBottom: '16px',
      textAlign: 'center' as const,
    },
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#f97316'
    e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.15), 0 0 15px rgba(249,115,22,0.08)'
  }
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#2a2a2a'
    e.target.style.boxShadow = 'none'
  }

  // ── PASO 2: ÉXITO ────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={st.overlay} className="modal-overlay" onClick={handleClose}>
        <div style={st.modal} className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div style={st.topAccent}></div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {/* Ícono animado de éxito */}
            <div className="animate-success-pop" style={{ marginBottom: '20px' }}>
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ display: 'block', margin: '0 auto' }}>
                <circle cx="36" cy="36" r="34" stroke="#10b981" strokeWidth="3" fill="rgba(16,185,129,0.08)" />
                <path d="M22 36L32 46L50 26" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    strokeDasharray: 50,
                    strokeDashoffset: 0,
                    animation: 'checkDraw 0.6s ease 0.3s both',
                  }}
                />
              </svg>
            </div>
            <p style={{ color: '#fff', fontSize: '22px', fontWeight: 700, marginBottom: '10px' }}>
              ¡Pago Reportado!
            </p>
            <p style={{ color: '#888', fontSize: '14px', lineHeight: 1.6, marginBottom: '32px' }}>
              Tu pago fue registrado y está en revisión.<br />
              La administración lo confirmará en breve.
            </p>
            <button
              className="btn-premium ripple-container"
              style={st.btnPrimary}
              onClick={(e) => { createRipple(e); setTimeout(() => { onSuccess(); handleClose() }, 200) }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── PASO 1: FORMULARIO ────────────────────────────────────────
  return (
    <div
      style={st.overlay}
      className={`modal-overlay ${closing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div
        style={st.modal}
        className={`modal-card ${closing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.topAccent}></div>

        <button
          style={st.closeBtn}
          onClick={handleClose}
          onMouseOver={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff' }}
          onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#666' }}
        >
          ✕
        </button>

        <p style={st.title}>Reportar Pago</p>
        <p style={st.subtitle}>Completa los datos de tu transferencia.</p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={st.errorBox} className="animate-slide-up">{error}</div>
          )}

          <div>
            <label style={st.label}>Banco de Origen</label>
            <select
              style={st.select}
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              required
              onFocus={focusStyle as any}
              onBlur={blurStyle as any}
            >
              <option value="">Seleccionar banco...</option>
              {BANCOS_VE.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label style={st.label}>Monto (Bs.)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              style={st.input}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>

          <div>
            <label style={st.label}>Número de Referencia</label>
            <input
              type="text"
              placeholder="Últimos 8 dígitos"
              style={st.input}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              required
              maxLength={30}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>

          <div>
            <label style={st.label}>Comprobante (opcional)</label>
            <div
              style={st.uploadBox}
              onClick={() => fileRef.current?.click()}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#f97316'
                e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.03)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#2a2a2a'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {preview ? (
                <>
                  <img src={preview} alt="Comprobante" style={st.previewImg} />
                  <p style={{ color: '#888', fontSize: '12px' }}>Clic para cambiar</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>📎</p>
                  <p style={{ color: '#888', fontSize: '13px' }}>Adjuntar captura de transferencia</p>
                  <p style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>PNG, JPG o PDF · Máx 5MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-premium ripple-container"
            style={st.btnPrimary}
            disabled={loading || !banco || !monto || !referencia}
            onClick={(e) => !loading && createRipple(e)}
          >
            {loading ? '⏳ Enviando...' : 'Confirmar Pago'}
          </button>
        </form>
      </div>
    </div>
  )
}
