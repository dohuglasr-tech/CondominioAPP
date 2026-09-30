import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://kevslcecttfxifcplgzx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtldnNsY2VjdHRmeGlmY3BsZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDExMTYsImV4cCI6MjEwNTYxNzExNn0.xmDYjTK5ZVdQsjyOyvtPYCRB4cQCINcGirM59M8ka2o'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const MESES = [
  { num: '01', mesKey: 'ENERO', hojas: ['ENE A', 'ENE PH'], colDeuda: 3, fechaEmitido: '2025-01-01', cuotaBaseA: 567.80, cuotaBasePH: 863.25 },
  { num: '02', mesKey: 'FEBRERO', hojas: ['FEB A', 'FEB PH'], colDeuda: 4, fechaEmitido: '2025-02-01', cuotaBaseA: 505.84, cuotaBasePH: 823.99 },
  { num: '03', mesKey: 'MARZO', hojas: ['MAR A', 'MAR  PH'], colDeuda: 5, fechaEmitido: '2025-03-01', cuotaBaseA: 681.31, cuotaBasePH: 1109.81, extraUsd: 10, extraDesc: 'Compra de Guayas y chacros Ascensor Impar 1era parte (10$)' },
  { num: '04', mesKey: 'ABRIL', hojas: ['ABRIL A', 'ABRILPH'], colDeuda: 6, fechaEmitido: '2025-04-01', cuotaBaseA: 675.20, cuotaBasePH: 1099.86, extraUsd: 10, extraDesc: 'Compra de Guayas y chacros Ascensor Impar 2da parte (10$)' },
  { num: '05', mesKey: 'MAYO', hojas: ['MAYO A', 'MAYO PH'], colDeuda: 7, fechaEmitido: '2025-05-01', cuotaBaseA: 573.89, cuotaBasePH: 934.84 },
  { num: '06', mesKey: 'JUNIO', hojas: ['JUNIO A)', 'JUNIO PH '], colDeuda: 8, fechaEmitido: '2025-06-01', cuotaBaseA: 687.59, cuotaBasePH: 1120.04 },
  { num: '07', mesKey: 'JULIO', hojas: ['JULIO A', 'JULIO PH'], colDeuda: 9, fechaEmitido: '2025-07-01', cuotaBaseA: 801.85, cuotaBasePH: 1306.16 },
  { num: '08', mesKey: 'AGOSTO', hojas: ['AGOSTO A', 'AGOSTO PH'], colDeuda: 10, fechaEmitido: '2025-08-01', cuotaBaseA: 1032.50, cuotaBasePH: 1681.87 },
  { num: '09', mesKey: 'SEPTIEMBRE', hojas: ['SEP A', 'SEP PH'], colDeuda: 11, fechaEmitido: '2025-09-01', cuotaBaseA: 1211.35, cuotaBasePH: 1973.21 },
  { num: '10', mesKey: 'OCTUBRE', hojas: ['OCT A', 'OCT PH'], colDeuda: 12, fechaEmitido: '2025-10-01', cuotaBaseA: 1741.89, cuotaBasePH: 2837.42 },
  { num: '11', mesKey: 'NOVIEMBRE', hojas: ['NOV A', 'NOV PH'], colDeuda: 13, fechaEmitido: '2025-11-01', cuotaBaseA: 1833.38, cuotaBasePH: 2986.45 },
  { num: '12', mesKey: 'DICIEMBRE', hojas: ['DIC A', 'DIC PH'], colDeuda: 14, fechaEmitido: '2025-12-01', cuotaBaseA: 2036.46, cuotaBasePH: 3189.66 }
]

