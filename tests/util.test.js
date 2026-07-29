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
