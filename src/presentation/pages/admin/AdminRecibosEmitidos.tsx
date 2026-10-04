import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { useAuth } from '../../../application/contexts/AuthContext'
import { registrarEventoAuditoria } from '../../../data/auditoriaService'
import { generarPDFRecibo, ReciboAptoData, ReciboGastoData, ReciboCargoData, ReciboConfigData } from '../../../utils/reciboPdfGenerator'
import { compararApartamentos, formatAlicuotaPct } from '../../../utils/alicuota'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { SkeletonCard, SkeletonChart, SkeletonTable } from '../../components/Skeleton'
import { generarMensajeCobroRecibo, generarMensajeReciboPagado, abrirWhatsApp } from '../../../utils/whatsappHelper'
import {
  despacharEmailPagoAprobado,
  despacharEmailRecordatorioRecibo,
  getBasePortalUrl
} from '../../../data/emailService'
import { generarInformeGestionPDF, DatosInformeGestion } from '../../../utils/informeGestionPdfGenerator'
import { esReciboIndexado } from '../../../utils/indexacionHelper'

interface ReciboEmitido {
  id: string
  apartamento_id: string
  mes_facturado: string
  tasa_bcv: number
  total_gastos_usd: number
  alicuota: number
  subtotal_usd: number
  fondo_reserva_pct: number
  fondo_reserva_usd: number
  cargos_extra_usd: number
  total_usd: number
  total_bs: number
  estado: 'pendiente' | 'pagado'
  es_indexado?: boolean
  data_json: {
    gastos?: Array<{ descripcion: string; monto_usd: number; monto_bs: number; categoria?: string }>
    cargos_especiales?: Array<{ tipo: string; descripcion: string; monto_usd: number; monto_bs?: number }>
    fondo_reserva_pct?: number
    notas_residentes?: string
    es_indexado?: boolean
    [key: string]: any
  } | null
  emitido_at: string
  // Datos unidos del apartamento y perfil
  apartamento?: {
    numero: string
    piso: number | null
    alicuota: number
    propietario_nombre: string | null
    propietario_email?: string | null
    telefono_contacto: string | null
  }
}

