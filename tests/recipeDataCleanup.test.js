let mockRecipes = []
let mockFavorites = []
let mockDbError = false
let mockOpenid = 'ADMIN_OPENID_PLACEHOLDER'

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-30T00:00:00.000Z')
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn((name) => {
        if (mockDbError) {
          return {
            skip: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })) })),
            doc: jest.fn(() => ({ remove: jest.fn(() => Promise.reject(new Error('db crash'))) }))
          }
        }
        const store = name === 'recipes' ? mockRecipes : mockFavorites
        return {
          skip: jest.fn((n) => ({
            limit: jest.fn((m) => ({
              get: jest.fn().mockImplementation(() => {
                return Promise.resolve({ data: store.slice(n, n + m) })
              })
            }))
          })),
          doc: jest.fn((id) => ({
            remove: jest.fn().mockImplementation(() => {
              const idx = store.findIndex(r => r._id === id)
              if (idx !== -1) store.splice(idx, 1)
              return Promise.resolve({})
            })
          }))
        }
      }),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: mockOpenid,
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const recipeDataCleanup = require('../cloudfunctions/recipeDataCleanup/index')

beforeEach(() => {
  mockRecipes = []
  mockFavorites = []
  mockDbError = false
  mockOpenid = 'ADMIN_OPENID_PLACEHOLDER'
})

describe('recipeDataCleanup - 权限', () => {
  test('非管理员返回 403', async () => {
    mockOpenid = 'not-admin'
    const res = await recipeDataCleanup.main({}, {})
    expect(res.code).toBe(403)
  })
})

describe('recipeDataCleanup - dry-run', () => {
  test('默认 dry-run，统计不删除', async () => {
    mockRecipes.push({ _id: 'r1' }, { _id: 'r2' })
    mockFavorites.push(
      { _id: 'f1', recipe_id: 'r1' },
      { _id: 'f2', recipe_id: 'deleted-recipe' }
    )
    const res = await recipeDataCleanup.main({}, {})
    expect(res.code).toBe(0)
    expect(res.dry_run).toBe(true)
    expect(res.recipes_count).toBe(2)
    expect(res.favorites_count).toBe(2)
    expect(res.orphan_favorites_count).toBe(1)
    expect(mockRecipes).toHaveLength(2)
    expect(mockFavorites).toHaveLength(2)
  })

  test('显式 dry_run=true 不删除', async () => {
    mockRecipes.push({ _id: 'r1' })
    const res = await recipeDataCleanup.main({ dry_run: true }, {})
    expect(res.dry_run).toBe(true)
    expect(mockRecipes).toHaveLength(1)
  })

  test('dry_run=true 即使带 confirm 也不删除', async () => {
    mockRecipes.push({ _id: 'r1' })
    const res = await recipeDataCleanup.main({ dry_run: true, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(res.code).toBe(0)
    expect(res.dry_run).toBe(true)
    expect(mockRecipes).toHaveLength(1)
  })
})

describe('recipeDataCleanup - execute 硬确认', () => {
  test('dry_run=false 但缺少 confirm 拒绝删除', async () => {
    mockRecipes.push({ _id: 'r1' })
    const res = await recipeDataCleanup.main({ dry_run: false }, {})
    expect(res.code).toBe(4)
    expect(mockRecipes).toHaveLength(1)
  })

  test('dry_run=false 且 confirm 错误拒绝删除', async () => {
    mockRecipes.push({ _id: 'r1' })
    const res = await recipeDataCleanup.main({ dry_run: false, confirm: 'WRONG_TOKEN' }, {})
    expect(res.code).toBe(4)
    expect(mockRecipes).toHaveLength(1)
  })

  test('delete 前输出 recipes_count 与 orphan_favorites_count', async () => {
    mockRecipes.push({ _id: 'r1' }, { _id: 'r2' })
    mockFavorites.push(
      { _id: 'f1', recipe_id: 'r1' },
      { _id: 'f2', recipe_id: 'ghost' }
    )
    const res = await recipeDataCleanup.main({ dry_run: false, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(res.recipes_count).toBe(2)
    expect(res.orphan_favorites_count).toBe(1)
  })

  test('删除全部 recipes 与孤儿收藏', async () => {
    mockRecipes.push({ _id: 'r1' }, { _id: 'r2' })
    mockFavorites.push(
      { _id: 'f1', recipe_id: 'r1' },
      { _id: 'f2', recipe_id: 'deleted-recipe' }
    )
    const res = await recipeDataCleanup.main({ dry_run: false, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(res.code).toBe(0)
    expect(res.dry_run).toBe(false)
    expect(res.deleted_recipes).toBe(2)
    expect(res.deleted_orphan_favorites).toBe(1)
    expect(mockRecipes).toHaveLength(0)
    expect(mockFavorites).toHaveLength(1)
  })

  test('删除历史 recipe 后不产生非法 favorite', async () => {
    mockRecipes.push({ _id: 'r1' })
    mockFavorites.push({ _id: 'f1', recipe_id: 'r1' })
    await recipeDataCleanup.main({ dry_run: false, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(mockRecipes).toHaveLength(0)
    const remaining = mockFavorites.filter(f => mockRecipes.some(r => r._id === f.recipe_id))
    expect(remaining).toHaveLength(0)
  })

  test('孤儿 favorite 能被清理', async () => {
    mockFavorites.push(
      { _id: 'f1', recipe_id: 'ghost-1' },
      { _id: 'f2', recipe_id: 'ghost-2' }
    )
    const res = await recipeDataCleanup.main({ dry_run: false, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(res.deleted_orphan_favorites).toBe(2)
    expect(mockFavorites).toHaveLength(0)
  })

  test('空数据清理静默成功', async () => {
    const res = await recipeDataCleanup.main({ dry_run: false, confirm: 'DELETE_ALL_LEGACY_RECIPES' }, {})
    expect(res.code).toBe(0)
    expect(res.deleted_recipes).toBe(0)
    expect(res.deleted_orphan_favorites).toBe(0)
  })
})

describe('recipeDataCleanup - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await recipeDataCleanup.main({}, {})
    expect(res.code).toBe(-1)
  })
})
