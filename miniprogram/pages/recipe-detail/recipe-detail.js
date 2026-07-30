const logger = require('../../utils/logger')

Page({
  data: {
    recipe: null,
    loading: true,
    favorited: false
  },

  onLoad(options) {
    if (options.id) {
      this.recipeId = options.id
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
      this.checkFavorited()
    } catch (err) {
      logger.error('loadRecipe', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async checkFavorited() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getFavorites' })
      if (res.result.code === 0) {
        const ids = res.result.data.recipes.map(r => r._id)
        this.setData({ favorited: ids.includes(this.recipeId) })
      }
    } catch (err) {
      logger.error('checkFavorited', err)
    }
  },

  async toggleFav() {
    const wasFav = this.data.favorited
    this.setData({ favorited: !wasFav })

    try {
      const res = await wx.cloud.callFunction({ name: 'toggleFavorite', data: { recipe_id: this.recipeId } })
      if (res.result.code !== 0) {
        this.setData({ favorited: !!wasFav })
        wx.showToast({ title: '操作失败', icon: 'none' })
      }
    } catch (err) {
      this.setData({ favorited: !!wasFav })
      logger.error('toggleFav', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
