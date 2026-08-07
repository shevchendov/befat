const logger = require('../../utils/logger')
const canvasChart = require('../../utils/canvasChart')

const NUTR_COLORS = { ok: '#43A047', fail: '#FF6B35', none: '#C9C2B8' }

Page({
  data: {
    loading: true,
    error: '',
    summaryItems: [],
    weights: [],
    weeks: []
  },

  onLoad() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: { days: 90 }
      })

      if (res.result.code === 0) {
        const d = res.result.data
        const summaryItems = this.buildSummaryItems(d)
        const weeks = (d.weeks || [])
          .filter(w => w.recorded > 0 || w.weight_delta != null)
          .map(w => this.buildWeekItem(w))
        this.setData({
          summaryItems,
          weeks,
          weights: d.weights || [],
          loading: false
        }, () => {
          if (d.weights && d.weights.length > 0) {
            setTimeout(() => this.drawWeightChart(d.weights), 300)
          }
        })
      } else {
        this.setData({ loading: false, error: res.result.message || '加载失败' })
      }
    } catch (err) {
      logger.error('stats loadData', err)
      this.setData({ loading: false, error: '网络异常，请重试' })
    }
  },

  buildSummaryItems(d) {
    const target = d.target || {}
    const hasCal = Number(target.calorie) > 0
    const hasPro = Number(target.protein_g) > 0
    const summary = d.summary || {}
    const mk = (label, rate, recorded, hasTarget) => ({
      label,
      recorded: recorded || 0,
      rateText: hasTarget && rate != null ? `${rate}%` : '--'
    })
    return [
      mk('近7天 · 热量', summary.week && summary.week.calorie_rate, summary.week && summary.week.recorded, hasCal),
      mk('近7天 · 蛋白', summary.week && summary.week.protein_rate, summary.week && summary.week.recorded, hasPro),
      mk('近30天 · 热量', summary.month && summary.month.calorie_rate, summary.month && summary.month.recorded, hasCal),
      mk('近30天 · 蛋白', summary.month && summary.month.protein_rate, summary.month && summary.month.recorded, hasPro)
    ]
  },

  buildWeekItem(w) {
    const hasRate = w.calorie_rate != null
    let deltaText = '无体重记录'
    if (w.weight_delta != null) {
      const sign = w.weight_delta > 0 ? '+' : ''
      deltaText = `${sign}${w.weight_delta}kg`
    }
    return {
      label: w.label,
      barWidth: hasRate ? w.calorie_rate : 0,
      rateText: hasRate ? `${w.calorie_rate}%` : '--',
      deltaText
    }
  },

  drawWeightChart(weights, retry) {
    const query = wx.createSelectorQuery()
    query.select('#weightChart').fields({ node: true, size: true }).exec((res) => {
      const node = res && res[0] && res[0].node
      const cssW = res && res[0] ? res[0].width : 0
      const cssH = res && res[0] ? res[0].height : 0

      if (!node || !cssW || !cssH) {
        if ((retry || 0) < 3) {
          setTimeout(() => this.drawWeightChart(weights, (retry || 0) + 1), 300)
        } else {
          logger.warn('stats', 'canvas init fail')
        }
        return
      }

      const canvas = node
      const { ctx } = canvasChart.initCanvas(canvas, cssW, cssH)

      const data = weights.slice()
      const nums = data.map(d => Number(d.weight_kg))
      let min = Math.min(...nums)
      let max = Math.max(...nums)
      let span = max - min
      if (span === 0) span = Math.max(Math.abs(min) * 0.05, 1)
      min = min - span * 0.1
      max = max + span * 0.1

      const gridCount = 3
      const yLabels = []
      for (let i = 0; i <= gridCount; i++) {
        const gv = min + (max - min) * i / gridCount
        yLabels.push(String(Math.round(gv * 10) / 10))
      }
      const padL = canvasChart.measureYAxisPadding(ctx, yLabels, { font: '16px sans-serif', margin: 10 })
      const padR = 20
      const padT = 30
      const xLabels = data.map(d => d.date.slice(5))
      const xMetrics = canvasChart.calcXLabelMetrics(ctx, xLabels, { fontSize: 16 })
      const padB = xMetrics.bottomPadding + 10
      const chartW = cssW - padL - padR
      const chartH = cssH - padT - padB

      const xAt = (i) => {
        if (data.length === 1) return padL + chartW / 2
        return padL + chartW * i / (data.length - 1)
      }
      const yAt = (w) => padT + chartH * (max - w) / (max - min)

      ctx.clearRect(0, 0, cssW, cssH)

      ctx.font = '16px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let i = 0; i <= gridCount; i++) {
        const gv = min + (max - min) * i / gridCount
        const gy = padT + chartH - chartH * i / gridCount
        ctx.strokeStyle = 'rgba(26,16,6,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padL, gy)
        ctx.lineTo(padL + chartW, gy)
        ctx.stroke()

        ctx.fillStyle = '#999'
        ctx.fillText(yLabels[i], padL - 10, gy)
      }

      const points = data.map((d, i) => ({ x: xAt(i), y: yAt(Number(d.weight_kg)) }))
      if (points.length >= 2) {
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#1A1006'
        ctx.lineWidth = 6
        ctx.beginPath()
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
        ctx.stroke()

        ctx.strokeStyle = '#FF6B35'
        ctx.lineWidth = 3
        ctx.beginPath()
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
        ctx.stroke()
      }

      points.forEach((p, i) => {
        const color = NUTR_COLORS[data[i].nutr] || NUTR_COLORS.none
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#1A1006'
        ctx.stroke()
      })

      const pointSpacing = data.length > 1 ? chartW / (data.length - 1) : chartW
      const labelStep = canvasChart.computeLabelStep(pointSpacing, xMetrics.projectedW)
      const labelBaseY = cssH - xMetrics.projectedW - 6
      canvasChart.drawXAxisLabels(ctx, {
        labels: xLabels,
        xPositions: points.map(p => p.x),
        baseY: labelBaseY,
        step: labelStep,
        font: '16px sans-serif',
        color: '#999'
      })
    })
  }
})
