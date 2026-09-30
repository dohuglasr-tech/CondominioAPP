import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getAlicuotaDecimal, formatAlicuotaPct } from './alicuota'

export interface ReciboAptoData {
  id?: string
  numero: string
  alicuota: number
  propietario_nombre: string | null
}

export interface ReciboGastoData {
  descripcion: string
  monto_usd: number
  monto_bs: number
  categoria?: string
}

export interface ReciboCargoData {
  id?: string
  apartamento_id?: string
  tipo: string
  descripcion: string
  monto_usd: number
  monto_bs?: number
}

export interface ReciboConfigData {
  nombre_edificio: string
  rif: string | null
  direccion: string | null
  email_contacto: string | null
  banco?: string | null
  cuenta_bancaria?: string | null
  titular_cuenta?: string | null
  tasa_bcv_actual?: number
}

export interface ReciboPagoInfo {
  estado: 'pendiente' | 'pagado'
  fecha_pago?: string | null
  banco?: string | null
  referencia?: string | null
  monto_bs?: number | null
  monto_usd?: number | null
  metodo_pago?: string | null
}

const TIPO_CARGO_LABELS: Record<string, string> = {
  multa: '⚠️ Multa',
  deuda_atrasada: '🔴 Deuda Atrasada',
  cuota_extraordinaria: '🔷 Cuota Extraordinaria',
  acuerdo_pago: '🤝 Acuerdo de Pago',
}

const fmtBs  = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const DEFAULT_NOTAS_RECIBO = `DEPOSITAR EN CUENTA CORRIENTE NRO 0175-0525-4100-7575-1351 BANCO BICENTENARIO A NOMBRE DE ZORAYA ALMEIDA, CÉDULA V-6089037. VERIFICAR QUE SE REALICE LA TRANSACCIÓN. PAGO MÓVIL DISPONIBLE.
VECINOS: FAVOR NO LANZAR BOTELLAS NI VIDRIOS POR EL BAJANTE, ES SUMAMENTE PELIGROSO.
VECINOS: FAVOR REVISAR SUS FILTRACIONES Y DRENAJES DE AIRES ACONDICIONADOS.`

/**
 * Generador de PDF oficial de Recibo de Condominio
 * Estilo factura moderna con paleta de colores de la aplicación (Slate 900 y Naranja)
 * Formato y estructura coincidente con el modelo de Excel del condominio.
 */
