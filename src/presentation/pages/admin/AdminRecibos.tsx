import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { useAuth } from '../../../application/contexts/AuthContext'
import { despacharEmailPagoAprobado } from '../../../data/emailService'
import { aplicarPagoConPrelacion } from '../../../data/pagosPrelacionService'
import { liquidarCuotasEspecialesDesdePago } from '../../../data/calendarioDeudasService'
import {
  parsePagoMeta,
  stripPagoMeta,
  encodePagoMeta,
  aprobarPagoGasDesdeReporte,
  rechazarPagoGasDesdeReporte,
  PagoDomusMeta
} from '../../../data/gasService'
import { SkeletonListItem } from '../../components/Skeleton'
import { getHoyVE } from '../../../utils/fechaVE'
import { getTasaBcvNumerica, obtenerTasaBcvConfiable } from '../../../utils/tasaBcvHelper'

interface PagoAdmin {
  id: string
  apartamento_id?: string
  reportado_por?: string
  monto_bs: number
  monto_usd: number | null
  banco_origen: string
  numero_referencia: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  created_at: string
  fecha_pago?: string | null
  notas_admin?: string | null
  notas_limpias?: string | null
  metaDomus?: PagoDomusMeta | null
  servicio: 'gas' | 'condominio' | 'mixto'
  comprobante_url?: string | null
  apartamento: { numero: string; id?: string } | null
  residente_nombre?: string | null
  residente_email?: string | null
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', icon: '⏳' },
  aprobado: { label: 'Aprobado', color: '#10b981', icon: '✅' },
  rechazado: { label: 'Rechazado', color: '#ef4444', icon: '❌' },
}

