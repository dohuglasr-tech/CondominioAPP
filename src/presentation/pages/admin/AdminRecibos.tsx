import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { useAuth } from '../../../application/contexts/AuthContext'
import { despacharEmailPagoAprobado } from '../../../data/emailService'
import { limpiarCacheMora } from '../../../data/moraService'
import { SkeletonListItem } from '../../components/Skeleton'

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
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>(initialFilter)
  const [selected, setSelected] = useState<PagoAdmin | null>(null)
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)
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

  // ── Cargar pagos reales desde Supabase con Caché ───────────────────────
  const cargarPagos = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const mapped = await appCache.fetch(
        'admin_pagos_lista',
        async () => {
          const [pagosRes, aptRes, perfilesRes] = await Promise.all([
            supabase.from('pagos_reportados').select('*').order('created_at', { ascending: false }),
            supabase.from('apartamentos').select('id, numero, propietario_nombre'),
            supabase.from('perfiles').select('id, nombre_completo, apartamento_id, propietario_email')
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

          if (!pagosRes.data) return []

          return pagosRes.data.map((r: any) => {
            let banco = 'Transferencia'
            if (r.notas_admin && r.notas_admin.includes('Banco')) {
              const match = r.notas_admin.match(/Banco(?: Origen)?:\s*([^\n,|]+)/i)
              if (match) banco = match[1].trim()
            }

            // Resolver número de apartamento y datos
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
              comprobante_url: r.comprobante_url,
              apartamento: aptoInfo ? { numero: aptoInfo.numero, id: finalAptoId } : null,
              residente_nombre: residentName,
              residente_email: residentEmail,
            }
          })
        },
        { ttlMs: 2 * 60 * 1000, tags: ['pagos', 'apartamentos'], forceRefresh }
      )
      setPagos(mapped)
    } catch (err: any) {
      console.error('[AdminRecibos] Excepción al cargar pagos:', err)
      setPagos([])
    } finally {
      setLoading(false)
    }
  }, [])

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
          appCache.invalidateTags(['pagos', 'saldos', 'recibos', 'mora'])
          if (payload.eventType === 'INSERT') {
            setToastMsg('🔔 ¡Nuevo pago recibido! Se ha actualizado la lista.')
            setTimeout(() => setToastMsg(null), 5000)
          }
          cargarPagos(true)
        }
      )
      .subscribe()
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarPagos])

  const countPendientes = pagos.filter(p => p.estado === 'pendiente').length
  const countAprobados = pagos.filter(p => p.estado === 'aprobado').length
  const countRechazados = pagos.filter(p => p.estado === 'rechazado').length

  const filtrados = filtro === 'todos' ? pagos : pagos.filter(p => p.estado === filtro)

  // ── Cambiar estado del pago (Aprobar / Rechazar) ──────────────
  const handleAction = async (id: string, accion: 'aprobado' | 'rechazado') => {
    setProcesando(true)
    try {
      const pagoObj = pagos.find(p => p.id === id)
      let notasFinal = pagoObj?.notas_admin || ''
      if (nota.trim()) {
        notasFinal = notasFinal ? `${notasFinal} | Nota Admin: ${nota.trim()}` : `Nota Admin: ${nota.trim()}`
      }

      // Construir el objeto de actualización con campos seguros
      const updatePayload: Record<string, unknown> = {
        estado: accion,
        notas_admin: notasFinal,
      }

      // Intentar incluir fecha_revision (la columna existe si se ejecutó migration_v7)
      try {
        updatePayload.fecha_revision = new Date().toISOString()
      } catch (_) { /* ignorar si la columna no existe aún */ }

      const { error } = await supabase
        .from('pagos_reportados')
        .update(updatePayload)
        .eq('id', id)

      if (error) {
        // Si el error es por columna inexistente, reintentar sin fecha_revision
        if (error.message?.includes('fecha_revision') || error.code === '42703') {
          const { error: error2 } = await supabase
            .from('pagos_reportados')
            .update({ estado: accion, notas_admin: notasFinal })
            .eq('id', id)
          if (error2) {
            setToastMsg(`⚠️ Error: ${error2.message}`)
            setTimeout(() => setToastMsg(null), 5000)
            return
          }
        } else {
          setToastMsg(`⚠️ Error: ${error.message}`)
          setTimeout(() => setToastMsg(null), 5000)
          return
        }
      }

      if (accion === 'aprobado') {
        const { data: pagoDb, error: errPagoDb } = await supabase
          .from('pagos_reportados')
          .select('id, apartamento_id, reportado_por, monto_bs, monto_usd, referencia, fecha_pago, notas_admin, metodo')
          .eq('id', id)
          .maybeSingle()

        if (errPagoDb) {
          console.warn('[AdminRecibos] Error obteniendo datos del pago aprobado:', errPagoDb)
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

        if (aptoId) {
          const esAbono = pagoDb?.notas_admin?.includes('[ABONO PARCIAL')

          if (esAbono) {
            // Manejo de abono parcial:
            // 1. Consultar recibos pendientes del apartamento
            const { data: recsPend } = await supabase
              .from('recibos_generados')
              .select('id, mes_facturado, total_usd, total_bs, tasa_bcv')
              .eq('apartamento_id', aptoId)
              .eq('estado', 'pendiente')
              .order('mes_facturado', { ascending: true })

            const abonoUsd = Number(pagoDb?.monto_usd || 0)
            const abonoBs = Number(pagoDb?.monto_bs || 0)

            if (recsPend && recsPend.length > 0) {
              const primerRec = recsPend[0]
              const esPreMarzo = (primerRec.mes_facturado || '').slice(0, 7) < '2026-03'

              if (esPreMarzo) {
                // Cálculo en Bolívares
                const nuevoBs = Math.max(0, Number(primerRec.total_bs || 0) - abonoBs)
                if (nuevoBs <= 0.05) {
                  await supabase
                    .from('recibos_generados')
                    .update({ estado: 'pagado', total_bs: 0 })
                    .eq('id', primerRec.id)
                } else {
                  await supabase
                    .from('recibos_generados')
                    .update({ total_bs: nuevoBs })
                    .eq('id', primerRec.id)
                }
              } else {
                // Cálculo en Dólares
                const tasaRec = primerRec.tasa_bcv || 859.06
                const nuevoUsd = Math.max(0, Number(primerRec.total_usd || 0) - abonoUsd)
                const nuevoBs = nuevoUsd * tasaRec
                if (nuevoUsd <= 0.05) {
                  await supabase
                    .from('recibos_generados')
                    .update({ estado: 'pagado', total_usd: 0, total_bs: 0 })
                    .eq('id', primerRec.id)
                } else {
                  await supabase
                    .from('recibos_generados')
                    .update({ total_usd: nuevoUsd, total_bs: nuevoBs })
                    .eq('id', primerRec.id)
                }
              }
            }

            // Reducir en deudas_mora si existe
            const { data: moraExistente } = await supabase
              .from('deudas_mora')
              .select('id, monto_usd, monto_bs')
              .eq('apartamento_id', aptoId)
              .eq('estado', 'activo')
              .maybeSingle()

            if (moraExistente) {
              const nuevoMoraUsd = Math.max(0, Number(moraExistente.monto_usd || 0) - abonoUsd)
              const nuevoMoraBs = Math.max(0, Number(moraExistente.monto_bs || 0) - abonoBs)
              const solvente = nuevoMoraUsd <= 0.05 && nuevoMoraBs <= 0.05
              await supabase
                .from('deudas_mora')
                .update({
                  monto_usd: nuevoMoraUsd,
                  monto_bs: nuevoMoraBs,
                  estado: solvente ? 'solventado' : 'en_convenio'
                })
                .eq('id', moraExistente.id)
            }
          } else {
            // 1. Sincronizar recibos_generados: marcar como pagados
            const { error: errRecibo } = await supabase
              .from('recibos_generados')
              .update({ estado: 'pagado' })
              .eq('apartamento_id', aptoId)
              .eq('estado', 'pendiente')

            if (errRecibo) {
              console.error('[AdminRecibos] Error marcando recibo como pagado:', errRecibo)
            }

            // 2. Sincronizar deudas_mora: solventar
            const { error: errMora } = await supabase
              .from('deudas_mora')
              .update({ estado: 'solventado' })
              .eq('apartamento_id', aptoId)
              .eq('estado', 'activo')

            if (errMora) {
              console.warn('[AdminRecibos] Error solventando deudas_mora:', errMora)
            }
          }

          // 3. Limpiar caché de mora para actualizar inmediatamente todas las vistas
          limpiarCacheMora()
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
              const tasa = config?.tasa_bcv_actual && config.tasa_bcv_actual > 1 ? config.tasa_bcv_actual : 859.06
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
                edificioNombre: config?.nombre_edificio || 'Residencias Ocutuy 5',
                montoUsd: montoFinalUsd,
                montoBs: montoFinalBs,
                referencia: pagoDb?.referencia || selected?.numero_referencia || pagoObj?.numero_referencia || 'S/R',
                fechaPago: pagoDb?.fecha_pago || selected?.fecha_pago || pagoObj?.fecha_pago || new Date().toISOString().slice(0, 10),
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

        setPagos(prev => prev.map(p => (p.id === id ? { ...p, estado: accion, notas_admin: notasFinal } : p)))
        appCache.invalidateTags(['pagos', 'recibos', 'saldos', 'mora'])
        setTimeout(() => setToastMsg(null), 4000)
    } catch (err: any) {
      console.error('[AdminRecibos] Error en handleAction:', err)
    } finally {
      setSelected(null)
      setNota('')
      setProcesando(false)
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

      {/* Filtros con contadores */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'todos', label: 'Todos', count: pagos.length },
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
                backgroundColor: isActivo ? '#f97316' : '#1e1e1e',
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
                  border: isSelected ? '1px solid #f97316' : isPendiente ? '1px solid #f59e0b40' : '1px solid #1e1e1e',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  transition: 'all 0.2s',
                  boxShadow: isPendiente ? '0 0 15px rgba(245, 158, 11, 0.05)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>
                        Apto {pago.apartamento?.numero || 'S/A'} — Bs. {pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

                      {pago.notas_admin && pago.notas_admin.includes('[ABONO PARCIAL') && (
                        <span style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.18)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}>
                          🪙 Abono Parcial
                        </span>
                      )}
                    </div>

                    <p style={{ color: '#888', fontSize: '12px', marginTop: '6px', margin: 0 }}>
                      {pago.banco_origen} · Ref: <strong style={{ color: '#ccc' }}>{pago.numero_referencia}</strong> · Reportado por <strong style={{ color: '#fff' }}>{pago.residente_nombre}</strong> · {new Date(pago.created_at).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>

                    {pago.notas_admin && (
                      <p style={{ color: '#aaa', fontSize: '12px', marginTop: '6px', margin: 0, fontStyle: 'italic' }}>
                        Nota: {pago.notas_admin}
                      </p>
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
                        disabled={procesando}
                        onClick={() => handleAction(pago.id, 'aprobado')}
                        style={{
                          backgroundColor: '#10b981',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {procesando ? 'Procesando...' : '✅ Aprobar Pago'}
                      </button>
                      <button
                        disabled={procesando}
                        onClick={() => handleAction(pago.id, 'rechazado')}
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {procesando ? 'Procesando...' : '❌ Rechazar Pago'}
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
                  backgroundColor: '#f97316',
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
