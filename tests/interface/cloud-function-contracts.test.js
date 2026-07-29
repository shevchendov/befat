jest.mock('axios')
require('./setup')
const calcTarget = require('../../cloudfunctions/calcTarget/index')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')
const exportUserData = require('../../cloudfunctions/exportUserData/index')
const deleteUserData = require('../../cloudfunctions/deleteUserData/index')

function mockDeepSeek(items, totalCal, totalPro) {
  const axios = require('axios')
  axios.post.mockResolvedValue({ data: {
    choices: [{ message: { content: JSON.stringify({ items, total_calorie: totalCal, total_protein_g: totalPro }) } }]
  }})
}

const VALID_USER = { height_cm: 175, current_weight_kg: 60, target_weight_kg: 62, gender: 'male', activity_level: 'moderate', age: 25 }

/* ========== calcTarget 接口合约 ========== */
describe('calcTarget 接口合约', () => {
  const required = ['height_cm', 'current_weight_kg', 'target_weight_kg', 'gender', 'activity_level', 'age']

  test.each(required)('缺少 %s 返回 code 1', async (field) => {
    const input = { ...VALID_USER, [field]: undefined }
    const res = await calcTarget.main(input, {})
    expect(res.code).toBe(1)
    expect(res.message).toBe('缺少必要参数')
    expect(res).not.toHaveProperty('data')
  })

  test('height_cm=0 视为缺少参数', async () => {
    const res = await calcTarget.main({ ...VALID_USER, height_cm: 0 }, {})
    expect(res.code).toBe(1)
  })

  test('BMI<16 返回 code 2 + data.bmi', async () => {
    const res = await calcTarget.main({ ...VALID_USER, current_weight_kg: 45 }, {})
    expect(res.code).toBe(2)
    expect(res.message).toContain('咨询医生')
    expect(res.data).toEqual({ bmi: 14.7 })
  })

  test('周增长>1kg 返回 code 3 + data.bmi', async () => {
    const res = await calcTarget.main({ ...VALID_USER, current_weight_kg: 50, target_weight_kg: 80 }, {})
    expect(res.code).toBe(3)
    expect(res.message).toContain('增长过快')
    expect(res.data).toHaveProperty('bmi')
  })

  test('成功响应包含所有预期字段', async () => {
    const res = await calcTarget.main(VALID_USER, {})
    expect(res.code).toBe(0)
    expect(res.message).toBe('ok')
    expect(res.data).toEqual({
      tdee: expect.any(Number),
      daily_calorie_target: expect.any(Number),
      daily_protein_target_g: expect.any(Number),
      bmi: expect.any(Number)
    })
    expect(res.data.daily_calorie_target).toBeGreaterThan(res.data.tdee)
  })

  test('tdee = daily_calorie_target - 350', async () => {
    const res = await calcTarget.main(VALID_USER, {})
    expect(res.data.tdee).toBe(res.data.daily_calorie_target - 350)
  })

  test('daily_protein_target_g = round(weight * 1.8)', async () => {
    const res = await calcTarget.main(VALID_USER, {})
    expect(res.data.daily_protein_target_g).toBe(Math.round(60 * 1.8))
  })
})

/* ========== parseFoodLog 接口合约 ========== */
describe('parseFoodLog 接口合约', () => {
  const VALID_INPUT = { raw_text: '一碗米饭', meal_type: 'lunch', date: '2026-07-29' }

  beforeEach(() => {
    mockDeepSeek([{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }], 200, 4)
  })

  test.each(['raw_text', 'meal_type', 'date'])('缺少 %s 返回 code 1', async (field) => {
    const input = { ...VALID_INPUT, [field]: undefined }
    const res = await parseFoodLog.main(input, {})
    expect(res.code).toBe(1)
    expect(res.message).toBe('缺少必要参数')
  })

  test('无效 meal_type 返回 code 2', async () => {
    const res = await parseFoodLog.main({ ...VALID_INPUT, meal_type: 'brunch' }, {})
    expect(res.code).toBe(2)
    expect(res.message).toContain('餐次')
  })

  test('DeepSeek key 未配置时返回 code 3', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const res = await parseFoodLog.main(VALID_INPUT, {})
    expect(res.code).toBe(3)
    expect(res.message).toContain('AI 解析失败')
  })

  test('成功响应包含完整数据结构', async () => {
    const res = await parseFoodLog.main(VALID_INPUT, {})
    expect(res.code).toBe(0)
    expect(res.message).toBe('ok')
    expect(res.data).toMatchObject({
      raw_text: '一碗米饭',
      meal_type: 'lunch',
      date: '2026-07-29',
      items: expect.any(Array),
      total_calorie: expect.any(Number),
      total_protein_g: expect.any(Number)
    })
  })

  test('items 内每项包含 name/portion/calorie/protein_g', async () => {
    const res = await parseFoodLog.main(VALID_INPUT, {})
    const item = res.data.items[0]
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('portion')
    expect(item).toHaveProperty('calorie')
    expect(item).toHaveProperty('protein_g')
    expect(typeof item.name).toBe('string')
    expect(typeof item.calorie).toBe('number')
  })

  test('AI 返回非 JSON 时降级为 code 3 并返回空 data', async () => {
    const axios = require('axios')
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'not json' } }] } })
    const res = await parseFoodLog.main(VALID_INPUT, {})
    expect(res.code).toBe(3)
    expect(res.data.items).toEqual([])
    expect(res.data.total_calorie).toBe(0)
    expect(res.data).toHaveProperty('parse_error')
  })

  test('API HTTP 错误时返回 code 3', async () => {
    const axios = require('axios')
    axios.post.mockRejectedValue(new Error('Request failed with status code 429'))
    const res = await parseFoodLog.main(VALID_INPUT, {})
    expect(res.code).toBe(3)
  })

  test('number 类型的 calorie/protein_g 不会为 NaN', async () => {
    mockDeepSeek([{ name: '可乐', portion: '1罐', calorie: 140 }], 140, 0)
    const res = await parseFoodLog.main(VALID_INPUT, {})
    expect(res.code).toBe(0)
    expect(Number.isNaN(res.data.items[0].calorie)).toBe(false)
    expect(Number.isNaN(res.data.items[0].protein_g)).toBe(false)
  })
})

