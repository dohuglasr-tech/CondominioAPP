import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { getAlicuotaPctNumber, formatAlicuotaPct, parseAlicuotaInput, compararApartamentos } from '../../../utils/alicuota'

interface PersonaContacto {
  nombre: string
  telefono: string
  email: string
}

interface PagoHistorial {
  id: string
  fecha: string
  mes: string
  monto: string
  referencia: string
  estado: 'aprobado' | 'pendiente' | 'rechazado'
}

interface Residente {
  id: string
  apartamento_id: string
  apartamento: string
  piso: number | null
  alicuota: number
  alicuota_input: string
  es_ph: boolean
  tiene_usuario: boolean
  usuario_id?: string
  estado_ocupacion: 'ocupado_propietario' | 'alquilado' | 'desocupado'
  meses_deuda: number
  notas_internas: string
  propietario: PersonaContacto
  inquilino?: PersonaContacto
  historial_pagos: PagoHistorial[]
  reportes_abiertos: number
  created_at?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0a0a0a',
  border: '1px solid #2a2a2a',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: '13px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#888',
  fontSize: '12px',
  marginBottom: '6px',
}

export const AdminResidentes: React.FC = () => {
  const navigate = useNavigate()
  const [residentes, setResidentes] = useState<Residente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'con_usuario' | 'ph'>('todos')
  const [selected, setSelected] = useState<Residente | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Residente | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Estado para modal de borrado de usuario
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Cargar apartamentos y perfiles reales desde Supabase ───────────────────
  const cargarResidentes = useCallback(async () => {
    setLoading(true)
    try {
      const [aptosRes, perfilesRes, pagosRes] = await Promise.all([
        supabase.from('apartamentos').select('*'),
        supabase.from('perfiles').select('*'),
        supabase.from('pagos_reportados').select('id, monto_bs, referencia, estado, fecha_pago, reportado_por, apartamento_id, created_at').order('created_at', { ascending: false })
      ])

      if (aptosRes.error) {
        console.warn('[AdminResidentes] Error cargando apartamentos:', aptosRes.error.message)
      }

      const aptosList = aptosRes.data || []
      const perfilesList = perfilesRes.data || []
      const pagosList = pagosRes.data || []

      // Mapear perfiles por apartamento_id
      const perfilPorApto = new Map<string, any>()
      perfilesList.forEach((p: any) => {
        if (p.apartamento_id) {
          perfilPorApto.set(p.apartamento_id, p)
        }
      })

      // Mapear pagos por apartamento o usuario
      const pagosPorApto = new Map<string, PagoHistorial[]>()
      pagosList.forEach((p: any) => {
        const item: PagoHistorial = {
          id: p.id,
          fecha: p.fecha_pago || p.created_at,
          mes: new Date(p.created_at).toLocaleDateString('es-VE', { month: 'short', year: 'numeric' }),
          monto: `Bs. ${(p.monto_bs || 0).toLocaleString()}`,
          referencia: p.referencia || 'S/R',
          estado: p.estado || 'pendiente',
        }
        if (p.apartamento_id) {
          if (!pagosPorApto.has(p.apartamento_id)) pagosPorApto.set(p.apartamento_id, [])
          pagosPorApto.get(p.apartamento_id)!.push(item)
        }
      })

      // Combinar todos los apartamentos del edificio
      const lista: Residente[] = aptosList.map((a: any) => {
        const perfil = perfilPorApto.get(a.id)
        const pagosApto = pagosPorApto.get(a.id) || []
        const esAlquilado = perfil?.condicion_habitacional === 'alquilado'
        const esPH = a.numero.toUpperCase().includes('PH') || a.piso === 11
        const alicPctNum = getAlicuotaPctNumber(a.alicuota)

        const propNombre = esAlquilado
          ? (perfil?.propietario_nombre || a.propietario_nombre || 'N/D')
          : (perfil?.nombre_completo || a.propietario_nombre || 'Sin registrar')

        const propTel = esAlquilado
          ? (perfil?.propietario_telefono || a.telefono_contacto || 'N/D')
          : (perfil?.telefono || a.telefono_contacto || 'Sin teléfono')

        const propEmail = esAlquilado
          ? (perfil?.propietario_email || '')
          : (perfil?.email || '')

        return {
          id: a.id,
          apartamento_id: a.id,
          apartamento: a.numero,
          piso: a.piso,
          alicuota: a.alicuota || (esPH ? 0.0259 : 0.0159),
          alicuota_input: String(alicPctNum || (esPH ? '2.59' : '1.59')),
          es_ph: esPH,
          tiene_usuario: !!perfil,
          usuario_id: perfil?.id,
          estado_ocupacion: esAlquilado ? 'alquilado' : (a.estado === 'desocupado' ? 'desocupado' : 'ocupado_propietario'),
          meses_deuda: 0,
          notas_internas: '',
          propietario: {
            nombre: propNombre,
            telefono: propTel,
            email: propEmail,
          },
          inquilino: esAlquilado ? {
            nombre: perfil?.nombre_completo || 'Inquilino sin nombre',
            telefono: perfil?.telefono || 'N/D',
            email: '',
          } : undefined,
          historial_pagos: pagosApto,
          reportes_abiertos: 0,
          created_at: a.created_at,
        }
      })

      // Orden natural de apartamentos
      lista.sort((a, b) => compararApartamentos(a.apartamento, b.apartamento))

      setResidentes(lista)
      setSelected(prev => {
        if (!prev && lista.length > 0) return lista[0]
        if (prev) {
          const actual = lista.find(item => item.apartamento_id === prev.apartamento_id)
          return actual || lista[0] || null
        }
        return null
      })
    } catch (err: any) {
      console.error('[AdminResidentes] Error general:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarResidentes()

    const channelId = `admin_residentes_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apartamentos' }, () => cargarResidentes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => cargarResidentes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_reportados' }, () => cargarResidentes())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarResidentes])

  // ── Eliminar usuario o desvincular ──────
  const handleEliminarUsuario = async () => {
    if (!selected) return
    setDeleting(true)
    setDeleteMessage(null)

    try {
      if (selected.usuario_id) {
        const { error: rpcError } = await supabase.rpc('admin_delete_user', {
          target_user_id: selected.usuario_id,
        })

        if (rpcError) {
          console.warn('[AdminResidentes] RPC falló, usando borrado directo:', rpcError.message)
          await supabase.from('pagos_reportados').delete().eq('reportado_por', selected.usuario_id)
          const { error: delPerfilesErr } = await supabase.from('perfiles').delete().eq('id', selected.usuario_id)
          if (delPerfilesErr) throw delPerfilesErr
        }
      }

      // Restablecer apartamento a sin usuario asignado
      await supabase.from('apartamentos').update({
        propietario_nombre: null,
        telefono_contacto: null,
        estado: 'habitado'
      }).eq('id', selected.apartamento_id)

      setDeleteMessage({
        type: 'success',
        text: `El usuario del Apto ${selected.apartamento} fue eliminado por completo. El apartamento se mantiene disponible en el edificio.`,
      })

      setShowDeleteModal(false)
      await cargarResidentes()
    } catch (err: any) {
      console.error('[AdminResidentes] Error eliminando usuario:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al eliminar el usuario: ${err.message || 'Intente nuevamente'}.`,
      })
    } finally {
      setDeleting(false)
    }
  }

  // ── Guardar datos (incluyendo Alícuota) ──────
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setGuardando(true)

    try {
      const alicuotaDecimal = parseAlicuotaInput(form.alicuota_input)

      // 1. Actualizar tabla apartamentos
      const { error: aptErr } = await supabase.from('apartamentos').update({
        alicuota: alicuotaDecimal,
        propietario_nombre: form.propietario.nombre !== 'Sin registrar' ? form.propietario.nombre : null,
        telefono_contacto: form.propietario.telefono !== 'Sin teléfono' ? form.propietario.telefono : null,
        estado: form.estado_ocupacion === 'desocupado' ? 'desocupado' : 'habitado',
      }).eq('id', form.apartamento_id)

      if (aptErr) throw aptErr

      // 2. Si tiene usuario en perfiles, actualizar perfil
      if (form.usuario_id) {
        const payloadPerfil: Record<string, any> = {
          condicion_habitacional: form.estado_ocupacion === 'alquilado' ? 'alquilado' : 'propio',
        }

        if (form.estado_ocupacion === 'alquilado') {
          payloadPerfil.nombre_completo = form.inquilino?.nombre || form.propietario.nombre
          payloadPerfil.telefono = form.inquilino?.telefono || form.propietario.telefono
          payloadPerfil.propietario_nombre = form.propietario.nombre
          payloadPerfil.propietario_telefono = form.propietario.telefono
          payloadPerfil.propietario_email = form.propietario.email
        } else {
          payloadPerfil.nombre_completo = form.propietario.nombre
          payloadPerfil.telefono = form.propietario.telefono
          payloadPerfil.propietario_email = form.propietario.email
        }

        const { error: perfErr } = await supabase
          .from('perfiles')
          .update(payloadPerfil)
          .eq('id', form.usuario_id)

        if (perfErr) {
          console.warn('[AdminResidentes] Error actualizando perfil:', perfErr.message)
        }
      }

      setDeleteMessage({
        type: 'success',
        text: `Datos del Apto ${form.apartamento} actualizados exitosamente (Alícuota: ${formatAlicuotaPct(alicuotaDecimal)}).`
      })

      setEditMode(false)
      await cargarResidentes()
    } catch (err: any) {
      console.error('[AdminResidentes] Error al guardar residente:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al guardar cambios: ${err.message || 'Error desconocido'}`
      })
    } finally {
      setGuardando(false)
    }
  }

  // ── Filtros ──────
  const filtrados = residentes.filter(r => {
    const matchText = (
      r.apartamento.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.propietario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.inquilino?.nombre.toLowerCase().includes(busqueda.toLowerCase()) ?? false)
    )
    if (!matchText) return false

    if (filtroTipo === 'con_usuario') return r.tiene_usuario
    if (filtroTipo === 'ph') return r.es_ph
    return true
  })

  const conUsuarioCount = residentes.filter(r => r.tiene_usuario).length
  const phCount = residentes.filter(r => r.es_ph).length

  const getDeudaColor = (meses: number) => {
    if (meses === 0) return '#10b981' // Verde
    if (meses === 1) return '#f59e0b' // Amarillo
    return '#ef4444' // Rojo
  }

  const getOcupacionLabel = (estado: string) => {
    if (estado === 'ocupado_propietario') return 'Ocupado (Propietario)'
    if (estado === 'alquilado') return 'Alquilado'
    return 'Desocupado'
  }

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🏠 Gestión de Residentes y Apartamentos</h1>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>
            Control de los {residentes.length} apartamentos de la Torre, alícuotas de prorrateo (% regular vs PH) y residentes registrados
          </p>
        </div>
        <button
          onClick={cargarResidentes}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#fff',
            border: '1px solid #333',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🔄 Actualizar Lista
        </button>
      </div>

      {deleteMessage && (
        <div style={{
          backgroundColor: deleteMessage.type === 'success' ? '#10b98120' : '#ef444420',
          color: deleteMessage.type === 'success' ? '#10b981' : '#ef4444',
          border: `1px solid ${deleteMessage.type === 'success' ? '#10b98140' : '#ef444440'}`,
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '16px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{deleteMessage.text}</span>
          <button
            onClick={() => setDeleteMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid Principal */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        
        {/* Columna Izquierda: Lista de Apartamentos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
          
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por número o nombre..."
            style={inputStyle}
          />

          {/* Filtros rápidos */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setFiltroTipo('todos')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filtroTipo === 'todos' ? '#f97316' : '#1e1e1e',
                color: filtroTipo === 'todos' ? '#fff' : '#888',
              }}
            >
              Todos ({residentes.length})
            </button>
            <button
              onClick={() => setFiltroTipo('con_usuario')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filtroTipo === 'con_usuario' ? '#10b981' : '#1e1e1e',
                color: filtroTipo === 'con_usuario' ? '#fff' : '#888',
              }}
            >
              Con Usuario ({conUsuarioCount})
            </button>
            <button
              onClick={() => setFiltroTipo('ph')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filtroTipo === 'ph' ? '#8b5cf6' : '#1e1e1e',
                color: filtroTipo === 'ph' ? '#fff' : '#888',
              }}
            >
              PH ({phCount})
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '30px', fontSize: '13px' }}>
                Cargando apartamentos del condominio...
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '40px 20px', backgroundColor: '#141414', borderRadius: '12px', border: '1px solid #1e1e1e' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>No se encontraron apartamentos.</p>
              </div>
            ) : (
              filtrados.map(r => {
                const isSelected = selected?.id === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setEditMode(false) }}
                    style={{
                      backgroundColor: '#141414',
                      border: `1px solid ${isSelected ? '#f97316' : '#1e1e1e'}`,
                      borderRadius: '12px',
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      borderLeft: `4px solid ${isSelected ? '#f97316' : r.es_ph ? '#8b5cf6' : '#333'}`,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>Apto {r.apartamento}</span>
                        {r.es_ph && (
                          <span style={{ fontSize: '10px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '1px 6px', borderRadius: '4px' }}>
                            PH
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: '#f97316', fontWeight: 700, backgroundColor: '#f9731615', padding: '1px 6px', borderRadius: '4px' }}>
                          {formatAlicuotaPct(r.alicuota)}
                        </span>
                      </div>
                      
                      <p style={{ color: r.tiene_usuario ? '#ccc' : '#666', fontSize: '12px', marginTop: '4px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {r.propietario.nombre}
                      </p>

                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: r.estado_ocupacion === 'alquilado' ? '#3b82f620' : r.tiene_usuario ? '#10b98120' : '#222',
                          color: r.estado_ocupacion === 'alquilado' ? '#60a5fa' : r.tiene_usuario ? '#34d399' : '#888',
                        }}>
                          {r.estado_ocupacion === 'alquilado' ? '🔑 Inquilino' : r.tiene_usuario ? '🏡 Registrado' : '⚪ Sin cuenta'}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#777', fontSize: '11px', margin: 0 }}>
                        {r.historial_pagos.length} pago{r.historial_pagos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Columna Derecha: Panel de Detalles o Formulario */}
        <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '28px', overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '32px' }}>👥</span>
              <p>Selecciona un apartamento para ver o editar sus datos</p>
            </div>
          ) : editMode && form ? (
            /* Modo Edición */
            <form onSubmit={handleGuardar}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: 0 }}>
                    Editar Apto {form.apartamento} {form.es_ph ? '(Penthouse)' : ''}
                  </h2>
                  <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
                    Edición de alícuota de cobro, datos de habitabilidad y residentes
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setEditMode(false)} style={{ background: '#2a2a2a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardando} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', opacity: guardando ? 0.6 : 1 }}>
                    {guardando ? 'Guardando...' : '💾 Guardar Cambios'}
                  </button>
                </div>
              </div>

              {/* CARD DE ALÍCUOTA EDITABLE */}
              <div style={{ backgroundColor: '#0a0a0a', padding: '18px 20px', borderRadius: '12px', border: '1px solid #f9731640', marginBottom: '24px' }}>
                <h3 style={{ color: '#f97316', fontSize: '14px', fontWeight: 700, margin: '0 0 10px' }}>
                  📊 Alícuota del Apartamento (%)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '16px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      max="100"
                      style={{ ...inputStyle, fontSize: '16px', fontWeight: 700, paddingRight: '32px' }}
                      value={form.alicuota_input}
                      onChange={e => setForm({ ...form, alicuota_input: e.target.value })}
                      placeholder="1.59"
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#f97316', fontWeight: 800 }}>%</span>
                  </div>
                  <div style={{ color: '#aaa', fontSize: '12px' }}>
                    <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 600 }}>
                      {form.es_ph ? '⭐ Apartamento Penthouse: paga más por metraje (ej: 2.59%)' : 'Apartamento regular: alícuota estándar (ej: 1.59%)'}
                    </p>
                    <p style={{ margin: 0, color: '#777' }}>
                      Este porcentaje se aplica de forma automática al generar los recibos mensuales de cobro para calcular el monto en Bs y USD.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Estado de Ocupación</label>
                  <select style={inputStyle} value={form.estado_ocupacion} onChange={e => setForm({ ...form, estado_ocupacion: e.target.value as any })}>
                    <option value="ocupado_propietario">Ocupado (Propietario)</option>
                    <option value="alquilado">Alquilado</option>
                    <option value="desocupado">Desocupado</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Meses de Deuda (Control interno)</label>
                  <input type="number" style={inputStyle} value={form.meses_deuda} onChange={e => setForm({ ...form, meses_deuda: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                <h3 style={{ color: '#f97316', fontSize: '14px', marginBottom: '12px', marginTop: 0 }}>Datos del Propietario</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Nombre del Propietario</label>
                    <input style={inputStyle} value={form.propietario.nombre} onChange={e => setForm({ ...form, propietario: { ...form.propietario, nombre: e.target.value } })} placeholder="Nombre completo" />
                  </div>
                  <div>
                    <label style={labelStyle}>Teléfono de Contacto</label>
                    <input style={inputStyle} value={form.propietario.telefono} onChange={e => setForm({ ...form, propietario: { ...form.propietario, telefono: e.target.value } })} placeholder="0414-XXXXXXX" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Correo Electrónico (Opcional)</label>
                    <input style={inputStyle} value={form.propietario.email} onChange={e => setForm({ ...form, propietario: { ...form.propietario, email: e.target.value } })} placeholder="ejemplo@correo.com" />
                  </div>
                </div>
              </div>

              {form.estado_ocupacion === 'alquilado' && (
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                  <h3 style={{ color: '#60a5fa', fontSize: '14px', marginBottom: '12px', marginTop: 0 }}>Datos del Inquilino / Responsable</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <input style={inputStyle} value={form.inquilino?.nombre || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { telefono: '', email: '' }), nombre: e.target.value } })} placeholder="Nombre inquilino" />
                    <input style={inputStyle} value={form.inquilino?.telefono || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { nombre: '', email: '' }), telefono: e.target.value } })} placeholder="Teléfono inquilino" />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Notas Internas (Solo Admin)</label>
                <textarea rows={3} style={{ ...inputStyle, resize: 'none' }} value={form.notas_internas} onChange={e => setForm({ ...form, notas_internas: e.target.value })} placeholder="Escribe detalles importantes sobre este inmueble..." />
              </div>
            </form>
          ) : (
            /* Modo Vista de Detalle */
            <div>
              {/* Header del seleccionado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>
                      Apto {selected.apartamento}
                    </h2>
                    {selected.es_ph && (
                      <span style={{ fontSize: '12px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '2px 8px', borderRadius: '6px' }}>
                        PENTHOUSE (PH)
                      </span>
                    )}
                    {selected.piso && (
                      <span style={{ color: '#888', fontSize: '13px', fontWeight: 600 }}>
                        Piso {selected.piso}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: selected.estado_ocupacion === 'alquilado' ? '#3b82f620' : '#10b98120',
                      color: selected.estado_ocupacion === 'alquilado' ? '#60a5fa' : '#34d399',
                    }}>
                      {getOcupacionLabel(selected.estado_ocupacion)}
                    </span>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: selected.tiene_usuario ? '#10b98115' : '#33333330',
                      color: selected.tiene_usuario ? '#10b981' : '#888',
                      border: '1px solid #2a2a2a'
                    }}>
                      {selected.tiene_usuario ? 'Cuenta de Usuario Activa' : 'Sin Usuario Web Registrado'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => { setForm({ ...selected }); setEditMode(true) }}
                    style={{
                      backgroundColor: '#f97316',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    ✏️ Editar Alícuota y Datos
                  </button>

                  {selected.tiene_usuario && (
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      🗑️ Borrar Usuario
                    </button>
                  )}
                </div>
              </div>

              {/* CARD DESTACADO: ALÍCUOTA DEL INMUEBLE */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '20px 24px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                    Alícuota de Condominio
                  </span>
                  <div style={{ color: '#f97316', fontSize: '28px', fontWeight: 900, marginTop: '2px' }}>
                    {formatAlicuotaPct(selected.alicuota)}
                  </div>
                  <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
                    {selected.es_ph
                      ? '⭐ Tarifa especial Penthouse: cuota superior por metraje total'
                      : 'Cuota de prorrateo para gastos mensuales del edificio'}
                  </p>
                </div>
                <button
                  onClick={() => { setForm({ ...selected }); setEditMode(true) }}
                  style={{
                    backgroundColor: '#1e1e1e',
                    color: '#f97316',
                    border: '1px solid #f9731640',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  Modificar %
                </button>
              </div>

              {/* Status Banner */}
              <div style={{
                backgroundColor: `${getDeudaColor(selected.meses_deuda)}15`,
                border: `1px solid ${getDeudaColor(selected.meses_deuda)}30`,
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ fontSize: '28px' }}>{selected.meses_deuda === 0 ? '✅' : '⚠️'}</div>
                <div>
                  <h3 style={{ color: getDeudaColor(selected.meses_deuda), margin: 0, fontSize: '15px' }}>Estado Financiero</h3>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '2px', margin: 0 }}>
                    {selected.meses_deuda === 0 ? 'El apartamento se encuentra solvente con sus cuotas.' : `Presenta morosidad.`}
                  </p>
                </div>
              </div>

              {/* Info Grid Propietario / Inquilino */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h3 style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>
                    Propietario
                  </h3>
                  <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px', margin: '0 0 6px' }}>{selected.propietario.nombre}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 4px' }}>📞 {selected.propietario.telefono}</p>
                  {selected.propietario.email && (
                    <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>✉️ {selected.propietario.email}</p>
                  )}
                </div>

                {selected.estado_ocupacion === 'alquilado' && selected.inquilino && (
                  <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                    <h3 style={{ color: '#60a5fa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>
                      Inquilino / Responsable
                    </h3>
                    <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px', margin: '0 0 6px' }}>{selected.inquilino.nombre}</p>
                    <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>📞 {selected.inquilino.telefono}</p>
                  </div>
                )}
              </div>

              {/* Historial de Pagos del Residente */}
              <div>
                <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '16px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
                  💳 Historial de Pagos del Apartamento ({selected.historial_pagos.length})
                </h3>
                {selected.historial_pagos.length === 0 ? (
                  <div style={{ backgroundColor: '#0a0a0a', padding: '20px', borderRadius: '12px', border: '1px solid #2a2a2a', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                    No hay pagos registrados para este apartamento todavía.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selected.historial_pagos.map((p) => (
                      <div key={p.id} style={{
                        backgroundColor: '#0a0a0a',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: '1px solid #2a2a2a',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: p.estado === 'aprobado' ? '#10b981' : p.estado === 'pendiente' ? '#f59e0b' : '#ef4444'
                          }} />
                          <div>
                            <p style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0 }}>{p.monto}</p>
                            <p style={{ color: '#777', fontSize: '12px', margin: '2px 0 0' }}>Ref: {p.referencia} · {new Date(p.fecha).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: p.estado === 'aprobado' ? '#10b98120' : p.estado === 'pendiente' ? '#f59e0b20' : '#ef444420',
                            color: p.estado === 'aprobado' ? '#10b981' : p.estado === 'pendiente' ? '#f59e0b' : '#ef4444',
                          }}>
                            {p.estado.toUpperCase()}
                          </span>
                          {p.estado === 'pendiente' && (
                            <button
                              onClick={() => navigate('/admin/recibos?filtro=pendiente')}
                              style={{
                                backgroundColor: '#f59e0b',
                                color: '#000',
                                border: 'none',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ⚡ Gestionar en Recibos →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Modal de Borrado */}
      {showDeleteModal && selected && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          }}>
            <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 12px' }}>
              ¿Eliminar usuario del Apto {selected.apartamento}?
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
              Se eliminará la cuenta de usuario de <strong style={{ color: '#fff' }}>{selected.propietario.nombre}</strong>. El apartamento continuará registrado en el edificio con su alícuota intacta.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarUsuario}
                disabled={deleting}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
              >
                {deleting ? 'Eliminando...' : 'Sí, Eliminar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
