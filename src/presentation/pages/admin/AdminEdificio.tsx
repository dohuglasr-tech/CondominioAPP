import React, { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../../data/supabase'
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
    telefono: '',
    email_contacto: '',
    banco: '',
    cuenta_bancaria: '',
    titular_cuenta: '',
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
        telefono: config.telefono || '',
        email_contacto: config.email_contacto || '',
        banco: config.banco || '',
        cuenta_bancaria: config.cuenta_bancaria || '',
        titular_cuenta: config.titular_cuenta || '',
      })
      if (config.logo_url) setLogoPreview(config.logo_url)
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
  }, [cargarJunta])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo(prev => ({ ...prev, [e.target.name]: e.target.value }))
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
        total_apartamentos: Number(info.total_apartamentos),
        telefono: info.telefono,
        email_contacto: info.email_contacto,
        banco: info.banco,
        cuenta_bancaria: info.cuenta_bancaria,
        titular_cuenta: info.titular_cuenta,
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

      await refreshConfig()
      setSuccessMsg('✅ Información del edificio actualizada correctamente.')
    } catch (err: any) {
      setErrorMsg('Error al guardar: ' + (err.message || 'Intenta de nuevo.'))
    } finally {
      setSaving(false)
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

    await guardarMiembroJunta(payload)
    setModalMiembroOpen(false)
    cargarJunta()
  }

  const handleEliminarMiembro = async (id: string, nombre: string) => {
    if (window.confirm(`¿Estás seguro de eliminar a ${nombre} del organigrama?`)) {
      await eliminarMiembroJunta(id)
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
        .logo-drop-zone:hover { border-color: #f97316 !important; background-color: rgba(249, 115, 22, 0.05) !important; }
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
            background: activeTab === 'edificio' ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
            border: activeTab === 'edificio' ? '1px solid #f97316' : '1px solid transparent',
            color: activeTab === 'edificio' ? '#f97316' : '#888',
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
            background: activeTab === 'organigrama' ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
            border: activeTab === 'organigrama' ? '1px solid #f97316' : '1px solid transparent',
            color: activeTab === 'organigrama' ? '#f97316' : '#888',
            padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.18s'
          }}
        >
          <span>👥</span>
          <span>Junta de Condominio y Organigrama</span>
          <span style={{
            background: activeTab === 'organigrama' ? '#f97316' : 'rgba(255,255,255,0.1)',
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
                  backgroundColor: isDragging ? 'rgba(249, 115, 22, 0.1)' : '#1a1a1a',
                  borderRadius: '20px',
                  border: `2px dashed ${isDragging ? '#f97316' : logoPreview ? '#f9731680' : '#444'}`,
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
                  <p style={{ color: '#f97316', fontSize: '11px', marginTop: '8px', margin: '8px 0 0 0' }}>
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

            <div style={groupStyle}>
              <label style={labelStyle}>Cantidad de Apartamentos</label>
              <input type="number" name="total_apartamentos" value={info.total_apartamentos} onChange={handleChange} style={inputStyle} required />
            </div>

            {/* Datos Bancarios */}
            <h3 style={{ color: '#f97316', fontSize: '16px', marginTop: '32px', marginBottom: '16px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
              Datos Bancarios (Para transferencias de recibos)
            </h3>
            <div className="admin-grid-2">
              <div style={groupStyle}>
                <label style={labelStyle}>Banco</label>
                <input name="banco" value={info.banco} onChange={handleChange} style={inputStyle} />
              </div>
              <div style={groupStyle}>
                <label style={labelStyle}>Número de Cuenta</label>
                <input name="cuenta_bancaria" value={info.cuenta_bancaria} onChange={handleChange} style={inputStyle} />
              </div>
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Titular de la Cuenta</label>
              <input name="titular_cuenta" value={info.titular_cuenta} onChange={handleChange} style={inputStyle} />
            </div>

            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} style={{
                backgroundColor: saving ? '#a3520a' : '#f97316', color: '#fff', border: 'none',
                padding: '12px 28px', borderRadius: '8px', fontSize: '14px',
                fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
              }}>
                {saving ? '⏳ Guardando...' : '💾 Guardar Cambios'}
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
                background: 'linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%)',
                color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 20px',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(249, 115, 22, 0.35)'
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
              {miembros.map((m, idx) => {
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
                    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 60%, #ea580c 100%)',
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
