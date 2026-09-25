import React from 'react'

export function Loader() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-screen gap-4">
      <div className="spinner spinner--lg"></div>
      <p className="text-sm text-secondary font-medium tracking-wide">Cargando...</p>
    </div>
  )
}
