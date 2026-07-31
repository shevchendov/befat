const logger = require('../../utils/logger')

Page({
  data: {
    goal: null,
    loading: true
  },

  onShow() {
    this.loadGoalProgress()
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
            wx.nextTick(() => this.drawTrendChart(d.trend_data, d.target_weight))
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
      if (!res || !res[0] || !res[0].node) {
        if ((retry || 0) < 3) {
          wx.nextTick(() => this.drawTrendChart(trendData, targetWeight, (retry || 0) + 1))
        } else {
          logger.warn('goalDetail', 'canvas init fail')
        }
        return
      }

      const canvas = res[0].node
      const dpr = wx.getSystemInfoSync().pixelRatio
      const cssW = res[0].width
      const cssH = res[0].height
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const data = trendData.slice()
      const target = Number(targetWeight)

      // 动态 Y 轴范围：数据(含目标值)实际 min/max 外扩 10%
      const weights = data.map(d => Number(d.weight_kg))
      let min = Math.min(...weights, target)
      let max = Math.max(...weights, target)
      let span = max - min
      if (span === 0) span = Math.max(Math.abs(min) * 0.05, 1)
      min = min - span * 0.1
      max = max + span * 0.1

      const padL = 56
      const padR = 20
      const padT = 30
      const padB = 40
      const chartW = cssW - padL - padR
      const chartH = cssH - padT - padB

      const xAt = (i) => {
        if (data.length === 1) return padL + chartW / 2
        return padL + chartW * i / (data.length - 1)
      }
      const yAt = (w) => padT + chartH * (max - w) / (max - min)

      ctx.clearRect(0, 0, cssW, cssH)

      // 网格 + Y 轴刻度（取整数值，避免 .3333 这种）
      const gridCount = 4
      ctx.font = '20px sans-serif'
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

        const label = Math.round(gv * 10) / 10
        ctx.fillStyle = '#999'
        ctx.fillText(String(label), padL - 10, gy)
      }

      // 目标线（水平虚线 + 标签）
      const targetY = yAt(target)
      ctx.strokeStyle = '#FFD23F'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(padL, targetY)
      ctx.lineTo(padL + chartW, targetY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = '#FFD23F'
      ctx.strokeStyle = '#1A1006'
      ctx.lineWidth = 3
      ctx.strokeText('目标 ' + target, padL + 8, targetY - 8)
      ctx.fillText('目标 ' + target, padL + 8, targetY - 8)

      // X 轴日期标签：超过 7 个点做间隔抽样
      ctx.font = '20px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#999'
      const labelStep = data.length > 7 ? Math.ceil(data.length / 7) : 1
      data.forEach((d, i) => {
        if (i % labelStep === 0 || i === data.length - 1) {
          ctx.fillText(d.date.slice(5), xAt(i), padT + chartH + 8)
        }
      })

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
    })
  }
})
