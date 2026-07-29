jest.mock('axios')
require('./setup')
const axios = require('axios')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')

function captureAxios() {
  let callArgs = null
  axios.post.mockImplementation((url, data, config) => {
    callArgs = { url, data, ...config }
    return Promise.resolve({ data: {
      choices: [{ message: { content: JSON.stringify({ items: [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }], total_calorie: 200, total_protein_g: 4 }) } }]
    }})
  })
  return () => callArgs
}

describe('DeepSeek HTTP 调用格式', () => {
  const getCall = captureAxios()

  beforeEach(() => {
    axios.post.mockReset()
  })

  test('请求 URL 正确', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.url).toBe('https://api.deepseek.com/chat/completions')
  })

  test('使用 POST 方法', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(axios.post).toHaveBeenCalled()
  })

  test('Content-Type 为 application/json', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.headers['Content-Type']).toBe('application/json')
  })

  test('Authorization 包含 Bearer token', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.headers['Authorization']).toMatch(/^Bearer .+/)
    expect(call.headers['Authorization']).toBe('Bearer test-deepseek-key')
  })

  test('请求体包含 model 字段', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.data).toHaveProperty('model')
    expect(call.data.model).toBe('deepseek-chat')
  })

  test('请求体包含 messages 数组（system + user）', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(Array.isArray(call.data.messages)).toBe(true)
    expect(call.data.messages).toHaveLength(2)
    expect(call.data.messages[0].role).toBe('system')
    expect(call.data.messages[1].role).toBe('user')
  })

  test('user message 包含用户原始输入文字', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '两个鸡腿加一碗米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.data.messages[1].content).toContain('两个鸡腿加一碗米饭')
  })

  test('temperature 为 0.1（低随机性）', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.data.temperature).toBe(0.1)
  })

  test('max_tokens 为 1024', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.data.max_tokens).toBe(1024)
  })

  test('system prompt 要求返回 JSON', async () => {
    const getCall = captureAxios()
    await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const call = getCall()
    expect(call.data.messages[0].content).toMatch(/JSON|json/)
  })

  test('API 返回非 200 时函数降级不崩溃', async () => {
    axios.post.mockRejectedValue(new Error('Request failed with status code 500'))
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(3)
  })

  test('API 超时/网络错误时函数降级不崩溃', async () => {
    axios.post.mockRejectedValue(new Error('connect ETIMEDOUT'))
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(3)
  })

  test('API 返回空 choices 时函数降级不崩溃', async () => {
    axios.post.mockResolvedValue({ data: { choices: [] } })
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    expect(res.code).toBe(3)
  })
})
