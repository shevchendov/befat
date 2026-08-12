const logger = require('../../utils/logger')
const app = getApp()

// getFavorites 结果 30s TTL 缓存（配额优化），共享给 recipe-list/my-favorites/recipe-detail
const FAV_TTL = 30000

Page({
  data: {
    recipes: [],
    filteredRecipes: [],
    tags: [],
    selectedTag: '',
    loading: true,
    favoritedIds: {}
  },

  _sortFavFirst(list) {
    const ids = this.data.favoritedIds
    return [...list].sort((a, b) => {
      if (ids[a._id] && !ids[b._id]) return -1
      if (!ids[a._id] && ids[b._id]) return 1
      return 0
    })
  },

  onShow() {
    this.loadRecipes()
    this.loadFavorites()
  },

  async loadRecipes() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getPublishedRecipes',
        data: { limit: 100 }
      })
      if (res.result.code !== 0) {
        logger.error('loadRecipes', res.result)
        this.setData({ loading: false })
        return
      }
      const recipes = (res.result.data.list || []).map(r => ({ ...r, _id: r.id }))
      const tagSet = new Set()
      recipes.forEach(r => {
        if (r.tags) r.tags.forEach(t => tagSet.add(t))
      })

      this.setData({
        recipes,
        filteredRecipes: this._sortFavFirst(recipes),
        tags: Array.from(tagSet),
        loading: false
      })
    } catch (err) {
      logger.error('loadRecipes', err)
      this.setData({ loading: false })
    }
  },

  async loadFavorites() {
    try {
      const cached = app.globalData.favoritesCache
      if (cached && Array.isArray(cached.recipes) && Date.now() - cached.ts < FAV_TTL) {
        this.applyFavorites(cached.recipes)
        return
      }
      const res = await wx.cloud.callFunction({ name: 'getFavorites' })
      if (res.result.code === 0 && Array.isArray(res.result.data.recipes)) {
        app.globalData.favoritesCache = { ts: Date.now(), recipes: res.result.data.recipes }
        this.applyFavorites(res.result.data.recipes)
      }
    } catch (err) {
      logger.error('loadFavorites', err)
    }
  },

  applyFavorites(recipes) {
    const ids = {}
    recipes.forEach(r => { ids[r._id] = true })
    this.setData({ favoritedIds: ids })
    if (this.data.selectedTag === '__favorites__') {
      const filtered = this.data.recipes.filter(r => ids[r._id])
      this.setData({ filteredRecipes: filtered })
    } else {
      this.setData({ filteredRecipes: this._sortFavFirst(this.data.filteredRecipes) })
    }
  },

  filterByTag(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({ selectedTag: tag })

    if (tag === '__favorites__') {
      const filtered = this.data.recipes.filter(r => this.data.favoritedIds[r._id])
      this.setData({ filteredRecipes: filtered })
      return
    }

    if (!tag) {
      this.setData({ filteredRecipes: this._sortFavFirst(this.data.recipes) })
      return
    }

    const filtered = this.data.recipes.filter(r => r.tags && r.tags.includes(tag))
    this.setData({ filteredRecipes: this._sortFavFirst(filtered) })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/recipe-detail/recipe-detail?id=' + id
    })
  },

  async toggleFav(e) {
    const id = e.currentTarget.dataset.id
    const wasFav = this.data.favoritedIds[id]

    this.setData({ ['favoritedIds.' + id]: !wasFav })

    try {
      const res = await wx.cloud.callFunction({ name: 'toggleFavorite', data: { recipe_id: id } })
      if (res.result.code !== 0) {
        this.setData({ ['favoritedIds.' + id]: !!wasFav })
        wx.showToast({ title: '操作失败', icon: 'none' })
      } else {
        app.globalData.favoritesCache = null
        if (this.data.selectedTag === '__favorites__' && wasFav) {
          const filtered = this.data.filteredRecipes.filter(r => r._id !== id)
          this.setData({ filteredRecipes: filtered })
        } else {
          this.setData({ filteredRecipes: this._sortFavFirst(this.data.filteredRecipes) })
        }
      }
    } catch (err) {
      this.setData({ ['favoritedIds.' + id]: !!wasFav })
      logger.error('toggleFav', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
