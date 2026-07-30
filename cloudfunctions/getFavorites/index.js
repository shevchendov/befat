const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getFavorites'
const _ = db.command

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { openid })

  try {
    const favRes = await db.collection('user_favorites').where({
      _openid: openid
    }).orderBy('created_at', 'desc').get()

    const recipeIds = favRes.data.map(f => f.recipe_id)
    if (recipeIds.length === 0) {
      const result = { code: 0, message: 'ok', data: { recipes: [] } }
      logger.info(FN, 'success', { count: 0, duration: Date.now() - start })
      return result
    }

    const recipeRes = await db.collection('recipes').where({
      _id: _.in(recipeIds)
    }).get()

    const recipeMap = {}
    recipeRes.data.forEach(r => { recipeMap[r._id] = r })
    const recipes = favRes.data.map(f => recipeMap[f.recipe_id]).filter(Boolean)

    const result = { code: 0, message: 'ok', data: { recipes } }
    logger.info(FN, 'success', { count: recipes.length, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
