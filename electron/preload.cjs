// Preload con contextIsolation activo: expone sólo lo que la UI necesita del
// sistema operativo. Los datos de mercado los sigue pidiendo el propio renderer
// por fetch/WebSocket, así que acá no hay nada de red.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },

  /** Abre el diálogo nativo de guardado. @returns {Promise<{saved: boolean, path?: string}>} */
  saveFile: (name, content) => ipcRenderer.invoke('save-file', { name, content }),

  /** Abre otra ventana en una vista concreta, p. ej. '#/descargar'. */
  openWindow: (hash) => ipcRenderer.invoke('open-window', hash),
})
