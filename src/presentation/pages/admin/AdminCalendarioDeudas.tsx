import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  obtenerMatrizCalendario,
  marcarReciboSolvente,
  guardarConceptosHistoricos,
  sincronizarDatosExcelOficial,
  FilaCalendarioApto,
  ColumnaMes,
  ResumenGlobalCalendario,
  ReciboMesItem
} from '../../../data/calendarioDeudasService'
import { useAuth } from '../../../application/contexts/AuthContext'
import { SkeletonTable } from '../../components/Skeleton'

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const AdminCalendarioDeudas: React.FC = () => {
  const { perfil, config } = useAuth()

  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(2026)
  const [filas, setFilas] = useState<FilaCalendarioApto[]>([])
  const [columnasMeses, setColumnasMeses] = useState<ColumnaMes[]>([])
  const [resumen, setResumen] = useState<ResumenGlobalCalendario | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'con_deuda' | 'solventes'>('todos')
  const [modoChecklistRapido, setModoChecklistRapido] = useState<boolean>(false)
  const [vistaModo, setVistaModo] = useState<'completo' | 'solo_2026' | 'historico_2025'>('completo')

  // Modal de Detalle / Checklist de Pago
  const [modalPagoOpen, setModalPagoOpen] = useState(false)
  const [modalApto, setModalApto] = useState<FilaCalendarioApto | null>(null)
  const [modalCol, setModalCol] = useState<ColumnaMes | null>(null)
  const [modalRecibo, setModalRecibo] = useState<ReciboMesItem | null>(null)
  const [modalEstadoDeseado, setModalEstadoDeseado] = useState<'pagado' | 'pendiente'>('pagado')
  const [modalReferencia, setModalReferencia] = useState('')
  const [modalMetodo, setModalMetodo] = useState('Transferencia Bancaria')
  const [modalFechaPago, setModalFechaPago] = useState(new Date().toISOString().slice(0, 10))
  const [modalNota, setModalNota] = useState('')
  const [procesandoAccion, setProcesandoAccion] = useState(false)

  // Modal Edición Concepto Histórico (2025 / Guaya / Cable / Arreglo)
  const [modalHistOpen, setModalHistOpen] = useState(false)
  const [modalHistApto, setModalHistApto] = useState<FilaCalendarioApto | null>(null)
  const [histBase2025, setHistBase2025] = useState<number | ''>('')
  const [histCableViajero, setHistCableViajero] = useState<number | ''>('')
  const [histGuaya, setHistGuaya] = useState<number | ''>('')
  const [histArreglo, setHistArreglo] = useState<number | ''>('')

  // Sincronización Inicial Excel
  const [sincronizandoExcel, setSincronizandoExcel] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 4000)
  }

  // ── Cargar datos ─────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async (force = false) => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await obtenerMatrizCalendario(anioSeleccionado, force)
      if (res.error) {
        setErrorMsg(res.error)
      } else {
        setFilas(res.filas)
        setColumnasMeses(res.columnasMeses)
        setResumen(res.resumenGlobal)
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [anioSeleccionado])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // ── Filtrado de filas ────────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    return filas.filter(f => {
      // Búsqueda por número de apto o propietario
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const aptoMatch = f.apartamento_numero.toLowerCase().includes(q)
        const propMatch = (f.propietario_nombre || '').toLowerCase().includes(q)
        if (!aptoMatch && !propMatch) return false
      }

      // Filtro de estado
      if (filtroEstado === 'con_deuda' && f.estado_solvente) return false
      if (filtroEstado === 'solventes' && !f.estado_solvente) return false

      return true
    })
  }, [filas, busqueda, filtroEstado])

  // ── Abrir modal de gestión para una celda mensual ─────────────────────────
  const handleCellClick = (apto: FilaCalendarioApto, col: ColumnaMes) => {
    const recibo = apto.meses[col.key]

    // Si está en modo checklist rápido y hay un recibo pendiente, marcar directo como pagado
    if (modoChecklistRapido && recibo && recibo.estado === 'pendiente') {
      ejecutarToggleRapido(apto, col, recibo, 'pagado')
      return
    }

    setModalApto(apto)
    setModalCol(col)
    setModalRecibo(recibo)
    setModalEstadoDeseado(recibo?.estado === 'pagado' ? 'pendiente' : 'pagado')
    setModalReferencia('')
    setModalMetodo('Transferencia Bancaria')
    setModalFechaPago(new Date().toISOString().slice(0, 10))
    setModalNota('')
    setModalPagoOpen(true)
  }

  // ── Ejecutar toggle rápido en modo checklist ──────────────────────────────
  const ejecutarToggleRapido = async (
    apto: FilaCalendarioApto,
    col: ColumnaMes,
    recibo: ReciboMesItem | null,
    nuevoEstado: 'pagado' | 'pendiente'
  ) => {
    const mesLabelCompleto = `${col.label} ${col.anio}`
    const montoUsd = recibo ? recibo.total_usd : (col.moneda === 'USD' ? 12.91 : 0)
    const montoBs = recibo ? recibo.total_bs : (col.moneda === 'BS' ? 2916.05 : 0)

    // Actualización optimista local en 0ms
    setFilas(prev => prev.map(f => {
      if (f.apartamento_id !== apto.apartamento_id) return f
      const mesesActualizados = { ...f.meses }
      if (mesesActualizados[col.key]) {
        mesesActualizados[col.key] = {
          ...mesesActualizados[col.key]!,
          estado: nuevoEstado
        }
      } else {
        mesesActualizados[col.key] = {
          id: `temp-${Date.now()}`,
          apartamento_id: apto.apartamento_id,
          mes_facturado: col.fechaIso,
          total_usd: montoUsd,
          total_bs: montoBs,
          estado: nuevoEstado
        }
      }

      // Recalcular deuda total
      let newBs = f.deuda_base_2025 + f.arreglo
      let newUsd = f.cable_viajero + f.guaya
      let pendingCount = 0
      Object.entries(mesesActualizados).forEach(([k, rec]) => {
        if (rec && rec.estado === 'pendiente') {
          pendingCount++
          if (k <= '2026-02') newBs += rec.total_bs
          else newUsd += rec.total_usd
        }
      })

      return {
        ...f,
        meses: mesesActualizados,
        total_bs: Number(newBs.toFixed(2)),
        total_usd: Number(newUsd.toFixed(2)),
        meses_con_deuda: pendingCount,
        estado_solvente: newBs <= 0.01 && newUsd <= 0.01
      }
    }))

    showToast(`⚡ Apto ${apto.apartamento_numero}: ${mesLabelCompleto} marcado como ${nuevoEstado.toUpperCase()}`)

    const res = await marcarReciboSolvente({
      reciboId: recibo?.id,
      apartamentoId: apto.apartamento_id,
      apartamentoNumero: apto.apartamento_numero,
      mesFacturadoIso: col.fechaIso,
      mesLabel: mesLabelCompleto,
      nuevoEstado,
      montoUsd,
      montoBs,
      referencia: 'CHECKLIST_RAPIDO',
      metodo: 'Modo Checklist Directo',
      fechaPago: new Date().toISOString().slice(0, 10),
      autorNombre: perfil?.nombre_completo || 'Administrador',
      autorEmail: (perfil as any)?.email
    })

    if (!res.success) {
      showToast(`❌ Error: ${res.error}`)
      cargarDatos(true)
    }
  }

  // ── Guardar cambio desde Modal de Pago ────────────────────────────────────
  const handleGuardarCambioRecibo = async () => {
    if (!modalApto || !modalCol) return
    setProcesandoAccion(true)

    const mesLabelCompleto = `${modalCol.label} ${modalCol.anio}`
    const montoUsd = modalRecibo ? modalRecibo.total_usd : (modalCol.moneda === 'USD' ? 12.91 : 0)
    const montoBs = modalRecibo ? modalRecibo.total_bs : (modalCol.moneda === 'BS' ? 2916.05 : 0)

    try {
      const res = await marcarReciboSolvente({
        reciboId: modalRecibo?.id,
        apartamentoId: modalApto.apartamento_id,
        apartamentoNumero: modalApto.apartamento_numero,
        mesFacturadoIso: modalCol.fechaIso,
        mesLabel: mesLabelCompleto,
        nuevoEstado: modalEstadoDeseado,
        montoUsd,
        montoBs,
        referencia: modalReferencia,
        metodo: modalMetodo,
        fechaPago: modalFechaPago,
        nota: modalNota,
        autorNombre: perfil?.nombre_completo || 'Administrador',
        autorEmail: (perfil as any)?.email
      })

      if (res.success) {
        showToast(`✅ Apto ${modalApto.apartamento_numero} marcado como ${modalEstadoDeseado.toUpperCase()}`)
        setModalPagoOpen(false)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } catch (e: any) {
      showToast(`❌ Error inesperado: ${e.message}`)
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Modal Conceptos Históricos ───────────────────────────────────────────
  const handleAbrirModalHist = (apto: FilaCalendarioApto) => {
    setModalHistApto(apto)
    setHistBase2025(apto.deuda_base_2025 || '')
    setHistCableViajero(apto.cable_viajero || '')
    setHistGuaya(apto.guaya || '')
    setHistArreglo(apto.arreglo || '')
    setModalHistOpen(true)
  }

  const handleGuardarHistorico = async () => {
    if (!modalHistApto) return
    setProcesandoAccion(true)
    try {
      const res = await guardarConceptosHistoricos({
        apartamentoId: modalHistApto.apartamento_id,
        apartamentoNumero: modalHistApto.apartamento_numero,
        deudaBase2025: Number(histBase2025 || 0),
        cableViajero: Number(histCableViajero || 0),
        guaya: Number(histGuaya || 0),
        arreglo: Number(histArreglo || 0),
        autorNombre: perfil?.nombre_completo || 'Administrador'
      })

      if (res.success) {
        showToast(`✅ Deuda histórica de Apto ${modalHistApto.apartamento_numero} actualizada`)
        setModalHistOpen(false)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Sincronizar Excel Oficial ────────────────────────────────────────────
  const handleSincronizarExcel = async () => {
    const confirmacion = window.confirm(
      '¿Deseas precargar la matriz con los datos del Excel oficial del edificio?\n\n' +
      'Esto poblará los recibos de Enero a Septiembre 2026 y los conceptos del año 2025 para todos los apartamentos con la información exacta del balance.'
    )
    if (!confirmacion) return

    setSincronizandoExcel(true)
    try {
      const res = await sincronizarDatosExcelOficial(perfil?.nombre_completo || 'Administrador')
      if (res.success) {
        showToast(`🎉 ¡Matriz sincronizada exitosamente! (${res.registrosSincronizados} cuotas vinculadas)`)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error en sincronización: ${res.error}`)
      }
    } catch (e: any) {
      showToast(`❌ Error: ${e.message}`)
    } finally {
      setSincronizandoExcel(false)
    }
  }

  // ── Exportar a CSV (Excel) ───────────────────────────────────────────────
  const exportarCsv = () => {
    if (filas.length === 0) return

    const headers = [
      'APTO',
      'PROPIETARIO',
      'DEUDA_2025_BS',
      'CABLE_VIAJERO',
      'GUAYA',
      'ARREGLO_BS',
      ...columnasMeses.map(c => `${c.label.toUpperCase()}_${c.moneda}`),
      'TOTAL_BS',
      'TOTAL_USD',
      'DEPOSITOS_SALDO_USD',
      'DEPOSITOS_SALDO_BS',
      'ESTADO'
    ]

    const rows = filasFiltradas.map(f => {
      return [
        f.apartamento_numero,
        `"${(f.propietario_nombre || '').replace(/"/g, '""')}"`,
        f.deuda_base_2025 > 0 ? f.deuda_base_2025.toFixed(2) : '-',
        f.cable_viajero > 0 ? f.cable_viajero.toFixed(2) : '-',
        f.guaya > 0 ? f.guaya.toFixed(2) : '-',
        f.arreglo > 0 ? f.arreglo.toFixed(2) : '-',
        ...columnasMeses.map(c => {
          const rec = f.meses[c.key]
          if (!rec) return '-'
          if (rec.estado === 'pendiente') {
            return c.moneda === 'USD' ? rec.total_usd.toFixed(2) : rec.total_bs.toFixed(2)
          }
          return '-'
        }),
        f.total_bs > 0 ? f.total_bs.toFixed(2) : '0.00',
        f.total_usd > 0 ? f.total_usd.toFixed(2) : '0.00',
        f.saldo_a_favor_usd > 0 ? f.saldo_a_favor_usd.toFixed(2) : '0.00',
        f.saldo_a_favor_bs > 0 ? f.saldo_a_favor_bs.toFixed(2) : '0.00',
        f.estado_solvente ? 'SOLVENTE' : 'EN_MORA'
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Matriz_Mora_${config?.nombre_edificio || 'Condominio'}_${anioSeleccionado}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('📥 Archivo CSV descargado correctamente')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', maxWidth: '100%', margin: '0 auto', color: '#f3f4f6' }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#111827',
          color: '#ffffff',
          border: '1px solid #374151',
          boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          padding: '12px 22px',
          borderRadius: '12px',
          zIndex: 99999,
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header y Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>📊</span>
            <div>
              <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                Calendario de Deudas e Impago
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0' }}>
                Matriz y línea de tiempo mensual por apartamento con conciliación interactiva y sincronización total de solvencia.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales superiores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSincronizarExcel()}
            disabled={sincronizandoExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: sincronizandoExcel ? 'not-allowed' : 'pointer'
            }}
            title="Importa la plantilla con los meses y conceptos históricos de la administración original"
          >
            {sincronizandoExcel ? '⏳ Sincronizando...' : '⚡ Sincronizar Excel Oficial'}
          </button>

          <button
            onClick={exportarCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1f2937',
              color: '#e5e7eb',
              border: '1px solid #374151',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📥 Exportar Excel (CSV)
          </button>

          <select
            value={anioSeleccionado}
            onChange={e => setAnioSeleccionado(parseInt(e.target.value, 10))}
            style={{
              backgroundColor: '#030712',
              color: '#fff',
              border: '1px solid #374151',
              padding: '9px 12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value={2026}>Año 2026</option>
            <option value={2025}>Año 2025</option>
            <option value={2027}>Año 2027</option>
          </select>

          <button
            onClick={() => cargarDatos(true)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              border: '1px solid #334155',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Apartamentos */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '16px 20px',
          position: 'relative'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🏢 Apartamentos
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
            {resumen?.totalApartamentos || 62}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ color: '#10b981' }}>🟢 {resumen?.apartamentosSolventes || 0} Solventes</span>
            <span style={{ color: '#ef4444' }}>🔴 {resumen?.apartamentosMorosos || 0} Con Deuda</span>
          </div>
        </div>

        {/* Card 2: Deuda USD */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '16px 20px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            💵 Deuda Total USD
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#f87171', marginTop: '6px' }}>
            ${fmtUsd(resumen?.totalDeudaEdificioUsd || 0)}
          </div>
          <div style={{ color: '#64748b', fontSize: '11px', marginTop: '8px' }}>
            Suma de recibos pendientes indexados
          </div>
        </div>

        {/* Card 3: Deuda Bs */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '16px 20px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🇻🇪 Deuda Total Bolívares
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#fb923c', marginTop: '6px' }}>
            Bs. {fmtBs(resumen?.totalDeudaEdificioBs || 0)}
          </div>
          <div style={{ color: '#64748b', fontSize: '11px', marginTop: '8px' }}>
            2025 + Conceptos fijos en Bs
          </div>
        </div>

        {/* Card 4: Depósitos y Saldo a Favor */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '14px',
          padding: '16px 20px'
        }}>
          <div style={{ color: '#10b981', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            💚 Depósitos / Saldo a Favor
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
            +${fmtUsd(resumen?.totalSaldoAFavorUsd || 0)}
          </div>
          <div style={{ color: '#6ee7b7', fontSize: '11px', marginTop: '8px', fontWeight: 600 }}>
            {resumen?.totalSaldoAFavorBs && resumen.totalSaldoAFavorBs > 0 ? `+Bs. ${fmtBs(resumen.totalSaldoAFavorBs)}` : 'Saldos positivos registrados'}
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Configuración de Vista */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '14px',
        padding: '14px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* Búsqueda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#64748b', fontSize: '13px' }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar por apto o propietario..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '8px 12px 8px 34px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Filtros de estado */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#030712', padding: '3px', borderRadius: '8px', border: '1px solid #374151' }}>
            {(['todos', 'con_deuda', 'solventes'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltroEstado(f)}
                style={{
                  backgroundColor: filtroEstado === f ? '#374151' : 'transparent',
                  color: filtroEstado === f ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {f === 'todos' ? 'Todos' : f === 'con_deuda' ? '🔴 Con Deuda' : '🟢 Solventes'}
              </button>
            ))}
          </div>
        </div>

        {/* Controles de vista y modo checklist */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Selector de modo de vista */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#030712', padding: '3px', borderRadius: '8px', border: '1px solid #374151' }}>
            <button
              onClick={() => setVistaModo('completo')}
              style={{
                backgroundColor: vistaModo === 'completo' ? 'var(--color-accent, #f97316)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Matriz Completa
            </button>
            <button
              onClick={() => setVistaModo('solo_2026')}
              style={{
                backgroundColor: vistaModo === 'solo_2026' ? 'var(--color-accent, #f97316)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Año 2026 ($)
            </button>
            <button
              onClick={() => setVistaModo('historico_2025')}
              style={{
                backgroundColor: vistaModo === 'historico_2025' ? 'var(--color-accent, #f97316)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Deuda 2025 (Bs)
            </button>
          </div>

          {/* Toggle de Modo Checklist Rápido */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: modoChecklistRapido ? 'rgba(16, 185, 129, 0.15)' : '#030712',
            border: modoChecklistRapido ? '1px solid #10b981' : '1px solid #374151',
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={modoChecklistRapido}
              onChange={e => setModoChecklistRapido(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#10b981' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: modoChecklistRapido ? '#34d399' : '#cbd5e1' }}>
              ⚡ Modo Checklist Rápido
            </span>
          </label>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE LA MATRIZ */}
      {loading ? (
        <div style={{ backgroundColor: '#111827', borderRadius: '14px', padding: '24px' }}>
          <SkeletonTable rows={12} columns={10} />
        </div>
      ) : errorMsg ? (
        <div style={{ backgroundColor: '#1f2937', padding: '30px', borderRadius: '14px', textAlign: 'center', color: '#f87171' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>⚠️ {errorMsg}</p>
          <button onClick={() => cargarDatos(true)} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#0b0f19',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          overflowX: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          position: 'relative',
          maxHeight: '75vh'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            textAlign: 'right',
            whiteSpace: 'nowrap'
          }}>
            {/* Cabecera Nivel 1: Agrupadores Excel */}
            <thead>
              <tr style={{ backgroundColor: '#070b14', borderBottom: '1px solid #374151' }}>
                {/* Apto Sticky Column Header */}
                <th style={{
                  position: 'sticky',
                  left: 0,
                  top: 0,
                  zIndex: 20,
                  backgroundColor: '#070b14',
                  padding: '12px 14px',
                  color: '#94a3b8',
                  textAlign: 'left',
                  fontWeight: 800,
                  borderRight: '2px solid #374151',
                  minWidth: '95px'
                }}>
                  APTO
                </th>

                {/* Sección 2025 */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <th
                    colSpan={6}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'rgba(234, 88, 12, 0.12)',
                      color: '#fb923c',
                      padding: '8px 12px',
                      textAlign: 'center',
                      fontWeight: 800,
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      letterSpacing: '0.5px'
                    }}
                  >
                    🏛️ DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS (BS)
                  </th>
                )}

                {/* Sección 2026 */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <th
                    colSpan={columnasMeses.length + 1}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: '#60a5fa',
                      padding: '8px 12px',
                      textAlign: 'center',
                      fontWeight: 800,
                      borderRight: '2px solid rgba(59, 130, 246, 0.35)',
                      letterSpacing: '0.5px'
                    }}
                  >
                    📅 AÑO {anioSeleccionado} (EMISIÓN Y LÍNEA DE TIEMPO MENSUAL)
                  </th>
                )}

                {/* Totales y Depósitos Header */}
                <th
                  colSpan={3}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#34d399',
                    padding: '8px 12px',
                    textAlign: 'center',
                    fontWeight: 800
                  }}
                >
                  RESUMEN Y CRÉDITO
                </th>
              </tr>

              {/* Cabecera Nivel 2: Columnas de datos */}
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '2px solid #334155', color: '#cbd5e1' }}>
                {/* APTO Sticky */}
                <th style={{
                  position: 'sticky',
                  left: 0,
                  top: '37px',
                  zIndex: 20,
                  backgroundColor: '#0f172a',
                  padding: '10px 14px',
                  textAlign: 'left',
                  borderRight: '2px solid #374151',
                  fontWeight: 700
                }}>
                  Unidad
                </th>

                {/* Subcolumnas 2025 */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 12px' }}>
                      Deuda 2025
                    </th>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px' }}>
                      Cable Viaj.
                    </th>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px' }}>
                      Guaya
                    </th>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px' }}>
                      Arreglo
                    </th>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px' }}>
                      Ene (Bs)
                    </th>
                    <th style={{
                      top: '37px',
                      position: 'sticky',
                      zIndex: 10,
                      backgroundColor: '#0f172a',
                      padding: '10px 12px',
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      color: '#fb923c',
                      fontWeight: 800
                    }}>
                      TOTAL BS
                    </th>
                  </>
                )}

                {/* Subcolumnas Meses 2026 */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {columnasMeses.map(col => (
                      <th
                        key={col.key}
                        style={{
                          top: '37px',
                          position: 'sticky',
                          zIndex: 10,
                          backgroundColor: '#0f172a',
                          padding: '10px 12px',
                          fontWeight: 700,
                          color: col.moneda === 'USD' ? '#93c5fd' : '#fcd34d'
                        }}
                      >
                        {col.label} {col.moneda === 'USD' ? '$' : 'Bs'}
                      </th>
                    ))}
                    <th style={{
                      top: '37px',
                      position: 'sticky',
                      zIndex: 10,
                      backgroundColor: '#0f172a',
                      padding: '10px 12px',
                      borderRight: '2px solid rgba(59, 130, 246, 0.35)',
                      color: '#60a5fa',
                      fontWeight: 800
                    }}>
                      TOTAL $
                    </th>
                  </>
                )}

                {/* Subcolumnas Totales */}
                <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 12px' }}>
                  Apto
                </th>
                <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 14px', color: '#34d399' }}>
                  Depósitos / Crédito
                </th>
                <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 14px', textAlign: 'center' }}>
                  Solvencia
                </th>
              </tr>
            </thead>

            {/* CUERPO DE LA TABLA (FILAS DE APARTAMENTOS) */}
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={24} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    No se encontraron apartamentos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((apto, idx) => {
                  const esPar = idx % 2 === 0
                  const bgFila = esPar ? 'rgba(15, 23, 42, 0.4)' : 'rgba(30, 41, 59, 0.25)'

                  // Totales de la sección histórica
                  const totalBsSeccion = apto.total_bs

                  return (
                    <tr
                      key={apto.apartamento_id}
                      style={{
                        backgroundColor: bgFila,
                        borderBottom: '1px solid #1e293b',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.4)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = bgFila}
                    >
                      {/* Columna APTO Sticky */}
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 5,
                        backgroundColor: esPar ? '#090e1a' : '#0d1322',
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontWeight: 800,
                        color: '#fff',
                        borderRight: '2px solid #374151'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: apto.estado_solvente ? '#10b981' : apto.meses_con_deuda >= 4 ? '#ef4444' : '#f59e0b'
                          }} />
                          <span style={{ fontSize: '13px' }}>{apto.apartamento_numero}</span>
                          {apto.alicuota && (
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                              {(apto.alicuota * 100).toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Celdas 2025 */}
                      {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                        <>
                          {/* Deuda 2025 Base */}
                          <td
                            onClick={() => handleAbrirModalHist(apto)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              color: apto.deuda_base_2025 > 0 ? '#fb923c' : '#475569'
                            }}
                            title="Clic para editar o marcar deuda histórica 2025"
                          >
                            {apto.deuda_base_2025 > 0 ? fmtBs(apto.deuda_base_2025) : '-'}
                          </td>

                          {/* Cable Viajero */}
                          <td
                            onClick={() => handleAbrirModalHist(apto)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              color: apto.cable_viajero > 0 ? '#f87171' : '#475569'
                            }}
                          >
                            {apto.cable_viajero > 0 ? fmtUsd(apto.cable_viajero) : '-'}
                          </td>

                          {/* Guaya */}
                          <td
                            onClick={() => handleAbrirModalHist(apto)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              color: apto.guaya > 0 ? '#f87171' : '#475569'
                            }}
                          >
                            {apto.guaya > 0 ? fmtUsd(apto.guaya) : '-'}
                          </td>

                          {/* Arreglo */}
                          <td
                            onClick={() => handleAbrirModalHist(apto)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              color: apto.arreglo > 0 ? '#fbbf24' : '#475569'
                            }}
                          >
                            {apto.arreglo > 0 ? fmtBs(apto.arreglo) : '-'}
                          </td>

                          {/* Enero (Bs) */}
                          {(() => {
                            const recEne = apto.meses[`${anioSeleccionado}-01`]
                            const colEne = columnasMeses.find(c => c.key === `${anioSeleccionado}-01`)
                            const tieneDeuda = recEne && recEne.estado === 'pendiente'
                            return (
                              <td
                                onClick={() => colEne && handleCellClick(apto, colEne)}
                                style={{
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                  fontWeight: tieneDeuda ? 700 : 500,
                                  color: tieneDeuda ? '#fb923c' : '#475569'
                                }}
                              >
                                {tieneDeuda ? fmtBs(recEne.total_bs) : '-'}
                              </td>
                            )
                          })()}

                          {/* TOTAL BS */}
                          <td style={{
                            padding: '8px 12px',
                            fontWeight: 800,
                            color: totalBsSeccion > 0 ? '#fb923c' : '#475569',
                            borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                            backgroundColor: totalBsSeccion > 0 ? 'rgba(234, 88, 12, 0.04)' : 'transparent'
                          }}>
                            {totalBsSeccion > 0 ? fmtBs(totalBsSeccion) : '-'}
                          </td>
                        </>
                      )}

                      {/* Celdas Meses 2026 */}
                      {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                        <>
                          {columnasMeses.map(col => {
                            const recibo = apto.meses[col.key]
                            const tieneDeuda = recibo && recibo.estado === 'pendiente'
                            const monto = col.moneda === 'USD' ? recibo?.total_usd : recibo?.total_bs

                            return (
                              <td
                                key={col.key}
                                onClick={() => handleCellClick(apto, col)}
                                style={{
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                  userSelect: 'none'
                                }}
                                title={tieneDeuda ? `Apto ${apto.apartamento_numero}: Clic para marcar como PAGADO` : 'Solvente / Al día'}
                              >
                                {tieneDeuda ? (
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: modoChecklistRapido ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.12)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    transition: 'all 0.15s'
                                  }}>
                                    {col.moneda === 'USD' ? fmtUsd(monto || 0) : fmtBs(monto || 0)}
                                  </div>
                                ) : recibo && recibo.estado === 'pagado' ? (
                                  <span style={{ color: '#334155', fontWeight: 600 }}>-</span>
                                ) : (
                                  <span style={{ color: '#334155' }}>-</span>
                                )}
                              </td>
                            )
                          })}

                          {/* TOTAL $ */}
                          <td style={{
                            padding: '8px 12px',
                            fontWeight: 800,
                            color: apto.total_usd > 0 ? '#60a5fa' : '#475569',
                            borderRight: '2px solid rgba(59, 130, 246, 0.35)',
                            backgroundColor: apto.total_usd > 0 ? 'rgba(59, 130, 246, 0.04)' : 'transparent'
                          }}>
                            {apto.total_usd > 0 ? fmtUsd(apto.total_usd) : '-'}
                          </td>
                        </>
                      )}

                      {/* Apto repetido (Anchor derecho) */}
                      <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>
                        {apto.apartamento_numero}
                      </td>

                      {/* Depósitos / Saldo a Favor */}
                      <td style={{ padding: '8px 14px' }}>
                        {apto.saldo_a_favor_usd > 0 || apto.saldo_a_favor_bs > 0 ? (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            <span>💚</span>
                            <span>
                              {apto.saldo_a_favor_bs > 0
                                ? `+Bs. ${fmtBs(apto.saldo_a_favor_bs)}`
                                : `+$${fmtUsd(apto.saldo_a_favor_usd)}`}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#475569' }}>-</span>
                        )}
                      </td>

                      {/* Estado Solvencia */}
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        {apto.estado_solvente ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#34d399',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            Solvente
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(239, 68, 68, 0.12)',
                            color: '#f87171',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            {apto.meses_con_deuda > 0 ? `${apto.meses_con_deuda} mes${apto.meses_con_deuda > 1 ? 'es' : ''}` : 'Mora'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* FILA DE TOTALES GLOBALES (STICKY BOTTOM) */}
            <tfoot>
              <tr style={{
                backgroundColor: '#070b14',
                borderTop: '2px solid #3b82f6',
                color: '#ffffff',
                fontWeight: 800
              }}>
                {/* APTO Sticky Totals */}
                <td style={{
                  position: 'sticky',
                  left: 0,
                  bottom: 0,
                  zIndex: 20,
                  backgroundColor: '#070b14',
                  padding: '12px 14px',
                  textAlign: 'left',
                  borderRight: '2px solid #374151',
                  color: '#93c5fd'
                }}>
                  TOTALES ({filasFiltradas.length})
                </td>

                {/* Totales 2025 */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <>
                    <td style={{ padding: '12px 12px', color: '#fb923c' }}>
                      {fmtBs(filasFiltradas.reduce((s, f) => s + f.deuda_base_2025, 0))}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#f87171' }}>
                      {fmtUsd(filasFiltradas.reduce((s, f) => s + f.cable_viajero, 0))}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#f87171' }}>
                      {fmtUsd(filasFiltradas.reduce((s, f) => s + f.guaya, 0))}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#fbbf24' }}>
                      {fmtBs(filasFiltradas.reduce((s, f) => s + f.arreglo, 0))}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#fb923c' }}>
                      {fmtBs(filasFiltradas.reduce((s, f) => {
                        const rec = f.meses[`${anioSeleccionado}-01`]
                        return s + (rec && rec.estado === 'pendiente' ? rec.total_bs : 0)
                      }, 0))}
                    </td>
                    <td style={{
                      padding: '12px 12px',
                      color: '#fb923c',
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      backgroundColor: 'rgba(234, 88, 12, 0.08)'
                    }}>
                      Bs. {fmtBs(filasFiltradas.reduce((s, f) => s + f.total_bs, 0))}
                    </td>
                  </>
                )}

                {/* Totales Meses 2026 */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {columnasMeses.map(col => {
                      const totalCol = filasFiltradas.reduce((s, f) => {
                        const rec = f.meses[col.key]
                        if (rec && rec.estado === 'pendiente') {
                          return s + (col.moneda === 'USD' ? rec.total_usd : rec.total_bs)
                        }
                        return s
                      }, 0)
                      return (
                        <td key={col.key} style={{ padding: '12px 8px', color: totalCol > 0 ? '#f87171' : '#64748b' }}>
                          {totalCol > 0 ? (col.moneda === 'USD' ? fmtUsd(totalCol) : fmtBs(totalCol)) : '-'}
                        </td>
                      )
                    })}
                    <td style={{
                      padding: '12px 12px',
                      color: '#60a5fa',
                      borderRight: '2px solid rgba(59, 130, 246, 0.35)',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)'
                    }}>
                      ${fmtUsd(filasFiltradas.reduce((s, f) => s + f.total_usd, 0))}
                    </td>
                  </>
                )}

                <td style={{ padding: '12px 12px', color: '#64748b' }}>-</td>
                <td style={{ padding: '12px 14px', color: '#34d399' }}>
                  +${fmtUsd(filasFiltradas.reduce((s, f) => s + f.saldo_a_favor_usd, 0))}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'center', color: '#10b981' }}>
                  {filasFiltradas.filter(f => f.estado_solvente).length} Solv.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODAL CHECKLIST / DETALLE DE PAGO */}
      {modalPagoOpen && modalApto && modalCol && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            {/* Header del Modal */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  📋 Gestión de Cuota Condominial
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Apto {modalApto.apartamento_numero} · {modalApto.propietario_nombre || 'Sin Propietario'}
                </p>
              </div>
              <button
                onClick={() => setModalPagoOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Contenido del Modal */}
            <div style={{ padding: '24px' }}>
              {/* Tarjeta de Periodo y Monto */}
              <div style={{
                backgroundColor: '#030712',
                border: '1px solid #1f2937',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Periodo Facturado
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {modalCol.label} {modalCol.anio}
                  </div>
                  <div style={{ fontSize: '11px', color: modalCol.moneda === 'USD' ? '#60a5fa' : '#fbbf24', marginTop: '2px' }}>
                    Moneda: {modalCol.moneda === 'USD' ? 'Dólares ($)' : 'Bolívares (Bs)'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Monto Cuota
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                    {modalCol.moneda === 'USD'
                      ? `$${fmtUsd(modalRecibo?.total_usd || 12.91)}`
                      : `Bs. ${fmtBs(modalRecibo?.total_bs || 2916.05)}`}
                  </div>
                </div>
              </div>

              {/* CHECKLIST: Botón interactivo de cambio de estado */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Estado de esta cuota:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setModalEstadoDeseado('pagado')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: modalEstadoDeseado === 'pagado' ? '2px solid #10b981' : '1px solid #374151',
                      backgroundColor: modalEstadoDeseado === 'pagado' ? 'rgba(16, 185, 129, 0.15)' : '#030712',
                      color: modalEstadoDeseado === 'pagado' ? '#34d399' : '#94a3b8',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>✓</span> Marcar Pagado (Solvente)
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalEstadoDeseado('pendiente')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: modalEstadoDeseado === 'pendiente' ? '2px solid #ef4444' : '1px solid #374151',
                      backgroundColor: modalEstadoDeseado === 'pendiente' ? 'rgba(239, 68, 68, 0.15)' : '#030712',
                      color: modalEstadoDeseado === 'pendiente' ? '#f87171' : '#94a3b8',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>⏳</span> Dejar Pendiente (Deuda)
                  </button>
                </div>
              </div>

              {/* Si tiene Saldo a Favor, opción para usarlo */}
              {(modalApto.saldo_a_favor_usd > 0 || modalApto.saldo_a_favor_bs > 0) && modalEstadoDeseado === 'pagado' && (
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: '#34d399',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <strong>Saldo a Favor Disponible:</strong>{' '}
                    {modalApto.saldo_a_favor_bs > 0 ? `Bs. ${fmtBs(modalApto.saldo_a_favor_bs)}` : `$${fmtUsd(modalApto.saldo_a_favor_usd)}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModalMetodo('Compensación Saldo a Favor')
                      setModalReferencia('SALDO_FAVOR')
                      setModalNota('Pago amortizado con crédito acumulado del residente.')
                    }}
                    style={{
                      backgroundColor: '#10b981',
                      color: '#000',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Usar Saldo a Favor
                  </button>
                </div>
              )}

              {/* Campos complementarios de pago */}
              {modalEstadoDeseado === 'pagado' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                        Método de Pago
                      </label>
                      <input
                        type="text"
                        value={modalMetodo}
                        onChange={e => setModalMetodo(e.target.value)}
                        placeholder="Ej: Transferencia, Pago Móvil"
                        style={{
                          width: '100%',
                          backgroundColor: '#030712',
                          border: '1px solid #374151',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                        Referencia Bancaria
                      </label>
                      <input
                        type="text"
                        value={modalReferencia}
                        onChange={e => setModalReferencia(e.target.value)}
                        placeholder="Ej: 12345678"
                        style={{
                          width: '100%',
                          backgroundColor: '#030712',
                          border: '1px solid #374151',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                      Fecha de Pago
                    </label>
                    <input
                      type="date"
                      value={modalFechaPago}
                      onChange={e => setModalFechaPago(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                      Observaciones / Notas de Auditoría
                    </label>
                    <input
                      type="text"
                      value={modalNota}
                      onChange={e => setModalNota(e.target.value)}
                      placeholder="Nota interna de la administración..."
                      style={{
                        width: '100%',
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#030712',
              borderTop: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setModalPagoOpen(false)}
                disabled={procesandoAccion}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarCambioRecibo}
                disabled={procesandoAccion}
                style={{
                  padding: '9px 20px',
                  backgroundColor: modalEstadoDeseado === 'pagado' ? '#10b981' : 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: procesandoAccion ? 'not-allowed' : 'pointer'
                }}
              >
                {procesandoAccion ? 'Guardando...' : 'Confirmar y Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN CONCEPTOS HISTÓRICOS 2025 */}
      {modalHistOpen && modalHistApto && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  🏛️ Deuda Histórica Año 2025
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Apto {modalHistApto.apartamento_numero} · Modificar conceptos anteriores
                </p>
              </div>
              <button onClick={() => setModalHistOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Deuda Base al Año 2025 (Bs.)
                </label>
                <input
                  type="number"
                  step="any"
                  value={histBase2025}
                  onChange={e => setHistBase2025(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                    Cable Viajero ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={histCableViajero}
                    onChange={e => setHistCableViajero(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                    Guaya ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={histGuaya}
                    onChange={e => setHistGuaya(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Arreglo / Cuota Extraordinaria (Bs.)
                </label>
                <input
                  type="number"
                  step="any"
                  value={histArreglo}
                  onChange={e => setHistArreglo(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalHistOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarHistorico}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Guardar Conceptos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
