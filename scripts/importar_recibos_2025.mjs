import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kevslcecttfxifcplgzx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtldnNsY2VjdHRmeGlmY3BsZ3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNDExMTYsImV4cCI6MjEwNTYxNzExNn0.xmDYjTK5ZVdQsjyOyvtPYCRB4cQCINcGirM59M8ka2o'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Meses estándar
const MESES_MAP = {
  'ENE': '01',
  'FEB': '02',
  'MAR': '03',
  'ABR': '04',
  'ABRIL': '04',
  'MAY': '05',
  'MAYO': '05',
  'JUN': '06',
  'JUNIO': '06',
  'JUL': '07',
  'JULIO': '07',
  'AGO': '08',
  'AGOSTO': '08',
  'SEP': '09',
  'SEPT': '09',
  'OCT': '10',
  'NOV': '11',
  'DIC': '12'
}

function parseMonto(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return Math.round(val * 100) / 100
  if (typeof val === 'string') {
    // Formato latinoamericano: 3.311,00 o 3311.00
    const limpio = val.trim().replace(/\s/g, '').replace(/Bs\.?/gi, '').replace(/\$/g, '')
    if (limpio.includes(',') && limpio.includes('.')) {
      // 3.311,00 -> 3311.00
      return parseFloat(limpio.replace(/\./g, '').replace(',', '.')) || 0
    } else if (limpio.includes(',')) {
      return parseFloat(limpio.replace(',', '.')) || 0
    }
    return parseFloat(limpio) || 0
  }
  return 0
}

function parseHojaRecibo(sheet, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!rows || rows.length < 5) return null

  let gastos = []
  let totalGastosComunes = 0
  let fondoReserva = 0
  let fondoReservaPct = 10
  let subtotal = 0
  let totalPagar = 0
  let alicuota = 0.0159
  let notasArray = []

  let leyendoGastos = false

  for (let r = 0; r < rows.length; r++) {
    const fila = rows[r]
    if (!fila || fila.length === 0) continue

    const textoFila = fila.map(c => String(c).trim()).join(' ')
    const textoFilaUpper = textoFila.toUpperCase()

    // Detectar Alícuota
    if (textoFilaUpper.includes('ALICUOTA') || textoFilaUpper.includes('ALÍCUOTA')) {
      for (const celda of fila) {
        const cStr = String(celda).trim()
        if (cStr.includes('%')) {
          const num = parseMonto(cStr.replace('%', ''))
          if (num > 0) alicuota = num / 100
        }
      }
    }

    // Inicio de detalles de gastos
    if (textoFilaUpper.includes('DETALLES DE GASTOS') || textoFilaUpper.includes('DETALLE DE GASTOS')) {
      leyendoGastos = true
      continue
    }

    // Fin de detalles de gastos
    if (leyendoGastos) {
      if (
        textoFilaUpper.includes('FONDO DE RESERVA') ||
        textoFilaUpper.includes('SUB TOTAL') ||
        textoFilaUpper.includes('SUBTOTAL') ||
        textoFilaUpper.includes('TOTAL A PAGAR')
      ) {
        leyendoGastos = false
      } else {
        // Fila de gasto individual
        // Columna A/B suele tener la descripción, columna D/E el monto
        let desc = ''
        let monto = 0
        for (let col = 0; col < fila.length; col++) {
          const val = fila[col]
          if (typeof val === 'string' && val.trim().length > 3 && isNaN(parseMonto(val))) {
            if (!desc) desc = val.trim()
          } else if (val !== '' && !isNaN(parseMonto(val)) && parseMonto(val) > 0) {
            monto = parseMonto(val)
          }
        }

        if (desc && monto > 0 && !desc.toUpperCase().includes('TOTAL')) {
          gastos.push({
            descripcion: desc,
            monto_bs: monto,
            monto_usd: 0,
            categoria: 'Administración Pasada'
          })
        }
      }
    }

    // Fondo de reserva
    if (textoFilaUpper.includes('FONDO DE RESERVA')) {
      for (let col = fila.length - 1; col >= 0; col--) {
        const m = parseMonto(fila[col])
        if (m > 0) {
          fondoReserva = m
          break
        }
      }
    }

    // Subtotal
    if (textoFilaUpper.includes('SUB TOTAL') || textoFilaUpper.includes('SUBTOTAL')) {
      for (let col = fila.length - 1; col >= 0; col--) {
        const m = parseMonto(fila[col])
        if (m > 0) {
          subtotal = m
          break
        }
      }
    }

    // Total a pagar
    if (textoFilaUpper.includes('TOTAL A PAGAR')) {
      for (let col = fila.length - 1; col >= 0; col--) {
        const m = parseMonto(fila[col])
        if (m > 0) {
          totalPagar = m
          break
        }
      }
    }

    // Notas
    if (textoFilaUpper.includes('NOTAS') || textoFilaUpper.includes('DEPOSITAR') || textoFilaUpper.includes('VECINOS')) {
      const limpia = textoFila.trim()
      if (limpia.length > 5 && !notasArray.includes(limpia)) {
        notasArray.push(limpia)
      }
    }
  }

  totalGastosComunes = gastos.reduce((sum, g) => sum + g.monto_bs, 0)
  if (subtotal === 0) subtotal = totalGastosComunes + fondoReserva
  if (totalGastosComunes > 0 && fondoReserva > 0) {
    fondoReservaPct = Math.round((fondoReserva / totalGastosComunes) * 100)
  }

  return {
    sheetName,
    alicuota,
    gastos,
    totalGastosComunes,
    fondoReserva,
    fondoReservaPct,
    subtotal,
    totalPagar,
    notas: notasArray.join('\n\n')
  }
}

