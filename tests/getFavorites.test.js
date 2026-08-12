let mockRecipes = []
let mockFavorites = []
let mockDbError = false
const mockFavGenId = (() => { let i = 1; return () => 'fav-' + (i++) })()
const mockRecGenId = (() => { let i = 1; return () => 'rec-' + (i++) })()

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-30T00:00:00.000Z')
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn((name) => {
        if (mockDbError) {
          return {
            where: jest.fn(() => ({ orderBy: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })), get: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            get: jest.fn(() => Promise.reject(new Error('db crash')))
          }
        }
        if (name === 'recipes') {
          return {
            where: jest.fn((q) => ({
              get: jest.fn().mockImplementation(() => {
                const filtered = mockRecipes.filter(r => {
                  const idOk = q._id && q._id.in ? q._id.in.includes(r._id) : true
                  const statusOk = q.status ? r.status === q.status : true
                  return idOk && statusOk
                })
                return Promise.resolve({ data: filtered })
              })
            })),
            get: jest.fn().mockResolvedValue({ data: [] })
          }
        }
        return {
          where: jest.fn((q) => ({
            orderBy: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                const sorted = [...mockFavorites]
                  .filter(r => { for (const k in q) { if (r[k] !== q[k]) return false }; return true })
                  .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                return Promise.resolve({ data: sorted })
              })
            })),
            get: jest.fn().mockImplementation(() => {
              const filtered = mockFavorites.filter(r => {
                for (const k in q) {
                  if (r[k] !== q[k]) return false
                }
                return true
              })
              return Promise.resolve({ data: filtered })
            })
          })),
          add: jest.fn().mockImplementation(({ data }) => {
            const doc = { _id: mockFavGenId(), ...data }
            mockFavorites.push(doc)
            return Promise.resolve({ _id: doc._id })
          })
        }
      }),
      serverDate: mockServerDate,
      command: {
        in: (arr) => ({ in: arr })
      }
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test-openid',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const getFavorites = require('../cloudfunctions/getFavorites/index')

beforeEach(() => {
  mockRecipes = []
  mockFavorites = []
  mockDbError = false
})

describe('getFavorites', () => {
  test('空收藏返回空列表', async () => {
    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toEqual([])
  })

  test('返回收藏的已发布食谱（DTO 扁平化）', async () => {
    const rec1 = { _id: mockRecGenId(), title: '食谱A', status: 'PUBLISHED', nutrition: { calorie: 300, protein_g: 20, fat_g: 5, carb_g: 50, fiber_g: 2 }, tags: ['早餐'] }
    const rec2 = { _id: mockRecGenId(), title: '食谱B', status: 'PUBLISHED', nutrition: { calorie: 400, protein_g: 25, fat_g: 6, carb_g: 60, fiber_g: 3 }, tags: ['午餐'] }
    mockRecipes.push(rec1, rec2)
    const sdk = require('wx-server-sdk')
    const db = sdk.database()
    await db.collection('user_favorites').add({ data: { _openid: 'test-openid', recipe_id: rec1._id, created_at: '2026-07-30T00:00:00.000Z' } })
    await db.collection('user_favorites').add({ data: { _openid: 'test-openid', recipe_id: rec2._id, created_at: '2026-07-29T00:00:00.000Z' } })

    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toHaveLength(2)
    expect(res.data.recipes[0].title).toBe('食谱A')
    expect(res.data.recipes[0].calorie).toBe(300)
    expect(res.data.recipes[0].protein_g).toBe(20)
    expect(res.data.recipes[1].title).toBe('食谱B')
  })

  test('被删除食谱跳过（不崩溃）', async () => {
    const rec1 = { _id: mockRecGenId(), title: '已存在', status: 'PUBLISHED', nutrition: { calorie: 300, protein_g: 20 }, tags: [] }
    mockRecipes.push(rec1)
    const sdk = require('wx-server-sdk')
    const db = sdk.database()
    await db.collection('user_favorites').add({ data: { _openid: 'test-openid', recipe_id: rec1._id, created_at: '2026-07-30T00:00:00.000Z' } })
    await db.collection('user_favorites').add({ data: { _openid: 'test-openid', recipe_id: 'deleted-recipe', created_at: '2026-07-29T00:00:00.000Z' } })

    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toHaveLength(1)
    expect(res.data.recipes[0].title).toBe('已存在')
  })

  test('ARCHIVED 食谱不返回', async () => {
    const recArchived = { _id: mockRecGenId(), title: '已归档', status: 'ARCHIVED', nutrition: { calorie: 300, protein_g: 20 }, tags: [] }
    mockRecipes.push(recArchived)
    const sdk = require('wx-server-sdk')
    const db = sdk.database()
    await db.collection('user_favorites').add({ data: { _openid: 'test-openid', recipe_id: recArchived._id, created_at: '2026-07-30T00:00:00.000Z' } })

    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toHaveLength(0)
  })
})

describe('getFavorites - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await getFavorites.main({}, {})
    expect(res.code).toBe(-1)
  })
})
