/**
 * Utilidad de compresión y optimización de imágenes en el cliente (Browser).
 * Reduce fotografías pesadas de celulares (3MB - 8MB) a ~100KB - 200KB manteniendo
 * los textos de comprobantes y transferencias 100% nítidos y legibles.
 */

export interface OpcionesCompresion {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: 'image/webp' | 'image/jpeg'
}

export interface ResultadoCompresion {
  file: File
  originalSize: number
  compressedSize: number
  ahorroPct: number
  originalSizeStr: string
  compressedSizeStr: string
}

export function formatearBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Comprime un archivo de imagen utilizando HTML5 Canvas.
 */
export async function comprimirImagen(
  file: File,
  opciones: OpcionesCompresion = {}
): Promise<ResultadoCompresion> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.8,
    mimeType = 'image/webp',
  } = opciones

  const originalSize = file.size

  // Si el archivo no es imagen o ya es extremadamente ligero (< 100 KB), devolverlo tal cual
  if (!file.type.startsWith('image/') || originalSize < 100 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      ahorroPct: 0,
      originalSizeStr: formatearBytes(originalSize),
      compressedSizeStr: formatearBytes(originalSize),
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        let width = img.width
        let height = img.height

        // Calcular nuevas dimensiones conservando la relación de aspecto
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            maxHeight ? (height = maxHeight) : null
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // Si falla el contexto, devolver original
          resolve({
            file,
            originalSize,
            compressedSize: originalSize,
            ahorroPct: 0,
            originalSizeStr: formatearBytes(originalSize),
            compressedSizeStr: formatearBytes(originalSize),
          })
          return
        }

        // Fondo blanco para prevenir transparencias negras en caso de conversión a JPEG
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        // Determinar tipo de salida (WebP con fallback a JPEG)
        const targetMime = mimeType
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= originalSize) {
              // Si por alguna razón la compresión pesa más que el original, usar el original
              resolve({
                file,
                originalSize,
                compressedSize: originalSize,
                ahorroPct: 0,
                originalSizeStr: formatearBytes(originalSize),
                compressedSizeStr: formatearBytes(originalSize),
              })
              return
            }

            const ext = targetMime === 'image/webp' ? '.webp' : '.jpg'
            const nombreBase = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
            const compressedFile = new File([blob], `${nombreBase}${ext}`, {
              type: targetMime,
              lastModified: Date.now(),
            })

            const compressedSize = compressedFile.size
            const ahorro = Math.round(((originalSize - compressedSize) / originalSize) * 100)

            resolve({
              file: compressedFile,
              originalSize,
              compressedSize,
              ahorroPct: Math.max(0, ahorro),
              originalSizeStr: formatearBytes(originalSize),
              compressedSizeStr: formatearBytes(compressedSize),
            })
          },
          targetMime,
          quality
        )
      }

      img.onerror = () => {
        resolve({
          file,
          originalSize,
          compressedSize: originalSize,
          ahorroPct: 0,
          originalSizeStr: formatearBytes(originalSize),
          compressedSizeStr: formatearBytes(originalSize),
        })
      }

      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      resolve({
        file,
        originalSize,
        compressedSize: originalSize,
        ahorroPct: 0,
        originalSizeStr: formatearBytes(originalSize),
        compressedSizeStr: formatearBytes(originalSize),
      })
    }

    reader.readAsDataURL(file)
  })
}
