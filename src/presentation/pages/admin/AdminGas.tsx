import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../data/supabase'
import {
  obtenerGasServicioData,
  actualizarConfigTanque,
  registrarLlenado,
  eliminarLlenado,
  togglePagoApartamento,
  guardarEventoCalendario,
  eliminarEventoCalendario,
  calcularMetricasGas,
  crearOActualizarCuotaGas,
  reiniciarDatosGasAFabrica,
  guardarDeudaAnteriorGas,
  eliminarDeudaAnteriorGas,
  guardarDeudaMesGas,
  eliminarDeudaMesGas,
  eliminarTodasLasDeudasGasApartamento,
  GasServicioData,
  LlenadoGas,
  DetallePagoAptoGas,
  TanqueGasConfig,
  DeudaAnteriorGas
} from '../../../data/gasService'

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const AdminGas: React.FC = () => {
  const [data, setData] = useState<GasServicioData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendario' | 'morosos' | 'llenados'>('calendario')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Lista de apartamentos de la BD
  const [apartamentosDb, setApartamentosDb] = useState<{ id: string; numero: string; propietario_nombre?: string | null }[]>([])

  // Subvista dentro del Calendario de Gas
  const [vistaCalendarioGas, setVistaCalendarioGas] = useState<'matriz' | 'bitacora'>('matriz')

  // Filtros de apartamentos
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'morosos' | 'solventes'>('todos')
  const [busquedaApto, setBusquedaApto] = useState<string>('')

  // Estado del Calendario
  const [calAnio, setCalAnio] = useState<number>(2026)
  const [calMes, setCalMes] = useState<number>(10) // 1-12
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(new Date().toISOString().slice(0, 10))

  // Modales Deuda Anterior y Eliminar Deuda
  const [modalDeudaAnteriorOpen, setModalDeudaAnteriorOpen] = useState(false)
  const [guardandoDeudaAnterior, setGuardandoDeudaAnterior] = useState(false)
  const [formDeudaAnterior, setFormDeudaAnterior] = useState({
    apartamentoId: '',
    apartamentoNumero: '',
    monto: '',
    moneda: 'BS' as 'BS' | 'USD',
    nota: 'Deuda Anterior de Gas',
    aplicarATodos: false
  })

  const [modalEliminarDeudaOpen, setModalEliminarDeudaOpen] = useState(false)
  const [eliminandoDeuda, setEliminandoDeuda] = useState(false)
  const [formEliminarDeuda, setFormEliminarDeuda] = useState({
    apartamentoId: '',
    apartamentoNumero: '',
    tipoEliminacion: 'anterior' as 'anterior' | 'mes' | 'todas',
    mesKey: '2026-10'
  })

  // Modal de Celda Interactiva en la Matriz de Deudas de Gas
  const [modalCeldaDeudaOpen, setModalCeldaDeudaOpen] = useState(false)
  const [guardandoCelda, setGuardandoCelda] = useState(false)
  const [celdaApto, setCeldaApto] = useState<{ id: string; numero: string; propietario?: string } | null>(null)
  const [celdaTipo, setCeldaTipo] = useState<'anterior' | 'mes'>('anterior')
  const [celdaMesKey, setCeldaMesKey] = useState<string>('')
  const [celdaMesLabel, setCeldaMesLabel] = useState<string>('')
  const [celdaMonto, setCeldaMonto] = useState<string>('')
  const [celdaMoneda, setCeldaMoneda] = useState<'BS' | 'USD'>('BS')
  const [celdaEstado, setCeldaEstado] = useState<'pendiente' | 'pagado'>('pendiente')
  const [celdaReferencia, setCeldaReferencia] = useState<string>('')
  const [celdaMetodo, setCeldaMetodo] = useState<string>('pago_movil')
  const [celdaFechaPago, setCeldaFechaPago] = useState<string>(new Date().toISOString().slice(0, 10))
  const [celdaNota, setCeldaNota] = useState<string>('')

  // Modales
  const [modalNivelTanqueOpen, setModalNivelTanqueOpen] = useState(false)
  const [nuevoNivelTanque, setNuevoNivelTanque] = useState<number>(0)

  const [modalLlenadoOpen, setModalLlenadoOpen] = useState(false)
  const [formLlenado, setFormLlenado] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    porcentajeInicial: 0,
    porcentajeFinal: 100,
    litrosCargados: 2500,
    monedaCosto: 'BS' as 'BS' | 'USD',
    costoMonto: '',
    proveedor: '',
    numeroFacturaGuia: '',
    responsableRecibio: '',
    estado: 'completado' as 'completado' | 'programado',
    observaciones: ''
  })

  // Modal Evento / Recaudación diaria
  const [modalEventoOpen, setModalEventoOpen] = useState(false)
  const [formEvento, setFormEvento] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: 'recaudacion' as 'recaudacion' | 'llenado' | 'cierre_cobro' | 'mantenimiento' | 'otro',
    titulo: '',
    descripcion: '',
    moneda: 'BS' as 'BS' | 'USD',
    monto: ''
  })

  // Modal Pago Apartamento
  const [modalPagoOpen, setModalPagoOpen] = useState(false)
  const [aptoParaPagar, setAptoParaPagar] = useState<DetallePagoAptoGas | null>(null)
  const [formPago, setFormPago] = useState({
    fechaPago: new Date().toISOString().slice(0, 10),
    moneda: 'BS' as 'BS' | 'USD',
    monto: '',
    metodoPago: 'pago_movil' as 'pago_movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd' | 'otro',
    referencia: '',
    observaciones: ''
  })

  // Modal Configuración
  const [modalConfigOpen, setModalConfigOpen] = useState(false)
  const [formConfig, setFormConfig] = useState<TanqueGasConfig | null>(null)

  // Modal Asignar / Publicar Cuota de Gas (Ordinaria o Especial)
  const [modalPublicarCuotaOpen, setModalPublicarCuotaOpen] = useState(false)
  const [guardandoCuota, setGuardandoCuota] = useState(false)
  const [formCuota, setFormCuota] = useState({
    titulo: 'Recarga de Gas Comunal',
    esEspecial: false,
    moneda: 'BS' as 'BS' | 'USD',
    monto: '',
    fechaLimite: '',
    enviarEmail: true
  })

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargarDatos = async (forceClean: boolean = false) => {
    setLoading(true)
    try {
      const [res, aptosRes] = await Promise.all([
        obtenerGasServicioData(forceClean),
        supabase.from('apartamentos').select('id, numero, propietario_nombre').order('numero')
      ])
      setData(res.data)
      setNuevoNivelTanque(res.data.config.nivelActualPorcentaje || 0)
      setFormConfig(res.data.config)
      if (aptosRes?.data) {
        setApartamentosDb(aptosRes.data)
        if (aptosRes.data.length > 0) {
          setFormDeudaAnterior(prev => ({
            ...prev,
            apartamentoId: prev.apartamentoId || aptosRes.data[0].id,
            apartamentoNumero: prev.apartamentoNumero || aptosRes.data[0].numero
          }))
          setFormEliminarDeuda(prev => ({
            ...prev,
            apartamentoId: prev.apartamentoId || aptosRes.data[0].id,
            apartamentoNumero: prev.apartamentoNumero || aptosRes.data[0].numero
          }))
        }
      }
    } catch (err: any) {
      console.error('Error cargando gas:', err)
      showToast('Error cargando datos de gas')
    } finally {
      setLoading(false)
    }
  }

  const handleReiniciarLimpio = async () => {
    if (!window.confirm('¿Deseas vaciar la memoria y reiniciar el servicio de gas a cero (0% tanque, 0 llenados y lista limpia)?')) return
    const res = await reiniciarDatosGasAFabrica()
    if (res.success) {
      setData(res.data)
      setNuevoNivelTanque(0)
      showToast('Base de gas reiniciada exitosamente')
    } else {
      showToast('Error al reiniciar base de gas')
    }
  }

  useEffect(() => {
    cargarDatos()

    // 1. Escuchar eventos broadcast locales / entre pestañas
    const onGasUpdated = () => {
      cargarDatos()
    }
    window.addEventListener('condominio_gas_updated', onGasUpdated)

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gas_servicio_cache' || e.key === 'condominio_gas_cache_v2') {
        cargarDatos()
      }
    }
    window.addEventListener('storage', onStorage)

    // 2. Suscripción Supabase Realtime a casos_comunidad
    const channelId = `admin_gas_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casos_comunidad' },
        (payload: any) => {
          const t = payload?.new?.tipo || payload?.old?.tipo
          if (t === 'config_gas_servicio' || (typeof t === 'string' && t.startsWith('gas_'))) {
            cargarDatos()
          }
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener('condominio_gas_updated', onGasUpdated)
      window.removeEventListener('storage', onStorage)
      supabase.removeChannel(channel)
    }
  }, [])

  const metricas = useMemo(() => {
    if (!data) return null
    return calcularMetricasGas(data)
  }, [data])

  const apartamentosList = useMemo(() => {
    if (!data || !metricas?.jornadaActiva) return []
    const raw = Object.values(metricas.jornadaActiva.pagos)
    return raw.sort((a, b) => {
      const numA = parseInt(a.apartamentoNumero?.replace(/\D/g, '') || '0', 10)
      const numB = parseInt(b.apartamentoNumero?.replace(/\D/g, '') || '0', 10)
      if (numA !== numB) return numA - numB
      return (a.apartamentoNumero || '').localeCompare(b.apartamentoNumero || '')
    })
  }, [data, metricas])

  const apartamentosFiltrados = useMemo(() => {
    return apartamentosList.filter(item => {
      if (filtroEstado === 'morosos' && item.estado !== 'pendiente') return false
      if (filtroEstado === 'solventes' && item.estado !== 'pagado') return false
      if (busquedaApto.trim()) {
        const query = busquedaApto.trim().toLowerCase()
        const aptoMatch = item.apartamentoNumero.toLowerCase().includes(query)
        const propMatch = (item.propietario || '').toLowerCase().includes(query)
        const refMatch = (item.referencia || '').toLowerCase().includes(query)
        return aptoMatch || propMatch || refMatch
      }
      return true
    })
  }, [apartamentosList, filtroEstado, busquedaApto])

  const eventosDelDia = useMemo(() => {
    if (!data || !diaSeleccionado) return []
    return data.eventosCalendario.filter(e => e.fecha === diaSeleccionado)
  }, [data, diaSeleccionado])

  const diasCalendario = useMemo(() => {
    const totalDias = new Date(calAnio, calMes, 0).getDate()
    const primerDiaSemana = new Date(calAnio, calMes - 1, 1).getDay()
    const offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1

    const celdas: { diaNum: number | null; fechaIso: string | null }[] = []
    for (let i = 0; i < offset; i++) {
      celdas.push({ diaNum: null, fechaIso: null })
    }
    for (let d = 1; d <= totalDias; d++) {
      const mesStr = String(calMes).padStart(2, '0')
      const diaStr = String(d).padStart(2, '0')
      celdas.push({ diaNum: d, fechaIso: `${calAnio}-${mesStr}-${diaStr}` })
    }
    return celdas
  }, [calAnio, calMes])

  const eventosPorFecha = useMemo(() => {
    const map = new Map<string, any[]>()
    if (!data) return map
    data.eventosCalendario.forEach(ev => {
      const arr = map.get(ev.fecha) || []
      arr.push(ev)
      map.set(ev.fecha, arr)
    })
    return map
  }, [data])

  // ── MATRIZ DE DEUDAS DE GAS (ESTILO CONDOMINIO NORMAL) ───────────────────
  const MESES_CONFIG = useMemo(() => [
    { key: '01', mesKey: `${calAnio}-01`, label: 'Ene', nombreCompleto: 'Enero' },
    { key: '02', mesKey: `${calAnio}-02`, label: 'Feb', nombreCompleto: 'Febrero' },
    { key: '03', mesKey: `${calAnio}-03`, label: 'Mar', nombreCompleto: 'Marzo' },
    { key: '04', mesKey: `${calAnio}-04`, label: 'Abr', nombreCompleto: 'Abril' },
    { key: '05', mesKey: `${calAnio}-05`, label: 'May', nombreCompleto: 'Mayo' },
    { key: '06', mesKey: `${calAnio}-06`, label: 'Jun', nombreCompleto: 'Junio' },
    { key: '07', mesKey: `${calAnio}-07`, label: 'Jul', nombreCompleto: 'Julio' },
    { key: '08', mesKey: `${calAnio}-08`, label: 'Ago', nombreCompleto: 'Agosto' },
    { key: '09', mesKey: `${calAnio}-09`, label: 'Sep', nombreCompleto: 'Septiembre' },
    { key: '10', mesKey: `${calAnio}-10`, label: 'Oct', nombreCompleto: 'Octubre' },
    { key: '11', mesKey: `${calAnio}-11`, label: 'Nov', nombreCompleto: 'Noviembre' },
    { key: '12', mesKey: `${calAnio}-12`, label: 'Dic', nombreCompleto: 'Diciembre' }
  ], [calAnio])

  const filasGasMatriz = useMemo(() => {
    if (!apartamentosDb || apartamentosDb.length === 0) return []

    const deudasAnt = data?.deudasAnteriores || {}
    const jornadas = data?.jornadas || []

    return apartamentosDb.map(apto => {
      const cleanNum = String(apto.numero).trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
      const key = apto.id || cleanNum

      // 1. Deuda Anterior
      let da: DeudaAnteriorGas | undefined = deudasAnt[key]
      if (!da) {
        da = Object.values(deudasAnt).find(d => {
          const dNum = String(d.apartamentoNumero || d.apartamentoId || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
          return dNum === cleanNum || d.apartamentoId === apto.id
        })
      }

      const deudaAnteriorItem = {
        montoBs: da ? da.montoBs : 0,
        montoUsd: da ? da.montoUsd : 0,
        moneda: da ? da.moneda : ('BS' as 'BS' | 'USD'),
        estado: da ? da.estado : ('pagado' as 'pendiente' | 'pagado'),
        nota: da?.nota || ''
      }

      // 2. Meses del año
      const mesesObj: Record<string, {
        montoBs: number
        montoUsd: number
        moneda: 'BS' | 'USD'
        estado: 'pendiente' | 'pagado' | 'sin_cuota'
        referencia?: string
        metodoPago?: string
        fechaPago?: string
        observaciones?: string
      }> = {}

      let totalBs = 0
      let totalUsd = 0
      let mesesConDeuda = 0

      if (deudaAnteriorItem.estado === 'pendiente' && (deudaAnteriorItem.montoBs > 0 || deudaAnteriorItem.montoUsd > 0)) {
        totalBs += deudaAnteriorItem.montoBs
        totalUsd += deudaAnteriorItem.montoUsd
        mesesConDeuda++
      }

      MESES_CONFIG.forEach(col => {
        const jornada = jornadas.find(j => j.mes === col.mesKey)
        if (jornada) {
          const pago = jornada.pagos ? (jornada.pagos[apto.id] || jornada.pagos[cleanNum] || Object.values(jornada.pagos).find(p => {
            const pNum = String(p.apartamentoNumero || p.apartamentoId || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
            return pNum === cleanNum || p.apartamentoId === apto.id
          })) : undefined

          const estado = pago ? pago.estado : 'pendiente'
          const moneda = pago?.moneda || jornada.monedaPrincipal || 'BS'
          const mBs = pago ? pago.montoBs : jornada.costoPorAptoBs
          const mUsd = pago ? pago.montoUsd : jornada.costoPorAptoUsd

          mesesObj[col.mesKey] = {
            montoBs: mBs,
            montoUsd: mUsd,
            moneda,
            estado,
            referencia: pago?.referencia,
            metodoPago: pago?.metodoPago,
            fechaPago: pago?.fechaPago,
            observaciones: pago?.observaciones
          }

          if (estado === 'pendiente' && (mBs > 0 || mUsd > 0)) {
            totalBs += mBs
            totalUsd += mUsd
            mesesConDeuda++
          }
        } else {
          mesesObj[col.mesKey] = {
            montoBs: 0,
            montoUsd: 0,
            moneda: data?.config?.monedaCuota || 'BS',
            estado: 'sin_cuota'
          }
        }
      })

      return {
        apartamento_id: apto.id,
        apartamento_numero: apto.numero,
        propietario_nombre: apto.propietario_nombre || 'Sin asignar',
        deuda_anterior: deudaAnteriorItem,
        meses: mesesObj,
        total_bs: Number(totalBs.toFixed(2)),
        total_usd: Number(totalUsd.toFixed(2)),
        meses_con_deuda: mesesConDeuda,
        estado_solvente: totalBs <= 0.01 && totalUsd <= 0.01
      }
    })
  }, [apartamentosDb, data, calAnio, MESES_CONFIG])

  const filasFiltradasMatriz = useMemo(() => {
    return filasGasMatriz.filter(f => {
      if (busquedaApto.trim()) {
        const q = busquedaApto.toLowerCase().trim()
        const matchNum = f.apartamento_numero.toLowerCase().includes(q)
        const matchProp = (f.propietario_nombre || '').toLowerCase().includes(q)
        if (!matchNum && !matchProp) return false
      }
      if (filtroEstado === 'morosos' && f.estado_solvente) return false
      if (filtroEstado === 'solventes' && !f.estado_solvente) return false
      return true
    })
  }, [filasGasMatriz, busquedaApto, filtroEstado])

  const totalesMatriz = useMemo(() => {
    let sumDeudaAntBs = 0
    let sumDeudaAntUsd = 0
    const sumMesesBs: Record<string, number> = {}
    const sumMesesUsd: Record<string, number> = {}
    let granTotalBs = 0
    let granTotalUsd = 0
    let aptosSolventes = 0
    let aptosConDeuda = 0

    filasFiltradasMatriz.forEach(f => {
      if (f.estado_solvente) aptosSolventes++
      else aptosConDeuda++

      if (f.deuda_anterior.estado === 'pendiente') {
        sumDeudaAntBs += f.deuda_anterior.montoBs
        sumDeudaAntUsd += f.deuda_anterior.montoUsd
      }
      Object.entries(f.meses).forEach(([mKey, mes]) => {
        if (mes.estado === 'pendiente') {
          sumMesesBs[mKey] = (sumMesesBs[mKey] || 0) + mes.montoBs
          sumMesesUsd[mKey] = (sumMesesUsd[mKey] || 0) + mes.montoUsd
        }
      })
      granTotalBs += f.total_bs
      granTotalUsd += f.total_usd
    })

    return {
      sumDeudaAntBs,
      sumDeudaAntUsd,
      sumMesesBs,
      sumMesesUsd,
      granTotalBs,
      granTotalUsd,
      aptosSolventes,
      aptosConDeuda
    }
  }, [filasFiltradasMatriz])

  const handleAbrirCeldaDeuda = (
    apto: { apartamento_id: string; apartamento_numero: string; propietario_nombre?: string; deuda_anterior?: any; meses?: any },
    tipo: 'anterior' | 'mes',
    mesKey?: string,
    mesLabel?: string
  ) => {
    setCeldaApto({ id: apto.apartamento_id, numero: apto.apartamento_numero, propietario: apto.propietario_nombre })
    setCeldaTipo(tipo)
    setCeldaMesKey(mesKey || '')
    setCeldaMesLabel(mesLabel || '')

    if (tipo === 'anterior') {
      const da = apto.deuda_anterior
      const tiene = da && da.estado === 'pendiente' && (da.montoBs > 0 || da.montoUsd > 0)
      const mVal = tiene ? (da.moneda === 'BS' ? da.montoBs : da.montoUsd) : ''
      setCeldaMonto(mVal ? mVal.toString() : '')
      setCeldaMoneda(da?.moneda || 'BS')
      setCeldaEstado(da?.estado || 'pendiente')
      setCeldaNota(da?.nota || 'Deuda Anterior de Gas')
    } else {
      const m = apto.meses?.[mesKey!]
      const tiene = m && m.estado !== 'sin_cuota' && (m.montoBs > 0 || m.montoUsd > 0)
      const mVal = tiene ? (m.moneda === 'BS' ? m.montoBs : m.montoUsd) : (data?.config?.costoPorAptoDefectoBs || '')
      setCeldaMonto(mVal ? mVal.toString() : '')
      setCeldaMoneda(m?.moneda || data?.config?.monedaCuota || 'BS')
      setCeldaEstado(m?.estado === 'pagado' ? 'pagado' : 'pendiente')
      setCeldaReferencia(m?.referencia || '')
      setCeldaMetodo(m?.metodoPago || 'pago_movil')
      setCeldaFechaPago(m?.fechaPago || new Date().toISOString().slice(0, 10))
      setCeldaNota(m?.observaciones || '')
    }

    setModalCeldaDeudaOpen(true)
  }

  const handleGuardarCeldaDeuda = async () => {
    if (!celdaApto) return
    setGuardandoCelda(true)
    try {
      const numMonto = parseFloat(celdaMonto.replace(',', '.')) || 0

      if (celdaTipo === 'anterior') {
        const res = await guardarDeudaAnteriorGas({
          apartamentoId: celdaApto.id,
          apartamentoNumero: celdaApto.numero,
          monto: numMonto,
          moneda: celdaMoneda,
          estado: celdaEstado,
          nota: celdaNota
        })
        if (res.success && res.data) {
          setData(res.data)
          showToast(`Deuda anterior de Apto ${celdaApto.numero} guardada`)
          setModalCeldaDeudaOpen(false)
        } else {
          showToast(res.error || 'Error guardando deuda anterior')
        }
      } else {
        const res = await guardarDeudaMesGas({
          mesKey: celdaMesKey,
          mesLabel: celdaMesLabel,
          apartamentoId: celdaApto.id,
          apartamentoNumero: celdaApto.numero,
          propietario: celdaApto.propietario,
          monto: numMonto,
          moneda: celdaMoneda,
          estado: celdaEstado,
          referencia: celdaReferencia,
          metodo: celdaMetodo,
          fechaPago: celdaFechaPago,
          nota: celdaNota
        })
        if (res.success && res.data) {
          setData(res.data)
          showToast(`Cuota de ${celdaMesLabel} para Apto ${celdaApto.numero} actualizada`)
          setModalCeldaDeudaOpen(false)
        } else {
          showToast(res.error || 'Error actualizando cuota mensual')
        }
      }
      await cargarDatos()
    } catch (err: any) {
      showToast(err.message || 'Error guardando')
    } finally {
      setGuardandoCelda(false)
    }
  }

  const handleEliminarDeudaDesdeCelda = async () => {
    if (!celdaApto) return
    const concepto = celdaTipo === 'anterior' ? 'la deuda anterior' : `la cuota de ${celdaMesLabel}`
    if (!window.confirm(`¿Estás seguro de eliminar ${concepto} para el Apto ${celdaApto.numero}? El saldo quedará en 0 y solvente.`)) return

    setGuardandoCelda(true)
    try {
      if (celdaTipo === 'anterior') {
        const res = await eliminarDeudaAnteriorGas(celdaApto.numero)
        if (res.success && res.data) {
          setData(res.data)
          showToast(`Deuda anterior de Apto ${celdaApto.numero} eliminada`)
          setModalCeldaDeudaOpen(false)
        } else {
          showToast(res.error || 'Error eliminando deuda anterior')
        }
      } else {
        const res = await eliminarDeudaMesGas(celdaMesKey, celdaApto.numero)
        if (res.success && res.data) {
          setData(res.data)
          showToast(`Deuda de ${celdaMesLabel} para Apto ${celdaApto.numero} eliminada`)
          setModalCeldaDeudaOpen(false)
        } else {
          showToast(res.error || 'Error eliminando deuda del mes')
        }
      }
      await cargarDatos()
    } catch (err: any) {
      showToast(err.message || 'Error eliminando deuda')
    } finally {
      setGuardandoCelda(false)
    }
  }

  const handleGuardarDeudaAnteriorModal = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardandoDeudaAnterior(true)
    try {
      const numMonto = parseFloat(formDeudaAnterior.monto.replace(',', '.')) || 0
      if (formDeudaAnterior.aplicarATodos) {
        if (!window.confirm(`¿Seguro que deseas asignar ${formDeudaAnterior.moneda === 'BS' ? `Bs. ${numMonto}` : `$${numMonto}`} como deuda anterior a TODOS los ${apartamentosDb.length} apartamentos?`)) {
          setGuardandoDeudaAnterior(false)
          return
        }
        for (const apto of apartamentosDb) {
          await guardarDeudaAnteriorGas({
            apartamentoId: apto.id,
            apartamentoNumero: apto.numero,
            monto: numMonto,
            moneda: formDeudaAnterior.moneda,
            nota: formDeudaAnterior.nota,
            estado: 'pendiente'
          })
        }
        showToast(`Deuda anterior asignada a todos los apartamentos`)
      } else {
        const aptoObj = apartamentosDb.find(a => a.numero === formDeudaAnterior.apartamentoNumero)
        const res = await guardarDeudaAnteriorGas({
          apartamentoId: aptoObj?.id || formDeudaAnterior.apartamentoId,
          apartamentoNumero: formDeudaAnterior.apartamentoNumero,
          monto: numMonto,
          moneda: formDeudaAnterior.moneda,
          nota: formDeudaAnterior.nota,
          estado: 'pendiente'
        })
        if (res.success && res.data) {
          setData(res.data)
          showToast(`Deuda anterior guardada para Apto ${formDeudaAnterior.apartamentoNumero}`)
        }
      }
      setModalDeudaAnteriorOpen(false)
      await cargarDatos()
    } catch (err: any) {
      showToast(err.message || 'Error guardando deuda anterior')
    } finally {
      setGuardandoDeudaAnterior(false)
    }
  }

  const handleEliminarDeudaModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formEliminarDeuda.apartamentoNumero) return
    const aptoNum = formEliminarDeuda.apartamentoNumero
    const tipo = formEliminarDeuda.tipoEliminacion

    const msg = tipo === 'anterior'
      ? `¿Eliminar la deuda anterior de gas del Apto ${aptoNum}?`
      : tipo === 'mes'
      ? `¿Eliminar la deuda de gas del mes ${formEliminarDeuda.mesKey} para el Apto ${aptoNum}?`
      : `¿Eliminar TODAS las deudas de gas (anterior y mensual) del Apto ${aptoNum}?`

    if (!window.confirm(msg)) return

    setEliminandoDeuda(true)
    try {
      if (tipo === 'anterior') {
        const res = await eliminarDeudaAnteriorGas(aptoNum)
        if (res.success && res.data) setData(res.data)
        showToast(`Deuda anterior del Apto ${aptoNum} eliminada`)
      } else if (tipo === 'mes') {
        const res = await eliminarDeudaMesGas(formEliminarDeuda.mesKey || `${calAnio}-10`, aptoNum)
        if (res.success && res.data) setData(res.data)
        showToast(`Deuda de mes del Apto ${aptoNum} eliminada`)
      } else if (tipo === 'todas') {
        const res = await eliminarTodasLasDeudasGasApartamento(aptoNum)
        if (res.success && res.data) setData(res.data)
        showToast(`Todas las deudas de gas del Apto ${aptoNum} fueron eliminadas`)
      }
      setModalEliminarDeudaOpen(false)
      await cargarDatos()
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar deuda')
    } finally {
      setEliminandoDeuda(false)
    }
  }

  const handleGuardarNivelTanque = async () => {
    const res = await actualizarConfigTanque({ nivelActualPorcentaje: nuevoNivelTanque })
    if (res.success && res.data) {
      setData(res.data)
      setModalNivelTanqueOpen(false)
      showToast(`Nivel del tanque actualizado a ${nuevoNivelTanque}%`)
    } else {
      showToast('Error al actualizar nivel del tanque')
    }
  }

  const handleGuardarLlenado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data) return
    const tasa = data.config.tasaBcv || 859.06
    const costoNum = Number(formLlenado.costoMonto) || 0

    let costoTotalBs = 0
    let costoTotalUsd = 0

    if (formLlenado.monedaCosto === 'BS') {
      costoTotalBs = costoNum
      costoTotalUsd = tasa > 0 ? Number((costoNum / tasa).toFixed(2)) : 0
    } else {
      costoTotalUsd = costoNum
      costoTotalBs = Number((costoNum * tasa).toFixed(2))
    }

    const payload: Omit<LlenadoGas, 'id'> = {
      fecha: formLlenado.fecha,
      porcentajeInicial: formLlenado.porcentajeInicial,
      porcentajeFinal: formLlenado.porcentajeFinal,
      litrosCargados: Number(formLlenado.litrosCargados) || 0,
      costoTotalBs,
      costoTotalUsd,
      tasaBcv: tasa,
      proveedor: formLlenado.proveedor.trim(),
      numeroFacturaGuia: formLlenado.numeroFacturaGuia.trim(),
      responsableRecibio: formLlenado.responsableRecibio.trim(),
      estado: formLlenado.estado,
      observaciones: formLlenado.observaciones.trim()
    }

    const res = await registrarLlenado(payload)
    if (res.success && res.data) {
      setData(res.data)
      setModalLlenadoOpen(false)
      showToast('✅ Llenado registrado y nivel del tanque sincronizado')
    } else {
      showToast('Error al registrar llenado')
    }
  }

  const handleEliminarLlenado = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro de llenado?')) return
    const res = await eliminarLlenado(id)
    if (res.success && res.data) {
      setData(res.data)
      showToast('Registro de llenado eliminado')
    }
  }

  // Guardar evento de recaudación por día (con opción de Bs. o USD)
  const handleGuardarEvento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formEvento.titulo.trim()) {
      showToast('Ingresa un título para el registro')
      return
    }
    const monto = Number(formEvento.monto) || 0
    const tasa = data?.config.tasaBcv || 859.06

    let montoBs = 0
    let montoUsd = 0

    if (formEvento.moneda === 'BS') {
      montoBs = monto
      montoUsd = tasa > 0 ? Number((monto / tasa).toFixed(2)) : 0
    } else {
      montoUsd = monto
      montoBs = Number((monto * tasa).toFixed(2))
    }

    const res = await guardarEventoCalendario({
      fecha: formEvento.fecha,
      tipo: formEvento.tipo,
      titulo: formEvento.titulo.trim(),
      descripcion: formEvento.descripcion.trim(),
      moneda: formEvento.moneda,
      montoBs,
      montoUsd
    })

    if (res.success && res.data) {
      setData(res.data)
      setModalEventoOpen(false)
      showToast('Registro diario guardado en el calendario')
    }
  }

  const handleEliminarEvento = async (id: string) => {
    const res = await eliminarEventoCalendario(id)
    if (res.success && res.data) {
      setData(res.data)
      showToast('Registro eliminado del calendario')
    }
  }

  const abrirModalPago = (apto: DetallePagoAptoGas) => {
    setAptoParaPagar(apto)
    const moneda = (apto.moneda as 'BS' | 'USD') || data?.config.monedaCuota || 'BS'
    const montoDefecto = moneda === 'BS'
      ? (apto.montoBs || data?.config.costoPorAptoDefectoBs || 0)
      : (apto.montoUsd || data?.config.costoPorAptoDefectoUsd || 0)

    setFormPago({
      fechaPago: new Date().toISOString().slice(0, 10),
      moneda,
      monto: montoDefecto ? String(montoDefecto) : '',
      metodoPago: (apto.metodoPago as any) || (moneda === 'BS' ? 'pago_movil' : 'efectivo_usd'),
      referencia: apto.referencia || '',
      observaciones: apto.observaciones || ''
    })
    setModalPagoOpen(true)
  }

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || !metricas?.jornadaActiva || !aptoParaPagar) return
    const tasa = data.config.tasaBcv || 859.06
    const montoNum = Number(formPago.monto) || 0

    let montoBs = 0
    let montoUsd = 0

    if (formPago.moneda === 'BS') {
      montoBs = montoNum
      montoUsd = tasa > 0 ? Number((montoNum / tasa).toFixed(2)) : 0
    } else {
      montoUsd = montoNum
      montoBs = Number((montoNum * tasa).toFixed(2))
    }

    const key = aptoParaPagar.apartamentoId || aptoParaPagar.apartamentoNumero
    const res = await togglePagoApartamento(metricas.jornadaActiva.id, key, {
      estado: 'pagado',
      fechaPago: formPago.fechaPago,
      moneda: formPago.moneda,
      montoBs,
      montoUsd,
      metodoPago: formPago.metodoPago,
      referencia: formPago.referencia.trim(),
      observaciones: formPago.observaciones.trim()
    })

    if (res.success && res.data) {
      setData(res.data)
      setModalPagoOpen(false)
      showToast(`Pago del Apto ${aptoParaPagar.apartamentoNumero} registrado exitosamente`)
    } else {
      showToast('Error al registrar pago')
    }
  }

  const handleRevertirPago = async (apto: DetallePagoAptoGas) => {
    if (!data || !metricas?.jornadaActiva) return
    if (!window.confirm(`¿Revertir Apto ${apto.apartamentoNumero} a estado DEUDA PENDIENTE?`)) return
    const key = apto.apartamentoId || apto.apartamentoNumero
    const res = await togglePagoApartamento(metricas.jornadaActiva.id, key, {
      estado: 'pendiente',
      referencia: '',
      observaciones: 'Pago revertido por administración'
    })
    if (res.success && res.data) {
      setData(res.data)
      showToast(`Apto ${apto.apartamentoNumero} marcado como deuda pendiente`)
    }
  }

  const handleGuardarConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formConfig) return
    const res = await actualizarConfigTanque(formConfig)
    if (res.success && res.data) {
      setData(res.data)
      setModalConfigOpen(false)
      showToast('Configuración del servicio de gas actualizada')
    } else {
      showToast('Error al guardar configuración')
    }
  }

  const handlePublicarCuota = async (e: React.FormEvent) => {
    e.preventDefault()
    const montoNum = parseFloat(String(formCuota.monto).replace(',', '.'))
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast('Por favor introduce un monto válido mayor a 0')
      return
    }

    setGuardandoCuota(true)
    try {
      const res = await crearOActualizarCuotaGas({
        titulo: formCuota.titulo.trim() || (formCuota.esEspecial ? 'Cuota Especial de Gas Comunal' : 'Cuota de Gas Comunal'),
        esEspecial: formCuota.esEspecial,
        moneda: formCuota.moneda,
        monto: montoNum,
        fechaLimite: formCuota.fechaLimite ? formCuota.fechaLimite : undefined,
        enviarEmail: formCuota.enviarEmail,
        tasaBcv: data?.config.tasaBcv || 859.06
      })

      if (res.success && res.data) {
        setData(res.data)
        setModalPublicarCuotaOpen(false)
        if (res.emailsEnviados && res.emailsEnviados > 0) {
          showToast(`¡Cuota ${formCuota.esEspecial ? 'Especial' : 'Ordinaria'} asignada! Se enviaron ${res.emailsEnviados} correos con la información de pago.`)
        } else {
          showToast(`¡Cuota ${formCuota.esEspecial ? 'Especial' : 'Ordinaria'} asignada exitosamente a todos los apartamentos!`)
        }
      } else {
        showToast(res.error || 'Error al asignar la cuota de gas')
      }
    } catch (err: any) {
      showToast(err.message || 'Error inesperado al asignar la cuota')
    } finally {
      setGuardandoCuota(false)
    }
  }

  const handleCobroWhatsapp = (apto: DetallePagoAptoGas) => {
    const isBs = data?.config.monedaCuota === 'BS'
    const textoMonto = isBs
      ? `Bs. ${(apto.montoBs || data?.config.costoPorAptoDefectoBs || 0).toLocaleString('es-VE')}`
      : `$${(apto.montoUsd || data?.config.costoPorAptoDefectoUsd || 0).toFixed(2)} USD (≈ Bs. ${(apto.montoBs || 0).toLocaleString('es-VE')})`

    const msg = encodeURIComponent(
      `Hola vecino(a) del Apto ${apto.apartamentoNumero} (${apto.propietario || ''}), le recordamos que la cuota del servicio de gas comunal para la recarga del tanque (${metricas?.jornadaActiva?.titulo || 'Recaudación de Gas'}) por monto de ${textoMonto} está pendiente por conciliar. Agradecemos reportar su comprobante o referencia.`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#a1a1aa' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⛽</div>
        <p>Cargando servicio de gas comunal...</p>
      </div>
    )
  }

  const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const esMonedaBs = data?.config.monedaCuota === 'BS'

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1240px', margin: '0 auto', color: '#f4f4f5' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: 'var(--color-accent, #f97316)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          fontWeight: 700,
          fontSize: '13px',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⛽</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>⛽</span>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              Servicio de Gas Comunal
            </h1>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: 'rgba(249, 115, 22, 0.15)',
              color: 'var(--color-accent, #f97316)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              padding: '2px 10px',
              borderRadius: '999px'
            }}>
              Recaudo en {esMonedaBs ? 'Bolívares (Bs.)' : 'Dólares ($)'}
            </span>
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '6px 0 0' }}>
            Deuda de gas separada del recibo ordinario · Recaudaciones por día en Bs. y Dólares.
          </p>
        </div>

        {/* Acciones Rápidas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              const jornadaActiva = data?.jornadas?.find(j => j.estado === 'activa')
              setFormCuota({
                titulo: jornadaActiva?.titulo || 'Recarga de Gas Comunal',
                esEspecial: Boolean(jornadaActiva?.esEspecial),
                moneda: data?.config.monedaCuota || 'BS',
                monto: data?.config.monedaCuota === 'BS'
                  ? (data?.config.costoPorAptoDefectoBs ? String(data.config.costoPorAptoDefectoBs) : '')
                  : (data?.config.costoPorAptoDefectoUsd ? String(data.config.costoPorAptoDefectoUsd) : ''),
                fechaLimite: jornadaActiva?.fechaLimite || '',
                enviarEmail: true
              })
              setModalPublicarCuotaOpen(true)
            }}
            style={{
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            <span>📢</span>
            <span>Asignar / Publicar Cuota</span>
          </button>

          <button
            onClick={() => setModalLlenadoOpen(true)}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: 'var(--color-brand-shadow, 0 4px 14px rgba(249, 115, 22, 0.4))'
            }}
          >
            <span>+</span>
            <span>Registrar Llenado</span>
          </button>

          <button
            onClick={() => setModalDeudaAnteriorOpen(true)}
            style={{
              backgroundColor: 'rgba(234, 88, 12, 0.15)',
              color: '#fb923c',
              border: '1px solid rgba(234, 88, 12, 0.4)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Asignar deuda anterior histórica a un apartamento o a todos"
          >
            <span>🏛️</span>
            <span>Colocar Deuda Anterior</span>
          </button>

          <button
            onClick={() => setModalEliminarDeudaOpen(true)}
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Eliminar o exonerar deuda de un apartamento"
          >
            <span>🗑️</span>
            <span>Eliminar Deuda</span>
          </button>

          <button
            onClick={() => {
              setFormEvento(prev => ({ ...prev, fecha: diaSeleccionado || new Date().toISOString().slice(0, 10) }))
              setModalEventoOpen(true)
            }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>💰</span>
            <span>Recaudación por Día (Bs/$)</span>
          </button>

          <button
            onClick={() => setModalConfigOpen(true)}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#a1a1aa',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '10px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              cursor: 'pointer'
            }}
            title="Ajustes de Cuota y Datos Bancarios"
          >
            ⚙️
          </button>

          <button
            onClick={handleReiniciarLimpio}
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Limpiar datos de prueba y forzar sincronización limpia"
          >
            <span>🔄</span>
            <span>Limpiar Datos</span>
          </button>
        </div>
      </div>

      {/* ── MICRO DASHBOARD (4 CARDS) ─────────────────────────────────── */}
      {metricas && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '28px'
        }}>
          {/* CARD 1: Nivel de Tanque con Gauge */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                NIVEL DEL TANQUE
              </span>
              <button
                onClick={() => setModalNivelTanqueOpen(true)}
                style={{
                  background: 'rgba(249, 115, 22, 0.15)',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  color: 'var(--color-accent, #f97316)',
                  borderRadius: '8px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Ajustar %
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: 900, color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e' }}>
                {metricas.nivelPct}%
              </span>
              <span style={{ fontSize: '13px', color: '#a1a1aa' }}>
                ({metricas.litrosActuales.toLocaleString()} / {metricas.capacidadTotal.toLocaleString()} L)
              </span>
            </div>

            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              margin: '12px 0 10px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${metricas.nivelPct}%`,
                background: metricas.nivelPct <= 25
                  ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
                  : 'linear-gradient(90deg, #22c55e 0%, #3b82f6 100%)',
                borderRadius: '999px',
                transition: 'width 0.4s ease'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa' }}>
              <span>Autonomía: <b style={{ color: '#fff' }}>{metricas.diasAutonomia > 0 ? `~${metricas.diasAutonomia} días` : 'Sin carga'}</b></span>
              <span style={{ color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                {metricas.nivelEstado.toUpperCase()}
              </span>
            </div>
          </div>

          {/* CARD 2: Recaudación Activa (En Bolívares y Dólares) */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  RECAUDACIÓN ACTIVA
                </span>
                {metricas.jornadaActiva?.esEspecial && (
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 900,
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '1px 6px',
                    borderRadius: '4px'
                  }}>
                    ⚡ ESPECIAL
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                padding: '2px 8px',
                borderRadius: '999px'
              }}>
                {metricas.porcentajeRecaudado}% Meta
              </span>
            </div>

            {esMonedaBs ? (
              <div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#22c55e' }}>
                  Bs. {metricas.totalRecaudadoBs.toLocaleString('es-VE')}
                </div>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                  Meta: Bs. {metricas.metaBs.toLocaleString('es-VE')} (${metricas.metaUsd.toFixed(2)} USD)
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#22c55e' }}>
                  ${metricas.totalRecaudadoUsd.toFixed(2)} USD
                </div>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                  Meta: ${metricas.metaUsd.toFixed(2)} USD (≈ Bs. {metricas.metaBs.toLocaleString('es-VE')})
                </div>
              </div>
            )}

            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              margin: '12px 0 10px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${metricas.porcentajeRecaudado}%`,
                background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)',
                borderRadius: '999px'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa' }}>
              <span>Cuota: <b>{esMonedaBs ? `Bs. ${(data?.config.costoPorAptoDefectoBs || 0).toLocaleString('es-VE')}` : `$${(data?.config.costoPorAptoDefectoUsd || 0).toFixed(2)} USD`}</b></span>
              <span>Tasa: Bs. {data?.config.tasaBcv}</span>
            </div>
          </div>

          {/* CARD 3: Deudores vs Solventes */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                DEUDORES DE GAS
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                backgroundColor: metricas.aptosMorosos > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: metricas.aptosMorosos > 0 ? '#ef4444' : '#22c55e',
                padding: '2px 8px',
                borderRadius: '999px'
              }}>
                {metricas.aptosMorosos} Pendientes
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#22c55e' }}>{metricas.aptosSolventes}</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Solventes</div>
              </div>
              <div style={{ height: '36px', width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#ef4444' }}>{metricas.aptosMorosos}</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Con Deuda</div>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => {
                  setFiltroEstado('morosos')
                  setActiveTab('morosos')
                }}
                style={{
                  width: '100%',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  borderRadius: '10px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Ver Lista de Deudores →
              </button>
            </div>
          </div>

          {/* CARD 4: Llenados de Tanque */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                HISTORIAL DE CISTERNAS
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>
                {data?.llenados.length || 0} Llenados
              </span>
            </div>

            <div style={{ fontSize: '13px', marginBottom: '8px' }}>
              <div style={{ color: '#a1a1aa', fontSize: '11px' }}>Último Llenado Registrado:</div>
              <div style={{ fontWeight: 700, color: '#fff' }}>
                {metricas.ultimoLlenado?.fecha || 'Sin llenados registrados'}
              </div>
              {metricas.ultimoLlenado && (
                <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '2px' }}>
                  {metricas.ultimoLlenado.litrosCargados.toLocaleString()} L · {metricas.ultimoLlenado.proveedor}
                </div>
              )}
            </div>

            <div style={{ paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
              <button
                onClick={() => setModalLlenadoOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent, #f97316)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                + Registrar descarga de cisterna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {[
          { key: 'dashboard', label: '📊 Resumen de Campaña' },
          { key: 'calendario', label: '📅 Calendario de Deudas de Gas' },
          { key: 'morosos', label: `👥 Morosos y Solventes (${metricas?.totalAptos || 62})` },
          { key: 'llenados', label: `🚛 Llenados (${data?.llenados.length || 0})` }
        ].map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                backgroundColor: isActive ? 'var(--color-accent-light, rgba(249, 115, 22, 0.15))' : 'transparent',
                color: isActive ? 'var(--color-accent, #f97316)' : '#a1a1aa',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-accent, #f97316)' : '2px solid transparent',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB 1: RESUMEN DE CAMPAÑA ─────────────────────────────────── */}
      {activeTab === 'dashboard' && metricas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {metricas.jornadaActiva?.titulo || 'Recaudación de Gas'}
              </h3>
              <span style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                ACTIVA
              </span>
            </div>

            <p style={{ color: '#a1a1aa', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
              Recaudación de cuota de gas comunal para la recarga del tanque. Esta deuda se concilia por separado del recibo mensual y aparece al residente como deuda en Bolívares y Divisas.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Moneda Principal</span>
                <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px', color: 'var(--color-accent, #f97316)' }}>
                  {esMonedaBs ? 'Bolívares (Bs.)' : 'Dólares ($ USD)'}
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Cuota por Apto</span>
                <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px' }}>
                  {esMonedaBs
                    ? `Bs. ${(data?.config.costoPorAptoDefectoBs || 0).toLocaleString('es-VE')}`
                    : `$${(data?.config.costoPorAptoDefectoUsd || 0).toFixed(2)} USD`}
                </div>
              </div>
            </div>

            {/* Datos Bancarios Configurados */}
            <div style={{
              backgroundColor: 'rgba(249, 115, 22, 0.06)',
              border: '1px solid rgba(249, 115, 22, 0.2)',
              borderRadius: '14px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)', marginBottom: '8px' }}>
                🏦 Datos de Pago Móvil / Transferencia para el Residente:
              </div>
              <div style={{ fontSize: '12px', color: '#ddd', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><b>Banco:</b> {data?.config.datosPago.banco || 'Por configurar'}</div>
                <div><b>Teléfono:</b> {data?.config.datosPago.telefono || 'Por configurar'}</div>
                <div><b>RIF / C.I.:</b> {data?.config.datosPago.rifCedula || 'Por configurar'}</div>
                <div><b>Titular:</b> {data?.config.datosPago.titular}</div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800 }}>
              Conciliación Rápida
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => {
                  setFiltroEstado('morosos')
                  setActiveTab('morosos')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: '#ef4444' }}>
                    {metricas.aptosMorosos} Apartamentos con Deuda Pendiente
                  </div>
                  <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                    {esMonedaBs
                      ? `Por cobrar: Bs. ${(metricas.aptosMorosos * (data?.config.costoPorAptoDefectoBs || 0)).toLocaleString('es-VE')}`
                      : `Por cobrar: $${(metricas.aptosMorosos * (data?.config.costoPorAptoDefectoUsd || 0)).toFixed(2)} USD`}
                  </div>
                </div>
                <span style={{ fontSize: '18px' }}>→</span>
              </button>

              <button
                onClick={() => {
                  setFiltroEstado('solventes')
                  setActiveTab('morosos')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: '#22c55e' }}>
                    {metricas.aptosSolventes} Apartamentos Solventes
                  </div>
                  <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                    Recaudado: Bs. {metricas.totalRecaudadoBs.toLocaleString('es-VE')} (${metricas.totalRecaudadoUsd.toFixed(2)} USD)
                  </div>
                </div>
                <span style={{ fontSize: '18px' }}>→</span>
              </button>

              <button
                onClick={() => setActiveTab('calendario')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--color-accent, #f97316)' }}>
                    Registrar Recaudaciones Diarias en el Calendario
                  </div>
                  <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                    Anotar ingresos diarios en Bolívares o Dólares
                  </div>
                </div>
                <span style={{ fontSize: '18px' }}>📅</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CALENDARIO DE DEUDAS DE GAS (ESTILO CONDOMINIO NORMAL) ── */}
      {activeTab === 'calendario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* BARRA SUPERIOR DE RESUMEN Y CONTROLES */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Fila 1: Indicadores Rápidos */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>
                  Deuda Total Pendiente
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
                  Bs. {fmtBs(totalesMatriz.granTotalBs)}
                </div>
                <div style={{ fontSize: '12px', color: '#fb923c', fontWeight: 700 }}>
                  ≈ ${fmtUsd(totalesMatriz.granTotalUsd)} USD
                </div>
              </div>

              <div style={{
                backgroundColor: 'rgba(234, 88, 12, 0.06)',
                border: '1px solid rgba(234, 88, 12, 0.25)',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '11px', color: '#fb923c', fontWeight: 800, textTransform: 'uppercase' }}>
                  Deuda Anterior Acumulada
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#fb923c', marginTop: '4px' }}>
                  Bs. {fmtBs(totalesMatriz.sumDeudaAntBs)}
                </div>
                <div style={{ fontSize: '12px', color: '#fed7aa', fontWeight: 700 }}>
                  ≈ ${fmtUsd(totalesMatriz.sumDeudaAntUsd)} USD
                </div>
              </div>

              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 800, textTransform: 'uppercase' }}>
                  Apartamentos Solventes
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>
                  {totalesMatriz.aptosSolventes} / {filasFiltradasMatriz.length}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                  {filasFiltradasMatriz.length > 0 ? Math.round((totalesMatriz.aptosSolventes / filasFiltradasMatriz.length) * 100) : 0}% al día
                </div>
              </div>

              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 800, textTransform: 'uppercase' }}>
                  Apartamentos con Deuda
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
                  {totalesMatriz.aptosConDeuda}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                  Requieren gestión de cobro
                </div>
              </div>
            </div>

            {/* Fila 2: Filtros, Buscador y Botones de Acción */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              {/* Filtros de Estado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setFiltroEstado('todos')}
                  style={{
                    backgroundColor: filtroEstado === 'todos' ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.06)',
                    color: '#fff',
                    border: 'none',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Todos ({filasGasMatriz.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado('morosos')}
                  style={{
                    backgroundColor: filtroEstado === 'morosos' ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                    color: filtroEstado === 'morosos' ? '#fff' : '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Con Deuda ({filasGasMatriz.filter(f => !f.estado_solvente).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado('solventes')}
                  style={{
                    backgroundColor: filtroEstado === 'solventes' ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
                    color: filtroEstado === 'solventes' ? '#fff' : '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Solventes ({filasGasMatriz.filter(f => f.estado_solvente).length})
                </button>

                {/* Buscador */}
                <input
                  type="text"
                  placeholder="Buscar apartamento o propietario..."
                  value={busquedaApto}
                  onChange={e => setBusquedaApto(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    outline: 'none',
                    minWidth: '220px'
                  }}
                />
              </div>

              {/* Botones de Acción: Colocar Deuda Anterior y Eliminar Deuda */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Selector de Año */}
                <select
                  value={calAnio}
                  onChange={e => setCalAnio(Number(e.target.value))}
                  style={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    color: '#fff',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <option value={2026}>Año 2026</option>
                  <option value={2027}>Año 2027</option>
                </select>

                <button
                  type="button"
                  onClick={() => setModalDeudaAnteriorOpen(true)}
                  style={{
                    backgroundColor: 'rgba(234, 88, 12, 0.2)',
                    color: '#fb923c',
                    border: '1px solid rgba(234, 88, 12, 0.45)',
                    padding: '7px 13px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🏛️</span>
                  <span>Colocar Deuda Anterior</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalEliminarDeudaOpen(true)}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.18)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    padding: '7px 13px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🗑️</span>
                  <span>Eliminar Deuda</span>
                </button>

                {/* Switch de subvista */}
                <div style={{
                  display: 'flex',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  padding: '2px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <button
                    type="button"
                    onClick={() => setVistaCalendarioGas('matriz')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: vistaCalendarioGas === 'matriz' ? 'var(--color-accent, #f97316)' : 'transparent',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📊 Matriz
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaCalendarioGas('bitacora')}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: vistaCalendarioGas === 'bitacora' ? 'var(--color-accent, #f97316)' : 'transparent',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📅 Bitácora
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* VISTA 1: TABLA MATRIZ DE DEUDAS DE GAS (ESTILO CONDOMINIO NORMAL) */}
          {vistaCalendarioGas === 'matriz' && (
            <div style={{
              background: '#070b14',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
              <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  textAlign: 'right'
                }}>
                  {/* Cabecera Nivel 1 */}
                  <thead>
                    <tr style={{ backgroundColor: '#030712', borderBottom: '1px solid #1e293b' }}>
                      <th style={{
                        position: 'sticky',
                        left: 0,
                        top: 0,
                        zIndex: 30,
                        backgroundColor: '#030712',
                        padding: '12px 14px',
                        color: '#94a3b8',
                        textAlign: 'left',
                        fontWeight: 800,
                        borderRight: '2px solid #334155',
                        minWidth: '130px'
                      }}>
                        APARTAMENTO
                      </th>

                      {/* Agrupador Naranja: Deuda Anterior */}
                      <th style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        backgroundColor: 'rgba(234, 88, 12, 0.16)',
                        color: '#fb923c',
                        padding: '8px 12px',
                        textAlign: 'center',
                        fontWeight: 800,
                        borderRight: '2px solid rgba(234, 88, 12, 0.4)'
                      }}>
                        🏛️ DEUDA ANTERIOR GAS
                      </th>

                      {/* Agrupador Azul: Calendario Mensual */}
                      <th
                        colSpan={12}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 20,
                          backgroundColor: 'rgba(59, 130, 246, 0.16)',
                          color: '#60a5fa',
                          padding: '8px 12px',
                          textAlign: 'center',
                          fontWeight: 800,
                          borderRight: '2px solid rgba(59, 130, 246, 0.4)'
                        }}
                      >
                        📅 CALENDARIO MENSUAL {calAnio} (SERVICIO DE GAS)
                      </th>

                      {/* Columnas Totales */}
                      <th style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        color: '#fb923c',
                        padding: '8px 12px',
                        fontWeight: 800
                      }}>
                        TOTAL BS
                      </th>
                      <th style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        color: '#60a5fa',
                        padding: '8px 12px',
                        fontWeight: 800
                      }}>
                        TOTAL $
                      </th>
                      <th style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        color: '#cbd5e1',
                        padding: '8px 14px',
                        textAlign: 'center',
                        fontWeight: 800
                      }}>
                        ESTADO
                      </th>
                    </tr>

                    {/* Cabecera Nivel 2: Subcolumnas */}
                    <tr style={{ backgroundColor: '#070b14', borderBottom: '2px solid #334155' }}>
                      <th style={{
                        position: 'sticky',
                        left: 0,
                        top: '37px',
                        zIndex: 30,
                        backgroundColor: '#070b14',
                        padding: '8px 14px',
                        color: '#64748b',
                        textAlign: 'left',
                        fontWeight: 700,
                        fontSize: '11px',
                        borderRight: '2px solid #334155'
                      }}>
                        # / Propietario
                      </th>

                      <th style={{
                        position: 'sticky',
                        top: '37px',
                        zIndex: 20,
                        backgroundColor: 'rgba(234, 88, 12, 0.1)',
                        padding: '8px 10px',
                        color: '#fb923c',
                        fontWeight: 800,
                        fontSize: '11px',
                        textAlign: 'center',
                        borderRight: '2px solid rgba(234, 88, 12, 0.4)'
                      }}>
                        Saldo Histórico
                      </th>

                      {MESES_CONFIG.map(m => (
                        <th
                          key={m.mesKey}
                          style={{
                            position: 'sticky',
                            top: '37px',
                            zIndex: 20,
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            padding: '8px 10px',
                            color: '#93c5fd',
                            fontWeight: 800,
                            fontSize: '11px',
                            textAlign: 'center',
                            borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                            minWidth: '70px'
                          }}
                        >
                          {m.label}
                        </th>
                      ))}

                      <th style={{
                        position: 'sticky',
                        top: '37px',
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        padding: '8px 12px',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '11px'
                      }}>
                        Bs.
                      </th>
                      <th style={{
                        position: 'sticky',
                        top: '37px',
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        padding: '8px 12px',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '11px'
                      }}>
                        USD $
                      </th>
                      <th style={{
                        position: 'sticky',
                        top: '37px',
                        zIndex: 20,
                        backgroundColor: '#0f172a',
                        padding: '8px 14px',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '11px',
                        textAlign: 'center'
                      }}>
                        Condición
                      </th>
                    </tr>
                  </thead>

                  {/* Cuerpo de la Tabla */}
                  <tbody>
                    {filasFiltradasMatriz.length === 0 ? (
                      <tr>
                        <td colSpan={16} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                          No se encontraron apartamentos con los filtros seleccionados
                        </td>
                      </tr>
                    ) : (
                      filasFiltradasMatriz.map(fila => {
                        return (
                          <tr
                            key={fila.apartamento_id}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            {/* APARTAMENTO STICKY */}
                            <td style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              backgroundColor: '#070b14',
                              padding: '10px 14px',
                              textAlign: 'left',
                              borderRight: '2px solid #334155'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: fila.estado_solvente ? '#10b981' : '#ef4444'
                                }} />
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                                    Apto {fila.apartamento_numero}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {fila.propietario_nombre}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* CELDA DEUDA ANTERIOR */}
                            <td
                              onClick={() => handleAbrirCeldaDeuda(fila, 'anterior')}
                              style={{
                                padding: '8px 10px',
                                textAlign: 'center',
                                borderRight: '2px solid rgba(234, 88, 12, 0.4)',
                                backgroundColor: fila.deuda_anterior.estado === 'pendiente' && fila.deuda_anterior.montoBs > 0
                                  ? 'rgba(234, 88, 12, 0.1)'
                                  : 'transparent',
                                cursor: 'pointer'
                              }}
                              title="Clic para modificar o eliminar deuda anterior"
                            >
                              {fila.deuda_anterior.estado === 'pendiente' && (fila.deuda_anterior.montoBs > 0 || fila.deuda_anterior.montoUsd > 0) ? (
                                <span style={{
                                  display: 'inline-block',
                                  backgroundColor: 'rgba(234, 88, 12, 0.25)',
                                  color: '#fb923c',
                                  border: '1px solid rgba(234, 88, 12, 0.4)',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 800
                                }}>
                                  {fila.deuda_anterior.moneda === 'BS' ? `Bs. ${fmtBs(fila.deuda_anterior.montoBs)}` : `$${fmtUsd(fila.deuda_anterior.montoUsd)}`}
                                </span>
                              ) : (
                                <span style={{ color: '#475569', fontSize: '11px' }}>-</span>
                              )}
                            </td>

                            {/* CELDAS 12 MESES */}
                            {MESES_CONFIG.map(col => {
                              const mes = fila.meses[col.mesKey]
                              const isPagado = mes?.estado === 'pagado'
                              const isPendiente = mes?.estado === 'pendiente' && ((mes.montoBs || 0) > 0 || (mes.montoUsd || 0) > 0)

                              return (
                                <td
                                  key={col.mesKey}
                                  onClick={() => handleAbrirCeldaDeuda(fila, 'mes', col.mesKey, `${col.nombreCompleto} ${calAnio}`)}
                                  style={{
                                    padding: '8px 8px',
                                    textAlign: 'center',
                                    borderRight: '1px solid rgba(255, 255, 255, 0.04)',
                                    backgroundColor: isPendiente
                                      ? 'rgba(239, 68, 68, 0.08)'
                                      : isPagado
                                      ? 'rgba(16, 185, 129, 0.06)'
                                      : 'transparent',
                                    cursor: 'pointer'
                                  }}
                                  title={`Clic para editar cuota o registrar pago de ${col.nombreCompleto}`}
                                >
                                  {isPagado ? (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '6px',
                                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                      color: '#34d399',
                                      fontWeight: 800,
                                      fontSize: '12px'
                                    }}>
                                      ✓
                                    </span>
                                  ) : isPendiente ? (
                                    <span style={{
                                      display: 'inline-block',
                                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                      color: '#f87171',
                                      border: '1px solid rgba(239, 68, 68, 0.35)',
                                      padding: '3px 6px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 800
                                    }}>
                                      {mes.moneda === 'BS' ? `Bs. ${fmtBs(mes.montoBs)}` : `$${fmtUsd(mes.montoUsd)}`}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#334155', fontSize: '11px' }}>-</span>
                                  )}
                                </td>
                              )
                            })}

                            {/* TOTAL BS */}
                            <td style={{
                              padding: '8px 12px',
                              fontWeight: 800,
                              color: fila.total_bs > 0 ? '#fb923c' : '#475569',
                              backgroundColor: fila.total_bs > 0 ? 'rgba(234, 88, 12, 0.04)' : 'transparent',
                              textAlign: 'right'
                            }}>
                              {fila.total_bs > 0 ? `Bs. ${fmtBs(fila.total_bs)}` : '-'}
                            </td>

                            {/* TOTAL $ */}
                            <td style={{
                              padding: '8px 12px',
                              fontWeight: 800,
                              color: fila.total_usd > 0 ? '#60a5fa' : '#475569',
                              backgroundColor: fila.total_usd > 0 ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                              textAlign: 'right'
                            }}>
                              {fila.total_usd > 0 ? `$${fmtUsd(fila.total_usd)}` : '-'}
                            </td>

                            {/* CONDICIÓN */}
                            <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                              {fila.estado_solvente ? (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                  color: '#34d399',
                                  fontWeight: 800,
                                  fontSize: '11px'
                                }}>
                                  Solvente
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  fontWeight: 800,
                                  fontSize: '11px'
                                }}>
                                  {fila.meses_con_deuda > 1 ? `${fila.meses_con_deuda} deudas` : 'Con Deuda'}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>

                  {/* Fila de Totales Footer */}
                  <tfoot>
                    <tr style={{
                      backgroundColor: '#030712',
                      borderTop: '2px solid #3b82f6',
                      color: '#fff',
                      fontWeight: 800
                    }}>
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        bottom: 0,
                        zIndex: 30,
                        backgroundColor: '#030712',
                        padding: '12px 14px',
                        textAlign: 'left',
                        borderRight: '2px solid #334155',
                        color: '#93c5fd'
                      }}>
                        TOTALES ({filasFiltradasMatriz.length})
                      </td>

                      <td style={{
                        padding: '12px 10px',
                        textAlign: 'center',
                        color: '#fb923c',
                        borderRight: '2px solid rgba(234, 88, 12, 0.4)'
                      }}>
                        {totalesMatriz.sumDeudaAntBs > 0 ? `Bs. ${fmtBs(totalesMatriz.sumDeudaAntBs)}` : '-'}
                      </td>

                      {MESES_CONFIG.map(m => {
                        const sumBs = totalesMatriz.sumMesesBs[m.mesKey] || 0
                        return (
                          <td
                            key={m.mesKey}
                            style={{
                              padding: '12px 8px',
                              textAlign: 'center',
                              color: sumBs > 0 ? '#f87171' : '#475569',
                              borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                              fontSize: '11px'
                            }}
                          >
                            {sumBs > 0 ? `Bs. ${fmtBs(sumBs)}` : '-'}
                          </td>
                        )
                      })}

                      <td style={{ padding: '12px', textAlign: 'right', color: '#fb923c' }}>
                        Bs. {fmtBs(totalesMatriz.granTotalBs)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa' }}>
                        ${fmtUsd(totalesMatriz.granTotalUsd)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#34d399' }}>
                        {totalesMatriz.aptosSolventes} Solv.
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* VISTA 2: BITÁCORA DIARIA ORIGINAL */}
          {vistaCalendarioGas === 'bitacora' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* Vista Mes Calendario */}
              <div style={{
                background: 'var(--color-bg-card, #12141a)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800 }}>
                    {MESES_NOMBRES[calMes - 1]} {calAnio}
                  </span>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => {
                        if (calMes === 1) { setCalMes(12); setCalAnio(y => y - 1) }
                        else { setCalMes(m => m - 1) }
                      }}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => {
                        if (calMes === 12) { setCalMes(1); setCalAnio(y => y + 1) }
                        else { setCalMes(m => m + 1) }
                      }}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '6px',
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#71717a',
                  marginBottom: '8px'
                }}>
                  <div>LUN</div><div>MAR</div><div>MIÉ</div><div>JUE</div><div>VIE</div><div>SÁB</div><div>DOM</div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '6px'
                }}>
                  {diasCalendario.map((celda, idx) => {
                    if (!celda.diaNum || !celda.fechaIso) {
                      return <div key={`empty-${idx}`} style={{ minHeight: '62px' }} />
                    }

                    const evs = eventosPorFecha.get(celda.fechaIso) || []
                    const isSelected = diaSeleccionado === celda.fechaIso
                    const hasLlenado = evs.some(e => e.tipo === 'llenado')
                    const hasRecaudacion = evs.some(e => e.tipo === 'recaudacion')

                    return (
                      <div
                        key={celda.fechaIso}
                        onClick={() => setDiaSeleccionado(celda.fechaIso)}
                        style={{
                          minHeight: '62px',
                          backgroundColor: isSelected
                            ? 'var(--color-accent-light, rgba(249, 115, 22, 0.2))'
                            : 'rgba(255, 255, 255, 0.02)',
                          border: isSelected
                            ? '2px solid var(--color-accent, #f97316)'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '10px',
                          padding: '6px 4px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{
                          fontSize: '12px',
                          fontWeight: isSelected ? 800 : 600,
                          color: isSelected ? 'var(--color-accent, #f97316)' : '#d4d4d8'
                        }}>
                          {celda.diaNum}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {hasLlenado && (
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              backgroundColor: 'rgba(59, 130, 246, 0.25)',
                              color: '#60a5fa',
                              padding: '1px 3px',
                              borderRadius: '4px'
                            }}>
                              ⛽ Llenado
                            </span>
                          )}
                          {hasRecaudacion && (
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              backgroundColor: 'rgba(34, 197, 94, 0.25)',
                              color: '#4ade80',
                              padding: '1px 3px',
                              borderRadius: '4px'
                            }}>
                              💰 Recaudo
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Detalle del Día */}
              <div style={{
                background: 'var(--color-bg-card, #12141a)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: 800 }}>
                      REGISTROS DEL DÍA
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--color-accent, #f97316)' }}>
                      {diaSeleccionado || 'Selecciona un día'}
                    </h3>
                  </div>

                  <button
                    onClick={() => {
                      setFormEvento({
                        fecha: diaSeleccionado || new Date().toISOString().slice(0, 10),
                        tipo: 'recaudacion',
                        titulo: '',
                        descripcion: '',
                        moneda: 'BS',
                        monto: ''
                      })
                      setModalEventoOpen(true)
                    }}
                    style={{
                      backgroundColor: 'var(--color-accent, #f97316)',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    + Agregar a este Día
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {eventosDelDia.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: '#71717a',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '14px',
                      border: '1px dashed rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>📅</div>
                      <div>No hay registros ni recaudaciones para este día.</div>
                      <div style={{ fontSize: '11px', marginTop: '4px' }}>Presiona "+ Agregar a este Día" para anotar ingresos o eventos.</div>
                    </div>
                  ) : (
                    eventosDelDia.map(ev => {
                      return (
                        <div
                          key={ev.id}
                          style={{
                            padding: '14px',
                            borderRadius: '14px',
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>
                              {ev.tipo === 'llenado' ? '⛽' : '💰'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '13px' }}>{ev.titulo}</div>
                              {ev.descripcion && (
                                <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '2px' }}>
                                  {ev.descripcion}
                                </div>
                              )}
                              {((ev.montoBs || 0) > 0 || (ev.montoUsd || 0) > 0) && (
                                <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '12px', marginTop: '4px' }}>
                                  {ev.moneda === 'BS' || (ev.montoBs || 0) > 0
                                    ? `+Bs. ${(ev.montoBs || 0).toLocaleString('es-VE')} ($${(ev.montoUsd || 0).toFixed(2)} USD)`
                                    : `+$${(ev.montoUsd || 0).toFixed(2)} USD`}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleEliminarEvento(ev.id)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '4px',
                              fontSize: '14px'
                            }}
                            title="Eliminar registro"
                          >
                            🗑️
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: MOROSOS Y SOLVENTES (62 APARTAMENTOS) ──────────────── */}
      {activeTab === 'morosos' && (
        <div style={{
          background: 'var(--color-bg-card, #12141a)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px'
        }}>
          {/* Barra de Filtros */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setFiltroEstado('todos')}
                style={{
                  backgroundColor: filtroEstado === 'todos' ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Todos ({apartamentosList.length})
              </button>
              <button
                onClick={() => setFiltroEstado('morosos')}
                style={{
                  backgroundColor: filtroEstado === 'morosos' ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                  color: filtroEstado === 'morosos' ? '#fff' : '#ef4444',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🔴 Deudores ({metricas?.aptosMorosos || 0})
              </button>
              <button
                onClick={() => setFiltroEstado('solventes')}
                style={{
                  backgroundColor: filtroEstado === 'solventes' ? '#22c55e' : 'rgba(34, 197, 94, 0.15)',
                  color: filtroEstado === 'solventes' ? '#fff' : '#22c55e',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🟢 Solventes ({metricas?.aptosSolventes || 0})
              </button>
            </div>

            <div style={{ position: 'relative', minWidth: '220px' }}>
              <input
                type="text"
                value={busquedaApto}
                onChange={e => setBusquedaApto(e.target.value)}
                placeholder="Buscar apto o propietario..."
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              {busquedaApto && (
                <button
                  onClick={() => setBusquedaApto('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#a1a1aa',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tabla de Apartamentos */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#a1a1aa', textAlign: 'left' }}>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>APTO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>PROPIETARIO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>ESTADO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>DEUDA / CUOTA</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>PAGO / REFERENCIA</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800, textAlign: 'right' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {apartamentosFiltrados.map(apto => {
                  const isPagado = apto.estado === 'pagado'
                  return (
                    <tr
                      key={apto.apartamentoId || apto.apartamentoNumero}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        backgroundColor: isPagado ? 'transparent' : 'rgba(239, 68, 68, 0.02)'
                      }}
                    >
                      <td style={{ padding: '12px 10px', fontWeight: 800 }}>
                        <span style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          display: 'inline-block'
                        }}>
                          {apto.apartamentoNumero}
                        </span>
                      </td>

                      <td style={{ padding: '12px 10px', color: '#d4d4d8' }}>
                        {apto.propietario || 'Sin asignar'}
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          backgroundColor: isPagado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isPagado ? '#22c55e' : '#ef4444',
                          border: `1px solid ${isPagado ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 800
                        }}>
                          {isPagado ? '● SOLVENTE' : '▲ DEUDA GAS'}
                        </span>
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 800, color: isPagado ? '#fff' : '#ef4444' }}>
                          Bs. {(apto.montoBs || (apto.montoUsd * (data?.config.tasaBcv || 859.06))).toLocaleString('es-VE')}
                        </div>
                        <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                          ≈ ${(apto.montoUsd || 5).toFixed(2)} USD
                        </div>
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        {isPagado ? (
                          <div>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>
                              {apto.metodoPago === 'pago_movil' ? 'Pago Móvil' : apto.metodoPago === 'efectivo_bs' ? 'Efectivo Bs.' : apto.metodoPago || 'Cancelado'}
                            </span>
                            {apto.referencia && (
                              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                                Ref: {apto.referencia}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#71717a', fontSize: '12px' }}>Pendiente por cobrar</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {isPagado ? (
                            <button
                              onClick={() => handleRevertirPago(apto)}
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                color: '#a1a1aa',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              Revertir
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => abrirModalPago(apto)}
                                style={{
                                  backgroundColor: 'var(--color-accent, #f97316)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Conciliar Pago
                              </button>
                              <button
                                onClick={() => handleCobroWhatsapp(apto)}
                                style={{
                                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                                  color: '#22c55e',
                                  border: '1px solid rgba(34, 197, 94, 0.25)',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                title="Enviar recordatorio por WhatsApp"
                              >
                                💬
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: HISTORIAL DE LLENADOS ─────────────────────────────── */}
      {activeTab === 'llenados' && (
        <div style={{
          background: 'var(--color-bg-card, #12141a)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Historial de Descargas de Gas</h3>
              <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: '12px' }}>
                Registro cronológico de recargas del tanque comunal.
              </p>
            </div>
            <button
              onClick={() => setModalLlenadoOpen(true)}
              style={{
                backgroundColor: 'var(--color-accent, #f97316)',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              + Nuevo Llenado
            </button>
          </div>

          {data?.llenados.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#71717a',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '14px',
              border: '1px dashed rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🚛</div>
              <div style={{ fontWeight: 700, color: '#d4d4d8' }}>No hay llenados registrados todavía</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                Presiona "+ Nuevo Llenado" cuando una cisterna descargue gas en el edificio.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data?.llenados.map(ll => {
                return (
                  <div
                    key={ll.id}
                    style={{
                      padding: '18px',
                      borderRadius: '14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px'
                      }}>
                        ⛽
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px' }}>
                            {ll.litrosCargados.toLocaleString()} Litros
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                            padding: '2px 8px',
                            borderRadius: '999px'
                          }}>
                            {ll.estado.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                          Fecha: <b>{ll.fecha}</b> · Proveedor: <b>{ll.proveedor || 'Sin especificar'}</b>
                        </div>
                        {ll.responsableRecibio && (
                          <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                            Recibido por: {ll.responsableRecibio} {ll.numeroFacturaGuia ? `· Guía: ${ll.numeroFacturaGuia}` : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, fontSize: '16px', color: '#22c55e' }}>
                          {ll.costoTotalBs > 0 ? `Bs. ${ll.costoTotalBs.toLocaleString('es-VE')}` : `$${ll.costoTotalUsd.toFixed(2)} USD`}
                        </div>
                        {ll.costoTotalBs > 0 && ll.costoTotalUsd > 0 && (
                          <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                            ≈ ${ll.costoTotalUsd.toFixed(2)} USD
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleEliminarLlenado(ll.id)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '6px',
                          fontSize: '14px'
                        }}
                        title="Eliminar llenado"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: AJUSTAR NIVEL DE TANQUE ────────────────────────────── */}
      {modalNivelTanqueOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--color-bg-card, #161820)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
              ⛽ Ajustar Nivel del Tanque
            </h3>

            <div style={{ textAlign: 'center', margin: '20px 0' }}>
              <div style={{ fontSize: '48px', fontWeight: 900, color: nuevoNivelTanque <= 25 ? '#ef4444' : '#22c55e' }}>
                {nuevoNivelTanque}%
              </div>
              <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
                Aproximadamente {Math.round(((data?.config.capacidadLitros || 2500) * nuevoNivelTanque) / 100).toLocaleString()} Litros
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={nuevoNivelTanque}
              onChange={e => setNuevoNivelTanque(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-accent, #f97316)', height: '6px' }}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setModalNivelTanqueOpen(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarNivelTanque}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                Guardar Nivel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR LLENADO ──────────────────────────────────── */}
      {modalLlenadoOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--color-bg-card, #161820)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
              🚛 Registrar Descarga de Cisterna
            </h3>

            <form onSubmit={handleGuardarLlenado} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>FECHA</label>
                  <input
                    type="date"
                    value={formLlenado.fecha}
                    onChange={e => setFormLlenado(prev => ({ ...prev, fecha: e.target.value }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>LITROS CARGADOS</label>
                  <input
                    type="number"
                    value={formLlenado.litrosCargados}
                    onChange={e => setFormLlenado(prev => ({ ...prev, litrosCargados: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONEDA DEL COSTO</label>
                  <select
                    value={formLlenado.monedaCosto}
                    onChange={e => setFormLlenado(prev => ({ ...prev, monedaCosto: e.target.value as any }))}
                    style={{
                      width: '100%',
                      backgroundColor: '#1b1d24',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>COSTO TOTAL</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formLlenado.costoMonto}
                    onChange={e => setFormLlenado(prev => ({ ...prev, costoMonto: e.target.value }))}
                    placeholder={formLlenado.monedaCosto === 'BS' ? 'Monto en Bs.' : 'Monto en $'}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>NIVEL FINAL TANQUE (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formLlenado.porcentajeFinal}
                    onChange={e => setFormLlenado(prev => ({ ...prev, porcentajeFinal: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>PROVEEDOR</label>
                  <input
                    type="text"
                    value={formLlenado.proveedor}
                    onChange={e => setFormLlenado(prev => ({ ...prev, proveedor: e.target.value }))}
                    placeholder="Ej: Gas Comunal / PDVSA"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>RESPONSABLE RECEPTOR</label>
                  <input
                    type="text"
                    value={formLlenado.responsableRecibio}
                    onChange={e => setFormLlenado(prev => ({ ...prev, responsableRecibio: e.target.value }))}
                    placeholder="Nombre o conserjería"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>N° GUÍA / FACTURA</label>
                  <input
                    type="text"
                    value={formLlenado.numeroFacturaGuia}
                    onChange={e => setFormLlenado(prev => ({ ...prev, numeroFacturaGuia: e.target.value }))}
                    placeholder="Opcional"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalLlenadoOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 800
                  }}
                >
                  Guardar Llenado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONCILIAR PAGO APTO (EN BS O USD) ─────────────────── */}
      {modalPagoOpen && aptoParaPagar && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--color-bg-card, #161820)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>
              💰 Conciliar Pago de Gas
            </h3>
            <div style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800, fontSize: '14px', marginBottom: '16px' }}>
              Apartamento {aptoParaPagar.apartamentoNumero} · {aptoParaPagar.propietario || 'Propietario'}
            </div>

            <form onSubmit={handleConfirmarPago} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONEDA RECIBIDA</label>
                  <select
                    value={formPago.moneda}
                    onChange={e => {
                      const newMoneda = e.target.value as 'BS' | 'USD'
                      setFormPago(prev => ({
                        ...prev,
                        moneda: newMoneda,
                        monto: newMoneda === 'BS'
                          ? String(aptoParaPagar.montoBs || data?.config.costoPorAptoDefectoBs || '')
                          : String(aptoParaPagar.montoUsd || data?.config.costoPorAptoDefectoUsd || '')
                      }))
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#1b1d24',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONTO RECIBIDO</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPago.monto}
                    onChange={e => setFormPago(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder="Monto"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MÉTODO DE PAGO</label>
                <select
                  value={formPago.metodoPago}
                  onChange={e => setFormPago(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1d24',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                >
                  <option value="pago_movil">Pago Móvil</option>
                  <option value="transferencia">Transferencia Bancaria</option>
                  <option value="efectivo_bs">Efectivo Bolívares</option>
                  <option value="efectivo_usd">Efectivo Dólares ($)</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>NÚMERO DE REFERENCIA</label>
                <input
                  type="text"
                  value={formPago.referencia}
                  onChange={e => setFormPago(prev => ({ ...prev, referencia: e.target.value }))}
                  placeholder="Referencia o recibo..."
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>FECHA DE PAGO</label>
                <input
                  type="date"
                  value={formPago.fechaPago}
                  onChange={e => setFormPago(prev => ({ ...prev, fechaPago: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalPagoOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 800
                  }}
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR RECAUDACIÓN DIARIA (BS O USD) ───────────── */}
      {modalEventoOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--color-bg-card, #161820)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
              💰 Registrar Recaudación por Día
            </h3>

            <form onSubmit={handleGuardarEvento} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>FECHA</label>
                <input
                  type="date"
                  value={formEvento.fecha}
                  onChange={e => setFormEvento(prev => ({ ...prev, fecha: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TIPO DE REGISTRO</label>
                <select
                  value={formEvento.tipo}
                  onChange={e => setFormEvento(prev => ({ ...prev, tipo: e.target.value as any }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#1b1d24',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                >
                  <option value="recaudacion">💰 Recaudación de Dinero</option>
                  <option value="cierre_cobro">⏳ Fecha Límite / Aviso de Cobro</option>
                  <option value="mantenimiento">🔧 Mantenimiento de Tanque</option>
                  <option value="otro">📌 Otro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TÍTULO</label>
                <input
                  type="text"
                  value={formEvento.titulo}
                  onChange={e => setFormEvento(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Recaudación lote efectivo / Pago Móvil"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONEDA</label>
                  <select
                    value={formEvento.moneda}
                    onChange={e => setFormEvento(prev => ({ ...prev, moneda: e.target.value as any }))}
                    style={{
                      width: '100%',
                      backgroundColor: '#1b1d24',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONTO</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formEvento.monto}
                    onChange={e => setFormEvento(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder={formEvento.moneda === 'BS' ? 'Monto en Bs.' : 'Monto en $'}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>DESCRIPCIÓN / DETALLES</label>
                <input
                  type="text"
                  value={formEvento.descripcion}
                  onChange={e => setFormEvento(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Detalles del recaudo..."
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#fff',
                    marginTop: '4px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalEventoOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 800
                  }}
                >
                  Guardar Recaudo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURACIÓN CUOTA (BS/USD) & DATOS BANCARIOS ─────── */}
      {modalConfigOpen && formConfig && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--color-bg-card, #161820)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
              ⚙️ Configuración del Recaudo y Tanque
            </h3>

            <form onSubmit={handleGuardarConfig} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONEDA PRINCIPAL</label>
                  <select
                    value={formConfig.monedaCuota}
                    onChange={e => {
                      const m = e.target.value as 'BS' | 'USD'
                      setFormConfig(prev => prev ? ({ ...prev, monedaCuota: m }) : null)
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#1b1d24',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>
                    CUOTA POR APTO ({formConfig.monedaCuota === 'BS' ? 'Bs.' : '$'})
                  </label>
                  {formConfig.monedaCuota === 'BS' ? (
                    <input
                      type="number"
                      step="0.01"
                      value={formConfig.costoPorAptoDefectoBs}
                      onChange={e => {
                        const val = Number(e.target.value) || 0
                        const tasa = formConfig.tasaBcv || 859.06
                        setFormConfig(prev => prev ? ({
                          ...prev,
                          costoPorAptoDefectoBs: val,
                          costoPorAptoDefectoUsd: tasa > 0 ? Number((val / tasa).toFixed(2)) : 0
                        }) : null)
                      }}
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        color: '#fff',
                        marginTop: '4px'
                      }}
                      required
                    />
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      value={formConfig.costoPorAptoDefectoUsd}
                      onChange={e => {
                        const val = Number(e.target.value) || 0
                        const tasa = formConfig.tasaBcv || 859.06
                        setFormConfig(prev => prev ? ({
                          ...prev,
                          costoPorAptoDefectoUsd: val,
                          costoPorAptoDefectoBs: Number((val * tasa).toFixed(2))
                        }) : null)
                      }}
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        color: '#fff',
                        marginTop: '4px'
                      }}
                      required
                    />
                  )}
                </div>
              </div>

              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                Equivalente actual: <b>Bs. {(formConfig.costoPorAptoDefectoBs || 0).toLocaleString('es-VE')}</b> ≈ <b>${(formConfig.costoPorAptoDefectoUsd || 0).toFixed(2)} USD</b> (Tasa BCV: {formConfig.tasaBcv})
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>CAPACIDAD TANQUE (L)</label>
                  <input
                    type="number"
                    value={formConfig.capacidadLitros}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, capacidadLitros: Number(e.target.value) }) : null)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>PROVEEDOR ACTUAL</label>
                  <input
                    type="text"
                    value={formConfig.proveedorActual}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, proveedorActual: e.target.value }) : null)}
                    placeholder="Gas Comunal / PDVSA"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '14px', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)' }}>
                  Datos de Pago que verá el Residente:
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>BANCO</label>
                  <input
                    type="text"
                    value={formConfig.datosPago.banco}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, datosPago: { ...prev.datosPago, banco: e.target.value } }) : null)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>PAGO MÓVIL / TELÉFONO</label>
                  <input
                    type="text"
                    value={formConfig.datosPago.telefono}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, datosPago: { ...prev.datosPago, telefono: e.target.value } }) : null)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>RIF / C.I.</label>
                  <input
                    type="text"
                    value={formConfig.datosPago.rifCedula}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, datosPago: { ...prev.datosPago, rifCedula: e.target.value } }) : null)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TITULAR</label>
                  <input
                    type="text"
                    value={formConfig.datosPago.titular}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, datosPago: { ...prev.datosPago, titular: e.target.value } }) : null)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: '#fff',
                      marginTop: '4px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setModalConfigOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 800
                  }}
                >
                  Guardar Configuración
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ASIGNAR / PUBLICAR CUOTA DE GAS ─────────────────── */}
      {modalPublicarCuotaOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #181920 0%, #101116 100%)',
            border: formCuota.esEspecial
              ? '1px solid rgba(239, 68, 68, 0.45)'
              : '1px solid rgba(59, 130, 246, 0.35)',
            boxShadow: formCuota.esEspecial
              ? '0 20px 60px rgba(239, 68, 68, 0.25)'
              : '0 20px 60px rgba(59, 130, 246, 0.2)',
            borderRadius: '24px',
            padding: '24px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>{formCuota.esEspecial ? '⚡' : '📢'}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                    {formCuota.esEspecial ? 'Publicar Cuota Especial por Gas' : 'Asignar Cuota de Gas'}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                    Aparecerá como deuda comunal a cada residente para conciliar su pago
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalPublicarCuotaOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a1a1aa',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublicarCuota} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Checkbox Cuota Especial */}
              <div style={{
                backgroundColor: formCuota.esEspecial ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                border: formCuota.esEspecial ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '12px 14px',
                transition: 'all 0.2s'
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formCuota.esEspecial}
                    onChange={e => {
                      const checked = e.target.checked
                      setFormCuota(prev => ({
                        ...prev,
                        esEspecial: checked,
                        titulo: checked ? 'Cuota Especial Recarga de Gas' : 'Recarga de Gas Comunal',
                        enviarEmail: checked ? true : prev.enviarEmail
                      }))
                    }}
                    style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#ef4444' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: formCuota.esEspecial ? '#f87171' : '#fff' }}>
                      ⚡ Marcar como Cuota Especial / Extraordinaria
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#a1a1aa', marginTop: '3px', lineHeight: 1.4 }}>
                      Aparecerá en el <b>Dashboard Principal del Residente</b> destacada en color especial con botón directo para reportar pago.
                    </div>
                  </div>
                </label>
              </div>

              {/* Título / Concepto */}
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                  CONCEPTO DE LA CUOTA / MOTIVO
                </label>
                <input
                  type="text"
                  value={formCuota.titulo}
                  onChange={e => setFormCuota(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Recarga de Tanque Central Octubre 2026"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    color: '#fff',
                    marginTop: '4px',
                    fontSize: '13px'
                  }}
                  required
                />
              </div>

              {/* Moneda y Monto */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    MONEDA PRINCIPAL
                  </label>
                  <select
                    value={formCuota.moneda}
                    onChange={e => setFormCuota(prev => ({ ...prev, moneda: e.target.value as 'BS' | 'USD' }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      color: '#fff',
                      marginTop: '4px',
                      fontSize: '13px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    MONTO POR APARTAMENTO ({formCuota.moneda === 'BS' ? 'Bs.' : '$'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formCuota.monto}
                    onChange={e => setFormCuota(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder={formCuota.moneda === 'BS' ? 'Ej: 1500.00' : 'Ej: 3.50'}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      color: '#fff',
                      marginTop: '4px',
                      fontSize: '13px',
                      fontWeight: 700
                    }}
                    required
                  />
                </div>
              </div>

              {/* Cálculo en vivo con tasa BCV */}
              {formCuota.monto && Number(formCuota.monto) > 0 && (() => {
                const tasa = data?.config.tasaBcv || 859.06
                const m = Number(formCuota.monto)
                const isBs = formCuota.moneda === 'BS'
                const montoBs = isBs ? m : Number((m * tasa).toFixed(2))
                const montoUsd = isBs ? Number((m / tasa).toFixed(2)) : m
                return (
                  <div style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px dashed rgba(255, 255, 255, 0.15)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ color: '#a1a1aa' }}>Equivalencia a Tasa BCV ({tasa.toFixed(2)}):</span>
                    <span style={{ fontWeight: 800, color: '#38bdf8' }}>
                      Bs. {montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ≈ ${montoUsd.toFixed(2)} USD
                    </span>
                  </div>
                )
              })()}

              {/* Fecha Límite */}
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                  FECHA LÍMITE DE PAGO (OPCIONAL)
                </label>
                <input
                  type="date"
                  value={formCuota.fechaLimite}
                  onChange={e => setFormCuota(prev => ({ ...prev, fechaLimite: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    color: '#fff',
                    marginTop: '4px',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Checkbox Enviar Correo */}
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '12px'
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formCuota.enviarEmail}
                    onChange={e => setFormCuota(prev => ({ ...prev, enviarEmail: e.target.checked }))}
                    style={{ marginTop: '2px', width: '16px', height: '16px', accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#93c5fd' }}>
                      📧 Enviar correo electrónico con todos los datos a los residentes
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.3 }}>
                      Se despachará un email automático con el desglose en Bolívares y Dólares, cuenta bancaria (banco, pago móvil, RIF y titular) y datos para reportar su pago.
                    </div>
                  </div>
                </label>
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalPublicarCuotaOpen(false)}
                  disabled={guardandoCuota}
                  style={{
                    flex: 1,
                    padding: '11px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCuota}
                  style={{
                    flex: 2,
                    padding: '11px',
                    backgroundColor: formCuota.esEspecial ? '#ef4444' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: guardandoCuota ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    fontSize: '13px',
                    boxShadow: formCuota.esEspecial ? '0 4px 14px rgba(239, 68, 68, 0.4)' : '0 4px 14px rgba(59, 130, 246, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoCuota ? (
                    <>
                      <span>⏳</span>
                      <span>Asignando y Notificando...</span>
                    </>
                  ) : (
                    <>
                      <span>{formCuota.esEspecial ? '⚡' : '📢'}</span>
                      <span>Publicar Cuota {formCuota.esEspecial ? 'Especial' : 'de Gas'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 1: GESTIÓN DE CELDA EN MATRIZ DE DEUDAS DE GAS ── */}
      {modalCeldaDeudaOpen && celdaApto && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✏️</span>
                  <span>{celdaTipo === 'anterior' ? 'Deuda Anterior de Gas' : 'Cuota de Gas'}</span>
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Apartamento {celdaApto.numero} · {celdaApto.propietario || 'Sin Propietario asignado'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalCeldaDeudaOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Resumen Periodo */}
              <div style={{
                backgroundColor: '#030712',
                border: '1px solid #1f2937',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Concepto
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: celdaTipo === 'anterior' ? '#fb923c' : '#60a5fa', marginTop: '2px' }}>
                    {celdaTipo === 'anterior' ? '📋 Saldo Deudor Histórico (Anterior)' : `📅 Cuota ${celdaMesLabel} ${calAnio}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                    Estado
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: celdaEstado === 'pagado' ? '#34d399' : '#f87171', marginTop: '2px' }}>
                    {celdaEstado === 'pagado' ? '🟢 Pagado / Solvente' : '🔴 Pendiente por Cobrar'}
                  </div>
                </div>
              </div>

              {/* Monto y Moneda */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Monto de la Deuda / Cuota:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={celdaMonto}
                    onChange={e => setCeldaMonto(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 800,
                      outline: 'none'
                    }}
                  />
                  <select
                    value={celdaMoneda}
                    onChange={e => setCeldaMoneda(e.target.value as 'BS' | 'USD')}
                    style={{
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="BS">Bolívares (Bs)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
              </div>

              {/* Selector de Estado */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Estado de la Obligación:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setCeldaEstado('pendiente')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: celdaEstado === 'pendiente' ? '2px solid #ef4444' : '1px solid #374151',
                      backgroundColor: celdaEstado === 'pendiente' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: celdaEstado === 'pendiente' ? '#fca5a5' : '#94a3b8',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🔴</span>
                    <span>Deuda Pendiente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCeldaEstado('pagado')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: celdaEstado === 'pagado' ? '2px solid #10b981' : '1px solid #374151',
                      backgroundColor: celdaEstado === 'pagado' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: celdaEstado === 'pagado' ? '#6ee7b7' : '#94a3b8',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🟢</span>
                    <span>Pagado / Solvente</span>
                  </button>
                </div>
              </div>

              {/* Si está pagado, datos adicionales */}
              {celdaEstado === 'pagado' && (
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                    Detalle del Pago Realizado
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                        Método
                      </label>
                      <select
                        value={celdaMetodo}
                        onChange={e => setCeldaMetodo(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#030712',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      >
                        <option value="pago_movil">Pago Móvil</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo_bs">Efectivo Bs</option>
                        <option value="efectivo_usd">Efectivo $</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                        Referencia
                      </label>
                      <input
                        type="text"
                        value={celdaReferencia}
                        onChange={e => setCeldaReferencia(e.target.value)}
                        placeholder="N° referencia o recibo"
                        style={{
                          width: '100%',
                          backgroundColor: '#030712',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          padding: '8px 10px',
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
                      value={celdaFechaPago}
                      onChange={e => setCeldaFechaPago(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        color: '#fff',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Nota / Observaciones */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Nota u Observación:
                </label>
                <input
                  type="text"
                  value={celdaNota}
                  onChange={e => setCeldaNota(e.target.value)}
                  placeholder="Nota descriptiva..."
                  style={{
                    width: '100%',
                    backgroundColor: '#030712',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Footer con botón Eliminar a la izquierda y Guardar a la derecha */}
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#030712',
              borderTop: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={handleEliminarDeudaDesdeCelda}
                disabled={guardandoCelda}
                style={{
                  padding: '9px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: guardandoCelda ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🗑️</span>
                <span>Eliminar Deuda</span>
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalCeldaDeudaOpen(false)}
                  disabled={guardandoCelda}
                  style={{
                    padding: '9px 16px',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarCeldaDeuda}
                  disabled={guardandoCelda}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: guardandoCelda ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.35)'
                  }}
                >
                  {guardandoCelda ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: COLOCAR DEUDA ANTERIOR DE GAS ── */}
      {modalDeudaAnteriorOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '480px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span>
                  <span>Colocar Deuda Anterior de Gas</span>
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Asigna un saldo deudor histórico previo a las jornadas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDeudaAnteriorOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarDeudaAnteriorModal} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Checkbox aplicar a todos */}
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  backgroundColor: formDeudaAnterior.aplicarATodos ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: formDeudaAnterior.aplicarATodos ? '1px solid #ea580c' : '1px solid #374151',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formDeudaAnterior.aplicarATodos}
                    onChange={e => setFormDeudaAnterior(prev => ({ ...prev, aplicarATodos: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#ea580c', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                      Aplicar monto a TODOS los apartamentos ({apartamentosDb.length})
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      Asigna la misma deuda anterior general a cada inmueble registrado
                    </div>
                  </div>
                </label>

                {/* Si no es a todos, selector de apartamento */}
                {!formDeudaAnterior.aplicarATodos && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                      Seleccionar Apartamento:
                    </label>
                    <select
                      value={formDeudaAnterior.apartamentoNumero}
                      onChange={e => {
                        const selNum = e.target.value
                        const aptoObj = apartamentosDb.find(a => a.numero === selNum)
                        setFormDeudaAnterior(prev => ({
                          ...prev,
                          apartamentoNumero: selNum,
                          apartamentoId: aptoObj?.id || selNum
                        }))
                      }}
                      required
                      style={{
                        width: '100%',
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 600
                      }}
                    >
                      <option value="">-- Elige un apartamento --</option>
                      {apartamentosDb.map(a => (
                        <option key={a.id || a.numero} value={a.numero}>
                          Apto {a.numero} {a.propietario_nombre ? `· ${a.propietario_nombre}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Monto y Moneda */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    Monto de Deuda Anterior:
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={formDeudaAnterior.monto}
                      onChange={e => setFormDeudaAnterior(prev => ({ ...prev, monto: e.target.value }))}
                      placeholder="Ej: 150.00"
                      style={{
                        flex: 1,
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: '#fff',
                        fontSize: '18px',
                        fontWeight: 800,
                        outline: 'none'
                      }}
                    />
                    <select
                      value={formDeudaAnterior.moneda}
                      onChange={e => setFormDeudaAnterior(prev => ({ ...prev, moneda: e.target.value as 'BS' | 'USD' }))}
                      style={{
                        backgroundColor: '#030712',
                        border: '1px solid #374151',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="BS">Bolívares (Bs)</option>
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </div>
                </div>

                {/* Nota o Concepto */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    Concepto o Motivo:
                  </label>
                  <input
                    type="text"
                    value={formDeudaAnterior.nota}
                    onChange={e => setFormDeudaAnterior(prev => ({ ...prev, nota: e.target.value }))}
                    placeholder="Ej: Saldo pendiente de gas año anterior"
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
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
                  onClick={() => setModalDeudaAnteriorOpen(false)}
                  disabled={guardandoDeudaAnterior}
                  style={{
                    padding: '9px 16px',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoDeudaAnterior}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: '#ea580c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: guardandoDeudaAnterior ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.4)'
                  }}
                >
                  {guardandoDeudaAnterior ? 'Guardando...' : 'Asignar Deuda Anterior'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: ELIMINAR DEUDA DE GAS ── */}
      {modalEliminarDeudaOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '480px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
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
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🗑️</span>
                  <span>Eliminar Deuda de Gas</span>
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Elimina o perdona saldos adeudados para dejar al apartamento solvente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalEliminarDeudaOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEliminarDeudaModal} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Selector de Apartamento */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    Apartamento con deuda a eliminar:
                  </label>
                  <select
                    value={formEliminarDeuda.apartamentoNumero}
                    onChange={e => {
                      const selNum = e.target.value
                      const aptoObj = apartamentosDb.find(a => a.numero === selNum)
                      setFormEliminarDeuda(prev => ({
                        ...prev,
                        apartamentoNumero: selNum,
                        apartamentoId: aptoObj?.id || selNum
                      }))
                    }}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#030712',
                      border: '1px solid #374151',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600
                    }}
                  >
                    <option value="">-- Elige un apartamento --</option>
                    {apartamentosDb.map(a => (
                      <option key={a.id || a.numero} value={a.numero}>
                        Apto {a.numero} {a.propietario_nombre ? `· ${a.propietario_nombre}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Opciones de alcance */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                    ¿Qué deuda deseas eliminar?
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      backgroundColor: formEliminarDeuda.tipoEliminacion === 'anterior' ? 'rgba(234, 88, 12, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: formEliminarDeuda.tipoEliminacion === 'anterior' ? '1px solid #ea580c' : '1px solid #374151',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="tipoEliminacion"
                        value="anterior"
                        checked={formEliminarDeuda.tipoEliminacion === 'anterior'}
                        onChange={() => setFormEliminarDeuda(prev => ({ ...prev, tipoEliminacion: 'anterior' }))}
                        style={{ accentColor: '#ea580c' }}
                      />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                          Solo Deuda Anterior Histórica
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Elimina el saldo acumulado previo a este año
                        </div>
                      </div>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      backgroundColor: formEliminarDeuda.tipoEliminacion === 'mes' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: formEliminarDeuda.tipoEliminacion === 'mes' ? '1px solid #3b82f6' : '1px solid #374151',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="tipoEliminacion"
                        value="mes"
                        checked={formEliminarDeuda.tipoEliminacion === 'mes'}
                        onChange={() => setFormEliminarDeuda(prev => ({ ...prev, tipoEliminacion: 'mes' }))}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                          Deuda de un Mes Específico
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Borra la obligación de gas del mes seleccionado
                        </div>
                      </div>
                    </label>

                    {formEliminarDeuda.tipoEliminacion === 'mes' && (
                      <div style={{ paddingLeft: '28px', marginTop: '-4px' }}>
                        <select
                          value={formEliminarDeuda.mesKey}
                          onChange={e => setFormEliminarDeuda(prev => ({ ...prev, mesKey: e.target.value }))}
                          style={{
                            width: '100%',
                            backgroundColor: '#030712',
                            border: '1px solid #3b82f6',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          {MESES_CONFIG.map(m => (
                            <option key={m.mesKey} value={m.mesKey}>
                              {m.label} ({m.mesKey})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      backgroundColor: formEliminarDeuda.tipoEliminacion === 'todas' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: formEliminarDeuda.tipoEliminacion === 'todas' ? '1px solid #ef4444' : '1px solid #374151',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="tipoEliminacion"
                        value="todas"
                        checked={formEliminarDeuda.tipoEliminacion === 'todas'}
                        onChange={() => setFormEliminarDeuda(prev => ({ ...prev, tipoEliminacion: 'todas' }))}
                        style={{ accentColor: '#ef4444' }}
                      />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#fca5a5' }}>
                          TODAS las Deudas de Gas (Anterior + Todos los Meses)
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Limpia por completo cualquier deuda y lo deja solvente
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#fca5a5',
                  lineHeight: 1.4
                }}>
                  ⚠️ <strong>Atención:</strong> Al confirmar, el saldo pasará a 0 y no figurará como pendiente de cobro en el calendario ni en el estado de cuenta del residente.
                </div>
              </div>

              {/* Footer */}
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
                  onClick={() => setModalEliminarDeudaOpen(false)}
                  disabled={eliminandoDeuda}
                  style={{
                    padding: '9px 16px',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={eliminandoDeuda || !formEliminarDeuda.apartamentoNumero}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: eliminandoDeuda || !formEliminarDeuda.apartamentoNumero ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
                  }}
                >
                  {eliminandoDeuda ? 'Eliminando...' : 'Confirmar Eliminación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default AdminGas
