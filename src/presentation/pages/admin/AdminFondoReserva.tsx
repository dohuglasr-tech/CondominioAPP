import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../application/contexts/AuthContext'
import { useTheme } from '../../../application/contexts/ThemeContext'
import { useBcvRate } from '../../../data/useBcvRate'
import {
  actualizarUbicacionFondoReserva,
  ajustarSaldoFondoReserva,
  calcularTotalesFondoReserva,
  convertirDivisaFondoReserva,
  crearUbicacionFondoReserva,
  definirUbicacionDefaultFondoReserva,
  desactivarUbicacionFondoReserva,
  FondoReservaUbicacion,
  MonedaFondoReserva,
  obtenerFondoReservaAdmin,
  ResumenFondoReserva,
  TipoMovimientoFondo,
  TipoUbicacionFondo,
} from '../../../data/fondoReservaService'
import { getTasaBcvNumerica } from '../../../utils/tasaBcvHelper'

const fmtUsd = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBs = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TIPO_UB_LABELS: Record<TipoUbicacionFondo, { label: string; icon: string }> = {
  banco: { label: 'Cuenta Bancaria', icon: '🏦' },
  efectivo: { label: 'Efectivo / Caja Fuerte', icon: '💵' },
  digital: { label: 'Billetera / Zelle', icon: '💳' },
  otro: { label: 'Otra Ubicación', icon: '🏛️' },
}

const TIPO_MOV_INFO: Record<TipoMovimientoFondo, { label: string; color: string }> = {
  aporte_cuota: { label: 'Aporte Cuota', color: '#22c55e' },
  saldo_inicial: { label: 'Saldo Inicial', color: '#3b82f6' },
  ajuste_manual: { label: 'Ajuste Manual', color: '#a855f7' },
  egreso: { label: 'Egreso / Uso', color: '#ef4444' },
  transferencia_divisa: { label: 'Cambio Divisa', color: '#f59e0b' },
}

