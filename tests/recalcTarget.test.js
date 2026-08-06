let mockUsers = []
let mockUpdateData = null

const mockWhere = jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: mockUsers }) }))
const mockDoc = jest.fn((id) => ({
  update: jest.fn(({ data }) => {
    mockUpdateData = data
    return Promise.resolve({})
  })
}))

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'env-mock',
  database: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: mockWhere,
      doc: mockDoc
    })),
    serverDate: jest.fn(() => '2026-07-31T00:00:00.000Z')
  })),
  getWXContext: jest.fn(() => ({
    OPENID: 'test-openid',
    APPID: 'test-appid',
    UNIONID: null
  }))
}))

const recalcTarget = require('../cloudfunctions/recalcTarget/index')

const USER = {
  _id: 'u1',
  _openid: 'test-openid',
  height_cm: 175,
  gender: 'male',
  age: 25,
  activity_level: 'moderate',
  current_weight_kg: 60,
  target_weight_kg: 65,
  initial_weight: 55,
  daily_calorie_target: 2800,
  daily_protein_target_g: 108
}

beforeEach(() => {
  mockUsers = []
  mockUpdateData = null
})

describe('recalcTarget.main - parameter validation', () => {
  test('returns code 1 when missing params', async () => {
    const result = await recalcTarget.main({}, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 when only one param provided', async () => {
    const result = await recalcTarget.main({ current_weight_kg: 62 }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 when weight out of range', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: -5 }, {})
    expect(result.code).toBe(1)
  })
})

describe('recalcTarget.main - user guard', () => {
  test('returns code -1 when user not found', async () => {
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65 }, {})
    expect(result.code).toBe(-1)
  })

  test('returns code 1 when user profile incomplete', async () => {
    mockUsers = [{ _id: 'u1', height_cm: 175, gender: 'male' }]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65 }, {})
    expect(result.code).toBe(1)
  })
})

describe('recalcTarget.main - safety guards', () => {
  test('returns code 2 when BMI < 16', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 45, target_weight_kg: 60 }, {})
    expect(result.code).toBe(2)
    expect(result.data.bmi).toBe(14.7)
  })

  test('returns code 3 when weekly gain > 1kg', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 55, target_weight_kg: 85 }, {})
    expect(result.code).toBe(3)
    expect(result.message).toContain('增长过快')
  })

  test('does not update db when guard fails', async () => {
    mockUsers = [USER]
    await recalcTarget.main({ current_weight_kg: 45, target_weight_kg: 60 }, {})
    expect(mockUpdateData).toBeNull()
  })
})

describe('recalcTarget.main - success', () => {
  test('recalculates targets and updates users', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65 }, {})
    expect(result.code).toBe(0)

    const bmr = 10 * 62 + 6.25 * 175 - 5 * 25 + 5
    const tdee = Math.round(bmr * 1.55)
    expect(result.data.tdee).toBe(tdee)
    expect(result.data.daily_calorie_target).toBe(tdee + 350)
    expect(result.data.daily_protein_target_g).toBe(Math.round(62 * 1.8))
    expect(result.data.bmi).toBeCloseTo(62 / (1.75 ** 2), 1)

    expect(mockUpdateData).not.toBeNull()
    expect(mockUpdateData.target_weight_kg).toBe(65)
    expect(mockUpdateData.daily_calorie_target).toBe(tdee + 350)
    expect(mockUpdateData.daily_protein_target_g).toBe(Math.round(62 * 1.8))
    expect(mockUpdateData.updated_at).toBe('2026-07-31T00:00:00.000Z')
  })

  test('does NOT overwrite initial_weight or current_weight_kg', async () => {
    mockUsers = [USER]
    await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65 }, {})
    expect(mockUpdateData.initial_weight).toBeUndefined()
    expect(mockUpdateData.current_weight_kg).toBeUndefined()
  })

  test('uses stored height/gender/age/activity from user profile', async () => {
    mockUsers = [{ ...USER, gender: 'female', height_cm: 160, age: 30, activity_level: 'light' }]
    const result = await recalcTarget.main({ current_weight_kg: 50, target_weight_kg: 52 }, {})
    expect(result.code).toBe(0)
    const bmr = 10 * 50 + 6.25 * 160 - 5 * 30 - 161
    const tdee = Math.round(bmr * 1.375)
    expect(result.data.tdee).toBe(tdee)
  })
})

describe('recalcTarget.main - target weeks', () => {
  test('stores target_weeks and set date when provided', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65, target_weeks: 24 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.target_weeks).toBe(24)
    expect(typeof mockUpdateData.target_weeks_set_at).toBe('string')
    expect(mockUpdateData.target_weeks_set_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 老用户速率缺失 → 补写期望周速率快照 = (65 - initial_weight 55) / 24
    expect(mockUpdateData.expected_weekly_rate).toBeCloseTo(10 / 24, 6)
  })

  test('long-period plan passes weekly gain guard that fails on default 4 weeks', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 55, target_weight_kg: 85, target_weeks: 40 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.target_weight_kg).toBe(85)
  })

  test('rejects invalid target_weeks and does not update db', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65, target_weeks: 0 }, {})
    expect(result.code).toBe(1)
    expect(mockUpdateData).toBeNull()
  })

  test('reuses stored target_weeks for rate guard when not re-sent', async () => {
    mockUsers = [{ ...USER, target_weeks: 40 }]
    // 55→85kg：默认 4 周会触发 code 3，但库中已存 40 周应通过
    const result = await recalcTarget.main({ current_weight_kg: 55, target_weight_kg: 85 }, {})
    expect(result.code).toBe(0)
    // 未重新填写周期：不覆盖库中原值
    expect(mockUpdateData.target_weeks).toBeUndefined()
  })

  test('omits target_weeks fields when not provided', async () => {
    mockUsers = [USER]
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.target_weeks).toBeUndefined()
    expect(mockUpdateData.target_weeks_set_at).toBeUndefined()
    expect(mockUpdateData.expected_weekly_rate).toBeUndefined()
  })

  test('recomputes expected_weekly_rate when target_weeks changes', async () => {
    mockUsers = [{ ...USER, target_weeks: 12, expected_weekly_rate: 0.5 }]
    // 周期从 12 → 24 视为重新规划：按新周期重算速率 = (68 - 55) / 24
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 68, target_weeks: 24 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.target_weeks).toBe(24)
    expect(mockUpdateData.expected_weekly_rate).toBeCloseTo(13 / 24, 6)
  })

  test('keeps expected_weekly_rate frozen when only target changes', async () => {
    mockUsers = [{ ...USER, target_weeks: 24, expected_weekly_rate: 0.5 }]
    // 仅改目标、未重新传周期：冻结的速率快照必须原样保留，不随目标变化
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 70 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.expected_weekly_rate).toBeUndefined()
    expect(mockUpdateData.target_weeks).toBeUndefined()
  })

  test('same target_weeks re-sent does not rewrite existing rate', async () => {
    mockUsers = [{ ...USER, target_weeks: 24, expected_weekly_rate: 0.5 }]
    // 周期未变（24 === 24）、速率已存在 → 不覆盖
    const result = await recalcTarget.main({ current_weight_kg: 62, target_weight_kg: 65, target_weeks: 24 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.expected_weekly_rate).toBeUndefined()
    expect(mockUpdateData.target_weeks).toBe(24)
  })
})
