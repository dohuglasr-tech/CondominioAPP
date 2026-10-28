import jsPDF from 'jspdf'

// ─────────────────────────────────────────────────────────────────────────────
//  CARTA DE SOLVENCIA DE CONDOMINIO
//  Formato: hoja tamaño CARTA (215.9 x 279.4 mm) con diseño a sangre completa.
//  El contenido (textos, datos y firmas) se construye una sola vez en
//  `construirContenidoSolvencia` y es consumido tanto por el PDF como por la
//  vista previa en pantalla, para que ambos siempre coincidan.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosCartaSolvencia {
  // Edificio & entidad (sincronizados con la configuración del administrador)
  nombreEdificio: string
  rif: string
  direccion: string
  ciudad?: string
  logoUrl?: string | null
  telefono?: string | null
  email?: string | null

  // Presidente de la Junta
  presidenteNombre: string
  presidenteCargo?: string
  presidenteCedula?: string
  /** 'M' | 'F'. Si no se indica, se deduce del cargo (Presidenta => F). */
  presidenteGenero?: 'M' | 'F'

  // Administrador
  administradorNombre: string
  administradorCargo?: string

  // Residente & apartamento
  residenteNombre: string
  residenteCedula: string
  residenteApto: string
  residentePiso?: string | number
  alicuotaPct?: string

  // Último pago aprobado (opcional, enriquece la constancia)
  ultimoPagoFecha?: string | null
  ultimoPagoReferencia?: string | null
  ultimoPagoMonto?: number | null

  // Período solvente
  mesSolvente: string
  anioSolvente: number

  // Fecha de expedición
  diaEmision: number
  mesEmision: string
  anioEmision: number

  // Validación
  codigoVerificacion?: string
}

export interface SegmentoTexto {
  t: string
  b?: boolean
}

export interface CeldaResumen {
  label: string
  value: string
  sub?: string
  verde?: boolean
}

export interface ContenidoSolvencia {
  etiquetaJunta: string
  nombreEdificio: string
  direccion: string
  rif: string
  codigo: string
  emitidaTxt: string
  vigenciaTxt: string
  titulo: string
  subtitulo: string
  parrafos: SegmentoTexto[][]
  celdas: CeldaResumen[]
  firmaIntro: string
  firmas: Array<{ nombre: string; cargo: string }>
  sello: string
  pieContacto: string[]
  pieLegal: string
}

const MESES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
]

/** Vigencia (en días) de la constancia a partir de su fecha de emisión. */
export const VIGENCIA_SOLVENCIA_DIAS = 30

export function obtenerMesActualEs(): string {
  return MESES_ES[new Date().getMonth()] || 'OCTUBRE'
}

// ── Utilidades de formato ────────────────────────────────────────────────────

export function normalizarCedula(raw?: string | null): string {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  const m = s.match(/^([VEJGP])[-\s.]*([\d.]+)$/)
  if (m) return `${m[1]}-${m[2].replace(/\./g, '')}`
  if (/^[\d.]+$/.test(s)) return `V-${s.replace(/\./g, '')}`
  return s
}

function aTitulo(s: string): string {
  const conectores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en'])
  return s
    .replace(/\.\s+/g, ', ')
    .replace(/[.\s]+$/, '')
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (w === '' || /^\s+$/.test(w)) return w
      if (i > 0 && conectores.has(w)) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join('')
}

const dosDigitos = (n: number) => String(n).padStart(2, '0')

