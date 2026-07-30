import { useEffect, useMemo, useRef, useState } from 'react'
import CandleChart from '../components/CandleChart.jsx'
import { parseKlines } from '../lib/klines.js'
import { resample } from '../lib/resample.js'
import { detectInterval, intervalsAtLeast, intervalLabel } from '../lib/intervals.js'
import { formatDate, formatNumber, formatPrice } from '../lib/format.js'

const INDICATOR_TOGGLES = [
  { key: 'sma20', label: 'SMA 20' },
  { key: 'sma50', label: 'SMA 50' },
  { key: 'sma200', label: 'SMA 200' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'ema21', label: 'EMA 21' },
  { key: 'bb', label: 'Bollinger' },
  { key: 'volume', label: 'Volumen' },
  { key: 'rsi', label: 'RSI 14' },
  { key: 'macd', label: 'MACD' },
]

// Velas por segundo de la reproducción.
const SPEEDS = [1, 2, 5, 10, 25, 50]

const INITIAL_TOGGLES = { sma20: true, sma50: true, volume: true }

export default function AnalysisView({ dataset, onDataset }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [dragging, setDragging] = useState(false)
  const [interval, setIntervalValue] = useState(null)
  const [toggles, setToggles] = useState(INITIAL_TOGGLES)
  const [replay, setReplay] = useState(null)
  const fileInputRef = useRef(null)

  const sourceInterval = useMemo(() => (dataset ? detectInterval(dataset.bars) : null), [dataset])

  // Al cargar datos nuevos arrancamos en su resolución nativa.
  useEffect(() => {
    setIntervalValue(sourceInterval?.value ?? null)
    setReplay(null)
  }, [sourceInterval, dataset])

  const bars = useMemo(() => {
    if (!dataset) return []
    if (!interval || interval === sourceInterval?.value) return dataset.bars
    return resample(dataset.bars, interval)
  }, [dataset, interval, sourceInterval])

  const indicators = useMemo(
    () => ({
      sma: [toggles.sma20 && 20, toggles.sma50 && 50, toggles.sma200 && 200].filter(Boolean),
      ema: [toggles.ema9 && 9, toggles.ema21 && 21].filter(Boolean),
      bb: toggles.bb ? { period: 20, mult: 2 } : null,
      volume: Boolean(toggles.volume),
      rsi: toggles.rsi ? 14 : null,
      macd: Boolean(toggles.macd),
    }),
    [toggles],
  )

  const availableIntervals = sourceInterval ? intervalsAtLeast(sourceInterval.ms) : []
  const visibleCount = replay ? replay.index : bars.length
  const currentBar = bars[Math.max(0, visibleCount - 1)] ?? null

  // Motor de la reproducción: un tick por vela, al ritmo elegido.
  useEffect(() => {
    if (!replay?.playing) return

    const id = window.setInterval(() => {
      setReplay((prev) => {
        if (!prev?.playing) return prev
        if (prev.index >= bars.length) return { ...prev, playing: false }
        const next = prev.index + 1
        return { ...prev, index: next, playing: next < bars.length }
      })
    }, 1000 / replay.speed)

    return () => window.clearInterval(id)
  }, [replay?.playing, replay?.speed, bars.length])

  async function loadFile(file) {
    if (!file) return
    setError('')
    setLoading(`Leyendo ${file.name}...`)

    // Cedemos un frame para que se vea el estado de carga antes de bloquear
    // el hilo parseando un archivo que puede tener cientos de miles de filas.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

    try {
      const text = await file.text()
      const { bars: parsed, skipped } = parseKlines(text, file.name)
      onDataset({ name: file.name, bars: parsed, skipped })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    loadFile(event.dataTransfer.files?.[0])
  }

  function startReplay() {
    // Dejamos algo de historia visible para que los indicadores tengan sentido.
    const start = Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.3)))
    setReplay({ index: start, playing: false, speed: 10 })
  }

  const toggle = (key) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }))

  if (!dataset) {
    return (
      <div className="view">
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <strong>Soltá acá un archivo de precios</strong>
          <span>o hacé clic para elegirlo</span>
          <small>
            CSV o JSON. Entiende el formato de Binance (con o sin encabezado) y exportaciones con
            columnas <code>time, open, high, low, close, volume</code>.
          </small>
          {loading && <span className="status">{loading}</span>}
          {error && <span className="error">{error}</span>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          hidden
          onChange={(e) => loadFile(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <div
      className="view"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="panel source">
        <div>
          <strong>{dataset.name}</strong>
          <span className="muted">
            {formatNumber(dataset.bars.length)} velas · {formatDate(dataset.bars[0].time, false)} →{' '}
            {formatDate(dataset.bars.at(-1).time, false)}
            {sourceInterval ? ` · origen ${intervalLabel(sourceInterval.value)}` : ' · intervalo irregular'}
            {dataset.skipped ? ` · ${formatNumber(dataset.skipped)} filas descartadas` : ''}
          </span>
        </div>
        <button onClick={() => fileInputRef.current?.click()}>Cambiar archivo</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          hidden
          onChange={(e) => loadFile(e.target.files?.[0])}
        />
      </div>

      {error && <div className="error panel">{error}</div>}
      {loading && <div className="panel status">{loading}</div>}

      <div className="panel controls">
        <label>
          Intervalo
          <select
            value={interval ?? ''}
            onChange={(e) => {
              setIntervalValue(e.target.value)
              setReplay(null)
            }}
            disabled={!availableIntervals.length}
          >
            {availableIntervals.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>

        <div className="toggles">
          {INDICATOR_TOGGLES.map(({ key, label }) => (
            <label key={key} className={`chip ${toggles[key] ? 'on' : ''}`}>
              <input type="checkbox" checked={Boolean(toggles[key])} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="panel replay">
        {!replay ? (
          <button onClick={startReplay} disabled={bars.length < 2}>
            ▶ Reproducción
          </button>
        ) : (
          <>
            <button onClick={() => setReplay(null)} title="Salir de la reproducción">
              ✕
            </button>
            <button onClick={() => setReplay((r) => ({ ...r, index: Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.3))), playing: false }))} title="Reiniciar">
              ⏮
            </button>
            <button
              onClick={() => setReplay((r) => ({ ...r, index: Math.max(1, r.index - 1), playing: false }))}
              title="Vela anterior"
            >
              ◀
            </button>
            <button
              className="primary"
              onClick={() => setReplay((r) => ({ ...r, playing: !r.playing && r.index < bars.length }))}
            >
              {replay.playing ? '⏸ Pausa' : '▶ Reproducir'}
            </button>
            <button
              onClick={() => setReplay((r) => ({ ...r, index: Math.min(bars.length, r.index + 1), playing: false }))}
              title="Vela siguiente"
            >
              ▶
            </button>
            <select
              value={replay.speed}
              onChange={(e) => setReplay((r) => ({ ...r, speed: Number(e.target.value) }))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} vela{s > 1 ? 's' : ''}/s
                </option>
              ))}
            </select>
            <input
              type="range"
              min={1}
              max={bars.length}
              value={replay.index}
              onChange={(e) => setReplay((r) => ({ ...r, index: Number(e.target.value), playing: false }))}
            />
            <span className="muted">
              {formatNumber(replay.index)} / {formatNumber(bars.length)}
            </span>
          </>
        )}
      </div>

      {currentBar && (
        <div className="panel ohlc">
          <span>{formatDate(currentBar.time)}</span>
          <span>A <strong>{formatPrice(currentBar.open)}</strong></span>
          <span>M <strong>{formatPrice(currentBar.high)}</strong></span>
          <span>m <strong>{formatPrice(currentBar.low)}</strong></span>
          <span className={currentBar.close >= currentBar.open ? 'up' : 'down'}>
            C <strong>{formatPrice(currentBar.close)}</strong>
          </span>
          {currentBar.volume ? <span className="muted">Vol {formatNumber(Math.round(currentBar.volume))}</span> : null}
        </div>
      )}

      <CandleChart bars={bars} indicators={indicators} visibleCount={visibleCount} />
    </div>
  )
}
