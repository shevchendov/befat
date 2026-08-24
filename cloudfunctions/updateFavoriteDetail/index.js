const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'updateFavoriteDetail'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { recipe_title, meal_type, ingredients, steps } = event
  logger.info(FN, 'invoke', { recipe_title, meal_type })

  if (!recipe_title || !meal_type) {
    const result = { code: 1, message: '缺少 recipe_title/meal_type' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }
  if (!Array.isArray(ingredients) || !Array.isArray(steps)) {
    const result = { code: 2, message: 'ingredients/steps 须为数组' }
    logger.info(FN, 'return', { code: 2, duration: Date.now() - start })
    return result
  }

  try {
    const existing = await db.collection('user_favorites').where({
      _openid: openid,
      recipe_title,
      meal_type
    }).get()

    if (!existing.data || existing.data.length === 0) {
      const result = { code: 3, message: '收藏不存在' }
      logger.info(FN, 'return', { code: 3, duration: Date.now() - start })
      return result
    }

    const snap = existing.data[0].recipe_snapshot || {}
    await db.collection('user_favorites').doc(existing.data[0]._id).update({
      data: { recipe_snapshot: { ...snap, ingredients, steps } }
    })

    const result = { code: 0, message: 'ok' }
    logger.info(FN, 'success', { recipe_title, meal_type, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}