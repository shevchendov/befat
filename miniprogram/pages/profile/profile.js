const app = getApp()
const util = require('../../utils/util')
const logger = require('../../utils/logger')

// ============ BMI 范围条常量 ============
// 展示域取 14~30：将 BMI 值映射为条形图上的百分比位置。
// 14 略低于极低 BMI 红线（util.getHealthWarning 中 <16 为 danger），
// 30 覆盖严重偏高端，使正常区间 18.5~24 落在条形图中部、比例合理。
// 分界值 18.5 / 24 与 util.getHealthWarning 的档位阈值严格一致。
// 段宽百分比、分界数值位置均由这两个边界值推导，勿单独改动某一处。
const BMI_DISPLAY_MIN = 14
const BMI_DISPLAY_MAX = 30
const BMI_UNDER = 18.5
const BMI_NORMAL = 24
// 游标钳制范围 [2%, 98%]：极端 BMI（<14 或 >30）时游标贴条形两端内侧，
// 保证游标不跑出可视区域；代价是极值位置略有偏差（可接受）。
const MARKER_CLAMP_MIN = 2
const MARKER_CLAMP_MAX = 98
// getGoalProgress 结果 30s TTL 缓存（配额优化）：返回本页时体重数据基本不变
const DATA_TTL = 30000

