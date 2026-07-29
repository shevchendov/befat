const logger = require('./utils/logger')

wx.cloud.init({
  env: 'cloud1-d4ghksio8431633f8',
  traceUser: true
})

App({
  globalData: {
    userInfo: null,
    dailyTargets: null
  },

  onLaunch() {
    this.checkUserStatus()
    this.setupGlobalErrorHandler()
  },

  setupGlobalErrorHandler() {
    wx.onError((err) => {
      logger.error('global.onError', err)
    })
    wx.onUnhandledRejection(({ reason }) => {
      logger.error('global.unhandledRejection', reason)
    })
  },

  onError(err) {
    logger.error('app.onError', err)
  },

  checkUserStatus() {
    const db = wx.cloud.database()
    db.collection('users').where({
      _openid: '{openid}'
    }).get().then(res => {
      if (res.data.length > 0) {
        const user = res.data[0]
        this.globalData.userInfo = user
        this.globalData.dailyTargets = {
          calorie: user.daily_calorie_target,
          protein: user.daily_protein_target_g
        }
      }
    }).catch(err => {
      logger.error('checkUserStatus', err)
    })
  }
})
