import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { LocalComercial, obtenerLocales, suscribirLocales } from '../../data/localesService'
import { useBcvRate } from '../../data/useBcvRate'

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const LocalesResidente: React.FC = () => {
  const { perfil } = useAuth()
  const { rate: tasaBcv } = useBcvRate()
  const [locales, setLocales] = useState<LocalComercial[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros y buscador para lectura comunitaria
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'activos' | 'solventes' | 'con_deuda'>('todos')

  // Modal para ver ficha completa del espacio / depósito
  const [localSeleccionado, setLocalSeleccionado] = useState<LocalComercial | null>(null)

  const p = perfil as any
  const apartamentoId = p?.apartamento_id || p?.apartamento?.id || ''
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || p?.numero || ''

  useEffect(() => {
    let mounted = true
    const cargar = async () => {
      setLoading(true)
      try {
        const data = await obtenerLocales()
        if (mounted) setLocales(data)
      } catch (err) {
        console.error('[LocalesResidente] Error cargando locales:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    cargar()

    const unsub = suscribirLocales(actualizados => {
      if (mounted) setLocales(actualizados)
    })

    return () => {
      mounted = false
      unsub()
    }
  }, [])

  // Separar los locales asignados a este apartamento vs el resto del edificio
  const misLocales = useMemo(() => {
    return locales.filter(l => {
      if (apartamentoId && l.apartamento_id === apartamentoId) return true
      if (aptoNumero && l.apartamento_numero && String(l.apartamento_numero).trim().toUpperCase() === String(aptoNumero).trim().toUpperCase()) return true
      return false
    })
  }, [locales, apartamentoId, aptoNumero])

  // Métricas comunitarias de transparencia
  const localesActivos = useMemo(() => locales.filter(l => l.estado === 'activo'), [locales])
  const localesSolventes = useMemo(() => locales.filter(l => (Number(l.deuda_actual_usd) || 0) <= 0), [locales])
  const localesConDeuda = useMemo(() => locales.filter(l => (Number(l.deuda_actual_usd) || 0) > 0), [locales])

  const totalCuotaMensualUsd = useMemo(() => localesActivos.reduce((s, l) => s + (Number(l.monto_usd) || 0), 0), [localesActivos])
  const totalCuotaMensualBs  = useMemo(() => localesActivos.reduce((s, l) => s + (Number(l.monto_bs) || (Number(l.monto_usd) * (tasaBcv || 859.06))), 0), [localesActivos, tasaBcv])

  const totalDeudaEdificioLocalesUsd = useMemo(() => locales.reduce((s, l) => s + (Number(l.deuda_actual_usd) || 0), 0), [locales])
  const totalDeudaEdificioLocalesBs  = useMemo(() => locales.reduce((s, l) => s + (Number(l.deuda_actual_bs) || (Number(l.deuda_actual_usd) * (tasaBcv || 859.06))), 0), [locales, tasaBcv])

  // Total deuda del residente en sus locales asignados
  const totalDeudaMisLocalesUsd = misLocales.reduce((acc, l) => acc + (Number(l.deuda_actual_usd) || 0), 0)
  const totalDeudaMisLocalesBs  = misLocales.reduce((acc, l) => acc + (Number(l.deuda_actual_bs) || (Number(l.deuda_actual_usd) * (tasaBcv || 859.06))), 0)

  // Locales filtrados para la vista de lectura general
  const localesFiltrados = useMemo(() => {
    return locales.filter(l => {
      // Filtro de estado
      if (filtro === 'activos' && l.estado !== 'activo') return false
      if (filtro === 'solventes' && (Number(l.deuda_actual_usd) || 0) > 0) return false
      if (filtro === 'con_deuda' && (Number(l.deuda_actual_usd) || 0) <= 0) return false

      // Filtro de búsqueda textual
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const matchNombre = l.nombre.toLowerCase().includes(q)
        const matchCodigo = l.codigo ? l.codigo.toLowerCase().includes(q) : false
        const matchDesc   = l.descripcion ? l.descripcion.toLowerCase().includes(q) : false
        const matchArrend = l.arrendatario_nombre ? l.arrendatario_nombre.toLowerCase().includes(q) : false
        const matchApto   = l.apartamento_numero ? String(l.apartamento_numero).toLowerCase().includes(q) : false
        return matchNombre || matchCodigo || matchDesc || matchArrend || matchApto
      }

      return true
    })
  }, [locales, filtro, busqueda])

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto', padding: '20px 16px 80px', color: '#fff' }}>
      
      {/* ── ENCABEZADO PRINCIPAL (MODO LECTURA / TRANSPARENCIA) ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '30px' }}>🏢</span>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.3px', color: '#fff' }}>
                Locales y Espacios Exclusivos
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '2px 0 0' }}>
                Directorio informativo de áreas comerciales, cuotas y solvencia del edificio
              </p>
            </div>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '5px 12px',
            borderRadius: '999px',
            fontSize: '11.5px',
            fontWeight: 800
          }}>
            <span>👁️</span>
            <span>MODO LECTURA · TRANSPARENCIA COMUNITARIA</span>
          </div>
        </div>

        <p style={{ color: '#cbd5e1', fontSize: '13px', margin: 0, lineHeight: 1.5, maxWidth: '820px' }}>
          Los ingresos percibidos por los locales y espacios comunes se acreditan en los recibos oficiales como <strong>"Donación por uso de espacios exclusivos"</strong>, deduciéndose de los gastos comunes o destinándose al Fondo de Reserva en beneficio de todos los copropietarios.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Consultando registros de locales y espacios...</p>
        </div>
      ) : (
        <>
          {/* ── TARJETAS KPI DE TRANSPARENCIA COMUNITARIA ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginBottom: '28px'
          }}>
            {/* 1. Locales en Uso */}
            <div style={{
              backgroundColor: '#0c121e',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏬</span> Espacios en Uso
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8', lineHeight: 1 }}>
                {localesActivos.length} <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>/ {locales.length}</span>
              </div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                {localesActivos.length === locales.length ? '100% de los locales activos' : `${locales.length - localesActivos.length} en mantenimiento o inactivos`}
              </div>
            </div>

            {/* 2. Cuota Mensual Generada */}
            <div style={{
              backgroundColor: '#0c121e',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💵</span> Cuota Mensual Total
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>
                ${fmtUsd(totalCuotaMensualUsd)} <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 700 }}>USD</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
                ≈ Bs. {fmtBs(totalCuotaMensualBs)} (Tasa BCV)
              </div>
            </div>

            {/* 3. Estado de Pagos / Solvencia */}
            <div style={{
              backgroundColor: '#0c121e',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📊</span> Solvencia de Locales
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#22c55e' }}>
                  {localesSolventes.length} Al Día
                </span>
                {localesConDeuda.length > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444' }}>
                    · {localesConDeuda.length} con Deuda
                  </span>
                )}
              </div>
              <div style={{ color: localesConDeuda.length > 0 ? '#f87171' : '#4ade80', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>
                {localesConDeuda.length > 0
                  ? `Deuda total pendiente: $${fmtUsd(totalDeudaEdificioLocalesUsd)} USD (Bs. ${fmtBs(totalDeudaEdificioLocalesBs)})`
                  : 'Todos los locales están solventes'}
              </div>
            </div>

            {/* 4. Destino Contable */}
            <div style={{
              backgroundColor: '#0c121e',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏦</span> Destino de Fondos
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-accent, #f97316)', lineHeight: 1.3 }}>
                Fondo Reserva / Deducción
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>
                Ingreso directo al balance general del condominio
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECCIÓN: MI LOCAL / DEPÓSITO ASIGNADO (SI EL RESIDENTE TIENE UNO)
             ══════════════════════════════════════════════════════════════════ */}
          {misLocales.length > 0 && (
            <div style={{
              backgroundColor: '#0a0f1d',
              border: '2px solid rgba(249, 115, 22, 0.4)',
              borderRadius: '16px',
              padding: '22px',
              marginBottom: '36px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                    border: '1px solid rgba(249, 115, 22, 0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    🔑
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 900, margin: 0, color: '#fff' }}>
                      Mi Espacio / Depósito Asignado {aptoNumero ? `(Apto #${aptoNumero})` : ''}
                    </h2>
                    <span style={{ color: '#fdba74', fontSize: '12px', fontWeight: 600 }}>
                      Información completa del depósito, cuotas y condiciones del contrato
                    </span>
                  </div>
                </div>

                <div style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 800,
                  backgroundColor: totalDeudaMisLocalesUsd > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                  color: totalDeudaMisLocalesUsd > 0 ? '#ef4444' : '#4ade80',
                  border: `1px solid ${totalDeudaMisLocalesUsd > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`
                }}>
                  {totalDeudaMisLocalesUsd > 0
                    ? `⚠️ DEUDA TOTAL: $${fmtUsd(totalDeudaMisLocalesUsd)} USD (Bs. ${fmtBs(totalDeudaMisLocalesBs)})`
                    : '🟢 100% SOLVENTE (AL DÍA)'}
                </div>
              </div>

              {/* Grid de Locales Asignados */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {misLocales.map(loc => {
                  const tieneDeuda = (Number(loc.deuda_actual_usd) || 0) > 0
                  const garantiaUsd = Number(loc.deposito_garantia_usd) || 0
                  const garantiaBs  = garantiaUsd * (tasaBcv || 859.06)

                  return (
                    <div
                      key={loc.id}
                      style={{
                        backgroundColor: '#111827',
                        border: `1.5px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.35)'}`,
                        borderRadius: '14px',
                        padding: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '14px'
                      }}
                    >
                      <div>
                        {/* Cabecera del Espacio */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontSize: '17px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🏬</span>
                              <span>{loc.nombre}</span>
                            </div>
                            {loc.codigo && (
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '6px', marginTop: '4px', display: 'inline-block' }}>
                                Código: {loc.codigo}
                              </span>
                            )}
                          </div>

                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: loc.estado === 'activo' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                            color: loc.estado === 'activo' ? '#4ade80' : '#94a3b8',
                            border: `1px solid ${loc.estado === 'activo' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
                          }}>
                            {loc.estado.toUpperCase()}
                          </span>
                        </div>

                        {/* DESGLOSE FINANCIERO Y DEPÓSITO */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '8px',
                          marginBottom: '14px'
                        }}>
                          {/* 1. Cuota Mensual */}
                          <div style={{ backgroundColor: '#172236', borderRadius: '10px', padding: '10px 12px' }}>
                            <div style={{ color: '#94a3b8', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                              Cuota Mensual
                            </div>
                            <div style={{ color: '#38bdf8', fontSize: '16px', fontWeight: 900, marginTop: '2px' }}>
                              ${fmtUsd(loc.monto_usd)} USD
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                              Bs. {fmtBs(loc.monto_bs || (loc.monto_usd * (tasaBcv || 859.06)))}
                            </div>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, display: 'block', marginTop: '2px', textTransform: 'capitalize' }}>
                              Cuota {loc.tipo_cuota}
                            </span>
                          </div>

                          {/* 2. Depósito en Garantía */}
                          <div style={{ backgroundColor: '#172236', borderRadius: '10px', padding: '10px 12px', border: '1px solid rgba(249, 115, 22, 0.25)' }}>
                            <div style={{ color: '#fdba74', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>🛡️</span> Depósito Garantía
                            </div>
                            <div style={{ color: '#fb923c', fontSize: '16px', fontWeight: 900, marginTop: '2px' }}>
                              ${fmtUsd(garantiaUsd)} USD
                            </div>
                            <div style={{ color: '#fdba74', fontSize: '11px' }}>
                              {garantiaUsd > 0 ? `Bs. ${fmtBs(garantiaBs)}` : 'Sin depósito'}
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                              Custodia Admin
                            </span>
                          </div>

                          {/* 3. Estado de Deuda */}
                          <div style={{
                            backgroundColor: tieneDeuda ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.3)'}`,
                            borderRadius: '10px',
                            padding: '10px 12px'
                          }}>
                            <div style={{ color: tieneDeuda ? '#f87171' : '#4ade80', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                              {tieneDeuda ? '⚠️ NO SOLVENTE' : '✅ SOLVENTE'}
                            </div>
                            <div style={{ color: tieneDeuda ? '#ef4444' : '#4ade80', fontSize: '16px', fontWeight: 900, marginTop: '2px' }}>
                              {tieneDeuda ? `$${fmtUsd(loc.deuda_actual_usd)} USD` : '$0.00'}
                            </div>
                            <div style={{ color: tieneDeuda ? '#fca5a5' : '#86efac', fontSize: '11px' }}>
                              {tieneDeuda ? `Bs. ${fmtBs(loc.deuda_actual_bs || (loc.deuda_actual_usd * (tasaBcv || 859.06)))}` : 'Al día'}
                            </div>
                            <span style={{ fontSize: '10px', color: tieneDeuda ? '#ef4444' : '#4ade80', fontWeight: 700, display: 'block', marginTop: '2px' }}>
                              {tieneDeuda ? 'Cargado en Recibo' : 'Sin pendientes'}
                            </span>
                          </div>
                        </div>

                        {/* Datos del Arrendatario y Contrato */}
                        <div style={{
                          backgroundColor: '#0c121e',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '12px',
                          border: '1px solid #1e293b'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Arrendatario / Titular:</span>
                            <span style={{ color: '#fff', fontWeight: 800 }}>{loc.arrendatario_nombre}</span>
                          </div>

                          {loc.arrendatario_cedula && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Cédula / RIF:</span>
                              <span style={{ color: '#cbd5e1' }}>{loc.arrendatario_cedula}</span>
                            </div>
                          )}

                          {loc.arrendatario_telefono && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Teléfono:</span>
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{loc.arrendatario_telefono}</span>
                            </div>
                          )}

                          {loc.arrendatario_email && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>Correo:</span>
                              <span style={{ color: '#cbd5e1' }}>{loc.arrendatario_email}</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #1e293b', paddingTop: '6px', marginTop: '2px' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Vigencia Contrato:</span>
                            <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
                              {loc.inicio_contrato} {loc.fin_contrato ? `hasta ${loc.fin_contrato}` : '(Continuo)'}
                            </span>
                          </div>

                          {loc.notas_admin && (
                            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '6px', marginTop: '4px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                              📝 {loc.notas_admin}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botón para ver Ficha Completa del Depósito */}
                      <button
                        type="button"
                        onClick={() => setLocalSeleccionado(loc)}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '9px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>📄</span>
                        <span>Ver Ficha Completa del Depósito</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECCIÓN: DIRECTORIO DE LOCALES Y ESPACIOS (MODO LECTURA GENERAL)
             ══════════════════════════════════════════════════════════════════ */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span>
                  <span>Directorio General de Locales y Espacios ({localesFiltrados.length})</span>
                </h2>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                  Espacios registrados, cuotas vigentes y estado de pago (Solvente / No Solvente)
                </span>
              </div>

              {/* Filtros de Estado */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'activos', label: '🟢 En Uso' },
                  { id: 'solventes', label: '✅ Solventes' },
                  { id: 'con_deuda', label: '🔴 Con Deuda' },
                ].map(f => {
                  const active = filtro === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltro(f.id as any)}
                      style={{
                        backgroundColor: active ? 'var(--color-accent, #f97316)' : '#131b2c',
                        color: active ? '#fff' : '#94a3b8',
                        border: `1px solid ${active ? 'var(--color-accent, #f97316)' : '#1e293b'}`,
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontWeight: active ? 800 : 600,
                        cursor: 'pointer'
                      }}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Barra de Búsqueda */}
            <div style={{ marginBottom: '14px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '14px' }}>
                🔍
              </span>
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por local, código (ej: L-01), rubro, arrendatario o apartamento..."
                style={{
                  width: '100%',
                  backgroundColor: '#0c121e',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '9px 12px 9px 34px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Listado de Locales */}
            {localesFiltrados.length === 0 ? (
              <div style={{
                backgroundColor: '#0c121e',
                border: '1px dashed #1e293b',
                borderRadius: '12px',
                padding: '30px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '30px', marginBottom: '8px' }}>🔍</div>
                <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 700 }}>
                  No se encontraron locales o espacios
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
                  Prueba cambiando los términos de búsqueda o los filtros de solvencia.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', backgroundColor: '#0c121e', border: '1px solid #1e293b', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#111726' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Espacio / Local</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Rubro / Uso</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Arrendatario</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Apto Asignado</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Cuota Mensual</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>¿Pagó? (Solvencia)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localesFiltrados.map((loc, idx) => {
                      const tieneDeuda = (Number(loc.deuda_actual_usd) || 0) > 0
                      const esSolvente = !tieneDeuda
                      const esDeMiApto = misLocales.some(m => m.id === loc.id)

                      return (
                        <tr
                          key={loc.id}
                          style={{
                            borderBottom: '1px solid #172236',
                            backgroundColor: esDeMiApto
                              ? 'rgba(249, 115, 22, 0.08)'
                              : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')
                          }}
                        >
                          {/* Espacio / Local */}
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🏬</span>
                              <span>{loc.nombre}</span>
                            </div>
                            {loc.codigo && (
                              <span style={{ fontSize: '10.5px', color: '#94a3b8', backgroundColor: '#172236', padding: '1px 6px', borderRadius: '4px', marginTop: '2px', display: 'inline-block' }}>
                                {loc.codigo}
                              </span>
                            )}
                            {esDeMiApto && (
                              <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>
                                (Mi Inmueble)
                              </span>
                            )}
                          </td>

                          {/* Rubro / Uso */}
                          <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                            {loc.descripcion || 'Comercial / Uso Común'}
                          </td>

                          {/* Arrendatario */}
                          <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                            <div style={{ color: '#fff', fontWeight: 600 }}>{loc.arrendatario_nombre}</div>
                            {loc.arrendatario_cedula && (
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{loc.arrendatario_cedula}</span>
                            )}
                          </td>

                          {/* Apartamento Asignado */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {loc.apartamento_numero ? (
                              <span style={{
                                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                                color: 'var(--color-accent, #f97316)',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 800
                              }}>
                                #{loc.apartamento_numero}
                              </span>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '11px' }}>Condominio</span>
                            )}
                          </td>

                          {/* Cuota Mensual */}
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ color: '#38bdf8', fontWeight: 900, fontSize: '13.5px' }}>
                              ${fmtUsd(loc.monto_usd)} USD
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                              Bs. {fmtBs(loc.monto_bs || (loc.monto_usd * (tasaBcv || 859.06)))}
                            </div>
                          </td>

                          {/* ¿Pagó o no? (Solvencia) */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: esSolvente ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: esSolvente ? '#4ade80' : '#ef4444',
                              border: `1px solid ${esSolvente ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
                            }}>
                              <span>{esSolvente ? '🟢' : '🔴'}</span>
                              <span>
                                {esSolvente ? 'SOLVENTE (AL DÍA)' : `NO SOLVENTE (-$${fmtUsd(loc.deuda_actual_usd)})`}
                              </span>
                            </span>
                          </td>

                          {/* Botón Ver Ficha */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setLocalSeleccionado(loc)}
                              style={{
                                backgroundColor: '#1e293b',
                                color: '#38bdf8',
                                border: '1px solid #334155',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Ver Ficha
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: FICHA INFORMATIVA DEL ESPACIO / DEPÓSITO (LECTURA COMPLETA)
         ══════════════════════════════════════════════════════════════════ */}
      {localSeleccionado && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#0c121e',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            color: '#fff',
            position: 'relative'
          }}>
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px' }}>🏬</span>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#fff' }}>
                    {localSeleccionado.nombre}
                  </h3>
                </div>
                {localSeleccionado.codigo && (
                  <span style={{ fontSize: '11px', color: '#94a3b8', backgroundColor: '#172236', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                    Código: {localSeleccionado.codigo}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setLocalSeleccionado(null)}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Estado y Solvencia */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                backgroundColor: localSeleccionado.estado === 'activo' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                color: localSeleccionado.estado === 'activo' ? '#4ade80' : '#94a3b8',
                border: `1px solid ${localSeleccionado.estado === 'activo' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
              }}>
                ESTADO: {localSeleccionado.estado.toUpperCase()}
              </span>

              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                backgroundColor: Number(localSeleccionado.deuda_actual_usd) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: Number(localSeleccionado.deuda_actual_usd) > 0 ? '#ef4444' : '#4ade80',
                border: `1px solid ${Number(localSeleccionado.deuda_actual_usd) > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`
              }}>
                {Number(localSeleccionado.deuda_actual_usd) > 0 ? '🔴 NO SOLVENTE (CON DEUDA)' : '🟢 SOLVENTE (AL DÍA)'}
              </span>
            </div>

            {/* Cajas Financieras */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              {/* Cuota Mensual */}
              <div style={{ backgroundColor: '#131b2c', borderRadius: '10px', padding: '12px', border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Cuota Mensual</span>
                <div style={{ color: '#38bdf8', fontSize: '17px', fontWeight: 900, marginTop: '2px' }}>
                  ${fmtUsd(localSeleccionado.monto_usd)} USD
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                  Bs. {fmtBs(localSeleccionado.monto_bs || (localSeleccionado.monto_usd * (tasaBcv || 859.06)))}
                </div>
              </div>

              {/* Depósito en Garantía */}
              <div style={{ backgroundColor: '#131b2c', borderRadius: '10px', padding: '12px', border: '1px solid rgba(249, 115, 22, 0.25)' }}>
                <span style={{ color: '#fdba74', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>Depósito Garantía</span>
                <div style={{ color: '#fb923c', fontSize: '17px', fontWeight: 900, marginTop: '2px' }}>
                  ${fmtUsd(localSeleccionado.deposito_garantia_usd || 0)} USD
                </div>
                <div style={{ color: '#fdba74', fontSize: '11px' }}>
                  {(localSeleccionado.deposito_garantia_usd || 0) > 0
                    ? `Bs. ${fmtBs((localSeleccionado.deposito_garantia_usd || 0) * (tasaBcv || 859.06))}`
                    : 'Sin depósito'}
                </div>
              </div>

              {/* Deuda Pendiente */}
              <div style={{
                backgroundColor: Number(localSeleccionado.deuda_actual_usd) > 0 ? 'rgba(239, 68, 68, 0.12)' : '#131b2c',
                borderRadius: '10px',
                padding: '12px',
                border: `1px solid ${Number(localSeleccionado.deuda_actual_usd) > 0 ? 'rgba(239, 68, 68, 0.35)' : '#1e293b'}`
              }}>
                <span style={{ color: Number(localSeleccionado.deuda_actual_usd) > 0 ? '#f87171' : '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Deuda Pendiente
                </span>
                <div style={{ color: Number(localSeleccionado.deuda_actual_usd) > 0 ? '#ef4444' : '#4ade80', fontSize: '17px', fontWeight: 900, marginTop: '2px' }}>
                  ${fmtUsd(localSeleccionado.deuda_actual_usd || 0)} USD
                </div>
                <div style={{ color: Number(localSeleccionado.deuda_actual_usd) > 0 ? '#fca5a5' : '#86efac', fontSize: '11px' }}>
                  {Number(localSeleccionado.deuda_actual_usd) > 0
                    ? `Bs. ${fmtBs(localSeleccionado.deuda_actual_bs || ((localSeleccionado.deuda_actual_usd || 0) * (tasaBcv || 859.06)))}`
                    : 'Sin saldo deudor'}
                </div>
              </div>
            </div>

            {/* Información Detallada */}
            <div style={{ backgroundColor: '#131b2c', borderRadius: '12px', padding: '14px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Apartamento Asignado:</span>
                <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>
                  {localSeleccionado.apartamento_numero ? `Apto #${localSeleccionado.apartamento_numero}` : 'Condominio (General)'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Arrendatario / Titular:</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{localSeleccionado.arrendatario_nombre}</span>
              </div>

              {localSeleccionado.arrendatario_cedula && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Cédula / RIF:</span>
                  <span style={{ color: '#cbd5e1' }}>{localSeleccionado.arrendatario_cedula}</span>
                </div>
              )}

              {localSeleccionado.arrendatario_telefono && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Teléfono:</span>
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>{localSeleccionado.arrendatario_telefono}</span>
                </div>
              )}

              {localSeleccionado.arrendatario_email && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Correo:</span>
                  <span style={{ color: '#cbd5e1' }}>{localSeleccionado.arrendatario_email}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #1e293b', paddingTop: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Rubro / Uso del Espacio:</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{localSeleccionado.descripcion || 'Comercial'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Vigencia de Contrato:</span>
                <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
                  {localSeleccionado.inicio_contrato} {localSeleccionado.fin_contrato ? `hasta ${localSeleccionado.fin_contrato}` : '(Continuo)'}
                </span>
              </div>

              {localSeleccionado.notas_admin && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '6px', marginTop: '4px', fontSize: '11.5px', color: '#cbd5e1', fontStyle: 'italic' }}>
                  📝 <strong>Observaciones Admin:</strong> {localSeleccionado.notas_admin}
                </div>
              )}
            </div>

            {/* Aviso informativo de transparencia */}
            <div style={{
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '11.5px',
              color: '#7dd3fc',
              lineHeight: 1.45,
              marginBottom: '16px'
            }}>
              ℹ️ <strong>Transparencia para la comunidad:</strong> La cuota y pagos de este local se consolidan en la emisión mensual de recibos de condominio bajo el concepto <em>"Donación por uso de espacios exclusivos"</em>.
            </div>

            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={() => setLocalSeleccionado(null)}
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Cerrar Ficha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocalesResidente
