let mockMenus = []

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'env-mock',
  database: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn((id) => ({
        get: jest.fn().mockImplementation(() => {
          const doc = mockMenus.find(m => m._id === id)
          return Promise.resolve({ data: doc || null })
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          const idx = mockMenus.findIndex(m => m._id === id)
          if (idx !== -1) Object.assign(mockMenus[idx], data)
          return Promise.resolve({})
        })
      }))
    })),
    serverDate: jest.fn(() => '2026-08-21T00:00:00.000Z')
  })),
  getWXContext: jest.fn(() => ({ OPENID: 'test-openid' }))
}))

jest.mock('axios')

const getMealDetail = require('../cloudfunctions/getMealDetail/index')
const axios = require('axios')
const origEnv = process.env

function summaryMeal(overrides = {}) {
  return { meal_type: 'breakfast', title: '花生酱香蕉吐司', calorie: 400, protein_g: 20, ingredients: [], steps: [], ...overrides }
}

function seedMenu(meals) {
  mockMenus.push({ _id: '2026-08-21', date: '2026-08-21', status: 'READY', meals })
}

beforeEach(() => {
  mockMenus = []
  process.env = { ...origEnv }
  process.env.MENU_API_KEY = 'test-key'
  axios.post.mockReset()
})

afterEach(() => {
  process.env = origEnv
})

describe('getMealDetail - 参数校验', () => {
  test('缺参数返回 code 1', async () => {
    const res = await getMealDetail.main({}, {})
    expect(res.code).toBe(1)
  })

  test('无效餐次返回 code 2', async () => {
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'brunch', title: 'x' }, {})
    expect(res.code).toBe(2)
  })
})

describe('getMealDetail - 查库', () => {
  test('当日食谱不存在返回 code 3', async () => {
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: 'x' }, {})
    expect(res.code).toBe(3)
  })

  test('菜品不存在返回 code 4', async () => {
    seedMenu([summaryMeal()])
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: '不存在的菜' }, {})
    expect(res.code).toBe(4)
  })
})

describe('getMealDetail - 缓存与生成', () => {
  test('缓存命中直接返回，不调模型', async () => {
    seedMenu([summaryMeal({ ingredients: ['吐司 2片'], steps: ['烤'] })])
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: '花生酱香蕉吐司' }, {})
    expect(res.code).toBe(0)
    expect(res.data.cached).toBe(true)
    expect(res.data.ingredients).toEqual(['吐司 2片'])
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('未缓存时调模型生成并写回', async () => {
    seedMenu([summaryMeal()])
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: JSON.stringify({ ingredients: ['全麦吐司 2片', '花生酱 1勺'], steps: ['烤', '抹酱'] }) } }] } })
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: '花生酱香蕉吐司', calorie: 400, protein_g: 20 }, {})
    expect(res.code).toBe(0)
    expect(res.data.cached).toBe(false)
    expect(res.data.ingredients).toHaveLength(2)
    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(mockMenus[0].meals[0].ingredients).toHaveLength(2)
    expect(mockMenus[0].meals[0].steps).toHaveLength(2)
  })

  test('详情 JSON 崩坏返回 code -1', async () => {
    seedMenu([summaryMeal()])
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '不是JSON' } }] } })
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: '花生酱香蕉吐司' }, {})
    expect(res.code).toBe(-1)
  })

  test('高危食材被拦截返回 code -1', async () => {
    seedMenu([summaryMeal()])
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: JSON.stringify({ ingredients: ['生肉片'], steps: ['直接生吃'] }) } }] } })
    const res = await getMealDetail.main({ date: '2026-08-21', meal_type: 'breakfast', title: '花生酱香蕉吐司' }, {})
    expect(res.code).toBe(-1)
    expect(axios.post).toHaveBeenCalledTimes(1)
  })
})