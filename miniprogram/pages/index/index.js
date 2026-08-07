const app = getApp()
const util = require('../../utils/util')
const dateFormat = require('../../utils/dateFormat')
const logger = require('../../utils/logger')

const CELEBRATION_THRESHOLD = 0.8
// 首页数据 TTL：30s 内从只读来源页返回时使用缓存，跳过云函数调用（配额优化）
const DATA_TTL = 30000
// 返回首页时可能改动首页展示数据的来源页（写操作后返回 → 强制刷新，不能走缓存）
const DIRTY_SOURCE_ROUTES = [
  'pages/log-food/log-food',
  'pages/weight-track/weight-track',
  'pages/target-edit/target-edit',
  'pages/profile/profile'
]

Page({
  data: {
    dateText: '',
    greeting: '',
    dailySummary: {
      total_calorie: 0,
      total_protein_g: 0
    },
    targets: {
      calorie: 2500,
      protein: 100
    },
    meals: [],
    showCelebration: false,
    caloriePercent: 0,
    proteinPercent: 0,
    goalProgress: null,
    showGoalGuide: false
  },

  onShow() {
    this.loadData()
  },

  // 判断是否刷新数据：reLaunch 场景（onboarding 提交后）用显式标记；
  // navigateBack 场景用上一页 route 判断是否写数据；其余走 30s TTL + 跨天兜底
  shouldRefresh(today) {
    if (app.globalData.forceIndexRefresh) {
      app.globalData.forceIndexRefresh = false
      return true
    }
    const pages = getCurrentPages()
    const prev = pages.length >= 2 ? pages[pages.length - 2].route : null
    if (prev && DIRTY_SOURCE_ROUTES.indexOf(prev) !== -1) return true
    if (this._lastLoadDate !== today) return true
    if (!this._lastLoadTs) return true
    return Date.now() - this._lastLoadTs > DATA_TTL
  },

  async loadData() {
    const now = new Date()
    const today = util.formatDate(now)
    const hour = now.getHours()
    const dateText = dateFormat.formatDateShortCN(now)

    let greeting
    if (hour < 9) greeting = '早起的鸟儿有虫吃，早起的人儿要加餐！🌅'
    else if (hour < 12) greeting = '离午饭还有一会儿，先垫垫肚子？🍙'
    else if (hour < 14) greeting = '吃饱了吗？没吃饱再来一轮！🍖'
    else if (hour < 18) greeting = '下午茶时间到，搞点零食不过分吧？🧋'
    else greeting = '夜宵时间！做大只的黄金时刻！🌙'

    this.setData({ dateText, greeting })

    if (app.globalData.dailyTargets) {
      this.setData({ targets: app.globalData.dailyTargets })
    }

    // 缓存命中：跳过云函数调用（问候语/目标数据已在上面本地更新）
    if (!this.shouldRefresh(today)) {
      return
    }
    this._lastLoadTs = Date.now()
    this._lastLoadDate = today

    this.loadGoalProgress()

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
                mealType: type,
                time: log.created_at ? dateFormat.formatTimeShortCN(new Date(log.created_at)) : '',
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

        const caloriePercent = data.target_calorie > 0 ? Math.min(data.total_calorie / data.target_calorie, 1) : 0
        const proteinPercent = data.target_protein > 0 ? Math.min(data.total_protein_g / data.target_protein, 1) : 0

        this.setData({
          dailySummary: {
            total_calorie: data.total_calorie,
            total_protein_g: data.total_protein_g
          },
          targets: {
            calorie: data.target_calorie || this.data.targets.calorie,
            protein: data.target_protein || this.data.targets.protein
          },
          meals,
          caloriePercent,
          proteinPercent
        })

        this.drawRings()

        const storageKey = 'celebrate_shown_' + today
        if (caloriePercent >= CELEBRATION_THRESHOLD && meals.length > 0 && !wx.getStorageSync(storageKey)) {
          this.setData({ showCelebration: true })
          wx.setStorageSync(storageKey, true)
          setTimeout(() => this.setData({ showCelebration: false }), 3000)
        }
      }
    } catch (err) {
      logger.error('loadData', err)
    }
  },

  drawRings() {
    const targets = this.data.targets
    const current = this.data.dailySummary

    this.drawSingleRing('calorieCanvas', current.total_calorie, targets.calorie)
    this.drawSingleRing('proteinCanvas', current.total_protein_g, targets.protein)
  },

  drawSingleRing(canvasId, current, target) {
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
      const radius = size / 2 - 22 * dpr
      const lineWidth = 24 * dpr
      const progress = target > 0 ? Math.min(current / target, 1) : 0

      ctx.clearRect(0, 0, size, size)

      const isCalorie = canvasId === 'calorieCanvas'
      const trackColor = isCalorie ? '#FFE8D0' : '#D8F5E0'
      const fillColor = isCalorie ? '#FF7A2F' : '#2ECC71'

      ctx.beginPath()
      ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5)
      ctx.strokeStyle = trackColor
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.stroke()

      if (progress > 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
        ctx.strokeStyle = fillColor
        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      if (progress >= 1) {
        ctx.beginPath()
        ctx.arc(cx, cy, radius + 8 * dpr, 0, Math.PI * 2)
        ctx.strokeStyle = isCalorie ? '#FF7A2F' : '#2ECC71'
        ctx.lineWidth = 4 * dpr
        ctx.globalAlpha = 0.3
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    })
  },

  dismissCelebration() {
    this.setData({ showCelebration: false })
  },

  async loadGoalProgress() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getGoalProgress'
      })

      if (res.result.code === 0) {
        const d = res.result.data
        const progress = Math.max(0, Math.min(d.progress_percent, 100))
        const fmtW = v => Number(v).toFixed(2)
        this.setData({
          goalProgress: {
            achieved: d.achieved,
            initial_weight: fmtW(d.initial_weight),
            current_weight: fmtW(d.current_weight),
            target_weight: fmtW(d.target_weight),
            progress_percent: progress,
            barWidth: progress + '%',
            remaining_kg: fmtW(d.remaining_kg),
            estimated_date: d.estimated_date,
            estimate_basis: d.estimate_basis || null,
            trend_data: d.trend_data
          },
          showGoalGuide: false
        })
      } else if (res.result.code === -1) {
        // 用户不存在（未完成 onboarding），目标卡片优雅降级为引导空状态
        this.setData({ goalProgress: null, showGoalGuide: true })
      }
    } catch (err) {
      logger.error('loadGoalProgress', err)
    }
  },

  goToGoalDetail() {
    wx.navigateTo({ url: '/pages/goal-detail/goal-detail' })
  },

  goToOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  goToTargetEdit() {
    wx.navigateTo({ url: '/pages/target-edit/target-edit' })
  },

  goToLogFood() {
    wx.navigateTo({ url: '/pages/log-food/log-food' })
  },

  goToWeightTrack() {
    wx.navigateTo({ url: '/pages/weight-track/weight-track' })
  },

  goToRecipeList() {
    wx.navigateTo({ url: '/pages/recipe-list/recipe-list' })
  },

  goToStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  }
})
