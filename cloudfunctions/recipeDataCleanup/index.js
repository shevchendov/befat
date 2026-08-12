const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'recipeDataCleanup'
const ADMIN_OPENID = process.env.ADMIN_OPENID || 'ADMIN_OPENID_PLACEHOLDER'
const CONFIRM_TOKEN = 'DELETE_ALL_LEGACY_RECIPES'
const PAGE = 100

async function fetchAll(collection) {
  const docs = []
  let page = 0
  while (true) {
    const res = await db.collection(collection).skip(page * PAGE).limit(PAGE).get()
    docs.push(...res.data)
    if (res.data.length < PAGE) break
    page++
  }
  return docs
}

async function removeDocs(collection, ids) {
  const tasks = ids.map(id => db.collection(collection).doc(id).remove())
  await Promise.all(tasks)
  return ids.length
}

function collectStats(recipes, favorites) {
  const recipeIds = new Set(recipes.map(r => r._id))
  const orphanFavorites = favorites.filter(f => !recipeIds.has(f.recipe_id))
  return {
    recipes_count: recipes.length,
    favorites_count: favorites.length,
    orphan_favorites_count: orphanFavorites.length,
    orphan_favorite_ids: orphanFavorites.map(f => f._id)
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const dryRun = event.dry_run !== false
  const confirm = event.confirm
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (openid !== ADMIN_OPENID) {
      const result = { code: 403, message: '无权限' }
      logger.info(FN, 'return', { code: 403, duration: Date.now() - start })
      return result
    }

    const recipes = await fetchAll('recipes')
    const favorites = await fetchAll('user_favorites')
    const stats = collectStats(recipes, favorites)

    if (dryRun) {
      const result = { code: 0, message: 'dry-run 完成，未删除任何数据', dry_run: true, ...stats }
      logger.info(FN, 'dry_run', stats)
      return result
    }

    if (confirm !== CONFIRM_TOKEN) {
      const result = { code: 4, message: '缺少 confirm 硬确认参数，拒绝删除' }
      logger.info(FN, 'return', { code: 4, action: 'execute', duration: Date.now() - start })
      return result
    }

    const before = {
      recipes_count: stats.recipes_count,
      orphan_favorites_count: stats.orphan_favorites_count
    }
    const recipeIds = recipes.map(r => r._id)
    const deletedRecipes = await removeDocs('recipes', recipeIds)
    const deletedOrphanFavorites = await removeDocs('user_favorites', stats.orphan_favorite_ids)

    const result = {
      code: 0,
      message: '清理完成',
      dry_run: false,
      ...before,
      deleted_recipes: deletedRecipes,
      deleted_orphan_favorites: deletedOrphanFavorites
    }
    logger.info(FN, 'executed', result)
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
