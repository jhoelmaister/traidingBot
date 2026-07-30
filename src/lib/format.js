const LOCALE = 'es-AR'

export function formatNumber(value) {
  return Number(value).toLocaleString(LOCALE)
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatPrice(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Fecha UTC legible; con `withTime` incluye hora y minutos. */
export function formatDate(seconds, withTime = true) {
  if (seconds == null) return '—'
  const d = new Date(seconds * 1000)
  const date = d.toISOString().slice(0, 10)
  return withTime ? `${date} ${d.toISOString().slice(11, 16)} UTC` : date
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes} min ${rest} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
