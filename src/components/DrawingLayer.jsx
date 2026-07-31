import { useEffect, useRef } from 'react'
import {
  createDrawing,
  dashPattern,
  handlesOf,
  moveDrawing,
  moveHandle,
  positionRisk,
  visibleFibLevels,
} from '../lib/drawings.js'
import { formatNumber, formatPrice } from '../lib/format.js'

const HIT_RADIUS = 11
const HANDLE_RADIUS = 5
// Distancia, en píxeles, dentro de la cual el imán engancha a un valor de la vela.
const MAGNET_PIXELS = 9
const LABEL_FONT = '11px system-ui, sans-serif'
const NEUTRAL = '#b2b5be'

// Los colores de los estilos vienen como #rrggbb; les pegamos el alfa en hexa.
const withAlpha = (hex, alpha) => `${hex}${alpha}`

/**
 * Canvas transparente encima del gráfico: dibuja las herramientas y maneja su
 * creación, arrastre y doble clic para abrir su configuración.
 *
 * El canvas tiene `pointer-events: none` salvo cuando hay una herramienta
 * activa o el puntero está sobre un tirador. Así el gráfico conserva su paneo
 * y zoom, y sólo le "robamos" el mouse cuando de verdad hace falta.
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
  onOpenSettings,
  onContextMenu,
  onCheckpoint,
  onCommitDrag,
  magnet,
  bars,
}) {
  const canvasRef = useRef(null)
  const drawRef = useRef(null)
  const draftRef = useRef(null)
  const dragRef = useRef(null)
  const cursorRef = useRef(null)
  const propsRef = useRef(null)

  propsRef.current = {
    drawings,
    tool,
    selectedId,
    onCreate,
    onChange,
    onSelect,
    onToolEnd,
    onOpenSettings,
    onContextMenu,
    onCheckpoint,
    onCommitDrag,
    magnet,
    bars,
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !wrapEl) return
    const ctx = canvas.getContext('2d')
    const timeScale = chart.timeScale()

    const toX = (logical) => timeScale.logicalToCoordinate(logical)
    const toY = (price) => series.priceToCoordinate(price)
    const fromX = (x) => timeScale.coordinateToLogical(x)
    const fromY = (y) => series.coordinateToPrice(y)

    function snapPoint(logical, price, y) {
      const { magnet: isMagnet, bars: activeBars } = propsRef.current
      if (!isMagnet || !activeBars || !activeBars.length) return { logical, price }
      const idx = Math.round(logical)
      if (idx < 0 || idx >= activeBars.length) return { logical, price }
      const bar = activeBars[idx]

      // Sólo enganchamos si el puntero está cerca del valor; si no, el imán
      // pelearía con el usuario cuando quiere un precio intermedio.
      const cerca = y == null ? null : fromY(y + MAGNET_PIXELS)
      let tolerancia = cerca == null ? Infinity : Math.abs(price - cerca)

      let closestPrice = price
      for (const value of [bar.open, bar.high, bar.low, bar.close]) {
        const dist = Math.abs(price - value)
        if (dist <= tolerancia) {
          tolerancia = dist
          closestPrice = value
        }
      }
      return { logical: idx, price: closestPrice }
    }

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
      const style = d.style
      const x1 = toX(d.x1)
      const x2 = toX(d.x2)
      if (x1 == null || x2 == null) return

      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const levels = visibleFibLevels(d)
      const extendRight = style.extend === 'right' || style.extend === 'both'
      const extendLeft = style.extend === 'both'

      if (style.background) {
        for (let i = 0; i < levels.length - 1; i++) {
          const yA = toY(levels[i].price)
          const yB = toY(levels[i + 1].price)
          if (yA == null || yB == null) continue
          ctx.fillStyle = withAlpha(levels[i].color, '14')
          ctx.fillRect(left, Math.min(yA, yB), right - left, Math.abs(yB - yA))
        }
      }

      for (const level of levels) {
        const y = toY(level.price)
        if (y == null) continue
        line(left, y, right, y, level.color, (level.width ?? 1) + (selected ? 0.6 : 0), dashPattern(level.dash))
        if (extendRight) line(right, y, canvas.clientWidth, y, level.color, 1, [3, 3])
        if (extendLeft) line(0, y, left, y, level.color, 1, [3, 3])

        const porcentaje = `${(level.ratio * 100).toFixed(1)}%`
        const texto =
          style.labelContent === 'percent'
            ? porcentaje
            : style.labelContent === 'price'
              ? formatPrice(level.price)
              : `${porcentaje}  ${formatPrice(level.price)}`
        if (style.labelPosition === 'right') label(texto, right, y - 8, level.color, 'right')
        else label(texto, left, y - 8, level.color)
      }

      if (style.trendLine) {
        const yA = toY(d.p1)
        const yB = toY(d.p2)
        if (yA != null && yB != null) line(x1, yA, x2, yB, style.trendColor, 1, [4, 4])
      }
    }

    function drawPosition(d, selected) {
      const style = d.style
      const x1 = toX(d.x1)
      const x2 = toX(d.x2)
      const yEntry = toY(d.p1)
      const yTarget = toY(d.p2)
      const yStop = toY(d.stop)
      if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) return

      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const width = Math.max(right - left, 1)
      const metrics = positionRisk(d)

      if (style.background) {
        ctx.fillStyle = withAlpha(style.profitColor, '2b')
        ctx.fillRect(left, Math.min(yEntry, yTarget), width, Math.abs(yTarget - yEntry))
        ctx.fillStyle = withAlpha(style.lossColor, '2b')
        ctx.fillRect(left, Math.min(yEntry, yStop), width, Math.abs(yStop - yEntry))
      }

      line(left, yTarget, right, yTarget, style.profitColor, selected ? 2 : 1.4)
      line(left, yStop, right, yStop, style.lossColor, selected ? 2 : 1.4)
      line(left, yEntry, right, yEntry, NEUTRAL, 1, [4, 3])

      if (!style.showLabels) return

      const signo = metrics.rewardPct >= 0 ? '+' : ''
      const ganancia = metrics.rewardAmount != null ? ` · ${formatPrice(metrics.rewardAmount)}` : ''
      const perdida = metrics.quantity != null ? ` · ${formatPrice(metrics.riskAmount)}` : ''

      label(
        `Objetivo ${formatPrice(d.p2)}  ${signo}${metrics.rewardPct.toFixed(2)}%${ganancia}`,
        left,
        yTarget - 9,
        style.profitColor,
      )
      label(`Entrada ${formatPrice(d.p1)}`, left, yEntry - 9, NEUTRAL)
      label(
        `Stop ${formatPrice(d.stop)}  -${Math.abs(metrics.riskPct).toFixed(2)}%${perdida}`,
        left,
        yStop + 10,
        style.lossColor,
      )

      const cantidad = metrics.quantity != null ? ` · ${formatNumber(Number(metrics.quantity.toPrecision(4)))} u` : ''
      const resumen = metrics.valid
        ? `R/R ${metrics.ratio.toFixed(2)}${cantidad}`
        : 'Objetivo o stop del lado equivocado'
      label(resumen, right, (yTarget + yStop) / 2, metrics.valid ? NEUTRAL : style.lossColor, 'right')
    }

    function drawTrend(d, selected) {
      const style = d.style
      const x1 = toX(d.x1)
      const x2 = toX(d.x2)
      const y1 = toY(d.p1)
      const y2 = toY(d.p2)
      if (x1 == null || x2 == null || y1 == null || y2 == null) return
      const dash = style.lineStyle === 'dashed' ? [6, 4] : style.lineStyle === 'dotted' ? [2, 3] : null
      line(x1, y1, x2, y2, style.lineColor, selected ? style.lineWidth + 0.6 : style.lineWidth, dash)
    }

    function drawHorizontal(d, selected) {
      const style = d.style
      const y = toY(d.p1)
      if (y == null) return
      const dash = style.lineStyle === 'dashed' ? [6, 4] : style.lineStyle === 'dotted' ? [2, 3] : null
      line(0, y, canvas.clientWidth, y, style.lineColor, selected ? style.lineWidth + 0.6 : style.lineWidth, dash)
      label(formatPrice(d.p1), canvas.clientWidth - 8, y - 8, style.lineColor, 'right')
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

    function paint(d, selected) {
      if (d.type === 'fib') drawFib(d, selected)
      else if (d.type === 'trend') drawTrend(d, selected)
      else if (d.type === 'horizontal') drawHorizontal(d, selected)
      else drawPosition(d, selected)
    }

    function draw() {
      const { drawings: list, selectedId: selected, tool: activeTool } = propsRef.current
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

      // Sólo dibujamos dentro del panel de precio, no sobre volumen/RSI/eje.
      const paneHeight = chart.panes()[0]?.getHeight() ?? canvas.clientHeight
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvas.clientWidth, paneHeight)
      ctx.clip()

      for (const d of list) {
        paint(d, d.id === selected)
        drawHandles(d, d.id === selected)
      }

      // Vista previa mientras se coloca el dibujo.
      const draft = draftRef.current
      const cursor = cursorRef.current
      if (draft && cursor) {
        ctx.globalAlpha = 0.75
        paint(
          createDrawing(draft.type, { x1: draft.x1, p1: draft.p1, x2: cursor.logical, p2: cursor.price }),
          false,
        )
        ctx.globalAlpha = 1
      } else if (activeTool === 'horizontal' && cursor) {
        ctx.globalAlpha = 0.5
        paint(
          createDrawing('horizontal', { x1: cursor.logical, p1: cursor.price, x2: cursor.logical, p2: cursor.price }),
          false,
        )
        ctx.globalAlpha = 1
      }

      ctx.restore()
    }

    function hitHandle(x, y) {
      const { drawings: list } = propsRef.current
      // De atrás hacia adelante: gana el dibujo de arriba.
      for (let i = list.length - 1; i >= 0; i--) {
        for (const handle of handlesOf(list[i])) {
          const hx = toX(handle.x)
          const hy = toY(handle.price)
          if (hx == null || hy == null) continue
          if (Math.hypot(hx - x, hy - y) <= HIT_RADIUS) return { id: list[i].id, handle: handle.key }
        }
      }
      return null
    }

    // Para el doble clic alcanza con caer dentro del rectángulo del dibujo.
    function hitBody(x, y) {
      const { drawings: list } = propsRef.current
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i]
        const x1 = toX(d.x1)
        const x2 = toX(d.x2)
        if (d.type === 'horizontal') {
          const yVal = toY(d.p1)
          if (yVal != null && Math.abs(y - yVal) <= 6) return d.id
          continue
        }
        if (x1 == null || x2 == null) continue
        if (d.type === 'trend') {
          const y1 = toY(d.p1)
          const y2 = toY(d.p2)
          if (y1 == null || y2 == null) continue
          const length = Math.hypot(x2 - x1, y2 - y1)
          if (length === 0) continue
          const dist = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / length
          if (x >= Math.min(x1, x2) - 6 && x <= Math.max(x1, x2) + 6 && dist <= 6) return d.id
          continue
        }
        if (x < Math.min(x1, x2) - 4 || x > Math.max(x1, x2) + 4) continue

        const precios = d.type === 'fib' ? visibleFibLevels(d).map((l) => l.price) : [d.p1, d.p2, d.stop]
        const ys = precios.map(toY).filter((v) => v != null)
        if (!ys.length) continue
        if (y >= Math.min(...ys) - 4 && y <= Math.max(...ys) + 4) return d.id
      }
      return null
    }

    function localPoint(event) {
      const rect = wrapEl.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const setCapture = (active) => {
      canvas.style.pointerEvents = active ? 'auto' : 'none'
    }

    function onMouseMove(event) {
      const { tool: activeTool, onChange: change, drawings: list } = propsRef.current
      const { x, y } = localPoint(event)

      const drag = dragRef.current
      if (drag) {
        let logical = fromX(x)
        let price = fromY(y)
        if (logical == null || price == null) return
        const snapped = snapPoint(logical, price, y)
        logical = snapped.logical
        price = snapped.price

        const target = list.find((d) => d.id === drag.id)
        if (!target) return

        if (drag.handle) {
          // Un arrastre es un solo paso de deshacer: mientras dura no se anota.
          change(moveHandle(target, drag.handle, { x: logical, price }), { dragging: true })
        } else {
          change(moveDrawing(target, logical - drag.lastLogical, price - drag.lastPrice), { dragging: true })
          drag.lastLogical = logical
          drag.lastPrice = price
        }
        return
      }

      if (activeTool) {
        setCapture(true)
        wrapEl.style.cursor = 'crosshair'
        let logical = fromX(x)
        let price = fromY(y)
        if (logical != null && price != null) {
          const snapped = snapPoint(logical, price, y)
          logical = snapped.logical
          price = snapped.price
          cursorRef.current = { logical, price }
          draw()
        }
        return
      }

      if (hitHandle(x, y)) {
        setCapture(true)
        wrapEl.style.cursor = 'grab'
      } else if (hitBody(x, y)) {
        setCapture(true)
        wrapEl.style.cursor = 'move'
      } else {
        setCapture(false)
        wrapEl.style.cursor = ''
      }
    }

    function onMouseDown(event) {
      const {
        tool: activeTool,
        onCreate: create,
        onSelect: select,
        onToolEnd: endTool,
        onCheckpoint: checkpoint,
      } = propsRef.current
      if (event.button !== 0) return
      const { x, y } = localPoint(event)
      let logical = fromX(x)
      let price = fromY(y)

      if (activeTool) {
        if (logical == null || price == null) return
        const snapped = snapPoint(logical, price, y)
        logical = snapped.logical
        price = snapped.price
        event.preventDefault()
        event.stopPropagation()

        if (activeTool === 'horizontal') {
          create(createDrawing('horizontal', { x1: logical, p1: price, x2: logical, p2: price }))
          cursorRef.current = null
          endTool()
          return
        }

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

      const hit = hitHandle(x, y)
      if (hit) {
        event.preventDefault()
        event.stopPropagation()
        checkpoint()
        dragRef.current = hit
        select(hit.id)
        wrapEl.style.cursor = 'grabbing'
        return
      }

      // Sobre el cuerpo: seleccionar y, si se arrastra, mover el objeto entero.
      const body = hitBody(x, y)
      if (body && logical != null && price != null) {
        event.preventDefault()
        event.stopPropagation()
        select(body)
        checkpoint()
        dragRef.current = { id: body, lastLogical: logical, lastPrice: price }
        wrapEl.style.cursor = 'grabbing'
      }
    }

    function onMouseUp() {
      if (!dragRef.current) return
      dragRef.current = null
      wrapEl.style.cursor = 'grab'
      // Recién acá anotamos el resultado: el arrastre entero es un solo paso.
      propsRef.current.onCommitDrag?.()
    }

    // Clic derecho sobre un objeto: menú de Configurar / Duplicar / Invertir…
    function onContext(event) {
      const { onContextMenu: abrirMenu, onSelect: select } = propsRef.current
      const { x, y } = localPoint(event)
      const id = hitHandle(x, y)?.id ?? hitBody(x, y)
      if (!id || !abrirMenu) return
      event.preventDefault()
      event.stopPropagation()
      select(id)
      abrirMenu({ id, x: event.clientX, y: event.clientY })
    }

    // Doble clic sobre un dibujo abre su formulario, como en TradingView.
    function onDoubleClick(event) {
      const { onOpenSettings: open, tool: activeTool } = propsRef.current
      if (activeTool) return
      const { x, y } = localPoint(event)
      const id = hitHandle(x, y)?.id ?? hitBody(x, y)
      if (!id) return
      event.preventDefault()
      event.stopPropagation()
      open(id)
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
    wrapEl.addEventListener('dblclick', onDoubleClick)
    wrapEl.addEventListener('contextmenu', onContext)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      observer.disconnect()
      timeScale.unsubscribeVisibleLogicalRangeChange(draw)
      wrapEl.removeEventListener('mousemove', onMouseMove)
      wrapEl.removeEventListener('mousedown', onMouseDown)
      wrapEl.removeEventListener('dblclick', onDoubleClick)
      wrapEl.removeEventListener('contextmenu', onContext)
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