function extraerGastosDeHoja(sheet) {
  if (!sheet) return { gastos: [], notas: '' }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const gastos = []
  const notas = []
  let leyendoGastos = false

  for (let r = 0; r < rows.length; r++) {
    const fila = rows[r]
    const filaStr = fila.map(c => String(c).trim()).join(' ')
    const filaUpper = filaStr.toUpperCase()

    if (filaUpper.includes('DETALLES DE GASTOS COMUNES') || filaUpper.includes('DETALLE DE GASTOS')) {
      leyendoGastos = true
      continue
    }

    if (leyendoGastos) {
      if (
        filaUpper.includes('SUB TOTAL') ||
        filaUpper.includes('SUBTOTAL') ||
        filaUpper.includes('FONDO DE RESERVA') ||
        filaUpper.includes('TOTAL A PAGAR')
      ) {
        leyendoGastos = false
      } else {
        const desc = typeof fila[0] === 'string' ? fila[0].trim() : ''
        let monto = 0
        for (let col = 1; col < fila.length; col++) {
          const val = fila[col]
          if (typeof val === 'number' && val > 0) monto = val
          else if (typeof val === 'string' && val.trim() !== '') {
            const num = parseFloat(val.replace(/\./g, '').replace(',', '.'))
            if (!isNaN(num) && num > 0) monto = num
          }
        }
        if (desc && desc.length > 2 && monto > 0) {
          gastos.push({ descripcion: desc, monto_bs: monto, monto_usd: 0, categoria: 'Común' })
        }
      }
    }

    if (filaUpper.includes('DEPOSITAR') || filaUpper.includes('VECINOS') || filaUpper.includes('CUENTA') || filaUpper.includes('CON RESPECTO')) {
      if (fila[0] && typeof fila[0] === 'string' && fila[0].trim().length > 10) {
        const limpia = fila[0].trim()
        if (!notas.includes(limpia)) notas.push(limpia)
      }
    }
  }

  return { gastos, notas: notas.join('\n\n') }
}

const mapExcelToDb = (numExcel) => {
  const s = String(numExcel).trim().toUpperCase()
  if (s === '511') return '501'
  if (s === '512') return '502'
  if (s === '513') return '503'
  if (s === '514') return '504'
  if (s === '515') return '505'
  if (s === '516') return '506'
  if (s === 'PH51' || s === '5PH1' || s === 'PH1') return '5PH1'
  if (s === 'PH52' || s === '5PH2' || s === 'PH2') return '5PH2'
  return s
}

