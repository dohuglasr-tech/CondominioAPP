import React from 'react'
import { ReciboEmitidoModalData } from './ReciboDetalleModal'

export type PasoEmailsModal = 'mes' | 'modo' | 'automatico' | 'manual' | 'despacho' | 'resumen'

export interface DestinatarioEmailItem {
  recibo: ReciboEmitidoModalData
  email: string
  nombre?: string
}

interface ReciboEnviarEmailsModalProps {
  open: boolean
  mesesDisponibles: string[]
  mesParaEmails: string
  pasoEmails: PasoEmailsModal
  recibosParaEmails: ReciboEmitidoModalData[]
  cargandoRecibosEmails: boolean
  emailsManuales: Record<string, string>
  nombresManuales: Record<string, string>
  guardarEmailsEnPerfil: boolean
  busquedaManual: string
  despachandoEmails: boolean
  progresoDespacho: { actual: number; total: number; texto: string }
  logDespacho: Array<{ apto: string; email: string; ok: boolean; error?: string }>
  excelInputRef: React.RefObject<HTMLInputElement>
  onClose: () => void
  onSelectMesParaEmails: (mes: string) => void | Promise<void>
  onChangePasoEmails: (paso: PasoEmailsModal) => void
  onChangeEmailsManuales: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onChangeNombresManuales: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onChangeGuardarEmailsEnPerfil: (val: boolean) => void
  onChangeBusquedaManual: (val: string) => void
  onCargarExcelEmails: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDescargarPlantillaExcel: () => void
  onEjecutarDespachoEmails: (destinatarios: DestinatarioEmailItem[]) => void
  onDetenerDespacho: () => void
  onToast: (msg: string) => void
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Modal multi-paso para envío masivo/manual de recordatorios y recibos por email. */
export const ReciboEnviarEmailsModal = React.memo<ReciboEnviarEmailsModalProps>(({
  open,
  mesesDisponibles,
  mesParaEmails,
  pasoEmails,
  recibosParaEmails,
  cargandoRecibosEmails,
  emailsManuales,
  nombresManuales,
  guardarEmailsEnPerfil,
  busquedaManual,
  despachandoEmails,
  progresoDespacho,
  logDespacho,
  excelInputRef,
  onClose,
  onSelectMesParaEmails,
  onChangePasoEmails,
  onChangeEmailsManuales,
  onChangeNombresManuales,
  onChangeGuardarEmailsEnPerfil,
  onChangeBusquedaManual,
  onCargarExcelEmails,
  onDescargarPlantillaExcel,
  onEjecutarDespachoEmails,
  onDetenerDespacho,
  onToast,
}) => {
  if (!open) return null

  const [anioStr, mesNum] = (mesParaEmails || '').split('-')
  const mesLabel = `${MESES[(parseInt(mesNum) || 1) - 1]} ${anioStr}`
  const totalAptos = recibosParaEmails.length
  const totalCarteraUsd = recibosParaEmails.reduce((s, r) => s + (r.total_usd || 0), 0)
  const totalCarteraBs = recibosParaEmails.reduce((s, r) => s + (r.total_bs || 0), 0)

  const aptosConCorreoAuto = recibosParaEmails.filter(
    (r) => r.apartamento?.propietario_email && r.apartamento.propietario_email.includes('@')
  )
  const aptosSinCorreoAuto = recibosParaEmails.filter(
    (r) => !r.apartamento?.propietario_email || !r.apartamento.propietario_email.includes('@')
  )
  const destinatariosAuto: DestinatarioEmailItem[] = aptosConCorreoAuto.map((r) => ({
    recibo: r,
    email: r.apartamento!.propietario_email!.trim(),
    nombre: r.apartamento?.propietario_nombre || '',
  }))

  const aptosFiltradosManual = recibosParaEmails.filter((r) => {
    if (!busquedaManual.trim()) return true
    const q = busquedaManual.toLowerCase()
    return (
      (r.apartamento?.numero || '').toLowerCase().includes(q) ||
      (nombresManuales[r.apartamento_id] || r.apartamento?.propietario_nombre || '').toLowerCase().includes(q) ||
      (emailsManuales[r.apartamento_id] || '').toLowerCase().includes(q)
    )
  })

  const destinatariosManuales: DestinatarioEmailItem[] = recibosParaEmails
    .filter((r) => emailsManuales[r.apartamento_id] && emailsManuales[r.apartamento_id].includes('@'))
    .map((r) => ({
      recibo: r,
      email: emailsManuales[r.apartamento_id].trim(),
      nombre: (nombresManuales[r.apartamento_id] ?? r.apartamento?.propietario_nombre ?? '').trim(),
    }))

  const totalManualesListos = destinatariosManuales.length
  const totalManualesFaltantes = totalAptos - totalManualesListos

  const exitososLog = logDespacho.filter((l) => l.ok).length
  const fallidosLog = logDespacho.filter((l) => !l.ok)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px',
    }}>
      <input
        type="file"
        ref={excelInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls,.csv"
        onChange={onCargarExcelEmails}
      />

      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '24px',
        maxWidth: pasoEmails === 'manual' ? '860px' : '680px',
        width: '100%',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        transition: 'max-width 0.2s ease',
      }}>
        {/* ENCABEZADO */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #1e293b',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
            }}>
              ✉️
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Enviar Correos de Recibos
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Descarga directa de PDF (sin login) y aviso contra acumulación de deuda
              </p>
            </div>
          </div>

          {!despachandoEmails && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '22px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* BARRA DE PASOS */}
        <div style={{
          display: 'flex',
          backgroundColor: '#090d16',
          borderBottom: '1px solid #1e293b',
          padding: '8px 16px',
          gap: '8px',
          overflowX: 'auto',
          fontSize: '11.5px',
          fontWeight: 700,
        }}>
          <span style={{ color: pasoEmails === 'mes' ? '#818cf8' : '#64748b' }}>
            1. Mes Emitido {pasoEmails !== 'mes' && '✓'}
          </span>
          <span style={{ color: '#475569' }}>➔</span>
          <span style={{ color: pasoEmails === 'modo' ? '#818cf8' : (pasoEmails === 'automatico' || pasoEmails === 'manual' || pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#94a3b8' : '#475569' }}>
            2. Modalidad (Auto / Manual) {(pasoEmails === 'automatico' || pasoEmails === 'manual' || pasoEmails === 'despacho' || pasoEmails === 'resumen') && '✓'}
          </span>
          <span style={{ color: '#475569' }}>➔</span>
          <span style={{ color: (pasoEmails === 'automatico' || pasoEmails === 'manual') ? '#818cf8' : (pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#94a3b8' : '#475569' }}>
            3. Destinatarios {(pasoEmails === 'despacho' || pasoEmails === 'resumen') && '✓'}
          </span>
          <span style={{ color: '#475569' }}>➔</span>
          <span style={{ color: (pasoEmails === 'despacho' || pasoEmails === 'resumen') ? '#818cf8' : '#475569' }}>
            4. Envío y Resultados
          </span>
        </div>

        {/* CUERPO DEL MODAL */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* PASO 1 */}
          {pasoEmails === 'mes' && (
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                Paso 1: Seleccione el Mes Facturado
              </h4>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                Elija el período de recibos que desea notificar o recordar a los residentes.
              </p>

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '24px',
              }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                  Mes Facturado:
                </label>
                <select
                  value={mesParaEmails}
                  onChange={async (e) => {
                    await onSelectMesParaEmails(e.target.value)
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#111827',
                    color: '#fff',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {mesesDisponibles.map((m) => {
                    const [y, mesN] = m.split('-')
                    return <option key={m} value={m}>{MESES[(parseInt(mesN) || 1) - 1]} {y}</option>
                  })}
                </select>

                {cargandoRecibosEmails ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                    Cargando recibos del mes...
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '12px',
                    marginTop: '16px',
                  }}>
                    <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Recibos Emitidos</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>{totalAptos}</div>
                    </div>
                    <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Cartera</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>${fmtUsd(totalCarteraUsd)}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>Bs. {fmtBs(totalCarteraBs)}</div>
                    </div>
                    <div style={{ backgroundColor: '#1e293b50', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Con Correo en App</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>{aptosConCorreoAuto.length}</div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={onClose}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onChangePasoEmails('modo')}
                  disabled={totalAptos === 0 || cargandoRecibosEmails}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: totalAptos === 0 || cargandoRecibosEmails ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  Continuar a Selección de Modalidad ➔
                </button>
              </div>
            </div>
          )}

          {/* PASO 2 */}
          {pasoEmails === 'modo' && (
            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                Paso 2: ¿Cómo desea enviar los correos electrónicos?
              </h4>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                Período seleccionado: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong> ({totalAptos} apartamentos).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div
                  onClick={() => onChangePasoEmails('automatico')}
                  style={{
                    backgroundColor: '#090d16',
                    border: '2px solid rgba(99, 102, 241, 0.35)',
                    borderRadius: '18px',
                    padding: '22px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    transition: 'border-color 0.2s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#6366f1'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.35)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '28px' }}>🤖</span>
                      <div>
                        <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                          Envío Automático
                        </h5>
                        <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 700 }}>
                          (Correos de residentes en la plataforma)
                        </span>
                      </div>
                    </div>
                    <p style={{ color: '#cbd5e1', fontSize: '12.5px', lineHeight: 1.5, margin: '0 0 14px' }}>
                      Emitirá el correo electrónico de recordatorio a los usuarios registrados como residentes con el mes elegido.
                    </p>

                    <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '10px', padding: '10px 12px', fontSize: '11.5px', color: '#c7d2fe' }}>
                      <div>✓ <strong>{aptosConCorreoAuto.length}</strong> apartamentos listos con correo</div>
                      {aptosSinCorreoAuto.length > 0 && (
                        <div style={{ color: '#fca5a5', marginTop: '4px' }}>
                          ⚠️ {aptosSinCorreoAuto.length} apartamentos sin correo registrado
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    style={{
                      marginTop: '20px',
                      backgroundColor: 'rgba(99, 102, 241, 0.25)',
                      color: '#818cf8',
                      border: '1px solid rgba(99, 102, 241, 0.5)',
                      padding: '10px',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                    }}
                  >
                    Elegir Modo Automático ➔
                  </button>
                </div>

                <div
                  onClick={() => onChangePasoEmails('manual')}
                  style={{
                    backgroundColor: '#090d16',
                    border: '2px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '18px',
                    padding: '22px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    transition: 'border-color 0.2s, transform 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#38bdf8'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.35)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '28px' }}>✍️</span>
                      <div>
                        <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                          Ingreso Manual / Carga Excel
                        </h5>
                        <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                          (Asignación por apartamento)
                        </span>
                      </div>
                    </div>
                    <p style={{ color: '#cbd5e1', fontSize: '12.5px', lineHeight: 1.5, margin: '0 0 14px' }}>
                      Despliega la lista de apartamentos para ingresar el correo uno a uno o cargar un archivo Excel (.xlsx) que los llena automáticamente.
                    </p>

                    <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px', padding: '10px 12px', fontSize: '11.5px', color: '#bae6fd' }}>
                      <div>📥 Carga masiva mediante archivo Excel (.xlsx / .csv)</div>
                      <div style={{ marginTop: '3px' }}>📋 Plantilla descargable en 1 clic</div>
                      <div style={{ marginTop: '3px' }}>🎯 Envía al correo exacto indicado para cada apartamento</div>
                    </div>
                  </div>

                  <button
                    style={{
                      marginTop: '20px',
                      backgroundColor: 'rgba(56, 189, 248, 0.2)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.5)',
                      padding: '10px',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                    }}
                  >
                    Elegir Modo Manual / Excel ➔
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  onClick={() => onChangePasoEmails('mes')}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ← Volver a Selección de Mes
                </button>
              </div>
            </div>
          )}

          {/* PASO 3A */}
          {pasoEmails === 'automatico' && (
            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#fff' }}>
                Confirmar Envío Automático
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                Período: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong> · Total destinatarios: <strong style={{ color: '#34d399' }}>{destinatariosAuto.length} apartamentos</strong>
              </p>

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', marginBottom: '8px' }}>
                  ⚡ Novedad en estos correos:
                </div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  <div>📥 <strong>Descarga directa en 1 clic:</strong> Al dar clic en "Descargar recibo", el residente NO necesitará iniciar sesión ni ingresar en la app. El PDF se descargará automáticamente en su dispositivo.</div>
                  <div style={{ marginTop: '6px' }}>⚠️ <strong>Aviso anti-acumulaciones:</strong> Al pie del correo se incluye un recordatorio expreso para cancelar oportunamente y evitar acumulación de deudas o cargos de mora.</div>
                </div>
              </div>

              {aptosSinCorreoAuto.length > 0 && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: '#fca5a5',
                }}>
                  <strong>⚠️ {aptosSinCorreoAuto.length} apartamentos sin correo registrado:</strong>
                  <div style={{ marginTop: '4px', color: '#fecaca', lineHeight: 1.5 }}>
                    {aptosSinCorreoAuto.map((r) => `Apto. ${r.apartamento?.numero}`).join(', ')}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#94a3b8' }}>
                    *Estos apartamentos serán omitidos en el envío automático. Si desea ingresarles un correo, seleccione la opción "Modo Manual".
                  </div>
                </div>
              )}

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                overflow: 'hidden',
                maxHeight: '220px',
                overflowY: 'auto',
                marginBottom: '20px',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#111827', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                      <th style={{ padding: '8px 12px' }}>Apto</th>
                      <th style={{ padding: '8px 12px' }}>Residente / Propietario</th>
                      <th style={{ padding: '8px 12px' }}>Correo Electrónico</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinatariosAuto.map((d) => (
                      <tr key={d.recibo.id} style={{ borderBottom: '1px solid #1e293b30' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 800, color: '#fff' }}>
                          Apto. {d.recibo.apartamento?.numero}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                          {d.recibo.apartamento?.propietario_nombre || 'Sin nombre'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#818cf8', fontFamily: 'monospace' }}>
                          {d.email}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                          ${fmtUsd(d.recibo.total_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => onChangePasoEmails('modo')}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ← Cambiar Modalidad
                </button>

                <button
                  onClick={() => onEjecutarDespachoEmails(destinatariosAuto)}
                  disabled={destinatariosAuto.length === 0}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '13.5px',
                    cursor: destinatariosAuto.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <span>🚀</span> Iniciar Envío Automático ({destinatariosAuto.length} correos)
                </button>
              </div>
            </div>
          )}

          {/* PASO 3B */}
          {pasoEmails === 'manual' && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '16px',
              }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                    Asignación Manual y Excel
                  </h4>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Mes: <strong style={{ color: '#38bdf8' }}>{mesLabel}</strong> ({totalAptos} apartamentos)
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => excelInputRef.current?.click()}
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      padding: '7px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Importar archivo Excel con columnas de apartamento y correo"
                  >
                    <span>📥</span> Cargar Excel (.xlsx / .csv)
                  </button>

                  <button
                    onClick={onDescargarPlantillaExcel}
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                      border: '1px solid #334155',
                      padding: '7px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Descargar plantilla de Excel pre-llenada con los apartamentos"
                  >
                    <span>📋</span> Descargar Plantilla
                  </button>

                  <button
                    onClick={() => {
                      const nuevoEmails = { ...emailsManuales }
                      const nuevoNombres = { ...nombresManuales }
                      let c = 0
                      recibosParaEmails.forEach((r) => {
                        if (!nuevoEmails[r.apartamento_id] && r.apartamento?.propietario_email) {
                          nuevoEmails[r.apartamento_id] = r.apartamento.propietario_email
                          c++
                        }
                        if (!nuevoNombres[r.apartamento_id] && r.apartamento?.propietario_nombre) {
                          nuevoNombres[r.apartamento_id] = r.apartamento.propietario_nombre
                        }
                      })
                      onChangeEmailsManuales(nuevoEmails)
                      onChangeNombresManuales(nuevoNombres)
                      onToast(`✓ Se autocompletaron ${c} casillas con datos registrados.`)
                    }}
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      padding: '7px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Rellenar casillas vacías con correos y nombres registrados en perfiles"
                  >
                    🔄 Llenar registrados
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('¿Deseas limpiar todos los correos y nombres personalizados ingresados en las casillas?')) {
                        onChangeEmailsManuales({})
                        onChangeNombresManuales({})
                      }
                    }}
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#f87171',
                      border: '1px solid #334155',
                      padding: '7px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                    title="Limpiar todas las casillas"
                  >
                    🧹
                  </button>
                </div>
              </div>

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ flex: '1 1 240px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Buscar por número de apartamento o residente..."
                    value={busquedaManual}
                    onChange={(e) => onChangeBusquedaManual(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#111827',
                      color: '#fff',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: totalManualesListos === totalAptos ? '#34d399' : '#eab308' }}>
                    {totalManualesListos} de {totalAptos} con correo ({Math.round((totalManualesListos / (totalAptos || 1)) * 100)}%)
                  </span>
                  <div style={{ width: '100px', height: '8px', backgroundColor: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(totalManualesListos / (totalAptos || 1)) * 100}%`,
                      height: '100%',
                      backgroundColor: totalManualesListos === totalAptos ? '#10b981' : '#f59e0b',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="checkGuardarPerfil"
                  checked={guardarEmailsEnPerfil}
                  onChange={(e) => onChangeGuardarEmailsEnPerfil(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#6366f1' }}
                />
                <label htmlFor="checkGuardarPerfil" style={{ fontSize: '12px', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600 }}>
                  Guardar estos correos en el sistema para futuros envíos de estos apartamentos
                </label>
              </div>

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                overflow: 'hidden',
                maxHeight: '330px',
                overflowY: 'auto',
                marginBottom: '20px',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#111827', zIndex: 2 }}>
                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e293b' }}>
                      <th style={{ padding: '10px 14px', width: '110px' }}>Inmueble</th>
                      <th style={{ padding: '10px 14px', minWidth: '180px' }}>Nombre que saldrá en el Recibo</th>
                      <th style={{ padding: '10px 14px', width: '110px' }}>Cuota Mes</th>
                      <th style={{ padding: '10px 14px', minWidth: '220px' }}>Correo Electrónico para Envío</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aptosFiltradosManual.map((r) => {
                      const valEmail = emailsManuales[r.apartamento_id] || ''
                      const esValido = valEmail.includes('@') && valEmail.includes('.')
                      const valNombre = nombresManuales[r.apartamento_id] ?? r.apartamento?.propietario_nombre ?? ''

                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #1e293b30' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
                            <span style={{
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                            }}>
                              Apto. {r.apartamento?.numero}
                            </span>
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <input
                              type="text"
                              placeholder={r.apartamento?.propietario_nombre || 'Nombre de propietario...'}
                              value={valNombre}
                              onChange={(e) => {
                                const v = e.target.value
                                onChangeNombresManuales((prev) => ({
                                  ...prev,
                                  [r.apartamento_id]: v,
                                }))
                              }}
                              style={{
                                width: '100%',
                                backgroundColor: '#0a0f1d',
                                color: '#fff',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                padding: '7px 10px',
                                fontSize: '12px',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                              }}
                            />
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: '#38bdf8' }}>${fmtUsd(r.total_usd)}</div>
                            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Bs. {fmtBs(r.total_bs)}</div>
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={valEmail}
                                onChange={(e) => {
                                  const v = e.target.value
                                  onChangeEmailsManuales((prev) => ({
                                    ...prev,
                                    [r.apartamento_id]: v,
                                  }))
                                }}
                                style={{
                                  width: '100%',
                                  backgroundColor: '#0a0f1d',
                                  color: '#fff',
                                  border: `1px solid ${esValido ? '#10b98160' : valEmail ? '#ef444460' : '#374151'}`,
                                  borderRadius: '8px',
                                  padding: '7px 28px 7px 10px',
                                  fontSize: '12px',
                                  outline: 'none',
                                  transition: 'border-color 0.2s',
                                }}
                              />
                              <span style={{ position: 'absolute', right: '8px', fontSize: '13px' }}>
                                {esValido ? '✅' : valEmail ? '⚠️' : '⚪'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onChangePasoEmails('modo')}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ← Cambiar Modalidad
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {totalManualesFaltantes > 0 && (
                    <span style={{ fontSize: '11.5px', color: '#eab308' }}>
                      ⚠️ {totalManualesFaltantes} sin correo (se enviará a los {totalManualesListos} listos)
                    </span>
                  )}

                  <button
                    onClick={() => {
                      if (totalManualesListos === 0) {
                        alert('Por favor ingresa o carga al menos un correo electrónico válido.')
                        return
                      }
                      if (totalManualesFaltantes > 0) {
                        if (!window.confirm(`Hay ${totalManualesFaltantes} apartamento(s) sin correo electrónico ingresado. ¿Deseas enviar los correos únicamente a los ${totalManualesListos} apartamentos que tienen correo?`)) {
                          return
                        }
                      }
                      onEjecutarDespachoEmails(destinatariosManuales)
                    }}
                    disabled={totalManualesListos === 0}
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      cursor: totalManualesListos === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    <span>🚀</span> Enviar Correos ({totalManualesListos} apartamentos)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PASO 4 */}
          {pasoEmails === 'despacho' && (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: '4px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: '#6366f1',
                animation: 'spin 0.9s linear infinite',
                margin: '0 auto 16px',
              }} />

              <h4 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                Enviando Correos Electrónicos...
              </h4>
              <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#94a3b8' }}>
                {progresoDespacho.texto}
              </p>

              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '10px',
                height: '14px',
                overflow: 'hidden',
                marginBottom: '10px',
                position: 'relative',
              }}>
                <div style={{
                  width: `${(progresoDespacho.actual / (progresoDespacho.total || 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1 0%, #38bdf8 100%)',
                  transition: 'width 0.2s',
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
                <span>Enviado: {progresoDespacho.actual} de {progresoDespacho.total}</span>
                <span>{Math.round((progresoDespacho.actual / (progresoDespacho.total || 1)) * 100)}%</span>
              </div>

              <div style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '12px',
                maxHeight: '180px',
                overflowY: 'auto',
                textAlign: 'left',
                fontFamily: 'monospace',
                fontSize: '11.5px',
                marginBottom: '20px',
              }}>
                {logDespacho.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Conectando con servicio de correo...</div>
                ) : (
                  logDespacho.map((l, idx) => (
                    <div key={idx} style={{ color: l.ok ? '#34d399' : '#f87171', marginBottom: '4px' }}>
                      {l.ok ? '✓' : '✗'} Apto. {l.apto} ({l.email}) — {l.ok ? 'Enviado correctamente' : `Error: ${l.error || 'Fallo de envío'}`}
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={onDetenerDespacho}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⏹️ Detener Despacho
              </button>
            </div>
          )}

          {/* PASO 5 */}
          {pasoEmails === 'resumen' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: '46px', marginBottom: '8px' }}>🎉</div>
              <h4 style={{ margin: '0 0 6px', fontSize: '19px', fontWeight: 800, color: '#fff' }}>
                ¡Despacho de Correos Finalizado!
              </h4>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#94a3b8' }}>
                Período procesado: <strong style={{ color: '#818cf8' }}>{mesLabel}</strong>
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}>
                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '14px', padding: '14px' }}>
                  <div style={{ fontSize: '11.5px', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>Enviados con Éxito</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{exitososLog}</div>
                </div>

                <div style={{ backgroundColor: fallidosLog.length > 0 ? 'rgba(239, 68, 68, 0.1)' : '#1e293b30', border: `1px solid ${fallidosLog.length > 0 ? 'rgba(239, 68, 68, 0.3)' : '#1e293b'}`, borderRadius: '14px', padding: '14px' }}>
                  <div style={{ fontSize: '11.5px', color: fallidosLog.length > 0 ? '#f87171' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Con Fallas / Omitidos</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: fallidosLog.length > 0 ? '#ef4444' : '#94a3b8', marginTop: '4px' }}>{fallidosLog.length}</div>
                </div>
              </div>

              {fallidosLog.length > 0 && (
                <div style={{
                  backgroundColor: '#090d16',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '12px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  textAlign: 'left',
                  fontSize: '12px',
                  marginBottom: '20px',
                }}>
                  <div style={{ fontWeight: 800, color: '#f87171', marginBottom: '6px' }}>Detalle de envíos fallidos:</div>
                  {fallidosLog.map((f, i) => (
                    <div key={i} style={{ color: '#cbd5e1', marginBottom: '4px' }}>
                      • <strong>Apto. {f.apto}</strong> ({f.email}): <span style={{ color: '#fca5a5' }}>{f.error || 'Error'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                {fallidosLog.length > 0 && (
                  <button
                    onClick={() => {
                      const paraReintentar = fallidosLog.map((f) => {
                        const r = recibosParaEmails.find((rec) => rec.apartamento?.numero === f.apto)
                        return r ? { recibo: r, email: f.email } : null
                      }).filter(Boolean) as DestinatarioEmailItem[]
                      onEjecutarDespachoEmails(paraReintentar)
                    }}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 Reintentar Fallidos ({fallidosLog.length})
                  </button>
                )}

                <button
                  onClick={onClose}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  ✓ Finalizar y Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

ReciboEnviarEmailsModal.displayName = 'ReciboEnviarEmailsModal'
