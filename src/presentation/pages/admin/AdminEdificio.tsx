import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../data/supabase'
import { useAuth } from '../../../application/contexts/AuthContext'

export const AdminEdificio: React.FC = () => {
  const { config, refreshConfig } = useAuth()

  const [info, setInfo] = useState({
    nombre_edificio: '',
    rif: '',
    direccion: '',
    total_apartamentos: 24,
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

  // Load existing config from Supabase on mount
  useEffect(() => {
    if (config) {
      setInfo({
        nombre_edificio: config.nombre_edificio || '',
        rif: config.rif || '',
        direccion: config.direccion || '',
        total_apartamentos: config.total_apartamentos || 24,
        telefono: config.telefono || '',
        email_contacto: config.email_contacto || '',
        banco: config.banco || '',
        cuenta_bancaria: config.cuenta_bancaria || '',
        titular_cuenta: config.titular_cuenta || '',
      })
      if (config.logo_url) setLogoPreview(config.logo_url)
    }
  }, [config])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen (PNG, JPG, SVG, etc.)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('La imagen no puede superar los 2 MB.')
      return
    }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      let logo_url = config?.logo_url || null

      // Upload new logo to Supabase Storage if there's a new file
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logos/edificio-logo.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('edificio-assets')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type })

        if (uploadError) {
          // If bucket doesn't exist yet, save logo as base64 fallback
          console.warn('Storage upload failed, using base64 fallback:', uploadError.message)
          logo_url = logoPreview
        } else {
          const { data: urlData } = supabase.storage
            .from('edificio-assets')
            .getPublicUrl(path)
          // Add cache-buster to force browsers to load new image
          logo_url = urlData.publicUrl + `?v=${Date.now()}`
        }
      } else if (logoPreview === null && config?.logo_url) {
        // User removed the logo
        logo_url = null
      }

      // Upsert into configuracion_edificio
      const { error: dbError } = await supabase
        .from('configuracion_edificio')
        .update({
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
        })
        .eq('id', (config as any)?.id)

      if (dbError) throw dbError

      // Update local preview with saved URL so it doesn't reset
      if (logo_url) setLogoPreview(logo_url)
      setLogoFile(null)

      // Refresh config in context so all layouts update immediately
      await refreshConfig()

      setSuccessMsg('✅ Información del edificio actualizada correctamente.')
    } catch (err: any) {
      setErrorMsg('Error al guardar: ' + (err.message || 'Intenta de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a',
    color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '13px', marginBottom: '6px' }
  const groupStyle: React.CSSProperties = { marginBottom: '16px' }

  return (
    <div style={{ padding: '32px 16px', height: '100%', overflowY: 'auto' }}>
      <style>{`
        .admin-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .admin-grid-2 { grid-template-columns: 1fr; gap: 0px; } }
        .logo-drop-zone { transition: border-color 0.2s, background-color 0.2s; }
        .logo-drop-zone:hover { border-color: #f97316 !important; background-color: rgba(249, 115, 22, 0.05) !important; }
      `}</style>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>🏢 Información del Edificio</h1>
        <p style={{ color: '#666', fontSize: '14px', margin: '4px 0 0 0' }}>
          Configuración base para recibos y comunicaciones · Los cambios se sincronizan en tiempo real
        </p>
      </div>

      {successMsg && (
        <div style={{ backgroundColor: '#10b98120', color: '#10b981', border: '1px solid #10b98140', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px' }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', marginBottom: '20px' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ maxWidth: '800px', backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px', boxSizing: 'border-box' }}>
        <form onSubmit={handleSave}>

          {/* ── Logo Section ── */}
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

          {/* ── Información General ── */}
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

          {/* ── Datos Bancarios ── */}
          <h3 style={{ color: '#f97316', fontSize: '16px', marginTop: '32px', marginBottom: '16px', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px' }}>
            Datos Bancarios (Para transferencias)
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
    </div>
  )
}
