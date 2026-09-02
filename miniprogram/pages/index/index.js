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
// 减重模式每日步数目标：可配置，优先取用户目标步数配置（users.steps_goal），缺省 8000
const LOSE_STEPS_TARGET_DEFAULT = 8000

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
    goalType: 'gain',
    overLimit: false,
    remainingCalorie: null,
    isTodayAchieved: false,
    targetProgressText: '',
    bmiValue: '',
    bmiStatus: '',
    bmiLevel: '',
    werunSteps: 0,
    werunCalorie: 0,
    loseStepsTarget: LOSE_STEPS_TARGET_DEFAULT,
    goalProgress: null,
    showGoalGuide: false,
    fastingState: null
  },

  onShow() {
    this.loadData()
    this.loadWerunForLose()
    this.loadFastingState()
  },

  // 问候语按【时间段 × 目标模式】隔离，增重/减重文案独立，防止文案污染
  getGreetingText(goalType) {
    const gt = util.normalizeGoalType(goalType)
    const hour = new Date().getHours()
    if (gt === 'lose') {
      if (hour < 9) return '早起先来杯温水，早餐吃够蛋白质！🥚'
      if (hour < 12) return '上午别饿着，来点低卡高蛋白垫一垫？🥒'
      if (hour < 14) return '午餐七分饱，瘦得更轻松！🥗'
      if (hour < 18) return '下午加餐选错就白练了，来点轻食？🍅'
      return '夜宵别碰高油高糖，早睡才是燃脂王！🌙'
    }
    if (hour < 9) return '早起的鸟儿有虫吃，早起的人儿要加餐！🌅'
    if (hour < 12) return '离午饭还有一会儿，先垫垫肚子？🍙'
    if (hour < 14) return '吃饱了吗？没吃饱再来一轮！🍖'
    if (hour < 18) return '下午茶时间到，搞点零食不过分吧？🧋'
    return '夜宵时间！做大只的黄金时刻！🌙'
  },

  // BMI 状态归类：偏瘦 / 正常 / 超重
  classifyBmi(bmi) {
    if (!bmi || isNaN(bmi)) return { status: '', level: '' }
    if (bmi < 18.5) return { status: '偏瘦', level: 'under' }
    if (bmi < 24) return { status: '正常', level: 'normal' }
    return { status: '超重', level: 'over' }
  },

  // 判断是否刷新数据：reLaunch 场景（onboarding 提交后）用显式标记；
  // navigateBack 场景用上一页 route 判断是否写数据；其余走 30s TTL + 跨天兜底
  shouldRefresh(today) {
    if (app.globalData.forceIndexRefresh) {
      app.globalData.forceIndexRefresh = false
      return true
    }
    // 全局数据变更标记：称重/修改目标后强制刷新首页（体重/BMI/TDEE/每日目标联动）
    if (app.globalData.isWeightUpdated || app.globalData.isGoalUpdated) {
      app.globalData.isWeightUpdated = false
      app.globalData.isGoalUpdated = false
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
    const dateText = dateFormat.formatDateShortCN(now)

    // 问候语按目标模式隔离；本地阶段先以 globalData 已存 goal_type 兜底（缓存命中时也能正确显示）
    const localGoalType = util.normalizeGoalType(app.globalData.userInfo && app.globalData.userInfo.goal_type)
    this.setData({ dateText, goalType: localGoalType, greeting: this.getGreetingText(localGoalType), loseStepsTarget: this.resolveStepsTarget() })

    if (app.globalData.dailyTargets) {
      this.setData({ targets: app.globalData.dailyTargets })
    }

    // 缓存命中：跳过云函数调用（问候语/目标数据已在上面本地更新）
    if (!this.shouldRefresh(today)) {
      return
    }

    // P2 竞态防护：每次加载自增请求序号，旧请求返回时不得覆盖新请求结果
    this._loadToken = (this._loadToken || 0) + 1
    const token = this._loadToken

    this.loadGoalProgress(token)

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDailySummary',
        data: { date: today }
      })

      // 存在更新的请求时，本次为过期响应，直接丢弃
      if (token !== this._loadToken) return

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

        const goalType = util.normalizeGoalType(data.goal_type)
        const isLose = goalType === 'lose'

        // 达标口径：增重 = 摄入需达 target；减重 = 摄入不超 target（超标则警示）
        let caloriePercent
        if (isLose) {
          caloriePercent = data.target_calorie > 0 ? Math.min(data.target_calorie / (data.total_calorie || 1), 1) : 0
        } else {
          caloriePercent = data.target_calorie > 0 ? Math.min(data.total_calorie / data.target_calorie, 1) : 0
        }
        const proteinPercent = data.target_protein > 0 ? Math.min(data.total_protein_g / data.target_protein, 1) : 0
        const overLimit = isLose && data.target_calorie > 0 && data.total_calorie > data.target_calorie

        // 减重热量差值副标：withinBudget 时显示"还可吃"，超标时显示"已超标"
        const remainingCalorie = isLose && data.target_calorie > 0 ? data.target_calorie - data.total_calorie : null

        // 今日目标达成判定：
        // gain = 热量≥目标 且 蛋白≥目标；
        // lose = 热量未超标 且 蛋白达标 且 今日已有饮食记录（排除清晨 0 摄入误判达成）
        const totalCalorie = data.total_calorie || 0
        const totalProtein = data.total_protein_g || 0
        const calorieTarget = data.target_calorie || 0
        const proteinTarget = data.target_protein || 0
        const isTodayAchieved = isLose
          ? (calorieTarget > 0 && totalCalorie > 0 && totalCalorie <= calorieTarget && totalProtein >= proteinTarget)
          : (calorieTarget > 0 && totalCalorie >= calorieTarget && totalProtein >= proteinTarget)

        this.setData({
          goalType,
          greeting: this.getGreetingText(goalType),
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
          proteinPercent,
          overLimit,
          remainingCalorie,
          isTodayAchieved
        })

        this.drawRings()

        const storageKey = 'celebrate_shown_' + today
        if (caloriePercent >= CELEBRATION_THRESHOLD && meals.length > 0 && !wx.getStorageSync(storageKey)) {
          this.setData({ showCelebration: true })
          wx.setStorageSync(storageKey, true)
          setTimeout(() => this.setData({ showCelebration: false }), 3000)
        }

        // P1: 请求成功且数据落地后再更新 TTL；失败不更新，以便下一次 onShow 重试
        this._lastLoadTs = Date.now()
        this._lastLoadDate = today
      }
    } catch (err) {
      // 过期请求的报错不记录，避免干扰最新请求
      if (token !== this._loadToken) return
      logger.error('loadData', err)
    }
  },

  drawRings() {
    const targets = this.data.targets
    const current = this.data.dailySummary
    const isLose = this.data.goalType === 'lose'

    if (isLose) {
      this.drawSingleRing('loseCalorieCanvas', current.total_calorie, targets.calorie, this.data.overLimit)
      this.drawSingleRing('loseStepsCanvas', this.data.werunSteps, this.data.loseStepsTarget, false)
      return
    }

    this.drawSingleRing('calorieCanvas', current.total_calorie, targets.calorie, false)
    this.drawSingleRing('proteinCanvas', current.total_protein_g, targets.protein, false)
  },

  drawSingleRing(canvasId, current, target, overLimit) {
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

      const isCalorie = canvasId === 'calorieCanvas' || canvasId === 'loseCalorieCanvas'
      const trackColor = isCalorie ? '#FFE8D0' : '#D8F5E0'
      // 减重超标：热量环填充色切换为警示红；其余维持原配色
      const fillColor = overLimit ? '#FF4D4F' : (isCalorie ? '#FF7A2F' : '#2ECC71')

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
        ctx.strokeStyle = overLimit ? '#FF4D4F' : (isCalorie ? '#FF7A2F' : '#2ECC71')
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

  async loadGoalProgress(token) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getGoalProgress'
      })

      // P2: 旧请求返回时丢弃，不覆盖最新结果
      if (token !== this._loadToken) return

      if (res.result.code === 0) {
        const d = res.result.data
        const progress = Math.max(0, Math.min(d.progress_percent, 100))
        const fmtW = v => Number(v).toFixed(2)
        const goalType = util.normalizeGoalType(d.goal_type)
        const currentWeight = Number(d.current_weight)
        const targetWeight = Number(d.target_weight)

        // BMI 状态标签：依赖身高（globalData.userInfo）与当前体重
        const heightCm = app.globalData.userInfo && app.globalData.userInfo.height_cm
        let bmiValue = ''
        let bmiStatus = ''
        let bmiLevel = ''
        if (heightCm && currentWeight) {
          const bv = util.calcBMI(currentWeight, heightCm)
          bmiValue = bv.toFixed(1)
          const tag = this.classifyBmi(bv)
          bmiStatus = tag.status
          bmiLevel = tag.level
        }

        // 目标进度文案：按方向生成，避免"距目标还差 -20 kg"的负号别扭显示
        let targetProgressText
        if (d.achieved) {
          targetProgressText = '已成功达标 🎉'
        } else if (goalType === 'lose' && currentWeight > targetWeight) {
          targetProgressText = '还需减重 ' + Math.abs(currentWeight - targetWeight).toFixed(2) + ' kg'
        } else if (goalType === 'gain' && currentWeight < targetWeight) {
          targetProgressText = '还需增重 ' + Math.abs(currentWeight - targetWeight).toFixed(2) + ' kg'
        } else {
          targetProgressText = '已成功达标 🎉'
        }

        this.setData({
          targetProgressText,
          bmiValue,
          bmiStatus,
          bmiLevel,
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
      // 过期请求的报错不记录，避免干扰最新请求
      if (token !== this._loadToken) return
      logger.error('loadGoalProgress', err)
    }
  },

  goToGoalDetail() {
    wx.navigateTo({ url: '/pages/goal-detail/goal-detail' })
  },

  goToOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  goToLogFood() {
    wx.navigateTo({ url: '/pages/log-food/log-food' })
  },

  onTapYuefan() {
    wx.navigateTo({ url: '/pages/daily-menu/daily-menu?view=poi' })
  },

  goToDailyMenu() {
    wx.navigateTo({ url: '/pages/daily-menu/daily-menu' })
  },

  goToSteps() {
    wx.navigateTo({ url: '/pages/steps/steps' })
  },

  goToFasting() {
    wx.navigateTo({ url: '/pages/fasting/fasting' })
  },

  goToCoach() {
    wx.navigateTo({ url: '/pages/coach/coach' })
  },

  // 减重模式每日步数目标：优先读用户配置 users.steps_goal，缺省 8000
  resolveStepsTarget() {
    const u = app.globalData.userInfo || {}
    const custom = Number(u.steps_goal) || 0
    return custom > 0 ? custom : LOSE_STEPS_TARGET_DEFAULT
  },

  // Lose 模式：读取微信步数并换算消耗（未授权降级为 0，不影响页面渲染）
  loadWerunForLose() {
    const goalType = util.normalizeGoalType(app.globalData.userInfo && app.globalData.userInfo.goal_type)
    if (goalType !== 'lose') return
    wx.getSetting({
      success: (res) => {
        if (!(res.authSetting && res.authSetting['scope.werun'])) return
        wx.getWeRunData({
          success: (r) => {
            wx.cloud.callFunction({
              name: 'stepsSync',
              data: { stepCloud: wx.cloud.CloudID(r.cloudID) }
            }).then(cr => {
              const d = (cr.result && cr.result.code === 0 && cr.result.data) ? cr.result.data : { steps: 0, calorie: 0 }
              this.setData({ werunSteps: d.steps, werunCalorie: d.calorie }, () => {
                this.drawSingleRing('loseStepsCanvas', d.steps, this.data.loseStepsTarget, false)
              })
            }).catch(() => {})
          }
        })
      }
    })
  },

  goToStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  // Lose 模式：读取断食状态（本地偏移 + 绝对时间计算），供首页单行微型状态条展示
  loadFastingState() {
    const goalType = util.normalizeGoalType(app.globalData.userInfo && app.globalData.userInfo.goal_type)
    if (goalType !== 'lose') {
      this.setData({ fastingState: null })
      return
    }
    const offsetMin = Number(wx.getStorageSync('fasting_offset_min')) || 0
    const r = util.calcFastingStatus(Date.now(), offsetMin)
    this.setData({
      fastingState: {
        isEating: r.isEating,
        remainTimeStr: this.formatFastRemain(r.remainMs)
      }
    })
  },

  // 剩余时长人性化格式（如「2 小时 30 分」「45 分钟」）
  formatFastRemain(ms) {
    const totalMin = Math.max(0, Math.round(ms / 60000))
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60)
      const m = totalMin % 60
      return m > 0 ? h + ' 小时 ' + m + ' 分' : h + ' 小时'
    }
    return totalMin + ' 分钟'
  },

  goToProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  }
})
