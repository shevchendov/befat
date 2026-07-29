const app = getApp()
const util = require('../../utils/util')
const logger = require('../../utils/logger')

Page({
  data: {
    dateText: '',
    dailySummary: {
      total_calorie: 0,
      total_protein_g: 0
    },
    targets: {
      calorie: 2500,
      protein: 100
    },
    meals: []
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const today = util.formatDate(new Date())
    const todayText = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

    this.setData({ dateText: todayText })

    if (app.globalData.dailyTargets) {
      this.setData({ targets: app.globalData.dailyTargets })
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDailySummary',
        data: { date: today }
      })

      if (res.result.code === 0) {
        const data = res.result.data
        const meals = []
        const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack']

        mealOrder.forEach(type => {
          const logs = data.meals[type]
          if (logs && logs.length > 0) {
            logs.forEach(log => {
              const itemList = log.parsed_items || [{ name: log.raw_text, calorie: log.total_calorie, protein_g: log.total_protein_g }]
              meals.push({
                mealLabel: util.getMealTypeLabel(type),
                time: log.created_at ? new Date(log.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
                items: itemList.map(item => ({
                  name: item.name,
                  calorie: item.calorie || 0,
                  protein: item.protein_g || 0
                })),
                total_calorie: log.total_calorie || 0,
                total_protein_g: log.total_protein_g || 0
              })
            })
          }
        })

        this.setData({
          dailySummary: {
            total_calorie: data.total_calorie,
            total_protein_g: data.total_protein_g
          },
          targets: {
            calorie: data.target_calorie || this.data.targets.calorie,
            protein: data.target_protein || this.data.targets.protein
          },
          meals
        })

        this.drawRings()
      }
    } catch (err) {
      logger.error('loadData', err)
    }
  },

  drawRings() {
    const targets = this.data.targets
    const current = this.data.dailySummary

    this.drawSingleRing('calorieCanvas', current.total_calorie, targets.calorie, '#FF8C42')
    this.drawSingleRing('proteinCanvas', current.total_protein_g, targets.protein, '#4CAF50')
  },

  drawSingleRing(canvasId, current, target, color) {
    const query = wx.createSelectorQuery()
    query.select('#' + canvasId).fields({ node: true, size: true }).exec((res) => {
      if (!res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      const size = 260 * dpr
      canvas.width = size
      canvas.height = size

      const cx = size / 2
      const cy = size / 2
      const radius = size / 2 - 20 * dpr
      const lineWidth = 20 * dpr
      const progress = target > 0 ? Math.min(current / target, 1) : 0

      ctx.clearRect(0, 0, size, size)

      ctx.beginPath()
      ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5)
      ctx.strokeStyle = '#F0E6D6'
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.stroke()
    })
  },

  goToLogFood() {
    wx.navigateTo({ url: '/pages/log-food/log-food' })
  },

  goToWeightTrack() {
    wx.navigateTo({ url: '/pages/weight-track/weight-track' })
  },

  goToRecipeList() {
    wx.navigateTo({ url: '/pages/recipe-list/recipe-list' })
  }
})
