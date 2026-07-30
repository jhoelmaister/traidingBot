import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resample } from '../src/lib/resample.js'
import { sma, ema, rsi, macd, bollinger } from '../src/lib/indicators.js'
import { parseKlines, barsToCsv, normalizeTime } from '../src/lib/klines.js'
import { detectInterval, intervalsAtLeast } from '../src/lib/intervals.js'
import { estimateCandles, yearRange } from '../src/lib/binance.js'

// ---------- normalizeTime ----------
test('normalizeTime detecta segundos/ms/µs/ISO', () => {
  assert.equal(normalizeTime(1700000000), 1700000000)
  assert.equal(normalizeTime(1700000000000), 1700000000)
  assert.equal(normalizeTime(1700000000000000), 1700000000)
  assert.equal(normalizeTime('2023-11-14T22:13:20Z'), 1700000000)
  assert.equal(normalizeTime('no es fecha'), null)
})

// ---------- resample ----------
// 60 velas de 1 minuto arrancando en un límite de hora exacto.
const base = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000
const oneMin = Array.from({ length: 60 }, (_, i) => ({
  time: base + i * 60,
  open: 100 + i,
  high: 200 + i,
  low: 50 + i,
  close: 150 + i,
  volume: 1,
}))

test('resample 1m -> 5m agrupa de a 5 y toma OHLC correcto', () => {
  const out = resample(oneMin, '5m')
  assert.equal(out.length, 12)
  assert.equal(out[0].time, base)
  assert.equal(out[0].open, oneMin[0].open)
  assert.equal(out[0].close, oneMin[4].close)
  assert.equal(out[0].high, Math.max(...oneMin.slice(0, 5).map((b) => b.high)))
  assert.equal(out[0].low, Math.min(...oneMin.slice(0, 5).map((b) => b.low)))
  assert.equal(out[0].volume, 5)
})

test('resample 1m -> 1h da una sola vela', () => {
  const out = resample(oneMin, '1h')
  assert.equal(out.length, 1)
  assert.equal(out[0].open, 100)
  assert.equal(out[0].close, 209)
  assert.equal(out[0].volume, 60)
})

test('resample semanal alinea al lunes UTC', () => {
  // 2024-01-03 fue miércoles; su semana empieza el lunes 2024-01-01.
  const daily = [
    { time: Date.UTC(2024, 0, 3) / 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
    { time: Date.UTC(2024, 0, 5) / 1000, open: 2, high: 3, low: 1, close: 2.5, volume: 1 },
    { time: Date.UTC(2024, 0, 8) / 1000, open: 3, high: 4, low: 2, close: 3.5, volume: 1 },
  ]
  const out = resample(daily, '1w')
  assert.equal(out.length, 2)
  assert.equal(out[0].time, Date.UTC(2024, 0, 1) / 1000)
  assert.equal(new Date(out[0].time * 1000).getUTCDay(), 1, 'debe ser lunes')
  assert.equal(out[1].time, Date.UTC(2024, 0, 8) / 1000)
  assert.equal(out[0].close, 2.5)
})

test('resample mensual usa el día 1 de cada mes', () => {
  const daily = [
    { time: Date.UTC(2024, 0, 15) / 1000, open: 1, high: 2, low: 1, close: 2, volume: 1 },
    { time: Date.UTC(2024, 0, 31) / 1000, open: 2, high: 5, low: 1, close: 3, volume: 1 },
    { time: Date.UTC(2024, 1, 1) / 1000, open: 3, high: 4, low: 3, close: 4, volume: 1 },
  ]
  const out = resample(daily, '1M')
  assert.equal(out.length, 2)
  assert.equal(out[0].time, Date.UTC(2024, 0, 1) / 1000)
  assert.equal(out[0].high, 5)
  assert.equal(out[1].time, Date.UTC(2024, 1, 1) / 1000)
})

// ---------- indicadores ----------
test('sma con valores conocidos', () => {
  const out = sma([1, 2, 3, 4, 5], 3)
  assert.deepEqual(out, [null, null, 2, 3, 4])
})

test('ema arranca con media simple y suaviza', () => {
  const out = ema([1, 2, 3, 4, 5], 3)
  assert.deepEqual(out.slice(0, 2), [null, null])
  assert.equal(out[2], 2) // (1+2+3)/3
  assert.equal(out[3], 4 * 0.5 + 2 * 0.5) // k = 2/(3+1) = 0.5
  assert.equal(out[4], 5 * 0.5 + 3 * 0.5)
})

test('rsi = 100 cuando todo sube y 0 cuando todo baja', () => {
  const subiendo = Array.from({ length: 30 }, (_, i) => 100 + i)
  const bajando = Array.from({ length: 30 }, (_, i) => 100 - i)
  assert.equal(rsi(subiendo, 14).at(-1), 100)
  assert.equal(rsi(bajando, 14).at(-1), 0)
  assert.equal(rsi(subiendo, 14)[13], null, 'no hay valor antes del período')
  assert.notEqual(rsi(subiendo, 14)[14], null)
})

test('rsi contra un caso de referencia de Wilder', () => {
  // Serie clásica del libro de Wilder: el primer RSI(14) da ~70.53.
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
  ]
  const value = rsi(closes, 14)[14]
  assert.ok(Math.abs(value - 70.53) < 0.1, `esperaba ~70.53 y dio ${value}`)
})

