// getNearbyPoi/adapters/amap.js
// 高德地图周边搜索 API v3 适配器
// 关键：extensions='all' 拿 biz_ext；坐标传 lng,lat（与腾讯/百度相反）；分类码映射

const axios = require('axios')
const { normalizePoi } = require('../common/schema')
const config = require('../config')

const API = 'https://restapi.amap.com/v3/place/around'

// 高德分类码 → 中文类目（粗粒度映射，深入可用官方 POI 分类表）
const CATEGORY_CODE = {
  '05': '餐饮',
  '08': '体育休闲'
}

function categoryOf(code) {
  const c = String(code || '')
  if (c.startsWith('05')) return '餐饮'
  if (c.startsWith('08')) return '体育休闲'
  return c
}

function buildParams({ lat, lng, radius, keyword, page, goalType }) {
  const key = process.env.AMAP_KEY
  if (!key) throw new Error('AMAP_KEY not configured')
  const params = {
    key,
    location: `${lng},${lat}`,            // 高德坐标顺序 lng,lat
    keywords: keyword,
    radius,
    page: page || 1,
    offset: config.PAGE_SIZE,
    extensions: 'all',                     // 返回详细信息（biz_ext 等）
    sortrule: 'distance'
  }
  const cat = config.CATEGORY.amap[goalType === 'lose' ? 'lose' : 'gain']
  if (cat) params.types = cat              // 分类码过滤：gain 050000 / lose 080000
  return params
}

// tel 字段强类型防御：Array → ; 拼接；string → 原样；其它 → ''
function safeTel(tel) {
  if (Array.isArray(tel)) return tel.join(';')
  if (typeof tel === 'string') return tel
  return ''
}

async function search({ lat, lng, radius, keyword, page, goalType }) {
  const resp = await axios.get(API, { params: buildParams({ lat, lng, radius, keyword, page, goalType }), timeout: 8000 })
  const data = resp.data
  if (!data || data.status !== '1') {
    const e = new Error('amap api fail: infocode=' + (data && data.infocode) + ' info=' + (data && data.info))
    e.status = data && data.infocode
    e.raw = data
    throw e
  }
  const list = (data.pois || []).map(p => {
    // 高德返回 location 为 "lng,lat"，需反解
    const parts = String(p.location || '0,0').split(',')
    const lng = Number(parts[0]) || 0
    const lat = Number(parts[1]) || 0
    const biz = p.biz_ext || {}
    return normalizePoi({
      id: p.id,
      title: p.name,
      address: p.address || '',
      category: categoryOf(p.type),
      distance_m: Number(p.distance) || 0,
      latitude: lat,
      longitude: lng,
      tel: safeTel(p.tel),
      rating: biz.rating || 0,
      avg_price: biz.cost || 0,            // biz_ext.cost 即人均
      tags: p.tag ? String(p.tag).split(';').filter(Boolean) : []
    }, 'amap')
  }).filter(p => p.id)
  return { data: list, count: list.length }
}

module.exports = { search, buildParams, categoryOf, safeTel }