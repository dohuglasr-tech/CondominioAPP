import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatAlicuotaPct } from './alicuota'

export interface ExpedienteLegalAptoData {
  // Datos Institucionales del Edificio y Junta
  edificio: {
    nombre: string
    rif?: string | null
    direccion?: string | null
    telefono?: string | null
    emailContacto?: string | null
    banco?: string | null
    cuentaBancaria?: string | null
    titularCuenta?: string | null
    tasaBcv: number
  }

  // Identificación del Inmueble y Sujetos Obligados
  apartamento: {
    id: string
    numero: string
    piso: number | null
    esPh: boolean
    alicuotaDecimal: number
    metrosCuadrados?: number | null
    estadoOcupacion: 'ocupado_propietario' | 'alquilado' | 'desocupado'
    tieneUsuarioWeb: boolean
    notasInternas?: string
    propietario: {
      nombre: string
      cedula?: string | null
      telefono: string
      email: string
    }
    inquilino?: {
      nombre: string
      telefono: string
      email: string
    }
  }

  // Métricas y Estadísticas
  metricas: {
    deudaTotalUsd: number
    deudaTotalBs: number
    mesesDeuda: number
    saldoAFavorUsd: number
    saldoAFavorBs: number
    totalFacturadoHistoricoUsd: number
    totalFacturadoHistoricoBs: number
    totalPagadoHistoricoUsd: number
    totalPagadoHistoricoBs: number
    tasaCumplimientoPct: number
    totalRecibosEmitidos: number
    recibosPagados: number
    recibosPendientes: number
    totalPagosReportados: number
    pagosAprobados: number
    pagosPendientes: number
    pagosRechazados: number
    tasaRiesgo: 'azul' | 'amarillo' | 'rojo' | 'morado' | 'solvente'
    accionLegalRecomendada?: string
    antiguedadDeudaTexto?: string
  }

  // Desglose Completo de Deudas y Cuotas
  deudasDetalle: Array<{
    concepto: string
    categoria: string
    fechaCorte: string
    montoUsd: number
    montoBs: number
    estado: string
  }>

  // Línea de Tiempo Cronológica
  lineaTiempo: Array<{
    fecha: string
    tipo: 'recibo' | 'pago' | 'auditoria' | 'cargo' | 'acuerdo'
    titulo: string
    detalle: string
    montoUsd?: number | null
    montoBs?: number | null
    estado: string
  }>

