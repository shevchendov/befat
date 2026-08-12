let mockRecipes = []
let mockDbError = false
let mockOpenid = 'ADMIN_OPENID_PLACEHOLDER'
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
            where: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })) })),
            orderBy: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })) })),
            doc: jest.fn(() => ({ get: jest.fn(() => Promise.reject(new Error('db crash'))) })),
            add: jest.fn(() => Promise.reject(new Error('db crash')))
          }
        }
        return {
          where: jest.fn((q) => ({
            limit: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                const filtered = mockRecipes.filter(r => {
                  for (const k in q) {
                    if (r[k] !== q[k]) return false
                  }
                  return true
                })
                return Promise.resolve({ data: filtered })
              })
            }))
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
            limit: jest.fn(() => ({
              get: jest.fn().mockImplementation(() => {
                const sorted = [...mockRecipes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                return Promise.resolve({ data: sorted })
              })
            }))
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

const manageRecipe = require('../cloudfunctions/manageRecipe/index')

function validAddEvent(overrides = {}) {
  return {
    action: 'add',
    title: '花生酱香蕉吐司',
    nutrition: { calorie: 407, protein_g: 13, fat_g: 10, carb_g: 60, fiber_g: 3 },
    ingredients: [{ name: '全麦吐司', amount: 2, unit: '片', food_id: null, note: null }],
    steps: ['吐司烤至微焦', '涂抹花生酱'],
    tags: ['早餐', '快手'],
    source_id: 'CFC-2024',
    source_version: 'v1',
    ...overrides
  }
}

beforeEach(() => {
  mockRecipes = []
  mockDbError = false
  mockOpenid = 'ADMIN_OPENID_PLACEHOLDER'
})

describe('manageRecipe - 权限校验', () => {
  test('非管理员返回 403', async () => {
    mockOpenid = 'not-admin'
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(403)
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

  test('新增食谱默认 status=DRAFT, version=1', async () => {
    const res = await manageRecipe.main(validAddEvent(), {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('DRAFT')
    const added = mockRecipes[0]
    expect(added.version).toBe(1)
    expect(added.nutrition.calorie).toBe(407)
    expect(added.status).toBe('DRAFT')
    expect(added.versions).toEqual([])
    expect(added.base_nutrition_checked).toBeDefined()
  })

  test('校验失败返回 code 2（calorie 超限）', async () => {
    const res = await manageRecipe.main(validAddEvent({
      nutrition: { calorie: 2500, protein_g: 13 }
    }), {})
    expect(res.code).toBe(2)
    expect(mockRecipes).toHaveLength(0)
  })

  test('重复标题返回 code 2', async () => {
    mockRecipes.push({ _id: 'existing', status: 'PUBLISHED', title: '花生酱香蕉吐司' })
    const res = await manageRecipe.main(validAddEvent(), {})
    expect(res.code).toBe(2)
    expect(res.errors).toContain('与现有食谱重复')
  })
})

describe('manageRecipe - list', () => {
  test('空列表', async () => {
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toEqual([])
  })

  test('返回食谱（含 status 等管理字段）', async () => {
    await manageRecipe.main(validAddEvent(), {})
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(0)
    expect(res.data.recipes).toHaveLength(1)
    expect(res.data.recipes[0].status).toBe('DRAFT')
  })
})

describe('manageRecipe - update', () => {
  test('缺少 recipe_id 返回 code 1', async () => {
    const res = await manageRecipe.main({ action: 'update' }, {})
    expect(res.code).toBe(1)
  })

  test('更新不存在的食谱返回 code 2', async () => {
    const res = await manageRecipe.main({ action: 'update', recipe_id: 'nonexistent', title: 'x' }, {})
    expect(res.code).toBe(2)
  })

  test('成功更新食谱', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    const res = await manageRecipe.main({
      action: 'update', recipe_id: id, title: '新标题',
      nutrition: { calorie: 500, protein_g: 20, fat_g: 5, carb_g: 70, fiber_g: 2 }
    }, {})
    expect(res.code).toBe(0)
    const updated = mockRecipes.find(r => r._id === id)
    expect(updated.title).toBe('新标题')
    expect(updated.nutrition.calorie).toBe(500)
  })

  test('已发布食谱不可直接编辑', async () => {
    mockRecipes.push({
      _id: 'pub1', title: '已发布', status: 'PUBLISHED', version: 1,
      nutrition: { calorie: 400, protein_g: 20, fat_g: 0, carb_g: 0, fiber_g: 0 },
      ingredients: [{ name: '鸡蛋' }], steps: ['步骤'], tags: ['早餐'],
      base_nutrition_checked: {}, versions: []
    })
    const res = await manageRecipe.main({ action: 'update', recipe_id: 'pub1', title: '改标题' }, {})
    expect(res.code).toBe(4)
  })
})

describe('manageRecipe - delete', () => {
  test('成功删除食谱', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    const res = await manageRecipe.main({ action: 'delete', recipe_id: id }, {})
    expect(res.code).toBe(0)
    expect(mockRecipes).toHaveLength(0)
  })
})

describe('manageRecipe - review 审核', () => {
  function seedPending(id) {
    mockRecipes.push({
      _id: id, title: '待审核', status: 'PENDING_REVIEW', version: 1,
      nutrition: { calorie: 400, protein_g: 20, fat_g: 0, carb_g: 0, fiber_g: 0 },
      ingredients: [{ name: '鸡蛋' }], steps: ['步骤'], tags: ['早餐'],
      base_nutrition_checked: {}, versions: []
    })
  }

  test('submit 将 DRAFT 提交为 VALIDATING', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    expect(mockRecipes.find(r => r._id === id).status).toBe('DRAFT')
    const res = await manageRecipe.main({ action: 'review', recipe_id: id, decision: 'submit', note: '申请审核' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('VALIDATING')
  })

  test('非 DRAFT/VALIDATION_FAILED/REJECTED 状态不能 submit', async () => {
    seedPending('p1')
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'p1', decision: 'submit', note: 'x' }, {})
    expect(res.code).toBe(4)
  })

  test('review(approve) 从 VALIDATING 可审核通过', async () => {
    mockRecipes.push({
      _id: 'v1', title: '校验中', status: 'VALIDATING', version: 1,
      nutrition: { calorie: 400, protein_g: 20, fat_g: 0, carb_g: 0, fiber_g: 0 },
      ingredients: [{ name: '鸡蛋' }], steps: ['步骤'], tags: ['早餐'],
      base_nutrition_checked: {}, versions: []
    })
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'v1', decision: 'approve', note: '通过' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('APPROVED')
  })

  test('非 PENDING_REVIEW 状态不能审核', async () => {
    mockRecipes.push({ _id: 'd1', title: '草稿', status: 'DRAFT' })
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'd1', decision: 'approve', note: 'ok' }, {})
    expect(res.code).toBe(4)
  })

  test('approve 必须有 note', async () => {
    seedPending('p1')
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'p1', decision: 'approve' }, {})
    expect(res.code).toBe(1)
  })

  test('approve 后状态为 APPROVED 且写入审核记录', async () => {
    seedPending('p1')
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'p1', decision: 'approve', note: '内容正确' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('APPROVED')
    const doc = mockRecipes.find(r => r._id === 'p1')
    expect(doc.review_record.review_type).toBe('manual')
    expect(doc.review_record.action).toBe('approve')
    expect(doc.review_record.note).toBe('内容正确')
  })

  test('reject 后状态为 REJECTED', async () => {
    seedPending('p1')
    const res = await manageRecipe.main({ action: 'review', recipe_id: 'p1', decision: 'reject', note: '食材超标' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('REJECTED')
  })
})

