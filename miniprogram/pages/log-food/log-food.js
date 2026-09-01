const util = require('../../utils/util')
const logger = require('../../utils/logger')
const { sanitizeDigit } = require('../../utils/validators')
const app = getApp()

Page({
  data: {
    mealType: 'lunch',
    rawText: '',
    canParse: false,
    parsing: false,
    imageLoading: false,
    saving: false,
    showResult: false,
    parsedItems: [],
    totalCalorie: 0,
    totalProtein: 0,
    rawTextSaved: '',
    showCelebration: false,
    celebEmoji: '🎉',
    celebText: '',
    goalType: 'gain',
    // Lose 红绿灯专属状态（与 gain 完全隔离）
    loseOverallLight: '',
    loseOverallLightText: '',
    loseGreenCount: 0,
    loseYellowCount: 0,
    loseRedCount: 0
  },

  onLoad() {
    this.setData({ goalType: util.normalizeGoalType(app.globalData.userInfo && app.globalData.userInfo.goal_type) })
  },

  setMealType(e) {
    this.setData({ mealType: e.currentTarget.dataset.type })
  },

  onTextInput(e) {
    const val = e.detail.value
    this.setData({ rawText: val, canParse: !!val.trim() })
  },

  handleParseResult(result) {
    if (result.code === 88) {
      wx.showToast({ title: '输入包含违规内容', icon: 'none' })
      this.setData({ parsing: false })
      return
    }

    if (result.code !== 0) {
      wx.showToast({ title: result.message || '分析失败', icon: 'none' })
      this.setData({ parsing: false })
      return
    }

    const text = this.data.rawText.trim() || result.data.raw_text || ''
    const items = result.data.items.length > 0 ? result.data.items : [{ name: text || '未知食物', portion: '1份', calorie: 0, protein_g: 0 }]
    const loseAgg = this.data.goalType === 'lose' ? this.aggregateTraffic(items) : {}
    this.setData({
      showResult: true,
      parsedItems: items,
      totalCalorie: result.data.total_calorie,
      totalProtein: result.data.total_protein_g,
      rawTextSaved: text,
      parsing: false,
      ...loseAgg
    })
  },

  // Lose 模式：聚合红绿灯统计（green/yellow/red 计数 + 整餐评级文本）
  aggregateTraffic(items) {
    let green = 0
    let yellow = 0
    let red = 0
    items.forEach(it => {
      if (it.traffic_light === 'green') green++
      else if (it.traffic_light === 'yellow') yellow++
      else if (it.traffic_light === 'red') red++
    })
    const light = red > 0 ? 'red' : (yellow > 0 ? 'yellow' : 'green')
    const textMap = { green: '绿灯 · 放心吃', yellow: '黄灯 · 需控量', red: '红灯 · 需注意' }
    return {
      loseOverallLight: light,
      loseOverallLightText: textMap[light],
      loseGreenCount: green,
      loseYellowCount: yellow,
      loseRedCount: red
    }
  },

  // Lose 专属极简打卡 Handler：拍完/解析后一键落盘（不走 gain 的克数编辑 saveFoodLog）
  lose_onRecordVisual() {
    const items = this.data.parsedItems.filter(item => item.name && item.name.trim())
    if (items.length === 0) {
      wx.showToast({ title: '请先拍照或输入描述', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    const today = util.formatDate(new Date())
    wx.cloud.callFunction({
      name: 'saveFoodLog',
      data: {
        date: today,
        meal_type: this.data.mealType,
        raw_text: this.data.rawTextSaved,
        items: items.map(item => ({
          name: item.name,
          portion: item.portion || '1份',
          calorie: Number(item.calorie) || 0,
          protein_g: Number(item.protein_g) || 0,
          traffic_light: item.traffic_light || '',
          light_reason: item.light_reason || ''
        }))
      }
    }).then(res => {
      this.setData({ saving: false })
      if (res.result && res.result.code === 0) {
        app.globalData.forceIndexRefresh = true
        wx.showToast({ title: '已记下', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1200)
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    }).catch(err => {
      logger.error('lose_onRecordVisual', err)
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    })
  },

  async parseFood() {
    const text = this.data.rawText.trim()
    if (!text) return

    this.setData({ parsing: true })

    try {
      const today = util.formatDate(new Date())
      const res = await wx.cloud.callFunction({
        name: 'parseFoodLog',
        data: {
          raw_text: text,
          meal_type: this.data.mealType,
          date: today,
          goal_type: this.data.goalType
        }
      })
      this.handleParseResult(res.result)
    } catch (err) {
      logger.error('parseFood', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ parsing: false })
    }
  },

  chooseMealImage() {
    if (this.data.parsing || this.data.imageLoading) return

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!tempPath) return
        try {
          this.setData({ imageLoading: true })
          const base64 = await this.compressImage(tempPath)
          await this.parseFoodByImage(base64)
        } catch (err) {
          logger.error('chooseMealImage', err)
          wx.showToast({ title: '图片处理失败', icon: 'none' })
        } finally {
          this.setData({ imageLoading: false })
        }
      }
    })
  },

  compressImage(src) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          const MAX = 800
          const ratio = Math.min(1, MAX / Math.max(info.width, info.height))
          const w = Math.round(info.width * ratio)
          const h = Math.round(info.height * ratio)

          const canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
          const ctx = canvas.getContext('2d')
          const img = canvas.createImage()
          img.onload = () => {
            ctx.drawImage(img, 0, 0, w, h)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
            const base64 = dataUrl.split(',')[1] || ''
            if (!base64) return reject(new Error('canvas toDataURL empty'))
            resolve(base64)
          }
          img.onerror = () => reject(new Error('image load failed'))
          img.src = src
        },
        fail: reject
      })
    })
  },

  async parseFoodByImage(base64) {
    this.setData({ parsing: true })
    try {
      const today = util.formatDate(new Date())
      const res = await wx.cloud.callFunction({
        name: 'parseFoodLog',
        data: {
          image_base64: base64,
          meal_type: this.data.mealType,
          date: today,
          goal_type: this.data.goalType
        }
      })
      this.handleParseResult(res.result)
    } catch (err) {
      logger.error('parseFoodByImage', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ parsing: false })
    }
  },

  editItem(e) {
    const idx = e.currentTarget.dataset.index
    const field = e.currentTarget.dataset.field
    let value = e.detail.value

    if (field === 'calorie' || field === 'protein_g') {
      value = sanitizeDigit(value)
      if (field === 'calorie') {
        const num = parseFloat(value)
        if (!isNaN(num) && num > 9999) value = '9999'
      }
      if (field === 'protein_g') {
        const num = parseFloat(value)
        if (!isNaN(num) && num > 999) value = '999'
      }
    }

    const key = 'parsedItems[' + idx + '].' + field
    this.setData({ [key]: value }, () => {
      this.recalcTotal()
    })
  },

  removeItem(e) {
    const idx = e.currentTarget.dataset.index
    const items = this.data.parsedItems
    items.splice(idx, 1)
    this.setData({ parsedItems: items }, () => {
      this.recalcTotal()
    })
  },

  addItem() {
    const items = this.data.parsedItems
    items.push({ name: '', portion: '1份', calorie: 0, protein_g: 0 })
    this.setData({ parsedItems: items })
  },

  recalcTotal() {
    const items = this.data.parsedItems
    let cal = 0
    let pro = 0
    items.forEach(item => {
      cal += Number(item.calorie) || 0
      pro += Number(item.protein_g) || 0
    })
    this.setData({
      totalCalorie: cal,
      totalProtein: Math.round(pro * 10) / 10
    })
  },

  async saveFoodLog() {
    const items = this.data.parsedItems.filter(item => item.name.trim())
    if (items.length === 0) {
      wx.showToast({ title: '请至少保留一项食物', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      const today = util.formatDate(new Date())

      const res = await wx.cloud.callFunction({
        name: 'saveFoodLog',
        data: {
          date: today,
          meal_type: this.data.mealType,
          raw_text: this.data.rawTextSaved,
          items: items.map(item => ({
            name: item.name,
            portion: item.portion || '1份',
            calorie: Number(item.calorie) || 0,
            protein_g: Number(item.protein_g) || 0
          }))
        }
      })

      if (res.result.code !== 0) {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
        this.setData({ saving: false })
        return
      }

      // 写库成功：标记首页强制刷新，返回首页后立即展示最新数据（不依赖 30s TTL）
      app.globalData.forceIndexRefresh = true

      const mealLabels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
      const mealEmojis = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' }
      const celebTexts = {
        breakfast: '早上吃好，今天精神肯定好！',
        lunch: '中午吃饱，下午才有力气长肉！',
        dinner: '晚餐到位，睡觉都在变大只！',
        snack: '聪明！加餐是增重党的秘密武器！'
      }
      this.setData({
        saving: false,
        showCelebration: true,
        celebEmoji: mealEmojis[this.data.mealType] || '🎉',
        celebText: celebTexts[this.data.mealType] || '又吃了一顿，离目标又近一步！'
      })
      setTimeout(() => {
        this.setData({ showCelebration: false })
        wx.navigateBack()
      }, 2500)
    } catch (err) {
      logger.error('saveFoodLog', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      this.setData({ saving: false })
    }
  },

  dismissCelebration() {
    this.setData({ showCelebration: false })
  },

  resetForm() {
    this.setData({
      rawText: '',
      canParse: false,
      rawTextSaved: '',
      showResult: false,
      parsedItems: [],
      totalCalorie: 0,
      totalProtein: 0
    })
  }
})
