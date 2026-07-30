// Modelo de las herramientas de dibujo.
//
// Cada dibujo se ancla con dos coordenadas lógicas (x1, x2 — índices de vela,
// que pueden ser fraccionarios y caer fuera de los datos) y precios. Anclar por
// índice y no por timestamp permite arrastrar los puntos a cualquier lado,
// incluso más allá de la última vela.
//
//   fib       → p1 = inicio del movimiento, p2 = fin (el nivel 0 va en p2)
//   long/short → p1 = entrada, p2 = objetivo, stop = stop loss

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

export const TOOLS = [
  { id: 'fib', label: 'Fibonacci' },
  { id: 'long', label: 'Posición larga' },
  { id: 'short', label: 'Posición corta' },
]

let counter = 0
export function nextId() {
  counter += 1
  return `d${Date.now().toString(36)}${counter.toString(36)}`
}

/**
 * Niveles de retroceso. Igual que en TradingView, el 0 cae sobre el segundo
 * punto (el final del movimiento) y el 1 sobre el primero.
 */
export function fibLevels(p1, p2, ratios = FIB_RATIOS) {
  return ratios.map((ratio) => ({ ratio, price: p2 + (p1 - p2) * ratio }))
}

/** Stop simétrico al objetivo: relación riesgo/beneficio 1:1 de arranque. */
export function defaultStop(type, entry, target) {
  const distance = Math.abs(target - entry)
  return type === 'long' ? entry - distance : entry + distance
}

/**
 * Métricas de una posición. `valid` es false si el objetivo o el stop quedaron
 * del lado equivocado de la entrada (pasa al arrastrarlos de más).
 */
export function positionMetrics({ type, p1: entry, p2: target, stop }) {
  const reward = type === 'long' ? target - entry : entry - target
  const risk = type === 'long' ? entry - stop : stop - entry

  return {
    entry,
    target,
    stop,
    reward,
    risk,
    ratio: risk > 0 && reward > 0 ? reward / risk : null,
    rewardPct: entry ? (reward / entry) * 100 : 0,
    riskPct: entry ? (risk / entry) * 100 : 0,
    valid: reward > 0 && risk > 0,
  }
}

export function createDrawing(type, { x1, p1, x2, p2 }) {
  const drawing = { id: nextId(), type, x1, p1, x2, p2 }
  if (type === 'long' || type === 'short') {
    drawing.stop = defaultStop(type, p1, p2)
  }
  return drawing
}

/** Puntos que se pueden arrastrar, en coordenadas del dibujo. */
export function handlesOf(drawing) {
  if (drawing.type === 'fib') {
    return [
      { key: 'p1', x: drawing.x1, price: drawing.p1 },
      { key: 'p2', x: drawing.x2, price: drawing.p2 },
    ]
  }
  return [
    { key: 'p1', x: drawing.x1, price: drawing.p1 },
    { key: 'p2', x: drawing.x2, price: drawing.p2 },
    { key: 'stop', x: drawing.x2, price: drawing.stop },
  ]
}

/** Aplica el arrastre de un handle devolviendo un dibujo nuevo. */
export function moveHandle(drawing, handle, { x, price }) {
  const next = { ...drawing }
  if (handle === 'p1') {
    next.x1 = x
    next.p1 = price
  } else if (handle === 'p2') {
    next.x2 = x
    next.p2 = price
  } else if (handle === 'stop') {
    next.x2 = x
    next.stop = price
  }
  return next
}

/**
 * Tiempo (en segundos) que corresponde a una coordenada lógica, interpolando
 * entre velas y extrapolando con el paso del intervalo fuera del rango.
 */
export function timeAtLogical(bars, x, stepSeconds) {
  if (!bars.length) return null
  const last = bars.length - 1
  if (x <= 0) return bars[0].time + x * stepSeconds
  if (x >= last) return bars[last].time + (x - last) * stepSeconds

  const i = Math.floor(x)
  const frac = x - i
  return bars[i].time + frac * (bars[i + 1].time - bars[i].time)
}

/** Inversa de `timeAtLogical`. */
export function logicalAtTime(bars, time, stepSeconds) {
  if (!bars.length) return null
  const last = bars.length - 1
  if (time <= bars[0].time) return (time - bars[0].time) / stepSeconds
  if (time >= bars[last].time) return last + (time - bars[last].time) / stepSeconds

  let lo = 0
  let hi = last
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (bars[mid].time <= time) lo = mid
    else hi = mid
  }
  const span = bars[lo + 1].time - bars[lo].time
  return span > 0 ? lo + (time - bars[lo].time) / span : lo
}

/**
 * Reubica los dibujos al cambiar de intervalo: se pasa por tiempo, que es lo
 * único que sigue significando lo mismo cuando las velas se reagrupan.
 */
export function remapDrawings(drawings, fromBars, fromStep, toBars, toStep) {
  if (!fromBars.length || !toBars.length) return drawings

  return drawings.map((d) => {
    const t1 = timeAtLogical(fromBars, d.x1, fromStep)
    const t2 = timeAtLogical(fromBars, d.x2, fromStep)
    if (t1 == null || t2 == null) return d
    return {
      ...d,
      x1: logicalAtTime(toBars, t1, toStep),
      x2: logicalAtTime(toBars, t2, toStep),
    }
  })
}

export function describe(drawing) {
  if (drawing.type === 'fib') return 'Fibonacci'
  return drawing.type === 'long' ? 'Posición larga' : 'Posición corta'
}
