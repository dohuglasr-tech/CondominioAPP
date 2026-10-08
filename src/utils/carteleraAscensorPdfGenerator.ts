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

const MESES_ABR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function formatearNombrePropietario(nombre?: string | null, numApto = ''): string {
  if (!nombre) return `Copropietario ${numApto}`
  const t = nombre.trim()
  if (!t || t.toLowerCase() === 'propietario' || t.toLowerCase() === 'sin asignar') {
    return `Copropietario ${numApto}`
  }
  return t
}

/**
 * Obtiene el detalle verídico de los meses adeudados de un apartamento.
 */
function obtenerDetalleMeses(item: FilaCalendarioApto, anio: number): string {
  if (item.estado_solvente) {
    if (item.saldo_a_favor_usd > 0) {
      return `Solvente (Saldo a favor: +$${fmtUsd(item.saldo_a_favor_usd)})`
    }
    return 'Solvente (Al dia en cuotas)'
  }

  const mesesMora: string[] = []
  MESES_ABR.forEach((mStr, idx) => {
    const k = `${anio}-${idx < 9 ? '0' + (idx + 1) : (idx + 1)}`
    const rec = item.meses ? item.meses[k] : null
    if (rec && rec.estado === 'pendiente') {
      mesesMora.push(mStr)
    }
  })

  if (mesesMora.length > 0) {
    if (mesesMora.length <= 4) {
      return `Debe: ${mesesMora.join(', ')} (${mesesMora.length}m)`
    }
    return `Debe: ${mesesMora[0]} a ${mesesMora[mesesMora.length - 1]} (${mesesMora.length} meses)`
  }

  const cant = item.meses_con_deuda || 1
  return `Deuda acumulada (${cant} ${cant === 1 ? 'mes' : 'meses'})`
}

/**
 * Genera el PDF oficial de Cartelera de Ascensor:
 * - En modo Horizontal (Landscape): Presenta la matriz completa del CALENDARIO mensual (12 meses con estatus OK/MORA).
 * - En modo Vertical (Portrait): Presenta la relación con detalle de meses adeudados y ubicación de inmueble.
 * - En 1, 2 o 3 páginas: Control estricto de altura para garantizar CERO páginas extras y CERO vacíos en blanco.
 * - CERO caracteres corruptos (sin emojis que se rompen en el motor PDF).
 */
