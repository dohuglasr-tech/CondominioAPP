import React from 'react'

export interface AuthHeroConfig {
  nombre_edificio?: string | null
  rif?: string | null
  direccion?: string | null
  logo_url?: string | null
  telefono?: string | null
}

interface AuthHeroPanelProps {
  config?: AuthHeroConfig | null
}

export const AuthHeroPanel: React.FC<AuthHeroPanelProps> = ({ config }) => {
  const nombreEdificio = config?.nombre_edificio || 'Residencias Ocutuy 5'
  const logoUrl = config?.logo_url || null
  const rif = config?.rif || null
  const direccion = config?.direccion || null

  return (
    <div
      style={{
        flex: '1 1 50%',
        minHeight: '100%',
        background: 'linear-gradient(145deg, #f97316 0%, #ea580c 45%, #c2410c 100%)',
        padding: '52px 48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Círculos decorativos sutiles de fondo */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-15%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 70%)',
        pointerEvents: 'none'
      }} />

      {/* ── 1. HEADER: Logo + Nombre del Edificio montado por el Admin ── */}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {logoUrl ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '8px 14px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                maxWidth: '220px',
              }}
            >
              <img
                src={logoUrl}
                alt={nombreEdificio}
                style={{ maxHeight: '42px', maxWidth: '180px', objectFit: 'contain', display: 'block' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255,255,255,0.22)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }}
            >
              🏢
            </div>
          )}

          <div>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 900,
              margin: 0,
              letterSpacing: '-0.3px',
              textTransform: 'uppercase',
              textShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}>
              {nombreEdificio}
            </h2>
            <p style={{
              fontSize: '11px',
              fontWeight: 700,
              margin: '3px 0 0',
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.8px',
              textTransform: 'uppercase'
            }}>
              JUNTA DE CONDOMINIO {rif ? `· ${rif}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. HERO CONTENT: Titular y 3 Bullets de Beneficios ── */}
      <div style={{ position: 'relative', zIndex: 2, margin: 'auto 0' }}>
        <h1 style={{
          fontSize: 'clamp(28px, 3.8vw, 44px)',
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: '-1px',
          margin: '0 0 16px',
          textShadow: '0 2px 8px rgba(0,0,0,0.25)'
        }}>
          Tu condominio,<br />en tu bolsillo.
        </h1>

        <p style={{
          fontSize: '15px',
          lineHeight: 1.55,
          color: 'rgba(255,255,255,0.92)',
          maxWidth: '480px',
          margin: '0 0 36px',
          fontWeight: 400
        }}>
          Gestiona tus recibos, reporta pagos al instante, consulta gastos y mantente al día con la administración de {nombreEdificio}.
        </p>

        {/* 3 Bullets con iconos redondeados estilo imagen de referencia */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '480px' }}>
          
          {/* Bullet 1 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0
            }}>
              📈
            </div>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, margin: 0 }}>
                Solvencia y Pagos en tiempo real
              </h4>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>
                Reporta transferencias en Bs o $, consulta la tasa oficial BCV y recibe confirmación digital.
              </p>
            </div>
          </div>

          {/* Bullet 2 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0
            }}>
              🧾
            </div>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, margin: 0 }}>
                Tus recibos y cuentas claras
              </h4>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>
                Desglose detallado de gastos comunes, alícuotas según apartamento y fondo de reserva.
              </p>
            </div>
          </div>

          {/* Bullet 3 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0
            }}>
              🛡️
            </div>
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, margin: 0 }}>
                Seguridad y comunidad primero
              </h4>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>
                Acceso exclusivo para residentes validados por apartamento y reportes comunitarios.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── 3. FOOTER: Copyright e Información ── */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: '36px', fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
        <div>
          © 2026 {nombreEdificio}. Todos los derechos reservados.
        </div>
        {direccion && (
          <div style={{ marginTop: '2px', opacity: 0.85 }}>
            📍 {direccion}
          </div>
        )}
      </div>
    </div>
  )
}
