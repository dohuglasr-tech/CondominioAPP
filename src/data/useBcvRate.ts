import { useState, useEffect } from 'react'
import { supabase } from './supabase'

interface BcvRate {
  rate: number
  lastUpdate: string
  loading: boolean
  error: string | null
}

export function useBcvRate() {
  const [data, setData] = useState<BcvRate>({
    rate: 859.06, // Tasa BCV Oficial de referencia
    lastUpdate: new Date().toISOString(),
    loading: true,
    error: null
  })

  useEffect(() => {
    let mounted = true

    const fetchRate = async () => {
      try {
        // 1. Consultar API oficial de DolarAPI (estable y con CORS habilitado)
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
          headers: { 'Accept': 'application/json' },
        })
        
        if (res.ok) {
          const json = await res.json()
          const tasa = Number(json?.promedio ?? json?.precio ?? json?.venta)
          if (mounted && tasa && !isNaN(tasa) && tasa > 1) {
            setData({
              rate: tasa,
              lastUpdate: json.fechaActualizacion || new Date().toISOString(),
              loading: false,
              error: null
            })

            // Sincronizar en segundo plano con configuracion_edificio en Supabase
            supabase
              .from('configuracion_edificio')
              .update({
                tasa_bcv_actual: tasa,
                tasa_bcv_actualizada: json.fechaActualizacion || new Date().toISOString()
              })
              .neq('id', '00000000-0000-0000-0000-000000000000')
              .then(() => {}, () => {})

            return
          }
        }
      } catch (err) {
        // Silencioso: intentamos fallback a la base de datos de Supabase
      }

      // 2. Fallback: Consultar la última tasa guardada en Supabase por la administración
      try {
        const { data: configData } = await supabase
          .from('configuracion_edificio')
          .select('tasa_bcv_actual, tasa_bcv_actualizada')
          .single()

        if (mounted && configData?.tasa_bcv_actual) {
          setData({
            rate: Number(configData.tasa_bcv_actual),
            lastUpdate: configData.tasa_bcv_actualizada || new Date().toISOString(),
            loading: false,
            error: null
          })
          return
        }
      } catch {
        // Continuar a fallback estático
      }

      if (mounted) {
        setData(prev => ({ ...prev, loading: false }))
      }
    }

    fetchRate()

    return () => {
      mounted = false
    }
  }, [])

  return data
}
