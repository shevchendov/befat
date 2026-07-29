let mockRecords = []
const mockGenId = (() => { let i = 1; return () => 'rec-' + (i++) })()

const mockWhereFn = jest.fn((query) => ({
  orderBy: jest.fn(() => ({
    limit: jest.fn(() => ({
      get: jest.fn().mockImplementation(() => {
        const sorted = mockRecords
          .filter(r => query._openid ? r._openid === query._openid : true)
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
        return Promise.resolve({ data: sorted })
      })
    })),
    get: jest.fn().mockImplementation(() => {
      const sorted = mockRecords
        .filter(r => query._openid ? r._openid === query._openid : true)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
      return Promise.resolve({ data: sorted })
    })
  })),
  get: jest.fn().mockImplementation(() => {
    const filtered = query.date
      ? mockRecords.filter(r => r.date === query.date)
      : mockRecords.filter(r => query._openid ? r._openid === query._openid : true)
    return Promise.resolve({ data: filtered })
  })
}))

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-29T00:00:00.000Z')

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: mockWhereFn,
        doc: jest.fn((id) => ({
          update: jest.fn().mockImplementation(({ data }) => {
            const idx = mockRecords.findIndex(r => r._id === id)
            if (idx !== -1) Object.assign(mockRecords[idx], data)
            return Promise.resolve({})
          }),
          remove: jest.fn().mockResolvedValue({})
        })),
        add: jest.fn().mockImplementation(({ data }) => {
          const doc = { _id: mockGenId(), ...data }
          mockRecords.push(doc)
          return Promise.resolve({ _id: doc._id })
        })
      })),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test-openid',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const saveWeightLog = require('../cloudfunctions/saveWeightLog/index')

beforeEach(() => {
  mockRecords = []
})

describe('saveWeightLog.main - parameter validation', () => {
  test('returns code 1 when missing params', async () => {
    expect((await saveWeightLog.main({ date: '2026-07-29' }, {})).code).toBe(1)
    expect((await saveWeightLog.main({ weight_kg: 65 }, {})).code).toBe(1)
    expect((await saveWeightLog.main({}, {})).code).toBe(1)
  })

  test('returns code 2 for weight < 20', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 15 }, {})
    expect(result.code).toBe(2)
  })

  test('returns code 2 for weight > 300', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 350 }, {})
    expect(result.code).toBe(2)
  })

  test('accepts valid weight', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 65 }, {})
    expect(result.code).toBe(0)
  })
})

describe('saveWeightLog.main - create and update', () => {
  test('creates a new record', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-28', weight_kg: 64.5 }, {})
    expect(result.code).toBe(0)
    expect(result.data.records).toHaveLength(1)
    expect(result.data.records[0].weight_kg).toBe(64.5)
  })

  test('updates existing record for same date', async () => {
    await saveWeightLog.main({ date: '2026-07-28', weight_kg: 64.5 }, {})
    const result = await saveWeightLog.main({ date: '2026-07-28', weight_kg: 65.0 }, {})
    expect(result.code).toBe(0)
    const record = result.data.records.find(r => r.date === '2026-07-28')
    expect(record.weight_kg).toBe(65.0)
  })

  test('returns multiple records in date order', async () => {
    await saveWeightLog.main({ date: '2026-07-20', weight_kg: 63 }, {})
    await saveWeightLog.main({ date: '2026-07-25', weight_kg: 64 }, {})
    await saveWeightLog.main({ date: '2026-07-15', weight_kg: 62 }, {})

    const result = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 65 }, {})
    const dates = result.data.records.map(r => r.date)
    expect(dates).toEqual(dates.slice().sort())
  })

  test('rounds weight to 1 decimal', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-30', weight_kg: 65.666 }, {})
    expect(result.data.records[0].weight_kg).toBe(65.7)
  })
})
