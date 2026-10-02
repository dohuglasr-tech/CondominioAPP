import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  obtenerMatrizCalendario,
  guardarMontoReciboPersonalizado,
  guardarConceptosHistoricos,
  guardarConfiguracionCalendario,
  guardarCeldaPersonalizada,
  agregarColumnaPersonalizada,
  cambiarSeccionColumna,
  cambiarMonedaColumna,
  moverColumnaPosicion,
  eliminarColumna,
  restablecerColumnasPorDefecto,
  sincronizarDatosExcelOficial,
  parsearMontoFlexible,
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
    tituloSeccionHistorica: 'DEUDAS PASADAS / CONCEPTOS EXTRAORDINARIOS (BS)',
    tituloSeccionMensual: 'CALENDARIO MENSUAL 2026 (EMISIÓN)',
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

  // Modal para Editar Título de Secciones
  const [modalEditarTituloOpen, setModalEditarTituloOpen] = useState(false)
  const [seccionTituloEditando, setSeccionTituloEditando] = useState<'naranja' | 'azul'>('naranja')
  const [nuevoTituloInput, setNuevoTituloInput] = useState('')

  // Menú flotante de columna (dropdown individual en cabecera)
  const [menuColumnaId, setMenuColumnaId] = useState<string | null>(null)

  // Modal de Detalle / Edición de Monto / Checklist de Pago
  const [modalPagoOpen, setModalPagoOpen] = useState(false)
  const [modalApto, setModalApto] = useState<FilaCalendarioApto | null>(null)
  const [modalCol, setModalCol] = useState<ColumnaMes | null>(null)
  const [modalRecibo, setModalRecibo] = useState<ReciboMesItem | null>(null)
  const [modalMontoEditado, setModalMontoEditado] = useState<string>('')
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
  const [histBase2025, setHistBase2025] = useState<string>('')
  const [histMonedaBase2025, setHistMonedaBase2025] = useState<'USD' | 'BS'>('BS')
  const [histCableViajero, setHistCableViajero] = useState<string>('')
  const [histMonedaCableViajero, setHistMonedaCableViajero] = useState<'USD' | 'BS'>('USD')
  const [histGuaya, setHistGuaya] = useState<string>('')
  const [histMonedaGuaya, setHistMonedaGuaya] = useState<'USD' | 'BS'>('USD')
  const [histArreglo, setHistArreglo] = useState<string>('')
  const [histMonedaArreglo, setHistMonedaArreglo] = useState<'USD' | 'BS'>('BS')

  // Modal para Crear Nueva Columna (Cuota Especial o concepto vertical)
  const [modalNuevaColumnaOpen, setModalNuevaColumnaOpen] = useState(false)
  const [nuevaColTitulo, setNuevaColTitulo] = useState('')
  const [nuevaColSeccion, setNuevaColSeccion] = useState<'naranja' | 'azul'>('naranja')
  const [nuevaColMoneda, setNuevaColMoneda] = useState<'USD' | 'BS'>('USD')
  const [nuevaColMontoDefecto, setNuevaColMontoDefecto] = useState<string>('')
  const [nuevaColAplicarATodos, setNuevaColAplicarATodos] = useState(false)
  const [nuevaColPosicion, setNuevaColPosicion] = useState<string>('fin_naranja')

  // Modal para Organizar / Mover Columnas entre Secciones
  const [modalOrganizarColumnasOpen, setModalOrganizarColumnasOpen] = useState(false)

  // Modal para Editar Celda de Columna Personalizada (Cuota Especial)
  const [modalCeldaPersonalizadaOpen, setModalCeldaPersonalizadaOpen] = useState(false)
  const [celdaPersApto, setCeldaPersApto] = useState<FilaCalendarioApto | null>(null)
  const [celdaPersCol, setCeldaPersCol] = useState<ColumnaCalendarioConfig | null>(null)
  const [celdaPersMonto, setCeldaPersMonto] = useState<string>('')
  const [celdaPersEstado, setCeldaPersEstado] = useState<'pendiente' | 'pagado'>('pendiente')
  const [celdaPersMoneda, setCeldaPersMoneda] = useState<'USD' | 'BS'>('USD')
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

  useEffect(() => {
    const handleClickOutside = () => setMenuColumnaId(null)
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

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
    setModalMontoEditado(montoActual > 0 ? (col.moneda === 'BS' ? fmtBs(montoActual) : montoActual.toFixed(2)) : '')
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

      let newBs = 0
      let newUsd = 0
      const mDeuda = configuracion.columnas.find(c => c.id === 'deuda_2025')?.moneda || 'BS'
      const mCable = configuracion.columnas.find(c => c.id === 'cable_viajero')?.moneda || 'USD'
      const mGuaya = configuracion.columnas.find(c => c.id === 'guaya')?.moneda || 'USD'
      const mArreglo = configuracion.columnas.find(c => c.id === 'arreglo')?.moneda || 'BS'

      if (mDeuda === 'BS') newBs += f.deuda_base_2025; else newUsd += f.deuda_base_2025
      if (mCable === 'BS') newBs += f.cable_viajero; else newUsd += f.cable_viajero
      if (mGuaya === 'BS') newBs += f.guaya; else newUsd += f.guaya
      if (mArreglo === 'BS') newBs += f.arreglo; else newUsd += f.arreglo
      let pendingCount = 0
      Object.entries(mesesActualizados).forEach(([k, rec]) => {
        if (rec && rec.estado === 'pendiente') {
          pendingCount++
          const colItem = columnasMeses.find(c => c.key === k)
          const isBs = colItem ? colItem.moneda === 'BS' : (k <= '2026-02')
          if (isBs) newBs += rec.total_bs
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
    await cargarDatos(true)
  }

  // ── Guardar cambio de monto o estado desde Modal de Pago ──────────────────
  const handleGuardarCambioRecibo = async () => {
    if (!modalApto || !modalCol) return
    setProcesandoAccion(true)

    const mesLabelCompleto = `${modalCol.label} ${modalCol.anio}`
    const monedaNueva = modalMonedaEditada
    const montoFinal = parsearMontoFlexible(modalMontoEditado, monedaNueva)
    const targetAptoId = modalApto.apartamento_id
    const targetColKey = modalCol.key
    const estadoNuevo = modalEstadoDeseado

    // 1. Actualización optimista inmediata en memoria para respuesta instantánea
    setFilas(prev => prev.map(f => {
      if (f.apartamento_id !== targetAptoId) return f

      const mesesActualizados = { ...f.meses }
      const prevRec = mesesActualizados[targetColKey]

      const tasa = 859.06
      const nuevoMontoBs = monedaNueva === 'BS' ? montoFinal : Number((montoFinal * tasa).toFixed(2))
      const nuevoMontoUsd = monedaNueva === 'USD' ? montoFinal : Number((montoFinal / tasa).toFixed(2))

      mesesActualizados[targetColKey] = {
        id: prevRec?.id || `temp-${Date.now()}`,
        apartamento_id: targetAptoId,
        mes_facturado: modalCol.fechaIso,
        total_usd: monedaNueva === 'BS' ? 0 : nuevoMontoUsd,
        total_bs: nuevoMontoBs,
        tasa_bcv: tasa,
        estado: estadoNuevo,
        emitido_at: prevRec?.emitido_at || new Date().toISOString()
      }

      let newBs = 0
      let newUsd = 0
      const mDeuda = configuracion.columnas.find(c => c.id === 'deuda_2025')?.moneda || 'BS'
      const mCable = configuracion.columnas.find(c => c.id === 'cable_viajero')?.moneda || 'USD'
      const mGuaya = configuracion.columnas.find(c => c.id === 'guaya')?.moneda || 'USD'
      const mArreglo = configuracion.columnas.find(c => c.id === 'arreglo')?.moneda || 'BS'

      if (mDeuda === 'BS') newBs += f.deuda_base_2025; else newUsd += f.deuda_base_2025
      if (mCable === 'BS') newBs += f.cable_viajero; else newUsd += f.cable_viajero
      if (mGuaya === 'BS') newBs += f.guaya; else newUsd += f.guaya
      if (mArreglo === 'BS') newBs += f.arreglo; else newUsd += f.arreglo

      let pendingCount = 0
      Object.entries(mesesActualizados).forEach(([k, rec]) => {
        if (rec && rec.estado === 'pendiente') {
          pendingCount++
          const colItem = columnasMeses.find(c => c.key === k)
          const isBs = colItem ? colItem.moneda === 'BS' : (k <= '2026-02')
          if (isBs) newBs += rec.total_bs
          else newUsd += rec.total_usd
        }
      })

      const celdasPers = f.valores_personalizados || {}
      configuracion.columnas.forEach(col => {
        if (col.tipo === 'cuota_especial') {
          const val = celdasPers[col.id]
          if (val && val.estado === 'pendiente' && val.monto > 0) {
            pendingCount++
            if (col.moneda === 'USD') newUsd += val.monto
            else newBs += val.monto
          }
        }
      })

      const esSolv = newBs <= 0.01 && newUsd <= 0.01

      return {
        ...f,
        meses: mesesActualizados,
        total_bs: Number(newBs.toFixed(2)),
        total_usd: Number(newUsd.toFixed(2)),
        meses_con_deuda: pendingCount,
        estado_solvente: esSolv
      }
    }))

    // Cerrar modal de inmediato para máxima fluidez
    setModalPagoOpen(false)

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
        showToast(`✅ Apto ${modalApto.apartamento_numero}: Cuota ${mesLabelCompleto} guardada como ${modalEstadoDeseado === 'pagado' ? 'SOLVENTE' : 'PENDIENTE'}`)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
        await cargarDatos(true)
      }
    } catch (e: any) {
      showToast(`❌ Error inesperado: ${e.message}`)
      await cargarDatos(true)
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Modal Editar Título de Secciones ────────────────────────────────────
  const handleGuardarNuevoTitulo = async () => {
    if (!nuevoTituloInput.trim()) return
    setProcesandoAccion(true)
    try {
      const updateData = seccionTituloEditando === 'naranja'
        ? { tituloSeccionHistorica: nuevoTituloInput.trim() }
        : { tituloSeccionMensual: nuevoTituloInput.trim() }

      const res = await guardarConfiguracionCalendario(updateData, anioSeleccionado)
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

    const mDeuda = apto.monedas_conceptos?.deuda_base_2025 || configuracion.columnas.find(c => c.id === 'deuda_2025')?.moneda || 'BS'
    const mCable = apto.monedas_conceptos?.cable_viajero || configuracion.columnas.find(c => c.id === 'cable_viajero')?.moneda || 'USD'
    const mGuaya = apto.monedas_conceptos?.guaya || configuracion.columnas.find(c => c.id === 'guaya')?.moneda || 'USD'
    const mArreglo = apto.monedas_conceptos?.arreglo || configuracion.columnas.find(c => c.id === 'arreglo')?.moneda || 'BS'

    setHistMonedaBase2025(mDeuda)
    setHistMonedaCableViajero(mCable)
    setHistMonedaGuaya(mGuaya)
    setHistMonedaArreglo(mArreglo)

    setHistBase2025(apto.deuda_base_2025 > 0 ? (mDeuda === 'BS' ? fmtBs(apto.deuda_base_2025) : apto.deuda_base_2025.toFixed(2)) : '')
    setHistCableViajero(apto.cable_viajero > 0 ? (mCable === 'BS' ? fmtBs(apto.cable_viajero) : apto.cable_viajero.toFixed(2)) : '')
    setHistGuaya(apto.guaya > 0 ? (mGuaya === 'BS' ? fmtBs(apto.guaya) : apto.guaya.toFixed(2)) : '')
    setHistArreglo(apto.arreglo > 0 ? (mArreglo === 'BS' ? fmtBs(apto.arreglo) : apto.arreglo.toFixed(2)) : '')

    setModalHistOpen(true)
  }

  const handleGuardarHistorico = async () => {
    if (!modalHistApto) return
    setProcesandoAccion(true)
    try {
      const res = await guardarConceptosHistoricos({
        apartamentoId: modalHistApto.apartamento_id,
        apartamentoNumero: modalHistApto.apartamento_numero,
        deudaBase2025: parsearMontoFlexible(histBase2025, histMonedaBase2025),
        cableViajero: parsearMontoFlexible(histCableViajero, histMonedaCableViajero),
        guaya: parsearMontoFlexible(histGuaya, histMonedaGuaya),
        arreglo: parsearMontoFlexible(histArreglo, histMonedaArreglo),
        monedas: {
          deudaBase2025: histMonedaBase2025,
          cableViajero: histMonedaCableViajero,
          guaya: histMonedaGuaya,
          arreglo: histMonedaArreglo
        },
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

  const handleCambiarMonedaColumna = async (colId: string, nuevaMoneda: 'USD' | 'BS') => {
    setProcesandoAccion(true)
    try {
      const res = await cambiarMonedaColumna(colId, nuevaMoneda, anioSeleccionado)
      if (res.success) {
        showToast(`💱 Moneda cambiada a ${nuevaMoneda === 'USD' ? 'Dólares ($)' : 'Bolívares (Bs)'}`)
        setMenuColumnaId(null)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  // ── Gestión de Columnas Dinámicas (Verticales) ───────────────────────────
  const handleAbrirCrearColumna = (seccionPredefinida?: 'naranja' | 'azul') => {
    const sec = seccionPredefinida || 'naranja'
    setNuevaColTitulo('')
    setNuevaColSeccion(sec)
    setNuevaColMoneda(sec === 'azul' ? 'USD' : 'BS')
    setNuevaColMontoDefecto('')
    setNuevaColAplicarATodos(false)
    setNuevaColPosicion(sec === 'azul' ? 'fin_azul' : 'fin_naranja')
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
        aplicarATodos: nuevaColAplicarATodos,
        anio: anioSeleccionado
      })

      if (res.success) {
        showToast(`✅ Columna vertical "${nuevaColTitulo}" agregada`)
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
      const res = await cambiarSeccionColumna(colId, nuevaSeccion, anioSeleccionado)
      if (res.success) {
        const nombreSec = nuevaSeccion === 'naranja' ? 'Deudas Pasadas' : 'Calendario Mensual'
        showToast(`↔️ Columna movida a "${nombreSec}"`)
        setMenuColumnaId(null)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleMoverColumna = async (colId: string, direccion: 'izquierda' | 'derecha') => {
    const res = await moverColumnaPosicion(colId, direccion, anioSeleccionado)
    if (res.success) {
      await cargarDatos(true)
    }
  }

  const handleEliminarColumnaClick = async (colId: string, titulo: string) => {
    if (!window.confirm(`¿Estás seguro de quitar la columna vertical "${titulo}" de la tabla?`)) return
    setProcesandoAccion(true)
    try {
      const res = await eliminarColumna(colId, anioSeleccionado)
      if (res.success) {
        showToast(`🗑️ Columna "${titulo}" removida`)
        setMenuColumnaId(null)
        await cargarDatos(true)
      } else {
        showToast(`❌ Error: ${res.error}`)
      }
    } finally {
      setProcesandoAccion(false)
    }
  }

  const handleRestablecerColumnas = async () => {
    if (!window.confirm(`¿Deseas restablecer todas las columnas originales del año ${anioSeleccionado}?`)) return
    setProcesandoAccion(true)
    try {
      const res = await restablecerColumnasPorDefecto(anioSeleccionado)
      if (res.success) {
        showToast(`🔄 Columnas restablecidas a la configuración original del año ${anioSeleccionado}`)
        setMenuColumnaId(null)
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
    const m = (valActual as any)?.moneda || col.moneda || 'USD'
    const montoVal = valActual && valActual.monto > 0 ? valActual.monto : (col.montoDefecto || 0)

    setCeldaPersApto(apto)
    setCeldaPersCol(col)
    setCeldaPersMonto(montoVal > 0 ? (m === 'BS' ? fmtBs(montoVal) : montoVal.toFixed(2)) : '')
    setCeldaPersEstado(valActual?.estado || 'pendiente')
    setCeldaPersMoneda(m)
    setCeldaPersAplicarATodos(false)
    setModalCeldaPersonalizadaOpen(true)
  }

  const handleGuardarCeldaPersonalizada = async () => {
    if (!celdaPersApto || !celdaPersCol) return
    setProcesandoAccion(true)
    const nuevoMonto = parsearMontoFlexible(celdaPersMonto, celdaPersMoneda)

    try {
      if (celdaPersAplicarATodos) {
        for (const filaItem of filas) {
          await guardarCeldaPersonalizada({
            filaId: filaItem.apartamento_id,
            columnaId: celdaPersCol.id,
            monto: nuevoMonto,
            estado: celdaPersEstado,
            moneda: celdaPersMoneda,
            anio: anioSeleccionado
          })
        }
        showToast(`✅ Cuota "${celdaPersCol.titulo}" (${celdaPersMoneda === 'BS' ? 'Bs' : '$'}) asignada a todos los apartamentos`)
      } else {
        const res = await guardarCeldaPersonalizada({
          filaId: celdaPersApto.apartamento_id,
          columnaId: celdaPersCol.id,
          monto: nuevoMonto,
          estado: celdaPersEstado,
          moneda: celdaPersMoneda,
          anio: anioSeleccionado
        })
        if (res.success) {
          showToast(`✅ Cuota de ${celdaPersCol.titulo} (${celdaPersMoneda === 'BS' ? 'Bs' : '$'}) para Apto ${celdaPersApto.apartamento_numero} guardada`)
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
      let monedaConcepto: 'USD' | 'BS' = col.moneda
      if (col.id === 'deuda_2025') {
        valor = apto.deuda_base_2025
        if (apto.monedas_conceptos?.deuda_base_2025) monedaConcepto = apto.monedas_conceptos.deuda_base_2025
      } else if (col.id === 'cable_viajero') {
        valor = apto.cable_viajero
        if (apto.monedas_conceptos?.cable_viajero) monedaConcepto = apto.monedas_conceptos.cable_viajero
      } else if (col.id === 'guaya') {
        valor = apto.guaya
        if (apto.monedas_conceptos?.guaya) monedaConcepto = apto.monedas_conceptos.guaya
      } else if (col.id === 'arreglo') {
        valor = apto.arreglo
        if (apto.monedas_conceptos?.arreglo) monedaConcepto = apto.monedas_conceptos.arreglo
      }

      const esBs = monedaConcepto === 'BS'

      return (
        <td
          key={col.id}
          onClick={() => handleAbrirModalHist(apto)}
          style={{
            padding: '10px 10px',
            color: valor > 0 ? (esBs ? '#fb923c' : '#60a5fa') : '#475569',
            cursor: 'pointer',
            textAlign: 'right'
          }}
          title={`Clic para editar deuda histórica de Apto ${apto.apartamento_numero} (${esBs ? 'Bolívares' : 'Dólares'})`}
        >
          {valor > 0 ? (
            <span style={{ fontWeight: 700 }}>
              {esBs ? `Bs. ${fmtBs(valor)}` : `$${fmtUsd(valor)}`}
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
    const monCelda = (celdaVal as any)?.moneda || col.moneda || 'USD'
    const esBs = monCelda === 'BS'

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
                {esBs ? `Bs. ${fmtBs(celdaVal.monto)}` : `$${fmtUsd(celdaVal.monto)}`}
              </span>
            </div>
          ) : (
            <span>
              {esBs ? `Bs. ${fmtBs(celdaVal.monto)}` : `$${fmtUsd(celdaVal.monto)}`}
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
      const esBs = col.moneda === 'BS'
      return (
        <td key={col.id} style={{ padding: '12px 10px', color: esBs ? '#fb923c' : '#60a5fa', textAlign: 'right' }}>
          {sum > 0 ? (esBs ? `Bs. ${fmtBs(sum)}` : `$${fmtUsd(sum)}`) : '-'}
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
          {sum > 0 ? (col.moneda === 'USD' ? `$${fmtUsd(sum)}` : `Bs. ${fmtBs(sum)}`) : '-'}
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
        {sum > 0 ? (col.moneda === 'USD' ? `$${fmtUsd(sum)}` : `Bs. ${fmtBs(sum)}`) : '-'}
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
    <div className="calendario-page-root" style={{ padding: '24px 32px', maxWidth: '100%', margin: '0 auto', color: '#f3f4f6' }}>
      {/* Estilos CSS Scoped para Adaptación Móvil manteniendo Desktop Idéntico */}
      <style>{`
        .calendario-mobile-scroll-hint {
          display: none;
        }

        @media (max-width: 768px) {
          .calendario-page-root {
            padding: 12px 10px !important;
          }

          .calendario-header-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
            margin-bottom: 16px !important;
          }

          .calendario-title-block h1 {
            font-size: 19px !important;
            line-height: 1.2 !important;
          }

          .calendario-title-block p {
            font-size: 11px !important;
            line-height: 1.35 !important;
          }

          .calendario-actions-bar {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            width: 100% !important;
          }

          .calendario-actions-bar button,
          .calendario-actions-bar select {
            width: 100% !important;
            justify-content: center !important;
            padding: 9px 8px !important;
            font-size: 11px !important;
            white-space: nowrap !important;
            text-align: center !important;
            border-radius: 8px !important;
          }

          .calendario-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            margin-bottom: 14px !important;
          }

          .calendario-kpi-card {
            padding: 10px 12px !important;
            border-radius: 10px !important;
          }

          .calendario-kpi-card .kpi-num {
            font-size: 18px !important;
            margin-top: 4px !important;
          }

          .calendario-kpi-card .kpi-sub {
            font-size: 10px !important;
            margin-top: 4px !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }

          .calendario-filter-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            padding: 10px 12px !important;
            margin-bottom: 12px !important;
            border-radius: 10px !important;
          }

          .calendario-filter-search-group {
            flex-direction: column !important;
            width: 100% !important;
            min-width: 100% !important;
            gap: 8px !important;
          }

          .calendario-search-wrap {
            max-width: 100% !important;
            width: 100% !important;
          }

          .calendario-status-pills {
            display: flex !important;
            width: 100% !important;
            justify-content: space-between !important;
          }

          .calendario-status-pills button {
            flex: 1 !important;
            text-align: center !important;
            padding: 6px 4px !important;
            font-size: 11px !important;
          }

          .calendario-filter-modes-group {
            flex-direction: column !important;
            width: 100% !important;
            gap: 8px !important;
          }

          .calendario-view-tabs {
            display: flex !important;
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
          }

          .calendario-view-tabs button {
            flex: 1 !important;
            white-space: nowrap !important;
            text-align: center !important;
            font-size: 10px !important;
            padding: 6px 8px !important;
          }

          .calendario-checklist-toggle {
            width: 100% !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            padding: 8px 12px !important;
          }

          .calendario-mobile-scroll-hint {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
            background: linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%) !important;
            border: 1px dashed rgba(59, 130, 246, 0.35) !important;
            border-radius: 8px !important;
            padding: 8px 10px !important;
            font-size: 11px !important;
            color: #93c5fd !important;
            font-weight: 600 !important;
            margin-bottom: 10px !important;
            text-align: center !important;
          }

          .calendario-table-wrapper {
            max-height: 68vh !important;
            border-radius: 10px !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-x: contain !important;
          }

          .calendario-main-table th,
          .calendario-main-table td {
            padding: 7px 6px !important;
            font-size: 11px !important;
          }

          .calendario-sticky-col {
            padding: 7px 8px !important;
            min-width: 80px !important;
            max-width: 90px !important;
            box-shadow: 4px 0 10px rgba(0, 0, 0, 0.7) !important;
          }

          .calendario-modal-overlay {
            padding: 10px !important;
          }

          .calendario-modal-card {
            width: 95vw !important;
            max-width: 95vw !important;
            max-height: 92vh !important;
            border-radius: 14px !important;
          }

          .calendario-modal-header {
            padding: 12px 16px !important;
          }

          .calendario-modal-body {
            padding: 14px 16px !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
          }

          .calendario-modal-footer {
            padding: 10px 16px !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }

          .calendario-modal-grid-2 {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }

          .calendario-organizar-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
            padding: 12px 14px !important;
          }
        }

        @media (max-width: 480px) {
          .calendario-actions-bar {
            grid-template-columns: 1fr 1fr !important;
          }

          .calendario-kpi-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 6px !important;
          }

          .calendario-kpi-card {
            padding: 8px 10px !important;
          }

          .calendario-kpi-card .kpi-num {
            font-size: 16px !important;
          }
        }
      `}</style>

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
      <div className="calendario-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div className="calendario-title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>📊</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                  Calendario de Deudas e Impago
                </h1>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  padding: '3px 10px',
                  borderRadius: '8px'
                }}>
                  Año {anioSeleccionado}
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0' }}>
                Matriz y línea de tiempo mensual por apartamento con edición total de montos, cuotas especiales y conciliación de solvencia.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones principales superiores */}
        <div className="calendario-actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Botón Nueva Columna */}
          <button
            onClick={() => handleAbrirCrearColumna()}
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
            title="Agregar una nueva columna vertical en la posición deseada"
          >
            <span>➕</span> Nueva Columna
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
            title="Organizar columnas: mover entre Deudas Pasadas y Calendario, reordenar o quitar"
          >
            <span>⚙️</span> Gestionar Columnas
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

          {/* Selector Rápido de Año con Pestañas/Pills */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#030712',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid #374151',
            gap: '3px'
          }}>
            {[2026, 2027].map(anio => {
              const activo = anioSeleccionado === anio
              return (
                <button
                  key={anio}
                  type="button"
                  onClick={() => {
                    if (anioSeleccionado !== anio) {
                      setAnioSeleccionado(anio)
                    } else {
                      cargarDatos(true)
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: activo ? 'var(--color-accent, #f97316)' : 'transparent',
                    color: activo ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: activo ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: activo ? '0 2px 10px rgba(249, 115, 22, 0.35)' : 'none'
                  }}
                  title={`Ver plantilla y matriz del año ${anio}`}
                >
                  <span>📅 {anio}</span>
                  {activo && <span style={{ fontSize: '10px' }}>✓</span>}
                </button>
              )
            })}
          </div>

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
      <div className="calendario-kpi-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div className="calendario-kpi-card" style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🏢 Apartamentos
          </div>
          <div className="kpi-num" style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
            {resumen?.totalApartamentos || 62}
          </div>
          <div className="kpi-sub" style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ color: '#10b981' }}>🟢 {resumen?.apartamentosSolventes || 0} Solventes</span>
            <span style={{ color: '#ef4444' }}>🔴 {resumen?.apartamentosMorosos || 0} Con Deuda</span>
          </div>
        </div>

        <div className="calendario-kpi-card" style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            💵 Deuda Total USD
          </div>
          <div className="kpi-num" style={{ fontSize: '26px', fontWeight: 800, color: '#f87171', marginTop: '6px' }}>
            ${fmtUsd(resumen?.totalDeudaEdificioUsd || 0)}
          </div>
          <div className="kpi-sub" style={{ color: '#64748b', fontSize: '11px', marginTop: '8px' }}>
            Suma de recibos pendientes indexados
          </div>
        </div>

        <div className="calendario-kpi-card" style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🇻🇪 Deuda Total Bolívares
          </div>
          <div className="kpi-num" style={{ fontSize: '24px', fontWeight: 800, color: '#fb923c', marginTop: '6px' }}>
            Bs. {fmtBs(resumen?.totalDeudaEdificioBs || 0)}
          </div>
          <div className="kpi-sub" style={{ color: '#64748b', fontSize: '11px', marginTop: '8px' }}>
            2025 + Conceptos fijos en Bs
          </div>
        </div>

        <div className="calendario-kpi-card" style={{ backgroundColor: '#111827', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '14px', padding: '16px 20px' }}>
          <div style={{ color: '#10b981', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            💚 Depósitos / Saldo a Favor
          </div>
          <div className="kpi-num" style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
            +${fmtUsd(resumen?.totalSaldoAFavorUsd || 0)}
          </div>
          <div className="kpi-sub" style={{ color: '#6ee7b7', fontSize: '11px', marginTop: '8px', fontWeight: 600 }}>
            {resumen?.totalSaldoAFavorBs && resumen.totalSaldoAFavorBs > 0 ? `+Bs. ${fmtBs(resumen.totalSaldoAFavorBs)}` : 'Saldos positivos registrados'}
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="calendario-filter-bar" style={{
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
        <div className="calendario-filter-search-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <div className="calendario-search-wrap" style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
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

          <div className="calendario-status-pills" style={{ display: 'flex', gap: '4px', backgroundColor: '#030712', padding: '3px', borderRadius: '8px', border: '1px solid #374151' }}>
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

          <div className="calendario-anio-pills" style={{ display: 'flex', alignItems: 'center', gap: '3px', backgroundColor: '#030712', padding: '3px', borderRadius: '8px', border: '1px solid #374151' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, padding: '0 6px' }}>Año:</span>
            {[2026, 2027].map(anio => (
              <button
                key={anio}
                onClick={() => {
                  if (anioSeleccionado !== anio) setAnioSeleccionado(anio)
                  else cargarDatos(true)
                }}
                style={{
                  backgroundColor: anioSeleccionado === anio ? '#2563eb' : 'transparent',
                  color: anioSeleccionado === anio ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 11px',
                  fontSize: '12px',
                  fontWeight: anioSeleccionado === anio ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={`Ver matriz y calendario del año ${anio}`}
              >
                {anio}
              </button>
            ))}
          </div>
        </div>

        <div className="calendario-filter-modes-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="calendario-view-tabs" style={{ display: 'flex', gap: '4px', backgroundColor: '#030712', padding: '3px', borderRadius: '8px', border: '1px solid #374151' }}>
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
              Calendario {anioSeleccionado} ($)
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
              Deudas Pasadas (Bs)
            </button>
          </div>

          <label className="calendario-checklist-toggle" style={{
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

      {/* Indicador de Desplazamiento Móvil */}
      <div className="calendario-mobile-scroll-hint">
        <span style={{ fontSize: '13px' }}>👆</span>
        <span>Desliza horizontalmente para ver todos los meses y columnas ↔️</span>
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
        <div className="calendario-table-wrapper" style={{
          backgroundColor: '#0b0f19',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          overflowX: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          position: 'relative',
          maxHeight: '75vh'
        }}>
          <table className="calendario-main-table" style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            textAlign: 'right',
            whiteSpace: 'nowrap'
          }}>
            {/* Cabecera Nivel 1: Agrupadores Excel */}
            <thead>
              <tr style={{ backgroundColor: '#070b14', borderBottom: '1px solid #374151' }}>
                <th
                  className="calendario-sticky-col"
                  style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 25,
                    backgroundColor: '#070b14',
                    padding: '12px 14px',
                    color: '#94a3b8',
                    textAlign: 'left',
                    fontWeight: 800,
                    borderRight: '2px solid #374151',
                    minWidth: '95px'
                  }}
                >
                  APTO
                </th>
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <th
                    colSpan={columnasNaranja.length}
                    onClick={() => {
                      setNuevoTituloInput((configuracion.tituloSeccionHistorica || 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS').replace(/\s*\(BS\)\s*/gi, '').trim())
                      setModalEditarTituloOpen(true)
                    }}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'rgba(234, 88, 12, 0.15)',
                      color: '#fb923c',
                      padding: '8px 14px',
                      textAlign: 'center',
                      fontWeight: 800,
                      borderRight: '2px solid rgba(234, 88, 12, 0.35)',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span>🏛️ {(configuracion.tituloSeccionHistorica || 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS').replace(/\s*\(BS\)\s*/gi, '').trim()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSeccionTituloEditando('naranja')
                          setNuevoTituloInput((configuracion.tituloSeccionHistorica || 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS').replace(/\s*\(BS\)\s*/gi, '').trim())
                          setModalEditarTituloOpen(true)
                        }}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                          color: '#fed7aa',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                        title="Editar título de esta sección"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAbrirCrearColumna('naranja')
                        }}
                        style={{
                          backgroundColor: 'rgba(234, 88, 12, 0.3)',
                          color: '#fff',
                          border: '1px solid rgba(234, 88, 12, 0.5)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                        title="Agregar columna vertical a Deudas Pasadas"
                      >
                        ➕ Columna
                      </button>
                    </div>
                  </th>
                )}

                {/* Sección Calendario Mensual */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <th
                    colSpan={columnasAzul.length}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: '#60a5fa',
                      padding: '8px 14px',
                      textAlign: 'center',
                      fontWeight: 800,
                      borderRight: '2px solid rgba(59, 130, 246, 0.35)',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span>📅 {configuracion.tituloSeccionMensual || `CALENDARIO MENSUAL ${anioSeleccionado}`}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSeccionTituloEditando('azul')
                          setNuevoTituloInput(configuracion.tituloSeccionMensual || `CALENDARIO MENSUAL ${anioSeleccionado}`)
                          setModalEditarTituloOpen(true)
                        }}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                          color: '#bfdbfe',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                        title="Editar título de esta sección"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAbrirCrearColumna('azul')
                        }}
                        style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.3)',
                          color: '#fff',
                          border: '1px solid rgba(59, 130, 246, 0.5)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                        title="Agregar columna vertical al Calendario Mensual"
                      >
                        ➕ Columna
                      </button>
                    </div>
                  </th>
                )}

                {/* Totales y Resumen agrupados al final */}
                <th
                  colSpan={5}
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
                  TOTALES Y RESUMEN
                </th>
              </tr>

              {/* Cabecera Nivel 2: Columnas de datos dinámicas limpias */}
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '2px solid #334155', color: '#cbd5e1' }}>
                <th
                  className="calendario-sticky-col"
                  style={{
                    position: 'sticky',
                    left: 0,
                    top: '37px',
                    zIndex: 25,
                    backgroundColor: '#0f172a',
                    padding: '10px 14px',
                    textAlign: 'left',
                    borderRight: '2px solid #374151',
                    fontWeight: 700
                  }}
                >
                  Unidad
                </th>

                {/* Columnas Sección Deudas Pasadas */}
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
                          padding: '10px 10px',
                          textAlign: 'center',
                          verticalAlign: 'middle'
                        }}
                      >
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <span style={{
                            fontWeight: 700,
                            color: col.tipo === 'cuota_especial' ? '#facc15' : (col.moneda === 'BS' ? '#fb923c' : '#60a5fa'),
                            fontSize: '12px'
                          }}>
                            {col.titulo}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            backgroundColor: col.moneda === 'BS' ? 'rgba(234, 88, 12, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                            color: col.moneda === 'BS' ? '#fb923c' : '#93c5fd',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: 700
                          }}>
                            {col.moneda === 'BS' ? 'Bs' : '$'}
                          </span>
                          {col.esPersonalizada && (
                            <span style={{ fontSize: '9px', backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#facc15', padding: '1px 3px', borderRadius: '3px', fontWeight: 600 }}>
                              Extra
                            </span>
                          )}
                          {/* Botón discreto de opciones de columna */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuColumnaId(menuColumnaId === col.id ? null : col.id)
                            }}
                            style={{
                              background: menuColumnaId === col.id ? '#374151' : 'transparent',
                              border: 'none',
                              color: menuColumnaId === col.id ? '#fff' : '#64748b',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              lineHeight: 1
                            }}
                            title="Opciones de columna: Mover a Calendario, cambiar moneda o posición"
                          >
                            ⋮
                          </button>

                          {/* Menú flotante desplegable */}
                          {menuColumnaId === col.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: '6px',
                                backgroundColor: '#111827',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.85)',
                                padding: '6px',
                                zIndex: 100,
                                minWidth: '185px',
                                textAlign: 'left',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleCambiarMonedaColumna(col.id, col.moneda === 'BS' ? 'USD' : 'BS')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: col.moneda === 'BS' ? '#60a5fa' : '#fb923c',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>💱</span> Cambiar a {col.moneda === 'BS' ? 'Dólares ($)' : 'Bolívares (Bs)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCambiarSeccion(col.id, 'azul')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#60a5fa',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>📅</span> Pasar a Calendario
                              </button>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleMoverColumna(col.id, 'izquierda')}
                                  style={{
                                    flex: 1,
                                    background: '#1f2937',
                                    border: 'none',
                                    color: '#cbd5e1',
                                    padding: '5px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                  title="Mover hacia la izquierda"
                                >
                                  ◀ Mover
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoverColumna(col.id, 'derecha')}
                                  style={{
                                    flex: 1,
                                    background: '#1f2937',
                                    border: 'none',
                                    color: '#cbd5e1',
                                    padding: '5px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                  title="Mover hacia la derecha"
                                >
                                  Mover ▶
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEliminarColumnaClick(col.id, col.titulo)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ef4444',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>🗑️</span> Quitar columna
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}
                  </>
                )}

                {/* Columnas Sección Calendario Mensual */}
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
                          padding: '10px 10px',
                          textAlign: 'center',
                          verticalAlign: 'middle'
                        }}
                      >
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <span style={{
                            fontWeight: 700,
                            color: col.tipo === 'cuota_especial' ? '#facc15' : '#93c5fd',
                            fontSize: '12px'
                          }}>
                            {col.titulo}
                          </span>
                          {col.esPersonalizada && (
                            <span style={{ fontSize: '9px', backgroundColor: 'rgba(234, 179, 8, 0.25)', color: '#facc15', padding: '1px 3px', borderRadius: '3px', fontWeight: 600 }}>
                              Extra
                            </span>
                          )}
                          {/* Botón discreto de opciones de columna */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuColumnaId(menuColumnaId === col.id ? null : col.id)
                            }}
                            style={{
                              background: menuColumnaId === col.id ? '#374151' : 'transparent',
                              border: 'none',
                              color: menuColumnaId === col.id ? '#fff' : '#64748b',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              lineHeight: 1
                            }}
                            title="Opciones de columna: Mover a Deudas Pasadas, cambiar posición o quitar"
                          >
                            ⋮
                          </button>

                          {/* Menú flotante desplegable */}
                          {menuColumnaId === col.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: '6px',
                                backgroundColor: '#111827',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.85)',
                                padding: '6px',
                                zIndex: 100,
                                minWidth: '175px',
                                textAlign: 'left',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleCambiarMonedaColumna(col.id, col.moneda === 'BS' ? 'USD' : 'BS')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: col.moneda === 'BS' ? '#60a5fa' : '#fb923c',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>💱</span> Cambiar a {col.moneda === 'BS' ? 'Dólares ($)' : 'Bolívares (Bs)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCambiarSeccion(col.id, 'naranja')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#fb923c',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(234, 88, 12, 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>🏛️</span> Pasar a Deudas Pasadas
                              </button>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleMoverColumna(col.id, 'izquierda')}
                                  style={{
                                    flex: 1,
                                    background: '#1f2937',
                                    border: 'none',
                                    color: '#cbd5e1',
                                    padding: '5px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                  title="Mover hacia la izquierda"
                                >
                                  ◀ Mover
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoverColumna(col.id, 'derecha')}
                                  style={{
                                    flex: 1,
                                    background: '#1f2937',
                                    border: 'none',
                                    color: '#cbd5e1',
                                    padding: '5px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                  title="Mover hacia la derecha"
                                >
                                  Mover ▶
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEliminarColumnaClick(col.id, col.titulo)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ef4444',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <span>🗑️</span> Quitar columna
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    ))}
                  </>
                )}

                {/* Subcolumnas Totales y Resumen agrupados al final */}
                <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 12px', color: '#fb923c', fontWeight: 800, textAlign: 'right' }}>
                  TOTAL BS
                </th>
                <th style={{ top: '37px', position: 'sticky', zIndex: 10, backgroundColor: '#0f172a', padding: '10px 12px', color: '#60a5fa', fontWeight: 800, textAlign: 'right' }}>
                  TOTAL $
                </th>
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
                  <td colSpan={columnasNaranja.length + columnasAzul.length + 6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
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
                      {/* Columna APTO Sticky */}
                      <td
                        className="calendario-sticky-col"
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 15,
                          backgroundColor: esPar ? '#090e1a' : '#0d1322',
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontWeight: 800,
                          color: '#fff',
                          borderRight: '2px solid #374151'
                        }}
                      >
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
                      </td>

                      {/* Celdas Sección Naranja */}
                      {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                        <>
                          {columnasNaranja.map(col => renderCeldaColumna(apto, col))}
                        </>
                      )}

                      {/* Celdas Sección Azul */}
                      {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                        <>
                          {columnasAzul.map(col => renderCeldaColumna(apto, col))}
                        </>
                      )}

                      {/* TOTAL BS */}
                      <td style={{
                        padding: '8px 12px',
                        fontWeight: 800,
                        color: apto.total_bs > 0 ? '#fb923c' : '#475569',
                        backgroundColor: apto.total_bs > 0 ? 'rgba(234, 88, 12, 0.04)' : 'transparent',
                        textAlign: 'right'
                      }}>
                        {apto.total_bs > 0 ? `Bs. ${fmtBs(apto.total_bs)}` : '-'}
                      </td>

                      {/* TOTAL $ */}
                      <td style={{
                        padding: '8px 12px',
                        fontWeight: 800,
                        color: apto.total_usd > 0 ? '#60a5fa' : '#475569',
                        backgroundColor: apto.total_usd > 0 ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                        textAlign: 'right'
                      }}>
                        {apto.total_usd > 0 ? `$${fmtUsd(apto.total_usd)}` : '-'}
                      </td>

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
                <td
                  className="calendario-sticky-col"
                  style={{
                    position: 'sticky',
                    left: 0,
                    bottom: 0,
                    zIndex: 25,
                    backgroundColor: '#070b14',
                    padding: '12px 14px',
                    textAlign: 'left',
                    borderRight: '2px solid #374151',
                    color: '#93c5fd'
                  }}
                >
                  TOTALES ({filasFiltradas.length})
                </td>

                {/* Totales Sección Naranja */}
                {(vistaModo === 'completo' || vistaModo === 'historico_2025') && (
                  <>
                    {columnasNaranja.map(col => calcularTotalColumna(col))}
                  </>
                )}

                {/* Totales Sección Azul */}
                {(vistaModo === 'completo' || vistaModo === 'solo_2026') && (
                  <>
                    {columnasAzul.map(col => calcularTotalColumna(col))}
                  </>
                )}

                {/* TOTAL BS GLOBAL */}
                <td style={{
                  padding: '12px 12px',
                  color: '#fb923c',
                  backgroundColor: 'rgba(234, 88, 12, 0.08)',
                  textAlign: 'right',
                  fontWeight: 800
                }}>
                  Bs. {fmtBs(filasFiltradas.reduce((s, f) => s + f.total_bs, 0))}
                </td>

                {/* TOTAL $ GLOBAL */}
                <td style={{
                  padding: '12px 12px',
                  color: '#60a5fa',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  textAlign: 'right',
                  fontWeight: 800
                }}>
                  ${fmtUsd(filasFiltradas.reduce((s, f) => s + f.total_usd, 0))}
                </td>

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
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                ✏️ Editar Título: {seccionTituloEditando === 'naranja' ? 'Deudas Pasadas' : 'Calendario Mensual'}
              </h3>
              <button onClick={() => setModalEditarTituloOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
            <div className="calendario-modal-body" style={{ padding: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 700 }}>
                Texto del Encabezado
              </label>
              <input
                type="text"
                value={nuevoTituloInput}
                onChange={e => setNuevoTituloInput(e.target.value)}
                placeholder="Ej: DEUDAS PASADAS / CONCEPTOS EXTRAORDINARIOS (BS)"
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
            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalEditarTituloOpen(false)}
                style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarNuevoTitulo}
                disabled={procesandoAccion}
                style={{ padding: '9px 20px', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
              >
                {procesandoAccion ? 'Guardando...' : 'Guardar Título'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR NUEVA COLUMNA (VERTICAL) */}
      {modalNuevaColumnaOpen && (
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '2px solid #eab308',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#facc15' }}>
                  ➕ Agregar Columna (Vertical)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fde047' }}>
                  Elige el nombre y en qué parte de la tabla irá (entre qué meses o conceptos)
                </p>
              </div>
              <button onClick={() => setModalNuevaColumnaOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div className="calendario-modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                  Nombre / Título de la Columna *
                </label>
                <input
                  type="text"
                  value={nuevaColTitulo}
                  onChange={e => setNuevaColTitulo(e.target.value)}
                  placeholder="Ej: Cuota Ascensor, Pintura, Febrero Extra..."
                  autoFocus
                  style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="calendario-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Sección Destino
                  </label>
                  <select
                    value={nuevaColSeccion}
                    onChange={e => setNuevaColSeccion(e.target.value as 'naranja' | 'azul')}
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="naranja">🏛️ Deudas Pasadas (Bs / Conceptos Anteriores)</option>
                    <option value="azul">📅 Calendario Mensual ($ / Meses {anioSeleccionado})</option>
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
                  <optgroup label="🏛️ En Deudas Pasadas">
                    <option value="inicio_naranja">📍 Al inicio de Deudas Pasadas</option>
                    {columnasNaranja.map((c, i) => {
                      const nextCol = columnasNaranja[i + 1]
                      return (
                        <option key={c.id} value={`despues_de:${c.id}`}>
                          {nextCol ? `Entre [${c.titulo}] y [${nextCol.titulo}]` : `Después de [${c.titulo}]`}
                        </option>
                      )
                    })}
                    <option value="fin_naranja">📍 Al final de Deudas Pasadas</option>
                  </optgroup>
                  <optgroup label="📅 En Calendario Mensual">
                    <option value="inicio_azul">📍 Al inicio del Calendario Mensual</option>
                    {columnasAzul.map((c, i) => {
                      const nextCol = columnasAzul[i + 1]
                      return (
                        <option key={c.id} value={`despues_de:${c.id}`}>
                          {nextCol ? `Entre [${c.titulo}] y [${nextCol.titulo}]` : `Después de [${c.titulo}]`}
                        </option>
                      )
                    })}
                    <option value="fin_azul">📍 Al final del Calendario Mensual</option>
                  </optgroup>
                </select>
              </div>

              <div className="calendario-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
                    Monto Inicial (Opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nuevaColMontoDefecto}
                    onChange={e => setNuevaColMontoDefecto(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(nuevaColMontoDefecto, nuevaColMoneda)
                      if (num > 0) setNuevaColMontoDefecto(nuevaColMoneda === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={nuevaColMoneda === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  {nuevaColMontoDefecto !== '' && parsearMontoFlexible(nuevaColMontoDefecto, nuevaColMoneda) > 0 && (
                    <div style={{ fontSize: '11px', color: nuevaColMoneda === 'BS' ? '#fb923c' : '#60a5fa', marginTop: '4px', fontWeight: 700 }}>
                      {nuevaColMoneda === 'BS' ? `Bs. ${fmtBs(parsearMontoFlexible(nuevaColMontoDefecto, 'BS'))}` : `$${fmtUsd(parsearMontoFlexible(nuevaColMontoDefecto, 'USD'))}`}
                    </div>
                  )}
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

            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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

      {/* MODAL GESTIONAR Y QUITAR COLUMNAS (VERTICALES) */}
      {modalOrganizarColumnasOpen && (
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '85vh',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  ⚙️ Gestionar y Quitar Columnas (Verticales)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Mueve columnas entre "Deudas Pasadas" y el "Calendario Mensual", reordena su posición o quítalas a tu antojo
                </p>
              </div>
              <button onClick={() => setModalOrganizarColumnasOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div className="calendario-modal-body calendario-organizar-grid" style={{ padding: '20px 24px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
              {/* Sección Deudas Pasadas */}
              <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(234, 88, 12, 0.3)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(234, 88, 12, 0.2)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#fb923c' }}>
                    🏛️ Deudas Pasadas ({columnasNaranja.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAbrirCrearColumna('naranja')}
                    style={{ background: 'rgba(234, 88, 12, 0.2)', border: '1px solid rgba(234, 88, 12, 0.4)', color: '#fb923c', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {columnasNaranja.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                      No hay columnas en esta sección.
                    </div>
                  ) : (
                    columnasNaranja.map((c) => (
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
                            style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                            title="Mover columna a la izquierda"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoverColumna(c.id, 'derecha')}
                            style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                            title="Mover columna a la derecha"
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarSeccion(c.id, 'azul')}
                            style={{
                              background: 'rgba(59, 130, 246, 0.2)',
                              border: '1px solid rgba(59, 130, 246, 0.4)',
                              color: '#60a5fa',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                            title="Pasar esta columna al Calendario Mensual"
                          >
                            ➔ Calendario
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarColumnaClick(c.id, c.titulo)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                            title="Quitar columna vertical de la tabla"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Sección Calendario Mensual */}
              <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa' }}>
                    📅 Calendario Mensual ({columnasAzul.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAbrirCrearColumna('azul')}
                    style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {columnasAzul.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                      No hay columnas en esta sección.
                    </div>
                  ) : (
                    columnasAzul.map((c) => (
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
                            style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                            title="Mover columna a la izquierda"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoverColumna(c.id, 'derecha')}
                            style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                            title="Mover columna a la derecha"
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarSeccion(c.id, 'naranja')}
                            style={{
                              background: 'rgba(234, 88, 12, 0.2)',
                              border: '1px solid rgba(234, 88, 12, 0.4)',
                              color: '#fb923c',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                            title="Pasar esta columna a Deudas Pasadas"
                          >
                            ➔ Deudas Pasadas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarColumnaClick(c.id, c.titulo)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                            title="Quitar columna vertical de la tabla"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleRestablecerColumnas}
                disabled={procesandoAccion}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: procesandoAccion ? 'not-allowed' : 'pointer'
                }}
                title="Restablece las columnas originales por defecto"
              >
                🔄 Restablecer Columnas Originales
              </button>

              <button
                type="button"
                onClick={() => setModalOrganizarColumnasOpen(false)}
                style={{ padding: '9px 24px', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR MONTO DE CELDA EN COLUMNA PERSONALIZADA (CUOTA ESPECIAL) */}
      {modalCeldaPersonalizadaOpen && celdaPersApto && celdaPersCol && (
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '2px solid #eab308',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.1)' }}>
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

            <div className="calendario-modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 800 }}>
                    Monto de la Cuota
                  </label>
                  {/* Selector de moneda */}
                  <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#030712' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCeldaPersMoneda('BS')
                        const num = parsearMontoFlexible(celdaPersMonto, 'BS')
                        if (num > 0) setCeldaPersMonto(fmtBs(num))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: celdaPersMoneda === 'BS' ? '#f97316' : 'transparent',
                        color: celdaPersMoneda === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCeldaPersMoneda('USD')
                        const num = parsearMontoFlexible(celdaPersMonto, 'USD')
                        if (num > 0) setCeldaPersMonto(num.toFixed(2))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: celdaPersMoneda === 'USD' ? '#3b82f6' : 'transparent',
                        color: celdaPersMoneda === 'USD' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      💵 Dólares ($)
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: celdaPersMoneda === 'BS' ? '#fb923c' : '#60a5fa'
                  }}>
                    {celdaPersMoneda === 'BS' ? 'Bs.' : '$'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={celdaPersMonto}
                    onChange={e => setCeldaPersMonto(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(celdaPersMonto, celdaPersMoneda)
                      if (num > 0) setCeldaPersMonto(celdaPersMoneda === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={celdaPersMoneda === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    autoFocus
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: celdaPersMoneda === 'BS' ? '1px solid #f97316' : '1px solid #3b82f6',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 42px',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {celdaPersMoneda === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: celdaPersMoneda === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {celdaPersMoneda === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(celdaPersMonto, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(celdaPersMonto, 'USD'))}`}
                  </span>
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

            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{
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

            <div className="calendario-modal-body" style={{ padding: '24px' }}>
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
                    type="text"
                    inputMode="decimal"
                    value={modalMontoEditado}
                    onChange={e => setModalMontoEditado(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(modalMontoEditado, modalMonedaEditada)
                      if (num > 0) setModalMontoEditado(modalMonedaEditada === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={modalMonedaEditada === 'BS' ? 'Ej: 14.304,23' : '0.00'}
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
                    onChange={e => {
                      const m = e.target.value as 'USD' | 'BS'
                      setModalMonedaEditada(m)
                      const num = parsearMontoFlexible(modalMontoEditado, m)
                      if (num > 0) setModalMontoEditado(m === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {modalMonedaEditada === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: modalMonedaEditada === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {modalMonedaEditada === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(modalMontoEditado, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(modalMontoEditado, 'USD'))}`}
                  </span>
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
                  <div className="calendario-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
        <div className="calendario-modal-overlay" style={{
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
          <div className="calendario-modal-card" style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            overflow: 'hidden'
          }}>
            <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

            <div className="calendario-modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Concepto 1: Deuda Base al Año 2025 */}
              <div style={{ backgroundColor: '#090e1a', border: '1px solid #1f2937', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 800 }}>
                    Deuda Base al Año 2025
                  </label>
                  <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#030712' }}>
                    <button
                      type="button"
                      onClick={() => setHistMonedaBase2025('BS')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaBase2025 === 'BS' ? '#f97316' : 'transparent',
                        color: histMonedaBase2025 === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaBase2025('BS')
                        const num = parsearMontoFlexible(histBase2025, 'BS')
                        if (num > 0) setHistBase2025(fmtBs(num))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaBase2025 === 'BS' ? '#f97316' : 'transparent',
                        color: histMonedaBase2025 === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaBase2025('USD')
                        const num = parsearMontoFlexible(histBase2025, 'USD')
                        if (num > 0) setHistBase2025(num.toFixed(2))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaBase2025 === 'USD' ? '#3b82f6' : 'transparent',
                        color: histMonedaBase2025 === 'USD' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      💵 Dólares ($)
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: histMonedaBase2025 === 'BS' ? '#fb923c' : '#60a5fa'
                  }}>
                    {histMonedaBase2025 === 'BS' ? 'Bs.' : '$'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={histBase2025}
                    onChange={e => setHistBase2025(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(histBase2025, histMonedaBase2025)
                      if (num > 0) setHistBase2025(histMonedaBase2025 === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={histMonedaBase2025 === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: histMonedaBase2025 === 'BS' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid rgba(59, 130, 246, 0.5)',
                      padding: '10px 12px 10px 42px',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {histMonedaBase2025 === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: histMonedaBase2025 === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {histMonedaBase2025 === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(histBase2025, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(histBase2025, 'USD'))}`}
                  </span>
                </div>
              </div>

              {/* Concepto 2: Cable Viajero */}
              <div style={{ backgroundColor: '#090e1a', border: '1px solid #1f2937', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 800 }}>
                    Cable Viajero
                  </label>
                  <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#030712' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaCableViajero('BS')
                        const num = parsearMontoFlexible(histCableViajero, 'BS')
                        if (num > 0) setHistCableViajero(fmtBs(num))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaCableViajero === 'BS' ? '#f97316' : 'transparent',
                        color: histMonedaCableViajero === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaCableViajero('USD')
                        const num = parsearMontoFlexible(histCableViajero, 'USD')
                        if (num > 0) setHistCableViajero(num.toFixed(2))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaCableViajero === 'USD' ? '#3b82f6' : 'transparent',
                        color: histMonedaCableViajero === 'USD' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      💵 Dólares ($)
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: histMonedaCableViajero === 'BS' ? '#fb923c' : '#60a5fa'
                  }}>
                    {histMonedaCableViajero === 'BS' ? 'Bs.' : '$'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={histCableViajero}
                    onChange={e => setHistCableViajero(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(histCableViajero, histMonedaCableViajero)
                      if (num > 0) setHistCableViajero(histMonedaCableViajero === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={histMonedaCableViajero === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: histMonedaCableViajero === 'BS' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid rgba(59, 130, 246, 0.5)',
                      padding: '10px 12px 10px 42px',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {histMonedaCableViajero === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: histMonedaCableViajero === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {histMonedaCableViajero === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(histCableViajero, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(histCableViajero, 'USD'))}`}
                  </span>
                </div>
              </div>

              {/* Concepto 3: Guaya */}
              <div style={{ backgroundColor: '#090e1a', border: '1px solid #1f2937', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 800 }}>
                    Guaya
                  </label>
                  <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#030712' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaGuaya('BS')
                        const num = parsearMontoFlexible(histGuaya, 'BS')
                        if (num > 0) setHistGuaya(fmtBs(num))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaGuaya === 'BS' ? '#f97316' : 'transparent',
                        color: histMonedaGuaya === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaGuaya('USD')
                        const num = parsearMontoFlexible(histGuaya, 'USD')
                        if (num > 0) setHistGuaya(num.toFixed(2))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaGuaya === 'USD' ? '#3b82f6' : 'transparent',
                        color: histMonedaGuaya === 'USD' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      💵 Dólares ($)
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: histMonedaGuaya === 'BS' ? '#fb923c' : '#60a5fa'
                  }}>
                    {histMonedaGuaya === 'BS' ? 'Bs.' : '$'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={histGuaya}
                    onChange={e => setHistGuaya(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(histGuaya, histMonedaGuaya)
                      if (num > 0) setHistGuaya(histMonedaGuaya === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={histMonedaGuaya === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: histMonedaGuaya === 'BS' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid rgba(59, 130, 246, 0.5)',
                      padding: '10px 12px 10px 42px',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {histMonedaGuaya === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: histMonedaGuaya === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {histMonedaGuaya === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(histGuaya, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(histGuaya, 'USD'))}`}
                  </span>
                </div>
              </div>

              {/* Concepto 4: Arreglo / Cuota Extraordinaria */}
              <div style={{ backgroundColor: '#090e1a', border: '1px solid #1f2937', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 800 }}>
                    Arreglo / Cuota Extraordinaria
                  </label>
                  <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#030712' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaArreglo('BS')
                        const num = parsearMontoFlexible(histArreglo, 'BS')
                        if (num > 0) setHistArreglo(fmtBs(num))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaArreglo === 'BS' ? '#f97316' : 'transparent',
                        color: histMonedaArreglo === 'BS' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      🇻🇪 Bolívares (Bs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistMonedaArreglo('USD')
                        const num = parsearMontoFlexible(histArreglo, 'USD')
                        if (num > 0) setHistArreglo(num.toFixed(2))
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: histMonedaArreglo === 'USD' ? '#3b82f6' : 'transparent',
                        color: histMonedaArreglo === 'USD' ? '#fff' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      💵 Dólares ($)
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: histMonedaArreglo === 'BS' ? '#fb923c' : '#60a5fa'
                  }}>
                    {histMonedaArreglo === 'BS' ? 'Bs.' : '$'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={histArreglo}
                    onChange={e => setHistArreglo(e.target.value)}
                    onBlur={() => {
                      const num = parsearMontoFlexible(histArreglo, histMonedaArreglo)
                      if (num > 0) setHistArreglo(histMonedaArreglo === 'BS' ? fmtBs(num) : num.toFixed(2))
                    }}
                    placeholder={histMonedaArreglo === 'BS' ? 'Ej: 14.304,23' : '0.00'}
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: histMonedaArreglo === 'BS' ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid rgba(59, 130, 246, 0.5)',
                      padding: '10px 12px 10px 42px',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '11px', padding: '0 2px' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {histMonedaArreglo === 'BS' ? 'Separador de miles (.) y decimales (,)' : 'Formato numérico en dólares ($)'}
                  </span>
                  <span style={{ fontWeight: 800, color: histMonedaArreglo === 'BS' ? '#fb923c' : '#60a5fa' }}>
                    {histMonedaArreglo === 'BS'
                      ? `Monto: Bs. ${fmtBs(parsearMontoFlexible(histArreglo, 'BS'))}`
                      : `Monto: $${fmtUsd(parsearMontoFlexible(histArreglo, 'USD'))}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
