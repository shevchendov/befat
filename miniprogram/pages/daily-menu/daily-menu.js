const logger = require('../../utils/logger')
const FAV_KEY = 'dailyMenuFavorites'
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', snack: '加餐', dinner: '晚餐' }

Page({
  data: {
    isGenerating: true,
    refreshing: false,
    date: '',
    meals: [],
    total_calorie: 0,
    total_protein_g: 0,
    generated_by: '',
    fromFallback: false
  },

  onLoad() {
    this.loadMenu(false)
  },

  readFavMap() {
    try {
      return wx.getStorageSync(FAV_KEY) || {}
    } catch (e) {
      return {}
    }
  },

  async loadMenu(forceRefresh) {
    if (forceRefresh) {
      this.setData({ refreshing: true })
    } else {
      this.setData({ isGenerating: true })
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDailyMenu',
        data: forceRefresh ? { forceRefresh: true } : {}
      })
      const result = res.result

      if (result.code === 94) {
        wx.showToast({ title: '今日换一换次数已用完', icon: 'none' })
        this.setData({ refreshing: false, isGenerating: false })
        return
      }

      if (result.code !== 0 && result.code !== 93) {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        this.setData({ refreshing: false, isGenerating: false })
        return
      }

      const d = result.data || {}
      const favMap = this.readFavMap()
      const meals = (d.meals || []).map(m => ({
        meal_type: m.meal_type,
        mealLabel: MEAL_LABELS[m.meal_type] || m.meal_type,
        title: m.title || '',
        calorie: m.calorie,
        protein_g: m.protein_g,
        ingredients: m.ingredients || [],
        steps: m.steps || [],
        favorited: !!favMap[(m.title || '') + '|' + m.meal_type]
      }))

      this.setData({
        date: d.date,
        meals,
        total_calorie: d.total_calorie,
        total_protein_g: d.total_protein_g,
        generated_by: d.generated_by,
        fromFallback: !!d.from_fallback,
        isGenerating: false,
        refreshing: false
      })
    } catch (err) {
      logger.error('loadMenu', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ isGenerating: false, refreshing: false })
    }
  },

  refreshMenu() {
    if (this.data.refreshing || this.data.isGenerating) return
    this.loadMenu(true)
  },

  async toggleFav(e) {
    const idx = e.currentTarget.dataset.index
    const meal = this.data.meals[idx]
    if (!meal) return
    const key = meal.title + '|' + meal.meal_type
    const wasFav = meal.favorited

    this.setData({ ['meals[' + idx + '].favorited']: !wasFav })

    try {
      const res = await wx.cloud.callFunction({
        name: 'toggleFavoriteRecipe',
        data: {
          recipe_snapshot: {
            title: meal.title,
            meal_type: meal.meal_type,
            calorie: meal.calorie,
            protein_g: meal.protein_g,
            ingredients: meal.ingredients,
            steps: meal.steps,
            date: this.data.date
          }
        }
      })

      if (res.result.code !== 0) {
        this.setData({ ['meals[' + idx + '].favorited']: wasFav })
        wx.showToast({ title: '操作失败', icon: 'none' })
        return
      }

      const map = this.readFavMap()
      if (wasFav) {
        delete map[key]
      } else {
        map[key] = true
      }
      wx.setStorageSync(FAV_KEY, map)
    } catch (err) {
      this.setData({ ['meals[' + idx + '].favorited']: wasFav })
      logger.error('toggleFav', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})