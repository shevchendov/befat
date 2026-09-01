const util = require('../miniprogram/utils/util')

describe('formatDate', () => {
  test('formats date correctly', () => {
    expect(util.formatDate(new Date(2026, 6, 29))).toBe('2026-07-29')
  })

  test('uses current date when no argument', () => {
    const result = util.formatDate()
    const expected = new Date().toISOString().slice(0, 10)
    expect(result).toBe(expected)
  })

  test('pads single digit month and day', () => {
    expect(util.formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('handles year boundary', () => {
    expect(util.formatDate(new Date(2025, 11, 31))).toBe('2025-12-31')
  })
})

describe('getMealTypeLabel', () => {
  test('returns correct labels', () => {
    expect(util.getMealTypeLabel('breakfast')).toBe('早餐')
    expect(util.getMealTypeLabel('lunch')).toBe('午餐')
    expect(util.getMealTypeLabel('dinner')).toBe('晚餐')
    expect(util.getMealTypeLabel('snack')).toBe('加餐')
  })

  test('returns input for unknown type', () => {
    expect(util.getMealTypeLabel('brunch')).toBe('brunch')
  })

  test('handles empty string', () => {
    expect(util.getMealTypeLabel('')).toBe('')
  })
})

describe('getActivityLevelLabel', () => {
  test('returns correct labels', () => {
    expect(util.getActivityLevelLabel('sedentary')).toBe('久坐不动')
    expect(util.getActivityLevelLabel('light')).toBe('轻度活动')
    expect(util.getActivityLevelLabel('moderate')).toBe('中度活动')
    expect(util.getActivityLevelLabel('active')).toBe('高度活动')
  })

  test('returns input for unknown level', () => {
    expect(util.getActivityLevelLabel('extreme')).toBe('extreme')
  })
})

describe('calcBMI', () => {
  test('calculates BMI correctly', () => {
    expect(util.calcBMI(70, 175)).toBeCloseTo(22.86, 1)
  })

  test('returns 0 for zero weight', () => {
    expect(util.calcBMI(0, 175)).toBe(0)
  })

  test('handles low BMI case', () => {
    const bmi = util.calcBMI(45, 175)
    expect(bmi).toBeLessThan(16)
  })
})

describe('getHealthWarning', () => {
  test('danger for BMI < 16', () => {
    const result = util.getHealthWarning(15.5)
    expect(result.level).toBe('danger')
    expect(result.text).toContain('咨询医生')
  })

  test('warning for BMI 16-18.5', () => {
    const result = util.getHealthWarning(17.0)
    expect(result.level).toBe('warning')
    expect(result.text).toContain('增重计划')
  })

  test('normal for BMI 18.5-24', () => {
    const result = util.getHealthWarning(21.0)
    expect(result.level).toBe('normal')
    expect(result.text).toBe('体重正常')
  })

  test('info for BMI >= 24', () => {
    const result = util.getHealthWarning(26.0)
    expect(result.level).toBe('info')
    expect(result.text).toBe('体重偏高')
  })

  test('boundary at 16', () => {
    expect(util.getHealthWarning(16).level).toBe('warning')
  })

  test('boundary at 18.5', () => {
    expect(util.getHealthWarning(18.5).level).toBe('normal')
  })

  test('boundary at 24', () => {
    expect(util.getHealthWarning(24).level).toBe('info')
  })
})

describe('calcCalorieBySteps', () => {
  test('steps * 0.04 四舍五入', () => {
    expect(util.calcCalorieBySteps(5000)).toBe(200)
    expect(util.calcCalorieBySteps(10000)).toBe(400)
  })

  test('非法/非正输入返回 0', () => {
    expect(util.calcCalorieBySteps(0)).toBe(0)
    expect(util.calcCalorieBySteps(-5)).toBe(0)
    expect(util.calcCalorieBySteps('abc')).toBe(0)
    expect(util.calcCalorieBySteps(undefined)).toBe(0)
  })

  test('小数步数（字符串）可处理', () => {
    expect(util.calcCalorieBySteps('8000')).toBe(320)
  })
})

describe('calcFastingStatus 跨夜', () => {
  // 构造本地时区时间戳（与实现内 start 计算使用同一时区）
  function at(y, m, d, hh, mm) {
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
  }

  test('14:00 进食窗口内，剩余约 6 小时', () => {
    const r = util.calcFastingStatus(at(2026, 1, 15, 14, 0), 0)
    expect(r.isEating).toBe(true)
    expect(r.remainMs).toBeCloseTo(6 * 3600 * 1000)
    expect(r.elapsedFastingMs).toBe(0)
    expect(r.phase.title).toBe('消化期')
  })

  test('22:00 已越进食窗口，距次日 12:00 约 14 小时，进入脂肪期', () => {
    const r = util.calcFastingStatus(at(2026, 1, 15, 22, 0), 0)
    expect(r.isEating).toBe(false)
    expect(r.remainMs).toBeCloseTo(14 * 3600 * 1000)
    expect(r.elapsedFastingMs).toBeCloseTo(2 * 3600 * 1000) // 20:00 结束至 22:00
    expect(r.phase.title).toBe('消化期') // 2h < 8h
  })

  test('次日 01:30 断食延续，距当日 12:00 约 10.5 小时，进入动用脂肪', () => {
    const r = util.calcFastingStatus(at(2026, 1, 16, 1, 30), 0)
    expect(r.isEating).toBe(false)
    expect(r.remainMs).toBeCloseTo(10.5 * 3600 * 1000)
    // 断食时长为昨日 20:00 至次日 01:30 = 5.5h（仍 < 8h，消化期）
    expect(r.elapsedFastingMs).toBeCloseTo(5.5 * 3600 * 1000)
    expect(r.phase.title).toBe('消化期')
  })

  test('11:59 距 12:00 约 1 分钟', () => {
    const r = util.calcFastingStatus(at(2026, 1, 16, 11, 59), 0)
    expect(r.isEating).toBe(false)
    expect(r.remainMs).toBeCloseTo(60 * 1000)
  })

  test('offsetMin 偏移生效', () => {
    // offset 60 → 窗口 13:00–21:00，14:00 仍在窗口内
    const r = util.calcFastingStatus(at(2026, 1, 15, 14, 0), 60)
    expect(r.isEating).toBe(true)
  })

  test('跨 12~14h 触发深度燃脂阶段', () => {
    // 20:00 结束后第 13h = 次日 09:00
    const r = util.calcFastingStatus(at(2026, 1, 16, 9, 0), 0)
    expect(r.isEating).toBe(false)
    expect(r.phase.title).toBe('深度燃脂')
  })
})

describe('formatFastingPhase', () => {
  test('映射四阶段', () => {
    expect(util.formatFastingPhase(4).title).toBe('消化期')
    expect(util.formatFastingPhase(9).title).toBe('动用脂肪')
    expect(util.formatFastingPhase(13).title).toBe('深度燃脂')
    expect(util.formatFastingPhase(15).title).toBe('细胞自噬')
  })
})