async function ejecutarImportacion(rutaArchivo) {
  console.log('====================================================')
  console.log('📦 IMPORTADOR DE RECIBOS HISTÓRICOS 2025 (ADMINISTRACIÓN ANTERIOR)')
  console.log('====================================================\n')

  if (!fs.existsSync(rutaArchivo)) {
    console.error(`❌ No se encontró el archivo en: ${rutaArchivo}`)
    console.log('\n💡 Instrucciones:')
    console.log('1. Guarda el archivo "RECIBOS AÑO 2025.xlsx" en la carpeta del proyecto.')
    console.log('2. Vuelve a ejecutar este script o indícanos la ruta correcta.\n')
    process.exit(1)
  }

  console.log(`📖 Leyendo archivo Excel: ${rutaArchivo}...`)
  const workbook = XLSX.readFile(rutaArchivo)
  console.log(`✅ Hojas encontradas (${workbook.SheetNames.length}):`, workbook.SheetNames)

  // 1. Obtener los 62 apartamentos registrados en la base de datos
  const { data: aptos, error: errAptos } = await supabase
    .from('apartamentos')
    .select('id, numero, piso, alicuota, propietario_nombre')
    .order('numero', { ascending: true })

  if (errAptos || !aptos || aptos.length === 0) {
    console.error('❌ Error al consultar apartamentos de la base de datos:', errAptos)
    process.exit(1)
  }

  console.log(`🏢 Apartamentos registrados en sistema: ${aptos.length}`)
  const aptosStandard = aptos.filter(a => !a.numero.toLowerCase().includes('ph'))
  const aptosPH = aptos.filter(a => a.numero.toLowerCase().includes('ph'))
  console.log(`   - Estándar (1-60): ${aptosStandard.length}`)
  console.log(`   - Penthouse (PH1/PH2): ${aptosPH.length}`)

  // 2. Procesar cada mes del año 2025
  const mesesOrdenados = [
    { num: '01', prefijo: 'ENE', nombre: 'Enero' },
    { num: '02', prefijo: 'FEB', nombre: 'Febrero' },
    { num: '03', prefijo: 'MAR', nombre: 'Marzo' },
    { num: '04', prefijo: 'ABR', nombre: 'Abril', alt: 'ABRIL' },
    { num: '05', prefijo: 'MAY', nombre: 'Mayo', alt: 'MAYO' },
    { num: '06', prefijo: 'JUN', nombre: 'Junio', alt: 'JUNIO' },
    { num: '07', prefijo: 'JUL', nombre: 'Julio', alt: 'JULIO' },
    { num: '08', prefijo: 'AGO', nombre: 'Agosto', alt: 'AGOSTO' },
    { num: '09', prefijo: 'SEP', nombre: 'Septiembre', alt: 'SEPT' },
    { num: '10', prefijo: 'OCT', nombre: 'Octubre' },
    { num: '11', prefijo: 'NOV', nombre: 'Noviembre' },
    { num: '12', prefijo: 'DIC', nombre: 'Diciembre' }
  ]

  let totalRecibosCargados = 0

  for (const m of mesesOrdenados) {
    const mesStr = `2025-${m.num}`
    console.log(`\n📅 Procesando ${m.nombre} 2025 (${mesStr})...`)

    // Buscar la hoja de apartamentos regular (A) y la de PH
    const sheetNameA = workbook.SheetNames.find(n => {
      const u = n.toUpperCase().replace(/\s+/g, '')
      return (u === `${m.prefijo}A` || (m.alt && u === `${m.alt}A`))
    })

    const sheetNamePH = workbook.SheetNames.find(n => {
      const u = n.toUpperCase().replace(/\s+/g, '')
      return (u === `${m.prefijo}PH` || (m.alt && u === `${m.alt}PH`))
    })

    if (!sheetNameA && !sheetNamePH) {
      console.warn(`   ⚠️ No se encontraron hojas para ${m.nombre} (buscado: ${m.prefijo} A / ${m.prefijo} PH)`)
      continue
    }

    const dataA = sheetNameA ? parseHojaRecibo(workbook.Sheets[sheetNameA], sheetNameA) : null
    const dataPH = sheetNamePH ? parseHojaRecibo(workbook.Sheets[sheetNamePH], sheetNamePH) : null

    const dataMesBase = dataA || dataPH
    console.log(`   - Hoja Regular: ${sheetNameA || 'No encontrada'} | Gastos: ${dataA?.gastos?.length || 0} | Total Bs: ${dataA?.subtotal || 0}`)
    console.log(`   - Hoja PH: ${sheetNamePH || 'No encontrada'} | Gastos: ${dataPH?.gastos?.length || 0} | Cuota PH: ${dataPH?.totalPagar || 0}`)

    // Generar recibos para los 62 apartamentos
    const payloads = []

    // 1. Apartamentos Estándar
    for (const apto of aptosStandard) {
      const dataSource = dataA || dataMesBase
      const alicuota = apto.alicuota || 0.0159
      const totalBsApto = dataSource.totalPagar > 0 && dataA
        ? dataSource.totalPagar
        : Math.round(dataSource.subtotal * alicuota * 100) / 100

      payloads.push({
        apartamento_id: apto.id,
        mes_facturado: mesStr,
        tasa_bcv: 0,
        total_gastos_usd: 0,
        alicuota: alicuota,
        subtotal_usd: 0,
        fondo_reserva_pct: dataSource.fondoReservaPct || 10,
        fondo_reserva_usd: 0,
        cargos_extra_usd: 0,
        total_usd: 0,
        total_bs: totalBsApto,
        estado: 'pagado',
        data_json: {
          gastos: dataSource.gastos,
          fondo_reserva_pct: dataSource.fondoReservaPct || 10,
          notas_residentes: dataSource.notas,
          es_historico_2025: true,
          administracion: 'Administración Anterior (Año 2025)',
          pago_info: {
            estado: 'pagado',
            fecha_pago: `${mesStr}-28`,
            referencia: 'REGISTRO HISTÓRICO 2025',
            banco: 'Administración Anterior',
            monto_bs: totalBsApto,
            monto_usd: 0
          }
        },
        emitido_at: `${mesStr}-01T00:00:00.000Z`
      })
    }

    // 2. Apartamentos PH
    for (const apto of aptosPH) {
      const dataSource = dataPH || dataMesBase
      const alicuota = apto.alicuota || 0.0259
      const totalBsPH = dataSource.totalPagar > 0 && dataPH
        ? dataSource.totalPagar
        : Math.round(dataSource.subtotal * alicuota * 100) / 100

      payloads.push({
        apartamento_id: apto.id,
        mes_facturado: mesStr,
        tasa_bcv: 0,
        total_gastos_usd: 0,
        alicuota: alicuota,
        subtotal_usd: 0,
        fondo_reserva_pct: dataSource.fondoReservaPct || 10,
        fondo_reserva_usd: 0,
        cargos_extra_usd: 0,
        total_usd: 0,
        total_bs: totalBsPH,
        estado: 'pagado',
        data_json: {
          gastos: dataSource.gastos,
          fondo_reserva_pct: dataSource.fondoReservaPct || 10,
          notas_residentes: dataSource.notas,
          es_historico_2025: true,
          administracion: 'Administración Anterior (Año 2025)',
          pago_info: {
            estado: 'pagado',
            fecha_pago: `${mesStr}-28`,
            referencia: 'REGISTRO HISTÓRICO 2025',
            banco: 'Administración Anterior',
            monto_bs: totalBsPH,
            monto_usd: 0
          }
        },
        emitido_at: `${mesStr}-01T00:00:00.000Z`
      })
    }

    // Insertar en lotes seguros de 25
    const batchSize = 25
    let insertadosMes = 0
    for (let i = 0; i < payloads.length; i += batchSize) {
      const batch = payloads.slice(i, i + batchSize)
      const { error: errInsert } = await supabase
        .from('recibos_generados')
        .upsert(batch, { onConflict: 'apartamento_id,mes_facturado' })

      if (errInsert) {
        console.error(`   ❌ Error en lote ${i}-${i + batchSize}:`, errInsert.message)
      } else {
        insertadosMes += batch.length
      }
    }

    totalRecibosCargados += insertadosMes
    console.log(`   ✅ ${insertadosMes} recibos insertados/sincronizados para ${m.nombre} 2025`)
  }

  // 3. Revisar si hay hoja de deuda acumulada
  const hojaDeuda2025 = workbook.SheetNames.find(n => n.toUpperCase().includes('DEUDA') && n.includes('2025'))
  if (hojaDeuda2025) {
    console.log(`\n📋 Pestaña de deudas encontrada: "${hojaDeuda2025}"`)
    const sheetDeuda = workbook.Sheets[hojaDeuda2025]
    const rowsDeuda = XLSX.utils.sheet_to_json(sheetDeuda, { header: 1, defval: '' })
    console.log(`   Se procesaron ${rowsDeuda.length} filas de registro de deuda histórica para análisis.`)
  }

  console.log('\n====================================================')
  console.log(`🎉 ¡PROCESO COMPLETADO! Total recibos 2025 cargados: ${totalRecibosCargados}`)
  console.log('Los residentes ya pueden ingresar a su cuenta y ver sus recibos de 2025 en modo solo lectura.')
  console.log('====================================================\n')
}

// Ejecutar
const rutaDefault = path.resolve('RECIBOS AÑO 2025.xlsx')
const rutaArg = process.argv[2] ? path.resolve(process.argv[2]) : rutaDefault

ejecutarImportacion(rutaArg)
