import { useState, useEffect } from 'react'

interface BcvRate {
  rate: number
  lastUpdate: string
  loading: boolean
  error: string | null
}

export function useBcvRate() {
  const [data, setData] = useState<BcvRate>({
    rate: 37.50, // Fallback rate
    lastUpdate: new Date().toISOString(),
    loading: true,
    error: null
  })

  useEffect(() => {
    let mounted = true

    const fetchRate = async () => {
      try {
        // Intentamos primero con una API que raspa directamente la página del BCV para mayor precisión
        const res = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=bcv')
        if (!res.ok) throw new Error('Error de red')
        
        const json = await res.json()
        
        // Formato de pydolarvenezuela
        if (mounted && json && json.monitors && json.monitors.usd) {
          setData({
            rate: json.monitors.usd.price,
            lastUpdate: json.monitors.usd.last_update || new Date().toISOString(),
            loading: false,
            error: null
          })
        }
      } catch (err: any) {
        // Fallback a DolarAPI si falla la primera
        try {
          const resFallback = await fetch('https://ve.dolarapi.com/v1/dolares/oficial')
          const jsonFallback = await resFallback.json()
          
          if (mounted && jsonFallback && jsonFallback.promedio) {
            setData({
              rate: jsonFallback.promedio,
              lastUpdate: jsonFallback.fechaActualizacion || new Date().toISOString(),
              loading: false,
              error: null
            })
          }
        } catch (fallbackErr: any) {
          if (mounted) {
            setData(prev => ({ ...prev, loading: false, error: fallbackErr.message }))
          }
        }
      }
    }

    fetchRate()

    return () => {
      mounted = false
    }
  }, [])

  return data
}
