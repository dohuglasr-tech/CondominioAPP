import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../data/supabase'
import {
  parseComprobantesGasto,
  serializeComprobantesGasto,
  subirComprobanteGasto,
} from '../../../data/gastosService'
import { ComprobantesGastoModal } from '../../components/ComprobantesGastoModal'

// ─── Types ────────────────────────────────────────────────────────────────────
interface HistorialEdicion {
  fecha: string
  razon: string
  snapshot: Record<string, unknown>
}

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
  factura_url?: string | null
  veces_editado: number
  historial_ediciones: HistorialEdicion[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS = [
  'agua','luz','gas','espacios_comunes','imprevistos',
  'administracion','conserjeria','servicios_externos','reparaciones',
]
const TIPOS = ['ordinario','extraordinario','fondo_reserva']
const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const hoy = new Date()
const HOY_STR  = hoy.toISOString().slice(0, 10)
const MES_STR  = hoy.toISOString().slice(0, 7)

const EMPTY_FORM = {
  descripcion: '', categoria: 'espacios_comunes', tipo: 'ordinario',
  monto_usd: '', monto_bs: '',
  mes_aplicacion: MES_STR, fecha_pago: HOY_STR,
  referencia: '', pagado_por: '', autorizado_por: '', notas: '',
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
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
const mesNombre = (s: string) => { const [,m] = s.split('-'); return MESES[parseInt(m)-1] || s }
const fmtBs  = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

// ─── Componente ───────────────────────────────────────────────────────────────
export const AdminGastos: React.FC = () => {
  const [gastos, setGastos]       = useState<GastoComun[]>([])
  const [form, setForm]           = useState(EMPTY_FORM)
  const [showForm, setShowForm]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [filtroMes, setFiltroMes] = useState(MES_STR)
  const [expandido, setExpandido] = useState<string | null>(null)

  // ── Soportes para nuevo gasto ─────────────────────────────────────────
  const [facturaFile, setFacturaFile]                 = useState<File | null>(null)
  const [facturaPreview, setFacturaPreview]           = useState<string | null>(null)
  const [transferenciaFile, setTransferenciaFile]     = useState<File | null>(null)
  const [transferenciaPreview, setTransferenciaPreview] = useState<string | null>(null)

  // ── Estado de edición ─────────────────────────────────────────────────
  const [editandoId, setEditandoId]                   = useState<string | null>(null)
  const [editForm, setEditForm]                       = useState<typeof EMPTY_FORM | null>(null)
  const [razonEdicion, setRazonEdicion]               = useState('')
  const [guardandoEdit, setGuardandoEdit]             = useState(false)
  // Contador local de clics en "Editar" por gasto (para la advertencia)
  const [clicsEditar, setClicsEditar]                 = useState<Record<string, number>>({})

  // Soportes para gasto en edición
  const [editFacturaUrl, setEditFacturaUrl]                     = useState<string | null>(null)
  const [editTransferenciaUrl, setEditTransferenciaUrl]         = useState<string | null>(null)
  const [editFacturaFile, setEditFacturaFile]                   = useState<File | null>(null)
  const [editFacturaPreview, setEditFacturaPreview]             = useState<string | null>(null)
  const [editTransferenciaFile, setEditTransferenciaFile]       = useState<File | null>(null)
  const [editTransferenciaPreview, setEditTransferenciaPreview] = useState<string | null>(null)

  // ── Modal visor de comprobantes (Lightbox) ───────────────────────────
  const [modalGasto, setModalGasto] = useState<GastoComun | null>(null)
  const [modalTipo, setModalTipo]   = useState<'factura' | 'transferencia'>('factura')
  const [showModal, setShowModal]   = useState(false)

  // ── Cargar gastos ─────────────────────────────────────────────────────
  const cargarGastos = useCallback(async () => {
    setLoading(true)
    const desde = `${filtroMes}-01`
    const [aniof, mesf] = filtroMes.split('-').map(Number)
    const hasta = new Date(aniof, mesf, 0).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('gastos_comunes').select('*')
      .gte('mes_aplicacion', desde).lte('mes_aplicacion', hasta)
      .order('created_at', { ascending: false })
    if (data) setGastos(data)
    setLoading(false)
  }, [filtroMes])

  useEffect(() => { cargarGastos() }, [cargarGastos])

  // ── Guardar nuevo gasto ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.descripcion || !form.monto_usd || !form.monto_bs) return
    setGuardando(true)

    let urlF: string | null = null
    let urlT: string | null = null

    // 1. Subir factura si se seleccionó archivo
    if (facturaFile) {
      const resF = await subirComprobanteGasto(facturaFile, 'factura', form.mes_aplicacion)
      if (resF.error) {
        alert('Aviso al subir factura: ' + resF.error)
      } else {
        urlF = resF.url
      }
    }

    // 2. Subir transferencia si se seleccionó archivo
    if (transferenciaFile) {
      const resT = await subirComprobanteGasto(transferenciaFile, 'transferencia', form.mes_aplicacion)
      if (resT.error) {
        alert('Aviso al subir comprobante bancario: ' + resT.error)
      } else {
        urlT = resT.url
      }
    }

    const factura_url = serializeComprobantesGasto({
      factura_url: urlF,
      transferencia_url: urlT,
    })

    const payload = {
      descripcion:    form.descripcion,
      categoria:      form.categoria,
      tipo:           form.tipo,
      monto_usd:      parseFloat(form.monto_usd),
      monto_bs:       parseFloat(form.monto_bs),
      mes_aplicacion: `${form.mes_aplicacion}-01`,
      fecha_pago:     form.fecha_pago || null,
      referencia:     form.referencia?.trim() || null,
      pagado_por:     form.pagado_por?.trim()  || null,
      autorizado_por: form.autorizado_por?.trim() || null,
      notas:          form.notas?.trim() || null,
      factura_url:    factura_url,
      veces_editado:  0,
      historial_ediciones: [],
    }

    const { data, error } = await supabase.from('gastos_comunes').insert(payload).select().single()
    if (error) {
      alert('Error: ' + error.message)
    } else if (data) {
      setGastos(prev => [data, ...prev])
      setForm(EMPTY_FORM)
      setFacturaFile(null)
      setFacturaPreview(null)
      setTransferenciaFile(null)
      setTransferenciaPreview(null)
      setShowForm(false)
    }
    setGuardando(false)
  }

  // ── Iniciar edición ──────────────────────────────────────────────────
  const iniciarEdicion = (g: GastoComun) => {
    // Incrementar contador local de clics
    setClicsEditar(prev => ({ ...prev, [g.id]: (prev[g.id] || 0) + 1 }))
    setEditandoId(g.id)
    setRazonEdicion('')
    setEditForm({
      descripcion:    g.descripcion,
      categoria:      g.categoria,
      tipo:           g.tipo,
      monto_usd:      String(g.monto_usd),
      monto_bs:       String(g.monto_bs),
      mes_aplicacion: g.mes_aplicacion.slice(0, 7),
      fecha_pago:     g.fecha_pago || HOY_STR,
      referencia:     g.referencia || '',
      pagado_por:     g.pagado_por || '',
      autorizado_por: g.autorizado_por || '',
      notas:          g.notas || '',
    })

    // Parsear comprobantes actuales
    const comp = parseComprobantesGasto(g.factura_url)
    setEditFacturaUrl(comp.factura_url || null)
    setEditTransferenciaUrl(comp.transferencia_url || null)
    setEditFacturaFile(null)
    setEditFacturaPreview(null)
    setEditTransferenciaFile(null)
    setEditTransferenciaPreview(null)

    setExpandido(g.id) // abrir la tarjeta
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditForm(null)
    setRazonEdicion('')
    setEditFacturaUrl(null)
    setEditTransferenciaUrl(null)
    setEditFacturaFile(null)
    setEditFacturaPreview(null)
    setEditTransferenciaFile(null)
    setEditTransferenciaPreview(null)
  }

  // ── Guardar edición ──────────────────────────────────────────────────
  const guardarEdicion = async (g: GastoComun) => {
    if (!editForm || !razonEdicion.trim()) {
      alert('Por favor, escribe la razón de la edición antes de guardar.')
      return
    }
    setGuardandoEdit(true)

    let finalFacturaUrl = editFacturaUrl
    let finalTransfUrl = editTransferenciaUrl

    if (editFacturaFile) {
      const resF = await subirComprobanteGasto(editFacturaFile, 'factura', editForm.mes_aplicacion)
      if (resF.error) {
        alert('Aviso al subir factura: ' + resF.error)
      } else {
        finalFacturaUrl = resF.url
      }
    }

    if (editTransferenciaFile) {
      const resT = await subirComprobanteGasto(editTransferenciaFile, 'transferencia', editForm.mes_aplicacion)
      if (resT.error) {
        alert('Aviso al subir comprobante: ' + resT.error)
      } else {
        finalTransfUrl = resT.url
      }
    }

    const updatedFacturaUrl = serializeComprobantesGasto({
      factura_url: finalFacturaUrl,
      transferencia_url: finalTransfUrl,
    })

    // Snapshot del estado ANTERIOR al cambio
    const snapshot: HistorialEdicion = {
      fecha: new Date().toISOString(),
      razon: razonEdicion.trim(),
      snapshot: {
        descripcion:    g.descripcion,
        categoria:      g.categoria,
        tipo:           g.tipo,
        monto_usd:      g.monto_usd,
        monto_bs:       g.monto_bs,
        mes_aplicacion: g.mes_aplicacion,
        fecha_pago:     g.fecha_pago,
        referencia:     g.referencia,
        pagado_por:     g.pagado_por,
        autorizado_por: g.autorizado_por,
        notas:          g.notas,
        factura_url:    g.factura_url,
      },
    }

    const nuevoHistorial = [...(g.historial_ediciones || []), snapshot]

    const payload = {
      descripcion:        editForm.descripcion,
      categoria:          editForm.categoria,
      tipo:               editForm.tipo,
      monto_usd:          parseFloat(editForm.monto_usd),
      monto_bs:           parseFloat(editForm.monto_bs),
      mes_aplicacion:     `${editForm.mes_aplicacion}-01`,
      fecha_pago:         editForm.fecha_pago || null,
      referencia:         editForm.referencia?.trim() || null,
      pagado_por:         editForm.pagado_por?.trim()  || null,
      autorizado_por:     editForm.autorizado_por?.trim() || null,
      notas:              editForm.notas?.trim() || null,
      factura_url:        updatedFacturaUrl,
      veces_editado:      (g.veces_editado || 0) + 1,
      historial_ediciones: nuevoHistorial,
      updated_at:         new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('gastos_comunes').update(payload).eq('id', g.id).select().single()

    if (error) { alert('Error al editar: ' + error.message) }
    else if (data) {
      setGastos(prev => prev.map(x => x.id === g.id ? data : x))
      cancelarEdicion()
    }
    setGuardandoEdit(false)
  }

  // ── Eliminar ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return
    await supabase.from('gastos_comunes').delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
  }

  // ── Totales ──────────────────────────────────────────────────────────
  const totalUsd = gastos.reduce((s, g) => s + (g.monto_usd || 0), 0)
  const totalBs  = gastos.reduce((s, g) => s + (g.monto_bs  || 0), 0)

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ color:'#fff', fontSize:'24px', fontWeight:800, margin:0 }}>💸 Gestión de Gastos</h1>
          <p style={{ color:'#666', fontSize:'14px', marginTop:'4px' }}>
            Registra los egresos del mes con su monto en $ y Bs. — se usan para calcular los recibos
          </p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM) }}
          style={{ backgroundColor: showForm ? '#2a2a2a' : '#f97316', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'10px', cursor:'pointer', fontWeight:700, fontSize:'14px' }}>
          {showForm ? '✕ Cancelar' : '+ Nuevo Gasto'}
        </button>
      </div>

      {/* Barra totales + filtro */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:'20px', flex:1, ...cardS, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <span style={{ color:'#555', fontSize:'12px', fontWeight:600 }}>TOTAL MES (USD):</span>
            <span style={{ color:'#f97316', fontWeight:800, fontSize:'18px' }}>$ {fmtUsd(totalUsd)}</span>
          </div>
          <div style={{ width:'1px', backgroundColor:'#2a2a2a', height:'28px', flexShrink:0 }} />
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <span style={{ color:'#555', fontSize:'12px', fontWeight:600 }}>TOTAL MES (Bs):</span>
            <span style={{ color:'#10b981', fontWeight:800, fontSize:'18px' }}>Bs. {fmtBs(totalBs)}</span>
          </div>
          <span style={{ color:'#3a3a3a', fontSize:'12px', marginLeft:'auto' }}>{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            style={{ backgroundColor:'#141414', border:'1px solid #2a2a2a', color:'#fff', padding:'10px 12px', borderRadius:'10px', fontSize:'13px', outline:'none' }} />
          <button onClick={cargarGastos}
            style={{ backgroundColor:'#1e1e1e', color:'#ccc', border:'1px solid #2a2a2a', padding:'10px 14px', borderRadius:'10px', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
            🔄
          </button>
        </div>
      </div>

      {/* Formulario nuevo gasto */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ ...cardS, marginBottom:'24px', borderColor:'rgba(249,115,22,0.3)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
            <div style={{ width:'4px', height:'22px', backgroundColor:'#f97316', borderRadius:'2px' }} />
            <h3 style={{ color:'#fff', margin:0, fontSize:'15px', fontWeight:700 }}>Registrar Nuevo Gasto</h3>
          </div>
          <FormFields
            form={form}
            setForm={setForm}
            facturaFile={facturaFile}
            setFacturaFile={setFacturaFile}
            facturaPreview={facturaPreview}
            setFacturaPreview={setFacturaPreview}
            transferenciaFile={transferenciaFile}
            setTransferenciaFile={setTransferenciaFile}
            transferenciaPreview={transferenciaPreview}
            setTransferenciaPreview={setTransferenciaPreview}
          />
          <button type="submit" disabled={guardando}
            style={{ backgroundColor:'#f97316', color:'#fff', border:'none', padding:'12px 28px', borderRadius:'10px', cursor:'pointer', fontWeight:700, fontSize:'14px', opacity: guardando ? 0.7 : 1, marginTop:'16px' }}>
            {guardando ? '⏳ Guardando y subiendo comprobantes...' : '💾 Guardar Gasto'}
          </button>
        </form>
      )}

      {/* Lista de gastos */}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {loading ? (
          <p style={{ color:'#555', textAlign:'center', padding:'40px' }}>Cargando gastos...</p>
        ) : gastos.length === 0 ? (
          <div style={{ ...cardS, textAlign:'center', padding:'40px', border:'1px dashed #2a2a2a' }}>
            <p style={{ color:'#555', fontSize:'14px', margin:0 }}>No hay gastos para {mesNombre(filtroMes)} {filtroMes.split('-')[0]}</p>
            <p style={{ color:'#3a3a3a', fontSize:'12px', marginTop:'6px' }}>Usa "+ Nuevo Gasto" para agregar uno.</p>
          </div>
        ) : (
          gastos.map(g => {
            const isExp  = expandido === g.id
            const isEdit = editandoId === g.id
            const clics  = clicsEditar[g.id] || 0
            const comp   = parseComprobantesGasto(g.factura_url)

            return (
              <div key={g.id} style={{
                ...cardS,
                borderColor: isEdit ? 'rgba(234,179,8,0.5)' : isExp ? 'rgba(249,115,22,0.25)' : '#1e1e1e',
                transition: 'border-color 0.2s',
              }}>

                {/* ── Fila principal ── */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                      <p style={{ color:'#fff', fontSize:'14px', fontWeight:600, margin:0 }}>{g.descripcion}</p>
                      {(g.veces_editado || 0) > 0 && (
                        <span style={{ backgroundColor:'#f59e0b18', color:'#f59e0b', border:'1px solid #f59e0b30', padding:'1px 7px', borderRadius:'6px', fontSize:'10px', fontWeight:800 }}>
                          ✏️ Editado {g.veces_editado}x
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:'6px', marginTop:'4px', flexWrap:'wrap', alignItems:'center' }}>
                      <span style={{ color:'#555', fontSize:'11px', backgroundColor:'#0f0f0f', border:'1px solid #1e1e1e', padding:'1px 6px', borderRadius:'4px' }}>{g.categoria}</span>
                      <span style={{ color:'#555', fontSize:'11px', backgroundColor:'#0f0f0f', border:'1px solid #1e1e1e', padding:'1px 6px', borderRadius:'4px' }}>{g.tipo}</span>
                      <span style={{ color:'#555', fontSize:'11px' }}>{mesNombre(g.mes_aplicacion.slice(0,7))} {g.mes_aplicacion.slice(0,4)}</span>
                      {g.fecha_pago && <span style={{ color:'#555', fontSize:'11px' }}>· Pago: {new Date(g.fecha_pago+'T12:00:00').toLocaleDateString('es-VE')}</span>}
                      {comp.factura_url && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setModalGasto(g); setModalTipo('factura'); setShowModal(true) }}
                          style={{ backgroundColor:'#f9731618', color:'#f97316', border:'1px solid #f9731630', padding:'1px 7px', borderRadius:'4px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}
                        >
                          📄 Factura
                        </button>
                      )}
                      {comp.transferencia_url && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setModalGasto(g); setModalTipo('transferencia'); setShowModal(true) }}
                          style={{ backgroundColor:'#10b98118', color:'#10b981', border:'1px solid #10b98130', padding:'1px 7px', borderRadius:'4px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}
                        >
                          💳 Transferencia
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ color:'#f97316', fontWeight:800, fontSize:'15px' }}>$ {fmtUsd(g.monto_usd)}</div>
                      <div style={{ color:'#10b981', fontWeight:700, fontSize:'13px' }}>Bs. {fmtBs(g.monto_bs)}</div>
                    </div>
                    <button onClick={() => setExpandido(isExp ? null : g.id)}
                      style={{ background:'transparent', border:'1px solid #2a2a2a', color:'#888', cursor:'pointer', fontSize:'11px', padding:'5px 10px', borderRadius:'6px', fontWeight:600 }}>
                      {isExp ? '▲' : '▼'}
                    </button>
                    <button onClick={() => iniciarEdicion(g)}
                      style={{ backgroundColor:'#1e293b', color:'#60a5fa', border:'1px solid #1e40af30', padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:700 }}>
                      ✏️ Editar
                    </button>
                    <button onClick={() => handleDelete(g.id)}
                      style={{ background:'transparent', border:'none', color:'#3a3a3a', cursor:'pointer', fontSize:'16px', padding:'4px' }}
                      title="Eliminar">
                      🗑️
                    </button>
                  </div>
                </div>

                {/* ── Panel de Edición ── */}
                {isEdit && editForm && (
                  <div style={{ marginTop:'16px', paddingTop:'16px', borderTop:'1px solid #2a2a2a' }}>

                    {/* 🔔 Advertencia */}
                    <div style={{
                      backgroundColor:'#fef08a15', border:'2px solid #ca8a04',
                      borderRadius:'10px', padding:'12px 16px', marginBottom:'16px',
                      display:'flex', alignItems:'flex-start', gap:'12px',
                    }}>
                      <span style={{ fontSize:'22px', flexShrink:0 }}>⚠️</span>
                      <div>
                        <p style={{ color:'#fbbf24', fontWeight:800, fontSize:'13px', margin:'0 0 2px' }}>
                          Este gasto está siendo editado
                        </p>
                        <p style={{ color:'#a16207', fontSize:'12px', margin:0 }}>
                          Número de ediciones registradas en DB: <strong style={{ color:'#fbbf24' }}>{g.veces_editado || 0}</strong>
                          {clics > 0 && <span style={{ color:'#a16207' }}> · Clics en Editar esta sesión: <strong style={{ color:'#fbbf24' }}>{clics}</strong></span>}
                        </p>
                      </div>
                    </div>

                    {/* Formulario de edición */}
                    <FormFields
                      form={editForm}
                      setForm={setEditForm as any}
                      facturaFile={editFacturaFile}
                      setFacturaFile={setEditFacturaFile}
                      facturaPreview={editFacturaPreview}
                      setFacturaPreview={setEditFacturaPreview}
                      transferenciaFile={editTransferenciaFile}
                      setTransferenciaFile={setEditTransferenciaFile}
                      transferenciaPreview={editTransferenciaPreview}
                      setTransferenciaPreview={setEditTransferenciaPreview}
                      existingFacturaUrl={editFacturaUrl}
                      onRemoveExistingFactura={() => setEditFacturaUrl(null)}
                      existingTransferenciaUrl={editTransferenciaUrl}
                      onRemoveExistingTransferencia={() => setEditTransferenciaUrl(null)}
                      onVerModal={(tipo) => {
                        setModalGasto(g)
                        setModalTipo(tipo)
                        setShowModal(true)
                      }}
                    />

                    {/* Razón de edición — REQUERIDA */}
                    <div style={{ marginTop:'16px', borderTop:'1px solid #1e1e1e', paddingTop:'16px' }}>
                      <label style={{ ...lS, color:'#f59e0b', fontSize:'12px' }}>
                        ⚠️ Razón de la edición * (obligatorio)
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={razonEdicion}
                        onChange={e => setRazonEdicion(e.target.value)}
                        placeholder="Describe por qué se está modificando este gasto..."
                        style={{ ...iS, resize:'vertical', minHeight:'72px', borderColor: razonEdicion.trim() ? '#10b981' : '#f59e0b' }}
                      />
                      {!razonEdicion.trim() && (
                        <p style={{ color:'#f59e0b', fontSize:'11px', margin:'4px 0 0', fontWeight:600 }}>
                          La razón de edición es obligatoria para guardar.
                        </p>
                      )}
                    </div>

                    {/* Botones edición */}
                    <div style={{ display:'flex', gap:'10px', marginTop:'14px' }}>
                      <button onClick={() => guardarEdicion(g)} disabled={guardandoEdit || !razonEdicion.trim()}
                        style={{ backgroundColor: razonEdicion.trim() ? '#10b981' : '#2a2a2a', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor: razonEdicion.trim() ? 'pointer' : 'not-allowed', fontWeight:700, fontSize:'13px', opacity: guardandoEdit ? 0.7 : 1 }}>
                        {guardandoEdit ? '⏳ Guardando y actualizando comprobantes...' : '✅ Guardar Cambios'}
                      </button>
                      <button onClick={cancelarEdicion}
                        style={{ backgroundColor:'#1e1e1e', color:'#888', border:'1px solid #2a2a2a', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'13px' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Detalle expandido (sin edición) ── */}
                {isExp && !isEdit && (
                  <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px solid #1e1e1e', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'10px' }}>
                    {[
                      { label:'Referencia', val: g.referencia || '—' },
                      { label:'Pagado por', val: g.pagado_por || '—' },
                      { label:'Autorizado por', val: g.autorizado_por || '—' },
                      { label:'Notas', val: g.notas || '—' },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p style={{ color:'#555', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 2px' }}>{label}</p>
                        <p style={{ color:'#bbb', fontSize:'12px', margin:0 }}>{val}</p>
                      </div>
                    ))}

                    {/* Soportes y comprobantes fotográficos */}
                    {(comp.factura_url || comp.transferencia_url) && (
                      <div style={{ gridColumn:'1 / -1', marginTop:'10px', borderTop:'1px solid #1e1e1e', paddingTop:'10px' }}>
                        <p style={{ color:'#888', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 8px' }}>
                          📷 Comprobantes y Fotos de Respaldo
                        </p>
                        <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
                          {comp.factura_url && (
                            <div
                              onClick={() => { setModalGasto(g); setModalTipo('factura'); setShowModal(true) }}
                              style={{
                                display:'flex', alignItems:'center', gap:'10px', backgroundColor:'#0a0a0a',
                                border:'1px solid #2a2a2a', borderRadius:'8px', padding:'8px 12px', cursor:'pointer',
                              }}
                            >
                              <img src={comp.factura_url} alt="Factura" style={{ width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px', border:'1px solid #333' }} />
                              <div>
                                <p style={{ color:'#eee', fontSize:'12px', fontWeight:600, margin:0 }}>📄 Factura / Conforme</p>
                                <span style={{ color:'#f97316', fontSize:'11px' }}>Clic para ampliar 🔍</span>
                              </div>
                            </div>
                          )}
                          {comp.transferencia_url && (
                            <div
                              onClick={() => { setModalGasto(g); setModalTipo('transferencia'); setShowModal(true) }}
                              style={{
                                display:'flex', alignItems:'center', gap:'10px', backgroundColor:'#0a0a0a',
                                border:'1px solid #2a2a2a', borderRadius:'8px', padding:'8px 12px', cursor:'pointer',
                              }}
                            >
                              <img src={comp.transferencia_url} alt="Transferencia" style={{ width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px', border:'1px solid #333' }} />
                              <div>
                                <p style={{ color:'#eee', fontSize:'12px', fontWeight:600, margin:0 }}>💳 Transferencia</p>
                                <span style={{ color:'#10b981', fontSize:'11px' }}>Clic para ampliar 🔍</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Historial de ediciones */}
                    {(g.historial_ediciones || []).length > 0 && (
                      <div style={{ gridColumn:'1 / -1', marginTop:'10px', borderTop:'1px solid #1e1e1e', paddingTop:'10px' }}>
                        <p style={{ color:'#555', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 8px' }}>
                          📋 Historial de ediciones ({g.historial_ediciones.length})
                        </p>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                          {g.historial_ediciones.map((h, i) => (
                            <div key={i} style={{ backgroundColor:'#0a0a0a', border:'1px solid #1e1e1e', borderRadius:'8px', padding:'8px 12px', display:'flex', gap:'12px', alignItems:'flex-start' }}>
                              <span style={{ backgroundColor:'#f59e0b20', color:'#f59e0b', border:'1px solid #f59e0b30', padding:'1px 6px', borderRadius:'4px', fontSize:'10px', fontWeight:800, flexShrink:0 }}>
                                #{i + 1}
                              </span>
                              <div style={{ flex:1 }}>
                                <p style={{ color:'#ccc', fontSize:'12px', fontWeight:600, margin:'0 0 2px' }}>{h.razon}</p>
                                <p style={{ color:'#555', fontSize:'10px', margin:0 }}>
                                  {new Date(h.fecha).toLocaleString('es-VE', { dateStyle:'medium', timeStyle:'short' })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal visor de comprobantes */}
      <ComprobantesGastoModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        gasto={modalGasto}
        initialTipo={modalTipo}
      />
    </div>
  )
}

// ─── Subcomponente de campos del formulario (reutilizable) ────────────────────
interface FormFieldsProps {
  form: typeof EMPTY_FORM
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>
  facturaFile?: File | null
  setFacturaFile?: (f: File | null) => void
  facturaPreview?: string | null
  setFacturaPreview?: (url: string | null) => void
  transferenciaFile?: File | null
  setTransferenciaFile?: (f: File | null) => void
  transferenciaPreview?: string | null
  setTransferenciaPreview?: (url: string | null) => void
  existingFacturaUrl?: string | null
  onRemoveExistingFactura?: () => void
  existingTransferenciaUrl?: string | null
  onRemoveExistingTransferencia?: () => void
  onVerModal?: (tipo: 'factura' | 'transferencia') => void
}

const FormFields: React.FC<FormFieldsProps> = ({
  form, setForm,
  facturaFile, setFacturaFile,
  facturaPreview, setFacturaPreview,
  transferenciaFile, setTransferenciaFile,
  transferenciaPreview, setTransferenciaPreview,
  existingFacturaUrl, onRemoveExistingFactura,
  existingTransferenciaUrl, onRemoveExistingTransferencia,
  onVerModal,
}) => {
  const facturaInputRef = useRef<HTMLInputElement>(null)
  const transfInputRef  = useRef<HTMLInputElement>(null)

  const activeFacturaImg = facturaPreview || existingFacturaUrl
  const activeTransfImg  = transferenciaPreview || existingTransferenciaUrl

  const handleFacturaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      if (setFacturaFile) setFacturaFile(f)
      if (setFacturaPreview) setFacturaPreview(URL.createObjectURL(f))
    }
  }

  const handleTransfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      if (setTransferenciaFile) setTransferenciaFile(f)
      if (setTransferenciaPreview) setTransferenciaPreview(URL.createObjectURL(f))
    }
  }

  return (
    <div>
      {/* Descripción */}
      <div style={{ marginBottom:'12px' }}>
        <label style={lS}>Descripción del Gasto *</label>
        <input required style={iS} value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          placeholder="Ej. Corpoelec Septiembre 2026" />
      </div>

      {/* Categoría / Tipo / Mes */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'12px', marginBottom:'12px' }}>
        <div>
          <label style={lS}>Categoría</label>
          <select style={iS} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lS}>Tipo</label>
          <select style={iS} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={lS}>Mes de aplicación</label>
          <input type="month" style={iS} value={form.mes_aplicacion} onChange={e => setForm(f => ({ ...f, mes_aplicacion: e.target.value }))} />
        </div>
      </div>

      {/* Montos */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
        <div>
          <label style={lS}>Monto en USD $ *</label>
          <input required type="number" step="0.01" min="0"
            style={{ ...iS, borderColor:'#f97316', color:'#f97316', fontWeight:700 }}
            value={form.monto_usd}
            onChange={e => setForm(f => ({ ...f, monto_usd: e.target.value }))}
            placeholder="0.00" />
        </div>
        <div>
          <label style={lS}>Monto en Bs *</label>
          <input required type="number" step="0.01" min="0"
            style={{ ...iS, borderColor:'#10b981', color:'#10b981', fontWeight:700 }}
            value={form.monto_bs}
            onChange={e => setForm(f => ({ ...f, monto_bs: e.target.value }))}
            placeholder="0.00" />
        </div>
      </div>

      {/* Separador Transferencia */}
      <div style={{ borderTop:'1px solid #1e1e1e', margin:'14px 0', paddingTop:'12px' }}>
        <p style={{ color:'#444', fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 10px' }}>Datos de la Transferencia</p>
      </div>

      {/* Fecha + Referencia */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
        <div>
          <label style={lS}>Fecha de Pago</label>
          <input type="date" style={iS} value={form.fecha_pago}
            onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))} />
        </div>
        <div>
          <label style={lS}>Últimos 8 dígitos de referencia</label>
          <input style={iS} value={form.referencia} maxLength={8}
            onChange={e => setForm(f => ({ ...f, referencia: e.target.value.replace(/\D/g, '') }))}
            placeholder="12345678" />
        </div>
      </div>

      {/* Pagado por + Autorizado por */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
        <div>
          <label style={lS}>Persona que realizó el pago</label>
          <input style={iS} value={form.pagado_por}
            onChange={e => setForm(f => ({ ...f, pagado_por: e.target.value }))}
            placeholder="Nombre completo" />
        </div>
        <div>
          <label style={lS}>Persona que autorizó</label>
          <input style={iS} value={form.autorizado_por}
            onChange={e => setForm(f => ({ ...f, autorizado_por: e.target.value }))}
            placeholder="Nombre completo" />
        </div>
      </div>

      {/* Notas */}
      <div style={{ marginBottom:'14px' }}>
        <label style={lS}>Notas adicionales</label>
        <input style={iS} value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          placeholder="Observaciones opcionales..." />
      </div>

      {/* ─── FOTOS Y SOPORTES ADJUNTOS ─── */}
      <div style={{ borderTop:'1px solid #1e1e1e', margin:'16px 0 0', paddingTop:'14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
          <span style={{ fontSize:'15px' }}>📎</span>
          <label style={{ ...lS, color:'#f97316', fontSize:'12px', margin:0 }}>
            Comprobantes y Fotos de Respaldo (Factura y Transferencia)
          </label>
          <span style={{ color:'#666', fontSize:'11px' }}>· Lectura disponible para residentes</span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'12px' }}>
          {/* 1. Factura o Recibo Conforme */}
          <div style={{
            backgroundColor:'#0a0a0a',
            border: activeFacturaImg ? '1px solid rgba(249,115,22,0.5)' : '1px dashed #2a2a2a',
            borderRadius:'10px',
            padding:'12px',
            display:'flex',
            flexDirection:'column',
            justifyContent:'space-between',
          }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
                <span style={{ color:'#fff', fontSize:'12px', fontWeight:700 }}>📄 Factura o Recibo Conforme</span>
                {activeFacturaImg && <span style={{ color:'#10b981', fontSize:'10px', fontWeight:700 }}>✓ Adjunta</span>}
              </div>
              <p style={{ color:'#666', fontSize:'11px', margin:'0 0 10px' }}>
                Factura de compra o recibo firmado de recepción/entrega conforme.
              </p>
            </div>

            {activeFacturaImg ? (
              <div style={{ display:'flex', alignItems:'center', gap:'10px', backgroundColor:'#141414', padding:'8px', borderRadius:'8px', border:'1px solid #222' }}>
                <img
                  src={activeFacturaImg}
                  alt="Factura"
                  style={{ width:'52px', height:'52px', objectFit:'cover', borderRadius:'6px', border:'1px solid #333' }}
                />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:'#ddd', fontSize:'12px', fontWeight:600, margin:'0 0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {facturaFile ? facturaFile.name : 'Factura cargada'}
                  </p>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {onVerModal && (
                      <button
                        type="button"
                        onClick={() => onVerModal('factura')}
                        style={{ background:'#1e293b', color:'#60a5fa', border:'none', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}
                      >
                        👁️ Ver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (setFacturaFile) setFacturaFile(null)
                        if (setFacturaPreview) setFacturaPreview(null)
                        if (onRemoveExistingFactura) onRemoveExistingFactura()
                      }}
                      style={{ background:'#262626', color:'#ef4444', border:'none', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}
                    >
                      ✕ Quitar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => facturaInputRef.current?.click()}
                style={{
                  cursor:'pointer',
                  textAlign:'center',
                  padding:'14px 10px',
                  borderRadius:'8px',
                  border:'1px dashed #333',
                  backgroundColor:'#121212',
                  transition:'border-color 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#f97316'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#333'}
              >
                <span style={{ fontSize:'20px', display:'block', marginBottom:'2px' }}>📷</span>
                <p style={{ color:'#bbb', fontSize:'12px', fontWeight:600, margin:'0 0 2px' }}>
                  Adjuntar foto de factura / recibo
                </p>
                <p style={{ color:'#555', fontSize:'10px', margin:0 }}>
                  PNG, JPG, WebP o PDF · Se optimiza automáticamente
                </p>
              </div>
            )}
            <input
              ref={facturaInputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display:'none' }}
              onChange={handleFacturaChange}
            />
          </div>

          {/* 2. Comprobante de Transferencia */}
          <div style={{
            backgroundColor:'#0a0a0a',
            border: activeTransfImg ? '1px solid rgba(16,185,129,0.5)' : '1px dashed #2a2a2a',
            borderRadius:'10px',
            padding:'12px',
            display:'flex',
            flexDirection:'column',
            justifyContent:'space-between',
          }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
                <span style={{ color:'#fff', fontSize:'12px', fontWeight:700 }}>💳 Comprobante de Transferencia</span>
                {activeTransfImg && <span style={{ color:'#10b981', fontSize:'10px', fontWeight:700 }}>✓ Adjunta</span>}
              </div>
              <p style={{ color:'#666', fontSize:'11px', margin:'0 0 10px' }}>
                Captura de pantalla o comprobante bancario del pago efectuado.
              </p>
            </div>

            {activeTransfImg ? (
              <div style={{ display:'flex', alignItems:'center', gap:'10px', backgroundColor:'#141414', padding:'8px', borderRadius:'8px', border:'1px solid #222' }}>
                <img
                  src={activeTransfImg}
                  alt="Transferencia"
                  style={{ width:'52px', height:'52px', objectFit:'cover', borderRadius:'6px', border:'1px solid #333' }}
                />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:'#ddd', fontSize:'12px', fontWeight:600, margin:'0 0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {transferenciaFile ? transferenciaFile.name : 'Comprobante cargado'}
                  </p>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {onVerModal && (
                      <button
                        type="button"
                        onClick={() => onVerModal('transferencia')}
                        style={{ background:'#1e293b', color:'#60a5fa', border:'none', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:700, cursor:'pointer' }}
                      >
                        👁️ Ver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (setTransferenciaFile) setTransferenciaFile(null)
                        if (setTransferenciaPreview) setTransferenciaPreview(null)
                        if (onRemoveExistingTransferencia) onRemoveExistingTransferencia()
                      }}
                      style={{ background:'#262626', color:'#ef4444', border:'none', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer' }}
                    >
                      ✕ Quitar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => transfInputRef.current?.click()}
                style={{
                  cursor:'pointer',
                  textAlign:'center',
                  padding:'14px 10px',
                  borderRadius:'8px',
                  border:'1px dashed #333',
                  backgroundColor:'#121212',
                  transition:'border-color 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#10b981'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#333'}
              >
                <span style={{ fontSize:'20px', display:'block', marginBottom:'2px' }}>📱</span>
                <p style={{ color:'#bbb', fontSize:'12px', fontWeight:600, margin:'0 0 2px' }}>
                  Adjuntar captura de transferencia
                </p>
                <p style={{ color:'#555', fontSize:'10px', margin:0 }}>
                  PNG, JPG, WebP o PDF · Se optimiza automáticamente
                </p>
              </div>
            )}
            <input
              ref={transfInputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display:'none' }}
              onChange={handleTransfChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
