const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const resetUserData = require('../cloudfunctions/resetUserData/index')

beforeEach(() => {
  sdk.__resetDB()
})

function seedInitializedUser(overrides) {
  return sdk.__seed('users', {
    _openid: 'test-openid',
    created_at: '2026-01-01T00:00:00.000Z',
    height_cm: 175,
    current_weight_kg: 60,
    target_weight_kg: 70,
    gender: 'male',
    activity_level: 'moderate',
    age: 25,
    daily_calorie_target: 2600,
    daily_protein_target_g: 108,
    bmi: 19.6,
    target_weeks: 12,
    target_weeks_set_at: '2026-07-20',
    expected_weekly_rate: 0.8333,
    ...overrides
  })
}

function seedBusinessData() {
  sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: '米饭', meal_type: 'lunch', items: [], total_calorie: 500, total_protein_g: 10 })
  sdk.__seed('weight_logs', { _openid: 'test-openid', date: '2026-07-29', weight_kg: 65 })
  sdk.__seed('user_favorites', { _openid: 'test-openid', recipe_id: 'r1' })
}

describe('resetUserData - confirm guard', () => {
  test('未传 confirm 时拒绝执行且不删除任何数据', async () => {
    const user = seedInitializedUser()
    seedBusinessData()

    const res = await resetUserData.main({}, {})
    expect(res.code).toBe(1)

    const db = sdk.__getDB()
    expect(db.users).toHaveLength(1)
    expect(db.users[0].target_weight_kg).toBe(70)
    expect(db.food_logs).toHaveLength(1)
    expect(db.weight_logs).toHaveLength(1)
    expect(db.user_favorites).toHaveLength(1)
    expect(db.error_logs).toHaveLength(0)
  })

  test('confirm 传字符串 true 也拒绝（必须严格 === true）', async () => {
    seedInitializedUser()
    const res = await resetUserData.main({ confirm: 'true' }, {})
    expect(res.code).toBe(1)
    expect(sdk.__getDB('users')).toHaveLength(1)
  })
})

describe('resetUserData - preserves identity, clears business fields', () => {
  test('保留 _openid 和 created_at，其余业务字段置空', async () => {
    seedInitializedUser()
    const res = await resetUserData.main({ confirm: true }, {})
    expect(res.code).toBe(0)

    const users = sdk.__getDB('users')
    expect(users).toHaveLength(1)
    const u = users[0]
    expect(u._openid).toBe('test-openid')
    expect(u.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(u.height_cm).toBeNull()
    expect(u.current_weight_kg).toBeNull()
    expect(u.target_weight_kg).toBeNull()
    expect(u.gender).toBeNull()
    expect(u.activity_level).toBeNull()
    expect(u.age).toBeNull()
    expect(u.daily_calorie_target).toBeNull()
    expect(u.daily_protein_target_g).toBeNull()
    expect(u.bmi).toBeNull()
    expect(u.target_weeks).toBeNull()
    expect(u.target_weeks_set_at).toBeNull()
    expect(u.expected_weekly_rate).toBeNull()
  })
})

describe('resetUserData - clears business collections', () => {
  test('清空 food_logs / weight_logs / user_favorites', async () => {
    seedInitializedUser()
    seedBusinessData()
    await resetUserData.main({ confirm: true }, {})
    const db = sdk.__getDB()
    expect(db.food_logs).toHaveLength(0)
    expect(db.weight_logs).toHaveLength(0)
    expect(db.user_favorites).toHaveLength(0)
  })

  test('只清当前 openid，不影响其他用户', async () => {
    seedInitializedUser()
    seedBusinessData()
    sdk.__seed('users', { _openid: 'other-openid', created_at: '2026-02-01T00:00:00.000Z', target_weight_kg: 65, current_weight_kg: 60 })
    sdk.__seed('weight_logs', { _openid: 'other-openid', date: '2026-07-30', weight_kg: 60 })
    sdk.__seed('user_favorites', { _openid: 'other-openid', recipe_id: 'r2' })

    await resetUserData.main({ confirm: true }, {})
    const db = sdk.__getDB()
    const other = db.users.find(u => u._openid === 'other-openid')
    expect(other.target_weight_kg).toBe(65)
    expect(db.weight_logs).toHaveLength(1)
    expect(db.user_favorites).toHaveLength(1)
  })
})

describe('resetUserData - audit log', () => {
  test('写入 error_logs，action=reset_user，extra 含删除计数', async () => {
    seedInitializedUser()
    seedBusinessData()
    await resetUserData.main({ confirm: true }, {})

    const logs = sdk.__getDB('error_logs')
    expect(logs).toHaveLength(1)
    expect(logs[0]._openid).toBe('test-openid')
    expect(logs[0].action).toBe('reset_user')
    expect(logs[0].extra.deleted).toEqual({ food_logs: 1, weight_logs: 1, user_favorites: 1 })
  })
})

describe('resetUserData - edge cases', () => {
  test('用户不存在时返回错误，不写审计', async () => {
    const res = await resetUserData.main({ confirm: true }, {})
    expect(res.code).toBe(1)
    expect(sdk.__getDB('error_logs')).toHaveLength(0)
  })

  test('重复重置幂等不报错', async () => {
    seedInitializedUser()
    await resetUserData.main({ confirm: true }, {})
    const res = await resetUserData.main({ confirm: true }, {})
    expect(res.code).toBe(0)
    expect(sdk.__getDB('error_logs')).toHaveLength(2)
  })
})
