import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { appCache } from './cacheService'

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
    error: null,
  })

  useEffect(() => {
    let mounted = true

    const fetchRateWithCache = async () => {
      try {
        const rateData = await appCache.fetch(
          'tasa_bcv_oficial',
          async () => {
            // 1. Consultar API oficial de DolarAPI (estable y con CORS habilitado)
            try {
              const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
                headers: { Accept: 'application/json' },
              })

              if (res.ok) {
                const json = await res.json()
                const tasa = Number(json?.promedio ?? json?.precio ?? json?.venta)
                if (tasa && !isNaN(tasa) && tasa > 1) {
                  // Sincronizar en segundo plano con configuracion_edificio en Supabase
                  supabase
                    .from('configuracion_edificio')
                    .update({
                      tasa_bcv_actual: tasa,
                      tasa_bcv_actualizada: json.fechaActualizacion || new Date().toISOString(),
                    })
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .then(() => {}, () => {})

                  return {
                    rate: tasa,
                    lastUpdate: json.fechaActualizacion || new Date().toISOString(),
                  }
                }
              }
            } catch {
              // Silencioso: fallback a Supabase
            }

            // 2. Fallback: Consultar la última tasa guardada en Supabase por la administración
            try {
              const { data: configData } = await supabase
                .from('configuracion_edificio')
                .select('tasa_bcv_actual, tasa_bcv_actualizada')
                .single()

              if (configData?.tasa_bcv_actual) {
                return {
                  rate: Number(configData.tasa_bcv_actual),
                  lastUpdate: configData.tasa_bcv_actualizada || new Date().toISOString(),
                }
              }
            } catch {
              // Continuar a fallback estático
            }

            return {
              rate: 859.06,
              lastUpdate: new Date().toISOString(),
            }
          },
          { ttlMs: 30 * 60 * 1000, tags: ['tasa_bcv', 'config'], persistSession: true }
        )

        if (mounted) {
          setData({
            rate: rateData.rate,
            lastUpdate: rateData.lastUpdate,
            loading: false,
            error: null,
          })
        }
      } catch (err: any) {
        if (mounted) {
          setData((prev) => ({ ...prev, loading: false, error: err.message }))
        }
      }
    }

    fetchRateWithCache()

    return () => {
      mounted = false
    }
  }, [])

  return data
}
