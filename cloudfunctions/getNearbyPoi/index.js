const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const logger = require('./common/logger')
const config = require('./config')
const { resolveIntent, fallbackKeyword } = require('./common/intent')
const adapters = {
  tencent: require('./adapters/tencent'),
  baidu: require('./adapters/baidu'),
  amap: require('./adapters/amap')
}

const FN = 'getNearbyPoi'

// 目标方向归一化：仅 'lose' 视为减重，其余兜底 gain
function normalizeGoalType(v) {
  return v === 'lose' ? 'lose' : 'gain'
}

// 经纬度合法性校验
function isValidCoordinate(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false
  if (la === 0 || lo === 0) return false
  if (la < -90 || la > 90) return false
  if (lo < -180 || lo > 180) return false
  return true
}

// 地图错误码 → 友好提示（status 为 null/undefined 视为网络/内部异常，不在此映射）
function mapStatusMessage(provider, status, raw) {
  if (status === null || status === undefined) return null
  if (provider === 'tencent') {
    if (status === 121) {
      const msg = (raw && raw.message) || ''
      if (msg.indexOf('调用量已达到上限') !== -1 || msg.indexOf('超限') !== -1 || msg.indexOf('调用量') !== -1) {
        return '腾讯地图 Key 每日调用额度已用尽，请更换 Key 或前往 lbs.qq.com 提额'
      }
      return '腾讯地图 Key 未开通 WebServiceAPI 服务或安全配置被拦截，请前往 lbs.qq.com 控制台检查 Key 设置'
    }
    if (status === 110) return '腾讯地图 Key 未开通 WebServiceAPI 服务或安全配置被拦截，请前往 lbs.qq.com 控制台检查 Key 设置'
    if (status === 120) return '腾讯地图 Key 无效'
    if (status === 301) return '腾讯地图缺少必要参数'
    return '腾讯地图检索失败（status ' + status + '）'
  }
  if (provider === 'baidu') {
    if (status === 2) return '百度地图请求参数错误'
    if (status === 101 || status === 102) return '百度地图 AK 无效或未授权'
    if (status === 401 || status === 402) return '百度地图配额超限'
    return '百度地图检索失败（status ' + status + '）'
  }
  // amap infocode
  if (status === '10003') return '高德地图 Key 无效'
  if (status === '10020' || status === '10021' || status === '10022') return '高德地图配额超限'
  return '高德地图检索失败（infocode ' + status + '）'
}

// 策略路由器：event.provider > 环境变量 MAP_PROVIDER > 默认 tencent
function pickProvider(event) {
  const p = (event && event.provider) || process.env.MAP_PROVIDER || config.DEFAULT_PROVIDER
  return adapters[p] ? p : config.DEFAULT_PROVIDER
}

