require('./setup')

const calcTarget = require('../../cloudfunctions/calcTarget/index')
const parseFoodLog = require('../../cloudfunctions/parseFoodLog/index')
const getDailySummary = require('../../cloudfunctions/getDailySummary/index')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')
const exportUserData = require('../../cloudfunctions/exportUserData/index')
const deleteUserData = require('../../cloudfunctions/deleteUserData/index')

const ALL_FUNCTIONS = [
  { name: 'calcTarget', fn: calcTarget, successEvents: [{ height_cm: 175, current_weight_kg: 60, target_weight_kg: 62, gender: 'male', activity_level: 'moderate', age: 25 }], successAssert: (r) => { expect(r.data).toHaveProperty('bmi') } },
  { name: 'parseFoodLog', fn: parseFoodLog, successEvents: [{ raw_text: '米饭', meal_type: 'lunch', date: '2026-07-29' }], successAssert: (r) => { expect(r.data).toHaveProperty('items') } },
  { name: 'getDailySummary', fn: getDailySummary, successEvents: [{ date: '2026-07-29' }], successAssert: (r) => { expect(r.data).toHaveProperty('meals') } },
  { name: 'saveWeightLog', fn: saveWeightLog, successEvents: [{ date: '2026-07-29', weight_kg: 65 }], successAssert: (r) => { expect(r.data).toHaveProperty('records') } },
  { name: 'exportUserData', fn: exportUserData, successEvents: [{}], successAssert: (r) => { expect(r.data).toHaveProperty('export_time') } },
  { name: 'deleteUserData', fn: deleteUserData, successEvents: [{}], noData: true, successAssert: (r) => { expect(r.message).toBe('所有数据已删除') } }
]

beforeEach(() => {
  require('wx-server-sdk').__resetDB()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify({ items: [], total_calorie: 0, total_protein_g: 0 }) } }]
    })
  })
})

describe('响应结构一致性', () => {
  describe('成功响应结构', () => {
    ALL_FUNCTIONS.forEach(({ name, fn, successEvents, noData, successAssert }) => {
      test(`${name} 成功时 code=0, message 非空${noData ? '' : ', 含 data'}`, async () => {
        for (const event of successEvents) {
          const res = await fn.main(event, {})
          expect(res).toHaveProperty('code', 0)
          expect(res).toHaveProperty('message')
          expect(typeof res.message).toBe('string')
          expect(res.message.length).toBeGreaterThan(0)
          if (!noData) {
            expect(res).toHaveProperty('data')
            expect(typeof res.data).toBe('object')
            expect(res.data).not.toBeNull()
          }
          successAssert(res)
        }
      })
    })
  })

  describe('错误响应结构一致', () => {
    test('错误响应一定包含 code 和 message', async () => {
      const res = await calcTarget.main({}, {})
      expect(res).toHaveProperty('code')
      expect(res).toHaveProperty('message')
      expect(typeof res.code).toBe('number')
      expect(typeof res.message).toBe('string')
      expect(res.code).not.toBe(0)
    })

    test('错误响应不返回 code 0', () => {
      const cases = [
        calcTarget.main({}, {}),
        calcTarget.main({ height_cm: 175, current_weight_kg: 45, target_weight_kg: 62, gender: 'male', activity_level: 'moderate', age: 25 }, {}),
        getDailySummary.main({}, {}),
        saveWeightLog.main({ date: '2026-07-29' }, {}),
        saveWeightLog.main({ date: '2026-07-29', weight_kg: 15 }, {})
      ]
      return Promise.all(cases).then(results => {
        results.forEach(r => {
          expect(r.code).not.toBe(0)
        })
      })
    })
  })

  describe('code 字段规范', () => {
    test('所有 code 值为整数', async () => {
      const results = await Promise.all([
        calcTarget.main({}, {}),
        getDailySummary.main({}, {}),
        saveWeightLog.main({ date: '2026-07-29' }, {})
      ])
      results.forEach(r => {
        expect(Number.isInteger(r.code)).toBe(true)
      })
    })
  })
})
