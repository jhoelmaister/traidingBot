// Guardar archivos funciona distinto según dónde corra la app: en escritorio
// abrimos el diálogo nativo de Windows/macOS/Linux; en el navegador disparamos
// una descarga común. La UI llama siempre a la misma función.

export const isDesktop = typeof window !== 'undefined' && window.desktop?.isDesktop === true

/**
 * @returns {Promise<{saved: boolean, path?: string}>} `saved: false` si el
 * usuario canceló el diálogo.
 */
export async function saveTextFile(suggestedName, text) {
  if (isDesktop && window.desktop.saveFile) {
    return window.desktop.saveFile(suggestedName, text)
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Damos tiempo a que el navegador tome el blob antes de liberarlo.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  return { saved: true }
}
