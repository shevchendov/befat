require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

function statsPayload(overrides = {}) {
  return {
    code: 0,
    message: 'ok',
    data: {
      goal_type: 'gain',
      target: { calorie: 2500, protein_g: 90 },
      weights: [],
      summary: {
        week: { calorie_rate: null, protein_rate: null, recorded: 0 },
        month: { calorie_rate: null, protein_rate: null, recorded: 0 }
      },
      weeks: [],
      ...overrides
    }
  }
}

beforeAll(() => {
  require('../../miniprogram/pages/stats/stats')
  page = createPage(getLastPageConfig())
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.loading = true
  page.data.summaryItems = []
  page.data.weeks = []
  page.data.weights = []
})

describe('stats - buildWeekItem 警示标记', () => {
  test('gain 模式：calorie_rate 不足 100 不标记 warn', () => {
    const item = page.buildWeekItem({ label: '8/1-8/7', calorie_rate: 50, weight_delta: null }, 'gain')
    expect(item.warn).toBe(false)
  })

  test('lose 模式：calorie_rate < 100 标记 warn（血红警示）', () => {
    const item = page.buildWeekItem({ label: '8/1-8/7', calorie_rate: 66, weight_delta: null }, 'lose')
    expect(item.warn).toBe(true)
  })

  test('lose 模式：calorie_rate === 100 不标记 warn', () => {
    const item = page.buildWeekItem({ label: '8/1-8/7', calorie_rate: 100, weight_delta: null }, 'lose')
    expect(item.warn).toBe(false)
  })

  test('lose 模式：无记录（rate 为 null）不标记 warn', () => {
    const item = page.buildWeekItem({ label: '8/1-8/7', calorie_rate: null, weight_delta: null }, 'lose')
    expect(item.warn).toBe(false)
  })
})

describe('stats - buildSummaryItems 文案重塑', () => {
  const summary = {
    week: { calorie_rate: 80, protein_rate: 90, recorded: 5 },
    month: { calorie_rate: 70, protein_rate: 85, recorded: 20 }
  }

  test('gain 模式使用默认文案', () => {
    const items = page.buildSummaryItems({ target: { calorie: 2500, protein_g: 90 }, summary }, 'gain')
    expect(items[0].label).toBe('近7天 · 热量')
    expect(items[1].label).toBe('近7天 · 蛋白')
  })

  test('lose 模式使用「热量控制成功率 / 肌肉保护伞」文案', () => {
    const items = page.buildSummaryItems({ target: { calorie: 2500, protein_g: 90 }, summary }, 'lose')
    expect(items[0].label).toBe('近7天 · 热量控制成功率')
    expect(items[1].label).toBe('近7天 · 肌肉保护伞 · 蛋白')
    expect(items[2].label).toBe('近30天 · 热量控制成功率')
  })
})

describe('stats - applyGoalType 导航标题与文案', () => {
  test('lose 模式设置「热量与缺口」标题', () => {
    getApp().globalData.userInfo = { goal_type: 'lose' }
    page.applyGoalType()
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '热量与缺口' })
    expect(page.data.goalType).toBe('lose')
    expect(page.data.summaryTitle).toBe('热量控制成功率')
  })

  test('gain/缺省模式设置「达标统计」标题', () => {
    getApp().globalData.userInfo = null
    page.applyGoalType()
    expect(wx.setNavigationBarTitle).toHaveBeenCalledWith({ title: '达标统计' })
    expect(page.data.goalType).toBe('gain')
    expect(page.data.summaryTitle).toBe('营养达标率')
  })

  test('loadData 用云返回 goal_type 重塑视图', async () => {
    callFnMock.mockResolvedValue({
      result: statsPayload({
        goal_type: 'lose',
        summary: { week: { calorie_rate: 60, protein_rate: 90, recorded: 3 }, month: { calorie_rate: null, protein_rate: null, recorded: 0 } },
        weeks: [{ label: '8/1-8/7', calorie_rate: 60, recorded: 3, weight_delta: null }]
      })
    })
    await page.loadData()
    expect(page.data.goalType).toBe('lose')
    expect(page.data.weeks[0].warn).toBe(true)
    expect(page.data.loading).toBe(false)
  })
})