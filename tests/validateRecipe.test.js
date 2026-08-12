let mockPublished = []
let mockDbError = false

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-30T00:00:00.000Z')
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(() => {
        if (mockDbError) {
          return {
            where: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })) }))
          }
        }
        return {
          where: jest.fn((q) => ({
            limit: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                const filtered = mockPublished.filter(r => r.status === q.status)
                return Promise.resolve({ data: filtered })
              })
            }))
          }))
        }
      }),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test-openid',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const validateRecipe = require('../cloudfunctions/validateRecipe/index')
const { validateRecipe: runValidation } = require('../cloudfunctions/common/recipeValidation')

const validRecipe = () => ({
  title: '花生酱香蕉吐司',
  nutrition: { calorie: 407, protein_g: 13, fat_g: 10, carb_g: 60, fiber_g: 3 },
  ingredients: [{ name: '全麦吐司', amount: 2, unit: '片', food_id: null, note: null }],
  steps: ['吐司烤至微焦', '涂抹花生酱'],
  tags: ['早餐', '快手'],
  source_id: 'CFC-2024',
  source_version: 'v1'
})

beforeEach(() => {
  mockPublished = []
  mockDbError = false
})

describe('validateRecipe - 纯函数基础规则', () => {
  test('合法食谱 PASS', () => {
    const res = runValidation(validRecipe(), [])
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
  })

  test('空 title FAIL', () => {
    const r = { ...validRecipe(), title: '' }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('title 不能为空')
  })

  test('空 ingredients FAIL', () => {
    const r = { ...validRecipe(), ingredients: [] }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('ingredients 不能为空')
  })

  test('ingredients 项缺少 name FAIL', () => {
    const r = { ...validRecipe(), ingredients: [{ amount: 2, unit: '片' }] }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
  })

  test('空 steps FAIL', () => {
    const r = { ...validRecipe(), steps: [] }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
  })

  test('calorie <= 0 FAIL', () => {
    const r = { ...validRecipe(), nutrition: { ...validRecipe().nutrition, calorie: 0 } }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('calorie 必须 > 0')
  })

  test('calorie > 2000 FAIL', () => {
    const r = { ...validRecipe(), nutrition: { ...validRecipe().nutrition, calorie: 2500 } }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('calorie 不能超过 2000')
  })

  test('protein 超范围 FAIL', () => {
    const r = { ...validRecipe(), nutrition: { ...validRecipe().nutrition, protein_g: 300 } }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('protein_g 不能超过 200')
  })

  test('缺少 nutrition FAIL', () => {
    const r = { ...validRecipe() }
    delete r.nutrition
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
  })

  test('source_id 为空 FAIL', () => {
    const r = { ...validRecipe(), source_id: '' }
    const res = runValidation(r, [])
    expect(res.valid).toBe(false)
  })

  test('重复食谱 FAIL 并标记 duplicate_of_id', () => {
    const existing = [{ _id: 'r1', title: '花生酱香蕉吐司' }]
    const res = runValidation(validRecipe(), existing)
    expect(res.valid).toBe(false)
    expect(res.checks.duplicate_of_id).toBe('r1')
  })

  test('标题空白差异不算重复（trim）', () => {
    const existing = [{ _id: 'r1', title: '花生酱香蕉吐司' }]
    const r = { ...validRecipe(), title: ' 花生酱香蕉吐司 ' }
    const res = runValidation(r, existing)
    expect(res.checks.duplicate_of_id).toBe('r1')
  })
})

describe('validateRecipe - 云函数', () => {
  test('缺少 recipe 返回 code 1', async () => {
    const res = await validateRecipe.main({}, {})
    expect(res.code).toBe(1)
  })

  test('合法食谱返回 code 0 valid=true', async () => {
    const res = await validateRecipe.main({ recipe: validRecipe() }, {})
    expect(res.code).toBe(0)
    expect(res.data.valid).toBe(true)
  })

  test('与已发布食谱重复返回 valid=false', async () => {
    mockPublished.push({ _id: 'r1', status: 'PUBLISHED', title: '花生酱香蕉吐司' })
    const res = await validateRecipe.main({ recipe: validRecipe() }, {})
    expect(res.code).toBe(0)
    expect(res.data.valid).toBe(false)
    expect(res.data.checks.duplicate_of_id).toBe('r1')
  })

  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await validateRecipe.main({ recipe: validRecipe() }, {})
    expect(res.code).toBe(-1)
  })
})
