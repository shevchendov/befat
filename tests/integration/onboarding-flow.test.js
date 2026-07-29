jest.mock('wx-server-sdk')
require('./setup')
const calcTarget = require('../../cloudfunctions/calcTarget/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const sdk = require('wx-server-sdk')

describe('Onboarding → Daily Summary 集成', () => {

  test('完整流程：用户注册 → 保存目标 → 每日汇总反映目标', async () => {
    const reg = await calcTarget.main({
      height_cm: 175, current_weight_kg: 60, target_weight_kg: 62,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(reg.code).toBe(0)
    expect(reg.data.daily_calorie_target).toBeGreaterThan(2000)
    expect(reg.data.daily_protein_target_g).toBeGreaterThan(80)
    expect(reg.data.bmi).toBeCloseTo(19.6, 0)

    const db = sdk.__getDB()
    expect(db.users).toHaveLength(1)
    expect(db.users[0].height_cm).toBe(175)
    expect(db.users[0].daily_calorie_target).toBe(reg.data.daily_calorie_target)

    const summary = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(summary.code).toBe(0)
    expect(summary.data.target_calorie).toBe(reg.data.daily_calorie_target)
    expect(summary.data.target_protein).toBe(reg.data.daily_protein_target_g)
    expect(summary.data.total_calorie).toBe(0)
  })

  test('重复注册只更新不新增', async () => {
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'female', activity_level: 'light', age: 30
    }, {})

    const result = await calcTarget.main({
      height_cm: 172, current_weight_kg: 56, target_weight_kg: 58,
      gender: 'female', activity_level: 'moderate', age: 30
    }, {})

    expect(result.code).toBe(0)
    const db = sdk.__getDB('users')
    expect(db).toHaveLength(1)
    expect(db[0].height_cm).toBe(172)
    expect(db[0].daily_calorie_target).toBe(result.data.daily_calorie_target)
  })

  test('BMI < 16 时拦截并阻止写入', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 45, target_weight_kg: 55,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(2)
    expect(result.data.bmi).toBe(14.7)

    const db = sdk.__getDB('users')
    expect(db).toHaveLength(0)
  })

  test('每周增长 > 1kg 时拦截并阻止写入', async () => {
    const result = await calcTarget.main({
      height_cm: 175, current_weight_kg: 55, target_weight_kg: 85,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})
    expect(result.code).toBe(3)

    const db = sdk.__getDB('users')
    expect(db).toHaveLength(0)
  })

  test('两次不同用户（不同 _openid）互不干扰', async () => {
    const sdkMod = require('wx-server-sdk')
    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-a' }))
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})

    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-b' }))
    await calcTarget.main({
      height_cm: 160, current_weight_kg: 45, target_weight_kg: 47,
      gender: 'female', activity_level: 'light', age: 28
    }, {})

    const db = sdkMod.__getDB('users')
    expect(db).toHaveLength(2)
    expect(db[0]._openid).toBe('user-a')
    expect(db[1]._openid).toBe('user-b')
  })
})
