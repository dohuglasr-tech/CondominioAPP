import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import {
  obtenerGasServicioData,
  calcularMetricasGas,
  obtenerDeudaGasApartamento,
  reportarPagoGasResidente,
  GasServicioData
} from '../../data/gasService'

export const GasResidente: React.FC = () => {
  const { perfil } = useAuth()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<GasServicioData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [copiedBank, setCopiedBank] = useState<boolean>(false)
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Modal Reporte de Pago
  const [modalReportarOpen, setModalReportarOpen] = useState<boolean>(false)
  const [guardandoReporte, setGuardandoReporte] = useState<boolean>(false)
  const [formReporte, setFormReporte] = useState({
    monto: '',
    moneda: 'BS' as 'BS' | 'USD',
    metodoPago: 'pago_movil' as 'pago_movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd' | 'otro',
    referencia: '',
    fechaPago: new Date().toISOString().slice(0, 10),
    observaciones: ''
  })

  const p = perfil as any
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || ''
  const apartamentoId = p?.apartamento_id || p?.apartamento?.id || ''

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await obtenerGasServicioData()
        setData(res.data)
      } catch (e) {
        console.error('Error cargando datos de gas:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const metricas = useMemo(() => {
    if (!data) return null
    return calcularMetricasGas(data)
  }, [data])

  const miDeuda = useMemo(() => {
    if (!data) return null
    return obtenerDeudaGasApartamento(data, apartamentoId, aptoNumero)
  }, [data, apartamentoId, aptoNumero])

  // Abrir modal automáticamente si vino desde el Dashboard con ?reportar=1
  useEffect(() => {
    if (searchParams.get('reportar') === '1' && miDeuda && miDeuda.tieneDeuda) {
      setFormReporte({
        monto: miDeuda.monedaPrincipal === 'BS' ? miDeuda.montoBs.toFixed(2) : miDeuda.montoUsd.toFixed(2),
        moneda: miDeuda.monedaPrincipal,
        metodoPago: 'pago_movil',
        referencia: '',
        fechaPago: new Date().toISOString().slice(0, 10),
        observaciones: ''
      })
      setModalReportarOpen(true)
    }
  }, [searchParams, miDeuda])

  const handleEnviarReportePago = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!miDeuda?.campanaId) {
      showToast('No hay una campaña de gas activa para reportar pago')
      return
    }
    const montoNum = parseFloat(formReporte.monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast('Introduce un monto válido mayor a 0')
      return
    }
    if (['pago_movil', 'transferencia'].includes(formReporte.metodoPago) && !formReporte.referencia.trim()) {
      showToast('Por favor escribe la referencia del comprobante')
      return
    }

    setGuardandoReporte(true)
    try {
      const res = await reportarPagoGasResidente({
        jornadaId: miDeuda.campanaId,
        apartamentoId,
        apartamentoNumero: aptoNumero,
        monto: montoNum,
        moneda: formReporte.moneda,
        metodoPago: formReporte.metodoPago,
        referencia: formReporte.referencia.trim(),
        fechaPago: formReporte.fechaPago,
        observaciones: formReporte.observaciones.trim(),
        tasaBcv: data?.config.tasaBcv || 859.06
      })

      if (res.success && res.data) {
        setData(res.data)
        setModalReportarOpen(false)
        showToast('¡Pago de gas registrado exitosamente! Gracias por tu reporte.')
      } else {
        showToast(res.error || 'Error registrando el pago')
      }
    } catch (err: any) {
      showToast(err.message || 'Error al procesar el reporte')
    } finally {
      setGuardandoReporte(false)
    }
  }

  const copyBankData = () => {
    if (!data) return
    const d = data.config.datosPago
    const text = `DATOS PAGO MÓVIL GAS:\nBanco: ${d.banco}\nTeléfono: ${d.telefono}\nRIF/CI: ${d.rifCedula}\nTitular: ${d.titular}\nConcepto: Gas Apto ${aptoNumero || ''}`
    navigator.clipboard.writeText(text)
    setCopiedBank(true)
    setTimeout(() => setCopiedBank(false), 3000)
  }

  const copyBsAmount = () => {
    if (!miDeuda) return
    navigator.clipboard.writeText(miDeuda.montoBs.toFixed(2))
    setCopiedAmount(true)
    setTimeout(() => setCopiedAmount(false), 2500)
  }

  if (loading) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: '#a1a1aa',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: '36px', marginBottom: '14px' }}>⛽</div>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>Consultando estado del gas comunal...</div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>Sincronizando nivel del tanque y cuotas del edificio</div>
      </div>
    )
  }

  const isSolvente = miDeuda ? !miDeuda.tieneDeuda : true
  const datosPago = data?.config.datosPago
  const esDeudaBs = miDeuda?.monedaPrincipal === 'BS'

  return (
    <div style={{
      maxWidth: '780px',
      margin: '0 auto',
      padding: '16px 16px 80px',
      color: '#f4f4f5',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* HEADER / TITULAR */}
      <div style={{ marginBottom: '20px', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '24px' }}>⛽</span>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.4px' }}>
            Servicio de Gas Comunal
          </h1>
        </div>
        <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
          Tanque central, estado de recargas y cuota comunitaria independiente del recibo de condominio.
        </p>
      </div>

      {/* ── CARD PRINCIPAL: ESTADO PERSONAL DEL APARTAMENTO ────────── */}
      <div style={{
        background: isSolvente
          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, var(--color-bg-card, #12141a) 100%)'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, var(--color-bg-card, #12141a) 100%)',
        border: `1px solid ${isSolvente ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.4)'}`,
        borderRadius: '20px',
        padding: '22px',
        marginBottom: '20px',
        boxShadow: isSolvente
          ? '0 10px 30px rgba(34, 197, 94, 0.08)'
          : '0 10px 30px rgba(239, 68, 68, 0.12)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Badge superior */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            color: '#a1a1aa'
          }}>
            {aptoNumero ? `APARTAMENTO ${aptoNumero}` : 'ESTADO DE CUENTA DE GAS'}
          </span>

          <span style={{
            backgroundColor: isSolvente ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: isSolvente ? '#22c55e' : '#ef4444',
            border: `1px solid ${isSolvente ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>{isSolvente ? '✅' : '⚠️'}</span>
            <span>{isSolvente ? 'AL DÍA CON EL GAS' : 'CUOTA PENDIENTE'}</span>
          </span>
        </div>

        {/* Mensaje de Estado */}
        {isSolvente ? (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
              {(!miDeuda?.campanaTitulo || (miDeuda.montoBs === 0 && miDeuda.montoUsd === 0))
                ? 'No hay cuotas de gas pendientes actualmente'
                : 'Tu apartamento está solvente con el gas'}
            </div>
            <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '0 0 14px', lineHeight: 1.5 }}>
              {(!miDeuda?.campanaTitulo || (miDeuda.montoBs === 0 && miDeuda.montoUsd === 0))
                ? 'Tu apartamento se encuentra al día. Cuando la administración asigne una cuota ordinaria o cuota especial para la recarga del tanque, podrás verla aquí y recibirás un correo informativo.'
                : `La cuota para la jornada actual (${miDeuda?.campanaTitulo || 'Recaudación de Gas'}) se encuentra al día. ¡Gracias por tu puntualidad vecinal!`}
            </p>

            {miDeuda?.detallePago?.referencia && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#d4d4d8'
              }}>
                <span>Referencia registrada: <b style={{ color: '#fff' }}>{miDeuda.detallePago.referencia}</b></span>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>
                  {miDeuda.detallePago.metodoPago === 'pago_movil' ? 'Pago Móvil' : miDeuda.detallePago.metodoPago || 'Verificado'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Si es cuota especial */}
            {miDeuda?.esCuotaEspecial && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '20px' }}>⚡</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#f87171' }}>
                    CUOTA ESPECIAL POR GAS
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#fca5a5' }}>
                    {miDeuda.campanaTitulo || 'Aporte extraordinario para recarga del tanque'}
                  </div>
                </div>
              </div>
            )}

            {/* Monto de la deuda: Si la moneda es Bolívares, se destaca primero y prominentemente en Bs. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              {esDeudaBs ? (
                <>
                  <span style={{ fontSize: '32px', fontWeight: 900, color: '#ef4444' }}>
                    Bs. {(miDeuda?.montoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
                    (≈ ${(miDeuda?.montoUsd || 0).toFixed(2)} USD a tasa BCV)
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '32px', fontWeight: 900, color: '#ef4444' }}>
                    ${(miDeuda?.montoUsd || 0).toFixed(2)} USD
                  </span>
                  <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
                    ≈ Bs. {(miDeuda?.montoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>

            <p style={{ color: '#fca5a5', fontSize: '12px', margin: '0 0 16px', lineHeight: 1.4 }}>
              *Cuota de gas comunal para la recarga del tanque. Recuerda que este pago se efectúa directamente a la cuenta del gas, por fuera del recibo ordinario de condominio.
            </p>

            {/* Fecha Límite */}
            {miDeuda?.fechaLimite ? (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#f87171',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '16px'
              }}>
                <span>⏳</span>
                <span>Fecha límite de recaudación: <b>{miDeuda.fechaLimite}</b></span>
              </div>
            ) : null}

            {/* Datos Bancarios para Pagar Gas */}
            {datosPago && (
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '16px',
                marginTop: '6px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-accent, #f97316)' }}>
                    💳 DATOS PARA PAGAR TU CUOTA DE GAS:
                  </span>
                  <button
                    onClick={copyBankData}
                    style={{
                      background: copiedBank ? '#22c55e' : 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {copiedBank ? '✓ Copiado' : 'Copiar Datos'}
                  </button>
                </div>

                <div style={{
                  fontSize: '12px',
                  color: '#e4e4e7',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '8px 16px'
                }}>
                  <div><span style={{ color: '#a1a1aa' }}>Banco:</span> <b>{datosPago.banco || 'Por definir'}</b></div>
                  <div><span style={{ color: '#a1a1aa' }}>Teléfono:</span> <b>{datosPago.telefono || 'Por definir'}</b></div>
                  <div><span style={{ color: '#a1a1aa' }}>C.I. / RIF:</span> <b>{datosPago.rifCedula || 'Por definir'}</b></div>
                  <div><span style={{ color: '#a1a1aa' }}>Titular:</span> <b>{datosPago.titular}</b></div>
                </div>

                <div style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
                  fontSize: '11px',
                  color: '#a1a1aa',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Monto exacto en Bolívares: <b>Bs. {(miDeuda?.montoBs || 0).toFixed(2)}</b></span>
                  <button
                    onClick={copyBsAmount}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent, #f97316)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {copiedAmount ? '✓ Monto Copiado' : 'Copiar Bs.'}
                  </button>
                </div>
              </div>
            )}

            {/* BOTÓN PARA REPORTAR PAGO DE GAS */}
            <button
              onClick={() => {
                setFormReporte({
                  monto: miDeuda ? (miDeuda.monedaPrincipal === 'BS' ? miDeuda.montoBs.toFixed(2) : miDeuda.montoUsd.toFixed(2)) : '',
                  moneda: miDeuda?.monedaPrincipal || 'BS',
                  metodoPago: 'pago_movil',
                  referencia: '',
                  fechaPago: new Date().toISOString().slice(0, 10),
                  observaciones: ''
                })
                setModalReportarOpen(true)
              }}
              style={{
                width: '100%',
                marginTop: '16px',
                backgroundColor: 'var(--color-accent, #f97316)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '13px 18px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--color-brand-shadow, 0 4px 16px rgba(249, 115, 22, 0.4))'
              }}
            >
              <span>💳</span>
              <span>Reportar Pago de Cuota de Gas</span>
            </button>
          </div>
        )}
      </div>

      {/* ── CARD MEDIDOR DEL TANQUE COMUNAL ──────────────────────────── */}
      {metricas && (
        <div style={{
          background: 'var(--color-bg-card, #12141a)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🎛️</span>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                Nivel Actual del Tanque del Edificio
              </h3>
            </div>

            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: metricas.nivelPct <= 25 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e',
              padding: '2px 8px',
              borderRadius: '999px'
            }}>
              {metricas.nivelPct > 0 ? metricas.nivelEstado.toUpperCase() : 'PENDIENTE CARGA'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <span style={{ fontSize: '32px', fontWeight: 900, color: metricas.nivelPct <= 25 ? '#ef4444' : '#22c55e' }}>
                {metricas.nivelPct}%
              </span>
              <span style={{ fontSize: '13px', color: '#a1a1aa', marginLeft: '8px' }}>
                ({metricas.litrosActuales.toLocaleString()} / {metricas.capacidadTotal.toLocaleString()} Litros)
              </span>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', color: '#a1a1aa' }}>
              Autonomía: <b style={{ color: '#fff' }}>{metricas.diasAutonomia > 0 ? `~${metricas.diasAutonomia} días` : 'Sin estimar'}</b>
            </div>
          </div>

          {/* Barra de Progreso del Tanque */}
          <div style={{
            width: '100%',
            height: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '14px'
          }}>
            <div style={{
              height: '100%',
              width: `${metricas.nivelPct}%`,
              background: metricas.nivelPct <= 25
                ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
                : 'linear-gradient(90deg, #22c55e 0%, #3b82f6 100%)',
              borderRadius: '999px',
              transition: 'width 0.5s ease'
            }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: '12px'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Último Llenado Realizado:</div>
              <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
                {metricas.ultimoLlenado?.fecha || 'Sin registro previo'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Proveedor del Servicio:</div>
              <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px', color: 'var(--color-accent, #f97316)' }}>
                {data?.config.proveedorActual || 'Por registrar'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CARD TRANSPARENCIA RECAUDACIÓN COMUNITARIA ───────────────── */}
      {metricas && (
        <div style={{
          background: 'var(--color-bg-card, #12141a)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📊</span>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                Avance de Recaudación del Edificio
              </h3>
            </div>

            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
              padding: '2px 8px',
              borderRadius: '999px'
            }}>
              {metricas.porcentajeRecaudado}% Recaudado
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
            <span style={{ color: '#a1a1aa' }}>Progreso de Apartamentos Solventes:</span>
            <span>
              <b style={{ color: '#22c55e' }}>{metricas.aptosSolventes}</b> de <b>{metricas.totalAptos}</b> apartamentos
            </span>
          </div>

          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '12px'
          }}>
            <div style={{
              height: '100%',
              width: `${metricas.porcentajeRecaudado}%`,
              background: 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)',
              borderRadius: '999px'
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa', flexWrap: 'wrap', gap: '4px' }}>
            <span>Recaudado: <b style={{ color: '#fff' }}>Bs. {metricas.totalRecaudadoBs.toLocaleString('es-VE')} (${metricas.totalRecaudadoUsd.toFixed(2)} USD)</b></span>
            <span>Meta: <b style={{ color: '#fff' }}>Bs. {metricas.metaBs.toLocaleString('es-VE')}</b></span>
          </div>
        </div>
      )}

      {/* ── CARD HISTORIAL DE LLENADOS TRANSPARENTE ───────────────────── */}
      <div style={{
        background: 'var(--color-bg-card, #12141a)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{ fontSize: '18px' }}>📜</span>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
            Historial de Descargas de Gas
          </h3>
        </div>

        {(!data?.llenados || data.llenados.length === 0) ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#71717a',
            fontSize: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '12px'
          }}>
            No hay registros de descargas de gas registradas aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.llenados.map(ll => {
              const isCompletado = ll.estado === 'completado'
              return (
                <div
                  key={ll.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                      {ll.litrosCargados.toLocaleString()} L · {ll.proveedor || 'Cisterna'}
                    </div>
                    <div style={{ color: '#a1a1aa', marginTop: '2px' }}>
                      Fecha: <b>{ll.fecha}</b> {ll.responsableRecibio ? `· Responsable: ${ll.responsableRecibio}` : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#22c55e' }}>
                      {ll.costoTotalBs > 0 ? `Bs. ${ll.costoTotalBs.toLocaleString('es-VE')}` : `$${ll.costoTotalUsd.toFixed(2)} USD`}
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: isCompletado ? '#22c55e' : 'var(--color-accent, #f97316)'
                    }}>
                      {ll.estado.toUpperCase()}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── TOAST NOTIFICACIÓN ────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: 'var(--color-accent, #f97316)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          fontWeight: 700,
          fontSize: '13px',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⛽</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── MODAL REPORTAR PAGO DE GAS ─────────────────── */}
      {modalReportarOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #181920 0%, #101116 100%)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(249, 115, 22, 0.15)',
            borderRadius: '24px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>💳</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                    Reportar Pago de Cuota de Gas
                  </h3>
                  <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                    Apartamento {aptoNumero} · {miDeuda?.campanaTitulo || 'Gas Comunal'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalReportarOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a1a1aa',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnviarReportePago} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Moneda y Monto */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    MONEDA PAGADA
                  </label>
                  <select
                    value={formReporte.moneda}
                    onChange={e => setFormReporte(prev => ({ ...prev, moneda: e.target.value as 'BS' | 'USD' }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      color: '#fff',
                      marginTop: '4px',
                      fontSize: '13px'
                    }}
                  >
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USD">Dólares ($ USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    MONTO TRANSFERIDO
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formReporte.monto}
                    onChange={e => setFormReporte(prev => ({ ...prev, monto: e.target.value }))}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      color: '#fff',
                      marginTop: '4px',
                      fontSize: '13px',
                      fontWeight: 700
                    }}
                    required
                  />
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                  MÉTODO DE PAGO
                </label>
                <select
                  value={formReporte.metodoPago}
                  onChange={e => setFormReporte(prev => ({ ...prev, metodoPago: e.target.value as any }))}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    color: '#fff',
                    marginTop: '4px',
                    fontSize: '13px'
                  }}
                >
                  <option value="pago_movil">Pago Móvil</option>
                  <option value="transferencia">Transferencia Bancaria</option>
                  <option value="efectivo_bs">Efectivo Bolívares</option>
                  <option value="efectivo_usd">Efectivo Divisas ($)</option>
                  <option value="otro">Otro método</option>
                </select>
              </div>

              {/* Número de Referencia */}
              {['pago_movil', 'transferencia'].includes(formReporte.metodoPago) && (
                <div>
                  <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    NÚMERO DE REFERENCIA / COMPROBANTE *
                  </label>
                  <input
                    type="text"
                    value={formReporte.referencia}
                    onChange={e => setFormReporte(prev => ({ ...prev, referencia: e.target.value }))}
                    placeholder="Últimos 4 a 6 dígitos o número de comprobante"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      color: '#fff',
                      marginTop: '4px',
                      fontSize: '13px'
                    }}
                    required
                  />
                </div>
              )}

              {/* Fecha de pago */}
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                  FECHA DEL PAGO
                </label>
                <input
                  type="date"
                  value={formReporte.fechaPago}
                  onChange={e => setFormReporte(prev => ({ ...prev, fechaPago: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    color: '#fff',
                    marginTop: '4px',
                    fontSize: '13px'
                  }}
                  required
                />
              </div>

              {/* Observaciones */}
              <div>
                <label style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                  NOTAS / OBSERVACIONES (OPCIONAL)
                </label>
                <input
                  type="text"
                  value={formReporte.observaciones}
                  onChange={e => setFormReporte(prev => ({ ...prev, observaciones: e.target.value }))}
                  placeholder="Ej: Pago realizado desde cuenta titular"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    color: '#fff',
                    marginTop: '4px',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalReportarOpen(false)}
                  disabled={guardandoReporte}
                  style={{
                    flex: 1,
                    padding: '11px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoReporte}
                  style={{
                    flex: 2,
                    padding: '11px',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: guardandoReporte ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    fontSize: '13px',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 14px rgba(249, 115, 22, 0.4))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoReporte ? 'Registrando...' : 'Confirmar Reporte de Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default GasResidente
