let mockFavorites = []
let mockDbError = false
const mockGenId = (() => { let i = 1; return () => 'fav-' + (i++) })()

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-30T00:00:00.000Z')
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(() => {
        if (mockDbError) {
          return {
            where: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            doc: jest.fn(() => ({ remove: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            add: jest.fn(() => Promise.reject(new Error('db crash')))
          }
        }
        return {
          where: jest.fn((q) => ({
            get: jest.fn().mockImplementation(() => {
              const filtered = mockFavorites.filter(r => {
                for (const k in q) {
                  if (r[k] !== q[k]) return false
                }
                return true
              })
              return Promise.resolve({ data: filtered })
            }),
            doc: jest.fn((id) => ({
              remove: jest.fn().mockImplementation(() => {
                const idx = mockFavorites.findIndex(r => r._id === id)
                if (idx !== -1) mockFavorites.splice(idx, 1)
                return Promise.resolve({})
              })
            }))
          })),
          doc: jest.fn((id) => ({
            remove: jest.fn().mockImplementation(() => {
              const idx = mockFavorites.findIndex(r => r._id === id)
              if (idx !== -1) mockFavorites.splice(idx, 1)
              return Promise.resolve({})
            })
          })),
          add: jest.fn().mockImplementation(({ data }) => {
            const doc = { _id: mockGenId(), ...data }
            mockFavorites.push(doc)
            return Promise.resolve({ _id: doc._id })
          })
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

const toggleFavorite = require('../cloudfunctions/toggleFavorite/index')

beforeEach(() => {
  mockFavorites = []
  mockDbError = false
})

describe('toggleFavorite - 参数校验', () => {
  test('缺少 recipe_id 返回 code 1', async () => {
    const res = await toggleFavorite.main({}, {})
    expect(res.code).toBe(1)
  })
})

describe('toggleFavorite - 收藏/取消收藏', () => {
  test('首次收藏返回 favorited=true', async () => {
    const res = await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    expect(res.code).toBe(0)
    expect(res.data.favorited).toBe(true)
    expect(mockFavorites).toHaveLength(1)
  })

  test('重复收藏返回 favorited=false（取消收藏）', async () => {
    await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    expect(mockFavorites).toHaveLength(1)
    const res = await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    expect(res.code).toBe(0)
    expect(res.data.favorited).toBe(false)
    expect(mockFavorites).toHaveLength(0)
  })

  test('收藏多个不同食谱', async () => {
    const r1 = await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    const r2 = await toggleFavorite.main({ recipe_id: 'recipe-2' }, {})
    expect(r1.data.favorited).toBe(true)
    expect(r2.data.favorited).toBe(true)
    expect(mockFavorites).toHaveLength(2)
  })

  test('取消收藏不影响其他收藏', async () => {
    await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    await toggleFavorite.main({ recipe_id: 'recipe-2' }, {})
    await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    expect(mockFavorites).toHaveLength(1)
    expect(mockFavorites[0].recipe_id).toBe('recipe-2')
  })
})

describe('toggleFavorite - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await toggleFavorite.main({ recipe_id: 'recipe-1' }, {})
    expect(res.code).toBe(-1)
  })
})
