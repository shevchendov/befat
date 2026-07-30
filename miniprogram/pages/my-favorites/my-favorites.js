const logger = require('../../utils/logger')

Page({
  data: {
    recipes: [],
    loading: true
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'getFavorites' })
      if (res.result.code === 0) {
        this.setData({ recipes: res.result.data.recipes, loading: false })
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      logger.error('loadFavorites', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/recipe-detail/recipe-detail?id=' + id
    })
  },

  async removeFav(e) {
    const id = e.currentTarget.dataset.id

    try {
      const res = await wx.cloud.callFunction({ name: 'toggleFavorite', data: { recipe_id: id } })
      if (res.result.code === 0) {
        const recipes = this.data.recipes.filter(r => r._id !== id)
        this.setData({ recipes })
      } else {
        wx.showToast({ title: '操作失败', icon: 'none' })
      }
    } catch (err) {
      logger.error('removeFav', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
