const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'exportUserData'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    const [userRes, foodRes, weightRes] = await Promise.all([
      db.collection('users').where({ _openid: openid }).get(),
      db.collection('food_logs').where({ _openid: openid }).orderBy('date', 'asc').get(),
      db.collection('weight_logs').where({ _openid: openid }).orderBy('date', 'asc').get()
    ])

    const user = userRes.data[0] || null
    const userInfo = user ? (({ _id, _openid, ...rest }) => rest)(user) : null

    const result = {
      code: 0,
      message: 'ok',
      data: {
        export_time: new Date().toISOString(),
        user_info: userInfo,
        food_logs: foodRes.data.map(({ _id, _openid, ...rest }) => rest),
        weight_logs: weightRes.data.map(({ _id, _openid, ...rest }) => rest)
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, hasUser: !!user, foodCount: foodRes.data.length, weightCount: weightRes.data.length })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
