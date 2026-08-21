jest.mock('wx-server-sdk')
jest.mock('axios')

const parseFoodLog = require('../cloudfunctions/parseFoodLog/index')

function mockDeepSeekResponse(content) {
  const axios = require('axios')
  axios.post.mockResolvedValue({ data: { choices: [{ message: { content } }] } })
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
    const axios = require('axios')
    axios.post.mockRejectedValue(new Error('Request failed with status code 429'))

    const result = await parseFoodLog.main({
      raw_text: '两个鸡蛋',
      meal_type: 'breakfast',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
  })

  test('handles empty response from API', async () => {
    const axios = require('axios')
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '' } }] } })

    const result = await parseFoodLog.main({
      raw_text: '一杯牛奶',
      meal_type: 'breakfast',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
  })
})

describe('parseFoodLog.main - image mode', () => {
  const cloud = require('wx-server-sdk')
  const axios = require('axios')
  const origEnv = process.env

  beforeEach(() => {
    process.env = { ...origEnv }
    process.env.ZHIPU_API_KEY = 'test-zhipu-key'
    process.env.DEEPSEEK_API_KEY = 'test-key'
    cloud.openapi.security.imgSecCheck.mockResolvedValue({ errCode: 0, errMsg: 'ok' })
    cloud.openapi.security.msgSecCheck.mockResolvedValue({ errCode: 0, errMsg: 'ok' })
    axios.post.mockReset()
  })

  afterEach(() => {
    process.env = origEnv
  })

  function mockVision(content) {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content } }] } })
  }

  test('图片模式单次多模态调用直接返回营养 JSON', async () => {
    mockVision(JSON.stringify({
      items: [
        { name: '红烧肉', portion: '约200g', calorie: 480, protein_g: 18.5 },
        { name: '米饭', portion: '约1碗', calorie: 232, protein_g: 5.2 }
      ],
      total_calorie: 712,
      total_protein_g: 23.7
    }))

    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items[0].name).toBe('红烧肉')
    expect(result.data.total_calorie).toBe(712)
    expect(result.data.raw_text).toContain('红烧肉')
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  test('视觉返回 Markdown 包裹的 JSON 能正确剥离', async () => {
    mockVision('```json\n' + JSON.stringify({
      items: [{ name: '米饭', portion: '1碗(约200g)', calorie: 230, protein_g: 4.3 }],
      total_calorie: 230,
      total_protein_g: 4.3
    }) + '\n```')

    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})

    expect(result.code).toBe(0)
    expect(result.data.items[0].name).toBe('米饭')
    expect(result.data.total_calorie).toBe(230)
  })

  test('图片过大返回 code 90 且不调模型', async () => {
    const result = await parseFoodLog.main({
      image_base64: 'a'.repeat(3145729), meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(90)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('图片违规返回 code 91', async () => {
    cloud.openapi.security.imgSecCheck.mockResolvedValue({ errCode: 87014, errMsg: '违规' })
    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(91)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('imgSecCheck 异常返回 code 89', async () => {
    cloud.openapi.security.imgSecCheck.mockRejectedValue(new Error('no permission'))
    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(89)
  })

  test('GLM 失败返回 code 92', async () => {
    axios.post.mockRejectedValueOnce(new Error('GLM timeout'))
    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(92)
  })

  test('GLM 空响应返回 code 92', async () => {
    mockVision('')
    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(92)
  })

  test('视觉 JSON 解析失败返回 code 92（触发手写输入）', async () => {
    mockVision('这不是合法的JSON')
    const result = await parseFoodLog.main({
      image_base64: 'Zm9vYmFy', meal_type: 'lunch', date: '2026-07-29'
    }, {})
    expect(result.code).toBe(92)
  })
})
