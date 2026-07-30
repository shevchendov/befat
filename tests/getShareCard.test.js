let mockData = { food_logs: [], users: [], weight_logs: [] }
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
                  limit: jest.fn(function (n) {
                    return {
                      get: jest.fn().mockResolvedValue({
                        data: filtered().sort(function (a, b) {
                          var va = a[field] || '', vb = b[field] || ''
                          return dir === 'desc' ? String(vb).localeCompare(va) : String(va).localeCompare(vb)
                        }).slice(0, n)
                      })
                    }
                  }),
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
            return {
              get: jest.fn().mockResolvedValue({ data: coll(name) })
            }
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
          return {
            $gte: v,
            lte: function (v2) { return { $gte: v, $lte: v2 } }
          }
        }),
        lte: jest.fn(function (v) { return { $lte: v } }),
        in: function (arr) { return { in: arr } }
      }
    })),
    getWXContext: jest.fn(function () {
      return { OPENID: 'test-openid', APPID: 'test-appid', UNIONID: null }
    })
  }
})

const getShareCard = require('../cloudfunctions/getShareCard/index')

function fmt(d) {
  var y = d.getFullYear()
  var m = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function today() { return fmt(new Date()) }

function daysAgo(n) {
  var d = new Date()
  d.setDate(d.getDate() - n)
  return fmt(d)
}

function seed(name, data) {
  var doc = { _id: 's-' + Math.random().toString(36).slice(2), _openid: 'test-openid' }
  Object.assign(doc, data)
  mockData[name].push(doc)
  return doc
}

describe('getShareCard.main', function () {
  beforeEach(function () {
    mockData = { food_logs: [], users: [], weight_logs: [] }
    mockDbError = false
  })

  test('returns aggregated data with food logs and user targets', async function () {
    seed('users', { daily_calorie_target: 2500, daily_protein_target_g: 120, target_weight_kg: 75 })
    seed('food_logs', { date: today(), total_calorie: 1800, total_protein_g: 95, meal_type: 'lunch' })
    seed('weight_logs', { date: daysAgo(6), weight_kg: 70 })
    seed('weight_logs', { date: today(), weight_kg: 70.5 })

    var res = await getShareCard.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.total_calorie).toBe(1800)
    expect(res.data.total_protein_g).toBe(95)
    expect(res.data.target_calorie).toBe(2500)
    expect(res.data.target_protein).toBe(120)
    expect(res.data.target_weight_kg).toBe(75)
    expect(res.data.latest_weight_kg).toBe(70.5)
    expect(res.data.remaining_kg).toBe(4.5)
  })

  test('returns zero calorie/protein when no food logs today', async function () {
    seed('users', { daily_calorie_target: 2000, daily_protein_target_g: 100, target_weight_kg: 70 })
    var res = await getShareCard.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.total_calorie).toBe(0)
    expect(res.data.total_protein_g).toBe(0)
  })

  test('returns null latest_weight and remaining when no weight logs', async function () {
    seed('users', { daily_calorie_target: 2500, daily_protein_target_g: 120, target_weight_kg: 75 })
    var res = await getShareCard.main({}, {})
    expect(res.data.latest_weight_kg).toBeNull()
    expect(res.data.remaining_kg).toBeNull()
  })

  test('returns null remaining_kg when user has no target_weight_kg', async function () {
    seed('users', { daily_calorie_target: 2500, daily_protein_target_g: 120 })
    seed('weight_logs', { date: today(), weight_kg: 72 })
    var res = await getShareCard.main({}, {})
    expect(res.data.latest_weight_kg).toBe(72)
    expect(res.data.remaining_kg).toBeNull()
  })

  test('returns zero week_weight_change with fewer than 2 weight logs this week', async function () {
    seed('weight_logs', { date: today(), weight_kg: 72 })
    var res = await getShareCard.main({}, {})
    expect(res.data.week_weight_change_kg).toBe(0)
  })

  test('calculates week weight change correctly', async function () {
    seed('weight_logs', { date: daysAgo(3), weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 71.2 })
    var res = await getShareCard.main({}, {})
    expect(res.data.week_weight_change_kg).toBe(1.2)
  })

  test('calculates consecutive days from food_logs only', async function () {
    seed('food_logs', { date: today(), total_calorie: 100 })
    seed('food_logs', { date: daysAgo(1), total_calorie: 200 })
    seed('food_logs', { date: daysAgo(2), total_calorie: 300 })
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(3)
  })

  test('calculates consecutive days from weight_logs only', async function () {
    seed('weight_logs', { date: today(), weight_kg: 70 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 70.5 })
    seed('weight_logs', { date: daysAgo(2), weight_kg: 71 })
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(3)
  })

  test('merges food_logs and weight_logs for consecutive days', async function () {
    seed('food_logs', { date: today(), total_calorie: 100 })
    seed('weight_logs', { date: daysAgo(1), weight_kg: 70 })
    seed('food_logs', { date: daysAgo(2), total_calorie: 200 })
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(3)
  })

  test('stops counting at gap in consecutive days', async function () {
    seed('food_logs', { date: today(), total_calorie: 100 })
    seed('food_logs', { date: daysAgo(1), total_calorie: 200 })
    seed('food_logs', { date: daysAgo(3), total_calorie: 300 })
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(2)
  })

  test('returns 0 consecutive days when no logs exist', async function () {
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(0)
  })

  test('returns 0 consecutive days when no log today but had previous days', async function () {
    seed('food_logs', { date: daysAgo(1), total_calorie: 200 })
    seed('food_logs', { date: daysAgo(2), total_calorie: 300 })
    var res = await getShareCard.main({}, {})
    expect(res.data.consecutive_days).toBe(0)
  })

  test('returns error code -1 on db crash', async function () {
    mockDbError = true
    var res = await getShareCard.main({}, {})
    expect(res.code).toBe(-1)
  })
})
