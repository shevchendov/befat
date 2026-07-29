const util = require('../../utils/util')
const logger = require('../../utils/logger')

Page({
  data: {
    inputWeight: '',
    latestWeight: null,
    weightChange: null,
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

      const records = [...res.data].reverse()
      const latest = records.length > 0 ? records[records.length - 1].weight_kg : null
      let change = null
      if (records.length >= 2) {
        const prev = records[records.length - 2].weight_kg
        change = Math.round((latest - prev) * 10) / 10
      }

      this.setData({
        records,
        latestWeight: latest,
        weightChange: change
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
    this.setData({ inputWeight: e.detail.value })
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
        const records = res.result.data.records
        const latest = records.length > 0 ? records[records.length - 1].weight_kg : weight
        let change = null
        if (records.length >= 2) {
          const prev = records[records.length - 2].weight_kg
          change = Math.round((latest - prev) * 10) / 10
        }

        this.setData({
          records,
          latestWeight: latest,
          weightChange: change,
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

      const padding = { top: 40 * dpr, right: 30 * dpr, bottom: 60 * dpr, left: 60 * dpr }
      const chartW = width - padding.left - padding.right
      const chartH = height - padding.top - padding.bottom

      ctx.clearRect(0, 0, width, height)

      const weights = records.map(r => r.weight_kg)
      const minW = Math.floor(Math.min(...weights) - 1)
      const maxW = Math.ceil(Math.max(...weights) + 1)
      const range = maxW - minW || 1

      ctx.strokeStyle = '#F0E6D6'
      ctx.lineWidth = 1 * dpr
      ctx.font = Math.round(20 * dpr) + 'px sans-serif'
      ctx.fillStyle = '#999'
      ctx.textAlign = 'right'

      for (let i = 0; i <= 4; i++) {
        const y = padding.top + chartH * i / 4
        const val = maxW - range * i / 4
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(width - padding.right, y)
        ctx.stroke()
        ctx.fillText(val.toFixed(1), padding.left - 10 * dpr, y + 7 * dpr)
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
      ctx.font = Math.round(20 * dpr) + 'px sans-serif'
      records.forEach((r, idx) => {
        const label = r.date.slice(5)
        if (idx % Math.max(1, Math.floor(records.length / 6)) === 0 || idx === records.length - 1) {
          ctx.fillText(label, points[idx].x, height - padding.bottom / 2 + 10 * dpr)
        }
      })
    })
  }
})
