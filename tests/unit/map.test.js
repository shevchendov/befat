const map = require('../../miniprogram/utils/map')

let storage = {}

beforeEach(() => {
  storage = {}
  global.wx = {
    cloud: { callFunction: jest.fn() },
    getStorageSync: jest.fn(key => storage[key]),
    setStorageSync: jest.fn((key, val) => { storage[key] = val })
  }
})

function mockCallSuccess(data) {
  wx.cloud.callFunction.mockImplementation(({ success }) => success({ result: { code: 0, data } }))
}

const samplePoi = (id, dist) => ({
  id,
  title: '店' + id,
  address: '某地址',
  category: '小吃快餐',
  _distance: dist,
  location: { lat: 22.5, lng: 113.9 },
  tel: '13800000000'
})

describe('searchNearbyPoi - 缓存', () => {
  test('同坐标 TTL 内命中缓存，不调云函数', async () => {
    storage['poi_nearby_cache'] = {
      ts: Date.now(),
      lat: 22.5,
      lng: 113.9,
      list: [{ id: 'c1', title: '缓存店' }],
      total: 1
    }
    const res = await map.searchNearbyPoi({ lat: 22.5001, lng: 113.9001, page: 1 })
    expect(res.from_cache).toBe(true)
    expect(res.list[0].title).toBe('缓存店')
    expect(wx.cloud.callFunction).not.toHaveBeenCalled()
  })

  test('缓存过期则重新请求', async () => {
    storage['poi_nearby_cache'] = { ts: Date.now() - 10 * 60 * 1000, lat: 22.5, lng: 113.9, list: [], total: 0 }
    mockCallSuccess({ data: [samplePoi('1', 800)], count: 1 })
    const res = await map.searchNearbyPoi({ lat: 22.5, lng: 113.9, page: 1 })
    expect(res.from_cache).toBe(false)
    expect(wx.cloud.callFunction).toHaveBeenCalled()
  })
})

describe('searchNearbyPoi - 检索与扩距', () => {
  test('1km 有结果直接返回', async () => {
    mockCallSuccess({ data: [samplePoi('1', 800), samplePoi('2', 1500)], count: 2 })
    const res = await map.searchNearbyPoi({ lat: 22.5, lng: 113.9, page: 1 })
    expect(res.list).toHaveLength(2)
    expect(res.list[0].distance_text).toBe('800m')
    expect(res.list[1].distance_text).toBe('1.5km')
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(1)
  })

  test('1km 空则扩至 3km 重新检索', async () => {
    wx.cloud.callFunction
      .mockImplementationOnce(({ success }) => success({ result: { code: 0, data: { data: [], count: 0 } } }))
      .mockImplementationOnce(({ success }) => success({ result: { code: 0, data: { data: [samplePoi('3', 2500)], count: 1 } } }))
    const res = await map.searchNearbyPoi({ lat: 22.5, lng: 113.9, page: 1 })
    expect(res.list).toHaveLength(1)
    expect(wx.cloud.callFunction).toHaveBeenCalledTimes(2)
  })
})

describe('searchNearbyPoi - 超时与异常', () => {
  test('withTimeout 超时 reject MAP_TIMEOUT', async () => {
    const never = new Promise(() => {})
    await expect(map.withTimeout(never, 50)).rejects.toThrow('MAP_TIMEOUT')
  })

  test('云函数返回非 0 code 时 reject', async () => {
    wx.cloud.callFunction.mockImplementation(({ success }) => success({ result: { code: 3, message: 'status fail' } }))
    await expect(map.searchNearbyPoi({ lat: 22.5, lng: 113.9, page: 1 })).rejects.toThrow('MAP_API_3')
  })
})

describe('roundCoord', () => {
  test('四舍五入到小数点后 3 位', () => {
    expect(map.roundCoord(22.5001)).toBe(22.5)
    expect(map.roundCoord(113.9996)).toBe(114)
  })
})