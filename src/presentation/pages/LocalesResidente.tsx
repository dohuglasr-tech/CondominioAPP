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

  const otrosLocales = useMemo(() => {
    return locales.filter(l => !misLocales.includes(l))
  }, [locales, misLocales])

  // Total deuda del residente en sus locales asignados
  const totalDeudaMisLocalesUsd = misLocales.reduce((acc, l) => acc + (Number(l.deuda_actual_usd) || 0), 0)
  const totalDeudaMisLocalesBs = misLocales.reduce((acc, l) => acc + (Number(l.deuda_actual_bs) || 0), 0)

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px 80px', color: '#fff' }}>
      {/* Encabezado */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '28px' }}>🏢</span>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>
            Locales y Espacios Exclusivos
          </h1>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13.5px', margin: 0, lineHeight: 1.5 }}>
          Información sobre los locales comerciales y áreas de uso exclusivo del condominio. La cuota y deuda correspondiente a estos espacios se refleja en tu recibo de condominio como <strong>"Donación por uso de espacios exclusivos"</strong>.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <p>Consultando registros de locales...</p>
        </div>
      ) : (
        <>
          {/* SECCIÓN 1: MIS LOCALES ASIGNADOS */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔑</span>
                <span>Locales Asignados a mi Apartamento {aptoNumero ? `(#${aptoNumero})` : ''}</span>
              </h2>

              {misLocales.length > 0 && (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  backgroundColor: totalDeudaMisLocalesUsd > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                  color: totalDeudaMisLocalesUsd > 0 ? '#ef4444' : '#4ade80',
                  border: `1px solid ${totalDeudaMisLocalesUsd > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
                }}>
                  {totalDeudaMisLocalesUsd > 0
                    ? `Deuda Total: $${fmtUsd(totalDeudaMisLocalesUsd)} USD (Bs. ${fmtBs(totalDeudaMisLocalesBs)})`
                    : '100% Solvente'}
                </span>
              )}
            </div>

            {misLocales.length === 0 ? (
              <div style={{
                backgroundColor: '#0c121e',
                border: '1px dashed #1e293b',
                borderRadius: '12px',
                padding: '24px 20px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏠</div>
                <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  Sin locales asignados
                </div>
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Tu apartamento no tiene ningún local comercial o espacio exclusivo asignado por la administración. No mantienes deudas por este concepto.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {misLocales.map(loc => {
                  const tieneDeuda = (Number(loc.deuda_actual_usd) || 0) > 0
                  return (
                    <div
                      key={loc.id}
                      style={{
                        backgroundColor: '#0c121e',
                        border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.35)'}`,
                        borderRadius: '14px',
                        padding: '18px 20px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
                      }}
                    >
                      {/* Cabecera Local */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🏬</span>
                            <span>{loc.nombre}</span>
                          </div>
                          {loc.codigo && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, backgroundColor: '#172236', padding: '1px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                              Código: {loc.codigo}
                            </span>
                          )}
                        </div>

                        <span style={{
                          padding: '3px 9px',
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

                      {/* Info Básica: Arrendatario y Apartamento Asignado */}
                      <div style={{ backgroundColor: '#131b2c', borderRadius: '10px', padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>Apartamento Asignado:</span>
                          <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>Apto #{loc.apartamento_numero || aptoNumero}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>Arrendatario / Titular:</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{loc.arrendatario_nombre}</span>
                        </div>

                        {loc.arrendatario_telefono && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Contacto:</span>
                            <span style={{ color: '#94a3b8' }}>{loc.arrendatario_telefono}</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>Modalidad:</span>
                          <span style={{ color: '#fb923c', fontWeight: 700, textTransform: 'capitalize' }}>Cuota {loc.tipo_cuota}</span>
                        </div>
                      </div>

                      {/* Monto Mensual y Estado de Deuda */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                        marginBottom: '14px'
                      }}>
                        <div style={{ backgroundColor: '#172236', borderRadius: '8px', padding: '10px' }}>
                          <div style={{ color: '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                            Cuota Mensual
                          </div>
                          <div style={{ color: '#38bdf8', fontSize: '16px', fontWeight: 900 }}>
                            ${fmtUsd(loc.monto_usd)} USD
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                            Bs. {fmtBs(loc.monto_bs || (loc.monto_usd * (tasaBcv || 859.06)))}
                          </div>
                        </div>

                        <div style={{
                          backgroundColor: tieneDeuda ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                          border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.25)'}`,
                          borderRadius: '8px',
                          padding: '10px'
                        }}>
                          <div style={{ color: tieneDeuda ? '#f87171' : '#4ade80', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                            {tieneDeuda ? '⚠️ Tiene Deuda' : '✅ Solvente'}
                          </div>
                          <div style={{ color: tieneDeuda ? '#ef4444' : '#4ade80', fontSize: '16px', fontWeight: 900 }}>
                            {tieneDeuda ? `$${fmtUsd(loc.deuda_actual_usd)} USD` : '$0.00'}
                          </div>
                          <div style={{ color: tieneDeuda ? '#fca5a5' : '#86efac', fontSize: '11px' }}>
                            {tieneDeuda ? `Bs. ${fmtBs(loc.deuda_actual_bs || (loc.deuda_actual_usd * (tasaBcv || 859.06)))}` : 'Sin saldo pendiente'}
                          </div>
                        </div>
                      </div>

                      {/* Alerta de recibo */}
                      <div style={{
                        backgroundColor: 'rgba(249, 115, 22, 0.08)',
                        border: '1px solid rgba(249, 115, 22, 0.2)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '11.5px',
                        color: '#fdba74',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span>ℹ️</span>
                        <span>
                          Este canon aparece en tu recibo bajo el concepto <strong>"Donación por uso de espacios exclusivos"</strong>.
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* SECCIÓN 2: DIRECTORIO DE LOCALES DEL EDIFICIO */}
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📋</span>
              <span>Directorio de Locales y Espacios del Edificio</span>
            </h2>

            {otrosLocales.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px' }}>
                No hay otros locales registrados en el edificio.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', backgroundColor: '#0c121e', border: '1px solid #1e293b', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#111726' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Espacio / Local</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Rubro / Uso</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Arrendatario</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Apto Asignado</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otrosLocales.map((loc, idx) => (
                      <tr key={loc.id} style={{ borderBottom: '1px solid #172236', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#fff' }}>
                          🏢 {loc.nombre}
                          {loc.codigo && <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '11px' }}>({loc.codigo})</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                          {loc.descripcion || 'Comercial'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                          {loc.arrendatario_nombre}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {loc.apartamento_numero ? (
                            <span style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'var(--color-accent, #f97316)', border: '1px solid rgba(249, 115, 22, 0.25)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              #{loc.apartamento_numero}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '11px' }}>Común</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: loc.estado === 'activo' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                            color: loc.estado === 'activo' ? '#4ade80' : '#94a3b8'
                          }}>
                            {loc.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
export default LocalesResidente
