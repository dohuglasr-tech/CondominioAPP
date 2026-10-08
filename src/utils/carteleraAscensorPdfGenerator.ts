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
  orientacion?: 'portrait' | 'landscape'
  distribucionPaginas?: 1 | 2 | 3
}

const fmtBs = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtUsd = (n: number) =>
  (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Genera un PDF en formato Carta (Letter) sin márgenes excesivos,
 * permitiendo orientación Vertical (Portrait) u Horizontal (Landscape)
 * y distribución modular en 1, 2 o 3 hojas para optimizar la estética
 * y permitir unir hojas murales en el ascensor para máxima visibilidad.
 */
export function generarCarteleraAscensorPDF(datos: DatosCarteleraAscensor): jsPDF {
  const orientacion = datos.orientacion || 'portrait'
  const distribucion = (datos.distribucionPaginas && [1, 2, 3].includes(datos.distribucionPaginas))
    ? datos.distribucionPaginas
    : 1

  const doc = new jsPDF({
    orientation: orientacion,
    unit: 'mm',
    format: 'letter'
  })

  const cDarkNavy: [number, number, number] = [15, 23, 42]
  const cAccentOrange: [number, number, number] = [249, 115, 22]

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

  const fechaHoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })

  // Dividir los apartamentos en bloques según la cantidad de páginas solicitadas
  const chunksAptos: FilaCalendarioApto[][] = []
  if (distribucion === 1) {
    chunksAptos.push(aptos)
  } else if (distribucion === 2) {
    const mitad = Math.ceil(aptos.length / 2)
    chunksAptos.push(aptos.slice(0, mitad))
    chunksAptos.push(aptos.slice(mitad))
  } else {
    // 3 páginas
    const tercio = Math.ceil(aptos.length / 3)
    chunksAptos.push(aptos.slice(0, tercio))
    chunksAptos.push(aptos.slice(tercio, tercio * 2))
    chunksAptos.push(aptos.slice(tercio * 2))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDERIZADO PÁGINA POR PÁGINA
  // ─────────────────────────────────────────────────────────────────────────────
  chunksAptos.forEach((aptosChunk, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage('letter', orientacion)
    }

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginX = 6
    const anchoUtil = pageWidth - marginX * 2
    const numPagina = pageIndex + 1
    const totalPaginas = distribucion

    // 1. ENCABEZADO
    const headerHeight = orientacion === 'landscape' ? 24 : 28
    doc.setFillColor(...cAccentOrange)
    doc.rect(0, 0, pageWidth, 3.5, 'F')

    doc.setFillColor(...cDarkNavy)
    doc.rect(0, 3.5, pageWidth, headerHeight, 'F')

    doc.setFillColor(...cAccentOrange)
    doc.rect(0, 3.5 + headerHeight, pageWidth, 0.8, 'F')

    // Título edificio
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(orientacion === 'landscape' ? 12 : 13)
    const nombreEdif = (datos.nombreEdificio || 'CONDOMINIO RESIDENCIAL').toUpperCase()
    doc.text(nombreEdif, marginX + 2, 10.5)

    // Título boletín
    doc.setFontSize(orientacion === 'landscape' ? 8.5 : 9)
    doc.setTextColor(...cAccentOrange)
    const titBase = datos.tituloPersonalizado || 'BOLETÍN INFORMATIVO DE COBRANZA Y SOLVENCIA'
    const parteBadge = totalPaginas > 1 ? ` · (HOJA ${numPagina} DE ${totalPaginas})` : ''
    doc.text(`${titBase.toUpperCase()}${parteBadge}`, marginX + 2, 15.5)

    // Subtítulo
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(203, 213, 225)
    const rifStr = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
    let subTxt = `${rifStr}CARTELERA DE ASCENSOR · AÑO ${datos.anio}`
    if (totalPaginas === 3) {
      const parteLabels = ['PANEL SUPERIOR / APERTURA', 'PANEL CENTRAL / NÚCLEO', 'PANEL INFERIOR / CIERRE Y PAGOS']
      subTxt += ` · [${parteLabels[pageIndex]}]`
    } else if (totalPaginas === 2) {
      subTxt += ` · [PARTE ${numPagina}: ${pageIndex === 0 ? 'RELACIÓN DE INMUEBLES I' : 'RELACIÓN DE INMUEBLES II Y PAGOS'}]`
    }
    doc.text(subTxt, marginX + 2, 20.2)

    doc.setFontSize(6.5)
    doc.setTextColor(148, 163, 184)
    const dirTxt = datos.direccionEdificio ? `Ubicación: ${datos.direccionEdificio}` : 'Publicación oficial comunitaria'
    doc.text(dirTxt, marginX + 2, 24.5)

    // Bloque derecho
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text(`Fecha: ${fechaHoy}`, pageWidth - marginX - 2, 10.5, { align: 'right' })

    doc.setFontSize(8)
    doc.setTextColor(...cAccentOrange)
    doc.text(`Tasa Ref. BCV: Bs. ${fmtBs(datos.tasaBcv)}/USD`, pageWidth - marginX - 2, 15.5, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Base: Dólares ($) y Bolívares (Bs)`, pageWidth - marginX - 2, 20.5, { align: 'right' })

    let currentY = headerHeight + 6

    // 2. INDICADORES COMUNITARIOS (KPIS)
    // En 1 hoja o en la primera hoja de multi-página, dibujamos los KPIs
    const mostrarKpisCompletos = (numPagina === 1) || (totalPaginas === 2 && numPagina === 1) || (totalPaginas === 3 && numPagina === 1)
    if (mostrarKpisCompletos) {
      const cardHeight = orientacion === 'landscape' ? 11.5 : 13
      const numCards = 4
      const gapCards = 2.5
      const cardWidth = (anchoUtil - gapCards * (numCards - 1)) / numCards
      const pctSolvente = datos.totalApartamentos > 0
        ? ((datos.apartamentosSolventes / datos.totalApartamentos) * 100).toFixed(1)
        : '100'

      const kpis = [
        {
          title: 'TOTAL INMUEBLES',
          val: `${datos.totalApartamentos} Aptos`,
          sub: 'Base Edificio',
          textColor: [255, 255, 255],
          border: [51, 65, 85]
        },
        {
          title: 'SOLVENTES AL DÍA',
          val: `🟢 ${datos.apartamentosSolventes} (${pctSolvente}%)`,
          sub: 'Al día',
          textColor: [52, 211, 153],
          border: [16, 185, 129]
        },
        {
          title: 'PENDIENTES / MORA',
          val: `🔴 ${datos.apartamentosMorosos} Aptos`,
          sub: 'Por conciliar',
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
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.2, 1.2, 'F')
        doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2])
        doc.setLineWidth(0.3)
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.2, 1.2, 'S')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.2)
        doc.setTextColor(148, 163, 184)
        doc.text(kpi.title, x + 2.5, currentY + 3.5)

        doc.setFontSize(7.2)
        doc.setTextColor(kpi.textColor[0], kpi.textColor[1], kpi.textColor[2])
        doc.text(kpi.val, x + 2.5, currentY + 7.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5)
        doc.setTextColor(156, 163, 175)
        doc.text(kpi.sub, x + 2.5, currentY + 10.8)
      })

      currentY += cardHeight + 2.5

      // Mensaje de la Comunidad
      const msgHeight = orientacion === 'landscape' ? 6.5 : 7.5
      doc.setFillColor(254, 243, 199)
      doc.setDrawColor(245, 158, 11)
      doc.setLineWidth(0.25)
      doc.roundedRect(marginX, currentY, anchoUtil, msgHeight, 1, 1, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.8)
      doc.setTextColor(146, 64, 14)
      doc.text('📢 MENSAJE DE LA ADMINISTRACIÓN:', marginX + 2.5, currentY + 2.8)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(120, 53, 15)
      const defaultMsg = datos.mensajeComunidad ||
        'El pago puntual de las cuotas garantiza el mantenimiento de ascensores, bombas de agua, iluminación y seguridad. ¡Agradecemos su compromiso!'
      doc.text(defaultMsg, marginX + 2.5, currentY + 5.5)

      currentY += msgHeight + 2.5
    } else {
      // En páginas 2 o 3, mostramos una franja intermedia de ubicación
      doc.setFillColor(241, 245, 249)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.2)
      doc.roundedRect(marginX, currentY, anchoUtil, 5.5, 0.8, 0.8, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(30, 41, 59)
      const infoP = numPagina === 2 && totalPaginas === 2
        ? '📋 CONTINUACIÓN DE INMUEBLES Y DATOS BANCARIOS OFICIALES'
        : numPagina === 2
        ? '📋 PANEL CENTRAL: RELACIÓN INTERMEDIA DE APARTAMENTOS Y SOLVENCIA'
        : '💳 PANEL DE CIERRE: ÚLTIMO GRUPO DE INMUEBLES Y CANALES BANCARIOS AUTORIZADOS'
      doc.text(infoP, marginX + 3, currentY + 3.8)

      currentY += 7.5
    }

    // 3. TABLA DE APARTAMENTOS DEL CHUNK ACTUAL
    // Formatear filas
    const buildRowData = (item: FilaCalendarioApto) => {
      const esSolv = item.estado_solvente
      const estatusTexto = esSolv ? 'AL DÍA' : `DEUDA (${item.meses_con_deuda || 1}m)`
      const propietario = (item.propietario_nombre || 'Propietario').slice(0, 18)
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
        esSolvente: esSolv
      }
    }

    // Determinar columnas de la tabla en esta página:
    // Si es landscape 1 página -> 3 columnas paralelas
    // Si es portrait 1 página -> 2 columnas paralelas
    // Si son 2 o 3 páginas -> 2 columnas paralelas o 1 amplia con letra más grande para unión mural!
    let numSubCols = 2
    if (orientacion === 'landscape') {
      numSubCols = distribucion === 1 ? 3 : 2
    } else {
      numSubCols = 2
    }

    // Tamaño de fuente ajustado:
    // En 1 página: 6.2pt
    // En 2 páginas: 7.2pt
    // En 3 páginas: 8.4pt (¡Letra grande para leer de lejos en el ascensor!)
    const fontSizeTable = distribucion === 1 ? 6.2 : distribucion === 2 ? 7.2 : 8.2
    const cellPaddingTable = distribucion === 1 ? 0.9 : distribucion === 2 ? 1.3 : 1.7

    const subColWidth = (anchoUtil - (numSubCols - 1) * 3) / numSubCols
    const rowsPerSubCol = Math.ceil(aptosChunk.length / numSubCols)

    const startTableY = currentY

    for (let cIdx = 0; cIdx < numSubCols; cIdx++) {
      const subList = aptosChunk.slice(cIdx * rowsPerSubCol, (cIdx + 1) * rowsPerSubCol)
      if (subList.length === 0) continue

      const subBody = subList.map(a => {
        const r = buildRowData(a)
        return [r.apto, r.propietario, r.estatus, r.deudaUsd, r.deudaBs]
      })

      const leftX = marginX + cIdx * (subColWidth + 3)
      const rightMargin = pageWidth - (leftX + subColWidth)

      autoTable(doc, {
        startY: startTableY,
        margin: { left: leftX, right: rightMargin },
        tableWidth: subColWidth,
        head: [['Apto', 'Propietario', 'Condición', 'Total ($)', 'Total (Bs)']],
        body: subBody,
        theme: 'grid',
        styles: {
          fontSize: fontSizeTable,
          cellPadding: cellPaddingTable,
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
          fontSize: fontSizeTable + 0.3,
          halign: 'center',
          cellPadding: cellPaddingTable + 0.3
        },
        columnStyles: {
          0: { cellWidth: subColWidth * 0.14, fontStyle: 'bold', halign: 'center' },
          1: { cellWidth: subColWidth * 0.31, halign: 'left' },
          2: { cellWidth: subColWidth * 0.20, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: subColWidth * 0.17, halign: 'right', fontStyle: 'bold' },
          4: { cellWidth: subColWidth * 0.18, halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const item = subList[data.row.index]
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
    }

    // 4. CAJA DE CUENTAS BANCARIAS
    // Se dibuja en la ÚLTIMA página si son 2 o 3 hojas, o en la única hoja si es 1 página
    const debeDibujarBancos = (distribucion === 1) || (distribucion === 2 && numPagina === 2) || (distribucion === 3 && numPagina === 3)
    if (debeDibujarBancos) {
      const bankBoxHeight = orientacion === 'landscape' ? 24 : (distribucion === 3 ? 38 : 30)
      const bankBoxY = Math.min(
        pageHeight - bankBoxHeight - 8,
        pageHeight - bankBoxHeight - 6
      )

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.35)
      doc.roundedRect(marginX, bankBoxY, anchoUtil, bankBoxHeight, 2, 2, 'FD')

      // Encabezado de la caja
      doc.setFillColor(15, 23, 42)
      doc.roundedRect(marginX, bankBoxY, anchoUtil, 5.5, 2, 2, 'F')
      doc.rect(marginX, bankBoxY + 3.2, anchoUtil, 2.3, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 6.2 : 6.8)
      doc.setTextColor(255, 255, 255)
      doc.text('💳 CUENTAS BANCARIAS OFICIALES PARA REGULARIZAR Y CONCILIAR SU PAGO', marginX + 3.5, bankBoxY + 3.9)

      const cfgB = datos.configBanco || {}
      const colBankW = (anchoUtil - 6) / 2

      // Columna 1: Transferencia
      const b1X = marginX + 3.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 6 : 6.4)
      doc.setTextColor(...cAccentOrange)
      doc.text('🏦 Transferencia en Bolívares (Bs):', b1X, bankBoxY + 9)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.4 : 5.8)
      doc.setTextColor(51, 65, 85)
      const bancoNombre = cfgB.banco || 'Bicentenario / Banco Nacional'
      const titular = cfgB.titular || datos.nombreEdificio || 'Junta de Condominio'
      const cedula = cfgB.cedulaRif || datos.rifEdificio || 'J-XXXXXXXX-X'
      const cuentaNum = cfgB.cuentaBancaria || '0175-XXXX-XX-XXXXXXXXXX'

      doc.text(`Banco: ${bancoNombre}`, b1X, bankBoxY + 12.8)
      doc.text(`Titular: ${titular} · C.I/RIF: ${cedula}`, b1X, bankBoxY + 16.2)
      doc.setFont('helvetica', 'bold')
      doc.text(`Cuenta (20 dígitos): ${cuentaNum}`, b1X, bankBoxY + 19.8)

      // Columna 2: Pago Móvil / Divisas
      const b2X = marginX + colBankW + 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 6 : 6.4)
      doc.setTextColor(...cAccentOrange)
      doc.text('📱 Pago Móvil (Interbancario Bs):', b2X, bankBoxY + 9)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.4 : 5.8)
      doc.setTextColor(51, 65, 85)
      const pmBanco = cfgB.pagoMovilBanco || cfgB.banco || 'Bicentenario'
      const pmTelf = cfgB.pagoMovilTelefono || '0414-XXXXXXX'
      const pmCed = cfgB.pagoMovilCedula || cfgB.cedulaRif || 'J-XXXXXXXX'

      doc.text(`Banco: ${pmBanco} · Teléfono: ${pmTelf}`, b2X, bankBoxY + 12.8)
      doc.text(`Cédula / RIF: ${pmCed}`, b2X, bankBoxY + 16.2)

      if (cfgB.zelleEmail) {
        doc.setFont('helvetica', 'bold')
        doc.text(`🟣 Zelle / Divisas: ${cfgB.zelleEmail}`, b2X, bankBoxY + 19.8)
      } else {
        doc.setFont('helvetica', 'italic')
        doc.text('Aceptado en efectivo $ previo acuerdo con administración.', b2X, bankBoxY + 19.8)
      }

      // Franja inferior
      if (bankBoxHeight > 25) {
        doc.setFillColor(241, 245, 249)
        doc.rect(marginX + 0.3, bankBoxY + 22.8, anchoUtil - 0.6, bankBoxHeight - 23.1, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.5)
        doc.setTextColor(30, 41, 59)
        doc.text(
          '✓ REPORTE DE PAGO: Al realizar su transferencia o pago móvil, repórtelo en la aplicación del condominio o envíe el comprobante al WhatsApp oficial.',
          marginX + 3.5,
          bankBoxY + 27
        )
      }
    }

    // 5. PIE DE PÁGINA INSTITUCIONAL
    const footerY = pageHeight - 4.2
    doc.setFillColor(...cAccentOrange)
    doc.rect(0, pageHeight - 1.8, pageWidth, 1.8, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(orientacion === 'landscape' ? 5.4 : 5.8)
    doc.setTextColor(100, 116, 139)
    const pieInfo = totalPaginas > 1
      ? `Documento oficial emitido el ${fechaHoy} · Hoja ${numPagina} de ${totalPaginas} · Diseñado para Cartelera de Ascensor`
      : `Documento oficial emitido el ${fechaHoy} · Cartelera de Ascensor · Cuidar nuestras instalaciones es compromiso de todos.`
    doc.text(pieInfo, pageWidth / 2, footerY, { align: 'center' })
  })

  return doc
}
