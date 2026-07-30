import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Empaquetada, la app se sirve desde file:// dentro de Electron y las rutas
// absolutas (/assets/...) no resuelven ahí; con base relativo funciona en
// Electron y en Netlify por igual.
const BASE = './'

// CSP sólo en el build: en dev rompería el HMR de Vite (scripts inline + ws local).
const csp = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' https://api.binance.com wss://stream.binance.com:9443",
          ].join('; '),
        },
        injectTo: 'head-prepend',
      },
    ]
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [react(), csp],
})
