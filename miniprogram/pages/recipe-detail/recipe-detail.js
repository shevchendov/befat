const logger = require('../../utils/logger')
const app = getApp()

// getFavorites 结果 30s TTL 缓存（配额优化），共享给 recipe-list/my-favorites/recipe-detail
const FAV_TTL = 30000

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
      const res = await wx.cloud.callFunction({
        name: 'getRecipeDetail',
        data: { id }
      })
      if (res.result.code !== 0) {
        logger.error('loadRecipe', res.result)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      const recipe = res.result.data
      this.setData({ recipe, loading: false })
      this.checkFavorited()
    } catch (err) {
      logger.error('loadRecipe', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async checkFavorited() {
    try {
      const cached = app.globalData.favoritesCache
      if (cached && Array.isArray(cached.recipes) && Date.now() - cached.ts < FAV_TTL) {
        const ids = cached.recipes.map(r => r.id || r._id)
        this.setData({ favorited: ids.includes(this.recipeId) })
        return
      }
      const res = await wx.cloud.callFunction({ name: 'getFavorites' })
      if (res.result.code === 0 && Array.isArray(res.result.data.recipes)) {
        app.globalData.favoritesCache = { ts: Date.now(), recipes: res.result.data.recipes }
        const ids = res.result.data.recipes.map(r => r.id || r._id)
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
      } else {
        app.globalData.favoritesCache = null
      }
    } catch (err) {
      this.setData({ favorited: !!wasFav })
      logger.error('toggleFav', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
