const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { validateRecipe: runValidation } = require('./common/recipeValidation')
const FN = 'validateRecipe'
const PUBLISHED = 'PUBLISHED'

exports.main = async (event, context) => {
  const start = Date.now()
  const { recipe } = event
  logger.info(FN, 'invoke', { has_recipe: !!recipe })

  try {
    if (!recipe || typeof recipe !== 'object') {
      const result = { code: 1, message: '缺少 recipe' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const existing = await db.collection('recipes')
      .where({ status: PUBLISHED })
      .limit(100)
      .get()

    const existingTitles = existing.data.map(r => ({ _id: r._id, title: r.title }))
    const resultData = runValidation(recipe, existingTitles)

    const result = { code: 0, message: resultData.valid ? '校验通过' : '校验未通过', data: resultData }
    logger.info(FN, 'done', { valid: resultData.valid, errors: resultData.errors, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
