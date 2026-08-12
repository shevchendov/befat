let mockRecipes = []
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
            doc: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) }))
          }
        }
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockImplementation(() => {
              const doc = mockRecipes.find(r => r._id === id)
              return Promise.resolve({ data: doc || null })
            })
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

const getRecipeDetail = require('../cloudfunctions/getRecipeDetail/index')

beforeEach(() => {
  mockRecipes = []
  mockDbError = false
})

function pub(id, title) {
  return {
    _id: id,
    title,
    status: 'PUBLISHED',
    version: 2,
    nutrition: { calorie: 500, protein_g: 30, fat_g: 10, carb_g: 60, fiber_g: 5 },
    ingredients: [{ name: '鸡蛋', amount: 2, unit: '个', food_id: null, note: null }],
    steps: ['打蛋', '煎蛋'],
    tags: ['早餐', '高蛋白'],
    image_url: 'http://img/1.png'
  }
}

describe('getRecipeDetail - 参数校验', () => {
  test('缺少 id 返回 code 1', async () => {
    const res = await getRecipeDetail.main({}, {})
    expect(res.code).toBe(1)
  })
})

describe('getRecipeDetail - 状态过滤', () => {
  test('PUBLISHED 可以读取', async () => {
    mockRecipes.push(pub('p1', '已发布'))
    const res = await getRecipeDetail.main({ id: 'p1' }, {})
    expect(res.code).toBe(0)
    expect(res.data.title).toBe('已发布')
  })

  test('DRAFT 读取失败', async () => {
    mockRecipes.push({ _id: 'd1', title: '草稿', status: 'DRAFT' })
    const res = await getRecipeDetail.main({ id: 'd1' }, {})
    expect(res.code).toBe(3)
  })

  test('不存在 ID 失败', async () => {
    const res = await getRecipeDetail.main({ id: 'nonexistent' }, {})
    expect(res.code).toBe(2)
  })
})

describe('getRecipeDetail - 返回结构', () => {
  test('返回 nutrition 新版结构', async () => {
    mockRecipes.push(pub('p1', '菜谱'))
    const res = await getRecipeDetail.main({ id: 'p1' }, {})
    expect(res.data.nutrition).toEqual({
      calorie: 500, protein_g: 30, fat_g: 10, carb_g: 60, fiber_g: 5
    })
  })

  test('返回 calorie/protein_g 兼容字段', async () => {
    mockRecipes.push(pub('p1', '菜谱'))
    const res = await getRecipeDetail.main({ id: 'p1' }, {})
    expect(res.data.calorie).toBe(500)
    expect(res.data.protein_g).toBe(30)
  })

  test('返回结构化 ingredients 与版本号', async () => {
    mockRecipes.push(pub('p1', '菜谱'))
    const res = await getRecipeDetail.main({ id: 'p1' }, {})
    expect(res.data.ingredients[0]).toEqual({
      name: '鸡蛋', amount: 2, unit: '个', food_id: null, note: null
    })
    expect(res.data.version).toBe(2)
  })
})

describe('getRecipeDetail - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await getRecipeDetail.main({ id: 'p1' }, {})
    expect(res.code).toBe(-1)
  })
})
