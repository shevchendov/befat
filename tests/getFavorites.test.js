let mockFavs = []
const mockOpenid = 'test-openid'

jest.mock('wx-server-sdk', () => {
  const filterFavs = (q) => {
    return mockFavs.filter(f => {
      if (q._openid && f._openid !== q._openid) return false
      if (q.meal_type) {
        if (typeof q.meal_type === 'string') {
          if (f.meal_type !== q.meal_type) return false
        } else if (q.meal_type && Array.isArray(q.meal_type.in)) {
          if (!q.meal_type.in.includes(f.meal_type)) return false
        }
      }
      return true
    })
  }
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      command: { in: (arr) => ({ in: arr }) },
      collection: jest.fn(() => ({
        where: jest.fn((q) => ({
          count: jest.fn().mockResolvedValue({ total: filterFavs(q).length }),
          orderBy: jest.fn(() => ({
            skip: jest.fn((n) => ({
              limit: jest.fn((m) => ({
                get: jest.fn().mockResolvedValue({
                  data: filterFavs(q).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(n, n + m)
                })
              }))
            }))
          }))
        }))
      })),
      serverDate: jest.fn(() => '2026-08-24T00:00:00.000Z')
    })),
    getWXContext: jest.fn(() => ({ OPENID: mockOpenid, APPID: 'test-appid', UNIONID: null }))
  }
})

const getFavorites = require('../cloudfunctions/getFavorites/index')

function seedFav(meal_type, title) {
  mockFavs.push({
    _id: 'f' + (mockFavs.length + 1),
    _openid: mockOpenid,
    recipe_id: null,
    recipe_title: title,
    meal_type,
    recipe_snapshot: {
      title,
      calorie: 180,
      protein_g: 12.5,
      meal_type,
      ingredients: ['食材 1'],
      steps: ['步骤 1'],
      date: '2026-08-24'
    },
    created_at: '2026-08-24T10:00:' + String(mockFavs.length).padStart(2, '0') + '.000Z'
  })
}

beforeEach(() => {
  mockFavs = []
})

describe('getFavorites - 参数校验', () => {
  test('无效 meal_type 返回 code 1', async () => {
    const res = await getFavorites.main({ meal_type: 'brunch' }, {})
    expect(res.code).toBe(1)
  })
})

describe('getFavorites - 列表', () => {
  test('空收藏返回空列表', async () => {
    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.list).toEqual([])
    expect(res.data.total).toBe(0)
    expect(res.data.has_more).toBe(false)
  })

  test('返回快照拍平列表', async () => {
    seedFav('breakfast', '溏心水煮蛋')
    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.list).toHaveLength(1)
    expect(res.data.list[0].title).toBe('溏心水煮蛋')
    expect(res.data.list[0].calorie).toBe(180)
    expect(res.data.list[0].ingredients).toEqual(['食材 1'])
    expect(res.data.total).toBe(1)
    expect(res.data.has_more).toBe(false)
  })

  test('meal_type 单值筛选', async () => {
    seedFav('breakfast', '蛋')
    seedFav('lunch', '饭')
    const res = await getFavorites.main({ meal_type: 'lunch' }, {})
    expect(res.data.list).toHaveLength(1)
    expect(res.data.list[0].title).toBe('饭')
  })

  test('meal_types 数组筛选（正餐合并）', async () => {
    seedFav('breakfast', '蛋')
    seedFav('lunch', '饭')
    seedFav('dinner', '面')
    const res = await getFavorites.main({ meal_types: ['lunch', 'dinner'] }, {})
    expect(res.data.list).toHaveLength(2)
    expect(res.data.total).toBe(2)
  })

  test('分页 has_more 正确', async () => {
    for (let i = 0; i < 3; i++) seedFav('breakfast', '菜' + i)
    const res = await getFavorites.main({ page: 1, limit: 2 }, {})
    expect(res.data.list).toHaveLength(2)
    expect(res.data.total).toBe(3)
    expect(res.data.has_more).toBe(true)
  })
})