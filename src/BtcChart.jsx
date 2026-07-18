import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'

const SYMBOL = 'BTCUSDT'
const INTERVAL = '1m'
const SMA_PERIODS = [
  { period: 20, color: '#f0b90b' },
  { period: 50, color: '#8b5cf6' },
]
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const FIRST_YEAR = 2017
const FIRST_MONTH = 8 // BTCUSDT empezó a cotizar en Binance en agosto de 2017

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function gzipSize(text) {
  if (!('CompressionStream' in window)) return null
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const compressed = await new Response(stream).arrayBuffer()
  return compressed.byteLength
}

function monthsSinceListing(year, month) {
  return (year - FIRST_YEAR) * 12 + (month - FIRST_MONTH) + 1
}

function klineToBar(k) {
  return {
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }
}

function smaAt(bars, index, period) {
  if (index + 1 < period) return null
  let sum = 0
  for (let i = index - period + 1; i <= index; i++) sum += bars[i].close
  return sum / period
}

export default function BtcChart() {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const smaSeriesRef = useRef([])
  const barsRef = useRef([])
  const wsRef = useRef(null)
  const requestIdRef = useRef(0)

  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1)
  const [mode, setMode] = useState('live')
  const [status, setStatus] = useState('')
  const [sizeInfo, setSizeInfo] = useState(null)

  useEffect(() => {
    const container = containerRef.current
    const chart = createChart(container, {
      layout: { background: { color: 'transparent' }, textColor: '#d1d4dc' },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      width: container.clientWidth,
      height: 500,
      timeScale: { timeVisible: true, secondsVisible: false },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    chartRef.current = chart
    seriesRef.current = series
    smaSeriesRef.current = SMA_PERIODS.map(({ period, color }) => ({
      period,
      series: chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    }))

    loadLive()

    function handleResize() {
      chart.applyOptions({ width: container.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      requestIdRef.current += 1
      window.removeEventListener('resize', handleResize)
      wsRef.current?.close()
      chart.remove()
    }
  }, [])

  function applyBars(bars) {
    barsRef.current = bars
    seriesRef.current.setData(bars)
    for (const { period, series: line } of smaSeriesRef.current) {
      const points = []
      for (let i = period - 1; i < bars.length; i++) {
        points.push({ time: bars[i].time, value: smaAt(bars, i, period) })
      }
      line.setData(points)
    }
    chartRef.current.timeScale().fitContent()
  }

  function updateLastSma() {
    const bars = barsRef.current
    const index = bars.length - 1
    for (const { period, series: line } of smaSeriesRef.current) {
      const value = smaAt(bars, index, period)
      if (value !== null) line.update({ time: bars[index].time, value })
    }
  }

  function connectLiveSocket() {
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@kline_${INTERVAL}`,
    )
    ws.onmessage = (event) => {
      const { k } = JSON.parse(event.data)
      const bar = klineToBar([k.t, k.o, k.h, k.l, k.c])
      seriesRef.current.update(bar)

      const bars = barsRef.current
      if (bars.length && bars[bars.length - 1].time === bar.time) {
        bars[bars.length - 1] = bar
      } else {
        bars.push(bar)
      }
      updateLastSma()
    }
    wsRef.current = ws
  }

  async function loadLive() {
    const myId = ++requestIdRef.current
    wsRef.current?.close()
    setMode('live')
    setStatus('Cargando...')

    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}&limit=500`,
    )
    const data = await res.json()
    if (requestIdRef.current !== myId) return

    applyBars(data.map(klineToBar))
    connectLiveSocket()
    setStatus('')
  }

  async function loadHistorical(selectedYear, selectedMonth) {
    const myId = ++requestIdRef.current
    wsRef.current?.close()
    setMode('historical')
    setSizeInfo(null)

    const start = Date.UTC(selectedYear, selectedMonth - 1, 1)
    const endExclusive = Date.UTC(
      selectedMonth === 12 ? selectedYear + 1 : selectedYear,
      selectedMonth === 12 ? 0 : selectedMonth,
      1,
    )

    let all = []
    let cursor = start
    while (cursor < endExclusive) {
      setStatus(`Cargando histórico... ${all.length.toLocaleString('es-AR')} velas`)
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}` +
          `&startTime=${cursor}&endTime=${endExclusive - 1}&limit=1000`,
      )
      const data = await res.json()
      if (requestIdRef.current !== myId) return
      if (!data.length) break

      all = all.concat(data.map(klineToBar))
      const lastOpenMs = data[data.length - 1][0]
      cursor = lastOpenMs + 60_000
      if (data.length < 1000) break
    }

    applyBars(all)
    setStatus(`${all.length.toLocaleString('es-AR')} velas cargadas`)

    const json = JSON.stringify(all)
    const rawBytes = new Blob([json]).size
    const gzBytes = await gzipSize(json)
    if (requestIdRef.current !== myId) return

    const totalMonths = monthsSinceListing(now.getUTCFullYear(), now.getUTCMonth() + 1)
    setSizeInfo({
      count: all.length,
      rawBytes,
      gzBytes,
      totalMonths,
      estRaw: rawBytes * totalMonths,
      estGz: gzBytes != null ? gzBytes * totalMonths : null,
    })
  }

  const isLoading = status.startsWith('Cargando')
  const years = []
  for (let y = now.getUTCFullYear(); y >= FIRST_YEAR; y--) years.push(y)

  return (
    <div>
      <div className="toolbar">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={isLoading}>
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={isLoading}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button onClick={() => loadHistorical(year, month)} disabled={isLoading}>
          Cargar histórico
        </button>
        {mode === 'historical' && (
          <button onClick={loadLive} disabled={isLoading}>
            Volver a en vivo
          </button>
        )}
        {status && <span className="status">{status}</span>}
      </div>
      {sizeInfo && (
        <div className="size-info">
          Este mes: {formatBytes(sizeInfo.rawBytes)} JSON
          {sizeInfo.gzBytes != null && <> ({formatBytes(sizeInfo.gzBytes)} gzip)</>} ·{' '}
          Histórico completo estimado (~{sizeInfo.totalMonths} meses, desde {FIRST_MONTH}/{FIRST_YEAR}):{' '}
          <strong>{formatBytes(sizeInfo.estRaw)}</strong>
          {sizeInfo.estGz != null && (
            <> / <strong>{formatBytes(sizeInfo.estGz)}</strong> gzip</>
          )}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}
