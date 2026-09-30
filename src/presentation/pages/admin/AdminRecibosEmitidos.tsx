import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../data/supabase'
import { useAuth } from '../../../application/contexts/AuthContext'
import { registrarEventoAuditoria } from '../../../data/auditoriaService'
import { generarPDFRecibo, ReciboAptoData, ReciboGastoData, ReciboCargoData, ReciboConfigData } from '../../../utils/reciboPdfGenerator'
import { compararApartamentos, formatAlicuotaPct } from '../../../utils/alicuota'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SkeletonCard, SkeletonChart, SkeletonTable } from '../../components/Skeleton'
import { generarMensajeCobroRecibo, generarMensajeReciboPagado, abrirWhatsApp } from '../../../utils/whatsappHelper'

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
  data_json: {
    gastos?: Array<{ descripcion: string; monto_usd: number; monto_bs: number; categoria?: string }>
    cargos_especiales?: Array<{ tipo: string; descripcion: string; monto_usd: number; monto_bs?: number }>
    fondo_reserva_pct?: number
    notas_residentes?: string
  } | null
  emitido_at: string
  // Datos unidos del apartamento y perfil
  apartamento?: {
    numero: string
    piso: number | null
    alicuota: number
    propietario_nombre: string | null
    telefono_contacto: string | null
  }
}

