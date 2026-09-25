import React, { useState } from 'react'
import { useBcvRate } from '../../../data/useBcvRate'
// supabase se usará cuando se conecte la DB real
// import { supabase } from '../../../data/supabase'

interface GastoForm {
  descripcion: string
  categoria: string
  monto_usd: string
  mes_aplicacion: string
  tipo: string
  notas: string
}

const CATEGORIAS = ['agua', 'luz', 'gas', 'espacios_comunes', 'imprevistos', 'administracion', 'conserjeria', 'servicios_externos', 'reparaciones']
const TIPOS = ['ordinario', 'extraordinario', 'fondo_reserva']

const GASTOS_MOCK: any[] = []

const EMPTY_FORM: GastoForm = { descripcion: '', categoria: 'luz', monto_usd: '', mes_aplicacion: new Date().toISOString().slice(0, 7), tipo: 'ordinario', notas: '' }

const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }
const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }

export const AdminGastos: React.FC = () => {
  const { rate } = useBcvRate()
  const [gastos, setGastos] = useState(GASTOS_MOCK)
  const [form, setForm] = useState<GastoForm>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.descripcion || !form.monto_usd) return
    setGuardando(true)

    // En producción:
    // await supabase.from('gastos_comunes').insert({ ...form, monto_usd: parseFloat(form.monto_usd), mes_aplicacion: form.mes_aplicacion + '-01' })
    
    const nuevo = {
      id: String(Date.now()),
      descripcion: form.descripcion,
      categoria: form.categoria,
      tipo: form.tipo,
      monto_usd: parseFloat(form.monto_usd),
      mes_aplicacion: form.mes_aplicacion + '-01'
    }
    setGastos(prev => [nuevo, ...prev])
    setForm(EMPTY_FORM)
    setShowForm(false)
    setGuardando(false)
  }

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este gasto?')) {
      setGastos(prev => prev.filter(g => g.id !== id))
    }
  }

  const totalUsd = gastos.reduce((acc, g) => acc + g.monto_usd, 0)

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>💸 Gestión de Gastos</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Registra los gastos comunes del mes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
          {showForm ? 'Cancelar' : '+ Nuevo Gasto'}
        </button>
      </div>

      {/* Tasa BCV */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px' }}>
        <span style={{ color: '#f97316', fontSize: '16px' }}>💱</span>
        <span style={{ color: '#888', fontSize: '13px' }}>Tasa BCV del día:</span>
        <span style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#f97316', padding: '6px 12px', borderRadius: '6px', fontSize: '15px', fontWeight: 800 }}>
          {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </span>
        <span style={{ color: '#888', fontSize: '13px' }}>Bs/$ — Total mes:</span>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '15px' }}>Registrar Nuevo Gasto</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descripción *</label>
              <input required style={inputStyle} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Ej. Corpoelec Septiembre 2026" />
            </div>
            <div>
              <label style={labelStyle}>Categoría</label>
              <select style={inputStyle} value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Monto en USD *</label>
              <input required type="number" style={inputStyle} value={form.monto_usd} onChange={e => setForm({...form, monto_usd: e.target.value})} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Mes de aplicación</label>
              <input type="month" style={inputStyle} value={form.mes_aplicacion} onChange={e => setForm({...form, mes_aplicacion: e.target.value})} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notas (opcional)</label>
              <input style={inputStyle} value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} placeholder="Observaciones..." />
            </div>
          </div>
          <button type="submit" disabled={guardando} style={{ marginTop: '20px', backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
            {guardando ? 'Guardando...' : '💾 Guardar Gasto'}
          </button>
        </form>
      )}

      {/* Lista de gastos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {gastos.map(g => (
          <div key={g.id} style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{g.descripcion}</p>
              <p style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{g.categoria} · {g.tipo} · {g.mes_aplicacion.slice(0, 7)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#f97316', fontSize: '15px', fontWeight: 700 }}>${g.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                <p style={{ color: '#555', fontSize: '11px' }}>Bs. {(g.monto_usd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
              </div>
              <button onClick={() => handleDelete(g.id)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
