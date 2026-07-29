jest.mock('wx-server-sdk')
require('./setup')
const calcTarget = require('../../cloudfunctions/calcTarget/index')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')
const exportUserData = require('../../cloudfunctions/exportUserData/index')
const deleteUserData = require('../../cloudfunctions/deleteUserData/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const sdk = require('wx-server-sdk')

describe('数据生命周期 集成', () => {

  test('创建数据 → 导出验证 → 删除 → 确认为空', async () => {
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})

    const col = sdk.__getDB('food_logs')
    col.push({ _id: 'f1', _openid: 'test-openid', date: '2026-07-29', meal_type: 'lunch', total_calorie: 500, total_protein_g: 25 })

    await saveWeightLog.main({ date: '2026-07-20', weight_kg: 55 }, {})
    await saveWeightLog.main({ date: '2026-07-25', weight_kg: 56 }, {})

    const exported = await exportUserData.main({}, {})
    expect(exported.code).toBe(0)
    expect(exported.data.user_info).toBeTruthy()
    expect(exported.data.user_info.height_cm).toBe(170)
    expect(exported.data.user_info._openid).toBeUndefined()
    expect(exported.data.user_info._id).toBeUndefined()
    expect(exported.data.food_logs).toHaveLength(1)
    expect(exported.data.food_logs[0].date).toBe('2026-07-29')
    expect(exported.data.food_logs[0]._openid).toBeUndefined()
    expect(exported.data.weight_logs).toHaveLength(2)

    const deleted = await deleteUserData.main({}, {})
    expect(deleted.code).toBe(0)

    const db = sdk.__getDB()
    expect(db.users).toHaveLength(0)
    expect(db.food_logs).toHaveLength(0)
    expect(db.weight_logs).toHaveLength(0)
  })

  test('导出时 user_info 为 null 如果用户不存在', async () => {
    const exported = await exportUserData.main({}, {})
    expect(exported.code).toBe(0)
    expect(exported.data.user_info).toBeNull()
    expect(exported.data.food_logs).toEqual([])
    expect(exported.data.weight_logs).toEqual([])
  })

  test('重复删除不报错', async () => {
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 60,
      gender: 'male', activity_level: 'light', age: 25
    }, {})

    await deleteUserData.main({}, {})
    const result = await deleteUserData.main({}, {})
    expect(result.code).toBe(0)
  })

  test('删除后每日汇总回到初始状态', async () => {
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})

    const col = sdk.__getDB('food_logs')
    col.push({ _id: 'f1', _openid: 'test-openid', date: '2026-07-29', meal_type: 'lunch', total_calorie: 600, total_protein_g: 30 })

    const before = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(before.data.target_calorie).toBeGreaterThan(0)
    expect(before.data.total_calorie).toBe(600)

    await deleteUserData.main({}, {})

    const after = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(after.data.total_calorie).toBe(0)
    expect(after.data.target_calorie).toBe(0)
    expect(after.data.target_protein).toBe(0)
  })

  test('多条 food_logs 批量删除', async () => {
    const col = sdk.__getDB('food_logs')
    for (let i = 0; i < 50; i++) {
      col.push({
        _id: 'fl-' + i,
        _openid: 'test-openid',
        date: '2026-07-' + String(i + 1).padStart(2, '0'),
        meal_type: 'lunch',
        total_calorie: 300,
        total_protein_g: 15
      })
    }

    await deleteUserData.main({}, {})
    expect(sdk.__getDB('food_logs')).toHaveLength(0)
  })
})
