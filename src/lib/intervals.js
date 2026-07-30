// Intervalos soportados por Binance, en el mismo orden que usa su API.
// `ms` es la duración nominal: para 1M es aproximada (se usa sólo para estimar
// cuántas velas entran en un período), el agrupado real es por mes calendario.
export const INTERVALS = [
  { value: '1m', label: '1 minuto', ms: 60_000 },
  { value: '3m', label: '3 minutos', ms: 180_000 },
  { value: '5m', label: '5 minutos', ms: 300_000 },
  { value: '15m', label: '15 minutos', ms: 900_000 },
  { value: '30m', label: '30 minutos', ms: 1_800_000 },
  { value: '1h', label: '1 hora', ms: 3_600_000 },
  { value: '2h', label: '2 horas', ms: 7_200_000 },
  { value: '4h', label: '4 horas', ms: 14_400_000 },
  { value: '6h', label: '6 horas', ms: 21_600_000 },
  { value: '8h', label: '8 horas', ms: 28_800_000 },
  { value: '12h', label: '12 horas', ms: 43_200_000 },
  { value: '1d', label: '1 día', ms: 86_400_000 },
  { value: '3d', label: '3 días', ms: 259_200_000 },
  { value: '1w', label: '1 semana', ms: 604_800_000 },
  { value: '1M', label: '1 mes', ms: 2_629_800_000 },
]

const BY_VALUE = new Map(INTERVALS.map((i) => [i.value, i]))

export function getInterval(value) {
  return BY_VALUE.get(value) ?? null
}

export function intervalMs(value) {
  return BY_VALUE.get(value)?.ms ?? null
}

export function intervalLabel(value) {
  return BY_VALUE.get(value)?.label ?? value
}

// Intervalo más chico cuya duración es >= la de los datos que ya tenemos:
// agregar velas hacia arriba se puede, inventar detalle hacia abajo no.
export function intervalsAtLeast(ms) {
  return INTERVALS.filter((i) => i.ms >= ms)
}

// Detecta el intervalo de un set de velas a partir de la diferencia más
// frecuente entre aperturas consecutivas (la mediana ignora los huecos).
export function detectInterval(bars) {
  if (!bars || bars.length < 2) return null

  const deltas = []
  const limit = Math.min(bars.length - 1, 500)
  for (let i = 1; i <= limit; i++) {
    const delta = (bars[i].time - bars[i - 1].time) * 1000
    if (delta > 0) deltas.push(delta)
  }
  if (!deltas.length) return null

  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]

  // Buscamos el intervalo conocido más cercano; con 10% de tolerancia alcanza
  // porque los intervalos están bien separados entre sí.
  let best = null
  let bestDiff = Infinity
  for (const interval of INTERVALS) {
    const diff = Math.abs(interval.ms - median)
    if (diff < bestDiff) {
      bestDiff = diff
      best = interval
    }
  }
  return best && bestDiff <= best.ms * 0.1 ? best : null
}
