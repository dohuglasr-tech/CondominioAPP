import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FilaCalendarioApto } from '../data/calendarioDeudasService'

export interface DatosCarteleraAscensor {
  nombreEdificio: string
  rifEdificio?: string | null
  direccionEdificio?: string | null
  anio: number
  mesActualLabel?: string
  tasaBcv: number
  totalApartamentos: number
  apartamentosSolventes: number
  apartamentosMorosos: number
  totalDeudaUsd: number
  totalDeudaBs: number
  filas: FilaCalendarioApto[]
  configBanco?: {
    banco?: string | null
    titular?: string | null
    cedulaRif?: string | null
    tipoCuenta?: string | null
    cuentaBancaria?: string | null
    pagoMovilBanco?: string | null
    pagoMovilCedula?: string | null
    pagoMovilTelefono?: string | null
    zelleEmail?: string | null
  }
  mensajeComunidad?: string
  filtro?: 'todos' | 'con_deuda' | 'solventes'
  tituloPersonalizado?: string
}

const fmtBs = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtUsd = (n: number) =>
  (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Genera un PDF en formato Carta (Letter) sin márgenes excesivos,
 * diseñado específicamente para ser impreso y colocado en la cartelera del ascensor.
 * Dispone hasta 64 apartamentos en dos columnas paralelas para entrar en 1 sola hoja Carta.
 */
export function generarCarteleraAscensorPDF(datos: DatosCarteleraAscensor): jsPDF {
  // Dimensiones de papel Letter en mm: 215.9 x 279.4
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth() // 215.9 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 279.4 mm

  const cDarkNavy: [number, number, number] = [15, 23, 42]
  const cAccentOrange: [number, number, number] = [249, 115, 22]
  const cGreen: [number, number, number] = [16, 185, 129]
  const cRed: [number, number, number] = [239, 68, 68]
  const cLightBg: [number, number, number] = [248, 250, 252]

  // Filtrado de apartamentos según preferencia
  let aptos = [...datos.filas]
  if (datos.filtro === 'con_deuda') {
    aptos = aptos.filter(f => !f.estado_solvente)
  } else if (datos.filtro === 'solventes') {
    aptos = aptos.filter(f => f.estado_solvente)
  }

  // Ordenar numéricamente o alfabéticamente por apartamento
  aptos.sort((a, b) => {
    const numA = a.apartamento_numero.trim()
    const numB = b.apartamento_numero.trim()
    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENCABEZADO SUPERIOR (FULL BLEED SIN MÁRGENES)
  // ─────────────────────────────────────────────────────────────────────────────
  // Franja superior de acento
  doc.setFillColor(...cAccentOrange)
  doc.rect(0, 0, pageWidth, 4, 'F')

  // Bloque principal del encabezado
  doc.setFillColor(...cDarkNavy)
  doc.rect(0, 4, pageWidth, 28, 'F')

  // Línea divisoria inferior de la cabecera
  doc.setFillColor(...cAccentOrange)
  doc.rect(0, 32, pageWidth, 1, 'F')

  // Nombre del Edificio
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  const nombreEdif = (datos.nombreEdificio || 'CONDOMINIO RESIDENCIAL').toUpperCase()
  doc.text(nombreEdif, 8, 12)

  // Título de la Cartelera de Ascensor
  doc.setFontSize(9)
  doc.setTextColor(...cAccentOrange)
  const tituloCartelera = datos.tituloPersonalizado || 'BOLETÍN INFORMATIVO DE COBRANZA Y SOLVENCIA'
  doc.text(tituloCartelera.toUpperCase(), 8, 17.5)

  // Subtítulo con RIF y Edición
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(203, 213, 225)
  const rifStr = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
  const subInfo = `${rifStr}PUBLICACIÓN OFICIAL CARTELERA ASCENSOR · AÑO ${datos.anio}`
  doc.text(subInfo, 8, 22.5)

  // Mensaje secundario en header
  doc.setFontSize(6.8)
  doc.setTextColor(148, 163, 184)
  const dirStr = datos.direccionEdificio ? `Ubicación: ${datos.direccionEdificio}` : 'Válido para la comunidad de propietarios y residentes'
  doc.text(dirStr, 8, 27.5)

  // Bloque derecho: Fecha y Tasa BCV
  const fechaHoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(`Fecha: ${fechaHoy}`, pageWidth - 8, 12, { align: 'right' })

  doc.setFontSize(8)
  doc.setTextColor(...cAccentOrange)
  doc.text(`Tasa Ref. BCV: Bs. ${fmtBs(datos.tasaBcv)}/USD`, pageWidth - 8, 18, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(`Base de Emisión: Dólares ($) y Bolívares (Bs)`, pageWidth - 8, 24, { align: 'right' })

  let currentY = 36

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. RESUMEN DE INDICADORES COMUNITARIOS (KPIS)
  // ─────────────────────────────────────────────────────────────────────────────
  const marginX = 6
  const anchoUtil = pageWidth - marginX * 2 // 203.9 mm
  const numCards = 4
  const gapCards = 2.5
  const cardWidth = (anchoUtil - (gapCards * (numCards - 1))) / numCards
  const cardHeight = 13.5

  const pctSolvente = datos.totalApartamentos > 0
    ? ((datos.apartamentosSolventes / datos.totalApartamentos) * 100).toFixed(1)
    : '100'

  const kpis = [
    {
      title: 'TOTAL APARTAMENTOS',
      val: `${datos.totalApartamentos} Inmuebles`,
      sub: 'Base del Edificio',
      textColor: [255, 255, 255],
      border: [51, 65, 85]
    },
    {
      title: 'SOLVENTES AL DÍA',
      val: `🟢 ${datos.apartamentosSolventes} Aptos (${pctSolvente}%)`,
      sub: 'Estatus solvente',
      textColor: [52, 211, 153],
      border: [16, 185, 129]
    },
    {
      title: 'PENDIENTES / MORA',
      val: `🔴 ${datos.apartamentosMorosos} Aptos`,
      sub: 'Con saldo deudor',
      textColor: [248, 113, 113],
      border: [239, 68, 68]
    },
    {
      title: 'DEUDA COMUNIDAD',
      val: `$${fmtUsd(datos.totalDeudaUsd)}`,
      sub: `≈ Bs. ${fmtBs(datos.totalDeudaBs)}`,
      textColor: [251, 146, 60],
      border: [249, 115, 22]
    }
  ]

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (cardWidth + gapCards)
    doc.setFillColor(17, 24, 39)
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'F')
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2])
    doc.setLineWidth(0.3)
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.5, 1.5, 'S')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    doc.setTextColor(148, 163, 184)
    doc.text(kpi.title, x + 2.5, currentY + 3.8)

    doc.setFontSize(7.5)
    doc.setTextColor(kpi.textColor[0], kpi.textColor[1], kpi.textColor[2])
    doc.text(kpi.val, x + 2.5, currentY + 8.2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.2)
    doc.setTextColor(156, 163, 175)
    doc.text(kpi.sub, x + 2.5, currentY + 11.5)
  })

  currentY += cardHeight + 2.5

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MENSAJE DE CONCIENTIZACIÓN COMUNITARIA PARA EL ASCENSOR
  // ─────────────────────────────────────────────────────────────────────────────
  doc.setFillColor(254, 243, 199)
  doc.setDrawColor(245, 158, 11)
  doc.setLineWidth(0.3)
  doc.roundedRect(marginX, currentY, anchoUtil, 7.5, 1.2, 1.2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(146, 64, 14)
  doc.text('📢 MENSAJE DE LA ADMINISTRACIÓN Y JUNTA DE CONDOMINIO:', marginX + 3, currentY + 3.2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120, 53, 15)
  const defaultMsg = datos.mensajeComunidad ||
    'El pago oportuno de las cuotas es indispensable para el mantenimiento preventivo de ascensores, bombas de agua, iluminación y seguridad. ¡Agradecemos su compromiso!'
  doc.text(defaultMsg, marginX + 3, currentY + 6)

  currentY += 9.5

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TABLA DE APARTAMENTOS (DISPOSICIÓN COMPACTA EN 2 COLUMNAS PARALELAS)
  // ─────────────────────────────────────────────────────────────────────────────
  // Si hay hasta 64 apartamentos, los dividimos en 2 columnas lado a lado para que entren en 1 sola hoja.
  // Si hay más de 64, se generan en flujo continuo multi-página.
  const totalAptos = aptos.length
  const useTwoColumns = totalAptos <= 66

  const buildRowData = (item: FilaCalendarioApto) => {
    const esSolv = item.estado_solvente
    const estatusTexto = esSolv ? 'AL DÍA' : `DEUDA (${item.meses_con_deuda || 1}m)`
    const propietario = (item.propietario_nombre || 'Propietario').slice(0, 16)
    const deudaUsdTexto = esSolv
      ? (item.saldo_a_favor_usd > 0 ? `+${fmtUsd(item.saldo_a_favor_usd)}` : '$0.00')
      : `$${fmtUsd(item.total_usd)}`
    const deudaBsTexto = esSolv
      ? (item.saldo_a_favor_bs > 0 ? `+${fmtBs(item.saldo_a_favor_bs)}` : 'Bs. 0')
      : `Bs. ${fmtBs(item.total_bs)}`

    return {
      apto: item.apartamento_numero,
      propietario,
      estatus: estatusTexto,
      deudaUsd: deudaUsdTexto,
      deudaBs: deudaBsTexto,
      esSolvente: esSolv,
      tieneSaldoFavor: item.saldo_a_favor_usd > 0 || item.saldo_a_favor_bs > 0
    }
  }

  if (useTwoColumns) {
    const mitad = Math.ceil(totalAptos / 2)
    const listaIzq = aptos.slice(0, mitad)
    const listaDer = aptos.slice(mitad)

    const tableWidth = (anchoUtil - 3.5) / 2 // ~100.2 mm cada columna

    // Formatear filas izquierda
    const bodyIzq = listaIzq.map(a => {
      const r = buildRowData(a)
      return [r.apto, r.propietario, r.estatus, r.deudaUsd, r.deudaBs]
    })

    // Formatear filas derecha
    const bodyDer = listaDer.map(a => {
      const r = buildRowData(a)
      return [r.apto, r.propietario, r.estatus, r.deudaUsd, r.deudaBs]
    })

    const startTableY = currentY

    // Tabla Columna Izquierda
    autoTable(doc, {
      startY: startTableY,
      margin: { left: marginX, right: marginX + tableWidth + 3.5 },
      tableWidth: tableWidth,
      head: [['Apto', 'Propietario', 'Condición', 'Total ($)', 'Total (Bs)']],
      body: bodyIzq,
      theme: 'grid',
      styles: {
        fontSize: 6.2,
        cellPadding: 0.9,
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        textColor: [30, 41, 59],
        overflow: 'ellipsize',
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.4,
        halign: 'center',
        cellPadding: 1.2
      },
      columnStyles: {
        0: { cellWidth: 13, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 28, halign: 'left' },
        2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 19, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowIndex = data.row.index
          const item = listaIzq[rowIndex]
          if (item) {
            if (data.column.index === 2) {
              if (item.estado_solvente) {
                data.cell.styles.textColor = [16, 185, 129]
                data.cell.styles.fillColor = [240, 253, 244]
              } else {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fillColor = [254, 242, 242]
              }
            } else if (data.column.index === 3) {
              if (!item.estado_solvente) {
                data.cell.styles.textColor = [185, 28, 28]
              } else if (item.saldo_a_favor_usd > 0) {
                data.cell.styles.textColor = [5, 150, 105]
              }
            }
          }
        }
      }
    })

    // Tabla Columna Derecha
    autoTable(doc, {
      startY: startTableY,
      margin: { left: marginX + tableWidth + 3.5, right: marginX },
      tableWidth: tableWidth,
      head: [['Apto', 'Propietario', 'Condición', 'Total ($)', 'Total (Bs)']],
      body: bodyDer,
      theme: 'grid',
      styles: {
        fontSize: 6.2,
        cellPadding: 0.9,
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        textColor: [30, 41, 59],
        overflow: 'ellipsize',
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.4,
        halign: 'center',
        cellPadding: 1.2
      },
      columnStyles: {
        0: { cellWidth: 13, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 28, halign: 'left' },
        2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 19, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowIndex = data.row.index
          const item = listaDer[rowIndex]
          if (item) {
            if (data.column.index === 2) {
              if (item.estado_solvente) {
                data.cell.styles.textColor = [16, 185, 129]
                data.cell.styles.fillColor = [240, 253, 244]
              } else {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fillColor = [254, 242, 242]
              }
            } else if (data.column.index === 3) {
              if (!item.estado_solvente) {
                data.cell.styles.textColor = [185, 28, 28]
              } else if (item.saldo_a_favor_usd > 0) {
                data.cell.styles.textColor = [5, 150, 105]
              }
            }
          }
        }
      }
    })

    // La posición final queda al término de la tabla más larga
    const finalTableY = Math.max(
      (doc as any).lastAutoTable?.finalY || 215,
      startTableY + (mitad * 4.3) + 7
    )
    currentY = Math.min(finalTableY + 3.5, 236)
  } else {
    // Para edificios grandes con más de 66 apartamentos: Tabla de ancho completo auto-paginada
    const bodyFull = aptos.map(a => {
      const r = buildRowData(a)
      return [r.apto, r.propietario, r.estatus, r.deudaUsd, r.deudaBs]
    })

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: [['Apartamento', 'Propietario / Residente', 'Estatus de Cobranza', 'Deuda Total ($)', 'Deuda Total (Bs)']],
      body: bodyFull,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59]
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 70, halign: 'left' },
        2: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 35, halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const item = aptos[data.row.index]
          if (item) {
            if (data.column.index === 2) {
              if (item.estado_solvente) {
                data.cell.styles.textColor = [16, 185, 129]
                data.cell.styles.fillColor = [240, 253, 244]
              } else {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fillColor = [254, 242, 242]
              }
            } else if (data.column.index === 3) {
              if (!item.estado_solvente) {
                data.cell.styles.textColor = [185, 28, 28]
              }
            }
          }
        }
      }
    })

    currentY = ((doc as any).lastAutoTable?.finalY || 215) + 4
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CAJA DE CUENTAS BANCARIAS Y CANALES DE PAGO (CLAVE PARA EL ASCENSOR)
  // ─────────────────────────────────────────────────────────────────────────────
  // Si estamos muy cerca del fondo, aseguramos que quepa o dibujamos en la parte inferior fija
  const bankBoxHeight = 31
  const bankBoxY = Math.min(Math.max(currentY, 238), pageHeight - bankBoxHeight - 8.5)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.4)
  doc.roundedRect(marginX, bankBoxY, anchoUtil, bankBoxHeight, 2, 2, 'FD')

  // Título del recuadro bancario
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(marginX, bankBoxY, anchoUtil, 6, 2, 2, 'F')
  doc.rect(marginX, bankBoxY + 3.5, anchoUtil, 2.5, 'F') // Alisar esquinas inferiores

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(255, 255, 255)
  doc.text('💳 CUENTAS BANCARIAS OFICIALES PARA REGULARIZAR Y CONCILIAR SU PAGO', marginX + 3.5, bankBoxY + 4.2)

  const cfgB = datos.configBanco || {}
  const colBankW = (anchoUtil - 6) / 2

  // Columna 1: Transferencia Bancaria
  const b1X = marginX + 3.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.4)
  doc.setTextColor(...cAccentOrange)
  doc.text('🏦 Transferencia en Bolívares (Bs):', b1X, bankBoxY + 9.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  doc.setTextColor(51, 65, 85)
  const bancoNombre = cfgB.banco || 'Bicentenario / Banco Nacional'
  const titular = cfgB.titular || datos.nombreEdificio || 'Junta de Condominio'
  const cedula = cfgB.cedulaRif || datos.rifEdificio || 'J-XXXXXXXX-X'
  const cuentaNum = cfgB.cuentaBancaria || '0175-XXXX-XX-XXXXXXXXXX'

  doc.text(`Banco: ${bancoNombre}`, b1X, bankBoxY + 13.5)
  doc.text(`Titular: ${titular} · C.I/RIF: ${cedula}`, b1X, bankBoxY + 17)
  doc.setFont('helvetica', 'bold')
  doc.text(`Cuenta (20 dígitos): ${cuentaNum}`, b1X, bankBoxY + 20.5)

  // Columna 2: Pago Móvil y Zelle / Moneda Extranjera
  const b2X = marginX + colBankW + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.4)
  doc.setTextColor(...cAccentOrange)
  doc.text('📱 Pago Móvil (Interbancario Bs):', b2X, bankBoxY + 9.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  doc.setTextColor(51, 65, 85)
  const pmBanco = cfgB.pagoMovilBanco || cfgB.banco || 'Bicentenario'
  const pmTelf = cfgB.pagoMovilTelefono || '0414-XXXXXXX'
  const pmCed = cfgB.pagoMovilCedula || cfgB.cedulaRif || 'J-XXXXXXXX'

  doc.text(`Banco: ${pmBanco} · Teléfono: ${pmTelf}`, b2X, bankBoxY + 13.5)
  doc.text(`Cédula / RIF: ${pmCed}`, b2X, bankBoxY + 17)

  if (cfgB.zelleEmail) {
    doc.setFont('helvetica', 'bold')
    doc.text(`🟣 Zelle / Divisas: ${cfgB.zelleEmail}`, b2X, bankBoxY + 20.5)
  } else {
    doc.setFont('helvetica', 'italic')
    doc.text('Aceptado en efectivo $ previo acuerdo con administración.', b2X, bankBoxY + 20.5)
  }

  // Franja inferior de instrucción
  doc.setFillColor(241, 245, 249)
  doc.rect(marginX + 0.4, bankBoxY + 23.5, anchoUtil - 0.8, 6.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.6)
  doc.setTextColor(30, 41, 59)
  doc.text(
    '✓ REPORTE DE PAGO: Al realizar su transferencia o pago móvil, repórtelo en la aplicación del condominio o envíe el comprobante al WhatsApp de la administración.',
    marginX + 3.5,
    bankBoxY + 28
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. PIE DE PÁGINA INSTITUCIONAL
  // ─────────────────────────────────────────────────────────────────────────────
  const footerY = pageHeight - 4.5
  doc.setFillColor(...cAccentOrange)
  doc.rect(0, pageHeight - 2, pageWidth, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `Documento informativo emitido el ${fechaHoy} · Uso exclusivo Cartelera de Ascensor · Cuidar nuestras instalaciones es compromiso de todos.`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  )

  return doc
}
