import React, { useState, useEffect, useMemo } from 'react'
import {
  obtenerGasServicioData,
  actualizarConfigTanque,
  registrarLlenado,
  eliminarLlenado,
  togglePagoApartamento,
  guardarEventoCalendario,
  eliminarEventoCalendario,
  calcularMetricasGas,
  GasServicioData,
  LlenadoGas,
  EventoDiarioGas,
  DetallePagoAptoGas,
  TanqueGasConfig
} from '../../../data/gasService'

export const AdminGas: React.FC = () => {
  const [data, setData] = useState<GasServicioData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendario' | 'morosos' | 'llenados'>('dashboard')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Filtros de apartamentos
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'morosos' | 'solventes'>('todos')
  const [busquedaApto, setBusquedaApto] = useState<string>('')

  // Estado del Calendario
  const [calAnio, setCalAnio] = useState<number>(2026)
  const [calMes, setCalMes] = useState<number>(10) // 1-12 (Octubre)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>('2026-10-06')

  // Modales
  const [modalNivelTanqueOpen, setModalNivelTanqueOpen] = useState(false)
  const [nuevoNivelTanque, setNuevoNivelTanque] = useState<number>(68)

  const [modalLlenadoOpen, setModalLlenadoOpen] = useState(false)
  const [formLlenado, setFormLlenado] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    porcentajeInicial: 20,
    porcentajeFinal: 95,
    litrosCargados: 2000,
    costoTotalUsd: 290,
    proveedor: 'Gas Comunal / PDVSA Cisterna',
    numeroFacturaGuia: '',
    responsableRecibio: 'Dohuglas Guevara / Administración',
    estado: 'completado' as 'completado' | 'programado',
    observaciones: ''
  })

  const [modalEventoOpen, setModalEventoOpen] = useState(false)
  const [formEvento, setFormEvento] = useState({
    fecha: '2026-10-06',
    tipo: 'recaudacion' as 'recaudacion' | 'llenado' | 'cierre_cobro' | 'mantenimiento' | 'otro',
    titulo: '',
    descripcion: '',
    montoUsd: ''
  })

  const [modalPagoOpen, setModalPagoOpen] = useState(false)
  const [aptoParaPagar, setAptoParaPagar] = useState<DetallePagoAptoGas | null>(null)
  const [formPago, setFormPago] = useState({
    fechaPago: new Date().toISOString().slice(0, 10),
    metodoPago: 'pago_movil' as 'pago_movil' | 'transferencia' | 'efectivo_usd' | 'efectivo_bs' | 'otro',
    referencia: '',
    observaciones: ''
  })

  const [modalConfigOpen, setModalConfigOpen] = useState(false)
  const [formConfig, setFormConfig] = useState<TanqueGasConfig | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Cargar datos
  const cargarDatos = async () => {
    setLoading(true)
    try {
      const res = await obtenerGasServicioData()
      setData(res.data)
      setNuevoNivelTanque(res.data.config.nivelActualPorcentaje)
      setFormConfig(res.data.config)
    } catch (err: any) {
      console.error('Error cargando gas:', err)
      showToast('Error cargando datos de gas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  // Métricas
  const metricas = useMemo(() => {
    if (!data) return null
    return calcularMetricasGas(data)
  }, [data])

  // Lista de apartamentos ordenada
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

  // Apartamentos filtrados
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

  // Eventos para el día seleccionado
  const eventosDelDia = useMemo(() => {
    if (!data || !diaSeleccionado) return []
    return data.eventosCalendario.filter(e => e.fecha === diaSeleccionado)
  }, [data, diaSeleccionado])

  // Generador de días del mes en calendario
  const diasCalendario = useMemo(() => {
    const totalDias = new Date(calAnio, calMes, 0).getDate()
    const primerDiaSemana = new Date(calAnio, calMes - 1, 1).getDay() // 0 = Domingo
    // Ajustar a Lunes = 0, Domingo = 6
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

  // Mapa de eventos por fecha para el calendario
  const eventosPorFecha = useMemo(() => {
    const map = new Map<string, EventoDiarioGas[]>()
    if (!data) return map
    data.eventosCalendario.forEach(ev => {
      const arr = map.get(ev.fecha) || []
      arr.push(ev)
      map.set(ev.fecha, arr)
    })
    return map
  }, [data])

  // Guardar nivel de tanque
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

  // Guardar nuevo llenado
  const handleGuardarLlenado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data) return
    const tasa = data.config.tasaBcv
    const payload: Omit<LlenadoGas, 'id'> = {
      ...formLlenado,
      costoTotalBs: Number((formLlenado.costoTotalUsd * tasa).toFixed(2)),
      tasaBcv: tasa
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

  // Eliminar llenado
  const handleEliminarLlenado = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro de llenado?')) return
    const res = await eliminarLlenado(id)
    if (res.success && res.data) {
      setData(res.data)
      showToast('Registro de llenado eliminado')
    }
  }

  // Guardar evento de calendario
  const handleGuardarEvento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formEvento.titulo.trim()) {
      showToast('Ingresa un título para el evento')
      return
    }
    const monto = Number(formEvento.montoUsd) || 0
    const tasa = data?.config.tasaBcv || 859.06
    const res = await guardarEventoCalendario({
      fecha: formEvento.fecha,
      tipo: formEvento.tipo,
      titulo: formEvento.titulo.trim(),
      descripcion: formEvento.descripcion.trim(),
      montoUsd: monto,
      montoBs: Number((monto * tasa).toFixed(2))
    })
    if (res.success && res.data) {
      setData(res.data)
      setModalEventoOpen(false)
      showToast('Evento registrado en el calendario')
    }
  }

  // Eliminar evento de calendario
  const handleEliminarEvento = async (id: string) => {
    const res = await eliminarEventoCalendario(id)
    if (res.success && res.data) {
      setData(res.data)
      showToast('Evento eliminado del calendario')
    }
  }

  // Abrir modal pago
  const abrirModalPago = (apto: DetallePagoAptoGas) => {
    setAptoParaPagar(apto)
    setFormPago({
      fechaPago: new Date().toISOString().slice(0, 10),
      metodoPago: (apto.metodoPago as any) || 'pago_movil',
      referencia: apto.referencia || '',
      observaciones: apto.observaciones || ''
    })
    setModalPagoOpen(true)
  }

  // Confirmar pago de apartamento
  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || !metricas?.jornadaActiva || !aptoParaPagar) return
    const key = aptoParaPagar.apartamentoId || aptoParaPagar.apartamentoNumero
    const res = await togglePagoApartamento(metricas.jornadaActiva.id, key, {
      estado: 'pagado',
      fechaPago: formPago.fechaPago,
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

  // Revertir pago a pendiente
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
      showToast(`Apto ${apto.apartamentoNumero} marcado como pendiente`)
    }
  }

  // Guardar configuración general
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

  // Enviar mensaje por WhatsApp
  const handleCobroWhatsapp = (apto: DetallePagoAptoGas) => {
    const telefono = ''
    const msg = encodeURIComponent(
      `Hola vecino(a) del Apto ${apto.apartamentoNumero} (${apto.propietario || ''}), le recordamos que la cuota del servicio de gas comunal para el llenado del tanque (${metricas?.jornadaActiva?.titulo || 'Octubre 2026'}) por monto de $${(apto.montoUsd || 5).toFixed(2)} USD (aprox. Bs. ${(apto.montoBs || 0).toLocaleString('es-VE')}) está pendiente por conciliar. Agradecemos reportar su referencia para programar el despacho de la cisterna.`
    )
    window.open(`https://wa.me/${telefono}?text=${msg}`, '_blank')
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#a1a1aa' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⛽</div>
        <p>Cargando información del servicio de gas comunal...</p>
      </div>
    )
  }

  const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

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
              Extra-Recibo Oficial
            </span>
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '6px 0 0' }}>
            Control del tanque, fechas de llenado, jornadas de recaudación y lista de morosos independiente.
          </p>
        </div>

        {/* Acciones Rápidas del Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
            <span>📅</span>
            <span>Recaudación por Día</span>
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
            title="Ajustes de Tanque y Datos Bancarios"
          >
            ⚙️
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
            position: 'relative',
            overflow: 'hidden'
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

            {/* Barra de progreso visual del nivel de gas */}
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
              <span>Autonomía estimada: <b style={{ color: '#fff' }}>~{metricas.diasAutonomia} días</b></span>
              <span style={{ color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                {metricas.nivelEstado.toUpperCase()}
              </span>
            </div>
          </div>

          {/* CARD 2: Recaudación Activa */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                RECAUDACIÓN OCTUBRE
              </span>
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

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '28px', fontWeight: 900, color: '#22c55e' }}>
                ${metricas.totalRecaudadoUsd.toFixed(2)}
              </span>
              <span style={{ fontSize: '13px', color: '#a1a1aa' }}>
                / ${metricas.metaUsd.toFixed(2)} USD
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
                width: `${metricas.porcentajeRecaudado}%`,
                background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)',
                borderRadius: '999px'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a1a1aa' }}>
              <span>Cuota: <b>${(data?.config.costoPorAptoDefectoUsd || 5).toFixed(2)} USD</b></span>
              <span>≈ Bs. {metricas.totalRecaudadoBs.toLocaleString('es-VE')}</span>
            </div>
          </div>

          {/* CARD 3: Solventes vs Morosos de Gas */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                APARTAMENTOS DEUDORES
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
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Al Día</div>
              </div>
              <div style={{ height: '36px', width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              <div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#ef4444' }}>{metricas.aptosMorosos}</div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Morosos Gas</div>
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

          {/* CARD 4: Próximo / Último Llenado */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                CICLO DE RECARGA
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>
                Cisterna
              </span>
            </div>

            <div style={{ fontSize: '13px', marginBottom: '8px' }}>
              <div style={{ color: '#a1a1aa', fontSize: '11px' }}>Último Llenado:</div>
              <div style={{ fontWeight: 700, color: '#fff' }}>
                {metricas.ultimoLlenado?.fecha || '18/09/2026'} · {metricas.ultimoLlenado?.litrosCargados || 2000} L (${metricas.ultimoLlenado?.costoTotalUsd || 280})
              </div>
            </div>

            <div style={{ fontSize: '13px', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
              <div style={{ color: '#a1a1aa', fontSize: '11px' }}>Próximo Estimado:</div>
              <div style={{ fontWeight: 700, color: 'var(--color-accent, #f97316)' }}>
                {metricas.proximoLlenado?.fecha || '22/10/2026'} (Programado)
              </div>
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
          { key: 'dashboard', label: '📊 Resumen y Campaña' },
          { key: 'calendario', label: '📅 Calendario y Recaudación Diaria' },
          { key: 'morosos', label: `👥 Morosos y Solventes (${metricas?.totalAptos || 62})` },
          { key: 'llenados', label: '🚛 Historial de Llenados' }
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
                whiteSpace: 'nowrap',
                transition: 'all 0.18s'
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB 1: RESUMEN Y CAMPAÑA ACTIVA ─────────────────────────── */}
      {activeTab === 'dashboard' && metricas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Card Detalle de Campaña Activa */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {metricas.jornadaActiva?.titulo || 'Jornada de Gas'}
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
              Recaudación de cuota extraordinaria para la reposición del tanque comunal. Esta deuda se administra por fuera del recibo ordinario.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Fecha Límite</span>
                <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px', color: '#f97316' }}>
                  {metricas.jornadaActiva?.fechaLimite || '2026-10-15'}
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Cuota por Apartamento</span>
                <div style={{ fontWeight: 800, fontSize: '14px', marginTop: '2px' }}>
                  ${(data?.config.costoPorAptoDefectoUsd || 5).toFixed(2)} USD
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
                🏦 Datos de Pago Configurados para Residentes:
              </div>
              <div style={{ fontSize: '12px', color: '#ddd', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><b>Banco:</b> {data?.config.datosPago.banco}</div>
                <div><b>Pago Móvil / Teléfono:</b> {data?.config.datosPago.telefono}</div>
                <div><b>C.I. / RIF:</b> {data?.config.datosPago.rifCedula}</div>
                <div><b>Titular:</b> {data?.config.datosPago.titular}</div>
                <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px' }}>
                  *{data?.config.datosPago.nota}
                </div>
              </div>
            </div>
          </div>

          {/* Card Resumen de Cobranza Rápida */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '24px'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800 }}>
              Acciones de Conciliación
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
                    Monto por cobrar: ${(metricas.aptosMorosos * (data?.config.costoPorAptoDefectoUsd || 5)).toFixed(2)} USD
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
                    Total recaudado: ${metricas.totalRecaudadoUsd.toFixed(2)} USD
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
                    Ver Línea de Tiempo en el Calendario
                  </div>
                  <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                    Gestionar ingresos diarios y fechas de llenado
                  </div>
                </div>
                <span style={{ fontSize: '18px' }}>📅</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CALENDARIO INTERACTIVO DE RECAUDACIÓN ─────────────── */}
      {activeTab === 'calendario' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Columna Izquierda: Vista Mes Calendario */}
          <div style={{
            background: 'var(--color-bg-card, #12141a)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            padding: '20px'
          }}>
            {/* Cabecera del Calendario */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800 }}>
                  {MESES_NOMBRES[calMes - 1]} {calAnio}
                </span>
              </div>

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

            {/* Días de la semana */}
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

            {/* Grilla de Días */}
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
                const hasCierre = evs.some(e => e.tipo === 'cierre_cobro')

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

                    {/* Indicadores en el día */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {hasLlenado && (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          backgroundColor: 'rgba(59, 130, 246, 0.25)',
                          color: '#60a5fa',
                          padding: '1px 3px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
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
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          💰 Recaudo
                        </span>
                      )}
                      {hasCierre && (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          backgroundColor: 'rgba(239, 68, 68, 0.25)',
                          color: '#f87171',
                          padding: '1px 3px',
                          borderRadius: '4px'
                        }}>
                          ⏳ Límite
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Columna Derecha: Detalle y Gestión del Día Seleccionado */}
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
                    montoUsd: ''
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

            {/* Lista de eventos del día */}
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
                  <div>No hay recaudaciones ni llenados registrados para este día.</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>Presiona "+ Agregar a este Día" para anotar un ingreso o evento.</div>
                </div>
              ) : (
                eventosDelDia.map(ev => {
                  const isRecaudacion = ev.tipo === 'recaudacion'
                  const isLlenado = ev.tipo === 'llenado'

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
                          {isLlenado ? '⛽' : isRecaudacion ? '💰' : '📌'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px' }}>{ev.titulo}</div>
                          <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '2px' }}>
                            {ev.descripcion}
                          </div>
                          {ev.montoUsd !== undefined && ev.montoUsd > 0 && (
                            <div style={{ color: '#22c55e', fontWeight: 800, fontSize: '12px', marginTop: '4px' }}>
                              +${ev.montoUsd.toFixed(2)} USD (Bs. {ev.montoBs?.toLocaleString('es-VE') || 0})
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
                        title="Eliminar evento"
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

      {/* ── TAB 3: MOROSOS Y SOLVENTES (62 APARTAMENTOS) ──────────────── */}
      {activeTab === 'morosos' && (
        <div style={{
          background: 'var(--color-bg-card, #12141a)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '24px'
        }}>
          {/* Barra de Filtros y Búsqueda */}
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

          {/* Tabla / Grid de Apartamentos */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#a1a1aa', textAlign: 'left' }}>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>APARTAMENTO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>PROPIETARIO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>ESTADO</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>CUOTA ($ / Bs.)</th>
                  <th style={{ padding: '12px 10px', fontWeight: 800 }}>MÉTODO / REFERENCIA</th>
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
                        {apto.propietario || 'Propietario'}
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          backgroundColor: isPagado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isPagado ? '#22c55e' : '#ef4444',
                          border: `1px solid ${isPagado ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span>{isPagado ? '●' : '▲'}</span>
                          <span>{isPagado ? 'SOLVENTE' : 'DEUDA GAS'}</span>
                        </span>
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 700 }}>${(apto.montoUsd || 5).toFixed(2)} USD</div>
                        <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                          ≈ Bs. {(apto.montoBs || 0).toLocaleString('es-VE')}
                        </div>
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        {isPagado ? (
                          <div>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>
                              {apto.metodoPago === 'pago_movil' ? 'Pago Móvil' : apto.metodoPago || 'Transferencia'}
                            </span>
                            {apto.referencia && (
                              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                                Ref: {apto.referencia} {apto.fechaPago ? `(${apto.fechaPago})` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#71717a', fontSize: '12px' }}>Sin registrar</span>
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
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Historial de Descargas y Cisternas</h3>
              <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: '12px' }}>
                Registro cronológico inmutable de llenados de gas del edificio.
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data?.llenados.map(ll => {
              const isCompletado = ll.estado === 'completado'
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
                      backgroundColor: isCompletado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                      color: isCompletado ? '#22c55e' : 'var(--color-accent, #f97316)',
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
                          backgroundColor: isCompletado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                          color: isCompletado ? '#22c55e' : 'var(--color-accent, #f97316)',
                          padding: '2px 8px',
                          borderRadius: '999px'
                        }}>
                          {ll.estado.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
                        Fecha: <b>{ll.fecha}</b> · Proveedor: <b>{ll.proveedor}</b>
                      </div>
                      {ll.observaciones && (
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
                          {ll.observaciones}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '16px', color: '#22c55e' }}>
                        ${ll.costoTotalUsd.toFixed(2)} USD
                      </div>
                      <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                        ≈ Bs. {ll.costoTotalBs.toLocaleString('es-VE')}
                      </div>
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
              🚛 Registrar Llenado de Cisterna
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
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>COSTO TOTAL ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formLlenado.costoTotalUsd}
                    onChange={e => setFormLlenado(prev => ({ ...prev, costoTotalUsd: Number(e.target.value) }))}
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
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>NIVEL FINAL (%)</label>
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
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>PROVEEDOR / CISTERNA</label>
                <input
                  type="text"
                  value={formLlenado.proveedor}
                  onChange={e => setFormLlenado(prev => ({ ...prev, proveedor: e.target.value }))}
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>RESPONSABLE QUE RECIBIÓ</label>
                <input
                  type="text"
                  value={formLlenado.responsableRecibio}
                  onChange={e => setFormLlenado(prev => ({ ...prev, responsableRecibio: e.target.value }))}
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>OBSERVACIONES</label>
                <input
                  type="text"
                  value={formLlenado.observaciones}
                  onChange={e => setFormLlenado(prev => ({ ...prev, observaciones: e.target.value }))}
                  placeholder="N° de guía, precinto o detalles..."
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

      {/* ── MODAL: CONCILIAR PAGO APTO ────────────────────────────────── */}
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
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800 }}>
              💰 Conciliar Pago de Gas
            </h3>
            <div style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800, fontSize: '14px', marginBottom: '16px' }}>
              Apartamento {aptoParaPagar.apartamentoNumero} · {aptoParaPagar.propietario || 'Propietario'}
            </div>

            <form onSubmit={handleConfirmarPago} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  <option value="efectivo_usd">Efectivo Divisas ($)</option>
                  <option value="efectivo_bs">Efectivo Bolívares</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>NÚMERO DE REFERENCIA</label>
                <input
                  type="text"
                  value={formPago.referencia}
                  onChange={e => setFormPago(prev => ({ ...prev, referencia: e.target.value }))}
                  placeholder="Últimos 4 o 6 dígitos..."
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>NOTAS / CONCILIACIÓN</label>
                <input
                  type="text"
                  value={formPago.observaciones}
                  onChange={e => setFormPago(prev => ({ ...prev, observaciones: e.target.value }))}
                  placeholder="Opcional..."
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

      {/* ── MODAL: REGISTRAR EVENTO DIARIO EN EL CALENDARIO ───────────── */}
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
              📅 Registrar Evento en el Calendario
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TIPO</label>
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
                  <option value="llenado">⛽ Llenado de Tanque</option>
                  <option value="cierre_cobro">⏳ Fecha Límite / Aviso</option>
                  <option value="mantenimiento">🔧 Mantenimiento / Prueba</option>
                  <option value="otro">📌 Otro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TÍTULO</label>
                <input
                  type="text"
                  value={formEvento.titulo}
                  onChange={e => setFormEvento(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Cobro en efectivo lote 3"
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>MONTO EN DÓLARES ($ USD) - OPCIONAL</label>
                <input
                  type="number"
                  step="0.01"
                  value={formEvento.montoUsd}
                  onChange={e => setFormEvento(prev => ({ ...prev, montoUsd: e.target.value }))}
                  placeholder="0.00"
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>DESCRIPCIÓN</label>
                <input
                  type="text"
                  value={formEvento.descripcion}
                  onChange={e => setFormEvento(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Detalles sobre lo ocurrido o programado..."
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
                  Guardar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURACIÓN TANQUE & DATOS BANCARIOS ─────────────── */}
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
              ⚙️ Ajustes del Servicio de Gas Comunal
            </h3>

            <form onSubmit={handleGuardarConfig} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>CAPACIDAD TOTAL (LITROS)</label>
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
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>CUOTA POR APTO ($ USD)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formConfig.costoPorAptoDefectoUsd}
                    onChange={e => setFormConfig(prev => prev ? ({ ...prev, costoPorAptoDefectoUsd: Number(e.target.value) }) : null)}
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
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>PROVEEDOR ACTUAL</label>
                <input
                  type="text"
                  value={formConfig.proveedorActual}
                  onChange={e => setFormConfig(prev => prev ? ({ ...prev, proveedorActual: e.target.value }) : null)}
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

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '14px', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)' }}>
                  Datos de Pago que verán los Residentes:
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
                    required
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
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>TITULAR DE LA CUENTA</label>
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
                    required
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
    </div>
  )
}
export default AdminGas
