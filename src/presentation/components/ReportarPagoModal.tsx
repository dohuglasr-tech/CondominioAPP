import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { reportarPago, subirComprobante } from '../../data/pagosService'
import { comprimirImagen, ResultadoCompresion } from '../../utils/imageCompressor'
import { obtenerSaldoAFavorApartamento } from '../../data/saldoFavorService'
import { useBcvRate } from '../../data/useBcvRate'
import { supabase } from '../../data/supabase'

const BANCOS_VE = [
  'Banesco', 'Mercantil', 'Provincial', 'Venezuela',
  'Bicentenario', 'BNC', 'Exterior', 'Bancaribe',
  'Fondo Común', 'Otro',
]

export interface DeudaItemAbono {
  id: string
  tipo: 'historica_bs' | 'marzo_usd'
  titulo: string
  subtitulo: string
  montoOriginal: number // Bs si es historica_bs, USD si es marzo_usd
  moneda: 'BS' | 'USD'
  mesFacturado?: string
  reciboId?: string
}

interface Props {
  apartamentoId: string
  onClose: () => void
  onSuccess: () => void
  modoInicial?: 'pago_total' | 'abono'
  reciboInicialId?: string
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

export function ReportarPagoModal({ apartamentoId, onClose, onSuccess, modoInicial = 'pago_total', reciboInicialId }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [optimizando, setOptimizando] = useState(false)
  const [statsCompresion, setStatsCompresion] = useState<ResultadoCompresion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saldoAFavor, setSaldoAFavor] = useState<number>(0)

  // Modo: 'pago_total' o 'abono'
  const [modo, setModo] = useState<'pago_total' | 'abono'>(modoInicial)
  const [deudasAbono, setDeudasAbono] = useState<DeudaItemAbono[]>([])
  const [deudaSeleccionadaId, setDeudaSeleccionadaId] = useState<string>('')
  const [cargandoDeudas, setCargandoDeudas] = useState(false)

  // Inputs para Abono
  const [abonoUsdStr, setAbonoUsdStr] = useState<string>('')
  const [abonoBsStr, setAbonoBsStr] = useState<string>('')

  // Datos comunes de pago
  const [banco, setBanco] = useState('')
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  const { rate } = useBcvRate()
  const tasaValida = rate && rate > 1 ? rate : 859.06

