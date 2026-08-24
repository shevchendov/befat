let mockFavs = []
const mockOpenid = 'test-openid'

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'env-mock',
  database: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn((q) => ({
        get: jest.fn().mockResolvedValue({
          data: mockFavs.filter(f => f._openid === q._openid && f.recipe_title === q.recipe_title && f.meal_type === q.meal_type)
        })
      })),
      doc: jest.fn((id) => ({
        update: jest.fn().mockImplementation(({ data }) => {
          const idx = mockFavs.findIndex(f => f._id === id)
          if (idx !== -1) mockFavs[idx] = { ...mockFavs[idx], ...data }
          return Promise.resolve({})
        })
      }))
    })),
    serverDate: jest.fn(() => '2026-08-24T00:00:00.000Z')
  })),
  getWXContext: jest.fn(() => ({ OPENID: mockOpenid, APPID: 'test-appid', UNIONID: null }))
}))

const updateFavoriteDetail = require('../cloudfunctions/updateFavoriteDetail/index')

beforeEach(() => {
  mockFavs = []
})

describe('updateFavoriteDetail - 参数校验', () => {
  test('缺 recipe_title/meal_type 返回 code 1', async () => {
    const res = await updateFavoriteDetail.main({ ingredients: [], steps: [] }, {})
    expect(res.code).toBe(1)
  })

  test('ingredients/steps 非数组返回 code 2', async () => {
    const res = await updateFavoriteDetail.main({ recipe_title: 'x', meal_type: 'breakfast', ingredients: 'x', steps: [] }, {})
    expect(res.code).toBe(2)
  })
})

describe('updateFavoriteDetail - 写回', () => {
  test('收藏不存在返回 code 3', async () => {
    const res = await updateFavoriteDetail.main({ recipe_title: 'x', meal_type: 'breakfast', ingredients: [], steps: [] }, {})
    expect(res.code).toBe(3)
  })

  test('成功补全快照详情', async () => {
    mockFavs.push({
      _id: 'f1', _openid: mockOpenid, recipe_title: '溏心水煮蛋', meal_type: 'breakfast',
      recipe_snapshot: { title: '溏心水煮蛋', calorie: 180, protein_g: 12.5, meal_type: 'breakfast', ingredients: [], steps: [], date: '2026-08-24' }
    })
    const res = await updateFavoriteDetail.main({
      recipe_title: '溏心水煮蛋', meal_type: 'breakfast', ingredients: ['鸡蛋 2个'], steps: ['煮6分钟']
    }, {})
    expect(res.code).toBe(0)
    expect(mockFavs[0].recipe_snapshot.ingredients).toEqual(['鸡蛋 2个'])
    expect(mockFavs[0].recipe_snapshot.steps).toEqual(['煮6分钟'])
    expect(mockFavs[0].recipe_snapshot.title).toBe('溏心水煮蛋')
  })
})