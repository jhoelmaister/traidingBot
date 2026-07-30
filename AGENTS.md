# Guía del proyecto para agentes (Antigravity, Claude Code, etc.)

Gráfico de velas BTC/USDT en vivo. Corre en dos formatos con **el mismo código de `src/`**:
web (Vite) y escritorio (Electron).

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

En contenedores o como root hay que pasar `--no-sandbox`: `npm run desktop -- --no-sandbox`.

## Mapa de archivos

- `src/BtcChart.jsx` — todo el trabajo real: crea el gráfico, carga el histórico de Binance
  y se suscribe al WebSocket. Los puntos de entrada para cambios son `SYMBOL` e `INTERVAL`.
- `src/App.jsx` — layout mínimo alrededor del gráfico.
- `electron/main.cjs` — proceso principal: ventana, ciclo de vida, instancia única.
  En dev carga `VITE_DEV_SERVER_URL`; empaquetado carga `dist/index.html`.
- `electron/preload.cjs` — puente aislado; sólo expone `window.desktop` (plataforma y versiones).
- `scripts/dev-desktop.mjs` — arranca Vite por su API de Node y recién ahí lanza Electron.
- `vite.config.js` — `base: './'` (necesario para `file://`) e inyección de CSP sólo en build.
- `.vscode/` — tareas y configuraciones de "Run and Debug"; Antigravity las lee igual que VS Code.

## Convenciones y cuidados

- Los archivos de Electron son **`.cjs` a propósito**: `package.json` tiene `"type": "module"`.
- La app no tiene backend: habla directo con la API pública de Binance. Si se agrega otro
  host remoto, hay que sumarlo a `connect-src` en la CSP de `vite.config.js`, o el build
  empaquetado lo va a bloquear.
- No activar `nodeIntegration` ni desactivar `contextIsolation` en `electron/main.cjs`:
  el renderer carga datos de red y debe seguir sin acceso a Node.
- Comentarios y textos de UI en español, como el resto del repo.
