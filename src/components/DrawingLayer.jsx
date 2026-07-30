import { useEffect, useRef } from 'react'
import { createDrawing, fibLevels, handlesOf, moveHandle, positionMetrics } from '../lib/drawings.js'
import { formatPrice } from '../lib/format.js'

const HIT_RADIUS = 11
const HANDLE_RADIUS = 5
const LABEL_FONT = '11px system-ui, sans-serif'

const FIB_COLORS = ['#9598a1', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86']
const GREEN = '#089981'
const RED = '#f23645'
const NEUTRAL = '#b2b5be'

function withAlpha(hex, alpha) {
  return `${hex}${alpha}`
}

/**
 * Canvas transparente encima del gráfico: dibuja las herramientas y maneja su
 * creación y arrastre.
 *
 * El canvas tiene `pointer-events: none` salvo cuando hay una herramienta
 * activa o el puntero está sobre un tirador. Así el gráfico conserva su
 * paneo y zoom, y sólo le "robamos" el mouse cuando de verdad hace falta.
 */
export default function DrawingLayer({
  chart,
  series,
  wrapEl,
  drawings,
  tool,
  selectedId,
  onCreate,
  onChange,
  onSelect,
  onToolEnd,
}) {
  const canvasRef = useRef(null)
  const drawRef = useRef(null)
  const draftRef = useRef(null)
  const dragRef = useRef(null)
  const cursorRef = useRef(null)
  const propsRef = useRef(null)

  propsRef.current = { drawings, tool, selectedId, onCreate, onChange, onSelect, onToolEnd }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !wrapEl) return
    const ctx = canvas.getContext('2d')
    const timeScale = chart.timeScale()

    const toX = (logical) => timeScale.logicalToCoordinate(logical)
    const toY = (price) => series.priceToCoordinate(price)
    const fromX = (x) => timeScale.coordinateToLogical(x)
    const fromY = (y) => series.coordinateToPrice(y)

    function sizeCanvas() {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth: width, clientHeight: height } = wrapEl
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function label(text, x, y, color, align = 'left') {
      ctx.font = LABEL_FONT
      const width = ctx.measureText(text).width
      const left = align === 'right' ? x - width - 8 : x + 4
      ctx.fillStyle = 'rgba(19, 23, 34, 0.85)'
      ctx.fillRect(left - 3, y - 8, width + 6, 15)
      ctx.fillStyle = color
      ctx.textBaseline = 'middle'
      ctx.fillText(text, left, y)
    }

    function line(x1, y1, x2, y2, color, width = 1, dash = null) {
      ctx.beginPath()
      ctx.setLineDash(dash ?? [])
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    function drawFib(d, selected) {
      const x1 = toX(d.x1)
      const x2 = toX(d.x2)
      if (x1 == null || x2 == null) return
      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const levels = fibLevels(d.p1, d.p2)

      // Relleno entre niveles consecutivos, como las bandas de TradingView.
      for (let i = 0; i < levels.length - 1; i++) {
        const yA = toY(levels[i].price)
        const yB = toY(levels[i + 1].price)
        if (yA == null || yB == null) continue
        ctx.fillStyle = withAlpha(FIB_COLORS[i % FIB_COLORS.length], '14')
        ctx.fillRect(left, Math.min(yA, yB), right - left, Math.abs(yB - yA))
      }

      levels.forEach((level, i) => {
        const y = toY(level.price)
        if (y == null) return
        const color = FIB_COLORS[i % FIB_COLORS.length]
        line(left, y, right, y, color, selected ? 1.6 : 1)
        // Prolongación punteada hacia la derecha, para leer el nivel a futuro.
        line(right, y, canvas.clientWidth, y, color, 1, [3, 3])
        label(`${(level.ratio * 100).toFixed(1)}%  ${formatPrice(level.price)}`, left, y - 8, color)
      })

      const yA = toY(d.p1)
      const yB = toY(d.p2)
      if (yA != null && yB != null) line(x1, yA, x2, yB, NEUTRAL, 1, [4, 4])
    }

    function drawPosition(d, selected) {
      const x1 = toX(d.x1)
      const x2 = toX(d.x2)
      const yEntry = toY(d.p1)
      const yTarget = toY(d.p2)
      const yStop = toY(d.stop)
      if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) return

      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const width = Math.max(right - left, 1)
      const metrics = positionMetrics(d)

      ctx.fillStyle = withAlpha(GREEN, '2b')
      ctx.fillRect(left, Math.min(yEntry, yTarget), width, Math.abs(yTarget - yEntry))
      ctx.fillStyle = withAlpha(RED, '2b')
      ctx.fillRect(left, Math.min(yEntry, yStop), width, Math.abs(yStop - yEntry))

      line(left, yTarget, right, yTarget, GREEN, selected ? 2 : 1.4)
      line(left, yStop, right, yStop, RED, selected ? 2 : 1.4)
      line(left, yEntry, right, yEntry, NEUTRAL, 1, [4, 3])

      const signo = metrics.rewardPct >= 0 ? '+' : ''
      label(`Objetivo ${formatPrice(d.p2)}  ${signo}${metrics.rewardPct.toFixed(2)}%`, left, yTarget - 9, GREEN)
      label(`Entrada ${formatPrice(d.p1)}`, left, yEntry - 9, NEUTRAL)
      label(`Stop ${formatPrice(d.stop)}  -${Math.abs(metrics.riskPct).toFixed(2)}%`, left, yStop + 10, RED)

      const resumen = metrics.valid
        ? `R/R ${metrics.ratio.toFixed(2)}`
        : 'Objetivo o stop del lado equivocado'
      label(resumen, right, (yTarget + yStop) / 2, metrics.valid ? NEUTRAL : RED, 'right')
    }

    function drawHandles(d, selected) {
      for (const handle of handlesOf(d)) {
        const x = toX(handle.x)
        const y = toY(handle.price)
        if (x == null || y == null) continue
        ctx.beginPath()
        ctx.arc(x, y, selected ? HANDLE_RADIUS + 1 : HANDLE_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = selected ? '#ffffff' : '#131722'
        ctx.strokeStyle = selected ? '#2962ff' : NEUTRAL
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()
      }
    }

    function draw() {
      const { drawings: list, selectedId: selected } = propsRef.current
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

      // Sólo dibujamos dentro del panel de precio, no sobre volumen/RSI/eje.
      const paneHeight = chart.panes()[0]?.getHeight() ?? canvas.clientHeight
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvas.clientWidth, paneHeight)
      ctx.clip()

      for (const d of list) {
        const isSelected = d.id === selected
        if (d.type === 'fib') drawFib(d, isSelected)
        else drawPosition(d, isSelected)
        drawHandles(d, isSelected)
      }

      // Vista previa mientras se coloca el segundo punto.
      const draft = draftRef.current
      const cursor = cursorRef.current
      if (draft && cursor) {
        const preview = createDrawing(draft.type, {
          x1: draft.x1,
          p1: draft.p1,
          x2: cursor.logical,
          p2: cursor.price,
        })
        ctx.globalAlpha = 0.75
        if (preview.type === 'fib') drawFib(preview, false)
        else drawPosition(preview, false)
        ctx.globalAlpha = 1
      }

      ctx.restore()
    }

    function hitTest(x, y) {
      const { drawings: list } = propsRef.current
      // De atrás hacia adelante: gana el dibujo de arriba.
      for (let i = list.length - 1; i >= 0; i--) {
        for (const handle of handlesOf(list[i])) {
          const hx = toX(handle.x)
          const hy = toY(handle.price)
          if (hx == null || hy == null) continue
          if (Math.hypot(hx - x, hy - y) <= HIT_RADIUS) {
            return { id: list[i].id, handle: handle.key }
          }
        }
      }
      return null
    }

    function localPoint(event) {
      const rect = wrapEl.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    function setCapture(active) {
      canvas.style.pointerEvents = active ? 'auto' : 'none'
    }

    function onMouseMove(event) {
      const { tool: activeTool, onChange: change, drawings: list } = propsRef.current
      const { x, y } = localPoint(event)

      const drag = dragRef.current
      if (drag) {
        const logical = fromX(x)
        const price = fromY(y)
        if (logical == null || price == null) return
        const target = list.find((d) => d.id === drag.id)
        if (target) change(moveHandle(target, drag.handle, { x: logical, price }))
        return
      }

      if (activeTool) {
        setCapture(true)
        wrapEl.style.cursor = 'crosshair'
        if (draftRef.current) {
          const logical = fromX(x)
          const price = fromY(y)
          if (logical != null && price != null) {
            cursorRef.current = { logical, price }
            draw()
          }
        }
        return
      }

      const hit = hitTest(x, y)
      setCapture(Boolean(hit))
      wrapEl.style.cursor = hit ? 'grab' : ''
    }

    function onMouseDown(event) {
      const { tool: activeTool, onCreate: create, onSelect: select, onToolEnd: endTool } = propsRef.current
      const { x, y } = localPoint(event)
      const logical = fromX(x)
      const price = fromY(y)

      if (activeTool) {
        if (logical == null || price == null) return
        event.preventDefault()
        event.stopPropagation()

        if (!draftRef.current) {
          draftRef.current = { type: activeTool, x1: logical, p1: price }
          cursorRef.current = { logical, price }
          draw()
        } else {
          const draft = draftRef.current
          create(createDrawing(draft.type, { x1: draft.x1, p1: draft.p1, x2: logical, p2: price }))
          draftRef.current = null
          cursorRef.current = null
          endTool()
        }
        return
      }

      const hit = hitTest(x, y)
      if (hit) {
        event.preventDefault()
        event.stopPropagation()
        dragRef.current = hit
        select(hit.id)
        wrapEl.style.cursor = 'grabbing'
      }
    }

    function onMouseUp() {
      if (dragRef.current) {
        dragRef.current = null
        wrapEl.style.cursor = 'grab'
      }
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      const { onToolEnd: endTool } = propsRef.current
      draftRef.current = null
      cursorRef.current = null
      endTool()
      draw()
    }

    sizeCanvas()
    draw()
    drawRef.current = draw

    const observer = new ResizeObserver(() => {
      sizeCanvas()
      draw()
    })
    observer.observe(wrapEl)
    timeScale.subscribeVisibleLogicalRangeChange(draw)

    wrapEl.addEventListener('mousemove', onMouseMove)
    wrapEl.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      observer.disconnect()
      timeScale.unsubscribeVisibleLogicalRangeChange(draw)
      wrapEl.removeEventListener('mousemove', onMouseMove)
      wrapEl.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      wrapEl.style.cursor = ''
      drawRef.current = null
    }
  }, [chart, series, wrapEl])

  // Repintar ante cualquier cambio venido de la UI (nuevo dibujo, selección,
  // herramienta activa) y soltar el borrador si se apagó la herramienta.
  useEffect(() => {
    if (!tool) {
      draftRef.current = null
      cursorRef.current = null
      if (canvasRef.current) canvasRef.current.style.pointerEvents = 'none'
    }
    drawRef.current?.()
  }, [drawings, tool, selectedId])

  return <canvas ref={canvasRef} className="drawing-layer" />
}
