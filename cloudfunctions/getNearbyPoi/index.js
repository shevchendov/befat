const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'getNearbyPoi'

const MAP_API = 'https://apis.map.qq.com/ws/place/v1/search'
const INTENT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEFAULT_KEY = 'Z5CBZ-ASL37-ROGXQ-HGBSX-Q7CBH-OXFEO'
const INTENT_TIMEOUT = 1500 // 意图解析 1.5 秒硬超时
const INTENT_CACHE_TTL = 5 * 60 * 1000 // 转译缓存 5 分钟
const INTENT_CACHE_MAX = 200
const DEFAULT_RADIUS = 3000 // 检索半径默认 3000m，抵消模糊定位偏移
const MAX_DISTANCE = 5000 // 硬距离拦截上限：5 公里，超出即丢弃

// ===== 双目标模式分流 =====
// gain：餐饮/美食检索（保留原 filter 死锁 + 默认关键词 + 餐饮语义转译）
// lose：运动耗能场所检索（去除 category=美食 过滤，只靠关键词，杜绝餐饮结果）
const DEFAULT_KEYWORD_GAIN = '美食'
const DEFAULT_KEYWORD_LOSE = '公园 健身房 绿道 游泳馆'
const FILTER_GAIN = 'category=美食'
const FILTER_LOSE = null
const FALLBACK_REASON_GAIN = '为你匹配偏好美食'
const FALLBACK_REASON_LOSE = '为你匹配周边运动场所'

function normalizeGoalType(v) {
  return v === 'lose' ? 'lose' : 'gain'
}

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

const INTENT_SYSTEM_LOSE = '你是一个地图 POI 运动场所转译器。必须把用户的运动/休闲需求（如"想跑步"、"想游泳"、"找个公园"）转译为腾讯地图能精准查到的【具体运动或休闲场所名词】。严禁输出形容词、抽象词，严禁输出任何餐饮/美食类关键词（如小吃、餐厅、饭店、快餐、美食）。只输出严格 JSON，不要任何解释文字或 Markdown。'

function buildIntentPrompt(query) {
  return `用户想吃的偏好："${query}"

请转译为腾讯地图 POI 搜索参数，只返回 JSON：
{"keywords":"关键词用竖线分隔","orderby":"_distance","reason":"简要说明"}

示例：
输入"清淡" → 输出 {"keywords":"粤菜|粥粉面|茶楼","orderby":"_distance","reason":"已为你匹配清淡口味品类"}
输入"适合多人" → 输出 {"keywords":"粤菜|酒楼|火锅","orderby":"_distance","reason":"已为你匹配聚餐场地"}

约束：keywords 必须为地图高频实体品类名词，用"|"分隔多个关键词；严禁输出形容词或抽象词；只返回 JSON 本体。`
}

function buildIntentPromptLose(query) {
  return `用户想去运动/休闲的场所："${query}"

请转译为腾讯地图 POI 搜索参数，只返回 JSON：
{"keywords":"关键词用竖线分隔","orderby":"_distance","reason":"简要说明"}

示例：
输入"想跑步" → 输出 {"keywords":"公园|绿道|体育场","orderby":"_distance","reason":"已为你匹配跑步锻炼场所"}
输入"去健身" → 输出 {"keywords":"健身房|游泳馆|体育馆","orderby":"_distance","reason":"已为你匹配运动场所"}

约束：
1. keywords 必须为地图高频运动/休闲场所名词，用"|"分隔多个关键词
2. 严禁输出餐饮/美食类关键词（如小吃、餐厅、饭店、快餐、美食、茶楼）
3. 严禁输出形容词或抽象词；只返回 JSON 本体。`
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
    reason: parsed.reason || ''
  }
}

