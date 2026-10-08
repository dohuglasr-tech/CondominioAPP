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
 * Obtiene el nombre del propietario o una descripción formal y digna si no está cargado.
 */
function obtenerNombreFormal(nombre?: string | null, numApto = ''): string {
  if (!nombre) return `Copropietario Apto ${numApto}`
  const trimmed = nombre.trim()
  if (!trimmed || trimmed.toLowerCase() === 'propietario' || trimmed.toLowerCase() === 'sin asignar') {
    return `Copropietario Apto ${numApto}`
  }
  return trimmed
}

/**
 * Genera un PDF en formato Carta (Letter) con distribución arquitectónica, minimalista y ejecutiva,
 * diseñada para maximizar el impacto visual en la cartelera del ascensor (Diseño WOW).
 * 
 * Principios garantizados:
 * 1. Lista de apartamentos continua y homogénea, cubriendo el 100% del espacio vertical.
 * 2. CERO páginas residuales o vacíos en blanco (pageBreak estrictamente controlado).
 * 3. En modo mural (2 o 3 páginas), cada línea horizontal corresponde a 1 solo apartamento con información detallada:
 *    - Inmueble (Apto, Piso, Alícuota)
 *    - Propietario / Residente
 *    - Detalle del concepto / cuotas
 *    - Estatus con insignia pastel
 *    - Monto total en USD y Bs
 * 4. Tarjeta bancaria ejecutiva al pie para facilitar la cobranza inmediata.
 */
