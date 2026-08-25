const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'getNearbyPoi'

const MAP_API = 'https://apis.map.qq.com/ws/place/v1/search'
const INTENT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEFAULT_KEY = 'Z5CBZ-ASL37-ROGXQ-HGBSX-Q7CBH-OXFEO'
const DEFAULT_KEYWORD = '粤菜 家常菜 特色小吃 粉面 快餐 烧烤'
const INTENT_TIMEOUT = 1500 // 意图解析 1.5 秒硬超时
const INTENT_CACHE_TTL = 5 * 60 * 1000 // 转译缓存 5 分钟
const INTENT_CACHE_MAX = 200
const FALLBACK_REASON = '为你匹配偏好美食'
const DEFAULT_RADIUS = 3000 // 检索半径默认 3000m，抵消模糊定位偏移
const MAX_DISTANCE = 5000 // 硬距离拦截上限：5 公里，超出即丢弃

// 抽象偏好离线兜底映射表（意图解析降级/预处理时优先匹配）
const ABSTRACT_MAP = {
  '清淡': '粤菜|粥|茶楼|蒸汽海鲜|点心',
  '清淡粤菜': '粤菜|茶楼|点心',
  '想吃清淡点的': '粤菜|粥粉面|茶楼|蒸菜',
  '辣': '川菜|湘菜|火锅|烤鱼',
  '辣的': '川菜|湘菜|火锅',
  '早茶': '茶楼|点心|粤菜',
  '聚餐': '粤菜|酒楼|火锅|海鲜大排档',
  '便当': '快餐|简餐|便当'
}

// 意图解析内存缓存：key=query 原文，value={ts, data}
const intentCache = new Map()

const INTENT_SYSTEM = '你是一个地图 POI 品类转译器。必须把用户的抽象口味/场景（如"清淡"、"聚餐"）转译为腾讯地图能精准查到的【具体餐饮品类名词】。严禁输出形容词或抽象非实体词（如"清淡美食"、"健康餐"、"适合聚餐的店"）。只输出严格 JSON，不要任何解释文字或 Markdown。'

function buildIntentPrompt(query) {
  return `用户想吃的偏好："${query}"

请转译为腾讯地图 POI 搜索参数，只返回 JSON：
{"keywords":"关键词用竖线分隔","orderby":"_distance","reason":"简要说明"}

示例：
输入"清淡" → 输出 {"keywords":"粤菜|粥粉面|茶楼","orderby":"_distance","reason":"已为你匹配清淡口味品类"}
输入"适合多人" → 输出 {"keywords":"粤菜|酒楼|火锅","orderby":"_distance","reason":"已为你匹配聚餐场地"}

约束：keywords 必须为地图高频实体品类名词，用"|"分隔多个关键词；严禁输出形容词或抽象词；只返回 JSON 本体。`
}

function stripCodeFence(content) {
  let clean = content.trim()
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return clean.trim()
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('INTENT_TIMEOUT')), ms))
  ])
}

function cacheGet(key) {
  const entry = intentCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts >= INTENT_CACHE_TTL) {
    intentCache.delete(key)
    return null
  }
  return entry.data
}

function cacheSet(key, data) {
  if (intentCache.size >= INTENT_CACHE_MAX) {
    const first = intentCache.keys().next().value
    intentCache.delete(first)
  }
  intentCache.set(key, { ts: Date.now(), data })
}

function parseIntent(content) {
  const parsed = JSON.parse(stripCodeFence(content))
  if (!parsed || typeof parsed.keywords !== 'string' || !parsed.keywords.trim()) return null
  return {
    keywords: parsed.keywords.trim(),
    orderby: parsed.orderby || '_distance',
    reason: parsed.reason || FALLBACK_REASON
  }
}

async function resolveIntent(query) {
  const cached = cacheGet(query)
  if (cached) return cached

  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) return null

  try {
    const resp = await withTimeout(axios.post(INTENT_API, {
      model: process.env.MENU_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: INTENT_SYSTEM },
        { role: 'user', content: buildIntentPrompt(query) }
      ],
      temperature: 0.1,
      max_tokens: 150
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      timeout: INTENT_TIMEOUT
    }), INTENT_TIMEOUT)

    const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
    if (!content) return null

    const result = parseIntent(content)
    if (result) cacheSet(query, result)
    return result
  } catch (err) {
    logger.warn(FN, 'intent resolve fail, fallback to abstract map', { error: err.message })
    return null
  }
}

// 意图解析失败/超时时的离线兜底：优先匹配抽象映射表，无匹配才回退原文
function fallbackKeyword(query) {
  if (ABSTRACT_MAP[query]) {
    return { keywords: ABSTRACT_MAP[query], reason: '智能选餐匹配偏好品类' }
  }
  return { keywords: query, reason: FALLBACK_REASON }
}

