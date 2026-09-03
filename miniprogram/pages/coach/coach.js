const util = require('../../utils/util')
const logger = require('../../utils/logger')

Page({
  data: {
    loading: true,
    tips: [],
    errorMsg: ''
  },

  onLoad() {
    this.loadCoach()
  },

  // 聚合行为数据 → getDailyMenu(goal_type=lose + behaviors) → 渲染诊断建议
  async loadCoach() {
    this.setData({ loading: true, errorMsg: '' })
    try {
      const today = util.formatDate(new Date())

      const [summaryRes, goalRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'getDailySummary', data: { date: today } }),
        wx.cloud.callFunction({ name: 'getGoalProgress' })
      ])

      const summary = (summaryRes.result && summaryRes.result.code === 0) ? summaryRes.result.data : {}
      const goal = (goalRes.result && goalRes.result.code === 0) ? goalRes.result.data : {}

      // 热量缺口：目标 - 已摄入（正=还可吃，负=超标）
      const target = Number(summary.target_calorie) || 0
      const total = Number(summary.total_calorie) || 0
      const calorieGap = target > 0 ? target - total : 0

      // 红绿灯比例：从今日 food_logs 统计（此处用 getDailySummary 返回的 items 聚合，若无则回退空比例）
      const trafficRatio = this.aggregateTraffic(summary)

      // 断食状态：与 fasting 页同源（本地偏移 storage + 绝对时间计算），userInfo 无 fasting_state 字段
      const fastOffset = Number(wx.getStorageSync('fasting_offset_min')) || 0
      const fast = util.calcFastingStatus(Date.now(), fastOffset)

      const behaviors = [
        `今日红绿灯比例：绿 ${trafficRatio.green}%、黄 ${trafficRatio.yellow}%、红 ${trafficRatio.red}%`,
        `今日步数：${goal.steps || 0} 步`,
        `今日热量缺口：${calorieGap > 0 ? '还可吃 ' + calorieGap : '已超标 ' + Math.abs(calorieGap)} kcal`,
        `轻断食：${fast.isEating ? '进食窗口进行中' : '断食进行中'}`
      ].join('；')

      const res = await wx.cloud.callFunction({
        name: 'getDailyMenu',
        data: { goal_type: 'lose', behaviors }
      })

      const d = res.result && res.result.data
      this.setData({ loading: false, tips: (d && d.tips) || [] })
    } catch (err) {
      logger.error('coach loadCoach', err)
      this.setData({ loading: false, errorMsg: '教练建议生成失败，请稍后重试' })
    }
  },

  // 从 getDailySummary 返回的数据聚合红绿灯比例（缺字段则 0）
  aggregateTraffic(summary) {
    const r = { green: 0, yellow: 0, red: 0 }
    const meals = summary.meals || {}
    let g = 0, y = 0, rd = 0
    Object.keys(meals).forEach(type => {
      (meals[type] || []).forEach(log => {
        ;(log.parsed_items || []).forEach(it => {
          if (it.traffic_light === 'green') g++
          else if (it.traffic_light === 'yellow') y++
          else if (it.traffic_light === 'red') rd++
        })
      })
    })
    const total = g + y + rd
    if (total > 0) {
      r.green = Math.round(g / total * 100)
      r.yellow = Math.round(y / total * 100)
      r.red = Math.round(rd / total * 100)
    }
    return r
  },

  onRetry() {
    this.loadCoach()
  }
})