export const AdminRecibos: React.FC = () => {
  const { config } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = searchParams.get('filtro') || 'todos'

  const [pagos, setPagos] = useState<PagoAdmin[]>([])
  const [totalPagosDb, setTotalPagosDb] = useState<number>(0)
  const [limitePagos, setLimitePagos] = useState<number>(100)
  const [contadoresEstado, setContadoresEstado] = useState({ todos: 0, pendiente: 0, aprobado: 0, rechazado: 0 })
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>(initialFilter)
  const [filtroServicio, setFiltroServicio] = useState<'todos' | 'condominio' | 'gas' | 'mixto'>('todos')
  const [selected, setSelected] = useState<PagoAdmin | null>(null)
  const [nota, setNota] = useState('')
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const procesando = procesandoId !== null
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Sincronizar filtro si cambia el param en URL
  useEffect(() => {
    const pFiltro = searchParams.get('filtro')
    if (pFiltro && ['todos', 'pendiente', 'aprobado', 'rechazado'].includes(pFiltro)) {
      setFiltro(pFiltro)
    }
  }, [searchParams])

  const cambiarFiltro = (nuevoFiltro: string) => {
    setFiltro(nuevoFiltro)
    setSearchParams(nuevoFiltro === 'todos' ? {} : { filtro: nuevoFiltro })
  }

  // ── Cargar pagos reales desde Supabase con Paginación Real y Caché ────────────
  const cargarPagos = useCallback(async (forceRefresh = false, customLimit?: number) => {
    const activeLimit = customLimit ?? limitePagos
    setLoading(true)
    try {
      const result = await appCache.fetch(
        `admin_pagos_lista_${filtro}_${activeLimit}`,
        async () => {
          let pagosQuery = supabase
            .from('pagos_reportados')
            .select('id, apartamento_id, reportado_por, monto_bs, monto_usd, referencia, estado, created_at, fecha_pago, notas_admin, comprobante_url, metodo', { count: 'exact' })
            .order('created_at', { ascending: false })

          if (filtro !== 'todos') {
            pagosQuery = pagosQuery.eq('estado', filtro)
          }

          const [pagosRes, aptRes, perfilesRes, cntTodosRes, cntPendRes, cntAprobRes, cntRechRes] = await Promise.all([
            pagosQuery.range(0, activeLimit - 1),
            supabase.from('apartamentos').select('id, numero, propietario_nombre'),
            supabase.from('perfiles').select('id, nombre_completo, apartamento_id, propietario_email'),
            supabase.from('pagos_reportados').select('id', { count: 'exact', head: true }),
            supabase.from('pagos_reportados').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
            supabase.from('pagos_reportados').select('id', { count: 'exact', head: true }).eq('estado', 'aprobado'),
            supabase.from('pagos_reportados').select('id', { count: 'exact', head: true }).eq('estado', 'rechazado'),
          ])

          if (pagosRes.error) {
            console.warn('[AdminRecibos] Error consultando pagos_reportados:', pagosRes.error.message)
          }
          if (aptRes.error) {
            console.warn('[AdminRecibos] Error consultando apartamentos:', aptRes.error.message)
          }

          const aptMap = new Map<string, { numero: string; nombre?: string }>(
            (aptRes.data || []).map((a: any) => [a.id, { numero: a.numero, nombre: a.propietario_nombre }])
          )
          const perfilMap = new Map<string, { nombre: string; aptoId?: string; email?: string }>(
            (perfilesRes.data || []).map((p: any) => [p.id, { nombre: p.nombre_completo, aptoId: p.apartamento_id, email: p.propietario_email }])
          )

          const mapped = (pagosRes.data || []).map((r: any) => {
            const notasLimpias = stripPagoMeta(r.notas_admin)
            const metaDomus = parsePagoMeta(r.notas_admin)
            const servicio: 'gas' | 'condominio' | 'mixto' = metaDomus?.tipoServicio || 'condominio'

            let banco = 'Transferencia'
            if (notasLimpias && notasLimpias.includes('Banco')) {
              const match = notasLimpias.match(/Banco(?: Origen)?:\s*([^\n,|]+)/i)
              if (match) banco = match[1].trim()
            }

            let aptoInfo = r.apartamento_id ? aptMap.get(r.apartamento_id) : undefined
            let finalAptoId = r.apartamento_id
            if (!aptoInfo && r.reportado_por) {
              const perf = perfilMap.get(r.reportado_por)
              if (perf?.aptoId) {
                aptoInfo = aptMap.get(perf.aptoId)
                if (!finalAptoId) finalAptoId = perf.aptoId
              }
            }

            const residentName = perfilMap.get(r.reportado_por)?.nombre || aptoInfo?.nombre || 'Residente'
            const residentEmail = perfilMap.get(r.reportado_por)?.email || null

            return {
              id: r.id,
              apartamento_id: finalAptoId,
              reportado_por: r.reportado_por,
              monto_bs: r.monto_bs || 0,
              monto_usd: r.monto_usd || null,
              banco_origen: banco,
              numero_referencia: r.referencia || 'S/R',
              estado: (r.estado as any) || 'pendiente',
              created_at: r.created_at,
              fecha_pago: r.fecha_pago,
              notas_admin: r.notas_admin,
              notas_limpias: notasLimpias,
              metaDomus,
              servicio,
              comprobante_url: r.comprobante_url,
              apartamento: aptoInfo ? { numero: aptoInfo.numero, id: finalAptoId } : null,
              residente_nombre: residentName,
              residente_email: residentEmail,
            }
          })

          return {
            mapped,
            totalFiltrado: pagosRes.count ?? mapped.length,
            contadores: {
              todos: cntTodosRes.count ?? mapped.length,
              pendiente: cntPendRes.count ?? 0,
              aprobado: cntAprobRes.count ?? 0,
              rechazado: cntRechRes.count ?? 0,
            }
          }
        },
        { ttlMs: 2 * 60 * 1000, tags: ['pagos', 'apartamentos'], forceRefresh }
      )
      setPagos(result.mapped)
      setTotalPagosDb(result.totalFiltrado)
      setContadoresEstado(result.contadores)
    } catch (err: any) {
      console.error('[AdminRecibos] Excepción al cargar pagos:', err)
      setPagos([])
    } finally {
      setLoading(false)
    }
  }, [filtro, limitePagos])

  useEffect(() => {
    cargarPagos()

    // ── Suscripción en Tiempo Real para Pagos Reportados ──
    const channelId = `admin_recibos_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados' },
        (payload) => {
          console.log('[AdminRecibos] Cambio recibido en tiempo real:', payload)
          appCache.invalidateTags(['pagos', 'saldos', 'recibos', 'mora', 'gas', 'deudas_gas'])
          if (payload.eventType === 'INSERT') {
            setToastMsg('🔔 ¡Nuevo pago recibido! Se ha actualizado la lista.')
            setTimeout(() => setToastMsg(null), 5000)
          }
          cargarPagos(true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarPagos])

  const countPendientes = contadoresEstado.pendiente
  const countAprobados = contadoresEstado.aprobado
  const countRechazados = contadoresEstado.rechazado
  const countTodos = contadoresEstado.todos || pagos.length
  const countGas = pagos.filter(p => p.servicio === 'gas').length
  const countCondominio = pagos.filter(p => p.servicio === 'condominio').length
  const countMixto = pagos.filter(p => p.servicio === 'mixto').length

  // Totales diferenciados por servicio (pagos aprobados)
  const resumenServicios = pagos.reduce(
    (acc, p) => {
      if (p.estado !== 'aprobado') return acc
      if (p.servicio === 'gas') {
        acc.gasBs += Number(p.monto_bs || 0)
        acc.gasUsd += Number(p.monto_usd || 0)
      } else if (p.servicio === 'mixto' && p.metaDomus) {
        acc.gasBs += Number(p.metaDomus.gasMontoBs || 0)
        acc.gasUsd += Number(p.metaDomus.gasMontoUsd || 0)
        acc.condBs += Number(p.metaDomus.condominioMontoBs || 0)
        acc.condUsd += Number(p.metaDomus.condominioMontoUsd || 0)
      } else {
        acc.condBs += Number(p.monto_bs || 0)
        acc.condUsd += Number(p.monto_usd || 0)
      }
      return acc
    },
    { gasBs: 0, gasUsd: 0, condBs: 0, condUsd: 0 }
  )

  const filtrados = pagos.filter(p => {
    const matchEstado = filtro === 'todos' ? true : p.estado === filtro
    const matchServicio = filtroServicio === 'todos' ? true : p.servicio === filtroServicio
    return matchEstado && matchServicio
  })

  // ── Cambiar estado del pago (Aprobar / Rechazar con bloqueo atómico) ──────────
  const handleAction = async (id: string, accion: 'aprobado' | 'rechazado') => {
    if (procesandoId !== null) return

    const tasaInfo = obtenerTasaBcvConfiable(config?.tasa_bcv_actual)
    if (accion === 'aprobado' && tasaInfo.esRespaldo) {
      const confirmar = window.confirm(
        `⚠️ Advertencia: La tasa BCV en vivo no está cargada en la configuración del edificio. Se usará la tasa de respaldo (Bs. ${tasaInfo.tasa.toFixed(2)}). ¿Deseas continuar con la aprobación?`
      )
      if (!confirmar) return
    }

    let reclamadoEnServidor = false
    let liquidacionConfirmada = false
    setProcesandoId(id)
    try {
      const pagoObj = pagos.find(p => p.id === id)
      const metaExistente = pagoObj?.metaDomus || parsePagoMeta(pagoObj?.notas_admin)
      const notasBaseLimpias = stripPagoMeta(pagoObj?.notas_admin)
      const notasConComentario = nota.trim()
        ? (notasBaseLimpias ? `${notasBaseLimpias} | Nota Admin: ${nota.trim()}` : `Nota Admin: ${nota.trim()}`)
        : notasBaseLimpias
      const notasFinal = metaExistente ? encodePagoMeta(notasConComentario, metaExistente) : notasConComentario

      // 1. Reclamar atómicamente el pago desde estado 'pendiente' (anti-doble aprobación)
      let reclamado = false
      let yaProcesado = false
      let pagoDb: any = null

      const { data: rpcClaim, error: rpcClaimErr } = await supabase.rpc('reclamar_pago_para_revision', {
        p_pago_id: id,
        p_nuevo_estado: accion,
        p_notas_admin: notasFinal,
      })

      if (!rpcClaimErr && rpcClaim) {
        if (rpcClaim.already_processed) {
          yaProcesado = true
        } else if (!rpcClaim.ok) {
          setToastMsg(`⚠️ ${rpcClaim.error || 'No se pudo procesar el pago.'}`)
          setTimeout(() => setToastMsg(null), 5000)
          return
        } else {
          reclamado = true
          reclamadoEnServidor = true
          pagoDb = rpcClaim.pago || null
        }
      } else {
        // Fallback atómico si el RPC aún no está desplegado en la instancia
        const updatePayload: Record<string, unknown> = {
          estado: accion,
          notas_admin: notasFinal,
          fecha_revision: new Date().toISOString(),
        }
        let claimRes = await supabase
          .from('pagos_reportados')
          .update(updatePayload)
          .eq('id', id)
          .eq('estado', 'pendiente')
          .select('id, apartamento_id, reportado_por, monto_bs, monto_usd, referencia, fecha_pago, notas_admin, metodo')
          .maybeSingle()

        if (claimRes.error && (claimRes.error.message?.includes('fecha_revision') || claimRes.error.code === '42703')) {
          claimRes = await supabase
            .from('pagos_reportados')
            .update({ estado: accion, notas_admin: notasFinal })
            .eq('id', id)
            .eq('estado', 'pendiente')
            .select('id, apartamento_id, reportado_por, monto_bs, monto_usd, referencia, fecha_pago, notas_admin, metodo')
            .maybeSingle()
        }

        if (claimRes.error) {
          setToastMsg(`⚠️ Error: ${claimRes.error.message}`)
          setTimeout(() => setToastMsg(null), 5000)
          return
        }

        if (!claimRes.data) {
          yaProcesado = true
        } else {
          reclamado = true
          reclamadoEnServidor = true
          pagoDb = claimRes.data
        }
      }

      if (yaProcesado || !reclamado) {
        setToastMsg('⚠️ Este pago ya fue procesado anteriormente.')
        setTimeout(() => setToastMsg(null), 5000)
        setSelected(null)
        appCache.invalidateTags(['pagos', 'saldos', 'recibos', 'mora'])
        cargarPagos(true)
        return
      }

      if (accion === 'rechazado') {
        const aptoIdRech = pagoObj?.apartamento_id || (pagoObj?.apartamento as any)?.id || ''
        const aptoNumRech = pagoObj?.apartamento?.numero || ''
        if (metaExistente && (metaExistente.tipoServicio === 'gas' || metaExistente.tipoServicio === 'mixto' || (metaExistente.gasItems && metaExistente.gasItems.length > 0))) {
          await rechazarPagoGasDesdeReporte({
            pagoReportadoId: id,
            apartamentoId: aptoIdRech,
            apartamentoNumero: aptoNumRech,
            meta: metaExistente
          })
          setToastMsg('❌ Pago rechazado y cuota(s) de gas devueltas a pendiente')
        } else {
          setToastMsg('❌ Pago rechazado')
        }
      }

      if (accion === 'aprobado') {
        if (!pagoDb) {
          const { data: fetchedPagoDb, error: errPagoDb } = await supabase
            .from('pagos_reportados')
            .select('id, apartamento_id, reportado_por, monto_bs, monto_usd, referencia, fecha_pago, notas_admin, metodo')
            .eq('id', id)
            .maybeSingle()

          if (errPagoDb) {
            console.warn('[AdminRecibos] Error obteniendo datos del pago aprobado:', errPagoDb)
          }
          pagoDb = fetchedPagoDb
        }

        let aptoId = pagoDb?.apartamento_id || pagoObj?.apartamento_id || (pagoObj?.apartamento as any)?.id
        const reportadoPorId = pagoDb?.reportado_por || pagoObj?.reportado_por

        // Respaldo: Si no viene apartamento_id pero sí reportado_por, buscar apartamento_id en su perfil
        if (!aptoId && reportadoPorId) {
          const { data: perfData } = await supabase
            .from('perfiles')
            .select('apartamento_id')
            .eq('id', reportadoPorId)
            .maybeSingle()
          if (perfData?.apartamento_id) {
            aptoId = perfData.apartamento_id
          }
        }

        const metaPago = parsePagoMeta(pagoDb?.notas_admin || notasFinal) || metaExistente
        const tasaActual = getTasaBcvNumerica(config?.tasa_bcv_actual)
        const montoTotalBs = Number(pagoDb?.monto_bs ?? selected?.monto_bs ?? pagoObj?.monto_bs ?? 0)
        const montoTotalUsd = Number(pagoDb?.monto_usd ?? selected?.monto_usd ?? pagoObj?.monto_usd ?? 0)
        const refPago = pagoDb?.referencia || selected?.numero_referencia || pagoObj?.numero_referencia || 'S/R'
        const fechaPagoStr = pagoDb?.fecha_pago || selected?.fecha_pago || pagoObj?.fecha_pago || getHoyVE()
        const aptoNumPre = selected?.apartamento?.numero || pagoObj?.apartamento?.numero || ''

        if (aptoId) {
          // A. Reconciliar porción de Gas Comunal si el pago es de Gas o Mixto
          if (metaPago && (metaPago.tipoServicio === 'gas' || metaPago.tipoServicio === 'mixto')) {
            try {
              await aprobarPagoGasDesdeReporte({
                pagoReportadoId: id,
                apartamentoId: aptoId,
                apartamentoNumero: aptoNumPre,
                meta: metaPago,
                montoTotalBs,
                montoTotalUsd,
                referencia: refPago,
                metodo: pagoDb?.metodo || 'transferencia',
                fechaPago: fechaPagoStr,
                tasaBcv: tasaActual
              })
            } catch (errGas) {
              console.error('[AdminRecibos] Error aprobando porción de Gas:', errGas)
            }
          }

          // B. Aplicar porción de Condominio Ordinario con prelación (NUNCA para pagos solo Gas)
          const debeAplicarCondominio =
            !metaPago ||
            metaPago.tipoServicio === 'condominio' ||
            (metaPago.tipoServicio === 'mixto' && ((metaPago.condominioMontoBs || 0) > 0.05 || (metaPago.condominioMontoUsd || 0) > 0.05))

          if (debeAplicarCondominio) {
            let condBs = metaPago?.tipoServicio === 'mixto' ? Number(metaPago.condominioMontoBs || 0) : montoTotalBs
            let condUsd = metaPago?.tipoServicio === 'mixto' ? Number(metaPago.condominioMontoUsd ?? 0) : Number(pagoDb?.monto_usd || 0)

            // Liquidar cuotas extraoficiales / especiales seleccionadas (vigentes o adelantadas futuras) antes de prelación ordinaria
            if (metaPago?.cuotasEspeciales && metaPago.cuotasEspeciales.length > 0 && (condBs > 0.01 || condUsd > 0.01)) {
              try {
                const resCuotas = await liquidarCuotasEspecialesDesdePago({
                  apartamentoId: aptoId,
                  pagoReportadoId: id,
                  cuotasEspeciales: metaPago.cuotasEspeciales,
                  montoDisponibleBs: condBs,
                  montoDisponibleUsd: condUsd,
                  tasaBcv: tasaActual,
                  esAdelantado: Boolean(metaPago.esAdelantoCuotaFutura),
                  fechaPago: fechaPagoStr
                })
                condBs = Math.max(0, Number((condBs - resCuotas.liquidadoBs).toFixed(2)))
                condUsd = Math.max(0, Number((condUsd - resCuotas.liquidadoUsd).toFixed(2)))
              } catch (errCuota) {
                console.warn('[AdminRecibos] Aviso liquidando cuotas especiales:', errCuota)
              }
            }

            if (!metaPago?.soloCuotasEspeciales && (condBs > 0.01 || condUsd > 0.01)) {
              try {
                const resPrelacion = await aplicarPagoConPrelacion(
                  {
                    id,
                    apartamento_id: aptoId,
                    monto_bs: condBs,
                    monto_usd: condUsd > 0 ? condUsd : null,
                    referencia: refPago,
                    banco_origen: selected?.banco_origen || pagoObj?.banco_origen || 'Transferencia',
                    fecha_pago: fechaPagoStr,
                    tasa_bcv: tasaActual
                  },
                  tasaActual,
                  config?.fecha_inicio_gestion
                )
                console.log('[AdminRecibos] Resultado conciliación con prelación:', resPrelacion)
              } catch (errPrel) {
                console.error('[AdminRecibos] Error aplicando prelación de pago:', errPrel)
              }
            }
          }
        }

        // 4. Despachar email automático de confirmación de pago y constancia de solvencia
        try {
          const [aptoRes, perfilRes] = await Promise.all([
            aptoId
              ? supabase.from('apartamentos').select('numero, propietario_nombre').eq('id', aptoId).maybeSingle()
              : Promise.resolve({ data: null }),
            reportadoPorId
              ? supabase.from('perfiles').select('nombre_completo, propietario_email, apartamento_id').eq('id', reportadoPorId).maybeSingle()
              : Promise.resolve({ data: null })
          ])

          let aptoNum = aptoRes.data?.numero || selected?.apartamento?.numero || pagoObj?.apartamento?.numero || null

          // Si aún no tenemos el número pero tenemos el apartamento del perfil o aptoId
          if (!aptoNum && (perfilRes.data?.apartamento_id || aptoId)) {
            const targetAptoId = perfilRes.data?.apartamento_id || aptoId
            const { data: targetApto } = await supabase
              .from('apartamentos')
              .select('numero, propietario_nombre')
              .eq('id', targetAptoId)
              .maybeSingle()
            if (targetApto?.numero) {
              aptoNum = targetApto.numero
            }
          }

          if (!aptoNum) {
            aptoNum = 'S/N'
          }

          let emailDestino = perfilRes.data?.propietario_email || pagoObj?.residente_email
          let nombreDestino = perfilRes.data?.nombre_completo || aptoRes.data?.propietario_nombre || selected?.residente_nombre || pagoObj?.residente_nombre || (aptoNum !== 'S/N' ? `Propietario Apto ${aptoNum}` : 'Residente')

          // Si aún no hay email, buscar en cualquier perfil registrado para ese apartamento
          if ((!emailDestino || !emailDestino.includes('@')) && aptoId) {
            const { data: perfilApto } = await supabase
              .from('perfiles')
              .select('propietario_email, nombre_completo')
              .eq('apartamento_id', aptoId)
              .not('propietario_email', 'is', null)
              .limit(1)
              .maybeSingle()

            if (perfilApto?.propietario_email) {
              emailDestino = perfilApto.propietario_email
              if (!nombreDestino && perfilApto.nombre_completo) {
                nombreDestino = perfilApto.nombre_completo
              }
            }
          }

            // Calcular montos finales en Bs y USD
            let montoFinalBs = Number(pagoDb?.monto_bs ?? selected?.monto_bs ?? pagoObj?.monto_bs ?? 0)
            let montoFinalUsd = Number(pagoDb?.monto_usd ?? selected?.monto_usd ?? pagoObj?.monto_usd ?? 0)

            if (!montoFinalUsd && montoFinalBs > 0) {
              const tasa = getTasaBcvNumerica(config?.tasa_bcv_actual)
              montoFinalUsd = Number((montoFinalBs / tasa).toFixed(2))
            }

            // Extraer banco de origen
            let bancoFinal = selected?.banco_origen || pagoObj?.banco_origen || 'Transferencia'
            if (pagoDb?.notas_admin && pagoDb.notas_admin.includes('Banco')) {
              const match = pagoDb.notas_admin.match(/Banco(?: Origen)?:\s*([^\n,|]+)/i)
              if (match) bancoFinal = match[1].trim()
            }

            if (emailDestino && emailDestino.includes('@')) {
              console.log(`[AdminRecibos] Despachando email de agradecimiento y solvencia a: ${emailDestino} (Apto ${aptoNum})`)
              const emailRes = await despacharEmailPagoAprobado({
                destinatarioEmail: emailDestino,
                apartamentoNumero: aptoNum,
                propietarioNombre: nombreDestino,
                edificioNombre: config?.nombre_edificio || 'Condominio Domus',
                montoUsd: montoFinalUsd,
                montoBs: montoFinalBs,
                referencia: pagoDb?.referencia || selected?.numero_referencia || pagoObj?.numero_referencia || 'S/R',
                fechaPago: pagoDb?.fecha_pago || selected?.fecha_pago || pagoObj?.fecha_pago || getHoyVE(),
                bancoOrigen: bancoFinal
              })
              console.log('[AdminRecibos] Resultado email enviado:', emailRes)
              if (emailRes.ok) {
                setToastMsg(`✅ Pago aprobado y correo de solvencia enviado a ${emailDestino}`)
              } else {
                setToastMsg(`✅ Pago aprobado y recibo marcado como solvente`)
              }
            } else {
              console.log(`[AdminRecibos] Apto ${aptoNum} no posee correo registrado, se omite envío.`)
              setToastMsg(`✅ Pago aprobado y recibo marcado como solvente`)
            }
          } catch (emailErr) {
            console.warn('[AdminRecibos] Error despachando email automático:', emailErr)
            setToastMsg(`✅ Pago aprobado y cuenta solvente`)
          }
        }

        liquidacionConfirmada = true
        setPagos(prev => prev.map(p => (p.id === id ? { ...p, estado: accion, notas_admin: notasFinal, notas_limpias: stripPagoMeta(notasFinal) } : p)))
        appCache.invalidateTags(['pagos', 'recibos', 'saldos', 'mora', 'gas', 'deudas_gas', 'calendario_config'])
        if (metaExistente?.tipoServicio === 'gas' || metaExistente?.tipoServicio === 'mixto') {
          window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
        }
        setTimeout(() => setToastMsg(null), 4000)
    } catch (err: any) {
      console.error('[AdminRecibos] Error en handleAction:', err)
      if (reclamadoEnServidor && !liquidacionConfirmada) {
        try {
          await supabase.rpc('revertir_reclamo_pago', {
            p_pago_id: id,
            p_motivo: err?.message || 'Error en conciliación',
          })
          setToastMsg('⚠️ Falló la conciliación posterior; el pago se revirtió a pendiente.')
        } catch (rollbackErr) {
          console.error('[AdminRecibos] Error revirtiendo reclamo:', rollbackErr)
          setToastMsg('⚠️ Falló la conciliación; verifica el estado del pago en base de datos.')
        }
        setTimeout(() => setToastMsg(null), 6000)
      }
    } finally {
      setSelected(null)
      setNota('')
      setProcesandoId(null)
    }
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Toast flotante */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#1f2937',
          color: '#fff',
          border: '1px solid #374151',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          padding: '12px 20px',
          borderRadius: '10px',
          zIndex: 9999,
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'slideIn 0.3s ease',
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🧾 Gestión de Recibos y Pagos</h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#10b98115',
              border: '1px solid #10b98130',
              color: '#10b981',
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '999px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
              Sincronizado en Vivo
            </span>
          </div>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>
            Revisión, aprobación y rechazo en tiempo real de transferencias reportadas por residentes
          </p>
        </div>
        <button
          onClick={() => cargarPagos(true)}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#fff',
            border: '1px solid #333',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          🔄 Actualizar Pagos
        </button>
      </div>

      {/* Banner de alerta de pagos pendientes */}
      {countPendientes > 0 && filtro !== 'pendiente' && (
        <div
          onClick={() => cambiarFiltro('pendiente')}
          style={{
            backgroundColor: '#f59e0b15',
            border: '1px solid #f59e0b40',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⏳</span>
            <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 700 }}>
              Hay {countPendientes} {countPendientes === 1 ? 'pago pendiente' : 'pagos pendientes'} esperando tu aprobación.
            </span>
          </div>
          <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 700 }}>
            Ver pendientes →
          </span>
        </div>
      )}

      {/* KPIs diferenciados por servicio (Aprobados) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
        marginBottom: '18px'
      }}>
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '14px',
          padding: '14px 18px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🏢 Recaudado Condominio (Aprobado)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff', marginTop: '4px' }}>
            Bs. {resumenServicios.condBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
            ≈ ${resumenServicios.condUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </div>
        </div>

        <div style={{
          backgroundColor: '#141414',
          border: '1px solid rgba(249, 115, 22, 0.28)',
          borderRadius: '14px',
          padding: '14px 18px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⛽ Recaudado Gas Comunal (Aprobado)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff', marginTop: '4px' }}>
            Bs. {resumenServicios.gasBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#fed7aa', fontWeight: 600 }}>
            ≈ ${resumenServicios.gasUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </div>
        </div>
      </div>

      {/* Filtros con contadores (Estado y Servicio) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos', count: countTodos },
            { id: 'pendiente', label: 'Pendientes', count: countPendientes, alert: countPendientes > 0 },
            { id: 'aprobado', label: 'Aprobados', count: countAprobados },
            { id: 'rechazado', label: 'Rechazados', count: countRechazados },
          ].map(f => {
            const isActivo = filtro === f.id
            return (
              <button
                key={f.id}
                onClick={() => cambiarFiltro(f.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: isActivo ? 'var(--color-accent, #f97316)' : '#1e1e1e',
                  color: isActivo ? '#fff' : '#888',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s',
                }}
              >
                <span>{f.label}</span>
                <span style={{
                  backgroundColor: isActivo ? 'rgba(255,255,255,0.2)' : f.alert ? '#f59e0b30' : '#2a2a2a',
                  color: isActivo ? '#fff' : f.alert ? '#f59e0b' : '#aaa',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos Servicios', count: pagos.length, color: '#94a3b8' },
            { id: 'condominio', label: '🏢 Condominio', count: countCondominio, color: '#60a5fa' },
            { id: 'gas', label: '⛽ Gas', count: countGas, color: '#fb923c' },
            { id: 'mixto', label: '🔀 Mixto', count: countMixto, color: '#c084fc' },
          ].map(sf => {
            const isActivo = filtroServicio === sf.id
            return (
              <button
                key={sf.id}
                onClick={() => setFiltroServicio(sf.id as any)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${isActivo ? sf.color : '#2a2a2a'}`,
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  backgroundColor: isActivo ? `${sf.color}20` : '#141414',
                  color: isActivo ? sf.color : '#888',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{sf.label}</span>
                <span style={{ opacity: 0.8 }}>({sf.count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista de pagos */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid #1e1e1e',
          borderRadius: '14px',
          padding: '40px',
          textAlign: 'center',
          color: '#666',
        }}>
          <p style={{ margin: 0, fontSize: '15px' }}>
            {filtro === 'pendiente'
              ? '🎉 ¡No hay pagos pendientes! Todo está al día.'
              : 'No hay pagos registrados en esta categoría.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtrados.map(pago => {
            const cfg = ESTADO_CONFIG[pago.estado] || ESTADO_CONFIG.pendiente
            const isSelected = selected?.id === pago.id
            const isPendiente = pago.estado === 'pendiente'

            return (
              <div
                key={pago.id}
                style={{
                  backgroundColor: '#141414',
                  border: isSelected ? '1px solid var(--color-accent, #f97316)' : isPendiente ? '1px solid #f59e0b40' : '1px solid #1e1e1e',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  transition: 'all 0.2s',
                  boxShadow: isPendiente ? '0 0 15px rgba(245, 158, 11, 0.05)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>
                        Apto {pago.apartamento?.numero || 'S/A'} — {pago.monto_usd && Number(pago.monto_usd) > 0 ? `$${Number(pago.monto_usd).toFixed(2)} USD (Bs. ${pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `Bs. ${pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </p>
                      <span style={{
                        backgroundColor: `${cfg.color}18`,
                        color: cfg.color,
                        border: `1px solid ${cfg.color}35`,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span style={{
                        backgroundColor: pago.servicio === 'gas'
                          ? 'rgba(249, 115, 22, 0.16)'
                          : pago.servicio === 'mixto'
                          ? 'rgba(168, 85, 247, 0.16)'
                          : 'rgba(59, 130, 246, 0.14)',
                        color: pago.servicio === 'gas'
                          ? '#fb923c'
                          : pago.servicio === 'mixto'
                          ? '#c084fc'
                          : '#60a5fa',
                        border: `1px solid ${pago.servicio === 'gas'
                          ? 'rgba(249, 115, 22, 0.35)'
                          : pago.servicio === 'mixto'
                          ? 'rgba(168, 85, 247, 0.35)'
                          : 'rgba(59, 130, 246, 0.3)'}`,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}>
                        {pago.servicio === 'gas' ? '⛽ Gas Comunal' : pago.servicio === 'mixto' ? '🔀 Mixto (Cond. + Gas)' : '🏢 Condominio'}
                      </span>
                      {(pago.metaDomus?.esAdelantoCuotaFutura || pago.metaDomus?.cuotasEspeciales?.some(c => c.esAdelantado)) && (
                        <span style={{
                          backgroundColor: 'rgba(14, 165, 233, 0.16)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}>
                          {pago.metaDomus?.esAbonoParcialAdelanto
                            ? '🌗 Abono Adelantado · Cuota Extraordinaria'
                            : '🗓️ Pago Adelantado · Cuota Extraordinaria'}
                        </span>
                      )}
                    </div>

                    <p style={{ color: '#888', fontSize: '12px', marginTop: '6px', margin: 0 }}>
                      {pago.banco_origen} · Ref: <strong style={{ color: '#ccc' }}>{pago.numero_referencia}</strong> · Reportado por <strong style={{ color: '#fff' }}>{pago.residente_nombre}</strong> · {new Date(pago.created_at).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>

                    {(pago.notas_limpias || stripPagoMeta(pago.notas_admin)) && (
                      <p style={{ color: '#aaa', fontSize: '12px', marginTop: '6px', margin: 0, fontStyle: 'italic' }}>
                        Nota: {pago.notas_limpias || stripPagoMeta(pago.notas_admin)}
                      </p>
                    )}

                    {pago.metaDomus?.cuotasEspeciales && pago.metaDomus.cuotasEspeciales.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11px' }}>
                        {pago.metaDomus.cuotasEspeciales.map((ce, idx) => (
                          <span key={`${ce.columnaId}-${idx}`} style={{
                            backgroundColor: ce.esAdelantado ? 'rgba(14, 165, 233, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                            border: ce.esAdelantado ? '1px solid rgba(56, 189, 248, 0.28)' : '1px solid rgba(234, 179, 8, 0.28)',
                            color: ce.esAdelantado ? '#7dd3fc' : '#fde047',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 700
                          }}>
                            ✨ {ce.titulo}{ce.fechaEmision ? ` (Inicio: ${ce.fechaEmision})` : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {pago.servicio === 'mixto' && pago.metaDomus && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11px' }}>
                        <span style={{ color: '#fb923c', fontWeight: 700 }}>
                          ⛽ Gas: Bs. {Number(pago.metaDomus.gasMontoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${Number(pago.metaDomus.gasMontoUsd || 0).toFixed(2)})
                        </span>
                        <span style={{ color: '#60a5fa', fontWeight: 700 }}>
                          🏢 Condominio: Bs. {Number(pago.metaDomus.condominioMontoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (${Number(pago.metaDomus.condominioMontoUsd || 0).toFixed(2)})
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {pago.comprobante_url && (
                      <button
                        onClick={() => setPreviewImg(pago.comprobante_url || null)}
                        style={{
                          backgroundColor: '#2a2a2a',
                          color: '#60a5fa',
                          border: '1px solid #3b82f640',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        📎 Ver Comprobante
                      </button>
                    )}

                    <button
                      onClick={() => setSelected(isSelected ? null : pago)}
                      style={{
                        backgroundColor: isPendiente ? '#f59e0b' : '#2a2a2a',
                        color: isPendiente ? '#000' : '#fff',
                        border: isPendiente ? 'none' : '1px solid #333',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {isSelected ? 'Cerrar' : isPendiente ? '⚡ Revisar y Aprobar' : 'Revisar / Gestionar'}
                    </button>
                  </div>
                </div>

                {isSelected && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid #222', paddingTop: '16px' }}>
                    <input
                      placeholder="Nota para el residente o bitácora interna (opcional)..."
                      value={nota}
                      onChange={e => setNota(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #2a2a2a',
                        color: '#fff',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        marginBottom: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        disabled={procesandoId === pago.id || procesando}
                        onClick={() => handleAction(pago.id, 'aprobado')}
                        style={{
                          backgroundColor: '#10b981',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          cursor: procesando ? 'not-allowed' : 'pointer',
                          opacity: procesando ? 0.65 : 1,
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {procesandoId === pago.id ? 'Procesando...' : '✅ Aprobar Pago'}
                      </button>
                      <button
                        disabled={procesandoId === pago.id || procesando}
                        onClick={() => handleAction(pago.id, 'rechazado')}
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          cursor: procesando ? 'not-allowed' : 'pointer',
                          opacity: procesando ? 0.65 : 1,
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {procesandoId === pago.id ? 'Procesando...' : '❌ Rechazar Pago'}
                      </button>
                      <button
                        onClick={() => setSelected(null)}
                        style={{
                          backgroundColor: '#2a2a2a',
                          color: '#888',
                          border: 'none',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {pagos.length < totalPagosDb && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', paddingTop: '14px' }}>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
                Mostrando {pagos.length} de {totalPagosDb} pagos
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextLim = limitePagos + 100
                  setLimitePagos(nextLim)
                  cargarPagos(true, nextLim)
                }}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cargar 100 más
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de Vista Previa de Comprobante */}
      {previewImg && (
        <div
          onClick={() => setPreviewImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div style={{ maxWidth: '90%', maxHeight: '90%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <img src={previewImg} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', border: '1px solid #333' }} />
            <div style={{ marginTop: '14px' }}>
              <button
                onClick={() => setPreviewImg(null)}
                style={{
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