/* ========== getDailySummary 接口合约 ========== */
describe('getDailySummary 接口合约', () => {
  test('缺少 date 返回 code 1', async () => {
    const res = await getDailySummary.main({}, {})
    expect(res.code).toBe(1)
    expect(res.message).toContain('日期')
  })

  test('无数据时返回空汇总', async () => {
    const res = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
    expect(res.data.total_calorie).toBe(0)
    expect(res.data.total_protein_g).toBe(0)
    expect(res.data.target_calorie).toBe(0)
    expect(res.data.target_protein).toBe(0)
  })

  test('响应数据结构完整', async () => {
    const res = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(res.data).toMatchObject({
      date: '2026-07-29',
      meals: {
        breakfast: expect.any(Array),
        lunch: expect.any(Array),
        dinner: expect.any(Array),
        snack: expect.any(Array)
      },
      total_calorie: expect.any(Number),
      total_protein_g: expect.any(Number),
      target_calorie: expect.any(Number),
      target_protein: expect.any(Number)
    })
  })

  test('四餐次分组均为数组类型', async () => {
    const res = await getDailySummary.main({ date: '2026-07-29' }, {})
    Object.values(res.data.meals).forEach(arr => {
      expect(Array.isArray(arr)).toBe(true)
    })
  })
})

/* ========== saveWeightLog 接口合约 ========== */
describe('saveWeightLog 接口合约', () => {
  test('缺少 date 返回 code 1', async () => {
    const res = await saveWeightLog.main({ weight_kg: 65 }, {})
    expect(res.code).toBe(1)
  })

  test('缺少 weight_kg 返回 code 1', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29' }, {})
    expect(res.code).toBe(1)
  })

  test('weight_kg < 20 返回 code 2', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 15 }, {})
    expect(res.code).toBe(2)
    expect(res.message).toContain('不合法')
  })

  test('weight_kg > 300 返回 code 2', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 350 }, {})
    expect(res.code).toBe(2)
  })

  test('成功响应包含 records 数组', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 65 }, {})
    expect(res.code).toBe(0)
    expect(res.message).toBe('ok')
    expect(res.data).toHaveProperty('records')
    expect(Array.isArray(res.data.records)).toBe(true)
  })

  test('records 内每项包含 date 和 weight_kg', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 65 }, {})
    if (res.data.records.length > 0) {
      expect(res.data.records[0]).toHaveProperty('date')
      expect(res.data.records[0]).toHaveProperty('weight_kg')
    }
  })

  test('weight_kg=20 是合法边界值', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 20 }, {})
    expect(res.code).toBe(0)
  })

  test('weight_kg=300 是合法边界值', async () => {
    const res = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 300 }, {})
    expect(res.code).toBe(0)
  })
})

/* ========== exportUserData 接口合约 ========== */
describe('exportUserData 接口合约', () => {
  test('无用户时 user_info 为 null', async () => {
    const res = await exportUserData.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.user_info).toBeNull()
  })

  test('始终返回 export_time 字符串', async () => {
    const res = await exportUserData.main({}, {})
    expect(typeof res.data.export_time).toBe('string')
    expect(new Date(res.data.export_time).toISOString()).toBe(res.data.export_time)
  })

  test('food_logs 和 weight_logs 始终为数组', async () => {
    const res = await exportUserData.main({}, {})
    expect(Array.isArray(res.data.food_logs)).toBe(true)
    expect(Array.isArray(res.data.weight_logs)).toBe(true)
  })

  test('不导出 _id 和 _openid', async () => {
    await calcTarget.main(VALID_USER, {})
    const res = await exportUserData.main({}, {})
    expect(res.data.user_info).not.toHaveProperty('_id')
    expect(res.data.user_info).not.toHaveProperty('_openid')
  })
})

/* ========== deleteUserData 接口合约 ========== */
describe('deleteUserData 接口合约', () => {
  test('无数据时静默成功', async () => {
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
    expect(res.message).toContain('已删除')
  })

  test('有数据时全部清除', async () => {
    await calcTarget.main(VALID_USER, {})
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
  })

  test('重复删除不报错', async () => {
    await deleteUserData.main({}, {})
    const res = await deleteUserData.main({}, {})
    expect(res.code).toBe(0)
  })
})
