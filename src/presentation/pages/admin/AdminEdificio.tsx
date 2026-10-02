import React, { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { useAuth } from '../../../application/contexts/AuthContext'
import { comprimirImagen } from '../../../utils/imageCompressor'
import {
  MiembroJunta,
  CategoriaOrganigrama,
  CATEGORIA_ORGANIGRAMA_CONFIG,
  obtenerJunta,
  guardarMiembroJunta,
  eliminarMiembroJunta,
  formatWhatsappUrl
} from '../../../data/juntaService'
import { PRESET_THEME_COLORS, applyTheme, generateThemePalette } from '../../../utils/themeManager'

export const AdminEdificio: React.FC = () => {
  const { config, refreshConfig } = useAuth()

  // Tab activo: 'edificio' o 'organigrama'
  const [activeTab, setActiveTab] = useState<'edificio' | 'organigrama'>('edificio')

  // Estado Edificio
  const [info, setInfo] = useState({
    nombre_edificio: '',
    rif: '',
    direccion: '',
    total_apartamentos: 62,
    total_pisos: 10,
    apartamentos_por_piso: 6,
    tiene_ph: true,
    total_ph: 2,
    color_primario: '#f97316',
    telefono: '',
    email_contacto: '',
    banco: '',
    cedula_cuenta: '',
    tipo_cuenta: '',
    cuenta_bancaria: '',
    titular_cuenta: '',
    pago_movil_banco: '',
    pago_movil_cedula: '',
    pago_movil_telefono: '',
    zelle_email: '',
    fecha_inicio_gestion: '2026-09-01',
    fecha_fin_administracion_anterior: '2026-08-31',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado Organigrama / Junta
  const [miembros, setMiembros] = useState<MiembroJunta[]>([])
  const [loadingJunta, setLoadingJunta] = useState(false)
  const [modalMiembroOpen, setModalMiembroOpen] = useState(false)
  const [miembroEditar, setMiembroEditar] = useState<MiembroJunta | null>(null)

  // Form Miembro
  const [formNombre, setFormNombre] = useState('')
  const [formCargo, setFormCargo] = useState('')
  const [formCategoria, setFormCategoria] = useState<CategoriaOrganigrama>('junta_directiva')
  const [formTelefono, setFormTelefono] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formApto, setFormApto] = useState('')
  const [formDescripcionRol, setFormDescripcionRol] = useState('')
  const [formHorario, setFormHorario] = useState('')
  const [formOrden, setFormOrden] = useState<number>(1)

  // Cargar datos edificio
  useEffect(() => {
    if (config) {
      setInfo({
        nombre_edificio: config.nombre_edificio || '',
        rif: config.rif || '',
        direccion: config.direccion || '',
        total_apartamentos: config.total_apartamentos || 62,
        total_pisos: (config as any).total_pisos ?? 10,
        apartamentos_por_piso: (config as any).apartamentos_por_piso ?? 6,
        tiene_ph: (config as any).tiene_ph ?? true,
        total_ph: (config as any).total_ph ?? 2,
        color_primario: (config as any).color_primario || '#f97316',
        telefono: config.telefono || '',
        email_contacto: config.email_contacto || '',
        banco: config.banco || '',
        cedula_cuenta: (config as any).cedula_cuenta || '',
        tipo_cuenta: (config as any).tipo_cuenta || '',
        cuenta_bancaria: config.cuenta_bancaria || '',
        titular_cuenta: config.titular_cuenta || '',
        pago_movil_banco: (config as any).pago_movil_banco || '',
        pago_movil_cedula: (config as any).pago_movil_cedula || '',
        pago_movil_telefono: (config as any).pago_movil_telefono || '',
        zelle_email: (config as any).zelle_email || '',
        fecha_inicio_gestion: (config as any)?.fecha_inicio_gestion || '2026-09-01',
        fecha_fin_administracion_anterior: (config as any)?.fecha_fin_administracion_anterior || '2026-08-31',
      })
      if (config.logo_url) setLogoPreview(config.logo_url)
      if ((config as any).color_primario) {
        applyTheme((config as any).color_primario)
      }
    }
  }, [config])

  // Cargar junta
  const cargarJunta = useCallback(async () => {
    setLoadingJunta(true)
    try {
      const res = await obtenerJunta()
      setMiembros(res.data || [])
    } catch (err) {
      console.warn('[AdminEdificio] Error cargando junta:', err)
    } finally {
      setLoadingJunta(false)
    }
  }, [])

  useEffect(() => {
    cargarJunta()

    const channel = supabase
      .channel('realtime_admin_junta')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'junta_condominio' }, () => {
        cargarJunta()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarJunta])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleEstructuraChange = (field: 'total_pisos' | 'apartamentos_por_piso' | 'tiene_ph' | 'total_ph', value: any) => {
    setInfo(prev => {
      const next = { ...prev, [field]: value }
      const pisos = Number(field === 'total_pisos' ? value : next.total_pisos) || 0
      const aptosPorPiso = Number(field === 'apartamentos_por_piso' ? value : next.apartamentos_por_piso) || 0
      const tienePh = Boolean(field === 'tiene_ph' ? value : next.tiene_ph)
      const totalPh = tienePh ? (Number(field === 'total_ph' ? value : next.total_ph) || 0) : 0
      
      const nuevoTotal = (pisos * aptosPorPiso) + totalPh
      return {
        ...next,
        total_apartamentos: nuevoTotal > 0 ? nuevoTotal : next.total_apartamentos
      }
    })
  }

  const handleColorChange = (newColor: string) => {
    setInfo(prev => ({ ...prev, color_primario: newColor }))
    applyTheme(newColor)
  }

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen (PNG, JPG, SVG, etc.)')
      return
    }
    setErrorMsg(null)
    try {
      const res = await comprimirImagen(file, { maxWidth: 512, maxHeight: 512, quality: 0.85 })
      setLogoFile(res.file)
      setLogoPreview(URL.createObjectURL(res.file))
    } catch (_) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = ev => setLogoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processImageFile(file)
  }

  const handleRemoveLogo = () => {
    setLogoPreview(null)
    setLogoFile(null)
  }

  const handleSaveEdificio = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      let logo_url = config?.logo_url || null

      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logos/edificio-logo.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('edificio-assets')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type })

        if (uploadError) {
          console.warn('Storage upload failed, using base64 fallback:', uploadError.message)
          logo_url = logoPreview
        } else {
          const { data: urlData } = supabase.storage
            .from('edificio-assets')
            .getPublicUrl(path)
          logo_url = urlData.publicUrl + `?v=${Date.now()}`
        }
      } else if (logoPreview === null && config?.logo_url) {
        logo_url = null
      }

      let dbError: any

      const updateData = {
        nombre_edificio: info.nombre_edificio,
        rif: info.rif,
        direccion: info.direccion,
        total_apartamentos: Number(info.total_apartamentos) || 62,
        total_pisos: Number(info.total_pisos) || 10,
        apartamentos_por_piso: Number(info.apartamentos_por_piso) || 6,
        tiene_ph: Boolean(info.tiene_ph),
        total_ph: info.tiene_ph ? (Number(info.total_ph) || 0) : 0,
        color_primario: info.color_primario || '#f97316',
        telefono: info.telefono,
        email_contacto: info.email_contacto,
        banco: info.banco,
        cedula_cuenta: info.cedula_cuenta,
        tipo_cuenta: info.tipo_cuenta,
        cuenta_bancaria: info.cuenta_bancaria,
        titular_cuenta: info.titular_cuenta,
        pago_movil_banco: info.pago_movil_banco,
        pago_movil_cedula: info.pago_movil_cedula,
        pago_movil_telefono: info.pago_movil_telefono,
        zelle_email: info.zelle_email,
        fecha_inicio_gestion: info.fecha_inicio_gestion || '2026-09-01',
        fecha_fin_administracion_anterior: info.fecha_fin_administracion_anterior || '2026-08-31',
        logo_url,
        updated_at: new Date().toISOString(),
      }

      if ((config as any)?.id) {
        const { error } = await supabase
          .from('configuracion_edificio')
          .update(updateData)
          .eq('id', (config as any).id)
        dbError = error
      } else {
        const { data: existing } = await supabase.from('configuracion_edificio').select('id').limit(1).single()
        if (existing?.id) {
          const { error } = await supabase
            .from('configuracion_edificio')
            .update(updateData)
            .eq('id', existing.id)
          dbError = error
        } else {
          const { error } = await supabase
            .from('configuracion_edificio')
            .insert([updateData])
          dbError = error
        }
      }

      if (dbError) throw dbError

      if (logo_url) setLogoPreview(logo_url)
      setLogoFile(null)

      applyTheme(info.color_primario)
      await refreshConfig()
      setSuccessMsg('✅ Información del edificio y tema visual actualizados correctamente.')
    } catch (err: any) {
      setErrorMsg('Error al guardar: ' + (err.message || 'Intenta de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  // ── Sincronizar Departamentos de la Torre ─────────────────────────────
  const [sincronizandoAptos, setSincronizandoAptos] = useState(false)

  const handleSincronizarApartamentos = async () => {
    if (!confirm('¿Deseas sincronizar los apartamentos del sistema con la estructura configurada de la torre?')) return
    setSincronizandoAptos(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const matchTorre = info.nombre_edificio.match(/\d+/)
      const prefix = matchTorre ? matchTorre[0] : '5'
      const totalPisos = Number(info.total_pisos) || 10
      const aptosPorPiso = Number(info.apartamentos_por_piso) || 6
      const tienePh = Boolean(info.tiene_ph)
      const totalPh = tienePh ? (Number(info.total_ph) || 2) : 0

      const aptosEsperados: Array<{ numero: string; piso: number; alicuota: number; estado: string }> = []

      // Pisos regulares: Piso 1 al totalPisos
      // Piso 1: 511..516, Piso 2: 521..526, ..., Piso 9: 591..596, Piso 10: 5101..5106
      for (let p = 1; p <= totalPisos; p++) {
        for (let a = 1; a <= aptosPorPiso; a++) {
          const numApto = `${prefix}${p < 10 ? `${p}${a}` : `${p}${a}`}`
          aptosEsperados.push({
            numero: numApto,
            piso: p,
            alicuota: 0.0159,
            estado: 'habitado'
          })
        }
      }

      // Penthouse (Piso totalPisos + 1)
      if (tienePh && totalPh > 0) {
        for (let ph = 1; ph <= totalPh; ph++) {
          aptosEsperados.push({
            numero: `${prefix}PH${ph}`,
            piso: totalPisos + 1,
            alicuota: 0.0259,
            estado: 'habitado'
          })
        }
      }

      // Consultar apartamentos existentes
      const { data: existentes, error: errExistentes } = await supabase.from('apartamentos').select('*')
      if (errExistentes) throw errExistentes

      const existentesMap = new Map((existentes || []).map(e => [e.numero, e]))

      // Limpiar 501..506 si todavía existieran mapeándolos a 511..516
      const mapLegacy: Record<string, string> = {
        [`${prefix}01`]: `${prefix}11`,
        [`${prefix}02`]: `${prefix}12`,
        [`${prefix}03`]: `${prefix}13`,
        [`${prefix}04`]: `${prefix}14`,
        [`${prefix}05`]: `${prefix}15`,
        [`${prefix}06`]: `${prefix}16`,
      }
      for (const [legNum, targetNum] of Object.entries(mapLegacy)) {
        const leg = existentesMap.get(legNum)
        if (leg && !existentesMap.has(targetNum)) {
          await supabase.from('apartamentos').update({ numero: targetNum, piso: 1 }).eq('id', leg.id)
          existentesMap.set(targetNum, { ...leg, numero: targetNum, piso: 1 })
          existentesMap.delete(legNum)
        }
      }

      // Insertar o actualizar
      for (const esp of aptosEsperados) {
        const existe = existentesMap.get(esp.numero)
        if (existe) {
          if (existe.piso !== esp.piso) {
            await supabase.from('apartamentos').update({ piso: esp.piso }).eq('id', existe.id)
          }
        } else {
          await supabase.from('apartamentos').insert([esp])
        }
      }

      appCache.invalidateTags(['apartamentos', 'recibos', 'saldos', 'mora'])
      setSuccessMsg(`✅ Sincronización exitosa: ${aptosEsperados.length} apartamentos verificados y alineados con la torre.`)
    } catch (err: any) {
      setErrorMsg('Error al sincronizar apartamentos: ' + (err.message || 'Intente de nuevo.'))
    } finally {
      setSincronizandoAptos(false)
    }
  }

  // Organigrama modal handlers
  const abrirModalNuevoMiembro = () => {
    setMiembroEditar(null)
    setFormNombre('')
    setFormCargo('')
    setFormCategoria('junta_directiva')
    setFormTelefono('')
    setFormEmail('')
    setFormApto('')
    setFormDescripcionRol('')
    setFormHorario('')
    setFormOrden(miembros.length + 1)
    setModalMiembroOpen(true)
  }

  const abrirModalEditarMiembro = (m: MiembroJunta) => {
    setMiembroEditar(m)
    setFormNombre(m.nombre)
    setFormCargo(m.cargo)
    setFormCategoria(m.categoria)
    setFormTelefono(m.telefono || '')
    setFormEmail(m.email || '')
    setFormApto(m.apartamento || '')
    setFormDescripcionRol(m.descripcion_rol || '')
    setFormHorario(m.horario_atencion || '')
    setFormOrden(m.orden)
    setModalMiembroOpen(true)
  }

  const handleGuardarMiembro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formNombre.trim() || !formCargo.trim()) {
      alert('Por favor indica al menos el nombre y el cargo.')
      return
    }

    const payload: Partial<MiembroJunta> = {
      id: miembroEditar?.id,
      nombre: formNombre.trim(),
      cargo: formCargo.trim(),
      categoria: formCategoria,
      telefono: formTelefono.trim(),
      email: formEmail.trim(),
      apartamento: formApto.trim(),
      descripcion_rol: formDescripcionRol.trim(),
      horario_atencion: formHorario.trim(),
      orden: Number(formOrden) || 1
    }

    const res = await guardarMiembroJunta(payload)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setSuccessMsg(miembroEditar ? '✓ Integrante del organigrama actualizado exitosamente.' : '✓ Nuevo integrante agregado al organigrama exitosamente.')
    }
    setModalMiembroOpen(false)
    cargarJunta()
  }

  const handleEliminarMiembro = async (id: string, nombre: string) => {
    if (window.confirm(`¿Estás seguro de eliminar a ${nombre} del organigrama?`)) {
      const res = await eliminarMiembroJunta(id)
      if (res.error) {
        setErrorMsg(res.error)
      } else {
        setSuccessMsg(`✓ Integrante ${nombre} eliminado del organigrama.`)
      }
      cargarJunta()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a',
    color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none'
  }
  const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '13px', marginBottom: '6px' }
  const groupStyle: React.CSSProperties = { marginBottom: '16px' }

  return (
    <div style={{ padding: '32px 24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <style>{`
        .admin-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .admin-grid-2 { grid-template-columns: 1fr; gap: 0px; } }
        .logo-drop-zone { transition: border-color 0.2s, background-color 0.2s; }
        .logo-drop-zone:hover { border-color: var(--color-accent, #f97316) !important; background-color: var(--color-accent-light, rgba(249, 115, 22, 0.05)) !important; }
      `}</style>

      {/* Header Principal */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>🏢 Edificio y Organigrama</h1>
        <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0 0' }}>
          Configuración general del condominio, datos de cuenta bancaria y estructura de la Junta de Condominio
        </p>
      </div>

      {/* TABS DE NAVEGACIÓN */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px', marginBottom: '28px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('edificio')}
          style={{
            background: activeTab === 'edificio' ? 'var(--color-accent-light, rgba(249, 115, 22, 0.15))' : 'transparent',
            border: activeTab === 'edificio' ? '1px solid var(--color-accent, #f97316)' : '1px solid transparent',
            color: activeTab === 'edificio' ? 'var(--color-accent, #f97316)' : '#888',
            padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.18s'
          }}
        >
          <span>🏢</span>
          <span>Datos del Edificio y Bancarios</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('organigrama')}
          style={{
            background: activeTab === 'organigrama' ? 'var(--color-accent-light, rgba(249, 115, 22, 0.15))' : 'transparent',
            border: activeTab === 'organigrama' ? '1px solid var(--color-accent, #f97316)' : '1px solid transparent',
            color: activeTab === 'organigrama' ? 'var(--color-accent, #f97316)' : '#888',
            padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.18s'
          }}
        >
          <span>👥</span>
          <span>Junta de Condominio y Organigrama</span>
          <span style={{
            background: activeTab === 'organigrama' ? 'var(--color-accent, #f97316)' : 'rgba(255,255,255,0.1)',
            color: activeTab === 'organigrama' ? '#000' : '#aaa',
            fontSize: '11px', padding: '1px 6px', borderRadius: '999px', fontWeight: 800
          }}>
            {miembros.length}
          </span>
        </button>
      </div>

      {successMsg && (
        <div style={{ backgroundColor: '#10b98120', color: '#10b981', border: '1px solid #10b98140', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px', maxWidth: '850px' }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px', maxWidth: '850px' }}>
          {errorMsg}
        </div>
      )}

      {/* ── TAB 1: DATOS DEL EDIFICIO ── */}
      {activeTab === 'edificio' && (
        <div style={{ maxWidth: '850px', backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px', boxSizing: 'border-box' }}>
          <form onSubmit={handleSaveEdificio}>
            {/* Logo */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '20px', marginBottom: '32px', borderBottom: '1px solid #2a2a2a', paddingBottom: '24px', flexWrap: 'wrap' }}>
              <div
                className="logo-drop-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  width: '100px', height: '100px', flexShrink: 0,
                  backgroundColor: isDragging ? 'var(--color-accent-light, rgba(249, 115, 22, 0.1))' : '#1a1a1a',
                  borderRadius: '20px',
                  border: `2px dashed ${isDragging ? 'var(--color-accent, #f97316)' : logoPreview ? 'var(--color-accent-glow, #f9731680)' : '#444'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                }}
              >
                {logoPreview
                  ? <img src={logoPreview} alt="Logo del edificio" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '36px', userSelect: 'none' }}>🏢</span>
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

              <div>
                <h3 style={{ color: '#fff', margin: '0 0 4px 0' }}>Logo del Edificio</h3>
                <p style={{ color: '#888', fontSize: '12px', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  Recomendado: 512×512 px · PNG con fondo transparente<br />
                  Máximo 2 MB · Se guardará permanentemente en la nube
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{
                    backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #3a3a3a',
                    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                  }}>
                    {logoPreview ? '🔄 Cambiar imagen' : '📁 Seleccionar imagen'}
                  </button>
                  {logoPreview && (
                    <button type="button" onClick={handleRemoveLogo} style={{
                      backgroundColor: 'transparent', color: '#ef4444',
                      border: '1px solid #ef444440', padding: '7px 14px',
                      borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                    }}>
                      🗑 Eliminar
                    </button>
                  )}
                </div>
                {logoFile && (
                  <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', marginTop: '8px', margin: '8px 0 0 0' }}>
                    ✅ {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB) — se subirá al guardar
                  </p>
                )}
              </div>
            </div>

            {/* General Info */}
            <div className="admin-grid-2">
              <div style={groupStyle}>
                <label style={labelStyle}>Nombre del Edificio / Condominio</label>
                <input name="nombre_edificio" value={info.nombre_edificio} onChange={handleChange} style={inputStyle} required />
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>RIF</label>
                <input name="rif" value={info.rif} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            <div style={groupStyle}>
              <label style={labelStyle}>Dirección Física</label>
              <input name="direccion" value={info.direccion} onChange={handleChange} style={inputStyle} />
            </div>

            <div className="admin-grid-2">
              <div style={groupStyle}>
                <label style={labelStyle}>Teléfono de Contacto</label>
                <input name="telefono" value={info.telefono} onChange={handleChange} style={inputStyle} />
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>Correo Electrónico</label>
                <input type="email" name="email_contacto" value={info.email_contacto} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            {/* Parámetros Estructurales del Edificio / Torre */}
            <div style={{ marginTop: '24px', marginBottom: '24px', backgroundColor: '#181a20', border: '1px solid #282c37', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '20px' }}>📐</span>
                <div>
                  <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>Estructura Arquitectónica y Penthouse (PH)</h4>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>Configura los pisos, apartamentos por nivel y departamentos PH. El total de apartamentos se suma y sincroniza automáticamente.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', alignItems: 'start' }}>
                <div>
                  <label style={labelStyle}>Pisos Regulares</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    name="total_pisos"
                    value={info.total_pisos}
                    onChange={(e) => handleEstructuraChange('total_pisos', parseInt(e.target.value, 10) || 0)}
                    style={inputStyle}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Pisos estándar (del 1 al {info.total_pisos || 1})</span>
                </div>

                <div>
                  <label style={labelStyle}>Aptos por Piso</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    name="apartamentos_por_piso"
                    value={info.apartamentos_por_piso}
                    onChange={(e) => handleEstructuraChange('apartamentos_por_piso', parseInt(e.target.value, 10) || 0)}
                    style={inputStyle}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Apartamentos en cada nivel</span>
                </div>

                <div>
                  <label style={labelStyle}>¿Tiene Piso PH?</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    padding: '0 12px',
                    backgroundColor: '#101216',
                    border: '1px solid #282c37',
                    borderRadius: '8px',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: 600, width: '100%', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(info.tiene_ph)}
                        onChange={(e) => handleEstructuraChange('tiene_ph', e.target.checked)}
                        style={{ width: '17px', height: '17px', accentColor: 'var(--color-accent, #f97316)', cursor: 'pointer' }}
                      />
                      Incluye Penthouse
                    </label>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Piso superior adicional</span>
                </div>

                {info.tiene_ph && (
                  <div>
                    <label style={labelStyle}>Cant. de PH en ese piso</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      name="total_ph"
                      value={info.total_ph}
                      onChange={(e) => handleEstructuraChange('total_ph', parseInt(e.target.value, 10) || 0)}
                      style={{ ...inputStyle, borderColor: 'var(--color-accent, #f97316)' }}
                      placeholder="Ej: 2"
                      required={info.tiene_ph}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Total departamentos en el PH</span>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={labelStyle}>Total Departamentos</label>
                    <span style={{ fontSize: '10px', color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>Auto-sumado</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    name="total_apartamentos"
                    value={info.total_apartamentos}
                    onChange={handleChange}
                    style={{ ...inputStyle, fontWeight: 700, borderColor: 'var(--color-accent, #f97316)', backgroundColor: '#131722' }}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Total general del edificio</span>
                </div>
              </div>

              {/* Resumen explicativo de la distribución */}
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
                color: '#cbd5e1'
              }}>
                <span style={{ fontSize: '20px' }}>🏢</span>
                <div style={{ lineHeight: 1.5 }}>
                  <span>
                    Fórmula de la Torre: <strong style={{ color: '#fff' }}>{info.total_pisos || 0} pisos</strong> × <strong style={{ color: '#fff' }}>{info.apartamentos_por_piso || 0} aptos/piso</strong> = <strong style={{ color: '#fff' }}>{(Number(info.total_pisos) || 0) * (Number(info.apartamentos_por_piso) || 0)} aptos regulares</strong>
                    {info.tiene_ph ? (
                      <> + <strong style={{ color: 'var(--color-accent, #f97316)' }}>1 piso PH con {info.total_ph || 0} departamentos</strong> = <strong style={{ color: '#fff', textDecoration: 'underline' }}>{info.total_apartamentos} departamentos en total</strong>.</>
                    ) : (
                      <> = <strong style={{ color: '#fff' }}>{info.total_apartamentos} departamentos en total</strong> (sin nivel Penthouse).</>
                    )}
                  </span>
                </div>
              </div>

              {/* Botón de Sincronización Manual */}
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={sincronizandoAptos}
                  onClick={handleSincronizarApartamentos}
                  style={{
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                    color: 'var(--color-accent, #f97316)',
                    border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.35))',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: sincronizandoAptos ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '15px' }}>{sincronizandoAptos ? '⏳' : '🔄'}</span>
                  {sincronizandoAptos ? 'Sincronizando Torre...' : 'Sincronizar Departamentos de la Torre'}
                </button>
              </div>
            </div>

            {/* Identidad de Color y Tema Principal */}
            <div style={{ marginTop: '24px', marginBottom: '28px', backgroundColor: '#181a20', border: '1px solid #282c37', borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '18px' }}>🎨</span>
                <div>
                  <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>Color de Marca del Edificio</h4>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>Elige el color temático principal. Toda la interfaz (botones, degradados y paneles de Residentes y Administrador) se adaptará automáticamente.</p>
                </div>
              </div>

              {/* Selector de Presets */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                {PRESET_THEME_COLORS.map(c => {
                  const isSelected = (info.color_primario || '#f97316').toLowerCase() === c.hex.toLowerCase()
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => handleColorChange(c.hex)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : '#101216',
                        border: isSelected ? `2px solid ${c.hex}` : '1px solid #282c37',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c.hex, boxShadow: `0 0 8px ${c.hex}60`, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: isSelected ? '#fff' : '#cbd5e1', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Selector libre con ColorPicker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '12px', backgroundColor: '#101216', borderRadius: '8px', border: '1px solid #282c37' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={info.color_primario || '#f97316'}
                    onChange={(e) => handleColorChange(e.target.value)}
                    style={{ width: '38px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'transparent' }}
                  />
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>Color personalizado</label>
                    <input
                      type="text"
                      value={info.color_primario || '#f97316'}
                      onChange={(e) => handleColorChange(e.target.value)}
                      placeholder="#f97316"
                      style={{ backgroundColor: 'transparent', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, width: '80px', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>Vista previa en vivo:</span>
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: generateThemePalette(info.color_primario).gradient,
                    color: '#fff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    boxShadow: generateThemePalette(info.color_primario).shadow
                  }}>
                    Botón de ejemplo
                  </div>
                </div>
              </div>
            </div>

            {/* Período de Transición y Administración */}
            <div style={{ marginTop: '24px', marginBottom: '28px', backgroundColor: '#181a20', border: '1px solid #282c37', borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '18px' }}>🏛️</span>
                <div>
                  <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>Período de la Administración y Transición</h4>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>
                    Configura cuándo asumió la administración actual y cuándo concluyó la administración anterior.
                    El sistema sincroniza automáticamente las alertas, silencia correos de meses anteriores y activa las emisiones regulares según estas fechas.
                  </p>
                </div>
              </div>

              <div className="admin-grid-2">
                <div style={groupStyle}>
                  <label style={labelStyle}>Fecha de Salida de la Última Administración</label>
                  <input
                    type="date"
                    name="fecha_fin_administracion_anterior"
                    value={info.fecha_fin_administracion_anterior || '2026-08-31'}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Hasta esta fecha se considera "Carga de Administración Anterior"</span>
                </div>

                <div style={groupStyle}>
                  <label style={{ ...labelStyle, color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>
                    Fecha de Entrada de la Administración Actual *
                  </label>
                  <input
                    type="date"
                    name="fecha_inicio_gestion"
                    value={info.fecha_inicio_gestion || '2026-09-01'}
                    onChange={handleChange}
                    style={{ ...inputStyle, borderColor: 'var(--color-accent, #f97316)' }}
                    required
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>A partir de esta fecha es la administración activa (emisiones regulares con correos)</span>
                </div>
              </div>

              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#93c5fd',
                lineHeight: 1.4
              }}>
                ℹ️ <strong>Sincronización del Sistema:</strong> Cualquier mes anterior a <strong>{info.fecha_inicio_gestion || '2026-09-01'}</strong> silenciará los correos masivos para evitar alarmar a los residentes y se marcará como período anterior. A partir de <strong>{info.fecha_inicio_gestion ? info.fecha_inicio_gestion.slice(0, 7) : '2026-09'}</strong> en adelante, las emisiones se gestionarán como la administración actual activa.
              </div>
            </div>

            {/* Datos Bancarios */}
            <h3 style={{ color: 'var(--color-accent, #f97316)', fontSize: '16px', marginTop: '32px', marginBottom: '16px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
              💳 Cuenta Bancaria para Pagos
            </h3>
            <div style={{ background: '#101010', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
              <div className="admin-grid-2">
                <div style={groupStyle}>
                  <label style={labelStyle}>Banco</label>
                  <input name="banco" value={info.banco} onChange={handleChange} style={inputStyle} placeholder="Ej: Banco Bicentenario" />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Cédula del Titular</label>
                  <input name="cedula_cuenta" value={info.cedula_cuenta} onChange={handleChange} style={inputStyle} placeholder="Ej: V-6089037" />
                </div>
              </div>
              <div className="admin-grid-2">
                <div style={groupStyle}>
                  <label style={labelStyle}>Tipo de Cuenta</label>
                  <input name="tipo_cuenta" value={info.tipo_cuenta} onChange={handleChange} style={inputStyle} placeholder="Ej: Corriente / Ahorro" />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Número de Cuenta</label>
                  <input name="cuenta_bancaria" value={info.cuenta_bancaria} onChange={handleChange} style={inputStyle} placeholder="Ej: 0175-0525-4100-7575-1351" />
                </div>
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>Titular de la Cuenta</label>
                <input name="titular_cuenta" value={info.titular_cuenta} onChange={handleChange} style={inputStyle} placeholder="Nombre completo del titular" />
              </div>
            </div>

            {/* Pago Móvil */}
            <h3 style={{ color: 'var(--color-accent, #f97316)', fontSize: '16px', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
              📱 Pago Móvil
            </h3>
            <div style={{ background: '#101010', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
              <div className="admin-grid-2">
                <div style={groupStyle}>
                  <label style={labelStyle}>Banco (Pago Móvil)</label>
                  <input name="pago_movil_banco" value={info.pago_movil_banco} onChange={handleChange} style={inputStyle} placeholder="Ej: Banco Bicentenario" />
                </div>
                <div style={groupStyle}>
                  <label style={labelStyle}>Cédula (Pago Móvil)</label>
                  <input name="pago_movil_cedula" value={info.pago_movil_cedula} onChange={handleChange} style={inputStyle} placeholder="Ej: V-6089037" />
                </div>
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>Número de Teléfono (Pago Móvil)</label>
                <input name="pago_movil_telefono" value={info.pago_movil_telefono} onChange={handleChange} style={inputStyle} placeholder="Ej: 0414-1234567" />
              </div>
            </div>

            {/* Zelle */}
            <h3 style={{ color: 'var(--color-accent, #f97316)', fontSize: '16px', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
              💵 Zelle
            </h3>
            <div style={{ background: '#101010', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' }}>
              <div style={groupStyle}>
                <label style={labelStyle}>Correo Electrónico Zelle</label>
                <input name="zelle_email" value={info.zelle_email} onChange={handleChange} style={inputStyle} placeholder="Ej: pagos@ejemplo.com" type="email" />
              </div>
            </div>

            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} style={{
                background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
                color: '#fff',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(249, 115, 22, 0.4))',
                transition: 'all 0.2s',
              }}>
                {saving ? '⏳ Guardando cambios...' : '💾 Guardar Configuración'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB 2: JUNTA DE CONDOMINIO Y ORGANIGRAMA ── */}
      {activeTab === 'organigrama' && (
        <div style={{ maxWidth: '1000px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Cargos y Miembros de la Junta
              </h2>
              <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0' }}>
                Define los roles del condominio. Aparecen automáticamente en el portal del residente con botones de llamada y WhatsApp.
              </p>
            </div>

            <button
              onClick={abrirModalNuevoMiembro}
              style={{
                background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%))',
                color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 20px',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: '8px', boxShadow: 'var(--color-brand-shadow, 0 4px 15px rgba(249, 115, 22, 0.35))'
              }}
            >
              <span>➕</span>
              <span>Crear Cargo / Agregar Integrante</span>
            </button>
          </div>

          {loadingJunta ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando organigrama...</div>
          ) : miembros.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px', backgroundColor: '#141414',
              borderRadius: '16px', border: '1px dashed #333', color: '#888'
            }}>
              No hay cargos creados en el organigrama. Haz clic en "Crear Cargo" para empezar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {miembros.map((m) => {
                const cat = CATEGORIA_ORGANIGRAMA_CONFIG[m.categoria]
                const waUrl = formatWhatsappUrl(m.telefono)

                return (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: '#141414', border: `1px solid ${cat.border}`,
                      borderLeft: `4px solid ${cat.color}`, borderRadius: '14px',
                      padding: '16px 20px', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: cat.bg, color: cat.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0
                      }}>
                        {cat.icono}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                            {m.nombre}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, color: cat.color,
                            background: cat.bg, border: `1px solid ${cat.border}`,
                            padding: '2px 8px', borderRadius: '6px'
                          }}>
                            {m.cargo}
                          </span>
                          {m.apartamento && (
                            <span style={{ fontSize: '11px', color: '#aaa', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                              📍 {m.apartamento}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          {m.telefono && <span>📞 {m.telefono}</span>}
                          {m.email && <span>✉️ {m.email}</span>}
                          {m.horario_atencion && <span>🕒 {m.horario_atencion}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)',
                            color: '#22c55e', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          WhatsApp
                        </a>
                      )}

                      <button
                        onClick={() => abrirModalEditarMiembro(m)}
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                          color: '#ccc', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                          cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        ✏️ Editar
                      </button>

                      <button
                        onClick={() => handleEliminarMiembro(m.id, m.nombre)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#ef4444', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL CREAR / EDITAR MIEMBRO ORGANIGRAMA */}
      {modalMiembroOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: '#141720', border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto',
            padding: '28px', boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                  {miembroEditar ? 'Editar Integrante del Organigrama' : 'Crear Cargo / Agregar Integrante'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
                  Especifica el nombre, rol oficial y datos de contacto directo.
                </p>
              </div>
              <button
                onClick={() => setModalMiembroOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarMiembro} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="admin-grid-2">
                <div>
                  <label style={labelStyle}>Nombre Completo *</label>
                  <input
                    required
                    placeholder="Ej: Dohuglas Guevara"
                    value={formNombre}
                    onChange={e => setFormNombre(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cargo Oficial *</label>
                  <input
                    required
                    placeholder="Ej: Administrador / Presidente / Tesorero"
                    value={formCargo}
                    onChange={e => setFormCargo(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="admin-grid-2">
                <div>
                  <label style={labelStyle}>Categoría Jerárquica</label>
                  <select
                    value={formCategoria}
                    onChange={e => setFormCategoria(e.target.value as CategoriaOrganigrama)}
                    style={inputStyle}
                  >
                    <option value="administracion">💼 Administración</option>
                    <option value="junta_directiva">🏛️ Junta Directiva</option>
                    <option value="comite_vocal">🤝 Comité o Vocal</option>
                    <option value="operativo">🛠️ Personal Operativo</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Apartamento / Ubicación</label>
                  <input
                    placeholder="Ej: Apto 501 / Oficina PB / Externo"
                    value={formApto}
                    onChange={e => setFormApto(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="admin-grid-2">
                <div>
                  <label style={labelStyle}>Teléfono de Contacto / WhatsApp</label>
                  <input
                    placeholder="Ej: 0414-1234567"
                    value={formTelefono}
                    onChange={e => setFormTelefono(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Correo Electrónico</label>
                  <input
                    type="email"
                    placeholder="Ej: contacto@torre5.com"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Horario o Disponibilidad de Atención</label>
                <input
                  placeholder="Ej: Lunes a Viernes 8:00 AM - 5:00 PM / Emergencias 24/7"
                  value={formHorario}
                  onChange={e => setFormHorario(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Descripción de Funciones / Responsabilidad</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cobranza, emisión de recibos y mantenimiento de bombas..."
                  value={formDescripcionRol}
                  onChange={e => setFormDescripcionRol(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalMiembroOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#ccc', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%))',
                    color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {miembroEditar ? 'Guardar Cambios' : 'Crear Cargo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
