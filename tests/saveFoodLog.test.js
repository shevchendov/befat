let mockRecords = []
const mockGenId = (() => { let i = 1; return () => 'rec-' + (i++) })()

jest.mock('wx-server-sdk', () => {
  const mockServerDate = jest.fn(() => '2026-07-29T00:00:00.000Z')

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn(query => ({
          get: jest.fn().mockImplementation(() => {
            const filtered = mockRecords.filter(r => {
              return (query._openid ? r._openid === query._openid : true) &&
                     (query.date ? r.date === query.date : true) &&
                     (query.meal_type ? r.meal_type === query.meal_type : true)
            })
            return Promise.resolve({ data: filtered })
          })
        })),
        doc: jest.fn(id => ({
          update: jest.fn().mockImplementation(({ data }) => {
            const idx = mockRecords.findIndex(r => r._id === id)
            if (idx !== -1) Object.assign(mockRecords[idx], data)
            return Promise.resolve({})
          })
        })),
        // 模拟云函数服务端 add：不会自动注入 _openid
        add: jest.fn().mockImplementation(({ data }) => {
          const doc = { _id: mockGenId(), ...data }
          mockRecords.push(doc)
          return Promise.resolve({ _id: doc._id })
        })
      })),
      serverDate: mockServerDate
    })),
    getWXContext: jest.fn(() => ({
      OPENID: 'test-openid',
      APPID: 'test-appid',
      UNIONID: null
    }))
  }
})

const saveFoodLog = require('../cloudfunctions/saveFoodLog/index')

beforeEach(() => {
  mockRecords = []
})

const baseEvent = {
  date: '2026-07-29',
  meal_type: 'lunch',
  raw_text: '一碗米饭',
  items: [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
}

function db() { return mockRecords }

describe('saveFoodLog.main - parameter validation', () => {
  test('缺少必要参数返回 code 1', async () => {
    expect((await saveFoodLog.main({}, {})).code).toBe(1)
    expect((await saveFoodLog.main({ date: '2026-07-29' }, {})).code).toBe(1)
    expect((await saveFoodLog.main({ date: '2026-07-29', meal_type: 'lunch' }, {})).code).toBe(1)
    expect((await saveFoodLog.main({ date: '2026-07-29', meal_type: 'lunch', raw_text: 'x', items: [] }, {})).code).toBe(1)
  })

  test('无效餐次返回 code 2', async () => {
    const res = await saveFoodLog.main({ ...baseEvent, meal_type: 'brunch' }, {})
    expect(res.code).toBe(2)
  })

  test('合法请求返回 code 0', async () => {
    const res = await saveFoodLog.main(baseEvent, {})
    expect(res.code).toBe(0)
    expect(res.data.is_merge).toBe(false)
  })
})

describe('saveFoodLog.main - create new record', () => {
  test('当天该餐次无记录时新建一条', async () => {
    const res = await saveFoodLog.main(baseEvent, {})
    expect(res.code).toBe(0)
    expect(res.data.is_merge).toBe(false)
    expect(res.data.item_count).toBe(1)
    expect(db()).toHaveLength(1)
    const doc = db()[0]
    expect(doc.date).toBe('2026-07-29')
    expect(doc.meal_type).toBe('lunch')
    expect(doc.raw_text).toBe('一碗米饭')
    expect(doc.parsed_items).toHaveLength(1)
    expect(doc.total_calorie).toBe(200)
    expect(doc.total_protein_g).toBe(4)
    expect(doc.created_at).toBeTruthy()
  })

  test('新建记录显式写入 _openid', async () => {
    const res = await saveFoodLog.main(baseEvent, {})
    expect(res.code).toBe(0)
    expect(db()).toHaveLength(1)
    // 云函数服务端 add 不会自动注入 _openid，必须显式写入，
    // 否则后续按 _openid 查询无法匹配，合并永不生效
    expect(db()[0]._openid).toBe('test-openid')
  })

  test('不同餐次同一天各自新建', async () => {
    await saveFoodLog.main(baseEvent, {})
    await saveFoodLog.main({ ...baseEvent, meal_type: 'breakfast', raw_text: '鸡蛋', items: [{ name: '鸡蛋', portion: '1个', calorie: 80, protein_g: 6 }] }, {})
    expect(db()).toHaveLength(2)
    expect(db().map(r => r.meal_type)).toEqual(expect.arrayContaining(['lunch', 'breakfast']))
  })

  test('不同日期同餐次各自新建', async () => {
    await saveFoodLog.main(baseEvent, {})
    await saveFoodLog.main({ ...baseEvent, date: '2026-07-30' }, {})
    expect(db()).toHaveLength(2)
  })
})

describe('saveFoodLog.main - merge into existing record', () => {
  test('同一天同餐次追加 parsed_items 并累加总量', async () => {
    const first = await saveFoodLog.main(baseEvent, {})
    const firstDoc = db()[0]

    const second = await saveFoodLog.main({
      ...baseEvent,
      raw_text: '一杯红茶',
      items: [{ name: '红茶', portion: '1杯', calorie: 100, protein_g: 0 }]
    }, {})

    expect(second.code).toBe(0)
    expect(second.data.is_merge).toBe(true)
    expect(second.data.item_count).toBe(2)

    expect(db()).toHaveLength(1)
    const doc = db()[0]
    expect(doc.parsed_items).toHaveLength(2)
    expect(doc.parsed_items.map(i => i.name)).toEqual(['米饭', '红茶'])
    expect(doc.total_calorie).toBe(300)
    expect(doc.total_protein_g).toBe(4)
    expect(doc.raw_text).toBe('一碗米饭\n一杯红茶')
    expect(doc.created_at).toBe(firstDoc.created_at)
    expect(doc.updated_at).toBeTruthy()
  })

  test('合并后 created_at 保持最早写入时间', async () => {
    await saveFoodLog.main(baseEvent, {})
    const firstCreatedAt = db()[0].created_at

    await saveFoodLog.main({ ...baseEvent, raw_text: '红茶', items: [{ name: '红茶', portion: '1杯', calorie: 100, protein_g: 0 }] }, {})
    expect(db()[0].created_at).toBe(firstCreatedAt)
  })
})
