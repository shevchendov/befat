// utils/map.js
// 腾讯位置服务 POI 检索：缓存 + 超时 + 扩距降级
// 说明：直接用 wx.request 调腾讯位置服务 WebService API（等价于官方 qqmap-wx-jssdk 的 search），
// 更轻量且易于单测；如需引入官方 SDK，可放置 miniprogram/libs/qqmap-wx-jssdk.js 后改写 searchPoi 内部实现。

const TENCENT_MAP_KEY = 'YOUR_TENCENT_LBS_KEY' // TODO: 替换为你的腾讯位置服务 Key
const CACHE_KEY = 'poi_nearby_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟
const TIMEOUT = 8000 // 8 秒超时
const KEYWORD = '粤菜 家常菜 特色小吃 粉面 快餐 烧烤'

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

function searchPoi({ lat, lng, radius, page }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://apis.map.qq.com/ws/place/v1/search',
      data: {
        keyword: KEYWORD,
        boundary: `nearby(${lat},${lng},${radius})`,
        page_size: 10,
        page_index: page || 1,
        orderby: '_distance',
        key: TENCENT_MAP_KEY
      },
      success: res => {
        if (res.data && res.data.status === 0) {
          resolve(res.data)
        } else {
          reject(new Error('MAP_API_' + (res.data && res.data.status)))
        }
      },
      fail: reject
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

async function searchNearbyPoi({ lat, lng, page }) {
  page = page || 1
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)

  // 首页命中缓存（同百米级坐标 + 5 分钟 TTL）
  if (page === 1) {
    const cached = getCache()
    if (cached && cached.lat === rLat && cached.lng === rLng && Date.now() - cached.ts < CACHE_TTL) {
      return { list: cached.list, total: cached.total, from_cache: true }
    }
  }

  // 1km 检索，空则自动扩 3km 重试一次
  let raw
  raw = await withTimeout(searchPoi({ lat, lng, radius: 1000, page }), TIMEOUT)
  if (!raw.data || raw.data.length === 0) {
    raw = await withTimeout(searchPoi({ lat, lng, radius: 3000, page }), TIMEOUT)
  }

  const parsed = parseData(raw)
  if (page === 1) {
    setCache({ ts: Date.now(), lat: rLat, lng: rLng, list: parsed.list, total: parsed.total })
  }
  return { list: parsed.list, total: parsed.total, from_cache: false }
}

module.exports = { searchNearbyPoi, searchPoi, parseData, roundCoord, withTimeout }