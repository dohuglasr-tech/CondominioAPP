import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { appCache } from './cacheService'
import { consultarTasaBcvEnVivo, sincronizarTasaBcvConApi } from './bcvService'

export interface BcvRateState {
  rate: number
  lastUpdate: string
  loading: boolean
  syncing: boolean
  error: string | null
  refresh: (forceApi?: boolean) => Promise<{ ok: boolean; rate: number; error?: string }>
}

export function useBcvRate(): BcvRateState {
  const [data, setData] = useState<Omit<BcvRateState, 'refresh'>>({
    rate: 866.56, // Tasa BCV Oficial de referencia
    lastUpdate: new Date().toISOString(),
    loading: true,
    syncing: false,
    error: null,
  })

  const fetchRate = useCallback(async (forceApi = false) => {
    try {
      if (forceApi) {
        setData(prev => ({ ...prev, syncing: true, error: null }))
        const res = await sincronizarTasaBcvConApi('Sistema Automático', 'Sincronización en vivo de tasa BCV')
        if (res.ok && res.tasa > 1) {
          setData({
            rate: res.tasa,
            lastUpdate: res.fecha,
            loading: false,
            syncing: false,
            error: null
          })
          return { ok: true, rate: res.tasa }
        }
      }

      // Si no es forzado o falló, usar caché o base de datos local
      const rateData = await appCache.fetch(
        'tasa_bcv_oficial',
        async () => {
          // 1. Prioridad: Consultar Supabase (la tasa oficial registrada para el condominio)
          try {
            const { data: configData } = await supabase
              .from('configuracion_edificio')
              .select('tasa_bcv_actual, tasa_bcv_actualizada')
              .limit(1)
              .maybeSingle()

            if (configData?.tasa_bcv_actual && Number(configData.tasa_bcv_actual) > 1) {
              return {
                rate: Number(configData.tasa_bcv_actual),
                lastUpdate: configData.tasa_bcv_actualizada || new Date().toISOString(),
              }
            }
          } catch {}

          // 2. Fallback de emergencia: Solo si la base de datos no tiene tasa configurada
          try {
            const apiRes = await consultarTasaBcvEnVivo()
            if (apiRes && apiRes.tasa > 1) {
              return {
                rate: apiRes.tasa,
                lastUpdate: apiRes.fechaActualizacion
              }
            }
          } catch {}

          return {
            rate: 866.56,
            lastUpdate: new Date().toISOString(),
          }
        },
        { ttlMs: 15 * 60 * 1000, tags: ['tasa_bcv', 'config'], forceRefresh: forceApi, persistSession: true }
      )

      setData({
        rate: rateData.rate,
        lastUpdate: rateData.lastUpdate,
        loading: false,
        syncing: false,
        error: null,
      })
      return { ok: true, rate: rateData.rate }
    } catch (err: any) {
      setData((prev) => ({ ...prev, loading: false, syncing: false, error: err.message }))
      return { ok: false, rate: 866.56, error: err.message }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    fetchRate(false).then(() => {
      if (!mounted) return
    })

    return () => {
      mounted = false
    }
  }, [fetchRate])

  return {
    ...data,
    refresh: fetchRate,
  }
}
