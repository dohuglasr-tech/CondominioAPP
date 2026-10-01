import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { notificarApartamento } from '../../../data/notificacionesService'
import { despacharEmailRecibo } from '../../../data/emailService'
import { getAlicuotaDecimal, formatAlicuotaPct, compararApartamentos } from '../../../utils/alicuota'
import { generarPDFRecibo } from '../../../utils/reciboPdfGenerator'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Apartamento {
  id: string; numero: string; piso: number | null
  alicuota: number; propietario_nombre: string | null; propietario_email?: string | null; metros_cuadrados: number | null
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
  email_contacto: string | null; dominio_email?: string | null; banco: string | null
  cuenta_bancaria: string | null; titular_cuenta: string | null
  tasa_bcv_actual: number
  fecha_inicio_gestion?: string | null
  fecha_fin_administracion_anterior?: string | null
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

const DEFAULT_NOTAS = `DEPOSITAR EN CUENTA CORRIENTE NRO 0175-0525-4100-7575-1351 BANCO BICENTENARIO A NOMBRE DE ZORAYA ALMEIDA, CÉDULA V-6089037. VERIFICAR QUE SE REALICE LA TRANSACCIÓN. PAGO MÓVIL DISPONIBLE.
VECINOS: FAVOR NO LANZAR BOTELLAS NI VIDRIOS POR EL BAJANTE, ES SUMAMENTE PELIGROSO.
VECINOS: FAVOR REVISAR SUS FILTRACIONES Y DRENAJES DE AIRES ACONDICIONADOS.`
// ─── PDF Generator (Unificado mediante reciboPdfGenerator oficial) ───
const generarPDF = generarPDFRecibo


// ─── Componente Principal ─────────────────────────────────────────────────
export const AdminGenerarRecibos: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [paso, setPaso] = useState<1|2|3|4>(1)

  // Paso 1
  const [mes, setMes]   = useState(now.getMonth())
  const [anio, setAnio] = useState(now.getFullYear())
  const [fondoReservaPct, setFondoReservaPct] = useState(10)
  const [fondoReservaPhPct, setFondoReservaPhPct] = useState(10)
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
  const [notasResidentes, setNotasResidentes] = useState(DEFAULT_NOTAS)

  // Paso 4
  const [emitiendo, setEmitiendo] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; fail: number } | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  const [esIndexado, setEsIndexado] = useState(true)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const mesStr  = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
  const fechaEntradaActual = (config?.fecha_inicio_gestion || '2026-09-01').slice(0, 7)
  const esHistorico = mesStr.slice(0, 7) < fechaEntradaActual
  const mesLabel = MESES[mes]

  const totalGastosUsd = gastos.reduce((s, g) => s + g.monto_usd, 0)
  const totalGastosBs  = gastos.reduce((s, g) => s + g.monto_bs,  0)

  // ── Cargar datos ─────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, gastosRes, aptosRes, perfilesRes] = await Promise.all([
        supabase.from('configuracion_edificio').select('*').limit(1).maybeSingle(),
        supabase.from('gastos_comunes').select('*')
          .gte('mes_aplicacion', mesStr).lte('mes_aplicacion', mesStr)
          .order('created_at', { ascending: true }),
        supabase.from('apartamentos')
          .select('id, numero, piso, alicuota, propietario_nombre, metros_cuadrados'),
        supabase.from('perfiles')
          .select('id, apartamento_id, nombre_completo, condicion_habitacional, propietario_nombre, propietario_email'),
      ])
      if (configRes.data) setConfig(configRes.data)
      if (gastosRes.data) setGastos(gastosRes.data)
      if (aptosRes.data) {
        const perfilesMap = new Map<string, any>()
        perfilesRes.data?.forEach(p => {
          if (p.apartamento_id) {
            const exist = perfilesMap.get(p.apartamento_id)
            if (!exist || (!exist.propietario_email && p.propietario_email)) {
              perfilesMap.set(p.apartamento_id, p)
            }
          }
        })

        const ordenados = [...aptosRes.data].map(a => {
          const perfil = perfilesMap.get(a.id)
          const nombre = (perfil?.condicion_habitacional === 'alquilado' && perfil?.propietario_nombre)
            ? perfil.propietario_nombre
            : (perfil?.nombre_completo || a.propietario_nombre || null)
          const email = perfil?.propietario_email || null

          return {
            ...a,
            propietario_nombre: nombre,
            propietario_email: email
          }
        }).sort((a, b) => compararApartamentos(a.numero, b.numero))

        setApartamentos(ordenados)
      }
    } finally { setLoading(false) }
  }, [mesStr])

  useEffect(() => { cargarDatos() }, [mes, anio])
  useEffect(() => { setEsIndexado(!esHistorico) }, [esHistorico])

  // Cargar cargos especiales del mes
  useEffect(() => {
    if (apartamentos.length === 0) return
    supabase.from('cargos_especiales').select('*')
      .gte('mes_aplicacion', mesStr).lte('mes_aplicacion', mesStr)
      .then(({ data }) => { if (data) setCargos(data) })
  }, [apartamentos, mesStr])

  // ── Cálculo por apto ─────────────────────────────────────────────────
  const calcularApto = (apto: Apartamento) => {
    const a = getAlicuotaDecimal(apto.alicuota)
    const subtotalUsd = totalGastosUsd * a
    const subtotalBs  = totalGastosBs  * a
    const esPH = apto.numero.toUpperCase().includes('PH') || apto.piso === 11
    const pctApto = esPH ? fondoReservaPhPct : fondoReservaPct
    const fondoUsd    = subtotalUsd * (pctApto / 100)
    const fondoBs     = subtotalBs  * (pctApto / 100)
    const caps        = cargos.filter(c => c.apartamento_id === apto.id)
    const cargosUsd   = caps.reduce((s, c) => s + c.monto_usd, 0)
    const cargosBs    = caps.reduce((s, c) => s + (c.monto_bs || 0), 0)
    const totalUsd    = subtotalUsd + fondoUsd + cargosUsd
    const totalBs     = subtotalBs  + fondoBs  + cargosBs
    return { subtotalUsd, subtotalBs, fondoUsd, fondoBs, cargosUsd, cargosBs, totalUsd, totalBs, esPH, pctApto }
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
    const esPH = apto.numero.toUpperCase().includes('PH') || apto.piso === 11
    const pct = esPH ? fondoReservaPhPct : fondoReservaPct
    const doc = generarPDF(apto, gastos, cargos, config, pct, mesLabel, anio, notasResidentes)
    doc.save(`Recibo_Apto${apto.numero}_${mesLabel}${anio}.pdf`)
  }

  // ── Emisión masiva ───────────────────────────────────────────────────
  const emitirRecibos = async () => {
    if (!config || apartamentos.length === 0) return
    setEmitiendo(true); setResultado(null)

    // 1. Limpiar cualquier emisión previa de este mes específico
    const { error: delErr } = await supabase
      .from('recibos_generados')
      .delete()
      .eq('mes_facturado', mesStr)

    if (delErr) {
      console.warn('[Emisión] Advertencia al limpiar mes anterior:', delErr.message)
    }

    // 2. Preparar los payloads de los 62 apartamentos
    const payloads = apartamentos.map(apto => {
      const calc = calcularApto(apto)
      return {
        apartamento_id:    apto.id,
        mes_facturado:     mesStr,
        tasa_bcv:          esHistorico
          ? (totalGastosUsd > 0 && totalGastosBs > 0 ? parseFloat((totalGastosBs / totalGastosUsd).toFixed(4)) : 0)
          : (config.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (totalGastosUsd > 0 ? parseFloat((totalGastosBs / totalGastosUsd).toFixed(4)) : 859.06)),
        total_gastos_usd:  totalGastosUsd,
        alicuota:          getAlicuotaDecimal(apto.alicuota),
        subtotal_usd:      calc.subtotalUsd,
        fondo_reserva_pct: calc.pctApto,
        fondo_reserva_usd: calc.fondoUsd,
        cargos_extra_usd:  calc.cargosUsd,
        total_usd:         calc.totalUsd,
        total_bs:          calc.totalBs,
        estado:            'pendiente',
        es_indexado:       esIndexado,
        data_json: {
          gastos: gastos.map(g => ({ descripcion: g.descripcion, monto_usd: g.monto_usd, monto_bs: g.monto_bs })),
          cargos_especiales: cargos.filter(c => c.apartamento_id === apto.id),
          fondo_reserva_pct: calc.pctApto,
          notas_residentes: notasResidentes,
          es_indexado: esIndexado,
        },
        emitido_at: new Date().toISOString(),
      }
    })

    // 3. Insertar en lotes seguros de 25 registros
    let ok = 0, fail = 0
    const batchSize = 25
    for (let i = 0; i < payloads.length; i += batchSize) {
      const batch = payloads.slice(i, i + batchSize)
      const { error } = await supabase.from('recibos_generados').insert(batch)
      if (error) {
        fail += batch.length
        console.error('[Emisión] Error insertando lote:', error.message)
      } else {
        ok += batch.length
      }
    }

    if (cargos.length > 0) {
      await supabase.from('cargos_especiales').update({ aplicado: true }).in('id', cargos.map(c => c.id))
    }

    // 4. Notificar a cada apartamento que tiene un nuevo recibo emitido (in-app y email automático)
    // NOTA: Para meses históricos (< '2026-09-01', carga de administración anterior),
    // se omiten los despachos de emails automáticos para evitar confusiones o spam a los residentes.
    if (ok > 0 && !esHistorico) {
      // 4.1 Notificación interna in-app a todos los apartamentos
      apartamentos.forEach(apto => {
        notificarApartamento({
          apartamento_id: apto.id,
          tipo: 'recibo_emitido',
          titulo: `Nuevo recibo emitido: ${mesLabel} ${anio}`,
          cuerpo: `Tu recibo de condominio del mes de ${mesLabel} ${anio} ya está disponible. Por favor revisa el monto y realiza tu pago a tiempo.`,
          link: '/recibos',
        }).catch(() => {})
      })

      // 4.2 Despacho por Correo Electrónico (exclusivamente a propietarios con correo registrado)
      const aptosConEmail = apartamentos.filter(a => a.propietario_email && a.propietario_email.includes('@'))
      for (const apto of aptosConEmail) {
        const calc = calcularApto(apto)
        const tasaBcvReal = (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1)
          ? config.tasa_bcv_actual
          : (calc.totalUsd > 0 ? parseFloat((calc.totalBs / calc.totalUsd).toFixed(4)) : 859.06)

        await despacharEmailRecibo({
          destinatarioEmail: apto.propietario_email!,
          apartamentoNumero: apto.numero,
          propietarioNombre: apto.propietario_nombre,
          edificioNombre: config?.nombre_edificio,
          mesLabel,
          anio,
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
          tasaBcv: tasaBcvReal,
          alicuotaPct: formatAlicuotaPct(apto.alicuota),
          bancoNombre: config?.banco,
          cuentaNumero: config?.cuenta_bancaria,
          titularNombre: config?.titular_cuenta,
          cedulaRif: config?.rif
        }).catch(err => console.warn(`[AdminGenerarRecibos] Error despachando email a Apto. ${apto.numero}:`, err))
      }
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

          {/* Selector Mes/Año + Fondo de Reserva (General y PH) */}
          <div style={{ ...S.card, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'16px', alignItems:'end' }}>
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
              <input type="number" style={S.input} value={fondoReservaPct} min={0} max={100} step="0.1" onChange={e => setFondoReservaPct(parseFloat(e.target.value)||0)} />
            </div>
            <div>
              <label style={{ ...S.label, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>👑 Fondo de Reserva PH (%)</span>
              </label>
              <input
                type="number"
                style={{ ...S.input, borderColor: '#f59e0b60', backgroundColor: '#1c1917', color: '#fef3c7', fontWeight: 700 }}
                value={fondoReservaPhPct}
                min={0}
                max={100}
                step="0.1"
                onChange={e => setFondoReservaPhPct(parseFloat(e.target.value)||0)}
              />
            </div>
          </div>

          {/* Selector de Modalidad: Indexado al Dólar BCV vs Anclado a Bolívares */}
          <div style={{
            ...S.card,
            border: esIndexado ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
            backgroundColor: esIndexado ? 'rgba(34, 197, 94, 0.05)' : 'rgba(59, 130, 246, 0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '20px' }}>{esIndexado ? '🟢' : '🔵'}</span>
                <strong style={{ color: '#fff', fontSize: '15px' }}>
                  {esIndexado ? 'Recibos Indexados al Dólar (Tasa Oficial BCV)' : 'Recibos No Indexados (Anclados a Bolívares Fijos)'}
                </strong>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: 0, lineHeight: '1.4' }}>
                {esIndexado
                  ? 'Al marcar SÍ, el recibo se emite anclado a la divisa ($ USD). En el portal del residente, el monto a pagar se calculará en Bolívares a la tasa oficial del BCV del día en que se realice el pago.'
                  : 'Al marcar NO, solo se cuenta el monto expresado en Bolívares. La deuda creada al residente queda anclada a los Bolívares (fija y sin indexar).'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setEsIndexado(true)}
                style={{
                  backgroundColor: esIndexado ? '#15803d' : '#141414',
                  color: esIndexado ? '#fff' : '#94a3b8',
                  border: esIndexado ? '2px solid #22c55e' : '1px solid #334155',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: esIndexado ? '0 0 14px rgba(34, 197, 94, 0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🟢</span>
                <span>RECIBO INDEXADO ($ USD)</span>
              </button>
              <button
                type="button"
                onClick={() => setEsIndexado(false)}
                style={{
                  backgroundColor: !esIndexado ? '#1e40af' : '#141414',
                  color: !esIndexado ? '#fff' : '#94a3b8',
                  border: !esIndexado ? '2px solid #3b82f6' : '1px solid #334155',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: !esIndexado ? '0 0 14px rgba(59, 130, 246, 0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔵</span>
                <span>NO INDEXADO (BS FIJOS)</span>
              </button>
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
              <h3 style={{ color:'#fff', margin:'0 0 14px', fontSize:'15px', fontWeight:700 }}>🏠 Resumen por Apartamento ({apartamentos.length} Inmuebles)</h3>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #2a2a2a' }}>
                      {['Apto','Propietario','Alíc.','Subtotal Bs','Subtotal $','Fondo %','Fondo Bs','Fondo $','Extras','TOTAL Bs','TOTAL $'].map(h => (
                        <th key={h} style={{ color:'#555', fontSize:'10px', fontWeight:700, padding:'6px 8px', textAlign:'right', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apartamentos.map(a => {
                      const c = calcularApto(a)
                      const esPH = a.numero.toUpperCase().includes('PH') || a.piso === 11
                      return (
                        <tr key={a.id} style={{ borderBottom:'1px solid #111' }}>
                          <td style={{ color:'#f97316', fontWeight:800, padding:'7px 8px' }}>
                            #{a.numero}
                            {esPH && (
                              <span style={{ marginLeft:'6px', fontSize:'9px', backgroundColor:'#f9731625', color:'#f97316', border:'1px solid #f9731640', padding:'1px 5px', borderRadius:'4px', fontWeight:700 }}>
                                PH
                              </span>
                            )}
                          </td>
                          <td style={{ color:'#666', padding:'7px 8px', maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.propietario_nombre || '—'}</td>
                          <td style={{ color: esPH ? '#f97316' : '#888', padding:'7px 8px', textAlign:'right', fontWeight: esPH ? 700 : 400 }}>{formatAlicuotaPct(a.alicuota)}</td>
                          <td style={{ color:'#10b981', padding:'7px 8px', textAlign:'right' }}>{fmtBs(c.subtotalBs)}</td>
                          <td style={{ color:'#f97316', padding:'7px 8px', textAlign:'right' }}>{fmtUsd(c.subtotalUsd)}</td>
                          <td style={{ color: esPH ? '#f59e0b' : '#888', padding:'7px 8px', textAlign:'right', fontWeight: esPH ? 700 : 400 }}>
                            {c.pctApto}% {esPH && '👑'}
                          </td>
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
        <div style={{ display:'flex', flexDirection:'column', gap:'20px', maxWidth:'800px', margin:'0 auto', width:'100%' }}>
          
          {/* Card: Notas para los Residentes (Editable por el Admin) */}
          <div style={{ ...S.card, width:'100%', boxSizing:'border-box' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <label style={{ ...S.label, marginBottom:0, display:'flex', alignItems:'center', gap:'8px', color:'#f97316', fontSize:'13px', fontWeight:700 }}>
                <span>📝</span> NOTAS PARA LOS RESIDENTES
              </label>
              <button
                type="button"
                onClick={() => setNotasResidentes(DEFAULT_NOTAS)}
                style={{ background:'transparent', border:'none', color:'#888', cursor:'pointer', fontSize:'11px', textDecoration:'underline' }}
                title="Hacer clic para restaurar el texto predeterminado"
              >
                Restablecer notas predeterminadas
              </button>
            </div>
            <textarea
              value={notasResidentes}
              onChange={e => setNotasResidentes(e.target.value)}
              rows={4}
              placeholder="Escribe aquí las instrucciones de pago bancario, avisos, normas o notas que aparecerán en el recibo y en el PDF..."
              style={{
                ...S.input,
                fontFamily:'ui-monospace, monospace',
                fontSize:'12px',
                lineHeight:'1.5',
                resize:'vertical',
                backgroundColor:'#0b0f17',
                border:'1px solid #334155'
              }}
            />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'8px' }}>
              <span style={{ color:'#64748b', fontSize:'11px' }}>
                ℹ️ Esta nota aparecerá automáticamente en el recuadro "NOTAS" del recibo y en el PDF generado.
              </span>
              <span style={{ color:'#94a3b8', fontSize:'11px', fontWeight:600 }}>
                {notasResidentes.length} caracteres
              </span>
            </div>
          </div>

          {apartamentos.length > 0 && config && (() => {
            const apto = apartamentos[previewAptoIdx]
            const calc = calcularApto(apto)
            const caps = cargos.filter(c => c.apartamento_id === apto.id)
            const esPH = calc.esPH
            const pctApto = calc.pctApto

            const fondoEdificioUsd = totalGastosUsd * (pctApto / 100)
            const fondoEdificioBs  = totalGastosBs  * (pctApto / 100)
            const totalEdificioUsd = totalGastosUsd + fondoEdificioUsd
            const totalEdificioBs  = totalGastosBs  + fondoEdificioBs

            return (
              <>
                {/* Selector / Barra de navegación de apartamentos */}
                <div style={{ display:'flex', alignItems:'center', gap:'12px', justifyContent:'space-between', backgroundColor:'#141414', padding:'12px 18px', borderRadius:'12px', border:'1px solid #222' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <button onClick={() => setPreviewAptoIdx(i => Math.max(0,i-1))} disabled={previewAptoIdx===0}
                      style={{ ...S.btnSecondary, opacity: previewAptoIdx===0?0.3:1, padding:'7px 14px', fontSize:'12px' }}>
                      ← Anterior
                    </button>
                    <select
                      value={previewAptoIdx}
                      onChange={e => setPreviewAptoIdx(Number(e.target.value))}
                      style={{ ...S.input, width:'auto', padding:'6px 12px', fontSize:'13px', fontWeight:700, color:'#f97316', borderColor:'#f97316' }}
                    >
                      {apartamentos.map((a, idx) => (
                        <option key={a.id} value={idx}>
                          Apto {a.numero} ({idx + 1}/{apartamentos.length}) - {a.propietario_nombre || 'Sin residente'}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setPreviewAptoIdx(i => Math.min(apartamentos.length-1,i+1))} disabled={previewAptoIdx===apartamentos.length-1}
                      style={{ ...S.btnSecondary, opacity: previewAptoIdx===apartamentos.length-1?0.3:1, padding:'7px 14px', fontSize:'12px' }}>
                      Siguiente →
                    </button>
                  </div>
                  <button onClick={() => descargarPDF(apto)} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'8px', padding:'8px 18px', fontSize:'13px' }}>
                    <span>📥</span> Descargar PDF
                  </button>
                </div>

                {/* Recibo Preview — 1:1 con PDF y Excel (Estilo moderno pizarra y naranja) */}
                <div style={{
                  backgroundColor:'#ffffff',
                  borderRadius:'12px',
                  color:'#0f172a',
                  fontFamily:'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  boxShadow:'0 25px 60px -15px rgba(0,0,0,0.7)',
                  border:'1px solid #334155',
                  overflow:'hidden'
                }}>
                  {/* Header Moderno Estilo Factura (Imagen 3 con Slate 900 & Orange) */}
                  <div style={{
                    backgroundColor:'#0f172a',
                    padding:'20px 24px',
                    position:'relative',
                    borderBottom:'3px solid #f97316',
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                    flexWrap:'wrap',
                    gap:'16px'
                  }}>
                    {/* Lado izquierdo */}
                    <div style={{ borderLeft:'3px solid #f97316', paddingLeft:'12px' }}>
                      <div style={{ color:'#f97316', fontSize:'11px', fontWeight:800, letterSpacing:'0.5px', textTransform:'uppercase' }}>
                        JUNTA DE CONDOMINIO OCUTUY 5
                      </div>
                      <h2 style={{ color:'#ffffff', fontSize:'22px', fontWeight:900, margin:'2px 0 4px', letterSpacing:'-0.5px' }}>
                        RECIBO DE CONDOMINIO
                      </h2>
                      <div style={{ color:'#94a3b8', fontSize:'10px' }}>
                        DIRECCIÓN: URBANIZACIÓN CASA BLANCA, RESIDENCIAS OCUTUY 5
                      </div>
                    </div>

                    {/* Lado derecho */}
                    <div style={{ textAlign:'right', fontSize:'10px', color:'#cbd5e1' }}>
                      <div style={{ color:'#f97316', fontWeight:800, fontSize:'12px' }}>
                        RIF: {config.rif || 'J-296749485'}
                      </div>
                      <div style={{ marginTop:'2px' }}>
                        CORREO: {config.email_contacto || 'juntacondominioocutuy5@gmail.com'}
                      </div>
                      <div style={{ color:'#94a3b8', marginTop:'2px' }}>
                        EDIFICIO: {config.nombre_edificio || 'RESIDENCIAS OCUTUY 5'}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding:'20px 24px' }}>
                    {/* Cuadro de información del inmueble (Formato Excel 5 columnas) */}
                    <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:'14px', border:'1px solid #cbd5e1', fontSize:'11px' }}>
                      <thead>
                        <tr style={{ backgroundColor:'#f1f5f9', color:'#475569', fontSize:'10px', fontWeight:700 }}>
                          <th style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', width:'18%' }}>APARTAMENTO</th>
                          <th style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'left', width:'42%' }}>PROPIETARIO</th>
                          <th style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', width:'14%' }}>ALÍCUOTA</th>
                          <th style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', width:'13%' }}>MES</th>
                          <th style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', width:'13%' }}>AÑO</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ fontWeight:700, backgroundColor:'#ffffff' }}>
                          <td style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', color:'#f97316', fontSize:'12px' }}>
                            Nro. {apto.numero} {esPH ? '(PH)' : ''}
                          </td>
                          <td style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'left', color:'#0f172a' }}>
                            {apto.propietario_nombre || 'Residente'}
                          </td>
                          <td style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', color:'#0f172a' }}>
                            {formatAlicuotaPct(apto.alicuota)}
                          </td>
                          <td style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', color:'#0f172a' }}>
                            {mesLabel.toUpperCase()}
                          </td>
                          <td style={{ padding:'6px 8px', border:'1px solid #cbd5e1', textAlign:'center', color:'#0f172a' }}>
                            {anio}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Tabla de gastos comunes (Formato Excel Imagen 2) */}
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px', border:'1px solid #cbd5e1' }}>
                      <thead>
                        <tr style={{ backgroundColor:'#0f172a', color:'#ffffff' }}>
                          <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, border:'1px solid #1e293b' }}>DETALLES DE GASTOS COMUNES</th>
                          <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:700, minWidth:'100px', border:'1px solid #1e293b' }}>BOLÍVARES</th>
                          <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:700, minWidth:'80px', border:'1px solid #1e293b' }}>DÓLAR $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastos.map((g, i) => (
                          <tr key={g.id} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding:'4px 8px', border:'1px solid #e2e8f0', color:'#1e293b' }}>{g.descripcion}</td>
                            <td style={{ padding:'4px 8px', border:'1px solid #e2e8f0', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtBs(g.monto_bs)} Bs</td>
                            <td style={{ padding:'4px 8px', border:'1px solid #e2e8f0', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>$ {fmtUsd(g.monto_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Subtotales y Total Edificio */}
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'10px', border:'1px solid #cbd5e1', borderTop:'none' }}>
                      <tbody>
                        <tr style={{ backgroundColor:'#ffffff', fontWeight:700 }}>
                          <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>SUB TOTAL</td>
                          <td style={{ padding:'4px 8px', textAlign:'right', minWidth:'100px', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>{fmtBs(totalGastosBs)} Bs</td>
                          <td style={{ padding:'4px 8px', textAlign:'right', minWidth:'80px', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>$ {fmtUsd(totalGastosUsd)}</td>
                        </tr>
                        <tr style={{ backgroundColor:'#ffffff', fontWeight:700 }}>
                          <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>FONDO DE RESERVA ({pctApto}%{esPH ? ' - PENTHOUSE' : ''})</td>
                          <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>{fmtBs(fondoEdificioBs)} Bs</td>
                          <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>$ {fmtUsd(fondoEdificioUsd)}</td>
                        </tr>
                        <tr style={{ backgroundColor:'#f8fafc', fontWeight:800 }}>
                          <td style={{ padding:'5px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>TOTAL GASTOS CONDOMINIO</td>
                          <td style={{ padding:'5px 8px', textAlign:'right', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>{fmtBs(totalEdificioBs)} Bs</td>
                          <td style={{ padding:'5px 8px', textAlign:'right', border:'1px solid #e2e8f0', fontVariantNumeric:'tabular-nums' }}>$ {fmtUsd(totalEdificioUsd)}</td>
                        </tr>
                        {caps.map(c => (
                          <tr key={c.id} style={{ backgroundColor:'#fffbeb', color:'#92400e', fontWeight:700 }}>
                            <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>
                              CARGO: {TIPO_CARGO_LABELS[c.tipo] || c.tipo} — {c.descripcion}
                            </td>
                            <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>{fmtBs(c.monto_bs || 0)} Bs</td>
                            <td style={{ padding:'4px 8px', textAlign:'right', border:'1px solid #e2e8f0' }}>$ {fmtUsd(c.monto_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Total a Pagar con Alícuota (Fila Naranja Resaltada) */}
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px', marginTop:'2px', border:'1px solid #ea580c' }}>
                      <tbody>
                        <tr style={{ backgroundColor:'#f97316', color:'#ffffff', fontWeight:800 }}>
                          <td style={{ padding:'8px 8px', textAlign:'right' }}>
                            TOTAL A PAGAR (ALÍCUOTA {formatAlicuotaPct(apto.alicuota)})
                          </td>
                          <td style={{ padding:'8px 8px', textAlign:'right', minWidth:'100px', fontSize:'12px', fontVariantNumeric:'tabular-nums' }}>
                            {fmtBs(calc.totalBs)} Bs
                          </td>
                          <td style={{ padding:'8px 8px', textAlign:'right', minWidth:'80px', fontSize:'12px', fontVariantNumeric:'tabular-nums' }}>
                            $ {fmtUsd(calc.totalUsd)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Banner de Advertencia (Formato Excel Imagen 2) */}
                    <div style={{
                      backgroundColor:'#fef9c3',
                      border:'1.5px solid #eab308',
                      borderRadius:'6px',
                      padding:'7px 10px',
                      margin:'12px 0',
                      textAlign:'center',
                      fontSize:'10px',
                      fontWeight:800,
                      color:'#854d0e',
                      letterSpacing:'0.2px'
                    }}>
                      ***** ATENCIÓN: PAGAR &nbsp;{fmtUsd(calc.totalUsd)}&nbsp; $ &nbsp;ANCLADO AL $ BCV DEL DÍA DE SU PAGO *****
                    </div>

                    {/* NOTAS PARA LOS RESIDENTES (Editable y dinámico) */}
                    <div style={{
                      backgroundColor:'#f8fafc',
                      border:'1px solid #cbd5e1',
                      borderRadius:'6px',
                      padding:'10px 12px',
                      marginBottom:'12px',
                      fontSize:'9.5px',
                      lineHeight:'1.45',
                      color:'#334155'
                    }}>
                      <div style={{ fontWeight:800, color:'#0f172a', marginBottom:'4px', fontSize:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
                        <span>NOTAS PARA LOS RESIDENTES:</span>
                      </div>
                      <div style={{ whiteSpace:'pre-line', color:'#475569' }}>
                        {(notasResidentes || DEFAULT_NOTAS).trim()}
                      </div>
                    </div>

                    {/* TALÓN DE CONTROL DE PAGO (Formato Excel Imagen 2) */}
                    <div style={{ border:'1px solid #94a3b8', borderRadius:'6px', overflow:'hidden', fontSize:'9px' }}>
                      <div style={{ backgroundColor:'#f1f5f9', padding:'4px 8px', textAlign:'center', fontWeight:800, color:'#334155', borderBottom:'1px solid #cbd5e1', fontSize:'9.5px' }}>
                        TALÓN DE CONTROL DE PAGO (REGISTRO DEL RESIDENTE / ADMINISTRACIÓN)
                      </div>
                      <div style={{ padding:'8px 12px', color:'#475569', display:'flex', flexDirection:'column', gap:'5px' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                          <div>PAGADO: ____________________________________</div>
                          <div>FECHA: _____________________________________</div>
                        </div>
                        <div>
                          BANCO: ____________________________________________________________________________________
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                          <div>MONTO: ____________________________________</div>
                          <div>DÓLAR DEL DÍA: ______________________________</div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                          <div>REFERENCIA: _______________________________</div>
                          <div>CTA: _______________________________________</div>
                        </div>
                      </div>
                    </div>

                    {/* Pie de página sutil */}
                    <div style={{ textAlign:'center', marginTop:'14px', fontSize:'8.5px', color:'#94a3b8' }}>
                      Generado el {new Date().toLocaleDateString('es-VE')} · Sistema de Gestión de Condominios · Residencias Ocutuy 5
                    </div>
                  </div>
                </div>
              </>
            )
          })()}

          <div style={{ display:'flex', justifyContent:'space-between', width:'100%' }}>
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
                  <div><span style={{ color:'#555' }}>F. Reserva Regular:</span> <span style={{ color:'#fff', fontWeight:700 }}>{fondoReservaPct}%</span></div>
                  <div><span style={{ color:'#555' }}>F. Reserva PH:</span> <span style={{ color:'#f59e0b', fontWeight:700 }}>{fondoReservaPhPct}% 👑</span></div>
                  <div><span style={{ color:'#555' }}>Apartamentos:</span> <span style={{ color:'#fff', fontWeight:700 }}>{apartamentos.length}</span></div>
                  <div><span style={{ color:'#555' }}>Total gastos $:</span> <span style={{ color:'#f97316', fontWeight:800 }}>$ {fmtUsd(totalGastosUsd)}</span></div>
                  <div><span style={{ color:'#555' }}>Total gastos Bs:</span> <span style={{ color:'#10b981', fontWeight:800 }}>Bs. {fmtBs(totalGastosBs)}</span></div>
                  <div><span style={{ color:'#555' }}>Cargos especiales:</span> <span style={{ color: cargos.length>0?'#f59e0b':'#555', fontWeight:700 }}>{cargos.length}</span></div>
                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid #222', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ color:'#888' }}>Modalidad de cobro:</span>{' '}
                    <span style={{ color: esIndexado ? '#4ade80' : '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                      {esIndexado ? '🟢 Indexado al Dólar (Tasa Oficial BCV)' : '🔵 Anclado a Bolívares Fijos'}
                    </span>
                  </div>
                </div>
              </div>

              {esHistorico && (
                <div style={{ backgroundColor: '#1e1b4b', border: '1px solid #6366f1', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px', color: '#c7d2fe', textAlign: 'left', lineHeight: '1.4' }}>
                  ℹ️ <strong>Carga de Administración Anterior:</strong> Los correos automáticos están silenciados para este mes histórico. Al completar la emisión, podrás ir directo a marcar apartamento por apartamento si pagó o quedó en mora.
                </div>
              )}

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
              <p style={{ color:'#666', fontSize:'13px', margin:'0 0 24px' }}>
                {esHistorico
                  ? 'Recibos históricos cargados. Ahora puedes marcar apartamento por apartamento el estado de pago de la administración anterior.'
                  : 'Los residentes ya pueden ver su deuda y reportar el pago.'}
              </p>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {esHistorico && resultado.ok > 0 && (
                  <button
                    onClick={() => navigate(`/admin/recibos-emitidos?mes=${mesStr}`)}
                    style={{ ...S.btnPrimary, backgroundColor: '#6366f1', padding: '12px 24px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span>🏛️</span> Ir a Marcar Pagos de {mesLabel} {anio} ({resultado.ok} aptos) →
                  </button>
                )}
                <button
                  onClick={() => navigate(`/admin/recibos-emitidos?mes=${mesStr}`)}
                  style={{ ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span>📋</span> Ver Recibos Emitidos
                </button>
                <button onClick={() => { setResultado(null); setPaso(1) }} style={S.btnSecondary}>
                  Generar otro mes
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
