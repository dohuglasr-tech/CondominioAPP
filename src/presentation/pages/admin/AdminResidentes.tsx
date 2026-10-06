import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { formatAlicuotaPct, parseAlicuotaInput, getAlicuotaDecimal, getAlicuotaPctNumber, compararApartamentos } from '../../../utils/alicuota'
import { useAuth } from '../../../application/contexts/AuthContext'
import { useBcvRate } from '../../../data/useBcvRate'
import { obtenerTodosLosSaldosAFavor, SaldoApartamento } from '../../../data/saldoFavorService'
import { obtenerDeudasMora, DeudaMoraItem, TASA_RIESGO_CONFIG } from '../../../data/moraService'
import { RetirarSaldoModal } from '../../components/RetirarSaldoModal'
import { AbonarSaldoModal } from '../../components/AbonarSaldoModal'
import { CompensarDeudaModal } from '../../components/CompensarDeudaModal'
import { descargarExpedienteLegalApto, ExpedienteLegalAptoData } from '../../../utils/expedienteLegalPdfGenerator'
import { obtenerJunta } from '../../../data/juntaService'
import { sendResidentPasswordReset } from '../../../data/passwordRecoveryService'
import { EnviarExpedienteEmailModal } from '../../components/EnviarExpedienteEmailModal'

interface PersonaContacto {
  nombre: string
  telefono: string
  email: string
}

interface PagoHistorial {
  id: string
  fecha: string
  mes: string
  monto: string
  monto_usd?: number | null
  monto_bs?: number
  referencia: string
  estado: 'aprobado' | 'pendiente' | 'rechazado'
  banco?: string
  comprobante_url?: string | null
  notas_admin?: string | null
}

interface ReciboGeneradoItem {
  id: string
  apartamento_id: string
  mes_facturado: string
  total_usd: number
  total_bs: number
  tasa_bcv?: number
  estado: 'pendiente' | 'pagado'
  emitido_at?: string
}

interface Residente {
  id: string
  apartamento_id: string
  apartamento: string
  piso: number | null
  alicuota: number
  alicuota_input: string
  es_ph: boolean
  tiene_usuario: boolean
  usuario_id?: string
  estado_ocupacion: 'ocupado_propietario' | 'alquilado' | 'desocupado'
  meses_deuda: number
  deuda_usd: number
  deuda_bs: number
  notas_internas: string
  propietario: PersonaContacto
  inquilino?: PersonaContacto
  historial_pagos: PagoHistorial[]
  recibos_emitidos: ReciboGeneradoItem[]
  mora_item?: DeudaMoraItem
  reportes_abiertos: number
  created_at?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0a0a0a',
  border: '1px solid #2a2a2a',
  color: '#fff',
  padding: '11px 13px',
  borderRadius: '8px',
  fontSize: '13px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#888',
  fontSize: '12px',
  marginBottom: '6px',
}

