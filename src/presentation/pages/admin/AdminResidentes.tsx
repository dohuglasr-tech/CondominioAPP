import React, { useState } from 'react'

interface PersonaContacto {
  nombre: string
  telefono: string
  email: string
}

interface PagoHistorial {
  fecha: string
  mes: string
  monto: string
  estado: 'aprobado' | 'pendiente' | 'rechazado'
}

interface Residente {
  id: string
  apartamento: string
  estado_ocupacion: 'ocupado_propietario' | 'alquilado' | 'desocupado'
  meses_deuda: number
  notas_internas: string
  propietario: PersonaContacto
  inquilino?: PersonaContacto
  historial_pagos: PagoHistorial[]
  reportes_abiertos: number
}

const MOCK_RESIDENTES: Residente[] = [
  {
    id: '1', apartamento: '1-A', estado_ocupacion: 'ocupado_propietario', meses_deuda: 0,
    notas_internas: 'Propietario muy colaborador, siempre paga a tiempo.',
    propietario: { nombre: 'María González', telefono: '0412-1234567', email: 'maria@email.com' },
    historial_pagos: [
      { fecha: '2026-09-05', mes: 'Septiembre', monto: '12.91$', estado: 'aprobado' },
      { fecha: '2026-08-03', mes: 'Agosto', monto: '11.50$', estado: 'aprobado' }
    ], reportes_abiertos: 0
  },
  {
    id: '2', apartamento: '2-B', estado_ocupacion: 'alquilado', meses_deuda: 1,
    notas_internas: 'El inquilino a veces se atrasa unos días, contactar al propietario si pasa del día 10.',
    propietario: { nombre: 'Carlos Rodríguez', telefono: '0414-9876543', email: 'carlos@email.com' },
    inquilino: { nombre: 'Pedro Sánchez', telefono: '0424-1112233', email: 'pedro@email.com' },
    historial_pagos: [
      { fecha: '2026-08-12', mes: 'Agosto', monto: '11.50$', estado: 'aprobado' }
    ], reportes_abiertos: 1
  },
  {
    id: '3', apartamento: '3-C', estado_ocupacion: 'desocupado', meses_deuda: 3,
    notas_internas: 'Apartamento en venta. Propietario fuera del país, muy difícil de contactar.',
    propietario: { nombre: 'Ana Martínez', telefono: '+34-600123456', email: 'ana@email.com' },
    historial_pagos: [], reportes_abiertos: 0
  }
]

const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }
const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }

