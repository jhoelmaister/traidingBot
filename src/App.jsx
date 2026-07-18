import BtcChart from './BtcChart'
import './App.css'

function App() {
  return (
    <div className="app">
      <header>
        <h1>BTC/USDT — en vivo</h1>
        <p>Datos en tiempo real desde Binance (WebSocket público, sin backend)</p>
      </header>
      <BtcChart />
    </div>
  )
}

export default App
