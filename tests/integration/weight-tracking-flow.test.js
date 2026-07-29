jest.mock('wx-server-sdk')
require('./setup')
const saveWeightLog = require('../../cloudfunctions/saveWeightLog/index')
const sdk = require('wx-server-sdk')

describe('体重打卡 集成', () => {

  test('首次记录体重 → 创建记录 → 返回单条', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-20', weight_kg: 62.5 }, {})
    expect(result.code).toBe(0)
    expect(result.data.records).toHaveLength(1)
    expect(result.data.records[0].weight_kg).toBe(62.5)
    expect(result.data.records[0].date).toBe('2026-07-20')
  })

  test('同一天再次记录 → 更新不新建', async () => {
    await saveWeightLog.main({ date: '2026-07-20', weight_kg: 62.5 }, {})

    const result = await saveWeightLog.main({ date: '2026-07-20', weight_kg: 63.0 }, {})
    expect(result.code).toBe(0)

    const recordsForDate = result.data.records.filter(r => r.date === '2026-07-20')
    expect(recordsForDate).toHaveLength(1)
    expect(recordsForDate[0].weight_kg).toBe(63.0)

    expect(result.data.records).toHaveLength(1)
  })

  test('多次记录按日期升序返回', async () => {
    await saveWeightLog.main({ date: '2026-07-25', weight_kg: 64.0 }, {})
    await saveWeightLog.main({ date: '2026-07-20', weight_kg: 62.0 }, {})
    await saveWeightLog.main({ date: '2026-07-15', weight_kg: 61.0 }, {})
    await saveWeightLog.main({ date: '2026-07-28', weight_kg: 65.0 }, {})

    const result = await saveWeightLog.main({ date: '2026-07-30', weight_kg: 65.5 }, {})
    expect(result.data.records).toHaveLength(5)

    const dates = result.data.records.map(r => r.date)
    expect(dates).toEqual([
      '2026-07-15', '2026-07-20', '2026-07-25', '2026-07-28', '2026-07-30'
    ])

    const weights = result.data.records.map(r => r.weight_kg)
    expect(weights).toEqual([61.0, 62.0, 64.0, 65.0, 65.5])
  })

  test('体重数值四舍五入到一位小数', async () => {
    const result = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 65.666 }, {})
    expect(result.data.records[0].weight_kg).toBe(65.7)

    const result2 = await saveWeightLog.main({ date: '2026-07-30', weight_kg: 65.444 }, {})
    expect(result2.data.records[1].weight_kg).toBe(65.4)
  })

  test('非法体重值被拒绝', async () => {
    const tooLow = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 15 }, {})
    expect(tooLow.code).toBe(2)

    const tooHigh = await saveWeightLog.main({ date: '2026-07-29', weight_kg: 350 }, {})
    expect(tooHigh.code).toBe(2)

    const db = sdk.__getDB('weight_logs')
    expect(db).toHaveLength(0)
  })

  test('返回记录数上限为100条', async () => {
    for (let i = 0; i < 120; i++) {
      const day = String(i + 1).padStart(2, '0')
      await saveWeightLog.main({ date: '2026-01-' + day, weight_kg: 60 + i * 0.1 }, {})
    }

    const result = await saveWeightLog.main({ date: '2026-05-01', weight_kg: 70 }, {})
    expect(result.data.records.length).toBeLessThanOrEqual(100)
  })

  test('不同用户数据隔离', async () => {
    const sdkMod = require('wx-server-sdk')
    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-a' }))
    await saveWeightLog.main({ date: '2026-07-20', weight_kg: 62 }, {})

    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-b' }))
    await saveWeightLog.main({ date: '2026-07-21', weight_kg: 75 }, {})

    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-a' }))
    const resultA = await saveWeightLog.main({ date: '2026-07-22', weight_kg: 63 }, {})
    expect(resultA.data.records).toHaveLength(2)
    expect(resultA.data.records[0].weight_kg).toBe(62)

    sdkMod.getWXContext = jest.fn(() => ({ OPENID: 'user-b' }))
    const resultB = await saveWeightLog.main({ date: '2026-07-22', weight_kg: 76 }, {})
    expect(resultB.data.records).toHaveLength(2)
    expect(resultB.data.records[1].weight_kg).toBe(76)
  })
})