export const AdminResidentes: React.FC = () => {
  const [residentes, setResidentes] = useState<Residente[]>(MOCK_RESIDENTES)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState<Residente | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Residente | null>(null)

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
    setResidentes(prev => prev.map(r => r.id === form.id ? form : r))
    setSelected(form)
    setEditMode(false)
  }

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🏠 Gestión de Apartamentos</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Control de morosidad y datos de contacto</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Lista Lateral */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar apartamento o nombre..."
            style={inputStyle}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {filtrados.map(r => {
              const color = getDeudaColor(r.meses_deuda)
              const isSelected = selected?.id === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setEditMode(false) }}
                  style={{
                    backgroundColor: '#141414', border: `1px solid ${isSelected ? color : '#1e1e1e'}`, borderRadius: '12px', padding: '16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s', borderLeft: `4px solid ${color}`
                  }}
                >
                  <div>
                    <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>Apto {r.apartamento}</p>
                    <p style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{r.propietario.nombre}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color, fontSize: '12px', fontWeight: 700 }}>
                      {r.meses_deuda === 0 ? 'Solvente' : `${r.meses_deuda} mes${r.meses_deuda > 1 ? 'es' : ''} atraso`}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel de Detalles */}
        <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px', overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
              Selecciona un apartamento para ver los detalles
            </div>
          ) : editMode && form ? (
            <form onSubmit={handleGuardar}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>Editar Apto {form.apartamento}</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setEditMode(false)} style={{ background: '#2a2a2a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" style={{ background: '#f97316', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Guardar</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Estado de Ocupación</label>
                  <select style={inputStyle} value={form.estado_ocupacion} onChange={e => setForm({...form, estado_ocupacion: e.target.value as any})}>
                    <option value="ocupado_propietario">Ocupado (Propietario)</option>
                    <option value="alquilado">Alquilado</option>
                    <option value="desocupado">Desocupado</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Meses de Deuda (Forzar manual)</label>
                  <input type="number" style={inputStyle} value={form.meses_deuda} onChange={e => setForm({...form, meses_deuda: parseInt(e.target.value) || 0})} />
                </div>
              </div>

              <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                <h3 style={{ color: '#f97316', fontSize: '14px', marginBottom: '12px' }}>Datos del Propietario</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <input style={inputStyle} value={form.propietario.nombre} onChange={e => setForm({...form, propietario: {...form.propietario, nombre: e.target.value}})} placeholder="Nombre" />
                  <input style={inputStyle} value={form.propietario.telefono} onChange={e => setForm({...form, propietario: {...form.propietario, telefono: e.target.value}})} placeholder="Teléfono" />
                  <input style={{...inputStyle, gridColumn: '1 / -1'}} value={form.propietario.email} onChange={e => setForm({...form, propietario: {...form.propietario, email: e.target.value}})} placeholder="Email" />
                </div>
              </div>

              {form.estado_ocupacion === 'alquilado' && (
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
                  <h3 style={{ color: '#10b981', fontSize: '14px', marginBottom: '12px' }}>Datos del Inquilino / Responsable</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <input style={inputStyle} value={form.inquilino?.nombre || ''} onChange={e => setForm({...form, inquilino: {...(form.inquilino || {telefono:'', email:''}), nombre: e.target.value}})} placeholder="Nombre" />
                    <input style={inputStyle} value={form.inquilino?.telefono || ''} onChange={e => setForm({...form, inquilino: {...(form.inquilino || {nombre:'', email:''}), telefono: e.target.value}})} placeholder="Teléfono" />
                    <input style={{...inputStyle, gridColumn: '1 / -1'}} value={form.inquilino?.email || ''} onChange={e => setForm({...form, inquilino: {...(form.inquilino || {nombre:'', telefono:''}), email: e.target.value}})} placeholder="Email" />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Notas Internas (Solo Admin)</label>
                <textarea rows={4} style={{...inputStyle, resize: 'none'}} value={form.notas_internas} onChange={e => setForm({...form, notas_internas: e.target.value})} placeholder="Escribe detalles importantes..." />
              </div>
            </form>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>Apto {selected.apartamento}</h2>
                  <span style={{ display: 'inline-block', marginTop: '8px', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, backgroundColor: '#2a2a2a', color: '#fff' }}>
                    {getOcupacionLabel(selected.estado_ocupacion)}
                  </span>
                </div>
                <button onClick={() => { setForm(selected); setEditMode(true) }} style={{ backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #333', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  ✏️ Editar Datos
                </button>
              </div>

              {/* Status Banner */}
              <div style={{ backgroundColor: `${getDeudaColor(selected.meses_deuda)}15`, border: `1px solid ${getDeudaColor(selected.meses_deuda)}30`, padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '32px' }}>{selected.meses_deuda === 0 ? '✅' : selected.meses_deuda === 1 ? '⚠️' : '🚨'}</div>
                <div>
                  <h3 style={{ color: getDeudaColor(selected.meses_deuda), margin: 0, fontSize: '16px' }}>Estado Financiero</h3>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '4px' }}>
                    {selected.meses_deuda === 0 ? 'El apartamento se encuentra solvente con sus pagos.' : `Presenta una morosidad de ${selected.meses_deuda} mes${selected.meses_deuda > 1 ? 'es' : ''}.`}
                  </p>
                </div>
              </div>

              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Propietario</h3>
                  <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{selected.propietario.nombre}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '6px' }}>📞 {selected.propietario.telefono}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '4px' }}>✉️ {selected.propietario.email}</p>
                </div>
                {selected.estado_ocupacion === 'alquilado' && selected.inquilino && (
                  <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                    <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Inquilino / Responsable</h3>
                    <p style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{selected.inquilino.nombre}</p>
                    <p style={{ color: '#aaa', fontSize: '13px', marginTop: '6px' }}>📞 {selected.inquilino.telefono}</p>
                    <p style={{ color: '#aaa', fontSize: '13px', marginTop: '4px' }}>✉️ {selected.inquilino.email}</p>
                  </div>
                )}
              </div>

              {/* Notas Internas */}
              {selected.notas_internas && (
                <div style={{ backgroundColor: '#f9731610', padding: '16px', borderRadius: '12px', border: '1px dashed #f9731640', marginBottom: '24px' }}>
                  <h3 style={{ color: '#f97316', fontSize: '13px', marginBottom: '8px' }}>📝 Notas Internas (Solo Admin)</h3>
                  <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.5' }}>{selected.notas_internas}</p>
                </div>
              )}

              {/* Actividad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>Timelap de Pagos</h3>
                  {selected.historial_pagos.length === 0 ? (
                    <p style={{ color: '#666', fontSize: '13px' }}>No hay pagos registrados recientes.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selected.historial_pagos.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: p.estado === 'aprobado' ? '#10b981' : '#f59e0b' }} />
                          <div>
                            <p style={{ color: '#ddd', fontSize: '13px' }}>{p.mes} - {p.monto}</p>
                            <p style={{ color: '#777', fontSize: '11px' }}>{new Date(p.fecha).toLocaleDateString()} · {p.estado}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>Estado de Quejas/Reportes</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                    <span style={{ fontSize: '24px' }}>{selected.reportes_abiertos > 0 ? '📢' : '✅'}</span>
                    <div>
                      <p style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>{selected.reportes_abiertos} reportes activos</p>
                      <p style={{ color: '#888', fontSize: '12px' }}>En proceso de resolución.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
