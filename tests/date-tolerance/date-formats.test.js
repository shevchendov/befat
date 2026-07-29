const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
jest.mock('axios')
const axios = require('axios')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')

beforeEach(() => {
  sdk.__resetDB()
  axios.post.mockResolvedValue({ data: {
    choices: [{ message: { content: JSON.stringify({ items: [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }], total_calorie: 200, total_protein_g: 4 }) } }]
  }})
})

const DATE_VARIANTS = [
  { label: '标准格式', value: '2026-07-29' },
  { label: '斜杠分隔', value: '2026/07/29' },
  { label: '无前导零', value: '2026-7-29' },
  { label: '末尾带 T', value: '2026-07-29T' },
  { label: '完整 ISO', value: '2026-07-29T12:00:00Z' },
  { label: '短年', value: '26-07-29' },
  { label: '中文格式', value: '2026年7月29日' }
]

describe('parseFoodLog 日期容错', () => {
  DATE_VARIANTS.forEach(({ label, value }) => {
    test(`${label} '${value}' 不导致崩溃`, async () => {
      const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: value }, {})
      expect(typeof res.code).toBe('number')
    })
  })

  test('date 为空字符串', async () => {
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '' }, {})
    expect(res.code).toBe(1)
  })

  test('date 为 null', async () => {
    const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: null }, {})
    expect(res.code).toBe(1)
  })
})

describe('getDailySummary 日期容错', () => {
  test('标准格式正常查询', async () => {
    const res = await getDailySummary.main({ date: '2026-07-29' }, {})
    expect(res.code).toBe(0)
  })

  test('非标准格式不匹配标准存储数据', async () => {
    await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }, {})
    const res = await getDailySummary.main({ date: '2026/07/29' }, {})
    expect(res.data.total_calorie).toBe(0)
  })

  DATE_VARIANTS.forEach(({ label, value }) => {
    test(`${label} '${value}' 不导致崩溃`, async () => {
      const res = await getDailySummary.main({ date: value }, {})
      expect(typeof res.code).toBe('number')
    })
  })

  test('date 为空字符串返回 code 1', async () => {
    const res = await getDailySummary.main({ date: '' }, {})
    expect(res.code).toBe(1)
  })
})

describe('saveWeightLog 日期容错', () => {
  DATE_VARIANTS.forEach(({ label, value }) => {
    test(`${label} '${value}' 不导致崩溃`, async () => {
      const res = await saveWeightLog.main({ date: value, weight_kg: 65 }, {})
      expect(typeof res.code).toBe('number')
    })
  })

  test('date 为空字符串返回 code 1', async () => {
    const res = await saveWeightLog.main({ date: '', weight_kg: 65 }, {})
    expect(res.code).toBe(1)
  })
})

describe('日期边界', () => {
  const BOUNDARY_DATES = [
    { label: '1970-01-01', value: '1970-01-01' },
    { label: '2099-12-31', value: '2099-12-31' },
    { label: '0000-00-00', value: '0000-00-00' },
    { label: '2026-13-01', value: '2026-13-01' },
    { label: '2026-00-01', value: '2026-00-01' }
  ]

  BOUNDARY_DATES.forEach(({ label, value }) => {
    test(`parseFoodLog 日期边界 ${label}`, async () => {
      const res = await parseFoodLog.main({ raw_text: '米饭', meal_type: 'lunch', date: value }, {})
      expect(typeof res.code).toBe('number')
    })

    test(`saveWeightLog 日期边界 ${label}`, async () => {
      const res = await saveWeightLog.main({ date: value, weight_kg: 65 }, {})
      expect(typeof res.code).toBe('number')
    })

    test(`getDailySummary 日期边界 ${label}`, async () => {
      const res = await getDailySummary.main({ date: value }, {})
      expect(typeof res.code).toBe('number')
    })
  })
})
