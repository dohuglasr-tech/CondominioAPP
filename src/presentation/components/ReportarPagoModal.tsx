import React, { useState, useRef, useCallback, useEffect } from 'react'
import { reportarPago, subirComprobante } from '../../data/pagosService'
import { comprimirImagen, ResultadoCompresion } from '../../utils/imageCompressor'
import { obtenerSaldoAFavorApartamento } from '../../data/saldoFavorService'
import { obtenerDeudasMora, DesgloseConceptoItem } from '../../data/moraService'
import { obtenerJunta, MiembroJunta } from '../../data/juntaService'
import { useAuth } from '../../application/contexts/AuthContext'
import { ConfigEdificio } from '../../data/supabase'

const BANCOS_VE = [
  'Banesco', 'Mercantil', 'Provincial', 'Venezuela',
  'Bicentenario', 'BNC', 'Exterior', 'Bancaribe',
  'Fondo Común', 'Otro',
]

type Step = 'deudas' | 'resumen' | 'metodo' | 'comprobante' | 'exito'
type MetodoPago = 'transferencia' | 'pago_movil' | 'efectivo' | 'zelle'

interface DeudaSeleccionable extends DesgloseConceptoItem {
  selected: boolean
}

interface Props {
  apartamentoId: string
  onClose: () => void
  onSuccess: () => void
  config?: ConfigEdificio | null
}

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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      title={`Copiar ${label || ''}`}
      style={{
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '8px',
        padding: '5px 10px',
        color: copied ? '#10b981' : '#aaa',
        fontSize: '11px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ Copiado' : '⧉ Copiar'}
    </button>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '10px',
      marginBottom: '6px',
      gap: '10px',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: '#666', fontSize: '11px', marginBottom: '2px' }}>{label}</p>
        <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, wordBreak: 'break-all' }}>{value}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  )
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '22px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height: '4px',
          borderRadius: '2px',
          flex: 1,
          background: i < current ? 'var(--color-accent, #f97316)' : i === current ? 'rgba(249,115,22,0.5)' : '#2a2a2a',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

