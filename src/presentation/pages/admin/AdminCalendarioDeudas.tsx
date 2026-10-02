import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  obtenerMatrizCalendario,
  guardarMontoReciboPersonalizado,
  guardarConceptosHistoricos,
  guardarConfiguracionCalendario,
  guardarCeldaPersonalizada,
  agregarColumnaPersonalizada,
  cambiarSeccionColumna,
  moverColumnaPosicion,
  eliminarColumna,
  agregarFilaPersonalizada,
  ocultarOEliminarFila,
  restaurarFilaOculta,
  sincronizarDatosExcelOficial,
  FilaCalendarioApto,
  ColumnaMes,
  ResumenGlobalCalendario,
  ReciboMesItem,
  ConfiguracionCalendario,
  ColumnaCalendarioConfig,
  PosicionInsercionColumna
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
    columnas: [],
    filasPersonalizadas: [],
    filasOcultasIds: [],
    valoresCeldasPersonalizadas: {}
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

  // Modal para Crear Nueva Columna (Cuota Especial)
  const [modalNuevaColumnaOpen, setModalNuevaColumnaOpen] = useState(false)
  const [nuevaColTitulo, setNuevaColTitulo] = useState('')
  const [nuevaColSeccion, setNuevaColSeccion] = useState<'naranja' | 'azul'>('naranja')
  const [nuevaColMoneda, setNuevaColMoneda] = useState<'USD' | 'BS'>('USD')
  const [nuevaColMontoDefecto, setNuevaColMontoDefecto] = useState<number | ''>('')
  const [nuevaColAplicarATodos, setNuevaColAplicarATodos] = useState(false)
  const [nuevaColPosicion, setNuevaColPosicion] = useState<string>('fin_naranja')

  // Modal para Organizar / Mover Columnas (Naranja ↔ Azul)
  const [modalOrganizarColumnasOpen, setModalOrganizarColumnasOpen] = useState(false)

  // Modal para Agregar Nueva Fila (Local, Conserjería, Depósito, etc.)
  const [modalNuevaFilaOpen, setModalNuevaFilaOpen] = useState(false)
  const [nuevaFilaNumero, setNuevaFilaNumero] = useState('')
  const [nuevaFilaPropietario, setNuevaFilaPropietario] = useState('')
  const [nuevaFilaAlicuota, setNuevaFilaAlicuota] = useState<number | ''>(0.0159)

  // Modal para Ver y Restaurar Filas Ocultas
  const [modalFilasOcultasOpen, setModalFilasOcultasOpen] = useState(false)

  // Modal para Editar Celda de Columna Personalizada (Cuota Especial)
  const [modalCeldaPersonalizadaOpen, setModalCeldaPersonalizadaOpen] = useState(false)
  const [celdaPersApto, setCeldaPersApto] = useState<FilaCalendarioApto | null>(null)
  const [celdaPersCol, setCeldaPersCol] = useState<ColumnaCalendarioConfig | null>(null)
  const [celdaPersMonto, setCeldaPersMonto] = useState<number | ''>('')
  const [celdaPersEstado, setCeldaPersEstado] = useState<'pendiente' | 'pagado'>('pendiente')
  const [celdaPersAplicarATodos, setCeldaPersAplicarATodos] = useState(false)

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

  // ── Columnas dinámicas clasificadas por sección ──────────────────────────
  const columnasNaranja = useMemo(() => {
    return (configuracion.columnas || [])
      .filter(c => c.seccion === 'naranja')
      .sort((a, b) => a.orden - b.orden)
  }, [configuracion.columnas])

  const columnasAzul = useMemo(() => {
    return (configuracion.columnas || [])
      .filter(c => c.seccion === 'azul')
      .sort((a, b) => a.orden - b.orden)
  }, [configuracion.columnas])

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

  // ── Gestión de Columnas Dinámicas y Cuotas Especiales ────────────────────
  const handleAbrirCrearColumna = () => {
    setNuevaColTitulo('')
    setNuevaColSeccion('naranja')
    setNuevaColMoneda('USD')
    setNuevaColMontoDefecto('')
    setNuevaColAplicarATodos(false)
    setNuevaColPosicion('fin_naranja')
    setModalNuevaColumnaOpen(true)
  }

  const handleGuardarNuevaColumna = async () => {
    if (!nuevaColTitulo.trim()) {
      showToast('⚠️ Ingresa un título para la columna')
      return
    }

    setProcesandoAccion(true)
    try {
      let posicionObj: PosicionInsercionColumna = { tipo: 'fin_naranja' }

      if (nuevaColPosicion === 'inicio_naranja') {
        posicionObj = { tipo: 'inicio_naranja' }
      } else if (nuevaColPosicion === 'fin_naranja') {
        posicionObj = { tipo: 'fin_naranja' }
      } else if (nuevaColPosicion === 'inicio_azul') {
        posicionObj = { tipo: 'inicio_azul' }
      } else if (nuevaColPosicion === 'fin_azul') {
        posicionObj = { tipo: 'fin_azul' }
      } else if (nuevaColPosicion.startsWith('despues_de:')) {
        const refId = nuevaColPosicion.replace('despues_de:', '')
        posicionObj = { tipo: 'despues_de', colIdReferencia: refId }
      } else if (nuevaColPosicion.startsWith('antes_de:')) {
        const refId = nuevaColPosicion.replace('antes_de:', '')
        posicionObj = { tipo: 'antes_de', colIdReferencia: refId }
      }

      const res = await agregarColumnaPersonalizada({
        titulo: nuevaColTitulo.trim(),
        seccion: nuevaColSeccion,
        moneda: nuevaColMoneda,
        montoDefecto: Number(nuevaColMontoDefecto || 0),
        posicion: posicionObj,
        aplicarATodos: nuevaColAplicarATodos
      })

      if (res.success) {
        showToast(`✅ Columna "${nuevaColTitulo}" creada exitosamente`)
        setModalNuevaColumnaOpen(false)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleCambiarSeccion = async (colId: string, nuevaSeccion: 'naranja' | 'azul') => {
    setProcesandoAccion(true)
    try {
      const res = await cambiarSeccionColumna(colId, nuevaSeccion)
      if (res.success) {
        showToast(`↔️ Columna movida a sección ${nuevaSeccion === 'naranja' ? 'Naranja (Deudas Pasadas)' : 'Azul (Calendario)'}`)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleMoverColumna = async (colId: string, direccion: 'izquierda' | 'derecha') => {
    const res = await moverColumnaPosicion(colId, direccion)
    if (res.success) {
      await cargarDatos(true)
    }
  }

  const handleEliminarColumnaClick = async (colId: string, titulo: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la columna "${titulo}"?`)) return
    setProcesandoAccion(true)
    try {
      const res = await eliminarColumna(colId)
      if (res.success) {
        showToast(`🗑️ Columna "${titulo}" eliminada`)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Gestión de Filas Dinámicas (Agregar / Quitar Filas) ───────────────────
  const handleGuardarNuevaFila = async () => {
    if (!nuevaFilaNumero.trim()) {
      showToast('⚠️ Ingresa el número o nombre de la unidad')
      return
    }

    setProcesandoAccion(true)
    try {
      const res = await agregarFilaPersonalizada({
        numero: nuevaFilaNumero.trim(),
        propietario: nuevaFilaPropietario.trim() || undefined,
        alicuota: Number(nuevaFilaAlicuota || 0.0159)
      })

      if (res.success) {
        showToast(`✅ Fila "${nuevaFilaNumero}" agregada correctamente`)
        setModalNuevaFilaOpen(false)
        setNuevaFilaNumero('')
        setNuevaFilaPropietario('')
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleOcultarFila = async (filaId: string, aptoNumero: string) => {
    if (!window.confirm(`¿Deseas quitar o esconder la fila "${aptoNumero}" de la tabla?`)) return
    setProcesandoAccion(true)
    try {
      const res = await ocultarOEliminarFila(filaId)
      if (res.success) {
        showToast(`🗑️ Fila "${aptoNumero}" removida. Puedes restaurarla desde "Filas Ocultas"`)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleRestaurarFila = async (filaId: string) => {
    setProcesandoAccion(true)
    try {
      const res = await restaurarFilaOculta(filaId)
      if (res.success) {
        showToast('👁️ Fila restaurada a la tabla')
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Gestión de Celdas de Cuotas Especiales (Columnas Personalizadas) ─────
  const handleAbrirEditarCeldaPersonalizada = (apto: FilaCalendarioApto, col: ColumnaCalendarioConfig) => {
    const celdasPers = apto.valores_personalizados || {}
    const valActual = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : { monto: 0, estado: 'pendiente' })

    setCeldaPersApto(apto)
    setCeldaPersCol(col)
    setCeldaPersMonto(valActual && valActual.monto > 0 ? valActual.monto : (col.montoDefecto || ''))
    setCeldaPersEstado(valActual?.estado || 'pendiente')
    setCeldaPersAplicarATodos(false)
    setModalCeldaPersonalizadaOpen(true)
  }

  const handleGuardarCeldaPersonalizada = async () => {
    if (!celdaPersApto || !celdaPersCol) return
    setProcesandoAccion(true)
    const nuevoMonto = celdaPersMonto === '' ? 0 : Number(celdaPersMonto)

    try {
      if (celdaPersAplicarATodos) {
        for (const filaItem of filas) {
          await guardarCeldaPersonalizada({
            filaId: filaItem.apartamento_id,
            columnaId: celdaPersCol.id,
            monto: nuevoMonto,
            estado: celdaPersEstado
          })
        }
        showToast(`✅ Cuota "${celdaPersCol.titulo}" asignada a todos los apartamentos`)
      } else {
        const res = await guardarCeldaPersonalizada({
          filaId: celdaPersApto.apartamento_id,
          columnaId: celdaPersCol.id,
          monto: nuevoMonto,
          estado: celdaPersEstado
        })
        if (res.success) {
          showToast(`✅ Cuota de ${celdaPersCol.titulo} para Apto ${celdaPersApto.apartamento_numero} guardada`)
        } else {
          showToast(`❌ Error: ${res.error}`)
        }
      }
      setModalCeldaPersonalizadaOpen(false)
      await cargarDatos(true)
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

  // ── Renderizado y cálculo dinámico por celda y columna ───────────────────
  const renderCeldaColumna = (apto: FilaCalendarioApto, col: ColumnaCalendarioConfig) => {
    if (col.tipo === 'historico') {
      let valor = 0
      let esMonedaBs = col.moneda === 'BS'
      if (col.id === 'deuda_2025') { valor = apto.deuda_base_2025; esMonedaBs = true }
      else if (col.id === 'cable_viajero') { valor = apto.cable_viajero; esMonedaBs = false }
      else if (col.id === 'guaya') { valor = apto.guaya; esMonedaBs = false }
      else if (col.id === 'arreglo') { valor = apto.arreglo; esMonedaBs = true }

      return (
        <td
          key={col.id}
          onClick={() => handleAbrirModalHist(apto)}
          style={{
            padding: '10px 10px',
            color: valor > 0 ? (esMonedaBs ? '#fb923c' : '#f87171') : '#475569',
            cursor: 'pointer',
            textAlign: 'right'
          }}
          title={`Clic para editar datos históricos de Apto ${apto.apartamento_numero}`}
        >
          {valor > 0 ? (
            <span style={{ fontWeight: 600 }}>
              {esMonedaBs ? fmtBs(valor) : fmtUsd(valor)}
            </span>
          ) : (
            <span style={{ color: '#334155' }}>-</span>
          )}
        </td>
      )
    }

    if (col.tipo === 'mes') {
      const mesKey = col.mesKey || col.id
      const colMesObj = columnasMeses.find(cm => cm.key === mesKey) || {
        key: mesKey,
        fechaIso: `${mesKey}-01`,
        mesNum: parseInt(mesKey.slice(5), 10) || 1,
        anio: parseInt(mesKey.slice(0, 4), 10) || 2026,
        label: col.titulo,
        moneda: col.moneda,
        esEmitido: true,
        totalMoraUsd: 0,
        totalMoraBs: 0,
        totalPagadoUsd: 0,
        totalPagadoBs: 0,
        aptosConDeudaCount: 0
      }
      const recibo = apto.meses[mesKey]

      if (!recibo) {
        return (
          <td
            key={col.id}
            onClick={() => handleCellClick(apto, colMesObj)}
            style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', color: '#334155' }}
            title={`Sin emitir. Clic para registrar o editar cuota de ${col.titulo}`}
          >
            <span style={{ fontSize: '11px', color: '#475569' }}>-</span>
          </td>
        )
      }

      if (recibo.estado === 'pagado') {
        return (
          <td
            key={col.id}
            onClick={() => handleCellClick(apto, colMesObj)}
            style={{
              padding: '10px 10px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              color: '#34d399',
              textAlign: 'center',
              cursor: 'pointer'
            }}
            title={`Solvente / Pagado: ${col.moneda === 'USD' ? `$${fmtUsd(recibo.total_usd)}` : `Bs. ${fmtBs(recibo.total_bs)}`}`}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, fontSize: '11px' }}>
              <span>✓</span>
              <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>
                {col.moneda === 'USD' ? `$${fmtUsd(recibo.total_usd)}` : `Bs. ${fmtBs(recibo.total_bs)}`}
              </span>
            </div>
          </td>
        )
      }

      // Pendiente
      const monto = col.moneda === 'USD' ? recibo.total_usd : recibo.total_bs
      return (
        <td
          key={col.id}
          onClick={() => handleCellClick(apto, colMesObj)}
          style={{
            padding: '10px 10px',
            backgroundColor: modoChecklistRapido ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.08)',
            color: col.moneda === 'USD' ? '#93c5fd' : '#fb923c',
            fontWeight: 700,
            cursor: 'pointer',
            textAlign: 'right'
          }}
          title={`Pendiente: ${col.moneda === 'USD' ? `$${fmtUsd(monto)}` : `Bs. ${fmtBs(monto)}`}. Clic para pagar o editar`}
        >
          {col.moneda === 'USD' ? `$${fmtUsd(monto)}` : `Bs. ${fmtBs(monto)}`}
        </td>
      )
    }

    // Cuota Especial / Personalizada
    const celdasPers = apto.valores_personalizados || {}
    const celdaVal = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : { monto: 0, estado: 'pendiente' })
    const tieneMonto = celdaVal && celdaVal.monto > 0
    const esPagado = celdaVal?.estado === 'pagado'

    return (
      <td
        key={col.id}
        onClick={() => handleAbrirEditarCeldaPersonalizada(apto, col)}
        style={{
          padding: '10px 10px',
          backgroundColor: tieneMonto ? (esPagado ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 179, 8, 0.12)') : 'transparent',
          color: tieneMonto ? (esPagado ? '#34d399' : '#facc15') : '#475569',
          fontWeight: tieneMonto ? 700 : 400,
          cursor: 'pointer',
          textAlign: 'right'
        }}
        title={`Cuota especial "${col.titulo}". Clic para editar monto o marcar pagada`}
      >
        {tieneMonto ? (
          esPagado ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, fontSize: '11px' }}>
              <span>✓</span>
              <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>
                {col.moneda === 'USD' ? `$${fmtUsd(celdaVal.monto)}` : `Bs. ${fmtBs(celdaVal.monto)}`}
              </span>
            </div>
          ) : (
            <span>
              {col.moneda === 'USD' ? `$${fmtUsd(celdaVal.monto)}` : `Bs. ${fmtBs(celdaVal.monto)}`}
            </span>
          )
        ) : (
          <span style={{ color: '#334155' }}>-</span>
        )}
      </td>
    )
  }

  const calcularTotalColumna = (col: ColumnaCalendarioConfig) => {
    if (col.tipo === 'historico') {
      let sum = 0
      filasFiltradas.forEach(f => {
        if (col.id === 'deuda_2025') sum += f.deuda_base_2025
        else if (col.id === 'cable_viajero') sum += f.cable_viajero
        else if (col.id === 'guaya') sum += f.guaya
        else if (col.id === 'arreglo') sum += f.arreglo
      })
      return (
        <td key={col.id} style={{ padding: '12px 10px', color: col.moneda === 'BS' ? '#fb923c' : '#f87171' }}>
          {sum > 0 ? (col.moneda === 'BS' ? fmtBs(sum) : fmtUsd(sum)) : '-'}
        </td>
      )
    }

    if (col.tipo === 'mes') {
      const mesKey = col.mesKey || col.id
      const sum = filasFiltradas.reduce((s, f) => {
        const rec = f.meses[mesKey]
        if (rec && rec.estado === 'pendiente') {
          return s + (col.moneda === 'USD' ? rec.total_usd : rec.total_bs)
        }
        return s
      }, 0)
      return (
        <td key={col.id} style={{ padding: '12px 10px', color: col.moneda === 'USD' ? '#f87171' : '#fb923c' }}>
          {sum > 0 ? (col.moneda === 'USD' ? `$${fmtUsd(sum)}` : fmtBs(sum)) : '-'}
        </td>
      )
    }

    // Cuota Especial
    const sum = filasFiltradas.reduce((s, f) => {
      const celdasPers = f.valores_personalizados || {}
      const celdaVal = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : null)
      if (celdaVal && celdaVal.estado === 'pendiente' && celdaVal.monto > 0) {
        return s + celdaVal.monto
      }
      return s
    }, 0)
    return (
      <td key={col.id} style={{ padding: '12px 10px', color: '#facc15' }}>
        {sum > 0 ? (col.moneda === 'USD' ? `$${fmtUsd(sum)}` : fmtBs(sum)) : '-'}
      </td>
    )
  }

  // ── Exportar a CSV ───────────────────────────────────────────────────────
  const exportarCsv = () => {
    if (filas.length === 0) return

    const colsVisibles = [
      ...(vistaModo === 'completo' || vistaModo === 'historico_2025' ? columnasNaranja : []),
      ...(vistaModo === 'completo' || vistaModo === 'solo_2026' ? columnasAzul : [])
    ]

    const headers = [
      'APTO',
      'PROPIETARIO',
      ...colsVisibles.map(c => `${c.titulo.toUpperCase().replace(/\s+/g, '_')}_${c.moneda}`),
      'TOTAL_BS',
      'TOTAL_USD',
      'DEPOSITOS_SALDO_USD',
      'DEPOSITOS_SALDO_BS',
      'ESTADO'
    ]

    const rows = filasFiltradas.map(f => {
      const colVals = colsVisibles.map(col => {
        if (col.tipo === 'historico') {
          if (col.id === 'deuda_2025') return f.deuda_base_2025 > 0 ? f.deuda_base_2025.toFixed(2) : '-'
          if (col.id === 'cable_viajero') return f.cable_viajero > 0 ? f.cable_viajero.toFixed(2) : '-'
          if (col.id === 'guaya') return f.guaya > 0 ? f.guaya.toFixed(2) : '-'
          if (col.id === 'arreglo') return f.arreglo > 0 ? f.arreglo.toFixed(2) : '-'
          return '-'
        }
        if (col.tipo === 'mes') {
          const rec = f.meses[col.mesKey || col.id]
          if (!rec) return '-'
          if (rec.estado === 'pagado') return 'PAGADO'
          return col.moneda === 'USD' ? rec.total_usd.toFixed(2) : rec.total_bs.toFixed(2)
        }
        const val = f.valores_personalizados?.[col.id]
        if (!val || val.monto === 0) return '-'
        if (val.estado === 'pagado') return 'PAGADO'
        return val.monto.toFixed(2)
      })

      return [
        f.apartamento_numero,
        `"${(f.propietario_nombre || '').replace(/"/g, '""')}"`,
        ...colVals,
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
                Matriz y línea de tiempo mensual por apartamento con edición total de montos, cuotas especiales y conciliación de solvencia.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales superiores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Botón Nueva Columna (Cuota Especial) */}
          <button
            onClick={handleAbrirCrearColumna}
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
            title="Agregar una columna para cuota especial o concepto extraordinario en la posición exacta deseada"
          >
            <span>➕</span> Nueva Columna (Cuota Especial)
          </button>

          {/* Botón Organizar / Mover Columnas */}
          <button
            onClick={() => setModalOrganizarColumnasOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Mover columnas entre la sección Naranja y el Calendario Azul, reordenarlas o eliminarlas"
          >
            <span>⚙️</span> Organizar Columnas
          </button>

          {/* Botón Agregar Fila (Local, Conserjería, etc.) */}
          <button
            onClick={() => setModalNuevaFilaOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="Agregar una nueva fila a la tabla (Locales comerciales, Conserjería, Depósitos, etc.)"
          >
            <span>➕</span> Agregar Fila
          </button>

          {/* Botón Filas Ocultas (si hay) */}
          {(configuracion.filasOcultasIds || []).length > 0 && (
            <button
              onClick={() => setModalFilasOcultasOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                padding: '9px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Ver y restaurar filas ocultadas o eliminadas"
            >
              <span>👁️</span> Filas Ocultas ({(configuracion.filasOcultasIds || []).length})
            </button>
          )}

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
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <th
                    colSpan={columnasNaranja.length + 1}
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

                {/* Sección Azul (Calendario mensual 2026) */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <th
                    colSpan={columnasAzul.length + 1}
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

              {/* Cabecera Nivel 2: Columnas de datos dinámicas con controles */}
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

                {/* Columnas Sección Naranja */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <>
                    {columnasNaranja.map(col => (
                      <th
                        key={col.id}
                        style={{
                          top: '37px',
                          position: 'sticky',
                          zIndex: 10,
                          backgroundColor: '#0f172a',
                          padding: '8px 10px',
                          textAlign: 'center',
                          verticalAlign: 'bottom'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              fontWeight: 700,
                              color: col.tipo === 'cuota_especial' ? '#facc15' : col.moneda === 'BS' ? '#fb923c' : '#93c5fd'
                            }}>
                              {col.titulo}
                            </span>
                            {col.esPersonalizada && (
                              <span style={{ fontSize: '9px', backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#facc15', padding: '1px 3px', borderRadius: '3px' }}>
                                Cuota
                              </span>
                            )}
                          </div>
                          {/* Controles para cambiar de sección y orden */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => handleMoverColumna(col.id, 'izquierda')}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: '9px' }}
                              title="Mover columna a la izquierda"
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCambiarSeccion(col.id, 'azul')}
                              style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                borderRadius: '4px',
                                color: '#60a5fa',
                                cursor: 'pointer',
                                padding: '1px 4px',
                                fontSize: '8px',
                                fontWeight: 700
                              }}
                              title="Mover esta columna al Calendario Azul (2026)"
                            >
                              ➔ Azul
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoverColumna(col.id, 'derecha')}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: '9px' }}
                              title="Mover columna a la derecha"
                            >
                              ▶
                            </button>
                            {col.esPersonalizada && (
                              <button
                                type="button"
                                onClick={() => handleEliminarColumnaClick(col.id, col.titulo)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '10px' }}
                                title="Eliminar esta columna personalizada"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </th>
                    ))}

                    <th style={{
                      top: '37px',
                      position: 'sticky',
                      zIndex: 10,
                      backgroundColor: '#0f172a',
                      padding: '10px 12px',
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      color: '#fb923c',
                      fontWeight: 800,
                      verticalAlign: 'middle'
                    }}>
                      TOTAL BS
                    </th>
                  </>
                )}

                {/* Columnas Sección Azul */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {columnasAzul.map(col => (
                      <th
                        key={col.id}
                        style={{
                          top: '37px',
                          position: 'sticky',
                          zIndex: 10,
                          backgroundColor: '#0f172a',
                          padding: '8px 10px',
                          textAlign: 'center',
                          verticalAlign: 'bottom'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              fontWeight: 700,
                              color: col.tipo === 'cuota_especial' ? '#facc15' : '#93c5fd'
                            }}>
                              {col.titulo}
                            </span>
                            {col.esPersonalizada && (
                              <span style={{ fontSize: '9px', backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#facc15', padding: '1px 3px', borderRadius: '3px' }}>
                                Cuota
                              </span>
                            )}
                          </div>
                          {/* Controles para cambiar de sección y orden */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => handleMoverColumna(col.id, 'izquierda')}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: '9px' }}
                              title="Mover columna a la izquierda"
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCambiarSeccion(col.id, 'naranja')}
                              style={{
                                background: 'rgba(234, 88, 12, 0.2)',
                                border: '1px solid rgba(234, 88, 12, 0.4)',
                                borderRadius: '4px',
                                color: '#fb923c',
                                cursor: 'pointer',
                                padding: '1px 4px',
                                fontSize: '8px',
                                fontWeight: 700
                              }}
                              title="Mover esta columna a la Sección Naranja (Deudas Pasadas)"
                            >
                              ➔ Naranja
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoverColumna(col.id, 'derecha')}
                              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: '9px' }}
                              title="Mover columna a la derecha"
                            >
                              ▶
                            </button>
                            {col.esPersonalizada && (
                              <button
                                type="button"
                                onClick={() => handleEliminarColumnaClick(col.id, col.titulo)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '10px' }}
                                title="Eliminar esta columna personalizada"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
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
                      fontWeight: 800,
                      verticalAlign: 'middle'
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

            {/* CUERPO DE LA TABLA: FILAS DE APARTAMENTOS Y FILAS PERSONALIZADAS */}
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={columnasNaranja.length + columnasAzul.length + 5} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    No se encontraron apartamentos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((apto, idx) => {
                  const esPar = idx % 2 === 0
                  const bgFila = esPar ? 'rgba(15, 23, 42, 0.4)' : 'rgba(30, 41, 59, 0.25)'

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
                      {/* Columna APTO Sticky con acción de quitar fila */}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: apto.estado_solvente ? '#10b981' : apto.meses_con_deuda >= 4 ? '#ef4444' : '#f59e0b'
                            }} />
                            <span style={{ fontSize: '13px' }}>{apto.apartamento_numero}</span>
                            {apto.esPersonalizada && (
                              <span style={{ fontSize: '9px', backgroundColor: 'rgba(168, 85, 247, 0.25)', color: '#c084fc', padding: '1px 4px', borderRadius: '3px' }}>
                                Personalizada
                              </span>
                            )}
                            {apto.alicuota && (
                              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                                {(apto.alicuota * 100).toFixed(2)}%
                              </span>
                            )}
                          </div>
                          {/* Botón para quitar / ocultar fila */}
                          <button
                            type="button"
                            onClick={() => handleOcultarFila(apto.apartamento_id, apto.apartamento_numero)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              opacity: 0.5
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.opacity = '0.5' }}
                            title={`Quitar o esconder fila de ${apto.apartamento_numero}`}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>

                      {/* Celdas Sección Naranja */}
                      {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                        <>
                          {columnasNaranja.map(col => renderCeldaColumna(apto, col))}

                          {/* TOTAL BS */}
                          <td style={{
                            padding: '8px 12px',
                            fontWeight: 800,
                            color: apto.total_bs > 0 ? '#fb923c' : '#475569',
                            borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                            backgroundColor: apto.total_bs > 0 ? 'rgba(234, 88, 12, 0.04)' : 'transparent'
                          }}>
                            {apto.total_bs > 0 ? fmtBs(apto.total_bs) : '-'}
                          </td>
                        </>
                      )}

                      {/* Celdas Sección Azul */}
                      {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                        <>
                          {columnasAzul.map(col => renderCeldaColumna(apto, col))}

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

                {/* Totales Sección Naranja */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <>
                    {columnasNaranja.map(col => calcularTotalColumna(col))}
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

                {/* Totales Sección Azul */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {columnasAzul.map(col => calcularTotalColumna(col))}
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

      {/* MODAL CREAR NUEVA COLUMNA (CUOTA ESPECIAL) */}
      {modalNuevaColumnaOpen && (
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
            maxWidth: '520px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#facc15' }}>
                  ➕ Nueva Columna (Cuota Especial o Concepto)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fde047' }}>
                  Elige en qué parte irá exactamente (entre meses, al inicio o al final)
                </p>
              </div>
              <button onClick={() => setModalNuevaColumnaOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Nombre / Título de la Columna
                </label>
                <input
                  type="text"
                  value={nuevaColTitulo}
                  onChange={e => setNuevaColTitulo(e.target.value)}
                  placeholder="Ej: Cuota Bombas, Pintura Fachada, Portón Eléctrico..."
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Sección Destino
                  </label>
                  <select
                    value={nuevaColSeccion}
                    onChange={e => setNuevaColSeccion(e.target.value as 'naranja' | 'azul')}
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="naranja">🏛️ Sección Naranja (Deudas Pasadas)</option>
                    <option value="azul">📅 Sección Azul (Calendario)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Moneda
                  </label>
                  <select
                    value={nuevaColMoneda}
                    onChange={e => setNuevaColMoneda(e.target.value as 'USD' | 'BS')}
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="USD">Dólares ($ USD)</option>
                    <option value="BS">Bolívares (Bs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  ¿En qué posición / lugar de la tabla irá la columna?
                </label>
                <select
                  value={nuevaColPosicion}
                  onChange={e => setNuevaColPosicion(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #eab308', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box', fontWeight: 600 }}
                >
                  <optgroup label="🏛️ Sección Naranja (Deudas Pasadas / Extraordinarios)">
                    <option value="inicio_naranja">📍 Al inicio de Sección Naranja</option>
                    {columnasNaranja.map((c, i) => {
                      const nextCol = columnasNaranja[i + 1]
                      return (
                        <option key={c.id} value={`despues_de:${c.id}`}>
                          {nextCol ? `Entre [${c.titulo}] y [${nextCol.titulo}]` : `Después de [${c.titulo}]`}
                        </option>
                      )
                    })}
                    <option value="fin_naranja">📍 Al final de Sección Naranja</option>
                  </optgroup>
                  <optgroup label="📅 Sección Azul (Calendario Mensual)">
                    <option value="inicio_azul">📍 Al inicio del Calendario Azul</option>
                    {columnasAzul.map((c, i) => {
                      const nextCol = columnasAzul[i + 1]
                      return (
                        <option key={c.id} value={`despues_de:${c.id}`}>
                          {nextCol ? `Entre [${c.titulo}] y [${nextCol.titulo}]` : `Después de [${c.titulo}]`}
                        </option>
                      )
                    })}
                    <option value="fin_azul">📍 Al final del Calendario Azul</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Monto Inicial (Opcional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={nuevaColMontoDefecto}
                    onChange={e => setNuevaColMontoDefecto(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '16px' }}>
                  <input
                    type="checkbox"
                    checked={nuevaColAplicarATodos}
                    onChange={e => setNuevaColAplicarATodos(e.target.checked)}
                    style={{ accentColor: '#eab308' }}
                  />
                  <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                    Asignar monto a todos los apartamentos
                  </span>
                </label>
              </div>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalNuevaColumnaOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarNuevaColumna}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: '#eab308', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Crear Columna'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ORGANIZAR / MOVER COLUMNAS ENTRE SECCIONES */}
      {modalOrganizarColumnasOpen && (
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
            maxWidth: '780px',
            maxHeight: '85vh',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  ⚙️ Organizar y Mover Columnas
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Pasa columnas entre la sección Naranja (Deudas pasadas) y el Calendario Azul con un solo clic
                </p>
              </div>
              <button onClick={() => setModalOrganizarColumnasOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
              {/* Sección Naranja */}
              <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(234, 88, 12, 0.3)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(234, 88, 12, 0.2)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#fb923c' }}>
                    🏛️ Sección Naranja ({columnasNaranja.length})
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Deudas pasadas</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {columnasNaranja.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        backgroundColor: '#111827',
                        border: '1px solid #1f2937',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: c.tipo === 'cuota_especial' ? '#facc15' : '#fff' }}>{c.titulo}</span>
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>({c.moneda})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoverColumna(c.id, 'izquierda')}
                          style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}
                          title="Subir orden"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoverColumna(c.id, 'derecha')}
                          style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}
                          title="Bajar orden"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCambiarSeccion(c.id, 'azul')}
                          style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            color: '#60a5fa',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                          title="Mover esta columna al Calendario Azul"
                        >
                          ➔ Azul
                        </button>
                        {c.esPersonalizada && (
                          <button
                            type="button"
                            onClick={() => handleEliminarColumnaClick(c.id, c.titulo)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                            title="Eliminar columna"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección Azul */}
              <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa' }}>
                    📅 Sección Azul ({columnasAzul.length})
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Calendario mensual</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {columnasAzul.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        backgroundColor: '#111827',
                        border: '1px solid #1f2937',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: c.tipo === 'cuota_especial' ? '#facc15' : '#fff' }}>{c.titulo}</span>
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>({c.moneda})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoverColumna(c.id, 'izquierda')}
                          style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}
                          title="Subir orden"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoverColumna(c.id, 'derecha')}
                          style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px' }}
                          title="Bajar orden"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCambiarSeccion(c.id, 'naranja')}
                          style={{
                            background: 'rgba(234, 88, 12, 0.2)',
                            border: '1px solid rgba(234, 88, 12, 0.4)',
                            color: '#fb923c',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                          title="Mover esta columna a la Sección Naranja"
                        >
                          ➔ Naranja
                        </button>
                        {c.esPersonalizada && (
                          <button
                            type="button"
                            onClick={() => handleEliminarColumnaClick(c.id, c.titulo)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                            title="Eliminar columna"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalOrganizarColumnasOpen(false)}
                style={{ padding: '9px 20px', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGREGAR NUEVA FILA (LOCALES, CONSERJERÍA, ETC.) */}
      {modalNuevaFilaOpen && (
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
            border: '2px solid #a855f7',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(168, 85, 247, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#c084fc' }}>
                  ➕ Agregar Fila a la Tabla
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#d8b4fe' }}>
                  Agrega unidades especiales como Locales, Conserjería o Depósitos
                </p>
              </div>
              <button onClick={() => setModalNuevaFilaOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Número / Identificador de la Unidad *
                </label>
                <input
                  type="text"
                  value={nuevaFilaNumero}
                  onChange={e => setNuevaFilaNumero(e.target.value)}
                  placeholder="Ej: Local 1, Conserjería, Depósito 1..."
                  autoFocus
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Propietario / Responsable (Opcional)
                </label>
                <input
                  type="text"
                  value={nuevaFilaPropietario}
                  onChange={e => setNuevaFilaPropietario(e.target.value)}
                  placeholder="Ej: Inversiones ABC, Administración..."
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Alícuota (Opcional, defecto: 0.0159)
                </label>
                <input
                  type="number"
                  step="any"
                  value={nuevaFilaAlicuota}
                  onChange={e => setNuevaFilaAlicuota(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.0159"
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalNuevaFilaOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarNuevaFila}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: '#a855f7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Crear Fila'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIÓN DE FILAS OCULTAS */}
      {modalFilasOcultasOpen && (
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
            maxHeight: '80vh',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  👁️ Filas Ocultas del Calendario
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Puedes restaurar cualquier unidad para que vuelva a mostrarse en la tabla
                </p>
              </div>
              <button onClick={() => setModalFilasOcultasOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(configuracion.filasOcultasIds || []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '30px' }}>
                  No hay filas ocultas actualmente.
                </div>
              ) : (
                (configuracion.filasOcultasIds || []).map(id => (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: '#030712',
                      border: '1px solid #1f2937',
                      borderRadius: '8px'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#fff' }}>ID: {id}</span>
                    <button
                      type="button"
                      onClick={() => handleRestaurarFila(id)}
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        color: '#10b981',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalFilasOcultasOpen(false)}
                style={{ padding: '9px 20px', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR MONTO DE CELDA EN COLUMNA PERSONALIZADA (CUOTA ESPECIAL) */}
      {modalCeldaPersonalizadaOpen && celdaPersApto && celdaPersCol && (
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
                  ✏️ {celdaPersCol.titulo}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fde047' }}>
                  Apto {celdaPersApto.apartamento_numero} · Cuota Especial ({celdaPersCol.moneda})
                </p>
              </div>
              <button onClick={() => setModalCeldaPersonalizadaOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Monto ({celdaPersCol.moneda === 'USD' ? 'Dólares $' : 'Bolívares Bs'}):
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    step="any"
                    value={celdaPersMonto}
                    onChange={e => setCeldaPersMonto(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
                    {celdaPersCol.moneda}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Estado de esta Cuota
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setCeldaPersEstado('pagado')}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: celdaPersEstado === 'pagado' ? '2px solid #10b981' : '1px solid #374151',
                      backgroundColor: celdaPersEstado === 'pagado' ? 'rgba(16, 185, 129, 0.15)' : '#030712',
                      color: celdaPersEstado === 'pagado' ? '#34d399' : '#94a3b8',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Pagado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCeldaPersEstado('pendiente')}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: celdaPersEstado === 'pendiente' ? '2px solid #ef4444' : '1px solid #374151',
                      backgroundColor: celdaPersEstado === 'pendiente' ? 'rgba(239, 68, 68, 0.15)' : '#030712',
                      color: celdaPersEstado === 'pendiente' ? '#f87171' : '#94a3b8',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    ⏳ Pendiente
                  </button>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  checked={celdaPersAplicarATodos}
                  onChange={e => setCeldaPersAplicarATodos(e.target.checked)}
                  style={{ accentColor: '#eab308' }}
                />
                <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                  Aplicar este monto a todos los apartamentos del edificio
                </span>
              </label>
            </div>

            <div style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalCeldaPersonalizadaOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarCeldaPersonalizada}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: '#eab308', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Guardar Cuota'}
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
