// Lectura y escritura de archivos de velas. Acepta lo que la gente realmente
// tiene a mano: el JSON crudo de la API de Binance, los CSV de
// data.binance.vision (sin encabezado) y CSV/JSON exportados por otras
// herramientas, con nombres de columna variados.

// El orden importa: la primera coincidencia gana, así `open_time` le gana a
// una columna `date` legible que venga en el mismo archivo.
const ALIASES = {
  time: ['open_time', 'opentime', 'open time', 'time', 'timestamp', 'ts', 'date', 'datetime', 'fecha', 'date_utc'],
  open: ['open', 'o', 'apertura'],
  high: ['high', 'h', 'max', 'máximo', 'maximo'],
  low: ['low', 'l', 'min', 'mínimo', 'minimo'],
  close: ['close', 'c', 'cierre', 'price', 'precio'],
  volume: ['volume', 'vol', 'v', 'volumen', 'base_volume'],
}

const MICROSECONDS = 1e14
const MILLISECONDS = 1e11
const NANOSECONDS = 1e17

/**
 * Lleva cualquier marca de tiempo a segundos UTC, que es lo que consume
 * lightweight-charts. Detecta la unidad por magnitud porque Binance cambió de
 * milisegundos a microsegundos en sus dumps históricos.
 */
export function normalizeTime(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)

  const numeric = typeof value === 'number' ? value : Number(String(value).trim())
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= NANOSECONDS) return Math.floor(numeric / 1e9)
    if (numeric >= MICROSECONDS) return Math.floor(numeric / 1e6)
    if (numeric >= MILLISECONDS) return Math.floor(numeric / 1e3)
    return Math.floor(numeric)
  }

  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value == null) return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function detectDelimiter(line) {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

// Split que respeta comillas dobles, suficiente para CSV de exportaciones
// típicas (no soporta saltos de línea dentro de una celda).
function splitRow(line, delimiter) {
  const cells = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells
}

function mapHeaders(headers) {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const mapping = {}
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias)
      if (index !== -1) {
        mapping[field] = index
        break
      }
    }
  }
  return mapping
}

function buildBar(time, open, high, low, close, volume) {
  const bar = {
    time: normalizeTime(time),
    open: toNumber(open),
    high: toNumber(high),
    low: toNumber(low),
    close: toNumber(close),
    volume: toNumber(volume) ?? 0,
  }
  if (bar.time == null) return null
  if (bar.open == null || bar.high == null || bar.low == null || bar.close == null) return null
  return bar
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (!lines.length) throw new Error('El archivo está vacío.')

  const delimiter = detectDelimiter(lines[0])
  const firstRow = splitRow(lines[0], delimiter)

  // Si la segunda celda no es un número, la primera fila es encabezado.
  const hasHeader = toNumber(firstRow[1]) === null
  let mapping
  if (hasHeader) {
    mapping = mapHeaders(firstRow)
    const missing = ['time', 'open', 'high', 'low', 'close'].filter((f) => mapping[f] === undefined)
    if (missing.length) {
      throw new Error(
        `No encontré las columnas: ${missing.join(', ')}. ` +
          `Encabezados leídos: ${firstRow.join(', ')}`,
      )
    }
  } else {
    // Formato posicional de Binance: open_time, open, high, low, close, volume, ...
    if (firstRow.length < 5) {
      throw new Error(`Esperaba al menos 5 columnas por fila y encontré ${firstRow.length}.`)
    }
    mapping = { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 }
  }

  const bars = []
  let skipped = 0
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter)
    const bar = buildBar(
      cells[mapping.time],
      cells[mapping.open],
      cells[mapping.high],
      cells[mapping.low],
      cells[mapping.close],
      mapping.volume !== undefined ? cells[mapping.volume] : 0,
    )
    if (bar) bars.push(bar)
    else skipped++
  }

  return { bars, skipped }
}

function parseJson(text) {
  let data = JSON.parse(text)
  if (data && !Array.isArray(data)) {
    data = data.klines ?? data.data ?? data.candles ?? data.bars ?? data.result
  }
  if (!Array.isArray(data)) {
    throw new Error('El JSON no contiene un array de velas.')
  }

  const bars = []
  let skipped = 0

  for (const row of data) {
    let bar = null
    if (Array.isArray(row)) {
      // Formato crudo de la API: [openTime, open, high, low, close, volume, ...]
      bar = buildBar(row[0], row[1], row[2], row[3], row[4], row[5])
    } else if (row && typeof row === 'object') {
      const keys = Object.keys(row)
      const lower = new Map(keys.map((k) => [k.toLowerCase(), k]))
      const pick = (field) => {
        for (const alias of ALIASES[field]) {
          const key = lower.get(alias)
          if (key !== undefined) return row[key]
        }
        return undefined
      }
      bar = buildBar(pick('time'), pick('open'), pick('high'), pick('low'), pick('close'), pick('volume'))
    }

    if (bar) bars.push(bar)
    else skipped++
  }

  return { bars, skipped }
}

/**
 * Parsea el contenido de un archivo de velas.
 * @returns {{bars: Array, skipped: number}} velas ordenadas y sin duplicados
 */
export function parseKlines(text, fileName = '') {
  const trimmed = text.trimStart()
  const looksJson = /\.json$/i.test(fileName) || trimmed.startsWith('[') || trimmed.startsWith('{')

  const { bars, skipped } = looksJson ? parseJson(text) : parseCsv(text)
  if (!bars.length) {
    throw new Error('No se pudo leer ninguna vela válida del archivo.')
  }

  bars.sort((a, b) => a.time - b.time)

  // Un mismo minuto repetido rompe el gráfico: nos quedamos con la última.
  const deduped = []
  for (const bar of bars) {
    const last = deduped[deduped.length - 1]
    if (last && last.time === bar.time) deduped[deduped.length - 1] = bar
    else deduped.push(bar)
  }

  return { bars: deduped, skipped: skipped + (bars.length - deduped.length) }
}

const CSV_HEADER = 'open_time,open,high,low,close,volume,date_utc'

export function barsToCsv(bars) {
  const lines = [CSV_HEADER]
  for (const bar of bars) {
    const iso = new Date(bar.time * 1000).toISOString().replace('.000Z', 'Z')
    lines.push(`${bar.time * 1000},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume ?? 0},${iso}`)
  }
  return lines.join('\n')
}

export function barsToJson(bars) {
  return JSON.stringify(bars)
}
