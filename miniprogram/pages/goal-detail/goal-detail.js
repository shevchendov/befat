const logger = require('../../utils/logger')
const canvasChart = require('../../utils/canvasChart')

function rndRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

Page({
  data: {
    goal: null,
    loading: true
  },

  onShow() {
    this.loadGoalProgress()
  },

  handleModifyGoal() {
    wx.navigateTo({ url: '/pages/target-edit/target-edit' })
  },

  async loadGoalProgress() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getGoalProgress'
      })

      if (res.result.code === 0) {
        this.setData({
          goal: res.result.data,
          loading: false
        }, () => {
          const d = res.result.data
          if (d.trend_data && d.trend_data.length > 0) {
            setTimeout(() => this.drawTrendChart(d.trend_data, d.target_weight), 300)
          }
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' })
      }
    } catch (err) {
      logger.error('goalDetail loadGoalProgress', err)
      this.setData({ loading: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  drawTrendChart(trendData, targetWeight, retry) {
    const query = wx.createSelectorQuery()
    query.select('#trendChart').fields({ node: true, size: true }).exec((res) => {
      const node = res && res[0] && res[0].node
      const cssW = res && res[0] ? res[0].width : 0
      const cssH = res && res[0] ? res[0].height : 0

      if (!node || !cssW || !cssH) {
        if ((retry || 0) < 3) {
          setTimeout(() => this.drawTrendChart(trendData, targetWeight, (retry || 0) + 1), 300)
        } else {
          logger.warn('goalDetail', 'canvas init fail')
        }
        return
      }

      const canvas = node
      const { ctx } = canvasChart.initCanvas(canvas, cssW, cssH)

      // 动态 Y 轴范围：数据(含目标值)实际 min/max 外扩 10%
      const data = trendData.slice()
      const target = Number(targetWeight)
      const weights = data.map(d => Number(d.weight_kg))
      let min = Math.min(...weights, target)
      let max = Math.max(...weights, target)
      let span = max - min
      if (span === 0) span = Math.max(Math.abs(min) * 0.05, 1)
      min = min - span * 0.1
      max = max + span * 0.1

      // Y 轴刻度文本，动态测量宽度得到左侧 padding，避免数字贴边
      const gridCount = 3
      const yLabels = []
      for (let i = 0; i <= gridCount; i++) {
        const gv = min + (max - min) * i / gridCount
        yLabels.push(String(Math.round(gv * 10) / 10))
      }
      const padL = canvasChart.measureYAxisPadding(ctx, yLabels, { font: '16px sans-serif', margin: 10 })
      const padR = 20
      const padT = 30
      // X 轴日期标签（45° 斜排）测量得到底部 padding
      const xLabels = data.map(d => d.date.slice(5))
      const xMetrics = canvasChart.calcXLabelMetrics(ctx, xLabels, { fontSize: 16 })
      // 底部额外留白：16px 斜排标签旋转后垂直投影完整预留，防止最后一个日期被裁切
      const padB = xMetrics.bottomPadding + 10
      const chartW = cssW - padL - padR
      const chartH = cssH - padT - padB

      const xAt = (i) => {
        if (data.length === 1) return padL + chartW / 2
        return padL + chartW * i / (data.length - 1)
      }
      const yAt = (w) => padT + chartH * (max - w) / (max - min)

      ctx.clearRect(0, 0, cssW, cssH)

      // 网格 + Y 轴刻度
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

      // 目标线：贯穿整个绘图区域宽度（padL 到右边界）
      const targetY = yAt(target)
      ctx.strokeStyle = '#FFD23F'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(padL, targetY)
      ctx.lineTo(padL + chartW, targetY)
      ctx.stroke()
      ctx.setLineDash([])

      // 实际体重折线（暖橙 + 黑色粗描边，贴纸风）
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

      // 数据点圆点标记
      points.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#FF6B35'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#1A1006'
        ctx.stroke()
      })

      // 目标标签：亮黄底 + 2px 黑描边 + 深棕文字
      // 紧贴在目标虚线上方：Y = targetY - 标签高 - 安全间隙，水平居中于绘图区
      const labelText = '目标 ' + target
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'right'
      const labelW = ctx.measureText(labelText).width
      const gap = 8
      const labelBox = {
        w: labelW + 20,
        h: 30,
        x: padL + chartW / 2 - (labelW + 20) / 2, // 绘图区水平中心 - 标签宽/2
        y: targetY - 30 - gap                      // targetY - 标签高 - 安全间隙
      }
      const labelPos = labelBox

      ctx.fillStyle = '#FFD23F'
      ctx.strokeStyle = '#1A1006'
      ctx.lineWidth = 2
      rndRect(ctx, labelPos.x, labelPos.y, labelPos.w, labelPos.h, 8)
      ctx.fill()
      ctx.stroke()
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#2B2B2B'
      ctx.fillText(labelText, labelPos.x + labelPos.w - 10, labelPos.y + labelPos.h / 2)

      // X 轴日期标签：45° 斜排，空间不足时回退间隔抽样兜底
      const pointSpacing = data.length > 1 ? chartW / (data.length - 1) : chartW
      const labelStep = canvasChart.computeLabelStep(pointSpacing, xMetrics.projectedW)
      // 底部预留按完整投影宽计算，避免 08-04 等斜排文字底部被裁切
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
