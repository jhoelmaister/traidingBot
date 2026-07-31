# Guía del proyecto para agentes (Antigravity, Claude Code, etc.)

Herramienta de precios de cripto con dos vistas: análisis de un archivo de precios al estilo
TradingView (indicadores, herramientas de dibujo y reproducción) y descarga masiva de
históricos de Binance.
Corre en dos formatos con **el mismo código de `src/`**: web (Vite) y escritorio (Electron).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm install` | Instala dependencias (incluye el binario de Electron, ~100 MB la primera vez). |
| `npm run dev` | App web en `http://localhost:5173`. |
| `npm run desktop` | Levanta Vite y abre la ventana de Electron contra ese server (con HMR). |
| `npm run desktop:preview` | Build de producción y ventana de Electron cargando `dist/` desde `file://`. |
| `npm run desktop:dist` | Instaladores en `release/` (dmg/zip, nsis/portable, AppImage/deb). |
| `npm run build` | Build web a `dist/` (lo que publica Netlify). |
| `npm run lint` | oxlint. |
| `npm test` | Tests de la lógica pura (parseo, indicadores, reagregado, paginación). |
| `npm run test:ui` | Test end-to-end: maneja la app real dentro de Electron. Necesita display. |

En contenedores o como root hay que pasar `--no-sandbox`: `npm run desktop -- --no-sandbox`.

## Mapa de archivos

### Lógica pura (sin React, testeada en `test/`)

- `src/lib/klines.js` — parseo de CSV/JSON de velas y serialización. Tolera el formato de
  Binance con y sin encabezado, alias de columnas y timestamps en s/ms/µs/ISO.
- `src/lib/indicators.js` — SMA, EMA, RSI (Wilder), MACD, Bollinger. Devuelven arrays
  alineados por índice de vela, con `null` durante el calentamiento.
- `src/lib/resample.js` — reagrupa velas a un intervalo mayor (semana alineada al lunes UTC,
  mes al día 1).
- `src/lib/intervals.js` — catálogo de intervalos y detección del intervalo de un dataset.
- `src/lib/drawings.js` — modelo de las herramientas: niveles de Fibonacci, métricas de
  riesgo/beneficio y reubicación de dibujos entre intervalos (por tiempo).
- `src/lib/binance.js` — descarga paginada con reintentos ante 429/5xx y cancelación.
- `src/lib/saveFile.js` — diálogo nativo en escritorio, descarga del navegador en web.

### UI

- `src/App.jsx` — pestañas y estado compartido del dataset. La vista vive en el hash
  (`#/analisis`, `#/descargar`) para que Electron pueda abrir ventanas directas.
- `src/views/AnalysisView.jsx` — orquesta todo: archivo, intervalo, indicadores, dibujos, replay
  y el simulador de trading (balance, posición abierta, órdenes a mercado y límite).
- `src/views/DownloadView.jsx` — descarga por años e intervalo, con estimación y progreso.
- `src/components/CandleChart.jsx` — el gráfico con paneles (precio, volumen, RSI, MACD).
- `src/components/DrawingLayer.jsx` — canvas encima del gráfico: dibuja líneas, Fibonacci y
  posiciones, y maneja su creación, arrastre (de tiradores y del objeto entero), doble clic y
  clic derecho.
- `src/components/ChartToolbar.jsx` — barra lateral de herramientas, con íconos SVG inline.
- `src/components/Modal.jsx` — armazón de las ventanas (título, pestañas, Cancelar/Aceptar).
- `src/components/IndicatorsDialog.jsx` — formulario de indicadores (medias, BB, volumen, RSI, MACD).
- `src/components/DrawingSettingsDialog.jsx` — formulario de un dibujo (Estilo / Coordenadas).

### Escritorio

- `electron/main.cjs` — ventanas, ciclo de vida, instancia única e IPC (`save-file`, `open-window`).
- `electron/preload.cjs` — puente aislado; expone `window.desktop`.
- `scripts/dev-desktop.mjs` — arranca Vite por su API de Node y recién ahí lanza Electron.
- `vite.config.js` — `base: './'` (necesario para `file://`) e inyección de CSP sólo en build.
- `.vscode/` — tareas y configuraciones de "Run and Debug"; Antigravity las lee igual que VS Code.

## Convenciones y cuidados

- Los archivos de Electron son **`.cjs` a propósito**: `package.json` tiene `"type": "module"`.
- Los imports dentro de `src/lib/` llevan extensión `.js` para que los tests corran en Node
  sin pasar por Vite.
- La app no tiene backend: habla directo con la API pública de Binance. Si se agrega otro
  host remoto, hay que sumarlo a `connect-src` en la CSP de `vite.config.js`, o el build
  empaquetado lo va a bloquear.
- En `CandleChart.jsx`, la limpieza del efecto de series comprueba `chartRef.current !== chart`
  antes de tocar el gráfico: al desmontar, React limpia primero el efecto que lo destruyó y
  operar sobre un gráfico dado de baja lanza excepción.
- El replay usa `series.update()` cuando avanza de a una vela y `setData()` sólo al saltar:
  con cientos de miles de velas, rearmar el array en cada paso arrastra.
- Los dibujos se anclan por **coordenada lógica** (índice de vela, admite fracciones y valores
  fuera del rango) más precio, no por timestamp: así se pueden arrastrar más allá de la última
  vela. Al cambiar de intervalo se remapean por tiempo con `remapDrawings`.
- El canvas de `DrawingLayer` vive con `pointer-events: none` y sólo pasa a `auto` cuando hay
  una herramienta activa o el puntero está sobre un tirador. Si se deja siempre en `auto`, el
  gráfico pierde el paneo y el zoom.
- No activar `nodeIntegration` ni desactivar `contextIsolation` en `electron/main.cjs`:
  el renderer carga datos de red y debe seguir sin acceso a Node.
- `#root` mide exactamente `100svh` con `overflow: hidden` y hay `box-sizing: border-box`
  global: si la app desborda la ventana aparece y desaparece la barra de scroll, el gráfico
  cambia de ancho solo y los dibujos se desplazan respecto del puntero.
- Los diálogos trabajan sobre una copia (`structuredClone`) y recién aplican al Aceptar.
- Comentarios y textos de UI en español, como el resto del repo.
