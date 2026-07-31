import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Menú del clic derecho sobre un objeto del gráfico, como el de TradingView.
 * Se cierra con Escape, con un clic afuera o al elegir una opción.
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Si el menú se sale de la ventana, lo corremos para adentro.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPosition({
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - height - 8),
    })
  }, [x, y])

  useEffect(() => {
    const cerrar = () => onClose()
    const porTecla = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('mousedown', cerrar)
    window.addEventListener('keydown', porTecla)
    return () => {
      window.removeEventListener('mousedown', cerrar)
      window.removeEventListener('keydown', porTecla)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={position}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep${i}`} className="context-separator" />
        ) : (
          <button
            key={item.label}
            className={item.danger ? 'context-item danger' : 'context-item'}
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}
