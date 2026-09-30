import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface DatosInformeGestion {
  nombreEdificio: string
  rifEdificio?: string | null
  direccionEdificio?: string | null
  periodoLabel: string
  totalFacturadoUsd: number
  totalRecaudadoUsd: number
  totalGastosUsd: number
  fondoReservaAcumuladoUsd: number
  totalMoraUsd: number
  tasaBcv: number
  gastosPorCategoria: Array<{
    categoria: string
    cantidad: number
    totalUsd: number
    totalBs: number
    porcentaje: number
  }>
  totalApartamentos: number
  apartamentosSolventes: number
  apartamentosEnMora: number
}

const CATEGORIA_LABELS: Record<string, string> = {
  agua: 'Agua / Hidrocapital',
  luz: 'Electricidad / Corpoelec',
  gas: 'Gas Doméstico',
  espacios_comunes: 'Espacios Comunes',
  imprevistos: 'Imprevistos y Emergencias',
  administracion: 'Honorarios de Administración',
  conserjeria: 'Conserjería y Vigilancia',
  servicios_externos: 'Servicios Externos y Contratos',
  reparaciones: 'Reparaciones y Mantenimiento',
}

export function generarInformeGestionPDF(datos: DatosInformeGestion): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // ── 1. ENCABEZADO INSTITUCIONAL ──
  // Franja superior de acento naranja
  doc.setFillColor(249, 115, 22)
  doc.rect(0, 0, pageWidth, 5, 'F')

  // Fondo del bloque de cabecera
  doc.setFillColor(20, 24, 33)
  doc.rect(0, 5, pageWidth, 32, 'F')

  // Título del edificio
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(datos.nombreEdificio.toUpperCase(), 14, 16)

  // Subtítulo
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 200, 200)
  const rifText = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
  doc.text(`${rifText}INFORME EJECUTIVO DE GESTIÓN Y RENDICIÓN DE CUENTAS`, 14, 22)
  doc.text(`Período Auditado: ${datos.periodoLabel}`, 14, 28)

  // Fecha y Tasa BCV a la derecha
  doc.setFontSize(8)
  doc.setTextColor(160, 160, 160)
  doc.text(`Emitido: ${new Date().toLocaleDateString('es-VE')}`, pageWidth - 14, 16, { align: 'right' })
  doc.setTextColor(249, 115, 22)
  doc.setFont('helvetica', 'bold')
  doc.text(`Tasa Ref. BCV: Bs. ${datos.tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pageWidth - 14, 22, { align: 'right' })

  let currentY = 44

  // ── 2. TARJETAS DE INDICADORES CLAVE (KPIs) ──
  const kpiWidth = (pageWidth - 28 - 9) / 4
  const kpiHeight = 22

  const kpis = [
    {
      label: 'TOTAL RECAUDADO',
      val: `$${datos.totalRecaudadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `Bs. ${(datos.totalRecaudadoUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 0 })}`,
      color: [16, 185, 129], // verde
    },
    {
      label: 'TOTAL GASTOS REALES',
      val: `$${datos.totalGastosUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `Bs. ${(datos.totalGastosUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 0 })}`,
      color: [249, 115, 22], // naranja
    },
    {
      label: 'FONDO DE RESERVA',
      val: `$${datos.fondoReservaAcumuladoUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `Bs. ${(datos.fondoReservaAcumuladoUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 0 })}`,
      color: [168, 85, 247], // morado
    },
    {
      label: 'CARTERA EN MORA',
      val: `$${datos.totalMoraUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${datos.apartamentosEnMora} aptos. pendientes`,
      color: [239, 68, 68], // rojo
    },
  ]

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (kpiWidth + 3)
    doc.setFillColor(245, 247, 250)
    doc.setDrawColor(220, 225, 230)
    doc.roundedRect(x, currentY, kpiWidth, kpiHeight, 2, 2, 'FD')

    // Borde izquierdo coloreado
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2])
    doc.roundedRect(x, currentY, 2, kpiHeight, 1, 1, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(110, 120, 135)
    doc.text(kpi.label, x + 5, currentY + 6)

    doc.setFontSize(10.5)
    doc.setTextColor(20, 25, 35)
    doc.text(kpi.val, x + 5, currentY + 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(120, 130, 140)
    doc.text(kpi.sub, x + 5, currentY + 18)
  })

  currentY += kpiHeight + 10

  // ── 3. RESUMEN DE CUMPLIMIENTO VECINAL ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 41, 59)
  doc.text('1. Resumen de Recaudación y Cumplimiento Vecinal', 14, currentY)

  currentY += 4

  const tasaCobranza = datos.totalFacturadoUsd > 0
    ? Math.min(100, (datos.totalRecaudadoUsd / datos.totalFacturadoUsd) * 100)
    : 100

  autoTable(doc, {
    startY: currentY,
    head: [['Indicador', 'Cantidad / Monto USD', 'Equivalente en Bs.', 'Efectividad']],
    body: [
      [
        'Total Facturado a Propietarios',
        `$${datos.totalFacturadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `Bs. ${(datos.totalFacturadoUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        '100.00%',
      ],
      [
        'Total Cobrado Efectivo en Banco/Caja',
        `$${datos.totalRecaudadoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `Bs. ${(datos.totalRecaudadoUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        `${tasaCobranza.toFixed(2)}%`,
      ],
      [
        'Apartamentos al Día (Solventes)',
        `${datos.apartamentosSolventes} de ${datos.totalApartamentos} apartamentos`,
        '—',
        `${((datos.apartamentosSolventes / Math.max(1, datos.totalApartamentos)) * 100).toFixed(1)}%`,
      ],
      [
        'Apartamentos con Deuda (En Mora)',
        `${datos.apartamentosEnMora} de ${datos.totalApartamentos} apartamentos`,
        `$${datos.totalMoraUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `${((datos.apartamentosEnMora / Math.max(1, datos.totalApartamentos)) * 100).toFixed(1)}%`,
      ],
    ],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: 50 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  })

  currentY = (doc as any).lastAutoTable.finalY + 10

  // ── 4. DESGLOSE DE GASTOS COMUNES POR CATEGORÍA ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 41, 59)
  doc.text('2. Distribución de Egresos y Gastos por Categoría', 14, currentY)

  currentY += 4

  const filasGastos = datos.gastosPorCategoria.map((g) => [
    CATEGORIA_LABELS[g.categoria] || g.categoria,
    `${g.cantidad} gasto(s)`,
    `$${g.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `Bs. ${g.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    `${g.porcentaje.toFixed(2)}%`,
  ])

  // Fila total
  filasGastos.push([
    'TOTAL GASTOS DEL PERÍODO',
    `${datos.gastosPorCategoria.reduce((s, g) => s + g.cantidad, 0)} gastos`,
    `$${datos.totalGastosUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `Bs. ${(datos.totalGastosUsd * datos.tasaBcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
    '100.00%',
  ])

  autoTable(doc, {
    startY: currentY,
    head: [['Categoría de Egreso', 'Comprobantes', 'Total USD', 'Total Bs.', '% del Total']],
    body: filasGastos,
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: 50 },
    alternateRowStyles: { fillColor: [255, 250, 245] },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      // Resaltar la última fila (Total)
      if (data.row.index === filasGastos.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [15, 23, 42]
        data.cell.styles.fillColor = [254, 215, 170]
      }
    },
  })

  // ── 5. SECCIÓN DE FIRMAS Y VALIDEZ ──
  const finalY = (doc as any).lastAutoTable.finalY + 18

  if (finalY < pageHeight - 35) {
    const firmaWidth = 60
    const col1 = 30
    const col2 = pageWidth - 30 - firmaWidth

    doc.setDrawColor(180, 180, 180)
    doc.line(col1, finalY + 12, col1 + firmaWidth, finalY + 12)
    doc.line(col2, finalY + 12, col2 + firmaWidth, finalY + 12)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50, 50, 50)
    doc.text('Por la Junta de Condominio', col1 + firmaWidth / 2, finalY + 16, { align: 'center' })
    doc.text('Administración / Finanzas', col2 + firmaWidth / 2, finalY + 16, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text('Visto Bueno y Aprobación', col1 + firmaWidth / 2, finalY + 20, { align: 'center' })
    doc.text('Revisión y Conformidad', col2 + firmaWidth / 2, finalY + 20, { align: 'center' })
  }

  // Pie de página
  doc.setFontSize(7)
  doc.setTextColor(140, 140, 140)
  doc.text(
    `Documento generado automáticamente por el Sistema CondominioApp para la Asamblea de Copropietarios.`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  )

  doc.save(`Informe_Gestion_${datos.nombreEdificio.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
