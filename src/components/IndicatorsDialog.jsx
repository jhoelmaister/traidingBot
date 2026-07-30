import { useState } from 'react'
import Modal from './Modal.jsx'

const MA_COLORS = ['#f0b90b', '#8b5cf6', '#22d3ee', '#fb923c', '#4ade80', '#60a5fa', '#f472b6', '#e879f9']

let maCounter = 0
function newMaId() {
  maCounter += 1
  return `ma${Date.now().toString(36)}${maCounter}`
}

function Row({ label, children, checked, onToggle }) {
  return (
    <div className="ind-row">
      <label className="ind-name">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        {label}
      </label>
      <div className="ind-params">{children}</div>
    </div>
  )
}

function Num({ value, onChange, min = 1, max = 5000, width = '4.5rem' }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      style={{ width }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** Formulario de indicadores: medias configurables + los de panel aparte. */
export default function IndicatorsDialog({ indicators, onAccept, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(indicators))
  const [nuevo, setNuevo] = useState({ type: 'ema', period: 200 })

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  function addMa() {
    const period = Number(nuevo.period)
    if (!Number.isInteger(period) || period < 1 || period > 5000) return
    if (draft.mas.some((m) => m.type === nuevo.type && m.period === period)) return
    set({
      mas: [
        ...draft.mas,
        { id: newMaId(), type: nuevo.type, period, color: MA_COLORS[draft.mas.length % MA_COLORS.length] },
      ],
    })
  }

  const patchMa = (id, patch) =>
    set({ mas: draft.mas.map((m) => (m.id === id ? { ...m, ...patch } : m)) })

  return (
    <Modal
      title="Indicadores"
      onClose={onClose}
      onAccept={() => {
        onAccept(draft)
        onClose()
      }}
    >
      <section>
        <h4>Medias móviles</h4>
        {draft.mas.length === 0 && <p className="muted">Todavía no agregaste ninguna.</p>}

        {draft.mas.map((ma) => (
          <div key={ma.id} className="ind-row">
            <div className="ind-params">
              <select value={ma.type} onChange={(e) => patchMa(ma.id, { type: e.target.value })}>
                <option value="ema">EMA</option>
                <option value="sma">SMA</option>
              </select>
              <Num value={ma.period} onChange={(period) => patchMa(ma.id, { period })} />
              <input
                type="color"
                value={ma.color}
                onChange={(e) => patchMa(ma.id, { color: e.target.value })}
              />
            </div>
            <button className="x" onClick={() => set({ mas: draft.mas.filter((m) => m.id !== ma.id) })}>
              ✕
            </button>
          </div>
        ))}

        <div className="ind-row add">
          <div className="ind-params">
            <select value={nuevo.type} onChange={(e) => setNuevo((p) => ({ ...p, type: e.target.value }))}>
              <option value="ema">EMA</option>
              <option value="sma">SMA</option>
            </select>
            <input
              type="number"
              min={1}
              max={5000}
              value={nuevo.period}
              style={{ width: '4.5rem' }}
              onChange={(e) => setNuevo((p) => ({ ...p, period: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addMa()}
            />
            <button onClick={addMa}>Agregar media</button>
          </div>
        </div>
      </section>

      <section>
        <h4>Sobre el precio</h4>
        <Row
          label="Bandas de Bollinger"
          checked={Boolean(draft.bb)}
          onToggle={() => set({ bb: draft.bb ? null : { period: 20, mult: 2, color: '#94a3b8' } })}
        >
          {draft.bb && (
            <>
              <label>
                Período
                <Num value={draft.bb.period} onChange={(period) => set({ bb: { ...draft.bb, period } })} />
              </label>
              <label>
                Desviación
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={draft.bb.mult}
                  style={{ width: '4.5rem' }}
                  onChange={(e) => set({ bb: { ...draft.bb, mult: Number(e.target.value) } })}
                />
              </label>
              <input
                type="color"
                value={draft.bb.color}
                onChange={(e) => set({ bb: { ...draft.bb, color: e.target.value } })}
              />
            </>
          )}
        </Row>
      </section>

      <section>
        <h4>En paneles aparte</h4>

        <Row label="Volumen" checked={draft.volume} onToggle={() => set({ volume: !draft.volume })} />

        <Row
          label="RSI"
          checked={Boolean(draft.rsi)}
          onToggle={() => set({ rsi: draft.rsi ? null : { period: 14 } })}
        >
          {draft.rsi && (
            <label>
              Período
              <Num value={draft.rsi.period} onChange={(period) => set({ rsi: { period } })} />
            </label>
          )}
        </Row>

        <Row
          label="MACD"
          checked={Boolean(draft.macd)}
          onToggle={() => set({ macd: draft.macd ? null : { fast: 12, slow: 26, signal: 9 } })}
        >
          {draft.macd && (
            <>
              <label>
                Rápida
                <Num value={draft.macd.fast} onChange={(fast) => set({ macd: { ...draft.macd, fast } })} />
              </label>
              <label>
                Lenta
                <Num value={draft.macd.slow} onChange={(slow) => set({ macd: { ...draft.macd, slow } })} />
              </label>
              <label>
                Señal
                <Num value={draft.macd.signal} onChange={(signal) => set({ macd: { ...draft.macd, signal } })} />
              </label>
            </>
          )}
        </Row>
      </section>
    </Modal>
  )
}
