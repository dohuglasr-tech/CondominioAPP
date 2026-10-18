import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { supabase } from '../../data/supabase'
import { appCache } from '../../data/cacheService'
import { useBcvRate } from '../../data/useBcvRate'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import {
  obtenerGasServicioData,
  calcularMetricasGas,
  obtenerDeudaGasApartamento,
  obtenerHistorialCuotasGasApartamento,
  obtenerTodasLasDeudasGasApartamento,
  GasServicioData
} from '../../data/gasService'

const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const GasResidente: React.FC = () => {
  const { perfil, config } = useAuth()
  const [searchParams] = useSearchParams()

  const [data, setData] = useState<GasServicioData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'deuda' | 'calendario' | 'tanque'>('deuda')
  const [copiedBank, setCopiedBank] = useState<boolean>(false)
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Deuda consolidada de condominio ordinario para sincronización
  const [deudaCondominioBs, setDeudaCondominioBs] = useState<number>(0)
  const [deudaCondominioUsd, setDeudaCondominioUsd] = useState<number>(0)

  // Modal Reporte de Pago Unificado
  const [modalReportarOpen, setModalReportarOpen] = useState<boolean>(false)

  // Calendario visual de Gas
  const [calAnio, setCalAnio] = useState<number>(2026)
  const [calMes, setCalMes] = useState<number>(10) // 1-12
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(new Date().toISOString().slice(0, 10))

  const { rate } = useBcvRate()
  const tasaValida = rate && rate > 1 ? rate : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : 859.06)

  const p = perfil as any
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || ''
  const apartamentoId = p?.apartamento_id || p?.apartamento?.id || ''

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Cargar datos de gas y deuda general de condominio
  const cargarDatos = useCallback(async (forceRefresh = false) => {
    try {
      const resGas = await obtenerGasServicioData(forceRefresh)
      setData(resGas.data)

      // Cargar deuda de condominio para mostrar la sincronización consolidada
      if (apartamentoId) {
        const { data: recibos } = await supabase
          .from('recibos_generados')
          .select('id, total_usd, total_bs, es_indexado')
          .eq('apartamento_id', apartamentoId)
          .eq('estado', 'pendiente')

        let condBs = 0
        let condUsd = 0
        if (recibos && recibos.length > 0) {
          recibos.forEach(r => {
            const usd = Number(r.total_usd || 0)
            const bs = Number(r.total_bs || 0)
            if (r.es_indexado || usd > 0) {
              condUsd += usd
              condBs += usd * tasaValida
            } else {
              condBs += bs
              condUsd += tasaValida > 0 ? bs / tasaValida : 0
            }
          })
        }
        setDeudaCondominioBs(condBs)
        setDeudaCondominioUsd(condUsd)
      }
    } catch (err) {
      console.error('[GasResidente] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [apartamentoId, tasaValida])

  useEffect(() => {
    cargarDatos(true)

    // Detectar tab en la URL (ej: /gas?tab=calendario)
    const urlTab = searchParams.get('tab')
    if (urlTab === 'calendario' || urlTab === 'tanque' || urlTab === 'deuda') {
      setActiveTab(urlTab)
    }

    if (searchParams.get('reportar') === '1') {
      setModalReportarOpen(true)
    }

    // 1. Escuchar eventos broadcast locales
    const onGasUpdated = () => {
      appCache.invalidateTags(['gas', 'saldos', 'recibos'])
      cargarDatos(true)
    }
    window.addEventListener('condominio_gas_updated', onGasUpdated)

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gas_servicio_cache' || e.key === 'condominio_gas_cache_v2') {
        cargarDatos(true)
      }
    }
    window.addEventListener('storage', onStorage)

    // 2. Suscripción Supabase Realtime a casos_comunidad (gas comunal)
    const channelId = `gas_residente_${apartamentoId || 'guest'}_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casos_comunidad' },
        (payload: any) => {
          if (payload?.new?.tipo === 'config_gas_servicio' || payload?.old?.tipo === 'config_gas_servicio') {
            appCache.invalidateTags(['gas', 'saldos'])
            cargarDatos(true)
          }
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener('condominio_gas_updated', onGasUpdated)
      window.removeEventListener('storage', onStorage)
      supabase.removeChannel(channel)
    }
  }, [apartamentoId, cargarDatos, searchParams])

  const metricas = useMemo(() => {
    if (!data) return null
    return calcularMetricasGas(data)
  }, [data])

  const miDeuda = useMemo(() => {
    if (!data) return null
    return obtenerDeudaGasApartamento(data, apartamentoId, aptoNumero)
  }, [data, apartamentoId, aptoNumero])

  const todasLasDeudasGas = useMemo(() => {
    if (!data) return { tieneDeuda: false, totalBs: 0, totalUsd: 0, cuotasPendientes: [] }
    return obtenerTodasLasDeudasGasApartamento(data, apartamentoId, aptoNumero)
  }, [data, apartamentoId, aptoNumero])

  const historialCuotas = useMemo(() => {
    if (!data) return []
    return obtenerHistorialCuotasGasApartamento(data, apartamentoId, aptoNumero)
  }, [data, apartamentoId, aptoNumero])

  // Cómputo de sincronización consolidada
  const deudaGasBs = todasLasDeudasGas.tieneDeuda
    ? todasLasDeudasGas.totalBs
    : (miDeuda?.tieneDeuda ? miDeuda.montoBs : 0)
  const deudaGasUsd = todasLasDeudasGas.tieneDeuda
    ? todasLasDeudasGas.totalUsd
    : (miDeuda?.tieneDeuda ? miDeuda.montoUsd : 0)

  const deudaTotalConsolidadaBs = deudaGasBs + deudaCondominioBs
  const deudaTotalConsolidadaUsd = deudaGasUsd + deudaCondominioUsd
  const tieneDeudaGas = deudaGasBs > 0.05 || deudaGasUsd > 0.05
  const isSolventeGas = !tieneDeudaGas

  // Matriz de días para el Calendario Visual de Gas
  const diasCalendario = useMemo(() => {
    const primerDia = new Date(calAnio, calMes - 1, 1)
    const ultimoDia = new Date(calAnio, calMes, 0)
    const diasEnMes = ultimoDia.getDate()

    let diaSemanaInicio = primerDia.getDay() - 1 // Lunes = 0
    if (diaSemanaInicio === -1) diaSemanaInicio = 6

    const celdas: Array<{ diaNum: number | null; fechaIso: string | null }> = []
    for (let i = 0; i < diaSemanaInicio; i++) {
      celdas.push({ diaNum: null, fechaIso: null })
    }
    for (let d = 1; d <= diasEnMes; d++) {
      const mesStr = String(calMes).padStart(2, '0')
      const diaStr = String(d).padStart(2, '0')
      celdas.push({ diaNum: d, fechaIso: `${calAnio}-${mesStr}-${diaStr}` })
    }
    return celdas
  }, [calAnio, calMes])

  // Eventos de gas mapeados por fecha
  const eventosPorFecha = useMemo(() => {
    const map = new Map<string, Array<{ tipo: 'llenado' | 'recaudacion' | 'limite' | 'pago_residente' | 'otro'; titulo: string; descripcion: string; montoBs?: number; montoUsd?: number }>>()

    // 1. Llenados de cisterna
    data?.llenados.forEach(ll => {
      if (!ll.fecha) return
      const list = map.get(ll.fecha) || []
      list.push({
        tipo: 'llenado',
        titulo: `🚛 Descarga de Cisterna (${ll.litrosCargados.toLocaleString()} L)`,
        descripcion: `Proveedor: ${ll.proveedor || 'Cisterna'}. Nivel final tanque: ${ll.porcentajeFinal}%.`
      })
      map.set(ll.fecha, list)
    })

    // 2. Eventos y recaudaciones del calendario de gas
    data?.eventosCalendario?.forEach(ev => {
      if (!ev.fecha) return
      const list = map.get(ev.fecha) || []
      list.push({
        tipo: ev.tipo === 'llenado' ? 'llenado' : 'recaudacion',
        titulo: ev.titulo,
        descripcion: ev.descripcion,
        montoBs: ev.montoBs,
        montoUsd: ev.montoUsd
      })
      map.set(ev.fecha, list)
    })

    // 3. Fechas límite de cuotas de gas
    data?.jornadas.forEach(j => {
      if (j.fechaLimite) {
        const list = map.get(j.fechaLimite) || []
        list.push({
          tipo: 'limite',
          titulo: `⏳ Límite de Pago: ${j.titulo}`,
          descripcion: `Cuota por apartamento: Bs. ${fmtBs(j.costoPorAptoBs)} (${fmtUsd(j.costoPorAptoUsd)} USD).`
        })
        map.set(j.fechaLimite, list)
      }
    })

    // 4. Fechas de pago registradas por este apartamento
    historialCuotas.forEach(h => {
      if (h.estado === 'pagado' && h.fechaPago) {
        const list = map.get(h.fechaPago) || []
        list.push({
          tipo: 'pago_residente',
          titulo: `💳 Pago Cuota de Gas (${h.titulo})`,
          descripcion: `Apto ${aptoNumero}: Pagaste Bs. ${fmtBs(h.montoBs)} ($${fmtUsd(h.montoUsd)} USD). Ref: ${h.referencia || 'N/A'}`
        })
        map.set(h.fechaPago, list)
      }
    })

    return map
  }, [data, historialCuotas, aptoNumero])

  const copyBankData = () => {
    if (!data) return
    const d = data.config.datosPago
    const text = `DATOS PAGO MÓVIL GAS:\nBanco: ${d.banco}\nTeléfono: ${d.telefono}\nRIF/CI: ${d.rifCedula}\nTitular: ${d.titular}\nConcepto: Gas Apto ${aptoNumero || ''}`
    navigator.clipboard.writeText(text)
    setCopiedBank(true)
    setTimeout(() => setCopiedBank(false), 3000)
  }

  const copyBsAmount = () => {
    if (!miDeuda) return
    navigator.clipboard.writeText(deudaGasBs.toFixed(2))
    setCopiedAmount(true)
    setTimeout(() => setCopiedAmount(false), 2500)
  }

  if (loading) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        color: '#a1a1aa',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: '42px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>⛽</div>
        <div style={{ fontWeight: 800, fontSize: '18px', color: '#fff' }}>Sincronizando Servicio de Gas Comunal...</div>
        <div style={{ fontSize: '13px', marginTop: '6px', color: '#71717a' }}>Verificando nivel del tanque, cuotas comunitarias y tu estado de cuenta</div>
      </div>
    )
  }

  const datosPago = data?.config.datosPago
  const eventosDelDia = diaSeleccionado ? (eventosPorFecha.get(diaSeleccionado) || []) : []

  return (
    <div style={{
      maxWidth: '860px',
      margin: '0 auto',
      padding: '20px 16px 80px',
      color: '#f4f4f5',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          backgroundColor: '#10b981',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          fontWeight: 800,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>✅</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Modal Reporte de Pago Unificado */}
      {modalReportarOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          aptoNumero={aptoNumero}
          initialTipo="gas"
          onClose={() => setModalReportarOpen(false)}
          onSuccess={() => {
            setModalReportarOpen(false)
            cargarDatos(true)
            showToast('¡Pago de cuota de gas reportado exitosamente!')
          }}
        />
      )}

      {/* ── HEADER SUPERIOR ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>⛽</span>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              Servicio de Gas Comunal
            </h1>
            <span style={{
              backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
              color: 'var(--color-accent, #f97316)',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 800
            }}>
              Apto {aptoNumero}
            </span>
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '6px 0 0' }}>
            Gestión independiente del gas, sincronizada con la deuda total de tu apartamento.
          </p>
        </div>

        {/* Tasa BCV & Botón de Reporte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '6px 12px',
            fontSize: '12px',
            color: '#cbd5e1'
          }}>
            Tasa BCV: <b style={{ color: '#fff' }}>Bs. {fmtBs(tasaValida)}</b>
          </div>

          <button
            onClick={() => setModalReportarOpen(true)}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--color-brand-shadow, 0 4px 14px rgba(249, 115, 22, 0.4))'
            }}
          >
            <span>💳</span>
            <span>Reportar Pago</span>
          </button>
        </div>
      </div>

      {/* ── BARRA DE PESTAÑAS (TABS) ── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '22px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {[
          { key: 'deuda', label: '💳 Apartado de Deuda', badge: tieneDeudaGas ? 'Pendiente' : 'Solvente' },
          { key: 'calendario', label: '📅 Calendario de Pago de Gas', count: historialCuotas.length },
          { key: 'tanque', label: '🎛️ Tanque y Transparencia', level: metricas ? `${metricas.nivelPct}%` : undefined }
        ].map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                backgroundColor: isActive ? 'var(--color-accent-light, rgba(249, 115, 22, 0.15))' : 'transparent',
                color: isActive ? 'var(--color-accent, #f97316)' : '#a1a1aa',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-accent, #f97316)' : '2px solid transparent',
                padding: '11px 18px',
                fontSize: '13px',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s'
              }}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '999px',
                  backgroundColor: tab.badge === 'Pendiente' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  color: tab.badge === 'Pendiente' ? '#f87171' : '#4ade80',
                  border: `1px solid ${tab.badge === 'Pendiente' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`
                }}>
                  {tab.badge}
                </span>
              )}
              {tab.level && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#93c5fd'
                }}>
                  {tab.level}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: APARTADO DE DEUDA DE GAS (SINCRONIZADO CON TOTAL) ─────── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'deuda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Tarjeta Hero: Estado del Apartamento en Gas */}
          <div style={{
            background: isSolventeGas
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, #11141c 100%)'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, #151117 100%)',
            border: `1px solid ${isSolventeGas ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '24px',
            padding: '24px',
            boxShadow: isSolventeGas ? '0 10px 30px rgba(34, 197, 94, 0.08)' : '0 10px 30px rgba(239, 68, 68, 0.12)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.6px' }}>
                DEUDA ESPECÍFICA DE GAS · APTO {aptoNumero}
              </span>
              <span style={{
                backgroundColor: isSolventeGas ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: isSolventeGas ? '#22c55e' : '#ef4444',
                border: `1px solid ${isSolventeGas ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span>{isSolventeGas ? '✅' : '⚠️'}</span>
                <span>{isSolventeGas ? 'AL DÍA CON EL GAS' : 'CUOTA DE GAS PENDIENTE'}</span>
              </span>
            </div>

            {/* Gran Cifra de Deuda de Gas */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{ fontSize: '36px', fontWeight: 900, color: isSolventeGas ? '#22c55e' : '#ef4444', letterSpacing: '-0.5px' }}>
                Bs. {fmtBs(deudaGasBs)}
              </span>
              <span style={{ fontSize: '16px', color: '#a1a1aa', fontWeight: 700 }}>
                (≈ ${fmtUsd(deudaGasUsd)} USD)
              </span>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.4 }}>
              {isSolventeGas
                ? 'Tu apartamento no tiene cuotas de gas pendientes. Puedes consultar los registros pasados en el calendario de pago.'
                : `Cuota comunitaria asignada por la administración para ${miDeuda?.campanaTitulo || 'la recarga del tanque central'}. Recuerda que este aporte se paga a la cuenta especial de gas.`}
            </p>

            {/* ── CUADRO DE SINCRONIZACIÓN CON DEUDA TOTAL ── */}
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ⚡ SINCRONIZACIÓN CON LA DEUDA TOTAL DEL APARTAMENTO
                </span>
                <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
                  Total en Tiempo Real
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {/* Cuota Gas */}
                <div style={{ backgroundColor: 'rgba(249, 115, 22, 0.08)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#fed7aa', fontWeight: 700 }}>⛽ Servicio de Gas:</span>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: tieneDeudaGas ? '#fb923c' : '#22c55e', marginTop: '2px' }}>
                    Bs. {fmtBs(deudaGasBs)}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#a1a1aa' }}>≈ ${fmtUsd(deudaGasUsd)} USD</div>
                </div>

                {/* Condominio */}
                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <span style={{ fontSize: '11px', color: '#bfdbfe', fontWeight: 700 }}>🏢 Condominio Ordinario:</span>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: deudaCondominioBs > 0 ? '#fff' : '#22c55e', marginTop: '2px' }}>
                    Bs. {fmtBs(deudaCondominioBs)}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#a1a1aa' }}>≈ ${fmtUsd(deudaCondominioUsd)} USD</div>
                </div>

                {/* Total Consolidado */}
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                  <span style={{ fontSize: '11px', color: '#f4f4f5', fontWeight: 800 }}>💳 Deuda Consolidada Total:</span>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--color-accent, #f97316)', marginTop: '2px' }}>
                    Bs. {fmtBs(deudaTotalConsolidadaBs)}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#fed7aa' }}>≈ ${fmtUsd(deudaTotalConsolidadaUsd)} USD</div>
                </div>
              </div>
            </div>

            {/* Botón de Pago de Gas */}
            {tieneDeudaGas && (
              <button
                onClick={() => setModalReportarOpen(true)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '13px 20px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'var(--color-brand-shadow, 0 4px 16px rgba(249, 115, 22, 0.4))'
                }}
              >
                <span>💳</span>
                <span>Pagar Cuota de Gas (Bs. {fmtBs(deudaGasBs)})</span>
              </button>
            )}
          </div>

          {/* Datos Bancarios Exclusivos del Gas */}
          {datosPago && (
            <div style={{
              background: 'var(--color-bg-card, #12141a)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🏦</span>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                    Datos Bancarios para el Pago del Gas
                  </h3>
                </div>

                <button
                  onClick={copyBankData}
                  style={{
                    backgroundColor: copiedBank ? '#22c55e' : 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {copiedBank ? '✓ Copiado al portapapeles' : 'Copiar Datos Bancarios'}
                </button>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                fontSize: '13px'
              }}>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ color: '#a1a1aa', fontSize: '11px', display: 'block' }}>Banco:</span>
                  <b>{datosPago.banco || 'Por definir'}</b>
                </div>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ color: '#a1a1aa', fontSize: '11px', display: 'block' }}>Teléfono Pago Móvil:</span>
                  <b>{datosPago.telefono || 'Por definir'}</b>
                </div>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ color: '#a1a1aa', fontSize: '11px', display: 'block' }}>C.I. / RIF:</span>
                  <b>{datosPago.rifCedula || 'Por definir'}</b>
                </div>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ color: '#a1a1aa', fontSize: '11px', display: 'block' }}>Titular de la Cuenta:</span>
                  <b>{datosPago.titular}</b>
                </div>
              </div>

              {tieneDeudaGas && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                  fontSize: '12px',
                  color: '#cbd5e1'
                }}>
                  <span>Monto exacto a transferir: <strong style={{ color: 'var(--color-accent, #f97316)' }}>Bs. {fmtBs(deudaGasBs)}</strong></span>
                  <button
                    onClick={copyBsAmount}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent, #f97316)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    {copiedAmount ? '✓ Monto Copiado' : 'Copiar Monto'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: EL MISMO CALENDARIO DE PAGO PERO SOLO PARA EL GAS ─────── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'calendario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

          {/* 1. Cronograma / Historial de Cuotas del Apartamento */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '22px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Cronograma y Cuotas de Gas del Apto {aptoNumero}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#a1a1aa' }}>
                  Matriz de pagos y cuotas emitidas exclusivamente para el servicio de gas.
                </p>
              </div>

              <span style={{
                backgroundColor: 'rgba(249, 115, 22, 0.15)',
                color: 'var(--color-accent, #f97316)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {historialCuotas.length} Jornada(s)
              </span>
            </div>

            {historialCuotas.length === 0 ? (
              <div style={{
                padding: '30px',
                textAlign: 'center',
                color: '#71717a',
                fontSize: '13px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '14px'
              }}>
                No hay jornadas o cuotas registradas aún para el gas comunal.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {historialCuotas.map(cuota => {
                  const isPagado = cuota.estado === 'pagado'
                  return (
                    <div
                      key={cuota.jornadaId}
                      style={{
                        padding: '14px 18px',
                        borderRadius: '14px',
                        backgroundColor: isPagado ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.06)',
                        border: `1px solid ${isPagado ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                            {cuota.titulo}
                          </span>
                          {cuota.esEspecial && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              ⚡ Especial
                            </span>
                          )}
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: isPagado ? '#4ade80' : '#f87171',
                            backgroundColor: isPagado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            padding: '2px 8px',
                            borderRadius: '999px'
                          }}>
                            {isPagado ? '✅ PAGADO' : '⏳ PENDIENTE'}
                          </span>
                        </div>

                        <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '4px' }}>
                          Mes: <b>{cuota.mes}</b> {cuota.fechaLimite ? `· Límite: ${cuota.fechaLimite}` : ''}
                          {isPagado && cuota.referencia && (
                            <span style={{ color: '#38bdf8', marginLeft: '6px' }}>
                              · Ref: <b>{cuota.referencia}</b> {cuota.fechaPago ? `(${cuota.fechaPago})` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                            Bs. {fmtBs(cuota.montoBs)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                            ≈ ${fmtUsd(cuota.montoUsd)} USD
                          </div>
                        </div>

                        {!isPagado && (
                          <button
                            onClick={() => setModalReportarOpen(true)}
                            style={{
                              backgroundColor: 'var(--color-accent, #f97316)',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 14px',
                              borderRadius: '10px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              boxShadow: 'var(--color-brand-shadow, 0 2px 8px rgba(249, 115, 22, 0.4))'
                            }}
                          >
                            Pagar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 2. Calendario Mensual Interactivo de Gas */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '22px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Calendario Mensual del Servicio de Gas
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#a1a1aa' }}>
                  Descargas de cisterna 🚛, fechas límites ⏳ y pagos registrados de tu apartamento 💳.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                  {MESES_NOMBRES[calMes - 1]} {calAnio}
                </span>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => {
                      if (calMes === 1) { setCalMes(12); setCalAnio(y => y - 1) }
                      else { setCalMes(m => m - 1) }
                    }}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => {
                      if (calMes === 12) { setCalMes(1); setCalAnio(y => y + 1) }
                      else { setCalMes(m => m + 1) }
                    }}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>

            {/* Cabecera de Días de Semana */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '6px',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 800,
              color: '#71717a',
              marginBottom: '8px'
            }}>
              <div>LUN</div><div>MAR</div><div>MIÉ</div><div>JUE</div><div>VIE</div><div>SÁB</div><div>DOM</div>
            </div>

            {/* Celdas del Calendario */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '6px'
            }}>
              {diasCalendario.map((celda, idx) => {
                if (!celda.diaNum || !celda.fechaIso) {
                  return <div key={`empty-${idx}`} style={{ minHeight: '64px' }} />
                }

                const evs = eventosPorFecha.get(celda.fechaIso) || []
                const isSelected = diaSeleccionado === celda.fechaIso
                const hasLlenado = evs.some(e => e.tipo === 'llenado')
                const hasLimite = evs.some(e => e.tipo === 'limite')
                const hasPagoResidente = evs.some(e => e.tipo === 'pago_residente')
                const hasRecaudacion = evs.some(e => e.tipo === 'recaudacion')

                return (
                  <div
                    key={celda.fechaIso}
                    onClick={() => setDiaSeleccionado(celda.fechaIso)}
                    style={{
                      minHeight: '64px',
                      backgroundColor: isSelected
                        ? 'var(--color-accent-light, rgba(249, 115, 22, 0.2))'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected
                        ? '2px solid var(--color-accent, #f97316)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '6px 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: isSelected ? 900 : 700, color: isSelected ? 'var(--color-accent, #f97316)' : '#fff' }}>
                        {celda.diaNum}
                      </span>
                      {hasPagoResidente && <span style={{ fontSize: '11px' }} title="Tu pago registrado">💳</span>}
                    </div>

                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {hasLlenado && (
                        <span style={{ fontSize: '10px', backgroundColor: 'rgba(59, 130, 246, 0.3)', padding: '1px 3px', borderRadius: '3px' }} title="Descarga de cisterna">
                          🚛
                        </span>
                      )}
                      {hasLimite && (
                        <span style={{ fontSize: '10px', backgroundColor: 'rgba(239, 68, 68, 0.3)', padding: '1px 3px', borderRadius: '3px' }} title="Fecha límite">
                          ⏳
                        </span>
                      )}
                      {hasRecaudacion && (
                        <span style={{ fontSize: '10px', backgroundColor: 'rgba(34, 197, 94, 0.3)', padding: '1px 3px', borderRadius: '3px' }} title="Recaudación comunitaria">
                          💰
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Panel de Detalle del Día Seleccionado */}
            {diaSeleccionado && (
              <div style={{
                marginTop: '16px',
                padding: '14px 18px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Detalle del día: {diaSeleccionado}
                </div>

                {eventosDelDia.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#71717a' }}>
                    No hay eventos o descargas registradas en esta fecha.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {eventosDelDia.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px' }}>
                        <span style={{ fontSize: '16px' }}>
                          {ev.tipo === 'llenado' ? '🚛' : ev.tipo === 'pago_residente' ? '💳' : ev.tipo === 'limite' ? '⏳' : '💰'}
                        </span>
                        <div>
                          <b style={{ color: '#fff' }}>{ev.titulo}</b>
                          <div style={{ color: '#a1a1aa', marginTop: '2px' }}>{ev.descripcion}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: TANQUE Y TRANSPARENCIA COMUNITARIA ─────────────────────── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tanque' && metricas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Medidor de Nivel del Tanque Central */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🎛️</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Nivel del Tanque del Edificio en Tiempo Real
                </h3>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                backgroundColor: metricas.nivelPct <= 25 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e',
                border: `1px solid ${metricas.nivelPct <= 25 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`,
                padding: '3px 10px',
                borderRadius: '999px'
              }}>
                {metricas.nivelPct > 0 ? metricas.nivelEstado.toUpperCase() : 'PENDIENTE CARGA'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '36px', fontWeight: 900, color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e' }}>
                  {metricas.nivelPct}%
                </span>
                <span style={{ fontSize: '13px', color: '#a1a1aa', marginLeft: '8px' }}>
                  ({metricas.litrosActuales.toLocaleString()} / {metricas.capacidadTotal.toLocaleString()} Litros)
                </span>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#a1a1aa' }}>
                Autonomía Estimada: <b style={{ color: '#fff' }}>{metricas.diasAutonomia > 0 ? `~${metricas.diasAutonomia} días` : 'Por estimar'}</b>
              </div>
            </div>

            {/* Barra Visual */}
            <div style={{
              width: '100%',
              height: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '16px'
            }}>
              <div style={{
                height: '100%',
                width: `${metricas.nivelPct}%`,
                background: metricas.nivelPct <= 25
                  ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
                  : 'linear-gradient(90deg, #22c55e 0%, #3b82f6 100%)',
                borderRadius: '999px',
                transition: 'width 0.5s ease'
              }} />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '12px',
              padding: '12px'
            }}>
              <div>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Último Llenado Realizado:</span>
                <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
                  {metricas.ultimoLlenado?.fecha || 'Sin registro previo'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Proveedor del Servicio:</span>
                <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px', color: 'var(--color-accent, #f97316)' }}>
                  {data?.config.proveedorActual || 'Por registrar'}
                </div>
              </div>
            </div>
          </div>

          {/* Avance de Recaudación Comunitaria */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📊</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Progreso de Recaudación del Edificio
                </h3>
              </div>

              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                padding: '3px 10px',
                borderRadius: '999px'
              }}>
                {metricas.porcentajeRecaudado}% Recaudado
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#a1a1aa' }}>Apartamentos Solventes con el Gas:</span>
              <span>
                <b style={{ color: '#22c55e' }}>{metricas.aptosSolventes}</b> de <b>{metricas.totalAptos}</b> apartamentos
              </span>
            </div>

            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '12px'
            }}>
              <div style={{
                height: '100%',
                width: `${metricas.porcentajeRecaudado}%`,
                background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)',
                borderRadius: '999px'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa', flexWrap: 'wrap', gap: '4px' }}>
              <span>Recaudado: <b style={{ color: '#fff' }}>Bs. {fmtBs(metricas.totalRecaudadoBs)} (${fmtUsd(metricas.totalRecaudadoUsd)} USD)</b></span>
              <span>Meta: <b style={{ color: '#fff' }}>Bs. {fmtBs(metricas.metaBs)}</b></span>
            </div>
          </div>

          {/* Historial de Descargas de Cisterna */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '18px' }}>📜</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                Historial de Descargas de Gas Recibidas
              </h3>
            </div>

            {(!data?.llenados || data.llenados.length === 0) ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#71717a',
                fontSize: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '12px'
              }}>
                No hay registros de descargas de gas registradas aún.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.llenados.map(ll => (
                  <div
                    key={ll.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                        {ll.litrosCargados.toLocaleString()} L · {ll.proveedor || 'Cisterna'}
                      </div>
                      <div style={{ color: '#a1a1aa', marginTop: '2px' }}>
                        Fecha: <b>{ll.fecha}</b> {ll.responsableRecibio ? `· Responsable: ${ll.responsableRecibio}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        padding: '2px 8px',
                        borderRadius: '999px'
                      }}>
                        Descarga Exitosa
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GasResidente
