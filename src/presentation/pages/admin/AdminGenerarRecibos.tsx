import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Apartamento {
  id: string; numero: string; piso: number | null
  alicuota: number; propietario_nombre: string | null; metros_cuadrados: number | null
}
interface GastoComun {
  id: string; descripcion: string; categoria: string; tipo: string
  monto_usd: number; monto_bs: number; mes_aplicacion: string
}
interface CargoEspecial {
  id: string; apartamento_id: string
  tipo: 'multa' | 'deuda_atrasada' | 'cuota_extraordinaria' | 'acuerdo_pago'
  descripcion: string; monto_usd: number; monto_bs?: number
}
interface ConfigEdificio {
  nombre_edificio: string; rif: string | null; direccion: string | null
  email_contacto: string | null; banco: string | null
  cuenta_bancaria: string | null; titular_cuenta: string | null
  tasa_bcv_actual: number
}

const TIPO_CARGO_LABELS: Record<string, string> = {
  multa: '⚠️ Multa', deuda_atrasada: '🔴 Deuda Atrasada',
  cuota_extraordinaria: '🔷 Cuota Extraordinaria', acuerdo_pago: '🤝 Acuerdo de Pago',
}
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const fmtBs  = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Estilos ──────────────────────────────────────────────────────────────
const S = {
  card: { backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px 22px' } as React.CSSProperties,
  input: { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const },
  label: { display: 'block', color: '#888', fontSize: '11px', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' },
  btnPrimary: { backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' } as React.CSSProperties,
  btnSecondary: { backgroundColor: '#1e1e1e', color: '#ccc', border: '1px solid #2a2a2a', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' } as React.CSSProperties,
  btnDanger: { backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444430', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 } as React.CSSProperties,
  badge: (color: string) => ({ backgroundColor: `${color}18`, color, border: `1px solid ${color}35`, padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }) as React.CSSProperties,
}

// ─── PDF Generator ────────────────────────────────────────────────────────
function generarPDF(
  apto: Apartamento,
  gastos: GastoComun[],
  cargos: CargoEspecial[],
  config: ConfigEdificio,
  fondoReservaPct: number,
  mesLabel: string,
  anio: number,
): jsPDF {
  const doc = new jsPDF()
  const cAccent: [number,number,number] = [249, 115, 22]
  const cDark:   [number,number,number] = [30, 30, 30]

  const alicuota     = apto.alicuota / 100
  // Totales USD prorrata
  const totalGastosUsd = gastos.reduce((s, g) => s + g.monto_usd, 0)
  const totalGastosBs  = gastos.reduce((s, g) => s + g.monto_bs, 0)
  const subtotalUsd  = totalGastosUsd * alicuota
  const subtotalBs   = totalGastosBs  * alicuota
  const fondoUsd     = subtotalUsd * (fondoReservaPct / 100)
  const fondoBs      = subtotalBs  * (fondoReservaPct / 100)
  const cargosApto   = cargos.filter(c => c.apartamento_id === apto.id)
  const cargosUsd    = cargosApto.reduce((s, c) => s + c.monto_usd, 0)
  const cargosBs     = cargosApto.reduce((s, c) => s + (c.monto_bs || 0), 0)
  const totalUsd     = subtotalUsd + fondoUsd + cargosUsd
  const totalBs      = subtotalBs  + fondoBs  + cargosBs

  // ── HEADER ──
  doc.setFillColor(...cDark)
  doc.rect(0, 0, 210, 38, 'F')
  doc.setTextColor(...cAccent)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('RECIBO DE CONDOMINIO', 105, 15, { align: 'center' })
  doc.setTextColor(200, 200, 200)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`${config.email_contacto || 'juntacondominioocutuy5@gmail.com'}   |   RIF: ${config.rif || 'J-296749485'}`, 105, 23, { align: 'center' })
  doc.text(config.nombre_edificio || 'RESIDENCIAS OCUTUY 5', 105, 30, { align: 'center' })
  if (config.direccion) doc.text(config.direccion, 105, 36, { align: 'center' })

  // ── INFO INMUEBLE ──
  doc.setDrawColor(...cAccent)
  doc.setLineWidth(0.4)
  doc.line(14, 44, 196, 44)
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(10)

  const left  = [['PROPIETARIO:', apto.propietario_nombre || 'Residente'],['APARTAMENTO:', `Nro. ${apto.numero}`],['ALÍCUOTA:', `${apto.alicuota}%`]]
  const right = [['MES:', mesLabel],['AÑO:', String(anio)]]
  let y = 50
  left.forEach(([l, v])  => { doc.setFont('helvetica','bold'); doc.text(l, 14, y); doc.setFont('helvetica','normal'); doc.text(v, 55, y); y += 6 })
  y = 50
  right.forEach(([l, v]) => { doc.setFont('helvetica','bold'); doc.text(l, 130, y); doc.setFont('helvetica','normal'); doc.text(v, 152, y); y += 6 })

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 68, 196, 68)

  // ── TABLA GASTOS ──
  const bodyGastos = gastos.map(g => [
    g.descripcion,
    `${fmtBs(g.monto_bs)} Bs`,
    `$ ${fmtUsd(g.monto_usd)}`,
  ])

  autoTable(doc, {
    startY: 72,
    headStyles: { fillColor: cDark, textColor: [255,255,255], fontStyle: 'bold', halign: 'center', fontSize: 9 },
    columnStyles: { 0: { cellWidth: 118 }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 28 } },
    head: [['DETALLES DE GASTOS COMUNES', 'BOLÍVARES', 'DÓLAR $']],
    body: bodyGastos,
    alternateRowStyles: { fillColor: [250, 250, 250] },
    styles: { fontSize: 8 },
  })

  let finalY = (doc as any).lastAutoTable.finalY

  // ── SUB TOTALES ──
  const subTotalesBody = [
    ['SUB TOTAL', `${fmtBs(subtotalBs)} Bs`, `$ ${fmtUsd(subtotalUsd)}`],
    [`FONDO DE RESERVA (${fondoReservaPct}%)`, `${fmtBs(fondoBs)} Bs`, `$ ${fmtUsd(fondoUsd)}`],
    ['', `${fmtBs(subtotalBs + fondoBs)} Bs`, `$ ${fmtUsd(subtotalUsd + fondoUsd)}`],
  ]
  autoTable(doc, {
    startY: finalY,
    theme: 'plain',
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 118, halign: 'right', fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 28 } },
    body: subTotalesBody,
  })
  finalY = (doc as any).lastAutoTable.finalY

  // ── CARGOS ESPECIALES ──
  if (cargosApto.length > 0) {
    autoTable(doc, {
      startY: finalY,
      headStyles: { fillColor: [60,30,10], textColor: [255,200,100], fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 0: { cellWidth: 118 }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 28 } },
      head: [['CARGOS ESPECIALES / DEUDAS', 'BOLÍVARES', 'DÓLAR $']],
      body: cargosApto.map(c => [
        `${TIPO_CARGO_LABELS[c.tipo] || c.tipo} — ${c.descripcion}`,
        `${fmtBs(c.monto_bs || 0)} Bs`,
        `$ ${fmtUsd(c.monto_usd)}`,
      ]),
      styles: { fontSize: 8 },
    })
    finalY = (doc as any).lastAutoTable.finalY
  }

  // ── TOTAL A PAGAR ──
  autoTable(doc, {
    startY: finalY,
    theme: 'grid',
    headStyles: { fillColor: cAccent, textColor: [255,255,255], halign: 'center', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 118, halign: 'right', fontStyle: 'bold', textColor: cAccent },
      1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    body: [['TOTAL A PAGAR', `${fmtBs(totalBs)} Bs`, `$ ${fmtUsd(totalUsd)}`]],
    styles: { fontSize: 10 },
  })

  const alertY = (doc as any).lastAutoTable.finalY + 5

  // ── BANNER ADVERTENCIA ──
  doc.setFillColor(254, 240, 138)
  doc.rect(14, alertY, 182, 12, 'F')
  doc.setDrawColor(234, 179, 8)
  doc.rect(14, alertY, 182, 12, 'S')
  doc.setTextColor(92, 60, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(
    `*****ATENCIÓN PAGAR  ${fmtUsd(totalUsd)}  $  ANCLADO AL $ BCV DEL DÍA DE SU PAGO*****`,
    105, alertY + 8, { align: 'center' }
  )

  // ── DATOS BANCARIOS ──
  const notaY = alertY + 18
  doc.setDrawColor(220, 220, 220)
  doc.line(14, notaY, 196, notaY)
  doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DATOS DE PAGO:', 14, notaY + 6)
  doc.setFont('helvetica', 'normal')
  let ly = notaY + 12
  const lineas = [
    config.banco ? `Banco: ${config.banco}` : 'Banco: (configurar en panel admin)',
    config.cuenta_bancaria ? `Cuenta: ${config.cuenta_bancaria}` : '',
    config.titular_cuenta ? `Titular: ${config.titular_cuenta}` : '',
    'Enviar comprobante al correo del condominio.',
  ].filter(Boolean)
  lineas.forEach(l => { doc.text(l, 14, ly); ly += 5 })

  // FOOTER
  doc.setFontSize(7)
  doc.setTextColor(180, 180, 180)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-VE')} · Sistema de Gestión de Condominios`, 105, 286, { align: 'center' })

  return doc
}