  // Autor y Firmas
  emisor: {
    autorNombre: string
    autorEmail?: string | null
    presidenteJunta?: string
    tesoreroJunta?: string
  }
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TASA_RIESGO_LABELS: Record<string, { label: string; sub: string; color: [number, number, number] }> = {
  solvente: { label: 'SOLVENTE AL DÍA', sub: 'Paz y Salvo contable', color: [22, 163, 74] },
  azul: { label: 'RECIBO DEL MES', sub: 'Corriente (<1 mes de mora)', color: [59, 130, 246] },
  amarillo: { label: 'RIESGO MODERADO', sub: 'Notificación Preventiva (3 meses)', color: [202, 138, 4] },
  rojo: { label: 'RIESGO ALTO', sub: 'Cobro Extrajudicial (4-6 meses)', color: [220, 38, 38] },
  morado: { label: 'RIESGO SEVERO / CRÓNICO', sub: 'Acción Judicial LPH Art. 14 (>6 meses)', color: [147, 51, 234] },
}

/**
 * Generador Oficial de Expediente de Estado de Cuenta y Prueba Legal
 * Diseñado bajo los estándares del sistema (Slate 900 y Acento Naranja),
 * con fundamentación jurídica en la Ley de Propiedad Horizontal (Arts. 13 y 14).
 */
export function generarExpedienteLegalPDF(datos: ExpedienteLegalAptoData): jsPDF {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297mm

  const cDark: [number, number, number] = [15, 23, 42]     // Slate 900
  const cAccent: [number, number, number] = [249, 115, 22] // Brand Orange
  const cMuted: [number, number, number] = [100, 116, 139] // Slate 500
  const cGreen: [number, number, number] = [22, 163, 74]   // Green 600
  const cRed: [number, number, number] = [220, 38, 38]     // Red 600

  const hoy = new Date()
  const fechaHoyStr = hoy.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horaHoyStr = hoy.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const hashVerificacion = Math.random().toString(36).substring(2, 8).toUpperCase()
  const numExpediente = `EXP-LEG-${datos.apartamento.numero.replace(/\s+/g, '')}-${hoy.getFullYear()}-${hashVerificacion}`

  const esSolvente = datos.metricas.deudaTotalUsd <= 0.01 && datos.metricas.deudaTotalBs <= 0.01
  const riesgoConfig = TASA_RIESGO_LABELS[datos.metricas.tasaRiesgo] || (esSolvente ? TASA_RIESGO_LABELS.solvente : TASA_RIESGO_LABELS.azul)

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ENCABEZADO INSTITUCIONAL DE ALTO IMPACTO
  // ──────────────────────────────────────────────────────────────────────────
  // Franja naranja superior
  doc.setFillColor(...cAccent)
  doc.rect(0, 0, pageWidth, 4, 'F')

  // Fondo oscuro Slate 900
  doc.setFillColor(...cDark)
  doc.rect(0, 4, pageWidth, 33, 'F')

  // Acento vertical naranja
  doc.setFillColor(...cAccent)
  doc.rect(14, 9, 3.5, 23, 'F')

  // Textos del encabezado
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...cAccent)
  doc.text(`JUNTA DE CONDOMINIO ${datos.edificio.nombre.toUpperCase()}`, 21, 14)

  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('EXPEDIENTE DE ESTADO DE CUENTA Y PRUEBA LEGAL', 21, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(203, 213, 225)
  doc.text('Instrumento de Liquidación de Cuotas y Título Ejecutivo · Ley de Propiedad Horizontal Art. 13 y 14', 21, 28)

  // Lado derecho del encabezado
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...cAccent)
  doc.text(`N°: ${numExpediente}`, pageWidth - 14, 13, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text(`Fecha Emisión: ${fechaHoyStr}`, pageWidth - 14, 18, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(249, 115, 22)
  doc.text(`Tasa Ref. BCV: Bs. ${fmtBs(datos.edificio.tasaBcv)} / $`, pageWidth - 14, 23, { align: 'right' })

  // Badge de Estatus de Solvencia / Mora en el Header
  const badgeW = 46
  const badgeH = 6
  const badgeX = pageWidth - 14 - badgeW
  const badgeY = 26

  doc.setFillColor(...riesgoConfig.color)
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(255, 255, 255)
  doc.text(riesgoConfig.label, badgeX + (badgeW / 2), badgeY + 4.2, { align: 'center' })

  // Barra de información del condominio (sub-header)
  let currentY = 41
  doc.setFillColor(241, 245, 249)
  doc.rect(14, currentY, pageWidth - 28, 6.5, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.rect(14, currentY, pageWidth - 28, 6.5, 'S')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(71, 85, 105)
  const rifText = datos.edificio.rif ? `RIF: ${datos.edificio.rif} · ` : ''
  const dirText = datos.edificio.direccion ? `Ubicación: ${datos.edificio.direccion}` : 'Residencias Ocutuy 5'
  const contactText = datos.edificio.emailContacto ? ` · Contacto: ${datos.edificio.emailContacto}` : ''
  doc.text(`${rifText}${dirText}${contactText}`, 17, currentY + 4.3)

  currentY += 10

  // ──────────────────────────────────────────────────────────────────────────
  // 2. FICHA TÉCNICA DEL INMUEBLE Y SUJETOS OBLIGADOS
  // ──────────────────────────────────────────────────────────────────────────
  const apto = datos.apartamento
  const cardH = 32
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.roundedRect(14, currentY, pageWidth - 28, cardH, 2, 2, 'FD')

  // Título de la tarjeta
  doc.setFillColor(...cDark)
  doc.roundedRect(14, currentY, pageWidth - 28, 5.5, 2, 2, 'F')
  doc.rect(14, currentY + 3.5, pageWidth - 28, 2, 'F') // quitar redondeo inferior
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text('I. IDENTIFICACIÓN FORMAL DEL INMUEBLE Y SUJETOS OBLIGADOS', 17, currentY + 4)

  // Columna Izquierda: Inmueble
  const col1X = 18
  let subY = currentY + 9.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(30, 41, 59)
  doc.text('Apartamento:', col1X, subY)
  doc.setFont('helvetica', 'normal')
  doc.text(`N° ${apto.numero} ${apto.esPh ? '(PENTHOUSE)' : ''} · Piso: ${apto.piso ?? 'N/D'}`, col1X + 24, subY)

  subY += 4.5
  doc.setFont('helvetica', 'bold')
  doc.text('Alícuota Legal:', col1X, subY)
  doc.setFont('helvetica', 'normal')
  doc.text(`${formatAlicuotaPct(apto.alicuotaDecimal)} (${apto.alicuotaDecimal})`, col1X + 24, subY)

  subY += 4.5
  doc.setFont('helvetica', 'bold')
  doc.text('Condición:', col1X, subY)
  doc.setFont('helvetica', 'normal')
  const ocupacionLabel = apto.estadoOcupacion === 'ocupado_propietario'
    ? 'Ocupado por Propietario'
    : apto.estadoOcupacion === 'alquilado'
    ? 'Arrendado / Alquilado'
    : 'Desocupado'
  doc.text(ocupacionLabel, col1X + 24, subY)

  subY += 4.5
  doc.setFont('helvetica', 'bold')
  doc.text('Cuenta Web:', col1X, subY)
  doc.setFont('helvetica', 'normal')
  doc.text(apto.tieneUsuarioWeb ? 'Registrada y Verificada' : 'Sin Usuario Registrado', col1X + 24, subY)

  // Columna Derecha: Propietario / Inquilino
  const col2X = 108
  subY = currentY + 9.5
  doc.setFont('helvetica', 'bold')
  doc.text('Copropietario(a):', col2X, subY)
  doc.setFont('helvetica', 'normal')
  doc.text(apto.propietario.nombre || 'No registrado', col2X + 26, subY)

  subY += 4.5
  doc.setFont('helvetica', 'bold')
  doc.text('C.I. / RIF:', col2X, subY)
  doc.setFont('helvetica', 'normal')
  doc.text(apto.propietario.cedula || 'No consignada', col2X + 26, subY)

  subY += 4.5
  doc.setFont('helvetica', 'bold')
  doc.text('Teléfono / Correo:', col2X, subY)
  doc.setFont('helvetica', 'normal')
  const contactoStr = `${apto.propietario.telefono || 'Sin teléfono'}${apto.propietario.email ? ` · ${apto.propietario.email}` : ''}`
  doc.text(contactoStr.length > 40 ? contactoStr.slice(0, 39) + '...' : contactoStr, col2X + 26, subY)

  subY += 4.5
  if (apto.inquilino && apto.estadoOcupacion === 'alquilado') {
    doc.setFont('helvetica', 'bold')
    doc.text('Inquilino Resp.:', col2X, subY)
    doc.setFont('helvetica', 'normal')
    doc.text(`${apto.inquilino.nombre} (${apto.inquilino.telefono})`, col2X + 26, subY)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.text('Notas Internas:', col2X, subY)
    doc.setFont('helvetica', 'normal')
    const notasStr = apto.notasInternas || 'Inmueble solvente en inspección física'
    doc.text(notasStr.length > 42 ? notasStr.slice(0, 40) + '...' : notasStr, col2X + 26, subY)
  }

  currentY += cardH + 7

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MÉTRICAS Y ESTADÍSTICAS FINANCIERAS (DASHBOARD LEGAL)
  // ──────────────────────────────────────────────────────────────────────────
  // Encabezado de Sección 1
  doc.setFillColor(...cAccent)
  doc.rect(14, currentY, 3, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...cDark)
  doc.text('1. MÉTRICAS, INDICADORES CLAVE Y RESUMEN FINANCIERO', 19, currentY + 4)
  currentY += 7

  // 4 Tarjetas KPI en fila
  const m = datos.metricas
  const totalCards = 4
  const gap = 3.5
  const cardW = (pageWidth - 28 - (gap * (totalCards - 1))) / totalCards // ~42.8mm
  const kpiH = 22

  const kpis = [
    {
      label: 'DEUDA TOTAL EXIGIBLE',
      val: esSolvente ? '$0.00 USD' : `$${fmtUsd(m.deudaTotalUsd)} USD`,
      sub: esSolvente ? 'Solvente al día' : `Bs. ${fmtBs(m.deudaTotalBs)}`,
      color: esSolvente ? cGreen : cRed,
      bg: esSolvente ? [240, 253, 244] as [number,number,number] : [254, 242, 242] as [number,number,number]
    },
    {
      label: 'MOROSIDAD / CONDICIÓN',
      val: esSolvente ? '0 Cuotas' : `${m.mesesDeuda} ${m.mesesDeuda === 1 ? 'Cuota' : 'Cuotas'}`,
      sub: riesgoConfig.label,
      color: riesgoConfig.color,
      bg: [255, 251, 235] as [number,number,number]
    },
    {
      label: 'CUMPLIMIENTO DE PAGO',
      val: `${m.tasaCumplimientoPct}%`,
      sub: `${m.recibosPagados} de ${m.totalRecibosEmitidos} Recibos`,
      color: m.tasaCumplimientoPct >= 80 ? cGreen : (m.tasaCumplimientoPct >= 50 ? [202, 138, 4] as [number,number,number] : cRed),
      bg: [248, 250, 252] as [number,number,number]
    },
    {
      label: 'SALDO A FAVOR / CRÉDITO',
      val: m.saldoAFavorUsd > 0.001 ? `+$${fmtUsd(m.saldoAFavorUsd)}` : '$0.00 USD',
      sub: m.saldoAFavorUsd > 0.001 ? `Bs. ${fmtBs(m.saldoAFavorBs)}` : 'Sin saldo a favor',
      color: m.saldoAFavorUsd > 0.001 ? cGreen : cMuted,
      bg: m.saldoAFavorUsd > 0.001 ? [240, 253, 244] as [number,number,number] : [248, 250, 252] as [number,number,number]
    }
  ]

  kpis.forEach((kpi, idx) => {
    const kpiX = 14 + (idx * (cardW + gap))
    doc.setFillColor(...kpi.bg)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.roundedRect(kpiX, currentY, cardW, kpiH, 1.8, 1.8, 'FD')

    // Borde superior de color
    doc.setFillColor(...kpi.color)
    doc.rect(kpiX, currentY, cardW, 1.2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(100, 116, 139)
    doc.text(kpi.label, kpiX + 3, currentY + 5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...kpi.color)
    doc.text(kpi.val, kpiX + 3, currentY + 12.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(71, 85, 105)
    doc.text(kpi.sub.length > 25 ? kpi.sub.slice(0, 24) + '...' : kpi.sub, kpiX + 3, currentY + 18)
  })

  currentY += kpiH + 4

  // Cuadro de métricas secundarias en mini-tabla
  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    theme: 'plain',
    styles: { fontSize: 6.8, cellPadding: 1.5, textColor: [51, 65, 85] },
    body: [
      [
        { content: `• Total Facturado Histórico: $ ${fmtUsd(m.totalFacturadoHistoricoUsd)} (${fmtBs(m.totalFacturadoHistoricoBs)} Bs)`, styles: { fontStyle: 'bold' } },
        { content: `• Total Recaudado / Aprobado: $ ${fmtUsd(m.totalPagadoHistoricoUsd)} (${fmtBs(m.totalPagadoHistoricoBs)} Bs)`, styles: { fontStyle: 'bold' } },
        { content: `• Pagos Reportados: ${m.totalPagosReportados} (${m.pagosAprobados} apr. / ${m.pagosPendientes} rev. / ${m.pagosRechazados} rech.)`, styles: { fontStyle: 'normal' } },
      ],
      [
        { content: `• Antigüedad del Compromiso: ${m.antiguedadDeudaTexto || (esSolvente ? 'Al día sin deuda acumulada' : 'Atraso en cuotas ordinarias')}`, styles: { fontStyle: 'normal' } },
        { content: `• Tasa BCV Aplicable de Liquidación: Bs. ${fmtBs(datos.edificio.tasaBcv)} por USD`, styles: { fontStyle: 'normal' } },
        { content: `• Acción Legal Recomendada: ${datos.metricas.accionLegalRecomendada || (esSolvente ? 'Solvente - Ninguna acción' : 'Apercibimiento / Cobro')}`, styles: { fontStyle: 'bold', textColor: esSolvente ? cGreen : cRed } },
      ]
    ]
  })

  currentY = (doc as any).lastAutoTable.finalY + 6

  // ──────────────────────────────────────────────────────────────────────────
  // 4. LIQUIDACIÓN DETALLADA DE LA DEUDA EXIGIBLE (TÍTULO EJECUTIVO ART. 14 LPH)
  // ──────────────────────────────────────────────────────────────────────────
  doc.setFillColor(...cAccent)
  doc.rect(14, currentY, 3, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...cDark)
  doc.text('2. PLANILLA DE LIQUIDACIÓN DE CUOTAS Y OBLIGACIONES VENCIDAS (ART. 14 LPH)', 19, currentY + 4)
  currentY += 6

  if (esSolvente || datos.deudasDetalle.length === 0) {
    // Tarjeta de Solvencia Plena
    doc.setFillColor(240, 253, 244)
    doc.setDrawColor(187, 247, 208)
    doc.setLineWidth(0.3)
    doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(22, 101, 52)
    doc.text('CERTIFICADO DE SOLVENCIA PLENA Y PAZ Y SALVO:', 18, currentY + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(22, 101, 52)
    doc.text('A la presente fecha de emisión, el apartamento se encuentra al día y libre de gravamen o deuda líquida exigible.', 18, currentY + 11)
    currentY += 21
  } else {
    // Tabla formal de liquidación
    const deudasRows = datos.deudasDetalle.map((d, i) => [
      String(i + 1),
      d.concepto,
      d.categoria,
      d.fechaCorte,
      `$ ${fmtUsd(d.montoUsd)}`,
      `Bs. ${fmtBs(d.montoBs)}`,
      d.estado.toUpperCase()
    ])

    // Fila totalizadora
    deudasRows.push([
      '',
      'TOTAL GENERAL EXIGIBLE AL CORTE (TÍTULO EJECUTIVO)',
      '',
      fechaHoyStr,
      `$ ${fmtUsd(datos.metricas.deudaTotalUsd)}`,
      `Bs. ${fmtBs(datos.metricas.deudaTotalBs)}`,
      'LIQUIDO Y EXIGIBLE'
    ])

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
      head: [['#', 'CONCEPTO / OBLIGACIÓN', 'CATEGORÍA', 'FECHA CORTE', 'MONTO ($)', 'MONTO (BS BCV)', 'ESTATUS LEGAL']],
      headStyles: { fillColor: cDark, textColor: 255, fontSize: 7.2, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'left', cellWidth: 62 },
        2: { halign: 'center', cellWidth: 32 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
        5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
        6: { halign: 'center', cellWidth: 16 }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (hookData) => {
        // Estilo de la fila de total general
        if (hookData.row.index === deudasRows.length - 1) {
          hookData.cell.styles.fillColor = [15, 23, 42]
          hookData.cell.styles.textColor = [255, 255, 255]
          hookData.cell.styles.fontStyle = 'bold'
          if (hookData.column.index === 4 || hookData.column.index === 5) {
            hookData.cell.styles.textColor = [249, 115, 22] // orange
          }
        }
      },
      body: deudasRows
    })

    currentY = (doc as any).lastAutoTable.finalY + 6
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. LÍNEA DE TIEMPO Y TRAZABILIDAD CRONOLÓGICA (TIMELINE)
  // ──────────────────────────────────────────────────────────────────────────
  // Si queda poco espacio antes de la tabla de timeline, saltamos de página
  if (currentY > 210) {
    doc.addPage()
    currentY = 22
  }

  doc.setFillColor(...cAccent)
  doc.rect(14, currentY, 3, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...cDark)
  doc.text('3. LÍNEA DE TIEMPO Y TRAZABILIDAD CRONOLÓGICA DE EVENTOS (AUDITORÍA)', 19, currentY + 4)
  currentY += 6

  const timelineRows = datos.lineaTiempo.map(item => {
    let tipoLabel = 'Evento'
    if (item.tipo === 'pago') tipoLabel = '💳 Pago Reportado'
    else if (item.tipo === 'recibo') tipoLabel = '📄 Recibo Emitido'
    else if (item.tipo === 'auditoria') tipoLabel = '⚙️ Auditoría / Ajuste'
    else if (item.tipo === 'cargo') tipoLabel = '⚠️ Cargo Especial'
    else if (item.tipo === 'acuerdo') tipoLabel = '🤝 Convenio / Acuerdo'

    const montoStr = (item.montoUsd && item.montoUsd > 0)
      ? `$ ${fmtUsd(item.montoUsd)}${item.montoBs ? ` / Bs. ${fmtBs(item.montoBs)}` : ''}`
      : (item.montoBs && item.montoBs > 0 ? `Bs. ${fmtBs(item.montoBs)}` : 'N/A')

    return [
      item.fecha || fechaHoyStr,
      tipoLabel,
      item.titulo,
      item.detalle,
      montoStr,
      item.estado
    ]
  })

  if (timelineRows.length === 0) {
    timelineRows.push([fechaHoyStr, 'Registro Inicial', 'Apertura de Expediente', 'Se abre expediente legal formal del inmueble', '$0.00', 'Activo'])
  }

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
    head: [['FECHA', 'TIPO EVENTO', 'DESCRIPCIÓN', 'DETALLE / OBSERVACIÓN', 'MONTO AFECTADO', 'VALIDACIÓN']],
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { halign: 'left', cellWidth: 32, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 46 },
      3: { halign: 'left', cellWidth: 44 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'center', cellWidth: 20 }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    body: timelineRows
  })

  currentY = (doc as any).lastAutoTable.finalY + 8

  // ──────────────────────────────────────────────────────────────────────────
  // 6. DECLARACIÓN, FUNDAMENTO JURÍDICO Y CONSTANCIA LEGAL (PRUEBA PRECONSTITUIDA)
  // ──────────────────────────────────────────────────────────────────────────
  // Si no hay suficiente espacio para la declaración legal y las firmas (mínimo ~55mm), agregar página
  if (currentY > 215) {
    doc.addPage()
    currentY = 22
  }

  doc.setFillColor(...cAccent)
  doc.rect(14, currentY, 3, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...cDark)
  doc.text('4. DECLARACIÓN JURADA, FUNDAMENTO LEGAL Y CONSTANCIA DE FE PÚBLICA', 19, currentY + 4)
  currentY += 6

  // Caja de texto legal
  const textoLegal = `La Junta de Condominio y/o la Administración debidamente facultada del inmueble "${datos.edificio.nombre.toUpperCase()}", en ejercicio de las atribuciones legales consagradas en el Documento de Condominio y los Artículos 13 y 14 de la Ley de Propiedad Horizontal de la República Bolivariana de Venezuela, CERTIFICA Y HACE CONSTAR:\n\n` +
    `1. Que las liquidaciones, cargos, recibos, abonos y saldos asentados en el presente instrumento son fiel y exacto reflejo de los libros de contabilidad, soportes bancarios y registros contables fidedignos del condominio.\n` +
    `2. De conformidad con el Artículo 14 de la Ley de Propiedad Horizontal, la presente planilla de liquidación de cuotas de condominio TIENE FUERZA EJECUTIVA y constituye título preconstituido para el cobro judicial por vía ejecutiva y solicitud de medidas cautelares o preventivas de embargo ante los tribunales competentes de la República.\n` +
    `3. Las obligaciones aquí determinadas son líquidas, exigibles y de plazo vencido. Se emite el presente documento para que sirva de prueba legal, certificación o intimación formal de cobro ante las instancias administrativas, notariales o judiciales a que hubiere lugar.`

  const legalLines = doc.splitTextToSize(textoLegal, pageWidth - 36)
  const legalBoxH = Math.max(26, (legalLines.length * 2.8) + 5)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.roundedRect(14, currentY, pageWidth - 28, legalBoxH, 1.5, 1.5, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.2)
  doc.setTextColor(51, 65, 85)
  doc.text(legalLines, 17, currentY + 4)

  currentY += legalBoxH + 10

  // ──────────────────────────────────────────────────────────────────────────
  // 7. BLOQUE DE FIRMAS Y ACUSE DE NOTIFICACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  if (currentY > 245) {
    doc.addPage()
    currentY = 25
  }

  const firmaWidth = 52
  const firmaCol1 = 16
  const firmaCol2 = 78
  const firmaCol3 = 140

  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.3)
  doc.line(firmaCol1, currentY + 12, firmaCol1 + firmaWidth, currentY + 12)
  doc.line(firmaCol2, currentY + 12, firmaCol2 + firmaWidth, currentY + 12)
  doc.line(firmaCol3, currentY + 12, firmaCol3 + firmaWidth, currentY + 12)

