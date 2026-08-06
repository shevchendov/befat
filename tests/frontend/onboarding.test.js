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
