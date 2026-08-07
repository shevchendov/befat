const mockDate = { today: '2026-07-30' }
jest.mock('../../miniprogram/utils/util', () => ({
  formatDate: jest.fn(() => mockDate.today),
  getMealTypeLabel: jest.fn(t => t)
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
