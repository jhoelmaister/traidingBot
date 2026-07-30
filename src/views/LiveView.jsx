import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { klineToBar, POPULAR_SYMBOLS } from '../lib/binance.js'
import { INTERVALS } from '../lib/intervals.js'
import { sma } from '../lib/indicators.js'
import { formatPrice } from '../lib/format.js'

const SMA_LINES = [
  { period: 20, color: '#f0b90b' },
  { period: 50, color: '#8b5cf6' },
]
const HISTORY = 500

export default function LiveView() {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candlesRef = useRef(null)
  const smaRef = useRef([])
  const barsRef = useRef([])
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const loadIdRef = useRef(0)

  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setInterval] = useState('1m')
  const [status, setStatus] = useState('Cargando...')
  const [error, setError] = useState('')
  const [lastPrice, setLastPrice] = useState(null)

  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#d1d4dc', attributionLogo: false },
      grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
    })

    candlesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    smaRef.current = SMA_LINES.map(({ period, color }) => ({
      period,
      series: chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `SMA ${period}`,
      }),
    }))

    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Cada cambio de par o intervalo reinicia histórico y suscripción.
  useEffect(() => {
    const myId = ++loadIdRef.current
    let cancelled = false

    function cleanup() {
      cancelled = true
      window.clearTimeout(reconnectRef.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }

    function drawSma() {
      const bars = barsRef.current
      const closes = bars.map((b) => b.close)
      for (const { period, series } of smaRef.current) {
        const values = sma(closes, period)
        const points = []
        for (let i = 0; i < bars.length; i++) {
          if (values[i] != null) points.push({ time: bars[i].time, value: values[i] })
        }
        series.setData(points)
      }
    }

    function updateLastSma() {
      const bars = barsRef.current
      const closes = bars.map((b) => b.close)
      const last = bars.length - 1
      for (const { period, series } of smaRef.current) {
        const values = sma(closes, period)
        if (values[last] != null) series.update({ time: bars[last].time, value: values[last] })
      }
    }

    function connect() {
      const url = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (loadIdRef.current === myId) setStatus('En vivo')
      }

      ws.onmessage = (event) => {
        if (loadIdRef.current !== myId) return
        const { k } = JSON.parse(event.data)
        const bar = klineToBar([k.t, k.o, k.h, k.l, k.c, k.v])
        candlesRef.current.update(bar)
        setLastPrice(bar.close)

        const bars = barsRef.current
        if (bars.length && bars.at(-1).time === bar.time) bars[bars.length - 1] = bar
        else bars.push(bar)
        updateLastSma()
      }

      ws.onclose = () => {
        if (cancelled || loadIdRef.current !== myId) return
        setStatus('Reconectando...')
        reconnectRef.current = window.setTimeout(connect, 3000)
      }
    }

    async function load() {
      setError('')
      setStatus('Cargando...')
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${HISTORY}`,
        )
        if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
        const data = await res.json()
        if (loadIdRef.current !== myId) return

        barsRef.current = data.map(klineToBar)
        candlesRef.current.setData(barsRef.current)
        drawSma()
        chartRef.current.timeScale().fitContent()
        setLastPrice(barsRef.current.at(-1)?.close ?? null)
        connect()
      } catch (err) {
        if (loadIdRef.current !== myId) return
        setStatus('')
        setError(
          `No se pudo conectar con Binance (${err.message}). Revisá tu conexión, o si una VPN o ` +
            'firewall están bloqueando api.binance.com.',
        )
      }
    }

    load()
    return cleanup
  }, [symbol, interval])

  return (
    <div className="view">
      <div className="panel controls">
        <label>
          Par
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {POPULAR_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Intervalo
          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        {lastPrice != null && <span className="price">{formatPrice(lastPrice)}</span>}
        {status && <span className="muted">{status}</span>}
      </div>

      {error && <div className="panel error">{error}</div>}

      <div ref={containerRef} className="chart" style={{ height: 520 }} />
    </div>
  )
}
