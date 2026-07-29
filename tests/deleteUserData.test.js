const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const deleteUserData = require('../cloudfunctions/deleteUserData/index')

beforeEach(() => {
  sdk.__resetDB()
})

describe('deleteUserData - empty database', () => {
  test('无数据时静默成功', async () => {
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
    expect(res.message).toContain('已删除')
  })

  test('删除后所有集合为空', async () => {
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.users).toHaveLength(0)
    expect(db.food_logs).toHaveLength(0)
    expect(db.weight_logs).toHaveLength(0)
  })
})

describe('deleteUserData - deletes data', () => {
  function seedAll() {
    sdk.__seed('users', { _openid: 'test-openid', height_cm: 175, current_weight_kg: 60 })
    sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: '米饭', meal_type: 'lunch', items: [], total_calorie: 500, total_protein_g: 10 })
    sdk.__seed('weight_logs', { _openid: 'test-openid', date: '2026-07-29', weight_kg: 65 })
  }

  test('删除 users 集合', async () => {
    seedAll()
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.users).toHaveLength(0)
  })

  test('删除 food_logs 集合', async () => {
    seedAll()
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.food_logs).toHaveLength(0)
  })

  test('删除 weight_logs 集合', async () => {
    seedAll()
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.weight_logs).toHaveLength(0)
  })

  test('删除后返回成功', async () => {
    seedAll()
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
  })
})

describe('deleteUserData - user isolation', () => {
  test('只删除当前 _openid 的数据', async () => {
    sdk.__seed('users', { _openid: 'test-openid', height_cm: 175 })
    sdk.__seed('users', { _openid: 'other-openid', height_cm: 180 })
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.users).toHaveLength(1)
    expect(db.users[0]._openid).toBe('other-openid')
  })
})

describe('deleteUserData - batch delete', () => {
  test('超过 100 条时批量删除', async () => {
    for (let i = 0; i < 150; i++) {
      sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: `food ${i}`, meal_type: 'lunch', items: [], total_calorie: 100, total_protein_g: 5 })
    }
    await deleteUserData.main({}, {})
    const db = sdk.__getDB()
    expect(db.food_logs).toHaveLength(0)
  })
})

describe('deleteUserData - idempotent', () => {
  test('重复删除不报错', async () => {
    sdk.__seed('users', { _openid: 'test-openid', height_cm: 175 })
    await deleteUserData.main({}, {})
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
  })
})
