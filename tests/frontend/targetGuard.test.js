const { validateTargetInput } = require('../../miniprogram/utils/targetGuard')

describe('validateTargetInput - 前端轻量预校验', () => {
  test('目标体重超过 300kg 时返回 toast 提示', () => {
    const res = validateTargetInput({
      height_cm: 175,
      current_weight_kg: 59,
      target_weight_kg: 600,
      target_weeks: 24
    })
    expect(res.ok).toBe(false)
    expect(res.toast).toBe(true)
    expect(res.code).toBeUndefined()
    expect(res.message).toBe('目标体重不能超过300kg')
  })

  test('BMI 过低（<16）时返回 code 2，与云函数文案一致', () => {
    const res = validateTargetInput({
      height_cm: 175,
      current_weight_kg: 40,
      target_weight_kg: 55,
      target_weeks: 24
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(2)
    expect(res.message).toMatch(/BMI 偏低/)
  })

  test('增重速率过快（>1kg/周）时返回 code 3，与云函数文案一致', () => {
    const res = validateTargetInput({
      height_cm: 175,
      current_weight_kg: 50,
      target_weight_kg: 90,
      target_weeks: 4
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(3)
    expect(res.message).toMatch(/增长过快/)
  })

  test('未传 target_weeks 时按默认 4 周判定速率', () => {
    const res = validateTargetInput({
      height_cm: 175,
      current_weight_kg: 50,
      target_weight_kg: 90,
      target_weeks: null
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(3)
  })

  test('合法输入返回 ok', () => {
    const res = validateTargetInput({
      height_cm: 175,
      current_weight_kg: 59,
      target_weight_kg: 70,
      target_weeks: 24
    })
    expect(res.ok).toBe(true)
  })

  test('缺少身高时不判定 BMI（降级跳过），只做速率校验', () => {
    const res = validateTargetInput({
      height_cm: null,
      current_weight_kg: 50,
      target_weight_kg: 95,
      target_weeks: 40
    })
    expect(res.ok).toBe(false)
    expect(res.code).toBe(3)
  })
})
