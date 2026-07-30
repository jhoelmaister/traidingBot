// Barra lateral de herramientas, al estilo de la de TradingView.
// Los íconos son SVG inline: la CSP del build no permite cargar nada externo.

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6">
      {children}
    </svg>
  )
}

const ICONS = {
  cursor: (
    <Icon>
      <path d="M5 3l14 8-6 1.5L10 19z" strokeLinejoin="round" />
    </Icon>
  ),
  fib: (
    <Icon>
      <path d="M3 5h18M3 10h18M3 14h18M3 19h18" />
      <path d="M4 19L20 5" strokeDasharray="3 2" opacity="0.7" />
    </Icon>
  ),
  long: (
    <Icon>
      <rect x="3" y="4" width="18" height="7" rx="1" />
      <rect x="3" y="13" width="18" height="7" rx="1" opacity="0.5" />
      <path d="M12 10V6m0 0l-2 2m2-2l2 2" strokeLinecap="round" />
    </Icon>
  ),
  short: (
    <Icon>
      <rect x="3" y="4" width="18" height="7" rx="1" opacity="0.5" />
      <rect x="3" y="13" width="18" height="7" rx="1" />
      <path d="M12 14v4m0 0l-2-2m2 2l2-2" strokeLinecap="round" />
    </Icon>
  ),
  trash: (
    <Icon>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinejoin="round" />
    </Icon>
  ),
}

const TOOL_BUTTONS = [
  { id: null, icon: 'cursor', title: 'Cursor — seleccionar y arrastrar' },
  { id: 'fib', icon: 'fib', title: 'Retroceso de Fibonacci' },
  { id: 'long', icon: 'long', title: 'Posición larga' },
  { id: 'short', icon: 'short', title: 'Posición corta' },
]

export default function ChartToolbar({ tool, onTool, onClear, count }) {
  return (
    <div className="chart-toolbar">
      {TOOL_BUTTONS.map((button) => (
        <button
          key={button.icon}
          className={`tool ${tool === button.id ? 'active' : ''}`}
          title={button.title}
          aria-label={button.title}
          aria-pressed={tool === button.id}
          onClick={() => onTool(button.id)}
        >
          {ICONS[button.icon]}
        </button>
      ))}

      <div className="tool-separator" />

      <button
        className="tool"
        title={count ? `Borrar los ${count} objetos` : 'No hay objetos para borrar'}
        aria-label="Borrar todos los objetos"
        onClick={onClear}
        disabled={!count}
      >
        {ICONS.trash}
      </button>
    </div>
  )
}
