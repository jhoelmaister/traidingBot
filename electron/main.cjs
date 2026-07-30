// Proceso principal de Electron: abre las ventanas y atiende los pedidos del
// renderer (guardar archivo, abrir otra ventana).
// En dev apunta al server de Vite (VITE_DEV_SERVER_URL); empaquetado carga dist/index.html.
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const INDEX_HTML = path.join(__dirname, '..', 'dist', 'index.html')

// Sólo estas rutas internas pueden abrirse en una ventana nueva.
const ALLOWED_HASHES = new Set(['#/analisis', '#/descargar'])

const windows = new Set()

function createWindow(hash = '') {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: '#131722',
    title: 'BTC/USDT — precios y análisis',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  windows.add(win)
  win.on('closed', () => windows.delete(win))

  // Evita el parpadeo blanco: mostramos recién cuando hay algo pintado.
  win.once('ready-to-show', () => win.show())

  // Cualquier enlace externo va al navegador del sistema, no a una ventana de Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL + hash)
    if (windows.size === 1) win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(INDEX_HTML, hash ? { hash: hash.slice(1) } : undefined)
  }

  return win
}

// Diálogo nativo para guardar los datos descargados.
ipcMain.handle('save-file', async (event, { name, content }) => {
  const parent = BrowserWindow.fromWebContents(event.sender)
  const extension = path.extname(String(name ?? '')).replace('.', '') || 'csv'

  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    defaultPath: path.basename(String(name ?? 'datos.csv')),
    filters: [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  })

  if (canceled || !filePath) return { saved: false }

  await fs.writeFile(filePath, String(content ?? ''), 'utf8')
  return { saved: true, path: filePath }
})

ipcMain.handle('open-window', (_event, hash) => {
  if (!ALLOWED_HASHES.has(hash)) return false
  createWindow(hash)
  return true
})

// Una sola instancia: si se abre de nuevo, enfocamos una ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = windows
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    createWindow()
    // En macOS es normal reabrir la ventana desde el dock sin relanzar la app.
    app.on('activate', () => {
      if (windows.size === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
