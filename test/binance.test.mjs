// Prueba la paginación, los reintentos y la cancelación contra un fetch falso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchKlineRange } from '../src/lib/binance.js'

const MINUTE = 60_000
const start = Date.UTC(2024, 0, 1)

// Genera velas de 1m como las devuelve Binance, respetando startTime/limit.
function fakeApi({ total, failures = new Map() }) {
  const calls = []
  return {
    calls,
    fetch: async (url) => {
      const params = new URL(url).searchParams
      const startTime = Number(params.get('startTime'))
      const limit = Number(params.get('limit'))
      calls.push({ startTime, limit })

      const status = failures.get(calls.length)
      if (status) {
        return { ok: false, status, headers: new Map([['retry-after', '0']]), json: async () => ({}) }
      }

      const firstIndex = Math.round((startTime - start) / MINUTE)
      const rows = []
      for (let i = firstIndex; i < Math.min(total, firstIndex + limit); i++) {
        rows.push([start + i * MINUTE, '1', '2', '0.5', '1.5', '10', start + (i + 1) * MINUTE - 1])
      }
      return { ok: true, status: 200, json: async () => rows }
    },
  }
}

// Cada test reemplaza globalThis.fetch: node:test corre este archivo en su
// propio proceso, así que no contamina a los demás.
test('pagina hasta traer todas las velas', async () => {
  const api = fakeApi({ total: 2500 })
  globalThis.fetch = api.fetch

  const progress = []
  const bars = await fetchKlineRange({
    symbol: 'BTCUSDT',
    interval: '1m',
    startMs: start,
    endMs: start + 2500 * MINUTE,
    onProgress: (p) => progress.push(p.count),
  })

  assert.equal(bars.length, 2500)
  assert.equal(api.calls.length, 3, 'dos páginas llenas y una parcial')
  assert.equal(api.calls[1].startTime, start + 1000 * MINUTE, 'la segunda página sigue donde quedó')
  assert.deepEqual(progress, [1000, 2000, 2500])
  assert.equal(bars[0].time, start / 1000)
  assert.equal(bars.at(-1).time, (start + 2499 * MINUTE) / 1000)
  assert.equal(bars[0].volume, 10)
})

test('no repite ni saltea velas entre páginas', async () => {
  const api = fakeApi({ total: 2500 })
  globalThis.fetch = api.fetch
  const bars = await fetchKlineRange({
    symbol: 'BTCUSDT',
    interval: '1m',
    startMs: start,
    endMs: start + 2500 * MINUTE,
  })
  for (let i = 1; i < bars.length; i++) {
    assert.equal(bars[i].time - bars[i - 1].time, 60, `hueco o repetido en la vela ${i}`)
  }
})

test('reintenta ante 429 y sigue', async () => {
  // La segunda petición devuelve "too many requests" una vez.
  const api = fakeApi({ total: 1500, failures: new Map([[2, 429]]) })
  globalThis.fetch = api.fetch

  const bars = await fetchKlineRange({
    symbol: 'BTCUSDT',
    interval: '1m',
    startMs: start,
    endMs: start + 1500 * MINUTE,
  })

  assert.equal(bars.length, 1500)
  assert.equal(api.calls.length, 3, 'la fallida se repite')
})

test('propaga el error cuando Binance rechaza el pedido', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    headers: new Map(),
    json: async () => ({ code: -1121, msg: 'Invalid symbol.' }),
  })

  await assert.rejects(
    fetchKlineRange({ symbol: 'NOEXISTE', interval: '1m', startMs: start, endMs: start + MINUTE }),
    /Invalid symbol/,
  )
})

test('se puede cancelar a mitad de la descarga', async () => {
  const controller = new AbortController()
  const api = fakeApi({ total: 10_000 })
  globalThis.fetch = async (url, options) => {
    if (options?.signal?.aborted) throw Object.assign(new Error('abort'), { name: 'AbortError' })
    return api.fetch(url)
  }

  const promise = fetchKlineRange({
    symbol: 'BTCUSDT',
    interval: '1m',
    startMs: start,
    endMs: start + 10_000 * MINUTE,
    signal: controller.signal,
    onProgress: ({ count }) => {
      if (count >= 2000) controller.abort()
    },
  })

  await assert.rejects(promise, (err) => err.name === 'AbortError')
})

