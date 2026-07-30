// Prueba de UI end-to-end sobre el build de producción cargado en Electron:
// carga un CSV, configura indicadores por formulario, dibuja herramientas con
// clics sobre el gráfico, las edita en su ventana y corre la reproducción.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
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
  results.push({ name, ok })
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

  setTimeout(() => {
    console.log('TIMEOUT: la prueba no terminó')
    app.exit(1)
  }, 180000)

  // Envolvemos cada script para que el error real del renderer llegue acá:
  // executeJavaScript sólo devuelve "Script failed to execute".
  const run = async (code) => {
    const wrapped = `new Promise((ok) => ok((${code}))).then(
      (valor) => ({ valor }),
      (e) => ({ error: String(e && e.message || e), stack: String(e && e.stack || '').split('\\n')[1] }),
    )`
    let result
    try {
      result = await win.webContents.executeJavaScript(wrapped)
    } catch (err) {
      console.log(`  !! no se pudo evaluar el script: ${err.message}`)
      return null
    }
    if (result?.error) {
      console.log(`  !! error en el renderer: ${result.error} —${result.stack ?? ''}`)
      return null
    }
    return result?.valor
  }

  // Helpers que viven en la página.
  const helpers = `
    const texto = (el) => (el ? el.textContent.trim() : '');
    const porTexto = (sel, txt) => [...document.querySelectorAll(sel)].find(e => e.textContent.includes(txt));
    const setValor = (el, valor) => {
      const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, String(valor));
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const anchoGrafico = () => Math.round(document.querySelector('.chart-wrap').getBoundingClientRect().width);
    // Busca el tirador cerca de donde lo dejamos: el gráfico puede haberse
    // desplazado unos píxeles, igual que le pasaría a alguien apuntando con el
    // mouse. Devuelve el punto exacto donde la capa lo reconoce.
    const buscarTirador = (cx, cy) => {
      const wrap = document.querySelector('.chart-wrap');
      const rect = wrap.getBoundingClientRect();
      for (let r = 0; r <= 24; r += 3) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
          wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + cx + dx, clientY: rect.top + cy + dy }));
          if (wrap.style.cursor === 'grab') return { x: cx + dx, y: cy + dy };
        }
      }
      return null;
    };
    const contarObjetos = () => {
      const boton = document.querySelector('.chart-toolbar .tool[aria-label="Borrar todos los objetos"]');
      const m = /(\\d+)/.exec(boton?.title ?? '');
      return m ? Number(m[1]) : 0;
    };
  `

  // --- pestañas ---
  const tabs = await run(`[...document.querySelectorAll('nav .tab')].map(b => b.textContent)`)
  report('quedan sólo Análisis y Descargar datos', tabs.length === 2 && !tabs.some((t) => /vivo/i.test(t)), tabs.join(' | '))
  report('abre en Análisis por defecto', await run(`!!document.querySelector('.dropzone')`))

  const bridge = await run(`typeof window.desktop?.saveFile === 'function' && typeof window.desktop?.openWindow === 'function'`)
  report('el puente de escritorio expone saveFile y openWindow', bridge === true)

  // --- carga del archivo ---
  await run(`(() => {
    const csv = ${JSON.stringify(makeCsv())};
    const input = document.querySelector('input[type=file]');
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'BTCUSDT-1m-test.csv', { type: 'text/csv' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await wait(2000)

  const cargado = await run(`(() => {${helpers}
    return {
      topbar: texto(document.querySelector('.chart-topbar')),
      leyenda: texto(document.querySelector('.legend')),
      canvases: document.querySelectorAll('.chart-wrap canvas').length,
      overlay: !!document.querySelector('canvas.drawing-layer'),
      intervalo: document.querySelector('.chart-topbar select')?.value ?? null,
      opciones: [...(document.querySelector('.chart-topbar select')?.options ?? [])].map(o => o.value),
      herramientas: [...document.querySelectorAll('.chart-toolbar .tool')].map(b => b.getAttribute('aria-label')),
    };
  })()`)
  report('la barra superior muestra el archivo y el resumen', /BTCUSDT-1m-test\.csv/.test(cargado.topbar) && /2\.000 velas/.test(cargado.topbar), cargado.topbar.slice(0, 70))
  report('la leyenda muestra el OHLC sobre el gráfico', /A \d/.test(cargado.leyenda) && /C \d/.test(cargado.leyenda), cargado.leyenda.slice(0, 60))
  report('el gráfico dibujó canvas y tiene capa de dibujo', cargado.canvases > 0 && cargado.overlay, `${cargado.canvases} canvas`)
  report('detectó el intervalo de origen (1m)', cargado.intervalo === '1m', String(cargado.intervalo))
  report('no ofrece intervalos menores al de origen', cargado.opciones[0] === '1m', cargado.opciones.slice(0, 4).join(','))
  report(
    'la barra lateral tiene cursor, fibonacci, largo, corto y papelera',
    cargado.herramientas.length === 5 && /Fibonacci/i.test(cargado.herramientas[1]),
    cargado.herramientas.join(' | '),
  )

  // --- ventana de indicadores ---
  const anchoAntes = await run(`(() => {${helpers} return anchoGrafico(); })()`)
  await run(`(() => {${helpers} porTexto('.chart-topbar button', 'Indicadores').click(); return true; })()`)
  await wait(500)
  const dialogoIndicadores = await run(`(() => {${helpers}
    return {
      titulo: texto(document.querySelector('.modal-head strong')),
      medias: [...document.querySelectorAll('.modal .ind-row select')].length,
      secciones: [...document.querySelectorAll('.modal h4')].map(h => h.textContent),
    };
  })()`)
  report('el botón Indicadores abre su ventana', dialogoIndicadores.titulo === 'Indicadores', dialogoIndicadores.titulo)
  report('la ventana agrupa medias, precio y paneles', dialogoIndicadores.secciones.length >= 3, dialogoIndicadores.secciones.join(' | '))

  // Agregar EMA 200 y encender RSI y MACD desde el formulario.
  await run(`(() => {${helpers}
    const fila = document.querySelector('.modal .ind-row.add');
    setValor(fila.querySelector('select'), 'ema');
    setValor(fila.querySelector('input[type=number]'), '200');
    porTexto('.modal button', 'Agregar media').click();
    return true;
  })()`)
  await wait(400)
  await run(`(() => {${helpers}
    for (const nombre of ['RSI', 'MACD']) {
      const fila = [...document.querySelectorAll('.modal .ind-row')].find(r => r.querySelector('.ind-name')?.textContent.trim() === nombre);
      fila.querySelector('input[type=checkbox]').click();
    }
    return true;
  })()`)
  await wait(400)
  const parametros = await run(`(() => {${helpers}
    const fila = [...document.querySelectorAll('.modal .ind-row')].find(r => r.querySelector('.ind-name')?.textContent.trim() === 'MACD');
    return [...fila.querySelectorAll('input[type=number]')].map(i => i.value);
  })()`)
  report('MACD expone sus períodos configurables', parametros?.join(',') === '12,26,9', String(parametros))

  await run(`(() => {${helpers} porTexto('.modal-foot button', 'Aceptar').click(); return true; })()`)
  await wait(1500)
  const trasIndicadores = await run(`(() => {${helpers}
    return {
      abierto: !!document.querySelector('.modal'),
      boton: texto(porTexto('.chart-topbar button', 'Indicadores')),
      canvases: document.querySelectorAll('.chart-wrap canvas').length,
    };
  })()`)
  report('Aceptar cierra la ventana y aplica los indicadores', !trasIndicadores.abierto && /\(6\)/.test(trasIndicadores.boton), trasIndicadores.boton)
  const anchoDespues = await run(`(() => {${helpers} return anchoGrafico(); })()`)
  report('el gráfico no cambia de ancho al abrir y cerrar una ventana', anchoAntes === anchoDespues, `${anchoAntes}px -> ${anchoDespues}px`)
  report('RSI y MACD agregan paneles al gráfico', trasIndicadores.canvases > cargado.canvases, `${cargado.canvases} -> ${trasIndicadores.canvases} canvas`)

  // --- herramientas de dibujo desde la barra lateral ---
  const dosClics = `(etiqueta, x1, y1, x2, y2) => {
    const wrap = document.querySelector('.chart-wrap');
    const rect = wrap.getBoundingClientRect();
    document.querySelector('.chart-toolbar .tool[aria-label="' + etiqueta + '"]').click();
    return new Promise((resolve) => setTimeout(() => {
      const click = (dx, dy) => {
        const o = { bubbles: true, clientX: rect.left + dx, clientY: rect.top + dy };
        wrap.dispatchEvent(new MouseEvent('mousemove', o));
        wrap.dispatchEvent(new MouseEvent('mousedown', o));
      };
      click(x1, y1);
      setTimeout(() => { click(x2, y2); resolve(true); }, 150);
    }, 150));
  }`

  const dobleClicSobreTirador = (cx, cy) => `(() => {${helpers}
    const punto = buscarTirador(${cx}, ${cy});
    if (!punto) return false;
    const wrap = document.querySelector('.chart-wrap');
    const rect = wrap.getBoundingClientRect();
    wrap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: rect.left + punto.x, clientY: rect.top + punto.y }));
    return true;
  })()`

  await run(`(${dosClics})('Retroceso de Fibonacci', 220, 120, 460, 280)`)
  await wait(900)
  const trasFib = await run(`(() => {${helpers}
    return { seleccionado: texto(document.querySelector('.selected-object')), objetos: contarObjetos() };
  })()`)
  report('la barra lateral dibuja un Fibonacci con dos clics', trasFib.objetos === 1 && /Fibonacci/.test(trasFib.seleccionado), trasFib.seleccionado)

  // --- ventana de configuración del dibujo (doble clic) ---
  await run(dobleClicSobreTirador(220, 120))
  await wait(600)
  const config = await run(`(() => {${helpers}
    return {
      titulo: texto(document.querySelector('.modal-head strong')),
      pestanas: [...document.querySelectorAll('.modal-tabs .tab')].map(t => t.textContent),
      niveles: document.querySelectorAll('.modal .level').length,
      encendidos: [...document.querySelectorAll('.modal .level input[type=checkbox]')].filter(c => c.checked).length,
      colores: document.querySelectorAll('.modal .level input[type=color]').length,
      ampliar: !!porTexto('.modal .field', 'Ampliar'),
    };
  })()`)
  report('doble clic sobre el objeto abre su ventana', config.titulo === 'Fibonacci', config.titulo)
  report('la ventana tiene pestañas Estilo y Coordenadas', config.pestanas.join(',') === 'Estilo,Coordenadas', config.pestanas.join(','))
  report('lista los niveles con casilla y color, como TradingView', config.niveles === 12 && config.colores === 12 && config.encendidos === 7, `${config.niveles} niveles, ${config.encendidos} activos`)
  report('incluye la opción de ampliar las líneas', config.ampliar === true)

  // Apagar el nivel 0.5 y confirmar que el cambio persiste al reabrir.
  await run(`(() => {${helpers}
    const niveles = [...document.querySelectorAll('.modal .level')];
    const valores = niveles.map(l => l.querySelector('input[type=number]').value);
    const nivel = niveles.find(l => l.querySelector('input[type=number]').value === '0.5');
    if (!nivel) return { encontrado: false, valores, modales: document.querySelectorAll('.modal').length };
    nivel.querySelector('input[type=checkbox]').click();
    porTexto('.modal-foot button', 'Aceptar').click();
    return { encontrado: true, valores };
  })()`)
  await wait(700)
  await run(dobleClicSobreTirador(220, 120))
  await wait(600)
  const trasApagar = await run(`(() => {${helpers}
    const niveles = [...document.querySelectorAll('.modal .level')];
    const nivel = niveles.find(l => l.querySelector('input[type=number]').value === '0.5');
    if (!nivel) return { activo: null, encendidos: -1, modales: document.querySelectorAll('.modal').length, valores: niveles.map(l => l.querySelector('input[type=number]').value) };
    return { activo: nivel.querySelector('input[type=checkbox]').checked, encendidos: [...document.querySelectorAll('.modal .level input[type=checkbox]')].filter(c => c.checked).length };
  })()`)
  report('apagar un nivel queda guardado', trasApagar.activo === false && trasApagar.encendidos === 6, `${trasApagar.encendidos} activos`)

  await run(`(() => {${helpers} porTexto('.modal-foot button', 'Cancelar').click(); return true; })()`)
  await wait(400)

  // --- posición larga ---
  await run(`(${dosClics})('Posición larga', 250, 320, 500, 190)`)
  await wait(900)
  const trasLarga = await run(`(() => {${helpers}
    return { seleccionado: texto(document.querySelector('.selected-object')), objetos: contarObjetos() };
  })()`)
  report('la posición larga se dibuja igual', trasLarga.objetos === 2 && /Posición larga/.test(trasLarga.seleccionado), trasLarga.seleccionado)

  await run(`(() => {${helpers} porTexto('.selected-object button', 'Configurar').click(); return true; })()`)
  await wait(600)
  await run(`(() => {${helpers} porTexto('.modal-tabs .tab', 'Coordenadas').click(); return true; })()`)
  await wait(400)
  const coords = await run(`(() => {${helpers}
    const campos = [...document.querySelectorAll('.modal .field')].map(f => ({ label: f.textContent.trim(), valor: Number(f.querySelector('input').value) }));
    return { campos, resumen: texto(document.querySelector('.modal-body p')) };
  })()`)
  report(
    'la pestaña Coordenadas trae entrada, objetivo y stop',
    coords.campos.length === 3 && coords.campos[1].valor > coords.campos[0].valor && coords.campos[2].valor < coords.campos[0].valor,
    coords.campos.map((c) => `${c.label}=${c.valor.toFixed(0)}`).join(' '),
  )
  report('muestra el riesgo/beneficio calculado', /Riesgo\/beneficio 1[.,]00/.test(coords.resumen), coords.resumen.slice(0, 70))

  // Cambiar el stop desde el formulario deja R/R = 3.
  await run(`(() => {${helpers}
    const campos = [...document.querySelectorAll('.modal .field input')];
    const entrada = Number(campos[0].value), objetivo = Number(campos[1].value);
    setValor(campos[2], entrada - (objetivo - entrada) / 3);
    return true;
  })()`)
  await wait(400)
  const trasEditar = await run(`(() => {${helpers} return texto(document.querySelector('.modal-body p')); })()`)
  report('editar el stop en el formulario recalcula el R/R', /Riesgo\/beneficio 3[.,]00/.test(trasEditar), trasEditar.slice(0, 70))

  await run(`(() => {${helpers} porTexto('.modal-foot button', 'Aceptar').click(); return true; })()`)
  await wait(600)

  // --- arrastre de un tirador ---
  const antesDeArrastrar = await run(`(() => {${helpers}
    const punto = buscarTirador(250, 320);
    if (!punto) return { agarro: false };
    const wrap = document.querySelector('.chart-wrap');
    const rect = wrap.getBoundingClientRect();
    const evento = (tipo, dx, dy) => new MouseEvent(tipo, { bubbles: true, clientX: rect.left + dx, clientY: rect.top + dy });
    // Con el tirador agarrado, la capa toma el mouse para que el gráfico no paneé.
    const agarro = document.querySelector('.drawing-layer').style.pointerEvents === 'auto';
    evento('mousedown', punto.x, punto.y);
    wrap.dispatchEvent(evento('mousedown', punto.x, punto.y));
    wrap.dispatchEvent(evento('mousemove', punto.x, punto.y + 40));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { agarro, punto };
  })()`)
  report('el puntero agarra el tirador de entrada', antesDeArrastrar?.agarro === true, JSON.stringify(antesDeArrastrar?.punto))
  await wait(700)
  await run(`(() => {${helpers} porTexto('.selected-object button', 'Configurar').click(); return true; })()`)
  await wait(500)
  await run(`(() => {${helpers} porTexto('.modal-tabs .tab', 'Coordenadas').click(); return true; })()`)
  await wait(400)
  const trasArrastrar = await run(`Number(document.querySelector('.modal .field input').value)`)
  report(
    'arrastrar el tirador de entrada baja el precio de entrada',
    trasArrastrar != null && trasArrastrar < coords.campos[0].valor,
    `${coords.campos[0].valor.toFixed(2)} -> ${trasArrastrar?.toFixed(2)}`,
  )
  await run(`(() => {${helpers} porTexto('.modal-foot button', 'Cancelar').click(); return true; })()`)
  await wait(400)

  // --- los dibujos sobreviven al cambio de intervalo ---
  await run(`(() => {${helpers} setValor(document.querySelector('.chart-topbar select'), '15m'); return true; })()`)
  await wait(1300)
  const trasCambio = await run(`(() => {${helpers} return contarObjetos(); })()`)
  report('los objetos siguen ahí tras cambiar de intervalo', trasCambio === 2, `${trasCambio} objetos`)

  // --- borrar ---
  await run(`(() => {${helpers} porTexto('.selected-object button', '✕')?.click(); return true; })()`)
  await wait(600)
  const trasBorrarUno = await run(`(() => {${helpers} return contarObjetos(); })()`)
  report('se puede borrar el objeto seleccionado', trasBorrarUno === 1, `${trasBorrarUno} objetos`)

  await run(`document.querySelector('.chart-toolbar .tool[aria-label="Borrar todos los objetos"]').click()`)
  await wait(600)
  const trasBorrarTodo = await run(`(() => {${helpers} return contarObjetos(); })()`)
  report('la papelera borra todos los objetos', trasBorrarTodo === 0, `${trasBorrarTodo} objetos`)

  // --- reproducción ---
  await run(`(() => {${helpers} porTexto('.chart-topbar button', 'Reproducción').click(); return true; })()`)
  await wait(700)
  const indexBefore = await run(`Number(document.querySelector('.panel.replay input[type=range]')?.value ?? 0)`)
  report('la barra de reproducción aparece', indexBefore > 0, `arranca en ${indexBefore}`)

  await run(`(() => {${helpers} porTexto('.panel.replay button', 'Reproducir').click(); return true; })()`)
  await wait(2500)
  const indexAfter = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  report('al reproducir avanzan las velas', indexAfter > indexBefore, `${indexBefore} -> ${indexAfter}`)

  await run(`(() => {${helpers} porTexto('.panel.replay button', 'Pausa').click(); return true; })()`)
  await wait(400)
  const pausado = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  await wait(900)
  const sigueIgual = await run(`Number(document.querySelector('.panel.replay input[type=range]').value)`)
  report('la pausa detiene el avance', pausado === sigueIgual, `${pausado} == ${sigueIgual}`)

  // --- vista Descargar ---
  await run(`(() => {${helpers} porTexto('nav .tab', 'Descargar').click(); return true; })()`)
  await wait(600)
  const estimate = await run(`document.querySelector('.panel.estimate')?.textContent ?? ''`)
  report('la vista de descarga estima velas y peso', /Velas estimadas/.test(estimate) && /Peso aprox/.test(estimate), estimate.replace(/\s+/g, ' ').slice(0, 100))

  const porDefecto = await run(`document.querySelector('.panel.interval')?.textContent ?? ''`)
  report('descarga en 1 minuto por defecto', /1 minuto/.test(porDefecto) && /cualquier intervalo/.test(porDefecto), porDefecto.replace(/\s+/g, ' ').slice(0, 90))

  await run(`(() => {${helpers} porTexto('.panel.interval button', 'Cambiar intervalo').click(); return true; })()`)
  await wait(400)
  await run(`(() => {${helpers} setValor(document.querySelector('.panel.interval select'), '1d'); return true; })()`)
  await wait(400)
  const conDiario = await run(`(() => ({
    estimado: document.querySelector('.panel.estimate')?.textContent ?? '',
    aviso: document.querySelector('.panel.interval .warning-text')?.textContent ?? '',
  }))()`)
  report('el estimado reacciona al intervalo', conDiario.estimado !== estimate, conDiario.estimado.replace(/\s+/g, ' ').slice(0, 90))
  report('avisa que un intervalo mayor limita el análisis', /no menos/.test(conDiario.aviso), conDiario.aviso.replace(/\s+/g, ' ').slice(0, 80))

  const realErrors = errors.filter((m) => !/Failed to fetch|ERR_|net::/i.test(m))
  report('sin errores de consola propios', realErrors.length === 0, realErrors.join(' | ').slice(0, 200))

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks OK`)
  app.exit(process.exitCode ?? 0)
})