interface ConfigEdificio {
  nombre_edificio: string
  rif: string | null
  direccion: string | null
  email_contacto: string | null
  banco: string | null
  cuenta_bancaria: string | null
  titular_cuenta: string | null
  tasa_bcv_actual: number
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const fmtBs  = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const AdminRecibosEmitidos: React.FC = () => {
  const { perfil } = useAuth()
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [mesSeleccionado, setMesSeleccionado] = useState<string>('')
  const [recibos, setRecibos] = useState<ReciboEmitido[]>([])
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'pagado'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [reciboModal, setReciboModal] = useState<ReciboEmitido | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [cambiandoEstadoId, setCambiandoEstadoId] = useState<string | null>(null)

  // ── Estados para "Retirar deuda o eliminar emisión" con Auditoría ──────────
  const [modalEliminarEmisionOpen, setModalEliminarEmisionOpen] = useState(false)
  const [motivoEliminarEmision, setMotivoEliminarEmision] = useState('')
  const [palabraConfirmacion, setPalabraConfirmacion] = useState('')
  const [eliminandoEmision, setEliminandoEmision] = useState(false)

  const [modalEliminarReciboOpen, setModalEliminarReciboOpen] = useState(false)
  const [reciboParaEliminar, setReciboParaEliminar] = useState<ReciboEmitido | null>(null)
  const [motivoEliminarRecibo, setMotivoEliminarRecibo] = useState('')
  const [eliminandoRecibo, setEliminandoRecibo] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
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
        if (!mesSeleccionado || !unicos.includes(mesSeleccionado)) {
          setMesSeleccionado(unicos[0])
        }
      } else {
        setMesesDisponibles([])
      }
    } finally {
      setLoading(false)
    }
  }, [mesSeleccionado])

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
        supabase.from('perfiles').select('id, apartamento_id, nombre_completo, condicion_habitacional, propietario_nombre, telefono')
      ])

      const aptosMap = new Map<string, any>()
      aptosRes.data?.forEach(a => aptosMap.set(a.id, a))

      const perfilesMap = new Map<string, any>()
      perfilesRes.data?.forEach(p => {
        if (p.apartamento_id) perfilesMap.set(p.apartamento_id, p)
      })

      const recibosCompletos: ReciboEmitido[] = (recibosRes.data || []).map(r => {
        const aptoBase = aptosMap.get(r.apartamento_id)
        const perfil = perfilesMap.get(r.apartamento_id)

        const propNombre = (perfil?.condicion_habitacional === 'alquilado' && perfil?.propietario_nombre)
          ? perfil.propietario_nombre
          : (perfil?.nombre_completo || aptoBase?.propietario_nombre || null)

        const telefono = perfil?.telefono || aptoBase?.telefono_contacto || null

        return {
          ...r,
          apartamento: {
            numero: aptoBase?.numero || 'S/N',
            piso: aptoBase?.piso ?? null,
            alicuota: aptoBase?.alicuota || r.alicuota,
            propietario_nombre: propNombre,
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
        showToast(`✅ Recibo Apto ${recibo.apartamento?.numero} marcado como ${nuevoEstado.toUpperCase()}`)
      }
    } finally {
      setCambiandoEstadoId(null)
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

    const doc = generarPDFRecibo(
      aptoData,
      gastos,
      cargos,
      configData,
      r.fondo_reserva_pct || 10,
      mesLabel,
      anio,
      r.data_json?.notas_residentes,
      r.estado === 'pagado' ? { estado: 'pagado', monto_bs: r.total_bs, monto_usd: r.total_usd } : undefined
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
        tasaBcv: r.tasa_bcv || config?.tasa_bcv_actual || 1,
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
                onChange={e => setMesSeleccionado(e.target.value)}
                style={{
                  backgroundColor: '#0a0a0a', color: '#f97316', border: '1px solid #f9731650',
                  padding: '6px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none', cursor: 'pointer'
                }}
              >
                {mesesDisponibles.map(m => {
                  const [anioStr, mesNum] = m.split('-')
                  const label = `${MESES[(parseInt(mesNum)||1) - 1]} ${anioStr}`
                  return <option key={m} value={m}>{label}</option>
                })}
              </select>
            </div>
          )}

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
                Tasa BCV: Bs. {recibos[0]?.tasa_bcv || 40}
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
                <span style={{ color: '#f97316', fontSize: '12px', fontWeight: 700 }}>Total: $ {fmtUsd(stats.totalGastosComunesUsd)}</span>
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
                        backgroundColor: filtroEstado === tab.id ? '#f97316' : 'transparent',
                        color: filtroEstado === tab.id ? '#fff' : '#888',
                        border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '11.5px', fontWeight: 700, transition: 'all 0.15s'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabla */}
            {recibosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#777' }}>
                <p>No se encontraron recibos con los filtros actuales.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
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
                          <td style={{ padding: '12px', fontWeight: 800, color: '#f97316', whiteSpace: 'nowrap' }}>
                            Apto {r.apartamento?.numero} {esPH && <span style={{ backgroundColor: '#f9731620', color: '#f97316', border: '1px solid #f9731640', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px' }}>PH</span>}
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
                <span style={{ color: '#f97316', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
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
                <div style={{ color: '#f97316', fontSize: '20px', fontWeight: 900 }}>$ {fmtUsd(reciboModal.total_usd)}</div>
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
                <div style={{ color: '#f97316', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
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
                  onClick={() => descargarPDFReciboEmitido(reciboModal)}
                  style={{
                    backgroundColor: '#f97316', color: '#fff', border: 'none',
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
              Esta acción eliminará <strong>en su totalidad la emisión de recibos de {mesLabelActivo}</strong> para todos los <strong>{recibos.length} apartamentos</strong>, retirando una deuda total de <strong style={{ color: '#f97316' }}>$ {fmtUsd(stats.totalFacturadoUsd)} USD (Bs. {fmtBs(stats.totalFacturadoBs)})</strong>.
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
            backgroundColor: '#111318', border: '2px solid #f97316', borderRadius: '20px',
            maxWidth: '500px', width: '100%', padding: '24px', boxShadow: '0 25px 60px rgba(249, 115, 22, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
              }}>
                📄
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Retirar Deuda - Apto {reciboParaEliminar.apartamento?.numero}
                </h3>
                <span style={{ color: '#f97316', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo}
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 14px' }}>
              Se anulará el recibo emitido y se retirará la deuda del <strong>Apartamento {reciboParaEliminar.apartamento?.numero}</strong> por un monto de <strong style={{ color: '#f97316' }}>$ {fmtUsd(reciboParaEliminar.total_usd)} USD (Bs. {fmtBs(reciboParaEliminar.total_bs)})</strong>. El apartamento quedará sin deuda para este mes.
            </p>

            <div style={{
              backgroundColor: 'rgba(249, 115, 22, 0.08)',
              border: '1px solid rgba(249, 115, 22, 0.25)',
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
                  backgroundColor: motivoEliminarRecibo.trim().length >= 6 ? '#ea580c' : '#451a1a',
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

    </div>
  )
}
