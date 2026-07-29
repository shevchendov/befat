jest.mock('wx-server-sdk', () => {
  let foodLogsData = []
  let userData = []

  const mockCollection = jest.fn((name) => ({
    where: jest.fn((query) => ({
      orderBy: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          data: name === 'food_logs'
            ? foodLogsData.filter(r => r.date === query.date)
            : userData
        })
      })),
      get: jest.fn().mockResolvedValue({
        data: name === 'food_logs'
          ? foodLogsData.filter(r => r.date === query.date)
          : userData
      })
    })),
    doc: jest.fn(() => ({ update: jest.fn().mockResolvedValue({}) })),
    add: jest.fn().mockImplementation(({ data }) => {
      foodLogsData.push(data)
      return Promise.resolve({ _id: 'mock-id' })
    })
  }))

  const mockServerDate = jest.fn(() => new Date().toISOString())

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: mockCollection,
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test-openid',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const getDailySummary = require('../cloudfunctions/getDailySummary/index')

describe('getDailySummary.main - validation', () => {
  test('returns code 1 when missing date', async () => {
    const result = await getDailySummary.main({}, {})
    expect(result.code).toBe(1)
  })

  test('returns empty summary for date with no logs', async () => {
    const result = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(result.code).toBe(0)
    expect(result.data.total_calorie).toBe(0)
    expect(result.data.total_protein_g).toBe(0)
    expect(result.data.target_calorie).toBe(0)
  })
})

describe('getDailySummary.main - aggregation', () => {
  test('correctly groups meals by type', async () => {
    const db = require('wx-server-sdk').database()
    const col = db.collection('food_logs')

    const mealLogs = [
      { date: '2026-07-29', meal_type: 'breakfast', total_calorie: 380, total_protein_g: 15, created_at: '2026-07-29T08:00:00Z' },
      { date: '2026-07-29', meal_type: 'lunch', total_calorie: 620, total_protein_g: 35, created_at: '2026-07-29T12:30:00Z' },
      { date: '2026-07-29', meal_type: 'dinner', total_calorie: 550, total_protein_g: 28, created_at: '2026-07-29T19:00:00Z' },
      { date: '2026-07-29', meal_type: 'snack', total_calorie: 200, total_protein_g: 8, created_at: '2026-07-29T15:00:00Z' }
    ]

    for (const log of mealLogs) {
      await col.add({ data: log })
    }

    const result = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(result.code).toBe(0)
    expect(result.data.meals.breakfast).toHaveLength(1)
    expect(result.data.meals.lunch).toHaveLength(1)
    expect(result.data.meals.dinner).toHaveLength(1)
    expect(result.data.meals.snack).toHaveLength(1)
    expect(result.data.total_calorie).toBe(1750)
    expect(result.data.total_protein_g).toBe(86)
  })

  test('handles multiple logs for same meal type', async () => {
    const db = require('wx-server-sdk').database()
    const col = db.collection('food_logs')

    const logs = [
      { date: '2026-07-30', meal_type: 'snack', total_calorie: 100, total_protein_g: 2, created_at: '2026-07-30T10:00:00Z' },
      { date: '2026-07-30', meal_type: 'snack', total_calorie: 150, total_protein_g: 5, created_at: '2026-07-30T15:00:00Z' }
    ]

    for (const log of logs) {
      await col.add({ data: log })
    }

    const result = await getDailySummary.main({ date: '2026-07-30' }, {})
    expect(result.data.meals.snack).toHaveLength(2)
    expect(result.data.total_calorie).toBe(250)
  })

  test('ignores meal logs from other dates', async () => {
    const result = await getDailySummary.main({ date: '2026-07-31' }, {})
    expect(result.data.total_calorie).toBe(0)
    expect(result.data.total_protein_g).toBe(0)
  })
})
