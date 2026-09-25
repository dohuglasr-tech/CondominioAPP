import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { obtenerPagos, Pago } from '../../data/recibosService'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Props {
  onClose: () => void
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pendiente: { label: 'Pendiente',  color: '#f59e0b', icon: '⏳' },
  aprobado:  { label: 'Aprobado',   color: '#10b981', icon: '✅' },
  rechazado: { label: 'Rechazado',  color: '#ef4444', icon: '❌' },
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatBs(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RecibosPanel({ onClose }: Props) {
  const { perfil } = useAuth()
  const apartamentoId = perfil?.apartamento_id ?? ''

  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null)

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => onClose(), 250)
  }, [onClose])

  useEffect(() => {
    const loadMock = () => {
      setPagos([
        {
          id: 'mock-1',
          apartamento_id: apartamentoId || 'mock-apt',
          monto_bs: 4500.50,
          estado: 'aprobado',
          fecha_pago: '2025-01-15',
          banco_origen: 'Banesco',
          numero_referencia: '12345678',
          created_at: '2025-01-15T10:00:00Z',
          banco_destino: '', comprobante_url: '', monto_usd: 120, tasa_bcv: 36.5, user_id: ''
        }
      ] as Pago[])
      setLoading(false)
    }

    if (!apartamentoId) {
      loadMock()
      return
    }

    obtenerPagos(apartamentoId).then(({ data, error: err }) => {
      if (data && data.length > 0) {
        setPagos(data)
      } else {
        loadMock()
        return // loadMock already sets loading to false
      }
      if (err) setError(err)
      setLoading(false)
    })
  }, [apartamentoId])

  const generarPDFRecibo = (pago: Pago) => {
    const doc = new jsPDF();
    
    // Configuración de Colores
    const cAccent = [249, 115, 22]; // Naranja
    const cDark = [30, 30, 30];     // Oscuro
    const cGray = [100, 100, 100];  // Gris oscuro
    
    // HEADER BANNER
    doc.setFillColor(cDark[0], cDark[1], cDark[2]);
    doc.rect(0, 0, 210, 35, "F");
    
    doc.setTextColor(cAccent[0], cAccent[1], cAccent[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("RECIBO DE CONDOMINIO", 105, 16, { align: "center" });

    doc.setTextColor(200, 200, 200);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("CORREO: juntacondominioocutuy5@gmail.com   |   RIF: J-296749485", 105, 24, { align: "center" });
    doc.text("URBANIZACION CASA BLANCA RESIDENCIAS OCUTUY '5'", 105, 30, { align: "center" });
    
    // CAJA DE INFORMACIÓN DEL PROPIETARIO
    doc.setDrawColor(cAccent[0], cAccent[1], cAccent[2]);
    doc.setLineWidth(0.5);
    doc.line(14, 42, 196, 42);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PROPIETARIO:", 14, 50);
    doc.setFont("helvetica", "normal");
    doc.text(perfil?.nombre || "Residente", 45, 50);

    doc.setFont("helvetica", "bold");
    doc.text("ALÍCUOTA:", 135, 50);
    doc.setFont("helvetica", "normal");
    doc.text("1.59%", 160, 50);

    doc.setFont("helvetica", "bold");
    doc.text("MES/AÑO:", 135, 56);
    doc.setFont("helvetica", "normal");
    doc.text("SEPTIEMBRE 2026", 160, 56);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 62, 196, 62);

    // TABLA DE GASTOS COMUNES
    const bodyGastos = [
      ['Limpieza del Edificio', '1.000,00', '1,25'],
      ['Bono de alimentacion y colaboracion en limpieza...', '77.137,00', '96,28'],
      ['Mantenimiento de Ascensor 08-2026', '41.997,50', '52,42'],
      ['Administracion Guardias y Comision bancaria', '8.140,57', '10,16'],
      ['Copias Recibos de Condominio 08-2026', '7.980,00', '9,96'],
      ['CORPOELEC MES 08-2026', '50.347,84', '62,84'],
      ['Hidrocapital Agosto 2026', '34.442,57', '42,99'],
      ['Instalacion de Lamparas', '26.132,05', '32,62'],
      ['Arreglo de frenos Ascensor', '14.932,60', '18,64'],
      ['Reparacion porton, graduacion y rolineras', '46.264,20', '57,75'],
      ['Compra Materiales Limpieza', '7.130,00', '8,90'],
      ['Mano de obra arreglo platabanda y filtraciones', '76.117,02', '95,01']
    ];

    autoTable(doc, {
      startY: 68,
      headStyles: { fillColor: cDark, textColor: [255,255,255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 122 },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 30 }
      },
      head: [['DETALLES DE GASTOS COMUNES', 'BOLÍVARES', 'DÓLAR $']],
      body: bodyGastos,
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });

    const finalY = (doc as any).lastAutoTable.finalY;

    // TOTALES
    autoTable(doc, {
      startY: finalY,
      theme: 'plain',
      columnStyles: {
        0: { cellWidth: 122, halign: 'right', fontStyle: 'bold' },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 30 }
      },
      body: [
        ['SUB TOTAL', '500.451,34', '624,65'],
        ['FONDO DE RESERVA', '150.135,40', '187,40'],
        ['TOTAL', '650.586,74', '812,05']
      ]
    });

    const totalesY = (doc as any).lastAutoTable.finalY;

    // TOTAL A PAGAR (ALICUOTA APLICADA)
    autoTable(doc, {
      startY: totalesY,
      theme: 'grid',
      headStyles: { fillColor: cAccent, textColor: [255,255,255], halign: 'right' },
      columnStyles: {
        0: { cellWidth: 122, halign: 'right', fontStyle: 'bold', textColor: cAccent },
        1: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        2: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
      },
      body: [
        ['TOTAL A PAGAR (1.59%)', '10.344,33', '12,91']
      ]
    });

    const alertY = (doc as any).lastAutoTable.finalY + 5;

    // BANNER ALERTA
    doc.setFillColor(254, 240, 138); // Amarillo claro
    doc.rect(14, alertY, 182, 10, "F");
    doc.setTextColor(202, 138, 4); // Amarillo oscuro/naranja
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("ATENCION: PAGAR 12,91 $ ANCLADO AL $ BCV DEL DIA DE SU PAGO", 105, alertY + 6.5, { align: "center" });

    // NOTAS Y BANCOS
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const notasY = alertY + 16;
    doc.setFont("helvetica", "bold");
    doc.text("NOTAS Y DATOS DE PAGO:", 14, notasY);
    doc.setFont("helvetica", "normal");
    
    const notasText = "DEPOSITAR CUENTA CORRIENTE NRO 0175-0525-4100-7575-1351 BANCO BICENTENARIO A NOMBRE ZORAYA ALMEIDA CEDULA V-6089037. VERIFICAR QUE SE REALICE LA TRANSACCION.\n\nVECINOS FAVOR NO LANZAR BOTELLAS, VIDRIOS POR EL BAJANTE ES PELIGROSO. FAVOR REVISAR SUS FILTRACIONES Y AIRES ACONDICIONADOS.";
    
    doc.text(notasText, 14, notasY + 5, { maxWidth: 180 });
    
    doc.save(`Recibo_Condominio_Ocutuy5.pdf`);
  };

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
      padding: '0',
      width: '100%',
      fontFamily: "'Inter', sans-serif",
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    },
    header: {
      padding: '28px 28px 20px 28px',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: 0,
    },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700 },
    closeBtn: {
      background: '#2a2a2a', border: 'none', color: '#666',
      width: '34px', height: '34px', borderRadius: '50%',
      cursor: 'pointer', fontSize: '14px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
    },
    body: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px 28px 28px 28px',
    },
    card: {
      backgroundColor: '#141414',
      border: '1px solid #2a2a2a',
      borderRadius: '14px',
      padding: '18px 20px',
      marginBottom: '10px',
      cursor: 'pointer',
      transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), border-color 0.2s, background-color 0.2s',
    },
    row: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: `${color}18`, border: `1px solid ${color}30`,
      color, fontSize: '11px', fontWeight: 700,
      padding: '4px 10px', borderRadius: '999px',
    }),
    empty: {
      textAlign: 'center' as const,
      padding: '48px 20px',
      color: '#666',
    },
    // Detalle expandido
    detail: {
      backgroundColor: '#111',
      border: '1px solid #2a2a2a',
      borderRadius: '14px',
      padding: '20px',
      marginTop: '8px',
    },
    detailRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px solid #1e1e1e',
      fontSize: '13px',
    },
  }

  return (
    <div style={st.overlay}>
      <div style={st.panel}>
        {/* Acento superior naranja */}
        <div style={{
          position: 'absolute', top: 0, left: '20px', right: '20px', height: '3px',
          background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
          borderRadius: '0 0 4px 4px',
        }} />

        {/* HEADER */}
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            <h2 style={st.title}>Mis Recibos</h2>
          </div>
        </div>

        {/* BODY */}
        <div style={st.body}>
          {loading ? (
            <div style={st.empty}>
              <div className="spinner" style={{ margin: '0 auto 12px auto' }}></div>
              <p style={{ fontSize: '13px' }}>Cargando recibos...</p>
            </div>
          ) : error ? (
            <div style={st.empty}>
              <p style={{ fontSize: '28px', marginBottom: '8px' }}>⚠️</p>
              <p style={{ fontSize: '13px', color: '#fca5a5' }}>{error}</p>
            </div>
          ) : pagos.length === 0 ? (
            <div style={st.empty}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>📭</p>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#888', marginBottom: '4px' }}>
                Aún no has reportado pagos
              </p>
              <p style={{ fontSize: '13px' }}>
                Cuando reportes un pago, aparecerá aquí con su estado.
              </p>
            </div>
          ) : (
            <div className="stagger-children">
              {pagos.map((pago) => {
                const cfg = ESTADO_CONFIG[pago.estado] || ESTADO_CONFIG.pendiente
                const isSelected = selectedPago?.id === pago.id

                return (
                  <div key={pago.id}>
                    <div
                      style={{
                        ...st.card,
                        borderColor: isSelected ? '#3a3a3a' : '#2a2a2a',
                      }}
                      className="card-interactive"
                      onClick={() => setSelectedPago(isSelected ? null : pago)}
                    >
                      <div style={st.row}>
                        <div>
                          <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>
                            Bs. {formatBs(pago.monto_bs)}
                          </p>
                          <p style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                            {formatFecha(pago.created_at)} · {pago.banco_origen}
                          </p>
                        </div>
                        <div style={st.badge(cfg.color)}>
                          {cfg.icon} {cfg.label}
                        </div>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {isSelected && (
                      <div style={st.detail} className="animate-slide-up">
                        <div style={st.detailRow}>
                          <span style={{ color: '#888' }}>Referencia</span>
                          <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 600 }}>
                            {pago.numero_referencia}
                          </span>
                        </div>
                        <div style={st.detailRow}>
                          <span style={{ color: '#888' }}>Banco</span>
                          <span style={{ color: '#fff' }}>{pago.banco_origen}</span>
                        </div>
                        <div style={st.detailRow}>
                          <span style={{ color: '#888' }}>Estado</span>
                          <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                        </div>
                        {pago.nota_admin && (
                          <div style={{ ...st.detailRow, borderBottom: 'none', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#888' }}>Nota del administrador</span>
                            <span style={{ color: '#fca5a5', fontSize: '12px' }}>{pago.nota_admin}</span>
                          </div>
                        )}
                        {/* BOTÓN DESCARGAR PDF */}
                        <button
                          onClick={() => generarPDFRecibo(pago)}
                          style={{
                            marginTop: '16px',
                            width: '100%',
                            backgroundColor: '#2a2a2a',
                            color: '#fff',
                            border: '1px solid #333',
                            borderRadius: '10px',
                            padding: '12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f97316'; e.currentTarget.style.borderColor = '#ea580c' }}
                          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#2a2a2a'; e.currentTarget.style.borderColor = '#333' }}
                        >
                          📄 Descargar Recibo Digital (PDF)
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
