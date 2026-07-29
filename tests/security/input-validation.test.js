require('../interface/setup')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')
const calcTarget = require('../../cloudfunctions/calcTarget/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')

const VALID_USER = { height_cm: 175, current_weight_kg: 60, target_weight_kg: 62, gender: 'male', activity_level: 'moderate', age: 25 }

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ items: [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }], total_calorie: 200, total_protein_g: 4 }) } }]
    })
  })
})

describe('XSS / 注入', () => {
  const payloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    "'; DROP TABLE users; --",
    '${process.env.DEEPSEEK_API_KEY}',
    '{{constructor.constructor("return process")()}}',
    '../../etc/passwd'
  ]

  payloads.forEach(text => {
    test(`raw_text 含注入内容不崩溃: ${text.slice(0, 30)}`, async () => {
      const res = await parseFoodLog.main({ raw_text: text, meal_type: 'lunch', date: '2026-07-29' }, {})
      expect(res.code).toBe(0)
      expect(res.data.raw_text).toBe(text)
    })
  })

  test('raw_text 包含 emoji 和 unicode', async () => {
    const text = '😀🍕🧁 你好 こんにちは 안녕'
    const res = await parseFoodLog.main({ raw_text: text, meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
    expect(res.data.raw_text).toBe(text)
  })
})

describe('内容安全检查（msgSecCheck）', () => {
  test('违规内容返回 code 88', async () => {
    const sdk = require('wx-server-sdk')
    sdk.openapi.security.msgSecCheck.mockResolvedValue({ errCode: 87014, errMsg: 'risky content' })
    const res = await parseFoodLog.main({ raw_text: '违规内容', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(88)
    expect(res.message).toContain('违规')
  })

  test('安全检查服务不可用返回 code 89', async () => {
    const sdk = require('wx-server-sdk')
    sdk.openapi.security.msgSecCheck.mockRejectedValue(new Error('timeout'))
    const res = await parseFoodLog.main({ raw_text: '正常内容', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(89)
    expect(res.message).toContain('暂不可用')
  })

  test('安全检查通过后继续执行 AI 解析', async () => {
    const sdk = require('wx-server-sdk')
    sdk.openapi.security.msgSecCheck.mockResolvedValue({ errCode: 0, errMsg: 'ok' })
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
  })
})

describe('超大 Payload', () => {
  test('超长 raw_text（10KB）不崩溃', async () => {
    const longText = '米饭'.repeat(5000)
    const res = await parseFoodLog.main({ raw_text: longText, meal_type: 'lunch', date: '2026-07-29' }, {})
    expect([0, 3]).toContain(res.code)
  })

  test('超长 raw_text（100KB）不崩溃', async () => {
    const longText = 'a'.repeat(100000)
    const res = await parseFoodLog.main({ raw_text: longText, meal_type: 'lunch', date: '2026-07-29' }, {})
    expect([0, 3]).toContain(res.code)
  })

  test('所有字段全空字符串不崩溃', async () => {
    const res = await parseFoodLog.main({ raw_text: '', meal_type: '', date: '' }, {})
    expect(res.code).toBeGreaterThan(0)
  })
})

describe('NaN / Infinity / 负数', () => {
  test('weight_kg=NaN 应被拒绝', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: NaN }, {})
    expect(res.code).toBeGreaterThan(0)
  })

  test('weight_kg=Infinity 应被拒绝', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: Infinity }, {})
    expect(res.code).toBeGreaterThan(0)
  })

  test('weight_kg=-Infinity 应被拒绝', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: -Infinity }, {})
    expect(res.code).toBeGreaterThan(0)
  })

  test('weight_kg=负数 应被拒绝', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: -5 }, {})
    expect(res.code).toBeGreaterThan(0)
  })

  test('weight_kg=0 应被拒绝（falsy 视为缺少参数）', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 0 }, {})
    expect(res.code).toBe(1)
  })

  test('weight_kg=字符串类型数字被正常处理', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: '65' }, {})
    expect(res.code).toBe(0)
  })

  test('weight_kg=非数字字符串被拒绝', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 'abc' }, {})
    expect(res.code).toBe(2)
  })

  test('height_cm=负数 返回 code 1', async () => {
    const res = await calcTarget.main({ ...VALID_USER, height_cm: -10 }, {})
    expect(res.code).toBe(1)
  })

  test('height_cm=超大值 返回 code 1', async () => {
    const res = await calcTarget.main({ ...VALID_USER, height_cm: 999 }, {})
    expect(res.code).toBe(1)
  })

  test('age=负数 返回 code 1', async () => {
    const res = await calcTarget.main({ ...VALID_USER, age: -1 }, {})
    expect(res.code).toBe(1)
  })

  test('age=0 被拒绝', async () => {
    const res = await calcTarget.main({ ...VALID_USER, age: 0 }, {})
    expect(res.code).toBe(1)
  })
})

describe('meal_type 大小写容错', () => {
  const cases = [
    { input: 'lunch', expected: 0 },
    { input: 'Lunch', expected: 2 },
    { input: 'LUNCH', expected: 2 },
    { input: 'breakfast', expected: 0 },
    { input: 'BREAKFAST', expected: 2 },
    { input: 'dinner', expected: 0 },
    { input: 'Snack', expected: 2 },
    { input: 'brunch', expected: 2 }
  ]

  cases.forEach(({ input, expected }) => {
    test(`meal_type='${input}' 返回 code ${expected}`, async () => {
      const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: input, date: '2026-07-29' }, {})
      expect(res.code).toBe(expected)
    })
  })
})
