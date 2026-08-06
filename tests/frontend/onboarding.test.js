require('./setup')
const { getLastPageConfig, createPage, getColRef } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/onboarding/onboarding')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.loading = true
  page.data.form = { gender: '', age: '', height_cm: '', current_weight_kg: '', target_weight_kg: '', activity_level: '', target_weeks: '' }
  wx.reLaunch.mockClear()
  getApp().globalData.userInfo = null
  getColRef('users')._docs.length = 0
})

function seedUser(targetWeightKg) {
  getColRef('users')._docs.push({
    _id: 'u1',
    _openid: 'openid-mock',
    created_at: '2026-01-01T00:00:00.000Z',
    height_cm: 175,
    current_weight_kg: 60,
    target_weight_kg: targetWeightKg
  })
}

describe('onboarding onShow - onboarding gate', () => {
  test('无 users 文档时显示表单（不 reLaunch）', async () => {
    await page.onShow()
    expect(wx.reLaunch).not.toHaveBeenCalled()
    expect(page.data.loading).toBe(false)
  })

  test('文档存在且 target_weight_kg 有值（已初始化）时放回首页', async () => {
    seedUser(70)
    await page.onShow()
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index' })
  })

  test('文档存在但 target_weight_kg 为空（重置后）时显示表单', async () => {
    seedUser(null)
    await page.onShow()
    expect(wx.reLaunch).not.toHaveBeenCalled()
    expect(page.data.loading).toBe(false)
  })
})

describe('onboarding nextStep - step2 前端预校验', () => {
  function seedStep2Form(overrides) {
    page.data.step = 2
    page.data.form = {
      gender: 'male',
      age: '25',
      height_cm: '175',
      current_weight_kg: '59',
      target_weight_kg: '70',
      target_weeks: '24',
      activity_level: '',
      ...overrides
    }
  }

  beforeEach(() => {
    wx.showModal.mockClear()
    wx.showToast.mockClear()
  })

  test('目标体重 600kg 时被预校验拦截（toast），不进入 step3', () => {
    seedStep2Form({ target_weight_kg: '600' })
    page.nextStep()
    expect(wx.showToast).toHaveBeenCalledWith({ title: '目标体重不能超过300kg', icon: 'none' })
    expect(wx.showModal).not.toHaveBeenCalled()
    expect(page.data.step).toBe(2)
  })

  test('BMI 过低时以 showModal 拦截，文案与云函数一致', () => {
    seedStep2Form({ height_cm: '175', current_weight_kg: '40', target_weight_kg: '55' })
    page.nextStep()
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({ title: '温馨提示' }))
    expect(page.data.step).toBe(2)
  })

  test('增重速率过快时以 showModal 拦截', () => {
    seedStep2Form({ current_weight_kg: '50', target_weight_kg: '90', target_weeks: '4' })
    page.nextStep()
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({ title: '温馨提示' }))
    expect(page.data.step).toBe(2)
  })

  test('合法输入通过预校验进入 step3', () => {
    seedStep2Form()
    page.nextStep()
    expect(wx.showModal).not.toHaveBeenCalled()
    expect(wx.showToast).not.toHaveBeenCalled()
    expect(page.data.step).toBe(3)
  })
})

describe('onboarding onInput - 体重统一 2 位小数', () => {
  test('体重字段截断到 2 位小数且字符上限 5', () => {
    page.onInput({ currentTarget: { dataset: { field: 'current_weight_kg' } }, detail: { value: '59.12345' } })
    expect(page.data.form.current_weight_kg).toBe('59.12')
  })

  test('目标体重可输入 2 位小数', () => {
    page.onInput({ currentTarget: { dataset: { field: 'target_weight_kg' } }, detail: { value: '59.12' } })
    expect(page.data.form.target_weight_kg).toBe('59.12')
  })
})
