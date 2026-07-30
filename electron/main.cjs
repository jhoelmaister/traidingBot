// Proceso principal de Electron: abre la ventana y carga la misma app de Vite.
// En dev apunta al server de Vite (VITE_DEV_SERVER_URL); empaquetado carga dist/index.html.
const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#131722',
    title: 'BTC/USDT en vivo',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Evita el parpadeo blanco: mostramos recién cuando hay algo pintado.
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Cualquier enlace externo va al navegador del sistema, no a una ventana de Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Una sola instancia: si se abre de nuevo, enfocamos la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    createWindow()
    // En macOS es normal reabrir la ventana desde el dock sin relanzar la app.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
