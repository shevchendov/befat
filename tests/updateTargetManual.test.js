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

const updateTargetManual = require('../cloudfunctions/updateTargetManual/index')

const USER = {
  _id: 'u1',
  _openid: 'test-openid',
  height_cm: 175,
  gender: 'male',
  age: 25,
  activity_level: 'moderate',
  current_weight_kg: 60,
  target_weight_kg: 65,
  daily_calorie_target: 2800,
  daily_protein_target_g: 108
}

// 该用户 BMR = 10*60 + 6.25*175 - 5*25 + 5 = 1628.75
const USER_BMR = 1628.75

beforeEach(() => {
  mockUsers = []
  mockUpdateData = null
})

describe('updateTargetManual.main - parameter validation', () => {
  test('returns code 1 when no field provided', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({}, {})
    expect(result.code).toBe(1)
  })

  test('returns code -1 when user not found', async () => {
    const result = await updateTargetManual.main({ daily_calorie_target: 2800 }, {})
    expect(result.code).toBe(-1)
  })

  test('returns code 1 for negative calorie target', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_calorie_target: -100 }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 for zero protein target', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_protein_target_g: 0 }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 for protein target above 500', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_protein_target_g: 600 }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 for calorie target above 10000', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_calorie_target: 15000 }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 for target weight above 500', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ target_weight_kg: 600 }, {})
    expect(result.code).toBe(1)
  })
})

describe('updateTargetManual.main - BMR lower bound guard', () => {
  test('returns code 4 when calorie target below BMR', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_calorie_target: Math.floor(USER_BMR) - 100 }, {})
    expect(result.code).toBe(4)
    expect(result.message).toContain('基础代谢')
  })

  test('accepts calorie target equal to BMR', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_calorie_target: Math.ceil(USER_BMR) }, {})
    expect(result.code).toBe(0)
  })

  test('skips BMR guard when user profile missing', async () => {
    mockUsers = [{ _id: 'u1', current_weight_kg: 60 }]
    const result = await updateTargetManual.main({ daily_calorie_target: 100 }, {})
    expect(result.code).toBe(0)
  })
})

describe('updateTargetManual.main - success', () => {
  test('updates all provided fields', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({
      daily_calorie_target: 3000,
      daily_protein_target_g: 120,
      target_weight_kg: 68
    }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.daily_calorie_target).toBe(3000)
    expect(mockUpdateData.daily_protein_target_g).toBe(120)
    expect(mockUpdateData.target_weight_kg).toBe(68)
    expect(mockUpdateData.updated_at).toBe('2026-07-31T00:00:00.000Z')
  })

  test('updates only provided fields (partial update)', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ daily_calorie_target: 2900 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.daily_calorie_target).toBe(2900)
    expect(mockUpdateData.daily_protein_target_g).toBeUndefined()
    expect(mockUpdateData.target_weight_kg).toBeUndefined()
  })

  test('rounds target weight to 1 decimal', async () => {
    mockUsers = [USER]
    const result = await updateTargetManual.main({ target_weight_kg: 65.44 }, {})
    expect(result.code).toBe(0)
    expect(mockUpdateData.target_weight_kg).toBe(65.4)
  })
})
