import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDrawing,
  defaultStop,
  fibLevels,
  handlesOf,
  logicalAtTime,
  moveHandle,
  positionMetrics,
  remapDrawings,
  timeAtLogical,
} from '../src/lib/drawings.js'
import { resample } from '../src/lib/resample.js'

test('fibonacci: el 0 cae en el fin del movimiento y el 1 en el inicio', () => {
  // Movimiento de 100 a 200: el retroceso se mide desde 200 hacia abajo.
  const levels = fibLevels(100, 200)
  const byRatio = Object.fromEntries(levels.map((l) => [l.ratio, l.price]))

  assert.equal(byRatio[0], 200)
  assert.equal(byRatio[1], 100)
  assert.equal(byRatio[0.5], 150)
  assert.ok(Math.abs(byRatio[0.618] - 138.2) < 1e-9)
  assert.ok(Math.abs(byRatio[0.382] - 161.8) < 1e-9)
})

test('fibonacci funciona igual en un movimiento bajista', () => {
  const levels = fibLevels(200, 100)
  const byRatio = Object.fromEntries(levels.map((l) => [l.ratio, l.price]))
  assert.equal(byRatio[0], 100)
  assert.equal(byRatio[1], 200)
  assert.equal(byRatio[0.5], 150)
})

test('el stop por defecto deja una relación 1:1', () => {
  assert.equal(defaultStop('long', 100, 110), 90)
  assert.equal(defaultStop('short', 100, 90), 110)

  const largo = createDrawing('long', { x1: 0, p1: 100, x2: 10, p2: 110 })
  assert.equal(largo.stop, 90)
  assert.equal(positionMetrics(largo).ratio, 1)
})

test('métricas de una posición larga', () => {
  const m = positionMetrics({ type: 'long', p1: 100, p2: 130, stop: 90 })
  assert.equal(m.reward, 30)
  assert.equal(m.risk, 10)
  assert.equal(m.ratio, 3)
  assert.equal(m.rewardPct, 30)
  assert.equal(m.riskPct, 10)
  assert.equal(m.valid, true)
})

test('métricas de una posición corta', () => {
  const m = positionMetrics({ type: 'short', p1: 100, p2: 80, stop: 105 })
  assert.equal(m.reward, 20)
  assert.equal(m.risk, 5)
  assert.equal(m.ratio, 4)
  assert.equal(m.valid, true)
})

test('detecta objetivo o stop del lado equivocado', () => {
  // En una larga, un objetivo por debajo de la entrada no es un objetivo.
  const objetivoMalo = positionMetrics({ type: 'long', p1: 100, p2: 90, stop: 95 })
  assert.equal(objetivoMalo.valid, false)
  assert.equal(objetivoMalo.ratio, null)

  const stopMalo = positionMetrics({ type: 'long', p1: 100, p2: 110, stop: 105 })
  assert.equal(stopMalo.valid, false)

  const cortaOk = positionMetrics({ type: 'short', p1: 100, p2: 110, stop: 90 })
  assert.equal(cortaOk.valid, false, 'en una corta el objetivo va por debajo')
})

test('los tiradores cubren los puntos editables', () => {
  const fib = createDrawing('fib', { x1: 5, p1: 100, x2: 20, p2: 200 })
  assert.deepEqual(handlesOf(fib).map((h) => h.key), ['p1', 'p2'])

  const corta = createDrawing('short', { x1: 5, p1: 100, x2: 20, p2: 80 })
  assert.deepEqual(handlesOf(corta).map((h) => h.key), ['p1', 'p2', 'stop'])
  assert.equal(handlesOf(corta).find((h) => h.key === 'stop').price, 120)
})

test('mover un tirador no muta el dibujo original', () => {
  const original = createDrawing('long', { x1: 0, p1: 100, x2: 10, p2: 110 })
  const movido = moveHandle(original, 'stop', { x: 12, price: 95 })

  assert.equal(original.stop, 90, 'el original queda intacto')
  assert.equal(movido.stop, 95)
  assert.equal(movido.x2, 12)
  assert.equal(movido.p1, 100, 'la entrada no se toca')
  assert.equal(positionMetrics(movido).ratio, 2)
})

// ---------- reubicación al cambiar de intervalo ----------

const base = Date.UTC(2024, 0, 1) / 1000
const oneMin = Array.from({ length: 600 }, (_, i) => ({
  time: base + i * 60,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 1,
}))

test('timeAtLogical y logicalAtTime son inversas', () => {
  for (const x of [0, 1.5, 120, 599]) {
    const t = timeAtLogical(oneMin, x, 60)
    assert.ok(Math.abs(logicalAtTime(oneMin, t, 60) - x) < 1e-6, `falla en x=${x}`)
  }
})

test('extrapola más allá de la última vela', () => {
  const t = timeAtLogical(oneMin, 610, 60)
  assert.equal(t, base + 599 * 60 + 11 * 60)
  assert.ok(Math.abs(logicalAtTime(oneMin, t, 60) - 610) < 1e-6)

  const antes = timeAtLogical(oneMin, -5, 60)
  assert.equal(antes, base - 5 * 60)
})

test('un dibujo sigue apuntando al mismo momento al pasar de 1m a 1h', () => {
  const hourly = resample(oneMin, '1h')
  assert.equal(hourly.length, 10)

  // Punto en la vela 60 de 1m = la hora 1; y en la 180 = la hora 3.
  const drawing = createDrawing('fib', { x1: 60, p1: 100, x2: 180, p2: 200 })
  const [remapped] = remapDrawings([drawing], oneMin, 60, hourly, 3600)

  assert.ok(Math.abs(remapped.x1 - 1) < 1e-6, `x1 = ${remapped.x1}`)
  assert.ok(Math.abs(remapped.x2 - 3) < 1e-6, `x2 = ${remapped.x2}`)
  assert.equal(remapped.p1, 100, 'los precios no cambian')
  assert.equal(remapped.p2, 200)
  assert.equal(remapped.id, drawing.id)
})

test('la reubicación es reversible (1h de vuelta a 1m)', () => {
  const hourly = resample(oneMin, '1h')
  const drawing = createDrawing('long', { x1: 120, p1: 100, x2: 300, p2: 110 })

  const [aHoras] = remapDrawings([drawing], oneMin, 60, hourly, 3600)
  const [deVuelta] = remapDrawings([aHoras], hourly, 3600, oneMin, 60)

  assert.ok(Math.abs(deVuelta.x1 - 120) < 1e-6, `x1 = ${deVuelta.x1}`)
  assert.ok(Math.abs(deVuelta.x2 - 300) < 1e-6, `x2 = ${deVuelta.x2}`)
  assert.equal(deVuelta.stop, drawing.stop)
})

test('sin velas, la reubicación devuelve los dibujos tal cual', () => {
  const drawing = createDrawing('fib', { x1: 1, p1: 10, x2: 2, p2: 20 })
  assert.deepEqual(remapDrawings([drawing], [], 60, oneMin, 60), [drawing])
  assert.deepEqual(remapDrawings([drawing], oneMin, 60, [], 60), [drawing])
})
