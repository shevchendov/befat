const app = getApp()
const util = require('../../utils/util')
const logger = require('../../utils/logger')
const { sanitizeDigit } = require('../../utils/validators')
const { validateTargetInput } = require('../../utils/targetGuard')

Page({
  data: {
    mode: 'recalc',
    loading: true,
    submitting: false,
    form: {
      current_weight_kg: '',
      target_weight_kg: '',
      daily_calorie_target: '',
      daily_protein_target_g: '',
      target_weeks: ''
    },
    profileText: ''
  },

  onShow() {
    this.loadCurrentData()
  },

  async loadCurrentData() {
    this.setData({ loading: true })
    try {
      const [gpRes, userRes] = await Promise.all([
        wx.cloud.callFunction({ name: 'getGoalProgress' }),
        this.fetchUser()
      ])

      const gp = gpRes.result && gpRes.result.code === 0 ? gpRes.result.data : null
      const user = userRes

      const currentWeight = gp ? gp.current_weight : (user && user.current_weight_kg != null ? user.current_weight_kg : '')
      const targetWeight = gp ? gp.target_weight : (user && user.target_weight_kg != null ? user.target_weight_kg : '')

      this.setData({
        form: {
          current_weight_kg: currentWeight != null ? String(currentWeight) : '',
          target_weight_kg: targetWeight != null ? String(targetWeight) : '',
          daily_calorie_target: user && user.daily_calorie_target != null ? String(user.daily_calorie_target) : '',
          daily_protein_target_g: user && user.daily_protein_target_g != null ? String(user.daily_protein_target_g) : '',
          target_weeks: user && user.target_weeks != null ? String(user.target_weeks) : ''
        },
        height_cm: user && user.height_cm != null ? user.height_cm : null,
        userWeeks: user && user.target_weeks != null ? user.target_weeks : null,
        profileText: user ? [
          user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '未知',
          '身高 ' + (user.height_cm || '-') + 'cm',
          '年龄 ' + (user.age || '-') + '岁',
          user.activity_level ? util.getActivityLevelLabel(user.activity_level) : '未知'
        ].join(' · ') : '',
        loading: false
      })
    } catch (err) {
      logger.error('targetEdit loadCurrentData', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  async fetchUser() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('users').where({ _openid: '{openid}' }).get()
      return res.data.length > 0 ? res.data[0] : null
    } catch (err) {
      logger.error('targetEdit fetchUser', err)
      return null
    }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode !== this.data.mode) {
      this.setData({ mode })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    let value = sanitizeDigit(e.detail.value)
    if (field === 'target_weeks') {
      value = value.replace(/\./g, '')
      if (value.length > 3) value = value.slice(0, 3)
    } else if (field === 'daily_calorie_target' || field === 'daily_protein_target_g') {
      value = value.replace(/\./g, '')
      if (value.length > 5) value = value.slice(0, 5)
    } else {
      if (value.length > 6) value = value.slice(0, 6)
    }
    this.setData({ ['form.' + field]: value })
  },

  async submitRecalc() {
    const currentWeight = parseFloat(this.data.form.current_weight_kg)
    const targetWeight = parseFloat(this.data.form.target_weight_kg)
    const targetWeeks = parseInt(this.data.form.target_weeks)

    if (!currentWeight || currentWeight < 20 || currentWeight > 300) {
      wx.showToast({ title: '请输入有效当前体重(20-300kg)', icon: 'none' })
      return
    }
    if (!targetWeight || targetWeight < 20 || targetWeight > 300) {
      wx.showToast({ title: '请输入有效目标体重(20-300kg)', icon: 'none' })
      return
    }
    if (!targetWeeks || targetWeeks < 1 || targetWeeks > 104) {
      wx.showToast({ title: '请输入有效计划周期(1-104周)', icon: 'none' })
      return
    }

    // 与云函数 recalcTarget 的 validateWeights 同口径的前端预校验，提前拦截避免白填
    const guard = validateTargetInput({
      height_cm: this.data.height_cm,
      current_weight_kg: currentWeight,
      target_weight_kg: targetWeight,
      target_weeks: targetWeeks || this.data.userWeeks || null
    })
    if (!guard.ok) {
      if (guard.code) {
        wx.showModal({ title: '温馨提示', content: guard.message, showCancel: false })
      } else {
        wx.showToast({ title: guard.message, icon: 'none' })
      }
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'recalcTarget',
        data: {
          current_weight_kg: currentWeight,
          target_weight_kg: targetWeight,
          target_weeks: targetWeeks
        }
      })
      this.handleSubmitResult(res.result, '目标已更新!')
    } catch (err) {
      logger.error('targetEdit submitRecalc', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  async submitManual() {
    const calorie = this.data.form.daily_calorie_target
    const protein = this.data.form.daily_protein_target_g
    const target = this.data.form.target_weight_kg

    if (!calorie && !protein && !target) {
      wx.showToast({ title: '请至少填写一项', icon: 'none' })
      return
    }

    const payload = {}
    if (calorie) {
      const v = parseInt(calorie)
      if (isNaN(v) || v <= 0) {
        wx.showToast({ title: '请输入有效热量目标', icon: 'none' })
        return
      }
      payload.daily_calorie_target = v
    }
    if (protein) {
      const v = parseInt(protein)
      if (isNaN(v) || v <= 0) {
        wx.showToast({ title: '请输入有效蛋白质目标', icon: 'none' })
        return
      }
      payload.daily_protein_target_g = v
    }
    if (target) {
      const v = parseFloat(target)
      if (isNaN(v) || v <= 0) {
        wx.showToast({ title: '请输入有效目标体重', icon: 'none' })
        return
      }
      payload.target_weight_kg = v
    }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateTargetManual',
        data: payload
      })
      this.handleSubmitResult(res.result, '已保存!')
    } catch (err) {
      logger.error('targetEdit submitManual', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  handleSubmitResult(result, successText) {
    this.setData({ submitting: false })

    if (result.code === 0) {
      wx.showToast({ title: successText, icon: 'success' })
      const fallbackCal = this.data.form.daily_calorie_target ? parseInt(this.data.form.daily_calorie_target) : null
      const fallbackPro = this.data.form.daily_protein_target_g ? parseInt(this.data.form.daily_protein_target_g) : null
      app.globalData.dailyTargets = {
        calorie: result.data && result.data.daily_calorie_target != null ? result.data.daily_calorie_target : fallbackCal,
        protein: result.data && result.data.daily_protein_target_g != null ? result.data.daily_protein_target_g : fallbackPro
      }
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
      return
    }

    if (result.code === 2 || result.code === 3) {
      wx.showModal({
        title: '温馨提示',
        content: result.message,
        showCancel: false
      })
      return
    }

    wx.showToast({ title: result.message || '提交失败', icon: 'none' })
  }
})
