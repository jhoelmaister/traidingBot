import { useEffect } from 'react'

/**
 * Ventana de configuración al estilo TradingView: título, pestañas opcionales,
 * cuerpo y los botones Cancelar / Aceptar abajo a la derecha.
 */
export default function Modal({
  title,
  tabs,
  activeTab,
  onTab,
  onClose,
  onAccept,
  acceptLabel = 'Aceptar',
  children,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="x" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {tabs?.length > 1 && (
          <div className="modal-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={tab.id === activeTab ? 'tab active' : 'tab'}
                onClick={() => onTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="modal-body">{children}</div>

        <div className="modal-foot">
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={onAccept}>
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
