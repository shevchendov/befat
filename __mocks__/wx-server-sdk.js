const DB = { users: [], food_logs: [], weight_logs: [], recipes: [], user_favorites: [] }
let idSeq = 1
const _serverDate = () => new Date().toISOString()

const mockServerDate = jest.fn(() => _serverDate())

function genId() { return 'id-' + (idSeq++) }

function buildGet(collection, query) {
  return jest.fn().mockImplementation(() => {
    const items = filterItems(DB[collection], query)
    return Promise.resolve({ data: items })
  })
}

function filterItems(items, query) {
  if (query) {
    if (query._openid) items = items.filter(r => r._openid === query._openid)
    if (query.date) items = items.filter(r => r.date === query.date)
  }
  return items
}

function buildOrderBy(collection, query) {
  return jest.fn((field, dir) => ({
    limit: jest.fn(n => ({
      get: jest.fn().mockImplementation(() => {
        let items = filterItems(DB[collection], query)
        const sorted = items.slice().sort((a, b) => {
          const va = a[field] || '', vb = b[field] || ''
          return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
        })
        return Promise.resolve({ data: sorted.slice(0, n) })
      })
    })),
    get: jest.fn().mockImplementation(() => {
      let items = filterItems(DB[collection], query)
      const sorted = items.slice().sort((a, b) => {
        const va = a[field] || '', vb = b[field] || ''
        return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
      })
      return Promise.resolve({ data: sorted })
    })
  }))
}

const cloud = {
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'env-mock',
  database: jest.fn(() => ({
    collection: jest.fn(name => {
      const col = {
        where: jest.fn(query => ({
          orderBy: buildOrderBy(name, query),
          get: buildGet(name, query),
          limit: jest.fn(n => ({
            get: jest.fn().mockImplementation(() => {
              const items = filterItems(DB[name], query)
              return Promise.resolve({ data: items.slice(0, n) })
            })
          }))
        })),
        doc: jest.fn(id => ({
          get: jest.fn().mockImplementation(() => {
            const item = DB[name].find(r => r._id === id)
            return Promise.resolve({ data: item || null })
          }),
          update: jest.fn().mockImplementation(({ data }) => {
            const idx = DB[name].findIndex(r => r._id === id)
            if (idx !== -1) Object.assign(DB[name][idx], data)
            return Promise.resolve({})
          }),
          remove: jest.fn().mockImplementation(() => {
            const idx = DB[name].findIndex(r => r._id === id)
            if (idx !== -1) DB[name].splice(idx, 1)
            return Promise.resolve({})
          })
        })),
        add: jest.fn().mockImplementation(({ data }) => {
          const openid = cloud.getWXContext().OPENID
          const doc = { _id: genId(), _openid: openid, ...data }
          DB[name].push(doc)
          return Promise.resolve({ _id: doc._id })
        }),
        count: jest.fn().mockResolvedValue({ total: DB[name].length }),
        orderBy: jest.fn((field, dir) => ({
          get: jest.fn().mockImplementation(() => {
            const items = DB[name] || []
            const sorted = items.slice().sort((a, b) => {
              const va = a[field] || '', vb = b[field] || ''
              return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
            })
            return Promise.resolve({ data: sorted })
          })
        })),
        get: jest.fn().mockImplementation(() => {
          const items = DB[name] || []
          return Promise.resolve({ data: items })
        })
      }
      return col
    }),
    serverDate: mockServerDate,
    command: {
      in: (arr) => ({ in: arr })
    }
  })),
  getWXContext: jest.fn(() => ({
    OPENID: 'test-openid',
    APPID: 'test-appid',
    UNIONID: null
  })),
  openapi: {
    security: {
      msgSecCheck: jest.fn().mockResolvedValue({ errCode: 0, errMsg: 'ok' })
    }
  },
  __resetDB() {
    Object.keys(DB).forEach(k => { DB[k] = [] })
    idSeq = 1
  },
  __getDB(name) { return name ? DB[name] : DB },
  __seed(collection, data) {
    const doc = { _id: genId(), ...data }
    DB[collection].push(doc)
    return doc
  }
}

module.exports = cloud
