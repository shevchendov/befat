const logger = require('../../utils/logger')

Page({
  data: {
    recipes: [],
    filteredRecipes: [],
    tags: [],
    selectedTag: '',
    loading: true
  },

  onShow() {
    this.loadRecipes()
  },

  async loadRecipes() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('recipes').get()
      const recipes = res.data
      const tagSet = new Set()
      recipes.forEach(r => {
        if (r.tags) r.tags.forEach(t => tagSet.add(t))
      })

      this.setData({
        recipes,
        filteredRecipes: recipes,
        tags: Array.from(tagSet),
        loading: false
      })
    } catch (err) {
      logger.error('loadRecipes', err)
      this.setData({ loading: false })
    }
  },

  filterByTag(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({ selectedTag: tag })

    if (!tag) {
      this.setData({ filteredRecipes: this.data.recipes })
      return
    }

    const filtered = this.data.recipes.filter(r => r.tags && r.tags.includes(tag))
    this.setData({ filteredRecipes: filtered })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/recipe-detail/recipe-detail?id=' + id
    })
  }
})
