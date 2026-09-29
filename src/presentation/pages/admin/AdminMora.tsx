import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
import { useBcvRate } from '../../../data/useBcvRate'
import { useAuth } from '../../../application/contexts/AuthContext'
import { registrarEventoAuditoria } from '../../../data/auditoriaService'
import {
  DeudaMoraItem,
  TasaRiesgoMora,
  AccionLegalMora,
  MonedaMora,
  TASA_RIESGO_CONFIG,
  ACCION_LEGAL_CONFIG,
  calcularTasaRiesgoPorMeses,
  obtenerDeudasMora,
  guardarDeudaMora,
  eliminarDeudaMora
} from '../../../data/moraService'

export const AdminMora: React.FC = () => {
  const { perfil } = useAuth()
  const { rate } = useBcvRate()
  const [deudas, setDeudas] = useState<DeudaMoraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [apartamentos, setApartamentos] = useState<Array<{ id: string; numero: string; piso: number; propietario_nombre?: string; telefono_contacto?: string }>>([])
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [deudaEditar, setDeudaEditar] = useState<DeudaMoraItem | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [citacionModal, setCitacionModal] = useState<DeudaMoraItem | null>(null)

  // Form states
  const [formAptoId, setFormAptoId] = useState('')
  const [formAptoNumero, setFormAptoNumero] = useState('')
  const [formPiso, setFormPiso] = useState<number | undefined>(undefined)
  const [formPropNombre, setFormPropNombre] = useState('')
  const [formPropTel, setFormPropTel] = useState('')
  const [formMeses, setFormMeses] = useState<number>(3)
  const [formMontoUsd, setFormMontoUsd] = useState<number | ''>('')
  const [formMontoBs, setFormMontoBs] = useState<number | ''>('')
  const [formMoneda, setFormMoneda] = useState<MonedaMora>('USD')
  const [formRiesgo, setFormRiesgo] = useState<TasaRiesgoMora>('amarillo')
  const [formRiesgoManual, setFormRiesgoManual] = useState(false)
  const [formAccion, setFormAccion] = useState<AccionLegalMora>('notificacion_amistosa')
  const [formEstado, setFormEstado] = useState<'activo' | 'en_convenio' | 'solventado'>('activo')
  const [formConceptos, setFormConceptos] = useState('')
  const [formObservaciones, setFormObservaciones] = useState('')
  const [formFechaCorte, setFormFechaCorte] = useState(new Date().toISOString().slice(0, 10))

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [moraRes, aptosRes] = await Promise.all([
        obtenerDeudasMora(),
        supabase.from('apartamentos').select('id, numero, piso, propietario_nombre, telefono_contacto').order('numero', { ascending: true })
      ])
      setDeudas(moraRes.data || [])
      if (aptosRes.data) setApartamentos(aptosRes.data)
    } catch (err) {
      console.warn('[AdminMora] Error cargando datos de mora:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // Ajuste automático de tasa de riesgo al cambiar meses si no está en modo manual
  const handleMesesChange = (val: number) => {
    const meses = Math.max(1, val)
    setFormMeses(meses)
    if (!formRiesgoManual) {
      setFormRiesgo(calcularTasaRiesgoPorMeses(meses))
    }
  }

  const abrirModalNuevo = () => {
    setDeudaEditar(null)
    setFormAptoId('')
    setFormAptoNumero('')
    setFormPiso(undefined)
    setFormPropNombre('')
    setFormPropTel('')
    setFormMeses(3)
    setFormMontoUsd('')
    setFormMontoBs('')
    setFormMoneda('USD')
    setFormRiesgo('amarillo')
    setFormRiesgoManual(false)
    setFormAccion('notificacion_amistosa')
    setFormEstado('activo')
    setFormConceptos('')
    setFormObservaciones('')
    setFormFechaCorte(new Date().toISOString().slice(0, 10))
    setModalAbierto(true)
  }

  const abrirModalEditar = (item: DeudaMoraItem) => {
    setDeudaEditar(item)
    setFormAptoId(item.apartamento_id)
    setFormAptoNumero(item.apartamento_numero)
    setFormPiso(item.piso)
    setFormPropNombre(item.propietario_nombre || '')
    setFormPropTel(item.propietario_telefono || '')
    setFormMeses(item.meses_deuda)
    setFormMontoUsd(item.monto_usd || '')
    setFormMontoBs(item.monto_bs || '')
    setFormMoneda(item.moneda_principal || 'USD')
    setFormRiesgo(item.tasa_riesgo)
    setFormRiesgoManual(true)
    setFormAccion(item.accion_legal)
    setFormEstado(item.estado)
    setFormConceptos(item.conceptos_detalle || '')
    setFormObservaciones(item.observaciones || '')
    setFormFechaCorte(item.fecha_corte || new Date().toISOString().slice(0, 10))
    setModalAbierto(true)
  }

  const handleSeleccionarApto = (aptoId: string) => {
    setFormAptoId(aptoId)
    const sel = apartamentos.find(a => a.id === aptoId)
    if (sel) {
      setFormAptoNumero(sel.numero)
      setFormPiso(sel.piso)
      if (sel.propietario_nombre) setFormPropNombre(sel.propietario_nombre)
      if (sel.telefono_contacto) setFormPropTel(sel.telefono_contacto)
    }
  }

  const handleCalcularBs = () => {
    const usd = Number(formMontoUsd) || 0
    if (usd > 0 && rate > 0) {
      setFormMontoBs(Number((usd * rate).toFixed(2)))
      showToast(`Bs. calculado con tasa BCV (${rate.toFixed(2)})`)
    }
  }

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formAptoNumero) {
      showToast('⚠️ Selecciona o especifica el número de apartamento')
      return
    }

    const payload: Partial<DeudaMoraItem> = {
      id: deudaEditar?.id,
      apartamento_id: formAptoId || `apto-${formAptoNumero}`,
      apartamento_numero: formAptoNumero,
      piso: formPiso,
      propietario_nombre: formPropNombre.trim(),
      propietario_telefono: formPropTel.trim(),
      meses_deuda: Number(formMeses) || 3,
      monto_usd: Number(formMontoUsd) || 0,
      monto_bs: Number(formMontoBs) || 0,
      moneda_principal: formMoneda,
      tasa_riesgo: formRiesgo,
      accion_legal: formAccion,
      estado: formEstado,
      conceptos_detalle: formConceptos.trim(),
      observaciones: formObservaciones.trim(),
      fecha_corte: formFechaCorte
    }

    const res = await guardarDeudaMora(payload)
    if (res.error) {
      showToast(`❌ ${res.error}`)
    } else {
      if (deudaEditar) {
        await registrarEventoAuditoria({
          tipo_accion: 'EDICION_DEUDA',
          titulo: `Edición de Deuda en Mora - Apto ${payload.apartamento_numero}`,
          descripcion: `Se actualizó la deuda del apartamento ${payload.apartamento_numero}. Monto: $ ${payload.monto_usd} USD (Bs. ${payload.monto_bs}) · Meses: ${payload.meses_deuda} · Riesgo: ${payload.tasa_riesgo}.`,
          apartamento_numero: payload.apartamento_numero,
          apartamento_id: payload.apartamento_id,
          monto_usd: payload.monto_usd,
          monto_bs: payload.monto_bs,
          motivo: payload.observaciones || 'Actualización de registro de mora por el administrador',
          autor_nombre: perfil?.nombre_completo || 'Administrador',
          autor_email: (perfil as any)?.email || null,
          datos_anteriores: deudaEditar,
          datos_nuevos: payload
        })
      }
      showToast(deudaEditar ? '✅ Registro de mora actualizado y auditado' : '✅ Deuda anterior montada exitosamente')
      setModalAbierto(false)
      cargarDatos()
    }
  }

  const handleEliminar = async (id: string, apto: string) => {
    const itemBorrado = deudas.find(d => d.id === id)
    const motivo = window.prompt(
      `Ingresa el motivo por el cual eliminas o condonas la deuda del Apto ${apto} (obligatorio para el Historial de Auditoría):`,
      'Deuda regularizada, cancelada o condonada por acuerdo'
    )
    if (!motivo || !motivo.trim()) return

    await registrarEventoAuditoria({
      tipo_accion: 'CONDONACION_DEUDA',
      titulo: `Eliminación / Condonación de Deuda en Mora - Apto ${apto}`,
      descripcion: `Se eliminó el registro de mora del apartamento ${apto}. Deuda retirada: $ ${itemBorrado?.monto_usd || 0} USD (Bs. ${itemBorrado?.monto_bs || 0}).`,
      apartamento_numero: apto,
      apartamento_id: itemBorrado?.apartamento_id,
      monto_usd: itemBorrado?.monto_usd,
      monto_bs: itemBorrado?.monto_bs,
      motivo: motivo.trim(),
      autor_nombre: perfil?.nombre_completo || 'Administrador',
      autor_email: (perfil as any)?.email || null,
      datos_anteriores: itemBorrado
    })

    await eliminarDeudaMora(id)
    showToast('🗑️ Registro de mora eliminado y archivado en Auditoría')
    cargarDatos()
  }

  // Filtrado y estadísticas
  const deudasFiltradas = useMemo(() => {
    return deudas.filter(d => {
      if (filtroRiesgo !== 'todos' && d.tasa_riesgo !== filtroRiesgo) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchApto = (d.apartamento_numero || '').toLowerCase().includes(q)
        const matchProp = (d.propietario_nombre || '').toLowerCase().includes(q)
        const matchConceptos = (d.conceptos_detalle || '').toLowerCase().includes(q)
        if (!matchApto && !matchProp && !matchConceptos) return false
      }
      return true
    })
  }, [deudas, filtroRiesgo, busqueda])

  const stats = useMemo(() => {
    let totalUsd = 0
    let totalBs = 0
    let amarilloCount = 0
    let amarilloUsd = 0
    let rojoCount = 0
    let rojoUsd = 0
    let moradoCount = 0
    let moradoUsd = 0

    deudas.forEach(d => {
      totalUsd += d.monto_usd || 0
      totalBs += d.monto_bs || 0
      if (d.tasa_riesgo === 'amarillo') {
        amarilloCount++
        amarilloUsd += d.monto_usd || 0
      } else if (d.tasa_riesgo === 'rojo') {
        rojoCount++
        rojoUsd += d.monto_usd || 0
      } else if (d.tasa_riesgo === 'morado') {
        moradoCount++
        moradoUsd += d.monto_usd || 0
      }
    })

    return {
      totalDeudores: deudas.length,
      totalUsd,
      totalBs,
      amarilloCount,
      amarilloUsd,
      rojoCount,
      rojoUsd,
      moradoCount,
      moradoUsd
    }
  }, [deudas])

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: 'rgba(21, 25, 34, 0.95)', border: '1px solid #f97316',
          boxShadow: '0 8px 30px rgba(0,0,0,0.7)', color: '#fff',
          padding: '12px 20px', borderRadius: '14px', fontSize: '14px', fontWeight: 600,
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {toastMsg}
        </div>
      )}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '30px' }}>⚖️</span>
            <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              Control de Mora y Deudores Crónicos (&gt;3 Meses)
            </h1>
          </div>
          <p style={{ color: '#888', fontSize: '14px', margin: '6px 0 0', maxWidth: '750px' }}>
            Módulo para cargar y gestionar deudas históricas por apartamento, categorizar tasas de riesgo jurídico (Amarillo, Rojo, Morado) y activar acciones legales. <strong>Sincronizado con la Lista de Mora comunitaria</strong>.
          </p>
        </div>

        <button
          onClick={abrirModalNuevo}
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 55%, #7e22ce 100%)',
            color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '14px', padding: '12px 24px', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.35)', transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span>➕</span>
          <span>Montar Deuda Anterior de Apartamento</span>
        </button>
      </div>

      {/* STAT CARDS — TASAS DE RIESGO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Cartera Total en Mora */}
        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderTop: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '20px', padding: '22px', boxShadow: '0 10px 25px rgba(0,0,0,0.45)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>💼</span>
            <span style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>
              {stats.totalDeudores} Apartamentos
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800 }}>
            ${stats.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', color: '#f97316', fontWeight: 600, marginTop: '2px' }}>
            {stats.totalBs > 0 && `+ Bs. ${stats.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: '12px', color: '#777', marginTop: '6px' }}>Cartera morosa total acumulada</div>
        </div>

        {/* Riesgo Moderado (Amarillo - 3 meses) */}
        <div style={{
          background: 'linear-gradient(180deg, #1f1b0a 0%, #121005 100%)',
          border: `1px solid ${TASA_RIESGO_CONFIG.amarillo.border}`,
          borderRadius: '20px', padding: '22px', boxShadow: '0 10px 25px rgba(234, 179, 8, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🟡</span>
            <span style={{
              fontSize: '11px', color: '#eab308', fontWeight: 800,
              backgroundColor: 'rgba(234, 179, 8, 0.15)', padding: '2px 8px', borderRadius: '999px'
            }}>
              3 Meses
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#eab308' }}>
            {stats.amarilloCount} <span style={{ fontSize: '15px', color: '#aaa', fontWeight: 500 }}>aptos</span>
          </div>
          <div style={{ fontSize: '13px', color: '#fff', fontWeight: 700, marginTop: '2px' }}>
            ${stats.amarilloUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Riesgo Moderado (Gestión preventiva)</div>
        </div>

        {/* Riesgo Alto (Rojo - 4 a 6 meses) */}
        <div style={{
          background: 'linear-gradient(180deg, #220e10 0%, #140809 100%)',
          border: `1px solid ${TASA_RIESGO_CONFIG.rojo.border}`,
          borderRadius: '20px', padding: '22px', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.12)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🔴</span>
            <span style={{
              fontSize: '11px', color: '#ef4444', fontWeight: 800,
              backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: '999px'
            }}>
              4 a 6 Meses
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#ef4444' }}>
            {stats.rojoCount} <span style={{ fontSize: '15px', color: '#aaa', fontWeight: 500 }}>aptos</span>
          </div>
          <div style={{ fontSize: '13px', color: '#fff', fontWeight: 700, marginTop: '2px' }}>
            ${stats.rojoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Riesgo Alto (Intimación extrajudicial)</div>
        </div>

        {/* Riesgo Severo / Máximo Deudor (Morado - >6 meses) */}
        <div style={{
          background: 'linear-gradient(180deg, #1c0f26 0%, #100816 100%)',
          border: `1px solid ${TASA_RIESGO_CONFIG.morado.border}`,
          borderRadius: '20px', padding: '22px', boxShadow: '0 10px 25px rgba(168, 85, 247, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🟣</span>
            <span style={{
              fontSize: '11px', color: '#a855f7', fontWeight: 800,
              backgroundColor: 'rgba(168, 85, 247, 0.18)', padding: '2px 8px', borderRadius: '999px'
            }}>
              &gt;6 Meses · Crónico
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#a855f7' }}>
            {stats.moradoCount} <span style={{ fontSize: '15px', color: '#aaa', fontWeight: 500 }}>aptos</span>
          </div>
          <div style={{ fontSize: '13px', color: '#fff', fontWeight: 700, marginTop: '2px' }}>
            ${stats.moradoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>El Más Deudor (Vía Judicial LPH)</div>
        </div>
      </div>

      {/* FILTROS & SEARCH */}
      <div style={{
        background: 'rgba(21, 25, 34, 0.65)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px',
        padding: '16px 20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '14px'
      }}>
        {/* Chips de Tasa de Riesgo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: '#888', fontWeight: 700, marginRight: '4px' }}>FILTRAR POR RIESGO:</span>
          {[
            { key: 'todos', label: 'Todos los deudores', icon: '📋', count: deudas.length },
            { key: 'amarillo', label: '🟡 Riesgo Moderado (3m)', icon: '', count: stats.amarilloCount },
            { key: 'rojo', label: '🔴 Riesgo Alto (4-6m)', icon: '', count: stats.rojoCount },
            { key: 'morado', label: '🟣 El Más Deudor (>6m)', icon: '', count: stats.moradoCount },
          ].map(chip => {
            const active = filtroRiesgo === chip.key
            return (
              <button
                key={chip.key}
                onClick={() => setFiltroRiesgo(chip.key)}
                style={{
                  background: active ? '#a855f7' : 'rgba(255, 255, 255, 0.05)',
                  border: active ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.09)',
                  color: active ? '#fff' : '#ccc',
                  fontWeight: active ? 800 : 500,
                  fontSize: '12px', padding: '7px 14px', borderRadius: '10px',
                  cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.18s'
                }}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
                <span style={{
                  background: active ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.1)',
                  fontSize: '10px', padding: '1px 6px', borderRadius: '999px', fontWeight: 800
                }}>
                  {chip.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#777' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar deudor por número de apartamento (ej: 504, 5PH2), propietario o concepto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff', padding: '11px 14px 11px 36px', borderRadius: '12px', fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* DEUDORES LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Cargando cartera de deudores...
        </div>
      ) : deudasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.12)', color: '#888'
        }}>
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>🎉</div>
          <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '16px' }}>No hay deudores registrados con este filtro</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>Puedes registrar una nueva deuda anterior con el botón superior.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {deudasFiltradas.map(d => {
            const riesgoMeta = TASA_RIESGO_CONFIG[d.tasa_riesgo]
            const accionMeta = ACCION_LEGAL_CONFIG[d.accion_legal]

            return (
              <div
                key={d.id}
                style={{
                  background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                  border: `1px solid ${riesgoMeta.border}`,
                  borderLeft: `5px solid ${riesgoMeta.color}`,
                  borderRadius: '18px', padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', gap: '16px',
                  boxShadow: `0 8px 28px rgba(0,0,0,0.4), 0 0 16px ${riesgoMeta.color}10`,
                  position: 'relative', overflow: 'hidden'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '14px',
                      background: riesgoMeta.bg, border: `1px solid ${riesgoMeta.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '22px', flexShrink: 0
                    }}>
                      🏢
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                          Apto {d.apartamento_numero}
                        </span>

                        {d.piso && (
                          <span style={{ fontSize: '12px', color: '#888' }}>
                            (Piso {d.piso})
                          </span>
                        )}

                        <span style={{
                          fontSize: '11px', fontWeight: 800, color: riesgoMeta.color,
                          background: riesgoMeta.bg, border: `1px solid ${riesgoMeta.border}`,
                          padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.4px'
                        }}>
                          {riesgoMeta.badgeText}
                        </span>

                        {d.estado === 'en_convenio' && (
                          <span style={{
                            fontSize: '11px', fontWeight: 700, color: '#3b82f6',
                            background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                            padding: '3px 10px', borderRadius: '999px'
                          }}>
                            🤝 Convenio Activo
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px' }}>
                        Propietario: <strong style={{ color: '#fff' }}>{d.propietario_nombre || 'N/D'}</strong>
                        {d.propietario_telefono && <span style={{ marginLeft: '8px', color: '#777' }}>📞 {d.propietario_telefono}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Amounts & Months */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '6px' }}>
                      <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>
                        ${d.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span style={{ fontSize: '12px', color: '#f97316', fontWeight: 800 }}>USD</span>
                    </div>

                    {d.monto_bs > 0 && (
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#eab308', marginTop: '2px' }}>
                        Bs. {d.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}

                    <div style={{
                      display: 'inline-block', marginTop: '6px', fontSize: '11px', fontWeight: 800,
                      color: riesgoMeta.color, background: 'rgba(0,0,0,0.4)', padding: '2px 8px', borderRadius: '6px'
                    }}>
                      ⏳ {d.meses_deuda} meses de atraso
                    </div>
                  </div>
                </div>

                {/* Conceptos Detalle */}
                {d.conceptos_detalle && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: '#ccc'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Desglose de la deuda:
                    </div>
                    {d.conceptos_detalle}
                  </div>
                )}

                {/* Acción Legal Box */}
                <div style={{
                  background: 'rgba(168, 85, 247, 0.07)', border: '1px solid rgba(168, 85, 247, 0.22)',
                  borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{accionMeta.icono}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#e9d5ff' }}>
                        {accionMeta.titulo}
                      </div>
                      <div style={{ fontSize: '11px', color: '#a855f7' }}>
                        {accionMeta.descripcion}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setCitacionModal(d)}
                    style={{
                      background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)',
                      color: '#d8b4fe', padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                      fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <span>📜</span>
                    <span>Ver Carta / Citación</span>
                  </button>
                </div>

                {/* Footer Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Fecha de corte: <strong style={{ color: '#aaa' }}>{d.fecha_corte}</strong>
                    {d.observaciones && <span style={{ marginLeft: '12px' }}>📝 {d.observaciones}</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => abrirModalEditar(d)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#ccc', padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      ✏️ Editar Deuda
                    </button>

                    <button
                      onClick={() => handleEliminar(d.id, d.apartamento_numero)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#ef4444', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                        cursor: 'pointer'
                      }}
                      title="Eliminar de la lista de mora"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL MONTAR / EDITAR DEUDA */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #181d28 0%, #0f131a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.12)', borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '24px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
            padding: '28px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)', boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                  {deudaEditar ? `Editar Deuda - Apto ${deudaEditar.apartamento_numero}` : 'Montar Deuda Anterior de Apartamento'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
                  Define los meses impagos, monto en USD y Bolívares, y acción legal correspondiente.
                </p>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Apartamento Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Apartamento *
                </label>
                <select
                  required
                  value={formAptoId}
                  onChange={e => handleSeleccionarApto(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '11px 14px', borderRadius: '12px', fontSize: '14px', outline: 'none'
                  }}
                >
                  <option value="">Selecciona el apartamento en mora...</option>
                  {apartamentos.map(a => (
                    <option key={a.id} value={a.id}>
                      Apto {a.numero} (Piso {a.piso}) {a.propietario_nombre ? `— ${a.propietario_nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Meses de Mora & Propietario */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                    Meses de Deuda Acumulados *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={formMeses}
                    onChange={e => handleMesesChange(parseInt(e.target.value) || 1)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '11px 14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#888', marginTop: '2px', display: 'block' }}>
                    Mora extensa es a partir de 3 meses.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                    Nombre del Propietario / Responsable
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={formPropNombre}
                    onChange={e => setFormPropNombre(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                      padding: '11px 14px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Montos Diferenciados USD y Bs */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f97316' }}>
                    Diferenciación de Moneda (USD / Bs.)
                  </span>
                  {rate > 0 && (
                    <button
                      type="button"
                      onClick={handleCalcularBs}
                      style={{
                        background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.3)',
                        color: '#f97316', padding: '3px 8px', borderRadius: '8px', fontSize: '11px',
                        fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ⚡ Convertir a Bs (Tasa BCV: {rate.toFixed(2)})
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                      Deuda en Dólares ($ USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formMontoUsd}
                      onChange={e => setFormMontoUsd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                        border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                        padding: '10px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
                      Deuda en Bolívares (Bs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formMontoBs}
                      onChange={e => setFormMontoBs(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                        border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                        padding: '10px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Moneda Principal</label>
                  <select
                    value={formMoneda}
                    onChange={e => setFormMoneda(e.target.value as MonedaMora)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                      border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff',
                      padding: '8px 10px', borderRadius: '8px', fontSize: '12px', outline: 'none'
                    }}
                  >
                    <option value="USD">Solo Dólares ($ USD)</option>
                    <option value="BS">Solo Bolívares (Bs.)</option>
                    <option value="MIXTO">Mixta (Dólares + Bolívares)</option>
                  </select>
                </div>
              </div>

              {/* Tasa de Riesgo (Indicadores visuales) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Tasa de Riesgo Legal *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {(['amarillo', 'rojo', 'morado'] as TasaRiesgoMora[]).map(t => {
                    const cfg = TASA_RIESGO_CONFIG[t]
                    const active = formRiesgo === t
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => {
                          setFormRiesgo(t)
                          setFormRiesgoManual(true)
                        }}
                        style={{
                          background: active ? cfg.bg : 'rgba(255, 255, 255, 0.04)',
                          border: active ? `2px solid ${cfg.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                          color: active ? '#fff' : '#aaa',
                          padding: '10px 8px', borderRadius: '12px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          textAlign: 'center', transition: 'all 0.15s'
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{cfg.badgeText.split(' ')[0]}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800 }}>{cfg.label}</span>
                        <span style={{ fontSize: '10px', color: cfg.color }}>{cfg.sublabel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Posible Acción Legal */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Acción Legal / Fase Procesal
                </label>
                <select
                  value={formAccion}
                  onChange={e => setFormAccion(e.target.value as AccionLegalMora)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '11px 14px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                  }}
                >
                  {(Object.keys(ACCION_LEGAL_CONFIG) as AccionLegalMora[]).map(k => (
                    <option key={k} value={k}>
                      {ACCION_LEGAL_CONFIG[k].icono} {ACCION_LEGAL_CONFIG[k].titulo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conceptos Detalle */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Desglose de Conceptos Anteriores
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cuotas de mantenimiento Enero-Mayo 2026 + cuota extraordinaria de reparación ascensor..."
                  value={formConceptos}
                  onChange={e => setFormConceptos(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '10px 12px', borderRadius: '12px', fontSize: '13px', outline: 'none', resize: 'vertical'
                  }}
                />
              </div>

              {/* Observaciones Internas */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#aaa', marginBottom: '6px' }}>
                  Observaciones Internas de Administración
                </label>
                <input
                  type="text"
                  placeholder="Ej: Compromiso de comparecencia, carta enviada el 15/09..."
                  value={formObservaciones}
                  onChange={e => setFormObservaciones(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0a0d13',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    padding: '10px 12px', borderRadius: '12px', fontSize: '13px', outline: 'none'
                  }}
                />
              </div>

              {/* Botones */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.14)',
                    color: '#ccc', padding: '10px 20px', borderRadius: '12px', fontSize: '14px',
                    fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 60%, #7e22ce 100%)',
                    color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '12px',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)'
                  }}
                >
                  {deudaEditar ? 'Guardar Cambios' : 'Montar Deuda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VER CARTA / CITACIÓN FORMAL */}
      {citacionModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: '#ffffff', color: '#111',
            borderRadius: '20px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            padding: '36px', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)', boxSizing: 'border-box',
            fontFamily: "'Georgia', serif"
          }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #222', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, color: '#555' }}>
                JUNTA DE CONDOMINIO — EDIFICIO TORRE 5
              </div>
              <h2 style={{ margin: '8px 0 0', fontSize: '20px', fontWeight: 800, color: '#000' }}>
                COMUNICACIÓN FORMAL DE COBRANZA EXTRAJUDICIAL
              </h2>
            </div>

            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#222' }}>
              <p><strong>Fecha de Emisión:</strong> {new Date().toLocaleDateString('es-VE')}</p>
              <p><strong>Destinatario:</strong> Propietario / Ocupante del Apartamento <strong>{citacionModal.apartamento_numero}</strong></p>
              <p><strong>Nombre registrado:</strong> {citacionModal.propietario_nombre || 'Propietario Inmueble'}</p>

              <hr style={{ borderColor: '#eee', margin: '16px 0' }} />

              <p>
                Por medio de la presente se le notifica que su inmueble presenta un estado de <strong>morosidad prolongada de {citacionModal.meses_deuda} meses</strong> en el pago de las cuotas ordinarias y extraordinarias de condominio, con una deuda total liquidada a la fecha de:
              </p>

              <div style={{
                background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px',
                padding: '16px', textAlign: 'center', margin: '16px 0'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                  ${citacionModal.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </div>
                {citacionModal.monto_bs > 0 && (
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#ca8a04', marginTop: '4px' }}>
                    Bs. {citacionModal.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  Tasa de Riesgo: <strong>{TASA_RIESGO_CONFIG[citacionModal.tasa_riesgo].label.toUpperCase()}</strong>
                </div>
              </div>

              <p>
                <strong>Acción Ejecutada:</strong> {ACCION_LEGAL_CONFIG[citacionModal.accion_legal].titulo}.
              </p>
              <p style={{ fontSize: '12px', color: '#475569' }}>
                De conformidad con la Ley de Propiedad Horizontal (Art. 14), los recibos de condominio debidamente visados tienen fuerza ejecutiva. Le instamos a comparecer a la oficina de administración dentro de las próximas 72 horas para suscribir un convenio de amortización o liquidar la deuda.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
              <button
                onClick={() => window.print()}
                style={{
                  background: '#0f172a', color: '#fff', border: 'none',
                  padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                🖨️ Imprimir Comunicación
              </button>
              <button
                onClick={() => setCitacionModal(null)}
                style={{
                  background: '#e2e8f0', color: '#334155', border: 'none',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
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