interface ConfigEdificio {
  nombre_edificio: string
  rif: string | null
  direccion: string | null
  dominio_email?: string | null
  email_contacto: string | null
  banco: string | null
  cuenta_bancaria: string | null
  titular_cuenta: string | null
  tasa_bcv_actual: number
  color_primario?: string | null
  fecha_inicio_gestion?: string | null
  fecha_fin_administracion_anterior?: string | null
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const fmtBs  = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const AdminRecibosEmitidos: React.FC = () => {
  const { perfil, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const mesParam = searchParams.get('mes')

  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(mesParam || '')
  const [recibos, setRecibos] = useState<ReciboEmitido[]>([])
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'pagado'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [reciboModal, setReciboModal] = useState<ReciboEmitido | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [cambiandoEstadoId, setCambiandoEstadoId] = useState<string | null>(null)

  // ── Estados para Administración Anterior o Meses No Indexados (Bolívares Fijos) ───────
  const fechaEntradaActual = (config?.fecha_inicio_gestion || '2026-09-01').slice(0, 7)
  const esMesHistorico = useMemo(() => {
    if (recibos.length > 0) {
      return !esReciboIndexado(recibos[0], config?.fecha_inicio_gestion)
    }
    return (mesSeleccionado || '').slice(0, 7) < fechaEntradaActual
  }, [mesSeleccionado, recibos, fechaEntradaActual, config?.fecha_inicio_gestion])

  const [modalBulkPagadosOpen, setModalBulkPagadosOpen] = useState(false)
  const [modalBulkMoraOpen, setModalBulkMoraOpen] = useState(false)
  const [ejecutandoBulk, setEjecutandoBulk] = useState(false)
  const [notificarEmailHistorico, setNotificarEmailHistorico] = useState(false)
  const [vistaModo, setVistaModo] = useState<'auto' | 'tabla' | 'tarjetas'>('auto')

  // ── Estados para "Retirar deuda o eliminar emisión" con Auditoría ──────────
  const [modalEliminarEmisionOpen, setModalEliminarEmisionOpen] = useState(false)
  const [motivoEliminarEmision, setMotivoEliminarEmision] = useState('')
  const [palabraConfirmacion, setPalabraConfirmacion] = useState('')
  const [eliminandoEmision, setEliminandoEmision] = useState(false)

  const [modalEliminarReciboOpen, setModalEliminarReciboOpen] = useState(false)
  const [reciboParaEliminar, setReciboParaEliminar] = useState<ReciboEmitido | null>(null)
  const [motivoEliminarRecibo, setMotivoEliminarRecibo] = useState('')
  const [eliminandoRecibo, setEliminandoRecibo] = useState(false)

  // ── Estados para Modal "Enviar Emails" (Automático / Manual con Excel) ─────────
  const [modalEnviarEmailsOpen, setModalEnviarEmailsOpen] = useState(false)
  const [pasoEmails, setPasoEmails] = useState<'mes' | 'modo' | 'automatico' | 'manual' | 'despacho' | 'resumen'>('mes')
  const [mesParaEmails, setMesParaEmails] = useState<string>('')
  const [recibosParaEmails, setRecibosParaEmails] = useState<ReciboEmitido[]>([])
  const [cargandoRecibosEmails, setCargandoRecibosEmails] = useState(false)
  const [emailsManuales, setEmailsManuales] = useState<Record<string, string>>({})
  const [nombresManuales, setNombresManuales] = useState<Record<string, string>>({})
  const [guardarEmailsEnPerfil, setGuardarEmailsEnPerfil] = useState(true)
  const [busquedaManual, setBusquedaManual] = useState('')
  const [despachandoEmails, setDespachandoEmails] = useState(false)
  const [progresoDespacho, setProgresoDespacho] = useState<{ actual: number; total: number; texto: string }>({ actual: 0, total: 0, texto: '' })
  const [logDespacho, setLogDespacho] = useState<Array<{ apto: string; email: string; ok: boolean; error?: string }>>([])
  const cancelarDespachoRef = useRef(false)
  const excelInputRef = useRef<HTMLInputElement | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // ── Cargar recibos completos para el mes seleccionado en el modal de emails ───
  const cargarRecibosParaModalEmails = useCallback(async (mes: string) => {
    if (!mes) return
    setCargandoRecibosEmails(true)
    try {
      if (mes === mesSeleccionado && recibos.length > 0) {
        setRecibosParaEmails(recibos)
        const iniciales: Record<string, string> = {}
        recibos.forEach(r => {
          if (r.apartamento?.propietario_email) {
            iniciales[r.apartamento_id] = r.apartamento.propietario_email
          }
        })
        setEmailsManuales(iniciales)
        return
      }

      const [recibosRes, aptosRes, perfilesRes] = await Promise.all([
        supabase.from('recibos_generados').select('*').eq('mes_facturado', mes),
        supabase.from('apartamentos').select('id, numero, piso, alicuota, propietario_nombre, telefono_contacto'),
        supabase.from('perfiles').select('id, apartamento_id, nombre_completo, condicion_habitacional, propietario_nombre, telefono, propietario_email')
      ])

      const aptosMap = new Map<string, any>()
      aptosRes.data?.forEach(a => aptosMap.set(a.id, a))

      const perfilesMap = new Map<string, any>()
      perfilesRes.data?.forEach(p => {
        if (p.apartamento_id) {
          const exist = perfilesMap.get(p.apartamento_id)
          if (!exist || (!exist.propietario_email && p.propietario_email)) {
            perfilesMap.set(p.apartamento_id, p)
          }
        }
      })

      const recibosCompletos: ReciboEmitido[] = (recibosRes.data || []).map(r => {
        const aptoBase = aptosMap.get(r.apartamento_id)
        const perfil = perfilesMap.get(r.apartamento_id)
        const propNombre = (perfil?.condicion_habitacional === 'alquilado' && perfil?.propietario_nombre)
          ? perfil.propietario_nombre
          : (perfil?.nombre_completo || aptoBase?.propietario_nombre || null)
        const telefono = perfil?.telefono || aptoBase?.telefono_contacto || null
        const email = perfil?.propietario_email || null

        return {
          ...r,
          apartamento: {
            numero: aptoBase?.numero || 'S/N',
            piso: aptoBase?.piso ?? null,
            alicuota: aptoBase?.alicuota || r.alicuota,
            propietario_nombre: propNombre,
            propietario_email: email,
            telefono_contacto: telefono
          }
        }
      })

      recibosCompletos.sort((a, b) => compararApartamentos(a.apartamento?.numero || '', b.apartamento?.numero || ''))
      setRecibosParaEmails(recibosCompletos)

      const inicialesEmails: Record<string, string> = {}
      const inicialesNombres: Record<string, string> = {}
      recibosCompletos.forEach(r => {
        if (r.apartamento?.propietario_email) {
          inicialesEmails[r.apartamento_id] = r.apartamento.propietario_email
        }
        if (r.apartamento?.propietario_nombre) {
          inicialesNombres[r.apartamento_id] = r.apartamento.propietario_nombre
        }
      })
      setEmailsManuales(inicialesEmails)
      setNombresManuales(inicialesNombres)
    } finally {
      setCargandoRecibosEmails(false)
    }
  }, [mesSeleccionado, recibos])

  const handleAbrirModalEnviarEmails = async () => {
    const mesInicial = mesSeleccionado || (mesesDisponibles.length > 0 ? mesesDisponibles[0] : '')
    setMesParaEmails(mesInicial)
    setPasoEmails('mes')
    setLogDespacho([])
    setBusquedaManual('')
    setModalEnviarEmailsOpen(true)
    if (mesInicial) {
      await cargarRecibosParaModalEmails(mesInicial)
    }
  }

  // ── Helper para normalizar identificadores de apartamentos en Excel ─────────
  const normalizarCadenaApto = (s: string) => {
    return String(s || '')
      .toLowerCase()
      .replace(/^(apto|apartamento|unidad|inmueble|depto|piso)[\s\.\-]*/i, '')
      .replace(/[^a-z0-9]/gi, '')
  }

  // ── Importador inteligente de correos desde Excel (.xlsx, .xls, .csv) ───────
  const handleCargarExcelEmails = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

        if (!rows || rows.length === 0) {
          alert('El archivo Excel no contiene filas con datos.')
          return
        }

        let coincidencias = 0
        const nuevoMapaEmails = { ...emailsManuales }
        const nuevoMapaNombres = { ...nombresManuales }

        rows.forEach((row) => {
          let aptoStr = ''
          let emailStr = ''
          let nombreStr = ''

          for (const key of Object.keys(row)) {
            const keyLower = key.toLowerCase()
            if (
              keyLower.includes('apto') ||
              keyLower.includes('apartamento') ||
              keyLower.includes('unidad') ||
              keyLower.includes('inmueble') ||
              keyLower.includes('depto') ||
              keyLower.includes('numero') ||
              keyLower.includes('nro')
            ) {
              aptoStr = String(row[key] || '')
              break
            }
          }

          for (const key of Object.keys(row)) {
            const keyLower = key.toLowerCase()
            if (
              keyLower.includes('nombre') ||
              keyLower.includes('propietario') ||
              keyLower.includes('residente') ||
              keyLower.includes('titular') ||
              keyLower.includes('inquilino') ||
              keyLower.includes('destinatario')
            ) {
              nombreStr = String(row[key] || '').trim()
              break
            }
          }

          for (const key of Object.keys(row)) {
            const keyLower = key.toLowerCase()
            const valStr = String(row[key] || '').trim()
            if (
              keyLower.includes('email') ||
              keyLower.includes('correo') ||
              keyLower.includes('mail')
            ) {
              emailStr = valStr
              break
            } else if (!emailStr && valStr.includes('@')) {
              emailStr = valStr
            }
          }

          if (!aptoStr || !emailStr) {
            const values = Object.values(row)
            if (values.length >= 2) {
              if (!aptoStr) aptoStr = String(values[0] || '')
              if (!emailStr) {
                const mailCandidate = values.find(v => String(v || '').includes('@'))
                if (mailCandidate) emailStr = String(mailCandidate).trim()
                else emailStr = String(values[1] || '').trim()
              }
            }
          }

          if (aptoStr && emailStr && emailStr.includes('@')) {
            const normExcel = normalizarCadenaApto(aptoStr)
            const match = recibosParaEmails.find(r => {
              const normApto = normalizarCadenaApto(r.apartamento?.numero || '')
              return normApto === normExcel
            })

            if (match) {
              nuevoMapaEmails[match.apartamento_id] = emailStr
              if (nombreStr) {
                nuevoMapaNombres[match.apartamento_id] = nombreStr
              }
              coincidencias++
            }
          }
        })

        setEmailsManuales(nuevoMapaEmails)
        setNombresManuales(nuevoMapaNombres)
        if (coincidencias > 0) {
          showToast(`✅ Se asignaron ${coincidencias} registros exitosamente desde el archivo Excel.`)
        } else {
          alert('No se encontraron coincidencias entre los números de apartamento del Excel y los apartamentos de este mes. Asegúrate de incluir columnas como "Apartamento" y "Correo".')
        }
      } catch (err: any) {
        console.error('Error leyendo Excel:', err)
        alert('Error al leer el archivo Excel: ' + (err.message || 'Formato no soportado.'))
      } finally {
        if (excelInputRef.current) excelInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Generador y descargador de plantilla Excel en 1 Clic ───────────────────
  const handleDescargarPlantillaExcel = () => {
    const rows = recibosParaEmails.map(r => ({
      'Apartamento': r.apartamento?.numero || '',
      'Nombre / Propietario': nombresManuales[r.apartamento_id] || r.apartamento?.propietario_nombre || '',
      'Correo Electrónico': emailsManuales[r.apartamento_id] || r.apartamento?.propietario_email || '',
      'Total USD': r.total_usd,
      'Total Bs': r.total_bs
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 30 },
      { wch: 38 },
      { wch: 14 },
      { wch: 16 }
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Correos Apartamentos')
    XLSX.writeFile(workbook, `Plantilla_Correos_Aptos_${mesParaEmails || 'Emision'}.xlsx`)
  }

  // ── Despachador de correos masivos con descarga directa y recordatorio ─────
  const ejecutarDespachoEmails = async (destinatarios: Array<{ recibo: ReciboEmitido; email: string; nombre?: string }>) => {
    if (destinatarios.length === 0) {
      alert('No hay destinatarios con correo electrónico válido para enviar.')
      return
    }

    setDespachandoEmails(true)
    setPasoEmails('despacho')
    cancelarDespachoRef.current = false
    setProgresoDespacho({ actual: 0, total: destinatarios.length, texto: 'Iniciando despacho...' })
    setLogDespacho([])

    const [anioStr, mesNumStr] = (mesParaEmails || '').split('-')
    const anio = parseInt(anioStr) || new Date().getFullYear()
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    const mesLabel = MESES[mesIndex] || 'Mes'
    const portalUrl = getBasePortalUrl()

    const nuevosLogs: Array<{ apto: string; email: string; ok: boolean; error?: string }> = []

    for (let i = 0; i < destinatarios.length; i++) {
      if (cancelarDespachoRef.current) {
        showToast('⏹️ Despacho de correos detenido por el usuario.')
        break
      }

      const item = destinatarios[i]
      const aptoNum = item.recibo.apartamento?.numero || 'S/N'
      setProgresoDespacho({
        actual: i + 1,
        total: destinatarios.length,
        texto: `Enviando recibo de Apto. ${aptoNum} a ${item.email}...`
      })

      try {
        const tasaBcv = (item.recibo.tasa_bcv && item.recibo.tasa_bcv > 1)
          ? item.recibo.tasa_bcv
          : (config?.tasa_bcv_actual || 859.06)

        const res = await despacharEmailRecordatorioRecibo({
          destinatarioEmail: item.email.trim(),
          apartamentoNumero: aptoNum,
          propietarioNombre: item.nombre || item.recibo.apartamento?.propietario_nombre,
          edificioNombre: config?.nombre_edificio,
          mesLabel,
          anio,
          totalUsd: item.recibo.total_usd,
          totalBs: item.recibo.total_bs,
          tasaBcv,
          alicuotaPct: formatAlicuotaPct(item.recibo.alicuota),
          reciboId: item.recibo.id,
          bancoNombre: config?.banco,
          cuentaNumero: config?.cuenta_bancaria,
          titularNombre: config?.titular_cuenta,
          cedulaRif: config?.rif,
          cedula_cuenta: (config as any)?.cedula_cuenta,
          tipo_cuenta: (config as any)?.tipo_cuenta,
          pago_movil_banco: (config as any)?.pago_movil_banco,
          pago_movil_cedula: (config as any)?.pago_movil_cedula,
          pago_movil_telefono: (config as any)?.pago_movil_telefono,
          zelle_email: (config as any)?.zelle_email,
          portalUrl,
          colorPrimario: config?.color_primario
        })

        if (res.ok && guardarEmailsEnPerfil && item.recibo.apartamento_id) {
          try {
            await supabase
              .from('perfiles')
              .update({ propietario_email: item.email.trim() })
              .eq('apartamento_id', item.recibo.apartamento_id)
          } catch {}
        }

        nuevosLogs.push({
          apto: aptoNum,
          email: item.email,
          ok: res.ok,
          error: res.error
        })
      } catch (err: any) {
        nuevosLogs.push({
          apto: aptoNum,
          email: item.email,
          ok: false,
          error: err.message || 'Error inesperado de red'
        })
      }

      setLogDespacho([...nuevosLogs])

      if (i < destinatarios.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    setDespachandoEmails(false)
    setPasoEmails('resumen')

    try {
      const exitosos = nuevosLogs.filter(l => l.ok).length
      registrarEventoAuditoria({
        tipo_accion: 'ENVIO_EMAILS_MASIVO',
        titulo: `Envío Masivo de Correos — ${mesParaEmails}`,
        descripcion: `Se despacharon ${exitosos} correos exitosamente para el período ${mesParaEmails}.`,
        mes_afectado: mesParaEmails,
        motivo: 'Recordatorio y notificación de recibos emitida por administración',
        autor_nombre: perfil?.nombre_completo || 'Administrador',
        autor_email: user?.email || (perfil as any)?.email || config?.email_contacto || null,
        datos_nuevos: {
          mes: mesParaEmails,
          total_destinatarios: destinatarios.length,
          exitosos,
          fallidos: destinatarios.length - exitosos,
          guardado_en_perfiles: guardarEmailsEnPerfil
        }
      })
    } catch {}
  }

  // ── 1. Cargar meses con recibos emitidos y configuración ──────────────────
  const cargarMeses = useCallback(async () => {
    setLoading(true)
    try {
      const [configRes, recibosMesesRes] = await Promise.all([
        supabase.from('configuracion_edificio').select('*').limit(1).maybeSingle(),
        supabase.from('recibos_generados').select('mes_facturado').order('mes_facturado', { ascending: false })
      ])

      if (configRes.data) setConfig(configRes.data)

      if (recibosMesesRes.data && recibosMesesRes.data.length > 0) {
        const unicos = Array.from(new Set(recibosMesesRes.data.map(r => r.mes_facturado)))
        setMesesDisponibles(unicos)
        if (mesParam && unicos.includes(mesParam)) {
          setMesSeleccionado(mesParam)
        } else if (!mesSeleccionado || !unicos.includes(mesSeleccionado)) {
          setMesSeleccionado(unicos[0])
        }
      } else {
        setMesesDisponibles([])
      }
    } finally {
      setLoading(false)
    }
  }, [mesSeleccionado, mesParam])

  useEffect(() => {
    cargarMeses()
  }, [cargarMeses])

  // ── 2. Cargar recibos completos del mes seleccionado ─────────────────────
  const cargarRecibosDelMes = useCallback(async () => {
    if (!mesSeleccionado) return
    setLoading(true)
    try {
      const [recibosRes, aptosRes, perfilesRes] = await Promise.all([
        supabase.from('recibos_generados').select('*').eq('mes_facturado', mesSeleccionado),
        supabase.from('apartamentos').select('id, numero, piso, alicuota, propietario_nombre, telefono_contacto'),
        supabase.from('perfiles').select('id, apartamento_id, nombre_completo, condicion_habitacional, propietario_nombre, telefono, propietario_email')
      ])

      const aptosMap = new Map<string, any>()
      aptosRes.data?.forEach(a => aptosMap.set(a.id, a))

      const perfilesMap = new Map<string, any>()
      perfilesRes.data?.forEach(p => {
        if (p.apartamento_id) {
          const exist = perfilesMap.get(p.apartamento_id)
          if (!exist || (!exist.propietario_email && p.propietario_email)) {
            perfilesMap.set(p.apartamento_id, p)
          }
        }
      })

      const recibosCompletos: ReciboEmitido[] = (recibosRes.data || []).map(r => {
        const aptoBase = aptosMap.get(r.apartamento_id)
        const perfil = perfilesMap.get(r.apartamento_id)

        const propNombre = (perfil?.condicion_habitacional === 'alquilado' && perfil?.propietario_nombre)
          ? perfil.propietario_nombre
          : (perfil?.nombre_completo || aptoBase?.propietario_nombre || null)

        const telefono = perfil?.telefono || aptoBase?.telefono_contacto || null
        const email = perfil?.propietario_email || null

        return {
          ...r,
          apartamento: {
            numero: aptoBase?.numero || 'S/N',
            piso: aptoBase?.piso ?? null,
            alicuota: aptoBase?.alicuota || r.alicuota,
            propietario_nombre: propNombre,
            propietario_email: email,
            telefono_contacto: telefono
          }
        }
      })

      // Ordenar por número de apartamento
      recibosCompletos.sort((a, b) => compararApartamentos(a.apartamento?.numero || '', b.apartamento?.numero || ''))
      setRecibos(recibosCompletos)
    } finally {
      setLoading(false)
    }
  }, [mesSeleccionado])

  useEffect(() => {
    if (mesSeleccionado) cargarRecibosDelMes()
  }, [mesSeleccionado, cargarRecibosDelMes])

  // ── 3. Alternar estado Pagado / Pendiente ─────────────────────────────────
  const cambiarEstadoRecibo = async (recibo: ReciboEmitido) => {
    const nuevoEstado = recibo.estado === 'pendiente' ? 'pagado' : 'pendiente'
    setCambiandoEstadoId(recibo.id)
    try {
      const { error } = await supabase
        .from('recibos_generados')
        .update({ estado: nuevoEstado })
        .eq('id', recibo.id)

      if (error) {
        showToast(`❌ Error: ${error.message}`)
      } else {
        setRecibos(prev => prev.map(r => r.id === recibo.id ? { ...r, estado: nuevoEstado } : r))
        appCache.invalidateTags(['recibos', 'saldos', 'mora'])
        showToast(`✅ Recibo Apto ${recibo.apartamento?.numero} marcado como ${nuevoEstado.toUpperCase()}`)

        // Auditoría automática para modificaciones de recibos históricos
        if (esMesHistorico) {
          registrarEventoAuditoria({
            tipo_accion: 'HISTORICO_CAMBIO_ESTADO',
            titulo: `Apto ${recibo.apartamento?.numero || 'S/N'}: Marcado como ${nuevoEstado.toUpperCase()}`,
            descripcion: `Actualización de recibo histórico de la administración anterior para el mes ${mesLabelActivo}. Estado asignado: ${nuevoEstado.toUpperCase()}.`,
            apartamento_numero: recibo.apartamento?.numero,
            apartamento_id: recibo.apartamento_id,
            mes_afectado: recibo.mes_facturado,
            monto_usd: recibo.total_usd,
            monto_bs: recibo.total_bs,
            motivo: 'Carga histórica de administración anterior',
            autor_nombre: perfil?.nombre_completo || 'Administrador',
            autor_email: (perfil as any)?.email || config?.email_contacto || null
          }).catch(err => console.warn('[Auditoria] Error:', err))
        }

        // Si cambió a pagado, enviar automáticamente constancia de solvencia y agradecimiento por email
        // Para meses históricos, solo se despacha si la opción 'notificarEmailHistorico' está activada
        if (nuevoEstado === 'pagado' && (!esMesHistorico || notificarEmailHistorico)) {
          const aptoNum = recibo.apartamento?.numero || 'S/N'
          const dispatchSolvencia = (correo: string) => {
            despacharEmailPagoAprobado({
              destinatarioEmail: correo,
              apartamentoNumero: aptoNum,
              propietarioNombre: recibo.apartamento?.propietario_nombre,
              edificioNombre: config?.nombre_edificio,
              montoUsd: recibo.total_usd,
              montoBs: recibo.total_bs
            }).then(res => {
              if (res.ok) showToast(`✅ Correo de solvencia despachado a ${correo}`)
            }).catch(err => console.warn('[AdminRecibosEmitidos] Error despachando email pago aprobado:', err))
          }

          if (recibo.apartamento?.propietario_email && recibo.apartamento.propietario_email.includes('@')) {
            dispatchSolvencia(recibo.apartamento.propietario_email)
          } else if (recibo.apartamento_id) {
            supabase
              .from('perfiles')
              .select('propietario_email')
              .eq('apartamento_id', recibo.apartamento_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data?.propietario_email && data.propietario_email.includes('@')) {
                  dispatchSolvencia(data.propietario_email)
                }
              })
          }
        }
      }
    } finally {
      setCambiandoEstadoId(null)
    }
  }

  // ── 3.1 Cambio masivo de estado para regularización histórica ──────────────
  const ejecutarBulkEstado = async (nuevoEstado: 'pagado' | 'pendiente') => {
    if (!mesSeleccionado || recibos.length === 0) return
    setEjecutandoBulk(true)
    try {
      const { error } = await supabase
        .from('recibos_generados')
        .update({ estado: nuevoEstado })
        .eq('mes_facturado', mesSeleccionado)

      if (error) {
        showToast(`❌ Error al actualizar en lote: ${error.message}`)
        return
      }

      setRecibos(prev => prev.map(r => ({ ...r, estado: nuevoEstado })))
      appCache.invalidateTags(['recibos', 'saldos', 'mora'])
      showToast(`✅ Todos los recibos de ${mesLabelActivo} marcados como ${nuevoEstado === 'pagado' ? 'PAGADOS' : 'EN MORA'}`)

      // Registrar auditoría del cambio masivo
      await registrarEventoAuditoria({
        tipo_accion: 'HISTORICO_BULK_ESTADO',
        titulo: `Cambio Masivo de Estado: Todos ${nuevoEstado.toUpperCase()} (${mesLabelActivo})`,
        descripcion: `Se actualizaron masivamente los ${recibos.length} recibos del mes histórico ${mesLabelActivo} al estado ${nuevoEstado.toUpperCase()} por regularización de la administración anterior.`,
        mes_afectado: mesSeleccionado,
        monto_usd: nuevoEstado === 'pagado' ? stats.totalFacturadoUsd : 0,
        monto_bs: nuevoEstado === 'pagado' ? stats.totalFacturadoBs : 0,
        motivo: `Carga masiva histórica - Administración anterior (${nuevoEstado})`,
        autor_nombre: perfil?.nombre_completo || 'Administrador',
        autor_email: (perfil as any)?.email || config?.email_contacto || null
      }).catch(err => console.warn('[Auditoria] Error:', err))

      setModalBulkPagadosOpen(false)
      setModalBulkMoraOpen(false)
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
    } finally {
      setEjecutandoBulk(false)
    }
  }

  // ── 3.2 Cambio de Modalidad del Mes (Indexado al Dólar vs Bolívares Fijos) ──
  const [cambiandoModalidad, setCambiandoModalidad] = useState(false)
  const ejecutarCambioModalidadMes = async (nuevoIndexado: boolean) => {
    if (!mesSeleccionado || recibos.length === 0) return
    setCambiandoModalidad(true)
    try {
      for (const r of recibos) {
        await supabase
          .from('recibos_generados')
          .update({
            es_indexado: nuevoIndexado,
            data_json: { ...(r.data_json || {}), es_indexado: nuevoIndexado }
          })
          .eq('id', r.id)
      }

      setRecibos(prev => prev.map(r => ({
        ...r,
        es_indexado: nuevoIndexado,
        data_json: { ...(r.data_json || {}), es_indexado: nuevoIndexado }
      })))

      appCache.invalidateTags(['recibos', 'saldos', 'mora'])
      showToast(`✅ Modalidad de ${mesLabelActivo} cambiada a: ${nuevoIndexado ? 'Indexado al Dólar (BCV)' : 'No Indexado (Bolívares Fijos)'}`)
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
    } finally {
      setCambiandoModalidad(false)
    }
  }

  // ── 4. Cálculos y Estadísticas de Cartera y Mora ──────────────────────────
  const stats = useMemo(() => {
    const totalRecibos = recibos.length
    if (totalRecibos === 0) {
      return {
        totalFacturadoUsd: 0,
        totalFacturadoBs: 0,
        totalCobradoUsd: 0,
        totalCobradoBs: 0,
        totalMoraUsd: 0,
        totalMoraBs: 0,
        pctRecaudado: 0,
        pctMora: 0,
        cantSolventes: 0,
        cantMorosos: 0,
        fondoReservaUsd: 0,
        fondoReservaBs: 0,
        totalGastosComunesUsd: 0,
        totalGastosComunesBs: 0,
        gastosPorCategoria: [] as Array<{ categoria: string; totalUsd: number; totalBs: number; pct: number }>,
        moraPorPiso: [] as Array<{ piso: string; morosos: number; solventes: number; totalMoraUsd: number }>
      }
    }

    const totalFacturadoUsd = recibos.reduce((s, r) => s + Number(r.total_usd || 0), 0)
    const totalFacturadoBs  = recibos.reduce((s, r) => s + Number(r.total_bs || 0), 0)

    const solventes = recibos.filter(r => r.estado === 'pagado')
    const morosos   = recibos.filter(r => r.estado === 'pendiente')

    const totalCobradoUsd = solventes.reduce((s, r) => s + Number(r.total_usd || 0), 0)
    const totalCobradoBs  = solventes.reduce((s, r) => s + Number(r.total_bs || 0), 0)

    const totalMoraUsd = morosos.reduce((s, r) => s + Number(r.total_usd || 0), 0)
    const totalMoraBs  = morosos.reduce((s, r) => s + Number(r.total_bs || 0), 0)

    const pctRecaudado = totalFacturadoUsd > 0 ? Math.round((totalCobradoUsd / totalFacturadoUsd) * 100) : 0
    const pctMora      = 100 - pctRecaudado

    // Fondo de reserva del mes
    const fondoReservaUsd = recibos[0]?.total_gastos_usd * ((recibos[0]?.fondo_reserva_pct || 10) / 100) || 0
    const fondoReservaBs  = (recibos[0]?.total_bs || 0) * 0.1 // Referencial

    const totalGastosComunesUsd = recibos[0]?.total_gastos_usd || 0
    const totalGastosComunesBs  = (recibos[0]?.data_json?.gastos || []).reduce((s, g) => s + (g.monto_bs || 0), 0)

    // Agrupación de gastos por categoría
    const gastosSample = recibos[0]?.data_json?.gastos || []
    const catMap = new Map<string, { totalUsd: number; totalBs: number }>()

    gastosSample.forEach(g => {
      let cat = g.categoria || 'Mantenimiento'
      const desc = g.descripcion.toLowerCase()
      if (desc.includes('limpieza') || desc.includes('aseo') || desc.includes('basura')) cat = 'Limpieza y Aseo'
      else if (desc.includes('ascensor') || desc.includes('rolinera') || desc.includes('freno')) cat = 'Ascensores'
      else if (desc.includes('corpoelec') || desc.includes('hidrocapital') || desc.includes('luz') || desc.includes('agua')) cat = 'Servicios Básicos'
      else if (desc.includes('platabanda') || desc.includes('filtracion') || desc.includes('techo') || desc.includes('obra')) cat = 'Infraestructura'
      else if (desc.includes('lampara') || desc.includes('faro') || desc.includes('porton')) cat = 'Áreas Comunes'
      else if (desc.includes('administracion') || desc.includes('bancaria') || desc.includes('copia')) cat = 'Administrativos'

      if (!catMap.has(cat)) catMap.set(cat, { totalUsd: 0, totalBs: 0 })
      const item = catMap.get(cat)!
      item.totalUsd += g.monto_usd || 0
      item.totalBs  += g.monto_bs || 0
    })

    const gastosPorCategoria = Array.from(catMap.entries()).map(([categoria, vals]) => ({
      categoria,
      totalUsd: vals.totalUsd,
      totalBs: vals.totalBs,
      pct: totalGastosComunesUsd > 0 ? Math.round((vals.totalUsd / totalGastosComunesUsd) * 100) : 0
    })).sort((a, b) => b.totalUsd - a.totalUsd)

    // Agrupación de mora por piso
    const pisosMap = new Map<string, { morosos: number; solventes: number; totalMoraUsd: number }>()
    recibos.forEach(r => {
      let pisoLabel = `Piso ${r.apartamento?.piso || 'S/P'}`
      if (r.apartamento?.numero.toUpperCase().includes('PH')) pisoLabel = 'Pisos PH'

      if (!pisosMap.has(pisoLabel)) pisosMap.set(pisoLabel, { morosos: 0, solventes: 0, totalMoraUsd: 0 })
      const p = pisosMap.get(pisoLabel)!
      if (r.estado === 'pendiente') {
        p.morosos++
        p.totalMoraUsd += Number(r.total_usd || 0)
      } else {
        p.solventes++
      }
    })

    const moraPorPiso = Array.from(pisosMap.entries()).map(([piso, d]) => ({
      piso,
      morosos: d.morosos,
      solventes: d.solventes,
      totalMoraUsd: d.totalMoraUsd
    })).sort((a, b) => a.piso.localeCompare(b.piso, undefined, { numeric: true }))

    return {
      totalFacturadoUsd,
      totalFacturadoBs,
      totalCobradoUsd,
      totalCobradoBs,
      totalMoraUsd,
      totalMoraBs,
      pctRecaudado,
      pctMora,
      cantSolventes: solventes.length,
      cantMorosos: morosos.length,
      fondoReservaUsd,
      fondoReservaBs,
      totalGastosComunesUsd,
      totalGastosComunesBs,
      gastosPorCategoria,
      moraPorPiso
    }
  }, [recibos])

  // Label amigable del mes
  const mesLabelActivo = useMemo(() => {
    if (!mesSeleccionado) return 'Sin emisión'
    const [a, m] = mesSeleccionado.split('-')
    const idx = (parseInt(m) || 1) - 1
    return `${MESES[idx]} ${a}`
  }, [mesSeleccionado])

  // ── 5. Recibos filtrados por búsqueda y estado ───────────────────────────
  const recibosFiltrados = useMemo(() => {
    return recibos.filter(r => {
      if (filtroEstado === 'pendiente' && r.estado !== 'pendiente') return false
      if (filtroEstado === 'pagado' && r.estado !== 'pagado') return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchApto = (r.apartamento?.numero || '').toLowerCase().includes(q)
        const matchNombre = (r.apartamento?.propietario_nombre || '').toLowerCase().includes(q)
        if (!matchApto && !matchNombre) return false
      }
      return true
    })
  }, [recibos, filtroEstado, busqueda])

  // ── 6. Descargar PDF individual de un recibo ya emitido ───────────────────
  const descargarPDFReciboEmitido = (r: ReciboEmitido) => {
    if (!config) return
    const [anioStr, mesNumStr] = (r.mes_facturado || '').split('-')
    const anio = parseInt(anioStr) || 2026
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    const mesLabel = MESES[mesIndex] || 'Mes'

    const aptoData: ReciboAptoData = {
      id: r.apartamento_id,
      numero: r.apartamento?.numero || 'S/N',
      alicuota: r.alicuota,
      propietario_nombre: r.apartamento?.propietario_nombre || null
    }

    const gastos: ReciboGastoData[] = (r.data_json?.gastos || []).map(g => ({
      descripcion: g.descripcion,
      monto_usd: g.monto_usd,
      monto_bs: g.monto_bs,
      categoria: g.categoria
    }))

    const cargos: ReciboCargoData[] = (r.data_json?.cargos_especiales || []).map(c => ({
      tipo: c.tipo,
      descripcion: c.descripcion,
      monto_usd: c.monto_usd,
      monto_bs: c.monto_bs
    }))

    const configData: ReciboConfigData = {
      nombre_edificio: config.nombre_edificio,
      rif: config.rif,
      direccion: config.direccion,
      email_contacto: config.email_contacto,
      banco: config.banco,
      cuenta_bancaria: config.cuenta_bancaria,
      titular_cuenta: config.titular_cuenta
    }

    const esHistoricoRecibo = !esReciboIndexado(r, config?.fecha_inicio_gestion)

    const doc = generarPDFRecibo(
      aptoData,
      gastos,
      cargos,
      configData,
      r.fondo_reserva_pct || 10,
      mesLabel,
      anio,
      r.data_json?.notas_residentes,
      r.estado === 'pagado' ? {
        estado: 'pagado',
        monto_bs: r.total_bs,
        monto_usd: r.total_usd,
        referencia: esHistoricoRecibo ? 'REGISTRO HISTÓRICO' : undefined,
        banco: esHistoricoRecibo ? 'Administración Anterior' : undefined,
        banco_origen: esHistoricoRecibo ? 'Administración Anterior' : undefined,
      } : undefined
    )

    doc.save(`Recibo_Apto${r.apartamento?.numero}_${mesLabel}${anio}.pdf`)
  }

  // ── 6.1 Enviar Notificación o Cobranza por WhatsApp (1 Clic) ─────────────
  const handleWhatsAppRecibo = (r: ReciboEmitido) => {
    const [anioStr, mesNumStr] = (r.mes_facturado || '').split('-')
    const anio = parseInt(anioStr) || 2026
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    const mesLabel = MESES[mesIndex] || 'Mes'
    const tel = r.apartamento?.telefono_contacto || null

    if (r.estado === 'pagado') {
      const msg = generarMensajeReciboPagado({
        edificioNombre: config?.nombre_edificio,
        apartamentoNumero: r.apartamento?.numero || 'S/N',
        propietarioNombre: r.apartamento?.propietario_nombre,
        telefono: tel,
        mesLabel,
        anio,
        totalUsd: r.total_usd,
        totalBs: r.total_bs
      })
      abrirWhatsApp({ telefono: tel, mensaje: msg })
    } else {
      const msg = generarMensajeCobroRecibo({
        edificioNombre: config?.nombre_edificio,
        apartamentoNumero: r.apartamento?.numero || 'S/N',
        propietarioNombre: r.apartamento?.propietario_nombre,
        telefono: tel,
        mesLabel,
        anio,
        totalUsd: r.total_usd,
        totalBs: r.total_bs,
        tasaBcv: (r.tasa_bcv && r.tasa_bcv > 1 ? r.tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (r.total_usd > 0 ? parseFloat((r.total_bs / r.total_usd).toFixed(4)) : 859.06))),
        alicuotaPct: formatAlicuotaPct(r.alicuota),
        bancoNombre: config?.banco,
        cuentaNumero: config?.cuenta_bancaria,
        titularNombre: config?.titular_cuenta,
        cedulaRif: config?.rif,
        telefonoPagoMovil: tel
      })
      abrirWhatsApp({ telefono: tel, mensaje: msg })
    }
  }

  // ── 6.2 Enviar Notificación o Constancia por Correo Electrónico ───────────
  const [enviandoEmailId, setEnviandoEmailId] = useState<string | null>(null)
  const handleEmailRecibo = async (r: ReciboEmitido) => {
    const [anioStr, mesNumStr] = (r.mes_facturado || '').split('-')
    const anio = parseInt(anioStr) || 2026
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    const mesLabel = MESES[mesIndex] || 'Mes'
    const aptoNum = r.apartamento?.numero || 'S/N'
    const emailDestino = r.apartamento?.propietario_email

    if (!emailDestino || !emailDestino.includes('@')) {
      showToast(`⚠️ El Apto. ${aptoNum} aún no tiene un correo de propietario registrado en su cuenta.`)
      return
    }

    setEnviandoEmailId(r.id)
    try {
      if (r.estado === 'pagado') {
        const res = await despacharEmailPagoAprobado({
          destinatarioEmail: emailDestino,
          apartamentoNumero: aptoNum,
          propietarioNombre: r.apartamento?.propietario_nombre,
          edificioNombre: config?.nombre_edificio,
          mesLabel,
          anio,
          montoUsd: r.total_usd,
          montoBs: r.total_bs
        })
        if (res.ok) {
          showToast(`✅ Constancia de solvencia enviada al correo del propietario (${emailDestino})`)
        } else {
          showToast(`⚠️ No se pudo enviar el correo: ${res.error || 'Error desconocido'}`)
        }
      } else {
        const res = await despacharEmailRecordatorioRecibo({
          destinatarioEmail: emailDestino,
          apartamentoNumero: aptoNum,
          propietarioNombre: r.apartamento?.propietario_nombre,
          edificioNombre: config?.nombre_edificio,
          mesLabel,
          anio,
          totalUsd: r.total_usd,
          totalBs: r.total_bs,
          tasaBcv: (r.tasa_bcv && r.tasa_bcv > 1 ? r.tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : (r.total_usd > 0 ? parseFloat((r.total_bs / r.total_usd).toFixed(4)) : 859.06))),
          alicuotaPct: formatAlicuotaPct(r.alicuota),
          reciboId: r.id,
          bancoNombre: config?.banco,
          cuentaNumero: config?.cuenta_bancaria,
          titularNombre: config?.titular_cuenta,
          cedulaRif: config?.rif,
          cedula_cuenta: (config as any)?.cedula_cuenta,
          tipo_cuenta: (config as any)?.tipo_cuenta,
          pago_movil_banco: (config as any)?.pago_movil_banco,
          pago_movil_cedula: (config as any)?.pago_movil_cedula,
          pago_movil_telefono: (config as any)?.pago_movil_telefono,
          zelle_email: (config as any)?.zelle_email,
          portalUrl: getBasePortalUrl(),
          colorPrimario: config?.color_primario
        })
        if (res.ok) {
          showToast(`✅ Recordatorio con descarga directa de PDF enviado a ${emailDestino}`)
        } else {
          showToast(`⚠️ No se pudo enviar el correo: ${res.error || 'Error desconocido'}`)
        }
      }
    } catch (err: any) {
      showToast(`❌ Error enviando correo: ${err.message}`)
    } finally {
      setEnviandoEmailId(null)
    }
  }

  // ── 7. Exportar Reporte Resumen Ejecutivo del Mes en PDF ──────────────────
  const descargarReporteMesPDF = () => {
    if (!config || recibos.length === 0) return
    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const cDark: [number,number,number] = [15, 23, 42]
    const cAccent: [number,number,number] = [249, 115, 22]

    const [anioStr, mesNumStr] = (mesSeleccionado || '').split('-')
    const anio = parseInt(anioStr) || 2026
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    const mesLabel = MESES[mesIndex] || 'Mes'

    // Header
    doc.setFillColor(...cDark)
    doc.rect(0, 0, 210, 32, 'F')
    doc.setFillColor(...cAccent)
    doc.rect(0, 32, 210, 2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...cAccent)
    doc.text('JUNTA DE CONDOMINIO OCUTUY 5 · INFORME DE COBRANZA Y CARTERA', 14, 12)

    doc.setFontSize(15)
    doc.setTextColor(255, 255, 255)
    doc.text(`RESUMEN GENERAL DE EMISIÓN — ${mesLabel.toUpperCase()} ${anio}`, 14, 20)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(203, 213, 225)
    doc.text(`Edificio: ${config.nombre_edificio} · RIF: ${config.rif} · Fecha de reporte: ${new Date().toLocaleDateString('es-VE')}`, 14, 26)

    // Resumen de KPIs
    autoTable(doc, {
      startY: 38,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, halign: 'center' },
      head: [['TOTAL FACTURADO', 'TOTAL RECAUDADO', 'EN MORA / PENDIENTE', 'TASA COBRANZA', 'SOLVENTES / MOROSOS']],
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.5 },
      body: [[
        `$ ${fmtUsd(stats.totalFacturadoUsd)}\n(${fmtBs(stats.totalFacturadoBs)} Bs)`,
        `$ ${fmtUsd(stats.totalCobradoUsd)}\n(${fmtBs(stats.totalCobradoBs)} Bs)`,
        `$ ${fmtUsd(stats.totalMoraUsd)}\n(${fmtBs(stats.totalMoraBs)} Bs)`,
        `${stats.pctRecaudado}% Cobrado\n(${stats.pctMora}% Mora)`,
        `${stats.cantSolventes} al día\n${stats.cantMorosos} morosos`
      ]],
      bodyStyles: { fontStyle: 'bold', fontSize: 8.5 }
    })

