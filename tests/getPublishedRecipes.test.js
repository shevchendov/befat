let mockRecipes = []
let mockDbError = false

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-30T00:00:00.000Z')
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn((name) => {
        if (mockDbError) {
          return {
            where: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                skip: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })) }))
              })),
              limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) }))
            }))
          }
        }
        return {
          where: jest.fn((q) => ({
            orderBy: jest.fn(() => ({
              skip: jest.fn((n) => ({
                limit: jest.fn((m) => ({
                  get: jest.fn().mockImplementation(() => {
                    const sorted = mockRecipes
                      .filter(r => r.status === q.status)
                      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                    return Promise.resolve({ data: sorted.slice(n, n + m) })
                  })
                }))
              })),
              limit: jest.fn((m) => ({
                get: jest.fn().mockImplementation(() => {
                  const sorted = mockRecipes
                    .filter(r => r.status === q.status)
                    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                  return Promise.resolve({ data: sorted.slice(0, m) })
                })
              }))
            }))
          }))
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

const getPublishedRecipes = require('../cloudfunctions/getPublishedRecipes/index')

beforeEach(() => {
  mockRecipes = []
  mockDbError = false
})

function pub(id, title, tags, calorie) {
  return {
    _id: id, title, status: 'PUBLISHED', tags: tags || [],
    nutrition: { calorie: calorie || 400, protein_g: 20 },
    created_at: '2026-07-2' + (id.length % 10) + 'T00:00:00.000Z'
  }
}

describe('getPublishedRecipes - 状态过滤', () => {
  test('只返回 PUBLISHED 食谱', async () => {
    mockRecipes.push(
      pub('p1', '已发布', ['早餐']),
      { _id: 'd1', title: '草稿', status: 'DRAFT', tags: [], created_at: '2026-07-29T00:00:00.000Z' },
      { _id: 'r1', title: '待审核', status: 'PENDING_REVIEW', tags: [], created_at: '2026-07-29T00:00:00.000Z' },
      { _id: 'a1', title: '已归档', status: 'ARCHIVED', tags: [], created_at: '2026-07-29T00:00:00.000Z' }
    )
    const res = await getPublishedRecipes.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.list).toHaveLength(1)
    expect(res.data.list[0].title).toBe('已发布')
  })

  test('DRAFT 不返回', async () => {
    mockRecipes.push({ _id: 'd1', title: '草稿', status: 'DRAFT', tags: [], created_at: '2026-07-29T00:00:00.000Z' })
    const res = await getPublishedRecipes.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.list).toEqual([])
  })
})

describe('getPublishedRecipes - 分页', () => {
  test('默认 limit=20', async () => {
    for (let i = 1; i <= 25; i++) {
      mockRecipes.push(pub('p' + i, '食谱' + i, []))
    }
    const res = await getPublishedRecipes.main({}, {})
    expect(res.data.list).toHaveLength(20)
    expect(res.data.limit).toBe(20)
    expect(res.data.page).toBe(1)
  })

  test('第二页返回剩余', async () => {
    for (let i = 1; i <= 25; i++) {
      mockRecipes.push(pub('p' + i, '食谱' + i, []))
    }
    const res = await getPublishedRecipes.main({ page: 2 }, {})
    expect(res.data.list).toHaveLength(5)
  })

  test('limit 被限制在 100 以内', async () => {
    const res = await getPublishedRecipes.main({ limit: 9999 }, {})
    expect(res.data.limit).toBe(100)
  })
})

describe('getPublishedRecipes - 标签过滤', () => {
  test('按 meal_tag 过滤', async () => {
    mockRecipes.push(
      pub('p1', '早餐A', ['早餐', '快手']),
      pub('p2', '午餐B', ['午餐']),
      pub('p3', '早餐C', ['早餐'])
    )
    const res = await getPublishedRecipes.main({ meal_tag: '早餐' }, {})
    expect(res.code).toBe(0)
    expect(res.data.list).toHaveLength(2)
  })

  test('按 tags 数组多标签过滤（需全部命中）', async () => {
    mockRecipes.push(
      pub('p1', '高蛋白早餐', ['早餐', '高蛋白']),
      pub('p2', '早餐', ['早餐'])
    )
    const res = await getPublishedRecipes.main({ tags: ['早餐', '高蛋白'] }, {})
    expect(res.data.list).toHaveLength(1)
    expect(res.data.list[0].title).toBe('高蛋白早餐')
  })
})

describe('getPublishedRecipes - DTO', () => {
  test('返回 id/calorie/protein_g 扁平字段', async () => {
    mockRecipes.push(pub('p1', '菜谱', ['早餐'], 550))
    const res = await getPublishedRecipes.main({}, {})
    const item = res.data.list[0]
    expect(item).toEqual({
      id: 'p1',
      title: '菜谱',
      calorie: 550,
      protein_g: 20,
      tags: ['早餐'],
      image_url: ''
    })
    expect(item).not.toHaveProperty('status')
    expect(item).not.toHaveProperty('steps')
  })
})

describe('getPublishedRecipes - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await getPublishedRecipes.main({}, {})
    expect(res.code).toBe(-1)
  })
})
