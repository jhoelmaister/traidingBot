import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts'
import { sma, ema, rsi, macd, bollinger } from '../lib/indicators.js'

const UP = '#26a69a'
const DOWN = '#ef5350'
const GRID = '#2a2e39'
const TEXT = '#d1d4dc'

const SMA_COLORS = ['#f0b90b', '#8b5cf6', '#22d3ee', '#f472b6']
const EMA_COLORS = ['#fb923c', '#4ade80', '#60a5fa', '#e879f9']

/**
 * Una "capa" ata una serie del gráfico con sus valores alineados por índice de
 * vela. `barIndex[i]` dice a qué vela corresponde `points[i]`, lo que permite
 * mostrar sólo las primeras N velas durante el replay sin recalcular nada.
 */
function makeLayer(series, bars, values, colorFn) {
  const points = []
  const barIndex = []
  for (let i = 0; i < bars.length; i++) {
    if (values[i] == null) continue
    const point = { time: bars[i].time, value: values[i] }
    if (colorFn) point.color = colorFn(values[i], i)
    points.push(point)
    barIndex.push(i)
  }
  return { series, points, barIndex, applied: 0 }
}

// Cuántos puntos de la capa entran en las primeras `count` velas.
function pointsUpTo(layer, count) {
  let lo = 0
  let hi = layer.barIndex.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (layer.barIndex[mid] < count) lo = mid + 1
    else hi = mid
  }
  return lo
}

export default function CandleChart({ bars, indicators, visibleCount, height = 520 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const applyRef = useRef(null)
  const lastCountRef = useRef(0)

  // El gráfico se crea una sola vez y sobrevive a los cambios de datos.
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: TEXT, attributionLogo: false },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: GRID },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 },
    })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Reconstruye series e indicadores cuando cambian los datos o la selección.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !bars.length) return

    const closes = bars.map((b) => b.close)
    const layers = []
    let paneIndex = 0

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    })

    indicators.sma.forEach((period, i) => {
      const series = chart.addSeries(LineSeries, {
        color: SMA_COLORS[i % SMA_COLORS.length],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `SMA ${period}`,
      })
      layers.push(makeLayer(series, bars, sma(closes, period)))
    })

    indicators.ema.forEach((period, i) => {
      const series = chart.addSeries(LineSeries, {
        color: EMA_COLORS[i % EMA_COLORS.length],
        lineWidth: 2,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `EMA ${period}`,
      })
      layers.push(makeLayer(series, bars, ema(closes, period)))
    })

    if (indicators.bb) {
      const { upper, middle, lower } = bollinger(closes, indicators.bb.period, indicators.bb.mult)
      const style = { color: '#94a3b8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
      layers.push(makeLayer(chart.addSeries(LineSeries, { ...style, title: 'BB sup' }), bars, upper))
      layers.push(makeLayer(chart.addSeries(LineSeries, { ...style, lineStyle: 2, title: 'BB media' }), bars, middle))
      layers.push(makeLayer(chart.addSeries(LineSeries, { ...style, title: 'BB inf' }), bars, lower))
    }

    if (indicators.volume) {
      paneIndex++
      const series = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'volume' }, priceScaleId: '', title: 'Volumen' },
        paneIndex,
      )
      const volumes = bars.map((b) => b.volume ?? 0)
      layers.push(
        makeLayer(series, bars, volumes, (_v, i) => (bars[i].close >= bars[i].open ? `${UP}90` : `${DOWN}90`)),
      )
    }

    if (indicators.rsi) {
      paneIndex++
      const series = chart.addSeries(
        LineSeries,
        { color: '#c084fc', lineWidth: 2, priceLineVisible: false, title: `RSI ${indicators.rsi}` },
        paneIndex,
      )
      // Las bandas de sobrecompra/sobreventa, como referencia fija.
      for (const level of [70, 30]) {
        series.createPriceLine({ price: level, color: '#64748b', lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
      }
      layers.push(makeLayer(series, bars, rsi(closes, indicators.rsi)))
    }

    if (indicators.macd) {
      paneIndex++
      const { line, signal, histogram } = macd(closes)
      layers.push(
        makeLayer(
          chart.addSeries(HistogramSeries, { priceScaleId: '', title: 'MACD hist' }, paneIndex),
          bars,
          histogram,
          (v) => (v >= 0 ? `${UP}90` : `${DOWN}90`),
        ),
      )
      layers.push(
        makeLayer(
          chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'MACD' }, paneIndex),
          bars,
          line,
        ),
      )
      layers.push(
        makeLayer(
          chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'Señal' }, paneIndex),
          bars,
          signal,
        ),
      )
    }

    // El panel de precio se queda con la mayor parte del alto.
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3)
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1)

    // Aplica los datos hasta la vela `count`. Si sólo avanzamos una vela usamos
    // update() en vez de setData(): con cientos de miles de velas, rearmar el
    // array en cada paso del replay haría que se arrastre.
    function apply(count, incremental) {
      const limit = Math.max(0, Math.min(count, bars.length))

      if (incremental) {
        candles.update(bars[limit - 1])
        for (const layer of layers) {
          if (layer.barIndex[layer.applied] === limit - 1) {
            layer.series.update(layer.points[layer.applied])
            layer.applied++
          }
        }
        return
      }

      candles.setData(bars.slice(0, limit))
      for (const layer of layers) {
        const upTo = pointsUpTo(layer, limit)
        layer.series.setData(layer.points.slice(0, upTo))
        layer.applied = upTo
      }
    }

    applyRef.current = apply
    apply(visibleCount ?? bars.length, false)
    lastCountRef.current = visibleCount ?? bars.length
    chart.timeScale().fitContent()

    return () => {
      applyRef.current = null
      // Al desmontar, React limpia primero el efecto que creó el gráfico, así
      // que puede estar destruido: tocarlo acá lanzaría "Object is disposed".
      if (chartRef.current !== chart) return

      chart.removeSeries(candles)
      for (const layer of layers) chart.removeSeries(layer.series)
      // Los paneles extra no se van solos al quitar sus series.
      for (let i = chart.panes().length - 1; i >= 1; i--) chart.removePane(i)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, indicators])

  // Avance del replay.
  useEffect(() => {
    const apply = applyRef.current
    if (!apply || visibleCount == null) return

    const previous = lastCountRef.current
    apply(visibleCount, visibleCount === previous + 1 && visibleCount > 0)
    lastCountRef.current = visibleCount
  }, [visibleCount])

  return <div ref={containerRef} className="chart" style={{ height }} />
}
