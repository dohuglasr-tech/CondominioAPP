import React, { useEffect, useState, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { obtenerGastosMes, obtenerMesesDisponibles, GastoComun } from '../../data/gastosService'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface Props {
  onClose: () => void
}

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  ordinario:      { label: 'Ordinario',       color: '#3b82f6', icon: '📋' },
  fondo_reserva:  { label: 'Fondo Reserva',   color: '#a855f7', icon: '🏦' },
  extraordinario: { label: 'Extraordinario',  color: '#f59e0b', icon: '⚡' },
}

const MESES_NOMBRE: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
}

function formatMes(fecha: string): string {
  const [año, mes] = fecha.split('-')
  return `${MESES_NOMBRE[mes] || mes} ${año}`
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function GastosPanel({ onClose }: Props) {
  const { config } = useAuth()
  const navigate = useNavigate()
  const tasa = config?.tasa_bcv_actual ?? 0

  const [gastos, setGastos] = useState<GastoComun[]>([])
  const [totalUsd, setTotalUsd] = useState(0)
  const [meses, setMeses] = useState<string[]>([])
  const [mesActual, setMesActual] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  // ── DATOS DE PRUEBA (MOCK) PARA VISUALIZAR EL DISEÑO ──
  const MOCK_GASTOS: GastoComun[] = [
    { id: '1', descripcion: 'Hidrocapital - Servicio Mensual', categoria: 'agua', tipo: 'ordinario', monto_usd: 120.50, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '2', descripcion: 'Corpoelec', categoria: 'luz', tipo: 'ordinario', monto_usd: 45.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '3', descripcion: 'Reparación de tubería principal', categoria: 'agua', tipo: 'extraordinario', monto_usd: 250.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: 'Aprobado en asamblea', created_at: '' },
    { id: '4', descripcion: 'Mantenimiento ascensores', categoria: 'servicios_externos', tipo: 'ordinario', monto_usd: 300.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '5', descripcion: 'Honorarios Administradora', categoria: 'administracion', tipo: 'ordinario', monto_usd: 150.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '6', descripcion: 'Quincena Conserje', categoria: 'conserjeria', tipo: 'ordinario', monto_usd: 100.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '7', descripcion: 'Bolsas de basura', categoria: 'conserjeria', tipo: 'ordinario', monto_usd: 15.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: null, created_at: '' },
    { id: '8', descripcion: 'Fondo de Reserva', categoria: 'espacios_comunes', tipo: 'fondo_reserva', monto_usd: 50.00, mes_aplicacion: '2025-01-01', factura_url: null, notas: 'Aporte mensual 10%', created_at: '' },
  ]

  const gastosAMostrar = gastos.length > 0 ? gastos : MOCK_GASTOS;
  const totalAMostrar = gastos.length > 0 ? totalUsd : MOCK_GASTOS.reduce((acc, g) => acc + g.monto_usd, 0);

  const MOCK_MESES = ['2025-01-01', '2024-12-01', '2024-11-01'];
  const mesesAMostrar = meses.length > 0 ? meses : MOCK_MESES;

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(), 250)
  }, [onClose])

  // Cargar meses disponibles al montar
  useEffect(() => {
    obtenerMesesDisponibles().then((m) => {
      setMeses(m)
      if (m.length > 0) {
        setMesActual(m[0]) // Mes más reciente
      } else {
        // Fallback al mes mock
        setMesActual(MOCK_MESES[0])
      }
    })
  }, [])

  // Cargar gastos cuando cambie el mes
  useEffect(() => {
    if (!mesActual) return
    setLoading(true)
    obtenerGastosMes(mesActual).then(({ data, total_usd, error: err }) => {
      setGastos(data)
      setTotalUsd(total_usd)
      if (err) setError(err)
      setLoading(false)
    })
  }, [mesActual])

  const st = {
    overlay: {
      width: '100%', height: '100%',
      backgroundColor: '#0a0a0a',
      display: 'flex', flexDirection: 'column' as const,
      padding: '20px',
    },
    panel: {
      flex: 1,
      backgroundColor: '#1c1c1c',
      border: '1px solid #2a2a2a',
      borderRadius: '20px',
      fontFamily: "'Inter', sans-serif",
      position: 'relative' as const,
      display: 'flex', flexDirection: 'column' as const,
      overflow: 'hidden',
    },
    topAccent: {
      position: 'absolute' as const, top: 0, left: '20px', right: '20px', height: '3px',
      background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
      borderRadius: '0 0 4px 4px',
    },
    header: {
      padding: '28px 28px 0 28px',
      flexShrink: 0,
    },
    headerRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '20px',
    },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700 },
    // Selector de mes
    summary: {
      padding: '20px 28px',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    },
    body: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px 28px 28px 28px',
    },
    gastoCard: {
      backgroundColor: '#141414',
      border: '1px solid #2a2a2a',
      borderRadius: '14px',
      padding: '18px 20px',
      marginBottom: '10px',
      transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), border-color 0.2s',
    },
    row: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: `${color}18`, border: `1px solid ${color}30`,
      color, fontSize: '10px', fontWeight: 700,
      padding: '3px 8px', borderRadius: '999px',
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }),
    empty: {
      textAlign: 'center' as const, padding: '48px 20px', color: '#666',
    },
  }

  // ── AGRUPAR GASTOS POR CATEGORÍA ──
  const categoriasConfig: Record<string, { label: string, icon: string }> = {
    agua: { label: 'Agua', icon: '💧' },
    luz: { label: 'Luz', icon: '⚡' },
    gas: { label: 'Gas', icon: '🔥' },
    espacios_comunes: { label: 'Espacios Comunes', icon: '🌳' },
    reparaciones: { label: 'Reparaciones', icon: '🔧' },
    imprevistos: { label: 'Imprevistos', icon: '⚠️' },
    administracion: { label: 'Administración', icon: '🏢' },
    conserjeria: { label: 'Conserjería', icon: '🧹' },
    servicios_externos: { label: 'Servicios Externos', icon: '🛠️' },
    otros: { label: 'Otros', icon: '📦' }
  }

  // Agrupar (usando los datos a mostrar)
  const gastosAgrupados = gastosAMostrar.reduce((acc, gasto) => {
    const cat = gasto.categoria && categoriasConfig[gasto.categoria] ? gasto.categoria : 'otros'
    if (!acc[cat]) acc[cat] = { items: [], totalUsd: 0 }
    acc[cat].items.push(gasto)
    acc[cat].totalUsd += Number(gasto.monto_usd)
    return acc
  }, {} as Record<string, { items: GastoComun[], totalUsd: number }>)

  // Estado para expandir categorías
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  // ── GENERADOR DE PDF PROFESIONAL ──
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Header Dark
    doc.setFillColor(24, 24, 27); 
    doc.rect(0, 0, 210, 44, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Condominio Torre 5", 14, 22);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Relación de Gastos Comunes - ${formatMes(mesActual)}`, 14, 30);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 14, 36);

    // Resumen del Mes
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMEN DEL MES", 14, 58);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const bsVal = tasa > 0 ? `Bs. ${formatUsd(totalAMostrar * tasa)}` : '---';
    doc.text(`Total a facturar: ${bsVal}`, 14, 68);
    doc.text(`Valor Referencial: $${formatUsd(totalAMostrar)}`, 14, 75);
    doc.text(`Tasa Aplicada (BCV): ${tasa > 0 ? tasa : 'No disponible'}`, 14, 82);

    // Separador
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 90, 196, 90);
    
    // Tabla
    const tableData: string[][] = [];
    gastosAMostrar.forEach(g => {
      const bs = tasa > 0 ? `Bs. ${formatUsd(g.monto_usd * tasa)}` : '---';
      const usd = `$${formatUsd(g.monto_usd)}`;
      const cat = categoriasConfig[g.categoria || 'otros']?.label || 'Otros';
      const tipo = TIPO_CONFIG[g.tipo]?.label || g.tipo;
      tableData.push([cat, g.descripcion, tipo, usd, bs]);
    });

    autoTable(doc, {
      startY: 100,
      head: [['Categoría', 'Descripción', 'Tipo', 'Total USD', 'Total Bs']],
      body: tableData,
      theme: 'plain',
      headStyles: { fillColor: [240, 240, 245], textColor: [30, 30, 30], fontStyle: 'bold', halign: 'left' },
      bodyStyles: { textColor: [60, 60, 60] },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: { cellPadding: 6, fontSize: 10 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Documento generado automáticamente por el sistema del Condominio Torre 5.", 14, finalY + 15);

    doc.save(`Relacion_Gastos_${mesActual}.pdf`);
  };

  return (
    <div style={st.overlay} className="modal-overlay" onClick={handleClose}>
      <div
        style={st.panel}
        className={`modal-card ${closing ? 'closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.topAccent} />

        {/* HEADER */}
        <div style={st.header}>
          <div style={st.headerRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  background: 'transparent', border: 'none', color: '#888',
                  fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0
                }}
              >
                ←
              </button>
              <h2 style={st.title}>Gastos Comunes</h2>
              
              {/* Selector de mes Desplegable */}
              {mesesAMostrar.length > 0 && (
                <select
                  value={mesActual}
                  onChange={(e) => { setMesActual(e.target.value); setExpandedCat(null) }}
                  style={{
                    backgroundColor: '#141414',
                    border: '1px solid #2a2a2a',
                    color: '#f97316',
                    padding: '6px 28px 6px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    appearance: 'none',
                    outline: 'none',
                    backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23f97316%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px top 50%',
                    backgroundSize: '10px auto'
                  }}
                >
                  {mesesAMostrar.map((m) => (
                    <option key={m} value={m} style={{ backgroundColor: '#141414', color: '#fff' }}>
                      {formatMes(m)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* RESUMEN */}
        {!loading && (
          <div style={st.summary} className="animate-slide-up">
            <div>
              <p style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '4px' }}>
                Total del Mes
              </p>
              <p style={{ color: '#fff', fontSize: '28px', fontWeight: 800, letterSpacing: '-1px' }}>
                Bs. {tasa > 0 ? formatUsd(totalAMostrar * tasa) : '---'}
              </p>
              <p style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>Bolívares</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '4px' }}>
                Equivalente
              </p>
              <p style={{ color: '#f97316', fontSize: '20px', fontWeight: 700 }}>
                ${formatUsd(totalAMostrar)}
              </p>
              <p style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
                USD (Ref) {tasa > 0 ? `| Tasa: ${tasa}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* BODY */}
        <div style={st.body}>
          {loading ? (
            <div style={st.empty}>
              <div className="spinner" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '13px' }}>Cargando gastos...</p>
            </div>
          ) : error ? (
            <div style={st.empty}>
              <p style={{ fontSize: '28px', marginBottom: '8px' }}>⚠️</p>
              <p style={{ fontSize: '13px', color: '#fca5a5' }}>{error}</p>
            </div>
          ) : (
            <>
              <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                {Object.entries(gastosAgrupados).map(([catKey, grupo]) => {
                  const cfg = categoriasConfig[catKey]
                  const isExpanded = expandedCat === catKey

                  return (
                    <div 
                      key={catKey} 
                      style={{ 
                        ...st.gastoCard, 
                        gridColumn: isExpanded ? '1 / -1' : 'auto',
                        borderColor: isExpanded ? '#f97316' : '#2a2a2a',
                        marginBottom: 0
                      }} 
                      className="card-interactive"
                      onClick={() => setExpandedCat(isExpanded ? null : catKey)}
                    >
                      <div style={{ ...st.row, flexWrap: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                          <div style={{ flexShrink: 0, fontSize: '24px', backgroundColor: '#222', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {cfg.icon}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ color: '#fff', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cfg.label}</p>
                            <p style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{grupo.items.length} {grupo.items.length === 1 ? 'item' : 'items'}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px' }}>
                          <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>
                            Bs. {tasa > 0 ? formatUsd(grupo.totalUsd * tasa) : '---'}
                          </p>
                          <p style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                            ${formatUsd(grupo.totalUsd)}
                          </p>
                        </div>
                      </div>

                      {/* Detalle expandido */}
                      {isExpanded && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid #2a2a2a', paddingTop: '12px' }} className="animate-slide-up">
                          {grupo.items.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: '12px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ color: '#ccc', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descripcion}</p>
                                <div style={{ marginTop: '4px' }}>
                                  <span style={st.badge(TIPO_CONFIG[item.tipo]?.color || '#888')}>{TIPO_CONFIG[item.tipo]?.label || item.tipo}</span>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Bs. {tasa > 0 ? formatUsd(item.monto_usd * tasa) : '---'}</p>
                                <p style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>${formatUsd(item.monto_usd)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Botón de PDF */}
              <div style={{ marginTop: '30px', textAlign: 'center', paddingBottom: '10px' }} className="animate-slide-up">
                <button 
                  onClick={handleDownloadPDF}
                  style={{
                    background: 'linear-gradient(90deg, #f97316, #ea580c)',
                    color: '#fff', border: 'none', padding: '14px 28px',
                    borderRadius: '12px', fontSize: '15px', fontWeight: 700,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <span style={{ fontSize: '18px' }}>📄</span> Descargar Relación en PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
