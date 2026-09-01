jest.mock('axios')

const getNearbyPoi = require('../cloudfunctions/getNearbyPoi/index')
const axios = require('axios')
const origEnv = process.env

function mockMap(data) {
  axios.get.mockResolvedValue({ data })
}

beforeEach(() => {
  process.env = { ...origEnv }
  process.env.TENCENT_MAP_KEY = 'test-tencent-key'
  process.env.ZHIPU_API_KEY = 'test-zhipu-key'
  axios.get.mockReset()
  axios.post.mockReset()
  mockMap({ status: 0, count: 0, data: [] })
})

afterEach(() => {
  process.env = origEnv
})

describe('getNearbyPoi - 参数校验', () => {
  test('缺经纬度返回 code 2', async () => {
    const res = await getNearbyPoi.main({}, {})
    expect(res.code).toBe(2)
  })
})

describe('getNearbyPoi - 语义转译', () => {
  test('无 searchQuery 走默认检索，不调转译', async () => {
    mockMap({ status: 0, count: 1, data: [{ id: '1', title: '店', _distance: 800, location: { lat: 22.5, lng: 113.9 } }] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags).toBeNull()
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('searchQuery 转译成功，resolvedTags 透传', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '{"keywords":"粤菜|粥粉面","orderby":"_distance","reason":"匹配清淡口味"}' } }] } })
    mockMap({ status: 0, count: 1, data: [{ id: '1', title: '店', _distance: 800, location: { lat: 22.5, lng: 113.9 } }] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, searchQuery: '想吃清淡点的' }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags.keywords).toBe('粤菜|粥粉面')
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  test('转译失败降级：命中抽象映射表兜底', async () => {
    axios.post.mockRejectedValue(new Error('timeout'))
    mockMap({ status: 0, count: 0, data: [] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, searchQuery: '清淡' }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags.keywords).toBe('粤菜|粥|茶楼|蒸汽海鲜|点心')
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  test('转译返回非 JSON 降级：命中抽象映射表兜底', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '不是JSON' } }] } })
    mockMap({ status: 0, count: 0, data: [] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, searchQuery: '清淡' }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags.keywords).toBe('粤菜|粥|茶楼|蒸汽海鲜|点心')
  })
})

describe('getNearbyPoi - 地图 API', () => {
  test('api status 非 0 返回 code 3', async () => {
    mockMap({ status: 100 })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(3)
  })

  test('status 121 返回明确提示', async () => {
    mockMap({ status: 121 })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(3)
    expect(res.message).toContain('WebServiceAPI')
  })

  test('axios.get 异常返回 code -1', async () => {
    axios.get.mockRejectedValue(new Error('timeout'))
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(res.code).toBe(-1)
  })
})

describe('getNearbyPoi - 双目标类目隔离', () => {
  test('gain 模式带 filter=category=美食', async () => {
    mockMap({ status: 0, count: 0, data: [] })
    await getNearbyPoi.main({ lat: 22.5, lng: 113.9 }, {})
    expect(axios.get).toHaveBeenCalled()
    const params = axios.get.mock.calls[0][1].params
    expect(params.filter).toBe('category=美食')
    expect(params.keyword).toBe('美食')
  })

  test('lose 模式带 category=体育休闲 filter，默认运动关键词', async () => {
    mockMap({ status: 0, count: 0, data: [] })
    await getNearbyPoi.main({ lat: 22.5, lng: 113.9, goal_type: 'lose' }, {})
    expect(axios.get).toHaveBeenCalled()
    const params = axios.get.mock.calls[0][1].params
    expect(params.filter).toBe('category=体育休闲')
    expect(params.keyword).toBe('健身房|体育馆|运动场|公园|游泳馆')
  })

  test('lose 模式 searchQuery 走运动转译，不停留在餐饮', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '{"keywords":"公园|绿道|体育场","orderby":"_distance","reason":"已为你匹配跑步锻炼场所"}' } }] } })
    mockMap({ status: 0, count: 1, data: [{ id: '1', title: '公园', _distance: 500, location: { lat: 22.5, lng: 113.9 } }] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, goal_type: 'lose', searchQuery: '想跑步' }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags.keywords).toBe('公园|绿道|体育场')
    expect(res.resolvedTags.reason).toBe('已为你匹配跑步锻炼场所')
  })

  test('lose 模式转译失败兜底返回运动提示语', async () => {
    axios.post.mockRejectedValue(new Error('timeout'))
    mockMap({ status: 0, count: 0, data: [] })
    const res = await getNearbyPoi.main({ lat: 22.5, lng: 113.9, goal_type: 'lose', searchQuery: '健身房' }, {})
    expect(res.code).toBe(0)
    expect(res.resolvedTags.keywords).toBe('健身房')
    expect(res.resolvedTags.reason).toBe('为你匹配周边运动场所')
  })
})