import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'

const SYMBOL = 'btcusdt'
const INTERVAL = '1m'
const SMA_PERIODS = [
  { period: 20, color: '#f0b90b' },
  { period: 50, color: '#8b5cf6' },
]

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

    const smaSeries = SMA_PERIODS.map(({ period, color }) => ({
      period,
      series: chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    }))

    let bars = []
    let ws
    let cancelled = false

    function updateSma(index) {
      for (const { period, series: line } of smaSeries) {
        const value = smaAt(bars, index, period)
        if (value !== null) line.update({ time: bars[index].time, value })
      }
    }

    async function loadHistory() {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${SYMBOL.toUpperCase()}&interval=${INTERVAL}&limit=500`,
      )
      const data = await res.json()
      if (cancelled) return

      bars = data.map(klineToBar)
      series.setData(bars)
      for (const { period, series: line } of smaSeries) {
        const points = []
        for (let i = period - 1; i < bars.length; i++) {
          points.push({ time: bars[i].time, value: smaAt(bars, i, period) })
        }
        line.setData(points)
      }
      chart.timeScale().fitContent()

      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@kline_${INTERVAL}`)
      ws.onmessage = (event) => {
        const { k } = JSON.parse(event.data)
        const bar = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
        }
        series.update(bar)

        if (bars.length && bars[bars.length - 1].time === bar.time) {
          bars[bars.length - 1] = bar
        } else {
          bars.push(bar)
        }
        updateSma(bars.length - 1)
      }
    }

    loadHistory()

    function handleResize() {
      chart.applyOptions({ width: container.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      ws?.close()
      chart.remove()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%' }} />
}
