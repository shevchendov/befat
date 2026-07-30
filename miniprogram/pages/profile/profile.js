const app = getApp()
const util = require('../../utils/util')
const logger = require('../../utils/logger')

Page({
  data: {
    user: null,
    bmi: null,
    healthWarning: {},
    activityLabel: '',
    showHealthInfo: false
  },

  onShow() {
    this.loadUserData()
  },

  async loadUserData() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('users').where({ _openid: '{openid}' }).get()
      if (res.data.length > 0) {
        const user = res.data[0]
        const bmi = util.calcBMI(user.current_weight_kg, user.height_cm)
        const healthWarning = util.getHealthWarning(bmi)

        this.setData({
          user,
          bmi: bmi.toFixed(1),
          healthWarning,
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

  goToFavorites() {
    wx.navigateTo({ url: '/pages/my-favorites/my-favorites' })
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
