import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import {
  generarPDFRecibo,
  ReciboAptoData,
  ReciboGastoData,
  ReciboCargoData,
  ReciboConfigData
} from '../../utils/reciboPdfGenerator'
import { esReciboIndexado } from '../../utils/indexacionHelper'
import { formatAlicuotaPct } from '../../utils/alicuota'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const DescargarReciboPublico: React.FC = () => {
  const { reciboId: paramReciboId } = useParams<{ reciboId?: string }>()
  const [searchParams] = useSearchParams()
  const reciboId = paramReciboId || searchParams.get('id') || searchParams.get('reciboId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recibo, setRecibo] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [descargaIniciada, setDescargaIniciada] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  // ── Generar y descargar el PDF en el cliente ──────────────────────────────
  const descargarPDF = useCallback((r: any, cfg: any) => {
    if (!r) return
    try {
      setGenerandoPdf(true)
      const [anioStr, mesNumStr] = (r.mes_facturado || '').split('-')
      const anio = parseInt(anioStr) || new Date().getFullYear()
      const mesIndex = (parseInt(mesNumStr) || 1) - 1
      const mesLabel = MESES[mesIndex] || 'Mes'

      const aptoData: ReciboAptoData = {
        id: r.apartamento_id,
        numero: r.apartamento?.numero || 'S/N',
        alicuota: r.alicuota,
        propietario_nombre: r.apartamento?.propietario_nombre || null
      }

      const gastos: ReciboGastoData[] = (r.data_json?.gastos || []).map((g: any) => ({
        descripcion: g.descripcion,
        monto_usd: g.monto_usd,
        monto_bs: g.monto_bs,
        categoria: g.categoria
      }))

      const cargos: ReciboCargoData[] = (r.data_json?.cargos_especiales || []).map((cg: any) => ({
        apartamento_id: r.apartamento_id,
        tipo: cg.tipo,
        descripcion: cg.descripcion,
        monto_usd: cg.monto_usd,
        monto_bs: cg.monto_bs
      }))

      const configData: ReciboConfigData = {
        nombre_edificio: cfg?.nombre_edificio || 'Condominio',
        rif: cfg?.rif || null,
        direccion: cfg?.direccion || null,
        email_contacto: cfg?.email_contacto || null,
        banco: cfg?.banco || null,
        cuenta_bancaria: cfg?.cuenta_bancaria || null,
        titular_cuenta: cfg?.titular_cuenta || null,
        tasa_bcv_actual: cfg?.tasa_bcv_actual || r.tasa_bcv
      }

      const esHistorico = !esReciboIndexado(r, cfg?.fecha_inicio_gestion)

      const doc = generarPDFRecibo(
        aptoData,
        gastos,
        cargos,
        configData,
        r.fondo_reserva_pct || 10,
        mesLabel,
        anio,
        r.data_json?.notas_residentes,
        r.estado === 'pagado' ? {
          estado: 'pagado',
          monto_bs: r.total_bs,
          monto_usd: r.total_usd,
          referencia: esHistorico ? 'REGISTRO HISTÓRICO' : undefined
        } : undefined
      )

      const nombreArchivo = `Recibo_Apto${r.apartamento?.numero || ''}_${mesLabel}${anio}.pdf`
      doc.save(nombreArchivo)
      setDescargaIniciada(true)
    } catch (err: any) {
      console.error('[DescargaPublica] Error al generar PDF:', err)
      setError('No se pudo generar el documento PDF. Por favor reintente.')
    } finally {
      setGenerandoPdf(false)
    }
  }, [])

  // ── Cargar datos del recibo y configuración ───────────────────────────────
  useEffect(() => {
    let cancel = false

    const cargar = async () => {
      if (!reciboId) {
        setError('No se especificó un recibo válido para descargar.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const [reciboRes, configRes] = await Promise.all([
          supabase
            .from('recibos_generados')
            .select(`
              *,
              apartamento:apartamentos (
                id, numero, piso, alicuota, propietario_nombre, telefono_contacto
              )
            `)
            .eq('id', reciboId)
            .maybeSingle(),
          supabase
            .from('configuracion_edificio')
            .select('*')
            .limit(1)
            .maybeSingle()
        ])

        if (cancel) return

        if (reciboRes.error || !reciboRes.data) {
          setError('El recibo solicitado no existe o fue retirado por la administración.')
          setLoading(false)
          return
        }

        const recData = reciboRes.data
        const cfgData = configRes.data || null

        setRecibo(recData)
        setConfig(cfgData)
        setLoading(false)

        // Ejecutar descarga automática de inmediato
        setTimeout(() => {
          if (!cancel) {
            descargarPDF(recData, cfgData)
          }
        }, 350)
      } catch (err: any) {
        if (!cancel) {
          setError(err?.message || 'Error al conectar con los servidores.')
          setLoading(false)
        }
      }
    }

    cargar()

    return () => {
      cancel = true
    }
  }, [reciboId, descargarPDF])

  const mesLabel = useMemo(() => {
    if (!recibo?.mes_facturado) return ''
    const [anioStr, mesNumStr] = recibo.mes_facturado.split('-')
    const anio = anioStr || ''
    const mesIndex = (parseInt(mesNumStr) || 1) - 1
    return `${MESES[mesIndex] || 'Mes'} ${anio}`
  }, [recibo?.mes_facturado])

  const primaryColor = config?.color_primario || '#f97316'

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#070b14',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', Roboto, system-ui, sans-serif",
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTopColor: primaryColor,
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
          marginBottom: '20px'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
          Preparando su recibo de condominio...
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
          Descarga directa sin inicio de sesión. Espere un instante.
        </p>
      </div>
    )
  }

  if (error || !recibo) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#070b14',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', Roboto, system-ui, sans-serif",
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '50px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 10px', color: '#f87171' }}>
          No fue posible acceder al recibo
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '420px', lineHeight: 1.6, margin: '0 0 24px' }}>
          {error || 'El recibo no fue encontrado o el enlace ha caducado.'}
        </p>
        <Link
          to="/login"
          style={{
            backgroundColor: primaryColor,
            color: '#fff',
            textDecoration: 'none',
            padding: '12px 28px',
            borderRadius: '12px',
            fontWeight: 700,
            fontSize: '14px',
            boxShadow: `0 4px 16px ${primaryColor}40`
          }}
        >
          Ir al Portal del Condominio →
        </Link>
      </div>
    )
  }

  const apto = recibo.apartamento
  const esPagado = recibo.estado === 'pagado'
  const edificioNombre = config?.nombre_edificio || 'Condominio'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#070b14',
      color: '#f8fafc',
      fontFamily: "'Segoe UI', Roboto, -apple-system, sans-serif",
      padding: '32px 16px 60px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* TARJETA CONTENEDORA PRINCIPAL */}
      <div style={{
        width: '100%',
        maxWidth: '580px',
        backgroundColor: '#0f172a',
        borderRadius: '20px',
        border: '1px solid #1e293b',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden'
      }}>
        {/* BANNER SUPERIOR */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0b1329 100%)',
          padding: '28px 24px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>🏢</div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: 900,
            margin: '0 0 6px',
            color: '#ffffff',
            letterSpacing: '-0.4px'
          }}>
            {edificioNombre.toUpperCase()}
          </h1>
          <p style={{
            fontSize: '12px',
            color: primaryColor,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            margin: 0
          }}>
            Descarga Directa de Recibo Oficial
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: `${primaryColor}20`,
            border: `1px solid ${primaryColor}60`,
            padding: '4px 14px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            color: primaryColor,
            marginTop: '12px'
          }}>
            <span>🗓️</span> Período: {mesLabel.toUpperCase()}
          </div>
        </div>

        {/* CONTENIDO INTERNO */}
        <div style={{ padding: '24px' }}>
          {/* AVISO DE DESCARGA AUTOMÁTICA */}
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '26px' }}>📥</span>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#34d399' }}>
                {descargaIniciada ? '¡Descarga iniciada automáticamente!' : 'Generando documento oficial...'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                El archivo PDF se guardó en tu carpeta de descargas. Si no inició, usa el botón abajo.
              </div>
            </div>
          </div>

          {/* BOTÓN PRIMARIO DE DESCARGA */}
          <button
            onClick={() => descargarPDF(recibo, config)}
            disabled={generandoPdf}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '16px 20px',
              borderRadius: '14px',
              fontSize: '15px',
              fontWeight: 800,
              cursor: generandoPdf ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
              marginBottom: '24px',
              transition: 'transform 0.1s, box-shadow 0.1s'
            }}
          >
            <span style={{ fontSize: '18px' }}>📄</span>
            {generandoPdf ? 'Generando PDF...' : 'Descargar Recibo en PDF'}
          </button>

          {/* TARJETA DEL MONTO Y DETALLES DEL INMUEBLE */}
          <div style={{
            backgroundColor: '#090d16',
            borderRadius: '16px',
            border: '1px solid #1e293b',
            overflow: 'hidden',
            marginBottom: '22px'
          }}>
            {/* ENCABEZADO INMUEBLE */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Inmueble
                </div>
                <div style={{ fontSize: '17px', fontWeight: 900, color: '#fff' }}>
                  Apto. {apto?.numero || 'S/N'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  backgroundColor: esPagado ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: esPagado ? '#34d399' : '#facc15',
                  border: `1px solid ${esPagado ? 'rgba(16, 185, 129, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}>
                  {esPagado ? '✅ PAGADO / SOLVENTE' : '🟡 PENDIENTE DE PAGO'}
                </span>
              </div>
            </div>

            {/* CUOTA Y MONTOS */}
            <div style={{ padding: '20px 18px', backgroundColor: `${primaryColor}0d` }}>
              <div style={{ fontSize: '11px', color: primaryColor, textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
                Total Cuota del Mes:
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>
                $ {fmtUsd(recibo.total_usd)} <span style={{ fontSize: '14px', color: primaryColor, fontWeight: 700 }}>USD</span>
              </div>
              <div style={{ fontSize: '19px', color: '#eab308', fontWeight: 800, marginTop: '2px' }}>
                Bs. {fmtBs(recibo.total_bs)}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                Tasa Oficial BCV: <strong>{fmtBs(recibo.tasa_bcv || config?.tasa_bcv_actual || 859.06)} Bs/$</strong> · Alícuota: {formatAlicuotaPct(recibo.alicuota)}
              </div>
            </div>
          </div>

          {/* CUENTAS BANCARIAS PARA EL PAGO */}
          <div style={{
            backgroundColor: '#0b1120',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '18px',
            marginBottom: '22px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>
              🏦 Cuentas Oficiales para su Pago:
            </div>

            {/* Transferencia */}
            <div style={{ marginBottom: '14px', fontSize: '12.5px', lineHeight: 1.6 }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                💳 Transferencia Bancaria
              </div>
              <div style={{ color: '#cbd5e1' }}><strong>Banco:</strong> {config?.banco || 'Banco Bicentenario'}</div>
              <div style={{ color: '#cbd5e1' }}><strong>Cédula / RIF:</strong> {config?.cedula_cuenta || config?.rif || 'V-6089037'}</div>
              <div style={{ color: '#cbd5e1' }}><strong>Titular:</strong> {config?.titular_cuenta || 'Zoraya Almeida'}</div>
              <div style={{ color: '#cbd5e1' }}>
                <strong>Cuenta:</strong>{' '}
                <span style={{ fontFamily: 'monospace', color: '#fff', fontSize: '13px', fontWeight: 700, wordBreak: 'break-all' }}>
                  {config?.cuenta_bancaria || '0175-0525-4100-7575-1351'}
                </span>
              </div>
            </div>

            {/* Pago Móvil */}
            {(config?.pago_movil_telefono || config?.telefono) && (
              <div style={{ marginBottom: '10px', fontSize: '12.5px', lineHeight: 1.6, borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  📱 Pago Móvil
                </div>
                <div style={{ color: '#cbd5e1' }}><strong>Banco:</strong> {config?.pago_movil_banco || config?.banco || 'Bicentenario'}</div>
                <div style={{ color: '#cbd5e1' }}><strong>Cédula:</strong> {config?.pago_movil_cedula || config?.cedula_cuenta || config?.rif || 'V-6089037'}</div>
                <div style={{ color: '#cbd5e1' }}>
                  <strong>Teléfono:</strong> <span style={{ color: '#fff', fontWeight: 700 }}>{config?.pago_movil_telefono || config?.telefono || ''}</span>
                </div>
              </div>
            )}

            {/* Zelle */}
            {config?.zelle_email && (
              <div style={{ fontSize: '12.5px', lineHeight: 1.6, borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  💵 Zelle
                </div>
                <div style={{ color: '#cbd5e1' }}>
                  <strong>Correo Zelle:</strong> <span style={{ color: '#fff', fontWeight: 700 }}>{config.zelle_email}</span>
                </div>
              </div>
            )}
          </div>

          {/* ⚠️ RECORDATORIO IMPORTANTE PARA EVITAR ACUMULACIONES */}
          <div style={{
            backgroundColor: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '16px',
            padding: '18px 20px',
            textAlign: 'center',
            marginBottom: '22px'
          }}>
            <div style={{ fontSize: '26px', marginBottom: '4px' }}>⚠️</div>
            <div style={{
              fontSize: '13px',
              fontWeight: 900,
              color: '#facc15',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              marginBottom: '6px'
            }}>
              Recordatorio Importante de Pago
            </div>
            <p style={{
              fontSize: '13.5px',
              color: '#f1f5f9',
              lineHeight: 1.6,
              margin: '0 0 6px',
              fontWeight: 500
            }}>
              Estimado residente: Por favor <strong>cancele el pago de este recibo a la brevedad posible para evitar acumulaciones de deuda</strong> y posibles recargos por mora en su apartamento.
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
              Su pago oportuno garantiza la continuidad operativa y servicios básicos de nuestro condominio.
            </p>
          </div>

          {/* ACCIÓN ADICIONAL: REPORTAR PAGO */}
          <div style={{ textAlign: 'center' }}>
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                textDecoration: 'none',
                border: '1px solid #334155',
                padding: '12px 24px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              💳 Ir a Reportar Pago en la App →
            </Link>
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div style={{
          backgroundColor: '#090d16',
          padding: '16px 20px',
          textAlign: 'center',
          borderTop: '1px solid #1e293b',
          fontSize: '11px',
          color: '#64748b'
        }}>
          © {new Date().getFullYear()} {edificioNombre} · Sistema de Recibos y Administración Digital
        </div>
      </div>
    </div>
  )
}

export default DescargarReciboPublico
