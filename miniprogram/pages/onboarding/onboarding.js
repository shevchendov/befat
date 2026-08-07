const app = getApp()
const logger = require('../../utils/logger')
const { sanitizeDigit, sanitizeNumber, clampNumber } = require('../../utils/validators')
const { validateTargetInput } = require('../../utils/targetGuard')

Page({
  data: {
    step: 1,
    submitting: false,
    loading: true,
    form: {
      gender: '',
      age: '',
      height_cm: '',
      current_weight_kg: '',
      target_weight_kg: '',
      activity_level: ''
    }
  },

  onShow() {
    if (app.globalData.userInfo) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    const db = wx.cloud.database()
    db.collection('users').where({ _openid: '{openid}' }).get().then(res => {
      // 已初始化（填过目标）才放回首页；文档存在但 target_weight_kg 为空
      // （重置后状态）则继续显示表单
      if (res.data.length > 0 && res.data[0].target_weight_kg != null) {
        wx.reLaunch({ url: '/pages/index/index' })
      } else {
        this.setData({ loading: false })
      }
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  setGender(e) {
    const gender = e.currentTarget.dataset.gender
    this.setData({ 'form.gender': gender })
  },

  setActivity(e) {
    const level = e.currentTarget.dataset.level
    this.setData({ 'form.activity_level': level })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    let value = e.detail.value

    if (field === 'age') {
      value = sanitizeNumber(value)
      if (value.length > 3) value = value.slice(0, 3)
    } else if (field === 'height_cm') {
      value = sanitizeDigit(value)
      if (value.length > 3) value = value.slice(0, 3)
    } else if (field === 'current_weight_kg' || field === 'target_weight_kg') {
      value = sanitizeDigit(value)
      if (value.length > 5) value = value.slice(0, 5)
    } else if (field === 'target_weeks') {
      value = sanitizeNumber(value)
      if (value.length > 3) value = value.slice(0, 3)
    }

    this.setData({ ['form.' + field]: value })
  },

  nextStep() {
    const step = this.data.step

    if (step === 1) {
      const age = parseInt(this.data.form.age)
      if (!this.data.form.gender) {
        wx.showToast({ title: '请选择性别', icon: 'none' })
        return
      }
      if (!age || age < 10 || age > 100) {
        wx.showToast({ title: '请输入有效年龄(10-100)', icon: 'none' })
        return
      }
    }

    if (step === 2) {
      const h = parseFloat(this.data.form.height_cm)
      const cw = parseFloat(this.data.form.current_weight_kg)
      const tw = parseFloat(this.data.form.target_weight_kg)
      const weeks = parseInt(this.data.form.target_weeks)
      if (!h || h < 100 || h > 250) {
        wx.showToast({ title: '请输入有效身高(100-250cm)', icon: 'none' })
        return
      }
      if (!cw || cw < 20 || cw > 300) {
        wx.showToast({ title: '请输入有效体重(20-300kg)', icon: 'none' })
        return
      }
      if (!tw || tw <= cw) {
        wx.showToast({ title: '目标体重应大于当前体重', icon: 'none' })
        return
      }
      if (!weeks || weeks < 1 || weeks > 104) {
        wx.showToast({ title: '请输入有效计划周期(1-104周)', icon: 'none' })
        return
      }

      const guard = validateTargetInput({
        height_cm: h,
        current_weight_kg: cw,
        target_weight_kg: tw,
        target_weeks: weeks
      })
      if (!guard.ok) {
        if (guard.code) {
          wx.showModal({ title: '温馨提示', content: guard.message, showCancel: false })
        } else {
          wx.showToast({ title: guard.message, icon: 'none' })
        }
        return
      }
    }

    this.setData({ step: step + 1 })
  },

  async submitForm() {
    const form = this.data.form
    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'calcTarget',
        data: {
          gender: form.gender,
          age: parseInt(form.age),
          height_cm: parseFloat(form.height_cm),
          current_weight_kg: parseFloat(form.current_weight_kg),
          target_weight_kg: parseFloat(form.target_weight_kg),
          activity_level: form.activity_level,
          target_weeks: parseInt(form.target_weeks)
        }
      })

      const result = res.result

      if (result.code === 2 || result.code === 3) {
        wx.showModal({
          title: '温馨提示',
          content: result.message,
          showCancel: false
        })
        this.setData({ submitting: false })
        return
      }

      if (result.code !== 0) {
        wx.showToast({ title: result.message || '提交失败', icon: 'none' })
        this.setData({ submitting: false })
        return
      }

      app.globalData.userInfo = { ...form, ...result.data }
      app.globalData.dailyTargets = {
        calorie: result.data.daily_calorie_target,
        protein: result.data.daily_protein_target_g
      }

      wx.showToast({ title: '设置成功!', icon: 'success' })
      // calcTarget 已写库，标记首页强制刷新（reLaunch 后拿不到来源页，必须显式标记）
      app.globalData.forceIndexRefresh = true
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 1500)
    } catch (err) {
      logger.error('submitForm', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
