const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'getNearbyPoi'

const API = 'https://apis.map.qq.com/ws/place/v1/search'
// 生产环境建议用云函数环境变量 TENCENT_MAP_KEY 覆盖，此处作为缺省兜底
const DEFAULT_KEY = 'Z5CBZ-ASL37-ROGXQ-HGBSX-Q7CBH-OXFEO'

function mapErrorMessage(data) {
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

exports.main = async (event, context) => {
  const start = Date.now()
  const { lat, lng, radius, page, keyword } = event
  logger.info(FN, 'invoke', { lat, lng, radius, page, keyword })

  const apiKey = process.env.TENCENT_MAP_KEY || DEFAULT_KEY

  if (lat == null || lng == null) {
    const result = { code: 2, message: '缺少经纬度' }
    logger.info(FN, 'return', { code: 2, duration: Date.now() - start })
    return result
  }

  try {
    // 参数全部通过 axios params 配置，由 axios 负责 URL 编码，严禁手写拼接 nearby 坐标
    // 以避免括号/逗号转义异常导致的 121/301 报错
    const resp = await axios.get(API, {
      params: {
        key: apiKey,
        boundary: `nearby(${lat},${lng},${radius || 1000})`,
        keyword: keyword || '美食',
        page_size: 6,
        page_index: page || 1
      },
      timeout: 8000
    })
    const data = resp.data

    if (!data || data.status !== 0) {
      const status = data && data.status
      const message = mapErrorMessage(data)
      console.log(FN + ' api error response:', JSON.stringify(data))
      logger.warn(FN, 'api status fail', { status, message, duration: Date.now() - start })
      const result = { code: 3, message, status, data: [] }
      return result
    }

    const result = { code: 0, message: 'ok', data: { data: data.data || [], count: data.count || 0 } }
    logger.info(FN, 'success', { count: data.count || 0, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '检索失败' }
  }
}