function fechaCorta(d: Date): string {
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Formatea una fecha ISO (YYYY-MM-DD o timestamp) a dd/mm/aaaa sin desfase de zona horaria. */
export function formatearFechaIso(iso?: string | null): string {
  if (!iso) return ''
  const solo = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : fechaCorta(d)
}

function fechaEmision(datos: DatosCartaSolvencia): Date {
  const hoy = new Date()
  const mesIdx = MESES_ES.indexOf(String(datos.mesEmision || '').toUpperCase())
  return new Date(
    datos.anioEmision || hoy.getFullYear(),
    mesIdx >= 0 ? mesIdx : hoy.getMonth(),
    datos.diaEmision || hoy.getDate()
  )
}

/** Código de validación determinístico (mismo documento => mismo código). */
export function generarCodigoSolvencia(datos: DatosCartaSolvencia): string {
  if (datos.codigoVerificacion) return datos.codigoVerificacion
  const f = fechaEmision(datos)
  const base = `${datos.residenteCedula}|${datos.residenteApto}|${datos.mesSolvente}|${datos.anioSolvente}|${datos.residenteNombre}|${fechaCorta(f)}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0
  const hash = h.toString(36).toUpperCase().padStart(5, '0').slice(0, 5)
  const apto = String(datos.residenteApto || 'RES').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `SOLV-${apto}-${f.getFullYear()}${dosDigitos(f.getMonth() + 1)}${dosDigitos(f.getDate())}-${hash}`
}

// ── Contenido común (PDF + vista previa) ─────────────────────────────────────

export function construirContenidoSolvencia(datos: DatosCartaSolvencia): ContenidoSolvencia {
  const f = fechaEmision(datos)
  const mesEmisionTxt = MESES_ES[f.getMonth()].toLowerCase()
  const mesSolv = String(datos.mesSolvente || obtenerMesActualEs()).toUpperCase()
  const anioSolv = datos.anioSolvente || f.getFullYear()

  const edificio = String(datos.nombreEdificio || 'Condominio').trim().toUpperCase()
  const rif = String(datos.rif || '').trim().toUpperCase()
  const dirHeader = String(datos.direccion || '').trim().toUpperCase()
  const dirTitulo = aTitulo(String(datos.direccion || ''))

  const presNombre = String(datos.presidenteNombre || 'Presidente de la Junta').trim().toUpperCase()
  const presCargo = String(datos.presidenteCargo || 'Presidente').trim()
  const presFem = datos.presidenteGenero ? datos.presidenteGenero === 'F' : /presidenta/i.test(presCargo)
  const presCedula = normalizarCedula(datos.presidenteCedula)

  const resNombre = String(datos.residenteNombre || 'Propietario').trim().toUpperCase()
  const resCedula = normalizarCedula(datos.residenteCedula)
  const apto = String(datos.residenteApto || '').trim()
  const piso = datos.residentePiso !== undefined && datos.residentePiso !== null && String(datos.residentePiso).trim() !== ''
    ? String(datos.residentePiso).trim()
    : ''

  const adminNombre = String(datos.administradorNombre || 'Administración').trim().toUpperCase()
  const adminCargo = String(datos.administradorCargo || 'Administrador').trim()

  const codigo = generarCodigoSolvencia(datos)
  const venceTxt = fechaCorta(new Date(f.getFullYear(), f.getMonth(), f.getDate() + VIGENCIA_SOLVENCIA_DIAS))

  // ── Párrafo 1: declaración del presidente ──
  const p1: SegmentoTexto[] = [
    { t: 'Yo, ' },
    { t: presNombre, b: true },
    { t: `, ${presFem ? 'venezolana' : 'venezolano'}, mayor de edad` },
  ]
  if (presCedula) {
    p1.push({ t: ', titular de la cédula de identidad N° ' }, { t: presCedula, b: true })
  }
  p1.push(
    { t: ', en mi carácter de ' },
    { t: presCargo, b: true },
    { t: ' de la Junta de Condominio del edificio ' },
    { t: edificio, b: true },
    { t: `${rif ? `, identificado con el RIF ${rif}` : ''}${dirTitulo ? `, ubicado en ${dirTitulo}` : ''}, por medio de la presente ` },
    { t: 'HAGO CONSTAR', b: true },
    { t: ' que ' },
    { t: resNombre, b: true }
  )
  if (resCedula) {
    p1.push({ t: ', titular de la cédula de identidad N° ' }, { t: resCedula, b: true })
  }
  p1.push(
    { t: `, residente del apartamento N° ` },
    { t: apto || 'N/D', b: true },
    { t: `${piso ? `, ubicado en el piso ${piso}` : ''} del referido edificio, se encuentra ` },
    { t: 'SOLVENTE', b: true },
    { t: ' en el pago del servicio de condominio y del servicio de gas comunal, sin mantener deudas, mora ni cuotas pendientes con la comunidad, hasta el mes de ' },
    { t: `${mesSolv} ${anioSolv}`, b: true },
    { t: '.' }
  )

  // ── Párrafo 2: expedición ──
  const ciudad = String(datos.ciudad || '').trim()
  const diaTxt = f.getDate() === 1 ? 'al primer día' : `a los ${f.getDate()} días`
  const p2: SegmentoTexto[] = [
    { t: `Constancia que se expide a solicitud de la parte interesada${ciudad ? `, en ${ciudad}` : ''}, ${diaTxt} del mes de ${mesEmisionTxt} del año ${f.getFullYear()}.` }
  ]

  // ── Párrafo 3: validez ──
  const p3: SegmentoTexto[] = [
    { t: `La presente solvencia certifica la situación de pago del inmueble a la fecha de su emisión, tiene una vigencia de treinta (${VIGENCIA_SOLVENCIA_DIAS}) días continuos y puede ser verificada ante la Administración del Condominio mediante el código de validación indicado al pie del documento.` }
  ]

  // ── Párrafo 4: cierre ──
  const p4: SegmentoTexto[] = [
    { t: 'Sin más que hacer referencia, quedando a disposición de los interesados para corroborar la información suministrada.' }
  ]

  // ── Resumen de datos ──
  const subInmueble = [piso ? `Piso ${piso}` : '', datos.alicuotaPct ? `Alícuota ${datos.alicuotaPct}` : '']
    .filter(Boolean)
    .join('  ·  ')

  const celdas: CeldaResumen[] = [
    { label: 'TITULAR', value: resNombre },
    { label: 'CÉDULA DE IDENTIDAD', value: resCedula || 'No registrada' },
    { label: 'INMUEBLE', value: `Apto. ${apto || 'N/D'}`, sub: subInmueble || undefined },
    { label: 'ESTATUS', value: 'SOLVENTE', sub: 'Condominio y gas al día', verde: true },
    { label: 'SOLVENTE HASTA', value: `${mesSolv} ${anioSolv}`, sub: `Emitida el ${fechaCorta(f)}` },
  ]

  const fechaPago = formatearFechaIso(datos.ultimoPagoFecha)
  if (fechaPago) {
    const montoTxt = datos.ultimoPagoMonto && datos.ultimoPagoMonto > 0
      ? `Bs. ${Number(datos.ultimoPagoMonto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''
    const sub = [datos.ultimoPagoReferencia ? `Ref. ${datos.ultimoPagoReferencia}` : '', montoTxt]
      .filter(Boolean)
      .join('  ·  ')
    celdas.push({ label: 'ÚLTIMO PAGO APROBADO', value: fechaPago, sub: sub || undefined })
  } else {
    celdas.push({ label: 'VÁLIDA HASTA', value: venceTxt, sub: `${VIGENCIA_SOLVENCIA_DIAS} días desde la emisión` })
  }

  // ── Pie ──
  const pieContacto = [datos.email, datos.telefono].filter(Boolean).map(String)

  return {
    etiquetaJunta: 'JUNTA DE CONDOMINIO',
    nombreEdificio: edificio,
    direccion: dirHeader,
    rif: rif ? `RIF ${rif}` : '',
    codigo,
    emitidaTxt: `Emitida: ${fechaCorta(f)}`,
    vigenciaTxt: `Vigencia: ${VIGENCIA_SOLVENCIA_DIAS} días`,
    titulo: 'Solvencia de Condominio',
    subtitulo: 'Constancia de pago de condominio y servicio de gas comunal',
    parrafos: [p1, p2, p3, p4],
    celdas,
    firmaIntro: 'Por la Junta de Condominio',
    firmas: [
      { nombre: presNombre, cargo: presCargo },
      { nombre: adminNombre, cargo: adminCargo },
    ],
    sello: 'ESTE RESIDENTE ESTÁ 100% SOLVENTE',
    pieContacto,
    pieLegal: `Documento generado electrónicamente por el Sistema de Gestión de Condominio  ·  Expedido el ${fechaCorta(f)}`,
  }
}

// ── Helpers de dibujo ────────────────────────────────────────────────────────

type RGB = [number, number, number]

const C_NAVY: RGB = [15, 23, 42]
const C_NAVY2: RGB = [24, 35, 62]
const C_ORANGE: RGB = [249, 115, 22]
const C_GREEN: RGB = [22, 163, 74]
const C_SLATE: RGB = [51, 65, 85]
const C_MUTED: RGB = [100, 116, 139]
const C_LIGHT: RGB = [243, 246, 250]
const C_BORDER: RGB = [226, 232, 240]

const PAGE_W = 215.9
const PAGE_H = 279.4
const MX = 24

function textoEspaciado(
  doc: jsPDF,
  txt: string,
  x: number,
  y: number,
  o: { size: number; color: RGB; bold?: boolean; cs?: number; align?: 'left' | 'center' | 'right' }
) {
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal')
  doc.setFontSize(o.size)
  doc.setTextColor(...o.color)
  const cs = o.cs ?? 0
  const w = doc.getTextWidth(txt) + cs * Math.max(0, txt.length - 1)
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
  doc.text(txt, x0, y, { charSpace: cs })
}

/** Reduce el tamaño de fuente hasta que el texto quepa en `maxW`. Devuelve el tamaño final. */
function ajustarFuente(doc: jsPDF, txt: string, maxW: number, size: number, min = 6): number {
  let fs = size
  doc.setFontSize(fs)
  while (doc.getTextWidth(txt) > maxW && fs > min) {
    fs -= 0.25
    doc.setFontSize(fs)
  }
  return fs
}

type Pieza = { t: string; b: boolean; w: number }
type Palabra = { piezas: Pieza[]; w: number }
type Maqueta = { lineas: Palabra[][]; espacio: number }

/** Mide y reparte un párrafo en líneas (sin dibujar). */
function maquetarParrafo(doc: jsPDF, segs: SegmentoTexto[], maxW: number, fs: number): Maqueta {
  const medir = (t: string, b: boolean) => {
    doc.setFont('helvetica', b ? 'bold' : 'normal')
    doc.setFontSize(fs)
    return doc.getTextWidth(t)
  }

  const palabras: Palabra[] = []
  let nueva = true
  for (const s of segs) {
    for (const parte of s.t.split(/(\s+)/)) {
      if (!parte) continue
      if (/^\s+$/.test(parte)) {
        nueva = true
        continue
      }
      const pz: Pieza = { t: parte, b: !!s.b, w: medir(parte, !!s.b) }
      if (nueva || palabras.length === 0) {
        palabras.push({ piezas: [pz], w: pz.w })
      } else {
        const ult = palabras[palabras.length - 1]
        ult.piezas.push(pz)
        ult.w += pz.w
      }
      nueva = false
    }
  }

  const espacio = medir(' ', false)
  const lineas: Palabra[][] = []
  let actual: Palabra[] = []
  let anchoActual = 0
  for (const p of palabras) {
    const nuevoAncho = actual.length ? anchoActual + espacio + p.w : p.w
    if (actual.length && nuevoAncho > maxW) {
      lineas.push(actual)
      actual = [p]
      anchoActual = p.w
    } else {
      actual.push(p)
      anchoActual = nuevoAncho
    }
  }
  if (actual.length) lineas.push(actual)

  return { lineas, espacio }
}

/** Párrafo justificado con tramos en negrita. Devuelve la línea base de la última línea. */
function dibujarParrafo(
  doc: jsPDF,
  segs: SegmentoTexto[],
  x: number,
  y: number,
  maxW: number,
  fs: number,
  lh: number,
  color: RGB
): number {
  const { lineas, espacio } = maquetarParrafo(doc, segs, maxW, fs)

  doc.setTextColor(...color)
  lineas.forEach((ln, i) => {
    const suma = ln.reduce((a, p) => a + p.w, 0)
    const esUltima = i === lineas.length - 1
    const gap = !esUltima && ln.length > 1 ? (maxW - suma) / (ln.length - 1) : espacio
    let cx = x
    ln.forEach(p => {
      p.piezas.forEach(pz => {
        doc.setFont('helvetica', pz.b ? 'bold' : 'normal')
        doc.setFontSize(fs)
        doc.text(pz.t, cx, y + i * lh)
        cx += pz.w
      })
      cx += gap
    })
  })

  return y + (lineas.length - 1) * lh
}

function dibujarCheck(doc: jsPDF, cx: number, cy: number, s: number, color: RGB, lw: number) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.setLineCap('round')
  doc.setLineJoin('round')
  doc.line(cx - s * 0.5, cy + s * 0.02, cx - s * 0.12, cy + s * 0.4)
  doc.line(cx - s * 0.12, cy + s * 0.4, cx + s * 0.55, cy - s * 0.38)
  doc.setLineCap('butt')
  doc.setLineJoin('miter')
}

// ── Generador del PDF ────────────────────────────────────────────────────────

/**
 * Genera la Carta de Solvencia en formato CARTA con diseño a sangre completa
 * (encabezado y pie sin márgenes blancos). Datos sincronizados con el edificio.
 */
export function generarPDFSolvencia(datos: DatosCartaSolvencia): jsPDF {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' })
  const c = construirContenidoSolvencia(datos)
  const cw = PAGE_W - MX * 2
  const cx = PAGE_W / 2

  const HEADER_H = 44
  const FOOTER_TOP = 259.4

  // ── Marca de agua (sello de verificación muy tenue) ──
  // jsPDF aplica la opacidad del trazo con 'stroke-opacity' y la del relleno con 'opacity'.
  try {
    const GState = (doc as any).GState
    doc.setGState(new GState({ opacity: 0.05, 'stroke-opacity': 0.05 }))
    doc.setDrawColor(...C_GREEN)
    doc.setLineWidth(3)
    doc.circle(cx, 160, 50, 'S')
    doc.setLineWidth(0.9)
    doc.circle(cx, 160, 42, 'S')
    dibujarCheck(doc, cx, 160, 62, C_GREEN, 7)
    doc.setGState(new GState({ opacity: 1, 'stroke-opacity': 1 }))
  } catch {
    /* si el visor no soporta transparencia, se omite la marca de agua */
  }

  // ── Encabezado a sangre ──
  doc.setFillColor(...C_NAVY)
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F')
  doc.setFillColor(...C_NAVY2)
  doc.triangle(PAGE_W - 78, 0, PAGE_W, 0, PAGE_W, HEADER_H, 'F')
  doc.setFillColor(...C_ORANGE)
  doc.rect(0, HEADER_H, PAGE_W, 2.2, 'F')

  // Emblema (edificio)
  doc.setFillColor(...C_ORANGE)
  doc.roundedRect(MX, 12, 17, 17, 3.2, 3.2, 'F')
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(MX + 4.6, 15.6, 7.8, 10.4, 0.8, 0.8, 'F')
  doc.setFillColor(...C_ORANGE)
  const vx = [MX + 6.1, MX + 9.4]
  const vy = [17.4, 20.4]
  vx.forEach(x => vy.forEach(y => doc.rect(x, y, 1.4, 1.4, 'F')))
  doc.rect(MX + 7.6, 23.2, 1.8, 2.8, 'F')

  const textoX = MX + 23
  textoEspaciado(doc, c.etiquetaJunta, textoX, 16, { size: 7.5, color: C_ORANGE, bold: true, cs: 1.4 })

  doc.setFont('helvetica', 'bold')
  const fsNombre = ajustarFuente(doc, c.nombreEdificio, 92, 17, 10)
  doc.setFontSize(fsNombre)
  doc.setTextColor(255, 255, 255)
  doc.text(c.nombreEdificio, textoX, 25)

  if (c.direccion) {
    doc.setFont('helvetica', 'normal')
    const fsDir = ajustarFuente(doc, c.direccion, 100, 7.5, 5.5)
    doc.setFontSize(fsDir)
    doc.setTextColor(203, 213, 225)
    doc.text(c.direccion, textoX, 31)
  }
  if (c.rif) {
    textoEspaciado(doc, c.rif, textoX, 37.5, { size: 9.5, color: C_ORANGE, bold: true, cs: 0.3 })
  }

  // Bloque derecho: N° de constancia
  const rx = PAGE_W - MX
  textoEspaciado(doc, 'CONSTANCIA N°', rx, 16, { size: 6.5, color: [148, 163, 184], bold: true, cs: 0.8, align: 'right' })
  doc.setFont('helvetica', 'bold')
  const fsCod = ajustarFuente(doc, c.codigo, 56, 10, 7)
  doc.setFontSize(fsCod)
  doc.setTextColor(255, 255, 255)
  doc.text(c.codigo, rx, 23, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(203, 213, 225)
  doc.text(c.emitidaTxt, rx, 30, { align: 'right' })
  doc.text(c.vigenciaTxt, rx, 34.5, { align: 'right' })

  // ── Título ──
  textoEspaciado(doc, 'CONSTANCIA OFICIAL', cx, 57, { size: 7.5, color: C_ORANGE, bold: true, cs: 1.6, align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(23)
  doc.setTextColor(...C_NAVY)
  doc.text(c.titulo, cx, 68, { align: 'center' })
  doc.setFillColor(...C_ORANGE)
  doc.roundedRect(cx - 14, 72, 28, 1, 0.5, 0.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C_MUTED)
  doc.text(c.subtitulo, cx, 79, { align: 'center' })

  // ── Maquetación adaptable ──
  // Se miden todos los párrafos y se elige la tipografía más cómoda que quepa por encima
  // del sello inferior; el espacio sobrante se reparte entre los bloques para aprovechar la hoja.
  const filas = Math.ceil(c.celdas.length / 3)
  const cardH = 7 + (filas - 1) * 13 + 7.6 + 4.4
  const Y_INICIO = 88
  const FIRMA_FIN_MAX = 249 // firmas respiran naturalmente por encima del pie
  const GAPS_BASE = [7, 10, 4, 4, 12, 15] // P1→tarjeta, tarjeta→P2, P2→P3, P3→P4, P4→firma, firma→línea
  const opciones: Array<[number, number]> = [[10, 5.6], [10, 5.3], [9.6, 5.1], [9.2, 4.9], [8.8, 4.7]]

  let FS = opciones[opciones.length - 1][0]
  let LH = opciones[opciones.length - 1][1]
  let altoTotal = 0
  const sumaGaps = GAPS_BASE.reduce((a, b) => a + b, 0)
  for (const [fs, lh] of opciones) {
    const n = c.parrafos.map(p => maquetarParrafo(doc, p, cw, fs).lineas.length)
    const alto = n.reduce((a, k) => a + (k - 1), 0) * lh + 2 * lh + cardH + sumaGaps + 9.5
    FS = fs
    LH = lh
    altoTotal = alto
    if (Y_INICIO + alto <= FIRMA_FIN_MAX) break
  }
  const holgura = FIRMA_FIN_MAX - (Y_INICIO + altoTotal)
  const escala = holgura > 0 ? Math.min(1.7, 1 + holgura / sumaGaps) : 1
  const G = GAPS_BASE.map(g => g * escala)

  let y = Y_INICIO
  y = dibujarParrafo(doc, c.parrafos[0], MX, y, cw, FS, LH, C_SLATE) + G[0]

  // ── Tarjeta de resumen ──
  doc.setFillColor(...C_LIGHT)
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(MX, y, cw, cardH, 2.5, 2.5, 'FD')

  const colW = (cw - 12) / 3
  c.celdas.forEach((cel, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = MX + 6 + col * colW
    const y0 = y + 7 + row * 13
    textoEspaciado(doc, cel.label, x, y0, { size: 6, color: C_MUTED, bold: true, cs: 0.4 })

    doc.setFont('helvetica', 'bold')
    const fsVal = ajustarFuente(doc, cel.value, colW - 4, 9.5, 6.5)
    doc.setFontSize(fsVal)
    doc.setTextColor(...(cel.verde ? C_GREEN : C_NAVY))
    doc.text(cel.value, x, y0 + 4.5)

    if (cel.sub) {
      doc.setFont('helvetica', 'normal')
      const fsSub = ajustarFuente(doc, cel.sub, colW - 4, 7, 5.5)
      doc.setFontSize(fsSub)
      doc.setTextColor(...C_MUTED)
      doc.text(cel.sub, x, y0 + 8)
    }
  })
  y += cardH + G[1]

  // Resto de párrafos (separados por una línea de aire)
  y = dibujarParrafo(doc, c.parrafos[1], MX, y, cw, FS, LH, C_SLATE) + LH + G[2]
  y = dibujarParrafo(doc, c.parrafos[2], MX, y, cw, FS, LH, C_SLATE) + LH + G[3]
  y = dibujarParrafo(doc, c.parrafos[3], MX, y, cw, FS, LH, C_SLATE) + G[4]

  // ── Firmas ──
  textoEspaciado(doc, c.firmaIntro.toUpperCase(), cx, y, { size: 8, color: C_NAVY, bold: true, cs: 1, align: 'center' })
  const yFirma = y + G[5]
  const lineaW = 62
  const centros = [MX + 42, PAGE_W - MX - 42]
  c.firmas.forEach((f, i) => {
    const fx = centros[i]
    doc.setDrawColor(71, 85, 105)
    doc.setLineWidth(0.4)
    doc.line(fx - lineaW / 2, yFirma, fx + lineaW / 2, yFirma)

    doc.setFont('helvetica', 'bold')
    const fsN = ajustarFuente(doc, f.nombre, lineaW + 8, 9.5, 7)
    doc.setFontSize(fsN)
    doc.setTextColor(...C_NAVY)
    doc.text(f.nombre, fx, yFirma + 5, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...C_MUTED)
    doc.text(f.cargo, fx, yFirma + 9.5, { align: 'center' })
  })

  // ── Pie a sangre ──
  doc.setFillColor(...C_NAVY)
  doc.rect(0, FOOTER_TOP, PAGE_W, PAGE_H - FOOTER_TOP, 'F')
  doc.setFillColor(...C_ORANGE)
  doc.rect(0, FOOTER_TOP, PAGE_W, 1.2, 'F')

  textoEspaciado(doc, 'VALIDACIÓN DIGITAL', MX, 268, { size: 6, color: C_ORANGE, bold: true, cs: 0.8 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text(c.codigo, MX, 272.3)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(203, 213, 225)
  c.pieContacto.slice(0, 2).forEach((linea, i) => {
    doc.text(linea, PAGE_W - MX, 268 + i * 4.3, { align: 'right' })
  })

  doc.setFontSize(6.2)
  doc.setTextColor(148, 163, 184)
  doc.text(c.pieLegal, cx, 277, { align: 'center' })

  return doc
}

/** Descarga directamente el PDF de solvencia en el dispositivo. */
export function descargarSolvenciaPDF(datos: DatosCartaSolvencia): void {
  const doc = generarPDFSolvencia(datos)
  const cleanApto = (datos.residenteApto || 'Apto').replace(/[^a-zA-Z0-9_-]/g, '_')
  const mes = (datos.mesSolvente || 'Solvencia').toLowerCase()
  doc.save(`Carta_Solvencia_${cleanApto}_${mes}_${datos.anioSolvente}.pdf`)
}

/** Abre el PDF en una pestaña nueva para visualizar o imprimir. */
export function abrirSolvenciaPDF(datos: DatosCartaSolvencia): void {
  const doc = generarPDFSolvencia(datos)
  window.open(doc.output('bloburl'), '_blank')
}