  // Firma 1: Presidente / Administrador
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(30, 41, 59)
  doc.text(datos.emisor.presidenteJunta || datos.emisor.autorNombre || 'Por la Administración', firmaCol1 + (firmaWidth / 2), currentY + 16, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text('Presidente / Administrador(a)', firmaCol1 + (firmaWidth / 2), currentY + 19.5, { align: 'center' })
  doc.text('Firma y Sello Oficial', firmaCol1 + (firmaWidth / 2), currentY + 22.5, { align: 'center' })

  // Firma 2: Tesorería / Junta
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(30, 41, 59)
  doc.text(datos.emisor.tesoreroJunta || 'Control de Finanzas / Junta', firmaCol2 + (firmaWidth / 2), currentY + 16, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text('Tesorería / Junta de Condominio', firmaCol2 + (firmaWidth / 2), currentY + 19.5, { align: 'center' })
  doc.text('Conformidad y Auditoría', firmaCol2 + (firmaWidth / 2), currentY + 22.5, { align: 'center' })

  // Firma 3: Acuse de Notificación / Propietario
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(30, 41, 59)
  doc.text('Acuse de Recibo / Notificado', firmaCol3 + (firmaWidth / 2), currentY + 16, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text('Copropietario o Receptor', firmaCol3 + (firmaWidth / 2), currentY + 19.5, { align: 'center' })
  doc.text('C.I. / Fecha / Firma', firmaCol3 + (firmaWidth / 2), currentY + 22.5, { align: 'center' })

  // ──────────────────────────────────────────────────────────────────────────
  // 8. HEADER Y FOOTER DINÁMICO EN TODAS LAS PÁGINAS (Paginación X de Y)
  // ──────────────────────────────────────────────────────────────────────────
  const totalPaginas = (doc as any).internal.getNumberOfPages()

  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)

    // Running Header para páginas 2 en adelante
    if (i > 1) {
      doc.setFillColor(...cDark)
      doc.rect(0, 0, pageWidth, 12, 'F')
      doc.setFillColor(...cAccent)
      doc.rect(0, 12, pageWidth, 1, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...cAccent)
      doc.text(`JUNTA DE CONDOMINIO ${datos.edificio.nombre.toUpperCase()}`, 14, 7.5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(255, 255, 255)
      doc.text(`Expediente Legal: Apto ${datos.apartamento.numero} · Ref: ${numExpediente}`, 105, 7.5, { align: 'center' })
      doc.text(`Tasa BCV: Bs. ${fmtBs(datos.edificio.tasaBcv)} · ${fechaHoyStr}`, pageWidth - 14, 7.5, { align: 'right' })
    }

    // Running Footer en TODAS las páginas
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.2)
    doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(100, 116, 139)
    doc.text(`Expediente: ${numExpediente} · Apto ${datos.apartamento.numero} · Impreso el ${fechaHoyStr} ${horaHoyStr}`, 14, pageHeight - 6.5)
    doc.text(`Página ${i} de ${totalPaginas}`, pageWidth / 2, pageHeight - 6.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('DOCUMENTO CON VALIDEZ LEGAL · LPH ARTS. 13 Y 14', pageWidth - 14, pageHeight - 6.5, { align: 'right' })
  }

  return doc
}

/**
 * Función helper directa para descargar el expediente en el navegador
 */
export function descargarExpedienteLegalApto(datos: ExpedienteLegalAptoData): void {
  const doc = generarExpedienteLegalPDF(datos)
  const aptoSanitizado = datos.apartamento.numero.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fechaStr = new Date().toISOString().slice(0, 10)
  doc.save(`Expediente_Legal_Apto_${aptoSanitizado}_${fechaStr}.pdf`)
}
