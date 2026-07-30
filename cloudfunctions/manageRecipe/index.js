const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'manageRecipe'
const ADMIN_OPENID = process.env.ADMIN_OPENID || 'ADMIN_OPENID_PLACEHOLDER'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (openid !== ADMIN_OPENID) {
      const result = { code: 403, message: '无权限' }
      logger.info(FN, 'return', { code: 403, action, duration: Date.now() - start })
      return result
    }

    if (!action || !['add', 'update', 'delete', 'list'].includes(action)) {
      const result = { code: 1, message: 'action 参数不合法' }
      logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
      return result
    }

    if (action === 'list') {
      const res = await db.collection('recipes').orderBy('created_at', 'desc').get()
      const result = { code: 0, message: 'ok', data: { recipes: res.data } }
      logger.info(FN, 'success', { action, count: res.data.length, duration: Date.now() - start })
      return result
    }

    if (action === 'add') {
      const { title, calorie, protein_g, ingredients, steps, image_url, tags } = event
      if (!title || !calorie || !protein_g) {
        const result = { code: 1, message: '缺少必要参数' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const doc = {
        title,
        calorie: Number(calorie),
        protein_g: Number(protein_g),
        ingredients: ingredients || [],
        steps: steps || [],
        image_url: image_url || '',
        tags: tags || [],
        created_at: db.serverDate()
      }
      const res = await db.collection('recipes').add({ data: doc })
      const result = { code: 0, message: 'ok', data: { recipe_id: res._id } }
      logger.info(FN, 'success', { action, recipe_id: res._id, duration: Date.now() - start })
      return result
    }

    if (action === 'update') {
      const { recipe_id, title, calorie, protein_g, ingredients, steps, image_url, tags } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      const updateData = {}
      if (title !== undefined) updateData.title = title
      if (calorie !== undefined) updateData.calorie = Number(calorie)
      if (protein_g !== undefined) updateData.protein_g = Number(protein_g)
      if (ingredients !== undefined) updateData.ingredients = ingredients
      if (steps !== undefined) updateData.steps = steps
      if (image_url !== undefined) updateData.image_url = image_url
      if (tags !== undefined) updateData.tags = tags
      updateData.updated_at = db.serverDate()
      await db.collection('recipes').doc(recipe_id).update({ data: updateData })
      const result = { code: 0, message: 'ok' }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }

    if (action === 'delete') {
      const { recipe_id } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      await db.collection('recipes').doc(recipe_id).remove()
      const result = { code: 0, message: 'ok' }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
