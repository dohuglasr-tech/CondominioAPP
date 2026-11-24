import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../../../application/contexts/AuthContext'
import { supabase } from '../../../data/supabase'
import {
  CategoriaComunicadoGlobal,
  generarHtmlNotificacionGlobal
} from '../../../data/emailService'
import {
  obtenerDestinatariosActivosGlobal,
  exportarFilasAExcel,
  obtenerDestinatariosUltimoReciboEnviado,
  parsearExcelCorreos,
  enviarNotificacionGlobalMasiva,
  obtenerHistorialNotificacionesGlobales,
  OrigenAudienciaGlobal,
  ResumenUltimoReciboEmails,
  DestinatarioGlobal,
  AptoSinCorreo,
  HistorialNotificacionGlobal,
  ProgresoEnvioGlobal
} from '../../../data/notificacionesGlobalesService'

const CATEGORIAS: Array<{ id: CategoriaComunicadoGlobal; label: string; icon: string; color: string }> = [
  { id: 'informativo', label: 'Informativo', icon: '📢', color: '#f97316' },
  { id: 'urgente', label: 'Urgente', icon: '🚨', color: '#ef4444' },
  { id: 'mantenimiento', label: 'Mantenimiento', icon: '🛠️', color: '#f59e0b' },
  { id: 'cobranza', label: 'Cobranza', icon: '💳', color: '#3b82f6' },
  { id: 'comunidad', label: 'Comunidad', icon: '🏢', color: '#10b981' },
]

const PLANTILLAS_RAPIDAS: Array<{
  titulo: string
  categoria: CategoriaComunicadoGlobal
  asunto: string
  cuerpo: string
}> = [
  {
    titulo: '💳 Recordatorio de Pago',
    categoria: 'cobranza',
    asunto: 'Recordatorio de Pago de Condominio y Servicios',
    cuerpo:
      'Estimados propietarios,\n\nLes recordamos que ya se encuentran disponibles en el portal **Domus** los recibos correspondientes al período en curso.\n\n- Revisa tu estado de cuenta actualizado desde el portal.\n- Reporta tu transferencia o pago móvil adjuntando tu comprobante.\n- Ante cualquier duda, contáctanos por los canales oficiales.\n\n---\nAgradecemos su puntualidad para garantizar el funcionamiento óptimo de nuestro edificio.'
  },
  {
    titulo: '🛠️ Mantenimiento',
    categoria: 'mantenimiento',
    asunto: 'Aviso de Mantenimiento Preventivo en Áreas Comunes',
    cuerpo:
      'Estimados vecinos,\n\nLes informamos que se estará realizando un **mantenimiento preventivo programado** en las instalaciones del edificio.\n\n1. Horario estimado: **8:00 AM a 2:00 PM**.\n2. Servicios involucrados: revisión de equipos e instalaciones.\n\nRecomendamos tomar las previsiones correspondientes. ¡Gracias por su comprensión!'
  },
  {
    titulo: '🏢 Convocatoria Asamblea',
    categoria: 'comunidad',
    asunto: 'Convocatoria a Reunión / Asamblea de Propietarios',
    cuerpo:
      'Estimados propietarios,\n\nSe convoca a toda la comunidad a participar en nuestra **Asamblea Ordinaria de Copropietarios** para tratar temas de interés común.\n\n- **Puntos a tratar:** Informe financiero, mantenimiento y próximos proyectos.\n- Tu asistencia y participación son fundamentales para el bienestar de todos.\n\n¡Contamos contigo!'
  },
  {
    titulo: '📢 Comunicado General',
    categoria: 'informativo',
    asunto: 'Comunicado Importante de la Junta de Condominio',
    cuerpo:
      'Estimada comunidad,\n\nCompartimos información relevante emitida por la **Junta de Condominio y Administración** respecto a la gestión del edificio.\n\nPor favor manténgase atento a las actualizaciones publicadas en nuestro portal oficial.'
  }
]

