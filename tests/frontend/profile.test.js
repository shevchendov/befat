require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/profile/profile')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.user = null
  page.data.bmi = null
  page.data.healthWarning = {}
  page.data.activityLabel = ''
})

describe('loadUserData', () => {
  test('无用户数据时不设置', async () => {
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ data: [] }))
    }))
    await page.loadUserData()
    expect(page.data.user).toBeNull()
  })

  test('有用户时设置 BMI 和活动标签', async () => {
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{
          current_weight_kg: 60, height_cm: 175, activity_level: 'moderate',
          bmi: 19.6, daily_calorie_target: 2400, daily_protein_target_g: 108
        }]
      }))
    }))
    await page.loadUserData()
    expect(page.data.user).toBeDefined()
    expect(page.data.bmi).toBe('19.6')
    expect(page.data.activityLabel).toBe('中度活动')
    expect(page.data.healthWarning).toEqual({ level: 'normal', text: expect.any(String) })
  })
})

describe('toggleHealthInfo', () => {
  test('切换健康信息显示状态', () => {
    page.data.showHealthInfo = false
    page.toggleHealthInfo()
    expect(page.data.showHealthInfo).toBe(true)
    page.toggleHealthInfo()
    expect(page.data.showHealthInfo).toBe(false)
  })
})

describe('goToOnboarding', () => {
  test('导航到 onboarding 页', () => {
    wx.navigateTo.mockClear()
    page.goToOnboarding()
    expect(wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('onboarding')
    }))
  })
})

describe('exportData', () => {
  test('导出成功', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, data: { user_info: null, food_logs: [], weight_logs: [] } } })
    await page.exportData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('成功') }))
  })

  test('导出失败', async () => {
    callFnMock.mockResolvedValue({ result: { code: 1 } })
    wx.showToast.mockClear()
    await page.exportData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('失败') }))
  })

  test('导出异常', async () => {
    callFnMock.mockRejectedValue(new Error('timeout'))
    await page.exportData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('异常') }))
  })
})

describe('deleteUserData', () => {
  test('确认后删除成功', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0 } })
    await page.confirmDeleteData()
    await page.deleteUserData()
    const app = getApp()
    expect(app.globalData.userInfo).toBeNull()
    expect(app.globalData.dailyTargets).toBeNull()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('已删除') }))
  })

  test('删除失败时 toast', async () => {
    callFnMock.mockResolvedValue({ result: { code: 1 } })
    wx.showToast.mockClear()
    await page.deleteUserData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('失败') }))
  })
})