test('macd: línea, señal e histograma alineados', () => {
  const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10)
  const { line, signal, histogram } = macd(closes)
  assert.equal(line.length, 100)
  assert.equal(line[24], null, 'sin valor antes de la EMA lenta')
  assert.notEqual(line[25], null)
  const i = 60
  assert.ok(Math.abs(histogram[i] - (line[i] - signal[i])) < 1e-9)
})

test('bollinger: bandas simétricas alrededor de la media', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 4))
  const { upper, middle, lower } = bollinger(closes, 20, 2)
  const i = 30
  assert.ok(Math.abs((upper[i] + lower[i]) / 2 - middle[i]) < 1e-9)
  assert.ok(upper[i] > middle[i] && middle[i] > lower[i])
})

test('indicadores con menos datos que el período no explotan', () => {
  assert.deepEqual(sma([1, 2], 20), [null, null])
  assert.deepEqual(ema([1, 2], 20), [null, null])
  assert.deepEqual(rsi([1, 2], 14), [null, null])
  assert.equal(bollinger([1, 2], 20).upper.length, 2)
})

// ---------- parseo de archivos ----------
test('CSV de Binance sin encabezado (formato posicional)', () => {
  const csv = [
    '1704067200000,42000.1,42100.5,41900.0,42050.2,10.5,1704067259999,0,0,0,0,0',
    '1704067260000,42050.2,42200.0,42000.0,42150.7,8.3,1704067319999,0,0,0,0,0',
  ].join('\n')
  const { bars } = parseKlines(csv, 'BTCUSDT-1m-2024-01.csv')
  assert.equal(bars.length, 2)
  assert.equal(bars[0].time, 1704067200)
  assert.equal(bars[0].open, 42000.1)
  assert.equal(bars[1].close, 42150.7)
  assert.equal(bars[0].volume, 10.5)
})

test('CSV con encabezado y nombres alternativos', () => {
  const csv = 'Date,Open,High,Low,Close,Volume\n2024-01-01T00:00:00Z,100,110,90,105,3\n2024-01-01T00:01:00Z,105,115,95,112,4'
  const { bars } = parseKlines(csv, 'export.csv')
  assert.equal(bars.length, 2)
  assert.equal(bars[0].time, Date.UTC(2024, 0, 1) / 1000)
  assert.equal(bars[1].high, 115)
})

