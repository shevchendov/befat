const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')

beforeEach(() => { sdk.__resetDB() })

describe('__resetDB / __seed / __getDB', () => {
  test('__resetDB 清空所有集合', () => {
    sdk.__seed('users', { name: 'test' })
    expect(sdk.__getDB('users')).toHaveLength(1)
    sdk.__resetDB()
    expect(sdk.__getDB('users')).toHaveLength(0)
    expect(sdk.__getDB('food_logs')).toHaveLength(0)
    expect(sdk.__getDB('weight_logs')).toHaveLength(0)
    expect(sdk.__getDB('recipes')).toHaveLength(0)
  })

  test('__seed 返回带 _id 的文档', () => {
    const doc = sdk.__seed('users', { name: 'test' })
    expect(doc).toHaveProperty('_id')
    expect(doc._id).toMatch(/^id-\d+$/)
    expect(doc.name).toBe('test')
  })

  test('__getDB 不带参数返回全部集合', () => {
    const all = sdk.__getDB()
    expect(all).toHaveProperty('users')
    expect(all).toHaveProperty('food_logs')
    expect(all).toHaveProperty('weight_logs')
    expect(all).toHaveProperty('recipes')
  })
})

describe('_id 唯一性', () => {
  test('每个文档获得唯一 _id', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      const doc = sdk.__seed('users', { i })
      ids.add(doc._id)
    }
    expect(ids.size).toBe(100)
  })
})

describe('where 过滤', () => {
  test('按 _openid 过滤', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    sdk.__seed('food_logs', { _openid: 'user2', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1' }).get().then(res => {
      expect(res.data).toHaveLength(1)
      expect(res.data[0]._openid).toBe('user1')
    })
  })

  test('按 date 过滤', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-28' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    return col.where({ date: '2026-07-29' }).get().then(res => {
      expect(res.data).toHaveLength(1)
      expect(res.data[0].date).toBe('2026-07-29')
    })
  })

  test('按 _openid + date 双条件过滤', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-28' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    sdk.__seed('food_logs', { _openid: 'user2', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1', date: '2026-07-29' }).get().then(res => {
      expect(res.data).toHaveLength(1)
    })
  })

  test('无匹配时返回空数组', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'nonexistent' }).get().then(res => {
      expect(res.data).toEqual([])
    })
  })
})

describe('orderBy + limit + get 链式调用', () => {
  test('orderBy desc 排序', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-28' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1' }).orderBy('date', 'desc').get().then(res => {
      expect(res.data[0].date).toBe('2026-07-29')
      expect(res.data[1].date).toBe('2026-07-28')
    })
  })

  test('orderBy asc 排序', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-28' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1' }).orderBy('date', 'asc').get().then(res => {
      expect(res.data[0].date).toBe('2026-07-28')
      expect(res.data[1].date).toBe('2026-07-29')
    })
  })

  test('limit 限制返回条数', () => {
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-28' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-30' })
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1' }).orderBy('date', 'desc').limit(2).get().then(res => {
      expect(res.data).toHaveLength(2)
    })
  })
})

describe('add 自动注入 _openid', () => {
  test('add 自动添加 _openid', async () => {
    const col = sdk.database().collection('food_logs')
    await col.add({ data: { date: '2026-07-29', raw_text: '米饭' } })
    const db = sdk.__getDB('food_logs')
    expect(db).toHaveLength(1)
    expect(db[0]._openid).toBe('test-openid')
  })

  test('add 返回 _id', async () => {
    const col = sdk.database().collection('food_logs')
    const res = await col.add({ data: { date: '2026-07-29' } })
    expect(res).toHaveProperty('_id')
    expect(res._id).toMatch(/^id-\d+$/)
  })

  test('add 保留传入字段', async () => {
    const col = sdk.database().collection('food_logs')
    await col.add({ data: { date: '2026-07-29', raw_text: '米饭', total_calorie: 200 } })
    const db = sdk.__getDB('food_logs')
    expect(db[0].date).toBe('2026-07-29')
    expect(db[0].raw_text).toBe('米饭')
    expect(db[0].total_calorie).toBe(200)
  })
})

describe('doc().update()', () => {
  test('update 修改已有字段', async () => {
    const doc = sdk.__seed('weight_logs', { _openid: 'user1', date: '2026-07-29', weight_kg: 65 })
    const col = sdk.database().collection('weight_logs')
    await col.doc(doc._id).update({ data: { weight_kg: 70 } })
    const db = sdk.__getDB('weight_logs')
    expect(db[0].weight_kg).toBe(70)
  })

  test('update 不修改无关字段', async () => {
    const doc = sdk.__seed('weight_logs', { _openid: 'user1', date: '2026-07-29', weight_kg: 65, note: 'original' })
    const col = sdk.database().collection('weight_logs')
    await col.doc(doc._id).update({ data: { weight_kg: 70 } })
    const db = sdk.__getDB('weight_logs')
    expect(db[0].note).toBe('original')
  })

  test('update 不存在的 doc 不报错', async () => {
    const col = sdk.database().collection('weight_logs')
    const res = await col.doc('nonexistent-id').update({ data: { weight_kg: 70 } })
    expect(res).toBeDefined()
  })
})

describe('doc().remove()', () => {
  test('remove 删除文档', async () => {
    const doc = sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    const col = sdk.database().collection('food_logs')
    await col.doc(doc._id).remove()
    expect(sdk.__getDB('food_logs')).toHaveLength(0)
  })

  test('remove 不存在的 doc 不报错', async () => {
    const col = sdk.database().collection('food_logs')
    const res = await col.doc('nonexistent-id').remove()
    expect(res).toBeDefined()
  })
})

describe('count()', () => {
  test('空集合返回 0', async () => {
    const col = sdk.database().collection('recipes')
    const res = await col.count()
    expect(res.total).toBe(0)
  })

  test('有数据时返回长度', async () => {
    sdk.__seed('recipes', { title: 'recipe1' })
    sdk.__seed('recipes', { title: 'recipe2' })
    const col = sdk.database().collection('recipes')
    const res = await col.count()
    expect(res.total).toBe(2)
  })
})

describe('serverDate', () => {
  test('返回 ISO 字符串', () => {
    const db = sdk.database()
    const val = db.serverDate()
    expect(typeof val).toBe('string')
    expect(new Date(val).toISOString()).toBe(val)
  })
})

describe('getWXContext', () => {
  test('返回固定上下文', () => {
    const ctx = sdk.getWXContext()
    expect(ctx).toHaveProperty('OPENID', 'test-openid')
    expect(ctx).toHaveProperty('APPID', 'test-appid')
    expect(ctx).toHaveProperty('UNIONID', null)
  })
})

describe('limit 独立调用', () => {
  test('where().limit().get() 过滤正确', () => {
    for (let i = 0; i < 10; i++) {
      sdk.__seed('food_logs', { _openid: 'user1', date: '2026-07-29' })
    }
    const col = sdk.database().collection('food_logs')
    return col.where({ _openid: 'user1' }).limit(3).get().then(res => {
      expect(res.data).toHaveLength(3)
    })
  })
})
