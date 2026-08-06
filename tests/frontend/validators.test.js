const { sanitizeDigit, sanitizeNumber, clampNumber, validateWeight } = require('../../miniprogram/utils/validators')

describe('sanitizeDigit - 数字输入过滤（统一最多 2 位小数）', () => {
  test('2 位小数正常保留', () => {
    expect(sanitizeDigit('59.12')).toBe('59.12')
  })

  test('超过 2 位小数截断到 2 位', () => {
    expect(sanitizeDigit('59.123456')).toBe('59.12')
  })

  test('整数不受影响', () => {
    expect(sanitizeDigit('600')).toBe('600')
  })

  test('多小数点只保留第一个及后 2 位', () => {
    expect(sanitizeDigit('1.2.3')).toBe('1.23')
    expect(sanitizeDigit('59.123.456')).toBe('59.12')
  })

  test('尾部小数点保留（不打断连续输入），parseFloat 解析合法', () => {
    expect(sanitizeDigit('59.')).toBe('59.')
    expect(parseFloat(sanitizeDigit('59.'))).toBe(59)
  })

  test('过滤非法字符', () => {
    expect(sanitizeDigit('ab59.c12')).toBe('59.12')
    expect(sanitizeDigit('-3.5')).toBe('3.5')
  })

  test('空输入返回空串', () => {
    expect(sanitizeDigit('')).toBe('')
  })
})

describe('sanitizeNumber - 纯数字过滤', () => {
  test('只保留数字', () => {
    expect(sanitizeNumber('a1b2c3')).toBe('123')
    expect(sanitizeNumber('24.5')).toBe('245')
  })
})

describe('clampNumber / validateWeight - 范围钳制', () => {
  test('clampNumber 在区间外钳制到边界（返回数值），区间内返回字符串', () => {
    expect(clampNumber(10, 20, 300)).toBe(20)
    expect(clampNumber(400, 20, 300)).toBe(300)
    expect(clampNumber(50, 20, 300)).toBe('50')
  })

  test('非数字返回空串', () => {
    expect(clampNumber('abc', 20, 300)).toBe('')
  })

  test('validateWeight 钳制 20-300', () => {
    expect(validateWeight(59)).toBe('59')
    expect(validateWeight(5)).toBe(20)
    expect(validateWeight(599)).toBe(300)
  })
})