export const AdminFondoReserva: React.FC = () => {
  const { perfil, config } = useAuth()
  const { isLight } = useTheme()
  const { rate } = useBcvRate()

  const tasaVigente = getTasaBcvNumerica(rate, config?.tasa_bcv_actual)
  const autorNombre = perfil?.nombre_completo || 'Administrador'

  const [resumen, setResumen] = useState<ResumenFondoReserva>({
    ubicaciones: [],
    movimientos: [],
    totales: calcularTotalesFondoReserva([], tasaVigente),
  })
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Filtros movimientos
  const [filtroMoneda, setFiltroMoneda] = useState<'TODAS' | MonedaFondoReserva>('TODAS')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoMovimientoFondo>('TODOS')

  // Modal Nueva / Editar Ubicación
  const [modalUbOpen, setModalUbOpen] = useState(false)
  const [editUb, setEditUb] = useState<FondoReservaUbicacion | null>(null)
  const [ubNombre, setUbNombre] = useState('')
  const [ubTipo, setUbTipo] = useState<TipoUbicacionFondo>('banco')
  const [ubMoneda, setUbMoneda] = useState<MonedaFondoReserva>('USD')
  const [ubSaldoIni, setUbSaldoIni] = useState('0')
  const [ubDefault, setUbDefault] = useState(false)
  const [ubDesc, setUbDesc] = useState('')

  // Modal Ajuste Directo de Saldo / Egreso
  const [modalAjusteUb, setModalAjusteUb] = useState<FondoReservaUbicacion | null>(null)
  const [ajusteModo, setAjusteModo] = useState<'ajuste_manual' | 'egreso' | 'saldo_inicial'>('ajuste_manual')
  const [ajusteNuevoSaldo, setAjusteNuevoSaldo] = useState('')
  const [ajusteEgresoMonto, setAjusteEgresoMonto] = useState('')
  const [ajusteMotivo, setAjusteMotivo] = useState('')

  // Modal Cambio de Divisa / Traslado
  const [modalDivisaOpen, setModalDivisaOpen] = useState(false)
  const [divOrigenId, setDivOrigenId] = useState('')
  const [divDestinoId, setDivDestinoId] = useState('')
  const [divMontoOrigen, setDivMontoOrigen] = useState('')
  const [divMontoDestino, setDivMontoDestino] = useState('')
  const [divMotivo, setDivMotivo] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4500)
  }

  const cargarDatos = useCallback(
    async (force = false) => {
      setLoading(true)
      try {
        const res = await obtenerFondoReservaAdmin(tasaVigente, force, 120)
        setResumen({
          ...res,
          totales: calcularTotalesFondoReserva(res.ubicaciones, tasaVigente),
        })
      } catch (err: any) {
        showToast(`⚠️ Error cargando Fondo de Reserva: ${err?.message || 'Error inesperado'}`)
      } finally {
        setLoading(false)
      }
    },
    [tasaVigente]
  )

  useEffect(() => {
    cargarDatos(false)
  }, [cargarDatos])

  const ubicacionesActivas = resumen.ubicaciones.filter((u) => u.activa !== false)

  // Handlers CRUD Ubicación
  const abrirCrearUbicacion = () => {
    setEditUb(null)
    setUbNombre('')
    setUbTipo('banco')
    setUbMoneda('USD')
    setUbSaldoIni('0')
    setUbDefault(false)
    setUbDesc('')
    setModalUbOpen(true)
  }

  const abrirEditarUbicacion = (u: FondoReservaUbicacion) => {
    setEditUb(u)
    setUbNombre(u.nombre)
    setUbTipo(u.tipo)
    setUbMoneda(u.moneda)
    setUbSaldoIni(String(u.saldo))
    setUbDefault(u.es_destino_default)
    setUbDesc(u.descripcion || '')
    setModalUbOpen(true)
  }

  const handleGuardarUbicacion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ubNombre.trim()) {
      showToast('⚠️ Ingresa un nombre para la ubicación.')
      return
    }
    setSaving(true)
    try {
      if (editUb) {
        const res = await actualizarUbicacionFondoReserva({
          id: editUb.id,
          nombre: ubNombre,
          tipo: ubTipo,
          descripcion: ubDesc,
        })
        if (!res.success) {
          showToast(`❌ ${res.error}`)
          return
        }
        showToast('✅ Ubicación actualizada correctamente.')
      } else {
        const saldoNum = parseFloat(ubSaldoIni.replace(',', '.')) || 0
        const res = await crearUbicacionFondoReserva({
          nombre: ubNombre,
          tipo: ubTipo,
          moneda: ubMoneda,
          saldoInicial: saldoNum,
          esDestinoDefault: ubDefault,
          descripcion: ubDesc,
          autorNombre,
        })
        if (!res.success) {
          showToast(`❌ ${res.error}`)
          return
        }
        showToast('✅ Ubicación creada correctamente.')
      }
      setModalUbOpen(false)
      await cargarDatos(true)
    } finally {
      setSaving(false)
    }
  }

  const handleDefinirDefault = async (u: FondoReservaUbicacion) => {
    setSaving(true)
    try {
      const res = await definirUbicacionDefaultFondoReserva(u.id)
      if (!res.success) {
        showToast(`❌ ${res.error}`)
        return
      }
      showToast(`⭐ "${u.nombre}" fijada como destino por defecto para aportes en ${u.moneda}.`)
      await cargarDatos(true)
    } finally {
      setSaving(false)
    }
  }

  const handleDesactivarUbicacion = async (u: FondoReservaUbicacion) => {
    if (Number(u.saldo) > 0) {
      showToast('⚠️ Ajusta el saldo a 0 o traslada el monto antes de archivar esta ubicación.')
      return
    }
    if (!window.confirm(`¿Deseas archivar la ubicación "${u.nombre}"? Sus movimientos históricos se conservarán.`)) return
    setSaving(true)
    try {
      const res = await desactivarUbicacionFondoReserva(u.id)
      if (!res.success) {
        showToast(`❌ ${res.error}`)
        return
      }
      showToast('✅ Ubicación archivada.')
      await cargarDatos(true)
    } finally {
      setSaving(false)
    }
  }

  // Handler Ajuste Manual / Egreso
  const abrirAjusteUbicacion = (u: FondoReservaUbicacion, modo: 'ajuste_manual' | 'egreso' = 'ajuste_manual') => {
    setModalAjusteUb(u)
    setAjusteModo(modo)
    setAjusteNuevoSaldo(String(u.saldo))
    setAjusteEgresoMonto('')
    setAjusteMotivo('')
  }

  const handleGuardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalAjusteUb) return
    if (!ajusteMotivo.trim()) {
      showToast('⚠️ Ingresa un motivo o concepto para dejar trazabilidad.')
      return
    }

    let nuevoSaldoFinal = parseFloat(ajusteNuevoSaldo.replace(',', '.'))
    if (ajusteModo === 'egreso') {
      const retiro = parseFloat(ajusteEgresoMonto.replace(',', '.'))
      if (isNaN(retiro) || retiro <= 0) {
        showToast('⚠️ Ingresa un monto válido de egreso.')
        return
      }
      if (retiro > Number(modalAjusteUb.saldo)) {
        showToast('⚠️ El egreso no puede superar el saldo disponible de esta ubicación.')
        return
      }
      nuevoSaldoFinal = Number((Number(modalAjusteUb.saldo) - retiro).toFixed(2))
    }

    if (isNaN(nuevoSaldoFinal) || nuevoSaldoFinal < 0) {
      showToast('⚠️ El saldo resultante debe ser un número mayor o igual a 0.')
      return
    }

    setSaving(true)
    try {
      const res = await ajustarSaldoFondoReserva({
        ubicacionId: modalAjusteUb.id,
        nuevoSaldo: nuevoSaldoFinal,
        tipo: ajusteModo,
        descripcion: ajusteMotivo,
        autorNombre,
      })
      if (!res.success) {
        showToast(`❌ ${res.error}`)
        return
      }
      setModalAjusteUb(null)
      showToast('✅ Saldo actualizado sin alterar recibos ni deudas de propietarios.')
      await cargarDatos(true)
    } finally {
      setSaving(false)
    }
  }

  // Handler Cambio de Divisa / Traslado
  const abrirCambioDivisa = () => {
    if (ubicacionesActivas.length < 2) {
      showToast('⚠️ Necesitas al menos 2 ubicaciones activas para realizar un traslado o cambio de divisa.')
      return
    }
    setDivOrigenId(ubicacionesActivas[0]?.id || '')
    setDivDestinoId(ubicacionesActivas[1]?.id || '')
    setDivMontoOrigen('')
    setDivMontoDestino('')
    setDivMotivo('')
    setModalDivisaOpen(true)
  }

  const handleGuardarCambioDivisa = async (e: React.FormEvent) => {
    e.preventDefault()
    const mOrig = parseFloat(divMontoOrigen.replace(',', '.')) || 0
    const mDest = parseFloat(divMontoDestino.replace(',', '.')) || 0
    if (mOrig <= 0 || mDest <= 0) {
      showToast('⚠️ Ingresa montos válidos de origen y destino.')
      return
    }
    setSaving(true)
    try {
      const res = await convertirDivisaFondoReserva({
        origenId: divOrigenId,
        destinoId: divDestinoId,
        montoOrigen: mOrig,
        montoDestino: mDest,
        descripcion: divMotivo || 'Cambio de divisa / traslado entre ubicaciones del Fondo de Reserva',
        autorNombre,
      })
      if (!res.success) {
        showToast(`❌ ${res.error}`)
        return
      }
      setModalDivisaOpen(false)
      showToast('✅ Traslado / cambio de divisa registrado.')
      await cargarDatos(true)
    } finally {
      setSaving(false)
    }
  }

  const movimientosFiltrados = resumen.movimientos.filter((m) => {
    if (filtroMoneda !== 'TODAS' && m.moneda !== filtroMoneda) return false
    if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) return false
    return true
  })

  // Colores Dark / Light
  const cardBg = isLight ? '#ffffff' : '#121622'
  const cardBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)'
  const innerBg = isLight ? '#f8fafc' : '#0b0f19'
  const textPrimary = isLight ? '#0f172a' : '#ffffff'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: isLight ? '#ffffff' : '#0b0f19',
    border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
    color: textPrimary,
    padding: '10px 12px',
    borderRadius: '10px',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: '1280px', margin: '0 auto' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: isLight ? '#0f172a' : '#1e293b',
            color: '#fff',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            padding: '12px 18px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Encabezado */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: textPrimary }}>
            🏦 Fondo de Reserva
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: textMuted }}>
            Administración multimoneda por ubicaciones, destinos automáticos por defecto y auditoría contable
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={abrirCambioDivisa}
            style={{
              backgroundColor: isLight ? '#f1f5f9' : 'rgba(245, 158, 11, 0.14)',
              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(245, 158, 11, 0.4)',
              color: isLight ? '#b45309' : '#fbbf24',
              padding: '10px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            💱 Cambio de Divisa / Traslado
          </button>

          <button
            onClick={abrirCrearUbicacion}
            style={{
              background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
              border: 'none',
              color: '#fff',
              padding: '10px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
            }}
          >
            + Nueva Ubicación
          </button>
        </div>
      </div>

      {/* KPIs Consolidados */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ background: cardBg, border: cardBorder, borderRadius: '18px', padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: textMuted }}>
            Total Consolidado (Tasa Bs. {tasaVigente.toFixed(2)})
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: isLight ? '#0369a1' : '#38bdf8', marginTop: '6px' }}>
            ${fmtUsd(resumen.totales.totalConsolidadoUsd)} USD
          </div>
          <div style={{ fontSize: '12px', color: textMuted, marginTop: '2px' }}>
            ≈ Bs. {fmtBs(resumen.totales.totalConsolidadoBs)}
          </div>
        </div>

        <div style={{ background: cardBg, border: cardBorder, borderRadius: '18px', padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: textMuted }}>
            Total Nativo USD
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: isLight ? '#15803d' : '#4ade80', marginTop: '6px' }}>
            ${fmtUsd(resumen.totales.totalNativoUsd)}
          </div>
          <div style={{ fontSize: '12px', color: textMuted, marginTop: '2px' }}>
            Default USD: {resumen.totales.defaultUsd?.nombre || 'Sin definir'}
          </div>
        </div>

        <div style={{ background: cardBg, border: cardBorder, borderRadius: '18px', padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: textMuted }}>
            Total Nativo Bs.
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: isLight ? '#b45309' : '#fbbf24', marginTop: '6px' }}>
            Bs. {fmtBs(resumen.totales.totalNativoBs)}
          </div>
          <div style={{ fontSize: '12px', color: textMuted, marginTop: '2px' }}>
            Default Bs: {resumen.totales.defaultBs?.nombre || 'Sin definir'}
          </div>
        </div>
      </div>

      {/* Nota reglas contables */}
      <div
        style={{
          backgroundColor: isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.08)',
          border: isLight ? '1px solid #bbf7d0' : '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: '14px',
          padding: '12px 16px',
          marginBottom: '22px',
          fontSize: '12.5px',
          color: isLight ? '#166534' : '#86efac',
        }}
      >
        <strong>Regla automática activa:</strong> Los recibos emitidos NO suman al saldo real hasta que el departamento liquida el 100% de la cuota ordinaria (vía aprobación de pago o marcando el mes como Solvente en Calendario). Gas, locales y cuotas extraordinarias están aislados. Los ajustes manuales de saldo aquí NO modifican recibos ni deudas.
      </div>

      {/* Ubicaciones */}
      <h2 style={{ margin: '0 0 12px', fontSize: '17px', fontWeight: 800, color: textPrimary }}>
        Ubicaciones de Resguardo ({ubicacionesActivas.length})
      </h2>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: textMuted }}>Cargando ubicaciones...</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '16px',
            marginBottom: '30px',
          }}
        >
          {ubicacionesActivas.map((u) => {
            const infoTipo = TIPO_UB_LABELS[u.tipo] || TIPO_UB_LABELS.otro
            return (
              <div
                key={u.id}
                style={{
                  background: cardBg,
                  border: u.es_destino_default ? '1.5px solid rgba(56, 189, 248, 0.55)' : cardBorder,
                  borderRadius: '18px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '24px', flexShrink: 0 }}>{infoTipo.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: textPrimary, overflowWrap: 'break-word' }}>{u.nombre}</div>
                        <div style={{ fontSize: '11.5px', color: textMuted }}>{infoTipo.label}</div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 9px',
                        borderRadius: '999px',
                        backgroundColor: u.moneda === 'USD' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(245, 158, 11, 0.16)',
                        color: u.moneda === 'USD' ? (isLight ? '#15803d' : '#4ade80') : (isLight ? '#b45309' : '#fbbf24'),
                        flexShrink: 0,
                      }}
                    >
                      {u.moneda}
                    </span>
                  </div>

                  {u.es_destino_default && (
                    <div
                      style={{
                        marginTop: '10px',
                        display: 'inline-block',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 9px',
                        borderRadius: '999px',
                        backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.15)',
                        color: isLight ? '#0369a1' : '#38bdf8',
                      }}
                    >
                      ⭐ Destino por defecto para aportes en {u.moneda}
                    </div>
                  )}

                  <div style={{ fontSize: 'clamp(20px, 2.4vw, 26px)', fontWeight: 900, color: textPrimary, marginTop: '12px', overflowWrap: 'anywhere' }}>
                    {u.moneda === 'USD' ? `$${fmtUsd(u.saldo)}` : `Bs. ${fmtBs(u.saldo)}`}
                  </div>

                  {u.descripcion && (
                    <div style={{ fontSize: '12px', color: textMuted, marginTop: '4px', overflowWrap: 'break-word' }}>{u.descripcion}</div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', borderTop: cardBorder, paddingTop: '12px' }}>
                  <button
                    onClick={() => abrirAjusteUbicacion(u, 'ajuste_manual')}
                    style={{
                      flex: 1,
                      backgroundColor: isLight ? '#eef2ff' : 'rgba(99, 102, 241, 0.16)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      color: isLight ? '#4338ca' : '#a5b4fc',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ Editar Saldo
                  </button>
                  <button
                    onClick={() => abrirAjusteUbicacion(u, 'egreso')}
                    style={{
                      backgroundColor: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.14)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: isLight ? '#b91c1c' : '#fca5a5',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ➖ Egreso
                  </button>
                  {!u.es_destino_default && (
                    <button
                      onClick={() => handleDefinirDefault(u)}
                      disabled={saving}
                      title={`Definir como destino por defecto para cuotas pagadas en ${u.moneda}`}
                      style={{
                        backgroundColor: innerBg,
                        border: cardBorder,
                        color: textPrimary,
                        padding: '8px 10px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ⭐ Default
                    </button>
                  )}
                  <button
                    onClick={() => abrirEditarUbicacion(u)}
                    title="Editar nombre o descripción"
                    style={{
                      backgroundColor: innerBg,
                      border: cardBorder,
                      color: textMuted,
                      padding: '8px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    ⚙️
                  </button>
                  {Number(u.saldo) === 0 && !u.es_destino_default && (
                    <button
                      onClick={() => handleDesactivarUbicacion(u)}
                      title="Archivar ubicación sin saldo"
                      style={{
                        backgroundColor: innerBg,
                        border: cardBorder,
                        color: '#ef4444',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial de Movimientos */}
      <div style={{ background: cardBg, border: cardBorder, borderRadius: '18px', padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: textPrimary }}>
            Historial y Auditoría de Movimientos ({movimientosFiltrados.length})
          </h2>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={filtroMoneda}
              onChange={(e) => setFiltroMoneda(e.target.value as 'TODAS' | MonedaFondoReserva)}
              style={{ ...inputStyle, width: 'auto', padding: '7px 12px', fontSize: '12.5px' }}
            >
              <option value="TODAS">Todas las monedas</option>
              <option value="USD">USD</option>
              <option value="BS">Bs.</option>
            </select>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as 'TODOS' | TipoMovimientoFondo)}
              style={{ ...inputStyle, width: 'auto', padding: '7px 12px', fontSize: '12.5px' }}
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="aporte_cuota">Aportes por cuota</option>
              <option value="ajuste_manual">Ajustes manuales</option>
              <option value="egreso">Egresos</option>
              <option value="transferencia_divisa">Cambios de divisa</option>
              <option value="saldo_inicial">Saldos iniciales</option>
            </select>
          </div>
        </div>

        {movimientosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: textMuted, fontSize: '13px' }}>
            No hay movimientos registrados para los filtros seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: cardBorder, color: textMuted }}>
                  <th style={{ padding: '10px 12px' }}>Fecha</th>
                  <th style={{ padding: '10px 12px' }}>Tipo</th>
                  <th style={{ padding: '10px 12px' }}>Ubicación</th>
                  <th style={{ padding: '10px 12px' }}>Concepto / Detalle</th>
                  <th style={{ padding: '10px 12px' }}>Autor</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Saldo Nuevo</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m) => {
                  const info = TIPO_MOV_INFO[m.tipo] || TIPO_MOV_INFO.ajuste_manual
                  const pos = m.monto >= 0
                  return (
                    <tr key={m.id} style={{ borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', color: textMuted, whiteSpace: 'nowrap' }}>
                        {new Date(m.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            backgroundColor: `${info.color}22`,
                            color: info.color,
                          }}
                        >
                          {info.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: textPrimary }}>
                        {m.ubicacion_nombre}
                      </td>
                      <td style={{ padding: '10px 12px', color: textPrimary }}>
                        {m.descripcion}
                        {m.referencia && (
                          <span style={{ display: 'block', fontSize: '11px', color: textMuted }}>
                            Ref: {m.referencia}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: textMuted }}>
                        {m.autor_nombre || 'Sistema'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: pos ? '#22c55e' : '#ef4444',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {pos ? '+' : '-'}
                        {m.moneda === 'USD' ? `$${fmtUsd(Math.abs(m.monto))}` : `Bs. ${fmtBs(Math.abs(m.monto))}`}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: textPrimary, whiteSpace: 'nowrap' }}>
                        {m.moneda === 'USD' ? `$${fmtUsd(m.saldo_nuevo)}` : `Bs. ${fmtBs(m.saldo_nuevo)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Ubicación */}
      {modalUbOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleGuardarUbicacion}
            style={{
              background: cardBg,
              border: cardBorder,
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: textPrimary }}>
              {editUb ? 'Editar Ubicación' : 'Nueva Ubicación del Fondo'}
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                Nombre de la Ubicación
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Efectivo Caja Fuerte USD / Cuenta Bancaria Bs."
                value={ubNombre}
                onChange={(e) => setUbNombre(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Tipo
                </label>
                <select value={ubTipo} onChange={(e) => setUbTipo(e.target.value as TipoUbicacionFondo)} style={inputStyle}>
                  <option value="banco">Cuenta Bancaria</option>
                  <option value="efectivo">Efectivo / Caja Fuerte</option>
                  <option value="digital">Zelle / Digital</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Moneda
                </label>
                <select
                  value={ubMoneda}
                  disabled={Boolean(editUb)}
                  onChange={(e) => setUbMoneda(e.target.value as MonedaFondoReserva)}
                  style={inputStyle}
                >
                  <option value="USD">Dólares (USD)</option>
                  <option value="BS">Bolívares (Bs.)</option>
                </select>
              </div>
            </div>

            {!editUb && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Saldo Inicial ({ubMoneda})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={ubSaldoIni}
                  onChange={(e) => setUbSaldoIni(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                Descripción / Nota (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Resguardo en tesorería de junta"
                value={ubDesc}
                onChange={(e) => setUbDesc(e.target.value)}
                style={inputStyle}
              />
            </div>

            {!editUb && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: textPrimary, cursor: 'pointer' }}>
                <input type="checkbox" checked={ubDefault} onChange={(e) => setUbDefault(e.target.checked)} />
                <span>Establecer como destino por defecto para aportes en {ubMoneda}</span>
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setModalUbOpen(false)}
                style={{
                  backgroundColor: innerBg,
                  border: cardBorder,
                  color: textMuted,
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  backgroundColor: '#f97316',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Guardando...' : 'Guardar Ubicación'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Ajuste Directo de Saldo / Egreso */}
      {modalAjusteUb && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleGuardarAjuste}
            style={{
              background: cardBg,
              border: cardBorder,
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: textPrimary }}>
              {ajusteModo === 'egreso' ? 'Registrar Egreso del Fondo' : 'Editar Saldo Directamente'}
            </h3>
            <div style={{ fontSize: '12.5px', color: textMuted }}>
              Ubicación: <strong style={{ color: textPrimary }}>{modalAjusteUb.nombre}</strong> ({modalAjusteUb.moneda}) · Saldo actual:{' '}
              <strong>
                {modalAjusteUb.moneda === 'USD' ? `$${fmtUsd(modalAjusteUb.saldo)}` : `Bs. ${fmtBs(modalAjusteUb.saldo)}`}
              </strong>
            </div>

            {ajusteModo === 'egreso' ? (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Monto del Egreso ({modalAjusteUb.moneda})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={ajusteEgresoMonto}
                  onChange={(e) => setAjusteEgresoMonto(e.target.value)}
                  style={inputStyle}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Nuevo Saldo Total en {modalAjusteUb.moneda}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={ajusteNuevoSaldo}
                  onChange={(e) => setAjusteNuevoSaldo(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                Motivo / Concepto de Auditoría
              </label>
              <input
                type="text"
                required
                placeholder={
                  ajusteModo === 'egreso'
                    ? 'Ej. Reparación bomba de agua aprobada por junta'
                    : 'Ej. Carga de saldo histórico / arqueo físico de caja'
                }
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setModalAjusteUb(null)}
                style={{
                  backgroundColor: innerBg,
                  border: cardBorder,
                  color: textMuted,
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  backgroundColor: ajusteModo === 'egreso' ? '#ef4444' : '#6366f1',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Aplicando...' : 'Confirmar Movimiento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Cambio de Divisa / Traslado */}
      {modalDivisaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleGuardarCambioDivisa}
            style={{
              background: cardBg,
              border: cardBorder,
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: textPrimary }}>
              💱 Cambio de Divisa o Traslado entre Ubicaciones
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Origen (Sale)
                </label>
                <select value={divOrigenId} onChange={(e) => setDivOrigenId(e.target.value)} style={inputStyle}>
                  {ubicacionesActivas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.moneda}: {u.moneda === 'USD' ? `$${fmtUsd(u.saldo)}` : `Bs. ${fmtBs(u.saldo)}`})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Destino (Entra)
                </label>
                <select value={divDestinoId} onChange={(e) => setDivDestinoId(e.target.value)} style={inputStyle}>
                  {ubicacionesActivas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.moneda})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Monto que sale
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={divMontoOrigen}
                  onChange={(e) => setDivMontoOrigen(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                  Monto recibido en destino
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={divMontoDestino}
                  onChange={(e) => setDivMontoDestino(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '5px' }}>
                Detalle / Tasa aplicada
              </label>
              <input
                type="text"
                placeholder="Ej. Compra de divisas para resguardo en caja fuerte"
                value={divMotivo}
                onChange={(e) => setDivMotivo(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setModalDivisaOpen(false)}
                style={{
                  backgroundColor: innerBg,
                  border: cardBorder,
                  color: textMuted,
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  backgroundColor: '#f59e0b',
                  border: 'none',
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Procesando...' : 'Ejecutar Traslado'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
