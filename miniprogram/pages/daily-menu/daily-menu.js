const logger = require('../../utils/logger')
const { getUserLocation } = require('../../utils/location')
const { searchNearbyPoi } = require('../../utils/map')
const FAV_KEY = 'dailyMenuFavorites'
const FAV_CACHE_KEY = 'favoriteMenuCache'
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
    fromFallback: false,
    drawerVisible: false,
    favLoading: false,
    favTab: 'all',
    favList: [],
    favTotal: 0,
    favHasMore: false,
    currentView: 'recipe',
    poiLoading: false,
    poiLoadMore: false,
    poiError: false,
    poiMsg: '',
    poiList: [],
    poiTotal: 0,
    poiSearch: '',
    poiResolved: '',
    searchTags: ['清淡粤菜', '地道茶楼', '海鲜大排档']
  },

  onLoad() {
    this._poiReqId = 0
    this._searchTimer = null
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
        favorited: !!favMap[(m.title || '') + '|' + m.meal_type],
        expanded: false,
        detailLoading: false
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

  async toggleDetail(e) {
    const idx = e.currentTarget.dataset.index
    const meal = this.data.meals[idx]
    if (!meal) return

    if (meal.expanded) {
      this.setData({ ['meals[' + idx + '].expanded']: false })
      return
    }

    if (meal.ingredients && meal.ingredients.length > 0 && meal.steps && meal.steps.length > 0) {
      this.setData({ ['meals[' + idx + '].expanded']: true })
      return
    }

    this.setData({ ['meals[' + idx + '].detailLoading']: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMealDetail',
        data: {
          date: this.data.date,
          meal_type: meal.meal_type,
          title: meal.title,
          calorie: meal.calorie,
          protein_g: meal.protein_g
        }
      })
      const result = res.result

      if (result.code === 0) {
        this.setData({
          ['meals[' + idx + '].ingredients']: result.data.ingredients || [],
          ['meals[' + idx + '].steps']: result.data.steps || [],
          ['meals[' + idx + '].expanded']: true
        })
      } else {
        wx.showToast({ title: result.message || '详情加载失败', icon: 'none' })
      }
    } catch (err) {
      logger.error('toggleDetail', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      this.setData({ ['meals[' + idx + '].detailLoading']: false })
    }
  },

  async toggleFav(e) {
    const idx = e.currentTarget.dataset.index
    const meal = this.data.meals[idx]
    if (!meal) return
    const key = meal.title + '|' + meal.meal_type
    const wasFav = meal.favorited
    const failMsg = wasFav ? '取消收藏失败' : '收藏失败'

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
        wx.showToast({ title: failMsg, icon: 'none' })
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
      wx.showToast({ title: failMsg, icon: 'none' })
    }
  },

  readFavCache() {
    try {
      return wx.getStorageSync(FAV_CACHE_KEY) || null
    } catch (e) {
      return null
    }
  },

  writeFavCache(list) {
    try {
      const clean = (list || []).map(f => ({
        title: f.title,
        meal_type: f.meal_type,
        calorie: f.calorie,
        protein_g: f.protein_g,
        ingredients: f.ingredients || [],
        steps: f.steps || [],
        date: f.date,
        created_at: f.created_at
      }))
      wx.setStorageSync(FAV_CACHE_KEY, { ts: Date.now(), list: clean })
    } catch (e) {
      logger.error('writeFavCache', e)
    }
  },

  buildFavQuery() {
    if (this.data.favTab === 'breakfast') return { meal_type: 'breakfast' }
    if (this.data.favTab === 'lunchdinner') return { meal_types: ['lunch', 'dinner'] }
    if (this.data.favTab === 'snack') return { meal_type: 'snack' }
    return { meal_type: 'all' }
  },

  decorateFavList(list) {
    return (list || []).map(f => ({
      ...f,
      mealLabel: MEAL_LABELS[f.meal_type] || f.meal_type,
      expanded: false,
      loading: false
    }))
  },

  openFavoriteDrawer() {
    if (this.data.drawerVisible) return
    this.setData({ drawerVisible: true, favLoading: true, favList: [] })
    this.fetchFavorites()
  },

  closeFavoriteDrawer() {
    this.setData({ drawerVisible: false })
  },

  async fetchFavorites() {
    try {
      const query = this.buildFavQuery()
      const res = await wx.cloud.callFunction({
        name: 'getFavorites',
        data: { ...query, page: 1, limit: 100 }
      })
      if (res.result.code === 0) {
        const d = res.result.data || {}
        this.setData({
          favList: this.decorateFavList(d.list),
          favTotal: d.total || 0,
          favHasMore: !!d.has_more
        })
        this.writeFavCache(d.list)
        this.syncHomeFavorited(d.list)
      }
    } catch (err) {
      logger.error('fetchFavorites', err)
    } finally {
      this.setData({ favLoading: false })
    }
  },

  syncHomeFavorited(dbList) {
    const dbKeys = new Set((dbList || []).map(f => f.title + '|' + f.meal_type))
    const map = this.readFavMap()

    let mealsChanged = false
    const meals = this.data.meals.map(m => {
      const key = (m.title || '') + '|' + m.meal_type
      if (m.favorited && !dbKeys.has(key)) {
        mealsChanged = true
        return { ...m, favorited: false }
      }
      return m
    })
    if (mealsChanged) {
      this.setData({ meals })
    }

    const newMap = {}
    let mapChanged = false
    Object.keys(map).forEach(k => {
      if (dbKeys.has(k)) {
        newMap[k] = true
      } else {
        mapChanged = true
      }
    })
    if (mapChanged) {
      wx.setStorageSync(FAV_KEY, newMap)
    }
  },

  switchFavTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.favTab) return
    this.setData({ favTab: tab, favLoading: true, favList: [] })
    this.fetchFavorites()
  },

  async toggleDrawerDetail(e) {
    const idx = e.currentTarget.dataset.index
    const fav = this.data.favList[idx]
    if (!fav) return

    if (fav.expanded) {
      this.setData({ ['favList[' + idx + '].expanded']: false })
      return
    }

    if (fav.ingredients && fav.ingredients.length > 0 && fav.steps && fav.steps.length > 0) {
      this.setData({ ['favList[' + idx + '].expanded']: true })
      return
    }

    this.setData({ ['favList[' + idx + '].loading']: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMealDetail',
        data: {
          date: fav.date || this.data.date,
          meal_type: fav.meal_type,
          title: fav.title,
          calorie: fav.calorie,
          protein_g: fav.protein_g
        }
      })
      const result = res.result

      if (result.code === 0) {
        const ingredients = result.data.ingredients || []
        const steps = result.data.steps || []
        this.setData({
          ['favList[' + idx + '].ingredients']: ingredients,
          ['favList[' + idx + '].steps']: steps,
          ['favList[' + idx + '].loading']: false,
          ['favList[' + idx + '].expanded']: true
        })
        this.writeFavCache(this.data.favList)
        wx.cloud.callFunction({
          name: 'updateFavoriteDetail',
          data: { recipe_title: fav.title, meal_type: fav.meal_type, ingredients, steps }
        }).catch(() => {})
      } else {
        this.setData({ ['favList[' + idx + '].loading']: false })
        wx.showToast({ title: result.message || '详情生成失败', icon: 'none' })
      }
    } catch (err) {
      this.setData({ ['favList[' + idx + '].loading']: false })
      logger.error('toggleDrawerDetail', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  async removeFavFromDrawer(e) {
    const idx = e.currentTarget.dataset.index
    const fav = this.data.favList[idx]
    if (!fav) return

    const originalList = this.data.favList
    const originalTotal = this.data.favTotal
    this.setData({
      favList: originalList.filter((_, i) => i !== idx),
      favTotal: Math.max(0, originalTotal - 1)
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'toggleFavoriteRecipe',
        data: {
          recipe_snapshot: {
            title: fav.title,
            meal_type: fav.meal_type,
            calorie: fav.calorie,
            protein_g: fav.protein_g,
            ingredients: fav.ingredients || [],
            steps: fav.steps || [],
            date: fav.date || this.data.date
          }
        }
      })

      if (res.result.code !== 0) {
        throw new Error('toggle failed')
      }

      const key = fav.title + '|' + fav.meal_type
      const map = this.readFavMap()
      delete map[key]
      wx.setStorageSync(FAV_KEY, map)

      const meals = this.data.meals.map(m => {
        if (m.title === fav.title && m.meal_type === fav.meal_type) {
          return { ...m, favorited: false }
        }
        return m
      })
      this.setData({ meals })
      this.writeFavCache(this.data.favList)
    } catch (err) {
      this.setData({ favList: originalList, favTotal: originalTotal })
      logger.error('removeFavFromDrawer', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  switchView(e) {
    const view = e.currentTarget.dataset.view
    if (view === this.data.currentView) return
    this.setData({ currentView: view })
    if (view === 'poi' && this.data.poiList.length === 0 && !this.data.poiLoading) {
      this.loadPoi()
    }
  },

  async loadPoi(searchQuery) {
    const reqId = ++this._poiReqId
    this.setData({ poiLoading: true, poiError: false, poiMsg: '', poiResolved: '' })
    try {
      const loc = await getUserLocation()
      const res = await searchNearbyPoi({ lat: loc.latitude, lng: loc.longitude, page: 1, searchQuery })
      if (reqId !== this._poiReqId) return
      this.setData({
        poiList: res.list || [],
        poiTotal: res.total || 0,
        poiLoading: false,
        poiResolved: res.resolvedTags && res.resolvedTags.reason ? res.resolvedTags.reason : ''
      })
      if (!res.list || res.list.length === 0) {
        this.setData({ poiError: true, poiMsg: '附近没找到，换个词或位置试试' })
      }
    } catch (err) {
      if (reqId !== this._poiReqId) return
      this.setData({ poiLoading: false, poiError: true })
      if (err && err.message === 'NO_LOCATION') {
        this.setData({ poiMsg: '定位失败，可手动选择位置' })
      } else if (err && err.message === 'MAP_TIMEOUT') {
        this.setData({ poiMsg: '网络繁忙，稍后再试' })
      } else {
        this.setData({ poiMsg: '加载失败，请稍后重试' })
      }
    }
  },

  onPoiSearchInput(e) {
    const val = e.detail.value
    this.setData({ poiSearch: val })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (!val || !val.trim()) return
    this._searchTimer = setTimeout(() => {
      this.loadPoi(val.trim())
    }, 400)
  },

  doPoiSearch() {
    const q = this.data.poiSearch.trim()
    if (!q) return
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.loadPoi(q)
  },

  clickPoiTag(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({ poiSearch: tag })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.loadPoi(tag)
  },

  retryPoi() {
    this.loadPoi(this.data.poiSearch.trim() || undefined)
  },

  async loadMorePoi() {
    if (this.data.poiLoadMore) return
    if (this.data.poiList.length >= this.data.poiTotal) return
    const page = Math.floor(this.data.poiList.length / 6) + 1
    this.setData({ poiLoadMore: true })
    try {
      const loc = await getUserLocation()
      const res = await searchNearbyPoi({ lat: loc.latitude, lng: loc.longitude, page })
      this.setData({ poiList: this.data.poiList.concat(res.list || []), poiTotal: res.total || 0 })
    } catch (err) {
      wx.showToast({ title: '加载更多失败', icon: 'none' })
    } finally {
      this.setData({ poiLoadMore: false })
    }
  },

  openPoi(e) {
    const poi = this.data.poiList[e.currentTarget.dataset.index]
    if (!poi) return
    wx.openLocation({ latitude: poi.latitude, longitude: poi.longitude, name: poi.title, address: poi.address })
  },

  callPoi(e) {
    const poi = this.data.poiList[e.currentTarget.dataset.index]
    if (!poi || !poi.tel) return
    wx.makePhoneCall({ phoneNumber: poi.tel })
  }
})