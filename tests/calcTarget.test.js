const mockGetResult = { data: [] }
const mockGet = jest.fn().mockResolvedValue(mockGetResult)
const mockWhere = jest.fn(() => ({
  orderBy: jest.fn(() => ({
    limit: jest.fn(() => ({ get: mockGet })),
    get: mockGet
  })),
  get: mockGet,
  limit: jest.fn(() => ({ get: mockGet }))
}))
let mockAddedData = null
let mockUpdatedData = null
const mockDoc = jest.fn(() => ({
  update: jest.fn(({ data }) => { mockUpdatedData = data; return Promise.resolve({}) }),
  remove: jest.fn().mockResolvedValue({})
}))
const mockAdd = jest.fn(({ data }) => { mockAddedData = data; return Promise.resolve({ _id: 'new-user-id' }) })
const mockServerDate = jest.fn(() => '2026-07-29T00:00:00.000Z')

const mockCollection = jest.fn(() => ({
  where: mockWhere,
  doc: mockDoc,
  add: mockAdd
}))

jest.mock('wx-server-sdk', () => ({
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
}))

const calcTarget = require('../cloudfunctions/calcTarget/index')

beforeEach(() => {
  mockAddedData = null
  mockUpdatedData = null
})

describe('calcTarget.main - parameter validation', () => {
  test('returns code 1 when missing parameters', async () => {
    const result = await calcTarget.main({}, {})
    expect(result.code).toBe(1)
    expect(result.message).toBe('缺少必要参数')
  })

  test('returns code 1 when height is 0', async () => {
    const result = await calcTarget.main({
      height_cm: 0, current_weight_kg: 60, target_weight_kg: 70,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(1)
  })
})

describe('calcTarget.main - BMI guard', () => {
  test('returns code 2 when BMI < 16', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 45, target_weight_kg: 65,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(2)
    expect(result.data.bmi).toBe(14.7)
  })

  test('passes when BMI >= 16', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(0)
  })
})

describe('calcTarget.main - weekly gain guard', () => {
  test('returns code 3 when weekly gain > 1kg', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 55, target_weight_kg: 85,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(3)
    expect(result.message).toContain('增长过快')
  })

  test('passes when weekly gain is safe', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(0)
  })
})

describe('calcTarget.main - target weeks', () => {
  test('stores target_weeks and set date when provided', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'moderate', age: 25, target_weeks: 24
    }, {})
    expect(result.code).toBe(0)
    expect(mockAddedData.target_weeks).toBe(24)
    expect(typeof mockAddedData.target_weeks_set_at).toBe('string')
    expect(mockAddedData.target_weeks_set_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 期望周速率快照 = (目标 - 起始) / 周期 = 2 / 24
    expect(mockAddedData.expected_weekly_rate).toBeCloseTo(2 / 24, 6)
  })

  test('long-period plan passes weekly gain guard that fails on default 4 weeks', async () => {
    // 30kg / 4 周 = 7.5kg/周会触发 code 3；延长到 40 周后 0.75kg/周应通过
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 55, target_weight_kg: 85,
      gender: 'male', activity_level: 'moderate', age: 25, target_weeks: 40
    }, {})
    expect(result.code).toBe(0)
  })

  test('rejects invalid target_weeks (0)', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'moderate', age: 25, target_weeks: 0
    }, {})
    expect(result.code).toBe(1)
    expect(mockAddedData).toBeNull()
  })

  test('rejects target_weeks over 104', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'moderate', age: 25, target_weeks: 105
    }, {})
    expect(result.code).toBe(1)
    expect(mockAddedData).toBeNull()
  })

  test('omits target_weeks fields when not provided', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(0)
    expect(mockAddedData.target_weeks).toBeUndefined()
    expect(mockAddedData.target_weeks_set_at).toBeUndefined()
    expect(mockAddedData.expected_weekly_rate).toBeUndefined()
  })
})

describe('calcTarget.main - TDEE calculation', () => {
  test('male moderate activity returns correct targets', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 65, target_weight_kg: 67,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(0)
    const bmr = 10 * 65 + 6.25 * 175 - 5 * 25 + 5
    const tdee = Math.round(bmr * 1.55)
    expect(result.data.tdee).toBe(tdee)
    expect(result.data.daily_calorie_target).toBe(tdee + 350)
    expect(result.data.daily_protein_target_g).toBe(Math.round(65 * 1.8))
    expect(result.data.bmi).toBeCloseTo(21.2, 0)
  })

  test('female sedentary returns correct targets', async () => {
    const result = await calcTarget.main({
      height_cm: 160, current_weight_kg: 50, target_weight_kg: 52,
      gender: 'female', activity_level: 'sedentary', age: 25
    }, {})
    expect(result.code).toBe(0)
    const bmr = 10 * 50 + 6.25 * 160 - 5 * 25 - 161
    const tdee = Math.round(bmr * 1.2)
    expect(result.data.tdee).toBe(tdee)
    expect(result.data.daily_calorie_target).toBe(tdee + 350)
  })

  test('active male has higher TDEE than sedentary male', async () => {
    const params = { height_cm: 170, current_weight_kg: 60, target_weight_kg: 62, gender: 'male', age: 30 }
    const sedentary = await calcTarget.main({ ...params, activity_level: 'sedentary' }, {})
    const active = await calcTarget.main({ ...params, activity_level: 'active' }, {})
    expect(active.data.tdee).toBeGreaterThan(sedentary.data.tdee)
  })
})

describe('calcTarget.main - edge cases', () => {
  test('handles age boundary at 10', async () => {
    const result = await calcTarget.main({
      height_cm: 140, current_weight_kg: 35, target_weight_kg: 36,
      gender: 'female', activity_level: 'light', age: 10
    }, {})
    expect(result.code).toBe(0)
  })

  test('handles age boundary at 100', async () => {
    const result = await calcTarget.main({
      height_cm: 170, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'light', age: 100
    }, {})
    expect(result.code).toBe(0)
  })
})
