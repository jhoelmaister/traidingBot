import { intervalMs } from './intervals.js'

const API = 'https://api.binance.com/api/v3'
const MAX_LIMIT = 1000
const MAX_RETRIES = 5

export const DEFAULT_SYMBOL = 'BTCUSDT'
export const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT']

export function klineToBar(k) {
  return {
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Cancelado', 'AbortError'))
    }, { once: true })
  })

async function requestKlines(params, signal) {
  const url = `${API}/klines?${new URLSearchParams(params)}`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')

    let res
    try {
      res = await fetch(url, { signal })
    } catch (err) {
      if (err.name === 'AbortError') throw err
      // Corte de red: reintentamos, salvo que se hayan agotado los intentos.
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`No se pudo conectar con Binance: ${err.message}`)
      }
      await sleep(2 ** attempt * 1000, signal)
      continue
    }

    // 429 = límite de peticiones, 418 = IP baneada temporalmente por insistir.
    if (res.status === 429 || res.status === 418 || res.status >= 500) {
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`Binance respondió ${res.status} tras ${MAX_RETRIES} intentos.`)
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
      await sleep(wait, signal)
      continue
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = await res.json()
        if (body?.msg) detail = body.msg
      } catch {
        // respuesta sin JSON, nos quedamos con el status
      }
      throw new Error(`Binance rechazó la petición: ${detail}`)
    }

    return res.json()
  }

  throw new Error('No se pudo completar la petición a Binance.')
}

export function estimateCandles(startMs, endMs, interval) {
  const ms = intervalMs(interval)
  if (!ms || endMs <= startMs) return 0
  return Math.ceil((endMs - startMs) / ms)
}

export function estimateRequests(startMs, endMs, interval) {
  return Math.ceil(estimateCandles(startMs, endMs, interval) / MAX_LIMIT)
}

/**
 * Descarga todas las velas de un rango, paginando de a 1000.
 *
 * @param {object} options
 * @param {(progress: {count: number, requests: number, lastTime: number|null}) => void} options.onProgress
 * @param {AbortSignal} [options.signal] para cancelar desde la UI
 * @returns {Promise<Array>} velas normalizadas
 */
export async function fetchKlineRange({ symbol, interval, startMs, endMs, onProgress, signal }) {
  const step = intervalMs(interval)
  if (!step) throw new Error(`Intervalo desconocido: ${interval}`)

  const bars = []
  let cursor = startMs
  let requests = 0

  while (cursor < endMs) {
    const data = await requestKlines(
      {
        symbol: symbol.toUpperCase(),
        interval,
        startTime: String(cursor),
        endTime: String(endMs - 1),
        limit: String(MAX_LIMIT),
      },
      signal,
    )
    requests++

    if (!data.length) break

    for (const k of data) bars.push(klineToBar(k))

    const lastOpen = data[data.length - 1][0]
    onProgress?.({ count: bars.length, requests, lastTime: lastOpen })

    // Binance devuelve menos de `limit` sólo cuando no hay más datos en el rango.
    if (data.length < MAX_LIMIT) break

    const next = lastOpen + step
    if (next <= cursor) break // salvaguarda contra un bucle infinito
    cursor = next
  }

  return bars
}

/** Rango [inicio, fin) de un año en UTC, recortado al presente. */
export function yearRange(year) {
  const start = Date.UTC(year, 0, 1)
  const end = Math.min(Date.UTC(year + 1, 0, 1), Date.now())
  return { start, end }
}
