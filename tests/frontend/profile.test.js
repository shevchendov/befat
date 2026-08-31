require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page
const appInstance = { globalData: { userInfo: null, dailyTargets: null } }

beforeAll(() => {
  global.getApp = jest.fn(() => appInstance)
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
  page._gpCache = null
  appInstance.globalData.userInfo = null
  appInstance.globalData.dailyTargets = null
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

  test('文档存在但 target_weight_kg 为空（重置后）按无用户处理', async () => {
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{ current_weight_kg: 60, height_cm: 175, target_weight_kg: null, daily_calorie_target: null }]
      }))
    }))
    await page.loadUserData()
    expect(page.data.user).toBeNull()
    expect(page.data.bmi).toBeNull()
  })

  test('有用户时设置 BMI 和活动标签', async () => {
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{
          current_weight_kg: 60, height_cm: 175, activity_level: 'moderate', target_weight_kg: 65,
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

  test('当前体重优先取 getGoalProgress 最新打卡记录而非起始快照', async () => {
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { current_weight: 59.6, target_weight: 65, initial_weight: 59.4 } }
    })
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{
          current_weight_kg: 59.4, height_cm: 175, activity_level: 'sedentary', target_weight_kg: 65,
          bmi: 19.4, daily_calorie_target: 2400, daily_protein_target_g: 108
        }]
      }))
    }))
    await page.loadUserData()
    // 档案 59.4 是 onboarding 起始快照，最新打卡 59.6 应胜出
    expect(page.data.currentWeightDisplay).toBe('59.60')
    // BMI 按最新体重 59.6 计算（59.6/1.75^2 ≈ 19.46），而非起始 59.4 的 19.4
    expect(page.data.bmi).toBe('19.5')
  })

  test('getGoalProgress 失败时回退到 users.current_weight_kg', async () => {
    callFnMock.mockResolvedValue({ result: { code: -1, message: '用户不存在' } })
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{
          current_weight_kg: 59.4, height_cm: 175, activity_level: 'sedentary', target_weight_kg: 65,
          bmi: 19.4, daily_calorie_target: 2400, daily_protein_target_g: 108
        }]
      }))
    }))
    await page.loadUserData()
    expect(page.data.currentWeightDisplay).toBe('59.40')
    expect(page.data.bmi).toBe('19.4')
  })

  test('getGoalProgress 抛异常时不阻断档案加载，回退起始值', async () => {
    callFnMock.mockRejectedValue(new Error('timeout'))
    const db = wx.cloud.database()
    const col = db.collection('users')
    col.where = jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        data: [{
          current_weight_kg: 59.4, height_cm: 175, activity_level: 'sedentary', target_weight_kg: 65,
          bmi: 19.4, daily_calorie_target: 2400, daily_protein_target_g: 108
        }]
      }))
    }))
    await page.loadUserData()
    expect(page.data.currentWeightDisplay).toBe('59.40')
    expect(page.data.bmi).toBe('19.4')
  })

  test('BMI 在展示域内时游标位置按公式计算', async () => {
    seedBmiUser(60, 175)
    await page.loadUserData()
    // bmi = 60/1.75^2 ≈ 19.59，(19.59-14)/16*100 ≈ 34.95%
    expect(page.data.markerLeft).toBe('34.95%')
    expect(page.data.bmiBar).toEqual({ under: '28.13%', normal: '34.38%', over: '37.50%' })
    expect(page.data.bound18).toBe('28.13%')
    expect(page.data.bound24).toBe('62.50%')
  })

  test('BMI < 14 时游标钳制在左边界 2%', async () => {
    seedBmiUser(30, 150)
    await page.loadUserData()
    // bmi = 30/1.5^2 ≈ 13.33，低于展示域下限，钳制到 2%
    expect(page.data.markerLeft).toBe('2.00%')
    expect(page.data.healthWarning.level).toBe('danger')
  })

  test('BMI > 30 时游标钳制在右边界 98%', async () => {
    seedBmiUser(100, 150)
    await page.loadUserData()
    // bmi = 100/1.5^2 ≈ 44.44，高于展示域上限，钳制到 98%
    expect(page.data.markerLeft).toBe('98.00%')
    expect(page.data.healthWarning.level).toBe('info')
  })
})

function seedBmiUser(currentWeightKg, heightCm) {
  const db = wx.cloud.database()
  const col = db.collection('users')
  col.where = jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({
      data: [{
        current_weight_kg: currentWeightKg, height_cm: heightCm, activity_level: 'sedentary', target_weight_kg: 70,
        bmi: null, daily_calorie_target: 2400, daily_protein_target_g: 108
      }]
    }))
  }))
}

describe('toggleHealthInfo', () => {
  test('健康提示固定展示，无折叠交互', () => {
    expect(page.toggleHealthInfo).toBeUndefined()
  })
})

describe('resetUserData', () => {
  test('确认后调用云函数并传入 confirm=true', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, message: '已重置为新用户' } })
    await page.confirmResetData()
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '重置为新用户',
      confirmText: '重置'
    }))
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'resetUserData',
      data: { confirm: true }
    }))
  })

  test('重置成功后清空 globalData 并跳转 onboarding', async () => {
    appInstance.globalData.userInfo = { name: 'x' }
    appInstance.globalData.dailyTargets = { calorie: 2600, protein: 108 }
    callFnMock.mockResolvedValue({ result: { code: 0 } })
    await page.resetUserData()
    expect(appInstance.globalData.userInfo).toBeNull()
    expect(appInstance.globalData.dailyTargets).toBeNull()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('已重置') }))
  })

  test('重置失败时 toast 错误信息', async () => {
    callFnMock.mockResolvedValue({ result: { code: 1, message: '缺少确认参数，操作已取消' } })
    wx.showToast.mockClear()
    await page.resetUserData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('缺少确认参数') }))
  })

  test('重置异常时 toast 提示', async () => {
    callFnMock.mockRejectedValue(new Error('timeout'))
    wx.showToast.mockClear()
    await page.resetUserData()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('异常') }))
  })
})
