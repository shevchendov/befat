const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const checkMealReminder = require('../cloudfunctions/checkMealReminder/index')

beforeEach(() => {
  sdk.__resetDB()
})

afterEach(() => {
  jest.useRealTimers()
})

function setTime(dateStr) {
  jest.useFakeTimers({ legacyFakeTimers: false })
  jest.setSystemTime(new Date(dateStr))
}

describe('checkMealRemider - no meals logged', () => {
  test('10:30 提醒早餐', async () => {
    setTime('2026-07-29T10:30:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('breakfast')
    expect(res.message).toContain('早餐')
  })

  test('08:00 不提醒（不在任何时段）', async () => {
    setTime('2026-07-29T08:00:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
    expect(res.message).toBe('')
  })

  test('14:30 提醒午餐', async () => {
    setTime('2026-07-29T14:30:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('lunch')
    expect(res.message).toContain('午餐')
  })

  test('20:30 提醒晚餐', async () => {
    setTime('2026-07-29T20:30:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('dinner')
    expect(res.message).toContain('晚餐')
  })

  test('22:00 不提醒', async () => {
    setTime('2026-07-29T22:00:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
  })

  test('时段边界——10:00 正好在早餐区间', async () => {
    setTime('2026-07-29T10:00:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('breakfast')
  })

  test('时段边界——10:59 仍在早餐区间', async () => {
    setTime('2026-07-29T10:59:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('breakfast')
  })
})

describe('checkMealReminder - meals exist, interval check', () => {
  test('上一餐不到 5 小时不提醒', async () => {
    setTime('2026-07-29T14:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '米饭',
      items: [],
      total_calorie: 500,
      total_protein_g: 20,
      created_at: new Date('2026-07-29T12:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
  })

  test('上一餐超过 5 小时提醒加餐', async () => {
    setTime('2026-07-29T18:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '米饭',
      items: [],
      total_calorie: 500,
      total_protein_g: 20,
      created_at: new Date('2026-07-29T12:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('snack')
    expect(res.message).toContain('5小时')
  })

  test('刚好 5 小时触发提醒', async () => {
    setTime('2026-07-29T17:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '米饭',
      items: [],
      total_calorie: 500,
      total_protein_g: 20,
      created_at: new Date('2026-07-29T12:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
  })

  test('5小时以内（4h59m）不触发', async () => {
    setTime('2026-07-29T16:59:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '米饭',
      items: [],
      total_calorie: 500,
      total_protein_g: 20,
      created_at: new Date('2026-07-29T12:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
  })

  test('合并后的单条记录：以最近 updated_at 判断加餐提醒', async () => {
    setTime('2026-07-29T18:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '瘦肉肠\n红茶',
      items: [],
      total_calorie: 800,
      total_protein_g: 35,
      created_at: new Date('2026-07-29T08:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('snack')
  })

  test('合并后的单条记录：updated_at 距今不足5小时则不提醒（created_at 更早也不误判）', async () => {
    setTime('2026-07-29T13:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '鸡蛋肠\n红茶',
      items: [],
      total_calorie: 800,
      total_protein_g: 35,
      created_at: new Date('2026-07-29T08:00:00').toISOString(),
      updated_at: new Date('2026-07-29T12:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
  })

  test('跨多个餐次记录时按最新 updated_at 取最近一次进餐', async () => {
    setTime('2026-07-29T18:00:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'breakfast',
      raw_text: '面包',
      items: [],
      total_calorie: 300,
      total_protein_g: 10,
      created_at: new Date('2026-07-29T08:00:00').toISOString(),
      updated_at: new Date('2026-07-29T08:30:00').toISOString()
    })
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '面条',
      items: [],
      total_calorie: 600,
      total_protein_g: 25,
      created_at: new Date('2026-07-29T14:00:00').toISOString(),
      updated_at: new Date('2026-07-29T14:00:00').toISOString()
    })
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
  })
})

describe('checkMealReminder - event.date override', () => {
  test('event.date 不为空时使用指定日期而非当天', async () => {
    setTime('2026-07-29T10:30:00')
    sdk.__seed('food_logs', {
      _openid: 'test-openid',
      date: '2026-07-29',
      meal_type: 'lunch',
      raw_text: '米饭',
      items: [],
      total_calorie: 500,
      total_protein_g: 20,
      created_at: new Date('2026-07-29T10:00:00').toISOString()
    })
    const res = await checkMealReminder.main({ date: '2026-07-28' }, {})
    expect(res.shouldRemind).toBe(true)
    expect(res.mealType).toBe('breakfast')
  })
})

describe('checkMealReminder - response structure', () => {
  test('总是返回 code, shouldRemind, message', async () => {
    setTime('2026-07-29T08:00:00')
    const res = await checkMealReminder.main({}, {})
    expect(res).toHaveProperty('code', 0)
    expect(res).toHaveProperty('shouldRemind')
    expect(res).toHaveProperty('message')
    expect(typeof res.shouldRemind).toBe('boolean')
    expect(typeof res.message).toBe('string')
  })

  test('提醒时附带 mealType', async () => {
    setTime('2026-07-29T14:30:00')
    const res = await checkMealReminder.main({}, {})
    expect(res).toHaveProperty('mealType')
    expect(typeof res.mealType).toBe('string')
  })

  test('不提醒时 message 为空字符串', async () => {
    setTime('2026-07-29T08:00:00')
    const res = await checkMealReminder.main({}, {})
    expect(res.shouldRemind).toBe(false)
    expect(res.message).toBe('')
  })
})
