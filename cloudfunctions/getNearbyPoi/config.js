// getNearbyPoi/config.js
// 服务商配置 + 分级扩距序列 + 分类映射 + 降级常量

module.exports = {
  // 默认地图服务商：非法/缺省时回退到 tencent
  DEFAULT_PROVIDER: 'tencent',

  // 分级扩距检索序列（米）：由小到大逐级尝试，直到有结果
  RADIUS_SEQ: [1000, 3000, 6000],
  // 服务端硬距离拦截上限（米），放宽至 6 公里
  MAX_DISTANCE: 6000,

  // 意图解析
  INTENT_TIMEOUT: 1500,           // 1.5s 硬超时
  INTENT_CACHE_TTL: 5 * 60 * 1000, // 5 分钟缓存
  INTENT_CACHE_MAX: 200,           // 缓存上限
  MAX_QUERY_LEN: 50,

  PAGE_SIZE: 6,

  // 各服务商按目标模式的分类过滤（null 表示不设类目过滤，靠关键词）
  CATEGORY: {
    tencent: { gain: '美食', lose: '体育休闲' },
    baidu:   { gain: null,   lose: null },
    amap:    { gain: '050000', lose: '080000' }  // 高德分类码：050000 餐饮 / 080000 体育休闲
  },

  // 无输入时的默认检索词（竖线"|"=OR，避免空格被地图按 AND 解析导致 0 结果）
  DEFAULT_KEYWORD: {
    gain: '美食',
    lose: '健身房|体育馆|运动场|公园|游泳馆'
  },

  // 各模式下意图解析回退的推荐语
  FALLBACK_REASON: {
    gain: '为你匹配偏好美食',
    lose: '为你匹配周边运动场所'
  },

  // 抽象偏好离线兜底映射表（意图解析降级时优先匹配，仅增益方向使用）
  ABSTRACT_MAP: {
    '清淡': '粤菜|粥|茶楼|蒸汽海鲜|点心',
    '清淡粤菜': '粤菜|茶楼|点心',
    '想吃清淡点的': '粤菜|粥粉面|茶楼|蒸菜',
    '辣': '川菜|湘菜|火锅|烤鱼',
    '辣的': '川菜|湘菜|火锅',
    '早茶': '茶楼|点心|粤菜',
    '聚餐': '粤菜|酒楼|火锅|海鲜大排档',
    '便当': '快餐|简餐|便当'
  }
}