import type { jsPDF as JsPDFClass } from 'jspdf'
import type autoTableType from 'jspdf-autotable'

export type JsPDFInstance = JsPDFClass

interface PdfLibs {
  jsPDF: typeof JsPDFClass
  autoTable: typeof autoTableType
}

let cachedPdfLibsPromise: Promise<PdfLibs> | null = null

/**
 * Carga dinámica bajo demanda de jsPDF y jspdf-autotable con caché en memoria.
 * Evita incluir ~500 kB en el bundle inicial cuando el usuario no descarga PDFs.
 */
export function loadPdfLibs(): Promise<PdfLibs> {
  if (!cachedPdfLibsPromise) {
    cachedPdfLibsPromise = Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
      .then(([jspdfMod, autoTableMod]) => ({
        jsPDF: (jspdfMod.jsPDF || jspdfMod.default) as typeof JsPDFClass,
        autoTable: (autoTableMod.default || (autoTableMod as any)) as typeof autoTableType,
      }))
      .catch((err) => {
        cachedPdfLibsPromise = null
        throw err
      })
  }
  return cachedPdfLibsPromise
}
