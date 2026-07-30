import { useMemo, useRef, useState } from 'react'
import { INTERVALS } from '../lib/intervals.js'
import {
  DEFAULT_SYMBOL,
  POPULAR_SYMBOLS,
  estimateCandles,
  estimateRequests,
  fetchKlineRange,
} from '../lib/binance.js'
import { barsToCsv, barsToJson } from '../lib/klines.js'
import { saveTextFile } from '../lib/saveFile.js'
import { formatBytes, formatDate, formatDuration, formatNumber } from '../lib/format.js'

const FIRST_YEAR = 2017
// Bytes por vela, medidos sobre datos reales de BTCUSDT: sirven para anticipar
// el tamaño del archivo antes de bajarlo.
const BYTES_PER_CANDLE = { csv: 78, json: 96 }

function yearOptions() {
  const years = []
  for (let y = new Date().getUTCFullYear(); y >= FIRST_YEAR; y--) years.push(y)
  return years
}

export default function DownloadView({ onDataset, onGoToAnalysis }) {
  const years = useMemo(yearOptions, [])
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL)
  const [interval, setInterval] = useState('1h')
  const [fromYear, setFromYear] = useState(years[0])
  const [toYear, setToYear] = useState(years[0])
  const [format, setFormat] = useState('csv')

  const [status, setStatus] = useState('idle') // idle | downloading | done | error
  const [progress, setProgress] = useState({ count: 0, requests: 0, lastTime: null })
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)

  const abortRef = useRef(null)
  const lastPaintRef = useRef(0)

  const range = useMemo(() => {
    const start = Date.UTC(Math.min(fromYear, toYear), 0, 1)
    const end = Math.min(Date.UTC(Math.max(fromYear, toYear) + 1, 0, 1), Date.now())
    return { start, end }
  }, [fromYear, toYear])

  const estimate = useMemo(() => {
    const candles = estimateCandles(range.start, range.end, interval)
    return {
      candles,
      requests: estimateRequests(range.start, range.end, interval),
      bytes: candles * BYTES_PER_CANDLE[format],
    }
  }, [range, interval, format])

  const downloading = status === 'downloading'
  const percent = estimate.candles ? Math.min(100, (progress.count / estimate.candles) * 100) : 0

  async function start() {
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('downloading')
    setMessage('')
    setResult(null)
    setProgress({ count: 0, requests: 0, lastTime: null })

    try {
      const bars = await fetchKlineRange({
        symbol: symbol.trim(),
        interval,
        startMs: range.start,
        endMs: range.end,
        signal: controller.signal,
        onProgress: (p) => {
          // Repintar en cada petición sería cientos de renders por minuto.
          const now = performance.now()
          if (now - lastPaintRef.current < 100 && p.count) return
          lastPaintRef.current = now
          setProgress(p)
        },
      })

      if (!bars.length) {
        setStatus('error')
        setMessage(`Binance no devolvió velas para ${symbol.toUpperCase()} en ese período.`)
        return
      }

      setProgress({ count: bars.length, requests: 0, lastTime: bars.at(-1).time * 1000 })

      const sameYear = Math.min(fromYear, toYear) === Math.max(fromYear, toYear)
      const period = sameYear ? `${fromYear}` : `${Math.min(fromYear, toYear)}-${Math.max(fromYear, toYear)}`
      const name = `${symbol.toUpperCase()}-${interval}-${period}.${format}`
      const text = format === 'csv' ? barsToCsv(bars) : barsToJson(bars)

      const saved = await saveTextFile(name, text)
      setResult({ bars, name, bytes: text.length, saved: saved.saved, path: saved.path })
      setStatus('done')
      setMessage(
        saved.saved
          ? `Guardado: ${saved.path ?? name}`
          : 'Descarga lista, pero no guardaste el archivo. Podés analizarla igual o volver a guardarla.',
      )
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('idle')
        setMessage('Descarga cancelada.')
        return
      }
      setStatus('error')
      setMessage(err.message)
    } finally {
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  async function saveAgain() {
    if (!result) return
    const text = format === 'csv' ? barsToCsv(result.bars) : barsToJson(result.bars)
    const saved = await saveTextFile(result.name, text)
    if (saved.saved) setMessage(`Guardado: ${saved.path ?? result.name}`)
  }

  function analyze() {
    if (!result) return
    onDataset({ name: result.name, bars: result.bars, skipped: 0 })
    onGoToAnalysis()
  }

  return (
    <div className="view">
      <div className="panel controls wrap">
        <label>
          Par
          <input
            list="symbols"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            disabled={downloading}
            size={10}
          />
          <datalist id="symbols">
            {POPULAR_SYMBOLS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label>
          Intervalo
          <select value={interval} onChange={(e) => setInterval(e.target.value)} disabled={downloading}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>

        {interval !== '1m' && (
          <button
            onClick={() => setInterval('1m')}
            disabled={downloading}
            title="Con velas de 1 minuto podés analizar después en cualquier intervalo"
          >
            Usar 1m (sirve para todos)
          </button>
        )}

        <label>
          Desde
          <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))} disabled={downloading}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label>
          Hasta
          <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))} disabled={downloading}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label>
          Formato
          <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={downloading}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>

        {downloading ? (
          <button onClick={cancel}>Cancelar</button>
        ) : (
          <button className="primary" onClick={start} disabled={!symbol.trim() || estimate.candles === 0}>
            Descargar
          </button>
        )}
      </div>

      <div className="panel estimate">
        <span>
          Período: <strong>{formatDate(range.start / 1000, false)}</strong> →{' '}
          <strong>{formatDate(range.end / 1000, false)}</strong>
        </span>
        <span>
          Velas estimadas: <strong>{formatNumber(estimate.candles)}</strong>
        </span>
        <span>
          Peso aprox.: <strong>{formatBytes(estimate.bytes)}</strong>
        </span>
        <span className="muted">
          {formatNumber(estimate.requests)} peticiones · ~{formatDuration(estimate.requests * 0.35)}
        </span>
      </div>

      {estimate.candles > 1_000_000 && (
        <div className="panel warning">
          Son más de un millón de velas. Va a tardar varios minutos y ocupar bastante memoria; si sólo
          querés analizar, conviene un intervalo más grande.
        </div>
      )}

      {downloading && (
        <div className="panel progress">
          <div className="bar">
            <div className="fill" style={{ width: `${percent}%` }} />
          </div>
          <span>
            {formatNumber(progress.count)} velas · {progress.requests} peticiones
            {progress.lastTime ? ` · vamos por ${formatDate(progress.lastTime / 1000, false)}` : ''}
          </span>
        </div>
      )}

      {message && (
        <div className={`panel ${status === 'error' ? 'error' : 'status'}`}>{message}</div>
      )}

      {status === 'done' && result && (
        <div className="panel done">
          <span>
            <strong>{formatNumber(result.bars.length)}</strong> velas ·{' '}
            {formatDate(result.bars[0].time, false)} → {formatDate(result.bars.at(-1).time, false)} ·{' '}
            {formatBytes(result.bytes)}
          </span>
          <button className="primary" onClick={analyze}>
            Analizar estos datos
          </button>
          <button onClick={saveAgain}>Guardar de nuevo</button>
        </div>
      )}

      <div className="panel help">
        <strong>Qué intervalo conviene bajar</strong>
        <p>
          <strong>Uno solo alcanza para todos: descargá en 1 minuto.</strong> La pestaña Análisis
          reagrupa las velas hacia arriba (5m, 15m, 1h, 4h, 1d, semana, mes) desde el mismo archivo,
          así que con un CSV de 1m tenés todos los intervalos sin volver a descargar. Lo que no puede
          hacer es al revés: de un archivo de 1 hora no salen velas de 5 minutos, porque ese detalle
          no está en los datos.
        </p>
        <p className="muted">
          El costo es el tamaño: un año en 1 minuto son ~525.600 velas (unos 40 MB en CSV) y tarda un
          par de minutos. Si sólo vas a mirar gráficos diarios o de 4 horas, bajar en 1 hora son 8.760
          velas por año y termina en segundos.
        </p>
        <p className="muted">
          Los datos vienen de la API pública de Binance, de a 1000 velas por petición, con reintentos
          automáticos si te limita el ritmo. El archivo que se guarda lo lee después la pestaña
          Análisis sin ninguna conversión.
        </p>
      </div>
    </div>
  )
}
