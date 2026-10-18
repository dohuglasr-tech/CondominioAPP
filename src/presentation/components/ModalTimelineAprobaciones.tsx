import React, { useState, useMemo } from 'react'
import { ActividadItem } from '../pages/admin/AdminDashboard'

interface ModalTimelineAprobacionesProps {
  isOpen: boolean
  onClose: () => void
  items: ActividadItem[]
  tasaBcv: number
  onNavigateToRecibos?: () => void
  onNavigateToCalendario?: () => void
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const ModalTimelineAprobaciones: React.FC<ModalTimelineAprobacionesProps> = ({
  isOpen,
  onClose,
  items,
  tasaBcv,
  onNavigateToRecibos,
  onNavigateToCalendario
}) => {
  const [busqueda, setBusqueda] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState<'todos' | 'admin' | 'residente' | 'pendiente'>('todos')
  const [filtroTiempo, setFiltroTiempo] = useState<'todos' | '7dias' | '30dias'>('todos')
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  // Filtrado de items
  const itemsFiltrados = useMemo(() => {
    const ahora = Date.now()
    const ms7dias = 7 * 24 * 60 * 60 * 1000
    const ms30dias = 30 * 24 * 60 * 60 * 1000

    return items.filter(item => {
      // Filtro por origen / estado
      if (filtroOrigen === 'admin' && item.origen !== 'admin') return false
      if (filtroOrigen === 'residente' && item.origen !== 'residente') return false
      if (filtroOrigen === 'pendiente' && item.estado !== 'pendiente') return false

      // Filtro por tiempo
      if (filtroTiempo !== 'todos') {
        const itemTime = new Date(item.rawDate).getTime()
        if (!isNaN(itemTime)) {
          const diff = ahora - itemTime
          if (filtroTiempo === '7dias' && diff > ms7dias) return false
          if (filtroTiempo === '30dias' && diff > ms30dias) return false
        }
      }

      // Filtro por texto de búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const aptoMatch = item.apartamentoNumero.toLowerCase().includes(q)
        const refMatch = item.referencia.toLowerCase().includes(q)
        const autorMatch = (item.autor || '').toLowerCase().includes(q)
        const propMatch = (item.propietario || '').toLowerCase().includes(q)
        const notaMatch = (item.nota || '').toLowerCase().includes(q)
        const tituloMatch = item.titulo.toLowerCase().includes(q)
        const periodoMatch = (item.periodo || '').toLowerCase().includes(q)

        if (!aptoMatch && !refMatch && !autorMatch && !propMatch && !notaMatch && !tituloMatch && !periodoMatch) {
          return false
        }
      }

      return true
    })
  }, [items, busqueda, filtroOrigen, filtroTiempo])

  // Métricas agregadas
  const metricas = useMemo(() => {
    let totalAdmin = 0
    let totalResidente = 0
    let totalPendientes = 0
    let recaudadoBs = 0
    let recaudadoUsd = 0

    items.forEach(i => {
      if (i.origen === 'admin') totalAdmin++
      if (i.origen === 'residente') totalResidente++
      if (i.estado === 'pendiente') totalPendientes++

      if (i.estado === 'aprobado' || i.estado === 'pagado') {
        recaudadoBs += i.montoNumBs || 0
        recaudadoUsd += i.montoNumUsd || 0
      }
    })

    return {
      total: items.length,
      totalAdmin,
      totalResidente,
      totalPendientes,
      recaudadoBs,
      recaudadoUsd
    }
  }, [items])

  // Agrupar items por día para vista de Timeline cronológico
  const gruposTimeline = useMemo(() => {
    const mapa = new Map<string, ActividadItem[]>()

    itemsFiltrados.forEach(item => {
      const fechaObj = new Date(item.rawDate)
      let etiquetaGrupo = 'Sin Fecha'

      if (!isNaN(fechaObj.getTime())) {
        const hoy = new Date()
        const esHoy = fechaObj.toDateString() === hoy.toDateString()
        const ayer = new Date(hoy)
        ayer.setDate(hoy.getDate() - 1)
        const esAyer = fechaObj.toDateString() === ayer.toDateString()

        if (esHoy) {
          etiquetaGrupo = 'Hoy · ' + fechaObj.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
        } else if (esAyer) {
          etiquetaGrupo = 'Ayer · ' + fechaObj.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
        } else {
          etiquetaGrupo = fechaObj.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          etiquetaGrupo = etiquetaGrupo.charAt(0).toUpperCase() + etiquetaGrupo.slice(1)
        }
      }

      if (!mapa.has(etiquetaGrupo)) {
        mapa.set(etiquetaGrupo, [])
      }
      mapa.get(etiquetaGrupo)!.push(item)
    })

    return Array.from(mapa.entries())
  }, [itemsFiltrados])

  // Copiar referencia
  const handleCopiarRef = (id: string, ref: string) => {
    navigator.clipboard.writeText(ref)
    setCopiadoId(id)
    setTimeout(() => setCopiadoId(null), 2000)
  }

