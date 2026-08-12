const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const logger = require('./common/logger')
const FN = 'generateRecipeInit'

exports.main = async (event, context) => {
  logger.info(FN, 'invoke', 'deprecated')

  const result = {
    code: 0,
    message: 'generateRecipeInit 已废弃：历史 32 条硬编码食谱已清除，新食谱统一走 manageRecipe + getPublishedRecipes',
    deprecated: true
  }
  logger.info(FN, 'deprecated', result)
  return result
}