export function generarCarteleraAscensorPDF(datos: DatosCarteleraAscensor): jsPDF {
  const orientacion = datos.orientacion || 'portrait'
  const isLandscape = orientacion === 'landscape'
  const distribucion = (datos.distribucionPaginas && [1, 2, 3].includes(datos.distribucionPaginas))
    ? datos.distribucionPaginas
    : 1

  const doc = new jsPDF({
    orientation: orientacion,
    unit: 'mm',
    format: 'letter'
  })

  const cDarkNavy: [number, number, number] = [15, 23, 42]
  const cAccentAmber: [number, number, number] = [245, 158, 11]
  const cSlateText: [number, number, number] = [51, 65, 85]

  // Filtrado de apartamentos
  let aptos = [...datos.filas]
  if (datos.filtro === 'con_deuda') {
    aptos = aptos.filter(f => !f.estado_solvente)
  } else if (datos.filtro === 'solventes') {
    aptos = aptos.filter(f => f.estado_solvente)
  }

  // Ordenar numéricamente por número de apartamento
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

  // División equitativa de apartamentos por página
  const chunksAptos: FilaCalendarioApto[][] = []
  if (distribucion === 1) {
    chunksAptos.push(aptos)
  } else if (distribucion === 2) {
    const mitad = Math.ceil(aptos.length / 2)
    chunksAptos.push(aptos.slice(0, mitad))
    chunksAptos.push(aptos.slice(mitad))
  } else {
    const tercio = Math.ceil(aptos.length / 3)
    chunksAptos.push(aptos.slice(0, tercio))
    chunksAptos.push(aptos.slice(tercio, tercio * 2))
    chunksAptos.push(aptos.slice(tercio * 2))
  }

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
    // 1. ENCABEZADO EJECUTIVO SUPERIOR (Sin emojis corruptos)
    // ─────────────────────────────────────────────────────────────────────────
    const headerTop = 4.5
    const headerHeight = isLandscape ? 13.5 : 17.5

    // Fondo azul marino con esquinas redondeadas
    doc.setFillColor(...cDarkNavy)
    doc.roundedRect(marginX, headerTop, anchoUtil, headerHeight, 2.0, 2.0, 'F')

    // Barra de acento ámbar
    doc.setFillColor(...cAccentAmber)
    doc.rect(marginX + 2.5, headerTop, anchoUtil - 5.0, 0.8, 'F')

    // Título edificio
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isLandscape ? 10.5 : 12.0)
    const nombreEdif = (datos.nombreEdificio || 'CONDOMINIO RESIDENCIAL').toUpperCase()
    doc.text(nombreEdif, marginX + 4.0, headerTop + 6.5)

    // Subtítulo con tipo de reporte y año
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isLandscape ? 6.8 : 7.8)
    doc.setTextColor(...cAccentAmber)
    const titReporte = datos.tituloPersonalizado
      ? datos.tituloPersonalizado.toUpperCase()
      : (isLandscape ? `CALENDARIO MENSUAL DE DEUDAS Y COBRANZA - ANIO ${datos.anio}` : `ESTADO DE SOLVENCIA Y COBRANZA - ANIO ${datos.anio}`)
    const parteBadge = totalPaginas > 1 ? ` - (PANEL ${numPagina} DE ${totalPaginas})` : ''
    doc.text(`${titReporte}${parteBadge}`, marginX + 4.0, headerTop + 10.4)

    // Información de RIF o Ubicación
    if (!isLandscape) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.8)
      doc.setTextColor(203, 213, 225)
      const rifStr = datos.rifEdificio ? `RIF: ${datos.rifEdificio} · ` : ''
      const dirTxt = datos.direccionEdificio || 'Cartelera Oficial del Ascensor'
      doc.text(`${rifStr}${dirTxt}`.slice(0, 80), marginX + 4.0, headerTop + 14.2)
    }

    // Píldora de Metadatos derecha
    const pillW = isLandscape ? 70 : 60
    const pillH = isLandscape ? 9.5 : 10.5
    const pillX = marginX + anchoUtil - pillW - 3.0
    const pillY = headerTop + 2.5

    doc.setFillColor(30, 41, 59)
    doc.setDrawColor(51, 65, 85)
    doc.setLineWidth(0.2)
    doc.roundedRect(pillX, pillY, pillW, pillH, 1.5, 1.5, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(255, 255, 255)
    doc.text(`TASA BCV: Bs. ${fmtBs(datos.tasaBcv)}/USD`, pillX + pillW / 2, pillY + 3.8, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.4)
    doc.setTextColor(203, 213, 225)
    doc.text(`${mesActualLabel} | Hoja ${numPagina} de ${totalPaginas}`, pillX + pillW / 2, pillY + 7.5, { align: 'center' })

    let currentY = headerTop + headerHeight + 2.5

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CINTILLO RESIDENCIAL DE METRICAS
    // ─────────────────────────────────────────────────────────────────────────
    if (numPagina === 1) {
      const kpiHeight = isLandscape ? 7.5 : 9.5
      const numCards = 4
      const gapCards = 2.0
      const cardWidth = (anchoUtil - gapCards * (numCards - 1)) / numCards
      const pctSolvente = datos.totalApartamentos > 0
        ? ((datos.apartamentosSolventes / datos.totalApartamentos) * 100).toFixed(1)
        : '100'

      const kpis = [
        {
          title: 'TOTAL INMUEBLES',
          val: `${datos.totalApartamentos} Aptos`,
          color: cDarkNavy
        },
        {
          title: 'SOLVENTES AL DIA',
          val: `${datos.apartamentosSolventes} (${pctSolvente}%)`,
          color: [16, 149, 93] as [number, number, number]
        },
        {
          title: 'CON MORA / DEUDA',
          val: `${datos.apartamentosMorosos} Aptos`,
          color: [220, 38, 38] as [number, number, number]
        },
        {
          title: 'DEUDA TOTAL EDIFICIO',
          val: `$${fmtUsd(datos.totalDeudaUsd)}`,
          color: [194, 65, 12] as [number, number, number]
        }
      ]

      kpis.forEach((kpi, idx) => {
        const x = marginX + idx * (cardWidth + gapCards)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, currentY, cardWidth, kpiHeight, 1.2, 1.2, 'F')
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.roundedRect(x, currentY, cardWidth, kpiHeight, 1.2, 1.2, 'S')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(4.6)
        doc.setTextColor(100, 116, 139)
        doc.text(kpi.title, x + 2.0, currentY + (isLandscape ? 2.6 : 3.2))

        doc.setFontSize(isLandscape ? 6.4 : 7.2)
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2])
        doc.text(kpi.val, x + 2.0, currentY + (isLandscape ? 5.8 : 7.0))
      })

      currentY += kpiHeight + 2.0
    } else {
      // Indicador de panel de continuación en páginas 2 y 3
      const ribbonH = isLandscape ? 4.5 : 5.0
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.2)
      doc.roundedRect(marginX, currentY, anchoUtil, ribbonH, 1.0, 1.0, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.6)
      doc.setTextColor(30, 41, 59)
      const primerApto = aptosChunk[0]?.apartamento_numero || ''
      const ultimoApto = aptosChunk[aptosChunk.length - 1]?.apartamento_numero || ''
      doc.text(
        `RELACION DE INMUEBLES: APARTAMENTOS DEL ${primerApto} AL ${ultimoApto} - (PANEL ${numPagina} DE ${totalPaginas})`,
        marginX + 3.0,
        currentY + (isLandscape ? 3.0 : 3.4)
      )

      currentY += ribbonH + 2.0
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CALCULO EXACTO DE ALTURA PARA CERO ESPACIO EN BLANCO Y CERO DESBORDES
    // ─────────────────────────────────────────────────────────────────────────
    const bankBoxHeight = isLastPage ? (isLandscape ? 21.0 : 26.0) : 0
    const footerMargin = 6.0

    // Límite donde termina la tabla exactamente
    const bottomLimit = isLastPage
      ? (pageHeight - bankBoxHeight - 5.0)
      : (pageHeight - footerMargin - 2.0)

    const startTableY = currentY
    const availTableHeight = Math.max(30, bottomLimit - startTableY)
    const headHeight = isLandscape ? 6.2 : 6.8
    const availBodyHeight = availTableHeight - headHeight

    // Altura de fila calculada de forma segura para rellenar toda la hoja
    const calcRowH = aptosChunk.length > 0 ? ((availBodyHeight - 3.0) / aptosChunk.length) : 7.0
    const bodyRowHeight = Math.max(5.0, Math.min(isLandscape ? 11.5 : 18.0, Math.floor(calcRowH * 10) / 10))

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CONSTRUCCIÓN DE COLUMNAS DE LA TABLA
    // ─────────────────────────────────────────────────────────────────────────
    let tableHeaders: string[] = []
    let columnStylesMap: Record<number, any> = {}

    if (isLandscape) {
      // MODO HORIZONTAL: Matriz completa del Calendario con los 12 meses
      tableHeaders = ['APTO', 'PROPIETARIO', ...MESES_ABR, 'ESTADO', 'TOTAL ($)', 'TOTAL (Bs)']

      const colW_Apto = 14.0
      const colW_Nom = 40.0
      const colW_Mes = 11.2 // 12 meses * 11.2 = 134.4 mm
      const colW_Est = 17.0
      const colW_Usd = 18.0
      const colW_Bs = 23.0

      columnStylesMap = {
        0: { cellWidth: colW_Apto, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: colW_Nom, halign: 'left' }
      }

      // Columnas 2 a 13: Los 12 meses
      for (let m = 0; m < 12; m++) {
        columnStylesMap[2 + m] = { cellWidth: colW_Mes, halign: 'center', fontStyle: 'bold' }
      }

      columnStylesMap[14] = { cellWidth: colW_Est, halign: 'center', fontStyle: 'bold' }
      columnStylesMap[15] = { cellWidth: colW_Usd, halign: 'right', fontStyle: 'bold' }
      columnStylesMap[16] = { cellWidth: colW_Bs, halign: 'right' }
    } else {
      // MODO VERTICAL: Relación con detalle explícito de meses en mora y ubicación
      tableHeaders = ['APTO', 'PROPIETARIO', 'UBICACION', 'DETALLE DE COBRANZA', 'ESTADO', 'TOTAL ($)', 'TOTAL (Bs)']

      const colW_Apto = anchoUtil * 0.11     // ~22.3 mm
      const colW_Nom = anchoUtil * 0.24      // ~48.7 mm
      const colW_Ubic = anchoUtil * 0.14     // ~28.4 mm
      const colW_Det = anchoUtil * 0.23      // ~46.6 mm
      const colW_Est = anchoUtil * 0.10      // ~20.3 mm
      const colW_Usd = anchoUtil * 0.09      // ~18.3 mm
      const colW_Bs = anchoUtil * 0.09       // ~18.3 mm

      columnStylesMap = {
        0: { cellWidth: colW_Apto, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: colW_Nom, halign: 'left' },
        2: { cellWidth: colW_Ubic, halign: 'left' },
        3: { cellWidth: colW_Det, halign: 'left' },
        4: { cellWidth: colW_Est, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: colW_Usd, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: colW_Bs, halign: 'right' }
      }
    }

    // Filas de datos
    const subBody = aptosChunk.map(item => {
      const nom = formatearNombrePropietario(item.propietario_nombre, item.apartamento_numero)
      const totalUsdTxt = item.estado_solvente
        ? (item.saldo_a_favor_usd > 0 ? `+${fmtUsd(item.saldo_a_favor_usd)}` : '$0.00')
        : `$${fmtUsd(item.total_usd)}`
      const totalBsTxt = item.estado_solvente
        ? (item.saldo_a_favor_bs > 0 ? `+${fmtBs(item.saldo_a_favor_bs)}` : 'Bs. 0')
        : `Bs. ${fmtBs(item.total_bs)}`
      const estadoTxt = item.estado_solvente ? 'AL DIA' : 'PENDIENTE'

      if (isLandscape) {
        // En horizontal: Evaluar los 12 meses directamente del recibo
        const monthCols = MESES_ABR.map((_, mIdx) => {
          const k = `${datos.anio}-${mIdx < 9 ? '0' + (mIdx + 1) : (mIdx + 1)}`
          const rec = item.meses ? item.meses[k] : null
          if (!rec) return '-'
          return rec.estado === 'pagado' ? 'OK' : 'MORA'
        })

        return [
          item.apartamento_numero,
          nom,
          ...monthCols,
          estadoTxt,
          totalUsdTxt,
          totalBsTxt
        ]
      } else {
        // En vertical: Ubicación y detalle explícito
        const pisoTxt = item.piso ? `Piso ${item.piso}` : `Nivel ${item.apartamento_numero[0] || '1'}`
        const alicTxt = item.alicuota ? `${(item.alicuota * 100).toFixed(2)}%` : 'General'
        const ubicacion = `${pisoTxt} (${alicTxt})`
        const detalle = obtenerDetalleMeses(item, datos.anio)

        return [
          item.apartamento_numero,
          nom,
          ubicacion,
          detalle,
          estadoTxt,
          totalUsdTxt,
          totalBsTxt
        ]
      }
    })

    autoTable(doc, {
      startY: startTableY,
      margin: {
        left: marginX,
        right: marginX,
        top: 4.5,
        bottom: 4.0 // margen seguro para que autoTable NUNCA genere un salto de página
      },
      tableWidth: anchoUtil,
      head: [tableHeaders],
      body: subBody,
      theme: 'plain',
      styles: {
        fontSize: isLandscape ? 6.2 : 6.8,
        cellPadding: 1.0,
        textColor: cSlateText,
        overflow: 'ellipsize',
        font: 'helvetica',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [71, 85, 105],
        fontStyle: 'bold',
        fontSize: isLandscape ? 6.0 : 6.5,
        minCellHeight: headHeight,
        halign: 'center',
        valign: 'middle'
      },
      bodyStyles: {
        minCellHeight: bodyRowHeight
      },
      columnStyles: columnStylesMap,
      didParseCell: (data) => {
        if (data.section === 'head') {
          if (data.column.index === 1 || (!isLandscape && (data.column.index === 2 || data.column.index === 3))) {
            data.cell.styles.halign = 'left'
          }
        }
        if (data.section === 'body') {
          // Fondo cebra tenue
          data.cell.styles.fillColor = data.row.index % 2 === 1 ? [248, 250, 252] : [255, 255, 255]

          const item = aptosChunk[data.row.index]
          if (!item) return

          if (isLandscape) {
            // Columnas de meses (index 2 a 13)
            if (data.column.index >= 2 && data.column.index <= 13) {
              const val = data.cell.text[0]
              if (val === 'OK') {
                data.cell.styles.fillColor = [220, 252, 231] // verde menta
                data.cell.styles.textColor = [21, 128, 61]   // verde esmeralda
                data.cell.styles.fontStyle = 'bold'
              } else if (val === 'MORA') {
                data.cell.styles.fillColor = [254, 226, 226] // coral suave
                data.cell.styles.textColor = [185, 28, 28]   // rojo
                data.cell.styles.fontStyle = 'bold'
              } else {
                data.cell.styles.textColor = [148, 163, 184]
              }
            } else if (data.column.index === 14) {
              // Estatus
              if (item.estado_solvente) {
                data.cell.styles.fillColor = [220, 252, 231]
                data.cell.styles.textColor = [21, 128, 61]
              } else {
                data.cell.styles.fillColor = [254, 226, 226]
                data.cell.styles.textColor = [185, 28, 28]
              }
            } else if (data.column.index === 15) {
              data.cell.styles.textColor = item.estado_solvente ? [148, 163, 184] : [15, 23, 42]
            }
          } else {
            // Modo Vertical
            if (data.column.index === 4) {
              // Estatus
              if (item.estado_solvente) {
                data.cell.styles.fillColor = [220, 252, 231]
                data.cell.styles.textColor = [21, 128, 61]
              } else {
                data.cell.styles.fillColor = [254, 226, 226]
                data.cell.styles.textColor = [185, 28, 28]
              }
            } else if (data.column.index === 3) {
              // Detalle
              data.cell.styles.textColor = item.estado_solvente ? [16, 149, 93] : [185, 28, 28]
              data.cell.styles.fontStyle = item.estado_solvente ? 'normal' : 'bold'
            } else if (data.column.index === 5) {
              data.cell.styles.textColor = item.estado_solvente ? [148, 163, 184] : [15, 23, 42]
            }
          }
        }
      },
      didDrawCell: (data) => {
        // Línea horizontal tenue en cada fila
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

        // Insignia del apartamento (Columna 0)
        if (data.section === 'body' && data.column.index === 0) {
          const item = aptosChunk[data.row.index]
          if (item) {
            const bH = Math.min(data.cell.height - 1.8, 6.0)
            const bW = Math.min(data.cell.width - 2.5, 12.5)
            const bX = data.cell.x + (data.cell.width - bW) / 2
            const bY = data.cell.y + (data.cell.height - bH) / 2

            doc.setFillColor(...cDarkNavy)
            doc.roundedRect(bX, bY, bW, bH, 1.2, 1.2, 'F')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(isLandscape ? 6.2 : 6.8)
            doc.setTextColor(255, 255, 255)
            doc.text(item.apartamento_numero.trim(), bX + bW / 2, bY + bH / 2, { align: 'center', baseline: 'middle' })
          }
        }
      }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CAJA DE BANCOS AL PIE DE LA ÚLTIMA PÁGINA
    // ─────────────────────────────────────────────────────────────────────────
    if (isLastPage) {
      const finalTableY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : currentY
      const bankY = Math.max(finalTableY + 2.0, pageHeight - bankBoxHeight - 5.5)

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.roundedRect(marginX, bankY, anchoUtil, bankBoxHeight, 1.8, 1.8, 'FD')

      // Encabezado de la caja
      const headBankH = isLandscape ? 4.0 : 4.5
      doc.setFillColor(...cDarkNavy)
      doc.roundedRect(marginX, bankY, anchoUtil, headBankH, 1.8, 1.8, 'F')
      doc.rect(marginX, bankY + headBankH - 1.2, anchoUtil, 1.2, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(isLandscape ? 5.8 : 6.4)
      doc.setTextColor(255, 255, 255)
      doc.text('DATOS BANCARIOS OFICIALES PARA PAGO Y CONCILIACION', marginX + 3.0, bankY + (isLandscape ? 2.8 : 3.2))

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.2)
      doc.setTextColor(203, 213, 225)
      doc.text('Transferencia Bancaria y Pago Movil', marginX + anchoUtil - 3.0, bankY + (isLandscape ? 2.8 : 3.2), { align: 'right' })

      const cfgB = datos.configBanco || {}
      const colBankW = (anchoUtil - 6.0) / 2

      // Columna 1: Transferencia Bancaria
      const b1X = marginX + 3.0
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(isLandscape ? 5.4 : 5.8)
      doc.setTextColor(...cAccentAmber)
      doc.text('TRANSFERENCIA BANCARIA (Bs):', b1X, bankY + (isLandscape ? 7.2 : 8.0))

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(isLandscape ? 4.8 : 5.2)
      doc.setTextColor(51, 65, 85)
      const bancoNombre = cfgB.banco || 'Bicentenario / Banco Nacional'
      const titular = cfgB.titular || datos.nombreEdificio || 'Junta de Condominio'
      const cedula = cfgB.cedulaRif || datos.rifEdificio || 'J-XXXXXXXX-X'
      const cuentaNum = cfgB.cuentaBancaria || '0175-XXXX-XX-XXXXXXXXXX'

      doc.text(`Banco: ${bancoNombre} | Titular: ${titular} | C.I/RIF: ${cedula}`, b1X, bankY + (isLandscape ? 10.5 : 11.8))
      doc.setFont('helvetica', 'bold')
      doc.text(`Cuenta (20 digitos): ${cuentaNum}`, b1X, bankY + (isLandscape ? 13.8 : 15.4))

      // Columna 2: Pago Móvil / Divisas
      const b2X = marginX + colBankW + 4.0
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(isLandscape ? 5.4 : 5.8)
      doc.setTextColor(...cAccentAmber)
      doc.text('PAGO MOVIL INTERBANCARIO (Bs):', b2X, bankY + (isLandscape ? 7.2 : 8.0))

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(isLandscape ? 4.8 : 5.2)
      doc.setTextColor(51, 65, 85)
      const pmBanco = cfgB.pagoMovilBanco || cfgB.banco || 'Bicentenario'
      const pmTelf = cfgB.pagoMovilTelefono || '0414-XXXXXXX'
      const pmCed = cfgB.pagoMovilCedula || cfgB.cedulaRif || 'J-XXXXXXXX'

      doc.text(`Banco: ${pmBanco} | Telefono: ${pmTelf} | CI/RIF: ${pmCed}`, b2X, bankY + (isLandscape ? 10.5 : 11.8))

      if (cfgB.zelleEmail) {
        doc.setFont('helvetica', 'bold')
        doc.text(`Zelle / Divisas: ${cfgB.zelleEmail}`, b2X, bankY + (isLandscape ? 13.8 : 15.4))
      } else {
        doc.setFont('helvetica', 'italic')
        doc.text('Efectivo Divisas: Previo acuerdo con administracion.', b2X, bankY + (isLandscape ? 13.8 : 15.4))
      }

      // Franja inferior de recordatorio
      const barH = isLandscape ? 3.8 : 4.4
      doc.setFillColor(248, 250, 252)
      doc.rect(marginX + 0.3, bankY + bankBoxHeight - barH - 0.3, anchoUtil - 0.6, barH, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(isLandscape ? 4.6 : 5.0)
      doc.setTextColor(71, 85, 105)
      doc.text(
        'REPORTE DE PAGO: Al transferir o pagar movil, repórtelo en la App del Condominio con su numero de referencia para conciliarlo de inmediato.',
        marginX + 3.0,
        bankY + bankBoxHeight - 1.4
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. PIE DE PÁGINA
    // ─────────────────────────────────────────────────────────────────────────
    const footerY = pageHeight - 3.2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(isLandscape ? 4.6 : 5.0)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Cartelera Informativa de Ascensor | Emision: ${fechaHoy} | Hoja ${numPagina} de ${totalPaginas} | Documento Oficial del Condominio`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    )
  })

  return doc
}
