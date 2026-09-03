const util = require('../../utils/util')
const app = getApp()

const FASTING_OFFSET_KEY = 'fasting_offset_min'

Page({
  data: {
    isEating: false,
    remainText: '',
    elapsedText: '',
    progressPct: 0,
    phase: { title: '', desc: '' },
    offsetMin: 0,
    nowMs: 0
  },

  onLoad() {
    this._offset = Number(wx.getStorageSync(FASTING_OFFSET_KEY)) || 0
    this.setData({ offsetMin: this._offset })
  },

  onShow() {
    this.tick()
    this._timer = setInterval(() => this.tick(), 1000)
  },

  onHide() {
    if (this._timer) clearInterval(this._timer)
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
  },

  tick() {
    const now = new Date().getTime()
    const r = util.calcFastingStatus(now, this.data.offsetMin)
    // 断食进度：已断食时长 / 16h；进食期 elapsedFastingMs 为 0，进度归零
    const totalMs = 16 * 3600 * 1000
    const doneMs = Math.max(0, Math.min(totalMs, r.elapsedFastingMs))
    this.setData({
      nowMs: now,
      isEating: r.isEating,
      remainText: this.formatDuration(r.remainMs),
      elapsedText: this.formatDuration(r.elapsedFastingMs),
      progressPct: Math.round(doneMs / totalMs * 100),
      phase: r.phase
    })
  },

  formatDuration(ms) {
    if (ms < 0) ms = 0
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },

  onOffsetChange(e) {
    this._offset = Number(e.detail.value) || 0
    wx.setStorageSync(FASTING_OFFSET_KEY, this._offset)
    this.setData({ offsetMin: this._offset })
    this.tick()
  }
})