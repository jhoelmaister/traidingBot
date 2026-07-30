# Precios y análisis de cripto

Herramienta para mirar precios de Binance sin backend propio. Corre en el navegador y también
como **aplicación de escritorio** (Windows, macOS y Linux) con el mismo código de `src/`.

Tres vistas:

- **En vivo** — velas en tiempo real por WebSocket, con reconexión automática.
- **Análisis** — abrís un archivo de precios y lo estudiás: indicadores, cambio de intervalo y
  una **reproducción** vela por vela, como el modo replay de TradingView.
- **Descargar datos** — bajás el histórico de Binance por año e intervalo y lo guardás en
  CSV o JSON, listo para volver a abrirlo en Análisis.

## Stack

- **React + Vite** — UI y bundling.
- **[lightweight-charts](https://github.com/tradingview/lightweight-charts)** — la librería de gráficos que el propio equipo de TradingView publica como open source (Apache 2.0). Se usa tal cual, no se reimplementa el motor de renderizado.
- **Electron** — envoltorio de escritorio: la misma app web dentro de una ventana nativa.
- **API pública de Binance** — sin API key ni servidor intermedio:
  - Histórico: `GET https://api.binance.com/api/v3/klines`
  - Velas en vivo: `wss://stream.binance.com:9443/ws/<par>@kline_<intervalo>`

## Cómo correrlo

```bash
npm install
```

### En el navegador

```bash
npm run dev
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173`).

### Como app de escritorio

```bash
npm run desktop
```

Levanta Vite y abre la ventana de Electron apuntando a ese server, con hot reload: editás algo
en `src/` y la ventana se actualiza sola. Cerrar la ventana apaga el server.

Para ver exactamente lo que ve un usuario final (build de producción cargado desde `file://`):

```bash
npm run desktop:preview
```

> Dentro de un contenedor o corriendo como root, Chromium exige `--no-sandbox`:
> `npm run desktop -- --no-sandbox`.

### Generar los instalables

```bash
npm run desktop:dist
```

Deja en `release/` los artefactos de la plataforma donde lo corras: `.dmg`/`.zip` en macOS,
`.exe` (NSIS y portable) en Windows, `.AppImage`/`.deb` en Linux. `npm run desktop:pack` hace
lo mismo pero sin empaquetar el instalador (queda la carpeta suelta, útil para probar rápido).

Los binarios no están firmados: en Windows aparece el aviso de SmartScreen y en macOS hay que
abrirla la primera vez con clic derecho → Abrir. Firmarlos requiere certificados de cada
plataforma, que no están en el repo.

## Las vistas

### Análisis

Se le suelta un archivo (o se elige con el botón) y lee **CSV o JSON**:

- CSV de Binance sin encabezado, tal cual sale de `data.binance.vision`.
- CSV con encabezado, incluidos nombres alternativos (`Date/Open/High/Low/Close`, o en español
  `fecha/apertura/maximo/minimo/cierre`), separado por coma, punto y coma o tabulación.
- JSON crudo de la API (array de arrays) o array de objetos.
- Timestamps en segundos, milisegundos, microsegundos o texto ISO: se detecta la unidad sola.

Una vez cargado:

- **Intervalo** — reagrupa las velas hacia arriba (de 1m a 5m, 1h, 1d, 1w, 1M…). Nunca ofrece
  un intervalo menor al del archivo, porque ese detalle no existe en los datos.
- **Medias móviles** — se agregan las que uno quiera: SMA o EMA con cualquier período (EMA 200,
  SMA 9, lo que sea), cada una con su color, y se quitan de a una.
- **Indicadores** — Bollinger, volumen, RSI 14 y MACD. Volumen, RSI y MACD van en paneles
  propios debajo del precio.
- **Herramientas de dibujo** — Fibonacci, posición larga y posición corta, como en TradingView:
  se crean con dos clics y después se ajustan arrastrando sus puntos, o escribiendo los precios
  exactos en la lista de abajo.
  - *Fibonacci*: niveles 0 / 23,6 / 38,2 / 50 / 61,8 / 78,6 / 100 %, con el precio de cada uno y
    prolongación punteada hacia la derecha.
  - *Posiciones*: caja verde hacia el objetivo, roja hacia el stop, con el porcentaje de cada
    lado y la relación riesgo/beneficio calculada en vivo. Si arrastrás el objetivo o el stop
    del lado equivocado, lo avisa en vez de mostrar un R/R sin sentido.
  - Los dibujos se reubican solos al cambiar de intervalo: se anclan por tiempo, así que un
    Fibonacci trazado en 1 minuto sigue marcando el mismo tramo cuando pasás a 1 hora.
