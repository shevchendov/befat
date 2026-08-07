jest.mock('wx-server-sdk', () => {
  const store = { food_logs: [], weight_logs: [], users: [] }

  function matchQuery(doc, query) {
    for (const key of Object.keys(query || {})) {
      const cond = query[key]
      if (cond && typeof cond === 'object' && !Array.isArray(cond) && ('gte' in cond || 'lte' in cond)) {
        if (cond.gte != null && doc[key] < cond.gte) return false
        if (cond.lte != null && doc[key] > cond.lte) return false
      } else if (doc[key] !== cond) {
        return false
      }
    }
    return true
  }

  function makeCollection(name) {
    const state = { q: {}, orderBy: null, skip: 0, limit: null }
    function runGet() {
      let list = store[name].filter(doc => matchQuery(doc, state.q))
      if (state.orderBy) {
        const [field, dir] = state.orderBy
        list = list.slice().sort((a, b) => {
          const av = a[field] == null ? '' : a[field]
          const bv = b[field] == null ? '' : b[field]
          if (av < bv) return dir === 'desc' ? 1 : -1
          if (av > bv) return dir === 'desc' ? -1 : 1
          return 0
        })
      }
      if (state.limit != null) list = list.slice(state.skip, state.skip + state.limit)
      else if (state.skip > 0) list = list.slice(state.skip)
      return Promise.resolve({ data: list })
    }
    const col = {
      where: jest.fn(q => { state.q = q; return col }),
      orderBy: jest.fn((field, dir) => { state.orderBy = [field, dir]; return col }),
      skip: jest.fn(n => { state.skip = n; return col }),
      limit: jest.fn(n => { state.limit = n; return col }),
      get: jest.fn(runGet),
      add: jest.fn(({ data }) => {
        store[name].push(data)
        return Promise.resolve({ _id: 'mock-id' })
      })
    }
    return col
  }

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'env-mock',
    database: jest.fn(() => ({
      collection: jest.fn(name => makeCollection(name)),
      command: {
        gte: v => ({
          gte: v,
          lte: l => ({ gte: v, lte: l }),
          gt: () => ({}),
          lt: () => ({}),
          eq: () => ({ gte: v })
        }),
        lte: v => ({ lte: v })
      }
    })),
    getWXContext: jest.fn(() => ({ OPENID: 'test-openid', APPID: 'test-appid', UNIONID: null })),
    __reset: () => {
      store.food_logs = []
      store.weight_logs = []
      store.users = []
    }
  }
})

const getStats = require('../cloudfunctions/getStats/index')
const sdk = require('wx-server-sdk')

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function seed(collection, doc) {
  const db = sdk.database()
  await db.collection(collection).add({ data: doc })
}

beforeEach(() => {
  sdk.__reset()
})

describe('getStats - validation', () => {
  test('defaults days to 90 and fills end_date', async () => {
    const res = await getStats.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.days).toBe(90)
    expect(res.data.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('clamps days into [1, 365]', async () => {
    const big = await getStats.main({ days: 500 }, {})
    expect(big.data.days).toBe(365)
    const zero = await getStats.main({ days: 0 }, {})
    expect(zero.data.days).toBe(1)
    const neg = await getStats.main({ days: -5 }, {})
    expect(neg.data.days).toBe(1)
  })
})

describe('getStats - empty account', () => {
  test('returns empty data without crashing', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2500, daily_protein_target_g: 90 })
    const res = await getStats.main({ days: 90, endDate: '2026-08-05' }, {})
    expect(res.code).toBe(0)
    expect(res.data.weights).toHaveLength(0)
    expect(res.data.summary.recorded_days).toBe(0)
    expect(res.data.summary.week.calorie_rate).toBeNull()
    expect(res.data.summary.month.protein_rate).toBeNull()
    expect(res.data.weeks.length).toBeGreaterThan(0)
  })
})

