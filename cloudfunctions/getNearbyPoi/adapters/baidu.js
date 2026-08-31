// getNearbyPoi/adapters/baidu.js
// 百度地图地点检索 Place API v2 适配器
// 关键：ret_coordtype='gcj02ll' 保证返回 GCJ02 坐标，避免与腾讯/前端坐标偏移

const axios = require('axios')
const { normalizePoi } = require('../common/schema')
const config = require('../config')

const API = 'https://api.map.baidu.com/place/v2/search'

function buildParams({ lat, lng, radius, keyword, page, goalType }) {
  const ak = process.env.BAIDU_MAP_AK
  if (!ak) throw new Error('BAIDU_MAP_AK not configured')
  return {
    ak,
    query: keyword,
    location: `${lat},${lng}`,          // 百度坐标顺序 lat,lng
    radius,
    scope: 2,                          // 2 = 富文本，返回详细信息
    page_size: config.PAGE_SIZE,
    page_num: (page || 1) - 1,         // 百度分页从 0 起
    coord_type: 2,                      // 入参为 GCJ02
    ret_coordtype: 'gcj02ll',           // 返回 GCJ02，防止导航偏差
    output: 'json'
  }
}

async function search({ lat, lng, radius, keyword, page, goalType }) {
  const resp = await axios.get(API, { params: buildParams({ lat, lng, radius, keyword, page, goalType }), timeout: 8000 })
  const data = resp.data
  if (!data || data.status !== 0) {
    const e = new Error('baidu api fail: status=' + (data && data.status) + ' msg=' + (data && data.message))
    e.status = data && data.status
    e.raw = data
    throw e
  }
  const list = (data.results || []).map(p => {
    const detail = p.detail_info || {}
    return normalizePoi({
      id: p.uid,
      title: p.name,
      address: p.address || '',
      category: detail.tag ? String(detail.tag).split(';')[0] : '',
      distance_m: detail.distance || 0,
      latitude: p.location ? p.location.lat : 0,
      longitude: p.location ? p.location.lng : 0,
      tel: p.telephone || detail.telephone || '',
      rating: detail.overall_rating || 0,
      avg_price: detail.price || 0,        // detail_info.price 即人均
      tags: detail.tag ? String(detail.tag).split(';').filter(Boolean) : []
    }, 'baidu')
  }).filter(p => p.id)
  return { data: list, count: list.length }
}

module.exports = { search, buildParams }