const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getPublishedRecipes'
const PUBLISHED = 'PUBLISHED'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function toListDto(recipe) {
  const nutrition = recipe.nutrition || {}
  return {
    id: recipe._id,
    title: recipe.title,
    calorie: nutrition.calorie || 0,
    protein_g: nutrition.protein_g || 0,
    tags: recipe.tags || [],
    image_url: recipe.image_url || ''
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { meal_tag, tags, page, limit } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const safePage = Math.max(parseInt(page, 10) || 1, 1)

    const filterTags = new Set()
    if (meal_tag) filterTags.add(meal_tag)
    if (Array.isArray(tags)) tags.forEach(t => { if (t) filterTags.add(t) })

    let query = db.collection('recipes').where({ status: PUBLISHED })

    let recipes
    if (filterTags.size === 0) {
      const res = await query.orderBy('created_at', 'desc')
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .get()
      recipes = res.data
    } else {
      // TODO(Phase 2): 带标签过滤时当前依赖一次拉取 limit=MAX_LIMIT 后内存过滤，
      // 依赖 recipes < 100 的规模假设。Phase 2 必须改成真正的服务端分页
      // （云数据库 tags 数组包含查询 + skip/limit），不能长期依赖 recipes < 100。
      const res = await query.orderBy('created_at', 'desc').limit(MAX_LIMIT).get()
      recipes = res.data.filter(r => {
        const rTags = r.tags || []
        for (const t of filterTags) {
          if (!rTags.includes(t)) return false
        }
        return true
      })
    }

    const list = recipes.map(toListDto)
    const result = { code: 0, message: 'ok', data: { list, page: safePage, limit: safeLimit, total: list.length } }
    logger.info(FN, 'success', { count: list.length, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
