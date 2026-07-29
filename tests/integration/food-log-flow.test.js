jest.mock('wx-server-sdk')
require('./setup')
const calcTarget = require('../../cloudfunctions/calcTarget/index')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const sdk = require('wx-server-sdk')

function mockDeepSeekResponse(items, totalCal, totalPro) {
  const axios = require('axios')
  axios.post.mockResolvedValue({ data: {
    choices: [{
      message: {
        content: JSON.stringify({
          items,
          total_calorie: totalCal,
          total_protein_g: totalPro
        })
      }
    }]
  }})
}

describe('记录一餐 → 每日汇总 集成', () => {

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const axios = require('axios')
    axios.post.mockResolvedValue({ data: {
      choices: [{ message: { content: '[]' } }]
    }})
  })

  test('AI解析 → 保存 → 每日汇总正确累计', async () => {
    mockDeepSeekResponse(
      [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }],
      200, 4
    )

    const parsed = await parseFoodLog.main({
      raw_text: '一碗米饭',
      meal_type: 'lunch',
      date: '2026-07-29'
    }, {})
    expect(parsed.code).toBe(0)
    expect(parsed.data.items).toHaveLength(1)

    const db = sdk.__getDB()
    expect(db.food_logs).toHaveLength(0)

    const fs = require('wx-server-sdk').database().collection('food_logs')
    await fs.add({
      data: {
        date: '2026-07-29',
        meal_type: 'lunch',
        raw_text: '一碗米饭',
        parsed_items: parsed.data.items,
        total_calorie: parsed.data.total_calorie,
        total_protein_g: parsed.data.total_protein_g,
        created_at: new Date().toISOString()
      }
    })

    expect(db.food_logs).toHaveLength(1)
    expect(db.food_logs[0].total_calorie).toBe(200)

    const summary = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(summary.code).toBe(0)
    expect(summary.data.total_calorie).toBe(200)
    expect(summary.data.total_protein_g).toBe(4)
    expect(summary.data.meals.lunch).toHaveLength(1)
  })

  test('多餐记录按餐次正确分组汇总', async () => {
    const col = sdk.__getDB('food_logs')
    const meals = [
      { _openid: 'test-openid', date: '2026-07-29', meal_type: 'breakfast', total_calorie: 380, total_protein_g: 16 },
      { _openid: 'test-openid', date: '2026-07-29', meal_type: 'lunch', total_calorie: 620, total_protein_g: 32 },
      { _openid: 'test-openid', date: '2026-07-29', meal_type: 'dinner', total_calorie: 550, total_protein_g: 28 },
      { _openid: 'test-openid', date: '2026-07-29', meal_type: 'snack', total_calorie: 200, total_protein_g: 8 }
    ]
    for (const m of meals) {
      col.push({ _id: 'm-' + Date.now() + '-' + Math.random(), ...m })
    }

    const summary = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(summary.data.total_calorie).toBe(1750)
    expect(summary.data.total_protein_g).toBe(84)
    expect(summary.data.meals.breakfast).toHaveLength(1)
    expect(summary.data.meals.lunch).toHaveLength(1)
    expect(summary.data.meals.dinner).toHaveLength(1)
    expect(summary.data.meals.snack).toHaveLength(1)
  })

  test('今日记录不影响昨日汇总', async () => {
    const col = sdk.__getDB('food_logs')
    col.push({
      _id: 'y1', _openid: 'test-openid', date: '2026-07-28', meal_type: 'dinner',
      total_calorie: 500, total_protein_g: 25
    })

    const yesterday = await getDailySummary.main({ date: '2026-07-28' }, {})
    expect(yesterday.data.total_calorie).toBe(500)

    const today = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(today.data.total_calorie).toBe(0)
  })

  test('无用户时每日汇总返回目标为0', async () => {
    const summary = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(summary.data.target_calorie).toBe(0)
    expect(summary.data.target_protein).toBe(0)
  })

  test('有用户时每日汇总返回正确目标', async () => {
    await calcTarget.main({
      height_cm: 170, current_weight_kg: 55, target_weight_kg: 57,
      gender: 'male', activity_level: 'moderate', age: 25
    }, {})

    const summary = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(summary.data.target_calorie).toBeGreaterThan(2000)
    expect(summary.data.target_protein).toBeGreaterThan(80)
  })

  test('AI返回无效JSON时降级返回空结果', async () => {
    const axios = require('axios')
    axios.post.mockResolvedValue({ data: {
      choices: [{ message: { content: 'invalid json!!!' } }]
    }})

    const result = await parseFoodLog.main({
      raw_text: '随便吃点',
      meal_type: 'lunch',
      date: '2026-07-29'
    }, {})

    expect(result.code).toBe(3)
    expect(result.data.items).toEqual([])
    expect(result.data.total_calorie).toBe(0)
  })
})
