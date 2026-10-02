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

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

  // Filtros principales
  const [filtroEstado, setFiltroEstado] = useState<'con_deuda' | 'solventes' | 'todos'>('con_deuda')
  const [filtroPiso, setFiltroPiso] = useState<string>('todos')
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState<string>('')
  const [modalPagoOpen, setModalPagoOpen] = useState<boolean>(false)

  const miAptoNumero = (perfil as any)?.apartamento?.numero || perfil?.apartamento_id || ''
  const miAptoId = perfil?.apartamento_id || ''

  const cargarDatos = useCallback(async (force = false) => {
    setLoading(true)
    try {
      // Cargar todos los apartamentos (incluyendo solventes para transparencia total)
      const res = await obtenerDeudasMora(force, true)
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

  // Verificar si mi apartamento está en la lista y si tiene deuda
  const miDeuda = useMemo(() => {
    if (!miAptoNumero) return null
    const cleanMiApto = String(miAptoNumero).trim().toUpperCase()
    return deudas.find(
      d =>
        d.apartamento_numero.trim().toUpperCase() === cleanMiApto ||
        d.apartamento_id === miAptoId
    ) || null
  }, [deudas, miAptoNumero, miAptoId])

  const miTieneDeuda = useMemo(() => {
    if (!miDeuda) return false
    return (miDeuda.monto_usd || 0) > 0.01 || (miDeuda.monto_bs || 0) > 0.01 || miDeuda.estado === 'activo'
  }, [miDeuda])

  // Piso del residente
  const miPiso = useMemo(() => {
    if (miDeuda) return obtenerPisoApto(miDeuda.apartamento_numero, miDeuda.piso, totalPisos)
    if (miAptoNumero) return obtenerPisoApto(String(miAptoNumero), undefined, totalPisos)
    return null
  }, [miDeuda, miAptoNumero, totalPisos])

  // Conteo de apartamentos con deuda por cada piso
  const conteoPorPiso = useMemo(() => {
    const map: Record<string, number> = {}
    for (let i = 1; i <= totalPisos; i++) {
      map[String(i)] = 0
    }
    if (tienePh && totalPh > 0) {
      map['PH'] = 0
    }
    deudas.forEach(d => {
      const tieneD = (d.monto_usd || 0) > 0.01 || (d.monto_bs || 0) > 0.01 || d.estado === 'activo'
      if (tieneD) {
        const p = obtenerPisoApto(d.apartamento_numero, d.piso, totalPisos)
        if (map[p] !== undefined) {
          map[p]++
        }
      }
    })
    return map
  }, [deudas, totalPisos, tienePh, totalPh])

  // Conteo global de estados
  const conteoEstados = useMemo(() => {
    let conDeudaCount = 0
    let solventesCount = 0
    deudas.forEach(d => {
      const tieneD = (d.monto_usd || 0) > 0.01 || (d.monto_bs || 0) > 0.01 || d.estado === 'activo'
      if (tieneD) conDeudaCount++
      else solventesCount++
    })
    return { conDeudaCount, solventesCount, total: deudas.length }
  }, [deudas])

  // Estado de búsqueda activa
  const isSearching = busqueda.trim().length > 0

  // Filtrado consolidado
  const deudasFiltradas = useMemo(() => {
    return deudas.filter(d => {
      const tieneD = (d.monto_usd || 0) > 0.01 || (d.monto_bs || 0) > 0.01 || d.estado === 'activo'

      // 1. Filtro por Estado (Con Deuda / Solventes / Todos)
      if (filtroEstado === 'con_deuda' && !tieneD) return false
      if (filtroEstado === 'solventes' && tieneD) return false

      // 2. Si hay texto de búsqueda, busca globalmente en todos los apartamentos
      if (isSearching) {
        const q = busqueda.toLowerCase().trim()
        const matchApto = (d.apartamento_numero || '').toLowerCase().includes(q)
        const matchProp = (d.propietario_nombre || '').toLowerCase().includes(q)
        const matchConceptos = (d.conceptos_detalle || '').toLowerCase().includes(q)
        const matchItems = d.desglose?.items.some(it => it.label.toLowerCase().includes(q)) ?? false
        if (!matchApto && !matchProp && !matchConceptos && !matchItems) return false
      } else {
        // 3. Filtro masivo por piso (1 al PH)
        if (filtroPiso !== 'todos') {
          const pisoItem = obtenerPisoApto(d.apartamento_numero, d.piso, totalPisos)
          if (pisoItem !== filtroPiso) return false
        }
      }

      // 4. Filtro por nivel de riesgo (solo aplica para apartamentos con deuda)
      if (filtroRiesgo !== 'todos' && tieneD && d.tasa_riesgo !== filtroRiesgo) return false

      return true
    })
  }, [deudas, filtroEstado, isSearching, busqueda, filtroPiso, filtroRiesgo, totalPisos])

  // Totales acumulados de la vista actual
  const totalesFiltrados = useMemo(() => {
    let usd = 0
    let bs = 0
    deudasFiltradas.forEach(d => {
      usd += d.monto_usd || 0
      bs += d.monto_bs || 0
    })
    return { usd, bs }
  }, [deudasFiltradas])

  // Estadísticas globales para los indicadores superiores
  const stats = useMemo(() => {
    let totalUsd = 0
    let totalBs = 0
    let azul = 0
    let amarillo = 0
    let rojo = 0
    let morado = 0
    let aptosConDeuda = 0
    let aptosSolventes = 0

    deudas.forEach(d => {
      const tieneD = (d.monto_usd || 0) > 0.01 || (d.monto_bs || 0) > 0.01 || d.estado === 'activo'
      if (tieneD) {
        aptosConDeuda++
        totalUsd += d.monto_usd || 0
        totalBs += d.monto_bs || 0
        if (d.tasa_riesgo === 'azul') azul++
        else if (d.tasa_riesgo === 'amarillo') amarillo++
        else if (d.tasa_riesgo === 'rojo') rojo++
        else if (d.tasa_riesgo === 'morado') morado++
      } else {
        aptosSolventes++
      }
    })

    return { totalAptos: deudas.length, aptosConDeuda, aptosSolventes, totalUsd, totalBs, azul, amarillo, rojo, morado }
  }, [deudas])

  return (
    <div style={{ padding: '20px 16px', maxWidth: '1040px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* MODAL REPORTAR PAGO */}
      {modalPagoOpen && (
        <ReportarPagoModal
          apartamentoId={miAptoId}
          onClose={() => setModalPagoOpen(false)}
          onSuccess={() => {
            setModalPagoOpen(false)
            cargarDatos(true)
          }}
        />
      )}

      {/* Botón de regreso */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
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
            transition: 'all 0.18s'
          }}
          title="Volver al inicio"
        >
          <span style={{ fontSize: '16px' }}>←</span>
          <span>Inicio</span>
        </button>

        <button
          onClick={() => cargarDatos(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cbd5e1',
            padding: '7px 12px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          title="Recargar datos actualizados"
        >
          <span>🔄</span>
          <span>Actualizar</span>
        </button>
      </div>

      {/* HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>📋</span>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            Cartelera de Morosidad y Cuentas por Cobrar
          </h1>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
          Transparencia comunitaria total: consulta los saldos exactos hasta el último centavo, recibos mensuales y cuotas extraordinarias del 2025 de cada apartamento.
        </p>
      </div>

      {/* BANNER ALERTA SI MI APARTAMENTO ESTÁ EN MORA O AL DÍA */}
      {miDeuda && miTieneDeuda && (
        <div style={{
          background: miDeuda.tasa_riesgo === 'azul'
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(37, 99, 235, 0.22) 100%)'
            : 'linear-gradient(135deg, rgba(168, 85, 247, 0.22) 0%, rgba(239, 68, 68, 0.22) 100%)',
          border: `2px solid ${miDeuda.tasa_riesgo === 'azul' ? '#3b82f6' : '#a855f7'}`,
          borderRadius: '16px', padding: '18px 20px', marginBottom: '22px',
          boxShadow: miDeuda.tasa_riesgo === 'azul' ? '0 8px 30px rgba(59, 130, 246, 0.25)' : '0 8px 30px rgba(168, 85, 247, 0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: 1 }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
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
                    : `Tu Apartamento (${miDeuda.apartamento_numero}) registra Deuda Pendiente`}
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

              <div style={{ margin: '6px 0 0', fontSize: '13px', color: '#f1f5f9', lineHeight: 1.4 }}>
                Saldo adeudado:{' '}
                {miDeuda.monto_usd > 0 && (
                  <strong style={{ color: '#60a5fa', fontSize: '14px' }}>
                    ${fmtUsd(miDeuda.monto_usd)} USD
                  </strong>
                )}
                {miDeuda.monto_usd > 0 && miDeuda.monto_bs > 0 && <span> + </span>}
                {miDeuda.monto_bs > 0 && (
                  <strong style={{ color: '#facc15', fontSize: '14px' }}>
                    Bs. {fmtBs(miDeuda.monto_bs)}
                  </strong>
                )}
                <span style={{ color: '#cbd5e1', fontSize: '12px' }}> ({miDeuda.meses_deuda} conceptos/meses pendientes)</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalPagoOpen(true)}
            style={{
              background: miDeuda.tasa_riesgo === 'azul'
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%)',
              color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 20px',
              fontSize: '13px', fontWeight: 800, cursor: 'pointer',
              boxShadow: miDeuda.tasa_riesgo === 'azul' ? '0 4px 15px rgba(37, 99, 235, 0.4)' : '0 4px 15px rgba(249, 115, 22, 0.4)',
              whiteSpace: 'nowrap'
            }}
          >
            💳 Reportar Mi Pago / Regularizar
          </button>
        </div>
      )}

      {/* STATS OVERVIEW - INDICADORES CONSOLIDADOS */}
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
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '3px', color: '#f87171' }}>
            {stats.aptosConDeuda} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>/ {stats.totalAptos}</span>
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Por Cobrar ($)</div>
          <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--color-accent, #f97316)', marginTop: '3px' }}>
            ${fmtUsd(stats.totalUsd)}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Por Cobrar (Bs.)</div>
          <div style={{ fontSize: '19px', fontWeight: 800, color: '#facc15', marginTop: '3px' }}>
            Bs. {fmtBs(stats.totalBs)}
          </div>
        </div>

        <div style={{
          background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>✨ Solventes</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80', marginTop: '3px' }}>
            {stats.aptosSolventes}
          </div>
        </div>

        <div style={{
          background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase' }}>🔵 Recibo Mes</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#60a5fa', marginTop: '3px' }}>{stats.azul}</div>
        </div>

        <div style={{
          background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: '14px', padding: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase' }}>🟣 Deudores Crónicos</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#c084fc', marginTop: '3px' }}>{stats.morado}</div>
        </div>
      </div>

      {/* ── TABS DE VISTA: CON DEUDA / SOLVENTES / TODOS ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px',
        padding: '4px',
        marginBottom: '14px',
        overflowX: 'auto'
      }}>
        <button
          type="button"
          onClick={() => setFiltroEstado('con_deuda')}
          style={{
            flex: 1,
            minWidth: '130px',
            padding: '9px 14px',
            borderRadius: '10px',
            border: 'none',
            background: filtroEstado === 'con_deuda'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'transparent',
            color: filtroEstado === 'con_deuda' ? '#fff' : '#94a3b8',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s'
          }}
        >
          <span>⚡ Con Deuda</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: filtroEstado === 'con_deuda' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.08)'
          }}>
            {conteoEstados.conDeudaCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFiltroEstado('solventes')}
          style={{
            flex: 1,
            minWidth: '130px',
            padding: '9px 14px',
            borderRadius: '10px',
            border: 'none',
            background: filtroEstado === 'solventes'
              ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              : 'transparent',
            color: filtroEstado === 'solventes' ? '#fff' : '#94a3b8',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s'
          }}
        >
          <span>✨ Solventes (Al Día)</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: filtroEstado === 'solventes' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.08)'
          }}>
            {conteoEstados.solventesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFiltroEstado('todos')}
          style={{
            flex: 1,
            minWidth: '130px',
            padding: '9px 14px',
            borderRadius: '10px',
            border: 'none',
            background: filtroEstado === 'todos'
              ? 'rgba(255, 255, 255, 0.12)'
              : 'transparent',
            color: filtroEstado === 'todos' ? '#fff' : '#94a3b8',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s'
          }}
        >
          <span>🏢 Todos los Aptos</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: filtroEstado === 'todos' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.08)'
          }}>
            {conteoEstados.total}
          </span>
        </button>
      </div>

      {/* ── BUSCADOR Y FILTROS MINIMALISTAS ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '14px',
        flexWrap: 'nowrap'
      }}>
        {/* BUSCADOR */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <span style={{
            position: 'absolute', left: '12px', color: '#94a3b8', fontSize: '14px', pointerEvents: 'none', display: 'flex', alignItems: 'center'
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Buscar por apartamento, propietario, concepto (cable viajero, guaya, enero...)..."
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
                position: 'absolute', right: '8px', background: 'transparent',
                border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', padding: '4px'
              }}
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* SELECTOR DE FILTRO DE RIESGO */}
        {filtroEstado !== 'solventes' && (
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
              <option value="todos">⚡ Todos los riesgos</option>
              <option value="azul">🔵 Azul: Recibo mes</option>
              <option value="amarillo">🟡 Amarillo: 3 meses</option>
              <option value="rojo">🔴 Rojo: 4-6 meses</option>
              <option value="morado">🟣 Morado: &gt;6 meses</option>
            </select>
            <span style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', fontSize: '10px', color: '#94a3b8'
            }}>
              ▼
            </span>
          </div>
        )}
      </div>

      {/* ── FILTRO MASIVO POR PISO (1 AL PH) ── */}
      <div style={{ marginBottom: '16px' }}>
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
                background: 'none', border: 'none', color: 'var(--color-accent, #f97316)',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0
              }}
            >
              Ver todos los pisos
            </button>
          )}
        </div>

        {/* BARRA HORIZONTAL DE PISOS */}
        <div style={{
          display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px',
          scrollbarWidth: 'none', msOverflowStyle: 'none'
        }}>
          {pisosOpciones.map(p => {
            const active = filtroPiso === p.key
            const count = p.key === 'todos' ? conteoEstados.conDeudaCount : (conteoPorPiso[p.key] || 0)
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
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: active
                    ? 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: active
                    ? '1px solid var(--color-accent, #f97316)'
                    : esMiPiso
                    ? '1px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  color: active ? '#fff' : esMiPiso ? '#60a5fa' : '#cbd5e1',
                  padding: '7px 12px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: active ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
                }}
              >
                <span>{p.label}</span>
                <span style={{
                  fontSize: '10px',
                  background: active ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: active ? '#fff' : '#94a3b8',
                  padding: '1px 6px', borderRadius: '999px', fontWeight: 700
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

      {/* BANNER INFORMATIVO DEL TOTAL FILTRADO */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px',
        marginBottom: '14px', fontSize: '12px', flexWrap: 'wrap', gap: '8px'
      }}>
        <span style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🏢</span>
          <span>
            {filtroPiso === 'PH' ? 'Penthouse (PH)' : filtroPiso === 'todos' ? 'Todo el Edificio' : `Piso ${filtroPiso}`}
            {' · '}
            <strong style={{ color: filtroEstado === 'solventes' ? '#4ade80' : 'var(--color-accent, #f97316)' }}>
              {filtroEstado === 'con_deuda' ? 'Solo con Deuda' : filtroEstado === 'solventes' ? 'Solventes' : 'Todos'}
            </strong>
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
            ({deudasFiltradas.length} {deudasFiltradas.length === 1 ? 'apartamento' : 'apartamentos'})
          </span>
        </span>

        {(totalesFiltrados.usd > 0 || totalesFiltrados.bs > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 800 }}>
            {totalesFiltrados.usd > 0 && (
              <span style={{ color: 'var(--color-accent, #f97316)' }}>
                ${fmtUsd(totalesFiltrados.usd)} USD
              </span>
            )}
            {totalesFiltrados.bs > 0 && (
              <span style={{ color: '#facc15' }}>
                Bs. {fmtBs(totalesFiltrados.bs)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── LISTADO DE APARTAMENTOS CON DESGLOSE DETALLADO ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '30px', marginBottom: '10px' }}>⏳</div>
          Cargando cuentas de condominio...
        </div>
      ) : deudasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '50px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '16px', border: '1px dashed rgba(255, 255, 255, 0.1)', color: '#94a3b8'
        }}>
          <div style={{ fontSize: '30px', marginBottom: '8px' }}>🎉</div>
          No se encontraron apartamentos para este criterio de búsqueda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {deudasFiltradas.map(d => {
            const tieneDeuda = (d.monto_usd || 0) > 0.01 || (d.monto_bs || 0) > 0.01 || d.estado === 'activo'
            const esSolvente = !tieneDeuda
            const cfg = TASA_RIESGO_CONFIG[d.tasa_riesgo] || TASA_RIESGO_CONFIG.azul
            const accion = ACCION_LEGAL_CONFIG[d.accion_legal] || ACCION_LEGAL_CONFIG.notificacion_amistosa
            const esMiApto =
              miAptoNumero && d.apartamento_numero.trim().toUpperCase() === String(miAptoNumero).trim().toUpperCase()

            const borderColor = esSolvente ? 'rgba(34, 197, 94, 0.35)' : cfg.border
            const accentBorder = esSolvente ? '#22c55e' : cfg.color

            return (
              <div
                key={d.id}
                style={{
                  background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                  border: esMiApto ? `2px solid ${accentBorder}` : `1px solid ${borderColor}`,
                  borderLeft: `5px solid ${accentBorder}`,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  boxShadow: esMiApto ? `0 0 20px ${accentBorder}35` : '0 4px 16px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* CABECERA DE LA TARJETA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: esSolvente ? 'rgba(34, 197, 94, 0.15)' : cfg.bg,
                      border: `1px solid ${esSolvente ? 'rgba(34, 197, 94, 0.4)' : cfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: esSolvente ? '#22c55e' : cfg.color, flexShrink: 0
                    }}>
                      {esSolvente ? '✨' : d.tasa_riesgo === 'azul' ? '🔵' : d.tasa_riesgo === 'morado' ? '🟣' : d.tasa_riesgo === 'rojo' ? '🔴' : '🟡'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                          Apartamento {d.apartamento_numero}
                        </span>

                        <span style={{
                          fontSize: '11px', color: '#94a3b8',
                          background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px'
                        }}>
                          {d.piso ? `Piso ${d.piso}` : 'Piso N/D'}
                        </span>

                        {esMiApto && (
                          <span style={{
                            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase',
                            background: 'var(--color-accent, #f97316)', color: '#fff', padding: '2px 8px', borderRadius: '999px'
                          }}>
                            Mi Apartamento
                          </span>
                        )}

                        <span style={{
                          fontSize: '10px', fontWeight: 800,
                          color: esSolvente ? '#22c55e' : cfg.color,
                          background: esSolvente ? 'rgba(34, 197, 94, 0.12)' : cfg.bg,
                          border: `1px solid ${esSolvente ? 'rgba(34, 197, 94, 0.35)' : cfg.border}`,
                          padding: '2px 8px', borderRadius: '6px'
                        }}>
                          {esSolvente ? '✨ Solvente / Al Día' : cfg.badgeText}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {d.propietario_nombre && d.propietario_nombre !== 'N/D' ? d.propietario_nombre : 'Propietario'}
                        {tieneDeuda && (
                          <span> · <strong style={{ color: '#e2e8f0' }}>{d.tasa_riesgo === 'azul' ? 'Recibo del mes (<1m)' : `${d.meses_deuda} conceptos/meses pendientes`}</strong></span>
                        )}
                        {d.fecha_corte && <span> · Corte: {d.fecha_corte}</span>}
                      </div>
                    </div>
                  </div>

                  {/* MONTOS CONSOLIDADOS */}
                  <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
                    {esSolvente ? (
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#4ade80' }}>
                        $0,00 · Bs. 0,00
                      </div>
                    ) : (
                      <>
                        {d.monto_usd > 0 && (
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>
                            ${fmtUsd(d.monto_usd)}
                            <span style={{ fontSize: '11px', color: 'var(--color-accent, #f97316)', marginLeft: '4px', fontWeight: 700 }}>USD</span>
                          </div>
                        )}
                        {d.monto_bs > 0 && (
                          <div style={{ fontSize: d.monto_usd > 0 ? '13px' : '18px', fontWeight: 800, color: '#facc15' }}>
                            Bs. {fmtBs(d.monto_bs)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── DESGLOSE DETALLADO Y MINIMALISTA POR CONCEPTO ── */}
                {tieneDeuda && d.desglose && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.28)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    {/* SECCIÓN 1: DEUDAS PASADAS 2025 Y CUOTAS EXTRAORDINARIAS */}
                    {(d.desglose.deuda_base_2025 || d.desglose.cable_viajero || d.desglose.guaya || d.desglose.arreglo || (d.desglose.cuotas_especiales && d.desglose.cuotas_especiales.length > 0)) && (
                      <div>
                        <div style={{
                          fontSize: '10px', fontWeight: 800, color: '#fb923c', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                          <span>🏛️</span>
                          <span>Deuda Pasada 2025 y Cuotas Extraordinarias</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {d.desglose.deuda_base_2025 && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>📌</span>
                              <span style={{ color: '#cbd5e1' }}>Deuda Pasada 2025:</span>
                              <strong style={{ color: d.desglose.deuda_base_2025.moneda === 'BS' ? '#facc15' : '#60a5fa' }}>
                                {d.desglose.deuda_base_2025.moneda === 'BS'
                                  ? `Bs. ${fmtBs(d.desglose.deuda_base_2025.monto)}`
                                  : `$${fmtUsd(d.desglose.deuda_base_2025.monto)} USD`}
                              </strong>
                            </div>
                          )}

                          {d.desglose.cable_viajero && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>🛗</span>
                              <span style={{ color: '#cbd5e1' }}>Cable Viajero:</span>
                              <strong style={{ color: d.desglose.cable_viajero.moneda === 'BS' ? '#facc15' : '#60a5fa' }}>
                                {d.desglose.cable_viajero.moneda === 'BS'
                                  ? `Bs. ${fmtBs(d.desglose.cable_viajero.monto)}`
                                  : `$${fmtUsd(d.desglose.cable_viajero.monto)} USD`}
                              </strong>
                            </div>
                          )}

                          {d.desglose.guaya && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>⛓️</span>
                              <span style={{ color: '#cbd5e1' }}>Guayas Ascensor:</span>
                              <strong style={{ color: d.desglose.guaya.moneda === 'BS' ? '#facc15' : '#60a5fa' }}>
                                {d.desglose.guaya.moneda === 'BS'
                                  ? `Bs. ${fmtBs(d.desglose.guaya.monto)}`
                                  : `$${fmtUsd(d.desglose.guaya.monto)} USD`}
                              </strong>
                            </div>
                          )}

                          {d.desglose.arreglo && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>🔧</span>
                              <span style={{ color: '#cbd5e1' }}>Arreglo Ascensor:</span>
                              <strong style={{ color: d.desglose.arreglo.moneda === 'BS' ? '#facc15' : '#60a5fa' }}>
                                {d.desglose.arreglo.moneda === 'BS'
                                  ? `Bs. ${fmtBs(d.desglose.arreglo.monto)}`
                                  : `$${fmtUsd(d.desglose.arreglo.monto)} USD`}
                              </strong>
                            </div>
                          )}

                          {d.desglose.cuotas_especiales?.map(ce => (
                            <div key={ce.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>⭐</span>
                              <span style={{ color: '#cbd5e1' }}>{ce.label}:</span>
                              <strong style={{ color: ce.moneda === 'BS' ? '#facc15' : '#60a5fa' }}>
                                {ce.moneda === 'BS' ? `Bs. ${fmtBs(ce.monto)}` : `$${fmtUsd(ce.monto)} USD`}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SECCIÓN 2: RECIBOS 2026 EN BOLÍVARES (Enero y Febrero) */}
                    {d.desglose.recibos_bs && d.desglose.recibos_bs.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: '10px', fontWeight: 800, color: '#facc15', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                          <span>📄</span>
                          <span>Recibos Impagos en Bolívares (Enero - Febrero 2026)</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {d.desglose.recibos_bs.map(r => (
                            <div key={r.key} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(250, 204, 21, 0.1)', border: '1px solid rgba(250, 204, 21, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>🇻🇪</span>
                              <span style={{ color: '#cbd5e1' }}>{r.label}:</span>
                              <strong style={{ color: '#facc15' }}>Bs. {fmtBs(r.monto)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SECCIÓN 3: RECIBOS 2026 EN DÓLARES (Marzo a Diciembre) */}
                    {d.desglose.recibos_usd && d.desglose.recibos_usd.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: '10px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase',
                          letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'
                        }}>
                          <span>💵</span>
                          <span>Recibos Impagos en Dólares (Emisión Mensual 2026)</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {d.desglose.recibos_usd.map(r => (
                            <div key={r.key} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.3)',
                              borderRadius: '8px', padding: '4px 9px', fontSize: '11px'
                            }}>
                              <span>💲</span>
                              <span style={{ color: '#cbd5e1' }}>{r.label}:</span>
                              <strong style={{ color: '#60a5fa' }}>${fmtUsd(r.monto)} USD</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RESUMEN FINAL AL CENTAVO Y GESTIÓN */}
                    <div style={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      paddingTop: '8px', marginTop: '2px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      flexWrap: 'wrap', gap: '8px', fontSize: '11px'
                    }}>
                      <div style={{ color: '#94a3b8' }}>
                        Deuda exacta consolidada:{' '}
                        <strong style={{ color: '#fff' }}>
                          {d.monto_usd > 0 && d.monto_bs > 0
                            ? `$${fmtUsd(d.monto_usd)} USD + Bs. ${fmtBs(d.monto_bs)}`
                            : d.monto_usd > 0
                            ? `$${fmtUsd(d.monto_usd)} USD`
                            : `Bs. ${fmtBs(d.monto_bs)}`}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d8b4fe', fontWeight: 600 }}>
                        <span>{accion.icono}</span>
                        <span>{accion.titulo}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* SI ES SOLVENTE */}
                {esSolvente && (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.06)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '10px', padding: '8px 12px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '11px', color: '#4ade80'
                  }}>
                    <span>✨</span>
                    <span>Apartamento 100% solvente. No registra recibos ni cuotas pendientes.</span>
                  </div>
                )}

                {/* BOTÓN DE REPORTAR PAGO SI ES MI APARTAMENTO */}
                {esMiApto && tieneDeuda && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setModalPagoOpen(true)}
                      style={{
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        border: 'none', color: '#fff', borderRadius: '8px',
                        padding: '6px 14px', fontSize: '12px', fontWeight: 800,
                        cursor: 'pointer', transition: 'all 0.15s ease'
                      }}
                    >
                      💳 Reportar Mi Pago
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
