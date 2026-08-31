// utils/map.js
// 周边 POI 检索：调 getNearbyPoi 云函数（服务商适配层代理地图检索）+ 本地缓存 + 超时 + 扩距降级 + 打字机
// 说明：Key/服务商选择均在云函数侧（环境变量），前端不硬编码，安全且无需配置第三方合法域名。

const CACHE_KEY = 'poi_nearby_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟
const TIMEOUT = 8000 // 8 秒超时

function roundCoord(v) {
  return Math.round(Number(v) * 1000) / 1000
}

// 缓存 key：坐标(百米级) + query + goalType + provider
function cacheKey(lat, lng, query, goalType, provider) {
  return `${roundCoord(lat)}_${roundCoord(lng)}_${query}_${goalType}_${provider || 'tencent'}`
}

function getCache() {
  try {
    return wx.getStorageSync(CACHE_KEY) || null
  } catch (e) {
    return null
  }
}

function setCache(data) {
  try {
    wx.setStorageSync(CACHE_KEY, data)
  } catch (e) {}
}

function searchPoi({ lat, lng, radius, page, searchQuery, goalType }) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'getNearbyPoi',
      data: { lat, lng, radius, page, searchQuery, goal_type: goalType },
      success: res => {
        const r = res && res.result
        if (r && r.code === 0) {
          resolve({ data: r.data, resolvedTags: r.resolvedTags })
        } else {
          reject(new Error('MAP_API_' + (r && r.code)))
        }
      },
      fail: err => reject(err)
    })
  })
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('MAP_TIMEOUT')), ms))
  ])
}

// 解析统一 POI Schema（云函数已归一化，此处轻量透传 + 距文本兜底）
function parseData(data) {
  const raw = data.data || []
  return {
    list: raw.map(p => ({
      id: p.id,
      title: p.title,
      address: p.address,
      category: p.category,
      distance_m: p.distance_m || 0,
      distance_text: p.distance_text || (p.distance_m < 1000 ? p.distance_m + 'm' : (p.distance_m / 1000).toFixed(1) + 'km'),
      latitude: p.latitude || 0,
      longitude: p.longitude || 0,
      tel: p.tel || '',
      rating: p.rating || 0,
      avg_price: p.avg_price || 0,
      tags: p.tags || [],
      provider: p.provider || ''
    })),
    total: data.count || 0
  }
}

// 轻量伪打字机：逐字渲染，提升推荐交互仪式感
function typewriterEffect(ctx, text, onUpdate, onDone, speed = 40) {
  if (!text) { onDone && onDone(); return }
  let i = 0
  if (ctx._typeTimer) clearInterval(ctx._typeTimer)
  onUpdate('')
  ctx._typeTimer = setInterval(() => {
    i++
    onUpdate(text.slice(0, i))
    if (i >= text.length) {
      clearInterval(ctx._typeTimer)
      ctx._typeTimer = null
      onDone && onDone()
    }
  }, speed)
}

async function searchNearbyPoi({ lat, lng, page, searchQuery, goalType }) {
  page = page || 1
  const q = searchQuery ? String(searchQuery).trim() : ''
  const gt = goalType === 'lose' ? 'lose' : 'gain'
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)

  // 首页命中缓存（坐标 + query + goalType + provider + 5 分钟 TTL）
  if (page === 1) {
    const cached = getCache()
    if (cached && cached.lat === rLat && cached.lng === rLng && (cached.query || '') === q && (cached.goalType || 'gain') === gt && Date.now() - cached.ts < CACHE_TTL) {
      return { list: cached.list, total: cached.total, from_cache: true, resolvedTags: cached.resolvedTags }
    }
  }

  // 1km 检索，空则自动扩 3km 重试一次（云函数侧还有 6km 兜底）
  let raw
  raw = await withTimeout(searchPoi({ lat, lng, radius: 1000, page, searchQuery: q, goalType: gt }), TIMEOUT)
  if (!raw.data || !raw.data.data || raw.data.data.length === 0) {
    raw = await withTimeout(searchPoi({ lat, lng, radius: 3000, page, searchQuery: q, goalType: gt }), TIMEOUT)
  }

  const parsed = parseData(raw.data)
  if (page === 1) {
    setCache({ ts: Date.now(), lat: rLat, lng: rLng, query: q, goalType: gt, list: parsed.list, total: parsed.total, resolvedTags: raw.resolvedTags })
  }
  return { list: parsed.list, total: parsed.total, from_cache: false, resolvedTags: raw.resolvedTags }
}

module.exports = { searchNearbyPoi, searchPoi, parseData, roundCoord, withTimeout, typewriterEffect, cacheKey }