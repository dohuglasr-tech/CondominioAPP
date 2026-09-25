import React, { useEffect, useState } from 'react'

interface SplashScreenProps {
  logoUrl?: string | null
  buildingName?: string
  onDone: () => void
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ logoUrl, buildingName, onDone }) => {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 100)
    const t2 = setTimeout(() => setPhase('exit'), 2200)
    const t3 = setTimeout(() => onDone(), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  const name = buildingName || 'Mi Edificio'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, #1a0a00 0%, #0a0a0a 70%)',
      transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)',
      opacity: phase === 'exit' ? 0 : 1,
    }}>
      <style>{`
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.04); opacity: 0.85; }
        }
        @keyframes splash-ring {
          0%   { transform: scale(0.7); opacity: 0; }
          40%  { opacity: 0.25; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes splash-dots {
          0%, 80%, 100% { transform: scale(0); opacity: 0; }
          40%            { transform: scale(1); opacity: 1; }
        }
        .splash-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 24px;
          opacity: 0; transform: translateY(16px) scale(0.96);
          transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1),
                      transform 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        .splash-card.visible {
          opacity: 1; transform: translateY(0) scale(1);
        }
        .splash-logo-wrap {
          position: relative;
          width: 110px; height: 110px;
          display: flex; align-items: center; justify-content: center;
        }
        .splash-ring {
          position: absolute; inset: -12px;
          border-radius: 50%;
          border: 1.5px solid rgba(249,115,22,0.35);
          animation: splash-ring 2s ease-out infinite;
        }
        .splash-ring-2 {
          animation-delay: 0.7s;
        }
        .splash-logo-glass {
          width: 110px; height: 110px;
          border-radius: 32px;
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow:
            0 0 0 1px rgba(249,115,22,0.15),
            0 8px 32px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          animation: splash-pulse 2.5s ease-in-out infinite;
        }
        .splash-name {
          font-family: Inter, sans-serif;
          font-size: 22px; font-weight: 800;
          color: #ffffff; letter-spacing: -0.3px;
          text-align: center; max-width: 240px;
          text-shadow: 0 2px 12px rgba(249,115,22,0.3);
        }
        .splash-sub {
          font-family: Inter, sans-serif;
          font-size: 11px; font-weight: 600; letter-spacing: 2.5px;
          color: rgba(249,115,22,0.7); text-transform: uppercase;
          margin-top: -16px;
        }
        .splash-dots { display: flex; gap: 6px; }
        .splash-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #f97316;
          animation: splash-dots 1.2s ease-in-out infinite;
        }
        .splash-dot:nth-child(2) { animation-delay: 0.2s; }
        .splash-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div className={`splash-card ${phase === 'visible' || phase === 'exit' ? 'visible' : ''}`}>
        {/* Logo with liquid glass effect */}
        <div className="splash-logo-wrap">
          <div className="splash-ring" />
          <div className="splash-ring splash-ring-2" />
          <div className="splash-logo-glass">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="#f97316" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <line x1="9"  y1="7"  x2="9"  y2="7.01"/>
                <line x1="15" y1="7"  x2="15" y2="7.01"/>
                <line x1="9"  y1="11" x2="9"  y2="11.01"/>
                <line x1="15" y1="11" x2="15" y2="11.01"/>
                <path d="M9 16h6v6H9z"/>
              </svg>
            )}
          </div>
        </div>

        {/* Name */}
        <div style={{ textAlign: 'center' }}>
          <div className="splash-name">{name}</div>
          <div className="splash-sub">Sistema de Gestión</div>
        </div>

        {/* Loading dots */}
        <div className="splash-dots">
          <div className="splash-dot" />
          <div className="splash-dot" />
          <div className="splash-dot" />
        </div>
      </div>
    </div>
  )
}
