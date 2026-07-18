# BTC/USDT en vivo

Gráfico de velas de BTC/USDT en tiempo real, sin backend propio: corre 100% en el navegador.

## Stack

- **React + Vite** — UI y bundling.
- **[lightweight-charts](https://github.com/tradingview/lightweight-charts)** — la librería de gráficos que el propio equipo de TradingView publica como open source (Apache 2.0). Se usa tal cual, no se reimplementa el motor de renderizado.
- **API pública de Binance** — sin API key ni servidor intermedio:
  - Histórico inicial: `GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500`
  - Velas en vivo: `wss://stream.binance.com:9443/ws/btcusdt@kline_1m`

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173`).

## Estructura

- `src/BtcChart.jsx` — todo el trabajo real: crea el gráfico, carga el histórico y se suscribe al WebSocket de Binance.
- `src/App.jsx` — layout mínimo alrededor del gráfico.

## Notas

- Verificado desde un entorno sandbox cuya política de red bloquea `api.binance.com` explícitamente (403 en el gateway de salida) — el build compila y el gráfico monta el canvas sin errores propios, pero la conexión a Binance no pudo probarse end-to-end ahí. En una máquina o hosting normal (sin ese bloqueo) debería conectar sin cambios, ya que es la misma API pública que usan numerosos dashboards client-side.
- Para agregar otro símbolo, timeframe o indicadores (medias móviles, RSI), el punto de partida es `SYMBOL`/`INTERVAL` en `BtcChart.jsx`.
