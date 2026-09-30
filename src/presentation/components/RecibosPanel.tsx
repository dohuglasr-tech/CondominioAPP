import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { supabase } from '../../data/supabase'
import { useNavigate } from 'react-router-dom'
import { ReportarPagoModal } from './ReportarPagoModal'
import {
  generarPDFRecibo,
  ReciboAptoData,
  ReciboGastoData,
  ReciboCargoData,
  ReciboConfigData,
  ReciboPagoInfo,
} from '../../utils/reciboPdfGenerator'
import { formatAlicuotaPct } from '../../utils/alicuota'
import {
  generarMensajeCobroRecibo,
  generarMensajeReciboPagado,
  abrirWhatsApp,
} from '../../utils/whatsappHelper'
import { obtenerSaldoAFavorApartamento } from '../../data/saldoFavorService'

interface Props {
  onClose?: () => void
}

interface ReciboGenerado {
  id: string
  apartamento_id: string
  mes_facturado: string
  tasa_bcv: number
  total_gastos_usd: number
  alicuota: number
  subtotal_usd: number
  fondo_reserva_pct: number
  fondo_reserva_usd: number
  cargos_extra_usd: number
  total_usd: number
  total_bs: number
  estado: 'pendiente' | 'pagado'
  data_json: {
    gastos?: Array<{ descripcion: string; monto_usd: number; monto_bs: number; categoria?: string }>
    cargos_especiales?: Array<{ tipo: string; descripcion: string; monto_usd: number; monto_bs?: number }>
    fondo_reserva_pct?: number
    notas_residentes?: string
  } | null
  emitido_at: string
}

interface PagoReportado {
  id: string
  apartamento_id: string
  monto_usd: number
  monto_bs: number
  tasa_bcv: number
  metodo_pago: string
  referencia: string
  banco_origen: string
  banco_destino?: string
  fecha_pago: string
  comprobante_url?: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  notas_admin?: string
  created_at: string
}

