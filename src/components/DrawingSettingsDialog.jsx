import { useState } from 'react'
import Modal from './Modal.jsx'
import {
  DASH_STYLES,
  describe,
  EXTEND_MODES,
  LABEL_CONTENTS,
  LABEL_POSITIONS,
  positionRisk,
} from '../lib/drawings.js'
import { formatNumber, formatPrice } from '../lib/format.js'

const TABS = [
  { id: 'estilo', label: 'Estilo' },
  { id: 'coordenadas', label: 'Coordenadas' },
]

// Las posiciones suman el panel de dimensionamiento.
const TABS_POSICION = [...TABS, { id: 'riesgo', label: 'Riesgo' }]

function PriceField({ label, value, onChange, step = 'any' }) {
  return (
    <label className="field">
      {label}
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

/** Formulario de una herramienta ya dibujada (Fibonacci o posición). */
export default function DrawingSettingsDialog({ drawing, onAccept, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(drawing))
  const [tab, setTab] = useState('estilo')

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const setStyle = (patch) => setDraft((current) => ({ ...current, style: { ...current.style, ...patch } }))
  const setRisk = (patch) => setDraft((current) => ({ ...current, risk: { ...current.risk, ...patch } }))

  const patchLevel = (index, patch) =>
    setStyle({ levels: draft.style.levels.map((l, i) => (i === index ? { ...l, ...patch } : l)) })

  const esFib = draft.type === 'fib'
  const esLinea = draft.type === 'trend' || draft.type === 'horizontal'
  const esPosicion = draft.type === 'long' || draft.type === 'short'
  const metrics = esPosicion ? positionRisk(draft) : null

  return (
    <Modal
      title={describe(draft)}
      tabs={esPosicion ? TABS_POSICION : TABS}
      activeTab={tab}
      onTab={setTab}
      onClose={onClose}
      onAccept={() => {
        onAccept(draft)
        onClose()
      }}
    >
      {tab === 'estilo' && esFib && (
        <>
          <div className="ind-row">
            <label className="ind-name">
              <input
                type="checkbox"
                checked={draft.style.trendLine}
                onChange={() => setStyle({ trendLine: !draft.style.trendLine })}
              />
              Línea de tendencia
            </label>
            <input
              type="color"
              value={draft.style.trendColor}
              onChange={(e) => setStyle({ trendColor: e.target.value })}
            />
          </div>

          <div className="ind-row">
            <label className="ind-name">
              <input
                type="checkbox"
                checked={draft.style.background}
                onChange={() => setStyle({ background: !draft.style.background })}
              />
              Fondo entre niveles
            </label>
            <label className="ind-name">
              <input
                type="checkbox"
                checked={draft.style.labelContent !== 'percent'}
                onChange={() =>
                  setStyle({ labelContent: draft.style.labelContent === 'percent' ? 'both' : 'percent' })
                }
              />
              Mostrar precios
            </label>
          </div>

          <div className="ind-row">
            <label className="field">
              Ampliar
              <select value={draft.style.extend} onChange={(e) => setStyle({ extend: e.target.value })}>
                {EXTEND_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ind-params">
            <label className="field">
              Etiquetas
              <select
                value={draft.style.labelPosition ?? 'left'}
                onChange={(e) => setStyle({ labelPosition: e.target.value })}
              >
                {LABEL_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Mostrar
              <select
                value={draft.style.labelContent ?? 'both'}
                onChange={(e) => setStyle({ labelContent: e.target.value })}
              >
                {LABEL_CONTENTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h4>Niveles</h4>
          <div className="levels">
            {draft.style.levels.map((level, index) => (
              <div key={index} className="level">
                <input
                  type="checkbox"
                  checked={level.visible}
                  onChange={() => patchLevel(index, { visible: !level.visible })}
                />
                <input
                  type="number"
                  step="any"
                  value={level.ratio}
                  disabled={!level.visible}
                  onChange={(e) => patchLevel(index, { ratio: Number(e.target.value) })}
                />
                <input
                  type="color"
                  value={level.color}
                  onChange={(e) => patchLevel(index, { color: e.target.value })}
                />
                <select
                  className="grosor"
                  value={level.width ?? 1}
                  title="Grosor"
                  onChange={(e) => patchLevel(index, { width: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
                <select
                  className="trazo"
                  value={level.dash ?? 'solid'}
                  title="Trazo"
                  onChange={(e) => patchLevel(index, { dash: e.target.value })}
                >
                  {DASH_STYLES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'estilo' && esLinea && (
        <>
          <div className="ind-row">
            <span className="ind-name">Color de la línea</span>
            <input
              type="color"
              value={draft.style.lineColor}
              onChange={(e) => setStyle({ lineColor: e.target.value })}
            />
          </div>
          <div className="ind-row">
            <label className="field">
              Ancho de línea
              <select
                value={draft.style.lineWidth}
                onChange={(e) => setStyle({ lineWidth: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w} px
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ind-row">
            <label className="field">
              Estilo
              <select
                value={draft.style.lineStyle}
                onChange={(e) => setStyle({ lineStyle: e.target.value })}
              >
                <option value="solid">Línea sólida</option>
                <option value="dashed">Línea discontinua</option>
                <option value="dotted">Línea punteada</option>
              </select>
            </label>
          </div>
        </>
      )}

      {tab === 'estilo' && esPosicion && (
        <>
          <div className="ind-row">
            <span className="ind-name">Zona de ganancia</span>
            <input
              type="color"
              value={draft.style.profitColor}
              onChange={(e) => setStyle({ profitColor: e.target.value })}
            />
          </div>
          <div className="ind-row">
            <span className="ind-name">Zona de pérdida</span>
            <input
              type="color"
              value={draft.style.lossColor}
              onChange={(e) => setStyle({ lossColor: e.target.value })}
            />
          </div>
          <div className="ind-row">
            <label className="ind-name">
              <input
                type="checkbox"
                checked={draft.style.background}
                onChange={() => setStyle({ background: !draft.style.background })}
              />
              Fondo de las zonas
            </label>
            <label className="ind-name">
              <input
                type="checkbox"
                checked={draft.style.showLabels}
                onChange={() => setStyle({ showLabels: !draft.style.showLabels })}
              />
              Mostrar etiquetas
            </label>
          </div>
        </>
      )}

      {tab === 'coordenadas' && esFib && (
        <>
          <PriceField label="Precio 1 (inicio)" value={draft.p1} onChange={(p1) => set({ p1 })} />
          <PriceField label="Precio 2 (fin)" value={draft.p2} onChange={(p2) => set({ p2 })} />
          <p className="muted">El nivel 0 % se apoya en el precio 2 y el 100 % en el precio 1.</p>
        </>
      )}

      {tab === 'coordenadas' && esLinea && (
        <>
          <PriceField label="Precio 1" value={draft.p1} onChange={(p1) => set({ p1 })} />
          {draft.type === 'trend' && (
            <PriceField label="Precio 2" value={draft.p2} onChange={(p2) => set({ p2 })} />
          )}
        </>
      )}

      {tab === 'coordenadas' && esPosicion && (
        <>
          <PriceField label="Entrada" value={draft.p1} onChange={(p1) => set({ p1 })} />
          <PriceField label="Objetivo" value={draft.p2} onChange={(p2) => set({ p2 })} />
          <PriceField label="Stop" value={draft.stop} onChange={(stop) => set({ stop })} />
          <p className={metrics.valid ? 'muted' : 'error'}>
            {metrics.valid
              ? `Riesgo/beneficio ${metrics.ratio.toFixed(2)} · objetivo +${metrics.rewardPct.toFixed(2)} % · stop -${Math.abs(metrics.riskPct).toFixed(2)} %`
              : 'El objetivo o el stop están del lado equivocado de la entrada.'}
          </p>
        </>
      )}

      {tab === 'riesgo' && esPosicion && (
        <>
          <div className="ind-params">
            <PriceField
              label="Tamaño de la cuenta"
              value={draft.risk?.accountSize ?? metrics.accountSize}
              onChange={(accountSize) => setRisk({ accountSize })}
            />
            <PriceField
              label="Riesgo por operación (%)"
              value={draft.risk?.riskPercent ?? metrics.riskPercent}
              step="0.1"
              onChange={(riskPercent) => setRisk({ riskPercent })}
            />
          </div>

          {metrics.valid ? (
            <table className="riesgo">
              <tbody>
                <tr>
                  <th>Arriesgás</th>
                  <td>
                    {formatPrice(metrics.riskAmount)} ({metrics.riskPercent} % de{' '}
                    {formatPrice(metrics.accountSize)})
                  </td>
                </tr>
                <tr>
                  <th>Cantidad a operar</th>
                  <td>{formatNumber(Number(metrics.quantity.toPrecision(6)))} unidades</td>
                </tr>
                <tr>
                  <th>Valor de la posición</th>
                  <td>{formatPrice(metrics.quantity * metrics.entry)}</td>
                </tr>
                <tr>
                  <th>Si llega al objetivo</th>
                  <td className="up">+{formatPrice(metrics.rewardAmount)}</td>
                </tr>
                <tr>
                  <th>Si salta el stop</th>
                  <td className="down">-{formatPrice(metrics.riskAmount)}</td>
                </tr>
                <tr>
                  <th>Riesgo/beneficio</th>
                  <td>{metrics.ratio.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="error">
              No se puede dimensionar: el objetivo o el stop están del lado equivocado de la entrada.
            </p>
          )}

          <p className="muted">
            La cantidad sale de dividir lo que arriesgás por la distancia hasta el stop, sin apalancamiento
            ni comisiones.
          </p>
        </>
      )}
    </Modal>
  )
}
