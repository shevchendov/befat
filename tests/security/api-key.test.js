require('../interface/setup')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ items: [], total_calorie: 0, total_protein_g: 0 }) } }]
    })
  })
})

describe('DEEPSEEK_API_KEY 边界', () => {
  test('key 为空字符串返回 code 3', async () => {
    process.env.DEEPSEEK_API_KEY = ''
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(3)
    expect(res.message).toContain('AI 解析失败')
  })

  test('key 为 undefined 返回 code 3', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(3)
  })

  test('key 为 null 字符串不触发 fetch', async () => {
    process.env.DEEPSEEK_API_KEY = 'null'
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
  })

  test('key 含特殊字符正常工作', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-abc123!@#$%^&*()_+-='
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
  })

  test('key 不暴露在错误信息中', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-super-secret-key-12345'
    global.fetch = jest.fn().mockRejectedValue(new Error('API call failed'))
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.message).not.toContain('sk-')
    expect(res.message).not.toContain('secret')
  })
})

describe('DeepSeek API 响应安全', () => {
  test('API 返回恶意 JSON 不崩溃', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [{ name: '__proto__', calorie: 'alert(1)', protein_g: 'constructor' }],
              total_calorie: 'NaN',
              total_protein_g: 'undefined'
            })
          }
        }]
      })
    })
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
    expect(res.data.items[0]).toHaveProperty('name')
    expect(Number.isNaN(res.data.total_calorie)).toBe(false)
  })

  test('API 返回超大 JSON 不崩溃', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ name: `food${i}`, portion: '1份', calorie: 100, protein_g: 5 }))
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify({ items, total_calorie: 100000, total_protein_g: 5000 }) } }] })
    })
    const res = await parseFoodLog.main({ raw_text: '大量食物', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
    expect(res.data.items.length).toBe(1000)
  })
})
