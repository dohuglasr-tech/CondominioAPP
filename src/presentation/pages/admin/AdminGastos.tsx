import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'

interface GastoComun {
  id: string
  descripcion: string
  categoria: string
  tipo: string
  monto_usd: number
  mes_aplicacion: string
  notas?: string
}

const CATEGORIAS = ['agua','luz','gas','espacios_comunes','imprevistos','administracion','conserjeria','servicios_externos','reparaciones']
const TIPOS = ['ordinario','extraordinario','fondo_reserva']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a',
  color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }

const hoy = new Date()
const EMPTY_FORM = {
  descripcion: '', categoria: 'luz', monto_usd: '', mes_aplicacion: hoy.toISOString().slice(0, 7), tipo: 'ordinario', notas: ''
}

export const AdminGastos: React.FC = () => {
  const [gastos, setGastos] = useState<GastoComun[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tasaBcv, setTasaBcv] = useState(0)
  const [filtroMes, setFiltroMes] = useState(hoy.toISOString().slice(0, 7))

  const cargarGastos = useCallback(async () => {
    setLoading(true)
    const desde = `${filtroMes}-01`
    // calcular último día del mes
    const [aniof, mesf] = filtroMes.split('-').map(Number)
    const hasta = new Date(aniof, mesf, 0).toISOString().slice(0, 10)

    const [gastosRes, configRes] = await Promise.all([
      supabase.from('gastos_comunes').select('*')
        .gte('mes_aplicacion', desde).lte('mes_aplicacion', hasta)
        .order('created_at', { ascending: false }),
      supabase.from('configuracion_edificio').select('tasa_bcv_actual').limit(1).maybeSingle(),
    ])
    if (gastosRes.data) setGastos(gastosRes.data)
    if (configRes.data?.tasa_bcv_actual) setTasaBcv(configRes.data.tasa_bcv_actual)
    setLoading(false)
  }, [filtroMes])

  useEffect(() => { cargarGastos() }, [cargarGastos])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.descripcion || !form.monto_usd) return
    setGuardando(true)

    const payload = {
      descripcion: form.descripcion,
      categoria: form.categoria,
      tipo: form.tipo,
      monto_usd: parseFloat(form.monto_usd),
      mes_aplicacion: `${form.mes_aplicacion}-01`,
      notas: form.notas || null,
    }

    const { data, error } = await supabase.from('gastos_comunes').insert(payload).select().single()
    if (error) {
      alert('Error guardando gasto: ' + error.message)
    } else if (data) {
      setGastos(prev => [data, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
    }
    setGuardando(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('gastos_comunes').delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
  }

  const totalUsd = gastos.reduce((acc, g) => acc + g.monto_usd, 0)

  const mesNombre = (mesStr: string) => {
    const [, m] = mesStr.split('-')
    return MESES[parseInt(m) - 1] || mesStr
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>💸 Gestión de Gastos</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Registra los gastos comunes del mes — se usarán para calcular los recibos
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
          {showForm ? 'Cancelar' : '+ Nuevo Gasto'}
        </button>
      </div>

      {/* Barra de Tasa + Filtro Mes */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '10px 16px', flex: 1 }}>
          <span style={{ color: '#f97316', fontSize: '16px' }}>💱</span>
          <span style={{ color: '#888', fontSize: '13px' }}>Tasa BCV:</span>
          <span style={{ color: '#f97316', fontWeight: 800, fontSize: '15px' }}>
            {tasaBcv > 0 ? `Bs. ${tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}
          </span>
          <span style={{ color: '#888', fontSize: '13px' }}>· Total del mes:</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
            $ {totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          {tasaBcv > 0 && (
            <span style={{ color: '#555', fontSize: '12px' }}>
              = Bs. {(totalUsd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div>
          <input type="month"
            style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '10px', fontSize: '13px', outline: 'none' }}
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)} />
        </div>
        <button onClick={cargarGastos}
          style={{ backgroundColor: '#1e1e1e', color: '#ccc', border: '1px solid #2a2a2a', padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          🔄 Actualizar
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={handleSubmit}
          style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '15px', fontWeight: 700 }}>Registrar Nuevo Gasto</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descripción *</label>
              <input required style={inputStyle} value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Ej. Corpoelec Septiembre 2026" />
            </div>
            <div>
              <label style={labelStyle}>Categoría</label>
              <select style={inputStyle} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Monto en USD *</label>
              <input required type="number" style={inputStyle} value={form.monto_usd}
                onChange={e => setForm({ ...form, monto_usd: e.target.value })}
                placeholder="0.00" step="0.01" min="0" />
            </div>
            <div>
              <label style={labelStyle}>Mes de aplicación</label>
              <input type="month" style={inputStyle} value={form.mes_aplicacion}
                onChange={e => setForm({ ...form, mes_aplicacion: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notas (opcional)</label>
              <input style={inputStyle} value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })}
                placeholder="Observaciones adicionales..." />
            </div>
          </div>
          <button type="submit" disabled={guardando}
            style={{ marginTop: '20px', backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, opacity: guardando ? 0.7 : 1 }}>
            {guardando ? '⏳ Guardando...' : '💾 Guardar Gasto'}
          </button>
        </form>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <p style={{ color: '#555', textAlign: 'center', padding: '30px' }}>Cargando gastos...</p>
        ) : gastos.length === 0 ? (
          <div style={{ backgroundColor: '#141414', border: '1px dashed #2a2a2a', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <p style={{ color: '#555', fontSize: '14px' }}>No hay gastos registrados para {mesNombre(filtroMes)} {filtroMes.split('-')[0]}</p>
            <p style={{ color: '#3a3a3a', fontSize: '12px', marginTop: '6px' }}>Usa el botón "+ Nuevo Gasto" para agregar uno.</p>
          </div>
        ) : (
          gastos.map(g => (
            <div key={g.id}
              style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>{g.descripcion}</p>
                <p style={{ color: '#555', fontSize: '11px', marginTop: '3px' }}>
                  {g.categoria} · {g.tipo} · {mesNombre(g.mes_aplicacion.slice(0, 7))} {g.mes_aplicacion.slice(0, 4)}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: '#f97316', fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    $ {g.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  {tasaBcv > 0 && (
                    <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>
                      Bs. {(g.monto_usd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <button onClick={() => handleDelete(g.id)}
                  style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
                  title="Eliminar gasto">
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
