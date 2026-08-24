const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getFavorites'
const _ = db.command

const VALID_MEALS = ['breakfast', 'lunch', 'snack', 'dinner']

function toDto(fav) {
  const snap = fav.recipe_snapshot || {}
  return {
    title: fav.recipe_title || snap.title || '',
    meal_type: fav.meal_type || snap.meal_type || '',
    calorie: snap.calorie || 0,
    protein_g: snap.protein_g || 0,
    ingredients: snap.ingredients || [],
    steps: snap.steps || [],
    date: snap.date || '',
    created_at: fav.created_at
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { meal_type, meal_types, page, limit } = event
  logger.info(FN, 'invoke', { meal_type, meal_types })

  if (meal_type && meal_type !== 'all' && !VALID_MEALS.includes(meal_type)) {
    const result = { code: 1, message: '无效的 meal_type' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }

  const safePage = Math.max(parseInt(page, 10) || 1, 1)
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)

  const where = { _openid: openid }
  if (Array.isArray(meal_types) && meal_types.length > 0) {
    const valid = meal_types.filter(t => VALID_MEALS.includes(t)).slice(0, 6)
    if (valid.length > 0) where.meal_type = _.in(valid)
  } else if (meal_type && meal_type !== 'all' && VALID_MEALS.includes(meal_type)) {
    where.meal_type = meal_type
  }

  try {
    const countRes = await db.collection('user_favorites').where(where).count()
    const total = countRes.total || 0

    const listRes = await db.collection('user_favorites')
      .where(where)
      .orderBy('created_at', 'desc')
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .get()

    const list = listRes.data.map(toDto)
    const hasMore = safePage * safeLimit < total
    const result = { code: 0, message: 'ok', data: { list, total, has_more: hasMore } }
    logger.info(FN, 'success', { count: list.length, total, has_more: hasMore, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}