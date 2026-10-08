import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface DatosNormasCondominio {
  nombreEdificio: string
  rif?: string | null
  direccion?: string | null
  ciudad?: string | null
  emailContacto?: string | null
  telefono?: string | null
  administradorNombre?: string | null
  presidenteNombre?: string | null
  fechaEmision?: string | null
}

export interface NormaSeccion {
  numero: number
  titulo: string
  baseLegal: string
  items: Array<{
    subtitulo: string
    texto: string
  }>
}

export const NORMAS_REGLAMENTO: NormaSeccion[] = [
  {
    numero: 1,
    titulo: 'Uso y Modificación de los Apartamentos',
    baseLegal: 'Arts. 3 y 8 de la Ley de Propiedad Horizontal (LPH)',
    items: [
      {
        subtitulo: 'Uso Exclusivo',
        texto:
          'Los apartamentos están destinados estrictamente para uso residencial. Queda prohibido el funcionamiento de comercios, industrias, depósitos o actividades que perturben la tranquilidad de la torre.'
      },
      {
        subtitulo: 'Inalterabilidad de la Fachada',
        texto:
          'Está terminantemente prohibido alterar el diseño original de la fachada. No se permite la instalación de toldos, rejas, tendederos de ropa, unidades de aire acondicionado o antenas hacia el exterior sin la aprobación unánime de la asamblea de copropietarios.'
      },
      {
        subtitulo: 'Daños a Terceros',
        texto:
          'Todo propietario es responsable civil y económicamente por las filtraciones, roturas de tuberías o daños estructurales que su inmueble cause a los apartamentos vecinos o áreas comunes (Art. 1185 del Código Civil).'
      }
    ]
  },
  {
    numero: 2,
    titulo: 'Áreas Comunes y Circulación',
    baseLegal: 'Art. 7 de la Ley de Propiedad Horizontal (LPH)',
    items: [
      {
        subtitulo: 'Despeje de Pasillos',
        texto:
          'Los pasillos, escaleras y vestíbulos son vías de escape y tránsito. Queda prohibido colocar bolsas de basura, zapatos, bicicletas, materos o cualquier objeto que obstruya la libre circulación.'
      },
      {
        subtitulo: 'Uso Adecuado',
        texto:
          'Los espacios comunes no podrán ser utilizados para fines distintos a su naturaleza (juegos de pelota en pasillos, talleres improvisados o depósitos).'
      }
    ]
  },
  {
    numero: 3,
    titulo: 'Ruidos Molestos y Tranquilidad',
    baseLegal: 'Ley de Convivencia Ciudadana',
    items: [
      {
        subtitulo: 'Horarios de Descanso',
        texto:
          'Se establece como horario de estricto silencio desde las 10:00 p.m. hasta las 7:00 a.m. de lunes a viernes. Los fines de semana y feriados el horario de descanso se extiende hasta las 9:00 a.m.'
      },
      {
        subtitulo: 'Control de Volumen',
        texto:
          'El uso de equipos de sonido, televisores, instrumentos musicales o reuniones sociales dentro de los apartamentos debe mantenerse a un volumen que no trascienda a los apartamentos vecinos en ningún horario.'
      }
    ]
  },
  {
    numero: 4,
    titulo: 'Remodelaciones y Mudanzas',
    baseLegal: 'Régimen de Obras y Mantenimiento Menor',
    items: [
      {
        subtitulo: 'Horario de Trabajos Ruidosos',
        texto:
          'Las reparaciones o remodelaciones que generen ruidos (taladros, martilleo, demoliciones) solo podrán realizarse de lunes a viernes entre las 8:00 a.m. y las 12:00 p.m., y de 1:00 p.m. a 5:00 p.m. Quedan prohibidos estos trabajos los días sábados, domingos y feriados.'
      },
      {
        subtitulo: 'Notificación y Daños',
        texto:
          'Toda mudanza o ingreso de materiales de construcción debe ser notificada a la administración. Si durante el proceso se producen daños en paredes, ascensores o puertas, el propietario asumirá el costo total de la reparación. No se permite dejar escombros en las áreas comunes o cuartos de basura.'
      }
    ]
  },
  {
    numero: 5,
    titulo: 'Disposición de Desechos Sólidos',
    baseLegal: 'Higiene y Salubridad de la Comunidad',
    items: [
      {
        subtitulo: 'Embalaje Seguro',
        texto:
          'La basura debe ser introducida en bolsas debidamente amarradas y sin presentar filtraciones de líquidos.'
      },
      {
        subtitulo: 'Bajantes y Cuarto Principal',
        texto:
          'Si el tamaño de la bolsa excede la capacidad del bajante, debe ser llevada directamente al cuarto principal de basura. Está prohibido dejar bolsas fuera de los bajantes, en los pasillos o áreas de estacionamiento.'
      }
    ]
  },
  {
    numero: 6,
    titulo: 'Estacionamiento',
    baseLegal: 'Uso Exclusivo de Puestos y Áreas de Parqueo',
    items: [
      {
        subtitulo: 'Puesto Asignado',
        texto:
          'Cada propietario o inquilino debe estacionar exclusivamente en el puesto asignado en su documento de propiedad o contrato.'
      },
      {
        subtitulo: 'Prohibiciones Mecánicas',
        texto:
          'Queda prohibido el lavado profundo de vehículos, cambios de aceite, reparaciones mecánicas mayores o dejar repuestos y chatarra en el área de estacionamiento.'
      }
    ]
  },
  {
    numero: 7,
    titulo: 'Tenencia de Mascotas',
    baseLegal: 'Criterios Vinculantes del Tribunal Supremo de Justicia (TSJ)',
    items: [
      {
        subtitulo: 'Convivencia y Paz',
        texto:
          'La tenencia de mascotas está permitida siempre que no perturben la paz ni amenacen la seguridad de la comunidad.'
      },
      {
        subtitulo: 'Tránsito con Correa',
        texto:
          'Las mascotas no pueden deambular solas por el edificio. Al transitar por áreas comunes, deben estar acompañadas por su dueño y sujetas con correa.'
      },
      {
        subtitulo: 'Higiene y Desechos',
        texto:
          'El propietario es responsable de limpiar de manera inmediata cualquier desecho o necesidad fisiológica que la mascota deje en ascensores, pasillos o áreas comunes.'
      },
      {
        subtitulo: 'Control de Ladridos',
        texto:
          'Los ladridos o ruidos constantes que perturben a los vecinos serán causa de notificación formal y posibles acciones ante las autoridades de justicia de paz comunal.'
      }
    ]
  },
  {
    numero: 8,
    titulo: 'Obligaciones Económicas',
    baseLegal: 'Arts. 12 y 14 de la Ley de Propiedad Horizontal (LPH)',
    items: [
      {
        subtitulo: 'Deber de Pago Puntual',
        texto:
          'El pago puntual de los recibos de condominio es un deber legal y moral indispensable para el sostenimiento de los servicios básicos y mantenimiento de la torre.'
      },
      {
        subtitulo: 'Consecuencias de la Morosidad',
        texto:
          'La morosidad afecta directamente la operatividad del edificio. La administración está facultada para aplicar intereses de mora, limitar el uso de servicios no esenciales (donde aplique según la asamblea) y remitir los casos de atrasos prolongados al departamento legal para el cobro por vía judicial ejecutiva.'
      }
    ]
  }
]

