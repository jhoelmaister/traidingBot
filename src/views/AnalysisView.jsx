import { useEffect, useMemo, useRef, useState } from 'react'
import CandleChart from '../components/CandleChart.jsx'
import ChartToolbar from '../components/ChartToolbar.jsx'
import IndicatorsDialog from '../components/IndicatorsDialog.jsx'
import DrawingSettingsDialog from '../components/DrawingSettingsDialog.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import { parseKlines } from '../lib/klines.js'
import { resample } from '../lib/resample.js'
import { detectInterval, intervalsAtLeast, intervalLabel, intervalMs } from '../lib/intervals.js'
import { cloneDrawing, describe, remapDrawings, reverseDrawing } from '../lib/drawings.js'
import { loadWorkspace, saveWorkspace, workspaceKey } from '../lib/storage.js'
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
  
  // Persistencia de indicadores en localStorage
  const [indicators, setIndicators] = useState(() => {
    try {
      const saved = localStorage.getItem('tradingview_indicators')
      return saved ? JSON.parse(saved) : DEFAULT_INDICATORS
    } catch {
      return DEFAULT_INDICATORS
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('tradingview_indicators', JSON.stringify(indicators))
    } catch {
      // Sin persistencia (modo privado o storage lleno): seguimos igual.
    }
  }, [indicators])

  const [replay, setReplay] = useState(null)
  
  // Gestión de dibujos con historial de Deshacer/Rehacer (Undo/Redo)
  const [drawings, setDrawingsState] = useState([])
  const historyRef = useRef({ list: [[]], index: 0 })

  const setDrawings = (update, skipHistory = false) => {
    setDrawingsState((current) => {
      const next = typeof update === 'function' ? update(current) : update
      if (!skipHistory) {
        const { list, index } = historyRef.current
        const nextList = list.slice(0, index + 1)
        nextList.push(next)
        historyRef.current = { list: nextList, index: nextList.length - 1 }
      }
      return next
    })
  }

  const clearHistory = (initialValue = []) => {
    historyRef.current = { list: [initialValue], index: 0 }
    setDrawingsState(initialValue)
  }

  const undo = () => {
    const { list, index } = historyRef.current
    if (index > 0) {
      const nextIndex = index - 1
      historyRef.current.index = nextIndex
      setDrawingsState(list[nextIndex])
    }
  }

  const redo = () => {
    const { list, index } = historyRef.current
    if (index < list.length - 1) {
      const nextIndex = index + 1
      historyRef.current.index = nextIndex
      setDrawingsState(list[nextIndex])
    }
  }

  const [magnet, setMagnet] = useState(false)
  const [tool, setTool] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [dialog, setDialog] = useState(null) // null | 'indicadores' | id de un dibujo
  const [menu, setMenu] = useState(null) // { id, x, y } del clic derecho
  const fileInputRef = useRef(null)

  // Estados de Simulación de Trading (Paper Trading)
  const [balance, setBalance] = useState(10000)
  const [position, setPosition] = useState(null) // null | { type: 'long'|'short', entryPrice, amount, time }
  const [trades, setTrades] = useState([])
  const [limitOrders, setLimitOrders] = useState([])
  const [orderPrice, setOrderPrice] = useState('')
  const [orderAmount, setOrderAmount] = useState('0.1')

  const sourceInterval = useMemo(() => (dataset ? detectInterval(dataset.bars) : null), [dataset])
  const storageKey = useMemo(() => workspaceKey(dataset), [dataset])
  const loadedKeyRef = useRef(null)

  // Al abrir un archivo recuperamos lo que se había dibujado para él; los
  // indicadores son globales (los guarda el efecto de arriba).
  useEffect(() => {
    const guardado = loadWorkspace(storageKey)
    setIntervalValue(guardado?.interval ?? sourceInterval?.value ?? null)
    setMagnet(Boolean(guardado?.magnet))
    setReplay(null)
    clearHistory(guardado?.drawings ?? [])
    setSelectedId(null)
    setTool(null)
    resetSimulation()
    loadedKeyRef.current = storageKey
  }, [sourceInterval, dataset, storageKey])

  // Y lo vamos guardando mientras se trabaja, sin escribir en cada tecla.
  useEffect(() => {
    if (!storageKey || loadedKeyRef.current !== storageKey) return
    const id = window.setTimeout(() => saveWorkspace(storageKey, { interval, drawings, magnet }), 400)
    return () => window.clearTimeout(id)
  }, [storageKey, interval, drawings, magnet])

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
      setDrawingsState((current) => {
        if (!current.length) return current
        const next = remapDrawings(current, previous.bars, previous.stepSeconds, bars, stepSeconds)
        historyRef.current = {
          list: historyRef.current.list.map(listState =>
            remapDrawings(listState, previous.bars, previous.stepSeconds, bars, stepSeconds)
          ),
          index: historyRef.current.index
        }
        return next
      })
    }
    previousRef.current = { bars, stepSeconds }
  }, [bars, stepSeconds])

  const drawingProps = useMemo(
    () => ({
      drawings,
      tool,
      selectedId,
      magnet,
      bars,
      onCreate: (drawing) => {
        setDrawings((current) => [...current, drawing])
        setSelectedId(drawing.id)
      },
      onChange: (drawing, options) =>
        setDrawings(
          (current) => current.map((d) => (d.id === drawing.id ? drawing : d)),
          options?.dragging === true,
        ),
      // Al agarrar anotamos el estado previo y al soltar el final: así el
      // arrastre entero es un solo paso de deshacer.
      onCheckpoint: () => setDrawings((current) => current),
      onCommitDrag: () => setDrawings((current) => current),
      onSelect: setSelectedId,
      onToolEnd: () => setTool(null),
      onOpenSettings: (id) => {
        setSelectedId(id)
        setDialog(id)
      },
      onContextMenu: setMenu,
    }),
    [drawings, tool, selectedId, magnet, bars],
  )

  const borrarObjeto = (id) => {
    setDrawings((current) => current.filter((d) => d.id !== id))
    setSelectedId(null)
  }

  const duplicarObjeto = (id) => {
    const original = drawings.find((d) => d.id === id)
    if (!original) return
    // Desplazada un poco para que se vea que son dos.
    const copia = cloneDrawing(original, Math.max(1, Math.round(bars.length * 0.01)), 0)
    setDrawings((current) => [...current, copia])
    setSelectedId(copia.id)
  }

  const invertirObjeto = (id) =>
    setDrawings((current) => current.map((d) => (d.id === id ? reverseDrawing(d) : d)))

  const alFrente = (id) =>
    setDrawings((current) => {
      const objetivo = current.find((d) => d.id === id)
      return objetivo ? [...current.filter((d) => d.id !== id), objetivo] : current
    })

  const availableIntervals = sourceInterval ? intervalsAtLeast(sourceInterval.ms) : []
  const visibleCount = replay ? replay.index : bars.length
  const currentBar = bars[Math.max(0, visibleCount - 1)] ?? null
  const selected = drawings.find((d) => d.id === selectedId) ?? null

  // Atajos de teclado del gráfico y replay.
  useEffect(() => {
    function onKeyDown(event) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return
      if (dialog) return

      // 1. Borrar dibujo seleccionado
      if (selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
        setDrawings((current) => current.filter((d) => d.id !== selectedId))
        setSelectedId(null)
        return
      }

      // 2. Deshacer / Rehacer (Ctrl+Z / Ctrl+Y)
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault()
          undo()
        } else if (event.key.toLowerCase() === 'y') {
          event.preventDefault()
          redo()
        }
        return
      }

      // 3. Controles del replay
      if (replay) {
        if (event.key === ' ') {
          event.preventDefault()
          setReplay((r) => ({ ...r, playing: !r.playing && r.index < bars.length }))
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          setReplay((r) => ({ ...r, index: Math.min(bars.length, r.index + 1), playing: false }))
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setReplay((r) => ({ ...r, index: Math.max(1, r.index - 1), playing: false }))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, dialog, replay, bars.length])

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


  function executeOrder(type, price, amount, time) {
    setPosition((prev) => {
      if (!prev) {
        const cost = price * amount
        if (type === 'buy') {
          setBalance((b) => b - cost)
          return { type: 'long', entryPrice: price, amount, time }
        } else {
          setBalance((b) => b + cost)
          return { type: 'short', entryPrice: price, amount, time }
        }
      }

      if ((prev.type === 'long' && type === 'buy') || (prev.type === 'short' && type === 'sell')) {
        const cost = price * amount
        const totalAmount = prev.amount + amount
        const avgEntryPrice = (prev.entryPrice * prev.amount + price * amount) / totalAmount
        if (type === 'buy') {
          setBalance((b) => b - cost)
        } else {
          setBalance((b) => b + cost)
        }
        return { ...prev, entryPrice: avgEntryPrice, amount: totalAmount }
      } else {
        if (amount >= prev.amount) {
          const remainingAmount = amount - prev.amount
          let pnl = 0
          if (prev.type === 'long') {
            const revenue = prev.amount * price
            pnl = revenue - (prev.amount * prev.entryPrice)
            setBalance((b) => b + revenue)
          } else {
            const cost = prev.amount * price
            pnl = (prev.amount * prev.entryPrice) - cost
            setBalance((b) => b - cost)
          }

          setTrades((t) => [
            ...t,
            {
              type: prev.type,
              entryPrice: prev.entryPrice,
              exitPrice: price,
              amount: prev.amount,
              pnl,
              pnlPct: (pnl / (prev.amount * prev.entryPrice)) * 100 * (prev.type === 'long' ? 1 : -1),
              entryTime: prev.time,
              exitTime: time,
            },
          ])

          if (remainingAmount > 0) {
            const cost = price * remainingAmount
            if (type === 'buy') {
              setBalance((b) => b - cost)
              return { type: 'long', entryPrice: price, amount: remainingAmount, time }
            } else {
              setBalance((b) => b + cost)
              return { type: 'short', entryPrice: price, amount: remainingAmount, time }
            }
          }
          return null
        } else {
          let pnl = 0
          if (prev.type === 'long') {
            const revenue = amount * price
            pnl = revenue - (amount * prev.entryPrice)
            setBalance((b) => b + revenue)
          } else {
            const cost = amount * price
            pnl = (amount * prev.entryPrice) - cost
            setBalance((b) => b - cost)
          }

          setTrades((t) => [
            ...t,
            {
              type: prev.type,
              entryPrice: prev.entryPrice,
              exitPrice: price,
              amount: amount,
              pnl,
              pnlPct: (pnl / (amount * prev.entryPrice)) * 100 * (prev.type === 'long' ? 1 : -1),
              entryTime: prev.time,
              exitTime: time,
            },
          ])

          return { ...prev, amount: prev.amount - amount }
        }
      }
    })
  }

  function handleMarketOrder(type) {
    if (!currentBar) return
    const amount = parseFloat(orderAmount)
    if (isNaN(amount) || amount <= 0) return
    executeOrder(type, currentBar.close, amount, currentBar.time)
  }

  function handleLimitOrder(type) {
    const price = parseFloat(orderPrice)
    const amount = parseFloat(orderAmount)
    if (isNaN(price) || price <= 0 || isNaN(amount) || amount <= 0) return
    setLimitOrders((orders) => [
      ...orders,
      { id: Date.now().toString(36), type, price, amount },
    ])
    setOrderPrice('')
  }

  function cancelLimitOrder(id) {
    setLimitOrders((orders) => orders.filter((o) => o.id !== id))
  }

  function closePosition() {
    if (!position || !currentBar) return
    executeOrder(position.type === 'long' ? 'sell' : 'buy', currentBar.close, position.amount, currentBar.time)
  }

  function resetSimulation() {
    setBalance(10000)
    setPosition(null)
    setTrades([])
    setLimitOrders([])
  }

  // Evaluar órdenes límite pendientes al avanzar la simulación
  useEffect(() => {
    if (!replay) return
    const bar = bars[replay.index - 1]
    if (!bar) return

    setLimitOrders((orders) => {
      if (!orders.length) return orders
      const remaining = []
      orders.forEach((order) => {
        const executed = bar.low <= order.price && order.price <= bar.high
        if (executed) {
          executeOrder(order.type, order.price, order.amount, bar.time)
        } else {
          remaining.push(order)
        }
      })
      return remaining
    })
    // Sólo al avanzar la reproducción: agregar más deps re-ejecutaría órdenes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay?.index])

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

        <span className="undo-group">
          <button onClick={undo} title="Deshacer (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} title="Rehacer (Ctrl+Y)">
            ↷
          </button>
        </span>

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
          magnet={magnet}
          onToggleMagnet={() => setMagnet((m) => !m)}
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
              {!tool && magnet && <span className="hint">Imán activo</span>}
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

      {replay && (
        <div className="panel paper-trading">
          <div className="trading-section">
            <h4>Simulador de Trading</h4>
            <div className="trading-stats">
              <span>Balance: <strong>${formatPrice(balance)}</strong></span>
              {position && (
                <>
                  <span className={`position-badge ${position.type}`}>
                    {position.type === 'long' ? 'LONG' : 'SHORT'} {position.amount} BTC
                  </span>
                  <span>Entrada: ${formatPrice(position.entryPrice)}</span>
                  <span>
                    PnL:{' '}
                    <strong
                      className={
                        currentBar && currentBar.close >= position.entryPrice
                          ? position.type === 'long' ? 'up' : 'down'
                          : position.type === 'long' ? 'down' : 'up'
                      }
                    >
                      ${currentBar ? formatPrice((currentBar.close - position.entryPrice) * position.amount * (position.type === 'long' ? 1 : -1)) : '0.00'}
                    </strong>
                  </span>
                  <button className="x-close" onClick={closePosition}>Cerrar Posición</button>
                </>
              )}
            </div>
            <div className="trading-actions">
              <div className="input-group">
                <label>
                  Cant:
                  <input
                    type="number"
                    step="0.01"
                    style={{ width: '70px' }}
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                  />
                </label>
                <label>
                  Precio Límite:
                  <input
                    type="number"
                    step="0.1"
                    style={{ width: '100px' }}
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    placeholder="Límite"
                  />
                </label>
              </div>
              <div className="buttons-group">
                <button className="buy" onClick={() => handleMarketOrder('buy')}>Compra Market</button>
                <button className="sell" onClick={() => handleMarketOrder('sell')}>Venta Market</button>
                <button onClick={() => handleLimitOrder('buy')}>Compra Límite</button>
                <button onClick={() => handleLimitOrder('sell')}>Venta Límite</button>
                <button className="ghost" onClick={resetSimulation}>Reiniciar Simulador</button>
              </div>
            </div>
          </div>
          {limitOrders.length > 0 && (
            <div className="limit-orders-list">
              <h5>Órdenes Límite Pendientes ({limitOrders.length})</h5>
              <div className="orders-tags">
                {limitOrders.map((o) => (
                  <span key={o.id} className="order-tag">
                    {o.type === 'buy' ? 'COMPRA' : 'VENTA'} Límite {o.amount} @ ${formatPrice(o.price)}
                    <button className="cancel-btn" onClick={() => cancelLimitOrder(o.id)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {trades.length > 0 && (
            <div className="trades-history">
              <h5>Historial de Trades ({trades.length})</h5>
              <div className="trades-table-container">
                <table className="trades-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Cantidad</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t, idx) => (
                      <tr key={idx}>
                        <td className={t.type === 'long' ? 'up' : 'down'}>
                          {t.type === 'long' ? 'LONG' : 'SHORT'}
                        </td>
                        <td>${formatPrice(t.entryPrice)}</td>
                        <td>${formatPrice(t.exitPrice)}</td>
                        <td>{t.amount}</td>
                        <td className={t.pnl >= 0 ? 'up' : 'down'}>
                          ${formatPrice(t.pnl)} ({t.pnlPct.toFixed(2)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Configurar…', onClick: () => setDialog(menu.id) },
            { label: 'Duplicar', onClick: () => duplicarObjeto(menu.id) },
            ...(drawings.find((d) => d.id === menu.id)?.type === 'horizontal'
              ? []
              : [{ label: 'Invertir', onClick: () => invertirObjeto(menu.id) }]),
            { label: 'Traer al frente', onClick: () => alFrente(menu.id) },
            { separator: true },
            { label: 'Eliminar', shortcut: 'Supr', danger: true, onClick: () => borrarObjeto(menu.id) },
          ]}
        />
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
