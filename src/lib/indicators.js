// Indicadores clásicos. Todos devuelven arrays del mismo largo que la entrada,
// con `null` en las posiciones donde el indicador todavía no tiene suficientes
// datos: así el índice i siempre corresponde a la vela i.

export function sma(values, period) {
  const out = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out

  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out

  const k = 2 / (period + 1)
  // Se arranca con una media simple para no arrastrar el sesgo del primer dato.
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// RSI con suavizado de Wilder (el que usa TradingView por defecto).
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null)
  if (values.length <= period) return out

  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1]
    if (change >= 0) gains += change
    else losses -= change
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fast = ema(values, fastPeriod)
  const slow = ema(values, slowPeriod)

  const line = values.map((_, i) => (fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]))

  // La señal es una EMA de la línea MACD, que recién existe desde slowPeriod-1.
  const start = line.findIndex((v) => v !== null)
  const signal = new Array(values.length).fill(null)
  const histogram = new Array(values.length).fill(null)

  if (start !== -1) {
    const dense = line.slice(start)
    const smoothed = ema(dense, signalPeriod)
    for (let i = 0; i < smoothed.length; i++) {
      if (smoothed[i] == null) continue
      signal[start + i] = smoothed[i]
      histogram[start + i] = dense[i] - smoothed[i]
    }
  }

  return { line, signal, histogram }
}

export function bollinger(values, period = 20, multiplier = 2) {
  const middle = sma(values, period)
  const upper = new Array(values.length).fill(null)
  const lower = new Array(values.length).fill(null)

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]
    if (mean == null) continue
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - mean
      variance += diff * diff
    }
    const deviation = Math.sqrt(variance / period)
    upper[i] = mean + deviation * multiplier
    lower[i] = mean - deviation * multiplier
  }

  return { upper, middle, lower }
}

// Convierte un array alineado por índice en los puntos {time, value} que espera
// lightweight-charts, salteando los null del período de calentamiento.
export function toLinePoints(bars, values) {
  const points = []
  for (let i = 0; i < bars.length; i++) {
    if (values[i] != null) points.push({ time: bars[i].time, value: values[i] })
  }
  return points
}
