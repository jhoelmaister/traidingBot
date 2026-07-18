import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'

const SYMBOL = 'btcusdt'
const INTERVAL = '1m'

function klineToBar(k) {
  return {
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }
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

    let ws
    let cancelled = false

    async function loadHistory() {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${SYMBOL.toUpperCase()}&interval=${INTERVAL}&limit=500`,
      )
      const data = await res.json()
      if (cancelled) return

      series.setData(data.map(klineToBar))
      chart.timeScale().fitContent()

      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL}@kline_${INTERVAL}`)
      ws.onmessage = (event) => {
        const { k } = JSON.parse(event.data)
        series.update({
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
        })
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
