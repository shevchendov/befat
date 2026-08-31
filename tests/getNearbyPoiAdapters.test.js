// 适配器归一化 + schema + intent 单元测试
jest.mock('axios')

const axios = require('axios')
const schema = require('../cloudfunctions/getNearbyPoi/common/schema')
const intent = require('../cloudfunctions/getNearbyPoi/common/intent')
const tencent = require('../cloudfunctions/getNearbyPoi/adapters/tencent')
const baidu = require('../cloudfunctions/getNearbyPoi/adapters/baidu')
const amap = require('../cloudfunctions/getNearbyPoi/adapters/amap')

const origEnv = process.env

beforeEach(() => {
  process.env = { ...origEnv }
  process.env.TENCENT_MAP_KEY = 'tk'
  process.env.BAIDU_MAP_AK = 'bk'
  process.env.AMAP_KEY = 'ak'
  process.env.ZHIPU_API_KEY = 'zk'
  axios.get.mockReset()
  axios.post.mockReset()
})

afterEach(() => { process.env = origEnv })

describe('schema.normalizePoi', () => {
  test('统一输出全字段 + 距离文本', () => {
    const p = schema.normalizePoi({
      id: 1, title: '店A', address: '地址', category: '小吃快餐',
      distance_m: 800, latitude: 22.5, longitude: 113.9,
      tel: '138...', rating: 4.2, avg_price: 30, tags: ['好吃', '实惠', 'x', 'y', 'z']
    }, 'tencent')
    expect(p.provider).toBe('tencent')
    expect(p.distance_text).toBe('800m')
    expect(p.rating).toBe(4.2)
    expect(p.avg_price).toBe(30)
    expect(p.tags).toHaveLength(3)  // tags 上限 3
  })

  test('距离 >= 1000m 显示 km', () => {
    const p = schema.normalizePoi({ id: '1', distance_m: 1500 }, 'amap')
    expect(p.distance_text).toBe('1.5km')
  })

  test('缺省字段兜底为 0/空串/空数组', () => {
    const p = schema.normalizePoi({ id: '2' }, 'baidu')
    expect(p.title).toBe('')
    expect(p.distance_m).toBe(0)
    expect(p.rating).toBe(0)
    expect(p.avg_price).toBe(0)
    expect(p.tags).toEqual([])
    expect(p.tel).toBe('')
  })
})

describe('tencent adapter', () => {
  test('buildParams gain 加 category=美食，坐标 lat,lng', () => {
    const params = tencent.buildParams({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '粤菜', page: 1, goalType: 'gain' })
    expect(params.boundary).toBe('nearby(22.5,113.9,1000,0)')
    expect(params.filter).toBe('category=美食')
    expect(params.page_index).toBe(1)
  })

  test('search 归一化腾讯结果', async () => {
    axios.get.mockResolvedValue({ data: { status: 0, data: [
      { id: '1', title: '店', _distance: 800, location: { lat: 22.5, lng: 113.9 }, category: '美食:粤菜', tel: '123' }
    ] } })
    const res = await tencent.search({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '粤菜', page: 1, goalType: 'gain' })
    expect(res.count).toBe(1)
    expect(res.data[0].provider).toBe('tencent')
    expect(res.data[0].distance_text).toBe('800m')
  })
})

describe('baidu adapter', () => {
  test('buildParams 含 ret_coordtype=gcj02ll 且 page 从 0 起', () => {
    const params = baidu.buildParams({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '公园', page: 1, goalType: 'lose' })
    expect(params.ret_coordtype).toBe('gcj02ll')
    expect(params.coord_type).toBe(2)
    expect(params.scope).toBe(2)
    expect(params.page_num).toBe(0)
    expect(params.location).toBe('22.5,113.9')
  })

  test('search 提取 detail_info.price / overall_rating', async () => {
    axios.get.mockResolvedValue({ data: { status: 0, results: [
      { uid: 'u1', name: '公园', location: { lat: 22.5, lng: 113.9 }, detail_info: { tag: '公园;景点', distance: 500, overall_rating: 4.5, price: 15 } }
    ] } })
    const res = await baidu.search({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '公园', page: 1, goalType: 'lose' })
    expect(res.data[0].provider).toBe('baidu')
    expect(res.data[0].avg_price).toBe(15)
    expect(res.data[0].rating).toBe(4.5)
    expect(res.data[0].category).toBe('公园')
  })
})

describe('amap adapter', () => {
  test('buildParams 坐标反转 lng,lat + types 分类码', () => {
    const params = amap.buildParams({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '火锅', page: 1, goalType: 'gain' })
    expect(params.location).toBe('113.9,22.5')
    expect(params.types).toBe('050000')
    expect(params.extensions).toBe('all')
    const loseP = amap.buildParams({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '健身', page: 1, goalType: 'lose' })
    expect(loseP.types).toBe('080000')
  })

  test('search 反解 location 与 biz_ext', async () => {
    axios.get.mockResolvedValue({ data: { status: '1', pois: [
      { id: 'a1', name: '火锅店', location: '113.9,22.5', distance: 300, type: '050100', biz_ext: { rating: 4.8, cost: 88 }, tel: ['010-123', '010-456'] }
    ] } })
    const res = await amap.search({ lat: 22.5, lng: 113.9, radius: 1000, keyword: '火锅', page: 1, goalType: 'gain' })
    expect(res.data[0].provider).toBe('amap')
    expect(res.data[0].latitude).toBe(22.5)
    expect(res.data[0].longitude).toBe(113.9)
    expect(res.data[0].avg_price).toBe(88)
    expect(res.data[0].rating).toBe(4.8)
    expect(res.data[0].tel).toBe('010-123;010-456')
  })

  test('tel 强类型防御：string 原样 / 其他空串', () => {
    expect(amap.safeTel(['a', 'b'])).toBe('a;b')
    expect(amap.safeTel('010')).toBe('010')
    expect(amap.safeTel(123)).toBe('')
    expect(amap.safeTel(undefined)).toBe('')
  })
})

describe('intent 解析', () => {
  test('parseIntent 清洗换行/Markdown', () => {
    const r = intent.parseIntent('```json\n{"keywords":"粤菜","reason":"选它准没错的烟火气"}\n```')
    expect(r.keywords).toBe('粤菜')
    expect(r.reason).toBe('选它准没错的烟火气')
  })

  test('reason 超 20 字自动截断', () => {
    const longReason = '这是一个超过二十个字的非常长的推荐语用来测试截断逻辑是否正确生效'
    const r = intent.parseIntent('{"keywords":"x","reason":"' + longReason + '"}')
    expect(r.reason.length).toBeLessThanOrEqual(20)
  })

  test('非 JSON 抛错（parseIntent 不降级，由 resolveIntent 兜底）', () => {
    expect(() => intent.parseIntent('不是JSON')).toThrow()
  })

  test('fallbackKeyword gain 命中映射 / lose 回退原文', () => {
    expect(intent.fallbackKeyword('清淡', 'gain').keywords).toBe('粤菜|粥|茶楼|蒸汽海鲜|点心')
    expect(intent.fallbackKeyword('随便输入', 'gain').keywords).toBe('随便输入')
    expect(intent.fallbackKeyword('健身房', 'lose').keywords).toBe('健身房')
    expect(intent.fallbackKeyword('健身房', 'lose').reason).toBe('为你匹配周边运动场所')
  })
})