const mockDate = { today: '2026-07-30' }
jest.mock('../../miniprogram/utils/util', () => ({
  formatDate: jest.fn(() => mockDate.today),
  getMealTypeLabel: jest.fn(t => t),
  normalizeGoalType: jest.fn(v => v === 'lose' ? 'lose' : 'gain')
}))

require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

function makeSummary(cal, target, meals) {
  return {
    result: {
      code: 0, message: 'ok',
      data: {
        date: mockDate.today,
        total_calorie: cal,
        total_protein_g: 0,
        target_calorie: target,
        target_protein: 0,
        meals: meals || {}
      }
    }
  }
}

beforeAll(() => {
  require('../../miniprogram/pages/index/index')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.showCelebration = false
  page._lastLoadTs = 0
  page._lastLoadDate = null
  getApp().globalData.forceIndexRefresh = false
})

function mealLog(cal) {
  return [{ total_calorie: cal, meal_type: 'lunch', created_at: '2026-07-30T12:00:00Z' }]
}

describe('celebration popup', () => {
  test('shows celebration when calorie >= 80% and has meals', async () => {
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))
    await page.loadData()
    expect(page.data.showCelebration).toBe(true)
    expect(wx.setStorageSync).toHaveBeenCalledWith('celebrate_shown_2026-07-30', true)
  })

  test('does not show celebration when calorie < 80%', async () => {
    callFnMock.mockResolvedValue(makeSummary(1500, 2500, { lunch: mealLog(1500) }))
    await page.loadData()
    expect(page.data.showCelebration).toBe(false)
  })

  test('does not show celebration when no meals', async () => {
    callFnMock.mockResolvedValue(makeSummary(2500, 2500, {}))
    await page.loadData()
    expect(page.data.showCelebration).toBe(false)
  })

  test('does not show celebration twice on same day', async () => {
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))

    await page.loadData()
    expect(page.data.showCelebration).toBe(true)

    page.setData.mockClear()
    page.data.showCelebration = false
    wx.setStorageSync.mockClear()

    await page.loadData()
    expect(page.data.showCelebration).toBe(false)
    expect(wx.setStorageSync).not.toHaveBeenCalled()
  })

  test('shows celebration again on next day', async () => {
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))

    await page.loadData()
    expect(page.data.showCelebration).toBe(true)

    page.setData.mockClear()
    page.data.showCelebration = false
    wx.setStorageSync.mockClear()

    mockDate.today = '2026-07-31'
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))

    await page.loadData()
    expect(page.data.showCelebration).toBe(true)
    expect(wx.setStorageSync).toHaveBeenCalledWith('celebrate_shown_2026-07-31', true)
  })
})

describe('forceIndexRefresh 强制刷新机制', () => {
  test('标记为 true 时无视 TTL 强制刷新并消费清除', async () => {
    page._lastLoadTs = Date.now()
    page._lastLoadDate = mockDate.today
    getApp().globalData.forceIndexRefresh = true
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))
    await page.loadData()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)
    expect(page.data.dailySummary.total_calorie).toBe(2000)
  })

  test('连续两次强制刷新每次都生效', async () => {
    page._lastLoadTs = Date.now()
    page._lastLoadDate = mockDate.today
    getApp().globalData.forceIndexRefresh = true
    callFnMock.mockResolvedValue(makeSummary(2000, 2500, { lunch: mealLog(2000) }))
    await page.loadData()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)

    getApp().globalData.forceIndexRefresh = true
    callFnMock.mockClear()
    await page.loadData()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'getDailySummary' }))
  })

  test('未设置标记且 TTL 新鲜时普通 onShow 命中缓存不调用云函数', async () => {
    callFnMock.mockResolvedValue(makeSummary(1000, 2500, { lunch: mealLog(1000) }))
    await page.loadData()
    callFnMock.mockClear()
    await page.loadData()
    expect(callFnMock).not.toHaveBeenCalled()
  })

  test('TTL 过期后普通 onShow 正常刷新', async () => {
    callFnMock.mockResolvedValue(makeSummary(1000, 2500, { lunch: mealLog(1000) }))
    await page.loadData()
    callFnMock.mockClear()
    page._lastLoadTs = Date.now() - 31000
    await page.loadData()
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'getDailySummary' }))
  })
})

describe('loadData TTL 更新时机', () => {
  test('getDailySummary 返回非 0 code 时 TTL 不更新', async () => {
    page._lastLoadTs = 0
    page._lastLoadDate = null
    callFnMock.mockResolvedValue({ result: { code: -1, message: '服务器内部错误' } })
    await page.loadData()
    expect(page._lastLoadTs).toBe(0)
    expect(page._lastLoadDate).toBeNull()
  })

  test('getDailySummary 网络异常时 TTL 不更新', async () => {
    page._lastLoadTs = 0
    page._lastLoadDate = null
    callFnMock.mockRejectedValue(new Error('network'))
    await page.loadData()
    expect(page._lastLoadTs).toBe(0)
    expect(page._lastLoadDate).toBeNull()
  })

  test('请求成功后 TTL 更新为当前时间', async () => {
    page._lastLoadTs = 0
    page._lastLoadDate = null
    const before = Date.now()
    callFnMock.mockResolvedValue(makeSummary(1000, 2500, { lunch: mealLog(1000) }))
    await page.loadData()
    expect(page._lastLoadDate).toBe(mockDate.today)
    expect(page._lastLoadTs).toBeGreaterThanOrEqual(before)
  })
})

describe('loadData 请求竞态', () => {
  test('旧请求 A 后返回时不得覆盖新请求 B 的结果', async () => {
    page._lastLoadTs = 0
    page._lastLoadDate = null

    let resolveA, resolveB
    const pA = new Promise(resolve => { resolveA = resolve })
    const pB = new Promise(resolve => { resolveB = resolve })

    let summaryCalls = 0
    callFnMock.mockImplementation(({ name }) => {
      if (name === 'getGoalProgress') {
        return Promise.resolve({
          result: { code: 0, data: { achieved: false, initial_weight: 60, current_weight: 62, target_weight: 70, progress_percent: 20, remaining_kg: 8, estimated_date: null } }
        })
      }
      summaryCalls += 1
      return summaryCalls === 1 ? pA : pB
    })

    // 请求 A 发起（尚未返回）
    const loadPromiseA = page.loadData()
    // 请求 B 发起（更新的请求）
    const loadPromiseB = page.loadData()

    // B 先返回（新数据 1000 卡路里）
    resolveB(makeSummary(1000, 2500, { lunch: mealLog(1000) }))
    await loadPromiseB

    // A 后返回（旧数据 500 卡路里）
    resolveA(makeSummary(500, 2500, { lunch: mealLog(500) }))
    await loadPromiseA

    // 最终页面必须保持 B 的结果
    expect(page.data.dailySummary.total_calorie).toBe(1000)
  })
})

describe('onTapYuefan 快捷导航', () => {
  test('点击约饭吧跳转到 daily-menu 并携带 view=poi 参数', () => {
    wx.navigateTo.mockClear()
    page.onTapYuefan()
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/daily-menu/daily-menu?view=poi' })
  })

  test('loadData 按 globalData goal_type 更新页面 goalType（缓存命中前兜底）', async () => {
    getApp().globalData.userInfo = { goal_type: 'lose' }
    page._lastLoadTs = Date.now()
    page._lastLoadDate = mockDate.today
    await page.loadData()
    expect(page.data.goalType).toBe('lose')
  })
})
