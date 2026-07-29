const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'deleteUserData'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    const batchDelete = async (collection) => {
      const limit = 100
      let hasMore = true
      let total = 0
      while (hasMore) {
        const res = await db.collection(collection).where({ _openid: openid }).limit(limit).get()
        if (res.data.length === 0) {
          hasMore = false
          break
        }
        total += res.data.length
        const tasks = res.data.map(doc => db.collection(collection).doc(doc._id).remove())
        await Promise.all(tasks)
        if (res.data.length < limit) hasMore = false
      }
      return total
    }

    const [userDeleted, foodDeleted, weightDeleted] = await Promise.all([
      batchDelete('users'),
      batchDelete('food_logs'),
      batchDelete('weight_logs')
    ])

    const result = { code: 0, message: '所有数据已删除' }
    logger.info(FN, 'success', { duration: Date.now() - start, deleted: { users: userDeleted, food_logs: foodDeleted, weight_logs: weightDeleted } })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
