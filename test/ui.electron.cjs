// Prueba de UI end-to-end sobre el build de producción cargado en Electron:
// carga un CSV, prende indicadores, cambia intervalo y corre la reproducción.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const ROOT = path.join(__dirname, "..")
const LEVELS = ['debug', 'info', 'warning', 'error']

// CSV sintético: 2000 velas de 1 minuto con un random walk reproducible.
function makeCsv() {
  const rows = ['open_time,open,high,low,close,volume']
  let price = 42000
  let seed = 12345
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5)
  const start = Date.UTC(2024, 0, 1)
  for (let i = 0; i < 2000; i++) {
    const open = price
    const close = open * (1 + rand() * 0.004)
    const high = Math.max(open, close) * 1.001
    const low = Math.min(open, close) * 0.999
    rows.push([start + i * 60000, open.toFixed(2), high.toFixed(2), low.toFixed(2), close.toFixed(2), (10 + rand() * 5).toFixed(3)].join(','))
    price = close
  }
  return rows.join('\n')
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function report(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const errors = []
  win.webContents.on('console-message', (e) => {
    if (LEVELS[e.level] === 'error') errors.push(e.message)
  })

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'))
  await wait(1500)

  // Si algo se cuelga, salimos igual con el detalle de hasta dónde llegamos.
  setTimeout(() => {
    console.log('TIMEOUT: la prueba no terminó')
    app.exit(1)
  }, 150000)

  const run = async (code) => {
    try {
      return await win.webContents.executeJavaScript(code)
    } catch (err) {
      console.log(`  !! el script falló en el renderer: ${err.message}`)
      return null
    }
  }

  // --- pestañas ---
  const tabs = await run(`[...document.querySelectorAll('nav .tab')].map(b => b.textContent)`)
  report('las tres pestañas existen', tabs.length === 3, tabs.join(' | '))

  const bridge = await run(`typeof window.desktop?.saveFile === 'function' && typeof window.desktop?.openWindow === 'function'`)
  report('el puente de escritorio expone saveFile y openWindow', bridge === true)

  // --- vista Análisis: carga de archivo ---
  await run(`[...document.querySelectorAll('nav .tab')].find(b => b.textContent.includes('Análisis')).click()`)
  await wait(300)

  const dropzone = await run(`!!document.querySelector('.dropzone')`)
  report('muestra la zona para soltar el archivo', dropzone === true)

  await win.webContents.executeJavaScript(`(() => {
    const csv = ${JSON.stringify(makeCsv())};
    const input = document.querySelector('input[type=file]');
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'BTCUSDT-1m-test.csv', { type: 'text/csv' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(2000)

  const loaded = await run(`(() => {
    const source = document.querySelector('.panel.source');
    return {
      texto: source ? source.textContent : null,
      canvases: document.querySelectorAll('.chart canvas').length,
      intervalo: document.querySelector('.panel.controls select')?.value ?? null,
      opciones: [...(document.querySelectorAll('.panel.controls select')[0]?.options ?? [])].map(o => o.value),
    };
  })()`)
  report('el archivo se parseó y se muestra el resumen', /2\.000 velas/.test(loaded.texto ?? ''), loaded.texto?.slice(0, 90))
  report('el gráfico dibujó canvas', loaded.canvases > 0, `${loaded.canvases} canvas`)
  report('detectó el intervalo de origen (1m)', loaded.intervalo === '1m', String(loaded.intervalo))
  report('no ofrece intervalos menores al de origen', !loaded.opciones.includes('1s') && loaded.opciones[0] === '1m', loaded.opciones.slice(0, 4).join(','))

  // --- indicadores en paneles separados ---
  const beforePanes = loaded.canvases
  await run(`[...document.querySelectorAll('.chip')].filter(c => /RSI|MACD/.test(c.textContent)).forEach(c => c.querySelector('input').click())`)
  await wait(1200)
  const afterPanes = await run(`document.querySelectorAll('.chart canvas').length`)
  report('activar RSI y MACD agrega paneles', afterPanes > beforePanes, `${beforePanes} -> ${afterPanes} canvas`)

  // --- cambio de intervalo (reagregado) ---
  await run(`(() => {
    const select = document.querySelector('.panel.controls select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '1h');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(1200)
  const afterInterval = await run(`document.querySelector('.panel.ohlc')?.textContent ?? ''`)
  report('cambiar a 1 hora reagrupa las velas', afterInterval.includes('UTC'), afterInterval.slice(0, 60))

  // --- reproducción ---
  await run(`(() => {
    const select = document.querySelector('.panel.controls select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, '1m');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(1000)

  await run(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Reproducción')).click()`)
  await wait(600)
  const replayStart = await run(`document.querySelector('.panel.replay')?.textContent ?? ''`)
  report('la barra de reproducción aparece con contador', /\/\s*2\.000/.test(replayStart), replayStart.slice(-30))

  const indexBefore = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  await run(`[...document.querySelectorAll('.panel.replay button')].find(b => b.textContent.includes('Reproducir')).click()`)
  await wait(2500)
  const indexAfter = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  report('al reproducir avanzan las velas', indexAfter > indexBefore, `${indexBefore} -> ${indexAfter}`)

  await run(`[...document.querySelectorAll('.panel.replay button')].find(b => b.textContent.includes('Pausa')).click()`)
  await wait(400)
  const paused = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  await wait(900)
  const stillPaused = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  report('la pausa detiene el avance', paused === stillPaused, `${paused} == ${stillPaused}`)

  // paso manual hacia adelante y atrás
  await run(`[...document.querySelectorAll('.panel.replay button')].find(b => b.textContent === '▶').click()`)
  await wait(300)
  const stepped = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  await run(`[...document.querySelectorAll('.panel.replay button')].find(b => b.textContent === '◀').click()`)
  await wait(300)
  const back = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  report('paso adelante y atrás vela por vela', stepped === stillPaused + 1 && back === stepped - 1, `${stillPaused} -> ${stepped} -> ${back}`)

  // --- vista Descargar ---
  await run(`[...document.querySelectorAll('nav .tab')].find(b => b.textContent.includes('Descargar')).click()`)
  await wait(500)
  const estimate = await run(`document.querySelector('.panel.estimate')?.textContent ?? ''`)
  report('la vista de descarga estima velas y peso', /Velas estimadas/.test(estimate) && /Peso aprox/.test(estimate), estimate.replace(/\s+/g, ' ').slice(0, 110))

  // cambiar a 1 minuto sube la estimación y dispara el aviso de volumen
  await run(`(() => {
    const selects = document.querySelectorAll('.panel.controls select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(selects[0], '1m');
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(400)
  const estimate1m = await run(`document.querySelector('.panel.estimate')?.textContent ?? ''`)
  report('el estimado reacciona al intervalo', estimate1m !== estimate, estimate1m.replace(/\s+/g, ' ').slice(0, 110))

  const realErrors = errors.filter((m) => !/Failed to fetch|ERR_|net::/i.test(m))
  report('sin errores de consola propios', realErrors.length === 0, realErrors.join(' | ').slice(0, 200))

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks OK`)
  app.exit(process.exitCode ?? 0)
})
