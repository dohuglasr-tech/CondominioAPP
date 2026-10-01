import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { formatAlicuotaPct, parseAlicuotaInput, getAlicuotaDecimal, getAlicuotaPctNumber } from '../../../utils/alicuota'
import { useAuth } from '../../../application/contexts/AuthContext'
import { useBcvRate } from '../../../data/useBcvRate'
import { obtenerTodosLosSaldosAFavor, SaldoApartamento } from '../../../data/saldoFavorService'
import { RetirarSaldoModal } from '../../components/RetirarSaldoModal'
import { AbonarSaldoModal } from '../../components/AbonarSaldoModal'
import { CompensarDeudaModal } from '../../components/CompensarDeudaModal'

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
  referencia: string
  estado: 'aprobado' | 'pendiente' | 'rechazado'
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
  notas_internas: string
  propietario: PersonaContacto
  inquilino?: PersonaContacto
  historial_pagos: PagoHistorial[]
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
  const { perfil, user } = useAuth()
  const { rate } = useBcvRate()
  const tasaBcvValida = rate && rate > 1 ? rate : 859.06

  const [residentes, setResidentes] = useState<Residente[]>([])
  const [saldosPorApto, setSaldosPorApto] = useState<Map<string, SaldoApartamento>>(new Map())
  const [deudasPorApto, setDeudasPorApto] = useState<Map<string, { totalUsd: number; totalBs: number }>>(new Map())
  const [saldoModalOpen, setSaldoModalOpen] = useState(false)
  const [abonarModalOpen, setAbonarModalOpen] = useState(false)
  const [compensarModalOpen, setCompensarModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'con_usuario' | 'ph'>('todos')
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

  const cargarResidentes = useCallback(async () => {
    setLoading(true)
    try {
      const [aptosRes, perfilesRes, pagosRes, saldosMap, moraRes, recibosPendRes] = await Promise.all([
        supabase.from('apartamentos').select('*'),
        supabase.from('perfiles').select('*'),
        supabase.from('pagos_reportados').select('id, monto_bs, referencia, estado, fecha_pago, reportado_por, apartamento_id, created_at').order('created_at', { ascending: false }),
        obtenerTodosLosSaldosAFavor(tasaBcvValida),
        supabase.from('deudas_mora').select('apartamento_id, monto_usd, monto_bs').eq('estado', 'activo'),
        supabase.from('recibos_generados').select('apartamento_id, total_usd, total_bs').eq('estado', 'pendiente'),
      ])

      setSaldosPorApto(saldosMap)

      const dMap = new Map<string, { totalUsd: number; totalBs: number }>()
      ;(moraRes.data || []).forEach((m: any) => {
        if (!m.apartamento_id) return
        dMap.set(m.apartamento_id, {
          totalUsd: Number(m.monto_usd || 0),
          totalBs: Number(m.monto_bs || 0),
        })
      })
      ;(recibosPendRes.data || []).forEach((r: any) => {
        if (!r.apartamento_id) return
        const prev = dMap.get(r.apartamento_id) || { totalUsd: 0, totalBs: 0 }
        dMap.set(r.apartamento_id, {
          totalUsd: prev.totalUsd + Number(r.total_usd || 0),
          totalBs: prev.totalBs + Number(r.total_bs || 0),
        })
      })
      setDeudasPorApto(dMap)

      if (aptosRes.error) {
        console.warn('[AdminResidentes] Error cargando apartamentos:', aptosRes.error.message)
      }

      const aptosList = aptosRes.data || []
      const perfilesList = perfilesRes.data || []
      const pagosList = pagosRes.data || []

      // Mapear perfiles por apartamento_id
      const perfilPorApto = new Map<string, any>()
      perfilesList.forEach((p: any) => {
        if (p.apartamento_id) {
          perfilPorApto.set(p.apartamento_id, p)
        }
      })

      // Mapear pagos por apartamento_id
      const pagosPorApto = new Map<string, PagoHistorial[]>()
      pagosList.forEach((p: any) => {
        const aptoId = p.apartamento_id
        if (aptoId) {
          const list = pagosPorApto.get(aptoId) || []
          list.push({
            id: p.id,
            fecha: p.fecha_pago || p.created_at,
            mes: p.created_at?.substring(0, 7) || 'Reciente',
            monto: `Bs. ${Number(p.monto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
            referencia: p.referencia || 'S/R',
            estado: p.estado || 'aprobado'
          })
          pagosPorApto.set(aptoId, list)
        }
      })

      // Unir datos para la vista
      const listaFormateada: Residente[] = aptosList.map((a: any) => {
        const perfil = perfilPorApto.get(a.id)
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

        const propEmail = esAlquilado
          ? (perfil?.propietario_email || '')
          : (perfil?.email || '')

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
          meses_deuda: 0,
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
          reportes_abiertos: 0,
          created_at: a.created_at
        }
      })

      // Ordenar por número de apartamento
      listaFormateada.sort((a, b) => {
        const numA = parseInt(a.apartamento.replace(/\D/g, '')) || 0
        const numB = parseInt(b.apartamento.replace(/\D/g, '')) || 0
        if (numA !== numB) return numA - numB
        return a.apartamento.localeCompare(b.apartamento)
      })

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
  }, [selected])

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

      appCache.invalidateTags(['apartamentos', 'residentes', 'pagos', 'saldos'])

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

      appCache.invalidateTags(['apartamentos', 'residentes', 'saldos'])

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

  // ── Filtros ──────
  const filtrados = residentes.filter(r => {
    const matchText = (
      r.apartamento.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.propietario.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.inquilino?.nombre.toLowerCase().includes(busqueda.toLowerCase()) ?? false)
    )
    if (!matchText) return false

    if (filtroTipo === 'con_usuario') return r.tiene_usuario
    if (filtroTipo === 'ph') return r.es_ph
    return true
  })

  const conUsuarioCount = residentes.filter(r => r.tiene_usuario).length
  const phCount = residentes.filter(r => r.es_ph).length

  const getDeudaColor = (meses: number) => {
    if (meses === 0) return '#10b981'
    if (meses === 1) return '#f59e0b'
    return '#ef4444'
  }

  const getOcupacionLabel = (estado: string) => {
    if (estado === 'ocupado_propietario') return 'Ocupado (Propietario)'
    if (estado === 'alquilado') return 'Alquilado'
    return 'Desocupado'
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

      {/* Filtros rápidos */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => setFiltroTipo('todos')}
          style={{
            flex: 1,
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'todos' ? '#f97316' : '#1e1e1e',
            color: filtroTipo === 'todos' ? '#fff' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          Todos ({residentes.length})
        </button>
        <button
          onClick={() => setFiltroTipo('con_usuario')}
          style={{
            flex: 1,
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: filtroTipo === 'con_usuario' ? '#10b981' : '#1e1e1e',
            color: filtroTipo === 'con_usuario' ? '#fff' : '#888',
            transition: 'all 0.15s ease'
          }}
        >
          Con Usuario ({conUsuarioCount})
        </button>
        <button
          onClick={() => setFiltroTipo('ph')}
          style={{
            flex: 1,
            padding: '7px 8px',
            borderRadius: '8px',
            fontSize: '11.5px',
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
            <p style={{ margin: 0, fontSize: '14px' }}>No se encontraron apartamentos.</p>
          </div>
        ) : (
          filtrados.map(r => {
            const isSelected = selected?.id === r.id
            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r)
                  setEditMode(false)
                }}
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${isSelected ? '#f97316' : '#1e1e1e'}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  borderLeft: `4px solid ${isSelected ? '#f97316' : r.es_ph ? '#8b5cf6' : '#333'}`,
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>Apto {r.apartamento}</span>
                    {r.es_ph && (
                      <span style={{ fontSize: '10px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '1px 6px', borderRadius: '4px' }}>
                        PH
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#f97316', fontWeight: 700, backgroundColor: '#f9731615', padding: '1px 6px', borderRadius: '4px' }}>
                      {formatAlicuotaPct(r.alicuota)}
                    </span>
                    {(() => {
                      const s = saldosPorApto.get(r.id)?.saldo_a_favor_usd || 0
                      if (s <= 0) return null
                      return (
                        <span style={{
                          fontSize: '11px',
                          color: '#34d399',
                          fontWeight: 800,
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          padding: '1px 6px',
                          borderRadius: '4px'
                        }}>
                          💚 +${s.toFixed(2)}
                        </span>
                      )
                    })()}
                  </div>
                  
                  <p style={{ color: r.tiene_usuario ? '#ccc' : '#666', fontSize: '12px', marginTop: '4px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.propietario.nombre}
                  </p>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: r.estado_ocupacion === 'alquilado' ? '#3b82f620' : r.tiene_usuario ? '#10b98120' : '#222',
                      color: r.estado_ocupacion === 'alquilado' ? '#60a5fa' : r.tiene_usuario ? '#34d399' : '#888',
                    }}>
                      {r.estado_ocupacion === 'alquilado' ? '🔑 Inquilino' : r.tiene_usuario ? '🏡 Registrado' : '⚪ Sin cuenta'}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <p style={{ color: '#777', fontSize: '11px', margin: 0 }}>
                    {r.historial_pagos.length} pago{r.historial_pagos.length !== 1 ? 's' : ''}
                  </p>
                  {isMobile && (
                    <span style={{ color: '#f97316', fontSize: '14px', fontWeight: 800 }}>
                      →
                    </span>
                  )}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', height: '100%', color: '#666', flexDirection: 'column', gap: '10px', textAlign: 'center' }}>
          <span style={{ fontSize: '36px' }}>👥</span>
          <p style={{ margin: 0, fontSize: '14px' }}>Selecciona un apartamento para ver o editar sus datos</p>
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
                  background: '#f97316',
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
          <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #f9731640', marginBottom: '20px' }}>
            <h3 style={{ color: '#f97316', fontSize: '13.5px', fontWeight: 700, margin: '0 0 8px' }}>
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
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#f97316', fontWeight: 800 }}>%</span>
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
              <label style={labelStyle}>Meses de Deuda (Control interno)</label>
              <input type="number" style={inputStyle} value={form.meses_deuda} onChange={e => setForm({ ...form, meses_deuda: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          <div style={{ backgroundColor: '#0a0a0a', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '18px' }}>
            <h3 style={{ color: '#f97316', fontSize: '13.5px', marginBottom: '10px', marginTop: 0 }}>👤 Datos del Propietario</h3>
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

          <div>
            <label style={labelStyle}>Notas Internas (Solo Admin)</label>
            <textarea rows={3} style={{ ...inputStyle, resize: 'none' }} value={form.notas_internas} onChange={e => setForm({ ...form, notas_internas: e.target.value })} placeholder="Escribe detalles importantes sobre este inmueble..." />
          </div>
        </form>
      )
    }

    // Modo Detalle normal
    const cleanPhone = selected.propietario.telefono?.replace(/[^\d+]/g, '') || ''
    const waPhone = cleanPhone.replace(/\D/g, '').startsWith('0')
      ? '58' + cleanPhone.replace(/\D/g, '').substring(1)
      : cleanPhone.replace(/\D/g, '')

    return (
      <div>
        {/* Header del seleccionado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ color: '#fff', fontSize: isMobile ? '24px' : '28px', fontWeight: 800, margin: 0 }}>
                Apto {selected.apartamento}
              </h2>
              {selected.es_ph && (
                <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: '#8b5cf625', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '2px 8px', borderRadius: '6px' }}>
                  PENTHOUSE (PH)
                </span>
              )}
              {selected.piso && (
                <span style={{ color: '#888', fontSize: '12px', fontWeight: 600 }}>
                  Piso {selected.piso}
                </span>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
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
              <span style={{
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: selected.tiene_usuario ? '#10b98115' : '#33333330',
                color: selected.tiene_usuario ? '#10b981' : '#888',
                border: '1px solid #2a2a2a'
              }}>
                {selected.tiene_usuario ? 'Cuenta de Usuario Activa' : 'Sin Usuario Web'}
              </span>
            </div>
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setForm({ ...selected }); setEditMode(true) }}
                style={{
                  backgroundColor: '#f97316',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                ✏️ Editar Alícuota y Datos
              </button>

              {selected.tiene_usuario && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  🗑️ Borrar Usuario
                </button>
              )}
            </div>
          )}
        </div>

        {/* CARD DESTACADO: SALDO A FAVOR / BILLETERA COMUNITARIA */}
        {(() => {
          const saldoInfo = saldosPorApto.get(selected.id)
          const saldoUsd = saldoInfo?.saldo_a_favor_usd || 0
          const saldoBs = saldoInfo?.saldo_a_favor_bs || (saldoUsd * tasaBcvValida)

          return (
            <div style={{
              backgroundColor: saldoUsd > 0 ? 'rgba(16, 185, 129, 0.08)' : '#0a0a0a',
              border: saldoUsd > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #2a2a2a',
              borderRadius: '12px',
              padding: '18px 20px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: '12px',
              boxShadow: saldoUsd > 0 ? '0 4px 18px rgba(16, 185, 129, 0.12)' : 'none',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>💚</span>
                  <span style={{ color: saldoUsd > 0 ? '#4ade80' : '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>
                    Saldo a Favor / Cuenta Corriente
                  </span>
                </div>

                <div style={{ color: saldoUsd > 0 ? '#4ade80' : '#fff', fontSize: isMobile ? '24px' : '26px', fontWeight: 900, marginTop: '4px' }}>
                  {saldoUsd > 0 ? `+$${saldoUsd.toFixed(2)} USD` : '$0.00 USD'}
                </div>

                <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
                  {saldoUsd > 0
                    ? `≈ Bs. ${saldoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Crédito disponible para próximos recibos`
                    : 'El apartamento no tiene saldo a favor acumulado actualmente.'}
                </p>
              </div>

              {/* Botones de Gestión de Saldo */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
                <button
                  type="button"
                  onClick={() => setAbonarModalOpen(true)}
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    flex: isMobile ? 1 : 'none',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 10px rgba(34, 197, 94, 0.2)',
                    transition: 'all 0.2s',
                  }}
                  title="Abonar saldo positivo a la cuenta del apartamento con motivo obligatorio de auditoría"
                >
                  <span>➕</span> Abonar Saldo a Favor
                </button>

                {saldoUsd > 0 && (deudasPorApto.get(selected.id)?.totalUsd || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompensarModalOpen(true)}
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      padding: '9px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      flex: isMobile ? 1 : 'none',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                    title="Aplicar parte o todo el saldo a favor para restar de la deuda pendiente"
                  >
                    <span>⚡</span> Compensar Deuda
                  </button>
                )}

                {saldoUsd > 0 && (
                  <button
                    type="button"
                    onClick={() => setSaldoModalOpen(true)}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      padding: '9px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      width: isMobile ? '100%' : 'auto',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                    title="Retirar o anular este saldo a favor con justificación inmutable en Auditoría"
                  >
                    <span>🗑️</span> Quitar Saldo
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* CARD DESTACADO: ALÍCUOTA DEL INMUEBLE */}
        <div style={{
          backgroundColor: '#0a0a0a',
          border: '1px solid #2a2a2a',
          borderRadius: '12px',
          padding: '18px 20px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: '12px'
        }}>
          <div>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              Alícuota de Condominio
            </span>
            <div style={{ color: '#f97316', fontSize: isMobile ? '26px' : '28px', fontWeight: 900, marginTop: '2px' }}>
              {formatAlicuotaPct(selected.alicuota)}
            </div>
            <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
              {selected.es_ph
                ? '⭐ Tarifa especial Penthouse: cuota superior por metraje total'
                : 'Cuota de prorrateo para gastos mensuales del edificio'}
            </p>
          </div>
          <button
            onClick={() => { setForm({ ...selected }); setEditMode(true) }}
            style={{
              backgroundColor: '#1e1e1e',
              color: '#f97316',
              border: '1px solid #f9731640',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              width: isMobile ? '100%' : 'auto',
              textAlign: 'center'
            }}
          >
            Modificar %
          </button>
        </div>

        {/* Status Banner Financiero */}
        <div style={{
          backgroundColor: `${getDeudaColor(selected.meses_deuda)}15`,
          border: `1px solid ${getDeudaColor(selected.meses_deuda)}30`,
          padding: '14px 16px',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{ fontSize: '24px' }}>{selected.meses_deuda === 0 ? '✅' : '⚠️'}</div>
          <div>
            <h3 style={{ color: getDeudaColor(selected.meses_deuda), margin: 0, fontSize: '14px', fontWeight: 700 }}>
              {selected.meses_deuda === 0 ? 'Solvente' : `En mora (${selected.meses_deuda} mes${selected.meses_deuda > 1 ? 'es' : ''})`}
            </h3>
            <p style={{ color: '#aaa', fontSize: '12px', margin: '2px 0 0' }}>
              {selected.meses_deuda === 0 ? 'El apartamento se encuentra solvente con sus cuotas.' : 'Presenta compromisos pendientes de pago.'}
            </p>
          </div>
        </div>

        {/* Info Grid Propietario / Inquilino */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
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
                    href={`https://wa.me/${waPhone}`}
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

          {selected.estado_ocupacion === 'alquilado' && selected.inquilino && (
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
          )}
        </div>

        {/* Botón borrar usuario en vista móvil */}
        {isMobile && selected.tiene_usuario && (
          <div style={{ marginBottom: '18px' }}>
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                padding: '11px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              🗑️ Borrar Usuario Registrado
            </button>
          </div>
        )}

        {/* Historial de Pagos del Residente */}
        <div>
          <h3 style={{ color: '#fff', fontSize: '15px', marginBottom: '14px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
            💳 Historial de Pagos ({selected.historial_pagos.length})
          </h3>
          {selected.historial_pagos.length === 0 ? (
            <div style={{ backgroundColor: '#0a0a0a', padding: '20px', borderRadius: '12px', border: '1px solid #2a2a2a', color: '#666', fontSize: '13px', textAlign: 'center' }}>
              No hay pagos registrados para este apartamento todavía.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selected.historial_pagos.map((p) => (
                <div key={p.id} style={{
                  backgroundColor: '#0a0a0a',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #2a2a2a',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: isMobile ? 'wrap' : 'nowrap',
                  gap: '8px'
                }}>
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
                      <p style={{ color: '#777', fontSize: '11px', margin: '2px 0 0' }}>Ref: {p.referencia} · {new Date(p.fecha).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        Gestionar →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
              🏠 Gestión de Residentes
            </h1>
            <p style={{ color: '#888', fontSize: '12.5px', marginTop: '4px', lineHeight: 1.4 }}>
              {residentes.length} apartamentos · Alícuotas de cobro y residentes registrados
            </p>
          </div>
          <button
            onClick={cargarResidentes}
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
                  color: '#f97316',
                  border: '1px solid rgba(249, 115, 22, 0.4)',
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
                    backgroundColor: '#f97316',
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
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
          {/* Columna Izquierda: Lista de Apartamentos */}
          {renderLista()}

          {/* Columna Derecha: Panel de Detalles o Formulario */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #1e1e1e',
            borderRadius: '16px',
            padding: '28px',
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
    </div>
  )
}
