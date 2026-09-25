import React, { useState, useRef } from 'react'

export const AdminEdificio: React.FC = () => {
  const [info, setInfo] = useState({
    nombre: 'Torre 5',
    rif: 'J-12345678-9',
    direccion: 'Av. Principal, Urb. La Arboleda',
    cantidadApartamentos: 24,
    telefonoContacto: '0414-1234567',
    emailContacto: 'administracion@torre5.com',
    banco: 'Banco Mercantil',
    cuenta: '0105-0000-0000-0000-0000',
    titular: 'Junta de Condominio Torre 5'
  })

  const [saving, setSaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo({ ...info, [e.target.name]: e.target.value })
  }

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen (PNG, JPG, SVG, etc.)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no puede superar los 2 MB.')
      return
    }
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setLogoPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
    // Reset input so same file can be re-selected
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // En producción: subir logoFile a Supabase Storage y guardar URL
    // const { data, error } = await supabase.storage.from('logos').upload(`edificio/${Date.now()}`, logoFile!)
    setTimeout(() => {
      setSaving(false)
      alert('Información del edificio actualizada correctamente' + (logoFile ? ` (Logo: ${logoFile.name})` : ''))
    }, 1000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a',
    color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box'
  }
  const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '13px', marginBottom: '6px' }
  const groupStyle: React.CSSProperties = { marginBottom: '16px' }

  return (
    <div style={{ padding: '32px 16px', height: '100%', overflowY: 'auto' }}>
      <style>{`
        .admin-grid-2 {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
        }
        @media (max-width: 768px) {
          .admin-grid-2 { grid-template-columns: 1fr; gap: 0px; }
        }
        .logo-drop-zone {
          transition: border-color 0.2s, background-color 0.2s;
        }
        .logo-drop-zone:hover {
          border-color: #f97316 !important;
          background-color: rgba(249, 115, 22, 0.05) !important;
        }
      `}</style>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>🏢 Información del Edificio</h1>
        <p style={{ color: '#666', fontSize: '14px', margin: '4px 0 0 0' }}>Configuración base para recibos y comunicaciones</p>
      </div>

      <div style={{ maxWidth: '800px', backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px', boxSizing: 'border-box' }}>
        <form onSubmit={handleSave}>

          {/* ── Logo Section ── */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '20px', marginBottom: '32px', borderBottom: '1px solid #2a2a2a', paddingBottom: '24px', flexWrap: 'wrap' }}>
            
            {/* Drop zone / preview */}
            <div
              className="logo-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                width: '100px', height: '100px', flexShrink: 0,
                backgroundColor: isDragging ? 'rgba(249, 115, 22, 0.1)' : '#1a1a1a',
                borderRadius: '16px',
                border: `2px dashed ${isDragging ? '#f97316' : logoPreview ? '#f9731680' : '#444'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', position: 'relative'
              }}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo del edificio"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '36px', userSelect: 'none' }}>🏢</span>
              )}
            </div>

            {/* Input file oculto */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Texto y botones */}
            <div>
              <h3 style={{ color: '#fff', margin: '0 0 4px 0' }}>Logo del Edificio</h3>
              <p style={{ color: '#888', fontSize: '12px', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                Recomendado: 512×512 px · PNG con fondo transparente<br />
                Máximo 2 MB · Arrastra o haz clic en el cuadro
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #3a3a3a',
                    padding: '7px 14px', borderRadius: '8px', fontSize: '13px',
                    cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {logoPreview ? '🔄 Cambiar imagen' : '📁 Seleccionar imagen'}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    style={{
                      backgroundColor: 'transparent', color: '#ef4444',
                      border: '1px solid #ef444440', padding: '7px 14px',
                      borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    🗑 Eliminar
                  </button>
                )}
              </div>
              {logoFile && (
                <p style={{ color: '#f97316', fontSize: '11px', marginTop: '8px', margin: '8px 0 0 0' }}>
                  ✅ {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </div>

          {/* ── Información General ── */}
          <div className="admin-grid-2">
            <div style={groupStyle}>
              <label style={labelStyle}>Nombre del Edificio / Condominio</label>
              <input name="nombre" value={info.nombre} onChange={handleChange} style={inputStyle} required />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>RIF</label>
              <input name="rif" value={info.rif} onChange={handleChange} style={inputStyle} required />
            </div>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Dirección Física</label>
            <input name="direccion" value={info.direccion} onChange={handleChange} style={inputStyle} required />
          </div>

          <div className="admin-grid-2">
            <div style={groupStyle}>
              <label style={labelStyle}>Teléfono de Contacto (Admin)</label>
              <input name="telefonoContacto" value={info.telefonoContacto} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Correo Electrónico (Admin)</label>
              <input type="email" name="emailContacto" value={info.emailContacto} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>Cantidad de Apartamentos</label>
            <input type="number" name="cantidadApartamentos" value={info.cantidadApartamentos} onChange={handleChange} style={inputStyle} required />
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
              <input name="cuenta" value={info.cuenta} onChange={handleChange} style={inputStyle} />
            </div>
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Titular de la Cuenta</label>
            <input name="titular" value={info.titular} onChange={handleChange} style={inputStyle} />
          </div>

          <div style={{ marginTop: '32px', textAlign: 'right' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: '#f97316', color: '#fff', border: 'none',
                padding: '12px 24px', borderRadius: '8px', fontSize: '14px',
                fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
