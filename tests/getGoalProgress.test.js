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
                // 模拟云函数侧单次 get 默认 100 条上限；显式 limit 时按 limit 截断
                var sorted = filtered().sort(function (a, b) {
                  var va = a[field] || '', vb = b[field] || ''
                  return dir === 'desc' ? String(vb).localeCompare(va) : String(va).localeCompare(vb)
                })
                return {
                  limit: jest.fn(function (n) {
                    return { get: jest.fn().mockResolvedValue({ data: sorted.slice(0, n || 100) }) }
                  }),
                  get: jest.fn().mockResolvedValue({ data: sorted.slice(0, 100) })
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

  describe('target weeks: planned_date / pace_status / plan_expired', function () {
    test('has recentRate AND target_weeks: estimated from rate, planned_date separate', async function () {
      seed('users', { current_weight_kg: 60, target_weight_kg: 70, target_weeks: 12, target_weeks_set_at: daysAgo(0) })
      seed('weight_logs', { date: daysAgo(6), weight_kg: 60 })
      seed('weight_logs', { date: daysAgo(4), weight_kg: 60.8 })
      seed('weight_logs', { date: daysAgo(2), weight_kg: 61.6 })
      seed('weight_logs', { date: daysAgo(0), weight_kg: 62 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      // estimated 仍按实测速率：(62-60)/6 = 0.333，剩余 8kg → 24 天
      expect(res.data.estimated_date).toBe(daysAhead(24))
      // planned 按周期单独返回：今天 + 12*7 = 84 天
      expect(res.data.planned_date).toBe(daysAhead(84))
      // 实际节奏(24天) 远早于计划(84天)，超出 14 天容差 → ahead
      expect(res.data.pace_status).toBe('ahead')
      expect(res.data.plan_expired).toBe(false)
    })

    test('no recentRate but has target_weeks: planned-rate estimate with basis=planned', async function () {
      seed('users', { current_weight_kg: 60, target_weight_kg: 70, target_weeks: 12, target_weeks_set_at: daysAgo(0) })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      // 无速率数据时用计划隐含速率 (70-60)/12 推算 → 恰好 12 周 = 84 天
      expect(res.data.estimated_date).toBe(daysAhead(84))
      expect(res.data.estimate_basis).toBe('planned')
      expect(res.data.planned_date).toBe(daysAhead(84))
      expect(res.data.plan_expired).toBe(false)
    })

    test('planned estimate responds to target change via frozen expected_weekly_rate', async function () {
      // 快照速率 0.5kg/周（如原计划 60→65 共 10 周），改目标到 70 后：
      // remainingWeeks = 10/0.5 = 20 → 140 天
      seed('users', { current_weight_kg: 60, target_weight_kg: 70, target_weeks: 10, expected_weekly_rate: 0.5 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      expect(res.data.estimated_date).toBe(daysAhead(140))
      expect(res.data.estimate_basis).toBe('planned')
    })

    test('measured estimate reports basis=measured', async function () {
      seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
      seed('weight_logs', { date: daysAgo(6), weight_kg: 60 })
      seed('weight_logs', { date: daysAgo(4), weight_kg: 60.8 })
      seed('weight_logs', { date: daysAgo(2), weight_kg: 61.6 })
      seed('weight_logs', { date: daysAgo(0), weight_kg: 62 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      expect(res.data.estimate_basis).toBe('measured')
    })

    test('loss direction: no rate snapshot, no planned estimate', async function () {
      // 目标(65) < 起始(70) 为减重方向，calcExpectedWeeklyRate 返回 null 不落库，
      // branch C 因计划速率缺失也不给出预估
      seed('users', { current_weight_kg: 70, target_weight_kg: 65, target_weeks: 10 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      expect(res.data.estimated_date).toBeNull()
      expect(res.data.estimate_basis).toBeNull()
    })

    test('direction mismatch: target_weeks must NOT override the existing no-estimate downgrade', async function () {
      // 增重目标但体重在下降，即使存了 target_weeks，estimated_date 仍须为 null
      seed('users', { current_weight_kg: 60, target_weight_kg: 70, target_weeks: 12, target_weeks_set_at: daysAgo(0) })
      seed('weight_logs', { date: daysAgo(6), weight_kg: 62 })
      seed('weight_logs', { date: daysAgo(3), weight_kg: 61 })
      seed('weight_logs', { date: daysAgo(1), weight_kg: 60.5 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      expect(res.data.achieved).toBe(false)
      expect(res.data.estimated_date).toBeNull()
      expect(res.data.planned_date).toBe(daysAhead(84))
      expect(res.data.pace_status).toBeNull()
      expect(res.data.plan_expired).toBe(false)
    })

    test('expired plan: planned_date stays a real (past) date with plan_expired=true, no crash', async function () {
      // 20 天前设置 2 周计划 → 期限 = 20天前 + 14天 = 6天前，已过期
      seed('users', { current_weight_kg: 60, target_weight_kg: 70, target_weeks: 2, target_weeks_set_at: daysAgo(20) })
      seed('weight_logs', { date: daysAgo(6), weight_kg: 61 })
      seed('weight_logs', { date: daysAgo(3), weight_kg: 61.5 })
      seed('weight_logs', { date: daysAgo(1), weight_kg: 62 })

      var res = await getGoalProgress.main({}, {})
      expect(res.code).toBe(0)
      expect(res.data.planned_date).toBe(daysAgo(6))
      expect(res.data.plan_expired).toBe(true)
      // 实测速率 (62-61)/5 = 0.2，剩余 8kg → 40 天，远晚于已过期计划 → behind
      expect(res.data.estimated_date).toBe(daysAhead(40))
      expect(res.data.pace_status).toBe('behind')
    })
  })

  test('超过 100 条记录时 current_weight 取最新而非被截断成最旧 100 条', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    for (var i = 0; i < 110; i++) {
      seed('weight_logs', { date: daysAgo(109 - i), weight_kg: 60 + i * 0.5 })
    }
    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(0)
    // 最新记录 = daysAgo(0)，体重 60 + 109*0.5 = 114.5；旧实现会返回最旧 100 条里的最后一条 = 110
    expect(res.data.current_weight).toBe(114.5)
    // 趋势数据只保留最近 100 条
    expect(res.data.trend_data).toHaveLength(100)
  })

  test('returns error -1 on db crash', async function () {
    seed('users', { current_weight_kg: 60, target_weight_kg: 70 })
    mockDbError = true
    var res = await getGoalProgress.main({}, {})
    expect(res.code).toBe(-1)
  })
})