    // Tabla de Apartamentos
    const bodyTable = recibos.map(r => [
      `Apto ${r.apartamento?.numero}`,
      r.apartamento?.propietario_nombre || 'Sin registrar',
      formatAlicuotaPct(r.alicuota),
      `$ ${fmtUsd(r.total_usd)}`,
      `${fmtBs(r.total_bs)} Bs`,
      r.estado === 'pagado' ? 'PAGADO (SOLVENTE)' : 'PENDIENTE (EN MORA)'
    ])

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: { fontSize: 7.2, cellPadding: 1.8 },
      head: [['APARTAMENTO', 'PROPIETARIO', 'ALÍCUOTA', 'MONTO $', 'MONTO BS', 'ESTADO']],
      headStyles: { fillColor: cDark, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: 'bold' },
        1: { cellWidth: 54 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      body: bodyTable
    })

    doc.save(`Informe_Cobranza_${mesLabel}_${anio}.pdf`)
  }

  // ── 7b. Exportar Informe Ejecutivo de Cierre de Gestión en PDF ────────────
  const descargarInformeEjecutivoGestion = () => {
    if (!config || recibos.length === 0) return
    const tasaBcv = recibos[0]?.tasa_bcv || (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : 859.06)

    const datos: DatosInformeGestion = {
      nombreEdificio: config.nombre_edificio || 'Condominio Residencial',
      rifEdificio: config.rif,
      direccionEdificio: config.direccion,
      periodoLabel: `${mesLabelActivo} ${esMesHistorico ? '(Gestión Anterior)' : ''}`,
      totalFacturadoUsd: stats.totalFacturadoUsd,
      totalRecaudadoUsd: stats.totalCobradoUsd,
      totalGastosUsd: stats.totalGastosComunesUsd,
      fondoReservaAcumuladoUsd: stats.fondoReservaUsd,
      totalMoraUsd: stats.totalMoraUsd,
      tasaBcv: tasaBcv,
      gastosPorCategoria: stats.gastosPorCategoria.map(g => ({
        categoria: g.categoria,
        cantidad: 1,
        totalUsd: g.totalUsd,
        totalBs: g.totalBs,
        porcentaje: g.pct
      })),
      totalApartamentos: recibos.length,
      apartamentosSolventes: stats.cantSolventes,
      apartamentosEnMora: stats.cantMorosos,
    }

    generarInformeGestionPDF(datos)
    showToast('📑 Informe Ejecutivo descargado correctamente.')
  }

  // ── 8. RETIRAR DEUDA O ELIMINAR EMISIÓN MASIVA (CON AUDITORÍA INMUTABLE) ──
  const handleConfirmarEliminarEmision = async () => {
    if (!mesSeleccionado || recibos.length === 0) return

    if (!motivoEliminarEmision.trim() || motivoEliminarEmision.trim().length < 8) {
      alert('Debes justificar el motivo del retiro de deuda (mínimo 8 caracteres) para que quede registrado en el Historial de Auditoría.')
      return
    }

    if (palabraConfirmacion.trim().toUpperCase() !== 'ELIMINAR') {
      alert('Debes escribir la palabra "ELIMINAR" en mayúsculas para confirmar esta acción.')
      return
    }

    setEliminandoEmision(true)
    try {
      // 1. Guardar log de auditoría inmutable
      await registrarEventoAuditoria({
        tipo_accion: 'ELIMINACION_EMISION',
        titulo: `Anulación y Retiro Total de Emisión de Recibos - ${mesLabelActivo}`,
        descripcion: `El administrador retiró completamente la deuda emitida correspondiente a ${mesLabelActivo} para ${recibos.length} apartamentos. Total de deuda retirada del sistema: $ ${fmtUsd(stats.totalFacturadoUsd)} USD (Bs. ${fmtBs(stats.totalFacturadoBs)}).`,
        mes_afectado: mesSeleccionado,
        monto_usd: stats.totalFacturadoUsd,
        monto_bs: stats.totalFacturadoBs,
        motivo: motivoEliminarEmision.trim(),
        autor_nombre: perfil?.nombre_completo || 'Administrador',
        autor_email: (perfil as any)?.email || config?.email_contacto || null,
        datos_anteriores: {
          mes_facturado: mesSeleccionado,
          total_apartamentos: recibos.length,
          total_facturado_usd: stats.totalFacturadoUsd,
          total_facturado_bs: stats.totalFacturadoBs,
          recibos: recibos.map(r => ({
            id: r.id,
            apto: r.apartamento?.numero,
            total_usd: r.total_usd,
            total_bs: r.total_bs,
            estado: r.estado
          }))
        }
      })

      // 2. Desmarcar cargos especiales aplicados para este mes (para que puedan volver a emitirse)
      await supabase
        .from('cargos_especiales')
        .update({ aplicado: false })
        .eq('mes_aplicacion', mesSeleccionado)

      // 3. Eliminar los recibos de la base de datos
      const { error: delError } = await supabase
        .from('recibos_generados')
        .delete()
        .eq('mes_facturado', mesSeleccionado)

      if (delError) {
        showToast(`❌ Error al eliminar en base de datos: ${delError.message}`)
        return
      }

      // 4. Actualizar estado local inmediatamente
      const mesBorrado = mesSeleccionado
      const nuevosMeses = mesesDisponibles.filter(m => m !== mesBorrado)
      setMesesDisponibles(nuevosMeses)
      setRecibos([])
      setMesSeleccionado(nuevosMeses.length > 0 ? nuevosMeses[0] : '')

      appCache.invalidateTags(['recibos', 'saldos', 'mora'])

      setModalEliminarEmisionOpen(false)
      setMotivoEliminarEmision('')
      setPalabraConfirmacion('')
      showToast(`✅ Emisión de ${mesLabelActivo} eliminada exitosamente. Registrado en el Historial de Auditoría.`)
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
    } finally {
      setEliminandoEmision(false)
    }
  }

  // ── 9. RETIRAR DEUDA DE UN APARTAMENTO INDIVIDUAL (CON AUDITORÍA) ─────────
  const handleConfirmarEliminarRecibo = async () => {
    if (!reciboParaEliminar) return

    if (!motivoEliminarRecibo.trim() || motivoEliminarRecibo.trim().length < 6) {
      alert('Debes justificar el motivo del retiro de la deuda (mínimo 6 caracteres).')
      return
    }

    setEliminandoRecibo(true)
    try {
      const r = reciboParaEliminar
      const aptoNum = r.apartamento?.numero || 'S/N'

      // 1. Guardar log de auditoría
      await registrarEventoAuditoria({
        tipo_accion: 'ELIMINACION_RECIBO_INDIVIDUAL',
        titulo: `Retiro de Recibo y Deuda - Apto ${aptoNum} (${mesLabelActivo})`,
        descripcion: `Se retiró el recibo y la deuda del apartamento ${aptoNum} correspondiente a ${mesLabelActivo}. Deuda retirada: $ ${fmtUsd(r.total_usd)} USD (Bs. ${fmtBs(r.total_bs)}).`,
        apartamento_numero: aptoNum,
        apartamento_id: r.apartamento_id,
        mes_afectado: r.mes_facturado,
        monto_usd: r.total_usd,
        monto_bs: r.total_bs,
        motivo: motivoEliminarRecibo.trim(),
        autor_nombre: perfil?.nombre_completo || 'Administrador',
        autor_email: (perfil as any)?.email || config?.email_contacto || null,
        datos_anteriores: r
      })

      // 2. Eliminar recibo de la base de datos
      const { error: delError } = await supabase
        .from('recibos_generados')
        .delete()
        .eq('id', r.id)

      if (delError) {
        showToast(`❌ Error al eliminar en BD: ${delError.message}`)
        return
      }

      // 3. Actualizar estado local
      setRecibos(prev => prev.filter(item => item.id !== r.id))
      appCache.invalidateTags(['recibos', 'saldos', 'mora'])
      setModalEliminarReciboOpen(false)
      setReciboParaEliminar(null)
      setMotivoEliminarRecibo('')
      if (reciboModal?.id === r.id) setReciboModal(null)

      showToast(`✅ Recibo y deuda del Apto ${aptoNum} retirados exitosamente. Registrado en Auditoría.`)
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
    } finally {
      setEliminandoRecibo(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1280px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', backgroundColor: '#1e293b',
          color: '#fff', border: '1px solid #334155', boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          padding: '12px 20px', borderRadius: '10px', zIndex: 9999, fontSize: '13px', fontWeight: 600
        }}>
          {toast}
        </div>
      )}

      {/* ── HEADER SUPERIOR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>📑</span>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              Recibos Emitidos y Estadísticas de Cartera
            </h1>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 36px' }}>
            Auditoría de recibos mensuales, control de morosidad, fondo de reserva y anulación controlada de deudas.
          </p>
        </div>

        {/* Controles de Selección de Mes y Botones de Acción */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {mesesDisponibles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#141414', border: '1px solid #262626', padding: '6px 12px', borderRadius: '10px' }}>
              <span style={{ color: '#888', fontSize: '12px', fontWeight: 600 }}>Mes Facturado:</span>
              <select
                value={mesSeleccionado}
                onChange={e => {
                  setMesSeleccionado(e.target.value)
                  setSearchParams({ mes: e.target.value })
                }}
                style={{
                  backgroundColor: '#0a0a0a', color: 'var(--color-accent, #f97316)', border: '1px solid var(--color-accent-glow, #f9731650)',
                  padding: '6px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none', cursor: 'pointer'
                }}
              >
                {mesesDisponibles.map(m => {
                  const [anioStr, mesNum] = m.split('-')
                  const label = `${MESES[(parseInt(mesNum)||1) - 1]} ${anioStr}`
                  const esHist = m.slice(0, 7) < fechaEntradaActual
                  return <option key={m} value={m}>{label}{esHist ? ' 🏛️ (Histórico)' : ''}</option>
                })}
              </select>
            </div>
          )}

          {/* ── BOTÓN DESTACADO: ENVIAR EMAILS (AUTOMÁTICO / MANUAL CON EXCEL) ── */}
          <button
            onClick={handleAbrirModalEnviarEmails}
            disabled={mesesDisponibles.length === 0}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: mesesDisponibles.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s',
            }}
            title="Enviar recordatorios de recibos automáticos o manuales con Excel y descarga directa de PDF"
          >
            <span style={{ fontSize: '15px' }}>✉️</span>
            <span>Enviar emails</span>
          </button>

          {/* BOTÓN CONMUTADOR DE MODALIDAD (INDEXADO DÓLAR VS BS FIJOS) */}
          {recibos.length > 0 && (() => {
            const esIndexadoActivo = recibos[0]?.es_indexado ?? recibos[0]?.data_json?.es_indexado ?? false
            return (
              <button
                disabled={cambiandoModalidad}
                onClick={() => {
                  const nuevo = !esIndexadoActivo
                  if (window.confirm(`¿Deseas cambiar la modalidad de ${mesLabelActivo} a ${nuevo ? 'INDEXADO AL DÓLAR (BCV)' : 'NO INDEXADO (Bolívares Fijos)'}? Esto actualizará la visualización de la deuda de todos los residentes para este mes.`)) {
                    ejecutarCambioModalidadMes(nuevo)
                  }
                }}
                style={{
                  backgroundColor: esIndexadoActivo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: esIndexadoActivo ? '#10b981' : '#3b82f6',
                  border: `1px solid ${esIndexadoActivo ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: cambiandoModalidad ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  boxShadow: esIndexadoActivo ? '0 4px 12px rgba(16, 185, 129, 0.15)' : '0 4px 12px rgba(59, 130, 246, 0.15)'
                }}
                title="Cambiar entre deuda indexada al dólar BCV o bolívares fijos para toda la emisión de este mes"
              >
                <span>{esIndexadoActivo ? '🟢' : '🔵'}</span>
                {cambiandoModalidad ? 'Actualizando...' : esIndexadoActivo ? 'Mes Indexado ($ USD)' : 'Mes No Indexado (Bs)'}
              </button>
            )
          })()}

          {/* BOTÓN ESPECIAL: RETIRAR DEUDA / ELIMINAR EMISIÓN */}
          {recibos.length > 0 && (
            <button
              onClick={() => {
                setMotivoEliminarEmision('')
                setPalabraConfirmacion('')
                setModalEliminarEmisionOpen(true)
              }}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
              }}
              title="Retirar la deuda generada y eliminar la emisión de este mes en su totalidad para volver a emitir"
            >
              <span>🗑️</span> Retirar Deuda / Eliminar Emisión
            </button>
          )}

          <button
            onClick={descargarReporteMesPDF}
            disabled={recibos.length === 0}
            style={{
              backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151',
              padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              cursor: recibos.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <span>📊</span> Exportar Informe Mes
          </button>

          <button
            onClick={descargarInformeEjecutivoGestion}
            disabled={recibos.length === 0}
            style={{
              backgroundColor: '#0f172a',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              padding: '8px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: recibos.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.15)',
              transition: 'all 0.2s'
            }}
            title="Genera el informe formal en PDF para asamblea de copropietarios o rendición de cuentas anual"
          >
            <span>📑</span> Informe Ejecutivo (PDF)
          </button>

          <a
            href="/admin/calendario-deudas"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              padding: '8px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span>📅</span> Calendario de Deudas
          </a>

          <button
            onClick={cargarRecibosDelMes}
            style={{
              backgroundColor: '#141414', color: '#aaa', border: '1px solid #262626',
              padding: '8px 12px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
            }}
            title="Refrescar datos"
          >
            🔄
          </button>
        </div>
      </div>

      {loading && recibos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Skeleton Bento KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <SkeletonCard height="135px" />
            <SkeletonCard height="135px" />
            <SkeletonCard height="135px" />
            <SkeletonCard height="135px" />
          </div>

          {/* Skeleton Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            <SkeletonChart height="220px" title="Recaudación vs Morosidad" />
            <SkeletonChart height="220px" title="Distribución de Gastos" />
            <SkeletonChart height="220px" title="Morosidad por Piso" />
          </div>

          {/* Skeleton Table */}
          <div style={{ backgroundColor: '#141414', border: '1px solid #222', borderRadius: '14px', padding: '24px' }}>
            <SkeletonTable rows={7} columns={7} />
          </div>
        </div>
      ) : mesesDisponibles.length === 0 ? (
        <div style={{
          backgroundColor: '#141414', border: '1px dashed #2a2a2a', borderRadius: '16px',
          padding: '60px 20px', textAlign: 'center', color: '#777'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <h3 style={{ color: '#fff', fontSize: '18px', margin: '0 0 6px' }}>No hay recibos emitidos en el sistema</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>
            Ve al módulo <strong>"Generar Recibos"</strong> para emitir la facturación de gastos comunes del mes.
          </p>
        </div>
      ) : (
        <>
          {/* ── BANNER ADMINISTRACIÓN ANTERIOR (MODO HISTÓRICO) ── */}
          {esMesHistorico && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.16) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderTop: '1px solid rgba(129, 140, 248, 0.6)',
              borderRadius: '20px',
              padding: '22px 26px',
              marginBottom: '24px',
              boxShadow: '0 12px 30px -4px rgba(79, 70, 229, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '26px' }}>🏛️</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#e0e7ff', letterSpacing: '-0.3px' }}>
                          Carga de Pagos — Administración Anterior
                        </h2>
                        <span style={{ backgroundColor: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc', border: '1px solid rgba(129, 140, 248, 0.4)', fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                          {mesLabelActivo} (Histórico)
                        </span>
                      </div>
                      <p style={{ color: '#c7d2fe', fontSize: '13px', margin: '6px 0 0', lineHeight: '1.5' }}>
                        Este mes corresponde al periodo previo a la plataforma. Marca apartamento por apartamento si pagó o quedó en mora según los registros recibidos. Los residentes verán este estado en su cuenta y tendrán disponible su PDF descargable con sello de solvencia.
                      </p>
                    </div>
                  </div>

                  {/* Barra de progreso de regularización */}
                  <div style={{ marginTop: '16px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', fontWeight: 600, flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                        Pagados: <strong>{stats.cantSolventes}</strong> ({stats.pctRecaudado}%)
                      </span>
                      <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                        En Mora: <strong>{stats.cantMorosos}</strong> ({stats.pctMora}%)
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        Total: <strong>{recibos.length}</strong> inmuebles
                      </span>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(239, 68, 68, 0.4)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${stats.pctRecaudado}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>

                {/* Acciones en lote para agilizar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '240px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    ⚡ Acciones Rápidas en Lote:
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setModalBulkPagadosOpen(true)}
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.18)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s'
                      }}
                      title="Marcar todos los apartamentos como Pagados de una sola vez"
                    >
                      <span>✅</span> Marcar Todos Pagados
                    </button>
                    <button
                      onClick={() => setModalBulkMoraOpen(true)}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s'
                      }}
                      title="Marcar todos los apartamentos como En Mora / Pendiente"
                    >
                      <span>⚠️</span> Marcar Todos en Mora
                    </button>
                  </div>

                  {/* Switch para notificar por email o no */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px', fontSize: '11.5px', color: '#cbd5e1' }}>
                    <input
                      type="checkbox"
                      checked={notificarEmailHistorico}
                      onChange={e => setNotificarEmailHistorico(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                    />
                    <span>Notificar por email al marcar pago (silenciado por defecto)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── BENTO GRID: KPIS DE CARTERA ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginBottom: '22px' }}>
            
            {/* KPI 1: Facturación Total */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '22px',
              padding: '20px 22px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Total Facturado
                </span>
                <span style={{ fontSize: '20px' }}>🧾</span>
              </div>
              <div style={{ color: '#fff', fontSize: '24px', fontWeight: 900, marginTop: '8px', letterSpacing: '-0.5px' }}>
                $ {fmtUsd(stats.totalFacturadoUsd)}
              </div>
              <div style={{ color: '#10b981', fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>
                Bs. {fmtBs(stats.totalFacturadoBs)}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                {recibos.length} apartamentos facturados
              </div>
            </div>

            {/* KPI 2: Total Recaudado / Cobrado */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderTop: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '22px',
              padding: '20px 22px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Recaudado ({stats.pctRecaudado}%)
                </span>
                <span style={{ fontSize: '20px' }}>🟢</span>
              </div>
              <div style={{ color: '#fff', fontSize: '24px', fontWeight: 900, marginTop: '8px', letterSpacing: '-0.5px' }}>
                $ {fmtUsd(stats.totalCobradoUsd)}
              </div>
              <div style={{ color: '#10b981', fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>
                Bs. {fmtBs(stats.totalCobradoBs)}
              </div>
              <div style={{ color: '#22c55e', fontSize: '11px', fontWeight: 700, marginTop: '6px' }}>
                {stats.cantSolventes} apartamentos solventes
              </div>
            </div>

            {/* KPI 3: Mora / Pendiente */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderTop: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '22px',
              padding: '20px 22px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  En Mora ({stats.pctMora}%)
                </span>
                <span style={{ fontSize: '20px' }}>🔴</span>
              </div>
              <div style={{ color: '#fff', fontSize: '24px', fontWeight: 900, marginTop: '8px', letterSpacing: '-0.5px' }}>
                $ {fmtUsd(stats.totalMoraUsd)}
              </div>
              <div style={{ color: '#f87171', fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>
                Bs. {fmtBs(stats.totalMoraBs)}
              </div>
              <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, marginTop: '6px' }}>
                {stats.cantMorosos} apartamentos pendientes
              </div>
            </div>

            {/* KPI 4: Fondo de Reserva */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '22px',
              padding: '20px 22px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Fondo Reserva ({recibos[0]?.fondo_reserva_pct || 10}%)
                </span>
                <span style={{ fontSize: '20px' }}>🛡️</span>
              </div>
              <div style={{ color: '#fff', fontSize: '24px', fontWeight: 900, marginTop: '8px', letterSpacing: '-0.5px' }}>
                $ {fmtUsd(stats.fondoReservaUsd)}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                Gastos: $ {fmtUsd(stats.totalGastosComunesUsd)}
              </div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                Tasa BCV: Bs. {fmtBs((recibos[0]?.tasa_bcv && recibos[0].tasa_bcv > 1 ? recibos[0].tasa_bcv : (config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : 859.06)))}
              </div>
            </div>

          </div>

          {/* ── BENTO CHARTS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginBottom: '22px' }}>
            
            {/* GRÁFICO 1: Barra de Recaudación vs Mora */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '22px',
              padding: '22px 24px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📊</span> Recaudación vs Morosidad
              </h3>

              <div style={{ width: '100%', height: '14px', backgroundColor: '#ef4444', borderRadius: '7px', overflow: 'hidden', display: 'flex', marginBottom: '14px' }}>
                <div
                  style={{
                    width: `${stats.pctRecaudado}%`,
                    height: '100%',
                    backgroundColor: '#10b981',
                    transition: 'width 0.6s ease'
                  }}
                  title={`Cobrado: ${stats.pctRecaudado}%`}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
                  <span style={{ color: '#ccc' }}>Cobrado: <strong>{stats.pctRecaudado}%</strong> (${fmtUsd(stats.totalCobradoUsd)})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '50%', display: 'inline-block' }} />
                  <span style={{ color: '#ccc' }}>Mora: <strong>{stats.pctMora}%</strong> (${fmtUsd(stats.totalMoraUsd)})</span>
                </div>
              </div>
            </div>

            {/* GRÁFICO 2: Gastos Comunes por Categoría */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '22px',
              padding: '22px 24px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>💸</span> Distribución de Gastos del Mes
                </h3>
                <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700 }}>Total: $ {fmtUsd(stats.totalGastosComunesUsd)}</span>
              </div>

              {stats.gastosPorCategoria.length === 0 ? (
                <p style={{ color: '#666', fontSize: '12px' }}>No hay gastos detallados registrados para este mes.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stats.gastosPorCategoria.slice(0, 5).map((cat, idx) => {
                    const colors = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#eab308']
                    const color = colors[idx % colors.length]
                    return (
                      <div key={cat.categoria}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '3px' }}>
                          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{cat.categoria}</span>
                          <span style={{ color: '#fff', fontWeight: 700 }}>
                            $ {fmtUsd(cat.totalUsd)} <span style={{ color: '#64748b', fontSize: '10px' }}>({cat.pct}%)</span>
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(4, cat.pct)}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* GRÁFICO 3: Distribución de Morosidad por Piso */}
            <div style={{
              background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderTop: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '22px',
              padding: '22px 24px',
              boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏢</span> Morosidad por Piso
                </h3>
                <span style={{ color: '#888', fontSize: '11px' }}>Solventes vs Deudores</span>
              </div>

              {stats.moraPorPiso.length === 0 ? (
                <p style={{ color: '#666', fontSize: '12px' }}>Sin datos de pisos disponibles.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                  {stats.moraPorPiso.map(p => {
                    const totalPiso = p.solventes + p.morosos
                    const pctPisoSolvente = totalPiso > 0 ? (p.solventes / totalPiso) * 100 : 0
                    const tieneMora = p.morosos > 0

                    return (
                      <div key={p.piso} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                        <span style={{ width: '65px', color: tieneMora ? '#fca5a5' : '#86efac', fontWeight: 600 }}>{p.piso}</span>
                        <div style={{ flex: 1, height: '6px', backgroundColor: '#ef4444', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${pctPisoSolvente}%`, height: '100%', backgroundColor: '#10b981' }} />
                        </div>
                        <span style={{ width: '70px', textAlign: 'right', color: tieneMora ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                          {tieneMora ? `$ ${fmtUsd(p.totalMoraUsd)}` : 'Al día'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>

          {/* ── TABLA EXTENSA DE RECIBOS EMITIDOS ── */}
          <div style={{
            background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '22px',
            padding: '24px 26px',
            boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
          }}>
            
            {/* Barra de Búsqueda y Filtros */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 2px' }}>
                  Listado Detallado de Recibos ({recibosFiltrados.length})
                </h2>
                <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
                  Descarga o consulta el recibo individual de cada apartamento correspondiente a {mesLabelActivo}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Buscador */}
                <input
                  type="text"
                  placeholder="🔍 Buscar por apto o nombre..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={{
                    backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff',
                    padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', outline: 'none', width: '220px'
                  }}
                />

                {/* Filtro por Estado */}
                <div style={{ display: 'flex', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '2px' }}>
                  {[
                    { id: 'todos', label: `Todos (${recibos.length})` },
                    { id: 'pendiente', label: `Mora (${stats.cantMorosos})` },
                    { id: 'pagado', label: `Pagados (${stats.cantSolventes})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFiltroEstado(tab.id as any)}
                      style={{
                        backgroundColor: filtroEstado === tab.id ? 'var(--color-accent, #f97316)' : 'transparent',
                        color: filtroEstado === tab.id ? '#fff' : '#888',
                        border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '11.5px', fontWeight: 700, transition: 'all 0.15s'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Selector de Modo de Vista (Tabla vs Tarjetas para Móviles) */}
                <div style={{ display: 'flex', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '2px' }}>
                  <button
                    onClick={() => setVistaModo('tabla')}
                    style={{
                      backgroundColor: vistaModo === 'tabla' ? '#3b82f6' : 'transparent',
                      color: vistaModo === 'tabla' ? '#fff' : '#888',
                      border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Vista de Tabla (ideal para pantallas grandes)"
                  >
                    <span>📋</span> Tabla
                  </button>
                  <button
                    onClick={() => setVistaModo('tarjetas')}
                    style={{
                      backgroundColor: vistaModo === 'tarjetas' ? '#3b82f6' : 'transparent',
                      color: vistaModo === 'tarjetas' ? '#fff' : '#888',
                      border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Vista de Tarjetas (ideal para celulares y tablets)"
                  >
                    <span>🗂️</span> Tarjetas
                  </button>
                  <button
                    onClick={() => setVistaModo('auto')}
                    style={{
                      backgroundColor: vistaModo === 'auto' ? '#6366f1' : 'transparent',
                      color: vistaModo === 'auto' ? '#fff' : '#888',
                      border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11.5px', fontWeight: 700
                    }}
                    title="Modo Automático (se adapta al dispositivo)"
                  >
                    Auto
                  </button>
                </div>
              </div>
            </div>

            <style>{`
              .vista-forzada-bloque { display: block !important; }
              .vista-forzada-grid { display: grid !important; }
              .vista-forzada-oculto { display: none !important; }

              @media (max-width: 860px) {
                .vista-recibos-tabla-auto { display: none !important; }
                .vista-recibos-tarjetas-auto { display: grid !important; }
              }
              @media (min-width: 861px) {
                .vista-recibos-tabla-auto { display: block !important; }
                .vista-recibos-tarjetas-auto { display: none !important; }
              }
            `}</style>

            {/* Tabla y Tarjetas */}
            {recibosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}>
                <p>No se encontraron recibos con los filtros actuales.</p>
              </div>
            ) : (
              <>
                <div
                  className={vistaModo === 'tabla' ? 'vista-forzada-bloque' : vistaModo === 'tarjetas' ? 'vista-forzada-oculto' : 'vista-recibos-tabla-auto'}
                  style={{ overflowX: 'auto' }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #222', color: '#777', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.4px' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Apartamento</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Residente / Propietario</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px' }}>Alícuota</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total USD</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total Bs</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px' }}>Estado</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recibosFiltrados.map(r => {
                      const esPH = r.apartamento?.numero.toUpperCase().includes('PH')
                      const isPagado = r.estado === 'pagado'
                      const cambiando = cambiandoEstadoId === r.id

                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: '1px solid #1a1a1a',
                            backgroundColor: isPagado ? 'transparent' : 'rgba(239, 68, 68, 0.02)',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = isPagado ? 'transparent' : 'rgba(239, 68, 68, 0.02)'}
                        >
                          {/* Apto */}
                          <td style={{ padding: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)', whiteSpace: 'nowrap' }}>
                            Apto {r.apartamento?.numero} {esPH && <span style={{ backgroundColor: 'var(--color-accent-light, #f9731620)', color: 'var(--color-accent, #f97316)', border: '1px solid var(--color-accent-glow, #f9731640)', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px' }}>PH</span>}
                          </td>

                          {/* Residente */}
                          <td style={{ padding: '12px', color: '#e2e8f0', fontWeight: 600 }}>
                            {r.apartamento?.propietario_nombre || (
                              <span style={{ color: '#64748b', fontStyle: 'italic' }}>Sin registrar</span>
                            )}
                            {r.apartamento?.telefono_contacto && (
                              <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                                📞 {r.apartamento.telefono_contacto}
                              </div>
                            )}
                          </td>

                          {/* Alícuota */}
                          <td style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                            {formatAlicuotaPct(r.alicuota)}
                          </td>

                          {/* Total USD */}
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                            $ {fmtUsd(r.total_usd)}
                          </td>

                          {/* Total Bs */}
                          <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {fmtBs(r.total_bs)} Bs
                          </td>

                          {/* Estado */}
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <button
                              onClick={() => cambiarEstadoRecibo(r)}
                              disabled={cambiando}
                              title="Haz clic para alternar entre Pagado y Pendiente"
                              style={{
                                border: 'none', cursor: 'pointer', borderRadius: '6px', padding: '4px 10px',
                                fontSize: '10.5px', fontWeight: 700,
                                backgroundColor: isPagado ? '#10b98118' : '#ef444418',
                                color: isPagado ? '#10b981' : '#ef4444',
                                borderLeft: isPagado ? '2px solid #10b981' : '2px solid #ef4444',
                                opacity: cambiando ? 0.5 : 1
                              }}
                            >
                              {isPagado ? '🟢 Pagado' : '🔴 En Mora'}
                            </button>
                          </td>

                          {/* Acciones */}
                          <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={() => descargarPDFReciboEmitido(r)}
                                style={{
                                  backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151',
                                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                                  display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                                title="Descargar PDF oficial de este recibo"
                              >
                                <span>📥</span> PDF
                              </button>

                              <button
                                onClick={() => handleWhatsAppRecibo(r)}
                                style={{
                                  backgroundColor: 'rgba(34, 197, 94, 0.16)',
                                  color: '#22c55e',
                                  border: '1px solid rgba(34, 197, 94, 0.35)',
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title={isPagado ? "Compartir solvencia por WhatsApp" : "Enviar cobranza con datos de pago por WhatsApp (1 clic)"}
                              >
                                <span>📲</span> {isPagado ? 'Solvencia' : 'WhatsApp'}
                              </button>

                              <button
                                onClick={() => handleEmailRecibo(r)}
                                disabled={enviandoEmailId === r.id}
                                style={{
                                  backgroundColor: 'rgba(59, 130, 246, 0.16)',
                                  color: '#60a5fa',
                                  border: '1px solid rgba(59, 130, 246, 0.35)',
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: enviandoEmailId === r.id ? 'wait' : 'pointer',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  opacity: enviandoEmailId === r.id ? 0.6 : 1
                                }}
                                title="Enviar aviso de cobro o recibo por correo electrónico al residente"
                              >
                                <span>📧</span> {enviandoEmailId === r.id ? '...' : 'Email'}
                              </button>

                              <button
                                onClick={() => setReciboModal(r)}
                                style={{
                                  backgroundColor: '#141414', color: '#888', border: '1px solid #262626',
                                  padding: '5px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer'
                                }}
                                title="Ver desglose completo de gastos y notas"
                              >
                                👁️
                              </button>

                              {/* BOTÓN RETIRAR DEUDA INDIVIDUAL */}
                              <button
                                onClick={() => {
                                  setReciboParaEliminar(r)
                                  setMotivoEliminarRecibo('')
                                  setModalEliminarReciboOpen(true)
                                }}
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                                title="Retirar deuda y anular recibo de este apartamento"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>

                {/* 2. Vista Tarjetas (Mobile / Tablet / Touch-friendly) */}
                <div
                  className={vistaModo === 'tarjetas' ? 'vista-forzada-grid' : vistaModo === 'tabla' ? 'vista-forzada-oculto' : 'vista-recibos-tarjetas-auto'}
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                    gap: '14px',
                    marginTop: '8px'
                  }}
                >
                  {recibosFiltrados.map(r => {
                    const esPH = r.apartamento?.numero.toUpperCase().includes('PH')
                    const isPagado = r.estado === 'pagado'
                    const cambiando = cambiandoEstadoId === r.id

                    return (
                      <div
                        key={`card-${r.id}`}
                        style={{
                          background: isPagado
                            ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(13, 17, 23, 0.95) 100%)'
                            : 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(13, 17, 23, 0.95) 100%)',
                          border: isPagado ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                          borderTop: isPagado ? '3px solid #10b981' : '3px solid #ef4444',
                          borderRadius: '16px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '14px',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                        }}
                      >
                        {/* Header de la tarjeta */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-accent, #f97316)' }}>
                                Apto {r.apartamento?.numero}
                              </span>
                              {esPH && (
                                <span style={{ backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.2))', color: 'var(--color-accent, #f97316)', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.4))', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                                  PH
                                </span>
                              )}
                              {r.apartamento?.piso && (
                                <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                                  Piso {r.apartamento.piso}
                                </span>
                              )}
                            </div>

                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: isPagado ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: isPagado ? '#10b981' : '#ef4444',
                              border: `1px solid ${isPagado ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                            }}>
                              {isPagado ? '✓ SOLVENTE' : '⚠️ EN MORA'}
                            </span>
                          </div>

                          {/* Nombre de Residente */}
                          <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>
                            {r.apartamento?.propietario_nombre || (
                              <span style={{ color: '#64748b', fontStyle: 'italic' }}>Sin registrar</span>
                            )}
                          </div>
                          {r.apartamento?.telefono_contacto && (
                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                              📞 {r.apartamento.telefono_contacto}
                            </div>
                          )}

                          {/* Montos */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            marginTop: '12px'
                          }}>
                            <div>
                              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Total USD</div>
                              <div style={{ color: '#fff', fontSize: '16px', fontWeight: 900 }}>$ {fmtUsd(r.total_usd)}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Total Bs</div>
                              <div style={{ color: '#10b981', fontSize: '15px', fontWeight: 800 }}>{fmtBs(r.total_bs)} Bs</div>
                            </div>
                          </div>
                        </div>

                        {/* Botón táctil grande para alternar pago y barra de acciones */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            onClick={() => cambiarEstadoRecibo(r)}
                            disabled={cambiando}
                            style={{
                              width: '100%',
                              padding: '11px 14px',
                              borderRadius: '10px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              backgroundColor: isPagado ? '#10b981' : '#ef4444',
                              color: '#fff',
                              boxShadow: isPagado ? '0 4px 14px rgba(16, 185, 129, 0.4)' : '0 4px 14px rgba(239, 68, 68, 0.4)',
                              opacity: cambiando ? 0.6 : 1,
                              transition: 'all 0.2s'
                            }}
                          >
                            <span>{isPagado ? '✅ PAGADO' : '⭕ MARCAR COMO PAGADO'}</span>
                            <span style={{ fontSize: '10px', opacity: 0.85, fontWeight: 500 }}>
                              ({isPagado ? 'Toca para mora' : 'Toca para pagar'})
                            </span>
                          </button>

                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
                            <button
                              onClick={() => descargarPDFReciboEmitido(r)}
                              style={{
                                flex: 1,
                                backgroundColor: '#1f2937', color: '#fff', border: '1px solid #374151',
                                padding: '8px 6px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                              }}
                            >
                              <span>📥</span> PDF
                            </button>

                            <button
                              onClick={() => handleWhatsAppRecibo(r)}
                              style={{
                                flex: 1,
                                backgroundColor: 'rgba(34, 197, 94, 0.16)',
                                color: '#22c55e',
                                border: '1px solid rgba(34, 197, 94, 0.35)',
                                padding: '8px 6px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <span>📲</span> {isPagado ? 'Solvente' : 'Cobrar'}
                            </button>

                            <button
                              onClick={() => setReciboModal(r)}
                              style={{
                                backgroundColor: '#141414', color: '#888', border: '1px solid #262626',
                                padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
                              }}
                              title="Ver desglose detallado"
                            >
                              👁️
                            </button>

                            <button
                              onClick={() => {
                                setReciboParaEliminar(r)
                                setMotivoEliminarRecibo('')
                                setModalEliminarReciboOpen(true)
                              }}
                              style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                              title="Retirar recibo / deuda"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── MODAL: DETALLE DEL RECIBO EMITIDO ── */}
      {reciboModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '16px',
            maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #222', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Detalle del Recibo Emitido
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '2px 0 0' }}>
                  Apartamento {reciboModal.apartamento?.numero} — {mesLabelActivo}
                </h2>
                <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>
                  Propietario: {reciboModal.apartamento?.propietario_nombre || 'Sin registrar'} · Alícuota: {formatAlicuotaPct(reciboModal.alicuota)}
                </p>
              </div>
              <button
                onClick={() => setReciboModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Totalizadores en Modal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#0a0a0a', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1e1e1e' }}>
                <div style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Total USD a Pagar</div>
                <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '20px', fontWeight: 900 }}>$ {fmtUsd(reciboModal.total_usd)}</div>
              </div>
              <div style={{ backgroundColor: '#0a0a0a', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1e1e1e' }}>
                <div style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Total en Bolívares</div>
                <div style={{ color: '#10b981', fontSize: '20px', fontWeight: 900 }}>Bs. {fmtBs(reciboModal.total_bs)}</div>
              </div>
            </div>

            {/* Desglose de Gastos */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700, margin: '0 0 8px' }}>
                Desglose de Gastos Comunes
              </h4>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #1e1e1e', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <tbody>
                    {(reciboModal.data_json?.gastos || []).map((g, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #1a1a1a', backgroundColor: idx % 2 === 0 ? '#0f0f0f' : '#0a0a0a' }}>
                        <td style={{ padding: '6px 10px', color: '#ccc' }}>{g.descripcion}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#10b981' }}>{fmtBs(g.monto_bs)} Bs</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#fff', fontWeight: 600 }}>$ {fmtUsd(g.monto_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notas del Recibo */}
            {reciboModal.data_json?.notas_residentes && (
              <div style={{ marginBottom: '18px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '12px' }}>
                <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Notas para los Residentes emitidas en este recibo:
                </div>
                <div style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                  {reciboModal.data_json.notas_residentes}
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #222', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => cambiarEstadoRecibo(reciboModal)}
                  style={{
                    backgroundColor: reciboModal.estado === 'pagado' ? '#ef444420' : '#10b98120',
                    color: reciboModal.estado === 'pagado' ? '#ef4444' : '#10b981',
                    border: reciboModal.estado === 'pagado' ? '1px solid #ef444440' : '1px solid #10b98140',
                    padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px'
                  }}
                >
                  {reciboModal.estado === 'pagado' ? 'Marcar como Pendiente' : 'Marcar como Pagado'}
                </button>

                <button
                  onClick={() => {
                    setReciboParaEliminar(reciboModal)
                    setMotivoEliminarRecibo('')
                    setModalEliminarReciboOpen(true)
                  }}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Retirar deuda y anular este recibo"
                >
                  <span>🗑️</span> Retirar Deuda
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setReciboModal(null)}
                  style={{
                    backgroundColor: '#1f2937', color: '#ccc', border: '1px solid #374151',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                  }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => handleWhatsAppRecibo(reciboModal)}
                  style={{
                    backgroundColor: '#16a34a', color: '#fff', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  title="Enviar por WhatsApp con 1 clic"
                >
                  <span>📲</span> {reciboModal.estado === 'pagado' ? 'Solvencia WhatsApp' : 'Enviar por WhatsApp'}
                </button>
                <button
                  onClick={() => handleEmailRecibo(reciboModal)}
                  disabled={enviandoEmailId === reciboModal.id}
                  style={{
                    backgroundColor: '#2563eb', color: '#fff', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', cursor: enviandoEmailId === reciboModal.id ? 'wait' : 'pointer',
                    fontSize: '12px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  title="Enviar por correo electrónico al residente"
                >
                  <span>📧</span> {enviandoEmailId === reciboModal.id ? 'Enviando...' : (reciboModal.estado === 'pagado' ? 'Enviar Solvencia Email' : 'Enviar por Correo')}
                </button>
                <button
                  onClick={() => descargarPDFReciboEmitido(reciboModal)}
                  style={{
                    backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <span>📥</span> Descargar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN 1: ELIMINAR EMISIÓN COMPLETA DEL MES ── */}
      {modalEliminarEmisionOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #ef4444', borderRadius: '20px',
            maxWidth: '540px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(239, 68, 68, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                🗑️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Retirar Deuda y Eliminar Emisión Completa
                </h3>
                <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>
                  Mes a anular: {mesLabelActivo}
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 16px' }}>
              Esta acción eliminará <strong>en su totalidad la emisión de recibos de {mesLabelActivo}</strong> para todos los <strong>{recibos.length} apartamentos</strong>, retirando una deuda total de <strong style={{ color: 'var(--color-accent, #f97316)' }}>$ {fmtUsd(stats.totalFacturadoUsd)} USD (Bs. {fmtBs(stats.totalFacturadoBs)})</strong>.
            </p>

            <div style={{
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#fef08a',
              lineHeight: 1.4
            }}>
              🛡️ <strong>REGISTRO INMUTABLE DE AUDITORÍA:</strong><br />
              Para garantizar la transparencia ante la comunidad y los auditores, este movimiento quedará grabado permanentemente con tu nombre, sello de tiempo, monto exacto y el motivo que especifiques.
            </div>

            {/* Motivo obligatorio */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Motivo / Justificación obligatoria de la anulación:
              </label>
              <textarea
                value={motivoEliminarEmision}
                onChange={e => setMotivoEliminarEmision(e.target.value)}
                placeholder="Ej: Se detectó error en la alícuota de gas común. Se anula la emisión para corregir los gastos y reemitir nuevamente."
                rows={3}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '12.5px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Confirmación escribiendo ELIMINAR */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#ef4444', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Escribe la palabra "ELIMINAR" para confirmar:
              </label>
              <input
                type="text"
                value={palabraConfirmacion}
                onChange={e => setPalabraConfirmacion(e.target.value)}
                placeholder="ELIMINAR"
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid #ef444450',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalEliminarEmisionOpen(false)}
                disabled={eliminandoEmision}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmarEliminarEmision}
                disabled={eliminandoEmision || palabraConfirmacion.trim().toUpperCase() !== 'ELIMINAR' || motivoEliminarEmision.trim().length < 8}
                style={{
                  backgroundColor: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? '#dc2626' : '#451a1a',
                  color: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? '#fff' : '#888',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? 'pointer' : 'not-allowed',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)'
                }}
              >
                {eliminandoEmision ? 'Eliminando y auditando...' : 'Confirmar y Retirar Emisión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN 2: RETIRAR DEUDA DE APTO INDIVIDUAL ── */}
      {modalEliminarReciboOpen && reciboParaEliminar && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid var(--color-accent, #f97316)', borderRadius: '20px',
            maxWidth: '500px', width: '100%', padding: '24px', boxShadow: 'var(--color-brand-shadow, 0 25px 60px rgba(249, 115, 22, 0.25))'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.35))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
              }}>
                📄
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Retirar Deuda - Apto {reciboParaEliminar.apartamento?.numero}
                </h3>
                <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo}
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 14px' }}>
              Se anulará el recibo emitido y se retirará la deuda del <strong>Apartamento {reciboParaEliminar.apartamento?.numero}</strong> por un monto de <strong style={{ color: 'var(--color-accent, #f97316)' }}>$ {fmtUsd(reciboParaEliminar.total_usd)} USD (Bs. {fmtBs(reciboParaEliminar.total_bs)})</strong>. El apartamento quedará sin deuda para este mes.
            </p>

            <div style={{
              backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.08))',
              border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.25))',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '11.5px',
              color: '#fed7aa'
            }}>
              🛡️ <strong>REGISTRO EN AUDITORÍA:</strong> Este retiro quedará guardado para los arqueos del edificio.
            </div>

            {/* Motivo obligatorio */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Motivo del retiro de deuda:
              </label>
              <textarea
                value={motivoEliminarRecibo}
                onChange={e => setMotivoEliminarRecibo(e.target.value)}
                placeholder="Ej: Cobro indebido corregido / Pago reportado por adelantado verificado / Condonación autorizada por la junta."
                rows={2}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  color: '#fff',
                  fontSize: '12.5px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setModalEliminarReciboOpen(false)
                  setReciboParaEliminar(null)
                }}
                disabled={eliminandoRecibo}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmarEliminarRecibo}
                disabled={eliminandoRecibo || motivoEliminarRecibo.trim().length < 6}
                style={{
                  backgroundColor: motivoEliminarRecibo.trim().length >= 6 ? 'var(--color-accent-hover, #ea580c)' : '#451a1a',
                  color: motivoEliminarRecibo.trim().length >= 6 ? '#fff' : '#888',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: motivoEliminarRecibo.trim().length >= 6 ? 'pointer' : 'not-allowed'
                }}
              >
                {eliminandoRecibo ? 'Retirando...' : 'Confirmar y Retirar Deuda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN 3: MARCAR TODOS COMO PAGADOS (HISTÓRICO) ── */}
      {modalBulkPagadosOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #10b981', borderRadius: '20px',
            maxWidth: '520px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(16, 185, 129, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                🏛️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Marcar Todos como Pagados
                </h3>
                <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo} ({recibos.length} apartamentos)
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
              ¿Deseas marcar todos los recibos de este mes histórico como <strong>PAGADOS</strong>?
              <br /><br />
              Esta herramienta acelera la carga de la administración anterior si la mayoría de los residentes estaban al día. Luego podrás alternar individualmente los pocos que hayan quedado en mora.
            </p>

            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#a7f3d0'
            }}>
              🛡️ Se actualizarán de inmediato las cuentas de los copropietarios y se registrará en el Historial de Auditoría.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalBulkPagadosOpen(false)}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => ejecutarBulkEstado('pagado')}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#10b981', color: '#fff', border: 'none',
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                {ejecutandoBulk ? 'Actualizando...' : '✓ Confirmar y Marcar Todos Pagados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMACIÓN 4: MARCAR TODOS EN MORA (HISTÓRICO) ── */}
      {modalBulkMoraOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #ef4444', borderRadius: '20px',
            maxWidth: '520px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(239, 68, 68, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Marcar Todos en Mora / Pendiente
                </h3>
                <span style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo} ({recibos.length} apartamentos)
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
              ¿Deseas marcar todos los recibos de este mes como <strong>EN MORA (Pendientes)</strong>?
              <br /><br />
              Todos los apartamentos figurarán con deuda pendiente de este mes hasta que sean marcados como pagados.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalBulkMoraOpen(false)}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => ejecutarBulkEstado('pendiente')}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#ef4444', color: '#fff', border: 'none',
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                }}
              >
                {ejecutandoBulk ? 'Actualizando...' : '⚠️ Confirmar y Marcar en Mora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRINCIPAL: ENVIAR EMAILS (AUTOMÁTICO / MANUAL CON EXCEL) ── */}
      {modalEnviarEmailsOpen && (() => {
        const [anioStr, mesNum] = (mesParaEmails || '').split('-')
        const mesLabel = `${MESES[(parseInt(mesNum) || 1) - 1]} ${anioStr}`
        const totalAptos = recibosParaEmails.length
        const totalCarteraUsd = recibosParaEmails.reduce((s, r) => s + (r.total_usd || 0), 0)
        const totalCarteraBs = recibosParaEmails.reduce((s, r) => s + (r.total_bs || 0), 0)

        // Destinatarios en modo automático
        const aptosConCorreoAuto = recibosParaEmails.filter(
          r => r.apartamento?.propietario_email && r.apartamento.propietario_email.includes('@')
        )
        const aptosSinCorreoAuto = recibosParaEmails.filter(
          r => !r.apartamento?.propietario_email || !r.apartamento.propietario_email.includes('@')
        )
        const destinatariosAuto = aptosConCorreoAuto.map(r => ({
          recibo: r,
          email: r.apartamento!.propietario_email!.trim(),
          nombre: r.apartamento?.propietario_nombre || ''
        }))

        // Destinatarios en modo manual
        const aptosFiltradosManual = recibosParaEmails.filter(r => {
          if (!busquedaManual.trim()) return true
          const q = busquedaManual.toLowerCase()
          return (
            (r.apartamento?.numero || '').toLowerCase().includes(q) ||
            (nombresManuales[r.apartamento_id] || r.apartamento?.propietario_nombre || '').toLowerCase().includes(q) ||
            (emailsManuales[r.apartamento_id] || '').toLowerCase().includes(q)
          )
        })

        const destinatariosManuales = recibosParaEmails
          .filter(r => emailsManuales[r.apartamento_id] && emailsManuales[r.apartamento_id].includes('@'))
          .map(r => ({
            recibo: r,
            email: emailsManuales[r.apartamento_id].trim(),
            nombre: (nombresManuales[r.apartamento_id] ?? r.apartamento?.propietario_nombre ?? '').trim()
          }))

        const totalManualesListos = destinatariosManuales.length
        const totalManualesFaltantes = totalAptos - totalManualesListos

        const exitososLog = logDespacho.filter(l => l.ok).length
        const fallidosLog = logDespacho.filter(l => !l.ok)

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}>
            {/* Input oculto para carga de archivo Excel */}
            <input
              type="file"
              ref={excelInputRef}
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv"
              onChange={handleCargarExcelEmails}
            />

            <div style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '24px',
              maxWidth: pasoEmails === 'manual' ? '860px' : '680px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
              transition: 'max-width 0.2s ease'
            }}>
              {/* ENCABEZADO DEL MODAL */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid #1e293b',
                background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    ✉️
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      Enviar Correos de Recibos
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                      Descarga directa de PDF (sin login) y aviso contra acumulación de deuda
                    </p>
                  </div>
                </div>

                {!despachandoEmails && (
                  <button
                    onClick={() => setModalEnviarEmailsOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '22px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '8px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* BARRA DE PASOS / BREADCRUMBS */}
              <div style={{
                display: 'flex',
                backgroundColor: '#090d16',
                borderBottom: '1px solid #1e293b',
                padding: '8px 16px',
                gap: '8px',
                overflowX: 'auto',
                fontSize: '11.5px',
                fontWeight: 700
              }}>
                <span style={{ color: pasoEmails === 'mes' ? '#818cf8' : '#64748b' }}>
                  1. Mes Emitido {pasoEmails !== 'mes' && '✓'}
                </span>
                <span style={{ color: '#475569' }}>➔</span>
                <span style={{ color: pasoEmails === 'modo' ? '#818cf8' : (pasoEmails === 'automatico' || pasoEmails === 'manual' || pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#94a3b8' : '#475569' }}>
                  2. Modalidad (Auto / Manual) {(pasoEmails === 'automatico' || pasoEmails === 'manual' || pasoEmails === 'despacho' || pasoEmails === 'resumen') && '✓'}
                </span>
                <span style={{ color: '#475569' }}>➔</span>
                <span style={{ color: (pasoEmails === 'automatico' || pasoEmails === 'manual') ? '#818cf8' : (pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#94a3b8' : '#475569' }}>
                  3. Destinatarios {(pasoEmails === 'despacho' || pasoEmails === 'resumen') && '✓'}
                </span>
                <span style={{ color: '#475569' }}>➔</span>
                <span style={{ color: (pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#818cf8' : '#475569' }}>
                  4. Envío y Resultados
                </span>
              </div>

              {/* CUERPO DEL MODAL (SEGÚN PASO ACTUAL) */}
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>

                {/* ── PASO 1: SELECCIÓN DE MES ── */}
                {pasoEmails === 'mes' && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                      Paso 1: Seleccione el Mes Facturado
                    </h4>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                      Elija el período de recibos que desea notificar o recordar a los residentes.
                    </p>

                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '16px',
                      padding: '20px',
                      marginBottom: '24px'
                    }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                        Mes Facturado:
                      </label>
                      <select
                        value={mesParaEmails}
                        onChange={async (e) => {
                          const val = e.target.value
                          setMesParaEmails(val)
                          await cargarRecibosParaModalEmails(val)
                        }}
                        style={{
                          width: '100%',
                          backgroundColor: '#111827',
                          color: '#fff',
                          border: '1px solid #374151',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          fontSize: '14px',
                          fontWeight: 700,
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {mesesDisponibles.map(m => {
                          const [y, mesN] = m.split('-')
                          return <option key={m} value={m}>{MESES[(parseInt(mesN) || 1) - 1]} {y}</option>
                        })}
                      </select>

                      {/* Tarjeta con métricas del mes */}
                      {cargandoRecibosEmails ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                          Cargando recibos del mes...
                        </div>
                      ) : (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '12px',
                          marginTop: '16px'
                        }}>
                          <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Recibos Emitidos</div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>{totalAptos}</div>
                          </div>
                          <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Cartera</div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>${fmtUsd(totalCarteraUsd)}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>Bs. {fmtBs(totalCarteraBs)}</div>
                          </div>
                          <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Con Correo en App</div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>{aptosConCorreoAuto.length}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        onClick={() => setModalEnviarEmailsOpen(false)}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          border: 'none',
                          padding: '10px 18px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setPasoEmails('modo')}
                        disabled={totalAptos === 0 || cargandoRecibosEmails}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          color: '#fff',
                          border: 'none',
                          padding: '10px 22px',
                          borderRadius: '12px',
                          fontWeight: 800,
                          fontSize: '13px',
                          cursor: totalAptos === 0 || cargandoRecibosEmails ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                        }}
                      >
                        Continuar a Selección de Modalidad ➔
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 2: SELECCIÓN DE MODALIDAD (AUTO O MANUAL) ── */}
                {pasoEmails === 'modo' && (
                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                      Paso 2: ¿Cómo desea enviar los correos electrónicos?
                    </h4>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                      Período seleccionado: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong> ({totalAptos} apartamentos).
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>

                      {/* TARJETA MODALIDAD A: AUTOMÁTICA */}
                      <div
                        onClick={() => setPasoEmails('automatico')}
                        style={{
                          backgroundColor: '#090d16',
                          border: '2px solid rgba(99, 102, 241, 0.35)',
                          borderRadius: '18px',
                          padding: '22px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          transition: 'border-color 0.2s, transform 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#6366f1'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)'
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '28px' }}>🤖</span>
                            <div>
                              <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                                Envío Automático
                              </h5>
                              <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 700 }}>
                                (Correos de residentes en la plataforma)
                              </span>
                            </div>
                          </div>
                          <p style={{ color: '#cbd5e1', fontSize: '12.5px', lineHeight: 1.5, margin: '0 0 14px' }}>
                            Emitirá el correo electrónico de recordatorio a los usuarios registrados como residentes con el mes elegido.
                          </p>

                          <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '10px', padding: '10px 12px', fontSize: '11.5px', color: '#c7d2fe' }}>
                            <div>✓ <strong>{aptosConCorreoAuto.length}</strong> apartamentos listos con correo</div>
                            {aptosSinCorreoAuto.length > 0 && (
                              <div style={{ color: '#fca5a5', marginTop: '4px' }}>
                                ⚠️ {aptosSinCorreoAuto.length} apartamentos sin correo registrado
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          style={{
                            marginTop: '20px',
                            backgroundColor: 'rgba(99, 102, 241, 0.25)',
                            color: '#818cf8',
                            border: '1px solid rgba(99, 102, 241, 0.5)',
                            padding: '10px',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            cursor: 'pointer'
                          }}
                        >
                          Elegir Modo Automático ➔
                        </button>
                      </div>

                      {/* TARJETA MODALIDAD B: MANUAL O CON EXCEL */}
                      <div
                        onClick={() => setPasoEmails('manual')}
                        style={{
                          backgroundColor: '#090d16',
                          border: '2px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '18px',
                          padding: '22px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          transition: 'border-color 0.2s, transform 0.15s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#38bdf8'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)'
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '28px' }}>✍️</span>
                            <div>
                              <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                                Ingreso Manual / Carga Excel
                              </h5>
                              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                                (Asignación por apartamento)
                              </span>
                            </div>
                          </div>
                          <p style={{ color: '#cbd5e1', fontSize: '12.5px', lineHeight: 1.5, margin: '0 0 14px' }}>
                            Despliega la lista de apartamentos para ingresar el correo uno a uno o cargar un archivo Excel (.xlsx) que los llena automáticamente.
                          </p>

                          <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px', padding: '10px 12px', fontSize: '11.5px', color: '#bae6fd' }}>
                            <div>📥 Carga masiva mediante archivo Excel (.xlsx / .csv)</div>
                            <div style={{ marginTop: '3px' }}>📋 Plantilla descargable en 1 clic</div>
                            <div style={{ marginTop: '3px' }}>🎯 Envía al correo exacto indicado para cada apartamento</div>
                          </div>
                        </div>

                        <button
                          style={{
                            marginTop: '20px',
                            backgroundColor: 'rgba(56, 189, 248, 0.2)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.5)',
                            padding: '10px',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '12.5px',
                            cursor: 'pointer'
                          }}
                        >
                          Elegir Modo Manual / Excel ➔
                        </button>
                      </div>

                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <button
                        onClick={() => setPasoEmails('mes')}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          border: 'none',
                          padding: '10px 18px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        ← Volver a Selección de Mes
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 3A: CONFIRMACIÓN DE ENVÍO AUTOMÁTICO ── */}
                {pasoEmails === 'automatico' && (
                  <div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                      Confirmar Envío Automático
                    </h4>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                      Período: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong> · Total destinatarios: <strong style={{ color: '#34d399' }}>{destinatariosAuto.length} apartamentos</strong>
                    </p>

                    {/* Características clave del envío */}
                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '16px',
                      padding: '16px 20px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', marginBottom: '8px' }}>
                        ⚡ Novedad en estos correos:
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                        <div>📥 <strong>Descarga directa en 1 clic:</strong> Al dar clic en "Descargar recibo", el residente NO necesitará iniciar sesión ni ingresar en la app. El PDF se descargará automáticamente en su dispositivo.</div>
                        <div style={{ marginTop: '6px' }}>⚠️ <strong>Aviso anti-acumulaciones:</strong> Al pie del correo se incluye un recordatorio expreso para cancelar oportunamente y evitar acumulación de deudas o cargos de mora.</div>
                      </div>
                    </div>

                    {/* Alerta si hay apartamentos sin correo */}
                    {aptosSinCorreoAuto.length > 0 && (
                      <div style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '14px',
                        padding: '14px 16px',
                        marginBottom: '16px',
                        fontSize: '12px',
                        color: '#fca5a5'
                      }}>
                        <strong>⚠️ {aptosSinCorreoAuto.length} apartamentos sin correo registrado:</strong>
                        <div style={{ marginTop: '4px', color: '#fecaca', lineHeight: 1.5 }}>
                          {aptosSinCorreoAuto.map(r => `Apto. ${r.apartamento?.numero}`).join(', ')}
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#94a3b8' }}>
                          *Estos apartamentos serán omitidos en el envío automático. Si desea ingresarles un correo, seleccione la opción "Modo Manual".
                        </div>
                      </div>
                    )}

                    {/* Lista previa de destinatarios */}
                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      marginBottom: '20px'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#111827', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                            <th style={{ padding: '8px 12px' }}>Apto</th>
                            <th style={{ padding: '8px 12px' }}>Residente / Propietario</th>
                            <th style={{ padding: '8px 12px' }}>Correo Electrónico</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {destinatariosAuto.map(d => (
                            <tr key={d.recibo.id} style={{ borderBottom: '1px solid #1e293b30' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 800, color: '#fff' }}>
                                Apto. {d.recibo.apartamento?.numero}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                                {d.recibo.apartamento?.propietario_nombre || 'Sin nombre'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#818cf8', fontFamily: 'monospace' }}>
                                {d.email}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                                ${fmtUsd(d.recibo.total_usd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                      <button
                        onClick={() => setPasoEmails('modo')}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          border: 'none',
                          padding: '10px 18px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        ← Cambiar Modalidad
                      </button>

                      <button
                        onClick={() => ejecutarDespachoEmails(destinatariosAuto)}
                        disabled={destinatariosAuto.length === 0}
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          border: 'none',
                          padding: '12px 24px',
                          borderRadius: '12px',
                          fontWeight: 800,
                          fontSize: '13.5px',
                          cursor: destinatariosAuto.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                        }}
                      >
                        <span>🚀</span> Iniciar Envío Automático ({destinatariosAuto.length} correos)
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 3B: INGRESO MANUAL Y CARGA EXCEL ── */}
                {pasoEmails === 'manual' && (
                  <div>
                    {/* Barra de herramientas superior */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                          Asignación Manual y Excel
                        </h4>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          Mes: <strong style={{ color: '#38bdf8' }}>{mesLabel}</strong> ({totalAptos} apartamentos)
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Botón Cargar Excel */}
                        <button
                          onClick={() => excelInputRef.current?.click()}
                          style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            padding: '7px 14px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title="Importar archivo Excel con columnas de apartamento y correo"
                        >
                          <span>📥</span> Cargar Excel (.xlsx / .csv)
                        </button>

                        {/* Botón Descargar Plantilla */}
                        <button
                          onClick={handleDescargarPlantillaExcel}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#cbd5e1',
                            border: '1px solid #334155',
                            padding: '7px 14px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title="Descargar plantilla de Excel pre-llenada con los apartamentos"
                        >
                          <span>📋</span> Descargar Plantilla
                        </button>

                        {/* Botón Llenar con registrados */}
                        <button
                          onClick={() => {
                            const nuevoEmails = { ...emailsManuales }
                            const nuevoNombres = { ...nombresManuales }
                            let c = 0
                            recibosParaEmails.forEach(r => {
                              if (!nuevoEmails[r.apartamento_id] && r.apartamento?.propietario_email) {
                                nuevoEmails[r.apartamento_id] = r.apartamento.propietario_email
                                c++
                              }
                              if (!nuevoNombres[r.apartamento_id] && r.apartamento?.propietario_nombre) {
                                nuevoNombres[r.apartamento_id] = r.apartamento.propietario_nombre
                              }
                            })
                            setEmailsManuales(nuevoEmails)
                            setNombresManuales(nuevoNombres)
                            showToast(`✓ Se autocompletaron ${c} casillas con datos registrados.`)
                          }}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            padding: '7px 12px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          title="Rellenar casillas vacías con correos y nombres registrados en perfiles"
                        >
                          🔄 Llenar registrados
                        </button>

                        {/* Limpiar */}
                        <button
                          onClick={() => {
                            if (window.confirm('¿Deseas limpiar todos los correos y nombres personalizados ingresados en las casillas?')) {
                              setEmailsManuales({})
                              setNombresManuales({})
                            }
                          }}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#f87171',
                            border: '1px solid #334155',
                            padding: '7px 10px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          title="Limpiar todas las casillas"
                        >
                          🧹
                        </button>
                      </div>
                    </div>

                    {/* Filtro y Barra de Progreso de Casillas */}
                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '14px',
                      padding: '12px 16px',
                      marginBottom: '16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <input
                          type="text"
                          placeholder="🔍 Buscar por número de apartamento o residente..."
                          value={busquedaManual}
                          onChange={e => setBusquedaManual(e.target.value)}
                          style={{
                            width: '100%',
                            backgroundColor: '#111827',
                            color: '#fff',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '12.5px',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: totalManualesListos === totalAptos ? '#34d399' : '#eab308' }}>
                          {totalManualesListos} de {totalAptos} con correo ({Math.round((totalManualesListos / (totalAptos || 1)) * 100)}%)
                        </span>
                        <div style={{ width: '100px', height: '8px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${(totalManualesListos / (totalAptos || 1)) * 100}%`,
                            height: '100%',
                            backgroundColor: totalManualesListos === totalAptos ? '#10b981' : '#f59e0b',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                      </div>
                    </div>

                    {/* Checkbox para guardar en perfiles */}
                    <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="checkGuardarPerfil"
                        checked={guardarEmailsEnPerfil}
                        onChange={e => setGuardarEmailsEnPerfil(e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#6366f1' }}
                      />
                      <label htmlFor="checkGuardarPerfil" style={{ fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600 }}>
                        Guardar estos correos en el sistema para futuros envíos de estos apartamentos
                      </label>
                    </div>

                    {/* Tabla de Apartamentos con Input por Apartamento */}
                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      maxHeight: '330px',
                      overflowY: 'auto',
                      marginBottom: '20px'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#111827', zIndex: 2 }}>
                          <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                            <th style={{ padding: '10px 14px', width: '110px' }}>Inmueble</th>
                            <th style={{ padding: '10px 14px', minWidth: '180px' }}>Nombre que saldrá en el Recibo</th>
                            <th style={{ padding: '10px 14px', width: '110px' }}>Cuota Mes</th>
                            <th style={{ padding: '10px 14px', minWidth: '220px' }}>Correo Electrónico para Envío</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aptosFiltradosManual.map(r => {
                            const valEmail = emailsManuales[r.apartamento_id] || ''
                            const esValido = valEmail.includes('@') && valEmail.includes('.')
                            const valNombre = nombresManuales[r.apartamento_id] ?? r.apartamento?.propietario_nombre ?? ''

                            return (
                              <tr key={r.id} style={{ borderBottom: '1px solid #1e293b30' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px'
                                  }}>
                                    Apto. {r.apartamento?.numero}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <input
                                    type="text"
                                    placeholder={r.apartamento?.propietario_nombre || 'Nombre de propietario...'}
                                    value={valNombre}
                                    onChange={e => {
                                      const v = e.target.value
                                      setNombresManuales(prev => ({
                                        ...prev,
                                        [r.apartamento_id]: v
                                      }))
                                    }}
                                    style={{
                                      width: '100%',
                                      backgroundColor: '#0a0f1d',
                                      color: '#fff',
                                      border: '1px solid #374151',
                                      borderRadius: '8px',
                                      padding: '7px 10px',
                                      fontSize: '12px',
                                      outline: 'none',
                                      transition: 'border-color 0.2s'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700, color: '#38bdf8' }}>${fmtUsd(r.total_usd)}</div>
                                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Bs. {fmtBs(r.total_bs)}</div>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                      type="email"
                                      placeholder="correo@ejemplo.com"
                                      value={valEmail}
                                      onChange={e => {
                                        const v = e.target.value
                                        setEmailsManuales(prev => ({
                                          ...prev,
                                          [r.apartamento_id]: v
                                        }))
                                      }}
                                      style={{
                                        width: '100%',
                                        backgroundColor: '#0a0f1d',
                                        color: '#fff',
                                        border: `1px solid ${esValido ? '#10b98160' : valEmail ? '#ef444460' : '#374151'}`,
                                        borderRadius: '8px',
                                        padding: '7px 28px 7px 10px',
                                        fontSize: '12px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                      }}
                                    />
                                    <span style={{ position: 'absolute', right: '8px', fontSize: '13px' }}>
                                      {esValido ? '✅' : valEmail ? '⚠️' : '⚪'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Acciones al pie */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setPasoEmails('modo')}
                        style={{
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          border: 'none',
                          padding: '10px 18px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        ← Cambiar Modalidad
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {totalManualesFaltantes > 0 && (
                          <span style={{ fontSize: '11.5px', color: '#eab308' }}>
                            ⚠️ {totalManualesFaltantes} sin correo (se enviará a los {totalManualesListos} listos)
                          </span>
                        )}

                        <button
                          onClick={() => {
                            if (totalManualesListos === 0) {
                              alert('Por favor ingresa o carga al menos un correo electrónico válido.')
                              return
                            }
                            if (totalManualesFaltantes > 0) {
                              if (!window.confirm(`Hay ${totalManualesFaltantes} apartamento(s) sin correo electrónico ingresado. ¿Deseas enviar los correos únicamente a los ${totalManualesListos} apartamentos que tienen correo?`)) {
                                return
                              }
                            }
                            ejecutarDespachoEmails(destinatariosManuales)
                          }}
                          disabled={totalManualesListos === 0}
                          style={{
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                            color: '#fff',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '12px',
                            fontWeight: 800,
                            fontSize: '13.5px',
                            cursor: totalManualesListos === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
                          }}
                        >
                          <span>🚀</span> Enviar Correos ({totalManualesListos} apartamentos)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PASO 4: PROGRESO DE DESPACHO EN VIVO ── */}
                {pasoEmails === 'despacho' && (
                  <div style={{ textAlign: 'center', padding: '16px 8px' }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      border: '4px solid rgba(99, 102, 241, 0.2)',
                      borderTopColor: '#6366f1',
                      animation: 'spin 0.9s linear infinite',
                      margin: '0 auto 16px'
                    }} />

                    <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                      Enviando Correos Electrónicos...
                    </h4>
                    <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#94a3b8' }}>
                      {progresoDespacho.texto}
                    </p>

                    {/* Barra de progreso */}
                    <div style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '10px',
                      height: '14px',
                      overflow: 'hidden',
                      marginBottom: '10px',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: `${(progresoDespacho.actual / (progresoDespacho.total || 1)) * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #6366f1 0%, #38bdf8 100%)',
                        transition: 'width 0.2s'
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
                      <span>Enviado: {progresoDespacho.actual} de {progresoDespacho.total}</span>
                      <span>{Math.round((progresoDespacho.actual / (progresoDespacho.total || 1)) * 100)}%</span>
                    </div>

                    {/* Visor de terminal en vivo */}
                    <div style={{
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      padding: '12px',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      textAlign: 'left',
                      fontFamily: 'monospace',
                      fontSize: '11.5px',
                      marginBottom: '20px'
                    }}>
                      {logDespacho.length === 0 ? (
                        <div style={{ color: '#64748b' }}>Conectando con servicio de correo...</div>
                      ) : (
                        logDespacho.map((l, idx) => (
                          <div key={idx} style={{ color: l.ok ? '#34d399' : '#f87171', marginBottom: '4px' }}>
                            {l.ok ? '✓' : '✗'} Apto. {l.apto} ({l.email}) — {l.ok ? 'Enviado correctamente' : `Error: ${l.error || 'Fallo de envío'}`}
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => {
                        cancelarDespachoRef.current = true
                        showToast('Deteniendo despacho...')
                      }}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        padding: '8px 18px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ⏹️ Detener Despacho
                    </button>
                  </div>
                )}

                {/* ── PASO 5: RESUMEN FINAL DE RESULTADOS ── */}
                {pasoEmails === 'resumen' && (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ fontSize: '46px', marginBottom: '8px' }}>🎉</div>
                    <h4 style={{ margin: '0 0 6px', fontSize: '19px', fontWeight: 800, color: '#fff' }}>
                      ¡Despacho de Correos Finalizado!
                    </h4>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
                      Período procesado: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong>
                    </p>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '12px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '14px', padding: '14px' }}>
                        <div style={{ fontSize: '11.5px', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>Enviados con Éxito</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{exitososLog}</div>
                      </div>

                      <div style={{ backgroundColor: fallidosLog.length > 0 ? 'rgba(239, 68, 68, 0.1)' : '#1e293b30', border: `1px solid ${fallidosLog.length > 0 ? 'rgba(239, 68, 68, 0.3)' : '#1e293b'}`, borderRadius: '14px', padding: '14px' }}>
                        <div style={{ fontSize: '11.5px', color: fallidosLog.length > 0 ? '#f87171' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Con Fallas / Omitidos</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: fallidosLog.length > 0 ? '#ef4444' : '#94a3b8', marginTop: '4px' }}>{fallidosLog.length}</div>
                      </div>
                    </div>

                    {/* Detalle de fallidos si hubo */}
                    {fallidosLog.length > 0 && (
                      <div style={{
                        backgroundColor: '#090d16',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '14px',
                        padding: '12px',
                        maxHeight: '140px',
                        overflowY: 'auto',
                        textAlign: 'left',
                        fontSize: '12px',
                        marginBottom: '20px'
                      }}>
                        <div style={{ fontWeight: 800, color: '#f87171', marginBottom: '6px' }}>Detalle de envíos fallidos:</div>
                        {fallidosLog.map((f, i) => (
                          <div key={i} style={{ color: '#cbd5e1', marginBottom: '4px' }}>
                            • <strong>Apto. {f.apto}</strong> ({f.email}): <span style={{ color: '#fca5a5' }}>{f.error || 'Error'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                      {fallidosLog.length > 0 && (
                        <button
                          onClick={() => {
                            const paraReintentar = fallidosLog.map(f => {
                              const r = recibosParaEmails.find(rec => rec.apartamento?.numero === f.apto)
                              return r ? { recibo: r, email: f.email } : null
                            }).filter(Boolean) as Array<{ recibo: ReciboEmitido; email: string }>
                            ejecutarDespachoEmails(paraReintentar)
                          }}
                          style={{
                            backgroundColor: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          🔄 Reintentar Fallidos ({fallidosLog.length})
                        </button>
                      )}

                      <button
                        onClick={() => setModalEnviarEmailsOpen(false)}
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: '#fff',
                          border: 'none',
                          padding: '10px 24px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                        }}
                      >
                        ✓ Finalizar y Cerrar
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
