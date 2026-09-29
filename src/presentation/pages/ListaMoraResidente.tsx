import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import {
  DeudaMoraItem,
  TasaRiesgoMora,
  TASA_RIESGO_CONFIG,
  ACCION_LEGAL_CONFIG,
  obtenerDeudasMora
} from '../../data/moraService'

export const ListaMoraResidente: React.FC = () => {
  const { perfil } = useAuth()
  const [deudas, setDeudas] = useState<DeudaMoraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalPagoOpen, setModalPagoOpen] = useState(false)

  const miAptoNumero = (perfil as any)?.apartamento?.numero || perfil?.apartamento_id || ''
  const miAptoId = perfil?.apartamento_id || ''

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await obtenerDeudasMora()
      setDeudas(res.data || [])
    } catch (err) {
      console.warn('[ListaMoraResidente] Error cargando lista:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Verificar si mi apartamento está en la lista de mora
  const miDeuda = useMemo(() => {
    if (!miAptoNumero) return null
    const cleanMiApto = String(miAptoNumero).trim().toUpperCase()
    return deudas.find(
      d =>
        d.apartamento_numero.trim().toUpperCase() === cleanMiApto ||
        d.apartamento_id === miAptoId
    ) || null
  }, [deudas, miAptoNumero, miAptoId])

  // Filtrado
  const deudasFiltradas = useMemo(() => {
    return deudas.filter(d => {
      if (filtroRiesgo !== 'todos' && d.tasa_riesgo !== filtroRiesgo) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchApto = (d.apartamento_numero || '').toLowerCase().includes(q)
        const matchConceptos = (d.conceptos_detalle || '').toLowerCase().includes(q)
        if (!matchApto && !matchConceptos) return false
      }
      return true
    })
  }, [deudas, filtroRiesgo, busqueda])

  // Totales
  const stats = useMemo(() => {
    let totalUsd = 0
    let totalBs = 0
    let amarillo = 0
    let rojo = 0
    let morado = 0

    deudas.forEach(d => {
      totalUsd += d.monto_usd || 0
      totalBs += d.monto_bs || 0
      if (d.tasa_riesgo === 'amarillo') amarillo++
      else if (d.tasa_riesgo === 'rojo') rojo++
      else if (d.tasa_riesgo === 'morado') morado++
    })

    return { totalAptos: deudas.length, totalUsd, totalBs, amarillo, rojo, morado }
  }, [deudas])

  return (
    <div style={{ padding: '24px 20px', maxWidth: '1000px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* MODAL REPORTAR PAGO */}
      {modalPagoOpen && (
        <ReportarPagoModal
          apartamentoId={miAptoId}
          onClose={() => setModalPagoOpen(false)}
          onSuccess={() => {
            setModalPagoOpen(false)
            cargarDatos()
          }}
        />
      )}

      {/* HEADER */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>📋</span>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            Lista Comunitaria de Mora (&gt;3 Meses)
          </h1>
        </div>
        <p style={{ color: '#888', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
          Por disposición de la Junta de Condominio y asamblea de copropietarios, se publica el estado de morosidad extendida por apartamento para transparencia comunitaria.
        </p>
      </div>

      {/* BANNER ALERTA SI MI APARTAMENTO ESTÁ EN MORA */}
      {miDeuda && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(239, 68, 68, 0.22) 100%)',
          border: '2px solid #a855f7',
          borderRadius: '20px', padding: '20px 24px', marginBottom: '28px',
          boxShadow: '0 8px 30px rgba(168, 85, 247, 0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '16px',
              background: '#a855f7', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px', flexShrink: 0, boxShadow: '0 0 15px rgba(168,85,247,0.5)'
            }}>
              ⚠️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                  Tu Apartamento (Apto {miDeuda.apartamento_numero}) figura en la Lista de Mora
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 800,
                  color: TASA_RIESGO_CONFIG[miDeuda.tasa_riesgo].color,
                  background: TASA_RIESGO_CONFIG[miDeuda.tasa_riesgo].bg,
                  border: `1px solid ${TASA_RIESGO_CONFIG[miDeuda.tasa_riesgo].border}`,
                  padding: '2px 8px', borderRadius: '999px'
                }}>
                  {TASA_RIESGO_CONFIG[miDeuda.tasa_riesgo].badgeText}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#e2e8f0' }}>
                Registras <strong>{miDeuda.meses_deuda} meses de atraso</strong> por un monto de{' '}
                <strong style={{ color: '#f97316' }}>
                  ${miDeuda.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </strong>
                {miDeuda.monto_bs > 0 && ` (Bs. ${miDeuda.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`}.
                {' '}Estatus actual: <em>{ACCION_LEGAL_CONFIG[miDeuda.accion_legal]?.titulo}</em>.
              </p>
            </div>
          </div>

          <button
            onClick={() => setModalPagoOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%)',
              color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 22px',
              fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)', whiteSpace: 'nowrap'
            }}
          >
            💳 Reportar Pago / Regularizar
          </button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Apartamentos en Mora</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>{stats.totalAptos}</div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Mora Total Edificio</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f97316', marginTop: '4px' }}>
            ${stats.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{
          background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)',
          borderRadius: '16px', padding: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#eab308', fontWeight: 700, textTransform: 'uppercase' }}>🟡 Moderado (3m)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#eab308', marginTop: '4px' }}>{stats.amarillo}</div>
        </div>

        <div style={{
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '16px', padding: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>🔴 Alto Riesgo (4-6m)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>{stats.rojo}</div>
        </div>

        <div style={{
          background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: '16px', padding: '16px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase' }}>🟣 Más Deudor (&gt;6m)</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#a855f7', marginTop: '4px' }}>{stats.morado}</div>
        </div>
      </div>

      {/* LEYENDA DE INDICADORES */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '14px', padding: '12px 16px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px'
      }}>
        <span style={{ fontSize: '11px', color: '#888', fontWeight: 700 }}>INDICADORES:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#eab308' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }} />
            Amarillo: 3 meses de mora
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
            Rojo: 4 a 6 meses de mora
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a855f7' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#a855f7' }} />
            Morado: Más de 6 meses (El más deudor)
          </span>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#777' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por número de apartamento (ej: 504, 5PH2)..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff',
              padding: '10px 14px 10px 36px', borderRadius: '12px', fontSize: '13px', outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'amarillo', label: '🟡 Amarillo' },
            { key: 'rojo', label: '🔴 Rojo' },
            { key: 'morado', label: '🟣 Morado' }
          ].map(f => {
            const active = filtroRiesgo === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFiltroRiesgo(f.key)}
                style={{
                  background: active ? '#f97316' : 'rgba(255, 255, 255, 0.05)',
                  border: active ? '1px solid #f97316' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: active ? '#000' : '#ccc',
                  padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: active ? 800 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* LIST ITEMS */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: '30px', marginBottom: '10px' }}>⏳</div>
          Cargando lista de morosidad...
        </div>
      ) : deudasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.1)', color: '#888'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
          No hay apartamentos morosos con este filtro.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {deudasFiltradas.map(d => {
            const cfg = TASA_RIESGO_CONFIG[d.tasa_riesgo]
            const accion = ACCION_LEGAL_CONFIG[d.accion_legal]
            const esMiApto =
              miAptoNumero && d.apartamento_numero.trim().toUpperCase() === String(miAptoNumero).trim().toUpperCase()

            return (
              <div
                key={d.id}
                style={{
                  background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                  border: esMiApto ? `2px solid #a855f7` : `1px solid ${cfg.border}`,
                  borderLeft: `5px solid ${cfg.color}`,
                  borderRadius: '16px', padding: '16px 20px',
                  boxShadow: esMiApto ? '0 0 20px rgba(168,85,247,0.3)' : `0 4px 16px rgba(0,0,0,0.3)`,
                  display: 'flex', flexDirection: 'column', gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: cfg.color
                    }}>
                      {d.tasa_riesgo === 'morado' ? '🟣' : d.tasa_riesgo === 'rojo' ? '🔴' : '🟡'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                          Apartamento {d.apartamento_numero}
                        </span>

                        {esMiApto && (
                          <span style={{
                            fontSize: '10px', fontWeight: 900, textTransform: 'uppercase',
                            background: '#a855f7', color: '#fff', padding: '2px 8px', borderRadius: '999px'
                          }}>
                            Mi Apartamento
                          </span>
                        )}

                        <span style={{
                          fontSize: '11px', fontWeight: 800, color: cfg.color,
                          background: cfg.bg, border: `1px solid ${cfg.border}`,
                          padding: '2px 8px', borderRadius: '6px'
                        }}>
                          {cfg.badgeText}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                        Retraso: <strong style={{ color: '#ccc' }}>{d.meses_deuda} meses impagos</strong>
                        {d.fecha_corte && <span> · Corte: {d.fecha_corte}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Montos */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
                      ${d.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span style={{ fontSize: '11px', color: '#f97316', marginLeft: '4px', fontWeight: 700 }}>USD</span>
                    </div>
                    {d.monto_bs > 0 && (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eab308' }}>
                        Bs. {d.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Concepto & Estado legal */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px',
                  padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '12px'
                }}>
                  <div style={{ color: '#aaa', flex: 1, minWidth: '200px' }}>
                    {d.conceptos_detalle || 'Cuotas de condominio ordinarias impagas'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d8b4fe', fontWeight: 600 }}>
                    <span>{accion.icono}</span>
                    <span>{accion.titulo}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
