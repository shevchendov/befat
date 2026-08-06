const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { batchDeleteByOpenid } = require('./common/deleteHelper')
const FN = 'deleteUserData'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    const [userDeleted, foodDeleted, weightDeleted, favDeleted] = await Promise.all([
      batchDeleteByOpenid(db, 'users', openid),
      batchDeleteByOpenid(db, 'food_logs', openid),
      batchDeleteByOpenid(db, 'weight_logs', openid),
      batchDeleteByOpenid(db, 'user_favorites', openid)
    ])

    const result = { code: 0, message: '所有数据已删除' }
    logger.info(FN, 'success', { duration: Date.now() - start, deleted: { users: userDeleted, food_logs: foodDeleted, weight_logs: weightDeleted, user_favorites: favDeleted } })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