export const AdminNotificacionesGlobales: React.FC = () => {
  const { config, perfil } = useAuth()
  const edificioNombre = config?.nombre_edificio || 'Residencias Ocutuy 5'
  const remitenteNombre = perfil?.nombre_completo
    ? `${perfil.nombre_completo} · Administración`
    : 'Junta de Condominio y Administración'
  const remitenteEmail = (perfil as any)?.propietario_email || (perfil as any)?.email || config?.email_contacto || undefined

  const [tab, setTab] = useState<'redactar' | 'historial'>('redactar')
  const [loadingAudiencia, setLoadingAudiencia] = useState(true)
  const [destinatarios, setDestinatarios] = useState<DestinatarioGlobal[]>([])
  const [sinCorreo, setSinCorreo] = useState<AptoSinCorreo[]>([])
  const [totalAptosActivos, setTotalAptosActivos] = useState(0)
  const [incluirDesocupados, setIncluirDesocupados] = useState(false)

  // Audiencia y orígenes (BD / Último Recibo / Excel + Revisión)
  const [origenAudiencia, setOrigenAudiencia] = useState<OrigenAudienciaGlobal>('bd')
  const [destinatariosUltimoRecibo, setDestinatariosUltimoRecibo] = useState<ResumenUltimoReciboEmails | null>(null)
  const [loadingUltimoRecibo, setLoadingUltimoRecibo] = useState(false)
  const [destinatariosExcel, setDestinatariosExcel] = useState<DestinatarioGlobal[]>([])
  const [excelMeta, setExcelMeta] = useState<{
    nombreArchivo: string
    totalFilas: number
    descartados: number
    duplicados: number
  } | null>(null)
  const [destinatariosManualesExtra, setDestinatariosManualesExtra] = useState<DestinatarioGlobal[]>([])
  const [emailsExcluidos, setEmailsExcluidos] = useState<Set<string>>(() => new Set())
  const [nuevoEmailManual, setNuevoEmailManual] = useState('')
  const excelInputRef = useRef<HTMLInputElement>(null)
  const aptosEdificioRef = useRef<Array<{ id: string; numero: string; propietario_nombre?: string | null }>>([])

  // Editor
  const [categoria, setCategoria] = useState<CategoriaComunicadoGlobal>('informativo')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [incluirBotonPortal, setIncluirBotonPortal] = useState(true)
  const [notificarEnApp, setNotificarEnApp] = useState(true)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [verAudiencia, setVerAudiencia] = useState(true)
  const [busquedaEmail, setBusquedaEmail] = useState('')

  // Envío y progreso
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [verListaEnConfirm, setVerListaEnConfirm] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoEnvioGlobal | null>(null)
  const [ultimoResultado, setUltimoResultado] = useState<HistorialNotificacionGlobal | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Historial
  const [historial, setHistorial] = useState<HistorialNotificacionGlobal[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [previewHistorialItem, setPreviewHistorialItem] = useState<HistorialNotificacionGlobal | null>(null)
  const [verEmailsHistorial, setVerEmailsHistorial] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 4500)
  }

  const cargarAudiencia = useCallback(async () => {
    setLoadingAudiencia(true)
    try {
      const [res, aptosRes] = await Promise.all([
        obtenerDestinatariosActivosGlobal(incluirDesocupados),
        aptosEdificioRef.current.length === 0
          ? supabase.from('apartamentos').select('id, numero, propietario_nombre').order('numero')
          : Promise.resolve({ data: null })
      ])
      setDestinatarios(res.destinatarios)
      setSinCorreo(res.sinCorreo)
      setTotalAptosActivos(res.totalApartamentosActivos)
      if (aptosRes?.data && Array.isArray(aptosRes.data)) {
        aptosEdificioRef.current = aptosRes.data
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error cargando correos de residentes')
    } finally {
      setLoadingAudiencia(false)
    }
  }, [incluirDesocupados])

  const cargarUltimoReciboAudiencia = useCallback(async () => {
    setLoadingUltimoRecibo(true)
    try {
      const res = await obtenerDestinatariosUltimoReciboEnviado()
      setDestinatariosUltimoRecibo(res)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error obteniendo correos del último recibo enviado')
    } finally {
      setLoadingUltimoRecibo(false)
    }
  }, [])

  const cargarHistorial = useCallback(async () => {
    setLoadingHistorial(true)
    try {
      const list = await obtenerHistorialNotificacionesGlobales()
      setHistorial(list)
    } catch {
      setHistorial([])
    } finally {
      setLoadingHistorial(false)
    }
  }, [])

  useEffect(() => {
    cargarAudiencia()
  }, [cargarAudiencia])

  useEffect(() => {
    cargarUltimoReciboAudiencia()
  }, [cargarUltimoReciboAudiencia])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  const listaBaseAudiencia = useMemo(() => {
    const base =
      origenAudiencia === 'ultimo_recibo'
        ? (destinatariosUltimoRecibo?.destinatarios || [])
        : origenAudiencia === 'excel'
          ? destinatariosExcel
          : destinatarios

    const mapa = new Map<string, DestinatarioGlobal>()
    base.forEach(d => {
      const key = d.email.trim().toLowerCase()
      if (!mapa.has(key)) mapa.set(key, d)
    })
    destinatariosManualesExtra.forEach(d => {
      const key = d.email.trim().toLowerCase()
      if (!mapa.has(key)) mapa.set(key, d)
    })
    return Array.from(mapa.values())
  }, [origenAudiencia, destinatarios, destinatariosUltimoRecibo, destinatariosExcel, destinatariosManualesExtra])

  const destinatariosSeleccionados = useMemo(() => {
    return listaBaseAudiencia.filter(d => !emailsExcluidos.has(d.email.trim().toLowerCase()))
  }, [listaBaseAudiencia, emailsExcluidos])

  const destinatariosFiltrados = useMemo(() => {
    if (!busquedaEmail.trim()) return listaBaseAudiencia
    const q = busquedaEmail.toLowerCase().trim()
    return listaBaseAudiencia.filter(d =>
      d.email.toLowerCase().includes(q) ||
      d.nombre.toLowerCase().includes(q) ||
      d.apartamentos.some(a => a.toLowerCase().includes(q))
    )
  }, [listaBaseAudiencia, busquedaEmail])

  const handleSeleccionarOrigen = (nuevoOrigen: OrigenAudienciaGlobal) => {
    setOrigenAudiencia(nuevoOrigen)
    setEmailsExcluidos(new Set())
    setBusquedaEmail('')
    setVerAudiencia(true)
    if (nuevoOrigen === 'ultimo_recibo' && !destinatariosUltimoRecibo && !loadingUltimoRecibo) {
      cargarUltimoReciboAudiencia()
    }
  }

  const handleCargarExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMsg(null)
    try {
      const res = await parsearExcelCorreos(file, aptosEdificioRef.current)
      if (res.error) {
        setErrorMsg(res.error)
        return
      }
      if (res.destinatarios.length === 0) {
        setErrorMsg(`El archivo "${file.name}" no contiene correos electrónicos válidos. Asegúrate de incluir una columna de "Correo" o "Email".`)
        return
      }
      setDestinatariosExcel(res.destinatarios)
      setExcelMeta({
        nombreArchivo: file.name,
        totalFilas: res.totalFilas,
        descartados: res.descartados,
        duplicados: res.duplicados
      })
      setOrigenAudiencia('excel')
      setEmailsExcluidos(new Set())
      setVerAudiencia(true)
      showToast(`✅ Excel cargado: ${res.destinatarios.length} correo(s) único(s) listo(s) para revisar`)
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo procesar el archivo Excel')
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  const handleDescargarPlantillaExcel = async () => {
    const fuente =
      destinatariosUltimoRecibo?.destinatarios.length
        ? destinatariosUltimoRecibo.destinatarios
        : destinatarios

    const rows = fuente.length > 0
      ? fuente.map(d => ({
          Apartamento: d.apartamentos.join(', '),
          Propietario: d.nombre,
          'Correo Electrónico': d.email
        }))
      : [
          { Apartamento: '5101', Propietario: 'Ejemplo Propietario', 'Correo Electrónico': 'propietario@ejemplo.com' }
        ]

    await exportarFilasAExcel({
      rows,
      sheetName: 'Correos Comunicado',
      fileName: 'Plantilla_Correos_Comunicado_Domus.xlsx',
      columnWidths: [16, 30, 38]
    })
  }

  const handleAgregarEmailManual = () => {
    const clean = nuevoEmailManual.trim().toLowerCase()
    if (!clean) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      showToast('⚠️ Ingresa un correo electrónico válido')
      return
    }
    const yaExiste = listaBaseAudiencia.some(d => d.email.toLowerCase() === clean)
    if (yaExiste) {
      setEmailsExcluidos(prev => {
        const next = new Set(prev)
        next.delete(clean)
        return next
      })
      setNuevoEmailManual('')
      showToast(`ℹ️ ${clean} ya estaba en la lista y quedó marcado`)
      return
    }
    setDestinatariosManualesExtra(prev => [
      ...prev,
      {
        email: clean,
        nombre: 'Agregado manualmente',
        apartamentos: ['Manual'],
        apartamentoIds: [`manual_${Date.now()}`],
        origen: 'manual'
      }
    ])
    setEmailsExcluidos(prev => {
      const next = new Set(prev)
      next.delete(clean)
      return next
    })
    setNuevoEmailManual('')
    showToast(`✅ Correo ${clean} agregado a los destinatarios`)
  }

  const handleToggleExcluirEmail = (email: string) => {
    const key = email.trim().toLowerCase()
    setEmailsExcluidos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSeleccionarTodos = () => {
    setEmailsExcluidos(new Set())
  }

  const handleDeseleccionarTodos = () => {
    setEmailsExcluidos(new Set(listaBaseAudiencia.map(d => d.email.trim().toLowerCase())))
  }

  const handleQuitarDestinatario = (email: string) => {
    const key = email.trim().toLowerCase()
    setDestinatariosExcel(prev => prev.filter(d => d.email.toLowerCase() !== key))
    setDestinatariosManualesExtra(prev => prev.filter(d => d.email.toLowerCase() !== key))
    setEmailsExcluidos(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  const previewHtml = useMemo(() => {
    return generarHtmlNotificacionGlobal({
      edificioNombre,
      asunto: asunto.trim() || 'Vista previa del comunicado Domus',
      cuerpo: cuerpo.trim() || 'Escribe el contenido del comunicado en el panel izquierdo para previsualizar el diseño exacto que recibirán los propietarios.',
      categoria,
      remitenteNombre,
      incluirBotonPortal
    })
  }, [edificioNombre, asunto, cuerpo, categoria, remitenteNombre, incluirBotonPortal])

  const aplicarFormatoTexto = (token: 'bold' | 'italic' | 'bullet' | 'number' | 'hr') => {
    if (token === 'bold') setCuerpo(prev => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''}**texto en negrita**`)
    if (token === 'italic') setCuerpo(prev => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''}*texto en cursiva*`)
    if (token === 'bullet') setCuerpo(prev => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}- Punto informativo`)
    if (token === 'number') setCuerpo(prev => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}1. Primer punto`)
    if (token === 'hr') setCuerpo(prev => `${prev}${prev && !prev.endsWith('\n') ? '\n\n' : ''}---\n`)
  }

  const handleConfirmarEnvio = async (soloDestinatarios?: DestinatarioGlobal[]) => {
    const listaFinal = soloDestinatarios || destinatariosSeleccionados
    if (!asunto.trim() || !cuerpo.trim()) {
      setErrorMsg('Completa el Asunto y el Cuerpo del mensaje antes de enviar.')
      return
    }
    if (listaFinal.length === 0) {
      setErrorMsg('No hay correos electrónicos seleccionados para enviar.')
      return
    }

    setConfirmModalOpen(false)
    setVerListaEnConfirm(false)
    setErrorMsg(null)
    setEnviando(true)
    setUltimoResultado(null)
    setProgreso({
      procesados: 0,
      total: listaFinal.length,
      enviados: 0,
      fallidos: 0,
      loteActual: 0,
      totalLotes: Math.max(1, Math.ceil(listaFinal.length / 20))
    })

    try {
      const resultado = await enviarNotificacionGlobalMasiva(
        {
          asunto: asunto.trim(),
          cuerpo: cuerpo.trim(),
          categoria,
          destinatarios: listaFinal,
          edificioNombre,
          remitenteNombre,
          remitenteEmail,
          incluirBotonPortal,
          notificarEnApp,
          origenAudiencia
        },
        p => setProgreso(p)
      )

      setUltimoResultado(resultado)
      await cargarHistorial()

      if (resultado.fallidos === 0) {
        showToast(`✅ Comunicado enviado exitosamente a ${resultado.enviados} correo(s)`)
      } else {
        showToast(`⚠️ Envío finalizado: ${resultado.enviados} exitosos, ${resultado.fallidos} con error`)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error inesperado durante el envío masivo')
    } finally {
      setEnviando(false)
    }
  }

  const handleReintentarFallidos = () => {
    if (!ultimoResultado || ultimoResultado.errores.length === 0) return
    const emailsFallidos = new Set(ultimoResultado.errores.map(e => e.email.toLowerCase()))
    const targets = listaBaseAudiencia.filter(d => emailsFallidos.has(d.email.toLowerCase()))
    if (targets.length > 0) {
      handleConfirmarEnvio(targets)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>
      {/* Toast flotante */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#1f2937',
          color: '#fff',
          border: '1px solid #374151',
          boxShadow: '0 10px 25px rgba(0,0,0,0.55)',
          padding: '12px 20px',
          borderRadius: '10px',
          zIndex: 99999,
          fontSize: '13px',
          fontWeight: 700
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>
              📧 Notificación Global por Correo Masivo
            </h1>
            <span style={{
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '999px'
            }}>
              Privacidad BCC Protegida
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13.5px', margin: '6px 0 0' }}>
            Redacta comunicados oficiales y envíalos de forma masiva en lotes seguros a todos los propietarios y residentes activos de {edificioNombre}.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #262626',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ color: '#34d399', fontWeight: 800 }}>
              {loadingAudiencia ? '...' : `${destinatariosSeleccionados.length} correo(s) seleccionados`}
            </span>
            <span style={{ color: '#52525b' }}>|</span>
            <span style={{ color: origenAudiencia === 'bd' && sinCorreo.length > 0 ? '#fbbf24' : '#94a3b8', fontWeight: 700 }}>
              {origenAudiencia === 'bd'
                ? (loadingAudiencia ? '...' : `${sinCorreo.length} aptos sin correo`)
                : origenAudiencia === 'ultimo_recibo'
                  ? 'Origen: Último Recibo'
                  : 'Origen: Excel'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              cargarAudiencia()
              cargarUltimoReciboAudiencia()
            }}
            disabled={loadingAudiencia || loadingUltimoRecibo}
            style={{
              backgroundColor: '#1e1e1e',
              color: '#fff',
              border: '1px solid #333',
              padding: '9px 14px',
              borderRadius: '10px',
              cursor: loadingAudiencia || loadingUltimoRecibo ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            🔄 Recargar Audiencia
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setTab('redactar')}
          style={{
            padding: '9px 18px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            backgroundColor: tab === 'redactar' ? 'var(--color-accent, #f97316)' : '#1a1a1a',
            color: tab === 'redactar' ? '#fff' : '#94a3b8'
          }}
        >
          ✉️ Redactar Comunicado
        </button>
        <button
          type="button"
          onClick={() => setTab('historial')}
          style={{
            padding: '9px 18px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            backgroundColor: tab === 'historial' ? 'var(--color-accent, #f97316)' : '#1a1a1a',
            color: tab === 'historial' ? '#fff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>📜 Historial de Envíos</span>
          <span style={{
            backgroundColor: tab === 'historial' ? 'rgba(255,255,255,0.22)' : '#2a2a2a',
            color: '#fff',
            padding: '1px 7px',
            borderRadius: '999px',
            fontSize: '11px'
          }}>
            {historial.length}
          </span>
        </button>
      </div>

      {tab === 'redactar' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {/* PANEL IZQUIERDO: COMPOSITOR */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #1e1e1e',
            borderRadius: '16px',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Categoría */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Categoría del Comunicado
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {CATEGORIAS.map(cat => {
                  const active = categoria === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoria(cat.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${active ? cat.color : '#262626'}`,
                        backgroundColor: active ? `${cat.color}20` : '#0d0e12',
                        color: active ? cat.color : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Plantillas rápidas */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Plantillas Rápidas
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PLANTILLAS_RAPIDAS.map(pl => (
                  <button
                    key={pl.titulo}
                    type="button"
                    onClick={() => {
                      setCategoria(pl.categoria)
                      setAsunto(pl.asunto)
                      setCuerpo(pl.cuerpo)
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #2a2a2a',
                      backgroundColor: '#1a1c22',
                      color: '#cbd5e1',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {pl.titulo}
                  </button>
                ))}
              </div>
            </div>

            {/* Asunto */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                Asunto del Correo *
              </label>
              <input
                type="text"
                value={asunto}
                onChange={e => setAsunto(e.target.value)}
                placeholder="Ej. Mantenimiento de ascensores y aviso importante a la comunidad"
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid #2a2a2a',
                  color: '#fff',
                  padding: '11px 13px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Cuerpo + Barra de formato */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Cuerpo del Mensaje *
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { key: 'bold', label: 'B', title: 'Negrita (**texto**)' },
                    { key: 'italic', label: 'I', title: 'Cursiva (*texto*)' },
                    { key: 'bullet', label: '• Lista', title: 'Lista con viñetas' },
                    { key: 'number', label: '1. Lista', title: 'Lista numerada' },
                    { key: 'hr', label: '—', title: 'Separador horizontal' }
                  ].map(btn => (
                    <button
                      key={btn.key}
                      type="button"
                      title={btn.title}
                      onClick={() => aplicarFormatoTexto(btn.key as any)}
                      style={{
                        backgroundColor: '#1f232c',
                        border: '1px solid #2e3340',
                        color: '#e2e8f0',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={9}
                value={cuerpo}
                onChange={e => setCuerpo(e.target.value)}
                placeholder={'Escribe aquí tu comunicado oficial...\n\nSugerencia: usa **negrita**, *cursiva*, listas con "- " o "1. " y "---" para separar secciones.'}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid #2a2a2a',
                  color: '#fff',
                  padding: '12px 13px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  lineHeight: 1.55,
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '190px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Opciones de envío */}
            <div style={{
              backgroundColor: '#0d0f14',
              border: '1px solid #222630',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={incluirBotonPortal}
                  onChange={e => setIncluirBotonPortal(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent, #f97316)' }}
                />
                <span>Incluir botón de acceso directo al Portal Domus en el correo</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={notificarEnApp}
                  onChange={e => setNotificarEnApp(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent, #f97316)' }}
                />
                <span>Enviar también una notificación dentro de la plataforma Domus</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={incluirDesocupados}
                  onChange={e => setIncluirDesocupados(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent, #f97316)' }}
                />
                <span>Incluir apartamentos marcados como desocupados (si tienen correo)</span>
              </label>
            </div>

            {/* Audiencia: Origen (BD / Último Recibo / Excel) y Revisión de Correos */}
            <div style={{
              backgroundColor: '#0d0f14',
              border: '1px solid #222630',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#fff' }}>
                    👥 Destinatarios del Comunicado
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    <strong style={{ color: '#34d399' }}>{destinatariosSeleccionados.length}</strong> de {listaBaseAudiencia.length} correo(s) seleccionado(s)
                    {origenAudiencia === 'bd' && ` · ${totalAptosActivos} aptos activos`}
                    {origenAudiencia === 'bd' && sinCorreo.length > 0 ? ` · ${sinCorreo.length} sin correo` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVerAudiencia(v => !v)}
                  style={{
                    backgroundColor: '#1e222b',
                    border: '1px solid #333947',
                    color: '#93c5fd',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {verAudiencia ? 'Ocultar lista' : `Revisar correos (${listaBaseAudiencia.length})`}
                </button>
              </div>

              {/* Selector de origen (3 opciones) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '6px' }}>
                {[
                  {
                    id: 'bd' as const,
                    label: `🏢 Base de Datos (${destinatarios.length})`
                  },
                  {
                    id: 'ultimo_recibo' as const,
                    label: `🧾 Último Recibo (${loadingUltimoRecibo ? '...' : (destinatariosUltimoRecibo?.destinatarios.length ?? 0)})`
                  },
                  {
                    id: 'excel' as const,
                    label: `📊 Desde Excel (${destinatariosExcel.length})`
                  }
                ].map(opt => {
                  const activo = origenAudiencia === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSeleccionarOrigen(opt.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '9px',
                        border: `1px solid ${activo ? 'var(--color-accent, #f97316)' : '#262b36'}`,
                        backgroundColor: activo ? 'rgba(249, 115, 22, 0.16)' : '#12151d',
                        color: activo ? '#fb923c' : '#cbd5e1',
                        fontSize: '11.5px',
                        fontWeight: activo ? 800 : 600,
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* Banner informativo para Último Recibo Enviado */}
              {origenAudiencia === 'ultimo_recibo' && (
                <div style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ fontSize: '11.5px', color: '#bfdbfe', flex: '1 1 200px' }}>
                    <div style={{ fontWeight: 800 }}>
                      🧾 {destinatariosUltimoRecibo?.notaFuente || 'Cargando últimos correos de recibos...'}
                    </div>
                    {destinatariosUltimoRecibo?.fechaEnvio && (
                      <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '2px' }}>
                        Referencia: {new Date(destinatariosUltimoRecibo.fechaEnvio).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {!loadingUltimoRecibo && (destinatariosUltimoRecibo?.destinatarios.length || 0) === 0 && (
                      <div style={{ fontSize: '11px', color: '#fcd34d', marginTop: '3px' }}>
                        Aún no hay recibos enviados con correo. Puedes cargar un Excel o usar la Base de Datos.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => cargarUltimoReciboAudiencia()}
                    disabled={loadingUltimoRecibo}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#93c5fd',
                      borderRadius: '7px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: loadingUltimoRecibo ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loadingUltimoRecibo ? '⏳...' : '🔄 Actualizar'}
                  </button>
                </div>
              )}

              {/* Zona de carga Excel */}
              {origenAudiencia === 'excel' && (
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px dashed rgba(16, 185, 129, 0.35)',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleCargarExcelFile}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => excelInputRef.current?.click()}
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.45)',
                        color: '#34d399',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      📤 Subir Archivo Excel (.xlsx / .xls / .csv)
                    </button>
                    <button
                      type="button"
                      onClick={handleDescargarPlantillaExcel}
                      style={{
                        backgroundColor: '#1a1e26',
                        border: '1px solid #2e3442',
                        color: '#cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      📥 Descargar Plantilla Excel
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    El archivo puede incluir columnas <strong>Apartamento</strong>, <strong>Nombre</strong> y <strong>Correo</strong> (o simplemente una columna con los correos).
                  </div>
                  {excelMeta && (
                    <div style={{
                      backgroundColor: '#11161f',
                      border: '1px solid #232b38',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      fontSize: '11px'
                    }}>
                      <div style={{ color: '#e2e8f0' }}>
                        📄 <strong>{excelMeta.nombreArchivo}</strong> ·{' '}
                        <span style={{ color: '#34d399', fontWeight: 700 }}>{destinatariosExcel.length} válidos</span>
                        {excelMeta.duplicados > 0 && <span style={{ color: '#93c5fd' }}> · {excelMeta.duplicados} duplicados omitidos</span>}
                        {excelMeta.descartados > 0 && <span style={{ color: '#fbbf24' }}> · {excelMeta.descartados} filas sin correo</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinatariosExcel([])
                          setExcelMeta(null)
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.14)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Limpiar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Panel desplegable de revisión / búsqueda / edición de correos */}
              {verAudiencia && (
                <div style={{ borderTop: '1px solid #1e222b', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>
                      Revisión de correos ({destinatariosSeleccionados.length}/{listaBaseAudiencia.length} marcados)
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleSeleccionarTodos}
                        style={{ backgroundColor: '#18202c', border: '1px solid #2b3648', color: '#34d399', borderRadius: '6px', padding: '3px 8px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✓ Todos
                      </button>
                      <button
                        type="button"
                        onClick={handleDeseleccionarTodos}
                        style={{ backgroundColor: '#18202c', border: '1px solid #2b3648', color: '#f87171', borderRadius: '6px', padding: '3px 8px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✕ Ninguno
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Buscar apartamento, nombre o correo..."
                    value={busquedaEmail}
                    onChange={e => setBusquedaEmail(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#07080b',
                      border: '1px solid #2a2f3b',
                      color: '#fff',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />

                  {/* Agregar correo puntual */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="email"
                      placeholder="+ Agregar correo adicional (ej. vecino@correo.com)"
                      value={nuevoEmailManual}
                      onChange={e => setNuevoEmailManual(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAgregarEmailManual()
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: '#07080b',
                        border: '1px solid #2a2f3b',
                        color: '#fff',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAgregarEmailManual}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#93c5fd',
                        borderRadius: '8px',
                        padding: '7px 12px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      + Agregar
                    </button>
                  </div>

                  <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {destinatariosFiltrados.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '11.5px', color: '#64748b' }}>
                        {listaBaseAudiencia.length === 0
                          ? 'No hay correos cargados en este origen todavía.'
                          : 'No hay coincidencias con tu búsqueda.'}
                      </div>
                    ) : (
                      destinatariosFiltrados.map(d => {
                        const checked = !emailsExcluidos.has(d.email.trim().toLowerCase())
                        const esRemovible = d.origen === 'excel' || d.origen === 'manual'
                        return (
                          <div key={d.email} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            backgroundColor: checked ? '#12151d' : '#0b0c10',
                            border: `1px solid ${checked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'}`,
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            opacity: checked ? 1 : 0.5
                          }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleExcluirEmail(d.email)}
                                style={{ accentColor: 'var(--color-accent, #f97316)', cursor: 'pointer', flexShrink: 0 }}
                              />
                              <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <strong style={{ color: d.origen === 'excel' ? '#34d399' : d.origen === 'manual' ? '#60a5fa' : '#fb923c' }}>
                                  {d.apartamentos.every(a => a === 'Excel' || a === 'Manual')
                                    ? d.apartamentos[0]
                                    : `Apto ${d.apartamentos.join(', ')}`}
                                </strong>{' '}
                                · {d.nombre}
                              </span>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}>{d.email}</span>
                              {esRemovible && (
                                <button
                                  type="button"
                                  onClick={() => handleQuitarDestinatario(d.email)}
                                  title="Quitar correo de la lista"
                                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {origenAudiencia === 'bd' && sinCorreo.length > 0 && (
                    <div style={{ marginTop: '4px', padding: '8px 10px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', fontSize: '11px', color: '#fcd34d' }}>
                      <strong>Apartamentos sin correo registrado ({sinCorreo.length}):</strong>{' '}
                      {sinCorreo.map(s => s.numero).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {errorMsg && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 600
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Barra de progreso durante el envío */}
            {enviando && progreso && (
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#93c5fd', marginBottom: '6px' }}>
                  <span>Enviando comunicado en lotes confidenciales...</span>
                  <span>Lote {progreso.loteActual}/{progreso.totalLotes} · {progreso.procesados}/{progreso.total}</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${progreso.total > 0 ? Math.round((progreso.procesados / progreso.total) * 100) : 0}%`,
                    height: '100%',
                    background: 'var(--color-brand-gradient, linear-gradient(90deg, #f97316, #ea580c))',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}

            {/* Resultado del último envío */}
            {ultimoResultado && !enviando && (
              <div style={{
                backgroundColor: ultimoResultado.fallidos === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                border: `1px solid ${ultimoResultado.fallidos === 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                borderRadius: '12px',
                padding: '14px'
              }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: ultimoResultado.fallidos === 0 ? '#34d399' : '#fbbf24' }}>
                  {ultimoResultado.fallidos === 0
                    ? `✅ ¡Notificación global enviada con éxito a ${ultimoResultado.enviados} destinatario(s)!`
                    : `⚠️ Envío completado con ${ultimoResultado.enviados} éxito(s) y ${ultimoResultado.fallidos} error(es)`}
                </div>
                <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginTop: '4px' }}>
                  Modo utilizado: {ultimoResultado.modoEnvio === 'bcc_lotes' ? 'Lotes BCC confidenciales' : 'Envío individual controlado'} · Guardado en el historial.
                </div>
                {ultimoResultado.errores.length > 0 && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '11px', color: '#fca5a5', marginBottom: '8px' }}>
                      {ultimoResultado.errores.map((e, idx) => (
                        <div key={idx}>• {e.email}: {e.error}</div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleReintentarFallidos}
                      style={{
                        backgroundColor: '#f59e0b',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      🔁 Reintentar {ultimoResultado.errores.length} Fallido(s)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Botón Principal de Envío */}
            <button
              type="button"
              disabled={enviando || loadingAudiencia || !asunto.trim() || !cuerpo.trim() || destinatariosSeleccionados.length === 0}
              onClick={() => {
                setVerListaEnConfirm(false)
                setConfirmModalOpen(true)
              }}
              style={{
                width: '100%',
                background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%))',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '14px 20px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: enviando || !asunto.trim() || !cuerpo.trim() || destinatariosSeleccionados.length === 0 ? 'not-allowed' : 'pointer',
                opacity: enviando || !asunto.trim() || !cuerpo.trim() || destinatariosSeleccionados.length === 0 ? 0.55 : 1,
                boxShadow: 'var(--color-brand-shadow, 0 6px 20px rgba(249, 115, 22, 0.35))'
              }}
            >
              {enviando
                ? '⏳ Despachando correos...'
                : `🚀 Enviar Comunicado Global a ${destinatariosSeleccionados.length} Destinatario(s)`}
            </button>
          </div>

          {/* PANEL DERECHO: VISTA PREVIA HTML EN VIVO */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #1e1e1e',
            borderRadius: '16px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#fff' }}>
                  👁️ Vista Previa en Vivo (Plantilla Domus)
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Así visualizarán el correo electrónico los propietarios en su bandeja
                </div>
              </div>

              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#090a0d', padding: '3px', borderRadius: '8px', border: '1px solid #262626' }}>
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  style={{
                    backgroundColor: previewMode === 'desktop' ? '#2563eb' : 'transparent',
                    color: previewMode === 'desktop' ? '#fff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🖥️ Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  style={{
                    backgroundColor: previewMode === 'mobile' ? '#2563eb' : 'transparent',
                    color: previewMode === 'mobile' ? '#fff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📱 Móvil
                </button>
              </div>
            </div>

            <div style={{
              backgroundColor: '#090a0d',
              border: '1px solid #222',
              borderRadius: '12px',
              padding: '10px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <iframe
                title="Vista previa comunicado Domus"
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                style={{
                  width: previewMode === 'mobile' ? '375px' : '100%',
                  maxWidth: '100%',
                  height: '620px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#090a0d',
                  transition: 'width 0.25s ease'
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* PESTAÑA HISTORIAL */
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid #1e1e1e',
          borderRadius: '16px',
          padding: '22px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>📜 Historial de Comunicados Globales</h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Registro de correos masivos despachados desde el panel administrativo
              </p>
            </div>
            <button
              type="button"
              onClick={() => cargarHistorial()}
              style={{
                backgroundColor: '#1e1e1e',
                color: '#fff',
                border: '1px solid #333',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔄 Actualizar
            </button>
          </div>

          {loadingHistorial ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Cargando historial...</div>
          ) : historial.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '44px 20px', color: '#64748b' }}>
              Aún no se han enviado comunicados globales por correo. Redacta el primero desde la pestaña anterior.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historial.map(item => {
                const cat = CATEGORIAS.find(c => c.id === item.categoria) || CATEGORIAS[0]
                return (
                  <div key={item.id} style={{
                    backgroundColor: '#0d0f14',
                    border: '1px solid #222630',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          color: cat.color,
                          backgroundColor: `${cat.color}20`,
                          border: `1px solid ${cat.color}40`,
                          padding: '2px 8px',
                          borderRadius: '999px'
                        }}>
                          {cat.icon} {cat.label}
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>{item.asunto}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                        Enviado el {new Date(item.fechaEnvio).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · Por <strong style={{ color: '#e2e8f0' }}>{item.remitenteNombre}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11.5px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>✅ {item.enviados} enviados</span>
                        {item.fallidos > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}>❌ {item.fallidos} fallidos</span>}
                        <span style={{ color: '#64748b' }}>Total audiencia: {item.totalDestinatarios}</span>
                        {item.origenAudiencia && (
                          <span style={{ color: '#cbd5e1', backgroundColor: '#1a1f29', padding: '1px 7px', borderRadius: '999px', fontSize: '10.5px' }}>
                            {item.origenAudiencia === 'ultimo_recibo'
                              ? '🧾 Último Recibo'
                              : item.origenAudiencia === 'excel'
                                ? '📊 Excel'
                                : '🏢 BD'}
                          </span>
                        )}
                        {item.notificadoEnApp && <span style={{ color: '#60a5fa' }}>🔔 +Notif. App</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setVerEmailsHistorial(false)
                          setPreviewHistorialItem(item)
                        }}
                        style={{
                          backgroundColor: '#1e222b',
                          border: '1px solid #333947',
                          color: '#93c5fd',
                          borderRadius: '8px',
                          padding: '7px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        👁️ Ver Correo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoria(item.categoria)
                          setAsunto(item.asunto)
                          setCuerpo(item.cuerpo)
                          setIncluirBotonPortal(item.incluirBotonPortal !== false)
                          setTab('redactar')
                        }}
                        style={{
                          backgroundColor: 'rgba(249, 115, 22, 0.16)',
                          border: '1px solid rgba(249, 115, 22, 0.35)',
                          color: '#fb923c',
                          borderRadius: '8px',
                          padding: '7px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        📋 Reutilizar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL CONFIRMACIÓN DE ENVÍO MASIVO */}
      {confirmModalOpen && (
        <div
          onClick={() => setConfirmModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#141519',
              border: '1px solid rgba(249, 115, 22, 0.45)',
              borderRadius: '18px',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ height: '3px', background: 'var(--color-brand-gradient, linear-gradient(90deg, #f97316, #ea580c))' }} />
            <div style={{ padding: '22px 24px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                🚀 Confirmar Envío Global Masivo
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                Estás a punto de enviar este comunicado oficial a los correos seleccionados.
              </p>

              <div style={{
                backgroundColor: '#0b0d12',
                border: '1px solid #222630',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '12.5px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginBottom: '12px'
              }}>
                <div><span style={{ color: '#64748b' }}>Asunto:</span> <strong style={{ color: '#fff' }}>{asunto}</strong></div>
                <div>
                  <span style={{ color: '#64748b' }}>Origen:</span>{' '}
                  <strong style={{ color: '#fb923c' }}>
                    {origenAudiencia === 'ultimo_recibo'
                      ? 'Último Recibo Enviado'
                      : origenAudiencia === 'excel'
                        ? 'Archivo Excel'
                        : 'Base de Datos Domus'}
                  </strong>
                </div>
                <div><span style={{ color: '#64748b' }}>Destinatarios:</span> <strong style={{ color: '#34d399' }}>{destinatariosSeleccionados.length} correos seleccionados</strong></div>
                <div><span style={{ color: '#64748b' }}>Privacidad:</span> <strong style={{ color: '#93c5fd' }}>Lotes BCC confidenciales (sin exposición entre vecinos)</strong></div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setVerListaEnConfirm(v => !v)}
                  style={{
                    backgroundColor: '#161a23',
                    border: '1px solid #2a303d',
                    color: '#93c5fd',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  {verListaEnConfirm
                    ? '🔼 Ocultar lista final de correos'
                    : `👁️ Revisar los ${destinatariosSeleccionados.length} correos finales`}
                </button>
                {verListaEnConfirm && (
                  <div style={{
                    marginTop: '8px',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    backgroundColor: '#090b10',
                    border: '1px solid #1e2430',
                    borderRadius: '8px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '11px'
                  }}>
                    {destinatariosSeleccionados.map(d => (
                      <div key={d.email} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: '#cbd5e1' }}>
                          {d.apartamentos.every(a => a === 'Excel' || a === 'Manual') ? d.apartamentos[0] : `Apto ${d.apartamentos.join(', ')}`}
                        </span>
                        <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{d.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(false)}
                  style={{
                    backgroundColor: '#222',
                    border: '1px solid #333',
                    color: '#ccc',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmarEnvio()}
                  style={{
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c, #ea580c))',
                    border: 'none',
                    color: '#fff',
                    padding: '9px 20px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  ✅ Confirmar y Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA DE HISTORIAL */}
      {previewHistorialItem && (
        <div
          onClick={() => setPreviewHistorialItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '660px',
              backgroundColor: '#141519',
              border: '1px solid #2d3340',
              borderRadius: '18px',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #222630', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '14px', color: '#fff' }}>{previewHistorialItem.asunto}</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {previewHistorialItem.destinatariosEmails && previewHistorialItem.destinatariosEmails.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVerEmailsHistorial(v => !v)}
                    style={{
                      backgroundColor: '#1e222b',
                      border: '1px solid #333947',
                      color: '#93c5fd',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {verEmailsHistorial
                      ? '🔼 Ocultar correos'
                      : `👁️ Ver los ${previewHistorialItem.destinatariosEmails.length} correos destinatarios`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewHistorialItem(null)}
                  style={{ background: '#222', border: 'none', color: '#aaa', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}
                >✕</button>
              </div>
            </div>
            {verEmailsHistorial && previewHistorialItem.destinatariosEmails && previewHistorialItem.destinatariosEmails.length > 0 && (
              <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                padding: '10px 20px',
                backgroundColor: '#0b0d12',
                borderBottom: '1px solid #222630',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px'
              }}>
                {previewHistorialItem.destinatariosEmails.map(em => (
                  <span key={em} style={{
                    backgroundColor: '#151923',
                    border: '1px solid #262d3d',
                    color: '#cbd5e1',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '11px'
                  }}>
                    {em}
                  </span>
                ))}
              </div>
            )}
            <iframe
              title="Detalle comunicado enviado"
              sandbox="allow-same-origin"
              srcDoc={generarHtmlNotificacionGlobal({
                edificioNombre,
                asunto: previewHistorialItem.asunto,
                cuerpo: previewHistorialItem.cuerpo,
                categoria: previewHistorialItem.categoria,
                remitenteNombre: previewHistorialItem.remitenteNombre,
                incluirBotonPortal: previewHistorialItem.incluirBotonPortal !== false,
                fechaEmision: new Date(previewHistorialItem.fechaEnvio).toLocaleDateString('es-VE', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })
              })}
              style={{ width: '100%', height: '540px', border: 'none', backgroundColor: '#090a0d' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

