import React from 'react'
import { formatAlicuotaPct } from '../../../utils/alicuota'

interface DashboardSideCardsProps {
  estaSolvente: boolean
  aptoNumero: string | number
  esPenthouse: boolean
  alicuota: number | string | null | undefined
  onOpenSolvencia: () => void
  onNavigate: (path: string) => void
}

export const DashboardSideCards = React.memo<DashboardSideCardsProps>(({
  estaSolvente,
  aptoNumero,
  esPenthouse,
  alicuota,
  onOpenSolvencia,
  onNavigate
}) => {
  return (
    <div className="bento-col-side">
      {estaSolvente && (
        <div
          className="desktop-card"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.18) 0%, rgba(15, 23, 42, 0.9) 100%)',
            border: '1.5px solid rgba(34, 197, 94, 0.45)',
            boxShadow: '0 8px 24px rgba(34, 197, 94, 0.15)'
          }}
          onClick={onOpenSolvencia}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              color: '#4ade80',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px'
            }}>
              📜
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                  Carta de Solvencia
                </span>
                <span style={{
                  fontSize: '10.5px', fontWeight: 800,
                  backgroundColor: 'rgba(34, 197, 94, 0.25)', color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  padding: '1px 8px', borderRadius: '999px'
                }}>
                  ✓ 100% Solvente
                </span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                Constancia oficial de condominio y gas · Clic para ver y descargar
              </div>
            </div>
            <span style={{ color: '#4ade80', fontSize: '18px', fontWeight: 800 }}>📥</span>
          </div>
        </div>
      )}

      <div
        className="desktop-card"
        style={{ cursor: 'pointer', border: '1px solid rgba(249, 115, 22, 0.25)' }}
        onClick={() => onNavigate('/normas')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            color: 'var(--color-accent, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            📜
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
              Normas de Convivencia
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Reglamento interno oficial y descarga en PDF
            </div>
          </div>
          <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div
        className="desktop-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onNavigate('/junta')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#60a5fa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            👥
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
              Junta de Condominio
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Organigrama, cargos y teléfonos de contacto directo
            </div>
          </div>
          <span style={{ color: '#60a5fa', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div
        className="desktop-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onNavigate('/mora')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            color: '#c084fc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            ⚖️
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                Lista de Mora
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 800,
                backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe',
                padding: '1px 7px', borderRadius: '999px'
              }}>
                &gt;3 Meses
              </span>
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Transparencia comunitaria y tasas de riesgo
            </div>
          </div>
          <span style={{ color: '#c084fc', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div
        className="desktop-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onNavigate('/chat')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            color: '#22d3ee',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            💬
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
              Chat Comunitario
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Conversa en vivo con vecinos y administración
            </div>
          </div>
          <span style={{ color: '#22d3ee', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div
        className="desktop-card"
        style={{ cursor: 'pointer' }}
        onClick={() => onNavigate('/reportes')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#fbbf24',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            🛠️
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
              Reportar Avería o Incidencia
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Notifica fallas de ascensor, agua, luz o áreas comunes
            </div>
          </div>
          <span style={{ color: '#fbbf24', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div
        className="desktop-card"
        style={{ cursor: 'pointer', border: '1px solid rgba(56, 189, 248, 0.25)' }}
        onClick={() => onNavigate('/locales')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#38bdf8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px'
          }}>
            🏢
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>
              Locales y Espacios
            </div>
            <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
              Locales en uso, cuotas mensuales y solvencia comunitaria
            </div>
          </div>
          <span style={{ color: '#38bdf8', fontSize: '18px' }}>→</span>
        </div>
      </div>

      <div className="desktop-card" style={{ backgroundColor: '#101217' }}>
        <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>
          INFORMACIÓN DEL INMUEBLE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>Apartamento:</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>Apto {aptoNumero}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>Tipo de Inmueble:</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{esPenthouse ? 'Penthouse (PH)' : 'Apartamento Estándar'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>Alícuota Legal:</span>
            <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>{formatAlicuotaPct(alicuota)}</span>
          </div>
        </div>
      </div>
    </div>
  )
})
