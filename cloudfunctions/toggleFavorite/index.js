const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'toggleFavorite'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { recipe_id } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (!recipe_id) {
      const result = { code: 1, message: '缺少 recipe_id' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const existing = await db.collection('user_favorites').where({
      _openid: openid,
      recipe_id: recipe_id
    }).get()

    let favorited
    if (existing.data.length > 0) {
      await db.collection('user_favorites').doc(existing.data[0]._id).remove()
      favorited = false
    } else {
      await db.collection('user_favorites').add({
        data: {
          _openid: openid,
          recipe_id: recipe_id,
          created_at: db.serverDate()
        }
      })
      favorited = true
    }

    const result = { code: 0, message: 'ok', data: { favorited } }
    logger.info(FN, 'success', { recipe_id, favorited, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
