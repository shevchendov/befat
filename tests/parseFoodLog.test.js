jest.mock('wx-server-sdk')

const parseFoodLog = require('../cloudfunctions/parseFoodLog/index')

function mockDeepSeekResponse(content) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content } }]
    })
  })
}

describe('parseFoodLog.main - parameter validation', () => {
  test('returns code 1 when missing all params', async () => {
    const result = await parseFoodLog.main({}, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 when missing raw_text', async () => {
    const result = await parseFoodLog.main({ meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 1 when missing meal_type', async () => {
    const result = await parseFoodLog.main({ raw_text: '鸡腿饭', date: '2026-07-29' }, {})
    expect(result.code).toBe(1)
  })

  test('returns code 2 for invalid meal_type', async () => {
    const result = await parseFoodLog.main({ raw_text: '鸡腿饭', meal_type: 'brunch', date: '2026-07-29' }, {})
    expect(result.code).toBe(2)
    expect(result.message).toContain('餐次')
  })
})

describe('parseFoodLog.main - API key validation', () => {
  const origEnv = process.env

  beforeEach(() => {
    process.env = { ...origEnv }
    delete process.env.DEEPSEEK_API_KEY
  })

  afterEach(() => {
    process.env = origEnv
  })

  test('returns code 3 when API key is missing', async () => {
    const result = await parseFoodLog.main({
      raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(3)
    expect(result.message).toContain('AI 解析失败')
  })
})

describe('parseFoodLog.main - JSON parsing', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-key'
  })

  test('parses standard JSON response', async () => {
    mockDeepSeekResponse(JSON.stringify({
      items: [
        { name: '米饭', portion: '1碗(约200g)', calorie: 230, protein_g: 4.3 },
        { name: '鸡腿', portion: '2个(约200g)', calorie: 320, protein_g: 36 }
      ],
      total_calorie: 550,
      total_protein_g: 40.3
    }))

    const result = await parseFoodLog.main({
      raw_text: '两个鸡腿加一碗米饭',
      meal_type: 'lunch',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items).toHaveLength(2)
    expect(result.data.items[0].name).toBe('米饭')
    expect(result.data.items[1].calorie).toBe(320)
    expect(result.data.total_calorie).toBe(550)
  })

  test('strips markdown code fences', async () => {
    mockDeepSeekResponse('```json\n' + JSON.stringify({
      items: [{ name: '苹果', portion: '1个(约200g)', calorie: 100, protein_g: 0.5 }],
      total_calorie: 100,
      total_protein_g: 0.5
    }) + '\n```')

    const result = await parseFoodLog.main({
      raw_text: '一个苹果',
      meal_type: 'snack',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items[0].name).toBe('苹果')
  })

  test('strips triple backtick without json tag', async () => {
    mockDeepSeekResponse('```\n' + JSON.stringify({
      items: [{ name: '香蕉', portion: '1根', calorie: 90, protein_g: 1.2 }],
      total_calorie: 90,
      total_protein_g: 1.2
    }) + '\n```')

    const result = await parseFoodLog.main({
      raw_text: '一根香蕉',
      meal_type: 'snack',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items[0].name).toBe('香蕉')
  })

  test('handles missing total_calorie by summing items', async () => {
    mockDeepSeekResponse(JSON.stringify({
      items: [
        { name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 },
        { name: '牛肉', portion: '150g', calorie: 250, protein_g: 30 }
      ]
    }))

    const result = await parseFoodLog.main({
      raw_text: '米饭加牛肉',
      meal_type: 'dinner',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.total_calorie).toBe(450)
  })

  test('handles items with missing fields', async () => {
    mockDeepSeekResponse(JSON.stringify({
      items: [{ name: '可乐', portion: '1罐', calorie: 140 }],
      total_calorie: 140,
      total_protein_g: 0
    }))

    const result = await parseFoodLog.main({
      raw_text: '一罐可乐',
      meal_type: 'snack',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items[0].protein_g).toBe(0)
  })

  test('returns code 3 when response is not valid JSON', async () => {
    mockDeepSeekResponse('我不是JSON')

    const result = await parseFoodLog.main({
      raw_text: '随便吃点',
      meal_type: 'lunch',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
    expect(result.message).toContain('AI 解析失败')
  })

  test('returns code 3 when items is not an array', async () => {
    mockDeepSeekResponse(JSON.stringify({ items: 'not array' }))

    const result = await parseFoodLog.main({
      raw_text: '吃面',
      meal_type: 'lunch',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
  })

  test('handles API failure gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 })

    const result = await parseFoodLog.main({
      raw_text: '两个鸡蛋',
      meal_type: 'breakfast',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
  })

  test('handles empty response from API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] })
    })

    const result = await parseFoodLog.main({
      raw_text: '一杯牛奶',
      meal_type: 'breakfast',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
  })
})
