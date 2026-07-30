import { useEffect, useMemo, useRef, useState } from 'react'
import CandleChart from '../components/CandleChart.jsx'
import { parseKlines } from '../lib/klines.js'
import { resample } from '../lib/resample.js'
import { detectInterval, intervalsAtLeast, intervalLabel, intervalMs } from '../lib/intervals.js'
import { describe, positionMetrics, remapDrawings, TOOLS } from '../lib/drawings.js'
import { formatDate, formatNumber, formatPrice } from '../lib/format.js'

const EXTRA_TOGGLES = [
  { key: 'bb', label: 'Bollinger' },
  { key: 'volume', label: 'Volumen' },
  { key: 'rsi', label: 'RSI 14' },
  { key: 'macd', label: 'MACD' },
]

const MA_COLORS = ['#f0b90b', '#8b5cf6', '#22d3ee', '#fb923c', '#4ade80', '#60a5fa', '#f472b6', '#e879f9']

const DEFAULT_MAS = [
  { id: 'ma1', type: 'sma', period: 20, color: MA_COLORS[0] },
  { id: 'ma2', type: 'sma', period: 50, color: MA_COLORS[1] },
]

// Velas por segundo de la reproducción.
const SPEEDS = [1, 2, 5, 10, 25, 50]

let maCounter = 0

