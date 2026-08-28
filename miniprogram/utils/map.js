// utils/map.js
// 周边 POI 检索：调 getNearbyPoi 云函数代理腾讯位置服务 + 本地缓存 + 超时 + 扩距降级
// 说明：Key 存放于云函数环境变量 TENCENT_MAP_KEY，前端不硬编码，安全性更高且无需配置第三方合法域名。

const CACHE_KEY = 'poi_nearby_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟
const TIMEOUT = 8000 // 8 秒超时

function roundCoord(v) {
  return Math.round(Number(v) * 1000) / 1000
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

function parseData(data) {
  const raw = data.data || []
  return {
    list: raw.map(p => {
      const dist = Math.round(p._distance || 0)
      return {
        id: p.id,
        title: p.title,
        address: p.address,
        category: p.category,
        distance_m: dist,
        distance_text: dist < 1000 ? dist + 'm' : (dist / 1000).toFixed(1) + 'km',
        latitude: p.location ? p.location.lat : 0,
        longitude: p.location ? p.location.lng : 0,
        tel: p.tel || '',
        rating: p.rating || 0
      }
    }),
    total: data.count || 0
  }
}

async function searchNearbyPoi({ lat, lng, page, searchQuery, goalType }) {
  page = page || 1
  const q = searchQuery ? String(searchQuery).trim() : ''
  const gt = goalType === 'lose' ? 'lose' : 'gain'
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)

  // 首页命中缓存（同百米级坐标 + 同 query + 同 goalType + 5 分钟 TTL）
  if (page === 1) {
    const cached = getCache()
    if (cached && cached.lat === rLat && cached.lng === rLng && (cached.query || '') === q && (cached.goalType || 'gain') === gt && Date.now() - cached.ts < CACHE_TTL) {
      return { list: cached.list, total: cached.total, from_cache: true, resolvedTags: cached.resolvedTags }
    }
  }

  // 1km 检索，空则自动扩 3km 重试一次
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

module.exports = { searchNearbyPoi, searchPoi, parseData, roundCoord, withTimeout }