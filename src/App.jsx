import { useEffect, useState } from 'react'
import LiveView from './views/LiveView.jsx'
import AnalysisView from './views/AnalysisView.jsx'
import DownloadView from './views/DownloadView.jsx'
import { isDesktop } from './lib/saveFile.js'
import './App.css'

const VIEWS = [
  { id: 'live', label: 'En vivo' },
  { id: 'analisis', label: 'Análisis' },
  { id: 'descargar', label: 'Descargar datos' },
]

const IDS = new Set(VIEWS.map((v) => v.id))

// La vista vive en el hash para que Electron pueda abrir una ventana nueva
// directamente en una pestaña concreta (index.html#/descargar).
function viewFromHash() {
  const id = window.location.hash.replace(/^#\/?/, '')
  return IDS.has(id) ? id : 'live'
}

export default function App() {
  const [view, setView] = useState(viewFromHash)
  const [dataset, setDataset] = useState(null)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function go(id) {
    window.location.hash = `#/${id}`
    setView(id)
  }

  return (
    <div className="app">
      <header>
        <nav>
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'tab active' : 'tab'} onClick={() => go(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
        {isDesktop && window.desktop.openWindow && (
          <button className="ghost" onClick={() => window.desktop.openWindow(`#/${view}`)}>
            Abrir en ventana aparte
          </button>
        )}
      </header>

      {view === 'live' && <LiveView />}
      {view === 'analisis' && <AnalysisView dataset={dataset} onDataset={setDataset} />}
      {view === 'descargar' && (
        <DownloadView onDataset={setDataset} onGoToAnalysis={() => go('analisis')} />
      )}
    </div>
  )
}