export default function AnalysisView({ dataset, onDataset }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [dragging, setDragging] = useState(false)
  const [interval, setIntervalValue] = useState(null)
  const [toggles, setToggles] = useState({ volume: true })
  const [mas, setMas] = useState(DEFAULT_MAS)
  const [newMa, setNewMa] = useState({ type: 'ema', period: 200 })
  const [replay, setReplay] = useState(null)
  const [drawings, setDrawings] = useState([])
  const [tool, setTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const fileInputRef = useRef(null)

  const sourceInterval = useMemo(() => (dataset ? detectInterval(dataset.bars) : null), [dataset])

  // Datos nuevos: volvemos a la resolución nativa y limpiamos lo dibujado.
  useEffect(() => {
    setIntervalValue(sourceInterval?.value ?? null)
    setReplay(null)
    setDrawings([])
    setSelectedId(null)
    setTool(null)
  }, [sourceInterval, dataset])

  const bars = useMemo(() => {
    if (!dataset) return []
    if (!interval || interval === sourceInterval?.value) return dataset.bars
    return resample(dataset.bars, interval)
  }, [dataset, interval, sourceInterval])

  const stepSeconds = (intervalMs(interval) ?? sourceInterval?.ms ?? 60_000) / 1000

  // Al cambiar de intervalo las velas se reagrupan: los dibujos se reubican por
  // tiempo para que sigan señalando el mismo lugar del gráfico.
  const previousRef = useRef({ bars, stepSeconds })
  useEffect(() => {
    const previous = previousRef.current
    if (previous.bars !== bars && previous.bars.length && bars.length) {
      setDrawings((current) =>
        current.length ? remapDrawings(current, previous.bars, previous.stepSeconds, bars, stepSeconds) : current,
      )
    }
    previousRef.current = { bars, stepSeconds }
  }, [bars, stepSeconds])

  const indicators = useMemo(
    () => ({
      mas,
      bb: toggles.bb ? { period: 20, mult: 2 } : null,
      volume: Boolean(toggles.volume),
      rsi: toggles.rsi ? 14 : null,
      macd: Boolean(toggles.macd),
    }),
    [mas, toggles],
  )

  const drawingProps = useMemo(
    () => ({
      drawings,
      tool,
      selectedId,
      onCreate: (drawing) => {
        setDrawings((current) => [...current, drawing])
        setSelectedId(drawing.id)
      },
      onChange: (drawing) =>
        setDrawings((current) => current.map((d) => (d.id === drawing.id ? drawing : d))),
      onSelect: setSelectedId,
      onToolEnd: () => setTool(null),
    }),
    [drawings, tool, selectedId],
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

  function addMa() {
    const period = Number(newMa.period)
    if (!Number.isInteger(period) || period < 1 || period > 5000) return
    if (mas.some((m) => m.type === newMa.type && m.period === period)) return
    maCounter += 1
    setMas((current) => [
      ...current,
      { id: `ma${Date.now().toString(36)}${maCounter}`, type: newMa.type, period, color: MA_COLORS[current.length % MA_COLORS.length] },
    ])
  }

  const updateDrawing = (id, patch) =>
    setDrawings((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".csv,.json,.txt,text/csv,application/json"
      hidden
      onChange={(e) => loadFile(e.target.files?.[0])}
    />
  )

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
        {fileInput}
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
        {fileInput}
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
          {EXTRA_TOGGLES.map(({ key, label }) => (
            <label key={key} className={`chip ${toggles[key] ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={Boolean(toggles[key])}
                onChange={() => setToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="panel controls">
        <span className="muted">Medias</span>
        <div className="toggles">
          {mas.map((ma) => (
            <span key={ma.id} className="chip on ma">
              <i style={{ background: ma.color }} />
              {ma.type.toUpperCase()} {ma.period}
              <button
                className="x"
                title="Quitar"
                onClick={() => setMas((current) => current.filter((m) => m.id !== ma.id))}
              >
                ✕
              </button>
            </span>
          ))}
          {!mas.length && <span className="muted">ninguna</span>}
        </div>

        <select value={newMa.type} onChange={(e) => setNewMa((p) => ({ ...p, type: e.target.value }))}>
          <option value="ema">EMA</option>
          <option value="sma">SMA</option>
        </select>
        <input
          type="number"
          min={1}
          max={5000}
          value={newMa.period}
          onChange={(e) => setNewMa((p) => ({ ...p, period: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && addMa()}
          style={{ width: '5rem' }}
        />
        <button onClick={addMa}>Agregar</button>
      </div>

      <div className="panel controls">
        <span className="muted">Herramientas</span>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'primary' : ''}
            onClick={() => setTool((current) => (current === t.id ? null : t.id))}
          >
            {t.label}
          </button>
        ))}
        {tool && <span className="muted">Clic para el primer punto, clic para el segundo · Esc cancela</span>}
        {!tool && drawings.length > 0 && (
          <>
            <span className="muted">Arrastrá los puntos para ajustar</span>
            <button onClick={() => { setDrawings([]); setSelectedId(null) }}>Borrar todo</button>
          </>
        )}
      </div>

      {drawings.length > 0 && (
        <div className="panel drawings">
          {drawings.map((d) => {
            const selected = d.id === selectedId
            const metrics = d.type === 'fib' ? null : positionMetrics(d)
            return (
              <div
                key={d.id}
                className={`drawing-row ${selected ? 'selected' : ''}`}
                onClick={() => setSelectedId(d.id)}
              >
                <strong>{describe(d)}</strong>
                {metrics ? (
                  <>
                    <label>
                      Entrada
                      <input
                        type="number"
                        value={d.p1}
                        step="any"
                        onChange={(e) => updateDrawing(d.id, { p1: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Objetivo
                      <input
                        type="number"
                        value={d.p2}
                        step="any"
                        onChange={(e) => updateDrawing(d.id, { p2: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Stop
                      <input
                        type="number"
                        value={d.stop}
                        step="any"
                        onChange={(e) => updateDrawing(d.id, { stop: Number(e.target.value) })}
                      />
                    </label>
                    <span className={metrics.valid ? 'muted' : 'error'}>
                      {metrics.valid
                        ? `R/R ${metrics.ratio.toFixed(2)} · +${metrics.rewardPct.toFixed(2)}% / -${Math.abs(metrics.riskPct).toFixed(2)}%`
                        : 'objetivo o stop del lado equivocado'}
                    </span>
                  </>
                ) : (
                  <span className="muted">
                    {formatPrice(Math.min(d.p1, d.p2))} → {formatPrice(Math.max(d.p1, d.p2))}
                  </span>
                )}
                <button
                  className="x"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDrawings((current) => current.filter((x) => x.id !== d.id))
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

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
            <button
              onClick={() =>
                setReplay((r) => ({
                  ...r,
                  index: Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.3))),
                  playing: false,
                }))
              }
              title="Reiniciar"
            >
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

      <CandleChart
        bars={bars}
        indicators={indicators}
        visibleCount={visibleCount}
        drawing={drawingProps}
      />
    </div>
  )
}
