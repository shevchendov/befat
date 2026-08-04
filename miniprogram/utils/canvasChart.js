const FONT_DEFAULT = '20px sans-serif'
const FONT_SIZE_DEFAULT = 20

function initCanvas(canvas, cssW, cssH) {
  const dpr = wx.getWindowInfo().pixelRatio
  canvas.width = cssW * dpr
  canvas.height = cssH * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  return { ctx, dpr }
}

function measureYAxisPadding(ctx, labels, opts) {
  const font = (opts && opts.font) || FONT_DEFAULT
  const margin = (opts && opts.margin) || 16
  ctx.font = font
  let maxW = 0
  labels.forEach(t => {
    const w = ctx.measureText(String(t)).width
    if (w > maxW) maxW = w
  })
  return Math.ceil(maxW) + margin
}

function calcXLabelMetrics(ctx, labels, opts) {
  const fontSize = (opts && opts.fontSize) || FONT_SIZE_DEFAULT
  const font = (opts && opts.font) || fontSize + 'px sans-serif'
  ctx.font = font
  let maxW = 0
  labels.forEach(t => {
    const w = ctx.measureText(String(t)).width
    if (w > maxW) maxW = w
  })
  const projectedW = Math.round(0.7071 * (maxW + fontSize) + 4)
  const halfExtent = projectedW / 2
  const bottomPadding = Math.max(60, halfExtent * 2 + 20)
  return { maxW, projectedW, halfExtent, bottomPadding, fontSize }
}

function computeLabelStep(pointSpacing, projectedW) {
  return pointSpacing >= projectedW ? 1 : Math.max(1, Math.ceil(projectedW / pointSpacing))
}

function drawXAxisLabels(ctx, opts) {
  const { labels, xPositions, baseY, step, font, color } = opts
  ctx.save()
  ctx.font = font || FONT_DEFAULT
  ctx.fillStyle = color || '#999'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  labels.forEach((label, idx) => {
    if (idx % step !== 0 && idx !== labels.length - 1) return
    ctx.save()
    ctx.translate(xPositions[idx], baseY)
    ctx.rotate(-Math.PI / 4)
    ctx.fillText(String(label), 0, 0)
    ctx.restore()
  })
  ctx.restore()
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function findFirstFreeRect(candidates, obstacles) {
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    let overlap = false
    for (let j = 0; j < obstacles.length; j++) {
      if (rectsOverlap(c, obstacles[j])) {
        overlap = true
        break
      }
    }
    if (!overlap) return c
  }
  return null
}

function buildObstacles(points, opts) {
  const pointRadius = (opts && opts.pointRadius) || 6
  const margin = (opts && opts.margin) || 6
  const lineWidth = (opts && opts.lineWidth) || 3
  const sampleStep = (opts && opts.sampleStep) || 4
  const obstacles = []

  points.forEach(p => {
    const r = pointRadius + margin
    obstacles.push({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 })
  })

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(len / sampleStep))
    const halfW = lineWidth / 2 + margin
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const px = a.x + (b.x - a.x) * t
      const py = a.y + (b.y - a.y) * t
      obstacles.push({ x: px - halfW, y: py - halfW, w: halfW * 2, h: halfW * 2 })
    }
  }
  return obstacles
}

module.exports = {
  initCanvas,
  measureYAxisPadding,
  calcXLabelMetrics,
  computeLabelStep,
  drawXAxisLabels,
  rectsOverlap,
  findFirstFreeRect,
  buildObstacles
}
