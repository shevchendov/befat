jest.mock('axios')

const getNearbyPoi = require('../cloudfunctions/getNearbyPoi/index')
const axios = require('axios')
const origEnv = process.env

beforeEach(() => {
  process.env = { ...origEnv }
  process.env.TENCENT_MAP_KEY = 'test-tencent-key'
  axios.get.mockReset()
})

afterEach(() => {
  process.env = origEnv
})

describe('getNearbyPoi - 参数与配置', () => {
  test('缺经纬度返回 code 2', async () => {
    const res = await getNearbyPoi.main({}, {})
    expect(res.code).toBe(2)
  })
})

describe('getNearbyPoi - 检索', () => {
  test('成功返回 data 与 count', async () => {
    axios.get.mockResolvedValue({
      data: {
        status: 0,
        count: 2,
        data: [{ id: '1', title: '店', _distance: 800, location: { lat: 22.5, lng: 113.9 } }]
      }
    })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, radius: 1000, page: 1 }, {})
    expect(res.code).toBe(0)
    expect(res.data.count).toBe(2)
    expect(res.data.data).toHaveLength(1)
  })

  test('api status 非 0 返回 code 3', async () => {
    axios.get.mockResolvedValue({ data: { status: 100 } })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(3)
  })

  test('status 121 返回明确提示', async () => {
    axios.get.mockResolvedValue({ data: { status: 121 } })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(3)
    expect(res.message).toContain('WebServiceAPI')
  })

  test('axios 异常返回 code -1', async () => {
    axios.get.mockRejectedValue(new Error('timeout'))
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(-1)
  })
})