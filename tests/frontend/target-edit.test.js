require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/target-edit/target-edit')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.loading = false
  page.data.submitting = false
  page.data.mode = 'recalc'
  page.data.form = {
    current_weight_kg: '',
    target_weight_kg: '',
    daily_calorie_target: '',
    daily_protein_target_g: '',
    target_weeks: ''
  }
  page.data.height_cm = null
  page.data.userWeeks = null
  getApp().globalData.forceIndexRefresh = false
  wx.showModal.mockClear()
  wx.showToast.mockClear()
  callFnMock.mockClear()
})

describe('target-edit submitRecalc - 前端预校验', () => {
  test('增重速率过快时拦截（showModal），不发云函数调用', async () => {
    page.data.form = { current_weight_kg: '50', target_weight_kg: '90', target_weeks: '4' }
    page.data.height_cm = 175
    await page.submitRecalc()
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({ title: '温馨提示' }))
    expect(callFnMock).not.toHaveBeenCalled()
    expect(page.data.submitting).toBe(false)
  })

  test('目标体重超过 300kg 时先命中既有范围校验（20-300 toast）', async () => {
    page.data.form = { current_weight_kg: '50', target_weight_kg: '600', target_weeks: '24' }
    page.data.height_cm = 175
    await page.submitRecalc()
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请输入有效目标体重(20-300kg)', icon: 'none' })
    expect(callFnMock).not.toHaveBeenCalled()
  })

  test('合法输入通过预校验后调用 recalcTarget', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: { tdee: 2000, daily_calorie_target: 2350, daily_protein_target_g: 108, bmi: 20.6 } } })
    page.data.form = { current_weight_kg: '59', target_weight_kg: '70', target_weeks: '24' }
    page.data.height_cm = 175
    await page.submitRecalc()
    expect(wx.showModal).not.toHaveBeenCalled()
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'recalcTarget' }))
    expect(wx.showToast).toHaveBeenCalledWith({ title: '目标已更新!', icon: 'success' })
  })
})

describe('target-edit onInput - 体重统一 2 位小数', () => {
  test('体重字段允许多位小数输入，sanitizeDigit 截断到 2 位', () => {
    page.onInput({ currentTarget: { dataset: { field: 'target_weight_kg' } }, detail: { value: '59.123456' } })
    expect(page.data.form.target_weight_kg).toBe('59.12')
  })

  test('体重字段字符上限 6（容纳 300.00）', () => {
    page.onInput({ currentTarget: { dataset: { field: 'target_weight_kg' } }, detail: { value: '300.00' } })
    expect(page.data.form.target_weight_kg).toBe('300.00')
  })

  test('target_weeks 仍为纯整数（去小数点）', () => {
    page.onInput({ currentTarget: { dataset: { field: 'target_weeks' } }, detail: { value: '24.5' } })
    expect(page.data.form.target_weeks).toBe('245')
  })
})

describe('target-edit 保存成功 - forceIndexRefresh 写后强制刷新', () => {
  test('recalcTarget 成功后设置 forceIndexRefresh', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: { tdee: 2000, daily_calorie_target: 2350, daily_protein_target_g: 108 } } })
    page.data.form = { current_weight_kg: '59', target_weight_kg: '70', target_weeks: '24' }
    page.data.height_cm = 175
    await page.submitRecalc()
    expect(getApp().globalData.forceIndexRefresh).toBe(true)
  })

  test('updateTargetManual 成功后设置 forceIndexRefresh', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: { daily_calorie_target: 2400 } } })
    page.data.mode = 'manual'
    page.data.form = { current_weight_kg: '', target_weight_kg: '', daily_calorie_target: '2400', daily_protein_target_g: '', target_weeks: '' }
    await page.submitManual()
    expect(getApp().globalData.forceIndexRefresh).toBe(true)
  })

  test('修改目标失败不设置 forceIndexRefresh', async () => {
    callFnMock.mockResolvedValue({ result: { code: 1, message: '失败' } })
    page.data.form = { current_weight_kg: '59', target_weight_kg: '70', target_weeks: '24' }
    page.data.height_cm = 175
    await page.submitRecalc()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)
  })
})