// 容错降级：指定服务商「抛错」时自动回退 tencent；成功但空结果不算失败（交给外层扩距）
async function searchWithFallback(provider, params) {
  const chain = provider !== 'tencent' ? [provider, 'tencent'] : ['tencent']
  let lastErr = null
  for (const p of chain) {
    try {
      const res = await adapters[p].search(params)
      return { ...res, usedProvider: p }   // count 可能为 0，正常返回
    } catch (err) {
      lastErr = err
      logger.warn(FN, 'adapter fail, try next', { provider: p, error: err.message })
    }
  }
  // 所有适配器均抛错（网络/API 错误），携带最后错误向上抛
  lastErr.provider = provider
  lastErr.status = lastErr.status || null
  lastErr.raw = lastErr.raw || null
  throw lastErr
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { searchQuery, lat, lng, radius, page } = event
  const goalType = normalizeGoalType(event.goal_type)
  const provider = pickProvider(event)
  logger.info(FN, 'invoke', { searchQuery, lat, lng, radius, page, goalType, provider })

  if (!isValidCoordinate(lat, lng)) {
    return { code: 2, message: '定位坐标异常，请重新定位' }
  }

  // ① 意图解析：有输入走 GLM 转译，空输入用默认检索关键词
  // 竖线"|"=OR 语义；旧值空格分隔会被地图按 AND 解析（须同时命中多词），导致 lose 模式 0 条结果
  const defaultQuery = goalType === 'lose'
    ? '健身房|体育馆|运动场|公园|游泳馆'
    : '美食'
  let keyword = defaultQuery
  let resolvedTags = null
  if (searchQuery && String(searchQuery).trim()) {
    const query = String(searchQuery).trim().slice(0, config.MAX_QUERY_LEN)
    const intent = await resolveIntent(query, goalType)
    if (intent) {
      keyword = intent.keywords
      resolvedTags = {
        keywords: intent.keywords,
        orderby: intent.orderby,
        reason: intent.reason || config.FALLBACK_REASON[goalType]
      }
    } else {
      const fb = fallbackKeyword(query, goalType)
      keyword = fb.keywords
      resolvedTags = { keywords: fb.keywords, orderby: '_distance', reason: fb.reason }
    }
  }

  // ② 检索：分级扩距序列 [1000,3000,6000]（显式传 radius 则以其为起点）；
  // lose 模式放大起步半径至 5000，提高周边运动场所匹配率
  let radiusSeq
  if (goalType === 'lose') {
    const start = Math.max(Number(radius) || 0, 5000)
    radiusSeq = [start].concat(config.RADIUS_SEQ.filter(r => r > start))
  } else {
    radiusSeq = radius
      ? [Number(radius)].concat(config.RADIUS_SEQ.filter(r => r > Number(radius)))
      : config.RADIUS_SEQ
  }

  let matched = null
  let lastErr = null
  for (const r of radiusSeq) {
    try {
      const res = await searchWithFallback(provider, { lat, lng, radius: r, keyword, page, goalType })
      // 多关键字查空 → 拆首个核心词重查一次
      if ((!res.data || res.data.length === 0) && keyword.indexOf('|') !== -1) {
        const firstKw = keyword.split('|')[0].trim()
        if (firstKw) {
          try {
            const retry = await searchWithFallback(provider, { lat, lng, radius: r, keyword: firstKw, page, goalType })
            if (retry && retry.data && retry.data.length > 0) {
              matched = retry
              break
            }
          } catch (e) { /* 拆词重查失败，忽略，继续扩距 */ }
        }
      }
      if (res && res.data && res.data.length > 0) {
        matched = res
        break
      }
      // 空结果继续下一个半径
    } catch (err) {
      lastErr = err
      logger.warn(FN, 'radius search fail', { radius: r, error: err.message })
    }
  }

  // ③ 兜底结果处理
  if (!matched) {
    // 有明确错误 → code 3 + 友好映射；无错误(纯空结果) → code 0 空列表
    if (lastErr) {
      const message = mapStatusMessage(lastErr.provider, lastErr.status, lastErr.raw)
      if (message === null) {
        logger.error(FN, 'internal fail', { error: lastErr.message, provider: lastErr.provider })
        return { code: -1, message: '检索失败' }
      }
      logger.error(FN, 'api fail', { provider: lastErr.provider, status: lastErr.status, message })
      return { code: 3, message, status: lastErr.status, data: [] }
    }
    const out = { code: 0, message: 'ok', data: { data: [], count: 0, provider }, resolvedTags }
    logger.info(FN, 'empty', { duration: Date.now() - start })
    return out
  }

  // ④ 硬距离拦截：≤ 6000m
  const validPois = (matched.data || []).filter(p => !p.distance_m || p.distance_m <= config.MAX_DISTANCE)

  logger.info(FN, 'success', {
    provider: matched.usedProvider,
    rawCount: matched.data.length,
    count: validPois.length,
    hasTags: !!resolvedTags,
    duration: Date.now() - start
  })
  return {
    code: 0,
    message: 'ok',
    data: { data: validPois, count: validPois.length, provider: matched.usedProvider },
    resolvedTags
  }
}