export const AdminResidentes: React.FC = () => {
  const navigate = useNavigate()
  const { perfil, user, config } = useAuth()
  const { rate } = useBcvRate()
  const tasaBcvValida = rate && rate > 1 ? rate : 859.06

  const [residentes, setResidentes] = useState<Residente[]>([])
  const [saldosPorApto, setSaldosPorApto] = useState<Map<string, SaldoApartamento>>(new Map())
  const [deudasPorApto, setDeudasPorApto] = useState<Map<string, { totalUsd: number; totalBs: number }>>(new Map())
  const [saldoModalOpen, setSaldoModalOpen] = useState(false)
  const [abonarModalOpen, setAbonarModalOpen] = useState(false)
  const [compensarModalOpen, setCompensarModalOpen] = useState(false)
  const [comprobanteModalUrl, setComprobanteModalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generandoPdfId, setGenerandoPdfId] = useState<string | null>(null)
  const [enviandoResetAptoId, setEnviandoResetAptoId] = useState<string | null>(null)
  const [modalEmailExpedienteOpen, setModalEmailExpedienteOpen] = useState(false)
  const [expedienteParaEmail, setExpedienteParaEmail] = useState<ExpedienteLegalAptoData | null>(null)
  const [cargandoExpedienteEmail, setCargandoExpedienteEmail] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'con_deuda' | 'solventes' | 'con_usuario' | 'ph'>('todos')
  const [tabActiva, setTabActiva] = useState<'deudas' | 'recibos' | 'pagos' | 'datos'>('deudas')
  const [selected, setSelected] = useState<Residente | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<Residente | null>(null)
  const [guardando, setGuardando] = useState(false)

  // ── Detección de vista móvil ───────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  )

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Estado para modal de borrado de usuario
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const cargarResidentes = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const [aptosRes, perfilesRes, pagosRes, saldosMap, moraRes, recibosGeneradosRes] = await Promise.all([
        supabase.from('apartamentos').select('*'),
        supabase.from('perfiles').select('*'),
        supabase.from('pagos_reportados').select('id, apartamento_id, monto_bs, monto_usd, referencia, estado, fecha_pago, comprobante_url, created_at, notas_admin').order('created_at', { ascending: false }),
        obtenerTodosLosSaldosAFavor(tasaBcvValida, forceRefresh),
        obtenerDeudasMora(forceRefresh, true),
        supabase.from('recibos_generados').select('id, apartamento_id, mes_facturado, total_usd, total_bs, tasa_bcv, estado, emitido_at').order('mes_facturado', { ascending: false })
      ])

      setSaldosPorApto(saldosMap)

      // Mapa de deudas por apartamento (de moraService)
      const moraMap = new Map<string, DeudaMoraItem>()
      const dMap = new Map<string, { totalUsd: number; totalBs: number }>()

      ;(moraRes.data || []).forEach(m => {
        if (!m.apartamento_id) return
        moraMap.set(m.apartamento_id, m)
        dMap.set(m.apartamento_id, {
          totalUsd: Number(m.monto_usd || 0),
          totalBs: Number(m.monto_bs || 0)
        })
      })
      setDeudasPorApto(dMap)

      const aptosList = aptosRes.data || []
      const perfilesList = perfilesRes.data || []
      const pagosList = pagosRes.data || []
      const recibosList = (recibosGeneradosRes.data || []) as ReciboGeneradoItem[]

      // Mapear perfiles por apartamento_id
      const perfilPorApto = new Map<string, any>()
      perfilesList.forEach((p: any) => {
        if (p.apartamento_id) {
          perfilPorApto.set(p.apartamento_id, p)
        }
      })

      // Mapear recibos por apartamento_id
      const recibosPorApto = new Map<string, ReciboGeneradoItem[]>()
      recibosList.forEach(r => {
        if (!r.apartamento_id) return
        const list = recibosPorApto.get(r.apartamento_id) || []
        list.push(r)
        recibosPorApto.set(r.apartamento_id, list)
      })

      // Mapear pagos por apartamento_id
      const pagosPorApto = new Map<string, PagoHistorial[]>()
      pagosList.forEach((p: any) => {
        const aptoId = p.apartamento_id
        if (aptoId) {
          const list = pagosPorApto.get(aptoId) || []
          let banco = 'Transferencia'
          if (p.notas_admin && p.notas_admin.includes('Banco')) {
            const match = p.notas_admin.match(/Banco(?: Origen)?:\s*([^\n,]+)/i)
            if (match) banco = match[1].trim()
          }
          list.push({
            id: p.id,
            fecha: p.fecha_pago || p.created_at,
            mes: p.created_at?.substring(0, 7) || 'Reciente',
            monto: p.monto_usd && p.monto_usd > 0
              ? `$${Number(p.monto_usd).toFixed(2)} / Bs. ${Number(p.monto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
              : `Bs. ${Number(p.monto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
            monto_usd: p.monto_usd,
            monto_bs: p.monto_bs,
            referencia: p.referencia || 'S/R',
            estado: p.estado || 'aprobado',
            banco,
            comprobante_url: p.comprobante_url,
            notas_admin: p.notas_admin
          })
          pagosPorApto.set(aptoId, list)
        }
      })

      // Unir datos para la vista
      const listaFormateada: Residente[] = aptosList.map((a: any) => {
        const perfil = perfilPorApto.get(a.id)
        const moraItem = moraMap.get(a.id)
        const esAlquilado = perfil?.condicion_habitacional === 'alquilado'
        const alicuotaPct = getAlicuotaPctNumber(a.alicuota)
        const esPh = a.numero?.toUpperCase().includes('PH') || a.piso === 0 || a.piso === 11 || alicuotaPct > 2.0
        const alicuotaDecimal = getAlicuotaDecimal(a.alicuota) || (esPh ? 0.0259 : 0.0159)
        const pctDisplay = alicuotaPct > 0 ? alicuotaPct : (esPh ? 2.59 : 1.59)

        const propNombre = esAlquilado
          ? (perfil?.propietario_nombre || a.propietario_nombre || 'N/D')
          : (perfil?.nombre_completo || a.propietario_nombre || 'Sin registrar')

        const propTel = esAlquilado
          ? (perfil?.propietario_telefono || a.telefono_contacto || 'N/D')
          : (perfil?.telefono || a.telefono_contacto || 'Sin teléfono')

        const propEmail = perfil?.propietario_email || perfil?.email || ''

        return {
          id: a.id,
          apartamento_id: a.id,
          apartamento: a.numero || 'S/N',
          piso: a.piso ?? null,
          alicuota: alicuotaDecimal,
          alicuota_input: pctDisplay.toString(),
          es_ph: !!esPh,
          tiene_usuario: !!perfil,
          usuario_id: perfil?.id,
          estado_ocupacion: a.estado === 'desocupado'
            ? 'desocupado'
            : esAlquilado ? 'alquilado' : 'ocupado_propietario',
          meses_deuda: moraItem?.meses_deuda || 0,
          deuda_usd: moraItem?.monto_usd || 0,
          deuda_bs: moraItem?.monto_bs || 0,
          notas_internas: a.notas || '',
          propietario: {
            nombre: propNombre,
            telefono: propTel,
            email: propEmail,
          },
          inquilino: esAlquilado ? {
            nombre: perfil?.nombre_completo || 'Inquilino sin nombre',
            telefono: perfil?.telefono || 'N/D',
            email: perfil?.email || '',
          } : undefined,
          historial_pagos: pagosPorApto.get(a.id) || [],
          recibos_emitidos: recibosPorApto.get(a.id) || [],
          mora_item: moraItem,
          reportes_abiertos: 0,
          created_at: a.created_at
        }
      })

      // Ordenar por número de apartamento respetando la jerarquía de pisos y PH
      listaFormateada.sort((a, b) => compararApartamentos(a.apartamento, b.apartamento))

      setResidentes(listaFormateada)

      // Si había uno seleccionado, refrescar su data
      if (selected) {
        const act = listaFormateada.find(x => x.id === selected.id)
        if (act) setSelected(act)
      }
    } catch (err) {
      console.error('[AdminResidentes] Error cargando residentes:', err)
    } finally {
      setLoading(false)
    }
  }, [selected, tasaBcvValida])

  useEffect(() => {
    cargarResidentes()
  }, []) // eslint-disable-line

  // ── Eliminar usuario o desvincular ──────
  const handleEliminarUsuario = async () => {
    if (!selected) return
    setDeleting(true)
    setDeleteMessage(null)

    try {
      if (selected.usuario_id) {
        const { error: rpcError } = await supabase.rpc('admin_delete_user', {
          target_user_id: selected.usuario_id,
        })

        if (rpcError) {
          console.warn('[AdminResidentes] RPC falló, usando borrado directo:', rpcError.message)
          await supabase.from('pagos_reportados').delete().eq('reportado_por', selected.usuario_id)
          const { error: delPerfilesErr } = await supabase.from('perfiles').delete().eq('id', selected.usuario_id)
          if (delPerfilesErr) throw delPerfilesErr
        }
      }

      // Restablecer apartamento a sin usuario asignado
      await supabase.from('apartamentos').update({
        propietario_nombre: null,
        telefono_contacto: null,
        estado: 'habitado'
      }).eq('id', selected.apartamento_id)

      appCache.invalidateTags(['apartamentos', 'residentes', 'pagos', 'saldos', 'mora'])

      setDeleteMessage({
        type: 'success',
        text: `El usuario del Apto ${selected.apartamento} fue eliminado. El apartamento se mantiene disponible en el edificio.`,
      })

      setShowDeleteModal(false)
      if (isMobile) {
        setSelected(null)
      }
      await cargarResidentes()
    } catch (err: any) {
      console.error('[AdminResidentes] Error eliminando usuario:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al eliminar el usuario: ${err.message || 'Intente nuevamente'}.`,
      })
    } finally {
      setDeleting(false)
    }
  }

  // ── Guardar datos (incluyendo Alícuota) ──────
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setGuardando(true)

    try {
      const alicuotaDecimal = parseAlicuotaInput(form.alicuota_input)

      // 1. Actualizar tabla apartamentos
      const { error: aptErr } = await supabase.from('apartamentos').update({
        alicuota: alicuotaDecimal,
        propietario_nombre: form.propietario.nombre !== 'Sin registrar' ? form.propietario.nombre : null,
        telefono_contacto: form.propietario.telefono !== 'Sin teléfono' ? form.propietario.telefono : null,
        estado: form.estado_ocupacion === 'desocupado' ? 'desocupado' : 'habitado',
      }).eq('id', form.apartamento_id)

      if (aptErr) throw aptErr

      // 2. Si tiene usuario en perfiles, actualizar perfil
      if (form.usuario_id) {
        const payloadPerfil: Record<string, any> = {
          condicion_habitacional: form.estado_ocupacion === 'alquilado' ? 'alquilado' : 'propio',
        }

        if (form.estado_ocupacion === 'alquilado') {
          payloadPerfil.nombre_completo = form.inquilino?.nombre || form.propietario.nombre
          payloadPerfil.telefono = form.inquilino?.telefono || form.propietario.telefono
          payloadPerfil.propietario_nombre = form.propietario.nombre
          payloadPerfil.propietario_telefono = form.propietario.telefono
          payloadPerfil.propietario_email = form.propietario.email
        } else {
          payloadPerfil.nombre_completo = form.propietario.nombre
          payloadPerfil.telefono = form.propietario.telefono
          payloadPerfil.propietario_email = form.propietario.email
        }

        const { error: perfErr } = await supabase
          .from('perfiles')
          .update(payloadPerfil)
          .eq('id', form.usuario_id)

        if (perfErr) {
          console.warn('[AdminResidentes] Error actualizando perfil:', perfErr.message)
        }
      }

      setDeleteMessage({
        type: 'success',
        text: `Datos del Apto ${form.apartamento} actualizados exitosamente (Alícuota: ${formatAlicuotaPct(alicuotaDecimal)}).`
      })

      appCache.invalidateTags(['apartamentos', 'residentes', 'saldos', 'mora'])

      setEditMode(false)
      await cargarResidentes()
    } catch (err: any) {
      console.error('[AdminResidentes] Error al guardar residente:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al guardar cambios: ${err.message || 'Error desconocido'}`
      })
    } finally {
      setGuardando(false)
    }
  }

  // ── Construir estructura completa de datos del Expediente Legal ─────────────
  const construirDatosExpedienteLegal = async (residente: Residente): Promise<ExpedienteLegalAptoData> => {
    // 1. Obtener miembros de junta para firmas formales
    let presidenteNombre = ''
    let tesoreroNombre = ''
    try {
      const juntaRes = await obtenerJunta()
      const junta = juntaRes.data || []
      const presi = junta.find((m: any) => /presidente|administrador|coord/i.test(m.cargo))
      const tesor = junta.find((m: any) => /tesorero|finanzas|control/i.test(m.cargo))
      if (presi) presidenteNombre = presi.nombre
      if (tesor) tesoreroNombre = tesor.nombre
    } catch (e) {
      console.warn('[AdminResidentes] No se pudo obtener organigrama para firmas:', e)
    }

    // 2. Consultar historial de auditoría y datos ampliados del apartamento
    const [auditRes, aptoDbRes] = await Promise.all([
      supabase
        .from('historial_auditoria')
        .select('*')
        .or(`apartamento_id.eq.${residente.id},apartamento_numero.eq.${residente.apartamento}`)
        .order('fecha', { ascending: true }),
      supabase
        .from('apartamentos')
        .select('metros_cuadrados, propietario_cedula')
        .eq('id', residente.id)
        .maybeSingle()
    ])

    const auditLogs = auditRes.data || []
    const aptoDb = aptoDbRes.data

    // 3. Montar la Línea de Tiempo (Timeline) unificada y ordenada cronológicamente
    const timelineItems: ExpedienteLegalAptoData['lineaTiempo'] = []

    // A. Recibos emitidos
    ;(residente.recibos_emitidos || []).forEach(r => {
      const fecha = r.emitido_at ? r.emitido_at.substring(0, 10) : `${r.mes_facturado}-01`
      timelineItems.push({
        fecha,
        tipo: 'recibo',
        titulo: `Emisión Recibo ${r.mes_facturado}`,
        detalle: `Cuota mensual facturada: $${Number(r.total_usd || 0).toFixed(2)} (${Number(r.total_bs || 0).toLocaleString('es-VE')} Bs)`,
        montoUsd: r.total_usd,
        montoBs: r.total_bs,
        estado: r.estado === 'pagado' ? 'Pagado' : 'Pendiente'
      })
    })

    // B. Pagos reportados
    ;(residente.historial_pagos || []).forEach(p => {
      const fecha = p.fecha ? p.fecha.substring(0, 10) : 'Sin fecha'
      timelineItems.push({
        fecha,
        tipo: 'pago',
        titulo: `Pago Reportado (Ref: ${p.referencia || 'S/R'})`,
        detalle: `Banco: ${p.banco || 'Transferencia'}${p.notas_admin ? ` · Nota: ${p.notas_admin}` : ''}`,
        montoUsd: p.monto_usd,
        montoBs: p.monto_bs,
        estado: p.estado === 'aprobado' ? 'Aprobado' : p.estado === 'rechazado' ? 'Rechazado' : 'En Verificación'
      })
    })

    // C. Eventos de auditoría de este apartamento
    auditLogs.forEach((log: any) => {
      const fecha = log.fecha ? log.fecha.substring(0, 10) : (log.created_at?.substring(0, 10) || '')
      timelineItems.push({
        fecha,
        tipo: 'auditoria',
        titulo: log.titulo || 'Registro de Auditoría',
        detalle: `${log.descripcion || log.motivo || ''} (Registrado por: ${log.autor_nombre})`,
        montoUsd: log.monto_usd,
        montoBs: log.monto_bs,
        estado: 'Asentado en Libros'
      })
    })

    // D. Cuotas especiales si están en el desglose de mora
    const moraItems = residente.mora_item?.desglose?.items || []
    moraItems.forEach(it => {
      if (it.categoria === 'cuota_especial' || it.categoria === 'deuda_2025') {
        timelineItems.push({
          fecha: residente.mora_item?.fecha_corte || new Date().toISOString().substring(0, 10),
          tipo: 'cargo',
          titulo: it.label,
          detalle: it.detalle || `Obligación especial (${it.categoria === 'deuda_2025' ? 'Deuda Consolidada 2025' : 'Cuota Extraordinaria'})`,
          montoUsd: it.moneda === 'USD' ? it.monto : (it.monto / tasaBcvValida),
          montoBs: it.moneda === 'BS' ? it.monto : (it.monto * tasaBcvValida),
          estado: it.estado === 'pendiente' ? 'Pendiente' : 'Solventado'
        })
      }
    })

    // Ordenar cronológicamente (más antiguo al más reciente)
    timelineItems.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))

    // 4. Montar desglose de deudas
    const deudasDetalle: ExpedienteLegalAptoData['deudasDetalle'] = []
    if (moraItems.length > 0) {
      moraItems.forEach(it => {
        deudasDetalle.push({
          concepto: it.label,
          categoria: it.categoria === 'cuota_especial' ? 'Cuota Extraordinaria' : it.categoria === 'deuda_2025' ? 'Deuda Consolidada 2025' : 'Recibo Ordinario',
          fechaCorte: residente.mora_item?.fecha_corte || new Date().toISOString().slice(0, 10),
          montoUsd: it.moneda === 'USD' ? it.monto : (it.monto / tasaBcvValida),
          montoBs: it.moneda === 'BS' ? it.monto : (it.monto * tasaBcvValida),
          estado: it.estado === 'pendiente' ? 'Pendiente / Exigible' : 'Pagado'
        })
      })
    } else if (residente.deuda_usd > 0.01 || residente.deuda_bs > 0.01) {
      deudasDetalle.push({
        concepto: residente.mora_item?.conceptos_detalle || `Cuotas pendientes de condominio (${residente.meses_deuda} meses)`,
        categoria: 'Cuota de Condominio en Mora',
        fechaCorte: residente.mora_item?.fecha_corte || new Date().toISOString().slice(0, 10),
        montoUsd: residente.deuda_usd,
        montoBs: residente.deuda_bs > 0 ? residente.deuda_bs : (residente.deuda_usd * tasaBcvValida),
        estado: 'Exigible en Mora'
      })
    }

    // 5. Estadísticas y Métricas
    const totalFacturadoHistoricoUsd = (residente.recibos_emitidos || []).reduce((s, r) => s + (r.total_usd || 0), 0)
    const totalFacturadoHistoricoBs = (residente.recibos_emitidos || []).reduce((s, r) => s + (r.total_bs || 0), 0)

    const pagosAprobadosList = (residente.historial_pagos || []).filter(p => p.estado === 'aprobado')
    const totalPagadoHistoricoUsd = pagosAprobadosList.reduce((s, p) => s + (p.monto_usd || 0), 0)
    const totalPagadoHistoricoBs = pagosAprobadosList.reduce((s, p) => s + (p.monto_bs || 0), 0)

    const totalRecibos = residente.recibos_emitidos.length
    const recibosPagados = residente.recibos_emitidos.filter(r => r.estado === 'pagado').length
    const recibosPendientes = residente.recibos_emitidos.filter(r => r.estado === 'pendiente').length

    const pagosTotalCount = residente.historial_pagos.length
    const pagosAprobadosCount = pagosAprobadosList.length
    const pagosPendientesCount = (residente.historial_pagos || []).filter(p => p.estado === 'pendiente').length
    const pagosRechazadosCount = (residente.historial_pagos || []).filter(p => p.estado === 'rechazado').length

    let tasaCumplimiento = 100
    if (totalFacturadoHistoricoUsd > 0) {
      tasaCumplimiento = Math.min(100, Math.round((totalPagadoHistoricoUsd / totalFacturadoHistoricoUsd) * 100))
    } else if (residente.deuda_usd > 0) {
      tasaCumplimiento = Math.max(0, 100 - (residente.meses_deuda * 15))
    }

    const saldoApto = saldosPorApto.get(residente.id)
    const saldoUsd = saldoApto?.saldo_a_favor_usd || 0
    const saldoBs = saldoApto?.saldo_a_favor_bs || (saldoUsd * tasaBcvValida)

    const esSolvente = residente.deuda_usd <= 0.01 && residente.deuda_bs <= 0.01
    const tasaRiesgoCalculada = esSolvente ? 'solvente' : (residente.mora_item?.tasa_riesgo || 'azul')

    let antiguedadDeudaTexto = 'Al día sin deuda acumulada'
    if (!esSolvente) {
      if (residente.meses_deuda > 0) {
        antiguedadDeudaTexto = `Atraso acumulado de ${residente.meses_deuda} meses`
      } else {
        antiguedadDeudaTexto = 'Deuda corriente exigible'
      }
    }

    // 6. Configuración del Edificio
    const nombreEdificio = config?.nombre_edificio || 'Residencias Ocutuy 5'
    const rifEdificio = config?.rif || 'J-12345678-9'
    const direccionEdificio = config?.direccion || 'Urbanización Casa Blanca, Residencias Ocutuy 5'

    return {
      edificio: {
        nombre: nombreEdificio,
        rif: rifEdificio,
        direccion: direccionEdificio,
        telefono: config?.telefono,
        emailContacto: config?.email_contacto,
        banco: config?.banco,
        cuentaBancaria: config?.cuenta_bancaria,
        titularCuenta: config?.titular_cuenta,
        tasaBcv: tasaBcvValida
      },
      apartamento: {
        id: residente.id,
        numero: residente.apartamento,
        piso: residente.piso,
        esPh: residente.es_ph,
        alicuotaDecimal: residente.alicuota,
        metrosCuadrados: aptoDb?.metros_cuadrados,
        estadoOcupacion: residente.estado_ocupacion,
        tieneUsuarioWeb: residente.tiene_usuario,
        notasInternas: residente.notas_internas,
        propietario: {
          nombre: residente.propietario.nombre,
          cedula: aptoDb?.propietario_cedula || residente.mora_item?.propietario_cedula || null,
          telefono: residente.propietario.telefono,
          email: residente.propietario.email
        },
        inquilino: residente.inquilino ? {
          nombre: residente.inquilino.nombre,
          telefono: residente.inquilino.telefono,
          email: residente.inquilino.email
        } : undefined
      },
      metricas: {
        deudaTotalUsd: residente.deuda_usd,
        deudaTotalBs: residente.deuda_bs > 0 ? residente.deuda_bs : (residente.deuda_usd * tasaBcvValida),
        mesesDeuda: residente.meses_deuda,
        saldoAFavorUsd: saldoUsd,
        saldoAFavorBs: saldoBs,
        totalFacturadoHistoricoUsd,
        totalFacturadoHistoricoBs,
        totalPagadoHistoricoUsd,
        totalPagadoHistoricoBs,
        tasaCumplimientoPct: tasaCumplimiento,
        totalRecibosEmitidos: totalRecibos,
        recibosPagados,
        recibosPendientes,
        totalPagosReportados: pagosTotalCount,
        pagosAprobados: pagosAprobadosCount,
        pagosPendientes: pagosPendientesCount,
        pagosRechazados: pagosRechazadosCount,
        tasaRiesgo: tasaRiesgoCalculada as any,
        accionLegalRecomendada: residente.mora_item?.accion_legal?.replace(/_/g, ' ') || (esSolvente ? 'Solvente - Sin acción' : 'Cobro extrajudicial'),
        antiguedadDeudaTexto
      },
      deudasDetalle,
      lineaTiempo: timelineItems,
      emisor: {
        autorNombre: perfil?.nombre_completo || 'Administrador',
        autorEmail: user?.email || null,
        presidenteJunta: presidenteNombre || 'Presidente de la Junta de Condominio',
        tesoreroJunta: tesoreroNombre || 'Tesorero / Comité de Finanzas'
      }
    }
  }

  // ── Descargar Expediente Legal completo (Deuda, Timeline, Métricas, LPH Art. 14) ──
  const handleDescargarExpedienteLegal = async (residente: Residente) => {
    try {
      setGenerandoPdfId(residente.id)
      const payloadExpediente = await construirDatosExpedienteLegal(residente)
      descargarExpedienteLegalApto(payloadExpediente)

      setDeleteMessage({
        type: 'success',
        text: `✓ Expediente Legal del Apto ${residente.apartamento} generado y descargado exitosamente.`
      })
    } catch (err: any) {
      console.error('[AdminResidentes] Error generando expediente legal PDF:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al generar el PDF del expediente: ${err.message || 'Intente nuevamente'}`
      })
    } finally {
      setGenerandoPdfId(null)
    }
  }

  // ── Abrir Modal para Enviar Expediente por Correo Electrónico ──
  const handleAbrirModalEnviarEmail = async (residente: Residente) => {
    try {
      setCargandoExpedienteEmail(true)
      const payloadExpediente = await construirDatosExpedienteLegal(residente)
      setExpedienteParaEmail(payloadExpediente)
      setModalEmailExpedienteOpen(true)
    } catch (err: any) {
      console.error('[AdminResidentes] Error preparando expediente para email:', err)
      setDeleteMessage({
        type: 'error',
        text: `Error al preparar expediente para envío: ${err.message || 'Intente nuevamente'}`
      })
    } finally {
      setCargandoExpedienteEmail(false)
    }
  }

  // ── Enviar restablecimiento de contraseña al residente ─────────────
  const handleEnviarResetPassword = async (residente: Residente) => {
    const emailDestino = (residente.propietario.email || residente.inquilino?.email || '').trim()
    if (!emailDestino || !emailDestino.includes('@')) {
      alert(`El apartamento ${residente.apartamento} no tiene un correo electrónico válido registrado. Por favor presiona "✏️ Editar Datos" para asignar el correo del residente antes de enviar el enlace de recuperación.`)
      return
    }

    const confirmar = window.confirm(
      `¿Deseas enviar un correo de restablecimiento de contraseña para el Apto ${residente.apartamento} a la dirección:\n\n${emailDestino}?`
    )
    if (!confirmar) return

    setEnviandoResetAptoId(residente.id)
    try {
      const res = await sendResidentPasswordReset(emailDestino)
      if (!res.success) {
        setDeleteMessage({
          type: 'error',
          text: `Error al enviar correo de recuperación: ${res.error || 'Intente nuevamente'}`
        })
      } else {
        setDeleteMessage({
          type: 'success',
          text: `✓ Enlace de recuperación de contraseña enviado exitosamente a ${emailDestino} (Apto ${residente.apartamento}).`
        })
      }
    } catch (err: any) {
      setDeleteMessage({
        type: 'error',
        text: `Error inesperado: ${err.message || 'Intente nuevamente'}`
      })
    } finally {
      setEnviandoResetAptoId(null)
    }
  }

  // ── Conteo para filtros ──────
  const conDeudaCount = residentes.filter(r => r.deuda_usd > 0.01 || r.deuda_bs > 0.01 || r.meses_deuda > 0).length
  const solventesCount = residentes.filter(r => r.deuda_usd <= 0.01 && r.deuda_bs <= 0.01 && r.meses_deuda === 0).length
  const conUsuarioCount = residentes.filter(r => r.tiene_usuario).length
  const phCount = residentes.filter(r => r.es_ph).length

  // ── Filtros ──────
  const filtrados = residentes.filter(r => {
    const matchText = (
      r.apartamento.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.propietario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.inquilino?.nombre.toLowerCase().includes(busqueda.toLowerCase()) ?? false)
    )
    if (!matchText) return false

    if (filtroTipo === 'con_deuda') return r.deuda_usd > 0.01 || r.deuda_bs > 0.01 || r.meses_deuda > 0
    if (filtroTipo === 'solventes') return r.deuda_usd <= 0.01 && r.deuda_bs <= 0.01 && r.meses_deuda === 0
    if (filtroTipo === 'con_usuario') return r.tiene_usuario
    if (filtroTipo === 'ph') return r.es_ph
    return true
  })

  const getOcupacionLabel = (estado: string) => {
    if (estado === 'ocupado_propietario') return 'Ocupado (Propietario)'
    if (estado === 'alquilado') return 'Alquilado'
    return 'Desocupado'
  }

  // Generador de mensaje amigable de WhatsApp
  const generarMensajeWhatsApp = (r: Residente) => {
    const lineas: string[] = []
    lineas.push(`Estimado(a) ${r.propietario.nombre} (Apto ${r.apartamento}):`)
    lineas.push(`Le saludamos cordialmente de la Administración del Condominio.`)
    
    if (r.deuda_usd <= 0.01 && r.deuda_bs <= 0.01) {
      lineas.push(`Le confirmamos que su apartamento se encuentra actualmente SOLVENTE y al día con todas sus cuotas y recibos de condominio. ¡Muchas gracias por su puntualidad! ✨`)
    } else {
      lineas.push(`Le compartimos el estado de cuenta y compromisos pendientes a la fecha:`)
      
      const items = r.mora_item?.desglose?.items || []
      if (items.length > 0) {
        items.forEach(it => {
          const mon = it.moneda === 'USD' ? `$${it.monto.toFixed(2)}` : `Bs. ${it.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
          lineas.push(`• ${it.label}: ${mon}`)
        })
      } else {
        if (r.deuda_usd > 0) lineas.push(`• Cuotas pendientes: $${r.deuda_usd.toFixed(2)} USD`)
        if (r.deuda_bs > 0) lineas.push(`• Recibos en Bolívares: Bs. ${r.deuda_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`)
      }
      
      lineas.push(``)
      const totalEquivBs = r.deuda_bs + (r.deuda_usd * tasaBcvValida)
      lineas.push(`*Total adeudado:* $${r.deuda_usd.toFixed(2)} USD (≈ Bs. ${totalEquivBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a tasa oficial BCV de Bs. ${tasaBcvValida.toFixed(2)}/$)`)
    }
    
    const saldoInfo = saldosPorApto.get(r.id)
    const saldoUsd = saldoInfo?.saldo_a_favor_usd || 0
    if (saldoUsd > 0.01) {
      lineas.push(`Saldo a favor disponible: +$${saldoUsd.toFixed(2)} USD`)
    }
    
    lineas.push(``)
    lineas.push(`Para reportar su pago o cualquier consulta, estamos a su total disposición.`)
    
    return encodeURIComponent(lineas.join('\n'))
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-VISTA: LISTA DE APARTAMENTOS (IZQUIERDA EN DESKTOP / VISTA 1 EN MÓVIL)
  // ──────────────────────────────────────────────────────────────────────────
  const renderLista = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      {/* Buscador */}
      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="🔍 Buscar por número o nombre..."
        style={inputStyle}
      />

      {/* Filtros rápidos con Deuda / Solventes */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFiltroTipo('todos')}
          style={{
            flex: '1 1 auto',
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'todos' ? 'var(--color-accent, #f97316)' : '#1e1e1e',
            color: filtroTipo === 'todos' ? '#fff' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          Todos ({residentes.length})
        </button>

        <button
          onClick={() => setFiltroTipo('con_deuda')}
          style={{
            flex: '1 1 auto',
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'con_deuda' ? '#ef4444' : '#1e1e1e',
            color: filtroTipo === 'con_deuda' ? '#fff' : conDeudaCount > 0 ? '#f87171' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          Con Deuda ({conDeudaCount})
        </button>

        <button
          onClick={() => setFiltroTipo('solventes')}
          style={{
            flex: '1 1 auto',
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'solventes' ? '#10b981' : '#1e1e1e',
            color: filtroTipo === 'solventes' ? '#fff' : '#34d399',
            transition: 'all 0.15s ease'
          }}
        >
          Solventes ({solventesCount})
        </button>

        <button
          onClick={() => setFiltroTipo('con_usuario')}
          style={{
            flex: '1 1 auto',
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'con_usuario' ? '#3b82f6' : '#1e1e1e',
            color: filtroTipo === 'con_usuario' ? '#fff' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          Web ({conUsuarioCount})
        </button>

        <button
          onClick={() => setFiltroTipo('ph')}
          style={{
            flex: '1 1 auto',
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'ph' ? '#8b5cf6' : '#1e1e1e',
            color: filtroTipo === 'ph' ? '#fff' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          PH ({phCount})
        </button>
      </div>

      {/* Lista scrolleable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: isMobile ? 0 : '4px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '30px', fontSize: '13px' }}>
            Cargando apartamentos del condominio...
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '40px 20px', backgroundColor: '#141414', borderRadius: '12px', border: '1px solid #1e1e1e' }}>
            <p style={{ margin: 0, fontSize: '14px' }}>No se encontraron apartamentos con este filtro.</p>
          </div>
        ) : (
          filtrados.map(r => {
            const isSelected = selected?.id === r.id
            const tieneDeuda = r.deuda_usd > 0.01 || r.deuda_bs > 0.01
            const saldoInfo = saldosPorApto.get(r.id)
            const sUsd = saldoInfo?.saldo_a_favor_usd || 0
            const sBs = saldoInfo?.saldo_a_favor_bs || 0

            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r)
                  setEditMode(false)
                  setTabActiva('deudas')
                }}
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${isSelected ? 'var(--color-accent, #f97316)' : '#1e1e1e'}`,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  borderLeft: `4px solid ${
                    isSelected
                      ? 'var(--color-accent, #f97316)'
                      : tieneDeuda
                      ? '#ef4444'
                      : r.es_ph
                      ? '#8b5cf6'
                      : '#10b981'
                  }`,
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#fff', fontSize: '14.5px', fontWeight: 800 }}>Apto {r.apartamento}</span>
                    {r.es_ph && (
                      <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '1px 5px', borderRadius: '4px' }}>
                        PH
                      </span>
                    )}
                    <span style={{ fontSize: '10.5px', color: 'var(--color-accent, #f97316)', fontWeight: 700, backgroundColor: 'var(--color-accent-light, #f9731615)', padding: '1px 5px', borderRadius: '4px' }}>
                      {formatAlicuotaPct(r.alicuota)}
                    </span>
                    {sUsd > 0.0001 || sBs > 0.01 ? (
                      <span style={{
                        fontSize: '10px',
                        color: '#34d399',
                        fontWeight: 800,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}>
                        💚 {sUsd >= 1 ? `+$${sUsd.toFixed(2)}` : `+Bs. ${sBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    ) : null}
                  </div>
                  
                  <p style={{ color: r.tiene_usuario ? '#ccc' : '#777', fontSize: '12px', marginTop: '3px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.propietario.nombre}
                  </p>

                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {tieneDeuda ? (
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                      }}>
                        🔴 Debe {r.deuda_usd > 0 ? `$${r.deuda_usd.toFixed(2)}` : `Bs. ${r.deuda_bs.toLocaleString('es-VE', { minimumFractionDigits: 0 })}`}
                        {r.meses_deuda > 0 ? ` (${r.meses_deuda}c)` : ''}
                      </span>
                    ) : (
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}>
                        ✅ Solvente
                      </span>
                    )}

                    <span style={{
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      backgroundColor: r.estado_ocupacion === 'alquilado' ? '#3b82f620' : '#222',
                      color: r.estado_ocupacion === 'alquilado' ? '#60a5fa' : '#777',
                    }}>
                      {r.estado_ocupacion === 'alquilado' ? '🔑 Alquilado' : 'Propietario'}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDescargarExpedienteLegal(r)
                      }}
                      title="Descargar Expediente y Prueba Legal en PDF"
                      style={{
                        backgroundColor: '#1c1c22',
                        color: '#f8fafc',
                        border: '1px solid rgba(249, 115, 22, 0.35)',
                        borderRadius: '6px',
                        padding: '4px 7px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: generandoPdfId === r.id ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {generandoPdfId === r.id ? '⌛' : '⚖️ PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAbrirModalEnviarEmail(r)
                      }}
                      title="Enviar Expediente Legal y Estado de Cuenta por Correo Electrónico"
                      style={{
                        backgroundColor: '#1c1c22',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: '6px',
                        padding: '4px 7px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: cargandoExpedienteEmail ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      ✉️
                    </button>
                  <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 800 }}>
                    →
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  // ──────────────────────────────────────────────────────────────────────────
  // SUB-VISTA: DETALLE O EDICIÓN DEL APARTAMENTO
  // ──────────────────────────────────────────────────────────────────────────
  const renderContenidoDetalle = () => {
    if (!selected) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '380px', height: '100%', color: '#666', flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '42px' }}>👥</span>
          <h3 style={{ color: '#fff', fontSize: '16px', margin: 0 }}>Selecciona un apartamento</h3>
          <p style={{ margin: 0, fontSize: '13px', maxWidth: '340px', lineHeight: 1.5 }}>
            Podrás ver su balance exacto, todas sus deudas y cuotas extraordinarias, recibos emitidos, pagos reportados y contactos.
          </p>
        </div>
      )
    }

    if (editMode && form) {
      return (
        <form onSubmit={handleGuardar}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '14px' : '0', marginBottom: '20px' }}>
            <div>
              <h2 style={{ color: '#fff', fontSize: isMobile ? '19px' : '22px', fontWeight: 800, margin: 0 }}>
                Editar Apto {form.apartamento} {form.es_ph ? '(PH)' : ''}
              </h2>
              <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
                Alícuota de cobro, datos de habitabilidad y residentes
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                style={{
                  flex: isMobile ? 1 : 'none',
                  background: '#2a2a2a',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                style={{
                  flex: isMobile ? 1 : 'none',
                  background: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  opacity: guardando ? 0.6 : 1
                }}
              >
                {guardando ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>

          {/* CARD DE ALÍCUOTA EDITABLE */}
          <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-accent, #f9731640)', marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--color-accent, #f97316)', fontSize: '13.5px', fontWeight: 700, margin: '0 0 8px' }}>
              📊 Alícuota del Apartamento (%)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max="100"
                  style={{ ...inputStyle, fontSize: '16px', fontWeight: 700, paddingRight: '32px' }}
                  value={form.alicuota_input}
                  onChange={e => setForm({ ...form, alicuota_input: e.target.value })}
                  placeholder="1.59"
                />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>%</span>
              </div>
              <div style={{ color: '#aaa', fontSize: '11.5px', lineHeight: 1.4 }}>
                <p style={{ margin: '0 0 2px', color: '#fff', fontWeight: 600 }}>
                  {form.es_ph ? '⭐ Penthouse: tarifa especial por metraje' : 'Apartamento regular: alícuota estándar'}
                </p>
                <span style={{ color: '#777' }}>
                  Afecta directamente la emisión de recibos en Bs y USD.
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
            <div>
              <label style={labelStyle}>Estado de Ocupación</label>
              <select style={inputStyle} value={form.estado_ocupacion} onChange={e => setForm({ ...form, estado_ocupacion: e.target.value as any })}>
                <option value="ocupado_propietario">Ocupado (Propietario)</option>
                <option value="alquilado">Alquilado</option>
                <option value="desocupado">Desocupado</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Notas Internas del Inmueble</label>
              <input style={inputStyle} value={form.notas_internas} onChange={e => setForm({ ...form, notas_internas: e.target.value })} placeholder="Ej: Puesto de estacionamiento 12..." />
            </div>
          </div>

          <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '18px' }}>
            <h3 style={{ color: 'var(--color-accent, #f97316)', fontSize: '13.5px', marginBottom: '10px', marginTop: 0 }}>👤 Datos del Propietario</h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Nombre del Propietario</label>
                <input style={inputStyle} value={form.propietario.nombre} onChange={e => setForm({ ...form, propietario: { ...form.propietario, nombre: e.target.value } })} placeholder="Nombre completo" />
              </div>
              <div>
                <label style={labelStyle}>Teléfono de Contacto</label>
                <input style={inputStyle} value={form.propietario.telefono} onChange={e => setForm({ ...form, propietario: { ...form.propietario, telefono: e.target.value } })} placeholder="0414-XXXXXXX" />
              </div>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={labelStyle}>Correo Electrónico (Opcional)</label>
                <input style={inputStyle} value={form.propietario.email} onChange={e => setForm({ ...form, propietario: { ...form.propietario, email: e.target.value } })} placeholder="ejemplo@correo.com" />
              </div>
            </div>
          </div>

          {form.estado_ocupacion === 'alquilado' && (
            <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '18px' }}>
              <h3 style={{ color: '#60a5fa', fontSize: '13.5px', marginBottom: '10px', marginTop: 0 }}>🔑 Datos del Inquilino / Responsable</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Nombre Inquilino</label>
                  <input style={inputStyle} value={form.inquilino?.nombre || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { telefono: '', email: '' }), nombre: e.target.value } })} placeholder="Nombre inquilino" />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono Inquilino</label>
                  <input style={inputStyle} value={form.inquilino?.telefono || ''} onChange={e => setForm({ ...form, inquilino: { ...(form.inquilino || { nombre: '', email: '' }), telefono: e.target.value } })} placeholder="Teléfono inquilino" />
                </div>
              </div>
            </div>
          )}
        </form>
      )
    }

    // ── Modo Detalle normal ──────────────────────────────────────────────────
    const cleanPhone = selected.propietario.telefono?.replace(/[^\d+]/g, '') || ''
    const waPhone = cleanPhone.replace(/\D/g, '').startsWith('0')
      ? '58' + cleanPhone.replace(/\D/g, '').substring(1)
      : cleanPhone.replace(/\D/g, '')

    const saldoInfo = saldosPorApto.get(selected.id)
    const saldoUsd = saldoInfo?.saldo_a_favor_usd || 0
    const saldoBs = saldoInfo?.saldo_a_favor_bs || (saldoUsd * tasaBcvValida)
    const tieneSaldo = saldoUsd > 0.0001 || saldoBs > 0.01

    const tieneDeuda = selected.deuda_usd > 0.01 || selected.deuda_bs > 0.01
    const totalDeudaEquivBs = selected.deuda_bs + (selected.deuda_usd * tasaBcvValida)

    const mora = selected.mora_item
    const desglose = mora?.desglose
    const itemsDeuda = desglose?.items || []
    const tasaInfo = mora ? TASA_RIESGO_CONFIG[mora.tasa_riesgo] : null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Header del seleccionado */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '14px' : '0',
          paddingBottom: '16px',
          borderBottom: '1px solid #222'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ color: '#fff', fontSize: isMobile ? '24px' : '28px', fontWeight: 800, margin: 0 }}>
                Apto {selected.apartamento}
              </h2>
              {selected.es_ph && (
                <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '3px 8px', borderRadius: '6px' }}>
                  PENTHOUSE (PH)
                </span>
              )}
              {selected.piso !== null && (
                <span style={{ color: '#888', fontSize: '13px', fontWeight: 600 }}>
                  Piso {selected.piso}
                </span>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Badge de ocupación */}
              <span style={{
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: selected.estado_ocupacion === 'alquilado' ? '#3b82f620' : '#10b98120',
                color: selected.estado_ocupacion === 'alquilado' ? '#60a5fa' : '#34d399',
              }}>
                {getOcupacionLabel(selected.estado_ocupacion)}
              </span>

              {/* Badge de usuario */}
              <span style={{
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: selected.tiene_usuario ? '#10b98115' : '#33333330',
                color: selected.tiene_usuario ? '#10b981' : '#888',
                border: '1px solid #2a2a2a'
              }}>
                {selected.tiene_usuario ? 'Cuenta Web Activa' : 'Sin Usuario Web'}
              </span>

              {/* Badge de Solvencia */}
              {tieneDeuda ? (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  backgroundColor: tasaInfo ? tasaInfo.bg : 'rgba(239, 68, 68, 0.15)',
                  color: tasaInfo ? tasaInfo.color : '#ef4444',
                  border: `1px solid ${tasaInfo ? tasaInfo.border : 'rgba(239, 68, 68, 0.35)'}`,
                }}>
                  {tasaInfo ? tasaInfo.badgeText : `⚠️ En Mora (${selected.meses_deuda} cuotas)`}
                </span>
              ) : (
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                }}>
                  ✅ Solvente al día
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={() => handleDescargarExpedienteLegal(selected)}
              disabled={generandoPdfId === selected.id}
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid rgba(249, 115, 22, 0.4)',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: generandoPdfId === selected.id ? 'wait' : 'pointer',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flex: isMobile ? 1 : 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                transition: 'all 0.15s ease'
              }}
              title="Descargar Expediente Legal completo con Deuda, Línea de Tiempo, Métricas y LPH Art. 14"
            >
              <span>⚖️</span>
              <span>{generandoPdfId === selected.id ? 'Generando PDF...' : 'Expediente Legal (PDF)'}</span>
            </button>

            <button
              onClick={() => handleAbrirModalEnviarEmail(selected)}
              disabled={cargandoExpedienteEmail}
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: cargandoExpedienteEmail ? 'wait' : 'pointer',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flex: isMobile ? 1 : 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                transition: 'all 0.15s ease'
              }}
              title="Enviar Expediente Legal con Estado de Cuenta completo por correo electrónico"
            >
              <span>✉️</span>
              <span>{cargandoExpedienteEmail ? 'Preparando...' : 'Enviar por Email'}</span>
            </button>

            <button
              onClick={() => { setForm({ ...selected }); setEditMode(true) }}
              style={{
                backgroundColor: 'var(--color-accent, #f97316)',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12.5px',
                fontWeight: 700,
                flex: isMobile ? 1 : 'none'
              }}
            >
              ✏️ Editar Datos
            </button>

            <button
              onClick={() => navigate('/admin/calendario-deudas')}
              style={{
                backgroundColor: '#1e1e1e',
                color: '#aaa',
                border: '1px solid #333',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                flex: isMobile ? 1 : 'none'
              }}
              title="Abrir Calendario General de Deudas"
            >
              📊 Calendario
            </button>

            {selected.tiene_usuario && (
              <button
                type="button"
                onClick={() => handleEnviarResetPassword(selected)}
                disabled={enviandoResetAptoId === selected.id}
                style={{
                  backgroundColor: 'rgba(249, 115, 22, 0.12)',
                  color: 'var(--color-accent, #f97316)',
                  border: '1px solid rgba(249, 115, 22, 0.35)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: enviandoResetAptoId === selected.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flex: isMobile ? 1 : 'none',
                  transition: 'all 0.15s ease'
                }}
                title={`Enviar enlace de restablecimiento de contraseña al correo registrado para el Apto ${selected.apartamento}`}
              >
                <span>🔑</span>
                <span>{enviandoResetAptoId === selected.id ? 'Enviando...' : 'Restablecer Clave'}</span>
              </button>
            )}

            {selected.tiene_usuario && (
              <button
                onClick={() => setShowDeleteModal(true)}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flex: isMobile ? 1 : 'none'
                }}
              >
                🗑️ Borrar
              </button>
            )}
          </div>
        </div>

        {/* ── 3 KPI CARDS SUPERIORES: DEUDA, SALDO A FAVOR, ALÍCUOTA ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '12px'
        }}>
          {/* KPI 1: Deuda Total Pendiente */}
          <div style={{
            backgroundColor: tieneDeuda ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.06)',
            border: `1px solid ${tieneDeuda ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`,
            borderRadius: '12px',
            padding: '16px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: tieneDeuda ? '#f87171' : '#34d399', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800 }}>
                {tieneDeuda ? 'Deuda Total Pendiente' : 'Estado de Cuenta'}
              </span>
              <span style={{ fontSize: '16px' }}>{tieneDeuda ? '⚠️' : '✅'}</span>
            </div>

            <div style={{ color: tieneDeuda ? '#ef4444' : '#10b981', fontSize: '24px', fontWeight: 900 }}>
              {tieneDeuda ? (
                selected.deuda_usd > 0
                  ? `$${selected.deuda_usd.toFixed(2)} USD`
                  : `Bs. ${selected.deuda_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
              ) : '$0.00 USD'}
            </div>

            <p style={{ color: '#888', fontSize: '11.5px', margin: '4px 0 0' }}>
              {tieneDeuda ? (
                `≈ Bs. ${totalDeudaEquivBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tasa: Bs. ${tasaBcvValida.toFixed(2)})`
              ) : (
                'El apartamento no debe ninguna cuota ni recibo.'
              )}
            </p>
          </div>

          {/* KPI 2: Saldo a Favor / Cuenta Corriente */}
          <div style={{
            backgroundColor: tieneSaldo ? 'rgba(16, 185, 129, 0.08)' : '#0f0f10',
            border: `1px solid ${tieneSaldo ? 'rgba(16, 185, 129, 0.35)' : '#222'}`,
            borderRadius: '12px',
            padding: '16px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: tieneSaldo ? '#4ade80' : '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800 }}>
                Saldo a Favor / Billetera
              </span>
              <span style={{ fontSize: '16px' }}>💚</span>
            </div>

            <div style={{ color: tieneSaldo ? '#4ade80' : '#fff', fontSize: '24px', fontWeight: 900 }}>
              {tieneSaldo ? (
                saldoUsd >= 1
                  ? `+$${saldoUsd.toFixed(2)} USD`
                  : `+Bs. ${saldoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
              ) : '$0.00 USD'}
            </div>

            <p style={{ color: '#888', fontSize: '11.5px', margin: '4px 0 0' }}>
              {tieneSaldo ? 'Crédito disponible para amortizar cuotas' : 'Sin saldo positivo acumulado'}
            </p>
          </div>

          {/* KPI 3: Alícuota de Condominio */}
          <div style={{
            backgroundColor: '#0f0f10',
            border: '1px solid #222',
            borderRadius: '12px',
            padding: '16px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800 }}>
                Alícuota Inmueble
              </span>
              <span style={{ fontSize: '16px' }}>📊</span>
            </div>

            <div style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>
              {formatAlicuotaPct(selected.alicuota)}
            </div>

            <p style={{ color: '#888', fontSize: '11.5px', margin: '4px 0 0' }}>
              {selected.es_ph ? 'Penthouse (tarifa especial de metraje)' : 'Cuota de prorrateo mensual estándar'}
            </p>
          </div>
        </div>

        {/* ── BOTONES DE GESTIÓN DE SALDO Y COMPENSACIÓN ── */}
        <div style={{
          backgroundColor: '#0a0a0a',
          border: '1px solid #1f1f1f',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#888', fontSize: '12px', fontWeight: 600 }}>
            Acciones de Saldo:
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setAbonarModalOpen(true)}
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '11.5px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>➕</span> Abonar Saldo a Favor
            </button>

            {tieneSaldo && tieneDeuda && (
              <button
                type="button"
                onClick={() => setCompensarModalOpen(true)}
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>⚡</span> Compensar Deuda
              </button>
            )}

            {tieneSaldo && (
              <button
                type="button"
                onClick={() => setSaldoModalOpen(true)}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: 600
                }}
              >
                <span>🗑️</span> Quitar Saldo
              </button>
            )}
          </div>
        </div>

        {/* ── BARRA DE PESTAÑAS DEL APARTAMENTO ── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a2a',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '2px'
        }}>
          <button
            onClick={() => setTabActiva('deudas')}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${tabActiva === 'deudas' ? 'var(--color-accent, #f97316)' : 'transparent'}`,
              color: tabActiva === 'deudas' ? '#fff' : '#888',
              fontSize: '13px',
              fontWeight: tabActiva === 'deudas' ? 800 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>💰</span>
            <span>Deudas y Cuotas Extras</span>
            {itemsDeuda.length > 0 && (
              <span style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: '10.5px',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 800
              }}>
                {itemsDeuda.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTabActiva('recibos')}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${tabActiva === 'recibos' ? 'var(--color-accent, #f97316)' : 'transparent'}`,
              color: tabActiva === 'recibos' ? '#fff' : '#888',
              fontSize: '13px',
              fontWeight: tabActiva === 'recibos' ? 800 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>📄</span>
            <span>Recibos Emitidos ({selected.recibos_emitidos.length})</span>
          </button>

          <button
            onClick={() => setTabActiva('pagos')}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${tabActiva === 'pagos' ? 'var(--color-accent, #f97316)' : 'transparent'}`,
              color: tabActiva === 'pagos' ? '#fff' : '#888',
              fontSize: '13px',
              fontWeight: tabActiva === 'pagos' ? 800 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>💳</span>
            <span>Historial de Pagos ({selected.historial_pagos.length})</span>
          </button>

          <button
            onClick={() => setTabActiva('datos')}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${tabActiva === 'datos' ? 'var(--color-accent, #f97316)' : 'transparent'}`,
              color: tabActiva === 'datos' ? '#fff' : '#888',
              fontSize: '13px',
              fontWeight: tabActiva === 'datos' ? 800 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>👤</span>
            <span>Contacto y Habitabilidad</span>
          </button>
        </div>

        {/* ── CONTENIDO DE LAS PESTAÑAS ── */}

        {/* 1. TAB: DEUDAS Y CUOTAS EXTRAS */}
        {tabActiva === 'deudas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!tieneDeuda ? (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '28px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '42px' }}>🎉</span>
                <h3 style={{ color: '#34d399', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  ¡Apto {selected.apartamento} está completamente solvente!
                </h3>
                <p style={{ color: '#aaa', fontSize: '13px', margin: 0, maxWidth: '480px', lineHeight: 1.5 }}>
                  No presenta deudas históricas del 2025, cuotas extras de ascensor ni recibos mensuales pendientes.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${waPhone}?text=${generarMensajeWhatsApp(selected)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        color: '#4ade80',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      💬 Enviar WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDescargarExpedienteLegal(selected)}
                    disabled={generandoPdfId === selected.id}
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: generandoPdfId === selected.id ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title="Descargar Certificado de Solvencia y Expediente de Auditoría en PDF"
                  >
                    <span>⚖️</span>
                    <span>{generandoPdfId === selected.id ? 'Generando...' : 'Descargar Expediente de Solvencia (PDF)'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Banner de alerta de mora */}
                <div style={{
                  backgroundColor: tasaInfo ? tasaInfo.bg : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${tasaInfo ? tasaInfo.border : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <div>
                      <h4 style={{ color: tasaInfo ? tasaInfo.color : '#ef4444', margin: 0, fontSize: '14.5px', fontWeight: 800 }}>
                        {tasaInfo ? tasaInfo.label : 'En estado de mora'} · {itemsDeuda.length} concepto{itemsDeuda.length !== 1 ? 's' : ''} pendiente{itemsDeuda.length !== 1 ? 's' : ''}
                      </h4>
                      <p style={{ color: '#aaa', margin: '2px 0 0', fontSize: '12px' }}>
                        Acción administrativa recomendada: <strong style={{ color: '#fff' }}>{mora?.accion_legal?.replace(/_/g, ' ') || 'Notificación'}</strong>
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDescargarExpedienteLegal(selected)}
                      disabled={generandoPdfId === selected.id}
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid rgba(249, 115, 22, 0.4)',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: generandoPdfId === selected.id ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      title="Descargar Documento Legal de Liquidación y Prueba de Deuda (LPH Art. 14)"
                    >
                      <span>⚖️</span>
                      <span>{generandoPdfId === selected.id ? 'Generando PDF...' : 'Descargar Expediente / Prueba Legal (PDF)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAbrirModalEnviarEmail(selected)}
                      disabled={cargandoExpedienteEmail}
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: cargandoExpedienteEmail ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      title="Enviar Expediente Legal y Estado de Cuenta por correo electrónico"
                    >
                      <span>✉️</span>
                      <span>{cargandoExpedienteEmail ? 'Preparando...' : 'Enviar por Email'}</span>
                    </button>

                    {cleanPhone && (
                      <a
                        href={`https://wa.me/${waPhone}?text=${generarMensajeWhatsApp(selected)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          backgroundColor: '#22c55e',
                          color: '#000',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        💬 Cobrar por WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                {/* LISTA COMPLETA DE CONCEPTOS PENDIENTES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📋</span> Desglose de Compromisos Pendientes
                  </h3>

                  {itemsDeuda.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #262626',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>{item.icono || '📌'}</span>
                        <div>
                          <p style={{ color: '#fff', fontSize: '13.5px', fontWeight: 700, margin: 0 }}>
                            {item.label}
                          </p>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: item.categoria === 'deuda_2025' ? '#f59e0b' : item.categoria === 'cuota_especial' ? '#8b5cf6' : '#3b82f6',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {item.categoria === 'deuda_2025' ? 'Deuda Pasada' : item.categoria === 'cuota_especial' ? 'Cuota Extra / Especial' : 'Recibo Mensual'}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                          {item.moneda === 'USD' ? `$${item.monto.toFixed(2)} USD` : `Bs. ${item.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          padding: '1px 6px',
                          borderRadius: '4px'
                        }}>
                          PENDIENTE
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Acciones directas sobre la deuda */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  paddingTop: '10px',
                  borderTop: '1px solid #222'
                }}>
                  <button
                    onClick={() => navigate('/admin/mora')}
                    style={{
                      backgroundColor: '#1c1c1e',
                      color: '#fff',
                      border: '1px solid #333',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    ⚖️ Gestionar en Módulo de Mora
                  </button>

                  <button
                    onClick={() => navigate('/admin/calendario-deudas')}
                    style={{
                      backgroundColor: '#1c1c1e',
                      color: 'var(--color-accent, #f97316)',
                      border: '1px solid var(--border-accent, #f9731640)',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    📊 Ver en Matriz del Calendario
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 2. TAB: RECIBOS EMITIDOS */}
        {tabActiva === 'recibos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: '14.5px', fontWeight: 700, margin: 0 }}>
                Recibos de Condominio Emitidos ({selected.recibos_emitidos.length})
              </h3>
              <button
                onClick={() => navigate('/admin/recibos-emitidos')}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-accent, #f97316)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                Ver todos los recibos emitidos →
              </button>
            </div>

            {selected.recibos_emitidos.length === 0 ? (
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #222',
                borderRadius: '10px',
                padding: '24px',
                textAlign: 'center',
                color: '#666',
                fontSize: '13px'
              }}>
                No hay recibos generados todavía para este apartamento.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.recibos_emitidos.map((rec) => {
                  const esPagado = rec.estado === 'pagado'
                  return (
                    <div
                      key={rec.id}
                      style={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #222',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}
                    >
                      <div>
                        <p style={{ color: '#fff', fontSize: '13.5px', fontWeight: 700, margin: 0 }}>
                          Mes Facturado: {rec.mes_facturado}
                        </p>
                        <p style={{ color: '#777', fontSize: '11px', margin: '2px 0 0' }}>
                          Emitido: {rec.emitido_at ? new Date(rec.emitido_at).toLocaleDateString() : 'N/D'} · Tasa BCV: Bs. {rec.tasa_bcv || tasaBcvValida}
                        </p>
                      </div>

                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ color: '#fff', fontSize: '14px', fontWeight: 800 }}>
                            {rec.total_usd > 0 ? `$${rec.total_usd.toFixed(2)} USD` : ''}
                            {rec.total_usd > 0 && rec.total_bs > 0 ? ' · ' : ''}
                            {rec.total_bs > 0 ? `Bs. ${rec.total_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}
                          </div>
                        </div>

                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '5px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          backgroundColor: esPagado ? '#10b98120' : '#f59e0b20',
                          color: esPagado ? '#10b981' : '#f59e0b',
                        }}>
                          {rec.estado.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. TAB: HISTORIAL DE PAGOS */}
        {tabActiva === 'pagos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: '14.5px', fontWeight: 700, margin: 0 }}>
                Pagos Reportados ({selected.historial_pagos.length})
              </h3>
              <button
                onClick={() => navigate('/admin/recibos')}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-accent, #f97316)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                Panel de Aprobación de Pagos →
              </button>
            </div>

            {selected.historial_pagos.length === 0 ? (
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #222',
                borderRadius: '10px',
                padding: '24px',
                textAlign: 'center',
                color: '#666',
                fontSize: '13px'
              }}>
                No hay pagos reportados todavía para este apartamento.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.historial_pagos.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: '#0a0a0a',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #2a2a2a',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        backgroundColor: p.estado === 'aprobado' ? '#10b981' : p.estado === 'pendiente' ? '#f59e0b' : '#ef4444',
                        flexShrink: 0
                      }} />
                      <div>
                        <p style={{ color: '#fff', fontSize: '13.5px', fontWeight: 700, margin: 0 }}>{p.monto}</p>
                        <p style={{ color: '#777', fontSize: '11px', margin: '2px 0 0' }}>
                          Ref: {p.referencia} · {p.banco} · {new Date(p.fecha).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {p.comprobante_url && (
                        <button
                          type="button"
                          onClick={() => setComprobanteModalUrl(p.comprobante_url || null)}
                          style={{
                            backgroundColor: '#1e1e1e',
                            color: '#60a5fa',
                            border: '1px solid #3b82f640',
                            padding: '4px 8px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          🖼️ Comprobante
                        </button>
                      )}

                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        backgroundColor: p.estado === 'aprobado' ? '#10b98120' : p.estado === 'pendiente' ? '#f59e0b20' : '#ef444420',
                        color: p.estado === 'aprobado' ? '#10b981' : p.estado === 'pendiente' ? '#f59e0b' : '#ef4444',
                      }}>
                        {p.estado.toUpperCase()}
                      </span>

                      {p.estado === 'pendiente' && (
                        <button
                          onClick={() => navigate('/admin/recibos?filtro=pendiente')}
                          style={{
                            backgroundColor: '#f59e0b',
                            color: '#000',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '5px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Revisar →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. TAB: CONTACTO Y HABITABILIDAD */}
        {tabActiva === 'datos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
              {/* Propietario */}
              <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                <h3 style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>
                  👤 Propietario
                </h3>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: '15px', margin: '0 0 6px' }}>{selected.propietario.nombre}</p>
                <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 4px' }}>📞 {selected.propietario.telefono}</p>
                {selected.propietario.email && (
                  <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>✉️ {selected.propietario.email}</p>
                )}

                {/* Botones de contacto directo */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1a1a1a' }}>
                  {cleanPhone && selected.propietario.telefono !== 'Sin teléfono' && (
                    <>
                      <a
                        href={`tel:${cleanPhone}`}
                        style={{
                          backgroundColor: '#18181b',
                          color: '#10b981',
                          border: '1px solid #10b98140',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        📞 Llamar
                      </a>
                      <a
                        href={`https://wa.me/${waPhone}?text=${generarMensajeWhatsApp(selected)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          backgroundColor: '#18181b',
                          color: '#22c55e',
                          border: '1px solid #22c55e40',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    </>
                  )}
                  {selected.propietario.email && (
                    <a
                      href={`mailto:${selected.propietario.email}`}
                      style={{
                        backgroundColor: '#18181b',
                        color: '#3b82f6',
                        border: '1px solid #3b82f640',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ✉️ Email
                    </a>
                  )}
                </div>
              </div>

              {/* Inquilino */}
              {selected.estado_ocupacion === 'alquilado' && selected.inquilino ? (
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
                  <h3 style={{ color: '#60a5fa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', marginTop: 0 }}>
                    🔑 Inquilino / Responsable
                  </h3>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: '15px', margin: '0 0 6px' }}>{selected.inquilino.nombre}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>📞 {selected.inquilino.telefono}</p>

                  {selected.inquilino.telefono && selected.inquilino.telefono !== 'N/D' && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1a1a1a' }}>
                      <a
                        href={`tel:${selected.inquilino.telefono.replace(/[^\d+]/g, '')}`}
                        style={{
                          backgroundColor: '#18181b',
                          color: '#10b981',
                          border: '1px solid #10b98140',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        📞 Llamar
                      </a>
                      <a
                        href={`https://wa.me/${selected.inquilino.telefono.replace(/\D/g, '').startsWith('0') ? '58' + selected.inquilino.telefono.replace(/\D/g, '').substring(1) : selected.inquilino.telefono.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          backgroundColor: '#18181b',
                          color: '#22c55e',
                          border: '1px solid #22c55e40',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h3 style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', marginTop: 0 }}>
                    Condición de Ocupación
                  </h3>
                  <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: '0 0 6px' }}>
                    {getOcupacionLabel(selected.estado_ocupacion)}
                  </p>
                  <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
                    {selected.estado_ocupacion === 'ocupado_propietario'
                      ? 'El inmueble es habitado por su propietario registrado.'
                      : 'El apartamento se encuentra desocupado actualmente.'}
                  </p>
                </div>
              )}
            </div>

            {/* Notas internas */}
            {selected.notas_internas && (
              <div style={{ backgroundColor: '#0a0a0a', padding: '14px 16px', borderRadius: '10px', border: '1px solid #262626' }}>
                <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                  Notas Internas (Solo Administración)
                </span>
                <p style={{ color: '#ccc', fontSize: '13px', margin: '4px 0 0', lineHeight: 1.5 }}>
                  {selected.notas_internas}
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding: isMobile ? '16px 14px 90px 14px' : '32px',
      height: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }}>
      
      {/* Header (en móvil solo si no hay seleccionado o en desktop siempre) */}
      {(!isMobile || selected === null) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', gap: '12px' }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: isMobile ? '20px' : '24px', fontWeight: 800, margin: 0 }}>
              🏠 Gestión de Residentes e Inmuebles
            </h1>
            <p style={{ color: '#888', fontSize: '12.5px', marginTop: '4px', lineHeight: 1.4 }}>
              {residentes.length} apartamentos · Deudas, cuotas extraordinarias, saldos y alícuotas
            </p>
          </div>
          <button
            onClick={() => cargarResidentes(true)}
            style={{
              backgroundColor: '#1e1e1e',
              color: '#fff',
              border: '1px solid #333',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0
            }}
          >
            🔄 {isMobile ? 'Refrescar' : 'Actualizar Lista'}
          </button>
        </div>
      )}

      {deleteMessage && (
        <div style={{
          backgroundColor: deleteMessage.type === 'success' ? '#10b98120' : '#ef444420',
          color: deleteMessage.type === 'success' ? '#10b981' : '#ef4444',
          border: `1px solid ${deleteMessage.type === 'success' ? '#10b98140' : '#ef444440'}`,
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '16px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{deleteMessage.text}</span>
          <button
            onClick={() => setDeleteMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL: DESKTOP VS MÓVIL ── */}
      {isMobile ? (
        /* Vista Móvil: Master-Detail con navegación fluida */
        selected === null ? (
          renderLista()
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {/* Barra superior móvil para volver */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <button
                onClick={() => { setSelected(null); setEditMode(false) }}
                style={{
                  backgroundColor: '#1c1c20',
                  color: 'var(--color-accent, #f97316)',
                  border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.4))',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ← Volver a lista
              </button>

              {!editMode && (
                <button
                  onClick={() => { setForm({ ...selected }); setEditMode(true) }}
                  style={{
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    padding: '9px 15px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ✏️ Editar Apto
                </button>
              )}
            </div>

            {/* Contenedor del Detalle en Móvil */}
            <div style={{
              backgroundColor: '#141414',
              border: '1px solid #1e1e1e',
              borderRadius: '16px',
              padding: '18px 14px'
            }}>
              {renderContenidoDetalle()}
            </div>
          </div>
        )
      ) : (
        /* Vista Desktop: 2 columnas lado a lado */
        <div style={{ display: 'grid', gridTemplateColumns: '370px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
          {/* Columna Izquierda: Lista de Apartamentos */}
          {renderLista()}

          {/* Columna Derecha: Panel de Detalles o Formulario */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #1e1e1e',
            borderRadius: '16px',
            padding: '24px 28px',
            overflowY: 'auto'
          }}>
            {renderContenidoDetalle()}
          </div>
        </div>
      )}

      {/* Modal de Borrado */}
      {showDeleteModal && selected && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          }}>
            <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 12px' }}>
              ¿Eliminar usuario del Apto {selected.apartamento}?
            </h3>
            <p style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
              Se eliminará la cuenta de usuario de <strong style={{ color: '#fff' }}>{selected.propietario.nombre}</strong>. El apartamento continuará registrado en el edificio con su alícuota intacta.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarUsuario}
                disabled={deleting}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
              >
                {deleting ? 'Eliminando...' : 'Sí, Eliminar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización de Comprobante de Pago */}
      {comprobanteModalUrl && (
        <div
          onClick={() => setComprobanteModalUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            cursor: 'zoom-out'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#18181b',
              border: '1px solid #333',
              borderRadius: '16px',
              padding: '16px',
              maxWidth: '600px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>
                🖼️ Comprobante de Pago
              </h3>
              <button
                onClick={() => setComprobanteModalUrl(null)}
                style={{
                  backgroundColor: '#27272a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕
              </button>
            </div>
            <img
              src={comprobanteModalUrl}
              alt="Comprobante de pago"
              style={{
                width: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '8px',
                backgroundColor: '#000'
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de Retiro de Saldo a Favor con Auditoría */}
      {selected && (
        <RetirarSaldoModal
          isOpen={saldoModalOpen}
          onClose={() => setSaldoModalOpen(false)}
          onSuccess={() => {
            setDeleteMessage({
              type: 'success',
              text: `Saldo a favor del Apto ${selected.apartamento} retirado exitosamente. Se registró en el Historial de Auditoría.`
            })
            cargarResidentes()
          }}
          apartamentoId={selected.id}
          apartamentoNumero={selected.apartamento}
          propietarioNombre={selected.propietario.nombre}
          saldoAFavorUsd={saldosPorApto.get(selected.id)?.saldo_a_favor_usd || 0}
          saldoAFavorBs={saldosPorApto.get(selected.id)?.saldo_a_favor_bs || 0}
          tasaBcv={tasaBcvValida}
          autorNombre={perfil?.nombre_completo || 'Administrador'}
          autorEmail={user?.email || null}
        />
      )}

      {/* Modal para Abonar Saldo Positivo (A Favor) con Motivo Obligatorio */}
      {selected && (
        <AbonarSaldoModal
          isOpen={abonarModalOpen}
          onClose={() => setAbonarModalOpen(false)}
          onSuccess={() => {
            setDeleteMessage({
              type: 'success',
              text: `Saldo positivo acreditado con éxito al Apto ${selected.apartamento}. Se asentó en Auditoría y Pagos.`
            })
            cargarResidentes()
          }}
          apartamentoId={selected.id}
          apartamentoNumero={selected.apartamento}
          propietarioNombre={selected.propietario.nombre}
          deudaActualUsd={deudasPorApto.get(selected.id)?.totalUsd || 0}
          deudaActualBs={deudasPorApto.get(selected.id)?.totalBs || 0}
          tasaBcv={tasaBcvValida}
          autorNombre={perfil?.nombre_completo || 'Administrador'}
          autorEmail={user?.email || null}
        />
      )}

      {/* Modal para Compensar Deuda Pendiente con Saldo a Favor Existente */}
      {selected && (
        <CompensarDeudaModal
          isOpen={compensarModalOpen}
          onClose={() => setCompensarModalOpen(false)}
          onSuccess={() => {
            setDeleteMessage({
              type: 'success',
              text: `Deuda del Apto ${selected.apartamento} compensada exitosamente con su Saldo a Favor disponible.`
            })
            cargarResidentes()
          }}
          apartamentoId={selected.id}
          apartamentoNumero={selected.apartamento}
          propietarioNombre={selected.propietario.nombre}
          saldoAFavorDisponibleUsd={saldosPorApto.get(selected.id)?.saldo_a_favor_usd || 0}
          deudaActualUsd={deudasPorApto.get(selected.id)?.totalUsd || 0}
          tasaBcv={tasaBcvValida}
          autorNombre={perfil?.nombre_completo || 'Administrador'}
          autorEmail={user?.email || null}
        />
      )}
      {/* Modal para Enviar Expediente Legal por Correo Electrónico */}
      <EnviarExpedienteEmailModal
        isOpen={modalEmailExpedienteOpen}
        onClose={() => setModalEmailExpedienteOpen(false)}
        onSuccess={(destinatario) => {
          setDeleteMessage({
            type: 'success',
            text: `✓ Expediente Legal del Apto ${expedienteParaEmail?.apartamento.numero} enviado exitosamente a ${destinatario}.`
          })
        }}
        datosExpediente={expedienteParaEmail}
      />
    </div>
  )
}
