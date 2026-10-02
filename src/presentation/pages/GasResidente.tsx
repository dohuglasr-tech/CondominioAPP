import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import {
  obtenerGasServicioData,
  calcularMetricasGas,
  obtenerDeudaGasApartamento,
  GasServicioData
} from '../../data/gasService'

export const GasResidente: React.FC = () => {
  const { perfil } = useAuth()
  const [data, setData] = useState<GasServicioData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [copiedBank, setCopiedBank] = useState<boolean>(false)
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false)

  const p = perfil as any
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || ''
  const apartamentoId = p?.apartamento_id || p?.apartamento?.id || ''

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
        <div style={{ fontSize: '12px', marginTop: '4px' }}>Sincronizando nivel del tanque y pagos comunitarios</div>
      </div>
    )
  }

  const isSolvente = miDeuda ? !miDeuda.tieneDeuda : true
  const datosPago = data?.config.datosPago

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
          Tanque central, estado de recargas y cuota comunitaria independiente del condominio.
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
              Tu apartamento está solvente con el gas
            </div>
            <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '0 0 14px', lineHeight: 1.5 }}>
              La cuota para la jornada actual ({miDeuda?.campanaTitulo || 'Octubre 2026'}) fue debidamente conciliada. ¡Gracias por contribuir oportunamente con la recarga del tanque!
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#ef4444' }}>
                ${(miDeuda?.montoUsd || 5).toFixed(2)} USD
              </span>
              <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
                ≈ Bs. {(miDeuda?.montoBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <p style={{ color: '#fca5a5', fontSize: '12px', margin: '0 0 16px', lineHeight: 1.4 }}>
              *Cuota de gas comunal para reposición del tanque. Recuerda que este pago se realiza directamente a la cuenta del gas por fuera del recibo ordinario.
            </p>

            {/* Fecha Límite */}
            {miDeuda?.fechaLimite && (
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
            )}

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
                  <div><span style={{ color: '#a1a1aa' }}>Banco:</span> <b>{datosPago.banco}</b></div>
                  <div><span style={{ color: '#a1a1aa' }}>Teléfono:</span> <b>{datosPago.telefono}</b></div>
                  <div><span style={{ color: '#a1a1aa' }}>C.I. / RIF:</span> <b>{datosPago.rifCedula}</b></div>
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
                  <span>Monto exacto en Bs: <b>Bs. {(miDeuda?.montoBs || 0).toFixed(2)}</b></span>
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
              {metricas.nivelEstado.toUpperCase()}
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
              Autonomía: <b style={{ color: '#fff' }}>~{metricas.diasAutonomia} días</b>
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
                {metricas.ultimoLlenado?.fecha || '18/09/2026'} ({metricas.ultimoLlenado?.litrosCargados || 2000} L)
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#a1a1aa' }}>Proveedor del Servicio:</div>
              <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px', color: 'var(--color-accent, #f97316)' }}>
                {data?.config.proveedorActual || 'Gas Comunal / PDVSA Gas'}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa' }}>
            <span>Recaudado: <b style={{ color: '#fff' }}>${metricas.totalRecaudadoUsd.toFixed(2)} USD</b></span>
            <span>Meta para la cisterna: <b style={{ color: '#fff' }}>${metricas.metaUsd.toFixed(2)} USD</b></span>
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
            Historial de Llenados y Cisternas
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {data?.llenados.map(ll => {
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
                    {ll.litrosCargados.toLocaleString()} L · {ll.proveedor}
                  </div>
                  <div style={{ color: '#a1a1aa', marginTop: '2px' }}>
                    Fecha: <b>{ll.fecha}</b> · Responsable: {ll.responsableRecibio}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#22c55e' }}>
                    ${ll.costoTotalUsd.toFixed(2)} USD
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
      </div>
    </div>
  )
}
export default GasResidente