interface ConfigEdificio {
  nombre_edificio: string
  rif: string | null
  direccion: string | null
  email_contacto: string | null
  banco: string | null
  cuenta_bancaria: string | null
  titular_cuenta: string | null
  tasa_bcv_actual: number
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function parseMesFacturado(mesStr: string): { mesLabel: string; anio: number } {
  if (!mesStr) return { mesLabel: 'Mes Actual', anio: new Date().getFullYear() }
  const clean = mesStr.substring(0, 7)
  const [anioStr, mesNumStr] = clean.split('-')
  const anio = parseInt(anioStr) || new Date().getFullYear()
  const mesIndex = (parseInt(mesNumStr) || 1) - 1
  return { mesLabel: MESES[mesIndex] || 'Mes', anio }
}

function fmtBs(n: number): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtUsd(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export function RecibosPanel({ onClose }: Props) {
  const { perfil, config: authConfig } = useAuth()
  const navigate = useNavigate()

  const p = perfil as any
  const apartamentoId = perfil?.apartamento_id ?? ''
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || perfil?.apartamento_id || ''
  const propietarioNombre = perfil?.nombre_completo || p?.nombre || 'Propietario Residente'

  const [activeTab, setActiveTab] = useState<'recibos' | 'pagos'>('recibos')
  const [recibos, setRecibos] = useState<ReciboGenerado[]>([])
  const [pagos, setPagos] = useState<PagoReportado[]>([])
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedReciboId, setExpandedReciboId] = useState<string | null>(null)
  const [selectedPago, setSelectedPago] = useState<PagoReportado | null>(null)
  const [reportarModalOpen, setReportarModalOpen] = useState(false)
  const [descargandoId, setDescargandoId] = useState<string | null>(null)
  const [saldoAFavor, setSaldoAFavor] = useState<number>(0)

  // ── Cargar información completa del residente ──────────────────────────────
  const cargarDatos = useCallback(async () => {
    if (!apartamentoId) {
      setLoading(false)
      return
    }

    try {
      setError(null)
      const [recibosRes, pagosRes, configRes] = await Promise.all([
        supabase
          .from('recibos_generados')
          .select('*')
          .eq('apartamento_id', apartamentoId)
          .order('mes_facturado', { ascending: false }),
        supabase
          .from('pagos_reportados')
          .select('*')
          .eq('apartamento_id', apartamentoId)
          .order('created_at', { ascending: false }),
        supabase
          .from('configuracion_edificio')
          .select('*')
          .maybeSingle(),
      ])

      if (recibosRes.error) console.warn('[RecibosPanel] Error recibos:', recibosRes.error.message)
      if (pagosRes.error) console.warn('[RecibosPanel] Error pagos:', pagosRes.error.message)

      setRecibos(recibosRes.data || [])
      setPagos(pagosRes.data || [])
      if (configRes.data) {
        setConfig(configRes.data)
      } else if (authConfig) {
        setConfig(authConfig as any)
      }

      // Calcular saldo a favor disponible del apartamento
      const tasaActual = configRes.data?.tasa_bcv_actual || authConfig?.tasa_bcv_actual || 859.06
      const sRes = await obtenerSaldoAFavorApartamento(apartamentoId, tasaActual)
      setSaldoAFavor(sRes.saldo_a_favor_usd)
    } catch (e: any) {
      setError(e.message || 'Error cargando datos de recibos')
    } finally {
      setLoading(false)
    }
  }, [apartamentoId, authConfig])

  useEffect(() => {
    cargarDatos()

    if (!apartamentoId) return

    // ── Suscripción Realtime dual (recibos_generados y pagos_reportados) ──
    const channelId = `residente_recibos_${apartamentoId}_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recibos_generados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => cargarDatos()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => cargarDatos()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [apartamentoId, cargarDatos])

  // ── Generar y descargar el PDF oficial ─────────────────────────────────────
  // Es exactamente el mismo formato visual y contable que previsualiza el condominio.
  // Si está pagado y aprobado, se le estampa la certificación de solvencia y el talón validado.
  const handleDescargarPDF = async (recibo: ReciboGenerado) => {
    setDescargandoId(recibo.id)
    try {
      const { mesLabel, anio } = parseMesFacturado(recibo.mes_facturado)

      const aptoData: ReciboAptoData = {
        id: apartamentoId,
        numero: aptoNumero || 'S/N',
        alicuota: recibo.alicuota || (p?.apartamento?.alicuota) || 0.0159,
        propietario_nombre: propietarioNombre,
      }

      const gastos: ReciboGastoData[] = (recibo.data_json?.gastos || []).map(g => ({
        descripcion: g.descripcion,
        monto_usd: Number(g.monto_usd) || 0,
        monto_bs: Number(g.monto_bs) || 0,
        categoria: g.categoria,
      }))

      const cargos: ReciboCargoData[] = (recibo.data_json?.cargos_especiales || []).map(c => ({
        tipo: c.tipo,
        descripcion: c.descripcion,
        monto_usd: Number(c.monto_usd) || 0,
        monto_bs: Number(c.monto_bs) || 0,
      }))

      const configData: ReciboConfigData = {
        nombre_edificio: config?.nombre_edificio || 'RESIDENCIAS OCUTUY 5',
        rif: config?.rif || 'J-296749485',
        direccion: config?.direccion || 'URBANIZACIÓN CASA BLANCA, RESIDENCIAS OCUTUY 5',
        email_contacto: config?.email_contacto || 'juntacondominioocutuy5@gmail.com',
        banco: config?.banco,
        cuenta_bancaria: config?.cuenta_bancaria,
        titular_cuenta: config?.titular_cuenta,
        tasa_bcv_actual: (recibo.tasa_bcv && recibo.tasa_bcv > 1 ? recibo.tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (recibo.total_usd > 0 ? parseFloat((recibo.total_bs / recibo.total_usd).toFixed(4)) : 859.06))),
      }

      // Si está pagado o hay un pago aprobado para este apartamento
      const esHistorico = (recibo.mes_facturado || '').slice(0, 7) < '2026-09'
      const pagoAprobado = pagos.find(p => p.estado === 'aprobado')
      const estaPagado = recibo.estado === 'pagado' || (!esHistorico && !!pagoAprobado)

      const pagoInfo: ReciboPagoInfo | undefined = estaPagado
        ? {
            estado: 'pagado',
            fecha_pago: pagoAprobado?.fecha_pago || pagoAprobado?.created_at || (esHistorico ? recibo.mes_facturado : undefined),
            banco: pagoAprobado?.banco_origen || config?.banco || (esHistorico ? 'Administración Anterior' : 'Bicentenario'),
            referencia: pagoAprobado?.referencia || (esHistorico ? 'REGISTRO HISTÓRICO' : 'VALIDADO'),
            monto_bs: pagoAprobado?.monto_bs || recibo.total_bs,
            monto_usd: pagoAprobado?.monto_usd || recibo.total_usd,
          }
        : undefined

      const doc = generarPDFRecibo(
        aptoData,
        gastos,
        cargos,
        configData,
        recibo.fondo_reserva_pct || 10,
        mesLabel,
        anio,
        recibo.data_json?.notas_residentes,
        pagoInfo
      )

      doc.save(`Recibo_Apto${aptoNumero}_${mesLabel}${anio}.pdf`)
    } catch (err) {
      console.error('[RecibosPanel] Error al generar PDF:', err)
      alert('Hubo un error al compilar el PDF del recibo.')
    } finally {
      setDescargandoId(null)
    }
  }

  // ── Compartir Recibo o Constancia por WhatsApp ─────────────────────────────
  const handleCompartirWhatsApp = (recibo: ReciboGenerado) => {
    const { mesLabel, anio } = parseMesFacturado(recibo.mes_facturado)
    const estaPagado = recibo.estado === 'pagado' || pagos.some(p => p.estado === 'aprobado')

    if (estaPagado) {
      const msg = generarMensajeReciboPagado({
        edificioNombre: config?.nombre_edificio || authConfig?.nombre_edificio,
        apartamentoNumero: aptoNumero,
        propietarioNombre,
        mesLabel,
        anio,
        totalUsd: recibo.total_usd,
        totalBs: recibo.total_bs,
      })
      abrirWhatsApp({ mensaje: msg })
    } else {
      const msg = generarMensajeCobroRecibo({
        edificioNombre: config?.nombre_edificio || authConfig?.nombre_edificio,
        apartamentoNumero: aptoNumero,
        propietarioNombre,
        mesLabel,
        anio,
        totalUsd: recibo.total_usd,
        totalBs: recibo.total_bs,
        tasaBcv: (recibo.tasa_bcv && recibo.tasa_bcv > 1 ? recibo.tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (authConfig?.tasa_bcv_actual && authConfig.tasa_bcv_actual > 1 ? authConfig.tasa_bcv_actual : (recibo.total_usd > 0 ? parseFloat((recibo.total_bs / recibo.total_usd).toFixed(4)) : 859.06)))),
        alicuotaPct: formatAlicuotaPct(recibo.alicuota),
        bancoNombre: config?.banco || authConfig?.banco || 'Banco Bicentenario',
        cuentaNumero: config?.cuenta_bancaria || authConfig?.cuenta_bancaria || '0175-0525-4100-7575-1351',
        titularNombre: config?.titular_cuenta || authConfig?.titular_cuenta || 'Zoraya Almeida',
        cedulaRif: config?.rif || authConfig?.rif || 'V-6089037',
      })
      abrirWhatsApp({ mensaje: msg })
    }
  }

  // Comprobar si hay pagos pendientes en revisión
  const pagoEnRevision = pagos.find(p => p.estado === 'pendiente')

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      backgroundColor: '#090a0d',
      padding: '24px 16px 80px',
      maxWidth: '1000px',
      margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
      boxSizing: 'border-box'
    }}>
      {/* ── HEADER SUPERIOR ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onClose ? onClose() : navigate('/')}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              width: '36px', height: '36px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px',
              transition: 'background 0.2s'
            }}
          >
            ←
          </button>
          <div>
            <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '0.2px' }}>
              Mis Recibos y Pagos
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '3px 0 0' }}>
              Apartamento {aptoNumero || '—'} · {propietarioNombre}
            </p>
          </div>
        </div>

        <button
          onClick={() => setReportarModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.4)'
          }}
        >
          <span>💳</span>
          <span>Reportar Pago</span>
        </button>
      </div>

      {/* ── SELECTOR DE PESTAÑAS (SEGMENTED CONTROL) ─────────────────────── */}
      <div style={{
        display: 'flex',
        background: 'rgba(255, 255, 255, 0.04)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => setActiveTab('recibos')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: activeTab === 'recibos' ? '#f97316' : 'transparent',
            color: activeTab === 'recibos' ? '#fff' : '#94a3b8',
            boxShadow: activeTab === 'recibos' ? '0 2px 8px rgba(249, 115, 22, 0.4)' : 'none'
          }}
        >
          📄 Recibos de Condominio ({recibos.length})
        </button>
        <button
          onClick={() => setActiveTab('pagos')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: activeTab === 'pagos' ? '#f97316' : 'transparent',
            color: activeTab === 'pagos' ? '#fff' : '#94a3b8',
            boxShadow: activeTab === 'pagos' ? '0 2px 8px rgba(249, 115, 22, 0.4)' : 'none'
          }}
        >
          💳 Historial de Pagos ({pagos.length})
        </button>
      </div>

      {/* ── CONTENIDO PRINCIPAL ──────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{
            width: '32px', height: '32px', border: '3px solid rgba(249, 115, 22, 0.2)',
            borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: '13px', margin: 0 }}>Cargando información oficial...</p>
        </div>
      ) : error ? (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '14px',
          padding: '24px',
          textAlign: 'center',
          color: '#f87171'
        }}>
          <p style={{ fontSize: '30px', margin: '0 0 10px' }}>⚠️</p>
          <p style={{ fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      ) : activeTab === 'recibos' ? (
        /* ── PESTAÑA 1: RECIBOS DE CONDOMINIO ────────────────────────────── */
        recibos.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '42px', display: 'block', marginBottom: '14px' }}>📭</span>
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
              No hay recibos emitidos aún
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, maxWidth: '400px', marginInline: 'auto' }}>
              La administración del condominio aún no ha emitido el recibo para tu apartamento. En cuanto se emita, lo verás reflejado aquí con su desglose exacto.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Saldo a Favor / Crédito del Apartamento */}
            {saldoAFavor > 0 && (
              <div style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', color: '#4ade80'
                  }}>
                    💚
                  </div>
                  <div>
                    <div style={{ color: '#4ade80', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Saldo a Favor Disponible
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                      Tienes crédito acumulado en tu cuenta. Se deduce automáticamente al cancelar tu recibo.
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#4ade80', fontSize: '18px', fontWeight: 900 }}>
                    +${fmtUsd(saldoAFavor)} USD
                  </div>
                  <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 600 }}>
                    ≈ Bs. {fmtBs(saldoAFavor * (config?.tasa_bcv_actual || 859.06))}
                  </div>
                </div>
              </div>
            )}

            {recibos.map((recibo) => {
              const { mesLabel, anio } = parseMesFacturado(recibo.mes_facturado)
              const esHistorico = (recibo.mes_facturado || '').slice(0, 7) < '2026-09'
              const estaPagado = recibo.estado === 'pagado' || (!esHistorico && pagos.some(p => p.estado === 'aprobado'))
              const enRevision = !estaPagado && !!pagoEnRevision
              const isExpanded = expandedReciboId === recibo.id

              const gastos = recibo.data_json?.gastos || []
              const cargos = recibo.data_json?.cargos_especiales || []

              return (
                <div
                  key={recibo.id}
                  style={{
                    background: 'linear-gradient(180deg, #131720 0%, #0c0f15 100%)',
                    border: estaPagado
                      ? '1px solid rgba(34, 197, 94, 0.35)'
                      : enRevision
                      ? '1px solid rgba(245, 158, 11, 0.35)'
                      : '1px solid rgba(249, 115, 22, 0.35)',
                    borderLeftWidth: '5px',
                    borderLeftColor: estaPagado ? '#22c55e' : enRevision ? '#f59e0b' : '#f97316',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
                    transition: 'border-color 0.2s'
                  }}
                >
                  {/* Encabezado del Recibo */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>📄</span>
                        <h2 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0 }}>
                          Recibo {mesLabel} {anio}
                        </h2>
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '11px', margin: '4px 0 0' }}>
                        Emitido el {formatFecha(recibo.emitido_at || recibo.mes_facturado)} · Tasa BCV: {fmtBs((recibo.tasa_bcv && recibo.tasa_bcv > 1 ? recibo.tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (recibo.total_usd > 0 ? parseFloat((recibo.total_bs / recibo.total_usd).toFixed(4)) : 859.06))))} Bs/$
                      </p>
                    </div>

                    {/* Badge de Estado */}
                    <div>
                      {estaPagado ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          padding: '4px 10px', borderRadius: '999px',
                          fontSize: '11px', fontWeight: 800
                        }}>
                          ✓ Pagado y Solvente {esHistorico && <span style={{ opacity: 0.8, fontSize: '9.5px', marginLeft: '3px' }}>(Histórico)</span>}
                        </span>
                      ) : enRevision ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '4px 10px', borderRadius: '999px',
                          fontSize: '11px', fontWeight: 800
                        }}>
                          ⏳ Pago en Revisión
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: 'rgba(239, 68, 68, 0.15)', color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '4px 10px', borderRadius: '999px',
                          fontSize: '11px', fontWeight: 800
                        }}>
                          ⚠️ Pendiente de Pago
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Montos y Alícuota */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    margin: '16px 0',
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <div>
                      <span style={{ color: '#82828e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Total Cuota ($ USD)
                      </span>
                      <div style={{ color: '#fff', fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
                        ${fmtUsd(recibo.total_usd)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#82828e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Total Cuota (Bs)
                      </span>
                      <div style={{ color: '#38bdf8', fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                        Bs. {fmtBs(recibo.total_bs)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#82828e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Alícuota Aplicada
                      </span>
                      <div style={{ color: '#f97316', fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>
                        {formatAlicuotaPct(recibo.alicuota)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#82828e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                        Fondo Reserva
                      </span>
                      <div style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                        {recibo.fondo_reserva_pct}%
                      </div>
                    </div>
                  </div>

                  {/* Deducción de Saldo a Favor si aplica en recibo pendiente */}
                  {!estaPagado && saldoAFavor > 0 && (
                    <div style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      border: '1px dashed rgba(34, 197, 94, 0.35)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '12px'
                    }}>
                      <span style={{ color: '#86efac' }}>
                        💚 Saldo a favor a aplicar: <strong>-${fmtUsd(Math.min(saldoAFavor, recibo.total_usd))} USD</strong>
                      </span>
                      <span style={{ color: '#4ade80', fontWeight: 800 }}>
                        Monto neto a transferir: ${fmtUsd(Math.max(0, recibo.total_usd - saldoAFavor))} USD
                      </span>
                    </div>
                  )}

                  {/* Mensaje descriptivo según estado */}
                  <div style={{ marginBottom: '16px' }}>
                    {estaPagado ? (
                      <p style={{ margin: 0, fontSize: '12px', color: '#86efac', lineHeight: 1.4 }}>
                        ✓ Pago conciliado por la administración. Tu recibo oficial con sello de solvencia está listo para descargar.
                      </p>
                    ) : enRevision ? (
                      <p style={{ margin: 0, fontSize: '12px', color: '#fde047', lineHeight: 1.4 }}>
                        ⏳ Tienes un pago reportado (Ref: <strong>{pagoEnRevision?.referencia}</strong>) en proceso de conciliación. Al ser aprobado por el administrador, se habilitará la constancia de pago con solvencia.
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>
                        Tienes este recibo al cobro. Realiza tu pago mediante transferencia o pago móvil y repórtalo para mantener la solvencia de tu apartamento.
                      </p>
                    )}
                  </div>

                  {/* Botones de Acción */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {/* Botón Descargar PDF Oficial: es el mismo del admin */}
                    <button
                      onClick={() => handleDescargarPDF(recibo)}
                      disabled={descargandoId === recibo.id}
                      style={{
                        background: estaPagado
                          ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                          : 'rgba(255, 255, 255, 0.08)',
                        border: estaPagado ? 'none' : '1px solid rgba(255, 255, 255, 0.16)',
                        color: '#fff',
                        borderRadius: '10px',
                        padding: '9px 16px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: descargandoId === recibo.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: estaPagado ? '0 3px 12px rgba(34, 197, 94, 0.35)' : 'none'
                      }}
                    >
                      <span>📥</span>
                      <span>
                        {descargandoId === recibo.id
                          ? 'Generando PDF...'
                          : estaPagado
                          ? 'Descargar Recibo Oficial (PDF)'
                          : 'Descargar Aviso de Cobro (PDF)'}
                      </span>
                    </button>

                    {/* Botón Verde Enviar / Compartir por WhatsApp */}
                    <button
                      type="button"
                      onClick={() => handleCompartirWhatsApp(recibo)}
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.3) 100%)',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        color: '#4ade80',
                        borderRadius: '10px',
                        padding: '9px 16px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 10px rgba(34, 197, 94, 0.25)',
                        transition: 'all 0.2s ease'
                      }}
                      title="Enviar recibo con datos de pago por WhatsApp con 1 solo clic"
                    >
                      <span>📲</span>
                      <span>{estaPagado ? 'Compartir Solvencia WhatsApp' : 'Enviar por WhatsApp'}</span>
                    </button>

                    {/* Si está pendiente, botón para reportar pago */}
                    {!estaPagado && !enRevision && (
                      <button
                        onClick={() => setReportarModalOpen(true)}
                        style={{
                          background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '10px',
                          padding: '9px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 3px 12px rgba(234, 88, 12, 0.4)'
                        }}
                      >
                        <span>💳</span>
                        <span>Reportar Pago</span>
                      </button>
                    )}

                    {/* Ver detalle y desglose de gastos */}
                    <button
                      onClick={() => setExpandedReciboId(isExpanded ? null : recibo.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#94a3b8',
                        borderRadius: '10px',
                        padding: '9px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginLeft: 'auto'
                      }}
                    >
                      {isExpanded ? 'Ocultar Desglose ▲' : 'Ver Desglose de Gastos ▼'}
                    </button>
                  </div>

                  {/* Desglose Expandido (Gastos Comunes del Edificio) */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '16px',
                      paddingTop: '16px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ color: '#f97316', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                          Gastos Comunes del Edificio ({gastos.length})
                        </span>
                        <span style={{ color: '#64748b', fontSize: '11px' }}>
                          Total Edificio: ${fmtUsd(recibo.total_gastos_usd)}
                        </span>
                      </div>

                      {gastos.length === 0 ? (
                        <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                          No hay gastos detallados registrados en este recibo.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {gastos.map((g, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 10px',
                                background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                                borderRadius: '6px',
                                fontSize: '12px'
                              }}
                            >
                              <span style={{ color: '#cbd5e1' }}>{g.descripcion}</span>
                              <div style={{ display: 'flex', gap: '12px', textAlign: 'right' }}>
                                <span style={{ color: '#38bdf8' }}>Bs. {fmtBs(g.monto_bs)}</span>
                                <span style={{ color: '#fff', fontWeight: 700 }}>${fmtUsd(g.monto_usd)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {cargos.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                            Cargos Especiales de tu Apartamento
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                            {cargos.map((c, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '6px 10px',
                                  background: 'rgba(239, 68, 68, 0.05)',
                                  borderRadius: '6px',
                                  fontSize: '12px'
                                }}
                              >
                                <span style={{ color: '#fca5a5' }}>{c.descripcion} ({c.tipo})</span>
                                <span style={{ color: '#ef4444', fontWeight: 700 }}>${fmtUsd(c.monto_usd)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* ── PESTAÑA 2: HISTORIAL DE PAGOS REPORTADOS ──────────────────────── */
        pagos.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '42px', display: 'block', marginBottom: '14px' }}>💳</span>
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
              No has reportado pagos aún
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 18px', maxWidth: '380px', marginInline: 'auto' }}>
              Cuando realices tu transferencia o pago móvil, repórtalo aquí para que la administración lo valide.
            </p>
            <button
              onClick={() => setReportarModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Reportar Mi Primer Pago
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pagos.map((pago) => {
              const isSelected = selectedPago?.id === pago.id

              const estadoColor = pago.estado === 'aprobado'
                ? '#22c55e'
                : pago.estado === 'rechazado'
                ? '#ef4444'
                : '#f59e0b'

              const estadoLabel = pago.estado === 'aprobado'
                ? '✅ Aprobado'
                : pago.estado === 'rechazado'
                ? '❌ Rechazado'
                : '⏳ En Revisión'

              return (
                <div
                  key={pago.id}
                  style={{
                    background: 'linear-gradient(180deg, #131720 0%, #0c0f15 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setSelectedPago(isSelected ? null : pago)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                        Bs. {fmtBs(pago.monto_bs)}
                        {pago.monto_usd ? (
                          <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginLeft: '6px' }}>
                            (${fmtUsd(pago.monto_usd)} USD)
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>
                        {formatFecha(pago.fecha_pago || pago.created_at)} · {pago.banco_origen || 'Transferencia'} · Ref: {pago.referencia}
                      </div>
                    </div>

                    <span style={{
                      background: `${estadoColor}18`,
                      color: estadoColor,
                      border: `1px solid ${estadoColor}30`,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800
                    }}>
                      {estadoLabel}
                    </span>
                  </div>

                  {/* Detalle expandido del pago */}
                  {isSelected && (
                    <div style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#82828e' }}>Número de Referencia</span>
                        <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700 }}>{pago.referencia}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#82828e' }}>Método de Pago</span>
                        <span style={{ color: '#cbd5e1' }}>{pago.metodo_pago || 'Transferencia / Pago Móvil'}</span>
                      </div>
                      {pago.banco_destino && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#82828e' }}>Banco Destino (Condominio)</span>
                          <span style={{ color: '#cbd5e1' }}>{pago.banco_destino}</span>
                        </div>
                      )}
                      {pago.notas_admin && (
                        <div style={{
                          background: pago.estado === 'aprobado' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          color: pago.estado === 'aprobado' ? '#86efac' : '#fca5a5'
                        }}>
                          <strong>Nota de administración:</strong> {pago.notas_admin}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── MODAL REPORTAR PAGO ──────────────────────────────────────────── */}
      {reportarModalOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          onClose={() => setReportarModalOpen(false)}
          onSuccess={() => {
            setReportarModalOpen(false)
            cargarDatos()
          }}
        />
      )}
    </div>
  )
}
