// Preload con contextIsolation activo: sólo expone metadatos de solo lectura.
// La app sigue hablando con Binance por fetch/WebSocket del propio renderer,
// así que no hace falta ningún puente de IPC por ahora.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
})