describe('manageRecipe - approve 发布', () => {
  function seedApproved(id, withVersions = false) {
    mockRecipes.push({
      _id: id, title: '已过审', status: 'APPROVED', version: 1,
      nutrition: { calorie: 400, protein_g: 20, fat_g: 5, carb_g: 60, fiber_g: 2 },
      ingredients: [{ name: '鸡蛋', amount: 2, unit: '个' }], steps: ['步骤'], tags: ['早餐'],
      source_id: 'CFC-2024', source_version: 'v1',
      nutrition_snapshot: { source_id: 'CFC-2024', source_version: 'v1', retrieved_at: '2026-07-30T00:00:00.000Z', calculation_method: 'manual_verified', reviewer: null, reviewed_at: null },
      base_nutrition_checked: {}, versions: withVersions ? [{ version: 1, nutrition: {}, ingredients: [], steps: [], tags: [], timestamp: '2026-07-30T00:00:00.000Z', reason: 'initial_publish' }] : []
    })
  }

  test('approve 必须有 note', async () => {
    seedApproved('p1')
    const res = await manageRecipe.main({ action: 'approve', recipe_id: 'p1' }, {})
    expect(res.code).toBe(1)
  })

  test('非 APPROVED 状态不能发布', async () => {
    seedApproved('p1')
    mockRecipes[0].status = 'PENDING_REVIEW'
    const res = await manageRecipe.main({ action: 'approve', recipe_id: 'p1', note: 'ok' }, {})
    expect(res.code).toBe(4)
  })

  test('approve 后状态 PUBLISHED 且写入 versions 快照', async () => {
    seedApproved('p1')
    const res = await manageRecipe.main({ action: 'approve', recipe_id: 'p1', note: '准予发布' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('PUBLISHED')
    const doc = mockRecipes.find(r => r._id === 'p1')
    expect(doc.status).toBe('PUBLISHED')
    expect(doc.published_at).toBeDefined()
    expect(doc.versions).toHaveLength(1)
    expect(doc.versions[0].reason).toBe('initial_publish')
    expect(doc.versions[0].version).toBe(1)
    expect(doc.nutrition_snapshot.reviewer).toBe('ADMIN_OPENID_PLACEHOLDER')
  })
})

describe('manageRecipe - archive 归档', () => {
  test('仅 PUBLISHED 可归档', async () => {
    mockRecipes.push({ _id: 'd1', title: '草稿', status: 'DRAFT' })
    const res = await manageRecipe.main({ action: 'archive', recipe_id: 'd1' }, {})
    expect(res.code).toBe(4)
  })

  test('归档成功且设置 archived_at', async () => {
    mockRecipes.push({
      _id: 'pub1', title: '已发布', status: 'PUBLISHED', version: 1,
      nutrition: { calorie: 400, protein_g: 20, fat_g: 0, carb_g: 0, fiber_g: 0 },
      ingredients: [{ name: '鸡蛋' }], steps: ['步骤'], tags: ['早餐'],
      base_nutrition_checked: {}, versions: []
    })
    const res = await manageRecipe.main({ action: 'archive', recipe_id: 'pub1' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('ARCHIVED')
    const doc = mockRecipes.find(r => r._id === 'pub1')
    expect(doc.archived_at).toBeDefined()
  })
})

describe('manageRecipe - rollback 回滚', () => {
  function seedPublishedWithVersions() {
    mockRecipes.push({
      _id: 'pub1', title: '已发布', status: 'PUBLISHED', version: 3,
      nutrition: { calorie: 600, protein_g: 40, fat_g: 10, carb_g: 80, fiber_g: 4 },
      ingredients: [{ name: '牛肉', amount: 150, unit: 'g' }], steps: ['炖'], tags: ['晚餐'],
      source_id: 'CFC-2024', source_version: 'v1',
      nutrition_snapshot: { source_id: 'CFC-2024', source_version: 'v1', retrieved_at: '2026-07-30T00:00:00.000Z', calculation_method: 'manual_verified', reviewer: 'admin', reviewed_at: '2026-07-30T00:00:00.000Z' },
      base_nutrition_checked: {},
      versions: [
        { version: 1, nutrition: { calorie: 400, protein_g: 20 }, ingredients: [{ name: '鸡蛋' }], steps: ['旧'], tags: ['早餐'], timestamp: '2026-07-28T00:00:00.000Z', reason: 'initial_publish' },
        { version: 2, nutrition: { calorie: 500, protein_g: 30 }, ingredients: [{ name: '鸡胸' }], steps: ['中'], tags: ['午餐'], timestamp: '2026-07-29T00:00:00.000Z', reason: 'content_update' },
        { version: 3, nutrition: { calorie: 600, protein_g: 40 }, ingredients: [{ name: '牛肉' }], steps: ['新'], tags: ['晚餐'], timestamp: '2026-07-30T00:00:00.000Z', reason: 'content_update' }
      ]
    })
  }

  test('回滚到 v1，version 递增为 4 且内容恢复', async () => {
    seedPublishedWithVersions()
    const res = await manageRecipe.main({ action: 'rollback', recipe_id: 'pub1', target_version: 1 }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('PUBLISHED')
    expect(res.data.version).toBe(4)
    const doc = mockRecipes.find(r => r._id === 'pub1')
    expect(doc.version).toBe(4)
    expect(doc.nutrition.calorie).toBe(400)
    expect(doc.ingredients[0].name).toBe('鸡蛋')
    expect(doc.versions).toHaveLength(4)
    expect(doc.versions[3].reason).toBe('rollback_from_v3_to_v1')
    expect(doc.versions[3].version).toBe(4)
  })

  test('目标版本不存在返回 code 4', async () => {
    seedPublishedWithVersions()
    const res = await manageRecipe.main({ action: 'rollback', recipe_id: 'pub1', target_version: 99 }, {})
    expect(res.code).toBe(4)
  })
})

describe('manageRecipe - 完整生命周期无绕过', () => {
  test('DRAFT→VALIDATING→APPROVED→PUBLISHED 唯一发布路径', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    expect(mockRecipes.find(r => r._id === id).status).toBe('DRAFT')

    const submitRes = await manageRecipe.main({ action: 'review', recipe_id: id, decision: 'submit', note: '提交' }, {})
    expect(submitRes.data.status).toBe('VALIDATING')

    const approveRes = await manageRecipe.main({ action: 'review', recipe_id: id, decision: 'approve', note: '审核通过' }, {})
    expect(approveRes.data.status).toBe('APPROVED')

    const publishRes = await manageRecipe.main({ action: 'approve', recipe_id: id, note: '发布' }, {})
    expect(publishRes.data.status).toBe('PUBLISHED')
    const doc = mockRecipes.find(r => r._id === id)
    expect(doc.status).toBe('PUBLISHED')
    expect(doc.versions).toHaveLength(1)
  })

  test('不能从 DRAFT 直接 approve 发布（无绕过）', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    const res = await manageRecipe.main({ action: 'approve', recipe_id: id, note: 'x' }, {})
    expect(res.code).toBe(4)
    expect(mockRecipes.find(r => r._id === id).status).toBe('DRAFT')
  })

  test('不能从 VALIDATING 直接 approve 发布（无绕过）', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    await manageRecipe.main({ action: 'review', recipe_id: id, decision: 'submit', note: '提交' }, {})
    const res = await manageRecipe.main({ action: 'approve', recipe_id: id, note: 'x' }, {})
    expect(res.code).toBe(4)
  })

  test('add 不接受客户端 status 参数（强制 DRAFT）', async () => {
    const res = await manageRecipe.main({ ...validAddEvent(), status: 'PUBLISHED' }, {})
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('DRAFT')
    expect(mockRecipes[0].status).toBe('DRAFT')
  })

  test('update 不接受 status 参数（状态不变化）', async () => {
    const addRes = await manageRecipe.main(validAddEvent(), {})
    const id = addRes.data.recipe_id
    await manageRecipe.main({ action: 'update', recipe_id: id, title: '新标题', status: 'PUBLISHED' }, {})
    expect(mockRecipes.find(r => r._id === id).status).toBe('DRAFT')
  })
})

describe('manageRecipe - 崩溃处理', () => {
  test('数据库异常返回 code -1', async () => {
    mockDbError = true
    const res = await manageRecipe.main({ action: 'list' }, {})
    expect(res.code).toBe(-1)
  })
})
