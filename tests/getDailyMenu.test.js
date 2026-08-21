let mockMenus = []

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-08-21T00:00:00.000Z')
  return {
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
          }),
          remove: jest.fn().mockImplementation(() => {
            const idx = mockMenus.findIndex(m => m._id === id)
            if (idx !== -1) mockMenus.splice(idx, 1)
            return Promise.resolve({})
          })
        })),
        add: jest.fn().mockImplementation(({ data }) => {
          if (mockMenus.find(m => m._id === data._id)) {
            return Promise.reject(new Error('duplicate key'))
          }
          mockMenus.push({ _id: data._id, ...data })
          return Promise.resolve({ _id: data._id })
        })
      })),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({ OPENID: 'test-openid', APPID: 'test-appid', UNIONID: null }))
  }
})

jest.mock('axios')

const getDailyMenu = require('../cloudfunctions/getDailyMenu/index')
const axios = require('axios')
const origEnv = process.env

function mockMenusResponse(meals) {
  axios.post.mockResolvedValue({ data: { choices: [{ message: { content: JSON.stringify({ meals }) } }] } })
}

function validMeals() {
  return [
    { meal_type: 'breakfast', title: '花生酱香蕉吐司', calorie: 400, protein_g: 20, ingredients: ['吐司'], steps: ['烤'] },
    { meal_type: 'lunch', title: '鸡腿饭', calorie: 500, protein_g: 30, ingredients: ['鸡腿'], steps: ['炒'] },
    { meal_type: 'snack', title: '燕麦杯', calorie: 120, protein_g: 8, ingredients: ['燕麦'], steps: ['泡'] },
    { meal_type: 'dinner', title: '牛肉面', calorie: 600, protein_g: 40, ingredients: ['牛肉'], steps: ['炖'] }
  ]
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

describe('getDailyMenu - 参数校验', () => {
  test('日期格式非法返回 code 1', async () => {
    const res = await getDailyMenu.main({ date: 'invalid' }, {})
    expect(res.code).toBe(1)
  })
})

describe('getDailyMenu - 缓存命中/未命中', () => {
  test('缓存命中直接返回，不调模型', async () => {
    mockMenus.push({
      _id: '2026-08-21', date: '2026-08-21', status: 'READY',
      meals: validMeals(), total_calorie: 1620, total_protein_g: 98, generated_by: 'glm-4-flash'
    })
    const res = await getDailyMenu.main({ date: '2026-08-21' }, {})
    expect(res.code).toBe(0)
    expect(res.data.from_fallback).toBe(false)
    expect(res.data.total_calorie).toBe(1620)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('首次生成调模型、后端重算总和、落库 READY', async () => {
    mockMenusResponse(validMeals())
    const res = await getDailyMenu.main({ date: '2026-08-21' }, {})
    expect(res.code).toBe(0)
    expect(res.data.total_calorie).toBe(1620)
    expect(res.data.total_protein_g).toBe(98)
    expect(axios.post).toHaveBeenCalledTimes(1)
    const doc = mockMenus.find(m => m._id === '2026-08-21')
    expect(doc.status).toBe('READY')
    expect(doc.total_calorie).toBe(1620)
  })

  test('并发请求仅调一次模型（占位锁防刷）', async () => {
    mockMenusResponse(validMeals())
    const results = await Promise.all([
      getDailyMenu.main({ date: '2026-08-21' }, {}),
      getDailyMenu.main({ date: '2026-08-21' }, {}),
      getDailyMenu.main({ date: '2026-08-21' }, {})
    ])
    expect(axios.post).toHaveBeenCalledTimes(1)
    results.forEach(r => expect(r.code).toBe(0))
  }, 10000)
})

describe('getDailyMenu - 生成兜底', () => {
  test('JSON 崩坏返回 code 93 兜底食谱', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '抱歉，我无法生成' } }] } })
    const res = await getDailyMenu.main({ date: '2026-08-21' }, {})
    expect(res.code).toBe(93)
    expect(res.data.from_fallback).toBe(true)
    expect(res.data.meals).toHaveLength(4)
  })

  test('API 超时返回 code 93', async () => {
    axios.post.mockRejectedValue(new Error('ECONNABORTED'))
    const res = await getDailyMenu.main({ date: '2026-08-21' }, {})
    expect(res.code).toBe(93)
    expect(res.data.meals).toHaveLength(4)
  })

  test('Markdown 包裹的 JSON 能正确剥离', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '```json\n' + JSON.stringify({ meals: validMeals() }) + '\n```' } }] } })
    const res = await getDailyMenu.main({ date: '2026-08-21' }, {})
    expect(res.code).toBe(0)
    expect(res.data.meals).toHaveLength(4)
  })
})

describe('getDailyMenu - 校验单元测试', () => {
  const { parseAndValidate, fmtBeijingDate } = getDailyMenu

  test('snack 热量下限放宽至 80，不误杀合理加餐', () => {
    const meals = [
      { meal_type: 'breakfast', title: 'a', calorie: 200, protein_g: 10, ingredients: [], steps: [] },
      { meal_type: 'lunch', title: 'b', calorie: 200, protein_g: 10, ingredients: [], steps: [] },
      { meal_type: 'snack', title: 'c', calorie: 90, protein_g: 5, ingredients: [], steps: [] },
      { meal_type: 'dinner', title: 'd', calorie: 200, protein_g: 10, ingredients: [], steps: [] }
    ]
    const parsed = parseAndValidate(JSON.stringify({ meals }))
    expect(parsed[2].calorie).toBe(90)
  })

  test('breakfast 低于 150 抛错拦截', () => {
    const meals = [
      { meal_type: 'breakfast', title: 'a', calorie: 90, protein_g: 10, ingredients: [], steps: [] },
      { meal_type: 'lunch', title: 'b', calorie: 200, protein_g: 10, ingredients: [], steps: [] },
      { meal_type: 'snack', title: 'c', calorie: 120, protein_g: 5, ingredients: [], steps: [] },
      { meal_type: 'dinner', title: 'd', calorie: 200, protein_g: 10, ingredients: [], steps: [] }
    ]
    expect(() => parseAndValidate(JSON.stringify({ meals }))).toThrow()
  })

  test('缺餐（3 餐）抛错拦截', () => {
    expect(() => parseAndValidate(JSON.stringify({ meals: validMeals().slice(0, 3) }))).toThrow()
  })

  test('fmtBeijingDate 凌晨生成正确日期（UTC+0 陷阱）', () => {
    const d = new Date('2026-08-20T16:30:00Z')
    expect(fmtBeijingDate(d)).toBe('2026-08-21')
  })
})