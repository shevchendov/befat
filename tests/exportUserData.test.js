const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const exportUserData = require('../cloudfunctions/exportUserData/index')

beforeEach(() => {
  sdk.__resetDB()
})

describe('exportUserData - no data', () => {
  test('无用户时 user_info 为 null', async () => {
    const res = await exportUserData.main({}, {})
    expect(res.data.user_info).toBeNull()
  })

  test('无数据时 food_logs 和 weight_logs 为空数组', async () => {
    const res = await exportUserData.main({}, {})
    expect(res.data.food_logs).toEqual([])
    expect(res.data.weight_logs).toEqual([])
  })
})

describe('exportUserData - with user profile', () => {
  function seedUser() {
    sdk.__seed('users', {
      _openid: 'test-openid',
      height_cm: 175,
      current_weight_kg: 60,
      target_weight_kg: 65,
      gender: 'male',
      activity_level: 'moderate',
      age: 25
    })
  }

  test('user_info 包含用户字段', async () => {
    seedUser()
    const res = await exportUserData.main({}, {})
    expect(res.data.user_info).toMatchObject({
      height_cm: 175,
      current_weight_kg: 60,
      target_weight_kg: 65
    })
  })

  test('user_info 不包含 _id 和 _openid', async () => {
    seedUser()
    const res = await exportUserData.main({}, {})
    expect(res.data.user_info).not.toHaveProperty('_id')
    expect(res.data.user_info).not.toHaveProperty('_openid')
  })
})

describe('exportUserData - with logs', () => {
  function seedLogs() {
    sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: '米饭', meal_type: 'lunch', items: [{ name: '米饭', calorie: 200, protein_g: 4 }], total_calorie: 200, total_protein_g: 4 })
    sdk.__seed('weight_logs', { _openid: 'test-openid', date: '2026-07-29', weight_kg: 65 })
  }

  test('food_logs 包含记录且不含 _id _openid', async () => {
    seedLogs()
    const res = await exportUserData.main({}, {})
    expect(res.data.food_logs).toHaveLength(1)
    expect(res.data.food_logs[0]).not.toHaveProperty('_id')
    expect(res.data.food_logs[0]).not.toHaveProperty('_openid')
    expect(res.data.food_logs[0].raw_text).toBe('米饭')
  })

  test('weight_logs 包含记录且不含 _id _openid', async () => {
    seedLogs()
    const res = await exportUserData.main({}, {})
    expect(res.data.weight_logs).toHaveLength(1)
    expect(res.data.weight_logs[0]).not.toHaveProperty('_id')
    expect(res.data.weight_logs[0]).not.toHaveProperty('_openid')
    expect(res.data.weight_logs[0].weight_kg).toBe(65)
  })

  test('food_logs 按 date 升序排列', async () => {
    sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-28', raw_text: '早餐', meal_type: 'breakfast', items: [], total_calorie: 300, total_protein_g: 10 })
    sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: '午餐', meal_type: 'lunch', items: [], total_calorie: 500, total_protein_g: 20 })
    const res = await exportUserData.main({}, {})
    expect(res.data.food_logs[0].date).toBe('2026-07-28')
    expect(res.data.food_logs[1].date).toBe('2026-07-29')
  })
})

describe('exportUserData - response structure', () => {
  test('code=0, message=ok', async () => {
    const res = await exportUserData.main({}, {})
    expect(res.code).toBe(0)
    expect(res.message).toBe('ok')
  })

  test('data 包含 export_time（ISO 字符串）', async () => {
    const res = await exportUserData.main({}, {})
    expect(typeof res.data.export_time).toBe('string')
    expect(new Date(res.data.export_time).toISOString()).toBe(res.data.export_time)
  })
})

describe('exportUserData - user isolation', () => {
  test('只导出当前 _openid 的数据', async () => {
    sdk.__seed('food_logs', { _openid: 'test-openid', date: '2026-07-29', raw_text: '我的', meal_type: 'lunch', items: [], total_calorie: 500, total_protein_g: 20 })
    sdk.__seed('food_logs', { _openid: 'other-openid', date: '2026-07-29', raw_text: '别人的', meal_type: 'lunch', items: [], total_calorie: 300, total_protein_g: 10 })
    const res = await exportUserData.main({}, {})
    expect(res.data.food_logs).toHaveLength(1)
    expect(res.data.food_logs[0].raw_text).toBe('我的')
  })
})