// ─── Componente Principal ─────────────────────────────────────────────────
export const AdminGenerarRecibos: React.FC = () => {
  const now = new Date()
  const [paso, setPaso] = useState<1|2|3|4>(1)

  // Paso 1
  const [mes, setMes]   = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())
  const [fondoReservaPct, setFondoReservaPct] = useState(10)
  const [gastos, setGastos]         = useState<GastoComun[]>([])
  const [config, setConfig]         = useState<ConfigEdificio | null>(null)
  const [loading, setLoading]       = useState(true)

  // Paso 2
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([])
  const [cargos, setCargos]             = useState<CargoEspecial[]>([])
  const [cargoForm, setCargoForm]       = useState<{
    aptoId: string; tipo: CargoEspecial['tipo']; descripcion: string; monto_usd: string; monto_bs: string
  } | null>(null)

  // Paso 3
  const [previewAptoIdx, setPreviewAptoIdx] = useState(0)

  // Paso 4
  const [emitiendo, setEmitiendo] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; fail: number } | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const mesStr  = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
  const mesLabel = MESES[mes]

  const totalGastosUsd = gastos.reduce((s, g) => s + g.monto_usd, 0)
  const totalGastosBs  = gastos.reduce((s, g) => s + g.monto_bs,  0)

  // ── Cargar datos ─────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, gastosRes, aptosRes] = await Promise.all([
        supabase.from('configuracion_edificio').select('*').limit(1).maybeSingle(),
        supabase.from('gastos_comunes').select('*')
          .gte('mes_aplicacion', mesStr).lte('mes_aplicacion', mesStr)
          .order('created_at', { ascending: true }),
        supabase.from('apartamentos')
          .select('id, numero, piso, alicuota, propietario_nombre, metros_cuadrados')
          .order('numero', { ascending: true }),
      ])
      if (configRes.data) setConfig(configRes.data)
      if (gastosRes.data) setGastos(gastosRes.data)
      if (aptosRes.data)  setApartamentos(aptosRes.data)
    } finally { setLoading(false) }
  }, [mesStr])

  useEffect(() => { cargarDatos() }, [mes, anio])

  // Cargar cargos especiales del mes
  useEffect(() => {
    if (apartamentos.length === 0) return
    supabase.from('cargos_especiales').select('*')
      .gte('mes_aplicacion', mesStr).lte('mes_aplicacion', mesStr)
      .then(({ data }) => { if (data) setCargos(data) })
  }, [apartamentos, mesStr])

  // ── Cálculo por apto ─────────────────────────────────────────────────
  const calcularApto = (apto: Apartamento) => {
    const a = apto.alicuota / 100
    const subtotalUsd = totalGastosUsd * a
    const subtotalBs  = totalGastosBs  * a
    const fondoUsd    = subtotalUsd * (fondoReservaPct / 100)
    const fondoBs     = subtotalBs  * (fondoReservaPct / 100)
    const caps        = cargos.filter(c => c.apartamento_id === apto.id)
    const cargosUsd   = caps.reduce((s, c) => s + c.monto_usd, 0)
    const cargosBs    = caps.reduce((s, c) => s + (c.monto_bs || 0), 0)
    const totalUsd    = subtotalUsd + fondoUsd + cargosUsd
    const totalBs     = subtotalBs  + fondoBs  + cargosBs
    return { subtotalUsd, subtotalBs, fondoUsd, fondoBs, cargosUsd, cargosBs, totalUsd, totalBs }
  }

  // ── Cargo especial ───────────────────────────────────────────────────
  const agregarCargo = async () => {
    if (!cargoForm?.descripcion || !cargoForm.monto_usd) return
    const musd = parseFloat(cargoForm.monto_usd)
    const mbs  = parseFloat(cargoForm.monto_bs) || 0
    if (isNaN(musd) || musd <= 0) return

    const { data, error } = await supabase.from('cargos_especiales')
      .insert({ apartamento_id: cargoForm.aptoId, tipo: cargoForm.tipo, descripcion: cargoForm.descripcion, monto_usd: musd, monto_bs: mbs, mes_aplicacion: mesStr })
      .select().single()
    if (error) { showToast(`❌ ${error.message}`); return }
    setCargos(prev => [...prev, data])
    setCargoForm(null)
    showToast('✅ Cargo añadido')
  }

  const eliminarCargo = async (id: string) => {
    await supabase.from('cargos_especiales').delete().eq('id', id)
    setCargos(prev => prev.filter(c => c.id !== id))
  }

  // ── Descargar PDF ────────────────────────────────────────────────────
  const descargarPDF = (apto: Apartamento) => {
    if (!config) return
    const doc = generarPDF(apto, gastos, cargos, config, fondoReservaPct, mesLabel, anio)
    doc.save(`Recibo_Apto${apto.numero}_${mesLabel}${anio}.pdf`)
  }

  // ── Emisión masiva ───────────────────────────────────────────────────
  const emitirRecibos = async () => {
    if (!config || apartamentos.length === 0) return
    setEmitiendo(true); setResultado(null)
    let ok = 0, fail = 0

    for (const apto of apartamentos) {
      const calc = calcularApto(apto)
      const { error } = await supabase.from('recibos_generados').upsert({
        apartamento_id:    apto.id,
        mes_facturado:     mesStr,
        tasa_bcv:          config.tasa_bcv_actual || 1,
        total_gastos_usd:  totalGastosUsd,
        alicuota:          apto.alicuota / 100,
        subtotal_usd:      calc.subtotalUsd,
        fondo_reserva_pct: fondoReservaPct,
        fondo_reserva_usd: calc.fondoUsd,
        cargos_extra_usd:  calc.cargosUsd,
        total_usd:         calc.totalUsd,
        total_bs:          calc.totalBs,
        estado:            'pendiente',
        data_json: {
          gastos: gastos.map(g => ({ descripcion: g.descripcion, monto_usd: g.monto_usd, monto_bs: g.monto_bs })),
          cargos_especiales: cargos.filter(c => c.apartamento_id === apto.id),
          fondo_reserva_pct: fondoReservaPct,
        },
        emitido_at: new Date().toISOString(),
      }, { onConflict: 'apartamento_id,mes_facturado' })
      if (error) { fail++; console.error('[Emisión]', apto.numero, error.message) }
      else ok++
    }

    if (cargos.length > 0) {
      await supabase.from('cargos_especiales').update({ aplicado: true }).in('id', cargos.map(c => c.id))
    }

    setResultado({ ok, fail }); setEmitiendo(false); setPaso(4)
  }

  // ─── RENDER ────────────────────────────────────────────────────────────
  const stepColors = ['#f97316','#3b82f6','#8b5cf6','#10b981']

  return (
    <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', backgroundColor:'#1f2937', color:'#fff', border:'1px solid #374151', boxShadow:'0 10px 25px rgba(0,0,0,0.5)', padding:'12px 20px', borderRadius:'10px', zIndex:9999, fontSize:'13px', fontWeight:600 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color:'#fff', fontSize:'26px', fontWeight:800, margin:0 }}>📋 Generación Masiva de Recibos</h1>
        <p style={{ color:'#666', fontSize:'14px', marginTop:'4px' }}>Configura, revisa y emite los recibos del mes para todos los apartamentos</p>
      </div>

      {/* Stepper */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'28px', flexWrap:'wrap' }}>
        {[{n:1,label:'Configuración'},{n:2,label:'Cargos Especiales'},{n:3,label:'Previsualización'},{n:4,label:'Emisión'}].map(({n,label}) => {
          const isActive = paso === n, isDone = paso > n, color = stepColors[n-1]
          return (
            <button key={n} onClick={() => n < paso && setPaso(n as any)}
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 16px', borderRadius:'10px', border:'none',
                cursor: n < paso ? 'pointer' : 'default',
                backgroundColor: isActive ? `${color}18` : '#141414',
                borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                color: isActive ? color : isDone ? '#555' : '#444',
                fontWeight: isActive ? 700 : 600, fontSize:'13px', transition:'all 0.2s' }}>
              <span style={{ width:'22px', height:'22px', borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800,
                backgroundColor: isActive ? color : isDone ? '#333' : '#1a1a1a',
                color: isActive ? '#fff' : isDone ? '#10b981' : '#555' }}>
                {isDone ? '✓' : n}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      {/* ═══ PASO 1: CONFIGURACIÓN ═══ */}
      {paso === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

          {/* Selector Mes/Año + Fondo de Reserva */}
          <div style={{ ...S.card, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', alignItems:'end' }}>
            <div>
              <label style={S.label}>Mes a facturar</label>
              <select style={S.input} value={mes} onChange={e => setMes(Number(e.target.value))}>
                {MESES.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Año</label>
              <input type="number" style={S.input} value={anio} min={2020} max={2035} onChange={e => setAnio(Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Fondo de Reserva (%)</label>
              <input type="number" style={S.input} value={fondoReservaPct} min={0} max={100} onChange={e => setFondoReservaPct(parseFloat(e.target.value)||0)} />
            </div>
          </div>

          {/* Resumen Gastos */}
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px', flexWrap:'wrap', gap:'12px' }}>
              <h3 style={{ color:'#fff', margin:0, fontSize:'15px', fontWeight:700 }}>💸 Gastos Comunes — {mesLabel} {anio}</h3>
              <div style={{ display:'flex', gap:'20px', alignItems:'center' }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ color:'#555', fontSize:'11px', fontWeight:600, textTransform:'uppercase' }}>Total USD</div>
                  <div style={{ color:'#f97316', fontWeight:800, fontSize:'18px' }}>$ {fmtUsd(totalGastosUsd)}</div>
                </div>
                <div style={{ width:'1px', height:'36px', backgroundColor:'#2a2a2a' }} />
                <div style={{ textAlign:'right' }}>
                  <div style={{ color:'#555', fontSize:'11px', fontWeight:600, textTransform:'uppercase' }}>Total Bs</div>
                  <div style={{ color:'#10b981', fontWeight:800, fontSize:'18px' }}>Bs. {fmtBs(totalGastosBs)}</div>
                </div>
              </div>
            </div>

            {loading ? (
              <p style={{ color:'#555', textAlign:'center', padding:'20px' }}>Cargando gastos...</p>
            ) : gastos.length === 0 ? (
              <div style={{ backgroundColor:'#0f0f0f', border:'1px dashed #2a2a2a', borderRadius:'10px', padding:'24px', textAlign:'center' }}>
                <p style={{ color:'#555', fontSize:'14px', margin:0 }}>No hay gastos registrados para este mes.</p>
                <p style={{ color:'#3a3a3a', fontSize:'12px', marginTop:'4px' }}>Regístralos en el módulo "Gastos" y aparecerán aquí.</p>
              </div>
            ) : (
              <>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', marginBottom:'12px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #2a2a2a' }}>
                      {['Descripción','Categoría','Monto Bs','Monto $'].map(h => (
                        <th key={h} style={{ color:'#555', fontSize:'11px', fontWeight:700, padding:'6px 8px', textAlign: h.includes('Monto') ? 'right' : 'left', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map(g => (
                      <tr key={g.id} style={{ borderBottom:'1px solid #111' }}>
                        <td style={{ color:'#ccc', padding:'7px 8px', fontWeight:600 }}>{g.descripcion}</td>
                        <td style={{ color:'#666', padding:'7px 8px', fontSize:'11px' }}>{g.categoria}</td>
                        <td style={{ color:'#10b981', padding:'7px 8px', textAlign:'right', fontWeight:700 }}>Bs. {fmtBs(g.monto_bs)}</td>
                        <td style={{ color:'#f97316', padding:'7px 8px', textAlign:'right', fontWeight:700 }}>$ {fmtUsd(g.monto_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Banner totales */}
                <div style={{ backgroundColor:'#0f0f0f', border:'1px solid #1e1e1e', borderRadius:'8px', padding:'10px 14px', display:'flex', gap:'24px', justifyContent:'flex-end' }}>
                  <span style={{ color:'#555', fontSize:'12px' }}>SUBTOTAL: <strong style={{ color:'#10b981' }}>Bs. {fmtBs(totalGastosBs)}</strong></span>
                  <span style={{ color:'#555', fontSize:'12px' }}>SUBTOTAL: <strong style={{ color:'#f97316' }}>$ {fmtUsd(totalGastosUsd)}</strong></span>
                </div>
              </>
            )}
          </div>

          {/* Tabla resumen por apartamento */}
          {apartamentos.length > 0 && (
            <div style={S.card}>
              <h3 style={{ color:'#fff', margin:'0 0 14px', fontSize:'15px', fontWeight:700 }}>🏠 Resumen por Apartamento</h3>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #2a2a2a' }}>
                      {['Apto','Propietario','Alíc.','Subtotal Bs','Subtotal $','Fondo Bs','Fondo $','Extras','TOTAL Bs','TOTAL $'].map(h => (
                        <th key={h} style={{ color:'#555', fontSize:'10px', fontWeight:700, padding:'6px 8px', textAlign:'right', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apartamentos.map(a => {
                      const c = calcularApto(a)
                      return (
                        <tr key={a.id} style={{ borderBottom:'1px solid #111' }}>
                          <td style={{ color:'#f97316', fontWeight:800, padding:'7px 8px' }}>#{a.numero}</td>
                          <td style={{ color:'#666', padding:'7px 8px', maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.propietario_nombre || '—'}</td>
                          <td style={{ color:'#888', padding:'7px 8px', textAlign:'right' }}>{a.alicuota}%</td>
                          <td style={{ color:'#10b981', padding:'7px 8px', textAlign:'right' }}>{fmtBs(c.subtotalBs)}</td>
                          <td style={{ color:'#f97316', padding:'7px 8px', textAlign:'right' }}>{fmtUsd(c.subtotalUsd)}</td>
                          <td style={{ color:'#888', padding:'7px 8px', textAlign:'right' }}>{fmtBs(c.fondoBs)}</td>
                          <td style={{ color:'#888', padding:'7px 8px', textAlign:'right' }}>{fmtUsd(c.fondoUsd)}</td>
                          <td style={{ color: c.cargosUsd > 0 ? '#f59e0b' : '#444', padding:'7px 8px', textAlign:'right' }}>
                            {c.cargosUsd > 0 ? `$${fmtUsd(c.cargosUsd)}` : '—'}
                          </td>
                          <td style={{ color:'#fff', fontWeight:800, padding:'7px 8px', textAlign:'right' }}>Bs. {fmtBs(c.totalBs)}</td>
                          <td style={{ color:'#fff', fontWeight:800, padding:'7px 8px', textAlign:'right' }}>$ {fmtUsd(c.totalUsd)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => setPaso(2)} disabled={apartamentos.length === 0}
              style={{ ...S.btnPrimary, opacity: apartamentos.length === 0 ? 0.5 : 1 }}>
              Siguiente: Cargos Especiales →
            </button>
          </div>
        </div>
      )}

      {/* ═══ PASO 2: CARGOS ESPECIALES ═══ */}
      {paso === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          <div style={S.card}>
            <h3 style={{ color:'#fff', margin:'0 0 6px', fontSize:'15px', fontWeight:700 }}>⚡ Cargos Especiales por Apartamento</h3>
            <p style={{ color:'#666', fontSize:'13px', margin:'0 0 20px' }}>Se suman individualmente al recibo de cada apartamento.</p>

            {apartamentos.map(apto => {
              const caps = cargos.filter(c => c.apartamento_id === apto.id)
              const isAddingThis = cargoForm?.aptoId === apto.id
              const totalExtraUsd = caps.reduce((s,c) => s + c.monto_usd, 0)

              return (
                <div key={apto.id} style={{ marginBottom:'12px', backgroundColor:'#0f0f0f', border:'1px solid #1e1e1e', borderRadius:'12px', padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: caps.length > 0 ? '10px' : 0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                      <span style={{ color:'#f97316', fontWeight:800, fontSize:'14px' }}>Apto {apto.numero}</span>
                      {apto.propietario_nombre && <span style={{ color:'#555', fontSize:'12px' }}>{apto.propietario_nombre}</span>}
                      {totalExtraUsd > 0 && <span style={S.badge('#f59e0b')}>+$ {fmtUsd(totalExtraUsd)}</span>}
                    </div>
                    <button onClick={() => setCargoForm(isAddingThis ? null : { aptoId: apto.id, tipo:'multa', descripcion:'', monto_usd:'', monto_bs:'' })}
                      style={{ ...S.btnSecondary, fontSize:'12px', padding:'6px 14px' }}>
                      {isAddingThis ? 'Cancelar' : '+ Añadir Cargo'}
                    </button>
                  </div>

                  {caps.map(c => (
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', backgroundColor:'#0a0a0a', borderRadius:'6px', marginBottom:'4px', border:'1px solid #1e1e1e' }}>
                      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                        <span style={S.badge(c.tipo==='multa'?'#ef4444':c.tipo==='deuda_atrasada'?'#f59e0b':'#3b82f6')}>{TIPO_CARGO_LABELS[c.tipo]}</span>
                        <span style={{ color:'#ccc', fontSize:'12px' }}>{c.descripcion}</span>
                      </div>
                      <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                        <span style={{ color:'#f59e0b', fontWeight:700, fontSize:'12px' }}>$ {fmtUsd(c.monto_usd)}</span>
                        {(c.monto_bs||0) > 0 && <span style={{ color:'#10b981', fontWeight:700, fontSize:'12px' }}>Bs. {fmtBs(c.monto_bs||0)}</span>}
                        <button onClick={() => eliminarCargo(c.id)} style={S.btnDanger}>✕</button>
                      </div>
                    </div>
                  ))}

                  {isAddingThis && cargoForm && (
                    <div style={{ marginTop:'10px', padding:'14px', backgroundColor:'#131313', borderRadius:'10px', border:'1px solid #2a2a2a', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:'10px', alignItems:'end' }}>
                      <div>
                        <label style={S.label}>Tipo</label>
                        <select style={S.input} value={cargoForm.tipo} onChange={e => setCargoForm({...cargoForm, tipo: e.target.value as CargoEspecial['tipo']})}>
                          {Object.entries(TIPO_CARGO_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={S.label}>Descripción</label>
                        <input style={S.input} placeholder="Detalle del cargo" value={cargoForm.descripcion} onChange={e => setCargoForm({...cargoForm, descripcion: e.target.value})} />
                      </div>
                      <div>
                        <label style={S.label}>Monto USD $</label>
                        <input type="number" style={{ ...S.input, borderColor:'#f97316', color:'#f97316' }} placeholder="0.00" min="0" step="0.01"
                          value={cargoForm.monto_usd} onChange={e => setCargoForm({...cargoForm, monto_usd: e.target.value})} />
                      </div>
                      <div>
                        <label style={S.label}>Monto Bs</label>
                        <input type="number" style={{ ...S.input, borderColor:'#10b981', color:'#10b981' }} placeholder="0.00" min="0" step="0.01"
                          value={cargoForm.monto_bs} onChange={e => setCargoForm({...cargoForm, monto_bs: e.target.value})} />
                      </div>
                      <button onClick={agregarCargo} style={{ ...S.btnPrimary, whiteSpace:'nowrap' }}>✓ Añadir</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <button onClick={() => setPaso(1)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => { setPreviewAptoIdx(0); setPaso(3) }} style={S.btnPrimary}>Siguiente: Vista Previa →</button>
          </div>
        </div>
      )}

      {/* ═══ PASO 3: PREVISUALIZACIÓN ═══ */}
      {paso === 3 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          {apartamentos.length > 0 && config && (() => {
            const apto = apartamentos[previewAptoIdx]
            const calc = calcularApto(apto)
            const caps = cargos.filter(c => c.apartamento_id === apto.id)

            return (
              <>
                {/* Nav */}
                <div style={{ display:'flex', alignItems:'center', gap:'12px', justifyContent:'center' }}>
                  <button onClick={() => setPreviewAptoIdx(i => Math.max(0,i-1))} disabled={previewAptoIdx===0}
                    style={{ ...S.btnSecondary, opacity: previewAptoIdx===0?0.3:1, padding:'8px 16px' }}>← Anterior</button>
                  <span style={{ color:'#fff', fontWeight:700, fontSize:'14px' }}>Apto {apto.numero} ({previewAptoIdx+1}/{apartamentos.length})</span>
                  <button onClick={() => setPreviewAptoIdx(i => Math.min(apartamentos.length-1,i+1))} disabled={previewAptoIdx===apartamentos.length-1}
                    style={{ ...S.btnSecondary, opacity: previewAptoIdx===apartamentos.length-1?0.3:1, padding:'8px 16px' }}>Siguiente →</button>
                  <button onClick={() => descargarPDF(apto)} style={{ ...S.btnPrimary, marginLeft:'16px' }}>📥 Descargar PDF</button>
                </div>

                {/* Recibo preview — mismo formato que PDF */}
                <div style={{ backgroundColor:'#fff', borderRadius:'14px', padding:'28px 32px', color:'#111', fontFamily:'Arial, sans-serif', maxWidth:'680px', margin:'0 auto', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
                  {/* Header oscuro */}
                  <div style={{ backgroundColor:'#1e1e1e', margin:'-28px -32px 18px', padding:'18px 28px', textAlign:'center' }}>
                    <h2 style={{ color:'#f97316', fontSize:'20px', fontWeight:800, margin:'0 0 4px' }}>RECIBO DE CONDOMINIO</h2>
                    <p style={{ color:'#bbb', fontSize:'10px', margin:0 }}>{config.email_contacto} &nbsp;|&nbsp; RIF: {config.rif}</p>
                    <p style={{ color:'#888', fontSize:'10px', margin:'2px 0 0' }}>{config.nombre_edificio}</p>
                  </div>

                  {/* Info */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px', marginBottom:'12px', fontSize:'11px' }}>
                    <div><strong>PROPIETARIO:</strong> {apto.propietario_nombre || 'Residente'}</div>
                    <div><strong>MES:</strong> {mesLabel}</div>
                    <div><strong>APARTAMENTO:</strong> Nro. {apto.numero}</div>
                    <div><strong>AÑO:</strong> {anio}</div>
                    <div><strong>ALÍCUOTA:</strong> {apto.alicuota}%</div>
                  </div>
                  <hr style={{ border:'none', borderTop:'1px solid #ddd', margin:'10px 0' }} />

                  {/* Tabla gastos */}
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px', marginBottom:'2px' }}>
                    <thead>
                      <tr style={{ backgroundColor:'#1e1e1e', color:'#fff' }}>
                        <th style={{ padding:'5px 7px', textAlign:'left', fontWeight:700 }}>DETALLES DE GASTOS COMUNES</th>
                        <th style={{ padding:'5px 7px', textAlign:'right', minWidth:'90px' }}>BOLÍVARES</th>
                        <th style={{ padding:'5px 7px', textAlign:'right', minWidth:'70px' }}>DÓLAR $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastos.map((g, i) => (
                        <tr key={g.id} style={{ backgroundColor: i%2===0?'#f9f9f9':'#fff' }}>
                          <td style={{ padding:'4px 7px' }}>{g.descripcion}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtBs(g.monto_bs * apto.alicuota/100)}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtUsd(g.monto_usd * apto.alicuota/100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Sub-totales — mismo formato imagen */}
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding:'4px 7px', textAlign:'right', fontWeight:700 }}>SUB TOTAL</td>
                        <td style={{ padding:'4px 7px', textAlign:'right', minWidth:'90px' }}>{fmtBs(calc.subtotalBs)}</td>
                        <td style={{ padding:'4px 7px', textAlign:'right', minWidth:'70px' }}>{fmtUsd(calc.subtotalUsd)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding:'4px 7px', textAlign:'right', fontWeight:700 }}>FONDO DE RESERVA ({fondoReservaPct}%)</td>
                        <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtBs(calc.fondoBs)}</td>
                        <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtUsd(calc.fondoUsd)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding:'4px 7px', textAlign:'right' }}></td>
                        <td style={{ padding:'4px 7px', textAlign:'right', fontWeight:700 }}>{fmtBs(calc.subtotalBs + calc.fondoBs)}</td>
                        <td style={{ padding:'4px 7px', textAlign:'right', fontWeight:700 }}>{fmtUsd(calc.subtotalUsd + calc.fondoUsd)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Cargos especiales */}
                  {caps.length > 0 && (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px', marginTop:'2px' }}>
                      <thead>
                        <tr style={{ backgroundColor:'#3d1f00', color:'#fbbf24' }}>
                          <th style={{ padding:'4px 7px', textAlign:'left' }}>CARGOS ESPECIALES</th>
                          <th style={{ padding:'4px 7px', textAlign:'right' }}>BOLÍVARES</th>
                          <th style={{ padding:'4px 7px', textAlign:'right' }}>DÓLAR $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caps.map(c => (
                          <tr key={c.id} style={{ backgroundColor:'#fffbeb' }}>
                            <td style={{ padding:'4px 7px' }}>{TIPO_CARGO_LABELS[c.tipo]} — {c.descripcion}</td>
                            <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtBs(c.monto_bs||0)}</td>
                            <td style={{ padding:'4px 7px', textAlign:'right' }}>{fmtUsd(c.monto_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* TOTAL A PAGAR */}
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', marginTop:'2px' }}>
                    <tbody>
                      <tr style={{ backgroundColor:'#f97316', color:'#fff' }}>
                        <td style={{ padding:'8px 7px', fontWeight:800, textAlign:'right' }}>TOTAL A PAGAR</td>
                        <td style={{ padding:'8px 7px', textAlign:'right', fontWeight:800, minWidth:'90px' }}>{fmtBs(calc.totalBs)}</td>
                        <td style={{ padding:'8px 7px', textAlign:'right', fontWeight:800, minWidth:'70px' }}>{fmtUsd(calc.totalUsd)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Banner advertencia — formato imagen */}
                  <div style={{ backgroundColor:'#fef08a', border:'2px solid #ca8a04', padding:'7px 10px', margin:'10px 0 8px', textAlign:'center', fontSize:'10px', fontWeight:800, color:'#713f12', letterSpacing:'0.3px' }}>
                    *****ATENCIÓN PAGAR &nbsp;{fmtUsd(calc.totalUsd)}&nbsp; $ &nbsp;ANCLADO AL $ BCV DEL DÍA DE SU PAGO*****
                  </div>

                  {/* Datos bancarios */}
                  <div style={{ borderTop:'1px solid #eee', paddingTop:'8px', fontSize:'10px', color:'#666' }}>
                    <strong style={{ color:'#333' }}>DATOS DE PAGO:</strong>
                    {config.banco && <p style={{ margin:'3px 0' }}>Banco: {config.banco}</p>}
                    {config.cuenta_bancaria && <p style={{ margin:'3px 0' }}>Cuenta: {config.cuenta_bancaria}</p>}
                    {config.titular_cuenta && <p style={{ margin:'3px 0' }}>Titular: {config.titular_cuenta}</p>}
                    <p style={{ margin:'3px 0' }}>Enviar comprobante al correo del condominio.</p>
                  </div>
                </div>
              </>
            )
          })()}

          <div style={{ display:'flex', justifyContent:'space-between', maxWidth:'680px', margin:'0 auto', width:'100%' }}>
            <button onClick={() => setPaso(2)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => setPaso(4)} style={S.btnPrimary}>Siguiente: Emitir →</button>
          </div>
        </div>
      )}

      {/* ═══ PASO 4: EMISIÓN ═══ */}
      {paso === 4 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'20px', maxWidth:'600px', margin:'0 auto' }}>
          {!resultado ? (
            <div style={{ ...S.card, textAlign:'center', padding:'40px 32px' }}>
              <div style={{ fontSize:'48px', marginBottom:'16px' }}>📤</div>
              <h2 style={{ color:'#fff', fontSize:'22px', fontWeight:800, margin:'0 0 10px' }}>Emitir Recibos — {mesLabel} {anio}</h2>
              <p style={{ color:'#666', fontSize:'14px', margin:'0 0 6px' }}>
                Se generarán <strong style={{ color:'#f97316' }}>{apartamentos.length} recibos</strong> y quedarán visibles para los residentes.
              </p>
              <div style={{ backgroundColor:'#0f0f0f', border:'1px solid #1e1e1e', borderRadius:'10px', padding:'16px', margin:'20px 0', textAlign:'left' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', fontSize:'13px' }}>
                  <div><span style={{ color:'#555' }}>Mes:</span> <span style={{ color:'#fff', fontWeight:700 }}>{mesLabel} {anio}</span></div>
                  <div><span style={{ color:'#555' }}>Fondo reserva:</span> <span style={{ color:'#fff', fontWeight:700 }}>{fondoReservaPct}%</span></div>
                  <div><span style={{ color:'#555' }}>Total gastos $:</span> <span style={{ color:'#f97316', fontWeight:800 }}>$ {fmtUsd(totalGastosUsd)}</span></div>
                  <div><span style={{ color:'#555' }}>Total gastos Bs:</span> <span style={{ color:'#10b981', fontWeight:800 }}>Bs. {fmtBs(totalGastosBs)}</span></div>
                  <div><span style={{ color:'#555' }}>Apartamentos:</span> <span style={{ color:'#fff', fontWeight:700 }}>{apartamentos.length}</span></div>
                  <div><span style={{ color:'#555' }}>Cargos especiales:</span> <span style={{ color: cargos.length>0?'#f59e0b':'#555', fontWeight:700 }}>{cargos.length}</span></div>
                </div>
              </div>
              <div style={{ display:'flex', gap:'12px', justifyContent:'center' }}>
                <button onClick={() => setPaso(3)} style={S.btnSecondary}>← Volver a Previsualizar</button>
                <button onClick={emitirRecibos} disabled={emitiendo}
                  style={{ ...S.btnPrimary, opacity: emitiendo?0.7:1, padding:'12px 28px', fontSize:'15px' }}>
                  {emitiendo ? '⏳ Generando...' : '🚀 Generar y Publicar'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ ...S.card, textAlign:'center', padding:'40px 32px' }}>
              <div style={{ fontSize:'56px', marginBottom:'16px' }}>{resultado.fail===0?'🎉':'⚠️'}</div>
              <h2 style={{ color:'#fff', fontSize:'22px', fontWeight:800, margin:'0 0 16px' }}>
                {resultado.fail===0 ? '¡Recibos emitidos exitosamente!' : 'Emisión con errores'}
              </h2>
              <div style={{ display:'flex', gap:'16px', justifyContent:'center', marginBottom:'20px' }}>
                <span style={S.badge('#10b981')}>✅ {resultado.ok} emitidos</span>
                {resultado.fail > 0 && <span style={S.badge('#ef4444')}>❌ {resultado.fail} con error</span>}
              </div>
              <p style={{ color:'#666', fontSize:'13px', margin:'0 0 24px' }}>Los residentes ya pueden ver su deuda y reportar el pago.</p>
              <button onClick={() => { setResultado(null); setPaso(1) }} style={S.btnSecondary}>📋 Generar otro mes</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
