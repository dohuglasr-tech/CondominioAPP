import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'

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
  apartamento_id?: string
  apartamento: string
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
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#888',
  fontSize: '12px',
  marginBottom: '6px',
}

export const AdminResidentes: React.FC = () => {
  const [residentes, setResidentes] = useState<Residente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState<Residente | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Residente | null>(null)

  // Estado para modal de borrado de usuario
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Cargar residentes reales desde Supabase ───────────────────
  const cargarResidentes = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Obtener perfiles con su apartamento
      const { data: perfilesData, error: pError } = await supabase
        .from('perfiles')
        .select(`
          id,
          nombre_completo,
          cedula,
          telefono,
          condicion_habitacional,
          carga_familiar,
          propietario_nombre,
          propietario_cedula,
          propietario_telefono,
          propietario_email,
          apartamento_id,
          created_at,
          apartamentos:apartamento_id (
            id,
            numero,
            estado
          )
        `)
        .order('created_at', { ascending: false })

      if (pError) {
        console.warn('[AdminResidentes] Error cargando perfiles:', pError.message)
      }

      // 2. Obtener pagos reportados
      const { data: pagosData } = await supabase
        .from('pagos_reportados')
        .select('id, monto_bs, referencia, estado, fecha_pago, reportado_por, created_at')
        .order('created_at', { ascending: false })

      const pagosPorUsuario = new Map<string, PagoHistorial[]>()
      if (pagosData) {
        pagosData.forEach((p: any) => {
          const uId = p.reportado_por
          if (!pagosPorUsuario.has(uId)) pagosPorUsuario.set(uId, [])
          pagosPorUsuario.get(uId)!.push({
            id: p.id,
            fecha: p.fecha_pago || p.created_at,
            mes: new Date(p.created_at).toLocaleDateString('es-VE', { month: 'short', year: 'numeric' }),
            monto: `Bs. ${(p.monto_bs || 0).toLocaleString()}`,
            referencia: p.referencia || 'S/R',
            estado: p.estado || 'pendiente',
          })
        })
      }

      // 3. Mapear datos a la estructura Residente
      if (perfilesData && perfilesData.length > 0) {
        const lista: Residente[] = perfilesData.map((p: any) => {
          const aptoNum = p.apartamentos?.numero || 'Sin asignar'
          const esAlquilado = p.condicion_habitacional === 'alquilado'
          const pagosUsuario = pagosPorUsuario.get(p.id) || []

          return {
            id: p.id,
            apartamento_id: p.apartamento_id,
            apartamento: aptoNum,
            estado_ocupacion: esAlquilado ? 'alquilado' : 'ocupado_propietario',
            meses_deuda: 0,
            notas_internas: '',
            propietario: {
              nombre: esAlquilado ? (p.propietario_nombre || 'N/D') : (p.nombre_completo || 'Sin nombre registrado'),
              telefono: esAlquilado ? (p.propietario_telefono || 'N/D') : (p.telefono || 'Sin teléfono'),
              email: esAlquilado ? (p.propietario_email || 'N/D') : '',
            },
            inquilino: esAlquilado ? {
              nombre: p.nombre_completo || 'Inquilino sin nombre',
              telefono: p.telefono || 'N/D',
              email: '',
            } : undefined,
            historial_pagos: pagosUsuario,
            reportes_abiertos: 0,
            created_at: p.created_at,
          }
        })
        setResidentes(lista)
        if (lista.length > 0 && !selected) {
          setSelected(lista[0])
        }
      } else {
        setResidentes([])
      }
    } catch (err: any) {
      console.error('[AdminResidentes] Error general:', err)
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    cargarResidentes()
  }, [cargarResidentes])

  // ── Eliminar usuario por completo (Base de Datos + Auth) ──────
  const handleEliminarUsuario = async () => {
    if (!selected) return
    setDeleting(true)
    setDeleteMessage(null)

    try {
      // 1. Intentar llamar a la función RPC admin_delete_user
      const { error: rpcError } = await supabase.rpc('admin_delete_user', {
        target_user_id: selected.id,
      })

      if (rpcError) {
        console.warn('[AdminResidentes] RPC no disponible o falló:', rpcError.message)
        // Fallback: eliminar directamente perfiles y pagos asociados
        await supabase.from('pagos_reportados').delete().eq('reportado_por', selected.id)
        const { error: delPerfilesErr } = await supabase.from('perfiles').delete().eq('id', selected.id)
        if (delPerfilesErr) throw delPerfilesErr
      }

      setDeleteMessage({
        type: 'success',
        text: `El usuario del Apto ${selected.apartamento} fue eliminado por completo de la base de datos.`,
      })

      setShowDeleteModal(false)
      setSelected(null)
      await cargarResidentes()
    } catch (err: any) {
      console.error('[AdminResidentes] Error eliminando usuario:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al eliminar el usuario: ${err.message || 'Intente nuevamente'}. Recuerda ejecutar migration_v5.sql en Supabase.`,
      })
    } finally {
      setDeleting(false)
    }
  }

  const filtrados = residentes.filter(r =>
    r.apartamento.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.propietario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (r.inquilino?.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  )

  const getDeudaColor = (meses: number) => {
    if (meses === 0) return '#10b981' // Verde (Solvente)
    if (meses === 1) return '#f59e0b' // Amarillo (1 mes)
    return '#ef4444' // Rojo (> 1 mes)
  }

  const getOcupacionLabel = (estado: string) => {
    if (estado === 'ocupado_propietario') return 'Ocupado (Propietario)'
    if (estado === 'alquilado') return 'Alquilado'
    return 'Desocupado'
  }

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setResidentes(prev => prev.map(r => (r.id === form.id ? form : r)))
    setSelected(form)
    setEditMode(false)
  }

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🏠 Gestión de Residentes y Usuarios</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Control de usuarios registrados, condiciones de habitación y borrado permanente de datos
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
          marginBottom: '20px',
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

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        
        {/* Lista Lateral */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar apartamento o nombre..."
            style={inputStyle}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '30px', fontSize: '13px' }}>
                Cargando residentes desde la base de datos...
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '40px 20px', backgroundColor: '#141414', borderRadius: '12px', border: '1px solid #1e1e1e' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>No hay residentes registrados.</p>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#555' }}>Los usuarios que se registren aparecerán aquí automáticamente.</p>
              </div>
            ) : (
              filtrados.map(r => {
                const color = getDeudaColor(r.meses_deuda)
                const isSelected = selected?.id === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setEditMode(false) }}
                    style={{
                      backgroundColor: '#141414',
                      border: `1px solid ${isSelected ? '#f97316' : '#1e1e1e'}`,
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      borderLeft: `4px solid ${isSelected ? '#f97316' : color}`,
                    }}
                  >
                    <div>
                      <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>Apto {r.apartamento}</p>
                      <p style={{ color: '#888', fontSize: '12px', marginTop: '4px', margin: 0 }}>{r.propietario.nombre}</p>
                      <span style={{
                        display: 'inline-block',
                        marginTop: '6px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: r.estado_ocupacion === 'alquilado' ? '#3b82f620' : '#10b98120',
                        color: r.estado_ocupacion === 'alquilado' ? '#60a5fa' : '#34d399',
                      }}>
                        {r.estado_ocupacion === 'alquilado' ? '🔑 Inquilino' : '🏡 Propietario'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: '#aaa', fontSize: '11px', margin: 0 }}>
                        {r.historial_pagos.length} pago{r.historial_pagos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Panel de Detalles */}
        <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '28px', overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '32px' }}>👥</span>
              <p>Selecciona un apartamento para ver los datos del usuario</p>
            </div>
          ) : editMode && form ? (
            <form onSubmit={handleGuardar}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0 }}>Editar Apto {form.apartamento}</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setEditMode(false)} style={{ background: '#2a2a2a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" style={{ background: '#f97316', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Guardar</button>
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
                  <label style={labelStyle}>Meses de Deuda (Control manual)</label>
                  <input type="number" style={inputStyle} value={form.meses_deuda} onChange={e => setForm({ ...form, meses_deuda: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                <h3 style={{ color: '#f97316', fontSize: '14px', marginBottom: '12px', marginTop: 0 }}>Datos del Propietario</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <input style={inputStyle} value={form.propietario.nombre} onChange={e => setForm({ ...form, propietario: { ...form.propietario, nombre: e.target.value } })} placeholder="Nombre" />
                  <input style={inputStyle} value={form.propietario.telefono} onChange={e => setForm({ ...form, propietario: { ...form.propietario, telefono: e.target.value } })} placeholder="Teléfono" />
                  <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={form.propietario.email} onChange={e => setForm({ ...form, propietario: { ...form.propietario, email: e.target.value } })} placeholder="Email" />
                </div>
              </div>

              {form.estado_ocupacion === 'alquilado' && (
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                  <h3 style={{ color: '#60a5fa', fontSize: '14px', marginBottom: '12px', marginTop: 0 }}>Datos del Inquilino / Responsable</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <input style={inputStyle} value={form.inquilino?.nombre || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { telefono: '', email: '' }), nombre: e.target.value } })} placeholder="Nombre" />
                    <input style={inputStyle} value={form.inquilino?.telefono || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { nombre: '', email: '' }), telefono: e.target.value } })} placeholder="Teléfono" />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Notas Internas (Solo Admin)</label>
                <textarea rows={4} style={{ ...inputStyle, resize: 'none' }} value={form.notas_internas} onChange={e => setForm({ ...form, notas_internas: e.target.value })} placeholder="Escribe detalles importantes..." />
              </div>
            </form>
          ) : (
            <div>
              {/* Header del seleccionado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>Apto {selected.apartamento}</h2>
                  <span style={{
                    display: 'inline-block',
                    marginTop: '8px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: selected.estado_ocupacion === 'alquilado' ? '#3b82f620' : '#10b98120',
                    color: selected.estado_ocupacion === 'alquilado' ? '#60a5fa' : '#34d399',
                  }}>
                    {getOcupacionLabel(selected.estado_ocupacion)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => { setForm(selected); setEditMode(true) }}
                    style={{
                      backgroundColor: '#2a2a2a',
                      color: '#fff',
                      border: '1px solid #333',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    ✏️ Editar Datos
                  </button>

                  {/* BOTÓN PARA BORRAR USUARIO POR COMPLETO */}
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    🗑️ Borrar Usuario por Completo
                  </button>
                </div>
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
                <div style={{ fontSize: '32px' }}>{selected.meses_deuda === 0 ? '✅' : selected.meses_deuda === 1 ? '⚠️' : '🚨'}</div>
                <div>
                  <h3 style={{ color: getDeudaColor(selected.meses_deuda), margin: 0, fontSize: '16px' }}>Estado Financiero</h3>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '4px', margin: 0 }}>
                    {selected.meses_deuda === 0 ? 'El apartamento se encuentra solvente con sus pagos.' : `Presenta una morosidad de ${selected.meses_deuda} mes${selected.meses_deuda > 1 ? 'es' : ''}.`}
                  </p>
                </div>
              </div>

              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', marginTop: 0 }}>Propietario</h3>
                  <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px', margin: '0 0 6px' }}>{selected.propietario.nombre}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 4px' }}>📞 {selected.propietario.telefono}</p>
                  {selected.propietario.email && (
                    <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>✉️ {selected.propietario.email}</p>
                  )}
                </div>

                {selected.estado_ocupacion === 'alquilado' && selected.inquilino && (
                  <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                    <h3 style={{ color: '#60a5fa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', marginTop: 0 }}>Inquilino / Responsable</h3>
                    <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px', margin: '0 0 6px' }}>{selected.inquilino.nombre}</p>
                    <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>📞 {selected.inquilino.telefono}</p>
                  </div>
                )}
              </div>

              {/* Historial de Pagos del Residente */}
              <div>
                <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '16px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
                  💳 Historial de Pagos Reportados
                </h3>
                {selected.historial_pagos.length === 0 ? (
                  <div style={{ backgroundColor: '#0a0a0a', padding: '20px', borderRadius: '12px', border: '1px solid #2a2a2a', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                    No hay pagos registrados para este usuario.
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN PARA BORRAR USUARIO POR COMPLETO */}
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
            backgroundColor: '#141414',
            border: '1px solid #ef444450',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px', textAlign: 'center' }}>⚠️</div>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: '0 0 12px 0', textAlign: 'center' }}>
              ¿Eliminar usuario por completo?
            </h2>
            <p style={{ color: '#aaa', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px', textAlign: 'center' }}>
              Esta acción es <strong style={{ color: '#ef4444' }}>permanente e irreversible</strong>. Se eliminará por completo:
            </p>
            
            <ul style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.8', marginBottom: '24px', paddingLeft: '20px' }}>
              <li>La cuenta de acceso del usuario (Supabase Auth)</li>
              <li>El perfil del residente (nombre, cédula, teléfono)</li>
              <li>Los pagos asociados reportados por este usuario</li>
              <li>El <strong>Apartamento {selected.apartamento}</strong> quedará liberado para que otro usuario pueda registrarse</li>
            </ul>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                style={{
                  backgroundColor: '#2a2a2a',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleEliminarUsuario}
                style={{
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar de la BD'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