export function generarCarteleraAscensorPDF(datos: DatosCarteleraAscensor): jsPDF {
  const orientacion = datos.orientacion || 'portrait'
  const distribucion = (datos.distribucionPaginas && [1, 2, 3].includes(datos.distribucionPaginas))
    ? datos.distribucionPaginas
    : 1
  const isMultiPagina = distribucion > 1

  const doc = new jsPDF({
    orientation: orientacion,
    unit: 'mm',
    format: 'letter'
  })

  // Paleta de colores ejecutiva (Swiss Minimalist Editorial)
  const cDarkNavy: [number, number, number] = [15, 23, 42]        // #0f172a
  const cAccentAmber: [number, number, number] = [245, 158, 11]    // #f59e0b
  const cSlateDark: [number, number, number] = [30, 41, 59]        // #1e293b
  const cSlateText: [number, number, number] = [51, 65, 85]        // #334155
  const cMutedText: [number, number, number] = [100, 116, 139]     // #64748b

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

  const mesActualLabel = (datos.mesActualLabel || new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })).toUpperCase()

  // División proporcional exacta de apartamentos por página
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
    const marginX = 6.5
    const anchoUtil = pageWidth - marginX * 2
    const numPagina = pageIndex + 1
    const totalPaginas = distribucion
    const isLastPage = numPagina === totalPaginas

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ENCABEZADO EJECUTIVO SUPERIOR
    // ─────────────────────────────────────────────────────────────────────────
    const headerTop = 4.5
    const headerHeight = orientacion === 'landscape' ? 18.5 : 21.5

    // Fondo azul marino con bordes suaves
    doc.setFillColor(...cDarkNavy)
    doc.roundedRect(marginX, headerTop, anchoUtil, headerHeight, 2.5, 2.5, 'F')

    // Acento dorado superior
    doc.setFillColor(...cAccentAmber)
    doc.rect(marginX + 3.0, headerTop, anchoUtil - 6.0, 0.9, 'F')

    // Título edificio
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(orientacion === 'landscape' ? 11.0 : 12.5)
    const nombreEdif = (datos.nombreEdificio || 'CONDOMINIO RESIDENCIAL').toUpperCase()
    doc.text(nombreEdif, marginX + 4.5, headerTop + 7.2)

    // Subtítulo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(orientacion === 'landscape' ? 7.5 : 8.2)
    doc.setTextColor(...cAccentAmber)
    const titBase = datos.tituloPersonalizado || 'ESTADO DE SOLVENCIA Y RECAUDACIÓN MENSUAL'
    const parteBadge = totalPaginas > 1 ? ` · (PANEL ${numPagina} DE ${totalPaginas})` : ''
    doc.text(`${titBase.toUpperCase()}${parteBadge}`, marginX + 4.5, headerTop + 11.6)

    // RIF y Ubicación
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.4)
    doc.setTextColor(203, 213, 225)
    const rifStr = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
    const dirTxt = datos.direccionEdificio ? datos.direccionEdificio : 'Cartelera Oficial Informativa del Ascensor'
    doc.text(`${rifStr}${dirTxt}`.slice(0, 75), marginX + 4.5, headerTop + 15.6)

    // Píldora derecha (BCV, Emisión y Página)
    const pillPWidth = orientacion === 'landscape' ? 62 : 58
    const pillPHeight = 11.5
    const pillPX = marginX + anchoUtil - pillPWidth - 3.5
    const pillPY = headerTop + 4.6

    doc.setFillColor(30, 41, 59)
    doc.setDrawColor(51, 65, 85)
    doc.setLineWidth(0.2)
    doc.roundedRect(pillPX, pillPY, pillPWidth, pillPHeight, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    doc.setTextColor(255, 255, 255)
    doc.text(`TASA BCV: Bs. ${fmtBs(datos.tasaBcv)}/USD`, pillPX + pillPWidth / 2, pillPY + 4.0, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.8)
    doc.setTextColor(203, 213, 225)
    doc.text(`${mesActualLabel} · Hoja ${numPagina}/${totalPaginas}`, pillPX + pillPWidth / 2, pillPY + 8.4, { align: 'center' })

    let currentY = headerTop + headerHeight + 3.0

    // ─────────────────────────────────────────────────────────────────────────
    // 2. INDICADORES RESIDENCIALES (KPIs) O CINTILLO CONTINUO
    // ─────────────────────────────────────────────────────────────────────────
    if (numPagina === 1) {
      const cardHeight = orientacion === 'landscape' ? 10.0 : 11.5
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
          sub: '100% Catastro del Edificio',
          valColor: cDarkNavy
        },
        {
          title: 'SOLVENTES AL DÍA',
          val: `${datos.apartamentosSolventes} (${pctSolvente}%)`,
          sub: 'Al día en mantenimiento',
          valColor: [16, 149, 93] as [number, number, number] // emerald-600
        },
        {
          title: 'CON CUOTAS PENDIENTES',
          val: `${datos.apartamentosMorosos} Aptos`,
          sub: 'Por regularizar pago',
          valColor: [220, 38, 38] as [number, number, number] // red-600
        },
        {
          title: 'TOTAL RECAUDACIÓN',
          val: `$${fmtUsd(datos.totalDeudaUsd)}`,
          sub: `≈ Bs. ${fmtBs(datos.totalDeudaBs)}`,
          valColor: [194, 65, 12] as [number, number, number] // amber-700
        }
      ]

      kpis.forEach((kpi, idx) => {
        const x = marginX + idx * (cardWidth + gapCards)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.8, 1.8, 'F')
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.25)
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.8, 1.8, 'S')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.0)
        doc.setTextColor(...cMutedText)
        doc.text(kpi.title, x + 2.5, currentY + 3.2)

        doc.setFontSize(7.4)
        doc.setTextColor(kpi.valColor[0], kpi.valColor[1], kpi.valColor[2])
        doc.text(kpi.val, x + 2.5, currentY + 6.9)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(4.6)
        doc.setTextColor(148, 163, 184)
        doc.text(kpi.sub, x + 2.5, currentY + 9.9)
      })

      currentY += cardHeight + 2.2

      // Mensaje de la Junta / Administración
      if (datos.mensajeComunidad) {
        const msgHeight = orientacion === 'landscape' ? 5.2 : 6.0
        doc.setFillColor(254, 243, 199)
        doc.setDrawColor(245, 158, 11)
        doc.setLineWidth(0.2)
        doc.roundedRect(marginX, currentY, anchoUtil, msgHeight, 1.2, 1.2, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.4)
        doc.setTextColor(146, 64, 14)
        doc.text('📢 COMUNICADO DE LA JUNTA:', marginX + 2.5, currentY + 2.4)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.1)
        doc.setTextColor(120, 53, 15)
        doc.text(datos.mensajeComunidad.slice(0, 160), marginX + 2.5, currentY + 4.7)

        currentY += msgHeight + 2.2
      }
    } else {
      // Cintillo de Panel Continuo en páginas 2 y 3
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.2)
      doc.roundedRect(marginX, currentY, anchoUtil, 4.8, 1, 1, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.0)
      doc.setTextColor(30, 41, 59)
      const primerApto = aptosChunk[0]?.apartamento_numero || ''
      const ultimoApto = aptosChunk[aptosChunk.length - 1]?.apartamento_numero || ''
      const panelInfo = `📋 RELACIÓN CONTINUA DE INMUEBLES · DEL APARTAMENTO ${primerApto} AL ${ultimoApto} · (PANEL ${numPagina} DE ${totalPaginas})`
      doc.text(panelInfo, marginX + 3, currentY + 3.2)

      currentY += 6.0
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DETERMINACIÓN DE COLUMNAS Y CALCULO DE ALTURA EXACTA (SIN VACÍOS)
    // ─────────────────────────────────────────────────────────────────────────
    // En modo multi-página (2 o 3 hojas), CADA LÍNEA ES UN APARTAMENTO A ANCHO COMPLETO.
    // En modo 1 página, si hay <= 20 aptos, también es 1 línea completa; si son > 20 aptos, 2 columnas paralelas.
    let numSubCols = 1
    if (!isMultiPagina) {
      numSubCols = aptosChunk.length > 20 ? (orientacion === 'landscape' ? 3 : 2) : 1
    } else {
      numSubCols = 1
    }

    const bankBoxHeight = orientacion === 'landscape' ? 22.0 : 30.0
    const footerMargin = 7.0

    // Límite inferior donde debe terminar la tabla
    const bottomLimit = isLastPage ? (pageHeight - bankBoxHeight - 9.0) : (pageHeight - footerMargin - 2.0)
    const startTableY = currentY
    const availTableHeight = Math.max(40, bottomLimit - startTableY)

    const gapSubCols = 4.0
    const subColWidth = (anchoUtil - (numSubCols - 1) * gapSubCols) / numSubCols
    const rowsPerSubCol = Math.ceil(aptosChunk.length / numSubCols)

    // Altura del encabezado
    const headHeight = numSubCols === 1 ? (isMultiPagina ? 8.0 : 7.2) : 6.5
    const availBodyHeight = availTableHeight - headHeight

    // Cálculo riguroso de la altura de cada fila para rellenar el 100% del espacio vertical
    // Se usa Math.floor con 1 decimal y margen de seguridad para evitar NUNCA desbordamientos
    const calcRowH = rowsPerSubCol > 0 ? ((availBodyHeight - 2.0) / rowsPerSubCol) : 8.0
    const bodyRowHeight = Math.max(5.4, Math.min(22.0, Math.floor(calcRowH * 10) / 10))

    // Tipografía proporcional
    let fontSizeTable = 6.4
    if (numSubCols === 1) {
      if (bodyRowHeight >= 15) {
        fontSizeTable = 9.8
      } else if (bodyRowHeight >= 12) {
        fontSizeTable = 9.0
      } else if (bodyRowHeight >= 9.5) {
        fontSizeTable = 8.2
      } else if (bodyRowHeight >= 7.5) {
        fontSizeTable = 7.4
      } else {
        fontSizeTable = 6.5
      }
    } else {
      fontSizeTable = bodyRowHeight >= 7.0 ? 6.5 : 5.8
    }

    const cellPaddingTable = Math.max(0.6, Math.min(2.5, (bodyRowHeight - (fontSizeTable * 0.35)) / 2))

    // Anchos proporcionales de columnas detalladas
    let colW_Apto: number
    let colW_Nombre: number
    let colW_Detalle: number
    let colW_Estado: number
    let colW_Usd: number
    let colW_Bs: number

    if (numSubCols === 1) {
      // 1 Línea continua detallada por apartamento (Diseño WOW)
      colW_Apto = subColWidth * 0.11     // ~22.3 mm (Insignia Apto)
      colW_Nombre = subColWidth * 0.29   // ~58.8 mm (Propietario + Piso/Alícuota)
      colW_Detalle = subColWidth * 0.26  // ~52.8 mm (Concepto / Cuotas / Saldo a favor)
      colW_Estado = subColWidth * 0.14   // ~28.4 mm (Píldora Pastel Estado)
      colW_Usd = subColWidth * 0.10      // ~20.3 mm (Total USD)
      colW_Bs = subColWidth * 0.10       // ~20.3 mm (Total Bs)
    } else {
      // 2 o 3 columnas compactas en 1 sola hoja
      colW_Apto = subColWidth * 0.14
      colW_Nombre = subColWidth * 0.30
      colW_Detalle = 0 // omitido en multivariable compacta para legibilidad
      colW_Estado = subColWidth * 0.20
      colW_Usd = subColWidth * 0.18
      colW_Bs = subColWidth * 0.18
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. TABLA MAESTRA CONTINUA
    // ─────────────────────────────────────────────────────────────────────────
    for (let cIdx = 0; cIdx < numSubCols; cIdx++) {
      const subList = aptosChunk.slice(cIdx * rowsPerSubCol, (cIdx + 1) * rowsPerSubCol)
      if (subList.length === 0) continue

      const tableHeaders = numSubCols === 1
        ? ['APTO', 'PROPIETARIO / INMUEBLE', 'DETALLE DE COBRANZA', 'ESTADO', 'TOTAL ($)', 'TOTAL (Bs)']
        : ['APTO', 'PROPIETARIO', 'ESTADO', 'TOTAL ($)', 'TOTAL (Bs)']

      const subBody = subList.map(item => {
        const totalUsdTxt = item.estado_solvente
          ? (item.saldo_a_favor_usd > 0 ? `+${fmtUsd(item.saldo_a_favor_usd)}` : '$0.00')
          : `$${fmtUsd(item.total_usd)}`

        const totalBsTxt = item.estado_solvente
          ? (item.saldo_a_favor_bs > 0 ? `+${fmtBs(item.saldo_a_favor_bs)}` : 'Bs. 0')
          : `Bs. ${fmtBs(item.total_bs)}`

        if (numSubCols === 1) {
          return [
            '', // Col 0: Badge Apto en didDrawCell
            '', // Col 1: Propietario multilínea en didDrawCell
            '', // Col 2: Detalle cobranza en didDrawCell
            '', // Col 3: Píldora estado en didDrawCell
            totalUsdTxt, // Col 4: USD
            totalBsTxt   // Col 5: Bs
          ]
        } else {
          const nom = obtenerNombreFormal(item.propietario_nombre, item.apartamento_numero)
          return [
            '', // Col 0: Badge Apto
            nom,
            '', // Col 2: Píldora estado
            totalUsdTxt,
            totalBsTxt
          ]
        }
      })

      const leftX = marginX + cIdx * (subColWidth + gapSubCols)
      const rightMargin = pageWidth - (leftX + subColWidth)

      const colStylesMap: Record<number, any> = numSubCols === 1
        ? {
            0: { cellWidth: colW_Apto, halign: 'center' },
            1: { cellWidth: colW_Nombre, halign: 'left' },
            2: { cellWidth: colW_Detalle, halign: 'left' },
            3: { cellWidth: colW_Estado, halign: 'center' },
            4: { cellWidth: colW_Usd, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: colW_Bs, halign: 'right' }
          }
        : {
            0: { cellWidth: colW_Apto, halign: 'center' },
            1: { cellWidth: colW_Nombre, halign: 'left' },
            2: { cellWidth: colW_Estado, halign: 'center' },
            3: { cellWidth: colW_Usd, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: colW_Bs, halign: 'right' }
          }

      autoTable(doc, {
        startY: startTableY,
        margin: {
          left: leftX,
          right: rightMargin,
          bottom: 5.0 // margen seguro para que autoTable NUNCA genere un salto de página no deseado
        },
        tableWidth: subColWidth,
        head: [tableHeaders],
        body: subBody,
        theme: 'plain',
        styles: {
          fontSize: fontSizeTable,
          cellPadding: cellPaddingTable,
          textColor: cSlateText,
          overflow: 'ellipsize',
          font: 'helvetica',
          valign: 'middle'
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: Math.min(fontSizeTable, 8.8),
          minCellHeight: headHeight,
          cellPadding: cellPaddingTable + 0.3,
          halign: 'left',
          valign: 'middle'
        },
        bodyStyles: {
          minCellHeight: bodyRowHeight
        },
        columnStyles: colStylesMap,
        didParseCell: (data) => {
          if (data.section === 'head') {
            if (data.column.index === 0 || (numSubCols === 1 ? data.column.index === 3 : data.column.index === 2)) {
              data.cell.styles.halign = 'center'
            } else if (numSubCols === 1 ? (data.column.index === 4 || data.column.index === 5) : (data.column.index === 3 || data.column.index === 4)) {
              data.cell.styles.halign = 'right'
            }
          }
          if (data.section === 'body') {
            // Fondo cebra ultra-sutil
            data.cell.styles.fillColor = data.row.index % 2 === 1 ? [248, 250, 252] : [255, 255, 255]

            const item = subList[data.row.index]
            if (item) {
              const colUsdIdx = numSubCols === 1 ? 4 : 3
              const colBsIdx = numSubCols === 1 ? 5 : 4

              if (data.column.index === colUsdIdx) {
                if (!item.estado_solvente) {
                  data.cell.styles.textColor = [15, 23, 42] // bold navy
                } else if (item.saldo_a_favor_usd > 0) {
                  data.cell.styles.textColor = [5, 150, 105] // emerald
                } else {
                  data.cell.styles.textColor = [148, 163, 184]
                }
              } else if (data.column.index === colBsIdx) {
                if (!item.estado_solvente) {
                  data.cell.styles.textColor = [51, 65, 85]
                } else if (item.saldo_a_favor_bs > 0) {
                  data.cell.styles.textColor = [5, 150, 105]
                } else {
                  data.cell.styles.textColor = [148, 163, 184]
                }
              }
            }
          }
        },
        didDrawCell: (data) => {
          // 1. Línea horizontal sutil en cada fila
          if (data.section === 'body') {
            doc.setDrawColor(226, 232, 240)
            doc.setLineWidth(0.12)
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            )
          }

          // Línea debajo del encabezado
          if (data.section === 'head') {
            doc.setDrawColor(203, 213, 225)
            doc.setLineWidth(0.2)
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            )
          }

          const item = subList[data.row.index]
          if (!item) return

          // 2. Insignia Apartamento (Columna 0)
          if (data.section === 'body' && data.column.index === 0) {
            const badgeH = Math.min(data.cell.height - 2.2, 8.2)
            const badgeW = Math.min(data.cell.width - 4.0, numSubCols === 1 ? 20.0 : 13.5)
            const badgeX = data.cell.x + (data.cell.width - badgeW) / 2
            const badgeY = data.cell.y + (data.cell.height - badgeH) / 2

            doc.setFillColor(...cDarkNavy)
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.4, 1.4, 'F')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(Math.min(fontSizeTable + 0.5, 11.0))
            doc.setTextColor(255, 255, 255)
            doc.text(
              item.apartamento_numero.trim(),
              badgeX + badgeW / 2,
              badgeY + badgeH / 2,
              { align: 'center', baseline: 'middle' }
            )
          }

          // 3. Propietario / Inmueble multilínea (Columna 1 en numSubCols === 1)
          if (data.section === 'body' && data.column.index === 1 && numSubCols === 1) {
            const nomTitular = obtenerNombreFormal(item.propietario_nombre, item.apartamento_numero)
            const pisoTxt = item.piso ? `Piso ${item.piso}` : `Nivel ${item.apartamento_numero[0] || '1'}`
            const alicTxt = item.alicuota ? `Alícuota: ${(item.alicuota * 100).toFixed(2)}%` : 'Alíc. General'
            const subMeta = `${pisoTxt} · ${alicTxt}`

            const midY = data.cell.y + data.cell.height / 2

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(fontSizeTable)
            doc.setTextColor(...cSlateDark)
            doc.text(nomTitular.slice(0, 36), data.cell.x + 2.0, midY - 1.8, { baseline: 'middle' })

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(Math.max(fontSizeTable - 1.8, 5.2))
            doc.setTextColor(...cMutedText)
            doc.text(subMeta, data.cell.x + 2.0, midY + 2.4, { baseline: 'middle' })
          }

          // 4. Detalle de Cobranza (Columna 2 en numSubCols === 1)
          if (data.section === 'body' && data.column.index === 2 && numSubCols === 1) {
            const midY = data.cell.y + data.cell.height / 2
            if (item.estado_solvente) {
              if (item.saldo_a_favor_usd > 0) {
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(fontSizeTable - 0.4)
                doc.setTextColor(5, 150, 105)
                doc.text('Saldo a favor acreditado', data.cell.x + 2.0, midY - 1.8, { baseline: 'middle' })

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(Math.max(fontSizeTable - 2.0, 5.0))
                doc.setTextColor(16, 185, 129)
                doc.text(`+$${fmtUsd(item.saldo_a_favor_usd)} / +Bs. ${fmtBs(item.saldo_a_favor_bs)}`, data.cell.x + 2.0, midY + 2.4, { baseline: 'middle' })
              } else {
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(fontSizeTable - 0.5)
                doc.setTextColor(71, 85, 105)
                doc.text('Cuotas de condominio solventes', data.cell.x + 2.0, midY - 1.8, { baseline: 'middle' })

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(Math.max(fontSizeTable - 2.0, 5.0))
                doc.setTextColor(148, 163, 184)
                doc.text('Sin deudas ordinarias pendientes', data.cell.x + 2.0, midY + 2.4, { baseline: 'middle' })
              }
            } else {
              const meses = item.meses_con_deuda || 1
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(fontSizeTable - 0.4)
              doc.setTextColor(185, 28, 28)
              doc.text(`Deuda: ${meses} cuota${meses > 1 ? 's' : ''} pendiente${meses > 1 ? 's' : ''}`, data.cell.x + 2.0, midY - 1.8, { baseline: 'middle' })

              doc.setFont('helvetica', 'normal')
              doc.setFontSize(Math.max(fontSizeTable - 2.0, 5.0))
              doc.setTextColor(148, 163, 184)
              doc.text('Mantenimiento y servicios comunes', data.cell.x + 2.0, midY + 2.4, { baseline: 'middle' })
            }
          }

          // 5. Píldora de Estado (Columna 3 en 1 col, o Columna 2 en 2 cols)
          const estadoColIdx = numSubCols === 1 ? 3 : 2
          if (data.section === 'body' && data.column.index === estadoColIdx) {
            const pillH = Math.min(data.cell.height - 2.4, 7.6)
            const pillW = Math.min(data.cell.width - 3.5, numSubCols === 1 ? 26.0 : 19.5)
            const pillX = data.cell.x + (data.cell.width - pillW) / 2
            const pillY = data.cell.y + (data.cell.height - pillH) / 2

            if (item.estado_solvente) {
              doc.setFillColor(220, 252, 231) // #dcfce7
              doc.setDrawColor(187, 247, 208) // #bbf7d0
              doc.setLineWidth(0.2)
              doc.roundedRect(pillX, pillY, pillW, pillH, 1.3, 1.3, 'FD')

              doc.setFont('helvetica', 'bold')
              doc.setFontSize(Math.max(fontSizeTable - 0.8, 6.8))
              doc.setTextColor(21, 128, 61)   // #15803d
              doc.text('AL DÍA', pillX + pillW / 2, pillY + pillH / 2, { align: 'center', baseline: 'middle' })
            } else {
              doc.setFillColor(254, 226, 226) // #fee2e2
              doc.setDrawColor(254, 202, 202) // #fecaca
              doc.setLineWidth(0.2)
              doc.roundedRect(pillX, pillY, pillW, pillH, 1.3, 1.3, 'FD')

              doc.setFont('helvetica', 'bold')
              doc.setFontSize(Math.max(fontSizeTable - 0.9, 6.6))
              doc.setTextColor(185, 28, 28)   // #b91c1c
              const lbl = (item.meses_con_deuda && item.meses_con_deuda > 1) ? `DEUDA (${item.meses_con_deuda}m)` : 'PENDIENTE'
              doc.text(lbl, pillX + pillW / 2, pillY + pillH / 2, { align: 'center', baseline: 'middle' })
            }
          }
        }
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CAJA DE BANCOS (ÚLTIMA HOJA) O TARJETA INFORMATIVA RESIDENCIAL (PÁG 1 Y 2)
    // ─────────────────────────────────────────────────────────────────────────
    const finalTableY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : currentY
    const espaciolibre = (pageHeight - footerMargin - 2.0) - finalTableY

    if (isLastPage) {
      // Caja bancaria ejecutiva al pie de la última página
      const bankY = Math.max(finalTableY + 2.5, pageHeight - bankBoxHeight - 6.5)

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.roundedRect(marginX, bankY, anchoUtil, bankBoxHeight, 2, 2, 'FD')

      // Encabezado de la caja
      const headBankH = 4.8
      doc.setFillColor(...cDarkNavy)
      doc.roundedRect(marginX, bankY, anchoUtil, headBankH, 2, 2, 'F')
      doc.rect(marginX, bankY + headBankH - 1.5, anchoUtil, 1.5, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 6.2 : 6.8)
      doc.setTextColor(255, 255, 255)
      doc.text('CANALES BANCARIOS OFICIALES PARA PAGO Y REGULARIZACIÓN', marginX + 3.5, bankY + 3.4)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.6)
      doc.setTextColor(203, 213, 225)
      doc.text('Transferencia Bancaria & Pago Móvil', marginX + anchoUtil - 3.5, bankY + 3.4, { align: 'right' })

      const cfgB = datos.configBanco || {}
      const colBankW = (anchoUtil - 7) / 2

      // Columna 1: Transferencia Bancaria
      const b1X = marginX + 3.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 5.8 : 6.4)
      doc.setTextColor(...cAccentAmber)
      doc.text('🏦 TRANSFERENCIA BANCARIA (Bs):', b1X, bankY + 8.2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.2 : 5.8)
      doc.setTextColor(51, 65, 85)
      const bancoNombre = cfgB.banco || 'Bicentenario / Banco Nacional'
      const titular = cfgB.titular || datos.nombreEdificio || 'Junta de Condominio'
      const cedula = cfgB.cedulaRif || datos.rifEdificio || 'J-XXXXXXXX-X'
      const cuentaNum = cfgB.cuentaBancaria || '0175-XXXX-XX-XXXXXXXXXX'

      doc.text(`Banco: ${bancoNombre}`, b1X, bankY + 12.0)
      doc.text(`Titular: ${titular} · RIF/C.I.: ${cedula}`, b1X, bankY + 15.6)
      doc.setFont('helvetica', 'bold')
      doc.text(`Cuenta (20 dígitos): ${cuentaNum}`, b1X, bankY + 19.4)

      // Columna 2: Pago Móvil / Divisas
      const b2X = marginX + colBankW + 4.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 5.8 : 6.4)
      doc.setTextColor(...cAccentAmber)
      doc.text('📱 PAGO MÓVIL INTERBANCARIO (Bs):', b2X, bankY + 8.2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.2 : 5.8)
      doc.setTextColor(51, 65, 85)
      const pmBanco = cfgB.pagoMovilBanco || cfgB.banco || 'Bicentenario'
      const pmTelf = cfgB.pagoMovilTelefono || '0414-XXXXXXX'
      const pmCed = cfgB.pagoMovilCedula || cfgB.cedulaRif || 'J-XXXXXXXX'

      doc.text(`Banco: ${pmBanco} · Teléfono: ${pmTelf}`, b2X, bankY + 12.0)
      doc.text(`Cédula / RIF: ${pmCed}`, b2X, bankY + 15.6)

      if (cfgB.zelleEmail) {
        doc.setFont('helvetica', 'bold')
        doc.text(`🟣 Zelle / Divisas: ${cfgB.zelleEmail}`, b2X, bankY + 19.4)
      } else {
        doc.setFont('helvetica', 'italic')
        doc.text('Divisas en efectivo: previo acuerdo con administración.', b2X, bankY + 19.4)
      }

      // Franja inferior informativa de reporte
      if (bankBoxHeight > 23) {
        const barH = 5.2
        doc.setFillColor(248, 250, 252)
        doc.rect(marginX + 0.3, bankY + bankBoxHeight - barH - 0.3, anchoUtil - 0.6, barH, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.2)
        doc.setTextColor(71, 85, 105)
        doc.text(
          '✓ REPORTE DE PAGO: Al realizar su pago, repórtelo en la App del Condominio con el número de referencia para su inmediata conciliación.',
          marginX + 3.5,
          bankY + bankBoxHeight - 1.8
        )
      }
    } else if (espaciolibre > 14.0) {
      // En páginas intermedias, si queda espacio residual, rellenamos con una tarjeta elegante de convivencia comunitaria
      const cardNormasY = finalTableY + 2.5
      const cardNormasH = espaciolibre - 2.0

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.25)
      doc.roundedRect(marginX, cardNormasY, anchoUtil, cardNormasH, 1.8, 1.8, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.4)
      doc.setTextColor(...cDarkNavy)
      doc.text('🏢 NORMAS RESIDENCIALES Y CONSERVACIÓN DE ÁREAS COMUNES', marginX + 3.5, cardNormasY + 4.2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(...cSlateText)
      doc.text(
        '• Cuidado de Ascensores: Respete la capacidad de carga y evite retener las puertas para prolongar la vida útil del sistema motriz.\n• Su aporte puntual: Garantiza el suministro continuo de agua hidroneumática, iluminación LED de áreas comunes y seguridad integral.',
        marginX + 3.5,
        cardNormasY + 8.0,
        { maxWidth: anchoUtil - 7.0 }
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. PIE DE PÁGINA
    // ─────────────────────────────────────────────────────────────────────────
    const footerY = pageHeight - 3.8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(orientacion === 'landscape' ? 5.0 : 5.4)
    doc.setTextColor(148, 163, 184)
    const pieInfo = totalPaginas > 1
      ? `Cartelera Informativa de Ascensor · ${fechaHoy} · Hoja ${numPagina} de ${totalPaginas} · Documento Oficial Emitido por Administración`
      : `Cartelera Informativa de Ascensor · ${fechaHoy} · Documento Oficial Emitido por Administración · Su compromiso mantiene nuestro condominio.`
    doc.text(pieInfo, pageWidth / 2, footerY, { align: 'center' })
  })

  return doc
}
