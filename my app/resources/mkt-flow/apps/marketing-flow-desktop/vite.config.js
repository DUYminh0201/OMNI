import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEVELOPMENT_SERVER_PORT } from './server/runtimeConfig.js'

import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let appVersion = '1.2.2'
try {
  const rootPkgPath = path.resolve(__dirname, '../../package.json')
  if (fs.existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'))
    if (rootPkg.version) appVersion = rootPkg.version
  }
} catch {
  // Use fallback version if package.json cannot be read
}

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  css: {
    postcss: {
      plugins: []
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main.jsx'),
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/mkt-flow.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/db/**']
    },
    proxy: {
      '/api': {
        target: `http://localhost:${DEVELOPMENT_SERVER_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/downloads': {
        target: `http://localhost:${DEVELOPMENT_SERVER_PORT}`,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
