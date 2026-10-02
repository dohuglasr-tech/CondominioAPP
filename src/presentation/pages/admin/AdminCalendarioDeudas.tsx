import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  obtenerMatrizCalendario,
  guardarMontoReciboPersonalizado,
  guardarConceptosHistoricos,
  guardarConfiguracionCalendario,
  guardarFilaCuotaEspecial,
  eliminarFilaCuotaEspecial,
  sincronizarDatosExcelOficial,
  FilaCalendarioApto,
  ColumnaMes,
  ResumenGlobalCalendario,
  ReciboMesItem,
  ConfiguracionCalendario,
  FilaCuotaEspecial
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
  const [configuracion, setConfiguracion] = useState<ConfiguracionCalendario>({
    tituloSeccionHistorica: 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS (BS)',
    filasCuotasEspeciales: []
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Filtros y modos
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'con_deuda' | 'solventes'>('todos')
  const [modoChecklistRapido, setModoChecklistRapido] = useState<boolean>(false)
  const [vistaModo, setVistaModo] = useState<'completo' | 'solo_2026' | 'historico_2025'>('completo')

  // Modal para Editar Título de la Sección Histórica
  const [modalEditarTituloOpen, setModalEditarTituloOpen] = useState(false)
  const [nuevoTituloInput, setNuevoTituloInput] = useState('')

  // Modal de Detalle / Edición de Monto / Checklist de Pago
  const [modalPagoOpen, setModalPagoOpen] = useState(false)
  const [modalApto, setModalApto] = useState<FilaCalendarioApto | null>(null)
  const [modalCol, setModalCol] = useState<ColumnaMes | null>(null)
  const [modalRecibo, setModalRecibo] = useState<ReciboMesItem | null>(null)
  const [modalMontoEditado, setModalMontoEditado] = useState<number | ''>('')
  const [modalMonedaEditada, setModalMonedaEditada] = useState<'USD' | 'BS'>('USD')
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

  // Modal para Crear / Editar Fila de Cuota Especial
  const [modalFilaEspecialOpen, setModalFilaEspecialOpen] = useState(false)
  const [filaEspecialEditandoId, setFilaEspecialEditandoId] = useState<string | null>(null)
  const [nuevaFilaNombre, setNuevaFilaNombre] = useState('')
  const [nuevaFilaMoneda, setNuevaFilaMoneda] = useState<'USD' | 'BS'>('USD')
  const [nuevaFilaMontoDefecto, setNuevaFilaMontoDefecto] = useState<number | ''>(10)
  const [nuevaFilaAplicarATodos, setNuevaFilaAplicarATodos] = useState(true)

  // Modal para Editar Celda de Fila Especial
  const [modalCeldaEspecialOpen, setModalCeldaEspecialOpen] = useState(false)
  const [cuotaEspecialSeleccionada, setCuotaEspecialSeleccionada] = useState<FilaCuotaEspecial | null>(null)
  const [columnaEspecialSeleccionada, setColumnaEspecialSeleccionada] = useState<{ key: string; label: string } | null>(null)
  const [montoCeldaEspecialInput, setMontoCeldaEspecialInput] = useState<number | ''>('')

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
        if (res.configuracion) {
          setConfiguracion(res.configuracion)
        }
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

  // ── Subconjuntos limpios de columnas sin duplicados ──────────────────────
  // En el bloque histórico en Bs: Enero y Febrero 2026
  const colsHistoricasBs = useMemo(() => {
    return columnasMeses.filter(c => c.moneda === 'BS')
  }, [columnasMeses])

  // En el bloque de dólares 2026: Marzo a Diciembre
  const colsDolares2026 = useMemo(() => {
    return columnasMeses.filter(c => c.moneda === 'USD')
  }, [columnasMeses])

  // ── Filtrado de filas ────────────────────────────────────────────────────
  const filasFiltradas = useMemo(() => {
    return filas.filter(f => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const aptoMatch = f.apartamento_numero.toLowerCase().includes(q)
        const propMatch = (f.propietario_nombre || '').toLowerCase().includes(q)
        if (!aptoMatch && !propMatch) return false
      }

      if (filtroEstado === 'con_deuda' && f.estado_solvente) return false
      if (filtroEstado === 'solventes' && !f.estado_solvente) return false

      return true
    })
  }, [filas, busqueda, filtroEstado])

  // ── Abrir modal de gestión para una celda mensual ─────────────────────────
  const handleCellClick = (apto: FilaCalendarioApto, col: ColumnaMes) => {
    const recibo = apto.meses[col.key]

    if (modoChecklistRapido && recibo && recibo.estado === 'pendiente') {
      ejecutarToggleRapido(apto, col, recibo, 'pagado')
      return
    }

    const montoActual = recibo
      ? (col.moneda === 'USD' ? recibo.total_usd : recibo.total_bs)
      : (col.moneda === 'USD' ? 12.91 : 2916.05)

    setModalApto(apto)
    setModalCol(col)
    setModalRecibo(recibo)
    setModalMontoEditado(montoActual)
    setModalMonedaEditada(col.moneda)
    setModalEstadoDeseado(recibo ? recibo.estado : 'pendiente')
    setModalReferencia('')
    setModalMetodo('Transferencia Bancaria')
    setModalFechaPago(new Date().toISOString().slice(0, 10))
    setModalNota('')
    setModalPagoOpen(true)
  }

  // ── Toggle rápido ────────────────────────────────────────────────────────
  const ejecutarToggleRapido = async (
    apto: FilaCalendarioApto,
    col: ColumnaMes,
    recibo: ReciboMesItem | null,
    nuevoEstado: 'pagado' | 'pendiente'
  ) => {
    const mesLabelCompleto = `${col.label} ${col.anio}`
    const monto = recibo ? (col.moneda === 'USD' ? recibo.total_usd : recibo.total_bs) : (col.moneda === 'USD' ? 12.91 : 2916.05)

    // Actualización optimista local
    setFilas(prev => prev.map(f => {
      if (f.apartamento_id !== apto.apartamento_id) return f
      const mesesActualizados = { ...f.meses }
      if (mesesActualizados[col.key]) {
        mesesActualizados[col.key] = {
          ...mesesActualizados[col.key]!,
          estado: nuevoEstado
        }
      }

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

    await guardarMontoReciboPersonalizado({
      reciboId: recibo?.id,
      apartamentoId: apto.apartamento_id,
      apartamentoNumero: apto.apartamento_numero,
      mesFacturadoIso: col.fechaIso,
      mesLabel: mesLabelCompleto,
      nuevoMonto: monto,
      moneda: col.moneda,
      estado: nuevoEstado,
      referencia: 'CHECKLIST_RAPIDO',
      metodo: 'Modo Checklist Directo',
      fechaPago: new Date().toISOString().slice(0, 10),
      autorNombre: perfil?.nombre_completo || 'Administrador'
    })
  }

  // ── Guardar cambio de monto o estado desde Modal de Pago ──────────────────
  const handleGuardarCambioRecibo = async () => {
    if (!modalApto || !modalCol) return
    setProcesandoAccion(true)

    const mesLabelCompleto = `${modalCol.label} ${modalCol.anio}`
    const montoFinal = modalMontoEditado === '' ? 0 : Number(modalMontoEditado)

    try {
      const res = await guardarMontoReciboPersonalizado({
        reciboId: modalRecibo?.id,
        apartamentoId: modalApto.apartamento_id,
        apartamentoNumero: modalApto.apartamento_numero,
        mesFacturadoIso: modalCol.fechaIso,
        mesLabel: mesLabelCompleto,
        nuevoMonto: montoFinal,
        moneda: modalMonedaEditada,
        estado: modalEstadoDeseado,
        referencia: modalReferencia,
        metodo: modalMetodo,
        fechaPago: modalFechaPago,
        nota: modalNota,
        autorNombre: perfil?.nombre_completo || 'Administrador'
      })

      if (res.success) {
        showToast(`✅ Apto ${modalApto.apartamento_numero}: Monto actualizado a ${modalMonedaEditada === 'USD' ? `$${montoFinal}` : `Bs. ${montoFinal}`} (${modalEstadoDeseado.toUpperCase()})`)
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

  // ── Guardar nuevo título de sección histórica ────────────────────────────
  const handleGuardarTituloSeccion = async () => {
    if (!nuevoTituloInput.trim()) return
    setProcesandoAccion(true)
    try {
      const res = await guardarConfiguracionCalendario({
        tituloSeccionHistorica: nuevoTituloInput.trim()
      })
      if (res.success) {
        setConfiguracion(res.data)
        showToast('✅ Título de sección actualizado correctamente')
        setModalEditarTituloOpen(false)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
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

  // ── Gestión de Filas de Cuotas Especiales (Línea Amarilla) ────────────────
  const handleAbrirCrearFilaEspecial = (cuotaExistente?: FilaCuotaEspecial) => {
    if (cuotaExistente) {
      setFilaEspecialEditandoId(cuotaExistente.id)
      setNuevaFilaNombre(cuotaExistente.nombre)
      setNuevaFilaMoneda(cuotaExistente.moneda)
      setNuevaFilaMontoDefecto(cuotaExistente.montoDefecto)
      setNuevaFilaAplicarATodos(false)
    } else {
      setFilaEspecialEditandoId(null)
      setNuevaFilaNombre('')
      setNuevaFilaMoneda('USD')
      setNuevaFilaMontoDefecto(10)
      setNuevaFilaAplicarATodos(true)
    }
    setModalFilaEspecialOpen(true)
  }

  const handleGuardarFilaEspecial = async () => {
    if (!nuevaFilaNombre.trim()) {
      showToast('⚠️ Ingresa un nombre para la cuota especial')
      return
    }

    setProcesandoAccion(true)
    try {
      const id = filaEspecialEditandoId || `cuota-${Date.now()}`
      const montoDefectoNum = Number(nuevaFilaMontoDefecto || 0)

      // Poblar valores por apartamento
      const valoresMap: Record<string, { monto: number; estado: 'pendiente' | 'pagado' }> = {}
      filas.forEach(f => {
        valoresMap[f.apartamento_id] = {
          monto: nuevaFilaAplicarATodos ? montoDefectoNum : 0,
          estado: 'pendiente'
        }
      })

      const cuotaPayload: FilaCuotaEspecial = {
        id,
        nombre: nuevaFilaNombre.trim(),
        moneda: nuevaFilaMoneda,
        montoDefecto: montoDefectoNum,
        valoresPorApto: valoresMap,
        created_at: new Date().toISOString()
      }

      const res = await guardarFilaCuotaEspecial(cuotaPayload)
      if (res.success) {
        showToast(`✅ Fila de cuota especial "${cuotaPayload.nombre}" guardada`)
        setModalFilaEspecialOpen(false)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleEliminarFilaEspecial = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuota especial "${nombre}"?`)) return
    const res = await eliminarFilaCuotaEspecial(id)
    if (res.success) {
      showToast(`🗑️ Fila especial eliminada`)
      await cargarDatos(true)
    }
  }

  const handleAbrirEditarCeldaEspecial = (cuota: FilaCuotaEspecial, colKey: string, colLabel: string) => {
    const valActual = cuota.montosPorColumna?.[colKey] ?? cuota.montoDefecto
    setCuotaEspecialSeleccionada(cuota)
    setColumnaEspecialSeleccionada({ key: colKey, label: colLabel })
    setMontoCeldaEspecialInput(valActual > 0 ? valActual : '')
    setModalCeldaEspecialOpen(true)
  }

  const handleGuardarMontoCeldaEspecial = async () => {
    if (!cuotaEspecialSeleccionada || !columnaEspecialSeleccionada) return
    setProcesandoAccion(true)
    const nuevoMonto = montoCeldaEspecialInput === '' ? 0 : Number(montoCeldaEspecialInput)
    const colKey = columnaEspecialSeleccionada.key

    try {
      const montosActualizados = {
        ...(cuotaEspecialSeleccionada.montosPorColumna || {}),
        [colKey]: nuevoMonto
      }

      const valoresActualizados = { ...cuotaEspecialSeleccionada.valoresPorApto }
      filas.forEach(f => {
        const prev = valoresActualizados[f.apartamento_id] || { monto: cuotaEspecialSeleccionada.montoDefecto, estado: 'pendiente' }
        valoresActualizados[f.apartamento_id] = {
          ...prev,
          monto: nuevoMonto > 0 ? nuevoMonto : prev.monto
        }
      })

      const res = await guardarFilaCuotaEspecial({
        ...cuotaEspecialSeleccionada,
        montoDefecto: nuevoMonto > 0 ? nuevoMonto : cuotaEspecialSeleccionada.montoDefecto,
        montosPorColumna: montosActualizados,
        valoresPorApto: valoresActualizados
      })

      if (res.success) {
        showToast(`✅ Cuota "${cuotaEspecialSeleccionada.nombre}" en ${columnaEspecialSeleccionada.label} fijada en ${cuotaEspecialSeleccionada.moneda === 'USD' ? `$${nuevoMonto}` : `Bs. ${nuevoMonto}`}`)
        setModalCeldaEspecialOpen(false)
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

  // ── Exportar a CSV ───────────────────────────────────────────────────────
  const exportarCsv = () => {
    if (filas.length === 0) return

    const headers = [
      'APTO',
      'PROPIETARIO',
      'DEUDA_2025_BS',
      'CABLE_VIAJERO',
      'GUAYA',
      'ARREGLO_BS',
      ...colsHistoricasBs.map(c => `${c.label.toUpperCase()}_BS`),
      'TOTAL_BS',
      ...colsDolares2026.map(c => `${c.label.toUpperCase()}_USD`),
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
        ...colsHistoricasBs.map(c => {
          const rec = f.meses[c.key]
          return rec && rec.estado === 'pendiente' ? rec.total_bs.toFixed(2) : '-'
        }),
        f.total_bs > 0 ? f.total_bs.toFixed(2) : '0.00',
        ...colsDolares2026.map(c => {
          const rec = f.meses[c.key]
          return rec && rec.estado === 'pendiente' ? rec.total_usd.toFixed(2) : '-'
        }),
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
                Matriz y línea de tiempo mensual por apartamento con edición total de montos, cuotas especiales y conciliación de solvencia.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales superiores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Botón Nueva Fila de Cuota Especial (Línea Amarilla) */}
          <button
            onClick={() => handleAbrirCrearFilaEspecial()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#facc15',
              border: '1px solid rgba(234, 179, 8, 0.4)',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            title="Crea una fila resaltada en amarillo para cuotas especiales, arreglos o fondos extraordinarios"
          >
            <span>➕</span> Fila de Cuota Especial
          </button>

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
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
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

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
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

        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
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

        <div style={{ backgroundColor: '#111827', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '14px', padding: '16px 20px' }}>
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

      {/* Barra de Filtros */}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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

                {/* Sección 2025 / Conceptos Extraordinarios (Título Editable) */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <th
                    colSpan={7}
                    onClick={() => {
                      setNuevoTituloInput(configuracion.tituloSeccionHistorica)
                      setModalEditarTituloOpen(true)
                    }}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'rgba(234, 88, 12, 0.15)',
                      color: '#fb923c',
                      padding: '8px 12px',
                      textAlign: 'center',
                      fontWeight: 800,
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      letterSpacing: '0.5px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    title="Clic para editar el título de esta sección"
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span>🏛️ {configuracion.tituloSeccionHistorica}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setNuevoTituloInput(configuracion.tituloSeccionHistorica)
                          setModalEditarTituloOpen(true)
                        }}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                          color: '#fb923c',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                        title="Clic para editar el texto del encabezado"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </th>
                )}

                {/* Sección 2026 (Marzo a Diciembre en Dólares) */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <th
                    colSpan={colsDolares2026.length + 1}
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
                    📅 AÑO {anioSeleccionado} (EMISIÓN Y LÍNEA DE TIEMPO EN $)
                  </th>
                )}

                {/* Resumen */}
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

                {/* Subcolumnas 2025 + Enero y Febrero (Bs) */}
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
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px', color: '#fb923c' }}>
                      Ene (Bs)
                    </th>
                    <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 10px', color: '#fb923c' }}>
                      Feb (Bs)
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

                {/* Subcolumnas Meses en Dólares (Marzo a Diciembre) */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {colsDolares2026.map(col => (
                      <th
                        key={col.key}
                        style={{
                          top: '37px',
                          position: 'sticky',
                          zIndex: 10,
                          backgroundColor: '#0f172a',
                          padding: '10px 12px',
                          fontWeight: 700,
                          color: '#93c5fd'
                        }}
                      >
                        {col.label} $
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

            {/* FILAS DE CUOTAS ESPECIALES (LÍNEA AMARILLA) */}
            {configuracion.filasCuotasEspeciales.length > 0 ? (
              <tbody>
                {configuracion.filasCuotasEspeciales.map(cuota => {
                  return (
                    <tr
                      key={cuota.id}
                      style={{
                        backgroundColor: 'rgba(234, 179, 8, 0.08)',
                        borderBottom: '2px solid #eab308',
                        color: '#facc15'
                      }}
                    >
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        backgroundColor: '#1c1917',
                        borderLeft: '4px solid #facc15',
                        borderRight: '2px solid #374151',
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontWeight: 800
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>⚡</span>
                            <span>{cuota.nombre}</span>
                            <span style={{ fontSize: '9px', backgroundColor: 'rgba(234, 179, 8, 0.25)', padding: '1px 4px', borderRadius: '3px' }}>
                              {cuota.moneda}
                            </span>
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleAbrirCrearFilaEspecial(cuota)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#facc15', padding: '2px' }}
                              title="Editar nombre o moneda de la cuota especial"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarFilaEspecial(cuota.id, cuota.nombre)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#ef4444', padding: '2px' }}
                              title="Eliminar esta fila de cuota especial"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Celdas históricas para esta cuota especial */}
                      {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                        <>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, 'deuda_2025', 'Deuda 2025')}
                            style={{ padding: '8px 12px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Deuda 2025 de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.['deuda_2025'] ? (
                              <span style={{ fontWeight: 700 }}>Bs. {fmtBs(cuota.montosPorColumna['deuda_2025'])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, 'cable_viajero', 'Cable Viajero')}
                            style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Cable Viajero de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.['cable_viajero'] ? (
                              <span style={{ fontWeight: 700 }}>${fmtUsd(cuota.montosPorColumna['cable_viajero'])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, 'guaya', 'Guaya')}
                            style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Guaya de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.['guaya'] ? (
                              <span style={{ fontWeight: 700 }}>${fmtUsd(cuota.montosPorColumna['guaya'])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, 'arreglo', 'Arreglo')}
                            style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Arreglo de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.['arreglo'] ? (
                              <span style={{ fontWeight: 700 }}>Bs. {fmtBs(cuota.montosPorColumna['arreglo'])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, `${anioSeleccionado}-01`, 'Enero Bs')}
                            style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Enero Bs de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.[`${anioSeleccionado}-01`] ? (
                              <span style={{ fontWeight: 700 }}>Bs. {fmtBs(cuota.montosPorColumna[`${anioSeleccionado}-01`])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td
                            onClick={() => handleAbrirEditarCeldaEspecial(cuota, `${anioSeleccionado}-02`, 'Febrero Bs')}
                            style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                            title={`Clic para editar Febrero Bs de ${cuota.nombre}`}
                          >
                            {cuota.montosPorColumna?.[`${anioSeleccionado}-02`] ? (
                              <span style={{ fontWeight: 700 }}>Bs. {fmtBs(cuota.montosPorColumna[`${anioSeleccionado}-02`])}</span>
                            ) : (
                              <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', borderRight: '2px solid rgba(234, 88, 12, 0.35)', fontWeight: 800, color: '#facc15' }}>
                            {cuota.moneda === 'BS' ? `Bs. ${fmtBs(cuota.montoDefecto * (filasFiltradas.length || 1))}` : '-'}
                          </td>
                        </>
                      )}

                      {/* Celdas de meses para la cuota especial */}
                      {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                        <>
                          {colsDolares2026.map(col => {
                            const montoCol = cuota.montosPorColumna?.[col.key] || (cuota.moneda === 'USD' ? cuota.montoDefecto : 0)
                            return (
                              <td
                                key={col.key}
                                onClick={() => handleAbrirEditarCeldaEspecial(cuota, col.key, `${col.label} ${col.anio}`)}
                                style={{ padding: '8px 10px', color: '#facc15', cursor: 'pointer', textAlign: 'center' }}
                                title={`Clic para editar ${col.label} de ${cuota.nombre}`}
                              >
                                {montoCol > 0 ? (
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(234, 179, 8, 0.25)',
                                    fontWeight: 700,
                                    fontSize: '11px'
                                  }}>
                                    ${fmtUsd(montoCol)}
                                  </div>
                                ) : (
                                  <span style={{ color: '#854d0e', fontSize: '11px' }}>-</span>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ padding: '8px 12px', borderRight: '2px solid rgba(59, 130, 246, 0.35)', fontWeight: 800, color: '#facc15' }}>
                            {cuota.moneda === 'USD' ? `$${fmtUsd(cuota.montoDefecto * (filasFiltradas.length || 1))}` : '-'}
                          </td>
                        </>
                      )}

                      <td style={{ padding: '8px 12px', color: '#facc15' }}>-</td>
                      <td style={{ padding: '8px 14px', color: '#facc15' }}>Cuota General</td>
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                          Activa
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ) : (
              <tbody>
                <tr style={{ backgroundColor: 'rgba(234, 179, 8, 0.04)', borderBottom: '1px dashed rgba(234, 179, 8, 0.3)' }}>
                  <td colSpan={24} style={{ padding: '8px 16px', textAlign: 'left' }}>
                    <button
                      type="button"
                      onClick={() => handleAbrirCrearFilaEspecial()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'none',
                        border: '1px dashed #eab308',
                        color: '#facc15',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <span>⚡</span>
                      <span>+ Agregar Fila para Cuota Especial (Línea Amarilla de Conceptos Extraordinarios)</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            )}

            {/* CUERPO DE LA TABLA: FILAS DE APARTAMENTOS */}
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

                  // Totales del apartamento
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

                      {/* Celdas Históricas 2025 + Enero y Febrero (Bs) */}
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
                            title="Clic para editar monto de deuda 2025"
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
                            title="Clic para editar Cable Viajero"
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
                            title="Clic para editar Guaya"
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
                            title="Clic para editar Arreglo"
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
                                title="Clic para editar monto o conciliar Enero (Bs)"
                              >
                                {tieneDeuda ? fmtBs(recEne.total_bs) : '-'}
                              </td>
                            )
                          })()}

                          {/* Febrero (Bs) */}
                          {(() => {
                            const recFeb = apto.meses[`${anioSeleccionado}-02`]
                            const colFeb = columnasMeses.find(c => c.key === `${anioSeleccionado}-02`)
                            const tieneDeuda = recFeb && recFeb.estado === 'pendiente'
                            return (
                              <td
                                onClick={() => colFeb && handleCellClick(apto, colFeb)}
                                style={{
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                  fontWeight: tieneDeuda ? 700 : 500,
                                  color: tieneDeuda ? '#fb923c' : '#475569'
                                }}
                                title="Clic para editar monto o conciliar Febrero (Bs)"
                              >
                                {tieneDeuda ? fmtBs(recFeb.total_bs) : '-'}
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

                      {/* Celdas Meses en Dólares (Marzo a Diciembre) */}
                      {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                        <>
                          {colsDolares2026.map(col => {
                            const recibo = apto.meses[col.key]
                            const tieneDeuda = recibo && recibo.estado === 'pendiente'
                            const monto = recibo?.total_usd || 0

                            return (
                              <td
                                key={col.key}
                                onClick={() => handleCellClick(apto, col)}
                                style={{
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                  userSelect: 'none'
                                }}
                                title={`Apto ${apto.apartamento_numero}: Clic para editar monto o marcar pago de ${col.label}`}
                              >
                                {tieneDeuda ? (
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: modoChecklistRapido ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    fontWeight: 700,
                                    fontSize: '11px'
                                  }}>
                                    ${fmtUsd(monto)}
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

                {/* Totales 2025 + Enero y Febrero (Bs) */}
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
                    <td style={{ padding: '12px 10px', color: '#fb923c' }}>
                      {fmtBs(filasFiltradas.reduce((s, f) => {
                        const rec = f.meses[`${anioSeleccionado}-02`]
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

                {/* Totales Meses en Dólares */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {colsDolares2026.map(col => {
                      const totalCol = filasFiltradas.reduce((s, f) => {
                        const rec = f.meses[col.key]
                        if (rec && rec.estado === 'pendiente') {
                          return s + rec.total_usd
                        }
                        return s
                      }, 0)
                      return (
                        <td key={col.key} style={{ padding: '12px 8px', color: totalCol > 0 ? '#f87171' : '#64748b' }}>
                          {totalCol > 0 ? `$${fmtUsd(totalCol)}` : '-'}
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

      {/* MODAL EDITAR TÍTULO DE SECCIÓN */}
      {modalEditarTituloOpen && (
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
            maxWidth: '460px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                ✏️ Editar Nombre de la Sección
              </h3>
              <button onClick={() => setModalEditarTituloOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 700 }}>
                Texto del Encabezado
              </label>
              <input
                type="text"
                value={nuevoTituloInput}
                onChange={e => setNuevoTituloInput(e.target.value)}
                placeholder="Ej: DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS (BS)"
                style={{
                  width: '100%',
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalEditarTituloOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarTituloSeccion}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Guardar Título'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR FILA DE CUOTA ESPECIAL (LÍNEA AMARILLA) */}
      {modalFilaEspecialOpen && (
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
            border: '2px solid #eab308',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#facc15' }}>
                  ⚡ Fila de Cuota Especial
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fde047' }}>
                  Agrega una fila resaltada en amarillo para conceptos o cuotas adicionales
                </p>
              </div>
              <button onClick={() => setModalFilaEspecialOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Nombre de la Cuota Especial
                </label>
                <input
                  type="text"
                  value={nuevaFilaNombre}
                  onChange={e => setNuevaFilaNombre(e.target.value)}
                  placeholder="Ej: Reparación de Bomba Hidroneumática, Portón Eléctrico..."
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Moneda
                  </label>
                  <select
                    value={nuevaFilaMoneda}
                    onChange={e => setNuevaFilaMoneda(e.target.value as 'USD' | 'BS')}
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="USD">Dólares ($ USD)</option>
                    <option value="BS">Bolívares (Bs)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Monto Cuota
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={nuevaFilaMontoDefecto}
                    onChange={e => setNuevaFilaMontoDefecto(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="10.00"
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={nuevaFilaAplicarATodos}
                  onChange={e => setNuevaFilaAplicarATodos(e.target.checked)}
                  style={{ accentColor: '#eab308' }}
                />
                <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                  Asignar este monto inicialmente a todos los apartamentos
                </span>
              </label>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalFilaEspecialOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarFilaEspecial}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: '#eab308', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Crear Fila Especial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR MONTO DE CELDA EN FILA ESPECIAL */}
      {modalCeldaEspecialOpen && cuotaEspecialSeleccionada && columnaEspecialSeleccionada && (
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
            border: '2px solid #eab308',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#facc15' }}>
                  ⚡ Editar Cuota Especial
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fde047' }}>
                  {cuotaEspecialSeleccionada.nombre} · {columnaEspecialSeleccionada.label}
                </p>
              </div>
              <button onClick={() => setModalCeldaEspecialOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Monto a Cobrar ({cuotaEspecialSeleccionada.moneda === 'USD' ? 'Dólares $' : 'Bolívares Bs'}):
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    step="any"
                    value={montoCeldaEspecialInput}
                    onChange={e => setMontoCeldaEspecialInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    autoFocus
                    style={{
                      flex: 1,
                      backgroundColor: '#030712',
                      border: '1px solid #eab308',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    backgroundColor: '#1f2937',
                    borderRadius: '8px',
                    color: '#facc15',
                    fontWeight: 800,
                    fontSize: '14px'
                  }}>
                    {cuotaEspecialSeleccionada.moneda}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                💡 Este monto se registrará para la columna <strong>{columnaEspecialSeleccionada.label}</strong> en la fila especial y se actualizará automáticamente en el total de mora del edificio.
              </div>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalCeldaEspecialOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarMontoCeldaEspecial}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: '#eab308', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Guardar Monto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE / EDICIÓN DE MONTO / CHECKLIST DE PAGO */}
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
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  ✏️ Gestión y Edición de Cuota
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Apto {modalApto.apartamento_numero} · {modalApto.propietario_nombre || 'Sin Propietario'}
                </p>
              </div>
              <button
                onClick={() => setModalPagoOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
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
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Estado Actual
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: modalRecibo?.estado === 'pagado' ? '#34d399' : '#f87171', marginTop: '2px' }}>
                    {modalRecibo?.estado === 'pagado' ? '🟢 Pagado' : '🔴 Pendiente'}
                  </div>
                </div>
              </div>

              {/* INPUT DE MONTO EDITABLE */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Monto de esta cuota (Editable por el admin):
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    step="any"
                    value={modalMontoEditado}
                    onChange={e => setModalMontoEditado(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <select
                    value={modalMonedaEditada}
                    onChange={e => setModalMonedaEditada(e.target.value as 'USD' | 'BS')}
                    style={{
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="BS">Bolívares (Bs)</option>
                  </select>
                </div>
              </div>

              {/* CHECKLIST DE ESTADO */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Asignar estado a esta cuota:
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

              {/* Saldo a Favor disponible */}
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

              {/* Datos complementarios cuando se marca como pagado */}
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
                        style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '12px', boxSizing: 'border-box' }}
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
                        style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '12px', boxSizing: 'border-box' }}
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
                      style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                      Observaciones / Notas
                    </label>
                    <input
                      type="text"
                      value={modalNota}
                      onChange={e => setModalNota(e.target.value)}
                      placeholder="Nota interna de la administración..."
                      style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', padding: '8px 10px', borderRadius: '8px', color: '#fff', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalPagoOpen(false)}
                disabled={procesandoAccion}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
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
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  🏛️ Conceptos Deuda Histórica Año 2025
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Apto {modalHistApto.apartamento_numero} · Modificar montos históricos
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