export function generarPDFRecibo(
  apto: ReciboAptoData,
  gastos: ReciboGastoData[],
  cargos: ReciboCargoData[],
  config: ReciboConfigData,
  fondoReservaPct: number,
  mesLabel: string,
  anio: number,
  notasResidentes?: string,
  pagoInfo?: ReciboPagoInfo,
): jsPDF {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const cDark:   [number,number,number] = [15, 23, 42]     // Slate 900
  const cAccent: [number,number,number] = [249, 115, 22]   // Brand Orange

  const alicuota = getAlicuotaDecimal(apto.alicuota)
  const totalGastosUsd = gastos.reduce((s, g) => s + (g.monto_usd || 0), 0)
  const totalGastosBs  = gastos.reduce((s, g) => s + (g.monto_bs || 0), 0)
  
  const fondoEdificioUsd = totalGastosUsd * (fondoReservaPct / 100)
  const fondoEdificioBs  = totalGastosBs  * (fondoReservaPct / 100)
  const totalEdificioUsd = totalGastosUsd + fondoEdificioUsd
  const totalEdificioBs  = totalGastosBs  + fondoEdificioBs

  const subtotalUsd  = totalGastosUsd * alicuota
  const subtotalBs   = totalGastosBs  * alicuota
  const fondoUsd     = subtotalUsd * (fondoReservaPct / 100)
  const fondoBs      = subtotalBs  * (fondoReservaPct / 100)
  const cargosApto   = apto.id ? cargos.filter(c => c.apartamento_id === apto.id) : cargos
  const cargosUsd    = cargosApto.reduce((s, c) => s + (c.monto_usd || 0), 0)
  const cargosBs     = cargosApto.reduce((s, c) => s + (c.monto_bs || 0), 0)
  const totalUsd     = subtotalUsd + fondoUsd + cargosUsd
  const totalBs      = subtotalBs  + fondoBs  + cargosBs

  const esPH = apto.numero.toUpperCase().includes('PH')

  // ── 1. HEADER MODERNO GEOMÉTRICO (Inspiración Imagen 3 con paleta Slate/Naranja) ──
  doc.setFillColor(...cDark)
  doc.rect(0, 0, 210, 36, 'F')

  // Línea inferior naranja de acento
  doc.setFillColor(...cAccent)
  doc.rect(0, 36, 210, 2, 'F')

  // Acento vertical izquierdo
  doc.setFillColor(...cAccent)
  doc.rect(12, 10, 3, 16, 'F')

  // Título e institución (Lado izquierdo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...cAccent)
  doc.text('JUNTA DE CONDOMINIO OCUTUY 5', 18, 14)

  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text('RECIBO DE CONDOMINIO', 18, 21)

  // Sello opcional si está pagado y solvente (centrado a x=105, y=11, sin tocar títulos ni correo)
  if (pagoInfo?.estado === 'pagado') {
    const badgeW = 34
    const badgeH = 5.6
    const badgeX = 105 - (badgeW / 2)
    const badgeY = 11

    doc.setFillColor(22, 163, 74)
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.8, 1.8, 'F')
    doc.setDrawColor(74, 222, 128)
    doc.setLineWidth(0.3)
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.8, 1.8, 'S')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(255, 255, 255)
    doc.text('PAGADO Y SOLVENTE', 105, badgeY + 3.9, { align: 'center' })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(203, 213, 225)
  doc.text('DIRECCIÓN: URBANIZACIÓN CASA BLANCA, RESIDENCIAS OCUTUY 5', 18, 27)

  // Datos fiscales y contacto (Lado derecho)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...cAccent)
  doc.text(`RIF: ${config.rif || 'J-296749485'}`, 198, 14, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(226, 232, 240)
  doc.text(`CORREO: ${config.email_contacto || 'juntacondominioocutuy5@gmail.com'}`, 198, 20, { align: 'right' })
  doc.text(`EDIFICIO: ${config.nombre_edificio || 'RESIDENCIAS OCUTUY 5'}`, 198, 26, { align: 'right' })

  // ── 2. CUADRO DE INFORMACIÓN DEL INMUEBLE (Formato Excel Imagen 2) ──
  autoTable(doc, {
    startY: 41,
    margin: { left: 12, right: 12 },
    tableWidth: 186,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.3 },
    head: [['APARTAMENTO', 'PROPIETARIO', 'ALÍCUOTA', 'MES', 'AÑO']],
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    body: [[
      `Nro. ${apto.numero} ${esPH ? '(PH)' : ''}`,
      apto.propietario_nombre || 'Residente',
      formatAlicuotaPct(apto.alicuota),
      mesLabel.toUpperCase(),
      String(anio)
    ]],
    bodyStyles: { fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
    columnStyles: {
      0: { halign: 'center', textColor: cAccent, cellWidth: 32 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 74 },
      2: { halign: 'center', cellWidth: 28 },
      3: { halign: 'center', cellWidth: 28 },
      4: { halign: 'center', cellWidth: 24 }
    }
  })

  // ── 3. TABLA DE GASTOS COMUNES (Formato Excel Imagen 2) ──
  const bodyGastos = gastos.map(g => [
    g.descripcion,
    `${fmtBs(g.monto_bs)} Bs`,
    `$ ${fmtUsd(g.monto_usd)}`
  ])

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 2.5,
    margin: { left: 12, right: 12 },
    tableWidth: 186,
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
    head: [['DETALLES DE GASTOS COMUNES', 'BOLÍVARES', 'DÓLAR $']],
    headStyles: {
      fillColor: cDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      halign: 'center',
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 116 },
      1: { halign: 'right', cellWidth: 42, fontStyle: 'normal' },
      2: { halign: 'right', cellWidth: 28, fontStyle: 'normal' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    body: bodyGastos
  })

  // ── 4. SUB TOTALES Y TOTAL EDIFICIO (Formato Excel Imagen 2) ──
  const subTotalesBody: any[] = [
    ['SUB TOTAL', `${fmtBs(totalGastosBs)} Bs`, `$ ${fmtUsd(totalGastosUsd)}`],
    [`FONDO DE RESERVA (${fondoReservaPct}%)`, `${fmtBs(fondoEdificioBs)} Bs`, `$ ${fmtUsd(fondoEdificioUsd)}`],
    ['TOTAL GASTOS CONDOMINIO', `${fmtBs(totalEdificioBs)} Bs`, `$ ${fmtUsd(totalEdificioUsd)}`]
  ]

  if (cargosApto.length > 0) {
    cargosApto.forEach(c => {
      subTotalesBody.push([
        `CARGO: ${TIPO_CARGO_LABELS[c.tipo] || c.tipo} — ${c.descripcion}`,
        `${fmtBs(c.monto_bs || 0)} Bs`,
        `$ ${fmtUsd(c.monto_usd)}`
      ])
    })
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    margin: { left: 12, right: 12 },
    tableWidth: 186,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 116, halign: 'right', fontStyle: 'bold' },
      1: { halign: 'right', cellWidth: 42, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 28, fontStyle: 'bold' }
    },
    body: subTotalesBody
  })

  // ── 5. TOTAL A PAGAR (CON ALÍCUOTA APLICADA) ──
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    margin: { left: 12, right: 12 },
    tableWidth: 186,
    theme: 'grid',
    head: [[
      `TOTAL A PAGAR (ALÍCUOTA ${formatAlicuotaPct(apto.alicuota)})`,
      `${fmtBs(totalBs)} Bs`,
      `$ ${fmtUsd(totalUsd)}`
    ]],
    headStyles: {
      fillColor: cAccent,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 2.8
    },
    columnStyles: {
      0: { cellWidth: 116, halign: 'right' },
      1: { halign: 'right', cellWidth: 42 },
      2: { halign: 'right', cellWidth: 28 }
    }
  })

  // ── 6. BANNER DE ADVERTENCIA O SOLVENCIA (Formato Imagen 2) ──
  let currentY = (doc as any).lastAutoTable.finalY + 2.5
  if (pagoInfo?.estado === 'pagado') {
    doc.setFillColor(220, 252, 231)
    doc.setDrawColor(34, 197, 94)
    doc.setLineWidth(0.4)
    doc.rect(12, currentY, 186, 7, 'FD')
    doc.setTextColor(22, 101, 52)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    doc.text(
      'RECIBO PAGADO Y VALIDADO POR LA ADMINISTRACION - CONSTANCIA DE SOLVENCIA',
      105, currentY + 4.7, { align: 'center' }
    )
  } else {
    doc.setFillColor(254, 243, 199)
    doc.setDrawColor(245, 158, 11)
    doc.setLineWidth(0.4)
    doc.rect(12, currentY, 186, 7, 'FD')
    doc.setTextColor(146, 64, 14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(
      `***** ATENCION: PAGAR  ${fmtUsd(totalUsd)}  $  ANCLADO AL $ BCV DEL DIA DE SU PAGO *****`,
      105, currentY + 4.7, { align: 'center' }
    )
  }

  // ── 7. NOTAS PARA LOS RESIDENTES (Editable por el Admin) ──
  currentY += 9.5
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  
  const textoNotas = (notasResidentes || DEFAULT_NOTAS_RECIBO).trim()
  const notasLineas = doc.splitTextToSize(textoNotas, 180)
  const notasHeight = Math.max(14, (notasLineas.length * 3.2) + 6.5)

  doc.rect(12, currentY, 186, notasHeight, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.2)
  doc.setTextColor(15, 23, 42)
  doc.text('NOTAS PARA LOS RESIDENTES:', 15, currentY + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(71, 85, 105)
  doc.text(notasLineas, 15, currentY + 8)

  currentY += notasHeight + 2.5

  // ── 8. TALÓN DE CONTROL DE PAGO (Formato Excel Imagen 2) ──
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.3)
  doc.rect(12, currentY, 186, 21, 'S')

  doc.setFillColor(241, 245, 249)
  doc.rect(12, currentY, 186, 4.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(51, 65, 85)
  doc.text('TALÓN DE CONTROL DE PAGO (REGISTRO DEL RESIDENTE / ADMINISTRACIÓN)', 105, currentY + 3, { align: 'center' })

  if (pagoInfo?.estado === 'pagado') {
    let sy = currentY + 7.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(22, 101, 52)
    doc.text('PAGADO: SI (VALIDADO EN SISTEMA)', 16, sy)
    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    const fStr = pagoInfo.fecha_pago ? new Date(pagoInfo.fecha_pago).toLocaleDateString('es-VE') : 'Validado'
    doc.text(`FECHA: ${fStr}`, 110, sy)
    
    sy += 4.2
    doc.text(`BANCO: ${pagoInfo.banco || config.banco || 'Bicentenario / Transferencia'}`, 16, sy)

    sy += 4.2
    doc.text(`MONTO: ${fmtBs(pagoInfo.monto_bs || totalBs)} Bs  ($ ${fmtUsd(pagoInfo.monto_usd || totalUsd)})`, 16, sy)
    const tasaPdf = (config.tasa_bcv_actual && config.tasa_bcv_actual > 1) ? config.tasa_bcv_actual : (totalUsd > 0 && totalBs > 0 ? totalBs / totalUsd : 859.06)
    doc.text(`DOLAR DEL DIA: ${fmtBs(tasaPdf)} Bs/$`, 110, sy)

    sy += 4.2
    doc.text(`REFERENCIA: ${pagoInfo.referencia || 'VALIDADO'}`, 16, sy)
    doc.text(`CTA: ${config.cuenta_bancaria || '0175-0525-4100-7575-1351'}`, 110, sy)
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(71, 85, 105)

    let sy = currentY + 7.5
    doc.text('PAGADO: ___________________________', 16, sy)
    doc.text('FECHA: ____________________________', 110, sy)
    
    sy += 4.2
    doc.text('BANCO: __________________________________________________________________________', 16, sy)

    sy += 4.2
    doc.text('MONTO: ____________________________', 16, sy)
    doc.text('DÓLAR DEL DÍA: _____________________', 110, sy)

    sy += 4.2
    doc.text('REFERENCIA: ________________________', 16, sy)
    doc.text('CTA: ______________________________', 110, sy)
  }

  // ── 9. FOOTER ──
  doc.setFontSize(6)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-VE')} · Sistema de Gestión de Condominios · Residencias Ocutuy 5`, 105, 292, { align: 'center' })

  return doc
}