describe('getStats - aggregation and attainment', () => {
  test('sums meals per day and judges ok/fail on weights', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2500, daily_protein_target_g: 90 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-01', meal_type: 'lunch', total_calorie: 1200, total_protein_g: 50 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-01', meal_type: 'dinner', total_calorie: 1500, total_protein_g: 50 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-02', meal_type: 'breakfast', total_calorie: 1500, total_protein_g: 40 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-03', meal_type: 'lunch', total_calorie: 2000, total_protein_g: 80 })
    await seed('weight_logs', { _openid: 'test-openid', date: '2026-08-01', weight_kg: 55.2 })
    await seed('weight_logs', { _openid: 'test-openid', date: '2026-08-02', weight_kg: 55.4 })

    const res = await getStats.main({ days: 90, endDate: '2026-08-05' }, {})
    expect(res.code).toBe(0)
    expect(res.data.summary.recorded_days).toBe(3)
    expect(res.data.summary.week.recorded).toBe(3)
    expect(res.data.summary.week.calorie_rate).toBe(33)
    expect(res.data.summary.week.protein_rate).toBe(33)
    expect(res.data.weights.find(w => w.date === '2026-08-01').nutr).toBe('ok')
    expect(res.data.weights.find(w => w.date === '2026-08-02').nutr).toBe('fail')
  })

  test('returns null rates when targets are unset', async () => {
    await seed('users', { _openid: 'test-openid' })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-01', meal_type: 'lunch', total_calorie: 2000, total_protein_g: 80 })
    const res = await getStats.main({ days: 30, endDate: '2026-08-02' }, {})
    expect(res.data.target.calorie).toBe(0)
    expect(res.data.target.protein_g).toBe(0)
    expect(res.data.summary.week.recorded).toBe(1)
    expect(res.data.summary.week.calorie_rate).toBeNull()
    expect(res.data.summary.week.protein_rate).toBeNull()
    expect(res.data.weights).toHaveLength(0)
  })

  test('judges by calorie alone when protein target unset', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2000 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-01', meal_type: 'lunch', total_calorie: 2200, total_protein_g: 80 })
    await seed('weight_logs', { _openid: 'test-openid', date: '2026-08-01', weight_kg: 55.0 })
    const res = await getStats.main({ days: 30, endDate: '2026-08-02' }, {})
    expect(res.data.target.protein_g).toBe(0)
    expect(res.data.summary.week.calorie_rate).toBe(100)
    expect(res.data.summary.week.protein_rate).toBeNull()
    expect(res.data.weights[0].nutr).toBe('ok')
  })
})

describe('getStats - weekly aggregation', () => {
  test('computes weight delta within a week', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2500, daily_protein_target_g: 90 })
    await seed('weight_logs', { _openid: 'test-openid', date: '2026-08-03', weight_kg: 55.0 })
    await seed('weight_logs', { _openid: 'test-openid', date: '2026-08-06', weight_kg: 55.6 })
    const res = await getStats.main({ days: 30, endDate: '2026-08-07' }, {})
    const week = res.data.weeks.find(w => w.label === '8/3-8/7')
    expect(week).toBeTruthy()
    expect(week.weight_delta).toBe(0.6)
  })

  test('weight_delta is null when a week has no weight records', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2500, daily_protein_target_g: 90 })
    await seed('food_logs', { _openid: 'test-openid', date: '2026-08-04', meal_type: 'lunch', total_calorie: 2600, total_protein_g: 95 })
    const res = await getStats.main({ days: 30, endDate: '2026-08-07' }, {})
    const week = res.data.weeks.find(w => w.label === '8/3-8/7')
    expect(week.recorded).toBe(1)
    expect(week.calorie_rate).toBe(100)
    expect(week.weight_delta).toBeNull()
  })
})

describe('getStats - pagination', () => {
  test('paginates more than 100 food logs', async () => {
    await seed('users', { _openid: 'test-openid', daily_calorie_target: 2500, daily_protein_target_g: 90 })
    const db = sdk.database()
    const col = db.collection('food_logs')
    for (let i = 0; i < 150; i++) {
      const d = new Date(2026, 0, 1)
      d.setDate(d.getDate() + i)
      await col.add({ data: { _openid: 'test-openid', date: fmt(d), meal_type: 'lunch', total_calorie: 2600, total_protein_g: 95 } })
    }
    const res = await getStats.main({ days: 200, endDate: '2026-07-19' }, {})
    expect(res.data.summary.recorded_days).toBe(150)
  })
})