export function ReportarPagoModal({ apartamentoId, onClose, onSuccess, config: configProp }: Props) {
  const { config: authConfig } = useAuth()
  const config = configProp || authConfig

  const [step, setStep] = useState<Step>('deudas')
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1: deudas
  const [loadingDeudas, setLoadingDeudas] = useState(true)
  const [deudas, setDeudas] = useState<DeudaSeleccionable[]>([])
  const [saldoAFavor, setSaldoAFavor] = useState(0)

  // Paso 2: resumen/monto
  const [otroMonto, setOtroMonto] = useState('')
  const [usarOtroMonto, setUsarOtroMonto] = useState(false)

  // Paso 3: método
  const [metodo, setMetodo] = useState<MetodoPago | null>(null)
  const [adminContacts, setAdminContacts] = useState<MiembroJunta[]>([])
  const [loadingJunta, setLoadingJunta] = useState(false)

  // Paso 4: comprobante
  const [loading, setLoading] = useState(false)
  const [optimizando, setOptimizando] = useState(false)
  const [statsCompresion, setStatsCompresion] = useState<ResultadoCompresion | null>(null)
  const [banco, setBanco] = useState('')
  const [referencia, setReferencia] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  // Tasa BCV desde config
  const tasaBcv = config?.tasa_bcv_actual || 859.06

  // Bloquear scroll del body
  useEffect(() => {
    const ov = document.body.style.overflow
    const ob = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    return () => {
      document.body.style.overflow = ov
      document.body.style.overscrollBehavior = ob
    }
  }, [])

  // Cargar deudas y saldo a favor
  useEffect(() => {
    let mounted = true
    const cargar = async () => {
      setLoadingDeudas(true)
      try {
        const [moraRes, saldoRes] = await Promise.all([
          obtenerDeudasMora(false, true),
          obtenerSaldoAFavorApartamento(apartamentoId).catch(() => null),
        ])
        if (!mounted) return
        const miDeuda = moraRes.data.find(d => d.apartamento_id === apartamentoId)
        const items = miDeuda?.desglose?.items || []
        setDeudas(
          items
            .filter(it => it.estado === 'pendiente' && it.monto > 0)
            .map(it => ({ ...it, selected: true }))
        )
        const saldoUsd = (saldoRes as any)?.saldo_a_favor_usd
        if (saldoUsd && saldoUsd > 0) {
          setSaldoAFavor(Number(saldoUsd))
        }
      } catch (e) {
        console.warn('[ReportarPagoModal] Error cargando deudas:', e)
      } finally {
        if (mounted) setLoadingDeudas(false)
      }
    }
    cargar()
    return () => { mounted = false }
  }, [apartamentoId])

  // Auto-scroll al botón cuando sube comprobante
  useEffect(() => {
    if (preview || statsCompresion) {
      const t = setTimeout(() => submitBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150)
      return () => clearTimeout(t)
    }
  }, [preview, statsCompresion])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(), 250)
  }, [onClose])

  // Deudas seleccionadas
  const deudasSeleccionadas = deudas.filter(d => d.selected)
  const totalUsd = deudasSeleccionadas.filter(d => d.moneda === 'USD').reduce((s, d) => s + d.monto, 0)
  const totalBs = deudasSeleccionadas.filter(d => d.moneda === 'BS').reduce((s, d) => s + d.monto, 0)
  const totalBsEquivalente = totalBs + (totalUsd * tasaBcv)

  // Monto efectivo a reportar (USD como Bs)
  const montoReportar = usarOtroMonto
    ? (parseFloat(otroMonto.replace(',', '.')) || 0)
    : totalBsEquivalente

  const toggleDeuda = (id: string) => {
    setDeudas(prev => prev.map(d => d.id === id ? { ...d, selected: !d.selected } : d))
  }

  const seleccionarTodas = () => setDeudas(prev => prev.map(d => ({ ...d, selected: true })))
  const deseleccionarTodas = () => setDeudas(prev => prev.map(d => ({ ...d, selected: false })))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { setArchivo(null); setPreview(null); setStatsCompresion(null); return }
    if (f.type.startsWith('image/')) {
      setOptimizando(true)
      try {
        const res = await comprimirImagen(f, { maxWidth: 1280, maxHeight: 1280, quality: 0.8, mimeType: 'image/webp' })
        setArchivo(res.file); setPreview(URL.createObjectURL(res.file)); setStatsCompresion(res)
      } catch { setArchivo(f); setPreview(URL.createObjectURL(f)) }
      finally { setOptimizando(false) }
    } else {
      setArchivo(f); setPreview(null); setStatsCompresion(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!banco || !referencia) return
    setLoading(true); setError(null)

    let comprobanteUrl: string | null = null
    if (archivo) {
      const { url, error: uploadErr } = await subirComprobante(archivo, apartamentoId)
      if (uploadErr) { setError(uploadErr); setLoading(false); return }
      comprobanteUrl = url
    }

    const { error: pagoErr } = await reportarPago({
      apartamento_id: apartamentoId,
      monto_bs: montoReportar,
      numero_referencia: referencia.trim(),
      banco_origen: banco,
      comprobante_url: comprobanteUrl,
      // Pasamos info extra en notas_admin (el servicio lo permite)
    } as any)

    if (pagoErr) { setError(pagoErr); setLoading(false); return }
    setStep('exito')
    setLoading(false)
  }

  const cargarJunta = async () => {
    if (adminContacts.length > 0) return
    setLoadingJunta(true)
    try {
      const res = await obtenerJunta()
      const admins = (res.data || []).filter(m => m.categoria === 'administracion')
      setAdminContacts(admins.length > 0 ? admins : (res.data || []).slice(0, 2))
    } catch { }
    finally { setLoadingJunta(false) }
  }

  // ── Estilos base ──────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 100050,
    padding: '16px',
    paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
    paddingBottom: 'max(40px, env(safe-area-inset-bottom, 40px))',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, overscrollBehavior: 'contain' as any,
  }
  const modal: React.CSSProperties = {
    margin: 'auto 0',
    backgroundColor: '#1c1c1c', border: '1px solid #2a2a2a',
    borderRadius: '20px', padding: '28px 22px',
    width: '100%', maxWidth: '440px',
    boxShadow: '0 25px 80px rgba(0,0,0,0.7), 0 0 40px rgba(249,115,22,0.08)',
    fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box',
  }
  const topAccent: React.CSSProperties = {
    position: 'absolute', top: 0, left: '20px', right: '20px', height: '3px',
    background: 'linear-gradient(90deg, transparent, var(--color-accent, #f97316), transparent)',
    borderRadius: '0 0 4px 4px',
  }
  const closeBtn: React.CSSProperties = {
    position: 'absolute', top: '16px', right: '16px',
    background: '#2a2a2a', border: 'none', color: '#aaa',
    width: '34px', height: '34px', borderRadius: '50%',
    cursor: 'pointer', fontSize: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', zIndex: 10,
  }
  const btnPrimary: React.CSSProperties = {
    width: '100%', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff',
    border: 'none', borderRadius: '12px', padding: '15px',
    fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    boxShadow: 'var(--color-brand-shadow, 0 4px 18px var(--color-accent-glow))',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
    transition: 'all 0.2s ease',
  }
  const btnSecondary: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)', color: '#ccc',
    border: '1px solid #2a2a2a', borderRadius: '12px', padding: '13px',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#050505', border: '1px solid #2a2a2a',
    borderRadius: '10px', padding: '13px 15px', color: '#fff', fontSize: '14px',
    outline: 'none', marginBottom: '14px', boxSizing: 'border-box', transition: 'border-color 0.2s',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
  const labelStyle: React.CSSProperties = {
    display: 'block', color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '8px',
  }
  const errorBox: React.CSSProperties = {
    backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
    color: '#fca5a5', padding: '12px', borderRadius: '10px', fontSize: '13px',
    marginBottom: '14px', textAlign: 'center',
  }

  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--color-accent, #f97316)'
    e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)'
  }
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#2a2a2a'; e.target.style.boxShadow = 'none'
  }

  const modalContent = (content: React.ReactNode) => (
    <div style={overlay} className="modal-overlay reportar-pago-overlay" onClick={handleClose}>
      <style>{`
        .reportar-pago-overlay { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
        @media (max-width: 600px) { .reportar-pago-modal { padding: 22px 16px !important; border-radius: 18px !important; } }
      `}</style>
      <div style={modal} className={`modal-card reportar-pago-modal ${closing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div style={topAccent} />
        <button style={closeBtn} onClick={handleClose} aria-label="Cerrar modal"
          onMouseOver={e => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff' }}
          onMouseOut={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#aaa' }}>
          ✕
        </button>
        {content}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────
  // PASO ÉXITO
  // ─────────────────────────────────────────────────────────────────
  if (step === 'exito') {
    return modalContent(
      <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
        <div style={{ marginBottom: '20px' }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ display: 'block', margin: '0 auto' }}>
            <circle cx="36" cy="36" r="34" stroke="#10b981" strokeWidth="3" fill="rgba(16,185,129,0.08)" />
            <path d="M22 36L32 46L50 26" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 50, strokeDashoffset: 0, animation: 'checkDraw 0.6s ease 0.3s both' }} />
          </svg>
        </div>
        <p style={{ color: '#fff', fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>¡Pago Reportado!</p>
        <p style={{ color: '#666', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
          Tu pago fue registrado y está en revisión.
        </p>
        <p style={{ color: '#555', fontSize: '13px', lineHeight: 1.6, marginBottom: '28px' }}>
          La administración lo confirmará en breve.<br />¡Gracias por mantenerte al día!
        </p>
        <button className="btn-premium ripple-container" style={btnPrimary}
          onClick={e => { createRipple(e); setTimeout(() => { onSuccess(); handleClose() }, 200) }}>
          Entendido
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 1: SELECCIÓN DE DEUDAS
  // ─────────────────────────────────────────────────────────────────
  if (step === 'deudas') {
    const todasSel = deudas.length > 0 && deudas.every(d => d.selected)

    return modalContent(
      <>
        <p style={{ color: '#fff', fontSize: '19px', fontWeight: 700, marginBottom: '2px', paddingRight: '40px' }}>Reportar Pago</p>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '18px' }}>Selecciona los conceptos que vas a pagar.</p>
        <StepIndicator current={0} total={4} />

        {saldoAFavor > 0 && (
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#6ee7b7', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '16px' }}>💚</span>
            <span><strong>Saldo a favor: ${saldoAFavor.toFixed(2)}</strong> — Reporta solo la diferencia.</span>
          </div>
        )}

        {loadingDeudas ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#555' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
            <p style={{ fontSize: '13px' }}>Cargando tu estado de cuenta...</p>
          </div>
        ) : deudas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#555' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
            <p style={{ color: '#aaa', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>¡Estás al día!</p>
            <p style={{ fontSize: '13px' }}>No tienes deudas pendientes registradas.</p>
            <p style={{ fontSize: '12px', color: '#444', marginTop: '6px' }}>Si deseas igual reportar un pago, avanza.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ color: '#888', fontSize: '12px' }}>{deudas.filter(d => d.selected).length} de {deudas.length} seleccionados</span>
              <button type="button" onClick={todasSel ? deseleccionarTodas : seleccionarTodas}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '0' }}>
                {todasSel ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
              {deudas.map(deuda => (
                <label key={deuda.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: deuda.selected ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${deuda.selected ? 'rgba(249,115,22,0.3)' : '#2a2a2a'}`,
                  borderRadius: '12px', padding: '12px 14px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <input type="checkbox" checked={deuda.selected} onChange={() => toggleDeuda(deuda.id)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent, #f97316)', cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{deuda.icono || '📌'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{deuda.label}</p>
                    <p style={{ color: '#888', fontSize: '12px' }}>
                      {deuda.moneda === 'USD' ? `$${deuda.monto.toFixed(2)} USD` : `Bs. ${deuda.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '10px', padding: '3px 7px', borderRadius: '6px',
                      background: deuda.moneda === 'USD' ? 'rgba(59,130,246,0.12)' : 'rgba(249,115,22,0.12)',
                      color: deuda.moneda === 'USD' ? '#60a5fa' : '#fb923c',
                      fontWeight: 600,
                    }}>{deuda.moneda}</span>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <button className="btn-premium ripple-container" style={{ ...btnPrimary, opacity: 0.95 }}
          onClick={e => { createRipple(e); setStep('resumen') }}>
          Avanzar →
        </button>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 2: RESUMEN + MONTO
  // ─────────────────────────────────────────────────────────────────
  if (step === 'resumen') {
    return modalContent(
      <>
        <p style={{ color: '#fff', fontSize: '19px', fontWeight: 700, marginBottom: '2px', paddingRight: '40px' }}>Resumen del Pago</p>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '18px' }}>Confirma el monto que transferirás.</p>
        <StepIndicator current={1} total={4} />

        {deudasSeleccionadas.length > 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            {deudasSeleccionadas.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#ccc', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>{d.icono}</span>{d.label}
                </span>
                <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                  {d.moneda === 'USD' ? `$${d.monto.toFixed(2)}` : `Bs. ${d.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', marginTop: '4px' }}>
              <span style={{ color: '#aaa', fontSize: '12px' }}>Total estimado Bs. (BCV: {tasaBcv.toFixed(2)})</span>
              <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '15px', fontWeight: 700 }}>
                Bs. {totalBsEquivalente.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '14px', marginBottom: '16px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
            No seleccionaste conceptos específicos.
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
          <input type="checkbox" checked={usarOtroMonto} onChange={e => setUsarOtroMonto(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent, #f97316)' }} />
          <span style={{ color: '#aaa', fontSize: '13px' }}>Ingresar un monto diferente (Bs.)</span>
        </label>

        {usarOtroMonto && (
          <div>
            <label style={labelStyle}>Monto a Transferir (Bs.)</label>
            <input type="text" placeholder="0,00" value={otroMonto}
              onChange={e => {
                let val = e.target.value.replace(/[^0-9,.]/g, '')
                setOtroMonto(val)
              }}
              style={inputStyle} onFocus={focusBorder} onBlur={blurBorder}
            />
          </div>
        )}

        <div style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '12px', padding: '12px 14px', marginBottom: '18px' }}>
          <p style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>Monto final a reportar</p>
          <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '22px', fontWeight: 800 }}>
            Bs. {(usarOtroMonto ? (parseFloat(otroMonto.replace(',', '.')) || 0) : totalBsEquivalente).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnSecondary} onClick={() => setStep('deudas')}>← Atrás</button>
          <button className="btn-premium ripple-container" style={{ ...btnPrimary }}
            onClick={e => { createRipple(e); setStep('metodo') }}>
            Avanzar →
          </button>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 3: MÉTODO DE PAGO
  // ─────────────────────────────────────────────────────────────────
  if (step === 'metodo') {
    const bcvAmount = montoReportar
    const bcvAmountStr = `Bs. ${bcvAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const metodosOpts: { id: MetodoPago; label: string; icon: string; color: string }[] = [
      { id: 'transferencia', label: 'Transferencia', icon: '🏦', color: '#3b82f6' },
      { id: 'pago_movil', label: 'Pago Móvil', icon: '📱', color: '#8b5cf6' },
      { id: 'efectivo', label: 'Efectivo $', icon: '💵', color: '#10b981' },
      { id: 'zelle', label: 'Zelle', icon: '🟣', color: '#6d28d9' },
    ]

    return modalContent(
      <>
        <p style={{ color: '#fff', fontSize: '19px', fontWeight: 700, marginBottom: '2px', paddingRight: '40px' }}>¿Cómo vas a pagar?</p>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '18px' }}>Selecciona tu método de pago.</p>
        <StepIndicator current={2} total={4} />

        {/* Selector de método */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
          {metodosOpts.map(m => (
            <button key={m.id} type="button"
              onClick={() => {
                setMetodo(m.id)
                if (m.id === 'efectivo') cargarJunta()
              }}
              style={{
                padding: '14px 10px', borderRadius: '12px', cursor: 'pointer',
                border: `2px solid ${metodo === m.id ? m.color : '#2a2a2a'}`,
                background: metodo === m.id ? `${m.color}18` : 'rgba(255,255,255,0.03)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                transition: 'all 0.2s',
              }}>
              <span style={{ fontSize: '24px' }}>{m.icon}</span>
              <span style={{ color: metodo === m.id ? '#fff' : '#888', fontSize: '13px', fontWeight: 600 }}>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Datos según método */}
        {metodo === 'transferencia' && (
          <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.05em' }}>💳 DATOS BANCARIOS</p>
            {config?.banco && <DataRow label="Banco" value={config.banco} />}
            {config?.titular_cuenta && <DataRow label="Titular" value={config.titular_cuenta} />}
            {config?.cedula_cuenta && <DataRow label="Cédula" value={config.cedula_cuenta} />}
            {config?.tipo_cuenta && <DataRow label="Tipo de Cuenta" value={config.tipo_cuenta} />}
            {config?.cuenta_bancaria && <DataRow label="Número de Cuenta" value={config.cuenta_bancaria} />}
            {!config?.banco && !config?.cuenta_bancaria && (
              <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                Contacta al administrador para los datos bancarios.
              </p>
            )}
          </div>
        )}

        {metodo === 'pago_movil' && (
          <div style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ color: '#a78bfa', fontSize: '12px', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.05em' }}>📱 PAGO MÓVIL</p>
            {config?.pago_movil_banco && <DataRow label="Banco" value={config.pago_movil_banco} />}
            {config?.pago_movil_cedula && <DataRow label="Cédula" value={config.pago_movil_cedula} />}
            {config?.pago_movil_telefono && <DataRow label="Teléfono" value={config.pago_movil_telefono} />}

            {/* Botón de copiar todo */}
            {(config?.pago_movil_banco || config?.pago_movil_cedula || config?.pago_movil_telefono) && (
              <button type="button"
                onClick={async () => {
                  const text = [
                    config?.pago_movil_banco ? `Banco: ${config.pago_movil_banco}` : '',
                    config?.pago_movil_cedula ? `Cédula: ${config.pago_movil_cedula}` : '',
                    config?.pago_movil_telefono ? `Teléfono: ${config.pago_movil_telefono}` : '',
                  ].filter(Boolean).join('\n')
                  await copyToClipboard(text)
                }}
                style={{
                  width: '100%', marginTop: '10px', padding: '11px',
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: '10px', color: '#c4b5fd', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
                }}>
                ⧉ Copiar todos los datos de Pago Móvil
              </button>
            )}
            {!config?.pago_movil_banco && !config?.pago_movil_telefono && (
              <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                Datos de pago móvil no configurados. Contacta al administrador.
              </p>
            )}
          </div>
        )}

        {metodo === 'efectivo' && (
          <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ color: '#6ee7b7', fontSize: '12px', fontWeight: 700, marginBottom: '10px', letterSpacing: '0.05em' }}>💵 PAGO EN EFECTIVO</p>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '12px' }}>
              Contacta a la administración para realizar tu pago en efectivo:
            </p>
            {loadingJunta ? (
              <p style={{ color: '#555', fontSize: '13px', textAlign: 'center' }}>Cargando contactos...</p>
            ) : adminContacts.length > 0 ? (
              adminContacts.map(m => (
                <div key={m.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
                  <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{m.nombre}</p>
                  <p style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>{m.cargo}</p>
                  {m.telefono && <DataRow label="Teléfono" value={m.telefono} />}
                  {m.email && <DataRow label="Email" value={m.email} />}
                </div>
              ))
            ) : (
              <p style={{ color: '#555', fontSize: '13px', textAlign: 'center' }}>
                Contacta al administrador directamente.
              </p>
            )}
          </div>
        )}

        {metodo === 'zelle' && (
          <div style={{ background: 'rgba(109,40,217,0.07)', border: '1px solid rgba(109,40,217,0.2)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.05em' }}>🟣 ZELLE</p>
            {config?.zelle_email ? (
              <DataRow label="Email Zelle" value={config.zelle_email} />
            ) : (
              <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                Email de Zelle no configurado. Contacta al administrador.
              </p>
            )}
          </div>
        )}

        {/* Monto en Bs. para copiar */}
        {metodo && (
          <div style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '12px', padding: '12px 14px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div>
                <p style={{ color: '#888', fontSize: '11px', marginBottom: '3px' }}>
                  Monto a pagar • BCV: {tasaBcv.toFixed(2)}
                </p>
                <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '18px', fontWeight: 800 }}>{bcvAmountStr}</p>
              </div>
              <CopyButton value={bcvAmountStr} label="monto" />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnSecondary} onClick={() => setStep('resumen')}>← Atrás</button>
          <button className="btn-premium ripple-container"
            style={{ ...btnPrimary, opacity: metodo ? 1 : 0.5, cursor: metodo ? 'pointer' : 'not-allowed' }}
            disabled={!metodo}
            onClick={e => { if (!metodo) return; createRipple(e); setBanco(''); setStep('comprobante') }}>
            Avanzar →
          </button>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 4: DATOS DEL COMPROBANTE
  // ─────────────────────────────────────────────────────────────────
  if (step === 'comprobante') {
    const isFormValid = Boolean(banco && referencia)

    return modalContent(
      <>
        <p style={{ color: '#fff', fontSize: '19px', fontWeight: 700, marginBottom: '2px', paddingRight: '40px' }}>Datos del Comprobante</p>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '18px' }}>Completa la información de tu pago.</p>
        <StepIndicator current={3} total={4} />

        <form onSubmit={handleSubmit}>
          {error && <div style={errorBox}>{error}</div>}

          <div>
            <label style={labelStyle}>Banco de Origen</label>
            <select style={selectStyle} value={banco} onChange={e => setBanco(e.target.value)} required onFocus={focusBorder as any} onBlur={blurBorder as any}>
              <option value="">Seleccionar banco...</option>
              {BANCOS_VE.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Número de Referencia</label>
            <input type="text" placeholder="Últimos 8 dígitos" style={inputStyle} value={referencia}
              onChange={e => setReferencia(e.target.value)} required maxLength={30} onFocus={focusBorder} onBlur={blurBorder} />
          </div>

          <div>
            <label style={labelStyle}>Captura del Comprobante (opcional)</label>
            <div style={{
              border: '2px dashed #2a2a2a', borderRadius: '14px',
              padding: preview ? '14px' : '22px 16px', textAlign: 'center', cursor: 'pointer',
              marginBottom: '16px', transition: 'border-color 0.25s, background-color 0.25s',
            }}
              onClick={() => fileRef.current?.click()}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-accent, #f97316)'; e.currentTarget.style.backgroundColor = 'rgba(249,115,22,0.03)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.backgroundColor = 'transparent' }}>
              {optimizando ? (
                <>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>⚡</p>
                  <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 600 }}>Optimizando comprobante...</p>
                </>
              ) : preview ? (
                <>
                  <img src={preview} alt="Comprobante" style={{ width: '100%', maxHeight: '130px', objectFit: 'contain', borderRadius: '8px', marginBottom: '8px' }} />
                  <p style={{ color: '#888', fontSize: '12px' }}>Clic para cambiar comprobante</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>📎</p>
                  <p style={{ color: '#888', fontSize: '13px' }}>Adjuntar captura de transferencia</p>
                  <p style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>PNG, JPG o PDF · Se optimiza automáticamente</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
            </div>
            {statsCompresion && statsCompresion.ahorroPct > 0 && (
              <div style={{ marginBottom: '14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#10b981', fontWeight: 600 }}>
                <span>⚡ Imagen optimizada</span>
                <span>{statsCompresion.originalSizeStr} → {statsCompresion.compressedSizeStr} ({statsCompresion.ahorroPct}% ahorro)</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button type="button" style={btnSecondary} onClick={() => setStep('metodo')}>← Atrás</button>
            <button ref={submitBtnRef} type="submit" className="btn-premium ripple-container"
              style={{ ...btnPrimary, opacity: (loading || !isFormValid) ? 0.5 : 1, cursor: (loading || !isFormValid) ? 'not-allowed' : 'pointer', boxShadow: (loading || !isFormValid) ? 'none' : btnPrimary.boxShadow }}
              disabled={loading || !isFormValid}
              onClick={e => !loading && isFormValid && createRipple(e)}>
              {loading ? '⏳ Reportando...' : 'Reportar Pago ✓'}
            </button>
          </div>
        </form>
      </>
    )
  }

  return null
}