async function main() {
  console.log('====================================================')
  console.log('🚀 INICIANDO IMPORTACIÓN DE RECIBOS 2025 (ADMINISTRACIÓN ANTERIOR)')
  console.log('====================================================\n')

  const wb = XLSX.readFile('RECIBOS_2025.xlsx')
  const { data: dbAptos, error: errApt } = await supabase
    .from('apartamentos')
    .select('id, numero, piso, alicuota, propietario_nombre')
    .order('numero')

  if (errApt || !dbAptos || dbAptos.length === 0) {
    console.error('Error cargando apartamentos:', errApt)
    process.exit(1)
  }

  console.log(`🏢 Apartamentos en Base de Datos: ${dbAptos.length}`)

  // Extraer estado de morosidad/pago de cada apartamento desde la hoja DEUDA AÑO 2025
  const sheetDeuda = wb.Sheets['DEUDA AÑO 2025']
  const rowsDeuda = XLSX.utils.sheet_to_json(sheetDeuda, { header: 1, defval: '' })
  const mapDeudas = {}

  for (let r = 2; r < rowsDeuda.length; r++) {
    const fila = rowsDeuda[r]
    const rawApto = fila[0]
    if (!rawApto) continue
    const aptoNorm = mapExcelToDb(rawApto)
    mapDeudas[aptoNorm] = fila
  }

  console.log(`📊 Apartamentos mapeados en hoja DEUDA 2025: ${Object.keys(mapDeudas).length}`)

  let totalInsertados = 0
  let totalPagados = 0
  let totalPendientes = 0

  for (const m of MESES) {
    const mesStr = `2025-${m.num}-01`
    console.log(`\n📅 Procesando ${m.mesKey} 2025 (${mesStr})...`)

    const sheetA = wb.Sheets[m.hojas[0]]
    const sheetPH = wb.Sheets[m.hojas[1]]

    const dataA = extraerGastosDeHoja(sheetA)
    const dataPH = extraerGastosDeHoja(sheetPH)

    console.log(`   - Gastos A: ${dataA.gastos.length} ítems | Cuota ref: Bs. ${m.cuotaBaseA}`)
    console.log(`   - Gastos PH: ${dataPH.gastos.length} ítems | Cuota ref: Bs. ${m.cuotaBasePH}`)

    const payloads = []

    for (const apto of dbAptos) {
      const esPH = apto.numero.toLowerCase().includes('ph')
      const cuotaBase = esPH ? m.cuotaBasePH : m.cuotaBaseA
      const gastosApto = esPH && dataPH.gastos.length > 0 ? dataPH.gastos : dataA.gastos
      const notasApto = esPH && dataPH.notas ? dataPH.notas : dataA.notas

      // Verificar si en DEUDA 2025 tiene saldo pendiente en este mes
      const filaApto = mapDeudas[apto.numero]
      let montoDeudaMes = 0
      if (filaApto && filaApto[m.colDeuda] !== '') {
        const val = filaApto[m.colDeuda]
        if (typeof val === 'number') montoDeudaMes = val
        else if (typeof val === 'string') {
          const parsed = parseFloat(val.replace(/\./g, '').replace(',', '.'))
          if (!isNaN(parsed) && parsed > 0) montoDeudaMes = parsed
        }
      }

      const estaPendiente = montoDeudaMes > 0
      const totalBsRecibo = estaPendiente ? montoDeudaMes : cuotaBase
      const totalUsdRecibo = m.extraUsd || 0

      if (estaPendiente) totalPendientes++
      else totalPagados++

      const cargosEspeciales = m.extraUsd
        ? [{ tipo: 'Cuota Extraordinaria', descripcion: m.extraDesc, monto_usd: m.extraUsd, monto_bs: 0 }]
        : []

      payloads.push({
        apartamento_id: apto.id,
        mes_facturado: mesStr,
        tasa_bcv: 0,
        total_gastos_usd: totalUsdRecibo,
        alicuota: apto.alicuota || (esPH ? 0.0259 : 0.0159),
        subtotal_usd: totalUsdRecibo,
        fondo_reserva_pct: 10,
        fondo_reserva_usd: 0,
        cargos_extra_usd: totalUsdRecibo,
        total_usd: totalUsdRecibo,
        total_bs: totalBsRecibo,
        estado: estaPendiente ? 'pendiente' : 'pagado',
        data_json: {
          gastos: gastosApto,
          cargos_especiales: cargosEspeciales,
          fondo_reserva_pct: 10,
          notas_residentes: notasApto,
          es_historico_2025: true,
          administracion: 'Administración Anterior (Año 2025)',
          pago_info: estaPendiente
            ? undefined
            : {
                estado: 'pagado',
                referencia: 'REGISTRO HISTÓRICO 2025',
                banco: 'Administración Pasada',
                fecha_pago: `${mesStr.substring(0, 7)}-28`,
                monto_bs: totalBsRecibo,
                monto_usd: totalUsdRecibo
              }
        },
        emitido_at: `${m.fechaEmitido}T00:00:00.000Z`
      })
    }

    // Limpiar emisión previa de este mes de 2025 si existiera
    await supabase.from('recibos_generados').delete().eq('mes_facturado', mesStr)

    // Insertar en lotes de 25
    const batchSize = 25
    let okMes = 0
    for (let i = 0; i < payloads.length; i += batchSize) {
      const batch = payloads.slice(i, i + batchSize)
      const { error: errInsert } = await supabase
        .from('recibos_generados')
        .insert(batch)

      if (errInsert) {
        console.error(`   ❌ Error insert lote ${i}:`, errInsert.message)
      } else {
        okMes += batch.length
      }
    }

    totalInsertados += okMes
    console.log(`   ✅ ${okMes} recibos sincronizados para ${m.mesKey} 2025`)
  }

  console.log('\n====================================================')
  console.log(`🎉 ¡IMPORTACIÓN 2025 COMPLETADA CON ÉXITO!`)
  console.log(`   Total recibos sincronizados: ${totalInsertados}`)
  console.log(`   - Pagados y solventes: ${totalPagados}`)
  console.log(`   - Pendientes según registro 2025: ${totalPendientes}`)
  console.log('====================================================\n')
}

main()
