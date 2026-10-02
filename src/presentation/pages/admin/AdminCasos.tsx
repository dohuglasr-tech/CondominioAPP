import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
import { useBcvRate } from '../../../data/useBcvRate'
import { useAuth } from '../../../application/contexts/AuthContext'
import { registrarEventoAuditoria } from '../../../data/auditoriaService'
import {
  CasoComunidad,
  TipoCaso,
  EstadoCaso,
  MonedaCaso,
  getTipoCasoInfo,
  getEstadoCasoInfo,
  obtenerCasos,
  guardarCaso,
  eliminarCaso
} from '../../../data/casosService'

export const AdminCasos: React.FC = () => {
  const { perfil } = useAuth()
  const { rate } = useBcvRate()
  const [casos, setCasos] = useState<CasoComunidad[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [casoEditar, setCasoEditar] = useState<CasoComunidad | null>(null)
  const [apartamentos, setApartamentos] = useState<Array<{ id: string; numero: string }>>([])
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Form state
  const [formTipo, setFormTipo] = useState<TipoCaso>('multa')
  const [formTitulo, setFormTitulo] = useState('')
  const [formDescripcion, setFormDescripcion] = useState('')
  const [formAptoId, setFormAptoId] = useState<string>('')
  const [formAptoNumero, setFormAptoNumero] = useState<string>('')
  const [formInvolucrado, setFormInvolucrado] = useState('')
  const [formContacto, setFormContacto] = useState('')
  const [formMontoUsd, setFormMontoUsd] = useState<number | ''>('')
  const [formMontoBs, setFormMontoBs] = useState<number | ''>('')
  const [formMoneda, setFormMoneda] = useState<MonedaCaso>('USD')
  const [formEstado, setFormEstado] = useState<EstadoCaso>('abierto')
  const [formFecha, setFormFecha] = useState(new Date().toISOString().slice(0, 10))
  const [formVencimiento, setFormVencimiento] = useState('')
  const [formNotas, setFormNotas] = useState('')

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [casosRes, aptosRes] = await Promise.all([
        obtenerCasos(),
        supabase.from('apartamentos').select('id, numero').order('numero', { ascending: true })
      ])
      setCasos(casosRes.data || [])
      if (aptosRes.data) setApartamentos(aptosRes.data)
    } catch (err) {
      console.warn('[AdminCasos] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const abrirModalNuevo = () => {
    setCasoEditar(null)
    setFormTipo('multa')
    setFormTitulo('')
    setFormDescripcion('')
    setFormAptoId('')
    setFormAptoNumero('')
    setFormInvolucrado('')
    setFormContacto('')
    setFormMontoUsd('')
    setFormMontoBs('')
    setFormMoneda('USD')
    setFormEstado('abierto')
    setFormFecha(new Date().toISOString().slice(0, 10))
    setFormVencimiento('')
    setFormNotas('')
    setModalAbierto(true)
  }

  const abrirModalEditar = (c: CasoComunidad) => {
    setCasoEditar(c)
    setFormTipo(c.tipo)
    setFormTitulo(c.titulo)
    setFormDescripcion(c.descripcion || '')
    setFormAptoId(c.apartamento_id || '')
    setFormAptoNumero(c.apartamento_numero || '')
    setFormInvolucrado(c.involucrado_nombre || '')
    setFormContacto(c.involucrado_contacto || '')
    setFormMontoUsd(c.monto_usd || '')
    setFormMontoBs(c.monto_bs || '')
    setFormMoneda(c.moneda || 'USD')
    setFormEstado(c.estado || 'abierto')
    setFormFecha(c.fecha || new Date().toISOString().slice(0, 10))
    setFormVencimiento(c.fecha_vencimiento || '')
    setFormNotas(c.notas_admin || '')
    setModalAbierto(true)
  }

  const handleCalcularBs = () => {
    const usd = Number(formMontoUsd) || 0
    if (usd > 0 && rate > 0) {
      setFormMontoBs(Number((usd * rate).toFixed(2)))
      showToast(`Bs. calculado a tasa BCV (Bs. ${rate.toFixed(2)})`)
    }
  }

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitulo.trim()) {
      showToast('⚠️ Ingresa un título o asunto para el caso')
      return
    }

    const payload: Partial<CasoComunidad> = {
      id: casoEditar?.id,
      tipo: formTipo,
      titulo: formTitulo.trim(),
      descripcion: formDescripcion.trim(),
      apartamento_id: formAptoId || null,
      apartamento_numero:
        formAptoNumero ||
        (formAptoId ? apartamentos.find(a => a.id === formAptoId)?.numero : 'Área Común / Externo'),
      involucrado_nombre: formInvolucrado.trim(),
      involucrado_contacto: formContacto.trim(),
      monto_usd: Number(formMontoUsd) || 0,
      monto_bs: Number(formMontoBs) || 0,
      moneda: formMoneda,
      estado: formEstado,
      fecha: formFecha,
      fecha_vencimiento: formVencimiento || undefined,
      notas_admin: formNotas.trim()
    }

    const res = await guardarCaso(payload)
    if (res.error) {
      showToast(`❌ ${res.error}`)
    } else {
      if (casoEditar) {
        await registrarEventoAuditoria({
          tipo_accion: 'CAMBIO_CASO',
          titulo: `Edición de Caso - ${payload.titulo}`,
          descripcion: `Se actualizó el caso tipo "${payload.tipo}". Estado: ${payload.estado} · Monto: $ ${payload.monto_usd} USD (${payload.moneda}).`,
          apartamento_numero: payload.apartamento_numero,
          apartamento_id: payload.apartamento_id,
          monto_usd: payload.monto_usd,
          monto_bs: payload.monto_bs,
          motivo: payload.notas_admin || 'Actualización de caso por el administrador',
          autor_nombre: perfil?.nombre_completo || 'Administrador',
          autor_email: (perfil as any)?.email || null,
          datos_anteriores: casoEditar,
          datos_nuevos: payload
        })
      }
      showToast(casoEditar ? '✅ Caso actualizado y auditado' : '✅ Caso registrado exitosamente')
      setModalAbierto(false)
      cargarDatos()
    }
  }

  const handleEliminar = async (id: string, titulo: string) => {
    const itemBorrado = casos.find(c => c.id === id)
    const motivo = window.prompt(
      `Ingresa el motivo por el cual eliminas el caso "${titulo}" (obligatorio para el Historial de Auditoría):`,
      'Caso anulado o cerrado por acuerdo de la junta'
    )
    if (!motivo || !motivo.trim()) return

    await registrarEventoAuditoria({
      tipo_accion: 'CAMBIO_CASO',
      titulo: `Eliminación de Caso - ${titulo}`,
      descripcion: `Se eliminó el caso tipo "${itemBorrado?.tipo}" (${titulo}). Monto retirado: $ ${itemBorrado?.monto_usd || 0} USD.`,
      apartamento_numero: itemBorrado?.apartamento_numero,
      apartamento_id: itemBorrado?.apartamento_id,
      monto_usd: itemBorrado?.monto_usd,
      monto_bs: itemBorrado?.monto_bs,
      motivo: motivo.trim(),
      autor_nombre: perfil?.nombre_completo || 'Administrador',
      autor_email: (perfil as any)?.email || null,
      datos_anteriores: itemBorrado
    })

    await eliminarCaso(id)
    showToast('🗑️ Caso eliminado y archivado en Auditoría')
    cargarDatos()
  }

  const handleCambiarEstadoRapido = async (c: CasoComunidad, nuevoEstado: EstadoCaso) => {
    await guardarCaso({ ...c, estado: nuevoEstado })
    showToast(`Estado cambiado a: ${getEstadoCasoInfo(nuevoEstado).label}`)
    cargarDatos()
  }

  // Filtrado
  const casosFiltrados = useMemo(() => {
    return casos.filter(c => {
      if (c.tipo?.startsWith('config_') || c.tipo?.startsWith('configuracion_')) return false
      if (filtroTipo !== 'todos' && c.tipo !== filtroTipo) return false
      if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchTitulo = (c.titulo || '').toLowerCase().includes(q)
        const matchApto = (c.apartamento_numero || '').toLowerCase().includes(q)
        const matchInvolucrado = (c.involucrado_nombre || '').toLowerCase().includes(q)
        const matchDesc = (c.descripcion || '').toLowerCase().includes(q)
        if (!matchTitulo && !matchApto && !matchInvolucrado && !matchDesc) return false
      }
      return true
    })
  }, [casos, filtroTipo, filtroEstado, busqueda])

  // Estadísticas
  const stats = useMemo(() => {
    let totalUsd = 0
    let totalBs = 0
    let multasAbiertas = 0
    let acuerdosActivos = 0
    let ingresosExternosUsd = 0
    let totalCasosReales = 0

    casos.forEach(c => {
      if (c.tipo?.startsWith('config_') || c.tipo?.startsWith('configuracion_')) return
      totalCasosReales++
      totalUsd += c.monto_usd || 0
      totalBs += c.monto_bs || 0
      if (c.tipo === 'multa' && c.estado !== 'resuelto') multasAbiertas++
      if (c.tipo === 'acuerdo_pago' && (c.estado === 'abierto' || c.estado === 'en_proceso')) acuerdosActivos++
      if ((c.tipo === 'ingreso_externo' || c.tipo === 'alquiler_local') && c.estado === 'resuelto') {
        ingresosExternosUsd += c.monto_usd || 0
      }
    })

    return {
      totalCasos: totalCasosReales,
      multasAbiertas,
      acuerdosActivos,
      ingresosExternosUsd,
      totalUsd,
      totalBs
    }
  }, [casos])

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: 'rgba(21, 25, 34, 0.95)', border: '1px solid var(--color-accent, #f97316)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.7)', color: '#fff',
          padding: '12px 20px', borderRadius: '14px', fontSize: '14px', fontWeight: 600,
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {toastMsg}
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📁</span>
            <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              Gestión de Casos Comunitarios
            </h1>
          </div>
          <p style={{ color: '#888', fontSize: '14px', margin: '6px 0 0', maxWidth: '720px' }}>
            Registro y control integral de multas, acuerdos de pago, alquiler de locales, asignaciones e ingresos externos del edificio.
          </p>
        </div>

        <button
          onClick={abrirModalNuevo}
          style={{
            background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%))',
            color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '14px', padding: '12px 24px', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: 'var(--color-brand-shadow, 0 4px 20px rgba(249, 115, 22, 0.35))', transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span>➕</span>
          <span>Registrar Nuevo Caso</span>
        </button>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Total Casos */}
        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '20px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.45)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '22px' }}>📊</span>
            <span style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Activos</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{stats.totalCasos}</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Total de casos registrados</div>
        </div>

        {/* Multas Pendientes */}
        <div style={{
          background: 'linear-gradient(180deg, #1e1313 0%, #120a0a 100%)',
          border: '1px solid rgba(239, 68, 68, 0.25)', borderTop: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '20px', padding: '20px', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.12)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '22px' }}>🚨</span>
            <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700, backgroundColor: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '999px' }}>
              Por Cobrar
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>{stats.multasAbiertas}</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Multas pendientes o en trámite</div>
        </div>

        {/* Acuerdos Activos */}
        <div style={{
          background: 'linear-gradient(180deg, #101726 0%, #0a0e17 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)', borderTop: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '20px', padding: '20px', boxShadow: '0 10px 25px rgba(59, 130, 246, 0.12)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '22px' }}>🤝</span>
            <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, backgroundColor: 'rgba(59,130,246,0.15)', padding: '2px 8px', borderRadius: '999px' }}>
              Convenios
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6' }}>{stats.acuerdosActivos}</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Acuerdos de pago vigentes</div>
        </div>

        {/* Ingresos Externos Cobrados */}
        <div style={{
          background: 'linear-gradient(180deg, #0e1e17 0%, #08120e 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)', borderTop: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '20px', padding: '20px', boxShadow: '0 10px 25px rgba(16, 185, 129, 0.12)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '22px' }}>💰</span>
            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, backgroundColor: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '999px' }}>
              Recaudado
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>
            ${stats.ingresosExternosUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Ingresos externos y locales</div>
        </div>
      </div>

      {/* FILTERS & SEARCH BAR */}
      <div style={{
        background: 'rgba(21, 25, 34, 0.65)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px',
        padding: '16px 20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '14px'
      }}>
        {/* Chips Tipo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: '#888', fontWeight: 700, marginRight: '4px' }}>TIPO:</span>
          {[
            { key: 'todos', label: 'Todos los casos', icon: '📂' },
            { key: 'multa', label: 'Multas', icon: '🚨' },
            { key: 'acuerdo_pago', label: 'Acuerdos de Pago', icon: '🤝' },
            { key: 'alquiler_local', label: 'Alquiler Locales/Áreas', icon: '🏢' },
            { key: 'asignacion', label: 'Asignaciones', icon: '🏷️' },
            { key: 'ingreso_externo', label: 'Ingresos Externos', icon: '📡' },
          ].map(chip => {
            const active = filtroTipo === chip.key
            return (
              <button
                key={chip.key}
                onClick={() => setFiltroTipo(chip.key)}
                style={{
                  background: active ? 'var(--color-brand-gradient, #f97316)' : 'rgba(255, 255, 255, 0.05)',
                  border: active ? '1px solid var(--color-accent, #f97316)' : '1px solid rgba(255, 255, 255, 0.09)',
                  color: active ? '#fff' : '#ccc',
                  fontWeight: active ? 800 : 500,
                  fontSize: '12px', padding: '7px 14px', borderRadius: '10px',
                  cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.18s'
                }}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>

        {/* Search & State Filter */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#777' }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar por apartamento, título, nombre o detalle..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff', padding: '10px 14px 10px 36px', borderRadius: '12px', fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888', fontWeight: 600 }}>Estado:</span>
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{
                background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff', padding: '9px 14px', borderRadius: '12px', fontSize: '13px', outline: 'none'
              }}
            >
              <option value="todos">Todos los estados</option>
              <option value="abierto">Abiertos (Pendientes)</option>
              <option value="en_proceso">En Proceso</option>
              <option value="resuelto">Resueltos / Cobrados</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>
      </div>

      {/* CASES LIST TABLE */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Cargando casos comunitarios...
        </div>
      ) : casosFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.12)', color: '#888'
        }}>
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>📭</div>
          <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '16px' }}>No se encontraron casos registrados</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>Prueba ajustando los filtros o registra un nuevo caso con el botón superior.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {casosFiltrados.map(c => {
            const tipoMeta = getTipoCasoInfo(c.tipo)
            const estadoMeta = getEstadoCasoInfo(c.estado)

            return (
              <div
                key={c.id}
                style={{
                  background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: '1px solid rgba(255, 255, 255, 0.13)',
                  borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)', transition: 'border-color 0.2s'
                }}
              >
                {/* Top Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      background: `${tipoMeta.color}15`, border: `1px solid ${tipoMeta.color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0
                    }}>
                      {tipoMeta.icon}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                          color: tipoMeta.color, background: `${tipoMeta.color}15`,
                          padding: '2px 8px', borderRadius: '6px', border: `1px solid ${tipoMeta.color}30`
                        }}>
                          {tipoMeta.label}
                        </span>

                        {c.apartamento_numero && (
                          <span style={{
                            fontSize: '11px', fontWeight: 700, color: 'var(--color-accent, #f97316)',
                            background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.25))',
                            padding: '2px 8px', borderRadius: '6px'
                          }}>
                            Apto {c.apartamento_numero}
                          </span>
                        )}

                        <span style={{
                          fontSize: '11px', fontWeight: 700, color: estadoMeta.color,
                          background: estadoMeta.bg, border: `1px solid ${estadoMeta.color}35`,
                          padding: '2px 8px', borderRadius: '6px'
                        }}>
                          {estadoMeta.label}
                        </span>
                      </div>

                      <h3 style={{ margin: '6px 0 0', fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                        {c.titulo}
                      </h3>
                    </div>
                  </div>

                  {/* Amounts */}
                  <div style={{ textAlign: 'right', minWidth: '140px' }}>
                    {c.monto_usd > 0 && (
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                        ${c.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ fontSize: '11px', color: 'var(--color-accent, #f97316)', marginLeft: '4px', fontWeight: 700 }}>USD</span>
                      </div>
                    )}
                    {c.monto_bs > 0 && (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#aaa' }}>
                        Bs. {c.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                    {c.monto_usd === 0 && c.monto_bs === 0 && (
                      <div style={{ fontSize: '13px', color: '#777', fontStyle: 'italic' }}>Sin monto monetario</div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {c.descripcion && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#bbb', lineHeight: 1.5, background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '10px' }}>
                    {c.descripcion}
                  </p>
                )}

                {/* Metadata & Actions Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#777', flexWrap: 'wrap' }}>
                    <span>📅 Fecha: <strong style={{ color: '#ccc' }}>{c.fecha}</strong></span>
                    {c.fecha_vencimiento && (
                      <span>⏰ Vence: <strong style={{ color: '#f59e0b' }}>{c.fecha_vencimiento}</strong></span>
                    )}
                    {c.involucrado_nombre && (
                      <span>👤 Involucrado: <strong style={{ color: '#ccc' }}>{c.involucrado_nombre}</strong></span>
                    )}
                    {c.involucrado_contacto && (
                      <span>📞 <strong style={{ color: '#aaa' }}>{c.involucrado_contacto}</strong></span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {c.estado !== 'resuelto' && (
                      <button
                        onClick={() => handleCambiarEstadoRapido(c, 'resuelto')}
                        title="Marcar como Resuelto / Cobrado"
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10b981', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                          fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        ✓ Resuelto
                      </button>
                    )}

                    <button
                      onClick={() => abrirModalEditar(c)}
                      title="Editar Caso"
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#ccc', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      ✏️ Editar
                    </button>

                    <button
                      onClick={() => handleEliminar(c.id, c.titulo)}
                      title="Eliminar Caso"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#ef4444', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR CASO */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #181d28 0%, #0f131a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.12)', borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '24px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
            padding: '28px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)', boxSizing: 'border-box'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                  {casoEditar ? 'Editar Caso Comunitario' : 'Registrar Nuevo Caso'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
                  Ingresa los detalles de la multa, convenio, alquiler o ingreso especial.
                </p>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                style={{
                  background: 'transparent', border: 'none', color: '#888',
                  fontSize: '20px', cursor: 'pointer', padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Tipo de Caso */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Tipo de Caso *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {(['multa', 'acuerdo_pago', 'alquiler_local', 'asignacion', 'ingreso_externo'] as TipoCaso[]).map(t => {
                    const info = getTipoCasoInfo(t)
                    const active = formTipo === t
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setFormTipo(t)}
                        style={{
                          background: active ? `${info.color}25` : 'rgba(255, 255, 255, 0.04)',
                          border: active ? `2px solid ${info.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                          color: active ? '#fff' : '#aaa',
                          padding: '10px 8px', borderRadius: '12px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          textAlign: 'center', transition: 'all 0.15s'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>{info.icon}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{info.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Título */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Título / Asunto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Multa por ruido / Canon Antena Azotea / Reserva Salón"
                  value={formTitulo}
                  onChange={e => setFormTitulo(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '11px 14px', borderRadius: '12px', fontSize: '14px', outline: 'none'
                  }}
                />
              </div>

              {/* Apartamento o Entidad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                    Apartamento Involucrado
                  </label>
                  <select
                    value={formAptoId}
                    onChange={e => {
                      setFormAptoId(e.target.value)
                      const sel = apartamentos.find(a => a.id === e.target.value)
                      if (sel) setFormAptoNumero(sel.numero)
                      else setFormAptoNumero('')
                    }}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '11px 14px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                    }}
                  >
                    <option value="">Área Común / Externo</option>
                    {apartamentos.map(a => (
                      <option key={a.id} value={a.id}>Apto {a.numero}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                    Responsable / Entidad
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Pérez / Movilnet C.A."
                    value={formInvolucrado}
                    onChange={e => setFormInvolucrado(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '11px 14px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Montos en USD y Bs */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent, #f97316)' }}>Valores Monetarios</span>
                  {rate > 0 && (
                    <button
                      type="button"
                      onClick={handleCalcularBs}
                      style={{
                        background: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
                        color: 'var(--color-accent, #f97316)', padding: '3px 8px', borderRadius: '8px', fontSize: '11px',
                        fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ⚡ Calcular Bs con BCV ({rate.toFixed(2)})
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                      Monto en Dólares ($ USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formMontoUsd}
                      onChange={e => setFormMontoUsd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                        border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                        padding: '10px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                      Monto en Bolívares (Bs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formMontoBs}
                      onChange={e => setFormMontoBs(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                        border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                        padding: '10px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Estado y Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Estado</label>
                  <select
                    value={formEstado}
                    onChange={e => setFormEstado(e.target.value as EstadoCaso)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '9px 10px', borderRadius: '10px', fontSize: '12px', outline: 'none'
                    }}
                  >
                    <option value="abierto">Abierto</option>
                    <option value="en_proceso">En Proceso</option>
                    <option value="resuelto">Resuelto / Cobrado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Fecha Registro</label>
                  <input
                    type="date"
                    value={formFecha}
                    onChange={e => setFormFecha(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '8px 10px', borderRadius: '10px', fontSize: '12px', outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Vencimiento (Opc.)</label>
                  <input
                    type="date"
                    value={formVencimiento}
                    onChange={e => setFormVencimiento(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '8px 10px', borderRadius: '10px', fontSize: '12px', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Descripción y Acuerdos
                </label>
                <textarea
                  rows={3}
                  placeholder="Detalles del caso, acuerdos pactados, fechas de pago o justificación de la sanción..."
                  value={formDescripcion}
                  onChange={e => setFormDescripcion(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '10px 12px', borderRadius: '12px', fontSize: '13px', outline: 'none', resize: 'vertical'
                  }}
                />
              </div>

              {/* Notas Internas Admin */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Notas Internas de Administración
                </label>
                <input
                  type="text"
                  placeholder="Notas privadas no visibles al público..."
                  value={formNotas}
                  onChange={e => setFormNotas(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '10px 12px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                  }}
                />
              </div>

              {/* Botones */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.14)',
                    color: '#ccc', padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
                    fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%))',
                    color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '12px',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 16px rgba(249, 115, 22, 0.4))'
                  }}
                >
                  {casoEditar ? 'Guardar Cambios' : 'Registrar Caso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
