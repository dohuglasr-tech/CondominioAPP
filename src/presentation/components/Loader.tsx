import React from 'react'
import { Skeleton, SkeletonCard, SkeletonTable } from './Skeleton'

export function Loader() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#070b14',
      padding: '32px',
      maxWidth: '1280px',
      margin: '0 auto',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Skeleton Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width="220px" height="26px" borderRadius="8px" />
          <Skeleton width="140px" height="14px" borderRadius="6px" />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Skeleton width="110px" height="36px" borderRadius="8px" />
        </div>
      </div>

      {/* Skeleton Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Skeleton Content */}
      <div style={{
        backgroundColor: '#141414',
        border: '1px solid #1e1e1e',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width="180px" height="20px" />
          <Skeleton width="80px" height="14px" />
        </div>
        <SkeletonTable rows={5} columns={5} />
      </div>
    </div>
  )
}
