import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useBcvRate } from '../../data/useBcvRate'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import { supabase } from '../../data/supabase'
import { useNavigate } from 'react-router-dom'
import { buscarMoraPorApto, obtenerDeudasMora, TASA_RIESGO_CONFIG, DeudaMoraItem } from '../../data/moraService'

interface PagoItem {
  id: string
  monto_bs: number
  referencia: string
  estado: string
  created_at: string
  fecha_pago?: string
  notas_admin?: string
  banco_origen?: string
  banco_destino?: string
}

export function Dashboard() {
  const { perfil } = useAuth()
  const navigate = useNavigate()

  const p = perfil as any
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || perfil?.apartamento_id || ''
  const apartamentoId = perfil?.apartamento_id ?? ''
  const residenteNombre = p?.nombre_completo || 'Propietario'

  const [modalOpen, setModalOpen] = useState(false)
  const [ocultarSaldos, setOcultarSaldos] = useState(false)
  const [alicuota, setAlicuota] = useState<number>(1.59)
  const [esPenthouse, setEsPenthouse] = useState(false)

  const [ultimoPago, setUltimoPago] = useState<PagoItem | null>(null)
  const [pagosRecientes, setPagosRecientes] = useState<PagoItem[]>([])
  const [reciboPendiente, setReciboPendiente] = useState<{ id: string; total_usd: number; total_bs: number; mes_facturado: string; emitido_at: string } | null>(null)
  const [moraRecord, setMoraRecord] = useState<DeudaMoraItem | null>(null)

  const { rate, loading: loadingRate } = useBcvRate()
  const deudaUsd = reciboPendiente ? Number(reciboPendiente.total_usd) : 0
  const deudaBs = deudaUsd * (rate || 40)

  // Cargar datos del apartamento y alícuota
  const cargarApartamentoInfo = useCallback(async () => {
    try {
      if (apartamentoId) {
        const { data: aptData } = await supabase
          .from('apartamentos')
          .select('id, numero, alicuota, piso')
          .eq('id', apartamentoId)
          .maybeSingle()

        if (aptData) {
          if (aptData.alicuota) setAlicuota(Number(aptData.alicuota))
          const numStr = String(aptData.numero || '').toUpperCase()
          const pisoNum = Number(aptData.piso || 0)
          const isPH = numStr.includes('PH') || pisoNum === 15 || Number(aptData.alicuota) > 2.0
          setEsPenthouse(isPH)
          if (!aptData.alicuota) setAlicuota(isPH ? 2.59 : 1.59)
        }
      } else if (aptoNumero) {
        const { data: aptData } = await supabase
          .from('apartamentos')
          .select('id, numero, alicuota, piso')
          .eq('numero', aptoNumero)
          .maybeSingle()

        if (aptData) {
          if (aptData.alicuota) setAlicuota(Number(aptData.alicuota))
          const numStr = String(aptData.numero || '').toUpperCase()
          const pisoNum = Number(aptData.piso || 0)
          const isPH = numStr.includes('PH') || pisoNum === 15 || Number(aptData.alicuota) > 2.0
          setEsPenthouse(isPH)
          if (!aptData.alicuota) setAlicuota(isPH ? 2.59 : 1.59)
        }
      }
    } catch (err) {
      console.warn('[Dashboard] Error cargando alícuota:', err)
    }
  }, [apartamentoId, aptoNumero])

  // Cargar pagos, recibos y moras
  const cargarDatosResidente = useCallback(async () => {
    if (!apartamentoId && !aptoNumero) {
      return
    }

    try {

      const queryPagos = apartamentoId
        ? supabase.from('pagos_reportados').select('*').eq('apartamento_id', apartamentoId).order('created_at', { ascending: false }).limit(5)
        : supabase.from('pagos_reportados').select('*').order('created_at', { ascending: false }).limit(5)

      const queryRecibos = apartamentoId
        ? supabase.from('recibos_generados').select('id, total_usd, total_bs, mes_facturado, estado, emitido_at').eq('apartamento_id', apartamentoId).eq('estado', 'pendiente').order('mes_facturado', { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any)

      const [pagoRes, reciboRes] = await Promise.all([
        queryPagos,
        queryRecibos
      ])

      const listPagos = (pagoRes.data || []) as PagoItem[]
      setPagosRecientes(listPagos)
      if (listPagos.length > 0) setUltimoPago(listPagos[0])
      else setUltimoPago(null)

      if (reciboRes.data) setReciboPendiente(reciboRes.data)
      else setReciboPendiente(null)

      // Consultar si está en mora o tiene recibo emitido (<1m Azul o crónico)
      await obtenerDeudasMora()
      const mora = buscarMoraPorApto(aptoNumero || apartamentoId)
      setMoraRecord(mora)
    } catch (err) {
      console.warn('[Dashboard] Error cargando datos del residente:', err)
    }
  }, [apartamentoId, aptoNumero])

  useEffect(() => {
    cargarApartamentoInfo()
    cargarDatosResidente()

    if (!apartamentoId) return

    // Suscripción Realtime para actualizar pagos o recibos inmediatamente
    const channel = supabase
      .channel(`dashboard_resident_${apartamentoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => cargarDatosResidente()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recibos_generados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => cargarDatosResidente()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [apartamentoId, cargarApartamentoInfo, cargarDatosResidente])

  const mesFacturadoTexto = reciboPendiente?.mes_facturado
    ? new Date(reciboPendiente.mes_facturado).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
    : 'Mes en curso'

  return (
    <>
      {modalOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false)
            cargarDatosResidente()
          }}
        />
      )}

      {/* ── STYLES PRINCIPALES CON SOPORTE COMPLETO PC Y TELÉFONO ── */}
      <style>{`
        .resident-page {
          min-height: 100vh;
          background-color: #090a0d;
          font-family: 'Inter', sans-serif;
          color: #ffffff;
        }

        /* Vistas Desktop vs Móvil */
        .resident-mobile-view {
          display: none;
        }
        .resident-desktop-view {
          display: block;
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 28px 48px;
        }

        @media (max-width: 768px) {
          .resident-desktop-view {
            display: none;
          }
          .resident-mobile-view {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 16px 16px 36px;
          }
        }

        /* Botón circular de acción rápida táctil */
        .quick-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          outline: none;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .quick-action-btn:active {
          transform: scale(0.94);
        }
        .quick-action-circle {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          position: relative;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          transition: all 0.2s;
        }
        .quick-action-label {
          color: #d4d4d8;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2px;
          text-align: center;
        }

        /* Bento Grid Desktop */
        .bento-desktop-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 20px;
          margin-top: 24px;
        }
        .bento-col-main {
          grid-column: span 7;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .bento-col-side {
          grid-column: span 5;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .desktop-card {
          background: linear-gradient(180deg, #151922 0%, #0d1117 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px;
          padding: 24px 26px;
          box-shadow: 0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
        }
      `}</style>

      <div className="resident-page">

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* ── VISTA TELÉFONO (MÓVIL) - IDÉNTICA A LA INTERFAZ DE REFERENCIA ─ */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <div className="resident-mobile-view">

          {/* ── 1. TARJETA PRINCIPAL: ESTADO DE CUENTA / APTO ── */}
          <div style={{
            backgroundColor: '#141519',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '24px',
            padding: '22px 20px 20px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            position: 'relative'
          }}>
            {/* Header de la tarjeta con Ojo para ocultar/mostrar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#8e8e93', fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                  ESTADO DE CUENTA
                </span>
                <span style={{
                  color: '#f97316',
                  fontSize: '10px',
                  fontWeight: 800,
                  backgroundColor: 'rgba(249, 115, 22, 0.12)',
                  padding: '2px 7px',
                  borderRadius: '6px'
                }}>
                  APTO {aptoNumero}
                </span>
              </div>

              <button
                onClick={() => setOcultarSaldos(!ocultarSaldos)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8e8e93',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: 0
                }}
                title={ocultarSaldos ? 'Mostrar saldo' : 'Ocultar saldo'}
              >
                {ocultarSaldos ? '🙈' : '👁️'}
              </button>
            </div>

            {/* Gran cifra en Bolívares */}
            <div style={{ color: '#fff', fontSize: '34px', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              {ocultarSaldos ? 'Bs. ••••••' : `Bs. ${(deudaBs > 0 ? deudaBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>

            {/* Píldora de Estatus y Equivalente en USD */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
              {ultimoPago?.estado === 'pendiente' ? (
                <span style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.28)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  ⏳ Pago en Verificación
                </span>
              ) : moraRecord ? (
                <span style={{
                  backgroundColor: moraRecord.tasa_riesgo === 'azul' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: moraRecord.tasa_riesgo === 'azul' ? '#60a5fa' : '#ef4444',
                  border: `1px solid ${moraRecord.tasa_riesgo === 'azul' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  {moraRecord.tasa_riesgo === 'azul' ? '🔵 Recibo al Cobro (<1m)' : `⚠️ En Lista de Mora (${moraRecord.meses_deuda} meses)`}
                </span>
              ) : deudaUsd > 0 ? (
                <span style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.14)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.28)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  🔴 Recibo Pendiente
                </span>
              ) : (
                <span style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.14)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  ● Al día · Solvente
                </span>
              )}

              <span style={{ color: '#8e8e93', fontSize: '12px', fontWeight: 600 }}>
                {ocultarSaldos ? '••••' : `≈ $${deudaUsd.toFixed(2)} USD`}
              </span>
            </div>

            {/* Desglose de 3 Columnas al pie (MES ACTUAL | ALÍCUOTA | TASA BCV) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '16px'
            }}>
              <div>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  MES ACTUAL
                </div>
                <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                  {ocultarSaldos ? '••••' : `$${deudaUsd.toFixed(2)}`}
                </div>
              </div>

              <div>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  ALÍCUOTA
                </div>
                <div style={{ color: '#f97316', fontSize: '13px', fontWeight: 800 }}>
                  {alicuota.toFixed(2)}% {esPenthouse ? '(PH)' : ''}
                </div>
              </div>

              <div>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  TASA BCV
                </div>
                <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                  Bs. {(rate || 40).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* ── AVISO DE PAGO EN REVISIÓN (Si tiene último pago pendiente) ── */}
          {ultimoPago?.estado === 'pendiente' && (
            <div style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '16px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>⏳</span>
              <div>
                <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 800 }}>
                  Pago en Proceso de Conciliación
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '2px', lineHeight: 1.3 }}>
                  Reportaste Bs. {ultimoPago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Ref: <strong>{ultimoPago.referencia}</strong>). Será validado por la administración.
                </div>
              </div>
            </div>
          )}

          {/* ── ALERTA DE RECIBO / MORA (Si el apartamento figura en la lista) ── */}
          {moraRecord && (
            <div style={{
              background: moraRecord.tasa_riesgo === 'azul'
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.16) 100%)'
                : 'linear-gradient(135deg, rgba(168, 85, 247, 0.16) 0%, rgba(239, 68, 68, 0.16) 100%)',
              border: `2px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}`,
              borderRadius: '20px',
              padding: '16px',
              boxShadow: `0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}25`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '20px' }}>{moraRecord.tasa_riesgo === 'azul' ? '🔵' : '⚠️'}</span>
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                  {moraRecord.tasa_riesgo === 'azul'
                    ? `Apto ${moraRecord.apartamento_numero} · Recibo del Mes al Cobro`
                    : `Apto ${moraRecord.apartamento_numero} en Lista de Mora`}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 800,
                  color: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color,
                  background: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].bg,
                  border: `1px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].border}`,
                  padding: '2px 6px', borderRadius: '999px', marginLeft: 'auto'
                }}>
                  {TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].badgeText}
                </span>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#cbd5e1', lineHeight: 1.3 }}>
                {moraRecord.tasa_riesgo === 'azul' ? (
                  <>
                    Tienes el recibo del mes emitido (&lt;1 mes) con un monto de{' '}
                    <strong style={{ color: '#60a5fa' }}>${moraRecord.monto_usd.toFixed(2)} USD</strong>. Reporta tu pago para estar al día.
                  </>
                ) : (
                  <>
                    Tienes <strong>{moraRecord.meses_deuda} meses de atraso</strong> con una deuda acumulada de{' '}
                    <strong style={{ color: '#f97316' }}>${moraRecord.monto_usd.toFixed(2)} USD</strong>.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => navigate('/mora')}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Ver Lista
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(249, 115, 22, 0.4)'
                  }}
                >
                  Reportar Pago
                </button>
              </div>
            </div>
          )}

          {/* ── 2. SECCIÓN: ACCIONES RÁPIDAS DE RESIDENTE (BOTONES CIRCULARES) ── */}
          <div>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.3px' }}>
              Acciones rápidas
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 12px' }}>
              {/* 1. Reportar Pago (Verde Esmeralda Pulsante) */}
              <button
                className="quick-action-btn"
                onClick={() => setModalOpen(true)}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#13281f',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  color: '#22c55e',
                  boxShadow: '0 4px 18px rgba(34, 197, 94, 0.25)'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <span className="quick-action-label" style={{ color: '#22c55e', fontWeight: 700 }}>+ Pago</span>
              </button>

              {/* 2. Mis Recibos (Vino/Rojizo) */}
              <button
                className="quick-action-btn"
                onClick={() => navigate('/recibos')}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#261215',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <span className="quick-action-label">Recibos</span>
              </button>

              {/* 3. Junta de Condominio (Azul) */}
              <button
                className="quick-action-btn"
                onClick={() => navigate('/junta')}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#101d2c',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  color: '#60a5fa'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span className="quick-action-label">Junta</span>
              </button>

              {/* 4. Lista de Mora (Morado) */}
              <button
                className="quick-action-btn"
                onClick={() => navigate('/mora')}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#23122c',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  color: '#c084fc'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <span className="quick-action-label">Mora</span>
              </button>

              {/* 5. Chat Edificio (Cyan) */}
              <button
                className="quick-action-btn"
                onClick={() => navigate('/chat')}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#0c2229',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  color: '#22d3ee'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <span className="quick-action-label">Chat</span>
              </button>

              {/* 6. Incidencias / Averías (Ámbar) */}
              <button
                className="quick-action-btn"
                onClick={() => navigate('/reportes')}
              >
                <div className="quick-action-circle" style={{
                  backgroundColor: '#261e0e',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  color: '#fbbf24'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <span className="quick-action-label">Averías</span>
              </button>
            </div>
          </div>

          {/* ── 3. ÚLTIMOS PAGOS REPORTADOS / MOVIMIENTOS ── */}
          <div style={{
            backgroundColor: '#141519',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '20px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 800, margin: 0 }}>
                Mis Pagos Recientes
              </h3>
              <button
                onClick={() => navigate('/recibos')}
                style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Ver todos →
              </button>
            </div>

            {pagosRecientes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '13px' }}>Aún no has reportado pagos este mes.</p>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    marginTop: '12px',
                    background: 'rgba(249, 115, 22, 0.12)',
                    border: '1px solid rgba(249, 115, 22, 0.3)',
                    color: '#f97316',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Reportar Pago Ahora
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pagosRecientes.slice(0, 4).map((pago) => {
                  const isAprobado = pago.estado === 'aprobado'
                  const isRechazado = pago.estado === 'rechazado'

                  return (
                    <div
                      key={pago.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        backgroundColor: '#1b1d22',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                          backgroundColor: isAprobado ? 'rgba(34, 197, 94, 0.15)' : isRechazado ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                          flexShrink: 0
                        }}>
                          {isAprobado ? '✓' : isRechazado ? '✕' : '⏳'}
                        </div>
                        <div>
                          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                            Ref: {pago.referencia}
                          </div>
                          <div style={{ color: '#8e8e93', fontSize: '11px', marginTop: '1px' }}>
                            {new Date(pago.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                          Bs. {pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 800,
                          color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                          textTransform: 'uppercase'
                        }}>
                          {isAprobado ? 'Aprobado' : isRechazado ? 'Rechazado' : 'En Verificación'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>


        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* ── VISTA PC (DESKTOP) - BENTO GRID ELEGANTE Y OSCURA ─────────── */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <div className="resident-desktop-view">

          {/* Header Superior Desktop */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '28px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '20px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
                  ¡Hola, {residenteNombre}!
                </h1>
                <span style={{
                  backgroundColor: 'rgba(249, 115, 22, 0.15)',
                  color: '#f97316',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 800
                }}>
                  Apartamento {aptoNumero}
                </span>
              </div>
              <p style={{ color: '#7e8b9b', fontSize: '14px', margin: '6px 0 0 0' }}>
                Estado de cuenta, alícuota asignada y gestión de pagos de condominio.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Tasa BCV Oficial Widget */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '18px' }}>🇻🇪</span>
                <div>
                  <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>TASA BCV</div>
                  <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                    {loadingRate ? 'Cargando...' : `Bs. ${(rate || 40).toFixed(2)} / $`}
                  </div>
                </div>
              </div>

              {/* Botón Principal Reportar Pago */}
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#fff',
                  padding: '12px 22px',
                  borderRadius: '14px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 18px rgba(234, 88, 12, 0.45)',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span>Reportar Pago</span>
              </button>
            </div>
          </div>

          {/* ALERTA DE MORA / RECIBO DESKTOP (Si aplica) */}
          {moraRecord && (
            <div style={{
              background: moraRecord.tasa_riesgo === 'azul'
                ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.16) 100%)'
                : 'linear-gradient(135deg, rgba(168, 85, 247, 0.16) 0%, rgba(239, 68, 68, 0.16) 100%)',
              border: `2px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}`,
              borderRadius: '20px',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              boxShadow: `0 8px 30px rgba(0, 0, 0, 0.5), 0 0 16px ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}25`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '32px' }}>{moraRecord.tasa_riesgo === 'azul' ? '🔵' : '⚠️'}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>
                      {moraRecord.tasa_riesgo === 'azul'
                        ? `Tu Apartamento (${moraRecord.apartamento_numero}) tiene el Recibo del Mes al Cobro`
                        : `Tu Apartamento (${moraRecord.apartamento_numero}) figura en la Lista de Mora Comunitaria`}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: 800,
                      color: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color,
                      background: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].bg,
                      border: `1px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].border}`,
                      padding: '2px 8px', borderRadius: '999px'
                    }}>
                      {TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].badgeText}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#cbd5e1' }}>
                    {moraRecord.tasa_riesgo === 'azul' ? (
                      <>
                        Tienes el recibo del mes emitido (&lt;1 mes) con un monto de{' '}
                        <strong style={{ color: '#60a5fa' }}>${moraRecord.monto_usd.toFixed(2)} USD</strong>. Cancela dentro del plazo para mantener tu solvencia comunitaria.
                      </>
                    ) : (
                      <>
                        Presentas <strong>{moraRecord.meses_deuda} meses de atraso</strong> con una deuda anterior acumulada de{' '}
                        <strong style={{ color: '#f97316' }}>${moraRecord.monto_usd.toFixed(2)} USD</strong>. Regulariza tu saldo para evitar recargos legales.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => navigate('/mora')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#fff',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Ver Lista de Mora
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                    border: 'none',
                    color: '#fff',
                    padding: '9px 18px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 12px rgba(249, 115, 22, 0.4)'
                  }}
                >
                  Reportar Pago
                </button>
              </div>
            </div>
          )}

          {/* Bento Grid Desktop (7 cols principal / 5 cols lateral) */}
          <div className="bento-desktop-grid">

            {/* COLUMNA PRINCIPAL */}
            <div className="bento-col-main">

              {/* 1. Tarjeta Hero Estado de Cuenta */}
              <div className="desktop-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <span style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      ESTADO DE CUENTA
                    </span>
                    <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: '2px 0 0' }}>
                      Apartamento {aptoNumero}
                    </h2>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setOcultarSaldos(!ocultarSaldos)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        color: '#94a3b8',
                        padding: '6px 12px',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                      title="Ocultar o mostrar montos"
                    >
                      {ocultarSaldos ? 'Mostrar 👁️' : 'Ocultar 🙈'}
                    </button>

                    {ultimoPago?.estado === 'pendiente' ? (
                      <span style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        ⏳ Pago en Verificación
                      </span>
                    ) : deudaUsd > 0 ? (
                      <span style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        🔴 Pago Pendiente
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        ● Al día · Solvente
                      </span>
                    )}
                  </div>
                </div>

                {/* Gran Monto */}
                <div style={{ color: '#fff', fontSize: '42px', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1 }}>
                  {ocultarSaldos ? 'Bs. ••••••' : `Bs. ${(deudaBs > 0 ? deudaBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', color: '#f97316', fontSize: '16px', fontWeight: 700 }}>
                  <span>{ocultarSaldos ? '•••• USD' : `≈ $${deudaUsd.toFixed(2)} USD`}</span>
                  <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    · {mesFacturadoTexto}
                  </span>
                </div>

                {/* Desglose Inferior */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  marginTop: '22px',
                  paddingTop: '18px'
                }}>
                  <div>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>ALÍCUOTA</div>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                      {alicuota.toFixed(2)}% {esPenthouse ? '(Penthouse)' : '(Estándar)'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>EQUIVALENTE USD</div>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                      ${deudaUsd.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>TASA DEL DÍA</div>
                    <div style={{ color: '#22c55e', fontSize: '16px', fontWeight: 800, marginTop: '2px' }}>
                      Bs. {(rate || 40).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Botón de Pago directo */}
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#fff',
                    padding: '14px',
                    borderRadius: '14px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginTop: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 18px rgba(234, 88, 12, 0.45)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>Reportar Pago de Condominio</span>
                </button>
              </div>

              {/* 2. Tabla de Pagos Recientes */}
              <div className="desktop-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <h3 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0 }}>
                    Historial de Pagos Reportados
                  </h3>
                  <button
                    onClick={() => navigate('/recibos')}
                    style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Ver historial completo →
                  </button>
                </div>

                {pagosRecientes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b' }}>
                    <p style={{ margin: 0, fontSize: '14px' }}>No hay pagos registrados para este apartamento.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pagosRecientes.map((pago) => {
                      const isAprobado = pago.estado === 'aprobado'
                      const isRechazado = pago.estado === 'rechazado'

                      return (
                        <div
                          key={pago.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 16px',
                            backgroundColor: '#161922',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '14px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              width: '42px', height: '42px', borderRadius: '12px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                              backgroundColor: isAprobado ? 'rgba(34, 197, 94, 0.15)' : isRechazado ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                              flexShrink: 0
                            }}>
                              {isAprobado ? '✓' : isRechazado ? '✕' : '⏳'}
                            </div>
                            <div>
                              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
                                Referencia Bancaria: {pago.referencia}
                              </div>
                              <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                                Fecha: {new Date(pago.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                              Bs. {pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </div>
                            <span style={{
                              fontSize: '11px', fontWeight: 800,
                              color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                              textTransform: 'uppercase'
                            }}>
                              {isAprobado ? 'Conciliado · Aprobado' : isRechazado ? 'Rechazado' : 'En Verificación'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* COLUMNA LATERAL (ACCESOS RÁPIDOS Y COMUNIDAD) */}
            <div className="bento-col-side">

              {/* 1. Tarjeta Junta Directiva / Organigrama */}
              <div
                className="desktop-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/junta')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#60a5fa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    👥
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                      Junta de Condominio
                    </div>
                    <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                      Organigrama, cargos y teléfonos de contacto directo
                    </div>
                  </div>
                  <span style={{ color: '#60a5fa', fontSize: '18px' }}>→</span>
                </div>
              </div>

              {/* 2. Tarjeta Lista de Mora */}
              <div
                className="desktop-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/mora')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    color: '#c084fc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    ⚖️
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                        Lista de Mora
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 800,
                        backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe',
                        padding: '1px 7px', borderRadius: '999px'
                      }}>
                        &gt;3 Meses
                      </span>
                    </div>
                    <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                      Transparencia comunitaria y tasas de riesgo
                    </div>
                  </div>
                  <span style={{ color: '#c084fc', fontSize: '18px' }}>→</span>
                </div>
              </div>

              {/* 3. Tarjeta Chat Comunitario en Vivo */}
              <div
                className="desktop-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/chat')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    backgroundColor: 'rgba(6, 182, 212, 0.15)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    color: '#22d3ee',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    💬
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                      Chat Comunitario
                    </div>
                    <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                      Conversa en vivo con vecinos y administración
                    </div>
                  </div>
                  <span style={{ color: '#22d3ee', fontSize: '18px' }}>→</span>
                </div>
              </div>

              {/* 4. Tarjeta Reportar Avería / Incidencia */}
              <div
                className="desktop-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/reportes')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#fbbf24',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    🛠️
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                      Reportar Avería o Incidencia
                    </div>
                    <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                      Notifica fallas de ascensor, agua, luz o áreas comunes
                    </div>
                  </div>
                  <span style={{ color: '#fbbf24', fontSize: '18px' }}>→</span>
                </div>
              </div>

              {/* 5. Tarjeta Información del Inmueble */}
              <div className="desktop-card" style={{ backgroundColor: '#101217' }}>
                <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>
                  INFORMACIÓN DEL INMUEBLE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#94a3b8' }}>Apartamento:</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>Apto {aptoNumero}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#94a3b8' }}>Tipo de Inmueble:</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{esPenthouse ? 'Penthouse (PH)' : 'Apartamento Estándar'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#94a3b8' }}>Alícuota Legal:</span>
                    <span style={{ color: '#f97316', fontWeight: 700 }}>{alicuota.toFixed(2)}%</span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </>
  )
}
