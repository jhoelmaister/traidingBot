# BTC/USDT en vivo

Gráfico de velas de BTC/USDT en tiempo real, sin backend propio. Corre en el navegador y también
como **aplicación de escritorio** (Windows, macOS y Linux) con el mismo código de `src/`.

## Stack

- **React + Vite** — UI y bundling.
- **[lightweight-charts](https://github.com/tradingview/lightweight-charts)** — la librería de gráficos que el propio equipo de TradingView publica como open source (Apache 2.0). Se usa tal cual, no se reimplementa el motor de renderizado.
- **Electron** — envoltorio de escritorio: la misma app web dentro de una ventana nativa.
- **API pública de Binance** — sin API key ni servidor intermedio:
  - Histórico inicial: `GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500`
  - Velas en vivo: `wss://stream.binance.com:9443/ws/btcusdt@kline_1m`

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

Levanta Vite y abre la ventana de Electron apuntando a ese server, con hot reload: editás
`src/BtcChart.jsx` y la ventana se actualiza sola. Cerrar la ventana apaga el server.

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

## Estructura

- `src/BtcChart.jsx` — todo el trabajo real: crea el gráfico, carga el histórico y se suscribe al WebSocket de Binance.
- `src/App.jsx` — layout mínimo alrededor del gráfico.
- `electron/main.cjs` — proceso principal de Electron: ventana, ciclo de vida e instancia única.
- `electron/preload.cjs` — puente aislado hacia el renderer (`window.desktop`).
- `scripts/dev-desktop.mjs` — arranca Vite por su API de Node y recién entonces lanza Electron.
- `.vscode/` — tareas y configuraciones de debug para VS Code / Antigravity.

## Notas

- Verificado desde un entorno sandbox cuya política de red bloquea `api.binance.com` explícitamente (403 en el gateway de salida) — el build compila, la ventana de Electron abre y el gráfico monta el canvas sin errores propios, pero la conexión a Binance no pudo probarse end-to-end ahí. En una máquina o hosting normal (sin ese bloqueo) debería conectar sin cambios, ya que es la misma API pública que usan numerosos dashboards client-side.
- Los archivos de Electron son `.cjs` a propósito, porque `package.json` declara `"type": "module"`.
- El build de producción inyecta una CSP que sólo permite conectarse a Binance. Si se agrega otra
  fuente de datos, hay que sumar su host a `connect-src` en `vite.config.js`.
- El deploy web a Netlify sigue igual (`npm run build` → `dist/`); la variable
  `ELECTRON_SKIP_BINARY_DOWNLOAD` evita que ese build se baje el binario de Electron al pedo.
- Para agregar otro símbolo, timeframe o indicadores (medias móviles, RSI), el punto de partida es `SYMBOL`/`INTERVAL` en `BtcChart.jsx`.
