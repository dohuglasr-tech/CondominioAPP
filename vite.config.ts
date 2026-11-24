import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) {
            return 'vendor-supabase'
          }
          if (/node_modules[\\/](jspdf|jspdf-autotable|html2canvas|canvg|fflate|fast-png|dompurify)[\\/]/.test(id)) {
            return 'vendor-pdf'
          }
          if (/node_modules[\\/]exceljs[\\/]/.test(id)) {
            return 'vendor-excel'
          }
          return undefined
        },
      },
    },
  },
})