test('CSV con punto y coma y columnas en español', () => {
  const csv = 'fecha;apertura;maximo;minimo;cierre;volumen\n1704067200000;1;2;0.5;1.5;9'
  const { bars } = parseKlines(csv, 'datos.csv')
  assert.equal(bars.length, 1)
  assert.equal(bars[0].high, 2)
  assert.equal(bars[0].volume, 9)
})

test('JSON crudo de la API de Binance', () => {
  const json = JSON.stringify([
    [1704067200000, '42000.1', '42100.5', '41900.0', '42050.2', '10.5', 1704067259999],
    [1704067260000, '42050.2', '42200.0', '42000.0', '42150.7', '8.3', 1704067319999],
  ])
  const { bars } = parseKlines(json, 'klines.json')
  assert.equal(bars.length, 2)
  assert.equal(bars[0].open, 42000.1)
})

test('JSON de objetos', () => {
  const json = JSON.stringify([
    { time: 1704067200, open: 1, high: 2, low: 0.5, close: 1.5, volume: 2 },
    { time: 1704067260, open: 1.5, high: 3, low: 1, close: 2.5, volume: 3 },
  ])
  const { bars } = parseKlines(json, 'bars.json')
  assert.equal(bars.length, 2)
  assert.equal(bars[1].close, 2.5)
})

test('ordena, deduplica y cuenta filas inválidas', () => {
  const csv = [
    'open_time,open,high,low,close,volume',
    '1704067260000,2,3,1,2.5,1',
    '1704067200000,1,2,0.5,1.5,1',
    '1704067260000,9,9,9,9.9,1',
    'basura,x,y,z,w,v',
  ].join('\n')
  const { bars, skipped } = parseKlines(csv, 'raro.csv')
  assert.equal(bars.length, 2, 'dos tiempos únicos')
  assert.equal(bars[0].time, 1704067200)
  assert.equal(bars[1].close, 9.9, 'gana la última fila del tiempo repetido')
  assert.equal(skipped, 2, 'una fila basura + una duplicada')
})

test('errores legibles cuando el archivo no sirve', () => {
  assert.throws(() => parseKlines('hola mundo', 'x.csv'), /columnas|vela/i)
  assert.throws(() => parseKlines('[]', 'x.json'), /ninguna vela/i)
  assert.throws(() => parseKlines('', 'x.csv'), /vacío/i)
})

test('CSV generado se puede volver a leer (round-trip)', () => {
  const csv = barsToCsv(oneMin)
  const { bars } = parseKlines(csv, 'salida.csv')
  assert.equal(bars.length, oneMin.length)
  assert.equal(bars[0].time, oneMin[0].time)
  assert.equal(bars[0].open, oneMin[0].open)
  assert.equal(bars.at(-1).close, oneMin.at(-1).close)
  assert.ok(csv.split('\n')[0].startsWith('open_time'))
})

// ---------- intervalos ----------
test('detectInterval reconoce datos de 1m y de 1d', () => {
  assert.equal(detectInterval(oneMin)?.value, '1m')
  const daily = Array.from({ length: 10 }, (_, i) => ({ time: base + i * 86400 }))
  assert.equal(detectInterval(daily)?.value, '1d')
  assert.equal(detectInterval([{ time: 1 }]), null)
})

test('intervalsAtLeast no ofrece bajar de resolución', () => {
  const options = intervalsAtLeast(3_600_000).map((i) => i.value)
  assert.ok(options.includes('1h') && options.includes('1d'))
  assert.ok(!options.includes('1m') && !options.includes('30m'))
})

test('estimateCandles y yearRange', () => {
  const { start, end } = yearRange(2024) // año bisiesto completo, ya pasado
  assert.equal(start, Date.UTC(2024, 0, 1))
  assert.equal(end, Date.UTC(2025, 0, 1))
  assert.equal(estimateCandles(start, end, '1d'), 366)
  assert.equal(estimateCandles(start, end, '1m'), 366 * 24 * 60)
  const actual = yearRange(new Date().getUTCFullYear())
  assert.ok(actual.end <= Date.now() + 1000, 'el año en curso se recorta a hoy')
})
