const util = require('../../utils/util')
const logger = require('../../utils/logger')
const { sanitizeDigit } = require('../../utils/validators')

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
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      const width = res[0].width * dpr
      const height = res[0].height * dpr
      canvas.width = width
      canvas.height = height

      const weights = records.map(r => r.weight_kg)
      const minW = Math.floor(Math.min(...weights) - 1)
      const maxW = Math.ceil(Math.max(...weights) + 1)
      const range = maxW - minW || 1

      // 先测量 Y 轴刻度文字宽度，据此预留左侧 padding，避免数字贴边被截断
      ctx.font = Math.round(20 * dpr) + 'px sans-serif'
      const yLabels = []
      for (let i = 0; i <= 4; i++) {
        yLabels.push((maxW - range * i / 4).toFixed(2))
      }
      let maxYLabelW = 0
      yLabels.forEach(t => {
        const w = ctx.measureText(t).width
        if (w > maxYLabelW) maxYLabelW = w
      })

      // 测量 X 轴日期标签宽度与字号（用于旋转后底部预留与相邻重叠判断）
      const xLabels = records.map(r => r.date.slice(5))
      const dateLabelH = Math.round(20 * dpr)
      let maxXLabelW = 0
      xLabels.forEach(t => {
        const w = ctx.measureText(t).width
        if (w > maxXLabelW) maxXLabelW = w
      })
      // 45° 旋转后标签的横向投影宽度 = (文本宽 + 字高) * sin45，用于判断相邻标签是否重叠
      const projectedLabelW = Math.round(0.7071 * (maxXLabelW + dateLabelH) + 4 * dpr)
      // 旋转后标签的等效半高，据此额外加大图表底部 padding，避免标签被画布底部裁切
      const labelHalfExtent = projectedLabelW / 2

      const padding = {
        top: 40 * dpr,
        right: 30 * dpr,
        bottom: Math.max(60 * dpr, labelHalfExtent * 2 + 20 * dpr),
        left: maxYLabelW + 16 * dpr
      }
      const chartW = width - padding.left - padding.right
      const chartH = height - padding.top - padding.bottom

      ctx.clearRect(0, 0, width, height)

      ctx.strokeStyle = '#F0E6D6'
      ctx.lineWidth = 1 * dpr
      ctx.fillStyle = '#999'
      ctx.textAlign = 'right'

      for (let i = 0; i <= 4; i++) {
        const y = padding.top + chartH * i / 4
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(width - padding.right, y)
        ctx.stroke()
        ctx.fillText(yLabels[i], padding.left - 10 * dpr, y + 7 * dpr)
      }

      const points = records.map((r, idx) => ({
        x: padding.left + chartW * idx / (records.length - 1),
        y: padding.top + chartH * (maxW - r.weight_kg) / range
      }))

      ctx.strokeStyle = '#FF8C42'
      ctx.lineWidth = 3 * dpr
      ctx.lineJoin = 'round'
      ctx.beginPath()
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()

      points.forEach((p, idx) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = '#FF8C42'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2 * dpr
        ctx.stroke()
      })

      ctx.fillStyle = '#999'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = Math.round(20 * dpr) + 'px sans-serif'
      // 相邻标签中心间距：数据点间隔
      const pointSpacing = chartW / (records.length - 1)
      // 相邻两个标签不重叠所需的最小中心距 = 旋转后横向投影宽（各占一半）
      // 空间足够则全部显示；不足时回退间隔抽样兜底
      const labelStep = pointSpacing >= projectedLabelW ? 1 : Math.max(1, Math.ceil(projectedLabelW / pointSpacing))
      // 旋转标签的绘制锚点纵坐标：保证旋转后文字整体不超出画布底部
      const labelBaseY = height - labelHalfExtent - 10 * dpr
      records.forEach((r, idx) => {
        if (idx % labelStep !== 0 && idx !== records.length - 1) return
        ctx.save()
        ctx.translate(points[idx].x, labelBaseY)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(xLabels[idx], 0, 0)
        ctx.restore()
      })
    })
  }
})
