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
  }
})
