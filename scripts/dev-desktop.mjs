// Levanta Vite en modo dev y abre Electron apuntando a esa URL.
// Usa la API Node de Vite en vez de sumar dependencias tipo concurrently/wait-on:
// así Electron arranca recién cuando el server ya está escuchando.
import { spawn } from 'node:child_process'
import electronBinary from 'electron'
import { createServer } from 'vite'

const server = await createServer({ mode: 'development' })
await server.listen()
server.printUrls()

const url = server.resolvedUrls?.local?.[0]
if (!url) {
  await server.close()
  throw new Error('Vite no expuso una URL local; no se puede abrir la ventana de escritorio.')
}

// Los flags extra pasan tal cual a Electron: `npm run desktop -- --no-sandbox`
// hace falta, por ejemplo, cuando se corre como root dentro de un contenedor.
const child = spawn(electronBinary, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})

let closing = false
async function shutdown(code) {
  if (closing) return
  closing = true
  await server.close()
  process.exit(code ?? 0)
}

// Cerrar la ventana termina el dev server, y Ctrl+C cierra la ventana.
child.on('close', (code) => shutdown(code))
child.on('error', async (err) => {
  console.error(err)
  await shutdown(1)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