  // Bloquear scroll del body al abrir el modal para que los gestos de scroll se enfoquen en el modal
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const originalOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'contain'
    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.overscrollBehavior = originalOverscroll
    }
  }, [])

  // Cargar saldo a favor disponible si el residente tiene crédito
  useEffect(() => {
    if (apartamentoId) {
      obtenerSaldoAFavorApartamento(apartamentoId).then((res) => {
        if (res?.saldo_a_favor_usd > 0) {
          setSaldoAFavor(res.saldo_a_favor_usd)
        }
      }).catch(() => {})
    }
  }, [apartamentoId])

  // Cargar deudas y recibos pendientes para el selector de abono
  useEffect(() => {
    if (!apartamentoId) return
    setCargandoDeudas(true)
    Promise.all([
      supabase
        .from('recibos_generados')
        .select('id, mes_facturado, total_usd, total_bs, estado')
        .eq('apartamento_id', apartamentoId)
        .eq('estado', 'pendiente')
        .order('mes_facturado', { ascending: true }),
      supabase
        .from('deudas_mora')
        .select('id, monto_bs, monto_usd, meses_deuda, conceptos_detalle, estado')
        .eq('apartamento_id', apartamentoId)
        .neq('estado', 'solventado')
        .maybeSingle()
    ]).then(([recibosRes, moraRes]) => {
      const lista: DeudaItemAbono[] = []
      const recs = recibosRes.data || []

      // 1. Recibos de condominio
      recs.forEach((r) => {
        const mes = (r.mes_facturado || '').slice(0, 7)
        if (mes < '2026-03') {
          // Pre-marzo: Se calcula en Bolívares
          lista.push({
            id: `recibo-${r.id}`,
            reciboId: r.id,
            tipo: 'historica_bs',
            titulo: `Recibo Histórico (${r.mes_facturado})`,
            subtitulo: 'Periodo anterior a Marzo 2026 (Cálculo en Bolívares fijos)',
            montoOriginal: Number(r.total_bs || 0),
            moneda: 'BS',
            mesFacturado: r.mes_facturado
          })
        } else {
          // Marzo 2026 en adelante: Se calcula en Dólares
          lista.push({
            id: `recibo-${r.id}`,
            reciboId: r.id,
            tipo: 'marzo_usd',
            titulo: `Recibo de Condominio (${r.mes_facturado})`,
            subtitulo: 'Marzo 2026 en adelante (Cálculo en USD a tasa BCV)',
            montoOriginal: Number(r.total_usd || 0),
            moneda: 'USD',
            mesFacturado: r.mes_facturado
          })
        }
      })

      // 2. Deuda en mora registrada manualmente (ej. 2023, 2024 o crónicos)
      if (moraRes.data) {
        if (Number(moraRes.data.monto_bs || 0) > 0) {
          lista.push({
            id: `mora-bs-${moraRes.data.id}`,
            tipo: 'historica_bs',
            titulo: 'Deuda Histórica Años Anteriores (Pre-Marzo)',
            subtitulo: moraRes.data.conceptos_detalle || 'Deuda acumulada fijada en Bolívares',
            montoOriginal: Number(moraRes.data.monto_bs),
            moneda: 'BS'
          })
        }
        if (Number(moraRes.data.monto_usd || 0) > 0) {
          lista.push({
            id: `mora-usd-${moraRes.data.id}`,
            tipo: 'marzo_usd',
            titulo: 'Deuda en Mora Acumulada (USD)',
            subtitulo: moraRes.data.conceptos_detalle || 'Deuda en Dólares',
            montoOriginal: Number(moraRes.data.monto_usd),
            moneda: 'USD'
          })
        }
      }

      setDeudasAbono(lista)
      if (reciboInicialId) {
        const found = lista.find(d => d.reciboId === reciboInicialId)
        if (found) setDeudaSeleccionadaId(found.id)
        else if (lista.length > 0) setDeudaSeleccionadaId(lista[0].id)
      } else if (lista.length > 0) {
        setDeudaSeleccionadaId(lista[0].id)
      }
    }).catch(err => {
      console.warn('[ReportarPagoModal] Error cargando deudas:', err)
    }).finally(() => {
      setCargandoDeudas(false)
    })
  }, [apartamentoId, reciboInicialId])

  // Deuda actualmente seleccionada para el abono
  const deudaSeleccionada = useMemo(() => {
    return deudasAbono.find(d => d.id === deudaSeleccionadaId) || deudasAbono[0] || null
  }, [deudasAbono, deudaSeleccionadaId])

  // Sincronizar input de abono con el campo monto general en Bs
  const handleAbonoChange = (val: string, origen: 'USD' | 'BS') => {
    if (deudaSeleccionada?.tipo === 'marzo_usd') {
      if (origen === 'USD') {
        setAbonoUsdStr(val)
        const usdNum = parseFloat(val.replace(',', '.')) || 0
        const bsCalc = usdNum * tasaValida
        setAbonoBsStr(usdNum > 0 ? bsCalc.toFixed(2).replace('.', ',') : '')
        setMonto(usdNum > 0 ? bsCalc.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
      } else {
        setAbonoBsStr(val)
        const bsNum = parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0
        const usdCalc = bsNum > 0 ? bsNum / tasaValida : 0
        setAbonoUsdStr(usdCalc > 0 ? usdCalc.toFixed(2) : '')
        setMonto(val)
      }
    } else {
      // Deuda histórica pre-marzo: se calcula en Bolívares
      setAbonoBsStr(val)
      const bsNum = parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0
      const usdRef = bsNum > 0 ? bsNum / tasaValida : 0
      setAbonoUsdStr(usdRef > 0 ? usdRef.toFixed(2) : '')
      setMonto(val)
    }
  }

  // Cálculos de saldo restante estimado
  const calculoAbono = useMemo(() => {
    if (!deudaSeleccionada) return null

    const montoOriginal = deudaSeleccionada.montoOriginal
    if (deudaSeleccionada.tipo === 'marzo_usd') {
      const abonoUsd = parseFloat(abonoUsdStr.replace(',', '.')) || 0
      const abonoBs = abonoUsd * tasaValida
      const restanteUsd = Math.max(0, montoOriginal - abonoUsd)
      const restanteBs = restanteUsd * tasaValida
      return {
        montoOriginalUsd: montoOriginal,
        montoOriginalBs: montoOriginal * tasaValida,
        abonoUsd,
        abonoBs,
        restanteUsd,
        restanteBs,
        esTotal: abonoUsd >= montoOriginal && montoOriginal > 0
      }
    } else {
      // Deuda en Bolívares
      const bsLimpio = abonoBsStr.replace(/\./g, '').replace(',', '.')
      const abonoBs = parseFloat(bsLimpio) || 0
      const restanteBs = Math.max(0, montoOriginal - abonoBs)
      return {
        montoOriginalBs: montoOriginal,
        montoOriginalUsd: montoOriginal / tasaValida,
        abonoBs,
        abonoUsd: abonoBs / tasaValida,
        restanteBs,
        restanteUsd: restanteBs / tasaValida,
        esTotal: abonoBs >= montoOriginal && montoOriginal > 0
      }
    }
  }, [deudaSeleccionada, abonoUsdStr, abonoBsStr, tasaValida])

  // Auto-scroll suave hacia el botón cuando se carga comprobante o termina la compresión
  useEffect(() => {
    if (preview || statsCompresion) {
      const timer = setTimeout(() => {
        submitBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [preview, statsCompresion])

  // Cierre animado
  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(), 250)
  }, [onClose])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setArchivo(null)
      setPreview(null)
      setStatsCompresion(null)
      return
    }

    if (f.type.startsWith('image/')) {
      setOptimizando(true)
      try {
        const res = await comprimirImagen(f, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.8,
          mimeType: 'image/webp'
        })
        setArchivo(res.file)
        setPreview(URL.createObjectURL(res.file))
        setStatsCompresion(res)
      } catch (err) {
        console.warn('Error comprimiendo comprobante:', err)
        setArchivo(f)
        setPreview(URL.createObjectURL(f))
      } finally {
        setOptimizando(false)
      }
    } else {
      setArchivo(f)
      setPreview(null)
      setStatsCompresion(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!banco || !monto || !referencia) return

    const montoLimpio = monto.replace(/\./g, '').replace(',', '.')
    const montoNum = parseFloat(montoLimpio)

    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido mayor a 0.')
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

    const esAbono = modo === 'abono'
    const abonoUsdNum = calculoAbono?.abonoUsd || (montoNum / tasaValida)

    const { error: pagoErr } = await reportarPago({
      apartamento_id: apartamentoId,
      monto_bs: montoNum,
      monto_usd: deudaSeleccionada?.tipo === 'marzo_usd' ? abonoUsdNum : Number((montoNum / tasaValida).toFixed(2)),
      tasa_bcv: tasaValida,
      numero_referencia: referencia.trim(),
      banco_origen: banco,
      comprobante_url: comprobanteUrl,
      es_abono: esAbono,
      tipo_deuda_abonada: deudaSeleccionada?.tipo || 'general',
      recibo_id: deudaSeleccionada?.reciboId || null,
      periodo_referencia: deudaSeleccionada?.titulo || null,
      saldo_restante_estimado: esAbono ? (deudaSeleccionada?.tipo === 'marzo_usd' ? calculoAbono?.restanteUsd : calculoAbono?.restanteBs) : null,
      notas_residente: esAbono
        ? `Abono de ${deudaSeleccionada?.tipo === 'marzo_usd' ? `$${abonoUsdNum.toFixed(2)} USD (Bs. ${montoNum.toLocaleString('es-VE')})` : `Bs. ${montoNum.toLocaleString('es-VE')}`} a ${deudaSeleccionada?.titulo || 'la deuda'}`
        : null
    })

    if (pagoErr) { setError(pagoErr); setLoading(false); return }

    setStep(2)
    setLoading(false)
  }

  const isFormValid = Boolean(banco && monto && referencia)

  // ── Estilos ────────────────────────────────────────────────────
  const st = {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.88)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      zIndex: 100050,
      padding: '16px',
      paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
      paddingBottom: 'max(40px, env(safe-area-inset-bottom, 40px))',
      overflowY: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as const,
      overscrollBehavior: 'contain' as const,
      touchAction: 'pan-y' as const,
    },
    modal: {
      margin: 'auto 0',
      backgroundColor: '#161922',
      border: '1px solid #283040',
      borderRadius: '24px',
      padding: '28px 24px',
      width: '100%',
      maxWidth: '480px',
      boxShadow: '0 25px 80px rgba(0,0,0,0.8), 0 0 40px rgba(249,115,22,0.1)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative' as const,
      boxSizing: 'border-box' as const,
    },
    topAccent: {
      position: 'absolute' as const,
      top: 0, left: '24px', right: '24px',
      height: '3px',
      background: modo === 'abono'
        ? 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
        : 'linear-gradient(90deg, transparent, #f97316, transparent)',
      borderRadius: '0 0 4px 4px',
    },
    closeBtn: {
      position: 'absolute' as const,
      top: '16px', right: '16px',
      background: '#232a3b',
      border: 'none',
      color: '#aaa',
      width: '34px', height: '34px',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: '14px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
      zIndex: 10,
    },
    title: { color: '#fff', fontSize: '20px', fontWeight: 800, marginBottom: '4px' },
    subtitle: { color: '#94a3b8', fontSize: '13px', marginBottom: '16px' },
    label: { display: 'block', color: '#e2e8f0', fontSize: '13px', fontWeight: 700, marginBottom: '6px' },
    input: {
      width: '100%',
      backgroundColor: '#0a0d14',
      border: '1px solid #242c3d',
      borderRadius: '12px',
      padding: '13px 15px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '14px',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s, box-shadow 0.3s',
    },
    select: {
      width: '100%',
      backgroundColor: '#0a0d14',
      border: '1px solid #242c3d',
      borderRadius: '12px',
      padding: '13px 15px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '14px',
      boxSizing: 'border-box' as const,
      cursor: 'pointer',
      transition: 'border-color 0.2s, box-shadow 0.3s',
    },
    uploadBox: {
      border: '2px dashed #2d3748',
      borderRadius: '14px',
      padding: preview ? '14px' : '20px 16px',
      textAlign: 'center' as const,
      cursor: 'pointer',
      marginBottom: '18px',
      transition: 'border-color 0.25s, background-color 0.25s, transform 0.2s',
    },
    previewImg: {
      width: '100%',
      maxHeight: '130px',
      objectFit: 'contain' as const,
      borderRadius: '8px',
      marginBottom: '8px',
    },
    btnPrimary: {
      width: '100%',
      backgroundColor: modo === 'abono' ? '#2563eb' : '#f97316',
      color: '#fff',
      border: 'none',
      borderRadius: '12px',
      padding: '15px',
      fontSize: '15px',
      fontWeight: 700,
      cursor: 'pointer',
      boxShadow: modo === 'abono' ? '0 4px 20px rgba(37,99,235,0.4)' : '0 4px 20px rgba(249,115,22,0.35)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      transition: 'all 0.2s ease',
    },
    errorBox: {
      backgroundColor: 'rgba(220,38,38,0.12)',
      border: '1px solid rgba(220,38,38,0.35)',
      color: '#fca5a5',
      padding: '12px',
      borderRadius: '10px',
      fontSize: '13px',
      marginBottom: '16px',
      textAlign: 'center' as const,
    },
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = modo === 'abono' ? '#3b82f6' : '#f97316'
    e.target.style.boxShadow = modo === 'abono'
      ? '0 0 0 3px rgba(59,130,246,0.18)'
      : '0 0 0 3px rgba(249,115,22,0.18)'
  }

  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = '#242c3d'
    e.target.style.boxShadow = 'none'
  }

  // ── PASO 2: ÉXITO ────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={st.overlay} className="modal-overlay reportar-pago-overlay" onClick={handleClose}>
        <div style={st.modal} className="modal-card reportar-pago-modal" onClick={(e) => e.stopPropagation()}>
          <div style={st.topAccent}></div>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div className="animate-success-pop" style={{ marginBottom: '20px' }}>
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ display: 'block', margin: '0 auto' }}>
                <circle cx="36" cy="36" r="34" stroke="#10b981" strokeWidth="3" fill="rgba(16,185,129,0.08)" />
                <path d="M22 36L32 46L50 26" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ color: '#fff', fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>
              {modo === 'abono' ? '¡Abono Reportado con Éxito!' : '¡Pago Reportado!'}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
              {modo === 'abono' ? (
                <>
                  Tu abono de <strong>Bs. {monto}</strong> fue registrado y acreditado en revisión.<br />
                  La administración validará la transferencia para amortizar tu saldo pendiente.
                </>
              ) : (
                <>
                  Tu pago fue registrado y está en revisión.<br />
                  La administración lo confirmará en breve.
                </>
              )}
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
      className={`modal-overlay reportar-pago-overlay ${closing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div
        style={st.modal}
        className={`modal-card reportar-pago-modal ${closing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.topAccent}></div>

        <button
          style={st.closeBtn}
          onClick={handleClose}
          aria-label="Cerrar modal"
          onMouseOver={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff' }}
          onMouseOut={(e) => { e.currentTarget.style.background = '#232a3b'; e.currentTarget.style.color = '#aaa' }}
        >
          ✕
        </button>

        <p style={st.title}>
          {modo === 'abono' ? '🪙 Abonar a la Deuda' : '💳 Reportar Pago'}
        </p>
        <p style={st.subtitle}>
          {modo === 'abono'
            ? 'Realiza un abono parcial a un recibo o deuda anterior.'
            : 'Completa los datos de tu transferencia para conciliar tu recibo.'}
        </p>

        {/* SELECTOR DE MODO: PAGO TOTAL vs ABONAR */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          backgroundColor: '#0a0d14',
          padding: '4px',
          borderRadius: '14px',
          border: '1px solid #242c3d',
          marginBottom: '18px',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => setModo('pago_total')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: modo === 'pago_total' ? '#f97316' : 'transparent',
              color: modo === 'pago_total' ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>💳</span> Pago Total
          </button>

          <button
            type="button"
            onClick={() => setModo('abono')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: modo === 'abono' ? '#2563eb' : 'transparent',
              color: modo === 'abono' ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🪙</span> Abonar
          </button>
        </div>

        {saldoAFavor > 0 && (
          <div style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: '#86efac',
            lineHeight: 1.4
          }}>
            <span style={{ fontSize: '18px' }}>💚</span>
            <div>
              <strong>Saldo a favor: ${saldoAFavor.toFixed(2)} USD</strong>. Si estás usando este crédito para pagar, reporta solo la diferencia transferida.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={st.errorBox} className="animate-slide-up">{error}</div>
          )}

          {/* ── SECCIÓN DESPLEGABLE: MENÚ DE ABONAR ── */}
          {modo === 'abono' && (
            <div style={{
              backgroundColor: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#60a5fa', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🎯 Menú de Abono a Deuda
                </span>
                <span style={{
                  fontSize: '11px',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  color: '#94a3b8'
                }}>
                  BCV: {tasaValida.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/$
                </span>
              </div>

              {/* Selector de Deuda / Recibo */}
              <div>
                <label style={{ ...st.label, fontSize: '12px', color: '#93c5fd' }}>
                  ¿A qué deuda o periodo deseas abonar?
                </label>
                {cargandoDeudas ? (
                  <div style={{ color: '#888', fontSize: '12px', padding: '10px 0' }}>Cargando deudas pendientes...</div>
                ) : deudasAbono.length > 0 ? (
                  <select
                    style={{ ...st.select, marginBottom: '12px', borderColor: 'rgba(59, 130, 246, 0.4)' }}
                    value={deudaSeleccionadaId}
                    onChange={(e) => {
                      setDeudaSeleccionadaId(e.target.value)
                      setAbonoUsdStr('')
                      setAbonoBsStr('')
                      setMonto('')
                    }}
                    onFocus={focusStyle as any}
                    onBlur={blurStyle as any}
                  >
                    {deudasAbono.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.tipo === 'historica_bs' ? '📜 Pre-Marzo: ' : '💵 Post-Marzo: '}
                        {d.titulo} — {d.moneda === 'BS' ? `Bs. ${d.montoOriginal.toLocaleString('es-VE')}` : `$${d.montoOriginal.toFixed(2)} USD`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ color: '#f59e0b', fontSize: '12px', marginBottom: '12px', padding: '8px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px' }}>
                    No se encontraron recibos pendientes. Puedes abonar a saldo deudor general.
                  </div>
                )}
              </div>

              {/* Explicación según la regla: Pre-Marzo (Bs) vs Post-Marzo (USD a Tasa BCV) */}
              {deudaSeleccionada && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: deudaSeleccionada.tipo === 'historica_bs' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  border: deudaSeleccionada.tipo === 'historica_bs' ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                  marginBottom: '14px',
                  fontSize: '11.5px',
                  lineHeight: 1.4,
                  color: deudaSeleccionada.tipo === 'historica_bs' ? '#fde047' : '#86efac'
                }}>
                  {deudaSeleccionada.tipo === 'historica_bs' ? (
                    <>
                      <strong>📜 Deuda Anterior a Marzo:</strong> Esta deuda corresponde a un periodo previo a marzo. El cálculo total y la sumatoria del abono es en <strong>Bolívares</strong> (monto fijo sin anclaje flotante).
                    </>
                  ) : (
                    <>
                      <strong>💵 Deuda Desde Marzo 2026:</strong> Este recibo fue emitido con cálculo en <strong>Dólares</strong>. Tu abono se calcula en Dólares y se convierte a Bolívares al cambio oficial BCV.
                    </>
                  )}
                </div>
              )}

              {/* Input de cuánto abonar con conversión inmediata */}
              <div>
                <label style={{ ...st.label, fontSize: '12px', color: '#93c5fd' }}>
                  ¿Cuánto deseas abonar?
                </label>

                {deudaSeleccionada?.tipo === 'marzo_usd' ? (
                  // Caso Post-Marzo: Se calcula en Dólares, con conversión en vivo
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Monto en Dólares ($)</div>
                        <input
                          type="text"
                          placeholder="0.00"
                          style={{ ...st.input, marginBottom: '0', borderColor: '#3b82f6' }}
                          value={abonoUsdStr}
                          onChange={(e) => handleAbonoChange(e.target.value.replace(/[^0-9.]/g, ''), 'USD')}
                          onFocus={focusStyle}
                          onBlur={blurStyle}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Equiv. Bolívares (Bs.)</div>
                        <input
                          type="text"
                          placeholder="0,00"
                          style={{ ...st.input, marginBottom: '0' }}
                          value={abonoBsStr}
                          onChange={(e) => handleAbonoChange(e.target.value, 'BS')}
                          onFocus={focusStyle}
                          onBlur={blurStyle}
                        />
                      </div>
                    </div>
                    {calculoAbono && calculoAbono.abonoUsd > 0 && (
                      <div style={{
                        fontSize: '11px',
                        color: '#60a5fa',
                        marginTop: '6px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        padding: '6px 10px',
                        borderRadius: '8px'
                      }}>
                        🔄 <strong>Conversión BCV:</strong> ${calculoAbono.abonoUsd.toFixed(2)} USD = <strong>Bs. {calculoAbono.abonoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  // Caso Pre-Marzo: Se calcula en Bolívares
                  <div>
                    <input
                      type="text"
                      placeholder="Monto en Bolívares (Bs.)"
                      style={{ ...st.input, marginBottom: '6px', borderColor: '#eab308' }}
                      value={abonoBsStr}
                      onChange={(e) => handleAbonoChange(e.target.value, 'BS')}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                    {calculoAbono && calculoAbono.abonoBs > 0 && (
                      <div style={{
                        fontSize: '11px',
                        color: '#facc15',
                        backgroundColor: 'rgba(234, 179, 8, 0.1)',
                        padding: '6px 10px',
                        borderRadius: '8px'
                      }}>
                        💵 <strong>Referencial en USD:</strong> Bs. {calculoAbono.abonoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ≈ <strong>${calculoAbono.abonoUsd.toFixed(2)} USD</strong> (Tasa: {tasaValida.toFixed(2)} Bs/$)
                      </div>
                    )}
                  </div>
                )}

                {/* Previsualización del Saldo Restante */}
                {calculoAbono && deudaSeleccionada && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#0a0d14',
                    border: '1px solid #242c3d',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '6px',
                    textAlign: 'center',
                    fontSize: '11px'
                  }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Deuda Total</div>
                      <div style={{ color: '#fff', fontWeight: 800, marginTop: '2px' }}>
                        {deudaSeleccionada.tipo === 'marzo_usd'
                          ? `$${calculoAbono.montoOriginalUsd?.toFixed(2)} USD`
                          : `Bs. ${calculoAbono.montoOriginalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#3b82f6', fontSize: '10px', textTransform: 'uppercase' }}>Tu Abono</div>
                      <div style={{ color: '#60a5fa', fontWeight: 800, marginTop: '2px' }}>
                        {deudaSeleccionada.tipo === 'marzo_usd'
                          ? `-$${calculoAbono.abonoUsd.toFixed(2)}`
                          : `-Bs. ${calculoAbono.abonoBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#10b981', fontSize: '10px', textTransform: 'uppercase' }}>Restante</div>
                      <div style={{ color: '#34d399', fontWeight: 800, marginTop: '2px' }}>
                        {deudaSeleccionada.tipo === 'marzo_usd'
                          ? `$${calculoAbono.restanteUsd?.toFixed(2)} USD`
                          : `Bs. ${calculoAbono.restanteBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Banco de Origen */}
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

          {/* Monto de la Transferencia (Bs.) */}
          <div>
            <label style={st.label}>
              Monto Transferido (Bs.) {modo === 'abono' && <span style={{ color: '#60a5fa', fontSize: '11px' }}>(calculado por abono)</span>}
            </label>
            <input
              type="text"
              placeholder="0,00"
              style={st.input}
              value={monto}
              onChange={(e) => {
                let val = e.target.value.replace(/[^0-9,]/g, '')
                const parts = val.split(',')
                if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('')

                let [intPart, decPart] = val.split(',')
                intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

                const formatted = decPart !== undefined ? `${intPart},${decPart.slice(0, 2)}` : intPart
                setMonto(formatted)
                if (modo === 'abono') {
                  handleAbonoChange(formatted, 'BS')
                }
              }}
              required
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>

          {/* Número de Referencia */}
          <div>
            <label style={st.label}>Número de Referencia</label>
            <input
              type="text"
              placeholder="Últimos 6 a 8 dígitos"
              style={st.input}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              required
              maxLength={30}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>

          {/* Comprobante */}
          <div>
            <label style={st.label}>Comprobante (opcional)</label>
            <div
              style={st.uploadBox}
              onClick={() => fileRef.current?.click()}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = modo === 'abono' ? '#3b82f6' : '#f97316'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#2d3748'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {optimizando ? (
                <>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>⚡</p>
                  <p style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 600 }}>Optimizando comprobante...</p>
                  <p style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>Comprimiendo imagen para ahorrar espacio</p>
                </>
              ) : preview ? (
                <>
                  <img src={preview} alt="Comprobante" style={st.previewImg} />
                  <p style={{ color: '#888', fontSize: '12px' }}>Clic para cambiar comprobante</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '28px', marginBottom: '8px' }}>📎</p>
                  <p style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 600 }}>Adjuntar captura de transferencia</p>
                  <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>PNG, JPG o PDF · Se optimiza automáticamente</p>
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

            {statsCompresion && statsCompresion.ahorroPct > 0 && (
              <div style={{
                marginTop: '8px',
                marginBottom: '16px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '7px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                color: '#10b981',
                fontWeight: 600,
              }}>
                <span>⚡ Imagen optimizada</span>
                <span>{statsCompresion.originalSizeStr} ➔ {statsCompresion.compressedSizeStr} ({statsCompresion.ahorroPct}% ahorro)</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              ref={submitBtnRef}
              type="submit"
              className="btn-premium ripple-container"
              style={{
                ...st.btnPrimary,
                opacity: (loading || !isFormValid) ? 0.6 : 1,
                cursor: (loading || !isFormValid) ? 'not-allowed' : 'pointer',
                boxShadow: (loading || !isFormValid) ? 'none' : st.btnPrimary.boxShadow,
              }}
              disabled={loading || !isFormValid}
              onClick={(e) => !loading && isFormValid && createRipple(e)}
            >
              {loading
                ? (modo === 'abono' ? '⏳ Reportando Abono...' : '⏳ Reportando...')
                : (modo === 'abono' ? '🪙 Reportar Abono a la Deuda' : '💳 Reportar Pago Total')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