async function resolveIntent(query, goalType) {
  const isLose = goalType === 'lose'
  const cacheKey = (isLose ? 'lose:' : 'gain:') + query
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) return null

  try {
    const resp = await withTimeout(axios.post(INTENT_API, {
      model: process.env.MENU_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: isLose ? INTENT_SYSTEM_LOSE : INTENT_SYSTEM },
        { role: 'user', content: isLose ? buildIntentPromptLose(query) : buildIntentPrompt(query) }
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
    if (result) cacheSet(cacheKey, result)
    return result
  } catch (err) {
    logger.warn(FN, 'intent resolve fail, fallback to abstract map', { error: err.message })
    return null
  }
}

// 意图解析失败/超时时的离线兜底：优先匹配抽象映射表，无匹配才回退原文
// lose 模式不走餐饮映射表，直接回退原文关键词 + 运动提示语
function fallbackKeyword(query, goalType) {
  const isLose = goalType === 'lose'
  if (isLose) {
    return { keywords: query, reason: FALLBACK_REASON_LOSE }
  }
  if (ABSTRACT_MAP[query]) {
    return { keywords: ABSTRACT_MAP[query], reason: '智能选餐匹配偏好品类' }
  }
  return { keywords: query, reason: FALLBACK_REASON_GAIN }
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
// goalType='lose' 时不追加 category 过滤（只靠关键词），保证运动场所不被"美食"死锁
async function searchMap(apiKey, lat, lng, radius, keyword, page, goalType) {
  const params = {
    key: apiKey,
    boundary: `nearby(${lat},${lng},${radius},0)`,
    keyword,
    page_size: 6,
    page_index: page || 1,
    orderby: '_distance'
  }
  if (goalType !== 'lose') {
    params.filter = FILTER_GAIN
  }
  const resp = await axios.get(MAP_API, {
    params,
    timeout: 8000
  })
  return resp.data
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { searchQuery, lat, lng, radius, page, goal_type } = event
  const goalType = normalizeGoalType(goal_type)
  logger.info(FN, 'invoke', { searchQuery, lat, lng, radius, page, goalType })

  const apiKey = process.env.TENCENT_MAP_KEY || DEFAULT_KEY
  const useRadius = radius || DEFAULT_RADIUS
  const isLose = goalType === 'lose'

  if (!isValidCoordinate(lat, lng)) {
    const result = { code: 2, message: '定位坐标异常，请重新定位' }
    logger.info(FN, 'return', { code: 2, reason: 'invalid coordinate', duration: Date.now() - start })
    return result
  }

  // ① 意图解析（带缓存 + 超时降级）；空输入跳过转译，直接加载附近默认检索
  let keyword = isLose ? DEFAULT_KEYWORD_LOSE : DEFAULT_KEYWORD_GAIN
  let resolvedTags = null
  if (searchQuery && searchQuery.trim()) {
    const query = String(searchQuery).trim().slice(0, 50)
    const intent = await resolveIntent(query, goalType)
    if (intent && intent.reason) {
      keyword = intent.keywords
      resolvedTags = intent
    } else if (intent) {
      // 转译成功但无 reason，补默认提示语
      keyword = intent.keywords
      resolvedTags = { ...intent, reason: isLose ? FALLBACK_REASON_LOSE : FALLBACK_REASON_GAIN }
    } else {
      // 降级：意图解析失败/超时，优先离线映射表，无匹配才用原文
      const fallback = fallbackKeyword(query, goalType)
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
    let data = await searchMap(apiKey, lat, lng, useRadius, keyword, page, goalType)

    // ③ 二次兜底：转译出的多关键字查空时，拆分首个核心词重查
    if (data && data.status === 0 && (!data.data || data.data.length === 0) && keyword.indexOf('|') !== -1) {
      const firstKw = keyword.split('|')[0].trim()
      if (firstKw) {
        logger.info(FN, 'empty result, retry with first keyword', { from: keyword, to: firstKw })
        const retry = await searchMap(apiKey, lat, lng, useRadius, firstKw, page, goalType)
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