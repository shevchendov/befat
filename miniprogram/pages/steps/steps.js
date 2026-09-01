const util = require('../../utils/util')
const { searchNearbyPoi } = require('../../utils/map')
const { getUserLocation } = require('../../utils/location')

const app = getApp()

Page({
  data: {
    loading: false,
    authorized: false,
    steps: 0,
    calorie: 0,
    manualStep: '',
    // POI 降级次级卡片
    poiList: [],
    poiError: false,
    poiMsg: '',
    poiLoading: false,
    goalType: 'gain'
  },

  onLoad() {
    const goalType = util.normalizeGoalType(app.globalData.userInfo && app.globalData.userInfo.goal_type)
    this.setData({ goalType })
    this.loadWerun()
  },

  onShow() {
    // 重进页面刷新授权状态与次级 POI
    this.loadWerun()
  },

  // 微信运动步数：CloudID 自动解密，透传 stepsSync 云函数
  loadWerun() {
    const app2 = getApp()
    const goalType = util.normalizeGoalType(app2.globalData.userInfo && app2.globalData.userInfo.goal_type)
    this.setData({ goalType })

    wx.getSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting['scope.werun']) {
          this.fetchWerun()
        } else {
          this.setData({ authorized: false })
          this.loadPoi()
        }
      },
      fail: () => {
        this.setData({ authorized: false })
        this.loadPoi()
      }
    })
  },

  fetchWerun() {
    this.setData({ loading: true })
    wx.getWeRunData({
      success: (res) => {
        wx.cloud.callFunction({
          name: 'stepsSync',
          data: { stepCloud: wx.cloud.CloudID(res.cloudID) }
        }).then(r => {
          const d = (r.result && r.result.code === 0 && r.result.data) ? r.result.data : { steps: 0, calorie: 0 }
          this.setData({ loading: false, authorized: true, steps: d.steps, calorie: d.calorie })
          this.loadPoi()
        }).catch(() => {
          this.setData({ loading: false, authorized: false })
          this.loadPoi()
        })
      },
      fail: () => {
        this.setData({ loading: false, authorized: false })
        this.loadPoi()
      }
    })
  },

  onAuthorizeWerun() {
    wx.authorize({
      scope: 'scope.werun',
      success: () => this.fetchWerun(),
      fail: () => {
        wx.showToast({ title: '未授权，可手动输入步数', icon: 'none' })
        this.setData({ authorized: false })
      }
    })
  },

  onManualStepInput(e) {
    this.setData({ manualStep: e.detail.value })
  },

  onManualStepConfirm() {
    const n = Number(this.data.manualStep)
    if (!n || n <= 0 || n > 100000) {
      wx.showToast({ title: '请输入合理步数', icon: 'none' })
      return
    }
    this.setData({ steps: n, calorie: util.calcCalorieBySteps(n) })
  },

  // 次级 POI 运动场所推荐卡片（复用 getNearbyPoi lose 分支）
  async loadPoi() {
    this.setData({ poiLoading: true, poiError: false })
    try {
      const loc = await getUserLocation()
      const res = await searchNearbyPoi({ lat: loc.latitude, lng: loc.longitude, page: 1, goalType: 'lose' })
      this.setData({ poiList: res.list || [], poiLoading: false })
    } catch (err) {
      this.setData({ poiLoading: false, poiError: true, poiMsg: '附近运动场所加载失败' })
    }
  },

  openPoi(e) {
    const poi = this.data.poiList[e.currentTarget.dataset.index]
    if (!poi) return
    wx.openLocation({ latitude: poi.latitude, longitude: poi.longitude, name: poi.title, address: poi.address })
  }
})