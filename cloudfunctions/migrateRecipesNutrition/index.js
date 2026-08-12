const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const logger = require('./common/logger')
const FN = 'migrateRecipesNutrition'

exports.main = async (event, context) => {
  logger.info(FN, 'invoke', 'deprecated')

  const result = {
    code: 0,
    message: 'migrateRecipesNutrition 已废弃：历史营养数据迁移不再需要，新食谱 nutrition 由 manageRecipe 全量维护',
    deprecated: true
  }
  logger.info(FN, 'deprecated', result)
  return result
}
