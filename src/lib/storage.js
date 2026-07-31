// Guarda lo que uno configuró para cada archivo (dibujos, indicadores,
// intervalo) para que siga ahí al volver a abrirlo, como el layout de
// TradingView. Todo local: localStorage del navegador o de la ventana Electron.

const PREFIX = 'traidingbot:workspace:'

/** Clave por archivo: el nombre solo no alcanza si se regeneró con otro rango. */
export function workspaceKey(dataset) {
  if (!dataset) return null
  return `${PREFIX}${dataset.name}:${dataset.bars.length}`
}

export function loadWorkspace(key) {
  if (!key) return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    // Modo privado, storage lleno o deshabilitado: seguimos sin persistencia.
    return null
  }
}

export function saveWorkspace(key, data) {
  if (!key) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearWorkspace(key) {
  if (!key) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nada que hacer
  }
}
