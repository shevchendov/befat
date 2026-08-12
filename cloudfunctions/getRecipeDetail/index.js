const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getRecipeDetail'
const PUBLISHED = 'PUBLISHED'

function toDetailDto(recipe) {
  const nutrition = recipe.nutrition || {}
  return {
    id: recipe._id,
    title: recipe.title,
    nutrition,
    calorie: nutrition.calorie || 0,
    protein_g: nutrition.protein_g || 0,
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    tags: recipe.tags || [],
    image_url: recipe.image_url || '',
    version: recipe.version || 1
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { id } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (!id) {
      const result = { code: 1, message: '缺少 id' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const res = await db.collection('recipes').doc(id).get()
    const recipe = res.data
    if (!recipe) {
      const result = { code: 2, message: '食谱不存在' }
      logger.info(FN, 'return', { code: 2, id, duration: Date.now() - start })
      return result
    }
    if (recipe.status !== PUBLISHED) {
      const result = { code: 3, message: '食谱不可查看' }
      logger.info(FN, 'return', { code: 3, id, status: recipe.status, duration: Date.now() - start })
      return result
    }

    const data = toDetailDto(recipe)
    const result = { code: 0, message: 'ok', data }
    logger.info(FN, 'success', { id, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
