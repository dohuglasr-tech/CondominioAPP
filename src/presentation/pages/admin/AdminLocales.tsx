import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../data/supabase'
import {
  LocalComercial,
  TipoCuotaLocal,
  EstadoLocal,
  obtenerLocales,
  crearLocal,
  actualizarLocal,
  eliminarLocal,
  suscribirLocales
} from '../../../data/localesService'
import { useBcvRate } from '../../../data/useBcvRate'

interface ApartamentoOption {
  id: string
  numero: string
  propietario_nombre: string | null
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const AdminLocales: React.FC = () => {
  const { rate: tasaBcv } = useBcvRate()
  const [locales, setLocales] = useState<LocalComercial[]>([])
  const [apartamentos, setApartamentos] = useState<ApartamentoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'inactivo' | 'con_deuda'>('todos')

  // Modal Crear / Editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Modal Ajustar Deuda
  const [modalDeudaOpen, setModalDeudaOpen] = useState(false)
  const [localSeleccionadoDeuda, setLocalSeleccionadoDeuda] = useState<LocalComercial | null>(null)
  const [nuevaDeudaUsd, setNuevaDeudaUsd] = useState('')

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Estado del Formulario
  const [form, setForm] = useState<{
    nombre: string
    codigo: string
    descripcion: string
    arrendatario_nombre: string
    arrendatario_cedula: string
    arrendatario_telefono: string
    arrendatario_email: string
    tipo_cuota: TipoCuotaLocal
    monto_usd: string
    monto_bs: string
    inicio_contrato: string
    fin_contrato: string
    apartamento_id: string
    estado: EstadoLocal
    deuda_actual_usd: string
    deposito_garantia_usd: string
    notas_admin: string
  }>({
    nombre: '',
    codigo: '',
    descripcion: '',
    arrendatario_nombre: '',
    arrendatario_cedula: '',
    arrendatario_telefono: '',
    arrendatario_email: '',
    tipo_cuota: 'fija',
    monto_usd: '',
    monto_bs: '',
    inicio_contrato: new Date().toISOString().slice(0, 10),
    fin_contrato: '',
    apartamento_id: '',
    estado: 'activo',
    deuda_actual_usd: '0',
    deposito_garantia_usd: '0',
    notas_admin: ''
  })

  // Cargar datos iniciales
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [listaLocales, aptosRes] = await Promise.all([
        obtenerLocales(),
        supabase.from('apartamentos').select('id, numero, propietario_nombre').order('numero', { ascending: true })
      ])
      setLocales(listaLocales)
      if (aptosRes.data) {
        setApartamentos(aptosRes.data)
      }
    } catch (e) {
      console.error('[AdminLocales] Error cargando datos:', e)
      showToast('⚠️ Error al cargar información de locales')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
    const unsub = suscribirLocales(actualizados => {
      setLocales(actualizados)
    })
    return () => unsub()
  }, [cargarDatos])

  // Cambio de monto USD -> cálculo automático de Bs
  const handleMontoUsdChange = (val: string) => {
    const usd = parseFloat(val.replace(',', '.'))
    if (!isNaN(usd) && tasaBcv > 0) {
      setForm(prev => ({
        ...prev,
        monto_usd: val,
        monto_bs: (usd * tasaBcv).toFixed(2)
      }))
    } else {
      setForm(prev => ({ ...prev, monto_usd: val }))
    }
  }

  // Abrir Modal para Crear
  const handleNuevoLocal = () => {
    setEditandoId(null)
    setForm({
      nombre: '',
      codigo: '',
      descripcion: '',
      arrendatario_nombre: '',
      arrendatario_cedula: '',
      arrendatario_telefono: '',
      arrendatario_email: '',
      tipo_cuota: 'fija',
      monto_usd: '',
      monto_bs: '',
      inicio_contrato: new Date().toISOString().slice(0, 10),
      fin_contrato: '',
      apartamento_id: '',
      estado: 'activo',
      deuda_actual_usd: '0',
      deposito_garantia_usd: '0',
      notas_admin: ''
    })
    setModalOpen(true)
  }

  // Abrir Modal para Editar
  const handleEditarLocal = (loc: LocalComercial) => {
    setEditandoId(loc.id)
    setForm({
      nombre: loc.nombre,
      codigo: loc.codigo || '',
      descripcion: loc.descripcion || '',
      arrendatario_nombre: loc.arrendatario_nombre,
      arrendatario_cedula: loc.arrendatario_cedula || '',
      arrendatario_telefono: loc.arrendatario_telefono || '',
      arrendatario_email: loc.arrendatario_email || '',
      tipo_cuota: loc.tipo_cuota,
      monto_usd: loc.monto_usd.toString(),
      monto_bs: loc.monto_bs ? loc.monto_bs.toString() : (tasaBcv > 0 ? (loc.monto_usd * tasaBcv).toFixed(2) : ''),
      inicio_contrato: loc.inicio_contrato || '',
      fin_contrato: loc.fin_contrato || '',
      apartamento_id: loc.apartamento_id || '',
      estado: loc.estado,
      deuda_actual_usd: loc.deuda_actual_usd ? loc.deuda_actual_usd.toString() : '0',
      deposito_garantia_usd: loc.deposito_garantia_usd ? loc.deposito_garantia_usd.toString() : '0',
      notas_admin: loc.notas_admin || ''
    })
    setModalOpen(true)
  }

  // Guardar Local (Crear o Actualizar)
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) {
      showToast('⚠️ Ingresa el nombre o identificador del local')
      return
    }
    if (!form.arrendatario_nombre.trim()) {
      showToast('⚠️ Ingresa el nombre del arrendatario o responsable')
      return
    }

    const musd = parseFloat(form.monto_usd.replace(',', '.')) || 0
    const mbs = parseFloat(form.monto_bs.replace(',', '.')) || (tasaBcv > 0 ? parseFloat((musd * tasaBcv).toFixed(2)) : 0)
    const deudaUsd = parseFloat(form.deuda_actual_usd.replace(',', '.')) || 0
    const deudaBs = tasaBcv > 0 ? parseFloat((deudaUsd * tasaBcv).toFixed(2)) : 0
    const garantiaUsd = parseFloat(form.deposito_garantia_usd.replace(',', '.')) || 0

    // Encontrar apartamento seleccionado si aplica
    const aptoSel = apartamentos.find(a => a.id === form.apartamento_id)

    setGuardando(true)
    try {
      if (editandoId) {
        await actualizarLocal(editandoId, {
          nombre: form.nombre.trim(),
          codigo: form.codigo.trim() || undefined,
          descripcion: form.descripcion.trim() || undefined,
          arrendatario_nombre: form.arrendatario_nombre.trim(),
          arrendatario_cedula: form.arrendatario_cedula.trim() || undefined,
          arrendatario_telefono: form.arrendatario_telefono.trim() || undefined,
          arrendatario_email: form.arrendatario_email.trim() || undefined,
          tipo_cuota: form.tipo_cuota,
          monto_usd: musd,
          monto_bs: mbs,
          inicio_contrato: form.inicio_contrato || new Date().toISOString().slice(0, 10),
          fin_contrato: form.fin_contrato || undefined,
          apartamento_id: form.apartamento_id ? form.apartamento_id : null,
          apartamento_numero: aptoSel ? aptoSel.numero : undefined,
          apartamento_propietario: aptoSel ? (aptoSel.propietario_nombre || '') : undefined,
          estado: form.estado,
          deuda_actual_usd: deudaUsd,
          deuda_actual_bs: deudaBs,
          deposito_garantia_usd: garantiaUsd,
          notas_admin: form.notas_admin.trim() || undefined
        })
        showToast('✅ Local actualizado correctamente')
      } else {
        await crearLocal({
          nombre: form.nombre.trim(),
          codigo: form.codigo.trim() || undefined,
          descripcion: form.descripcion.trim() || undefined,
          arrendatario_nombre: form.arrendatario_nombre.trim(),
          arrendatario_cedula: form.arrendatario_cedula.trim() || undefined,
          arrendatario_telefono: form.arrendatario_telefono.trim() || undefined,
          arrendatario_email: form.arrendatario_email.trim() || undefined,
          tipo_cuota: form.tipo_cuota,
          monto_usd: musd,
          monto_bs: mbs,
          inicio_contrato: form.inicio_contrato || new Date().toISOString().slice(0, 10),
          fin_contrato: form.fin_contrato || undefined,
          apartamento_id: form.apartamento_id ? form.apartamento_id : null,
          apartamento_numero: aptoSel ? aptoSel.numero : undefined,
          apartamento_propietario: aptoSel ? (aptoSel.propietario_nombre || '') : undefined,
          estado: form.estado,
          deuda_actual_usd: deudaUsd,
          deuda_actual_bs: deudaBs,
          deposito_garantia_usd: garantiaUsd,
          notas_admin: form.notas_admin.trim() || undefined
        })
        showToast('✅ Nuevo local registrado exitosamente')
      }
      setModalOpen(false)
      cargarDatos()
    } catch (e) {
      console.error('[AdminLocales] Error al guardar local:', e)
      showToast('❌ Ocurrió un error al guardar los cambios')
    } finally {
      setGuardando(false)
    }
  }

  // Eliminar Local
  const handleEliminar = async (loc: LocalComercial) => {
    const confirmacion = window.confirm(
      `¿Estás seguro de eliminar el local "${loc.nombre}"?\nEsta acción quitará el espacio del registro del condominio.`
    )
    if (!confirmacion) return

    try {
      await eliminarLocal(loc.id)
      showToast('🗑️ Local eliminado del sistema')
      cargarDatos()
    } catch (e) {
      console.error('[AdminLocales] Error al eliminar local:', e)
      showToast('❌ Error al eliminar el local')
    }
  }

  // Abrir Modal Deuda
  const handleAbrirAjustarDeuda = (loc: LocalComercial) => {
    setLocalSeleccionadoDeuda(loc)
    setNuevaDeudaUsd(loc.deuda_actual_usd ? loc.deuda_actual_usd.toString() : '0')
    setModalDeudaOpen(true)
  }

  // Guardar Ajuste de Deuda
  const handleGuardarAjusteDeuda = async () => {
    if (!localSeleccionadoDeuda) return
    const dUsd = parseFloat(nuevaDeudaUsd.replace(',', '.')) || 0
    const dBs = tasaBcv > 0 ? parseFloat((dUsd * tasaBcv).toFixed(2)) : 0

    try {
      await actualizarLocal(localSeleccionadoDeuda.id, {
        deuda_actual_usd: dUsd,
        deuda_actual_bs: dBs
      })
      showToast(`✅ Deuda del local actualizada: $${fmtUsd(dUsd)} USD`)
      setModalDeudaOpen(false)
      cargarDatos()
    } catch (e) {
      console.error('[AdminLocales] Error al ajustar deuda:', e)
      showToast('❌ Error al actualizar la deuda')
    }
  }

  // Filtrado y Búsqueda
  const localesFiltrados = useMemo(() => {
    return locales.filter(l => {
      // Filtro de estado
      if (filtroEstado === 'activo' && l.estado !== 'activo') return false
      if (filtroEstado === 'inactivo' && l.estado !== 'inactivo') return false
      if (filtroEstado === 'con_deuda' && (l.deuda_actual_usd || 0) <= 0) return false

      // Búsqueda
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      const matchNombre = l.nombre?.toLowerCase().includes(q)
      const matchArrendatario = l.arrendatario_nombre?.toLowerCase().includes(q)
      const matchApto = l.apartamento_numero?.toLowerCase().includes(q)
      const matchCodigo = l.codigo?.toLowerCase().includes(q)
      return matchNombre || matchArrendatario || matchApto || matchCodigo
    })
  }, [locales, filtroEstado, busqueda])

  // Estadísticas generales
  const stats = useMemo(() => {
    const total = locales.length
    const activos = locales.filter(l => l.estado === 'activo')
    const ingresoMesUsd = activos.reduce((sum, l) => sum + (Number(l.monto_usd) || 0), 0)
    const ingresoMesBs = activos.reduce((sum, l) => sum + (Number(l.monto_bs) || 0), 0)
    const conDeuda = locales.filter(l => (Number(l.deuda_actual_usd) || 0) > 0)
    const totalDeudaUsd = locales.reduce((sum, l) => sum + (Number(l.deuda_actual_usd) || 0), 0)
    const totalDeudaBs = locales.reduce((sum, l) => sum + (Number(l.deuda_actual_bs) || 0), 0)

    return {
      total,
      activosCount: activos.length,
      ingresoMesUsd,
      ingresoMesBs,
      conDeudaCount: conDeuda.length,
      totalDeudaUsd,
      totalDeudaBs
    }
  }, [locales])

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px 80px', color: '#fff' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#1e293b',
          color: '#fff',
          border: '1px solid var(--color-accent, #f97316)',
          borderRadius: '10px',
          padding: '12px 20px',
          fontSize: '13px',
          fontWeight: 700,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '28px' }}>🏢</span>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              Gestión de Locales y Espacios Exclusivos
            </h1>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13.5px', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
            Administra los locales comerciales, alquileres y áreas exclusivas del edificio. La deuda de cada local pertenece al apartamento asignado y se refleja en los recibos como <strong>"Donación por uso de espacios exclusivos"</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={handleNuevoLocal}
          style={{
            backgroundColor: 'var(--color-accent, #f97316)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '11px 20px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
            transition: 'all 0.15s ease'
          }}
        >
          <span style={{ fontSize: '18px' }}>+</span>
          <span>Añadir Local</span>
        </button>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {/* Total Locales */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '16px 18px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Total Locales / Espacios
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>
            {stats.total}{' '}
            <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>
              ({stats.activosCount} activos)
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: '11.5px', marginTop: '4px' }}>
            {stats.total - stats.activosCount} inactivos o disponibles
          </div>
        </div>

        {/* Ingreso Mensual Estimado */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '16px 18px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Recaudación Mensual Estimada
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#38bdf8' }}>
            ${fmtUsd(stats.ingresoMesUsd)} USD
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', fontWeight: 600 }}>
            Bs. {fmtBs(stats.ingresoMesBs > 0 ? stats.ingresoMesBs : stats.ingresoMesUsd * (tasaBcv || 859.06))}
          </div>
        </div>

        {/* Deuda Total Acumulada */}
        <div style={{
          backgroundColor: stats.conDeudaCount > 0 ? 'rgba(239, 68, 68, 0.08)' : '#111622',
          border: `1px solid ${stats.conDeudaCount > 0 ? 'rgba(239, 68, 68, 0.3)' : '#1e293b'}`,
          borderRadius: '12px',
          padding: '16px 18px'
        }}>
          <div style={{ color: stats.conDeudaCount > 0 ? '#f87171' : '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Deuda Pendiente de Locales
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: stats.conDeudaCount > 0 ? '#ef4444' : '#4ade80' }}>
            {stats.conDeudaCount > 0 ? `$${fmtUsd(stats.totalDeudaUsd)} USD` : 'Solventes'}
          </div>
          <div style={{ color: stats.conDeudaCount > 0 ? '#fca5a5' : '#64748b', fontSize: '11.5px', marginTop: '4px' }}>
            {stats.conDeudaCount > 0 ? `${stats.conDeudaCount} locales con pagos pendientes` : 'Todos los locales al día'}
          </div>
        </div>

        {/* Tasa Oficial de Referencia */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '16px 18px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Tasa Oficial BCV
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#fbbf24' }}>
            {tasaBcv > 0 ? `Bs. ${fmtBs(tasaBcv)}` : 'Consultando...'}
          </div>
          <div style={{ color: '#64748b', fontSize: '11.5px', marginTop: '4px' }}>
            Conversión automática para cuotas y recibos
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div style={{
        backgroundColor: '#0c1019',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '14px 18px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Buscador */}
        <div style={{ flex: '1 1 280px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar por local, arrendatario o apto asignado..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#141c2c',
              border: '1px solid #27354f',
              borderRadius: '8px',
              color: '#fff',
              padding: '9px 12px',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Botones de filtro de estado */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'activo', label: '🟢 Activos' },
            { key: 'inactivo', label: '⚪ Inactivos' },
            { key: 'con_deuda', label: '🔴 Con Deuda' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltroEstado(f.key as any)}
              style={{
                backgroundColor: filtroEstado === f.key ? 'var(--color-accent, #f97316)' : '#172033',
                color: filtroEstado === f.key ? '#fff' : '#94a3b8',
                border: '1px solid #222f47',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Locales */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <p>Cargando información de locales comerciales...</p>
        </div>
      ) : localesFiltrados.length === 0 ? (
        <div style={{
          backgroundColor: '#0c1019',
          border: '1px dashed #243048',
          borderRadius: '14px',
          padding: '48px 20px',
          textAlign: 'center',
          color: '#94a3b8'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏬</div>
          <h3 style={{ color: '#fff', fontSize: '17px', margin: '0 0 6px' }}>
            No se encontraron locales
          </h3>
          <p style={{ fontSize: '13px', margin: '0 0 16px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
            {busqueda || filtroEstado !== 'todos'
              ? 'No hay locales que coincidan con los criterios de búsqueda o filtros aplicados.'
              : 'Aún no has registrado ningún local comercial o espacio exclusivo en el condominio.'}
          </p>
          <button
            type="button"
            onClick={handleNuevoLocal}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Registrar primer local
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {localesFiltrados.map(local => {
            const tieneDeuda = (Number(local.deuda_actual_usd) || 0) > 0
            const esActivo = local.estado === 'activo'

            return (
              <div
                key={local.id}
                style={{
                  backgroundColor: '#0d131f',
                  border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.4)' : '#1e293b'}`,
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'border-color 0.2s ease'
                }}
              >
                <div>
                  {/* Fila Superior: Nombre y Badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>🏬</span>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#fff' }}>
                          {local.nombre}
                        </h3>
                      </div>
                      {local.codigo && (
                        <span style={{
                          display: 'inline-block',
                          color: '#94a3b8',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: '#172236',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          marginTop: '4px'
                        }}>
                          CÓDIGO: {local.codigo}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        backgroundColor: esActivo ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: esActivo ? '#4ade80' : '#94a3b8',
                        border: `1px solid ${esActivo ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
                      }}>
                        {local.estado}
                      </span>

                      {local.tipo_cuota && (
                        <span style={{
                          color: '#fb923c',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}>
                          Cuota {local.tipo_cuota}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Descripción o rubro */}
                  {local.descripcion && (
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.4 }}>
                      {local.descripcion}
                    </p>
                  )}

                  {/* Arrendatario */}
                  <div style={{
                    backgroundColor: '#121a2a',
                    border: '1px solid #1c2940',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ color: '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>
                      Arrendatario / Responsable
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700 }}>
                      👤 {local.arrendatario_nombre}
                      {local.arrendatario_cedula && (
                        <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: '6px', fontSize: '11.5px' }}>
                          ({local.arrendatario_cedula})
                        </span>
                      )}
                    </div>
                    {local.arrendatario_telefono && (
                      <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '2px' }}>
                        📞 {local.arrendatario_telefono}
                      </div>
                    )}
                  </div>

                  {/* Apartamento Asignado y Deuda */}
                  <div style={{
                    backgroundColor: local.apartamento_id ? 'rgba(249, 115, 22, 0.07)' : '#121a2a',
                    border: `1px solid ${local.apartamento_id ? 'rgba(249, 115, 22, 0.25)' : '#1c2940'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ color: local.apartamento_id ? 'var(--color-accent, #f97316)' : '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>
                      Apartamento Asignado (Deuda Vinculada)
                    </div>
                    {local.apartamento_id ? (
                      <div>
                        <div style={{ color: '#fff', fontSize: '13.5px', fontWeight: 800 }}>
                          🏠 Apto #{local.apartamento_numero || 'Asignado'}
                          {local.apartamento_propietario && (
                            <span style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '12px', marginLeft: '6px' }}>
                              - {local.apartamento_propietario}
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          ℹ️ La deuda y cobro de este local se asignan a este apartamento.
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '12.5px', fontStyle: 'italic' }}>
                        Sin apartamento asignado (Edificio directo)
                      </div>
                    )}
                  </div>

                  {/* Valores Financieros: Canon y Deuda Actual */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ backgroundColor: '#131b2c', borderRadius: '8px', padding: '8px 10px' }}>
                      <span style={{ color: '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                        Cuota Mensual
                      </span>
                      <span style={{ color: '#38bdf8', fontSize: '15px', fontWeight: 800 }}>
                        ${fmtUsd(local.monto_usd)} USD
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>
                        Bs. {fmtBs(local.monto_bs || (local.monto_usd * (tasaBcv || 859.06)))}
                      </span>
                    </div>

                    <div style={{
                      backgroundColor: tieneDeuda ? 'rgba(239, 68, 68, 0.12)' : '#131b2c',
                      border: tieneDeuda ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
                      borderRadius: '8px',
                      padding: '8px 10px'
                    }}>
                      <span style={{ color: tieneDeuda ? '#f87171' : '#64748b', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                        Deuda Actual
                      </span>
                      <span style={{ color: tieneDeuda ? '#ef4444' : '#4ade80', fontSize: '15px', fontWeight: 800 }}>
                        {tieneDeuda ? `$${fmtUsd(local.deuda_actual_usd)} USD` : 'Al Día'}
                      </span>
                      <span style={{ color: tieneDeuda ? '#fca5a5' : '#94a3b8', fontSize: '11px', display: 'block' }}>
                        {tieneDeuda ? `Bs. ${fmtBs(local.deuda_actual_bs || (local.deuda_actual_usd * (tasaBcv || 859.06)))}` : '$0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Fechas de Contrato */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '11px', borderTop: '1px solid #1a2438', paddingTop: '8px' }}>
                    <span>Inicio: {local.inicio_contrato || 'N/D'}</span>
                    <span>Vence: {local.fin_contrato || 'Indefinido'}</span>
                  </div>
                </div>

                {/* Acciones del Card */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  borderTop: '1px solid #1e293b',
                  paddingTop: '12px',
                  alignItems: 'center'
                }}>
                  <button
                    type="button"
                    onClick={() => handleEditarLocal(local)}
                    style={{
                      flex: 1,
                      backgroundColor: '#1b253b',
                      color: '#fff',
                      border: '1px solid #2d3d5f',
                      borderRadius: '7px',
                      padding: '7px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✏️ Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAbrirAjustarDeuda(local)}
                    style={{
                      flex: 1,
                      backgroundColor: tieneDeuda ? 'rgba(239, 68, 68, 0.15)' : '#1b253b',
                      color: tieneDeuda ? '#f87171' : '#cbd5e1',
                      border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.3)' : '#2d3d5f'}`,
                      borderRadius: '7px',
                      padding: '7px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💵 Ajustar Deuda
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEliminar(local)}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '7px',
                      padding: '7px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Eliminar este local"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL CREAR / EDITAR LOCAL
         ══════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 9999,
          overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: '#0c121e',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢</span>
                <span>{editandoId ? 'Editar Información del Local' : 'Registrar Nuevo Local / Espacio'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardar} style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Identificación del Local */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Nombre del Local / Espacio *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Local Comercial PB-1 (Minimarket)"
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Código / ID
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: L-01"
                    value={form.codigo}
                    onChange={e => setForm({ ...form, codigo: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Rubro o Descripción */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                  Rubro Comercial / Uso del Espacio
                </label>
                <input
                  type="text"
                  placeholder="Ej: Bodega y víveres secos / Kiosco de fotocopias"
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#141c2c',
                    border: '1px solid #27354f',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Apartamento Asignado (CLAVE PARA VINCULAR DEUDA) */}
              <div style={{
                backgroundColor: 'rgba(249, 115, 22, 0.08)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '10px',
                padding: '14px'
              }}>
                <label style={{ display: 'block', color: 'var(--color-accent, #f97316)', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  🏠 Apartamento Asignado (La deuda pertenecerá a este inmueble)
                </label>
                <p style={{ color: '#cbd5e1', fontSize: '11.5px', margin: '0 0 10px' }}>
                  El apartamento seleccionado verá reflejado en su portal y recibos el concepto <strong>"Donación por uso de espacios exclusivos"</strong> con los montos adeudados.
                </p>
                <select
                  value={form.apartamento_id}
                  onChange={e => setForm({ ...form, apartamento_id: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#101624',
                    border: '1px solid #334363',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">-- Sin apartamento asignado (Propiedad del edificio) --</option>
                  {apartamentos.map(a => (
                    <option key={a.id} value={a.id}>
                      Apto #{a.numero} {a.propietario_nombre ? `(${a.propietario_nombre})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Datos del Arrendatario */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Nombre Arrendatario / Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Inversiones Los Andes C.A."
                    value={form.arrendatario_nombre}
                    onChange={e => setForm({ ...form, arrendatario_nombre: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Cédula / RIF
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: J-40987654-1"
                    value={form.arrendatario_cedula}
                    onChange={e => setForm({ ...form, arrendatario_cedula: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Teléfono de Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 0414-2345678"
                    value={form.arrendatario_telefono}
                    onChange={e => setForm({ ...form, arrendatario_telefono: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Tipo de Cuota y Montos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Tipo de Cuota
                  </label>
                  <select
                    value={form.tipo_cuota}
                    onChange={e => setForm({ ...form, tipo_cuota: e.target.value as any })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="fija">Cuota Fija</option>
                    <option value="variable">Cuota Variable</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Monto Mensual ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.monto_usd}
                    onChange={e => handleMontoUsdChange(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid var(--color-accent, #f97316)',
                      borderRadius: '8px',
                      color: 'var(--color-accent, #f97316)',
                      fontWeight: 800,
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#10b981', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Equivalente en Bs
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.monto_bs}
                    onChange={e => setForm({ ...form, monto_bs: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      color: '#10b981',
                      fontWeight: 800,
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#ef4444', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Deuda Actual ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.deuda_actual_usd}
                    onChange={e => setForm({ ...form, deuda_actual_usd: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontWeight: 800,
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Fechas de Contrato y Estado */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Inicio de Contrato
                  </label>
                  <input
                    type="date"
                    value={form.inicio_contrato}
                    onChange={e => setForm({ ...form, inicio_contrato: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Finalización de Contrato
                  </label>
                  <input
                    type="date"
                    value={form.fin_contrato}
                    onChange={e => setForm({ ...form, fin_contrato: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                    Estado del Local
                  </label>
                  <select
                    value={form.estado}
                    onChange={e => setForm({ ...form, estado: e.target.value as any })}
                    style={{
                      width: '100%',
                      backgroundColor: '#141c2c',
                      border: '1px solid #27354f',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="activo">Activo (Ocupado / Arrendado)</option>
                    <option value="inactivo">Inactivo / Desocupado</option>
                    <option value="en_mantenimiento">En Mantenimiento</option>
                  </select>
                </div>
              </div>

              {/* Notas Administrativas */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>
                  Notas / Observaciones Administrativas
                </label>
                <textarea
                  rows={2}
                  placeholder="Garantía recibida, acuerdo de horario, etc."
                  value={form.notas_admin}
                  onChange={e => setForm({ ...form, notas_admin: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#141c2c',
                    border: '1px solid #27354f',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Botones Acciones */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '9px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '9px 20px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.7 : 1
                  }}
                >
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Registrar Local'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL AJUSTAR DEUDA
         ══════════════════════════════════════════════════════════════ */}
      {modalDeudaOpen && localSeleccionadoDeuda && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#0c121e',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '22px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
              💵 Ajustar Deuda del Local
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.4 }}>
              Establece el saldo pendiente del local <strong>{localSeleccionadoDeuda.nombre}</strong>.
              {localSeleccionadoDeuda.apartamento_id && (
                <span style={{ display: 'block', marginTop: '4px', color: 'var(--color-accent, #f97316)' }}>
                  Asignado al Apto #{localSeleccionadoDeuda.apartamento_numero}.
                </span>
              )}
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#f87171', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                Deuda Actual en Dólares ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nuevaDeudaUsd}
                onChange={e => setNuevaDeudaUsd(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#141c2c',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '18px',
                  fontWeight: 900,
                  padding: '10px 14px',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Equivalente aproximado: Bs. {fmtBs((parseFloat(nuevaDeudaUsd) || 0) * (tasaBcv || 859.06))}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalDeudaOpen(false)}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleGuardarAjusteDeuda}
                style={{
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Confirmar Saldo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default AdminLocales