Page({
  data: {
    user: null,
    bmi: null,
    healthWarning: {},
    activityLabel: '',
    showHealthInfo: false,
    bmiBar: null,
    markerLeft: null,
    bound18: null,
    bound24: null
  },

  onShow() {
    this.loadUserData()
  },

  async loadUserData() {
    try {
      const db = wx.cloud.database()
      const now = Date.now()
      const cached = this._gpCache && now - this._gpCache.ts < DATA_TTL
      const [res, gpResult] = await Promise.all([
        db.collection('users').where({ _openid: '{openid}' }).get(),
        // getGoalProgress 仅用于取"当前体重"，失败不阻断档案加载（回退 users.current_weight_kg）
        cached
          ? Promise.resolve(this._gpCache.value)
          : wx.cloud.callFunction({ name: 'getGoalProgress' })
              .then(gpRes => (gpRes.result && gpRes.result.code === 0 ? gpRes.result.data : null))
              .catch(() => null)
      ])
      // 只缓存成功的 getGoalProgress 结果；失败/无数据不缓存，避免掩盖瞬时故障
      if (!cached && gpResult) this._gpCache = { ts: now, value: gpResult }
      // 已初始化（填过目标）才展示档案；重置后的文档 target_weight_kg 为空，
      // 按无用户处理，避免展示全空档案
      if (res.data.length > 0 && res.data[0].target_weight_kg != null) {
        const user = res.data[0]
        // 当前体重：优先取 getGoalProgress 返回的最新体重打卡记录（与首页目标进度卡同源，
        // 无打卡记录时云函数内部已回退到起始体重）；云函数失败时兜底 users.current_weight_kg。
        // users.current_weight_kg 是 onboarding 起始体重快照，打卡不回写，不能直接当"当前体重"用。
        const gp = gpResult
        const currentWeight = gp && gp.current_weight != null ? gp.current_weight : (user.current_weight_kg != null ? user.current_weight_kg : null)

        let bmi = null
        let healthWarning = {}
        let bmiBar = null
        let markerLeft = null
        let bound18 = null
        let bound24 = null
        if (currentWeight != null) {
          bmi = util.calcBMI(currentWeight, user.height_cm)
          healthWarning = util.getHealthWarning(bmi)

          const span = BMI_DISPLAY_MAX - BMI_DISPLAY_MIN
          const pctUnder = (BMI_UNDER - BMI_DISPLAY_MIN) / span * 100
          const pctNormal = (BMI_NORMAL - BMI_DISPLAY_MIN) / span * 100
          const markerPct = Math.min(MARKER_CLAMP_MAX, Math.max(MARKER_CLAMP_MIN, (bmi - BMI_DISPLAY_MIN) / span * 100))
          bmiBar = {
            under: pctUnder.toFixed(2) + '%',
            normal: (pctNormal - pctUnder).toFixed(2) + '%',
            over: (100 - pctNormal).toFixed(2) + '%'
          }
          markerLeft = markerPct.toFixed(2) + '%'
          bound18 = pctUnder.toFixed(2) + '%'
          bound24 = pctNormal.toFixed(2) + '%'
        }

        this.setData({
          user,
          currentWeightDisplay: currentWeight != null ? Number(currentWeight).toFixed(2) : '--',
          targetWeightDisplay: user.target_weight_kg != null ? Number(user.target_weight_kg).toFixed(2) : '--',
          bmi: bmi != null ? bmi.toFixed(1) : null,
          healthWarning,
          bmiBar,
          markerLeft,
          bound18,
          bound24,
          activityLabel: util.getActivityLevelLabel(user.activity_level)
        })

        app.globalData.userInfo = user
        app.globalData.dailyTargets = {
          calorie: user.daily_calorie_target,
          protein: user.daily_protein_target_g
        }
      }
    } catch (err) {
      logger.error('loadUserData', err)
    }
  },

  goToOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
  },

  subscribeReminder() {
    const templateId = '请替换为你的微信订阅消息模板ID'
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(res) {
        if (res[templateId] === 'accept') {
          wx.showToast({ title: '提醒开启成功', icon: 'success' })
        }
      },
      fail(err) {
        wx.showToast({ title: '订阅失败，请在设置中开启', icon: 'none' })
      }
    })
  },

  toggleHealthInfo() {
    this.setData({ showHealthInfo: !this.data.showHealthInfo })
  },

  async exportData() {
    wx.showLoading({ title: '导出中...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'exportUserData' })
      wx.hideLoading()

      if (res.result.code === 0) {
        const dataStr = JSON.stringify(res.result.data, null, 2)
        const fs = wx.getFileSystemManager()
        const filePath = wx.env.USER_DATA_PATH + '/befat_export_' + util.formatDate(new Date()) + '.json'
        fs.writeFileSync(filePath, dataStr, 'utf8')

        wx.openDocument({
          filePath,
          showMenu: true,
          success() {
            wx.showToast({ title: '导出成功', icon: 'success' })
          }
        })
      } else {
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      logger.error('exportData', err)
      wx.showToast({ title: '导出异常', icon: 'none' })
    }
  },

  confirmResetData() {
    wx.showModal({
      title: '重置为新用户',
      content: '将清空所有目标、打卡和收藏数据，但保留账号，需要重新设置目标。此操作不可恢复！',
      confirmText: '重置',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          this.resetUserData()
        }
      }
    })
  },

  async resetUserData() {
    wx.showLoading({ title: '重置中...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'resetUserData', data: { confirm: true } })
      wx.hideLoading()
      if (res.result.code === 0) {
        app.globalData.userInfo = null
        app.globalData.dailyTargets = null

        wx.showToast({ title: '已重置', icon: 'success' })
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/onboarding/onboarding' })
        }, 1500)
      } else {
        wx.showToast({ title: res.result.message || '重置失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      logger.error('resetUserData', err)
      wx.showToast({ title: '重置异常', icon: 'none' })
    }
  },

  confirmDeleteData() {
    wx.showModal({
      title: '警告',
      content: '确定要删除所有数据吗？此操作不可恢复！',
      confirmText: '删除',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          this.deleteUserData()
        }
      }
    })
  },

  async deleteUserData() {
    wx.showLoading({ title: '删除中...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'deleteUserData' })
      wx.hideLoading()
      if (res.result.code === 0) {
        app.globalData.userInfo = null
        app.globalData.dailyTargets = null

        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/onboarding/onboarding' })
        }, 1500)
      } else {
        wx.showToast({ title: '删除失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      logger.error('deleteUserData', err)
      wx.showToast({ title: '删除异常', icon: 'none' })
    }
  }
})