- **Reproducción** — avanza vela por vela a la velocidad elegida (1 a 50 velas/s), con pausa,
  paso adelante/atrás y una barra para saltar a cualquier punto. Los indicadores se recalculan
  sólo con las velas ya reveladas, así que sirve para practicar sin ver el futuro.

### Descargar datos

Elegís par, intervalo y rango de años. Antes de bajar nada muestra cuántas velas son, cuánto
va a pesar y cuántas peticiones implica. La descarga se puede cancelar, reintenta sola si
Binance limita el ritmo (429) y al terminar abre el diálogo nativo para guardar (en el
navegador, una descarga común). El botón **Analizar estos datos** lo manda directo a la otra
vista sin pasar por el disco.

**¿Hay que bajar un archivo por cada intervalo?** No: con uno de **1 minuto** alcanza para
todos. Análisis reagrupa hacia arriba desde el mismo archivo (5m, 15m, 1h, 4h, 1d, semana, mes).
Al revés no se puede — de un archivo de 1 hora no salen velas de 5 minutos, porque ese detalle
no está en los datos. El único costo de bajar en 1m es el tamaño; hay un botón *Usar 1m* al lado
del selector para no tener que pensarlo.

Referencia rápida: un año en 1 minuto son ~525.600 velas (~40 MB en CSV, un par de minutos);
en 1 hora son 8.760 velas y baja en segundos.

## Correrlo en Antigravity

Antigravity es un fork de VS Code, así que toma la configuración de `.vscode/` que ya está
versionada en el repo:

1. **Abrir la carpeta** del proyecto (`File → Open Folder`).
2. Terminal integrada: `npm install`.
3. **Run and Debug** (`Ctrl/Cmd+Shift+D`) y elegir una configuración:
   - `Escritorio: Electron (main)` — arranca Vite como tarea previa y abre la ventana con
     breakpoints funcionando en `electron/main.cjs`.
   - `Escritorio: main + renderer` — lo anterior más el debugger del renderer (React) por el
     puerto 9222, para poner breakpoints en `src/`.
   - `Web: Chrome sobre Vite` — la versión navegador.
4. O sin debugger: paleta de comandos → `Tasks: Run Task` → `escritorio: dev`, `vite: dev`,
   `app: build`, `escritorio: empaquetar` o `lint`.

El repo incluye además un `AGENTS.md` con los comandos y el mapa de archivos, que es lo que
leen los agentes de Antigravity antes de tocar el código.

## Tests

```bash
npm test        # lógica pura, sin navegador (41 casos)
npm run test:ui # end-to-end: maneja la app real dentro de Electron (28 checks)
```

`npm test` cubre el parseo de archivos, los indicadores (el RSI se contrasta contra el caso de
referencia de Wilder), el reagregado de intervalos, la geometría de las herramientas de dibujo
(niveles de Fibonacci, riesgo/beneficio, reubicación entre intervalos) y la
paginación/reintentos/cancelación de la descarga con un `fetch` simulado.

`npm run test:ui` construye la app, la abre en Electron y la maneja de verdad: carga un CSV,
agrega y quita medias, dibuja un Fibonacci y una posición larga con clics sobre el gráfico,
arrastra un tirador, edita el stop a mano, cambia el intervalo y corre el replay.

## Estructura

- `src/lib/` — lógica sin UI: parseo de archivos, indicadores, reagregado, cliente de Binance.
- `src/views/` — una vista por pestaña.
- `src/components/CandleChart.jsx` — el gráfico con paneles.
- `electron/main.cjs` — proceso principal: ventanas, ciclo de vida, instancia única e IPC.
- `electron/preload.cjs` — puente aislado hacia el renderer (`window.desktop`).
- `scripts/dev-desktop.mjs` — arranca Vite por su API de Node y recién entonces lanza Electron.
- `.vscode/` — tareas y configuraciones de debug para VS Code / Antigravity.

## Notas

- Verificado desde un entorno sandbox cuya política de red bloquea `api.binance.com` (403 en el
  gateway de salida): el build compila, la ventana abre y toda la UI se probó end-to-end con
  datos locales, pero la conexión real a Binance no pudo ejercitarse ahí. Por eso la descarga
  está cubierta con un `fetch` simulado en `test/binance.test.mjs`.
- Los archivos de Electron son `.cjs` a propósito, porque `package.json` declara `"type": "module"`.
- El build de producción inyecta una CSP que sólo permite conectarse a Binance. Si se agrega otra
  fuente de datos, hay que sumar su host a `connect-src` en `vite.config.js`.
- El deploy web a Netlify sigue igual (`npm run build` → `dist/`); la variable
  `ELECTRON_SKIP_BINARY_DOWNLOAD` evita que ese build se baje el binario de Electron al pedo.
