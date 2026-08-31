// getNearbyPoi/adapters/tencent.js
// 腾讯位置服务 WebServiceAPI 适配器

const axios = require('axios')
const { normalizePoi } = require('../common/schema')
const config = require('../config')

const API = 'https://apis.map.qq.com/ws/place/v1/search'

function buildParams({ lat, lng, radius, keyword, page, goalType }) {
  const params = {
    key: process.env.TENCENT_MAP_KEY || 'Z5CBZ-ASL37-ROGXQ-HGBSX-Q7CBH-OXFEO',
    boundary: `nearby(${lat},${lng},${radius},0)`,  // 坐标 lat,lng，gcj02
    keyword,
    page_size: config.PAGE_SIZE,
    page_index: page || 1,
    orderby: '_distance'
  }
  const cat = config.CATEGORY.tencent[goalType === 'lose' ? 'lose' : 'gain']
  if (cat) params.filter = 'category=' + cat
  return params
}

async function search({ lat, lng, radius, keyword, page, goalType }) {
  const resp = await axios.get(API, { params: buildParams({ lat, lng, radius, keyword, page, goalType }), timeout: 8000 })
  const data = resp.data
  if (!data || data.status !== 0) {
    const e = new Error('tencent api fail: status=' + (data && data.status))
    e.status = data && data.status
    e.raw = data
    throw e
  }
  const list = (data.data || []).map(p => normalizePoi({
    id: p.id,
    title: p.title,
    address: p.address,
    category: p.category || '',
    distance_m: p._distance || 0,
    latitude: p.location ? p.location.lat : 0,
    longitude: p.location ? p.location.lng : 0,
    tel: p.tel || '',
    rating: p.rating || 0,
    avg_price: 0,          // place/search 不含人均，需 detail，暂留空
    tags: []
  }, 'tencent')).filter(p => p.id)
  return { data: list, count: list.length }
}

module.exports = { search, buildParams }