import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface GastoComun {
  id: string
  descripcion: string
  categoria: string
  tipo: string
  monto_usd: number
  monto_bs: number
  mes_aplicacion: string
  fecha_pago?: string | null
  referencia?: string | null
  pagado_por?: string | null
  autorizado_por?: string | null
  notas?: string | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS = [
  'agua','luz','gas','espacios_comunes','imprevistos',
  'administracion','conserjeria','servicios_externos','reparaciones'
]
const TIPOS = ['ordinario','extraordinario','fondo_reserva']
const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const hoy = new Date()
const EMPTY_FORM = {
  descripcion: '',
  categoria: 'espacios_comunes',
  tipo: 'ordinario',
  monto_usd: '',
  monto_bs: '',
  mes_aplicacion: hoy.toISOString().slice(0, 7),
  fecha_pago: hoy.toISOString().slice(0, 10),
  referencia: '',
  pagado_por: '',
  autorizado_por: '',
  notas: '',
}

// ─── Estilos inline ──────────────────────────────────────────────────────────
const iS: React.CSSProperties = {
  width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a',
  color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}
const lS: React.CSSProperties = {
  display: 'block', color: '#888', fontSize: '11px', fontWeight: 600,
  marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px',
}
const cardS: React.CSSProperties = {
  backgroundColor: '#141414', border: '1px solid #1e1e1e',
  borderRadius: '14px', padding: '18px 20px',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const mesNombre = (mesStr: string) => {
  const [, m] = mesStr.split('-')
  return MESES[parseInt(m) - 1] || mesStr
}

const fmtBs = (n: number) =>
  n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Componente ───────────────────────────────────────────────────────────────
export const AdminGastos: React.FC = () => {
  const [gastos, setGastos] = useState<GastoComun[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filtroMes, setFiltroMes] = useState(hoy.toISOString().slice(0, 7))
  const [expandido, setExpandido] = useState<string | null>(null)

  // ── Cargar gastos ───────────────────────────────────────────────────────
  const cargarGastos = useCallback(async () => {
    setLoading(true)
    const desde = `${filtroMes}-01`
    const [aniof, mesf] = filtroMes.split('-').map(Number)
    const hasta = new Date(aniof, mesf, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('gastos_comunes')
      .select('*')
      .gte('mes_aplicacion', desde)
      .lte('mes_aplicacion', hasta)
      .order('created_at', { ascending: false })

    if (data) setGastos(data)
    setLoading(false)
  }, [filtroMes])

  useEffect(() => { cargarGastos() }, [cargarGastos])

  // ── Guardar ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.descripcion || !form.monto_usd || !form.monto_bs) return
    setGuardando(true)

    const payload = {
      descripcion:    form.descripcion,
      categoria:      form.categoria,
      tipo:           form.tipo,
      monto_usd:      parseFloat(form.monto_usd),
      monto_bs:       parseFloat(form.monto_bs),
      mes_aplicacion: `${form.mes_aplicacion}-01`,
      fecha_pago:     form.fecha_pago || null,
      referencia:     form.referencia?.trim() || null,
      pagado_por:     form.pagado_por?.trim() || null,
      autorizado_por: form.autorizado_por?.trim() || null,
      notas:          form.notas?.trim() || null,
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

  // ── Eliminar ────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('gastos_comunes').delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
  }

  // ── Totales ─────────────────────────────────────────────────────────────
  const totalUsd = gastos.reduce((s, g) => s + (g.monto_usd || 0), 0)
  const totalBs  = gastos.reduce((s, g) => s + (g.monto_bs || 0), 0)

  return (
    <div style={{ padding: '32px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>💸 Gestión de Gastos</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Registra los egresos del mes con su monto en $ y Bs. — se usan para calcular los recibos
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM) }}
          style={{ backgroundColor: showForm ? '#2a2a2a' : '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
        >
          {showForm ? '✕ Cancelar' : '+ Nuevo Gasto'}
        </button>
      </div>

      {/* ── Barra de totales + filtro mes ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '20px', flex: 1, ...cardS, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#555', fontSize: '12px', fontWeight: 600 }}>TOTAL MES (USD):</span>
            <span style={{ color: '#f97316', fontWeight: 800, fontSize: '18px' }}>$ {fmtUsd(totalUsd)}</span>
          </div>
          <div style={{ width: '1px', backgroundColor: '#2a2a2a', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#555', fontSize: '12px', fontWeight: 600 }}>TOTAL MES (Bs):</span>
            <span style={{ color: '#10b981', fontWeight: 800, fontSize: '18px' }}>Bs. {fmtBs(totalBs)}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
            <span style={{ color: '#555', fontSize: '12px' }}>{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '10px', fontSize: '13px', outline: 'none' }} />
          <button onClick={cargarGastos}
            style={{ backgroundColor: '#1e1e1e', color: '#ccc', border: '1px solid #2a2a2a', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            🔄
          </button>
        </div>
      </div>

      {/* ── Formulario ── */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...cardS, marginBottom: '24px', border: '1px solid #f97316' + '30' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <div style={{ width: '4px', height: '24px', backgroundColor: '#f97316', borderRadius: '2px' }} />
            <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: 700 }}>Registrar Nuevo Gasto</h3>
          </div>

          {/* Fila 1: Descripción */}
          <div style={{ marginBottom: '14px' }}>
            <label style={lS}>Descripción del Gasto *</label>
            <input required style={iS} value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej. Corpoelec Septiembre 2026" />
          </div>

          {/* Fila 2: Categoría + Tipo + Mes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={lS}>Categoría</label>
              <select style={iS} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lS}>Tipo</label>
              <select style={iS} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lS}>Mes de aplicación</label>
              <input type="month" style={iS} value={form.mes_aplicacion}
                onChange={e => setForm({ ...form, mes_aplicacion: e.target.value })} />
            </div>
          </div>

          {/* Fila 3: Monto USD + Monto Bs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={lS}>Monto en USD $ *</label>
              <input required type="number" step="0.01" min="0" style={{ ...iS, borderColor: '#f97316', color: '#f97316', fontWeight: 700 }}
                value={form.monto_usd}
                onChange={e => setForm({ ...form, monto_usd: e.target.value })}
                placeholder="0.00" />
            </div>
            <div>
              <label style={lS}>Monto en Bs *</label>
              <input required type="number" step="0.01" min="0" style={{ ...iS, borderColor: '#10b981', color: '#10b981', fontWeight: 700 }}
                value={form.monto_bs}
                onChange={e => setForm({ ...form, monto_bs: e.target.value })}
                placeholder="0.00" />
            </div>
          </div>

          {/* Separador */}
          <div style={{ borderTop: '1px solid #1e1e1e', margin: '16px 0 14px', paddingTop: '14px' }}>
            <p style={{ color: '#555', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>
              Datos de la Transferencia
            </p>
          </div>

          {/* Fila 4: Fecha Pago + Referencia */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={lS}>Fecha de Pago</label>
              <input type="date" style={iS} value={form.fecha_pago}
                onChange={e => setForm({ ...form, fecha_pago: e.target.value })} />
            </div>
            <div>
              <label style={lS}>Últimos 8 dígitos de referencia</label>
              <input style={iS} value={form.referencia} maxLength={8}
                onChange={e => setForm({ ...form, referencia: e.target.value.replace(/\D/g, '') })}
                placeholder="Ej. 12345678" />
            </div>
          </div>

          {/* Fila 5: Pagado por + Autorizado por */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={lS}>Persona que realizó el pago</label>
              <input style={iS} value={form.pagado_por}
                onChange={e => setForm({ ...form, pagado_por: e.target.value })}
                placeholder="Nombre completo" />
            </div>
            <div>
              <label style={lS}>Persona que autorizó</label>
              <input style={iS} value={form.autorizado_por}
                onChange={e => setForm({ ...form, autorizado_por: e.target.value })}
                placeholder="Nombre completo" />
            </div>
          </div>

          {/* Notas */}
          <div style={{ marginBottom: '16px' }}>
            <label style={lS}>Notas adicionales</label>
            <input style={iS} value={form.notas}
              onChange={e => setForm({ ...form, notas: e.target.value })}
              placeholder="Observaciones opcionales..." />
          </div>

          <button type="submit" disabled={guardando}
            style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', opacity: guardando ? 0.7 : 1 }}>
            {guardando ? '⏳ Guardando...' : '💾 Guardar Gasto'}
          </button>
        </form>
      )}

      {/* ── Lista de gastos ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <p style={{ color: '#555', textAlign: 'center', padding: '40px' }}>Cargando gastos...</p>
        ) : gastos.length === 0 ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '40px', border: '1px dashed #2a2a2a' }}>
            <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>
              No hay gastos registrados para {mesNombre(filtroMes)} {filtroMes.split('-')[0]}
            </p>
            <p style={{ color: '#3a3a3a', fontSize: '12px', marginTop: '6px' }}>
              Usa el botón "+ Nuevo Gasto" para agregar uno.
            </p>
          </div>
        ) : (
          gastos.map(g => {
            const isExp = expandido === g.id
            return (
              <div key={g.id} style={{ ...cardS, transition: 'border-color 0.2s', borderColor: isExp ? '#f97316' + '40' : '#1e1e1e' }}>
                {/* Fila principal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>{g.descripcion}</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#555', fontSize: '11px', backgroundColor: '#0f0f0f', border: '1px solid #1e1e1e', padding: '1px 6px', borderRadius: '4px' }}>
                        {g.categoria}
                      </span>
                      <span style={{ color: '#555', fontSize: '11px', backgroundColor: '#0f0f0f', border: '1px solid #1e1e1e', padding: '1px 6px', borderRadius: '4px' }}>
                        {g.tipo}
                      </span>
                      <span style={{ color: '#555', fontSize: '11px' }}>
                        {mesNombre(g.mes_aplicacion.slice(0, 7))} {g.mes_aplicacion.slice(0, 4)}
                      </span>
                      {g.fecha_pago && (
                        <span style={{ color: '#555', fontSize: '11px' }}>· Pagado: {new Date(g.fecha_pago + 'T12:00:00').toLocaleDateString('es-VE')}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* Montos */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#f97316', fontWeight: 800, fontSize: '15px' }}>$ {fmtUsd(g.monto_usd)}</div>
                      <div style={{ color: '#10b981', fontWeight: 700, fontSize: '13px' }}>Bs. {fmtBs(g.monto_bs)}</div>
                    </div>
                    {/* Botón expandir */}
                    <button
                      onClick={() => setExpandido(isExp ? null : g.id)}
                      style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#888', cursor: 'pointer', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', fontWeight: 600 }}>
                      {isExp ? '▲ Menos' : '▼ Detalle'}
                    </button>
                    <button onClick={() => handleDelete(g.id)}
                      style={{ background: 'transparent', border: 'none', color: '#3a3a3a', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
                      title="Eliminar">
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Detalle expandido */}
                {isExp && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1e1e1e', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                    {[
                      { label: 'Referencia', val: g.referencia || '—' },
                      { label: 'Pagado por', val: g.pagado_por || '—' },
                      { label: 'Autorizado por', val: g.autorizado_por || '—' },
                      { label: 'Notas', val: g.notas || '—' },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p style={{ color: '#555', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>{label}</p>
                        <p style={{ color: '#bbb', fontSize: '12px', margin: 0 }}>{val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
