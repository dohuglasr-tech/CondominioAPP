import React, { useState, useMemo } from 'react'

export interface ReciboSolventeItem {
  id: string
  tipo: 'recibo_mensual' | 'atraso_historico'
  apartamento_id: string
  apartamento_numero: string
  propietario: string
  mes_facturado: string
  periodo_label: string
  mes_key: string
  monto_usd: number
  monto_bs: number
  tasa_bcv?: number
  estado: 'pagado' | 'solvente'
  referencia: string
  metodo: string
  fecha_pago: string
  fecha_registro: string
  origen: string
  nota?: string
}

interface ModalRecibosSolventesProps {
  isOpen: boolean
  onClose: () => void
  items: ReciboSolventeItem[]
  tasaBcv: number
}

export const ModalRecibosSolventes: React.FC<ModalRecibosSolventesProps> = ({
  isOpen,
  onClose,
  items,
  tasaBcv: _tasaBcv
}) => {
  const [busqueda, setBusqueda] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')
  const [filtroOrigen, setFiltroOrigen] = useState('todos')
  const [paginaActual, setPaginaActual] = useState(1)
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  const itemsPorPagina = 25

  // Extraer lista única de periodos y orígenes disponibles para los filtros
  const periodosDisponibles = useMemo(() => {
    const setP = new Set<string>()
    items.forEach(i => {
      if (i.periodo_label) setP.add(i.periodo_label)
    })
    return Array.from(setP)
  }, [items])

  const origenesDisponibles = useMemo(() => {
    const setO = new Set<string>()
    items.forEach(i => {
      if (i.origen) setO.add(i.origen)
    })
    return Array.from(setO)
  }, [items])

  // Filtrado reactivo de items
  const itemsFiltrados = useMemo(() => {
    const rawQ = busqueda.trim().toLowerCase()
    const cleanQ = rawQ.replace(/^apto\.?\s*/i, '').trim()

    return items.filter(item => {
      if (rawQ) {
        const numClean = item.apartamento_numero.toLowerCase()
        const aptoConPrefijo = `apto ${numClean}`

        const aptoMatch =
          numClean.includes(rawQ) ||
          aptoConPrefijo.includes(rawQ) ||
          (cleanQ ? numClean.includes(cleanQ) : false)

        const propMatch = item.propietario.toLowerCase().includes(rawQ)
        const refMatch = item.referencia.toLowerCase().includes(rawQ)
        const metodoMatch = item.metodo.toLowerCase().includes(rawQ)
        const periodoMatch = item.periodo_label.toLowerCase().includes(rawQ)

        if (!aptoMatch && !propMatch && !refMatch && !metodoMatch && !periodoMatch) {
          return false
        }
      }

      if (filtroPeriodo !== 'todos' && item.periodo_label !== filtroPeriodo) {
        return false
      }

      if (filtroOrigen !== 'todos' && item.origen !== filtroOrigen) {
        return false
      }

      return true
    })
  }, [items, busqueda, filtroPeriodo, filtroOrigen])

  // Métricas agregadas de los filtrados
  const stats = useMemo(() => {
    const totalCount = itemsFiltrados.length
    let totalUsd = 0
    let totalBs = 0
    const aptosSet = new Set<string>()

    itemsFiltrados.forEach(i => {
      totalUsd += i.monto_usd
      totalBs += i.monto_bs
      if (i.apartamento_numero) aptosSet.add(i.apartamento_numero)
    })

    return {
      totalCount,
      totalUsd,
      totalBs,
      aptosCount: aptosSet.size
    }
  }, [itemsFiltrados])

  // Paginación
  const totalPaginas = Math.ceil(itemsFiltrados.length / itemsPorPagina) || 1
  const itemsPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * itemsPorPagina
    return itemsFiltrados.slice(inicio, inicio + itemsPorPagina)
  }, [itemsFiltrados, paginaActual])

  const handleCopiarRef = (ref: string, id: string) => {
    if (!ref || ref === 'S/R') return
    navigator.clipboard.writeText(ref)
    setCopiadoId(id)
    setTimeout(() => setCopiadoId(null), 2000)
  }

  const exportarCSV = () => {
    const headers = [
      'Apartamento',
      'Propietario',
      'Periodo (Mes y Año)',
      'Monto USD',
      'Monto BS',
      'Estatus',
      'Referencia Bancaria',
      'Metodo de Pago',
      'Fecha Pago',
      'Origen'
    ]

    const rows = itemsFiltrados.map(i => [
      `"${i.apartamento_numero}"`,
      `"${i.propietario.replace(/"/g, '""')}"`,
      `"${i.periodo_label}"`,
      i.monto_usd.toFixed(2),
      i.monto_bs.toFixed(2),
      `"${i.estado.toUpperCase()}"`,
      `"${i.referencia}"`,
      `"${i.metodo}"`,
      `"${i.fecha_pago}"`,
      `"${i.origen}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `recibos_solventes_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1150px',
          maxHeight: '92vh',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 30px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div style={{
          padding: '22px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#111620',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                🧾
              </div>
              <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: 0 }}>
                Historial de Recibos y Cuotas Solventadas
              </h2>
              <span style={{
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 9px',
                borderRadius: '999px'
              }}>
                {itemsFiltrados.length} Registros
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.4 }}>
              Desglose de todas las cuotas, recibos mensuales y atrasos cambiados a <strong>Pagado / Solvente</strong> (desde Calendario, Reporte Residente, Recibos Emitidos o Conciliación).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={exportarCSV}
              style={{
                backgroundColor: '#151c28',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              title="Descargar lista en formato CSV"
            >
              📥 Exportar Excel
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#1f2937',
                color: '#9ca3af',
                border: '1px solid #374151',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── KPI METRICS STRIP ─────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          padding: '16px 28px',
          backgroundColor: '#0a0d14',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{
            backgroundColor: '#131822',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '14px',
            padding: '12px 16px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Cuotas Solventes
            </span>
            <div style={{ color: '#34d399', fontSize: '22px', fontWeight: 900, marginTop: '2px' }}>
              {stats.totalCount}
            </div>
          </div>

          <div style={{
            backgroundColor: '#131822',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '14px',
            padding: '12px 16px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Monto en Dólares ($)
            </span>
            <div style={{ color: '#60a5fa', fontSize: '22px', fontWeight: 900, marginTop: '2px' }}>
              ${stats.totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{
            backgroundColor: '#131822',
            border: '1px solid rgba(249, 115, 22, 0.2)',
            borderRadius: '14px',
            padding: '12px 16px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Monto en Bolívares (Bs)
            </span>
            <div style={{ color: '#fb923c', fontSize: '20px', fontWeight: 900, marginTop: '2px' }}>
              Bs. {stats.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{
            backgroundColor: '#131822',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '14px',
            padding: '12px 16px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Apartamentos Solventes
            </span>
            <div style={{ color: '#c084fc', fontSize: '22px', fontWeight: 900, marginTop: '2px' }}>
              {stats.aptosCount} <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>/ 62</span>
            </div>
          </div>
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTROS ───────────────────────────────────── */}
        <div style={{
          padding: '14px 28px',
          backgroundColor: '#0e131d',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          {/* Input de Búsqueda */}
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              value={busqueda}
              onChange={e => {
                setBusqueda(e.target.value)
                setPaginaActual(1)
              }}
              placeholder="🔍 Buscar apartamento (ej: 513), propietario, referencia..."
              style={{
                width: '100%',
                backgroundColor: '#050811',
                border: '1px solid #1f2937',
                padding: '9px 12px',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por Periodo (Mes y Año) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Periodo:</span>
            <select
              value={filtroPeriodo}
              onChange={e => {
                setFiltroPeriodo(e.target.value)
                setPaginaActual(1)
              }}
              style={{
                backgroundColor: '#050811',
                border: '1px solid #1f2937',
                padding: '8px 10px',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="todos">Todos los periodos ({periodosDisponibles.length})</option>
              {periodosDisponibles.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Origen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Origen:</span>
            <select
              value={filtroOrigen}
              onChange={e => {
                setFiltroOrigen(e.target.value)
                setPaginaActual(1)
              }}
              style={{
                backgroundColor: '#050811',
                border: '1px solid #1f2937',
                padding: '8px 10px',
                borderRadius: '8px',
                color: '#93c5fd',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="todos">Todos los orígenes</option>
              {origenesDisponibles.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── CONTENIDO: TABLA PRINCIPAL ────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px' }}>
          {itemsPaginados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>
                No se encontraron recibos solventes
              </div>
              <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
                Intenta ajustar la búsqueda o seleccionar otro periodo/origen.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>Apartamento</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>Periodo (Mes y Año)</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800, textAlign: 'right' }}>Monto ($ / Bs)</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800, textAlign: 'center' }}>Estatus</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>Referencia Bancaria</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>Fecha y Método</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {itemsPaginados.map(item => {
                  const tieneRef = item.referencia && item.referencia !== 'S/R'
                  const esCopiado = copiadoId === item.id

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Apartamento */}
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            fontWeight: 800,
                            fontSize: '12px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(59, 130, 246, 0.3)'
                          }}>
                            Apto {item.apartamento_numero}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.propietario}
                        </div>
                      </td>

                      {/* Periodo (Mes y Año) */}
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                          {item.periodo_label}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                          {item.tipo === 'atraso_historico' ? 'Atraso Histórico' : 'Cuota Mensual Ordinaria'}
                        </div>
                      </td>

                      {/* Monto */}
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 800 }}>
                          ${item.monto_usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ color: '#fb923c', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                          Bs. {item.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>

                      {/* Estatus */}
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <span style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.18)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span>✓</span> Solvente
                        </span>
                      </td>

                      {/* Referencia Bancaria */}
                      <td style={{ padding: '12px 10px' }}>
                        {tieneRef ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              onClick={() => handleCopiarRef(item.referencia, item.id)}
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: '#a7f3d0',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                letterSpacing: '0.3px'
                              }}
                              title="Haz clic para copiar la referencia bancaria"
                            >
                              #{item.referencia}
                            </span>
                            {esCopiado && (
                              <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>
                                ¡Copiado!
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                            Sin ref registrada
                          </span>
                        )}
                        {item.nota && (
                          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.nota}>
                            Nota: {item.nota}
                          </div>
                        )}
                      </td>

                      {/* Fecha y Método */}
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>
                          {item.fecha_pago || 'Fecha no registrada'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                          {item.metodo}
                        </div>
                      </td>

                      {/* Origen */}
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          backgroundColor: item.origen === 'Calendario de Deudas'
                            ? 'rgba(59, 130, 246, 0.14)'
                            : item.origen === 'Reporte Residente'
                            ? 'rgba(16, 185, 129, 0.14)'
                            : 'rgba(168, 85, 247, 0.14)',
                          color: item.origen === 'Calendario de Deudas'
                            ? '#93c5fd'
                            : item.origen === 'Reporte Residente'
                            ? '#6ee7b7'
                            : '#d8b4fe',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.origen}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── FOOTER Y PAGINACIÓN ───────────────────────────────────────────── */}
        <div style={{
          padding: '14px 28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0d1117',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ color: '#64748b', fontSize: '12px' }}>
            Mostrando <strong>{itemsPaginados.length}</strong> de <strong>{itemsFiltrados.length}</strong> recibos solventes (Página {paginaActual} de {totalPaginas})
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setPaginaActual(p => Math.max(p - 1, 1))}
              disabled={paginaActual === 1}
              style={{
                backgroundColor: paginaActual === 1 ? '#111827' : '#1f2937',
                color: paginaActual === 1 ? '#4b5563' : '#e5e7eb',
                border: '1px solid #374151',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: paginaActual === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPaginaActual(p => Math.min(p + 1, totalPaginas))}
              disabled={paginaActual === totalPaginas}
              style={{
                backgroundColor: paginaActual === totalPaginas ? '#111827' : '#1f2937',
                color: paginaActual === totalPaginas ? '#4b5563' : '#e5e7eb',
                border: '1px solid #374151',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: paginaActual === totalPaginas ? 'not-allowed' : 'pointer'
              }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
