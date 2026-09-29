import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Apartamento {
  id: string
  numero: string
  piso: number | null
  alicuota: number
  propietario_nombre: string | null
  metros_cuadrados: number | null
}

interface GastoComun {
  id: string
  descripcion: string
  categoria: string
  tipo: string
  monto_usd: number
  mes_aplicacion: string
}

interface CargoEspecial {
  id: string
  apartamento_id: string
  tipo: 'multa' | 'deuda_atrasada' | 'cuota_extraordinaria' | 'acuerdo_pago'
  descripcion: string
  monto_usd: number
}

interface ConfigEdificio {
  nombre_edificio: string
  rif: string | null
  direccion: string | null
  email_contacto: string | null
  banco: string | null
  cuenta_bancaria: string | null
  titular_cuenta: string | null
  tasa_bcv_actual: number
}

const TIPO_CARGO_LABELS: Record<string, string> = {
  multa: '⚠️ Multa',
  deuda_atrasada: '🔴 Deuda Atrasada',
  cuota_extraordinaria: '🔷 Cuota Extraordinaria',
  acuerdo_pago: '🤝 Acuerdo de Pago',
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── Estilos compartidos ───────────────────────────────────────────────────
const S = {
  card: { backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px 22px' } as React.CSSProperties,
  input: { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const },
  label: { display: 'block', color: '#888', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  btnPrimary: { backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' } as React.CSSProperties,
  btnSecondary: { backgroundColor: '#1e1e1e', color: '#ccc', border: '1px solid #2a2a2a', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' } as React.CSSProperties,
  btnDanger: { backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444430', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 } as React.CSSProperties,
  badge: (color: string) => ({ backgroundColor: `${color}18`, color, border: `1px solid ${color}35`, padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }) as React.CSSProperties,
}

// ─── PDF Generator ─────────────────────────────────────────────────────────
function generarPDF(
  apto: Apartamento,
  gastos: GastoComun[],
  cargos: CargoEspecial[],
  config: ConfigEdificio,
  tasaBcv: number,
  fondoReservaPct: number,
  mesLabel: string,
  anio: number,
  preview = false
): jsPDF {
  const doc = new jsPDF()
  const cAccent: [number, number, number] = [249, 115, 22]
  const cDark: [number, number, number] = [30, 30, 30]

  const totalGastosUsd = gastos.reduce((s, g) => s + g.monto_usd, 0)
  const alicuota = apto.alicuota / 100
  const subtotalUsd = totalGastosUsd * alicuota
  const fondoUsd = subtotalUsd * (fondoReservaPct / 100)
  const cargosApto = cargos.filter(c => c.apartamento_id === apto.id)
  const cargosUsd = cargosApto.reduce((s, c) => s + c.monto_usd, 0)
  const totalUsd = subtotalUsd + fondoUsd + cargosUsd
  const totalBs = totalUsd * tasaBcv

  // HEADER
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

  // INFO INMUEBLE
  doc.setDrawColor(...cAccent)
  doc.setLineWidth(0.4)
  doc.line(14, 44, 196, 44)
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(10)

  const infoLeft = [
    ['PROPIETARIO:', apto.propietario_nombre || 'Residente'],
    ['APARTAMENTO:', `Nro. ${apto.numero}`],
    ['ALÍCUOTA:', `${apto.alicuota}%`],
  ]
  const infoRight = [
    ['MES:', mesLabel],
    ['AÑO:', String(anio)],
    ['TASA BCV:', `Bs. ${tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / $`],
  ]

  let y = 50
  infoLeft.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(val, 55, y)
    y += 6
  })
  y = 50
  infoRight.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.text(label, 120, y)
    doc.setFont('helvetica', 'normal')
    doc.text(val, 145, y)
    y += 6
  })

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 70, 196, 70)

  // TABLA GASTOS COMUNES
  const bodyGastos = gastos.map(g => [
    g.descripcion,
    `${(g.monto_usd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
    `$ ${g.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  ])

  autoTable(doc, {
    startY: 74,
    headStyles: { fillColor: cDark, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 122 },
      1: { halign: 'right', cellWidth: 36 },
      2: { halign: 'right', cellWidth: 28 },
    },
    head: [['DESCRIPCIÓN DEL GASTO', 'BOLÍVARES', 'USD $']],
    body: bodyGastos,
    alternateRowStyles: { fillColor: [250, 250, 250] },
    styles: { fontSize: 8 },
  })

  let finalY = (doc as any).lastAutoTable.finalY

  // SUBTOTALES
  const subTotalBs = totalGastosUsd * tasaBcv * alicuota
  const fondoBs = subTotalBs * (fondoReservaPct / 100)

  autoTable(doc, {
    startY: finalY,
    theme: 'plain',
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 122, halign: 'right', fontStyle: 'bold' },
      1: { halign: 'right', cellWidth: 36 },
      2: { halign: 'right', cellWidth: 28 },
    },
    body: [
      [`SUMA GASTOS (${apto.alicuota}% alícuota)`,
        `${subTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
        `$ ${subtotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
      [`FONDO DE RESERVA (${fondoReservaPct}%)`,
        `${fondoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
        `$ ${fondoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ],
  })

  finalY = (doc as any).lastAutoTable.finalY

  // CARGOS ESPECIALES (si hay)
  if (cargosApto.length > 0) {
    autoTable(doc, {
      startY: finalY,
      headStyles: { fillColor: [60, 30, 10], textColor: [255, 200, 100], fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 122 },
        1: { halign: 'right', cellWidth: 36 },
        2: { halign: 'right', cellWidth: 28 },
      },
      head: [['CARGOS ESPECIALES / DEUDAS', 'BOLÍVARES', 'USD $']],
      body: cargosApto.map(c => [
        `${TIPO_CARGO_LABELS[c.tipo] || c.tipo} — ${c.descripcion}`,
        `${(c.monto_usd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
        `$ ${c.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      ]),
      styles: { fontSize: 8 },
    })
    finalY = (doc as any).lastAutoTable.finalY
  }

  // TOTAL A PAGAR
  autoTable(doc, {
    startY: finalY,
    theme: 'grid',
    headStyles: { fillColor: cAccent, textColor: [255, 255, 255], halign: 'center', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 122, halign: 'right', fontStyle: 'bold', textColor: cAccent },
      1: { halign: 'right', cellWidth: 36, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    body: [[
      'TOTAL A PAGAR',
      `${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
      `$ ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    ]],
    styles: { fontSize: 10 },
  })

  const alertY = (doc as any).lastAutoTable.finalY + 5

  // BANNER ADVERTENCIA
  doc.setFillColor(254, 240, 138)
  doc.rect(14, alertY, 182, 11, 'F')
  doc.setDrawColor(234, 179, 8)
  doc.rect(14, alertY, 182, 11, 'S')
  doc.setTextColor(92, 60, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(
    `⚠️  ATENCIÓN: PAGAR $ ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} ANCLADO AL BCV DEL DÍA DE SU PAGO`,
    105, alertY + 7, { align: 'center' }
  )

  // DATOS BANCARIOS
  const notaY = alertY + 18
  doc.setDrawColor(220, 220, 220)
  doc.line(14, notaY, 196, notaY)
  doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DATOS DE PAGO:', 14, notaY + 6)
  doc.setFont('helvetica', 'normal')

  const datosBancarios = [
    config.banco ? `Banco: ${config.banco}` : 'Banco: (configurar en panel admin)',
    config.cuenta_bancaria ? `Cuenta: ${config.cuenta_bancaria}` : '',
    config.titular_cuenta ? `Titular: ${config.titular_cuenta}` : '',
    'Pago Móvil disponible — enviar comprobante al correo del condominio.',
  ].filter(Boolean)

  let notaLineY = notaY + 12
  datosBancarios.forEach(line => {
    doc.text(line, 14, notaLineY)
    notaLineY += 5
  })

  // FOOTER
  doc.setFontSize(8)
  doc.setTextColor(180, 180, 180)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-VE')} · Sistema de Gestión de Condominios`, 105, 285, { align: 'center' })

  return doc
}

// ─── Componente Principal ─────────────────────────────────────────────────
export const AdminGenerarRecibos: React.FC = () => {
  const now = new Date()
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1)

  // Paso 1
  const [mes, setMes] = useState(now.getMonth()) // 0-indexed
  const [anio, setAnio] = useState(now.getFullYear())
  const [tasaBcv, setTasaBcv] = useState(0)
  const [fondoReservaPct, setFondoReservaPct] = useState(10)
  const [gastos, setGastos] = useState<GastoComun[]>([])
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)

  // Paso 2
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([])
  const [cargos, setCargos] = useState<CargoEspecial[]>([])
  const [cargoForm, setCargoForm] = useState<{ aptoId: string; tipo: CargoEspecial['tipo']; descripcion: string; monto: string } | null>(null)

  // Paso 3
  const [previewAptoIdx, setPreviewAptoIdx] = useState(0)

  // Paso 4
  const [emitiendo, setEmitiendo] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; fail: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const mesStr = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
  const mesLabel = MESES[mes]

  const totalGastosUsd = gastos.reduce((s, g) => s + g.monto_usd, 0)

  // ── Cargar datos iniciales ────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, gastosRes, aptosRes] = await Promise.all([
        supabase.from('configuracion_edificio').select('*').limit(1).maybeSingle(),
        supabase.from('gastos_comunes').select('*')
          .gte('mes_aplicacion', mesStr)
          .lte('mes_aplicacion', mesStr)
          .order('created_at', { ascending: true }),
        supabase.from('apartamentos').select('id, numero, piso, alicuota, propietario_nombre, metros_cuadrados')
          .order('numero', { ascending: true }),
      ])

      if (configRes.data) {
        setConfig(configRes.data)
        if (!tasaBcv && configRes.data.tasa_bcv_actual) setTasaBcv(configRes.data.tasa_bcv_actual)
      }
      if (gastosRes.data) setGastos(gastosRes.data)
      if (aptosRes.data) setApartamentos(aptosRes.data)
    } catch (err) {
      console.error('[AdminGenerarRecibos] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [mesStr, tasaBcv])

  useEffect(() => { cargarDatos() }, [mes, anio])

  // Cargar cargos especiales del mes
  useEffect(() => {
    if (apartamentos.length === 0) return
    supabase.from('cargos_especiales').select('*')
      .gte('mes_aplicacion', mesStr)
      .lte('mes_aplicacion', mesStr)
      .then(({ data }) => { if (data) setCargos(data) })
  }, [apartamentos, mesStr])

  // ── Helpers de cálculo ───────────────────────────────────
  const calcularApto = (apto: Apartamento) => {
    const alicuota = apto.alicuota / 100
    const subtotalUsd = totalGastosUsd * alicuota
    const fondoUsd = subtotalUsd * (fondoReservaPct / 100)
    const cargosApto = cargos.filter(c => c.apartamento_id === apto.id)
    const cargosUsd = cargosApto.reduce((s, c) => s + c.monto_usd, 0)
    const totalUsd = subtotalUsd + fondoUsd + cargosUsd
    return { subtotalUsd, fondoUsd, cargosUsd, totalUsd, totalBs: totalUsd * tasaBcv }
  }

  // ── Añadir cargo especial ────────────────────────────────
  const agregarCargo = async () => {
    if (!cargoForm || !cargoForm.descripcion || !cargoForm.monto) return
    const montoNum = parseFloat(cargoForm.monto)
    if (isNaN(montoNum) || montoNum <= 0) return

    const nuevo: Omit<CargoEspecial, 'id'> & { mes_aplicacion: string } = {
      apartamento_id: cargoForm.aptoId,
      tipo: cargoForm.tipo,
      descripcion: cargoForm.descripcion,
      monto_usd: montoNum,
      mes_aplicacion: mesStr,
    }

    const { data, error } = await supabase.from('cargos_especiales').insert(nuevo).select().single()
    if (error) { showToast(`❌ Error: ${error.message}`); return }
    setCargos(prev => [...prev, data])
    setCargoForm(null)
    showToast('✅ Cargo especial añadido')
  }

  const eliminarCargo = async (id: string) => {
    await supabase.from('cargos_especiales').delete().eq('id', id)
    setCargos(prev => prev.filter(c => c.id !== id))
  }

  // ── Descargar PDF de un apartamento ─────────────────────
  const descargarPDF = (apto: Apartamento) => {
    if (!config) return
    const doc = generarPDF(apto, gastos, cargos, config, tasaBcv, fondoReservaPct, mesLabel, anio)
    doc.save(`Recibo_Apto${apto.numero}_${mesLabel}${anio}.pdf`)
  }

  // ── Emisión Masiva ───────────────────────────────────────
  const emitirRecibos = async () => {
    if (!config || apartamentos.length === 0) return
    setEmitiendo(true)
    setResultado(null)
    let ok = 0, fail = 0

    for (const apto of apartamentos) {
      const { subtotalUsd, fondoUsd, cargosUsd, totalUsd, totalBs } = calcularApto(apto)
      const dataJson = {
        gastos: gastos.map(g => ({ descripcion: g.descripcion, monto_usd: g.monto_usd })),
        cargos_especiales: cargos.filter(c => c.apartamento_id === apto.id),
        tasa_bcv: tasaBcv,
        fondo_reserva_pct: fondoReservaPct,
      }

      const { error } = await supabase.from('recibos_generados').upsert({
        apartamento_id: apto.id,
        mes_facturado: mesStr,
        tasa_bcv: tasaBcv,
        total_gastos_usd: totalGastosUsd,
        alicuota: apto.alicuota / 100,
        subtotal_usd: subtotalUsd,
        fondo_reserva_pct: fondoReservaPct,
        fondo_reserva_usd: fondoUsd,
        cargos_extra_usd: cargosUsd,
        total_usd: totalUsd,
        total_bs: totalBs,
        estado: 'pendiente',
        data_json: dataJson,
        emitido_at: new Date().toISOString(),
      }, { onConflict: 'apartamento_id,mes_facturado' })

      if (error) { fail++; console.error('[Emisión]', apto.numero, error.message) }
      else ok++
    }

    // Marcar cargos_especiales como aplicados
    const cargoIds = cargos.map(c => c.id)
    if (cargoIds.length > 0) {
      await supabase.from('cargos_especiales').update({ aplicado: true }).in('id', cargoIds)
    }

    setResultado({ ok, fail })
    setEmitiendo(false)
    setPaso(4)
  }

  // ─── RENDER ────────────────────────────────────────────────────────────
  const stepColors = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981']

  return (
    <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', padding: '12px 20px', borderRadius: '10px', zIndex: 9999, fontSize: '13px', fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 800, margin: 0 }}>
          📋 Generación Masiva de Recibos
        </h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
          Configura, revisa y emite los recibos del mes para todos los apartamentos
        </p>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {[
          { n: 1, label: 'Configuración' },
          { n: 2, label: 'Cargos Especiales' },
          { n: 3, label: 'Previsualización' },
          { n: 4, label: 'Emisión' },
        ].map(({ n, label }) => {
          const isActive = paso === n
          const isDone = paso > n
          const color = stepColors[n - 1]
          return (
            <button
              key={n}
              onClick={() => n < paso && setPaso(n as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                borderRadius: '10px', border: 'none', cursor: n < paso ? 'pointer' : 'default',
                backgroundColor: isActive ? `${color}18` : '#141414',
                borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                color: isActive ? color : isDone ? '#555' : '#444',
                fontWeight: isActive ? 700 : 600, fontSize: '13px', transition: 'all 0.2s',
              }}
            >
              <span style={{
                width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800,
                backgroundColor: isActive ? color : isDone ? '#333' : '#1a1a1a',
                color: isActive ? '#fff' : isDone ? '#10b981' : '#555',
              }}>
                {isDone ? '✓' : n}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      {/* ═══════════ PASO 1: CONFIGURACIÓN ═══════════ */}
      {paso === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Selector Mes/Año y Tasa */}
          <div style={{ ...S.card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', alignItems: 'end' }}>
            <div>
              <label style={S.label}>Mes a facturar</label>
              <select style={S.input} value={mes} onChange={e => setMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Año</label>
              <input type="number" style={S.input} value={anio} min={2020} max={2035}
                onChange={e => setAnio(Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Tasa BCV (Bs / $)</label>
              <input type="number" style={{ ...S.input, borderColor: '#f97316', color: '#f97316', fontWeight: 700 }}
                value={tasaBcv} step="0.01" min={0}
                onChange={e => setTasaBcv(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={S.label}>Fondo de Reserva (%)</label>
              <input type="number" style={S.input} value={fondoReservaPct} min={0} max={100}
                onChange={e => setFondoReservaPct(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* Resumen Gastos */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '15px', fontWeight: 700 }}>
                💸 Gastos Comunes — {mesLabel} {anio}
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: '13px' }}>Total:</span>
                <span style={{ color: '#f97316', fontWeight: 800, fontSize: '16px' }}>
                  $ {totalGastosUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                {tasaBcv > 0 && (
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    = Bs. {(totalGastosUsd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <p style={{ color: '#555', textAlign: 'center', padding: '20px' }}>Cargando gastos...</p>
            ) : gastos.length === 0 ? (
              <div style={{ backgroundColor: '#0f0f0f', border: '1px dashed #2a2a2a', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
                <p style={{ color: '#555', fontSize: '14px' }}>No hay gastos registrados para este mes.</p>
                <p style={{ color: '#444', fontSize: '12px', marginTop: '4px' }}>Registra los gastos en el módulo "Gastos" y aparecerán aquí.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {gastos.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#0f0f0f', borderRadius: '8px', border: '1px solid #1e1e1e' }}>
                    <div>
                      <span style={{ color: '#ccc', fontSize: '13px', fontWeight: 600 }}>{g.descripcion}</span>
                      <span style={{ color: '#555', fontSize: '11px', marginLeft: '8px' }}>{g.categoria}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#f97316', fontWeight: 700, fontSize: '13px' }}>$ {g.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      {tasaBcv > 0 && <div style={{ color: '#555', fontSize: '11px' }}>Bs. {(g.monto_usd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen de apartamentos */}
          {apartamentos.length > 0 && tasaBcv > 0 && (
            <div style={S.card}>
              <h3 style={{ color: '#fff', margin: '0 0 14px', fontSize: '15px', fontWeight: 700 }}>🏠 Resumen por Apartamento</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                      {['Apto', 'Propietario', 'Alícuota', 'Subtotal $', 'Fondo Res.', 'Cargos Extra', 'TOTAL $', 'TOTAL Bs'].map(h => (
                        <th key={h} style={{ color: '#555', fontSize: '11px', fontWeight: 700, padding: '8px 10px', textAlign: 'right', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apartamentos.map(a => {
                      const calc = calcularApto(a)
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid #111' }}>
                          <td style={{ color: '#f97316', fontWeight: 700, padding: '8px 10px' }}>Apto {a.numero}</td>
                          <td style={{ color: '#888', padding: '8px 10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.propietario_nombre || '—'}</td>
                          <td style={{ color: '#888', padding: '8px 10px', textAlign: 'right' }}>{a.alicuota}%</td>
                          <td style={{ color: '#ccc', padding: '8px 10px', textAlign: 'right' }}>$ {calc.subtotalUsd.toFixed(2)}</td>
                          <td style={{ color: '#ccc', padding: '8px 10px', textAlign: 'right' }}>$ {calc.fondoUsd.toFixed(2)}</td>
                          <td style={{ color: calc.cargosUsd > 0 ? '#f59e0b' : '#444', padding: '8px 10px', textAlign: 'right' }}>
                            {calc.cargosUsd > 0 ? `$ ${calc.cargosUsd.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ color: '#fff', fontWeight: 700, padding: '8px 10px', textAlign: 'right' }}>$ {calc.totalUsd.toFixed(2)}</td>
                          <td style={{ color: '#10b981', fontWeight: 700, padding: '8px 10px', textAlign: 'right' }}>Bs. {calc.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setPaso(2)}
              disabled={tasaBcv <= 0 || apartamentos.length === 0}
              style={{ ...S.btnPrimary, opacity: tasaBcv <= 0 || apartamentos.length === 0 ? 0.5 : 1 }}
            >
              Siguiente: Cargos Especiales →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PASO 2: CARGOS ESPECIALES ═══════════ */}
      {paso === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...S.card }}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '15px', fontWeight: 700 }}>
              ⚡ Cargos Especiales por Apartamento
            </h3>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 20px' }}>
              Estos montos se suman al recibo individual de cada apartamento, sin afectar a los demás.
            </p>

            {apartamentos.map(apto => {
              const cargosApto = cargos.filter(c => c.apartamento_id === apto.id)
              const totalExtra = cargosApto.reduce((s, c) => s + c.monto_usd, 0)
              const isAddingThis = cargoForm?.aptoId === apto.id

              return (
                <div key={apto.id} style={{ marginBottom: '12px', backgroundColor: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cargosApto.length > 0 ? '10px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#f97316', fontWeight: 800, fontSize: '14px' }}>Apto {apto.numero}</span>
                      {apto.propietario_nombre && <span style={{ color: '#555', fontSize: '12px' }}>{apto.propietario_nombre}</span>}
                      {totalExtra > 0 && <span style={S.badge('#f59e0b')}>+${totalExtra.toFixed(2)}</span>}
                    </div>
                    <button
                      onClick={() => setCargoForm(isAddingThis ? null : { aptoId: apto.id, tipo: 'multa', descripcion: '', monto: '' })}
                      style={{ ...S.btnSecondary, fontSize: '12px', padding: '6px 14px' }}
                    >
                      {isAddingThis ? 'Cancelar' : '+ Añadir Cargo'}
                    </button>
                  </div>

                  {/* Cargos existentes */}
                  {cargosApto.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', backgroundColor: '#0a0a0a', borderRadius: '6px', marginBottom: '4px', border: '1px solid #1e1e1e' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={S.badge(c.tipo === 'multa' ? '#ef4444' : c.tipo === 'deuda_atrasada' ? '#f59e0b' : '#3b82f6')}>
                          {TIPO_CARGO_LABELS[c.tipo]}
                        </span>
                        <span style={{ color: '#ccc', fontSize: '12px' }}>{c.descripcion}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '13px' }}>$ {c.monto_usd.toFixed(2)}</span>
                        <button onClick={() => eliminarCargo(c.id)} style={S.btnDanger}>✕</button>
                      </div>
                    </div>
                  ))}

                  {/* Formulario para este apto */}
                  {isAddingThis && cargoForm && (
                    <div style={{ marginTop: '10px', padding: '14px', backgroundColor: '#131313', borderRadius: '10px', border: '1px solid #2a2a2a', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                      <div>
                        <label style={S.label}>Tipo de Cargo</label>
                        <select style={S.input} value={cargoForm.tipo}
                          onChange={e => setCargoForm({ ...cargoForm, tipo: e.target.value as CargoEspecial['tipo'] })}>
                          {Object.entries(TIPO_CARGO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={S.label}>Descripción</label>
                        <input style={S.input} placeholder="Ej: Pago atrasado Sep 2025"
                          value={cargoForm.descripcion}
                          onChange={e => setCargoForm({ ...cargoForm, descripcion: e.target.value })} />
                      </div>
                      <div>
                        <label style={S.label}>Monto (USD $)</label>
                        <input type="number" style={S.input} placeholder="0.00" min="0" step="0.01"
                          value={cargoForm.monto}
                          onChange={e => setCargoForm({ ...cargoForm, monto: e.target.value })} />
                      </div>
                      <button onClick={agregarCargo} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>
                        ✓ Añadir
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setPaso(1)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => { setPreviewAptoIdx(0); setPaso(3) }} style={S.btnPrimary}>
              Siguiente: Vista Previa PDF →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PASO 3: PREVISUALIZACIÓN ═══════════ */}
      {paso === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {apartamentos.length > 0 && config && (() => {
            const apto = apartamentos[previewAptoIdx]
            const calc = calcularApto(apto)
            const cargosApto = cargos.filter(c => c.apartamento_id === apto.id)

            return (
              <>
                {/* Navegación entre aptos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                  <button onClick={() => setPreviewAptoIdx(i => Math.max(0, i - 1))} disabled={previewAptoIdx === 0}
                    style={{ ...S.btnSecondary, opacity: previewAptoIdx === 0 ? 0.3 : 1, padding: '8px 16px' }}>
                    ← Anterior
                  </button>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                    Apto {apto.numero} ({previewAptoIdx + 1} / {apartamentos.length})
                  </span>
                  <button onClick={() => setPreviewAptoIdx(i => Math.min(apartamentos.length - 1, i + 1))}
                    disabled={previewAptoIdx === apartamentos.length - 1}
                    style={{ ...S.btnSecondary, opacity: previewAptoIdx === apartamentos.length - 1 ? 0.3 : 1, padding: '8px 16px' }}>
                    Siguiente →
                  </button>
                  <button onClick={() => descargarPDF(apto)} style={{ ...S.btnPrimary, marginLeft: '16px' }}>
                    📥 Descargar PDF
                  </button>
                </div>

                {/* Vista Previa del Recibo */}
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', color: '#111', fontFamily: 'Arial, sans-serif', maxWidth: '700px', margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  {/* Header */}
                  <div style={{ backgroundColor: '#1e1e1e', margin: '-32px -32px 20px', padding: '20px 32px', textAlign: 'center' }}>
                    <h2 style={{ color: '#f97316', fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>RECIBO DE CONDOMINIO</h2>
                    <p style={{ color: '#bbb', fontSize: '11px', margin: 0 }}>{config.email_contacto} · RIF: {config.rif}</p>
                    <p style={{ color: '#888', fontSize: '11px', margin: '2px 0 0' }}>{config.nombre_edificio}</p>
                  </div>

                  {/* Info inmueble */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px', fontSize: '12px' }}>
                    <div><strong>Propietario:</strong> {apto.propietario_nombre || 'Residente'}</div>
                    <div><strong>Mes/Año:</strong> {mesLabel} {anio}</div>
                    <div><strong>Apartamento:</strong> Nro. {apto.numero}</div>
                    <div><strong>Alícuota:</strong> {apto.alicuota}%</div>
                    <div><strong>Tasa BCV:</strong> Bs. {tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2 })} / $</div>
                  </div>
                  <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '12px 0' }} />

                  {/* Gastos */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '4px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1e1e1e', color: '#fff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>DESCRIPCIÓN</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>BOLÍVARES</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>USD $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastos.map((g, i) => (
                        <tr key={g.id} style={{ backgroundColor: i % 2 === 0 ? '#f9f9f9' : '#fff' }}>
                          <td style={{ padding: '5px 8px' }}>{g.descripcion}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>Bs. {(g.monto_usd * tasaBcv * apto.alicuota / 100).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>$ {(g.monto_usd * apto.alicuota / 100).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totales */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '4px' }}>
                    <tbody>
                      <tr><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>SUB TOTAL</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>Bs. {(calc.subtotalUsd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>$ {calc.subtotalUsd.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>FONDO DE RESERVA ({fondoReservaPct}%)</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>Bs. {(calc.fondoUsd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>$ {calc.fondoUsd.toFixed(2)}</td></tr>
                    </tbody>
                  </table>

                  {/* Cargos especiales */}
                  {cargosApto.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '4px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#3d1f00', color: '#fbbf24' }}>
                          <th style={{ padding: '5px 8px', textAlign: 'left' }}>CARGOS ESPECIALES</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right' }}>BOLÍVARES</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right' }}>USD $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cargosApto.map(c => (
                          <tr key={c.id} style={{ backgroundColor: '#fffbeb' }}>
                            <td style={{ padding: '5px 8px' }}>{TIPO_CARGO_LABELS[c.tipo]} — {c.descripcion}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>Bs. {(c.monto_usd * tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>$ {c.monto_usd.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Total Final */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      <tr style={{ backgroundColor: '#f97316', color: '#fff' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 800, textAlign: 'right' }}>TOTAL A PAGAR</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800 }}>Bs. {calc.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800 }}>$ {calc.totalUsd.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Banner advertencia */}
                  <div style={{ backgroundColor: '#fef08a', border: '1px solid #ca8a04', padding: '8px 12px', borderRadius: '6px', margin: '12px 0', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#713f12' }}>
                    ⚠️ ATENCIÓN: PAGAR $ {calc.totalUsd.toFixed(2)} ANCLADO AL BCV DEL DÍA DE SU PAGO
                  </div>

                  {/* Datos bancarios */}
                  <div style={{ borderTop: '1px solid #eee', paddingTop: '10px', fontSize: '11px', color: '#666' }}>
                    <strong style={{ color: '#333' }}>DATOS DE PAGO:</strong>
                    {config.banco && <p style={{ margin: '4px 0' }}>Banco: {config.banco}</p>}
                    {config.cuenta_bancaria && <p style={{ margin: '4px 0' }}>Cuenta: {config.cuenta_bancaria}</p>}
                    {config.titular_cuenta && <p style={{ margin: '4px 0' }}>Titular: {config.titular_cuenta}</p>}
                    <p style={{ margin: '4px 0' }}>Enviar comprobante al correo del condominio.</p>
                  </div>
                </div>
              </>
            )
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
            <button onClick={() => setPaso(2)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => setPaso(4)} style={S.btnPrimary}>
              Siguiente: Emitir Recibos →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PASO 4: EMISIÓN ═══════════ */}
      {paso === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>

          {!resultado ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '40px 32px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📤</div>
              <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 10px' }}>
                Emitir Recibos — {mesLabel} {anio}
              </h2>
              <p style={{ color: '#666', fontSize: '14px', margin: '0 0 6px' }}>
                Se generarán <strong style={{ color: '#f97316' }}>{apartamentos.length} recibos</strong> y quedarán disponibles para los residentes.
              </p>
              <p style={{ color: '#555', fontSize: '12px', margin: '0 0 28px' }}>
                Los cargos especiales configurados ({cargos.length}) serán marcados como aplicados.
              </p>

              {/* Resumen final */}
              <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div><span style={{ color: '#555' }}>Mes:</span> <span style={{ color: '#fff', fontWeight: 700 }}>{mesLabel} {anio}</span></div>
                  <div><span style={{ color: '#555' }}>Tasa BCV:</span> <span style={{ color: '#f97316', fontWeight: 700 }}>Bs. {tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></div>
                  <div><span style={{ color: '#555' }}>Total gastos:</span> <span style={{ color: '#fff', fontWeight: 700 }}>$ {totalGastosUsd.toFixed(2)}</span></div>
                  <div><span style={{ color: '#555' }}>Fondo reserva:</span> <span style={{ color: '#fff', fontWeight: 700 }}>{fondoReservaPct}%</span></div>
                  <div><span style={{ color: '#555' }}>Apartamentos:</span> <span style={{ color: '#fff', fontWeight: 700 }}>{apartamentos.length}</span></div>
                  <div><span style={{ color: '#555' }}>Cargos especiales:</span> <span style={{ color: cargos.length > 0 ? '#f59e0b' : '#555', fontWeight: 700 }}>{cargos.length}</span></div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => setPaso(3)} style={S.btnSecondary}>← Volver a Previsualizar</button>
                <button
                  onClick={emitirRecibos}
                  disabled={emitiendo || tasaBcv <= 0}
                  style={{ ...S.btnPrimary, opacity: emitiendo || tasaBcv <= 0 ? 0.7 : 1, padding: '12px 28px', fontSize: '15px' }}
                >
                  {emitiendo ? '⏳ Generando...' : '🚀 Generar Recibos y Publicar'}
                </button>
              </div>
            </div>
          ) : (
            /* Resultado */
            <div style={{ ...S.card, textAlign: 'center', padding: '40px 32px' }}>
              <div style={{ fontSize: '56px', marginBottom: '16px' }}>{resultado.fail === 0 ? '🎉' : '⚠️'}</div>
              <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 10px' }}>
                {resultado.fail === 0 ? '¡Recibos emitidos exitosamente!' : 'Emisión completada con errores'}
              </h2>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '20px 0' }}>
                <div style={{ ...S.badge('#10b981'), fontSize: '14px', padding: '8px 18px' }}>
                  ✅ {resultado.ok} recibos emitidos
                </div>
                {resultado.fail > 0 && (
                  <div style={{ ...S.badge('#ef4444'), fontSize: '14px', padding: '8px 18px' }}>
                    ❌ {resultado.fail} con error
                  </div>
                )}
              </div>
              <p style={{ color: '#666', fontSize: '13px', margin: '0 0 24px' }}>
                Los residentes ya pueden ver su deuda en su panel y reportar el pago.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => { setResultado(null); setPaso(1) }} style={S.btnSecondary}>
                  📋 Generar otro mes
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
