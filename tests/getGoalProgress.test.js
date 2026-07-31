let mockData = { users: [], weight_logs: [] }
let mockDbError = false

jest.mock('wx-server-sdk', () => {
  const coll = (name) => {
    if (mockDbError) throw new Error('db crash')
    return mockData[name] || []
  }

  function filter(items, query) {
    if (!query) return items
    let result = items
    if (query._openid) result = result.filter(function (x) { return x._openid === query._openid })
    if (query.date) {
      if (typeof query.date === 'string') {
        result = result.filter(function (x) { return x.date === query.date })
      } else if (typeof query.date === 'object') {
        const o = query.date
        if (o.$gte) result = result.filter(function (x) { return x.date >= o.$gte })
        if (o.$lte) result = result.filter(function (x) { return x.date <= o.$lte })
      }
    }
    return result
  }

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(function (name) {
        return {
          where: jest.fn(function (query) {
            var filtered = function () { return filter(coll(name), query) }
            return {
              orderBy: jest.fn(function (field, dir) {
                return {
                  get: jest.fn().mockResolvedValue({
                    data: filtered().sort(function (a, b) {
                      var va = a[field] || '', vb = b[field] || ''
                      return dir === 'desc' ? String(vb).localeCompare(va) : String(va).localeCompare(vb)
                    })
                  })
                }
              }),
              get: jest.fn().mockResolvedValue({ data: filtered() })
            }
          }),
          field: jest.fn(function () {
            return { get: jest.fn().mockResolvedValue({ data: coll(name) }) }
          }),
          add: jest.fn(function ({ data }) {
            var doc = { _id: 'id-' + Date.now(), _openid: 'test-openid', ...data }
            mockData[name].push(doc)
            return Promise.resolve({ _id: doc._id })
          })
        }
      }),
      serverDate: jest.fn(function () { return new Date().toISOString() }),
      command: {
        gte: jest.fn(function (v) {
          return { $gte: v, lte: function (v2) { return { $gte: v, $lte: v2 } } }
        }),
        lte: jest.fn(function (v) { return { $lte: v } })
      }
    })),
    getWXContext: jest.fn(function () {
      return { OPENID: 'test-openid', APPID: 'test-appid', UNIONID: null }
    })
  }
})

const getGoalProgress = require('../cloudfunctions/getGoalProgress/index')

function fmt(d) {
  var y = d.getFullYear()
  var m = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function daysAgo(n) {
  var d = new Date()
  d.setDate(d.getDate() - n)
  return fmt(d)
}

function daysAhead(n) {
  var d = new Date()
  d.setDate(d.getDate() + n)
  return fmt(d)
}

function seed(name, data) {
  var doc = { _id: 's-' + Math.random().toString(36).slice(2), _openid: 'test-openid' }
  Object.assign(doc, data)
  mockData[name].push(doc)
  return doc
}

describe('getGoalProgress.main', function () {
  beforeEach(function () {
    mockData = { users: [], weight_logs: [] }
    mockDbError = false
  })

  test('returns error -1 when user not found', async function () {
    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(-1)
  })

  test('new user with no weight logs: current = initial, progress 0, empty trend', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.current_weight).toBe(60)
    expect(res.data.initial_weight).toBe(60)
    expect(res.data.target_weight).toBe(70)
    expect(res.data.progress_percent).toBe(0)
    expect(res.data.achieved).toBe(false)
    expect(res.data.estimated_date).toBeNull()
    expect(res.data.trend_data).toEqual([])
  })

  test('computes progress, remaining and recent rate for gaining goal', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(10), weight_kg: 60 })
    seed('weight_logs', { date: daysAgo(5), weight_kg: 62 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 63 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 63.5 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.current_weight).toBe(63.5)
    // progress = (60 - 63.5) / (60 - 70) * 100 = 35%
    expect(res.data.progress_percent).toBe(35)
    // remaining = target - current = 70 - 63.5，未达成时为正
    expect(res.data.remaining_kg).toBe(6.5)
    expect(res.data.achieved).toBe(false)
    expect(res.data.trend_data).toHaveLength(4)
    expect(res.data.estimated_date).not.toBeNull()
  })

  test('achieved when current >= target (gaining)', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 70.5 })
    seed('weight_logs', { date: daysAgo(0), weight_kg: 71 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.achieved).toBe(true)
    expect(res.data.current_weight).toBe(71)
    // remaining = target - current = 70 - 71，达成后为负
    expect(res.data.remaining_kg).toBe(-1)
    expect(res.data.progress_percent).toBeGreaterThan(100)
    expect(res.data.estimated_date).toBeNull()
  })

  test('estimated_date is null when rate direction mismatches goal', async function () {
    // 增重目标，但体重在往下掉
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(6), weight_kg: 62 })
    seed('weight_logs', { date: daysAgo(3), weight_kg: 61 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 60.5 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.achieved).toBe(false)
    expect(res.data.estimated_date).toBeNull()
  })

  test('estimated_date null with fewer than 3 weight logs', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 61 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 61.5 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.estimated_date).toBeNull()
    expect(res.data.progress_percent).toBe(15)
  })

  test('divide-by-zero guard when initial == target', async function () {
    seed('users', { current_weight_kg: 65, target_weight_kg: 65 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 65 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 65 })
    seed('weight_logs', { date: daysAgo(0), weight_kg: 65 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.achieved).toBe(true)
    expect(res.data.progress_percent).toBe(100)
  })

  test('prefers initial_weight over current_weight_kg when present', async function () {
    seed('users', { initial_weight: 55, current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 62 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 63 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.initial_weight).toBe(55)
  })

  test('estimated date lands in the future', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(6), weight_kg: 60 })
    seed('weight_logs', { date: daysAgo(4), weight_kg: 60.8 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 61.6 })
    seed('weight_logs', { date: daysAgo(0), weight_kg: 62 })

    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    // 最近7天首尾差 (62-60)/6 = 0.333...，剩余 (70-62)/0.333 ≈ 24天
    var est = res.data.estimated_date
    expect(est).not.toBeNull()
    expect(est).toBe(daysAhead(24))
  })

  test('returns error -1 on db crash', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    mockDbError = true
    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(-1)
  })
})
