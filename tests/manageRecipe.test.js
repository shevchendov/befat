let mockRecipes = []
let mockDbError = false
const mockGenId = (() => { let i = 1; return () => 'rec-' + (i++) })()

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
            orderBy: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            doc: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            add: jest.fn(() => Promise.reject(new Error('db crash'))),
            get: jest.fn(() => Promise.reject(new Error('db crash')))
          }
        }
        return {
          where: jest.fn((q) => ({
            orderBy: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                const sorted = [...mockRecipes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                return Promise.resolve({ data: sorted })
              })
            })),
            get: jest.fn().mockImplementation(() => {
              const filtered = mockRecipes.filter(r => {
                for (const k in q) {
                  if (r[k] !== q[k]) return false
                }
                return true
              })
              return Promise.resolve({ data: filtered })
            })
          })),
          doc: jest.fn((id) => ({
            get: jest.fn().mockImplementation(() => {
              const doc = mockRecipes.find(r => r._id === id)
              return Promise.resolve({ data: doc || null })
            }),
            update: jest.fn().mockImplementation(({ data }) => {
              const idx = mockRecipes.findIndex(r => r._id === id)
              if (idx !== -1) Object.assign(mockRecipes[idx], data)
              return Promise.resolve({})
            }),
            remove: jest.fn().mockImplementation(() => {
              const idx = mockRecipes.findIndex(r => r._id === id)
              if (idx !== -1) mockRecipes.splice(idx, 1)
              return Promise.resolve({})
            })
          })),
          add: jest.fn().mockImplementation(({ data }) => {
            const doc = { _id: mockGenId(), ...data }
            mockRecipes.push(doc)
            return Promise.resolve({ _id: doc._id })
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(() => {
              const sorted = [...mockRecipes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
              return Promise.resolve({ data: sorted })
            })
          })),
          get: jest.fn().mockImplementation(() => Promise.resolve({ data: mockRecipes }))
        }
      }),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'ADMIN_OPENID_PLACEHOLDER',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const manageRecipe = require('../cloudfunctions/manageRecipe/index')

beforeEach(() => {
  mockRecipes = []
  mockDbError = false
  const sdk = require('wx-server-sdk')
  sdk.getWXContext.mockReturnValue({ OPENID: 'ADMIN_OPENID_PLACEHOLDER', APPID: 'test-appid', UNIONID: null })
})

describe('manageRecipe - 权限校验', () => {
  test('非管理员返回 403', async () => {
    const sdk = require('wx-server-sdk')
    sdk.getWXContext.mockReturnValueOnce({ OPENID: 'not-admin', APPID: 'test-appid', UNIONID: null })
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(403)
    expect(res.message).toBe('无权限')
  })
})

describe('manageRecipe - action 参数校验', () => {
  test('缺少 action 返回 code 1', async () => {
    const res = await manageRecipe.main({}, {})
    expect(res.code).toBe(1)
  })

  test('不合法的 action 返回 code 1', async () => {
    const res = await manageRecipe.main({ action: 'invalid' }, {})
    expect(res.code).toBe(1)
  })
})

describe('manageRecipe - add', () => {
  test('缺少必要参数返回 code 1', async () => {
    const res = await manageRecipe.main({ action: 'add', title: 'test' }, {})
    expect(res.code).toBe(1)
  })

  test('成功新增食谱', async () => {
    const res = await manageRecipe.main({
      action: 'add',
      title: '测试食谱',
      calorie: 500,
      protein_g: 30,
      ingredients: ['鸡蛋', '牛奶'],
      steps: ['打蛋', '加热'],
      tags: ['早餐']
    }, {})
    expect(res.code).toBe(0)
    expect(res.data.recipe_id).toBeTruthy()
    expect(mockRecipes).toHaveLength(1)
    expect(mockRecipes[0].title).toBe('测试食谱')
  })
})

describe('manageRecipe - list', () => {
  test('空列表', async () => {
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toEqual([])
  })

  test('返回全部食谱', async () => {
    await manageRecipe.main({ action: 'add', title: '食谱A', calorie: 300, protein_g: 20 }, {})
    await manageRecipe.main({ action: 'add', title: '食谱B', calorie: 400, protein_g: 25 }, {})
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toHaveLength(2)
  })
})

describe('manageRecipe - update', () => {
  test('缺少 recipe_id 返回 code 1', async () => {
    const res = await manageRecipe.main({ action: 'update' }, {})
    expect(res.code).toBe(1)
  })

  test('更新不存在的食谱返回 code 2', async () => {
    const res = await manageRecipe.main({ action: 'update', recipe_id: 'nonexistent' }, {})
    expect(res.code).toBe(2)
  })

  test('成功更新食谱', async () => {
    const addRes = await manageRecipe.main({ action: 'add', title: '旧标题', calorie: 300, protein_g: 20 }, {})
    const res = await manageRecipe.main({ action: 'update', recipe_id: addRes.data.recipe_id, title: '新标题', calorie: 500 }, {})
    expect(res.code).toBe(0)
    const updated = mockRecipes.find(r => r._id === addRes.data.recipe_id)
    expect(updated.title).toBe('新标题')
    expect(updated.calorie).toBe(500)
  })
})

describe('manageRecipe - delete', () => {
  test('缺少 recipe_id 返回 code 1', async () => {
    const res = await manageRecipe.main({ action: 'delete' }, {})
    expect(res.code).toBe(1)
  })

  test('删除不存在的食谱返回 code 2', async () => {
    const res = await manageRecipe.main({ action: 'delete', recipe_id: 'nonexistent' }, {})
    expect(res.code).toBe(2)
  })

  test('成功删除食谱', async () => {
    const addRes = await manageRecipe.main({ action: 'add', title: '待删除', calorie: 300, protein_g: 20 }, {})
    expect(mockRecipes).toHaveLength(1)
    const res = await manageRecipe.main({ action: 'delete', recipe_id: addRes.data.recipe_id }, {})
    expect(res.code).toBe(0)
    expect(mockRecipes).toHaveLength(0)
  })
})

describe('manageRecipe - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(-1)
  })
})
