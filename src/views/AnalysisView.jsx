import { useEffect, useMemo, useRef, useState } from 'react'
import CandleChart from '../components/CandleChart.jsx'
import ChartToolbar from '../components/ChartToolbar.jsx'
import IndicatorsDialog from '../components/IndicatorsDialog.jsx'
import DrawingSettingsDialog from '../components/DrawingSettingsDialog.jsx'
import { parseKlines } from '../lib/klines.js'
import { resample } from '../lib/resample.js'
import { detectInterval, intervalsAtLeast, intervalLabel, intervalMs } from '../lib/intervals.js'
import { describe, remapDrawings } from '../lib/drawings.js'
import { formatDate, formatNumber, formatPrice } from '../lib/format.js'

const DEFAULT_INDICATORS = {
  mas: [
    { id: 'ma1', type: 'sma', period: 20, color: '#f0b90b' },
    { id: 'ma2', type: 'sma', period: 50, color: '#8b5cf6' },
  ],
  bb: null,
  volume: true,
  rsi: null,
  macd: null,
}

// Velas por segundo de la reproducción.
const SPEEDS = [1, 2, 5, 10, 25, 50]

export default function AnalysisView({ dataset, onDataset }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [dragging, setDragging] = useState(false)
  const [interval, setIntervalValue] = useState(null)
  const [indicators, setIndicators] = useState(DEFAULT_INDICATORS)
  const [replay, setReplay] = useState(null)
  const [drawings, setDrawings] = useState([])
  const [tool, setTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [dialog, setDialog] = useState(null) // null | 'indicadores' | id de un dibujo
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
      onOpenSettings: (id) => {
        setSelectedId(id)
        setDialog(id)
      },
    }),
    [drawings, tool, selectedId],
  )

  const availableIntervals = sourceInterval ? intervalsAtLeast(sourceInterval.ms) : []
  const visibleCount = replay ? replay.index : bars.length
  const currentBar = bars[Math.max(0, visibleCount - 1)] ?? null
  const selected = drawings.find((d) => d.id === selectedId) ?? null

  // Supr borra el objeto seleccionado, como en cualquier editor.
  useEffect(() => {
    if (!selectedId || dialog) return
    function onKeyDown(event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return
      setDrawings((current) => current.filter((d) => d.id !== selectedId))
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, dialog])

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

  function toggleReplay() {
    if (replay) {
      setReplay(null)
      return
    }
    // Dejamos algo de historia visible para que los indicadores tengan sentido.
    const start = Math.min(bars.length, Math.max(60, Math.floor(bars.length * 0.3)))
    setReplay({ index: start, playing: false, speed: 10 })
  }

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

  const indicadoresActivos =
    indicators.mas.length +
    (indicators.bb ? 1 : 0) +
    (indicators.volume ? 1 : 0) +
    (indicators.rsi ? 1 : 0) +
    (indicators.macd ? 1 : 0)

  return (
    <div
      className="view analysis"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="chart-topbar">
        <button className="symbol" onClick={() => fileInputRef.current?.click()} title="Cambiar archivo">
          {dataset.name}
        </button>
        {fileInput}

        <select
          value={interval ?? ''}
          onChange={(e) => {
            setIntervalValue(e.target.value)
            setReplay(null)
          }}
          disabled={!availableIntervals.length}
          title="Intervalo"
        >
          {availableIntervals.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>

        <button onClick={() => setDialog('indicadores')} title="Agregar o configurar indicadores">
          ƒx Indicadores{indicadoresActivos ? ` (${indicadoresActivos})` : ''}
        </button>

        <button className={replay ? 'primary' : ''} onClick={toggleReplay} disabled={bars.length < 2}>
          ⏵⏵ Reproducción
        </button>

        {selected && (
          <span className="selected-object">
            {describe(selected)}
            <button onClick={() => setDialog(selected.id)} title="Configurar (o doble clic sobre el objeto)">
              Configurar
            </button>
            <button
              className="x"
              title="Borrar (Supr)"
              onClick={() => {
                setDrawings((current) => current.filter((d) => d.id !== selected.id))
                setSelectedId(null)
              }}
            >
              ✕
            </button>
          </span>
        )}

        <span className="spacer" />

        <span className="muted">
          {formatNumber(dataset.bars.length)} velas · {formatDate(dataset.bars[0].time, false)} →{' '}
          {formatDate(dataset.bars.at(-1).time, false)}
          {sourceInterval ? ` · origen ${intervalLabel(sourceInterval.value)}` : ' · intervalo irregular'}
        </span>
      </div>

      {error && <div className="panel error">{error}</div>}
      {loading && <div className="panel status">{loading}</div>}

      <div className="chart-area">
        <ChartToolbar
          tool={tool}
          onTool={setTool}
          count={drawings.length}
          onClear={() => {
            setDrawings([])
            setSelectedId(null)
          }}
        />

        <div className="chart-main">
          {currentBar && (
            <div className="legend">
              <span>{formatDate(currentBar.time)}</span>
              <span>A {formatPrice(currentBar.open)}</span>
              <span>M {formatPrice(currentBar.high)}</span>
              <span>m {formatPrice(currentBar.low)}</span>
              <span className={currentBar.close >= currentBar.open ? 'up' : 'down'}>
                C {formatPrice(currentBar.close)}
              </span>
              {tool && <span className="hint">Clic para el primer punto, clic para el segundo · Esc cancela</span>}
            </div>
          )}
          <CandleChart
            bars={bars}
            indicators={indicators}
            visibleCount={visibleCount}
            drawing={drawingProps}
            height="100%"
          />
        </div>
      </div>

      {replay && (
        <div className="panel replay">
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
          <button onClick={() => setReplay(null)} title="Salir de la reproducción">
            ✕
          </button>
        </div>
      )}

      {dialog === 'indicadores' && (
        <IndicatorsDialog
          indicators={indicators}
          onAccept={setIndicators}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog && dialog !== 'indicadores' && drawings.some((d) => d.id === dialog) && (
        <DrawingSettingsDialog
          drawing={drawings.find((d) => d.id === dialog)}
          onAccept={(updated) =>
            setDrawings((current) => current.map((d) => (d.id === updated.id ? updated : d)))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
