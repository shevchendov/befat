const util = require('../../utils/util')
const logger = require('../../utils/logger')
const { sanitizeDigit } = require('../../utils/validators')
const canvasChart = require('../../utils/canvasChart')

function formatWeight(v) {
  return v !== null && v !== undefined ? v.toFixed(2) : '--'
}

Page({
  data: {
    inputWeight: '',
    latestWeight: null,
    latestWeightDisplay: '--',
    weightChange: null,
    weightChangeDisplay: null,
    records: [],
    saving: false
  },

  onShow() {
    this.loadWeightRecords()
  },

  async loadWeightRecords() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('weight_logs').where({
        _openid: '{openid}'
      }).orderBy('date', 'desc').limit(100).get()

      const records = [...res.data].reverse().map(r => ({
        ...r,
        weight_kg_display: r.weight_kg.toFixed(2)
      }))
      const recordsReversed = [...records].reverse()
      const latest = records.length > 0 ? records[records.length - 1].weight_kg : null
      let change = null
      if (records.length >= 2) {
        const prev = records[records.length - 2].weight_kg
        change = Math.round((latest - prev) * 100) / 100
      }

      this.setData({
        records,
        recordsReversed,
        latestWeight: latest,
        latestWeightDisplay: formatWeight(latest),
        weightChange: change,
        weightChangeDisplay: change !== null ? (change >= 0 ? '+' : '') + change.toFixed(2) : null
      }, () => {
        if (records.length > 1) {
          setTimeout(() => this.drawChart(), 300)
        }
      })
    } catch (err) {
      logger.error('loadWeightRecords', err)
    }
  },

  onWeightInput(e) {
    let value = sanitizeDigit(e.detail.value)
    const parts = value.split('.')
    if (parts.length > 1 && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].slice(0, 2)
    }
    if (value.length > 6) value = value.slice(0, 6)
    this.setData({ inputWeight: value })
  },

  async saveWeight() {
    const weight = parseFloat(this.data.inputWeight)
    if (!weight || weight < 20 || weight > 300) {
      wx.showToast({ title: '请输入有效体重', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      const today = util.formatDate(new Date())
      const res = await wx.cloud.callFunction({
        name: 'saveWeightLog',
        data: {
          date: today,
          weight_kg: weight
        }
      })

      if (res.result.code === 0) {
        const records = res.result.data.records.map(r => ({
          ...r,
          weight_kg_display: r.weight_kg.toFixed(2)
        }))
        const recordsReversed = [...records].reverse()
        const latest = records.length > 0 ? records[records.length - 1].weight_kg : weight
        let change = null
        if (records.length >= 2) {
          const prev = records[records.length - 2].weight_kg
          change = Math.round((latest - prev) * 100) / 100
        }

        this.setData({
          records,
          recordsReversed,
          latestWeight: latest,
          latestWeightDisplay: formatWeight(latest),
          weightChange: change,
          weightChangeDisplay: change !== null ? (change >= 0 ? '+' : '') + change.toFixed(2) : null,
          inputWeight: '',
          saving: false
        }, () => {
          if (records.length > 1) {
            setTimeout(() => this.drawChart(), 300)
          }
        })

        wx.showToast({ title: '记录成功!', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
        this.setData({ saving: false })
      }
    } catch (err) {
      logger.error('saveWeight', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ saving: false })
    }
  },

  drawChart() {
    const records = this.data.records
    if (records.length < 2) return

    const query = wx.createSelectorQuery()
    query.select('#weightChart').fields({ node: true, size: true }).exec((res) => {
      if (!res[0]) return
      const canvas = res[0].node
      const cssW = res[0].width
      const cssH = res[0].height
      const { ctx } = canvasChart.initCanvas(canvas, cssW, cssH)

      const weights = records.map(r => r.weight_kg)
      const minW = Math.floor(Math.min(...weights) - 1)
      const maxW = Math.ceil(Math.max(...weights) + 1)
      const range = maxW - minW || 1

      // 先测量 Y 轴刻度文字宽度，据此预留左侧 padding，避免数字贴边被截断
      const yLabels = []
      for (let i = 0; i <= 3; i++) {
        yLabels.push((maxW - range * i / 3).toFixed(2))
      }
      const padLeft = canvasChart.measureYAxisPadding(ctx, yLabels, { font: '16px sans-serif', margin: 14 })

      // 测量 X 轴日期标签宽度与字号（用于旋转后底部预留与相邻重叠判断）
      const xLabels = records.map(r => r.date.slice(5))
      const xMetrics = canvasChart.calcXLabelMetrics(ctx, xLabels, { fontSize: 16 })

      const padding = {
        top: 40,
        right: 30,
        bottom: xMetrics.bottomPadding,
        left: padLeft
      }
      const chartW = cssW - padding.left - padding.right
      const chartH = cssH - padding.top - padding.bottom

      ctx.clearRect(0, 0, cssW, cssH)

      ctx.strokeStyle = '#F0E6D6'
      ctx.lineWidth = 1
      ctx.fillStyle = '#999'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'right'

      for (let i = 0; i <= 3; i++) {
        const y = padding.top + chartH * i / 3
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(cssW - padding.right, y)
        ctx.stroke()
        ctx.fillText(yLabels[i], padding.left - 10, y + 7)
      }

      const points = records.map((r, idx) => ({
        x: padding.left + chartW * idx / (records.length - 1),
        y: padding.top + chartH * (maxW - r.weight_kg) / range
      }))

      ctx.strokeStyle = '#FF8C42'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.beginPath()
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()

      points.forEach((p, idx) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#FF8C42'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      // 相邻标签中心间距：数据点间隔
      const pointSpacing = chartW / (records.length - 1)
      const labelStep = canvasChart.computeLabelStep(pointSpacing, xMetrics.projectedW)
      // 旋转标签的绘制锚点纵坐标：保证旋转后文字整体不超出画布底部
      const labelBaseY = cssH - xMetrics.halfExtent - 10
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
