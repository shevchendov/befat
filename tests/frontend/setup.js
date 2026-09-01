const pageRegistry = []
const collectionAdd = jest.fn()
const callFnMock = jest.fn()
const dbStore = {}

function getCol(name) {
  if (!dbStore[name]) {
    const docs = []
    const col = {
      _docs: docs,
      where(q) {
        return {
          get() {
            return Promise.resolve({ data: docs.filter(d => {
              for (const k in q) {
                if (d[k] !== q[k] && !(q[k] === '{openid}' && d._openid)) return false
              }
              return true
            }) })
          },
          doc(id) { return { get() { return Promise.resolve({ data: docs.find(d => d._id === id) || null }) } } },
          add: collectionAdd,
          orderBy() { return { limit() { return { get() { return Promise.resolve({ data: [...docs] }) } } }, get() { return Promise.resolve({ data: [...docs] }) } } },
          limit() { return { get() { return Promise.resolve({ data: [...docs] }) } } }
        }
      },
      doc(id) { return { get() { return Promise.resolve({ data: docs.find(d => d._id === id) || null }) } } },
      add: collectionAdd,
      get() { return Promise.resolve({ data: [...docs] }) },
      orderBy() { return { limit() { return { get() { return Promise.resolve({ data: [...docs] }) } } }, get() { return Promise.resolve({ data: [...docs] }) } } },
      limit() { return { get() { return Promise.resolve({ data: [...docs] }) } } }
    }
    dbStore[name] = col
  }
  return dbStore[name]
}

const wxCloud = {
  init: jest.fn(),
  database: jest.fn(() => ({
    collection: jest.fn(name => getCol(name)),
    serverDate: jest.fn(() => new Date().toISOString())
  })),
  callFunction: callFnMock,
  DB: { REGEX: Symbol('REGEX') }
}

const mockStorage = {}

global.wx = {
  cloud: wxCloud,
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showModal: jest.fn(({ success }) => { if (success) success({ confirm: true, cancel: false }) }),
  navigateTo: jest.fn(),
  navigateBack: jest.fn(),
  reLaunch: jest.fn(),
  setNavigationBarTitle: jest.fn(),
  createSelectorQuery: jest.fn(() => ({
    select: jest.fn(() => ({
      fields: jest.fn(function(_, cb) { if (typeof cb === 'function') process.nextTick(() => cb([{ node: null, width: 300, height: 200 }])); return { exec: jest.fn() } })
    })),
    exec: jest.fn()
  })),
  getWindowInfo: jest.fn(() => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 667 })),
  getFileSystemManager: jest.fn(() => ({ writeFileSync: jest.fn(), readFileSync: jest.fn(() => '{}') })),
  env: { USER_DATA_PATH: '/tmp' },
  requestSubscribeMessage: jest.fn(({ success }) => { if (success) success({}) }),
  openDocument: jest.fn(({ success }) => { if (success) success() }),
  chooseMedia: jest.fn(({ success }) => { if (success) success({ tempFiles: [{ tempFilePath: '/tmp/meal.jpg' }] }) }),
  getImageInfo: jest.fn(({ src, success }) => { if (success) success({ width: 3000, height: 4000 }) }),
  createOffscreenCanvas: jest.fn(() => ({
    getContext: jest.fn(() => ({ drawImage: jest.fn() })),
    createImage: jest.fn(() => {
      const img = { onload: null, onerror: null }
      let _src = ''
      Object.defineProperty(img, 'src', {
        set(v) { _src = v; if (img.onload) setTimeout(() => img.onload(), 0) },
        get() { return _src }
      })
      return img
    }),
    toDataURL: jest.fn(() => 'data:image/jpeg;base64,Zm9vYmFy')
  })),
  getStorageSync: jest.fn(key => mockStorage[key]),
  setStorageSync: jest.fn((key, val) => { mockStorage[key] = val }),
  clearStorageSync: jest.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) })
}

global.Page = jest.fn(config => { pageRegistry.push(config) })

// getApp 返回稳定单例：真实 getApp 是单例，页面在 require 时捕获引用，
// 测试需通过同一实例操作 globalData（如 forceIndexRefresh）才能正确断言
const appMock = { globalData: { userInfo: null, dailyTargets: null, forceIndexRefresh: false, isWeightUpdated: false, isGoalUpdated: false } }
global.getApp = jest.fn(() => appMock)
global.getCurrentPages = jest.fn(() => [{ route: 'pages/test/test' }])

beforeEach(() => {
  pageRegistry.length = 0
  Object.keys(dbStore).forEach(k => { dbStore[k]._docs.length = 0 })
  collectionAdd.mockReset()
  collectionAdd.mockImplementation(({ data }) => {
    return Promise.resolve({ _id: 'mock-id' })
  })
  callFnMock.mockReset()
  callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: {} } })
  Object.keys(global.wx).forEach(k => {
    if (typeof global.wx[k] === 'function' && k !== 'cloud') {
      if (k !== 'showModal' && k !== 'getWindowInfo' && k !== 'clearStorageSync') global.wx[k].mockClear()
    }
  })
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
})

function createPage(config) {
  const page = {
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData: jest.fn(function (newData, cb) {
      for (const key in newData) {
        const m = key.match(/^([^\[]+)\[(\d+)\]\.(.+)$/)
        if (m && this.data[m[1]] && this.data[m[1]][m[2]]) {
          this.data[m[1]][m[2]][m[3]] = newData[key]
          continue
        }
        const dm = key.match(/^([^.]+)\.(.+)$/)
        if (dm && this.data[dm[1]] && typeof this.data[dm[1]] === 'object') {
          const parts = dm[2].split('.')
          let obj = this.data[dm[1]]
          for (let i = 0; i < parts.length - 1; i++) {
            if (obj[parts[i]] == null) obj[parts[i]] = {}
            obj = obj[parts[i]]
          }
          obj[parts[parts.length - 1]] = newData[key]
          continue
        }
        this.data[key] = newData[key]
      }
      if (cb) cb()
    })
  }
  Object.keys(config).forEach(key => {
    if (typeof config[key] === 'function') page[key] = config[key].bind(page)
  })
  return page
}

function getLastPageConfig() { return pageRegistry[pageRegistry.length - 1] }
function getColRef(name) { return getCol(name) }

module.exports = { pageRegistry, createPage, getLastPageConfig, callFnMock, collectionAdd, getColRef }
