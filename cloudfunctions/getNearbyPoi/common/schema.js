// getNearbyPoi/common/schema.js
// 统一 POI 数据 Schema：将各适配器已抽平的中间字段，规整为标准 UnifiedPoi 输出

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toStr(v) {
  return v === null || v === undefined ? '' : String(v)
}

function toTags(v) {
  if (!Array.isArray(v)) return []
  return v.filter(x => x !== null && x !== undefined && String(x).trim() !== '').map(x => String(x).trim()).slice(0, 3)
}

// 统一距离文本：<1000m 用 m，否则 km 保留 1 位小数
function fmtDistance(m) {
  if (m < 1000) return m + 'm'
  return (m / 1000).toFixed(1) + 'km'
}

/**
 * 将适配器抽平的中间字段，归一化为标准 UnifiedPoi
 * @param {Object} p  适配器预抽平的字段
 * @param {string} provider tencent|baidu|amap
 * @returns {Object} UnifiedPoi
 */
function normalizePoi(p, provider) {
  const distanceM = Math.round(toNum(p.distance_m))
  return {
    id: toStr(p.id),
    title: toStr(p.title),
    address: toStr(p.address),
    category: toStr(p.category),
    distance_m: distanceM,
    distance_text: fmtDistance(distanceM),
    latitude: toNum(p.latitude),
    longitude: toNum(p.longitude),
    tel: toStr(p.tel),
    rating: Math.round(toNum(p.rating) * 10) / 10,   // 统一 1 位小数
    avg_price: Math.round(toNum(p.avg_price)),        // 人均取整
    tags: toTags(p.tags),
    provider
  }
}

module.exports = { normalizePoi, fmtDistance, toNum, toStr, toTags }