const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'saveFoodLog'

function calcItemTotal(items) {
  let cal = 0
  let pro = 0
  items.forEach(item => {
    cal += Number(item.calorie) || 0
    pro += Number(item.protein_g) || 0
  })
  return {
    calorie: cal,
    proteinG: Math.round(pro * 10) / 10
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date, meal_type, raw_text, items } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    const validMeals = ['breakfast', 'lunch', 'dinner', 'snack']
    if (!date || !meal_type || !raw_text || !Array.isArray(items) || items.length === 0) {
      const result = { code: 1, message: '缺少必要参数' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }
    if (!validMeals.includes(meal_type)) {
      const result = { code: 2, message: '无效的餐次类型' }
      logger.info(FN, 'return', { code: 2, meal_type, duration: Date.now() - start })
      return result
    }

    const parsedItems = items.map(item => ({
      name: item.name || '未知食物',
      portion: item.portion || '1份',
      calorie: Math.round(Number(item.calorie) || 0),
      protein_g: Math.round((Number(item.protein_g) || 0) * 10) / 10
    }))
    const newTotal = calcItemTotal(parsedItems)

    // 查询同一天同一餐次是否已有记录
    const existing = await db.collection('food_logs').where({
      _openid: openid,
      date: date,
      meal_type: meal_type
    }).get()

    let isMerge = false
    let recordId = null
    let mergedItemCount = parsedItems.length
    let mergedCalorie = newTotal.calorie
    let mergedProteinG = newTotal.proteinG

    if (existing.data.length > 0) {
      const doc = existing.data[0]
      const prevItems = Array.isArray(doc.parsed_items) ? doc.parsed_items : []
      const prevCalorie = Number(doc.total_calorie) || 0
      const prevProtein = Number(doc.total_protein_g) || 0
      const mergedItems = prevItems.concat(parsedItems)
      mergedItemCount = mergedItems.length
      mergedCalorie = prevCalorie + newTotal.calorie
      mergedProteinG = Math.round((prevProtein + newTotal.proteinG) * 10) / 10

      await db.collection('food_logs').doc(doc._id).update({
        data: {
          parsed_items: mergedItems,
          total_calorie: mergedCalorie,
          total_protein_g: mergedProteinG,
          raw_text: (doc.raw_text || '') + '\n' + raw_text,
          updated_at: db.serverDate()
        }
      })
      isMerge = true
      recordId = doc._id
    } else {
      const addRes = await db.collection('food_logs').add({
        data: {
          _openid: openid,
          date,
          meal_type,
          raw_text,
          parsed_items: parsedItems,
          total_calorie: newTotal.calorie,
          total_protein_g: newTotal.proteinG,
          created_at: db.serverDate()
        }
      })
      recordId = addRes._id
    }

    const result = {
      code: 0,
      message: 'ok',
      data: {
        record_id: recordId,
        is_merge: isMerge,
        item_count: mergedItemCount,
        total_calorie: mergedCalorie,
        total_protein_g: mergedProteinG
      }
    }
    logger.info(FN, 'success', { isMerge, itemCount: parsedItems.length, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}