import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import {
  DeudaMoraItem,
  TASA_RIESGO_CONFIG,
  ACCION_LEGAL_CONFIG,
  obtenerDeudasMora,
  obtenerPisoApto
} from '../../data/moraService'

export { obtenerPisoApto }

export const ListaMoraResidente: React.FC = () => {
  const { perfil, config } = useAuth()
  const navigate = useNavigate()
  const totalPisos = (config as any)?.total_pisos ?? 10
  const tienePh = (config as any)?.tiene_ph ?? true
  const totalPh = (config as any)?.total_ph ?? 2

  const pisosOpciones = useMemo(() => {
    const list: { key: string; label: string }[] = []
    for (let i = 1; i <= totalPisos; i++) {
      list.push({ key: String(i), label: `Piso ${i}` })
    }
    if (tienePh && totalPh > 0) {
      list.push({ key: 'PH', label: 'PH' })
    }
    list.push({ key: 'todos', label: 'Todos' })
    return list
  }, [totalPisos, tienePh, totalPh])

  const [deudas, setDeudas] = useState<DeudaMoraItem[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros: por defecto inicia en Piso 1 para no cargar los 62 departamentos de golpe
  const [filtroPiso, setFiltroPiso] = useState<string>('1')
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState<string>('')
  const [modalPagoOpen, setModalPagoOpen] = useState<boolean>(false)

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

  // Piso del residente
  const miPiso = useMemo(() => {
    if (miDeuda) return obtenerPisoApto(miDeuda.apartamento_numero, miDeuda.piso)
    if (miAptoNumero) return obtenerPisoApto(String(miAptoNumero))
    return null
  }, [miDeuda, miAptoNumero])

  // Conteo de deudores por cada piso
  const conteoPorPiso = useMemo(() => {
    const map: Record<string, number> = {}
    for (let i = 1; i <= totalPisos; i++) {
      map[String(i)] = 0
    }
    if (tienePh && totalPh > 0) {
      map['PH'] = 0
    }
    deudas.forEach(d => {
      const p = obtenerPisoApto(d.apartamento_numero, d.piso)
      if (map[p] !== undefined) {
        map[p]++
      }
    })
    return map
  }, [deudas, totalPisos, tienePh, totalPh])

  // Estado de búsqueda activa
  const isSearching = busqueda.trim().length > 0

  // Filtrado masivo por piso, riesgo y búsqueda
  const deudasFiltradas = useMemo(() => {
    return deudas.filter(d => {
      // 1. Si hay texto de búsqueda, busca globalmente en todos los apartamentos
      if (isSearching) {
        const q = busqueda.toLowerCase().trim()
        const matchApto = (d.apartamento_numero || '').toLowerCase().includes(q)
        const matchConceptos = (d.conceptos_detalle || '').toLowerCase().includes(q)
        if (!matchApto && !matchConceptos) return false
      } else {
        // 2. Filtro masivo por piso (1 al PH)
        if (filtroPiso !== 'todos') {
          const pisoItem = obtenerPisoApto(d.apartamento_numero, d.piso)
          if (pisoItem !== filtroPiso) return false
        }
      }

      // 3. Filtro por nivel de riesgo
      if (filtroRiesgo !== 'todos' && d.tasa_riesgo !== filtroRiesgo) return false

      return true
    })
  }, [deudas, isSearching, busqueda, filtroPiso, filtroRiesgo])

  // Total USD filtrado actualmente
  const totalFiltradoUsd = useMemo(() => {
    return deudasFiltradas.reduce((acc, d) => acc + (d.monto_usd || 0), 0)
  }, [deudasFiltradas])

  // Estadísticas globales para los indicadores superiores
  const stats = useMemo(() => {
    let totalUsd = 0
    let totalBs = 0
    let azul = 0
    let amarillo = 0
    let rojo = 0
    let morado = 0

    deudas.forEach(d => {
      totalUsd += d.monto_usd || 0
      totalBs += d.monto_bs || 0
      if (d.tasa_riesgo === 'azul') azul++
      else if (d.tasa_riesgo === 'amarillo') amarillo++
      else if (d.tasa_riesgo === 'rojo') rojo++
      else if (d.tasa_riesgo === 'morado') morado++
    })

    return { totalAptos: deudas.length, totalUsd, totalBs, azul, amarillo, rojo, morado }
  }, [deudas])

  return (
    <div style={{ padding: '20px 16px', maxWidth: '1000px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
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

      {/* Botón de regreso */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8',
          padding: '7px 12px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '16px',
          transition: 'all 0.18s'
        }}
        title="Volver al inicio"
      >
        <span style={{ fontSize: '16px' }}>←</span>
        <span>Inicio</span>
      </button>

      {/* HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>📋</span>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            Lista Comunitaria de Deudores y Morosidad
          </h1>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
          Publicación de cuentas al cobro y morosidad comunitaria para máxima transparencia según acuerdos de asamblea.
        </p>
      </div>

      {/* BANNER ALERTA SI MI APARTAMENTO ESTÁ EN MORA */}
      {miDeuda && (
        <div style={{
          background: miDeuda.tasa_riesgo === 'azul'
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(37, 99, 235, 0.22) 100%)'
            : 'linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(239, 68, 68, 0.22) 100%)',
          border: `2px solid ${miDeuda.tasa_riesgo === 'azul' ? '#3b82f6' : '#a855f7'}`,
          borderRadius: '16px', padding: '16px 18px', marginBottom: '22px',
          boxShadow: miDeuda.tasa_riesgo === 'azul' ? '0 8px 30px rgba(59, 130, 246, 0.25)' : '0 8px 30px rgba(168, 85, 247, 0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: 1 }}>
            <div style={{
              width: '46px', height: '46px', borderRadius: '14px',
              background: miDeuda.tasa_riesgo === 'azul' ? '#2563eb' : '#a855f7', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0,
              boxShadow: miDeuda.tasa_riesgo === 'azul' ? '0 0 15px rgba(59, 130, 246, 0.5)' : '0 0 15px rgba(168,85,247,0.5)'
            }}>
              {miDeuda.tasa_riesgo === 'azul' ? '🔵' : '⚠️'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                  {miDeuda.tasa_riesgo === 'azul'
                    ? `Tu Apartamento (${miDeuda.apartamento_numero}) tiene el Recibo al Cobro`
                    : `Tu Apartamento (${miDeuda.apartamento_numero}) figura en Mora`}
                </span>
                {(() => {
                  const miCfg = TASA_RIESGO_CONFIG[miDeuda.tasa_riesgo] || TASA_RIESGO_CONFIG.azul
                  return (
                    <span style={{
                      fontSize: '10px', fontWeight: 800,
                      color: miCfg.color,
                      background: miCfg.bg,
                      border: `1px solid ${miCfg.border}`,
                      padding: '2px 8px', borderRadius: '999px'
                    }}>
                      {miCfg.badgeText}
                    </span>
                  )
                })()}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4 }}>
                {miDeuda.tasa_riesgo === 'azul' ? (
                  <>
                    Tienes pendiente el <strong>recibo emitido del mes (&lt;1 mes)</strong> por un monto de{' '}
                    <strong style={{ color: '#60a5fa' }}>
                      ${miDeuda.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </strong>
                    {miDeuda.monto_bs > 0 && ` (Bs. ${miDeuda.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`}.
                  </>
                ) : (
                  <>
                    Registras <strong>{miDeuda.meses_deuda} meses de atraso</strong> por un total de{' '}
                    <strong style={{ color: 'var(--color-accent, #f97316)' }}>
                      ${miDeuda.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                    </strong>
                    {miDeuda.monto_bs > 0 && ` (Bs. ${miDeuda.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`}.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* BOTÓN SOLO DE REPORTAR PAGO PROPIO (SIN RECORDATORIOS A OTROS) */}
          <button
            type="button"
            onClick={() => setModalPagoOpen(true)}
            style={{
              background: miDeuda.tasa_riesgo === 'azul'
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%))',
              color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 20px',
              fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              boxShadow: miDeuda.tasa_riesgo === 'azul' ? '0 4px 15px rgba(37, 99, 235, 0.4)' : 'var(--color-brand-shadow, 0 4px 15px rgba(249, 115, 22, 0.4))',
              whiteSpace: 'nowrap'
            }}
          >
            💳 Reportar Mi Pago / Regularizar
          </button>
        </div>
      )}

      {/* STATS OVERVIEW - INDICADORES RESPONSIVOS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '10px',
        marginBottom: '18px'
      }}>
        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Aptos en Deuda</div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '3px' }}>{stats.totalAptos}</div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Por Cobrar</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-accent, #f97316)', marginTop: '3px' }}>
            ${stats.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{
          background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase' }}>🔵 Recibo Mes (&lt;1m)</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#60a5fa', marginTop: '3px' }}>{stats.azul}</div>
        </div>

        <div style={{
          background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#eab308', fontWeight: 700, textTransform: 'uppercase' }}>🟡 Moderado (3m)</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#eab308', marginTop: '3px' }}>{stats.amarillo}</div>
        </div>

        <div style={{
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>🔴 Alto (4-6m)</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginTop: '3px' }}>{stats.rojo}</div>
        </div>

        <div style={{
          background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#a855f7', fontWeight: 700, textTransform: 'uppercase' }}>🟣 Más Deudor (&gt;6m)</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#a855f7', marginTop: '3px' }}>{stats.morado}</div>
        </div>
      </div>

      {/* LEYENDA COMPACTA */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '12px', padding: '10px 14px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'
      }}>
        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>INDICADORES:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '11px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
            Azul: Recibo mes (&lt;1m)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#eab308' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} />
            Amarillo: 3 meses
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ef4444' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
            Rojo: 4-6 meses
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#a855f7' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} />
            Morado: &gt;6 meses (Crónico)
          </span>
        </div>
      </div>

      {/* ── BUSCADOR Y FILTROS MINIMALISTAS (VERSIÓN MÓVIL / DESKTOP) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '14px',
        flexWrap: 'nowrap'
      }}>
        {/* BUSCADOR CON LUPA MINIMALISTA */}
        <div style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center'
        }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            color: '#94a3b8',
            fontSize: '14px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center'
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Buscar apartamento..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: busqueda ? '10px 32px 10px 34px' : '10px 14px 10px 34px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* SELECTOR DE FILTRO DE RIESGO MINIMALISTA */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select
            value={filtroRiesgo}
            onChange={e => setFiltroRiesgo(e.target.value)}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              background: '#151922',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '10px 28px 10px 12px',
              color: filtroRiesgo === 'todos' ? '#94a3b8' : '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              maxWidth: '160px'
            }}
          >
            <option value="todos">⚡ Todos los estados</option>
            <option value="azul">🔵 Azul: Recibo mes</option>
            <option value="amarillo">🟡 Amarillo: 3 meses</option>
            <option value="rojo">🔴 Rojo: 4-6 meses</option>
            <option value="morado">🟣 Morado: &gt;6 meses</option>
          </select>
          <span style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            fontSize: '10px',
            color: '#94a3b8'
          }}>
            ▼
          </span>
        </div>
      </div>

      {/* ── FILTRO MASIVO POR PISO (1 AL PH) ── */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          fontSize: '11px',
          color: '#94a3b8',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <span>Filtrar por Piso (1 al PH)</span>
          {filtroPiso !== 'todos' && (
            <button
              type="button"
              onClick={() => setFiltroPiso('todos')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-accent, #f97316)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Ver todos los pisos
            </button>
          )}
        </div>

        {/* BARRA HORIZONTAL SCROLLABLE DE PISOS */}
        <div style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '6px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}>
          {pisosOpciones.map(p => {
            const active = filtroPiso === p.key
            const count = p.key === 'todos' ? deudas.length : (conteoPorPiso[p.key] || 0)
            const esMiPiso = miPiso === p.key

            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setFiltroPiso(p.key)
                  if (isSearching) setBusqueda('')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: active
                    ? 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: active
                    ? '1px solid var(--color-accent, #f97316)'
                    : esMiPiso
                    ? '1px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  color: active ? '#fff' : esMiPiso ? '#60a5fa' : '#cbd5e1',
                  padding: '7px 12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  boxShadow: active ? 'var(--color-brand-shadow, 0 2px 10px rgba(249, 115, 22, 0.35))' : 'none'
                }}
              >
                <span>{p.label}</span>
                <span style={{
                  fontSize: '10px',
                  background: active ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: active ? '#fff' : '#94a3b8',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontWeight: 700
                }}>
                  {count}
                </span>
                {esMiPiso && !active && (
                  <span style={{ fontSize: '9px', color: '#60a5fa' }} title="Tu piso">★</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* BANNER INFORMATIVO DEL FILTRO O BÚSQUEDA ACTUAL */}
      {isSearching ? (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
          border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
          borderRadius: '12px',
          marginBottom: '14px',
          fontSize: '12px',
          color: 'var(--color-accent, #f97316)'
        }}>
          <span>
            🔍 Resultados para &ldquo;<strong>{busqueda}</strong>&rdquo; en todos los pisos ({deudasFiltradas.length} encontrados)
          </span>
          <button
            type="button"
            onClick={() => setBusqueda('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent, #f97316)',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            Volver al Piso {filtroPiso}
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '9px 14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          marginBottom: '14px',
          fontSize: '12px'
        }}>
          <span style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏢</span>
            {filtroPiso === 'PH' ? 'Penthouse (PH)' : filtroPiso === 'todos' ? `Todos los Pisos (${config?.nombre_edificio || 'Edificio'})` : `Piso ${filtroPiso}`}
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
              ({deudasFiltradas.length} {deudasFiltradas.length === 1 ? 'apartamento' : 'apartamentos'})
            </span>
          </span>
          <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>
            ${totalFiltradoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </span>
        </div>
      )}

      {/* ── LISTADO DE APARTAMENTOS (SIN ACCIONES DE RECORDATORIO ENTRE RESIDENTES) ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '30px', marginBottom: '10px' }}>⏳</div>
          Cargando lista de morosidad...
        </div>
      ) : deudasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '50px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '16px', border: '1px dashed rgba(255, 255, 255, 0.1)', color: '#94a3b8'
        }}>
          <div style={{ fontSize: '30px', marginBottom: '8px' }}>🎉</div>
          No hay apartamentos con deuda para este criterio.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {deudasFiltradas.map(d => {
            const cfg = TASA_RIESGO_CONFIG[d.tasa_riesgo] || TASA_RIESGO_CONFIG.azul
            const accion = ACCION_LEGAL_CONFIG[d.accion_legal] || ACCION_LEGAL_CONFIG.notificacion_amistosa
            const esMiApto =
              miAptoNumero && d.apartamento_numero.trim().toUpperCase() === String(miAptoNumero).trim().toUpperCase()

            return (
              <div
                key={d.id}
                style={{
                  background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                  border: esMiApto ? `2px solid ${cfg.color}` : `1px solid ${cfg.border}`,
                  borderLeft: `5px solid ${cfg.color}`,
                  borderRadius: '14px', padding: '14px 16px',
                  boxShadow: esMiApto ? `0 0 20px ${cfg.color}35` : '0 4px 16px rgba(0,0,0,0.3)',
                  display: 'flex', flexDirection: 'column', gap: '10px'
                }}
              >
                {/* CABECERA DE LA TARJETA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '10px',
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', fontWeight: 800, color: cfg.color, flexShrink: 0
                    }}>
                      {d.tasa_riesgo === 'azul' ? '🔵' : d.tasa_riesgo === 'morado' ? '🟣' : d.tasa_riesgo === 'rojo' ? '🔴' : '🟡'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                          Apartamento {d.apartamento_numero}
                        </span>

                        {esMiApto && (
                          <span style={{
                            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase',
                            background: cfg.color, color: '#fff', padding: '2px 7px', borderRadius: '999px'
                          }}>
                            Mi Apartamento
                          </span>
                        )}

                        <span style={{
                          fontSize: '10px', fontWeight: 800, color: cfg.color,
                          background: cfg.bg, border: `1px solid ${cfg.border}`,
                          padding: '2px 7px', borderRadius: '6px'
                        }}>
                          {cfg.badgeText}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Retraso: <strong style={{ color: '#e2e8f0' }}>{d.tasa_riesgo === 'azul' ? 'Recibo del mes emitido (<1m)' : `${d.meses_deuda} meses impagos`}</strong>
                        {d.fecha_corte && <span> · Corte: {d.fecha_corte}</span>}
                      </div>
                    </div>
                  </div>

                  {/* MONTOS EN USD Y BS */}
                  <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                      ${d.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span style={{ fontSize: '11px', color: 'var(--color-accent, #f97316)', marginLeft: '4px', fontWeight: 700 }}>USD</span>
                    </div>
                    {d.monto_bs > 0 && (
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#eab308' }}>
                        Bs. {d.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>

                {/* CONCEPTO Y ESTADO DE CONDOMINIO (SIN BOTONES DE RECORDATORIOS PARA RESIDENTES) */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.25)', borderRadius: '10px',
                  padding: '8px 12px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '11px'
                }}>
                  <div style={{ color: '#94a3b8', flex: 1, minWidth: '180px' }}>
                    {d.conceptos_detalle || 'Cuotas de condominio ordinarias impagas'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#d8b4fe', fontWeight: 600 }}>
                      <span>{accion.icono}</span>
                      <span>{accion.titulo}</span>
                    </div>

                    {/* Si es el apartamento propio del usuario, puede reportar su pago */}
                    {esMiApto && (
                      <button
                        type="button"
                        onClick={() => setModalPagoOpen(true)}
                        style={{
                          background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
                          border: 'none', color: '#fff', borderRadius: '6px',
                          padding: '4px 10px', fontSize: '11px', fontWeight: 800,
                          cursor: 'pointer', transition: 'all 0.15s ease'
                        }}
                      >
                        💳 Reportar Mi Pago
                      </button>
                    )}
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