function mapStatusMessage(data) {
  const status = data && data.status
  const msg = (data && data.message) || ''

  if (status === 121) {
    if (msg.indexOf('调用量已达到上限') !== -1 || msg.indexOf('超限') !== -1 || msg.indexOf('调用量') !== -1) {
      return '腾讯地图 Key 每日调用额度已用尽，请更换 Key 或前往 lbs.qq.com 提额'
    }
    return '腾讯地图 Key 未开通 WebServiceAPI 服务或安全配置被拦截，请前往 lbs.qq.com 控制台检查 Key 设置'
  }
  if (status === 110) {
    return '腾讯地图 Key 未开通 WebServiceAPI 服务或安全配置被拦截，请前往 lbs.qq.com 控制台检查 Key 设置'
  }
  if (status === 120) {
    return '腾讯地图 Key 无效'
  }
  if (status === 301) {
    return '腾讯地图缺少必要参数'
  }
  return '腾讯地图检索失败（status ' + status + '）'
}

// 经纬度合法性校验：非 0、非空、非 NaN，且落在合理范围内（中国大致范围）
function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false
  if (la === 0 || lo === 0) return false
  if (la < -90 || la > 90) return false
  if (lo < -180 || lo > 180) return false
  return true
}

// 单次地图检索；成功返回 data 对象，失败返回 null
async function searchMap(apiKey, lat, lng, radius, keyword, page) {
  const resp = await axios.get(MAP_API, {
    params: {
      key: apiKey,
      boundary: `nearby(${lat},${lng},${radius},0)`,
      keyword,
      filter: 'category=美食',
      page_size: 6,
      page_index: page || 1,
      orderby: '_distance'
    },
    timeout: 8000
  })
  return resp.data
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { searchQuery, lat, lng, radius, page } = event
  logger.info(FN, 'invoke', { searchQuery, lat, lng, radius, page })

  const apiKey = process.env.TENCENT_MAP_KEY || DEFAULT_KEY
  const useRadius = radius || DEFAULT_RADIUS

  if (!isValidCoordinate(lat, lng)) {
    const result = { code: 2, message: '定位坐标异常，请重新定位' }
    logger.info(FN, 'return', { code: 2, reason: 'invalid coordinate', duration: Date.now() - start })
    return result
  }

  // ① 意图解析（带缓存 + 超时降级）；空输入跳过转译，直接加载附近常规美食
  let keyword = '美食'
  let resolvedTags = null
  if (searchQuery && searchQuery.trim()) {
    const query = String(searchQuery).trim().slice(0, 50)
    const intent = await resolveIntent(query)
    if (intent) {
      keyword = intent.keywords
      resolvedTags = intent
    } else {
      // 降级：意图解析失败/超时，优先离线映射表，无匹配才用原文
      const fallback = fallbackKeyword(query)
      keyword = fallback.keywords
      resolvedTags = {
        keywords: fallback.keywords,
        orderby: '_distance',
        reason: fallback.reason
      }
    }
  }

  try {
    // ② 主检索
    let data = await searchMap(apiKey, lat, lng, useRadius, keyword, page)

    // ③ 二次兜底：转译出的多关键字查空时，拆分首个核心词重查
    if (data && data.status === 0 && (!data.data || data.data.length === 0) && keyword.indexOf('|') !== -1) {
      const firstKw = keyword.split('|')[0].trim()
      if (firstKw) {
        logger.info(FN, 'empty result, retry with first keyword', { from: keyword, to: firstKw })
        const retry = await searchMap(apiKey, lat, lng, useRadius, firstKw, page)
        if (retry && retry.status === 0 && retry.data && retry.data.length > 0) {
          data = retry
        }
      }
    }

    if (!data || data.status !== 0) {
      const status = data && data.status
      const message = mapStatusMessage(data)
      console.log(FN + ' api error response:', JSON.stringify(data))
      logger.warn(FN, 'api status fail', { status, message, duration: Date.now() - start })
      const result = { code: 3, message, status, data: [] }
      return result
    }

    // ④ 硬距离拦截：丢弃超过 5 公里的异地数据；缺少 _distance 时放行，避免误杀
    const rawList = data.data || []
    const validPois = rawList.filter(item => !item._distance || item._distance <= MAX_DISTANCE)

    const result = { code: 0, message: 'ok', data: { data: validPois, count: validPois.length }, resolvedTags }
    logger.info(FN, 'success', { rawCount: rawList.length, count: validPois.length, hasTags: !!resolvedTags, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '检索失败' }
  }
}