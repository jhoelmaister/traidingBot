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
  { id: 'trend', label: 'Línea de tendencia' },
  { id: 'horizontal', label: 'Línea horizontal' },
  { id: 'fib', label: 'Fibonacci' },
  { id: 'long', label: 'Posición larga' },
  { id: 'short', label: 'Posición corta' },
]

// Niveles que ofrece el formulario de Fibonacci. Los de extensión (>1) vienen
// apagados, igual que en TradingView.
export const DEFAULT_FIB_LEVELS = [
  { ratio: 0, color: '#787b86', visible: true, width: 1, dash: 'solid' },
  { ratio: 0.236, color: '#f23645', visible: true, width: 1, dash: 'solid' },
  { ratio: 0.382, color: '#ff9800', visible: true, width: 1, dash: 'solid' },
  { ratio: 0.5, color: '#4caf50', visible: true, width: 1, dash: 'solid' },
  { ratio: 0.618, color: '#089981', visible: true, width: 1, dash: 'solid' },
  { ratio: 0.786, color: '#00bcd4', visible: true, width: 1, dash: 'solid' },
  { ratio: 1, color: '#787b86', visible: true, width: 1, dash: 'solid' },
  { ratio: 1.272, color: '#f0b90b', visible: false, width: 1, dash: 'dashed' },
  { ratio: 1.618, color: '#2962ff', visible: false, width: 1, dash: 'dashed' },
  { ratio: 2.618, color: '#f23645', visible: false, width: 1, dash: 'dashed' },
  { ratio: 3.618, color: '#9c27b0', visible: false, width: 1, dash: 'dashed' },
  { ratio: 4.236, color: '#e91e63', visible: false, width: 1, dash: 'dashed' },
]

export const DASH_STYLES = [
  { value: 'solid', label: 'Continua', pattern: null },
  { value: 'dashed', label: 'Rayas', pattern: [6, 4] },
  { value: 'dotted', label: 'Puntos', pattern: [2, 3] },
]

export const LABEL_POSITIONS = [
  { value: 'left', label: 'Izquierda' },
  { value: 'right', label: 'Derecha' },
]

export const LABEL_CONTENTS = [
  { value: 'both', label: 'Porcentaje y precio' },
  { value: 'percent', label: 'Sólo porcentaje' },
  { value: 'price', label: 'Sólo precio' },
]

export function dashPattern(value) {
  return DASH_STYLES.find((d) => d.value === value)?.pattern ?? null
}

export const EXTEND_MODES = [
  { value: 'none', label: 'No ampliar' },
  { value: 'right', label: 'Hacia la derecha' },
  { value: 'both', label: 'Hacia ambos lados' },
]

export const DEFAULT_FIB_STYLE = {
  trendLine: true,
  trendColor: '#b2b5be',
  extend: 'right',
  background: true,
  labelPosition: 'left',
  labelContent: 'both',
}

export const DEFAULT_POSITION_STYLE = {
  profitColor: '#089981',
  lossColor: '#f23645',
  showLabels: true,
  background: true,
}

// Tamaño de cuenta y riesgo asumido, para que la posición diga cuántas unidades
// operar y cuánta plata se juega — como el panel de la herramienta de TradingView.
export const DEFAULT_RISK = { accountSize: 1000, riskPercent: 1 }

export const DEFAULT_LINE_STYLE = {
  lineColor: '#2962ff',
  lineWidth: 2,
  lineStyle: 'solid', // solid, dashed, dotted
}

export function defaultStyle(type) {
  if (type === 'fib') {
    return { ...DEFAULT_FIB_STYLE, levels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })) }
  }
  if (type === 'trend' || type === 'horizontal') {
    return { ...DEFAULT_LINE_STYLE }
  }
  return { ...DEFAULT_POSITION_STYLE }
}

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
  const drawing = { id: nextId(), type, x1, p1, x2, p2, style: defaultStyle(type) }
  if (type === 'long' || type === 'short') {
    drawing.stop = defaultStop(type, p1, p2)
    drawing.risk = { ...DEFAULT_RISK }
  }
  return drawing
}

/** Desplaza el dibujo entero: se arrastra el cuerpo, no un tirador. */
export function moveDrawing(drawing, deltaX, deltaPrice) {
  const next = {
    ...drawing,
    x1: drawing.x1 + deltaX,
    x2: drawing.x2 + deltaX,
    p1: drawing.p1 + deltaPrice,
    p2: drawing.p2 + deltaPrice,
  }
  if (drawing.stop != null) next.stop = drawing.stop + deltaPrice
  return next
}

/**
 * Invierte el dibujo. En una posición la da vuelta (larga ↔ corta, con objetivo
 * y stop reflejados respecto de la entrada, como el "reverse" de TradingView);
 * en Fibonacci y en la línea de tendencia intercambia los extremos. La línea
 * horizontal no tiene nada que invertir.
 */
export function reverseDrawing(drawing) {
  if (drawing.type === 'long' || drawing.type === 'short') {
    return {
      ...drawing,
      type: drawing.type === 'long' ? 'short' : 'long',
      p2: 2 * drawing.p1 - drawing.p2,
      stop: 2 * drawing.p1 - drawing.stop,
    }
  }
  if (drawing.type === 'horizontal') return drawing
  return { ...drawing, p1: drawing.p2, p2: drawing.p1 }
}

/** Copia desplazada, para duplicar un objeto sin volver a dibujarlo. */
export function cloneDrawing(drawing, deltaX = 0, deltaPrice = 0) {
  return { ...structuredClone(moveDrawing(drawing, deltaX, deltaPrice)), id: nextId() }
}

/**
 * Métricas de la posición más el dimensionamiento: con el tamaño de cuenta y el
 * porcentaje de riesgo sale cuánta plata se arriesga y cuántas unidades operar.
 */
export function positionRisk(drawing) {
  const metrics = positionMetrics(drawing)
  const { accountSize, riskPercent } = drawing.risk ?? DEFAULT_RISK

  const riskAmount = (accountSize * riskPercent) / 100
  const quantity = metrics.risk > 0 ? riskAmount / metrics.risk : null

  return {
    ...metrics,
    accountSize,
    riskPercent,
    riskAmount,
    quantity,
    rewardAmount: quantity != null && metrics.reward > 0 ? quantity * metrics.reward : null,
  }
}

/** Niveles visibles de un Fibonacci, ya resueltos a precio. */
export function visibleFibLevels(drawing) {
  const levels = drawing.style?.levels ?? DEFAULT_FIB_LEVELS
  return levels
    .filter((level) => level.visible)
    .map((level) => ({
      ...level,
      price: drawing.p2 + (drawing.p1 - drawing.p2) * level.ratio,
    }))
}

/** Puntos que se pueden arrastrar, en coordenadas del dibujo. */
export function handlesOf(drawing) {
  if (drawing.type === 'horizontal') {
    return [
      { key: 'p1', x: drawing.x1, price: drawing.p1 },
    ]
  }
  if (drawing.type === 'fib' || drawing.type === 'trend') {
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
    if (drawing.type === 'horizontal') {
      // Para una línea horizontal infinitamente extendida, mantenemos x2 alineado con x1
      next.x2 = x
      next.p2 = price
    }
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
  if (drawing.type === 'trend') return 'Línea de tendencia'
  if (drawing.type === 'horizontal') return 'Línea horizontal'
  if (drawing.type === 'fib') return 'Fibonacci'
  return drawing.type === 'long' ? 'Posición larga' : 'Posición corta'
}
