import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  style?: React.CSSProperties
  className?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  borderRadius = '8px',
  style,
  className = ''
}) => {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        boxSizing: 'border-box',
        ...style
      }}
    />
  )
}

/** Esqueleto para tarjetas de métricas / KPI */
export const SkeletonCard: React.FC<{ height?: string | number }> = ({ height = '130px' }) => {
  return (
    <div
      style={{
        backgroundColor: '#141414',
        border: '1px solid #1e1e1e',
        borderRadius: '14px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height,
        justifyContent: 'space-between',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="34px" height="34px" borderRadius="10px" />
        <Skeleton width="55px" height="18px" borderRadius="999px" />
      </div>
      <div>
        <Skeleton width="45%" height="12px" style={{ marginBottom: '8px' }} />
        <Skeleton width="75%" height="24px" />
      </div>
      <Skeleton width="50%" height="12px" />
    </div>
  )
}

/** Esqueleto para elementos de lista o transacciones recientes */
export const SkeletonListItem: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        backgroundColor: '#0a0a0a',
        border: '1px solid #1e1e1e',
        borderRadius: '12px',
        gap: '12px',
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <Skeleton width="38px" height="38px" borderRadius="10px" style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <Skeleton width="45%" height="14px" />
          <Skeleton width="30%" height="11px" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Skeleton width="90px" height="18px" borderRadius="6px" />
        <Skeleton width="70px" height="22px" borderRadius="999px" />
      </div>
    </div>
  )
}

/** Esqueleto para filas de tablas */
export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 6 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', gap: '12px', padding: '10px 12px', borderBottom: '1px solid #222' }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height="14px" width={`${100 / columns}%`} />
        ))}
      </div>
      {/* Filas */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'flex',
            gap: '12px',
            padding: '12px',
            backgroundColor: r % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
            borderBottom: '1px solid #1a1a1a',
            alignItems: 'center'
          }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} height="16px" width={`${100 / columns}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Esqueleto para bloques de gráficos / charts */
export const SkeletonChart: React.FC<{ height?: string | number; title?: string }> = ({ height = '220px', title }) => {
  return (
    <div
      style={{
        backgroundColor: '#141414',
        border: '1px solid #222',
        borderRadius: '14px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        height,
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={title ? '50%' : '35%'} height="16px" />
        <Skeleton width="25%" height="12px" />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton width="100%" height="100%" borderRadius="10px" />
      </div>
    </div>
  )
}
