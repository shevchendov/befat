const util = require('../../utils/util')
const { searchNearbyPoi } = require('../../utils/map')
const { getLocation } = require('../../utils/location')

const app = getApp()

Page({
  data: {
    loading: false,
    authorized: false,
    steps: 0,
    calorie: 0,
    manualStep: '',
    // POI 运动场所次级卡片（idle/denied/loading/error/empty/ready）
    poiList: [],
    poiStatus: 'idle',
    poiMsg: '',
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
    if (this.data.poiStatus === 'loading') return

    const granted = await this.checkLocationAuth()
    if (!granted) {
      this.setData({ poiStatus: 'denied' })
      return
    }

    this.setData({ poiStatus: 'loading' })
    try {
      const loc = await getLocation()
      await this.doSearchPoi(loc)
    } catch (err) {
      this.setData({ poiStatus: 'error', poiMsg: '定位失败，点击重试' })
    }
  },

  // 已获授权后按坐标检索，安全兜底空数组 + 内部捕获错误态
  async doSearchPoi(loc) {
    try {
      const res = await searchNearbyPoi({
        lat: loc.latitude, lng: loc.longitude, page: 1,
        searchQuery: '健身房|体育馆|运动场|公园',
        goalType: 'lose'
      })
      const list = (res && res.list) || []
      this.setData({ poiList: list, poiStatus: list.length > 0 ? 'ready' : 'empty' })
    } catch (err) {
      this.setData({ poiStatus: 'error', poiMsg: '附近运动场所加载失败，点击重试' })
    }
  },

  // 定位授权校验（scope.userFuzzyLocation 模糊定位）
  checkLocationAuth() {
    return new Promise(resolve => {
      wx.getSetting({
        success: res => resolve(!!(res.authSetting && res.authSetting['scope.userFuzzyLocation'])),
        fail: () => resolve(false)
      })
    })
  },

  // 引导开启定位：首次触发系统授权，已拒绝则跳设置页
  onEnableLocation() {
    this.setData({ poiStatus: 'loading' })
    getLocation()
      .then(loc => this.doSearchPoi(loc))
      .catch(() => {
        wx.openSetting({
          success: () => this.loadPoi(),
          fail: () => this.setData({ poiStatus: 'denied' })
        })
      })
  },

  onRetryPoi() {
    this.loadPoi()
  },

  openPoi(e) {
    const poi = this.data.poiList[e.currentTarget.dataset.index]
    if (!poi) return
    wx.openLocation({ latitude: poi.latitude, longitude: poi.longitude, name: poi.title, address: poi.address })
  }
})