const util = require('../../utils/util')
const logger = require('../../utils/logger')
const { sanitizeDigit } = require('../../utils/validators')

Page({
  data: {
    mealType: 'lunch',
    rawText: '',
    canParse: false,
    parsing: false,
    saving: false,
    showResult: false,
    parsedItems: [],
    totalCalorie: 0,
    totalProtein: 0,
    rawTextSaved: '',
    showCelebration: false,
    celebEmoji: '🎉',
    celebText: ''
  },

  setMealType(e) {
    this.setData({ mealType: e.currentTarget.dataset.type })
  },

  onTextInput(e) {
    const val = e.detail.value
    this.setData({ rawText: val, canParse: !!val.trim() })
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
          date: today
        }
      })

      const result = res.result

      if (result.code === 88) {
        wx.showToast({ title: '输入包含违规内容', icon: 'none' })
        this.setData({ parsing: false })
        return
      }

      if (result.code !== 0) {
        wx.showToast({ title: result.message || '识别失败', icon: 'none' })
        this.setData({ parsing: false })
        return
      }

      this.setData({
        showResult: true,
        parsedItems: result.data.items.length > 0 ? result.data.items : [{ name: text, portion: '1份', calorie: 0, protein_g: 0 }],
        totalCalorie: result.data.total_calorie,
        totalProtein: result.data.total_protein_g,
        rawTextSaved: text,
        parsing: false
      })
    } catch (err) {
      logger.error('parseFood', err)
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