  // Exportar a CSV
  const exportarCSV = () => {
    const encabezados = [
      'Fecha_Registro',
      'Apartamento',
      'Propietario',
      'Origen',
      'Autor_Aprobador',
      'Periodo',
      'Referencia',
      'Metodo_Pago',
      'Monto_BS',
      'Monto_USD',
      'Estado',
      'Observaciones'
    ]

    const filas = itemsFiltrados.map(i => [
      `"${i.fechaHoraCompleta || i.rawDate}"`,
      `"${i.apartamentoNumero}"`,
      `"${(i.propietario || '').replace(/"/g, '""')}"`,
      `"${i.origen === 'admin' ? 'Aprobacion Manual Administrador' : 'Reporte Residente'}"`,
      `"${(i.autor || '').replace(/"/g, '""')}"`,
      `"${(i.periodo || '').replace(/"/g, '""')}"`,
      `"${i.referencia}"`,
      `"${(i.metodo || '').replace(/"/g, '""')}"`,
      i.montoNumBs.toFixed(2),
      i.montoNumUsd.toFixed(2),
      `"${i.estado}"`,
      `"${(i.nota || '').replace(/"/g, '""')}"`
    ])

    const csvContent = '\uFEFF' + [encabezados.join(','), ...filas.map(f => f.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `timeline_aprobaciones_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0c1017',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER MODAL */}
        <div style={{
          padding: '24px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#111622',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.6px',
                textTransform: 'uppercase'
              }}>
                <span style={{ fontSize: '13px' }}>🕒</span> TIMELINE DE AUDITORÍA Y APROBACIONES
              </span>
              <span style={{ color: '#64748b', fontSize: '12px' }}>
                · Tasa BCV: Bs. {fmtBs(tasaBcv)}
              </span>
            </div>

            <h2 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.4px' }}>
              Historial y Timeline de Pagos y Aprobaciones
            </h2>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '13px' }}>
              Línea de tiempo cronológica con todas las cuotas solventadas, aprobaciones manuales del administrador y reportes de residentes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={exportarCSV}
              title="Descargar reporte en Excel / CSV"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              📥 Exportar CSV
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                transition: 'all 0.2s'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* CONTADORES SUPERIORES DE RESUMEN */}
        <div style={{
          padding: '16px 28px',
          backgroundColor: '#0a0d14',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px'
        }}>
          <div style={{ backgroundColor: '#131926', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Operaciones</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{metricas.total}</div>
          </div>

          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>🛡️ Aprobados por Admin</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>{metricas.totalAdmin}</div>
          </div>

          <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>📱 Reportes Residentes</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>{metricas.totalResidente}</div>
          </div>

          <div style={{ backgroundColor: '#131926', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>Monto Aprobado</span>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
              ${fmtUsd(metricas.recaudadoUsd)}
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>({fmtBs(metricas.recaudadoBs)} Bs)</span>
            </div>
          </div>
        </div>

        {/* BARRA DE FILTROS Y BÚSQUEDA */}
        <div style={{
          padding: '16px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0c1017'
        }}>
          {/* BUSCADOR */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
              🔍
            </span>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por apartamento (511, 513...), referencia, residente o notas..."
              style={{
                width: '100%',
                backgroundColor: '#131926',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '9px 12px 9px 36px',
                color: '#fff',
                fontSize: '13px',
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
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* CHIPS DE FILTRO POR ORIGEN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginRight: '4px' }}>FILTRO:</span>
            {[
              { id: 'todos', label: `Todos (${items.length})` },
              { id: 'admin', label: `🛡️ Aprobados Admin (${metricas.totalAdmin})` },
              { id: 'residente', label: `📱 Residentes (${metricas.totalResidente})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFiltroOrigen(tab.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: filtroOrigen === tab.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: filtroOrigen === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: filtroOrigen === tab.id ? '#60a5fa' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* FILTRO DE TIEMPO */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'todos', label: 'Historial Completo' },
              { id: '7dias', label: 'Últimos 7 días' },
              { id: '30dias', label: 'Últimos 30 días' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFiltroTiempo(t.id as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filtroTiempo === t.id ? '1px solid #10b981' : '1px solid transparent',
                  backgroundColor: filtroTiempo === t.id ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: filtroTiempo === t.id ? '#34d399' : '#64748b'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* TIMELINE FEED BODY */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {itemsFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>🔍</span>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#cbd5e1', margin: 0 }}>
                No se encontraron pagos o aprobaciones coincidentes
              </p>
              <p style={{ fontSize: '12px', margin: '4px 0 0' }}>
                Prueba ajustando el texto de búsqueda o cambiando el filtro de origen.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {gruposTimeline.map(([etiquetaDia, itemsDia]) => (
                <div key={etiquetaDia}>
                  {/* Encabezado del día en el timeline */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#e2e8f0',
                      letterSpacing: '0.5px'
                    }}>
                      📅 {etiquetaDia}
                    </div>
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                      {itemsDia.length} {itemsDia.length === 1 ? 'operación' : 'operaciones'}
                    </span>
                  </div>

                  {/* Nodos del timeline para este día */}
                  <div style={{
                    position: 'relative',
                    paddingLeft: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}>
                    {/* Línea conectora vertical continua */}
                    <div style={{
                      position: 'absolute',
                      left: '8px',
                      top: '12px',
                      bottom: '12px',
                      width: '2px',
                      background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.6) 0%, rgba(59, 130, 246, 0.3) 100%)',
                      borderRadius: '2px'
                    }} />

                    {itemsDia.map(item => {
                      const esAdmin = item.origen === 'admin'
                      const esPendiente = item.estado === 'pendiente'
                      const horaFmt = item.rawDate && !isNaN(new Date(item.rawDate).getTime())
                        ? new Date(item.rawDate).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
                        : ''

                      return (
                        <div
                          key={item.id}
                          style={{
                            position: 'relative',
                            backgroundColor: '#111622',
                            border: esAdmin
                              ? '1px solid rgba(16, 185, 129, 0.28)'
                              : '1px solid rgba(59, 130, 246, 0.25)',
                            borderRadius: '16px',
                            padding: '16px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                            transition: 'all 0.2s'
                          }}
                        >
                          {/* Punto / nodo en la línea vertical */}
                          <div style={{
                            position: 'absolute',
                            left: '-20px',
                            top: '20px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: esAdmin ? '#10b981' : (esPendiente ? '#f59e0b' : '#38bdf8'),
                            border: '2px solid #0c1017',
                            boxShadow: `0 0 10px ${esAdmin ? '#10b981' : '#38bdf8'}`
                          }} />

                          {/* FILA SUPERIOR: ORIGEN + APARTAMENTO + HORA */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: esAdmin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                color: esAdmin ? '#34d399' : '#38bdf8',
                                border: esAdmin ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {esAdmin ? '🛡️ Aprobado por Administrador' : '📱 Reportado por Residente'}
                              </span>

                              <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                                Apto {item.apartamentoNumero}
                              </span>

                              {item.propietario && (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                  · {item.propietario}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {horaFmt && (
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  🕒 {horaFmt}
                                </span>
                              )}
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                backgroundColor: esPendiente ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: esPendiente ? '#fbbf24' : '#34d399',
                                border: esPendiente ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                              }}>
                                {esPendiente ? '⏳ Pendiente' : '✓ Solvente / Aprobado'}
                              </span>
                            </div>
                          </div>

                          {/* FILA MEDIA: DETALLES DE REFERENCIA, MÉTODO Y CONCEPTO */}
                          <div style={{
                            backgroundColor: '#0a0d14',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              {item.referencia && item.referencia !== 'S/R' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>Referencia:</span>
                                  <code style={{
                                    backgroundColor: '#131926',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#38bdf8',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    fontFamily: 'monospace'
                                  }}>
                                    {item.referencia}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => handleCopiarRef(item.id, item.referencia)}
                                    title="Copiar referencia bancaria"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: copiadoId === item.id ? '#34d399' : '#64748b',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      padding: '2px 4px'
                                    }}
                                  >
                                    {copiadoId === item.id ? '✓ Copiado' : '📋'}
                                  </button>
                                </div>
                              )}

                              {item.periodo && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>Periodo:</span>
                                  <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                                    {item.periodo}
                                  </span>
                                </div>
                              )}

                              {item.metodo && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>Método:</span>
                                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                                    {item.metodo}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* MONTOS DESTACADOS */}
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                                {item.monto}
                              </div>
                              {item.montoUsd && (
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                                  {item.montoUsd} USD
                                </div>
                              )}
                            </div>
                          </div>

                          {/* FILA INFERIOR: AUTOR / NOTAS DE AUDITORÍA */}
                          {(item.autor || item.nota) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8', gap: '10px' }}>
                              <div>
                                <strong style={{ color: '#cbd5e1' }}>Aprobador / Gestor:</strong> {item.autor || 'Administrador'}
                                {item.nota && item.nota !== item.subtitulo && (
                                  <span style={{ marginLeft: '8px', color: '#71717a' }}>
                                    · {item.nota}
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '8px' }}>
                                {onNavigateToRecibos && (
                                  <button
                                    type="button"
                                    onClick={onNavigateToRecibos}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#38bdf8',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: 0
                                    }}
                                  >
                                    Ver Recibos →
                                  </button>
                                )}
                                {onNavigateToCalendario && (
                                  <button
                                    type="button"
                                    onClick={onNavigateToCalendario}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#f97316',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: 0
                                    }}
                                  >
                                    Ver en Calendario →
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '14px 28px',
          backgroundColor: '#0c1017',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Mostrando {itemsFiltrados.length} de {items.length} aprobaciones registradas en el sistema.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cerrar Timeline
          </button>
        </div>
      </div>
    </div>
  )
}
