import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import replace from '@rollup/plugin-replace'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Remplacer les URLs CDN externes pour conformité Chrome Web Store Manifest V3
    // jsPDF inclut une référence à pdfobject CDN qu'on n'utilise pas
    replace({
      preventAssignment: true,
      values: {
        'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js': '',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/content-script': resolve(__dirname, 'src/content/content-script.ts'),
        'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html'),
        'fullscreen/index': resolve(__dirname, 'src/fullscreen/index.html'),
        'guide/index': resolve(__dirname, 'src/guide/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          if (facadeModuleId?.includes('service-worker')) {
            return 'background/service-worker.js'
          }
          if (facadeModuleId?.includes('content-script')) {
            return 'content/content-script.js'
          }
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.html')) {
            return '[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})