export const PREAMBULO_TEXTO =
  'El presente reglamento tiene como finalidad garantizar la paz, la seguridad y el mantenimiento del valor patrimonial de nuestro edificio. Su cumplimiento es de carácter obligatorio para todos los propietarios, inquilinos y visitantes, amparado en las normativas legales vigentes.'

export const CLAUSULA_CIERRE_TEXTO =
  'El desconocimiento de estas normas no exime a ningún residente de su cumplimiento ni de las responsabilidades civiles o administrativas que de ellas deriven.'

/**
 * Genera el documento oficial PDF del Reglamento de Convivencia
 * conservando exactamente los mismos colores corporativos (Slate 900 y Naranja),
 * fuentes y formato geométrico de los recibos oficiales.
 */
export function generarPDFNormas(datos: DatosNormasCondominio): jsPDF {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const cDark:   [number, number, number] = [15, 23, 42]     // Slate 900
  const cAccent: [number, number, number] = [249, 115, 22]   // Brand Orange
  const cSlateLine: [number, number, number] = [226, 232, 240]

  const nombreEdificio = (datos.nombreEdificio || 'Residencias Ocutuy 5').trim()
  const rif = (datos.rif || 'J-296749485').trim()
  const direccion = (datos.direccion || 'Urbanización Casa Blanca, Residencias Ocutuy 5').trim()
  const ciudad = (datos.ciudad || 'Charallave, Miranda').trim()
  const email = (datos.emailContacto || 'juntacondominioocutuy5@gmail.com').trim()
  const fechaStr = datos.fechaEmision || new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })

  // Función para dibujar encabezado de la Página 1 (idéntico al de recibos)
  const dibujarHeaderPagina1 = () => {
    // Fondo Slate 900
    doc.setFillColor(...cDark)
    doc.rect(0, 0, 210, 36, 'F')

    // Línea inferior naranja de acento (2mm)
    doc.setFillColor(...cAccent)
    doc.rect(0, 36, 210, 2, 'F')

    // Acento vertical naranja izquierdo
    doc.setFillColor(...cAccent)
    doc.rect(12, 10, 3, 16, 'F')

    // Título institucional (Lado izquierdo)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...cAccent)
    doc.text(`JUNTA DE CONDOMINIO ${nombreEdificio.toUpperCase()}`, 18, 14)

    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('REGLAMENTO GENERAL DE CONVIVENCIA', 18, 22)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(203, 213, 225)
    doc.text(`DIRECCIÓN: ${direccion.toUpperCase()}`, 18, 28)

    // Datos fiscales y contacto (Lado derecho)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...cAccent)
    doc.text(`RIF: ${rif}`, 198, 14, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(226, 232, 240)
    doc.text(`CORREO: ${email}`, 198, 20, { align: 'right' })
    doc.text(`EDIFICIO: ${nombreEdificio.toUpperCase()}`, 198, 26, { align: 'right' })
  }

  // Función para dibujar encabezado de páginas siguientes (Pág 2 en adelante)
  const dibujarHeaderPaginasSecundarias = () => {
    doc.setFillColor(...cDark)
    doc.rect(0, 0, 210, 14, 'F')

    doc.setFillColor(...cAccent)
    doc.rect(0, 14, 210, 1.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...cAccent)
    doc.text(`JUNTA DE CONDOMINIO ${nombreEdificio.toUpperCase()}`, 12, 9)

    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text('· REGLAMENTO OFICIAL DE RÉGIMEN INTERNO', doc.getTextWidth(`JUNTA DE CONDOMINIO ${nombreEdificio.toUpperCase()}`) + 14, 9)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(203, 213, 225)
    doc.text(`NORMATIVA LEGAL VINCULANTE · ${ciudad.toUpperCase()}`, 198, 9, { align: 'right' })
  }

  // Dibujar encabezado pág 1
  dibujarHeaderPagina1()

  // ── 1. Cuadro Institucional de Datos del Inmueble y Marco Jurídico ──
  autoTable(doc, {
    startY: 41,
    margin: { left: 12, right: 12 },
    tableWidth: 186,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.3 },
    head: [['INMUEBLE', 'MARCO JURÍDICO APLICABLE', 'SUJETOS OBLIGADOS', 'EMISIÓN / VIGENCIA']],
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    body: [[
      nombreEdificio.toUpperCase(),
      'LPH · Cód. Civil · Convivencia Ciudadana · TSJ',
      'Propietarios, Inquilinos y Visitantes',
      fechaStr
    ]],
    bodyStyles: { fontStyle: 'bold', fontSize: 7.8, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 50, halign: 'center', textColor: cAccent },
      1: { cellWidth: 62, halign: 'center' },
      2: { cellWidth: 44, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' }
    }
  })

  // ── 2. Preámbulo / Declaración de Principios ──
  let currentY = (doc as any).lastAutoTable.finalY + 3

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)

  const preambuloLineas = doc.splitTextToSize(PREAMBULO_TEXTO, 176)
  const preambuloH = (preambuloLineas.length * 3.6) + 9

  doc.rect(12, currentY, 186, preambuloH, 'FD')

  // Barrita naranja a la izquierda de la tarjeta del preámbulo
  doc.setFillColor(...cAccent)
  doc.rect(12, currentY, 2.5, preambuloH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...cDark)
  doc.text('DECLARACIÓN DE PRINCIPIOS Y ALCANCE OBLIGATORIO:', 18, currentY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(51, 65, 85)
  doc.text(preambuloLineas, 18, currentY + 8.8)

  currentY += preambuloH + 3.5

  // ── 3. Renderizado de las 8 Normas de Convivencia ──
  NORMAS_REGLAMENTO.forEach((seccion) => {
    // Si queda poco espacio en la página, iniciar nueva página para no cortar el título
    if (currentY > 235) {
      doc.addPage()
      dibujarHeaderPaginasSecundarias()
      currentY = 20
    }

    const tableBody = seccion.items.map(item => [
      item.subtitulo,
      item.texto
    ])

    autoTable(doc, {
      startY: currentY,
      margin: { left: 12, right: 12 },
      tableWidth: 186,
      theme: 'grid',
      styles: {
        fontSize: 7.2,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: cSlateLine,
        lineWidth: 0.25,
        valign: 'middle'
      },
      head: [[
        `${seccion.numero}. ${seccion.titulo.toUpperCase()}`,
        `Base Legal: ${seccion.baseLegal}`
      ]],
      headStyles: {
        fillColor: cDark,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
        cellPadding: 2.6
      },
      columnStyles: {
        0: {
          cellWidth: 42,
          fontStyle: 'bold',
          textColor: [15, 23, 42],
          fillColor: [248, 250, 252]
        },
        1: {
          cellWidth: 144,
          textColor: [30, 41, 59],
          fontSize: 7.1,
          fontStyle: 'normal'
        }
      },
      body: tableBody,
      didDrawCell: (data) => {
        // En la fila del encabezado, colorear la base legal con acento naranja
        if (data.section === 'head' && data.column.index === 1) {
          doc.setTextColor(...cAccent)
        }
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 3
  })

  // ── 4. Cláusula de Cierre y Advertencia Legal ──
  if (currentY > 230) {
    doc.addPage()
    dibujarHeaderPaginasSecundarias()
    currentY = 20
  }

  // Banner con fondo ámbar idéntico al banner de advertencia del recibo
  doc.setFillColor(254, 243, 199)
  doc.setDrawColor(245, 158, 11)
  doc.setLineWidth(0.4)
  doc.rect(12, currentY, 186, 12, 'FD')

  doc.setTextColor(146, 64, 14)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.2)
  doc.text('AVISO DE RESPONSABILIDAD LEGAL Y CUMPLIMIENTO OBLIGATORIO', 105, currentY + 4.2, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  const clausulaLineas = doc.splitTextToSize(CLAUSULA_CIERRE_TEXTO, 178)
  doc.text(clausulaLineas, 105, currentY + 8.2, { align: 'center' })

  currentY += 16

  // ── 5. Recuadro de Aval Institucional y Firmas (Personalizado por Edificio) ──
  if (currentY > 240) {
    doc.addPage()
    dibujarHeaderPaginasSecundarias()
    currentY = 20
  }

  const firmasH = 24
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.rect(12, currentY, 186, firmasH, 'S')

  doc.setFillColor(241, 245, 249)
  doc.rect(12, currentY, 186, 4.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(51, 65, 85)
  doc.text('CONSTANCIA DE EXPEDICIÓN Y VALIDACIÓN INSTITUCIONAL', 105, currentY + 3, { align: 'center' })

  // Columna 1: Por la Administración
  const adminNombre = datos.administradorNombre || 'Dohuglas Guevara'
  const col1X = 16
  const col1Y = currentY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(...cDark)
  doc.text('POR LA ADMINISTRACIÓN DEL CONDIMINIO:', col1X, col1Y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.4)
  doc.setTextColor(71, 85, 105)
  doc.text(`Responsable: ${adminNombre}`, col1X, col1Y + 3.8)
  doc.text(`Edificio: ${nombreEdificio}`, col1X, col1Y + 7.4)
  doc.text('Firma / Sello Administrativo Oficial', col1X, col1Y + 11.2)

  // Columna 2: Por la Junta de Condominio
  const presidenteNombre = datos.presidenteNombre || 'Rafael Eduardo Malvares'
  const col2X = 110
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(...cDark)
  doc.text('POR LA JUNTA DE CONDOMINIO:', col2X, col1Y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.4)
  doc.setTextColor(71, 85, 105)
  doc.text(`Presidencia / Comité: ${presidenteNombre}`, col2X, col1Y + 3.8)
  doc.text('En representación de la Asamblea de Copropietarios', col2X, col1Y + 7.4)
  doc.text(`Fecha de Entrada en Vigencia: ${fechaStr}`, col2X, col1Y + 11.2)

  // ── 6. Pie de Página en Todas las Hojas ──
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Línea divisoria inferior
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(12, 287, 198, 287)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(148, 163, 184)
    doc.text(`${nombreEdificio.toUpperCase()} · RÉGIMEN DE PROPIEDAD HORIZONTAL`, 12, 291)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...cAccent)
    doc.text(`Página ${i} de ${totalPages}`, 105, 291, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text('DOCUMENTO OFICIAL DE CONVIVENCIA', 198, 291, { align: 'right' })
  }

  return doc
}

/**
 * Descarga directamente el archivo PDF del reglamento en el dispositivo del usuario
 */
export function descargarNormasPDF(datos: DatosNormasCondominio): void {
  const doc = generarPDFNormas(datos)
  const cleanName = (datos.nombreEdificio || 'Edificio')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `Reglamento_Normas_Convivencia_${cleanName}.pdf`
  doc.save(filename)
}

/**
 * Abre el PDF en una pestaña nueva o visor del navegador para imprimir o visualizar
 */
export function abrirNormasPDF(datos: DatosNormasCondominio): void {
  const doc = generarPDFNormas(datos)
  const blobUrl = doc.output('bloburl')
  window.open(blobUrl, '_blank')
}
