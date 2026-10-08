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
 * Limpia y formatea el nombre del residente.
 * Si no tiene nombre real o solo dice "Propietario", devuelve un guión limpio para no saturar.
 */
function formatearNombreResidente(nombre?: string | null): string {
  if (!nombre) return '—'
  const trimmed = nombre.trim()
  if (!trimmed || trimmed.toLowerCase() === 'propietario' || trimmed.toLowerCase() === 'sin asignar') {
    return '—'
  }
  return trimmed
}

/**
 * Genera un PDF en formato Carta (Letter) con distribución moderna y ejecutiva (Swiss Layout),
 * optimizado para ser impreso y colocado en la cartelera del ascensor.
 * 
 * Características visuales:
 * - Insignias redondeadas azul marino oscuro para identificar el apartamento.
 * - Píldoras tipo badge en tonos pastel suaves (verde menta para AL DÍA, coral pastel para PENDIENTE).
 * - Cero cuadrículas toscas tipo Excel; se emplean sutiles micro-hairlines horizontales.
 * - Eliminación del texto repetitivo "Propietario".
 * - Distribución en 1, 2 o 3 hojas para murales en ascensor de alta visibilidad.
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

  // Paleta de colores ejecutiva (Swiss Modern)
  const cDarkNavy: [number, number, number] = [15, 23, 42]        // #0f172a
  const cAccentOrange: [number, number, number] = [249, 115, 22]    // #f97316
  const cSlateText: [number, number, number] = [51, 65, 85]        // #334155
  const cMutedText: [number, number, number] = [148, 163, 184]     // #94a3b8

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
    const marginX = 6.5
    const anchoUtil = pageWidth - marginX * 2
    const numPagina = pageIndex + 1
    const totalPaginas = distribucion

    // ─────────────────────────────────────────────────────────────────────────
    // 1. ENCABEZADO EJECUTIVO (Header Bar con esquinas suaves y píldora BCV)
    // ─────────────────────────────────────────────────────────────────────────
    const headerTop = 4.5
    const headerHeight = orientacion === 'landscape' ? 20 : 23

    // Fondo azul marino con bordes redondeados
    doc.setFillColor(...cDarkNavy)
    doc.roundedRect(marginX, headerTop, anchoUtil, headerHeight, 2.5, 2.5, 'F')

    // Acento naranja superior sutil
    doc.setFillColor(...cAccentOrange)
    doc.rect(marginX + 3, headerTop, anchoUtil - 6, 1.0, 'F')

    // Título edificio
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(orientacion === 'landscape' ? 11 : 12.5)
    const nombreEdif = (datos.nombreEdificio || 'CONDOMINIO RESIDENCIAL').toUpperCase()
    doc.text(nombreEdif, marginX + 4.5, headerTop + 7.5)

    // Subtítulo / Propósito del boletín
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(orientacion === 'landscape' ? 7.8 : 8.5)
    doc.setTextColor(...cAccentOrange)
    const titBase = datos.tituloPersonalizado || 'ESTADO DE CUENTAS · CARTELERA DE ASCENSOR'
    const parteBadge = totalPaginas > 1 ? ` · (PANEL ${numPagina} DE ${totalPaginas})` : ''
    doc.text(`${titBase.toUpperCase()}${parteBadge}`, marginX + 4.5, headerTop + 12.2)

    // RIF y Ubicación
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(203, 213, 225)
    const rifStr = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
    const dirTxt = datos.direccionEdificio ? datos.direccionEdificio : 'Publicación Comunitaria para el Ascensor'
    doc.text(`${rifStr}${dirTxt}`.slice(0, 75), marginX + 4.5, headerTop + 16.5)

    // Píldora derecha (Fecha y Tasa BCV Oficial)
    const pillPWidth = orientacion === 'landscape' ? 62 : 58
    const pillPHeight = 12
    const pillPX = marginX + anchoUtil - pillPWidth - 3.5
    const pillPY = headerTop + 5

    doc.setFillColor(30, 41, 59) // slate-800
    doc.setDrawColor(51, 65, 85) // slate-700
    doc.setLineWidth(0.2)
    doc.roundedRect(pillPX, pillPY, pillPWidth, pillPHeight, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    doc.setTextColor(255, 255, 255)
    doc.text(`TASA BCV: Bs. ${fmtBs(datos.tasaBcv)}/USD`, pillPX + pillPWidth / 2, pillPY + 4.2, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(148, 163, 184)
    doc.text(`Emisión: ${fechaHoy} · ${mesActualLabel}`, pillPX + pillPWidth / 2, pillPY + 8.8, { align: 'center' })

    let currentY = headerTop + headerHeight + 3.5

    // ─────────────────────────────────────────────────────────────────────────
    // 2. INDICADORES RESIDENCIALES (KPI Cards)
    // ─────────────────────────────────────────────────────────────────────────
    const mostrarKpisCompletos = (numPagina === 1)
    if (mostrarKpisCompletos) {
      const cardHeight = orientacion === 'landscape' ? 10.5 : 12
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
          sub: 'Base del Edificio',
          valColor: cDarkNavy
        },
        {
          title: 'SOLVENTES AL DÍA',
          val: `${datos.apartamentosSolventes} (${pctSolvente}%)`,
          sub: 'Cumplimiento solvente',
          valColor: [21, 128, 61] as [number, number, number] // emerald-700
        },
        {
          title: 'CON PENDIENTES',
          val: `${datos.apartamentosMorosos} Aptos`,
          sub: 'Por conciliar cuotas',
          valColor: [185, 28, 28] as [number, number, number] // red-700
        },
        {
          title: 'DEUDA TOTAL COMUNIDAD',
          val: `$${fmtUsd(datos.totalDeudaUsd)}`,
          sub: `≈ Bs. ${fmtBs(datos.totalDeudaBs)}`,
          valColor: [194, 65, 12] as [number, number, number] // amber-700
        }
      ]

      kpis.forEach((kpi, idx) => {
        const x = marginX + idx * (cardWidth + gapCards)
        // Fondo tarjeta blanco con borde suave
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.8, 1.8, 'F')
        doc.setDrawColor(226, 232, 240) // slate-200
        doc.setLineWidth(0.25)
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 1.8, 1.8, 'S')

        // Etiqueta superior
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.2)
        doc.setTextColor(...cMutedText)
        doc.text(kpi.title, x + 2.5, currentY + 3.4)

        // Valor principal
        doc.setFontSize(7.6)
        doc.setTextColor(kpi.valColor[0], kpi.valColor[1], kpi.valColor[2])
        doc.text(kpi.val, x + 2.5, currentY + 7.2)

        // Subtexto
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(4.8)
        doc.setTextColor(148, 163, 184)
        doc.text(kpi.sub, x + 2.5, currentY + 10.4)
      })

      currentY += cardHeight + 2.5

      // Mensaje de la Comunidad (Banner elegante pastel)
      if (datos.mensajeComunidad) {
        const msgHeight = orientacion === 'landscape' ? 5.8 : 6.8
        doc.setFillColor(254, 243, 199) // amber-50
        doc.setDrawColor(245, 158, 11)  // amber-400
        doc.setLineWidth(0.2)
        doc.roundedRect(marginX, currentY, anchoUtil, msgHeight, 1.2, 1.2, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.6)
        doc.setTextColor(146, 64, 14)
        doc.text('📢 MENSAJE DE LA ADMINISTRACIÓN:', marginX + 2.5, currentY + 2.6)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.3)
        doc.setTextColor(120, 53, 15)
        doc.text(datos.mensajeComunidad.slice(0, 160), marginX + 2.5, currentY + 5.2)

        currentY += msgHeight + 2.5
      }
    } else {
      // En páginas 2 o 3, mostramos una franja sutil de ubicación de panel mural
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.2)
      doc.roundedRect(marginX, currentY, anchoUtil, 5.2, 1, 1, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.2)
      doc.setTextColor(30, 41, 59)
      const panelInfo = numPagina === 2 && totalPaginas === 2
        ? '📋 PANEL II: CONTINUACIÓN DE INMUEBLES Y DATOS BANCARIOS DE RECAUDACIÓN'
        : numPagina === 2
        ? '📋 PANEL CENTRAL: RELACIÓN INTERMEDIA DE APARTAMENTOS'
        : '💳 PANEL DE CIERRE: ÚLTIMA RELACIÓN DE INMUEBLES Y CANALES DE PAGO OFICIALES'
      doc.text(panelInfo, marginX + 3, currentY + 3.5)

      currentY += 7.0
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CALCULO DE ESPACIO PARA TABLA Y CAJA DE PAGO INFERIOR
    // ─────────────────────────────────────────────────────────────────────────
    const debeDibujarBancos = (distribucion === 1) || (distribucion === 2 && numPagina === 2) || (distribucion === 3 && numPagina === 3)
    const bankBoxHeight = orientacion === 'landscape' ? 22 : (distribucion === 3 ? 34 : 26)
    const bankBoxY = pageHeight - bankBoxHeight - 6.5

    // Determinar número de sub-columnas paralelas en la hoja
    let numSubCols = 2
    if (orientacion === 'landscape') {
      numSubCols = distribucion === 1 ? 3 : 2
    } else {
      numSubCols = 2
    }

    const gapSubCols = 4
    const subColWidth = (anchoUtil - (numSubCols - 1) * gapSubCols) / numSubCols
    const rowsPerSubCol = Math.ceil(aptosChunk.length / numSubCols)

    // Ajuste dinámico de fuente y padding según densidad de apartamentos y número de páginas
    let fontSizeTable = 6.4
    let cellPaddingTable = 1.0

    if (distribucion === 1) {
      if (rowsPerSubCol > 26) {
        fontSizeTable = 5.8
        cellPaddingTable = 0.7
      } else if (rowsPerSubCol > 20) {
        fontSizeTable = 6.2
        cellPaddingTable = 0.9
      } else {
        fontSizeTable = 6.8
        cellPaddingTable = 1.2
      }
    } else if (distribucion === 2) {
      fontSizeTable = 7.4
      cellPaddingTable = 1.4
    } else {
      // 3 Páginas mural: tipografía grande para leer de lejos en el ascensor
      fontSizeTable = 8.4
      cellPaddingTable = 1.8
    }

    const startTableY = currentY

    // Anchos proporcionales dentro de cada sub-columna (Apto, Residente, Estado, Total $, Total Bs)
    const colW_Apto = subColWidth * 0.15      // ~14.7 mm
    const colW_Nombre = subColWidth * 0.31    // ~30.5 mm
    const colW_Estado = subColWidth * 0.20    // ~19.6 mm
    const colW_Usd = subColWidth * 0.16       // ~15.7 mm
    const colW_Bs = subColWidth * 0.18        // ~17.6 mm

    // ─────────────────────────────────────────────────────────────────────────
    // 4. RENDERIZADO DE TABLAS PARALELAS CON DISEÑO SUIZO ELEGANTE
    // ─────────────────────────────────────────────────────────────────────────
    for (let cIdx = 0; cIdx < numSubCols; cIdx++) {
      const subList = aptosChunk.slice(cIdx * rowsPerSubCol, (cIdx + 1) * rowsPerSubCol)
      if (subList.length === 0) continue

      // Formatear filas:
      // Dejamos Apto y Estado vacíos en texto para dibujarlos con insignias personalizadas en didDrawCell
      const subBody = subList.map(item => {
        const nombreLimpio = formatearNombreResidente(item.propietario_nombre)

        const totalUsdTxt = item.estado_solvente
          ? (item.saldo_a_favor_usd > 0 ? `+${fmtUsd(item.saldo_a_favor_usd)}` : '$0.00')
          : `$${fmtUsd(item.total_usd)}`

        const totalBsTxt = item.estado_solvente
          ? (item.saldo_a_favor_bs > 0 ? `+${fmtBs(item.saldo_a_favor_bs)}` : 'Bs. 0')
          : `Bs. ${fmtBs(item.total_bs)}`

        return [
          '',               // Celda 0: Apartamento Badge (dibujado en didDrawCell)
          nombreLimpio,     // Celda 1: Nombre Residente
          '',               // Celda 2: Píldora Estado (dibujado en didDrawCell)
          totalUsdTxt,      // Celda 3: Total en USD
          totalBsTxt        // Celda 4: Total en Bs
        ]
      })

      const leftX = marginX + cIdx * (subColWidth + gapSubCols)
      const rightMargin = pageWidth - (leftX + subColWidth)

      autoTable(doc, {
        startY: startTableY,
        margin: { left: leftX, right: rightMargin },
        tableWidth: subColWidth,
        head: [['APTO', 'RESIDENTE', 'ESTADO', 'TOTAL ($)', 'TOTAL (Bs)']],
        body: subBody,
        theme: 'plain', // Cero cuadrículas toscas tipo Excel!
        styles: {
          fontSize: fontSizeTable,
          cellPadding: cellPaddingTable,
          textColor: cSlateText,
          overflow: 'ellipsize',
          font: 'helvetica',
          valign: 'middle'
        },
        headStyles: {
          fillColor: [241, 245, 249], // slate-100 elegante
          textColor: [71, 85, 105],    // slate-600
          fontStyle: 'bold',
          fontSize: fontSizeTable,
          cellPadding: cellPaddingTable + 0.3,
          halign: 'left',
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: colW_Apto, halign: 'center' },
          1: { cellWidth: colW_Nombre, halign: 'left' },
          2: { cellWidth: colW_Estado, halign: 'center' },
          3: { cellWidth: colW_Usd, halign: 'right', fontStyle: 'bold' },
          4: { cellWidth: colW_Bs, halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.section === 'head') {
            if (data.column.index === 0 || data.column.index === 2) {
              data.cell.styles.halign = 'center'
            } else if (data.column.index === 3 || data.column.index === 4) {
              data.cell.styles.halign = 'right'
            }
          }
          if (data.section === 'body') {
            const item = subList[data.row.index]
            if (item) {
              if (data.column.index === 3) {
                if (!item.estado_solvente) {
                  data.cell.styles.textColor = [15, 23, 42] // bold dark navy/slate
                } else if (item.saldo_a_favor_usd > 0) {
                  data.cell.styles.textColor = [5, 150, 105] // emerald
                } else {
                  data.cell.styles.textColor = [148, 163, 184] // slate-400
                }
              } else if (data.column.index === 4) {
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
          // 1. Línea horizontal sutil (Hairline) debajo de cada celda del cuerpo
          if (data.section === 'body') {
            doc.setDrawColor(241, 245, 249) // #f1f5f9
            doc.setLineWidth(0.12)
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            )
          }

          // Línea separadora tenue debajo del encabezado
          if (data.section === 'head') {
            doc.setDrawColor(203, 213, 225) // slate-300
            doc.setLineWidth(0.2)
            doc.line(
              data.cell.x,
              data.cell.y + data.cell.height,
              data.cell.x + data.cell.width,
              data.cell.y + data.cell.height
            )
          }

          // 2. Insignia personalizada para el Apartamento (Columna 0)
          if (data.section === 'body' && data.column.index === 0) {
            const item = subList[data.row.index]
            if (item) {
              const badgeH = Math.min(data.cell.height - 1.0, 4.8)
              const badgeW = Math.min(data.cell.width - 2.0, 13.5)
              const badgeX = data.cell.x + (data.cell.width - badgeW) / 2
              const badgeY = data.cell.y + (data.cell.height - badgeH) / 2

              // Rectángulo redondeado azul marino oscuro
              doc.setFillColor(15, 23, 42) // #0f172a
              doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.3, 1.3, 'F')

              // Texto del apartamento en blanco negrita
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(fontSizeTable - 0.2)
              doc.setTextColor(255, 255, 255)
              doc.text(
                item.apartamento_numero.trim(),
                badgeX + badgeW / 2,
                badgeY + badgeH / 2,
                { align: 'center', baseline: 'middle' }
              )
            }
          }

          // 3. Píldora de Estado Pastel (Columna 2)
          if (data.section === 'body' && data.column.index === 2) {
            const item = subList[data.row.index]
            if (item) {
              const pillH = Math.min(data.cell.height - 1.2, 4.4)
              const pillW = Math.min(data.cell.width - 2.0, 19.5)
              const pillX = data.cell.x + (data.cell.width - pillW) / 2
              const pillY = data.cell.y + (data.cell.height - pillH) / 2

              if (item.estado_solvente) {
                // Píldora Verde Menta Pastel (AL DÍA)
                doc.setFillColor(220, 252, 231) // #dcfce7
                doc.setDrawColor(187, 247, 208) // #bbf7d0
                doc.setLineWidth(0.18)
                doc.roundedRect(pillX, pillY, pillW, pillH, 1.2, 1.2, 'FD')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(fontSizeTable - 0.7)
                doc.setTextColor(21, 128, 61)   // #15803d
                doc.text(
                  'AL DÍA',
                  pillX + pillW / 2,
                  pillY + pillH / 2,
                  { align: 'center', baseline: 'middle' }
                )
              } else {
                // Píldora Coral Pastel (PENDIENTE / DEUDA)
                doc.setFillColor(254, 226, 226) // #fee2e2
                doc.setDrawColor(254, 202, 202) // #fecaca
                doc.setLineWidth(0.18)
                doc.roundedRect(pillX, pillY, pillW, pillH, 1.2, 1.2, 'FD')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(fontSizeTable - 0.8)
                doc.setTextColor(185, 28, 28)   // #b91c1c
                const lblDeuda = item.meses_con_deuda && item.meses_con_deuda > 1
                  ? `DEUDA (${item.meses_con_deuda}m)`
                  : 'PENDIENTE'
                doc.text(
                  lblDeuda,
                  pillX + pillW / 2,
                  pillY + pillH / 2,
                  { align: 'center', baseline: 'middle' }
                )
              }
            }
          }
        }
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CAJA DE CUENTAS BANCARIAS Y PAGO MÓVIL (Tarjeta Ejecutiva Inferior)
    // ─────────────────────────────────────────────────────────────────────────
    if (debeDibujarBancos) {
      // Fondo tarjeta redondeada blanca con borde slate suave
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.roundedRect(marginX, bankBoxY, anchoUtil, bankBoxHeight, 2, 2, 'FD')

      // Encabezado superior de la tarjeta bancaria
      const headBankH = 4.8
      doc.setFillColor(15, 23, 42) // #0f172a
      doc.roundedRect(marginX, bankBoxY, anchoUtil, headBankH, 2, 2, 'F')
      doc.rect(marginX, bankBoxY + headBankH - 1.5, anchoUtil, 1.5, 'F') // empalmar esquina recta inferior

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 6.2 : 6.6)
      doc.setTextColor(255, 255, 255)
      doc.text('DATOS OFICIALES PARA PAGO Y CONCILIACIÓN', marginX + 3.5, bankBoxY + 3.4)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(203, 213, 225)
      doc.text('Transferencia Bancaria & Pago Móvil', marginX + anchoUtil - 3.5, bankBoxY + 3.4, { align: 'right' })

      const cfgB = datos.configBanco || {}
      const colBankW = (anchoUtil - 7) / 2

      // Columna 1: Transferencia Bancaria
      const b1X = marginX + 3.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 5.8 : 6.2)
      doc.setTextColor(...cAccentOrange)
      doc.text('🏦 TRANSFERENCIA BANCARIA (Bs):', b1X, bankBoxY + 8.2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.2 : 5.6)
      doc.setTextColor(51, 65, 85)
      const bancoNombre = cfgB.banco || 'Bicentenario / Banco Nacional'
      const titular = cfgB.titular || datos.nombreEdificio || 'Junta de Condominio'
      const cedula = cfgB.cedulaRif || datos.rifEdificio || 'J-XXXXXXXX-X'
      const cuentaNum = cfgB.cuentaBancaria || '0175-XXXX-XX-XXXXXXXXXX'

      doc.text(`Banco: ${bancoNombre}`, b1X, bankBoxY + 11.8)
      doc.text(`Titular: ${titular} · RIF/C.I.: ${cedula}`, b1X, bankBoxY + 15.2)
      doc.setFont('helvetica', 'bold')
      doc.text(`Cuenta (20 dígitos): ${cuentaNum}`, b1X, bankBoxY + 18.8)

      // Columna 2: Pago Móvil / Divisas
      const b2X = marginX + colBankW + 4.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(orientacion === 'landscape' ? 5.8 : 6.2)
      doc.setTextColor(...cAccentOrange)
      doc.text('📱 PAGO MÓVIL INTERBANCARIO (Bs):', b2X, bankBoxY + 8.2)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(orientacion === 'landscape' ? 5.2 : 5.6)
      doc.setTextColor(51, 65, 85)
      const pmBanco = cfgB.pagoMovilBanco || cfgB.banco || 'Bicentenario'
      const pmTelf = cfgB.pagoMovilTelefono || '0414-XXXXXXX'
      const pmCed = cfgB.pagoMovilCedula || cfgB.cedulaRif || 'J-XXXXXXXX'

      doc.text(`Banco: ${pmBanco} · Teléfono: ${pmTelf}`, b2X, bankBoxY + 11.8)
      doc.text(`Cédula / RIF: ${pmCed}`, b2X, bankBoxY + 15.2)

      if (cfgB.zelleEmail) {
        doc.setFont('helvetica', 'bold')
        doc.text(`🟣 Zelle / Divisas: ${cfgB.zelleEmail}`, b2X, bankBoxY + 18.8)
      } else {
        doc.setFont('helvetica', 'italic')
        doc.text('Divisas en efectivo: previo acuerdo con administración.', b2X, bankBoxY + 18.8)
      }

      // Franja inferior informativa de reporte
      if (bankBoxHeight > 23) {
        const barH = 5.2
        doc.setFillColor(248, 250, 252)
        doc.rect(marginX + 0.3, bankBoxY + bankBoxHeight - barH - 0.3, anchoUtil - 0.6, barH, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.1)
        doc.setTextColor(71, 85, 105)
        doc.text(
          '✓ REPORTE DE PAGO: Al realizar su pago, repórtelo en la App del Condominio con el número de referencia para su inmediata conciliación.',
          marginX + 3.5,
          bankBoxY + bankBoxHeight - 1.8
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. PIE DE PÁGINA INSTITUCIONAL
    // ─────────────────────────────────────────────────────────────────────────
    const footerY = pageHeight - 3.8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(orientacion === 'landscape' ? 5.0 : 5.4)
    doc.setTextColor(148, 163, 184)
    const pieInfo = totalPaginas > 1
      ? `Cartelera de Ascensor · ${fechaHoy} · Hoja ${numPagina} de ${totalPaginas} · Documento Informativo Oficial`
      : `Cartelera de Ascensor · ${fechaHoy} · Documento Informativo Oficial · Su aporte puntual mantiene nuestro edificio.`
    doc.text(pieInfo, pageWidth / 2, footerY, { align: 'center' })
  })

  return doc
}
