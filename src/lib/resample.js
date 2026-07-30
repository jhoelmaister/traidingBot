import { getInterval } from './intervals.js'

const DAY_MS = 86_400_000

// Inicio del bucket al que pertenece `ms` para un intervalo dado.
// Los intervalos hasta 3d caen en múltiplos exactos desde epoch; la semana se
// alinea al lunes y el mes al día 1, ambos en UTC (igual que Binance).
function bucketStart(ms, interval) {
  if (interval.value === '1M') {
    const d = new Date(ms)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  }

  if (interval.value === '1w') {
    const day = Math.floor(ms / DAY_MS)
    // 1970-01-01 fue jueves, de ahí el +4 para llevarlo a domingo=0.
    const dayOfWeek = (day + 4) % 7
    const daysSinceMonday = (dayOfWeek + 6) % 7
    return (day - daysSinceMonday) * DAY_MS
  }

  return Math.floor(ms / interval.ms) * interval.ms
}

/**
 * Agrupa velas a un intervalo mayor. Cada vela resultante toma la apertura de
 * la primera del bucket, el cierre de la última, el máximo/mínimo del conjunto
 * y la suma de volumen.
 *
 * Asume `bars` ordenado por tiempo ascendente (lo garantiza el parser).
 */
export function resample(bars, targetValue) {
  const interval = getInterval(targetValue)
  if (!interval || !bars.length) return bars

  const out = []
  let current = null
  let currentStart = null

  for (const bar of bars) {
    const start = bucketStart(bar.time * 1000, interval)

    if (currentStart !== start) {
      if (current) out.push(current)
      currentStart = start
      current = {
        time: Math.floor(start / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      }
      continue
    }

    if (bar.high > current.high) current.high = bar.high
    if (bar.low < current.low) current.low = bar.low
    current.close = bar.close
    current.volume += bar.volume ?? 0
  }

  if (current) out.push(current)
  return out
}
