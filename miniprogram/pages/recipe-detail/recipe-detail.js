const logger = require('../../utils/logger')

Page({
  data: {
    recipe: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadRecipe(options.id)
    } else {
      this.setData({ loading: false })
      wx.showToast({ title: '缺少食谱参数', icon: 'none' })
    }
  },

  async loadRecipe(id) {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('recipes').doc(id).get()
      this.setData({ recipe: res.data, loading: false })
    } catch (err) {
      logger.error('loadRecipe', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  }
})
